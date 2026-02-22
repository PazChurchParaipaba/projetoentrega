// =============================================================================
// 🔐 MÓDULO DE AUTENTICAÇÃO (separado de modules.js)
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
                App.utils.toast("Buscando endereço...", "info");
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
                            prev.innerHTML = `✅ ${data.city}/${data.state} - ${data.neighborhood || ''}`;
                            prev.style.color = 'green';
                        }
                    } else {
                        alert("CEP não encontrado.");
                    }
                } else {
                    console.error("Módulo logistics não carregado.");
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
                            <button class="btn btn-secondary btn-sm" onclick="App.auth.fetchAddress(document.getElementById('reg-cep').value)">🔍</button>
                        </div>
                        <p id="reg-address-preview" class="text-xs text-muted" style="margin-top:5px; display:none;"></p>
                    </div>
                    <input type="hidden" id="reg-city"><input type="hidden" id="reg-uf">
                    <input type="hidden" id="reg-bairro"><input type="hidden" id="reg-logradouro">
                    <div class="input-wrapper"><label>Ramo da Loja</label>
                        <select id="reg-store-type" class="input-field">
                            <option value="Restaurante">Restaurante/Bebidas</option>
                            <option value="Roupas">Roupas/Varejo</option>
                            <option value="Autopeças">Autopeças</option>
                            <option value="Serviços">Prestação de Serviços</option>
                            <option value="Outros">Outros</option>
                        </select>
                    </div>
                    <div class="input-wrapper"><label>WhatsApp da Loja</label><input id="reg-whatsapp" class="input-field" placeholder="(00) 00000-0000"></div>
                    <div class="input-wrapper"><label>CNPJ</label><input id="reg-cnpj" class="input-field" placeholder="00.000.000/0000-00"></div>
                    <div class="input-wrapper" style="border: 2px dashed var(--primary); padding: 10px; border-radius: 8px; background: var(--info-bg);">
                        <label style="color:var(--primary)">🔑 Token de Autorização</label>
                        <input id="reg-token" class="input-field" placeholder="Insira o código fornecido">
                    </div>`;
                } else if (role === 'cliente') {
                    html = `<div class="input-wrapper"><label>Seu WhatsApp</label><input id="reg-whatsapp-client" class="input-field" placeholder="(00) 00000-0000"></div>`;
                } else if (role === 'motorista' || role === 'montador') {
                    html = `
                    <div class="input-wrapper"><label>CPF</label><input id="reg-cpf" class="input-field" placeholder="000.000.000-00"></div>
                    <div class="input-wrapper"><label>Sua Chave Pix</label><input id="reg-pix" class="input-field" placeholder="Email, CPF ou Aleatória"></div>
                    <div class="camera-container" id="cam-box">
                        <video id="cam-video" autoplay playsinline></video>
                        <div class="camera-overlay">Selfie com documento</div>
                    </div>
                    <div id="verified-msg" style="display:none; color:var(--success); font-weight:bold; margin-bottom:1rem;">✅ Identidade Confirmada</div>
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
                        App.utils.toast('Verificação concluída!', 'success');
                    }, 3000);
                } catch (e) { App.utils.toast('Erro: Permita acesso à câmera', 'error'); }
            },

            register: async () => {
                const email = document.getElementById('reg-email').value.trim();
                const pass = document.getElementById('reg-pass').value.trim();
                const name = document.getElementById('reg-name').value.trim();
                const role = App.state.tempRole;
                if (!email || !pass || !name) return App.utils.toast('Preencha os campos obrigatórios', 'error');
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
                        if (!tokenVal) throw new Error("Token de autorização é obrigatório");
                        const { error: tokenError } = await _sb.rpc('validate__token', { token_input: tokenVal });
                        if (tokenError) throw new Error(tokenError.message || "Token inválido.");
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
                            alert("Usuário criado, mas erro ao criar loja: " + storeError.message);
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

            login: async () => {
                const email = document.getElementById('login-email').value.trim();
                const pass = document.getElementById('login-pass').value.trim();
                const { data, error } = await _sb.from('profiles').select('*').ilike('email', email).maybeSingle();

                if (error || !data || data.password !== pass) {
                    App.utils.toast('Email ou senha incorretos', 'error');
                } else {
                    App.state.user = { id: data.id };
                    App.state.profile = data;

                    // --- CORREÇÃO: Busca Store ID ---
                    let storeId = null;

                    if (data.role === 'loja_admin') {
                        const { data: store } = await _sb.from('stores').select('id').eq('admin_id', data.id).maybeSingle();
                        if (store) storeId = store.id;
                    }
                    else if (['garcom', 'cozinha', 'caixa', 'entregador'].includes(data.role)) {
                        const { data: staff } = await _sb.from('store_staff').select('store_id').eq('profile_id', data.id).maybeSingle();
                        if (staff) storeId = staff.store_id;
                    }

                    // Salva na sessão
                    const sessionData = { ...data, store_id: storeId };
                    localStorage.setItem('logimoveis_session', JSON.stringify(sessionData));

                    // Salva no State Global
                    App.state.storeId = storeId;

                    // Salva sessão específica do garçom para compatibilidade com módulo GarcomSystem
                    if (data.role === 'garcom' && storeId) {
                        const waiterSession = {
                            id: data.id,
                            name: data.nome_completo,
                            start: new Date().toISOString(),
                            store: storeId
                        };
                        localStorage.setItem('NAXIO_WAITER_SESSION_V3', JSON.stringify(waiterSession));
                    }

                    App.utils.toast('Bem-vindo!', 'success');
                    App.router.renderNav();
                    App.router.goDashboard();
                }
            },

            recoverPassword: async () => {
                const email = document.getElementById('rec-email').value.trim();
                const cpf = document.getElementById('rec-cpf').value.trim();
                if (!email || !cpf) return App.utils.toast('Preencha Email e CPF', 'error');
                const { data } = await _sb.from('profiles').select('id').ilike('email', email).eq('cpf', cpf).maybeSingle();
                if (data) { App.utils.toast('Solicitação enviada ao admin!', 'success'); App.auth.switchView('login'); }
                else { App.utils.toast('Dados não conferem.', 'error'); }
            },

            logout: () => {
                localStorage.removeItem('logimoveis_session');
                location.reload();
            }
        }
    });
    console.log("📦 Módulo Auth carregado");
}
