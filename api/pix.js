const https = require('https');

export default async function handler(req, res) {
  // 1. Configuração de CORS (Permite que seu site acesse este backend)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde ao "preflight" do navegador
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Se não for POST, recusa
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Garante que o corpo da requisição existe
  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Nenhum dado recebido.' });
  }

  const { transaction_amount, description, email } = body;
  
  // SEU TOKEN DE TESTE (Atualizado)
  const ACCESS_TOKEN = 'TEST-1174857331903554-122013-f01b6851dd5d57f3b197bf4f7a5384e3-3082316443';

  // 3. Monta os dados para o Mercado Pago
  const postData = JSON.stringify({
    transaction_amount,
    description,
    payment_method_id: 'pix',
    payer: { email }
  });

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

  // 4. Executa a requisição usando HTTPS nativo (Compatível com qualquer Node.js)
  return new Promise((resolve, reject) => {
    const mpReq = https.request(options, (mpRes) => {
      let data = '';

      // Recebe os pedacinhos da resposta
      mpRes.on('data', (chunk) => {
        data += chunk;
      });

      // Quando terminar de receber
      mpRes.on('end', () => {
        try {
          const jsonResponse = JSON.parse(data);
          
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            res.status(200).json(jsonResponse);
            resolve();
          } else {
            // Devolve o erro exato do Mercado Pago para sabermos o que houve
            res.status(mpRes.statusCode).json(jsonResponse);
            resolve();
          }
        } catch (e) {
          res.status(500).json({ error: 'Erro ao processar resposta do Mercado Pago', details: data });
          resolve();
        }
      });
    });

    // Se der erro de conexão com o Mercado Pago
    mpReq.on('error', (e) => {
      console.error(e);
      res.status(500).json({ error: 'Erro de conexão com Mercado Pago', details: e.message });
      resolve();
    });

    // Envia os dados
    mpReq.write(postData);
    mpReq.end();
  });
}
