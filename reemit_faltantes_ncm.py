import json
import requests
import time
from supabase import create_client

URL = 'https://groezaseypdbpgymgpvo.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM'
supabase = create_client(URL, KEY)

store_marambaia = 'f9b59170-dc78-4331-a213-30da11e79639'
store_cacoeira = 'c8acb3db-27d4-4626-9b32-74ff3731b687'

start_date = '2026-08-01T00:00:00'
end_date = '2026-08-31T23:59:59'

def get_missing_for_store(store_id):
    all_orders = []
    offset = 0
    limit = 1000
    while True:
        res = supabase.table('orders').select('id, store_id, created_at, status_sefaz, xml_arquivo, metodo_pagamento, observacao').eq('store_id', store_id).gte('created_at', start_date).lte('created_at', end_date).range(offset, offset + limit - 1).execute()
        data = res.data
        if not data:
            break
        all_orders.extend(data)
        offset += limit
        if len(data) < limit:
            break
    
    missing = [o for o in all_orders if not o.get('xml_arquivo') or str(o.get('xml_arquivo')).strip() == '']
    return missing

print("Consultando notas faltando...")
missing_marambaia = get_missing_for_store(store_marambaia)
missing_cacoeira = get_missing_for_store(store_cacoeira)

print(f"Faltam {len(missing_marambaia)} para Marambaia e {len(missing_cacoeira)} para Cacoeira.")

to_process = missing_marambaia + missing_cacoeira
if not to_process:
    print("Nenhuma nota para processar.")
    exit(0)

sucesso = 0
falhas = 0
ncm_fixed = 0

def update_supabase_with_retry(order_id, payload_dict, max_retries=3):
    for i in range(max_retries):
        try:
            supabase.table('orders').update(payload_dict).eq('id', order_id).execute()
            return True
        except Exception as e:
            print(f"    [Supabase Retry {i+1}] Erro: {e}")
            time.sleep(2)
    return False

def post_vercel_with_retry(payload, max_retries=3):
    for i in range(max_retries):
        try:
            r = requests.post("https://naxiosoftware.vercel.app/api/emitir_fiscal", json=payload, headers={'Content-Type': 'application/json'}, timeout=15)
            return r
        except Exception as e:
            print(f"    [Vercel Retry {i+1}] Erro: {e}")
            time.sleep(2)
    return None

for i, order in enumerate(to_process):
    order_id = order['id']
    store_id = order['store_id']
    
    payload = {
        "order_id": order_id,
        "store_id": store_id,
        "modelo": 65
    }
    
    print(f"[{i+1}/{len(to_process)}] Emitindo {order_id}...")
    
    # Reseta status
    update_supabase_with_retry(order_id, {
        'status_sefaz': None,
        'id_nuvem': None,
        'chave_acesso': None,
        'xml_arquivo': None
    })

    response = post_vercel_with_retry(payload)
    if response and response.status_code == 200:
        try:
            res_json = response.json()
        except:
            res_json = {}
            
        if res_json.get('sucesso'):
            print(f"  -> Sucesso!")
            sucesso += 1
        else:
            msg = str(res_json.get('message', '')).lower()
            print(f"  -> Falha da API: {msg}")
            if 'ncm' in msg:
                print("  -> Detectado erro de NCM. Corrigindo para 21069090 e tentando novamente...")
                try:
                    obs_str = order.get('observacao') or '{}'
                    obs_json = json.loads(obs_str)
                    changed = False
                    
                    items_list = []
                    if isinstance(obs_json, dict):
                        if 'items' in obs_json and isinstance(obs_json['items'], list):
                            items_list = obs_json['items']
                        elif 'itens' in obs_json and isinstance(obs_json['itens'], list):
                            items_list = obs_json['itens']
                    elif isinstance(obs_json, list):
                        items_list = obs_json
                        
                    for item in items_list:
                        item['ncm'] = '21069090'
                        changed = True
                        
                    if changed:
                        update_supabase_with_retry(order_id, {'observacao': json.dumps(obs_json)})
                        ncm_fixed += 1
                        
                        retry_response = post_vercel_with_retry(payload)
                        if retry_response and retry_response.status_code == 200:
                            retry_json = retry_response.json()
                            if retry_json.get('sucesso'):
                                print("  -> Sucesso apos correcao de NCM!")
                                sucesso += 1
                            else:
                                print(f"  -> Falha novamente apos correcao: {retry_json.get('message')}")
                                falhas += 1
                        else:
                            falhas += 1
                    else:
                        falhas += 1
                except Exception as e:
                    print(f"  -> Erro ao corrigir NCM: {e}")
                    falhas += 1
            else:
                falhas += 1
    else:
        print(f"  -> Falha de rede ou HTTP na Vercel API")
        falhas += 1

    time.sleep(1)

print(f"\nConcluido! Sucesso: {sucesso} | Falhas: {falhas} | NCMs corrigidos: {ncm_fixed}")
