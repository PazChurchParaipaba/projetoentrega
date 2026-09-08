from supabase import create_client
import json

URL = 'https://groezaseypdbpgymgpvo.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM'

supabase = create_client(URL, KEY)

with open('notas_sem_xml.json', 'r') as f:
    orders = json.load(f)

print(f"Lendo {len(orders)} vendas do arquivo JSON...")

updated_count = 0
for order in orders:
    order_id = order['id']
    # Atualiza o status_sefaz para null (ou string vazia dependendo de como a API espera, mas vamos colocar None/null)
    # E limpa id_nuvem e chave_acesso so pra garantir
    try:
        res = supabase.table('orders').update({
            'status_sefaz': None,
            'id_nuvem': None,
            'chave_acesso': None,
            'xml_arquivo': None
        }).eq('id', order_id).execute()
        
        if res.data:
            updated_count += 1
            print(f"Venda {order_id} resetada com sucesso.")
        else:
            print(f"Venda {order_id} não retornou dados no update.")
    except Exception as e:
        print(f"Erro ao atualizar {order_id}: {e}")

print(f"\nConcluído! {updated_count} vendas foram resetadas.")
