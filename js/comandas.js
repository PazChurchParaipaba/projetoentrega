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
            console.log("🔄 Carregando produtos...");
            const { data } = await _sb.from('products').select('id, nome, preco, ncm').eq('store_id', App.state.storeId);
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

            // Tenta buscar NCM do cache se não existir
            if (!ncm && window.produtosCache) {
                const cached = window.produtosCache.find(p => String(p.id) === String(item.id || item.product_id));
                if (cached && cached.ncm) {
                    ncm = cached.ncm;
                    console.log("✅ NCM encontrado no cache para " + item.nome + ": " + ncm);
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
                observacao: item.observacao || '',
                garcom: item.garcom || 'Sistema'
            };
        });
    },

    // --- REALTIME (ATUALIZAÇÃO IMEDIATA) ---
    startRealtimeListener: () => {
        if (App.store.realtimeSubscription) return;
        const storeId = App.state.storeId;

        App.store.realtimeSubscription = _sb.channel('custom-all-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas', filter: 'store_id=eq.' + storeId }, (payload) => {
                // Atualiza Grid Principal
                App.store.loadComandas();

                // Se estiver com a comanda aberta na tela, atualiza os itens em tempo real
                if (App.state.currentComanda === payload.new.id) {
                    const items = payload.new.items || [];
                    App.state.currentComandaItems = items;

                    // Se estiver no modal novo (com abas), re-renderiza a aba ativa
                    if (document.getElementById('comanda-modal-tabs')) {
                        App.store.renderActiveTab(payload.new.numero, items);
                    } else {
                        // Fallback para modal antigo (se ainda existir)
                        App.store.renderEditList(payload.new.numero, items);
                    }

                    if (App.store.fastCheckoutComanda?.id === payload.new.id) {
                        App.store.checkMesaRapida();
                    }
                }
            })
            .subscribe();
    },

    // --- NOVA ESTRUTURA DE UI (DARK MODE ENTERPRISE) ---
    state: {
        activeTab: 'pedidos', // pedidos, pagamentos, dividas, info
        selectedSeat: null,   // Para gestão de lugares
        draggedItem: null,
        comTaxa: true         // 🔥 10% de serviço marcado por padrão
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
        view.className = 'view-section container';

        view.innerHTML = `
            <style>
                .gestao-layout { display: grid; grid-template-columns: 320px 1fr; gap: 15px; align-items: start; height: calc(100vh - 100px); overflow: hidden; }
                @media(max-width: 900px) { 
                    .gestao-layout { grid-template-columns: 1fr; height: auto; overflow-y: auto; } 
                    .sidebar-actions { height: auto !important; margin-bottom: 20px; }
                }
                
                .panel-box { background: #1e293b; padding: 15px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
                .mesa-fechada { background: #f1f5f9 !important; border-color: #94a3b8 !important; opacity: 0.8; }
                
                .type-card { padding: 10px; border: 1px solid #334155; border-radius: 8px; text-align: center; cursor: pointer; transition: all 0.2s; background:#0f172a; }
                .type-card:hover { border-color: #3b82f6; }
                .type-card.active { background: #1e3a8a; border-color: #3b82f6; color: #60a5fa; font-weight: bold; }
                
                .stat-card { background: #0f172a; padding: 15px; border-radius: 10px; border: 1px solid #334155; text-align: center; }
                .stat-val { font-size: 1.5rem; font-weight: bold; color: #f8fafc; }
                .stat-label { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }

                .btn-icon-action { width: 100%; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
                .btn-icon-action:hover { transform: translateY(-2px); }
            </style>

            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items:center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #334155;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <div style="background:#3b82f6; width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center;">
                        <i class="ri-restaurant-2-fill" style="font-size:1.5rem; color:white;"></i>
                    </div>
                    <div>
                        <h2 style="margin:0; font-size:1.5rem; color:#f1f5f9;">Controle de Mesas</h2>
                        <div style="font-size:0.9rem; color:#94a3b8;">Gestão em Tempo Real do Salão</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary btn-sm" onclick="App.store.promo.openConfig()" title="Configurar Happy Hour"><i class="ri-gift-line"></i> Promoções</button>
                    <button class="btn btn-secondary btn-sm" onclick="App.store.layout.renderMap()" title="Visualizar Mapa do Salão"><i class="ri-map-2-line"></i> Mapa</button>
                    <button class="btn btn-secondary btn-sm" onclick="App.router.go('loja')"><i class="ri-arrow-left-line"></i> Voltar</button>
                    <button class="btn btn-primary btn-sm" onclick="App.store.loadComandas()"><i class="ri-refresh-line"></i> Atualizar</button>
                </div>
            </div>

            <div class="gestao-layout">
                <!-- SIDEBAR CONTROLS -->
                <div class="sidebar-actions" style="overflow-y: auto; height: 100%; padding-right: 5px;">
                    
                    <!-- 1. CHECKOUT RÁPIDO (DESTAQUE) -->
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

                    <!-- 2. ESTATÍSTICAS RÁPIDAS -->
                    <div class="panel-box">
                        <h4 style="margin-top:0; color:#94a3b8; font-size:0.9rem; margin-bottom:15px;">MÉTRICAS DO TURNO</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div class="stat-card">
                                <div class="stat-val" style="color:#22c55e;" id="stat-mesas-livres">-</div>
                                <div class="stat-label">Livres</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-val" style="color:#ef4444;" id="stat-mesas-ocupadas">-</div>
                                <div class="stat-label">Ocupadas</div>
                            </div>
                            <div class="stat-card" style="grid-column: span 2;">
                                <div class="stat-val" style="color:#3b82f6;" id="stat-faturamento">R$ 0,00</div>
                                <div class="stat-label">Faturamento (Hoje)</div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. ABERTURA DE LOTE -->
                    <div class="panel-box">
                        <h4 style="margin-top:0; color:#f1f5f9;">🚀 Abrir Mesas / Comandas</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                            <input type="number" id="lote-inicio" class="input-field" placeholder="De" style="background:#0f172a; color:white;">
                            <input type="number" id="lote-fim" class="input-field" placeholder="Até" style="background:#0f172a; color:white;">
                        </div>
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <label onclick="App.store.selectType(this)" style="flex:1"><input type="radio" name="quick-tipo" value="passante" checked hidden><div class="type-card active">Passante</div></label>
                            <label onclick="App.store.selectType(this)" style="flex:1"><input type="radio" name="quick-tipo" value="interna" hidden><div class="type-card">🏠 Interna</div></label>
                        </div>
                        <select id="lote-guia" class="input-field" style="margin-bottom:15px; background:#0f172a; color:white;"><option value="">👤 Guia (Opcional)</option>${guiasOptions}</select>
                        <button class="btn btn-primary btn-full" onclick="App.store.abrirLote()">
                            <i class="ri-add-line"></i> ABRIR MESAS
                        </button>
                    </div>

                    <!-- 4. AÇÕES DE MANUTENÇÃO -->
                    <div class="panel-box">
                        <button class="btn-icon-action" style="background:#334155; color:#cbd5e1; border:1px solid #475569;" onclick="App.store.reabrirMesa()">
                            <i class="ri-recycle-line"></i> Corrigir/Reabrir Mesa
                        </button>
                        <button class="btn-icon-action" style="background:#3b82f6; color:white; border:1px solid #2563eb; margin-top:10px;" onclick="App.store.enviarMensagemParaGarcom()">
                            <i class="ri-message-3-line"></i> Enviar Mensagem
                        </button>
                        <button class="btn-icon-action" style="background:#334155; color:#cbd5e1; border:1px solid #475569; margin-top:10px;" onclick="window.print()">
                            <i class="ri-printer-line"></i> Imprimir Mapa
                        </button>
                    </div>
                </div>

                <!-- MAIN GRID -->
                <div class="main-grid-area" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                    
                    <!-- FILTROS -->
                    <div style="background:#1e293b; padding:10px 20px; border-radius:12px; border:1px solid #334155; margin-bottom:15px; display:flex; gap:10px;">
                        <button class="btn btn-sm btn-secondary filtro-comanda active" onclick="App.store.filtrar('todas', this)">TODAS</button>
                        <button class="btn btn-sm btn-secondary filtro-comanda" onclick="App.store.filtrar('ocupada', this)">OCUPADAS</button>
                        <button class="btn btn-sm btn-secondary filtro-comanda" onclick="App.store.filtrar('livre', this)">LIVRES</button>
                        <button class="btn btn-sm btn-secondary filtro-comanda" onclick="App.store.filtrar('fechada', this)">HISTÓRICO</button>
                    </div>

                    <!-- GRID SCROLLABLE -->
                    <div style="flex:1; overflow-y:auto; padding-right:5px;">
                        <div id="comandas-advanced-grid" class="comanda-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:15px;"></div>
                        
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
        await App.store.loadComandas();
        App.store.startRealtimeListener();

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

        const confirma = await NaxioUI.confirm(
            '🔄 Reabrir Mesa',
            "Mesa " + num + " está com status: " + comanda.status + ". Deseja forçar para 'aberta'?",
            'Sim, Reabrir',
            'Cancelar'
        );

        if (confirma) {
            await _sb.from('comandas').update({ status: 'aberta' }).eq('id', comanda.id);
            App.store.loadComandas();
            App.utils.toast("Mesa reaberta com sucesso!", "success");
        }
    },

    // 🔥 NOVA FUNÇÃO DE MENSAGENS PARA GARÇONS
    enviarMensagemParaGarcom: async () => {
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

    // --- LÓGICA DE MESAS ---
    checkMesaRapida: async () => {
        const num = document.getElementById('checkout-mesa-num').value;
        if (!num) return;
        const { data: comanda } = await _sb.from('comandas')
            .select('*, guides(name)')
            .eq('store_id', App.state.storeId)
            .eq('numero', num)
            .in('status', ['aberta', 'ocupada']) // Aceita aberta ou ocupada
            .limit(1)
            .maybeSingle();
        const resumo = document.getElementById('checkout-resumo');

        if (!comanda) {
            alert("Mesa não encontrada ou fechada.");
            App.store.fastCheckoutComanda = null;
            resumo.style.display = 'none';
            return;
        }
        App.store.fastCheckoutComanda = comanda;

        // Regra do 10% padrão
        const taxaCheckbox = document.getElementById('taxa-servico-check');
        if (taxaCheckbox) {
            taxaCheckbox.checked = !(comanda.numero == 300 || comanda.numero == '300' || comanda.tipo_comanda === 'interna');
        }

        resumo.style.display = 'block';
        App.store.recalcularCheckoutRapido();
        document.getElementById('checkout-info-txt').innerText = (comanda.items?.length || 0) + " itens | " + (comanda.guides?.name?.split(' ')[0] || 'S/ Guia');
    },

    recalcularCheckoutRapido: () => {
        const c = App.store.fastCheckoutComanda;
        if (!c) return;
        const sub = c.items ? c.items.reduce((a, i) => a + (i.price * i.qtd), 0) : 0;
        const taxa = document.getElementById('taxa-servico-check').checked ? sub * 0.10 : 0;
        c.calc_total = sub + taxa; c.calc_taxa = taxa;
        document.getElementById('checkout-total').innerText = "R$ " + (sub + taxa).toFixed(2);
    },

    // --- MODAL DE DETALHES E LANÇAMENTO ---
    abrirModalDetalhes: () => {
        const c = App.store.fastCheckoutComanda;
        if (!c) return;
        App.store.manageComanda(c.id, encodeURIComponent(JSON.stringify(c.items || [])), c.numero, 'aberta');
    },

    // manageComanda definida mais abaixo (linha ~2035) com lógica completa de caixa e tabs

    // 🔥 NOVO MODAL DE LANÇAMENTO COM OBS E QTD
    abrirModalLancarItem: async () => {
        const modalId = 'modal-lancar-item-avancado';
        const old = document.getElementById(modalId); if (old) old.remove();

        const html =
            '<div id="' + modalId + '" class="modal-overlay" style="display:flex; z-index:9999;">' +
            '<div class="modal-content" style="max-width:500px;">' +
            '<div class="modal-header"><h3>➕ Adicionar Item (Mesa ' + App.state.currentMesaNum + ')</h3><button onclick="document.getElementById(\'' + modalId + '\').remove()" class="btn btn-secondary btn-sm">X</button></div>' +
            '<div class="modal-body">' +
            '<div class="input-wrapper">' +
            '<label>Buscar Produto</label>' +
            '<input type="text" id="lancar-busca" class="input-field" placeholder="Digite o nome..." oninput="App.store.filtrarProdutosLancamento(this.value)">' +
            '<div id="lancar-lista-produtos" style="max-height:150px; overflow-y:auto; border:1px solid var(--border); margin-top:5px; display:none;"></div>' +
            '</div>' +

            '<div id="lancar-selecionado" style="background:var(--background); padding:10px; border-radius:8px; display:none; margin-bottom:15px; border:1px solid var(--primary);">' +
            '<strong id="lancar-sel-nome" style="color:var(--primary); font-size:1.1rem;"></strong>' +
            '<div style="display:flex; gap:10px; margin-top:10px;">' +
            '<div style="flex:1;"><label class="text-xs">Quantidade</label><input type="number" step="0.1" id="lancar-qtd" class="input-field" value="1"></div>' +
            '<div style="flex:2;"><label class="text-xs">Observação (Cozinha)</label><input type="text" id="lancar-obs" class="input-field" placeholder="Ex: Sem cebola, Com gelo..."></div>' +
            '</div>' +
            '<input type="hidden" id="lancar-sel-id"><input type="hidden" id="lancar-sel-preco"><input type="hidden" id="lancar-sel-ncm">' +
            '</div>' +

            '<button class="btn btn-success btn-full" onclick="App.store.confirmarLancamento()">✅ CONFIRMAR LANÇAMENTO</button>' +
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

        const area = document.getElementById('lancar-selecionado');
        area.style.display = 'block';
        document.getElementById('lancar-sel-nome').innerText = nome;
        document.getElementById('lancar-sel-id').value = id;
        document.getElementById('lancar-sel-preco').value = preco;
        document.getElementById('lancar-sel-ncm').value = ncm;
        document.getElementById('lancar-qtd').focus();
    },

    confirmarLancamento: async () => {
        const id = document.getElementById('lancar-sel-id').value;
        if (!id) {
            await NaxioUI.alert('⚠️ Atenção', 'Selecione um produto.', 'warning');
            return;
        }

        const nome = document.getElementById('lancar-sel-nome').innerText;
        const preco = parseFloat(document.getElementById('lancar-sel-preco').value);
        const qtd = parseFloat(document.getElementById('lancar-qtd').value) || 1;
        const obs = document.getElementById('lancar-obs').value.trim();
        const ncm = document.getElementById('lancar-sel-ncm').value;

        // 🔥 IDENTIFICAÇÃO DO GARÇOM
        const garcomNome = App.state.profile?.nome_completo || App.state.user?.email?.split('@')[0] || 'Caixa';

        // 🎁 VERIFICA PROMOÇÃO / HAPPY HOUR
        const promo = App.store.promo.getActiveDiscount();
        let finalPrice = preco;
        let originalPrice = null;
        let promoName = null;

        if (promo.val > 0) {
            originalPrice = preco;
            finalPrice = preco * (1 - promo.val);
            promoName = promo.name;
        }

        const novoItem = {
            id: id,
            nome: nome,
            price: finalPrice,
            qtd: qtd,
            ncm: App.store.validarNCM(ncm),
            observacao: obs,
            garcom: garcomNome,
            data_lancamento: new Date().toISOString(),
            original_price: originalPrice,
            promo_name: promoName
        };

        if (promoName) {
            App.utils.toast(`Promoção Ativa: ${promoName} (${(promo.val * 100).toFixed(0)}% OFF)`, "success");
        }

        // 🔥 VERIFICA SE É HORÁRIO DE RESERVA (09:00 - 11:30)
        const agora = new Date();
        const hora = agora.getHours();
        const minuto = agora.getMinutes();
        const horaAtual = hora + (minuto / 60);
        const isHorarioReserva = horaAtual >= 9 && horaAtual <= 11.5;

        let isReserva = false;
        if (isHorarioReserva) {
            isReserva = await NaxioUI.confirm(
                '📅 Reserva de Prato',
                'Este pedido é para reserva (almoço)?',
                'Sim, é Reserva',
                'Não, é Normal'
            );
        }

        const items = [...App.state.currentComandaItems, novoItem];

        const { error } = await _sb.from('comandas').update({
            items,
            status: 'ocupada', // Força status ocupada ao lançar item
            updated_at: new Date().toISOString()
        }).eq('id', App.state.currentComanda);
        if (error) {
            App.utils.toast("Erro ao lançar item: " + error.message, "error");
            return;
        }

        // 🔥 SE FOR RESERVA, ADICIONA NA LISTA DE RESERVAS DE PRATOS
        if (isReserva) {
            const { error: reservaError } = await _sb.from('reservas_pratos').insert({
                store_id: App.state.storeId,
                comanda_id: App.state.currentComanda,
                mesa_numero: App.state.currentMesaNum,
                garcom_nome: garcomNome,
                produto_nome: nome,
                quantidade: qtd,
                preco_unitario: preco,
                observacoes: obs,
                data_reserva: new Date().toISOString().split('T')[0],
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

        // --- ATUALIZAÇÃO UI ---
        App.state.currentComandaItems = items;
        // document.getElementById('modal-lancar-item-avancado').remove(); // REMOVIDO PARA EVITAR ERRO SE JÁ FECHADO
        const modal = document.getElementById('modal-lancar-item-avancado');
        if (modal) modal.remove();

        App.store.renderEditList(App.state.currentMesaNum, items);
        App.store.calcularTotaisComTaxa();

        // 🔥 ATUALIZA O CHECKOUT RÁPIDO SE ESTIVER ABERTO
        if (App.store.fastCheckoutComanda && App.store.fastCheckoutComanda.id === App.state.currentComanda) {
            App.store.fastCheckoutComanda.items = items;
            App.store.recalcularCheckoutRapido();
            // App.store.checkMesaRapida(); // Alternativa mais robusta
        }

        App.utils.toast("Item lançado! Lista atualizada.", "success");
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
                                <button class="btn btn-secondary" onclick="App.store.adjustQtd(-1)">-</button>
                                <input type="number" step="0.1" id="lancar-qtd" class="input-field" value="1" style="text-align:center; font-size:1.5rem;">
                                <button class="btn btn-secondary" onclick="App.store.adjustQtd(1)">+</button>
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

    adjustQtd: (delta) => {
        const el = document.getElementById('lancar-qtd');
        let val = parseFloat(el.value) || 1;
        val += delta;
        if (val < 0.1) val = 0.5; // Mínimo de meia porção se apertar pra baixo
        el.value = val;
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

        // Inicializa estado — padrão true, exceto 300
        App.store.state.activeTab = 'pedidos';
        App.store.state.comTaxa = (numero == 300 || numero == '300') ? false : true;

        // 🔥 AGUARDA dados frescos ANTES de renderizar para pegar tipo_comanda correto
        const mesaFresca = await App.store.fetchMesaDetails(numero);
        if (mesaFresca && (numero == 300 || numero == '300' || mesaFresca.tipo_comanda === 'interna')) {
            App.store.state.comTaxa = false;
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
                                <h2 style="margin:0; font-size:1.2rem;">Mesa ${numero}</h2>
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
            .tab-btn:hover { color: #f1f5f9; background: #334155; border-radius: 8px 8px 0 0; }
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

    fetchMesaDetails: async (num) => {
        const { data } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('numero', num).single();
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
        const itemsAgrupados = [];
        items.forEach(item => {
            // Agrupa se ID e OBSERVAÇÃO forem iguais
            const existe = itemsAgrupados.find(g => g.id === item.id && (g.observacao || '') === (item.observacao || ''));
            if (existe) {
                existe.qtd += parseInt(item.qtd);
                existe.totalPrice += (item.price * item.qtd);
            } else {
                itemsAgrupados.push({ ...item, totalPrice: item.price * item.qtd });
            }
        });

        const listHtml = itemsAgrupados.length > 0 ? itemsAgrupados.map(item => `
            <div class="comanda-item-row">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:bold; font-size:1.1rem; color:#f8fafc;">${item.qtd}x</span>
                        <span style="font-size:1rem; color:#e2e8f0;">${item.nome}</span>
                    </div>
                    ${item.observacao ? `<div style="font-size:0.85rem; color:#f59e0b; margin-top:2px;">📝 ${item.observacao}</div>` : ''}
                    <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">
                        👤 ${item.garcom || 'Sistema'} • ${new Date().toLocaleTimeString().slice(0, 5)}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:#4ade80;">R$ ${item.totalPrice.toFixed(2)}</div>
                    <button class="btn btn-sm" style="background:#ef4444; color:white; padding:4px 8px; border-radius:6px; margin-top:4px;" 
                            onclick="App.store.removeItemFromComanda('${item.id}', '${item.observacao || ''}')">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </div>
        `).join('') : '<div style="text-align:center; padding:40px; color:#64748b;">Nenhum item lançado ainda.</div>';

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
                            <input type="checkbox" id="taxa-global-check" ${App.store.state.comTaxa ? 'checked' : ''} onchange="App.store.toggleTaxa()"> 
                            Cobrar 10% (Serviço)
                        </label>
                    </div>
                </div>

                <!-- COLUNA DA DIREITA: AÇÕES RÁPIDAS -->
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <button class="btn btn-primary btn-lg" style="height:80px; font-size:1.1rem;" onclick="App.store.abrirModalLancarItem()">
                        <i class="ri-add-circle-line" style="font-size:1.5rem; display:block;"></i>
                        ADICIONAR ITEM (F2)
                    </button>
                    
                    <button class="btn btn-secondary" style="height:60px;" onclick="App.store.imprimirConferenciaInternal(App.state.currentComanda)">
                        <i class="ri-printer-line" style="font-size:1.2rem; display:block;"></i>
                        Imprimir Conferência
                    </button>

                    <div style="margin-top:auto; background:#0f172a; padding:15px; border-radius:12px; border:1px solid #334155;">
                        <h4 style="margin-top:0; color:#94a3b8;">Resumo</h4>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span>Subtotal</span>
                            <span>R$ ${items.reduce((a, b) => a + (b.price * b.qtd), 0).toFixed(2)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px; color:#f59e0b;">
                            <span>Serviço (10%)</span>
                            <span id="resumo-taxa">R$ 0,00</span>
                        </div>
                        <button class="btn btn-success btn-full" onclick="App.store.switchTab('pagamento')">
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
        const taxa = comTaxa ? subtotalToPay * 0.10 : 0;
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
            '</div>' +

            '<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">' +
            '<button class="btn btn-primary btn-full" style="height:55px; font-size:1.1rem; background:linear-gradient(135deg, #10b981, #059669);" onclick="App.store.processarPagamento(\'Dinheiro\', ' + totalFinal + ')">' +
            '<i class="ri-money-dollar-circle-line"></i> DINHEIRO / PIX' +
            '</button>' +
            '<button class="btn btn-secondary btn-full" style="height:50px;" onclick="App.store.processarPagamento(\'Cartão\', ' + totalFinal + ')">' +
            '<i class="ri-bank-card-line"></i> CARTÃO CRÉDITO/DÉBITO' +
            '</button>' +
            '<button class="btn btn-ghost btn-full" onclick="App.store.abrirModalMisto(' + totalFinal + ')">' +
            '<i class="ri-shuffle-line"></i> FORMAS MISTAS' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    },

    // --- ABA INFO & AÇÕES (Nova implementação) ---
    renderTabInfo: (container, num) => {
        container.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:20px;">
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
                 <div class="action-card" style="border-color:#ef4444;" onclick="if(confirm('Tem certeza que deseja cancelar esta comanda?')) { App.store.liberarMesa(App.state.currentComanda); }">
                    <i class="ri-close-circle-line" style="font-size:3rem; color:#ef4444; margin-bottom:15px; display:block;"></i>
                    <h3 style="margin:0; color:#ef4444;">Cancelar / Liberar Mesa</h3>
                    <p style="color:#94a3b8; font-size:0.9rem;">Limpa a mesa sem registrar pagamento.</p>
                </div>
            </div>
        `;
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
            return alert("Selecione pelo menos um item para pagamento parcial.");
        }

        if (valor <= 0) return alert("Valor inválido.");

        const nomeCliente = document.getElementById('pag-nome')?.value;
        const cpfCliente = document.getElementById('pag-cpf')?.value;

        if (!confirm("Confirmar recebimento de R$ " + valor.toFixed(2) + " em " + metodo + "?")) return;

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

    // Finaliza comanda (Total ou Parcial)
    finalizarFechamentoComanda: async (payments, totalPago, itemsPagos, itemsRestantes, cpf, nome) => {
        const comandaId = App.state.currentComanda;

        App.utils.toast("Processando pagamento...", "info");

        // 1. Lógica Total vs Parcial
        const isTotal = itemsRestantes.length === 0;
        const novoStatus = isTotal ? 'livre' : 'ocupada'; // Só libera se não sobrar itens

        // 2. Atualiza Comanda (Atualiza items para apenas os restantes)
        const { error } = await _sb.from('comandas').update({
            status: novoStatus,
            items: itemsRestantes, // Salva apenas o que sobrou
            total_pago: isTotal ? 0 : undefined, // Se livre, zera. Se ocupada, mantem? Não, comandas não guarda histórico de parcial no 'total_pago' direto, melhor zerar ou ignorar.
            // O ideal para parcial é não mexer no total_pago acumulado da mesa, pois ele reseta quando 'livre'.
            updated_at: new Date().toISOString()
        }).eq('id', comandaId);

        if (error) return alert("Erro ao atualizar comanda: " + error.message);

        // 3. Cria Order (Venda) APENAS dos itens pagos
        const obsJson = JSON.stringify({
            mesa: App.state.currentMesaNum,
            vendedor: App.state.profile?.nome_completo || 'Sistema',
            tipo: isTotal ? 'Fechamento Total' : 'Pagamento Parcial',
            itens: itemsPagos
        });

        // Grava Order
        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalPago,
            metodo_pagamento: payments[0].method,
            session_id: Caixa?.state?.session?.id,
            observacao: obsJson,
            cliente_nome: nome,
            cliente_cpf: cpf,
            created_at: new Date().toISOString()
        }).select().single();

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
            document.getElementById('comanda-modal-tabs').remove(); // Fecha tudo
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
        if (confirm("Recebido! Deseja emitir Nota Fiscal (NFC-e)?")) {
            const itensParaFiscal = await App.store.enriquecerItensComNCM(itemsPagos);

            // Corrige payload fiscal de pagamentos
            const paymentsParaFiscal = payments.map(p => ({
                code: p.code,
                val: p.val,
                tipo: p.method,
                metodo: p.method,
                payment_method: p.method,
                valor: p.val,
                amount: p.amount
            }));

            App.fiscal.emitirNFCeComanda(newOrder.id, App.state.storeId, itensParaFiscal, paymentsParaFiscal, cpf, nome);
        }
    },

    // --- REALTIME DELETE (atualiza lista na hora, sem recarregar) ---
    removeItemFromComanda: async (itemId, obs) => {
        if (!confirm("Excluir este item?")) return;

        const norm = (v) => (v == null || v === '') ? '' : String(v);
        let items = [...App.state.currentComandaItems];
        const idx = items.findIndex(i => norm(i.id || i.product_id) === norm(itemId) && norm(i.observacao) === norm(obs));
        if (idx === -1) {
            App.utils.toast("Item não encontrado na lista.", "error");
            return;
        }
        const removido = items[idx];
        items.splice(idx, 1);
        App.state.currentComandaItems = items;
        App.store.renderEditList(App.state.currentMesaNum, items);
        App.store.calcularTotaisComTaxa();

        const { error } = await _sb.from('comandas').update({ items, updated_at: new Date().toISOString() }).eq('id', App.state.currentComanda);
        if (error) {
            App.state.currentComandaItems = [...items.slice(0, idx), removido, ...items.slice(idx)];
            App.store.renderEditList(App.state.currentMesaNum, App.state.currentComandaItems);
            App.store.calcularTotaisComTaxa();
            App.utils.toast("Erro ao remover: " + error.message, "error");
            return;
        }
        App.utils.toast("Item removido! Lista atualizada.", "success");
    },

    // 🔥 NOVA FUNÇÃO: TRANSFERIR MESA
    transferirMesa: async () => {
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
            guide_id: null
        }).eq('id', App.state.currentComanda);

        App.utils.toast("Transferido da " + App.state.currentMesaNum + " para " + destino + "!", "success");
        // Tenta remover os modais possíveis
        if (document.getElementById('split-pay-modal')) document.getElementById('split-pay-modal').remove();
        if (document.getElementById('comanda-modal-tabs')) document.getElementById('comanda-modal-tabs').remove();

        App.store.loadComandas();
    },


    // 🔥 TRANSFERÊNCIA DE ITENS (PARCIAL)
    abrirModalTransferenciaItens: () => {
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
            const key = String(pid) + '-' + (i.observacao || '');
            const qtd = parseInt(i.qtd, 10) || 1;
            const preco = parseFloat(i.price) || 0;
            if (!agrupados[key]) {
                agrupados[key] = { nome: i.nome || i.name || 'Item', observacao: i.observacao || '', garcom: i.garcom, qtd: 0, total: 0 };
            }
            agrupados[key].qtd += qtd;
            agrupados[key].total += preco * qtd;
            subtotal += preco * qtd;
        });

        const taxa = comTaxa ? subtotal * 0.10 : 0;
        const total = subtotal + taxa;

        let linhas = '';
        Object.values(agrupados).forEach(item => {
            const nomeSafe = (item.nome || 'Item').toString().toUpperCase();
            var obsLine = item.observacao ? '<div style="font-size:12px;">(Obs: ' + item.observacao + ')</div>' : '';

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
            '<h2 style="margin:0; font-weight:900;">MESA ' + num + '</h2>' +
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
            '<br><br>.' +
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
        App.store.fastCheckoutComanda = {
            id: App.state.currentComanda,
            numero: App.state.currentMesaNum,
            items: App.state.currentComandaItems,
            calc_total: total,
            calc_taxa: total - (total / 1.1) // aprox
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

            // Fecha direto sem pagamento
            await _sb.from('comandas').update({
                status: 'fechada',
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
                const key = (item.id || item.product_id) + '-' + (item.observacao || '');
                const qtd = parseInt(item.qtd) || 1;
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

        const modalHtml =
            '<div id="modal-fechamento-mesa" class="modal-overlay" style="display:flex; z-index:9999; align-items:center; justify-content:center;">' +
            '<div class="modal-content" style="max-width:500px; width:95%; background:#1e293b !important; border:1px solid #334155;">' +
            '<div class="modal-header" style="background:#0f172a; border-bottom:1px solid #334155;">' +
            '<h3 style="color:#f1f5f9;">🍽️ Fechamento Mesa ' + comanda.numero + '</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'modal-fechamento-mesa\').remove()">X</button>' +
            '</div>' +

            '<div class="modal-body" style="background:#1e293b !important; color:#f1f5f9;">' +
            '<div style="max-height:200px; overflow-y:auto; background:#0f172a !important; color:#f1f5f9 !important; padding:12px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">' +
            '<h5 style="margin-top:0; color:#94a3b8; font-size:0.85rem;">CONSUMO DETALHADO</h5>' +
            '<div style="color:#e2e8f0;">' + itensHtml + '</div>' +
            '</div>' +

            '<div style="text-align:right; margin-bottom:15px;">' +
            '<h1 style="color:var(--primary); margin:0;">Total: R$ ' + totalConsumo.toFixed(2) + '</h1>' +
            '</div>' +

            '<!-- 🧮 CALCULADORA DE DIVISÃO -->' +
            '<div style="background:#0f172a; padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid #334155; display:flex; gap:10px; align-items:center;">' +
            '<span style="color:#94a3b8; font-size:0.9rem;">👥 Dividir por:</span>' +
            '<input type="number" id="split-people" value="1" min="1" style="width:60px; text-align:center; background:#1e293b; border:1px solid #334155; color:#f1f5f9; padding:5px; border-radius:4px;" oninput="App.store.updateSplit(this.value, ' + totalConsumo + ')">' +
            '<span id="split-result" style="font-weight:bold; color:#4ade80;">= R$ ' + totalConsumo.toFixed(2) + '</span>' +
            '</div>' +

            '<div style="background:#0f172a; padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid #334155;">' +
            '<label style="font-size:0.8rem; color:#94a3b8; display:block; margin-bottom:5px;">📄 Nota Fiscal & Comprovante</label>' +
            '<div style="display:flex; gap:5px; margin-bottom:10px;">' +
            '<input type="text" id="mesa-cpf-nota" class="input-field" placeholder="CPF/CNPJ" style="flex:1; background:#1e293b; border-color:#334155; color:#f1f5f9;">' +
            '<input type="text" id="mesa-nome-nota" class="input-field" placeholder="Nome do Cliente" style="flex:2; background:#1e293b; border-color:#334155; color:#f1f5f9;">' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
            '<input type="checkbox" id="send-zap-mesa" style="width:18px; height:18px; cursor:pointer;">' +
            '<label for="send-zap-mesa" style="cursor:pointer; color:#f1f5f9; font-size:0.9rem;">Enviar comprovante no WhatsApp</label>' +
            '</div>' +
            '</div>' +

            '<div class="multi-pay-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +
            '<div class="pay-method-box" style="border-left: 4px solid #10b981; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#94a3b8;">💵 Dinheiro</label>' +
            '<input type="number" id="mesa-pay-money" class="pay-input input-field" placeholder="0.00" oninput="App.store.calcRestanteMesa(' + totalConsumo + ')" style="background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '</div>' +
            '<div class="pay-method-box" style="border-left: 4px solid #3b82f6; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#94a3b8;">💠 Pix</label>' +
            '<input type="number" id="mesa-pay-pix" class="pay-input input-field" placeholder="0.00" oninput="App.store.calcRestanteMesa(' + totalConsumo + ')" style="background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '</div>' +
            '<div class="pay-method-box" style="border-left: 4px solid #f59e0b; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#94a3b8;">💳 Crédito</label>' +
            '<input type="number" id="mesa-pay-credit" class="pay-input input-field" placeholder="0.00" oninput="App.store.calcRestanteMesa(' + totalConsumo + ')" style="background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '</div>' +
            '<div class="pay-method-box" style="border-left: 4px solid #6366f1; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#94a3b8;">💳 Débito</label>' +
            '<input type="number" id="mesa-pay-debit" class="pay-input input-field" placeholder="0.00" oninput="App.store.calcRestanteMesa(' + totalConsumo + ')" style="background:#1e293b; color:#f1f5f9; border-color:#334155;">' +
            '</div>' +
            '<div class="pay-method-box" style="border-left: 4px solid #ef4444; padding:10px; background:#0f172a !important; border:1px solid #334155; border-radius:8px; grid-column: span 2;">' +
            '<label style="font-size:0.8rem; font-weight:bold; color:#f87171;">🏷️ Desconto</label>' +
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
        setTimeout(() => document.getElementById('mesa-pay-money').focus(), 100);
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

        const money = parseFloat(document.getElementById('mesa-pay-money').value) || 0;
        const pix = parseFloat(document.getElementById('mesa-pay-pix').value) || 0;
        const credit = parseFloat(document.getElementById('mesa-pay-credit').value) || 0;
        const debit = parseFloat(document.getElementById('mesa-pay-debit').value) || 0;
        const desconto = parseFloat(document.getElementById('mesa-pay-desconto').value) || 0;

        const pago = money + pix + credit + debit;
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
        }
    },

    confirmarFechamentoMesa: async () => {
        const comanda = App.store.fastCheckoutComanda;
        if (!comanda) return;

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

        // Coleta Multi-Meios
        const paymentsRaw = [
            { method: 'Dinheiro', amount: parseFloat(document.getElementById('mesa-pay-money').value) || 0 },
            { method: 'Pix', amount: parseFloat(document.getElementById('mesa-pay-pix').value) || 0 },
            { method: 'Credit', amount: parseFloat(document.getElementById('mesa-pay-credit').value) || 0 },
            { method: 'Debit', amount: parseFloat(document.getElementById('mesa-pay-debit').value) || 0 }
        ].filter(p => p.amount > 0);

        const desconto = parseFloat(document.getElementById('mesa-pay-desconto').value) || 0;

        // Se deu desconto total (100%), pode não ter payments
        if (paymentsRaw.length === 0 && desconto === 0) return alert("Informe pagamento ou desconto.");

        // 🔥 ESTRUTURA DUAL: {method, amount} + {code, val}
        const payments = paymentsRaw.map(p => ({
            method: p.method,
            amount: p.amount,
            code: mapaCodigos[p.method] || '99',
            val: p.amount
        }));

        document.getElementById('modal-fechamento-mesa').remove();
        App.utils.toast("Fechando mesa...", "info");

        const totalPago = payments.reduce((acc, p) => acc + p.amount, 0);

        // 1. Atualiza Comanda
        const { error } = await _sb.from('comandas').update({
            status: 'livre', // 🔥 Libera a mesa e zera para o próximo
            items: [],       // 🔥 Limpa os itens da mesa (já salvos em orders)
            total_pago: totalPago,
            payments_info: payments,
            obs_geral: null, // 🔥 Limpa tag do Caixa logado
            updated_at: new Date().toISOString()
        }).eq('id', comanda.id);

        if (error) return alert("Erro ao fechar: " + error.message);

        // 2. Cria Order COM RETORNO
        const obsJson = JSON.stringify({
            mesa: comanda.numero,
            vendedor: App.state.profile?.nome_completo || 'Sistema',
            pagamentos: payments,
            desconto: desconto,
            itens: comanda.items || []
        });

        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalPago, // Valor líquido recebido
            taxa_servico: comanda.calc_taxa, // Taxa aplicada
            observacao: obsJson, // 🔥 INFO COMPLETA PARA RELATÓRIO
            session_id: Caixa.state.session.id,
            metodo_pagamento: payments.length > 1 ? 'Multiplos' : (payments[0]?.method || 'Desconto Total'),
            created_at: new Date().toISOString()
        }).select().single();

        // 3. Baixa Estoque
        if (comanda.items && comanda.items.length > 0) {
            const contagem = {};
            comanda.items.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + (p.qtd || 1); });
            const itensParaBaixar = Object.keys(contagem).map(prodId => ({ id: prodId, qtd: contagem[prodId] }));
            _sb.rpc('descontar_estoque', { itens: itensParaBaixar });
        }

        App.utils.toast("Mesa " + comanda.numero + " Encerrada!", "success");
        if (Caixa && Caixa.calcTotals) await Caixa.calcTotals();
        document.getElementById('checkout-mesa-num').value = '';
        document.getElementById('checkout-resumo').style.display = 'none';

        // 🔥 Remove mesa do registro deste caixa (localStorage)
        const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
        localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds.filter(n => n != comanda.numero)));

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
                amount: p.amount
            }));

            console.log("📦 Payload Fiscal (Checkout Rápido):", {
                order_id: newOrder.id,
                store_id: App.state.storeId,
                items_payload: itensParaFiscal,
                payments_payload: paymentsParaFiscal
            });

            setTimeout(() => {
                if (confirm("📄 Emitir NFC-e agora?")) {
                    App.fiscal.emitirNFCeComanda(
                        newOrder.id,
                        App.state.storeId,
                        itensParaFiscal,
                        paymentsParaFiscal,
                        cpfNota,
                        nomeNota,
                        { discount: desconto } // Passa desconto no final
                    );
                }

                // --- WHATSAPP ---
                setTimeout(() => {
                    const sendZap = document.getElementById('send-zap-mesa');
                    if (sendZap && sendZap.checked) {
                        const tel = prompt("📱 Digite o WhatsApp (com DDD):");
                        if (tel) {
                            const itensTexto = (comanda.items || []).map(i => (i.qtd || 1) + "x " + (i.nome || 'Item') + " ").join('%0A');
                            const msg = "* MESA " + comanda.numero + " - FECHADA *%0A%0A" + itensTexto + "%0A%0ATotal: R$ " + totalPago.toFixed(2) + "%0A%0ASeu pedido foi um prazer!";
                            window.open("https://wa.me/" + tel.replace(/\D/g, '') + "?text=" + msg, '_blank');
                        }
                    }
                }, 1000);
            }, 500);
        }
    },

    // --- FECHAMENTO VIA MODAL DE DETALHES ---
    fecharMesaViaModal: async () => {
        if (typeof Caixa === 'undefined' || !Caixa.state.session) {
            alert("🚫 CAIXA FECHADO\n\nAbra o caixa antes de receber valores.");
            return;
        }

        const comandaId = App.state.currentComanda;
        const mesaNum = App.state.currentMesaNum;
        const items = App.state.currentComandaItems;

        if (!comandaId || !items) {
            alert("Erro: Dados da comanda não encontrados.");
            return;
        }

        // Busca comanda completa do banco
        const { data: comanda } = await _sb.from('comandas').select('*').eq('id', comandaId).single();
        if (!comanda) {
            alert("Erro ao buscar comanda.");
            return;
        }

        // Calcula totais
        const subtotal = items.reduce((acc, i) => acc + (i.price * i.qtd), 0);
        const cobrar10 = App.store.state.comTaxa;
        const taxa = cobrar10 ? subtotal * 0.10 : 0;
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
            alert("Forma de pagamento inválida.");
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
            status: 'livre', // 🔥 Libera a mesa e zera para o próximo
            items: [],       // 🔥 Limpa os itens da mesa
            total_pago: totalFinal,
            payments_info: payments,
            obs_geral: null, // 🔥 Limpa tag do Caixa logado
            updated_at: new Date().toISOString()
        }).eq('id', comandaId);

        if (error) return alert("Erro ao fechar: " + error.message);

        // 2. Cria Order COM RETORNO
        const { data: newOrder } = await _sb.from('orders').insert({
            store_id: App.state.storeId,
            status: 'concluido',
            origem_venda: 'comanda',
            total_pago: totalFinal,
            taxa_servico: taxa,
            observacao: "Mesa " + mesaNum + " | Fechado por: " + (App.state.profile?.nome_completo || 'Sistema'),
            session_id: Caixa.state.session.id,
            metodo_pagamento: pagamento.method,
            created_at: new Date().toISOString()
        }).select().single();

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

            setTimeout(() => {
                if (confirm("📄 Emitir NFC-e agora?")) {
                    App.fiscal.emitirNFCeComanda(
                        newOrder.id,
                        App.state.storeId,
                        itensParaFiscal,
                        paymentsParaFiscal,
                        null, // CPF via modal detalhes ainda não implementado visualmente, passando null
                        null
                    );
                }
            }, 500);
        }
    },

    calcularTotaisComTaxa: () => {
        const items = App.state.currentComandaItems || [];
        const subtotal = items.reduce((acc, i) => acc + (i.price * i.qtd), 0);
        const taxa = App.store.state.comTaxa ? subtotal * 0.10 : 0;
        const total = subtotal + taxa;
        if (document.getElementById('modal-total-final'))
            document.getElementById('modal-total-final').innerText = "R$ " + total.toFixed(2);
    },

    // --- GERENCIAMENTO DE COMANDA ---
    manageComanda: async (id, itemsStr, numero, status) => {
        try {
            const items = typeof itemsStr === 'string' ? JSON.parse(decodeURIComponent(itemsStr)) : (itemsStr || []);
            App.state.currentComanda = id;
            App.state.currentComandaItems = items;
            App.state.currentMesaNum = numero;

            if (status === 'livre') {
                // Mesa livre: Abre direto para lançar
                if (confirm("Abrir Mesa " + numero + "?")) {
                    const { error } = await _sb.from('comandas').update({
                        status: 'ocupada',
                        updated_at: new Date().toISOString()
                    }).eq('id', id);
                    if (error) return alert("Erro ao abrir mesa: " + error.message);

                    // 🔥 Registra esta mesa como pertencente a ESTE caixa (no localStorage)
                    const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
                    if (!mesasIds.includes(numero)) mesasIds.push(numero);
                    localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds));

                    App.store.loadComandas(); // Atualiza visual
                    App.store.abrirModalLancarItem(); // Abre lançador
                }
            } else {
                // Mesa Ocupada: Auto-assume esta mesa para este caixa
                const mesasIds = JSON.parse(localStorage.getItem('caixa_mesas_ids') || '[]');
                if (!mesasIds.includes(numero)) {
                    mesasIds.push(numero);
                    localStorage.setItem('caixa_mesas_ids', JSON.stringify(mesasIds));
                    App.utils.toast("Você assumiu a Mesa " + numero, "info");
                }

                // Mesa Ocupada: Abre Detalhes
                App.store.abrirDetalhesMesa(numero, items);
            }
        } catch (e) {
            console.error("Erro manageComanda:", e);
            alert("Erro ao gerenciar mesa.");
        }
    },

    // --- UI: NOVO MODAL DE DETALHES (TABBED INTERFACE) ---
    abrirDetalhesMesa: (numero, items) => {
        const old = document.getElementById('comanda-modal-tabs');
        if (old) old.remove();

        // Inicializa estado
        App.store.state.activeTab = 'pedidos';

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
            '<h2 style="margin:0; font-size:1.2rem;">Mesa ' + numero + '</h2>' +
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
            '<button class="tab-btn active" onclick="App.store.switchTab(\'pedidos\')" id="tab-btn-pedidos">' +
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

        // Busca dados frescos da mesa
        App.store.fetchMesaDetails(numero).then(mesa => {
            if (mesa) {
                const tempo = App.store.getTempoDecorrido(mesa.updated_at || mesa.created_at);
                const cor = App.store.getTempoColor(mesa.updated_at || mesa.created_at);
                const elTempo = document.getElementById('mesa-tempo-header');
                if (elTempo) {
                    elTempo.innerText = tempo;
                    elTempo.style.color = cor;
                }
            }
        });

        App.store.renderActiveTab(numero, items);
    },

    fetchMesaDetails: async (num) => {
        const { data } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('numero', num).single();
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
        if (!inicio || !fim || inicio > fim) return alert("Intervalo inválido.");

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
        if (encontrados.length === 0) return alert("Produto não encontrado.");

        let produto = encontrados[0];
        const qtd = 1;

        if (!confirm("Lançar \"1x " + produto.nome + "\"(R$ " + produto.preco + ") nas mesas " + inicio + " a " + fim + "?")) return;

        App.utils.toast("Lançando...", "info");
        const { data: mesas } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('status', 'aberta').gte('numero', inicio).lte('numero', fim);

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
            await _sb.from('comandas').update({ items }).eq('id', mesa.id);
        }

        App.utils.toast("Lançado em " + mesas.length + " mesas!", "success");
        App.store.loadComandas();
    },

    abrirLote: async () => {
        const inicio = parseInt(document.getElementById('lote-inicio').value);
        const fim = parseInt(document.getElementById('lote-fim').value);
        const tipo = document.querySelector('input[name="quick-tipo"]:checked').value;
        const guiaId = document.getElementById('lote-guia').value;
        if (!inicio || !fim || inicio > fim) return alert("Intervalo inválido.");
        if (fim - inicio > 50) return alert("Máximo 50 mesas por vez.");
        if (!confirm("Abrir mesas " + inicio + " a " + fim + " (" + tipo + ") ?")) return;
        App.utils.toast("Criando mesas...", "info");
        const mesas = [];
        for (let i = inicio; i <= fim; i++) {
            // 🔥 Tagging invisível da comanda para isolar por Caixa
            let tagCaixa = null;
            if (typeof Caixa !== 'undefined' && Caixa.state?.session?.nome) {
                tagCaixa = `[_CX_${Caixa.state.session.nome}_]`;
            }

            mesas.push({
                store_id: App.state.storeId,
                numero: i,
                status: 'livre', // 🔥 Cria como LIVRE por padrão
                tipo_comanda: tipo,
                guide_id: guiaId || null,
                obs_geral: tagCaixa, // Associa a comanda a este caixa
                items: []
            });
        }
        await _sb.from('comandas').upsert(mesas, { onConflict: 'store_id,numero' });
        App.utils.toast("Mesas abertas!", "success");
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

    loadComandas: async () => {
        const grid = document.getElementById('comandas-advanced-grid');
        if (!grid) return;
        const filtro = App.store.comandaFilters.active;

        let q = _sb.from('comandas').select('*, guides(name)').eq('store_id', App.state.storeId).order('numero');
        // Se filtro for 'aberta', trazemos tudo que não é 'fechada' para mostrar no grid

        const { data } = await q;

        grid.innerHTML = data.map(c => {
            // Filtragem Client-Side para agilidade
            if (filtro === 'fechada' && c.status !== 'fechada') return '';
            if (filtro !== 'fechada' && c.status === 'fechada') return '';

            const isLivre = c.status === 'livre' || (c.status === 'aberta' && (!c.items || c.items.length === 0));

            const style = isLivre
                ? 'border-color:#22c55e; background:#dcfce7;'
                : 'border-color:#ef4444; background:#fee2e2;';

            const statusTxt = isLivre ? 'LIVRE' : 'OCUPADA';
            const total = c.items?.reduce((a, b) => a + (b.price * b.qtd), 0) || 0;
            const guide = c.guides?.name?.split(' ')[0] || '';
            const tipo = c.tipo_comanda === 'interna' ? '🏠 INT' : '';

            // Safe items string
            const itemsSafe = encodeURIComponent(JSON.stringify(c.items || []));

            return '<div onclick="App.store.manageComanda(\'' + c.id + '\', \'' + itemsSafe + '\', \'' + c.numero + '\', \'' + (isLivre ? 'livre' : 'ocupada') + '\')"' +
                ' style="border:2px solid; border-radius:10px; padding:10px; cursor:pointer; text-align:center; position:relative; ' + style + ' user-select:none; transition:transform 0.1s;"' +
                ' onmousedown="this.style.transform=\'scale(0.95)\'" onmouseup="this.style.transform=\'scale(1)\'">' +
                (guide ? '<div style="position:absolute; top:5px; right:5px; font-size:10px; background:#000; color:#fff; padding:2px 4px; border-radius:4px;">' + guide + '</div>' : '') +
                '<div style="font-size:1.8rem; font-weight:bold; color:#1e293b;">' + c.numero + '</div>' +
                '<div style="font-size:0.8rem; font-weight:bold;">' + statusTxt + ' ' + tipo + '</div>' +
                (!isLivre ? '<div style="margin-top:5px; font-weight:bold; color:#334155;">R$ ' + total.toFixed(2) + '</div>' : '') +
                '</div>';
        }).join('');
    },

    filterHistory: async () => {
        const dateStr = document.getElementById('filtro-data-fechadas').value;
        const container = document.getElementById('lista-fechadas-resultado');
        container.innerHTML = 'Carregando...';

        const { data } = await _sb.from('comandas')
            .select('*, guides(name)')
            .eq('store_id', App.state.storeId)
            .eq('status', 'fechada')
            .gte('updated_at', dateStr + 'T00:00:00')
            .lte('updated_at', dateStr + 'T23:59:59')
            .order('numero');

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Nenhuma venda encontrada nesta data.</p>';
            return;
        }

        container.innerHTML =
            '<table style="width:100%; font-size:0.9rem; border-collapse:collapse;">' +
            '<thead>' +
            '<tr style="background:#f1f5f9; text-align:left;">' +
            '<th style="padding:8px;">Mesa</th>' +
            '<th style="padding:8px;">Guia</th>' +
            '<th style="padding:8px;">Total</th>' +
            '<th style="padding:8px;">Hora</th>' +
            '</tr>' +
            '</thead>' +
            '<tbody>' +
            data.map(c =>
                '<tr style="border-bottom:1px solid #e2e8f0;">' +
                '<td style="padding:8px;">' + c.numero + '</td>' +
                '<td style="padding:8px;">' + (c.guides?.name || '-') + '</td>' +
                '<td style="padding:8px;">R$ ' + (c.total_pago?.toFixed(2)) + '</td>' +
                '<td style="padding:8px;">' + new Date(c.updated_at).toLocaleTimeString().slice(0, 5) + '</td>' +
                '</tr>').join('') +
            '</tbody>' +
            '</table>';
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

        const response = await fetch('/api/emitir_fiscal', {
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
                const win = window.open('', '_blank');
                if (win) {
                    win.document.write("<iframe width='100%' height='100%' src='" + result.pdf + "'></iframe>");
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

            alert(alertMsg);
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
// 👨‍🍳 MÓDULO KDS (KITCHEN DISPLAY SYSTEM) - VISUALIZAÇÃO DE COZINHA
// --------------------------------------------------------------------------------------
App.store.kitchen = {
    openDisplay: async () => {
        const old = document.getElementById('view-kds');
        if (old) old.remove();

        const view = document.createElement('section');
        view.id = 'view-kds';
        view.className = 'view-section container-fluid';
        view.style.background = '#000';
        view.style.minHeight = '100vh';
        view.style.padding = '10px';

        view.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">' +
            '<h2 style="color:#fff; margin:0;"><i class="ri-fire-line" style="color:#ef4444;"></i> KDS - Cozinha</h2>' +
            '<button class="btn btn-secondary btn-sm" onclick="App.router.go(\'gestao-salao\')">Sair da Cozinha</button>' +
            '</div>' +
            '<div id="kds-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:15px;">' +
            '<div style="color:#666; text-align:center; grid-column:1/-1; padding:50px;">Aguardando pedidos...</div>' +
            '</div>';

        document.querySelector('main').appendChild(view);
        App.router.go('kds'); // Helper fictício ou assume troca de view

        // Inicia loop de busca de itens "enviados para cozinha" (mock)
        // Na prática, buscaria itens com status 'pending' dentro do JSON de items das comandas ocupadas
        App.store.kitchen.startMonitor();
    },

    startMonitor: () => {
        if (App.store.kitchenInterval) clearInterval(App.store.kitchenInterval);

        const fetchKDS = async () => {
            const grid = document.getElementById('kds-grid');
            if (!grid) return;

            const { data: comandas } = await _sb.from('comandas').select('*').eq('store_id', App.state.storeId).eq('status', 'ocupada');

            let html = '';
            // Simulação: Mostra todas as comandas ocupadas como "pedidos em aberto"
            // Num sistema real, filtraria apenas itens com flag { cozinha: 'pendente' }

            if (comandas && comandas.length > 0) {
                html = comandas.map(c => {
                    const items = c.items || [];
                    if (items.length === 0) return '';

                    const time = App.store.getTempoDecorrido(c.updated_at);
                    const isLate = parseInt(time) > 30; // 30 min alerta

                    return '<div style="background:#1e293b; border:2px solid ' + (isLate ? '#ef4444' : '#334155') + '; border-radius:8px; overflow:hidden;">' +
                        '<div style="background:' + (isLate ? '#ef4444' : '#0f172a') + '; padding:10px; color:#fff; display:flex; justify-content:space-between; font-weight:bold;">' +
                        '<span>Mesa ' + c.numero + '</span>' +
                        '<span>' + time + '</span>' +
                        '</div>' +
                        '<div style="padding:10px;">' +
                        items.map(i =>
                            '<div style="display:flex; gap:10px; margin-bottom:5px; border-bottom:1px solid #333; padding-bottom:5px;">' +
                            '<div style="color:#fbbf24; font-weight:bold;">' + i.qtd + 'x</div>' +
                            '<div style="color:#e2e8f0; flex:1;">' + i.nome + '</div>' +
                            '</div>'
                        ).join('') +
                        '</div>' +
                        '<div style="padding:10px; text-align:center; background:#0f172a;">' +
                        '<button class="btn btn-success btn-sm btn-full" onclick="alert(\'Pedido Pronto!\')">PRONTO ✅</button>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            if (!html) html = '<div style="color:#666; text-align:center; grid-column:1/-1; padding:50px;">Aguardando pedidos...</div>';
            grid.innerHTML = html;
        };

        App.store.kitchenInterval = setInterval(fetchKDS, 10000); // 10s update
        fetchKDS();
    },

    stop: () => {
        if (App.store.kitchenInterval) clearInterval(App.store.kitchenInterval);
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

    }
}; // End Object.assign(App.store, { ... })

// 🔥 MÓDULO DE RELATÓRIOS & ANALYTICS (App.store.reports)
App.store.reports = {
    charts: {}, // Armazena instâncias do Chart.js

    openDashboard: async () => {
        // Redireciona para o Painel Completo (Restaurado a pedido do cliente)
        if (typeof PainelRelatorios !== 'undefined') {
            PainelRelatorios.open();
        } else {
            alert("Módulo de Relatórios (PainelRelatorios) não encontrado.");
        }
    },
};

if (!window.metricsInitialized) { window.metricsInitialized = true; console.log('Analytics Engine Ready'); }

if (!window.metricsInitialized) { window.metricsInitialized = true; console.log('Analytics Engine Ready'); }
