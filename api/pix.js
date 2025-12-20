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

  // 2. Prepara os dados para enviar ao Mercado Pago
  // O frontend (Brick) já manda a estrutura quase pronta, só precisamos adicionar o Payer se faltar
  // e garantir que o transaction_amount seja número.
  
  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token, // Token do cartão (se houver)
    description: body.description,
    installments: Number(body.installments), // Parcelas
    payment_method_id: body.payment_method_id, // "pix", "bolbradesco", "master", etc
    issuer_id: body.issuer_id, // Banco emissor
    payer: {
      email: body.payer.email,
      identification: body.payer.identification
    }
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
          // Retorna o status que o MP devolveu (201 criado, 400 erro, etc)
          res.status(mpRes.statusCode).json(jsonResponse);
          resolve();
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
