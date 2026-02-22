const Fiscal = {
    // Estado interno para controle de tentativas (Retry)
    state: {
        tentativas: 0,
        maxTentativas: 3
    },

    init: () => {
        console.log("🏛️ Módulo Fiscal Enterprise Carregado");
    },

    // =========================================================================
    // 🖥️ PARTE VISUAL (MODAL, PREVIEW E CONFIGURAÇÕES)
    // =========================================================================

    // --- NOVO: Função para mostrar o Cupom na tela ---
    exibirPreviewDanfe: (urlPdf, chave) => {
        // Remove modal anterior se houver
        const old = document.getElementById('preview-nfe-modal');
        if (old) old.remove();

        const html = `
        <div id="preview-nfe-modal" class="modal-overlay" style="display:flex; z-index:10000; align-items:center; justify-content:center; background:rgba(0,0,0,0.8); position:fixed; top:0; left:0; width:100%; height:100%;">
            <div class="modal-content" style="width:95%; max-width:500px; height:90vh; background:var(--surface); display:flex; flex-direction:column; border-radius:8px; overflow:hidden;">
                
                <div class="modal-header" style="padding:15px; background:#f1f5f9; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h3 style="margin:0; color:#0f172a;">Nota Autorizada! ✅</h3>
                        <small style="color:#64748b; font-size:0.75rem;">${chave || 'Sem chave visual'}</small>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('preview-nfe-modal').remove()">X</button>
                </div>

                <div class="modal-body" style="flex:1; padding:0; background:#ccc;">
                    <iframe src="${urlPdf}" style="width:100%; height:100%; border:none;"></iframe>
                </div>

                <div class="modal-footer" style="padding:15px; display:flex; gap:10px; background:var(--background); border-top:1px solid var(--border);">
                    <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('preview-nfe-modal').remove()">Fechar</button>
                    <a href="${urlPdf}" target="_blank" class="btn btn-success" style="flex:1; text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center;">
                        🖨️ Imprimir / Abrir
                    </a>
                </div>
            </div>
        </div>`;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    },

    openModal: async () => {
        if (!App.state.storeId) return alert("Erro: ID da Loja não encontrado.");

        // 1. Busca dados da loja (Configurações)
        const { data: store } = await _sb.from('stores').select('*').eq('id', App.state.storeId).single();

        // 2. Busca últimas 5 notas autorizadas
        const { data: lastNotes } = await _sb.from('orders')
            .select('id, created_at, total_pago, status_sefaz, chave_acesso, numero_nota')
            .eq('store_id', App.state.storeId)
            .eq('status_sefaz', 'autorizado')
            .order('created_at', { ascending: false })
            .limit(5);

        const old = document.getElementById('fiscal-modal'); if (old) old.remove();

        // 3. Gera HTML da lista de notas
        let notesHtml = '';
        if (lastNotes && lastNotes.length > 0) {
            notesHtml = lastNotes.map(n => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; font-size:0.85rem;">
                    <div>
                        <strong>NFC-e #${n.numero_nota || 'S/N'}</strong><br>
                        <span class="text-muted">${new Date(n.created_at).toLocaleString()}</span><br>
                        <span style="font-family:monospace; font-size:0.75rem;">${n.chave_acesso || '...'}</span>
                    </div>
                    <button class="btn btn-sm btn-danger" style="width:auto; padding: 4px 10px;" onclick="Fiscal.cancelarNota('${n.id}', '${n.chave_acesso}')">Cancelar</button>
                </div>
            `).join('');
        } else {
            notesHtml = '<div style="padding:15px; text-align:center; color:#94a3b8;">Nenhuma nota autorizada recentemente.</div>';
        }

        // 4. Monta o Modal
        const html = `
        <div id="fiscal-modal" class="modal-overlay" style="display:flex; z-index:9999; align-items:center; justify-content:center;">
            <div class="modal-content" style="max-height:90vh; overflow-y:auto; max-width:600px;">
                <div class="modal-header">
                    <h3>Fiscal & Contador</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('fiscal-modal').remove()">Fechar</button>
                </div>
                <div class="modal-body">
                    
                    <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:15px; margin-bottom:15px;">
                        <h5 style="color:#0369a1; margin-bottom:10px; display:flex; align-items:center; gap:5px;"><i class="ri-settings-3-line"></i> Credenciais Nuvem Fiscal</h5>
                        
                        <div class="input-wrapper">
                            <label>Client ID</label>
                            <input type="text" id="nuvem-id" class="input-field" value="${store.nuvem_client_id || ''}" placeholder="Client ID">
                        </div>
                        <div class="input-wrapper">
                            <label>Client Secret</label>
                            <input type="password" id="nuvem-secret" class="input-field" value="${store.nuvem_client_secret || ''}" placeholder="Client Secret">
                        </div>

                        <div style="display:flex; gap:10px;">
                            <div class="input-wrapper" style="flex:1">
                                <label>CSC ID (Ex: 000001)</label>
                                <input type="text" id="csc-id" class="input-field" value="${store.csc_id || ''}">
                            </div>
                            <div class="input-wrapper" style="flex:2">
                                <label>Código CSC (Token)</label>
                                <input type="text" id="csc-token" class="input-field" value="${store.csc_token || ''}">
                            </div>
                        </div>

                        <div class="input-wrapper" style="margin-top:10px; border-top:1px dashed #cbd5e1; padding-top:10px;">
                            <label>Email do Contador (Para envio de XML)</label>
                            <input type="email" id="cont-email" class="input-field" value="${store.email_contador || ''}" placeholder="contador@escritorio.com">
                        </div>

                        <button class="btn btn-success btn-full" style="margin-top:10px;" onclick="Fiscal.saveCredentials()">Salvar Configurações</button>
                        
                        <div style="text-align:center; margin-top:10px;">
                            <button class="btn btn-sm btn-info" onclick="Fiscal.exportarXMLs()"><i class="ri-download-cloud-line"></i> Baixar XMLs em Lote (ZIP)</button>
                        </div>
                    </div>

                    <div style="border-top:1px solid #eee; padding-top:15px;">
                        <h5 style="color:var(--danger); margin-bottom:10px;"><i class="ri-file-warning-line"></i> Cancelar Notas (Últimos 30 min)</h5>
                        <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; overflow:hidden; color:var(--text-main);">
                            ${notesHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    },

    saveCredentials: async () => {
        const clientId = document.getElementById('nuvem-id').value.trim();
        const clientSecret = document.getElementById('nuvem-secret').value.trim();
        const cscId = document.getElementById('csc-id').value.trim();
        const cscToken = document.getElementById('csc-token').value.trim();
        const emailCont = document.getElementById('cont-email').value.trim();

        if (!clientId || !clientSecret) return alert("Erro: Client ID e Secret são obrigatórios.");

        const { error } = await _sb.from('stores').update({
            nuvem_client_id: clientId,
            nuvem_client_secret: clientSecret,
            csc_id: cscId,
            csc_token: cscToken,
            email_contador: emailCont
        }).eq('id', App.state.storeId);

        if (error) alert("Erro ao salvar: " + error.message);
        else alert("✅ Dados Fiscais e de Contador Salvos!");
    },

    // =========================================================================
    // 🚀 LÓGICA DE EMISSÃO (COM RETRY AUTOMÁTICO)
    // =========================================================================

    emitirNFCe: async (orderId) => {
        try {
            Fiscal.state.tentativas = 0;

            // 1. Busca dados do pedido
            const { data: order } = await _sb.from('orders')
                .select('*, products(*), stores(*), profiles(*)')
                .eq('id', orderId)
                .single();

            if (!order) throw new Error("Pedido não encontrado");

            // 2. Valida credenciais
            if (!order.stores.nuvem_client_id || !order.stores.nuvem_client_secret) {
                console.warn("⚠️ Loja sem credenciais fiscais. Nota não será emitida.");
                return { success: false, motivo: 'sem_credenciais' };
            }

            // 3. Tenta emitir
            const resultado = await Fiscal._tentarEmissao(order);

            if (resultado.success) {
                App.utils.toast("✅ NFC-e Emitida com Sucesso!", "success");

                // --- ALTERAÇÃO AQUI: Chama o Preview ---
                if (resultado.pdf) {
                    Fiscal.exibirPreviewDanfe(resultado.pdf, resultado.chave);
                } else {
                    alert("Nota autorizada, mas URL do PDF não retornou.");
                }

                return resultado;
            } else {
                throw new Error(resultado.erro);
            }

        } catch (e) {
            console.error("❌ Erro na emissão:", e);

            // Se for erro de servidor SEFAZ, tenta reenviar
            if (e.message.includes('SEFAZ') && Fiscal.state.tentativas < Fiscal.state.maxTentativas) {
                Fiscal.state.tentativas++;
                App.utils.toast(`⚠️ Erro SEFAZ. Tentativa ${Fiscal.state.tentativas}/${Fiscal.state.maxTentativas}...`, "warning");

                // Aguarda 3 segundos e tenta novamente (Recursão)
                await new Promise(resolve => setTimeout(resolve, 3000));
                return Fiscal.emitirNFCe(orderId);
            }

            return { success: false, erro: e.message };
        }
    },

    // Função interna auxiliar
    _tentarEmissao: async (order) => {
        try {
            // 1. Autenticação Nuvem Fiscal
            const authRes = await fetch('https://auth.nuvemfiscal.com.br/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: order.stores.nuvem_client_id,
                    client_secret: order.stores.nuvem_client_secret,
                    scope: 'nfce'
                })
            });

            const authData = await authRes.json();
            if (!authData.access_token) throw new Error("Falha na autenticação Nuvem Fiscal");

            // 2. Monta payload da nota
            const numeroNota = order.stores.proximo_numero_nfce || 1;
            const valorTotal = order.total_pago || order.products.preco;

            // Define método de pagamento (código SEFAZ)
            let tipoPagamento = '01'; // Dinheiro (padrão)
            if (order.observacao) {
                try {
                    const obs = JSON.parse(order.observacao);
                    if (obs.pagamentos && obs.pagamentos.length > 0) {
                        tipoPagamento = obs.pagamentos[0].code || '01';
                    } else if (order.origem_venda === 'pdv_pix') {
                        tipoPagamento = '17'; // PIX
                    } else if (order.origem_venda === 'pdv_cartao') {
                        tipoPagamento = '03'; // Cartão Crédito (Padrão genérico)
                    }
                } catch (e) { }
            }

            const nfcePayload = {
                "infNFe": {
                    "versao": "4.00",
                    "ide": {
                        "cUF": "23", // Ceará (Ideal ser dinâmico pelo cadastro da loja)
                        "natOp": "VENDA AO CONSUMIDOR",
                        "mod": "65",
                        "serie": "1",
                        "nNF": numeroNota,
                        "dhEmi": new Date().toISOString(),
                        "tpNF": 1,
                        "idDest": 1,
                        "cMunFG": "2304400", // Fortaleza (Ideal ser dinâmico)
                        "tpImp": 4,
                        "tpEmis": 1,
                        "tpAmb": 2, // 2 = Homologação (Mude para 1 em Produção)
                        "finNFe": 1,
                        "indFinal": 1,
                        "indPres": 1,
                        "procEmi": 0,
                        "verProc": "Naxio 2.0"
                    },
                    "emit": {
                        "CNPJ": order.stores.cnpj.replace(/\D/g, ''),
                        "xNome": order.stores.nome_loja.substring(0, 60),
                        "enderEmit": {
                            "xLgr": "Rua Principal", // Ideal puxar do cadastro da loja
                            "nro": "100",
                            "xBairro": "Centro",
                            "cMun": "2304400",
                            "xMun": "Fortaleza",
                            "UF": "CE",
                            "CEP": "60000000"
                        },
                        "IE": "ISENTO",
                        "CRT": 1
                    },
                    "det": [{
                        "nItem": 1,
                        "prod": {
                            "cProd": order.products.codigo_cardapio || "ITEM01",
                            "cEAN": "SEM GTIN",
                            "xProd": order.products.nome,
                            "NCM": order.products.ncm || "21069090", // NCM Genérico se não tiver
                            "CFOP": order.products.cfop || "5102",
                            "uCom": "UN",
                            "qCom": 1,
                            "vUnCom": valorTotal.toFixed(2),
                            "vProd": valorTotal.toFixed(2),
                            "cEANTrib": "SEM GTIN",
                            "uTrib": "UN",
                            "qTrib": 1,
                            "vUnTrib": valorTotal.toFixed(2),
                            "indTot": 1
                        },
                        "imposto": {
                            "ICMS": { "ICMSSN102": { "orig": order.products.origem || 0, "CSOSN": "102" } },
                            "PIS": { "PISNT": { "CST": "07" } },
                            "COFINS": { "COFINSNT": { "CST": "07" } }
                        }
                    }],
                    "total": {
                        "ICMSTot": {
                            "vBC": "0.00", "vICMS": "0.00", "vICMSDeson": "0.00",
                            "vProd": valorTotal.toFixed(2),
                            "vNF": valorTotal.toFixed(2)
                        }
                    },
                    "transp": { "modFrete": 9 },
                    "pag": {
                        "detPag": [{ "tPag": tipoPagamento, "vPag": valorTotal.toFixed(2) }]
                    }
                }
            };

            // Adiciona CPF do cliente se tiver
            if (order.profiles && order.profiles.cpf) {
                nfcePayload.infNFe.dest = { "CPF": order.profiles.cpf.replace(/\D/g, '') };
            }

            // 3. Envia para Nuvem Fiscal
            const emissaoRes = await fetch('https://api.nuvemfiscal.com.br/nfe/nfce', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authData.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(nfcePayload)
            });

            const emissaoData = await emissaoRes.json();

            if (!emissaoRes.ok) {
                throw new Error(`Erro SEFAZ: ${JSON.stringify(emissaoData)}`);
            }

            // 4. Sucesso! Atualiza banco
            await _sb.from('stores')
                .update({ proximo_numero_nfce: numeroNota + 1 })
                .eq('id', order.stores.id);

            await _sb.from('orders')
                .update({
                    status_sefaz: 'autorizado',
                    chave_acesso: emissaoData.chave || emissaoData.id,
                    numero_nota: numeroNota,
                    xml_autorizado: emissaoData.xml || JSON.stringify(emissaoData)
                })
                .eq('id', order.id);

            return {
                success: true,
                chave: emissaoData.chave,
                pdf: emissaoData.url_pdf_danfe
            };

        } catch (e) {
            throw e;
        }
    },

    // =========================================================================
    // 🛠️ AÇÕES EXTRAS (CANCELAMENTO, CONTINGÊNCIA, XML)
    // =========================================================================

    cancelarNota: async (orderId, chaveAcesso) => {
        App.utils.customInput("Cancelar Nota Fiscal", "Motivo (Min. 15 caracteres)", async (motivo) => {
            if (!motivo || motivo.length < 15) return alert("Motivo muito curto. Descreva melhor (mínimo 15 letras).");

            App.utils.toast("Processando cancelamento...", "info");

            try {
                // Atualiza status no banco
                const { error } = await _sb.from('orders')
                    .update({
                        status_sefaz: 'cancelado',
                        motivo_cancelamento: motivo
                    })
                    .eq('id', orderId);

                if (error) throw error;

                alert("✅ Solicitação de cancelamento registrada!");
                Fiscal.openModal(); // Atualiza a lista

            } catch (e) {
                alert("Erro ao registrar cancelamento: " + e.message);
            }
        });
    },

    contingencia: async (orderId) => {
        if (!confirm("⚠️ Emitir em contingência?")) return;
        try {
            await _sb.from('orders').update({ status_sefaz: 'contingencia' }).eq('id', orderId);
            App.utils.toast("Nota marcada como contingência", "warning");
        } catch (e) {
            alert("Erro: " + e.message);
        }
    },

    exportarXMLs: async () => {
        // 1. Solicita datas no formato Brasileiro
        const hoje = new Date().toLocaleDateString('pt-BR'); // Ex: 30/01/2026
        const dataInicioBR = prompt("Data Início (DD/MM/AAAA):", hoje);
        const dataFimBR = prompt("Data Fim (DD/MM/AAAA):", hoje);

        if (!dataInicioBR || !dataFimBR) return;

        // Função para converter DD/MM/AAAA -> YYYY-MM-DD
        const converterDataISO = (dataStr) => {
            const [dia, mes, ano] = dataStr.split('/');
            return `${ano}-${mes}-${dia}`;
        };

        const isoInicio = converterDataISO(dataInicioBR);
        const isoFim = converterDataISO(dataFimBR);

        App.utils.toast("📦 Buscando e processando XMLs...", "info");

        // 2. Busca no banco (Coluna xml_arquivo é a correta para o BYTEA)
        const { data: notas, error } = await _sb.from('orders')
            .select('*')
            .eq('store_id', App.state.storeId)
            .not('xml_arquivo', 'is', null) // <--- CORREÇÃO: Nome da coluna atualizada
            .gte('created_at', `${isoInicio}T00:00:00`)
            .lte('created_at', `${isoFim}T23:59:59`);

        if (error) {
            console.error(error);
            return alert("Erro ao buscar notas: " + error.message);
        }

        if (!notas || notas.length === 0) {
            return alert("Nenhuma nota com XML encontrada neste período.");
        }

        // 3. Função para decodificar BYTEA (Hex -> String)
        const hexToUtf8 = (hex) => {
            if (!hex) return "";
            // Se não começar com \x, assume que já é texto (legado)
            if (typeof hex === 'string' && !hex.startsWith('\\x')) return hex;

            // Remove o prefixo \x
            const cleanHex = hex.toString().replace(/^\\x/, '');

            let str = '';
            for (let i = 0; i < cleanHex.length; i += 2) {
                str += String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16));
            }
            try {
                // Tenta decodificar caracteres especiais (acentos)
                return decodeURIComponent(escape(str));
            } catch (e) {
                return str;
            }
        };

        // Organiza por status
        const organizadas = { autorizadas: [], canceladas: [], rejeitadas: [] };

        notas.forEach(n => {
            let status = (n.status_sefaz || 'outros').toLowerCase();
            if (status.includes('autorizado')) status = 'autorizadas';
            else if (status.includes('cancelado')) status = 'canceladas';
            else status = 'rejeitadas';

            organizadas[status].push(n);
        });

        // 4. Cria o ZIP
        if (typeof JSZip === 'undefined') return alert("Erro: Biblioteca JSZip não carregada.");
        const zip = new JSZip();

        Object.keys(organizadas).forEach(statusKey => {
            if (organizadas[statusKey].length > 0) {
                const pasta = zip.folder(statusKey.toUpperCase());

                organizadas[statusKey].forEach(nota => {
                    // Decodifica o conteúdo do banco
                    const xmlConteudo = hexToUtf8(nota.xml_arquivo);
                    const nomeArquivo = `${nota.chave_acesso || nota.id}.xml`;

                    if (xmlConteudo) {
                        pasta.file(nomeArquivo, xmlConteudo);
                    }
                });
            }
        });

        // Gera o arquivo
        const content = await zip.generateAsync({ type: "blob" });
        // Nome do arquivo com datas formatadas (substitui / por -)
        const nomeZip = `XMLs_${dataInicioBR.replace(/\//g, '-')}_a_${dataFimBR.replace(/\//g, '-')}.zip`;

        saveAs(content, nomeZip);

        App.utils.toast(`✅ Download de ${notas.length} XMLs iniciado!`, "success");
    }
};
