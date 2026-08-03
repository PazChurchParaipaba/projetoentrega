// =============================================================================
// 🏢 NAXIO ENTERPRISE MODULE - Módulo Avançado de Gestão v2.0
// Funcionalidades: CRM, Estoque, Fidelidade, Onboarding, Recomendações, etc.
// =============================================================================

const NaxioEnterprise = {

    // =========================================================================
    // 📋 1. ONBOARDING CHECKLIST - Primeiros Passos para Lojistas
    // =========================================================================
    onboarding: {
        steps: [
            { id: 'store_name', label: 'Dar nome à loja', icon: 'ri-store-2-line', check: () => App.state.currentStore?.nome_loja && App.state.currentStore.nome_loja !== 'Loja Nova' },
            { id: 'store_type', label: 'Definir ramo da loja', icon: 'ri-price-tag-3-line', check: () => !!App.state.currentStore?.tipo_loja },
            { id: 'add_product', label: 'Cadastrar primeiro produto', icon: 'ri-shopping-bag-line', check: () => (App.state.myProducts?.length || 0) > 0 },
            { id: 'payment_keys', label: 'Configurar pagamento', icon: 'ri-bank-card-line', check: () => App.state.currentStore?.mp_access_token?.length > 10 },
            { id: 'delivery', label: 'Configurar entrega', icon: 'ri-truck-line', check: () => !!App.state.currentStore?.endereco_retirada },
            { id: 'first_sale', label: 'Realizar primeira venda', icon: 'ri-money-dollar-circle-line', check: async () => { const { count } = await _sb.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', App.state.storeId); return count > 0; } }
        ],

        render: async () => {
            const container = document.getElementById('onboarding-checklist');
            if (!container) return;

            let completedCount = 0;
            const results = [];

            for (const step of NaxioEnterprise.onboarding.steps) {
                try {
                    const done = await step.check();
                    if (done) completedCount++;
                    results.push({ ...step, done });
                } catch (e) {
                    results.push({ ...step, done: false });
                }
            }

            const total = results.length;
            const percent = Math.round((completedCount / total) * 100);

            // Se completou tudo, esconde
            if (percent === 100) {
                container.style.display = 'none';
                localStorage.setItem('naxio_onboarding_complete', 'true');
                return;
            }

            // Se já completou antes, não mostra
            if (localStorage.getItem('naxio_onboarding_complete') === 'true') {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            container.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h4 style="margin:0; color:var(--primary);"><i class="ri-rocket-2-line"></i> Primeiros Passos</h4>
                    <span class="text-xs text-muted">${completedCount}/${total} concluídos</span>
                </div>
                <div class="progress-bar" style="margin-bottom:15px;">
                    <div class="progress-bar-fill" style="width:${percent}%;"></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                    ${results.map(s => `
                        <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; background:${s.done ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.06)'}; border:1px solid ${s.done ? '#d1fae5' : 'var(--border)'};">
                            <i class="${s.done ? 'ri-checkbox-circle-fill' : s.icon}" style="color:${s.done ? '#10b981' : '#94a3b8'}; font-size:1.1rem;"></i>
                            <span style="font-size:0.85rem; ${s.done ? 'text-decoration:line-through; color:#94a3b8;' : 'color:var(--text);'}">${s.label}</span>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-sm btn-secondary" style="width:auto; margin-top:10px; float:right;" onclick="localStorage.setItem('naxio_onboarding_complete','true'); document.getElementById('onboarding-checklist').style.display='none';">
                    <i class="ri-close-line"></i> Dispensar
                </button>
                <div style="clear:both;"></div>
            `;
        }
    },

    // =========================================================================
    // 👥 2. CRM BÁSICO - Histórico de Compras por Cliente
    // =========================================================================
    crm: {
        openPanel: async () => {
            const storeId = App.state.storeId;
            if (!storeId) return App.utils.toast('Loja não identificada', 'error');

            // Busca pedidos com dados do cliente
            const { data: orders } = await _sb.from('orders')
                .select('id, created_at, total_pago, status, origem_venda, cliente_id, profiles!orders_cliente_id_fkey(nome_completo, email, whatsapp)')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .limit(500);

            if (!orders) return;

            // Agrupa por cliente
            const clients = {};
            orders.forEach(o => {
                const cid = o.cliente_id || 'anonymous';
                if (!clients[cid]) {
                    clients[cid] = {
                        id: cid,
                        nome: o.profiles?.nome_completo || 'Consumidor Final',
                        email: o.profiles?.email || '',
                        whatsapp: o.profiles?.whatsapp || '',
                        totalGasto: 0,
                        qtdPedidos: 0,
                        ultimaCompra: o.created_at,
                        pedidos: []
                    };
                }
                const val = parseFloat(o.total_pago) || 0;
                clients[cid].totalGasto += val;
                clients[cid].qtdPedidos++;
                clients[cid].pedidos.push(o);
            });

            // Ordena por total gasto (top clients)
            const clientList = Object.values(clients).sort((a, b) => b.totalGasto - a.totalGasto);

            const html = `
            <div id="crm-modal" class="modal-overlay" style="display:flex; z-index:2010;">
                <div class="modal-content" style="max-width:800px;">
                    <div class="modal-header" style="background:linear-gradient(135deg, #1e40af, #3b82f6);">
                        <h3 style="color:#fff;"><i class="ri-contacts-book-line"></i> CRM - Clientes</h3>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('crm-modal').remove()">Fechar</button>
                    </div>
                    <div class="modal-body">
                        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
                            <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe); padding:15px; border-radius:10px; text-align:center;">
                                <div style="font-size:2rem; font-weight:800; color:#1d4ed8;">${clientList.length}</div>
                                <div class="text-xs text-muted">Clientes Únicos</div>
                            </div>
                            <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7); padding:15px; border-radius:10px; text-align:center;">
                                <div style="font-size:2rem; font-weight:800; color:#15803d;">${orders.length}</div>
                                <div class="text-xs text-muted">Total Pedidos</div>
                            </div>
                            <div style="background:linear-gradient(135deg,#fefce8,#fef9c3); padding:15px; border-radius:10px; text-align:center;">
                                <div style="font-size:1.4rem; font-weight:800; color:#a16207;">R$ ${clientList.reduce((a, c) => a + c.totalGasto, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                <div class="text-xs text-muted">Receita Total</div>
                            </div>
                        </div>
                        <input type="text" class="input-field" placeholder="🔍 Buscar cliente..." oninput="NaxioEnterprise.crm.filterClients(this.value)" style="margin-bottom:10px;">
                        <div id="crm-client-list" style="max-height:400px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                            ${clientList.map((c, i) => `
                                <div class="crm-client-row" data-name="${(c.nome || '').toLowerCase()}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.05)'" onmouseout="this.style.background=''" onclick="NaxioEnterprise.crm.showClientDetail('${c.id}')">
                                    <div style="display:flex; align-items:center; gap:12px;">
                                        <div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,${i < 3 ? '#f59e0b,#eab308' : '#64748b,#94a3b8'}); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; font-size:0.9rem;">
                                            ${i < 3 ? ['🥇', '🥈', '🥉'][i] : (c.nome || 'C').charAt(0).toUpperCase()}</div>
                                        <div>
                                            <div style="font-weight:600;">${c.nome}</div>
                                            <div class="text-xs text-muted">${c.email || c.whatsapp || 'Sem contato'}</div>
                                        </div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="font-weight:700; color:var(--primary);">R$ ${c.totalGasto.toFixed(2)}</div>
                                        <div class="text-xs text-muted">${c.qtdPedidos} pedido(s)</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;

            // Store client data for detail view
            NaxioEnterprise.crm._clients = clients;

            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
        },

        filterClients: (term) => {
            const items = document.querySelectorAll('.crm-client-row');
            const t = term.toLowerCase();
            items.forEach(el => {
                el.style.display = el.getAttribute('data-name').includes(t) ? '' : 'none';
            });
        },

        showClientDetail: (clientId) => {
            const c = NaxioEnterprise.crm._clients[clientId];
            if (!c) return;

            const pedidosHtml = c.pedidos.slice(0, 20).map(o => {
                const dt = new Date(o.created_at).toLocaleDateString('pt-BR');
                const val = parseFloat(o.total_pago) || 0;
                const origem = o.origem_venda === 'pdv' ? '🏪 PDV' : (o.origem_venda === 'comanda' ? '🍽️ Comanda' : '🌐 Online');
                const statusColor = o.status === 'concluido' ? '#10b981' : (o.status === 'cancelado' ? '#ef4444' : '#f59e0b');
                return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:0.85rem;">
                    <div><span style="color:#64748b;">${dt}</span> · ${origem}</div>
                    <div><span style="font-weight:bold;">R$ ${val.toFixed(2)}</span> <span style="color:${statusColor}; font-size:0.75rem;">●</span></div>
                </div>`;
            }).join('');

            const avgTicket = c.qtdPedidos > 0 ? (c.totalGasto / c.qtdPedidos).toFixed(2) : '0.00';
            const lastDate = new Date(c.ultimaCompra).toLocaleDateString('pt-BR');

            const detailHtml = `
            <div id="crm-detail-modal" class="modal-overlay" style="display:flex; z-index:2020;">
                <div class="modal-content" style="max-width:550px;">
                    <div class="modal-header" style="background:linear-gradient(135deg, #0f172a, #1e293b);">
                        <h3 style="color:#fff;"><i class="ri-user-heart-line"></i> ${c.nome}</h3>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.15); color:#fff; border:none;" onclick="document.getElementById('crm-detail-modal').remove()">Fechar</button>
                    </div>
                    <div class="modal-body">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                            <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center;">
                                <div style="font-size:1.5rem; font-weight:800; color:#1d4ed8;">R$ ${c.totalGasto.toFixed(2)}</div>
                                <div class="text-xs text-muted">Total Gasto</div>
                            </div>
                            <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center;">
                                <div style="font-size:1.5rem; font-weight:800; color:#059669;">R$ ${avgTicket}</div>
                                <div class="text-xs text-muted">Ticket Médio</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                            ${c.email ? `<div class="text-sm"><i class="ri-mail-line"></i> ${c.email}</div>` : ''}
                            ${c.whatsapp ? `<div class="text-sm"><i class="ri-whatsapp-line"></i> ${c.whatsapp}</div>` : ''}
                            <div class="text-sm text-muted"><i class="ri-calendar-line"></i> Última compra: ${lastDate}</div>
                        </div>
                        <h5 style="margin-bottom:8px;">Histórico de Compras</h5>
                        <div style="max-height:250px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; padding:10px;">
                            ${pedidosHtml || '<p class="text-muted text-sm">Nenhum pedido registrado.</p>'}
                        </div>
                        ${c.whatsapp ? `<a href="https://wa.me/55${c.whatsapp.replace(/\D/g, '')}" target="_blank" class="btn btn-success btn-full" style="margin-top:15px;"><i class="ri-whatsapp-line"></i> Enviar Mensagem</a>` : ''}
                    </div>
                </div>
            </div>`;

            const div = document.createElement('div');
            div.innerHTML = detailHtml;
            document.body.appendChild(div.firstElementChild);
        }
    },

    // =========================================================================
    // 📦 3. HISTÓRICO DE MOVIMENTAÇÃO DE ESTOQUE
    // =========================================================================
    stockHistory: {
        log: async (productId, productName, tipo, qtd, motivo = '') => {
            try {
                await _sb.from('stock_movements').insert({
                    store_id: App.state.storeId,
                    product_id: productId,
                    product_name: productName,
                    tipo: tipo, // 'entrada', 'saida', 'ajuste', 'venda'
                    quantidade: qtd,
                    motivo: motivo,
                    usuario: App.state.profile?.nome_completo || 'Sistema'
                });
            } catch (e) {
                console.warn('Stock history log failed (table may not exist):', e.message);
            }
        },

        openPanel: async () => {
            const storeId = App.state.storeId;
            if (!storeId) return;

            const { data, error } = await _sb.from('stock_movements')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .limit(100);

            const movements = data || [];

            const html = `
            <div id="stock-history-modal" class="modal-overlay" style="display:flex; z-index:2010;">
                <div class="modal-content" style="max-width:700px;">
                    <div class="modal-header" style="background:linear-gradient(135deg, #059669, #10b981);">
                        <h3 style="color:#fff;"><i class="ri-history-line"></i> Movimentação de Estoque</h3>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('stock-history-modal').remove()">Fechar</button>
                    </div>
                    <div class="modal-body">
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <button class="btn btn-sm btn-success" style="width:auto;" onclick="NaxioEnterprise.stockHistory.addManualEntry()">
                                <i class="ri-add-line"></i> Entrada Manual
                            </button>
                            <button class="btn btn-sm btn-warning" style="width:auto;" onclick="NaxioEnterprise.stockHistory.addAdjustment()">
                                <i class="ri-tools-line"></i> Ajuste de Estoque
                            </button>
                        </div>
                        <div style="max-height:450px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                            ${movements.length === 0 ? '<p style="padding:20px; text-align:center; color:var(--text-muted);">Nenhuma movimentação registrada.</p>' :
                    movements.map(m => {
                        const dt = new Date(m.created_at).toLocaleString('pt-BR');
                        const isIn = m.tipo === 'entrada';
                        const isOut = m.tipo === 'saida' || m.tipo === 'venda';
                        const color = isIn ? '#10b981' : (isOut ? '#ef4444' : '#f59e0b');
                        const icon = isIn ? 'ri-arrow-down-circle-line' : (isOut ? 'ri-arrow-up-circle-line' : 'ri-settings-3-line');
                        const sign = isIn ? '+' : '-';
                        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 15px; border-bottom:1px solid var(--border);">
                                    <div>
                                        <div style="font-weight:600;"><i class="${icon}" style="color:${color};"></i> ${m.product_name}</div>
                                        <div class="text-xs text-muted">${dt} · ${m.usuario || 'Sistema'} ${m.motivo ? `· ${m.motivo}` : ''}</div>
                                    </div>
                                    <div style="font-weight:bold; color:${color}; font-size:1.1rem;">${sign}${m.quantidade}</div>
                                </div>`;
                    }).join('')}
                        </div>
                    </div>
                </div>
            </div>`;

            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
        },

        addManualEntry: async () => {
            const products = App.state.myProducts || [];
            if (products.length === 0) return App.utils.toast('Cadastre produtos primeiro', 'warning');

            const prodName = await NaxioUI.prompt('📦 Entrada Manual', 'Nome ou código do produto:');
            if (!prodName) return;

            const prod = products.find(p =>
                p.nome.toLowerCase().includes(prodName.toLowerCase()) ||
                (p.codigo_barras && p.codigo_barras.includes(prodName))
            );

            if (!prod) return App.utils.toast('Produto não encontrado', 'error');

            const qtdStr = await NaxioUI.prompt('🔢 Quantidade', `Quantidade de ENTRADA para "${prod.nome}":`, '', 'Ex: 10');
            const qtd = parseInt(qtdStr);
            if (!qtd || qtd <= 0) return;

            const motivo = await NaxioUI.prompt('📝 Motivo', 'Motivo (Ex: Compra fornecedor, Devolução):') || 'Entrada manual';

            // Atualiza estoque
            const novoEstoque = (prod.estoque || 0) + qtd;
            await _sb.from('products').update({ estoque: novoEstoque }).eq('id', prod.id);

            // Registra log
            await NaxioEnterprise.stockHistory.log(prod.id, prod.nome, 'entrada', qtd, motivo);

            App.utils.toast(`✅ +${qtd} un de "${prod.nome}" adicionados!`, 'success');
            App.store.loadMyProducts();

            // Recarrega o modal
            document.getElementById('stock-history-modal')?.remove();
            NaxioEnterprise.stockHistory.openPanel();
        },

        addAdjustment: async () => {
            const prodName = await NaxioUI.prompt('🛠️ Ajuste de Estoque', 'Nome ou código do produto para ajustar:');
            if (!prodName) return;

            const products = App.state.myProducts || [];
            const prod = products.find(p =>
                p.nome.toLowerCase().includes(prodName.toLowerCase()) ||
                (p.codigo_barras && p.codigo_barras.includes(prodName))
            );

            if (!prod) return App.utils.toast('Produto não encontrado', 'error');

            const novoQtdStr = await NaxioUI.prompt('🔢 Novo Estoque', `"${prod.nome}" - Estoque atual: ${prod.estoque || 0}\nDigite o estoque correto:`);
            const novoQtd = parseInt(novoQtdStr);
            if (novoQtdStr === null || isNaN(novoQtd)) return;

            const diff = novoQtd - (prod.estoque || 0);
            await _sb.from('products').update({ estoque: novoQtd }).eq('id', prod.id);

            await NaxioEnterprise.stockHistory.log(prod.id, prod.nome, 'ajuste', diff, `Ajuste: ${prod.estoque || 0} → ${novoQtd}`);

            App.utils.toast(`✅ Estoque de "${prod.nome}" ajustado para ${novoQtd}`, 'success');
            App.store.loadMyProducts();

            document.getElementById('stock-history-modal')?.remove();
            NaxioEnterprise.stockHistory.openPanel();
        }
    },

    // =========================================================================
    // ⭐ 4. PROGRAMA DE FIDELIDADE (Pontos)
    // =========================================================================
    loyalty: {
        POINTS_PER_REAL: 1, // 1 ponto por real gasto

        checkPoints: async (clientId) => {
            if (!clientId) return 0;
            try {
                const { data } = await _sb.from('loyalty_points')
                    .select('points')
                    .eq('client_id', clientId)
                    .eq('store_id', App.state.storeId)
                    .maybeSingle();
                return data?.points || 0;
            } catch (e) {
                return 0;
            }
        },

        addPoints: async (clientId, amount) => {
            if (!clientId || !amount) return;
            const points = Math.floor(amount * NaxioEnterprise.loyalty.POINTS_PER_REAL);
            try {
                const { data: existing } = await _sb.from('loyalty_points')
                    .select('id, points')
                    .eq('client_id', clientId)
                    .eq('store_id', App.state.storeId)
                    .maybeSingle();

                if (existing) {
                    await _sb.from('loyalty_points').update({
                        points: existing.points + points,
                        updated_at: new Date().toISOString()
                    }).eq('id', existing.id);
                } else {
                    await _sb.from('loyalty_points').insert({
                        client_id: clientId,
                        store_id: App.state.storeId,
                        points: points
                    });
                }
            } catch (e) {
                console.warn('Loyalty points update failed:', e.message);
            }
        },

        openPanel: async () => {
            const storeId = App.state.storeId;
            if (!storeId) return;

            let loyaltyData = [];
            try {
                const { data } = await _sb.from('loyalty_points')
                    .select('*, profiles:client_id(nome_completo, email)')
                    .eq('store_id', storeId)
                    .order('points', { ascending: false });
                loyaltyData = data || [];
            } catch (e) {
                console.warn('Loyalty table may not exist');
            }

            const html = `
            <div id="loyalty-modal" class="modal-overlay" style="display:flex; z-index:2010;">
                <div class="modal-content" style="max-width:600px;">
                    <div class="modal-header" style="background:linear-gradient(135deg, #d97706, #f59e0b);">
                        <h3 style="color:#fff;"><i class="ri-vip-crown-line"></i> Programa de Fidelidade</h3>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('loyalty-modal').remove()">Fechar</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:linear-gradient(135deg,#fefce8,#fef9c3); padding:15px; border-radius:10px; margin-bottom:15px; text-align:center;">
                            <div style="font-size:0.85rem; color:#92400e;"><i class="ri-information-line"></i> Cada R$ 1,00 gasto = ${NaxioEnterprise.loyalty.POINTS_PER_REAL} ponto(s)</div>
                        </div>
                        <div style="max-height:400px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                            ${loyaltyData.length === 0 ? '<p style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum cliente com pontos ainda.</p>' :
                    loyaltyData.map((l, i) => {
                        const medal = i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`;
                        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid var(--border);">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <span style="font-size:1.2rem;">${medal}</span>
                                        <div>
                                            <div style="font-weight:600;">${l.profiles?.nome_completo || 'Cliente'}</div>
                                            <div class="text-xs text-muted">${l.profiles?.email || ''}</div>
                                        </div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="font-size:1.2rem; font-weight:800; color:#d97706;">⭐ ${l.points}</div>
                                        <div class="text-xs text-muted">pontos</div>
                                    </div>
                                </div>`;
                    }).join('')}
                        </div>
                    </div>
                </div>
            </div>`;

            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
        }
    },

    // =========================================================================
    // 🎯 5. RECOMENDAÇÕES DE PRODUTOS (Baseado em Popularidade)
    // =========================================================================
    recommendations: {
        getPopular: async (storeId, limit = 6) => {
            try {
                const { data: orders } = await _sb.from('orders')
                    .select('product_id')
                    .eq('store_id', storeId)
                    .neq('status', 'cancelado')
                    .limit(200);

                if (!orders) return [];

                // Conta frequência de cada product_id
                const freq = {};
                orders.forEach(o => {
                    if (o.product_id) freq[o.product_id] = (freq[o.product_id] || 0) + 1;
                });

                // Ordena por popularidade
                const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit);
                const ids = sorted.map(s => s[0]);

                if (ids.length === 0) return [];

                const { data: products } = await _sb.from('products')
                    .select('*')
                    .in('id', ids);

                return products || [];
            } catch (e) {
                return [];
            }
        },

        renderWidget: async (storeId, containerId = 'recommendations-widget') => {
            const container = document.getElementById(containerId);
            if (!container) return;

            const products = await NaxioEnterprise.recommendations.getPopular(storeId);
            if (products.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            container.innerHTML = `
                <h4 style="margin-bottom:12px; color:var(--primary);"><i class="ri-fire-line"></i> Mais Vendidos</h4>
                <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:10px;">
                    ${products.map(p => `
                        <div style="min-width:140px; max-width:160px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:12px; text-align:center; flex-shrink:0; cursor:pointer;" onclick="App.catalog.viewProduct && App.catalog.viewProduct('${p.id}')">
                            ${p.imagem_url ? `<img src="${p.imagem_url}" style="width:100%; height:80px; object-fit:cover; border-radius:8px; margin-bottom:8px;">` : `<div style="width:100%; height:80px; background:#f1f5f9; border-radius:8px; margin-bottom:8px; display:flex; align-items:center; justify-content:center;"><i class="ri-image-line" style="font-size:1.5rem; color:#94a3b8;"></i></div>`}
                            <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.nome}</div>
                            <div style="color:var(--primary); font-weight:700; margin-top:4px;">R$ ${p.preco.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    },

    // =========================================================================
    // 📊 6. KPI DASHBOARD AVANÇADO
    // =========================================================================
    dashboardKPI: {
        render: async () => {
            const storeId = App.state.storeId;
            if (!storeId) return;

            const container = document.getElementById('kpi-advanced-area');
            if (!container) return;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            // Busca dados
            const { data: orders } = await _sb.from('orders')
                .select('created_at, total_pago, status, origem_venda')
                .eq('store_id', storeId)
                .gte('created_at', startOfMonth);

            const { data: products } = await _sb.from('products')
                .select('id, estoque, estoque_minimo')
                .eq('store_id', storeId);

            if (!orders) return;

            // Calcula KPIs
            const concluidos = orders.filter(o => o.status !== 'cancelado');
            const cancelados = orders.filter(o => o.status === 'cancelado');
            const hoje = concluidos.filter(o => o.created_at >= startOfDay);
            const totalHoje = hoje.reduce((a, o) => a + (parseFloat(o.total_pago) || 0), 0);
            const totalMes = concluidos.reduce((a, o) => a + (parseFloat(o.total_pago) || 0), 0);
            const ticketMedio = concluidos.length > 0 ? totalMes / concluidos.length : 0;
            const taxaCancelamento = orders.length > 0 ? ((cancelados.length / orders.length) * 100).toFixed(1) : 0;

            const lowStock = (products || []).filter(p => (p.estoque || 0) <= (p.estoque_minimo || 3)).length;
            const zeroStock = (products || []).filter(p => (p.estoque || 0) === 0).length;

            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            container.innerHTML = `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px;">
                    <div class="kpi-card" style="background:linear-gradient(135deg,#1e3a5f,#1d4ed8); color:#fff; padding:15px; border-radius:12px;">
                        <div style="font-size:0.75rem; opacity:0.8;">Vendas Hoje</div>
                        <div style="font-size:1.3rem; font-weight:800;">${fmt(totalHoje)}</div>
                        <div style="font-size:0.7rem; opacity:0.6;">${hoje.length} pedidos</div>
                    </div>
                    <div class="kpi-card" style="background:linear-gradient(135deg,#064e3b,#059669); color:#fff; padding:15px; border-radius:12px;">
                        <div style="font-size:0.75rem; opacity:0.8;">Vendas Mês</div>
                        <div style="font-size:1.3rem; font-weight:800;">${fmt(totalMes)}</div>
                        <div style="font-size:0.7rem; opacity:0.6;">${concluidos.length} pedidos</div>
                    </div>
                    <div class="kpi-card" style="background:linear-gradient(135deg,#78350f,#d97706); color:#fff; padding:15px; border-radius:12px;">
                        <div style="font-size:0.75rem; opacity:0.8;">Ticket Médio</div>
                        <div style="font-size:1.3rem; font-weight:800;">${fmt(ticketMedio)}</div>
                        <div style="font-size:0.7rem; opacity:0.6;">por venda</div>
                    </div>
                    <div class="kpi-card" style="background:linear-gradient(135deg,${parseFloat(taxaCancelamento) > 10 ? '#7f1d1d,#dc2626' : '#1e293b,#475569'}); color:#fff; padding:15px; border-radius:12px;">
                        <div style="font-size:0.75rem; opacity:0.8;">Cancelamentos</div>
                        <div style="font-size:1.3rem; font-weight:800;">${taxaCancelamento}%</div>
                        <div style="font-size:0.7rem; opacity:0.6;">${cancelados.length} neste mês</div>
                    </div>
                    <div class="kpi-card" style="background:linear-gradient(135deg,${lowStock > 0 ? '#7f1d1d,#b91c1c' : '#064e3b,#059669'}); color:#fff; padding:15px; border-radius:12px; cursor:pointer;" onclick="document.getElementById('low-stock-alerts')&&(document.getElementById('low-stock-alerts').style.display='block')">
                        <div style="font-size:0.75rem; opacity:0.8;">Estoque Crítico</div>
                        <div style="font-size:1.3rem; font-weight:800;">${lowStock} itens</div>
                        <div style="font-size:0.7rem; opacity:0.6;">${zeroStock} zerados</div>
                    </div>
                </div>
            `;
        }
    },

    // =========================================================================
    // ♿ 7. MELHORIAS DE ACESSIBILIDADE
    // =========================================================================
    accessibility: {
        init: () => {
            // Adiciona aria-labels em botões sem texto
            document.querySelectorAll('button:not([aria-label])').forEach(btn => {
                if (!btn.textContent.trim() && btn.querySelector('i')) {
                    const icon = btn.querySelector('i');
                    const className = icon.className || '';
                    if (className.includes('delete')) btn.setAttribute('aria-label', 'Excluir');
                    else if (className.includes('edit')) btn.setAttribute('aria-label', 'Editar');
                    else if (className.includes('close')) btn.setAttribute('aria-label', 'Fechar');
                    else if (className.includes('search')) btn.setAttribute('aria-label', 'Buscar');
                    else if (className.includes('print')) btn.setAttribute('aria-label', 'Imprimir');
                    else if (className.includes('save')) btn.setAttribute('aria-label', 'Salvar');
                }
            });

            // Adiciona role="dialog" nos modais
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
            });

            // Garante que inputs tenham labels
            document.querySelectorAll('.input-field').forEach(input => {
                if (!input.id) return;
                const label = document.querySelector(`label[for="${input.id}"]`);
                if (!label && input.placeholder) {
                    input.setAttribute('aria-label', input.placeholder);
                }
            });

            // Esc fecha modais
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const modals = document.querySelectorAll('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]');
                    if (modals.length > 0) {
                        const lastModal = modals[modals.length - 1];
                        lastModal.style.display = 'none';
                        // Some modals use remove instead
                        if (lastModal.id && lastModal.id.includes('crm') || lastModal.id?.includes('loyalty') || lastModal.id?.includes('stock-history')) {
                            lastModal.remove();
                        }
                    }
                }
            });

            console.log('♿ Acessibilidade aprimorada');
        }
    },

    // =========================================================================
    // 🏷️ 8. PROMOÇÕES POR CATEGORIA
    // =========================================================================
    promotions: {
        openPanel: async () => {
            const storeId = App.state.storeId;

            let promos = [];
            try {
                const { data } = await _sb.from('promotions')
                    .select('*')
                    .eq('store_id', storeId)
                    .order('created_at', { ascending: false });
                promos = data || [];
            } catch (e) {
                console.warn('Promotions table may not exist');
            }

            const tipoLoja = App.state.currentStore?.tipo_loja;
            const cats = CONFIG.getCategoriesForStoreType(tipoLoja);

            const html = `
            <div id="promotions-modal" class="modal-overlay" style="display:flex; z-index:2010;">
                <div class="modal-content" style="max-width:600px;">
                    <div class="modal-header" style="background:linear-gradient(135deg, #be185d, #ec4899);">
                        <h3 style="color:#fff;"><i class="ri-price-tag-3-line"></i> Promoções</h3>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('promotions-modal').remove()">Fechar</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:#fdf2f8; padding:15px; border-radius:10px; margin-bottom:15px; border:1px solid #fbcfe8;">
                            <h5 style="margin-bottom:10px; color:#be185d;">Nova Promoção</h5>
                            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
                                <div class="input-wrapper" style="flex:2; margin:0; min-width:150px;">
                                    <label class="text-xs">Categoria</label>
                                    <select id="promo-category" class="input-field">
                                        <option value="">Todas</option>
                                        ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="input-wrapper" style="flex:1; margin:0; min-width:80px;">
                                    <label class="text-xs">Desconto %</label>
                                    <input type="number" id="promo-discount" class="input-field" value="10" min="1" max="90">
                                </div>
                                <div class="input-wrapper" style="flex:1; margin:0; min-width:120px;">
                                    <label class="text-xs">Até</label>
                                    <input type="date" id="promo-end-date" class="input-field">
                                </div>
                                <button class="btn btn-sm" style="background:#be185d; color:#fff; height:46px; width:auto;" onclick="NaxioEnterprise.promotions.create()">
                                    <i class="ri-add-line"></i> Criar
                                </button>
                            </div>
                        </div>
                        <div id="promos-list" style="max-height:300px; overflow-y:auto; border:1px solid var(--border); border-radius:8px;">
                            ${promos.length === 0 ? '<p style="padding:20px; text-align:center; color:var(--text-muted);">Nenhuma promoção ativa.</p>' :
                    promos.map(p => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 15px; border-bottom:1px solid var(--border);">
                                        <div>
                                            <div style="font-weight:600;">${p.categoria || 'Todas as categorias'} - ${p.desconto}% OFF</div>
                                            <div class="text-xs text-muted">${p.data_fim ? 'Até ' + new Date(p.data_fim).toLocaleDateString('pt-BR') : 'Sem prazo'}</div>
                                        </div>
                                        <button class="btn btn-sm btn-danger" style="width:auto;" onclick="NaxioEnterprise.promotions.remove('${p.id}')">
                                            <i class="ri-delete-bin-line"></i>
                                        </button>
                                    </div>
                                `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;

            const div = document.createElement('div');
            div.innerHTML = html;
            document.body.appendChild(div.firstElementChild);
        },

        create: async () => {
            const cat = document.getElementById('promo-category')?.value || null;
            const discount = parseInt(document.getElementById('promo-discount')?.value);
            const endDate = document.getElementById('promo-end-date')?.value || null;

            if (!discount || discount <= 0) return App.utils.toast('Informe o desconto.', 'error');

            try {
                await _sb.from('promotions').insert({
                    store_id: App.state.storeId,
                    categoria: cat,
                    desconto: discount,
                    data_fim: endDate,
                    ativo: true
                });
                App.utils.toast('Promoção criada!', 'success');
                document.getElementById('promotions-modal')?.remove();
                NaxioEnterprise.promotions.openPanel();
            } catch (e) {
                App.utils.toast('Erro ao criar promoção', 'error');
            }
        },

        remove: async (id) => {
            if (!await NaxioUI.confirm('Confirmação', 'Remover promoção?')) return;
            try {
                await _sb.from('promotions').delete().eq('id', id);
                App.utils.toast('Promoção removida!', 'success');
                document.getElementById('promotions-modal')?.remove();
                NaxioEnterprise.promotions.openPanel();
            } catch (e) {
                App.utils.toast('Erro ao remover', 'error');
            }
        }
    },

    // =========================================================================
    // 🔄 9. PERFORMANCE & LAZY LOADING
    // =========================================================================
    performance: {
        init: () => {
            // Lazy load de imagens
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            if (img.dataset.src) {
                                img.src = img.dataset.src;
                                img.removeAttribute('data-src');
                                observer.unobserve(img);
                            }
                        }
                    });
                }, { rootMargin: '100px' });

                document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
            }

            // Debounce para buscas
            NaxioEnterprise.performance._debounceTimers = {};
            console.log('⚡ Performance otimizações ativas');
        },

        debounce: (fn, delay = 300, key = 'default') => {
            clearTimeout(NaxioEnterprise.performance._debounceTimers[key]);
            NaxioEnterprise.performance._debounceTimers[key] = setTimeout(fn, delay);
        }
    },

    // =========================================================================
    // 🚀 10. PAINEL GESTÃO AVANÇADA (Centraliza tudo num modal limpo)
    // =========================================================================
    openGestaoAvancada: () => {
        const html = `
        <div id="gestao-avancada-modal" class="modal-overlay" style="display:flex; z-index:2010;">
            <div class="modal-content" style="max-width:600px;">
                <div class="modal-header" style="background:linear-gradient(135deg, #1e40af, #7c3aed);">
                    <h3 style="color:#fff;"><i class="ri-dashboard-line"></i> Gestão Avançada</h3>
                    <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('gestao-avancada-modal').remove()">Fechar</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.crm.openPanel();"
                             style="background:linear-gradient(135deg,#eff6ff,#dbeafe); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #bfdbfe; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-contacts-book-line" style="font-size:1.5rem; color:#1d4ed8;"></i>
                            <h5 style="margin:8px 0 4px; color:#1e40af;">CRM</h5>
                            <p class="text-xs text-muted" style="margin:0;">Histórico e ranking de clientes</p>
                        </div>

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.stockHistory.openPanel();"
                             style="background:linear-gradient(135deg,#f0fdf4,#dcfce7); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #bbf7d0; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-history-line" style="font-size:1.5rem; color:#059669;"></i>
                            <h5 style="margin:8px 0 4px; color:#065f46;">Movimentação</h5>
                            <p class="text-xs text-muted" style="margin:0;">Entradas, saídas e ajustes</p>
                        </div>

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.promotions.openPanel();"
                             style="background:linear-gradient(135deg,#fdf2f8,#fce7f3); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #fbcfe8; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-price-tag-3-line" style="font-size:1.5rem; color:#be185d;"></i>
                            <h5 style="margin:8px 0 4px; color:#9d174d;">Promoções</h5>
                            <p class="text-xs text-muted" style="margin:0;">Descontos por categoria</p>
                        </div>

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.loyalty.openPanel();"
                             style="background:linear-gradient(135deg,#fefce8,#fef9c3); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #fde68a; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-vip-crown-line" style="font-size:1.5rem; color:#d97706;"></i>
                            <h5 style="margin:8px 0 4px; color:#92400e;">Fidelidade</h5>
                            <p class="text-xs text-muted" style="margin:0;">Programa de pontos</p>
                        </div>

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.dashboardKPI.render();"
                             style="background:linear-gradient(135deg,#f5f3ff,#ede9fe); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #ddd6fe; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-bar-chart-2-line" style="font-size:1.5rem; color:#7c3aed;"></i>
                            <h5 style="margin:8px 0 4px; color:#5b21b6;">KPIs</h5>
                            <p class="text-xs text-muted" style="margin:0;">Métricas avançadas do mês</p>
                        </div>

                        <div onclick="document.getElementById('gestao-avancada-modal').remove(); NaxioEnterprise.onboarding.render();"
                             style="background:linear-gradient(135deg,#ecfdf5,#d1fae5); padding:20px; border-radius:12px; cursor:pointer; border:1px solid #a7f3d0; transition:transform 0.2s;"
                             onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                            <i class="ri-rocket-2-line" style="font-size:1.5rem; color:#059669;"></i>
                            <h5 style="margin:8px 0 4px; color:#047857;">Onboarding</h5>
                            <p class="text-xs text-muted" style="margin:0;">Checklist de primeiros passos</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    // =========================================================================
    // 🚀 INICIALIZAÇÃO DO MÓDULO
    // =========================================================================
    init: () => {
        console.log('🏢 Naxio Enterprise Module v2.0 Carregado');

        // Acessibilidade
        NaxioEnterprise.accessibility.init();

        // Performance
        NaxioEnterprise.performance.init();

        // Se estiver logado como lojista, carrega KPIs e onboarding
        if (App.state.profile?.role === 'loja_admin' && App.state.storeId) {
            setTimeout(() => {
                NaxioEnterprise.onboarding.render();
                NaxioEnterprise.dashboardKPI.render();
            }, 2500);
        }
    }
};

// Auto-inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(NaxioEnterprise.init, 2000));
} else {
    setTimeout(NaxioEnterprise.init, 2000);
}

console.log('🏢 Naxio Enterprise Module Registrado');
