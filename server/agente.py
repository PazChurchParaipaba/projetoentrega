import time
import datetime
from datetime import timedelta
import json
import collections
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
if hasattr(sys.stdout, 'reconfigure'):
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


# ==============================================================================
# MÓDULO DE AUTO-REPARAÇÃO COM IA (GROQ)
# Ative adicionando "groq_api_key": "gsk_..." ao config.json
# ==============================================================================
class GroqSelfRepair:
    """Analisa o log recente e executa reparos automáticos usando IA (Groq)."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
    MODEL    = "llama-3.3-70b-versatile"
    INTERVAL = 300  # verificar a cada 5 minutos

    SYSTEM_PROMPT = """
Você é o Agente de Inteligência de Auto-Reparo do Naxio Print Agent. Seu objetivo é garantir impressão ZERO DUPLICIDADE e ZERO FALHA.

Analise as últimas 80 linhas de log e decida se o sistema está saudável ou se precisa de intervenção.

PADRÕES DE ALERTA (Intervenha imediatamente se ver):
1. DUPLICIDADE: '✨ DETECÇÃO' do mesmo item para a mesma mesa repetido em curto intervalo (< 5s) sem um '✅ [OK]' correspondente ou com múltiplos '✅ [OK]' para o mesmo item.
2. LOOP INFINITO: O mesmo item sendo detectado ciclo após ciclo mesmo após mensagem de sucesso.
3. CONFLITO OCC: Muitas mensagens de '⚠️ CONFLITO OCC'. Isso indica que algo está tentando atualizar o banco ao mesmo tempo.
4. ERROS DE SOCKET: '❌ Erro Socket' repetido indica impressora offline.

AÇÕES DISPONÍVEIS:
- "rollback_inflight": Use se houver itens que parecem "travados" como impresso no banco mas não saíram (Loop detectado).
- "sync_printers": Use se houver erros de rota ou socket.
- "restart_agent": AÇÃO RADICAL. Use se detectar DUPLICIDADE REAL ou LOOP INFINITO. Isso encerrará o processo para que o Windows o reinicie limpo.
- "no_action": Sistema operando perfeitamente (Detecção seguida de Sucesso).

Responda SOMENTE com JSON:
{"status": "healthy|warning|critical", "issues": ["descrição do problema"], "actions": ["action"], "reason": "porque tomou essa decisão"}
"""

    def __init__(self, api_key):
        self.api_key    = api_key
        self.last_check = 0
        if api_key:
            logging.info(f"\ud83e\udd16 [IA] M\u00f3dulo GroqSelfRepair inicializado (Key: {api_key[:6]}...{api_key[-4:]})")

    def _read_recent_logs(self, log_file, last_n=80):
        try:
            if not os.path.exists(log_file):
                return ""
            with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
            return "".join(lines[-last_n:])
        except Exception:
            return ""

    def _call_groq(self, log_content):
        import urllib.request
        payload = json.dumps({
            "model": self.MODEL,
            "messages": [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user",   "content": f"Log recente (\u00faltimas 80 linhas):\n\n{log_content}"}
            ],
            "temperature": 0.1,
            "max_tokens":  300,
            "response_format": {"type": "json_object"}
        }).encode('utf-8')
        req = urllib.request.Request(
            self.GROQ_URL, data=payload,
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return json.loads(data['choices'][0]['message']['content'])

    def check_and_repair(self, agent):
        """Verifica periódica: lê log, chama Groq, executa reparos se necessário."""
        if time.time() - self.last_check < self.INTERVAL:
            return
        self.last_check = time.time()
        try:
            log_content = self._read_recent_logs(LOG_FILE)
            if not log_content:
                return
            logging.info("\ud83e\udd16 [IA] Analisando logs para detecção de anomalias...")
            diagnosis = self._call_groq(log_content)
            status  = diagnosis.get('status', 'healthy')
            issues  = diagnosis.get('issues', [])
            actions = diagnosis.get('actions', [])
            reason  = diagnosis.get('reason', '')
            if status == 'healthy':
                logging.debug(f"\ud83e\udd16 [IA] Sistema saud\u00e1vel. {reason}")
                return
            logging.info(f"\ud83e\udd16 [IA] An\u00e1lise conclu\u00edda. Status: {status.upper()}")
            logging.warning(f"\ud83e\udd16 [IA] Alerta: {reason}")
            for issue in issues:
                logging.warning(f"   \ud83d\udd0d Problema detectado: {issue}")
            for action in actions:
                if action == 'rollback_inflight':
                    logging.info("\ud83e\udd16 [IA] Ação: rollback de itens in-flight...")
                    agent._recover_inflight()
                elif action == 'sync_printers':
                    logging.info("\ud83e\udd16 [IA] Ação: re-sincronização de impressoras...")
                    agent.sync_printers()
                    agent.last_sync_time = time.time()
                elif action == 'clear_error_state':
                    logging.info("🤖 [IA] Ação: reset do estado de erro...")
                    agent._consecutive_errors = 0
                elif action == 'restart_agent':
                    logging.critical("🤖 [IA] Ação: REINÍCIO FORÇADO DETECTADO PELA IA PARA CORREÇÃO DE DUPLICIDADE.")
                    # O Windows Service ou um script de loop irá reiniciar o processo automaticamente
                    os._exit(1)
                else:
                    logging.info(f"🤖 [IA] Ação '{action}' registrada.")
        except Exception as e:
            logging.debug(f"\ud83e\udd16 [IA] Análise indisponível: {e}")


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
        
        self.cycle_sleep = 1.5
        logging.info(f"🚀 [CONFIG] Agente configurado em modo único (Principal).")
        
        # Cache para evitar impressões duplicadas de conta
        self.contas_processadas = set()

        # Contador de tentativas de impressão para evitar loops infinitos de timeout
        self.print_retries = {}

        # Conjunto de impressoras que falharam permanentemente (ex.: excluídas do Windows)
        self._printers_blacklist = set()

        # Contador de erros consecutivos de rede/conexão (para backoff exponencial)
        self._consecutive_errors = 0

        # Arquivo de recovery: rastreia itens 'em voo' para sobreviver a quedas de energia
        self.inflight_file  = os.path.join(BASE_DIR, 'agente_inflight.json')
        self._recovery_done = False

        # Auto-reparo com IA (Groq) — ativado se groq_api_key estiver no config.json
        groq_key = self.config.get('groq_api_key', '').strip()
        self.repair_ai = GroqSelfRepair(groq_key) if groq_key else None
        if self.repair_ai:
            logging.info("🤖 [IA] Auto-reparo Groq ATIVADO.")
        else:
            logging.info("🤖 [IA] Auto-reparo desativado (adicione 'groq_api_key' ao config.json para ativar).")

        # CUTOFF: Ignorar pedidos feitos antes desta data/hora (pós-mudança)
        self.cutoff_time = datetime.datetime(2026, 4, 18, 17, 0)
        logging.info(f"🛡️  FILTRO ATIVADO: Ignorando TUDO antes de {self.cutoff_time}")
        
        if win32print is None:
            logging.warning("⚠️ AVISO: 'win32print' não encontrado. Impressão via driver Windows não funcionará.")

    def _rollback_printed(self, comanda_id, item_keys_set):
        """
        Reverte printed=False para itens cujo envio físico à impressora falhou.
        Preserva o OCC anti-duplicidade: só desfaz os itens que realmente não saíram.
        O próximo ciclo do agente irá detectá-los novamente e reimprimir.
        """
        try:
            res = self.supabase.table('comandas').select('items, updated_at').eq('id', comanda_id).execute()
            if not res.data:
                logging.warning(f"   ⚠️ [ROLLBACK] Comanda {comanda_id} não encontrada para reverter.")
                return
            items_db   = res.data[0].get('items') or []
            last_upd   = res.data[0].get('updated_at')
            changed    = False
            revertidos = 0
            for i, it in enumerate(items_db):
                if self._gerar_item_key(it, index=i) in item_keys_set and it.get('printed') is True:
                    items_db[i]['printed']     = False
                    items_db[i]['printed_qtd'] = 0
                    changed    = True
                    revertidos += 1
            if changed:
                new_ts  = datetime.datetime.now(datetime.timezone.utc).isoformat()
                upd_res = self.supabase.table('comandas').update({
                    'items':      items_db,
                    'updated_at': new_ts
                }).eq('id', comanda_id).eq('updated_at', last_upd).execute()
                if upd_res.data:
                    logging.info(f"   🔄 [ROLLBACK] {revertidos} item(s) revertidos para printed=False → próximo ciclo reimprime.")
                else:
                    logging.warning(f"   ⚠️ [ROLLBACK] Conflito OCC ao reverter. O próximo ciclo tentará novamente.")
        except Exception as e:
            logging.error(f"❌ Erro no rollback de impressão: {e}")

    # ------------------------------------------------------------------
    # RECOVERY DE QUEDA DE ENERGIA / CRASH
    # ------------------------------------------------------------------
    def _load_inflight(self):
        try:
            if os.path.exists(self.inflight_file):
                with open(self.inflight_file, 'r') as f:
                    return json.load(f)
        except:
            pass
        return {}

    def _save_inflight(self, comanda_id, item_keys_list):
        """Persiste os itens 'em voo' ANTES do update OCC.
        Se o agente cair agora (queda de energia), o próximo startup
        detecta o arquivo e reverte esses itens para printed=False."""
        try:
            inflight = self._load_inflight()
            inflight[str(comanda_id)] = {'keys': list(item_keys_list), 't': time.time()}
            with open(self.inflight_file, 'w') as f:
                json.dump(inflight, f)
        except Exception as e:
            logging.warning(f"⚠️ Não foi possível salvar in-flight: {e}")

    def _clear_inflight(self, comanda_id):
        """Remove a comanda do in-flight após todos os itens serem impressos com sucesso."""
        try:
            inflight = self._load_inflight()
            inflight.pop(str(comanda_id), None)
            with open(self.inflight_file, 'w') as f:
                json.dump(inflight, f)
        except:
            pass

    def _recover_inflight(self):
        """Executado uma vez após a primeira conexão bem-sucedida ao Supabase.
        Reverte itens que foram marcados printed=True mas nunca foram
        fisicamente impressos (agente caiu durante o ciclo de impressão).
        Isso elimina a necessidade de intervenção manual após quedas de energia."""
        inflight = self._load_inflight()
        if not inflight:
            logging.info("✅ [RECOVERY] Sem itens in-flight. Sistema consistente.")
            return
        logging.warning(f"⚡ [RECOVERY] {len(inflight)} comanda(s) com itens em estado inconsistente.")
        logging.warning(f"   Causa provável: queda de energia/internet durante impressão. Revertendo...")
        for comanda_id_str, data in inflight.items():
            keys = set(data.get('keys', []))
            if keys:
                self._rollback_printed(comanda_id_str, keys)
        try:
            os.remove(self.inflight_file)
            logging.info("✅ [RECOVERY] Concluído. Itens revertidos serão reimpresos no próximo ciclo.")
        except:
            pass

    def setup_logging(self):
        logger = logging.getLogger()
        logger.setLevel(logging.INFO)
        formatter = logging.Formatter('%(asctime)s [PID:%(process)d] [%(levelname)s] %(message)s')
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

        def _do_print():
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

        import concurrent.futures
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_do_print)
        
        try:
            # Timeout de 6 segundos para evitar travamento da fila por oscilação de rede
            res = future.result(timeout=6.0)
            executor.shutdown(wait=False)
            return res
        except concurrent.futures.TimeoutError:
            logging.error(f"❌ Erro Windows {driver_name}: Timeout (Rede oscilando ou impressora offline).")
            executor.shutdown(wait=False)
            return False
        except Exception as e:
            executor.shutdown(wait=False)
            # Erro 1905 = impressora foi excluída do Windows
            # Erro 1801 = nome inválido
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
                txt += "\x1D\x21\x01\x1B\x45\x01\x1B\x47\x01"
                txt += f"   >>> {obs.upper()}\n"
                txt += "\x1B\x47\x00"
        txt += "\x1D\x21\x00\n"
        txt += f"\x1B\x61\x01\x1B\x21\x01 (NAXIO v14 - {datetime.datetime.now().strftime('%H:%M:%S')})\n"
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

    def _gerar_item_key(self, item, index=None):
        """
        Gera uma chave única por POSIÇÃO no array da comanda.
        O índice é o primeiro componente: dois pedidos idênticos (mesmo produto,
        mesmo garçom, mesma hora) ficam nas posições 0 e 1 e recebem chaves
        distintas, garantindo que ambos sejam impressos sem bloqueio mútuo.
        """
        prod_id   = str(item.get('id') or item.get('product_id') or '')
        data_lanc = str(item.get('data_lancamento') or item.get('added_at') or '')
        obs       = str(item.get('observacao') or item.get('obs') or '').strip()
        nome      = str(item.get('nome', '')).strip()
        qtd       = str(item.get('qtd', 1))
        preco     = str(item.get('price') or item.get('preco') or '0')
        garcom    = str(item.get('garcom') or item.get('garcom_nome') or '').strip()
        idx_part  = f"{index}|" if index is not None else ""
        return f"{idx_part}{prod_id}|{nome}|{qtd}|{preco}|{garcom}|{obs}|{data_lanc}"

    def _item_precisa_imprimir(self, item):
        """
        Verifica se um item ainda precisa ser impresso.
        """
        # Esquema 1: flag booleana 'printed' (garçom.js e print_service)
        if 'printed' in item:
            return not item.get('printed', False)
        
        # Esquema 2: printed_qtd vs qtd (comandas.js do caixa)
        qtd = item.get('qtd', 1)
        printed_qtd = item.get('printed_qtd', 0)
        if printed_qtd is not None:
            return float(printed_qtd) < float(qtd)
        
        # Sem flag nenhuma: considera que precisa imprimir
        return True

    def _item_is_too_old(self, item, max_minutes=120):
        """Evita imprimir itens antigos ou anteriores ao cutoff."""
        try:
            data_lanc = item.get('data_lancamento') or item.get('added_at')
            if not data_lanc:
                # Sem data: item legado/antigo sem timestamp → ignora para não poluir
                return True

            dt_str  = data_lanc[:19].replace('T', ' ')
            dt_item = datetime.datetime.strptime(dt_str, '%Y-%m-%d %H:%M:%S')

            # --- CONVERSÃO UTC → LOCAL (UTC-3 / Brasília) ---
            # Supabase SEMPRE envia timestamps em UTC (sufixo 'Z' ou '+00').
            # A compensação anterior era condicional e falhava em vários cenários.
            # Agora: se o timestamp veio em UTC, subtraímos 3h para obter hora local.
            is_utc = 'Z' in data_lanc or '+00' in data_lanc
            if is_utc:
                dt_item = dt_item - datetime.timedelta(hours=3)

            agora = datetime.datetime.now()

            # 1. Filtro Hard: Cutoff (18/04 17:00)
            if dt_item < self.cutoff_time:
                return True

            # 2. Dias anteriores
            if dt_item.date() < agora.date():
                return True

            # 3. Hoje, mas lançado há mais de max_minutes
            tempo_decorrido = (agora - dt_item).total_seconds() / 60
            if tempo_decorrido > max_minutes:
                return True

        except Exception as e:
            logging.error(f"⚠️ Erro no filtro de idade: {e}")
        return False

    def _verificar_reserva(self, comanda, novos_itens=None):
        """
        Verifica se OS NOVOS ITENS da comanda são do tipo 'reserva'.
        """
        if novos_itens:
            for item_data in novos_itens:
                # Robustez: pega apenas os dois primeiros valores independente do tamanho da tupla
                idx, item = item_data[0], item_data[1]
                if item.get('is_reserva') is True:
                    return True
        return False

    def stop(self):
        self.running = False

    def run(self):
        logging.info(f"🚀 Agente Naxio v14 (Multi-Loja + Multi-Agente Fix) Iniciado")
        logging.info(f"📍 Lojas monitoradas: {self.store_ids}")

        while self.running:
            try:
                if time.time() - self.last_sync_time > 300:
                    self.sync_printers()
                    self.last_sync_time = time.time()

                # Otimização: Apenas mesas atualizadas nas últimas 12 horas (evita processar centenas de mesas antigas)
                cutoff_query = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=12)).isoformat()
                
                logging.info(f"📡 [SYNC] Buscando pedidos (desde {cutoff_query})...")
                res = self.supabase.table('comandas').select('*, stores(nome_loja)')\
                    .in_('store_id', self.store_ids)\
                    .neq('status', 'free')\
                    .gt('updated_at', cutoff_query)\
                    .execute()

                # Conexão OK → reseta contador de erros consecutivos
                if self._consecutive_errors > 0:
                    logging.info(f"✅ [CONEXÃO] Restabelecida após {self._consecutive_errors} ciclo(s) com falha. Retomando impressão normal.")
                    self._consecutive_errors = 0

                # Recovery de startup: roda uma única vez após a primeira conexão OK
                if not self._recovery_done:
                    self._recover_inflight()
                    self._recovery_done = True

                # Auto-reparo periódico com IA
                if self.repair_ai:
                    self.repair_ai.check_and_repair(self)

                if not res.data:
                    logging.info("   空 Nenhuma mesa ocupada encontrada no momento.")
                else:
                    logging.info(f"   📂 Encontradas {len(res.data)} mesas ocupadas. Analisando...")

                for comanda in res.data:
                    comanda_id = comanda.get('id')
                    novos_pedidos = []
                    items = comanda.get('items') or []
                    
                    logging.info(f"   Mesa {comanda.get('numero')}: {len(items)} itens totais.")
                    
                    # --- BLOQUEIO GLOBAL ---
                    # Nomes que nunca devem ser impressos em NENHUMA impressora (Cozinha, Bar, Caixa, etc)
                    BLOQUEIO_TOTAL = [
                        'PICOLE', 'PICOLÉ', 'REVENDA', 'EXTRATO', 'TAXA', 'GORJETA', 'TX',
                        'COUVERT', 'AGUA', 'ÁGUA', 'COCO VERDE', 'COCO',
                        'CERVEJA', 'CERVEJAS', 'HEINEKEN', 'SKOL', 'BUD', 'BUDWEISER',
                        'ITAIPAVA', 'SPATEN', 'ORIGINAL', 'STELLA', 'PETRA',
                        'REFRIGERANTE', 'REFRIGERANTES', 'REFRI', 'REFRIG',
                        'ENERGETICO', 'ENERGÉTICO',
                    ]
                    
                    # 1.1 FILTRO LIBERAL (Foco total no status do banco)
                    for idx, item in enumerate(items):
                        item_nome = item.get('nome', 'S/ NOME')
                        
                        # Se já está impresso no banco, ignoramos silenciosamente
                        if item.get('printed') is True:
                            continue 
                        
                        # Se o garçom acabou de lançar (printed: false ou inexistente), NÓS IMPRIMIMOS
                        if not self._item_precisa_imprimir(item):
                            pqtd = item.get('printed_qtd', 0)
                            qtd  = item.get('qtd', 1)
                            logging.info(f"      ⏭️  '{item_nome}': printed_qtd={pqtd} >= qtd={qtd}. Ignorando.")
                            continue

                        nome_upper = self._normalize_text(str(item_nome)).upper()
                        if any(b in nome_upper for b in BLOQUEIO_TOTAL):
                            logging.info(f"      🚫 '{item_nome}': bloqueado pela lista BLOQUEIO_TOTAL. Ignorando.")
                            continue

                        if self._item_is_too_old(item, max_minutes=120):
                            data_lanc = item.get('data_lancamento') or item.get('added_at', '?')
                            logging.warning(f"      ⏰  '{item_nome}': muito antigo/antes do cutoff (data_lancamento={data_lanc}). Ignorando.")
                            continue
                        item_key = self._gerar_item_key(item, index=idx)

                        # Adicionamos ao lote de impressão
                        novos_pedidos.append((idx, item, item_key))
                        logging.info(f"      ✨ [DETECÇÃO] '{item_nome}' identificado para impressão.")
                    
                    if novos_pedidos:
                        # --- [LOCK] ATÔMICO E DOUBLE-CHECK PROFISSIONAL ---
                        try:
                            # Sincronização simplificada para agente único
                            items_atuais = json.loads(json.dumps(comanda.get('items') or []))
                            last_update  = comanda.get('updated_at')
                            
                            indices_ja_pareados = []
                            itens_confirmados_batch = []
                            any_changed = False
                            
                            # 2. Pareamento de Precisão: Garante que N pedidos iguais consumam N itens unprinted no banco
                            for idx_orig, item_orig, item_key in novos_pedidos:
                                target_idx = None
                                
                                # A. Tentativa por Índice Original (Ideal para estabilidade)
                                if idx_orig < len(items_atuais):
                                    it_db = items_atuais[idx_orig]
                                    if self._gerar_item_key(it_db, index=idx_orig) == item_key and not it_db.get('printed'):
                                        target_idx = idx_orig
                                
                                # B. Tentativa por Busca Global (Caso o array tenha sofrido shift/push)
                                if target_idx is None:
                                    for i, it_db in enumerate(items_atuais):
                                        if i not in indices_ja_pareados:
                                            if self._gerar_item_key(it_db, index=i) == item_key and not it_db.get('printed'):
                                                target_idx = i
                                                break
                                
                                if target_idx is not None:
                                    indices_ja_pareados.append(target_idx)
                                    items_atuais[target_idx]['printed'] = True
                                    items_atuais[target_idx]['printed_qtd'] = items_atuais[target_idx].get('qtd', 1)
                                    itens_confirmados_batch.append((items_atuais[target_idx], item_key))
                                    any_changed = True

                            if any_changed:
                                # 3. Sincronização Final (Gatekeeper): Só imprime se a marcação for gravada com sucesso
                                new_ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
                                upd_res = self.supabase.table('comandas').update({
                                    'items': items_atuais, 
                                    'updated_at': new_ts
                                }).eq('id', comanda_id).eq('updated_at', last_update).execute()

                                if not upd_res.data:
                                    logging.warning(f"   ⚠️ CONFLITO OCC na Mesa {comanda['numero']}. Abortando para evitar duplicata.")
                                    continue

                                logging.info(f"   🔒 [LOCK] Mesa {comanda['numero']}: {len(itens_confirmados_batch)} itens sincronizados com o banco.")

                                # Salva in-flight ANTES de imprimir: se o agente cair agora,
                                # o próximo startup reverte esses itens automaticamente.
                                self._save_inflight(comanda_id, [k for _, k in itens_confirmados_batch])
                                
                                # --- FORTIFICAÇÃO CONTRA DUPLICIDADE (DELAY DE SEGURANÇA) ---
                                # Aguarda o tempo solicitado pelo usuário para garantir que o banco de dados
                                # processou o update e evitar que outros agentes em rede iniciem o mesmo lote.
                                if len(itens_confirmados_batch) > 0:
                                    logging.info(f"   ⏳ [DELAY] Aguardando 1.5s para estabilização da impressão...")
                                    time.sleep(1.5)

                                # --- ROTEAMENTO E IMPRESSÃO FÍSICA ---
                                is_reserva = self._verificar_reserva(comanda, [(0, it[0], '') for it in itens_confirmados_batch])
                                
                                # Busca metadados de roteamento (Batch)
                                p_ids = list(set([str(it[0].get('id') or it[0].get('product_id')) for it in itens_confirmados_batch if it[0].get('id') or it[0].get('product_id')]))
                                products_meta = {}
                                if p_ids:
                                    try:
                                        p_res = self.supabase.table('products').select('id, impressora_alvo').in_('id', p_ids).execute()
                                        products_meta = {str(p['id']): p.get('impressora_alvo') for p in p_res.data}
                                    except: pass

                                # Agrupamento Final por Destino
                                grupos_final = {}
                                for it_conf, k_conf in itens_confirmados_batch:
                                    # Tenta identificar o destino (Prioridade: ID no banco > Atributo no item > Setor > Fallback)
                                    p_id = str(it_conf.get('id') or it_conf.get('product_id') or '')
                                    alvo = str(products_meta.get(p_id) or it_conf.get('impressora_alvo') or it_conf.get('setor') or '').strip().upper()
                                    
                                    # FALLBACK: Se não tem alvo, assume COZINHA para não perder o pedido
                                    if not alvo:
                                        alvo = 'COZINHA'
                                        logging.info(f"      ⚠️  Item '{it_conf.get('nome')}' sem setor definido. Usando fallback: '{alvo}'")
                                    
                                    destino = self.printers_map.get(alvo)
                                    if not destino: # Fuzzy match
                                        for nome_cad, ip_dest in self.printers_map.items():
                                            if alvo in nome_cad or nome_cad in alvo:
                                                destino = ip_dest
                                                break
                                    
                                    # SEGUNDO FALLBACK: Se o setor não existe nas impressoras, usa a impressora padrão
                                    if not destino and self.default_printer:
                                        destino = self.default_printer
                                        logging.info(f"      ⚠️  Setor '{alvo}' não mapeado nas impressoras. Usando padrão: {destino}")

                                    if destino:
                                        logging.info(f"      🎯 [ROTA] '{it_conf.get('nome')}' → '{alvo}' ({destino})")
                                        if destino not in grupos_final:
                                            grupos_final[destino] = {'itens': [], 'keys': [], 'setor': alvo}
                                        grupos_final[destino]['itens'].append(it_conf)
                                        grupos_final[destino]['keys'].append(k_conf)
                                    else:
                                        logging.error(f"      ❌ [FALHA ROTA] Mesa {comanda.get('numero')} | '{it_conf.get('nome')}' → Nenhum destino encontrado.")

                                for destino, dados in grupos_final.items():
                                    mesa_num  = comanda.get('numero', '?')
                                    setor_tag = dados['setor']
                                    resumo    = " | ".join(f"{it.get('qtd', 1)}x {it.get('nome', '?')}" for it in dados['itens'])
                                    
                                    logging.info(f"   🖨️  [ENVIANDO] Mesa {mesa_num} → {setor_tag} ({destino})")
                                    logging.info(f"      Itens: {resumo}")

                                    if self.send_to_printer(self.format_ticket(comanda, dados['itens'], dados['setor'], is_reserva), destino):
                                        logging.info(f"   ✅ [OK] Mesa {mesa_num} | {setor_tag} ({destino})")
                                        # Sucesso: limpa contador de retries se existir
                                        self.print_retries.pop(f"{comanda_id}_{destino}", None)
                                    else:
                                        logging.error(f"   ❌ [FALHA] Mesa {mesa_num} | {setor_tag} ({destino})")
                                        logging.error(f"      NÃO impresso: {resumo}")
                                        
                                        # Controle de retries para evitar loop infinito de timeout
                                        retry_key = f"{comanda_id}_{destino}"
                                        self.print_retries[retry_key] = self.print_retries.get(retry_key, 0) + 1
                                        
                                        if self.print_retries[retry_key] <= 3:
                                            logging.error(f"      ↩ Revertendo para printed=False (Tentativa {self.print_retries[retry_key]}/3) → próximo ciclo reimprime.")
                                            self._rollback_printed(comanda_id, set(dados['keys']))
                                        else:
                                            logging.error(f"      🚨 Limite de tentativas atingido (3/3). NÃO revertendo para evitar loop infinito. O pedido precisará ser reimpresso manualmente no painel.")
                                            # Limpa o contador para a próxima vez
                                            self.print_retries.pop(retry_key, None)

                                # Ciclo desta mesa concluído → limpa in-flight
                                self._clear_inflight(comanda_id)
                        except Exception as e_proc:
                            logging.error(f"❌ Erro Crítico na Mesa {comanda.get('numero')}: {e_proc}", exc_info=True)

                # 2. CONTAS (Processamento rápido)
                try:
                    res_contas = self.supabase.table('comandas').select('*').in_('store_id', self.store_ids).in_('status', ['pagando', 'paying']).execute()
                    for comanda in res_contas.data:
                        if comanda['id'] not in self.contas_processadas:
                            destino = self.printers_map.get('CAIXA') or self.default_printer
                            if destino:
                                if self.send_to_printer(self.format_bill(comanda), destino):
                                    logging.info(f"💰 Mesa {comanda['numero']}: Conta impressa.")
                                    self.contas_processadas.add(comanda['id'])
                    
                    # Limpa cache de contas para mesas que já fecharam
                    ids_atuais = {c['id'] for c in res_contas.data}
                    self.contas_processadas = {cid for cid in self.contas_processadas if cid in ids_atuais}
                except: pass

            except Exception as e:
                self._consecutive_errors += 1
                wait = min(30, self._consecutive_errors * 3)  # backoff: 3s, 6s, 9s ... até 30s
                if self._consecutive_errors == 1:
                    logging.error(f"❌ [ERRO] Falha no ciclo (rede/banco?): {e}. Aguardando {wait}s antes de reintentar.")
                else:
                    logging.warning(f"⚠️ [RETRY {self._consecutive_errors}] Ainda sem conexão. Próxima tentativa em {wait}s. ({e})")

            time.sleep(max(self.cycle_sleep, wait if self._consecutive_errors > 0 else 0))


class NaxioService(win32serviceutil.ServiceFramework):
    _svc_name_ = "NaxioPrintService"
    _svc_display_name_ = "Naxio Print Agent"
    _svc_description_ = "Sincroniza pedidos e imprime automaticamente nas impressoras configuradas."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        
        # Trava de Instância Única (Anti-Zumbi) também no modo Serviço
        self._lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            self._lock_socket.bind(('127.0.0.1', 48556))
        except socket.error:
            logging.critical("❌ ERRO CRÍTICO: Outra instância do Agente Naxio detectada. Abortando serviço para evitar duplicatas.")
            sys.exit(1)

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
        # Trava de Instância Única (Anti-Zumbi)
        _lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            _lock_socket.bind(('127.0.0.1', 48556))
        except socket.error:
            print("\n❌ ERRO CRÍTICO: Outra instância do Agente Naxio já está rodando nesta máquina.")
            print("   Verifique o Gerenciador de Tarefas e feche processos 'python.exe' ou 'agente.exe' antigos.\n")
            sys.exit(1)
            
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
