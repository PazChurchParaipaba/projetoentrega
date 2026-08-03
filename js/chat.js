// Arquivo: js/chat_module.js (ou o nome que você salvou)

// Verifica se o App existe para evitar erro de carregamento
if (typeof App !== 'undefined') {
    
    Object.assign(App, {
        chat: {
            open: async (storeId, clientId = null) => {
                // 1. Verificação de Login
                if (!App.state.user) {
                    App.utils.toast("Faça login para acessar o chat.", "warning");
                    return App.router.go('auth');
                }
                
                App.state.activeChatStore = storeId;
                App.state.activeChatClient = clientId || App.state.user.id;
                
                // 2. Lógica para diferenciar Lojista de Cliente
                const isStore = (App.state.profile && App.state.profile.role === 'loja_admin');
                
                // 3. HTML do Modal (Injetado dinamicamente)
                const modalHtml = `
                <div id="chat-modal" class="modal-overlay" style="display:flex; z-index:10010;">
                    <div class="modal-content" style="width:100%; max-width:600px; margin:auto; height: 80vh; display: flex; flex-direction: column;">
                        
                        <div class="modal-header" style="flex-shrink: 0;">
                            <div class="chat-header-info" style="display:flex; align-items:center; gap:10px;">
                                <div class="chat-avatar-circle" id="chat-avatar-initials" style="width:40px; height:40px; background:var(--primary); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold;">
                                    <i class="ri-user-line"></i>
                                </div>
                                <div class="chat-user-name">
                                    <h4 id="chat-header-name" style="margin:0; font-size:1rem;">Carregando...</h4>
                                    <div class="chat-user-status" style="font-size:0.75rem; color:var(--success);">Online</div>
                                </div>
                            </div>
                            <button class="btn btn-secondary btn-sm" onclick="App.chat.close()" style="border-radius:50%; width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center;">
                                <i class="ri-close-line"></i>
                            </button>
                        </div>

                        <div class="modal-body" style="flex: 1; overflow-y: hidden; display: flex; flex-direction: column; padding: 0;">
                            <div id="chat-msgs" class="chat-messages" style="flex: 1; overflow-y: auto; padding: 15px; background: var(--background);"></div>
                        </div>

                        <div class="chat-footer" style="padding: 10px; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                            <button class="btn btn-secondary btn-sm" onmousedown="App.chat.recordAudio()" onmouseup="App.chat.recordAudio()" title="Segure para gravar" style="border-radius: 50%; width: 40px; height: 40px; padding: 0;">
                                <i class="ri-mic-line"></i>
                            </button>
                            <div class="chat-input-wrapper" style="flex: 1;">
                                <input type="text" id="chat-input" class="input-field" placeholder="Digite sua mensagem..." autocomplete="off" onkeypress="if(event.key==='Enter') App.chat.send()" style="margin:0;">
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="App.chat.send()" style="border-radius: 50%; width: 40px; height: 40px; padding: 0;">
                                <i class="ri-send-plane-fill"></i>
                            </button>
                        </div>

                    </div>
                </div>`;

                // Remove modal antigo se existir e adiciona o novo
                const old = document.getElementById('chat-modal'); if (old) old.remove();
                document.body.insertAdjacentHTML('beforeend', modalHtml);

                const msgs = document.getElementById('chat-msgs');
                msgs.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa;"><i class="ri-loader-4-line spin"></i></div>';

                // 4. Buscar Nome do Interlocutor
                try {
                    if (isStore) {
                        const { data: profile } = await _sb.from('profiles').select('nome_completo').eq('id', clientId).single();
                        if(profile) {
                            document.getElementById('chat-header-name').innerText = profile.nome_completo;
                            document.getElementById('chat-avatar-initials').innerText = profile.nome_completo.charAt(0);
                        }
                    } else {
                        const { data: store } = await _sb.from('stores').select('nome_loja').eq('id', storeId).single();
                        if(store) {
                            document.getElementById('chat-header-name').innerText = store.nome_loja;
                            document.getElementById('chat-avatar-initials').innerText = store.nome_loja.charAt(0);
                        }
                    }
                } catch(e) { console.warn("Erro ao buscar nomes chat", e); }

                // 5. Carregar Mensagens Antigas
                const { data } = await _sb.from('messages')
                    .select('*')
                    .eq('store_id', storeId)
                    .eq('client_id', App.state.activeChatClient)
                    .order('created_at', { ascending: true });
                    
                msgs.innerHTML = '';
                if (data && data.length > 0) data.forEach(m => App.chat.renderMsg(m));
                else msgs.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;"><p>Inicie a conversa 👋</p></div>';

                // Scroll para o final
                setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 100);

                // 6. Iniciar Realtime
                if (App.state.chatSub) _sb.removeChannel(App.state.chatSub);
                
                App.state.chatSub = _sb.channel('public:messages')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `store_id=eq.${storeId}` }, (payload) => {
                        if (payload.new.client_id === App.state.activeChatClient) {
                            if (payload.eventType === 'INSERT') {
                                if (msgs.innerText.includes("Inicie a conversa")) msgs.innerHTML = "";
                                App.chat.renderMsg(payload.new);
                            } else if (payload.eventType === 'UPDATE') {
                                // Lida com edição/deleção em tempo real
                                const div = document.getElementById(`msg-${payload.new.id}`);
                                if(div) {
                                    if(payload.new.is_deleted) div.innerHTML = `<span class="chat-deleted">🚫 Mensagem apagada</span>`;
                                    else div.innerHTML = `${payload.new.content} <span class="chat-edited-label">(editado)</span>`;
                                }
                            }
                        }
                    }).subscribe();
            },

            close: () => {
                const modal = document.getElementById('chat-modal');
                if(modal) modal.remove(); // Remove do DOM para limpar
                if (App.state.chatSub) _sb.removeChannel(App.state.chatSub);
            },

            send: async (content = null, type = 'text') => {
                const txtInput = document.getElementById('chat-input');
                const txt = content || (txtInput ? txtInput.value : "");
                
                if (!txt && type === 'text') return;
                
                await _sb.from('messages').insert({ 
                    store_id: App.state.activeChatStore, 
                    client_id: App.state.activeChatClient, 
                    sender_id: App.state.user.id, 
                    content: txt 
                });
                
                if (type === 'text' && txtInput) txtInput.value = '';
            },

            recordAudio: async () => {
                if (!navigator.mediaDevices) return App.utils.toast("Sem suporte a áudio.", "error");
                
                if (!App.state.mediaRecorder) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        App.state.mediaRecorder = new MediaRecorder(stream);
                        App.state.mediaRecorder.ondataavailable = e => App.state.audioChunks.push(e.data);
                        
                        App.state.mediaRecorder.onstop = async () => {
                            const blob = new Blob(App.state.audioChunks, { type: 'audio/ogg; codecs=opus' });
                            App.state.audioChunks = [];
                            const fileName = `audio_${Date.now()}.ogg`;
                            
                            App.utils.toast("Enviando áudio...", "info");
                            const { error } = await _sb.storage.from('chat_uploads').upload(fileName, blob);
                            
                            if (!error) {
                                const { data: url } = _sb.storage.from('chat_uploads').getPublicUrl(fileName);
                                App.chat.send(`<audio controls src="${url.publicUrl}"></audio>`, 'audio');
                            } else {
                                App.utils.toast("Erro ao enviar áudio", "error");
                            }
                        };
                        
                        App.state.mediaRecorder.start();
                        App.utils.toast("Gravando... Solte para enviar", "warning");
                    } catch (err) { App.utils.toast("Erro microfone: " + err.message, "error"); }
                } else {
                    if (App.state.mediaRecorder.state === 'recording') { 
                        App.state.mediaRecorder.stop(); 
                    } else { 
                        App.state.mediaRecorder.start(); 
                        App.utils.toast("Gravando...", "warning"); 
                    }
                }
            },

            renderMsg: (msg) => {
                const div = document.createElement('div');
                const isMine = msg.sender_id === App.state.user.id;
                
                div.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;
                div.id = `msg-${msg.id}`;
                
                if (msg.is_deleted) { 
                    div.innerHTML = `<span class="chat-deleted" style="font-style:italic; opacity:0.7;"><i class="ri-prohibited-line"></i> Mensagem apagada</span>`; 
                } else {
                    let contentHtml = msg.content;
                    if (msg.is_edited) contentHtml += `<span class="chat-edited-label" style="font-size:0.7em; opacity:0.6; margin-left:5px;"><i class="ri-pencil-line"></i></span>`;
                    
                    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    div.innerHTML = `<div>${contentHtml}</div><div class="chat-status" style="font-size:0.7rem; text-align:right; margin-top:2px; opacity:0.7;">${time} ${isMine ? '<i class="ri-check-double-line"></i>' : ''}</div>`;
                    
                    // Opção de apagar (apenas mensagens próprias)
                    if (isMine) {
                       div.ondblclick = () => { if(confirm("Apagar mensagem?")) App.chat.deleteMsg(msg.id); };
                       // Opção Mobile (Long press simulation via click simples para teste)
                       div.onclick = () => { 
                           // Lógica de opções poderia vir aqui
                       };
                    }
                }
                
                const container = document.getElementById('chat-msgs'); 
                if(container) {
                    container.appendChild(div); 
                    container.scrollTop = container.scrollHeight;
                }
            },

            deleteMsg: async (id) => { 
                await _sb.from('messages').update({ is_deleted: true, content: '🚫 Mensagem apagada' }).eq('id', id); 
            },

            loadHistory: async (viewType) => {
                if (!App.state.user) return;
                
                const containerId = viewType === 'loja' ? 'store-chat-list' : 'client-chat-list';
                const container = document.getElementById(containerId);
                if(!container) return;

                const myId = App.state.user.id;
                let query = _sb.from('messages')
                    .select('*, profiles:sender_id(nome_completo), stores:store_id(nome_loja)')
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (viewType === 'loja') query = query.eq('store_id', App.state.storeId); 
                else query = query.eq('client_id', myId);
                
                const { data } = await query;
                
                if (!data || data.length === 0) {
                    container.innerHTML = `<div style="text-align:center; padding:10px; color:#aaa; font-size:0.85rem;"><i class="ri-chat-1-line"></i> Nenhuma conversa.</div>`;
                    return;
                }

                let html = '';
                const unique = new Set();
                
                data.forEach(msg => {
                    let cid = (viewType === 'loja') ? msg.client_id : msg.store_id;
                    if (!unique.has(cid)) {
                        unique.add(cid);
                        let name = (viewType === 'loja') ? (msg.sender_id !== myId ? msg.profiles?.nome_completo : 'Cliente') : (msg.stores?.nome_loja || 'Loja');
                        
                        html += `
                        <div class="chat-history-item" onclick="App.chat.open('${msg.store_id}', '${msg.client_id}')" style="cursor:pointer; padding:10px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
                            <div class="chat-user-info">
                                <div style="font-weight:bold;">${name || 'Usuário'}</div>
                                <div class="text-xs text-muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${msg.is_deleted ? '🚫 Apagada' : msg.content}</div>
                            </div>
                            <i class="ri-arrow-right-s-line" style="color:var(--primary);"></i>
                        </div>`;
                    }
                });
                container.innerHTML = html;
            }
        }
    });
    console.log("💬 Módulo Chat Carregado");
}
