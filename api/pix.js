generatePix: async () => {
    const { total, orderPayload } = App.state.pendingPayment;
    const email = App.state.profile.email;

    App.utils.toast('Gerando Pix...', 'info');

    try {
        // --- MUDANÇA AQUI: Chamamos nosso arquivo local /api/pix ---
        // Não enviamos o token, pois ele já está seguro lá no api/pix.js
        const response = await fetch('/api/pix', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transaction_amount: parseFloat(total.toFixed(2)),
                description: `Pedido LogiMoveis - ${email}`,
                email: email
            })
        });

        const data = await response.json();
        // ... o resto do código continua igual ...
        
        if (data.status === 401 || data.status === 403) { throw new Error('Erro de autenticação MP.'); }
        
        if (data.point_of_interaction) {
            const qrBase64 = data.point_of_interaction.transaction_data.qr_code_base64;
            const qrCode = data.point_of_interaction.transaction_data.qr_code;
            const paymentId = data.id;

            document.getElementById('pay-step-init').style.display = 'none';
            document.getElementById('pay-step-qr').style.display = 'block';
            document.getElementById('pay-qr-img').src = `data:image/jpeg;base64,${qrBase64}`;
            document.getElementById('pay-copy-code').innerText = qrCode;

            App.payment.startPolling(paymentId);
        } else {
            throw new Error('Resposta inválida do MP.');
        }

    } catch (err) {
        console.error(err);
        App.utils.toast('Erro ao gerar Pix. Tente a simulação.', 'error');
        // Fallback visual
        document.getElementById('pay-step-init').style.display = 'none';
        document.getElementById('pay-step-qr').style.display = 'block';
        document.getElementById('pay-qr-img').src = 'https://placehold.co/200x200?text=Erro+Conexao';
        document.getElementById('pay-copy-code').innerText = "Erro de conexão com o servidor.";
    }
},
