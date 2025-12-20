const https = require('https');

export default async function handler(req, res) {
  // Configuração CORS para aceitar requisições do seu Front
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Em produção, troque '*' pelo seu domínio Vercel
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Nenhum dado recebido.' });

  // SEU ACCESS TOKEN (Use o de Produção ou Teste conforme o ambiente)
  const ACCESS_TOKEN = 'TEST-1174857331903554-122013-f01b6851dd5d57f3b197bf4f7a5384e3-3082316443';

  // Tratamento básico de CPF para enviar limpo ao MP
  const cleanCPF = body.payer.identification.number ? body.payer.identification.number.replace(/\D/g, '') : '';

  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token,
    description: "Pedido LogiMoveis",
    installments: Number(body.installments),
    payment_method_id: body.payment_method_id,
    issuer_id: body.issuer_id,
    payer: {
      email: body.payer.email,
      entity_type: 'individual',
      type: 'customer',
      identification: {
        type: body.payer.identification.type,
        number: cleanCPF
      }
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
          res.status(500).json({ error: 'Erro no parse do JSON MP', details: data });
          resolve();
        }
      });
    });

    mpReq.on('error', (e) => {
      console.error(e);
      res.status(500).json({ error: 'Erro de conexão com Mercado Pago' });
      resolve();
    });

    mpReq.write(postData);
    mpReq.end();
  });
}
