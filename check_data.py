from supabase import create_client
import sys

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"

supabase = create_client(URL, KEY)

res = supabase.table('orders').select('id, created_at, status, cash_session_id').gte('created_at', '2026-08-17T00:00:00').lte('created_at', '2026-08-18T00:00:00').execute()
print(f"Orders from 17: {len(res.data)}")

sessions = set()
for o in res.data:
    if 'cash_session_id' in o and o['cash_session_id']:
        sessions.add(o['cash_session_id'])

print(f"Distinct cash_session_ids on 17/08: {sessions}")

# also get the last session ID created before 17/08
res3 = supabase.table('cash_sessions').select('id, created_at, status').lte('created_at', '2026-08-18T00:00:00').order('created_at', desc=True).limit(5).execute()
print("Recent sessions:")
for s in res3.data:
    print(s)
