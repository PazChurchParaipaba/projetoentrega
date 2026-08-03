const CONFIG = {
    sbUrl: 'https://groezaseypdbpgymgpvo.supabase.co',
    sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM',
    adminPublicKey: 'APP_USR-834374cc-7e6d-494f-9842-49a7e3e57357',

    // Categorias expandidas e organizadas
    categories: [
        'Comidas',
        'Bebidas',
        'Drinks',
        'Petiscos',
        'Sobremesas',
        'Entradas',
        'Combos',
        'Outros'
    ],

    // Mapeamento de categorias por ramo de loja
    categoriesByStoreType: {
        'Restaurante': ['Comidas', 'Bebidas', 'Drinks', 'Petiscos', 'Sobremesas', 'Entradas', 'Combos', 'Outros'],
        'Outros': ['Comidas', 'Bebidas', 'Drinks', 'Outros']
    },

    // Função para obter categorias do ramo da loja
    getCategoriesForStoreType: function (storeType) {
        return this.categories;
    },

    subCategoriesRoupas: ['Masculina', 'Feminina', 'Moda Fitness', 'Moda Praia', 'Infantil', 'Acessórios']
};
// ... restante do código permanece igual
const _sb = supabase.createClient(CONFIG.sbUrl, CONFIG.sbKey);
let mpInstance = null;

const App = {
    state: {
        user: null, profile: null, storeId: null, currentStore: null,
        cart: [], currentComandaItems: [], mapInstance: null,
        paymentSplits: [], comandaTotal: 0, currentMesaNum: null,
        tempRole: null, deferredPrompt: null, watchId: null, activeOrder: null,
        pendingPayment: null, brickController: null, pixInterval: null,
        activeChatStore: null, activeChatClient: null, chatSub: null,
        mediaRecorder: null, audioChunks: []
    },

    utils: {
        toast: (msg, type = 'success') => {
            const c = document.getElementById('toast-container');
            const e = document.createElement('div');
            e.className = `toast ${type}`;
            e.innerHTML = `<span>${msg}</span>`;
            c.appendChild(e);
            setTimeout(() => e.remove(), 4000);
        },
        showChatNotification: (name, msg, clientId) => {
            const c = document.getElementById('store-notifications');
            const e = document.createElement('div');
            e.className = 'chat-alert-card';
            e.innerHTML = `<div><div style="font-weight:bold; color:var(--primary)">Nova mensagem de ${name}</div><div style="font-size:0.9rem; color:var(--text-muted); margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">"${msg}"</div></div><button class="btn btn-sm btn-info" onclick="App.chat.open('${App.state.storeId}', '${clientId}'); this.parentElement.remove()">Responder</button>`;
            c.appendChild(e);
            setTimeout(() => e.remove(), 10000);
        },
        isRestaurante: () => {
            const tl = (App.state.currentStore?.tipo_loja || "").toLowerCase();
            const nl = (App.state.currentStore?.nome_loja || "").toLowerCase();
            const keywords = ["restaurante", "gastronomia", "comida", "lanche", "pizza", "hamburguer", "bar", "aliment"];
            return keywords.some(k => tl.includes(k) || nl.includes(k));
        },
        setupPWA: () => {
            // Manifest estático já está no <head>. Apenas captura o prompt de instalação.
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                App.state.deferredPrompt = e;
                document.getElementById('pwa-banner').style.display = 'flex';
            });
        },
        setupCategories: () => {
            const catList = document.getElementById('category-list');
            const catSelect = document.getElementById('new-prod-cat');
            if (catList) {
                CONFIG.categories.forEach(c => {
                    catList.innerHTML += `<button class="cat-pill" onclick="App.catalog.filter('${c}', this)">${c}</button>`;
                    if (catSelect) catSelect.innerHTML += `<option value="${c}">${c}</option>`;
                });
            }
        },
        customInput: (title, label, callback) => {
            const id = 'custom-input-modal-' + Date.now();
            const html = `
                <div id="${id}" class="modal-overlay" style="display:flex; z-index:10001;">
                    <div class="modal-content" style="max-width:420px;">
                        <div class="modal-header"><h3>${String(title).replace(/</g, '&lt;')}</h3><button type="button" class="btn btn-secondary btn-sm" data-cancel>Fechar</button></div>
                        <div class="modal-body">
                            <label class="input-wrapper" style="display:block;">
                                <span style="display:block; margin-bottom:6px; color:var(--text-muted);">${String(label).replace(/</g, '&lt;')}</span>
                                <textarea id="${id}-input" class="input-field" rows="3" placeholder="Digite aqui..." style="resize:vertical; min-height:80px;"></textarea>
                            </label>
                        </div>
                        <div class="modal-footer" style="display:flex; gap:10px;">
                            <button type="button" class="btn btn-secondary" data-cancel>Cancelar</button>
                            <button type="button" class="btn btn-primary" data-confirm>Confirmar</button>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
            const modal = document.getElementById(id);
            const inputEl = document.getElementById(id + '-input');
            const close = () => { modal.remove(); };
            const confirm = () => {
                const val = inputEl.value.trim();
                close();
                if (typeof callback === 'function') callback(val);
            };
            modal.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', close));
            modal.querySelector('[data-confirm]').addEventListener('click', confirm);
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            inputEl.focus();
        }
    },

    init: async () => {
        try {
            console.log("🚀 System Init...");
            App.utils.setupPWA();
            App.utils.setupCategories();

            // Check for valid session
            const savedUser = localStorage.getItem('logimoveis_session');
            if (savedUser) {
                try {
                    const profile = JSON.parse(savedUser);
                    if (profile && profile.id) {
                        App.state.user = { id: profile.id };
                        App.state.profile = profile;
                        // Restaura o vínculo da loja se existir na sessão
                        if (profile.store_id) App.state.storeId = profile.store_id;

                        console.log("✅ User Session Restored");
                        App.router.renderNav();

                        // ✅ GARÇOM: Se já escolheu a loja hoje, entra direto sem pedir nada
                        if (profile.role === 'garcom') {
                            const today = new Date().toISOString().slice(0, 10);
                            const waiterSessionStr = localStorage.getItem('NAXIO_WAITER_SESSION_V3');
                            if (waiterSessionStr) {
                                try {
                                    const ws = JSON.parse(waiterSessionStr);
                                    if (ws.date === today && ws.store) {
                                        console.log("✅ Garçom: sessão do dia restaurada →", ws.storeName || ws.store);
                                        App.state.storeId = ws.store;
                                        // Garante que o storeId está na sessão global também
                                        profile.store_id = ws.store;
                                        localStorage.setItem('logimoveis_session', JSON.stringify(profile));
                                        if (typeof App.waiter !== 'undefined' && App.waiter.init) {
                                            App.waiter.init();
                                        }
                                        App.router.go('waiter');
                                        return;
                                    }
                                } catch (e) {
                                    localStorage.removeItem('NAXIO_WAITER_SESSION_V3');
                                }
                            }
                            // Sem sessão válida hoje → mostra o seletor de lojas
                            if (App.auth && App.auth.showWaiterStorePicker) {
                                await App.auth.showWaiterStorePicker(profile);
                            } else {
                                App.router.goDashboard();
                            }
                            return;
                        }

                        const lastView = localStorage.getItem('last_view');

                        // Se for lojista, caixa ou cozinha, inicializa a loja
                        const roleLower = profile.role ? profile.role.toLowerCase() : '';
                        if (['loja_admin', 'caixa', 'cozinha'].includes(roleLower)) {
                            await App.store.init();
                        }

                        if (lastView === 'gestao-salao') {
                            if (typeof App.store.openGestaoSalao === 'function') {
                                await App.store.openGestaoSalao();
                                return;
                            }
                        }
                        if (lastView && document.getElementById(`view-${lastView}`)) {
                            // 🔥 Segurança de Roteamento: Impede que Caixa caia no Dashboard de Entregas (Provider)
                            const currentRole = profile.role ? profile.role.toLowerCase() : '';
                            const isStaff = ['loja_admin', 'caixa', 'cozinha'].includes(currentRole);
                            if (isStaff && (lastView === 'provider' || lastView === 'home' || lastView === 'pos')) {
                                App.router.goDashboard();
                            } else {
                                App.router.go(lastView);
                            }
                        } else {
                            App.router.goDashboard();
                        }
                    } else {
                        throw new Error("Invalid profile data");
                    }
                } catch (e) {
                    console.warn("⚠️ Corrupt session, clearing.", e);
                    localStorage.removeItem('logimoveis_session');
                    App.router.renderNav();
                    App.catalog.fetchPublic();
                }
            } else {
                App.router.renderNav();
                // Redireciona para login se não estiver logado
                App.router.go('auth');
            }
        } finally {
            // Finaliza Splash Screen Premium
            setTimeout(() => {
                const splash = document.getElementById('naxio-splash');
                if (splash) splash.classList.add('fade-out');
            }, 1500);
        }
    },

    pwa: {
        install: () => {
            if (App.state.deferredPrompt) {
                App.state.deferredPrompt.prompt();
                App.state.deferredPrompt.userChoice.then(() => {
                    App.state.deferredPrompt = null;
                    document.getElementById('pwa-banner').style.display = 'none';
                });
            }
        }
    },

    router: {
        go: (viewId) => {
            const role = App.state.profile?.role ? App.state.profile.role.toLowerCase() : '';
            const isStaff = ['loja_admin', 'caixa', 'cozinha'].includes(role);

            // 🛡️ Guarda de Roteamento Global (Anti-Entregas para Staff)
            if (isStaff && (viewId === 'provider' || viewId === 'home')) {
                console.warn("🚫 Acesso restrito. Redirecionando para Painel da Loja.");
                App.router.goDashboard();
                return;
            }

            const viewEl = document.getElementById(`view-${viewId}`);
            if (!viewEl) {
                console.warn("View não encontrada:", viewId);
                return;
            }
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            viewEl.classList.add('active');
            window.scrollTo(0, 0);
            try { localStorage.setItem('last_view', viewId); } catch (e) { }
            App.router.renderNav();
            if (viewId === 'home') App.catalog.fetchPublic();
        },
        renderNav: () => {
            const header = document.getElementById('user-actions-container');
            const mobile = document.getElementById('mobile-nav');
            if (App.state.user && App.state.profile) {
                if (header) header.innerHTML = `<div style="display:flex; align-items:center; gap:1rem; padding-right: 15px;"><div class="text-xs text-muted desktop-only">${(App.state.profile.nome_completo || 'Usuário').split(' ')[0]}</div><button class="btn btn-secondary btn-sm" onclick="App.router.goDashboard()">Painel</button><button class="btn btn-danger btn-sm" onclick="App.auth.logout()">Sair</button></div>`;
                if (mobile) mobile.innerHTML = `<div class="nav-item" onclick="App.router.go('home')"><i class="ri-store-line"></i><span>Loja</span></div><div class="nav-item active" onclick="App.router.goDashboard()"><i class="ri-dashboard-line"></i><span>Painel</span></div><div class="nav-item" onclick="App.auth.logout()"><i class="ri-logout-box-line"></i><span>Sair</span></div>`;
            } else {
                if (header) header.innerHTML = `<button class="btn btn-primary btn-sm" onclick="App.router.go('auth')">Entrar / Cadastrar</button>`;
                if (mobile) mobile.innerHTML = `<div class="nav-item active" onclick="App.router.go('home')"><i class="ri-store-line"></i><span>Início</span></div><div class="nav-item" onclick="App.router.go('auth')"><i class="ri-user-line"></i><span>Conta</span></div>`;
            }
        },
        goDashboard: () => {
            const role = App.state.profile?.role ? App.state.profile.role.toLowerCase() : '';
            console.log("🚦 Routing for role:", role);

            if (['loja_admin', 'caixa', 'cozinha'].includes(role)) {
                App.store.init();
                App.router.go('loja');
            }
            else if (role === 'cliente') { App.client.init(); App.router.go('cliente'); }
            else if (role === 'garcom') { App.waiter.init(); App.router.go('waiter'); }
            else {
                // Fallback para entregador / parceiro
                App.provider.init();
                App.router.go('provider');
            }
        }
    }
};

// --- Melhorias Globais e Atalhos de Teclado ---

// 1. Evita que o scroll do mouse altere valores em todos os inputs do tipo number do sistema
// Usamos uma abordagem múltipla para garantir que funcione em todos os navegadores
const stopScrollChange = function (event) {
    const target = event.target.closest('input[type="number"]');
    if (target) {
        event.preventDefault();
        // Se estiver focado, tiramos o foco para garantir que o scroll mova a página e não o valor
        if (document.activeElement === target) {
            target.blur();
        }
    }
};

// Registra em múltiplos eventos e fases para máxima compatibilidade
document.addEventListener('wheel', stopScrollChange, { passive: false, capture: true });
document.addEventListener('mousewheel', stopScrollChange, { passive: false, capture: true });
window.addEventListener('wheel', stopScrollChange, { passive: false });
window.addEventListener('mousewheel', stopScrollChange, { passive: false });

// 2. Garante que o ENTER funcione em modais, login, telas de sistema para confirmar ações
document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
            // Ignora o chat (onde enter quebra linha ou já é tratado separado)
            if (active.id === 'chat-input' || active.classList.contains('chat-text-area')) return;

            // Ignora buscas rápidas onde o Enter não deve fechar ou confirmar o dialog todo
            if (active.id === 'menu-search' || active.id === 'product-search' || active.id === 'cat-search' || active.id === 'lancar-busca') return;

            // Caso Específico: Autenticação / Login
            if (active.id === 'login-email' || active.id === 'login-pass') {
                event.preventDefault(); // Impede recarregamento de form genérico
                if (window.App && App.auth && typeof App.auth.login === 'function') {
                    App.auth.login();
                } else {
                    const btnLogin = document.querySelector('button[onclick*="App.auth.login"]');
                    if (btnLogin) btnLogin.click();
                }
                return;
            }

            // Caso Específico: Quantidade do modal de Adicionar Produto no Garçom App
            if (active.id === 'qty') {
                event.preventDefault();
                const confirmBtn = active.closest('.g-modal-sheet')?.querySelector('button.g-btn.primary');
                if (confirmBtn) confirmBtn.click();
                return;
            }

            // Procura o contêiner lógico mais próximo (Modal, Card, Container Genérico de view)
            const container = active.closest('.g-modal-sheet, .modal-content, .auth-container, .card, form');
            if (container) {
                // Tenta achar o botão de "Confirmar", "Adicionar FastSplit/Pagamento" ou botões primários
                const btn = container.querySelector(
                    'button[onclick*="addFastSplit"], button[onclick*="confirmarFechamento"], button.btn-primary, button.btn-success, button.g-btn.primary, button.g-btn.success'
                );

                if (btn && typeof btn.click === 'function') {
                    event.preventDefault();
                    btn.click();
                }
            }
        }
    }
});