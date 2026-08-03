from supabase import create_client
import sys

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"

supabase = create_client(URL, KEY)

# Get some products to check their sectors
res = supabase.table('products').select('nome, categoria, impressora_alvo').limit(50).execute()
for p in res.data:
    print(f"Product: {p.get('nome')} | Cat: {p.get('categoria')} | Printer: {p.get('impressora_alvo')}")

# Get printers
res_p = supabase.table('store_printers').select('store_id, nome, ip').execute()
print("\nPrinters:")
for p in res_p.data:
    print(p)
