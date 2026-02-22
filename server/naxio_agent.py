import http.server
import socketserver
import threading
import time
import json
import os
import webbrowser
import platform
from datetime import datetime
from functools import partial
import robots # Importa o módulo de robôs

# --- CONFIGURAÇÕES ---
PORT = 8080
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # Pasta "projetoentrega-main" (Pai)

# --- CLASSE DE SERVIDOR PERSONALIZADA ---
class NaxioHandler(http.server.SimpleHTTPRequestHandler):
    
    def __init__(self, *args, directory=None, **kwargs):
        # Serve arquivos da pasta raiz do projeto, não da pasta server
        directory = BASE_DIR
        super().__init__(*args, directory=directory, **kwargs)

    def do_POST(self):
        # --- API LOCAL PARA COMANDOS OFFLINE ---
        
        # 1. Impressão Direta (Sem Janela do Chrome)
        if self.path == '/api/local/print':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                payload = json.loads(post_data.decode('utf-8'))
                
                # Simulação de envio para impressora USB (seria win32print aqui)
                printer_name = payload.get('printer', 'EPSON TM-T20')
                content = payload.get('content', '')
                
                print(f"\n[🖨️ IMPRESSORA] Enviando job para '{printer_name}'...")
                print(f"   --> {len(content)} bytes de dados de impressão.")
                
                # Salva log físico da impressão
                log_file = os.path.join(os.path.dirname(__file__), "impressao_log.txt")
                with open(log_file, "a", encoding="utf-8") as f:
                    f.write(f"[{datetime.now()}] IMPRESSAO EM {printer_name}:\n{content}\n{'-'*40}\n")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*') # CORS
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "msg": "Enviado para impressora USB"}).encode())
                
            except Exception as e:
                self.send_error(500, f"Erro interno: {str(e)}")
                
        # 2. Backup Local de Emergência
        elif self.path == '/api/local/backup':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                # Salva os dados brutos num arquivo JSON local com timestamp
                filename = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                backup_path = os.path.join(os.path.dirname(__file__), "backups", filename)
                
                os.makedirs(os.path.dirname(backup_path), exist_ok=True)
                
                with open(backup_path, "wb") as f:
                    f.write(post_data)
                    
                print(f"\n[🛡️ BACKUP] Dados salvos localmente em: {filename}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "saved", "file": filename}).encode())
                
            except Exception as e:
                self.send_error(500, str(e))
        
        else:
            self.send_error(404, "Endpoint Local Desconhecido")

    # Adiciona Headers CORS para permitir que o site (mesmo online) chame o localhost
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

# --- SERVIÇOS EM BACKGROUND ---
def check_internet():
    """ Monitora conexão e avisa no terminal se cair """
    last_status = True
    while True:
        try:
            # Tenta conectar no Google DNS
            import socket
            socket.create_connection(("8.8.8.8", 53), timeout=3)
            current_status = True
        except OSError:
            current_status = False
        
        if last_status and not current_status:
            print("\n[⚠️ ALERTA] INTERNET CAIU! O sistema continua rodando localmente.")
        elif not last_status and current_status:
            print("\n[✅ RETORNO] INTERNET VOLTOU! Sincronizando dados...")
            # Aqui poderia disparar um script de sync
            
        last_status = current_status
        time.sleep(10)

# --- INICIALIZAÇÃO ---
def start_server():
    # Prepara diretórios
    server_dir = os.path.dirname(os.path.abspath(__file__))
    if not os.path.exists(os.path.join(server_dir, "backups")):
        os.makedirs(os.path.join(server_dir, "backups"))

    handler = partial(NaxioHandler, directory=BASE_DIR)
    
    # Permite reuso rápido da porta se reiniciar
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"\n{'='*60}")
        print(f"🚀 NAXIO AGENT - SERVIDOR HÍBRIDO PY {platform.python_version()}")
        print(f"{'='*60}")
        print(f"📡 Painel Local: http://localhost:{PORT}")
        print(f"📂 Raiz do Site: {BASE_DIR}")
        print(f"🖨️  Módulo de Impressão USB: ATIVO")
        print(f"🛡️  Módulo de Backup Local: ATIVO")
        print(f"{'='*60}\n")
        
        # Inicia Monitor de Internet
        threading.Thread(target=check_internet, daemon=True).start()
        
        # 🤖 Inicia os Robôs Automatizados
        robots.robots.start()
        
        # Abre navegador (se for Windows/Mac)
        webbrowser.open(f"http://localhost:{PORT}")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Servidor Parado pelo Usuário.")

if __name__ == "__main__":
    start_server()
