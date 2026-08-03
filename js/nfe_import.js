if (typeof App !== 'undefined') {
    Object.assign(App, {
        nfe: {
            parsedItems: [],

            init: () => {
                const panel = document.querySelector('.painel-actions-grid');
                if (panel && !document.getElementById('btn-nfe-import')) {
                    const btn = document.createElement('button');
                    btn.id = 'btn-nfe-import';
                    btn.className = 'btn action-btn';
                    btn.style.backgroundColor = '#8b5cf6';
                    btn.style.color = '#fff';
                    btn.style.border = 'none';
                    btn.innerHTML = '<i class="ri-file-code-line"></i> Importar Entrada (XML/PDF)';
                    btn.onclick = App.nfe.openModal;
                    panel.appendChild(btn);
                }
            },

            openModal: () => {
                const html = `
                <div id="nfe-import-modal" class="modal-overlay" style="display:flex; z-index:10000; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);">
                    <div class="modal-content" style="max-width:800px; width:95%; border-radius:32px; background: #0f172a; color: #f8fafc; border: 1px solid #334155; box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.8); overflow:hidden;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 30px; border:none; display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:20px;">
                                <div style="background:rgba(255,255,255,0.15); padding:15px; border-radius:20px; border:1px solid rgba(255,255,255,0.2);">
                                    <i class="ri-upload-cloud-2-fill" style="font-size:2.2rem; color:white;"></i>
                                </div>
                                <div>
                                    <h3 style="margin:0; font-size:1.6rem; font-weight:800; color:white;">Importador de Notas</h3>
                                    <p style="margin:0; font-size:0.9rem; opacity:0.8; color:white;">Sincronize seu estoque via XML ou PDF</p>
                                </div>
                            </div>
                            <button class="btn btn-sm" onclick="document.getElementById('nfe-import-modal').remove()" style="background:rgba(0,0,0,0.2); border:none; color:white; width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">✕</button>
                        </div>

                        <div class="modal-body" style="padding:40px; max-height: 70vh; overflow-y: auto;">
                            <div id="nfe-upload-options" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                                <div style="background:#1e293b; padding:25px; border-radius:24px; border:1px solid #334155; display:flex; flex-direction:column; gap:12px;">
                                    <h5 style="margin:0; color:#f59e0b; font-size:1rem;"><i class="ri-key-fill"></i> Via Chave de Acesso</h5>
                                    <input type="text" id="nfe-key-input" maxlength="44" class="input-field" placeholder="44 dígitos..." style="background:#0f172a; border-radius:12px; border:1px solid #334155; color:white; padding:12px; font-family:'JetBrains Mono', monospace; text-align:center;">
                                    <button class="btn btn-primary btn-full" onclick="App.nfe.fetchByKey()" style="background:#f59e0b; border:none; padding:12px;">BUSCAR XML</button>
                                </div>

                                <div style="background:#1e293b; padding:25px; border-radius:24px; border:2px dashed #3b82f6; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;" onclick="document.getElementById('nfe-file-xml').click()">
                                    <i class="ri-file-code-line" style="font-size:3rem; color:#3b82f6; margin-bottom:10px;"></i>
                                    <strong style="color:white;">Carregar XML</strong>
                                    <input type="file" id="nfe-file-xml" accept=".xml" style="display:none" onchange="App.nfe.handleFile(this.files[0])">
                                </div>

                                <div style="background:#1e293b; padding:25px; border-radius:24px; border:2px dashed #ef4444; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;" onclick="document.getElementById('nfe-file-pdf').click()">
                                    <i class="ri-file-pdf-2-line" style="font-size:3rem; color:#ef4444; margin-bottom:10px;"></i>
                                    <strong style="color:white;">Ler DANFE (PDF)</strong>
                                    <input type="file" id="nfe-file-pdf" accept=".pdf" style="display:none" onchange="App.nfe.handlePdfFile(this.files[0])">
                                </div>
                            </div>

                            <div id="nfe-preview-area" style="display:none;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #334155; padding-bottom:15px;">
                                    <h4 style="margin:0; color:#f1f5f9;"><i class="ri-list-check-3"></i> Itens da Nota</h4>
                                    <span id="nfe-items-count" style="background:#3b82f6; padding:5px 12px; border-radius:10px; font-weight:800; font-size:0.8rem;">0 itens</span>
                                </div>
                                <div id="nfe-items-list" style="display:flex; flex-direction:column; gap:12px;"></div>
                                
                                <div style="margin-top:30px; display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                                    <button class="btn btn-secondary" onclick="App.nfe.openModal()" style="height:60px; border-radius:18px;">VOLTAR</button>
                                    <button class="btn btn-success" onclick="App.nfe.processImport()" style="height:60px; border-radius:18px; font-weight:800; font-size:1.1rem; background:#10b981; border:none; color:white;">
                                        <i class="ri-check-line"></i> FINALIZAR IMPORTAÇÃO
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
            },

            getNuvemToken: async () => {
                const s = App.state.currentStore;
                if (!s?.nuvem_client_id) return null;
                try {
                    const response = await fetch('https://auth.nuvemfiscal.com.br/oauth/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: s.nuvem_client_id, client_secret: s.nuvem_client_secret, scope: 'nfe' })
                    });
                    const d = await response.json(); return d.access_token;
                } catch (e) { return null; }
            },

            fetchByKey: async () => {
                const k = document.getElementById('nfe-key-input').value.replace(/\D/g, '');
                if (k.length !== 44) return NaxioUI.alert('Atenção', 'Chave inválida.', 'warning');
                App.utils.toast("Buscando XML...", "info");
                try {
                    const t = await App.nfe.getNuvemToken();
                    const res = await fetch(`https://api.nuvemfiscal.com.br/nfe/${k}/xml`, { headers: { 'Authorization': `Bearer ${t}` } });
                    if (res.ok) App.nfe.parseXML(await res.text());
                } catch (err) { NaxioUI.alert('Erro', 'Falha na busca.', 'error'); }
            },

            handleFile: (file) => {
                if (!file) return;
                const rd = new FileReader();
                rd.onload = (e) => App.nfe.parseXML(e.target.result);
                rd.readAsText(file);
            },

            handlePdfFile: async (file) => {
                if (!file) return;
                App.utils.toast("📄 Lendo PDF...", "info");
                try {
                    const buffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
                    let fullText = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        fullText += text.items.map(it => it.str).join(" ") + "\n";
                    }
                    App.nfe.parseDanfeText(fullText);
                } catch (e) { 
                    console.error("PDF ERROR:", e);
                    NaxioUI.alert('Erro Leitura', 'Falha ao processar o arquivo PDF.', 'error');
                }
            },

            parseXML: (text) => {
                try {
                    const xml = new DOMParser().parseFromString(text, "text/xml");
                    const dets = xml.getElementsByTagName("det");
                    App.nfe.parsedItems = [];
                    for (let det of dets) {
                        const prod = det.getElementsByTagName("prod")[0];
                        App.nfe.parsedItems.push({
                            nome: prod.getElementsByTagName("xProd")[0].textContent,
                            codigo: prod.getElementsByTagName("cProd")[0].textContent,
                            ean: prod.getElementsByTagName("cEAN")[0]?.textContent || "",
                            qtd: parseFloat(prod.getElementsByTagName("qCom")[0].textContent),
                            val: parseFloat(prod.getElementsByTagName("vUnCom")[0].textContent),
                            ncm: prod.getElementsByTagName("NCM")[0]?.textContent || ""
                        });
                    }
                    App.nfe.renderPreview();
                } catch (e) { /* ignore */ }
            },

            parseDanfeText: (text) => {
                console.log("PDF RAW SCANNING...");
                const items = [];
                
                // Pattern Fiscal Robusto (V3): 
                const regex = /(\d{8,14})\s+([\s\S]+?)\s+(\d{8})\s+(\d{3})\s+(\d{4})\s+([A-Z]{1,3})\s+([\d,.]+)\s+([\d,.]+)/g;
                
                let m;
                while ((m = regex.exec(text)) !== null) {
                    try {
                        const codigo = m[1];
                        let rawNome = m[2];

                        // Limpeza profunda de resíduos de página e tabelas
                        let nome = rawNome
                            .replace(/\(Codigo Barras:.*?\)/gi, "")
                            .replace(/DADOS DOS PRODUTOS[\s\S]+?ALÍQ\. %/gi, "")
                            .replace(/Página \d+ de \d+/gi, "")
                            .replace(/Documento Auxiliar[\s\S]+?Série 001/gi, "")
                            .replace(/Nº [\d.]+ Série [\d.]+/gi, "")
                            .replace(/NUMERAÇÃO|PESO BRUTO|PESO LÍQUIDO/gi, "") // Limpa metadados de transporte
                            .replace(/\n/g, " ")
                            .replace(/\s+/g, " ")
                            .trim();
                        
                        // Se o nome ainda for muito grande ou tiver resíduos de colunas
                        if (nome.length > 150) {
                            const words = nome.split(" ");
                            if (words.length > 20) nome = words.slice(-15).join(" ");
                        }

                        const ncm = m[3];
                        const conv = (s) => parseFloat(s.replace(/\./g, "").replace(",", "."));
                        const q = conv(m[7]);
                        const v = conv(m[8]);

                        if (!isNaN(q) && !isNaN(v) && q > 0) {
                            items.push({ 
                                codigo: codigo, 
                                nome: nome.toUpperCase(), 
                                ncm: ncm, 
                                qtd: q, 
                                val: v, 
                                ean: (codigo.length >= 12 && /^\d+$/.test(codigo)) ? codigo : "" 
                            });
                        }
                    } catch (e) { console.warn("Erro no match:", e); }
                }

                const clean = items.filter((v, i, a) => a.findIndex(t => t.nome === v.nome && t.qtd === v.qtd) === i);
                
                if (clean.length === 0) {
                    NaxioUI.alert('Erro de Leitura', 'Produtos não encontrados. Verifique se o PDF tem texto ou tente o XML.', 'warning');
                } else {
                    App.nfe.parsedItems = clean;
                    App.nfe.renderPreview();
                    App.utils.toast(`${clean.length} itens extraídos!`, "success");
                }
            },

            renderPreview: async () => {
                const opt = document.getElementById('nfe-upload-options'); if (opt) opt.style.display = 'none';
                const area = document.getElementById('nfe-preview-area');
                const list = document.getElementById('nfe-items-list');
                const count = document.getElementById('nfe-items-count');
                if (!area || !list) return;
                
                area.style.display = 'block';
                list.innerHTML = '<div style="padding:40px; text-align:center;"><i class="ri-loader-4-line ri-spin" style="font-size:2rem; color:#60a5fa;"></i><p>Analisando vínculos e preços...</p></div>';

                const { data: prods, error } = await _sb.from('products').select('*').eq('store_id', App.state.storeId);
                if (error || !prods) return list.innerHTML = `<div style="padding:20px; color:#f87171;">Erro de conexão.</div>`;

                count.innerText = `${App.nfe.parsedItems.length} itens encontrados`;
                
                const findMatch = (it) => {
                    const itFull = it.nome.toLowerCase();
                    const itEan = String(it.ean || "").trim();
                    const itCod = String(it.codigo || "").trim();
                    let m = prods.find(p => (p.codigo_barras && String(p.codigo_barras).trim() === itEan && itEan !== "") || (p.sku && String(p.sku).trim() === itCod && itCod !== "") || (p.codigo_cardapio && String(p.codigo_cardapio).trim() === itCod && itCod !== ""));
                    if (m) return { p: m, score: 1, type: 'CÓDIGO' };
                    const norm = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !['kers', 'importadora', 'kit', 'unidades', 'com', 'para'].includes(w));
                    const itWords = norm(it.nome);
                    const wordMatches = prods.map(p => {
                        const pWords = norm(p.nome);
                        if (pWords.length === 0) return { p: p, score: 0 };
                        const intersect = pWords.filter(w => itWords.includes(w));
                        return { p: p, score: intersect.length / pWords.length };
                    }).filter(res => res.score >= 0.7).sort((a,b) => b.score - a.score);
                    if (wordMatches.length > 0) return { p: wordMatches[0].p, score: wordMatches[0].score, type: 'KEYWORDS' };
                    return null;
                };

                let html = '';
                App.nfe.parsedItems.forEach((it, idx) => {
                    const match = it.forcedNew ? null : findMatch(it);
                    const suggestedPrice = (it.val * 1.5).toFixed(2);

                    html += `
                    <div class="nfe-item-row" data-idx="${idx}" style="background:rgba(255,255,255,0.03); padding:20px; border-radius:32px; border:1px solid ${match ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)'}; margin-bottom:15px; display:grid; grid-template-columns: 1fr auto; gap:20px; align-items:center;">
                        <div style="flex:1;">
                            <strong style="color:#f8fafc; display:block; font-size:1.05rem; margin-bottom:6px; line-height:1.4;">${it.nome}</strong>
                            
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                                ${match ? `
                                    <div style="background:rgba(16,185,129,0.1); color:#10b981; padding:6px 12px; border-radius:12px; font-size:0.75rem; font-weight:700; border:1px solid rgba(16,185,129,0.2);">
                                        <i class="ri-links-line"></i> Vinculado: ${match.p.nome}
                                    </div>
                                    <button class="btn btn-sm" onclick="App.nfe.toggleNew(${idx})" style="background:none; color:#94a3b8; text-decoration:underline; font-size:0.7rem;">Desvincular</button>
                                ` : `
                                    <div style="background:rgba(59,130,246,0.1); color:#3b82f6; padding:6px 12px; border-radius:12px; font-size:0.75rem; font-weight:700; border:1px solid rgba(59,130,246,0.2);">
                                        <i class="ri-add-circle-line"></i> Novo Cadastro
                                    </div>
                                    ${it.forcedNew ? `<button class="btn btn-sm" onclick="App.nfe.toggleNew(${idx})" style="background:none; color:#94a3b8; text-decoration:underline; font-size:0.7rem;">Restaurar</button>` : ''}
                                `}
                            </div>

                            <div style="display:flex; gap:15px; font-size:0.75rem; color:#64748b;">
                                <span>Ref: ${it.codigo}</span>
                                <span>Custo: R$ ${it.val.toFixed(2)}</span>
                                <span>Qtd: ${it.qtd}</span>
                            </div>
                        </div>

                        <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:24px; display:flex; flex-direction:column; gap:6px; min-width:170px; border:1px solid rgba(255,255,255,0.1);">
                            <label style="font-size:0.65rem; color:#94a3b8; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Preço Venda (R$)</label>
                            <div style="position:relative;">
                                <input type="number" step="0.01" class="nfe-sale-price" data-idx="${idx}" value="${suggestedPrice}" style="width:100%; height:45px; background:#0f172a; border:1px solid #334155; border-radius:14px; color:#10b981; padding:0 15px; font-weight:900; font-size:1.1rem; outline:none; text-align:center;">
                            </div>
                            <span style="font-size:0.6rem; color:#64748b; text-align:center;">Sugestão: +50% Lucro</span>
                        </div>
                    </div>`;
                });
                list.innerHTML = html;
            },

            toggleNew: (idx) => {
                App.nfe.parsedItems[idx].forcedNew = !App.nfe.parsedItems[idx].forcedNew;
                App.nfe.renderPreview();
            },

            processImport: async () => {
                const rows = document.querySelectorAll('.nfe-item-row');
                if (rows.length === 0) return;
                
                const confirmedItems = [];
                rows.forEach(row => {
                    const idx = row.dataset.idx;
                    const priceInput = row.querySelector('.nfe-sale-price');
                    const item = App.nfe.parsedItems[idx];
                    item.selectedSalePrice = parseFloat(priceInput.value) || (item.val * 1.5);
                    confirmedItems.push(item);
                });

                App.utils.toast("🚀 Processando produtos e estoque...", "info");
                const { data: prods } = await _sb.from('products').select('*').eq('store_id', App.state.storeId);
                
                const findMatch = (it) => {
                    if (it.forcedNew) return null;
                    let m = prods.find(p => (p.codigo_barras && String(p.codigo_barras).trim() === it.ean) || (p.sku && String(p.sku).trim() === it.codigo) || (p.codigo_cardapio && String(p.codigo_cardapio).trim() === it.codigo));
                    if (m) return m;
                    const norm = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !['kers', 'importadora', 'kit'].includes(w));
                    const itWords = norm(it.nome);
                    const candidates = prods.map(p => {
                        const pWords = norm(p.nome);
                        if (pWords.length === 0) return { p: p, score: 0 };
                        const intersect = pWords.filter(w => itWords.includes(w));
                        return { p: p, score: intersect.length / pWords.length };
                    }).filter(res => res.score >= 0.7).sort((a,b) => b.score - a.score);
                    return candidates.length > 0 ? candidates[0].p : null;
                };

                const stats = { m: 0, c: 0 };
                for (let it of confirmedItems) {
                    const mt = findMatch(it);
                    if (mt) {
                        await _sb.from('products').update({ 
                            estoque: (mt.estoque || 0) + it.qtd, 
                            preco_custo: it.val,
                            preco: it.selectedSalePrice
                        }).eq('id', mt.id); 
                        stats.m++;
                    } else {
                        await _sb.from('products').insert({
                            store_id: App.state.storeId, nome: it.nome, sku: it.codigo, ncm: it.ncm, codigo_cardapio: it.codigo,
                            estoque: it.qtd, preco_custo: it.val, preco: it.selectedSalePrice, categoria: 'Importados NFE', exibir_online: true, codigo_barras: it.ean || null
                        });
                        stats.c++;
                    }
                }
                NaxioUI.alert('✅ Entrada Concluída', `Estoque e preços atualizados!\n\n🔹 Produtos Vinculados: ${stats.m}\n🔹 Novos Cadastros: ${stats.c}`, 'success');
                document.getElementById('nfe-import-modal').remove();
                if (App.store.loadMyProducts) App.store.loadMyProducts();
            },

            lev: (s, t) => {
                const d = Array.from({length: s.length + 1}, () => Array(t.length+1).fill(0));
                for(let i=0; i<=s.length; i++) d[i][0] = i;
                for(let j=0; j<=t.length; j++) d[0][j] = j;
                for(let i=1; i<=s.length; i++) {
                    for(let j=1; j<=t.length; j++) {
                        const c = s[i-1] === t[j-1] ? 0 : 1;
                        d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+c);
                    }
                }
                return d[s.length][t.length];
            }
        }
    });
    setTimeout(() => App.nfe.init(), 1000);
}
