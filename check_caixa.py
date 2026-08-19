from supabase import create_client
import sys

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"

supabase = create_client(URL, KEY)

# Get cash sessions from recent days
res = supabase.table('cash_sessions').select('*').order('created_at', desc=True).limit(20).execute()
for session in res.data:
    print(f"ID: {session.get('id')} | Store: {session.get('store_id')} | Status: {session.get('status')} | Created: {session.get('created_at')} | Closed: {session.get('closed_at')}")
