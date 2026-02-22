const CONFIG = {
    sbUrl: 'https://groezaseypdbpgymgpvo.supabase.co',
    sbKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM',
    adminPublicKey: 'APP_USR-834374cc-7e6d-494f-9842-49a7e3e57357',

    // Categorias expandidas e organizadas
    categories: [
        'Comidas',
        'Bebidas',
        'Roupas',
        'Calçados',
        'Diárias',
        'Material Escolar',
        'Eletrônicos',
        'Casa e Construção',
        'Autopeças',
        'Serviços',
        'Outros'
    ],

    subCategoriesRoupas: ['Masculina', 'Feminina', 'Moda Fitness', 'Moda Praia', 'Infantil', 'Acessórios'],
    subCategoriesCalcados: ['Masculino', 'Feminino', 'Esportivo', 'Chinelas', 'Sandálias', 'Infantil'],
    subCategoriesEletronicos: ['Celulares', 'Informática', 'TV e Áudio', 'Eletrodomésticos', 'Gamer', 'Acessórios'],
    subCategoriesCasaConstrucao: ['Móveis', 'Decoração', 'Ferramentas', 'Jardinagem', 'Iluminação', 'Utensílios Domésticos'],
    subCategoriesAutopecas: ['Óleo de Carro', 'Óleo de Moto', 'Filtros', 'Parafusos', 'Porcas', 'Arruelas', 'Pneus', 'Baterias', 'Lâmpadas', 'Acessórios', 'Motor', 'Freio', 'Suspensão', 'Elétrica', 'Transmissão', 'Carroceria', 'Escapamento', 'Ar Condicionado', 'Vidros', 'Interior', 'Rodas', 'Pintura', 'Ferramentas'],

    // Mapeamento de categorias por ramo de loja
    categoriesByStoreType: {
        'Restaurante': ['Comidas', 'Bebidas', 'Outros'],
        'Roupas': ['Roupas', 'Calçados', 'Acessórios', 'Outros'],
        'Varejo': ['Roupas', 'Calçados', 'Material Escolar', 'Eletrônicos', 'Casa e Construção', 'Outros'],
        'Autopeças': ['Autopeças', 'Outros'],
        'Auto Peças': ['Autopeças', 'Outros'],
        'Serviços': ['Serviços', 'Diárias', 'Outros'],
        'Outros': ['Comidas', 'Bebidas', 'Roupas', 'Calçados', 'Diárias', 'Material Escolar', 'Eletrônicos', 'Casa e Construção', 'Autopeças', 'Serviços', 'Outros']
    },

    // Função para obter categorias do ramo da loja
    getCategoriesForStoreType: function (storeType) {
        if (this.categoriesByStoreType[storeType]) return this.categoriesByStoreType[storeType];

        const tl = storeType ? storeType.toLowerCase() : "";
        if (tl.includes('auto') || tl.includes('peca') || tl.includes('oficina') || tl.includes('mecanic')) {
            return ['Autopeças', 'Serviços', 'Outros'];
        }

        return this.categories;
    }
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
        setupPWA: () => {
            const manifest = { "name": "Naxio", "short_name": "Naxio", "start_url": window.location.href, "display": "standalone", "background_color": "#ffffff", "theme_color": "#2563eb", "icons": [{ "src": "https://raw.githubusercontent.com/PazChurchParaipaba/projetoentrega/refs/heads/main/logo.png", "sizes": "192x192", "type": "image/png" }] };
            const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
            document.querySelector('#dynamic-manifest').setAttribute('href', URL.createObjectURL(blob));
            window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.state.deferredPrompt = e; document.getElementById('pwa-banner').style.display = 'flex'; });
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
                        console.log("✅ User Session Restored");
                        App.router.renderNav();

                        const lastView = localStorage.getItem('last_view');

                        // Se for lojista, sempre inicializa a loja
                        if (profile.role === 'loja_admin') {
                            await App.store.init();
                        }

                        if (lastView === 'gestao-salao') {
                            if (typeof App.store.openGestaoSalao === 'function') {
                                await App.store.openGestaoSalao();
                                return;
                            }
                        }
                        if (lastView && document.getElementById(`view-${lastView}`)) {
                            App.router.go(lastView);
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
                App.catalog.fetchPublic();
            }
        } catch (err) {
            console.error("❌ Fatal Init Error:", err);
            alert("Erro ao iniciar sistema. Tente recarregar.");
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
                if (header) header.innerHTML = `<div style="display:flex; align-items:center; gap:1rem;"><div class="text-xs text-muted desktop-only">${(App.state.profile.nome_completo || 'Usuário').split(' ')[0]}</div><button class="btn btn-secondary btn-sm" onclick="App.router.goDashboard()">Painel</button><button class="btn btn-danger btn-sm" onclick="App.auth.logout()">Sair</button></div>`;
                if (mobile) mobile.innerHTML = `<div class="nav-item" onclick="App.router.go('home')"><i class="ri-store-line"></i><span>Loja</span></div><div class="nav-item active" onclick="App.router.goDashboard()"><i class="ri-dashboard-line"></i><span>Painel</span></div><div class="nav-item" onclick="App.auth.logout()"><i class="ri-logout-box-line"></i><span>Sair</span></div>`;
            } else {
                if (header) header.innerHTML = `<button class="btn btn-primary btn-sm" onclick="App.router.go('auth')">Entrar / Cadastrar</button>`;
                if (mobile) mobile.innerHTML = `<div class="nav-item active" onclick="App.router.go('home')"><i class="ri-store-line"></i><span>Início</span></div><div class="nav-item" onclick="App.router.go('auth')"><i class="ri-user-line"></i><span>Conta</span></div>`;
            }
        },
        goDashboard: () => {
            const role = App.state.profile?.role;
            if (role === 'loja_admin') { App.store.init(); App.router.go('loja'); }
            else if (role === 'cliente') { App.client.init(); App.router.go('cliente'); }
            else if (role === 'garcom') { App.waiter.init(); App.router.go('waiter'); }
            else { App.provider.init(); App.router.go('provider'); }
        }
    }
};
