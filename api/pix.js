const https = require('https');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // 1. CONFIGURAÇÃO DE CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. CONFIGURAÇÃO SUPABASE
  const SUPABASE_URL = 'https://groezaseypdbpgymgpvo.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM';
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // TOKEN DO ADMIN (Fallback)
  const ADMIN_ACCESS_TOKEN = 'APP_USR-4811109354191042-122312-d9323febd00986d976ec4db04c6fc013-3082316443'; 

  // Função para pegar o token da loja
  async function getTokenForStore(storeId) {
      if (!storeId) return ADMIN_ACCESS_TOKEN;
      try {
          const { data, error } = await supabase
              .from('stores')
              .select('mp_access_token')
              .eq('id', storeId)
              .single();
          
          if (!error && data && data.mp_access_token) {
              return data.mp_access_token;
          }
      } catch (e) {
          console.error("Erro ao buscar token da loja:", e);
      }
      return ADMIN_ACCESS_TOKEN;
  }

  // --- ROTA GET: CONSULTA DE STATUS ---
  if (req.method === 'GET') {
    const { id, store_id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID necessário' });

    try {
        const tokenToUse = await getTokenForStore(store_id);
        
        const options = {
            hostname: 'api.mercadopago.com',
            path: `/v1/payments/${id}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${tokenToUse}`,
                'Content-Type': 'application/json'
            }
        };

        const responseData = await new Promise((resolve, reject) => {
            const mpReq = https.request(options, (mpRes) => {
                let data = '';
                mpRes.on('data', (c) => data += c);
                mpRes.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve({ status: 'error', detail: 'Invalid JSON from MP' });
                    }
                });
            });
            mpReq.on('error', (e) => reject(e));
            mpReq.end();
        });

        return res.status(200).json({ 
            status: responseData.status, 
            status_detail: responseData.status_detail, 
            id: responseData.id 
        });

    } catch (e) {
        return res.status(500).json({ error: 'Erro de comunicação com MP', details: e.message });
    }
  }

  // --- ROTA POST: CRIAÇÃO DE PAGAMENTO ---
  if (req.method === 'POST') {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Dados vazios' });

    try {
        const tokenToUse = await getTokenForStore(body.store_id);

        let docType = 'CPF';
        let docNumber = '';
        if (body.payer && body.payer.identification) {
            docType = body.payer.identification.type || 'CPF';
            if (body.payer.identification.number) {
                docNumber = body.payer.identification.number.replace(/\D/g, ''); 
            }
        }
        const entityType = (docType === 'CNPJ') ? 'association' : 'individual';
        const payerEmail = (body.payer && body.payer.email) ? body.payer.email : 'cliente@nexlog.com';

        const paymentData = {
            transaction_amount: Number(body.transaction_amount),
            token: body.token,
            description: "Pedido via NexLog",
            installments: Number(body.installments || 1),
            payment_method_id: body.payment_method_id,
            issuer_id: body.issuer_id,
            payer: {
                email: payerEmail,
                entity_type: entityType,
                type: 'customer',
                identification: { type: docType, number: docNumber }
            },
            capture: true,
            binary_mode: false,
            statement_descriptor: "NEXLOG"
        };

        const postData = JSON.stringify(paymentData);

        const options = {
            hostname: 'api.mercadopago.com',
            path: '/v1/payments',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenToUse}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': Date.now().toString(),
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const responseData = await new Promise((resolve, reject) => {
            const mpReq = https.request(options, (mpRes) => {
                let data = '';
                mpRes.on('data', (c) => data += c);
                mpRes.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve({ status: mpRes.statusCode, body: json });
                    } catch (err) {
                        // Se o MP retornar HTML de erro (503/504), captura aqui
                        resolve({ status: 502, body: { error: "Bad Gateway / Invalid JSON from MP", raw: data } });
                    }
                });
            });
            mpReq.on('error', (e) => reject(e));
            mpReq.write(postData);
            mpReq.end();
        });

        if (responseData.status >= 200 && responseData.status < 300) {
            return res.status(200).json(responseData.body);
        } else {
            console.error("Erro MP:", responseData.body);
            return res.status(responseData.status).json(responseData.body);
        }

    } catch (e) {
        return res.status(500).json({ error: 'Erro interno no servidor', details: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
