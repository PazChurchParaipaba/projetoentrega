/**
 * 🛡️ NAXIO STABILITY SYSTEM (Anti-Down & Automatic Sync)
 * Integração Global para estabilidade extrema em dados móveis e wifi.
 */

window.NaxioStability = {
    version: '1.0.5', // Controle de versão para evitar problemas de cache
    state: {
        online: navigator.onLine,
        hubOnline: false,
        hubIp: localStorage.getItem('NAXIO_HUB_IP') || 'localhost',
        queue: JSON.parse(localStorage.getItem('NAXIO_OFFLINE_QUEUE') || '[]'),
        isSyncing: false
    },

    init: async () => {
        console.log("🛡️ Estabilidade v1.1.5 (Dynamic Hub Discovery)");
        
        // Sincroniza IP do Hub se estiver online
        if (navigator.onLine) NaxioStability.syncHubIp();
        
        // Desativado Hub Local por instabilidade relatada (v1.1.6)
        NaxioStability.state.hubOnline = false;
        // NaxioStability.detectHub(); 
        // setInterval(NaxioStability.detectHub, 30000);
        // Controle de Versão: Se a versão mudou, limpa caches antigos
        const savedVer = localStorage.getItem('NAXIO_VERSION');
        if (savedVer && savedVer !== NaxioStability.version) {
            console.warn("🔄 Nova versão detectada. Limpando caches...");
            if ('serviceWorker' in navigator) {
                caches.keys().then(names => {
                    for (let name of names) caches.delete(name);
                });
            }
            localStorage.setItem('NAXIO_VERSION', NaxioStability.version);
            // location.reload(true); // Opcional: Recarrega se quiser forçar
        } else {
            localStorage.setItem('NAXIO_VERSION', NaxioStability.version);
        }

        // Monitoramento nativo
        window.addEventListener('online', () => NaxioStability.handleConnectivityChange(true));
        window.addEventListener('offline', () => NaxioStability.handleConnectivityChange(false));

        // Heartbeat de rede (checa a cada 30s para reduzir overhead em filas grandes)
        setInterval(NaxioStability.checkConnection, 30000);

        // Tenta sincronizar ao iniciar
        if (NaxioStability.state.online) NaxioStability.processQueue();
        
        // Aplica restrições de privilégios (Caixa vs Admin)
        setTimeout(NaxioStability.restrictAccess, 1000);
        
        console.log(`🛡️ Sistema de Estabilidade Naxio v${NaxioStability.version} Ativado`);
    },

    handleConnectivityChange: (isOnline) => {
        NaxioStability.state.online = isOnline;
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('192.168.');

        if (isOnline) {
            NaxioStability.showToast("🌐 Conexão Restaurada! Sincronizando...", "success");
            NaxioStability.processQueue();
            
            // Se estiver no Hub Local, volta para a Nuvem
            if (isLocal) {
                const cloudUrl = localStorage.getItem('NAXIO_CLOUD_URL');
                if (cloudUrl && cloudUrl !== location.href) {
                    NaxioStability.showToast("🚀 Voltando para a Nuvem...", "info");
                    setTimeout(() => location.href = cloudUrl, 2000);
                }
            }
        } else {
            // Redirecionamento para Hub Local desativado por instabilidade
            /*
            if (!isLocal) {
                localStorage.setItem('NAXIO_CLOUD_URL', location.href);
                if (NaxioStability.state.hubOnline) {
                    NaxioStability.showToast("⚠️ Internet Caiu! Abrindo HUB LOCAL...", "warning");
                    setTimeout(() => {
                        location.href = `http://${NaxioStability.state.hubIp}:8080`;
                    }, 3000);
                }
            }
            */
            NaxioStability.showToast("📴 Você está OFFLINE. Pedidos serão salvos localmente.", "warning");
        }

        // Notifica módulos específicos
        if (window.GarcomSystem) window.GarcomSystem.state.online = isOnline;
        if (window.App && window.App.state) window.App.state.online = isOnline;
    },

    checkConnection: async () => {
        try {
            // Usa o próprio Supabase como heartbeat (mais confiável que Google em redes corporativas)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            // Ping no endpoint de health do supabase (leve, não consome dados)
            await fetch(CONFIG.sbUrl + '/rest/v1/', { 
                method: 'GET',
                headers: { 'apikey': CONFIG.sbKey },
                signal: controller.signal 
            });
            clearTimeout(timeoutId);
            
            if (!NaxioStability.state.online) NaxioStability.handleConnectivityChange(true);
        } catch (e) {
            if (NaxioStability.state.online) NaxioStability.handleConnectivityChange(false);
        }
    },

    /**
     * Envelopa chamadas do Supabase para serem tolerantes a falhas
     */
    async safeExecute(operation, description = "Ação do sistema") {
        if (!NaxioStability.state.online) {
            this.addToQueue(operation, description);
            return { error: null, queued: true }; // Retorno otimista
        }

        try {
            const res = await operation();
            if (res.error) throw res.error;
            return res;
        } catch (err) {
            console.error("Falha na operação, movendo para fila:", err);
            this.addToQueue(operation, description);
            return { error: null, queued: true };
        }
    },

    addToQueue: (operation, description) => {
        // Nota: Só podemos salvar no localStorage funções serializáveis.
        // Para operações Supabase, salvamos o formato { table, action, data, id }
        const job = {
            id: Date.now() + Math.random(),
            description,
            timestamp: new Date().toISOString(),
            // Se for passado um objeto com los detalhes da op, salvamos ele
            details: operation.jobDetails || null 
        };

        if (job.details) {
            NaxioStability.state.queue.push(job);
            localStorage.setItem('NAXIO_OFFLINE_QUEUE', JSON.stringify(NaxioStability.state.queue));
            NaxioStability.showToast(`📝 ${description} salvo para envio posterior.`, "info");
        }
    },

    processQueue: async () => {
        if (NaxioStability.state.isSyncing || NaxioStability.state.queue.length === 0) return;
        NaxioStability.state.isSyncing = true;

        console.log(`🔄 Sincronizando ${NaxioStability.state.queue.length} operações pendentes...`);
        
        const remainingQueue = [];
        const queue = [...NaxioStability.state.queue];
        
        for (const job of queue) {
            try {
                if (!job.details) continue;

                const { table, action, id, data } = job.details;
                let res;

                if (action === 'update') {
                    res = await _sb.from(table).update(data).eq('id', id);
                } else if (action === 'insert') {
                    res = await _sb.from(table).insert(data);
                } else if (action === 'delete') {
                    res = await _sb.from(table).delete().eq('id', id);
                }

                if (res?.error) throw res.error;

                console.log(`✅ Sincronizado: ${job.description}`);
            } catch (e) {
                console.error(`❌ Erro ao sincronizar ${job.description}:`, e);
                remainingQueue.push(job); // Mantém na fila se falhar de novo
            }
        }

        NaxioStability.state.queue = remainingQueue;
        localStorage.setItem('NAXIO_OFFLINE_QUEUE', JSON.stringify(remainingQueue));
        NaxioStability.state.isSyncing = false;

        if (remainingQueue.length === 0) {
            NaxioStability.showToast("Todos os dados foram sincronizados com sucesso!", "success");
            // Atualiza as telas
            if (window.App?.store?.loadComandas) window.App.store.loadComandas();
            if (window.GarcomSystem?.data?.syncTables) window.GarcomSystem.data.syncTables();
        }
    },

    /**
     * Restringe a interface baseada no cargo (Role)
     * Garante que o Caixa veja apenas o essencial.
     */
    restrictAccess: () => {
        const session = localStorage.getItem('logimoveis_session');
        const user = window.App?.state?.profile || (session ? JSON.parse(session) : null);
        
        if (!user || !user.role) return;
        const role = user.role.toLowerCase();

        if (role === 'caixa') {
            console.log("🔒 Aplicando restrições de Caixa...");
            
            // Lista de IDs de botões/áreas que o caixa NÃO deve ver
            const prohibited = [
                'btn-import-csv', 
                'btn-fiscal-config', 
                'btn-gestao-lojista', 
                'btn-gestao-avancada', 
                'btn-notas-pendentes',
                'btn-add-produto',
                'btn-lancar-lote'
            ];

            // Tenta esconder via ID se existirem
            prohibited.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // Esconde botões específicos do dashboard pelo texto/ícone se não tiverem ID
            const buttons = document.querySelectorAll('.action-btn');
            buttons.forEach(btn => {
                const text = (btn.innerText || "").toLowerCase();
                if (text.includes('gestão') || text.includes('configurações') || text.includes('csv') || text.includes('fiscal')) {
                    if (!text.includes('caixa')) { // Não esconde o próprio botão de caixa
                         btn.style.display = 'none';
                    }
                }
            });

            // Garante que Comandas, Caixa e Relatórios fiquem visíveis
            const allowed = ['Comandas', 'Caixa', 'Relatórios', 'Consultar Produto'];
            buttons.forEach(btn => {
                const text = btn.innerText;
                if (allowed.some(a => text.includes(a))) {
                    btn.style.display = 'flex';
                }
            });
        }
    },

    syncHubIp: async () => {
        try {
            const session = localStorage.getItem('logimoveis_session');
            const user = window.App?.state?.profile || (session ? JSON.parse(session) : null);
            const storeId = window.App?.state?.storeId || user?.store_id;
            
            if (!storeId) return;

            // Busca o IP que o PC reportou para a nuvem
            const { data, error } = await _sb.from('stores').select('server_url').eq('id', storeId).single();
            if (data && data.server_url) {
                const cleanIp = data.server_url.replace('http://', '').split(':')[0];
                if (cleanIp && cleanIp !== NaxioStability.state.hubIp) {
                    console.log("📡 Novo IP de Hub descoberto:", cleanIp);
                    NaxioStability.state.hubIp = cleanIp;
                    localStorage.setItem('NAXIO_HUB_IP', cleanIp);
                }
            }
        } catch (e) {
            console.warn("⚠️ Não foi possível sincronizar IP do Hub dinamicamente.");
        }
    },

    detectHub: async () => {
        const ip = NaxioStability.state.hubIp;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            // Tenta o endpoint de produtos como heartbeat
            const res = await fetch(`http://${ip}:8080/api/local/comandas`, { signal: controller.signal });
            if (res.ok) {
                if (!NaxioStability.state.hubOnline) console.log("✅ HUB LOCAL ENCONTRADO em", ip);
                NaxioStability.state.hubOnline = true;
            } else {
                NaxioStability.state.hubOnline = false;
            }
        } catch (e) {
            NaxioStability.state.hubOnline = false;
        }
    },

    /**
     * Busca dados do HUB Local.
     */
    fetchLocal: async (endpoint) => {
        if (!NaxioStability.state.hubOnline) return null;
        try {
            const res = await fetch(`http://${NaxioStability.state.hubIp}:8080/api/local/${endpoint}`);
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`Erro ao buscar ${endpoint} no Hub:`, e);
        }
        return null;
    },

    /**
     * Tenta enviar um pedido para o HUB Local.
     * Se falhar, tenta Supabase. Se falhar, vai para a fila.
     */
    submitOrder: async (orderData) => {
        console.log("📤 Processando envio de pedido...", orderData);

        // 1. TENTA HUB LOCAL (PRIORIDADE)
        if (NaxioStability.state.hubOnline) {
            try {
                const res = await fetch(`http://${NaxioStability.state.hubIp}:8080/api/local/orders/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });
                if (res.ok) {
                    NaxioStability.showToast("🚀 Pedido enviado via HUB LOCAL (Imprimindo...)", "success");
                    return { success: true, local: true };
                }
            } catch (e) {
                console.warn("⚠️ Hub falhou no envio, tentando Supabase...");
            }
        }

        // 2. TENTA SUPABASE (NUVEM)
        if (navigator.onLine) {
            try {
                /* 
                   ⚠️ AVISO: Update direto de 'items' pode causar perda de dados em concorrência.
                   O GarcomSystem já possui lógica própria com RPC append_comanda_items.
                   Este bloco é um fallback que deve ser usado com cautela.
                */
                const { error } = await _sb.from('comandas').update({
                    // items: orderData.items, // REMOVIDO PARA EVITAR SOBREPOSIÇÃO
                    updated_at: new Date().toISOString(),
                    status: 'ocupada'
                }).eq('id', orderData.comanda_id);

                if (!error) {
                    NaxioStability.showToast("☁️ Pedido enviado via NUVEM.", "success");
                    return { success: true, cloud: true };
                }
            } catch (e) {
                console.warn("⚠️ Nuvem falhou, salvando offline...");
            }
        }

        // 3. FALLBACK: FILA OFFLINE
        NaxioStability.addToQueue({ 
            jobDetails: { 
                table: 'comandas', 
                action: 'update', 
                id: orderData.comanda_id, 
                data: { items: orderData.items, status: 'ocupada' } 
            } 
        }, `Pedido Mesa ${orderData.numero}`);
        
        return { success: false, queued: true };
    },

    showToast: (msg, type = "info") => {
        if (window.NaxioUI?.toast) {
            window.NaxioUI.toast(msg, type);
        } else if (window.GarcomSystem?.ui?.toast) {
            window.GarcomSystem.ui.toast(msg, type);
        } else {
            console.log(`[STATUS]: ${msg}`);
        }
    }
};

NaxioStability.init();
