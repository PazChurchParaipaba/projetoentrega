Object.assign(App, {
client: {
        init: async () => {
            try {
                if (!App.state.user) return;
                const { data: orders, error } = await _sb.from('orders')
                    .select('*, products(nome)')
                    .eq('cliente_id', App.state.user.id)
                    .neq('status', 'concluido')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Erro ao carregar pedidos do cliente:", error);
                }

                const container = document.getElementById('client-orders-list');
                if (container) {
                    container.innerHTML = orders?.map(o => `
                        <div class="card" style="margin-bottom:1rem">
                            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
                                <strong>${o.products?.nome || 'Produto'}</strong>
                                <span class="badge status-${o.status}">${o.status}</span>
                            </div>
                            <p class="text-sm">${o.endereco_destino}</p>
                            ${['em_rota', 'aceito', 'concluido'].includes(o.status) ? `<button class="btn btn-success btn-sm btn-full" onclick="App.map.open('${o.id}', false)">Rastrear</button>` : ''}
                        </div>`).join('') || '<p>Nenhum pedido ativo.</p>';
                }
                
                // Carrega histórico de chat de forma segura
                if (App.chat && typeof App.chat.loadHistory === 'function') {
                    await App.chat.loadHistory('client').catch(err => {
                        console.error("Erro ao carregar histórico de chat:", err);
                    });
                }
            } catch (err) {
                console.error("Erro em client.init():", err);
            }
        },

       checkTableBill: async () => {
        const num = document.getElementById('client-table-check').value;
        if (!num) return alert("Digite o número da mesa");

        const { data } = await _sb.from('comandas').select('*, stores(mp_public_key, nome_loja)').eq('numero', num).in('status', ['aberta', 'ocupada']).maybeSingle();

        if (data && data.items && data.items.length > 0) {
            const subtotal = data.items.reduce((acc, i) => acc + (i.price * i.qtd), 0);
            const taxa = subtotal * 0.10;
            const total = subtotal + taxa;

            const listHtml = data.items.map(i => `
                <div style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:8px 0; font-size:0.9rem;">
                    <span><strong>${i.qtd}x</strong> ${i.nome}</span>
                    <span>R$ ${(i.price * i.qtd).toFixed(2)}</span>
                </div>`).join('');

            const modalHtml = `
                <div id="client-bill-modal" class="modal-overlay" style="display:flex; z-index:9999;">
                    <div class="modal-content">
                        <div class="modal-header"><h3>Conta Mesa ${num}</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('client-bill-modal').remove()">Fechar</button></div>
                        <div class="modal-body">
                            <h4 style="text-align:center; color:var(--text-muted);">${data.stores?.nome_loja}</h4>
                            <div style="background:#f9f9f9; padding:15px; border-radius:8px; max-height:250px; overflow-y:auto; border:1px solid #eee; margin:10px 0;">${listHtml}</div>
                            
                            <div style="display:flex; justify-content:space-between; font-size:0.9rem;"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div>
                            <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:var(--text-muted);"><span>Serviço (10%):</span><span>R$ ${taxa.toFixed(2)}</span></div>
                            <hr style="margin:10px 0;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Total a Pagar:</span>
                                <h2 style="color:var(--primary); margin:0;">R$ ${total.toFixed(2)}</h2>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-success btn-full" onclick="App.client.payBill('${data.id}', ${total}, '${data.stores?.mp_public_key}', '${data.store_id}')">
                                <i class="ri-secure-payment-line"></i> Pagar (Pix/Cartão)
                            </button>
                        </div>
                    </div>
                </div>`;
            const div = document.createElement('div');
            div.innerHTML = modalHtml;
            document.body.appendChild(div.firstElementChild);
        } else {
            alert("Mesa não encontrada ou conta já fechada.");
        }
    },

        payBill: (comandaId, total, pk, storeId) => {
            document.getElementById('client-bill-modal').remove();
            let finalKey = pk;
            if (!pk || pk === 'null' || pk === 'undefined' || pk.trim() === '') {
                finalKey = CONFIG.adminPublicKey;
            }
            try {
                mpInstance = new MercadoPago(finalKey);
                App.payment.open(total, {
                    store_id: storeId,
                    basePrice: total,
                    address: `MESA PAGAMENTO ONLINE`,
                    requer_montagem: false,
                    taxa: 0,
                    is_comanda: true,
                    comanda_id: comandaId
                });
            } catch (e) {
                alert("Erro ao iniciar pagamento: Verifique as chaves da loja.");
                console.error(e);
            }
        },

        confirmOrder: async (pid, sid, price, category, deliveryInfoRaw) => {
            if (!App.state.user) { App.utils.toast("Faça login!", "warning"); App.router.go('auth'); return; }
            let address = "";
            if (category === 'Hoteis/Pousadas') {
                const { data: userProfile } = await _sb.from('profiles').select('*').eq('id', App.state.user.id).single();
                if (userProfile) { address = `RESERVA: ${userProfile.nome_completo} | CPF: ${userProfile.cpf || 'Não inf.'} | Email: ${userProfile.email}`; alert("Dados capturados para reserva. Prossiga para o pagamento."); }
                else address = "Dados de reserva pendentes.";
            } else {
                address = prompt("Endereço de Entrega Completo:");
                if (!address) return;
            }
            if (category === 'Comidas') {
                if (confirm("Você vai querer beber alguma coisa?")) {
                    App.utils.toast("Filtrando bebidas desta loja...", "info");
                    let query = _sb.from('products').select('*, stores(nome_loja)').eq('store_id', sid).eq('categoria', 'Bebidas');
                    const { data } = await query;
                    let html = `<div style="grid-column:1/-1; margin-bottom:10px; padding:15px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;"><h3 style="color:var(--success)">🥤 Bebidas da Loja</h3><p>Selecione a bebida ou clique abaixo para finalizar só a comida.</p><button class="btn btn-sm btn-primary" style="width:100%; margin-top:5px;" onclick="App.client.finalizeCart('${pid}', '${sid}', ${price}, '${address}')">Pular Bebida e Pagar Comida (R$ ${price.toFixed(2)})</button></div>`;
                    if (data && data.length > 0) html += data.map(p => App.renderCard(p)).join('');
                    else html += `<p style="grid-column:1/-1; text-align:center">Nenhuma bebida cadastrada.</p>`;
                    document.getElementById('public-catalog').innerHTML = html;
                    return;
                }
            }
            let finalPrice = price;
            let feeVal = 0;
            if (deliveryInfoRaw && deliveryInfoRaw !== 'null') {
                try {
                    const cleanJson = deliveryInfoRaw.replace(/^'|'$/g, "");
                    const d = JSON.parse(cleanJson);
                    const val = parseFloat(d.fee_val) || 0;
                    if (d.fee_type === 'percent') feeVal = price * (val / 100);
                    else feeVal = val;
                    if (feeVal > 0) alert(`Será adicionada uma taxa de entrega de R$ ${feeVal.toFixed(2)}`);
                } catch (e) { }
            }
            const serviceCats = ['Fretes e Mudanças', 'Serviços de Pedreiros', 'Serviços de Pintores', 'Manutenção Eletrodomésticos', 'Jardinagem', 'Serviços de Manutenção', 'Outros'];
            if (serviceCats.includes(category)) {
                if (feeVal === 0) { feeVal = 0; alert("Não cobramos taxa de deslocamento para este serviço."); }
            }
            finalPrice += feeVal;
            App.client.finalizeCart(pid, sid, finalPrice, address);
        },

        finalizeCart: async (pid, sid, price, address) => {
            const { data: storeData } = await _sb.from('stores').select('mp_public_key').eq('id', sid).single();
            let publicKeyToUse = storeData?.mp_public_key;
            if (!publicKeyToUse || publicKeyToUse === 'null' || publicKeyToUse === 'undefined') {
                publicKeyToUse = CONFIG.adminPublicKey;
            }
            mpInstance = new MercadoPago(publicKeyToUse);
            const commission = price * 0.10;
            App.payment.open(price, { product_id: pid, store_id: sid, basePrice: price, address, requer_montagem: false, taxa: commission });
        }
    }
});
