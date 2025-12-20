const https = require('https');

export default async function handler(req, res) {
  // ------------------------------------------------------------------
  // 1. CONFIGURAÇÃO DE CORS E SEGURANÇA
  // ------------------------------------------------------------------
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Responde rápido a pre-flight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    if (!body) throw new Error('Nenhum dado recebido.');

    // ------------------------------------------------------------------
    // 2. CREDENCIAIS DE PRODUÇÃO (ATUALIZADAS)
    // ------------------------------------------------------------------
    const ACCESS_TOKEN = 'APP_USR-1174857331903554-122013-4081678527cfa85bbe7a6d6a5a262861-3082316443';

    // ------------------------------------------------------------------
    // 3. TRATAMENTO INTELIGENTE DE DADOS (CPF vs CNPJ)
    // ------------------------------------------------------------------
    console.log("Processando pagamento de:", body.payer.email);

    let cleanDocNumber = '';
    let docType = 'CPF'; // Padrão
    let entityType = 'individual'; // Padrão (Pessoa Física)

    // Verifica se vieram dados de identificação do Frontend
    if (body.payer && body.payer.identification) {
        docType = body.payer.identification.type || 'CPF';
        
        if (body.payer.identification.number) {
            // Remove tudo que não for número (pontos, traços, barras)
            cleanDocNumber = body.payer.identification.number.replace(/\D/g, '');
        }

        // Lógica para definir Pessoa Jurídica vs Física
        if (docType === 'CNPJ') {
            entityType = 'association'; // No MP, 'association' é usado para empresas/PJ
        } else {
            entityType = 'individual';
        }
    }

    // Garante email de fallback caso venha vazio (evita erro 500)
    const payerEmail = (body.payer && body.payer.email) ? body.payer.email : 'cliente@nexlog.com';

    // Monta o objeto de pagamento
    const paymentData = {
      transaction_amount: Number(body.transaction_amount),
      token: body.token, // Token do cartão (se houver)
      description: "Serviço NexLog",
      installments: Number(body.installments),
      payment_method_id: body.payment_method_id,
      issuer_id: body.issuer_id, // Banco emissor
      payer: {
        email: payerEmail,
        entity_type: entityType, // Agora é dinâmico (individual ou association)
        type: 'customer',
        identification: {
          type: docType,
          number: cleanDocNumber
        }
      },
      // Flags para garantir captura imediata
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

    // ------------------------------------------------------------------
    // 4. ENVIO PARA O MERCADO PAGO
    // ------------------------------------------------------------------
    return new Promise((resolve, reject) => {
      const mpReq = https.request(options, (mpRes) => {
        let data = '';

        mpRes.on('data', (chunk) => {
          data += chunk;
        });

        mpRes.on('end', () => {
          try {
            const jsonResponse = JSON.parse(data);
            
            // Sucesso (Status 200 ou 201)
            if (mpRes.statusCode >= 200 && mpRes.statusCode < 300) {
              res.status(200).json(jsonResponse);
            } else {
              // Erro da API do Mercado Pago
              console.error("Erro retornado pelo MP:", JSON.stringify(jsonResponse));
              res.status(mpRes.statusCode).json(jsonResponse);
            }
            resolve();
          } catch (e) {
            console.error("Erro Parse JSON:", e);
            res.status(500).json({ error: 'Erro ao processar resposta do gateway', raw: data });
            resolve();
          }
        });
      });

      mpReq.on('error', (e) => {
        console.error("Erro HTTPS:", e);
        res.status(500).json({ error: 'Erro de conexão com o Mercado Pago', details: e.message });
        resolve();
      });

      mpReq.write(postData);
      mpReq.end();
    });

  } catch (err) {
    console.error("Erro Geral Backend:", err);
    res.status(500).json({ error: 'Erro interno no servidor', details: err.message });
  }
}
