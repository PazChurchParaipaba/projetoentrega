// ========================================================================
// 📅 SISTEMA DE RESERVAS DE PRATOS
// Gerencia reservas de pratos para almoço (09:00 - 11:30)
// ========================================================================

const ReservasPratosSystem = {

    // Abre o painel de reservas de pratos
    abrirPainel: async () => {
        if (!App.state.storeId) {
            await NaxioUI.alert('❌ Erro', 'Loja não identificada.', 'error');
            return;
        }

        await ReservasPratosSystem.carregarReservas();
    },

    // Carrega reservas do dia
    carregarReservas: async () => {
        const hoje = new Date().toISOString().split('T')[0];

        NaxioUI.showLoading('Carregando reservas...');

        const { data: reservas, error } = await _sb
            .from('reservas_pratos')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('data_reserva', hoje)
            .order('mesa_numero', { ascending: true })
            .order('created_at', { ascending: true });

        NaxioUI.hideLoading();

        if (error) {
            await NaxioUI.alert('❌ Erro', error.message, 'error');
            return;
        }

        ReservasPratosSystem.renderizarPainel(reservas || []);
    },

    // Renderiza o painel
    renderizarPainel: (reservas) => {
        const modal = document.createElement('div');
        modal.className = 'naxio-modal-overlay';
        modal.id = 'modal-reservas-pratos';

        // Agrupa por mesa
        const porMesa = {};
        reservas.forEach(r => {
            const mesa = r.mesa_numero || 'Sem Mesa';
            if (!porMesa[mesa]) porMesa[mesa] = [];
            porMesa[mesa].push(r);
        });

        const mesasHtml = Object.entries(porMesa).map(([mesa, items]) => {
            const totalMesa = items.reduce((sum, i) => sum + (i.quantidade * i.preco_unitario), 0);
            const statusCores = {
                'pendente': '#f59e0b',
                'preparando': '#3b82f6',
                'pronto': '#10b981',
                'entregue': '#6b7280',
                'cancelado': '#ef4444'
            };

            const itemsHtml = items.map(item => `
                <div style="background: var(--background); padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ${statusCores[item.status]};">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-main);">${item.quantidade}x ${item.produto_nome}</div>
                            ${item.observacoes ? `<div style="font-size: 0.85rem; color: #f59e0b; margin-top: 4px;">📝 ${item.observacoes}</div>` : ''}
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                                👤 ${item.garcom_nome} • ${new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: 600; color: var(--primary);">R$ ${(item.quantidade * item.preco_unitario).toFixed(2)}</div>
                            <select onchange="ReservasPratosSystem.mudarStatus('${item.id}', this.value)" 
                                    style="margin-top: 6px; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: var(--surface); color: var(--text-main); border: 1px solid var(--border);">
                                <option value="pendente" ${item.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
                                <option value="preparando" ${item.status === 'preparando' ? 'selected' : ''}>🔥 Preparando</option>
                                <option value="pronto" ${item.status === 'pronto' ? 'selected' : ''}>✅ Pronto</option>
                                <option value="entregue" ${item.status === 'entregue' ? 'selected' : ''}>🍽️ Entregue</option>
                                <option value="cancelado" ${item.status === 'cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                            </select>
                        </div>
                    </div>
                </div>
            `).join('');

            return `
                <div style="background: var(--surface); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid var(--border);">
                        <h4 style="margin: 0; color: var(--primary);">🪑 Mesa ${mesa}</h4>
                        <div style="font-weight: 600; color: var(--success);">Total: R$ ${totalMesa.toFixed(2)}</div>
                    </div>
                    ${itemsHtml}
                </div>
            `;
        }).join('');

        const totalGeral = reservas.reduce((sum, r) => sum + (r.quantidade * r.preco_unitario), 0);

        modal.innerHTML = `
            <div class="naxio-modal-container" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div style="position: sticky; top: 0; background: var(--surface); z-index: 10; padding: 20px; border-bottom: 2px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h2 style="margin: 0; color: var(--text-main);">📅 Reservas de Pratos</h2>
                            <p style="margin: 5px 0 0 0; color: var(--text-muted); font-size: 0.9rem;">
                                ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <button onclick="document.getElementById('modal-reservas-pratos').remove()" 
                                style="background: var(--surface); border: 2px solid var(--border); color: var(--text-main); width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">
                            ✕
                        </button>
                    </div>
                </div>

                <div style="padding: 20px;">
                    ${reservas.length > 0 ? mesasHtml : `
                        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                            <i class="ri-restaurant-line" style="font-size: 4rem; opacity: 0.3;"></i>
                            <p style="margin-top: 15px; font-size: 1.1rem;">Nenhuma reserva de prato para hoje</p>
                            <p style="font-size: 0.9rem;">Reservas são feitas entre 09:00 e 11:30</p>
                        </div>
                    `}
                </div>

                ${reservas.length > 0 ? `
                    <div style="position: sticky; bottom: 0; background: var(--surface); padding: 20px; border-top: 2px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.9rem; color: var(--text-muted);">Total de Reservas</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">R$ ${totalGeral.toFixed(2)}</div>
                        </div>
                        <button onclick="ReservasPratosSystem.imprimirResumo()" class="naxio-btn naxio-btn-primary">
                            🖨️ Imprimir Resumo
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
    },

    // Muda o status de uma reserva
    mudarStatus: async (reservaId, novoStatus) => {
        NaxioUI.showLoading('Atualizando...');

        const { error } = await _sb
            .from('reservas_pratos')
            .update({ status: novoStatus })
            .eq('id', reservaId);

        NaxioUI.hideLoading();

        if (error) {
            await NaxioUI.alert('❌ Erro', error.message, 'error');
        } else {
            App.utils.toast(`Status atualizado para: ${novoStatus}`, 'success');
        }
    },

    // Imprime resumo das reservas
    imprimirResumo: async () => {
        const hoje = new Date().toISOString().split('T')[0];

        const { data: reservas } = await _sb
            .from('reservas_pratos')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('data_reserva', hoje)
            .neq('status', 'cancelado')
            .order('mesa_numero', { ascending: true });

        if (!reservas || reservas.length === 0) {
            await NaxioUI.alert('ℹ️ Sem Dados', 'Nenhuma reserva para imprimir.', 'info');
            return;
        }

        // Agrupa por mesa
        const porMesa = {};
        reservas.forEach(r => {
            const mesa = r.mesa_numero || 'Sem Mesa';
            if (!porMesa[mesa]) porMesa[mesa] = [];
            porMesa[mesa].push(r);
        });

        let html = `
            <div style="text-align:center; font-weight:bold; font-size:20px; margin-bottom:10px;">📅 RESERVAS DE PRATOS</div>
            <div style="text-align:center; font-size:14px; margin-bottom:15px;">${new Date().toLocaleDateString('pt-BR')}</div>
            <hr style="border:0; border-top:2px solid #000; margin:15px 0;">
        `;

        Object.entries(porMesa).forEach(([mesa, items]) => {
            html += `<div style="font-weight:bold; font-size:18px; margin-top:15px; margin-bottom:10px;">MESA ${mesa}</div>`;

            items.forEach(item => {
                html += `
                    <table style="width:100%; margin-bottom:8px; font-size:14px;">
                        <tr>
                            <td style="width:60%;">${item.quantidade}x ${item.produto_nome}</td>
                            <td style="text-align:right; width:40%;">R$ ${(item.quantidade * item.preco_unitario).toFixed(2)}</td>
                        </tr>
                        ${item.observacoes ? `<tr><td colspan="2" style="font-size:12px; color:#666;">Obs: ${item.observacoes}</td></tr>` : ''}
                        <tr><td colspan="2" style="font-size:11px; color:#999;">Garçom: ${item.garcom_nome}</td></tr>
                    </table>
                `;
            });
        });

        const total = reservas.reduce((sum, r) => sum + (r.quantidade * r.preco_unitario), 0);
        html += `
            <hr style="border:0; border-top:2px solid #000; margin:15px 0;">
            <table style="width:100%; font-size:18px; font-weight:bold;">
                <tr>
                    <td>TOTAL:</td>
                    <td style="text-align:right;">R$ ${total.toFixed(2)}</td>
                </tr>
            </table>
            <div style="text-align:center; margin-top:20px; font-size:12px;">Sistema Naxio</div>
        `;

        // Usa o sistema de impressão do RelatoriosEnterprise
        if (typeof RelatoriosEnterprise !== 'undefined' && RelatoriosEnterprise.printHtml) {
            RelatoriosEnterprise.printHtml(html);
        } else {
            // Fallback
            const printWin = window.open('', '', 'width=800,height=600');
            printWin.document.write(`<html><head><title>Reservas</title></head><body>${html}</body></html>`);
            printWin.document.close();
            printWin.print();
        }
    }
};

// Exporta para uso global
window.ReservasPratosSystem = ReservasPratosSystem;

console.log('📅 Sistema de Reservas de Pratos carregado!');
