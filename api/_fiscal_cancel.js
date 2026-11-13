// ============================================================================
// 🛡️ CANCELAMENTO DE NFC-e NA SEFAZ (via Geranet)
// Módulo compartilhado (prefixo "_" = não vira rota na Vercel).
// Usado por /api/cancelar_fiscal (botão/reabertura) e /api/agente_fiscal (robô).
// ============================================================================

const GERANET_BASE = process.env.GERANET_BASE_URL || 'https://nfe.geranet.net/api/v1/nfe';

function apiKey() {
    return process.env.GERANET_API_KEY || 'gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg';
}

async function postGeranet(path, payload) {
    const res = await fetch(`${GERANET_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { mensagem: text.substring(0, 300) }; }
    return { status: res.status, data };
}

// Cancela a NFC-e de um pedido. Retorna { ok, jaCancelada, mensagem }.
export async function cancelarNfceDoPedido(supabase, orderId, motivo) {
    const justificativa = String(motivo || 'Venda estornada ou comanda reaberta no PDV').trim().padEnd(15, '.').substring(0, 255);

    const { data: order, error: oErr } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (oErr || !order) return { ok: false, mensagem: 'Pedido não encontrado.' };

    const st = String(order.status_sefaz || '').toLowerCase();
    if (st === 'cancelado') return { ok: true, jaCancelada: true, mensagem: 'Nota já cancelada.' };
    if (st !== 'autorizado' || !order.chave_acesso) {
        return { ok: true, semNota: true, mensagem: 'Pedido sem NFC-e autorizada. Nada a cancelar.' };
    }

    const { data: store } = await supabase.from('stores').select('*').eq('id', order.store_id).single();
    if (!store || !store.certificado_hex || !store.senha_certificado) {
        return { ok: false, mensagem: 'Certificado digital da loja não encontrado.' };
    }

    const uf = String(store.uf || store.estado || 'CE').replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 2) || 'CE';
    const ambiente = String(store.ambiente_emissao === 1 ? 1 : 2);
    const base = {
        acao: 'cancelar',
        modeloDocumento: 'nfe',
        certificadoDigital: store.certificado_hex,
        senhaCertificadoDigital: store.senha_certificado,
        ambiente,
        modelo: '65',
        ufEmitente: uf,
        cnpj: String(store.cnpj || '').replace(/\D/g, ''),
        chave: order.chave_acesso,
        chaveAcesso: order.chave_acesso,
        idNota: order.id_nuvem || '',
        justificativa,
        motivo: justificativa
    };

    // Tenta as rotas conhecidas do padrão Geranet até uma responder com sucesso.
    const tentativas = [['/cancelar', base], ['/emitir', base]];
    let ultimo = null;
    for (const [path, body] of tentativas) {
        try {
            const r = await postGeranet(path, body);
            ultimo = r;
            const ok = r.status < 400 && r.data && r.data.sucesso !== false;
            if (ok) {
                await supabase.from('orders').update({
                    status_sefaz: 'cancelado',
                    motivo_cancelamento: justificativa,
                    motivo_sefaz: String(r.data.mensagem || 'NFC-e cancelada na SEFAZ').substring(0, 500)
                }).eq('id', orderId);
                return { ok: true, mensagem: 'NFC-e cancelada na SEFAZ.' };
            }
            const msg = JSON.stringify(r.data).toLowerCase();
            // Já cancelada / evento já registrado (135, 573, 217) → considera resolvido
            if (msg.includes('ja cancelad') || msg.includes('já cancelad') || msg.includes('573') || msg.includes('cancelamento de nfe homologado')) {
                await supabase.from('orders').update({ status_sefaz: 'cancelado', motivo_cancelamento: justificativa }).eq('id', orderId);
                return { ok: true, jaCancelada: true, mensagem: 'Nota já constava cancelada na SEFAZ.' };
            }
        } catch (e) {
            ultimo = { status: 0, data: { mensagem: e.message } };
        }
    }

    const erro = (ultimo && ultimo.data && (ultimo.data.mensagem || JSON.stringify(ultimo.data))) || 'Falha desconhecida';
    return { ok: false, mensagem: String(erro).substring(0, 400) };
}
