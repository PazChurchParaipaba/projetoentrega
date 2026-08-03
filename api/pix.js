import https from 'https';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; 
const ADMIN_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Validação Inicial das Variáveis de Ambiente
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("CRÍTICO: Variáveis SUPABASE_URL ou SUPABASE_KEY não configuradas na Vercel.");
}

const supabase = createClient(SUPABASE_URL || '', SUPABASE_KEY || '');

async function getTokenForStore(storeId) {
    // 1. Se não tiver ID da loja, tenta usar o Mestre
    if (!storeId) {
        console.log("Aviso: store_id não fornecido. Tentando usar Token Mestre.");
        return ADMIN_ACCESS_TOKEN;
    }

    try {
        // 2. Busca no Supabase
        const { data, error } = await supabase
            .from('stores')
            .select('mp_access_token')
            .eq('id', storeId)
            .single();

        if (error) {
            console.error(`Erro Supabase ao buscar loja ${storeId}:`, error.message);
        }

        // 3. Se achou token válido na loja, usa ele
        if (data && data.mp_access_token && data.mp_access_token.length > 10) {
            return data.mp_access_token;
        }
    } catch (e) {
        console.error("Exceção ao buscar token da loja:", e);
    }

    // 4. Fallback: Se não achou na loja, usa o Mestre
    console.log(`Fallback: Usando Token Mestre para loja ${storeId}`);
    return ADMIN_ACCESS_TOKEN;
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // --- ROTA GET ---
        if (req.method === 'GET') {
            const { id, store_id } = req.query;
            if (!id) return res.status(400).json({ error: 'ID ausente' });

            const tokenToUse = await getTokenForStore(store_id);

            // VALIDAÇÃO DE SEGURANÇA
            if (!tokenToUse || tokenToUse === 'undefined') {
                console.error("ERRO CRÍTICO: Nenhum token encontrado (Nem na loja, nem nas variáveis).");
                return res.status(500).json({ error: 'Erro de Configuração: Token de Pagamento não encontrado no servidor.' });
            }

            const options = {
                hostname: 'api.mercadopago.com',
                path: `/v1/payments/${id}`,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tokenToUse}`, 'Content-Type': 'application/json' }
            };

            return new Promise((resolve) => {
                const mpReq = https.request(options, (mpRes) => {
                    let data = '';
                    mpRes.on('data', c => data += c);
                    mpRes.on('end', () => {
                        const responseBody = JSON.parse(data);
                        // Se o MP retornar erro (ex: 401), repassa o erro
                        if (mpRes.statusCode >= 400) {
                            console.error("Erro MP GET:", responseBody);
                        }
                        res.status(mpRes.statusCode).json(responseBody);
                        resolve();
                    });
                });
                mpReq.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
                mpReq.end();
            });
        }

        // --- ROTA POST ---
        if (req.method === 'POST') {
            const body = req.body;
            if (!body) return res.status(400).json({ error: 'Body vazio' });

            const tokenToUse = await getTokenForStore(body.store_id);

            // VALIDAÇÃO DE SEGURANÇA
            if (!tokenToUse || tokenToUse === 'undefined') {
                console.error("ERRO CRÍTICO: Nenhum token encontrado (Nem na loja, nem nas variáveis).");
                return res.status(500).json({ error: 'Erro de Configuração: Token de Pagamento não encontrado no servidor.' });
            }

            // Tratamento de dados
            const payerEmail = (body.payer?.email && body.payer.email.includes('@')) ? body.payer.email : 'cliente@email.com';
            
            const paymentData = {
                transaction_amount: Number(body.transaction_amount),
                description: body.description || "Pedido Loja",
                payment_method_id: "pix",
                payer: {
                    email: payerEmail,
                    first_name: body.payer?.first_name || "Cliente",
                    identification: body.payer?.identification || { type: "CPF", number: "19119119100" }
                },
                notification_url: body.notification_url
            };

            const postData = JSON.stringify(paymentData);

            const options = {
                hostname: 'api.mercadopago.com',
                path: '/v1/payments',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${tokenToUse}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': `pix-${Date.now()}`,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            return new Promise((resolve) => {
                const mpReq = https.request(options, (mpRes) => {
                    let data = '';
                    mpRes.on('data', c => data += c);
                    mpRes.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (mpRes.statusCode >= 400) {
                                console.error("Erro MP POST:", json); // Isso vai aparecer nos logs da Vercel
                            }
                            res.status(mpRes.statusCode).json(json);
                        } catch(err) {
                            res.status(502).json({ error: "Erro ao ler resposta do MP", raw: data });
                        }
                        resolve();
                    });
                });
                mpReq.on('error', e => { res.status(500).json({ error: e.message }); resolve(); });
                mpReq.write(postData);
                mpReq.end();
            });
        }

        return res.status(405).json({ error: 'Método não permitido' });

    } catch (error) {
        console.error("Erro Geral API:", error);
        return res.status(500).json({ error: error.message });
    }
}
