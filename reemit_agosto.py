import json
import requests
import time
from supabase import create_client

URL = 'https://groezaseypdbpgymgpvo.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM'

supabase = create_client(URL, KEY)

start_date = '2026-08-01T00:00:00'
end_date = '2026-08-31T23:59:59'

all_orders = []
offset = 0
limit = 1000

while True:
    res = supabase.table('orders').select('id, store_id, created_at, status_sefaz, xml_arquivo, metodo_pagamento, observacao').gte('created_at', start_date).lte('created_at', end_date).range(offset, offset + limit - 1).execute()
    data = res.data
    if not data:
        break
    all_orders.extend(data)
    offset += limit
    if len(data) < limit:
        break

# Filtrar as que estão sem XML
orders_without_xml = [o for o in all_orders if not o.get('xml_arquivo') or str(o.get('xml_arquivo')).strip() == '']

non_cash_orders = []

for o in orders_without_xml:
    mp = str(o.get('metodo_pagamento')).lower().strip()
    
    # Se NÃO for estritamente dinheiro
    if mp != 'dinheiro':
        non_cash_orders.append(o)

print(f"Foram encontradas {len(non_cash_orders)} vendas de AGOSTO sem XML que não são SOMENTE em dinheiro.")

if len(non_cash_orders) == 0:
    print("Nenhuma nota para reemitir.")
    exit(0)

print(f"Iniciando reemissão de {len(non_cash_orders)} vendas via API da Vercel...")

sucesso = 0
falhas = 0

for order in non_cash_orders:
    order_id = order['id']
    store_id = order['store_id']
    
    payload = {
        "order_id": order_id,
        "store_id": store_id,
        "modelo": 65 # Assumindo NFC-e (65) por padrão
    }
    
    print(f"Emitindo {order_id} (Método: {order.get('metodo_pagamento')})...")
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
            print(f"Sucesso para {order_id}!")
            sucesso += 1
        else:
            print(f"Falha ao emitir {order_id}: Status {response.status_code} - {response.text}")
            falhas += 1
    except Exception as e:
        print(f"Erro na requisição para {order_id}: {e}")
        falhas += 1
        
    time.sleep(2) # delay para não sobrecarregar

print(f"\nResumo da reemissão: {sucesso} sucessos, {falhas} falhas.")
