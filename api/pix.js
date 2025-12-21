const https = require('https');
const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
  // 1. CONFIGURAÇÃO DE CORS (Permite que seu site acesse este backend)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // --- CONFIGURAÇÃO DO SUPABASE (Necessário para buscar o token da loja) ---
  const SUPABASE_URL = 'https://groezaseypdbpgymgpvo.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM';
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // SEU TOKEN DE ADMIN (Fallback: Usado se a loja não tiver configurado o dela)
  const ADMIN_ACCESS_TOKEN = 'APP_USR-834374cc-7e6d-494f-9842-49a7e3e57357'; 

  // =================================================================
  // FUNÇÃO AUXILIAR: DESCOBRIR QUAL TOKEN USAR
  // =================================================================
  async function getTokenForStore(storeId) {
      if (!storeId) return ADMIN_ACCESS_TOKEN;

      const { data, error } = await supabase
          .from('stores')
          .select('mp_access_token')
          .eq('id', storeId)
          .single();

      if (!error && data && data.mp_access_token) {
          console.log(`Usando credenciais da Loja: ${storeId}`);
          return data.mp_access_token;
      }
      
      console.log("Usando credenciais do Admin (Loja sem token)");
      return ADMIN_ACCESS_TOKEN;
  }

  // =================================================================
  // ROTA GET: VERIFICAÇÃO DE STATUS (POLLING AUTOMÁTICO)
  // =================================================================
  if (req.method === 'GET') {
    const { id, store_id } = req.query; // Recebe o store_id para saber ONDE consultar
    
    if (!id) return res.status(400).json({ error: 'ID necessário' });

    // Busca o token correto para fazer a consulta
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

    return new Promise((resolve, reject) => {
      const mpReq = https.request(options, (mpRes) => {
        let data = '';
        mpRes.on('data', (c) => data += c);
        mpRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                // Retorna o status para o Frontend saber se aprova
                res.status(200).json({ 
                    status: json.status, 
                    status_detail: json.status_detail, 
                    id: json.id 
                });
                resolve();
            } catch(e) { 
                res.status(500).json({error: 'Erro ao consultar MP'}); 
                resolve(); 
            }
        });
      });
      mpReq.on('error', () => { res.status(500).json({error: 'Erro Conexão'}); resolve(); });
      mpReq.end();
    });
  }

  // =================================================================
  // ROTA POST: CRIAR O PAGAMENTO (PROCESSAMENTO)
  // =================================================================
  if (req.method === 'POST') {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Dados vazios' });

    // 1. Define qual Token usar (Loja ou Admin)
    const tokenToUse = await getTokenForStore(body.store_id);

    // 2. Tratamento de Documento (CPF/CNPJ)
    let docType = 'CPF';
    let docNumber = '';
    
    if (body.payer && body.payer.identification) {
        docType = body.payer.identification.type || 'CPF';
        if (body.payer.identification.number) {
            docNumber = body.payer.identification.number.replace(/\D/g, ''); 
        }
    }

    // Se for CNPJ, envia 'association', senão 'individual'
    const entityType = (docType === 'CNPJ') ? 'association' : 'individual';
    const payerEmail = (body.payer && body.payer.email) ? body.payer.email : 'cliente@nexlog.com';

    // 3. Monta o Objeto de Pagamento
    const paymentData = {
      transaction_amount: Number(body.transaction_amount),
      token: body.token,
      description: "Pedido via NexLog",
      installments: Number(body.installments),
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
        'Authorization': `Bearer ${tokenToUse}`, // AQUI ESTÁ A MÁGICA
        'Content-Type': 'application/json',
        'X-Idempotency-Key': Date.now().toString(),
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    // 4. Envia para o Mercado Pago
    return new Promise((resolve, reject) => {
      const mpReq = https.request(options, (mpRes) => {
        let data = '';
        mpRes.on('data', (c) => data += c);
        mpRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                
                // Log para debug (opcional)
                if (json.status) console.log(`Status Pagamento: ${json.status}`);

                if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
                    res.status(200).json(json);
                } else {
                    console.error("Erro MP:", json);
                    res.status(mpRes.statusCode).json(json);
                }
                resolve();
            } catch (e) {
                res.status(500).json({ error: 'Erro interno', details: data });
                resolve();
            }
        });
      });

      mpReq.on('error', (e) => {
        res.status(500).json({ error: 'Erro HTTPS', details: e.message });
        resolve();
      });

      mpReq.write(postData);
      mpReq.end();
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
