// Arquivo: js/cart.js
// Módulo de Carrinho e Checkout (Corrigido e Unificado)

if (typeof App !== 'undefined') {
    
    Object.assign(App, {
        cart: {
            activeCoupon: null,
            storeSettings: null,
            selectedShipping: null,
            selectedFreight: 0, 
            selectedFreightLabel: null,

            // --- 1. ADICIONAR AO CARRINHO ---
            add: (product, storeId) => {
                // Verifica se já tem itens de outra loja
                if (App.state.cart.length > 0 && App.state.cart[0].storeId !== storeId) {
                    if (!confirm("Você tem itens de outra loja. Limpar carrinho e adicionar este?")) return;
                    App.state.cart = [];
                    App.cart.activeCoupon = null;
                    App.cart.selectedFreight = 0;
                }
                
                App.state.cart.push({ ...product, storeId });
                App.utils.toast("Item adicionado ao carrinho!", "success");
                
                // Atualiza visuais
                App.cart.updateFloater();
            },

            // --- 2. ABRIR CARRINHO ---
            open: async () => {
                try {
                    console.log("🛒 Abrindo carrinho...");
                    
                    if (!App.state.user) {
                        App.utils.toast("Faça login para ver o carrinho", "warning");
                        return App.router.go('auth');
                    }

                    const modal = document.getElementById('cart-modal');
                    if (!modal) return alert("Erro: Modal do carrinho não encontrado");
                    
                    modal.style.display = 'flex';
                    modal.style.zIndex = '2001';

                    // ZERA O FRETE AO ABRIR
                    App.cart.selectedFreight = 0;
                    App.cart.selectedFreightLabel = null;
                    const labelFee = document.getElementById('label-delivery-fee');
                    if (labelFee) labelFee.innerText = "R$ 0,00";

                    // Reseta Seletores Visuais
                    document.querySelectorAll('input[name="frete-tipo"]').forEach(r => r.checked = false);
                    ['ship-local', 'ship-correios', 'ship-retirada'].forEach(id => {
                        const el = document.getElementById(id);
                        if(el) el.style.display = 'none';
                    });
                    
                    // Esconde seletor de bairro (reset visual)
                    const distArea = document.getElementById('district-selector-area');
                    if(distArea) distArea.style.display = 'none';

                    // Carrega Configurações da Loja
                    if (App.state.cart.length > 0) {
                        const sid = App.state.cart[0].storeId;
                        try {
                            const { data, error } = await _sb.from('stores').select('taxa_entrega_padrao, endereco_retirada, cep_origem').eq('id', sid).single();
                            if (!error && data) {
                                App.cart.storeSettings = data;
                                // Atualiza textos visuais (sem ativar a opção)
                                const labelFeeLocal = document.getElementById('label-delivery-fee-local');
                                if (labelFeeLocal) labelFeeLocal.innerText = `R$ ${parseFloat(data.taxa_entrega_padrao || 0).toFixed(2)}`;
                                const txtPickup = document.getElementById('txt-pickup-addr');
                                if (txtPickup) txtPickup.innerText = data.endereco_retirada || "Endereço não configurado";
                            }
                        } catch (err) { console.error("Erro config loja:", err); }
                    }

                    App.cart.render();
                    App.cart.updateFloater();

                } catch (err) {
                    console.error("❌ Erro fatal carrinho:", err);
                }
            },

            // --- 3. RENDERIZAR E ATUALIZAR ---
            render: () => {
                const container = document.getElementById('cart-items-list');
                if (App.state.cart.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;"><i class="ri-shopping-cart-line" style="font-size:2rem;"></i><p>Seu carrinho está vazio.</p></div>';
                    App.cart.updateFloater();
                    return;
                }
                
                container.innerHTML = App.state.cart.map((item, idx) => {
                    let price = item.preco;
                    let discountHtml = '';
                    
                    if (App.cart.activeCoupon) {
                        const discount = price * (App.cart.activeCoupon.percent / 100);
                        price -= discount;
                        discountHtml = `<span class="text-xs" style="color:var(--success); margin-left:5px;">(-${App.cart.activeCoupon.percent}%)</span>`;
                    }
                    
                    return `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:600; color:var(--text-main);">${item.nome}</div>
                            <div class="text-xs text-muted">R$ ${item.preco.toFixed(2)} ${discountHtml}</div>
                        </div>
                        <button class="btn btn-sm btn-danger" style="padding:4px 8px;" onclick="App.cart.remove(${idx})"><i class="ri-delete-bin-line"></i></button>
                    </div>`;
                }).join('');

                App.cart.updateFloater();
            },

            remove: (index) => { 
                App.state.cart.splice(index, 1); 
                App.cart.render(); 
                if(App.state.cart.length === 0) {
                    App.cart.selectedFreight = 0;
                    document.getElementById('label-delivery-fee').innerText = "R$ 0,00";
                }
                App.cart.updateFloater();
            },

            calculateTotal: () => {
                let productsTotal = 0;
                App.state.cart.forEach(item => {
                    let p = item.preco;
                    if (App.cart.activeCoupon) {
                        p = p - (p * (App.cart.activeCoupon.percent / 100));
                    }
                    productsTotal += p;
                });
                const deliveryFee = App.cart.selectedFreight || 0;
                return { productsTotal, deliveryFee, finalTotal: productsTotal + deliveryFee };
            },

            updateFloater: () => {
                const count = App.state.cart.length;
                const totals = App.cart.calculateTotal();

                // 1. Bolinha do Header (Atualizado)
                const headerBadge = document.getElementById('header-cart-count');
                if (headerBadge) {
                    headerBadge.innerText = count;
                    headerBadge.style.display = count > 0 ? 'flex' : 'none';
                    if(count > 0) {
                        headerBadge.style.transform = "scale(1.2)";
                        setTimeout(() => headerBadge.style.transform = "scale(1)", 200);
                    }
                }

                // Listener gerenciado globalmente na init

                // 3. Modal Total
                const modalTotal = document.getElementById('cart-total-modal');
                if (modalTotal) modalTotal.innerText = `R$ ${totals.finalTotal.toFixed(2)}`;
                
                // 4. Label Frete
                const labelFee = document.getElementById('label-delivery-fee');
                if (labelFee) labelFee.innerText = `R$ ${totals.deliveryFee.toFixed(2)}`;
            },

            // --- 4. CHECKOUT & FRETE ---
            toggleShip: (type) => {
                App.cart.selectedShipping = type;
            
                // Gerencia a UI das opções
                ['ship-local', 'ship-correios', 'ship-retirada'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            
                const selected = document.getElementById(`ship-${type}`);
                if (selected) selected.style.display = 'block';
            
                // Gerencia a UI dos botões (Feedback Visual)
                document.querySelectorAll('.shipping-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.dataset.ship === type) {
                        btn.classList.add('active');
                    }
                });
            
                // Reseta Frete
                App.cart.selectedFreight = 0;
                App.cart.selectedFreightLabel = null; 
                document.getElementById('label-delivery-fee').innerText = "R$ 0,00";
            
                // Lógica Específica
                if (type === 'retirada') {
                    App.cart.setFreight(0, 'Retirada na Loja');
                } else if (type === 'local') {
                    const labelLocal = document.getElementById('label-delivery-fee-local');
                    if (labelLocal) labelLocal.innerText = "Informe seu CEP acima";
                } else if (type === 'correios') {
                    document.getElementById('correios-results').innerHTML = '<span class="text-xs text-muted">Digite o CEP acima.</span>';
                }
                
                App.cart.updateFloater();
            },

            validarEntregaLocal: async (cepDigitado) => {
                if (!cepDigitado || cepDigitado.length < 8) return App.utils.toast("Digite o CEP completo", "error");
                App.utils.toast("Consultando região...", "info");
                
                const dados = await App.logistics.consultarCep(cepDigitado);
                if (dados.erro) return App.utils.toast("CEP Inválido", "error");

                if (!dados.neighborhood) {
                    const precisaSelecionar = await App.logistics.handleUniqueCep(dados.city, dados.state);
                    if (precisaSelecionar) {
                        document.getElementById('label-delivery-fee-local').innerHTML = '<span style="color:orange">Selecione o bairro acima</span>';
                        return; 
                    }
                }

                const frete = await App.logistics.calcularFrete(cepDigitado);
                App.cart.setFreight(frete.local.preco, frete.local.metodo);
                const labelLocal = document.getElementById('label-delivery-fee-local');
                if(labelLocal) labelLocal.innerText = `R$ ${frete.local.preco}`;
            },

            calcCorreios: async () => {
                const cep = document.getElementById('cart-cep-input').value;
                if(cep.length < 8) return alert("CEP inválido");
                const resultDiv = document.getElementById('correios-results');
                resultDiv.innerHTML = '<span class="spin">🔄</span> Calculando...';
                
                const results = await App.logistics.calcularFrete(cep);
                const styleCard = `padding:12px; border:1px solid var(--border); margin-bottom:8px; cursor:pointer; border-radius:8px; display:flex; justify-content:space-between; background:var(--surface); color:var(--text-main); align-items:center; transition:0.2s;`;
                
                if(results && !results.erro) {
                    let html = '';
                    if(results.sedex) html += `<div onclick="App.cart.setFreight(${results.sedex.preco}, 'SEDEX')" style="${styleCard}"><strong>SEDEX</strong> <strong>R$ ${results.sedex.preco}</strong></div>`;
                    if(results.pac) html += `<div onclick="App.cart.setFreight(${results.pac.preco}, 'PAC')" style="${styleCard}"><strong>PAC</strong> <strong>R$ ${results.pac.preco}</strong></div>`;
                    resultDiv.innerHTML = html || 'Sem opções.';
                } else {
                    resultDiv.innerHTML = '<p class="text-xs text-danger">Erro ao calcular.</p>';
                }
            },

            setFreight: (val, label) => {
                App.cart.selectedFreight = parseFloat(val);
                App.cart.selectedFreightLabel = label; 
                App.cart.updateFloater();
                if(label) App.utils.toast(`Selecionado: ${label}`, 'success');
            },

            applyCoupon: async () => {
                const code = document.getElementById('cart-coupon-input').value.toUpperCase().trim();
                if (!code) return;
                if (App.state.cart.length === 0) {
                    document.getElementById('coupon-msg').innerHTML = '<span style="color:orange">Adicione itens ao carrinho primeiro.</span>';
                    return;
                }
                const storeId = App.state.cart[0].storeId;
                const { data, error } = await _sb.from('coupons').select('*').eq('code', code).eq('store_id', storeId).eq('active', true).single();
                if (error || !data) {
                    document.getElementById('coupon-msg').innerHTML = '<span style="color:red">Inválido.</span>';
                    App.cart.activeCoupon = null;
                } else {
                    document.getElementById('coupon-msg').innerHTML = `<span style="color:green">-${data.percent}% OFF!</span>`;
                    App.cart.activeCoupon = data;
                    App.cart.render();
                }
            },

            checkout: async () => {
                console.log("🛒 Iniciando Checkout...");
                try {
                    if (!App.state.user) return App.router.go('auth');
                    if (App.state.cart.length === 0) return;

                    // Verificação defensiva do módulo de pagamento
                    if (!App.payment || typeof App.payment.open !== 'function') {
                        console.error("❌ Erro crítico: App.payment não carregado.");
                        alert("Erro: O módulo de pagamento não foi carregado corretamente. Recarregue a página.");
                        return;
                    }

                    // Sugestão de Bebida
                    const temComida = App.state.cart.some(i => i.categoria === 'Comidas');
                    const temBebida = App.state.cart.some(i => i.categoria === 'Bebidas' || i.categoria === 'Drinks');
                    if (temComida && !temBebida) {
                        if (confirm("Vai uma bebida geladinha para acompanhar? 🥤")) {
                            document.getElementById('cart-modal').style.display = 'none';
                            App.catalog.filter('Bebidas');
                            return;
                        }
                    }

                    // Validação de Frete
                    const shipping = App.cart.selectedShipping;
                    let address = "";
                    const totals = App.cart.calculateTotal();

                    if (shipping === 'retirada') {
                        const pickupAddr = App.cart.storeSettings?.endereco_retirada || "Balcão";
                        address = `RETIRADA NA LOJA (${pickupAddr})`;
                    } 
                    else if (shipping === 'correios') {
                        if (!App.cart.selectedFreightLabel) return alert("Selecione uma opção de envio.");
                        const cep = document.getElementById('cart-cep-input').value;
                        address = `ENTREGA CORREIOS (${App.cart.selectedFreightLabel}) - CEP: ${cep}`; 
                    }
                    else if (shipping === 'local') {
                        const inputAddr = document.getElementById('cart-delivery-address');
                        const val = inputAddr ? inputAddr.value.trim() : "";
                        if (!val) return alert("Preencha o endereço de entrega.");
                        address = `ENTREGA LOCAL: ${val}`;
                    }
                    else {
                        return alert("Selecione uma forma de entrega!");
                    }

                    console.log("✅ Frete validado. Fechando carrinho e abrindo pagamento...");
                    document.getElementById('cart-modal').style.display = 'none';
                    App.utils.toast("Abrindo pagamento...", "info");

                    // Inicia Pagamento
                    const storeId = App.state.cart[0].storeId;
                    try {
                        const { data: storeData } = await _sb.from('stores').select('mp_public_key').eq('id', storeId).single();
                        const publicKeyToUse = (storeData && storeData.mp_public_key) ? storeData.mp_public_key : CONFIG.adminPublicKey;
                        mpInstance = new MercadoPago(publicKeyToUse);
                    } catch (e) {
                        console.warn("⚠️ Falha ao carregar chave da loja, usando admin:", e);
                        try { mpInstance = new MercadoPago(CONFIG.adminPublicKey); } catch(err) { throw new Error("Falha fatal ao iniciar Mercado Pago"); }
                    }

                    const itemsDesc = App.state.cart.map(i => i.nome).join(', ');
                    const deliveryInfo = { fee_val: totals.deliveryFee, fee_type: 'fixed', details: App.cart.selectedFreightLabel };

                    const cartItems = App.state.cart.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, qtd: 1 }));
                    if (App.payment && App.payment.open) {
                        App.payment.open(totals.finalTotal, {
                            product_id: App.state.cart[0].id,
                            items: cartItems,
                            store_id: storeId,
                            basePrice: totals.finalTotal,
                            address: `${address} (Itens: ${itemsDesc})`,
                            requer_montagem: false,
                            taxa: totals.finalTotal * 0.10,
                            delivery_info: JSON.stringify(deliveryInfo)
                        });
                    } else {
                        throw new Error("Módulo de pagamento indisponível no momento final.");
                    }

                } catch (err) {
                    console.error("❌ Erro no Checkout:", err);
                    alert("Erro ao finalizar compra: " + (err.message || err));
                    // Reabre o carrinho para o usuário não ficar travado
                    const modal = document.getElementById('cart-modal');
                    if (modal) modal.style.display = 'flex';
                }
            }
        }
    });
    console.log("🛒 Módulo Carrinho Carregado (Oficial)");
    
    // Inicialização robusta do listener do botão (addEventListener)
    const initCartBtn = () => {
        const btn = document.getElementById('btn-header-cart');
        if(btn) {
            // Remove listeners antigos para evitar duplicação (cloneNode trick)
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                App.cart.open();
            });
            console.log("✅ Cart button listener attached (robust).");
        } else {
            console.warn("⚠️ Cart button not found during init. Retrying...");
            setTimeout(initCartBtn, 500); // Retry logic
        }
    };

    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCartBtn);
    } else {
        initCartBtn();
    }
}
