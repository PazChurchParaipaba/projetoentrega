// Arquivo: js/payment.js
// Módulo responsável por processamento de pagamentos (Pix, Cartão, Split de Conta)

// Garante que o namespace existe
App.payment = App.payment || {};

Object.assign(App.payment, {

    getConfig: () => {
        return 'https://naxiosoftware.vercel.app';
    },

    // ---------------------------------------------------------------------
    // 1. FUNÇÕES DE MESA (SPLIT / GARÇOM)
    // ---------------------------------------------------------------------
    openSplitModal: async (comandaId, items, numeroMesa) => {
        // --- 🧹 LIMPEZA PREVENTIVA DE ESTADO (NOVO) ---
        // Remove overlays antigos que possam ter travado a tela
        document.querySelectorAll('.naxio-modal-overlay').forEach(el => el.remove());
        const modalSplitAntigo = document.getElementById('split-pay-modal');
        if (modalSplitAntigo) modalSplitAntigo.style.display = 'none';

        // --- 🔒 1. VERIFICAÇÃO DE CAIXA (NOVO) ---
        if (typeof Caixa === 'undefined' || !Caixa.state.session) {
            alert("🚫 CAIXA FECHADO\n\nVocê precisa abrir o caixa no menu 'Frente de Caixa' antes de gerenciar pagamentos.");
            return; // Bloqueia a abertura do modal
        }

        // 🔥 VERIFICA SE É COMANDA INTERNA (IMPEDE MODAL DE PAGAMENTO)
        try {
            const { data: comandaInfo } = await _sb.from('comandas').select('tipo_comanda').eq('id', comandaId).single();

            if (comandaInfo && comandaInfo.tipo_comanda === 'interna') {
                const confirma = await NaxioUI.confirm(
                    '🏠 Fechar Comanda Interna',
                    `Deseja fechar a comanda interna da Mesa ${numeroMesa}?\n\nEsta comanda não gera vendas no caixa.`,
                    'Sim, Fechar',
                    'Cancelar'
                );

                if (!confirma) return;

                App.utils.toast("Fechando...", "info");

                await _sb.from('comandas').update({
                    status: 'fechada',
                    total_pago: 0,
                    payments_info: [],
                    updated_at: new Date().toISOString()
                }).eq('id', comandaId);

                App.utils.toast("Comanda interna fechada!", "success");

                if (App.store.loadComandas) App.store.loadComandas();

                // Limpa estado atual
                App.state.currentComanda = null;

                return false; // ⛔ RETORNA FALSE PARA NÃO TENTAR RENDERIZAR MODAL
            }
        } catch (e) {
            console.error("Erro ao verificar tipo de comanda:", e);
        }

        // --- 🗣️ 2. PERGUNTA DE ATRIBUIÇÃO (NOVO) - APENAS UMA VEZ ---
        // Verifica se já perguntou nesta sessão
        if (!NaxioKeyboardShortcuts.sessionCaixaAtribuido) {
            const session = Caixa.state.session;
            const dataAbertura = new Date(session.abertura || session.created_at).toLocaleString();

            const atribuir = await NaxioUI.confirm(
                '💰 Caixa Aberto Detectado',
                `📅 Abertura: ${dataAbertura}\n💰 Fundo: R$ ${session.valor_inicial.toFixed(2)}\n\nDeseja atribuir as vendas da Mesa ${numeroMesa} a esse caixa?`,
                'Sim, Atribuir',
                'Não'
            );

            if (!atribuir) {
                return; // Se o usuário cancelar, não abre o modal
            }

            // Marca como já perguntado
            NaxioKeyboardShortcuts.sessionCaixaAtribuido = true;
        }
        // ------------------------------------------

        App.state.currentComanda = comandaId;
        App.state.paymentSplits = [];
        App.state.currentComandaItems = items;
        App.state.currentMesaNum = numeroMesa;

        let total = 0;
        if (items && Array.isArray(items)) {
            total = items.reduce((acc, item) => acc + (item.price * item.qtd), 0);
        }

        const checkModal = document.getElementById('modal-taxa-10');
        if (checkModal && checkModal.checked) {
            total = total * 1.10;
        }

        App.state.comandaTotal = total;

        const elTotalDue = document.getElementById('split-total-due');
        const elRemaining = document.getElementById('split-remaining');
        const elAmount = document.getElementById('split-amount');
        const elHistory = document.getElementById('split-history');

        if (elTotalDue) elTotalDue.innerText = `R$ ${total.toFixed(2)}`;
        if (elRemaining) elRemaining.innerText = `R$ ${total.toFixed(2)}`;
        if (elAmount) elAmount.value = total.toFixed(2);
        if (elHistory) elHistory.innerHTML = '';

        const modalBody = document.querySelector('#split-pay-modal .modal-body');
        const oldBtn = document.getElementById('btn-print-split-detail');
        if (oldBtn) oldBtn.remove();

        if (App.store && App.store.renderEditList) {
            setTimeout(() => App.store.renderEditList(numeroMesa, items), 100);
        }

        const modal = document.getElementById('split-pay-modal');
        if (modal) modal.style.display = 'flex';
    },

    printCheck: () => {
        if (typeof RelatoriosEnterprise !== 'undefined') RelatoriosEnterprise.imprimirConferencia(App.state.currentComanda);
    },

    toggleCardFields: () => {
        const method = document.getElementById('split-method').value;
        const cardFields = document.getElementById('card-fields');
        if (cardFields) cardFields.style.display = (method === 'cartao') ? 'flex' : 'none';
    },

    addSplit: () => {
        const amount = parseFloat(document.getElementById('split-amount').value);
        const method = document.getElementById('split-method').value;
        const nsu = document.getElementById('card-nsu') ? document.getElementById('card-nsu').value : '';

        if (!amount || amount <= 0) return alert("Valor inválido");

        App.state.paymentSplits.push({ amount, method, nsu });

        const hist = document.getElementById('split-history');
        hist.innerHTML = App.state.paymentSplits.map(s => `<div>- R$ ${s.amount.toFixed(2)} (${s.method.toUpperCase()})</div>`).join('');

        const paid = App.state.paymentSplits.reduce((acc, s) => acc + s.amount, 0);
        const remain = App.state.comandaTotal - paid;

        document.getElementById('split-remaining').innerText = `R$ ${remain > 0.01 ? remain.toFixed(2) : '0.00'}`;

        if (remain <= 0.01) {
            document.getElementById('btn-finish-split').disabled = false;
            document.getElementById('split-amount').value = 0;
            document.getElementById('btn-finish-split').focus();
        } else {
            document.getElementById('split-amount').value = remain.toFixed(2);
        }
    },

    finalizeSplit: async () => {
        // --- 🔒 VERIFICAÇÃO DE SEGURANÇA (NOVO) ---
        // Garante que o caixa ainda está aberto no momento de salvar
        if (typeof Caixa === 'undefined' || !Caixa.state.session) {
            return alert("🚫 ERRO CRÍTICO: O caixa foi fechado antes da conclusão dessa venda.");
        }
        // -------------------------------------------

        const comandaId = App.state.currentComanda;
        const total = App.state.comandaTotal;

        App.utils.toast("Fechando mesa...", "info");

        await _sb.from('comandas').update({
            status: 'fechada',
            payments_info: App.state.paymentSplits,
            total_pago: total,
            updated_at: new Date().toISOString()
        }).eq('id', comandaId);

        document.getElementById('split-pay-modal').style.display = 'none';

        const itensLog = App.state.currentComandaItems ? JSON.stringify(App.state.currentComandaItems) : "[]";

        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: total,
            endereco_destino: `Mesa ${App.state.currentMesaNum}`,
            observacao: itensLog,
            created_at: new Date().toISOString()
        }).select().single();

        App.utils.toast("Conta Fechada!", "success");

        // Atualiza os totais do caixa em tempo real
        if (Caixa.calcTotals) await Caixa.calcTotals();

        setTimeout(async () => {
            const emitirNFCe = await NaxioUI.confirm(
                '🧾 Emitir Nota Fiscal',
                'Deseja emitir a NFC-e desta mesa?',
                'Sim, Emitir',
                'Não'
            );

            if (emitirNFCe) {
                if (App.fiscal && App.fiscal.emitirNFCe) {
                    App.fiscal.emitirNFCe(newOrder.id, total, App.state.paymentSplits);
                } else {
                    await NaxioUI.alert('❌ Erro', 'Módulo Fiscal não carregado.', 'error');
                }
            }
            else {
                const imprimirRecibo = await NaxioUI.confirm(
                    '🖨️ Imprimir Recibo',
                    'Deseja imprimir um recibo simples?',
                    'Sim, Imprimir',
                    'Não'
                );

                if (imprimirRecibo) {
                    const comandaFake = { numero: App.state.currentMesaNum, total_pago: total, items: App.state.currentComandaItems };
                    if (App.store.imprimirComprovante) {
                        App.store.imprimirComprovante(comandaFake, App.state.paymentSplits);
                    }
                }
            }
        }, 500);

        if (App.store.loadComandas) App.store.loadComandas();
        if (App.store.loadMetrics) App.store.loadMetrics();
    },

    // ---------------------------------------------------------------------
    // 2. SISTEMA ONLINE (CLIENTE - AUTOMÁTICO)
    // ---------------------------------------------------------------------
    open: async (total, orderPayload) => {
        if (!App.state.user) { App.utils.toast("Faça login!", "warning"); App.router.go('auth'); return; }

        App.state.pendingPayment = { total, orderPayload };
        document.getElementById('pay-total-display').innerText = `R$ ${total.toFixed(2)}`;
        document.getElementById('payment-modal').style.display = 'flex';

        // Limpa e prepara visual
        document.getElementById('payment-brick_container').innerHTML = '';
        const oldPix = document.getElementById('pix-display-area'); if (oldPix) oldPix.remove();
        document.getElementById('payment-brick_container').style.display = 'block';

        if (total <= 0) { App.payment.finalizeSuccess(); return; }

        App.payment.renderBrick(total);
    },

    close: () => {
        document.getElementById('payment-modal').style.display = 'none';
        if (App.state.brickController) App.state.brickController.unmount();
        // Para o timer de verificação para não gastar recurso
        if (App.state.pixInterval) clearInterval(App.state.pixInterval);
    },

    renderBrick: async (amount) => {
        if (typeof mpInstance === 'undefined') {
            try { mpInstance = new MercadoPago(CONFIG.adminPublicKey); }
            catch (e) { console.error(e); }
        }
        const builder = mpInstance.bricks();
        const userEmail = App.state.profile?.email || 'guest@email.com';

        App.state.brickController = await builder.create("payment", "payment-brick_container", {
            initialization: { amount: amount, payer: { email: userEmail } },
            customization: { paymentMethods: { ticket: "all", bankTransfer: "all", creditCard: "all", debitCard: "all", maxInstallments: 3 }, visual: { style: { theme: 'default' } } },
            callbacks: {
                onReady: () => console.log("Brick Ready"),
                onError: (e) => console.error(e),
                onSubmit: async ({ formData }) => {
                    const storeId = App.state.pendingPayment?.orderPayload?.store_id;

                    // Payload simplificado
                    const payload = {
                        transaction_amount: formData.transaction_amount,
                        description: `Pedido ${new Date().toLocaleTimeString()}`,
                        payer: formData.payer,
                        store_id: storeId,
                        notification_url: "https://naxiosoftware.vercel.app/api/webhook"
                    };

                    try {
                        const API_BASE = App.payment.getConfig();
                        const response = await fetch(`${API_BASE}/api/pix`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload)
                        });

                        const data = await response.json();

                        if (!response.ok) throw new Error(data.error || "Erro API");

                        if (data.status === 'approved') {
                            App.utils.toast("Pagamento Aprovado!", "success");
                            return App.payment.finalizeSuccess();
                        }
                        else if (data.status === 'pending') {
                            if (data.point_of_interaction) {
                                App.payment.showPixScreen(data);
                            } else {
                                alert("Pendente. Aguarde confirmação.");
                            }
                        }
                        else {
                            alert("Recusado: " + (data.status_detail || "Erro"));
                        }
                    } catch (error) {
                        console.error(error);
                        alert("Erro ao gerar Pix: " + error.message);
                    }
                }
            }
        });
    },

    showPixScreen: (data) => {
        document.getElementById('payment-brick_container').style.display = 'none';
        const qrInfo = data.point_of_interaction?.transaction_data;
        const payId = data.id;

        if (!qrInfo || !payId) return alert("Erro ao receber dados do Pix.");

        const div = document.createElement('div');
        div.id = 'pix-display-area';
        div.style.textAlign = 'center';
        div.innerHTML = `
                <div style="background:#1e293b; padding:20px; border-radius:12px; margin-bottom:15px; border:2px dashed #334155;">
                    <img src="data:image/png;base64,${qrInfo.qr_code_base64}" style="width:200px">
                </div>
                <p class="text-xs" style="color:#94a3b8;">Copie e Cole o Código:</p>
                <input value="${qrInfo.qr_code}" readonly style="width:100%; padding:10px; margin-bottom:10px; font-size:0.8rem; background:#0f172a; color:#fff; border:1px solid #334155; border-radius:5px;" onclick="this.select()">
                
                <div style="margin-top:20px; color:#3b82f6; animation: pulse 2s infinite;">
                    <i class="ri-loader-4-line spin" style="font-size:2rem"></i>
                    <p style="font-weight:bold;">Aguardando pagamento...</p>
                    <small style="color:#94a3b8;">Não feche essa tela.</small>
                </div>
            `;
        document.querySelector('#payment-modal .modal-body').appendChild(div);

        // 🔥 INICIA A VERIFICAÇÃO AUTOMÁTICA
        App.payment.startPolling(payId);
    },

    // ESSA É A FUNÇÃO QUE FAZ A MÁGICA SOZINHA
    manualCheckPix: async (payId) => {
        if (!App.state.pendingPayment?.orderPayload) return;
        const storeId = App.state.pendingPayment.orderPayload.store_id;
        const API_BASE = App.payment.getConfig();

        try {
            // Chama sua API para ver se o status mudou
            const res = await fetch(`${API_BASE}/api/pix?id=${payId}&store_id=${storeId}`);
            if (!res.ok) return; // Se der erro de rede, tenta de novo no próximo tick

            const data = await res.json();
            console.log("Status Pix:", data.status);

            // SE APROVADO = FECHA O MODAL E CRIA O PEDIDO NA HORA
            if (data.status === 'approved') {
                clearInterval(App.state.pixInterval); // Para de verificar
                App.utils.toast("Pagamento Confirmado! Enviando pedido...", "success");
                await App.payment.finalizeSuccess(); // Cria o pedido
            }
        } catch (e) { console.error("Polling error", e); }
    },

    startPolling: (pid) => {
        if (App.state.pixInterval) clearInterval(App.state.pixInterval);
        // Verifica a cada 4 segundos
        App.state.pixInterval = setInterval(() => App.payment.manualCheckPix(pid), 4000);
    },

    // CRIA O PEDIDO NO SUPABASE PARA APARECER PRO LOJISTA
    finalizeSuccess: async () => {
        if (!App.state.pendingPayment) return;
        const { orderPayload, total } = App.state.pendingPayment;
        App.payment.close(); // Fecha modal

        // --- PAGAMENTO DE MESA (COMANDA) ---
        if (orderPayload.is_comanda && orderPayload.comanda_id) {
            await _sb.from('comandas').update({
                status: 'fechada',
                total_pago: total,
                payments_info: [{ method: 'pix', amount: total }],
                updated_at: new Date().toISOString()
            }).eq('id', orderPayload.comanda_id);
            App.utils.toast('Conta paga com sucesso!', 'success');
            App.router.go('cliente');
            if (App.client && App.client.init) App.client.init();
            return;
        }

        // --- PEDIDO NORMAL ---
        const itemsJson = orderPayload.items && orderPayload.items.length > 0
            ? JSON.stringify(orderPayload.items)
            : (orderPayload.observacao || 'Pedido via App (Pix Automático)');

        const { error } = await _sb.from('orders').insert({
            cliente_id: App.state.user.id,
            product_id: orderPayload.product_id || null,
            store_id: orderPayload.store_id,
            endereco_destino: orderPayload.address || '',
            requer_montagem: orderPayload.requer_montagem || false,
            taxa_servico: orderPayload.taxa || 0,
            status: 'pago',
            total_pago: total,
            origem_venda: 'app_cliente',
            metodo_pagamento: 'pix',
            observacao: itemsJson,
            created_at: new Date().toISOString()
        });

        if (error) {
            console.error("Erro ao salvar pedido:", error);
            return alert("Erro ao salvar pedido no sistema. Tire print e mostre ao caixa.");
        }

        // Baixa Estoque: usa orderPayload.items (carrinho completo) ou cart ou produto único
        let itensParaBaixar = [];
        if (orderPayload.items && orderPayload.items.length > 0) {
            itensParaBaixar = orderPayload.items.map(i => ({ id: i.id, qtd: i.qtd || 1 }));
        } else if (App.state.cart.length > 0) {
            itensParaBaixar = App.state.cart.map(i => ({ id: i.id, qtd: 1 }));
        } else if (orderPayload.product_id) {
            itensParaBaixar = [{ id: orderPayload.product_id, qtd: 1 }];
        }
        const validItens = itensParaBaixar.filter(i => i.id);
        if (validItens.length > 0) {
            try {
                await _sb.rpc('descontar_estoque', { itens: validItens });
            } catch (e) {
                console.error("Erro ao baixar estoque:", e);
            }
        }

        App.utils.toast('Pedido Enviado para a Cozinha!', 'success');

        // Chama callback de sucesso se existir (ex: finalizar OS)
        if (orderPayload.onSuccess && typeof orderPayload.onSuccess === 'function') {
            try { await orderPayload.onSuccess(); } catch (e) { console.error('onSuccess callback error:', e); }
        }

        App.router.go('cliente');
        App.state.cart = [];
        App.cart.activeCoupon = null;
        App.cart.updateFloater();
        if (App.client && App.client.init) App.client.init();
    }
});
