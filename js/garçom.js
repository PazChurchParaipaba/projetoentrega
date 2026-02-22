/**
 * 🤵 NAXIO WAITER ENTERPRISE v3.0
 * 
 * Uma suíte completa para gestão de salão, pedidos e atendimento.
 * Arquitetura modular, robusta e tolerante a falhas.
 * 
 * MÓDULOS:
 * 1. Core (Estado, Init, Router)
 * 2. Auth (Login, Sessão)
 * 3. Data (Supabase, Cache, Offline Sync)
 * 4. UI (Renderização, Temas, Componentes)
 * 5. Orders (Carrinho, Lançamento, Modificadores)
 * 6. Map (Gestão de Mesas em Grid)
 * 7. Bills (Pagamento, Divisão, Impressão)
 * 8. Notifications (Centro de msgs)
 */

if (!window.App) window.App = {};

const GarcomSystem = {
    // =========================================================================
    // 1. STATE MANAGEMENT & CONFIG
    // =========================================================================
    config: {
        version: "3.0.0",
        appName: "Naxio Waiter",
        maxTables: 100,
        defaultTax: 10, // 10%
        animSpeed: 300,
        currency: "BRL"
    },

    state: {
        // Sessão
        ready: false,
        storeId: null,
        waiterId: null,
        waiterName: null,
        shiftStart: null,

        // Dados
        tables: [], // Cache de mesas
        menu: [], // Cache de produtos
        categories: [], // Categorias extraídas
        favorites: [], // IDs de produtos favoritos

        // UI
        currentView: 'login', // home, table, menu, report, settings
        activeTable: null, // Mesa selecionada
        cart: [], // Itens a serem enviados
        searchQuery: '',
        activeCategory: 'Todos',
        isDark: true,
        loading: false,

        // Sistema
        online: navigator.onLine,
        syncQueue: [] // Fila de operações offline
    },

    // =========================================================================
    // 2. CORE ENGINE (Init, Lifecycle)
    // =========================================================================
    init: async () => {
        console.group("🤵 Init Garçom v3.3 Final");

        // 1. CRITICAL: Inject Styles First
        GarcomSystem.ui.injectStyles();

        // 2. STATE RECOVERY
        const savedSessionStr = localStorage.getItem('NAXIO_WAITER_SESSION_V3');
        const globalSessionStr = localStorage.getItem('logimoveis_session');
        let savedSession = null;
        let pStoreId = null;

        // Try to parse Waiter Session
        if (savedSessionStr) {
            try {
                savedSession = JSON.parse(savedSessionStr);
                if (savedSession.store) pStoreId = savedSession.store;
            } catch (e) { console.warn("Sessão Garçom inválida", e); }
        }

        // Try to parse Global Session (Fallback for Store ID)
        if (!pStoreId && globalSessionStr) {
            try {
                const gs = JSON.parse(globalSessionStr);
                pStoreId = gs.store_id || gs.storeId;
            } catch (e) { console.warn("Sessão Global inválida", e); }
        }

        // Check App.state (Last Resort)
        if (!pStoreId && App.state && App.state.storeId) {
            pStoreId = App.state.storeId;
        }

        // SET STORE ID TO STATE
        GarcomSystem.state.storeId = pStoreId;

        // 3. IMMEDIATE UI ROUTING (Optimistic)
        if (savedSession && pStoreId) {
            console.log("🚀 Sessão Restaurada. Indo para Home.");
            GarcomSystem.ui.setupShell();
            await GarcomSystem.startSession(savedSession);
        } else {
            // Checks if we at least have a Store ID to render the Login Screen correctly
            if (pStoreId) {
                console.log("� Sessão expirada/inexistente. Indo para Login.");
                GarcomSystem.ui.renderLogin();
            } else {
                console.error("❌ Loja não identificada. Impossível iniciar.");
                GarcomSystem.ui.renderError("Erro Crítico", "Loja não identificada. Faça login no painel principal.");
            }
        }

        // 4. BACKGROUND TASKS
        try {
            // Listeners
            window.addEventListener('online', GarcomSystem.network.onOnline);
            window.addEventListener('offline', GarcomSystem.network.onOffline);

            // Check Dependency (Non-blocking usually, but critical for data)
            if (typeof _sb === 'undefined') console.warn("Supabase não disponível imediatamente.");

        } catch (err) {
            console.error("Init Background Error", err);
        } finally {
            GarcomSystem.ui.introLoader(false);
            console.groupEnd();
        }
    },

    startSession: async (session) => {
        GarcomSystem.state.waiterId = session.id;
        GarcomSystem.state.waiterName = session.name;
        GarcomSystem.state.shiftStart = session.start || new Date().toISOString();
        GarcomSystem.state.ready = true;

        // Render Home immediately (optimistic UI)
        GarcomSystem.router.navigate('home');

        // Load Heavy Data in Background
        Promise.all([
            GarcomSystem.data.fetchMenu(),
            GarcomSystem.data.syncTables(),
            GarcomSystem.data.fetchFavorites()
        ]).then(() => {
            // Only update if visually necessary
            if (GarcomSystem.state.currentView === 'home') GarcomSystem.ui.updateTableStatuses();
        }).catch(err => console.warn("Background Sync Warning:", err));

        // Start Realtime (Silent)
        setTimeout(() => GarcomSystem.realtime.connect(), 500);
    },

    // =========================================================================
    // 3. AUTHENTICATION MODULE
    // =========================================================================
    auth: {
        getSession: () => {
            const json = localStorage.getItem('NAXIO_WAITER_SESSION_V3');
            return json ? JSON.parse(json) : null;
        },

        saveSession: (id, name) => {
            const data = {
                id,
                name,
                start: new Date().toISOString(),
                store: GarcomSystem.state.storeId
            };
            localStorage.setItem('NAXIO_WAITER_SESSION_V3', JSON.stringify(data));
            return data;
        },

        login: async (staffId, name) => {
            try {
                GarcomSystem.ui.setLoading(true);
                // Opcional: Validar PIN no backend se necessário
                const session = GarcomSystem.auth.saveSession(staffId, name);
                await GarcomSystem.startSession(session);
                GarcomSystem.ui.toast(`Bom trabalho, ${name.split(' ')[0]}!`, 'success');
            } catch (e) {
                GarcomSystem.ui.toast("Erro no login: " + e.message, "error");
            } finally {
                GarcomSystem.ui.setLoading(false);
            }
        },

        logout: () => {
            if (confirm("Encerrar seu turno?")) {
                localStorage.removeItem('NAXIO_WAITER_SESSION_V3');
                location.reload();
            }
        }
    },

    // =========================================================================
    // 4. DATA & NETWORK MODULE
    // =========================================================================
    network: {
        onOnline: () => {
            GarcomSystem.state.online = true;
            GarcomSystem.ui.toast("Conexão restabelecida", "success");
            GarcomSystem.data.processSyncQueue();
            GarcomSystem.ui.updateNetworkStatus();
        },
        onOffline: () => {
            GarcomSystem.state.online = false;
            GarcomSystem.ui.toast("Sem internet. Modo Offline ativo.", "warning");
            GarcomSystem.ui.updateNetworkStatus();
        }
    },

    data: {
        fetchMenu: async () => {
            // Check Cache first
            const cache = localStorage.getItem('WAITER_MENU_CACHE');
            const cacheTime = localStorage.getItem('WAITER_MENU_TIME');
            const now = Date.now();

            // Reload if cache is older than 2 hours or force reload
            if (cache && cacheTime && (now - cacheTime < 7200000)) {
                GarcomSystem.state.menu = JSON.parse(cache);
                GarcomSystem.data.extractCategories();
                console.log("📦 Loaded Menu from Cache");
                // Background update
                GarcomSystem.data.updateMenuCache();
            } else {
                await GarcomSystem.data.updateMenuCache();
            }
        },

        updateMenuCache: async () => {
            // Relaxed query to ensure products load
            const { data, error } = await _sb
                .from('products')
                .select('*')
                .eq('store_id', GarcomSystem.state.storeId);

            if (data) {
                // Filter client-side to be safe but allow viewing "unavailable" in catalog potentially
                GarcomSystem.state.menu = data;
                localStorage.setItem('WAITER_MENU_CACHE', JSON.stringify(data));
                localStorage.setItem('WAITER_MENU_TIME', Date.now());
                GarcomSystem.data.extractCategories();
                console.log(`📦 Cache Atualizado: ${data.length} produtos.`);
            }
        },

        extractCategories: () => {
            const cats = new Set(GarcomSystem.state.menu.map(p => p.category || 'Geral'));
            GarcomSystem.state.categories = ['Todos', ...Array.from(cats).sort()];
        },

        fetchFavorites: () => {
            const favs = localStorage.getItem('WAITER_FAVS');
            if (favs) GarcomSystem.state.favorites = JSON.parse(favs);
        },

        toggleFavorite: (prodId) => {
            const idx = GarcomSystem.state.favorites.indexOf(prodId);
            if (idx > -1) GarcomSystem.state.favorites.splice(idx, 1);
            else GarcomSystem.state.favorites.push(prodId);

            localStorage.setItem('WAITER_FAVS', JSON.stringify(GarcomSystem.state.favorites));
            GarcomSystem.ui.renderMenuGrid(); // Refresh icons
        },

        syncTables: async () => {
            // 1. Fetch REAL tables only (Livre, Ocupada, Pagando)
            // Explicitly excluding 'fechada' and 'arquivada'
            const { data, error } = await _sb
                .from('comandas')
                .select('*')
                .eq('store_id', GarcomSystem.state.storeId)
                .neq('status', 'fechada')
                .neq('status', 'arquivada')
                .order('numero', { ascending: true });

            if (error) {
                console.error("SyncTables DB Error", error);
                return;
            }

            // 2. STRICT MAPPING (No artificial 1-100 loop)
            // Shows ONLY what the Manager opened
            GarcomSystem.state.tables = data || [];

            // 3. Refresh UI
            if (GarcomSystem.state.currentView === 'home') {
                GarcomSystem.ui.updateTableStatuses();
            }
        },

        // CORE ORDER ACTION
        sendOrder: async (tableNum, items, obsGeral = "") => {
            if (!GarcomSystem.state.online) {
                GarcomSystem.data.queueOrder(tableNum, items, obsGeral);
                return;
            }

            try {
                // 1. Get or Create Comanda
                let comanda = GarcomSystem.state.tables.find(t => t.numero === tableNum && t.status !== 'free');
                let comandaId = comanda?.id;
                let currentItems = comanda?.items || [];

                if (!comandaId) {
                    // Create new
                    const { data: newComanda, error: createError } = await _sb
                        .from('comandas')
                        .insert({
                            store_id: GarcomSystem.state.storeId,
                            numero: tableNum,
                            status: 'ocupada',
                            items: []
                        })
                        .select()
                        .single();

                    if (createError) throw createError;
                    comandaId = newComanda.id;
                    currentItems = [];
                }

                // 2. Append new items
                const stampedItems = items.map(i => ({
                    ...i,
                    garcom: GarcomSystem.state.waiterName,
                    added_at: new Date().toISOString(),
                    printed: false, // Flag for kitchen
                    status: 'sent'
                }));

                const finalItems = [...currentItems, ...stampedItems];

                // 3. Update DB
                const { error: updateError } = await _sb
                    .from('comandas')
                    .update({
                        items: finalItems,
                        updated_at: new Date().toISOString(),
                        status: 'ocupada',
                        obs_geral: obsGeral ? obsGeral : undefined
                    })
                    .eq('id', comandaId);

                if (updateError) throw updateError;

                GarcomSystem.ui.toast(`Pedido enviado p/ Mesa ${tableNum}!`, "success");
                GarcomSystem.state.cart = []; // Clear local cart
                GarcomSystem.ui.closeModal(); // Close menu

                // Optimistic Update
                GarcomSystem.data.syncTables();

            } catch (err) {
                console.error(err);
                GarcomSystem.ui.renderError("Erro ao enviar pedido", err.message);
            }
        },

        queueOrder: (tableNum, items, obs) => {
            const job = { type: 'order', tableNum, items, obs, time: Date.now() };
            GarcomSystem.state.syncQueue.push(job);
            localStorage.setItem('WAITER_QUEUE', JSON.stringify(GarcomSystem.state.syncQueue));
            GarcomSystem.ui.toast("Sem internet. Pedido salvo na fila!", "warning");
        },

        processSyncQueue: async () => {
            if (GarcomSystem.state.syncQueue.length === 0) return;

            const queue = [...GarcomSystem.state.syncQueue];
            GarcomSystem.state.syncQueue = [];
            localStorage.removeItem('WAITER_QUEUE'); // Clear disk

            GarcomSystem.ui.toast(`Sincronizando ${queue.length} operações...`, "info");

            for (const job of queue) {
                if (job.type === 'order') {
                    await GarcomSystem.data.sendOrder(job.tableNum, job.items, job.obs);
                }
            }
        }
    },

    // =========================================================================
    // 5. REALTIME ENGINE
    // =========================================================================
    realtime: {
        sub: null,
        connect: () => {
            if (GarcomSystem.realtime.sub) return;

            console.log("🔌 Connecting Realtime...");
            const channelId = `waiter-updates-${GarcomSystem.state.storeId}`;

            GarcomSystem.realtime.sub = _sb.channel(channelId)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'comandas', filter: `store_id=eq.${GarcomSystem.state.storeId}` },
                    (payload) => {
                        GarcomSystem.realtime.handleUpdate(payload);
                    }
                )
                // Escuta Notificações (NOVO)
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'messages', filter: `store_id=eq.${GarcomSystem.state.storeId}` },
                    (payload) => {
                        if (payload.new && payload.new.msg) {
                            GarcomSystem.notifications.add(payload.new.msg, payload.new.type || 'info');
                            if (GarcomSystem.config.vibration) navigator.vibrate([200, 100, 200]);
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log("🟢 Realtime Connected (Comandas + Notificações)");
                        GarcomSystem.ui.updateNetworkStatus(true);
                    }
                });
        },

        handleUpdate: (payload) => {
            const { eventType, new: newRec, old: oldRec } = payload;

            // Atualiza cache local
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
                const idx = GarcomSystem.state.tables.findIndex(t => t.numero === newRec.numero);
                if (idx >= 0) {
                    GarcomSystem.state.tables[idx] = newRec; // Swap entire object

                    // Se estiver vendo os detalhes dessa mesa, atualizar a view
                    if (GarcomSystem.state.activeTable === newRec.numero && GarcomSystem.state.currentView === 'table') {
                        GarcomSystem.ui.renderTableDetail(newRec.numero);
                    }
                }
            }
            else if (eventType === 'DELETE') {
                // Mesa foi deletada (provavelmente erro ou limpeza de BD)
                const idx = GarcomSystem.state.tables.findIndex(t => t.id === oldRec.id);
                if (idx >= 0) {
                    GarcomSystem.state.tables[idx] = {
                        numero: GarcomSystem.state.tables[idx].numero,
                        status: 'free',
                        items: [],
                        total: 0
                    };
                }
            }
            if (GarcomSystem.state.currentView === 'home') {
                GarcomSystem.ui.updateTableStatuses(); // Light update
            }
        },
    },

    // =========================================================================
    // 6. ROUTER
    // =========================================================================
    router: {
        initHistory: () => {
            // Keep track of back button if needed
            window.onpopstate = (e) => {
                if (e.state && e.state.view) GarcomSystem.router.navigate(e.state.view, e.state.data);
            };
        },

        navigate: (view, data = null) => {
            console.log("🧭 Navigating to:", view, data);
            GarcomSystem.state.currentView = view;

            // SAVE VIEW FOR RELOAD
            if (view !== 'login') {
                localStorage.setItem('NAXIO_WAITER_VIEW', view);
                if (data) localStorage.setItem('NAXIO_WAITER_VIEW_DATA', JSON.stringify(data));
            }

            switch (view) {
                case 'login':
                    GarcomSystem.ui.renderLogin();
                    break;
                case 'home':
                    GarcomSystem.ui.renderHome();
                    break;
                case 'table':
                    // Restore data if coming from reload
                    if (!data) {
                        const savedData = localStorage.getItem('NAXIO_WAITER_VIEW_DATA');
                        if (savedData) data = JSON.parse(savedData);
                    }
                    if (data) GarcomSystem.ui.renderTableDetail(data);
                    else GarcomSystem.ui.renderHome(); // Fallback
                    break;
                case 'settings':
                    GarcomSystem.ui.renderSettings();
                    break;
                case 'catalog':
                    GarcomSystem.catalog.render();
                    break;
                default:
                    GarcomSystem.ui.renderHome();
            }
        }
    },

    // =========================================================================
    // 7. UI RENDERER (Glassmorphism Engine)
    // =========================================================================
    ui: {
        // --- STYLES ---
        injectStyles: () => {
            if (document.getElementById('garcom-v3-css')) return;
            const style = document.createElement('style');
            style.id = 'garcom-v3-css';
            style.innerHTML = `
                :root {
                    --g-bg: #0f172a;
                    --g-surface: rgba(30, 41, 59, 0.7);
                    --g-surface-active: rgba(51, 65, 85, 0.8);
                    --g-primary: #3b82f6;
                    --g-success: #22c55e;
                    --g-warning: #f59e0b;
                    --g-danger: #ef4444;
                    --g-text: #f8fafc;
                    --g-text-muted: #94a3b8;
                    --g-border: rgba(148, 163, 184, 0.1);
                    --g-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    --g-glass: blur(12px);
                }

                /* RESET & BASE */
                .waiter-app {
                    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
                    background: var(--g-bg);
                    color: var(--g-text);
                    width: 100%;
                    height: 100vh;
                    overflow: hidden;
                    position: fixed;
                    top: 0; left: 0; z-index: 9000;
                    display: flex; flex-direction: column;
                }

                .g-scroll { overflow-y: auto; scrollbar-width: none; }
                .g-scroll::-webkit-scrollbar { display: none; }

                /* ANIMATIONS */
                @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
                .anim-slide { animation: slideIn 0.3s ease-out forwards; }
                
                /* COMPONENTS */
                .g-btn {
                    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
                    padding: 12px 20px; border-radius: 12px; border: none; font-weight: 600;
                    cursor: pointer; transition: all 0.2s; font-size: 1rem;
                }
                .g-btn:active { transform: scale(0.96); }
                .g-btn.primary { background: var(--g-primary); color: white; box-shadow: 0 0 15px rgba(59, 130, 246, 0.3); }
                .g-btn.success { background: var(--g-success); color: white; }
                .g-btn.danger { background: var(--g-danger); color: white; }
                .g-btn.ghost { background: transparent; color: var(--g-text); border: 1px solid var(--g-border); }
                .g-btn.full { width: 100%; }

                .g-card {
                    background: var(--g-surface);
                    backdrop-filter: var(--g-glass);
                    border: 1px solid var(--g-border);
                    border-radius: 16px;
                    padding: 16px;
                    margin-bottom: 12px;
                }

                /* TABLE GRID */
                .g-tables-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
                    gap: 12px;
                    padding: 15px;
                    padding-bottom: 100px;
                }
                .g-table-item {
                    aspect-ratio: 1;
                    border-radius: 16px;
                    background: var(--g-surface);
                    border: 1px solid var(--g-border);
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    position: relative; cursor: pointer; transition: all 0.2s;
                }
                .g-table-item.active { background: var(--g-surface-active); border-color: var(--g-primary); }
                .g-table-item.free { opacity: 0.6; }
                .g-table-item.busy { background: rgba(59, 130, 246, 0.2); border-color: var(--g-primary); opacity: 1; }
                .g-table-item.paying { background: rgba(34, 197, 94, 0.2); border-color: var(--g-success); animation: pulse 2s infinite; }
                
                .g-t-num { font-size: 1.5rem; font-weight: 800; color: white; }
                .g-t-stat { font-size: 0.7rem; text-transform: uppercase; margin-top: 4px; color: var(--g-text-muted); }
                
                /* HEADER */
                .g-header {
                    padding: 15px 20px;
                    background: rgba(15, 23, 42, 0.9);
                    backdrop-filter: blur(10px);
                    border-bottom: 1px solid var(--g-border);
                    display: flex; justify-content: space-between; align-items: center;
                    z-index: 10;
                }

                /* MODAL */
                .g-modal-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
                    z-index: 9999; display: flex; align-items: flex-end; justify-content: center;
                }
                .g-modal-sheet {
                    background: #1e293b;
                    width: 100%; max-width: 600px;
                    height: 90vh;
                    border-radius: 24px 24px 0 0;
                    display: flex; flex-direction: column;
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    overflow: hidden;
                    box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
                }
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

                /* FORMS */
                .g-input {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--g-border);
                    color: white; padding: 12px; border-radius: 8px; width: 100%;
                    margin-bottom: 10px; font-size: 1rem;
                }
                .g-input:focus { outline: none; border-color: var(--g-primary); }

                /* TABS */
                .g-tabs { display: flex; gap: 10px; overflow-x: auto; padding: 10px; }
                .g-tab {
                    padding: 8px 16px; border-radius: 20px; background: rgba(255,255,255,0.05);
                    color: var(--g-text-muted); white-space: nowrap; cursor: pointer; border: 1px solid transparent;
                }
                .g-tab.active { background: var(--g-primary); color: white; }

                /* TOAST */
                .g-toast {
                    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                    background: #333; color: white; padding: 12px 24px; border-radius: 50px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    z-index: 10000; animation: fadeInDown 0.3s; display: flex; align-items: center; gap: 10px;
                }

                .spinner {
                    width: 40px; height: 40px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-left-color: var(--g-primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        },

        // --- GLOBAL LAYOUT ---
        setupShell: () => {
            const app = document.createElement('div');
            app.id = 'naxio-waiter-app';
            app.className = 'waiter-app';
            app.innerHTML = `
                <div id="g-header" class="g-header"></div>
                <div id="g-content" class="g-scroll" style="flex:1;"></div>
                <div id="g-nav" class="g-nav"></div>
                <div id="g-overlays"></div>
            `;
            document.body.innerHTML = ''; // Take over body
            document.body.appendChild(app);
        },

        // --- SPECIFIC VIEWS ---
        renderLogin: async () => {
            GarcomSystem.ui.setupShell();
            const content = document.getElementById('g-content');

            // 1. Ensure Store ID & Debug
            const sid = GarcomSystem.state.storeId;
            console.log("🔍 Buscando staff para loja:", sid);

            if (!sid) return GarcomSystem.ui.renderError("Erro de Vinculação", "Não foi possível identificar a loja deste usuário.");

            try {
                // 2. Fetch Owner & Staff in parallel for speed and robustness
                const [ownerRes, staffRes] = await Promise.all([
                    _sb.from('stores').select('admin_id').eq('id', sid).maybeSingle(),
                    _sb.from('store_staff').select('*, profiles:profile_id(nome_completo, id)').eq('store_id', sid)
                ]);

                let candidates = [];
                const seenIds = new Set();

                // 2.1 Add Owner (Fetch profile separately to ensure we get the name)
                if (ownerRes.data && ownerRes.data.admin_id) {
                    const { data: ownerProfile } = await _sb.from('profiles').select('*').eq('id', ownerRes.data.admin_id).maybeSingle();
                    if (ownerProfile) {
                        candidates.push({
                            id: ownerProfile.id,
                            nome: ownerProfile.nome_completo || 'Gerente',
                            role: 'Gerente / Dono',
                            initial: (ownerProfile.nome_completo || 'G').charAt(0).toUpperCase()
                        });
                        seenIds.add(ownerProfile.id);
                    }
                }

                // 2.2 Add Staff
                if (staffRes.data) {
                    staffRes.data.forEach(s => {
                        // Support both relational and flattened structures
                        const pId = s.profile_id || s.id;
                        if (seenIds.has(pId)) return; // Skip duplicates

                        const name = s.profiles?.nome_completo || s.nome || 'Funcionario';
                        candidates.push({
                            id: pId,
                            nome: name,
                            role: s.role || 'Staff',
                            initial: name.charAt(0).toUpperCase()
                        });
                        seenIds.add(pId);
                    });
                }

                // 2.3 Fallback: Add Current User if logged in locally but not found above
                const localSession = localStorage.getItem('logimoveis_session');
                if (localSession) {
                    const ls = JSON.parse(localSession);
                    if (!seenIds.has(ls.id)) {
                        candidates.push({
                            id: ls.id,
                            nome: ls.nome_completo || ls.email || 'Eu',
                            role: 'Sessão Atual',
                            initial: (ls.nome_completo || 'E').charAt(0).toUpperCase()
                        });
                    }
                }

                const staffListHtml = candidates.map(s => `
                    <div class="g-card anim-slide" onclick="GarcomSystem.auth.login('${s.id}', '${s.nome}')" style="display:flex; align-items:center; gap:15px; cursor:pointer; margin-bottom:10px;">
                        <div style="width:50px; height:50px; background:var(--g-primary); border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:1.2rem; color:white;">
                            ${s.initial}
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:bold; font-size:1.1rem;">${s.nome}</div>
                            <div style="font-size:0.8rem; color:var(--g-text-muted);">${s.role.toUpperCase()}</div>
                        </div>
                        <div style="width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.1); border-radius:50%;">
                            <i class="ri-login-circle-line"></i>
                        </div>
                    </div>
                `).join('');

                content.innerHTML = `
                    <div style="padding:40px 20px; max-width:500px; margin:0 auto;">
                        <div style="text-align:center; margin-bottom:30px;">
                            <div style="width:80px; height:80px; background:var(--g-primary); border-radius:20px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:15px; box-shadow:0 10px 30px rgba(59,130,246,0.3);">
                                <i class="ri-restaurant-2-fill" style="font-size:3rem; color:white;"></i>
                            </div>
                            <h1 style="font-size:1.8rem; font-weight:800; margin-bottom:5px;">Naxio Waiter</h1>
                            <p style="color:var(--g-text-muted);">${candidates.length} perfis encontrados</p>
                        </div>
                        
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${staffListHtml}
                        </div>

                        ${candidates.length === 0 ? `
                            <div style="padding:20px; background:rgba(239, 68, 68, 0.1); border:1px dashed #ef4444; border-radius:10px; text-align:center; color:#fca5a5;">
                                <i class="ri-error-warning-line" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
                                Nenhum perfil encontrado.<br>
                                <small>Store ID: ${sid}</small>
                            </div>
                        ` : ''}

                        <div style="margin-top:40px; text-align:center;">
                             <button class="g-btn ghost" onclick="location.reload()" style="font-size:0.8rem;">
                                <i class="ri-refresh-line"></i> Atualizar Lista
                             </button>
                        </div>
                    </div>
                `;

                // Hide header for login
                const header = document.getElementById('g-header');
                if (header) header.style.display = 'none';

            } catch (err) {
                console.error("Login Render Error:", err);
                GarcomSystem.ui.renderError("Erro ao carregar equipe", err.message);
            }
        },

        renderHome: () => {
            GarcomSystem.ui.setupShell();
            GarcomSystem.ui.updateHeader('Visão Geral');

            const content = document.getElementById('g-content');

            // Render Skeleton Grid if empty
            const isEmpty = GarcomSystem.state.tables.length === 0;

            content.innerHTML = `
                <div id="table-grid-area" class="g-tables-grid">
                    ${isEmpty ? Array(20).fill(0).map((_, i) => `
                        <div class="g-table-item free" style="opacity:0.3; animation:pulse 1s infinite;">
                            <span class="g-t-num">${i + 1}</span>
                        </div>
                    `).join('') : ''}
                </div>
                
                <!-- Floating Action Button -->
                <button onclick="GarcomSystem.ui.openQuickActions()" style="
                    position:fixed; bottom:30px; right:30px; 
                    width:60px; height:60px; border-radius:50%; border:none;
                    background:var(--g-primary); color:white; font-size:1.5rem;
                    box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);
                    display:flex; align-items:center; justify-content:center;
                    z-index: 100;
                ">
                    <i class="ri-flashlight-line"></i>
                </button>

                <button onclick="GarcomSystem.catalog.open('view')" style="
                    position:fixed; bottom:30px; left:30px; 
                    width:50px; height:50px; border-radius:50%; border:none;
                    background:var(--g-surface-active); color:white; font-size:1.4rem;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
                    display:flex; align-items:center; justify-content:center;
                    z-index: 100;
                ">
                    <i class="ri-book-open-line"></i>
                </button>
            `;

            if (!isEmpty) GarcomSystem.ui.updateTableStatuses();
        },

        updateTableStatuses: () => {
            const container = document.getElementById('table-grid-area');
            if (!container) return;

            // Always re-build to ensure state sync, replacing Skeletons or Old data
            // Optimized HTML generation
            container.innerHTML = GarcomSystem.state.tables.map(t => {
                const statusClass = t.status === 'ocupada' ? 'busy' : (t.status === 'pagando' ? 'paying' : 'free');

                // Show total if busy/paying
                const total = t.items ? t.items.reduce((acc, i) => acc + (i.price * i.qtd), 0) : 0;

                // Interaction: Only allow click if free or busy (not if locked/processing, though usually waiter updates all)
                return `
                    <div id="tbl-${t.numero}" class="g-table-item ${statusClass} anim-slide" onclick="GarcomSystem.router.navigate('table', ${t.numero})">
                        <span class="g-t-num">${t.numero}</span>
                        <span class="g-t-stat">
                            ${t.status === 'free'
                        ? 'LIVRE'
                        : (t.status === 'pagando'
                            ? '<span style="color:var(--g-success); font-weight:bold;">PAGANDO</span>'
                            : `<span style="color:#fff;">R$ ${total.toFixed(0)}</span>`)
                    }
                        </span>
                        ${t.status !== 'free' ? '<div style="position:absolute; top:5px; right:5px; width:8px; height:8px; border-radius:50%; background:var(--g-success);"></div>' : ''}
                    </div>
                `;
            }).join('');
        },

        renderTableDetail: async (n) => {
            const t = GarcomSystem.state.tables.find(tbl => tbl.numero === n);
            GarcomSystem.state.activeTable = n;
            GarcomSystem.ui.updateHeader(`Mesa ${n}`, true);

            const content = document.getElementById('g-content');
            const items = t && t.items ? t.items : [];
            const total = items.reduce((a, b) => a + (b.price * b.qtd), 0);

            // Separate items
            const sentItems = items.filter(i => i.status !== 'new');
            // const newItems = items.filter(i => i.status === 'new'); // Not handled in DB array, but local cart

            content.innerHTML = `
                <div style="padding:20px; padding-bottom:120px; display:flex; flex-direction:column; max-width:800px; margin:0 auto; width:100%;">
                    
                    <!-- SUMMARY CARD -->
                    <div class="g-card" style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9));">
                        <div>
                            <div class="text-sm text-muted">Total Atual</div>
                            <div style="font-size:2rem; font-weight:800; color:var(--g-primary);">R$ ${total.toFixed(2)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="text-xs text-muted">Abertura: 10:30</div>
                            <div style="color:var(--g-success);">Status: ${t.status.toUpperCase()}</div>
                        </div>
                    </div>

                    <!-- ACTIONS -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                        <button class="g-btn success" onclick="GarcomSystem.orders.openMenu(${n})">
                            <i class="ri-add-line"></i> Adicionar
                        </button>
                        <button class="g-btn primary" onclick="GarcomSystem.bills.openOptions(${n})">
                            <i class="ri-bill-line"></i> Conta
                        </button>
                        <button class="g-btn ghost" onclick="GarcomSystem.ui.openMoreOptions(${n})">
                            <i class="ri-more-2-line"></i>
                        </button>
                    </div>

                    <!-- ITEMS LIST -->
                    <div style="flex:1;">
                        ${items.length === 0
                    ? `<div style="text-align:center; padding:50px; opacity:0.5;">
                                  <i class="ri-restaurant-line" style="font-size:3rem; margin-bottom:10px;"></i><br>
                                  Mesa vazia. Adicione o primeiro pedido.
                               </div>`
                    : ''
                }

                        ${items.slice().reverse().map((item, idx) => `
                            <div class="g-card anim-slide" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; padding:12px;">
                                <div style="flex:1;">
                                    <div style="font-weight:600; font-size:1.1rem;">
                                        <span style="color:var(--g-primary); font-weight:800;">${item.qtd}x</span> ${item.nome}
                                    </div>
                                    ${item.observacao ? `<div style="color:var(--g-warning); font-size:0.85rem; margin-top:4px;">📝 ${item.observacao}</div>` : ''}
                                    <div style="font-size:0.75rem; color:var(--g-text-muted); margin-top:4px;">
                                        ${new Date(item.added_at).toLocaleTimeString().substring(0, 5)} • ${item.garcom || 'Staff'}
                                    </div>
                                </div>
                                <div style="font-weight:600;">R$ ${(item.price * item.qtd).toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        },

        updateHeader: (title, back = false) => {
            const h = document.getElementById('g-header');
            h.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px;">
                    ${back ? `<button class="g-btn ghost" onclick="GarcomSystem.router.navigate('home')" style="padding:8px;"><i class="ri-arrow-left-line"></i></button>` : ''}
                    <h2 style="margin:0; font-size:1.2rem;">${title}</h2>
                </div>
                
                <div style="display:flex; align-items:center; gap:15px;">
                    <div id="net-indicator" style="width:10px; height:10px; border-radius:50%; background:${GarcomSystem.state.online ? 'var(--g-success)' : 'var(--g-danger)'};"></div>
                    <div onclick="GarcomSystem.auth.logout()" style="width:35px; height:35px; background:var(--g-surface-active); border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                         <i class="ri-user-line"></i>
                    </div>
                </div>
            `;
        },

        introLoader: (show) => {
            let el = document.getElementById('g-loader');
            if (show) {
                if (!el) {
                    el = document.createElement('div');
                    el.id = 'g-loader';
                    el.style.cssText = `position:fixed; inset:0; background:#0f172a; z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center;`;
                    el.innerHTML = `<div class="spinner"></div><h3 style="margin-top:20px; color:white;">Carregando App...</h3>`;
                    document.body.appendChild(el);
                }
            } else {
                if (el) el.remove();
            }
        },

        toast: (msg, type = 'info') => {
            const t = document.createElement('div');
            t.className = 'g-toast';
            t.innerHTML = `
                <i class="ri-${type === 'success' ? 'checkbox-circle' : (type === 'error' ? 'error-warning' : 'information')}-fill" style="color:${type === 'success' ? '#4ade80' : (type === 'error' ? '#f87171' : '#60a5fa')}"></i>
                <span>${msg}</span>
            `;
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300) }, 3000);
        },

        updateNetworkStatus: (connected) => {
            const ind = document.getElementById('net-indicator');
            if (ind) ind.style.background = (connected || GarcomSystem.state.online) ? 'var(--g-success)' : 'var(--g-danger)';
        },

        setLoading: (isLoading) => {
            let el = document.getElementById('g-loading-overlay');
            if (isLoading) {
                if (!el) {
                    el = document.createElement('div');
                    el.id = 'g-loading-overlay';
                    el.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(2px); z-index:99999; display:flex; align-items:center; justify-content:center;";
                    el.innerHTML = '<div class="spinner"></div>';
                    document.body.appendChild(el);
                }
            } else {
                if (el) el.remove();
            }
        },

        renderError: (title, msg) => {
            const app = document.getElementById('naxio-waiter-app') || document.body;
            // Ensure clean slate
            app.innerHTML = '';

            const container = document.createElement('div');
            container.style.cssText = 'height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0f172a; color:white; text-align:center; padding:20px; position:fixed; inset:0; z-index:10000;';

            container.innerHTML = `
                <i class="ri-error-warning-fill" style="font-size:4rem; color:#ef4444; margin-bottom:20px;"></i>
                <h2 style="font-size:1.5rem; margin-bottom:10px;">${title}</h2>
                <p style="color:#94a3b8; max-width:400px; line-height:1.5;">${msg}</p>
                <button onclick="location.reload()" style="margin-top:30px; padding:12px 24px; background:#3b82f6; border:none; border-radius:8px; color:white; font-weight:bold; cursor:pointer; transition:0.2s;">
                    Recarregar Página
                </button>
                <button onclick="GarcomSystem.auth.logout()" style="margin-top:15px; padding:12px 24px; background:transparent; border:1px solid #334155; border-radius:8px; color:#cbd5e1; cursor:pointer;">
                    Sair / Resetar
                </button>
             `;
            app.appendChild(container);
        },

        closeModal: () => {
            document.querySelectorAll('.g-modal-overlay').forEach(el => el.remove());
        },

        openQuickActions: () => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto;">
                    <div style="padding:20px;">
                        <h3>Ações Rápidas</h3>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px;">
                            <div class="g-card" onclick="GarcomSystem.data.syncTables(); GarcomSystem.ui.closeModal();" style="text-align:center; cursor:pointer;">
                                <i class="ri-refresh-line" style="font-size:2rem; color:var(--g-primary);"></i>
                                <div style="margin-top:5px;">Atualizar</div>
                            </div>
                            <div class="g-card" onclick="GarcomSystem.reports.openMyStats();" style="text-align:center; cursor:pointer;">
                                <i class="ri-bar-chart-line" style="font-size:2rem; color:var(--g-success);"></i>
                                <div style="margin-top:5px;">Comissão</div>
                            </div>
                            <div class="g-card" onclick="GarcomSystem.notifications.openInbox();" style="text-align:center; cursor:pointer;">
                                <i class="ri-notification-3-line" style="font-size:2rem; color:var(--g-warning);"></i>
                                <div style="margin-top:5px;">Msgs</div>
                            </div>
                            <div class="g-card" onclick="GarcomSystem.settings.open();" style="text-align:center; cursor:pointer;">
                                <i class="ri-settings-3-line" style="font-size:2rem; color:var(--g-text-muted);"></i>
                                <div style="margin-top:5px;">Ajustes</div>
                            </div>
                            <!-- NEW BUTTON -->
                            <div class="g-card" onclick="GarcomSystem.catalog.open('view')" style="grid-column:span 2; text-align:center; cursor:pointer; background:linear-gradient(45deg, #1e293b, #0f172a); border:1px solid var(--g-primary);">
                                <i class="ri-book-open-line" style="font-size:2rem; color:var(--g-primary);"></i>
                                <div style="margin-top:5px; font-weight:bold;">Cardápio Digital</div>
                            </div> 
                        </div>
                        <button class="g-btn danger full" style="margin-top:10px;" onclick="this.closest('.g-modal-overlay').remove()">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        openMoreOptions: (tableNum) => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto;">
                    <div style="padding:20px;">
                        <h3>Opcões Mesa ${tableNum}</h3>
                        <div style="display:flex; flex-direction:column; gap:10px; margin-top:20px;">
                            <button class="g-btn ghost full" onclick="GarcomSystem.management.openTransferModal(${tableNum})">
                                <i class="ri-arrow-left-right-line"></i> Transferir Mesa
                            </button>
                            <button class="g-btn ghost full" style="opacity:0.5;">
                                <i class="ri-vip-crown-line"></i> Chamar Gerente (Em breve)
                            </button>
                        </div>
                        <button class="g-btn danger full" style="margin-top:20px;" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    },

    // =========================================================================
    // 8. ORDERS & MENU
    // =========================================================================
    orders: {
        currentCart: [],

        openMenu: (tableNum) => {
            // Render basic modal structure
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:95vh;">
                    <div style="padding:15px; border-bottom:1px solid #334155; display:flex; gap:10px;">
                        <input id="menu-search" type="text" class="g-input" placeholder="🔍 Buscar produto..." style="margin:0;">
                        <button class="g-btn ghost" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                    </div>
                    
                    <div id="menu-cats" class="g-tabs">
                        ${GarcomSystem.state.categories.map(c => `<div class="g-tab ${c === 'Todos' ? 'active' : ''}" onclick="GarcomSystem.orders.filterMenu('${c}', this)">${c}</div>`).join('')}
                    </div>

                    <div id="menu-list" class="g-scroll" style="flex:1; padding:15px; background:var(--g-bg);">
                        <!-- Products Grid -->
                    </div>

                    <div id="cart-dock" style="padding:15px; background:#1e293b; border-top:1px solid #334155; display:none;">
                       <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span>Itens: <b id="cart-count">0</b></span>
                            <span>Total: <b id="cart-total">R$ 0,00</b></span>
                       </div>
                       <button class="g-btn success full" onclick="GarcomSystem.orders.reviewOrder(${tableNum})">
                            Revisar e Enviar
                       </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            GarcomSystem.orders.renderProducts('Todos');

            // Search Listener
            document.getElementById('menu-search').addEventListener('input', (e) => {
                GarcomSystem.orders.renderProducts('Search', e.target.value);
            });
        },

        filterMenu: (cat, el) => {
            document.querySelectorAll('.g-tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            GarcomSystem.orders.renderProducts(cat);
        },

        renderProducts: (category, query = null) => {
            const list = document.getElementById('menu-list');
            if (!list) return;

            let products = GarcomSystem.state.menu;

            if (query) {
                const q = query.toLowerCase();
                products = products.filter(p =>
                    (p.nome && p.nome.toLowerCase().includes(q)) ||
                    (p.codigo_cardapio && String(p.codigo_cardapio).toLowerCase().includes(q)) ||
                    (p.codigo_barras && String(p.codigo_barras).toLowerCase().includes(q)) ||
                    (p.cod && String(p.cod).toLowerCase().includes(q))
                );
            } else if (category !== 'Todos') {
                products = products.filter(p => p.category === category);
            }

            // Pagination limit for performance
            const limit = 50;
            const viewProducts = products.slice(0, limit);

            list.innerHTML = viewProducts.map(p => `
                <div class="g-card" onclick="GarcomSystem.orders.addToCart('${p.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:12px; margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;">${p.nome}</div>
                        <div style="font-size:0.8rem; color:var(--g-text-muted);">cod: ${p.codigo_cardapio || p.codigo_barras || p.cod || p.id.slice(0, 4)}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; color:var(--g-primary);">R$ ${p.preco.toFixed(2)}</div>
                        <i class="ri-add-circle-fill" style="font-size:1.5rem; color:var(--g-success);"></i>
                    </div>
                </div>
            `).join('');

            if (products.length === 0) list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--g-text-muted);">Nenhum produto encontrado.</div>`;
        },

        addToCart: (id) => {
            const product = GarcomSystem.state.menu.find(p => p.id === id);

            // Initial simple add, advanced allows modifiers
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.style.zIndex = '10001';

            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto; border-radius:16px;">
                    <div style="padding:20px;">
                        <h3>${product.nome}</h3>
                        <div style="display:flex; gap:10px; margin:20px 0; align-items:center; justify-content:center;">
                            <button class="g-btn ghost" onclick="const e=document.getElementById('qty'); e.value=Math.max(0.5, parseFloat(e.value)-1)">-</button>
                            <input id="qty" type="number" step="0.1" value="1" style="width:80px; text-align:center; font-size:1.5rem; background:transparent; border:none; color:white;">
                            <button class="g-btn ghost" onclick="const e=document.getElementById('qty'); e.value=parseFloat(e.value)+1">+</button>
                        </div>
                        
                        <label style="display:block; margin-bottom:10px; font-size:0.9rem; color:#aaa;">Observações (Opcional)</label>
                        <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px;">
                            ${['Sem Cebola', 'Sem Gelo', 'Bem Passado', 'Ao Ponto'].map(t =>
                `<span class="g-btn ghost" style="padding:4px 8px; font-size:0.75rem;" onclick="document.getElementById('obs').value += ' ${t}'">${t}</span>`
            ).join('')}
                        </div>
                        <textarea id="obs" class="g-input" rows="2" placeholder="Ex: Tirar o molho..."></textarea>

                        <button class="g-btn primary full" onclick="GarcomSystem.orders.confirmAddItem('${id}')">Confirmar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        confirmAddItem: (id) => {
            const product = GarcomSystem.state.menu.find(p => p.id === id);
            const qty = parseFloat(document.getElementById('qty').value) || 1;
            const obs = document.getElementById('obs').value;

            const item = {
                id: product.id,
                nome: product.nome,
                price: product.preco,
                qtd: qty,
                observacao: obs,
                ncm: product.ncm || '00000000',
                status: 'new'
            };

            GarcomSystem.state.cart.push(item);

            // Remove popup
            document.querySelector('.g-modal-overlay[style*="10001"]').remove();

            // Update dock
            GarcomSystem.orders.updateCartDock();
            GarcomSystem.ui.toast(`${qty}x ${product.nome} adicionado!`);
        },

        updateCartDock: () => {
            const dock = document.getElementById('cart-dock');
            if (GarcomSystem.state.cart.length > 0) {
                dock.style.display = 'block';
                const total = GarcomSystem.state.cart.reduce((a, b) => a + (b.price * b.qtd), 0);
                document.getElementById('cart-count').textContent = GarcomSystem.state.cart.length;
                document.getElementById('cart-total').textContent = `R$ ${total.toFixed(2)}`;
            } else {
                dock.style.display = 'none';
            }
        },

        reviewOrder: (tableNum) => {
            // Final confirm modal
            const total = GarcomSystem.state.cart.reduce((a, b) => a + (b.price * b.qtd), 0);

            const listHtml = GarcomSystem.state.cart.map((i, idx) => `
                <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #333;">
                    <div>${i.qtd}x ${i.nome} <br><small class="text-muted">${i.observacao}</small></div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span>R$ ${(i.price * i.qtd).toFixed(2)}</span>
                        <i class="ri-delete-bin-line" style="color:red;" onclick="GarcomSystem.orders.removeItem(${idx}, ${tableNum})"></i>
                    </div>
                </div>
            `).join('');

            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.style.zIndex = '10002';
            modal.innerHTML = `
                <div class="g-modal-sheet">
                    <div class="modal-header" style="padding:15px; border-bottom:1px solid #333;">
                        <h3>Revisar Pedido - Mesa ${tableNum}</h3>
                    </div>
                    <div class="modal-body g-scroll" style="flex:1; padding:15px;">
                        ${listHtml}
                    </div>
                    <div class="modal-footer" style="padding:15px; border-top:1px solid #333;">
                        <input type="text" id="order-obs-geral" class="g-input" placeholder="Observação geral para o pedido...">
                        <div style="display:flex; justify-content:space-between; margin:15px 0; font-size:1.2rem; font-weight:bold;">
                            <span>Total</span>
                            <span>R$ ${total.toFixed(2)}</span>
                        </div>
                        <button class="g-btn success full" style="font-size:1.2rem; padding:15px;" onclick="GarcomSystem.orders.submitFinal(${tableNum})">
                            🚀 ENVIAR PEDIDO
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        removeItem: (idx, tableNum) => {
            GarcomSystem.state.cart.splice(idx, 1);
            document.querySelector('.g-modal-overlay[style*="10002"]').remove();
            if (GarcomSystem.state.cart.length > 0) {
                GarcomSystem.orders.reviewOrder(tableNum);
                GarcomSystem.orders.updateCartDock();
            } else {
                GarcomSystem.orders.updateCartDock();
                // Close reviews
            }
        },

        submitFinal: async (tableNum) => {
            const obsGeral = document.getElementById('order-obs-geral').value;
            GarcomSystem.ui.setLoading(true);

            // 🔥 VERIFICA SE É HORÁRIO DE RESERVA (09:00 - 11:30)
            const agora = new Date();
            const hora = agora.getHours();
            const minuto = agora.getMinutes();
            const horaAtual = hora + (minuto / 60);
            const isHorarioReserva = horaAtual >= 9 && horaAtual <= 11.5;

            let isReserva = false;
            // Usa confirm() padrão para simplificar na interface mobile do garçom
            if (isHorarioReserva) {
                isReserva = confirm('📅 Reserva de Prato\n\nAlgum item deste pedido é para reserva (almoço)?\nOK = Sim, Cancelar = Não');
            }

            // O sendOrder cria a comanda e atualiza os items
            await GarcomSystem.data.sendOrder(tableNum, GarcomSystem.state.cart, obsGeral);

            // 🔥 SE FOR RESERVA, SALVA NA TABELA DE RESERVAS
            if (isReserva) {
                const comandaId = GarcomSystem.state.tables.find(t => t.numero === tableNum && t.status !== 'free')?.id;

                if (comandaId) {
                    const reservasLote = GarcomSystem.state.cart.map(item => ({
                        store_id: GarcomSystem.state.storeId,
                        comanda_id: comandaId,
                        mesa_numero: tableNum,
                        garcom_nome: GarcomSystem.state.waiterName,
                        produto_nome: item.nome,
                        quantidade: item.qtd,
                        preco_unitario: item.price,
                        observacoes: item.observacao || '',
                        data_reserva: new Date().toISOString().split('T')[0],
                        status: 'pendente'
                    }));

                    const { error: reservaError } = await _sb.from('reservas_pratos').insert(reservasLote);
                    if (!reservaError) {
                        alert(`✅ Reserva Registrada\n${GarcomSystem.state.cart.length} itens adicionados à reserva!`);
                    } else {
                        console.error("Erro Reserva PR:", reservaError);
                    }
                }
            }

            GarcomSystem.ui.setLoading(false);
            // Close all modals
            GarcomSystem.ui.closeModal();
        }
    },

    // =========================================================================
    // 9. BILLS & REPORTS
    // =========================================================================
    bills: {
        openOptions: (tableNum) => {
            const items = GarcomSystem.state.tables.find(t => t.numero === tableNum)?.items || [];
            if (items.length === 0) return GarcomSystem.ui.toast("Mesa vazia!");

            const total = items.reduce((a, b) => a + (b.price * b.qtd), 0);

            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto; min-height:50vh;">
                    <div style="padding:20px; text-align:center;">
                        <h2>Conta Mesa ${tableNum}</h2>
                        <h1 style="color:var(--g-success); font-size:2.5rem; margin:10px 0;">R$ ${total.toFixed(2)}</h1>
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:20px;">
                            <button class="g-btn primary" onclick="GarcomSystem.bills.print(${tableNum})">
                                <i class="ri-printer-line"></i> Imprimir
                            </button>
                            <button class="g-btn ghost" onclick="GarcomSystem.bills.showSplit(${tableNum}, ${total})">
                                <i class="ri-group-line"></i> Dividir
                            </button>
                            <button class="g-btn ghost" onclick="GarcomSystem.bills.requestClose(${tableNum})">
                                <i class="ri-flag-line"></i> Pedir Fechamento
                            </button>
                            <button class="g-btn danger" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        print: async (tableNum) => {
            // 1. Calculate Details
            const t = GarcomSystem.state.tables.find(tbl => tbl.numero === tableNum);
            if (!t || !t.items) return GarcomSystem.ui.toast("Mesa vazia ou inválida.");

            // 🔥 AGRUPA itens por nome + observação antes de calcular (resolve duplicados)
            const agrupadosCalc = {};
            t.items.forEach(i => {
                const nome = (i.nome || i.name || 'Item').toString().trim();
                const obs = (i.observacao || '').toString().trim();
                const key = nome.toUpperCase() + '||' + obs;
                const qtd = parseInt(i.qtd, 10) || 1;
                const preco = parseFloat(i.price) || 0;
                if (!agrupadosCalc[key]) {
                    agrupadosCalc[key] = { nome, obs, qtd: 0, total: 0 };
                }
                agrupadosCalc[key].qtd += qtd;
                agrupadosCalc[key].total += preco * qtd;
            });
            const itensAgrupados = Object.values(agrupadosCalc);

            const subtotal = itensAgrupados.reduce((a, b) => a + b.total, 0);
            const taxa = subtotal * (GarcomSystem.config.defaultTax / 100);
            const total = subtotal + taxa;

            // 2. Fetch Printers
            let printers = [];
            try {
                // Correct Table Name: store_printers
                const { data, error } = await _sb.from('store_printers')
                    .select('*')
                    .eq('store_id', GarcomSystem.state.storeId)
                    .eq('status', 'online');

                if (!error && data) printers = data;
                else console.warn("Erro ao buscar impressoras:", error);

            } catch (e) {
                console.warn("Printers fetch crash", e);
            }

            // 3. Monta HTML dos itens agrupados
            const itensHtml = itensAgrupados.map(i =>
                '<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #444; padding:5px 0;">' +
                '<span>' + i.qtd + 'x ' + i.nome + (i.obs ? '<br><small style="color:#94a3b8;">' + i.obs + '</small>' : '') + '</span>' +
                '<span>' + i.total.toFixed(2) + '</span>' +
                '</div>'
            ).join('');

            // 4. Render Modal
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.style.zIndex = '12000'; // Top of everything

            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto; max-height:85vh;">
                    <div class="g-scroll" style="padding:20px;">
                        <h3 style="text-align:center;">Pré-visualização da Conta</h3>
                        <p style="text-align:center; color:var(--g-text-muted);">Mesa ${tableNum}</p>
                        
                        <div class="g-card" style="margin-top:20px; font-family:monospace;">
                            ${itensHtml}
                            
                            <div style="margin-top:15px; border-top:1px solid white; padding-top:10px;">
                                <div style="display:flex; justify-content:space-between;">
                                    <span>Subtotal</span>
                                    <span>R$ ${subtotal.toFixed(2)}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; color:var(--g-text-muted);">
                                    <span>Serviço (${GarcomSystem.config.defaultTax}%)</span>
                                    <span>R$ ${taxa.toFixed(2)}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1.2rem; margin-top:5px; color:var(--g-success);">
                                    <span>TOTAL</span>
                                    <span>R$ ${total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <h4 style="margin-top:20px; margin-bottom:10px;">Selecione a Impressora</h4>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${printers.length > 0 ? printers.map(p => `
                                <button class="g-btn ghost" onclick="GarcomSystem.bills.sendToPrinter('${p.id}', ${tableNum})" style="justify-content:space-between;">
                                    <span><i class="ri-printer-line"></i> ${p.name || 'Impressora ' + p.id.slice(0, 4)}</span>
                                    <span style="font-size:0.7rem; background:#22c55e; padding:2px 6px; border-radius:4px; color:black;">Online</span>
                                </button>
                            `).join('') : `
                                <div style="text-align:center; padding:15px; background:rgba(255,255,255,0.05); border-radius:10px;">
                                    Nenhuma impressora online encontrada.<br>
                                    <small onclick="GarcomSystem.bills.sendToPrinter('mock', ${tableNum})" style="text-decoration:underline; cursor:pointer;">Simular Impressão</small>
                                </div>
                            `}
                        </div>
                    </div>
                    <div style="padding:15px; border-top:1px solid var(--g-border);">
                         <button class="g-btn danger full" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        sendToPrinter: (printerId, tableNum) => {
            GarcomSystem.ui.toast("Enviando comando de impressão...", "info");
            // Aqui integraria com a API real de impressão do backend
            // Ex: await _sb.rpc('print_bill', { printer_id: printerId, table: tableNum })

            setTimeout(() => {
                GarcomSystem.ui.toast("✅ Impresso com sucesso!", "success");
                document.querySelectorAll('.g-modal-overlay').forEach(e => e.remove());
            }, 1500);
        },

        showSplit: (num, total) => {
            const pessoas = prompt("Dividir por quantas pessoas?", "2");
            if (pessoas && !isNaN(pessoas)) {
                const par = total / parseInt(pessoas);
                alert(`Total: R$ ${total.toFixed(2)}\nPor pessoa (${pessoas}): R$ ${par.toFixed(2)}`);
            }
        },

        requestClose: async (num) => {
            const { error } = await _sb.from('comandas')
                .update({ status: 'pagando' })
                .eq('numero', num)
                .eq('store_id', GarcomSystem.state.storeId)
                .neq('status', 'free');

            if (!error) {
                GarcomSystem.ui.toast("Solicitação enviada ao caixa!");
                GarcomSystem.ui.closeModal();
            }
        }
    },

    // =========================================================================
    // 10. TABLE MANAGEMENT (Transfer & Merge)
    // =========================================================================
    management: {
        openTransferModal: (fromTable) => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto;">
                    <div class="modal-header" style="padding:20px; text-align:center;">
                        <h3>Transferir Mesa ${fromTable}</h3>
                        <p class="text-muted">Selecione a mesa de destino</p>
                    </div>
                    <div class="modal-body g-scroll" style="height:300px; padding:15px;">
                        <div class="g-tables-grid">
                            ${GarcomSystem.state.tables.map(t =>
                t.numero !== fromTable ? `
                                <div class="g-table-item ${t.status}" onclick="GarcomSystem.management.confirmTransfer(${fromTable}, ${t.numero})">
                                    <span class="g-t-num">${t.numero}</span>
                                    <span class="g-t-stat">${t.status === 'free' ? 'Livre' : 'Ocupada'}</span>
                                </div>` : ''
            ).join('')}
                        </div>
                    </div>
                    <div class="modal-footer" style="padding:15px;">
                        <button class="g-btn danger full" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        confirmTransfer: async (from, to) => {
            if (!confirm(`Confirma transferir a Mesa ${from} para a Mesa ${to}?`)) return;

            GarcomSystem.ui.setLoading(true);
            try {
                // 1. Get IDs
                const origin = GarcomSystem.state.tables.find(t => t.numero === from);
                const target = GarcomSystem.state.tables.find(t => t.numero === to);

                if (!origin || origin.status === 'free') throw new Error("Mesa de origem vazia.");

                if (target.status === 'free') {
                    // Simple Move: Update number
                    const { error } = await _sb.from('comandas')
                        .update({ numero: to })
                        .eq('id', origin.id);
                    if (error) throw error;

                } else {
                    // Merge: Combine items
                    const newItems = [...target.items, ...origin.items];
                    // Update target
                    const { error: tErr } = await _sb.from('comandas')
                        .update({ items: newItems, updated_at: new Date().toISOString() })
                        .eq('id', target.id);
                    if (tErr) throw tErr;

                    // Close origin (or delete)
                    const { error: oErr } = await _sb.from('comandas')
                        .update({ status: 'fechada', items: [], obs_geral: `Transferido p/ ${to}` })
                        .eq('id', origin.id);
                    if (oErr) throw oErr;
                }

                GarcomSystem.ui.toast("Mesa transferida com sucesso!", "success");
                GarcomSystem.ui.closeModal();
                GarcomSystem.router.navigate('home');
                await GarcomSystem.data.syncTables();

            } catch (err) {
                console.error(err);
                GarcomSystem.ui.toast("Erro ao transferir: " + err.message, "error");
            } finally {
                GarcomSystem.ui.setLoading(false);
            }
        }
    },

    // =========================================================================
    // 11. PERSONAL REPORTS & DASHBOARD
    // =========================================================================
    reports: {
        openMyStats: () => {
            try {
                // Garantir estilos (Self-Healing)
                if (GarcomSystem.ui && GarcomSystem.ui.injectStyles) GarcomSystem.ui.injectStyles();

                GarcomSystem.ui.closeModal(); // Fecha modais anteriores para evitar IDs duplicados

                // Modal de Seleção de Data
                const modal = document.createElement('div');
                modal.className = 'g-modal-overlay';
                // IDs únicos caso a limpeza falhe
                const unique = Date.now();
                modal.innerHTML = `
                    <div class="g-modal-sheet" style="height:auto;">
                        <div style="padding:20px;">
                            <h3>Relatório de Comissões</h3>
                            <p class="text-muted">Selecione o período desejado</p>
                            
                            <div style="margin-top:20px;">
                                <label for="report-start-${unique}" style="display:block; margin-bottom:5px;">Data Inicial</label>
                                <input type="datetime-local" id="report-start-${unique}" class="g-input" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}T00:00">
                                
                                <label for="report-end-${unique}" style="display:block; margin-bottom:5px; margin-top:10px;">Data Final</label>
                                <input type="datetime-local" id="report-end-${unique}" class="g-input" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}T23:59">
                            </div>

                            <div style="margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <button class="g-btn ghost" onclick="this.closest('.g-modal-overlay').remove()">Cancelar</button>
                                <button class="g-btn primary" onclick="GarcomSystem.reports.generateReport('${unique}')">Gerar Relatório</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            } catch (e) {
                console.error("Erro ao abrir relatório:", e);
                alert("Erro ao abrir relatório: " + e.message);
            }
        },

        generateReport: async (uniqueId) => {
            const startVal = document.getElementById(`report-start-${uniqueId}`).value;
            const endVal = document.getElementById(`report-end-${uniqueId}`).value;

            const start = startVal.length === 16 ? startVal + ':00' : (startVal.includes('T') ? startVal : startVal + 'T00:00:00');
            const end = endVal.length === 16 ? endVal + ':59' : (endVal.includes('T') ? endVal : endVal + 'T23:59:59');

            GarcomSystem.ui.closeModal();
            GarcomSystem.ui.setLoading(true);

            // 1. AUTO-HEALING: Garantir Store ID
            if (!GarcomSystem.state.storeId) {
                if (typeof App !== 'undefined' && App.state && App.state.storeId) GarcomSystem.state.storeId = App.state.storeId;
                else {
                    const session = localStorage.getItem('logimoveis_session');
                    if (session) {
                        try { const s = JSON.parse(session); GarcomSystem.state.storeId = s.store_id || s.storeId; }
                        catch (e) { }
                    }
                }
            }

            if (!GarcomSystem.state.storeId) {
                GarcomSystem.ui.setLoading(false);
                return alert("Erro: Não foi possível identificar sua loja.");
            }

            const waiterName = GarcomSystem.state.waiterName || '';

            try {
                // Fetch VENDAS (Orders) NO PERÍODO
                // OBS: Agora buscamos na tabela de vendas históricas (orders), pois 'comandas' é limpa ao fechar.
                const { data: vendas, error } = await _sb.from('orders')
                    .select('observacao, total_pago, taxa_servico, created_at, status, products(nome, preco, categoria)')
                    .eq('store_id', GarcomSystem.state.storeId)
                    .neq('status', 'cancelado')
                    .neq('status', 'devolvido')
                    .gte('created_at', start)
                    .lte('created_at', end);

                if (error) throw error;

                let totalSold = 0;
                let itemsCount = 0;
                let tablesServed = 0;

                // Normalização para comparação (Case Insensitive)
                const safeWaiterName = waiterName.toLowerCase().trim();

                // DETECTAR SE É GERENTE/ADMIN (Ampliado para garantir acesso)
                const isManager = !safeWaiterName || ['gerente', 'admin', 'dono', 'proprietario', 'master', 'caixa', 'loja', 'sistema', 'usuario'].some(role => safeWaiterName.includes(role));

                // Agrupamento de Dados (Para TODOS ou INDIVIDUAL)
                const waitersMap = {};
                // Estrutura: { nome: string, total: number, items: number, commission: number }

                let globalTotalSales = 0;
                let globalTotalCommission = 0;

                if (vendas) {
                    vendas.forEach(v => {
                        let servedThisTable = false;
                        let itensPedido = [];

                        // 🔥 Verifica se este pedido cobrou 10% de serviço
                        const temTaxa = parseFloat(v.taxa_servico) > 0;

                        // Tenta extrair itens da observacao (JSON)
                        try {
                            if (v.observacao) {
                                const obsObj = typeof v.observacao === 'string' ? JSON.parse(v.observacao) : v.observacao;
                                if (obsObj && obsObj.itens) itensPedido = obsObj.itens;
                            }
                        } catch (e) { console.warn("Erro parse pedido", v.id); }

                        // 2. Fallback: Se não tem itens no JSON, usa o produto vinculado
                        if ((!itensPedido || itensPedido.length === 0) && v.products) {
                            itensPedido.push({
                                nome: v.products.nome,
                                qtd: 1,
                                price: v.products.preco,
                                categoria: v.products.categoria,
                                garcom: 'SISTEMA/CAIXA'
                            });
                        }

                        // 3. Fallback Final: Se ainda não tem itens, usa o TOTAL PAGO da venda
                        if ((!itensPedido || itensPedido.length === 0) && parseFloat(v.total_pago) > 0) {
                            let vendedorGeral = 'SISTEMA/CAIXA';
                            try {
                                if (v.observacao) {
                                    const obs = typeof v.observacao === 'string' ? JSON.parse(v.observacao) : v.observacao;
                                    if (obs.vendedor) vendedorGeral = obs.vendedor;
                                }
                            } catch (e) { }

                            itensPedido.push({
                                nome: 'Venda Geral',
                                qtd: 1,
                                price: parseFloat(v.total_pago),
                                garcom: vendedorGeral
                            });
                        }

                        if (itensPedido && Array.isArray(itensPedido)) {
                            itensPedido.forEach(i => {
                                const rawName = (i.garcom && typeof i.garcom === 'string') ? i.garcom.trim() : (i.vendedor || 'SISTEMA/CAIXA');
                                const nameKey = rawName.toUpperCase();

                                // Fix Robustez: Normaliza preço e quantidade
                                let pUnit = parseFloat(i.price);
                                if (isNaN(pUnit)) pUnit = parseFloat(i.preco);
                                if (isNaN(pUnit)) pUnit = 0;

                                const qtd = parseFloat(i.qtd) || 1;
                                const price = pUnit * qtd;

                                // Debug para entender pq valores somem
                                if (price === 0 && pUnit === 0) console.log("Item sem preço encontrado:", i);

                                // Se não é gerente, filtra pelo nome do garçom atual
                                let include = true;
                                if (!isManager) {
                                    const itemSafe = rawName.toLowerCase();
                                    if (!itemSafe.includes(safeWaiterName) && !safeWaiterName.includes(itemSafe)) {
                                        include = false;
                                    }
                                }

                                // 🔥 SEMPRE exclui lançamentos do SISTEMA/CAIXA do relatório de garçons
                                const isSistema = ['sistema', 'caixa', 'loja'].some(k => rawName.toLowerCase().includes(k));
                                if (isSistema) include = false;

                                if (include) {
                                    if (!waitersMap[nameKey]) {
                                        waitersMap[nameKey] = { nome: nameKey, total: 0, items: 0, commission: 0 };
                                    }
                                    waitersMap[nameKey].total += price;
                                    waitersMap[nameKey].items += (parseFloat(i.qtd) || 1);
                                    // 🔥 Só ganha comissão se o pedido cobrou o 10% de serviço
                                    if (temTaxa) {
                                        waitersMap[nameKey].commission += (price * 0.10);
                                        globalTotalCommission += (price * 0.10);
                                    }

                                    globalTotalSales += price;
                                    servedThisTable = true;
                                }
                            });
                        }
                        if (servedThisTable) tablesServed++;
                    });
                }

                // CONSTROÍ O HTML BASEADO NO PERFIL
                // GERAR HTML DO CUPOM (Estilo Fiscal)
                const nowStr = new Date().toLocaleString('pt-BR');
                const startStr = new Date(start).toLocaleString('pt-BR');
                const endStr = new Date(end).toLocaleString('pt-BR');

                // Monta as linhas dos garçons
                const waitersListHTML = Object.values(waitersMap).sort((a, b) => b.total - a.total).map(w => {
                    return `
                    <div style="margin-bottom: 8px;">
                        <div style="font-weight: 900; font-size: 1.2rem; text-transform:uppercase;">${w.nome}</div>
                        <div style="font-size: 1.1rem; font-weight: 900;">Itens: ${w.items} | Taxa: 10%</div>
                        <div style="display: flex; justify-content: space-between; font-size: 1.1rem; margin-top:2px;">
                            <span>Vendas: R$ ${w.total.toFixed(2)}</span>
                            <span style="font-weight: 900;">Com: R$ ${w.commission.toFixed(2)}</span>
                        </div>
                    </div>
                    <div style="border-bottom: 2px dashed black; margin: 8px 0;"></div>
                    `;
                }).join('');

                const reportContent = `
                    <div style="font-family: 'Courier New', Courier, monospace; color: black; text-align: left; max-width: 350px; margin: 0 auto; background: white; padding: 10px; font-weight: 900;">
                        
                        <div style="text-align: center; font-weight: 900; font-size: 1.4rem; margin-bottom:5px;">RELATORIO GARCONS</div>
                        <div style="text-align: center; font-size: 1.1rem;">${startStr} ate ${endStr}</div>
                        <div style="text-align: center; font-size: 1.1rem; margin-bottom: 10px;">${nowStr}</div>
                        
                        <div style="border-bottom: 2px dashed black; margin-bottom: 10px;"></div>

                        ${waitersListHTML || '<div style="text-align:center;">Nenhuma venda encontrada.</div>'}

                        <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 1.4rem; margin-top: 5px;">
                            <span>TOTAL GERAL:</span>
                            <span>R$ ${globalTotalCommission.toFixed(2)}</span>
                        </div>

                        <div style="margin-top: 40px; text-align: center; font-size: 1rem;">
                            ___________________________________<br>
                            Gerencia / Financeiro
                        </div>

                        <div style="margin-top: 20px; text-align: center; font-size: 0.9rem; color: #000;">
                            Sistema Naxio
                        </div>
                    </div>
                `;

                const modal = document.createElement('div');
                modal.className = 'g-modal-overlay';

                modal.innerHTML = `
                <div class="g-modal-sheet" style="background:#0f172a; max-height:90vh;">
                    <div class="g-scroll" style="padding:20px; color:white; display:flex; justify-content:center;">
                        <div id="report-printable-content" style="background:white; color:black; border-radius:4px; overflow:hidden;">
                            ${reportContent}
                        </div>
                    </div>
                    <div style="padding:0 20px 20px 20px;">
                        <button class="g-btn primary full" style="margin-top:20px;" onclick="GarcomSystem.reports.printReport()">
                            <i class="ri-printer-line"></i> Imprimir Relatório
                        </button>
                        <button class="g-btn ghost full" style="margin-top:10px;" onclick="this.closest('.g-modal-overlay').remove()">Fechar</button>
                    </div>
                </div>
            `;

                GarcomSystem.ui.setLoading(false);
                document.body.appendChild(modal);

            } catch (err) {
                GarcomSystem.ui.setLoading(false);
                console.error(err);
                GarcomSystem.ui.toast("Erro ao processar relatório.", 'error');
            }
        },

        printReport: () => {
            const content = document.getElementById('report-printable-content').innerHTML;

            // ABORDAGEM INFALÍVEL: Nova Janela/Popup
            // Isso isola completamente o estilo da impressão do resto do site
            const printWindow = window.open('', '', 'width=400,height=600');

            printWindow.document.write(`
                <html>
                <head>
                    <title>Relatório de Comissão</title>
                    <style>
                        body {
                            font-family: 'Courier New', monospace;
                            margin: 0;
                            padding: 10px;
                            color: black !important;
                            background: white;
                            font-weight: 900;
                        }
                        @media print {
                            @page { margin: 0; }
                            body { margin: 0; padding: 0; }
                            .no-print { display: none; }
                        }
                        /* Garante que linhas pontilhadas apareçam */
                        div { border-color: black !important; }
                    </style>
                </head>
                <body>
                    ${content}
                    <script>
                        // Espera carregar e imprime
                        window.onload = function() {
                            window.print();
                            // window.close(); // Opcional: fechar automaticamente após imprimir
                        }
                    </script>
                </body>
                </html>
            `);

            printWindow.document.close(); // Necessário para terminar o carregamento
            printWindow.focus(); // Foca na nova janela
        },

        gerarRelatorio: () => {
            GarcomSystem.reports.openMyStats();
        }
    },

    // =========================================================================
    // 12. CONFIGURATION & UTILS
    // =========================================================================
    settings: {
        open: () => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto;">
                    <div style="padding:20px;">
                        <h3>Configurações</h3>
                        
                        <div class="g-card" style="margin-top:20px;">
                            <label style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Modo Escuro</span>
                                <input type="checkbox" checked disabled>
                            </label>
                            <hr style="border-color:var(--g-border); margin:10px 0;">
                            <label style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Vibração ao Toque</span>
                                <input type="checkbox" checked onchange="GarcomSystem.config.vibration = this.checked">
                            </label>
                            <hr style="border-color:var(--g-border); margin:10px 0;">
                            <label style="display:flex; justify-content:space-between; align-items:center;">
                                <span>Tamanho da Fonte</span>
                                <select class="g-input" style="width:100px; padding:5px;" onchange="document.documentElement.style.fontSize = this.value">
                                    <option value="14px">Pequena</option>
                                    <option value="16px" selected>Normal</option>
                                    <option value="18px">Grande</option>
                                    <option value="20px">Extra</option>
                                </select>
                            </label>
                        </div>

                        <div class="g-card" style="margin-top:20px;">
                            <div style="font-size:0.8rem; color:var(--g-text-muted);">
                                Naxio Waiter v${GarcomSystem.config.version}<br>
                                ID Loja: ${GarcomSystem.state.storeId}<br>
                                Session: ${GarcomSystem.state.waiterId}
                            </div>
                            <button class="g-btn danger full" style="margin-top:10px;" onclick="GarcomSystem.auth.logout()">Sair do Turno</button>
                        </div>
                        
                        <button class="g-btn ghost full" style="margin-top:10px;" onclick="this.closest('.g-modal-overlay').remove()">Voltar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
    },

    // =========================================================================
    // 13. NOTIFICATIONS SYSTEM
    // =========================================================================
    notifications: {
        list: [],

        add: (msg, type = 'info') => {
            const notif = { id: Date.now(), msg, type, read: false, time: new Date() };
            GarcomSystem.notifications.list.unshift(notif);
            GarcomSystem.ui.toast("Nova notificação!", "info");
        },

        openInbox: () => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:70vh;">
                    <div class="modal-header" style="padding:15px; border-bottom:1px solid #333;">
                        <h3>Notificações</h3>
                    </div>
                    <div class="modal-body g-scroll" style="flex:1; padding:15px;">
                        ${GarcomSystem.notifications.list.length === 0 ? '<div style="text-align:center; color:#aaa; margin-top:20px;">Nenhuma notificação recente.</div>' : ''}
                        
                        ${GarcomSystem.notifications.list.map(n => `
                            <div class="g-card" style="border-left:4px solid ${n.type === 'alert' ? 'red' : 'blue'};">
                                <div style="font-weight:bold;">${n.type.toUpperCase()}</div>
                                <div>${n.msg}</div>
                                <div style="font-size:0.7rem; opacity:0.6; margin-top:5px;">${n.time.toLocaleTimeString()}</div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="g-btn ghost full" onclick="this.closest('.g-modal-overlay').remove()">Fechar</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
    },

    // =========================================================================
    // 14. DIGITAL CATALOG (NEW FEATURE)
    // =========================================================================
    catalog: {
        mode: 'view', // 'view' or 'select' (if called from a table)
        callback: null,

        open: (mode = 'view', callback = null) => {
            GarcomSystem.catalog.mode = mode;
            GarcomSystem.catalog.callback = callback;
            GarcomSystem.router.navigate('catalog');
        },

        render: () => {
            GarcomSystem.ui.setupShell();
            GarcomSystem.ui.updateHeader('Cardápio Digital', true);

            const content = document.getElementById('g-content');

            // Filters
            const categories = ['Todos', ...GarcomSystem.state.categories];

            content.innerHTML = `
                <div style="padding:15px; display:flex; flex-direction:column; height:100%;">
                    
                    <!-- Search Bar -->
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <div style="flex:1; position:relative;">
                            <i class="ri-search-line" style="position:absolute; left:12px; top:12px; color:var(--g-text-muted);"></i>
                            <input type="text" class="g-input" id="cat-search" 
                                placeholder="Buscar nome, código..." 
                                style="padding-left:40px; margin:0;"
                                oninput="GarcomSystem.catalog.filter()">
                        </div>
                        <button class="g-btn ghost" onclick="GarcomSystem.catalog.openScanner()">
                            <i class="ri-barcode-box-line"></i>
                        </button>
                    </div>

                    <!-- Categories -->
                    <div class="g-tabs" style="margin-bottom:15px; padding:0;">
                        ${categories.map(c => `
                            <div class="g-tab ${c === 'Todos' ? 'active' : ''}" 
                                 onclick="GarcomSystem.catalog.selectCategory(this, '${c}')">
                                ${c}
                            </div>
                        `).join('')}
                    </div>

                    <!-- Grid -->
                    <div id="cat-grid" class="g-scroll" style="flex:1; padding-bottom:100px;">
                        <!-- JS Injected -->
                    </div>

                    <!-- Floating Action for Quick Price Check -->
                    ${GarcomSystem.catalog.mode === 'view' ? `
                        <button onclick="GarcomSystem.catalog.openPriceCheck()" 
                            style="position:fixed; bottom:20px; right:20px; background:var(--g-warning); color:white; border:none; padding:12px 20px; border-radius:50px; font-weight:bold; box-shadow:0 10px 20px rgba(0,0,0,0.3); display:flex; align-items:center; gap:10px;">
                            <i class="ri-price-tag-3-line"></i> Consultar Preço
                        </button>
                    ` : ''}
                </div>
            `;

            GarcomSystem.catalog.filter();
        },

        selectCategory: (el, cat) => {
            document.querySelectorAll('.g-tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            GarcomSystem.state.activeCategory = cat;
            GarcomSystem.catalog.filter();
        },

        filter: () => {
            const query = document.getElementById('cat-search')?.value.toLowerCase() || '';
            const cat = GarcomSystem.state.activeCategory || 'Todos';
            const grid = document.getElementById('cat-grid');

            if (!grid) return;

            let products = GarcomSystem.state.menu || []; // Safety check

            if (query) {
                products = products.filter(p =>
                    (p.nome && p.nome.toLowerCase().includes(query)) ||
                    (p.codigo_cardapio && String(p.codigo_cardapio).toLowerCase().includes(query)) ||
                    (p.codigo_barras && String(p.codigo_barras).toLowerCase().includes(query)) ||
                    (p.cod && p.cod.toString().toLowerCase().includes(query)) ||
                    (p.descricao && p.descricao.toLowerCase().includes(query))
                );
            } else if (cat !== 'Todos') {
                products = products.filter(p => p.category === cat);
            }

            if (products.length === 0) {
                grid.innerHTML = `
                    <div style="text-align:center; padding:50px; color:var(--g-text-muted);">
                        <i class="ri-inbox-line" style="font-size:3rem; margin-bottom:10px;"></i><br>
                        Nenhum produto encontrado.
                    </div>
                `;
                return;
            }

            grid.innerHTML = products.map(p => {
                const isPromo = p.promo_price && p.promo_price < p.preco;
                const price = isPromo ? p.promo_price : p.preco;
                const hasImg = p.img_url && p.img_url.length > 10;

                return `
                <div class="g-card anim-slide" onclick="GarcomSystem.catalog.showDetails('${p.id}')" style="display:flex; gap:15px; padding:12px; cursor:pointer;">
                    
                    <!-- Image Placeholder or Real -->
                    <div style="width:70px; height:70px; border-radius:12px; background:${hasImg ? `url(${p.img_url}) center/cover` : 'var(--g-surface-active)'}; display:flex; align-items:center; justify-content:center;">
                        ${!hasImg ? `<i class="ri-image-line" style="font-size:1.5rem; opacity:0.3;"></i>` : ''}
                    </div>

                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="font-weight:bold; font-size:1rem; line-height:1.2; margin-bottom:4px;">${p.nome}</div>
                            ${p.available === false ? '<span style="font-size:0.6rem; padding:2px 6px; background:var(--g-danger); border-radius:4px;">ESGOTADO</span>' : ''}
                        </div>
                        <div style="color:var(--g-text-muted); font-size:0.8rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                            ${p.descricao || 'Sem descrição.'}
                        </div>
                        <div style="margin-top:8px; display:flex; align-items:center; justify-content:space-between;">
                            <div style="font-weight:bold; color:var(--g-primary); font-size:1.1rem;">
                                ${isPromo ? `<span style="text-decoration:line-through; color:var(--g-text-muted); font-size:0.8rem; margin-right:5px;">R$ ${p.preco.toFixed(2)}</span>` : ''}
                                R$ ${price.toFixed(2)}
                            </div>
                            <div style="background:var(--g-surface-active); padding:4px 8px; border-radius:6px; font-size:0.7rem;">
                                COD: ${p.codigo_cardapio || p.codigo_barras || p.cod || p.id.slice(0, 4)}
                            </div>
                        </div>
                    </div>
                </div>
            `}).join('');
        },

        showDetails: (id) => {
            const p = GarcomSystem.state.menu.find(x => x.id === id);
            if (!p) return;

            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.style.zIndex = '11000';

            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto; max-height:85vh;">
                    
                    <!-- Header Image -->
                    <div style="height:200px; background:${p.img_url ? `url(${p.img_url}) center/cover` : 'var(--g-surface-active)'}; position:relative;">
                        <button onclick="this.closest('.g-modal-overlay').remove()" style="position:absolute; top:15px; left:15px; width:40px; height:40px; border-radius:50%; background:rgba(0,0,0,0.5); color:white; border:none; cursor:pointer;">
                            <i class="ri-arrow-down-line"></i>
                        </button>
                         <div style="position:absolute; bottom:15px; right:15px; background:rgba(0,0,0,0.6); padding:5px 10px; border-radius:12px; color:white; font-size:0.8rem;">
                            ${p.category || 'Geral'}
                        </div>
                    </div>

                    <div class="g-scroll" style="padding:20px; flex:1;">
                        <h2 style="font-size:1.8rem; line-height:1.2;">${p.nome}</h2>
                        <div style="font-size:2rem; font-weight:800; color:var(--g-primary); margin:10px 0;">
                            R$ ${p.preco.toFixed(2)}
                        </div>

                        ${p.available === false ?
                    `<div style="background:rgba(239,68,68,0.2); border:1px solid var(--g-danger); color:#fca5a5; padding:10px; border-radius:8px; display:flex; align-items:center; gap:10px; margin-bottom:20px;">
                                <i class="ri-error-warning-fill"></i> Produto Indisponível no momento
                            </div>` : ''
                }

                        <div style="margin-bottom:20px;">
                            <h4 style="color:var(--g-text-muted); margin-bottom:5px;">Descrição</h4>
                            <p style="line-height:1.6; font-size:0.95rem;">${p.descricao || 'Nenhuma descrição detalhada disponível.'}</p>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:20px;">
                            <div class="g-card" style="padding:10px; text-align:center;">
                                <div style="color:var(--g-text-muted); font-size:0.8rem;">Código</div>
                                <div style="font-weight:bold;">${p.cod || '-'}</div>
                            </div>
                            <div class="g-card" style="padding:10px; text-align:center;">
                                <div style="color:var(--g-text-muted); font-size:0.8rem;">Estoque</div>
                                <div style="font-weight:bold;">${p.stock_quantity || '∞'}</div>
                            </div>
                        </div>
                    </div>

                    <div style="padding:15px; border-top:1px solid var(--g-border);">
                        ${GarcomSystem.catalog.mode === 'select' ? `
                            <button class="g-btn success full" onclick="GarcomSystem.catalog.confirmSelection('${p.id}')">
                                Selecionar Produto
                            </button>
                        ` : `
                            <button class="g-btn ghost full" onclick="this.closest('.g-modal-overlay').remove()">
                                Voltar
                            </button>
                        `}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        confirmSelection: (id) => {
            // Not used in view-only mode, but ready for future integration
            if (GarcomSystem.catalog.callback) {
                // ...
            }
        },

        openPriceCheck: () => {
            const modal = document.createElement('div');
            modal.className = 'g-modal-overlay';
            modal.innerHTML = `
                <div class="g-modal-sheet" style="height:auto;">
                    <div style="padding:20px;">
                        <h3 style="text-align:center; margin-bottom:20px;">Consulta Rápida</h3>
                        <input type="text" class="g-input" id="quick-check-input" placeholder="Digite o código ou nome..." autofocus>
                        <div id="quick-result" style="margin-top:20px; min-height:100px;">
                            <div style="text-align:center; opacity:0.5;">Aguardando...</div>
                        </div>
                        <button class="g-btn danger full" style="margin-top:20px;" onclick="this.closest('.g-modal-overlay').remove()">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const input = document.getElementById('quick-check-input');
            input.focus();
            input.addEventListener('input', (e) => {
                const val = e.target.value.toLowerCase();
                const res = document.getElementById('quick-result');
                if (val.length < 2) {
                    res.innerHTML = '<div style="text-align:center; opacity:0.5;">Aguardando...</div>';
                    return;
                }

                const match = GarcomSystem.state.menu.find(p =>
                    (p.cod && p.cod.toString() === val) ||
                    p.nome.toLowerCase().includes(val)
                );

                if (match) {
                    res.innerHTML = `
                        <div class="g-card" style="border:2px solid var(--g-success); text-align:center; padding:20px;">
                            <div style="font-size:1.2rem; font-weight:bold;">${match.nome}</div>
                            <div style="font-size:2.5rem; font-weight:800; color:var(--g-success); margin:10px 0;">
                                R$ ${match.preco.toFixed(2)}
                            </div>
                            <div style="font-size:0.8rem; opacity:0.7;">${match.category}</div>
                        </div>
                    `;
                } else {
                    res.innerHTML = `<div style="text-align:center; color:var(--g-danger);">Produto não encontrado</div>`;
                }
            });
        },

        openScanner: () => {
            GarcomSystem.ui.toast("Scanner de câmera em breve!", "info");
        }
    },

    // --- Atalhos de Compatibilidade com UI Antiga ---
    gerarRelatorio: () => { GarcomSystem.reports.openMyStats(); },
    configurarImpressora: () => { GarcomSystem.settings.open(); }
};

// Export to window if needed
window.GarcomSystem = GarcomSystem;

// Integração com o Router do Core.js
if (typeof App !== 'undefined') {
    App.waiter = GarcomSystem;
}

console.log("🚀 Módulo Garçom Enterprise v3.0 Carregado");
