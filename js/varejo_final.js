const Varejo = {
    state: { ticket: [], totalTicket: 0, allProductsCache: [], pendingQty: 1 },

    init: () => {
        console.log("🏪 Varejo Pronto (Com Controle de Estoque + Fiscal Completo)");
        Varejo.injectStyles();
        Varejo.injectHTML();
    },

    openPDV: () => {
        if (!document.getElementById('view-pos')) {
            Varejo.injectHTML();
        }
        App.router.go('pos');
        setTimeout(() => {
            const input = document.getElementById('pos-barcode');
            if (input) input.focus();
        }, 300);
    },

    injectStyles: () => {
        const style = document.createElement('style');
        style.innerHTML = `
            .pos-container{display:grid;grid-template-columns:2fr 1fr;gap:20px;height:calc(100vh - 140px);margin-top:20px}
            @media(max-width:768px){.pos-container{grid-template-columns:1fr}}
            .pos-screen{background:#1e293b;color:#fff;padding:20px;border-radius:12px;display:flex;flex-direction:column}
            .pos-input{background:#334155;border:2px solid #475569;color:#fff;font-size:1.5rem;padding:15px;width:100%;border-radius:8px;outline:0}
            .pos-input:focus{border-color:#2563eb}
            .ticket-list{flex:1;overflow-y:auto;margin:20px 0;border:1px dashed #475569;padding:10px;background:#00000033}
            .ticket-item{display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid #334155;font-size:1.1rem}
            .pos-total{font-size:3rem;font-weight:700;color:#4ade80;text-align:right;margin-top:10px}
            .pos-search-list{max-height:300px;overflow-y:auto;margin-top:10px;border:1px solid #334155;border-radius:4px;background:#1e293b;color:#fff;}
            
            /* Melhoria na lista de busca */
            .pos-search-item{display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #334155; cursor:pointer;}
            .pos-search-item:hover{background:#334155}
            .pos-stock-badge { font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
            .bg-low-stock { background: #fee2e2; color: #dc2626; }
            .bg-good-stock { background: #dcfce7; color: #166534; }

            .multi-pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px; }
            .pay-method-box { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .pay-method-box label { font-size: 0.8rem; font-weight: bold; color: #64748b; display: block; margin-bottom: 5px; }
            .pay-input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1.1rem; }
            .restante-display { background: #fee2e2; color: #b91c1c; padding: 15px; text-align: center; font-weight: bold; border-radius: 8px; margin-top: 15px; font-size: 1.2rem; }
            .restante-ok { background: #dcfce7; color: #166534; }
        `;
        document.head.appendChild(style);
    },

    injectHTML: () => {
        if (document.getElementById('view-pos')) return;
        const main = document.querySelector('main');
        const section = document.createElement('section');
        section.id = 'view-pos';
        section.className = 'view-section container';
        section.innerHTML = `
            <div class="pos-container">
                <div class="pos-screen">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3 style="margin:0; color:#fff;"><i class="ri-barcode-box-line"></i> Frente de Caixa</h3>
                        <button class="btn btn-sm btn-info" onclick="if(typeof Caixa !== 'undefined') Caixa.openView()">💰 Gestão de Caixa</button>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="pos-barcode" class="pos-input" placeholder="Bip, Nome ou 2*Código..." onkeypress="Varejo.handleScan(event)">
                        <button class="btn btn-primary" style="width:auto; padding: 0 25px;" onclick="Varejo.searchProduct()">🔍</button>
                    </div>
                    <div id="pos-last-item" style="margin-top:20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; min-height:60px; font-size:1.3rem; color:#fff; text-align:center;">Caixa Livre</div>
                    <div class="ticket-list" id="pos-ticket-list"></div>
                    <div class="pos-total" id="pos-total-display">R$ 0,00</div>
                </div>
                <div class="card">
                    <h4 style="margin-bottom: 20px;">Ações</h4>
                    <button class="btn btn-success btn-full" style="height:80px; font-size:1.4rem; margin-bottom: 15px;" onclick="Varejo.openPaymentModal()">FINALIZAR (F2)</button>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <button class="btn btn-warning" onclick="Varejo.suspendSale()">⏸️ Suspender</button>
                        <button class="btn btn-info" onclick="Varejo.resumeSale()">▶️ Retomar</button>
                    </div>
                    <button class="btn btn-secondary btn-full" style="margin-bottom:10px;" onclick="Varejo.openCalculator()">🧮 Calculadora</button>
                    <button class="btn btn-danger btn-full" onclick="Varejo.cancelSaleWithPassword()">Cancelar Venda</button>
                    <br><button class="btn btn-secondary btn-full" onclick="App.router.go('loja')">Sair</button>
                </div>
            </div>

            <div id="pos-search-modal" class="modal-overlay" style="z-index: 2005;">
                <div class="modal-content">
                    <div class="modal-header"><h3>Buscar Produto</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('pos-search-modal').style.display='none'">X</button></div>
                    <div class="modal-body">
                        <input type="text" id="pos-search-input" class="input-field" placeholder="Digite para filtrar..." oninput="Varejo.filterSearch(this.value)">
                        <div id="pos-search-results" class="pos-search-list"></div>
                    </div>
                </div>
            </div>

            <div id="pos-details-modal" class="modal-overlay" style="z-index: 2010;">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>ℹ️ Detalhes</h3>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('pos-details-modal').style.display='none'">X</button>
                    </div>
                    <div class="modal-body" id="pos-details-body" style="text-align:center;">
                        </div>
                </div>
            </div>

            <div id="pos-pay-modal" class="modal-overlay" style="z-index: 2005;">
                <div class="modal-content">
                    <div class="modal-header"><h3>Pagamento</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('pos-pay-modal').style.display='none'">X</button></div>
                    <div class="modal-body">
                        <div style="text-align:center; margin-bottom:10px;">
                            <span style="font-size:0.9rem; color:#64748b;">Total da Venda</span><br>
                            <h1 id="pos-pay-total" style="color: var(--primary); font-size: 2.5rem; margin:0;">R$ 0,00</h1>
                        </div>
                        <div class="multi-pay-grid">
                            <div class="pay-method-box" style="border-left: 4px solid #10b981;">
                                <label>💵 Dinheiro</label>
                                <input type="number" id="pay-money" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                            <div class="pay-method-box" style="border-left: 4px solid #3b82f6;">
                                <label>💠 Pix</label>
                                <input type="number" id="pay-pix" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                            <div class="pay-method-box" style="border-left: 4px solid #f59e0b;">
                                <label>💳 Crédito</label>
                                <input type="number" id="pay-credit" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                            <div class="pay-method-box" style="border-left: 4px solid #6366f1;">
                                <label>💳 Débito</label>
                                <input type="number" id="pay-debit" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                            <div class="pay-method-box" style="border-left: 4px solid #8b5cf6;">
                                <label>📝 Crediário</label>
                                <input type="number" id="pay-crediario" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                            <div class="pay-method-box" style="border-left: 4px solid #ef4444;">
                                <label>🏷️ Desconto</label>
                                <input type="number" id="pay-desconto" class="pay-input" placeholder="0.00" oninput="Varejo.calcRestante()">
                            </div>
                        </div>
                        <div id="pay-restante-box" class="restante-display">Falta: R$ 0,00</div>
                    </div>
                    <div class="modal-footer">
                        <button id="btn-finalizar-venda" class="btn btn-success btn-full" disabled onclick="Varejo.finalizeMultiPayment()">CONFIRMAR VENDA</button>
                    </div>
                </div>
            </div>`;
        main.appendChild(section);
    },

    handleScan: (e) => { if (e.key === 'Enter') Varejo.searchProduct(e.target.value.trim()); },

    // Parsa o input para verificar se tem multiplicador (ex: 2*CODIGO ou 3*NOME)
    parseMultiplier: (input) => {
        const match = input.match(/^(\d+)\*(.+)$/);
        if (match) {
            return { qtd: parseInt(match[1]), term: match[2].trim() };
        }
        return { qtd: 1, term: input };
    },

    searchProduct: async (term = "") => {
        const rawInput = term || document.getElementById('pos-barcode').value.trim();
        const { qtd, term: searchTerm } = Varejo.parseMultiplier(rawInput);

        // Armazena a quantidade desejada para uso posterior
        Varejo.state.pendingQty = qtd;

        document.getElementById('pos-search-modal').style.display = 'flex';
        document.getElementById('pos-search-input').value = searchTerm;
        document.getElementById('pos-search-input').focus();
        const container = document.getElementById('pos-search-results');
        container.innerHTML = '<p style="padding:10px">Buscando no estoque...</p>';

        // --- BUSCA INCLUINDO ESTOQUE ---
        let query = _sb.from('products').select('*').eq('store_id', App.state.storeId).limit(50);
        if (searchTerm) query = query.or(`nome.ilike.%${searchTerm}%,codigo_barras.ilike.%${searchTerm}%,codigo_cardapio.ilike.%${searchTerm}%`);

        const { data, error } = await query;
        if (error) return;
        Varejo.allProductsCache = data || [];

        // Se a busca retornar exatamente 1 produto E veio de código de barras COM multiplicador, adiciona direto
        if (data && data.length === 1 && qtd > 1) {
            Varejo.addItem(data[0], qtd);
            document.getElementById('pos-search-modal').style.display = 'none';
            return;
        }

        Varejo.renderSearchResults(Varejo.allProductsCache);
    },

    filterSearch: (term) => {
        if (!Varejo.allProductsCache) return;
        const lower = term.toLowerCase();
        const filtered = Varejo.allProductsCache.filter(p => p.nome.toLowerCase().includes(lower) || (p.codigo_barras && p.codigo_barras.includes(lower)));
        Varejo.renderSearchResults(filtered);
    },

    // --- RENDERIZAÇÃO MELHORADA COM ESTOQUE ---
    renderSearchResults: (products) => {
        const container = document.getElementById('pos-search-results');
        if (!products || products.length === 0) { container.innerHTML = '<p style="padding:10px">Nada encontrado.</p>'; return; }

        const pendingQty = Varejo.state.pendingQty || 1;
        const qtyBadge = pendingQty > 1 ? `<span style="background:#f59e0b; color:#000; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold; margin-left:8px;">${pendingQty}x</span>` : '';

        container.innerHTML = products.map(p => {
            const pSafe = JSON.stringify(p).replace(/"/g, '&quot;');

            // Lógica Visual de Estoque
            const estoque = p.estoque || 0;
            const hasStock = estoque > 0;
            const stockClass = hasStock ? 'bg-good-stock' : 'bg-low-stock';
            const stockText = hasStock ? `${estoque} un` : 'SEM ESTOQUE';

            // Detalhes extras para Roupas/Calçados
            let extraInfo = '';
            if (p.categoria === 'Roupas' || p.categoria === 'Calçados') {
                extraInfo = `<div style="font-size:0.75rem; color:#94a3b8;">Tam: ${p.sizes || 'U'} | Cores: ${p.cores || '-'}</div>`;
            }
            // Detalhes extras para Autopeças
            if (p.cod_aplicacao) {
                extraInfo += `<div style="font-size:0.75rem; color:#94a3b8;">🚗 ${p.cod_aplicacao}</div>`;
            }
            if (p.localizacao) {
                extraInfo += `<div style="font-size:0.75rem; color:#6366f1;">📍 ${p.localizacao}</div>`;
            }

            return `
            <div class="pos-search-item">
                <div style="flex:1" onclick="Varejo.addItem(${pSafe}, ${pendingQty})">
                    <div style="font-weight:bold;">${p.nome}${qtyBadge}</div>
                    ${extraInfo}
                    <div style="display:flex; gap:10px; align-items:center; margin-top:4px;">
                        <span class="text-muted">R$ ${p.preco.toFixed(2)}</span>
                        <span class="pos-stock-badge ${stockClass}">${stockText}</span>
                    </div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="Varejo.showDetails(${pSafe})">ℹ️</button>
            </div>`;
        }).join('');
    },

    // --- NOVA FUNÇÃO: MOSTRAR DETALHES ---
    showDetails: (p) => {
        const modal = document.getElementById('pos-details-modal');
        const body = document.getElementById('pos-details-body');

        let imgHtml = p.imagem_url
            ? `<img src="${p.imagem_url}" style="width:100%; height:200px; object-fit:cover; border-radius:8px; margin-bottom:10px;">`
            : `<div style="width:100%; height:150px; background:#eee; display:flex; align-items:center; justify-content:center; border-radius:8px; margin-bottom:10px;">Sem Imagem</div>`;

        body.innerHTML = `
            ${imgHtml}
            <h4>${p.nome}</h4>
            <h2 style="color:var(--primary); margin:10px 0;">R$ ${p.preco.toFixed(2)}</h2>
            ${p.preco_prazo ? `<p style="color:#64748b;">Prazo/Cartão: R$ ${parseFloat(p.preco_prazo).toFixed(2)}</p>` : ''}
            <div style="text-align:left; background:#f8fafc; padding:10px; border-radius:8px; font-size:0.9rem;">
                <p><strong>📦 Estoque Atual:</strong> ${p.estoque || 0} unidades</p>
                <p><strong>🔢 Cód. Barras:</strong> ${p.codigo_barras || '---'}</p>
                <p><strong>🏷️ Categoria:</strong> ${p.categoria || 'Geral'}</p>
                ${p.localizacao ? `<p><strong>📍 Localização:</strong> ${p.localizacao}</p>` : ''}
                ${p.cod_aplicacao ? `<p><strong>🚗 Aplicação:</strong> ${p.cod_aplicacao}</p>` : ''}
                ${p.descricao ? `<hr style="margin:5px 0"><p><strong>Obs:</strong> ${p.descricao}</p>` : ''}
            </div>
            <button class="btn btn-primary btn-full" style="margin-top:15px;" onclick="Varejo.addItemFromModal(${p.id})">Adicionar ao Carrinho</button>
        `;
        modal.style.display = 'flex';
    },

    // Helper para adicionar direto do modal de detalhes
    addItemFromModal: (id) => {
        const prod = Varejo.allProductsCache.find(p => p.id === id);
        if (prod) {
            Varejo.addItem(prod, Varejo.state.pendingQty || 1);
            document.getElementById('pos-details-modal').style.display = 'none';
        }
    },

    // --- ADICIONAR ITEM COM VALIDAÇÃO DE ESTOQUE E SUPORTE A QUANTIDADE ---
    addItem: (prod, qtd = 1) => {
        // 1. Conta quantos desse item já estão no carrinho
        const qtdNoCarrinho = Varejo.state.ticket.filter(item => item.id === prod.id).length;
        const qtdDesejada = qtdNoCarrinho + qtd;
        const estoqueAtual = prod.estoque || 0;

        // 2. Bloqueio de Estoque
        if (qtdDesejada > estoqueAtual) {
            // Toca som de erro (opcional)
            try { new Audio('https://actions.google.com/sounds/v1/alarms/error.ogg').play(); } catch (e) { }

            alert(`⚠️ ESTOQUE INSUFICIENTE!\n\nDisponível: ${estoqueAtual}\nNo carrinho: ${qtdNoCarrinho}\nTentativa: +${qtd} (total: ${qtdDesejada})`);
            return; // Cancela a adição
        }

        // --- ALERTA DE ESTOQUE BAIXO ---
        if (estoqueAtual < 5) {
            App.utils.toast(`⚠️ Estoque Baixo: ${estoqueAtual} unid. restantes!`, "warning");
        }

        // 3. Adiciona a quantidade solicitada
        for (let i = 0; i < qtd; i++) {
            Varejo.state.ticket.push(prod);
        }
        Varejo.renderTicket();

        const qtyLabel = qtd > 1 ? `${qtd}x ` : '';
        document.getElementById('pos-last-item').innerHTML = `<strong>${qtyLabel}${prod.nome}</strong> - R$ ${(prod.preco * qtd).toFixed(2)}`;

        // Fecha busca e foca no input
        document.getElementById('pos-search-modal').style.display = 'none';
        document.getElementById('pos-barcode').value = '';
        document.getElementById('pos-barcode').focus();

        // Reset pendingQty
        Varejo.state.pendingQty = 1;
    },

    // --- FUNCIONALIDADES EXTRAS: SUSPENDER, RETOMAR, CALCULADORA ---

    suspendSale: () => {
        if (Varejo.state.ticket.length === 0) return alert("Carrinho vazio!");
        if (confirm("Suspender venda atual para atender outro cliente?")) {
            localStorage.setItem('suspended_sale', JSON.stringify(Varejo.state.ticket));
            Varejo.state.ticket = [];
            Varejo.renderTicket();
            App.utils.toast("Venda Suspensa! Clique em 'Retomar' para voltar.", "info");
        }
    },

    resumeSale: () => {
        const saved = localStorage.getItem('suspended_sale');
        if (!saved) return alert("Nenhuma venda suspensa encontrada.");

        if (Varejo.state.ticket.length > 0) {
            if (!confirm("Existe uma venda atual em andamento. Deseja sobrescrevê-la com a suspensa?")) return;
        }

        try {
            Varejo.state.ticket = JSON.parse(saved);
            Varejo.renderTicket();
            localStorage.removeItem('suspended_sale');
            App.utils.toast("Venda Retomada!", "success");
        } catch (e) {
            alert("Erro ao retomar venda.");
        }
    },

    openCalculator: () => {
        const html = `
        <div id="modal-calculator" class="modal-overlay" style="display:flex; z-index:9999;">
            <div class="modal-content" style="max-width:320px; background:#1e293b; padding:15px;">
                <div class="modal-header" style="border:0; padding-bottom:5px;">
                    <h3 style="color:#fff;">🧮 Calc</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-calculator').remove()">X</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="calc-display" readonly style="width:100%; height:50px; font-size:1.5rem; text-align:right; margin-bottom:10px; background:#334155; color:#fff; border:none; padding:5px;">
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:5px;">
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('7')">7</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('8')">8</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('9')">9</button>
                        <button class="btn btn-warning" onclick="Varejo.calcOp('/')">÷</button>
                        
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('4')">4</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('5')">5</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('6')">6</button>
                        <button class="btn btn-warning" onclick="Varejo.calcOp('*')">×</button>
                        
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('1')">1</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('2')">2</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('3')">3</button>
                        <button class="btn btn-warning" onclick="Varejo.calcOp('-')">-</button>
                        
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('0')">0</button>
                        <button class="btn btn-secondary" onclick="Varejo.calcAppend('.')">.</button>
                        <button class="btn btn-success" onclick="Varejo.calcResult()">=</button>
                        <button class="btn btn-warning" onclick="Varejo.calcOp('+')">+</button>
                    </div>
                    <button class="btn btn-danger btn-full" style="margin-top:5px;" onclick="document.getElementById('calc-display').value=''">C</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    calcAppend: (v) => document.getElementById('calc-display').value += v,
    calcOp: (op) => document.getElementById('calc-display').value += op,
    calcResult: () => {
        try {
            const val = eval(document.getElementById('calc-display').value);
            document.getElementById('calc-display').value = val;
        } catch (e) {
            document.getElementById('calc-display').value = 'Erro';
        }
    },

    renderTicket: () => {
        const list = document.getElementById('pos-ticket-list');
        list.innerHTML = '';
        let total = 0;
        Varejo.state.ticket.forEach(p => total += p.preco);

        // Agrupa itens iguais
        const counts = {};
        Varejo.state.ticket.forEach(p => { counts[p.id] = (counts[p.id] || 0) + 1; });
        const uniqueIds = [...new Set(Varejo.state.ticket.map(p => p.id))];

        uniqueIds.forEach(id => {
            const item = Varejo.state.ticket.find(p => p.id === id);
            const qtd = counts[id];
            list.innerHTML += `<div class="ticket-item"><div>${qtd}x ${item.nome}</div><div>R$ ${(item.preco * qtd).toFixed(2)}</div></div>`;
        });

        Varejo.state.totalTicket = total;
        document.getElementById('pos-total-display').innerText = `R$ ${total.toFixed(2)}`;
    },

    clearTicket: () => { Varejo.state.ticket = []; Varejo.renderTicket(); document.getElementById('pos-last-item').innerText = "Cancelado"; },

    cancelSaleWithPassword: async () => {
        if (Varejo.state.ticket.length === 0) return alert("Carrinho vazio.");
        const pwd = prompt("🔒 Senha Admin:");
        if (!pwd) return;
        const { data: store } = await _sb.from('stores').select('pin_seguranca').eq('id', App.state.storeId).single();
        if (store && store.pin_seguranca === pwd) { Varejo.clearTicket(); alert("Venda Cancelada."); } else { alert("Senha incorreta!"); }
    },

    openPaymentModal: async () => {
        if (Varejo.state.ticket.length === 0) return alert("Adicione produtos primeiro!");

        if (typeof Caixa !== 'undefined' && !Caixa.state.session) {
            const session = await Caixa.checkSession();
            if (!session) {
                if (confirm("⚠️ O CAIXA ESTÁ FECHADO!\nDeseja abrir o caixa agora?")) Caixa.openView();
                return;
            }
        }

        // Reseta os campos
        ['pay-money', 'pay-pix', 'pay-credit', 'pay-debit', 'pay-crediario', 'pay-desconto'].forEach(id => document.getElementById(id).value = '');

        document.getElementById('pos-pay-total').innerText = `R$ ${Varejo.state.totalTicket.toFixed(2)}`;
        document.getElementById('pos-pay-modal').style.display = 'flex';
        Varejo.calcRestante();

        setTimeout(() => document.getElementById('pay-money').focus(), 100);
    },

    calcRestante: () => {
        const total = Varejo.state.totalTicket;
        const money = parseFloat(document.getElementById('pay-money').value) || 0;
        const pix = parseFloat(document.getElementById('pay-pix').value) || 0;
        const credit = parseFloat(document.getElementById('pay-credit').value) || 0;
        const debit = parseFloat(document.getElementById('pay-debit').value) || 0;
        const crediario = parseFloat(document.getElementById('pay-crediario').value) || 0;
        const desconto = parseFloat(document.getElementById('pay-desconto').value) || 0;

        const pago = money + pix + credit + debit + crediario;
        // O desconto reduz o total a ser pago, ou funciona como um pagamento.
        // Logica: Saldo Devedor = Total - (Pagos + Desconto) ?
        // Sim, desconto abate do valor final.
        const restante = total - (pago + desconto);

        const display = document.getElementById('pay-restante-box');
        const btn = document.getElementById('btn-finalizar-venda');

        if (restante > 0.01) {
            display.innerText = `Falta: R$ ${restante.toFixed(2)}`;
            display.className = 'restante-display';
            btn.disabled = true;
        } else if (restante < -0.01) {
            display.innerText = `Troco: R$ ${Math.abs(restante).toFixed(2)}`;
            display.className = 'restante-display restante-ok';
            btn.disabled = false;
        } else {
            display.innerText = "Total Pago ✅";
            display.className = 'restante-display restante-ok';
            btn.disabled = false;
        }
    },

    // 🔥 FINALIZAÇÃO COM ESTRUTURA FISCAL COMPLETA
    finalizeMultiPayment: async () => {
        // --- 1. PREPARAÇÃO (Cálculos e Validações) ---
        const total = Varejo.state.totalTicket;
        const sessionId = (typeof Caixa !== 'undefined' && Caixa.state.session) ? Caixa.state.session.id : null;

        if (!sessionId && typeof Caixa !== 'undefined') return alert("Erro: Caixa fechado.");

        // 🔥 ESTRUTURA DUAL: Compatível com Caixa + Fiscal
        const payments = [
            { tipo: 'Dinheiro', code: '01', val: parseFloat(document.getElementById('pay-money').value) || 0 },
            { tipo: 'Pix', code: '17', val: parseFloat(document.getElementById('pay-pix').value) || 0 },
            { tipo: 'Crédito', code: '03', val: parseFloat(document.getElementById('pay-credit').value) || 0 },
            { tipo: 'Débito', code: '04', val: parseFloat(document.getElementById('pay-debit').value) || 0 },
            { tipo: 'Crediário', code: '05', val: parseFloat(document.getElementById('pay-crediario').value) || 0 }
        ].filter(p => p.val > 0);

        // --- VALIDAÇÃO ESPECÍFICA DE CREDIÁRIO ---
        const valorCrediario = parseFloat(document.getElementById('pay-crediario').value) || 0;
        let clienteCrediario = null;
        if (valorCrediario > 0) {
            // 1. Senha do Lojista
            const pwd = prompt("🔒 CREDIÁRIO: Digite a Senha do Gerente para Autorizar:");
            if (!pwd) return alert("Autorização cancelada.");

            // Verifica senha (simples check no store.pin_seguranca)
            const { data: store } = await _sb.from('stores').select('pin_seguranca').eq('id', App.state.storeId).single();
            if (!store || store.pin_seguranca !== pwd) return alert("❌ Senha Incorreta!");

            // 2. Seleção de Cliente
            const { data: clientes } = await _sb.from('profiles').select('id, nome_completo, cpf').eq('store_id', App.state.storeId).not('nome_completo', 'is', null);

            if (!clientes || clientes.length === 0) {
                return alert("⚠️ Nenhum cliente cadastrado para vincular ao crediário.");
            }

            // Exemplo simples usando prompt
            let clienteMsg = "Selecione o Cliente pelo ID:\n\n";
            clientes.slice(0, 15).forEach(c => clienteMsg += `[${c.id}] ${c.nome_completo}\n`);
            if (clientes.length > 15) clienteMsg += "... (mais clientes ocultos)";

            const clienteIdInput = prompt(clienteMsg);

            if (!clienteIdInput) return alert("Seleção cancelada.");

            clienteCrediario = clientes.find(c => c.id == clienteIdInput);

            if (!clienteCrediario) return alert("❌ Cliente inválido.");

            // 3. Regra de Crédito: Verifica Dívidas
            const { data: dividas } = await _sb.from('financial_records')
                .select('data_vencimento')
                .eq('cliente_id', clienteCrediario.id)
                .eq('status', 'pendente')
                .order('data_vencimento', { ascending: true })
                .limit(1);

            if (dividas && dividas.length > 0) {
                const hoje = new Date();
                const venc = new Date(dividas[0].data_vencimento);
                const diffTime = venc - hoje;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Se (diffDays < 0) está atrasado. Se (diffDays < 30) está vencendo em breve
                if (diffDays < 0) {
                    if (!confirm(`⚠️ CLIENTE COM DÉBITO ATRASADO (${Math.abs(diffDays)} dias)!\nDeseja autorizar mesmo assim?`)) return;
                }
            }


        }

        const desconto = parseFloat(document.getElementById('pay-desconto').value) || 0;

        if (payments.length === 0 && desconto < total) return alert("Informe pelo menos um valor (ou desconto total).");

        // 🔥 IMPORTANTE: Captura cópia dos itens AGORA, antes de limpar o carrinho
        const itensParaFiscal = [...Varejo.state.ticket];

        App.utils.toast("Finalizando...", "info");

        try {
            // --- 2. SALVAR NO SUPABASE (Com Estrutura Correta) ---
            const payloadOrder = {
                store_id: App.state.storeId,
                session_id: sessionId,
                cliente_id: App.state.user.id,
                status: 'concluido',
                origem_venda: 'pdv',
                taxa_servico: 0,
                total_pago: total - desconto, // Valor líquido
                metodo_pagamento: payments.length > 1 ? 'Multiplos' : (payments[0]?.tipo || 'Desconto Total'),
                // 🔥 IMPORTANTE: Salvar 'pagamentos' dentro de 'observacao' como JSON
                // para o Caixa conseguir ler o breakdown (Pix vs Crédito vs Dinheiro)
                observacao: JSON.stringify({
                    pagamentos: payments, // 🔥 ARRAY COM TIPOS CORRETOS
                    desconto: desconto,   // 🔥 Salva o desconto
                    itens: itensParaFiscal,
                    vendedor: App.state.profile?.nome_completo || 'Balcão'
                })
            };

            const { data: orderSalva, error } = await _sb.from('orders')
                .insert(payloadOrder)
                .select()  // <--- Garante retorno dos dados
                .single(); // <--- Garante objeto único

            if (error) throw error;

            const realOrderId = orderSalva.id; // ID gerado pelo banco

            // --- 3. BAIXA DE ESTOQUE (COM FALLBACK) ---
            const contagem = {};
            itensParaFiscal.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + 1; });

            const itensParaBaixar = Object.keys(contagem).map(prodId => ({
                id: prodId,
                qtd: contagem[prodId]
            }));

            // Tenta RPC primeiro
            const { error: erroRPC } = await _sb.rpc('descontar_estoque', { itens: itensParaBaixar });

            if (erroRPC) {
                console.warn("⚠️ RPC falhou, tentando update manual...", erroRPC);
                // Fallback Manual (Loop)
                for (const item of itensParaBaixar) {
                    const { data: prod } = await _sb.from('products').select('estoque').eq('id', item.id).single();
                    if (prod) {
                        const novoEstoque = (prod.estoque || 0) - item.qtd;
                        await _sb.from('products').update({ estoque: novoEstoque }).eq('id', item.id);
                    }
                }
            }

            // --- 4. LIMPEZA DA TELA ---
            document.getElementById('pos-pay-modal').style.display = 'none';
            Varejo.state.ticket = []; // Limpa carrinho
            Varejo.renderTicket();
            document.getElementById('pos-last-item').innerText = "Caixa Livre";
            document.getElementById('pos-barcode').focus();
            try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play(); } catch (e) { }

            // --- 5. COMPROVANTE CREDIÁRIO & LANÇAMENTO DE DÍVIDA ---
            if (valorCrediario > 0 && clienteCrediario) {
                const dataHora = new Date().toLocaleString('pt-BR');

                // 5.1 REGISTRA DÍVIDA NO BANCO DE DADOS
                const { error: errDiv } = await _sb.from('financial_records').insert({
                    store_id: App.state.storeId,
                    cliente_id: clienteCrediario.id,
                    tipo: 'receita',
                    descricao: `Venda Crediário - ${dataHora}`,
                    valor: valorCrediario,
                    data_vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 dias padrão
                    status: 'pendente'
                });
                if (errDiv) console.error("Erro ao salvar dívida:", errDiv);

                // 5.2 GERA RECIBO DE CONFISSÃO DE DÍVIDA
                const reciboHtml = `
                     <html>
                     <body style="font-family:'Courier New'; font-size:12px; width:300px; color:black;">
                         <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
                             <h2 style="margin:0;">COMPROVANTE DE VENDA</h2>
                             <b>CREDIÁRIO / FIADO</b>
                         </div>
                         <div><b>Data:</b> ${dataHora}</div>
                         <div><b>Cliente:</b> ${clienteCrediario.nome_completo}</div>
                         <div><b>CPF:</b> ${clienteCrediario.cpf || 'Não Informado'}</div>
                         <br>
                         <div style="border-bottom:1px dashed #000; margin-bottom:5px;">ITENS:</div>
                         ${itensParaFiscal.map(i => `<div>${i.qtd}x ${i.nome} - R$ ${(i.price * i.qtd).toFixed(2)}</div>`).join('')}
                         <br>
                         ${desconto > 0 ? `<div style="text-align:right;">Desconto: -R$ ${desconto.toFixed(2)}</div>` : ''}
                         <div style="font-size:14px; font-weight:bold; text-align:right;">TOTAL A PAGAR: R$ ${valorCrediario.toFixed(2)}</div>
                         <br>
                         <div style="font-size:10px; text-align:justify;">
                             Reconheço a dívida acima descrita e comprometo-me a pagá-la na data de vencimento combinada.
                         </div>
                         <br><br>
                         <div style="border-top:1px solid #000; text-align:center; padding-top:5px;">
                             Assinatura do Cliente
                         </div>
                     </body>
                     </html>
                 `;

                // Imprime recibo oculto
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                iframe.contentDocument.write(reciboHtml);
                iframe.contentDocument.close();
                setTimeout(() => { iframe.contentWindow.print(); iframe.remove(); }, 500);
            }

            // --- 6. EMISSÃO FISCAL (ESTRUTURA COMPLETA) ---
            setTimeout(() => {
                // 1. Pergunta NFC-e
                if (confirm("✅ Venda Registrada!\n\nDeseja emitir a NFC-e agora?")) {
                    const paymentsParaFiscal = payments.map(p => ({
                        code: p.code, val: p.val, tipo: p.tipo, metodo: p.tipo, payment_method: p.tipo, valor: p.val, amount: p.val
                    }));

                    if (typeof App.fiscal !== 'undefined' && App.fiscal.emitirNFCe) {
                        App.fiscal.emitirNFCe(realOrderId, total - desconto, paymentsParaFiscal, itensParaFiscal, { discount: desconto });
                    } else {
                        console.error("❌ Módulo fiscal não encontrado!");
                    }
                }

                // 2. Pergunta WhatsApp
                setTimeout(() => {
                    if (confirm("📱 Enviar comprovante via WhatsApp?")) {
                        const tel = prompt("Digite o número (com DDD):", clienteCrediario?.celular || "55");
                        if (tel) {
                            const itensTexto = itensParaFiscal.map(i => `${i.qtd}x ${i.nome}`).join('%0A');
                            const msg = `*COMPROVANTE DE VENDA*%0A%0A${itensTexto}%0A%0ATotal: R$ ${total.toFixed(2)}%0A%0AObrigado pela preferência!`;
                            window.open(`https://wa.me/${tel.replace(/\D/g, '')}?text=${msg}`, '_blank');
                        }
                    }
                }, 1000);

            }, 500);

        } catch (err) {
            console.error("❌ Erro ao finalizar venda:", err);
            alert("Erro ao salvar venda: " + err.message);
        }
    }
};

// 🔥 LOG DE CONFIRMAÇÃO
console.log("✅ Módulo Varejo (PDV) Carregado - Estoque + Fiscal Completo");
