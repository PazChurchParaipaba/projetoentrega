import requests
from supabase import create_client
import time

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

API_KEY_GERANET = "gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg"

print("Buscando notas autorizadas em agosto...")
# Pega as notas de agosto
res = supabase.table('orders').select('id, id_nuvem, xml_arquivo, status_sefaz').gte('created_at', '2026-08-01T00:00:00').lte('created_at', '2026-08-31T23:59:59').execute()
orders = res.data

# Filtra apenas as que precisam de XML
missing_xml_orders = [o for o in orders if o.get('id_nuvem') and not o.get('xml_arquivo') and 'autorizado' in (o.get('status_sefaz') or '').lower()]

print(f"Encontradas {len(missing_xml_orders)} notas sem XML.")

if len(missing_xml_orders) > 0:
    print("Iniciando recuperacao...")
    
    sucesso = 0
    falha = 0
    
    for i, order in enumerate(missing_xml_orders):
        order_id = order['id']
        id_nuvem = order['id_nuvem']
        
        # Chama a API da Geranet
        url = f"https://nfe.geranet.net/api/v1/nfe/{id_nuvem}"
        headers = {"Authorization": f"Bearer {API_KEY_GERANET}"}
        
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if 'xml' in data and data['xml']:
                    # Atualiza o banco
                    supabase.table('orders').update({'xml_arquivo': data['xml']}).eq('id', order_id).execute()
                    sucesso += 1
                    print(f"[{i+1}/{len(missing_xml_orders)}] Sucesso: {order_id}")
                else:
                    falha += 1
                    print(f"[{i+1}/{len(missing_xml_orders)}] Sem XML na resposta da Geranet: {order_id}")
            else:
                falha += 1
                print(f"[{i+1}/{len(missing_xml_orders)}] Falha API {r.status_code}: {order_id}")
        except Exception as e:
            falha += 1
            print(f"[{i+1}/{len(missing_xml_orders)}] Erro requisicao: {e}")
            
        # Pequena pausa para evitar bloqueio (rate limit)
        time.sleep(0.3)
        
    print(f"\\nConcluido! Sucesso: {sucesso} | Falha: {falha}")
else:
    print("Nenhuma nota precisando de recuperação.")
