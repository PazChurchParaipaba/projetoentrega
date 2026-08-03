/**
 * NAXIO PRO PDV - Módulo Varejo Modernizado
 * Versão: 5.0.0
 * Descrição: Sistema de PDV com interface glassmorphism, multi-abas,
 * busca inteligente e integração fiscal completa.
 */

const Varejo = {
    state: {
        allProductsCache: [],
        currentTabIndex: 0,
        tabs: [
            { id: 1, ticket: [], cliente: null, total: 0 },
            { id: 2, ticket: [], cliente: null, total: 0 },
            { id: 3, ticket: [], cliente: null, total: 0 }
        ],
        ticket: [],
        currentCliente: null,
        totalTicket: 0,
        pendingQty: 1,
        _lastScannedCode: null
    },

    init: async () => {
        console.log("🏪 Naxio Pro PDV: Iniciando sistema...");
        
        // 🔥 Garante que a sessão de caixa esteja identificada para este terminal
        if (typeof Caixa !== 'undefined' && typeof Caixa.checkSession === 'function') {
            try { await Caixa.checkSession(); } catch(e) { console.warn("Erro ao checar sessão:", e); }
        }

        Varejo.injectStyles();
        Varejo.injectHTML();
        Varejo.startClock();
        Varejo.loadCategories();
        Varejo.loadProductsByCategory(null);
        Varejo.switchTab(0);
    },

    openPDV: () => {
        App.router.go('pos');
    },

    injectStyles: () => {
        if (document.getElementById('pos-styles')) return;
        const style = document.createElement('style');
        style.id = 'pos-styles';
        style.innerHTML = `
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;600;700;800&display=swap');

            :root {
                --pos-bg: #030712;
                --pos-panel: rgba(17, 24, 39, 0.75);
                --pos-accent: #3b82f6;
                --pos-accent-gradient: linear-gradient(135deg, #3b82f6, #2563eb);
                --pos-success: #10b981;
                --pos-warning: #f59e0b;
                --pos-danger: #ef4444;
                --pos-text: #f8fafc;
                --pos-text-muted: #94a3b8;
                --pos-border: rgba(255, 255, 255, 0.08);
                --pos-glass: blur(25px) saturate(200%);
                --shadow-premium: 0 25px 60px rgba(0,0,0,0.6);
            }

            #view-pos {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: radial-gradient(circle at 10% 20%, #111827 0%, #030712 100%);
                color: var(--pos-text); font-family: 'Plus Jakarta Sans', sans-serif;
                z-index: 1000; overflow: hidden; display: none;
            }

            #view-pos.active { display: flex !important; }

            .pos-container {
                display: grid;
                grid-template-columns: 280px 1fr 400px;
                grid-template-rows: 80px 1fr 60px;
                width: 100%; height: 100%;
                gap: 15px; padding: 15px; box-sizing: border-box;
            }

            .pos-tile {
                background: var(--pos-panel);
                backdrop-filter: var(--pos-glass);
                -webkit-backdrop-filter: var(--pos-glass);
                border: 1px solid var(--pos-border);
                border-radius: 24px;
                overflow: hidden;
                display: flex; flex-direction: column;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            }

            .pos-header-bar {
                grid-column: 1 / -1;
                display: flex; justify-content: space-between; align-items: center;
                padding: 0 25px;
            }
            .brand-logo { display:flex; align-items:center; gap:12px; font-weight:800; font-size:1.4rem; color:#fff; }
            .brand-logo i { background: var(--pos-accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 1.8rem; }

            .pos-nav-tabs { display: flex; gap: 8px; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 14px; }
            .nav-tab {
                padding: 10px 20px; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
                transition: 0.3s; color: var(--pos-text-muted); display: flex; align-items: center; gap: 8px;
            }
            .nav-tab.active { background: var(--pos-accent-gradient); color: #fff; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
            .cart-badge { background: #fff; color: var(--pos-accent); padding: 2px 6px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; }

            .cat-sidebar { grid-row: 2 / -1; }
            .cat-list { padding: 10px; flex: 1; overflow-y: auto; }
            .cat-btn {
                padding: 15px 20px; border-radius: 16px; margin-bottom: 6px; cursor: pointer;
                display: flex; align-items: center; gap: 12px; transition: 0.2s;
                color: var(--pos-text-muted); font-weight: 600; border: 1px solid transparent;
            }
            .cat-btn:hover { background: rgba(255,255,255,0.03); color: #fff; }
            .cat-btn.active { background: rgba(59, 130, 246, 0.1); color: var(--pos-accent); border-color: rgba(59, 130, 246, 0.2); }

            .main-content { gap: 15px; display: flex; flex-direction: column; grid-row: 2 / 3; }
            .search-wrapper { padding: 20px 20px 0 20px; }
            .search-input-group { position: relative; height: 65px; margin-bottom: 5px; }
            .search-input-group i { position: absolute; left: 22px; top: 50%; transform: translateY(-50%); font-size: 1.5rem; color: var(--pos-accent); z-index: 10; pointer-events: none; }
            .search-input-group input {
                width: 100%; height: 100%; background: rgba(0,0,0,0.3); border: 2px solid var(--pos-border);
                border-radius: 20px; padding: 0 30px 0 65px; color: #fff; font-size: 1.2rem; transition: 0.3s;
                font-family: 'Outfit', sans-serif; position: relative;
            }
            .search-input-group input:focus { border-color: var(--pos-accent); box-shadow: 0 0 20px rgba(59, 130, 246, 0.15); outline: none; }

            .product-grid-view { 
                flex: 1; padding: 10px 20px 20px 20px; 
                display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); 
                gap: 15px; overflow-y: auto;
            }
            .product-card {
                background: rgba(255,255,255,0.03); border: 1px solid var(--pos-border);
                border-radius: 20px; padding: 15px; transition: 0.3s; cursor: pointer;
                display: flex; flex-direction: column; gap: 8px; position: relative;
            }
            .product-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.06); border-color: var(--pos-accent); }
            .product-card img { width: 100%; height: 120px; object-fit: cover; border-radius: 14px; }
            .product-card .name { font-weight: 700; font-size: 0.95rem; height: 2.6rem; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .product-card .price { color: var(--pos-accent); font-weight: 800; font-size: 1.2rem; }

            .checkout-sidebar { grid-row: 2 / -1; }
            .cart-scroller { flex: 1; overflow-y: auto; padding: 0 15px; }
            .cart-row {
                display: flex; gap: 12px; padding: 15px; border-radius: 18px;
                background: rgba(255,255,255,0.02); border: 1px solid var(--pos-border);
                margin-bottom: 10px; transition: 0.2s; align-items: center;
            }
            .cart-qty { width: 40px; height: 40px; background: var(--pos-accent-gradient); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1rem; }
            .cart-price { font-weight: 800; font-size: 1.1rem; color: #fff; }
            .t-remove { color: var(--pos-danger); opacity: 0.4; cursor: pointer; transition: 0.3s; font-size: 1.2rem; }
            .t-remove:hover { opacity: 1; transform: scale(1.1); }

            .summary-zone { padding: 25px; border-top: 1px solid var(--pos-border); background: rgba(0,0,0,0.2); }
            .summary-total { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
            .total-amount { font-size: 2.8rem; font-weight: 950; color: #fff; font-family: 'Outfit'; }

            .btn-action-primary {
                width: 100%; height: 75px; border: none; border-radius: 20px;
                background: var(--pos-accent-gradient); color: #fff;
                font-weight: 800; font-size: 1.4rem; cursor: pointer; transition: 0.3s;
                box-shadow: 0 10px 30px rgba(37, 99, 235, 0.4);
                display: flex; align-items: center; justify-content: center; gap: 15px;
            }
            .btn-action-primary:hover { transform: scale(1.02); box-shadow: 0 15px 40px rgba(37, 99, 235, 0.5); }

            .modal-overlay { position: fixed; inset: 0; background: rgba(3, 7, 18, 0.85); backdrop-filter: blur(15px); z-index: 2000; display: none; align-items: center; justify-content: center; }
            .modal-content { width: 90%; max-width: 600px; background: #0f172a; border: 1px solid var(--pos-border); border-radius: 30px; box-shadow: var(--shadow-premium); overflow: hidden; }
            .modal-header { padding: 20px 25px; border-bottom: 1px solid var(--pos-border); display: flex; justify-content: space-between; align-items: center; }
            .modal-body { padding: 25px; }

            .scroll-thin::-webkit-scrollbar { width: 6px; }
            .scroll-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            
            .pos-stock-badge { padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; font-weight: 800; position: absolute; bottom: 15px; right: 15px; }
            .bg-good-stock { background: rgba(16, 185, 129, 0.15); color: #10b981; }
            .bg-low-stock { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

            @keyframes animate-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            .animate-in { animation: animate-in 0.3s forwards; }
        `;
        document.head.appendChild(style);
    },

    injectHTML: () => {
        if (document.getElementById('view-pos')) return;
        const main = document.querySelector('main');
        const section = document.createElement('section');
        section.id = 'view-pos';
        section.className = 'view-section';
        section.innerHTML = `
            <div class="pos-container">
                <header class="pos-tile pos-header-bar">
                    <div class="brand-logo"><i class="ri-rocket-2-fill"></i><span>NAXIO PRO PDV</span></div>
                    <div class="pos-nav-tabs" id="pos-tabs-container"></div>
                    <div style="display:flex; align-items:center; gap:25px;">
                        <div style="display:flex; gap:15px; background:rgba(0,0,0,0.3); padding:8px 15px; border-radius:12px; border:1px solid var(--pos-border);">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.75rem; font-weight:700; color:var(--pos-text-muted);">
                                <input type="checkbox" id="pos-exigir-nsu" style="accent-color:var(--pos-accent);"> EXIGIR NSU/AUT (IN 87/2025)
                            </label>
                        </div>
                        <div id="pos-clock" style="font-family:'Outfit'; font-weight:700; color:var(--pos-accent); font-size:1.4rem;">00:00:00</div>
                        <div class="status-indicator"><span class="status-dot"></span><span>SISTEMA ATIVO</span></div>
                    </div>
                </header>

                <aside class="pos-tile cat-sidebar">
                    <div class="cart-title" style="padding:25px 25px 15px;">Catálogo</div>
                    <div id="pos-category-list" class="cat-list scroll-thin">
                        <div class="cat-btn active" onclick="Varejo.loadProductsByCategory(null, this)"><i class="ri-apps-2-line"></i><span>Todos Itens</span></div>
                    </div>
                </aside>

                <section class="main-content">
                    <div class="pos-tile" style="flex:1; display:flex; flex-direction:column;">
                        <div class="search-wrapper">
                            <div class="search-input-group">
                                <i class="ri-barcode-line"></i>
                                <input type="text" id="pos-barcode" placeholder="Escaneie ou digite para buscar..." onkeypress="Varejo.handleScan(event)" autocomplete="off">
                            </div>
                        </div>
                        <div id="pos-product-grid" class="product-grid-view scroll-thin"></div>
                        <div id="pos-last-item-zone" style="padding:15px 20px 20px; display:flex; gap:15px; align-items:center;">
                             <div style="flex:1; padding:15px; background:rgba(255,255,255,0.03); border:1px solid var(--pos-border); border-radius:18px;">
                                 <div style="color:var(--pos-text-muted); font-size:0.75rem; font-weight:800; text-transform:uppercase;">Último Evento</div>
                                 <div id="pos-last-item-content" style="font-size:1rem; font-weight:700; color:var(--pos-success); margin-top:4px;">Aguardando entrada...</div>
                             </div>
                        </div>
                    </div>
                </section>

                <aside class="pos-tile checkout-sidebar">
                    <div class="customer-zone">
                         <div id="pos-main-customer-selected" style="display:none; padding:18px; border-radius:20px; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.2); position:relative;">
                             <div style="color:var(--pos-accent); font-size:0.7rem; font-weight:800; text-transform:uppercase;">Cliente do Pedido</div>
                             <div id="pos-main-customer-name" style="font-weight:700; font-size:1.1rem; margin-top:3px;">Consumidor</div>
                             <button class="btn btn-sm" onclick="Varejo.limparCliente()" style="position:absolute; right:15px; top:20px; color:var(--pos-danger); background:none; border:none;"><i class="ri-close-circle-fill"></i></button>
                         </div>
                         <div id="pos-main-customer-search-area">
                             <input type="text" id="pos-main-customer-search" placeholder="🔍 Identificar Cliente (CPF/Nome)" oninput="Varejo.buscarCliente(this.value, 'main')" style="width:100%; padding:18px; border-radius:20px; background:rgba(0,0,0,0.2); border:1px solid var(--pos-border); color:#fff; font-size:1rem;">
                             <div id="pos-main-customer-results" style="display:none; position:absolute; width:calc(100% - 30px); background:#111827; border:1px solid var(--pos-border); border-radius:15px; z-index:1000; max-height:250px; overflow-y:auto; margin-top:5px;"></div>
                         </div>
                    </div>
                    <div class="cart-title">Carrinho de Itens</div>
                    <div id="pos-ticket-list" class="cart-scroller scroll-thin"></div>
                    <div class="summary-zone">
                        <div class="summary-line"><span>Subtotal</span><span id="pos-subtotal">R$ 0,00</span></div>
                        <div class="summary-total"><span style="font-weight:700; color:var(--pos-text-muted); font-size:1.2rem;">TOTAL</span><span id="pos-total-display" class="total-amount">R$ 0,00</span></div>
                        <div style="margin-top:25px;"><button class="btn-action-primary" onclick="Varejo.openPaymentModal()"><i class="ri-wallet-3-fill"></i> PAGAMENTO (F2)</button></div>
                        <div style="margin-top:15px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <button class="btn btn-secondary" onclick="Varejo.cancelSaleWithPassword()" style="height:50px; border-radius:15px;"><i class="ri-close-fill"></i> LIMPAR</button>
                            <button class="btn btn-secondary" onclick="App.router.go('loja')" style="height:50px; border-radius:15px;"><i class="ri-share-forward-fill"></i> SAIR</button>
                        </div>
                    </div>
                </aside>

                <footer class="bottom-bar">
                    <div style="display:flex; gap:25px; font-size:0.8rem; font-weight:700; color:var(--pos-text-muted);"><span><i class="ri-store-2-line"></i> Canal de Venda PDV</span></div>
                    <div style="display:flex; gap:20px; font-size:0.8rem; font-weight:600;"><span style="color:var(--pos-success);"><i class="ri-cloud-line"></i> SUPABASE ONLINE</span><span style="opacity:0.4;">PREMIUM v5.0</span></div>
                </footer>
            </div>

            <div id="pos-search-modal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header"><h3>Buscar Produto</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('pos-search-modal').style.display='none'">X</button></div>
                    <div class="modal-body">
                        <input type="text" id="pos-search-input" class="pos-input" style="margin-bottom:15px;" placeholder="Digite para filtrar..." oninput="Varejo.filterSearch(this.value)">
                        <div id="pos-search-results" class="scroll-thin" style="max-height:400px; overflow-y:auto; background:rgba(0,0,0,0.1); border-radius:15px;"></div>
                    </div>
                </div>
            </div>

            <div id="pos-pay-modal" class="modal-overlay">
                <div class="modal-content" style="max-width:800px; border: 1px solid rgba(255,255,255,0.15);">
                    <div class="modal-header" style="background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--pos-border);">
                        <h3 style="display:flex; align-items:center; gap:12px; font-family:'Outfit'; font-weight:800;">
                            <i class="ri-secure-payment-fill" style="color:var(--pos-accent);"></i> Finalizar Venda
                        </h3>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('pos-pay-modal').style.display='none'">X</button>
                    </div>
                    <div class="modal-body" style="padding: 40px;">
                        <div style="text-align:center; margin-bottom:30px; background: linear-gradient(135deg, rgba(0,0,0,0.4), rgba(0,0,0,0.2)); padding: 30px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 0 20px rgba(0,0,0,0.2);">
                            <div style="text-transform: uppercase; font-size: 0.85rem; font-weight: 800; color: var(--pos-text-muted); letter-spacing: 2px; margin-bottom: 10px;">Valor Total do Pedido</div>
                            <h1 id="pos-pay-total" style="color: #fff; font-size: 4.2rem; margin:0; font-weight:950; font-family: 'Outfit'; text-shadow: 0 0 30px rgba(59, 130, 246, 0.3);">0,00</h1>
                        </div>
                        <style>
                            .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                            .pay-field { 
                                background: rgba(0,0,0,0.2); border: 1px solid var(--pos-border); 
                                border-radius: 20px; padding: 15px; transition: 0.3s;
                                display: flex; flex-direction: column; gap: 10px;
                            }
                            .pay-field:focus-within { border-color: var(--pos-accent); transform: scale(1.02); background: rgba(0,0,0,0.3); }
                            
                            .pay-field label { font-size: 0.9rem; font-weight: 800; color: var(--pos-text-muted); display: flex; align-items: center; gap: 10px; }
                            .pay-field label i { font-size: 1.4rem; }
                            
                            .pay-field .input-box { position: relative; display: flex; align-items: center; }
                            .pay-field .input-box span { 
                                font-weight: 900; color: var(--pos-text-muted); font-size: 1.2rem; 
                                padding: 0 15px; border-right: 1px solid var(--pos-border);
                                margin-right: 15px;
                            }
                            .pay-field input { 
                                background: none; border: none; color: #fff; 
                                font-size: 1.8rem; font-weight: 800; width: 100%;
                                font-family: 'Outfit', sans-serif;
                            }
                            .pay-field input:focus { outline: none; }
                            .pay-field input::placeholder { color: rgba(255,255,255,0.05); }

                            /* Cores vibrantes por tipo */
                            .pay-money label i { color: #10b981; }
                            .pay-pix label i { color: #06b6d4; }
                            .pay-card label i { color: #8b5cf6; }
                            .pay-crediario label i { color: #f59e0b; }
                            .pay-desc label i { color: #ef4444; }
                        </style>
                        <div class="pay-grid">
                            <div class="pay-field pay-money"><label><i class="ri-money-dollar-circle-fill"></i> DINHEIRO</label><div class="input-box"><span>R$</span><input type="number" id="pay-money" step="0.01" placeholder="0.00" oninput="Varejo.calcRestante()"></div></div>
                            <div class="pay-field pay-pix"><label><i class="ri-qr-code-fill"></i> PIX</label><div class="input-box"><span>R$</span><input type="number" id="pay-pix" step="0.01" placeholder="0.00" oninput="Varejo.calcRestante()"></div></div>
                            <div class="pay-field pay-card"><label><i class="ri-bank-card-fill"></i> CRÉDITO</label><div class="input-box"><span>R$</span><input type="number" id="pay-credit" step="0.01" placeholder="0.00" oninput="Varejo.calcRestante()"></div></div>
                            <div class="pay-field pay-card"><label><i class="ri-bank-card-line"></i> DÉBITO</label><div class="input-box"><span>R$</span><input type="number" id="pay-debit" step="0.01" placeholder="0.00" oninput="Varejo.calcRestante()"></div></div>
                            <div class="pay-field pay-crediario"><label><i class="ri-file-list-3-fill"></i> CREDIÁRIO / NOTA</label><div class="input-box"><span>R$</span><input type="number" id="pay-crediario" step="0.01" placeholder="0.00" oninput="Varejo.calcRestante()"></div></div>
                            
                            <div class="pay-field pay-desc">
                                <label><i class="ri-price-tag-3-fill"></i> DESCONTO</label>
                                <div style="display:flex; gap:10px; align-items:center;">
                                    <div class="input-box" style="flex:1; background:rgba(255,255,255,0.03); border-radius:12px; padding:5px 10px;">
                                        <input type="number" id="pay-desconto-pct" step="0.1" placeholder="0%" oninput="Varejo.calcDescontoPct()" style="font-size:1.2rem; text-align:center;">
                                    </div>
                                    <div class="input-box" style="flex:1.5; background:rgba(255,255,255,0.03); border-radius:12px; padding:5px 10px;">
                                        <input type="number" id="pay-desconto" step="0.01" placeholder="R$ 0.00" oninput="Varejo.calcRestante()" style="font-size:1.2rem; text-align:center;">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CAMPOS NSU E AUT -->
                        <div id="pay-nsu-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:20px;">
                            <div class="pay-field" style="padding:12px 15px;">
                                <label style="font-size:0.75rem; margin-bottom:5px;"><i class="ri-key-fill" style="color:var(--pos-accent);"></i> CÓD. AUTORIZAÇÃO (AUT)</label>
                                <input type="text" id="pay-nsu-aut" placeholder="Digite o código da maquininha" style="font-size:1.1rem; height:auto; padding:5px 0;">
                            </div>
                            <div class="pay-field" style="padding:12px 15px;">
                                <label style="font-size:0.75rem; margin-bottom:5px;"><i class="ri-hashtag" style="color:var(--pos-accent);"></i> NÚMERO NSU / DOC</label>
                                <input type="text" id="pay-nsu-doc" placeholder="Número da transação" style="font-size:1.1rem; height:auto; padding:5px 0;">
                            </div>
                        </div>

                        <div id="pay-restante-zone" style="margin-top:30px; padding:30px; border-radius:24px; text-align:center; transition:0.3s;">
                            <div id="pay-restante-label" style="text-transform:uppercase; font-size:0.8rem; font-weight:800; letter-spacing:1px; margin-bottom:5px;">Aguardando Pagamento</div>
                            <div id="pay-restante-box" style="font-size:2.4rem; font-weight:900; font-family:'Outfit';">R$ 0,00</div>
                        </div>
                    </div>
                    <div style="padding:0 40px 40px;">
                        <button id="btn-finalizar-venda" class="btn-action-primary" disabled onclick="Varejo.finalizeMultiPayment()" style="height:85px; font-size:1.6rem;">
                            <i class="ri-printer-fill"></i> CONFIRMAR E EMITIR CUPOM
                        </button>
                    </div>
                </div>
            </div>
        `;
        main.appendChild(section);
        Varejo.renderTabs();
    },

    switchTab: (idx) => {
        const prevTab = Varejo.state.tabs[Varejo.state.currentTabIndex];
        prevTab.ticket = [...Varejo.state.ticket];
        prevTab.cliente = Varejo.state.currentCliente;
        prevTab.total = Varejo.state.totalTicket;

        Varejo.state.currentTabIndex = idx;
        const newTab = Varejo.state.tabs[idx];
        Varejo.state.ticket = [...newTab.ticket];
        Varejo.state.currentCliente = newTab.cliente;
        Varejo.state.totalTicket = newTab.total;

        Varejo.renderTabs();
        Varejo.renderTicket();
        Varejo._atualizarPainelCliente();
        const input = document.getElementById('pos-barcode');
        if (input) input.focus();
        App.utils.toast(`Venda ${newTab.id} ativa`, 'info');
    },

    renderTabs: () => {
        const container = document.getElementById('pos-tabs-container');
        if (!container) return;
        container.innerHTML = Varejo.state.tabs.map((tab, idx) => `
            <div class="nav-tab ${idx === Varejo.state.currentTabIndex ? 'active' : ''}" onclick="Varejo.switchTab(${idx})">
                <i class="ri-shopping-cart-2-line"></i> Venda ${tab.id}
                ${tab.ticket.length > 0 ? `<span class="cart-badge">${tab.ticket.length}</span>` : ''}
            </div>
        `).join('');
    },

    updateSummary: () => {
        const total = Varejo.state.ticket.reduce((acc, p) => acc + (p.preco || 0), 0);
        Varejo.state.totalTicket = total;
        if (document.getElementById('pos-subtotal')) document.getElementById('pos-subtotal').innerText = `${total.toFixed(2)}`;
        if (document.getElementById('pos-total-display')) document.getElementById('pos-total-display').innerText = `${total.toFixed(2)}`;
    },

    renderTicket: () => {
        const container = document.getElementById('pos-ticket-list');
        if (!container) return;
        if (Varejo.state.ticket.length === 0) {
            container.innerHTML = '<div style="padding:40px; text-align:center; opacity:0.3;"><i class="ri-shopping-basket-line" style="font-size:3rem;"></i><br>Carrinho Vazio</div>';
            Varejo.updateSummary();
            return;
        }
        const grouped = [];
        Varejo.state.ticket.forEach(item => {
            const ex = grouped.find(g => g.id === item.id);
            if (ex) { ex.qtd++; ex.total = ex.qtd * item.preco; }
            else { grouped.push({ ...item, qtd: 1, total: item.preco }); }
        });
        container.innerHTML = grouped.map((item, idx) => `
            <div class="cart-row animate-in" style="animation-delay:${idx * 0.05}s">
                <div class="cart-qty">${item.qtd}</div>
                <div style="flex:1;"><div style="font-weight:700;">${item.nome}</div><div style="font-size:0.8rem; opacity:0.6;">${item.preco.toFixed(2)}</div></div>
                <div style="text-align:right; display:flex; align-items:center; gap:12px;">
                    <div class="cart-price">${item.total.toFixed(2)}</div>
                    <i class="ri-delete-bin-line t-remove" onclick="Varejo.removeItem('${item.id}')"></i>
                </div>
            </div>
        `).join('');
        Varejo.updateSummary();
    },

    handleScan: (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;
            const mul = val.match(/^(\d+)\*(.+)$/);
            if (mul) { Varejo.state.pendingQty = parseInt(mul[1]); Varejo.searchProduct(mul[2].trim()); }
            else { Varejo.state.pendingQty = 1; Varejo.searchProduct(val); }
            e.target.value = '';
        }
    },

    searchProduct: async (term) => {
        // 1. Busca Exata (Código de Barras, SKU, Código Interno)
        const { data: exact } = await _sb.from('products').select('*').eq('store_id', App.state.storeId)
            .or(`codigo_barras.eq.${term},codigo_cardapio.eq.${term},sku.eq.${term},id.eq.${term}`).limit(1);

        if (exact && exact.length > 0) {
            Varejo.addItem(exact[0], Varejo.state.pendingQty);
            return;
        }

        // 2. Busca por Similaridade/Sequencial (Se o código for longo, tenta buscar pelo prefixo de 8 a 13 dígitos)
        if (term.length >= 8) {
            const prefix = term.substring(0, term.length - 1); // Padrão comum de variação sequencial
            const { data: similar } = await _sb.from('products').select('*').eq('store_id', App.state.storeId)
                .or(`codigo_barras.ilike.${prefix}%,sku.ilike.${prefix}%`).limit(1);

            if (similar && similar.length > 0) {
                Varejo.addItem(similar[0], Varejo.state.pendingQty);
                return;
            }
        }

        // 3. Abre Modal de Busca por Nome (Fallback)
        Varejo.openSearchModal(term);
    },

    openSearchModal: (term = '') => {
        document.getElementById('pos-search-modal').style.display = 'flex';
        const input = document.getElementById('pos-search-input');
        input.value = term;
        input.focus();
        if (term) Varejo.filterSearch(term);
    },

    filterSearch: async (term) => {
        const { data } = await _sb.from('products').select('*').eq('store_id', App.state.storeId).ilike('nome', `%${term}%`).limit(30);
        Varejo.renderSearchResults(data || []);
    },

    renderSearchResults: (prods) => {
        const container = document.getElementById('pos-search-results');
        if (!prods.length) { container.innerHTML = '<p style="padding:20px; text-align:center;">Nada encontrado.</p>'; return; }
        container.innerHTML = prods.map(p => `
            <div class="pos-search-item" onclick="Varejo.addItem(${JSON.stringify(p).replace(/"/g, '&quot;')}, ${Varejo.state.pendingQty})">
                <div style="flex:1;"><div style="font-weight:700;">${p.nome}</div><div style="font-size:0.8rem; opacity:0.6;">Estoque: ${p.estoque || 0}</div></div>
                <div style="font-weight:800; color:var(--pos-accent);">R$ ${p.preco.toFixed(2)}</div>
            </div>
        `).join('');
    },

    addItem: (p, q = 1) => {
        for (let i = 0; i < q; i++) Varejo.state.ticket.push({ ...p });
        Varejo.renderTicket();
        document.getElementById('pos-last-item-content').innerHTML = `<strong>${q > 1 ? q + 'x ' : ''}${p.nome}</strong> adicionado`;
        document.getElementById('pos-search-modal').style.display = 'none';
        Varejo.state.pendingQty = 1;
        try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play(); } catch (e) { }
    },

    removeItem: (id) => {
        const idx = Varejo.state.ticket.findIndex(p => p.id === id);
        if (idx > -1) { Varejo.state.ticket.splice(idx, 1); Varejo.renderTicket(); }
    },

    cancelSaleWithPassword: async () => {
        if (!Varejo.state.ticket.length) return;
        if (await NaxioUI.confirm('⚠️ Limpar Venda', 'Remover todos os itens?')) {
            Varejo.state.ticket = []; Varejo.state.currentCliente = null;
            Varejo.renderTicket(); Varejo._atualizarPainelCliente();
        }
    },

    openPaymentModal: () => {
        if (!Varejo.state.ticket.length) return App.utils.toast("Carrinho vazio!", "warning");
        
        // Modularização: Crediário deve aparecer só para Roupas/Varejo
        const tl = (App.state.currentStore?.tipo_loja || "").toLowerCase();
        const isRestaurante = tl.includes("restaurante") || tl.includes("gastronomia") || tl.includes("comida");
        const payCrediarioBox = document.querySelector('.pay-field.pay-crediario');
        if (payCrediarioBox) payCrediarioBox.style.display = isRestaurante ? 'none' : 'flex';

        document.getElementById('pos-pay-total').innerText = `${Varejo.state.totalTicket.toFixed(2)}`;
        document.getElementById('pos-pay-modal').style.display = 'flex';
        ['pay-money', 'pay-pix', 'pay-credit', 'pay-debit', 'pay-crediario', 'pay-desconto', 'pay-nsu-aut', 'pay-nsu-doc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        Varejo.calcRestante();
        setTimeout(() => document.getElementById('pay-money').focus(), 100);
    },

    calcDescontoPct: () => {
        const total = Varejo.state.totalTicket;
        const pct = parseFloat(document.getElementById('pay-desconto-pct').value) || 0;
        const val = (total * pct) / 100;
        document.getElementById('pay-desconto').value = val.toFixed(2);
        Varejo.calcRestante();
    },

    calcRestante: () => {
        const total = Varejo.state.totalTicket;
        const paid = ['pay-money', 'pay-pix', 'pay-credit', 'pay-debit', 'pay-crediario'].reduce((a, id) => a + (parseFloat(document.getElementById(id).value) || 0), 0);
        const desc = parseFloat(document.getElementById('pay-desconto').value) || 0;
        const res = total - (paid + desc);

        const zone = document.getElementById('pay-restante-zone');
        const box = document.getElementById('pay-restante-box');
        const label = document.getElementById('pay-restante-label');
        const btn = document.getElementById('btn-finalizar-venda');

        if (res <= 0.01) {
            zone.style.background = "rgba(16, 185, 129, 0.1)";
            zone.style.borderColor = "var(--pos-success)";
            label.innerHTML = res < -0.01 ? "Troco a Devolver" : `Pagamento Completo ${desc > 0 ? `<span style="color:#10b981; font-size:0.7rem; margin-left:10px;">(Economia: ${desc.toFixed(2)})</span>` : ''}`;
            label.style.color = "var(--pos-success)";
            box.innerText = `${Math.abs(res).toFixed(2)}`;
            box.style.color = "var(--pos-success)";
            btn.disabled = false;
        } else {
            zone.style.background = "rgba(239, 68, 68, 0.05)";
            zone.style.borderColor = "rgba(239, 68, 68, 0.2)";
            label.innerHTML = `Restante a Pagar ${desc > 0 ? `<span style="color:#10b981; font-size:0.75rem; margin-left:10px;">(Dedução Desconto: ${desc.toFixed(2)})</span>` : ''}`;
            label.style.color = "var(--pos-danger)";
            box.innerText = `${res.toFixed(2)}`;
            box.style.color = "#fff";
            btn.disabled = true;
        }
    },

    finalizeMultiPayment: async () => {
        const exigirNsu = document.getElementById('pos-exigir-nsu')?.checked;
        const pays = [
            { t: 'Dinheiro', v: 'pay-money' },
            { t: 'Pix', v: 'pay-pix' },
            { t: 'Crédito', v: 'pay-credit' },
            { t: 'Débito', v: 'pay-debit' },
            { t: 'Crediário', v: 'pay-crediario' }
        ].map(p => ({ tipo: p.t, val: parseFloat(document.getElementById(p.v).value) || 0 })).filter(p => p.val > 0);

        const valCrediario = pays.find(p => p.tipo === 'Crediário')?.val || 0;
        if (valCrediario > 0 && !Varejo.state.currentCliente) {
            return NaxioUI.alert('Cliente Obrigatório', 'Para vendas no CREDIÁRIO, você precisa selecionar um cliente primeiro.', 'warning');
        }

        const proceed = async (installments = []) => {
            const nsu = document.getElementById('pay-nsu-doc').value.trim();
            const aut = document.getElementById('pay-nsu-aut').value.trim();
            const desc = parseFloat(document.getElementById('pay-desconto').value) || 0;

            App.utils.toast("Finalizando...", "info");
            try {
                const orderSnapshot = {
                    store_id: App.state.storeId,
                    total_pago: Varejo.state.totalTicket - desc,
                    status: 'concluido',
                    origem_venda: 'pdv',
                    metodo_pagamento: pays.length > 1 ? 'Múltiplos' : (pays[0]?.tipo || 'Desconto'),
                    customer_id: Varejo.state.currentCliente?.id || null,
                    observacao: JSON.stringify({ pays, desc, items: Varejo.state.ticket, nsu, aut, installments }),
                    session_id: localStorage.getItem('active_cash_session') || null
                };

                const { data, error } = await _sb.from('orders').insert(orderSnapshot).select().single();
                if (error) throw error;

                // Parcelas do Crediário
                if (installments.length > 0) {
                    const parcels = installments.map(i => ({
                        store_id: App.state.storeId,
                        order_id: data.id,
                        customer_id: Varejo.state.currentCliente.id,
                        installment_number: i.parcela,
                        due_date: i.vencimento,
                        amount: i.valor,
                        status: 'pendente'
                    }));
                    await _sb.from('crediario_installments').insert(parcels);
                }

                // Descontar Estoque
                const stockMoves = Varejo.state.ticket.reduce((a, c) => {
                    const x = a.find(e => e.id === c.id);
                    if (x) x.qtd++; else a.push({ id: c.id, qtd: 1 });
                    return a;
                }, []);
                await _sb.rpc('descontar_estoque', { itens: stockMoves });

                App.utils.toast("Venda registrada!", "success");
                document.getElementById('pos-pay-modal').style.display = 'none';

                // Impressão e Limpeza
                const ticketCopy = [...Varejo.state.ticket];
                const savedCliente = Varejo.state.currentCliente;
                Varejo.state.ticket = [];
                Varejo.state.currentCliente = null;
                Varejo.renderTicket();
                Varejo._atualizarPainelCliente();

                Varejo.printReceipt(data, ticketCopy, pays, desc, savedCliente);

                // NFC-e
                if (typeof Fiscal !== 'undefined') {
                    const querEmitir = await NaxioUI.confirm('🧾 Emitir NFC-e?', 'Deseja gerar a nota fiscal fiscal agora?', 'Sim, Emitir', 'Não, Apenas Recibo');
                    if (querEmitir) {
                        const pmts = pays.map(p => ({
                            code: p.tipo, valor: p.val,
                            aut: (p.tipo !== 'Dinheiro' && p.tipo !== 'Pix') ? aut : null,
                            nsu: (p.tipo !== 'Dinheiro' && p.tipo !== 'Pix') ? nsu : null
                        }));
                        Fiscal.emitirNFCe(data.id, orderSnapshot.total_pago, pmts, ticketCopy.map(i => ({ id: i.id, nome: i.nome, price: i.preco, qtd: 1 })));
                    }
                }
            } catch (err) {
                console.error("Erro Finalização:", err);
                NaxioUI.alert('Erro', 'Não foi possível salvar a venda: ' + err.message, 'error');
            }
        };

        if (valCrediario > 0) {
            App.crediario.openInstallmentModal(valCrediario, Varejo.state.currentCliente, proceed);
        } else {
            proceed();
        }
    },

    buscarCliente: async (t) => {
        const res = document.getElementById('pos-main-customer-results');
        if (!t || t.length < 2) { res.style.display = 'none'; return; }
        // Removido store_id pois perfis são globais e a tabela não possui essa coluna
        const { data } = await _sb.from('profiles').select('id, nome_completo, cpf').ilike('nome_completo', `%${t}%`).limit(5);
        if (!data?.length) { res.style.display = 'none'; return; }
        res.innerHTML = data.map(c => `<div onclick="Varejo.selecionarCliente(${JSON.stringify(c).replace(/"/g, '&quot;')})" style="padding:12px; cursor:pointer;">${c.nome_completo}</div>`).join('');
        res.style.display = 'block';
    },

    selecionarCliente: (c) => { Varejo.state.currentCliente = c; Varejo._atualizarPainelCliente(); document.getElementById('pos-main-customer-results').style.display = 'none'; },
    limparCliente: () => { Varejo.state.currentCliente = null; Varejo._atualizarPainelCliente(); },
    _atualizarPainelCliente: () => {
        const c = Varejo.state.currentCliente;
        const p = document.getElementById('pos-main-customer-selected');
        const s = document.getElementById('pos-main-customer-search-area');
        if (c) { p.style.display = 'block'; s.style.display = 'none'; document.getElementById('pos-main-customer-name').innerText = c.nome_completo; }
        else { p.style.display = 'none'; s.style.display = 'block'; }
    },

    loadCategories: async () => {
        const { data } = await _sb.from('products').select('categoria').eq('store_id', App.state.storeId);
        const cats = [...new Set(data.map(c => c.categoria))].filter(Boolean).sort();
        const list = document.getElementById('pos-category-list');
        cats.forEach(c => {
            const div = document.createElement('div'); div.className = 'cat-btn'; div.innerHTML = `<i class="ri-folder-line"></i><span>${c}</span>`;
            div.onclick = () => Varejo.loadProductsByCategory(c, div); list.appendChild(div);
        });
    },

    loadProductsByCategory: async (c, el) => {
        if (el) { document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
        const grid = document.getElementById('pos-product-grid');
        grid.innerHTML = '...';
        let q = _sb.from('products').select('*').eq('store_id', App.state.storeId).limit(24);
        if (c) q = q.eq('categoria', c);
        const { data } = await q;
        grid.innerHTML = data.map(p => `
            <div class="product-card" onclick="Varejo.addItem(${JSON.stringify(p).replace(/"/g, '&quot;')}, 1)">
                <div class="name">${p.nome}</div><div class="price">${p.preco.toFixed(2)}</div>
                <span class="pos-stock-badge ${p.estoque > 5 ? 'bg-good-stock' : 'bg-low-stock'}">${p.estoque || 0} un</span>
            </div>
        `).join('');
    },

    startClock: () => setInterval(() => { const el = document.getElementById('pos-clock'); if (el) el.innerText = new Date().toLocaleTimeString('pt-BR'); }, 1000),

    printReceipt: (order, items, pays, desc) => {
        const win = window.open('', '', 'width=450,height=700');
        const storeName = App.state.storeName || 'MINHA LOJA';
        const date = new Date().toLocaleString('pt-BR');

        // Agrupa itens para o recibo
        const grouped = [];
        items.forEach(i => {
            const ex = grouped.find(g => g.id === i.id);
            if (ex) { ex.qtd++; ex.total = ex.qtd * i.preco; }
            else { grouped.push({ ...i, qtd: 1, total: i.preco }); }
        });

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap');
                    body { font-family: 'Courier Prime', monospace; padding: 20px; color: #000; font-size: 14px; line-height: 1.2; width: 300px; margin: 0 auto; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .sep { border-top: 1px dashed #000; margin: 10px 0; }
                    .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
                    .footer { font-size: 10px; margin-top: 20px; }
                    @media print { body { width: 100%; padding: 0; } .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="center bold" style="font-size: 18px;">${storeName}</div>
                <div class="center">COMPROVANTE DE VENDA</div>
                <div class="sep"></div>
                <div>DATA: ${date}</div>
                <div>PEDIDO: #${order.id.toString().slice(-6).toUpperCase()}</div>
                <div>CLIENTE: ${Varejo.state.currentCliente?.nome_completo || 'CONSUMIDOR FINAL'}</div>
                <div class="sep"></div>
                <div class="bold">ITENS:</div>
                ${grouped.map(i => `
                    <div class="item">
                        <span>${i.qtd}x ${i.nome.slice(0, 20)}</span>
                        <span>${i.total.toFixed(2)}</span>
                    </div>
                `).join('')}
                <div class="sep"></div>
                <div class="item bold"><span>SUBTOTAL:</span> <span>${Varejo.state.totalTicket.toFixed(2)}</span></div>
                ${desc > 0 ? `<div class="item"><span>DESCONTO:</span> <span>- ${desc.toFixed(2)}</span></div>` : ''}
                <div class="item bold" style="font-size: 16px;"><span>TOTAL:</span> <span>${(Varejo.state.totalTicket - desc).toFixed(2)}</span></div>
                <div class="sep"></div>
                <div class="bold">PAGAMENTO:</div>
                ${pays.map(p => `<div class="item"><span>${p.tipo}:</span> <span>${p.val.toFixed(2)}</span></div>`).join('')}
                <div class="sep"></div>
                <div class="center footer">
                    Obrigado pela preferência!<br>
                    Guarde este comprovante para trocas.<br>
                    Desenvolvido por NAXIO PRO
                </div>
                <div class="no-print center" style="margin-top: 20px;">
                    <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">IMPRIMIR</button>
                    <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer;">FECHAR</button>
                </div>
                <script>
                    window.onload = () => { 
                        window.print(); // Descomente para imprimir auto ao abrir
                    };
                </script>
            </body>
            </html>
        `;
        win.document.write(html);
        win.document.close();
    }
};

window.Varejo = Varejo;
console.log("✅ Varejo 5.0 Pronto.");
