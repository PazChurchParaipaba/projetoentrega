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

    // 💸 DESPESAS DO DIA
    relatorioDespesasDia: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const dataInput = await NaxioUI.datePicker(
            '📅 Data do Relatório',
            'Selecione a data para consultar despesas:',
            new Date().toISOString().split('T')[0]
        );
        if (!dataInput) return;
        const dataISO = dataInput;
        const dataBR = new Date(dataInput).toLocaleDateString('pt-BR');

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
        const dataInicioStr = await NaxioUI.datetimePicker('📅 Início', 'Data e hora inicial:', hojeObj.toISOString().slice(0, 10) + 'T00:00');
        if (!dataInicioStr) return;

        const dataFimStr = await NaxioUI.datetimePicker('📅 Fim', 'Data e hora final:', hojeObj.toISOString().slice(0, 10) + 'T23:59');
        if (!dataFimStr) return;

        const dInicio = dataInicioStr.length === 16 ? dataInicioStr + ':00' : (dataInicioStr.includes('T') ? dataInicioStr : dataInicioStr + 'T00:00:00');
        const dFim = dataFimStr.length === 16 ? dataFimStr + ':59' : (dataFimStr.includes('T') ? dataFimStr : dataFimStr + 'T23:59:59');

        // Busca vendas do periodo
        const { data: orders } = await _sb.from('orders')
            .select('observacao, products(nome, categoria)')
            .eq('store_id', App.state.storeId)
            .gte('created_at', dInicio)
            .lte('created_at', dFim)
            .neq('status', 'cancelado');

        const contagem = {};

        if (orders) {
            orders.forEach(o => {
                let itens = [];
                try { const obs = JSON.parse(o.observacao); if (obs.itens) itens = obs.itens; } catch (e) { }

                if (itens.length === 0 && o.products) itens.push({ nome: o.products.nome, qtd: 1, categoria: o.products.categoria });

                itens.forEach(i => {
                    // 🔥 Normaliza campo de categoria (pode ser 'categoria' ou 'category')
                    const catItem = (i.categoria || i.category || '').toLowerCase();
                    const nomeItem = (i.nome || i.name || '').toLowerCase();
                    if (filtroCat && !catItem.includes(filtroCat.toLowerCase()) && !nomeItem.includes(filtroCat.toLowerCase())) return;
                    const nomeKey = i.nome || i.name || 'Item';
                    if (!contagem[nomeKey]) contagem[nomeKey] = { qtd: 0, categoria: i.categoria || i.category || '' };
                    contagem[nomeKey].qtd += (parseFloat(i.qtd) || 1);
                });
            });
        }

        // 🔥 FIX: Buscar também comandas internas (fechadas mas não geraram order)
        // Isso cobre o consumo interno / perdas lançadas na mesa
        const { data: comandasInternas } = await _sb.from('comandas')
            .select('items, updated_at')
            .eq('store_id', App.state.storeId)
            .eq('status', 'fechada') // Comandas internas ficam como 'fechada' e mantêm os itens
            .gte('updated_at', dInicio)
            .lte('updated_at', dFim);

        if (comandasInternas) {
            comandasInternas.forEach(c => {
                if (c.items && Array.isArray(c.items)) {
                    c.items.forEach(i => {
                        const cat = (i.category || i.categoria || '').toLowerCase();
                        const nomeItem = (i.nome || i.name || '').toLowerCase();
                        if (filtroCat && !cat.includes(filtroCat.toLowerCase()) && !nomeItem.includes(filtroCat.toLowerCase())) return;
                        const nomeKey = i.nome || i.name || 'Item';
                        if (!contagem[nomeKey]) contagem[nomeKey] = { qtd: 0, categoria: i.category || i.categoria || '' };
                        contagem[nomeKey].qtd += (parseFloat(i.qtd) || 1);
                    });
                }
            });
        }

        const linhas = Object.entries(contagem)
            .sort((a, b) => b[1].qtd - a[1].qtd)
            .map(([nome, info]) => `<tr><td>${nome} <small style="color:#aaa;">(${info.categoria || '-'})</small></td><td align="right">${info.qtd}</td></tr>`)
            .join('');
        RelatoriosEnterprise.exibirModal(`🔄 Reposição (${filtroCat || 'Geral'})`, `Período: ${new Date(dInicio.split('.')[0]).toLocaleString()} a ${new Date(dFim.split('.')[0]).toLocaleString()}`, linhas || '<tr><td>Nada vendido.</td></tr>', null);
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
            const color = c.fechamento ? '#ef4444' : '#22c55e';
            const status = c.fechamento ? 'FECHADO' : 'ABERTO';
            const valorFinal = c.valor_fechamento || c.valor_final_informado || 0;

            return `
                <div style="background: #2a2a2a; color: #fff; padding:12px; margin-bottom:10px; border-radius:8px; border-left:5px solid ${color}; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>${new Date(c.created_at).toLocaleDateString('pt-BR')}</strong>
                        <div style="font-size: 0.8em; color: #ccc;">${new Date(c.created_at).toLocaleTimeString()}</div>
                        <div style="color:${color}; font-weight:bold; font-size: 0.8em;">${status}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; font-size: 1.1em;">R$ ${valorFinal.toFixed(2)}</div>
                        <button class="btn btn-sm btn-secondary" onclick="RelatoriosEnterprise.verFechamentoCaixa('${c.id}')">👁️ Ver</button>
                    </div>
                </div>`;
        }).join('');

        modal.innerHTML = `<div class="modal-content" style="background:#1a1a1a; color:#fff; max-width:500px; padding:0;"><div class="modal-header" style="padding:15px; border-bottom:1px solid #333;"><h3>📜 Histórico</h3><button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button></div><div class="modal-body" style="padding:15px; max-height:400px; overflow-y:auto;">${listaHtml}</div></div>`;
        document.body.appendChild(modal);
    },

    // 🔍 CORREÇÃO CRÍTICA: BUSCA NA TABELA ORDERS PARA MOSTRAR OS VALORES CORRETOS
    verFechamentoCaixa: async (caixaId) => {
        const { data: caixa } = await _sb.from('cash_sessions').select('*').eq('id', caixaId).single();
        if (!caixa) return;

        // 1. Tenta buscar pelo ID da sessão (Garante que pega PDV + Mesas + Online)
        let { data: vendas, error } = await _sb.from('orders')
            .select('*, products(nome)')
            .eq('session_id', caixaId)
            .neq('status', 'cancelado') // Ignora cancelados
            .order('created_at', { ascending: true });

        // 2. Fallback: Se não achar (sessões antigas), busca por DATA/HORA
        if (!vendas || vendas.length === 0) {
            const fim = caixa.fechamento || new Date().toISOString();
            const { data: vendasData } = await _sb.from('orders')
                .select('*, products(nome)')
                .eq('store_id', App.state.storeId)
                .gte('created_at', caixa.created_at)
                .lte('created_at', fim)
                .neq('status', 'cancelado');
            vendas = vendasData || [];
        }

        let totalGeral = 0;
        let totalDescontos = 0;

        const linhas = (vendas && vendas.length > 0) ? vendas.map(v => {
            // Pega o valor real pago (prioridade para total_pago)
            const valorPago = parseFloat(v.total_pago || v.total || 0);
            totalGeral += valorPago;

            let descText = v.observacao || v.products?.nome || 'Venda Balcão';
            let desconto = 0;

            // Tenta ler JSON de observacao para pegar desconto
            try {
                if (v.observacao && v.observacao.startsWith('{')) {
                    const obsObj = JSON.parse(v.observacao);
                    if (obsObj.desconto) {
                        desconto = parseFloat(obsObj.desconto);
                        totalDescontos += desconto;
                    }
                    // Formata a descrição para ficar limpa: "Balcão (Desc: R$ 5,00)"
                    descText = `Venda ${obsObj.mesa ? 'Mesa ' + obsObj.mesa : 'Balcão'}`;
                }
            } catch (e) { }

            const descontoDisplay = desconto > 0 ? `<br><small style="color:#ef4444;">Desc: -R$ ${desconto.toFixed(2)}</small>` : '';

            return `<tr>
                <td style="border-bottom:1px solid #333;">${new Date(v.created_at).toLocaleTimeString().substring(0, 5)}</td>
                <td style="font-size:0.9em; border-bottom:1px solid #333;">
                    ${descText.substring(0, 30)}
                    ${descontoDisplay}
                </td>
                <td align="right" style="border-bottom:1px solid #333;">R$ ${valorPago.toFixed(2)}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="3" style="text-align:center; padding:10px;">Nenhuma venda registrada.</td></tr>';

        // Linha de totais extras se houver desconto
        let rodapeExtra = '';
        if (totalDescontos > 0) {
            rodapeExtra = `
                <tr>
                    <td colspan="2" style="font-weight:bold; color:#ef4444; padding-top:10px;">Total Descontos:</td>
                    <td align="right" style="font-weight:bold; color:#ef4444; padding-top:10px;">- R$ ${totalDescontos.toFixed(2)}</td>
                </tr>
                <tr>
                    <td colspan="2" style="font-weight:bold; color:#4ade80;">Total Líquido (Caixa):</td>
                    <td align="right" style="font-weight:bold; color:#4ade80;">R$ ${totalGeral.toFixed(2)}</td>
                </tr>
            `;
        }

        RelatoriosEnterprise.exibirModal(
            `💰 Detalhes Caixa`,
            `Abertura: ${new Date(caixa.created_at).toLocaleString()}`,
            linhas + (rodapeExtra ? `<script>setTimeout(()=>{ document.querySelector('#modal-total-row').style.display='none'; },100)</script>` : ''), // Hack para esconder total padrão se tivermos rodapé customizado, ou passamos null no total
            rodapeExtra ? null : totalGeral // Se tem rodapé extra, o total padrão do modal é null para não duplicar, nós renderizamos manualmente no HTML injetado? Não, o modal tem o footer fixo.
            // Melhor estratégia: Passar o HTML do rodapé junto com as linhas como uma tabela aninhada ou Rows de rodapé?
            // "linhas" vai dentro de <tbody>.
            // "total" vai no <tfoot>.
            // Vou passar NULL no total se tiver descontos e injetar o rodapé no final das linhas (mas fora do tbody? Não, dentro).
            // Hack: injetar linhas de sumário no final da tabela.
        );

        // Se tiver descontos, injetamos as linhas de resumo no final da tabela HTML
        if (rodapeExtra) {
            // Re-chamamos com NULL no total para não usar o footer padrão, e concatenamos o rodapeExtra nas linhas
            RelatoriosEnterprise.exibirModal(
                `💰 Detalhes Caixa`,
                `Abertura: ${new Date(caixa.created_at).toLocaleString()}`,
                linhas + rodapeExtra,
                null
            );
        } else {
            RelatoriosEnterprise.exibirModal(
                `💰 Detalhes Caixa`,
                `Abertura: ${new Date(caixa.created_at).toLocaleString()}`,
                linhas,
                totalGeral
            );
        }
    },

    // --- 🖥️ MODAL VISUAL (NA TELA) - CENTRALIZADO ---
    exibirModal: (titulo, subtitulo, linhas, total) => {
        RelatoriosEnterprise.dadosRelatorioAtual = { titulo, subtitulo, linhas, total };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        // 🔥 CENTRALIZAÇÃO FORÇADA COM POSITION FIXED
        modal.style.cssText = 'display: flex !important; justify-content: center !important; align-items: center !important; z-index: 10005; background: rgba(0,0,0,0.8); position: fixed; top: 0; left: 0; width: 100%; height: 100vh;';

        modal.innerHTML = `
            <div class="modal-content" style="background: #1a1a1a; color: #ffffff; width: 95%; max-width: 500px; border: 1px solid #333; border-radius: 8px;">
                <div class="modal-header" style="border-bottom: 1px solid #333; padding: 15px; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin: 0; color: #fff;">${titulo}</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                
                <div class="modal-body" style="padding: 15px;">
                    <h5 style="border-bottom: 1px dashed #555; padding-bottom:10px; margin-top:0; color: #ccc;">${subtitulo}</h5>
                    <table style="width: 100%; font-size: 0.9rem; color: #fff;">
                        <thead style="background: #333;"><tr><th align="left" style="padding:5px;">Hora</th><th align="left" style="padding:5px;">Item</th><th align="right" style="padding:5px;">R$</th></tr></thead>
                        <tbody>${linhas}</tbody>
                        ${total !== null ? `<tfoot><tr style="border-top:1px solid #555;"><td colspan="2" style="padding:10px 0; font-weight:bold;">TOTAL:</td><td align="right" style="padding:10px 0; font-weight:bold; color:#4ade80;">R$ ${total.toFixed(2)}</td></tr></tfoot>` : ''}
                    </table>
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

        // HTML limpo para a impressora
        const htmlLimpo = `
            <div style="text-align:center; font-weight:900; font-size: 22px; margin-bottom:5px;">${dados.titulo}</div>
            <div style="text-align:center; font-size: 16px; margin-bottom:15px; color:#000; font-weight:900;">${dados.subtitulo}</div>
            <hr style="border:0; border-top:2px solid #000; margin: 15px 0;">
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
            <div style="text-align:center; margin-top:30px; font-size: 12px; border-top:1px dashed #ccc; padding-top:5px;">Sistema Naxio</div>
        `;

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
                    
                    /* AQUI AUMENTA A FONTE DAS CÉLULAS */
                    body, td, th { font-weight: 900 !important; }
                    td, th { vertical-align: top; text-align: left; padding: 2px 0; color: #000 !important; font-size: 16px; font-weight: 900; }
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
                agrupados[key].qtd += (parseInt(i.qtd) || 1);
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
                const qtd = parseInt(i.qtd, 10) || 1;
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

        const taxa = subtotal * 0.10;
        const total = subtotal + taxa;

        RelatoriosEnterprise.printHtml(`
            <div style="text-align:center; font-weight:bold; font-size:18px;">CONFERÊNCIA MESA ${c.numero}</div>
            <div style="text-align:center; font-size:14px; margin-bottom:10px;">${new Date().toLocaleString('pt-BR')}</div>
            <hr>
            <table style="font-size:16px;">${itensHtml}</table>
            <hr>
            <table style="font-size:16px;">
                <tr><td colspan="2">Subtotal:</td><td class="right">${subtotal.toFixed(2)}</td></tr>
                <tr><td colspan="2">Serviço (10%):</td><td class="right">${taxa.toFixed(2)}</td></tr>
                <tr style="font-weight:bold; font-size:20px;"><td colspan="2">TOTAL:</td><td class="right">${total.toFixed(2)}</td></tr>
            </table>
            <div style="text-align:center; margin-top:20px; font-size:12px;">* Conferência de Mesa - Não Fiscal *</div>
        `);
    },

    // 🔥 NOVO: Exibir XMLs Fiscais (Corrigido para usar xml_arquivo)
    exibirXmlsFiscais: async () => {
        if (!await RelatoriosEnterprise.checkStore()) return;
        const hoje = new Date().toISOString().split('T')[0];
        const dataInicio = await NaxioUI.datePicker('📅 Data Início', 'Selecione a data inicial:', hoje);
        if (!dataInicio) return;
        const dataFim = await NaxioUI.datePicker('📅 Data Fim', 'Selecione a data final:', dataInicio);
        if (!dataFim) return;

        const dI = dataInicio;
        const dF = dataFim;
        const dIBR = new Date(dataInicio).toLocaleDateString('pt-BR');
        const dFBR = new Date(dataFim).toLocaleDateString('pt-BR');

        App.utils.toast("Buscando XMLs...", "info");

        // 🔥 Busca na tabela orders onde há XML salvo (xml_arquivo)
        const { data: notas, error } = await _sb.from('orders')
            .select('id, created_at, numero_nfce, status_sefaz, xml_arquivo')
            .eq('store_id', App.state.storeId)
            .not('xml_arquivo', 'is', null)
            .gte('created_at', `${dI}T00:00:00`)
            .lte('created_at', `${dF}T23:59:59`)
            .order('created_at', { ascending: false });

        if (error || !notas || notas.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhum XML encontrado neste período.', 'info');
            return;
        }

        const linhas = notas.map(n => `
            <tr>
                <td>${new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                <td>NFC-e #${n.numero_nfce || 'S/N'}</td>
                <td align="right">
                    <button class="btn btn-sm btn-info" onclick="RelatoriosEnterprise.baixarXmlIndividual('${n.id}')">💾 XML</button>
                </td>
            </tr>`).join('');

        RelatoriosEnterprise.exibirModal(`📑 XMLs Fiscais`, `${dIBR} a ${dFBR}`, linhas, null);
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

    openStaffModal: () => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10005;';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; background: var(--surface); color: var(--text-color);">
                <div class="modal-header">
                    <h3>👥 Cadastro de Staff</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border: 1px solid #bae6fd;">
                        <h5 style="color: #0284c7; margin-top: 0;">Novo Funcionário</h5>
                        <div class="input-wrapper"><label class="text-xs">Nome</label><input id="staff-name" class="input-field"></div>
                        <div class="input-wrapper"><label class="text-xs">Email (Login)</label><input id="staff-email" type="email" class="input-field"></div>
                        <div class="input-wrapper"><label class="text-xs">Senha</label><input id="staff-pass" type="password" class="input-field"></div>
                        <div style="display:flex; gap:10px;">
                            <div class="input-wrapper" style="flex:1;"><label class="text-xs">Cargo</label><select id="staff-role" class="input-field"><option value="garcom">Garçom</option><option value="cumim">Cumim</option><option value="caixa">Caixa</option></select></div>
                            <div class="input-wrapper" style="flex:1;"><label class="text-xs">Taxa %</label><input id="staff-rate" type="number" class="input-field" value="10"></div>
                        </div>
                        <button class="btn btn-success btn-full" onclick="App.admin.registerStaff(); this.closest('.modal-overlay').remove();">💾 Salvar Funcionário</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
};

// 🎛️ PAINEL CENTRAL DE GESTÃO
const PainelRelatorios = {
    open: async () => {
        const tipoNegocio = App.state.currentStore?.tipo_loja || 'Outros';
        const isRestaurante = tipoNegocio.toLowerCase().includes('restaurante') || tipoNegocio.toLowerCase().includes('bar') || tipoNegocio.toLowerCase().includes('aliment');
        const isAutopecas = tipoNegocio.toLowerCase().includes('auto') || tipoNegocio.toLowerCase().includes('oficina') || tipoNegocio.toLowerCase().includes('peca');

        const check = (mod, func) => `if(typeof ${mod} !== 'undefined') ${func}; else alert('Módulo ${mod} não carregado');`;

        // Pré-calcula métricas de vendas para mostrar no painel
        const sid = App.state.storeId;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        let dayTotal = 0, weekTotal = 0, monthTotal = 0;
        const { data: orders } = await _sb.from('orders')
            .select('created_at, total_pago, products(preco)')
            .eq('store_id', sid)
            .neq('status', 'cancelado')
            .neq('status', 'devolvido');

        if (orders) {
            orders.forEach(o => {
                const val = parseFloat(o.total_pago) || parseFloat(o.products?.preco) || 0;
                if (o.created_at >= startOfDay) dayTotal += val;
                if (o.created_at >= startOfWeek) weekTotal += val;
                if (o.created_at >= startOfMonth) monthTotal += val;
            });
        }

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
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div style="background:var(--background); padding:8px; border-radius:8px; border:1px solid var(--border);">
                        <canvas id="chart-sales-bar"></canvas>
                    </div>
                    <div style="background:var(--background); padding:8px; border-radius:8px; border:1px solid var(--border);">
                        <canvas id="chart-top-products"></canvas>
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
                    <button class="btn btn-secondary" onclick="if(typeof GarcomSystem !== 'undefined') GarcomSystem.gerarRelatorio(); else alert('Garcom.js não carregado');"><i class="ri-pie-chart-2-line"></i> Comissões Garçom</button>
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
            .limit(30);

        if (!cancelados || cancelados.length === 0) {
            return NaxioUI.alert('Sem Cancelamentos', 'Nenhuma venda cancelada ou devolvida.', 'info');
        }

        const lista = cancelados.map(v => {
            const val = parseFloat(v.total_pago || v.total || 0);
            const color = v.status === 'cancelado' ? '#ef4444' : '#f59e0b';
            const desc = v.products?.nome || v.observacao?.substring(0, 30) || 'Venda';
            const dt = new Date(v.created_at).toLocaleString('pt-BR');
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border);">
                    <div>
                        <div style="font-weight:600;">${desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${dt}</div>
                        <div style="font-size:0.75rem; color:#64748b;">${v.observacoes || ''}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:bold; color:${color};">${v.status.toUpperCase()}</div>
                        <div>R$ ${val.toFixed(2)}</div>
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
