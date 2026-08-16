// Arquivo: js/comandas.js
// Gestão de Salão, Mesas, Comandas e Impressão Térmica
// V7.1 - Enterprise: Obs, Qtd, Agrupamento, 10%, Transferência, Realtime + Fiscal Completo

App.store = App.store || {};

Object.assign(App.store, {

    // --- ESTADO LOCAL ---
    comandaFilters: { active: 'todas', date: new Date().toISOString().slice(0, 10) },
    fastCheckoutComanda: null,
    realtimeSubscription: null,
    currentComandaItems: [], // Cache local para realtime

    // 🔥 CACHE E UTILS
    garantirCacheProdutos: async () => {
        if (!window.produtosCache || window.produtosCache.length === 0) {
            console.log("🔄 Carregando produtos para Store...", App.state.storeId);

            // Query simplificada (buscando também a impressora alvo do item)
            let query = _sb.from('products').select('id, nome, preco, ncm, impressora_alvo');

            if (Array.isArray(App.state.storeId)) {
                query = query.in('store_id', App.state.storeId);
            } else {
                query = query.eq('store_id', App.state.storeId);
            }

            const { data, error } = await query;
            if (error) console.error("❌ Erro ao cachear produtos:", error);
            window.produtosCache = data || [];
        }
        return window.produtosCache;
    },

    validarNCM: (ncm) => {
        const limpo = String(ncm || "21069090").replace(/\D/g, '');
        return limpo.length === 8 ? limpo : "21069090";
    },

    // 🔥 FUNÇÃO PARA ENRIQUECER ITENS COM NCM
    enriquecerItensComNCM: async (items) => {
        await App.store.garantirCacheProdutos();

        return items.map(item => {
            let ncm = item.ncm;
            let alvo = item.impressora_alvo;

            // Tenta buscar NCM e Alvo do cache se não existir
            if ((!ncm || !alvo) && window.produtosCache) {
                const cached = window.produtosCache.find(p => String(p.id) === String(item.id || item.product_id));
                if (cached) {
                    if (!ncm) ncm = cached.ncm;
                    if (!alvo) alvo = cached.impressora_alvo;
                    console.log("✅ Dados enriquecidos do cache para " + item.nome);
                }
            }

            // Valida e sanitiza o NCM
            ncm = App.store.validarNCM(ncm);

            // Retorna item enriquecido com todas as propriedades necessárias
            return {
                id: item.id || item.product_id,
                product_id: item.id || item.product_id,
                nome: item.nome,
                price: item.price || item.preco,
                preco: item.price || item.preco,
                qtd: item.qtd || item.quantidade || 1,
                quantidade: item.qtd || item.quantidade || 1,
                ncm: ncm,
                impressora_alvo: alvo || 'PADRAO',
                observacao: item.observacao || '',
                garcom: item.garcom || 'Sistema'
            };
        });
    },

    // --- REALTIME (ATUALIZAÇÃO IMEDIATA) ---
    _realtimeRendering: false, // 🔥 Debounce flag para evitar loop de re-renders
    startRealtimeListener: () => {
        // 🔥 Remove subscription antiga antes de criar nova (evita duplicatas ao reabrir a view)
        if (App.store.realtimeSubscription) {
            try { _sb.removeChannel(App.store.realtimeSubscription); } catch (e) { }
            App.store.realtimeSubscription = null;
        }
        const storeId = App.state.storeId;

        App.store.realtimeSubscription = _sb.channel('comanda-changes-' + storeId)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas', filter: 'store_id=eq.' + storeId }, (payload) => {
                // BUG FIX: Evita processar DELETE sem payload.new
                if (!payload.new || !payload.new.id) {
                    App.store._loadThrottleBypass = true;
                    App.store.loadComandas();
                    return;
                }

                // Se estiver com a comanda aberta na tela, atualiza os itens em tempo real
                if (App.state.currentComanda === payload.new.id) {
                    App.state.currentComandaItems = payload.new.items || [];

                    if (payload.new.status === 'fechada' || payload.new.status === 'livre') {
                        const m = document.getElementById('comanda-modal-tabs');
                        if (m) m.remove();
                        App.state.currentComanda = null;
                        App.state.currentComandaItems = [];
                    } else if (!App.store._realtimeRendering) {
                        // 🔥 BUG FIX: Usa flag de debounce para evitar loop de re-renders
                        // Em vez de chamar manageComanda (que faz query ao banco),
                        // usa renderActiveTab diretamente com os dados já frescos do payload
                        App.store._realtimeRendering = true;
                        App.store.renderActiveTab(payload.new.numero, payload.new.items || []);
                        setTimeout(() => { App.store._realtimeRendering = false; }, 500);
                    }
                }

                // Atualização Granular no Grid Principal (Sem re-renderizar tudo)
                if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                    App.store.updateSingleComandaDOM(payload.new);
                } else {
                    // Para DELETE ou mudanças estruturais, recarrega a lista
                    App.store._loadThrottleBypass = true;
                    App.store.loadComandas();
                }

                if (App.store.fastCheckoutComanda?.id === payload.new.id) {
                    App.store.checkMesaRapida();
                }
            })
            .subscribe();
    },

    // --- NOVA ESTRUTURA DE UI (DARK MODE ENTERPRISE) ---
    state: {
        activeTab: 'pedidos', // pedidos, pagamentos, dividas, info
        selectedSeat: null,   // Para gestão de lugares
        draggedItem: null,
        _taxaPorComanda: {},  // 🔥 Controle individual do 10% por mesa
        get comTaxa() {
            const num = String(App.state?.currentMesaNum || document.getElementById('checkout-mesa-num')?.value || '1');
            if (this._taxaPorComanda[num] !== undefined) return this._taxaPorComanda[num];
            // Mesas balcão (sem 10%): 300 (interna) + 304, 305, 307, 308 (balcão)
            const MESAS_BALCAO = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
            return MESAS_BALCAO.includes(num) ? false : true;
        },
        set comTaxa(val) {
            const num = App.state?.currentMesaNum || document.getElementById('checkout-mesa-num')?.value || '1';
            this._taxaPorComanda[num] = val;
        },
        currentGuia: null     // 🎯 Guia vinculado à comanda atual
    },

    // Calcula tempo decorrido desde 'updated_at' ou 'created_at' se status ocupada
    getTempoDecorrido: (dataString) => {
        if (!dataString) return '0min';
        const diff = new Date() - new Date(dataString);
        const min = Math.floor(diff / 60000);
        const hours = Math.floor(min / 60);
        const textMin = min % 60;
        if (hours > 0) return hours + "h " + textMin + "m";
        return min + "min";
    },

    // Retorna cor baseada no tempo de espera (ex: > 1h fica amarelo)
    getTempoColor: (dataString) => {
        if (!dataString) return '#94a3b8';
        const min = Math.floor((new Date() - new Date(dataString)) / 60000);
        if (min > 120) return '#ef4444'; // Vermelho > 2h
        if (min > 60) return '#f59e0b'; // Amarelo > 1h
        return '#94a3b8'; // Cinza normal
    },

    // --- UI GESTÃO (DASHBOARD COMPLETO) ---
    openGestaoSalao: async () => {
        const oldView = document.getElementById('view-gestao-salao');
        if (oldView) oldView.remove();

        await App.store.garantirCacheProdutos();
        const { data: guias } = await _sb.from('guides').select('id, name').eq('store_id', App.state.storeId).eq('status', 'ativo').order('name');
        const guiasOptions = guias ? guias.map(g => '<option value="' + g.id + '">' + g.name + '</option>').join('') : '';

        const view = document.createElement('section');
        view.id = 'view-gestao-salao';
        view.className = 'view-section gestao-full-width';

        view.innerHTML = `
            <style>
                .gestao-full-width { width: 100%; max-width: 100%; padding: 25px 20px 0 20px; margin: 0; }
                .gestao-layout { display: grid; grid-template-columns: 240px 1fr; gap: 15px; align-items: start; height: calc(100vh - 100px); overflow: hidden; }
                @media(max-width: 900px) { 
                    .gestao-layout { grid-template-columns: 1fr; height: auto; overflow-y: auto; } 
                    .sidebar-actions { height: auto !important; margin-bottom: 20px; }
                }
                
                .panel-box { background: #1e293b; padding: 15px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                .mesa-fechada { background: #f1f5f9 !important; border-color: #94a3b8 !important; opacity: 0.8; }
                
                .type-card { padding: 12px 8px; border: 1px solid #334155; border-radius: 12px; text-align: center; cursor: pointer; transition: all 0.2s; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 75px; font-size: 0.9rem; }
                .type-card:hover { border-color: #3b82f6; }
                .type-card.active { background: #1e3a8a; border-color: #3b82f6; color: #60a5fa; font-weight: bold; }
                
                .stat-card { background: #0f172a; padding: 15px; border-radius: 10px; border: 1px solid #334155; text-align: center; }
                .stat-val { font-size: 1.2rem; font-weight: bold; color: #f8fafc; }
                .stat-label { font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }

                .btn-icon-action { width: 100%; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
                .btn-icon-action:hover { transform: translateY(-2px); }
            </style>

            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items:center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #334155; gap: 20px;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <div class="stat-card" style="padding: 8px 15px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); text-align:center; min-width: 85px;">
                        <div class="stat-val" style="color:#22c55e; font-size: 1.1rem; line-height: 1.2;" id="stat-mesas-livres">-</div>
                        <div class="stat-label" style="font-size: 0.65rem; color:#94a3b8; font-weight: bold; letter-spacing: 0.5px;">LIVRES</div>
                    </div>
                    <div class="stat-card" style="padding: 8px 15px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); text-align:center; min-width: 85px;">
                        <div class="stat-val" style="color:#ef4444; font-size: 1.1rem; line-height: 1.2;" id="stat-mesas-ocupadas">-</div>
                        <div class="stat-label" style="font-size: 0.65rem; color:#94a3b8; font-weight: bold; letter-spacing: 0.5px;">OCUPADAS</div>
                    </div>
                    <div class="stat-card" style="padding: 8px 15px; background: rgba(255, 255, 255, 0.03); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); text-align:center; min-width: 110px;">
                        <div class="stat-val" style="color:#3b82f6; font-size: 1.1rem; line-height: 1.2;" id="stat-faturamento">R$ 0,00</div>
                        <div class="stat-label" style="font-size: 0.65rem; color:#94a3b8; font-weight: bold; letter-spacing: 0.5px;">VENDAS HOJE</div>
                    </div>
                </div>
                <div style="background:#1e293b; padding:8px 15px; border-radius:12px; border:1px solid #334155; display:flex; gap:10px; align-items:center;">
                    <button class="btn btn-sm btn-secondary filtro-comanda active" onclick="App.store.filtrar('todas', this)">TODAS</button>
                    <button class="btn btn-sm btn-secondary filtro-comanda" onclick="App.store.filtrar('fechada', this)">HISTÓRICO</button>
                    <div style="width:1px; height:20px; background:#334155; margin:0 5px;"></div>
                    <button class="btn btn-sm btn-secondary" onclick="App.store.reabrirMesa()" title="Reabrir/Corrigir Mesa"><i class="ri-recycle-line"></i> REABRIR</button>
                    <button class="btn btn-sm btn-danger" onclick="App.store.limparMesasLivres()" title="Limpar Mesas Livres"><i class="ri-delete-bin-line"></i> LIMPAR</button>
                    <div style="width:1px; height:20px; background:#334155; margin:0 5px;"></div>
                    <button class="btn btn-sm btn-primary" onclick="App.store.loadComandas()"><i class="ri-refresh-line"></i> ATUALIZAR</button>
                    <button class="btn btn-sm btn-secondary" onclick="App.router.go('loja')"><i class="ri-arrow-left-line"></i> VOLTAR</button>
                </div>
            </div>

            <div class="gestao-layout">
                <!-- SIDEBAR CONTROLS -->
                <div class="sidebar-actions" style="overflow-y: auto; height: 100%; padding-right: 2px;">
                    

                    <!-- 2. CHECKOUT RÁPIDO (DESTAQUE) -->
                    <div class="panel-box" style="border: 1px solid #f59e0b; background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                            <i class="ri-flashlight-line" style="color:#f59e0b; font-size:1.2rem;"></i>
                            <h4 style="margin:0; color:#f59e0b;">Checkout Rápido</h4>
                        </div>
                        
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <input type="number" id="checkout-mesa-num" class="input-field" placeholder="Nº Mesa" 
                                   style="font-size:1.5rem; text-align:center; background:#0f172a; border-color:#334155; color:white; height:50px;" 
                                   onkeydown="if(event.key === 'Enter') App.store.checkMesaRapida()">
                            <button class="btn btn-warning" style="width:60px;" onclick="App.store.checkMesaRapida()">
                                <i class="ri-search-2-line" style="font-size:1.5rem;"></i>
                            </button>
                        </div>
                        
                        <div id="checkout-resumo" style="display:none; animation: fadeIn 0.3s;">
                            <div class="total-display" id="checkout-total" style="font-size:1.8rem; text-align:center; color:#4ade80; font-weight:bold; margin:10px 0; text-shadow: 0 0 10px rgba(74, 222, 128, 0.3);">R$ 0,00</div>
                            <div id="checkout-info-txt" class="text-xs text-center text-muted" style="margin-bottom:10px;"></div>
                            
                            <label style="display:flex; justify-content:center; gap:8px; margin:10px 0; font-weight:bold; color:#cbd5e1; cursor:pointer; background:#1e293b; padding:8px; border-radius:6px;">
                                <input type="checkbox" id="taxa-servico-check" checked onchange="App.store.recalcularCheckoutRapido()"> 
                                <span>Cobrar 10% (Serviço)</span>
                            </label>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <button class="btn btn-success" onclick="App.store.abrirFechamentoMesa()">
                                    <i class="ri-money-dollar-circle-line"></i> PAGAR
                                </button>
                                <button class="btn btn-secondary" onclick="App.store.abrirModalDetalhes()">
                                    <i class="ri-edit-line"></i> VER
                                </button>
                            </div>
                        </div>
                    </div>



                    <!-- 4. ABERTURA DE LOTE -->
                    <div class="panel-box">
                        <h4 style="margin-top:0; color:#f1f5f9;">🚀 Abrir Mesas / Comandas</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <input type="number" id="lote-inicio" class="input-field" placeholder="De" style="background:#0f172a; color:white;">
                            <input type="number" id="lote-fim" class="input-field" placeholder="Até" style="background:#0f172a; color:white;">
                        </div>
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <label onclick="App.store.selectType(this)" style="flex:1">
                                <input type="radio" name="quick-tipo" value="passante" checked hidden>
                                <div class="type-card active">Passante</div>
                            </label>
                            <label onclick="App.store.selectType(this)" style="flex:1">
                                <input type="radio" name="quick-tipo" value="interna" hidden>
                                <div class="type-card">🏠 Interna</div>
                            </label>
                        </div>
                        <select id="lote-guia" class="input-field" style="margin-bottom:15px; background:#0f172a; color:white;"><option value="">👤 Guia (Opcional)</option><option value="REMOVER">❌ Remover Guia</option>${guiasOptions}</select>
                        <button class="btn btn-primary btn-full" onclick="App.store.abrirLote()">
                            <i class="ri-add-line"></i> ABRIR MESAS
                        </button>
                    </div>

                </div>

                <!-- MAIN GRID -->
                <div class="main-grid-area" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                    
                    <!-- FILTROS -->

                    <!-- ÁREA DE ROLAGEM -->
                    <div style="flex:1; overflow-y:auto; padding-bottom:20px;">
                        <!-- GRID DE COMANDAS -->
                        <div id="comandas-advanced-grid" class="comanda-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap:10px;"></div>
                            
                            <!-- ÁREA DE HISTÓRICO (OCULTA POR PADRÃO) -->
                            <div id="comandas-fechadas-area" style="display:none; background:#1e293b; padding:20px; border-radius:12px; border:1px solid #334155;">
                                <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items:center;">
                                    <h3 style="margin:0;">Histórico de Vendas</h3>
                                    <div style="flex:1;"></div>
                                    <input type="date" id="filtro-data-fechadas" class="input-field" value="${App.store.comandaFilters.date}" style="width:160px;">
                                    <button class="btn btn-primary" onclick="App.store.filterHistory()">Buscar</button>
                                </div>
                                <div id="lista-fechadas-resultado"></div>
                            </div>
                    </div>
                </div>
            </div>`;

        document.querySelector('main').appendChild(view);
        App.router.go('gestao-salao');

        // Inicia
        App.store._loadThrottle = null; // Garante o carregamento inicial bypassing throttles pendentes
        await App.store.loadComandas();
        App.store.startRealtimeListener();

        // 🔥 INICIA CONEXÃO WEBSOCKET LOCAL (FILA GLOBAL DE PAGAMENTOS - SEFAZ CE 87/2025)
        App.store.iniciarWebSocketConciliacao();

        // Loop de atualização de métricas (a cada 30s)
        if (App.store.metricsInterval) clearInterval(App.store.metricsInterval);
        App.store.metricsInterval = setInterval(() => App.store.loadMetrics(), 30000);
        App.store.loadMetrics(); // Primeira carga
    },

    loadMetrics: async () => {
        // Conta mesas no DOM para agilidade ou faz query leve
        // Aqui faremos query para garantir precisão
        const { data: ocupadas } = await _sb.from('comandas').select('id', { count: 'exact' }).eq('store_id', App.state.storeId).eq('status', 'ocupada');
        const { data: livres } = await _sb.from('comandas').select('id', { count: 'exact' }).eq('store_id', App.state.storeId).eq('status', 'livre');

        // Faturamento do dia (via orders)
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: vendas } = await _sb.from('orders')
            .select('total_pago')
            .eq('store_id', App.state.storeId)
            .gte('created_at', hoje + 'T00:00:00')
            .lte('created_at', hoje + 'T23:59:59')
            .eq('status', 'concluido');

        const totalFatu = vendas ? vendas.reduce((acc, v) => acc + (v.total_pago || 0), 0) : 0;

        if (document.getElementById('stat-mesas-ocupadas')) {
            document.getElementById('stat-mesas-ocupadas').innerText = ocupadas?.length || 0;
            document.getElementById('stat-mesas-livres').innerText = livres?.length || 0;
            document.getElementById('stat-faturamento').innerText = "R$ " + totalFatu.toFixed(2);
        }
    },

    selectType: (label) => {
        label.closest('.panel-box').querySelectorAll('.type-card').forEach(c => c.classList.remove('active'));
        label.querySelector('.type-card').classList.add('active');
        label.querySelector('input').checked = true;
    },

    // 🔥 FUNÇÃO DE REABERTURA DE MESA (CORREÇÃO SOLICITADA)
    reabrirMesa: async () => {
        const num = await NaxioUI.prompt(
            '🔄 Reabrir Mesa',
            'Digite o número da mesa para reabrir/corrigir:',
            '',
            'Ex: 5',
            'number'
        );
        if (!num) return;

        const { data: comanda } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('numero', num).single();

        if (!comanda) {
            await NaxioUI.alert('❌ Erro', 'Mesa não encontrada.', 'error');
            return;
        }

        // 🟢 BUSCA ÚLTIMA VENDA PARA ESSA MESA PRA TENTAR RESTAURAR
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const { data: recentOrders } = await _sb.from('orders')
            .select('*')
            .eq('store_id', App.state.storeId)
            .in('origem_venda', ['comanda', 'consumo_interno'])
            .gte('created_at', hoje.toISOString())
            .order('created_at', { ascending: false })
            .limit(20);

        let lastOrder = null;
        let itensRestaurados = [];

        if (recentOrders) {
            for (let o of recentOrders) {
                try {
                    const obs = JSON.parse(o.observacao);
                    if (obs && (String(obs.mesa) === String(num)) && o.status !== 'cancelado') {
                        lastOrder = o;
                        itensRestaurados = obs.itens || [];
                        break;
                    }
                } catch (e) { }
            }
        }

        let msgConfirma = "Mesa " + num + " está com status: " + comanda.status + ". Deseja forçar para 'aberta'?";
        if (itensRestaurados.length > 0) {
            msgConfirma = `⚠️ Encontramos fechamento nesta mesa hoje com ${itensRestaurados.length} itens. \n\nDeseja restaurar os itens para a mesa e CANCELAR o pagamento/venda no caixa?`;
        }

        const confirma = await NaxioUI.confirm(
            '🔄 Reabrir Mesa',
            msgConfirma,
            'Sim, Reabrir',
            'Manter Fechada'
        );

        try {
            if (confirma) {
                if (itensRestaurados.length > 0 && lastOrder) {
                    // RESTAURA ITENS E MUDA PRA OCUPADA
                    const updateObj = { status: 'ocupada', items: itensRestaurados };
                    if (lastOrder.origem_venda === 'consumo_interno') {
                        updateObj.tipo_comanda = 'interna';
                    }
                    await _sb.from('comandas').update(updateObj).eq('id', comanda.id);
                    // CANCELA VENDA/PAGAMENTO DO SISTEMA
                    await _sb.from('orders').update({
                        status: 'cancelado',
                        observacao: (lastOrder.observacao || '') + ' [ESTORNADA E REABERTA NO PDV]'
                    }).eq('id', lastOrder.id);

                    // DEVOLVE ESTOQUE (Multiplica por -1 para simular o reverso do 'descontar_estoque')
                    const arrVolta = [];
                    itensRestaurados.forEach(it => { arrVolta.push({ id: it.id, qtd: (it.qtd || 1) * -1 }); });
                    _sb.rpc('descontar_estoque', { itens: arrVolta });

                    App.utils.toast(`Mesa ${num} reaberta! Última venda estornada.`, "success");

                    // 🔥 RECALCULA CAIXA SE ESTIVER ABERTO
                    if (window.Caixa && window.Caixa.calcTotals) {
                        await window.Caixa.calcTotals();
                    }

                    App.store.renderEditList(num, itensRestaurados);
                    App.store.checkMesaRapida();
                } else {
                    await _sb.from('comandas').update({ status: 'aberta' }).eq('id', comanda.id);
                    App.utils.toast("Mesa reaberta vazia com sucesso!", "success");
                }
                App.store.loadComandas();
            }
        } catch (err) {
            console.error("Erro ao reabrir:", err);
            App.utils.toast("Erro ao reabrir mesa.", "error");
        }
    },

    // 🔥 NOVA FUNÇÃO DE MENSAGENS PARA GARÇONS
    enviarMensagemParaGarcom: async () => {
        if (!App.state.storeId) return App.utils.toast("Loja não identificada.", "error");

        const msg = await NaxioUI.prompt(
            '💬 Enviar Aviso',
            'Digite a mensagem para todos os garçons:',
            '',
            'Ex: Reunião na cozinha agora!',
            'text'
        );

        if (!msg) return;

        const { error } = await _sb.from('messages').insert({
            store_id: App.state.storeId,
            msg: msg,
            type: 'alert', // 'info' ou 'alert'
            read: false,
            created_at: new Date().toISOString()
        });

        if (error) {
            console.error(error);
            App.utils.toast("Erro ao enviar: " + error.message, "error");
        } else {
            App.utils.toast("✅ Mensagem enviada para todos os garçons!", "success");
        }
    },

    enviarAvisoAniversario: async (num) => {
        const { error } = await _sb.from('messages').insert({
            store_id: App.state.storeId,
            msg: `🎂 CELEBRAÇÃO: A Mesa ${num} está de aniversário/comemoração! Vamos dar um show no atendimento!`,
            type: 'alert',
            read: false,
            created_at: new Date().toISOString()
        });

        if (!error) {
            App.utils.toast("✅ Time de garçons notificado!", "success");
        }
    },

    // --- LÓGICA DE MESAS ---
    checkMesaRapida: async () => {
        const num = document.getElementById('checkout-mesa-num').value;
        if (!num) return;
        const { data: comanda } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', num)
            .in('status', ['aberta', 'ocupada']) // Aceita aberta ou ocupada
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        const resumo = document.getElementById('checkout-resumo');

        if (!comanda) {
            NaxioUI.alert('Mesa indisponível', "Mesa não encontrada ou fechada.", 'warning');
            App.store.fastCheckoutComanda = null;
            resumo.style.display = 'none';
            return;
        }
        App.store.fastCheckoutComanda = comanda;

        // Regra do 10% inteligente baseada na mesa e preservando preferências
        const taxaCheckbox = document.getElementById('taxa-servico-check');
        if (taxaCheckbox) {
            // Inicializa pra tabela de controle global se for undefined
            if (App.store.state._taxaPorComanda === undefined) App.store.state._taxaPorComanda = {};
            if (App.store.state._taxaPorComanda[comanda.numero] === undefined) {
                const MESAS_BALCAO_SEM_TAXA = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
                const ehBalcao = MESAS_BALCAO_SEM_TAXA.includes(String(comanda.numero)) || comanda.tipo_comanda === 'interna';
                App.store.state._taxaPorComanda[comanda.numero] = !ehBalcao;
            }
            // Sincroniza check com global getter (usa implicitamente App.state.currentMesaNum, mas aqui estamos injetando valor via DOM)
            // A prioridade no getter é o currentMesaNum. Para a Mesa Rapida vamos forçar sincronização pela DOM
            taxaCheckbox.checked = App.store.state._taxaPorComanda[comanda.numero];

            // Corrige possível evento de onchange para guardar a decisão individual daquela comanda
            taxaCheckbox.onchange = function () {
                App.store.state._taxaPorComanda[comanda.numero] = this.checked;
                App.store.recalcularCheckoutRapido();
            };
        }

        resumo.style.display = 'block';
        App.store.recalcularCheckoutRapido();
        document.getElementById('checkout-info-txt').innerHTML = (comanda.items?.length || 0) + " itens | " + 
            (comanda.guide_name || 'S/ Guia') + 
            ` <span style="color:#60a5fa; cursor:pointer; font-weight:bold; margin-left:5px;" onclick="GuiasSystem.selecionarGuiaParaComanda('${comanda.id}', '${comanda.numero}')">✏️ Alterar</span>`;
    },

    recalcularCheckoutRapido: () => {
        const c = App.store.fastCheckoutComanda;
        if (!c) return;
        const sub = c.items ? c.items.reduce((a, i) => Math.round((a + (i.price * i.qtd)) * 100) / 100, 0) : 0;
        const subTaxavel = c.items ? c.items.reduce((a, i) => i.isento_10 ? a : Math.round((a + (i.price * i.qtd)) * 100) / 100, 0) : 0;
        const taxa = document.getElementById('taxa-servico-check').checked ? Math.round((subTaxavel * 0.10) * 100) / 100 : 0;
        const totalCalculado = Math.round((sub + taxa) * 100) / 100;

        c.calc_total = totalCalculado; c.calc_taxa = taxa;
        document.getElementById('checkout-total').innerText = "R$ " + totalCalculado.toFixed(2);
    },

    // --- MODAL DE DETALHES E LANÇAMENTO ---
    abrirModalDetalhes: () => {
        const c = App.store.fastCheckoutComanda;
        if (!c) return;
        // 🔥 BUG FIX: Passava 'aberta' hardcoded — agora usa o status real da comanda
        App.store.manageComanda(c.id, encodeURIComponent(JSON.stringify(c.items || [])), c.numero, c.status || 'ocupada');
    },

    // manageComanda definida mais abaixo (linha ~2035) com lógica completa de caixa e tabs

    // 🔥 NOVO MODAL DE LANÇAMENTO COM OBS E QTD
    abrirModalLancarItem: async () => {
        const modalId = 'modal-lancar-item-avancado';
        const old = document.getElementById(modalId); if (old) old.remove();

        const pNameDefault = App.state.profile?.nome_completo || App.state.user?.email?.split('@')[0] || 'Caixa';

        const html =
            '<div id="' + modalId + '" class="modal-overlay" style="display:flex; z-index:9999;">' +
            '<div class="modal-content" style="max-width:500px;">' +
            '<div class="modal-header"><h3>➕ Adicionar Item (Mesa ' + App.state.currentMesaNum + ')</h3><button onclick="document.getElementById(\'' + modalId + '\').remove()" class="btn btn-secondary btn-sm">X</button></div>' +
            '<div class="modal-body">' +
            '<div class="input-wrapper">' +
            '<label>Buscar Produto (Nome ou Código)</label>' +
            '<input type="text" id="lancar-busca" class="input-field" placeholder="Digite o nome ou código..." oninput="App.store.filtrarProdutosLancamento(this.value)" onkeydown="if(event.key===\'Enter\'){ event.preventDefault(); const res = document.getElementById(\'lancar-lista-produtos\').querySelector(\'div\'); if(res) res.click(); }">' +
            '<div id="lancar-lista-produtos" style="max-height:150px; overflow-y:auto; border:1px solid var(--border); margin-top:5px; display:none;"></div>' +
            '</div>' +

            '<div id="lancar-selecionado" style="background:var(--background); padding:10px; border-radius:8px; display:none; margin-bottom:15px; border:1px solid var(--primary);">' +
            '<strong id="lancar-sel-nome" style="color:var(--primary); font-size:1.1rem;"></strong>' +

            // LINHA 1
            '<div style="display:flex; gap:10px; margin-top:10px;">' +
            '<div style="flex:1;"><label class="text-xs">Quantidade</label><input type="number" step="0.1" id="lancar-qtd" class="input-field" value="1"></div>' +
            '<div style="flex:1;"><label class="text-xs">Preço Unitário (R$)</label><input type="number" step="0.01" id="lancar-sel-preco" class="input-field" value="0.00"></div>' +
            '</div>' +

            // LINHA 2
            '<div style="display:flex; gap:10px; margin-top:10px;">' +
            '<div style="flex:1;"><label class="text-xs">Garçom Atribuído</label><input type="text" id="lancar-garcom" class="input-field" value="' + pNameDefault + '"></div>' +
            '<div style="flex:2;"><label class="text-xs">Observação (Cozinha)</label><input type="text" id="lancar-obs" class="input-field" placeholder="Sem cebola..."></div>' +
            '</div>' +

            // LINHA 3
            '<div style="margin-top:12px; display:flex; align-items:center; gap:8px;">' +
            '<input type="checkbox" id="lancar-isento-10" style="width:18px; height:18px;">' +
            '<label for="lancar-isento-10" style="font-size:0.85rem; color:#f87171;">🚫 Este item específico é **ISENTO** de 10% (Taxa Serviço)</label>' +
            '</div>' +

            // LINHA 4 (RESERVA)
            '<div style="margin-top:8px; display:flex; align-items:center; gap:8px;">' +
            '<input type="checkbox" id="lancar-is-reserva" style="width:18px; height:18px;">' +
            '<label for="lancar-is-reserva" style="font-size:0.85rem; color:#f59e0b; font-weight:bold;">📅 Item para RESERVA (Almoço)</label>' +
            '</div>' +

            '<input type="hidden" id="lancar-sel-id"><input type="hidden" id="lancar-sel-ncm">' +
            '</div>' +

            '<div style="display:flex; gap:10px; margin-top:15px;">' +
            '<button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById(\'' + modalId + '\').remove()">FECHAR</button>' +
            '<button class="btn btn-success" style="flex:2;" onclick="App.store.confirmarLancamento()">➕ ADICIONAR ITEM</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById('lancar-busca').focus();
        await App.store.garantirCacheProdutos();
    },

    filtrarProdutosLancamento: (termo) => {
        const lista = document.getElementById('lancar-lista-produtos');
        if (!termo) { lista.style.display = 'none'; return; }
        const termoLower = termo.toLowerCase();
        const matches = window.produtosCache.filter(p =>
            (p.nome && p.nome.toLowerCase().includes(termoLower)) ||
            (p.codigo_cardapio && String(p.codigo_cardapio).toLowerCase().includes(termoLower)) ||
            (p.codigo_barras && String(p.codigo_barras).toLowerCase().includes(termoLower)) ||
            (p.id && String(p.id).toLowerCase().includes(termoLower))
        ).slice(0, 10);
        lista.innerHTML = matches.map(p => `
            <div onclick="App.store.selecionarProdutoLancamento('${p.id}', '${p.nome}', ${p.preco}, '${p.ncm}')" 
                 style="padding:8px; border-bottom:1px solid #333; cursor:pointer; hover:bg-gray-700">
                 ${p.codigo_cardapio ? `[${p.codigo_cardapio}] ` : ''}${p.nome} - R$ ${p.preco.toFixed(2)}
            </div>`).join('');
        lista.style.display = 'block';
    },

    selecionarProdutoLancamento: (id, nome, preco, ncm) => {
        document.getElementById('lancar-lista-produtos').style.display = 'none';
        document.getElementById('lancar-busca').value = '';

        const pOriginal = window.produtosCache?.find(p => String(p.id) === String(id));

        const area = document.getElementById('lancar-selecionado');
        area.style.display = 'block';
        document.getElementById('lancar-sel-nome').innerText = nome;
        document.getElementById('lancar-sel-id').value = id;
        document.getElementById('lancar-sel-preco').value = preco;
        document.getElementById('lancar-sel-ncm').value = ncm;
        document.getElementById('lancar-sel-id').dataset.alvo = pOriginal?.impressora_alvo || 'PADRAO';

        // Foca automaticamente no campo de quantidade e seleciona o valor para fácil edição
        const qtdEl = document.getElementById('lancar-qtd');
        qtdEl.focus();
        qtdEl.select();
    },

    confirmarLancamento: async () => {
        if (App.state._isLaunchingItem) return;
        App.state._isLaunchingItem = true;

        if (window.NaxioUI) NaxioUI.showLoading("🚀 Lançando item...");

        try {
            const id = document.getElementById('lancar-sel-id').value;
            if (!id) {
                await NaxioUI.alert('⚠️ Atenção', 'Selecione um produto.', 'warning');
                return;
            }

            const nome = document.getElementById('lancar-sel-nome').innerText;
            const precoDigitado = parseFloat(document.getElementById('lancar-sel-preco').value) || 0;
            const qtd = parseFloat(document.getElementById('lancar-qtd').value) || 1;
            const obs = document.getElementById('lancar-obs').value.trim();
            const garcomNome = document.getElementById('lancar-garcom') ? document.getElementById('lancar-garcom').value.trim() : (App.state.profile?.nome_completo || App.state.user?.email?.split('@')[0] || 'Caixa');
            const isento_10 = document.getElementById('lancar-isento-10') ? document.getElementById('lancar-isento-10').checked : false;
            const isReserva = document.getElementById('lancar-is-reserva') ? document.getElementById('lancar-is-reserva').checked : false;

            const ncm = document.getElementById('lancar-sel-ncm').value;

            // 🟢 BUSCA CATEGORIA DO CACHE PARA SALVAR JUNTO COM O ITEM NO BANCO
            const pOriginal = window.produtosCache?.find(p => String(p.id) === String(id));
            const catValue = pOriginal ? (pOriginal.categoria || pOriginal.category || '') : '';
            const precoOriginalDb = pOriginal ? pOriginal.preco : precoDigitado;

            // 🎁 VERIFICA PROMOÇÃO / HAPPY HOUR (Se usou o preco igual ao banco)
            const promo = App.store.promo.getActiveDiscount();
            let finalPrice = precoDigitado;
            let originalPrice = null;
            let promoName = null;

            // Se o garçom nao mexeu no preco e tem promocao
            if (promo.val > 0 && precoDigitado === precoOriginalDb) {
                originalPrice = precoOriginalDb;
                finalPrice = precoOriginalDb * (1 - promo.val);
                promoName = promo.name;
            }

            // Se for reserva, marca na observação
            let finalObs = obs;
            if (isReserva) {
                finalObs = `[RESERVA] ${finalObs}`.trim();
            }

            const novoItem = {
                id: id,
                nome: nome,
                price: finalPrice,
                qtd: qtd,
                ncm: App.store.validarNCM(ncm),
                observacao: finalObs,
                garcom: garcomNome,
                categoria: catValue,
                isento_10: isento_10,
                is_reserva: isReserva === true,  // 🔑 FLAG para o print_service (true somente se CONFIRMADO)
                data_lancamento: new Date().toISOString(),
                original_price: originalPrice,
                promo_name: promoName,
                impressora_alvo: pOriginal?.impressora_alvo || 'PADRAO',
                printed: false,     // Flag para garçom.js (compatibilidade print_service)
                printed_qtd: 0      // Flag para caixa/comandas.js
            };

            if (promoName) {
                App.utils.toast(`Promoção Ativa: ${promoName} (${(promo.val * 100).toFixed(0)}% OFF)`, "success");
            }

            let success = false;
            let retryCount = 0;

            // 🔥 ESTRATÉGIA DE RECUPERAÇÃO AUTOMÁTICA EM CASO DE CONFLITO (Reduzido para 1 tentativa conforme pedido)
            while (retryCount < 1 && !success) {
                // 1. Busca os dados mais frescos da comanda (ignorando cache local)
                const { data: latestC, error: fetchErr } = await _sb
                    .from('comandas')
                    .select('items, updated_at')
                    .eq('id', App.state.currentComanda)
                    .single();

                if (fetchErr || !latestC) {
                    console.error("Erro ao sincronizar comanda antes de lançar:", fetchErr);
                    await new Promise(r => setTimeout(r, 200));
                    retryCount++;
                    continue;
                }

                const currentItems = latestC.items || [];
            
                // 🛡️ PROTEÇÃO CONTRA DUPLICIDADE: 
                // Verifica se este exato item já foi salvo por uma tentativa anterior que deu timeout
                const jaExiste = currentItems.some(it => it.data_lancamento === novoItem.data_lancamento);
                if (jaExiste) {
                    console.warn("🛡️ Item já detectado na comanda (vinda de retry/timeout). Ignorando duplicata.");
                    success = true;
                    break;
                }

                const lastUpdatedAt = latestC.updated_at;
                const finalItems = [...currentItems, novoItem];

                // 2. Decide se deve imprimir baseada no perfil
                const logado = (garcomNome || '').toLowerCase();
                const deveImprimir = !(logado.includes('lojista') || logado.includes('admin') || logado.includes('caixa'));

                let updateQuery = _sb.from('comandas').update({
                    items: finalItems,
                    status: 'ocupada',
                    imprimir_cozinha: deveImprimir,
                    updated_at: new Date().toISOString()
                }).eq('id', App.state.currentComanda);

                // Controle de Concorrência Otimista (OCC)
                if (lastUpdatedAt) {
                    updateQuery = updateQuery.eq('updated_at', lastUpdatedAt).select('id');
                } else {
                    updateQuery = updateQuery.is('updated_at', null).select('id');
                }

                const { data: updatedRows, error: updateError } = await updateQuery;

                if (updateError) {
                    console.error("Erro crítico no update:", updateError);
                    retryCount++;
                    continue;
                }

                if (!updatedRows || updatedRows.length === 0) {
                    console.warn("⚠️ Conflito de versão detectado. Tentando sincronizar novamente...", retryCount);
                    retryCount++;
                    // Delay aleatório para evitar colisões múltiplas
                    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
                    continue;
                }

                success = true;
            }

            if (!success) {
                App.utils.toast("Alta concorrência na comanda. Tente novamente.", "warning");
                return;
            }

            // 🔥 SE FOR RESERVA, ADICIONA NA LISTA DE RESERVAS DE PRATOS
            if (isReserva) {
                // Categorias permitidas nas reservas (somente comidas e afins)
                const CATS_COMIDA_RESERVA = ['Comidas', 'Petiscos', 'Sobremesas', 'Entradas', 'Combos'];

                // Filtro primário: por CATEGORIA (confiável para itens novos)
                let podeReservar = false;
                if (catValue) {
                    podeReservar = CATS_COMIDA_RESERVA.includes(catValue);
                } else {
                    // Fallback por nome do produto (itens sem categoria definida)
                    const nomeProc = (nome || '').toLowerCase();
                    const isBebidaNome = nomeProc.includes('coca') || nomeProc.includes('fanta') ||
                        nomeProc.includes('sprite') || nomeProc.includes('pepsi') || nomeProc.includes('chopp') ||
                        nomeProc.includes('cerveja') || nomeProc.includes('suco') || nomeProc.includes('drink') ||
                        nomeProc.includes('caipirinha') || nomeProc.includes('coquetel') || nomeProc.includes('refri') ||
                        nomeProc.includes('água') || nomeProc.includes('agua') || nomeProc.includes('vinho');
                    podeReservar = !isBebidaNome;
                }

                if (!podeReservar) {
                    App.utils.toast("⚠️ Bebidas e Drinks não entram no relatório de reservas de comida.", "info");
                } else {
                    const { error: reservaError } = await _sb.from('reservas_pratos').insert({
                        store_id: App.state.storeId,
                        comanda_id: App.state.currentComanda,
                        mesa_numero: App.state.currentMesaNum,
                        garcom_nome: garcomNome,
                        produto_nome: nome,
                        quantidade: qtd,
                        preco_unitario: finalPrice,
                        observacoes: obs,
                        data_reserva: new Date().toISOString().slice(0, 10),
                        status: 'pendente'
                    });

                    if (!reservaError) {
                        await NaxioUI.alert(
                            '✅ Reserva Registrada',
                            `Prato "${nome}" adicionado à lista de reservas para o almoço!`,
                            'success'
                        );
                    }
                }
            }

            // --- ATUALIZAÇÃO UI ---
            const latestC_final = await _sb.from('comandas').select('items').eq('id', App.state.currentComanda).single();
            const finalItems = latestC_final.data ? latestC_final.data.items : App.state.currentComandaItems;
            App.state.currentComandaItems = finalItems;

            // Em vez de fechar o modal, nós resetamos o estado dele para permitir novas inserções!
            const elSel = document.getElementById('lancar-selecionado');
            if (elSel) elSel.style.display = 'none';

            const elSelId = document.getElementById('lancar-sel-id');
            if (elSelId) elSelId.value = '';

            const elSelNome = document.getElementById('lancar-sel-nome');
            if (elSelNome) elSelNome.innerText = '';

            const elSelPreco = document.getElementById('lancar-sel-preco');
            if (elSelPreco) elSelPreco.value = '0.00';

            const elQtd = document.getElementById('lancar-qtd');
            if (elQtd) elQtd.value = '1';

            if (document.getElementById('lancar-obs')) document.getElementById('lancar-obs').value = '';
            if (document.getElementById('lancar-isento-10')) document.getElementById('lancar-isento-10').checked = false;
            if (document.getElementById('lancar-is-reserva')) document.getElementById('lancar-is-reserva').checked = false;

            const buscaEl = document.getElementById('lancar-busca');
            if (buscaEl) {
                buscaEl.value = '';
                buscaEl.focus();
            } else {
                // Se não tem barra de busca, significa que é o modal de item rápido, então fecha
                const modal = document.getElementById('modal-lancar-item-avancado');
                if (modal) modal.remove();
            }

            App.store.renderEditList(App.state.currentMesaNum, finalItems);
            App.store.calcularTotaisComTaxa();

            // 🔥 ATUALIZA O CHECKOUT RÁPIDO SE ESTIVER ABERTO
            if (App.store.fastCheckoutComanda && App.store.fastCheckoutComanda.id === App.state.currentComanda) {
                App.store.fastCheckoutComanda.items = finalItems;
                App.store.recalcularCheckoutRapido();
                // App.store.checkMesaRapida(); // Alternativa mais robusta
            }

            App.utils.toast("Item lançado! Lista atualizada.", "success");
        } finally {
            App.state._isLaunchingItem = false;
            if (window.NaxioUI) NaxioUI.hideLoading();
        }
    },

    // --- INTERFACE DE LANÇAMENTO (COM PRESETS DE COZINHA) ---
    lancarItemAvancado: (prodId, prodNome, prodPreco, prodNcm) => {
        const modalHtml = `
            <div id="modal-lancar-item-avancado" class="modal-overlay" style="display:flex; z-index:9999;">
                <div class="modal-content" style="max-width:400px; background:#1e293b; color:#fff;">
                    <div class="modal-header">
                        <h3>🍽️ Lançar: ${prodNome}</h3>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-lancar-item-avancado').remove()">Cancelar</button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="lancar-sel-id" value="${prodId}">
                        <span id="lancar-sel-nome" style="display:none;">${prodNome}</span>
                        <input type="hidden" id="lancar-sel-preco" value="${prodPreco}">
                        <input type="hidden" id="lancar-sel-ncm" value="${prodNcm}">

                        <div style="margin-bottom:15px;">
                            <label>Quantidade:</label>
                            <div style="display:flex; gap:10px;">
                                <input type="number" step="0.1" id="lancar-qtd" class="input-field" value="1" style="text-align:center; font-size:1.5rem;">
                            </div>
                        </div>

                        <div style="margin-bottom:15px;">
                            <label>Observação (Opcional):</label>
                            <div style="display:flex; gap:5px; flex-wrap:wrap; margin-bottom:5px;">
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Sem Cebola')">Sem Cebola</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Bem Passado')">Bem Passado</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Ao Ponto')">Ao Ponto</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Mal Passado')">Mal Passado</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Sem Gelo')">Sem Gelo</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Com Limão')">Com Limão</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.addObsPreset('Para Viagem')">Para Viagem</button>
                            </div>
                            <textarea id="lancar-obs" class="input-field" rows="3" placeholder="Ex: Sem cebola, ponto da carne..."></textarea>
                        </div>

                        <button class="btn btn-success btn-full" onclick="App.store.confirmarLancamento()">CONFIRMAR LANÇAMENTO</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => document.getElementById('lancar-qtd').focus(), 100);
    },



    addObsPreset: (txt) => {
        const el = document.getElementById('lancar-obs');
        if (el.value) el.value += ', ' + txt;
        else el.value = txt;
    },

    // --- LISTAGEM E AGRUPAMENTO NO MODAL ---
    // --- UI: NOVO MODAL DE DETALHES (TABBED INTERFACE) ---
    abrirDetalhesMesa: async (numero, items) => {
        const old = document.getElementById('comanda-modal-tabs');
        if (old) old.remove();

        // Inicializa estado
        App.store.state.activeTab = 'pedidos';
        App.store.state.currentGuia = null; // Limpa guia anterior

        // 🔥 AGUARDA dados frescos ANTES de renderizar, e guarda decisão de taxa sutilmente
        const mesaFresca = await App.store.fetchMesaDetails(numero);
        if (mesaFresca) App.store.state.currentMesaStatus = mesaFresca.status;
        if (App.store.state._taxaPorComanda === undefined) App.store.state._taxaPorComanda = {};
        if (App.store.state._taxaPorComanda[numero] === undefined) {
            const MESAS_BALCAO_SEM_TAXA = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
            const ehBalcao = MESAS_BALCAO_SEM_TAXA.includes(String(numero)) || (mesaFresca && mesaFresca.tipo_comanda === 'interna');
            App.store.state.comTaxa = !ehBalcao;
        }

        const modalHtml = `
        <div id="comanda-modal-tabs" class="modal-overlay" style="display:flex; z-index:9000; align-items:center; justify-content:center;">
            <div class="modal-content" style="width:95%; max-width:1000px; height:90vh; display:flex; flex-direction:column; background:#1e293b; color:#f1f5f9; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
                
                <!-- HEADER & TABS -->
                <div class="modal-header" style="background:#0f172a; padding:0; border-bottom:1px solid #334155; border-radius:16px 16px 0 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">
                        <div style="display:flex; align-items:center; gap:15px;">
                            <div style="background:#2563eb; color:white; width:50px; height:50px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:bold;">
                                ${numero}
                            </div>
                            <div>
                                <h2 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:8px;">
                                    Mesa ${numero}
                                    ${mesaFresca && mesaFresca.status !== 'fechada' ? 
                                        `<button onclick="App.store.toggleLockComanda('${mesaFresca.id}', '${numero}', ${mesaFresca.status === 'paga'})" class="btn btn-sm" title="Bloquear/Desbloquear Comanda" style="padding:0; border:none; background:transparent;">
                                            <i class="${mesaFresca.status === 'paga' ? 'ri-lock-fill' : 'ri-lock-unlock-line'}" style="font-size:1.3rem; color:${mesaFresca.status === 'paga' ? '#ef4444' : '#94a3b8'};"></i>
                                        </button>` : ''}
                                </h2>
                                <div style="font-size:0.85rem; color:#94a3b8;">
                                    Status: <span style="color:#22c55e;">Ocupada</span> • 
                                    Tempo: <span id="mesa-tempo-header">Calculando...</span>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.5rem; font-weight:bold; color:#4ade80;" id="mesa-total-header">R$ 0,00</div>
                            <small style="color:#64748b;">Total Parcial</small>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('comanda-modal-tabs').remove()" style="margin-left:20px;">
                            <i class="ri-close-line" style="font-size:1.2rem;"></i>
                        </button>
                    </div>

                    <!-- TABS NAVIGATION -->
                    <div style="display:flex; gap:2px; padding:0 20px;">
                        <button class="tab-btn active" onclick="App.store.switchTab('pedidos')" id="tab-btn-pedidos">
                            <i class="ri-restaurant-line"></i> Pedidos
                        </button>
                        <button class="tab-btn" onclick="App.store.switchTab('pagamento')" id="tab-btn-pagamento">
                            <i class="ri-wallet-3-line"></i> Pagamento
                        </button>
                        <button class="tab-btn" onclick="App.store.switchTab('info')" id="tab-btn-info">
                            <i class="ri-information-line"></i> Info & Ações
                        </button>
                    </div>
                </div>

                <!-- BODY AREA -->
                <div id="comanda-modal-body" class="modal-body" style="flex:1; overflow-y:auto; padding:20px; background:#1e293b;">
                    <!-- Conteúdo renderizado via JS -->
                </div>

            </div>
        </div>
        
        <style>
            .tab-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                padding: 12px 20px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 600;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tab-btn:hover { border-color: #3b82f6; }
            .tab-btn.active {
                color: #3b82f6;
                border-bottom-color: #3b82f6;
            }
            .comanda-item-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px; border-bottom: 1px solid #334155;
                transition: background 0.2s;
            }
            .comanda-item-row:hover { background: #0f172a; }
            .action-card {
                background: #0f172a; border: 1px solid #334155; padding: 20px; border-radius: 12px;
                text-align: center; cursor: pointer; transition: transform 0.2s, border-color 0.2s;
            }
            .action-card:hover { transform: translateY(-3px); border-color: #3b82f6; }
        </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Atualiza tempo no header (dados já buscados acima)
        if (mesaFresca) {
            const tempo = App.store.getTempoDecorrido(mesaFresca.updated_at || mesaFresca.created_at);
            const cor = App.store.getTempoColor(mesaFresca.updated_at || mesaFresca.created_at);
            const elTempo = document.getElementById('mesa-tempo-header');
            if (elTempo) { elTempo.innerText = tempo; elTempo.style.color = cor; }
        }

        // 🔥 Renderiza UNA VEZ com o estado correto já definido
        App.store.renderActiveTab(numero, items);
    },

    toggleTaxa: () => {
        App.store.state.comTaxa = !App.store.state.comTaxa;
        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    },

    toggleLockComanda: async (id, num, isLocked) => {
        if (isLocked) {
            if (!await NaxioUI.confirm('Desbloquear Comanda', `Deseja desbloquear a Comanda ${num}? Ela voltará a aceitar itens e reaparecerá no painel do garçom.`)) return;
            try {
                if (window.NaxioUI) NaxioUI.showLoading("Desbloqueando...");
                const { error } = await _sb.from('comandas').update({ status: 'ocupada' }).eq('id', id);
                if (error) throw error;
                App.utils.toast("Comanda desbloqueada com sucesso!", "success");
                App.store.state.currentMesaStatus = 'ocupada';
                // Refresh modal state
                App.store.abrirDetalhesMesa(num, App.state.currentComandaItems);
            } catch(e) {
                console.error(e);
                App.utils.toast("Erro ao desbloquear comanda", "error");
            } finally {
                if (window.NaxioUI) NaxioUI.hideLoading();
            }
        } else {
            if (!await NaxioUI.confirm('Bloquear Comanda', `Deseja bloquear a Comanda ${num} (Pagamento Realizado)? Ela não aceitará mais itens e sairá do painel do garçom.`)) return;
            try {
                if (window.NaxioUI) NaxioUI.showLoading("Bloqueando...");
                const { error } = await _sb.from('comandas').update({ status: 'paga' }).eq('id', id);
                if (error) throw error;
                App.utils.toast("Comanda bloqueada com sucesso!", "success");
                App.store.state.currentMesaStatus = 'paga';
                // Refresh modal state
                App.store.abrirDetalhesMesa(num, App.state.currentComandaItems);
            } catch(e) {
                console.error(e);
                App.utils.toast("Erro ao bloquear comanda", "error");
            } finally {
                if (window.NaxioUI) NaxioUI.hideLoading();
            }
        }
    },

    fetchMesaDetails: async (num) => {
        // Query sem join guides (FK não configurada) - usa campos diretos
        const { data, error } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', num)
            .neq('status', 'fechada')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) console.error('fetchMesaDetails error:', error);
        if (data && data.guide_name) {
            App.store.state.currentGuia = {
                name: data.guide_name,
                commission_percentage: data.guide_commission || 10
            };
        } else {
            App.store.state.currentGuia = null;
        }
        return data;
    },

    switchTab: (tabName) => {
        App.store.state.activeTab = tabName;
        // Atualiza UI das abas
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`tab-btn-${tabName}`).classList.add('active');
        // Renderiza conteúdo
        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    },

    renderActiveTab: (num, items) => {
        num = num || App.state.currentMesaNum;
        items = items || App.state.currentComandaItems || [];
        const container = document.getElementById('comanda-modal-body');
        if (!container) return; // Modal fechado

        // Atualiza Total Header sempre
        const total = items.reduce((acc, i) => acc + (i.price * (i.qtd || 1)), 0);
        const elTotal = document.getElementById('mesa-total-header');
        if (elTotal) {
            const final = App.store.state.comTaxa ? total * 1.1 : total;
            elTotal.innerText = `R$ ${final.toFixed(2)}`;
        }

        const tab = App.store.state.activeTab;

        if (tab === 'pedidos') {
            App.store.renderTabPedidos(container, items);
        } else if (tab === 'pagamento') {
            App.store.renderTabPagamento(container, items, total);
        } else if (tab === 'info') {
            App.store.renderTabInfo(container, num);
        }
    },

    // --- RENDERIZADORES DE ABAS ---

    renderTabPedidos: (container, items) => {
        // Garante que items é uma lista
        const safeItems = Array.isArray(items) ? items : [];
        const itemsAgrupados = [];

        safeItems.forEach(item => {
            if (!item) return;
            const existe = itemsAgrupados.find(g => String(g.id) === String(item.id) && (g.observacao || '') === (item.observacao || ''));
            if (existe) {
                existe.qtd += parseFloat(item.qtd || 1);
                existe.totalPrice += ((parseFloat(item.price) || 0) * (parseFloat(item.qtd) || 1));
            } else {
                itemsAgrupados.push({ ...item, totalPrice: (parseFloat(item.price) || 0) * (parseFloat(item.qtd) || 1) });
            }
        });

        const listHtml = itemsAgrupados.length > 0 ? itemsAgrupados.map(item => {
            const dataItem = item.data_lancamento || item.added_at;
            const horaFormatada = dataItem ? new Date(dataItem).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const safeObs = btoa(encodeURIComponent(item.observacao || ''));
            return `
            <div class="comanda-item-row">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:bold; font-size:1.1rem; color:#f8fafc;">${item.qtd}x</span>
                        <span style="font-size:1rem; color:#e2e8f0;">${item.nome}</span>
                    </div>
                    ${item.observacao ? `<div style="font-size:0.85rem; color:#f59e0b; margin-top:2px; font-weight:600;">📝 ${item.observacao}</div>` : ''}
                    ${item.is_reserva || (item.observacao && item.observacao.includes('[RESERVA]')) ? `<div style="font-size:0.85rem; background:rgba(34, 197, 94, 0.2); color:#22c55e; font-weight:bold; margin-top:4px; padding:2px 8px; border-radius:4px; border:1px solid #22c55e; display:inline-block;">📅 RESERVA PARA ALMOÇO</div>` : ''}
                    <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">
                        👤 ${item.garcom || 'Sistema'} • ${horaFormatada}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:#4ade80;">R$ ${item.totalPrice.toFixed(2)}</div>
                    <button class="btn btn-sm" style="background:#ef4444; color:white; padding:4px 8px; border-radius:6px; margin-top:4px;" 
                            onclick="App.store.removeItemFromComanda('${item.id}', decodeURIComponent(atob('${safeObs}')))">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `}).join('') : '<div style="text-align:center; padding:40px; color:#64748b;">Nenhum item lançado ainda.</div>';

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 300px; gap:20px; height:100%;">
                <!-- COLUNA DA ESQUERDA: LISTA -->
                <div style="background:#0f172a; border-radius:12px; border:1px solid #334155; overflow:hidden; display:flex; flex-direction:column;">
                    <div style="padding:15px; background:#1e293b; border-bottom:1px solid #334155; display:flex; justify-content:space-between;">
                        <h4 style="margin:0;">Itens do Pedido</h4>
                        <span class="badge" style="background:#334155;">${items.length} itens</span>
                    </div>
                    <div style="flex:1; overflow-y:auto; padding:0;">
                        ${listHtml}
                    </div>
                    <div style="padding:15px; border-top:1px solid #334155; background:#1e293b;">
                         <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#cbd5e1;">
                            <input type="checkbox" id="taxa-global-check" ${App.store.state.comTaxa ? 'checked' : ''} onchange="App.store.toggleTaxa(); App.store.calcularTotaisComTaxa();"> 
                            Cobrar 10% (Serviço)
                        </label>
                    </div>
                </div>

                <!-- COLUNA DA DIREITA: AÇÕES RÁPIDAS -->
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${App.store.state.currentMesaStatus === 'paga' 
                    ? `<button class="btn btn-primary btn-lg" style="height:80px; font-size:1.1rem; opacity:0.5; cursor:not-allowed;" onclick="App.utils.toast('Comanda bloqueada para novos itens.', 'warning')">
                        <i class="ri-lock-fill" style="font-size:1.5rem; display:block;"></i>
                        COMANDA BLOQUEADA
                    </button>`
                    : `<button class="btn btn-primary btn-lg" style="height:80px; font-size:1.1rem;" onclick="App.store.abrirModalLancarItem()">
                        <i class="ri-add-circle-line" style="font-size:1.5rem; display:block;"></i>
                        ADICIONAR ITEM (F2)
                    </button>`}
                    
                    <button class="btn btn-secondary" style="height:60px;" onclick="App.store.imprimirConferenciaInternal(App.state.currentComanda)">
                        <i class="ri-printer-line" style="font-size:1.2rem; display:block;"></i>
                        Imprimir Conferência
                    </button>

                    <div style="margin-top:auto; background:#0f172a; padding:15px; border-radius:12px; border:1px solid #334155;">
                        <h4 style="margin-top:0; color:#94a3b8;">Resumo</h4>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span>Subtotal</span>
                            <span id="resumo-subtotal">R$ ${items.reduce((a, b) => Math.round((a + ((parseFloat(b.price) || 0) * (parseFloat(b.qtd) || 1))) * 100) / 100, 0).toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#f59e0b;">
                            <span>Serviço (10%)</span>
                            <span id="resumo-taxa">R$ ${(App.store.state.comTaxa ? Math.round((items.reduce((a, b) => b.isento_10 ? a : a + ((parseFloat(b.price) || 0) * (parseFloat(b.qtd) || 1)), 0) * 0.10) * 100) / 100 : 0).toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.05rem; border-top:1px solid #334155; padding-top:8px; margin-bottom:10px;">
                            <span>Total</span>
                            <span id="resumo-total-final" style="color:#4ade80;">R$ ${(() => { const sub = items.reduce((a, b) => Math.round((a + ((parseFloat(b.price) || 0) * (parseFloat(b.qtd) || 1))) * 100) / 100, 0); const tx = App.store.state.comTaxa ? Math.round((items.reduce((a, b) => b.isento_10 ? a : a + ((parseFloat(b.price) || 0) * (parseFloat(b.qtd) || 1)), 0) * 0.10) * 100) / 100 : 0; return (sub + tx).toFixed(2); })()}</span>
                        </div>
                        ${(() => {
                const guia = App.store.state.currentGuia;
                if (guia && items.length > 0) {
                    const sub = items.reduce((a, b) => a + (b.price * b.qtd), 0);
                    const pct = parseFloat(guia.commission_percentage) || 10;
                    const comissao = sub * (pct / 100);
                    return `<div style="border-top:1px solid #334155; padding-top:10px; margin-top:5px;">
                                    <div style="display:flex; justify-content:space-between; color:#818cf8; margin-bottom:3px; align-items:center;">
                                        <span style="font-size:0.85rem;">👔 Guia: <strong>${guia.name}</strong></span>
                                        <button class="btn btn-secondary btn-xs" style="padding: 2px 6px; font-size: 0.75rem;" onclick="GuiasSystem.selecionarGuiaParaComanda(App.state.currentComanda, App.state.currentMesaNum)">Alterar</button>
                                        <span style="font-size:0.85rem;">${pct}%</span>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; color:#a78bfa; font-weight:bold;">
                                        <span>Comissão Guia</span>
                                        <span>R$ ${comissao.toFixed(2)}</span>
                                    </div>
                                </div>`;
                } else if (items.length > 0) {
                    return `<div style="border-top:1px solid #334155; padding-top:10px; margin-top:5px; text-align:center;">
                                <button class="btn btn-secondary btn-xs btn-full" style="padding: 4px; font-size: 0.8rem; background: #312e81; border: 1px solid #4338ca;" onclick="GuiasSystem.selecionarGuiaParaComanda(App.state.currentComanda, App.state.currentMesaNum)">
                                    ➕ Vincular Guia (Turismo)
                                </button>
                            </div>`;
                }
                return '';
            })()}
                        <button class="btn btn-success btn-full" style="margin-top:10px;" onclick="App.store.switchTab('pagamento')">
                            IR PARA PAGAMENTO ➡️
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // --- UI: ABA PAGAMENTO AVANÇADA (SPLIT / PARCIAL) ---
    renderTabPagamento: (container, items, total) => {
        // Estado local para seleção de itens
        if (!App.store.state.paymentSelection) App.store.state.paymentSelection = [];

        const isParcial = App.store.state.paymentMode === 'parcial';

        // Separa itens pagos/selecionados
        const selectedIndices = App.store.state.paymentSelection;

        let subtotalToPay = 0;
        let itemsToPay = [];

        if (isParcial && selectedIndices.length > 0) {
            items.forEach((item, idx) => {
                if (selectedIndices.includes(idx)) {
                    subtotalToPay += (item.price * item.qtd);
                    itemsToPay.push(item);
                }
            });
        } else {
            subtotalToPay = items.reduce((a, b) => a + (b.price * b.qtd), 0);
            itemsToPay = items;
        }

        const comTaxa = App.store.state.comTaxa;
        // Filtrar taxa isenta no Comandas.js
        const subtotalTaxavel = itemsToPay.reduce((a, b) => b.isento_10 ? a : a + (parseFloat(b.price) * parseFloat(b.qtd)), 0);
        const taxa = comTaxa ? subtotalTaxavel * 0.10 : 0;
        const totalFinal = subtotalToPay + taxa;

        // Renderiza Lista Selecionável
        const listHtml = items.map((item, idx) => {
            const isSelected = selectedIndices.includes(idx);
            const checkStyle = isSelected ? 'background:#3b82f6; border-color:#3b82f6; color:white;' : 'border-color:#64748b; color:transparent;';
            const rowBg = isSelected ? '#1e3a8a' : 'transparent';

            return '<div onclick="App.store.togglePaymentItem(' + idx + ')" ' +
                'style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #334155; cursor:pointer; background:' + rowBg + '; transition:0.2s;">' +
                '<div style="display:flex; gap:10px; align-items:center;">' +
                (isParcial ?
                    '<div style="width:20px; height:20px; border-radius:4px; border:2px solid; display:flex; align-items:center; justify-content:center; ' + checkStyle + '">' +
                    '<i class="ri-check-line" style="font-size:1rem;"></i>' +
                    '</div>' : '') +
                '<div>' +
                '<div style="font-weight:bold; color:#f1f5f9;">' + item.qtd + 'x ' + item.nome + '</div>' +
                (item.promo_name ? '<div style="font-size:0.7rem; color:#facc15;">🏷️ ' + item.promo_name + ' (Promo)</div>' : '') +
                '</div>' +
                '</div>' +
                '<div style="font-weight:bold;">R$ ' + (item.price * item.qtd).toFixed(2) + '</div>' +
                '</div>';
        }).join('');

        container.innerHTML =
            '<div style="display:grid; grid-template-columns:1fr 340px; gap:20px; height:100%;">' +
            '<div style="background:#0f172a; border-radius:12px; border:1px solid #334155; display:flex; flex-direction:column; overflow:hidden;">' +
            '<div style="padding:15px; background:#1e293b; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">' +
            '<h4 style="margin:0;">📦 Itens do Pedido</h4>' +
            '<div class="tab-group" style="display:flex; background:#0f172a; padding:4px; border-radius:8px;">' +
            '<button class="btn btn-sm ' + (!isParcial ? 'btn-primary' : 'btn-ghost') + '" onclick="App.store.setPaymentMode(\'total\')">Total</button>' +
            '<button class="btn btn-sm ' + (isParcial ? 'btn-primary' : 'btn-ghost') + '" onclick="App.store.setPaymentMode(\'parcial\')">Parcial</button>' +
            '</div>' +
            '</div>' +
            '<div style="flex:1; overflow-y:auto; padding:5px;">' + listHtml + '</div>' +
            '</div>' +

            '<div style="background:#1e293b; border-radius:12px; border:1px solid #334155; padding:20px; display:flex; flex-direction:column; gap:15px;">' +
            '<div>' +
            '<h4 style="margin:0 0 10px 0; color:#94a3b8;">RESUMO DO PAGAMENTO</h4>' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:5px;">' +
            '<span>Subtotal</span>' +
            '<span>R$ ' + subtotalToPay.toFixed(2) + '</span>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:10px;">' +
            '<label style="display:flex; align-items:center; gap:8px; cursor:pointer;">' +
            '<input type="checkbox" id="taxa-global-pag" ' + (App.store.state.comTaxa ? 'checked' : '') + ' onchange="App.store.toggleTaxa()"> Comissão (10%)' +
            '</label>' +
            '<span>R$ ' + taxa.toFixed(2) + '</span>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; border-top:1px solid #334155; padding-top:10px; font-size:1.4rem; font-weight:bold; color:#60a5fa;">' +
            '<span>TOTAL</span>' +
            '<span>R$ ' + totalFinal.toFixed(2) + '</span>' +
            '</div>' +
            (() => {
                const guia = App.store.state.currentGuia;
                if (guia && subtotalToPay > 0) {
                    const pct = parseFloat(guia.commission_percentage) || 10;
                    const comissaoGuia = subtotalToPay * (pct / 100);
                    return '<div style="border-top:1px solid #334155; padding-top:10px; margin-top:5px; background:#1e1b4b; border-radius:8px; padding:10px; margin-top:10px;">' +
                        '<div style="font-size:0.8rem; color:#818cf8; margin-bottom:5px; font-weight:600;">💼 COMISSÃO DO GUIA</div>' +
                        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<span style="font-size:0.9rem;">' + guia.name + ' (' + pct + '%)</span>' +
                        '<span style="font-size:0.9rem;">R$ ' + comissaoGuia.toFixed(2) + '</span>' +
                        '</div>' +
                        '</div>';
                }
                return '';
            })() +
            '</div>' +

            '<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">' +
            '<button class="btn btn-primary btn-full" style="height:65px; font-size:1.1rem; background:lineargradient(135deg, #10b981, #059669); border:none;" onclick="App.store.abrirModalMisto(' + totalFinal + ')">' +
            '💰 REGISTRAR PAGAMENTO (Misto / Gaveta)' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    },

    // --- ABA INFO & AÇÕES (Nova implementação) ---
    renderTabInfo: (container, num) => {
        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:20px;">
                <div class="action-card" onclick="GuiasSystem.selecionarGuiaParaComanda(App.state.currentComanda, App.state.currentMesaNum)">
                    <i class="ri-flag-line" style="font-size:3rem; color:#8b5cf6; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0;">Alterar / Atualizar Guia</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Altera, vincula ou remove o guia desta comanda.</p>
                </div>

                <div class="action-card" onclick="App.store.transferirMesa()">
                    <i class="ri-arrow-left-right-line" style="font-size:3rem; color:#f59e0b; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0;">Transferir Mesa Completa</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Move todos os itens e libera esta mesa.</p>
                </div>

                <div class="action-card" onclick="App.store.abrirModalTransferenciaItens()">
                    <i class="ri-drag-move-2-line" style="font-size:3rem; color:#3b82f6; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0;">Transferir Itens (Parcial)</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Selecione itens específicos para mover.</p>
                </div>

                <div class="action-card" onclick="App.store.imprimirConferenciaInternal(App.state.currentComanda)">
                    <i class="ri-printer-line" style="font-size:3rem; color:#10b981; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0;">Imprimir Conferência</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Reimprime o extrato de conferência.</p>
                </div>
                <div class="action-card" style="border-color:#ef4444;" onclick="App.store.liberarMesaSeguro(App.state.currentComanda)">
                    <i class="ri-close-circle-line" style="font-size:3rem; color:#ef4444; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0; color:#ef4444;">Cancelar / Liberar Mesa</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Limpa a mesa sem registrar pagamento.</p>
                </div>

                <div class="action-card" onclick="App.store.enviarMensagemParaGarcom()">
                    <i class="ri-broadcast-line" style="font-size:3rem; color:#8b5cf6; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0;">Aviso Geral (Garçons)</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Envia um alerta para todos os garçons agora.</p>
                </div>

                <div class="action-card" onclick="App.store.enviarAvisoAniversario(${num})">
                    <i class="ri-cake-2-line" style="font-size:3rem; color:#f472b6; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0; color:#f472b6;">Mesa em Festa!</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Notifica aniversário/comemoração nesta mesa.</p>
                </div>
            </div>
        `;
    },

    liberarMesaSeguro: async (id) => {
        const senha = await NaxioUI.prompt('🔒 Autorização', 'Digite a senha do gerente para prosseguir:', '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }
        if (await NaxioUI.confirm('Confirmação', 'Tem certeza que deseja cancelar esta comanda?')) {
            const motivo = await NaxioUI.prompt('📝 Motivo do Cancelamento', 'Por favor, informe o motivo para registro no sistema:', '', 'Ex: Cliente desistiu', 'text');
            if (motivo === null) return;

            App.utils.toast("Cancelando e registrando...", "info");

            // Registra o cancelamento no histórico
            const user = App.state.profile?.nome_completo || App.state.user?.email || 'Sistema';
            await _sb.from('orders').insert({
                store_id: App.state.storeId,
                session_id: typeof Caixa !== 'undefined' && Caixa.state && Caixa.state.session ? Caixa.state.session.id : null,
                status: 'cancelado',
                origem_venda: 'cancelamento_comanda',
                total_pago: 0,
                observacao: `COMANDA CANCELADA: Mesa ${App.state.currentMesaNum} | Motivo: ${motivo || 'Sem motivo detalhado'} | Por: ${user}`,
                created_at: new Date().toISOString()
            });

            const { error } = await _sb.from('comandas').update({
                status: 'livre',
                items: [],
                total_pago: 0,
                updated_at: new Date().toISOString()
            }).eq('id', id);
            if (error) return NaxioUI.alert('Erro', "Erro: " + error.message, 'error');
            App.utils.toast("Comanda liberada e limpa!", "success");
            const m = document.getElementById('comanda-modal-tabs');
            if (m) m.remove();
            // 🔥 Bypass throttle para atualizar grid imediatamente após cancelar comanda
            App.store._loadThrottleBypass = true;
            if (App.store.loadComandas) App.store.loadComandas();
        }
    },

    // Alias de compatibilidade
    renderEditList: (num, items) => {
        // Se o modal novo não estiver aberto, abrimos ele
        if (!document.getElementById('comanda-modal-tabs')) {
            // App.store.abrirDetalhesMesa(num, items); // Risky loop if not careful.
            // Better to just ignore standard rendering if tabs aren't there, OR force open tabs.
        } else {
            App.store.renderActiveTab(num, items);
        }
    },

    // Auxiliares de Pagamento
    // Auxiliares de Pagamento
    setPaymentMode: (mode) => {
        App.store.state.paymentMode = mode;
        if (mode === 'total') App.store.state.paymentSelection = []; // Limpa seleção
        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    },

    togglePaymentItem: (idx) => {
        if (App.store.state.paymentMode !== 'parcial') return; // Só funciona no modo parcial

        const sel = App.store.state.paymentSelection;
        const i = sel.indexOf(idx);
        if (i === -1) sel.push(idx);
        else sel.splice(i, 1);

        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    },

    processarPagamento: async (metodo, valor) => {
        const isParcial = App.store.state.paymentMode === 'parcial';

        if (isParcial && (!App.store.state.paymentSelection || App.store.state.paymentSelection.length === 0)) {
            return NaxioUI.alert('Atenção', "Selecione pelo menos um item para pagamento parcial.", 'warning');
        }

        if (valor <= 0) return NaxioUI.alert('Erro', "Valor inválido.", 'error');

        const nomeCliente = document.getElementById('pag-nome')?.value;
        const cpfCliente = document.getElementById('pag-cpf')?.value;

        if (!await NaxioUI.confirm('Confirmação', "Confirmar recebimento de R$ " + valor.toFixed(2) + " em " + metodo + "?")) return;

        // Mapeia código fiscal
        const mapaCodigos = { 'Dinheiro': '01', 'Pix': '17', 'Crédito': '03', 'Débito': '04' };
        const payments = [{
            method: metodo,
            amount: valor,
            code: mapaCodigos[metodo] || '99',
            val: valor
        }];

        // Itens que estão sendo pagos
        let itemsToPay = [];
        let itemsRemaining = [];

        if (isParcial) {
            App.state.currentComandaItems.forEach((item, idx) => {
                if (App.store.state.paymentSelection.includes(idx)) itemsToPay.push(item);
                else itemsRemaining.push(item);
            });
        } else {
            itemsToPay = [...App.state.currentComandaItems];
            itemsRemaining = [];
        }

        await App.store.finalizarFechamentoComanda(payments, valor, itemsToPay, itemsRemaining, cpfCliente, nomeCliente);
    },

    // --- NOVA LÓGICA DE TEF ATIVO (SETA VALOR DIRETO NA MÁQUINA) ---
    wsConciliacao: null,

    iniciarWebSocketConciliacao: () => {
        if (App.store.wsConciliacao) return;

        try {
            const ipWS = localStorage.getItem('naxio_agent_ip') || 'localhost';
            const portaWS = localStorage.getItem('naxio_agent_port') || '8081';
            App.store.wsConciliacao = new WebSocket("ws://" + ipWS + ":" + portaWS);

            App.store.wsConciliacao.onopen = () => {
                App.store._tefJaConectouUmaVez = true;
                console.log("🟢 Conectado ao Naxio Agent (TEF Python)");
                const st = document.getElementById('ws-status');
                if (st) { st.innerText = '🟢 Agent Ativo'; st.style.color = '#34d399'; }
            };

            App.store.wsConciliacao.onmessage = (event) => {
                const result = JSON.parse(event.data);

                if (result.type === "GETNET_PAGAMENTO_APROVADO") {
                    App.utils.toast("✅ Transação Aprovada pela Maquininha!", "success");
                    const p = result.pagamento;

                    const elCredit = document.getElementById("mesa-pay-credit");
                    const elDebit = document.getElementById("mesa-pay-debit");
                    const elPix = document.getElementById("mesa-pay-pix");

                    if (elCredit || elDebit || elPix) {
                        if (p.bandeira === "PIX") {
                            if (elPix) { elPix.value = p.valor; App.store.calcRestanteMesa(App.store.fastCheckoutComanda.calc_total); }
                        } else if (p.bandeira === "VISA" || p.bandeira === "MASTERCARD" || p.bandeira.includes("CREDIT")) {
                            if (elCredit) { elCredit.value = p.valor; App.store.calcRestanteMesa(App.store.fastCheckoutComanda.calc_total); }
                        } else {
                            if (elDebit) { elDebit.value = p.valor; App.store.calcRestanteMesa(App.store.fastCheckoutComanda.calc_total); }
                        }
                    } else {
                        // Pagamento direto do botão "Cartão" na tela principal da comanda
                        const pInfo = result.pagamento || { valor: localStorage.getItem('conciliacao_esperada_valor') || 0, bandeira: 'Crédito' };
                        App.store.processarPagamentoLocalAposConciliacao(pInfo.bandeira, parseFloat(pInfo.valor));
                    }

                } else if (result.type === "GETNET_ESPERANDO_SENHA") {
                    App.utils.toast("📲 Cliente digite a senha na maquininha...", "info");
                } else if (result.type === "GETNET_ERRO") {
                    NaxioUI.alert('⚠️ Erro de Integração Getnet', result.message, 'error');
                }
            };

            App.store.wsConciliacao.onclose = () => {
                App.store.wsConciliacao = null;
                const st = document.getElementById('ws-status');
                if (st) { st.innerText = '🔴 Offline'; st.style.color = '#ef4444'; }
                // Só tenta reconectar se o usuário configurou um IP diferente de localhost
                // (indica que tem agente TEF configurado intencionalmente)
                const ip = localStorage.getItem('naxio_agent_ip') || 'localhost';
                const porta = localStorage.getItem('naxio_agent_port') || '8081';
                // Se estiver no padrão localhost e nunca conectou, não fica em loop
                if (App.store._tefJaConectouUmaVez) {
                    setTimeout(App.store.iniciarWebSocketConciliacao, 7000);
                }
            };
        } catch (e) {
            console.error("Erro WS:", e);
        }
    },

    iniciarPagamentoComanda: (valorRestante) => {
        // Grava o valor esperado para uso no checkout rápido
        App.store.fastCheckoutComanda = { calc_total: valorRestante };
        localStorage.setItem('conciliacao_esperada_valor', valorRestante);

        // Dispara o novo fluxo de seleção de terminal (Envio Ativo)
        App.store.abrirModalSelecaoTerminalTEF(valorRestante, 'credit_or_debit');
    },

    abrirModalSelecaoTerminalTEF: async (valorEsperado, tipo) => {
        const prevId = localStorage.getItem('naxio_default_terminal') || '';
        let terminais = [];

        App.utils.toast("Buscando sua lista de maquininhas na nuvem...", "info");
        try {
            const { data } = await _sb.from('store_settings').select('setting_value').eq('store_id', App.state.storeId).eq('setting_key', 'tef_terminals').single();
            if (data && data.setting_value) {
                terminais = JSON.parse(data.setting_value);
            }
        } catch (e) { }

        const opcoes = terminais.length > 0
            ? terminais.map(t => `<option value="${t.id}" ${t.id === prevId ? 'selected' : ''}>${t.nome} (${t.id})</option>`).join('')
            : `<option value="" disabled selected>Nenhum terminal cadastrado</option>`;

        const modalHtml = `
            <div id="modal-tef-terminal" class="modal-overlay" style="display:flex; z-index:99999; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
                <div class="modal-content" style="max-width:400px; width:90%; background:#0f172a; color:white; padding:25px; border-radius:12px; border:2px solid #3b82f6; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <h3 style="margin-top:0; color:#60a5fa; text-align:center;">📡 Enviar para Maquininha</h3>
                    <p style="color:#94a3b8; font-size:0.95rem; text-align:center; margin-bottom:20px;">
                        Selecione o Terminal onde será cobrado <strong style="color:#4ade80; font-size:1.1rem;">R$ ${valorEsperado.toFixed(2)}</strong>.
                    </p>
                    
                    <select id="tef-terminal-id" class="input-field" style="background:#1e293b; color:#f8fafc; font-size:1.1rem; padding:10px; margin-bottom:10px; border:1px solid #475569;">
                        ${opcoes}
                    </select>
                    
                    <div style="text-align:right; margin-bottom:20px;">
                        <span onclick="App.store.cadastrarNovoTerminal('${tipo}')" style="color:#60a5fa; font-size:0.8rem; cursor:pointer; text-decoration:underline;">+ Cadastrar Novo Terminal</span>
                    </div>
                    
                    <button class="btn btn-primary btn-full" style="height:55px; font-size:1.2rem; border-radius:8px; display:flex; align-items:center; justify-content:center; gap:10px; background:linear-gradient(135deg, #3b82f6, #1d4ed8);" onclick="App.store.enviarParaGetnetTerminal(${valorEsperado}, '${tipo}')">
                        <i class="ri-wifi-line"></i> INICIAR TRANSAÇÃO
                    </button>
                    <button class="btn btn-ghost btn-full" style="margin-top:10px; color:#f87171;" onclick="document.getElementById('modal-tef-terminal').remove()">
                        Cancelar
                    </button>
                </div>
            </div>`;

        const old = document.getElementById('modal-tef-terminal');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    enviarParaGetnetTerminal: (valorEsperado, tipo) => {
        const terminalId = document.getElementById('tef-terminal-id').value;
        if (!terminalId) return NaxioUI.alert('Atenção', 'Por favor, cadastre um terminal primeiro clicando em "+ Cadastrar Novo Terminal".', 'warning');

        // Salva terminal padrão para próximas vendas
        localStorage.setItem('naxio_default_terminal', terminalId);
        document.getElementById('modal-tef-terminal').remove();

        App.store.enviarComandoPagamentoGetnet(valorEsperado, terminalId, tipo);
    },

    cadastrarNovoTerminal: async (tipo) => {
        const idNova = await NaxioUI.prompt("Terminal ID", "Qual o ID do Terminal Getnet? (ex: 85A29P)");
        if (!idNova) return;
        const nomeNova = await NaxioUI.prompt("Nome do Terminal", "Dê um nome a esta Maquininha (ex: Caixa Principal, Maquina Motoboy)");
        if (!nomeNova) return;

        App.utils.toast("Salvando terminal na nuvem...", "info");

        let terminais = [];
        try {
            const { data } = await _sb.from('store_settings').select('setting_value').eq('store_id', App.state.storeId).eq('setting_key', 'tef_terminals').single();
            if (data && data.setting_value) {
                terminais = JSON.parse(data.setting_value);
            }
        } catch (e) { }

        // Evita duplicados
        terminais = terminais.filter(t => t.id !== idNova.toUpperCase());
        terminais.push({ id: idNova.toUpperCase(), nome: nomeNova });

        // Salva online
        const { error } = await _sb.from('store_settings').upsert({
            store_id: App.state.storeId,
            setting_key: 'tef_terminals',
            setting_value: JSON.stringify(terminais)
        }, { onConflict: 'store_id, setting_key' });

        if (error) {
            App.utils.toast("Erro ao salvar terminal na nuvem!", "error");
            return;
        }

        App.utils.toast("Terminal adicionado com sucesso!", "success");
        // Refresha a tela atualizando o modal
        const m = document.getElementById('modal-tef-terminal');
        if (m) m.remove();

        App.store.abrirModalSelecaoTerminalTEF(parseFloat(document.getElementById('mesa-pay-pix')?.value || document.getElementById('mesa-pay-credit')?.value || document.getElementById('mesa-pay-debit')?.value || App.store.fastCheckoutComanda.calc_total), tipo || 'credit');
    },

    configurarCredenciaisTEF: async () => {
        let currId = localStorage.getItem('naxio_tef_client_id_' + App.state.storeId) || '';
        let currSec = localStorage.getItem('naxio_tef_client_secret_' + App.state.storeId) || '';
        const currIP = localStorage.getItem('naxio_agent_ip') || 'localhost';
        const currPort = localStorage.getItem('naxio_agent_port') || '8081';

        App.utils.toast("Buscando senhas online...", "info");
        try {
            const { data } = await _sb.from('store_settings').select('setting_value').eq('store_id', App.state.storeId).eq('setting_key', 'tef_credentials').single();
            if (data && data.setting_value) {
                const creds = JSON.parse(data.setting_value);
                currId = creds.getnet_client_id || currId;
                currSec = creds.getnet_client_secret || currSec;
            }
        } catch (e) { }

        const modalHtml = `
            <div id="modal-tef-config" class="modal-overlay" style="display:flex; z-index:99999; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
                <div class="modal-content" style="max-width:500px; width:90%; background:#1e293b; color:white; padding:25px; border-radius:12px; border:2px solid #10b981; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <h3 style="margin-top:0; color:#34d399; text-align:center;">⚙️ Configuração TEF Ativo Getnet</h3>
                    <p style="color:#94a3b8; font-size:0.85rem; text-align:center; margin-bottom:20px;">
                        Estas configurações ficam salvas <strong>apenas neste computador/caixa</strong>.
                    </p>
                    
                    <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">
                        <label style="font-size:0.8rem; color:#94a3b8;">🔗 IP/Porta do Agente (Python Local)</label>
                        <div style="display:flex; gap:10px; margin-top:5px;">
                            <input type="text" id="cfg-ip" class="input-field" value="${currIP}" style="flex:2; background:#1e293b; color:#f8fafc; border:1px solid #475569;" placeholder="ex: localhost">
                            <input type="text" id="cfg-port" class="input-field" value="${currPort}" style="flex:1; background:#1e293b; color:#f8fafc; border:1px solid #475569;" placeholder="ex: 8081">
                        </div>
                    </div>

                    <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #334155;">
                        <label style="font-size:0.8rem; color:#94a3b8;">🔑 Credenciais API Nuvem (Loja Online: ${App.state.storeId})</label>
                        <input type="password" id="cfg-client-id" class="input-field" value="${currId}" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; margin-top:5px; margin-bottom:10px;" placeholder="Getnet CLIENT_ID">
                        <input type="password" id="cfg-client-sec" class="input-field" value="${currSec}" style="background:#1e293b; color:#f8fafc; border:1px solid #475569;" placeholder="Getnet CLIENT_SECRET">
                    </div>
                    
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-ghost btn-full" style="color:#f87171;" onclick="document.getElementById('modal-tef-config').remove()">
                            Cancelar
                        </button>
                        <button class="btn btn-success btn-full" onclick="App.store.salvarConfigTEF()">
                            <i class="ri-save-line"></i> Salvar e Reconectar
                        </button>
                    </div>
                </div>
            </div>`;

        const old = document.getElementById('modal-tef-config');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    salvarConfigTEF: async () => {
        const ip = document.getElementById('cfg-ip').value.trim() || 'localhost';
        const port = document.getElementById('cfg-port').value.trim() || '8081';
        const id = document.getElementById('cfg-client-id').value.trim();
        const sec = document.getElementById('cfg-client-sec').value.trim();

        localStorage.setItem('naxio_agent_ip', ip);
        localStorage.setItem('naxio_agent_port', port);

        App.utils.toast("Salvando senhas na nuvem...", "info");

        // Salva credenciais online amarradas à loja
        const tefConfigValue = JSON.stringify({ getnet_client_id: id, getnet_client_secret: sec });

        // Tenta fazer o update do secret no banco online supabase
        const { error } = await _sb.from('store_settings').upsert({
            store_id: App.state.storeId,
            setting_key: 'tef_credentials',
            setting_value: tefConfigValue
        }, { onConflict: 'store_id, setting_key' });

        if (error) {
            console.error("Erro salvando senhas TEF", error);
            // Fallback caso a tabela store_settings não exista etc
            localStorage.setItem('naxio_tef_client_id_' + App.state.storeId, id);
            localStorage.setItem('naxio_tef_client_secret_' + App.state.storeId, sec);
        }

        document.getElementById('modal-tef-config').remove();
        App.utils.toast("✅ Configurações salvas para este terminal!", "success");

        // Força reconexão
        if (App.store.wsConciliacao) {
            App.store.wsConciliacao.close();
            App.store.wsConciliacao = null;
        }
        App.store.iniciarWebSocketConciliacao();
    },

    enviarComandoPagamentoGetnet: async (valorEsperado, terminal_id, tipo) => {
        if (!App.store.wsConciliacao || App.store.wsConciliacao.readyState !== WebSocket.OPEN) {
            alert("Erro: Cérebro do PDV (naxio_agent.py) offline. Abra o prompt de comando e inicie-o.");
            return;
        }

        let clientId = localStorage.getItem('naxio_tef_client_id_' + App.state.storeId);
        let clientSecret = localStorage.getItem('naxio_tef_client_secret_' + App.state.storeId);

        // Tenta buscar da nuvem (Supabase) primeiramente
        try {
            const { data } = await _sb.from('store_settings').select('setting_value').eq('store_id', App.state.storeId).eq('setting_key', 'tef_credentials').single();
            if (data && data.setting_value) {
                const creds = JSON.parse(data.setting_value);
                clientId = creds.getnet_client_id;
                clientSecret = creds.getnet_client_secret;
            }
        } catch (e) { }

        if (!clientId || !clientSecret) {
            alert("⚠️ Credenciais da Getnet não configuradas. Clique em 'Configurar API (Getnet)' no painel TEF.");
            return;
        }

        App.utils.toast("Enviando valor para a Maquininha...", "info");

        const payload = {
            action: "enviar_pagamento_tef",
            comandaId: App.state.currentComanda,
            valorDesejado: valorEsperado,
            terminalId: terminal_id,
            tipoPagamento: tipo,
            client_id: clientId,
            client_secret: clientSecret
        };

        App.store.wsConciliacao.send(JSON.stringify(payload));
    },

    consultarGetnetRealtime: async (valorEsperado, terminal_id = null) => {
        if (!App.store.wsConciliacao || App.store.wsConciliacao.readyState !== WebSocket.OPEN) {
            alert("Erro: Sistema não está conectado ao backend local. Veja se o naxio_agent.py está rodando.");
            return;
        }

        let clientId = localStorage.getItem('naxio_tef_client_id_' + App.state.storeId);
        let clientSecret = localStorage.getItem('naxio_tef_client_secret_' + App.state.storeId);

        try {
            const { data } = await _sb.from('store_settings').select('setting_value').eq('store_id', App.state.storeId).eq('setting_key', 'tef_credentials').single();
            if (data && data.setting_value) {
                const creds = JSON.parse(data.setting_value);
                clientId = creds.getnet_client_id;
                clientSecret = creds.getnet_client_secret;
            }
        } catch (e) { }

        if (!clientId || !clientSecret) {
            alert("⚠️ Credenciais da Getnet não configuradas neste computador. Clique em 'Configurar API (Getnet)'.");
            return;
        }

        App.utils.toast("Consultando Getnet via API autenticada...", "info");

        const payload = {
            action: "consultar_getnet",
            comandaId: App.state.currentComanda,
            valorDesejado: valorEsperado,
            terminalId: terminal_id,
            client_id: clientId,
            client_secret: clientSecret
        };

        App.store.wsConciliacao.send(JSON.stringify(payload));
    },

    processarPagamentoLocalAposConciliacao: async (bandeira, valor) => {
        const nomeM = bandeira.toUpperCase();
        let metodoTraduzido = 'Crédito';
        if (nomeM === 'PIX') metodoTraduzido = 'Pix';
        else if (nomeM.includes('DEB') || nomeM.includes('DÉB')) metodoTraduzido = 'Débito';

        const isParcial = App.store.state.paymentMode === 'parcial';
        let itemsToPay = [];
        let itemsRemaining = [];

        if (isParcial) {
            App.state.currentComandaItems.forEach((item, idx) => {
                if (App.store.state.paymentSelection.includes(idx)) itemsToPay.push(item);
                else itemsRemaining.push(item);
            });
        } else {
            itemsToPay = [...App.state.currentComandaItems];
            itemsRemaining = [];
        }

        const mapaCodigos = { 'Dinheiro': '01', 'Pix': '17', 'Crédito': '03', 'Débito': '04' };
        const payments = [{
            method: metodoTraduzido,
            amount: valor,
            code: mapaCodigos[metodoTraduzido] || '99',
            val: valor
        }];

        await App.store.finalizarFechamentoComanda(payments, valor, itemsToPay, itemsRemaining, document.getElementById('pag-cpf')?.value || '', document.getElementById('pag-nome')?.value || '');
    },
    // --- FIM DA LÓGICA DE CONCILIAÇÃO ---

    // Finaliza comanda (Total ou Parcial)
    finalizarFechamentoComanda: async (payments, totalPago, itemsPagos, itemsRestantes, cpf, nome) => {
        const comandaId = App.state.currentComanda;

        App.utils.toast("Processando pagamento...", "info");

        // 1. Lógica Total vs Parcial
        const isTotal = itemsRestantes.length === 0;
        const novoStatus = isTotal ? 'fechada' : 'ocupada'; // Quando fecha total, ela some da tela principal

        const guiaComanda = App.store.state.currentGuia ? App.store.state.currentGuia.name : null;
        // Preparar Order Json
        const obsJson = JSON.stringify({
            mesa: App.state.currentMesaNum,
            vendedor: App.state.profile?.nome_completo || 'Sistema',
            tipo: isTotal ? 'Fechamento Total' : 'Pagamento Parcial',
            guia: guiaComanda,
            itens: itemsPagos
        });

        // Grava Order do Caixa
        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalPago,
            metodo_pagamento: payments[0].method,
            session_id: Caixa?.state?.session?.id,
            observacao: obsJson,
            payments_info: payments, // Ensure we save split payments here!
            cliente_nome: nome,
            cliente_cpf: cpf,
            created_at: new Date().toISOString()
        }).select().single();

        // 2. Atualiza Comanda (Limpa os itens se for total para liberar a mesa)
        const itemsToSave = isTotal ? [] : itemsRestantes;
        const savedPayments = isTotal ? [] : [...payments]; // Limpa pagamentos parciais se fechou tudo
        if (isTotal && newOrder) savedPayments.push({ _order_id: newOrder.id }); // Opcional: log do último pedido

        const { error } = await _sb.from('comandas').update({
            status: novoStatus,
            items: isTotal ? itemsPagos : itemsRestantes, // Mantém itens na 'fechada' para histórico
            payments_info: savedPayments,
            total_pago: isTotal ? totalPago : undefined,
            updated_at: new Date().toISOString()
        }).eq('id', comandaId);

        if (error) return alert("Erro ao atualizar comanda: " + error.message);

        // 4. Auditoria
        await App.store.audit.logAction(comandaId, isTotal ? "FECHAMENTO_TOTAL" : "PAGAMENTO_PARCIAL", "Pago R$ " + totalPago.toFixed(2) + " (" + itemsPagos.length + " itens)");

        // 5. Baixa Estoque (Somente itens pagos)
        if (itemsPagos.length > 0) {
            const contagem = {};
            itemsPagos.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + (p.qtd || 1); });
            const itensParaBaixar = Object.keys(contagem).map(prodId => ({ id: prodId, qtd: contagem[prodId] }));
            _sb.rpc('descontar_estoque', { itens: itensParaBaixar });
        }

        App.utils.toast("Pagamento Registrado com Sucesso!", "success");

        // 6. Atualiza UI Local
        if (isTotal) {
            const m1 = document.getElementById('comanda-modal-tabs');
            if (m1) m1.remove();
            const m2 = document.getElementById('modal-fechamento-mesa');
            if (m2) m2.remove();
        } else {
            // Atualiza estado local para continuar na mesa
            App.state.currentComandaItems = itemsRestantes;
            App.store.state.paymentSelection = []; // Limpa seleção
            App.store.setPaymentMode('total'); // Volta para modo normal
            // Re-renderiza abas com os itens que sobraram
            App.store.renderActiveTab(App.state.currentMesaNum, itemsRestantes);
        }

        App.store.loadComandas(); // Refresh Grid da Dashboard

        // 7. Fiscal (Opcional)
        if (await NaxioUI.confirm('Fiscal', "Recebido! Deseja emitir Nota Fiscal (NFC-e)?")) {
            const itensParaFiscal = await App.store.enriquecerItensComNCM(itemsPagos);

            // Payload fiscal de pagamentos
            const paymentsParaFiscal = payments.map(p => ({
                code: p.code,
                val: p.val,
                tipo: p.method,
                metodo: p.method,
                payment_method: p.method,
                valor: p.val,
                amount: p.amount,
                bandeira: p.bandeira,
                aut: p.aut,
                cnpj: p.cnpj,
                nsu: p.nsu
            }));

            App.fiscal.emitirNFCeComanda(newOrder.id, App.state.storeId, itensParaFiscal, paymentsParaFiscal, cpf, nome);
        }
    },

    // --- REALTIME DELETE (atualiza lista na hora, sem recarregar) ---
    removeItemFromComanda: async (itemId, obs) => {
        const norm = (v) => (v == null || v === '') ? '' : String(v);
        let items = [...App.state.currentComandaItems];

        // Busca todos os itens que batem com ID e Obs para saber o total disponível para exclusão
        const matchingItems = items.filter(i => norm(i.id || i.product_id) === norm(itemId) && norm(i.observacao) === norm(obs));
        if (matchingItems.length === 0) {
            App.utils.toast("Item não encontrado na lista.", "error");
            return;
        }

        const totalQtdDisponivel = matchingItems.reduce((acc, i) => acc + (parseFloat(i.qtd) || 1), 0);
        const itemNome = matchingItems[0].nome || 'Item';

        // 1. Perguntar quantos itens deseja excluir
        const qtdParaExcluirStr = await NaxioUI.prompt(
            '🗑️ Excluir Item',
            `Quantos(as) "${itemNome}" você deseja remover?`,
            totalQtdDisponivel.toString(),
            `Máximo disponível: ${totalQtdDisponivel}`,
            'number'
        );

        if (!qtdParaExcluirStr) return;
        const nExcluir = parseFloat(qtdParaExcluirStr);
        if (isNaN(nExcluir) || nExcluir <= 0) return;
        if (nExcluir > totalQtdDisponivel) {
            App.utils.toast(`Quantidade inválida. Máximo: ${totalQtdDisponivel}`, "error");
            return;
        }

        // 2. Pedir a senha (somente se a quantidade for válida)
        const senha = await NaxioUI.prompt('🔒 Autorização', 'Digite a senha do gerente para prosseguir:', '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }

        if (!await NaxioUI.confirm('Confirmação', `Deseja realmente excluir ${nExcluir} unidade(s) de "${itemNome}"?`)) return;

        // 3. Pedir o motivo
        const motivo = await NaxioUI.prompt('📝 Motivo', 'Por que você está removendo este item?', '', 'Ex: Cliente pediu errado', 'text');
        if (motivo === null) return;

        App.utils.toast("Processando exclusão...", "info");

        let remainingToRemove = nExcluir;
        let totalCancelado = 0;
        const newItemsList = [];

        // Faz a subtração dos itens no array original
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (norm(item.id || item.product_id) === norm(itemId) && norm(item.observacao) === norm(obs)) {
                const itemQtd = parseFloat(item.qtd) || 1;
                const price = parseFloat(item.price || item.preco || 0);

                if (remainingToRemove <= 0) {
                    newItemsList.push(item);
                } else if (remainingToRemove >= itemQtd) {
                    // Remove entrada inteira
                    remainingToRemove -= itemQtd;
                    totalCancelado += itemQtd * price;
                    // Não adiciona ao newItemsList
                } else {
                    // Remove parcial da entrada
                    const removedFromThis = remainingToRemove;
                    item.qtd = itemQtd - removedFromThis;
                    totalCancelado += removedFromThis * price;
                    remainingToRemove = 0;
                    newItemsList.push(item);
                }
            } else {
                newItemsList.push(item);
            }
        }

        const oldItems = [...App.state.currentComandaItems]; // Backup para erro
        App.state.currentComandaItems = newItemsList;
        App.store.renderEditList(App.state.currentMesaNum, newItemsList);
        App.store.calcularTotaisComTaxa();

        const user = App.state.profile?.nome_completo || App.state.user?.email || 'Sistema';

        // Registra o cancelamento no histórico (orders com status cancelado)
        await _sb.from('orders').insert({
            store_id: App.state.storeId,
            session_id: typeof Caixa !== 'undefined' && Caixa.state && Caixa.state.session ? Caixa.state.session.id : null,
            status: 'cancelado',
            origem_venda: 'cancelamento_item',
            total_pago: totalCancelado,
            observacao: `ITEM CANCELADO: ${nExcluir}x ${itemNome} (Mesa ${App.state.currentMesaNum}) | Vlr: R$ ${totalCancelado.toFixed(2)} | Motivo: ${motivo || 'Não informado'} | Por: ${user}`,
            created_at: new Date().toISOString()
        });

        const { error } = await _sb.from('comandas').update({
            items: newItemsList,
            updated_at: new Date().toISOString()
        }).eq('id', App.state.currentComanda);

        if (error) {
            App.state.currentComandaItems = oldItems;
            App.store.renderEditList(App.state.currentMesaNum, oldItems);
            App.store.calcularTotaisComTaxa();
            App.utils.toast("Erro ao remover: " + error.message, "error");
            return;
        }

        App.utils.toast(`Sucesso: ${nExcluir} item(ns) removidos!`, "success");
    },

    // 🔥 NOVA FUNÇÃO: TRANSFERIR MESA
    transferirMesa: async () => {
        const senha = await NaxioUI.prompt('🔒 Autorização', 'Digite a senha do gerente para prosseguir:', '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }
        const destino = await NaxioUI.prompt(
            '🔄 Transferir Mesa',
            'Para qual mesa deseja transferir TODOS os itens?',
            '',
            'Ex: 10',
            'number'
        );
        if (!destino) return;

        App.utils.toast("Transferindo...", "info");

        // 1. Busca mesa destino
        const { data: mesaDest } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('numero', destino).single();

        if (!mesaDest) {
            alert("Mesa destino não encontrada. Abra a mesa primeiro.");
            return;
        }

        // 2. Mescla itens
        const itensOrigem = App.state.currentComandaItems;
        const itensDestino = mesaDest.items || [];
        const novosItensDestino = [...itensDestino, ...itensOrigem];

        // 3. Atualiza Destino (Ocupa e soma itens)
        await _sb.from('comandas').update({
            status: 'ocupada',
            items: novosItensDestino
        }).eq('id', mesaDest.id);

        // 4. Limpa Origem (Libera)
        await _sb.from('comandas').update({
            status: 'livre',
            items: [],
            tipo_comanda: 'passante',
            guide_id: null,
            guide_name: null
        }).eq('id', App.state.currentComanda);

        App.utils.toast("Transferido da " + App.state.currentMesaNum + " para " + destino + "!", "success");
        // Tenta remover os modais possíveis
        if (document.getElementById('split-pay-modal')) document.getElementById('split-pay-modal').remove();
        if (document.getElementById('comanda-modal-tabs')) document.getElementById('comanda-modal-tabs').remove();

        App.store.loadComandas();
    },


    // 🔥 TRANSFERÊNCIA DE ITENS (PARCIAL)
    abrirModalTransferenciaItens: async () => {
        const senha = await NaxioUI.prompt('🔒 Autorização', 'Digite a senha do gerente para prosseguir com a transferência:', '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }

        const items = App.state.currentComandaItems || [];
        if (items.length === 0) return alert("Nenhum item para transferir.");

        window.transferSelection = []; // Reset seleção

        const itemsHtml = items.map((item, index) => {
            var obsHtml = item.observacao ? '<div style="font-size:0.8rem; color:#94a3b8;">' + item.observacao + '</div>' : '';
            return '<div onclick="App.store.toggleTransferItem(' + index + ', this)" ' +
                'style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #334155; cursor:pointer; transition:0.2s;" ' +
                'id="trans-item-' + index + '">' +
                '<div style="display:flex; gap:10px; align-items:center;">' +
                '<div class="check-circle" style="width:20px; height:20px; border-radius:50%; border:2px solid #64748b;"></div>' +
                '<div>' +
                '<strong>' + item.qtd + 'x ' + item.nome + '</strong>' +
                obsHtml +
                '</div>' +
                '</div>' +
                '<div style="font-weight:bold;">R$ ' + (item.price * item.qtd).toFixed(2) + '</div>' +
                '</div>';
        }).join('');

        const modalHtml =
            '<div id="modal-transferencia-itens" class="modal-overlay" style="display:flex; z-index:9600; align-items:center; justify-content:center;">' +
            '<div class="modal-content" style="width:90%; max-width:500px; background:#1e293b; color:#fff; display:flex; flex-direction:column; max-height:80vh;">' +
            '<div class="modal-header">' +
            '<h3>🔄 Transferir Itens Selecionados</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'modal-transferencia-itens\').remove()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body" style="overflow-y:auto; padding:0;">' +
            '<div style="background:#0f172a; padding:10px; text-align:center; color:#94a3b8; font-size:0.9rem;">' +
            'Toque nos itens que deseja mover para outra mesa' +
            '</div>' +
            itemsHtml +
            '</div>' +
            '<div class="modal-footer" style="display:flex; flex-direction:column; gap:10px;">' +
            '<input type="number" id="trans-mesa-destino" class="input-field" placeholder="Número da Mesa Destino" style="text-align:center; font-size:1.2rem;">' +
            '<button class="btn btn-primary btn-full" onclick="App.store.confirmarTransferenciaItens()">' +
            'CONFIRMAR TRANSFERÊNCIA' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<style>' +
            '.selected-trans .check-circle { background: #3b82f6; border-color: #3b82f6 !important; }' +
            '.selected-trans { background: #1e3a8a !important; }' +
            '</style>';

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    toggleTransferItem: (index, el) => {
        el.classList.toggle('selected-trans');
        const idx = window.transferSelection.indexOf(index);
        if (idx > -1) window.transferSelection.splice(idx, 1);
        else window.transferSelection.push(index);
    },

    confirmarTransferenciaItens: async () => {
        const destinoNum = document.getElementById('trans-mesa-destino').value;
        if (!destinoNum) return alert("Informe a mesa de destino.");

        const indices = window.transferSelection || [];
        if (indices.length === 0) return alert("Selecione pelo menos um item.");

        if (destinoNum == App.state.currentMesaNum) return alert("Mesa destino deve ser diferente.");

        App.utils.toast("Processando transferência...", "info");

        // 1. Busca Mesa Destino
        const { data: mesaDest } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('numero', destinoNum).single();
        if (!mesaDest) {
            return alert("Mesa destino não encontrada (deve estar cadastrada no mapa).");
        }

        // 2. Separa itens
        const allItems = [...App.state.currentComandaItems];
        const itensParaMover = [];
        const itensParaFicar = [];

        allItems.forEach((item, index) => {
            if (indices.includes(index)) itensParaMover.push(item);
            else itensParaFicar.push(item);
        });

        // 3. Atualiza Origem
        await _sb.from('comandas').update({
            items: itensParaFicar,
            updated_at: new Date().toISOString()
        }).eq('id', App.state.currentComanda);

        // 4. Atualiza Destino
        const itensDestino = mesaDest.items || [];
        const novosItensDestino = [...itensDestino, ...itensParaMover];

        await _sb.from('comandas').update({
            items: novosItensDestino,
            status: 'ocupada', // Garante que destino fica ocupada
            updated_at: new Date().toISOString()
        }).eq('id', mesaDest.id);

        // Log
        App.store.audit.logAction(App.state.currentComanda, "TRANSF_PARCIAL_SAIDA", "Transferido " + itensParaMover.length + " itens para mesa " + destinoNum);
        App.store.audit.logAction(mesaDest.id, "TRANSF_PARCIAL_ENTRADA", "Recebido " + itensParaMover.length + " itens da mesa " + App.state.currentMesaNum);

        App.utils.toast("Itens transferidos com sucesso!", "success");
        document.getElementById('modal-transferencia-itens').remove();

        // Atualiza UI atual
        App.state.currentComandaItems = itensParaFicar;
        App.store.renderActiveTab(App.state.currentMesaNum, itensParaFicar);
    },

    // 🔥 IMPRESSÃO TÉRMICA CORRIGIDA (ESCURA E COM 10%) - Agrupa mesmo produto numa linha
    imprimirConferenciaInternal: async (id) => {
        const items = App.state.currentComandaItems;
        const num = App.state.currentMesaNum;

        // Lê do estado global (controlado pelo toggle na tela de pagamento/pedido)
        let comTaxa = App.store.state.comTaxa;

        // Sobrescrita de Segurança: se for 300 ou interna, forçosamente remove os 10%
        if (num == 300 || num == '300') comTaxa = false;
        else if (comTaxa) {
            try {
                const { data: mesa } = await _sb.from('comandas').select('tipo_comanda').eq('id', id).single();
                if (mesa && mesa.tipo_comanda === 'interna') comTaxa = false;
            } catch (e) { }
        }

        const agrupados = {};
        let subtotal = 0;
        items.forEach(i => {
            const pid = i.id || i.product_id;
            const key = String(pid);
            const obs = (i.observacao || '').toString().trim();
            const qtd = parseFloat(i.qtd) || 1;
            const preco = parseFloat(i.price) || 0;
            if (!agrupados[key]) {
                agrupados[key] = { nome: i.nome || i.name || 'Item', observacoes: new Set(), garcom: i.garcom, qtd: 0, total: 0 };
            }
            if (obs) {
                agrupados[key].observacoes.add(obs);
            }
            agrupados[key].qtd += qtd;
            agrupados[key].total += preco * qtd;
            subtotal += preco * qtd;
        });

        const subtotalTaxavel = items.reduce((a, i) => i.isento_10 ? a : a + (parseFloat(i.price) * parseFloat(i.qtd)), 0);
        const taxa = comTaxa ? subtotalTaxavel * 0.10 : 0;
        const total = subtotal + taxa;

        let linhas = '';
        Object.values(agrupados).forEach(item => {
            const nomeSafe = (item.nome || 'Item').toString().toUpperCase();
            const obsArray = Array.from(item.observacoes);
            var obsLine = obsArray.length > 0 ? '<div style="font-size:12px;">(Obs: ' + obsArray.join(' / ') + ')</div>' : '';

            linhas += '<div style="margin-bottom:8px; border-bottom:1px dashed #000; padding-bottom:4px;">' +
                '<div style="font-weight:900; font-size:16px;">' + item.qtd + 'x ' + nomeSafe + '</div>' +
                obsLine +
                '<div style="display:flex; justify-content:space-between; font-weight:900;">' +
                '<span style="font-size:12px;">' + (item.garcom || 'Cx') + '</span>' +
                '<span style="font-size:16px;">R$ ' + item.total.toFixed(2) + '</span>' +
                '</div>' +
                '</div>';
        });

        const html =
            '<html>' +
            '<body style="font-family:\'Courier New\'; width:300px; color:#000 !important; font-weight:900;">' +
            '<div style="text-align:center; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:10px;">' +
            '<h2 style="margin:0; font-size:18px; font-weight:900;">' + ((App.state.currentStore && App.state.currentStore.nome_loja) || App.state.profile?.nome_loja || 'Nossa Loja') + '</h2>' +
            '<h2 style="margin:5px 0 0 0; font-weight:900;">MESA ' + num + '</h2>' +
            '<div style="font-weight:900;">CONFERENCIA</div>' +
            '<div style="font-size:12px; font-weight:bold;">' + new Date().toLocaleString() + '</div>' +
            '</div>' +
            linhas +
            '<div style="margin-top:10px; font-size:16px; font-weight:900;">' +
            '<div style="display:flex; justify-content:space-between;"><span>SUBTOTAL:</span><span>R$ ' + subtotal.toFixed(2) + '</span></div>' +
            (taxa > 0 ? '<div style="display:flex; justify-content:space-between;"><span>SERV (10%):</span><span>R$ ' + taxa.toFixed(2) + '</span></div>' : '') +
            '<div style="display:flex; justify-content:space-between; font-size:22px; border-top:2px solid #000; margin-top:5px; font-weight:900;">' +
            '<span>TOTAL:</span><span>R$ ' + total.toFixed(2) + '</span>' +
            '</div>' +
            '</div>' +
            '<br><br><br><br><br><br><br>.' +
            '</body>' +
            '</html>';

        // Usa iframe invisivel para imprimir
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(() => { iframe.contentWindow.print(); iframe.remove(); }, 500);
    },

    // --- MODAIS ADICIONAIS ---

    fecharComandaInternaManual: async () => {
        if (!confirm("Fechar como consumo interno (sem valor)?")) return;

        // 🔥 FIX REPOSIÇÃO: Registra order com os itens da interna ANTES de limpar
        const itensInternaMal = App.state.currentComandaItems || [];
        if (itensInternaMal.length > 0) {
            await _sb.from('orders').insert({
                store_id: App.state.storeId,
                session_id: (typeof Caixa !== 'undefined' && Caixa.state && Caixa.state.session) ? Caixa.state.session.id : null,
                status: 'concluido',
                origem_venda: 'consumo_interno',
                total_pago: 0,
                observacao: JSON.stringify({
                    mesa: App.state.currentMesaNum,
                    itens: itensInternaMal,
                    tipo: 'consumo_interno'
                }),
                created_at: new Date().toISOString()
            });
        }

        await _sb.from('comandas').update({
            status: 'livre',
            items: [],
            total_pago: 0,
            tipo_comanda: 'passante',
            obs_geral: null, // 🔥 Limpa tag do Caixa logado
            updated_at: new Date().toISOString()
        }).eq('id', App.state.currentComanda);

        App.utils.toast("Comanda interna fechada.", "success");
        document.getElementById('comanda-modal-tabs').remove();
        App.store.loadComandas();
    },

    abrirModalMisto: (total) => {
        // Usa o modal de checkout rápido mas configurado para a comanda atual
        // Mocka a fastCheckoutComanda para usar a lógica existente
        const guiaAtual = App.store.state.currentGuia;
        App.store.fastCheckoutComanda = {
            id: App.state.currentComanda,
            numero: App.state.currentMesaNum,
            items: App.state.currentComandaItems,
            calc_total: total,
            calc_taxa: total - (total / 1.1), // aprox
            guide_name: guiaAtual ? guiaAtual.name : null
        };
        App.store.abrirFechamentoMesa();
    },

    // --- FECHAMENTO E PAGAMENTO (CHECKOUT RÁPIDO) ---
    abrirFechamentoMesa: async () => {
        if (typeof Caixa === 'undefined' || !Caixa.state.session) {
            alert("🚫 CAIXA FECHADO\n\nAbra o caixa antes de receber valores.");
            return;
        }
        const comanda = App.store.fastCheckoutComanda;
        if (!comanda) return;

        // 🔥 VERIFICA SE É COMANDA INTERNA
        if (comanda.tipo_comanda === 'interna') {
            const confirma = await NaxioUI.confirm(
                '🏠 Fechar Comanda Interna',
                "Deseja fechar a comanda interna da Mesa " + comanda.numero + "?\n\nEsta comanda não gera vendas no caixa.",
                'Sim, Fechar',
                'Cancelar'
            );

            if (!confirma) return;

            // 🔥 FIX REPOSIÇÃO: Registra order com os itens da interna ANTES de limpar
            // Isso garante que o relatório de reposição contabilize os itens consumidos
            const itensInterna = comanda.items || [];
            if (itensInterna.length > 0) {
                await _sb.from('orders').insert({
                    store_id: App.state.storeId,
                    session_id: (typeof Caixa !== 'undefined' && Caixa.state && Caixa.state.session) ? Caixa.state.session.id : null,
                    status: 'concluido',
                    origem_venda: 'consumo_interno',
                    total_pago: 0,
                    observacao: JSON.stringify({
                        mesa: comanda.numero,
                        itens: itensInterna,
                        tipo: 'consumo_interno'
                    }),
                    created_at: new Date().toISOString()
                });
            }

            // Fecha direto sem pagamento
            await _sb.from('comandas').update({
                status: 'livre',
                items: [],
                total_pago: 0,
                payments_info: [],
                updated_at: new Date().toISOString()
            }).eq('id', comanda.id);

            App.utils.toast("Comanda interna fechada!", "success");

            // Fecha modal se estiver aberto
            const modal = document.getElementById('modal-fechamento-mesa');
            if (modal) modal.remove();

            if (App.store.loadComandas) App.store.loadComandas();
            if (App.store.loadMetrics) App.store.loadMetrics();

            return;
        }

        let itensHtml = '';
        if (comanda.items && comanda.items.length > 0) {
            const agrupadosCheckout = {};
            comanda.items.forEach(item => {
                const key = (item.id || item.product_id);
                const qtd = parseFloat(item.qtd) || 1;
                if (!agrupadosCheckout[key]) {
                    agrupadosCheckout[key] = { nome: item.nome || item.name || 'Item', qtd: 0, total: 0 };
                }
                agrupadosCheckout[key].qtd += qtd;
                agrupadosCheckout[key].total += (parseFloat(item.price) || 0) * qtd;
            });
            itensHtml = Object.values(agrupadosCheckout).map(g =>
                '<div style="display:flex; justify-content:space-between; border-bottom:1px solid #334155; padding:6px 0; color:#e2e8f0;">' +
                '<span>' + g.qtd + 'x ' + g.nome + '</span>' +
                '<strong style="color:#f1f5f9;">R$ ' + g.total.toFixed(2) + '</strong>' +
                '</div>'
            ).join('');
        } else {
            itensHtml = '<div style="color:#94a3b8; text-align:center;">Nenhum item lançado.</div>';
        }

        const totalConsumo = comanda.calc_total;
        App.state.fastCheckoutPayments = [];

        const modalHtml =
            '<div id="modal-fechamento-mesa" class="modal-overlay" style="display:flex; z-index:9999; align-items:center; justify-content:center;">' +
            '<div class="modal-content" style="max-width:900px; width:95%; min-height:500px; background:#1e293b !important; border:1px solid #334155; display:flex; flex-direction:column; border-radius:12px;">' +
            '<div class="modal-header" style="background:#0f172a; border-bottom:1px solid #334155; padding:15px 20px;">' +
            '<h3 style="color:#f1f5f9; margin:0; font-size:1.4rem;">🍽️ Fechamento Mesa ' + comanda.numero + '</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'modal-fechamento-mesa\').remove()">X Fechar</button>' +
            '</div>' +

            '<div class="modal-body" style="background:#1e293b !important; color:#f1f5f9; display:grid; grid-template-columns: 1fr 1fr; gap:20px; padding:20px; flex:1; overflow-y:auto;">' +

            '<!-- LADO ESQUERDO: RESUMO E NF -->' +
            '<div style="display:flex; flex-direction:column; gap:15px;">' +
            '<div style="flex:1; max-height:220px; overflow-y:auto; background:#0f172a !important; color:#f1f5f9 !important; padding:12px; border-radius:8px; border:1px solid #334155;">' +
            '<h5 style="margin-top:0; color:#94a3b8; font-size:0.85rem;">CONSUMO DETALHADO</h5>' +
            '<div style="color:#e2e8f0;">' + itensHtml + '</div>' +
            '</div>' +

            '<div style="text-align:right; padding:10px; background:#0f172a; border-radius:8px; border:1px solid #334155;">' +
            '<h1 style="color:var(--primary); margin:0; font-size:2rem;">Total: R$ ' + totalConsumo.toFixed(2) + '</h1>' +
            '</div>' +

            '<div style="background:#0f172a; padding:15px; border-radius:8px; border:1px solid #334155;">' +
            '<label style="font-size:0.85rem; color:#94a3b8; display:block; margin-bottom:10px; font-weight:bold;">📄 Nota Fiscal & Comprovante</label>' +
            '<div style="display:flex; gap:10px; margin-bottom:10px;">' +
            '<input type="text" id="mesa-cpf-nota" class="input-field" placeholder="CPF/CNPJ" style="flex:1; background:#1e293b; border-color:#334155; color:#f1f5f9;">' +
            '<input type="text" id="mesa-nome-nota" class="input-field" placeholder="Nome do Cliente" style="flex:2; background:#1e293b; border-color:#334155; color:#f1f5f9;">' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
            '<input type="checkbox" id="send-zap-mesa" style="width:18px; height:18px; cursor:pointer;">' +
            '<label for="send-zap-mesa" style="cursor:pointer; color:#f1f5f9; font-size:0.9rem;">Enviar comprovante no WhatsApp</label>' +
            '</div>' +
            '</div>' +
            '</div>' +

            '<!-- LADO DIREITO: PAGAMENTOS E DIVISÃO -->' +
            '<div style="display:flex; flex-direction:column; gap:15px;">' +
            '<div style="background:#0f172a; padding:10px; border-radius:8px; border:1px solid #334155; display:flex; gap:10px; align-items:center;">' +
            '<span style="color:#94a3b8; font-size:0.9rem;">👥 Dividir por:</span>' +
            '<input type="number" id="split-people" value="1" min="1" style="width:60px; text-align:center; background:#1e293b; border:1px solid #334155; color:#f1f5f9; padding:5px; border-radius:4px;" oninput="App.store.updateSplit(this.value, ' + totalConsumo + ')">' +
            '<span id="split-result" style="font-weight:bold; color:#4ade80; font-size:1.1rem;">= R$ ' + totalConsumo.toFixed(2) + '</span>' +
            '</div>' +

            '<!-- LANÇAMENTO (COMO FILA) -->' +
            '<div style="background:#0f172a; padding:15px; border-radius:8px; border:1px solid #334155; display:flex; flex-direction:column; gap:10px;">' +
            '<label style="color:#94a3b8; font-size:0.85rem; font-weight:bold;">📝 Lançar Pagamento Manualmente</label>' +
            '<div style="display:flex; gap:10px;">' +
            '<input type="number" id="mesa-pay-amount-temp" class="input-field" placeholder="R$ Valor" style="flex:1; background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '<select id="mesa-pay-method-temp" class="input-field" style="flex:1.5; background:#1e293b; color:#f1f5f9; border-color:#334155;" onchange="App.store.toggleSefazMesa()">' +
            '<option value="Dinheiro">💵 Dinheiro (din)</option>' +
            '<option value="Pix">💠 Pix</option>' +
            '<option value="Credit">💳 Crédito</option>' +
            '<option value="Debit">💳 Débito</option>' +
            '</select>' +
            '</div>' +

            '<!-- CAMPOS SEFAZ MANUAIS PARA CARTÃO E PIX -->' +
            '<div id="sefaz-mesa-fields" style="display:none; background:#1e293b; padding:12px; border-radius:8px; border:1px dashed #64748b;">' +
            '<label id="sefaz-mesa-title" style="color:#cbd5e1; font-size:0.8rem; display:block; margin-bottom:8px; font-weight:bold;">📄 DADOS DE PAGAMENTO (SEFAZ IN 87/25)</label>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px;">' +
            '<input type="text" id="mesa-pay-nsu" class="input-field" placeholder="NSU / E2E (Pix)" style="background:#0f172a; color:#fff;" title="NSU SEFAZ / E2E">' +
            '<input type="text" id="mesa-pay-aut" class="input-field" placeholder="AUT (Autorização)" style="background:#0f172a; color:#fff;" title="Cod Autorização">' +
            '<select id="mesa-pay-bandeira" class="input-field" style="background:#0f172a; color:#fff;">' +
            '<option value="VISA">VISA</option><option value="MASTER">MASTER</option><option value="ELO">ELO</option><option value="AMEX">AMEX</option><option value="ALELO">ALELO</option><option value="TICKET">TICKET</option>' +
            '</select>' +
            '<input type="text" id="mesa-pay-cnpj" class="input-field" value="10.440.482/0001-54" readonly title="CNPJ Getnet/Banco" style="background:#0f172a; color:#94a3b8;">' +
            '</div>' +
            '</div>' +

            '<button onclick="App.store.addFastSplit()" class="btn btn-primary btn-sm" style="margin-top:5px;">➕ Adicionar à Fila de Pagamentos</button>' +
            '</div>' +

            '<!-- FILA DE PAGAMENTOS (NOVA) -->' +
            '<div style="background:#0f172a; padding:10px; border-radius:8px; border:1px dashed #334155; margin-top:10px; min-height:80px; max-height:120px; overflow-y:auto;" id="mesa-pay-fila-list">' +
            '<div style="color:#64748b; font-size:0.8rem; text-align:center; margin-top:15px;">Ainda não há pagamentos na fila.</div>' +
            '</div>' +

            '<div class="pay-method-box" style="margin-top:15px; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#f87171;">🏷️ Aplicar Desconto Final</label>' +
            '<input type="number" id="mesa-pay-desconto" class="pay-input input-field" placeholder="0.00" oninput="App.store.calcRestanteMesa(' + totalConsumo + ')" style="background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '</div>' +
            '</div>' +

            '<div id="mesa-restante-box" style="margin-top:15px; padding:10px; text-align:center; font-weight:bold; background:#450a0a; color:#f87171; border-radius:6px; border:1px solid #7f1d1d;">' +
            'Falta: R$ ' + totalConsumo.toFixed(2) +
            '</div>' +
            '</div>' +

            '<div class="modal-footer" style="background:#0f172a; border-top:1px solid #334155;">' +
            '<button id="btn-confirma-mesa" class="btn btn-success btn-full" disabled onclick="App.store.confirmarFechamentoMesa()">✅ CONFIRMAR PAGAMENTO</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        const old = document.getElementById('modal-fechamento-mesa');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => {
            const el = document.getElementById('mesa-pay-amount-temp');
            if (el) el.focus();
        }, 100);
    },

    updateSplit: (qtd, total) => {
        const val = parseInt(qtd) || 1;
        const desc = parseFloat(document.getElementById('mesa-pay-desconto')?.value) || 0;
        const res = Math.max(0, total - desc) / val;
        const el = document.getElementById('split-result');
        if (el) el.innerText = "= R$ " + res.toFixed(2);
    },

    calcRestanteMesa: (total) => {
        // Atualiza a divisão ao mudar valores (ex: desconto)
        const qtdSplit = document.getElementById('split-people')?.value || 1;
        App.store.updateSplit(qtdSplit, total);

        const tempAmount = parseFloat(document.getElementById('mesa-pay-amount-temp')?.value) || 0;
        const desconto = parseFloat(document.getElementById('mesa-pay-desconto')?.value) || 0;

        let pago = (App.state.fastCheckoutPayments || []).reduce((acc, p) => acc + p.amount, 0);

        const restante = total - (pago + desconto);
        const box = document.getElementById('mesa-restante-box');
        const btn = document.getElementById('btn-confirma-mesa');

        if (restante > 0.01) {
            box.innerText = "Falta: R$ " + restante.toFixed(2);
            box.style.background = '#450a0a'; box.style.color = '#f87171'; box.style.border = '1px solid #7f1d1d';
            btn.disabled = true;
        } else {
            const troco = Math.abs(restante);
            box.innerText = restante < -0.01 ? "Troco: R$ " + troco.toFixed(2) : "Pagamento Correto ✅";
            box.style.background = '#064e3b'; box.style.color = '#34d399'; box.style.border = '1px solid #047857';
            btn.disabled = false;

            // Auto emitir nfce e fechar se o modo rápido (Ctrl+P div) estiver on
            if (App.state.autoNfceQuandoCheio) {
                setTimeout(() => {
                    const confirmBtn = document.getElementById('btn-confirma-mesa');
                    if (confirmBtn && !confirmBtn.disabled) {
                        App.utils.toast("Valor preenchido. Finalizando e emitindo NFC-e...");
                        App.store.confirmarFechamentoMesa();
                    }
                }, 1000);
            }
        }
    },

    toggleSefazMesa: () => {
        const method = document.getElementById('mesa-pay-method-temp').value;
        const sefazBox = document.getElementById('sefaz-mesa-fields');
        const bandBox = document.getElementById('mesa-pay-bandeira');

        if (sefazBox) {
            // Sefaz fields for Card and Pix, as requested
            sefazBox.style.display = (method === 'Credit' || method === 'Debit' || method === 'Pix') ? 'block' : 'none';
        }
        if (bandBox) {
            // Bandeira (Card Brand) should only be shown for Cards, not Pix
            bandBox.style.display = (method === 'Pix') ? 'none' : 'block';
        }
    },

    addFastSplit: async () => {
        const amount = parseFloat(document.getElementById('mesa-pay-amount-temp').value);
        if (!amount || amount <= 0) return NaxioUI.alert('Atenção', "Digite um valor válido", 'warning');

        // 🔥 TRAVA DE SEGURANÇA: Prevenir cobrança maior no cartão
        const comandaInfo = App.store.fastCheckoutComanda;
        if (comandaInfo) {
            const desconto = parseFloat(document.getElementById('mesa-pay-desconto')?.value) || 0;
            const pagoAtual = (App.state.fastCheckoutPayments || []).reduce((acc, p) => acc + p.amount, 0);
            const limite = (comandaInfo.calc_total - desconto) - pagoAtual;

            if (amount > (limite + 0.05)) {
                const methodTemp = document.getElementById('mesa-pay-method-temp').value;
                if (methodTemp !== 'Dinheiro') {
                    return NaxioUI.alert('🛑 Bloqueio', "O valor digitado (R$ " + amount.toFixed(2) + ") é MAIOR que o total restante (R$ " + limite.toFixed(2) + ").\n\nIsso evita cobranças a mais na comanda (trava de segurança).", 'error');
                } else {
                    if (!await NaxioUI.confirm('⚠️ Confirmação de Troco', "O valor em Dinheiro recebido (R$ " + amount.toFixed(2) + ") é maior que o valor da comanda (R$ " + limite.toFixed(2) + ").\n\nIsso irá gerar Troco. Confirma?")) {
                        return;
                    }
                }
            }
        }

        const method = document.getElementById('mesa-pay-method-temp').value;
        const isSefazRequired = method === 'Credit' || method === 'Debit' || method === 'Pix';

        const nsu = isSefazRequired ? document.getElementById('mesa-pay-nsu').value.trim() : '';
        const aut = isSefazRequired ? document.getElementById('mesa-pay-aut').value.trim() : '';
        const bandeira = isSefazRequired ? document.getElementById('mesa-pay-bandeira').value : '';
        const cnpj = isSefazRequired ? document.getElementById('mesa-pay-cnpj').value : '';

        if (isSefazRequired && (!nsu || !aut)) {
            if (!await NaxioUI.confirm('SEFAZ', "NSU ou AUT estão vazios. A SEFAZ exige estes campos. Deseja adicionar o item mesmo assim?")) return;
        }

        if (!App.state.fastCheckoutPayments) App.state.fastCheckoutPayments = [];

        App.state.fastCheckoutPayments.push({
            method: method,
            amount: amount,
            nsu: nsu,
            aut: aut,
            bandeira: bandeira,
            cnpj: cnpj
        });

        // Limpa pra prox
        document.getElementById('mesa-pay-amount-temp').value = '';
        if (document.getElementById('mesa-pay-nsu')) document.getElementById('mesa-pay-nsu').value = '';
        if (document.getElementById('mesa-pay-aut')) document.getElementById('mesa-pay-aut').value = '';

        App.store.renderFastSplitFila();
        const comanda = App.store.fastCheckoutComanda;
        if (comanda) App.store.calcRestanteMesa(comanda.calc_total);
    },

    removeFastSplit: (idx) => {
        if (App.state.fastCheckoutPayments) {
            App.state.fastCheckoutPayments.splice(idx, 1);
            App.store.renderFastSplitFila();
            const comanda = App.store.fastCheckoutComanda;
            if (comanda) App.store.calcRestanteMesa(comanda.calc_total);
        }
    },

    renderFastSplitFila: () => {
        const list = document.getElementById('mesa-pay-fila-list');
        if (!list) return;

        const pays = App.state.fastCheckoutPayments || [];
        if (pays.length === 0) {
            list.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; margin-top:15px;">Ainda não há pagamentos na fila.</div>';
            return;
        }

        list.innerHTML = pays.map((p, idx) => {
            let label = p.method === 'Credit' ? 'Crédito' : (p.method === 'Debit' ? 'Débito' : p.method);
            let cor = p.method === 'Pix' ? '#3b82f6' : (p.method === 'Dinheiro' ? '#10b981' : '#f59e0b');
            let infoCartao = (p.method === 'Credit' || p.method === 'Debit' || p.method === 'Pix') ? `<div style="font-size:0.75rem; color:#94a3b8; margin-top:3px;">${p.bandeira || ''} | NSU: ${p.nsu || '--'} | AUT: ${p.aut || '--'}</div>` : '';

            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #334155; background:#1e293b; border-radius:6px; margin-bottom:5px;">
                <div>
                    <div style="font-weight:bold; color:white;">R$ ${p.amount.toFixed(2)} <span style="color:${cor}; font-size:0.8rem; margin-left:5px;">${label}</span></div>
                    ${infoCartao}
                </div>
                <button class="btn btn-danger btn-sm" onclick="App.store.removeFastSplit(${idx})" style="padding:4px 8px;">X</button>
            </div>`;
        }).join('');
    },

    confirmarFechamentoMesa: async () => {
        if (App.store._isProcessingFechamento) return;
        App.store._isProcessingFechamento = true;
        const btnConfirma = document.getElementById('btn-confirma-mesa');
        if (btnConfirma) {
            btnConfirma.disabled = true;
            btnConfirma.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Processando...';
        }
        try {
            await App.store._confirmarFechamentoMesaImpl();
        } finally {
            App.store._isProcessingFechamento = false;
            const btnConfirmaReset = document.getElementById('btn-confirma-mesa');
            if (btnConfirmaReset) {
                btnConfirmaReset.disabled = false;
                btnConfirmaReset.innerHTML = '✅ CONFIRMAR PAGAMENTO';
            }
        }
    },

    _confirmarFechamentoMesaImpl: async () => {
        const comanda = App.store.fastCheckoutComanda;
        if (!comanda) return;

        // 🔥 VERIFICA NO BANCO SE A COMANDA JÁ FOI FECHADA (evita duplicidade por timeout/lentidão)
        const { data: comandaCheck } = await _sb.from('comandas').select('status').eq('id', comanda.id).single();
        if (comandaCheck && comandaCheck.status === 'fechada') {
            NaxioUI.alert('Aviso', 'Esta comanda já foi fechada e o pagamento já foi registrado.', 'warning');
            App.store.fastCheckoutComanda = null;
            document.getElementById('modal-fechamento-mesa')?.remove();
            return;
        }


        // Captura CPF e Nome
        const cpfNota = document.getElementById('mesa-cpf-nota').value.trim();
        let nomeNota = document.getElementById('mesa-nome-nota').value.trim();

        // 🔥 FIX NFC-e: Se CPF não foi informado, limpa o nome para evitar erro 'Validation failed: Element xNome...'
        if (!cpfNota) {
            nomeNota = null;
        }

        // 🔥 MAPEAMENTO DE CÓDIGOS FISCAIS
        const mapaCodigos = {
            'Dinheiro': '01',
            'Pix': '17',
            'Credit': '03',
            'Crédito': '03',
            'Debit': '04',
            'Débito': '04'
        };

        const sfzCnpj = document.getElementById('mesa-pay-cnpj') ? document.getElementById('mesa-pay-cnpj').value : '10440482000154'; // Getnet
        const sfzNsu = document.getElementById('mesa-pay-nsu') ? document.getElementById('mesa-pay-nsu').value.trim() : '';
        const sfzAut = document.getElementById('mesa-pay-aut') ? document.getElementById('mesa-pay-aut').value.trim() : '';
        const sfzBand = document.getElementById('mesa-pay-bandeira') ? document.getElementById('mesa-pay-bandeira').value : '';

        // If user manually filled amount but didn't click "Add", fetch it
        const pendingAmount = parseFloat(document.getElementById('mesa-pay-amount-temp')?.value) || 0;
        const pendingMethod = document.getElementById('mesa-pay-method-temp')?.value || '';

        let paymentsRaw = App.state.fastCheckoutPayments ? [...App.state.fastCheckoutPayments] : [];
        const desconto = parseFloat(document.getElementById('mesa-pay-desconto').value) || 0;
        const pagoAtual = paymentsRaw.reduce((acc, p) => acc + p.amount, 0);
        const limite = comanda.calc_total - desconto - pagoAtual;

        if (pendingAmount > 0 && pendingMethod) {
            // 🔥 TRAVA DE SEGURANÇA NA CONFIRMAÇÃO DIRETA
            if (pendingAmount > (limite + 0.05)) {
                if (pendingMethod !== 'Dinheiro') {
                    return NaxioUI.alert('🛑 Bloqueio de Segurança', "O valor pendente que você vai finalizar (R$ " + pendingAmount.toFixed(2) + ") é MAIOR que o total da comanda (R$ " + limite.toFixed(2) + ")!\n\nPor favor, corrija o valor, cartão não aceita troco.", 'error');
                } else {
                    if (!await NaxioUI.confirm('⚠️ Confirmação de Troco', "O valor em Dinheiro pendente (R$ " + pendingAmount.toFixed(2) + ") é maior que o valor da comanda (R$ " + limite.toFixed(2) + ").\n\nIsso irá gerar Troco. Confirma?")) {
                        return;
                    }
                }
            }

            const isSefazRequired = pendingMethod === 'Credit' || pendingMethod === 'Debit' || pendingMethod === 'Pix';
            paymentsRaw.push({
                method: pendingMethod,
                amount: pendingAmount,
                nsu: isSefazRequired ? sfzNsu : undefined,
                aut: isSefazRequired ? sfzAut : undefined,
                bandeira: isSefazRequired ? sfzBand : undefined,
                cnpj: isSefazRequired ? sfzCnpj : undefined
            });
        }

        // Se deu desconto total (100%), pode não ter payments
        if (paymentsRaw.length === 0 && desconto === 0) return NaxioUI.alert('Atenção', "Informe pagamento ou desconto.", 'warning');

        // 🔥 ESTRUTURA DUAL: {method, amount} + {code, val} AND SEFAZ
        const payments = paymentsRaw.map(p => ({
            method: p.method,
            amount: p.amount,
            code: mapaCodigos[p.method] || '99',
            val: p.amount,
            nsu: p.nsu,
            aut: p.aut,
            bandeira: p.bandeira,
            cnpj: p.cnpj
        }));

        document.getElementById('modal-fechamento-mesa').remove();
        App.utils.toast("Fechando mesa...", "info");

        const totalPago = payments.reduce((acc, p) => acc + p.amount, 0);

        // 1. Atualiza Comanda para FECHADA (Soma ao caixa e some da tela principal)
        const { error: errorComanda } = await _sb.from('comandas').update({
            status: 'fechada',
            items: comanda.items || [], // Mantém os itens para o relatório histórico
            total_pago: totalPago,
            payments_info: payments,
            obs_geral: null,
            updated_at: new Date().toISOString()
        }).eq('id', comanda.id);

        if (errorComanda) return NaxioUI.alert('Erro', "Erro ao fechar comanda: " + errorComanda.message, 'error');

        // 2. Cria Order COM RETORNO
        const guiaComandaFast = comanda.guide_name || (comanda.guides && comanda.guides.name) || (App.store.state.currentGuia ? App.store.state.currentGuia.name : null);
        const obsJson = JSON.stringify({
            mesa: comanda.numero,
            vendedor: App.state.profile?.nome_completo || 'Sistema',
            pagamentos: payments,
            desconto: desconto,
            guia: guiaComandaFast,
            itens: comanda.items || []
        });

        // 🔥 FIX: Valida session_id ANTES de inserir — se não houver sessão de caixa aberta,
        // a order não entra na contabilidade do caixa. Isso causava comandas no histórico
        // mas sem registro no caixa.
        const sessionId = (typeof Caixa !== 'undefined' && Caixa?.state?.session?.id) ? Caixa.state.session.id : null;
        if (!sessionId) {
            console.warn('⚠️ AVISO: Fechando comanda SEM sessão de caixa aberta! A venda não entrará na contabilidade do caixa.');
            App.utils.toast('⚠️ ATENÇÃO: Caixa não está aberto! Abra o caixa antes de fechar comandas para registrar corretamente.', 'warning');
        }

        const { data: newOrder, error: errorOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalPago, // Valor líquido recebido
            taxa_servico: comanda.calc_taxa || 0,
            observacao: obsJson,
            payments_info: payments, // 🔥 FIX: Salva detalhes de pagamento na order para o histórico do caixa
            session_id: sessionId,
            metodo_pagamento: payments.length > 1 ? 'Multiplos' : (payments[0]?.method || 'Desconto Total'),
            created_at: new Date().toISOString()
        }).select().single();

        if (errorOrder) {
            console.error("Erro ao gravar pedido no banco:", errorOrder);
            App.utils.toast("⚠️ Erro crítico ao registrar venda no banco: " + errorOrder.message + " — A comanda foi fechada mas a venda pode não ter sido registrada no caixa!", "error");
        }

        // 3. Baixa Estoque
        if (comanda.items && comanda.items.length > 0) {
            const contagem = {};
            comanda.items.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + (p.qtd || 1); });
            const itensParaBaixar = Object.keys(contagem).map(prodId => ({ id: prodId, qtd: contagem[prodId] }));
            _sb.rpc('descontar_estoque', { itens: itensParaBaixar });
        }

        App.utils.toast("Comanda " + comanda.numero + " Encerrada!", "success");
        if (Caixa && Caixa.calcTotals) await Caixa.calcTotals();

        // Limpa checkout rápido
        const elMesaNum = document.getElementById('checkout-mesa-num');
        if (elMesaNum) elMesaNum.value = '';
        const elResumo = document.getElementById('checkout-resumo');
        if (elResumo) elResumo.style.display = 'none';
        App.store.fastCheckoutComanda = null;

        // 🔥 Remove mesa do registro deste caixa (localStorage)
        const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
        localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds.filter(n => n != comanda.numero)));

        // 🔥 Vincula esta ordem à comanda (para permitir estorno automático na reabertura)
        if (newOrder) {
            const updatedPayments = payments.map(p => ({ ...p }));
            updatedPayments.push({ _order_id: newOrder.id });
            await _sb.from('comandas').update({ payments_info: updatedPayments }).eq('id', comanda.id);
        }

        // 🔥 Bypass throttle: deve atualizar grid IMEDIATAMENTE após fechar comanda
        App.store._loadThrottleBypass = true;
        App.store.loadComandas();

        // 4. 🔥 EMISSÃO FISCAL
        if (newOrder) {
            const itensParaFiscal = await App.store.enriquecerItensComNCM(comanda.items || []);
            const paymentsParaFiscal = payments.map(p => ({
                code: p.code,
                val: p.val,
                tipo: p.method,
                metodo: p.method,
                payment_method: p.method,
                valor: p.val,
                amount: p.amount,
                bandeira: p.bandeira,
                aut: p.aut,
                cnpj: p.cnpj,
                nsu: p.nsu
            }));

            setTimeout(async () => {
                const autoEmit = App.state.autoNfceQuandoCheio;
                if (autoEmit || await NaxioUI.confirm('Fiscal', "📄 Emitir NFC-e agora?")) {
                    App.fiscal.emitirNFCeComanda(
                        newOrder.id,
                        App.state.storeId,
                        itensParaFiscal,
                        paymentsParaFiscal,
                        cpfNota,
                        nomeNota,
                        { discount: desconto }
                    );
                    App.state.autoNfceQuandoCheio = false;
                }

                // --- WHATSAPP ---
                setTimeout(async () => {
                    const sendZap = document.getElementById('send-zap-mesa');
                    if (sendZap && sendZap.checked) {
                        const tel = await NaxioUI.prompt("WhatsApp", "📱 Digite o WhatsApp (com DDD):", "", "Ex: 85999999999");
                        if (tel) {
                            const itensTexto = (comanda.items || []).map(i => (i.qtd || 1) + "x " + (i.nome || 'Item') + " ").join('%0A');
                            const msg = "* MESA " + comanda.numero + " - FECHADA *%0A%0A" + itensTexto + "%0A%0ATotal: R$ " + totalPago.toFixed(2) + "%0A%0ASeu pedido foi um prazer!";
                            window.open("https://wa.me/" + tel.replace(/\\D/g, '') + "?text=" + msg, '_blank');
                        }
                    }
                }, 1000);
            }, 500);
        }
    },

    // --- FECHAMENTO VIA MODAL DE DETALHES ---
    fecharMesaViaModal: async () => {
        if (App.store._isProcessingFechamentoModal) return;
        App.store._isProcessingFechamentoModal = true;
        try {
            await App.store._fecharMesaViaModalImpl();
        } finally {
            App.store._isProcessingFechamentoModal = false;
        }
    },

    _fecharMesaViaModalImpl: async () => {
        if (typeof Caixa === 'undefined' || !Caixa.state.session) {
            NaxioUI.alert("🚫 CAIXA FECHADO", "Abra o caixa antes de receber valores.", 'warning');
            return;
        }

        const comandaId = App.state.currentComanda;
        const mesaNum = App.state.currentMesaNum;
        const items = App.state.currentComandaItems;

        if (!comandaId || !items) {
            NaxioUI.alert('Erro', "Erro: Dados da comanda não encontrados.", 'error');
            return;
        }

        // Busca comanda completa do banco
        const { data: comanda } = await _sb.from('comandas').select('*').eq('id', comandaId).single();
        if (!comanda) {
            NaxioUI.alert('Erro', "Erro ao buscar comanda.", 'error');
            return;
        }

        // 🔥 VERIFICA NO BANCO SE A COMANDA JÁ FOI FECHADA
        if (comanda.status === 'fechada') {
            NaxioUI.alert('Aviso', 'Esta comanda já foi fechada e registrada no caixa.', 'warning');
            document.getElementById('split-pay-modal')?.remove();
            return;
        }

        // Calcula totais
        const subtotal = items.reduce((acc, i) => acc + (i.price * i.qtd), 0);
        const cobrar10 = App.store.state.comTaxa;
        const subtotalTaxavel = items.reduce((a, i) => i.isento_10 ? a : a + (parseFloat(i.price) * parseFloat(i.qtd)), 0);
        const taxa = cobrar10 ? subtotalTaxavel * 0.10 : 0;
        const totalFinal = subtotal + taxa;

        // Solicita forma de pagamento
        const metodoPagamento = await NaxioUI.select(
            '💳 Forma de Pagamento',
            "Total: R$ " + totalFinal.toFixed(2) + "\n\nSelecione a forma de pagamento:",
            [
                { value: '1', label: 'Dinheiro', icon: 'ri-money-dollar-circle-line', description: 'Pagamento em espécie' },
                { value: '2', label: 'PIX', icon: 'ri-qr-code-line', description: 'Transferência instantânea' },
                { value: '3', label: 'Crédito', icon: 'ri-bank-card-2-line', description: 'Cartão de crédito' },
                { value: '4', label: 'Débito', icon: 'ri-bank-card-line', description: 'Cartão de débito' }
            ]
        );

        const mapaPagamentos = {
            '1': { method: 'Dinheiro', code: '01' },
            '2': { method: 'Pix', code: '17' },
            '3': { method: 'Crédito', code: '03' },
            '4': { method: 'Débito', code: '04' }
        };

        const pagamento = mapaPagamentos[metodoPagamento];
        if (!pagamento) {
            NaxioUI.alert('Atenção', "Forma de pagamento inválida.", 'warning');
            return;
        }

        const payments = [{
            method: pagamento.method,
            amount: totalFinal,
            code: pagamento.code,
            val: totalFinal
        }];

        // Fecha modal
        const modal = document.getElementById('split-pay-modal');
        if (modal) modal.remove();

        App.utils.toast("Fechando mesa...", "info");

        // 1. Atualiza Comanda
        const { error } = await _sb.from('comandas').update({
            status: 'fechada', // 🔥 Mantém como FECHADA para o relatório do Guia e reabertura
            // items: [],       // 🔥 Não limpa os itens
            total_pago: totalFinal,
            payments_info: payments,
            obs_geral: null, // 🔥 Limpa tag do Caixa logado
            updated_at: new Date().toISOString()
        }).eq('id', comandaId);

        if (error) return NaxioUI.alert('Erro', "Erro ao fechar: " + error.message, 'error');

        // 2. Cria Order COM RETORNO
        // 🔥 BUG FIX: Adicionado payments_info e validação de session_id (igual ao confirmarFechamentoMesa)
        const sessionIdModal = (typeof Caixa !== 'undefined' && Caixa?.state?.session?.id) ? Caixa.state.session.id : null;
        if (!sessionIdModal) {
            console.warn('⚠️ AVISO (fecharMesaViaModal): Fechando comanda SEM sessão de caixa aberta!');
            App.utils.toast('⚠️ Caixa não está aberto! Abra o caixa antes de fechar comandas.', 'warning');
        }
        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalFinal,
            taxa_servico: taxa,
            payments_info: payments, // 🔥 BUG FIX: estava omitido neste fluxo
            observacao: "Mesa " + mesaNum + " | Fechado por: " + (App.state.profile?.nome_completo || 'Sistema'),
            session_id: sessionIdModal,
            metodo_pagamento: pagamento.method,
            created_at: new Date().toISOString()
        }).select().single();

        // 🔥 Vincula esta ordem à comanda (para permitir estorno automático na reabertura)
        if (newOrder) {
            const updatedPayments = payments.map(p => ({ ...p }));
            updatedPayments.push({ _order_id: newOrder.id });
            await _sb.from('comandas').update({ payments_info: updatedPayments }).eq('id', comandaId);
        }

        // 3. Baixa Estoque
        if (items && items.length > 0) {
            const contagem = {};
            items.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + (p.qtd || 1); });
            const itensParaBaixar = Object.keys(contagem).map(prodId => ({ id: prodId, qtd: contagem[prodId] }));
            _sb.rpc('descontar_estoque', { itens: itensParaBaixar });
        }

        App.utils.toast("Mesa " + mesaNum + " Encerrada!", "success");
        if (Caixa && Caixa.calcTotals) await Caixa.calcTotals();
        App.store.loadComandas();

        // 4. 🔥 EMISSÃO FISCAL
        if (newOrder) {
            const itensParaFiscal = await App.store.enriquecerItensComNCM(items);
            const paymentsParaFiscal = payments.map(p => ({
                code: p.code,
                val: p.val,
                tipo: p.method,
                metodo: p.method,
                payment_method: p.method,
                valor: p.val,
                amount: p.amount
            }));

            console.log("📦 Payload Fiscal (Modal Detalhes):", {
                order_id: newOrder.id,
                store_id: App.state.storeId,
                items_payload: itensParaFiscal,
                payments_payload: paymentsParaFiscal
            });

            setTimeout(async () => {
                if (await NaxioUI.confirm('Fiscal', "📄 Emitir NFC-e agora?")) {
                    App.fiscal.emitirNFCeComanda(
                        newOrder.id,
                        App.state.storeId,
                        itensParaFiscal,
                        paymentsParaFiscal,
                        null, // CPF via modal detalhes ainda não implementado visualmente, passando null
                        null
                    );
                }

                // Fecha o modal inteiro para retornar ao painel principal
                const m = document.getElementById('comanda-modal-tabs');
                if (m) m.remove();
                App.state.currentComanda = null;
            }, 500);
        }
    },

    calcularTotaisComTaxa: () => {
        const items = App.state.currentComandaItems || [];
        const subtotal = items.reduce((acc, i) => acc + ((parseFloat(i.price) || 0) * (parseFloat(i.qtd) || 1)), 0);
        const subtotalTaxavel = items.reduce((a, b) => b.isento_10 ? a : a + ((parseFloat(b.price) || 0) * (parseFloat(b.qtd) || 1)), 0);
        const taxa = App.store.state.comTaxa ? subtotalTaxavel * 0.10 : 0;
        const total = subtotal + taxa;
        // Atualiza campos do modal de detalhe da mesa
        if (document.getElementById('modal-total-final'))
            document.getElementById('modal-total-final').innerText = "R$ " + total.toFixed(2);
        // Atualiza resumo lateral da aba pedidos
        if (document.getElementById('resumo-subtotal'))
            document.getElementById('resumo-subtotal').innerText = 'R$ ' + subtotal.toFixed(2);
        if (document.getElementById('resumo-taxa'))
            document.getElementById('resumo-taxa').innerText = 'R$ ' + taxa.toFixed(2);
        if (document.getElementById('resumo-total-final'))
            document.getElementById('resumo-total-final').innerText = 'R$ ' + total.toFixed(2);
    },

    // --- GERENCIAMENTO DE COMANDA ---
    manageComanda: async (id, itemsStr, numero, status, forceRender = false) => {
        // 🔥 FIX: Previne duplo-clique / abertura duplicada do modal
        // Se já há um modal aberto para ESTA mesma comanda, ignora o clique
        if (!forceRender && App.state.currentComanda === id && document.getElementById('comanda-modal-tabs')) {
            return;
        }

        try {
            const items = typeof itemsStr === 'string' ? JSON.parse(decodeURIComponent(itemsStr)) : (itemsStr || []);
            App.state.currentComanda = id;
            App.state.currentComandaItems = items;
            App.state.currentMesaNum = numero;

            if (status === 'livre') {
                // Mesa livre: Abre direto para lançar
                if (await NaxioUI.confirm('Comanda', "Abrir Comanda " + numero + "?")) {
                    const { error } = await _sb.from('comandas').update({
                        status: 'ocupada',
                        updated_at: new Date().toISOString()
                    }).eq('id', id);
                    if (error) return NaxioUI.alert('Erro', "Erro ao abrir mesa: " + error.message, 'error');

                    // 🔥 Registra esta mesa como pertencente a ESTE caixa (no localStorage)
                    const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
                    if (!mesasIds.includes(numero)) mesasIds.push(numero);
                    localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds));

                    // 🔥 Bypass throttle para refletir abertura imediatamente
                    App.store._loadThrottleBypass = true;
                    App.store.loadComandas(); // Atualiza visual
                    App.store.abrirModalLancarItem(); // Abre lançador
                }
            } else {
                // Mesa Ocupada: Auto-assume esta mesa para este caixa
                const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
                if (!mesasIds.includes(numero)) {
                    mesasIds.push(numero);
                    localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds));
                    App.utils.toast("Você assumiu a Comanda " + numero, "info");
                }

                // Mesa Ocupada: Abre Detalhes
                // 🔥 FIX: Fecha modal antigo SEMPRE antes de abrir novo (dados frescos)
                const modalOpen = document.getElementById('comanda-modal-tabs');
                if (!modalOpen || forceRender) {
                    // Remove modal antigo se existir (garante dados frescos ao trocar de comanda)
                    if (modalOpen) modalOpen.remove();
                    App.store.abrirDetalhesMesa(numero, items);
                } else {
                    // Se modal já está aberto para a mesma comanda, re-renderiza a aba ativa
                    App.store.renderActiveTab(numero, items);
                }
            }
        } catch (e) {
            console.error("Erro manageComanda:", e);
            NaxioUI.alert('Erro', "Erro ao gerenciar mesa.", 'error');
        }
    },

    // --- UI: NOVO MODAL DE DETALHES (TABBED INTERFACE) ---
    abrirDetalhesMesa: async (numero, items) => {
        const old = document.getElementById('comanda-modal-tabs');
        if (old) old.remove();

        // Inicializa estado
        App.store.state.activeTab = 'pedidos';
        App.store.state.currentGuia = null; // Limpa guia anterior

        const mesaFresca = await App.store.fetchMesaDetails(numero);
        if (mesaFresca) App.store.state.currentMesaStatus = mesaFresca.status;
        if (App.store.state._taxaPorComanda === undefined) App.store.state._taxaPorComanda = {};
        if (App.store.state._taxaPorComanda[numero] === undefined) {
            const MESAS_BALCAO_SEM_TAXA = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
            const ehBalcao = MESAS_BALCAO_SEM_TAXA.includes(String(numero)) || (mesaFresca && mesaFresca.tipo_comanda === 'interna');
            App.store.state.comTaxa = !ehBalcao;
        }

        const modalHtml =
            '<div id="comanda-modal-tabs" class="modal-overlay" style="display:flex; z-index:9000; align-items:center; justify-content:center;">' +
            '<div class="modal-content" style="width:95%; max-width:1000px; height:90vh; display:flex; flex-direction:column; background:#1e293b; color:#f1f5f9; border-radius:16px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">' +

            '<!-- HEADER & TABS -->' +
            '<div class="modal-header" style="background:#0f172a; padding:0; border-bottom:1px solid #334155; border-radius:16px 16px 0 0;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px;">' +
            '<div style="display:flex; align-items:center; gap:15px;">' +
            '<div style="background:#2563eb; color:white; width:50px; height:50px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:bold;">' +
            numero +
            '</div>' +
            '<div>' +
            '<h2 style="margin:0; font-size:1.2rem; display:flex; align-items:center; gap:8px;">Comanda ' + numero + 
            (mesaFresca && mesaFresca.status !== 'fechada' ? 
                '<button onclick="App.store.toggleLockComanda(\'' + mesaFresca.id + '\', \'' + numero + '\', ' + (mesaFresca.status === 'paga') + ')" class="btn btn-sm" title="Bloquear/Desbloquear Comanda" style="padding:0; border:none; background:transparent;">' +
                    '<i class="' + (mesaFresca.status === 'paga' ? 'ri-lock-fill text-danger' : 'ri-lock-unlock-line text-muted') + '" style="font-size:1.3rem; color:' + (mesaFresca.status === 'paga' ? '#ef4444' : '#94a3b8') + ';"></i>' +
                '</button>' : '') +
            '</h2>' +
            '<div style="font-size:0.85rem; color:#94a3b8;">' +
            'Status: <span style="color:#22c55e;">Ocupada</span> • ' +
            'Tempo: <span id="mesa-tempo-header">Calculando...</span>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-size:1.5rem; font-weight:bold; color:#4ade80;" id="mesa-total-header">R$ 0,00</div>' +
            '<small style="color:#64748b;">Total Parcial</small>' +
            '</div>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'comanda-modal-tabs\').remove()" style="margin-left:20px;">' +
            '<i class="ri-close-line" style="font-size:1.2rem;"></i>' +
            '</button>' +
            '</div>' +

            '<!-- TABS NAVIGATION -->' +
            '<div style="display:flex; gap:2px; padding:0 20px;">' +
            '<button class="tab-btn" onclick="App.store.switchTab(\'pedidos\')" id="tab-btn-pedidos">' +
            '<i class="ri-restaurant-line"></i> Pedidos' +
            '</button>' +
            '<button class="tab-btn" onclick="App.store.switchTab(\'pagamento\')" id="tab-btn-pagamento">' +
            '<i class="ri-wallet-3-line"></i> Pagamento' +
            '</button>' +
            '<button class="tab-btn" onclick="App.store.switchTab(\'info\')" id="tab-btn-info">' +
            '<i class="ri-information-line"></i> Info & Ações' +
            '</button>' +
            '</div>' +
            '</div>' +

            '<!-- BODY AREA -->' +
            '<div id="comanda-modal-body" class="modal-body" style="flex:1; overflow-y:auto; padding:20px; background:#1e293b;">' +
            '<!-- Conteúdo renderizado via JS -->' +
            '</div>' +

            '</div>' +
            '</div>' +

            '<style>' +
            '.tab-btn {' +
            'background: transparent;' +
            'border: none;' +
            'color: #94a3b8;' +
            'padding: 12px 20px;' +
            'cursor: pointer;' +
            'font-size: 1rem;' +
            'font-weight: 600;' +
            'border-bottom: 3px solid transparent;' +
            'transition: all 0.2s;' +
            'display: flex;' +
            'align-items: center;' +
            'gap: 8px;' +
            '}' +
            '.tab-btn:hover {color: #f1f5f9; background: #334155; border-radius: 8px 8px 0 0; }' +
            '.tab-btn.active {' +
            'color: #3b82f6;' +
            'border-bottom-color: #3b82f6;' +
            '}' +
            '.comanda-item-row {' +
            'display: flex; justify-content: space-between; align-items: center;' +
            'padding: 12px; border-bottom: 1px solid #334155;' +
            'transition: background 0.2s;' +
            '}' +
            '.comanda-item-row:hover {background: #0f172a; }' +
            '.action-card {' +
            'background: #0f172a; border: 1px solid #334155; padding: 20px; border-radius: 12px;' +
            'text-align: center; cursor: pointer; transition: transform 0.2s, border-color 0.2s;' +
            '}' +
            '.action-card:hover {transform: translateY(-3px); border-color: #3b82f6; }' +
            '</style>';

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // 🎯 Busca dados frescos da mesa (incluindo guia) ANTES de renderizar
        const mesa = mesaFresca;
        if (mesa) {
            const tempo = App.store.getTempoDecorrido(mesa.updated_at || mesa.created_at);
            const cor = App.store.getTempoColor(mesa.updated_at || mesa.created_at);
            const elTempo = document.getElementById('mesa-tempo-header');
            if (elTempo) {
                elTempo.innerText = tempo;
                elTempo.style.color = cor;
            }
        }

        // Renderiza após ter os dados do guia carregados
        App.store.renderActiveTab(numero, items);
    },

    fetchMesaDetails: async (num) => {
        let query = _sb.from('comandas').select('*');

        // Suporte para Lojista multi-loja
        if (Array.isArray(App.state.storeId)) {
            query = query.in('store_id', App.state.storeId);
        } else {
            query = query.eq('store_id', App.state.storeId);
        }

        const { data, error } = await query
            .eq('numero', num)
            .neq('status', 'fechada')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('fetchMesaDetails error:', error);
        }

        // 🎯 Armazena dados do guia usando campos diretos da comanda
        if (data && data.guide_name) {
            App.store.state.currentGuia = {
                name: data.guide_name,
                commission_percentage: data.guide_commission || 10
            };
        } else {
            App.store.state.currentGuia = null;
        }
        return data;
    },

    switchTab: (tabName) => {
        App.store.state.activeTab = tabName;
        // Atualiza UI das abas
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById("tab-btn-" + tabName).classList.add('active');
        // Renderiza conteúdo
        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    },

    renderActiveTab: (num, items) => {
        const container = document.getElementById('comanda-modal-body');
        if (!container) return; // Modal fechado

        // Atualiza Total Header sempre — usa o ESTADO (não o DOM, que pode não existir ainda)
        const total = items.reduce((acc, i) => acc + (i.price * (i.qtd || 1)), 0);
        const elTotal = document.getElementById('mesa-total-header');
        if (elTotal) {
            const final = App.store.state.comTaxa ? total * 1.1 : total;
            elTotal.innerText = "R$ " + final.toFixed(2);
        }

        const tab = App.store.state.activeTab;

        if (tab === 'pedidos') {
            App.store.renderTabPedidos(container, items);
        } else if (tab === 'pagamento') {
            App.store.renderTabPagamento(container, items, total);
        } else if (tab === 'info') {
            App.store.renderTabInfo(container, num);
        }
    },

    // --- LANÇAMENTO EM LOTE ---
    lancarProdutoLote: async () => {
        const inicio = parseInt(document.getElementById('lote-prod-inicio').value);
        const fim = parseInt(document.getElementById('lote-prod-fim').value);
        if (!inicio || !fim || inicio > fim) return NaxioUI.alert('Erro', "Intervalo inválido.", 'error');

        const busca = await NaxioUI.prompt(
            '🔍 Buscar Produto',
            'Digite o nome do produto para lançar:',
            '',
            'Ex: Picanha'
        );
        if (!busca) return;

        await App.store.garantirCacheProdutos();
        const produtos = window.produtosCache || [];
        const encontrados = produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()));
        if (encontrados.length === 0) return NaxioUI.alert('Atenção', "Produto não encontrado.", 'warning');

        let produto = encontrados[0];
        const qtd = 1;

        if (!await NaxioUI.confirm('Lançamento', "Lançar \"1x " + produto.nome + "\"(R$ " + produto.preco + ") nas mesas " + inicio + " a " + fim + "?")) return;

        App.utils.toast("Lançando...", "info");
        const { data: mesas } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .in('status', ['ocupada', 'aberta'])
            .gte('numero', inicio)
            .lte('numero', fim);

        if (!mesas || mesas.length === 0) return NaxioUI.alert('Ops', "Nenhuma mesa ABERTA encontrada neste intervalo.", 'warning');

        for (const mesa of mesas) {
            const items = mesa.items || [];
            items.push({
                id: produto.id,
                nome: produto.nome,
                price: parseFloat(produto.preco),
                qtd: qtd,
                garcom: 'Caixa',
                ncm: App.store.validarNCM(produto.ncm)
            });
            await _sb.from('comandas').update({ items, status: 'ocupada' }).eq('id', mesa.id);
        }

        App.utils.toast("Lançado em " + mesas.length + " mesas!", "success");
        App.store.loadComandas();
    },

    abrirLote: async () => {
        if (typeof Caixa === 'undefined' || !Caixa.state?.session) {
            return NaxioUI.alert('Atenção', 'Você precisa ABRIR O CAIXA antes de abrir mesas/comandas.', 'warning');
        }
        const inicio = parseInt(document.getElementById('lote-inicio').value);
        const fim = parseInt(document.getElementById('lote-fim').value);
        const tipo = document.querySelector('input[name="quick-tipo"]:checked').value;
        const selectGuia = document.getElementById('lote-guia');
        const guiaId = selectGuia.value;
        const guiaNome = guiaId && selectGuia.options[selectGuia.selectedIndex] ? selectGuia.options[selectGuia.selectedIndex].text.split(' -')[0] : null;
        if (!inicio || !fim || inicio > fim) return NaxioUI.alert('Erro', "Intervalo inválido.", 'error');
        if (fim - inicio > 200) return NaxioUI.alert('Atenção', "Máximo 200 mesas por vez.", 'warning');

        if (!await NaxioUI.confirm('Confirmação', `Abrir/Atualizar mesas ${inicio} a ${fim}?\n(Isso atribuirá o guia selecionado sem apagar pedidos existentes)`)) return;

        App.utils.toast("Processando mesas...", "info");

        // 1. Busca mesas existentes para preservar dados
        const { data: existingTables } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .gte('numero', inicio)
            .lte('numero', fim);

        const existingMap = {};
        if (existingTables) {
            existingTables.forEach(t => { existingMap[t.numero] = t; });
        }

        const mesasAtualizar = [];
        const mesasNova = [];

        for (let i = inicio; i <= fim; i++) {
            let tagCaixa = null;
            if (typeof Caixa !== 'undefined' && Caixa.state?.session?.nome) {
                tagCaixa = `[_CX_${Caixa.state.session.nome}_]`;
            }

            const existing = existingMap[i];

            if (existing) {
                // Se já existe E está fechada = novo dia, reseta como livre
                // Se está ocupada/aberta, PRESERVA os itens (não apaga pedidos em andamento)
                if (existing.status === 'fechada') {
                    mesasAtualizar.push({
                        ...existing,
                        status: 'livre',
                        items: [],
                        total_pago: 0,
                        payments_info: null,
                        obs_geral: null,
                        tipo_comanda: tipo,
                        guide_id: guiaId === 'REMOVER' ? null : (guiaId || null),
                        guide_name: guiaId === 'REMOVER' ? null : (guiaNome || null),
                        updated_at: new Date().toISOString()
                    });
                } else {
                    // Ocupada/aberta: atualiza tipo e guia se ele estiver vazio ou se for REMOVER
                    // PRESERVA o guia atual da mesa se ela já estiver sendo usada (evita troca acidental)
                    mesasAtualizar.push({
                        ...existing,
                        tipo_comanda: tipo,
                        guide_id: guiaId === 'REMOVER' ? null : (guiaId || existing.guide_id || null),
                        guide_name: guiaId === 'REMOVER' ? null : (guiaNome || existing.guide_name || null)
                    });
                }
            } else {
                // Se é nova, cria zerada
                mesasNova.push({
                    store_id: App.state.storeId,
                    numero: i,
                    status: 'livre',
                    tipo_comanda: tipo,
                    guide_id: guiaId === 'REMOVER' ? null : (guiaId || null),
                    guide_name: guiaId === 'REMOVER' ? null : (guiaNome || null),
                    obs_geral: tagCaixa, // Associa a comanda a este caixa
                    items: []
                });
            }
        }

        if (mesasAtualizar.length > 0) {
            await _sb.from('comandas').upsert(mesasAtualizar, { onConflict: 'store_id,numero' });
        }
        if (mesasNova.length > 0) {
            await _sb.from('comandas').upsert(mesasNova, { onConflict: 'store_id,numero' });
        }

        App.utils.toast("Mesas atualizadas!", "success");
        App.store.loadComandas();
    },

    // --- FILTROS E LOADS ---
    filtrar: (t, b) => {
        App.store.comandaFilters.active = t;
        document.querySelectorAll('.filtro-comanda').forEach(x => x.classList.remove('active'));
        if (b) b.classList.add('active');
        if (t === 'fechada') {
            document.getElementById('comandas-fechadas-area').style.display = 'block';
            document.getElementById('comandas-advanced-grid').style.display = 'none';
        } else {
            document.getElementById('comandas-fechadas-area').style.display = 'none';
            document.getElementById('comandas-advanced-grid').style.display = 'grid';
            App.store.loadComandas();
        }
    },

    _loadThrottle: null,
    _loadThrottleBypass: false, // 🔥 Flag para bypass do throttle após fechar comanda
    loadComandas: async (filtroManual = null) => {
        // Anti-spam throttle: evita múltiplas chamadas seguidas
        // Mas permite bypass imediato após fechar comanda
        if (App.store._loadThrottle && !App.store._loadThrottleBypass) return;
        App.store._loadThrottleBypass = false;
        if (App.store._loadThrottle) clearTimeout(App.store._loadThrottle);
        App.store._loadThrottle = setTimeout(() => App.store._loadThrottle = null, 800);

        const grid = document.getElementById('comandas-advanced-grid');
        if (!grid) return;

        const filtro = filtroManual || App.store.comandaFilters.active;

        // 🔥 CARREGA DO CACHE IMEDIATAMENTE enquanto busca dados frescos
        const cached = localStorage.getItem('CACHE_COMANDAS_' + App.state.storeId);
        if (cached && grid.innerHTML.includes('Nenhuma') || grid.innerHTML === '') {
            try {
                const cachedData = JSON.parse(cached);
                if (cachedData && cachedData.length > 0) {
                    grid.innerHTML = cachedData.map(c => App.store.generateComandaHTML(c)).join('');
                }
            } catch (e) { }
        }

        // 🔥 TIMEOUT DE SEGURANÇA: Se demorar mais de 15s, usa o cache e avisa
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            console.warn('⚠️ loadComandas: timeout atingido, usando cache');
            const fallback = localStorage.getItem('CACHE_COMANDAS_' + App.state.storeId);
            if (fallback) {
                try {
                    const fallbackData = JSON.parse(fallback);
                    if (fallbackData && fallbackData.length > 0) {
                        grid.innerHTML = fallbackData.map(c => App.store.generateComandaHTML(c)).join('');
                        App.utils.toast('⚠️ Conexão lenta. Exibindo dados em cache.', 'warning');
                    }
                } catch (e) { }
            }
        }, 15000);

        try {
            // Query otimizada: busca apenas colunas essenciais para o grid (sem payload de itens completo)
            // Nota: items é necessário para calcular total nos cards
            let query = _sb.from('comandas').select('id, numero, status, tipo_comanda, items, guide_name, updated_at, created_at, obs_geral');

            // Suporte para Lojista multi-loja
            if (Array.isArray(App.state.storeId)) {
                query = query.in('store_id', App.state.storeId);
            } else {
                query = query.eq('store_id', App.state.storeId);
            }

            query = query.order('numero');

            // Aplica filtro no banco (mais eficiente que filtrar no JS)
            if (filtro === 'ocupada') {
                query = query.in('status', ['ocupada', 'aberta', 'pagando']);
            } else if (filtro === 'livre') {
                query = query.eq('status', 'livre');
            } else if (filtro !== 'fechada') {
                // 'todas' = tudo exceto fechadas
                query = query.neq('status', 'fechada');
            } else {
                // 'fechada'
                query = query.eq('status', 'fechada');
            }

            const { data, error } = await query;

            // Se já deu timeout, não atualiza mais a tela
            if (timedOut) return;
            clearTimeout(timeoutId);

            if (error) {
                console.error('Erro ao carregar comandas:', error);
                // Fallback Offline — cache já foi exibido acima
                if (!cached) {
                    grid.innerHTML = '<div style="padding:20px; color:#ef4444; text-align:center;">Erro ao carregar comandas. Verifique sua conexão.</div>';
                }
                return;
            }

            if (!data || data.length === 0) {
                grid.innerHTML = '<div style="padding:40px; color:#94a3b8; text-align:center; font-size:1.1rem;">Nenhuma comanda encontrada.<br><small style=\'color:#64748b\'>Para criar comandas, use o painel lateral → Abrir Comandas.</small></div>';
                return;
            }

            // Persiste cache e atualiza grid
            localStorage.setItem('CACHE_COMANDAS_' + App.state.storeId, JSON.stringify(data));
            grid.innerHTML = data.map(c => App.store.generateComandaHTML(c)).join('');
        } catch (err) {
            clearTimeout(timeoutId);
            if (!timedOut) {
                console.error('Erro crítico loadComandas:', err);
                App.utils.toast('Erro ao atualizar mesas. Dados em cache.', 'error');
            }
        }
    },

    generateComandaHTML: (c) => {
        // Mesa Livre: status 'livre' ou 'aberta' sem itens lançados
        const isLivre = c.status === 'livre' || (c.status === 'aberta' && (!c.items || c.items.length === 0));

        // Robustez: aceita 'interna', 'mesa' ou vazio como mesa. Considera apenas 'passante' ou 'balcao' como comanda passante.
        const tipoLower = (c.tipo_comanda || '').toLowerCase();
        const isMesaInterna = tipoLower === 'interna' || tipoLower === 'mesa' || tipoLower === '' || !c.tipo_comanda;

        // Cores distintas por tipo: mesa interna (azul), passante (âmbar), livre (verde)
        let borderCol, bgCol, labelTag;
        if (isLivre && c.status !== 'ocupada') {
            borderCol = '#22c55e'; bgCol = '#dcfce7'; labelTag = '';
        } else if (isMesaInterna) {
            borderCol = '#3b82f6'; bgCol = '#dbeafe';
            labelTag = '<div style="position:absolute;top:3px;left:3px;font-size:8px;background:#1d4ed8;color:#fff;padding:1px 5px;border-radius:4px;font-weight:bold;">📋 COMANDA</div>';
        } else {
            borderCol = '#f59e0b'; bgCol = '#fef3c7';
            labelTag = '<div style="position:absolute;top:3px;left:3px;font-size:8px;background:#b45309;color:#fff;padding:1px 5px;border-radius:4px;font-weight:bold;">📋 COMANDA</div>';
        }

        const style = `border-color:${borderCol}; background:${bgCol};`;
        const statusTxt = c.status === 'livre' ? 'LIVRE' : (c.status === 'reservada' ? 'RESERVADA' : 'OCUPADA');
        const total = c.items?.reduce((a, b) => a + (b.price * b.qtd), 0) || 0;
        const guide = c.guide_name ? c.guide_name : '';

        // Safe items string
        const itemsSafe = encodeURIComponent(JSON.stringify(c.items || []));

        return '<div id="comanda-card-' + c.id + '" onclick="App.store.manageComanda(\'' + c.id + '\', \'' + itemsSafe + '\', \'' + c.numero + '\', \'' + (isLivre ? 'livre' : 'ocupada') + '\')"' +
            ' style="border:2px solid; border-radius:10px; padding:10px; cursor:pointer; text-align:center; position:relative; ' + style + ' user-select:none; transition:transform 0.1s;"' +
            ' onmousedown="this.style.transform=\'scale(0.95)\'" onmouseup="this.style.transform=\'scale(1)\'">' +
            labelTag +
            (guide ? '<div style="position:absolute; top:5px; right:5px; font-size:10px; background:#000; color:#fff; padding:2px 4px; border-radius:4px;">' + guide + '</div>' : '') +
            // Botão X para limpar individualmente (apenas se estiver livre para evitar acidentes)
            (isLivre ? '<div onclick="App.store.limparComandaUnica(event, \'' + c.id + '\', \'' + c.numero + '\')" ' +
                'style="position:absolute; top:-8px; right:-8px; background:#ef4444; color:white; width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); z-index:5; border:2px solid #fff;">' +
                '<i class="ri-close-line"></i>' +
                '</div>' : '') +
            '<div style="font-size:1.8rem; font-weight:bold; color:#1e293b; margin-top:' + (!isLivre ? '14' : '0') + 'px;">' + c.numero + '</div>' +
            '<div style="font-size:0.8rem; font-weight:bold; color:#374151;">' + statusTxt + '</div>' +
            (!isLivre ? '<div style="margin-top:5px; font-weight:bold; color:#334155;">R$ ' + total.toFixed(2) + '</div>' : '') +
            '</div>';
    },

    updateSingleComandaDOM: (c) => {
        const el = document.getElementById(`comanda-card-${c.id}`);
        if (!el) {
            // Se não existe e o filtro atual permite, recarrega a lista
            const filtro = App.store.comandaFilters.active;
            const matchStatus = filtro === 'todas' ||
                (filtro === 'ocupada' && ['ocupada', 'aberta', 'pagando'].includes(c.status)) ||
                (filtro === 'livre' && c.status === 'livre');

            if (matchStatus) {
                App.store._loadThrottleBypass = true;
                App.store.loadComandas();
            }
            return;
        }

        // Se for fechada, remove do DOM e força refresh para mostrar estado correto
        if (c.status === 'fechada' || c.status === 'arquivada') {
            el.remove();
            // 🔥 Bypass throttle para garantir que o grid reflita o fechamento imediatamente
            App.store._loadThrottleBypass = true;
            App.store.loadComandas();
            return;
        }

        // 🔥 FIX: Substitui o elemento inteiro para preservar TODOS os events (onclick, onmousedown, onmouseup)
        // Isso evita que o card fique travado sem responder ao clique após update via realtime
        const temp = document.createElement('div');
        temp.innerHTML = App.store.generateComandaHTML(c);
        const newEl = temp.firstElementChild;

        if (newEl && el.parentNode) {
            el.parentNode.replaceChild(newEl, el);
        }
    },

    filterHistory: async () => {
        const dateStr = document.getElementById('filtro-data-fechadas').value;
        const container = document.getElementById('lista-fechadas-resultado');
        container.innerHTML = '<div style="padding:15px; text-align:center; color:#94a3b8;">Carregando...</div>';

        // 🔥 FIX TIMEZONE: Usar toISOString() que já compensa o fuso do navegador (Brasília GMT-3)
        // Se dateStr é 2026-04-24, o dInicio será 2026-04-24T03:00:00Z (UTC)
        const dInicio = new Date(dateStr + 'T00:00:00').toISOString();
        const dFim = new Date(dateStr + 'T23:59:59').toISOString();

        // Busca mesas normais fechadas
        const { data: dataFechadas } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('status', 'fechada')
            .gte('updated_at', dInicio)
            .lte('updated_at', dFim)
            .order('numero');

        // 🔥 Busca mesas internas que foram limpas (livre) no mesmo dia
        const { data: dataInternas } = await _sb.from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('tipo_comanda', 'interna')
            .in('status', ['livre', 'ocupada'])
            .gte('updated_at', dInicio)
            .lte('updated_at', dFim)
            .order('numero');

        const data = dataFechadas || [];
        const internas = (dataInternas || []).filter(i => !data.some(d => d.id === i.id));

        if (data.length === 0 && internas.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nenhuma venda encontrada nesta data.</p>';
            return;
        }

        const makeRow = (c, isInterna = false) => {
            let orderButton = '';
            try {
                const pi = typeof c.payments_info === 'string' ? JSON.parse(c.payments_info) : c.payments_info;
                const orderId = pi?.find(p => p._order_id)?._order_id;
                if (orderId) {
                    orderButton = `<button class="btn btn-sm btn-danger" onclick="App.autopecas.cancelSale('${orderId}')" title="Cancelar Venda Financeira"><i class="ri-close-line"></i></button>`;
                }
            } catch (e) { }

            const tipoTag = isInterna
                ? '<span style="font-size:0.7rem; background:#7c3aed; color:#fff; padding:2px 5px; border-radius:4px; margin-left:4px;">INTERNA</span>'
                : '';

            return '<tr style="border-bottom:1px solid #334155;">' +
                '<td style="padding:8px;">' + c.numero + tipoTag + '</td>' +
                '<td style="padding:8px;">' + (c.guide_name || (isInterna ? 'Consumo Interno' : '-')) + '</td>' +
                '<td style="padding:8px; font-weight:bold;">' + (isInterna ? '<span style="color:#94a3b8; font-size:0.85rem;">Consumo</span>' : 'R$ ' + (c.total_pago || 0).toFixed(2)) + '</td>' +
                '<td style="padding:8px;">' + new Date(c.updated_at).toLocaleTimeString().slice(0, 5) + '</td>' +
                '<td style="padding:8px; display:flex; gap:5px; flex-wrap:wrap;">' +
                (isInterna
                    ? '<button class="btn btn-sm btn-info" onclick="App.store.imprimirConferenciaInternal(\'' + c.id + '\')" title="Reimprimir Comanda"><i class="ri-printer-line"></i> Reimprimir</button>' +
                      '<button class="btn btn-sm btn-warning" onclick="App.store.reabrirMesaInterna(\'' + c.id + '\', \'' + c.numero + '\')"><i class="ri-refresh-line"></i> Reabrir</button>'
                    : '<button class="btn btn-sm btn-info" onclick="App.store.imprimirConferenciaInternal(\'' + c.id + '\')" title="Reimprimir Comanda"><i class="ri-printer-line"></i> Reimprimir</button>' +
                      '<button class="btn btn-sm btn-outline-secondary" onclick="App.store.exportarFaturaPDF(\'' + c.id + '\')"><i class="ri-file-pdf-line"></i> Fatura</button>' +
                      '<button class="btn btn-sm btn-primary" onclick="App.store.reabrirComanda(\'' + c.id + '\')">Reabrir</button>'
                ) +
                orderButton +
                '</td>' +
                '</tr>';
        };

        let tableHtml = '<table style="width:100%; font-size:0.9rem; border-collapse:collapse;">' +
            '<thead>' +
            '<tr style="background:#1e293b; color:#94a3b8; text-align:left;">' +
            '<th style="padding:8px;">Mesa</th>' +
            '<th style="padding:8px;">Guia</th>' +
            '<th style="padding:8px;">Total</th>' +
            '<th style="padding:8px;">Hora</th>' +
            '<th style="padding:8px;">Ações</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody>';

        if (data.length > 0) {
            tableHtml += '<tr><td colspan="5" style="padding:6px 8px; background:#0f172a; color:#64748b; font-size:0.8rem; font-weight:bold;">📋 MESAS FECHADAS (' + data.length + ')</td></tr>';
            tableHtml += data.map(c => makeRow(c, false)).join('');
        }

        if (internas.length > 0) {
            tableHtml += '<tr><td colspan="5" style="padding:6px 8px; background:#0f172a; color:#7c3aed; font-size:0.8rem; font-weight:bold;">🏠 MESAS INTERNAS — Reabertura disponível em caso de erro (' + internas.length + ')</td></tr>';
            tableHtml += internas.map(c => makeRow(c, true)).join('');
        }

        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;
    },

    exportarFaturaPDF: async (id) => {
        const { data: comanda } = await _sb.from('comandas').select('*').eq('id', id).single();
        if (!comanda) return alert("Comanda não encontrada");

        const loja = App.state.currentStore?.nome_loja || "Estabelecimento";
        const dateStr = new Date(comanda.updated_at || comanda.created_at).toLocaleString('pt-BR');

        let lines = '';
        if (comanda.items && comanda.items.length > 0) {
            lines = comanda.items.map(i => `
                <tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px 0; text-align:center;">${i.qtd}x</td>
                    <td style="padding:8px 0;">${i.nome} ${i.observacao ? '<br><small style="color:#666;">' + i.observacao + '</small>' : ''}</td>
                    <td style="padding:8px 0; text-align:right;">R$ ${parseFloat(i.price).toFixed(2)}</td>
                    <td style="padding:8px 0; text-align:right;">R$ ${(parseFloat(i.price) * parseFloat(i.qtd)).toFixed(2)}</td>
                </tr>
            `).join('');
        } else {
            lines = '<tr><td colspan="4" style="text-align:center; padding:10px;">Sem itens detalhados armazenados.</td></tr>';
        }

        let paymentsHtml = '';
        if (comanda.payments_info && comanda.payments_info.length > 0) {
            paymentsHtml = comanda.payments_info.filter(p => p.method || p.tipo).map(p =>
                `<tr><td colspan="3" style="text-align:right; padding:4px;">${p.method || p.tipo}:</td><td style="text-align:right; font-weight:bold;">R$ ${parseFloat(p.amount || p.val || 0).toFixed(2)}</td></tr>`
            ).join('');
        }

        const htmlPdf = `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
        <title>Fatura_Mesa_${comanda.numero}</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
            .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #3b82f6; }
            .invoice-details { text-align: right; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { text-align: left; padding: 10px 0; border-bottom: 2px solid #ddd; color:#555;}
            th.right { text-align: right; }
            .total-row { border-top: 2px solid #333; }
            .footer { text-align: center; color: #777; margin-top: 50px; font-size: 0.9em; border-top: 1px solid #eee; padding-top: 20px; }
            @media print {
                .invoice-box { box-shadow: none; border: none; padding:0; margin:0; }
                body { padding: 0; }
            }
        </style>
        </head><body>
        <div class="invoice-box">
            <div class="header">
                <div>
                    <h1>FATURA / INVOICE</h1>
                    <h3>${loja}</h3>
                </div>
                <div class="invoice-details">
                    <strong>Comanda / Mesa:</strong> ${comanda.numero}<br>
                    <strong>Emissão:</strong> ${dateStr}
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width:10%; text-align:center;">Qtd</th>
                        <th style="width:50%;">Descrição</th>
                        <th class="right" style="width:20%;">V. Unit</th>
                        <th class="right" style="width:20%;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${lines}
                </tbody>
                <tfoot>
                    <tr><td colspan="4" style="height:20px;"></td></tr>
                    ${paymentsHtml}
                    <tr class="total-row">
                        <td colspan="3" style="text-align:right; font-size:1.2em; font-weight:bold; padding-top:10px;">TOTAL PAGO:</td>
                        <td style="text-align:right; font-size:1.2em; font-weight:bold; padding-top:10px; color:#2563eb;">R$ ${(comanda.total_pago || 0).toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="footer">
                Obrigado pela preferência!<br>
                Documento não fiscal.
            </div>
        </div>
        <script>
            window.onload = () => { setTimeout(() => window.print(), 500); }
        </script>
        </body></html>
        `;

        const win = window.open('', '_blank');
        if (win) {
            win.document.write(htmlPdf);
            win.document.close();
        }
    },

    reabrirComanda: async (id) => {
        const senha = await NaxioUI.prompt('🔒 Autorização', 'Senha do gerente para reabrir:', '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }

        const { data: comanda } = await _sb.from('comandas').select('*').eq('id', id).single();
        if (!comanda) return;

        const pInfo = typeof comanda.payments_info === 'string' ? JSON.parse(comanda.payments_info) : (comanda.payments_info || []);
        const hasCartao = Array.isArray(pInfo) ? pInfo.some(p => p.method !== 'Dinheiro' && p.method !== 'Pix' && !p._order_id) : false;

        if (hasCartao) {
            NaxioUI.alert('Atenção', '⚠️ Esta comanda tem pagamentos registrados em Cartão.\nA reabertura não cancela a transação na maquina. Lembre-se de estornar manualmente!', 'warning');
        }

        const orderMarker = Array.isArray(pInfo) ? pInfo.find(p => p._order_id) : null;
        if (orderMarker) {
            const orderIds = pInfo.filter(p => p._order_id).map(p => p._order_id);

            const { error: cancelError } = await _sb.from('orders').update({
                status: 'cancelado',
                observacao: 'Estornada por Reabertura de Comanda'
            }).in('id', orderIds);

            if (!cancelError) {
                App.utils.toast("Vendas anteriores canceladas no financeiro!", "info");
            } else {
                console.error("Erro ao cancelar ordens:", cancelError);
            }
        } else {
            // Fallback: search by mesa num para estorno caso não tenha _order_id (fechamentos antigos)
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const { data: recentOrders } = await _sb.from('orders')
                .select('*')
                .eq('store_id', App.state.storeId)
                .in('origem_venda', ['comanda', 'consumo_interno'])
                .gte('created_at', hoje.toISOString())
                .order('created_at', { ascending: false })
                .limit(20);
                
            let lastOrder = null;
            if (recentOrders) {
                for (let o of recentOrders) {
                    try {
                        const obsStr = o.observacao || '';
                        let obsMesa = null;
                        if (obsStr.startsWith('{')) {
                            const obs = JSON.parse(obsStr);
                            obsMesa = obs.mesa;
                        } else if (obsStr.includes('Mesa ' + comanda.numero)) {
                            obsMesa = comanda.numero;
                        }
                        
                        if (obsMesa && String(obsMesa) === String(comanda.numero) && o.status !== 'cancelado') {
                            lastOrder = o;
                            break;
                        }
                    } catch (e) { }
                }
            }
            if (lastOrder) {
                await _sb.from('orders').update({
                    status: 'cancelado',
                    observacao: (lastOrder.observacao || '') + ' [ESTORNADA E REABERTA NO PDV]'
                }).eq('id', lastOrder.id);
                App.utils.toast("Venda anterior cancelada no financeiro (fallback)!", "info");
            }
        }

        await _sb.from('comandas').update({ status: 'ocupada', total_pago: null, payments_info: null }).eq('id', id);
        App.utils.toast("Comanda reaberta com sucesso!", "success");
        if (window.Caixa && window.Caixa.calcTotals) {
            await window.Caixa.calcTotals();
        }
        const btnTodas = Array.from(document.querySelectorAll('.filtro-comanda')).find(x => x.textContent.trim() === 'TODAS');
        App.store.filtrar('todas', btnTodas);
    },

    // 🔥 REABERTURA DE MESA INTERNA (para correção de erros do dia)
    reabrirMesaInterna: async (id, numero) => {
        const senha = await NaxioUI.prompt('🔒 Autorização', `Senha do gerente para reabrir a mesa interna ${numero}:`, '', '', 'password');
        if (senha !== '1564' && senha !== '4567' && senha !== '1809') { App.utils.toast('Senha incorreta.', 'error'); return; }

        const motivo = await NaxioUI.prompt(
            '📝 Motivo da Reabertura',
            'Informe o motivo para reabrir esta mesa interna (para registro):',
            '',
            'Ex: Lançamento incorreto, item esquecido',
            'text'
        );
        if (motivo === null) return;

        const { data: comanda } = await _sb.from('comandas').select('*').eq('id', id).single();
        if (!comanda) return App.utils.toast('Mesa não encontrada.', 'error');

        // 🟢 BUSCA ÚLTIMA VENDA PARA ESSA MESA PRA TENTAR RESTAURAR OS ITENS
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const { data: recentOrders } = await _sb.from('orders')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('origem_venda', 'consumo_interno')
            .gte('created_at', hoje.toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        let lastOrder = null;
        let itensRestaurados = [];

        if (recentOrders) {
            for (let o of recentOrders) {
                try {
                    const obs = JSON.parse(o.observacao);
                    if (obs && (String(obs.mesa) === String(numero)) && o.status !== 'cancelado') {
                        lastOrder = o;
                        itensRestaurados = obs.itens || [];
                        break;
                    }
                } catch (e) { }
            }
        }

        // Registra no log de ordens para auditoria
        const user = App.state.profile?.nome_completo || App.state.user?.email || 'Sistema';
        await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'cancelado',
            origem_venda: 'correcao_interna',
            total_pago: 0,
            observacao: `REABERTURA MESA INTERNA ${numero} | Motivo: ${motivo || 'Sem motivo'} | Por: ${user}`,
            created_at: new Date().toISOString()
        });

        // Reabre a mesa interna: volta para 'ocupada' e restaura os itens do dia
        const updateObj = {
            status: 'ocupada',
            total_pago: null,
            payments_info: null,
            tipo_comanda: 'interna',
            updated_at: new Date().toISOString()
        };

        if (itensRestaurados.length > 0) {
            updateObj.items = itensRestaurados;
        }

        const { error } = await _sb.from('comandas').update(updateObj).eq('id', id);

        if (error) {
            return App.utils.toast('Erro ao reabrir: ' + error.message, 'error');
        }

        if (lastOrder) {
            // CANCELA A ORDEM DE CONSUMO INTERNO ORIGINAL DO CAIXA
            await _sb.from('orders').update({
                status: 'cancelado',
                observacao: (lastOrder.observacao || '') + ' [REABERTA E ESTORNADA NO PDV]'
            }).eq('id', lastOrder.id);

            // DEVOLVE ESTOQUE (Multiplica por -1 para simular o reverso do 'descontar_estoque')
            const arrVolta = [];
            itensRestaurados.forEach(it => { arrVolta.push({ id: it.id, qtd: (it.qtd || 1) * -1 }); });
            _sb.rpc('descontar_estoque', { itens: arrVolta });
        }

        App.utils.toast(`✅ Mesa interna ${numero} reaberta! Itens restaurados para correção.`, 'success');
        if (window.Caixa && window.Caixa.calcTotals) {
            await window.Caixa.calcTotals();
        }
        // Fecha o painel de historico resetando o filtro correto para 'todas'
        const btnTodas = Array.from(document.querySelectorAll('.filtro-comanda')).find(x => x.textContent.trim() === 'TODAS');
        App.store.filtrar('todas', btnTodas);
    }
});

// 🔥 INTEGRAÇÃO FISCAL PARA COMANDAS
App.fiscal = App.fiscal || {};

App.fiscal.emitirNFCeComanda = async (orderId, storeId, items, payments, cpf = null, nome = null) => {
    try {
        console.log("🚀 Iniciando emissão NFC-e (Comanda)...");

        const payload = {
            order_id: orderId,
            store_id: storeId,
            items_payload: items,
            payments_payload: payments,
            cpf_nota: cpf,
            nome_nota: nome
        };

        console.log("📤 Enviando para backend:", JSON.stringify(payload, null, 2));

        // ⚠️ FIX: Determina o endpoint correto (Local ou Cloud)
        let apiBase = '';
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            apiBase = (App.payment && App.payment.getConfig) ? App.payment.getConfig() : 'https://naxiosoftware.vercel.app';
        }

        const response = await fetch(`${apiBase}/api/emitir_fiscal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log("📡 Resposta RAW (texto):", responseText);

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.error("❌ ERRO AO PARSEAR JSON:", e);
            throw new Error("Resposta inválida do servidor: " + responseText.substring(0, 200));
        }

        console.log("📥 Resposta fiscal completa:", result);

        if (result.sucesso) {
            App.utils.toast("✅ NFC-e Autorizada!", "success");
            if (result.pdf) {
                // 🔥 INTEGRADO: Usa o modal interno em vez de abrir nova aba
                if (App.fiscal && App.fiscal.exibirPreviewDanfe) {
                    App.fiscal.exibirPreviewDanfe(result.pdf, result.chave || '');
                } else {
                    const win = window.open('', '_blank');
                    if (win) win.document.write(`<iframe width='100%' height='100%' src='${result.pdf}'></iframe>`);
                }
            }
        } else {
            // 🔥 CAPTURA EXAUSTIVA DE ERROS
            const motivo = result.motivo_sefaz || result.mensagem_sefaz || result.error || result.message || "Rejeição desconhecida da SEFAZ";

            console.error("❌ REJEIÇÃO FISCAL:", motivo);

            const alertMsg = [
                "🚫 NOTA FISCAL REJEITADA",
                "",
                "MOTIVO: " + motivo,
                "",
                "⚠️ O QUE FAZER?",
                "1. Verifique o NCM dos produtos",
                "2. Verifique o CNPJ e Inscrição Estadual da Loja",
                "3. Verifique se o endereço da loja está completo",
                "",
                "STATUS: " + (result.status || 'erro')
            ].join('\n');

            NaxioUI.alert('Fiscal', alertMsg, 'error');
            App.utils.toast("Nota Rejeitada: " + motivo, "error");
        }

    } catch (error) {
        console.error("❌ Erro na emissão:", error);
        App.utils.toast("Erro ao emitir nota fiscal: " + error.message, "error");
    }
};

// --------------------------------------------------------------------------------------
// 📊 MÓDULO DE RELATÓRIOS AVANÇADOS (COMANDAS)
// --------------------------------------------------------------------------------------
App.store.reports = {
    openModal: () => {
        const modalHtml =
            '<div id="comandas-relatorios-modal" class="modal-overlay" style="display:flex; z-index:9500;">' +
            '<div class="modal-content" style="width:90%; max-width:800px; background:#1e293b; color:#fff; display:flex; flex-direction:column; max-height:90vh;">' +
            '<div class="modal-header">' +
            '<h3>📈 Relatórios de Salão</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'comandas-relatorios-modal\').remove()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body" style="overflow-y:auto; padding:20px;">' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;">' +
            '<input type="date" id="rel-inicio" class="input-field" value="' + new Date().toISOString().slice(0, 10) + '">' +
            '<input type="date" id="rel-fim" class="input-field" value="' + new Date().toISOString().slice(0, 10) + '">' +
            '</div>' +

            '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px;">' +
            '<button class="btn btn-secondary btn-lg" onclick="App.store.reports.generate(\'vendedor\')">' +
            '<i class="ri-user-star-line"></i> Vendas por Garçom' +
            '</button>' +
            '<button class="btn btn-secondary btn-lg" onclick="App.store.reports.generate(\'produto\')">' +
            '<i class="ri-shopping-basket-2-line"></i> Produtos Mais Vendidos' +
            '</button>' +
            '<button class="btn btn-secondary btn-lg" onclick="App.store.reports.generate(\'horario\')">' +
            '<i class="ri-time-line"></i> Movimento por Horário' +
            '</button>' +
            '</div>' +

            '<div id="relatorio-output" style="margin-top:20px; padding:15px; background:#0f172a; border-radius:8px; border:1px solid #334155; min-height:200px;">' +
            '<p style="text-align:center; color:#64748b; margin-top:50px;">Selecione um relatório acima para gerar.</p>' +
            '</div>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button class="btn btn-primary" onclick="App.store.reports.print()">🖨️ Imprimir Resultado</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    generate: async (tipo) => {
        const inicio = document.getElementById('rel-inicio').value;
        const fim = document.getElementById('rel-fim').value;
        const output = document.getElementById('relatorio-output');
        output.innerHTML = '<div style="text-align:center; padding:20px;">🔄 Gerando dados...</div>';

        try {
            // Busca orders do período
            const { data: vendas } = await _sb.from('orders')
                .select('*')
                .eq('store_id', App.state.storeId)
                .eq('origem_venda', 'comanda') // Apenas salão
                .gte('created_at', inicio + 'T00:00:00')
                .lte('created_at', fim + 'T23:59:59');

            if (!vendas || vendas.length === 0) {
                output.innerHTML = '<p style="text-align:center;">Nenhuma venda encontrada no período.</p>';
                return;
            }

            let html = '';

            if (tipo === 'vendedor') {
                const porVendedor = {};
                vendas.forEach(v => {
                    const vend = v.vendedor || 'Caixa'; // Vendedor salvo na order
                    if (!porVendedor[vend]) porVendedor[vend] = { qtd: 0, total: 0 };
                    porVendedor[vend].qtd++;
                    porVendedor[vend].total += v.total_pago;
                });

                html =
                    '<h4 style="border-bottom:1px solid #334155; padding-bottom:10px;">🏆 Ranking de Garçons (' + inicio + ' a ' + fim + ')</h4>' +
                    '<table style="width:100%; text-align:left; border-collapse:collapse;">' +
                    '<tr style="background:#1e293b; color:#94a3b8;"><th style="padding:8px;">Nome</th><th style="padding:8px;">Atendimentos</th><th style="padding:8px;">Total Vendido</th></tr>' +
                    Object.keys(porVendedor).sort((a, b) => porVendedor[b].total - porVendedor[a].total).map(k =>
                        '<tr style="border-bottom:1px solid #334155;">' +
                        '<td style="padding:8px;">' + k + '</td>' +
                        '<td style="padding:8px;">' + porVendedor[k].qtd + '</td>' +
                        '<td style="padding:8px;">R$ ' + porVendedor[k].total.toFixed(2) + '</td>' +
                        '</tr>'
                    ).join('') +
                    '</table>';
            }

            if (tipo === 'produto') {
                const porProduto = {};
                vendas.forEach(v => {
                    // Tenta extrair itens do JSON de observação
                    try {
                        const obs = JSON.parse(v.observacao);
                        if (obs.itens && Array.isArray(obs.itens)) {
                            obs.itens.forEach(i => {
                                if (!porProduto[i.nome]) porProduto[i.nome] = { qtd: 0, total: 0 };
                                porProduto[i.nome].qtd += (i.qtd || 1);
                                porProduto[i.nome].total += (i.price * (i.qtd || 1));
                            });
                        }
                    } catch (e) { }
                });

                html =
                    '<h4 style="border-bottom:1px solid #334155; padding-bottom:10px;">🍔 Produtos Mais Vendidos (' + inicio + ' a ' + fim + ')</h4>' +
                    '<table style="width:100%; text-align:left; border-collapse:collapse;">' +
                    '<tr style="background:#1e293b; color:#94a3b8;"><th style="padding:8px;">Item</th><th style="padding:8px;">Qtd</th><th style="padding:8px;">Total</th></tr>' +
                    Object.keys(porProduto).sort((a, b) => porProduto[b].qtd - porProduto[a].qtd).map(k =>
                        '<tr style="border-bottom:1px solid #334155;">' +
                        '<td style="padding:8px;">' + k + '</td>' +
                        '<td style="padding:8px;">' + porProduto[k].qtd + '</td>' +
                        '<td style="padding:8px;">R$ ' + porProduto[k].total.toFixed(2) + '</td>' +
                        '</tr>'
                    ).join('') +
                    '</table>';
            }

            if (tipo === 'horario') {
                const porHora = {};
                vendas.forEach(v => {
                    const hora = new Date(v.created_at).getHours();
                    const label = hora + " h - " + (hora + 1) + " h";
                    if (!porHora[label]) porHora[label] = { qtd: 0, total: 0 };
                    porHora[label].qtd++;
                    porHora[label].total += v.total_pago;
                });

                html =
                    '<h4 style="border-bottom:1px solid #334155; padding-bottom:10px;">⏰ Movimento por Horário (' + inicio + ' a ' + fim + ')</h4>' +
                    '<div style="display:flex; flex-direction:column; gap:5px;">' +
                    Object.keys(porHora).sort().map(k => {
                        const max = Math.max(...Object.values(porHora).map(x => x.total));
                        const pct = (porHora[k].total / max) * 100;
                        return '<div style="display:flex; align-items:center; gap:10px; font-size:0.9rem;">' +
                            '<div style="width:80px;">' + k + '</div>' +
                            '<div style="flex:1; background:#0f172a; height:10px; border-radius:5px; overflow:hidden;">' +
                            '<div style="width:' + pct + '%; background:#3b82f6; height:100%;"></div>' +
                            '</div>' +
                            '<div style="width:80px; text-align:right;">R$ ' + porHora[k].total.toFixed(0) + '</div>' +
                            '</div>';
                    }).join('') +
                    '</div>';
            }

            output.innerHTML = html;

        } catch (e) {
            console.error(e);
            output.innerHTML = '<p style="color:#ef4444;">Erro ao gerar relatório: ' + e.message + '</p>';
        }
    },

    print: () => {
        const conteudo = document.getElementById('relatorio-output').innerHTML;
        const win = window.open('', '_blank');
        win.document.write(
            '<html>' +
            '<head><title>Relatório Naxio</title></head>' +
            '<body style="font-family:sans-serif; padding:20px;">' +
            '<h2>Relatório Gerencial - Naxio Salão</h2>' +
            '<hr/>' +
            conteudo +
            '<script>window.print();</script>' +
            '</body>' +
            '</html>'
        );
    }
};



// --------------------------------------------------------------------------------------
// 🕵️ MÓDULO DE AUDITORIA E LOGS (COMANDAS)
// --------------------------------------------------------------------------------------
App.store.audit = {
    // Registra uma ação na comanda
    logAction: async (comandaId, acao, detalhe) => {
        try {
            const user = App.state.profile?.nome_completo || App.state.user?.email || 'Sistema';
            const logEntry = {
                data: new Date().toISOString(),
                usuario: user,
                acao: acao,
                detalhe: detalhe
            };

            // Busca log atual
            const { data: comanda } = await _sb.from('comandas').select('audit_log').eq('id', comandaId).single();
            const currentLog = comanda?.audit_log || [];

            // Adiciona novo evento
            const newLog = [logEntry, ...currentLog];

            // Salva
            await _sb.from('comandas').update({ audit_log: newLog }).eq('id', comandaId);

        } catch (e) {
            console.error("Erro ao gravar log de auditoria:", e);
        }
    },

    // Visualiza o log
    viewLog: async (comandaId) => {
        const modalId = 'modal-audit-log';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        // Carregando...
        App.utils.toast("Carregando histórico...", "info");

        const { data: comanda } = await _sb.from('comandas').select('audit_log, numero').eq('id', comandaId).single();
        const logs = comanda?.audit_log || [];

        const logHtml = logs.length > 0 ? logs.map(l =>
            '<div style="border-left: 3px solid #3b82f6; padding-left: 10px; margin-bottom: 15px; position: relative;">' +
            '<div style="font-size: 0.8rem; color: #94a3b8;">' + new Date(l.data).toLocaleString() + '</div>' +
            '<div style="font-weight: bold; color: #f1f5f9;">' + l.acao + '</div>' +
            '<div style="font-size: 0.9rem; color: #cbd5e1;">' + l.detalhe + '</div>' +
            '<div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">👤 ' + l.usuario + '</div>' +
            '</div>'
        ).join('') : '<p style="text-align:center; color:#64748b;">Nenhum registro encontrado.</p>';

        const modal =
            '<div id="' + modalId + '" class="modal-overlay" style="display:flex; z-index:9700;">' +
            '<div class="modal-content" style="max-width:500px; background:#1e293b; color:#fff;">' +
            '<div class="modal-header">' +
            '<h3>📜 Histórico da Mesa ' + comanda.numero + '</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'' + modalId + '\').remove()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body" style="max-height:60vh; overflow-y:auto;">' +
            logHtml +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.insertAdjacentHTML('beforeend', modal);
    }
};

// --------------------------------------------------------------------------------------
// 🤝 MÓDULO CRM (CLIENTE NA MESA)
// --------------------------------------------------------------------------------------
App.store.crm = {

    // Abre modal para vincular cliente
    openLinkCustomer: () => {
        const modalHtml =
            '<div id="modal-link-crm" class="modal-overlay" style="display:flex; z-index:9600;">' +
            '<div class="modal-content" style="max-width:500px; background:#1e293b; color:#fff;">' +
            '<div class="modal-header">' +
            '<h3>👤 Vincular Cliente à Mesa</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'modal-link-crm\').remove()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body">' +
            '<div style="margin-bottom:15px;">' +
            '<label>Buscar Cliente:</label>' +
            '<input type="text" id="crm-search" class="input-field" placeholder="Nome, CPF ou Telefone..." oninput="App.store.crm.searchCustomer(this.value)">' +
            '</div>' +
            '<div id="crm-results" style="max-height:200px; overflow-y:auto; border:1px solid #334155; border-radius:8px; display:none;"></div>' +

            '<div id="crm-selected" style="display:none; margin-top:15px; padding:15px; background:#0f172a; border-radius:8px; border:1px solid #3b82f6;">' +
            '<h4 style="margin:0; color:#3b82f6;" id="crm-sel-name"></h4>' +
            '<p style="margin:5px 0; font-size:0.9rem; color:#94a3b8;" id="crm-sel-info"></p>' +
            '<input type="hidden" id="crm-sel-id">' +
            '</div>' +

            '<button class="btn btn-primary btn-full" onclick="App.store.crm.confirmLink()" style="margin-top:15px;" disabled id="btn-link-crm">VINCULAR CLIENTE</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('crm-search').focus();
    },

    searchCustomer: async (term) => {
        const resDiv = document.getElementById('crm-results');
        if (term.length < 3) {
            resDiv.style.display = 'none';
            return;
        }

        const { data: clientes } = await _sb.from('profiles')
            .select('id, nome_completo, cpf, telefone')
            .or('nome_completo.ilike.%' + term + '%, cpf.ilike.%' + term + '%, telefone.ilike.%' + term + '%')
            .limit(10);

        if (!clientes || clientes.length === 0) {
            resDiv.innerHTML = '<div style="padding:10px; text-align:center;">Nenhum cliente encontrado. <br> <small><a href="#" onclick="App.router.go(\'clientes\')">Cadastrar Novo</a></small></div>';
            resDiv.style.display = 'block';
            return;
        }

        resDiv.innerHTML = clientes.map(c =>
            '<div onclick="App.store.crm.selectCustomer(\'' + c.id + '\', \'' + c.nome_completo + '\', \'' + (c.cpf || 'S/ CPF') + '\')"' +
            ' style="padding:10px; border-bottom:1px solid #334155; cursor:pointer; transition:0.2s;"' +
            ' onmouseover="this.style.background=\'#334155\'" onmouseout="this.style.background=\'transparent\'">' +
            '<div style="font-weight:bold;">' + c.nome_completo + '</div>' +
            '<div style="font-size:0.8rem; color:#94a3b8;">CPF: ' + (c.cpf || '-') + ' | Tel: ' + (c.telefone || '-') + '</div>' +
            '</div>'
        ).join('');
        resDiv.style.display = 'block';
    },

    selectCustomer: (id, nome, cpf) => {
        document.getElementById('crm-results').style.display = 'none';
        document.getElementById('crm-selected').style.display = 'block';
        document.getElementById('crm-sel-name').innerText = nome;
        document.getElementById('crm-sel-info').innerText = "CPF: " + cpf;
        document.getElementById('crm-sel-id').value = id;
        document.getElementById('btn-link-crm').disabled = false;
    },

    confirmLink: async () => {
        const cid = document.getElementById('crm-sel-id').value;
        const nome = document.getElementById('crm-sel-name').innerText;

        if (!cid) return;

        App.utils.toast("Vinculando cliente...", "info");

        // Atualiza comanda com cliente vinculado
        await _sb.from('comandas').update({
            customer_id: cid,
            customer_name: nome
        }).eq('id', App.state.currentComanda);

        // Gera log
        await App.store.audit.logAction(App.state.currentComanda, "VINCULO_CLIENTE", "Cliente " + nome + " vinculado à mesa.");

        App.utils.toast("Cliente vinculado!", "success");
        document.getElementById('modal-link-crm').remove();

        // Atualiza a view
        App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
    }
};

// --------------------------------------------------------------------------------------
// 🎁 MÓDULO DE PROMOÇÕES & HAPPY HOUR
// --------------------------------------------------------------------------------------
App.store.promo = {
    // Estado local das promoções (Persistir em localStorage por enquanto)
    rules: JSON.parse(localStorage.getItem('naxio_promos') || '[]'),

    saveRules: () => {
        localStorage.setItem('naxio_promos', JSON.stringify(App.store.promo.rules));
    },

    openConfig: () => {
        const modalId = 'modal-promo-config';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const renderRules = () => {
            return App.store.promo.rules.map((r, i) =>
                '<div style="background:#0f172a; padding:10px; border:1px solid #334155; border-radius:8px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">' +
                '<div>' +
                '<div style="font-weight:bold; color:#facc15;">' + r.name + '</div>' +
                '<div style="font-size:0.8rem; color:#94a3b8;">' + r.start + 'h às ' + r.end + 'h • ' + r.discount + '% OFF</div>' +
                '<div style="font-size:0.75rem; color:#64748b;">' + r.days.join(', ') + '</div>' +
                '</div>' +
                '<button class="btn btn-sm btn-secondary" onclick="App.store.promo.removeRule(' + i + ')"><i class="ri-delete-bin-line"></i></button>' +
                '</div>'
            ).join('');
        };

        const html =
            '<div id="' + modalId + '" class="modal-overlay" style="display:flex; z-index:9800;">' +
            '<div class="modal-content" style="max-width:600px; background:#1e293b; color:#fff;">' +
            '<div class="modal-header">' +
            '<h3>🎉 Configurar Happy Hour & Promoções</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="App.store.promo.closeConfig()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body">' +
            '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px; background:#0f172a; padding:15px; border-radius:12px;">' +
            '<div style="grid-column: span 2;">' +
            '<label>Nome da Promoção</label>' +
            '<input type="text" id="promo-name" class="input-field" placeholder="Ex: Happy Hour Chopp">' +
            '</div>' +
            '<div>' +
            '<label>Início (Hora)</label>' +
            '<input type="time" id="promo-start" class="input-field">' +
            '</div>' +
            '<div>' +
            '<label>Fim (Hora)</label>' +
            '<input type="time" id="promo-end" class="input-field">' +
            '</div>' +
            '<div>' +
            '<label>Desconto (%)</label>' +
            '<input type="number" id="promo-perc" class="input-field" placeholder="10">' +
            '</div>' +
            '<div>' +
            '<label>Dias da Semana</label>' +
            '<div style="display:flex; gap:5px; flex-wrap:wrap;">' +
            ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, idx) =>
                '<div class="day-check" onclick="this.classList.toggle(\'selected\')" data-day="' + idx + '"' +
                ' style="width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:1px solid #334155; cursor:pointer; border-radius:4px;">' +
                d +
                '</div>'
            ).join('') +
            '</div>' +
            '</div>' +
            '<button class="btn btn-primary btn-full" style="grid-column: span 2; margin-top:10px;" onclick="App.store.promo.addRule()">' +
            'Adicionar Regra' +
            '</button>' +
            '</div>' +

            '<h4 style="border-bottom:1px solid #334155; padding-bottom:5px;">Regras Ativas</h4>' +
            '<div id="promo-list">' +
            renderRules() +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<style>' +
            '.day-check.selected {background: #3b82f6; border-color: #3b82f6; color: white; }' +
            '</style>';
        document.body.insertAdjacentHTML('beforeend', html);
    },

    closeConfig: () => {
        document.getElementById('modal-promo-config').remove();
    },

    addRule: () => {
        const name = document.getElementById('promo-name').value;
        const start = document.getElementById('promo-start').value;
        const end = document.getElementById('promo-end').value;
        const perc = parseFloat(document.getElementById('promo-perc').value);

        const days = [];
        document.querySelectorAll('.day-check.selected').forEach(el => days.push(el.innerText)); // Simples check
        // Melhor usar índices
        const daysIdx = [];
        document.querySelectorAll('.day-check.selected').forEach(el => daysIdx.push(parseInt(el.dataset.day)));

        if (!name || !start || !end || !perc) return alert("Preencha todos os campos.");

        App.store.promo.rules.push({
            name, start, end, discount: perc, days: daysIdx
        });
        App.store.promo.saveRules();
        App.store.promo.openConfig(); // Re-render
    },

    removeRule: (idx) => {
        App.store.promo.rules.splice(idx, 1);
        App.store.promo.saveRules();
        App.store.promo.openConfig();
    },

    // Verifica se há promo ativa agora e retorna o desconto decimal (0.1 para 10%)
    getActiveDiscount: () => {
        const now = new Date();
        const currentHour = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
        const currentDay = now.getDay(); // 0 = Dom

        let maxDiscount = 0;
        let activeRuleName = null;

        App.store.promo.rules.forEach(r => {
            if (r.days.includes(currentDay)) {
                if (currentHour >= r.start && currentHour <= r.end) {
                    if (r.discount > maxDiscount) {
                        maxDiscount = r.discount;
                        activeRuleName = r.name;
                    }
                }
            }
        });

        return { val: maxDiscount / 100, name: activeRuleName };
    }
};

// --------------------------------------------------------------------------------------
// 🗺️ MÓDULO DE LAYOUT VISUAL (MAPA DE MESAS)
// --------------------------------------------------------------------------------------
App.store.layout = {
    editMode: false,
    positions: JSON.parse(localStorage.getItem('naxio_layout_mesas') || '{}'),

    toggleEditMode: () => {
        App.store.layout.editMode = !App.store.layout.editMode;
        App.store.layout.renderMap();
        App.utils.toast(App.store.layout.editMode ? "Modo Edição ATIVADO" : "Modo Edição DESATIVADO", "info");
    },

    savePositions: () => {
        localStorage.setItem('naxio_layout_mesas', JSON.stringify(App.store.layout.positions));
        App.utils.toast("Layout salvo!", "success");
    },

    // Renderiza o mapa visual em vez do grid padrão
    renderMap: async () => {
        const container = document.getElementById('comandas-advanced-grid');
        if (!container) return;

        // Limpa grid e aplica estilos de mapa
        container.style.display = 'block';
        container.style.position = 'relative';
        container.style.height = '600px'; // Altura fixa para o mapa
        container.style.background = '#0f172a';
        container.style.backgroundImage = 'radial-gradient(#334155 1px, transparent 1px)';
        container.style.backgroundSize = '20px 20px';
        container.style.border = '2px solid #334155';
        container.style.borderRadius = '12px';
        container.style.overflow = 'hidden';

        container.innerHTML = '<div style="position:absolute; top:10px; right:10px; z-index:10;"><button class="btn btn-sm btn-primary" onclick="App.store.layout.toggleEditMode()">' + (App.store.layout.editMode ? '💾 Salvar & Sair' : '✏️ Editar Layout') + '</button></div>';

        // Carrega mesas (dados reais)
        const { data: mesas } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId);

        mesas.forEach(mesa => {
            const pos = App.store.layout.positions[mesa.numero] || { x: 50, y: 50 };

            const el = document.createElement('div');
            el.className = 'mesa-visual-card';
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';
            // Status visual
            const isLivre = mesa.status === 'livre' || (mesa.status === 'aberta' && (!mesa.items || mesa.items.length === 0));
            el.style.background = isLivre ? '#22c55e' : '#ef4444';

            el.innerHTML =
                (isLivre ? '<div onclick="App.store.limparComandaUnica(event, \'' + mesa.id + '\', \'' + mesa.numero + '\')" ' +
                    'style="position:absolute; top:-10px; right:-10px; background:#ef4444; color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.3); z-index:20; border:2px solid #fff;">' +
                    '<i class="ri-close-line"></i>' +
                    '</div>' : '') +
                '<div style="font-weight:bold; font-size:1.2rem; color:white; text-shadow:0 1px 2px black;">' + mesa.numero + '</div>' +
                (!isLivre ? '<div style="font-size:0.7rem; color:white; background:rgba(0,0,0,0.5); padding:2px 4px; border-radius:4px;">R$ ' + (mesa.items || []).reduce((a, b) => a + (b.price * b.qtd), 0).toFixed(0) + '</div>' : '');

            // Drag Logic se editMode
            if (App.store.layout.editMode) {
                el.style.cursor = 'move';
                el.style.border = '2px dashed yellow';
                el.onmousedown = (e) => App.store.layout.dragStart(e, el, mesa.numero);
            } else {
                el.style.cursor = 'pointer';
                el.onclick = () => App.store.manageComanda(mesa.id, encodeURIComponent(JSON.stringify(mesa.items || [])), mesa.numero, mesa.status);
            }

            container.appendChild(el);
        });

        // Inject Styles
        if (!document.getElementById('layout-styles')) {
            const style = document.createElement('style');
            style.id = 'layout-styles';
            style.innerHTML =
                '.mesa-visual-card {' +
                'position: absolute;' +
                'width: 80px; height: 80px;' +
                'border-radius: 12px;' +
                'display: flex; flex-direction: column;' +
                'align-items: center; justify-content: center;' +
                'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);' +
                'transition: transform 0.1s;' +
                'user-select: none;' +
                '}' +
                '.mesa-visual-card:active { transform: scale(0.95); }';
            document.head.appendChild(style);
        }
    },

    dragStart: (e, el, num) => {
        let startX = e.clientX;
        let startY = e.clientY;
        let origX = el.offsetLeft;
        let origY = el.offsetTop;

        const onMove = (e2) => {
            const dx = e2.clientX - startX;
            const dy = e2.clientY - startY;
            el.style.left = (origX + dx) + 'px';
            el.style.top = (origY + dy) + 'px';
        };

        const onUp = (e2) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            // Salva nova pos
            App.store.layout.positions[num] = {
                x: el.offsetLeft,
                y: el.offsetTop
            };
            App.store.layout.savePositions();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
};

App.store.limparMesasLivres = async () => {
    if (!await NaxioUI.confirm('Confirmação', "Isso irá remover todas as mesas 'LIVRES' (verdes) da tela atual, arquivando-as. Deseja continuar?")) return;

    App.utils.toast("Limpando painel...", "info");

    // Marca todas as mesas LIVRES deste store como FECHADA para sumirem da tela
    const { error } = await _sb.from('comandas')
        .update({
            status: 'fechada',
            items: [], // 🔥 BUG FIX: garante que não ficam itens fantasmas nas mesas arquivadas
            updated_at: new Date().toISOString()
        })
        .eq('store_id', App.state.storeId)
        .eq('status', 'livre');

    if (error) {
        NaxioUI.alert('Erro', "Erro ao limpar mesas: " + error.message, 'error');
    } else {
        App.utils.toast("Painel limpo!", "success");
        App.store.loadComandas();
    }
};

App.store.limparComandaUnica = async (ev, id, numero) => {
    if (ev) ev.stopPropagation(); // Evita abrir a comanda ao clicar no X

    const confirma = await NaxioUI.confirm(
        'Limpar Comanda',
        `Deseja realmente remover a comanda ${numero} da tela? Ela será arquivada no histórico.`,
        'Sim, Limpar',
        'Cancelar'
    );

    if (!confirma) return;

    App.utils.toast(`Limpando comanda ${numero}...`, "info");

    const updateJob = {
        table: 'comandas',
        action: 'update',
        id: id,
        data: { status: 'fechada', updated_at: new Date().toISOString() }
    };

    const res = await NaxioStability.safeExecute(
        () => _sb.from('comandas').update(updateJob.data).eq('id', id),
        `Limpar Comanda ${numero}`
    );

    // Adiciona os detalhes para a fila se falhar
    if (res.queued) {
        // O stability manager já salvou na fila se veio queued:true
        // Mas precisamos anexar os detalhes do job para que ele saiba como replicar
        const lastJob = NaxioStability.state.queue[NaxioStability.state.queue.length - 1];
        if (lastJob) {
            lastJob.details = updateJob;
            localStorage.setItem('NAXIO_OFFLINE_QUEUE', JSON.stringify(NaxioStability.state.queue));
        }
    }

    if (res.error) {
        NaxioUI.alert('Erro', "Erro ao limpar comanda: " + res.error.message, 'error');
    } else {
        App.utils.toast(`Comanda ${numero} limpa!`, "success");
        App.store.loadComandas();
    }
};

// 🔥 MÓDULO DE RELATÓRIOS & ANALYTICS (App.store.reports)
App.store.reports = {
    charts: {}, // Armazena instâncias do Chart.js

    openDashboard: async () => {
        // Redireciona para o Painel Completo (Restaurado a pedido do cliente)
        if (typeof PainelRelatorios !== 'undefined') {
            PainelRelatorios.open();
        } else {
            NaxioUI.alert('Módulo não encontrado', "Módulo de Relatórios (PainelRelatorios) não encontrado.", 'warning');
        }
    },
};

if (!window.metricsInitialized) { window.metricsInitialized = true; console.log('Analytics Engine Ready'); }

if (!window.metricsInitialized) { window.metricsInitialized = true; console.log('Analytics Engine Ready'); }
