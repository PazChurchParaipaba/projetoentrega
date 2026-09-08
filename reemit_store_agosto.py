import json
import requests
import time
from supabase import create_client

URL = 'https://groezaseypdbpgymgpvo.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM'

supabase = create_client(URL, KEY)

store_id = 'c8acb3db-27d4-4626-9b32-74ff3731b687'

start_date = '2026-08-01T00:00:00'
end_date = '2026-08-31T23:59:59'

all_orders = []
offset = 0
limit = 1000

print(f"Buscando notas sem XML para a loja {store_id} em AGOSTO...")

while True:
    res = supabase.table('orders').select('id, store_id, xml_arquivo, metodo_pagamento, status_sefaz').eq('store_id', store_id).gte('created_at', start_date).lte('created_at', end_date).range(offset, offset + limit - 1).execute()
    data = res.data
    if not data:
        break
    all_orders.extend(data)
    offset += limit
    if len(data) < limit:
        break

orders_without_xml = [o for o in all_orders if not o.get('xml_arquivo') or str(o.get('xml_arquivo')).strip() == '']

print(f"Total de vendas da loja em Agosto: {len(all_orders)}")
print(f"Total de XMLs baixados (vendas com XML): {len(all_orders) - len(orders_without_xml)}")
print(f"Faltam {len(orders_without_xml)} XMLs. Iniciando reemissão...")

if len(orders_without_xml) == 0:
    print("Nenhuma nota para reemitir.")
    exit(0)

sucesso = 0
falhas = 0

for order in orders_without_xml:
    order_id = order['id']
    
    payload = {
        "order_id": order_id,
        "store_id": store_id,
        "modelo": 65 
    }
    
    try:
        # Reseta o status se precisar
        supabase.table('orders').update({
            'status_sefaz': None,
            'id_nuvem': None,
            'chave_acesso': None,
            'xml_arquivo': None
        }).eq('id', order_id).execute()

        response = requests.post("https://naxiosoftware.vercel.app/api/emitir_fiscal", json=payload, headers={'Content-Type': 'application/json'})
        if response.status_code == 200:
            sucesso += 1
        else:
            falhas += 1
    except Exception as e:
        falhas += 1
        
    time.sleep(2) 

print(f"\nResumo da reemissão: {sucesso} sucessos, {falhas} falhas.")
