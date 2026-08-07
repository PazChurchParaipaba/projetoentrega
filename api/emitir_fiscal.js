// ============================================================================
// 🛡️ INTEGRAÇÃO GERANET NFe
// Substituiu Nuvem Fiscal. 
// O certificado digital HEX e a senha vêm da tabela 'stores' (certificado_hex e senha_certificado)
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- UTILITÁRIOS MATEMÁTICOS PRECISOS ---
const parseMonetario = (val) => {
    if (val === null || val === undefined) return 0.00;
    if (typeof val === 'number') return val;
    try {
        let str = String(val).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
        let n = parseFloat(str);
        return isNaN(n) ? 0.00 : n;
    } catch { return 0.00; }
};

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const formatQty = (v) => parseFloat(parseMonetario(v).toFixed(4));

function limparString(str, minLen = 2, maxLen = 120, defaultVal = "PRODUTO CONSUMO") {
    if (!str || typeof str !== 'string') return defaultVal;
    try {
        let limpa = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s\.\,\-\/]/g, "").trim().toUpperCase();
        if (limpa.length < minLen) limpa = (limpa + " " + defaultVal).substring(0, maxLen);
        return limpa.substring(0, maxLen);
    } catch (e) { return defaultVal; }
}

function sanitizarNCM(ncm) {
    if (!ncm) return "21069090";
    let limpo = String(ncm).replace(/\D/g, '');
    return limpo.length === 8 ? limpo : "21069090";
}

function formatarDataHora() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function mapearMeioPagamento(input) {
    const t = String(input || "").toLowerCase().trim();
    if (['01', '03', '04', '17', '10', '99', '05'].includes(t)) return t;
    if (t.includes('pix')) return "17";
    if (t.includes('debit') || t.includes('débito')) return "04";
    if (t.includes('credit') || t.includes('crédito') || t.includes('card')) return "03";
    if (t.includes('loja') || t.includes('fiado')) return "05";
    if (t.includes('aliment') || t.includes('vr')) return "10";
    if (t.includes('refeic')) return "11";
    if (t.includes('cartao') || t.includes('cartão')) return "03";
    if (t.includes('dinheiro') || t.includes('cash') || t.includes('especie')) return "01";
    return "01";
}

class GeranetService {
    constructor(apiKey, modelo = 65) {
        this.baseUrl = 'https://nfe.geranet.net/api/v1/nfe';
        this.apiKey = apiKey;
        this.modelo = modelo;
    }
    
    async emitirNota(payload) {
        const opts = { 
            method: 'POST', 
            headers: { 
                'Authorization': `Bearer ${this.apiKey}`, 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        };
        const res = await fetch(`${this.baseUrl}/emitir`, opts);
        const text = await res.text();
        try { 
            return { status: res.status, data: JSON.parse(text) }; 
        } catch { 
            return { status: res.status, data: text }; 
        }
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    let supabase = null, storeId = null, numReservado = null;

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { order_id, store_id, cpf_nota, items_payload, payments_payload, modelo, natureza_operacao, info_adicional } = body;
        
        if (!order_id || !store_id) return res.status(400).json({ error: "IDs de Pedido ou Loja ausentes." });
        storeId = store_id;
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data: store, error: storeErr } = await supabase.from('stores').select('*').eq('id', store_id).single();
        const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('id', order_id).single();

        if (storeErr || !store) throw new Error("Loja não encontrada.");
        if (orderErr || !order) throw new Error("Pedido não encontrado.");

        if (!store.cnpj) throw new Error("CNPJ da loja não cadastrado.");
        if (!store.cidade || !store.endereco) throw new Error("Endereço da loja incompleto.");

        const apiKeyGeranet = process.env.GERANET_API_KEY || "gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg";
        
        const modeloNota = modelo === 55 ? 55 : 65;
        const SERIE_EMISSAO = modeloNota === 55 ? 1 : 2;

        const service = new GeranetService(apiKeyGeranet, modeloNota);

        let columnName = (modeloNota === 55) ? 'proximo_numero_nfe' : 'proximo_numero_nfce';

        for (let i = 0; i < 5; i++) {
            let n = null;
            try {
                const { data, error: selError } = await supabase.from('stores').select(columnName).eq('id', storeId).single();
                if (!selError && data && data[columnName] !== undefined && data[columnName] !== null) {
                    n = data[columnName] || 1;
                    const updateObj = {};
                    updateObj[columnName] = n + 1;
                    const { error } = await supabase.from('stores').update(updateObj).eq('id', storeId).eq(columnName, n);
                    if (!error) { numReservado = n; break; }
                } else {
                    if (modeloNota === 55) {
                        const { data: maxOrder } = await supabase.from('orders')
                            .select('numero_nfce')
                            .eq('store_id', storeId)
                            .eq('serie_nfce', 1)
                            .order('numero_nfce', { ascending: false })
                            .limit(1);
                        n = (maxOrder && maxOrder[0] && maxOrder[0].numero_nfce) ? (maxOrder[0].numero_nfce + 1) : 1;
                        numReservado = n;
                        break;
                    }
                }
            } catch (e) {
                // Ignore e tenta dnv
            }
            await delay(300);
        }
        if (!numReservado) {
            numReservado = Math.floor((Date.now() % 10000000)) || 1;
        }

        let parsedObs = null;
        try {
            if (order.observacao) parsedObs = JSON.parse(order.observacao);
        } catch (e) {}

        let fallbackItems = [];
        if (parsedObs) {
            if (Array.isArray(parsedObs.items) && parsedObs.items.length) fallbackItems = parsedObs.items;
            else if (Array.isArray(parsedObs.itens) && parsedObs.itens.length) fallbackItems = parsedObs.itens;
            else if (Array.isArray(parsedObs) && parsedObs.length) fallbackItems = parsedObs;
        }

        let listaItens = (Array.isArray(items_payload) && items_payload.length) ? items_payload : (fallbackItems.length ? fallbackItems : [{ nome: "CONSUMO", qtd: 1, price: order.total_pago }]);
        const productIds = listaItens.map(i => i.id || i.product_id).filter(Boolean);

        let dbProducts = [];
        if (productIds.length) {
            const { data } = await supabase.from('products').select('id, ncm, nome, cfop, origem, aliquota_cbs, aliquota_ibs').in('id', productIds);
            dbProducts = data || [];
        }

        let somaTotalProdutos = 0;
        let totalTrib = 0;

        const itensFiscais = listaItens.map((i, idx) => {
            const dbProd = dbProducts.find(p => String(p.id) === String(i.id || i.product_id)) || {};
            const ncmFinal = sanitizarNCM(i.ncm || dbProd.ncm);

            let vUnCom = round2(parseMonetario(i.price || i.preco || i.valor || i.unit_price || 0));
            let qCom = formatQty(i.qtd || i.quantidade || 1);
            if (qCom <= 0) qCom = 1;

            let vProd = round2(qCom * vUnCom);
            somaTotalProdutos = round2(somaTotalProdutos + vProd);

            const aliqCBS = parseFloat(dbProd?.aliquota_cbs || store?.aliquota_cbs_loja || 0.0090);
            const aliqIBS = parseFloat(dbProd?.aliquota_ibs || store?.aliquota_ibs_loja || 0.0010);
            const aliqTotal = round2(aliqCBS + aliqIBS); 
            let vTotTrib = round2(vProd * aliqTotal);
            totalTrib = round2(totalTrib + vTotTrib);

            return {
                "numeroPedido": "",
                "numeroItemPedido": "",
                "desconto": "0.00",
                "frete": "0.00",
                "seguro": "0.00",
                "outro": "0.00",
                "quantidade": qCom.toFixed(4),
                "valorUnitario": vUnCom.toFixed(4),
                "valorTotal": vProd.toFixed(2),
                "informacaoAdicional": "",
                "ncmProduto": ncmFinal,
                "cest": "",
                "tipoItem": "00",
                "eanProduto": "SEM GTIN",
                "codigoProduto": String(idx + 1),
                "nomeProduto": limparString(dbProd.nome || i.nome || "PRODUTO", 2, 120),
                "cfop": dbProd?.cfop || (modeloNota === 55 ? "6102" : "5102"),
                "unidadeMedidaProduto": "UN",
                "origemProduto": String(dbProd?.origem || 0),
                "icmsCst": "102",
                "pisCst": "07",
                "pisAliquota": "0.00",
                "cofinsCst": "07",
                "cofinsAliquota": "0.00",
                "cstIbscbs": "000",
                "cClassTribIbscbs": "000001",
                "aliquotaIbsUf": "0.1000",
                "aliquotaIbsMun": "0.0000",
                "aliquotaCbs": "0.9000",
                "baseCalculoIbscbs": vProd.toFixed(2),
                "valorIbsUf": (vProd * 0.0010).toFixed(2),
                "valorIbsMun": "0.00",
                "valorCbs": (vProd * 0.0090).toFixed(2),
                "ibscbsManual": "0",
                "federaisRetido": "nao",
                "aliquotaInss": "0.0000",
                "aliquotaIrrf": "0.0000",
                "aliquotaCsll": "0.0000"
            };
        });

        const vNF_Original = round2(parseMonetario(order.total_pago)) || somaTotalProdutos;
        if (vNF_Original > somaTotalProdutos + 0.009) {
            const vTaxa = round2(vNF_Original - somaTotalProdutos);
            
            itensFiscais.push({
                "numeroPedido": "",
                "numeroItemPedido": "",
                "desconto": "0.00",
                "frete": "0.00",
                "seguro": "0.00",
                "outro": "0.00",
                "quantidade": "1.0000",
                "valorUnitario": vTaxa.toFixed(4),
                "valorTotal": vTaxa.toFixed(2),
                "informacaoAdicional": "",
                "ncmProduto": "21069090",
                "cest": "",
                "tipoItem": "00",
                "eanProduto": "SEM GTIN",
                "codigoProduto": String(itensFiscais.length + 1),
                "nomeProduto": "TAXA SERVICO",
                "cfop": modeloNota === 55 ? "6102" : "5102",
                "unidadeMedidaProduto": "UN",
                "origemProduto": "0",
                "icmsCst": "102",
                "pisCst": "07",
                "pisAliquota": "0.00",
                "cofinsCst": "07",
                "cofinsAliquota": "0.00",
                "cstIbscbs": "000",
                "cClassTribIbscbs": "000001",
                "aliquotaIbsUf": "0.1000",
                "aliquotaIbsMun": "0.0000",
                "aliquotaCbs": "0.9000",
                "baseCalculoIbscbs": vTaxa.toFixed(2),
                "valorIbsUf": (vTaxa * 0.0010).toFixed(2),
                "valorIbsMun": "0.00",
                "valorCbs": (vTaxa * 0.0090).toFixed(2),
                "ibscbsManual": "0",
                "federaisRetido": "nao",
                "aliquotaInss": "0.0000",
                "aliquotaIrrf": "0.0000",
                "aliquotaCsll": "0.0000"
            });
            somaTotalProdutos = round2(somaTotalProdutos + vTaxa);
        }

        const vNF_Final = somaTotalProdutos;

function mapearBandeira(b) {
    const t = String(b || "").toUpperCase().trim();
    if (t.includes('VISA')) return '01';
    if (t.includes('MASTER')) return '02';
    if (t.includes('AMEX')) return '03';
    if (t.includes('SORO')) return '04';
    if (t.includes('DINER')) return '05';
    if (t.includes('ELO')) return '06';
    if (t.includes('HIPER')) return '07';
    if (t.includes('AURA')) return '08';
    if (t.includes('CABAL')) return '09';
    return '99';
}

        let pags = [];
        if (Array.isArray(payments_payload) && payments_payload.length) {
            pags = payments_payload.map(p => ({
                code: mapearMeioPagamento(p.code || p.tipo || p.metodo || p.payment_method || p.method),
                val: round2(parseMonetario(p.valor || p.amount || p.val)),
                cnpj: p.cnpj || p.cnpjCredenciadora || "",
                bandeira: mapearBandeira(p.bandeira || p.tipoBandeira),
                aut: p.aut || p.autorizacao || p.nsu || ""
            }));
        } else {


            if (parsedObs && Array.isArray(parsedObs.pagamentos) && parsedObs.pagamentos.length) {
                pags = parsedObs.pagamentos.map(p => ({
                    code: mapearMeioPagamento(p.code || p.tipo || p.metodo || p.payment_method || p.method),
                    val: round2(parseMonetario(p.valor || p.amount || p.val)),
                    cnpj: p.cnpj || "",
                    bandeira: mapearBandeira(p.bandeira),
                    aut: p.aut || p.nsu || ""
                }));
            } else {
                pags.push({ code: mapearMeioPagamento(order.metodo_pagamento), val: vNF_Final, cnpj: "", bandeira: "99", aut: "" });
            }
        }

        const somaPags = round2(pags.reduce((acc, p) => acc + p.val, 0));
        const diffPags = round2(vNF_Final - somaPags);
        if (Math.abs(diffPags) > 0.001) {
            pags[0].val = round2(pags[0].val + diffPags);
        }

        const detPag = pags.map(p => {
            const isCartao = ['03', '04'].includes(p.code);
            const obj = {
                "tipo": p.code,
                "valor": p.val,
                "indicadorPagamento": "0" 
            };
            
            if (isCartao) {
                obj.cartao = {
                    "tipoIntegracao": "1"
                };
                
                const cnpjCred = p.cnpj ? String(p.cnpj).replace(/\D/g, '') : "";
                if (cnpjCred.length === 14) {
                    obj.cartao.cnpjCredenciadora = cnpjCred;
                }
                
                obj.cartao.tipoBandeira = p.bandeira || "99";
                if (p.aut) {
                    obj.cartao.autorizacao = String(p.aut).trim().substring(0, 20);
                }
            }
            return obj;
        });

        const cepEmitente = String(store.cep || '62685000').replace(/\D/g, '').padEnd(8, '0').substring(0, 8);
        const ufEmitente = String(store.uf || store.estado || 'CE').replace(/[^A-Z]/g, '').toUpperCase().substring(0, 2) || 'CE';
        
        let textoInfCpl = `${info_adicional ? String(info_adicional).trim() + ' - ' : ''}Trib Aprox R$: ${totalTrib.toFixed(2)}. Lei 12.741/12. Reforma Tributaria 2026.`;
        textoInfCpl = textoInfCpl.replace(/[^\x20-\xFF]/g, ' ').replace(/\s+/g, ' ').trim();

        const nfe = {
            "empresa": {
                "cnpj": store.cnpj.replace(/\D/g, ''),
                "inscricaoEstadual": String(store.inscricao_estadual || "").replace(/\D/g, ''),
                "razaoSocial": limparString(store.nome_loja, 2, 60),
                "nomeFantasia": limparString(store.nome_loja, 2, 60),
                "telefone": String(store.telefone || "").replace(/\D/g, ''),
                "email": store.email || "contato@loja.com.br",
                "logradouro": limparString(store.endereco, 2, 60),
                "numero": String(store.numero || 'SN').trim().replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase() || 'SN',
                "complemento": "",
                "bairro": limparString(store.bairro || 'CENTRO', 2, 60),
                "municipio": limparString(store.cidade, 2, 60),
                "codigoMunicipio": String(store.ibge_cidade || 2310209),
                "uf": ufEmitente,
                "cep": cepEmitente,
                "codigoRegimeTributario": (store.regime_cbs_ibs === 2 || store.regime_cbs_ibs === 3) ? "3" : "1",
                "tipoAtividade": "3", 
                "serie": String(SERIE_EMISSAO),
                "idCodigoSegurancaContribuinte": store.csc_id || "",
                "codigoSegurancaContribuinte": store.csc_token || "",
                "contingencia": "nao",
                "informacaoComplementar": ""
            },
            "cliente": {},
            "indicativoIntermediador": "0",
            "numeroNotaEmitir": String(numReservado),
            "codigoNumerico": String(10000000 + Math.floor(Math.random() * 89999999)),
            "dataSaida": formatarDataHora(),
            "dataEmissao": formatarDataHora(),
            "modelo": String(modeloNota),
            "ambiente": String(store.ambiente_emissao === 1 ? 1 : 2),
            "tipo": "1", 
            "frete": "9", 
            "finalidade": "1", 
            "informacaoComplementar": textoInfCpl.substring(0, 5000),
            "notaFiscalReferencia": "",
            "naturezaOperacao": natureza_operacao ? limparString(natureza_operacao, 2, 60) : "Venda de Produtos ou Servicos",
            "numeroVenda": String(order_id),
            "pagamento": {
                "troco": 0,
                "detalhamento": detPag
            },
            "itens": itensFiscais
        };

        if (modeloNota === 55) {
            const docLimpo = String(cpf_nota || '').replace(/\D/g, '');
            const nomeDestinatario = limparString(body.nome_nota || 'CONSUMIDOR FINAL', 2, 60);

            if (!docLimpo) {
                throw new Error("Para emitir NF-e (Modelo 55), o CPF ou CNPJ do destinatário é obrigatório.");
            }

            let logradouro = "RUA DO CONSUMIDOR";
            let numero = "SN";
            let bairro = "CENTRO";
            let municipio = store.cidade || "ITAPIPOCA";
            let uf = store.uf || store.estado || "CE";
            let cep = store.cep || "62685000";
            let codMun = store.ibge_cidade || 2310209;

            if (order.endereco_destino && order.endereco_destino.length > 5) {
                const addrParts = order.endereco_destino.split(',');
                if (addrParts.length > 0) logradouro = limparString(addrParts[0], 2, 60);
                if (addrParts.length > 1) numero = String(addrParts[1]).trim().substring(0, 10) || "SN";
                if (addrParts.length > 2) bairro = limparString(addrParts[2], 2, 60);
                const cepMatch = order.endereco_destino.match(/\d{5}-?\d{3}/);
                if (cepMatch) cep = cepMatch[0].replace(/\D/g, '');
            }

            nfe.cliente = {
                "cnpj": docLimpo.length === 14 ? docLimpo : "",
                "cpf": docLimpo.length === 11 ? docLimpo : "",
                "inscricaoEstadual": "",
                "razaoSocial": nomeDestinatario,
                "nomeFantasia": "",
                "consumidorFinal": "1",
                "indicadorIEdestinatario": "9",
                "telefone": "",
                "email": "",
                "logradouro": logradouro,
                "numero": numero,
                "complemento": "",
                "bairro": bairro,
                "municipio": limparString(municipio, 2, 60),
                "codigoMunicipio": String(codMun),
                "codigoPais": "1058",
                "nomePais": "Brasil",
                "uf": uf.toUpperCase(),
                "cep": cep.padEnd(8, '0').substring(0, 8)
            };
        } else {
            nfe.cliente = {
                "consumidorFinal": "1",
                "indicadorIEdestinatario": "9"
            };
            if (cpf_nota && cpf_nota.length > 5) {
                const docLimpo = String(cpf_nota).replace(/\D/g, '');
                const nomeDestinatario = limparString(body.nome_nota || 'CONSUMIDOR', 2, 60);

                nfe.cliente.cnpj = docLimpo.length === 14 ? docLimpo : "";
                nfe.cliente.cpf = docLimpo.length === 11 ? docLimpo : "";
                nfe.cliente.razaoSocial = nomeDestinatario;
            }
        }

        const payload = {
            "acao": "emitir",
            "modeloDocumento": "nfe",
            "certificadoDigital": store.certificado_hex || "",
            "senhaCertificadoDigital": store.senha_certificado || "",
            "ambiente": String(store.ambiente_emissao === 1 ? 1 : 2),
            "modelo": String(modeloNota),
            "ufEmitente": ufEmitente,
            "nfe": nfe
        };

        if (!payload.certificadoDigital || !payload.senhaCertificadoDigital) {
            throw new Error("O certificado digital (hexadecimal) ou a senha não foram encontrados no cadastro da loja (tabela 'stores'). Configure no banco.");
        }

        console.log(`📤 Payload enviado à Geranet (${modeloNota === 55 ? 'NF-e' : 'NFC-e'}):`, JSON.stringify(payload, null, 2));
        
        const geranetRes = await service.emitirNota(payload);
        const jsonGeranet = geranetRes.data;
        
        console.log('📥 Resposta Geranet:', JSON.stringify(jsonGeranet, null, 2));

        // A API Geranet pode retornar jsonGeranet vazio ou sucesso=false
        if (geranetRes.status >= 400 || !jsonGeranet || jsonGeranet.sucesso === false) {
            let errMsgs = jsonGeranet?.mensagem || "Erro na API da Geranet";
            if (jsonGeranet?.erros && Array.isArray(jsonGeranet.erros)) {
                errMsgs += "\nDetalhamento: " + jsonGeranet.erros.join("; ");
            } else if (jsonGeranet?.erros) {
                errMsgs += "\nDetalhamento: " + JSON.stringify(jsonGeranet.erros);
            }
            if (jsonGeranet?.errosDeValidacao) {
                errMsgs += "\nValidação: " + JSON.stringify(jsonGeranet.errosDeValidacao);
            }
            return res.status(200).json({ sucesso: false, status: 'erro', message: errMsgs, raw: jsonGeranet });
        }

        const statusNota = jsonGeranet.status || 'autorizado';
        const chaveAcesso = jsonGeranet.chaveAcesso || jsonGeranet.chave_acesso || '';
        const pdf = jsonGeranet.pdf || jsonGeranet.linkPdf || jsonGeranet.url_pdf_danfe;
        const idGeranet = jsonGeranet.id || ''; 
        
        const updateData = { 
            id_nuvem: idGeranet, 
            status_sefaz: statusNota, 
            numero_nfce: numReservado, 
            serie_nfce: SERIE_EMISSAO, 
            chave_acesso: chaveAcesso,
            url_pdf: pdf,
            motivo_sefaz: jsonGeranet.mensagem || "Emitido com Sucesso (Geranet)"
        };

        await supabase.from('orders').update(updateData).eq('id', order_id);

        return res.status(200).json({
            sucesso: true,
            status: statusNota,
            pdf: pdf,
            chave: chaveAcesso,
            xml_salvo: !!jsonGeranet.xml,
            motivo_sefaz: updateData.motivo_sefaz,
            raw: jsonGeranet
        });

    } catch (e) {
        console.error("❌ Erro Crítico no Handler (Geranet):", e.message);
        return res.status(500).json({ sucesso: false, error: e.message });
    }
}
