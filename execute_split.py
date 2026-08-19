import json
import uuid
from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
sb = create_client(URL, KEY)

with open('split_plan.json', 'r') as f:
    plan = json.load(f)

session_14_id = 'f2199359-7926-45bb-8f3f-43a29e10f166'
session_17_id = str(uuid.uuid4())

print(f"New session ID for 17/08: {session_17_id}")

# 1. Prepare and insert new session
new_session = plan['session_17_new']
new_session['id'] = session_17_id
# Ensure 'resumo_vendas' contains the updated nested session id
if 'sessions' in new_session['resumo_vendas']:
    for s in new_session['resumo_vendas']['sessions']:
        s['id'] = session_17_id
else:
    # Just to be safe, add it as the structure expects
    new_session['resumo_vendas']['sessions'] = [
        {
            'id': session_17_id,
            'nome': new_session['nome'],
            'status': new_session['status'],
            'user_id': new_session['user_id'],
            'abertura': new_session['abertura'],
            'store_id': new_session['store_id'],
            'created_at': new_session['created_at'],
            'fechamento': new_session['fechamento'],
            'updated_at': new_session['updated_at'],
            'total_vendas': new_session['total_vendas'],
            'valor_inicial': new_session['valor_inicial'],
            'total_despesas': new_session['total_despesas'],
            'valor_fechamento': new_session['valor_fechamento']
        }
    ]

# update movements session_id
for m in new_session['resumo_vendas'].get('movements', []):
    m['session_id'] = session_17_id

print("Inserting new session for 17/08...")
res_insert = sb.table('cash_sessions').insert(new_session).execute()
print("Insert OK.")

# 2. Update orders
orders_to_update = plan['orders_to_update']
print(f"Updating {len(orders_to_update)} orders to new session_id...")
# Supabase update with in() might have limits, so batch it or do it one by one
for o_id in orders_to_update:
    sb.table('orders').update({'session_id': session_17_id}).eq('id', o_id).execute()
print("Orders updated.")

# 3. Update original session (14/08)
session_14_updates = plan['session_14_updates']
# update movements inside resumo_vendas for 14/08 just to be sure
for m in session_14_updates['resumo_vendas'].get('movements', []):
    m['session_id'] = session_14_id

print("Updating original session for 14/08...")
sb.table('cash_sessions').update(session_14_updates).eq('id', session_14_id).execute()
print("Update OK.")

print("\nSplit completed successfully.")
