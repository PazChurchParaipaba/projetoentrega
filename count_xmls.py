from supabase import create_client
import sys

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

# Get all orders in August 2026
res = supabase.table('orders').select('id, store_id, xml_arquivo, xml_autorizado, status_sefaz').gte('created_at', '2026-08-01T00:00:00').lte('created_at', '2026-08-31T23:59:59').execute()
orders = res.data

from collections import defaultdict
store_counts = defaultdict(lambda: {'total': 0, 'xml_arquivo': 0, 'xml_autorizado': 0, 'both': 0, 'none': 0, 'autorizado_status': 0})

for o in orders:
    sid = o['store_id']
    store_counts[sid]['total'] += 1
    has_arq = bool(o.get('xml_arquivo'))
    has_aut = bool(o.get('xml_autorizado'))
    
    status = o.get('status_sefaz') or ''
    if 'autorizado' in status.lower():
        store_counts[sid]['autorizado_status'] += 1

    if has_arq and has_aut:
        store_counts[sid]['both'] += 1
        store_counts[sid]['xml_arquivo'] += 1
        store_counts[sid]['xml_autorizado'] += 1
    elif has_arq:
        store_counts[sid]['xml_arquivo'] += 1
    elif has_aut:
        store_counts[sid]['xml_autorizado'] += 1
    else:
        store_counts[sid]['none'] += 1

for sid, counts in store_counts.items():
    print(f"Store: {sid}")
    print(f"  Total orders: {counts['total']}")
    print(f"  Total com status_sefaz='autorizado': {counts['autorizado_status']}")
    print(f"  With xml_arquivo: {counts['xml_arquivo']}")
    print(f"  With xml_autorizado: {counts['xml_autorizado']}")
    print(f"  With both: {counts['both']}")
    print(f"  With neither: {counts['none']}")
    print("---")
