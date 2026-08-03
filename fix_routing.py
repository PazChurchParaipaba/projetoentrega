from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"

supabase = create_client(URL, KEY)

# Update Bebidas to BAR
res1 = supabase.table('products').update({'impressora_alvo': 'BAR'}).eq('categoria', 'Bebidas').execute()
print(f"Updated {len(res1.data)} Bebidas to BAR")

# Update COZINHA categories
target_cats = ['Comidas', 'Sobremesas', 'Combos', 'Refeio']
for cat in target_cats:
    res = supabase.table('products').update({'impressora_alvo': 'COZINHA'}).eq('categoria', cat).execute()
    print(f"Updated {len(res.data)} {cat} to COZINHA")

# Check for any other categories
res3 = supabase.table('products').select('categoria').execute()
cats = set(p['categoria'] for p in res3.data if p['categoria'])
print(f"All categories: {cats}")
