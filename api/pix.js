const https = require('https');

export default async function handler(req, res) {
  // 1. Configuração de CORS (Segurança de Acesso)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Em produção, considere restringir para seu domínio
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Nenhum dado recebido.' });
  }

  // --- CONFIGURAÇÃO DO MERCADO PAGO (PRODUÇÃO) ---
  // Substituído pelo ACCESS TOKEN da imagem fornecida
  const ACCESS_TOKEN = 'APP_USR-1174857331903554-122013-4081678527cfa85bbe7a6d6a5a262861-3082316443';

  // 2. Preparação do Objeto de Pagamento
  let cleanCPF = '';
  if (body.payer && body.payer.identification && body.payer.identification.number) {
      cleanCPF = body.payer.identification.number.replace(/\D/g, '');
  }

  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token,
    description: "Serviço NexLog",
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
    },
    capture: true,
    binary_mode: false,
    statement_descriptor: "NEXLOG APP"
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

  // 3. Envio da Requisição
  return new Promise((resolve, reject) => {
    const mpReq = https.request(options, (mpRes) => {
      let data = '';

      mpRes.on('data', (chunk) => {
        data += chunk;
      });

      mpRes.on('end', () => {
        try {
          const jsonResponse = JSON.parse(data);
          
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
