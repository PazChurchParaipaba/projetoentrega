// Auth está em modules_auth.js (carregado antes)
Object.assign(App, {

    // =============================================================================
    // 🏪 MÓDULO DE LOJA (GESTÃO)
    // =============================================================================
    store: {
        init: async () => {
            if (!App.state.user) return;

            // ⚡ ETAPA 1: Só o essencial — carregar registro da loja (1 query)
            let store = null;

            if (App.state.storeId) {
                const { data } = await _sb.from('stores').select('*').eq('id', App.state.storeId).maybeSingle();
                store = data;
            }

            if (!store && App.state.profile?.role === 'loja_admin') {
                let { data: stores } = await _sb.from('stores').select('*').eq('admin_id', App.state.user.id);
                if (stores && stores.length > 0) {
                    store = stores[0];
                } else {
                    console.log("Criando Loja Nova...");
                    const { data: newStore } = await _sb.from('stores').insert({
                        admin_id: App.state.user.id,
                        nome_loja: 'Loja Nova'
                    }).select().single();
                    store = newStore;
                }
            }

            if (!store) { console.error("Loja não encontrada."); return; }

            App.state.storeId = store.id;
            App.state.currentStore = store;

            // ⚡ ETAPA 2: Renderiza painel IMEDIATAMENTE com os dados da loja (síncrono)
            const tl = store.tipo_loja ? store.tipo_loja.toLowerCase() : "";
            const isRestaurante = store.tipo_loja === 'Restaurante';
            const isRoupas = store.tipo_loja === 'Roupas' || store.tipo_loja === 'Varejo';
            const isAuto = tl.includes('auto') || tl.includes('peca') || tl.includes('oficina') || tl.includes('mecanic') || tl.includes('mecânic');

            // Atualiza UI instantaneamente
            const lojaHeaderInfo = document.querySelector('#loja-header-info');
            if (lojaHeaderInfo) {
                const user = App.state.profile || {};
                const roleLabel = user.role === 'caixa' ? ' <span style="font-size:0.7rem; background:var(--primary); color:#000; padding:2px 6px; border-radius:4px; vertical-align:middle; margin-left:5px;">CAIXA</span>' : '';
                const cnpjHtml = store.cnpj ? `<p style="margin:0; font-size:0.85rem; color:var(--text-muted); padding-bottom:5px;">CNPJ: ${store.cnpj}</p>` : '';
                lojaHeaderInfo.innerHTML = `<div style="display:flex; flex-direction:column;">
                    <h2 class="brand-text" style="margin:0; line-height:1.2; padding-bottom:5px;">${store.nome_loja || 'Loja Nova'}${roleLabel}</h2>
                    ${cnpjHtml}
                    <p style="margin:0; font-size:0.85rem; color:var(--text-muted);"><i class="ri-user-voice-line"></i> Operador: ${user.nome_completo || 'Geral'}</p>
                </div>`;
            }

            // Botões restaurante/roupas (síncrono, não precisa de rede)
            ['btn-guias-restaurante', 'btn-comandas-mesas-restaurante', 'btn-reservas-restaurante'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = isRestaurante ? 'inline-block' : 'none';
            });
            const sectionEquipe = document.getElementById('section-cadastrar-equipe');
            if (sectionEquipe) sectionEquipe.style.display = isRestaurante ? 'block' : 'none';
            const cardCupom = document.getElementById('card-cupom-roupas');
            if (cardCupom) cardCupom.style.display = isRoupas ? 'block' : 'none';

            // CSS para esconder módulos de restaurante em outros tipos
            const oldStyle = document.getElementById('hide-restaurant-css');
            if (oldStyle) oldStyle.remove();
            if (!isRestaurante) {
                const style = document.createElement('style');
                style.id = 'hide-restaurant-css';
                style.innerHTML = '#admin-comanda-grid,#comandas-advanced-grid,#admin-restaurant-panel,#waiter-comanda-list,#btn-gestao-salao,.card-comandas,[onclick*="gestao-salao"]{display:none!important}';
                document.head.appendChild(style);
            }

            // Botões de lançamento/reserva
            const btnLote = document.getElementById('btn-lote-mesas-restaurante');
            if (btnLote) btnLote.style.display = isRestaurante ? 'inline-block' : 'none';
            const btnReservas2 = document.getElementById('btn-reservas-restaurante');
            if (btnReservas2) btnReservas2.style.display = isRestaurante ? 'inline-block' : 'none';

            // Configurações de pagamento (síncrono)
            const hasToken = store.mp_access_token && store.mp_access_token.length > 10;
            if (document.getElementById('store-keys-area')) document.getElementById('store-keys-area').style.display = hasToken ? 'none' : 'block';
            if (document.getElementById('store-keys-locked')) document.getElementById('store-keys-locked').style.display = hasToken ? 'block' : 'none';
            if (document.getElementById('store-pickup-address')) document.getElementById('store-pickup-address').value = store.endereco_retirada || '';
            if (document.getElementById('store-delivery-fee')) document.getElementById('store-delivery-fee').value = store.taxa_entrega_padrao || '';
            if (document.getElementById('toggle-auto-print')) document.getElementById('toggle-auto-print').checked = (localStorage.getItem('NAXIO_AUTO_PRINT') === 'true');

            // Segurança de acesso e sub-módulos essenciais (síncrono)
            if (window.NaxioStability) window.NaxioStability.restrictAccess();
            if (typeof Caixa !== 'undefined') Caixa.init();
            if (typeof Fiscal !== 'undefined') Fiscal.init();
            if (typeof Varejo !== 'undefined') Varejo.init();
            if (App.offline) App.offline.init();

            // ⚡ ETAPA 3: Roteamento IMEDIATO — lojista já entra na tela do painel
            // Tudo abaixo é carregado em background, sem bloquear
            setTimeout(() => {
                // Dados pesados em background — não bloqueiam entrada na tela
                if (App.store.loadOrders) App.store.loadOrders();
                if (App.store.loadMyProducts) App.store.loadMyProducts();

                if (isRestaurante) {
                    if (App.store.loadComandas) App.store.loadComandas();
                    if (App.store.monitorKitchen) App.store.monitorKitchen();
                }

                if (App.autopecas && isAuto) {
                    App.autopecas.init();
                    if (App.nfe) App.nfe.init();
                }

                if (App.crediario) App.crediario.init();
                if (App.store.loadCoupons) App.store.loadCoupons();

                // Métricas (não urgente — caixa não vê)
                if (App.store.loadMetrics && App.state.profile?.role !== 'caixa') {
                    App.store.loadMetrics();
                } else if (App.state.profile?.role === 'caixa') {
                    ['metric-day', 'metric-week', 'metric-month'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerHTML = '<span style="font-size:0.7rem; opacity:0.7;">Visível no Fechamento</span>';
                    });
                }

                // Parceiro (query extra, não essencial na entrada)
                if (store.parceiro_exclusivo_id) {
                    _sb.from('profiles').select('nome_completo').eq('id', store.parceiro_exclusivo_id).maybeSingle().then(({ data: p }) => {
                        if (p && document.getElementById('active-partner-display'))
                            document.getElementById('active-partner-display').innerText = 'Parceiro: ' + p.nome_completo;
                    });
                }
            }, 0); // setTimeout(0) = solta o event loop ANTES de fazer as queries

            // Não-urgentes: alertas de estoque e dashboard (ainda mais atrasados)
            setTimeout(() => {
                if (App.store.checkLowStockAlerts) App.store.checkLowStockAlerts();
                if (App.store.loadNotasNaoEmitidas) App.store.loadNotasNaoEmitidas();
                if (App.store.listenMessages) App.store.listenMessages();
                if (App.dashboard) App.dashboard.loadCharts();
                if (App.chat && typeof App.chat.loadHistory === 'function') {
                    App.chat.loadHistory('loja').catch(e => console.error(e));
                }
            }, 800); // 800ms após entrada — usuário já tá no painel
        },
        printOrder: (order) => {
            const store = App.state.currentStore || {};
            let precoUnitario = order.products?.preco || 0;
            let frete = 0;
            try {
                if (order.products?.delivery_info) {
                    const dInfo = JSON.parse(order.products.delivery_info);
                    if (dInfo.fee_val) frete = parseFloat(dInfo.fee_val);
                }
            } catch (e) { }

            const totalFinal = precoUnitario + frete;
            const isRetirada = order.endereco_destino && order.endereco_destino.toUpperCase().includes('RETIRADA');
            const tituloPrint = isRetirada ? 'RETIRADA NO BALCÃO' : 'NAXIO PEDIDOS';

            const content = `
                <div style="font-family: monospace; width: 100%; padding: 5px;">
                    <br>
                    <h3 style="text-align:center; margin:0; font-size: 16px;">${store.nome_loja || tituloPrint}</h3>
                    <p style="text-align:center; font-size:12px; margin:5px 0;">${store.cnpj ? `CNPJ: ${store.cnpj}` : ''}</p>
                    <p style="text-align:center; font-size:12px; margin:0;">${new Date().toLocaleString()}</p>
                    <hr style="border-top: 1px dashed black; margin: 10px 0;">
                    <p style="font-size:14px;"><strong>CLIENTE:</strong> ${order.profiles?.nome_completo || 'Consumidor'}</p>
                    <p style="font-size:12px;"><strong>DESTINO:</strong> ${order.endereco_destino || 'Retirada'}</p>
                    <hr style="border-top: 1px dashed black;">
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:5px;">
                        <span>1x ${order.products?.nome}</span>
                        <span>R$ ${precoUnitario.toFixed(2)}</span>
                    </div>
                    ${frete > 0 ? `<div style="display:flex; justify-content:space-between; font-size:12px;"><span>Taxa Entrega:</span><span>R$ ${frete.toFixed(2)}</span></div>` : ''}
                    <hr style="border-top: 2px solid black;">
                    <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:bold;">
                        <span>TOTAL:</span>
                        <span>R$ ${totalFinal.toFixed(2)}</span>
                    </div>
                    <br>
                    <p style="text-align:center; font-size: 12px;">PEDIDO #${order.id.slice(0, 6)}</p>
                    <br>.
                </div>`;

            const area = document.getElementById('printable-area');
            if (area) {
                area.innerHTML = content;
                window.print();
            }
        },

        listenMessages: () => {
            const myStoreId = App.state.storeId;
            _sb.channel('store-notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `store_id=eq.${myStoreId}` }, async (payload) => {
                if (payload.new.sender_id !== App.state.user.id) {
                    const { data: sender } = await _sb.from('profiles').select('nome_completo').eq('id', payload.new.sender_id).single();
                    App.utils.showChatNotification(sender.nome_completo, payload.new.content, payload.new.client_id);
                }
            }).subscribe();
        },

        monitorKitchen: () => {
            console.log("🛡️ Monitoramento Híbrido Ativado");
            const printContent = (html) => {
                if (localStorage.getItem('NAXIO_AUTO_PRINT') !== 'true') { try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play(); } catch (e) { } return false; }
                const area = document.getElementById('printable-area'); if (!area) return false;
                area.innerHTML = html; setTimeout(() => { window.print(); try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play(); } catch (e) { } }, 500); return true;
            };

            const checkPendingOrders = async () => {
                if (localStorage.getItem('NAXIO_AUTO_PRINT') !== 'true') return;
                // Busca pedidos pendentes não impressos
                const { data: pending } = await _sb.from('orders').select('*, products(nome, categoria), profiles(nome_completo, whatsapp)').eq('store_id', App.state.storeId).is('impresso_cozinha', false).in('status', ['pendente', 'aguardando_prestador', 'pago']);
                if (pending && pending.length > 0) {
                    for (const order of pending) {
                        // Imprime se NÃO for roupa (Comida imprime mesmo se for retirada)
                        if (order.products?.categoria !== 'Roupas') { await printDeliveryOrder(order); }
                    }
                }
            };
            setTimeout(checkPendingOrders, 2000);

            const printDeliveryOrder = async (fullOrder) => {
                let valorFinal = fullOrder.products?.preco || 0;
                try { if (fullOrder.products?.delivery_info) { const d = JSON.parse(fullOrder.products.delivery_info); if (d.fee_val) valorFinal += parseFloat(d.fee_val); } } catch (e) { }

                const isRetirada = fullOrder.endereco_destino && fullOrder.endereco_destino.toUpperCase().includes('RETIRADA');
                const tituloPrint = isRetirada ? 'RETIRADA NO BALCÃO 🛍️' : 'NOVO DELIVERY 🛵';

                const content = `<div style="font-family: monospace; width: 100%; padding: 0 5px;"><br><h3 style="text-align:center; margin:0;">${tituloPrint}</h3><div style="border-bottom: 1px solid black; margin: 10px 0;"></div><p style="font-size:1.1rem; font-weight:bold; margin:5px 0;">${fullOrder.profiles?.nome_completo || 'Cliente'}</p>${fullOrder.profiles?.whatsapp ? `<p>Tel: ${fullOrder.profiles.whatsapp}</p>` : ''}<div style="background:#eee; padding:5px; margin:5px 0; font-size:0.9rem;"><strong>Endereço/Obs:</strong><br>${fullOrder.endereco_destino}</div><hr style="border-top: 2px dashed black;"><div style="font-size:1.2rem; font-weight:bold; margin:10px 0;">1x ${fullOrder.products?.nome || 'Produto'}</div><hr style="border-top: 2px dashed black;"><div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem;"><span>TOTAL:</span><span>R$ ${valorFinal.toFixed(2)}</span></div><p style="text-align:center; font-size:0.8rem; margin-top:10px;">#${fullOrder.id}<br>${new Date().toLocaleString()}</p><br>.</div>`;

                if (printContent(content)) {
                    // Se imprimiu, marca como impresso. Se for delivery, muda status para aguardando. Se for retirada, mantém pendente para o botão de 'Retirado' aparecer.
                    const nextStatus = isRetirada ? fullOrder.status : 'aguardando_prestador';
                    await _sb.from('orders').update({ impresso_cozinha: true, status: nextStatus, data_agendada: new Date().toISOString() }).eq('id', fullOrder.id);
                    App.utils.toast("Pedido impresso!", "success");
                    App.store.loadOrders();
                    App.store.loadMetrics();
                }
            };

            _sb.channel('cozinha-delivery').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${App.state.storeId}` }, async (payload) => {
                if (['pendente', 'aguardando_prestador', 'pago'].includes(payload.new.status)) {
                    App.store.loadOrders(); App.store.loadMetrics();
                    const { data: fullOrder } = await _sb.from('orders').select('*, products(nome, categoria), profiles(nome_completo, whatsapp)').eq('id', payload.new.id).single();
                    if (fullOrder && fullOrder.impresso_cozinha === false && fullOrder.products?.categoria !== 'Roupas') { await printDeliveryOrder(fullOrder); }
                }
            }).subscribe();

            // 🔥 FIX: Supabase Realtime NÃO suporta filter por campo boolean.
            // filter: 'imprimir_cozinha=eq.true' era ignorado silenciosamente — o canal NUNCA disparava.
            // Correção: filtra por store_id (suportado) e valida imprimir_cozinha no handler.
            _sb.channel('cozinha-mesas-v2').on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'comandas',
                filter: `store_id=eq.${App.state.storeId}`
            }, async (payload) => {
                // Valida no handler — não no filter
                if (!payload.new.imprimir_cozinha) return;
                if (payload.new.store_id !== App.state.storeId) return;

                const { data } = await _sb.from('comandas').select('*').eq('id', payload.new.id).single();
                if (data && data.items && data.items.length > 0) {
                    let itensParaImprimir = [];
                    let novosItens = data.items.map(item => {
                        const diff = (item.qtd || 0) - (item.printed_qtd || 0);
                        if (diff > 0) {
                            itensParaImprimir.push({ ...item, qtd: diff });
                            return { ...item, printed_qtd: item.qtd };
                        }
                        return item;
                    });

                    if (itensParaImprimir.length > 0) {
                        const itemsHtml = itensParaImprimir.map(i =>
                            `<div style="border-bottom:1px dashed #000; padding:5px 0;"><div style="font-size:1.2rem; font-weight:bold;">${i.qtd}x ${i.nome}</div>${i.obs ? `<div style="font-size:0.9rem;">⚠️ OBS: ${i.obs}</div>` : ''}<div style="font-size:0.7rem; text-align:right;">Garç.: ${i.garcom || 'Geral'} • ${(i.added_at || i.data_lancamento) ? new Date(i.added_at || i.data_lancamento).toLocaleTimeString() : '--:--'}</div></div>`
                        ).join('');
                        const obsArea = data.obs_geral
                            ? `<div style="text-align:center; font-size:1.8rem; font-weight:900; background-color:#000; color:#fff; padding:10px; margin-bottom:10px;">${data.obs_geral.toUpperCase().includes('RESERVA') ? 'PEDIDO RESERVA' : 'OBS: ' + data.obs_geral.toUpperCase()}</div>`
                            : '';
                        const content = `<div style="font-family: monospace; width: 100%; padding: 0 5px;"><br><h3 style="text-align:center; margin:0;">PEDIDO SALÃO 🍽️</h3>${obsArea}<div style="border: 2px solid black; margin: 5px 0; padding: 5px;"><p style="text-align:center; font-size:2.5rem; font-weight:900; margin:0;">MESA ${data.numero}</p></div><p style="text-align:center;">${new Date().toLocaleTimeString()}</p><hr style="border-top: 2px solid black;">${itemsHtml}<hr style="border-top: 2px solid black;"><br><br><br><br><br><br>.</div>`;

                        if (printContent(content)) {
                            await _sb.from('comandas').update({ imprimir_cozinha: false, items: novosItens }).eq('id', payload.new.id);
                        }
                    } else {
                        // Sem itens novos: apenas reseta a flag
                        if (localStorage.getItem('NAXIO_AUTO_PRINT') === 'true') {
                            await _sb.from('comandas').update({ imprimir_cozinha: false }).eq('id', payload.new.id);
                        }
                    }
                }
            }).subscribe();
        },

        // Dentro de App.store em js/modules.js

        loadMetrics: async () => {
            const sid = App.state.storeId;

            // Datas de referência
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

            // Início da Semana (Domingo)
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const startOfWeekStr = startOfWeek.toISOString();

            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // 1. Busca TODAS as vendas concluídas (PDV e Online)
            // Importante: Buscamos 'total_pago', 'origem_venda' e também 'products(preco)' como fallback para vendas antigas
            const { data: orders } = await _sb.from('orders')
                .select('created_at, total_pago, origem_venda, products(preco)')
                .eq('store_id', sid)
                .neq('status', 'cancelado');

            // Inicializa contadores
            let dayTotal = 0, weekTotal = 0, monthTotal = 0;
            let dayOnline = 0, dayPDV = 0; // Para diferenciação se quiser mostrar no card

            if (orders) {
                orders.forEach(o => {
                    // Lógica de Valor: Tenta pegar o total_pago (PDV/Novo), senão pega o preço do produto (Legado)
                    const val = parseFloat(o.total_pago) || parseFloat(o.products?.preco) || 0;
                    const isPDV = o.origem_venda === 'pdv';

                    // Acumula Hoje
                    if (o.created_at >= startOfDay) {
                        dayTotal += val;
                        if (isPDV) dayPDV += val; else dayOnline += val;
                    }

                    // Acumula Semana
                    if (o.created_at >= startOfWeekStr) {
                        weekTotal += val;
                    }

                    // Acumula Mês
                    if (o.created_at >= startOfMonth) {
                        monthTotal += val;
                    }
                });
            }

            // Atualiza a tela (Cards do Topo)
            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            if (document.getElementById('metric-day')) {
                // Exemplo: Mostra o total e, pequeno embaixo, a divisão
                document.getElementById('metric-day').innerHTML = `
            ${fmt(dayTotal)}
            <div style="font-size:0.65rem; font-weight:normal; opacity:0.8; margin-top:5px;">
                🏪 PDV: ${fmt(dayPDV)} | 🌐 Online: ${fmt(dayOnline)}
            </div>`;
            }

            if (document.getElementById('metric-week')) document.getElementById('metric-week').innerText = fmt(weekTotal);
            if (document.getElementById('metric-month')) document.getElementById('metric-month').innerText = fmt(monthTotal);

            // Chama a atualização dos gráficos (se o módulo dashboard existir)
            if (App.dashboard && App.dashboard.loadCharts) {
                App.dashboard.loadCharts();
            }
        },

        loadOrders: async () => {
            const { data: orders } = await _sb.from('orders').select('*, products(nome, preco, categoria, delivery_info), profiles!orders_cliente_id_fkey(nome_completo, email, cpf), prestador:profiles!orders_prestador_id_fkey(nome_completo, chave_pix)').eq('store_id', App.state.storeId).in('status', ['pendente', 'aguardando_prestador', 'pago', 'em_rota']).order('created_at', { ascending: false });
            App.store.renderOrders(orders);
        },

        loadNotasNaoEmitidas: async () => {
            const el = document.getElementById('store-notas-nao-emitidas');
            if (!el) return;
            const storeId = App.state.storeId;
            if (!storeId) { el.innerHTML = '<p class="text-sm text-muted">Carregue o painel da loja.</p>'; return; }
            const { data: orders, error } = await _sb.from('orders')
                .select('id, created_at, total_pago, endereco_destino, status_sefaz, numero_nfce, origem_venda')
                .eq('store_id', storeId)
                .not('total_pago', 'is', null)
                .gt('total_pago', 0)
                .or('status_sefaz.is.null,status_sefaz.eq.erro,status_sefaz.eq.rejeitado')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) { el.innerHTML = '<p class="text-sm text-danger">Erro ao carregar.</p>'; return; }
            if (!orders || orders.length === 0) {
                el.innerHTML = '<p class="text-sm text-muted">Nenhuma nota pendente de emissão.</p>';
                return;
            }
            el.innerHTML = orders.map(o => {
                const data = new Date(o.created_at).toLocaleString('pt-BR');
                const status = o.status_sefaz || 'não emitida';
                const origem = o.origem_venda === 'comanda' ? 'Comanda' : (o.origem_venda || 'Pedido');
                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;">
                <div>
                    <strong>#${o.id}</strong> · ${origem} · R$ ${parseFloat(o.total_pago).toFixed(2)}<br>
                    <span class="text-xs text-muted">${data} · ${status}</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-warning btn-sm" onclick="App.fiscal.emitirNFCe('${o.id}').then(() => App.store.loadNotasNaoEmitidas())"><i class="ri-file-add-line"></i> Emitir NFC-e</button>
                    <button type="button" class="btn btn-success btn-sm" style="background:#f59e0b; border:none; color:white;" onclick="App.fiscal.emitirNFe('${o.id}').then(() => App.store.loadNotasNaoEmitidas())"><i class="ri-article-line"></i> Emitir NF-e</button>
                </div>
            </div>`;
            }).join('');
        },

        reemitirNotaFiscal: async (orderId, modelo = 65) => {
            if (!orderId || !App.state.storeId) return alert("Pedido ou loja não identificados.");
            if (modelo === 55) {
                return App.fiscal.emitirNFe(orderId).then(() => {
                    App.store.loadNotasNaoEmitidas();
                    App.store.loadOrders();
                });
            }
            return App.fiscal.emitirNFCe(orderId).then(() => {
                App.store.loadNotasNaoEmitidas();
                App.store.loadOrders();
            });
        },

        renderOrders: (orders) => {
            document.getElementById('store-orders-list').innerHTML = orders?.map(o => {
                const isRetirada = o.endereco_destino && o.endereco_destino.toUpperCase().includes('RETIRADA');
                const isRoupas = o.products?.categoria === 'Roupas';

                let providerHtml = o.prestador ? `<div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px; border-radius:8px; margin-top:10px; font-size:0.85rem;"><strong>Prestador:</strong> ${o.prestador.nome_completo}<br><strong>Chave Pix:</strong> ${o.prestador.chave_pix || 'Não inf.'}</div>` : '';

                // --- CORREÇÃO DE SINTAXE AQUI ---
                // Codifica o objeto para não quebrar o HTML com aspas
                const oEncoded = encodeURIComponent(JSON.stringify(o));

                // Note o decodeURIComponent dentro do onclick
                let printBtn = `<button class="btn btn-sm btn-info" style="margin-top:5px; width:auto; float:right;" onclick="App.store.printOrder(JSON.parse(decodeURIComponent('${oEncoded}')))"><i class="ri-printer-line"></i> Imprimir</button>`;

                let actionBtn = '';

                if (isRetirada && (o.status === 'pendente' || o.status === 'pago')) {
                    actionBtn = `<button class="btn btn-success btn-sm btn-full" style="margin-top:5px;" onclick="App.store.markPickedUp('${o.id}')"><i class="ri-check-double-line"></i> Confirmar Retirada</button>`;
                }
                else if (o.status === 'pendente' && !isRetirada && !isRoupas) {
                    actionBtn = `<button class="btn btn-primary btn-sm btn-full" style="margin-top:5px;" onclick="App.store.dispatch('${o.id}')">Liberar para Entrega</button>`;
                }

                return `<br><div class="card" style="margin-bottom:1rem; border-left: 4px solid ${o.status === 'pendente' ? 'var(--warning)' : 'var(--success)'};"><br><div style="display:flex; justify-content:space-between"><strong>${o.products?.nome || 'Pedido'}</strong><span class="badge status-${o.status}">${o.status}</span></div><br><p class="text-sm">Cliente: ${o.profiles?.nome_completo || 'Cliente'}</p><br><p class="text-xs" style="background: #eff6ff; padding: 5px; border-radius: 4px; color: var(--primary-dark); margin-bottom: 10px;"><i class="ri-map-pin-line"></i> <strong>Tipo:</strong> ${o.endereco_destino || 'Retirada / Balcão'}</p>${printBtn}<br><div style="clear:both;"></div><br>${actionBtn}<br>${providerHtml}<br></div>`;
            }).join('') || '<p class="text-sm">Nenhum pedido em aberto.</p>';
        },

        // Nova função para marcar como retirado
        markPickedUp: async (id) => {
            if (!confirm("Confirmar que o cliente retirou o pedido?")) return;
            await _sb.from('orders').update({ status: 'concluido' }).eq('id', id);
            App.utils.toast('Pedido concluído!', 'success');
            App.store.loadOrders();
            App.store.loadMetrics();
        },

        dispatch: async (id) => { await _sb.from('orders').update({ status: 'aguardando_prestador', data_agendada: new Date().toISOString() }).eq('id', id); App.utils.toast('Despachado!', 'success'); App.store.init(); },

        setupPrinter: () => window.print(),

        // APPRIMORAMENTO: Importador Universal com Mapeamento Inteligente
        importProducts: () => {
            const modalHtml = `
            <div id="import-modal" class="modal-overlay" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
                <div class="modal-content" style="width:95%; max-width:900px; height:85vh; display:flex; flex-direction:column; padding:0; background:var(--bg-card); color:var(--text-primary);">
                    <div class="modal-header" style="padding:20px; border-bottom:1px solid var(--border); flex-shrink:0;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="margin:0;"><i class="ri-upload-cloud-2-line"></i> Importador Inteligente</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('import-modal').remove()">✕</button>
                        </div>
                        <div style="display:flex; gap:10px; margin-top:20px;">
                            <button class="btn btn-sm btn-primary" id="tab-btn-csv" onclick="App.store.switchImportTab('csv')">📂 CSV / Excel</button>
                            <button class="btn btn-sm btn-secondary" id="tab-btn-db" onclick="App.store.switchImportTab('db')">🛢️ Firebird / SQL Server</button>
                        </div>
                    </div>
                    
                    <div id="tab-csv" class="modal-body" style="flex:1; overflow-y:auto; padding:20px;">
                        <div id="csv-upload-area" style="border: 2px dashed var(--border); border-radius:16px; padding:50px; text-align:center; cursor:pointer; transition:all 0.3s;" 
                             onclick="document.getElementById('file-input-csv').click()"
                             ondragover="this.style.borderColor='var(--accent)'; this.style.background='rgba(99,102,241,0.1)'; return false;"
                             ondragleave="this.style.borderColor='var(--border)'; this.style.background='transparent'; return false;"
                             ondrop="App.store.handleCsvDrop(event)">
                            <i class="ri-file-excel-line" style="font-size:4rem; color:var(--text-muted); margin-bottom:15px; display:block;"></i>
                            <h3 style="margin:0;">Clique ou arraste seu arquivo CSV/TXT</h3>
                            <p class="text-sm text-muted">Detectamos automaticamente o formato</p>
                            <input type="file" id="file-input-csv" accept=".csv, .txt" style="display:none" onchange="App.store.handleCsvFile(this.files[0])">
                        </div>
                        
                        <div id="csv-preview-area" style="display:none; animation: fadeIn 0.5s;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                                <h4>📊 Mapeamento de Colunas</h4>
                                <button class="btn btn-sm btn-secondary" onclick="App.store.resetImport()">Trocar Arquivo</button>
                            </div>
                            <p class="text-xs text-muted" style="margin-bottom:15px; background:rgba(245, 158, 11, 0.1); color:var(--warning); padding:10px; border-radius:6px; border:1px solid var(--warning);">
                                <i class="ri-alert-line"></i> Por favor, identifique a coluna de <strong>NOME</strong> e <strong>PREÇO</strong> para continuar.
                            </p>
                            <div style="overflow-x:auto; border:1px solid var(--border); border-radius:8px;">
                                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                                    <thead id="csv-preview-head" style="background:var(--bg-dark); color:var(--text-primary);"></thead>
                                    <tbody id="csv-preview-body"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div id="tab-db" class="modal-body" style="display:none; flex:1; padding:40px; text-align:center;">
                        <i class="ri-database-2-line" style="font-size:5rem; color:var(--primary); margin-bottom:20px; display:block;"></i>
                        <h2 style="margin-bottom:10px;">Migração de Banco de Dados Local</h2>
                        <p style="max-width:600px; margin:0 auto 30px auto; color:var(--text-muted); line-height:1.6;">
                            Navegadores web não podem acessar diretamente arquivos de banco de dados locais (.FDB, .MDF) por segurança.
                            Para importar seus dados do <strong>Firebird</strong> ou <strong>SQL Server</strong>:
                        </p>
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; max-width:800px; margin:0 auto;">
                            <div class="card" style="padding:20px; text-align:left; border:1px solid var(--border);">
                                <h4 style="color:var(--accent);"><i class="ri-file-transfer-line"></i> Método 1: Exportar (Recomendado)</h4>
                                <p class="text-sm">1. Abra seu sistema antigo.</p>
                                <p class="text-sm">2. Gere um relatório de produtos em <strong>Excel</strong> ou <strong>CSV</strong>.</p>
                                <p class="text-sm">3. Use a aba "CSV" deste importador.</p>
                            </div>
                            <div class="card" style="padding:20px; text-align:left; border:1px solid #334155;">
                                <h4 style="color:#10b981;"><i class="ri-code-box-line"></i> Método 2: Script Extrator</h4>
                                <p class="text-sm">Se você tem acesso técnico, baixe nosso script Python que conecta no seu banco e gera o JSON compatível.</p>
                                <button class="btn btn-sm btn-secondary" style="margin-top:10px;" onclick="alert('Download do script python iniciado...')"><i class="ri-download-line"></i> Baixar Script .py</button>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer" style="padding:20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px; background:var(--bg-card);">
                        <span id="import-stats" style="margin-right:auto; font-size:0.9rem; font-weight:bold;"></span>
                        <button class="btn btn-secondary" onclick="document.getElementById('import-modal').remove()">Cancelar</button>
                        <button id="btn-process-import" class="btn btn-success" disabled onclick="App.store.finalizeImport()">
                            <i class="ri-check-line"></i> Iniciar Importação
                        </button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            App.state.importData = null; // Reset
        },

        switchImportTab: (tab) => {
            document.getElementById('tab-csv').style.display = tab === 'csv' ? 'block' : 'none';
            document.getElementById('tab-db').style.display = tab === 'db' ? 'block' : 'none';
            document.getElementById('tab-btn-csv').className = tab === 'csv' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
            document.getElementById('tab-btn-db').className = tab === 'db' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
        },

        handleCsvDrop: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                App.store.handleCsvFile(e.dataTransfer.files[0]);
            }
        },

        resetImport: () => {
            document.getElementById('csv-upload-area').style.display = 'block';
            document.getElementById('csv-preview-area').style.display = 'none';
            document.getElementById('btn-process-import').disabled = true;
            App.state.importData = null;
        },

        handleCsvFile: (file) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const separator = text.indexOf(';') > -1 ? ';' : ','; // Auto-detect
                const lines = text.split('\n').filter(l => l.trim().length > 0);

                if (lines.length < 2) return alert("Arquivo vazio ou inválido");

                const headers = lines[0].replace(/\r/g, '').split(separator);
                const previewRows = lines.slice(1, 6).map(l => l.replace(/\r/g, '').split(separator)); // First 5 rows

                // Guardar dados brutos para processar depois
                App.state.importData = {
                    text: text,
                    separator: separator,
                    lines: lines
                };

                // Renderizar Preview e Mapeamento
                document.getElementById('csv-upload-area').style.display = 'none';
                document.getElementById('csv-preview-area').style.display = 'block';

                // Cabeçalhos com Selects
                const thead = document.getElementById('csv-preview-head');
                const options = [
                    { val: 'ignore', label: '-- Ignorar --' },
                    { val: 'nome', label: 'Nome do Produto *' },
                    { val: 'preco', label: 'Preço Venda *' },
                    { val: 'codigo', label: 'Código / Barras' },
                    { val: 'categoria', label: 'Categoria' },
                    { val: 'estoque', label: 'Estoque' },
                    { val: 'ncm', label: 'NCM (Fiscal)' }
                ];

                let outputHead = '<tr>';
                headers.forEach((h, idx) => {
                    // Tentativa de Auto-Select
                    let selected = 'ignore';
                    const lower = h.toLowerCase();
                    if (lower.includes('nome') || lower.includes('desc') || lower.includes('produto')) selected = 'nome';
                    else if (lower.includes('prec') || lower.includes('valor') || lower.includes('venda')) selected = 'preco';
                    else if (lower.includes('cod') || lower.includes('ean') || lower.includes('sku')) selected = 'codigo';
                    else if (lower.includes('cat') || lower.includes('grupo')) selected = 'categoria';
                    else if (lower.includes('est') || lower.includes('qtd')) selected = 'estoque';
                    else if (lower.includes('ncm')) selected = 'ncm';

                    const optsHtml = options.map(o => `<option value="${o.val}" ${o.val === selected ? 'selected' : ''}>${o.label}</option>`).join('');

                    outputHead += `
                        <th style="padding:10px; border:1px solid var(--border); min-width:150px;">
                            <div style="font-weight:bold; margin-bottom:5px;">${h}</div>
                            <select class="input-field map-select" data-index="${idx}" style="width:100%; padding:5px;">${optsHtml}</select>
                        </th>`;
                });
                outputHead += '</tr>';
                thead.innerHTML = outputHead;

                // Corpo da Tabela (Amostra)
                const tbody = document.getElementById('csv-preview-body');
                tbody.innerHTML = previewRows.map(row =>
                    `<tr>${row.map(cell => `<td style="padding:8px; border:1px solid var(--border); color:var(--text-muted);">${cell}</td>`).join('')}</tr>`
                ).join('');

                document.getElementById('btn-process-import').disabled = false;
                App.utils.toast("Arquivo carregado. Verifique as colunas.", "info");
            };
            reader.readAsText(file);
        },

        finalizeImport: async () => {
            const selects = document.querySelectorAll('.map-select');
            const map = {}; // { nome: 0, preco: 2, ... }
            let hasName = false;
            let hasPrice = false;

            selects.forEach(s => {
                const val = s.value;
                if (val !== 'ignore') {
                    map[val] = parseInt(s.getAttribute('data-index'));
                    if (val === 'nome') hasName = true;
                    if (val === 'preco') hasPrice = true;
                }
            });

            if (!hasName || !hasPrice) return alert("Erro: Você precisa selecionar pelo menos as colunas 'Nome' e 'Preço'.");

            const data = App.state.importData;
            const lines = data.lines;
            const separator = data.separator;
            const payload = [];

            // Processa todas as linhas (pula header)
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].replace(/\r/g, '').split(separator);
                if (cols.length < 2) continue;

                // Extração Segura
                const getVal = (key) => (map[key] !== undefined && cols[map[key]]) ? cols[map[key]].trim() : null;

                const nome = getVal('nome')?.replace(/"/g, '');
                let precoStr = getVal('preco')?.replace(/R\$/g, '').replace(/\./g, '').replace(',', '.'); // 1.200,50 -> 1200.50
                const preco = parseFloat(precoStr);

                const estoqueRaw = getVal('estoque');
                const estoque = estoqueRaw ? parseInt(estoqueRaw) : 0;

                if (nome && !isNaN(preco)) {
                    payload.push({
                        store_id: App.state.storeId,
                        nome: nome,
                        preco: preco,
                        codigo_barras: getVal('codigo'),
                        categoria: getVal('categoria') || 'Importados',
                        estoque: estoque,
                        ncm: getVal('ncm'),
                        exibir_online: true
                    });
                }
            }

            if (payload.length === 0) return alert("Nenhum produto válido identificado.");

            // Envia em Lotes
            const btn = document.getElementById('btn-process-import');
            btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Importando ${payload.length} itens...`;
            btn.disabled = true;

            const batchSize = 100;
            let successCount = 0;

            for (let i = 0; i < payload.length; i += batchSize) {
                const batch = payload.slice(i, i + batchSize);
                const { error } = await _sb.from('products').insert(batch);
                if (error) {
                    console.error('Import Error:', error);
                } else {
                    successCount += batch.length;
                    document.getElementById('import-stats').innerText = `${successCount} / ${payload.length} processados...`;
                }
            }

            alert(`Importação Concluída! ${successCount} produtos adicionados.`);
            document.getElementById('import-modal').remove();
            App.store.loadMyProducts();
        },

        toggleAutoPrint: () => { const c = document.getElementById('toggle-auto-print').checked; localStorage.setItem('NAXIO_AUTO_PRINT', c); if (c) App.utils.toast("Auto-Print Ativado", "success"); },

        saveCredentials: async () => {
            const acc = document.getElementById('store-access-token').value;
            const pub = document.getElementById('store-public-key').value;
            await _sb.from('stores').update({ mp_access_token: acc, mp_public_key: pub }).eq('id', App.state.storeId);
            App.utils.toast("Salvo!", "success"); App.store.init();
        },

        resetKeys: async () => { if (confirm("Resetar?")) { await _sb.from('stores').update({ mp_access_token: null, mp_public_key: null }).eq('id', App.state.storeId); App.store.init(); } },

        saveLogistics: async () => {
            const addr = document.getElementById('store-pickup-address').value;
            const fee = document.getElementById('store-delivery-fee').value;
            const cep = document.getElementById('store-cep-origem').value;

            await _sb.from('stores').update({
                endereco_retirada: addr,
                taxa_entrega_padrao: fee,
                cep_origem: cep
            }).eq('id', App.state.storeId);

            App.utils.toast("Configurações Salvas!", "success");

            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        loadMyProducts: async () => {
            const { data } = await _sb.from('products').select('*').eq('store_id', App.state.storeId).order('nome');
            App.state.myProducts = data || [];
            App.store.filterMyProducts();
        },

        filterMyProducts: () => {
            const term = document.getElementById('admin-prod-search') ? document.getElementById('admin-prod-search').value.toLowerCase() : "";
            const filtered = (App.state.myProducts || []).filter(p => {
                if (!term) return true;
                return (p.nome && p.nome.toLowerCase().includes(term)) ||
                    (p.codigo_cardapio && p.codigo_cardapio.toLowerCase().includes(term)) ||
                    (p.cod_aplicacao && p.cod_aplicacao.toLowerCase().includes(term)) ||
                    (p.cod_fabricante && p.cod_fabricante.toLowerCase().includes(term)) ||
                    (p.cod_fornecedor && p.cod_fornecedor.toLowerCase().includes(term)) ||
                    (p.localizacao && p.localizacao.toLowerCase().includes(term));
            });
            App.store.renderMyProducts(filtered);
        },

        renderMyProducts: (list) => {
            const container = document.getElementById('store-products-list');
            if (!container) return;
            if (!list || list.length === 0) {
                container.innerHTML = '<p class="text-sm text-muted">Nada encontrado.</p>';
                return;
            }
            container.innerHTML = list.map(p => {
                const pSafe = JSON.stringify(p).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

                // Exibe localização e preços
                const localHtml = p.localizacao ? `<div class="text-xs text-info" style="margin-top:2px;"><i class="ri-map-pin-line"></i> ${p.localizacao}</div>` : '';
                const aplicacaoHtml = p.cod_aplicacao ? `<div class="text-xs text-muted" style="margin-top:2px;">🚗 ${p.cod_aplicacao}</div>` : '';

                const precoHtml = p.preco_prazo && p.preco_prazo > 0
                    ? `<span class="text-sm">R$ ${p.preco.toFixed(2)} <span style="font-size:0.8em; color:#64748b;">(Vis)</span> / R$ ${parseFloat(p.preco_prazo).toFixed(2)} <span style="font-size:0.8em; color:#64748b;">(Prz)</span></span>`
                    : `<span class="text-sm">R$ ${p.preco.toFixed(2)}</span>`;

                // Botão de duplicar só se tiver o módulo carregado
                let dupBtn = '';
                if (App.autopecas && typeof App.autopecas.duplicateProduct === 'function') {
                    dupBtn = `<button class="btn btn-sm btn-info" style="width:auto; padding:5px 8px;" onclick='App.autopecas.duplicateProduct("${p.id}")' title="Duplicar"><i class="ri-file-copy-line"></i></button>`;
                }

                const stockColor = (p.estoque <= (p.estoque_minimo || 0)) ? 'color:red; font-weight:bold;' : 'color:green;';

                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                    <div style="flex:1;">
                        <div style="font-weight:bold">${p.nome} <span style="font-weight:normal; font-size:0.8rem; color:#aaa;">(${p.categoria})</span></div>
                        <div class="text-xs text-muted">${precoHtml} | <span style="${stockColor}">Est: ${p.estoque}</span></div>
                        ${localHtml}
                        ${aplicacaoHtml}
                    </div>
                    <div style="display:flex; gap:5px; align-items:center;">
                        ${dupBtn}
                        <button class="btn btn-sm btn-secondary" style="width:auto; padding:5px 8px;" onclick='App.store.openEditProduct(${pSafe})' title="Editar"><i class="ri-edit-line"></i></button>
                        <button class="btn btn-sm btn-danger" style="width:auto; padding:5px 8px;" onclick="App.store.deleteProduct('${p.id}')" title="Excluir"><i class="ri-delete-bin-line"></i></button>
                    </div>
                </div>`;
            }).join('');
        },


        // 📈 MÉTRICAS - Dados ficam em cache para o PainelRelatorios
        loadMetrics: async () => {
            const sid = App.state.storeId;
            if (!sid) return;
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const { data: orders } = await _sb.from('orders')
                .select('created_at, total_pago, origem_venda, products(preco)')
                .eq('store_id', sid)
                .neq('status', 'cancelado')
                .neq('status', 'devolvido');

            let dayTotal = 0, monthTotal = 0;

            if (orders) {
                orders.forEach(o => {
                    const val = parseFloat(o.total_pago) || parseFloat(o.products?.preco) || 0;
                    if (o.created_at >= startOfDay) dayTotal += val;
                    if (o.created_at >= startOfMonth) monthTotal += val;
                });
            }

            // Guarda em cache para acesso rápido
            App.state._metricsCache = { dayTotal, monthTotal, lastUpdate: Date.now() };

            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            // Atualiza elementos se existirem (podem estar no modal de Relatórios ou no DOM)
            const elDay = document.getElementById('metric-day');
            const elMonth = document.getElementById('metric-month');
            if (elDay) elDay.innerText = fmt(dayTotal);
            if (elMonth) elMonth.innerText = fmt(monthTotal);
        },

        imprimirComprovante: (comanda, pagamentos) => {
            if (typeof RelatoriosEnterprise !== 'undefined') RelatoriosEnterprise.imprimirComprovante(comanda, pagamentos);
        },

        imprimirConferencia: (id) => {
            if (typeof RelatoriosEnterprise !== 'undefined') RelatoriosEnterprise.imprimirConferencia(id);
        },

        createCoupon: async () => {
            const code = document.getElementById('new-coupon-code').value.toUpperCase().trim();
            const percent = parseInt(document.getElementById('new-coupon-percent').value);
            if (!code || !percent) return App.utils.toast("Preencha código e porcentagem", "error");
            const { error } = await _sb.from('coupons').insert({ store_id: App.state.storeId, code: code, percent: percent });
            if (error) App.utils.toast("Erro ao criar", "error"); else { App.utils.toast("Cupom criado!", "success"); App.store.loadCoupons(); }
        },

        loadCoupons: async () => {
            const { data } = await _sb.from('coupons').select('*').eq('store_id', App.state.storeId).eq('active', true);
            const div = document.getElementById('coupon-list-display');
            if (!div) return; // Se o elemento não existe no DOM atual, ignoramos.
            if (!data || data.length === 0) { div.innerHTML = '<span class="text-xs text-muted">Nenhum cupom.</span>'; return; }
            div.innerHTML = data.map(c => `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:5px; font-size:0.8rem;"><strong>${c.code} (${c.percent}%)</strong><span style="color:red; cursor:pointer;" onclick="App.store.deleteCoupon('${c.id}')">Excluir</span></div>`).join('');
        },

        deleteCoupon: async (id) => { if (confirm("Excluir?")) { await _sb.from('coupons').delete().eq('id', id); App.store.loadCoupons(); } },

        linkPartner: async () => {
            const email = document.getElementById('partner-email-input').value.trim();
            if (!email) return App.utils.toast("Digite o email", "error");
            const { data: user } = await _sb.from('profiles').select('id, nome_completo').eq('email', email).maybeSingle();
            if (!user) return App.utils.toast("Não encontrado.", "error");
            const { error } = await _sb.from('store_partners').insert({ store_id: App.state.storeId, profile_id: user.id });
            if (error) App.utils.toast("Erro ou já vinculado.", "error"); else App.utils.toast("Vinculado!", "success");
        },

        renderAdminSizes: (s) => {
            const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XG', '34', '36', '38', '40', '42', '44', '46', '48', '50', 'Único'];
            const container = document.getElementById('admin-size-list');
            if (container) {
                container.innerHTML = '';
                const existing = s ? s.split(',').map(sz => sz.trim()) : [];
                sizes.forEach(sz => {
                    const div = document.createElement('div');
                    div.className = `size-box ${existing.includes(sz) ? 'admin-selected' : ''}`;
                    div.innerText = sz;
                    div.onclick = () => { div.classList.toggle('admin-selected'); App.store.updateHiddenSizeInput(); };
                    container.appendChild(div);
                });
                document.getElementById('clothing-sizes').value = s;
            }
        },

        updateHiddenSizeInput: () => {
            const selected = Array.from(document.querySelectorAll('.size-box.admin-selected')).map(el => el.innerText);
            document.getElementById('clothing-sizes').value = selected.join(',');
        },

        renderAdminColors: (c) => {
            const colors = ['Preto', 'Branco', 'Cinza', 'Azul', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Jeans', 'Bege'];
            const container = document.getElementById('admin-color-list');
            const input = document.getElementById('clothing-colors');

            if (container && input) {
                input.value = c || "";
                const renderBoxes = () => {
                    container.innerHTML = '';
                    const currentVals = input.value.split(',').map(s => s.trim()).filter(s => s);
                    colors.forEach(clr => {
                        const div = document.createElement('div');
                        const isSelected = currentVals.includes(clr);
                        div.className = `size-box ${isSelected ? 'admin-selected' : ''}`;
                        div.innerText = clr;
                        div.onclick = () => {
                            let news = input.value.split(',').map(s => s.trim()).filter(s => s);
                            if (news.includes(clr)) news = news.filter(s => s !== clr);
                            else news.push(clr);
                            input.value = news.join(',');
                            renderBoxes();
                        };
                        container.appendChild(div);
                    });
                };
                renderBoxes();
                input.oninput = renderBoxes;
            }
        },

        deleteProduct: async (id) => { if (confirm("Deseja realmente excluir este produto?")) { await _sb.from('products').delete().eq('id', id); App.utils.toast("Produto excluído!", "success"); App.store.loadMyProducts(); App.catalog.fetchPublic(); } },

        // ======================================================
        // 🔍 CONSULTA DE PRODUTOS POR PALAVRA-CHAVE
        // ======================================================
        openConsultaProduto: async () => {
            const modal = document.getElementById('consulta-produto-modal');
            if (!modal) return;
            modal.style.display = 'flex';

            // Popula filtro de categorias
            const catFilter = document.getElementById('consulta-category-filter');
            if (catFilter && catFilter.options.length <= 1) {
                const tipoLoja = App.state.currentStore?.tipo_loja;
                const cats = CONFIG.getCategoriesForStoreType(tipoLoja);
                cats.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    opt.innerText = c;
                    catFilter.appendChild(opt);
                });
            }

            // Limpa e foca
            document.getElementById('consulta-keyword').value = '';
            document.getElementById('consulta-keyword').focus();

            // Carrega todos os produtos em cache
            if (!App.state._consultaCache) {
                const { data } = await _sb.from('products').select('*').eq('store_id', App.state.storeId).order('nome');
                App.state._consultaCache = data || [];
            }
            App.store.consultarProduto();
        },

        consultarProduto: () => {
            const keyword = (document.getElementById('consulta-keyword')?.value || '').toLowerCase().trim();
            const catFilter = document.getElementById('consulta-category-filter')?.value || '';
            const onlyStock = document.getElementById('consulta-only-stock')?.checked || false;
            const container = document.getElementById('consulta-results');
            const countEl = document.getElementById('consulta-count');
            const allProducts = App.state._consultaCache || App.state.myProducts || [];

            let filtered = allProducts.filter(p => {
                // Filtro de categoria
                if (catFilter && p.categoria !== catFilter) return false;
                // Filtro de estoque
                if (onlyStock && (p.estoque || 0) <= 0) return false;
                // Filtro de palavra-chave
                if (!keyword) return true;
                return (p.nome && p.nome.toLowerCase().includes(keyword)) ||
                    (p.codigo_barras && p.codigo_barras.toLowerCase().includes(keyword)) ||
                    (p.codigo_cardapio && p.codigo_cardapio.toLowerCase().includes(keyword)) ||
                    (p.cod_fabricante && p.cod_fabricante.toLowerCase().includes(keyword)) ||
                    (p.cod_fornecedor && p.cod_fornecedor.toLowerCase().includes(keyword)) ||
                    (p.cod_aplicacao && p.cod_aplicacao.toLowerCase().includes(keyword)) ||
                    (p.localizacao && p.localizacao.toLowerCase().includes(keyword)) ||
                    (p.descricao && p.descricao.toLowerCase().includes(keyword));
            });

            if (countEl) countEl.innerText = `${filtered.length} produto(s) encontrado(s)`;

            if (filtered.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="ri-emotion-sad-line" style="font-size:2rem;"></i>
                    <p>Nenhum produto encontrado com "${keyword || 'filtros atuais'}"</p>
                </div>`;
                return;
            }

            container.innerHTML = filtered.map(p => {
                const estoque = p.estoque || 0;
                const stockClass = estoque > 0 ? (estoque <= (p.estoque_minimo || 3) ? 'color:#f59e0b; font-weight:bold;' : 'color:#10b981; font-weight:bold;') : 'color:#ef4444; font-weight:bold;';
                const stockLabel = estoque > 0 ? `${estoque} un` : 'SEM ESTOQUE';
                const localHtml = p.localizacao ? `<span style="color:#6366f1;"><i class="ri-map-pin-line"></i> ${p.localizacao}</span>` : '';
                const aplicHtml = p.cod_aplicacao ? `<span style="color:#64748b;">🚗 ${p.cod_aplicacao}</span>` : '';
                const precoVista = `R$ ${p.preco.toFixed(2)}`;
                const precoPrazo = p.preco_prazo ? ` / <span style="color:#64748b;">Prazo: R$ ${parseFloat(p.preco_prazo).toFixed(2)}</span>` : '';
                const custoHtml = p.preco_custo ? `<span style="color:#94a3b8; font-size:0.75rem;">Custo: R$ ${parseFloat(p.preco_custo).toFixed(2)}</span>` : '';

                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:1rem;">${p.nome} <span style="font-size:0.8rem; color:#94a3b8;">(${p.categoria || 'Geral'})</span></div>
                        <div style="font-size:0.85rem; margin-top:3px;">
                            <span style="color:var(--primary); font-weight:600;">${precoVista}</span>${precoPrazo}
                        </div>
                        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:4px; font-size:0.8rem;">
                            ${localHtml} ${aplicHtml} ${custoHtml}
                        </div>
                    </div>
                    <div style="text-align:right; min-width:80px;">
                        <div style="${stockClass} font-size:0.9rem;">${stockLabel}</div>
                        ${p.codigo_barras ? `<div class="text-xs text-muted">${p.codigo_barras}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        },

        // ======================================================
        // ⚠️ ALERTAS DE ESTOQUE BAIXO
        // ======================================================
        checkLowStockAlerts: async () => {
            const { data } = await _sb.from('products').select('id, nome, estoque, estoque_minimo, localizacao, preco').eq('store_id', App.state.storeId);
            if (!data) return;

            const lowStock = data.filter(p => {
                const min = p.estoque_minimo || 3;
                return (p.estoque || 0) <= min;
            });

            const alertBox = document.getElementById('low-stock-alerts');
            const listEl = document.getElementById('low-stock-list');
            if (!alertBox || !listEl) return;

            if (lowStock.length === 0) {
                alertBox.style.display = 'none';
                return;
            }

            alertBox.style.display = 'block';
            listEl.innerHTML = lowStock.map(p => {
                const isZero = (p.estoque || 0) <= 0;
                const badgeStyle = isZero ? 'background:#fecaca; color:#b91c1c;' : 'background:#fef3c7; color:#92400e;';
                const icon = isZero ? 'ri-error-warning-line' : 'ri-alarm-warning-line';
                return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border);">
                    <div><i class="${icon}" style="${isZero ? 'color:#ef4444;' : 'color:#f59e0b;'}"></i> <strong>${p.nome}</strong>
                    ${p.localizacao ? `<span class="text-xs text-muted"> (📍 ${p.localizacao})</span>` : ''}</div>
                    <span style="padding:3px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold; ${badgeStyle}">${p.estoque || 0} un</span>
                </div>`;
            }).join('');
        },

        openProductModal: () => {
            // 1. Configuração Básica (Título e Botão)
            const titleEl = document.getElementById('prod-modal-title');
            if (titleEl) titleEl.innerText = "Novo Produto";

            const btnSave = document.getElementById('btn-save-prod');
            if (btnSave) btnSave.innerText = "Publicar";

            // 2. Limpeza dos Campos (Reset)
            const fields = ['edit-prod-id', 'new-prod-name', 'new-prod-code', 'new-prod-price', 'new-prod-price-prazo', 'new-prod-price-custo', 'clothing-sizes', 'clothing-colors', 'new-prod-desc', 'clothing-subcat', 'new-prod-stock'];
            fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

            // Limpa seletores de tamanho/cor visualmente
            App.store.renderAdminSizes("");
            App.store.renderAdminColors("");

            // 3. INTELIGÊNCIA DE RAMO (Popula categorias e mostra campos específicos)
            const tipoLoja = App.state.currentStore.tipo_loja;
            const catSelect = document.getElementById('new-prod-cat');

            if (catSelect) {
                catSelect.innerHTML = ''; // Limpa as opções antigas

                // Esconde áreas específicas para garantir estado limpo inicial
                ['clothing-options-area', 'delivery-options-area', 'printer-target-area', 'autopecas-options-area'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });

                // Usa o novo sistema de mapeamento de categorias por ramo
                const options = CONFIG.getCategoriesForStoreType(tipoLoja);
                const tl = tipoLoja ? tipoLoja.toLowerCase() : "";
                const isAuto = tl.includes('auto') || tl.includes('peca') || tl.includes('oficina') || tl.includes('mecanic');

                // Mostra campos específicos baseado no ramo
                if (tipoLoja === 'Roupas' || tipoLoja === 'Varejo') {
                    const clothArea = document.getElementById('clothing-options-area');
                    if (clothArea) clothArea.style.display = 'block';
                }
                else if (tipoLoja === 'Restaurante') {
                    const delArea = document.getElementById('delivery-options-area');
                    if (delArea) delArea.style.display = 'block';
                    const printArea = document.getElementById('printer-target-area');
                    if (printArea) printArea.style.display = 'block';
                }
                else if (isAuto) {
                    const autoArea = document.getElementById('autopecas-options-area');
                    if (autoArea) autoArea.style.display = 'block';

                    // Popula Subcategorias de Autopeças
                    const apSelect = document.getElementById('autopecas-subcat');
                    if (apSelect && CONFIG.subCategoriesAutopecas) {
                        apSelect.innerHTML = '<option value="">Selecione...</option>';
                        CONFIG.subCategoriesAutopecas.forEach(s => {
                            const opt = document.createElement('option');
                            opt.value = s;
                            opt.innerText = s;
                            apSelect.appendChild(opt);
                        });
                    }
                }

                // Popula o select apenas com as categorias do ramo
                options.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt;
                    el.innerText = opt;
                    catSelect.appendChild(el);
                });

                // Seleciona o primeiro item por padrão e atualiza a UI
                if (options.length > 0) {
                    catSelect.value = options[0];
                    App.store.checkCategory(options[0]);
                }
            }

            // 4. Abre o Modal
            const modal = document.getElementById('product-modal');
            if (modal) modal.style.display = 'flex';
        },

        openEditProduct: (p) => {
            const titleEl = document.getElementById('prod-modal-title');
            if (titleEl) titleEl.innerText = "Editar Produto";
            const btnSave = document.getElementById('btn-save-prod');
            if (btnSave) btnSave.innerText = "Salvar";
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            setVal('edit-prod-id', p.id);
            setVal('new-prod-name', p.nome);
            setVal('new-prod-code', p.codigo_cardapio || "");
            setVal('new-prod-price', p.preco);
            setVal('new-prod-price-prazo', p.preco_prazo || "");
            setVal('new-prod-desc', p.descricao || "");
            setVal('clothing-sizes', p.sizes || "");
            setVal('clothing-colors', p.cores || "");
            setVal('clothing-subcat', p.subcategoria || "");
            setVal('new-prod-stock', p.estoque || 0);
            const catSelect = document.getElementById('new-prod-cat');
            if (catSelect) { catSelect.value = p.categoria; App.store.checkCategory(p.categoria); }
            const promoEl = document.getElementById('new-prod-promo');
            if (promoEl) promoEl.checked = p.promocao;
            const taxa10El = document.getElementById('new-prod-taxa10');
            if (taxa10El) taxa10El.checked = (p.isento_10 !== true); // isento_10=true significa FORA da taxa
            App.store.renderAdminSizes(p.sizes || "");
            App.store.renderAdminColors(p.cores || "");
            const modal = document.getElementById('product-modal');
            if (modal) modal.style.display = 'flex';
            const onlineCheck = document.getElementById('new-prod-online');
            if (onlineCheck) onlineCheck.checked = (p.exibir_online !== false); // Padrão true
            const printerInput = document.getElementById('new-prod-printer');
            if (printerInput) printerInput.value = p.impressora_alvo || "";

            // 🔑 FISCAL: Carrega NCM e CEST (CRÍTICO — sem isso o NCM some ao editar)
            setVal('prod-ncm', p.ncm || "");
            setVal('prod-cest', p.cest || "");
            setVal('prod-origem', p.origem || "0");
            setVal('prod-cfop', p.cfop || "");

            // Autopeças Fields
            setVal('ap-cod-fab', p.cod_fabricante || "");
            setVal('ap-cod-for', p.cod_fornecedor || "");
            setVal('ap-aplicacao', p.cod_aplicacao || "");
            setVal('ap-local', p.localizacao || "");
            setVal('autopecas-subcat', p.subcategoria || ""); // Reuses logic if input/select exists
            setVal('new-prod-price-custo', p.preco_custo || "");
            setVal('ap-min-stock', p.estoque_minimo || "");
            const negStock = document.getElementById('ap-neg-stock');
            if (negStock) negStock.checked = (p.allow_negative_stock !== false);
        },

        closeProductModal: () => { const modal = document.getElementById('product-modal'); if (modal) modal.style.display = 'none'; },

        checkCategory: (c) => {
            // Esconde todos primeiro
            ['hotel-dates-area', 'gesso-options-area', 'delivery-options-area', 'clothing-options-area', 'printer-target-area', 'autopecas-options-area'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // Lógica existente...
            if (c === 'Hoteis/Pousadas') document.getElementById('hotel-dates-area').style.display = 'block';
            if (c === 'Roupas' || c === 'Calçados') document.getElementById('clothing-options-area').style.display = 'block';
            if (c === 'Autopeças') document.getElementById('autopecas-options-area').style.display = 'block';

            // NOVA LÓGICA: Se for Comida, Bebida, Drinks ou Sobremesas, mostra config de Impressora e Taxa
            if (c === 'Comidas' || c === 'Bebidas' || c === 'Drinks' || c === 'Sobremesas') {
                document.getElementById('delivery-options-area').style.display = 'block';
                document.getElementById('printer-target-area').style.display = 'block'; // <--- O CAMPO NOVO
            }
        },

        submitProduct: async () => {
            const nomeEl = document.getElementById('new-prod-name');
            const precoEl = document.getElementById('new-prod-price');
            const precoPrazoEl = document.getElementById('new-prod-price-prazo');

            if (!nomeEl || !precoEl) return;
            const nome = nomeEl.value;
            const preco = precoEl.value;
            const precoPrazo = precoPrazoEl ? parseFloat(precoPrazoEl.value || 0) : 0;

            if (!nome || !preco) return alert("Preencha nome e preço");
            const id = document.getElementById('edit-prod-id').value;
            const cat = document.getElementById('new-prod-cat').value;
            const sizes = document.getElementById('clothing-sizes') ? document.getElementById('clothing-sizes').value : "";
            const colors = document.getElementById('clothing-colors') ? document.getElementById('clothing-colors').value : "";
            const subcat = document.getElementById('clothing-subcat') ? document.getElementById('clothing-subcat').value : "";
            const promo = document.getElementById('new-prod-promo') ? document.getElementById('new-prod-promo').checked : false;
            // isento_10=true = produto NÃO entra na taxa de serviço. Checkbox marcado = ENTRA na taxa.
            const inclTaxa10 = document.getElementById('new-prod-taxa10') ? document.getElementById('new-prod-taxa10').checked : true;
            const isentoTaxa10 = !inclTaxa10;
            const desc = document.getElementById('new-prod-desc') ? document.getElementById('new-prod-desc').value : "";
            const codigo = document.getElementById('new-prod-code') ? document.getElementById('new-prod-code').value : null;
            const exibirOnline = document.getElementById('new-prod-online').checked;
            const impressoraAlvo = document.getElementById('new-prod-printer').value.trim();
            const estoqueVal = document.getElementById('new-prod-stock').value;
            const estoque = estoqueVal ? parseInt(estoqueVal) : 0;
            let galeriaUrls = [];
            const fileInput = document.getElementById('new-prod-file');
            if (fileInput && fileInput.files.length > 0) {
                App.utils.toast("Enviando imagem...", "info");
                for (let i = 0; i < fileInput.files.length; i++) {
                    const file = fileInput.files[i];
                    const fileName = `${App.state.storeId}_${Date.now()}_${i}.${file.name.split('.').pop()}`;
                    const { data, error } = await _sb.storage.from('produtos').upload(fileName, file);
                    if (error) { console.error("Erro upload:", error); alert("Erro ao enviar imagem."); return; }
                    const { data: urlData } = _sb.storage.from('produtos').getPublicUrl(fileName);
                    galeriaUrls.push(urlData.publicUrl);
                }
            }
            // Autopeças Fields Calculation
            const apCodFab = document.getElementById('ap-cod-fab') ? document.getElementById('ap-cod-fab').value : null;
            const apCodFor = document.getElementById('ap-cod-for') ? document.getElementById('ap-cod-for').value : null;
            const apAplicacao = document.getElementById('ap-aplicacao') ? document.getElementById('ap-aplicacao').value : null;
            const apLocal = document.getElementById('ap-local') ? document.getElementById('ap-local').value : null;
            const apSubcat = document.getElementById('autopecas-subcat') ? document.getElementById('autopecas-subcat').value : null;
            const apCusto = document.getElementById('new-prod-price-custo') ? parseFloat(document.getElementById('new-prod-price-custo').value) : 0;
            const apMinStock = document.getElementById('ap-min-stock') ? parseInt(document.getElementById('ap-min-stock').value) : 0;
            const apNegStock = document.getElementById('ap-neg-stock') ? document.getElementById('ap-neg-stock').checked : true;

            const finalSubcat = subcat || apSubcat; // Use the one that is populated

            // 🔑 FISCAL: Lê NCM, CEST, Origem e CFOP do formulário
            const ncmVal = (document.getElementById('prod-ncm')?.value || '').replace(/\D/g, '').substring(0, 8);
            const cestVal = (document.getElementById('prod-cest')?.value || '').replace(/\D/g, '').substring(0, 7);
            const origemVal = document.getElementById('prod-origem')?.value || '0';
            const cfopVal = document.getElementById('prod-cfop')?.value || '';

            let payload = {
                store_id: App.state.storeId,
                nome,
                preco: parseFloat(preco),
                preco_prazo: precoPrazo,
                categoria: cat,
                promocao: promo,
                descricao: desc,
                sizes: sizes,
                cores: colors,
                subcategoria: finalSubcat,
                codigo_cardapio: codigo,
                exibir_online: exibirOnline,
                impressora_alvo: impressoraAlvo,
                estoque: estoque,
                isento_10: isentoTaxa10,
                // 🔑 FISCAL: NCM, CEST, Origem, CFOP (Reforma Tributária - IBS/CBS)
                ncm: ncmVal || null,
                cest: cestVal || null,
                origem: origemVal,
                cfop: cfopVal || null,
                // New Fields
                cod_fabricante: apCodFab,
                cod_fornecedor: apCodFor,
                cod_aplicacao: apAplicacao,
                localizacao: apLocal,
                preco_custo: apCusto,
                estoque_minimo: apMinStock,
                allow_negative_stock: apNegStock
            };

            if (galeriaUrls.length > 0) { payload.galeria = galeriaUrls; payload.imagem_url = galeriaUrls[0]; }
            if (id) await _sb.from('products').update(payload).eq('id', id);
            else await _sb.from('products').insert(payload);
            App.store.closeProductModal(); App.store.loadMyProducts(); App.utils.toast("Produto salvo!", "success");
        },

        listenMessages: () => {
            const myStoreId = App.state.storeId;
            _sb.channel('store-notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `store_id=eq.${myStoreId}` }, async (payload) => {
                if (payload.new.sender_id !== App.state.user.id) {
                    const { data: sender } = await _sb.from('profiles').select('nome_completo').eq('id', payload.new.sender_id).single();
                    App.utils.showChatNotification(sender.nome_completo, payload.new.content, payload.new.client_id);
                }
            }).subscribe();
        }
    },

    // =============================================================================
    // 📈 MÓDULO DASHBOARD (GRÁFICOS)
    // =============================================================================
    dashboard: {
        chart1: null,
        chart2: null,

        loadCharts: async () => {
            const storeId = App.state.storeId;
            if (!storeId) return;

            // Define período (30 dias)
            const dateLimit = new Date();
            dateLimit.setDate(dateLimit.getDate() - 30);

            // Busca dados (ignora erro se estiver offline)
            if (!navigator.onLine) return;

            const dateStr = dateLimit.toISOString();
            
            let allOrders = [];
            let fromIdx = 0;
            let limitStep = 999;
            let contFetch = true;

            while(contFetch) {
                const { data } = await _sb.from('orders')
                    .select('created_at, total_pago, status, origem_venda, products(preco)')
                    .eq('store_id', storeId)
                    .neq('status', 'cancelado')
                    .neq('status', 'devolvido')
                    .gte('created_at', dateStr)
                    .range(fromIdx, fromIdx + limitStep);

                if (data && data.length > 0) {
                    allOrders = allOrders.concat(data);
                    fromIdx += limitStep + 1;
                    if (data.length <= limitStep) contFetch = false;
                } else {
                    contFetch = false;
                }
            }

            if (allOrders.length === 0) return;

            const salesData = {};
            let totalOnline = 0, totalPDV = 0;

            allOrders.forEach(o => {
                const d = new Date(o.created_at);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const sortKey = `${year}-${month}-${day}`; 

                const val = parseFloat(o.total_pago) || parseFloat(o.products?.preco) || 0;
                const isPDV = o.origem_venda === 'pdv' || o.origem_venda === 'comanda' || o.origem_venda === 'pdv_offline';

                if (!salesData[sortKey]) salesData[sortKey] = { online: 0, pdv: 0, label: `${day}/${month}` };
                if (isPDV) { salesData[sortKey].pdv += val; totalPDV += val; }
                else { salesData[sortKey].online += val; totalOnline += val; }
            });

            // Ordena as chaves corretamente cronologicamente por YYYY-MM-DD
            const sortedKeys = Object.keys(salesData).sort();
            const labels = sortedKeys.map(k => salesData[k].label);
            const dataOnline = sortedKeys.map(k => salesData[k].online);
            const dataPDV = sortedKeys.map(k => salesData[k].pdv);

            // Renderiza Gráfico de Barras
            const ctx1 = document.getElementById('chart-sales-bar');
            if (ctx1) {
                // 🔥 FIX: Aumenta o tamanho do gráfico
                ctx1.style.maxHeight = '350px';
                ctx1.parentElement.style.height = '350px';

                if (App.dashboard.chart1) App.dashboard.chart1.destroy();
                App.dashboard.chart1 = new Chart(ctx1, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: 'Online', data: dataOnline, backgroundColor: '#3b82f6', stack: 'Stack 0' },
                            { label: 'PDV', data: dataPDV, backgroundColor: '#f59e0b', stack: 'Stack 0' }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false, // 🔥 Permite esticar
                        plugins: { legend: { display: false }, title: { display: true, text: 'Vendas (30d)', color: '#fff' } },
                        scales: { x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } }
                    }
                });
            }

            // 🔥 BOTÃO CADASTRAR CAIXA (Abaixo dos Gráficos)
            const chartArea = document.getElementById('chart-sales-bar')?.parentElement;
            if (chartArea && !document.getElementById('btn-dash-staff')) {
                const btn = document.createElement('div');
                btn.innerHTML = `<button id="btn-dash-staff" class="btn btn-secondary btn-full" style="margin-top:15px;" onclick="RelatoriosEnterprise.openStaffModal()"><i class="ri-user-add-line"></i> Cadastrar Caixa / Equipe</button>`;
                chartArea.insertAdjacentElement('afterend', btn);
            }
        }
    },

    // =============================================================================
    // 💾 MÓDULO OFFLINE (INDEXED DB)
    // =============================================================================
    offline: {
        dbPromise: null,

        init: async () => {
            if (!window.idb) return;
            // Cria/Abre banco 'NaxioDB' versão 1
            App.offline.dbPromise = idb.openDB('NaxioDB', 1, {
                upgrade(db) {
                    // Cria store para pedidos pendentes
                    if (!db.objectStoreNames.contains('pending_orders')) {
                        db.createObjectStore('pending_orders', { keyPath: 'id', autoIncrement: true });
                    }
                },
            });

            // Ouve evento de voltar online para sincronizar
            window.addEventListener('online', App.offline.sync);
            // Tenta sincronizar ao abrir se tiver net
            if (navigator.onLine) App.offline.sync();
        },

        saveOrder: async (orderPayload) => {
            const db = await App.offline.dbPromise;
            await db.add('pending_orders', {
                ...orderPayload,
                created_at: new Date().toISOString(), // Data local
                synced: false
            });
            App.utils.toast("⚠️ Sem internet. Venda salva no dispositivo!", "warning");
        },

        sync: async () => {
            if (!navigator.onLine) return;
            const db = await App.offline.dbPromise;
            const tx = db.transaction('pending_orders', 'readwrite');
            const store = tx.objectStore('pending_orders');
            const pending = await store.getAll();

            if (pending.length === 0) return;

            App.utils.toast(`Sincronizando ${pending.length} vendas offline...`, "info");

            for (const order of pending) {
                // Tenta enviar para o Supabase
                const { error } = await _sb.from('orders').insert({
                    store_id: order.store_id,
                    session_id: order.session_id,
                    cliente_id: order.cliente_id,
                    status: 'concluido',
                    origem_venda: 'pdv_offline', // Marca para saber que veio do offline
                    taxa_servico: order.taxa_servico,
                    total_pago: order.total_pago,
                    endereco_destino: 'Venda Balcão (Offline)',
                    observacao: order.observacao,
                    created_at: order.created_at // Mantém a data original da venda
                });

                if (!error) {
                    // Se deu certo, remove do banco local
                    await db.delete('pending_orders', order.id);
                }
            }
            App.utils.toast("Sincronização concluída! ✅", "success");
            if (App.dashboard) App.dashboard.loadCharts();
        }
    },

    // =============================================================================
    // 🖨️ MÓDULO DE IMPRESSORAS
    // =============================================================================
    printers: {
        list: [],

        openModal: async () => {
            // Garante que storeId está definido antes de tentar carregar impressoras
            if (!App.state.storeId) {
                console.warn("⚠️ storeId não está definido. Aguardando...");
                // Tenta recarregar informações da loja se não existirem
                if (App.store && App.store.init) {
                    await App.store.init();
                }
            }

            document.getElementById('printer-config-modal').style.display = 'flex';
            await App.printers.load();
        },

        load: async () => {
            // Garante que storeId está definido
            if (!App.state.storeId) {
                console.error("❌ storeId não definido ao tentar carregar impressoras");
                const div = document.getElementById('printer-list-display');
                if (div) div.innerHTML = '<p class="text-sm text-muted" style="padding:10px;">Erro: Loja não inicializada. Recarregue a página.</p>';
                return;
            }

            // Carrega impressoras do banco
            const { data } = await _sb.from('store_printers').select('*').eq('store_id', App.state.storeId);
            App.printers.list = data || [];

            const div = document.getElementById('printer-list-display');
            if (App.printers.list.length === 0) {
                div.innerHTML = '<p class="text-sm text-muted" style="padding:10px;">Nenhuma impressora configurada.</p>';
            } else {
                div.innerHTML = App.printers.list.map(p => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                        <div>
                            <strong>${p.nome}</strong>
                            <br><span class="text-xs text-muted">IP: ${p.ip}</span>
                        </div>
                        <button class="btn btn-danger btn-sm" style="width:auto; padding:5px 10px;" onclick="App.printers.delete('${p.id}')">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                `).join('');
            }
        },

        add: async () => {
            const nome = document.getElementById('printer-new-name').value.trim();
            const ip = document.getElementById('printer-new-ip').value.trim();
            if (!nome || !ip) return alert("Preencha Nome e IP");

            const { error } = await _sb.from('store_printers').insert({
                store_id: App.state.storeId,
                nome: nome,
                ip: ip
            });

            if (error) alert("Erro: " + error.message);
            else {
                document.getElementById('printer-new-name').value = "";
                document.getElementById('printer-new-ip').value = "";
                App.printers.load();
                App.utils.toast("Impressora salva!", "success");
            }
        },

        delete: async (id) => {
            if (confirm("Remover esta impressora?")) {
                await _sb.from('store_printers').delete().eq('id', id);
                App.printers.load();
            }
        },

        send: async (text, printerIp = null) => {
            // 1. Tenta Agente Local (Python) na porta 8080
            // Isso permite impressão silenciosa direta na USB sem dialogos
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s para detectar agente

                const res = await fetch('http://localhost:8080/api/local/print', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text, printer: printerIp || 'Default' }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    console.log("✅ Impressão enviada via Agente Local (Python)");
                    App.utils.toast("Enviado para Impressora Local 🖨️", "success");
                    return true;
                }
            } catch (e) {
                // Silencioso: Agente não está rodando, segue para o método Cloud
                console.log("⚠️ Agente Local offline. Usando Cloud Print...");
            }

            try {
                // 2. Método Cloud (Original)
                // Como o site está na nuvem, não existe "localhost".
                // Enviamos para a fila do Supabase e o Agente no PC do caixa imprime.
                console.log("☁️ Enviando impressão para a fila da Nuvem...");

                const { error } = await _sb.from('print_queue').insert({
                    store_id: App.state.storeId,
                    printer_ip: printerIp,
                    content: text,
                    created_at: new Date().toISOString()
                });

                if (error) throw error;

                return true;

            } catch (e) {
                console.error("Erro ao enviar impressão:", e);
                App.utils.toast("Erro ao enviar para fila de impressão", "error");
                return false;
            }
        },

        // --- ROTEADOR DE PEDIDOS (Bar vs Cozinha) ---
        routeAndPrint: async (items, detailsOrder) => {
            if (App.printers.list.length === 0) await App.printers.load();
            const printers = App.printers.list;

            if (printers.length === 0) return App.utils.toast("Sem impressoras configuradas", "error");

            // Agrupa itens por destino
            const mapPrint = {};

            items.forEach(item => {
                // Se for delivery, TUDO vai pra Cozinha. Se for Mesa, respeita o setor.
                let alvo = detailsOrder.isDelivery ? 'Cozinha' : (item.impressora_alvo || 'Cozinha');

                // Normaliza o nome (Cozinha = cozinha)
                const key = printers.find(p => p.nome.toLowerCase() === alvo.toLowerCase());

                if (key) {
                    if (!mapPrint[key.ip]) mapPrint[key.ip] = { nome: key.nome, itens: [] };
                    mapPrint[key.ip].itens.push(item);
                } else {
                    // Se não achar a impressora específica, manda pra primeira da lista como fallback
                    const fallback = printers[0];
                    if (!mapPrint[fallback.ip]) mapPrint[fallback.ip] = { nome: fallback.nome, itens: [] };
                    mapPrint[fallback.ip].itens.push(item);
                }
            });

            // Envia para cada impressora
            for (const [ip, dados] of Object.entries(mapPrint)) {
                let txt = `SETOR: ${dados.nome.toUpperCase()}\n`;
                txt += `PEDIDO #${detailsOrder.id.slice(0, 4)}\n`;
                txt += `${detailsOrder.cliente}\n`;
                txt += `--------------------------------\n`;

                // 🔥 AGRUPAMENTO DE ITENS IGUAIS NA IMPRESSÃO
                const itensAgrupados = [];
                dados.itens.forEach(i => {
                    const key = `${i.nome}-${i.obs || ''}`;
                    const existe = itensAgrupados.find(x => `${x.nome}-${x.obs || ''}` === key);
                    if (existe) existe.qtd += (parseInt(i.qtd) || 1);
                    else itensAgrupados.push({ ...i, qtd: (parseInt(i.qtd) || 1) });
                });

                itensAgrupados.forEach(i => {
                    txt += `${i.qtd}x ${i.nome}\n`;
                    if (i.obs) txt += `   OBS: ${i.obs}\n`;
                });
                txt += `--------------------------------\n\n\n\n\n\n.`;

                App.printers.send(txt, ip);
            }
        }
    },

    // =============================================================================
    // 🏛️ MÓDULO FISCAL (NFC-e)
    // =============================================================================
    fiscal: {
        init: () => { console.log("Fiscal Ready"); },

        emitirNFCe: async (orderId, totalOverride = null, paymentsList = null, itemsList = null) => {
            const lojaId = App.state.storeId;
            console.log("📤 Enviando Fiscal:", { Pedido: orderId, Loja: lojaId, Itens: itemsList });

            if (!orderId || !lojaId) return alert("❌ Erro: ID do Pedido ou Loja não identificados.");

            App.utils.toast("Solicitando emissão fiscal...", "info");

            try {
                // 1. Chamada à API (Mantida do Código 1)
                const res = await fetch('/api/emitir_fiscal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order_id: orderId,
                        store_id: lojaId,
                        items_payload: itemsList || []
                    })
                });

                const data = await res.json();

                // 2. Verificação de Sucesso
                if (res.ok && data.sucesso) {
                    App.utils.toast("✅ NFC-e Autorizada!", "success");

                    // --- FUSÃO AQUI: Chama o Preview em vez de abrir janela ---
                    if (data.pdf) {
                        // Passa o PDF e a Chave (se a API retornar) para o modal
                        Fiscal.exibirPreviewDanfe(data.pdf, data.chave);
                    } else {
                        alert("Nota autorizada, mas URL do PDF não retornou.");
                    }

                } else {
                    // 3. Tratamento de Erro Detalhado (Mantido do Código 1)
                    console.error("❌ Erro API Detalhado:", data);

                    let msgErro = data.error || "Erro desconhecido.";

                    if (data.full_details && data.full_details.error) {
                        const errObj = data.full_details.error;
                        if (errObj.message) msgErro = errObj.message;
                        if (errObj.errors && Array.isArray(errObj.errors)) {
                            msgErro += "\nDetalhes: " + errObj.errors.map(e => e.message || JSON.stringify(e)).join('\n');
                        }
                    }

                    alert("⚠️ Falha na Emissão:\n\n" + msgErro);
                }

            } catch (e) {
                console.error(e);
                alert("Erro de Conexão: " + e.message);
            }
        }
    },

    // =============================================================================
    // 🤵 MÓDULO GARÇOM (WAITER)
    // =============================================================================
    waiter: {
        init: async () => {
            console.log("🚀 Iniciando Módulo Garçom...");

            if (!App.state.user) {
                console.warn("Usuário deslogado. Redirecionando...");
                App.router.go('auth');
                return;
            }

            // --- 1. Identificar a Loja (Seja Funcionário ou Dono) ---
            let storeIdFound = null;

            // Tenta achar como equipe (Garçom)
            let { data: staffData } = await _sb.from('store_staff')
                .select('store_id')
                .eq('profile_id', App.state.user.id)
                .maybeSingle();

            if (staffData) {
                storeIdFound = staffData.store_id;
            } else {
                // Tenta achar como Dono (Admin)
                const { data: adminStore } = await _sb.from('stores')
                    .select('id')
                    .eq('admin_id', App.state.user.id)
                    .maybeSingle();

                if (adminStore) storeIdFound = adminStore.id;
            }

            if (!storeIdFound) {
                alert("Erro: Seu usuário não está vinculado a nenhuma loja.");
                return;
            }

            App.state.storeId = storeIdFound;
            console.log("✅ Loja Vinculada:", App.state.storeId);

            // --- 2. Correção Automática do HTML ---
            // Se o container das mesas não existir, injetamos ele na página
            let container = document.getElementById('waiter-comanda-list');
            if (!container) {
                console.warn("⚠️ Container de mesas não encontrado. Tentando corrigir...");
                // Tenta achar a view do garçom para inserir o grid
                const viewSection = document.getElementById('view-garcom') || document.querySelector('#view-waiter') || document.querySelector('section[id*="garcom"]');

                if (viewSection) {
                    // Cria o cabeçalho e o grid dinamicamente
                    const headerHTML = `<div style="padding:10px; text-align:center;"><h2>🍽️ Mesas / Comandas</h2></div>`;
                    const gridHTML = `<div id="waiter-comanda-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; padding: 10px;"></div>`;
                    viewSection.innerHTML = headerHTML + gridHTML;
                    container = document.getElementById('waiter-comanda-list'); // Pega a referência nova
                } else {
                    console.error("❌ ERRO CRÍTICO: Não achei a <section> da página de garçom no HTML.");
                    alert("Erro: A página de garçom não foi encontrada no HTML.");
                    return;
                }
            }

            // Persistência: Se recarregar, volta pra cá
            if (localStorage.getItem('last_view') === 'waiter') {
                // Já estamos aqui
            }

            // --- 3. Carregar Mesas ---
            await App.waiter.loadTables();

            // --- 4. Ativar Atualização em Tempo Real ---
            if (App.state.waiterSub) _sb.removeChannel(App.state.waiterSub);
            App.state.waiterSub = _sb.channel('waiter-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas', filter: `store_id=eq.${storeIdFound}` }, (payload) => {
                    App.waiter.loadTables();
                    // Se estiver com a comanda aberta, atualiza os itens em tempo real
                    if (App.state.currentComanda && (payload.new.id === App.state.currentComanda || payload.old.id === App.state.currentComanda)) {
                        // 🔥 FECHA MODAL SE MESA FICAR LIVRE (PAGA) OU FECHADA
                        if (payload.new.status === 'fechada' || payload.new.status === 'livre') { document.getElementById('comanda-modal').style.display = 'none'; App.state.currentComanda = null; alert("Mesa encerrada/paga!"); }
                        else { App.waiter.loadItems(App.state.currentComanda); }
                    }
                })
                .subscribe();
        },

        loadTables: async () => {
            const hoje = new Date().toISOString().slice(0, 10);
            const { data: rawData } = await _sb.from('comandas')
                .select('*')
                .eq('store_id', App.state.storeId)
                .order('numero', { ascending: true });

            const container = document.getElementById('waiter-comanda-list');

            if (container) {
                container.style.display = 'grid';
                container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
                container.style.gap = '15px';
                container.style.width = '100%';
                container.style.marginTop = '20px';

                if (!rawData || rawData.length === 0) {
                    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; background:var(--surface); border-radius:8px; border:1px dashed var(--border); color:var(--text-muted);"><h3>Nenhuma mesa cadastrada!</h3><p>Vá no Painel Admin para criar as mesas.</p></div>';
                    return;
                }

                const data = rawData.filter(c => {
                    if (c.status === 'livre' || c.status === 'aberta' || c.status === 'ocupada') return true;
                    if (c.status === 'fechada') {
                        const updated = (c.updated_at || c.updatedAt || '').slice(0, 10);
                        return updated >= hoje;
                    }
                    return true;
                });

                container.innerHTML = data.map(c => {
                    const isLivre = c.status === 'livre';
                    const isFechada = c.status === 'fechada';
                    let bgColor, borderColor, textColor, statusText;
                    if (isFechada) {
                        bgColor = '#334155';
                        borderColor = '#64748b';
                        textColor = '#94a3b8';
                        statusText = 'FECHADA';
                    } else if (isLivre) {
                        bgColor = '#dcfce7';
                        borderColor = '#22c55e';
                        textColor = '#166534';
                        statusText = 'LIVRE';
                    } else {
                        bgColor = '#fee2e2';
                        borderColor = '#ef4444';
                        textColor = '#991b1b';
                        statusText = 'OCUPADA';
                    }
                    const itemCount = c.items ? c.items.length : 0;
                    const onClick = isFechada ? `onclick="App.utils.toast('Mesa já fechada/paga no caixa.', 'info')"` : `onclick="App.waiter.openComanda('${c.id}', '${c.numero}')"`;

                    return `
                    <div ${onClick} 
                         style="background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; position: relative; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); transition: transform 0.2s;">
                        
                        ${!isLivre && !isFechada ? `<div style="position:absolute; top:-10px; right:-10px; background:${borderColor}; color:white; border-radius:50%; width:28px; height:28px; font-size:14px; display:flex; align-items:center; justify-content:center; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${itemCount}</div>` : ''}
                        ${isFechada ? '<div style="position:absolute; top:-8px; right:-8px; background:#64748b; color:#fff; border-radius:50%; width:24px; height:24px; font-size:11px; display:flex; align-items:center; justify-content:center;">✓</div>' : ''}
                        
                        <h3 style="margin:0; font-size:2rem; font-weight:800; color:#1e293b;">${c.numero}</h3>
                        <div style="font-size:0.85rem; font-weight:bold; color:${textColor}; margin-top:5px; text-transform:uppercase; letter-spacing:1px;">${statusText}</div>
                    </div>`;
                }).join('');
            } else {
                console.error("ERRO: Elemento 'waiter-comanda-list' não encontrado no DOM.");
            }
        },

        openComanda: async (id, numero) => {
            App.state.currentComanda = id;

            // Preenche modal
            const titleEl = document.getElementById('comanda-title');
            if (titleEl) titleEl.innerText = `Mesa ${numero}`;

            const searchInput = document.getElementById('waiter-prod-search');
            if (searchInput) searchInput.value = "";

            const resultsBox = document.getElementById('waiter-search-results');
            if (resultsBox) resultsBox.style.display = 'none';

            // Abre Modal
            const modal = document.getElementById('comanda-modal');
            if (modal) modal.style.display = 'flex';

            App.waiter.loadItems(id);
        },

        loadItems: async (comandaId) => {
            const { data } = await _sb.from('comandas').select('items').eq('id', comandaId).single();
            App.state.currentComandaItems = data?.items || [];

            const list = document.getElementById('comanda-items-list');
            if (list) {
                if (App.state.currentComandaItems.length === 0) {
                    list.innerHTML = '<p class="text-center text-muted" style="padding:10px;">Comanda vazia.</p>';
                } else {
                    // AGRUPAMENTO VISUAL
                    const grouped = {};
                    App.state.currentComandaItems.forEach(i => {
                        const key = `${i.id}-${i.obs || ''}-${i.price}`;
                        if (!grouped[key]) grouped[key] = { ...i, qtd: 0, garcons: new Set() };
                        grouped[key].qtd += (parseInt(i.qtd) || 1);
                        grouped[key].garcons.add(i.garcom || 'Sistema');
                    });

                    list.innerHTML = Object.values(grouped).map(item => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                            <div>
                                <div style="font-weight:bold;">${item.qtd}x ${item.nome}</div>
                                ${item.obs ? `<div class="text-xs text-muted" style="color:orange;">Obs: ${item.obs}</div>` : ''}
                                <div class="text-xs text-muted">Garçom: ${Array.from(item.garcons).join(', ')}</div>
                            </div>
                            <div style="text-align:right;">
                                <div>R$ ${(item.price * item.qtd).toFixed(2)}</div>
                                ${item.printed_qtd && item.printed_qtd >= item.qtd ? '<span style="font-size:0.7rem; color:green;">✅ Na Cozinha</span>' : '<span style="font-size:0.7rem; color:orange;">⏳ Pendente</span>'}
                            </div>
                        </div>`).join('');
                }
            }
        },

        addItem: async () => {
            const term = document.getElementById('waiter-prod-search').value.trim();
            if (!term) return alert("Digite o nome ou código do produto.");

            App.utils.toast("Buscando...", "info");
            // Busca produto por nome ou código de barras
            const { data } = await _sb.from('products')
                .select('*')
                .eq('store_id', App.state.storeId)
                .or(`nome.ilike.%${term}%,codigo_cardapio.eq.${term}`)
                .limit(10);

            const resultBox = document.getElementById('waiter-search-results');
            if (resultBox) {
                if (data && data.length > 0) {
                    resultBox.style.display = 'block';
                    resultBox.innerHTML = data.map(p => `
                        <div style="padding:10px; border-bottom:1px solid #444; cursor:pointer; background:#1e293b; color:#fff;" onclick="App.waiter.askDetails('${p.id}', '${p.nome}', ${p.preco})">
                            <strong>${p.codigo_cardapio ? `[${p.codigo_cardapio}] ` : ''}${p.nome}</strong>
                            <br><span class="text-xs" style="color: #94a3b8;">R$ ${p.preco.toFixed(2)}</span>
                        </div>`).join('');
                } else {
                    alert("Nenhum produto encontrado.");
                    resultBox.style.display = 'none';
                }
            }
        },

        askDetails: (id, nome, price) => {
            const modalHtml = `
            <div id="waiter-item-modal" class="modal-overlay" style="display:flex; z-index:10000; align-items:center; justify-content:center;">
                <div class="modal-content" style="width:90%; max-width:350px;">
                    <div class="modal-header">
                        <h3>${nome}</h3>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('waiter-item-modal').remove()">X</button>
                    </div>
                    <div class="modal-body">
                        <div class="input-wrapper">
                            <label>Quantidade</label>
                            <div style="display:flex; gap:10px;">
                                <input type="number" id="w-qtd" class="input-field" value="1" style="text-align:center;">
                            </div>
                        </div>
                        <div class="input-wrapper">
                            <label>Observação (Ex: Sem gelo)</label>
                            <textarea id="w-obs" class="input-field" rows="3" placeholder="Digite aqui..."></textarea>
                        </div>
                        <button class="btn btn-success btn-full" onclick="App.waiter.confirmAdd('${id}', '${nome}', ${price})">Adicionar</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        },

        confirmAdd: async (id, nome, price) => {
            const qtdEl = document.getElementById('w-qtd');
            const obsEl = document.getElementById('w-obs');
            const qtd = qtdEl ? parseInt(qtdEl.value) : 1;
            const obs = obsEl ? obsEl.value.trim() : '';

            const modal = document.getElementById('waiter-item-modal');
            if (modal) modal.remove();

            // Recarrega itens atuais para evitar sobrescrita
            const { data: current } = await _sb.from('comandas').select('items').eq('id', App.state.currentComanda).single();
            let currentItems = current.items || [];

            const garcomName = App.state.profile?.nome_completo?.split(' ')[0] || 'Sistema';

            // Adiciona item
            // Verifica se já existe para somar quantidade (opcional, aqui adicionamos nova linha para controle individual)
            const existing = currentItems.find(i => i.id === id && i.printed_qtd === 0 && (i.obs || '') === obs);

            if (existing) {
                existing.qtd += qtd;
                // Não sobrescrevemos existing.garcom para manter o garçom original do pedido
            } else {
                currentItems.push({ 
                    id: id, 
                    nome: nome, 
                    price: price, 
                    qtd: qtd, 
                    garcom: garcomName, 
                    printed_qtd: 0, 
                    obs: obs,
                    added_at: new Date().toISOString()
                });
            }

            await _sb.from('comandas').update({ items: currentItems, status: 'aberta' }).eq('id', App.state.currentComanda);

            document.getElementById('waiter-search-results').style.display = 'none';
            document.getElementById('waiter-prod-search').value = '';

            App.utils.toast(`+${qtd} ${nome}`, 'success');
            App.waiter.loadItems(App.state.currentComanda);
            App.waiter.loadTables();
        },

        printBill: () => {
            const items = App.state.currentComandaItems || [];
            const titleEl = document.getElementById('comanda-title');
            const mesa = titleEl ? titleEl.innerText : 'Mesa';

            if (items.length === 0) return alert("Comanda vazia.");

            const total = items.reduce((acc, i) => acc + (i.price * i.qtd), 0);

            const itemsHtml = items.map(item => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:0.9rem;">
                    <span>${item.qtd}x ${item.nome}</span>
                    <span>R$ ${(item.price * item.qtd).toFixed(2)}</span>
                </div>`).join('');

            const content = `
                <div style="font-family: monospace; width: 100%; padding: 10px;">
                    <h3 style="text-align:center; margin:0;">CONFERÊNCIA</h3>
                    <h2 style="text-align:center; margin:5px 0;">${mesa}</h2>
                    <p style="text-align:center; font-size:0.8rem; margin-bottom:10px;">${new Date().toLocaleString()}</p>
                    <hr style="border-top: 1px dashed #000; margin:10px 0;">
                    ${itemsHtml}
                    <hr style="border-top: 1px dashed #000; margin:10px 0;">
                    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.2rem;">
                        <span>TOTAL:</span>
                        <span>R$ ${total.toFixed(2)}</span>
                    </div>
                    <br>
                    <p style="text-align:center; font-size:0.8rem;">* Não é documento fiscal *</p>
                </div>`;

            const area = document.getElementById('printable-area');
            if (area) {
                area.innerHTML = content;
                window.print();
            }
        },

        sendToKitchen: async () => {
            if (App.state.currentComandaItems.length === 0) return alert("Adicione itens antes.");

            const { error } = await _sb.from('comandas')
                .update({ imprimir_cozinha: true, updated_at: new Date() })
                .eq('id', App.state.currentComanda);

            if (error) {
                alert("Erro ao enviar: " + error.message);
            } else {
                App.utils.toast("Enviado para a Cozinha! 👨‍🍳", "success");
                document.getElementById('comanda-modal').style.display = 'none';
            }
        }
    },

    // =============================================================================
    // ⚙️ MÓDULO ADMINISTRAÇÃO
    // =============================================================================
    admin: {
        createComandas: async () => {
            const start = parseInt(document.getElementById('comanda-start').value);
            const end = parseInt(document.getElementById('comanda-end').value);
            if (!start || !end || end < start) return alert("Intervalo inválido");
            const rows = [];
            for (let i = start; i <= end; i++) rows.push({ store_id: App.state.storeId, numero: i, status: 'livre' });
            const { error } = await _sb.from('comandas').insert(rows);
            if (error) alert("Erro ao criar: " + error.message);
            else { alert(`${rows.length} comandas criadas!`); App.store.loadComandas(); }
        },
        registerStaff: async () => {
            const name = document.getElementById('staff-name').value.trim();
            const email = document.getElementById('staff-email').value.trim();
            const pass = document.getElementById('staff-pass').value.trim();
            const role = document.getElementById('staff-role').value;
            const rate = document.getElementById('staff-rate').value;
            if (!name || !email || !pass) return App.utils.toast('Preencha todos os campos', 'error');

            // Verifica se email já existe
            const { data: existing } = await _sb.from('profiles').select('id').eq('email', email).maybeSingle();
            if (existing) {
                App.utils.toast('Email já cadastrado! Use a aba "Vincular Existente".', 'error');
                return;
            }

            // Mapeamento seguro: o banco pode não aceitar 'caixa' ou 'cozinha' no enum da tabela profiles
            const safeRole = (role === 'caixa' || role === 'cozinha' || role === 'cumim') ? 'garcom' : role;

            const { data: newUser, error } = await _sb.from('profiles').insert({
                nome_completo: name, email: email, password: pass, role: safeRole, is_verified: true
            }).select().single();

            if (error) return App.utils.toast('Erro no perfil: ' + error.message, 'error');

            await _sb.from('store_staff').insert({ store_id: App.state.storeId, profile_id: newUser.id, cargo: role, taxa_servico: rate });
            App.utils.toast('Funcionário criado e vinculado!', 'success');
            document.getElementById('staff-modal')?.remove();
        },

        // Busca funcionário pelo email (para vincular existente)
        lookupStaff: async () => {
            const email = document.getElementById('link-staff-email').value.trim();
            if (!email) return App.utils.toast('Digite o email', 'error');

            const resultDiv = document.getElementById('link-staff-result');
            const notFoundDiv = document.getElementById('link-staff-notfound');
            resultDiv.style.display = 'none';
            notFoundDiv.style.display = 'none';

            App.utils.toast('Buscando...', 'info');
            const { data } = await _sb.from('profiles').select('id, nome_completo, role, email').eq('email', email).maybeSingle();

            if (!data) {
                notFoundDiv.style.display = 'block';
                return;
            }

            // Guarda o ID encontrado para o próximo passo
            resultDiv.dataset.profileId = data.id;

            document.getElementById('link-staff-name').textContent = data.nome_completo;
            document.getElementById('link-staff-role-label').textContent =
                data.email + ' • ' + (data.role || 'funcionario').toUpperCase();

            // Define cargo padrão pelo role do perfil
            const roleSelect = document.getElementById('link-staff-role');
            if (roleSelect && data.role) roleSelect.value = data.role;

            resultDiv.style.display = 'block';
            App.utils.toast('Funcionário encontrado!', 'success');
        },

        // Vincula funcionário existente a esta loja
        linkExistingStaff: async () => {
            const resultDiv = document.getElementById('link-staff-result');
            const profileId = resultDiv?.dataset.profileId;
            if (!profileId) return App.utils.toast('Busque um funcionário primeiro', 'error');

            const role = document.getElementById('link-staff-role').value;
            const rate = document.getElementById('link-staff-rate').value || '10';

            // Verifica se já está vinculado a esta loja
            const { data: alreadyLinked } = await _sb.from('store_staff')
                .select('id')
                .eq('store_id', App.state.storeId)
                .eq('profile_id', profileId)
                .maybeSingle();

            if (alreadyLinked) {
                App.utils.toast('Este funcionário já está vinculado a esta loja!', 'error');
                return;
            }

            const { error } = await _sb.from('store_staff').insert({
                store_id: App.state.storeId,
                profile_id: profileId,
                cargo: role,
                taxa_servico: parseFloat(rate)
            });

            if (error) {
                App.utils.toast('Erro ao vincular: ' + error.message, 'error');
                return;
            }

            App.utils.toast('Funcionário vinculado com sucesso! 🎉', 'success');
            document.getElementById('staff-modal')?.remove();
        }
    },

    // =============================================================================
    // 🛍️ MÓDULO CATÁLOGO (CLIENTE)
    // =============================================================================
    catalog: {
        currentCat: 'Todos',

        filter: (cat, btn) => {
            document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            App.catalog.currentCat = cat;
            const subList = document.getElementById('sub-category-list');
            if (subList) subList.innerHTML = '';
            App.catalog.load();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        selectSize: (element) => {
            const parent = element.parentElement;
            const boxes = parent.getElementsByClassName('size-box');
            for (let box of boxes) { box.classList.remove('selected'); }
            element.classList.add('selected');
        },

        safeClick: (pEncoded, dEncoded) => {
            const p = JSON.parse(decodeURIComponent(pEncoded));
            const d = dEncoded !== 'null' ? JSON.parse(decodeURIComponent(dEncoded)) : null;
            const serviceCats = ['Serviços', 'Serviços de Gesso', 'Serviços de Pedreiros', 'Jardinagem', 'Outros'];

            if (serviceCats.includes(p.categoria)) {
                App.client.confirmOrder(p.id, p.store_id, p.preco, p.categoria, d ? JSON.stringify(d) : null);
            } else {
                if (p.categoria === 'Roupas') {
                    const containerId = `size-container-${p.id}`;
                    const containerIdColor = `color-container-${p.id}`;
                    App.catalog.addToCartClothing(p.id, p.store_id, containerId, containerIdColor);
                } else {
                    App.cart.add(p, p.store_id);
                }
            }
        },

        load: () => {
            const searchTerm = (document.getElementById('catalog-search')?.value || '').toLowerCase();
            const catalogEl = document.getElementById('public-catalog');
            if (!catalogEl) return;

            const cacheKey = 'CACHE_CATALOG_' + (App.catalog.currentCat || 'Todos');

            // ⚡ SÍNCRONO, SEM AWAIT: renderiza cache IMEDIATAMENTE antes de qualquer fetch
            const cached = localStorage.getItem(cacheKey);
            if (cached && !searchTerm) {
                try {
                    const cachedData = JSON.parse(cached);
                    if (cachedData?.length > 0) {
                        App.catalog._renderProducts(cachedData, '');
                        // Dispara fetch silencioso em background — UI já está pronta
                        App.catalog._fetchBackground(cacheKey, searchTerm);
                        return;
                    }
                } catch(e) {}
            }

            // Primeira visita (sem cache): mostra skeleton e busca
            App.catalog._showSkeleton(catalogEl);
            App.catalog._fetchBackground(cacheKey, searchTerm);
        },

        // ⚡ Skeleton cards animados para primeira visita
        _showSkeleton: (el) => {
            if (!document.getElementById('skel-style')) {
                const s = document.createElement('style');
                s.id = 'skel-style';
                s.textContent = `
                    @keyframes skelPulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
                    .skel-card { background: rgba(30, 41, 59, 0.5); border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; animation: skelPulse 2s infinite ease-in-out; }
                `;
                document.head.appendChild(s);
            }
            const skCard = () => `
                <div class="skel-card">
                    <div style="height:180px; background: rgba(255,255,255,0.03); display: flex; align-items: center; justify-content: center;">
                        <i class="ri-restaurant-line" style="font-size: 2rem; color: rgba(255,255,255,0.1);"></i>
                    </div>
                    <div style="padding:15px; display:flex; flex-direction:column; gap:12px;">
                        <div style="height:14px; width:80%; border-radius:4px; background:rgba(255,255,255,0.05);"></div>
                        <div style="height:10px; width:40%; border-radius:4px; background:rgba(255,255,255,0.03);"></div>
                        <div style="height:35px; border-radius:10px; background:rgba(255,255,255,0.05); margin-top:5px;"></div>
                    </div>
                </div>`;
            el.innerHTML = Array(6).fill(0).map(skCard).join('');
        },

        // ⚡ Fetch em background — nunca bloqueia a UI
        _fetchBackground: async (cacheKey, searchTerm) => {
            if (App.catalog._fetching) return;
            App.catalog._fetching = true;
            try {
                let query = _sb.from('products')
                    .select('id, nome, descricao, preco, imagem_url, galeria, categoria, subcategoria, promocao, exibir_online, estoque, sizes, cores, store_id, stores(nome_loja)')
                    .eq('exibir_online', true)
                    .gt('estoque', 0)
                    .order('promocao', { ascending: false })
                    .limit(150);

                if (App.catalog.currentCat !== 'Todos') {
                    if (CONFIG.categories?.includes(App.catalog.currentCat)) {
                        query = query.eq('categoria', App.catalog.currentCat);
                    } else {
                        query = query.eq('categoria', 'Roupas').eq('subcategoria', App.catalog.currentCat);
                    }
                }

                const { data, error } = await query;
                if (error || !data || data.length === 0) return;

                if (!searchTerm) {
                    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch(e) {}
                }
                App.catalog._renderProducts(data, searchTerm);
            } catch(e) {
                console.warn('catalog._fetchBackground erro:', e);
            } finally {
                App.catalog._fetching = false;
            }
        },

        // ⚡ Renderização separada para reuso (cache + dados frescos)
        _renderProducts: (data, searchTerm = '') => {
            const catalogEl = document.getElementById('public-catalog');
            if (!catalogEl) return;

            const filteredData = searchTerm
                ? data.filter(p => {
                    const matchName = (p.nome || '').toLowerCase().includes(searchTerm);
                    const matchStore = p.stores?.nome_loja?.toLowerCase().includes(searchTerm);
                    return matchName || matchStore;
                  })
                : data;

            const promos = filteredData.filter(p => p.promocao);
            const normal = filteredData.filter(p => !p.promocao);
            let html = '';

            if (App.catalog.currentCat === 'Roupas' || App.catalog.currentCat === 'Todos') {
                const subCats = CONFIG.subCategoriesRoupas || [];
                if (subCats.length > 0) {
                    const subCatsHtml = subCats.map(sub =>
                        `<button class="cat-pill" style="font-size:0.75rem; padding:4px 10px; margin-right:5px; background:var(--surface);" onclick="App.catalog.filter('${sub}', this)">${sub}</button>`
                    ).join('');
                    html += `<div style="grid-column:1/-1; margin-bottom:10px; overflow-x:auto; white-space:nowrap; padding-bottom:5px;">${subCatsHtml}</div>`;
                }
            }

            if (promos.length > 0) {
                html += `<div style="grid-column:1/-1; margin-bottom:10px;"><h3 style="color:var(--danger)">🔥 Ofertas em Destaque</h3></div>`;
                html += promos.map(p => App.catalog.renderCard(p)).join('');
                if (normal.length > 0) html += `<div style="grid-column:1/-1; margin:20px 0 10px 0;"><h3 style="color:var(--primary)">Produtos e Serviços</h3></div>`;
            }

            html += normal.map(p => App.catalog.renderCard(p)).join('');
            catalogEl.innerHTML = html || '<p style="grid-column:1/-1; text-align:center; padding:20px;">Nenhuma oferta encontrada.</p>';
        },

        renderCard: (p) => {
            let actionText = "Comprar";
            let btnColor = "btn-success";
            const pEncoded = encodeURIComponent(JSON.stringify(p));
            let selectorHtml = '';

            const containerIdSize = `size-container-${p.id}`;
            const containerIdColor = `color-container-${p.id}`;

            let finalOnclick = `App.cart.add(JSON.parse(decodeURIComponent('${pEncoded}')), '${p.store_id}')`;

            if (p.categoria === 'Roupas') {
                actionText = "Adicionar";
                let chipsSize = '';
                if (p.sizes && p.sizes.trim() !== '') {
                    const sizesArr = p.sizes.split(',').map(s => s.trim());
                    chipsSize = sizesArr.map(s => `<div class="size-box" onclick="App.catalog.selectSize(this)">${s}</div>`).join('');
                } else {
                    chipsSize = `<div class="size-box selected" onclick="App.catalog.selectSize(this)">Único</div>`;
                }

                let chipsColor = '';
                if (p.cores && p.cores.trim() !== '') {
                    const colorsArr = p.cores.split(',').map(c => c.trim());
                    chipsColor = colorsArr.map(c => `<div class="size-box" style="font-weight:normal;" onclick="App.catalog.selectSize(this)">${c}</div>`).join('');
                }

                selectorHtml = `
                    <div style="margin-top:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        <div style="margin-bottom:8px;">
                            <label class="text-xs" style="font-weight:bold; color:var(--text-muted);">Tamanho:</label>
                            <div id="${containerIdSize}" class="size-selector-container">${chipsSize}</div>
                        </div>
                        ${chipsColor ? `<div><label class="text-xs" style="font-weight:bold; color:var(--text-muted);">Cor:</label><div id="${containerIdColor}" class="size-selector-container">${chipsColor}</div></div>` : ''}
                    </div>`;

                finalOnclick = `App.catalog.addToCartClothing('${p.id}', '${p.store_id}', '${containerIdSize}', '${containerIdColor}')`;
            }

            let imagesHtml = '';
            if (p.galeria && Array.isArray(p.galeria) && p.galeria.length > 0) {
                imagesHtml = p.galeria.map(url => `<img src="${url}" class="gallery-img" loading="lazy">`).join('');
            } else if (p.imagem_url) {
                imagesHtml = `<img src="${p.imagem_url}" class="gallery-img">`;
            } else {
                imagesHtml = `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#555; background:#000;">Sem Foto</div>`;
            }

            return `
            <div class="card">
                ${p.promocao ? '<div class="badge badge-promo">PROMOÇÃO</div>' : ''}
                <div class="product-gallery-wrapper">
                    <div class="product-gallery">${imagesHtml}</div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div class="badge status-aceito" style="margin-bottom:0.5rem">${p.stores?.nome_loja || 'Loja'}</div>
                    <button class="btn btn-sm btn-secondary" style="width:auto; padding: 4px 8px; font-size: 0.75rem;" onclick="App.chat.open('${p.store_id}', null)">
                        <i class="ri-chat-1-line"></i> Dúvidas?
                    </button>
                </div>

                <h4>${p.nome}</h4>
                ${p.descricao ? `<p class="text-sm text-muted" style="margin-bottom:10px; line-height:1.4;">${p.descricao}</p>` : ''}
                <h2 style="color:var(--primary)">R$ ${p.preco.toFixed(2)}</h2>
                
                ${selectorHtml}
                
                <button class="btn ${btnColor} btn-full" style="margin-top:10px" onclick="${finalOnclick}">
                    <i class="ri-shopping-cart-2-line"></i> ${actionText}
                </button>
            </div>`;
        },

        // --- AQUI ESTÁ A CORREÇÃO DE SEGURANÇA QUE FALTAVA ---
        addToCartClothing: async (pid, sid, containerIdSize, containerIdColor) => {
            try {
                const containerSize = document.getElementById(containerIdSize);
                const selectedSize = containerSize ? containerSize.querySelector('.selected') : null;

                const containerColor = document.getElementById(containerIdColor);
                const selectedColor = containerColor ? containerColor.querySelector('.selected') : null;

                if (!selectedSize) { return alert("Por favor, selecione um TAMANHO."); }

                let corEscolhida = "";
                if (containerColor && containerColor.innerHTML.trim() !== "") {
                    if (!selectedColor) { return alert("Por favor, selecione uma COR."); }
                    corEscolhida = selectedColor.innerText;
                }

                const tamanho = selectedSize.innerText;

                // Busca o produto atualizado no banco para garantir dados
                const { data: p } = await _sb.from('products').select('*').eq('id', pid).single();

                if (!p) throw new Error("Produto não encontrado.");

                const nomeFinal = `${p.nome} (Tam: ${tamanho}${corEscolhida ? ', Cor: ' + corEscolhida : ''})`;

                const prodToAdd = { ...p, nome: nomeFinal };
                App.cart.add(prodToAdd, sid);

            } catch (err) {
                console.error("Erro ao adicionar roupa:", err);
                alert("Erro ao adicionar ao carrinho. Tente recarregar a página.");
            }
        },

        fetchPublic: async () => { App.catalog.load(); }
    },

    // =============================================================================
    // 🛵 MÓDULO PRESTADOR / ENTREGADOR
    // =============================================================================
    provider: {
        init: async () => {
            const myId = App.state.user.id;
            const { data: job } = await _sb.from('orders').select('*, products(nome, categoria), profiles:cliente_id(nome_completo, whatsapp)').or(`status.eq.aguardando_prestador,status.eq.em_rota`).order('created_at', { ascending: false });
            const container = document.getElementById('provider-jobs-list');
            let html = '';
            if (job && job.length > 0) {
                for (let j of job) {
                    const { data: store, error: storeError } = await _sb.from('stores').select('parceiro_exclusivo_id').eq('id', j.store_id).maybeSingle();
                    if (storeError) continue;
                    const isExclusive = (store && store.parceiro_exclusivo_id === myId);
                    if (store && store.parceiro_exclusivo_id && !isExclusive) continue;
                    let actionBtn = '';
                    const safeAddr = encodeURIComponent(j.endereco_destino || '');
                    if (j.status === 'aguardando_prestador') {
                        actionBtn = `<button class="btn btn-success btn-sm btn-full" onclick="App.provider.acceptJob('${j.id}')">Aceitar Corrida/Serviço</button>`;
                    } else if (j.status === 'em_rota' && j.prestador_id === myId) {
                        actionBtn = `<button class="btn btn-info btn-sm btn-full" onclick="App.map.open('${j.id}', true, decodeURIComponent('${safeAddr}'))">Continuar Rota</button>`;
                    }
                    let earningsHtml = isExclusive ? `<div style="font-size:0.8rem; color:var(--info-dark); margin-bottom:5px;"><i class="ri-briefcase-line"></i> Entrega da Loja (Fixo/Salário)</div>` : `<div style="font-weight:bold; color:var(--success-dark); margin-bottom:5px;">Ganho: R$ ${(j.taxa_servico || 0).toFixed(2)}</div>`;
                    let clientWppHtml = '';
                    if (j.profiles?.whatsapp) { clientWppHtml = `<a href="https://wa.me/55${j.profiles.whatsapp.replace(/\D/g, '')}" target="_blank" class="btn btn-sm btn-secondary" style="margin-top:5px; text-decoration:none; display:inline-flex;"><i class="ri-whatsapp-line"></i> Falar com Cliente</a>`; }
                    if (actionBtn) {
                        html += `<div class="card" style="margin-bottom:1rem"><div style="display:flex; justify-content:space-between"><strong>${j.products?.nome || 'Serviço'}</strong><span class="badge status-${j.status}">${j.status}</span></div><p class="text-sm">Destino: ${j.endereco_destino}</p>${earningsHtml}${clientWppHtml}<div style="margin-top:10px;">${actionBtn}</div></div>`;
                    }
                }
            }
            container.innerHTML = html || '<div style="text-align:center; padding:20px; color:#aaa;">Nenhum serviço disponível no momento.</div>';
            if (document.getElementById('provider-role-label')) { document.getElementById('provider-role-label').innerText = App.state.profile.role ? App.state.profile.role.toUpperCase() : 'PARCEIRO'; }
            if (document.getElementById('provider-pix-display')) { document.getElementById('provider-pix-display').innerText = App.state.profile.chave_pix || 'Não cadastrada'; }
        },
        updatePix: async () => { const pix = prompt("Informe sua chave Pix para recebimento:"); if (pix) { await _sb.from('profiles').update({ chave_pix: pix }).eq('id', App.state.user.id); App.state.profile.chave_pix = pix; App.provider.init(); App.utils.toast("Pix atualizado!", "success"); } },
        acceptJob: async (id) => {
            await _sb.from('orders').update({ status: 'em_rota', prestador_id: App.state.user.id }).eq('id', id);
            App.utils.toast("Aceito! Iniciando navegação...", "success");
            const { data } = await _sb.from('orders').select('endereco_destino').eq('id', id).single();
            if (App.map) { App.map.open(id, true, data.endereco_destino); } else { alert("Módulo de mapa não encontrado."); }
            App.provider.init();
        }
    },

    // =============================================================================
    // 🗺️ MÓDULO MAPA
    // =============================================================================
    map: {
        open: (orderId, isDriver, address) => {
            App.state.activeOrder = orderId;
            const modal = document.getElementById('map-modal');
            modal.style.display = 'flex';
            document.getElementById('map-dest-address').innerText = address;
            if (App.state.mapInstance) { App.state.mapInstance.remove(); App.state.mapInstance = null; }
            App.state.mapInstance = L.map('map').setView([-23.5505, -46.6333], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(App.state.mapInstance);
            setTimeout(() => { App.state.mapInstance.invalidateSize(); }, 500);
            if (isDriver) { document.getElementById('btn-start-gps').style.display = 'block'; document.getElementById('btn-end-gps').style.display = 'block'; }
            else { document.getElementById('btn-start-gps').style.display = 'none'; document.getElementById('btn-end-gps').style.display = 'none'; }
        },
        close: () => {
            document.getElementById('map-modal').style.display = 'none';
            if (App.state.mapInstance) { App.state.mapInstance.remove(); App.state.mapInstance = null; }
        },
        startGPS: () => {
            const dest = document.getElementById('map-dest-address').innerText;
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`, '_blank');
        },
        finishDelivery: async () => {
            if (confirm("Confirmar que a entrega foi realizada?")) {
                const oid = App.state.activeOrder;
                if (!oid) return alert("Erro: Pedido não identificado.");
                const { error } = await _sb.from('orders').update({ status: 'concluido' }).eq('id', oid);
                if (error) alert("Erro: " + error.message);
                else {
                    document.getElementById('map-modal').style.display = 'none';
                    App.utils.toast("Entrega Finalizada!", "success");
                    if (App.provider && App.provider.init) App.provider.init();
                }
            }
        }
    },

    // =============================================================================
    // 🚚 MÓDULO LOGÍSTICA (FRETE)
    // =============================================================================
    logistics: {
        // 1. Consulta CEP
        consultarCep: async (cep) => {
            if (!cep) return { erro: true };
            const cleanCep = cep.replace(/\D/g, '');
            if (cleanCep.length !== 8) return { erro: true };
            try {
                const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
                if (!res.ok) throw new Error("CEP não encontrado");
                return await res.json();
            } catch (e) { console.error("Erro CEP:", e); return { erro: true }; }
        },

        // 2. Cálculo de Frete
        calcularFrete: async (cepDestino) => {
            const storeSettings = App.cart && App.cart.storeSettings ? App.cart.storeSettings : {};
            const dadosDestino = await App.logistics.consultarCep(cepDestino);
            if (dadosDestino.erro) return { erro: true, msg: "CEP Inválido" };

            let lojaId = App.state.storeId;
            if (!lojaId && App.state.cart.length > 0) lojaId = App.state.cart[0].storeId;
            if (!lojaId) return { erro: true, msg: "Loja não identificada" };

            const { data: regras } = await _sb.from('delivery_zones').select('*')
                .eq('store_id', lojaId).eq('uf', dadosDestino.state).eq('cidade', dadosDestino.city);

            let taxaFinal = null;
            let metodo = "Entrega Própria";

            if (regras && regras.length > 0) {
                const regraBairro = regras.find(r => r.bairro && r.bairro.toLowerCase() === dadosDestino.neighborhood?.toLowerCase());
                const regraCidade = regras.find(r => !r.bairro);
                if (regraBairro) { taxaFinal = parseFloat(regraBairro.taxa); metodo += ` (${dadosDestino.neighborhood})`; }
                else if (regraCidade) { taxaFinal = parseFloat(regraCidade.taxa); metodo += ` (${dadosDestino.city})`; }
            }

            if (taxaFinal === null) taxaFinal = parseFloat(storeSettings.taxa_entrega_padrao || 0);

            return {
                local: { preco: taxaFinal.toFixed(2), prazo: '1 dia', metodo: metodo },
                sedex: { preco: (taxaFinal * 1.5 + 20).toFixed(2), prazo: '3' },
                pac: { preco: (taxaFinal * 1.2 + 15).toFixed(2), prazo: '7' }
            };
        },

        // 3. Modal de Configuração
        openConfigModal: async () => {
            const old = document.getElementById('delivery-zone-modal'); if (old) old.remove();
            const modalHtml = `<div id="delivery-zone-modal" class="modal-overlay" style="display:flex; z-index:10000"><div class="modal-content"><div class="modal-header"><h3>📍 Taxas por Região</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('delivery-zone-modal').remove()">Fechar</button></div><div class="modal-body"><div style="background:#f0f9ff; padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid #bae6fd;"><h5 style="color:#0284c7">Nova Região</h5><div style="display:flex; gap:5px;"><select id="zone-uf" class="input-field" style="width:80px"><option value="CE">CE</option><option value="SP">SP</option><option value="RJ">RJ</option><option value="MG">MG</option><option value="BA">BA</option><option value="RS">RS</option></select><input id="zone-city" class="input-field" placeholder="Cidade"></div><div style="display:flex; gap:5px; margin-top:5px;"><input id="zone-dist" class="input-field" placeholder="Bairro (Opcional)"><input id="zone-price" type="number" class="input-field" placeholder="Taxa R$"></div><button class="btn btn-success btn-full" style="margin-top:10px;" onclick="App.logistics.addZone()">Salvar Regra</button></div><div id="zone-list" style="max-height:200px; overflow-y:auto; border-top:1px solid #eee;"><p class="text-muted" style="padding:10px;">Carregando...</p></div></div></div></div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            App.logistics.loadZones();
        },

        // 4. Adicionar Zona
        addZone: async () => {
            const uf = document.getElementById('zone-uf').value;
            const city = document.getElementById('zone-city').value.trim();
            const dist = document.getElementById('zone-dist').value.trim();
            const price = document.getElementById('zone-price').value;
            if (!city || !price) return alert("Preencha a Cidade e o Preço.");
            const { error } = await _sb.from('delivery_zones').insert({ store_id: App.state.storeId, uf: uf, cidade: city, bairro: dist || null, taxa: parseFloat(price) });
            if (error) alert("Erro: " + error.message);
            else { App.utils.toast("Salvo!", "success"); App.logistics.loadZones(); }
        },

        // 5. Carregar Zonas
        loadZones: async () => {
            const { data } = await _sb.from('delivery_zones').select('*').eq('store_id', App.state.storeId).order('cidade', { ascending: true });
            const list = document.getElementById('zone-list');
            if (!data || data.length === 0) list.innerHTML = '<p class="text-xs text-muted" style="padding:10px;">Nenhuma regra. Usa taxa padrão.</p>';
            else list.innerHTML = data.map(z => `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:10px;"><div><strong>${z.cidade}</strong> <small>(${z.uf})</small><br><span class="text-xs text-muted">${z.bairro ? '📍 ' + z.bairro : '🌍 Toda a cidade'}</span></div><div style="text-align:right"><strong style="color:var(--primary)">R$ ${parseFloat(z.taxa).toFixed(2)}</strong><br><span style="color:red; cursor:pointer; font-size:0.75rem;" onclick="App.logistics.deleteZone('${z.id}')">Excluir</span></div></div>`).join('');
        },

        // 6. Deletar Zona (CORRIGIDO AQUI - ESTAVA QUEBRANDO O ARQUIVO ANTES)
        deleteZone: async (id) => {
            if (confirm("Apagar regra?")) {
                await _sb.from('delivery_zones').delete().eq('id', id);
                App.logistics.loadZones();
            }
        }, // <--- Vírgula importante!

        // 7. Lidar com CEP Único (Bairro Null)
        handleUniqueCep: async (city, state) => {
            const storeId = App.state.cart[0]?.storeId || App.state.storeId;
            const { data: distritos } = await _sb.from('delivery_zones').select('id, bairro, taxa').eq('store_id', storeId).eq('cidade', city).eq('uf', state).neq('bairro', null);
            const selectorArea = document.getElementById('district-selector-area');
            const select = document.getElementById('cart-district-select');
            if (distritos && distritos.length > 0) {
                selectorArea.style.display = 'block';
                select.innerHTML = '<option value="">Selecione seu bairro...</option>';
                distritos.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify({ taxa: d.taxa, nome: d.bairro });
                    opt.innerText = `${d.bairro} (+ R$ ${parseFloat(d.taxa).toFixed(2)})`;
                    select.appendChild(opt);
                });
                App.utils.toast(`Por favor, selecione seu bairro em ${city}.`, "warning");
                return true;
            }
            selectorArea.style.display = 'none';
            return false;
        },

        // 8. Aplicar Taxa do Distrito
        applyDistrictFee: (selectElement) => {
            if (!selectElement.value) return;
            const data = JSON.parse(selectElement.value);
            App.cart.setFreight(data.taxa, `Entrega Local (${data.nome})`);
            App.utils.toast(`Taxa de ${data.nome} aplicada!`, "success");
        }
    } // <--- Fim do Logistics

}); // <--- Fim do Object.assign

// =============================================================================
// ⚙️ MODAL DE CONFIGURAÇÕES (NOVO)
// =============================================================================
App.store.openSettingsModal = async () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display: flex; z-index: 10005; align-items: center; justify-content: center;';

    const renderSection = (title, icon, contentHtml, open = false) => `
        <div class="settings-section" style="border: 1px solid var(--border); border-radius: 8px; margin-bottom: 10px; overflow: hidden; background: var(--surface);">
            <div class="settings-header" onclick="const content = this.nextElementSibling; content.style.display = content.style.display === 'none' ? 'block' : 'none'; const icon = this.querySelector('.arrow-icon'); icon.style.transform = content.style.display === 'block' ? 'rotate(180deg)' : 'rotate(0deg)';" 
                 style="padding: 12px; background: var(--background); cursor: pointer; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border);">
                <h4 style="margin: 0; font-size: 1rem; color: var(--text-color); display:flex; align-items:center; gap:8px;"><i class="${icon}"></i> ${title}</h4>
                <i class="ri-arrow-down-s-line arrow-icon" style="transition: transform 0.3s; transform: ${open ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
            </div>
            <div class="settings-content" style="padding: 15px; display: ${open ? 'block' : 'none'}; border-top: 1px solid var(--border);">
                ${contentHtml}
            </div>
        </div>
    `;

    // 1. Recebimento Automático
    const htmlRecebimento = `
        <div id="store-keys-area" style="display: ${App.state.currentStore?.mp_access_token ? 'none' : 'block'};">
            <p class="text-sm" style="color: var(--text-muted); margin-bottom: 10px;">Cole suas chaves de Produção do Mercado Pago.</p>
            <div class="input-wrapper"><label class="text-xs">Public Key</label><input type="text" id="store-public-key" class="input-field" value="${App.state.currentStore?.mp_public_key || ''}"></div>
            <div class="input-wrapper"><label class="text-xs">Access Token</label><input type="password" id="store-access-token" class="input-field" value="${App.state.currentStore?.mp_access_token || ''}"></div>
            <button class="btn btn-success btn-sm btn-full" onclick="App.store.saveCredentials()">Salvar e Ativar</button>
        </div>
        <div id="store-keys-locked" style="display: ${App.state.currentStore?.mp_access_token ? 'block' : 'none'}; text-align: center; padding: 20px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success); border-radius: 8px;">
            <i class="ri-shield-check-line" style="font-size:3rem; color: var(--success);"></i><br>
            <strong style="color: var(--success); font-size: 1.2rem;">Pagamentos Ativos</strong><br>
            <p class="text-xs" style="color: var(--text-muted); margin: 10px 0;">O sistema está pronto para receber Pix e Cartão.</p>
            <button id="btn-reset-keys" class="btn btn-secondary btn-sm" style="margin-top:10px; width:auto;" onclick="App.store.resetKeys()">Redefinir Chaves</button>
        </div>
    `;

    // 2. Configuração de Entrega
    const htmlEntrega = `
        <div class="input-wrapper">
            <label class="text-xs">Endereço de Retirada (Balcão)</label>
            <input type="text" id="store-pickup-address" class="input-field" placeholder="Ex: Rua das Flores, 123" value="${App.state.currentStore?.endereco_retirada || ''}">
        </div>
        <button class="btn btn-sm btn-info btn-full" style="margin-top: 10px; margin-bottom: 15px;" onclick="App.logistics.openConfigModal()">
            <i class="ri-map-2-line"></i> Configurar Taxas por Região (Bairros)
        </button>
        <div style="display: flex; gap: 10px;">
            <div class="input-wrapper" style="flex:1;">
                <label class="text-xs">Taxa Local (Motoboy)</label>
                <input type="number" id="store-delivery-fee" class="input-field" placeholder="0.00" value="${App.state.currentStore?.taxa_entrega_padrao || ''}">
            </div>
            <div class="input-wrapper" style="flex:1;">
                <label class="text-xs">CEP de Origem (Loja)</label>
                <input type="text" id="store-cep-origem" class="input-field" placeholder="00000-000" value="${App.state.currentStore?.cep_origem || ''}">
            </div>
        </div>
        <button class="btn btn-sm" style="background:#8b5cf6; color:white; width: 100%; margin-top: 10px;" onclick="App.store.saveLogistics()">
            <i class="ri-save-line"></i> Salvar Logística
        </button>
    `;

    // 3. Parceiro & Chat & Notas
    const htmlAdmin = `
        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">
            <label style="font-weight: bold; margin-bottom: 5px; display: block; font-size: 0.9rem;">Parceiro Exclusivo (Motoboy)</label>
            <div style="display:flex; gap:10px; margin-bottom:10px;">
                <input id="partner-email-input" class="input-field" placeholder="Email do motorista">
                <button class="btn btn-info btn-sm" style="width:auto;" onclick="App.store.linkPartner()">Vincular</button>
            </div>
            <div id="active-partner-display" style="font-weight:bold; color:var(--info); font-size:0.8rem;">
                ${App.state.currentStore?.parceiro_exclusivo_id ? 'Verificando...' : 'Nenhum parceiro vinculado'}
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <button class="btn btn-secondary" onclick="alert('Funcionalidade de Chat Simplificado em breve!')">
                <i class="ri-chat-history-line"></i> Abrir Chat
            </button>
            <button class="btn btn-warning" style="color: #fff;" onclick="App.store.showNotasNaoEmitidasModal()">
                <i class="ri-file-warning-line"></i> Notas Pendentes
            </button>
        </div>
    `;

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; width: 95%; max-height: 90vh; overflow-y: auto; background: var(--surface); color: var(--text-color); border: 1px solid var(--border);">
            <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; margin-bottom: 15px; border-bottom: 1px solid var(--border);">
                <h3 style="margin:0;"><i class="ri-settings-4-line"></i> Configurações da Loja</h3>
                <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
            </div>
            <div class="modal-body">
                ${renderSection('Recebimento Automático (Pix/Cartão)', 'ri-bank-card-line', htmlRecebimento, true)}
                ${renderSection('Logística de Entrega', 'ri-truck-line', htmlEntrega)}
                ${renderSection('Parceiros & Atendimento', 'ri-team-line', htmlAdmin)}
                ${renderSection('Canal de Clientes (Chat)', 'ri-chat-smile-2-line', '<div id="store-chat-list" style="max-height: 300px; overflow-y: auto; background: var(--background); padding: 10px; border-radius: 8px;"><p class="text-sm text-muted">Carregando conversas...</p></div>')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Carrega parceiro se existir
    if (App.state.currentStore?.parceiro_exclusivo_id) {
        const { data: p } = await _sb.from('profiles').select('nome_completo').eq('id', App.state.currentStore.parceiro_exclusivo_id).maybeSingle();
        if (p && document.getElementById('active-partner-display')) document.getElementById('active-partner-display').innerText = `Parceiro: ${p.nome_completo}`;
    }
};

App.store.showNotasNaoEmitidasModal = async () => {
    const { data: notas } = await _sb.from('orders')
        .select('*')
        .eq('store_id', App.state.storeId)
        .eq('status', 'concluido')
        .is('xml_arquivo', null)
        .order('created_at', { ascending: false })
        .limit(10);

    if (!notas || notas.length === 0) return NaxioUI.alert('Tudo Certo', 'Nenhuma nota pendente de emissão.', 'success');

    const lista = notas.map(n => {
        // 🔥 BUG FIX: Reconstrói os pagamentos reais lendo o campo payments_info
        // ou o campo observacao (onde as comandas guardam os pagamentos detalhados).
        // ANTES: passava [] fixo, causando emissão incorreta como "Dinheiro".
        let paymentsReais = [];

        // Tenta 1: campo payments_info (JSON direto)
        if (n.payments_info) {
            try {
                const pi = typeof n.payments_info === 'string' ? JSON.parse(n.payments_info) : n.payments_info;
                if (Array.isArray(pi)) paymentsReais = pi;
                else if (pi.pagamentos) paymentsReais = pi.pagamentos;
            } catch (e) { }
        }

        // Tenta 2: campo observacao (PDV e Comandas guardam aqui)
        if (paymentsReais.length === 0 && n.observacao) {
            try {
                const obs = typeof n.observacao === 'string' ? JSON.parse(n.observacao) : n.observacao;
                if (obs.pagamentos && Array.isArray(obs.pagamentos)) {
                    paymentsReais = obs.pagamentos;
                }
            } catch (e) { }
        }

        // Tenta 3: usa metodo_pagamento como fallback de último recurso
        if (paymentsReais.length === 0 && n.metodo_pagamento) {
            paymentsReais = [{ tipo: n.metodo_pagamento, valor: n.total_pago }];
        }

        // Exibe o método encontrado para auditoria visual
        const metodosLabel = paymentsReais.length > 0
            ? paymentsReais.map(p => `${p.tipo || p.metodo || '-'}: R$ ${parseFloat(p.valor || p.amount || 0).toFixed(2)}`).join(' + ')
            : (n.metodo_pagamento || 'Não identificado');

        // Serializa safe para colocar no onclick
        const paymentsJson = JSON.stringify(paymentsReais).replace(/"/g, '&quot;');
        const itemsJson = '[]'; // Itens serão buscados pela API pelo order_id

        return `
           <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; border-bottom: 1px solid var(--border);">
               <div>
                   <strong>Pedido #${n.id.slice(0, 6)}</strong> - R$ ${parseFloat(n.total_pago).toFixed(2)}<br>
                   <small class="text-muted">${new Date(n.created_at).toLocaleString()}</small><br>
                   <small style="color:${paymentsReais.length > 0 ? '#10b981' : '#f59e0b'};">
                       💳 ${metodosLabel}
                   </small>
               </div>
               <div style="display:flex; gap:6px; flex-shrink:0;">
                   <button class="btn btn-sm btn-warning" style="font-size:0.75rem; padding: 6px 10px; color:#fff;"
                       onclick="App.fiscal.emitirNFCe('${n.id}', ${n.total_pago}, JSON.parse('${paymentsJson}'), ${itemsJson}); this.closest('[style*=border-bottom]').remove();">
                       NFC-e
                   </button>
                   <button class="btn btn-sm btn-success" style="font-size:0.75rem; padding: 6px 10px; background-color:#f59e0b; border:none; color:#fff;"
                       onclick="App.fiscal.emitirNFe('${n.id}', ${n.total_pago}, JSON.parse('${paymentsJson}'), ${itemsJson}); this.closest('[style*=border-bottom]').remove();">
                       NF-e
                   </button>
               </div>
           </div>
        `;
    }).join('');

    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.style.cssText = 'display:flex; z-index:10010; align-items:center; justify-content:center;';
    m.innerHTML = `<div class="modal-content" style="background:var(--surface); width:90%; max-width:460px; color:var(--text-color); border:1px solid var(--border);">
           <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px; border-bottom:1px solid var(--border);">
               <h3 style="margin:0;">Notas Pendentes</h3>
               <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">X</button>
           </div>
           <div class="modal-body" style="background:var(--surface); max-height:60vh; overflow-y:auto;">
               <p style="font-size:0.8rem; color:#94a3b8; padding:8px; margin:0;">O método de pagamento será usado exatamente como foi registrado na venda.</p>
               ${lista}
           </div>
       </div>`;
    document.body.appendChild(m);
};


// Init Logic para Chat no Modal
const originalOpenSettings = App.store.openSettingsModal;
App.store.openSettingsModal = async () => {
    await originalOpenSettings();
    if (App.store.listenMessages) {
        setTimeout(() => App.store.listenMessages(), 200);
    }
};

// CSS para escurecer Comandas e Mesas
if (!document.getElementById('dark-comandas-style')) {
    const styleComandas = document.createElement('style');
    styleComandas.id = 'dark-comandas-style';
    styleComandas.innerHTML = `
        .comanda-card { background-color: #1e293b !important; border: 1px solid #334155 !important; color: #f1f5f9 !important; }
        .comanda-card strong { color: #f8fafc !important; }
        .comanda-card .text-muted { color: #94a3b8 !important; }
        .comanda-card:hover { border-color: #3b82f6 !important; }
        .mesa-card { background-color: #0f172a !important; border: 1px solid #1e293b !important; color: #f8fafc !important; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        .mesa-card h3 { color: #f8fafc !important; }
        .type-card { background-color: #1e293b; color: #cbd5e1; border-color: #334155; }
        .type-card.active { background-color: #064e3b !important; border-color: #059669 !important; color: #34d399 !important; }
    `;
    document.head.appendChild(styleComandas);
}

// Função para abrir Modal de Lote (Restaurada a pedido do usuário)
App.store.openLoteModal = async () => {
    if (typeof Caixa === 'undefined' || !Caixa.state?.session) {
        return NaxioUI.alert('Atenção', 'Você precisa ABRIR O CAIXA antes de abrir comandas em lote.', 'warning');
    }
    // Carrega guias
    let guiasOptions = '';
    if (typeof _sb !== 'undefined') {
        const { data: guias } = await _sb.from('guides').select('id, name').eq('store_id', App.state.storeId).eq('status', 'ativo').order('name');
        guiasOptions = guias ? guias.map(g => `<option value="${g.id}">${g.name}</option>`).join('') : '';
    }

    const modalHtml = `
        <div id="modal-lote-mesas" class="modal-overlay" style="display:flex; z-index:10020; align-items:center; justify-content:center;">
            <div class="modal-content" style="max-width:350px; width:90%; background:var(--surface); color:var(--text-color); border:1px solid var(--border);">
                <div class="modal-header" style="border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">🚀 Abrir Mesas em Lote</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <p class="text-xs text-muted" style="margin-bottom:10px;">Abra múltiplas mesas de uma vez.</p>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <input type="number" id="lote-inicio" class="input-field" placeholder="De (Ex: 1)">
                        <input type="number" id="lote-fim" class="input-field" placeholder="Até (Ex: 10)">
                    </div>
                    
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <label onclick="this.querySelector('input').click(); this.closest('.modal-body').querySelectorAll('.type-card').forEach(c=>c.classList.remove('active')); this.querySelector('.type-card').classList.add('active');" style="flex:1; cursor:pointer;">
                            <input type="radio" name="quick-tipo" value="passante" checked hidden>
                            <div class="type-card active" style="padding:10px; border:1px solid var(--border); text-align:center; border-radius:6px;">Passante</div>
                        </label>
                        <label onclick="this.querySelector('input').click(); this.closest('.modal-body').querySelectorAll('.type-card').forEach(c=>c.classList.remove('active')); this.querySelector('.type-card').classList.add('active');" style="flex:1; cursor:pointer;">
                            <input type="radio" name="quick-tipo" value="interna" hidden>
                            <div class="type-card" style="padding:10px; border:1px solid var(--border); text-align:center; border-radius:6px;">🏠 Interna</div>
                        </label>
                    </div>

                    <select id="lote-guia" class="input-field" style="margin-bottom:15px;">
                        <option value="">👤 Guia (Opcional)</option>
                        ${guiasOptions}
                    </select>

                    <button class="btn btn-success btn-full" onclick="App.store.abrirLote()">✅ Confirmar Abertura</button>
                </div>
            </div>
        </div>
    `;

    // Remove anterior se existir
    const old = document.getElementById('modal-lote-mesas');
    if (old) old.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Verifica visibilidade do botão Lote periodicamente
setInterval(() => {
    const btnComandas = document.getElementById('btn-comandas-mesas-restaurante');
    const btnLote = document.getElementById('btn-lote-mesas-restaurante');
    if (btnComandas && btnLote) {
        btnLote.style.display = btnComandas.style.display !== 'none' ? 'inline-flex' : 'none';
    }
}, 10000);


// Função de LANÇAR PRODUTO EM LOTE (Ajustada)
App.store.openLancarProdutoLoteModal = async () => {
    if (typeof Caixa === 'undefined' || !Caixa.state?.session) {
        return NaxioUI.alert('Atenção', 'Você precisa ABRIR O CAIXA antes de lançar produtos em lote.', 'warning');
    }
    const modalHtml = `
        <div id="modal-lote-produtos" class="modal-overlay" style="display:flex; z-index:10020; align-items:center; justify-content:center;">
            <div class="modal-content" style="max-width:400px; width:90%; background:var(--surface); color:var(--text-color); border:1px solid var(--border);">
                <div class="modal-header" style="border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;"><i class="ri-rocket-2-line"></i> Lançar Produto em Lote</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div style="background:rgba(59, 130, 246, 0.1); padding:10px; border-radius:6px; margin-bottom:15px; border:1px solid var(--info);">
                        <p class="text-xs" style="color:var(--info); margin:0;">Isso adicionará o produto em <strong>TODAS as mesas LIVRES e OCUPADAS</strong> no intervalo informado.</p>
                    </div>

                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <div style="flex:1;">
                            <label class="text-xs">Mesa Inicial</label>
                            <input type="number" id="lote-prod-inicio" class="input-field" placeholder="Ex: 1">
                        </div>
                        <div style="flex:1;">
                            <label class="text-xs">Mesa Final</label>
                            <input type="number" id="lote-prod-fim" class="input-field" placeholder="Ex: 50">
                        </div>
                    </div>

                    <div class="input-wrapper" style="position:relative;">
                        <label class="text-xs">Buscar Produto</label>
                        <input type="text" id="lote-prod-busca" class="input-field" placeholder="Digite o nome..." oninput="App.store.filtrarProdutosLote(this.value)">
                        <div id="lote-result-lista" style="max-height:150px; overflow-y:auto; background:var(--surface); border:1px solid var(--border); display:none; position:absolute; width:100%; z-index:100; box-shadow:0 4px 6px rgba(0,0,0,0.3);"></div>
                    </div>

                    <div id="lote-prod-selecionado" style="display:none; background:var(--background); padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid var(--primary);">
                        <strong id="lote-sel-nome" style="color:var(--text-color);"></strong>
                        <div class="text-xs text-muted">Preço: R$ <span id="lote-sel-preco"></span></div>
                        <input type="hidden" id="lote-sel-id">
                        <input type="hidden" id="lote-sel-ncm">
                    </div>

                    <div style="display:flex; gap:10px;">
                         <div style="flex:1;"><label class="text-xs">Qtd</label><input type="number" id="lote-qtd" class="input-field" value="1"></div>
                         <div style="flex:2;"><label class="text-xs">Obs</label><input type="text" id="lote-obs" class="input-field" placeholder="Ex: Gelada"></div>
                    </div>

                    <button class="btn btn-success btn-full" style="margin-top:15px;" onclick="App.store.confirmarLancamentoLote()">🚀 LANÇAR EM MASSA</button>
                    
                    <div style="margin-top:15px; text-align:center;">
                         <button class="btn btn-outline btn-sm btn-full" onclick="App.store.openLoteModal()">Precisa ABRIR mesas em lote?</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Limpeza de modais anteriores
    const old = document.getElementById('modal-lote-produtos');
    if (old) old.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setTimeout(() => document.getElementById('lote-prod-inicio').focus(), 100);

    // Garante cache
    if (!window.produtosCache || window.produtosCache.length === 0) {
        if (App.store.garantirCacheProdutos) await App.store.garantirCacheProdutos();
        else {
            const { data } = await _sb.from('products').select('id, nome, preco, ncm').eq('store_id', App.state.storeId);
            window.produtosCache = data || [];
        }
    }
};

App.store.filtrarProdutosLote = (termo) => {
    const lista = document.getElementById('lote-result-lista');
    if (!termo || termo.length < 2) { lista.style.display = 'none'; return; }

    const matches = (window.produtosCache || []).filter(p => (p.nome || '').toLowerCase().includes(termo.toLowerCase())).slice(0, 8);

    lista.innerHTML = matches.map(p => `
        <div onclick="App.store.selecionarProdLote('${p.id}', '${p.nome}', ${p.preco}, '${p.ncm || ''}')" 
             style="padding:8px; border-bottom:1px solid var(--border); cursor:pointer; background:var(--background);">
             ${p.nome} - R$ ${p.preco.toFixed(2)}
        </div>
    `).join('');
    lista.style.display = 'block';
};

App.store.selecionarProdLote = (id, nome, preco, ncm) => {
    document.getElementById('lote-sel-id').value = id;
    document.getElementById('lote-sel-nome').innerText = nome;
    document.getElementById('lote-sel-preco').innerText = parseFloat(preco).toFixed(2);
    document.getElementById('lote-sel-ncm').value = ncm;
    document.getElementById('lote-prod-selecionado').style.display = 'block';
    document.getElementById('lote-result-lista').style.display = 'none';
    document.getElementById('lote-prod-busca').value = '';
    document.getElementById('lote-qtd').focus();
};

App.store.confirmarLancamentoLote = async () => {
    if (App.state._isLaunchingBatch) return;
    App.state._isLaunchingBatch = true;
    
    if (window.NaxioUI) NaxioUI.showLoading("🚀 Lançando produtos em lote...");

    const inicio = parseInt(document.getElementById('lote-prod-inicio').value);
    const fim = parseInt(document.getElementById('lote-prod-fim').value);
    const prodId = document.getElementById('lote-sel-id').value;
    const prodNome = document.getElementById('lote-sel-nome').innerText;
    const prodPreco = parseFloat(document.getElementById('lote-sel-preco').innerText);
    const qtd = parseInt(document.getElementById('lote-qtd').value) || 1;
    const obs = document.getElementById('lote-obs').value;
    const ncm = document.getElementById('lote-sel-ncm').value;

    if (!inicio || !fim || !prodId) {
        alert("Preencha mesa inicial, final e selecione um produto.");
        return;
    }

    if (!confirm(`⚠️ ATENÇÃO: Confirma lançar ${qtd}x ${prodNome}\n\nDA MESA ${inicio} ATÉ A MESA ${fim}?\n\n(Mesas LIVRES e OCUPADAS serão afetadas)`)) return;

    App.utils.toast("Processando lançamento em lote...", "info");

    // Busca comandas no range
    const { data: comandas, error } = await _sb.from('comandas')
        .select('id, numero, items')
        .eq('store_id', App.state.storeId)
        .gte('numero', inicio)
        .lte('numero', fim)
        .in('status', ['livre', 'ocupada', 'aberta']);

    if (error || !comandas) {
        alert("Erro ao buscar comandas: " + (error?.message || 'Erro desconhecido'));
        return;
    }

    if (comandas.length === 0) {
        alert("Nenhuma mesa encontrada neste intervalo (Números " + inicio + " a " + fim + ").");
        return;
    }

    // Prepara item
    const novoItem = {
        id: prodId,
        product_id: prodId,
        nome: prodNome,
        price: prodPreco,
        qtd: qtd,
        ncm: ncm || '21069090',
        observacao: obs,
        garcom: App.state.user?.email || 'Sistema',
        data_lancamento: new Date().toISOString()
    };

    let atualizados = 0;
    try {
        for (const comanda of comandas) {
            const items = comanda.items || [];
            
            // 🛡️ PROTEÇÃO CONTRA DUPLICIDADE
            const jaExiste = items.some(it => it.data_lancamento === novoItem.data_lancamento);
            if (jaExiste) continue;

            items.push(novoItem);
            // Atualiza Supabase
            await _sb.from('comandas').update({ items, status: 'ocupada', updated_at: new Date().toISOString() }).eq('id', comanda.id);
            atualizados++;
        }
    } finally {
        App.state._isLaunchingBatch = false;
        if (window.NaxioUI) NaxioUI.hideLoading();
    }

    App.utils.toast(`Sucesso! Item adicionado em ${atualizados} mesas.`, "success");
    document.getElementById('modal-lote-produtos').remove();
    if (App.store.loadComandas) App.store.loadComandas();
};





// =============================================================================
// 🧠 OTIMIZAÇÃO DE DASHBOARD (Segmentação Lógica)
// =============================================================================
App.store.optimizeDashboard = () => {
    const type = App.state.storeType;
    if (!type) return;

    // Elementos
    const btnMesas = document.getElementById('btn-comandas-mesas-restaurante');
    const btnLote = document.getElementById('btn-lote-mesas-restaurante');
    const btnGuias = document.getElementById('btn-guias-restaurante');
    const btnConsulta = document.getElementById('btn-consulta-produto');

    if (type === 'restaurante') {
        if (btnMesas) btnMesas.style.display = 'inline-flex';
        // Lote button logic já existe no setInterval anterior, mas garantindo:
        if (btnLote && btnMesas && btnMesas.style.display !== 'none') btnLote.style.display = 'inline-flex';
        if (btnGuias) btnGuias.style.display = 'inline-flex';
        if (btnConsulta) btnConsulta.style.display = 'none'; // Restaurante não costuma consultar peça
    } else if (type === 'autopecas') {
        if (btnMesas) btnMesas.style.display = 'none';
        if (btnLote) btnLote.style.display = 'none';
        if (btnGuias) btnGuias.style.display = 'none';
        if (btnConsulta) btnConsulta.style.display = 'inline-flex';
    } else {
        // Varejo comum
        if (btnMesas) btnMesas.style.display = 'none';
        if (btnLote) btnLote.style.display = 'none'; // Garante que lote suma
        if (btnGuias) btnGuias.style.display = 'none';
    }

    // Injetar Widget de Faturamento Simples (Inovação sutil)
    const headerInfo = document.getElementById('loja-header-info');
    if (headerInfo && !document.getElementById('simple-kpi-widget')) {
        const div = document.createElement('div');
        div.id = 'simple-kpi-widget';
        div.style.cssText = 'background: rgba(16, 185, 129, 0.1); padding: 10px; border-radius: 6px; border: 1px solid #10b981; display: inline-flex; align-items: center; gap: 10px; margin-top: 10px;';
        div.innerHTML = `
            <i class="ri-money-dollar-circle-line" style="font-size: 1.5rem; color: #10b981;"></i>
            <div>
                <small style="display:block; color: #10b981; font-weight:bold;">Vendas Hoje</small>
                <span style="font-size: 1.2rem; font-weight: bold; color: #fff;">R$ ...</span>
            </div>
            <div style="margin-left: 15px; border-left: 1px solid #334155; padding-left: 15px;">
                 <small style="display:block; color: #94a3b8; font-weight:bold;">Pedidos</small>
                 <span id="kpi-pedidos-count" style="font-size: 1.1rem; color: #fff;">0</span>
            </div>
        `;
        headerInfo.appendChild(div);

        // Simulação de valor para demonstração (substituir por fetch real futuramente)
        if (typeof _sb !== 'undefined') {
            // Tenta buscar valor real
            (async () => {
                const hoje = new Date().toISOString().split('T')[0];
                const { data } = await _sb.from('orders').select('total_pago').eq('store_id', App.state.storeId).gte('created_at', hoje);
                if (data) {
                    const total = data.reduce((acc, curr) => acc + (curr.total_pago || 0), 0);
                    div.querySelector('span').innerText = `R$ ${total.toFixed(2)}`;
                    div.querySelector('#kpi-pedidos-count').innerText = data.length;
                }
            })();
        }
    }
};

// Executar otimização periodicamente
setInterval(App.store.optimizeDashboard, 15000);

// Injeta CSS Facelift (Melhorias Visuais Sutis)
(function () {
    if (!document.getElementById('facelift-css')) {
        const link = document.createElement('link');
        link.id = 'facelift-css';
        link.rel = 'stylesheet';
        link.href = 'css/facelift.css';
        document.head.appendChild(link);
    }
})();

console.log("📦 Módulos Carregados com Sucesso");
