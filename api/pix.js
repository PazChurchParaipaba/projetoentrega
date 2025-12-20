const https = require('https');

// Handler principal da API Serverless
export default async function handler(req, res) {
  // ------------------------------------------------------------------
  // 1. CONFIGURAÇÃO DE CORS (Segurança de Origem)
  // ------------------------------------------------------------------
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Em produção, troque '*' pelo seu domínio (ex: https://nexlog.vercel.app)
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde imediatamente a requisições OPTIONS (Pre-flight do navegador)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Verifica se veio corpo na requisição
  const body = req.body;
  if (!body) {
    return res.status(400).json({ error: 'Nenhum dado de pagamento recebido.' });
  }

  // ------------------------------------------------------------------
  // 2. CREDENCIAIS DO MERCADO PAGO
  // ------------------------------------------------------------------
  // Substitua pelo seu ACCESS TOKEN de Produção ou Teste
  const ACCESS_TOKEN = 'TEST-1174857331903554-122013-f01b6851dd5d57f3b197bf4f7a5384e3-3082316443';

  // ------------------------------------------------------------------
  // 3. PREPARAÇÃO DOS DADOS (PAYLOAD)
  // ------------------------------------------------------------------
  
  // Limpeza preventiva do CPF (remove pontos e traços)
  let cleanCPF = '';
  if (body.payer && body.payer.identification && body.payer.identification.number) {
      cleanCPF = body.payer.identification.number.replace(/\D/g, '');
  }

  const paymentData = {
    transaction_amount: Number(body.transaction_amount),
    token: body.token, // Token do cartão (se houver)
    description: "Serviço NexLog - Logística Inteligente",
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
    // Flags adicionais para garantir funcionamento
    capture: true,
    binary_mode: false,
    statement_descriptor: "NEXLOG APP"
  };

  // Se for PIX, o Mercado Pago exige alguns parâmetros específicos que o SDK já manda,
  // mas garantimos que o objeto esteja limpo.
  
  const postData = JSON.stringify(paymentData);

  // ------------------------------------------------------------------
  // 4. ENVIO PARA OS SERVIDORES DO MERCADO PAGO
  // ------------------------------------------------------------------
  const options = {
    hostname: 'api.mercadopago.com',
    path: '/v1/payments',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': Date.now().toString(), // Garante que não haja cobrança duplicada no mesmo milissegundo
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const mpReq = https.request(options, (mpRes) => {
      let data = '';

      mpRes.on('data', (chunk) => {
        data += chunk;
      });

      mpRes.on('end', () => {
        try {
          const jsonResponse = JSON.parse(data);
          
          // Log para depuração no console da Vercel (se necessário)
          // console.log("Status MP:", mpRes.statusCode, jsonResponse.status);

          // Verifica se o status HTTP é de sucesso (200 ou 201)
          if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
            res.status(200).json(jsonResponse);
            resolve();
          } else {
            // Erro vindo do Mercado Pago (Cartão recusado, dados inválidos, etc)
            console.error("Erro retornado pelo MP:", jsonResponse);
            res.status(mpRes.statusCode).json(jsonResponse);
            resolve();
          }
        } catch (e) {
          console.error("Erro ao processar JSON:", e);
          res.status(500).json({ error: 'Erro interno ao processar resposta do gateway.', details: data });
          resolve();
        }
      });
    });

    mpReq.on('error', (e) => {
      console.error("Erro de conexão HTTPS:", e);
      res.status(500).json({ error: 'Erro de conexão com o Mercado Pago', details: e.message });
      resolve();
    });

    // Escreve os dados no corpo da requisição e finaliza
    mpReq.write(postData);
    mpReq.end();
  });
}
