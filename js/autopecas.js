if (typeof App !== 'undefined') {
    Object.assign(App, {
        autopecas: {
            init: async () => {
                console.log("🔧 Módulo Autopeças Iniciado");
                // Verifica se a loja atual é autopeças ou oficina (Flexible Check)
                // Verifica se a loja atual é autopeças ou oficina (Flexible Check)
                let type = App.state.currentStore?.tipo_loja || "";

                // Normaliza para comparação (remove acentos e lowercase)
                const cleanType = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                // Aceita variações como: autopeças, auto peças, oficina, mecânica
                const isAuto = cleanType.includes('auto') || cleanType.includes('peca') || cleanType.includes('oficina') || cleanType.includes('mecanic');

                if (!isAuto) {
                    console.log(`⚠️ Módulo Autopeças ignorado: Tipo de loja incompatível ("${type}")`);
                    return;
                }

                console.log("✅ Loja identificada como Autopeças/Oficina. Injetando botões...");

                // Injeta Botão de OS no Painel se não existir
                const panel = document.querySelector('.painel-actions-grid');
                if (panel && !document.getElementById('btn-open-os')) {
                    const btn = document.createElement('button');
                    btn.id = 'btn-open-os';
                    btn.className = 'btn action-btn';
                    btn.style.backgroundColor = '#0ea5e9'; // Sky blue
                    btn.style.color = '#fff';
                    btn.style.border = 'none';
                    btn.innerHTML = '<i class="ri-tools-line"></i> Ordens de Serviço';
                    btn.onclick = App.autopecas.openOSPanel;
                    panel.appendChild(btn);

                    const btnFin = document.createElement('button');
                    btnFin.id = 'btn-fin-auto';
                    btnFin.className = 'btn action-btn';
                    btnFin.style.backgroundColor = '#ef4444'; // Red
                    btnFin.style.color = '#fff';
                    btnFin.style.border = 'none';
                    btnFin.innerHTML = '<i class="ri-money-dollar-circle-line"></i> Financeiro / Vales';
                    btnFin.onclick = App.autopecas.openFinancialPanel;
                    panel.appendChild(btnFin);

                    const btnTeam = document.createElement('button');
                    btnTeam.id = 'btn-team-auto';
                    btnTeam.className = 'btn action-btn';
                    btnTeam.style.backgroundColor = '#8b5cf6'; // Violet
                    btnTeam.style.color = '#fff';
                    btnTeam.style.border = 'none';
                    btnTeam.innerHTML = '<i class="ri-user-settings-line"></i> Equipe';
                    btnTeam.onclick = App.autopecas.openTeamPanel;
                    panel.appendChild(btnTeam);

                    const btnPayroll = document.createElement('button');
                    btnPayroll.id = 'btn-payroll-auto';
                    btnPayroll.className = 'btn action-btn';
                    btnPayroll.style.backgroundColor = '#059669';
                    btnPayroll.style.color = '#fff';
                    btnPayroll.style.border = 'none';
                    btnPayroll.innerHTML = '<i class="ri-receipt-line"></i> Folha de Pagamento';
                    btnPayroll.onclick = App.autopecas.openPayrollPanel;
                    panel.appendChild(btnPayroll);
                } else {
                    if (!panel) console.error("❌ Erro: .painel-actions-grid não encontrado no HTML.");
                }
            },

            openTeamPanel: async () => {
                const html = `
                <div id="team-panel-modal" class="modal-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-content" style="max-width:800px; height:90vh; display:flex; flex-direction:column; background:#1e293b; color:#fff;">
                        <div class="modal-header">
                            <h3>👥 Gestão de Equipe</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('team-panel-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body" style="flex:1; overflow-y:auto;">
                            <div style="display:flex; justify-content:flex-end; margin-bottom:15px;">
                                <button class="btn btn-primary btn-sm" onclick="App.autopecas.addNewMember()">+ Adicionar Membro</button>
                            </div>
                            <div id="team-list-container">Carregando...</div>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
                App.autopecas.loadTeam();
            },

            loadTeam: async () => {
                const { data: team } = await _sb.from('store_staff')
                    .select('*, profiles(nome_completo, email)')
                    .eq('store_id', App.state.storeId);

                const container = document.getElementById('team-list-container');
                if (!team || team.length === 0) {
                    container.innerHTML = '<p class="text-muted">Nenhum membro na equipe.</p>';
                    return;
                }

                container.innerHTML = `<table style="width:100%; border-collapse:collapse;">
                    <thead><tr style="text-align:left; border-bottom:1px solid #ddd;">
                        <th style="padding:10px;">Nome</th>
                        <th>Cargo</th>
                        <th>Comissão (%)</th>
                        <th style="text-align:center;">Ação</th>
                    </tr></thead>
                    <tbody>
                    ${team.map(m => `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:10px;">${m.profiles?.nome_completo || 'Sem Nome'}<br><small class="text-muted">${m.profiles?.email}</small></td>
                            <td>
                                <select class="input-field" style="padding:5px;" onchange="App.autopecas.updateMember('${m.id}', 'cargo_detalhado', this.value)">
                                    <option value="">Selecione...</option>
                                    <option value="Vendedor" ${m.cargo_detalhado === 'Vendedor' ? 'selected' : ''}>Vendedor</option>
                                    <option value="Caixa" ${m.cargo_detalhado === 'Caixa' ? 'selected' : ''}>Caixa</option>
                                    <option value="Mecânico" ${m.cargo_detalhado === 'Mecânico' ? 'selected' : ''}>Mecânico</option>
                                    <option value="Gerente" ${m.cargo_detalhado === 'Gerente' ? 'selected' : ''}>Gerente</option>
                                </select>
                            </td>
                            <td>
                                <input type="number" class="input-field" style="width:80px; padding:5px;" value="${m.comissao_percentual || 0}" onchange="App.autopecas.updateMember('${m.id}', 'comissao_percentual', this.value)">
                            </td>
                            <td style="text-align:center;"><button class="btn btn-sm btn-danger" onclick="App.autopecas.removeMember('${m.id}')"><i class="ri-delete-bin-line"></i></button></td>
                        </tr>
                    `).join('')}
                    </tbody>
                </table>`;
            },

            updateMember: async (id, field, val) => {
                await _sb.from('store_staff').update({ [field]: val }).eq('id', id);
                App.utils.toast("Atualizado!", "success");
            },

            addNewMember: async () => {
                try {
                    const subTitle = "Digite o E-MAIL do usuário cadastrado no Naxio.";
                    const email = await NaxioUI.prompt("Adicionar Membro", subTitle, "", "email@exemplo.com", "text");

                    if (!email) return;

                    // Busca profile pelo email (Case Insensitive e Tolerante a falhas)
                    const { data: profile, error } = await _sb.from('profiles')
                        .select('id, nome_completo')
                        .ilike('email', email.trim())
                        .maybeSingle();

                    if (error) throw new Error("Erro de conexão ao buscar usuário: " + error.message);

                    if (!profile) {
                        throw new Error(`Usuário com e-mail "${email}" não encontrado no sistema.\n\nO funcionário precisa criar uma conta no app/site primeiro para poder ser adicionado.`);
                    }

                    // Verifica se já não é da equipe
                    const { data: existing } = await _sb.from('store_staff')
                        .select('id')
                        .eq('store_id', App.state.storeId)
                        .eq('profile_id', profile.id)
                        .maybeSingle();

                    if (existing) {
                        throw new Error("Este usuário já faz parte da equipe!");
                    }

                    // Adiciona
                    const role = await NaxioUI.select("Cargo Inicial", "Selecione a função:", [
                        { value: 'Vendedor', label: 'Vendedor' },
                        { value: 'Caixa', label: 'Caixa' },
                        { value: 'Mecânico', label: 'Mecânico' },
                        { value: 'Gerente', label: 'Gerente' }
                    ]);

                    if (!role) return;

                    // Tenta inserir COMPLETO (com colunas novas)
                    const { error: insertError } = await _sb.from('store_staff').insert({
                        store_id: App.state.storeId,
                        profile_id: profile.id,
                        role: 'loja_admin',
                        cargo_detalhado: role,
                        comissao_percentual: 0
                    });

                    if (insertError) {
                        console.warn("Erro ao inserir completo (provável falta de colunas):", insertError);

                        // Tenta FALLBACK (apenas colunas padrão)
                        const { error: retryError } = await _sb.from('store_staff').insert({
                            store_id: App.state.storeId,
                            profile_id: profile.id,
                            role: 'loja_admin'
                        });

                        if (retryError) {
                            throw new Error("Erro fatal ao adicionar: " + retryError.message);
                        } else {
                            alert(`⚠️ Usuário adicionado PARCIALMENTE.\n\nO usuário foi vinculado, mas o Cargo e a Comissão não foram salvos.\n\nMOTIVO: O banco de dados da sua loja ainda não tem as colunas 'cargo_detalhado' e 'comissao_percentual'.\n\nSOLUÇÃO: Execute o script 'update_autopecas.sql' no Supabase.`);
                        }
                    } else {
                        alert(`✅ Sucesso!\n\n${profile.nome_completo} foi adicionado à equipe.`);
                    }

                    App.autopecas.loadTeam();

                } catch (err) {
                    alert("⚠️ ATENÇÃO:\n" + (err.message || err));
                }
            },

            removeMember: async (id) => {
                if (confirm("Remover membro da equipe?")) {
                    await _sb.from('store_staff').delete().eq('id', id);
                    App.autopecas.loadTeam();
                }
            },

            // =========================================================================
            // 🛠️ ORDEM DE SERVIÇO (OS)
            // =========================================================================
            openOSPanel: async () => {
                const { data: orders } = await _sb.from('service_orders')
                    .select('*, profiles(nome_completo)')
                    .eq('store_id', App.state.storeId)
                    .order('created_at', { ascending: false });

                const modalHtml = `
                <div id="os-panel-modal" class="modal-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-content" style="max-width:900px; height:90vh; display:flex; flex-direction:column;">
                        <div class="modal-header">
                            <h3>🛠️ Gestão de Oficina & OS</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('os-panel-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body" style="flex:1; overflow-y:auto;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                                <div class="stats-row" style="display:flex; gap:10px;">
                                    <div class="card" style="padding:10px; background:#f0f9ff; border:1px solid #bae6fd;">
                                        <h5 style="color:#0284c7; margin:0;">Abertas</h5>
                                        <strong style="font-size:1.5rem; color:#0c4a6e;">${orders?.filter(o => o.status === 'aberta').length || 0}</strong>
                                    </div>
                                    <div class="card" style="padding:10px; background:#fefce8; border:1px solid #fde047;">
                                        <h5 style="color:#ca8a04; margin:0;">Em Andamento</h5>
                                        <strong style="font-size:1.5rem; color:#854d0e;">${orders?.filter(o => o.status === 'em_andamento').length || 0}</strong>
                                    </div>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <button class="btn btn-primary" onclick="App.autopecas.newOS()"><i class="ri-add-line"></i> Nova OS</button>
                                </div>
                            </div>

                            <div class="os-list">
                                ${orders && orders.length > 0 ? orders.map(o => `
                                    <div class="card" style="margin-bottom:10px; border-left:4px solid ${App.autopecas.getStatusColor(o.status)}; cursor:pointer;" onclick="App.autopecas.openOSDetails('${o.id}')">
                                        <div style="display:flex; justify-content:space-between;">
                                            <div>
                                                <strong>#${o.id.slice(0, 6)}</strong> - ${o.veiculo_modelo || 'Veículo não inf.'} (${o.veiculo_placa || 'Sem placa'})
                                                <br><span class="text-sm text-muted">Cliente: ${o.cliente_nome || o.profiles?.nome_completo || 'Balcão'}</span>
                                            </div>
                                            <div style="text-align:right;">
                                                <span class="badge" style="background:${App.autopecas.getStatusColor(o.status)}; color:#fff;">${o.status.replace('_', ' ').toUpperCase()}</span>
                                                <br><strong style="color:var(--primary)">R$ ${(o.valor_total || 0).toFixed(2)}</strong>
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : '<p class="text-muted text-center">Nenhuma Ordem de Serviço encontrada.</p>'}
                            </div>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            },

            getStatusColor: (status) => {
                switch (status) {
                    case 'aberta': return '#3b82f6';
                    case 'em_andamento': return '#f59e0b';
                    case 'aguardando_peca': return '#a855f7';
                    case 'concluida': return '#10b981';
                    case 'cancelada': return '#ef4444';
                    default: return '#64748b';
                }
            },

            newOS: async () => {
                const html = `
                <div id="new-os-modal" class="modal-overlay" style="display:flex; z-index:10001;">
                    <div class="modal-content">
                        <div class="modal-header"><h3>Nova Ordem de Serviço</h3><button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-os-modal').remove()">Cancelar</button></div>
                        <div class="modal-body">
                            <div class="input-wrapper"><label>Cliente (Nome)</label><input id="os-client-name" class="input-field" placeholder="Nome do Cliente"></div>
                            <div class="input-wrapper"><label>Contato/WhatsApp</label><input id="os-client-contact" class="input-field" placeholder="(00) 00000-0000"></div>
                            <div style="display:flex; gap:10px;">
                                <div class="input-wrapper" style="flex:1;"><label>Veículo/Modelo</label><input id="os-vehicle" class="input-field" placeholder="Ex: Gol G5"></div>
                                <div class="input-wrapper" style="flex:1;"><label>Placa</label><input id="os-plate" class="input-field" placeholder="ABC-1234" style="text-transform:uppercase;"></div>
                            </div>
                            <div class="input-wrapper"><label>Descrição do Problema</label><textarea id="os-description" class="input-field" rows="3"></textarea></div>
                            <div class="input-wrapper"><label>Mecânico Responsável</label>
                                <select id="os-mechanic" class="input-field"><option value="">Selecione...</option></select>
                            </div>
                            <button class="btn btn-primary btn-full" onclick="App.autopecas.saveOS()">Criar OS</button>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);

                // Carrega mecânicos
                const { data: staff } = await _sb.from('store_staff').select('*, profiles(nome_completo)').eq('store_id', App.state.storeId);
                const sel = document.getElementById('os-mechanic');
                if (staff) staff.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.profile_id;
                    opt.innerText = s.profiles?.nome_completo || 'Funcionário';
                    sel.appendChild(opt);
                });
            },

            saveOS: async () => {
                const name = document.getElementById('os-client-name').value;
                const contact = document.getElementById('os-client-contact').value;
                const vehicle = document.getElementById('os-vehicle').value;
                const plate = document.getElementById('os-plate').value;
                const desc = document.getElementById('os-description').value;
                const mech = document.getElementById('os-mechanic').value;

                if (!name || !vehicle) return App.utils.toast("Nome e Veículo obrigatórios", "error");

                const { error } = await _sb.from('service_orders').insert({
                    store_id: App.state.storeId,
                    cliente_nome: name,
                    cliente_contato: contact,
                    veiculo_modelo: vehicle,
                    veiculo_placa: plate.toUpperCase(),
                    descricao_problema: desc,
                    mecanico_responsavel_id: mech || null,
                    status: 'aberta'
                });

                if (error) alert("Erro: " + error.message);
                else {
                    document.getElementById('new-os-modal').remove();
                    document.getElementById('os-panel-modal').remove();
                    App.utils.toast("OS Criada com Sucesso!", "success");
                    App.autopecas.openOSPanel();
                }
            },

            openOSDetails: async (osId) => {
                const { data: os } = await _sb.from('service_orders').select('*, profiles(nome_completo)').eq('id', osId).single();
                const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);

                const itemsList = items ? items.map(i => `
                    <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;">
                        <div>
                            <strong>${i.descricao}</strong> (${i.tipo.toUpperCase()})
                            <br><small class="text-muted">${i.qtd}x R$ ${i.preco_unitario.toFixed(2)}</small>
                        </div>
                        <div style="text-align:right;">
                            <strong>R$ ${(i.qtd * i.preco_unitario).toFixed(2)}</strong>
                            <br><button class="btn btn-sm btn-danger" style="padding:2px 5px; font-size:0.7rem;" onclick="App.autopecas.deleteOSItem('${i.id}', '${osId}')">Remover</button>
                        </div>
                    </div>
                `).join('') : '';

                const isConcluida = os.status === 'concluida';
                const isCancelada = os.status === 'cancelada';

                const modalHtml = `
                <div id="os-detail-modal" class="modal-overlay" style="display:flex; z-index:10002;">
                    <div class="modal-content" style="max-width:800px; height:90vh; display:flex; flex-direction:column;">
                        <div class="modal-header">
                            <h3>OS #${os.id.slice(0, 6)} - ${os.veiculo_modelo}</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('os-detail-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body" style="flex:1; overflow-y:auto;">
                            <div style="background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:15px;">
                                <p><strong>Cliente:</strong> ${os.cliente_nome} | <strong>Placa:</strong> ${os.veiculo_placa}</p>
                                <p><strong>Contato:</strong> ${os.cliente_contato || 'Não informado'}</p>
                                <p><strong>Problema:</strong> ${os.descricao_problema || 'Não informado'}</p>
                                <div style="margin-top:10px;">
                                    <label>Status:</label>
                                    <select id="os-status-update" class="input-field" style="width:auto; display:inline-block;" onchange="App.autopecas.updateOSStatus('${os.id}', this.value)">
                                        <option value="aberta" ${os.status === 'aberta' ? 'selected' : ''}>Aberta</option>
                                        <option value="em_andamento" ${os.status === 'em_andamento' ? 'selected' : ''}>Em Andamento</option>
                                        <option value="aguardando_peca" ${os.status === 'aguardando_peca' ? 'selected' : ''}>Aguardando Peça</option>
                                        <option value="concluida" ${os.status === 'concluida' ? 'selected' : ''}>Concluída</option>
                                        <option value="cancelada" ${os.status === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                                    </select>
                                </div>
                            </div>

                            <h4>Itens e Serviços</h4>
                            <div style="margin-bottom:15px; border:1px solid #eee; border-radius:8px;">
                                ${itemsList || '<p class="text-center text-muted" style="padding:10px;">Nenhum item lançado.</p>'}
                            </div>
                            
                            ${!isConcluida && !isCancelada ? `<button class="btn btn-primary btn-sm" onclick="App.autopecas.addItemToOS('${os.id}')"><i class="ri-add-line"></i> Adicionar Peça ou Serviço</button>` : ''}

                            <div style="margin-top:20px; text-align:right; font-size:1.2rem;">
                                Total: <strong style="color:var(--primary)">R$ ${(os.valor_total || 0).toFixed(2)}</strong>
                            </div>
                        </div>
                        <div class="modal-footer" style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-info btn-sm" style="flex:1; min-width:120px;" onclick="App.autopecas.printOS('${os.id}')"><i class="ri-printer-line"></i> Imprimir OS</button>
                            ${!isCancelada ? `<button class="btn btn-danger btn-sm" style="flex:1; min-width:120px;" onclick="App.autopecas.cancelOS('${os.id}')"><i class="ri-close-circle-line"></i> Cancelar OS</button>` : ''}
                            ${!isConcluida && !isCancelada ? `<button class="btn btn-success" style="flex:2; min-width:150px;" onclick="App.autopecas.checkoutOS('${os.id}', ${os.valor_total})"><i class="ri-check-double-line"></i> Finalizar e Cobrar</button>` : ''}
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            },

            addItemToOS: async (osId) => {
                const type = await NaxioUI.select('Adicionar Item', 'O que deseja adicionar?', [
                    { value: 'peca', label: 'Peça do Estoque', icon: 'ri-archive-line' },
                    { value: 'servico', label: 'Mão de Obra / Serviço', icon: 'ri-hammer-line' }
                ]);

                if (!type) return;

                if (type === 'peca') {
                    // Busca produto
                    const term = await NaxioUI.prompt('Buscar Peça', 'Digite nome ou código:', '', 'Ex: Pastilha de Freio');
                    if (!term) return;

                    const { data: prods } = await _sb.from('products')
                        .select('*')
                        .eq('store_id', App.state.storeId)
                        .or(`nome.ilike.%${term}%,codigo_cardapio.eq.${term},cod_aplicacao.ilike.%${term}%`)
                        .limit(5);

                    if (!prods || prods.length === 0) return NaxioUI.alert('Não encontrado', 'Nenhuma peça encontrada.', 'warning');

                    const options = prods.map(p => ({
                        value: p.id,
                        label: `${p.nome} - R$ ${p.preco.toFixed(2)}`,
                        description: `Estoque: ${p.estoque} | Aplicação: ${p.cod_aplicacao || 'N/A'}`
                    }));

                    const selectedId = await NaxioUI.select('Selecione a Peça', 'Resultados da busca:', options);
                    if (!selectedId) return;

                    const p = prods.find(x => x.id === selectedId);
                    const qtd = await NaxioUI.prompt('Quantidade', `Quantos(as) ${p.nome}?`, '1', '1', 'number');
                    if (!qtd) return;

                    await _sb.from('service_order_items').insert({
                        os_id: osId,
                        product_id: p.id,
                        descricao: p.nome,
                        qtd: parseFloat(qtd),
                        preco_unitario: p.preco,
                        tipo: 'peca'
                    });

                    // Baixa estoque (simplificado, ideal seria na conclusão)
                    if (p.estoque_minimo !== undefined || p.allow_negative_stock) {
                        // Lógica de update estoque futuro
                    }
                } else {
                    const desc = await NaxioUI.prompt('Descrição do Serviço', 'O que foi feito?', '', 'Ex: Troca de Óleo');
                    if (!desc) return;
                    const valor = await NaxioUI.prompt('Valor da Mão de Obra', 'R$:', '', '0.00', 'number');
                    if (!valor) return;

                    // Selecionar Mecânico para comissão
                    const { data: staff } = await _sb.from('store_staff').select('profile_id, profiles(nome_completo)').eq('store_id', App.state.storeId);
                    const staffOpts = staff ? staff.map(s => ({ value: s.profile_id, label: s.profiles.nome_completo })) : [];
                    const funcId = await NaxioUI.select('Funcionário', 'Quem realizou o serviço?', [...staffOpts, { value: 'loja', label: 'Loja (Sem comissão)' }]);

                    await _sb.from('service_order_items').insert({
                        os_id: osId,
                        descricao: desc,
                        qtd: 1,
                        preco_unitario: parseFloat(valor),
                        tipo: 'servico',
                        comissao_funcionario_id: funcId === 'loja' ? null : funcId
                    });
                }

                // Recalcula total da OS
                App.autopecas.recalcOS(osId);
            },

            recalcOS: async (osId) => {
                const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);
                const total = items.reduce((acc, i) => acc + (i.qtd * i.preco_unitario), 0);
                await _sb.from('service_orders').update({ valor_total: total }).eq('id', osId);

                document.getElementById('os-detail-modal').remove();
                App.autopecas.openOSDetails(osId);
            },

            deleteOSItem: async (itemId, osId) => {
                if (confirm("Remover item?")) {
                    await _sb.from('service_order_items').delete().eq('id', itemId);
                    App.autopecas.recalcOS(osId);
                }
            },

            updateOSStatus: async (osId, status) => {
                await _sb.from('service_orders').update({ status: status }).eq('id', osId);
                App.utils.toast(`Status: ${status.toUpperCase()}`, 'success');

                // Se for concluída, baixa estoque das peças
                if (status === 'concluida') {
                    const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);
                    if (items) {
                        for (const item of items.filter(i => i.tipo === 'peca' && i.product_id)) {
                            const { data: prod } = await _sb.from('products').select('estoque').eq('id', item.product_id).single();
                            if (prod) {
                                await _sb.from('products').update({ estoque: Math.max(0, (prod.estoque || 0) - item.qtd) }).eq('id', item.product_id);
                            }
                        }
                        App.utils.toast("Estoque das peças atualizado!", "info");
                    }
                }

                // Reabre o detalhe da OS sem fechar o painel todo
                document.getElementById('os-detail-modal')?.remove();
                App.autopecas.openOSDetails(osId);
            },

            checkoutOS: async (osId, valor) => {
                // Fecha os modais da OS para não ficar por trás do pagamento
                document.getElementById('os-detail-modal')?.remove();

                App.payment.open(valor, {
                    store_id: App.state.storeId,
                    basePrice: valor,
                    origem_venda: 'os',
                    os_id: osId,
                    address: 'Balcão Oficina',
                    onSuccess: async () => {
                        // Marca OS como concluída
                        await _sb.from('service_orders').update({ status: 'concluida' }).eq('id', osId);

                        // Baixa estoque das peças usadas
                        const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);
                        if (items) {
                            for (const item of items.filter(i => i.tipo === 'peca' && i.product_id)) {
                                const { data: prod } = await _sb.from('products').select('estoque').eq('id', item.product_id).single();
                                if (prod) {
                                    await _sb.from('products').update({ estoque: Math.max(0, (prod.estoque || 0) - item.qtd) }).eq('id', item.product_id);
                                }
                            }
                        }
                        App.utils.toast("OS finalizada com sucesso!", "success");

                        // --- WHATSAPP RECIBO ---
                        setTimeout(async () => {
                            if (confirm("📱 Enviar comprovante da OS via WhatsApp?")) {
                                const { data: osFull } = await _sb.from('service_orders').select('*, service_order_items(*)').eq('id', osId).single();
                                if (osFull) {
                                    const tel = prompt("Número do Cliente (com DDD):", osFull.cliente_contato || "");
                                    if (tel) {
                                        const itensTxt = osFull.service_order_items.map(i => `${i.qtd}x ${i.descricao}`).join('%0A');
                                        const msg = `*OFICINA - OS #${osId.slice(0, 6)}*%0A%0ACliente: ${osFull.cliente_nome}%0AVeículo: ${osFull.veiculo_modelo} (${osFull.veiculo_placa})%0A%0A*SERVIÇOS/PEÇAS:*%0A${itensTxt}%0A%0A*TOTAL: R$ ${osFull.valor_total.toFixed(2)}*%0A%0AObrigado pela preferência!`;
                                        window.open(`https://wa.me/${tel.replace(/\D/g, '')}?text=${msg}`, '_blank');
                                    }
                                }
                            }
                        }, 500);

                        // Reabre o painel de OS atualizado
                        document.getElementById('os-panel-modal')?.remove();
                        App.autopecas.openOSPanel();
                    }
                });
            },

            // =========================================================================
            // 💸 FINANCEIRO E VALES
            // =========================================================================
            openFinancialPanel: async () => {
                const html = `
                <div id="fin-panel-modal" class="modal-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-content" style="max-width:800px; height:90vh;">
                         <div class="modal-header">
                            <h3>💸 Gestão Financeira</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('fin-panel-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body">
                            <div class="tabs" style="display:flex; gap:10px; margin-bottom:20px;">
                                <button class="btn btn-sm btn-primary" onclick="App.autopecas.loadVales()">Vales / Empréstimos</button>
                                <button class="btn btn-sm btn-secondary" onclick="App.autopecas.loadContas()">Contas a Pagar/Receber</button>
                            </div>
                            <div id="fin-content-area">Carregando...</div>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
                App.autopecas.loadVales();
            },

            loadVales: async () => {
                const area = document.getElementById('fin-content-area');
                area.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                        <h4>Vales de Funcionários</h4>
                        <button class="btn btn-sm btn-success" onclick="App.autopecas.newVale()">+ Novo Vale</button>
                    </div>
                    <div id="vales-list"></div>
                `;

                const { data: vales } = await _sb.from('financial_records')
                    .select('*, profiles(nome_completo)')
                    .eq('store_id', App.state.storeId)
                    .eq('tipo', 'vale_funcionario')
                    .order('created_at', { ascending: false });

                const list = document.getElementById('vales-list');
                if (!vales || vales.length === 0) {
                    list.innerHTML = '<p class="text-muted">Nenhum vale registrado.</p>';
                    return;
                }

                list.innerHTML = vales.map(v => `
                    <div class="card" style="margin-bottom:10px; border-left:4px solid ${v.status === 'pago' ? 'green' : 'orange'};">
                        <div style="display:flex; justify-content:space-between;">
                            <div>
                                <strong>${v.profiles?.nome_completo || 'Funcionário'}</strong>
                                <br>${v.descricao || 'Adiantamento'}
                                <br><small class="text-muted">Data: ${new Date(v.created_at).toLocaleDateString()}</small>
                            </div>
                            <div style="text-align:right;">
                                <strong style="color:red; font-size:1.1rem;">R$ ${Math.abs(v.valor).toFixed(2)}</strong>
                                <br><span class="badge status-${v.status}">${v.status}</span>
                            </div>
                        </div>
                        ${v.status === 'pendente' ? `<button class="btn btn-sm btn-primary btn-full" style="margin-top:5px;" onclick="App.autopecas.payVale('${v.id}')">Marcar como Pago/Descontado</button>` : ''}
                    </div>
                `).join('');
            },

            newVale: async () => {
                const { data: staff } = await _sb.from('store_staff').select('profile_id, profiles(nome_completo)').eq('store_id', App.state.storeId);
                const staffOpts = staff ? staff.map(s => ({ value: s.profile_id, label: s.profiles.nome_completo })) : [];

                const funcId = await NaxioUI.select('Funcionário', 'Para quem é o vale?', staffOpts);
                if (!funcId) return;

                const valor = await NaxioUI.prompt('Valor do Vale', 'R$:', '', '0.00', 'number');
                if (!valor) return;

                const obs = await NaxioUI.textarea('Observação', 'Motivo do vale:', '', 'Ex: Adiantamento de Salário');

                const method = await NaxioUI.select('Origem do Dinheiro', 'De onde saiu o valor?', [
                    { value: 'caixa', label: 'Dinheiro do Caixa' },
                    { value: 'pix', label: 'Transferência Pix' }
                ]);

                await _sb.from('financial_records').insert({
                    store_id: App.state.storeId,
                    tipo: 'vale_funcionario',
                    categoria: 'adiantamento',
                    descricao: obs || 'Vale Funcionário',
                    valor: -Math.abs(parseFloat(valor)), // Negativo pois é saída
                    funcionario_id: funcId,
                    metodo_pagamento: method,
                    status: 'pendente'
                });

                App.utils.toast("Vale registrado com sucesso!", "success");
                App.autopecas.loadVales();
            },

            payVale: async (id) => {
                if (confirm("Confirmar que este vale foi pago ou descontado do salário?")) {
                    await _sb.from('financial_records').update({ status: 'pago', data_pagamento: new Date() }).eq('id', id);
                    App.autopecas.loadVales();
                }
            },

            loadContas: async () => {
                const area = document.getElementById('fin-content-area');
                area.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                        <h4>Contas a Pagar/Receber</h4>
                        <div style="display:flex; gap:5px;">
                            <button class="btn btn-sm btn-info" onclick="App.autopecas.newConta('receita')">+ Receita</button>
                            <button class="btn btn-sm btn-danger" onclick="App.autopecas.newConta('despesa')">+ Despesa</button>
                        </div>
                    </div>
                    <div class="tabs" style="margin-bottom:10px;">
                        <button class="cat-pill active" onclick="App.autopecas.filterContas('all', this)">Todas</button>
                        <button class="cat-pill" onclick="App.autopecas.filterContas('pendente', this)">Pendentes</button>
                        <button class="cat-pill" onclick="App.autopecas.filterContas('atrasada', this)">Atrasadas</button>
                    </div>
                    <div id="contas-list" style="max-height:60vh; overflow-y:auto;">Carregando...</div>
                `;
                App.autopecas.fetchContas();
            },

            fetchContas: async (filter = 'all') => {
                let query = _sb.from('financial_records')
                    .select('*, profiles(nome_completo)')
                    .eq('store_id', App.state.storeId)
                    .neq('tipo', 'vale_funcionario') // Exclui vales aqui
                    .order('data_vencimento', { ascending: true });

                if (filter !== 'all') {
                    if (filter === 'atrasada') query = query.lt('data_vencimento', new Date().toISOString().split('T')[0]).is('data_pagamento', null);
                    else if (filter === 'pendente') query = query.is('data_pagamento', null);
                }

                const { data: records } = await query;
                const list = document.getElementById('contas-list');

                if (!records || records.length === 0) {
                    list.innerHTML = '<p class="text-muted text-center">Nenhum registro encontrado.</p>';
                    return;
                }

                list.innerHTML = records.map(r => {
                    const isReceita = r.tipo === 'receita';
                    const color = isReceita ? 'green' : 'red';
                    const sign = isReceita ? '+' : '-';
                    const vencido = !r.data_pagamento && new Date(r.data_vencimento) < new Date() ? 'color:red; font-weight:bold;' : '';

                    return `
                    <div class="card" style="margin-bottom:10px; border-left:4px solid ${r.status === 'pago' ? '#10b981' : (r.data_pagamento ? '#10b981' : '#f59e0b')}">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span class="badge" style="background:${isReceita ? '#d1fae5; color:#065f46' : '#fee2e2; color:#991b1b'}">${r.categoria || r.tipo}</span>
                                <strong style="display:block; margin-top:5px;">${r.descricao}</strong>
                                <small class="text-muted">Vence: <span style="${vencido}">${new Date(r.data_vencimento).toLocaleDateString()}</span></small>
                                ${r.profiles ? `<br><small class="text-info">Cliente: ${r.profiles.nome_completo}</small>` : ''}
                            </div>
                            <div style="text-align:right;">
                                <strong style="display:block; font-size:1.1rem; color:${color}">${sign} R$ ${Math.abs(r.valor).toFixed(2)}</strong>
                                ${!r.data_pagamento ?
                            `<button class="btn btn-sm btn-success" style="margin-top:5px; padding:2px 8px;" onclick="App.autopecas.payConta('${r.id}')">Baixar</button>` :
                            `<span class="badge status-concluido">Pago</span>`
                        }
                            </div>
                        </div>
                    </div>`;
                }).join('');
            },

            filterContas: (type, btn) => {
                document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                App.autopecas.fetchContas(type);
            },

            newConta: async (tipo) => {
                const desc = await NaxioUI.prompt('Descrição', 'Ex: Aluguel, Venda a Prazo', '', '', 'text');
                if (!desc) return;
                const valor = await NaxioUI.prompt('Valor', 'R$', '', '0.00', 'number');
                if (!valor) return;
                const venc = await NaxioUI.prompt('Vencimento', '', new Date().toISOString().split('T')[0], '', 'date');
                if (!venc) return;

                let clienteId = null;
                if (tipo === 'receita') {
                    // Opcional: vincular cliente
                    const vincula = confirm("Vincular a um cliente cadastrado?");
                    if (vincula) {
                        const cpf = await NaxioUI.prompt('Buscar Cliente', 'Digite CPF ou Nome (parcial):');
                        if (cpf) {
                            const { data: clients } = await _sb.from('profiles').select('*').or(`nome_completo.ilike.%${cpf}%,cpf.eq.${cpf}`).eq('role', 'cliente').limit(5);
                            if (clients && clients.length > 0) {
                                const opts = clients.map(c => ({ value: c.id, label: c.nome_completo }));
                                clienteId = await NaxioUI.select('Selecione', 'Cliente encontrado:', opts);
                            } else {
                                App.utils.toast("Cliente não encontrado", "warning");
                            }
                        }
                    }
                }

                await _sb.from('financial_records').insert({
                    store_id: App.state.storeId,
                    tipo: tipo,
                    categoria: tipo === 'receita' ? 'venda_prazo' : 'despesa_operacional',
                    descricao: desc,
                    valor: parseFloat(valor),
                    data_vencimento: venc,
                    status: 'pendente',
                    metodo_pagamento: 'fiado',
                    funcionario_id: clienteId // Usando campo funcionario_id temporariamente para cliente pois tabela nao tem cliente_id.
                });
                App.autopecas.fetchContas();
            },

            payConta: async (id) => {
                const method = await NaxioUI.select('Pagamento', 'Como foi pago/recebido?', [
                    { value: 'dinheiro', label: 'Dinheiro' },
                    { value: 'pix', label: 'Pix' },
                    { value: 'cartao', label: 'Cartão' },
                    { value: 'caixa', label: 'Caixa Loja' },
                ]);
                if (!method) return;

                await _sb.from('financial_records').update({
                    status: 'pago',
                    data_pagamento: new Date(),
                    metodo_pagamento: method
                }).eq('id', id);
                App.autopecas.fetchContas();
            },

            // =========================================================================
            // 🏭 DUPLICAR PRODUTO
            // =========================================================================
            duplicateProduct: async (prodId) => {
                const { data: p } = await _sb.from('products').select('*').eq('id', prodId).single();
                if (!p) return App.utils.toast("Produto não encontrado", "error");

                // Modal para alterar fornecedor antes de duplicar
                const html = `
                <div id="dup-prod-modal" class="modal-overlay" style="display:flex; z-index:10005;">
                    <div class="modal-content" style="max-width:500px;">
                        <div class="modal-header">
                            <h3><i class="ri-file-copy-line"></i> Duplicar Produto</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('dup-prod-modal').remove()">Cancelar</button>
                        </div>
                        <div class="modal-body">
                            <p class="text-sm" style="margin-bottom:15px; background:#f0f9ff; padding:10px; border-radius:8px; border-left:4px solid #3b82f6;">
                                <strong>Produto original:</strong> ${p.nome}<br>
                                <span class="text-muted">Fornecedor atual: ${p.cod_fornecedor || 'Não informado'}</span>
                            </p>
                            <div class="input-wrapper">
                                <label>Nome do Produto</label>
                                <input id="dup-nome" class="input-field" value="${p.nome}">
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <div class="input-wrapper">
                                    <label class="text-xs">Cód. Fornecedor (Novo)</label>
                                    <input id="dup-cod-for" class="input-field" placeholder="Ex: FORN-002" value="">
                                </div>
                                <div class="input-wrapper">
                                    <label class="text-xs">Cód. Fabricante</label>
                                    <input id="dup-cod-fab" class="input-field" value="${p.cod_fabricante || ''}">
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
                                <div class="input-wrapper">
                                    <label class="text-xs">Preço Custo (R$)</label>
                                    <input type="number" id="dup-custo" class="input-field" value="${p.preco_custo || 0}">
                                </div>
                                <div class="input-wrapper">
                                    <label class="text-xs">Preço À Vista (R$)</label>
                                    <input type="number" id="dup-preco" class="input-field" value="${p.preco || 0}">
                                </div>
                                <div class="input-wrapper">
                                    <label class="text-xs">Preço Prazo (R$)</label>
                                    <input type="number" id="dup-prazo" class="input-field" value="${p.preco_prazo || 0}">
                                </div>
                            </div>
                            <div class="input-wrapper">
                                <label class="text-xs">Localização (Rua/Prat.)</label>
                                <input id="dup-local" class="input-field" value="${p.localizacao || ''}">
                            </div>
                            <button class="btn btn-primary btn-full" onclick="App.autopecas.confirmDuplicate('${p.id}')">
                                <i class="ri-file-copy-line"></i> Confirmar Duplicação
                            </button>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
            },

            confirmDuplicate: async (origId) => {
                const { data: p } = await _sb.from('products').select('*').eq('id', origId).single();
                if (!p) return;

                const newItem = { ...p };
                delete newItem.id;
                delete newItem.created_at;

                // Aplica os valores do formulário
                newItem.nome = document.getElementById('dup-nome').value || newItem.nome;
                newItem.cod_fornecedor = document.getElementById('dup-cod-for').value || null;
                newItem.cod_fabricante = document.getElementById('dup-cod-fab').value || newItem.cod_fabricante;
                newItem.preco_custo = parseFloat(document.getElementById('dup-custo').value) || 0;
                newItem.preco = parseFloat(document.getElementById('dup-preco').value) || newItem.preco;
                newItem.preco_prazo = parseFloat(document.getElementById('dup-prazo').value) || 0;
                newItem.localizacao = document.getElementById('dup-local').value || newItem.localizacao;

                const { error } = await _sb.from('products').insert(newItem);
                if (error) {
                    App.utils.toast("Erro ao duplicar: " + error.message, "error");
                    return;
                }

                document.getElementById('dup-prod-modal').remove();
                App.utils.toast("Produto duplicado com sucesso!", "success");
                App.store.loadMyProducts();
            },

            // =========================================================================
            // 🖨️ IMPRIMIR OS (Impressora Normal)
            // =========================================================================
            printOS: async (osId) => {
                const { data: os } = await _sb.from('service_orders').select('*, profiles(nome_completo)').eq('id', osId).single();
                const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);
                if (!os) return App.utils.toast("OS não encontrada", "error");

                const loja = App.state.currentStore;
                const dtAbertura = new Date(os.created_at).toLocaleString('pt-BR');
                const statusLabel = { aberta: 'ABERTA', em_andamento: 'EM ANDAMENTO', aguardando_peca: 'AGUARDANDO PEÇA', concluida: 'CONCLUÍDA', cancelada: 'CANCELADA' };

                const itemsHtml = (items || []).map(i => `
                    <tr>
                        <td style="padding:6px 8px; border-bottom:1px solid #ddd;">${i.descricao}</td>
                        <td style="padding:6px 8px; border-bottom:1px solid #ddd; text-align:center;">${i.tipo === 'peca' ? 'Peça' : 'Serviço'}</td>
                        <td style="padding:6px 8px; border-bottom:1px solid #ddd; text-align:center;">${i.qtd}</td>
                        <td style="padding:6px 8px; border-bottom:1px solid #ddd; text-align:right;">R$ ${i.preco_unitario.toFixed(2)}</td>
                        <td style="padding:6px 8px; border-bottom:1px solid #ddd; text-align:right; font-weight:bold;">R$ ${(i.qtd * i.preco_unitario).toFixed(2)}</td>
                    </tr>
                `).join('');

                const totalPecas = (items || []).filter(i => i.tipo === 'peca').reduce((a, i) => a + i.qtd * i.preco_unitario, 0);
                const totalServicos = (items || []).filter(i => i.tipo === 'servico').reduce((a, i) => a + i.qtd * i.preco_unitario, 0);

                const printWindow = window.open('', '_blank', 'width=800,height=600');
                printWindow.document.write(`<!DOCTYPE html><html><head><title>OS #${os.id.slice(0, 6)}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; color: #333; font-size: 13px; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
                    .header h1 { font-size: 18px; margin-bottom: 4px; }
                    .header p { font-size: 11px; color: #666; }
                    .os-number { font-size: 22px; font-weight: bold; color: #1e40af; margin: 10px 0; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
                    .info-box { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; }
                    .info-box label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; display: block; }
                    .info-box span { font-size: 13px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    thead th { background: #1e293b; color: #fff; padding: 8px; font-size: 11px; text-transform: uppercase; }
                    .totals { display: flex; justify-content: flex-end; gap: 30px; margin-top: 10px; padding: 15px; background: #f0f9ff; border-radius: 8px; }
                    .totals div label { font-size: 10px; color: #64748b; display: block; }
                    .totals div span { font-size: 16px; font-weight: 800; }
                    .total-geral { color: #1e40af !important; font-size: 20px !important; }
                    .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
                    .footer .signature { border-top: 1px solid #333; padding-top: 8px; text-align: center; font-size: 11px; color: #666; }
                    @media print { body { padding: 10px; } @page { margin: 10mm; } }
                </style></head><body>
                    <div class="header">
                        <h1>${loja?.nome || 'Auto Peças'}</h1>
                        <p>${loja?.endereco || ''} ${loja?.telefone ? ' | Tel: ' + loja.telefone : ''}</p>
                        <div class="os-number">ORDEM DE SERVIÇO #${os.id.slice(0, 6)}</div>
                        <p>Status: <strong>${statusLabel[os.status] || os.status}</strong> | Aberta em: ${dtAbertura}</p>
                    </div>
                    <div class="info-grid">
                        <div class="info-box"><label>Cliente</label><span>${os.cliente_nome || 'Não informado'}</span></div>
                        <div class="info-box"><label>Contato</label><span>${os.cliente_contato || 'Não informado'}</span></div>
                        <div class="info-box"><label>Veículo / Modelo</label><span>${os.veiculo_modelo || '-'}</span></div>
                        <div class="info-box"><label>Placa</label><span>${os.veiculo_placa || '-'}</span></div>
                    </div>
                    <div class="info-box" style="margin-bottom:20px;"><label>Descrição do Problema</label><span>${os.descricao_problema || 'Não informado'}</span></div>
                    <table>
                        <thead><tr><th style="text-align:left;">Descrição</th><th>Tipo</th><th>Qtd</th><th style="text-align:right;">Unit.</th><th style="text-align:right;">Subtotal</th></tr></thead>
                        <tbody>${itemsHtml || '<tr><td colspan="5" style="padding:15px; text-align:center; color:#999;">Nenhum item lançado</td></tr>'}</tbody>
                    </table>
                    <div class="totals">
                        <div><label>Peças</label><span>R$ ${totalPecas.toFixed(2)}</span></div>
                        <div><label>Serviços</label><span>R$ ${totalServicos.toFixed(2)}</span></div>
                        <div><label>TOTAL</label><span class="total-geral">R$ ${(os.valor_total || 0).toFixed(2)}</span></div>
                    </div>
                    <div class="footer">
                        <div class="signature">Responsável / Mecânico</div>
                        <div class="signature">Cliente</div>
                    </div>
                    <script>setTimeout(() => { window.print(); }, 500);<\/script>
                </body></html>`);
                printWindow.document.close();
            },

            // =========================================================================
            // ❌ CANCELAR OS (com motivo e estorno de peças)
            // =========================================================================
            cancelOS: async (osId) => {
                const confirmed = await NaxioUI.confirm(
                    'Cancelar Ordem de Serviço',
                    'Tem certeza que deseja cancelar esta OS? As peças usadas terão o estoque restaurado.',
                    'Sim, Cancelar',
                    'Voltar'
                );
                if (!confirmed) return;

                const motivo = await NaxioUI.prompt('Motivo do Cancelamento', 'Informe o motivo:', '', 'Ex: Cliente desistiu');

                // Restaura estoque das peças
                const { data: items } = await _sb.from('service_order_items').select('*').eq('os_id', osId);
                if (items) {
                    for (const item of items.filter(i => i.tipo === 'peca' && i.product_id)) {
                        const { data: prod } = await _sb.from('products').select('estoque').eq('id', item.product_id).single();
                        if (prod) {
                            await _sb.from('products').update({ estoque: (prod.estoque || 0) + item.qtd }).eq('id', item.product_id);
                        }
                    }
                }

                await _sb.from('service_orders').update({
                    status: 'cancelada',
                    observacoes: `[CANCELADA] ${motivo || 'Sem motivo'} - ${new Date().toLocaleString('pt-BR')}`
                }).eq('id', osId);

                // Fecha modais e reabre painel
                document.getElementById('os-detail-modal')?.remove();
                document.getElementById('os-panel-modal')?.remove();
                App.utils.toast("OS cancelada e estoque restaurado!", "success");
                App.autopecas.openOSPanel();
            },

            // =========================================================================
            // 🔄 CANCELAMENTO / DEVOLUÇÃO DE VENDAS
            // =========================================================================
            cancelSale: async (orderId) => {
                const confirmed = await NaxioUI.confirm(
                    'Cancelar Venda',
                    'Deseja cancelar esta venda? O estoque será restaurado automaticamente.',
                    'Confirmar Cancelamento',
                    'Voltar'
                );
                if (!confirmed) return;

                const motivo = await NaxioUI.prompt('Motivo', 'Motivo do cancelamento:', '', 'Ex: Erro no lançamento');

                const { data: order } = await _sb.from('orders').select('*').eq('id', orderId).single();
                if (!order) return;

                // Se tem product_id, restaura estoque
                if (order.product_id) {
                    const { data: prod } = await _sb.from('products').select('estoque').eq('id', order.product_id).single();
                    if (prod) {
                        await _sb.from('products').update({ estoque: (prod.estoque || 0) + (order.quantidade || 1) }).eq('id', order.product_id);
                    }
                }

                await _sb.from('orders').update({
                    status: 'cancelado',
                    observacoes: `[CANCELADO] ${motivo || 'Sem motivo'} em ${new Date().toLocaleString('pt-BR')}`
                }).eq('id', orderId);

                App.utils.toast("Venda cancelada!", "success");

                // 🔥 RECALCULA CAIXA SE ESTIVER ABERTO
                if (window.Caixa && window.Caixa.calcTotals) {
                    await window.Caixa.calcTotals();
                }

                if (App.store.loadMyProducts) App.store.loadMyProducts();
            },

            returnSale: async (orderId) => {
                const motivo = await NaxioUI.prompt('Devolução', 'Motivo da devolução:', '', 'Ex: Peça defeituosa');
                if (!motivo) return;

                const { data: order } = await _sb.from('orders').select('*').eq('id', orderId).single();
                if (!order) return;

                // Restaura estoque
                if (order.product_id) {
                    const { data: prod } = await _sb.from('products').select('estoque').eq('id', order.product_id).single();
                    if (prod) {
                        await _sb.from('products').update({ estoque: (prod.estoque || 0) + (order.quantidade || 1) }).eq('id', order.product_id);
                    }
                }

                // Marca como devolvido
                await _sb.from('orders').update({
                    status: 'devolvido',
                    observacoes: `[DEVOLUÇÃO] ${motivo} em ${new Date().toLocaleString('pt-BR')}`
                }).eq('id', orderId);

                // Registra no financeiro como despesa (saída)
                await _sb.from('financial_records').insert({
                    store_id: App.state.storeId,
                    tipo: 'despesa',
                    categoria: 'devolucao',
                    descricao: `Devolução: ${motivo}`,
                    valor: -(parseFloat(order.total_pago) || 0),
                    status: 'pago',
                    data_pagamento: new Date()
                });

                App.utils.toast("Devolução registrada e estoque restaurado!", "success");

                // 🔥 RECALCULA CAIXA SE ESTIVER ABERTO
                if (window.Caixa && window.Caixa.calcTotals) {
                    await window.Caixa.calcTotals();
                }

                if (App.store.loadMyProducts) App.store.loadMyProducts();
            },

            // =========================================================================
            // 📋 FOLHA DE PAGAMENTO
            // =========================================================================
            openPayrollPanel: async () => {
                const now = new Date();
                const mesAtual = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

                // Busca equipe
                const { data: staff } = await _sb.from('store_staff')
                    .select('*, profiles(nome_completo, email)')
                    .eq('store_id', App.state.storeId);

                if (!staff || staff.length === 0) {
                    return NaxioUI.alert('Equipe Vazia', 'Cadastre funcionários primeiro na aba Equipe.', 'warning');
                }

                // Busca OS concluídas do mês com itens
                const { data: osCompletas } = await _sb.from('service_orders')
                    .select('id, valor_total, status, created_at')
                    .eq('store_id', App.state.storeId)
                    .eq('status', 'concluida')
                    .gte('created_at', startOfMonth)
                    .lte('created_at', endOfMonth);

                let osIds = (osCompletas || []).map(o => o.id);
                let allItems = [];
                if (osIds.length > 0) {
                    const { data: itemsData } = await _sb.from('service_order_items')
                        .select('*')
                        .in('os_id', osIds);
                    allItems = itemsData || [];
                }

                // Busca vales pendentes do mês
                const { data: vales } = await _sb.from('financial_records')
                    .select('*')
                    .eq('store_id', App.state.storeId)
                    .eq('tipo', 'vale_funcionario')
                    .eq('status', 'pendente');

                // Calcula folha por funcionário
                const folha = staff.map(s => {
                    const comissaoPercent = s.comissao_percentual || 0;
                    const nome = s.profiles?.nome_completo || 'Funcionário';

                    // Serviços feitos por este funcionário
                    const servicosFunc = allItems.filter(i =>
                        i.tipo === 'servico' && i.comissao_funcionario_id === s.profile_id
                    );
                    const totalServicos = servicosFunc.reduce((a, i) => a + (i.qtd * i.preco_unitario), 0);
                    const comissaoValor = totalServicos * (comissaoPercent / 100);

                    // Vales deste funcionário
                    const valesFunc = (vales || []).filter(v => v.funcionario_id === s.profile_id);
                    const totalVales = valesFunc.reduce((a, v) => a + Math.abs(v.valor), 0);

                    const liquido = comissaoValor - totalVales;

                    return {
                        id: s.id,
                        profile_id: s.profile_id,
                        nome,
                        cargo: s.cargo_detalhado || 'Funcionário',
                        comissaoPercent,
                        qtdServicos: servicosFunc.length,
                        totalServicos,
                        comissaoValor,
                        totalVales,
                        qtdVales: valesFunc.length,
                        liquido
                    };
                });

                const totalGeral = folha.reduce((a, f) => a + Math.max(f.liquido, 0), 0);

                const html = `
                <div id="payroll-modal" class="modal-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-content" style="max-width:900px; height:90vh; display:flex; flex-direction:column;">
                        <div class="modal-header" style="background:linear-gradient(135deg, #047857, #059669);">
                            <h3 style="color:#fff;"><i class="ri-receipt-line"></i> Folha de Pagamento - ${mesAtual}</h3>
                            <button class="btn btn-sm" style="background:rgba(255,255,255,0.2); color:#fff; border:none;" onclick="document.getElementById('payroll-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body" style="flex:1; overflow-y:auto;">
                            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
                                <div style="background:#f0fdf4; padding:12px; border-radius:10px; text-align:center; border:1px solid #bbf7d0;">
                                    <div style="font-size:0.75rem; color:#065f46;">OS Concluídas</div>
                                    <div style="font-size:1.5rem; font-weight:800; color:#059669;">${osIds.length}</div>
                                </div>
                                <div style="background:#eff6ff; padding:12px; border-radius:10px; text-align:center; border:1px solid #bfdbfe;">
                                    <div style="font-size:0.75rem; color:#1e40af;">Total Comissões</div>
                                    <div style="font-size:1.5rem; font-weight:800; color:#1d4ed8;">R$ ${folha.reduce((a, f) => a + f.comissaoValor, 0).toFixed(2)}</div>
                                </div>
                                <div style="background:#fef2f2; padding:12px; border-radius:10px; text-align:center; border:1px solid #fecaca;">
                                    <div style="font-size:0.75rem; color:#991b1b;">Deduções (Vales)</div>
                                    <div style="font-size:1.5rem; font-weight:800; color:#dc2626;">- R$ ${folha.reduce((a, f) => a + f.totalVales, 0).toFixed(2)}</div>
                                </div>
                            </div>

                            <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                                <table style="width:100%; border-collapse:collapse;">
                                    <thead>
                                        <tr style="background:#1e293b; color:#fff;">
                                            <th style="padding:10px; text-align:left; font-size:0.8rem;">Funcionário</th>
                                            <th style="padding:10px; text-align:center; font-size:0.8rem;">Cargo</th>
                                            <th style="padding:10px; text-align:center; font-size:0.8rem;">Serviços</th>
                                            <th style="padding:10px; text-align:right; font-size:0.8rem;">Total Serv.</th>
                                            <th style="padding:10px; text-align:center; font-size:0.8rem;">Com. %</th>
                                            <th style="padding:10px; text-align:right; font-size:0.8rem;">Comissão</th>
                                            <th style="padding:10px; text-align:right; font-size:0.8rem; color:#fca5a5;">Vales</th>
                                            <th style="padding:10px; text-align:right; font-size:0.8rem; font-weight:bold;">Líquido</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${folha.map(f => `
                                            <tr style="border-bottom:1px solid #eee;">
                                                <td style="padding:10px; font-weight:600;">${f.nome}</td>
                                                <td style="padding:10px; text-align:center;"><span style="background:#e2e8f0; padding:2px 8px; border-radius:20px; font-size:0.75rem;">${f.cargo}</span></td>
                                                <td style="padding:10px; text-align:center;">${f.qtdServicos}</td>
                                                <td style="padding:10px; text-align:right;">R$ ${f.totalServicos.toFixed(2)}</td>
                                                <td style="padding:10px; text-align:center;">${f.comissaoPercent}%</td>
                                                <td style="padding:10px; text-align:right; color:#059669; font-weight:bold;">R$ ${f.comissaoValor.toFixed(2)}</td>
                                                <td style="padding:10px; text-align:right; color:#dc2626;">- R$ ${f.totalVales.toFixed(2)} ${f.qtdVales > 0 ? `(${f.qtdVales})` : ''}</td>
                                                <td style="padding:10px; text-align:right; font-weight:800; font-size:1rem; color:${f.liquido >= 0 ? '#059669' : '#dc2626'};">R$ ${f.liquido.toFixed(2)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                    <tfoot>
                                        <tr style="background:#f8fafc; font-weight:bold;">
                                            <td colspan="7" style="padding:12px; text-align:right; font-size:1rem;">TOTAL A PAGAR:</td>
                                            <td style="padding:12px; text-align:right; font-size:1.2rem; color:#059669;">R$ ${totalGeral.toFixed(2)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer" style="display:flex; gap:8px;">
                            <button class="btn btn-info" style="flex:1;" onclick="App.autopecas.printPayroll()"><i class="ri-printer-line"></i> Imprimir Folha</button>
                            <button class="btn btn-success" style="flex:1;" onclick="App.autopecas.confirmPayroll()"><i class="ri-check-double-line"></i> Confirmar Pagamentos</button>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);

                // Salva dados da folha para usar na confirmação
                App.autopecas._payrollData = folha;
            },

            printPayroll: () => {
                const content = document.querySelector('#payroll-modal .modal-body');
                const storeName = App.state.currentStore?.nome || 'Loja';
                const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

                if (!content) return;

                const printWin = window.open('', '_blank', 'width=900,height=700');

                // Clona o conteúdo para manipular antes de imprimir
                const clone = content.cloneNode(true);

                // Remove elementos que não devem sair na impressão (se houver)
                const noPrint = clone.querySelectorAll('.no-print');
                noPrint.forEach(el => el.remove());

                printWin.document.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Folha de Pagamento - ${storeName}</title>
                        <style>
                            @page { size: A4; margin: 5mm; }
                            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 10px; font-size: 10px; color: #000; -webkit-print-color-adjust: exact; }
                            h2 { text-align: center; margin-bottom: 5px; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 5px; }
                            .header-info { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10px; }
                            
                            /* Layout de Gride para Cards de Resumo */
                            .stats-container { display: flex; gap: 10px; margin-bottom: 10px; justify-content: center; }
                            .stat-box { border: 1px solid #ccc; padding: 5px; border-radius: 4px; text-align: center; flex: 1; }
                            .stat-label { font-size: 9px; color: #666; text-transform: uppercase; }
                            .stat-value { font-size: 12px; font-weight: bold; margin-top: 2px; }

                            /* Tabela Compacta */
                            table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 9px; }
                            th { background-color: #eee !important; color: #000 !important; font-weight: bold; text-align: left; padding: 4px; border: 1px solid #999; }
                            td { padding: 4px; border: 1px solid #ccc; vertical-align: middle; }
                            tr:nth-child(even) { background-color: #f9f9f9; }
                            tfoot td { background-color: #eee; font-weight: bold; border-top: 2px solid #000; font-size: 11px; }
                            
                            /* Ajustes de cores para impressão B&W friendly */
                            .text-success { color: #000; }
                            .text-danger { color: #000; }
                        </style>
                    </head>
                    <body>
                        <h2>Folha de Pagamento - ${storeName}</h2>
                        <div class="header-info">
                            <span><strong>Mês de Referência:</strong> ${mes}</span>
                            <span><strong>Emissão:</strong> ${new Date().toLocaleString()}</span>
                            <span><strong>Resp:</strong> ${App.state.user?.email || 'Sistema'}</span>
                        </div>
                        
                        ${clone.innerHTML}
                        
                        <div style="margin-top: 30px; display: flex; justify-content: space-around; text-align: center;">
                            <div style="border-top: 1px solid #000; width: 40%; padding-top: 5px;">Assinatura Responsável</div>
                            <div style="border-top: 1px solid #000; width: 40%; padding-top: 5px;">Visto Financeiro</div>
                        </div>

                        <script>
                            // Ajusta cores para impressão
                            document.querySelectorAll('*').forEach(el => {
                                el.style.color = '#000';
                                if(el.style.backgroundColor && el.style.backgroundColor !== 'transparent') {
                                    el.style.backgroundColor = '#fff'; // Remove fundos coloridos para economizar tinta
                                }
                            });
                            setTimeout(() => { window.print(); window.close(); }, 800);
                        </script>
                    </body>
                    </html>
                `);
                printWin.document.close();
            },

            confirmPayroll: async () => {
                const folha = App.autopecas._payrollData;
                if (!folha) return;

                const confirmed = await NaxioUI.confirm(
                    'Confirmar Pagamento',
                    'Ao confirmar, todos os vales pendentes serão marcados como "descontados". Deseja prosseguir?',
                    'Confirmar',
                    'Cancelar'
                );
                if (!confirmed) return;

                // Marca vales como pagos
                for (const f of folha) {
                    if (f.totalVales > 0) {
                        await _sb.from('financial_records')
                            .update({ status: 'pago', data_pagamento: new Date() })
                            .eq('store_id', App.state.storeId)
                            .eq('tipo', 'vale_funcionario')
                            .eq('funcionario_id', f.profile_id)
                            .eq('status', 'pendente');
                    }
                }

                App.utils.toast("Folha confirmada! Vales descontados.", "success");
                document.getElementById('payroll-modal')?.remove();
            }
        }
    });

    // Auto-start logic if needed
    setTimeout(() => {
        if (App.state.user && App.state.currentStore) {
            App.autopecas.init();
        }
    }, 2000);
}
