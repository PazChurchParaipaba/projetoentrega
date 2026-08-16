// ========================================================================
// ⌨️ SISTEMA DE ATALHOS DE TECLADO - NAXIO
// Melhora a produtividade permitindo operações rápidas via teclado
// ========================================================================

const NaxioKeyboardShortcuts = {
    // Estado
    enabled: true,
    sessionCaixaAtribuido: false, // Flag para perguntar atribuição apenas uma vez por sessão

    // Inicializa o sistema de atalhos
    init: () => {
        document.addEventListener('keydown', NaxioKeyboardShortcuts.handleKeyPress);
        console.log('⌨️ Sistema de Atalhos de Teclado ativado!');
        NaxioKeyboardShortcuts.showHelp();
    },

    // Handler principal de teclas
    handleKeyPress: async (e) => {
        if (!NaxioKeyboardShortcuts.enabled) return;

        const activeElement = document.activeElement;

        // --- SISTEMA INTELIGENTE DE ENTER (TAB + CONFIRMAR) ---
        if (e.key === 'Enter') {
            // Textarea e campos de edição livre: Enter insere quebra de linha normalmente
            if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
                return;
            }

            // -------------------------------------------------------
            // 1. DETERMINA O GRUPO DE CONTEXTO (modal ou painel ativo)
            // -------------------------------------------------------
            // Sobe pelo DOM do elemento ativo buscando o container lógico mais próximo.
            // Isso garante que o Enter nunca pule para inputs de OUTRO painel na mesma tela.
            let contextGroup = null;

            if (activeElement) {
                // closest() sobe pelo DOM — pega o container mais específico e correto
                contextGroup = activeElement.closest('.modal-overlay, .naxio-modal-overlay, .panel-box, form');
            }

            if (!contextGroup) {
                // Não está em nenhum container: usa o modal mais ao topo (se existir)
                const allModals = document.querySelectorAll('.modal-overlay, .naxio-modal-overlay');
                if (allModals.length > 0) {
                    contextGroup = allModals[allModals.length - 1];
                } else {
                    contextGroup = document.body;
                }
            }

            // -------------------------------------------------------
            // 2. LOCALIZA O BOTÃO PRIMÁRIO DO CONTEXTO
            // -------------------------------------------------------
            // Tenta por ordem de prioridade: primary > success > warning > submit > custom
            const findPrimaryBtn = (container) => {
                const candidates = [
                    'button.btn-primary:not([disabled])',
                    'button.naxio-btn-primary:not([disabled])',
                    'button.btn-success:not([disabled])',
                    'button.btn-warning:not([disabled])',
                    'button.naxio-confirm-btn:not([disabled])',
                    'button[type="submit"]:not([disabled])',
                    '#btn-link-crm:not([disabled])',
                    '#btn-confirma-mesa:not([disabled])'
                ];
                for (const sel of candidates) {
                    const btn = container.querySelector(sel);
                    if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) return btn;
                }
                return null;
            };

            const primaryBtn = findPrimaryBtn(contextGroup);

            // -------------------------------------------------------
            // 3. CASE: INPUT OU SELECT COM FOCO
            // -------------------------------------------------------
            const isInputOrSelect = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'SELECT'
            );

            if (isInputOrSelect) {
                // 🔥 EXCEÇÃO DE SEGURANÇA: Não interfere no input de código de barras do PDV
                // Isso permite que o Varejo.handleScan funcione corretamente sem disparar o botão "Finalizar"
                if (activeElement.id === 'pos-barcode') {
                    return;
                }

                e.preventDefault(); // Evita submit padrão de form HTML

                // Lista APENAS inputs/selects visíveis no contexto (sem botões)
                // O botão só é acionado quando o usuário chega no último campo
                const inputSel = 'input:not([disabled]):not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select:not([disabled])';
                const allInputs = Array.from(contextGroup.querySelectorAll(inputSel))
                    .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);

                const currentIdx = allInputs.indexOf(activeElement);

                if (currentIdx > -1 && currentIdx < allInputs.length - 1) {
                    // Ainda tem campos depois: avança como Tab
                    const next = allInputs[currentIdx + 1];
                    next.focus();
                    if (next.tagName === 'INPUT') {
                        setTimeout(() => { try { next.select(); } catch(err) {} }, 0);
                    }
                    return;
                }

                // É o último campo: confirma a ação
                if (primaryBtn) {
                    primaryBtn.click();
                    return;
                }

                // Último recurso: procura em todo o body (modais NaxioUI que usam portais)
                const bodyBtn = findPrimaryBtn(document.body);
                if (bodyBtn) bodyBtn.click();
                return;
            }

            // -------------------------------------------------------
            // 4. CASE: BOTÃO COM FOCO — browser já converte Enter em click
            // -------------------------------------------------------
            if (activeElement && activeElement.tagName === 'BUTTON') {
                // Não interfere — o browser cuida disso nativamente
                return;
            }

            // -------------------------------------------------------
            // 5. CASE: FOCO NO BODY/OVERLAY — confirma o modal visível
            // -------------------------------------------------------
            if (primaryBtn) {
                e.preventDefault();
                primaryBtn.click();
            }
            return;
        }


        // Ignora outros atalhos F5, F6 etc se o usuário estiver digitando em um input
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        )) {
            return;
        }

        // F2 - Finalizar Venda (PDV)
        if (e.key === 'F2') {
            e.preventDefault();
            if (typeof Varejo !== 'undefined' && Varejo.openPaymentModal) {
                Varejo.openPaymentModal();
            }
            return;
        }

        // F4 - Buscar Produto (PDV)
        if (e.key === 'F4') {
            e.preventDefault();
            if (typeof Varejo !== 'undefined' && Varejo.openSearchModal) {
                Varejo.openSearchModal();
            }
            return;
        }

        // F5 - Imprimir Conferência
        if (e.key === 'F5') {
            e.preventDefault();
            await NaxioKeyboardShortcuts.imprimirConferencia();
            return;
        }

        // F6 - Fechar Comanda
        if (e.key === 'F6') {
            e.preventDefault();
            await NaxioKeyboardShortcuts.fecharComanda();
            return;
        }

        // F7 - Lançar Item
        if (e.key === 'F7') {
            e.preventDefault();
            NaxioKeyboardShortcuts.lancarItem();
            return;
        }

        // F8 - Abrir Gestão de Salão
        if (e.key === 'F8') {
            e.preventDefault();
            if (typeof App !== 'undefined' && App.store && App.store.openGestaoSalao) {
                App.store.openGestaoSalao();
            }
            return;
        }

        // F9 - Abrir Caixa
        if (e.key === 'F9') {
            e.preventDefault();
            if (typeof Caixa !== 'undefined' && Caixa.openCaixa) {
                Caixa.openCaixa();
            }
            return;
        }

        // F10 - Central de Gestão
        if (e.key === 'F10') {
            e.preventDefault();
            if (typeof PainelRelatorios !== 'undefined' && PainelRelatorios.open) {
                PainelRelatorios.open();
            }
            return;
        }

        // ESC - Fechar modais
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.naxio-modal-overlay, .modal-overlay');
            if (modals.length > 0) {
                const lastModal = modals[modals.length - 1];
                lastModal.remove();
            }
            return;
        }

        // Ctrl + H - Mostrar ajuda de atalhos
        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            NaxioKeyboardShortcuts.showHelp();
            return;
        }

        // Ctrl + P - Receber rápido no Pix
        if (e.ctrlKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            await NaxioKeyboardShortcuts.receberPixRapido();
            return;
        }
    },

    // Imprimir conferência da comanda
    imprimirConferencia: async () => {
        // Pergunta qual comanda imprimir
        const numeroMesa = await NaxioUI.prompt(
            '🖨️ Imprimir Conferência',
            'Digite o número da mesa/comanda para imprimir:',
            '',
            'Ex: 5',
            'number'
        );

        if (!numeroMesa) return;

        // Busca a comanda (Status deve ser OCUPADA)
        const { data: comanda, error } = await _sb
            .from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', numeroMesa)
            .eq('status', 'ocupada')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !comanda) {
            await NaxioUI.alert('❌ Erro', `Mesa ${numeroMesa} não encontrada ou não está ocupada.`, 'error');
            return;
        }

        // Configura estado global para a impressão
        App.state.currentComanda = comanda.id;
        App.state.currentComandaItems = comanda.items || [];
        App.state.currentMesaNum = comanda.numero;

        // Imprime
        if (typeof App.store !== 'undefined' && App.store.imprimirConferenciaInternal) {
            await App.store.imprimirConferenciaInternal(comanda.id);
        } else if (typeof RelatoriosEnterprise !== 'undefined' && RelatoriosEnterprise.imprimirConferencia) {
            await RelatoriosEnterprise.imprimirConferencia(comanda.id);
        } else {
            await NaxioUI.alert('❌ Erro', 'Módulo de impressão não carregado.', 'error');
        }
    },

    // Fechar comanda
    fecharComanda: async () => {
        // Pergunta qual comanda fechar
        const numeroMesa = await NaxioUI.prompt(
            '💰 Fechar Comanda',
            'Digite o número da mesa/comanda para fechar:',
            '',
            'Ex: 5',
            'number'
        );

        if (!numeroMesa) return;

        // Busca a comanda (Status deve ser OCUPADA)
        const { data: comanda, error } = await _sb
            .from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', numeroMesa)
            .eq('status', 'ocupada')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !comanda) {
            await NaxioUI.alert('❌ Erro', `Mesa ${numeroMesa} não encontrada ou não está ocupada.`, 'error');
            return;
        }

        // Define como comanda atual e carrega para fechamento
        App.state.currentComanda = comanda.id;
        App.state.currentComandaItems = comanda.items || [];
        App.state.currentMesaNum = comanda.numero;
        App.store.fastCheckoutComanda = comanda;

        // 🔥 CALCULANDO VALOR TOTAL (Subtotal + Taxa de Serviço se houver)
        const items = comanda.items || [];
        const subtotal = items.reduce((acc, i) => acc + ((parseFloat(i.price) || 0) * (parseFloat(i.qtd) || 0)), 0);
        const MESAS_BALCAO_ISENTA = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
        const isMesaIsenta = (MESAS_BALCAO_ISENTA.includes(String(comanda.numero)) || comanda.tipo_comanda === 'interna');
        let taxa = 0;
        if (!isMesaIsenta) {
            const subTaxavel = items.reduce((acc, i) => i.isento_10 ? acc : acc + ((parseFloat(i.price) || 0) * (parseFloat(i.qtd) || 0)), 0);
            taxa = subTaxavel * 0.10;
        }
        comanda.calc_total = subtotal + taxa;
        comanda.calc_taxa = taxa;

        if (typeof App.store !== 'undefined' && App.store.abrirFechamentoMesa) {
            await App.store.abrirFechamentoMesa();
        } else {
            await NaxioUI.alert('❌ Erro', 'Função de fechamento não disponível.', 'error');
        }
    },

    // Lançar item na comanda atual
    lancarItem: () => {
        if (!App.state.currentComanda) {
            NaxioUI.alert('ℹ️ Informação', 'Nenhuma comanda selecionada. Abra uma comanda primeiro.', 'info');
            return;
        }

        if (typeof App.store !== 'undefined' && App.store.abrirModalLancarItem) {
            App.store.abrirModalLancarItem();
        } else {
            NaxioUI.alert('❌ Erro', 'Função de lançamento não disponível.', 'error');
        }
    },

    // Receber rápido via PIX (Ctrl+P)
    receberPixRapido: async () => {
        let numeroMesa = App.state.currentMesaNum;
        if (!numeroMesa) {
            numeroMesa = await NaxioUI.prompt(
                '💠 Receber no Pix',
                'Digite o número da mesa/comanda para pagamento rápido Pix:',
                '',
                'Ex: 5',
                'number'
            );
        }

        if (!numeroMesa) return;

        const { data: comanda, error } = await _sb
            .from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', numeroMesa)
            .eq('status', 'ocupada')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error || !comanda) {
            await NaxioUI.alert('❌ Erro', `Mesa ${numeroMesa} não encontrada ou não está ocupada.`, 'error');
            return;
        }

        App.state.currentComanda = comanda.id;
        App.state.currentComandaItems = comanda.items || [];
        App.state.currentMesaNum = comanda.numero;
        App.store.fastCheckoutComanda = comanda;

        // 🔥 CALCULANDO VALOR TOTAL (Subtotal + Taxa de Serviço se houver)
        const items = comanda.items || [];
        const subtotal = items.reduce((acc, i) => acc + ((parseFloat(i.price) || 0) * (parseFloat(i.qtd) || 0)), 0);

        // Regra de Taxa (Padão 10% exceto mesas de balão ou internas)
        const MESAS_BALCAO_ISENTA = ['200', '201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '300', '301', '302', '304', '305', '306', '307', '308'];
        const isMesaIsenta = (MESAS_BALCAO_ISENTA.includes(String(comanda.numero)) || comanda.tipo_comanda === 'interna');
        let taxa = 0;
        if (!isMesaIsenta) {
            const subTaxavel = items.reduce((acc, i) => i.isento_10 ? acc : acc + ((parseFloat(i.price) || 0) * (parseFloat(i.qtd) || 0)), 0);
            taxa = subTaxavel * 0.10;
        }

        const total = subtotal + taxa;
        comanda.calc_total = total; // Garante que o objeto tenha o valor injetado

        const receberTotal = await NaxioUI.confirm(
            '💠 Recebimento Rápido Pix',
            `Valor total da comanda: R$ ${total.toFixed(2)}\n\nDeseja receber o valor total no Pix? (Emitirá NFC-e automaticamente)`
        );

        if (receberTotal) {
            let cpf = await NaxioUI.prompt('📄 CPF na Nota (Opcional)', 'Insira o CPF/CNPJ (ou deixe em branco e aperte OK):', '', 'Apenas números');
            if (cpf === null) return; // Cancelado
            cpf = cpf.replace(/\D/g, '');

            let nsu = await NaxioUI.prompt('💠 Código CV (NSU)', 'Insira o número do CV do comprovante Pix:', '', 'Apenas números/letras');
            if (nsu === null) return; // Cancelado

            let aut = await NaxioUI.prompt('💠 Código TERM (AUT)', 'Insira o número TERM (Autorização) do comprovante:', '', 'Apenas números/letras');
            if (aut === null) return; // Cancelado

            App.utils.toast("Encerrando comanda e emitindo NFC-e...", "info");

            const payments = [{
                method: 'Pix', amount: total, code: '17', val: total, nsu: nsu || '', aut: aut || '', bandeira: '', cnpj: ''
            }];

            await _sb.from('comandas').update({
                status: 'fechada', total_pago: total, payments_info: payments, obs_geral: null, updated_at: new Date().toISOString()
            }).eq('id', comanda.id);

            const guiaStr = comanda.guide_name || (comanda.guides && comanda.guides.name) || null;
            const obsJson = JSON.stringify({
                mesa: comanda.numero, vendedor: App.state.profile?.nome_completo || 'Sistema',
                pagamentos: payments, desconto: 0, guia: guiaStr, itens: comanda.items || []
            });

            const { data: newOrder } = await _sb.from('orders').insert({
                store_id: App.state.storeId, status: 'concluido', origem_venda: 'comanda', total_pago: total, taxa_servico: comanda.calc_taxa || 0,
                observacao: obsJson, session_id: typeof Caixa !== 'undefined' && Caixa.state && Caixa.state.session ? Caixa.state.session.id : null,
                metodo_pagamento: 'Pix', created_at: new Date().toISOString()
            }).select().single();

            if (comanda.items && comanda.items.length > 0) {
                const contagem = {};
                comanda.items.forEach(p => { contagem[p.id] = (contagem[p.id] || 0) + (p.qtd || 1); });
                const itensParaBaixar = Object.keys(contagem).map(prodId => ({ id: prodId, qtd: contagem[prodId] }));
                _sb.rpc('descontar_estoque', { itens: itensParaBaixar });
            }

            App.utils.toast("Pix Recebido com Sucesso!", "success");

            if (typeof App.store !== 'undefined' && App.store.loadComandas) App.store.loadComandas();
            if (typeof Caixa !== 'undefined' && Caixa.calcTotals) Caixa.calcTotals();

            if (newOrder && App.fiscal && App.fiscal.emitirNFCeComanda) {
                const itensParaFiscal = App.store.enriquecerItensComNCM ? await App.store.enriquecerItensComNCM(comanda.items || []) : (comanda.items || []);
                const paymentsParaFiscal = payments.map(p => ({
                    code: p.code, val: p.val, tipo: p.method, metodo: p.method, payment_method: p.method, valor: p.val, amount: p.amount,
                    bandeira: p.bandeira, aut: p.aut, cnpj: p.cnpj, nsu: p.nsu
                }));
                App.fiscal.emitirNFCeComanda(newOrder.id, App.state.storeId, itensParaFiscal, paymentsParaFiscal, cpf || null, null, { discount: 0 });
            }
        } else {
            // Cancelado (misto / dividir) -> Lança pro caixa normal e ativa autoNFCe
            App.state.autoNfceQuandoCheio = true;
            if (typeof App.store !== 'undefined' && App.store.abrirFechamentoMesa) {
                await App.store.abrirFechamentoMesa();
                App.utils.toast("Lançamento misto habilitado. A nota será emitida automaticamente quando o valor for concluído.", "info");
            }
        }
    },

    // Mostrar ajuda de atalhos
    showHelp: () => {
        const helpText = `
            <div style="text-align: left; line-height: 1.8;">
                <h4 style="margin-top: 0; color: var(--primary);">⌨️ Atalhos de Teclado</h4>
                <table style="width: 100%; font-size: 0.9rem;">
                    <tr><td><strong>F5</strong></td><td>Imprimir Conferência</td></tr>
                    <tr><td><strong>F6</strong></td><td>Fechar Comanda</td></tr>
                    <tr><td><strong>F7</strong></td><td>Lançar Item</td></tr>
                    <tr><td><strong>F8</strong></td><td>Gestão de Salão</td></tr>
                    <tr><td><strong>F9</strong></td><td>Abrir Caixa</td></tr>
                    <tr><td><strong>F10</strong></td><td>Central de Gestão</td></tr>
                    <tr><td><strong>ESC</strong></td><td>Fechar Modal</td></tr>
                    <tr><td><strong>Ctrl + H</strong></td><td>Mostrar esta ajuda</td></tr>
                </table>
                <p style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
                    💡 Dica: Use os atalhos para trabalhar mais rápido!
                </p>
            </div>
        `;

        console.log('⌨️ Atalhos disponíveis - Pressione Ctrl+H para ver a lista completa');
    },

    // Desabilita atalhos temporariamente
    disable: () => {
        NaxioKeyboardShortcuts.enabled = false;
    },

    // Habilita atalhos
    enable: () => {
        NaxioKeyboardShortcuts.enabled = true;
    }
};

// Exporta para uso global
window.NaxioKeyboardShortcuts = NaxioKeyboardShortcuts;

// Inicializa automaticamente quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => NaxioKeyboardShortcuts.init(), 1000);
    });
} else {
    setTimeout(() => NaxioKeyboardShortcuts.init(), 1000);
}

console.log('⌨️ Sistema de Atalhos de Teclado carregado!');
