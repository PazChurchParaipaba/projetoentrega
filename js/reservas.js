// Sistema de Reservas - Naxio
// Gerencia reservas de almoço/jantar com lista temporária do dia

const ReservasSystem = {
    state: {
        reservasDia: [],
        currentDate: new Date().toISOString().slice(0, 10)
    },

    // Inicializa o sistema de reservas
    init: async () => {
        console.log("🍽️ Sistema de Reservas Inicializado");
        await ReservasSystem.loadReservasDia();
    },

    // Carrega reservas do dia atual
    loadReservasDia: async () => {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data, error } = await _sb
            .from('reservas_dia')
            .select('*, profiles(nome_completo, whatsapp)')
            .eq('store_id', App.state.storeId)
            .eq('data_reserva', hoje)
            .eq('status', 'pendente')
            .order('horario_reserva');

        if (error) {
            console.error("Erro ao carregar reservas:", error);
            return;
        }

        ReservasSystem.state.reservasDia = data || [];
        console.log(`📋 ${data?.length || 0} reservas para hoje`);
    },

    // Cria uma nova reserva
    criarReserva: async (clienteId, items, horarioReserva, observacoes = '') => {
        const hoje = new Date().toISOString().slice(0, 10);

        const reserva = {
            store_id: App.state.storeId,
            cliente_id: clienteId,
            data_reserva: hoje,
            horario_reserva: horarioReserva,
            items: items, // Array de itens do pedido
            observacoes: observacoes,
            status: 'pendente',
            comanda_id: null, // Será preenchido quando o cliente chegar
            created_at: new Date().toISOString()
        };

        const { data, error } = await _sb
            .from('reservas_dia')
            .insert(reserva)
            .select()
            .single();

        if (error) {
            App.utils.toast("Erro ao criar reserva: " + error.message, "error");
            return null;
        }

        App.utils.toast("✅ Reserva criada com sucesso!", "success");
        await ReservasSystem.loadReservasDia();
        return data;
    },

    // Abre modal para visualizar reservas do dia
    abrirPainelReservas: async () => {
        await ReservasSystem.loadReservasDia();

        const modalHtml = `
        <div id="modal-reservas-dia" class="modal-overlay" style="display:flex; z-index:9999;">
            <div class="modal-content" style="max-width:800px; background:#1e293b; color:#fff;">
                <div class="modal-header" style="background:#0f172a; border-bottom:1px solid #334155;">
                    <h3 style="color:#fff;">📅 Reservas de Hoje</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modal-reservas-dia').remove()">Fechar</button>
                </div>
                <div class="modal-body" style="background:#1e293b; color:#fff;">
                    <div id="lista-reservas-dia"></div>
                </div>
            </div>
        </div>`;

        const old = document.getElementById('modal-reservas-dia');
        if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        ReservasSystem.renderReservas();
    },

    // Renderiza lista de reservas
    renderReservas: () => {
        const container = document.getElementById('lista-reservas-dia');
        if (!container) return;

        if (ReservasSystem.state.reservasDia.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i class="ri-calendar-line" style="font-size:3rem;"></i>
                    <p>Nenhuma reserva para hoje</p>
                </div>`;
            return;
        }

        const html = ReservasSystem.state.reservasDia.map(reserva => {
            const itemsHtml = reserva.items.map(item =>
                `<div style="font-size:0.85rem; color:#cbd5e1;">• ${item.qtd}x ${item.nome}</div>`
            ).join('');

            return `
                <div class="card" style="margin-bottom:15px; border-left:4px solid var(--warning); background:#0f172a; border:1px solid #334155;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                        <div>
                            <strong style="font-size:1.1rem; color:#fff;">${reserva.profiles?.nome_completo || 'Cliente'}</strong>
                            <div style="font-size:0.85rem; color:#94a3b8;">
                                📞 ${reserva.profiles?.whatsapp || 'Sem telefone'}
                            </div>
                            <div style="font-size:0.9rem; margin-top:5px; color:#cbd5e1;">
                                🕐 Horário: <strong>${reserva.horario_reserva}</strong>
                            </div>
                        </div>
                        <span class="badge" style="background:var(--warning); color:#000;">Reserva</span>
                    </div>
                    
                    <div style="background:#1e293b; padding:10px; border-radius:6px; margin-bottom:10px; border:1px solid #334155;">
                        <strong style="font-size:0.9rem; color:#94a3b8;">Pedido:</strong>
                        ${itemsHtml}
                    </div>

                    ${reserva.observacoes ? `
                        <div style="background:#431407; padding:8px; border-radius:6px; margin-bottom:10px; border:1px solid #7c2d12;">
                            <strong style="font-size:0.85rem; color:#fbbf24;">Obs:</strong>
                            <div style="font-size:0.85rem; color:#fef3c7;">${reserva.observacoes}</div>
                        </div>
                    ` : ''}

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <button class="btn btn-success btn-sm" onclick="ReservasSystem.vincularComanda('${reserva.id}')">
                            ✅ Cliente Chegou
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="ReservasSystem.enviarParaCozinha('${reserva.id}')">
                            🍳 Enviar p/ Cozinha
                        </button>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = html;
    },

    // Vincula reserva a uma comanda real
    vincularComanda: async (reservaId) => {
        const numComanda = await NaxioUI.prompt(
            '🔗 Vincular Reserva',
            'Digite o número da COMANDA REAL que o garçom criou:',
            '',
            'Ex: 5'
        );

        if (!numComanda) return;

        NaxioUI.showLoading('Vinculando reserva...');

        // Busca a comanda
        const { data: comanda } = await _sb
            .from('comandas')
            .select('*')
            .eq('store_id', App.state.storeId)
            .eq('numero', numComanda)
            .eq('status', 'aberta')
            .single();

        if (!comanda) {
            NaxioUI.hideLoading();
            await NaxioUI.alert(
                '❌ Comanda Não Encontrada',
                'Comanda não encontrada ou já fechada. Certifique-se que o garçom criou a comanda primeiro.',
                'error'
            );
            return;
        }

        // Busca a reserva
        const { data: reserva } = await _sb
            .from('reservas_dia')
            .select('*')
            .eq('id', reservaId)
            .single();

        if (!reserva) {
            NaxioUI.hideLoading();
            await NaxioUI.alert('❌ Erro', 'Reserva não encontrada.', 'error');
            return;
        }

        // Adiciona os itens da reserva na comanda REAL
        const novosItens = [...(comanda.items || []), ...reserva.items];

        await _sb
            .from('comandas')
            .update({ items: novosItens })
            .eq('id', comanda.id);

        // Marca a reserva como vinculada
        await _sb
            .from('reservas_dia')
            .update({
                status: 'vinculada',
                comanda_id: comanda.id,
                vinculada_em: new Date().toISOString()
            })
            .eq('id', reservaId);

        NaxioUI.hideLoading();
        await NaxioUI.alert(
            '✅ Sucesso!',
            `Reserva vinculada à comanda ${numComanda} com sucesso!`,
            'success'
        );

        await ReservasSystem.loadReservasDia();
        ReservasSystem.renderReservas();
    },

    // Envia pedido da reserva para a cozinha (sem vincular ainda)
    enviarParaCozinha: async (reservaId) => {
        const { data: reserva } = await _sb
            .from('reservas_dia')
            .select('*, profiles(nome_completo)')
            .eq('id', reservaId)
            .single();

        if (!reserva) return;

        // Cria um pedido temporário para impressão na cozinha
        const itemsHtml = reserva.items.map(item =>
            `<div style="font-size:1.2rem; font-weight:bold; border-bottom:1px dashed #000; padding:5px 0;">
                ${item.qtd}x ${item.nome}
                ${item.observacao ? `<div style="font-size:0.9rem;">(${item.observacao})</div>` : ''}
            </div>`
        ).join('');

        const html = `
            <html>
            <body style="font-family:'Courier New'; width:300px; color:#000 !important; font-weight:bold;">
                <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:10px;">
                    <h2 style="margin:0;">🍽️ RESERVA</h2>
                    <div>${reserva.profiles?.nome_completo || 'Cliente'}</div>
                    <div style="font-size:12px;">Horário: ${reserva.horario_reserva}</div>
                    <div style="font-size:10px;">${new Date().toLocaleString()}</div>
                </div>
                ${itemsHtml}
                ${reserva.observacoes ? `
                    <div style="margin-top:10px; padding:10px; background:#ffe; border:2px solid #000;">
                        <strong>OBS:</strong> ${reserva.observacoes}
                    </div>
                ` : ''}
                <br><br>.
            </body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(() => {
            iframe.contentWindow.print();
            iframe.remove();
            App.utils.toast("📄 Pedido enviado para impressão!", "success");
        }, 500);
    }
};

// Inicializa quando o App estiver pronto
if (typeof App !== 'undefined') {
    const originalStoreInit = App.store.init;
    App.store.init = async function () {
        await originalStoreInit.call(this);
        if (App.state.currentStore?.tipo_loja === 'Restaurante') {
            await ReservasSystem.init();
        }
    };
}

console.log("✅ Módulo de Reservas Carregado");
