const GestaoLojista = {
    init: () => {
        console.log("🚀 Módulo Gestão de Lojista Iniciado");
        GestaoLojista.injectStyles();
        GestaoLojista.injectHTML();
    },

    injectStyles: () => {
        const style = document.createElement('style');
        style.innerHTML = `
            .gl-container { display: grid; grid-template-columns: 250px 1fr; gap: 20px; height: calc(100vh - 100px); }
            .gl-sidebar { background: #1e293b; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px; }
            .gl-content { background: #0f172a; padding: 20px; border-radius: 12px; overflow-y: auto; border: 1px solid #334155; }
            .gl-menu-item { padding: 12px; border-radius: 8px; cursor: pointer; color: #94a3b8; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
            .gl-menu-item:hover, .gl-menu-item.active { background: #3b82f6; color: white; }
            
            .gl-card { background: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 15px; }
            .gl-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
            .gl-stat-box { background: #334155; padding: 15px; border-radius: 8px; text-align: center; }
            .gl-stat-value { font-size: 1.8rem; font-weight: bold; color: white; margin: 10px 0; }
            .gl-stat-label { font-size: 0.9rem; color: #cbd5e1; }

            .collections-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
            .collections-table th { text-align: left; padding: 10px; border-bottom: 2px solid #475569; color: #94a3b8; }
            .collections-table td { padding: 10px; border-bottom: 1px solid #334155; }
            .status-badge { padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; }
            .status-pendente { background: #fef3c7; color: #92400e; }
            .status-atrasado { background: #fee2e2; color: #b91c1c; }
            .status-pago { background: #dcfce7; color: #166534; }
        `;
        document.head.appendChild(style);
    },

    injectHTML: () => {
        if (document.getElementById('view-gestao-lojista')) return; // Evita duplicação
        const main = document.querySelector('main');
        const section = document.createElement('section');
        section.id = 'view-gestao-lojista';
        section.className = 'view-section container';
        section.innerHTML = `
            <div class="gl-container">
                <div class="gl-sidebar">
                    <h3 style="color:white; margin-bottom:20px;">Gestão Lojista</h3>
                    <div class="gl-menu-item active" onclick="GestaoLojista.switchTab('dashboard')">
                        <i class="ri-dashboard-line"></i> Dashboard
                    </div>
                    <div class="gl-menu-item" onclick="GestaoLojista.switchTab('cobranca')">
                        <i class="ri-money-dollar-circle-line"></i> Cobranças
                    </div>
                    <div class="gl-menu-item" onclick="GestaoLojista.switchTab('crediario')">
                        <i class="ri-calendar-todo-line"></i> Crediário
                    </div>
                    <div class="gl-menu-item" onclick="GestaoLojista.switchTab('cards')">
                        <i class="ri-bank-card-line"></i> Maquinetas
                    </div>
                    <div class="gl-menu-item" onclick="GestaoLojista.switchTab('stock')">
                        <i class="ri-archive-line"></i> Robô de Estoque
                    </div>
                    <div style="flex:1"></div>
                    <button class="btn btn-secondary" onclick="App.router.go('loja')">Voltar</button>
                </div>
                
                <div class="gl-content" id="gl-content-area">
                    <!-- Conteúdo Dinâmico Aqui -->
                </div>
            </div>
            
            <!-- Modal Nova Cobrança -->
            <div id="modal-new-collection" class="modal-overlay">
                <div class="modal-content">
                    <h3>Nova Cobrança</h3>
                    <div class="input-wrapper">
                        <label>Cliente</label>
                        <select id="new-col-client" class="input-field"></select>
                    </div>
                    <div class="input-wrapper">
                        <label>Valor (R$)</label>
                        <input type="number" id="new-col-value" class="input-field">
                    </div>
                    <div class="input-wrapper">
                        <label>Data Vencimento</label>
                        <input type="date" id="new-col-date" class="input-field">
                    </div>
                    <button class="btn btn-primary btn-full" onclick="GestaoLojista.createCollection()">Salvar</button>
                    <button class="btn btn-secondary btn-full" style="margin-top:10px" onclick="document.getElementById('modal-new-collection').style.display='none'">Cancelar</button>
                </div>
            </div>
        `;
        main.appendChild(section);
        GestaoLojista.renderDashboard(); // Default view
    },

    open: async () => {
        if (!document.getElementById('view-gestao-lojista')) {
            console.warn("⚠️ View Gestão Lojista não encontrada, recriando...");
            GestaoLojista.injectHTML();
        }
        
        // --- Busca Nome da Loja ---
        if (App.state.storeId) {
            const { data: st } = await _sb.from('stores').select('nome_loja').eq('id', App.state.storeId).single();
            if (st && st.nome_loja) {
                const titleEl = document.querySelector('.gl-sidebar h3');
                if (titleEl) titleEl.innerText = st.nome_loja;
            }
        }

        App.router.go('gestao-lojista');
        setTimeout(() => GestaoLojista.renderDashboard(), 100);
    },

    openNewCollectionModal: async () => {
        const modal = document.getElementById('modal-new-collection');
        if (!modal) {
            console.warn("⚠️ Modal de cobrança não encontrado. Reinjetando HTML...");
            GestaoLojista.injectHTML();
        }
        
        const modalEl = document.getElementById('modal-new-collection');
        if (modalEl) {
            modalEl.style.display = 'flex';
            // Popula a lista de clientes
            GestaoLojista.loadClientsIntoModal();
        }
    },

    loadClientsIntoModal: async () => {
        const select = document.getElementById('new-col-client');
        if (!select) return;
        
        select.innerHTML = '<option value="">Carregando clientes...</option>';
        
        try {
            // Busca perfis vinculados a esta loja
            const { data: staffRows } = await _sb.from('store_staff')
                .select('profile_id, profiles:profile_id(nome_completo)')
                .eq('store_id', App.state.storeId)
                .eq('cargo', 'cliente');
            
            if (!staffRows || staffRows.length === 0) {
                select.innerHTML = '<option value="">Nenhum cliente vinculado a esta loja.</option>';
                return;
            }
            
            select.innerHTML = '<option value="">Selecione um cliente...</option>';
            staffRows.forEach(row => {
                const p = row.profiles;
                if (p) {
                    const opt = document.createElement('option');
                    opt.value = row.profile_id;
                    opt.innerText = p.nome_completo;
                    select.appendChild(opt);
                }
            });
        } catch (err) {
            console.error("Erro ao carregar clientes para cobrança:", err);
            select.innerHTML = '<option value="">Erro ao carregar lista.</option>';
        }
    },

    switchTab: (tab) => {
        document.querySelectorAll('.gl-menu-item').forEach(el => el.classList.remove('active'));
        // Localiza e destaca o item clicado
        const items = document.querySelectorAll('.gl-menu-item');
        items.forEach(item => {
            if (item.getAttribute('onclick').includes(tab)) item.classList.add('active');
        });

        if (tab === 'dashboard') GestaoLojista.renderDashboard();
        else if (tab === 'cobranca') GestaoLojista.renderCollections();
        else if (tab === 'crediario') GestaoLojista.renderCrediario();
        else if (tab === 'cards') GestaoLojista.renderCards();
        else if (tab === 'stock') GestaoLojista.renderStockRobot();
    },

    // --- DASHBOARD VIEW ---
    renderDashboard: async () => {
        if (!App.state.storeId) {
            // Log once only, and don't loop every 500ms to avoid clogging the main thread.
            if (!GestaoLojista._waitingLog) {
                console.warn("ℹ️ Aguardando storeId para carregar dashboard...");
                GestaoLojista._waitingLog = true;
            }
            // Use a longer delay or better, wait for a specific event if possible.
            // For now, increasing delay and removing the spam.
            setTimeout(() => GestaoLojista.renderDashboard(), 2000);
            return;
        }
        GestaoLojista._waitingLog = false;

        const area = document.getElementById('gl-content-area');
        if (!area) return;
        
        area.innerHTML = `
            <h2><i class="ri-dashboard-line"></i> Visão Geral</h2>
            <div class="gl-stat-grid" id="gl-kpi-grid">
                <div class="gl-stat-box"><div class="gl-stat-label">Vendas Hoje</div><div class="gl-stat-value" id="stat-sales-today">R$ ...</div></div>
                <div class="gl-stat-box"><div class="gl-stat-label">A Receber (Mês)</div><div class="gl-stat-value text-warning" id="stat-to-receive">R$ ...</div></div>
                <div class="gl-stat-box"><div class="gl-stat-label">Inadimplência</div><div class="gl-stat-value text-danger" id="stat-overdue">R$ ...</div></div>
            </div>
            <div class="gl-card">
                <h4>🤖 Status dos Robôs</h4>
                <div style="display:flex; justify-content:space-between; margin-top:10px; padding:10px; background:#1e293b; border-radius:6px;">
                    <span>📦 Robô de Estoque</span> <span class="text-success">ATIVO (Monitorando SKU e Mínimos)</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:10px; padding:10px; background:#1e293b; border-radius:6px;">
                    <span>💰 Robô de Cobrança</span> <span class="text-success">ATIVO (Sincronizado com Crediário)</span>
                </div>
            </div>
        `;

        // --- BUSCA DADOS REAIS ---
        try {
            const nowLocal = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);
            const today = nowLocal.toISOString().split('T')[0];
            const firstDayMonth = today.substring(0, 8) + '01';

            
            // 1. Vendas Hoje
            const { data: salesToday } = await _sb.from('orders')
                .select('total_pago')
                .eq('store_id', App.state.storeId)
                .eq('status', 'concluido')
                .gte('created_at', today);
            const totalHoje = salesToday ? salesToday.reduce((acc, curr) => acc + (curr.total_pago || 0), 0) : 0;
            document.getElementById('stat-sales-today').innerText = `R$ ${totalHoje.toFixed(2)}`;

            // 2. A Receber (Mês atual)
            const { data: toReceive } = await _sb.from('crediario_installments')
                .select('amount')
                .eq('store_id', App.state.storeId)
                .eq('status', 'pendente')
                .gte('due_date', firstDayMonth);
            const totalReceber = toReceive ? toReceive.reduce((acc, curr) => acc + (curr.amount || 0), 0) : 0;
            document.getElementById('stat-to-receive').innerText = `R$ ${totalReceber.toFixed(2)}`;

            // 3. Inadimplência (Atrasados total)
            const { data: overdue } = await _sb.from('crediario_installments')
                .select('amount')
                .eq('store_id', App.state.storeId)
                .eq('status', 'pendente')
                .lt('due_date', today);
            const totalAtrasado = overdue ? overdue.reduce((acc, curr) => acc + (curr.amount || 0), 0) : 0;
            document.getElementById('stat-overdue').innerText = `R$ ${totalAtrasado.toFixed(2)}`;

        } catch (err) {
            console.error("Erro ao carregar dashboard:", err);
        }

        // Add Client Button Action Area
        const actionArea = document.createElement('div');
        actionArea.style.marginTop = '20px';
        actionArea.style.display = 'flex';
        actionArea.innerHTML = `
            <button class="btn btn-primary" onclick="GestaoLojista.openRegisterClientModal()">
                <i class="ri-user-add-line"></i> Cadastrar Novo Cliente
            </button>
        `;
        document.getElementById('gl-content-area').appendChild(actionArea);
    },

    // --- CADASTRO DE CLIENTES ---
    openRegisterClientModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10006;';

        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px; background:var(--surface); color:var(--text-color); border-radius:24px;">
                <div class="modal-header">
                    <h3>👥 Novo Cliente</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="input-group" style="margin-bottom:15px;">
                        <label>Nome Completo</label>
                        <input id="new-client-name" type="text" class="input-field" placeholder="Ex: João Silva">
                    </div>
                    <div class="input-group" style="margin-bottom:15px;">
                        <label>CPF (Apenas números)</label>
                        <input id="new-client-cpf" type="text" class="input-field" placeholder="12345678900">
                    </div>
                    <div class="input-group" style="margin-bottom:15px;">
                        <label>Telefone / WhatsApp</label>
                        <input id="new-client-phone" type="text" class="input-field" placeholder="(11) 99999-9999">
                    </div>
                    <div class="input-group" style="margin-bottom:15px;">
                        <label>Email (Opcional)</label>
                        <input id="new-client-email" type="email" class="input-field" placeholder="joao@email.com">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-success btn-full" onclick="GestaoLojista.saveNewClient(this)">💾 Salvar Cliente</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    createCollection: async () => {
        const btn = document.querySelector('#modal-new-collection .btn-primary');
        const clientId = document.getElementById('new-col-client').value;
        const amount = parseFloat(document.getElementById('new-col-value').value);
        const dueDate = document.getElementById('new-col-date').value;

        if (!clientId || !amount || !dueDate) {
            return alert("Por favor, preencha todos os campos.");
        }

        if (btn) {
            btn.disabled = true;
            btn.innerText = "Salvando...";
        }

        try {
            const { error } = await _sb.from('collections').insert({
                store_id: App.state.storeId,
                cliente_id: clientId,
                valor: amount,
                status: 'pendente',
                data_promessa_pagamento: dueDate,
                cobrador_id: App.state.user.id
            });

            if (error) throw error;

            alert("✅ Cobrança lançada com sucesso!");
            document.getElementById('modal-new-collection').style.display = 'none';
            
            // Se estiver na aba de cobranças, recarrega
            const activeTab = document.querySelector('.gl-menu-item.active').dataset.tab;
            if (activeTab === 'collections') GestaoLojista.renderCollections();
        } catch (err) {
            console.error("Erro ao salvar cobrança:", err);
            alert("Erro ao salvar: " + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Salvar";
            }
        }
    },

    saveNewClient: async (btn) => {
        const nome = document.getElementById('new-client-name').value.trim();
        const cpf = document.getElementById('new-client-cpf').value.trim().replace(/\D/g, '');
        const cel = document.getElementById('new-client-phone').value.trim();
        const email = document.getElementById('new-client-email').value.trim();

        if (!nome || !cpf) return alert("Nome e CPF são obrigatórios.");

        btn.disabled = true;
        btn.innerText = "Salvando...";

        try {
            // 1. Cria o Profile
            const { data: newProfile, error } = await _sb.from('profiles').insert({
                nome_completo: nome,
                cpf: cpf,
                whatsapp: cel, 
                email: email || `${cpf}@loja.local`,
                role: 'cliente',
                created_at: new Date().toISOString()
            }).select().single();

            if (error) throw error;

            // 2. Vínculo com a Loja (conforme solicitado pelo usuário, vinculamos via store_staff se profiles não tiver a coluna)
            if (newProfile && App.state.storeId) {
                const { error: staffError } = await _sb.from('store_staff').insert({
                    store_id: App.state.storeId,
                    profile_id: newProfile.id,
                    cargo: 'cliente'
                });
                // Note: Se der erro aqui (ex: coluna cargo não aceita 'cliente'), não interrompemos o sucesso do profile
                if (staffError) console.warn("Aviso: Falha ao vincular cliente à loja:", staffError.message);
            }

            alert("✅ Cliente cadastrado com sucesso!");
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.remove();
        } catch (error) {
            console.error("Erro ao cadastrar cliente:", error);
            alert("Erro ao salvar: " + (error.message || "Verifique os dados e tente novamente."));
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Salvar Cliente";
        }
    },

    renderCollections: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2><i class="ri-money-dollar-circle-line"></i> Gestão Unificada de Débitos</h2>
                <button class="btn btn-primary btn-sm" onclick="GestaoLojista.openNewCollectionModal()">+ Nova Cobrança</button>
            </div>
            
            <div class="gl-card">
                <table class="collections-table">
                    <thead>
                        <tr>
                            <th>Origem</th>
                            <th>Cliente</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="col-table-body">
                        <tr><td colspan="6" style="text-align:center">Carregando dados unificados...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        try {
            // 1. Busca Cobranças Manuais
            const { data: manualCols } = await _sb.from('collections')
                .select('*, profiles:cliente_id(nome_completo)')
                .eq('store_id', App.state.storeId)
                .neq('status', 'pago')
                .order('data_promessa_pagamento', { ascending: true });

            // 2. Busca Parcelas de Vendas (Crediário)
            const { data: installments } = await _sb.from('crediario_installments')
                .select('*, profiles:customer_id(nome_completo)')
                .eq('store_id', App.state.storeId)
                .neq('status', 'pago')
                .order('due_date', { ascending: true });

            // 3. Unifica e Normaliza os dados
            const unified = [];
            
            if (manualCols) {
                manualCols.forEach(c => unified.push({
                    id: c.id,
                    origem: 'Manual',
                    cliente: c.profiles?.nome_completo || 'N/A',
                    valor: c.valor || 0,
                    data: c.data_promessa_pagamento,
                    status: c.status,
                    raw: c
                }));
            }

            if (installments) {
                installments.forEach(i => unified.push({
                    id: i.id,
                    origem: 'Venda PDV',
                    cliente: i.profiles?.nome_completo || 'N/A',
                    valor: i.amount || 0,
                    data: i.due_date,
                    status: i.status || 'pendente',
                    raw: i
                }));
            }

            // Ordena por data de vencimento
            unified.sort((a,b) => new Date(a.data) - new Date(b.data));

            const tbody = document.getElementById('col-table-body');
            if (unified.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum débito pendente encontrado.</td></tr>';
                return;
            }

            tbody.innerHTML = unified.map(c => {
                const venc = new Date(c.data + 'T12:00:00');
                const hoje = new Date();
                hoje.setHours(0,0,0,0);
                let statusLabel = c.status === 'pendente' ? 'Pendente' : c.status;
                let badgeClass = 'status-pendente';

                if (venc < hoje) {
                    statusLabel = 'Atrasado';
                    badgeClass = 'status-atrasado';
                }

                return `
                    <tr>
                        <td><small style="opacity:0.6">${c.origem}</small></td>
                        <td>${c.cliente}</td>
                        <td><strong>R$ ${parseFloat(c.valor).toFixed(2)}</strong></td>
                        <td>${venc.toLocaleDateString()}</td>
                        <td><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="alert('Funcionalidade de alerta WhatsApp sendo configurada...')"><i class="ri-whatsapp-line"></i> Notificar</button>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            console.error("Erro na unificação de débitos:", err);
            document.getElementById('col-table-body').innerHTML = '<tr><td colspan="6" style="text-align:center; color:red">Erro ao unificar dados. Verifique o console.</td></tr>';
        }
    },

    // --- MAQUINETAS VIEW ---
    renderCards: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2><i class="ri-bank-card-line"></i> Gestão de Maquinetas</h2>
                <button class="btn btn-primary btn-sm" onclick="GestaoLojista.openNewMachineModal()">+ Nova Maquineta</button>
            </div>
            <div class="grid grid-2" style="margin-top:20px; gap:20px;">
                <!-- Lista de Maquinetas -->
                <div class="gl-card">
                    <h4>Maquinetas Cadastradas</h4>
                    <ul id="machine-list" style="list-style:none; padding:0; margin-top:10px;">
                        <li style="padding:10px; text-align:center;">Buscando...</li>
                    </ul>
                </div>

                <!-- Resumo de Taxas -->
                <div class="gl-card">
                    <h4>Resumo de Vendas em Cartão (Hoje)</h4>
                    <div style="margin-top:15px;" id="card-stats-area">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span>Bruto Vendido:</span>
                            <strong id="card-bruto">R$ ...</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#ef4444;">
                            <span>Taxas Médias (2.5%):</span>
                            <strong id="card-taxas">- R$ ...</strong>
                        </div>
                        <hr style="border-color:#334155; margin:10px 0;">
                        <div style="display:flex; justify-content:space-between; font-size:1.2rem;">
                            <span>Líquido Estimado:</span>
                            <strong style="color:#10b981;" id="card-liquido">R$ ...</strong>
                        </div>
                        <p class="text-xs text-muted" style="margin-top:10px;">* Valores estimados baseados no volume do dia.</p>
                    </div>
                </div>
            </div>
        `;

        // Busca Maquinetas
        const { data: machines } = await _sb.from('card_machines').select('*').eq('store_id', App.state.storeId);
        const list = document.getElementById('machine-list');
        if (!machines || machines.length === 0) {
            list.innerHTML = '<li style="padding:20px; text-align:center; color:#64748b;">Nenhuma maquineta cadastrada.</li>';
        } else {
            list.innerHTML = machines.map(m => `
                <li style="padding:12px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="color:white;">${m.nome}</strong>
                        <br><small style="color:#64748b;">Débito: ${m.taxas?.debito || '??'}% | Crédito: ${m.taxas?.credito_vista || '??'}%</small>
                    </div>
                    <button class="btn btn-xs btn-danger" style="padding:4px;" onclick="GestaoLojista.deleteMachine('${m.id}')">✕</button>
                </li>
            `).join('');
        }

        // Calcula Dashboard Cartões
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: sales } = await _sb.from('orders')
                .select('total_pago, payments_info')
                .eq('store_id', App.state.storeId)
                .eq('status', 'concluido')
                .gte('created_at', today);

            let totalCartao = 0;
            if (sales) {
                sales.forEach(s => {
                    if (s.payments_info) {
                        s.payments_info.forEach(p => {
                            if (p.tipo && (p.tipo.toLowerCase().includes('cartao') || p.tipo.toLowerCase().includes('debito') || p.tipo.toLowerCase().includes('credito'))) {
                                totalCartao += p.valor;
                            }
                        });
                    }
                });
            }

            const taxas = totalCartao * 0.025; // Média de 2.5%
            document.getElementById('card-bruto').innerText = `R$ ${totalCartao.toFixed(2)}`;
            document.getElementById('card-taxas').innerText = `- R$ ${taxas.toFixed(2)}`;
            document.getElementById('card-liquido').innerText = `R$ ${(totalCartao - taxas).toFixed(2)}`;
        } catch (e) {}
    },

    openNewMachineModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; border-radius:20px;">
                <h3>Nova Maquineta</h3>
                <div class="input-wrapper">
                    <label>Nome (Identificação)</label>
                    <input id="mach-name" class="input-field" placeholder="Ex: Stone Balcão">
                </div>
                <div class="grid grid-2" style="gap:10px;">
                    <div class="input-wrapper">
                        <label>Taxa Débito (%)</label>
                        <input id="mach-tax-deb" type="number" step="0.01" class="input-field" value="1.99">
                    </div>
                    <div class="input-wrapper">
                        <label>Taxa Crédito (%)</label>
                        <input id="mach-tax-cred" type="number" step="0.01" class="input-field" value="3.49">
                    </div>
                </div>
                <button class="btn btn-primary btn-full" onclick="GestaoLojista.saveMachine(this)">Salvar</button>
                <button class="btn btn-secondary btn-full" style="margin-top:10px" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            </div>
        `;
        document.body.appendChild(modal);
    },

    saveMachine: async (btn) => {
        const nome = document.getElementById('mach-name').value.trim();
        const debito = parseFloat(document.getElementById('mach-tax-deb').value);
        const credito = parseFloat(document.getElementById('mach-tax-cred').value);

        if (!nome) return alert("Dê um nome para a maquineta.");

        btn.disabled = true;
        const { error } = await _sb.from('card_machines').insert({
            store_id: App.state.storeId,
            nome: nome,
            taxas: { debito, credito_vista: credito },
            status: 'ativa'
        });

        if (error) alert("Erro: " + error.message);
        else {
            alert("Maquineta salva!");
            document.querySelector('.modal-overlay').remove();
            GestaoLojista.renderCards();
        }
    },

    deleteMachine: async (id) => {
        if (!confirm("Excluir esta maquineta?")) return;
        const { error } = await _sb.from('card_machines').delete().eq('id', id);
        if (!error) GestaoLojista.renderCards();
    },

    // --- ROBÔ DE ESTOQUE VIEW ---
    renderStockRobot: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `<div style="padding:40px; text-align:center;"><i class="ri-loader-4-line ri-spin" style="font-size:2rem;"></i><p>Analisando estoque...</p></div>`;

        // 1. Busca produtos com estoque baixo ou parados
        const { data: prods } = await _sb.from('products')
            .select('*')
            .eq('store_id', App.state.storeId)
            .order('estoque', { ascending: true });

        const lowStock = prods ? prods.filter(p => p.estoque <= 3) : []; // Assumindo 3 como mínimo genérico
        const noSales = prods ? prods.filter(p => (p.estoque > 0 && p.created_at < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())) : [];

        area.innerHTML = `
            <h2><i class="ri-archive-line"></i> Robô de Estoque</h2>
            
            <div class="gl-card" style="border-left: 4px solid #ef4444; margin-top:20px;">
                <h4>🚨 Reposição Crítica</h4>
                <p class="text-xs text-muted">Itens com estoque abaixo de 3 unidades.</p>
                 <table class="collections-table" style="margin-top:15px;">
                    <thead><tr><th>Produto</th><th>Estoque Atual</th><th>Preço</th><th>Ação</th></tr></thead>
                    <tbody>
                        ${lowStock.length > 0 ? lowStock.map(p => `
                            <tr>
                                <td>${p.nome}</td>
                                <td><span class="text-danger" style="font-weight:800;">${p.estoque}</span></td>
                                <td>R$ ${p.preco.toFixed(2)}</td>
                                <td><button class="btn btn-xs btn-secondary" onclick="App.router.go('produtos')">Editar</button></td>
                            </tr>
                        `).join('') : '<tr><td colspan="4" style="text-align:center;">Estoque saudável.</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="gl-card" style="border-left: 4px solid #f59e0b; margin-top:20px;">
                <h4>📦 Produtos sem Saída (30+ Dias)</h4>
                <p class="text-xs text-muted">Gire seu capital parado.</p>
                <table class="collections-table" style="margin-top:15px;">
                    <thead><tr><th>Produto</th><th>Estoque</th><th>Valor Parado</th><th>Sugestão</th></tr></thead>
                    <tbody>
                        ${noSales.length > 0 ? noSales.slice(0, 5).map(p => `
                            <tr>
                                <td>${p.nome}</td>
                                <td>${p.estoque}</td>
                                <td>R$ ${(p.estoque * p.preco).toFixed(2)}</td>
                                <td><button class="btn btn-xs btn-primary" onclick="alert('Funcionalidade de promoção expressa em breve!')">Promoção</button></td>
                            </tr>
                        `).join('') : '<tr><td colspan="4" style="text-align:center;">Nenhum produto parado crítico.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    },
    // --- CREDIÁRIO VIEW ---
    renderCrediario: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2><i class="ri-calendar-todo-line"></i> Relatório de Crediário</h2>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-secondary btn-sm" onclick="GestaoLojista.renderCrediario()">🔄 Atualizar</button>
                </div>
            </div>
            
            <div class="gl-card">
                <table class="collections-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Parcela</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="crediario-table-body">
                        <tr><td colspan="6" style="text-align:center; padding:20px;">🎬 Carregando parcelas...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        const { data: installments, error } = await _sb.from('crediario_installments')
            .select('*, profiles:customer_id(nome_completo, whatsapp)')
            .eq('store_id', App.state.storeId)
            .order('due_date', { ascending: true });

        const tbody = document.getElementById('crediario-table-body');
        if (error || !installments || installments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">📭 Nenhuma parcela de crediário encontrada.</td></tr>';
            return;
        }

        tbody.innerHTML = installments.map(i => {
            const venc = new Date(i.due_date + 'T12:00:00');
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            
            let status = i.status === 'pago' ? 'Pago' : (venc < hoje ? 'Atrasado' : 'Pendente');
            let badgeClass = i.status === 'pago' ? 'status-pago' : (venc < hoje ? 'status-atrasado' : 'status-pendente');

            return `
                <tr style="opacity: ${i.status === 'pago' ? '0.6' : '1'}">
                    <td>
                        <strong style="color:white;">${i.profiles?.nome_completo || 'N/A'}</strong>
                        <br><small style="color:#64748b;">${i.profiles?.whatsapp || ''}</small>
                    </td>
                    <td style="color:#cbd5e1;">#${i.installment_number}</td>
                    <td style="color:var(--success); font-weight:bold;">R$ ${parseFloat(i.amount).toFixed(2)}</td>
                    <td style="color:#cbd5e1;">${venc.toLocaleDateString('pt-BR')}</td>
                    <td><span class="status-badge ${badgeClass}">${status}</span></td>
                    <td>
                        ${i.status === 'pendente' ? `
                            <button class="btn btn-sm" style="background:#10b981; color:white; padding:4px 8px; font-size:0.75rem;" 
                                onclick="GestaoLojista.markInstallmentAsPaid('${i.id}', this)">
                                ✅ Baixar
                            </button>
                        ` : '<span style="color:#64748b; font-size:0.75rem;">Liquidados</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    },

    markInstallmentAsPaid: async (id, btn) => {
        if (!confirm("Confirmar o recebimento desta parcela?")) return;
        
        btn.disabled = true;
        btn.innerText = "Processando...";
        
        const { error } = await _sb.from('crediario_installments')
            .update({ status: 'pago', paid_at: new Date().toISOString() })
            .eq('id', id);
        
        if (error) {
            alert("Erro ao dar baixa.");
            btn.disabled = false;
            btn.innerText = "✅ Baixar";
        } else {
            alert("Baixa realizada com sucesso!");
            GestaoLojista.renderCrediario();
        }
    }
};

console.log("✅ API Gestão Lojista Carregada");

// Inicialização Automática após carregamento do DOM (com delay de segurança)
setTimeout(() => {
    if (typeof GestaoLojista !== 'undefined') {
        GestaoLojista.init();
    }
}, 1000);
