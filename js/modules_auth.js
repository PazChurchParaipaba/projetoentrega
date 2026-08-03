// =============================================================================
// ­ƒöÉ M├ôDULO DE AUTENTICA├ç├âO (separado de modules.js)
// =============================================================================
if (typeof App !== 'undefined') {
    Object.assign(App, {
        auth: {
            switchView: (view) => {
                ['login', 'roles', 'register', 'recover'].forEach(v => {
                    const el = document.getElementById(`auth-state-${v}`);
                    if (el) el.style.display = 'none';
                });
                const target = document.getElementById(`auth-state-${view}`);
                if (target) target.style.display = 'block';
            },

            fetchAddress: async (cep) => {
                if (!cep || cep.length < 8) return;
                App.utils.toast("Buscando endere├ºo...", "info");
                if (App.logistics && App.logistics.consultarCep) {
                    const data = await App.logistics.consultarCep(cep);
                    if (!data.erro) {
                        document.getElementById('reg-city').value = data.city;
                        document.getElementById('reg-uf').value = data.state;
                        document.getElementById('reg-bairro').value = data.neighborhood || '';
                        document.getElementById('reg-logradouro').value = data.street || '';
                        const prev = document.getElementById('reg-address-preview');
                        if (prev) {
                            prev.style.display = 'block';
                            prev.innerHTML = `Ô£à ${data.city}/${data.state} - ${data.neighborhood || ''}`;
                            prev.style.color = 'green';
                        }
                    } else {
                        alert("CEP n├úo encontrado.");
                    }
                } else {
                    console.error("M├│dulo logistics n├úo carregado.");
                }
            },

            startReg: (role) => {
                App.state.tempRole = role;
                document.getElementById('reg-title').innerText = `Cadastro - ${role === 'loja_admin' ? 'Lojista' : role.toUpperCase()}`;
                App.auth.switchView('register');
                const container = document.getElementById('reg-dynamic-fields');
                let html = '';
                if (role === 'loja_admin') {
                    html = `
                    <div class="input-wrapper"><label>Nome da Loja</label><input id="reg-store-name" class="input-field" placeholder="Ex: Naxio Center"></div>
                    <div class="input-wrapper"><label>CEP da Loja</label>
                        <div style="display:flex; gap:5px;">
                            <input id="reg-cep" class="input-field" placeholder="00000-000" onblur="App.auth.fetchAddress(this.value)">
                            <button class="btn btn-secondary btn-sm" onclick="App.auth.fetchAddress(document.getElementById('reg-cep').value)">­ƒöì</button>
                        </div>
                        <p id="reg-address-preview" class="text-xs text-muted" style="margin-top:5px; display:none;"></p>
                    </div>
                    <input type="hidden" id="reg-city"><input type="hidden" id="reg-uf">
                    <input type="hidden" id="reg-bairro"><input type="hidden" id="reg-logradouro">
                    <div class="input-wrapper"><label>Ramo da Loja</label>
                        <select id="reg-store-type" class="input-field">
                            <option value="Restaurante">Restaurante/Bebidas</option>
                            <option value="Roupas">Roupas/Varejo</option>
                            <option value="Autope├ºas">Autope├ºas</option>
                            <option value="Servi├ºos">Presta├º├úo de Servi├ºos</option>
                            <option value="Outros">Outros</option>
                        </select>
                    </div>
                    <div class="input-wrapper"><label>WhatsApp da Loja</label><input id="reg-whatsapp" class="input-field" placeholder="(00) 00000-0000"></div>
                    <div class="input-wrapper"><label>CNPJ</label><input id="reg-cnpj" class="input-field" placeholder="00.000.000/0000-00"></div>
                    <div class="input-wrapper" style="border: 2px dashed var(--primary); padding: 10px; border-radius: 8px; background: var(--info-bg);">
                        <label style="color:var(--primary)">­ƒöæ Token de Autoriza├º├úo</label>
                        <input id="reg-token" class="input-field" placeholder="Insira o c├│digo fornecido">
                    </div>`;
                } else if (role === 'cliente') {
                    html = `<div class="input-wrapper"><label>Seu WhatsApp</label><input id="reg-whatsapp-client" class="input-field" placeholder="(00) 00000-0000"></div>`;
                } else if (role === 'motorista' || role === 'montador') {
                    html = `
                    <div class="input-wrapper"><label>CPF</label><input id="reg-cpf" class="input-field" placeholder="000.000.000-00"></div>
                    <div class="input-wrapper"><label>Sua Chave Pix</label><input id="reg-pix" class="input-field" placeholder="Email, CPF ou Aleat├│ria"></div>
                    <div class="camera-container" id="cam-box">
                        <video id="cam-video" autoplay playsinline></video>
                        <div class="camera-overlay">Selfie com documento</div>
                    </div>
                    <div id="verified-msg" style="display:none; color:var(--success); font-weight:bold; margin-bottom:1rem;">Ô£à Identidade Confirmada</div>
                    <button class="btn btn-secondary btn-full" id="btn-cam" onclick="App.auth.runCamera()">Validar Identidade</button>`;
                } else {
                    html = `<div class="input-wrapper"><label>CPF</label><input id="reg-cpf" class="input-field" placeholder="000.000.000-00"></div>`;
                }
                container.innerHTML = html;
            },

            runCamera: async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
                    const video = document.getElementById('cam-video');
                    document.getElementById('cam-box').style.display = 'block';
                    video.srcObject = stream;
                    const btn = document.getElementById('btn-cam');
                    btn.innerText = "Analisando...";
                    btn.disabled = true;
                    setTimeout(() => {
                        stream.getTracks().forEach(t => t.stop());
                        document.getElementById('cam-box').style.display = 'none';
                        document.getElementById('verified-msg').style.display = 'block';
                        btn.style.display = 'none';
                        App.utils.toast('Verifica├º├úo conclu├¡da!', 'success');
                    }, 3000);
                } catch (e) { App.utils.toast('Erro: Permita acesso ├á c├ómera', 'error'); }
            },

            register: async () => {
                const email = document.getElementById('reg-email').value.trim();
                const pass = document.getElementById('reg-pass').value.trim();
                const name = document.getElementById('reg-name').value.trim();
                const role = App.state.tempRole;
                if (!email || !pass || !name) return App.utils.toast('Preencha os campos obrigat├│rios', 'error');
                try {
                    const elStoreName = document.getElementById('reg-store-name');
                    const elCnpj = document.getElementById('reg-cnpj');
                    const elWppStore = document.getElementById('reg-whatsapp');
                    const elWppClient = document.getElementById('reg-whatsapp-client');
                    const elCpf = document.getElementById('reg-cpf');
                    const elPix = document.getElementById('reg-pix');
                    const elStoreType = document.getElementById('reg-store-type');
                    const storeNameVal = elStoreName ? elStoreName.value.trim() : null;
                    const cnpjVal = elCnpj ? elCnpj.value.trim() : null;
                    const wppStoreVal = elWppStore ? elWppStore.value.trim() : null;
                    const storeTypeVal = elStoreType ? elStoreType.value : 'Outros';
                    const wppClientVal = elWppClient ? elWppClient.value.trim() : null;
                    const cpfVal = elCpf ? elCpf.value.trim() : null;
                    const pixVal = elPix ? elPix.value.trim() : null;

                    if (role === 'loja_admin') {
                        const tokenEl = document.getElementById('reg-token');
                        const tokenVal = tokenEl ? tokenEl.value.trim() : "";
                        if (!tokenVal) throw new Error("Token de autoriza├º├úo ├® obrigat├│rio");
                        const { error: tokenError } = await _sb.rpc('validate__token', { token_input: tokenVal });
                        if (tokenError) throw new Error(tokenError.message || "Token inv├ílido.");
                    }

                    const getElVal = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
                    const { data: newUser, error } = await _sb.from('profiles').insert({
                        nome_completo: name,
                        email: email,
                        password: pass,
                        role: role,
                        cpf: cpfVal,
                        cnpj: cnpjVal,
                        chave_pix: pixVal,
                        whatsapp: wppClientVal,
                        cep: getElVal('reg-cep'),
                        cidade: getElVal('reg-city'),
                        uf: getElVal('reg-uf'),
                        bairro: getElVal('reg-bairro'),
                        logradouro: getElVal('reg-logradouro'),
                        is_verified: document.getElementById('verified-msg')?.style.display === 'block'
                    }).select().single();

                    if (error) throw error;

                    if (role === 'loja_admin') {
                        const finalStoreName = storeNameVal || "Loja Nova";
                        const { error: storeError } = await _sb.from('stores').insert({
                            admin_id: newUser.id,
                            nome_loja: finalStoreName,
                            tipo_loja: storeTypeVal,
                            cnpj: cnpjVal,
                            whatsapp: wppStoreVal
                        });
                        if (storeError) {
                            alert("Usu├írio criado, mas erro ao criar loja: " + storeError.message);
                            return;
                        }
                    }
                    App.utils.toast('Cadastro realizado com sucesso!', 'success');
                    App.auth.switchView('login');
                } catch (e) {
                    console.error(e);
                    App.utils.toast('Erro: ' + e.message, 'error');
                }
            },

            // =========================================================================
            // ­ƒñÁ LOGIN ÔÇö Fluxo unificado
            // =========================================================================
            login: async () => {
                const email = document.getElementById('login-email').value.trim();
                const pass = document.getElementById('login-pass').value.trim();
                const { data, error } = await _sb.from('profiles').select('*').eq('email', email).maybeSingle();

                if (error || !data || data.password !== pass) {
                    App.utils.toast('Email ou senha incorretos', 'error');
                    return;
                }

                App.state.user = { id: data.id };
                App.state.profile = data;

                // Ô£à GAR├çOM: Novo fluxo de sele├º├úo de loja di├íria
                if (data.role === 'garcom') {
                    localStorage.setItem('logimoveis_session', JSON.stringify({ ...data }));
                    App.utils.toast('Bem-vindo! Escolha a loja de hoje ­ƒæç', 'info');
                    await App.auth.showWaiterStorePicker(data);
                    return;
                }

                // Outros roles: fluxo padr├úo
                let storeId = null;
                if (data.role === 'loja_admin') {
                    const { data: stores } = await _sb.from('stores').select('id').eq('admin_id', data.id);
                    if (stores && stores.length > 0) storeId = stores[0].id;
                } else if (['cozinha', 'caixa', 'entregador'].includes(data.role)) {
                    const { data: staffRows } = await _sb.from('store_staff').select('store_id').eq('profile_id', data.id);
                    if (staffRows && staffRows.length > 0) storeId = staffRows[0].store_id;
                }

                const sessionData = { ...data, store_id: storeId };
                localStorage.setItem('logimoveis_session', JSON.stringify(sessionData));
                App.state.storeId = storeId;
                App.utils.toast('Bem-vindo!', 'success');
                App.router.renderNav();
                App.router.goDashboard();
            },

            // =========================================================================
            // ­ƒÅ¬ SELETOR DE LOJA DO GAR├çOM ÔÇö Aparece todo dia
            // =========================================================================
            showWaiterStorePicker: async (profile) => {
                const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

                // Se j├í escolheu loja hoje, vai direto
                const existingWaiter = localStorage.getItem('NAXIO_WAITER_SESSION_V3');
                if (existingWaiter) {
                    try {
                        const ws = JSON.parse(existingWaiter);
                        if (ws.date === today && ws.store) {
                            App.state.storeId = ws.store;
                            App.router.renderNav();
                            App.router.goDashboard();
                            return;
                        }
                    } catch (e) { }
                    localStorage.removeItem('NAXIO_WAITER_SESSION_V3');
                }

                // Busca TODAS as lojas do gar├ºom via store_staff
                let stores = [];
                try {
                    const { data: staffRows } = await _sb.from('store_staff')
                        .select('store_id')
                        .eq('profile_id', profile.id);

                    if (staffRows && staffRows.length > 0) {
                        const ids = staffRows.map(r => r.store_id).filter(Boolean);
                        if (ids.length > 0) {
                            const { data: storeData } = await _sb.from('stores')
                                .select('id, nome_loja, tipo_loja, cidade')
                                .in('id', ids);
                            if (storeData) stores = storeData;
                        }
                    }
                } catch (e) {
                    console.warn('Erro ao buscar lojas do gar├ºom:', e);
                }

                if (stores.length === 0) {
                    alert('Gar├ºom sem loja vinculada. Pe├ºa ao administrador para vincul├í-lo a uma loja.');
                    App.auth.logout();
                    return;
                }

                // Ícones por tipo de loja (Usando HTML em vez de Emojis para evitar erro de codificação)
                const emojis = {
                    'Restaurante': '<i class="ri-restaurant-2-fill"></i>', 'Bar': '<i class="ri-goblet-fill"></i>', 'Lanchonete': '<i class="ri-cake-3-fill"></i>',
                    'Pizzaria': '<i class="ri-pie-chart-fill"></i>', 'Padaria': '<i class="ri-bread-fill"></i>', 'Sorveteria': '<i class="ri-cup-fill"></i>'
                };

                const storeCards = stores.map(s => {
                    const emoji = emojis[s.tipo_loja] || '<i class="ri-store-2-fill"></i>';
                    const safeName = (s.nome_loja || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    return `
                        <div onclick="App.auth.selectWaiterStore('${s.id}','${safeName}')"
                            style="background:rgba(30,41,59,0.9);border:2px solid rgba(59,130,246,0.3);border-radius:20px;padding:30px 24px;cursor:pointer;transition:all 0.25s;text-align:center;min-width:180px;max-width:260px;flex:1;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.3);"
                            onmouseover="this.style.borderColor='rgba(59,130,246,0.9)';this.style.transform='translateY(-5px)';this.style.boxShadow='0 20px 50px rgba(59,130,246,0.3)'"
                            onmouseout="this.style.borderColor='rgba(59,130,246,0.3)';this.style.transform='translateY(0)';this.style.boxShadow='0 8px 32px rgba(0,0,0,0.3)'">
                            <div style="font-size:3.5rem;margin-bottom:16px;">${emoji}</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#f8fafc;margin-bottom:8px;line-height:1.2;">${s.nome_loja}</div>
                            <div style="font-size:0.85rem;color:#94a3b8;margin-bottom:4px;">${s.tipo_loja || 'Restaurante'}</div>
                            ${s.cidade ? `<div style="font-size:0.8rem;color:#64748b;"><i class="ri-map-pin-2-fill"></i> ${s.cidade}</div>` : ''}
                            <div style="margin-top:20px;padding:10px 20px;background:rgba(59,130,246,0.15);border-radius:50px;color:#93c5fd;font-size:0.9rem;font-weight:600;">
                                Trabalhar aqui <i class="ri-arrow-right-line"></i>
                            </div>
                        </div>`;
                }).join('');

                const dateLabel = new Date().toLocaleDateString('pt-BR', {
                    weekday: 'long', day: 'numeric', month: 'long'
                });

                // Cria overlay fullscreen
                const overlay = document.createElement('div');
                overlay.id = 'waiter-store-picker';
                overlay.style.cssText = [
                    'position:fixed', 'inset:0', 'z-index:99999',
                    'background:linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)',
                    'font-family:"Plus Jakarta Sans",system-ui,sans-serif', 'padding:40px 20px',
                    'overflow-y:auto', 'display:flex', 'flex-direction:column', 'align-items:center'
                ].join(';');

                overlay.innerHTML = `
                    <div style="text-align:center;margin-bottom:40px;animation:fadeIn 0.5s ease; width:100%; max-width:800px; margin: 0 auto 40px auto;">
                        <div style="width:80px;height:80px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:24px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 12px 40px rgba(59,130,246,0.5);">
                            <span style="font-size:2.5rem;">🙎‍♂️</span>
                        </div>
                        <h1 style="color:#f8fafc;font-size:2rem;font-weight:800;margin:0 0 10px 0;letter-spacing:-0.5px;">
                            Olá, ${(profile.nome_completo || 'Garçom').split(' ')[0]}!
                        </h1>
                        <p style="color:#94a3b8;font-size:1.05rem;margin:0 0 15px 0;">
                            Sua conta está associada a várias lojas. Clique em qual você vai trabalhar hoje.
                        </p>
                        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 20px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:50px;color:#fbbf24;font-size:0.9rem;font-weight:500;">
                            <i class="ri-calendar-todo-fill"></i> ${dateLabel}
                        </div>
                    </div>

                    <div style="display:flex;gap:24px;flex-wrap:wrap;justify-content:center;max-width:720px;width:100%; margin: 0 auto;">
                        ${storeCards}
                    </div>

                    <div style="margin-top:48px;text-align:center;">
                        <button onclick="App.auth.logout()"
                            style="background:transparent;border:1px solid rgba(148,163,184,0.25);color:#64748b;padding:10px 24px;border-radius:50px;cursor:pointer;font-size:0.9rem;transition:all 0.2s;"
                            onmouseover="this.style.color='#94a3b8';this.style.borderColor='rgba(148,163,184,0.5)'"
                            onmouseout="this.style.color='#64748b';this.style.borderColor='rgba(148,163,184,0.25)'">
                            <i class="ri-logout-circle-line"></i> Sair da conta
                        </button>
                    </div>

                    <style>
                        @keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
                    </style>
                `;

                document.body.appendChild(overlay);
            },

            // Gar├ºom confirmou a loja do dia
            selectWaiterStore: async (storeId, storeName) => {
                const profile = App.state.profile;
                const today = new Date().toISOString().slice(0, 10);

                // Sess├úo do gar├ºom com data de hoje (expira automaticamente amanh├ú)
                const waiterSession = {
                    id: profile.id,
                    name: profile.nome_completo,
                    start: new Date().toISOString(),
                    store: storeId,
                    storeName: storeName,
                    date: today
                };
                localStorage.setItem('NAXIO_WAITER_SESSION_V3', JSON.stringify(waiterSession));

                // Sess├úo global
                const sessionData = { ...profile, store_id: storeId };
                localStorage.setItem('logimoveis_session', JSON.stringify(sessionData));
                App.state.storeId = storeId;

                // Remove overlay
                const picker = document.getElementById('waiter-store-picker');
                if (picker) {
                    picker.style.opacity = '0';
                    picker.style.transition = 'opacity 0.3s';
                    setTimeout(() => picker.remove(), 300);
                }

                App.utils.toast(`Boa sorte em ${storeName}! ­ƒñÁ`, 'success');
                App.router.renderNav();
                App.router.goDashboard();
            },

            recoverPassword: async () => {
                const email = document.getElementById('rec-email').value.trim();
                const cpf = document.getElementById('rec-cpf').value.trim();
                if (!email || !cpf) return App.utils.toast('Preencha Email e CPF', 'error');
                const { data } = await _sb.from('profiles').select('id').eq('email', email).eq('cpf', cpf).maybeSingle();
                if (data) { App.utils.toast('Solicita├º├úo enviada ao admin!', 'success'); App.auth.switchView('login'); }
                else { App.utils.toast('Dados n├úo conferem.', 'error'); }
            },

            logout: () => {
                localStorage.removeItem('logimoveis_session');
                localStorage.removeItem('NAXIO_WAITER_SESSION_V3');
                location.reload();
            }
        }
    });
    console.log("­ƒôª M├│dulo Auth carregado");
}
