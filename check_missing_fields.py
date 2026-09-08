import requests
from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

res = supabase.table('orders').select('*').gte('created_at', '2026-08-01T00:00:00').lte('created_at', '2026-08-31T23:59:59').is_('xml_arquivo', 'null').ilike('status_sefaz', '%autorizado%').execute()

print(f"Total autorizados sem xml_arquivo: {len(res.data)}")
for o in res.data[:5]:
    print("Order ID:", o['id'])
    print("Status Sefaz:", o.get('status_sefaz'))
    print("ID Nuvem:", o.get('id_nuvem'))
    print("Chave Acesso:", o.get('chave_acesso'))
    print("---")
