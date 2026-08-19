import json
from supabase import create_client

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
sb = create_client(URL, KEY)

session_14_id = 'f2199359-7926-45bb-8f3f-43a29e10f166'
session_17_id = '2d95db9a-76df-40b3-8279-e16cf02dd93a'

def process_methods(order, methods_list):
    t = order.get('total_pago', 0) or 0
    p_info = order.get('payments_info')
    methods = []
    
    # Priority 0, 1, 2 not strictly needed if payments_info or metodo_pagamento are used, 
    # but let's check payments_info and then fallback
    try:
        obs = json.loads(order.get('observacao') or '{}')
        if 'pays' in obs and isinstance(obs['pays'], list) and len(obs['pays']) > 0:
            for p in obs['pays']:
                methods.append({'tipo': p.get('tipo', ''), 'val': p.get('val', 0)})
        elif 'pagamentos' in obs and isinstance(obs['pagamentos'], list) and len(obs['pagamentos']) > 0:
            for p in obs['pagamentos']:
                methods.append({'tipo': p.get('tipo') or p.get('method', ''), 'val': p.get('val') or p.get('amount', 0), 'code': p.get('code', '')})
    except:
        pass
        
    if not methods and p_info:
        # payments_info
        try:
            if isinstance(p_info, str):
                p_info = json.loads(p_info)
            if isinstance(p_info, list):
                for p in p_info:
                    methods.append({'tipo': p.get('tipo') or p.get('method', ''), 'val': p.get('val') or p.get('amount', 0), 'code': p.get('code', '')})
        except:
            pass
            
    if not methods:
        methods.append({'tipo': order.get('metodo_pagamento') or order.get('pagamento') or 'Dinheiro', 'val': t})
        
    for m in methods:
        methods_list.append(m)

def calc_totals(orders, movements):
    total_vendas = 0
    breakdown = {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': 0}
    
    for o in orders:
        methods = []
        process_methods(o, methods)
        
        for p in methods:
            t = (p.get('tipo') or '').lower()
            c = str(p.get('code', '')).strip()
            v = float(p.get('val', 0) or 0)
            if v <= 0: continue
            
            total_vendas += v
            
            if 'pix' in t or c == '17':
                breakdown['pix'] += v
            elif c == '04' or 'débito' in t or 'debito' in t or t == 'debit' or 'maestro' in t or 'electron' in t:
                breakdown['debito'] += v
            elif c == '03' or 'crédito' in t or 'credito' in t or t == 'credit' or 'cartão' in t or 'cartao' in t or 'master' in t or 'visa' in t or 'elo' in t or 'amex' in t or 'hiper' in t or 'diners' in t:
                breakdown['credito'] += v
            else:
                breakdown['dinheiro'] += v

    total_despesas = sum(m.get('valor', 0) for m in movements)
    
    # round everything
    for k in breakdown: breakdown[k] = round(breakdown[k], 2)
    return {
        'qtdVendas': len(orders),
        'vendasHoje': round(total_vendas, 2),
        'totalDespesas': round(total_despesas, 2),
        'esperadoGaveta': round(breakdown['dinheiro'] - total_despesas, 2),
        'breakdownVendas': breakdown,
        'breakdownDespesas': {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': round(total_despesas, 2)},
        'movements': movements,
        'entradasAnteriores': 0,
        'breakdownAnteriores': {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': 0}
    }

# 1. Fetch data for 14th
r_orders_14 = sb.table('orders').select('id, created_at, total_pago, metodo_pagamento, payments_info, observacao, pagamento, status').eq('session_id', session_14_id).execute()
r_sess_14 = sb.table('cash_sessions').select('*').eq('id', session_14_id).execute()
s_14 = r_sess_14.data[0]
mov_14 = s_14['resumo_vendas'].get('movements', [])
orders_14_filtered = [o for o in r_orders_14.data if o.get('status', '').lower() not in ['cancelado', 'cancelada', 'devolvido', 'devolvida']]
new_resumo_14 = calc_totals(orders_14_filtered, mov_14)

# 2. Fetch data for 17th
r_orders_17 = sb.table('orders').select('id, created_at, total_pago, metodo_pagamento, payments_info, observacao, pagamento, status').eq('session_id', session_17_id).execute()
r_sess_17 = sb.table('cash_sessions').select('*').eq('id', session_17_id).execute()
s_17 = r_sess_17.data[0]
mov_17 = s_17['resumo_vendas'].get('movements', [])
orders_17_filtered = [o for o in r_orders_17.data if o.get('status', '').lower() not in ['cancelado', 'cancelada', 'devolvido', 'devolvida']]
new_resumo_17 = calc_totals(orders_17_filtered, mov_17)

print("NEW 14th Breakdown:", new_resumo_14['breakdownVendas'])
print("NEW 17th Breakdown:", new_resumo_17['breakdownVendas'])

# Ensure sessions object exists inside resumo_vendas
new_resumo_14['sessions'] = s_14['resumo_vendas'].get('sessions', [])
new_resumo_17['sessions'] = s_17['resumo_vendas'].get('sessions', [])

# update db
sb.table('cash_sessions').update({
    'resumo_vendas': new_resumo_14,
    'total_vendas': new_resumo_14['vendasHoje'],
    'valor_fechamento': new_resumo_14['vendasHoje']
}).eq('id', session_14_id).execute()

sb.table('cash_sessions').update({
    'resumo_vendas': new_resumo_17,
    'total_vendas': new_resumo_17['vendasHoje'],
    'valor_fechamento': new_resumo_17['vendasHoje']
}).eq('id', session_17_id).execute()

print("DB Updated.")
