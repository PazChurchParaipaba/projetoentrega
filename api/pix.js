const https = require('https');

export default async function handler(req, res) {
  // 1. Configuração de CORS (Segurança de Acesso)
  // Permite que seu Front-end se comunique com este Back-end
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Resposta rápida para requisições de pre-flight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validação do Método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validação do Corpo da Requisição
  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Nenhum dado recebido.' });
  }

  // --- CONFIGURAÇÃO DO MERCADO PAGO ---
  // SEU ACCESS TOKEN DE TESTE (Troque pelo de Produção quando for lançar)
  const ACCESS_TOKEN = 'TEST-1174857331903554-122013-f01b6851dd5d57f3b197bf4f7a5384e3-3082316443';

  // 2. Preparação do Objeto de Pagamento
  // Limpeza preventiva de CPF
  let cleanCPF = '';
  if (body.payer && body.payer.identification && body.payer.identification.number) {
      cleanCPF = body.payer.identification.number.replace(/\D/g, '');
  }

  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token, // Token do cartão (se houver)
    description: "Serviço NexLog",
    installments: Number(body.installments),
    payment_method_id: body.payment_method_id,
    issuer_id: body.issuer_id, // Banco emissor
    payer: {
      email: body.payer.email,
      entity_type: 'individual',
      type: 'customer',
      identification: {
        type: body.payer.identification.type,
        number: cleanCPF
      }
    },
    // Configurações Adicionais para garantir a transação
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
      'X-Idempotency-Key': Date.now().toString(), // Evita duplicação de pagamentos
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  // 3. Envio da Requisição para o Mercado Pago
  return new Promise((resolve, reject) => {
    const mpReq = https.request(options, (mpRes) => {
      let data = '';

      mpRes.on('data', (chunk) => {
        data += chunk;
      });

      mpRes.on('end', () => {
        try {
          const jsonResponse = JSON.parse(data);
          
          // Verificação de Sucesso (Status 2xx)
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            res.status(200).json(jsonResponse);
            resolve();
          } else {
            // Log de Erro para Debug
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
