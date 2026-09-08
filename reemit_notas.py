import json
import requests
import time

with open('notas_sem_xml.json', 'r') as f:
    orders = json.load(f)

print(f"Iniciando reemissão de {len(orders)} vendas via API da Vercel...")

sucesso = 0
falhas = 0

for order in orders:
    order_id = order['id']
    store_id = order['store_id']
    
    payload = {
        "order_id": order_id,
        "store_id": store_id,
        "modelo": 65 # Assumindo NFC-e (65) por padrão
    }
    
    print(f"Emitindo {order_id}...")
    try:
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
        
    time.sleep(2) # delay para não dar timeout ou throttling na API

print(f"\nResumo da reemissão: {sucesso} sucessos, {falhas} falhas.")
