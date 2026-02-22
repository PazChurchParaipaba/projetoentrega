if (typeof App !== 'undefined') {
    Object.assign(App, {
        nfe: {
            init: () => {
                // Add button to Products Panel if exists
                const panel = document.querySelector('.painel-actions-grid');
                if (panel && !document.getElementById('btn-nfe-import')) {
                    const btn = document.createElement('button');
                    btn.id = 'btn-nfe-import';
                    btn.className = 'btn action-btn';
                    btn.style.backgroundColor = '#8b5cf6'; // Violet
                    btn.style.color = '#fff';
                    btn.style.border = 'none';
                    btn.innerHTML = '<i class="ri-file-code-line"></i> Importar XML (NFE)';
                    btn.onclick = App.nfe.openModal;
                    panel.appendChild(btn);
                }
            },

            openModal: () => {
                const html = `
                <div id="nfe-import-modal" class="modal-overlay" style="display:flex; z-index:10000;">
                    <div class="modal-content" style="max-width:600px;">
                        <div class="modal-header">
                            <h3>📄 Importar XML de Entrada</h3>
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('nfe-import-modal').remove()">Fechar</button>
                        </div>
                        <div class="modal-body">
                            <div style="margin-bottom:15px; text-align:center;">
                                <label style="margin-right:15px;"><input type="radio" name="nfe-type" value="entrada" checked> Entrada (Compra)</label>
                                <label><input type="radio" name="nfe-type" value="saida"> Saída (Venda)</label>
                            </div>
                            <div style="background:#f8fafc; padding:20px; border:2px dashed #cbd5e1; border-radius:8px; text-align:center; cursor:pointer;" onclick="document.getElementById('nfe-file-input').click()">
                                <i class="ri-upload-cloud-2-line" style="font-size:3rem; color:#94a3b8;"></i>
                                <p>Clique para selecionar o XML da Nota</p>
                                <input type="file" id="nfe-file-input" accept=".xml" style="display:none;" onchange="App.nfe.parseFile(this)">
                            </div>
                            <div id="nfe-preview" style="margin-top:20px; max-height:300px; overflow-y:auto; display:none;">
                                <h5>Itens Identificados:</h5>
                                <div id="nfe-items-list"></div>
                                <button class="btn btn-success btn-full" style="margin-top:10px;" onclick="App.nfe.processImport()">Confirmar Entrada no Estoque</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                document.body.insertAdjacentHTML('beforeend', html);
            },

            parsedItems: [],

            parseFile: (input) => {
                const file = input.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const text = e.target.result;
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(text, "text/xml");

                        const items = xmlDoc.getElementsByTagName("det");
                        App.nfe.parsedItems = [];
                        const list = document.getElementById('nfe-items-list');
                        list.innerHTML = '';

                        if (items.length === 0) return alert("Nenhum item encontrado no XML.");

                        for (let i = 0; i < items.length; i++) {
                            const prod = items[i].getElementsByTagName("prod")[0];
                            const nome = prod.getElementsByTagName("xProd")[0].textContent;
                            const codigo = prod.getElementsByTagName("cProd")[0].textContent;
                            const ean = prod.getElementsByTagName("cEAN")[0]?.textContent || "";
                            const qtd = parseFloat(prod.getElementsByTagName("qCom")[0].textContent);
                            const val = parseFloat(prod.getElementsByTagName("vUnCom")[0].textContent);

                            App.nfe.parsedItems.push({ nome, codigo, ean, qtd, val });

                            list.innerHTML += `
                                <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee; font-size:0.9rem;">
                                    <div><strong>${nome}</strong><br><small>Cod: ${codigo}</small></div>
                                    <div style="text-align:right;"><strong>+${qtd} un</strong><br>R$ ${val.toFixed(2)}</div>
                                </div>`;
                        }

                        document.getElementById('nfe-preview').style.display = 'block';

                    } catch (err) {
                        console.error(err);
                        alert("Erro ao ler XML: " + err.message);
                    }
                };
                reader.readAsText(file);
            },

            processImport: async () => {
                const items = App.nfe.parsedItems;
                const type = document.querySelector('input[name="nfe-type"]:checked').value;
                const multiplier = type === 'entrada' ? 1 : -1;

                let added = 0;
                let created = 0;

                App.utils.toast(`Processando ${type.toUpperCase()}...`, "info");

                for (let item of items) {
                    // Tenta achar produto pelo código (cProd ou cEAN)
                    let { data: prod } = await _sb.from('products')
                        .select('id, estoque, nome')
                        .eq('store_id', App.state.storeId)
                        .or(`codigo_cardapio.eq.${item.codigo},codigo_cardapio.eq.${item.ean},cod_fornecedor.eq.${item.codigo}`)
                        .maybeSingle();

                    if (prod) {
                        // Atualiza estoque
                        await _sb.from('products').update({
                            estoque: (prod.estoque || 0) + (item.qtd * multiplier),
                            // Se for entrada, atualiza custo. Se for saída, não mexe no custo.
                            ...(type === 'entrada' ? { preco_custo: item.val } : {})
                        }).eq('id', prod.id);
                        added++;
                    } else {
                        if (type === 'saida') {
                            console.warn(`Produto ${item.nome} não encontrado para saída.`);
                            continue;
                        }

                        if (confirm(`Produto "${item.nome}" não encontrado. Cadastrar automaticamente?`)) {
                            await _sb.from('products').insert({
                                store_id: App.state.storeId,
                                nome: item.nome,
                                codigo_cardapio: item.ean || item.codigo,
                                cod_fornecedor: item.codigo,
                                preco: item.val * 1.5, // Margem padrão 50%
                                preco_custo: item.val,
                                estoque: item.qtd,
                                categoria: 'Autopeças', // Padrão
                                subcategoria: 'Peças'
                            });
                            created++;
                        }
                    }
                }

                alert(`Importação Concluída (${type.toUpperCase()})!\nItens Atualizados: ${added}\nItens Criados: ${created}`);
                document.getElementById('nfe-import-modal').remove();
                if (App.store && App.store.loadMyProducts) App.store.loadMyProducts();
            }
        }
    });

    // Auto-init if autopecas is active
    setTimeout(() => {
        if (App.nfe && App.autopecas) App.nfe.init();
    }, 2500);
}
