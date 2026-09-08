from supabase import create_client
from datetime import datetime
import dateutil.parser
import collections

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

res = supabase.table('cash_sessions').select('*').order('created_at', desc=True).limit(3).execute()

for session in res.data:
    session_id = session.get('id')
    print(f"\n--- Checking session {session_id} | Created: {session.get('created_at')} ---")
    orders_res = supabase.table('orders').select('*').eq('session_id', session_id).execute()
    orders = orders_res.data

    valid_orders = [o for o in orders if o.get('status', '').lower() not in ['cancelado', 'cancelada', 'devolvido', 'devolvida']]
    print(f"Valid orders: {len(valid_orders)}")

    value_counts = collections.defaultdict(list)
    for o in valid_orders:
        value_counts[o.get('total_pago', 0)].append(o)

    total_excess = 0
    
    for val, ords in value_counts.items():
        if len(ords) > 1 and val > 0:
            ords.sort(key=lambda x: dateutil.parser.isoparse(x['created_at']))
            i = 0
            while i < len(ords) - 1:
                o1 = ords[i]
                o2 = ords[i+1]
                t1 = dateutil.parser.isoparse(o1['created_at'])
                t2 = dateutil.parser.isoparse(o2['created_at'])
                diff_seconds = abs((t2 - t1).total_seconds())
                
                # Check within 10 minutes to be safe
                if diff_seconds < 600:
                    print(f"TRUE DUPLICATE FOUND: Value {val} | Times: {t1} and {t2} | Diff: {diff_seconds}s | ID1: {o1['id']} | ID2: {o2['id']}")
                    total_excess += val
                    i += 2 
                else:
                    i += 1
    
    print(f"Total excess from true duplicates for this session: {total_excess}")

