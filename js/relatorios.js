// 📊 RELATÓRIOS EMPRESARIAIS - Versão Final (Correção de Dados + Fonte Grande)
// Arquivo: js/relatorios.js

const RelatoriosEnterprise = {

    dadosRelatorioAtual: null,

    config: {
        larguraPapel: localStorage.getItem('print_paper_width') || '80mm'
    },

    checkStore: async () => {
        if (!App.state.storeId) {
            await NaxioUI.alert('❌ Erro', 'Loja não identificada.', 'error');
            return false;
        }
        return true;
    },

    converterData: (dataBR) => {
        if (!dataBR) return null;
        const partes = dataBR.split('/');
        if (partes.length !== 3) return null;
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    },

    configurarImpressora: async () => {
        const atual = RelatoriosEnterprise.config.larguraPapel;
        const novo = await NaxioUI.select(
            '🖨️ Configurar Impressora',
            'Selecione a largura do papel:',
            [
                { value: '58', label: '58mm', description: 'Bobina pequena' },
                { value: '80', label: '80mm', description: 'Bobina padrão (recomendado)' }
            ]
        );
        if (novo) {
            const width = `${novo}mm`;
            localStorage.setItem('print_paper_width', width);
            RelatoriosEnterprise.config.larguraPapel = width;
            await NaxioUI.alert('✅ Sucesso', `Configurado para ${width}`, 'success');
        }
    },

    // 🛠️ CSS DE IMPRESSÃO (Mantém a compatibilidade, mas o motor principal agora é o printHtml abaixo)
    injectPrintStyles: () => {
        // Esta função fica aqui apenas para compatibilidade com modais antigos, 
        // a mágica da fonte grande acontece no printHtml
    },

    // 🔄 MODAL ESPECIALIZADO PARA REPOSIÇÃO (4 colunas: Produto | Qtd | Unit | Subtotal)
    exibirModalReposicao: (titulo, subtitulo, cabecalhoHtml, linhas, rodapeHtml, totalGeral) => {
        // Salva para impressão
        RelatoriosEnterprise.dadosRelatorioAtual = {
            titulo, subtitulo,
            linhas: cabecalhoHtml + '<tbody>' + linhas + rodapeHtml + '</tbody>',
            total: null, // Total já está no rodapeHtml
            _totalGeral: totalGeral,
            _isReposicao: true,
            _linhasRaw: linhas,
            _cabecalhoHtml: cabecalhoHtml,
            _rodapeHtml: rodapeHtml
        };

        const old = document.querySelector('.modal-overlay.reposicao-modal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.className = 'modal-overlay reposicao-modal';
        modal.style.cssText = 'display:flex !important; justify-content:center !important; align-items:center !important; z-index:10005; background:rgba(0,0,0,0.8); position:fixed; top:0; left:0; width:100%; height:100vh;';

        modal.innerHTML = `
            <div class="modal-content" style="background:#1a1a1a; color:#fff; width:95%; max-width:600px; border:1px solid #333; border-radius:8px;">
                <div class="modal-header" style="border-bottom:1px solid #333; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; color:#fff;">${titulo}</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding:15px; max-height:65vh; overflow-y:auto;">
                    <h5 style="border-bottom:1px dashed #555; padding-bottom:10px; margin-top:0; color:#ccc;">${subtitulo}</h5>
                    <table style="width:100%; font-size:0.85rem; color:#fff; border-collapse:collapse;">
                        ${cabecalhoHtml}
                        <tbody>${linhas}</tbody>
                        <tfoot>${rodapeHtml}</tfoot>
                    </table>
                </div>
                <div class="modal-footer" style="padding:15px; border-top:1px solid #333;">
                    <button class="btn btn-primary btn-full" style="width:100%;" onclick="RelatoriosEnterprise.imprimirRelatorioArmazenado()">🖨️ Imprimir (PDF)</button>
                </div>
            </div>`;

        document.body.appendChild(modal);
    },

    // 💸 DESPESAS DO DIA
    relatorioDespesasDia: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const dataInput = await NaxioUI.datePicker(
            '📅 Data do Relatório',
            'Selecione a data para consultar despesas:',
            new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
        );
        if (!dataInput) return;
        const dataISO = dataInput;
        const dataBR = dataInput.split('-').reverse().join('/');

        const { data: despesas, error } = await _sb.from('cash_movements')
            .select('*, cash_sessions!inner(store_id)')
            .eq('cash_sessions.store_id', App.state.storeId)
            .eq('tipo', 'despesa')
            .gte('created_at', `${dataISO}T00:00:00`)
            .lte('created_at', `${dataISO}T23:59:59`)
            .order('created_at', { ascending: false });

        if (error || !despesas || despesas.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhuma despesa encontrada nesta data.', 'info');
            return;
        }

        const linhas = despesas.map(d => `
            <tr>
                <td>${new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${d.descricao}</td>
                <td align="right">R$ ${parseFloat(d.valor).toFixed(2)}</td>
            </tr>`).join('');

        const total = despesas.reduce((acc, d) => acc + parseFloat(d.valor), 0);
        RelatoriosEnterprise.exibirModal(`💸 Despesas - ${dataBR}`, "Relatório Diário", linhas, total);
    },

    // 📦 INVENTÁRIO SIMPLIFICADO
    relatorioInventario: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const categoria = await NaxioUI.prompt(
            '📂 Filtrar Categoria',
            'Digite a categoria para filtrar (deixe vazio para ver tudo):',
            '',
            'Ex: Bebidas, Comidas...'
        );
        let query = _sb.from('products').select('nome, estoque, categoria').eq('store_id', App.state.storeId).order('nome');
        if (categoria && categoria.trim() !== "") query = query.ilike('categoria', `%${categoria.trim()}%`);

        const { data: produtos, error } = await query;
        if (error || !produtos || produtos.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhum produto encontrado.', 'info');
            return;
        }

        const linhas = produtos.map(p => `
            <tr>
                <td>${p.nome} <small>(${p.categoria || '-'})</small></td>
                <td align="right">${p.estoque || 0}</td>
            </tr>`).join('');

        RelatoriosEnterprise.exibirModal(`📦 Estoque`, new Date().toLocaleDateString('pt-BR'), linhas, null);
    },

    // 🔄 RELATÓRIO DE REPOSIÇÃO (VENDIDOS HOJE)
    relatorioReposicao: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const filtroCat = await NaxioUI.prompt(
            '🔄 Filtrar Reposição',
            'Filtrar por categoria (deixe vazio para ver tudo):',
            '',
            'Ex: Bebidas, Comidas...'
        );
        if (filtroCat === null) return;

        const hojeObj = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);

        // 🔥 FIX TIMEZONE: Converter datas locais para UTC considerando Brasília (GMT-3)
        // Supabase/PostgreSQL armazena em UTC. Se não enviarmos o 'Z', ele assume UTC.
        // Queremos que 00:00 Local (Brasília) seja 03:00 UTC.
        const toUTC = (dateStr) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toISOString();
        };

        const dataInicioStr = await NaxioUI.datetimePicker('📅 Início', 'Data e hora inicial:', hojeObj.toISOString().slice(0, 10) + 'T00:00');
        if (!dataInicioStr) return;
        const dataFimStr = await NaxioUI.datetimePicker('📅 Fim', 'Data e hora final:', hojeObj.toISOString().slice(0, 10) + 'T23:59');
        if (!dataFimStr) return;

        const dInicioRaw = dataInicioStr.length === 16 ? dataInicioStr + ':00' : (dataInicioStr.includes('T') ? dataInicioStr : dataInicioStr + 'T00:00:00');
        const dFimRaw = dataFimStr.length === 16 ? dataFimStr + ':59' : (dataFimStr.includes('T') ? dataFimStr : dataFimStr + 'T23:59:59');

        const dInicio = toUTC(dInicioRaw);
        const dFim = toUTC(dFimRaw);

        const detalharGarcom = await NaxioUI.confirm(
            '👤 Detalhar por Garçom?',
            'Deseja que os itens no relatório sejam separados por qual garçom realizou a venda?'
        );

        App.utils.toast("Buscando vendas e categorizando...", "info");

        // BUSCA TODOS OS PRODUTOS PARA MAPEAMENTO DE CATEGORIAS HISTÓRICAS
        let pMap = {};
        const { data: todos_p } = await _sb.from('products').select('id, nome, categoria').eq('store_id', App.state.storeId);
        if (todos_p) {
            todos_p.forEach(p => {
                pMap[p.nome.toLowerCase()] = p.categoria || '';
                pMap[p.id] = p.categoria || '';
            });
        }

        // Busca vendas do periodo
        let queryVendas = _sb.from('orders')
            .select('id, observacao, products(nome, categoria)')
            .gte('created_at', dInicio)
            .lte('created_at', dFim)
            .not('status', 'in', '(cancelado,cancelada,devolvido,devolvida,CANCELADO,CANCELADA,DEVOLVIDO,DEVOLVIDA,estornado,ESTORNADO)');

        if (Array.isArray(App.state.storeId)) {
            queryVendas = queryVendas.in('store_id', App.state.storeId);
        } else {
            queryVendas = queryVendas.eq('store_id', App.state.storeId);
        }

        const { data: orders } = await queryVendas;

        // 🔥 BUSCA TODAS AS COMANDAS QUE FORAM FECHADAS NO PERÍODO
        let queryComandas = _sb.from('comandas')
            .select('id, items, updated_at, tipo_comanda, numero, payments_info')
            .eq('status', 'fechada')
            .gte('updated_at', dInicio)
            .lte('updated_at', dFim);

        if (Array.isArray(App.state.storeId)) {
            queryComandas = queryComandas.in('store_id', App.state.storeId);
        } else {
            queryComandas = queryComandas.eq('store_id', App.state.storeId);
        }

        const { data: todasComandasFechadasBD } = await queryComandas;

        // Função auxiliar para normalizar número de mesa/comanda (Remove zeros à esquerda)
        const normMesa = (m) => {
            if (m === null || m === undefined) return null;
            const str = String(m).replace(/\D/g, ''); 
            if (str) return String(parseInt(str)); // "05" -> "5"
            return String(m).trim().toLowerCase();
        };

        const mesasContabilizadasViaOrder = new Set();
        const comandaIdsContabilizados = new Set();
        const orderIdsVistos = new Set();
        const contagem = {};

        if (orders) {
            orders.forEach(o => {
                if (orderIdsVistos.has(o.id)) return;
                orderIdsVistos.add(o.id);

                let itens = [];
                try { 
                    if (o.observacao && o.observacao.trim().startsWith('{')) {
                        const obs = JSON.parse(o.observacao); 
                        // 🔥 SUPORTE DUAL: itens (comandas) e items (varejo)
                        itens = obs.itens || obs.items || []; 
                        
                        if (obs.mesa) mesasContabilizadasViaOrder.add(normMesa(obs.mesa));
                        if (obs.comanda_id) comandaIdsContabilizados.add(String(obs.comanda_id));
                    } else if (o.observacao && o.observacao.includes('Mesa ')) {
                        const match = o.observacao.match(/Mesa\s+(\d+)/i);
                        if (match) mesasContabilizadasViaOrder.add(normMesa(match[1]));
                    }
                } catch (e) { }

                // Se não tem itens no JSON, tenta pegar o produto direto (venda balcão simples)
                if (itens.length === 0 && o.products) itens.push({ nome: o.products.nome, qtd: 1, categoria: o.products.categoria });

                itens.forEach(i => {
                    if (!i.nome && !i.name) return;
                    let catVal = i.categoria || i.category || '';
                    if (!catVal && i.nome) catVal = pMap[i.nome.toLowerCase()] || pMap[i.id] || '';

                    const catItem = catVal.toLowerCase();
                    const nomeItem = (i.nome || i.name || '').toLowerCase();
                    if (filtroCat && !catItem.includes(filtroCat.toLowerCase()) && !nomeItem.includes(filtroCat.toLowerCase())) return;

                    const g = (detalharGarcom && i.garcom) ? ` <span style="color:#000; font-weight:bold; font-size:0.8em;"><br>👤 Garçom: ${i.garcom}</span>` : '';
                    const nomeKey = (i.nome || i.name || 'Item').trim() + g;

                    const precoUnit = parseFloat(i.price || i.preco || 0);

                    if (!contagem[nomeKey]) contagem[nomeKey] = { qtd: 0, categoria: catVal || 'Sem Categoria', preco: precoUnit };
                    if (!contagem[nomeKey].preco && precoUnit > 0) contagem[nomeKey].preco = precoUnit;
                    contagem[nomeKey].qtd += (parseFloat(i.qtd) || 1);
                });
            });
        }

        if (todasComandasFechadasBD) {
            todasComandasFechadasBD.forEach(c => {
                // 🔥 VÍNCULO DEFINITIVO: Verifica se esta comanda tem um order_id registrado
                let linkedOrderId = null;
                if (c.payments_info && Array.isArray(c.payments_info)) {
                    const link = c.payments_info.find(p => p && p._order_id);
                    if (link) linkedOrderId = link._order_id;
                }

                // Pula se já foi contabilizada via Order (evita duplicação absoluta)
                if (linkedOrderId && orderIdsVistos.has(linkedOrderId)) return;
                if (comandaIdsContabilizados.has(String(c.id))) return;
                if (mesasContabilizadasViaOrder.has(normMesa(c.numero))) return;

                if (c.items && Array.isArray(c.items)) {
                    c.items.forEach(i => {
                        if (!i.nome && !i.name) return;
                        let catVal = i.categoria || i.category || '';
                        if (!catVal && i.nome) catVal = pMap[i.nome.toLowerCase()] || pMap[i.id] || '';

                        const cat = catVal.toLowerCase();
                        const nomeItem = (i.nome || i.name || '').toLowerCase();
                        if (filtroCat && !cat.includes(filtroCat.toLowerCase()) && !nomeItem.includes(filtroCat.toLowerCase())) return;

                        const g = (detalharGarcom && i.garcom) ? ` <span style="color:#ef4444; font-size:0.75em;"><br>⚠️ Pendente [Garçom: ${i.garcom}]</span>` : '';
                        const nomeKey = (i.nome || i.name || 'Item').trim() + g;

                        const precoUnit = parseFloat(i.price || i.preco || 0);

                        if (!contagem[nomeKey]) contagem[nomeKey] = { qtd: 0, categoria: catVal || 'Sem Categoria', preco: precoUnit };
                        if (!contagem[nomeKey].preco && precoUnit > 0) contagem[nomeKey].preco = precoUnit;
                        contagem[nomeKey].qtd += (parseFloat(i.qtd) || 1);
                    });
                }
            });
        }

        const linhas = Object.entries(contagem)
            .sort((a, b) => b[1].qtd - a[1].qtd)
            .map(([nome, info]) => {
                const qtd = info.qtd;
                const preco = info.preco || 0;
                const subtotalItem = qtd * preco;
                const precoFmt = preco > 0 ? `R$ ${preco.toFixed(2)}` : '-';
                const subtotalFmt = subtotalItem > 0 ? `R$ ${subtotalItem.toFixed(2)}` : '-';
                return `<tr>
                    <td>${nome} <small style="color:#aaa;">(${info.categoria || '-'})</small></td>
                    <td align="right" style="white-space:nowrap;">${qtd}</td>
                    <td align="right" style="white-space:nowrap;">${precoFmt}</td>
                    <td align="right" style="white-space:nowrap; font-weight:bold;">${subtotalFmt}</td>
                </tr>`;
            })
            .join('');

        // Calcula total geral
        const totalGeral = Object.values(contagem).reduce((acc, info) => {
            return acc + (info.qtd * (info.preco || 0));
        }, 0);

        // Linha de rodapé com total geral
        const rodapeTotalHtml = `
            <tr style="border-top: 2px solid #555;">
                <td colspan="3" style="font-weight:bold; padding-top:8px;">TOTAL GERAL:</td>
                <td align="right" style="font-weight:bold; color:#4ade80; padding-top:8px;">R$ ${totalGeral.toFixed(2)}</td>
            </tr>`;

        // Cabeçalho customizado para 4 colunas
        const cabecalhoHtml = `
            <thead style="background:#333;">
                <tr>
                    <th align="left" style="padding:5px;">Produto</th>
                    <th align="right" style="padding:5px;">Qtd</th>
                    <th align="right" style="padding:5px;">Unit.</th>
                    <th align="right" style="padding:5px;">Subtotal</th>
                </tr>
            </thead>`;

        RelatoriosEnterprise.exibirModalReposicao(
            `🔄 Reposição (${filtroCat || 'Geral'})`,
            `Período: ${new Date(dInicio.split('.')[0]).toLocaleString()} a ${new Date(dFim.split('.')[0]).toLocaleString()}`,
            cabecalhoHtml,
            linhas || '<tr><td colspan="4">Nada vendido.</td></tr>',
            rodapeTotalHtml,
            totalGeral
        );
    },

    // 💰 HISTÓRICO DE CAIXAS
    historicoCaixas: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        App.utils.toast("Carregando...", "info");

        const { data: caixas } = await _sb.from('cash_sessions')
            .select('*').eq('store_id', App.state.storeId).order('created_at', { ascending: false }).limit(50);

        if (!caixas || caixas.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhum registro de caixa encontrado.', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10000; background: rgba(0,0,0,0.8);';

        const listaHtml = caixas.map(c => {
            const color = c.fechamento ? 'var(--danger)' : 'var(--success)';
            const status = c.fechamento ? 'FECHADO' : 'ABERTO';
            const valorFinal = c.valor_fechamento || c.valor_final_informado || 0;
            const dataSession = new Date(c.created_at).toLocaleDateString('pt-BR');
            const horaSession = new Date(c.created_at).toLocaleTimeString().substring(0, 5);

            return `
                <div style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: #fff; padding:12px; margin-bottom:12px; border-radius:12px; border-left:5px solid ${color}; display:flex; justify-content:space-between; align-items:center; transition: all 0.2s ease;">
                    <div>
                        <strong style="font-size: 1.05rem;">${dataSession} - ${horaSession}</strong>
                        <div style="color:${color}; font-weight:bold; font-size: 0.85rem; margin-top:2px;">
                            <i class="${c.fechamento ? 'ri-lock-line' : 'ri-lock-unlock-line'}"></i> ${status}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size: 1.2rem; color: var(--success);">R$ ${valorFinal.toFixed(2)}</div>
                        <button class="btn btn-sm btn-secondary" style="margin-top:5px; padding: 4px 12px;" onclick="RelatoriosEnterprise.verFechamentoCaixa('${c.id}')">
                            <i class="ri-eye-line"></i> Detalhes
                        </button>
                        <button class="btn btn-sm btn-primary" style="margin-top:5px; padding: 4px 12px; background: #3b82f6;" onclick="RelatoriosEnterprise.reimprimirFitaCaixa('${c.id}')">
                            <i class="ri-printer-line"></i> Fita
                        </button>
                    </div>
                </div>`;
        }).join('');

        modal.innerHTML = `
            <div class="modal-content" style="background: #1a1a1a; color: #ffffff; width: 95%; max-width: 500px; border: 1px solid #333; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;">
                <div class="modal-header" style="border-bottom: 1px solid #333; padding: 20px; display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.02);">
                    <h3 style="margin: 0; color: #fff; font-size: 1.25rem;"><i class="ri-history-line"></i> Histórico de Caixas</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                    ${listaHtml}
                </div>
                <div class="modal-footer" style="padding: 15px; border-top: 1px solid #333; text-align:center; background: rgba(255,255,255,0.02);">
                    <small style="color: #64748b;">Mostrando sessões de caixa recentes</small>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    // 🖨️ REIMPRIMIR FITA DE FECHAMENTO (CHAMADO PELO HISTÓRICO)
    reimprimirFitaCaixa: async (caixaId) => {
        try {
            App.utils.toast("Buscando dados do fechamento...", "info");
            const { data: caixa } = await _sb.from('cash_sessions').select('*').eq('id', caixaId).single();
            if (!caixa) return App.utils.toast("Erro ao buscar dados do caixa.", "error");

            let resumo = caixa.resumo_vendas;

            if (!resumo) {
                // Se não existir o resumo salvo, tenta calcular na hora
                App.utils.toast("Calculando resumo para impressão...", "info");
                
                if (typeof Caixa === 'undefined') throw new Error("Módulo de Caixa não carregado.");

                // Mock temporário do state para usar o calcTotals original
                const originalSession = Caixa.state.session;
                const originalState = { ...Caixa.state };
                
                Caixa.state.session = caixa;
                await Caixa.calcTotals();
                
                const st = Caixa.state;
                const fundo = caixa.valor_inicial;
                const esperadoGaveta = fundo + st.breakdownVendas.dinheiro + st.breakdownAnteriores.dinheiro - st.breakdownDespesas.dinheiro;
                
                resumo = {
                    vendasHoje: st.vendasHoje,
                    entradasAnteriores: st.entradasAnteriores,
                    totalDespesas: st.totalDespesas,
                    breakdownVendas: st.breakdownVendas,
                    breakdownAnteriores: st.breakdownAnteriores,
                    breakdownDespesas: st.breakdownDespesas,
                    esperadoGaveta,
                    contado: caixa.valor_final_informado || 0,
                    diferenca: caixa.diferenca || 0,
                    fundo,
                    session: caixa
                };
                
                // Restaura state original
                Caixa.state.session = originalSession;
                Object.assign(Caixa.state, originalState);
            } else {
                // Garante que a session esteja no resumo para o template
                resumo.session = caixa;
            }

            // Chama a função de geração de conteúdo do Módulo Caixa
            if (typeof Caixa !== 'undefined' && Caixa.generateContent) {
                const content = Caixa.generateContent(resumo);
                const win = window.open('', '_blank');
                win.document.write(`
                    <html>
                    <head>
                        <title>Reimpressão de Fechamento</title>
                        <style>
                            body { margin: 0; padding: 0; background: #fff; font-family: 'Courier New', monospace; }
                            @media print { @page { margin: 0; } }
                        </style>
                    </head>
                    <body onload="setTimeout(() => { window.print(); window.close(); }, 500);">
                        <div style="padding: 10px; border: 1px dashed #ccc; display: inline-block;">
                            <center><small>--- REIMPRESSÃO ---</small></center>
                            ${content}
                        </div>
                    </body>
                    </html>
                `);
                win.document.close();
            } else {
                throw new Error("Módulo de impressão não disponível no momento.");
            }
        } catch (e) {
            console.error("Erro na reimpressão:", e);
            App.utils.toast("❌ Erro: " + e.message, "error");
        }
    },

    // 🔍 CORREÇÃO CRÍTICA: BUSCA NA TABELA ORDERS PARA MOSTRAR OS VALORES CORRETOS
    verFechamentoCaixa: async (caixaId) => {
        const { data: caixa } = await _sb.from('cash_sessions').select('*').eq('id', caixaId).single();
        if (!caixa) return;

        const fim = caixa.fechamento || new Date().toISOString();
        const start = caixa.abertura || caixa.created_at;
        
        // 🔥 FIX TIMEZONE/ORPHANS: Assim como no calcTotals do Caixa, pegamos desde a meia-noite 
        // da abertura para captar vendas "órfãs" (sem session_id) que aconteceram antes da abertura oficial.
        const openingDate = new Date(start);
        const startOfDay = new Date(openingDate.getFullYear(), openingDate.getMonth(), openingDate.getDate()).toISOString();
        const adjustedStart = (start > startOfDay) ? startOfDay : start;

        let { data: vendas, error } = await _sb.from('orders')
            .select('*, products(nome)')
            .eq('store_id', caixa.store_id || App.state.storeId)
            .not('status', 'in', '(cancelado,cancelada,devolvido,devolvida,CANCELADO,CANCELADA,DEVOLVIDO,DEVOLVIDA,estornado,ESTORNADO)')
            // 🔥 MUDANÇA CRÍTICA: Para bater com o Dashboard (calcTotals), mostramos TUDO no intervalo do caixa.
            // Isso resolve o problema de vendas com session_id errado ou nulo por causa de múltiplos terminais.
            .gte('created_at', adjustedStart)
            .lte('created_at', fim)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Erro ao buscar vendas do caixa:", error);
            // Fallback caso o PostgREST não suporte o 'and' aninhado no 'or' em algumas versões
            let q = _sb.from('orders')
                .select('*, products(nome)')
                .eq('store_id', caixa.store_id || App.state.storeId)
                .not('status', 'in', '(cancelado,cancelada,devolvido,devolvida,CANCELADO,CANCELADA,DEVOLVIDO,DEVOLVIDA,estornado,ESTORNADO)')
                .order('created_at', { ascending: true });
                
            const { data: vendasAlt } = await q.or(`session_id.eq.${caixaId},session_id.is.null`);
            vendas = (vendasAlt || []).filter(v => {
                if (v.session_id === caixaId) return true;
                return v.created_at >= adjustedStart && v.created_at <= fim;
            });
        }


        let totalGeral = 0;
        let totalDescontos = 0;

        const linhas = (vendas && vendas.length > 0) ? vendas.map(v => {
            const valorPago = parseFloat(v.total_pago || v.total || 0);
            totalGeral += valorPago;

            let descText = v.observacao || v.products?.nome || 'Venda Balcão';
            let desconto = 0;
            let metodosPag = [];

            try {
                if (v.observacao && v.observacao.startsWith('{')) {
                    const obsObj = JSON.parse(v.observacao);
                    if (obsObj.desconto) {
                        desconto = parseFloat(obsObj.desconto);
                        totalDescontos += desconto;
                    }
                    if (obsObj.pagamentos && Array.isArray(obsObj.pagamentos)) metodosPag = obsObj.pagamentos;

                    // 🔥 FIX: Trata o número da mesa se for objeto ou string
                    let mesaNum = obsObj.mesa;
                    if (mesaNum && typeof mesaNum === 'object') {
                        mesaNum = mesaNum.numero || mesaNum.id || JSON.stringify(mesaNum);
                    }

                    descText = `Venda ${mesaNum ? 'Mesa ' + mesaNum : 'Balcão'}`;
                }
            } catch (e) {
                if (descText.toLowerCase().includes('mesa')) {
                    descText = 'Mesa ' + descText.split('Mesa')[1]?.substring(0, 5).replace(/[^0-9]/g, '') || 'Mesa';
                }
            }

            if (metodosPag.length === 0 && v.payments_info) {
                try { metodosPag = typeof v.payments_info === 'string' ? JSON.parse(v.payments_info) : v.payments_info; } catch (e) { }
            }
            if (metodosPag.length === 0) {
                metodosPag = [{ method: v.metodo_pagamento || v.pagamento || 'Dinheiro', amount: valorPago }];
            }

            let strMetodos = metodosPag.filter(p => (p.val || p.amount)).map(p => {
                let metodoNome = p.method || p.tipo || 'Desconhecido';
                if (p.code === '03' && (metodoNome.toUpperCase() === 'CARTAO' || metodoNome.toUpperCase() === 'CARTÃO')) metodoNome = 'Crédito';
                if (p.code === '04' && (metodoNome.toUpperCase() === 'CARTAO' || metodoNome.toUpperCase() === 'CARTÃO')) metodoNome = 'Débito';
                const metodoVal = parseFloat(p.amount || p.val || 0);
                if (metodoVal <= 0) return '';
                return `<span style="display:inline-block; background:rgba(0,0,0,0.05); border: 1px solid #000; color:#000; font-weight:900; padding:1px 6px; border-radius:4px; margin:2px 4px 2px 0; font-size:0.75rem;">
                         ${metodoNome}: R$ ${metodoVal.toFixed(2)}
                        </span>`;
            }).join('');

            const safePays = metodosPag.filter(p => (p.val || p.amount)).map(p => ({
                method: p.method || p.tipo || 'Desconhecido',
                amount: parseFloat(p.amount || p.val || 0)
            }));
            const paysJson = JSON.stringify(safePays).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

            return `<tr class="row-venda-caixa" data-payments="${paysJson}" data-valor="${valorPago}" style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.05)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 12px 8px; vertical-align:top; color:#94a3b8; font-family:monospace; font-size:0.8rem;">${new Date(v.created_at).toLocaleTimeString().substring(0, 5)}</td>
                <td style="padding: 12px 8px; vertical-align:top;">
                    <div style="font-weight:700; color:#f1f5f9; font-size:0.95rem;">${descText.substring(0, 40)}</div>
                    <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">${strMetodos}</div>
                    ${desconto > 0 ? `<div style="color:#880000; font-size:0.75rem; margin-top:4px; font-weight:900;"><i class="ri-price-tag-3-line"></i> Desconto: -R$ ${desconto.toFixed(2)}</div>` : ''}
                </td>
                <td align="right" style="font-weight:800; color:#10b981; padding: 12px 8px; vertical-align:top; font-size:1rem;">R$ ${valorPago.toFixed(2)}</td>
                <td class="no-print-filter" align="right" style="padding: 12px 8px; vertical-align:top;">
                    <button class="btn btn-primary" style="padding:4px 10px; font-size:0.7rem; background:#3b82f6; color:#fff; border:none; border-radius:6px; margin-right:5px;" onclick="RelatoriosEnterprise.reimprimirFitaCaixa('${caixaId}')">
                        <i class="ri-printer-line"></i> Reimprimir Fita
                    </button>
                    <button class="btn btn-sm" style="padding:4px 10px; font-size:0.7rem; background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); border-radius:6px;" 
                        onclick="if(confirm('Deseja estornar esta venda?')) { if(window.App?.autopecas?.cancelSale) App.autopecas.cancelSale('${v.id}'); else window._sb.from('orders').update({status:'cancelado'}).eq('id','${v.id}').then(()=>App.utils.toast('Estornada!','success')); this.closest('tr').style.opacity='0.3'; this.disabled=true; }">
                        <i class="ri-close-circle-line"></i> Estornar
                    </button>
                </td>
            </tr>`;
        }).join('') : '<tr><td colspan="4" style="text-align:center; padding:30px; color:#64748b;">Nenhuma venda registrada nesta sessão.</td></tr>';

        let rodapeExtra = '';
        if (totalDescontos > 0) {
            rodapeExtra = `
                <tr id="tr-descontos-caixa">
                    <td colspan="2" style="font-weight:900; color:#880000; padding-top:10px;">Total Descontos:</td>
                    <td align="right" style="font-weight:900; color:#880000; padding-top:10px;">- R$ ${totalDescontos.toFixed(2)}</td>
                    <td class="no-print-filter"></td>
                </tr>
                <tr>
                    <td colspan="2" style="font-weight:900; color:#059669;">Total Líquido (Caixa):</td>
                    <td align="right" id="total-liquido-caixa" style="font-weight:900; color:#059669;">R$ ${totalGeral.toFixed(2)}</td>
                    <td class="no-print-filter"></td>
                </tr>
            `;
        } else {
            rodapeExtra = `
                <tr>
                    <td colspan="2" style="font-weight:900; color:#059669; padding-top:10px;">Total Líquido (Caixa):</td>
                    <td align="right" id="total-liquido-caixa" style="font-weight:900; color:#059669; padding-top:10px;">R$ ${totalGeral.toFixed(2)}</td>
                    <td class="no-print-filter"></td>
                </tr>
            `;
        }

        const filterScript = `const val=this.value;const rows=document.querySelectorAll('.row-venda-caixa');let total=0;rows.forEach(r=>{const paysStr=r.getAttribute('data-payments');const pays=paysStr?JSON.parse(paysStr):[];let show=false;if(val==='todos'){show=true;total+=parseFloat(r.getAttribute('data-valor')||0);}else{let matchAmount=0;pays.forEach(p=>{let m=(p.method||'').toLowerCase();let matches=false;if(val==='dinheiro'&&(m.includes('dinheiro')||m==='din'))matches=true;else if(val==='pix'&&m.includes('pix'))matches=true;else if(val==='credito'&&(m.includes('credito')||m.includes('crédito')||m==='credit'))matches=true;else if(val==='debito'&&(m.includes('debito')||m.includes('débito')||m==='debit'))matches=true;if(matches){show=true;matchAmount+=(parseFloat(p.amount)||0);}});if(show)total+=matchAmount;}r.style.display=show?'':'none';});const elTotal=document.getElementById('total-liquido-caixa');if(elTotal)elTotal.innerText='R$ '+total.toFixed(2);const trDesc=document.getElementById('tr-descontos-caixa');if(trDesc)trDesc.style.display=(val==='todos')?'':'none';if(window.RelatoriosEnterprise&&window.RelatoriosEnterprise.dadosRelatorioAtual){window.RelatoriosEnterprise.dadosRelatorioAtual.linhas=document.getElementById('caixa-table-container').outerHTML;}`;

        const htmlTabela = `
            <div id="caixa-table-container">
                <style> @media print { .no-print-filter { display: none !important; } } </style>
                <div class="no-print-filter" style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                    <label style="font-weight: bold; color: #f1f5f9;"><i class="ri-filter-3-line"></i> Filtrar Pagamento:</label>
                    <select onchange="${filterScript}" style="padding: 6px 12px; border-radius: 6px; background: #1e293b; color: #fff; border: 1px solid #334155; outline: none; cursor: pointer;">
                        <option value="todos">Todos os Recebimentos</option>
                        <option value="dinheiro">Dinheiro (din)</option>
                        <option value="pix">Pix</option>
                        <option value="credito">Cartão de Crédito (credit)</option>
                        <option value="debito">Cartão de Débito (debit)</option>
                    </select>
                </div>
                <table style="width:100%; border-collapse:collapse; background:transparent; color:#f1f5f9;">
                    <thead>
                        <tr style="background:rgba(255,255,255,0.03); text-align:left;">
                            <th style="padding:12px 8px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Hora</th>
                            <th style="padding:12px 8px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">Venda / Detalhes</th>
                            <th style="padding:12px 8px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; text-align:right;">Total</th>
                            <th class="no-print-filter" style="padding:12px 8px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; text-align:right;">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                        ${rodapeExtra}
                    </tbody>
                </table>
            </div>
        `;

        if (typeof RelatoriosEnterprise !== 'undefined' && RelatoriosEnterprise.exibirModal) {
            RelatoriosEnterprise.exibirModal(
                `💰 Detalhes do Caixa`,
                `Sessão #${caixaId.slice(0, 5)} - Abertura: ${new Date(caixa.created_at).toLocaleString()}`,
                htmlTabela,
                null
            );
        } else {
            const modalHtml = `
                <div id="modal-historico-vendas-manual" class="modal-overlay" style="display:flex; z-index:10005;">
                    <div class="modal-content" style="max-width:800px; max-height:90vh; display:flex; flex-direction:column;">
                        <div class="modal-header">
                            <h3>📊 Vendas do Caixa #${caixaId.slice(0, 5)}</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-historico-vendas-manual').remove()">Fechar</button>
                        </div>
                        <div class="modal-body" style="overflow-y:auto; padding:0;">
                            ${htmlTabela}
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
    },

    // --- 🖥️ MODAL VISUAL (NA TELA) - CENTRALIZADO ---

    // 📅 RELATÓRIO DE CAIXA POR PERÍODO (Z-READ FORMAT)
    relatorioCaixaPorPeriodo: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;

        const hojeObj = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000);
        const toUTC = (dateStr) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toISOString();
        };

        const dataInicioStr = await NaxioUI.datetimePicker('📅 Início', 'Data e hora inicial:', hojeObj.toISOString().slice(0, 10) + 'T00:00');
        if (!dataInicioStr) return;
        const dataFimStr = await NaxioUI.datetimePicker('📅 Fim', 'Data e hora final:', hojeObj.toISOString().slice(0, 10) + 'T23:59');
        if (!dataFimStr) return;

        const dInicioRaw = dataInicioStr.length === 16 ? dataInicioStr + ':00' : (dataInicioStr.includes('T') ? dataInicioStr : dataInicioStr + 'T00:00:00');
        const dFimRaw = dataFimStr.length === 16 ? dataFimStr + ':59' : (dataFimStr.includes('T') ? dataFimStr : dataFimStr + 'T23:59:59');

        const adjustedStart = toUTC(dInicioRaw);
        const fim = toUTC(dFimRaw);

        App.utils.toast("Buscando dados do período...", "info");

        let { data: vendas, error: erroVendas } = await _sb.from('orders')
            .select('*, products(nome)')
            .eq('store_id', App.state.storeId)
            .not('status', 'in', '(cancelado,cancelada,devolvido,devolvida,CANCELADO,CANCELADA,DEVOLVIDO,DEVOLVIDA,estornado,ESTORNADO)')
            .gte('created_at', adjustedStart)
            .lte('created_at', fim);
            
        let { data: movimentos } = await _sb.from('cash_movements')
            .select('*')
            .eq('store_id', App.state.storeId)
            .gte('created_at', adjustedStart)
            .lte('created_at', fim);
            
        let { data: sessoes } = await _sb.from('cash_sessions')
            .select('*')
            .eq('store_id', App.state.storeId)
            .gte('created_at', adjustedStart)
            .lte('created_at', fim);

        if (erroVendas) {
            console.error("Erro ao buscar vendas:", erroVendas);
            await NaxioUI.alert('Erro', 'Erro ao buscar dados.', 'error');
            return;
        }

        let breakdownVendas = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };
        let vendasHoje = 0;
        
        (vendas || []).forEach(v => {
            const valorPago = parseFloat(v.total_pago || v.total || 0);
            vendasHoje += valorPago;
            
            let metodosPag = [];
            try {
                if (v.observacao && v.observacao.startsWith('{')) {
                    const obsObj = JSON.parse(v.observacao);
                    if (obsObj.pagamentos && Array.isArray(obsObj.pagamentos)) metodosPag = obsObj.pagamentos;
                }
            } catch (e) {}

            if (metodosPag.length === 0 && v.payments_info) {
                try { metodosPag = typeof v.payments_info === 'string' ? JSON.parse(v.payments_info) : v.payments_info; } catch (e) {}
            }
            if (metodosPag.length === 0) {
                metodosPag = [{ method: v.metodo_pagamento || v.pagamento || 'Dinheiro', amount: valorPago }];
            }

            metodosPag.forEach(p => {
                 let method = (p.method || p.tipo || '').toLowerCase();
                 let val = parseFloat(p.amount || p.val || 0);
                 if (method.includes('dinheiro') || method === 'din') breakdownVendas.dinheiro += val;
                 else if (method.includes('pix')) breakdownVendas.pix += val;
                 else if (method.includes('credit') || method.includes('crédito') || method.includes('credito') || p.code === '03') breakdownVendas.credito += val;
                 else if (method.includes('debit') || method.includes('débito') || method.includes('debito') || p.code === '04') breakdownVendas.debito += val;
                 else breakdownVendas.dinheiro += val;
            });
        });
        
        let breakdownAnteriores = { dinheiro: 0, pix: 0, credito: 0, debito: 0 };
        let totalEntradas = 0;
        let totalDespesas = 0;
        
        (movimentos || []).forEach(m => {
             const val = parseFloat(m.amount || 0);
             if (m.type === 'entrada') {
                  totalEntradas += val;
                  let method = (m.method || '').toLowerCase();
                  if (method.includes('pix')) breakdownAnteriores.pix += val;
                  else if (method.includes('credit') || method.includes('crédito') || method.includes('credito')) breakdownAnteriores.credito += val;
                  else if (method.includes('debit') || method.includes('débito') || method.includes('debito')) breakdownAnteriores.debito += val;
                  else breakdownAnteriores.dinheiro += val;
             } else if (m.type === 'saida' || m.type === 'sangria' || m.type === 'despesa') {
                  totalDespesas += val;
             }
        });
        
        let fundoInicial = 0;
        (sessoes || []).forEach(s => {
             fundoInicial += parseFloat(s.valor_inicial || 0);
        });
        
        let esperadoGaveta = fundoInicial + breakdownVendas.dinheiro + breakdownAnteriores.dinheiro - totalDespesas;

        const fmt = (v) => 'R$ ' + (parseFloat(v)||0).toFixed(2);
        const linha = (l, v) => `<div style="display:flex; justify-content:space-between; margin-bottom: 2px;"><span>${l}</span><span>${fmt(v)}</span></div>`;
        const div = `<div style="border-top:1px dashed #555; margin:8px 0;"></div>`;

        const nomeLoja = (App.state.currentStore?.nome_loja) || App.state.profile?.nome_loja || 'RESTAURANTE';

        const htmlTabela = `
            <div id="caixa-table-container" style="font-family:'Courier New', monospace; max-width: 350px; margin: 0 auto; background: #fff; color: #000; padding: 15px; border-radius: 4px; font-weight: bold;">
                <div style="text-align:center; margin-bottom: 10px;">
                    <h3 style="margin:0; font-size:16px;">FECHAMENTO CAIXA</h3>
                    <div style="font-size:14px; text-transform:uppercase;">${nomeLoja}</div>
                    <div style="font-size:12px; margin-top:5px;">${new Date(adjustedStart).toLocaleString()} a ${new Date(fim).toLocaleString()}</div>
                    <div style="font-size:12px; margin-top:5px;">OP: PERÍODO</div>
                </div>
                ${div}
                ${linha('Fundo Inicial:', fundoInicial)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px; margin-bottom:4px;">VENDAS (PERÍODO)</div>
                ${linha('Dinheiro:', breakdownVendas.dinheiro)}
                ${linha('Pix:', breakdownVendas.pix)}
                ${linha('Crédito:', breakdownVendas.credito)}
                ${linha('Débito:', breakdownVendas.debito)}
                ${linha('TOTAL VENDAS:', vendasHoje)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px; margin-bottom:4px;">ENTRADAS</div>
                ${linha('Dinheiro:', breakdownAnteriores.dinheiro)}
                ${linha('Pix:', breakdownAnteriores.pix)}
                ${linha('Crédito:', breakdownAnteriores.credito)}
                ${linha('Débito:', breakdownAnteriores.debito)}
                ${linha('TOTAL ENTRADAS:', totalEntradas)}
                ${div}
                
                <div style="text-decoration:underline; font-size:14px; margin-bottom:4px;">DESPESAS / SANGRIA</div>
                ${linha('Outros:', totalDespesas)}
                ${linha('TOTAL DESPESAS:', totalDespesas)}
                ${div}
                
                <div style="font-size: 14px; margin-top: 5px;">
                    ${linha('GAVETA ESPERADO:', esperadoGaveta)}
                </div>
                <div style="font-size:10px; text-align:right;">(Fundo + Dinheiro - Desp.Din)</div>
                <br/>
                ${linha('INFORMADO:', 0)}
                ${linha('DIFERENÇA:', 0)}
                
                <div style="margin-top:40px; border-top:1px solid #000; text-align:center; padding-top:5px; font-size:12px;">Assinatura Responsável</div>
            </div>
        `;

        if (typeof RelatoriosEnterprise !== 'undefined' && RelatoriosEnterprise.exibirModal) {
            RelatoriosEnterprise.exibirModal(
                `💰 Relatório de Caixa (Período)`,
                `Período: ${new Date(adjustedStart).toLocaleString()} a ${new Date(fim).toLocaleString()}`,
                htmlTabela,
                null
            );
        }
    },

    exibirModal: (titulo, subtitulo, linhas, total) => {
        RelatoriosEnterprise.dadosRelatorioAtual = { titulo, subtitulo, linhas, total };

        // Nome da loja para exibir no topo
        const nomeLoja = (App.state.currentStore?.nome_loja) || App.state.profile?.nome_loja || '';

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex !important; justify-content: center !important; align-items: center !important; z-index: 10005; background: rgba(0,0,0,0.8); position: fixed; top: 0; left: 0; width: 100%; height: 100vh;';

        const isFullHtml = typeof linhas === 'string' && (linhas.trim().startsWith('<table') || linhas.trim().startsWith('<div'));

        modal.innerHTML = `
            <div class="modal-content" style="background: #1a1a1a; color: #ffffff; width: 95%; max-width: 800px; border: 1px solid #333; border-radius: 8px;">
                <div class="modal-header" style="border-bottom: 1px solid #333; padding: 15px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        ${nomeLoja ? `<div style="font-size:0.75rem; color:#64748b; margin-bottom:2px;">${nomeLoja}</div>` : ''}
                        <h3 style="margin: 0; color: #fff;">${titulo}</h3>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>

                <div class="modal-body" style="padding: 15px; max-height: 70vh; overflow-y: auto;">
                    <h5 style="border-bottom: 1px dashed #555; padding-bottom:10px; margin-top:0; color: #ccc;">${subtitulo}</h5>
                    ${isFullHtml ? linhas : `
                    <table style="width: 100%; font-size: 0.9rem; color: #fff;">
                        <thead style="background: #333;"><tr><th align="left" style="padding:5px;">Hora</th><th align="left" style="padding:5px;">Item</th><th align="right" style="padding:5px;">R$</th></tr></thead>
                        <tbody>${linhas}</tbody>
                        ${total !== null ? `<tfoot><tr style="border-top:1px solid #555;"><td colspan="2" style="padding:10px 0; font-weight:bold;">TOTAL:</td><td align="right" style="padding:10px 0; font-weight:bold; color:#4ade80;">R$ ${total.toFixed(2)}</td></tr></tfoot>` : ''}
                    </table>
                    `}
                </div>

                <div class="modal-footer" style="padding: 15px; border-top: 1px solid #333;">
                    <button class="btn btn-primary btn-full" style="width: 100%;" onclick="RelatoriosEnterprise.imprimirRelatorioArmazenado()">🖨️ Imprimir (PDF)</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    // --- 🖨️ MOTOR DE IMPRESSÃO (FONTE GRANDE) ---
    imprimirRelatorioArmazenado: async () => {
        const dados = RelatoriosEnterprise.dadosRelatorioAtual;
        if (!dados) {
            await NaxioUI.alert('⚠️ Atenção', 'Nenhum dado para imprimir.', 'warning');
            return;
        }

        let htmlLimpo;

        // Nome da loja para o cabeçalho de impressão
        const nomeLoja = (App.state.currentStore?.nome_loja) || App.state.profile?.nome_loja || '';
        const lojaHeader = nomeLoja
            ? `<div style="text-align:center; font-weight:900; font-size:16px; margin-bottom:2px;">${nomeLoja.toUpperCase()}</div>`
            : '';

        // 🔄 Impressão especializada para Relatório de Reposição (4 colunas)
        if (dados._isReposicao) {
            const totalGeral = dados._totalGeral || 0;
            htmlLimpo = `
                ${lojaHeader}
                <div style="text-align:center; font-weight:900; font-size:20px; margin-bottom:5px;">${dados.titulo}</div>
                <div style="text-align:center; font-size:14px; margin-bottom:15px; color:#000; font-weight:900;">${dados.subtitulo}</div>
                <hr style="border:0; border-top:2px solid #000; margin:15px 0;">
                <table style="width:100%; border-collapse:collapse; font-size:15px; font-weight:900; color:#000;">
                    <thead>
                        <tr style="border-bottom:2px solid #000;">
                            <th align="left"  style="padding:4px 2px;">Produto</th>
                            <th align="right" style="padding:4px 2px;">Qtd</th>
                            <th align="right" style="padding:4px 2px;">Unit.</th>
                            <th align="right" style="padding:4px 2px;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${dados._linhasRaw}</tbody>
                    <tfoot>
                        <tr><td colspan="4"><hr style="border:0; border-top:2px solid #000; margin:8px 0;"></td></tr>
                        <tr>
                            <td colspan="3" style="font-weight:bold; font-size:18px; padding:4px 2px;">TOTAL GERAL:</td>
                            <td align="right" style="font-weight:bold; font-size:18px; padding:4px 2px;">R$ ${totalGeral.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="text-align:center; margin-top:30px; font-size:12px; border-top:1px dashed #ccc; padding-top:5px;">Sistema Naxio</div>
            `;
        } else {
            const isFullHtml = typeof dados.linhas === 'string' && (dados.linhas.trim().startsWith('<table') || dados.linhas.trim().startsWith('<div'));

            // HTML padrão para demais relatórios
            htmlLimpo = `
                ${lojaHeader}
                <div style="text-align:center; font-weight:900; font-size: 22px; margin-bottom:5px;">${dados.titulo}</div>
                <div style="text-align:center; font-size: 16px; margin-bottom:15px; color:#000; font-weight:900;">${dados.subtitulo}</div>
                <hr style="border:0; border-top:2px solid #000; margin: 15px 0;">
                
                ${isFullHtml ? dados.linhas : `
                <table style="width:100%; border-collapse:collapse; font-size: 18px; font-weight:900; color:#000;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000;">
                            <th align="left" style="padding:5px;">Hora</th>
                            <th align="left" style="padding:5px;">Item</th>
                            <th align="right" style="padding:5px;">R$</th>
                        </tr>
                    </thead>
                    <tbody>${dados.linhas}</tbody>
                    ${dados.total !== null ? `
                    <tfoot>
                        <tr><td colspan="3"><hr style="border:0; border-top:2px solid #000; margin: 10px 0;"></td></tr>
                        <tr>
                            <td colspan="2" style="font-weight:bold; font-size: 22px;">TOTAL:</td>
                            <td align="right" style="font-weight:bold; font-size: 22px;">R$ ${dados.total.toFixed(2)}</td>
                        </tr>
                    </tfoot>` : ''}
                </table>
                `}
                <div style="text-align:center; margin-top:30px; font-size: 12px; border-top:1px dashed #ccc; padding-top:5px;">Sistema Naxio</div>
            `;
        }

        RelatoriosEnterprise.printHtml(htmlLimpo);
    },

    // Janela de Impressão com CSS de Fonte Aumentada
    printHtml: (htmlContent) => {
        const width = RelatoriosEnterprise.config.larguraPapel; // ex: '80mm'
        const printWin = window.open('', '', 'width=800,height=600');

        printWin.document.write(`
            <html>
            <head>
                <style>
                    body { 
                        font-family: 'Courier New', monospace; 
                        margin: 0; 
                        padding: 0; 
                        width: 100%; 
                        background: white !important; 
                        color: black !important;
                    }
                    .print-wrapper {
                        width: 100%;
                        display: block;
                        text-align: center;
                    }
                    .print-container { 
                        width: ${width}; 
                        max-width: 100%;
                        display: block;
                        margin-left: auto;
                        margin-right: auto;
                        padding: 0 5px; /* Margem de segurança para evitar cortes */
                        box-sizing: border-box;
                        text-align: left; /* Restaura alinhamento do texto interno */
                    }
                    table { width: 100%; border-collapse: collapse; }
                    
                    /* AQUI AUMENTA A FONTE DAS CÉLULAS E ESCURECE O TEXTO PARA IMPRESSÃO */
                    body, td, th { font-weight: 900 !important; color: #000 !important; }
                    td *, th * { color: #000 !important; font-weight: 900 !important; }
                    td, th { vertical-align: top; text-align: left; padding: 2px 0; font-size: 16px; }
                    .right { text-align: right; }
                    hr { border: 0; border-top: 2px dashed black; margin: 5px 0; }
                    
                    * { -webkit-print-color-adjust: exact; }
                    @page { margin: 0; size: auto; }
                    
                    /* Força centralização na impressão real */
                    @media print {
                        body { margin: 0; }
                        .print-container { margin: 0 auto; }
                    }
                </style>
            </head>
            <body>
                <div class="print-wrapper">
                    <div class="print-container">
                        ${htmlContent}
                    </div>
                </div>
                <script>
                    setTimeout(() => { 
                        window.print(); 
                        // window.close(); // Opcional: fechar após imprimir
                    }, 800);
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    },

    imprimirComprovante: (comanda, pagamentos) => {
        // 🔥 AGRUPAMENTO DE ITENS
        const agrupados = {};
        if (comanda.items) {
            comanda.items.forEach(i => {
                const key = `${i.id}-${i.nome}-${i.price}`;
                if (!agrupados[key]) agrupados[key] = { ...i, qtd: 0 };
                agrupados[key].qtd += (parseFloat(i.qtd) || 1);
            });
        }
        const listaAgrupada = Object.values(agrupados);

        const itensHtml = listaAgrupada.map(i => `<tr><td>${i.qtd}x</td><td>${i.nome}</td><td class="right">${(i.price * i.qtd).toFixed(2)}</td></tr>`).join('');
        const pagsHtml = pagamentos.map(p => `<tr><td colspan="2">${p.method.toUpperCase()}</td><td class="right">${p.amount.toFixed(2)}</td></tr>`).join('');

        RelatoriosEnterprise.printHtml(`
            <div style="text-align:center; font-weight:bold; font-size:18px;">RECIBO #${comanda.numero}</div>
            <div style="text-align:center; font-size:14px; margin-bottom:10px;">${new Date().toLocaleString('pt-BR')}</div>
            <hr>
            <table style="font-size:16px;">${itensHtml}</table>
            <hr>
            <table style="font-size:16px;">${pagsHtml}</table>
            <hr>
            <div style="text-align:right; font-weight:bold; font-size:22px;">TOTAL: R$ ${(comanda.total_pago).toFixed(2)}</div>
            <div style="text-align:center; margin-top:20px; font-size:14px;">Obrigado pela preferência!</div>
        `);
    },

    imprimirConferencia: async (id) => {
        const { data: c } = await _sb.from('comandas').select('*').eq('id', id).single();
        if (!c) return;

        let subtotal = 0;
        let itensHtml = '';

        // 🔥 MOSTRA CADA ITEM COM SEU GARÇOM (SEM AGRUPAR)
        if (c.items && c.items.length > 0) {
            itensHtml = c.items.map(i => {
                const qtd = parseFloat(i.qtd) || 1;
                const preco = parseFloat(i.price) || 0;
                const totalItem = preco * qtd;
                subtotal += totalItem;

                const garcom = i.garcom || 'Sistema';
                const hora = i.data_lancamento ? new Date(i.data_lancamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

                return `
                    <tr>
                        <td>${qtd}x</td>
                        <td>${i.nome || i.name || 'Item'}</td>
                        <td class="right">${totalItem.toFixed(2)}</td>
                    </tr>
                    ${i.observacao ? `<tr><td colspan="3" style="font-size:12px; color:#666; padding-left:20px;">Obs: ${i.observacao}</td></tr>` : ''}
                    <tr>
                        <td colspan="3" style="font-size:11px; color:#999; padding-left:20px;">
                            👤 ${garcom}${hora ? ` • ${hora}` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            itensHtml = '<tr><td colspan="3" style="text-align:center;">Nenhum item</td></tr>';
        }

        // Mesas balcão sem taxa de serviço: 300 (interna), 301, 302, 304, 305, 306, 307, 308
        const MESAS_BALCAO = ['300', '301', '302', '304', '305', '306', '307', '308'];
        const isIntMsg = c.tipo_comanda === 'interna';
        const isMesaBalcao = MESAS_BALCAO.includes(String(c.numero));
        const aplicarTaxa = !isIntMsg && !isMesaBalcao;
        const taxa = aplicarTaxa ? subtotal * 0.10 : 0;
        const total = subtotal + taxa;

        const nomeLoja = (App.state.currentStore && App.state.currentStore.nome_loja) || App.state.profile?.nome_loja || 'Nossa Loja';

        RelatoriosEnterprise.printHtml(`
            <div style="text-align:center; font-weight:bold; font-size:18px; margin-bottom:5px;">${nomeLoja}</div>
            <div style="text-align:center; font-weight:bold; font-size:16px;">CONFERÊNCIA MESA ${c.numero}</div>
            <div style="text-align:center; font-size:14px; margin-bottom:10px;">${new Date().toLocaleString('pt-BR')}</div>
            <hr>
            <table style="font-size:16px;">${itensHtml}</table>
            <hr>
            <table style="font-size:16px;">
                <tr><td colspan="2">Subtotal:</td><td class="right">${subtotal.toFixed(2)}</td></tr>
                ${taxa > 0 ? `<tr><td colspan="2">Serviço (10%):</td><td class="right">${taxa.toFixed(2)}</td></tr>` : ''}
                <tr style="font-weight:bold; font-size:20px;"><td colspan="2">TOTAL:</td><td class="right">${total.toFixed(2)}</td></tr>
            </table>
            <div style="text-align:center; margin-top:20px; font-size:12px;">* Conferência de Mesa - Não Fiscal *</div>
        `);
    },

    // 🔥 NOVO: Exibir XMLs Fiscais (Corrigido para usar xml_arquivo)
    exibirXmlsFiscais: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const hoje = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const dataInicio = await NaxioUI.datePicker('📅 Data Início', 'Selecione a data inicial:', hoje);
        if (!dataInicio) return;
        const dataFim = await NaxioUI.datePicker('📅 Data Fim', 'Selecione a data final:', dataInicio);
        if (!dataFim) return;

        const dI = dataInicio;
        const dF = dataFim;

        App.utils.toast("Buscando Notas...", "info");

        // Busca pedidos que tentaram emitir NFCe (possuem numero_nfce ou status_sefaz)
        const { data: notas, error } = await _sb.from('orders')
            .select('id, created_at, numero_nfce, chave_acesso, status_sefaz, total_pago, xml_arquivo')
            .eq('store_id', App.state.storeId)
            .neq('status_sefaz', null) // Traz todas que têm histórico de Sefaz
            .gte('created_at', `${dI}T00:00:00`)
            .lte('created_at', `${dF}T23:59:59`)
            .order('created_at', { ascending: false });

        if (error || !notas || notas.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhuma NFC-e encontrada neste período.', 'info');
            return;
        }

        RelatoriosEnterprise._ultimasNotasGerais = { notas, dataInicio: dI, dataFim: dF };

        const renderTab = (statusFilter) => {
            const filtradas = notas.filter(n => {
                const s = (n.status_sefaz || '').toLowerCase();
                if (statusFilter === 'autorizadas') return s === 'autorizado' || s === 'autorizada' || s === 'processado' || s === 'concluido';
                if (statusFilter === 'canceladas') return s === 'cancelado' || s === 'cancelada';
                // Pendentes: tudo que não é autorizado nem cancelado
                if (statusFilter === 'pendentes') return !(s === 'autorizado' || s === 'autorizada' || s === 'processado' || s === 'concluido' || s === 'cancelado' || s === 'cancelada');
                return true;
            });

            if (filtradas.length === 0) return '<tr><td colspan="4" align="center" style="padding:10px;">Nenhuma nota encontrada.</td></tr>';

            return filtradas.map(n => {
                const chave = n.chave_acesso ? `<br><small style="color:#aaa;">CH: ${n.chave_acesso}</small>` : '';
                const btnXML = n.xml_arquivo ? `<button class="btn btn-sm btn-info" onclick="RelatoriosEnterprise.baixarXmlIndividual('${n.id}')" title="Baixar XML" style="width:auto; padding:4px 8px;"><i class="ri-file-code-line"></i> XML</button>` : '';
                const btnReemitir = `<button class="btn btn-sm btn-warning" onclick="App.fiscal.emitirNFCe('${n.id}')" title="Emitir/Reemitir NFC-e" style="width:auto; padding:4px 8px; margin-left:5px;"><i class="ri-refresh-line"></i> Emitir/Reemitir</button>`;
                const statusHtml = statusFilter === 'pendentes' ? `<br><small style="color:#f59e0b;">${n.status_sefaz}</small>` : '';

                return `
                <tr style="border-bottom:1px solid #333;">
                    <td style="padding:8px 5px;">${new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                    <td style="padding:8px 5px;">Nota #${n.numero_nfce || 'S/N'}${chave}${statusHtml}</td>
                    <td style="padding:8px 5px;" align="right">R$ ${(n.total_pago || 0).toFixed(2)}</td>
                    <td style="padding:8px 5px;" align="right">${btnXML}${btnReemitir}</td>
                </tr>`;
            }).join('');
        };

        const html = `
        <div id="nfce-manager-modal" class="modal-overlay" style="display:flex; z-index:10005;">
            <div class="modal-content" style="max-width:700px; max-height:90vh; background: var(--surface); color: var(--text-color);">
                <div class="modal-header">
                    <h3>📑 Gestor de NFC-e</h3>
                    <div>
                        <button class="btn btn-primary btn-sm" style="margin-right:10px;" onclick="RelatoriosEnterprise.exportarFaturasPDF()"><i class="ri-file-pdf-line"></i> Exportar Faturas PDF</button>
                        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('nfce-manager-modal').remove()">Fechar</button>
                    </div>
                </div>
                <div class="modal-body" style="padding: 15px; overflow-y:auto; max-height: calc(90vh - 80px);">
                    
                    <div class="g-tabs" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                        <button class="btn btn-primary" onclick="document.getElementById('tb-aut').style.display='table'; document.getElementById('tb-pen').style.display='none'; document.getElementById('tb-can').style.display='none';">Autorizadas</button>
                        <button class="btn btn-warning" onclick="document.getElementById('tb-aut').style.display='none'; document.getElementById('tb-pen').style.display='table'; document.getElementById('tb-can').style.display='none';">Pendentes / Erro</button>
                        <button class="btn btn-danger"  onclick="document.getElementById('tb-aut').style.display='none'; document.getElementById('tb-pen').style.display='none'; document.getElementById('tb-can').style.display='table';">Canceladas</button>
                    </div>

                    <table id="tb-aut" style="width:100%; font-size:0.85rem; display:table; border-collapse:collapse;">
                        <thead style="background:#1e293b;"><tr><th align="left" style="padding:8px 5px;">Data</th><th align="left" style="padding:8px 5px;">Nota / Chave</th><th align="right" style="padding:8px 5px;">Valor</th><th align="right" style="padding:8px 5px;">Ação</th></tr></thead>
                        <tbody>${renderTab('autorizadas')}</tbody>
                    </table>

                    <table id="tb-pen" style="width:100%; font-size:0.85rem; display:none; border-collapse:collapse;">
                        <thead style="background:#78350f;"><tr><th align="left" style="padding:8px 5px;">Data</th><th align="left" style="padding:8px 5px;">Nota / Status</th><th align="right" style="padding:8px 5px;">Valor</th><th align="right" style="padding:8px 5px;">Ação</th></tr></thead>
                        <tbody>${renderTab('pendentes')}</tbody>
                    </table>

                    <table id="tb-can" style="width:100%; font-size:0.85rem; display:none; border-collapse:collapse;">
                        <thead style="background:#7f1d1d;"><tr><th align="left" style="padding:8px 5px;">Data</th><th align="left" style="padding:8px 5px;">Nota / Chave</th><th align="right" style="padding:8px 5px;">Valor</th><th align="right" style="padding:8px 5px;">Ação</th></tr></thead>
                        <tbody>${renderTab('canceladas')}</tbody>
                    </table>

                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    baixarXmlIndividual: async (orderId) => {
        const { data: order } = await _sb.from('orders').select('xml_arquivo, numero_nfce').eq('id', orderId).single();
        if (!order || !order.xml_arquivo) {
            await NaxioUI.alert('❌ Erro', 'XML não encontrado.', 'error');
            return;
        }

        // 🔥 O XML está em formato BYTEA (Hex) no banco
        let xmlText = order.xml_arquivo;
        if (xmlText.startsWith('\\x')) {
            const hex = xmlText.substring(2);
            const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            xmlText = new TextDecoder().decode(bytes);
        }

        const blob = new Blob([xmlText], { type: 'application/xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFCE_${order.numero_nfce || orderId}.xml`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    },

    exportarFaturasPDF: async () => {
        const dados = RelatoriosEnterprise._ultimasNotasGerais;
        if (!dados || !dados.notas) {
            return NaxioUI.alert('❌ Erro', 'Nenhuma nota disponível para exportar.', 'error');
        }

        const notas = dados.notas.filter(n => {
            const s = (n.status_sefaz || '').toLowerCase();
            return s === 'autorizado' || s === 'autorizada' || s === 'processado' || s === 'concluido' || s === 'cancelado' || s === 'cancelada';
        });

        if (notas.length === 0) {
            return NaxioUI.alert('ℹ️ Info', 'Nenhuma nota Autorizada ou Cancelada no período.', 'info');
        }

        let total = 0;
        const linhasHtml = notas.map(n => {
            const s = (n.status_sefaz || '').toLowerCase();
            const isCancelado = s.includes('cancelad');
            const dataP = new Date(n.created_at).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            if (!isCancelado) total += (n.total_pago || 0);

            return `
            <tr>
                <td style="padding:5px; border-bottom:1px solid #ddd;">${dataP}</td>
                <td style="padding:5px; border-bottom:1px solid #ddd;">${n.numero_nfce || 'S/N'}</td>
                <td style="padding:5px; border-bottom:1px solid #ddd; word-break: break-all; font-size:10px;">${n.chave_acesso || '--'}</td>
                <td style="padding:5px; border-bottom:1px solid #ddd; color: ${isCancelado ? 'red' : 'green'};">${isCancelado ? 'Cancelada' : 'Autorizada'}</td>
                <td style="padding:5px; border-bottom:1px solid #ddd;" align="right">R$ ${(n.total_pago || 0).toFixed(2)}</td>
            </tr>`;
        }).join('');

        const loja = App.state.currentStore?.nome_loja || "Minha Loja";
        const content = `
            <div style="text-align:center; font-weight:bold; font-size:22px;">RELATÓRIO DE FATURAS (NFC-e)</div>
            <div style="text-align:center; font-size:16px;">${loja}</div>
            <div style="text-align:center; font-size:14px; margin-bottom:20px;">Período: ${new Date(dados.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR')} até ${new Date(dados.dataFim + 'T23:59:59').toLocaleDateString('pt-BR')}</div>
            <hr>
            <table style="width:100%; border-collapse:collapse; font-size:14px; font-weight:bold;">
                <thead style="background:#eee; text-align:left;">
                    <tr>
                        <th style="padding:8px;">Data/Hora</th>
                        <th style="padding:8px;">NF</th>
                        <th style="padding:8px;">Chave</th>
                        <th style="padding:8px;">Status</th>
                        <th style="padding:8px; text-align:right;">Valor</th>
                    </tr>
                </thead>
                <tbody>${linhasHtml}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align:right; padding:15px 5px; font-size:18px;">Total Válido:</td>
                        <td style="text-align:right; padding:15px 5px; font-size:18px; color:green;">R$ ${total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="text-align:center; margin-top:40px; font-size:12px;">Gerado em: ${new Date().toLocaleString('pt-BR')} - Sistema Naxio</div>
        `;

        RelatoriosEnterprise.printHtml(content);
    },

    openStaffModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'staff-modal';
        modal.style.cssText = 'display: flex; z-index: 10005;';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 520px; background: var(--surface); color: var(--text-color);">
                <div class="modal-header">
                    <h3>👥 Gerenciar Equipe</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('staff-modal').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding: 0;">

                    <!-- ABAS -->
                    <div style="display:flex; border-bottom:2px solid var(--border);">
                        <button id="tab-novo" onclick="RelatoriosEnterprise._switchStaffTab('novo')"
                            style="flex:1; padding:12px; border:none; cursor:pointer; font-weight:700; font-size:0.9rem;
                                   background:var(--primary); color:#fff; border-radius:0; transition:all 0.2s;">
                            ➕ Novo Funcionário
                        </button>
                        <button id="tab-vincular" onclick="RelatoriosEnterprise._switchStaffTab('vincular')"
                            style="flex:1; padding:12px; border:none; cursor:pointer; font-weight:700; font-size:0.9rem;
                                   background:var(--surface); color:var(--text-muted); border-radius:0; transition:all 0.2s;">
                            🔗 Vincular Existente
                        </button>
                    </div>

                    <!-- ABA: NOVO -->
                    <div id="tab-content-novo" style="padding:20px;">
                        <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 15px 0;">
                            Cria um novo login para o funcionário e já vincula a esta loja.
                        </p>
                        <div class="input-wrapper"><label class="text-xs">Nome Completo</label><input id="staff-name" class="input-field" placeholder="Ex: João Silva"></div>
                        <div class="input-wrapper"><label class="text-xs">Email (Login)</label><input id="staff-email" type="email" class="input-field" placeholder="joao@email.com"></div>
                        <div class="input-wrapper"><label class="text-xs">Senha</label><input id="staff-pass" type="password" class="input-field" placeholder="Mínimo 6 caracteres"></div>
                        <div style="display:flex; gap:10px;">
                            <div class="input-wrapper" style="flex:1;">
                                <label class="text-xs">Cargo</label>
                                <select id="staff-role" class="input-field">
                                    <option value="garcom">Garçom</option>
                                    <option value="cumim">Cumim</option>
                                    <option value="caixa">Caixa</option>
                                    <option value="cozinha">Cozinha</option>
                                </select>
                            </div>
                            <div class="input-wrapper" style="flex:1;">
                                <label class="text-xs">Taxa Serviço %</label>
                                <input id="staff-rate" type="number" class="input-field" value="10">
                            </div>
                        </div>
                        <button class="btn btn-success btn-full" onclick="App.admin.registerStaff()">
                            💾 Criar e Vincular
                        </button>
                    </div>

                    <!-- ABA: VINCULAR EXISTENTE -->
                    <div id="tab-content-vincular" style="padding:20px; display:none;">
                        <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 15px 0;">
                            Funcionário já tem cadastro (trabalha em outra loja)?<br>
                            Digite o e-mail dele para vinculá-lo também a esta loja.
                        </p>
                        <div class="input-wrapper">
                            <label class="text-xs">Email do Funcionário</label>
                            <div style="display:flex; gap:8px;">
                                <input id="link-staff-email" type="email" class="input-field" placeholder="email@existente.com">
                                <button class="btn btn-secondary" style="white-space:nowrap;" onclick="App.admin.lookupStaff()">
                                    🔍 Buscar
                                </button>
                            </div>
                        </div>

                        <!-- Resultado da busca -->
                        <div id="link-staff-result" style="display:none; margin-top:10px;
                            background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.3);
                            border-radius:10px; padding:15px;">
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                <div style="width:44px; height:44px; background:linear-gradient(135deg,#3b82f6,#6366f1);
                                    border-radius:50%; display:flex; align-items:center; justify-content:center;
                                    font-size:1.3rem; flex-shrink:0;">🤵</div>
                                <div>
                                    <div id="link-staff-name" style="font-weight:700; font-size:1rem;"></div>
                                    <div id="link-staff-role-label" style="font-size:0.8rem; color:var(--text-muted);"></div>
                                </div>
                            </div>
                            <div style="display:flex; gap:10px;">
                                <div class="input-wrapper" style="flex:1; margin-bottom:0;">
                                    <label class="text-xs">Cargo nesta loja</label>
                                    <select id="link-staff-role" class="input-field">
                                        <option value="garcom">Garçom</option>
                                        <option value="cumim">Cumim</option>
                                        <option value="caixa">Caixa</option>
                                        <option value="cozinha">Cozinha</option>
                                    </select>
                                </div>
                                <div class="input-wrapper" style="flex:1; margin-bottom:0;">
                                    <label class="text-xs">Taxa %</label>
                                    <input id="link-staff-rate" type="number" class="input-field" value="10">
                                </div>
                            </div>
                            <button class="btn btn-success btn-full" style="margin-top:12px;"
                                onclick="App.admin.linkExistingStaff()">
                                🔗 Vincular a Esta Loja
                            </button>
                        </div>

                        <div id="link-staff-notfound" style="display:none; margin-top:10px;
                            background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3);
                            border-radius:10px; padding:15px; text-align:center; color:#ef4444;">
                            ❌ Nenhum funcionário encontrado com este email.
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    _switchStaffTab: (tab) => {
        const novo = document.getElementById('tab-content-novo');
        const vincular = document.getElementById('tab-content-vincular');
        const btnNovo = document.getElementById('tab-novo');
        const btnVincular = document.getElementById('tab-vincular');

        if (tab === 'novo') {
            novo.style.display = 'block';
            vincular.style.display = 'none';
            btnNovo.style.background = 'var(--primary)';
            btnNovo.style.color = '#fff';
            btnVincular.style.background = 'var(--surface)';
            btnVincular.style.color = 'var(--text-muted)';
        } else {
            novo.style.display = 'none';
            vincular.style.display = 'block';
            btnVincular.style.background = 'var(--primary)';
            btnVincular.style.color = '#fff';
            btnNovo.style.background = 'var(--surface)';
            btnNovo.style.color = 'var(--text-muted)';
        }
    },

    // 🗓️ RELATÓRIO DE CREDIÁRIO
    relatorioCrediario: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        
        const { data: installments, error } = await _sb.from('crediario_installments')
            .select('*, profiles:customer_id(nome_completo)')
            .eq('store_id', App.state.storeId)
            .order('due_date', { ascending: true });

        if (error || !installments || installments.length === 0) {
            return NaxioUI.alert('ℹ️ Info', 'Nenhuma parcela de crediário encontrada.', 'info');
        }

        let linhas = '';
        let totalPendente = 0;
        let totalPago = 0;
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        installments.forEach(i => {
            const venc = new Date(i.due_date + 'T12:00:00');
            const valor = parseFloat(i.amount);
            const isPago = i.status === 'pago';
            
            if (isPago) totalPago += valor;
            else totalPendente += valor;

            const corStatus = isPago ? '#4ade80' : (venc < hoje ? '#ef4444' : '#f59e0b');
            const statusTxt = isPago ? 'Pago' : (venc < hoje ? 'Atrasado' : 'Pendente');

            linhas += `
                <tr>
                    <td style="padding:5px; border-bottom:1px solid #333;">${venc.toLocaleDateString('pt-BR')}</td>
                    <td style="padding:5px; border-bottom:1px solid #333;">
                        <div style="font-weight:bold;">${i.profiles?.nome_completo || 'N/A'}</div>
                        <div style="font-size:0.7rem; color:#94a3b8;">Parc. #${i.installment_number}</div>
                    </td>
                    <td style="padding:5px; border-bottom:1px solid #333;" align="right">R$ ${valor.toFixed(2)}</td>
                    <td style="padding:5px; border-bottom:1px solid #333; color:${corStatus}; font-weight:bold;" align="right">${statusTxt}</td>
                </tr>
            `;
        });

        const rodape = `
            <tr style="border-top:2px solid #555;">
                <td colspan="2" style="padding:10px 5px; font-weight:bold;">TOTAL PAGO:</td>
                <td colspan="2" align="right" style="padding:10px 5px; font-weight:bold; color:#4ade80;">R$ ${totalPago.toFixed(2)}</td>
            </tr>
            <tr>
                <td colspan="2" style="padding:5px; font-weight:bold;">TOTAL PENDENTE:</td>
                <td colspan="2" align="right" style="padding:5px; font-weight:bold; color:#f59e0b;">R$ ${totalPendente.toFixed(2)}</td>
            </tr>
        `;

        RelatoriosEnterprise.exibirModal(
            '📊 Relatório de Crediário',
            `Resumo Geral de Parcelas - ${new Date().toLocaleDateString()}`,
            `
            <table style="width:100%; border-collapse:collapse; color:#fff; font-size:0.85rem;">
                <thead style="background:#333;">
                    <tr>
                        <th align="left" style="padding:8px 5px;">Vencimento</th>
                        <th align="left" style="padding:8px 5px;">Cliente / Parcela</th>
                        <th align="right" style="padding:8px 5px;">Valor</th>
                        <th align="right" style="padding:8px 5px;">Status</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
                <tfoot>${rodape}</tfoot>
            </table>
            `,
            null
        );
    }
};

// 🎛️ PAINEL CENTRAL DE GESTÃO
const PainelRelatorios = {
    open: async () => {
        const tipoNegocio = App.state.currentStore?.tipo_loja || 'Outros';
        const isRestaurante = tipoNegocio.toLowerCase().includes('restaurante') || tipoNegocio.toLowerCase().includes('bar') || tipoNegocio.toLowerCase().includes('aliment');
        const isAutopecas = tipoNegocio.toLowerCase().includes('auto') || tipoNegocio.toLowerCase().includes('oficina') || tipoNegocio.toLowerCase().includes('peca');
        const isVarejo = tipoNegocio.toLowerCase().includes('roupa') || tipoNegocio.toLowerCase().includes('varejo') || tipoNegocio.toLowerCase().includes('loja') || tipoNegocio.toLowerCase().includes('mod');

        const check = (mod, func) => `if(typeof ${mod} !== 'undefined') ${func}; else NaxioUI.alert('Módulo', 'Módulo ${mod} não carregado', 'error');`;

        // Pré-calcula métricas de vendas para mostrar no painel
        const sid = App.state.storeId;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const fetchLimitDate = new Date(Math.min(new Date(startOfMonth).getTime(), new Date(startOfWeek).getTime())).toISOString();

        let dayTotal = 0, weekTotal = 0, monthTotal = 0;
        
        let allOrders = [];
        let fromIdx = 0;
        let limitStep = 999;
        let contFetch = true;

        while(contFetch) {
            const { data: oData } = await _sb.from('orders')
                .select('created_at, total_pago, products(preco)')
                .eq('store_id', sid)
                .gte('created_at', fetchLimitDate)
                .neq('status', 'cancelado')
                .neq('status', 'devolvido')
                .range(fromIdx, fromIdx + limitStep);

            if (oData && oData.length > 0) {
                allOrders = allOrders.concat(oData);
                fromIdx += limitStep + 1;
                if (oData.length <= limitStep) contFetch = false;
            } else {
                contFetch = false;
            }
        }

        allOrders.forEach(o => {
            const val = parseFloat(o.total_pago) || parseFloat(o.products?.preco) || 0;
            if (o.created_at >= startOfDay) dayTotal += val;
            if (o.created_at >= startOfWeek) weekTotal += val;
            if (o.created_at >= startOfMonth) monthTotal += val;
        });

        const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const modal = document.createElement('div');
        modal.id = 'painel-relatorios-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10000;';

        let htmlBody = '';

        // ===========================================
        // 📊 MÉTRICAS DE VENDAS (antes estavam na tela)
        // ===========================================
        htmlBody += `
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px;">
                <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe); padding:15px; border-radius:12px; text-align:center; border:1px solid #bfdbfe;">
                    <div style="font-size:0.75rem; color:#1e40af; font-weight:600;">VENDAS HOJE</div>
                    <div style="font-size:1.4rem; font-weight:800; color:#1d4ed8; margin-top:4px;">${fmt(dayTotal)}</div>
                </div>
                <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7); padding:15px; border-radius:12px; text-align:center; border:1px solid #bbf7d0;">
                    <div style="font-size:0.75rem; color:#065f46; font-weight:600;">SEMANA</div>
                    <div style="font-size:1.4rem; font-weight:800; color:#059669; margin-top:4px;">${fmt(weekTotal)}</div>
                </div>
                <div style="background:linear-gradient(135deg,#f5f3ff,#ede9fe); padding:15px; border-radius:12px; text-align:center; border:1px solid #ddd6fe;">
                    <div style="font-size:0.75rem; color:#5b21b6; font-weight:600;">MÊS</div>
                    <div style="font-size:1.4rem; font-weight:800; color:#7c3aed; margin-top:4px;">${fmt(monthTotal)}</div>
                </div>
            </div>
        `;

        // ===========================================
        // 📈 GRÁFICOS DE PERFORMANCE
        // ===========================================
        htmlBody += `
            <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:15px; margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h5 style="color:#8b5cf6; margin:0;"><i class="ri-bar-chart-grouped-line"></i> Performance</h5>
                    <select id="chart-period" class="input-field" style="width:auto; padding:4px 8px; height:32px; font-size:0.8rem;"
                        onchange="App.dashboard.loadCharts()">
                        <option value="7">7 dias</option>
                        <option value="30" selected>30 dias</option>
                    </select>
                </div>
                <div style="display:grid; grid-template-columns:1fr; gap:10px;">
                    <div style="background:var(--background); padding:8px; border-radius:8px; border:1px solid var(--border);">
                        <canvas id="chart-sales-bar"></canvas>
                    </div>
                </div>
            </div>
        `;

        // ===========================================
        // 🍽️ RESTAURANTE
        // ===========================================
        if (isRestaurante) {
            htmlBody += `
                <h5 style="color: var(--primary); border-bottom: 1px solid var(--border); margin-top:0;">🍽️ Atendimento</h5>
                <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 20px;">
                    <button class="btn btn-primary" style="padding: 15px; font-size: 1.1rem;" 
                            onclick="App.store.openGestaoSalao(); document.getElementById('painel-relatorios-modal').remove();">
                        <i class="ri-restaurant-2-line"></i> <strong>ABRIR GESTÃO DE MESAS & COMANDAS</strong>
                    </button>
                    <button class="btn btn-secondary" style="padding: 12px;" 
                            onclick="ReservasPratosSystem.abrirPainel(); document.getElementById('painel-relatorios-modal').remove();">
                        <i class="ri-calendar-check-line"></i> <strong>RESERVAS DE PRATOS (Almoço)</strong>
                    </button>
                </div>
            `;
        }

        // ===========================================
        // 💰 FINANCEIRO
        // ===========================================
        htmlBody += `
            <h5 style="color: var(--success); border-bottom: 1px solid var(--border);">💰 Financeiro</h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.historicoCaixas()"> <i class="ri-wallet-3-line"></i> Histórico Caixas </button>
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.relatorioCaixaPorPeriodo()"> <i class="ri-calendar-check-line"></i> Caixa por Período </button>
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.relatorioDespesasDia()"> <i class="ri-money-dollar-circle-line"></i> Despesas </button>
            </div>
        `;

        // ===========================================
        // 🔄 VENDAS / CANCELAMENTOS / DEVOLUÇÕES
        // ===========================================
        htmlBody += `
            <h5 style="color: #ef4444; border-bottom: 1px solid var(--border);">🔄 Vendas & Devoluções</h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <button class="btn btn-secondary" onclick="PainelRelatorios.openSalesHistory()"><i class="ri-file-list-3-line"></i> Histórico de Vendas</button>
                <button class="btn btn-secondary" style="color:#ef4444; border-color:#ef4444;" onclick="PainelRelatorios.openCancellations()"><i class="ri-close-circle-line"></i> Cancelamentos</button>
            </div>
        `;

        // ===========================================
        // 🚩 GUIAS (RESTAURANTE)
        // ===========================================
        if (isRestaurante) {
            htmlBody += `
                <h5 style="color: #8b5cf6; border-bottom: 1px solid var(--border);">🚩 Guias de Turismo</h5>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="${check('GuiasSystem', 'GuiasSystem.openCadastro()')}"><i class="ri-flag-line"></i> Cadastrar Guia</button>
                    <button class="btn btn-secondary" onclick="${check('GuiasSystem', 'GuiasSystem.gerarRelatorio()')}"><i class="ri-file-list-3-line"></i> Relatório Guias</button>
                </div>

                <h5 style="color: var(--warning); border-bottom: 1px solid var(--border);">👔 Garçons & Staff</h5>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="RelatoriosEnterprise.openStaffModal()"><i class="ri-user-add-line"></i> Cadastrar Equipe</button>
                    <button class="btn btn-secondary" onclick="if(typeof GarcomSystem !== 'undefined') GarcomSystem.gerarRelatorio(); else NaxioUI.alert('Erro', 'Garcom.js não carregado', 'error');"><i class="ri-pie-chart-2-line"></i> Comissões Garçom</button>
                </div>
            `;
        }

        // ===========================================
        // 🛍️ VAREJO / CREDIÁRIO
        // ===========================================
        if (isVarejo) {
            htmlBody += `
                <h5 style="color: #60a5fa; border-bottom: 1px solid var(--border);">🛍️ Varejo & Crediário</h5>
                <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 20px;">
                    <button class="btn btn-primary" style="padding: 12px; font-size: 1.1rem;" onclick="RelatoriosEnterprise.relatorioCrediario()">
                        <i class="ri-calendar-todo-line"></i> <strong>VER RELATÓRIO DE PARCELAS</strong>
                    </button>
                    <button class="btn btn-secondary" onclick="GestaoLojista.open(); document.getElementById('painel-relatorios-modal').remove();">
                        <i class="ri-settings-3-line"></i> <strong>GESTÃO DE COBRANÇAS (ADM)</strong>
                    </button>
                </div>
            `;
        }

        // ===========================================
        // ⚙️ ADMINISTRATIVO
        // ===========================================
        htmlBody += `
            <h5 style="color: var(--text-muted); border-bottom: 1px solid var(--border);">⚙️ Administrativo</h5>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.exibirXmlsFiscais()"><i class="ri-file-code-line"></i> XMLs Fiscais</button>
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.configurarImpressora()"><i class="ri-printer-line"></i> Config. Impressora</button>
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.relatorioInventario()"><i class="ri-archive-line"></i> Estoque Rápido</button>
                <button class="btn btn-secondary" onclick="RelatoriosEnterprise.relatorioReposicao()"><i class="ri-refresh-line"></i> Reposição (Vendidos)</button>
            </div>
        `;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px; max-height:90vh; background: var(--surface); color: var(--text-color);">
                <div class="modal-header">
                    <h3>📊 Central de Gestão & Relatórios</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('painel-relatorios-modal').remove()">✕</button>
                </div>
                <div class="modal-body" style="overflow-y:auto; max-height: calc(90vh - 80px);">
                    ${htmlBody}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Carrega gráficos após o modal estar no DOM
        setTimeout(() => {
            if (App.dashboard && App.dashboard.loadCharts) App.dashboard.loadCharts();
        }, 300);
    },

    // 📋 Histórico de Vendas com ações de cancelar/devolver
    openSalesHistory: async () => {
        App.utils.toast("Carregando vendas...", "info");
        const { data: vendas } = await _sb.from('orders')
            .select('*, products(nome)')
            .eq('store_id', App.state.storeId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!vendas || vendas.length === 0) {
            return NaxioUI.alert('Sem Vendas', 'Nenhuma venda encontrada.', 'info');
        }

        const statusColors = {
            'concluido': '#22c55e', 'concluída': '#22c55e', 'entregue': '#22c55e',
            'cancelado': '#ef4444', 'devolvido': '#f59e0b',
            'pendente': '#6366f1'
        };

        const lista = vendas.map(v => {
            const val = parseFloat(v.total_pago || v.total || 0);
            const status = v.status || 'pendente';
            const color = statusColors[status.toLowerCase()] || '#64748b';
            const desc = v.products?.nome || v.observacao?.substring(0, 30) || 'Venda';
            const dt = new Date(v.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const isFinal = ['cancelado', 'devolvido'].includes(status.toLowerCase());

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border);">
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:0.9rem;">${desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${dt} • <span style="color:${color}; font-weight:bold;">${status.toUpperCase()}</span></div>
                    </div>
                    <div style="text-align:right; min-width:130px;">
                        <div style="font-weight:bold; margin-bottom:4px;">R$ ${val.toFixed(2)}</div>
                        ${!isFinal ? `
                            <button class="btn btn-sm btn-danger" style="width:auto; padding:2px 6px; font-size:0.7rem; margin-right:4px;" onclick="App.autopecas.cancelSale('${v.id}'); document.getElementById('sales-history-modal')?.remove();">Cancelar</button>
                            <button class="btn btn-sm btn-warning" style="width:auto; padding:2px 6px; font-size:0.7rem;" onclick="App.autopecas.returnSale('${v.id}'); document.getElementById('sales-history-modal')?.remove();">Devolver</button>
                        ` : ''}
                    </div>
                </div>`;
        }).join('');

        const html = `
        <div id="sales-history-modal" class="modal-overlay" style="display:flex; z-index:10003;">
            <div class="modal-content" style="max-width:600px; max-height:85vh;">
                <div class="modal-header">
                    <h3><i class="ri-file-list-3-line"></i> Histórico de Vendas</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('sales-history-modal').remove()">Fechar</button>
                </div>
                <div class="modal-body" style="overflow-y:auto; max-height: calc(85vh - 80px); padding:0;">
                    ${lista}
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    // ❌ Cancelamentos recentes
    openCancellations: async () => {
        App.utils.toast("Buscando cancelamentos...", "info");
        const { data: cancelados } = await _sb.from('orders')
            .select('*, products(nome)')
            .eq('store_id', App.state.storeId)
            .in('status', ['cancelado', 'devolvido'])
            .order('created_at', { ascending: false })
            .limit(100);

        if (!cancelados || cancelados.length === 0) {
            return NaxioUI.alert('Sem Cancelamentos', 'Nenhuma venda cancelada ou devolvida.', 'info');
        }

        const lista = cancelados.map(v => {
            const val = parseFloat(v.total_pago || v.total || 0);
            const color = v.status === 'cancelado' ? '#ef4444' : '#f59e0b';
            const descTitle = v.origem_venda === 'cancelamento_item' || v.origem_venda === 'cancelamento_comanda' 
                ? '📝 Registro de Cancelamento'
                : (v.products?.nome || 'Venda Cancelada');
            const desc = v.observacao || '';
            const dt = new Date(v.created_at).toLocaleString('pt-BR');
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border);">
                    <div style="flex:1;">
                        <div style="font-weight:600; color:${color};">${descTitle}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom: 5px;">${dt}</div>
                        <div style="font-size:0.85rem; color:#cbd5e1; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px; border-left: 3px solid ${color}; line-height: 1.4;">
                            ${desc}
                        </div>
                    </div>
                    <div style="text-align:right; min-width: 80px; margin-left: 10px;">
                        <div style="font-weight:bold; color:${color}; margin-top: 5px;">R$ ${val.toFixed(2)}</div>
                    </div>
                </div>`;
        }).join('');

        const html = `
        <div id="cancellations-modal" class="modal-overlay" style="display:flex; z-index:10003;">
            <div class="modal-content" style="max-width:600px; max-height:85vh;">
                <div class="modal-header" style="background:#fef2f2; border-bottom:2px solid #fecaca;">
                    <h3 style="color:#991b1b;"><i class="ri-close-circle-line"></i> Cancelamentos & Devoluções</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('cancellations-modal').remove()">Fechar</button>
                </div>
                <div class="modal-body" style="overflow-y:auto; max-height: calc(85vh - 80px); padding:0;">
                    ${lista}
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }
};

// 📅 SISTEMA DE RESERVAS DE PRATOS (ALMOÇO)
const ReservasPratosSystem = {
    currentData: [],

    abrirPainel: async () => {
        if (!App.state.storeId) return NaxioUI.alert("Erro", "Loja não identificada.", "error");

        const hoje = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

        // Fetch reservations
        const { data: reservas, error } = await _sb.from('reservas_pratos')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('data_reserva', hoje)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            return App.utils.toast("Erro ao carregar reservas.", "error");
        }

        // --- FILTRA: exibe somente comidas (bloqueia bebidas e drinks por categoria) ---
        const CATS_COMIDA = ['Comidas', 'Petiscos', 'Sobremesas', 'Entradas', 'Combos'];
        const listaFiltrada = (reservas || []).filter(item => {
            const cat = (item.categoria || item.produto_categoria || '').trim();
            if (cat) return CATS_COMIDA.includes(cat);
            // Fallback por nome (itens antigos sem categoria salva)
            const nome = (item.produto_nome || '').toLowerCase();
            const bl = ['suco', 'refri', 'coca', 'fanta', 'sprite', 'pepsi', 'cerveja',
                'chopp', 'água', 'agua', 'bebida', 'vinho', 'mate', 'guarana', 'h2o',
                'soda', 'café', 'cafe', 'suquinho', 'refrigerante', 'lata', 'garrafa',
                '600ml', 'litro', 'long neck', 'dose', 'drink', 'caipirinha', 'coquetel'];
            return !bl.some(term => nome.includes(term));
        });

        ReservasPratosSystem.currentData = listaFiltrada;

        // Render Modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10005; justify-content: center; align-items: center; background: rgba(0,0,0,0.8); position: fixed; top: 0; left: 0; width: 100%; height: 100vh;';

        const listaHtml = (listaFiltrada && listaFiltrada.length > 0) ? listaFiltrada.map(r => `
            <div style="background: #1e293b; padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #334155;">
                <div style="display:flex; justify-content:space-between;">
                    <strong style="color:#f1f5f9; font-size: 1.1rem;">${r.quantidade}x ${r.produto_nome}</strong>
                    <span style="color:#3b82f6; font-weight:bold;">Mesa ${r.mesa_numero}</span>
                </div>
                <div style="font-size:0.85rem; color:#cbd5e1; margin-top:5px;">
                    ${r.observacoes ? `<span style="color:#f59e0b;">📝 ${r.observacoes}</span><br>` : ''}
                    <span style="color:#64748b;">👤 ${r.garcom_nome} • ${new Date(r.created_at).toLocaleTimeString().slice(0, 5)}</span>
                </div>
            </div>
        `).join('') : '<div style="text-align:center; color:#94a3b8; padding:20px;">Nenhuma reserva de comida para hoje.</div>';

        modal.innerHTML = `
            <div class="modal-content" style="background: #0f172a; color: #fff; width: 95%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column; border-radius: 12px; border: 1px solid #334155;">
                <div class="modal-header" style="border-bottom: 1px solid #334155; padding: 15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">📅 Reservas de Pratos (Hoje)</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding: 15px; overflow-y: auto; flex: 1;">
                    ${listaHtml}
                </div>
                <div class="modal-footer" style="padding: 15px; border-top: 1px solid #334155;">
                    <button class="btn btn-primary btn-full" onclick="ReservasPratosSystem.imprimirLista()">🖨️ Imprimir Lista de Produção</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    },

    imprimirLista: async () => {
        const reservas = ReservasPratosSystem.currentData || [];
        if (reservas.length === 0) return NaxioUI.alert('Atenção', "Nada para imprimir.", 'warning');

        // Agrupamento
        const resumo = {};
        reservas.forEach(r => {
            const k = r.produto_nome;
            if (!resumo[k]) resumo[k] = 0;
            resumo[k] += parseFloat(r.quantidade);
        });

        const resumoHtml = Object.entries(resumo).map(([prod, qtd]) =>
            `<tr><td style="font-weight:bold;">${qtd}x</td><td>${prod}</td></tr>`
        ).join('');

        const detalhesHtml = reservas.map(r => `
            <tr>
                <td style="font-size:16px; font-weight:bold;">${r.quantidade}x</td>
                <td style="font-size:16px;">${r.produto_nome}</td>
                <td style="font-size:16px; text-align:right;">Mesa ${r.mesa_numero}</td>
            </tr>
            ${r.observacoes ? `<tr><td colspan="3" style="font-size:14px; font-style:italic;">Obs: ${r.observacoes}</td></tr>` : ''}
            <tr><td colspan="3" style="border-bottom:1px dashed #000; padding-bottom:5px; margin-bottom:5px;"></td></tr>
        `).join('');

        const html = `
            <div style="text-align:center; font-weight:900; font-size:18px; margin-bottom:10px;">RELATÓRIO DE RESERVAS</div>
            <div style="text-align:center; font-size:14px; margin-bottom:15px;">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
            
            <div style="font-weight:bold; border-bottom:1px solid #000; margin-bottom:5px;">RESUMO PRODUÇÃO</div>
            <table style="width:100%; margin-bottom:20px;">${resumoHtml}</table>


            <div style="text-align:center; margin-top:20px; font-size:12px;">Total de Itens: ${reservas.reduce((a, b) => a + parseFloat(b.quantidade), 0)}</div>
        `;

        RelatoriosEnterprise.printHtml(html);
    }
};

// Make it global
window.ReservasPratosSystem = ReservasPratosSystem;
