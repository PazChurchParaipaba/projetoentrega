// 💰 MÓDULO CAIXA INTEGRADO (VERSÃO FINAL COMPLETA + DETALHAMENTO + REABERTURA)
const Caixa = {
    state: {
        session: null,
        sessions: [],
        movements: [],
        // 🔥 SEPARAÇÃO CLARA E DETALHADA
        vendasHoje: 0,
        qtdVendas: 0,
        entradasAnteriores: 0,
        totalDespesas: 0,
        breakdownVendas: { dinheiro: 0, pix: 0, credito: 0, debito: 0 },
        breakdownAnteriores: { dinheiro: 0, pix: 0, credito: 0, debito: 0 },
        breakdownDespesas: { dinheiro: 0, pix: 0, credito: 0, debito: 0 }
    },

    init: async () => {
        console.log("💰 Módulo Caixa Iniciado V3 - Detalhado");
        Caixa.checkSession();
        Caixa.injectStyles();
    },

    injectStyles: () => {
        const style = document.createElement('style');
        style.innerHTML = `
            /* --- 1. ESTILOS DE IMPRESSÃO TÉRMICA (OTIMIZADO) --- */
            .thermal-print { display: none; }
            
            @media print { 
                body * { visibility: hidden; height: 0; overflow: hidden; } 
                .thermal-print, .thermal-print * { 
                    visibility: visible; 
                    display: block; 
                    height: auto; 
                }
                .thermal-print { 
                    position: absolute; 
                    left: 0; 
                    top: 0; 
                    width: 100%; 
                    margin: 0; 
                    padding: 0; 
                    background: white; 
                    color: black !important;
                    font-weight: 900 !important; 
                    filter: contrast(200%) grayscale(100%);
                    -webkit-print-color-adjust: exact;
                }
                .thermal-print hr, .thermal-print div {
                    border-color: #000 !important;
                }
                @page { margin: 0; size: auto; }
            }

            /* --- 2. ESTILOS DA TELA (DARK MODE) --- */
            .caixa-panel { 
                background: var(--surface) !important; 
                color: var(--text-main) !important;     
                padding: 20px; 
                border-radius: 12px; 
                max-width: 800px; 
                margin: 20px auto; 
                box-shadow: var(--shadow-lg);
                border: 1px solid var(--border);
            }
            
            .stat-box { 
                background: rgba(15, 23, 42, 0.6) !important;
                padding: 15px; 
                border-radius: 8px; 
                border: 1px solid var(--border); 
                text-align: center; 
            }
            
            .stat-box h5 {
                color: var(--text-muted);
                font-size: 0.9rem;
                margin-bottom: 5px;
            }
            
            .stat-val { 
                font-size: 1.5rem; 
                font-weight: bold; 
                color: var(--primary); 
            }

            .movement-item:hover {
                background: rgba(255,255,255,0.05);
            }

            .tabs-caixa { 
                display: flex; 
                gap: 15px; 
                margin-bottom: 15px; 
                border-bottom: 1px solid var(--border); 
                padding-bottom: 5px; 
            }
            .tab-btn { 
                background: none; 
                border: none; 
                color: var(--text-muted); 
                cursor: pointer; 
                padding: 8px 12px; 
                font-weight: bold; 
                font-size: 0.9rem;
                transition: 0.3s;
            }
            .tab-btn.active { 
                color: var(--primary); 
                border-bottom: 2px solid var(--primary); 
            }
            .btn-icon {
                background: none;
                border: none;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: 0.2s;
            }
            .btn-icon:hover {
                background: rgba(255,255,255,0.1);
            }
        `;
        document.head.appendChild(style);
    },

    checkSession: async () => {
        const { data } = await _sb.from('cash_sessions')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('status', 'aberto')
            .order('created_at', { ascending: false });

        Caixa.state.sessions = data || [];

        // 🔥 RECUPERA SESSÃO ATIVA DESTE DISPOSITIVO (LOCALSTORAGE)
        const savedId = localStorage.getItem('active_cash_session');
        if (savedId) {
            const exists = Caixa.state.sessions.find(s => s.id == savedId);
            if (exists) { Caixa.state.session = exists; return Caixa.state.sessions; }
            else localStorage.removeItem('active_cash_session'); // Sessão fechada remotamente
        }

        Caixa.state.session = null;

        // 🔥 SE HÁ MÚLTIPLOS CAIXAS ABERTOS, PERGUNTA QUAL USAR NESTE COMPUTADOR
        if (Caixa.state.sessions.length > 1) {
            await Caixa.promptSelectSession();
        } else if (Caixa.state.sessions.length === 1) {
            // Só um caixa aberto: assume automaticamente
            Caixa.state.session = Caixa.state.sessions[0];
            localStorage.setItem('active_cash_session', Caixa.state.sessions[0].id);
        }

        return Caixa.state.sessions;
    },

    // 🔥 PROMPT VISUAL DE SELEÇÃO DE CAIXA POR COMPUTADOR
    promptSelectSession: () => new Promise(resolve => {
        const sessions = Caixa.state.sessions;
        const existing = document.getElementById('caixa-select-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'caixa-select-modal';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center; z-index:99999;';
        modal.innerHTML = `
            <div style="background:#1e293b; border:2px solid #3b82f6; border-radius:20px; padding:30px; max-width:480px; width:90%; color:#f1f5f9; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.6);">
                <div style="font-size:3rem; margin-bottom:10px;">💰</div>
                <h2 style="margin:0 0 8px; color:#3b82f6;">Identificar Este Terminal</h2>
                <p style="color:#94a3b8; margin-bottom:24px; font-size:0.95rem;">
                    Há <strong style="color:#f1f5f9;">${sessions.length} caixas abertos</strong>. Selecione qual caixa pertence a <strong style="color:#f1f5f9;">este computador</strong>:
                </p>
                <div style="display:grid; gap:12px; margin-bottom:20px;">
                    ${sessions.map(s => `
                        <button onclick="Caixa._doSelectSession('${s.id}')" style="
                            background:linear-gradient(135deg,#1d4ed8,#2563eb);
                            border:none; border-radius:12px; color:white;
                            padding:16px 20px; cursor:pointer; text-align:left;
                            display:flex; justify-content:space-between; align-items:center;
                            font-size:1rem; font-weight:600; transition:transform 0.15s;
                            box-shadow:0 4px 12px rgba(37,99,235,0.4);"
                            onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <span>🖥️ ${s.nome || 'Caixa #' + s.id}</span>
                            <span style="font-size:0.8rem; opacity:0.8;">Aberto: ${new Date(s.abertura || s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </button>
                    `).join('')}
                </div>
                <p style="font-size:0.8rem; color:#64748b;">Esta escolha fica salva neste dispositivo até o caixa ser fechado.</p>
            </div>`;
        document.body.appendChild(modal);

        Caixa._doSelectSession = (id) => {
            const s = Caixa.state.sessions.find(x => x.id == id);
            if (s) {
                Caixa.state.session = s;
                localStorage.setItem('active_cash_session', s.id);
            }
            modal.remove();
            resolve();
        };
    }),

    openView: async () => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

        let section = document.getElementById('view-caixa');
        if (!section) {
            section = document.createElement('section');
            section.id = 'view-caixa';
            section.className = 'view-section container';
            document.querySelector('main').appendChild(section);

            // Adiciona a area de ticket persistentemente no final da main
            if (!document.getElementById('ticket-area')) {
                const ticket = document.createElement('div');
                ticket.id = 'ticket-area';
                ticket.className = 'thermal-print';
                document.body.appendChild(ticket);
            }
        }
        section.classList.add('active');

        await Caixa.checkSession();
        Caixa.render();
    },

    render: async () => {
        const container = document.getElementById('view-caixa');
        const session = Caixa.state.session;

        if (!session) {
            Caixa.renderDashboard(container);
            return;
        }

        await Caixa.calcTotals();

        const st = Caixa.state;

        container.innerHTML = `
            <div class="caixa-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;">
                    <div>
                        <h2 style="margin:0;">${session.nome || 'Frente de Caixa'} <span style="font-size:0.8rem; opacity:0.5">#${session.id}</span></h2>
                        <span class="badge status-concluido">Aberto em: ${new Date(session.abertura || session.created_at).toLocaleString()}</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-outline-secondary btn-sm" onclick="Caixa.exitSession()" title="Trocar Caixa"><i class="ri-arrow-left-right-line"></i></button>
                        <button class="btn btn-secondary btn-sm" onclick="App.router.go('loja')">Voltar</button>
                    </div>
                </div>

                <div class="grid grid-3">
                    <div class="stat-box">
                        <h5>Fundo Inicial</h5>
                        <div class="stat-val" style="color:#64748b; display:flex; justify-content:center; align-items:center; gap:8px;">
                            <span>R$ ${session.valor_inicial.toFixed(2)}</span>
                            <button class="btn-icon" onclick="Caixa.editFundoInicial()" title="Editar Fundo Inicial" style="padding:0; margin:0;"><i class="ri-edit-line" style="font-size:1.1rem; color:var(--primary);"></i></button>
                        </div>
                    </div>
                    <div class="stat-box">
                        <h5>Vendas do Dia</h5>
                        <div class="stat-val" style="color:#10b981;">R$ ${st.vendasHoje.toFixed(2)}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:5px;">
                            <i class="ri-bill-line"></i> ${st.qtdVendas} Pagamentos<br>
                            💵 ${st.breakdownVendas.dinheiro.toFixed(2)} | 
                            💠 ${st.breakdownVendas.pix.toFixed(2)}<br>
                            💳 ${(st.breakdownVendas.credito + st.breakdownVendas.debito).toFixed(2)}
                        </div>
                    </div>
                    <div class="stat-box">
                        <h5>Entradas Anteriores</h5>
                        <div class="stat-val" style="color:#3b82f6;">R$ ${st.entradasAnteriores.toFixed(2)}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:5px;">
                            💵 ${st.breakdownAnteriores.dinheiro.toFixed(2)} | 
                            💠 ${st.breakdownAnteriores.pix.toFixed(2)}
                        </div>
                    </div>
                </div>

                <div style="margin-top:25px; background: rgba(0,0,0,0.1); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
                    <div class="tabs-caixa">
                        <button class="tab-btn active" onclick="Caixa.switchTab('despesa', this)">Lançar Despesa</button>
                        <button class="tab-btn" onclick="Caixa.switchTab('entrada', this)">Lançar Entrada Manual</button>
                    </div>

                    <h4 id="mov-title" style="margin-top:0;">Lançar Despesa / Sangria</h4>
                    <input type="hidden" id="mov-id">
                    <input type="hidden" id="mov-type" value="despesa">
                    
                    <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap: wrap;">
                        <div class="input-wrapper" style="flex:2; min-width: 200px; margin:0;">
                            <label class="text-xs">Descrição</label>
                            <input type="text" id="mov-desc" class="input-field" placeholder="Ex: Material Limpeza">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width: 100px; margin:0;">
                            <label class="text-xs">Valor</label>
                            <input type="number" id="mov-val" class="input-field">
                        </div>
                        <div id="method-select-container" class="input-wrapper" style="flex:1; min-width: 130px; margin:0; display:none;">
                            <label class="text-xs">Método</label>
                            <select id="mov-method" class="input-field">
                                <option value="dinheiro">Dinheiro</option>
                                <option value="pix">Pix</option>
                                <option value="credito">Crédito</option>
                                <option value="debito">Débito</option>
                            </select>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button id="btn-save-mov" class="btn btn-warning btn-sm" onclick="Caixa.saveMovement()">Lançar</button>
                            <button id="btn-cancel-mov" class="btn btn-secondary btn-sm" style="display:none;" onclick="Caixa.cancelEdit()">Cancelar</button>
                        </div>
                    </div>
                    <div id="movements-list" style="margin-top:15px; max-height:200px; overflow-y:auto; border:1px dashed #e2e8f0; padding:10px; border-radius: 8px;"></div>
                </div>

                <div style="margin-top:30px; border-top:2px dashed #cbd5e1; padding-top:20px;">
                    <h4>Fechamento do Dia</h4>
                    
                    <div class="stat-box" style="margin-bottom:15px; background: rgba(239, 68, 68, 0.1) !important;">
                        <h5>Total Despesas</h5>
                        <div class="stat-val" style="color:#ef4444;">R$ ${st.totalDespesas.toFixed(2)}</div>
                        <div style="font-size:0.75rem; color:#64748b; margin-top:5px;">
                            💵 ${st.breakdownDespesas.dinheiro.toFixed(2)} | 
                            Outros ${(st.totalDespesas - st.breakdownDespesas.dinheiro).toFixed(2)}
                        </div>
                    </div>

                    <div class="input-wrapper">
                        <label>Valor em Gaveta (Contagem Física)</label>
                        <input type="number" id="caixa-end-val" class="input-field" placeholder="Quanto tem de dinheiro?">
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-primary" onclick="Caixa.printParcial()"><i class="ri-printer-line"></i> Imprimir Parcial</button>
                        <button class="btn btn-danger" onclick="Caixa.closeSession()"><i class="ri-lock-2-line"></i> Fechar Caixa</button>
                    </div>
                </div>
            </div>
        `;
        Caixa.loadMovements();
    },

    renderDashboard: (container) => {
        const sessions = Caixa.state.sessions || [];
        let listHtml = '';

        if (sessions.length > 0) {
            listHtml = `
                <div style="margin-bottom:30px; text-align:left;">
                    <h4 style="border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">Caixas Abertos</h4>
                    <div class="grid grid-2" style="gap:15px;">
                        ${sessions.map(s => `
                            <div class="stat-box" style="display:flex; justify-content:space-between; align-items:center; border-left: 4px solid #10b981; text-align:left;">
                                <div>
                                    <div style="font-weight:bold; font-size:1.1rem;">${s.nome || 'Caixa #' + s.id}</div>
                                    <div style="font-size:0.8rem; color:#64748b;">Aberto: ${new Date(s.abertura || s.created_at).toLocaleString()}</div>
                                    <div style="font-size:0.8rem; color:#94a3b8;">Fundo: R$ ${s.valor_inicial.toFixed(2)}</div>
                                </div>
                                <button class="btn btn-primary btn-sm" onclick="Caixa.selectSession('${s.id}')">Acessar</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="caixa-panel" style="text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2 style="margin:0;">Gerenciamento de Caixas</h2>
                    <button class="btn btn-secondary btn-sm" onclick="App.router.go('loja')">Voltar</button>
                </div>

                ${listHtml}

                <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:12px; border:1px dashed #475569; margin-top:20px;">
                    <i class="ri-safe-2-line" style="font-size: 3rem; color: #64748b;"></i>
                    <h3>Abrir Novo Caixa</h3>
                    <p style="color:#64748b; font-size:0.9rem;">Inicie um novo turno de vendas.</p>
                    
                    <div class="input-wrapper" style="max-width:300px; margin: 10px auto;">
                        <label>Identificação (Ex: Caixa 1 - Maria)</label>
                        <input type="text" id="caixa-name" class="input-field" placeholder="Nome do Caixa / Operador">
                    </div>

                    <div class="input-wrapper" style="max-width:300px; margin: 10px auto 20px auto;">
                        <label>Fundo de Troco (Valor Inicial)</label>
                        <input type="number" id="caixa-start-val" class="input-field" value="0.00">
                    </div>
                    
                    <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                        <button class="btn btn-success" onclick="Caixa.startSession()">Abrir Novo Caixa</button>
                        <button class="btn btn-warning" onclick="Caixa.reopenLastSession()"><i class="ri-restart-line"></i> Reabrir Último Fechado</button>
                        <button class="btn btn-secondary" onclick="RelatoriosEnterprise.historicoCaixas()"><i class="ri-history-line"></i> Ver Fechamentos Anteriores</button>
                    </div>
                </div>
            </div>
        `;
    },

    selectSession: (id) => {
        const s = Caixa.state.sessions.find(x => x.id == id);
        if (s) {
            Caixa.state.session = s;
            localStorage.setItem('active_cash_session', s.id);
            Caixa.render();
        }
    },

    exitSession: () => {
        Caixa.state.session = null;
        localStorage.removeItem('active_cash_session');
        Caixa.render();
    },

    switchTab: (type, btn) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('mov-type').value = type;
        document.getElementById('method-select-container').style.display = type === 'entrada' ? 'block' : 'none';
        document.getElementById('mov-title').innerText = type === 'entrada' ? "Lançar Entrada Manual (Dias Anteriores)" : "Lançar Despesa / Sangria";
        document.getElementById('btn-save-mov').className = type === 'entrada' ? 'btn btn-success btn-sm' : 'btn btn-warning btn-sm';
        Caixa.cancelEdit();
    },

    startSession: async () => {
        const val = parseFloat(document.getElementById('caixa-start-val').value) || 0;
        const nome = document.getElementById('caixa-name').value;

        if (!nome) return alert("Por favor, informe um nome para identificar o caixa (Ex: Caixa 01).");

        const { data, error } = await _sb.from('cash_sessions').insert({
            store_id: App.state.storeId,
            user_id: App.state.user.id,
            valor_inicial: val,
            status: 'aberto',
            abertura: new Date().toISOString(),
            nome: nome
        }).select().single();

        if (error) alert("Erro ao abrir: " + error.message);
        else {
            Caixa.state.session = data;
            localStorage.setItem('active_cash_session', data.id);
            await Caixa.checkSession();
            alert("Caixa Aberto!");
            Caixa.render();
        }
    },

    reopenLastSession: async () => {
        if (!confirm("Deseja reabrir a última sessão de caixa fechada?")) return;

        const { data, error } = await _sb.from('cash_sessions')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('status', 'fechado')
            .order('fechamento', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !data) {
            alert("Nenhuma sessão fechada encontrada para reabrir.");
            return;
        }

        const { error: updateError } = await _sb.from('cash_sessions')
            .update({ status: 'aberto', fechamento: null })
            .eq('id', data.id);

        if (updateError) alert("Erro ao reabrir: " + updateError.message);
        else {
            alert("Caixa Reaberto com Sucesso!");
            Caixa.state.session = { ...data, status: 'aberto', fechamento: null };
            localStorage.setItem('active_cash_session', data.id);
            await Caixa.checkSession();
            Caixa.render();
        }
    },

    editFundoInicial: async () => {
        const session = Caixa.state.session;
        if (!session) return App.utils.toast("Sessão de caixa não identificada.", "error");

        const novoValor = await NaxioUI.prompt(
            '💰 Editar Fundo Inicial',
            `Informe o novo valor para o fundo de troco (Atual: R$ ${session.valor_inicial.toFixed(2)}):`,
            session.valor_inicial.toFixed(2),
            "Ex: 150.00",
            'number'
        );

        if (novoValor === null || novoValor === undefined) return;

        const parsedVal = parseFloat(novoValor);
        if (isNaN(parsedVal) || parsedVal < 0) {
            return App.utils.toast("Valor inválido.", "error");
        }

        App.utils.toast("Atualizando fundo inicial...", "info");

        const { error } = await _sb.from('cash_sessions')
            .update({ valor_inicial: parsedVal })
            .eq('id', session.id);

        if (error) {
            console.error("Erro ao editar fundo:", error);
            alert("Erro ao editar: " + error.message);
        } else {
            Caixa.state.session.valor_inicial = parsedVal;
            App.utils.toast("✅ Fundo inicial atualizado!", "success");
            Caixa.render();
        }
    },

    // 🔥 CÁLCULO DE TOTAIS DETALHADO E CORRIGIDO
    calcTotals: async () => {
        if (!Caixa.state.session) return;

        // 1. Busca VENDAS (Orders)
        // 🔥 CORREÇÃO: Busca por session_id OU por intervalo de tempo da sessão se o session_id falhar.
        // Inclui também orders com session_id nulo no período da sessão para evitar perda de dados.
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const sessionInicio = Caixa.state.session.abertura || Caixa.state.session.created_at;
        const inicio = (sessionInicio > startOfDay) ? startOfDay : sessionInicio;
        const fim = Caixa.state.session.fechamento || new Date(Date.now() + 86400000).toISOString();

        let { data: sales, error: salesErr } = await _sb.from('orders')
            .select('*')
            .eq('store_id', App.state.storeId)
            .gte('created_at', inicio)
            .lte('created_at', fim)
            .not('status', 'in', '("cancelado","cancelada","devolvido","devolvida")');

        if (salesErr) {
            console.error("Erro ao buscar vendas do caixa:", salesErr);
            sales = [];
        }

        const { data: moves } = await _sb.from('cash_movements')
            .select('*')
            .gte('created_at', inicio)
            .lte('created_at', fim)
            .or(`session_id.eq.${Caixa.state.session.id},session_id.is.null`);

        // Reset
        const st = Caixa.state;
        st.vendasHoje = 0;
        st.qtdVendas = 0;
        st.entradasAnteriores = 0;
        st.totalDespesas = 0;
        st.breakdownVendas = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };
        st.breakdownAnteriores = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };
        st.breakdownDespesas = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };

        // 🔥 PROCESSA VENDAS (Comandas + PDV)
        if (sales) {
            st.qtdVendas = sales.length;
            sales.forEach(o => {
                let val = parseFloat(o.total_pago || o.total || 0);

                // Tenta pegar detalhe de pagamento (Do JSON ou da Coluna)
                let methods = [];

                // 🔥 PRIORIDADE 0: Formato do Varejo/PDV (obs.pays = [{tipo, val}])
                // O varejo_final.js salva em obs.pays, não em obs.pagamentos
                try {
                    const obs = JSON.parse(o.observacao || '{}');
                    if (obs.pays && Array.isArray(obs.pays) && obs.pays.length > 0) {
                        methods = obs.pays.map(p => ({ tipo: p.tipo, val: p.val, method: p.tipo, amount: p.val }));
                    }
                } catch (e) { }

                // Prioridade 1: JSON na observação — formato comanda (obs.pagamentos)
                if (methods.length === 0) {
                    try {
                        const obs = JSON.parse(o.observacao || '{}');
                        if (obs.pagamentos && Array.isArray(obs.pagamentos)) {
                            methods = obs.pagamentos; // [{tipo, val}]
                        }
                    } catch (e) { }
                }

                // Prioridade 2: Campo fechamento (Comandas podem salvar aqui)
                if (methods.length === 0 && o.fechamento) {
                    try {
                        const fechamento = typeof o.fechamento === 'string' ? JSON.parse(o.fechamento) : o.fechamento;
                        if (Array.isArray(fechamento)) {
                            methods = fechamento; // [{method, amount}]
                        }
                    } catch (e) { }
                }

                // Prioridade 3: Campo payments_info (Comandas V7)
                if (methods.length === 0 && o.payments_info) {
                    try {
                        const payments = typeof o.payments_info === 'string' ? JSON.parse(o.payments_info) : o.payments_info;
                        if (Array.isArray(payments)) {
                            methods = payments; // [{method, amount}]
                        }
                    } catch (e) { }
                }

                // Fallback: Método único (somente quando nenhum formato foi detectado)
                if (methods.length === 0) {
                    const m = o.metodo_pagamento || o.pagamento || 'Dinheiro';
                    if (m.toLowerCase().includes('multi')) {
                        methods.push({ tipo: 'Dinheiro (Múltiplos sem detalhes)', val: val, method: 'Dinheiro (Múltiplos sem detalhes)', amount: val });
                    } else {
                        methods.push({ tipo: m, val: val, method: m, amount: val });
                    }
                }

                // Processa cada método de pagamento
                methods.forEach(p => {
                    const t = (p.tipo || p.method || '').toLowerCase();
                    const c = p.code ? String(p.code).trim() : '';
                    const v = parseFloat(p.val || p.amount || 0);

                    if (v <= 0) return;

                    st.vendasHoje += v;

                    if (t.includes('pix') || c === '17') {
                        st.breakdownVendas.pix += v;
                    } else if (c === '04' || t.includes('débito') || t.includes('debito') || t === 'debit' || t.includes('maestro') || t.includes('electron')) {
                        st.breakdownVendas.debito += v;
                    } else if (
                        c === '03' ||
                        t.includes('crédito') || t.includes('credito') || t === 'credit' || 
                        t.includes('cartão') || t.includes('cartao') || 
                        t.includes('master') || t.includes('visa') || t.includes('elo') || 
                        t.includes('amex') || t.includes('hiper') || t.includes('diners')
                    ) {
                        st.breakdownVendas.credito += v;
                    } else if (t.includes('crediario') || t.includes('crediário')) {
                        // Opcional: Você pode querer criar uma categoria no breakdown para crediário se o cliente pedir
                        // Por ora, vamos manter em 'dinheiro' ou criar uma nova se o st.breakdownVendas suportar
                        if (!st.breakdownVendas.crediario) st.breakdownVendas.crediario = 0;
                        st.breakdownVendas.crediario += v;
                    } else {
                        st.breakdownVendas.dinheiro += v;
                    }
                });
            });
        }

        // 🔥 PROCESSA MOVIMENTAÇÕES (Entradas = Dias Anteriores / Despesas)
        if (moves) {
            moves.forEach(m => {
                const v = parseFloat(m.valor);
                const t = (m.metodo || 'Dinheiro').toLowerCase();

                if (m.tipo === 'entrada') {
                    // 🔥 ENTRADAS DIAS ANTERIORES
                    st.entradasAnteriores += v;
                    if (t.includes('pix')) {
                        st.breakdownAnteriores.pix += v;
                    } else if (t.includes('débito') || t.includes('debit')) {
                        st.breakdownAnteriores.debito += v;
                    } else if (t.includes('crédito') || t.includes('credit') || t.includes('cartão') || t.includes('cartao')) {
                        st.breakdownAnteriores.credito += v;
                    } else {
                        st.breakdownAnteriores.dinheiro += v;
                    }
                } else {
                    // 🔥 DESPESAS DETALHADAS
                    st.totalDespesas += v;
                    if (t.includes('pix')) {
                        st.breakdownDespesas.pix += v;
                    } else if (t.includes('débito') || t.includes('debit')) {
                        st.breakdownDespesas.debito += v;
                    } else if (t.includes('crédito') || t.includes('credit') || t.includes('cartão') || t.includes('cartao')) {
                        st.breakdownDespesas.credito += v;
                    } else {
                        st.breakdownDespesas.dinheiro += v;
                    }
                }
            });
        }
    },

    saveMovement: async () => {
        const id = document.getElementById('mov-id').value;
        const type = document.getElementById('mov-type').value;
        const desc = document.getElementById('mov-desc').value;
        const val = parseFloat(document.getElementById('mov-val').value);
        const method = document.getElementById('mov-method').value;

        if (!desc || !val) return alert("Preencha os campos obrigatórios.");

        const payload = {
            session_id: Caixa.state.session.id,
            tipo: type,
            descricao: desc,
            valor: val,
            metodo: type === 'entrada' ? method : 'dinheiro' // 🔥 Despesas sempre em dinheiro por padrão
        };

        if (id) {
            const { error } = await _sb.from('cash_movements').update(payload).eq('id', id);
            if (error) alert("Erro ao editar: " + error.message);
        } else {
            // 🔥 Otimista: Insere e já atualiza a UI local
            const { data, error } = await _sb.from('cash_movements').insert(payload).select().single();
            if (error) {
                alert("Erro ao lançar: " + error.message);
            } else if (data) {
                // Adiciona ao topo da lista local para feedback instantâneo
                Caixa.state.movements.unshift(data);
            }
        }

        Caixa.cancelEdit();
        // Recarrega do banco em background para garantir sincronia total
        await Caixa.loadMovements(); 
        await Caixa.calcTotals();
        Caixa.render();
    },

    editMovement: (m) => {
        document.getElementById('mov-id').value = m.id;
        document.getElementById('mov-desc').value = m.descricao;
        document.getElementById('mov-val').value = m.valor;
        document.getElementById('mov-type').value = m.tipo;

        if (m.tipo === 'entrada') {
            document.getElementById('mov-method').value = m.metodo || 'dinheiro';
            document.getElementById('method-select-container').style.display = 'block';
            document.getElementById('mov-title').innerText = "Editar Entrada Manual";
            document.getElementById('btn-save-mov').className = 'btn btn-success btn-sm';
        } else {
            document.getElementById('method-select-container').style.display = 'none';
            document.getElementById('mov-title').innerText = "Editar Despesa";
            document.getElementById('btn-save-mov').className = 'btn btn-warning btn-sm';
        }

        document.getElementById('btn-save-mov').innerText = "Atualizar";
        document.getElementById('btn-cancel-mov').style.display = "block";
    },

    cancelEdit: () => {
        const type = document.getElementById('mov-type').value;
        document.getElementById('mov-id').value = "";
        document.getElementById('mov-desc').value = "";
        document.getElementById('mov-val').value = "";
        document.getElementById('mov-title').innerText = type === 'entrada' ? "Lançar Entrada Manual (Dias Anteriores)" : "Lançar Despesa / Sangria";
        document.getElementById('btn-save-mov').innerText = "Lançar";
        document.getElementById('btn-cancel-mov').style.display = "none";
    },

    deleteMovement: async (id) => {
        if (!confirm("Deseja realmente excluir este lançamento?")) return;
        const { error } = await _sb.from('cash_movements').delete().eq('id', id);
        if (error) alert("Erro ao excluir: " + error.message);
        else {
            Caixa.loadMovements();
            Caixa.calcTotals();
            Caixa.render();
        }
    },

    loadMovements: async () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const sessionInicio = Caixa.state.session.abertura || Caixa.state.session.created_at;
        const start = (sessionInicio > startOfDay) ? startOfDay : sessionInicio;
        const fim = Caixa.state.session.fechamento || new Date(Date.now() + 86400000).toISOString();

        const { data } = await _sb.from('cash_movements')
            .select('*')
            .gte('created_at', start)
            .lte('created_at', fim)
            .or(`session_id.eq.${Caixa.state.session.id},session_id.is.null`)
            .order('created_at', { ascending: false });

        Caixa.state.movements = data || [];
        const list = document.getElementById('movements-list');

        if (list) {
            let totalDesp = 0;
            list.innerHTML = data.map(m => {
                const isEntrada = m.tipo === 'entrada';
                if (!isEntrada) totalDesp += m.valor;
                return `<div class="movement-item" style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
                    <div style="flex:1;">
                        <span class="badge ${isEntrada ? 'status-concluido' : 'status-cancelado'}" style="font-size:10px; padding: 2px 5px;">${isEntrada ? 'ENTRADA' : 'DESPESA'}</span>
                        <span style="font-size:0.9rem; margin-left:5px;">${m.descricao} ${isEntrada ? `(${m.metodo})` : ''}</span><br>
                        <strong style="color:${isEntrada ? '#10b981' : '#ef4444'};">${isEntrada ? '+' : '-'}R$ ${m.valor.toFixed(2)}</strong>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-icon" onclick='Caixa.editMovement(${JSON.stringify(m)})' title="Editar"><i class="ri-edit-line" style="color:var(--primary);"></i></button>
                        <button class="btn-icon" onclick="Caixa.deleteMovement('${m.id}')" title="Excluir"><i class="ri-delete-bin-line" style="color:#ef4444;"></i></button>
                    </div>
                </div>`;
            }).join('');

            if (data.length === 0) {
                list.innerHTML = `<div style="text-align:center; color:#64748b; padding:10px;">Nenhum lançamento realizado.</div>`;
            } else {
                list.innerHTML += `<div style="text-align:right; font-weight:bold; margin-top:10px; color:#ef4444;">Total Despesas: R$ ${totalDesp.toFixed(2)}</div>`;
            }
        }
    },

    // 🔥 FECHAMENTO OTIMIZADO (SEM TRAVAMENTOS)
    closeSession: async () => {
        if (!await NaxioUI.confirm("🏦 Fechar Caixa", "Confirma o fechamento definitivo do caixa? Esta ação não pode ser desfeita.")) return;

        App.utils.toast("Calculando totais e processando...", "info");

        try {
            // 1. Recalcula tudo uma última vez
            await Caixa.calcTotals();

            const contado = parseFloat(document.getElementById('caixa-end-val').value) || 0;
            const st = Caixa.state;
            const fundo = st.session.valor_inicial;
            const dataFechamento = new Date();

            // 🔥 ESPERADO NA GAVETA
            const esperadoGaveta = fundo + st.breakdownVendas.dinheiro + st.breakdownAnteriores.dinheiro - st.breakdownDespesas.dinheiro;
            const dV = contado - esperadoGaveta;

            const resumoCompleto = { ...st, esperadoGaveta, contado, diferenca: dV, fundo };

            // 2. 🔥 ATUALIZA BANCO PRIMEIRO (Garantia de dados)
            const totalGeralMovimentado = st.vendasHoje + st.entradasAnteriores;
            const { error } = await _sb.from('cash_sessions').update({
                fechamento: dataFechamento.toISOString(),
                status: 'fechado',
                valor_fechamento: totalGeralMovimentado,
                valor_final_informado: contado,
                diferenca: dV,
                resumo_vendas: resumoCompleto
            }).eq('id', st.session.id);

            if (error) throw error;

            // 3. 🔥 LIMPEZA DE ESTADO LOCAL
            const idSessionFix = st.session.id;
            Caixa.state.session = null;
            localStorage.removeItem('active_cash_session');

            // 4. 🔥 SUCESSO E IMPRESSÃO (Formatada para Térmica)
            App.utils.toast("✅ Caixa fechado com sucesso!", "success");

            if (await NaxioUI.confirm("Imprimir Fechamento?", "O caixa foi fechado. Deseja imprimir o ticket de fechamento (térmico)?")) {
                const content = Caixa.generateContent(resumoCompleto);
                // Usa janela externa para evitar que o render() limpe o conteudo antes de imprimir
                const win = window.open('', '_blank');
                win.document.write(`
                    <html>
                    <head>
                        <title>Fechamento de Caixa</title>
                        <style>
                            body { margin: 0; padding: 0; background: #fff; }
                            @media print { @page { margin: 0; } }
                        </style>
                    </head>
                    <body onload="window.print(); window.close();">
                        ${content}
                    </body>
                    </html>
                `);
                win.document.close();
            }

            // 5. Volta pro Dashboard
            await Caixa.checkSession();
            Caixa.render();

        } catch (err) {
            console.error("Erro no fechamento:", err);
            NaxioUI.alert("Erro no Fechamento", "Não foi possível fechar o caixa: " + err.message, "error");
        }
    },

    // 🔥 GERA PDF VIA JANELA DE IMPRESSÃO NOMEADA
    gerarPdfFechamento: (r, nomeArquivo) => {
        const loja = App.state.currentStore?.nome_loja || 'Minha Loja';
        const fmt = (v) => `R$ ${(v || 0).toFixed(2)}`;
        const linha = (l, v) => `<tr><td style="padding:3px 0;">${l}</td><td style="text-align:right; font-weight:bold;">${fmt(v)}</td></tr>`;

        const htmlPdf = `
        <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
        <title>${nomeArquivo}</title>
        <style>
            * { font-family: 'Courier New', monospace; color: #000; }
            body { margin: 20px; max-width: 600px; }
            h1 { font-size: 20px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
            h3 { font-size: 14px; text-decoration: underline; margin: 12px 0 4px; }
            table { width: 100%; border-collapse: collapse; }
            td { font-size: 13px; }
            .destaque { font-size: 15px; font-weight: bold; background: #f0f0f0; padding: 4px; }
            hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #666; }
            @media print {
                body { margin: 0; }
                button { display: none !important; }
            }
        </style></head><body>
        <h1>FECHAMENTO DE CAIXA</h1>
        <p style="text-align:center; font-size:13px;">${loja}<br>
           <strong>Operador:</strong> ${r.session.nome || 'Caixa #' + r.session.id}<br>
           <strong>Fechamento:</strong> ${new Date().toLocaleString('pt-BR')}
        </p>
        <hr>
        <h3>VENDAS DO DIA</h3>
        <table>
            ${linha('Dinheiro:', r.breakdownVendas.dinheiro)}
            ${linha('Pix:', r.breakdownVendas.pix)}
            ${linha('Crédito:', r.breakdownVendas.credito)}
            ${linha('Débito:', r.breakdownVendas.debito)}
            <tr class="destaque"><td>TOTAL VENDAS:</td><td style="text-align:right;">${fmt(r.vendasHoje)}</td></tr>
        </table>
        <h3>ENTRADAS ANTERIORES</h3>
        <table>
            ${linha('Dinheiro:', r.breakdownAnteriores.dinheiro)}
            ${linha('Pix:', r.breakdownAnteriores.pix)}
            ${linha('Crédito:', r.breakdownAnteriores.credito)}
            ${linha('Débito:', r.breakdownAnteriores.debito)}
            <tr class="destaque"><td>TOTAL ENTRADAS:</td><td style="text-align:right;">${fmt(r.entradasAnteriores)}</td></tr>
        </table>
        <h3>DESPESAS / SANGRIA</h3>
        <table>
            ${linha('Dinheiro saiu:', r.breakdownDespesas.dinheiro)}
            ${linha('Outros:', r.totalDespesas - r.breakdownDespesas.dinheiro)}
            <tr class="destaque"><td>TOTAL DESPESAS:</td><td style="text-align:right;">${fmt(r.totalDespesas)}</td></tr>
        </table>
        <hr>
        <h3>CONFERENCIA DE GAVETA</h3>
        <table>
            ${linha('Fundo Inicial:', r.fundo)}
            ${linha('Gaveta Esperada:', r.esperadoGaveta)}
            ${linha('Informado (Contagem):', r.contado)}
            <tr class="destaque" style="background:${r.diferenca < 0 ? '#ffe0e0' : '#e0ffe0'}">
                <td>DIFERENÇA:</td>
                <td style="text-align:right;">${fmt(r.diferenca)}</td>
            </tr>
        </table>
        <div style="margin-top:40px; border-top:2px solid #000; width:70%; margin-left:auto; text-align:center; padding-top:5px; font-size:13px;">Assinatura Responsável</div>
        <div class="footer">Gerado em: ${new Date().toLocaleString('pt-BR')} | Naxio System</div>
        <script>window.onload=()=>{ document.title='${nomeArquivo}'; setTimeout(()=>window.print(), 500); }<\/script>
        </body></html>`;

        const win = window.open('', '_blank');
        if (win) {
            win.document.write(htmlPdf);
            win.document.close();
        }
    },

    // 🔥 GERAÇÃO DE CONTEÚDO DETALHADO
    generateContent: (r) => {
        const loja = App.state.currentStore?.nome_loja || "Minha Loja";
        const data = new Date().toLocaleString();
        const fmt = (v) => `R$ ${(v || 0).toFixed(2)}`;
        const linha = (l, v) => `<div style="display:flex; justify-content:space-between;"><span>${l}</span><span>${fmt(v)}</span></div>`;
        const div = `<div style="border-top:1px dashed #000; margin:5px 0;"></div>`;

        return `
            <div style="font-family:'Courier New'; width:300px; font-weight:bold; color:#000;">
                <center>
                    <h2 style="margin:0;">FECHAMENTO CAIXA</h2>
                    <div style="font-size: 14px; text-transform:uppercase;">${loja}</div>
                    <div style="font-size:12px;">${data}</div>
                    <div style="font-size:12px; margin-top:5px;">OP: ${r.session.nome || 'Caixa ' + r.session.id}</div>
                </center>
                ${div}
                ${linha('Fundo Inicial:', r.fundo)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px;">VENDAS HOJE</div>
                ${linha('Dinheiro:', r.breakdownVendas.dinheiro)}
                ${linha('Pix:', r.breakdownVendas.pix)}
                ${linha('Crédito:', r.breakdownVendas.credito)}
                ${linha('Débito:', r.breakdownVendas.debito)}
                ${linha('TOTAL VENDAS:', r.vendasHoje)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px;">ENTRADAS (DIAS ANT.)</div>
                ${linha('Dinheiro:', r.breakdownAnteriores.dinheiro)}
                ${linha('Pix:', r.breakdownAnteriores.pix)}
                ${linha('Crédito:', r.breakdownAnteriores.credito)}
                ${linha('Débito:', r.breakdownAnteriores.debito)}
                ${linha('TOTAL ENTRADAS:', r.entradasAnteriores)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px;">DESPESAS / SANGRIA</div>
                ${linha('Dinheiro:', r.breakdownDespesas.dinheiro)}
                ${linha('Outros:', r.totalDespesas - r.breakdownDespesas.dinheiro)}
                ${linha('TOTAL DESPESAS:', r.totalDespesas)}
                ${div}
                
                <div style="font-size:1.1rem; margin-top:5px;">
                    ${linha('GAVETA ESPERADO:', r.esperadoGaveta)}
                    <div style="font-size:10px; text-align:right; margin:2px 0;">(Fundo + Dinheiro - Desp.Din)</div>
                    ${linha('INFORMADO:', r.contado)}
                    ${linha('DIFERENÇA:', r.diferenca)}
                </div>
                ${div}
                
                <div style="margin-top: 30px; text-align:center;">
                    <div style="border-top: 2px solid black; width: 90%; margin: 0 auto 5px auto;"></div>
                    <span style="font-size: 14px;">Assinatura Responsável</span>
                </div>
                <br>
                <div style="text-align:center; font-size:10px;">Naxio System Enterprise</div>
                <br>.
            </div>
        `;
    },

    printParcial: async () => {
        await Caixa.calcTotals();
        const st = Caixa.state;
        const fundo = st.session.valor_inicial;
        const esperadoGaveta = fundo + st.breakdownVendas.dinheiro + st.breakdownAnteriores.dinheiro - st.breakdownDespesas.dinheiro;

        const resumo = {
            ...st,
            esperadoGaveta,
            contado: 0,
            diferenca: 0,
            fundo
        };

        const content = Caixa.generateContent(resumo);
        document.getElementById('ticket-area').innerHTML = content;
        window.print();
    }
};

// 🔥 EXPLICITAMENTE ATRIBUI AO WINDOW PARA ACESSO GLOBAL
window.Caixa = Caixa;

// 🔥 LOG DE CONFIRMAÇÃO
console.log("✅ Módulo Caixa V3 Carregado - Detalhamento Completo + Reabertura");
