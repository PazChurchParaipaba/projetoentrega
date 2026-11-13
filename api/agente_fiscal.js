// ============================================================================
// 🤖 AGENTE FISCAL — roda sozinho (Supabase pg_cron → esta rota a cada 2 min)
//   1) Emite NFC-e de toda venda concluída com Cartão/Pix (inclusive misturada
//      com dinheiro) que ficou sem nota/XML.
//   2) Cancela na SEFAZ a NFC-e de toda venda estornada/reaberta/cancelada.
// Segurança: exige header  x-agent-secret  == env AGENT_SECRET (se definida).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import { cancelarNfceDoPedido } from './_fiscal_cancel.js';

const MAX_POR_EXECUCAO = 6;
const ORCAMENTO_MS = 45000;
const MAX_TENTATIVAS = 8;
const DIAS_EMISSAO = 4;
const DIAS_CANCELAMENTO = 30;

const precisaSefaz = (o) => {
    if (!(parseFloat(o.total_pago) > 0)) return false;
    let pags = [];
    try {
        const clean = String(o.observacao || '').replace(/\s*\[(?:ESTORNADA|CANCELAD[OA]|REABERTA).*$/i, '').trim();
        if (clean.startsWith('{')) { const j = JSON.parse(clean); if (Array.isArray(j.pagamentos)) pags = j.pagamentos; }
    } catch (e) {}
    if (!pags.length && o.payments_info) {
        try { pags = typeof o.payments_info === 'string' ? JSON.parse(o.payments_info) : o.payments_info; } catch (e) {}
    }
    pags = (Array.isArray(pags) ? pags : []).filter(p => p && !p._order_id);
    if (!pags.length) pags = [{ method: o.metodo_pagamento }];
    return pags.some(p => {
        const m = String(p.method || p.tipo || '').toLowerCase();
        const c = String(p.code || '');
        return m.includes('pix') || m.includes('cred') || m.includes('créd') || m.includes('deb') || m.includes('déb') ||
            m.includes('cart') || ['03', '04', '17'].includes(c);
    });
};

async function carregarEstado(supabase, storeId, cache) {
    if (cache[storeId]) return cache[storeId];
    let estado = {};
    try {
        const { data } = await supabase.from('store_settings').select('setting_value')
            .eq('store_id', storeId).eq('setting_key', 'fiscal_agent_state').maybeSingle();
        if (data && data.setting_value) estado = JSON.parse(data.setting_value);
    } catch (e) {}
    cache[storeId] = { dados: estado, sujo: false };
    return cache[storeId];
}

async function salvarEstados(supabase, cache) {
    for (const [storeId, e] of Object.entries(cache)) {
        if (!e.sujo) continue;
        // Mantém só entradas recentes
        const corte = Date.now() - 40 * 86400000;
        for (const k of Object.keys(e.dados)) if ((e.dados[k].t || 0) < corte) delete e.dados[k];
        try {
            await supabase.from('store_settings').upsert({
                store_id: storeId, setting_key: 'fiscal_agent_state', setting_value: JSON.stringify(e.dados)
            }, { onConflict: 'store_id, setting_key' });
        } catch (err) {}
    }
}

export default async function handler(req, res) {
    const segredo = process.env.AGENT_SECRET;
    if (segredo && req.headers['x-agent-secret'] !== segredo) {
        return res.status(401).json({ error: 'não autorizado' });
    }

    const inicio = Date.now();
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const origem = `https://${req.headers.host}`;
    const cache = {};
    const rel = { cancelamentos_ok: 0, cancelamentos_falha: 0, emitidas_ok: 0, emitidas_falha: 0, ignoradas_limite: 0, autorizadas_sem_xml: 0, detalhes: [] };

    try {
        const agora = Date.now();

        // ---------- 1) CANCELAMENTOS (venda cancelada, nota ainda autorizada) ----------
        const desdeCanc = new Date(agora - DIAS_CANCELAMENTO * 86400000).toISOString();
        const { data: aCancelar } = await supabase.from('orders')
            .select('id, store_id, total_pago')
            .in('status', ['cancelado', 'cancelada', 'estornado'])
            .eq('status_sefaz', 'autorizado')
            .gte('created_at', desdeCanc)
            .order('created_at', { ascending: true })
            .limit(50);

        for (const o of (aCancelar || [])) {
            if (Date.now() - inicio > ORCAMENTO_MS) { rel.ignoradas_limite++; continue; }
            const est = await carregarEstado(supabase, o.store_id, cache);
            const chave = 'c:' + o.id;
            const reg = est.dados[chave] || { n: 0 };
            if (reg.n >= MAX_TENTATIVAS) continue;
            const r = await cancelarNfceDoPedido(supabase, o.id, 'Venda estornada/reaberta no PDV - cancelamento automatico');
            if (r.ok) { rel.cancelamentos_ok++; delete est.dados[chave]; }
            else { rel.cancelamentos_falha++; reg.n++; reg.t = Date.now(); reg.msg = r.mensagem; est.dados[chave] = reg; rel.detalhes.push(`cancelar ${o.id.slice(0, 8)}: ${r.mensagem}`); }
            est.sujo = true;
        }

        // ---------- 2) EMISSÕES PENDENTES ----------
        const desde = new Date(agora - DIAS_EMISSAO * 86400000).toISOString();
        const ate = new Date(agora - 3 * 60000).toISOString(); // dá 3 min para a tela emitir sozinha
        const { data: cand } = await supabase.from('orders')
            .select('id, store_id, status, status_sefaz, chave_acesso, total_pago, metodo_pagamento, observacao, payments_info, created_at')
            .eq('status', 'concluido')
            .is('xml_arquivo', null)
            .is('xml_autorizado', null)
            .gte('created_at', desde)
            .lte('created_at', ate)
            .order('created_at', { ascending: true })
            .limit(300);

        let processadas = 0;
        for (const o of (cand || [])) {
            const sf = String(o.status_sefaz || '').toLowerCase();
            if (sf === 'cancelado') continue;
            if (!precisaSefaz(o)) continue;
            // Já autorizada na SEFAZ (tem chave) mas sem XML salvo: NÃO reemite (evita nota duplicada)
            if (sf === 'autorizado' && o.chave_acesso) { rel.autorizadas_sem_xml++; continue; }
            if (processadas >= MAX_POR_EXECUCAO || Date.now() - inicio > ORCAMENTO_MS) { rel.ignoradas_limite++; continue; }

            const est = await carregarEstado(supabase, o.store_id, cache);
            const chave = 'e:' + o.id;
            const reg = est.dados[chave] || { n: 0 };
            if (reg.n >= MAX_TENTATIVAS) continue;

            processadas++;
            let ok = false, msg = '';
            try {
                const r = await fetch(`${origem}/api/emitir_fiscal`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: o.id, store_id: o.store_id, modelo: 65 })
                });
                const j = await r.json().catch(() => ({}));
                ok = !!(j && (j.sucesso || j.status === 'autorizado'));
                msg = j.message || j.error || j.motivo_sefaz || '';
            } catch (e) { msg = e.message; }

            if (ok) { rel.emitidas_ok++; delete est.dados[chave]; }
            else { rel.emitidas_falha++; reg.n++; reg.t = Date.now(); reg.msg = String(msg).substring(0, 200); est.dados[chave] = reg; rel.detalhes.push(`emitir ${o.id.slice(0, 8)} (tent. ${reg.n}): ${reg.msg}`); }
            est.sujo = true;
        }

        await salvarEstados(supabase, cache);
        return res.status(200).json({ sucesso: true, ms: Date.now() - inicio, ...rel });
    } catch (e) {
        return res.status(500).json({ sucesso: false, error: e.message, ...rel });
    }
}
