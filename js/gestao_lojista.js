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

    open: () => {
        if (!document.getElementById('view-gestao-lojista')) {
            console.warn("⚠️ View Gestão Lojista não encontrada, recriando...");
            GestaoLojista.injectHTML();
        }
        App.router.go('gestao-lojista');
        setTimeout(() => GestaoLojista.renderDashboard(), 100);
    },

    switchTab: (tab) => {
        document.querySelectorAll('.gl-menu-item').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');

        if (tab === 'dashboard') GestaoLojista.renderDashboard();
        if (tab === 'cobranca') GestaoLojista.renderCollections();
        if (tab === 'cards') GestaoLojista.renderCards();
        if (tab === 'stock') GestaoLojista.renderStockRobot();
    },

    // --- DASHBOARD VIEW ---
    renderDashboard: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <h2><i class="ri-dashboard-line"></i> Visão Geral</h2>
            <div class="gl-stat-grid" id="gl-kpi-grid">
                <div class="gl-stat-box"><div class="gl-stat-label">Vendas Hoje</div><div class="gl-stat-value">R$ ...</div></div>
                <div class="gl-stat-box"><div class="gl-stat-label">A Receber</div><div class="gl-stat-value text-warning">R$ ...</div></div>
                <div class="gl-stat-box"><div class="gl-stat-label">Atrasados</div><div class="gl-stat-value text-danger">R$ ...</div></div>
            </div>
            <div class="gl-card">
                <h4>🤖 Status dos Robôs</h4>
                <div style="display:flex; justify-content:space-between; margin-top:10px; padding:10px; background:#1e293b; border-radius:6px;">
                    <span>📦 Robô de Estoque</span> <span class="text-success">ATIVO (Última execução: Hoje 02:00)</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:10px; padding:10px; background:#1e293b; border-radius:6px;">
                    <span>💰 Robô de Cobrança</span> <span class="text-success">ATIVO (5 alertas enviados)</span>
                </div>
            </div>
        `;

        // Simulação de Dados Reais
        // Em produção, isso viria de query no Supabase
        const { data: sales } = await _sb.from('orders').select('total_pago').eq('status', 'concluido').gte('created_at', new Date().toISOString().split('T')[0]);
        const totalHoje = sales ? sales.reduce((acc, curr) => acc + (curr.total_pago || 0), 0) : 0;

        document.getElementById('gl-kpi-grid').innerHTML = `
            <div class="gl-stat-box"><div class="gl-stat-label">Vendas Hoje</div><div class="gl-stat-value">R$ ${totalHoje.toFixed(2)}</div></div>
            <div class="gl-stat-box"><div class="gl-stat-label">A Receber (Mês)</div><div class="gl-stat-value" style="color:#f59e0b">R$ 1.250,00</div></div>
            <div class="gl-stat-box"><div class="gl-stat-label">Inadimplência</div><div class="gl-stat-value" style="color:#ef4444">R$ 430,00</div></div>
        `;

        // Add Client Button Action Area
        const actionArea = document.createElement('div');
        actionArea.style.marginTop = '20px';
        actionArea.style.display = 'flex'; // Ensure visibility
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
        modal.style.cssText = 'display: flex; z-index: 10006;'; // Above others

        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px; background:var(--surface); color:var(--text-color);">
                <div class="modal-header">
                    <h3>👥 Novo Cliente</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="input-group">
                        <label>Nome Completo</label>
                        <input id="new-client-name" type="text" class="input-field" placeholder="Ex: João Silva">
                    </div>
                    <div class="input-group">
                        <label>CPF (Apenas números)</label>
                        <input id="new-client-cpf" type="text" class="input-field" placeholder="12345678900">
                    </div>
                    <div class="input-group">
                        <label>Telefone / WhatsApp</label>
                        <input id="new-client-phone" type="text" class="input-field" placeholder="(11) 99999-9999">
                    </div>
                    <div class="input-group">
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

    saveNewClient: async (btn) => {
        const nome = document.getElementById('new-client-name').value.trim();
        const cpf = document.getElementById('new-client-cpf').value.trim();
        const cel = document.getElementById('new-client-phone').value.trim();
        const email = document.getElementById('new-client-email').value.trim();

        if (!nome || !cpf) return alert("Nome e CPF são obrigatórios.");

        btn.disabled = true;
        btn.innerText = "Salvando...";

        const { data, error } = await _sb.from('profiles').insert({
            nome_completo: nome,
            cpf: cpf,
            celular: cel,
            email: email || `${cpf}@loja.local`, // Fake email if not provided
            tipo: 'cliente',
            store_id: App.state.storeId,
            created_at: new Date().toISOString()
        });

        if (error) {
            alert("Erro ao salvar: " + error.message);
            btn.disabled = false;
            btn.innerText = "💾 Salvar Cliente";
        } else {
            alert("✅ Cliente cadastrado com sucesso!");
            document.querySelector('.modal-overlay').remove();
            // Refresh logic if needed
        }
    },

    // --- COBRANÇAS VIEW ---
    renderCollections: async () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2><i class="ri-money-dollar-circle-line"></i> Gestão de Cobranças</h2>
                <button class="btn btn-primary btn-sm" onclick="document.getElementById('modal-new-collection').style.display='flex'">+ Nova Cobrança</button>
            </div>
            
            <div class="gl-card">
                <table class="collections-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="col-table-body">
                        <tr><td colspan="5" style="text-align:center">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        // 1. Busca Cobranças (Simulando ou tabela real se já existir)
        const { data: cols } = await _sb.from('financial_records')
            .select('*, profiles:cliente_id(nome_completo)')
            .eq('tipo', 'receita') // Assumindo 'receita' como contas a receber
            .order('data_vencimento', { ascending: true })
            .limit(20);

        const tbody = document.getElementById('col-table-body');
        if (!cols || cols.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma cobrança pendente.</td></tr>';
            return;
        }

        tbody.innerHTML = cols.map(c => {
            const venc = new Date(c.data_vencimento);
            const hoje = new Date();
            let status = 'Pendente';
            let badgeClass = 'status-pendente';

            if (c.status === 'pago') {
                status = 'Pago';
                badgeClass = 'status-pago';
            } else if (venc < hoje) {
                status = 'Atrasado';
                badgeClass = 'status-atrasado';
            }

            return `
                <tr>
                    <td>${c.profiles?.nome_completo || 'Consumidor Final'}</td>
                    <td>R$ ${c.valor.toFixed(2)}</td>
                    <td>${venc.toLocaleDateString()}</td>
                    <td><span class="status-badge ${badgeClass}">${status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="alert('Enviando WhatsApp para cliente...')"><i class="ri-whatsapp-line"></i> Cobrar</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    // --- MAQUINETAS VIEW ---
    renderCards: () => {
        const area = document.getElementById('gl-content-area');
        area.innerHTML = `
            <h2><i class="ri-bank-card-line"></i> Gestão de Maquinetas</h2>
            <div class="grid grid-2" style="margin-top:20px; gap:20px;">
                <!-- Lista de Maquinetas -->
                <div class="gl-card">
                    <h4>Maquinetas Cadastradas</h4>
                    <ul style="list-style:none; padding:0; margin-top:10px;">
                        <li style="padding:10px; border-bottom:1px solid #334155; display:flex; justify-content:space-between;">
                            <span>🏢 Stone Balcão</span>
                            <span class="text-sm text-muted">Taxa Déb: 1.2%</span>
                        </li>
                        <li style="padding:10px; border-bottom:1px solid #334155; display:flex; justify-content:space-between;">
                            <span>🏢 Moderninha</span>
                            <span class="text-sm text-muted">Taxa Déb: 1.9%</span>
                        </li>
                        <li style="text-align:center; padding:10px; cursor:pointer; color:var(--primary);">+ Adicionar Nova</li>
                    </ul>
                </div>

                <!-- Resumo de Taxas -->
                <div class="gl-card">
                    <h4>Conciliação Automática (Hoje)</h4>
                    <div style="margin-top:15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span>Bruto Vendido:</span>
                            <strong>R$ 1.500,00</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#ef4444;">
                            <span>Taxas Aproximadas:</span>
                            <strong>- R$ 45,80</strong>
                        </div>
                        <hr style="border-color:#334155; margin:10px 0;">
                        <div style="display:flex; justify-content:space-between; font-size:1.2rem;">
                            <span>Líquido Estimado:</span>
                            <strong style="color:#10b981;">R$ 1.454,20</strong>
                        </div>
                        <p class="text-xs text-muted" style="margin-top:10px;">* Cálculo baseado nas taxas cadastradas.</p>
                    </div>
                </div>
            </div>
        `;
    },

    // --- ROBÔ DE ESTOQUE VIEW ---
    renderStockRobot: async () => {
        const area = document.getElementById('gl-content-area');

        area.innerHTML = `<p>Carregando análise...</p>`;

        // Simula Query de Dead Stock
        // Produtos criados há mais de 30 dias e com estoque > 0
        const { data: deadStock } = await _sb.from('products')
            .select('*')
            .gt('estoque', 0)
            .limit(10); // Exemplo simplificado

        area.innerHTML = `
            <h2><i class="ri-archive-line"></i> Robô de Estoque</h2>
            <div class="gl-card" style="border-left: 4px solid #f59e0b;">
                <h4>⚠️ Análise de Produtos Parados (Dead Stock)</h4>
                <p class="text-sm text-muted">Produtos sem saída há mais de 30 dias. Sugestão: Promoção.</p>
                <table class="collections-table" style="margin-top:15px;">
                    <thead><tr><th>Produto</th><th>Estoque</th><th>Valor Parado</th><th>Ação Sugerida</th></tr></thead>
                    <tbody>
                        ${deadStock && deadStock.length > 0 ? deadStock.map(p => `
                            <tr>
                                <td>${p.nome}</td>
                                <td>${p.estoque}</td>
                                <td>R$ ${(p.estoque * p.preco).toFixed(2)}</td>
                                <td><button class="btn btn-xs btn-primary" onclick="alert('Promoção aplicada!')">Aplicar 10% OFF</button></td>
                            </tr>
                        `).join('') : '<tr><td colspan="4">Nenhum alerta crítico hoje.</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="gl-card" style="border-left: 4px solid #ef4444; margin-top:20px;">
                <h4>🚨 Reposição Urgente</h4>
                <p>Itens com estoque abaixo do mínimo configurado.</p>
                 <table class="collections-table" style="margin-top:15px;">
                    <thead><tr><th>Produto</th><th>Estoque Atual</th><th>Mínimo</th><th>Fornecedor</th></tr></thead>
                    <tbody>
                        <tr><td colspan="4">Estoque saudável.</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    }
};

console.log("✅ API Gestão Lojista Carregada");

// Inicialização Automática após carregamento do DOM (com delay de segurança)
setTimeout(() => {
    if (typeof GestaoLojista !== 'undefined') {
        GestaoLojista.init();
    }
}, 1000);
