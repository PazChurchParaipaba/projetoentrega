import { createClient } from '@supabase/supabase-js';
import { cancelarNfceDoPedido } from './_fiscal_cancel.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const { order_id, motivo } = body;
        if (!order_id) return res.status(400).json({ sucesso: false, error: 'order_id ausente.' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        const r = await cancelarNfceDoPedido(supabase, order_id, motivo);
        return res.status(200).json({ sucesso: r.ok, ...r });
    } catch (e) {
        return res.status(500).json({ sucesso: false, error: e.message });
    }
}
