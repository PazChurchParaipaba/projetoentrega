// 🎯 SISTEMA COMPLETO DE GUIAS E COMISSÕES
// Versão: 3.1 Enterprise (Correção: Listagem de Mesas Específicas)

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
                        <h5 style="color: #0284c7; margin-top: 0;">➕ Novo Guia</h5>
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
                            <button class="btn btn-success" style="width: 100%;" onclick="GuiasSystem.salvarGuia()">💾 Salvar</button>
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

        const nome = document.getElementById('guia-nome').value.trim();
        const email = document.getElementById('guia-email').value.trim();
        const cpf = document.getElementById('guia-cpf').value.trim();
        const telefone = document.getElementById('guia-telefone').value.trim();
        const comissao = parseFloat(document.getElementById('guia-comissao').value) || 10;

        if (!nome) return alert("Nome é obrigatório!");

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
            document.getElementById('guia-nome').value = '';
            GuiasSystem.carregarLista();
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
                    <button class="btn btn-sm btn-secondary" onclick="GuiasSystem.toggleStatus('${g.id}', '${g.status}')">
                        ${g.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="GuiasSystem.deletar('${g.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
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

    selecionarGuiaParaComanda: async (comandaId, numeroMesa) => {
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
            modal.style.cssText = 'display: flex; z-index: 10002;';

            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>🎯 Mesa ${numeroMesa} - Selecionar Guia</h3>
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
            await _sb.from('comandas').update({ guide_id: guiaId }).eq('id', comandaId);
            App.utils.toast(`✅ Guia "${guiaNome}" atribuído`, "success");
        }
        document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
        if (typeof App.waiter !== 'undefined' && App.waiter.openComanda) {
            setTimeout(() => App.waiter.openComanda(comandaId, ''), 300);
        }
    },

    // =========================================================================
    // 📊 3. RELATÓRIOS E IMPRESSÃO (MODIFICADO: LISTA DE MESAS)
    // =========================================================================

    gerarRelatorio: async () => {
        const dataInicio = prompt("Data Início (DD/MM/AAAA):", new Date().toLocaleDateString('pt-BR'));
        const dataFim = prompt("Data Fim (DD/MM/AAAA):", new Date().toLocaleDateString('pt-BR'));

        if (!dataInicio || !dataFim) return;

        const iso = (d) => { const p = d.split('/'); return `${p[2]}-${p[1]}-${p[0]}`; };
        const dI = iso(dataInicio);
        const dF = iso(dataFim);

        // 🔥 CORREÇÃO: Adicionado 'numero' na query
        const { data: comandas, error } = await _sb.from('comandas')
            .select('total_pago, guide_id, numero, guides(name, commission_percentage)')
            .eq('store_id', App.state.storeId)
            .eq('status', 'fechada')
            .gte('updated_at', `${dI}T00:00:00`)
            .lte('updated_at', `${dF}T23:59:59`);

        if (error) return alert("Erro ao buscar dados: " + error.message);
        if (!comandas || comandas.length === 0) return alert("Nenhuma venda com guia neste período.");

        const relatorio = {};
        comandas.forEach(c => {
            if (!c.guide_id || !c.guides) return;
            const guiaId = c.guide_id;
            const pct = parseFloat(c.guides.commission_percentage) || 10;
            const totalVenda = parseFloat(c.total_pago) || 0;

            if (!relatorio[guiaId]) {
                // 🔥 CORREÇÃO: Array 'mesas' no lugar de 'qtd'
                relatorio[guiaId] = { nome: c.guides.name, vendas: 0, comissao: 0, mesas: [], pct: pct };
            }
            relatorio[guiaId].vendas += totalVenda;
            relatorio[guiaId].comissao += totalVenda * (pct / 100);

            // Adiciona a mesa à lista
            relatorio[guiaId].mesas.push(c.numero);
        });

        GuiasSystem.exibirRelatorio(relatorio, dataInicio, dataFim);
    },

    // Exibe o modal na tela e prepara a impressão via Iframe
    exibirRelatorio: (dados, inicio, fim) => {
        const totalComissao = Object.values(dados).reduce((acc, g) => acc + g.comissao, 0);

        // HTML para a TELA (Com Cores do Sistema e Lista de Mesas)
        const linhasTela = Object.values(dados).map(g => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px;">${g.nome}</td>
                <td align="center" style="font-size:0.8rem; word-break:break-word; max-width:150px;">
                    ${g.mesas.join(', ')}
                </td>
                <td align="right">R$ ${g.vendas.toFixed(2)}</td>
                <td align="center">${g.pct}%</td>
                <td align="right" style="font-weight:bold; color:#10b981;">R$ ${g.comissao.toFixed(2)}</td>
            </tr>
        `).join('');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; z-index: 10001;';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--surface); color: var(--text-color); max-width: 800px; width: 100%;">
                <div class="modal-header">
                    <h3>👔 Comissões (${inicio} - ${fim})</h3>
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
                </div>
                
                <div class="modal-body">
                    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                        <thead>
                            <tr style="background:#1e293b; color:#fff;">
                                <th align="left" style="padding:12px;">Guia</th>
                                <th style="padding:12px;">Mesas</th>
                                <th align="right" style="padding:12px;">Vendas</th>
                                <th style="padding:12px;">%</th>
                                <th align="right" style="padding:12px;">Comissão</th>
                            </tr>
                        </thead>
                        <tbody>${linhasTela}</tbody>
                        <tfoot>
                            <tr style="border-top:2px solid #ccc; background: #f8fafc;">
                                <td colspan="4" align="right" style="font-weight:bold; padding:15px; font-size:1.1rem; color:#000;">TOTAL A PAGAR:</td>
                                <td align="right" style="font-weight:bold; padding:15px; color:#10b981; font-size:1.2rem;">R$ ${totalComissao.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="modal-footer" style="margin-top:20px;">
                    <button class="btn btn-primary btn-full" id="btn-print-force">🖨️ Imprimir Cupom Térmico</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // AÇÃO DO BOTÃO IMPRIMIR
        document.getElementById('btn-print-force').onclick = () => {
            // Gera o HTML do Cupom (Preto e Branco) com as Mesas
            const linhasCupom = Object.values(dados).map(g => `
                <div class="item">
                    <div class="bold">${g.nome.toUpperCase()}</div>
                    
                    <div style="font-size:10px; margin-bottom:2px;">
                        Mesas: ${g.mesas.join(', ')}
                    </div>

                    <div class="flex">
                        <span>Taxa: ${g.pct}%</span>
                        <span>Venda: R$ ${g.vendas.toFixed(2)}</span>
                    </div>
                    <div class="flex" style="margin-top:2px;">
                        <span></span>
                        <span class="bold">Comissao: R$ ${g.comissao.toFixed(2)}</span>
                    </div>
                </div>
                <div class="dashed"></div>
            `).join('');

            const conteudoImpressao = `
                <html>
                <head>
                    <title>Relatório Guias</title>
                    <style>
                        @page { margin: 0; size: auto; }
                        body {
                            margin: 0;
                            padding: 5px;
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            color: #000;
                            background: var(--surface);
                            width: 300px; /* Largura padrão 80mm */
                        }
                        .header { text-align: center; margin-bottom: 10px; }
                        .dashed { border-top: 1px dashed #000; margin: 5px 0; }
                        .flex { display: flex; justify-content: space-between; }
                        .bold { font-weight: bold; }
                        .item { margin-bottom: 5px; }
                        .total-row { font-size: 16px; margin-top: 10px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h3 style="margin:0;">RELATORIO COMISSOES</h3>
                        <div>${inicio} ate ${fim}</div>
                        <div style="font-size:10px;">${new Date().toLocaleString()}</div>
                    </div>
                    <div class="dashed"></div>
                    
                    ${linhasCupom}
                    
                    <div class="flex total-row bold">
                        <span>TOTAL GERAL:</span>
                        <span>R$ ${totalComissao.toFixed(2)}</span>
                    </div>
                    
                    <br><br>
                    <div style="text-align:center; border-top:1px solid #000; padding-top:5px; width: 80%; margin: 0 auto;">
                        Assinatura Responsavel
                    </div>
                    <br>
                    <div style="text-align:center;">.</div>
                </body>
                </html>
            `;

            // Manda imprimir via Iframe (Solução da Tela Branca)
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

console.log("✅ Sistema de Guias (Versão Iframe + Mesas) Carregado");
