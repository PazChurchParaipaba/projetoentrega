// ============================================================
// EXTENSÕES PARA modules.js - Sistema de Impressão Offline
// ============================================================
// Adicione este script APÓS carregar modules.js no HTML
// <script src="js/modules.js"></script>
// <script src="js/modules_extensions.js"></script>

(function() {
    'use strict';
    
    console.log("🔧 Carregando extensões de impressão offline...");
    
    // ========================================
    // EXTENSÃO 1: Envio de Comanda ao Servidor Local
    // ========================================
    
    if (typeof App !== 'undefined' && App.printers) {
        
        App.printers.sendComandaToServer = async function(comanda) {
            const serverUrl = localStorage.getItem('NAXIO_SERVER_IP') || 'http://localhost:3000';
            
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);
                
                const response = await fetch(`${serverUrl}/api/comandas`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(comanda),
                    signal: controller.signal
                });
                
                const result = await response.json();
                
                if (result.success) {
                    console.log("✅ Comanda enviada ao servidor local para impressão");
                    return true;
                }
            } catch (e) {
                console.warn("⚠️ Servidor local não disponível:", e.message);
            }
            
            return false;
        };
        
        // ========================================
        // EXTENSÃO 2: Auto-descoberta de Servidor
        // ========================================
        
        App.printers.discoverServer = async function() {
            console.log("🔍 Buscando servidor local...");
            
            const possibleURLs = [
                'http://localhost:3000',
                'http://127.0.0.1:3000'
            ];
            
            // Tenta descobrir IP local da rede
            try {
                const pc = new RTCPeerConnection({ iceServers: [] });
                pc.createDataChannel('');
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                const localIP = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        pc.close();
                        reject(new Error('Timeout'));
                    }, 2000);
                    
                    pc.onicecandidate = (ice) => {
                        if (!ice || !ice.candidate || !ice.candidate.candidate) return;
                        const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
                        const match = ipRegex.exec(ice.candidate.candidate);
                        if (match && match[0] !== '0.0.0.0') {
                            clearTimeout(timeout);
                            pc.close();
                            resolve(match[0]);
                        }
                    };
                });
                
                if (localIP && localIP.startsWith('192.168.')) {
                    const subnet = localIP.substring(0, localIP.lastIndexOf('.'));
                    // Adiciona IPs comuns da mesma rede
                    for (let i = 1; i <= 10; i++) {
                        possibleURLs.push(`http://${subnet}.${i}:3000`);
                    }
                }
            } catch (e) {
                console.warn("Não foi possível descobrir IP local via WebRTC");
            }
            
            // Testa cada URL
            for (const url of possibleURLs) {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 800);
                    
                    const response = await fetch(`${url}/api/status`, {
                        signal: controller.signal
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.online && data.store_id === App.state.storeId) {
                            console.log(`✅ Servidor encontrado: ${url}`);
                            localStorage.setItem('NAXIO_SERVER_IP', url);
                            if (App.utils && App.utils.toast) {
                                App.utils.toast("Servidor local conectado!", "success");
                            }
                            return url;
                        }
                    }
                } catch (e) {
                    // Ignora erros, continua testando
                }
            }
            
            console.warn("⚠️ Servidor local não encontrado");
            return null;
        };
        
        // ========================================
        // EXTENSÃO 3: Inicialização Automática
        // ========================================
        
        App.printers.initAutoDiscovery = async function() {
            const savedUrl = localStorage.getItem('NAXIO_SERVER_IP');
            
            if (savedUrl) {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 2000);
                    
                    const response = await fetch(`${savedUrl}/api/status`, {
                        signal: controller.signal
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.online && data.store_id === App.state.storeId) {
                            console.log("✅ Servidor local conectado:", savedUrl);
                            return savedUrl;
                        }
                    }
                } catch (e) {
                    console.warn("Servidor salvo não responde, buscando novamente...");
                }
            }
            
            return await App.printers.discoverServer();
        };
        
        // ========================================
        // EXTENSÃO 4: Funções de UI
        // ========================================
        
        App.printers.testServerConnection = async function() {
            const input = document.getElementById('server-ip-input');
            if (!input) {
                alert("Campo de IP não encontrado");
                return;
            }
            
            const url = input.value.trim();
            
            if (!url) {
                alert("Digite o endereço do servidor");
                return;
            }
            
            App.printers.updateServerStatus('testing', 'Testando conexão...');
            
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);
                
                const response = await fetch(`${url}/api/status`, {
                    signal: controller.signal
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.store_id !== App.state.storeId) {
                        App.printers.updateServerStatus('error', 'Servidor de outra loja!');
                        alert(`Erro: Este servidor está configurado para outra loja.\n\nServidor: ${data.store_id}\nSua loja: ${App.state.storeId}`);
                        return;
                    }
                    
                    App.printers.updateServerStatus('online', `Online - ${data.printers} impressoras, ${data.products} produtos`);
                    if (App.utils && App.utils.toast) {
                        App.utils.toast("Servidor conectado com sucesso!", "success");
                    }
                } else {
                    App.printers.updateServerStatus('error', 'Servidor não respondeu');
                }
            } catch (e) {
                App.printers.updateServerStatus('error', 'Não foi possível conectar');
                alert("Erro ao conectar:\n" + e.message);
            }
        };
        
        App.printers.saveServerConfig = function() {
            const input = document.getElementById('server-ip-input');
            if (!input) return;
            
            const url = input.value.trim();
            
            if (!url) {
                alert("Digite o endereço do servidor");
                return;
            }
            
            localStorage.setItem('NAXIO_SERVER_IP', url);
            if (App.utils && App.utils.toast) {
                App.utils.toast("Configuração salva!", "success");
            }
        };
        
        App.printers.updateServerStatus = function(status, text) {
            const icon = document.getElementById('server-status-icon');
            const textEl = document.getElementById('server-status-text');
            
            if (!icon || !textEl) return;
            
            const colors = {
                online: '#22c55e',
                offline: '#ef4444',
                testing: '#f59e0b',
                error: '#ef4444'
            };
            
            icon.style.background = colors[status] || '#94a3b8';
            textEl.textContent = text;
        };
        
        App.printers.injectServerConfigUI = function() {
            const modal = document.getElementById('printer-config-modal');
            if (!modal) return;
            
            // Verifica se já foi injetado
            if (document.getElementById('server-config-panel')) return;
            
            const listDisplay = document.getElementById('printer-list-display');
            if (!listDisplay) return;
            
            const serverConfigHTML = `
                <div id="server-config-panel" class="panel-box" style="margin-top: 15px; border: 2px solid #3b82f6; background: var(--surface); padding: 15px; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #3b82f6;">🖥️ Servidor de Impressão Local</h4>
                    
                    <div id="server-status" style="padding: 10px; border-radius: 6px; margin-bottom: 10px; background: #f1f5f9;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div id="server-status-icon" style="width: 12px; height: 12px; border-radius: 50%; background: #94a3b8;"></div>
                            <span id="server-status-text" style="font-size: 0.9rem; color: #475569;">Verificando...</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                        <input 
                            type="text" 
                            id="server-ip-input" 
                            class="input-field" 
                            placeholder="http://192.168.1.100:3000"
                            value="${localStorage.getItem('NAXIO_SERVER_IP') || 'http://localhost:3000'}"
                            style="margin: 0; flex: 1;"
                        >
                        <button class="btn btn-primary" onclick="App.printers.testServerConnection()" style="width: auto; padding: 8px 15px;">
                            Testar
                        </button>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-full" onclick="App.printers.discoverServer()">
                            🔍 Auto-Descobrir
                        </button>
                        <button class="btn btn-success btn-full" onclick="App.printers.saveServerConfig()">
                            💾 Salvar
                        </button>
                    </div>
                    
                    <p style="font-size: 0.75rem; color: #64748b; margin: 10px 0 0 0; line-height: 1.4;">
                        💡 <strong>Dica:</strong> O servidor local permite impressão offline via WiFi. 
                        Certifique-se de que o servidor está rodando no computador conectado às impressoras.
                    </p>
                </div>
            `;
            
            listDisplay.insertAdjacentHTML('afterend', serverConfigHTML);
            
            // Testa conexão automaticamente
            setTimeout(() => {
                App.printers.testServerConnection();
            }, 500);
        };
        
        // Hook no método open existente
        const originalOpen = App.printers.open;
        if (originalOpen) {
            App.printers.open = async function() {
                await originalOpen.call(this);
                setTimeout(() => {
                    App.printers.injectServerConfigUI();
                }, 300);
            };
        }
        
    }
    
    // ========================================
    // EXTENSÃO 5: Modificar sendToKitchen
    // ========================================
    
    if (typeof App !== 'undefined' && App.store) {
        
        const originalSendToKitchen = App.store.sendToKitchen;
        
        App.store.sendToKitchen = async function() {
            if (App.state.currentComandaItems.length === 0) {
                alert("Adicione itens antes.");
                return;
            }

            // Busca dados completos da comanda
            const { data: comanda, error: fetchError } = await _sb
                .from('comandas')
                .select('*')
                .eq('id', App.state.currentComanda)
                .single();
            
            if (fetchError || !comanda) {
                alert("Erro ao buscar comanda: " + (fetchError?.message || "Não encontrada"));
                return;
            }

            // Tenta enviar ao servidor local primeiro
            if (App.printers && App.printers.sendComandaToServer) {
                const enviouLocal = await App.printers.sendComandaToServer(comanda);
                
                if (enviouLocal) {
                    if (App.utils && App.utils.toast) {
                        App.utils.toast("Enviado para a Cozinha! 👨‍🍳", "success");
                    }
                    const modal = document.getElementById('comanda-modal');
                    if (modal) modal.style.display = 'none';
                    return;
                }
            }

            // Fallback: Marca no banco para impressão via realtime
            const { error } = await _sb.from('comandas')
                .update({ imprimir_cozinha: true, updated_at: new Date() })
                .eq('id', App.state.currentComanda);

            if (error) {
                alert("Erro ao enviar: " + error.message);
            } else {
                if (App.utils && App.utils.toast) {
                    App.utils.toast("Enviado para a Cozinha (via nuvem)! 👨‍🍳", "success");
                }
                const modal = document.getElementById('comanda-modal');
                if (modal) modal.style.display = 'none';
            }
        };
        
    }
    
    // ========================================
    // EXTENSÃO 6: Inicialização Automática
    // ========================================
    
    // Aguarda o App estar pronto e inicia auto-descoberta
    const initExtensions = () => {
        if (typeof App !== 'undefined' && App.state && App.state.storeId) {
            console.log("🚀 Iniciando auto-descoberta de servidor...");
            if (App.printers && App.printers.initAutoDiscovery) {
                App.printers.initAutoDiscovery();
            }
        } else {
            // Se o App.init já foi chamado, esperamos um pouco mais.
            // Aumentando para 3 segundos para diminuir o custo de CPU e logs.
            setTimeout(initExtensions, 3000);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtensions);
    } else {
        setTimeout(initExtensions, 1000);
    }
    
    console.log("✅ Extensões de impressão offline carregadas");
    
})();
