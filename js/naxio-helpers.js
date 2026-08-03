// ========================================================================
// 🔄 HELPER PARA MIGRAÇÃO - COMPATIBILIDADE COM CÓDIGO ANTIGO
// ========================================================================
// Este arquivo fornece wrappers para garantir compatibilidade enquanto
// migramos gradualmente para o NaxioUI

// Sobrescreve alert nativo (opcional - descomente para forçar uso do NaxioUI)
window.alert = async function (message) {
    return await NaxioUI.alert('Atenção', message, 'info');
};

// Sobrescreve confirm nativo (opcional - descomente para forçar uso do NaxioUI)
window.confirm = async function (message) {
    return await NaxioUI.confirm('Confirmação', message);
};

// Sobrescreve prompt nativo (opcional - descomente para forçar uso do NaxioUI)
window.prompt = async function (message, defaultValue = '') {
    return await NaxioUI.prompt('Entrada', message, defaultValue);
};

// ========================================================================
// 🎯 HELPERS ESPECÍFICOS DO NAXIO
// ========================================================================

const NaxioHelpers = {
    // Confirmação de exclusão
    confirmDelete: async (itemName = 'este item') => {
        return await NaxioUI.confirm(
            '🗑️ Excluir Item',
            `Tem certeza que deseja excluir ${itemName}? Esta ação não pode ser desfeita.`,
            'Sim, Excluir',
            'Cancelar'
        );
    },

    // Confirmação de cancelamento
    confirmCancel: async (action = 'esta operação') => {
        return await NaxioUI.confirm(
            '❌ Cancelar',
            `Deseja realmente cancelar ${action}?`,
            'Sim, Cancelar',
            'Não'
        );
    },

    // Erro genérico
    showError: async (message, title = '❌ Erro') => {
        await NaxioUI.alert(title, message, 'error');
    },

    // Sucesso genérico
    showSuccess: async (message, title = '✅ Sucesso') => {
        await NaxioUI.alert(title, message, 'success');
    },

    // Aviso genérico
    showWarning: async (message, title = '⚠️ Atenção') => {
        await NaxioUI.alert(title, message, 'warning');
    },

    // Info genérica
    showInfo: async (message, title = 'ℹ️ Informação') => {
        await NaxioUI.alert(title, message, 'info');
    },

    // Pedir número de comanda
    askComandaNumber: async () => {
        return await NaxioUI.prompt(
            '🔢 Número da Comanda',
            'Digite o número da comanda:',
            '',
            'Ex: 5',
            'number'
        );
    },

    // Pedir número de mesa
    askMesaNumber: async () => {
        return await NaxioUI.prompt(
            '🪑 Número da Mesa',
            'Digite o número da mesa:',
            '',
            'Ex: 10',
            'number'
        );
    },

    // Pedir senha/PIN
    askPassword: async (title = '🔒 Senha Necessária') => {
        return await NaxioUI.prompt(
            title,
            'Digite a senha de autorização:',
            '',
            '••••',
            'password'
        );
    },

    // Pedir motivo de cancelamento
    askCancelReason: async () => {
        return await NaxioUI.textarea(
            '📝 Motivo do Cancelamento',
            'Descreva o motivo do cancelamento (mínimo 10 caracteres):',
            '',
            'Digite aqui...',
            10
        );
    },

    // Escolher forma de pagamento
    selectPaymentMethod: async () => {
        return await NaxioUI.select(
            '💳 Forma de Pagamento',
            'Como o cliente deseja pagar?',
            [
                {
                    value: 'dinheiro',
                    label: 'Dinheiro',
                    icon: 'ri-money-dollar-circle-line',
                    description: 'Pagamento em espécie'
                },
                {
                    value: 'pix',
                    label: 'PIX',
                    icon: 'ri-qr-code-line',
                    description: 'Transferência instantânea'
                },
                {
                    value: 'debito',
                    label: 'Cartão de Débito',
                    icon: 'ri-bank-card-line',
                    description: 'Pagamento com cartão'
                },
                {
                    value: 'credito',
                    label: 'Cartão de Crédito',
                    icon: 'ri-bank-card-2-line',
                    description: 'Pagamento parcelado'
                }
            ]
        );
    },

    // Validação de campo vazio
    validateRequired: async (value, fieldName) => {
        if (!value || value.trim() === '') {
            await NaxioHelpers.showWarning(`O campo "${fieldName}" é obrigatório.`);
            return false;
        }
        return true;
    },

    // Validação de número
    validateNumber: async (value, fieldName) => {
        if (isNaN(value) || value <= 0) {
            await NaxioHelpers.showWarning(`O campo "${fieldName}" deve ser um número válido maior que zero.`);
            return false;
        }
        return true;
    },

    // Confirmação com senha
    confirmWithPassword: async (correctPassword, action = 'esta ação') => {
        const password = await NaxioHelpers.askPassword(`🔒 Autorização Necessária`);

        if (!password) return false;

        if (password !== correctPassword) {
            await NaxioHelpers.showError('Senha incorreta!');
            return false;
        }

        return true;
    }
};

// Exporta para uso global
window.NaxioHelpers = NaxioHelpers;

console.log('🔧 Naxio Helpers carregado!');
