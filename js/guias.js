// 🎯 SISTEMA COMPLETO DE GUIAS E COMISSÕES
// Versão: 3.1 Enterprise (Correção: Listagem de Comandas Específicas)

const GuiasSystem = {
    state: {
        currentGuia: null,
        relatorios: []
    },

    init: async () => {
        console.log("👔 Sistema de Guias Inicializado");
    },

    // =========================================================================
    // 📝 1. CADASTRO E GERENCIAMENTO
    // =========================================================================

    openCadastro: async () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10001;';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>👔 Gerenciar Guias (Agências/Turismo)</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #bae6fd;">
                        <h5 style="color: #0284c7; margin-top: 0;" id="form-guia-title">➕ Novo Guia</h5>
                        <input type="hidden" id="guia-id-edit" value="">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <input type="text" id="guia-nome" placeholder="Nome Completo" class="input-field">
                            <input type="email" id="guia-email" placeholder="Email" class="input-field">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                            <input type="text" id="guia-cpf" placeholder="CPF" class="input-field">
                            <input type="tel" id="guia-telefone" placeholder="Telefone" class="input-field">
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <input type="number" id="guia-comissao" placeholder="% Comissão" class="input-field" value="10">
                            <div style="display: flex; gap: 10px;">
                                <button class="btn btn-secondary" style="width: 100%; display: none;" id="btn-cancel-edit-guia" onclick="GuiasSystem.cancelarEdicao()">❌ Cancelar</button>
                                <button class="btn btn-success" style="width: 100%;" onclick="GuiasSystem.salvarGuia()">💾 Salvar</button>
                            </div>
                        </div>
                    </div>

                    <h5>📋 Guias Cadastrados</h5>
                    <div id="lista-guias-cadastrados" style="max-height: 300px; overflow-y: auto;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        await GuiasSystem.carregarLista();
    },

    salvarGuia: async () => {
        if (!App.state.storeId) return alert("Erro crítico: Loja não identificada.");

        const idEdit = document.getElementById('guia-id-edit').value;
        const nome = document.getElementById('guia-nome').value.trim();
        const email = document.getElementById('guia-email').value.trim();
        const cpf = document.getElementById('guia-cpf').value.trim();
        const telefone = document.getElementById('guia-telefone').value.trim();
        const comissao = parseFloat(document.getElementById('guia-comissao').value) || 10;

        if (!nome) return alert("Nome é obrigatório!");

        if (idEdit) {
            const { error } = await _sb.from('guides').update({
                name: nome,
                email: email,
                cpf: cpf,
                phone: telefone,
                commission_percentage: comissao
            }).eq('id', idEdit);

            if (error) {
                alert("Erro ao atualizar: " + error.message);
            } else {
                // 🔥 Atualiza também o nome do guia em todas as comandas que já estavam atribuídas a ele
                await _sb.from('comandas')
                    .update({ guide_name: nome })
                    .eq('guide_id', idEdit);

                // Força atualização da tela se estiver na visão principal
                if (typeof App.store !== 'undefined' && App.store.loadComandas) {
                    App.store.loadComandas();
                }

                App.utils.toast("✅ Guia atualizado com sucesso!", "success");
                GuiasSystem.cancelarEdicao();
                GuiasSystem.carregarLista();
            }
        } else {
            const { error } = await _sb.from('guides').insert({
                store_id: App.state.storeId,
                name: nome,
                email: email,
                cpf: cpf,
                phone: telefone,
                commission_percentage: comissao,
                status: 'ativo'
            });

            if (error) {
                alert("Erro ao salvar: " + error.message);
            } else {
                App.utils.toast("✅ Guia salvo!", "success");
                GuiasSystem.cancelarEdicao();
                GuiasSystem.carregarLista();
            }
        }
    },

    carregarLista: async () => {
        if (!App.state.storeId) return;

        const { data: guias } = await _sb.from('guides')
            .select('*')
            .eq('store_id', App.state.storeId)
            .order('name', { ascending: true });

        const container = document.getElementById('lista-guias-cadastrados');

        if (!guias || guias.length === 0) {
            container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Nenhum guia cadastrado.</p>';
            return;
        }

        container.innerHTML = guias.map(g => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #003172; background: ${g.status === 'ativo' ? '#1206b6ab' : '#1206b6ab'};">
                <div>
                    <strong style="color: #ffffff;">${g.name}</strong> <span class="text-xs badge">${g.commission_percentage}%</span><br>
                    <span class="text-xs text-muted">${g.phone || 'S/ Tel'}</span>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-sm btn-primary" onclick="GuiasSystem.editar('${g.id}')">✏️</button>
                    <button class="btn btn-sm btn-secondary" onclick="GuiasSystem.toggleStatus('${g.id}', '${g.status}')">
                        ${g.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="GuiasSystem.deletar('${g.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    },

    editar: async (id) => {
        const { data: guia } = await _sb.from('guides').select('*').eq('id', id).single();
        if (!guia) return;
        
        document.getElementById('guia-id-edit').value = guia.id;
        document.getElementById('guia-nome').value = guia.name || '';
        document.getElementById('guia-email').value = guia.email || '';
        document.getElementById('guia-cpf').value = guia.cpf || '';
        document.getElementById('guia-telefone').value = guia.phone || '';
        document.getElementById('guia-comissao').value = guia.commission_percentage || 10;
        
        document.getElementById('form-guia-title').innerText = '✏️ Editar Guia';
        document.getElementById('btn-cancel-edit-guia').style.display = 'block';
    },

    cancelarEdicao: () => {
        if(document.getElementById('guia-id-edit')) document.getElementById('guia-id-edit').value = '';
        if(document.getElementById('guia-nome')) document.getElementById('guia-nome').value = '';
        if(document.getElementById('guia-email')) document.getElementById('guia-email').value = '';
        if(document.getElementById('guia-cpf')) document.getElementById('guia-cpf').value = '';
        if(document.getElementById('guia-telefone')) document.getElementById('guia-telefone').value = '';
        if(document.getElementById('guia-comissao')) document.getElementById('guia-comissao').value = 10;
        
        if(document.getElementById('form-guia-title')) document.getElementById('form-guia-title').innerText = '➕ Novo Guia';
        if(document.getElementById('btn-cancel-edit-guia')) document.getElementById('btn-cancel-edit-guia').style.display = 'none';
    },

    toggleStatus: async (id, currentStatus) => {
        const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
        await _sb.from('guides').update({ status: newStatus }).eq('id', id);
        GuiasSystem.carregarLista();
    },

    deletar: async (id) => {
        if (!confirm("Tem certeza?")) return;
        await _sb.from('guides').delete().eq('id', id);
        GuiasSystem.carregarLista();
    },

    // =========================================================================
    // 🎯 2. VÍNCULO COM A COMANDA
    // =========================================================================

    selecionarGuiaParaComanda: async (comandaId, numeroComanda) => {
        const { data: guias } = await _sb.from('guides')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('status', 'ativo')
            .order('name');

        if (!guias || guias.length === 0) {
            if (confirm("⚠️ Nenhum guia cadastrado!\n\nDeseja cadastrar agora?")) GuiasSystem.openCadastro();
            return null;
        }

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'modal-selecionar-guia';
            modal.style.cssText = 'display: flex; z-index: 10002;';

            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>🎯 Comanda ${numeroComanda} - Selecionar Guia</h3>
                        <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                    </div>
                    <div class="modal-body">
                        <div style="display: grid; gap: 10px; margin-top: 15px;">
                            ${guias.map(g => `
                                <button class="btn btn-secondary" style="width: 100%; text-align: left;" 
                                    onclick="GuiasSystem.confirmarSelecao('${g.id}', '${g.name}', '${comandaId}')">
                                    <strong>${g.name}</strong> (Comissão: ${g.commission_percentage}%)
                                </button>
                            `).join('')}
                        </div>
                        <hr style="margin: 15px 0;">
                        <button class="btn btn-secondary btn-full" onclick="GuiasSystem.confirmarSelecao(null, 'Sem Guia', '${comandaId}')">
                            ➡️ Continuar sem selecionar guia
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        });
    },

    confirmarSelecao: async (guiaId, guiaNome, comandaId) => {
        if (guiaId) {
            const nomeLimpo = (guiaNome || '').trim();
            await _sb.from('comandas').update({ guide_id: guiaId, guide_name: nomeLimpo }).eq('id', comandaId);
            App.utils.toast(`✅ Guia "${nomeLimpo}" atribuído`, "success");
        } else {
            await _sb.from('comandas').update({ guide_id: null, guide_name: null }).eq('id', comandaId);
            App.utils.toast(`✅ Guia removido`, "success");
        }

        const guideModal = document.getElementById('modal-selecionar-guia');
        if (guideModal) {
            guideModal.remove();
        } else {
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
        }

        // Se estiver no caixa (App.store) e com o modal principal aberto, atualiza a tela
        if (typeof App.store !== 'undefined' && App.store.state && App.state.currentComanda === comandaId) {
            await App.store.fetchMesaDetails(App.state.currentMesaNum);
            App.store.renderActiveTab(App.state.currentMesaNum, App.state.currentComandaItems);
            App.store.loadComandas(); // Atualiza grid de fundo
            if (document.getElementById('checkout-resumo')?.style.display === 'block') {
                App.store.checkMesaRapida(); // Atualiza barra de checkout rápido se ativa
            }
        }

        if (typeof App.waiter !== 'undefined' && App.waiter.openComanda) {
            setTimeout(() => App.waiter.openComanda(comandaId, ''), 300);
        }
    },

    // =========================================================================
    // 📊 3. RELATÓRIOS E IMPRESSÃO (MODIFICADO: LISTA DE MESAS)
    // =========================================================================

    gerarRelatorio: async () => {
        const { data: listGuias } = await _sb.from('guides').select('id, name').eq('store_id', App.state.storeId).order('name');

        let dataListOptions = '';
        window.guiasCache = listGuias || []; // Salva pra pesquisar depois
        if (listGuias) {
            listGuias.forEach(g => {
                dataListOptions += `<option value="${g.name}">`;
            });
        }

        const btnHtml = `
            <div id="modal-filtro-guia" class="modal-overlay" style="display:flex; z-index:10005;" onkeydown="if(event.key === 'Enter') { event.stopPropagation(); event.preventDefault(); GuiasSystem.executarRelatorioFiltrado(); }">
                <div class="modal-content" style="max-width:400px; background:var(--surface);">
                    <div class="modal-header"><h3>🚩 Filtro de Relatório</h3><button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button></div>
                    <div class="modal-body">
                        <label>Pesquisar Guia (Deixe em branco para TODOS):</label>
                        <input list="lista-guias-opcoes" id="filtro-guia-nome" class="input-field" placeholder="Ex: Roberto (ou deixe vazio)" style="margin-bottom:15px;" autocomplete="off">
                        <datalist id="lista-guias-opcoes">
                            ${dataListOptions}
                        </datalist>
                        <label>Data Início:</label>
                        <input type="date" id="filtro-guia-ini" class="input-field" value="${new Date().toISOString().split('T')[0]}" style="margin-bottom:10px;">
                        <label>Data Fim:</label>
                        <input type="date" id="filtro-guia-fim" class="input-field" value="${new Date().toISOString().split('T')[0]}" style="margin-bottom:15px;">
                        <button class="btn btn-primary btn-full" onclick="GuiasSystem.executarRelatorioFiltrado()">🔍 Gerar Relatório</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', btnHtml);
        setTimeout(() => document.getElementById('filtro-guia-nome').focus(), 100);
    },

    executarRelatorioFiltrado: async () => {
        const nomeDigitado = document.getElementById('filtro-guia-nome').value.trim().toLowerCase();
        const dI = document.getElementById('filtro-guia-ini').value;
        const dF = document.getElementById('filtro-guia-fim').value;

        document.getElementById('modal-filtro-guia').remove();

        if (!dI || !dF) return;

        // Nome da loja para o cabeçalho
        const nomeLoja = (App.state.currentStore?.nome_loja) || App.state.profile?.nome_loja || 'Naxio Sistema';

        let idsPermitidos = [];
        if (nomeDigitado && window.guiasCache) {
            idsPermitidos = window.guiasCache.filter(g => g.name.toLowerCase().includes(nomeDigitado)).map(g => g.id);
            if (idsPermitidos.length === 0) {
                return alert('⚠️ Nenhum guia localizado com o nome: "' + nomeDigitado + '"');
            }
        }

        const dataInicioBR = new Date(dI + 'T12:00:00').toLocaleDateString('pt-BR');
        const dataFimBR = new Date(dF + 'T12:00:00').toLocaleDateString('pt-BR');

        // 🔥 Busca guias (Sem filtro de 'ativo' para permitir relatórios históricos)
        let queryGuias = _sb.from('guides')
            .select('id, name, commission_percentage')
            .eq('store_id', App.state.storeId)
            .order('name');

        if (idsPermitidos.length > 0) queryGuias = queryGuias.in('id', idsPermitidos);

        const { data: guiasList } = await queryGuias;
        if (!guiasList || guiasList.length === 0) return alert("⚠️ Nenhum guia encontrado.");

        // 1. Busca todas as ordens (Vendas finalizadas) no período
        const { data: orders, error: errorOrders } = await _sb.from('orders')
            .select('id, total_pago, observacao, created_at')
            .eq('store_id', App.state.storeId)
            .gte('created_at', `${dI}T00:00:00`)
            .lte('created_at', `${dF}T23:59:59`);

        if (errorOrders) return alert("Erro ao buscar vendas: " + errorOrders.message);

        // 2. Busca Comandas no período
        // 🔥 CORREÇÃO: Filtro de data também aplicado às comandas ocupadas (created_at no período)
        // Sem este filtro, comandas ocupadas de OUTROS dias eram incluídas no relatório
        const { data: activeComandas, error: errorComandas } = await _sb.from('comandas')
            .select('id, total_pago, guide_id, guide_name, numero, items, status, updated_at, created_at')
            .eq('store_id', App.state.storeId)
            .not('guide_name', 'is', null)
            .neq('guide_name', '')
            .or(`status.eq.ocupada,status.eq.aberta,status.eq.pagando,status.eq.livre,and(status.in.(fechada,paga),updated_at.gte.${dI}T00:00:00,updated_at.lte.${dF}T23:59:59)`)
            .order('numero');

        if (errorComandas) {
            console.error("Erro ao buscar comandas:", errorComandas);
        }

        // Monta mapa guiaId -> dados do guia
        const relatorio = {};

        // Inicializa relatórios dos guias encontrados
        guiasList.forEach(g => {
            const key = g.name.trim().toLowerCase();
            relatorio[key] = {
                id: g.id,
                nome: g.name.trim(),
                pct: parseFloat(g.commission_percentage) || 10,
                comandas: [],
                vendaTotal: 0,
                comissaoTotal: 0
            };
        });

        // 🔥 Nomes reais (do banco) dos guias filtrados — usados para match robusto
        // Isso evita que diferenças entre o nome digitado e o nome salvo nas comandas/orders
        // causem a busca individual falhar (ex: user digitou nome completo mas banco tem nome parcial)
        const nomesGuiasPermitidos = guiasList.map(g => g.name.trim().toLowerCase());

        // Verifica se um nome de guia (da order/comanda) bate com o filtro ativo
        // Usa comparação bidirecional + contra os nomes reais do banco
        const guiaPassaFiltro = (guiaKeyToCheck) => {
            if (!nomeDigitado) return true; // sem filtro = tudo passa
            // Checa: o texto digitado está contido no nome salvo? OU vice-versa?
            if (guiaKeyToCheck.includes(nomeDigitado) || nomeDigitado.includes(guiaKeyToCheck)) return true;
            // Checa: o nome salvo está contido em algum dos nomes reais do guiasList?
            return nomesGuiasPermitidos.some(n => n.includes(guiaKeyToCheck) || guiaKeyToCheck.includes(n));
        };

        // 🔥 SET para rastrear números de comandas já contabilizados via 'orders'
        // Evita duplicação: se uma comanda fechou e gerou uma order, não conta duas vezes
        const comandasContabilizadasViaOrder = new Set();

        // Preenche dados das vendas finalizadas (Orders)
        if (orders) {
            orders.forEach(o => {
                let obsObj = {};
                try {
                    if (o.observacao && o.observacao.startsWith('{')) obsObj = JSON.parse(o.observacao);
                } catch (e) { }
                
                // 🔥 POPULA O SET DE EXCLUSÃO PARA TODAS AS ORDENS
                // Isso garante que qualquer mesa que já tenha gerado uma 'order' (venda finalizada)
                // seja ignorada na listagem secundária das 'comandas', evitando duplicidade,
                // INDEPENDENTE do filtro de guia atual.
                const guiaNome = (obsObj.guia || '').trim();
                
                // Se a order não tem guia, não adiciona no set de exclusão.
                // Isso permite que a busca nas 'comandas' recupere essa venda usando o guia salvo nela.
                if (!guiaNome) return;

                let mesaNum = obsObj.mesa;
                if (mesaNum && typeof mesaNum === 'object') mesaNum = mesaNum.numero || mesaNum.id || String(mesaNum);
                if (mesaNum) {
                    comandasContabilizadasViaOrder.add(String(mesaNum).trim());
                }


                const guiaKey = guiaNome.toLowerCase();
                // 🔥 Usa comparação bidirecional robusta (evita falhar quando nome salvo difere do digitado)
                if (!guiaPassaFiltro(guiaKey)) return;

                // Tenta achar a chave correspondente no relatorio atual por inclusão
                let matchedKey = guiaKey;
                if (!relatorio[matchedKey]) {
                    // Tenta achar ignorando maiúsculas e espaços extras
                    for (let existingKey in relatorio) {
                        if (existingKey === guiaKey) {
                            matchedKey = existingKey;
                            break;
                        }
                    }
                }

                // Se o guia não existir no mapa (talvez deletado ou inativo não retornado no guiasList), cria entrada bruta
                if (!relatorio[matchedKey]) {
                    relatorio[matchedKey] = { id: null, nome: guiaNome, pct: 10, comandas: [], vendaTotal: 0, comissaoTotal: 0 };
                }

                const guia = relatorio[matchedKey];
                const totalPago = parseFloat(o.total_pago || 0);

                // 🔥 Comissão deve ser sobre o CONSUMO (sem taxa de serviço)
                // Se o obsObj tiver o subtotal/consumo explícito, usa ele
                // Senão, se houver taxa de serviço no obsObj, subtrai ela
                // Senão, assume que não há taxa (ex: comandas internas/balcão)
                let consumo = totalPago;
                if (obsObj.subtotal !== undefined) {
                    consumo = parseFloat(obsObj.subtotal || 0);
                } else if (obsObj.taxa_servico !== undefined) {
                    consumo = totalPago - parseFloat(obsObj.taxa_servico || 0);
                } else if (obsObj.taxa && parseFloat(obsObj.taxa) > 0) {
                    consumo = totalPago - parseFloat(obsObj.taxa);
                }
                // 🔥 REMOVIDO: divisão genérica por 1.10 — incorreta para mesas isentas de taxa

                const totalVenda = consumo;
                const comissao = totalVenda * (guia.pct / 100);

                guia.vendaTotal += totalVenda;
                guia.comissaoTotal += comissao;

                guia.comandas.push({
                    idOrder: o.id,
                    numero: mesaNum || 'S/N',
                    status: 'fechada',
                    venda: totalVenda,
                    comissao: comissao
                });
            });
        }

        // Preenche dados das comandas (abertas ou fechadas que NÃO geraram order ainda)
        if (activeComandas) {
            activeComandas.forEach(c => {
                const guiaNome = (c.guide_name || '').trim();

                // Se a comanda está fechada ou paga, verifica se pertence ao período do relatório
                if (c.status === 'fechada' || c.status === 'paga') {
                    const dataRef = c.updated_at || c.created_at;
                    if (!dataRef || dataRef < `${dI}T00:00:00` || dataRef > `${dF}T23:59:59`) {
                        return;
                    }
                    // 🔥 Se a comanda fechada já foi contabilizada via a tabela 'orders', IGNORA para não duplicar
                    if (comandasContabilizadasViaOrder.has(String(c.numero).trim())) {
                        return;
                    }
                }
                // Se for OCUPADA, não checamos o Set de exclusão, pois pode ser uma nova sessão 
                // aberta na mesma mesa logo após o fechamento da anterior.
                

                if (!guiaNome) return;

                const guiaKey = guiaNome.toLowerCase();
                // 🔥 Usa comparação bidirecional robusta (evita falhar quando nome salvo difere do digitado)
                if (!guiaPassaFiltro(guiaKey)) return;

                let matchedKey = null;

                // 1. Tenta encontrar pelo ID do guia (mais seguro)
                if (c.guide_id) {
                    for (let key in relatorio) {
                        if (relatorio[key].id === c.guide_id) {
                            matchedKey = key;
                            break;
                        }
                    }
                }

                // 2. Fallback para busca exata pelo nome
                if (!matchedKey) {
                    matchedKey = guiaKey;
                    if (!relatorio[matchedKey]) {
                        for (let existingKey in relatorio) {
                            if (existingKey === guiaKey) {
                                matchedKey = existingKey;
                                break;
                            }
                        }
                    }
                }

                if (!relatorio[matchedKey]) {
                    relatorio[matchedKey] = { id: c.guide_id, nome: guiaNome, pct: 10, comandas: [], vendaTotal: 0, comissaoTotal: 0 };
                }

                const guia = relatorio[matchedKey];
                const items = typeof c.items === 'string' ? JSON.parse(c.items || '[]') : (c.items || []);
                const totalVenda = items.reduce((acc, i) => acc + (parseFloat(i.price || 0) * (parseInt(i.qtd) || 1)), 0);
                const comissao = totalVenda * (guia.pct / 100);

                guia.vendaTotal += totalVenda;
                guia.comissaoTotal += comissao;

                guia.comandas.push({
                    numero: c.numero,
                    status: c.status,
                    venda: totalVenda,
                    comissao: comissao
                });
            });
        }

        // Filtra para remover guias que não tiveram comandas no período
        const relatorioFiltrado = {};
        let temComandas = false;

        Object.keys(relatorio).forEach(guiaId => {
            const guia = relatorio[guiaId];
            if (guia.comandas.length > 0) {
                relatorioFiltrado[guiaId] = guia;
                temComandas = true;
            }
        });

        if (!temComandas) {
            return alert("⚠️ Nenhuma comanda registrada para os guias neste período.");
        }

        GuiasSystem.exibirRelatorio(relatorioFiltrado, dataInicioBR, dataFimBR, nomeLoja);
    },

    // Exibe o modal na tela e prepara a impressão via Iframe
    exibirRelatorio: (dados, inicio, fim, nomeLoja) => {
        nomeLoja = nomeLoja || 'Naxio Sistema';
        const totalVendaGeral = Object.values(dados).reduce((acc, g) => acc + g.vendaTotal, 0);
        const totalComissaoGeral = Object.values(dados).reduce((acc, g) => acc + g.comissaoTotal, 0);

        // ======================================================================
        // HTML PARA A TELA (modal)
        // ======================================================================
        const linhasTela = Object.values(dados).map(g => {
            // Linha do nome do guia
            const headerGuia = `
                <tr style="background:#1e293b;">
                    <td colspan="3" style="padding:10px 12px; font-weight:bold; font-size:1rem; color:#fff;">
                        👤 ${g.nome} &nbsp;<span style="color:#a3e635; font-size:0.85rem;">${g.pct}% comissão</span>
                    </td>
                </tr>`;

            // Linhas individuais de cada comanda
            const linhasComandas = g.comandas.length > 0 ? g.comandas.map(m => {
                let statusBadge = (m.status === 'fechada' || m.status === 'paga')
                    ? `<span style="background:#10b981; color:#fff; padding:1px 6px; border-radius:4px; font-size:0.75rem;">${m.status === 'paga' ? 'Paga' : 'Fechada'}</span>`
                    : `<span style="background:#f59e0b; color:#000; padding:1px 6px; border-radius:4px; font-size:0.75rem;">Aberta</span>`;
                
                // 🔥 Adiciona aviso se não houver consumo ainda
                if (m.venda <= 0) {
                    statusBadge += ` <span style="background:#475569; color:#fff; padding:1px 6px; border-radius:4px; font-size:0.75rem; margin-left:4px;">Sem consumo</span>`;
                }
                return `
                    <tr style="border-bottom:1px solid #334155;">
                        <td style="padding:7px 12px 7px 24px; color:#cbd5e1;">Comanda ${m.numero} ${statusBadge}</td>
                        <td align="right" style="padding:7px 8px; color:#e2e8f0;">R$ ${m.venda.toFixed(2)}</td>
                        <td align="right" style="padding:7px 12px; color:#4ade80; font-weight:bold;">R$ ${m.comissao.toFixed(2)}</td>
                    </tr>`;
            }).join('') : `<tr><td colspan="3" style="padding:7px 24px; color:#64748b; font-style:italic;">Nenhuma comanda no período</td></tr>`;

            // Sub-total do guia
            const subtotalGuia = `
                <tr style="border-bottom:2px solid #475569;">
                    <td style="padding:6px 12px 6px 24px; color:#94a3b8; font-style:italic;">Sub-total ${g.nome}:</td>
                    <td align="right" style="padding:6px 8px; color:#e2e8f0; font-weight:bold;">R$ ${g.vendaTotal.toFixed(2)}</td>
                    <td align="right" style="padding:6px 12px; color:#4ade80; font-weight:bold;">R$ ${g.comissaoTotal.toFixed(2)}</td>
                </tr>`;

            return headerGuia + linhasComandas + subtotalGuia;
        }).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:flex; z-index:10001; align-items:flex-start; padding-top:40px;';

        modal.innerHTML = `
            <div class="modal-content" style="background:var(--surface); color:var(--text-color); max-width:700px; width:100%;">
                <div class="modal-header">
                    <div>
                        <div style="font-size:0.8rem; color:#64748b;">${nomeLoja}</div>
                        <h3 style="margin:0;">👔 Comissões de Guias (${inicio} - ${fim})</h3>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>

                <div class="modal-body" style="padding:0; max-height:65vh; overflow-y:auto;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:#0f172a; color:#94a3b8; font-size:0.8rem;">
                                <th align="left" style="padding:8px 12px;">Guia / Comanda</th>
                                <th align="right" style="padding:8px 8px;">Venda</th>
                                <th align="right" style="padding:8px 12px;">Comissão</th>
                            </tr>
                        </thead>
                        <tbody>${linhasTela}</tbody>
                        <tfoot>
                            <tr style="background:#0f172a;">
                                <td colspan="3" style="padding:0;"></td>
                            </tr>
                            <tr style="border-top:2px solid #10b981;">
                                <td style="padding:12px; font-weight:bold; font-size:1rem; color:#fff;">VENDA GERAL:</td>
                                <td align="right" style="padding:12px 8px; font-weight:bold; font-size:1.1rem; color:#e2e8f0;">R$ ${totalVendaGeral.toFixed(2)}</td>
                                <td align="right" style="padding:12px; font-weight:bold; font-size:1.1rem; color:#4ade80;"></td>
                            </tr>
                            <tr>
                                <td style="padding:4px 12px 12px; font-weight:bold; font-size:1rem; color:#fff;">COMISSÃO GERAL:</td>
                                <td></td>
                                <td align="right" style="padding:4px 12px 12px; font-weight:bold; font-size:1.2rem; color:#4ade80;">R$ ${totalComissaoGeral.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="modal-footer" style="margin-top:0; padding:15px; border-top:1px solid #334155;">
                    <button class="btn btn-primary btn-full" id="btn-print-force">🖨️ Imprimir Cupom Térmico</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // ======================================================================
        // HTML PARA IMPRESSÃO (cupom térmico)
        // ======================================================================
        document.getElementById('btn-print-force').onclick = () => {
            const linhasCupom = Object.values(dados).map(g => {
                // Cabeçalho do guia no cupom
                let bloco = `
                    <div class="guia-header">${g.nome.toUpperCase()} (${g.pct}%)</div>`;

                // Cada comanda
                if (g.comandas.length > 0) {
                    g.comandas.forEach(m => {
                        const statusLabel = m.status === 'ocupada' ? ' [Aberta]' : '';
                        bloco += `
                    <div class="comanda-row" style="display:flex; justify-content:space-between; font-size:14px; font-weight:900; margin:4px 4px;">
                        <span>Comanda ${m.numero}${statusLabel}</span>
                        <span>R$ ${m.comissao.toFixed(2)}</span>
                    </div>`;
                    });
                } else {
                    bloco += `<div class="comanda-vazia">Sem comandas no período</div>`;
                }

                // Sub-total do guia
                bloco += `
                    <div class="subtotal-row">
                        <span>Venda: R$ ${g.vendaTotal.toFixed(2)}</span>
                        <span>Comissão: R$ ${g.comissaoTotal.toFixed(2)}</span>
                    </div>
                    <div class="dashed"></div>`;

                return bloco;
            }).join('');

            const conteudoImpressao = `
                <html>
                <head>
                    <title>Relatório Guias</title>
                    <style>
                        @page { margin: 0; size: auto; }

                        /* ===================================================
                           IMPRESSÃO TÉRMICA - 100% PRETO E NEGRITO
                           Sem cores, sem fundos cinzas, máxima legibilidade
                        =================================================== */
                        * {
                            color: #000 !important;
                            background: #fff !important;
                            -webkit-print-color-adjust: exact;
                        }
                        body {
                            margin: 0;
                            padding: 5px;
                            font-family: 'Arial', sans-serif;
                            font-size: 14px;
                            font-weight: 900;
                            color: #000;
                            width: 280px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 10px;
                            border-bottom: 3px solid #000;
                            padding-bottom: 8px;
                        }
                        .loja {
                            font-size: 17px;
                            font-weight: 900;
                            text-transform: uppercase;
                        }
                        .titulo {
                            font-size: 14px;
                            font-weight: 900;
                            margin-top: 4px;
                            text-transform: uppercase;
                        }
                        .periodo {
                            font-size: 12px;
                            font-weight: 900;
                            margin-top: 2px;
                        }
                        .emitido {
                            font-size: 11px;
                            font-weight: bold;
                            margin-top: 3px;
                        }
                        .dashed {
                            border-top: 2px dashed #000;
                            margin: 7px 0;
                        }
                        .solid {
                            border-top: 2px solid #000;
                            margin: 7px 0;
                        }
                        /* Cabeçalho de cada guia — Negrito máximo, sublinhado */
                        .guia-header {
                            font-size: 15px;
                            font-weight: 900;
                            margin-top: 10px;
                            margin-bottom: 4px;
                            border-bottom: 2px solid #000;
                            padding-bottom: 3px;
                            text-transform: uppercase;
                        }
                        /* Linha de cada comanda */
                        .comanda-row {
                            display: flex;
                            justify-content: space-between;
                            font-size: 14px;
                            font-weight: 900;
                            margin: 4px 4px;
                        }
                        /* Guia sem comandas */
                        .comanda-vazia {
                            font-size: 12px;
                            font-weight: 900;
                            margin: 3px 4px;
                            font-style: italic;
                        }
                        /* Sub-total do guia — linha destacada com borda */
                        .subtotal-row {
                            display: flex;
                            justify-content: space-between;
                            font-size: 14px;
                            font-weight: 900;
                            margin: 4px 0;
                            border-top: 1px solid #000;
                            border-bottom: 1px solid #000;
                            padding: 3px 4px;
                        }
                        /* Totais finais — fonte grande, borda grossa */
                        .total-final {
                            display: flex;
                            justify-content: space-between;
                            font-size: 17px;
                            font-weight: 900;
                            margin-top: 12px;
                            border-top: 3px solid #000;
                            padding-top: 8px;
                        }
                        .total-comissao {
                            display: flex;
                            justify-content: space-between;
                            font-size: 17px;
                            font-weight: 900;
                            margin-top: 5px;
                            border-top: 1px solid #000;
                            padding-top: 5px;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="loja">${nomeLoja}</div>
                        <div class="titulo">RELATORIO DE COMISSOES</div>
                        <div class="periodo">${inicio} ate ${fim}</div>
                        <div class="emitido">Emitido: ${new Date().toLocaleString('pt-BR')}</div>
                    </div>

                    ${linhasCupom}

                    <div class="total-final">
                        <span>VENDA GERAL:</span>
                        <span>R$ ${totalVendaGeral.toFixed(2)}</span>
                    </div>
                    <div class="total-comissao">
                        <span>COMISSAO GERAL:</span>
                        <span>R$ ${totalComissaoGeral.toFixed(2)}</span>
                    </div>

                    <br><br>
                    <div style="text-align:center; border-top:2px solid #000; padding-top:5px; width:80%; margin:0 auto; font-size:13px; font-weight:900;">
                        Assinatura Responsavel
                    </div>
                    <br>
                    <div style="text-align:center;">.</div>
                </body>
                </html>
            `;

            GuiasSystem.imprimirViaIframe(conteudoImpressao);
        };
    },

    // 🚀 MÁGICA DO IFRAME (ESSA FUNÇÃO RESOLVE O PROBLEMA)
    imprimirViaIframe: (htmlContent) => {
        // 1. Remove iframe anterior se existir
        const oldIframe = document.getElementById('print-iframe-hidden');
        if (oldIframe) oldIframe.remove();

        // 2. Cria um novo iframe invisível
        const iframe = document.createElement('iframe');
        iframe.id = 'print-iframe-hidden';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';

        document.body.appendChild(iframe);

        // 3. Escreve o conteúdo dentro do iframe
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();

        // 4. Espera carregar e manda imprimir O IFRAME (não a janela principal)
        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
        }, 500); // Meio segundo de delay para garantir renderização
    }
};

// 🚀 INTEGRAÇÃO COM O WAITER
if (typeof App.waiter !== 'undefined') {
    const originalOpenComanda = App.waiter.openComanda;

    App.waiter.openComanda = async function (id, numero) {
        const { data: comanda } = await _sb.from('comandas').select('guide_id').eq('id', id).single();

        if (comanda && !comanda.guide_id) {
            if (confirm("🎯 Deseja atribuir um Guia (Garçom) a esta comanda?")) {
                await GuiasSystem.selecionarGuiaParaComanda(id, numero);
                return;
            }
        }
        originalOpenComanda.call(this, id, numero);
    };
}

console.log("✅ Sistema de Guias (Versão Iframe + Comandas) Carregado");
