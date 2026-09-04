import requests
from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

# Find an order that has id_nuvem but no xml_arquivo
res = supabase.table('orders').select('id, id_nuvem, chave_acesso').not_('id_nuvem', 'is', 'null').is_('xml_arquivo', 'null').limit(1).execute()

if res.data:
    order = res.data[0]
    print("Found order:", order)
    
    # Try fetching from Geranet
    apiKey = "gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg"
    id_nuvem = order['id_nuvem']
    
    url = f"https://nfe.geranet.net/api/v1/nfe/{id_nuvem}"
    headers = {"Authorization": f"Bearer {apiKey}"}
    r = requests.get(url, headers=headers)
    print("Geranet API status:", r.status_code)
    
    if r.status_code == 200:
        data = r.json()
        print("Keys in response:", data.keys())
        if 'xml' in data:
            print("Has XML!", len(data['xml']))
        else:
            print("No XML in response")
else:
    print("No order found")
