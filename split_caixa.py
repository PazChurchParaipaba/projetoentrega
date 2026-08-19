import json
from datetime import datetime

with open('research_output.json', 'r') as f:
    data = json.load(f)

session = data['session']
orders = data['orders']
movements = session['resumo_vendas'].get('movements', [])

# 1. Split orders
orders_14 = []
orders_17 = []
for o in orders:
    date_str = o['created_at'][:10]
    if date_str in ['2026-08-14', '2026-08-15']:
        orders_14.append(o)
    elif date_str in ['2026-08-17', '2026-08-18']:
        orders_17.append(o)

# 2. Split movements (despesas)
movs_14 = []
movs_17 = []
for m in movements:
    date_str = m['created_at'][:10]
    if date_str in ['2026-08-14', '2026-08-15']:
        movs_14.append(m)
    elif date_str in ['2026-08-17', '2026-08-18']:
        movs_17.append(m)

def calc_totals(order_list, mov_list):
    total_vendas = 0
    breakdown_vendas = {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': 0}
    for o in order_list:
        val = o.get('total_pago', 0) or 0
        total_vendas += val
        
        # handle payments_info if exists, else metodo_pagamento
        p_info = o.get('payments_info')
        if p_info:
            for p in p_info:
                method = p.get('method', '').lower()
                amount = p.get('amount', 0)
                if 'pix' in method: breakdown_vendas['pix'] += amount
                elif 'debito' in method: breakdown_vendas['debito'] += amount
                elif 'credito' in method: breakdown_vendas['credito'] += amount
                elif 'dinheiro' in method: breakdown_vendas['dinheiro'] += amount
        else:
            method = o.get('metodo_pagamento', '').lower()
            if 'pix' in method: breakdown_vendas['pix'] += val
            elif 'debito' in method: breakdown_vendas['debito'] += val
            elif 'credito' in method: breakdown_vendas['credito'] += val
            elif 'dinheiro' in method: breakdown_vendas['dinheiro'] += val

    total_despesas = sum(m.get('valor', 0) for m in mov_list)
    breakdown_despesas = {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': total_despesas} # assuming all in dinheiro
    
    # fix floating point
    for k in breakdown_vendas: breakdown_vendas[k] = round(breakdown_vendas[k], 2)
    return {
        'qtdVendas': len(order_list),
        'vendasHoje': round(total_vendas, 2),
        'totalDespesas': round(total_despesas, 2),
        'esperadoGaveta': round(breakdown_vendas['dinheiro'] - total_despesas, 2),
        'breakdownVendas': breakdown_vendas,
        'breakdownDespesas': breakdown_despesas,
        'movements': mov_list,
        'entradasAnteriores': 0,
        'breakdownAnteriores': {'pix': 0, 'debito': 0, 'credito': 0, 'dinheiro': 0}
    }

resumo_14 = calc_totals(orders_14, movs_14)
resumo_17 = calc_totals(orders_17, movs_17)

print("=== CAIXA 14/08 ===")
print(f"Vendas: {resumo_14['qtdVendas']} - Total: {resumo_14['vendasHoje']} - Despesas: {resumo_14['totalDespesas']}")

print("\n=== CAIXA 17/08 ===")
print(f"Vendas: {resumo_17['qtdVendas']} - Total: {resumo_17['vendasHoje']} - Despesas: {resumo_17['totalDespesas']}")

# Determine closing time for 14th
fechamento_14 = '2026-08-14T23:59:59+00:00'
abertura_17 = '2026-08-17T09:00:00+00:00'
fechamento_17 = session['fechamento']

with open('split_plan.json', 'w') as f:
    json.dump({
        'session_14_updates': {
            'resumo_vendas': resumo_14,
            'total_vendas': resumo_14['vendasHoje'],
            'total_despesas': resumo_14['totalDespesas'],
            'valor_fechamento': resumo_14['vendasHoje'],
            'fechamento': fechamento_14
        },
        'session_17_new': {
            'store_id': session['store_id'],
            'user_id': session['user_id'],
            'nome': session['nome'] + ' (17/08)',
            'abertura': abertura_17,
            'fechamento': fechamento_17,
            'status': 'fechado',
            'created_at': abertura_17,
            'updated_at': fechamento_17,
            'resumo_vendas': resumo_17,
            'total_vendas': resumo_17['vendasHoje'],
            'total_despesas': resumo_17['totalDespesas'],
            'valor_fechamento': resumo_17['vendasHoje'],
            'valor_inicial': session['valor_inicial'], # maybe needs to be different?
            'diferenca': resumo_17['esperadoGaveta'] - resumo_17['esperadoGaveta'] # let's just leave 0 or use the reported um?
        },
        'orders_to_update': [o['id'] for o in orders_17]
    }, f, indent=2)

print("\nSaved split_plan.json")
