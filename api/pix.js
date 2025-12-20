const https = require('https');

export default async function handler(req, res) {
  // 1. Configuração de CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Nenhum dado recebido.' });

  // SEU ACCESS TOKEN DE TESTE
  const ACCESS_TOKEN = 'TEST-1174857331903554-122013-f01b6851dd5d57f3b197bf4f7a5384e3-3082316443';

  // 2. Prepara os dados
  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token, // O token do cartão (crédito ou débito)
    description: body.description,
    installments: Number(body.installments),
    payment_method_id: body.payment_method_id, // Ex: 'debvisa', 'debmaster', 'pix', etc.
    issuer_id: body.issuer_id, // Banco emissor
    payer: {
      email: body.payer.email,
      // OBRIGATÓRIO PARA DÉBITO E CRÉDITO:
      entity_type: 'individual', 
      type: 'customer',
      identification: body.payer.identification
    },
    // Garante captura automática (essencial para débito)
    capture: true,
    binary_mode: false 
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

  // 3. Envia para o Mercado Pago
  return new Promise((resolve, reject) => {
    const mpReq = https.request(options, (mpRes) => {
      let data = '';
      mpRes.on('data', (chunk) => { data += chunk; });
      mpRes.on('end', () => {
        try {
          const jsonResponse = JSON.parse(data);
          
          // Status 200 ou 201 significa que o pedido foi criado no MP
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            res.status(200).json(jsonResponse);
            resolve();
          } else {
            console.error("Erro MP:", jsonResponse); 
            res.status(mpRes.statusCode).json(jsonResponse);
            resolve();
          }
        } catch (e) {
          res.status(500).json({ error: 'Erro ao processar resposta do MP', details: data });
          resolve();
        }
      });
    });

    mpReq.on('error', (e) => {
      console.error(e);
      res.status(500).json({ error: 'Erro de conexão', details: e.message });
      resolve();
    });

    mpReq.write(postData);
    mpReq.end();
  });
}
