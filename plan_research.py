import json
from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
sb = create_client(URL, KEY)

# Get the original session
session_id = 'f2199359-7926-45bb-8f3f-43a29e10f166'
r = sb.table('cash_sessions').select('*').eq('id', session_id).execute()
session = r.data[0]

# Get all orders for this session
r_orders = sb.table('orders').select('id, created_at, total_pago, metodo_pagamento, payments_info').eq('session_id', session_id).execute()
orders = r_orders.data

with open('research_output.json', 'w') as f:
    json.dump({'session': session, 'orders': orders}, f, indent=2)

print("Saved to research_output.json")
