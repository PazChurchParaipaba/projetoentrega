const fs = require('fs');
const path = 'js/comandas.js';

try {
    let content = fs.readFileSync(path, 'utf8');

    // 1. Fix duplicate comment in transferirMesa
    // It looks like:
    //     // 🔥 NOVA FUNÇÃO: TRANSFERIR MESA
    //     // 🔥 NOVA FUNÇÃO: TRANSFERIR MESA
    //     transferirMesa: async () => {
    content = content.replace(
        /(\s*\/\/ 🔥 NOVA FUNÇÃO: TRANSFERIR MESA[\r\n]+){2}/,
        '\n    // 🔥 NOVA FUNÇÃO: TRANSFERIR MESA\n'
    );

    // 2. Restore abrirModalTransferenciaItens
    // We look for the disabled version
    const disabledTransfer = `    // 🔥 TRANSFERÊNCIA DE ITENS (PARCIAL)
    // Transferência de Itens removida por solicitação
    abrirModalTransferenciaItens: () => {
        alert("Função desabilitada.");
    },

    toggleTransferItem: () => { },`;

    const originalTransfer = `    // 🔥 TRANSFERÊNCIA DE ITENS (PARCIAL)
    abrirModalTransferenciaItens: () => {
        const items = App.state.currentComandaItems || [];
        if (items.length === 0) return alert("Nenhum item para transferir.");

        window.transferSelection = []; // Reset seleção

        const itemsHtml = items.map((item, index) => {
            var obsHtml = item.observacao ? '<div style="font-size:0.8rem; color:#94a3b8;">' + item.observacao + '</div>' : '';
            return '<div onclick="App.store.toggleTransferItem(' + index + ', this)" ' +
                'style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #334155; cursor:pointer; transition:0.2s;" ' +
                'id="trans-item-' + index + '">' +
                '<div style="display:flex; gap:10px; align-items:center;">' +
                '<div class="check-circle" style="width:20px; height:20px; border-radius:50%; border:2px solid #64748b;"></div>' +
                '<div>' +
                '<strong>' + item.qtd + 'x ' + item.nome + '</strong>' +
                obsHtml +
                '</div>' +
                '</div>' +
                '<div style="font-weight:bold;">R$ ' + (item.price * item.qtd).toFixed(2) + '</div>' +
                '</div>';
        }).join('');

        const modalHtml =
            '<div id="modal-transferencia-itens" class="modal-overlay" style="display:flex; z-index:9600; align-items:center; justify-content:center;">' +
            '<div class="modal-content" style="width:90%; max-width:500px; background:#1e293b; color:#fff; display:flex; flex-direction:column; max-height:80vh;">' +
            '<div class="modal-header">' +
            '<h3>🔄 Transferir Itens Selecionados</h3>' +
            '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\\'modal-transferencia-itens\\').remove()">Fechar</button>' +
            '</div>' +
            '<div class="modal-body" style="overflow-y:auto; padding:0;">' +
            '<div style="background:#0f172a; padding:10px; text-align:center; color:#94a3b8; font-size:0.9rem;">' +
            'Toque nos itens que deseja mover para outra mesa' +
            '</div>' +
            itemsHtml +
            '</div>' +
            '<div class="modal-footer" style="display:flex; flex-direction:column; gap:10px;">' +
            '<input type="number" id="trans-mesa-destino" class="input-field" placeholder="Número da Mesa Destino" style="text-align:center; font-size:1.2rem;">' +
            '<button class="btn btn-primary btn-full" onclick="App.store.confirmarTransferenciaItens()">' +
            'CONFIRMAR TRANSFERÊNCIA' +
            '</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<style>' +
            '.selected-trans .check-circle { background: #3b82f6; border-color: #3b82f6 !important; }' +
            '.selected-trans { background: #1e3a8a !important; }' +
            '</style>';

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    toggleTransferItem: (index, el) => {
        el.classList.toggle('selected-trans');
        const idx = window.transferSelection.indexOf(index);
        if (idx > -1) window.transferSelection.splice(idx, 1);
        else window.transferSelection.push(index);
    },`;

    // Try to replace strict first, if fails try loose
    if (content.includes('alert("Função desabilitada.");')) {
        // We can't match exact indentation easily, so let's locate the alert and replace the whole function block if possible.
        // Or better, just replace the exact known string 
        const pattern = /\/\/ 🔥 TRANSFERÊNCIA DE ITENS \(PARCIAL\)[\s\S]*?toggleTransferItem: \(\) => \{ \},/m;
        content = content.replace(pattern, originalTransfer);
    }

    // 3. Remove Garbage in App.store.reports
    // Locate the good end of openDashboard
    const goodEnd = 'alert("Módulo de Relatórios (PainelRelatorios) não encontrado.");\n        }\n    },';
    const garbageStart = `    '<div class="modal-content" style="width:95%;`;

    // We want to keep up to goodEnd, and then see if garbage follows.
    // The current file has:
    // ...
    // alert(...);
    //     }
    // },
    // }; <--- This might differ in indentation
    // '<div class="modal-content"...

    // Let's find index of 'openDashboard'
    const openDashIndex = content.indexOf('openDashboard: async');
    if (openDashIndex !== -1) {
        // Find the alert
        const alertIndex = content.indexOf('alert("Módulo de Relatórios (PainelRelatorios) não encontrado.");', openDashIndex);
        if (alertIndex !== -1) {
            // Find the closing brace of openDashboard
            const closeDash = content.indexOf('},', alertIndex); // roughly
            if (closeDash !== -1) {
                // Now look for the garbage end.
                // Garbage ends with 'exportCSV: ... } };'
                // Or simpler: garbage ends before 'if (!window.metricsInitialized)'
                const metricsInit = content.indexOf('if (!window.metricsInitialized)');

                if (metricsInit !== -1) {
                    // Cut everything between closeDash + 2 and metricsInit
                    // But we need to ensure we leave one closing brace for App.store.reports
                    const before = content.substring(0, closeDash + 2); // includes },
                    const after = content.substring(metricsInit);

                    // We need to add '};' after the function close if it's missing or if we cut it
                    // The App.store.reports object needs to be closed.
                    // openDashboard is the only key now? Yes.
                    // So: App.store.reports = { openDashboard... },
                    // So we need `\n};`

                    content = before + '\n};\n\n' + after;
                    console.log("Garbage removed successfully.");
                }
            }
        }
    }

    fs.writeFileSync(path, content, 'utf8');
    console.log("Fix applied to " + path);

} catch (e) {
    console.error("Error fixing file:", e);
}
