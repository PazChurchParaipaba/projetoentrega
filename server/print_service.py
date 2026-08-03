import time
import json
import os
import sys
import re
import socket
import logging
import logging.handlers
try:
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
except ImportError:
    # Se falhar aqui, o modo serviço não funcionará, mas o script roda manual
    pass

try:
    import win32print
except ImportError:
    win32print = None
import unicodedata
from supabase import create_client, Client

# Força o stdout a usar UTF-8 e unbuffered (importante para logs de serviço)
if sys.stdout:
    sys.stdout.reconfigure(encoding='utf-8')

# ==============================================================================
# CONFIGURAÇÕES GERAIS
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
LOG_FILE = os.path.join(BASE_DIR, 'agente.log')

# Supabase Keys
SUPABASE_URL = "https://groezaseypdbpgymgpvo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"

class NaxioPrintService:
    def __init__(self):
        self.setup_logging()
        self.config = self.load_config()
        
        # Suporte para uma ou múltiplas lojas (string ou lista no json)
        sid = self.config.get('store_id')
        self.store_ids = sid if isinstance(sid, list) else [sid]
        
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.running = True
        
        self.printers_map = {}
        self.default_printer = None
        self.last_sync_time = 0
        
        # Cache para evitar impressões duplicadas de conta
        self.contas_processadas = set()
        
        # Conjunto de impressoras que falharam permanentemente (ex.: excluídas do Windows)
        self._printers_blacklist = set()
        
        if win32print is None:
            logging.warning("⚠️ AVISO: 'win32print' não encontrado. Impressão via driver Windows não funcionará.")

    def setup_logging(self):
        logger = logging.getLogger()
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
        file_handler = logging.handlers.RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding='utf-8')
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("httpcore").setLevel(logging.WARNING)

    def load_config(self):
        if not os.path.exists(CONFIG_PATH):
            logging.critical(f"❌ CONFIG.JSON NÃO ENCONTRADO EM: {CONFIG_PATH}")
            sys.exit(1)
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)

    def _is_ip_address(self, dest):
        return re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$", str(dest))

    def scan_portas_impressora(self, ip, portas=None, timeout=1.5):
        """
        Escaneia as portas mais comuns de impressoras em um IP.
        Retorna lista de portas abertas com o tipo provável do protocolo.

        Portas comuns de impressoras:
          9100  → RAW/JetDirect (Epson, Bematech, Elgin, Daruma, HP)
          9101  → RAW porta 2 (algumas HP multifuncionais)
          9102  → RAW porta 3
          515   → LPD/LPR (Line Printer Daemon)
          631   → IPP (Internet Printing Protocol / CUPS)
          80    → HTTP (gerenciamento web)
          443   → HTTPS (gerenciamento seguro)
        """
        if portas is None:
            portas = [
                (9100, "RAW/JetDirect  ← MAIS COMUM (Epson/Elgin/Bematech)"),
                (9101, "RAW porta 2    (HP multifuncional)"),
                (9102, "RAW porta 3    (HP multifuncional)"),
                (515,  "LPD/LPR        (protocolo legado Unix)"),
                (631,  "IPP/CUPS       (Linux/Mac)"),
                (80,   "HTTP           (painel web da impressora)"),
                (443,  "HTTPS          (painel web seguro)"),
            ]

        abertas = []
        logging.info(f"")
        logging.info(f"🔍 ===== SCAN DE PORTAS: {ip} =====")
        for porta, descricao in portas:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout)
                resultado = sock.connect_ex((ip, porta))
                sock.close()
                if resultado == 0:
                    abertas.append(porta)
                    logging.info(f"   ✅ PORTA {porta:5d} ABERTA  → {descricao}")
                else:
                    logging.info(f"   ❌ Porta {porta:5d} fechada → {descricao}")
            except Exception as e:
                logging.info(f"   ⚠️ Porta {porta:5d} erro   → {descricao} | {e}")

        if abertas:
            logging.info(f"")
            logging.info(f"   📋 RESUMO {ip}:")
            logging.info(f"   Portas abertas: {abertas}")
            logging.info(f"   👉 Use no banco: ip = '{ip}:{abertas[0]}' (primeira porta aberta)")
        else:
            logging.warning(f"   ⚠️ Nenhuma porta de impressora encontrada em {ip}")
            logging.warning(f"   Verifique se a impressora está ligada e na rede.")
        logging.info(f"🔍 ===== FIM DO SCAN: {ip} =====")
        logging.info(f"")
        return abertas


    def _normalize_text(self, text):
        """Remove acentos e caracteres especiais para compatibilidade máxima se necessário."""
        return "".join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')

    def _prepare_data(self, text):
        """Prepara os bytes para a impressora com Code Page 850 (Latino)."""
        # ESC @ (Reset) + ESC t 2 (Seleciona Code Page 850)
        header = b'\x1B\x40\x1B\x74\x02'
        footer = b'\n\n\n\n\x1D\x56\x41\x00'
        
        try:
            body = text.encode('cp850', errors='replace')
        except Exception:
            body = self._normalize_text(text).encode('ascii', errors='replace')
            
        return header + body + footer

    def send_to_printer(self, text, destination):
        if not destination:
            return False
        if self._is_ip_address(destination):
            return self._print_via_socket(text, destination)
        else:
            return self._print_via_windows(text, destination)

    def _print_via_socket(self, text, ip_str):
        try:
            ip, port = (ip_str.split(':') + [9100])[:2]
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            sock.connect((ip, int(port)))
            data = self._prepare_data(text)
            sock.sendall(data)
            sock.close()
            return True
        except Exception as e:
            logging.error(f"❌ Erro Socket {ip_str}: {e}")
            return False

    def _print_via_windows(self, text, driver_name):
        if not win32print:
            logging.error(f"❌ Erro: 'win32print' não instalado. Execute: pip install pywin32")
            return False
        
        # FIX: Impressora na blacklist (ex.: excluída do Windows) → ignora silenciosamente
        if driver_name in self._printers_blacklist:
            return False

        try:
            hPrinter = win32print.OpenPrinter(driver_name)
            try:
                win32print.StartDocPrinter(hPrinter, 1, ("Naxio Pedido", None, "RAW"))
                win32print.StartPagePrinter(hPrinter)
                data = self._prepare_data(text)
                win32print.WritePrinter(hPrinter, data)
                win32print.EndPagePrinter(hPrinter)
                win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)
            return True
        except Exception as e:
            # Erro 1905 = impressora foi excluída do Windows
            # Erro 1801 = nome inválido
            # Nesses casos, remove do mapa para não poluir o log a cada ciclo
            error_code = getattr(e, 'winerror', None) or (e.args[0] if e.args else None)
            if error_code in (1905, 1801):
                logging.warning(f"⚠️ Impressora '{driver_name}' não existe mais no Windows (código {error_code}). Removendo do mapa.")
                self._printers_blacklist.add(driver_name)
                # Remove do printers_map para que o default_printer seja usado em seu lugar
                keys_to_remove = [k for k, v in self.printers_map.items() if v == driver_name]
                for k in keys_to_remove:
                    del self.printers_map[k]
                # Reseta default_printer se ele era essa impressora
                if self.default_printer == driver_name:
                    remaining = [v for v in self.printers_map.values() if v not in self._printers_blacklist]
                    self.default_printer = remaining[0] if remaining else None
            else:
                logging.error(f"❌ Erro Windows {driver_name}: {e}")
            return False

    def format_ticket(self, comanda, items, setor_nome, is_reserva=False):
        txt = ""
        
        store_data = comanda.get('stores') or {}
        store_name = store_data.get('nome_loja') or ''
        
        if store_name:
            # Fonte normal, centralizada e em negrito
            txt += "\x1B\x61\x01\x1B\x45\x01"
            txt += f"{self._normalize_text(store_name.upper())}\n"
            txt += "\x1B\x61\x00\x1B\x45\x00"

        if is_reserva:
            txt += "\x1D\x21\x22\x1B\x45\x01"  # Altura 3x, Largura 3x e Negrito
            txt += "****************\n"
            txt += "   RESERVA!   \n"
            txt += "****************\n"
        
        # Gigante + Negrito
        txt += "\x1D\x21\x11\x1B\x45\x01"
        txt += "================\n"
        txt += f"MESA {comanda.get('numero')}\n"
        txt += f"{setor_nome}\n"
        txt += "================\n"
        txt += "\x1D\x21\x00\x1B\x45\x00"  # Normal
        
        garcom_nome = ""
        if items:
            # Tenta buscar o nome do garçom em várias chaves possíveis dentro do item
            primeiro_item = items[0]
            garcom_nome = primeiro_item.get('garcom_nome') or \
                          primeiro_item.get('garcom') or \
                          primeiro_item.get('vendedor') or \
                          primeiro_item.get('atendente')
        
        # Se não encontrou no item, tenta buscar na raiz da comanda como último recurso
        if not garcom_nome:
            garcom_nome = comanda.get('garcom_nome') or comanda.get('garcom') or comanda.get('vendedor')

        data_lanc = items[0].get('data_lancamento') if items else None
        if data_lanc:
            try:
                import datetime
                if 'Z' in data_lanc:
                    dt_utc = datetime.datetime.strptime(data_lanc[:19], '%Y-%m-%dT%H:%M:%S')
                    dt_local = dt_utc.replace(tzinfo=datetime.timezone.utc).astimezone()
                    hora_str = dt_local.strftime('%H:%M')
                    data_str = dt_local.strftime('%d/%m')
                else:
                    dt = datetime.datetime.strptime(data_lanc[:19], '%Y-%m-%dT%H:%M:%S')
                    hora_str = dt.strftime('%H:%M')
                    data_str = dt.strftime('%d/%m')
            except Exception:
                hora_str = time.strftime('%H:%M')
                data_str = time.strftime('%d/%m')
        else:
            hora_str = time.strftime('%H:%M')
            data_str = time.strftime('%d/%m')

        txt += f"Garcom: {garcom_nome or 'Geral'}\n"
        txt += f"Data: {data_str}  Hora: {hora_str}\n"
        txt += "--------------------------------\n"
        txt += "\x1D\x21\x01\x1B\x45\x01"  # Altura Dupla + Negrito
        for item in items:
            txt += f"[ {item.get('qtd', 1)}x ] {item['nome']}\n"
            obs = item.get('observacao') or item.get('obs') or ''
            if obs:
                txt += "\x1D\x21\x00\x1B\x45\x00"  # Normal
                txt += f"   OBS: {obs}\n"
                txt += "\x1D\x21\x01\x1B\x45\x01"  # Altura Dupla + Negrito de volta
        txt += "\x1D\x21\x00\n"
        return txt

    def format_bill(self, comanda):
        """Formata a conta/conferência da mesa — cada item impresso UMA única vez."""
        subtotal = 0
        items = comanda.get('items') or []  # FIX: garante lista mesmo se None
        linhas = ""
        for i in items:
            qtd = i.get('qtd', 1)
            preco = i.get('price', 0)
            sub = qtd * preco
            subtotal += sub
            # Limita nome a 18 caracteres para não quebrar a linha
            nome_curto = i.get('nome', 'Item')[:18]
            linhas += f"{qtd}x {nome_curto:<18} {sub:>7.2f}\n"
            obs = i.get('observacao') or i.get('obs') or ''
            if obs:
                linhas += f"  ({obs[:28]})\n"
        
        taxa = subtotal * 0.10
        total = subtotal + taxa
        
        txt  = "\x1B\x45\x01   CONFERENCIA DE MESA   \n\x1B\x45\x00"
        txt += f"MESA: {comanda.get('numero')} | {time.strftime('%d/%m %H:%M')}\n"
        txt += "--------------------------------\n"
        txt += linhas
        txt += "--------------------------------\n"
        txt += f"SUBTOTAL:             R${subtotal:>8.2f}\n"
        txt += f"TAXA SERV (10%):      R${taxa:>8.2f}\n"
        txt += f"\x1B\x45\x01TOTAL GERAL:          R${total:>8.2f}\n\x1B\x45\x00"
        txt += "--------------------------------\n"
        return txt

    def sync_printers(self):
        """Sincroniza impressoras do Supabase e do Windows, respeitando a blacklist."""
        try:
            res = self.supabase.table('store_printers').select('nome, ip').in_('store_id', self.store_ids).execute()
            new_map = {p['nome'].upper().strip(): p['ip'].strip() for p in res.data if p.get('nome') and p.get('ip')}

            # --- LOG DETALHADO DAS IMPRESSORAS JÁ CADASTRADAS NO BANCO ---
            logging.info("")
            logging.info("🗂️  ===== IMPRESSORAS CADASTRADAS NO BANCO =====")
            if res.data:
                for p in res.data:
                    nome = p.get('nome', '???')
                    dest = p.get('ip', '???')
                    tipo = "IP direto (socket)" if self._is_ip_address(dest) else "Driver Windows"
                    # Se for IP, mostra porta ou avisa que usará 9100 padrão
                    if self._is_ip_address(dest):
                        if ':' in str(dest):
                            ip_part, porta_part = dest.rsplit(':', 1)
                            logging.info(f"   📌 [{nome}] → {dest} | Tipo: {tipo} | Porta: {porta_part}")
                        else:
                            logging.info(f"   📌 [{nome}] → {dest} | Tipo: {tipo} | Porta: 9100 (padrão, não especificada)")
                            logging.info(f"       💡 Dica: se não funcionar, adicione a porta: '{dest}:9100'")
                    else:
                        logging.info(f"   📌 [{nome}] → {dest} | Tipo: {tipo}")
            else:
                logging.info("   (nenhuma impressora cadastrada no banco ainda)")
            logging.info("🗂️  ============================================")
            logging.info("")

            if win32print:
                try:
                    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS, None, 2)

                    logging.info("🖥️  ===== IMPRESSORAS INSTALADAS NO WINDOWS =====")
                    for p in printers:
                        p_name = p.get('pPrinterName', '')
                        if not p_name:
                            continue
                        p_clean = p_name.strip()

                        # Tenta extrair IP e porta do campo de porta do Windows
                        port_name = p.get('pPortName', '')
                        porta_info = ""
                        if port_name:
                            # Porta IP_xxx.xxx.xxx.xxx ou IP_xxx... é padrão do Windows
                            if port_name.upper().startswith('IP_') or re.match(r'\d+\.\d+\.\d+\.\d+', port_name):
                                porta_info = f" | Porta/IP Windows: {port_name}"
                            elif port_name.upper().startswith('USB'):
                                porta_info = f" | Conexão: USB ({port_name})"
                            elif port_name.upper().startswith('LPT'):
                                porta_info = f" | Conexão: Paralela ({port_name})"
                            else:
                                porta_info = f" | Porta: {port_name}"

                        status = "🚫 BLACKLIST" if p_clean in self._printers_blacklist else "✅ Ativa"
                        logging.info(f"   🖨️  [{p_clean}]{porta_info} | Status: {status}")

                        # FIX: não re-adiciona impressoras que já estão na blacklist
                        if p_clean in self._printers_blacklist:
                            continue

                        final_dest = p_clean
                        if p_clean.upper() not in new_map:
                            logging.info(f"       ➕ Nova! Cadastrando no banco...")
                            try:
                                for sid in self.store_ids:
                                    self.supabase.table('store_printers').insert({'store_id': sid, 'nome': p_clean, 'ip': final_dest}).execute()
                                new_map[p_clean.upper()] = final_dest
                                logging.info(f"       ✅ Cadastrada: '{p_clean}'")
                            except Exception as e_ins:
                                logging.error(f"       ❌ Erro ao cadastrar {p_clean}: {e_ins}")
                    logging.info("🖥️  ================================================")
                    logging.info("")
                except Exception as e:
                    logging.error(f"⚠️ Erro ao listar impressoras Windows: {e}")

            # FIX: filtra impressoras excluídas da blacklist antes de atualizar o mapa
            self.printers_map = {k: v for k, v in new_map.items() if v not in self._printers_blacklist}

            if 'CAIXA' in self.printers_map:
                self.default_printer = self.printers_map['CAIXA']
            elif 'COZINHA' in self.printers_map:
                self.default_printer = self.printers_map['COZINHA']
            elif self.printers_map:
                self.default_printer = list(self.printers_map.values())[0]

            logging.info(f"📊 [SYNC] {len(self.printers_map)} mapeamentos carregados.")
            for nome_setor, destino in self.printers_map.items():
                is_ip = bool(self._is_ip_address(destino))
                tipo_con = "IP" if is_ip else "Driver"
                logging.info(f"   📌 [{nome_setor}] -> {destino} ({tipo_con})")
            logging.info("📊 ======================================")
            logging.info("")
        except Exception as e:
            logging.error(f"❌ Erro Sync: {e}")

    def _gerar_item_key(self, item, index):
        """
        Gera uma chave única e estável para cada item da comanda.
        
        Usa combinação de: id do produto + data de lançamento + índice.
        Compatível com pedidos do garçom.js (printed:false), mobile (dados móveis)
        e do sistema caixa (printed_qtd).
        """
        prod_id = str(item.get('id') or item.get('product_id') or '')
        data_lanc = str(item.get('data_lancamento') or item.get('added_at') or '')
        obs = str(item.get('observacao') or item.get('obs') or '')
        nome = str(item.get('nome', ''))
        qtd = str(item.get('qtd', 1))
        # Índice como fallback para diferenciar itens idênticos sem timestamp
        return f"{prod_id}|{nome}|{qtd}|{obs}|{data_lanc}|{index}"

    def _item_precisa_imprimir(self, item):
        """
        Verifica se um item ainda precisa ser impresso.
        
        Compatível com dois esquemas:
        - Garçom / Mobile (garçom.js): item tem flag 'printed' (bool)
        - Caixa (comandas.js): item tem 'printed_qtd' (int) vs 'qtd'
        - Após impressão pelo print_service: item recebe 'printed': True
        """
        # Esquema 1: flag booleana 'printed' (garçom.js e print_service)
        if 'printed' in item:
            return not item.get('printed', False)
        
        # Esquema 2: printed_qtd vs qtd (comandas.js do caixa)
        qtd = item.get('qtd', 1)
        printed_qtd = item.get('printed_qtd', 0)
        if printed_qtd is not None:
            return int(printed_qtd) < int(qtd)
        
        # Sem flag nenhuma: considera que precisa imprimir
        return True

    def _verificar_reserva(self, comanda, novos_itens=None):
        """
        Verifica se OS NOVOS ITENS da comanda são do tipo 'reserva'.
        Agora baseia-se apenas na flag explícita para evitar falsos positivos
        com textos antigos em observações.
        """
        if novos_itens:
            for idx, item in novos_itens:
                if item.get('is_reserva') is True:
                    return True
        
        # Removemos a busca por texto 'RESERVA' em observações gerais
        # para evitar que mesas antigas continuem imprimindo como reserva.
        return False

    def stop(self):
        self.running = False

    def run(self):
        logging.info(f"🚀 Agente Naxio v14 (Multi-Loja + Offline Fix) Iniciado - Lojas: {self.store_ids}")
        while self.running:
            try:
                if time.time() - self.last_sync_time > 300:
                    self.sync_printers()
                    self.last_sync_time = time.time()

                # 1. PEDIDOS NOVOS
                res = self.supabase.table('comandas').select('*, stores(nome_loja)').in_('store_id', self.store_ids).neq('status', 'free').execute()
                for comanda in res.data:
                    # FIX: `items` pode ser None quando a coluna existe mas é nula no banco
                    items = comanda.get('items') or []
                    
                    # ================================================================
                    # FIX CRÍTICO: Identificar novos pedidos de forma estável
                    # Compatível com garçom.js (printed:false), mobile e caixa (printed_qtd)
                    # ================================================================
                    novos_pedidos = []
                    for idx, item in enumerate(items):
                        if self._item_precisa_imprimir(item):
                            novos_pedidos.append((idx, item))
                    
                    if novos_pedidos:
                        logging.info(f"🔔 Mesa {comanda['numero']}: {len(novos_pedidos)} novos itens para imprimir.")
                        
                        # Verifica reserva apenas para os itens que estão sendo impressos agora
                        is_reserva = self._verificar_reserva(comanda, novos_pedidos)
                        if is_reserva:
                            logging.info(f"📅 Mesa {comanda['numero']}: É RESERVA! Marcando no ticket.")
                        
                        # ================================================================
                        # ROTEAMENTO: agrupa por destino real da impressora.
                        # USA EXCLUSIVAMENTE o campo 'impressora_alvo' cadastrado no banco.
                        # Itens sem impressora_alvo cadastrada são IGNORADOS (não marcados
                        # como printed) e tentados novamente no próximo ciclo.
                        # ================================================================
                        grupos_por_destino = {}  # {destino: {'itens': [], 'indices': [], 'setor': ''}}

                        # BUG FIX: inicializado ANTES do loop para evitar UnboundLocalError
                        # caso todos os itens sejam ignorados (sem impressora_alvo)
                        indices_impressos_neste_ciclo = set()

                        for idx, item in novos_pedidos:
                            p_info = {}
                            try:
                                p_res = self.supabase.table('products').select('impressora_alvo').eq('id', item.get('id')).execute()
                                if p_res.data:
                                    p_info = p_res.data[0]
                            except:
                                pass

                            logging.info(f"🔎 [ROUTING] Analisando: Setor '{item.get('setor', 'PADRAO')}' | Item: '{item.get('nome')}'")

                            # 1. Busca impressora_alvo primeiro
                            impressora_alvo_raw = str(p_info.get('impressora_alvo') or '').strip()

                            # 2. Fallback para 'setor' ou 'categoria' se impressora_alvo estiver vazia
                            if not impressora_alvo_raw:
                                impressora_alvo_raw = str(item.get('setor') or item.get('categoria') or '').strip()

                            if not impressora_alvo_raw or impressora_alvo_raw.upper() == 'PADRAO':
                                # Totalmente sem destino definido → ignora (não marca como impresso, pois não sabemos onde jogar)
                                logging.warning(f"   ⚠️ IGNORADO: Item '{item.get('nome')}' sem 'impressora_alvo' ou 'setor' válido. Pulando.")
                                continue

                            alvo_upper = impressora_alvo_raw.upper()
                            destino = self.printers_map.get(alvo_upper)

                            # 3. Fuzzy Matching (Resolução inteligente de nomes como BAR -> BARPISCINA)
                            if not destino:
                                for nome_cadastrado, ip_destino in self.printers_map.items():
                                    if alvo_upper in nome_cadastrado or nome_cadastrado in alvo_upper:
                                        destino = ip_destino
                                        logging.info(f"   🪄 Match Inteligente: '{alvo_upper}' redirecionado para '{nome_cadastrado}'")
                                        break

                            if destino:
                                logging.info(f"   🎯 Match Final -> '{alvo_upper}' ({destino})")
                            else:
                                # Se mesmo após fuzzy match não encontrar, aborta apenas a impressão deste
                                logging.warning(f"   ⚠️ IGNORADO: Impressora/Setor '{alvo_upper}' não está nos nomes das impressoras do sistema. Verifique o cadastro.")
                                continue

                            setor_exibicao = alvo_upper
                            if destino not in grupos_por_destino:
                                grupos_por_destino[destino] = {'itens': [], 'indices': [], 'setor': setor_exibicao}
                            grupos_por_destino[destino]['itens'].append(item)
                            grupos_por_destino[destino]['indices'].append(idx)

                        # ================================================================
                        # IMPRESSÃO POR DESTINO
                        # ================================================================
                        for destino, dados in grupos_por_destino.items():
                            if self.send_to_printer(self.format_ticket(comanda, dados['itens'], dados['setor'], is_reserva), destino):
                                for idx in dados['indices']:
                                    indices_impressos_neste_ciclo.add(idx)
                                logging.info(f"✅ Impresso em '{destino}' ({dados['setor']}): {len(dados['itens'])} itens da Mesa {comanda['numero']}")

                        # ================================================================
                        # FIX RACE CONDITION: Busca a comanda atualizada antes de salvar printed=True
                        # Isso evita que o agente delete itens novos inseridos pelo garçom durante a impressão
                        # ================================================================
                        if indices_impressos_neste_ciclo:
                            try:
                                # Re-busca a comanda para pegar o estado MAIS ATUAL dos itens
                                res_fresh = self.supabase.table('comandas').select('items').eq('id', comanda['id']).execute()
                                if res_fresh.data and len(res_fresh.data) > 0:
                                    items_atuais = res_fresh.data[0].get('items') or []
                                    # Gera chaves únicas para os itens que acabamos de imprimir para identificação segura
                                    chaves_impressas = set()
                                    for idx in indices_impressos_neste_ciclo:
                                        if idx < len(items): # Garante que o índice ainda é válido na lista original
                                            chaves_impressas.add(self._gerar_item_key(items[idx], idx))
                                    
                                    # Percorre os itens ATUAIS e marca os que batem com as chaves
                                    any_changed = False
                                    for i, it in enumerate(items_atuais):
                                        key = self._gerar_item_key(it, i)
                                        if key in chaves_impressas:
                                            items_atuais[i] = dict(it)
                                            items_atuais[i]['printed'] = True
                                            if 'printed_qtd' in items_atuais[i]:
                                                items_atuais[i]['printed_qtd'] = items_atuais[i].get('qtd', 1)
                                            any_changed = True
                                    
                                    if any_changed:
                                        self.supabase.table('comandas').update({'items': items_atuais}).eq('id', comanda['id']).execute()
                                        logging.info(f"✅ Mesa {comanda['numero']}: Status 'impresso' sincronizado com sucesso.")
                            except Exception as e_upd:
                                logging.error(f"❌ Erro ao sincronizar flag 'printed' na Mesa {comanda['numero']}: {e_upd}")

                # 2. CONTAS
                res_contas = self.supabase.table('comandas').select('*').in_('store_id', self.store_ids).in_('status', ['pagando', 'paying']).execute()
                for comanda in res_contas.data:
                    if comanda['id'] not in self.contas_processadas:
                        logging.info(f"💰 Mesa {comanda['numero']}: Imprimindo CONTA...")
                        destino = self.printers_map.get('CAIXA') or self.default_printer
                        if destino:
                            txt_conta = self.format_bill(comanda)
                            if self.send_to_printer(txt_conta, destino):
                                self.contas_processadas.add(comanda['id'])
                
                ids_atuais = {c['id'] for c in res_contas.data}
                self.contas_processadas = {cid for cid in self.contas_processadas if cid in ids_atuais}

            except Exception as e:
                logging.error(f"❌ Erro no Loop: {e}")
            
            time.sleep(3)


class NaxioService(win32serviceutil.ServiceFramework):
    _svc_name_ = "NaxioPrintService"
    _svc_display_name_ = "Naxio Print Agent"
    _svc_description_ = "Sincroniza pedidos e imprime automaticamente nas impressoras configuradas."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.agent = NaxioPrintService()

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        self.agent.stop()
        logging.info("🛑 Serviço parando...")

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.agent.run()


if __name__ == "__main__":
    if len(sys.argv) == 1:
        # Modo Debug / Manual
        try:
            NaxioPrintService().run()
        except KeyboardInterrupt:
            pass
    elif len(sys.argv) >= 2 and sys.argv[1].lower() == 'scan':
        # =====================================================================
        # MODO SCAN DE PORTAS
        # Uso: python print_service.py scan 192.168.1.50
        # Descobre em qual porta a impressora está respondendo.
        # =====================================================================
        agente = NaxioPrintService()
        if len(sys.argv) >= 3:
            ip_alvo = sys.argv[2]
            print(f"\n🔍 Iniciando scan de portas em: {ip_alvo}")
            print("   (Os resultados também estão em agente.log)\n")
            portas_abertas = agente.scan_portas_impressora(ip_alvo)
            if portas_abertas:
                print(f"\n✅ Portas abertas encontradas: {portas_abertas}")
                print(f"👉 Cadastre no banco: ip = '{ip_alvo}:{portas_abertas[0]}'")
            else:
                print(f"\n❌ Nenhuma porta de impressora respondeu em {ip_alvo}")
                print("   Verifique se a impressora está ligada e conectada à rede.")
        else:
            print("\n❌ Uso correto: python print_service.py scan <IP>")
            print("   Exemplo:     python print_service.py scan 192.168.1.50\n")
    else:
        # Modo Serviço do Windows (Install/Start/Stop)
        win32serviceutil.HandleCommandLine(NaxioService)
