const https = require('https');

export default async function handler(req, res) {
  // 1. Configuração de CORS (Permite acesso do seu site)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  // CREDENCIAIS DE PRODUÇÃO
  const ACCESS_TOKEN = 'APP_USR-1174857331903554-122013-4081678527cfa85bbe7a6d6a5a262861-3082316443';

  // --- ROTA GET: VERIFICAÇÃO DE STATUS (POLLING AUTOMÁTICO) ---
  if (req.method === 'GET') {
    const { id } = req.query;
    
    if (!id) return res.status(400).json({ error: 'ID do pagamento necessário' });

    const options = {
      hostname: 'api.mercadopago.com',
      path: `/v1/payments/${id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const mpReq = https.request(options, (mpRes) => {
        let data = '';
        mpRes.on('data', (chunk) => { data += chunk; });
        mpRes.on('end', () => {
          try {
            const json = JSON.parse(data);
            // Retorna apenas o que interessa: status
            res.status(200).json({ 
                id: json.id,
                status: json.status, 
                status_detail: json.status_detail 
            });
            resolve();
          } catch (e) {
            res.status(500).json({ error: 'Erro ao consultar MP' });
            resolve();
          }
        });
      });
      mpReq.on('error', (e) => {
        res.status(500).json({ error: 'Erro de conexão no backend' });
        resolve();
      });
      mpReq.end();
    });
  }

  // --- ROTA POST: CRIAR PAGAMENTO ---
  if (req.method === 'POST') {
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Nenhum dado recebido.' });

    // Tratamento CPF/CNPJ
    let docType = 'CPF';
    let docNumber = '';
    
    if (body.payer && body.payer.identification) {
        docType = body.payer.identification.type || 'CPF';
        if (body.payer.identification.number) {
            docNumber = body.payer.identification.number.replace(/\D/g, '');
        }
    }

    // Define 'association' para CNPJ e 'individual' para CPF
    const entityType = (docType === 'CNPJ') ? 'association' : 'individual';
    const payerEmail = (body.payer && body.payer.email) ? body.payer.email : 'cliente@nexlog.com';

    const paymentData = {
      transaction_amount: Number(body.transaction_amount),
      token: body.token,
      description: "Serviço NexLog",
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
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': Date.now().toString(),
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const mpReq = https.request(options, (mpRes) => {
        let data = '';
        mpRes.on('data', (chunk) => { data += chunk; });
        mpRes.on('end', () => {
          try {
            const jsonResponse = JSON.parse(data);
            
            if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
              res.status(200).json(jsonResponse);
            } else {
              console.error("Erro MP:", jsonResponse); 
              res.status(mpRes.statusCode).json(jsonResponse);
            }
            resolve();
          } catch (e) {
            res.status(500).json({ error: 'Erro interno JSON', details: data });
            resolve();
          }
        });
      });

      mpReq.on('error', (e) => {
        res.status(500).json({ error: 'Erro de conexão HTTPS', details: e.message });
        resolve();
      });

      mpReq.write(postData);
      mpReq.end();
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
