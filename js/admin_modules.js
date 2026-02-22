const SuperAdmin = {
    init: async () => {
        // Verifica se tem a "chave" na URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') !== 'god') return;

        console.log("⚡ Painel Super Admin Ativado");
        SuperAdmin.injectButton();
    },

    injectButton: () => {
        const btn = document.createElement('button');
        btn.innerHTML = '⚡ GESTÃO MASTER';
        btn.style.cssText = "position:fixed; bottom:10px; left:10px; z-index:99999; background:#000; color:#0f0; border:1px solid #0f0; padding:10px; font-family:monospace; cursor:pointer;";
        btn.onclick = SuperAdmin.openPanel;
        document.body.appendChild(btn);
    },

    openPanel: async () => {
        // Busca todas as lojas
        const { data: stores } = await _sb.from('stores').select('*');
        const { data: users } = await _sb.from('profiles').select('*');

        const html = `
        <div id="super-admin-modal" class="modal-overlay" style="display:flex; z-index:10000;">
            <div class="modal-content" style="max-width:900px; max-height:90vh; overflow-y:auto; background:#1a1a1a; color:#fff;">
                <div class="modal-header" style="background:#000; border-bottom:1px solid #333;">
                    <h3 style="color:#0f0;">PAINEL DE DEUS (SUPER ADMIN)</h3>
                    <button class="btn btn-sm btn-danger" onclick="document.getElementById('super-admin-modal').remove()">FECHAR</button>
                </div>
                <div class="modal-body">
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
                        <div style="background:#333; padding:15px; border-radius:8px;">
                            <h4>Lojas Cadastradas: ${stores.length}</h4>
                        </div>
                        <div style="background:#333; padding:15px; border-radius:8px;">
                            <h4>Usuários Totais: ${users.length}</h4>
                        </div>
                    </div>

                    <h4 style="color:#0f0; border-bottom:1px solid #333; padding-bottom:5px;">Gerenciar Lojas</h4>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                            <thead>
                                <tr style="text-align:left; border-bottom:1px solid #555;">
                                    <th>ID</th>
                                    <th>Nome</th>
                                    <th>Tipo</th>
                                    <th>Dono (ID)</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stores.map(s => `
                                    <tr style="border-bottom:1px solid #333;">
                                        <td style="padding:8px; font-family:monospace; color:#888;">${s.id.slice(0,8)}...</td>
                                        <td style="padding:8px;">${s.nome_loja}</td>
                                        <td style="padding:8px;">${s.tipo_loja}</td>
                                        <td style="padding:8px; font-family:monospace;">${s.admin_id.slice(0,8)}...</td>
                                        <td style="padding:8px;">
                                            <button class="btn btn-sm btn-secondary" onclick="SuperAdmin.loginAs('${s.admin_id}')">Entrar como</button>
                                            <button class="btn btn-sm btn-danger" onclick="SuperAdmin.deleteStore('${s.id}')">Excluir</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    },

    loginAs: async (userId) => {
        // Truque para "impersonar" (requer ajuste na lógica de login se usar Auth do Supabase, aqui simulamos trocando o state)
        if(confirm("Você assumirá a identidade deste lojista. O sistema será recarregado.")) {
            const { data: user } = await _sb.from('profiles').select('*').eq('id', userId).single();
            if(user) {
                localStorage.setItem('logimoveis_session', JSON.stringify(user));
                window.location.href = window.location.pathname; // Remove o ?mode=god para sair do modo Deus ao logar
            }
        }
    },

    deleteStore: async (id) => {
        if(prompt("Digite DELETAR para confirmar a exclusão desta loja e todos os dados:") === 'DELETAR') {
            await _sb.from('stores').delete().eq('id', id);
            alert("Loja deletada.");
            SuperAdmin.openPanel(); // Recarrega
        }
    }
};

// Auto-inicia se o script carregar
SuperAdmin.init();
