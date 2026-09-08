from supabase import create_client
import json

URL = 'https://groezaseypdbpgymgpvo.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM'

supabase = create_client(URL, KEY)

start_date = '2026-09-01T00:00:00'
end_date = '2026-09-07T23:59:59'

all_orders = []
offset = 0
limit = 1000

while True:
    res = supabase.table('orders').select('id, id_nuvem, chave_acesso, created_at, status_sefaz, xml_arquivo, store_id').gte('created_at', start_date).lte('created_at', end_date).range(offset, offset + limit - 1).execute()
    data = res.data
    if not data:
        break
    all_orders.extend(data)
    offset += limit
    if len(data) < limit:
        break

missing_xml_orders = [
    o for o in all_orders 
    if o.get('status_sefaz') and 'autorizado' in str(o.get('status_sefaz')).lower() 
    and (not o.get('xml_arquivo') or str(o.get('xml_arquivo')).strip() == '')
]

print(f'Total encontrados: {len(missing_xml_orders)}')
if len(missing_xml_orders) > 0:
    with open('notas_sem_xml.json', 'w') as f:
        json.dump(missing_xml_orders, f, indent=4)
    print('IDs das vendas com XML faltando (primeiras 10):')
    for o in missing_xml_orders[:10]:
        print(f"ID da venda: {o['id']} | ID Nuvem: {o.get('id_nuvem')} | Chave: {o.get('chave_acesso')}")
