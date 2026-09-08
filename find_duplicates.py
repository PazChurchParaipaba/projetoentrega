from supabase import create_client
import collections

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

# Get cash sessions from recent days (e.g., last 5 sessions)
res = supabase.table('cash_sessions').select('*').order('created_at', desc=True).limit(5).execute()

print("Checking recent sessions for duplicates or anomalies (especially ~800 reais)...")
for session in res.data:
    session_id = session.get('id')
    created_at = session.get('created_at')
    print(f"\n--- Session ID: {session_id} | Created: {created_at} ---")
    
    # Get orders for this session
    orders_res = supabase.table('orders').select('*').eq('session_id', session_id).execute()
    orders = orders_res.data
    
    if not orders:
        print("No orders in this session.")
        continue
        
    print(f"Total orders: {len(orders)}")
    
    # Look for duplicates by exact same total_pago and similar created_at
    # Or just group by total_pago
    value_counts = collections.defaultdict(list)
    for o in orders:
        if o.get('status', '').lower() not in ['cancelado', 'cancelada', 'devolvido', 'devolvida']:
            total = o.get('total_pago', 0)
            value_counts[total].append(o)
            
    # Check for anything exactly 800
    for o in orders:
        if o.get('total_pago', 0) == 800:
            print(f"FOUND ORDER WITH EXACTLY 800: ID {o.get('id')} - Created: {o.get('created_at')} - Status: {o.get('status')}")
            
    # Show potential duplicates
    found_dupes = False
    for val, ords in value_counts.items():
        if len(ords) > 1 and val > 0:
            # We found multiple orders with the same total. Let's see if they are close in time or have similar items.
            print(f"\n  Potential duplicates with value {val}: {len(ords)} orders")
            for o in ords:
                print(f"    - ID: {o.get('id')}, Time: {o.get('created_at')}, Cliente: {o.get('cliente_nome', 'N/A')}, Items: {len(o.get('items', [])) if o.get('items') else 0}")
            found_dupes = True
            
    if not found_dupes:
        print("  No obvious duplicates found by value.")
