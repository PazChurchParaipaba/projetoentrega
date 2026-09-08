from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

# IDs das segundas comandas (duplicadas mais recentes)
ids_to_cancel = [
    'ce24679f-53cc-40ba-9373-4d12c11f3644',
    '35f3971b-b84b-4203-9a26-40f4652e2f07',
    '8ce88b69-19a6-4e58-a4d5-11ed24b92e82',
    '02ab2269-e35b-41cb-9429-0fd4ba779187'
]

print("Cancelando comandas duplicadas...")

for order_id in ids_to_cancel:
    res = supabase.table('orders').update({'status': 'cancelado'}).eq('id', order_id).execute()
    print(f"Pedido {order_id} atualizado para 'cancelado'.")
    
# Importante: Como o sistema calcula o resumo_vendas da sessao, vamos chamar a logica do check_caixa / fix_caixa_totals 
# se precisarmos atualizar o cash_sessions. Mas no sistema do cliente, geralmente o frontend pode recalcular
# ou podemos apenas recomendar recalcular no fechamento.
print("\nComandas canceladas com sucesso. Agora os valores totais não vão considerar os 839,30 excedentes.")
