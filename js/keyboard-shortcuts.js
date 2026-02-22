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

        // Ignora se estiver digitando em um input/textarea
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        )) {
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
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            NaxioKeyboardShortcuts.showHelp();
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
            .single();

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
            .single();

        if (error || !comanda) {
            await NaxioUI.alert('❌ Erro', `Mesa ${numeroMesa} não encontrada ou não está ocupada.`, 'error');
            return;
        }

        // Define como comanda atual e carrega para fechamento
        App.state.currentComanda = comanda.id;
        App.state.currentComandaItems = comanda.items || [];
        App.state.currentMesaNum = comanda.numero;
        App.store.fastCheckoutComanda = comanda; // 🔥 CRÍTICO: Necessário para abrirFechamentoMesa

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
