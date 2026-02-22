// ============================================================================
// 🛡️ VERSÃO V23.0: ROBUSTEZ OPERACIONAL & FISCAL (FINAL)
// ============================================================================
import { createClient } from '@supabase/supabase-js';

const SERIE_EMISSAO = 2;
const TIMEOUT_LIMITE = 25000; // Aumentado para 25s para evitar erros de rede lenta

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

function formatarDataSefaz() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
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
    if (t.includes('dinheiro') || t.includes('cash') || t.includes('especie')) return "01";
    return "01";
}

class NuvemFiscalService {
    constructor(clientId, clientSecret, ambiente) {
        this.baseUrl = 'https://api.nuvemfiscal.com.br';
        this.authUrl = 'https://auth.nuvemfiscal.com.br/oauth/token';
        this.creds = { clientId, clientSecret };
        this.ambiente = String(ambiente) === '1' ? 'producao' : 'homologacao';
    }
    async getToken() {
        const params = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.creds.clientId, client_secret: this.creds.clientSecret, scope: 'nfce' });
        const res = await fetch(this.authUrl, { method: 'POST', body: params });
        if (!res.ok) throw new Error("Erro de Autenticação na Nuvem Fiscal. Verifique suas credenciais Client ID/Secret.");
        return (await res.json()).access_token;
    }
    async apiCall(endpoint, method, token, body = null) {
        const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${this.baseUrl}${endpoint}`, opts);
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
    }
    async baixarPdfBinario(token, id) {
        try {
            const res = await fetch(`${this.baseUrl}/nfce/${id}/pdf`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) return `data:application/pdf;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
        } catch (e) { console.error("❌ Erro ao baixar PDF:", e); }
        return null;
    }
    async baixarXmlBinario(token, id) {
        try {
            const res = await fetch(`${this.baseUrl}/nfce/${id}/xml`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) return await res.text();
        } catch (e) { console.error("❌ Erro ao baixar XML:", e); }
        return null;
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
        const { order_id, store_id, cpf_nota, items_payload, payments_payload } = body;

        if (!order_id || !store_id) return res.status(400).json({ error: "IDs de Pedido ou Loja ausentes." });
        storeId = store_id;
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data: store, error: storeErr } = await supabase.from('stores').select('*').eq('id', store_id).single();
        const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('id', order_id).single();

        if (storeErr || !store) throw new Error("Loja não encontrada.");
        if (orderErr || !order) throw new Error("Pedido não encontrado.");

        // Validação de Dados Críticos da Loja
        if (!store.nuvem_client_id || !store.nuvem_client_secret) throw new Error("Loja sem credenciais da Nuvem Fiscal.");
        if (!store.cnpj) throw new Error("CNPJ da loja não cadastrado.");
        if (!store.cidade || !store.endereco) throw new Error("Endereço da loja incompleto.");

        const service = new NuvemFiscalService(store.nuvem_client_id, store.nuvem_client_secret, store.ambiente_emissao);
        const token = await service.getToken();

        // Gerenciamento de Numeração com Retry
        for (let i = 0; i < 5; i++) {
            const { data } = await supabase.from('stores').select('proximo_numero_nfce').eq('id', storeId).single();
            const n = data?.proximo_numero_nfce || 1;
            const { error } = await supabase.from('stores').update({ proximo_numero_nfce: n + 1 }).eq('id', storeId).eq('proximo_numero_nfce', n);
            if (!error) { numReservado = n; break; }
            await delay(300);
        }
        if (!numReservado) throw new Error("Falha ao reservar número de nota fiscal. Tente novamente.");

        // Preparação de Itens
        let listaItens = (Array.isArray(items_payload) && items_payload.length) ? items_payload : [{ nome: "CONSUMO", qtd: 1, price: order.total_pago }];
        const productIds = listaItens.map(i => i.id || i.product_id).filter(Boolean);

        let dbProducts = [];
        if (productIds.length) {
            const { data } = await supabase.from('products').select('id, ncm, nome').in('id', productIds);
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

            let vTotTrib = round2(vProd * 0.18);
            totalTrib = round2(totalTrib + vTotTrib);

            return {
                nItem: idx + 1,
                prod: {
                    cProd: `ITEM${idx + 1}`, cEAN: "SEM GTIN", xProd: limparString(dbProd.nome || i.nome || "PRODUTO", 2, 120),
                    NCM: ncmFinal, CFOP: "5102", uCom: "UN", qCom: qCom, vUnCom: vUnCom, vProd: vProd,
                    cEANTrib: "SEM GTIN", uTrib: "UN", qTrib: qCom, vUnTrib: vUnCom, indTot: 1
                },
                imposto: { vTotTrib: vTotTrib, ICMS: { ICMSSN102: { orig: 0, CSOSN: "102" } }, PIS: { PISNT: { CST: "07" } }, COFINS: { COFINSNT: { CST: "07" } } }
            };
        });

        // TAXA DE SERVIÇO
        const vNF_Original = round2(parseMonetario(order.total_pago));
        if (vNF_Original > somaTotalProdutos + 0.009) {
            const vTaxa = round2(vNF_Original - somaTotalProdutos);
            const vTotTribTaxa = round2(vTaxa * 0.18);
            totalTrib = round2(totalTrib + vTotTribTaxa);

            itensFiscais.push({
                nItem: itensFiscais.length + 1,
                prod: {
                    cProd: "TAXA", cEAN: "SEM GTIN", xProd: "TAXA SERVICO", NCM: "21069090", CFOP: "5102",
                    uCom: "UN", qCom: 1.0000, vUnCom: vTaxa, vProd: vTaxa, cEANTrib: "SEM GTIN", uTrib: "UN", qTrib: 1.0000, vUnTrib: vTaxa, indTot: 1
                },
                imposto: { vTotTrib: vTotTribTaxa, ICMS: { ICMSSN102: { orig: 0, CSOSN: "102" } }, PIS: { PISNT: { CST: "07" } }, COFINS: { COFINSNT: { CST: "07" } } }
            });
            somaTotalProdutos = round2(somaTotalProdutos + vTaxa);
        }

        const vNF_Final = somaTotalProdutos;

        // Pagamentos
        let pags = [];
        if (Array.isArray(payments_payload) && payments_payload.length) {
            pags = payments_payload.map(p => ({
                code: mapearMeioPagamento(p.code || p.tipo || p.metodo || p.payment_method),
                val: round2(parseMonetario(p.valor || p.amount || p.val))
            }));
        } else {
            pags.push({ code: mapearMeioPagamento(order.metodo_pagamento), val: vNF_Final });
        }

        const somaPags = round2(pags.reduce((acc, p) => acc + p.val, 0));
        const diffPags = round2(vNF_Final - somaPags);
        if (Math.abs(diffPags) > 0.001) {
            pags[0].val = round2(pags[0].val + diffPags);
        }

        const detPag = pags.map(p => {
            const o = { tPag: p.code, vPag: p.val };
            if (p.code !== '01') o.card = { tpIntegra: 2 };
            return o;
        });

        const payload = {
            ambiente: service.ambiente,
            referencia: `ORD_${order_id}_${numReservado}`,
            infNFe: {
                versao: "4.00",
                ide: { cUF: 23, natOp: "VENDA", mod: 65, serie: SERIE_EMISSAO, nNF: numReservado, dhEmi: formatarDataSefaz(), tpNF: 1, idDest: 1, cMunFG: store.ibge_cidade || 2310209, tpImp: 4, tpEmis: 1, tpAmb: service.ambiente === 'producao' ? 1 : 2, finNFe: 1, indFinal: 1, indPres: 1, procEmi: 0, verProc: "App", cNF: String(10000000 + Math.floor(Math.random() * 90000000)) },
                emit: {
                    CNPJ: store.cnpj.replace(/\D/g, ''), xNome: limparString(store.nome_loja, 2, 60),
                    enderEmit: {
                        xLgr: limparString(store.endereco, 2, 60), nro: store.numero || "SN", xBairro: limparString(store.bairro, 2, 60),
                        cMun: store.ibge_cidade || 2310209, xMun: limparString(store.cidade, 2, 60), UF: "CE", CEP: String(store.cep || "62685000").replace(/\D/g, '')
                    },
                    IE: store.inscricao_estadual || "ISENTO", CRT: 1
                },
                det: itensFiscais,
                total: {
                    ICMSTot: {
                        vBC: 0, vICMS: 0, vICMSDeson: 0, vFCP: 0, vBCST: 0, vST: 0, vFCPST: 0, vFCPSTRet: 0,
                        vProd: vNF_Final, vFrete: 0, vSeg: 0, vDesc: 0, vII: 0, vIPI: 0, vIPIDevol: 0, vPIS: 0, vCOFINS: 0, vOutro: 0,
                        vNF: vNF_Final, vTotTrib: totalTrib
                    }
                },
                pag: { detPag },
                transp: { modFrete: 9 },
                infAdic: { infCpl: `Trib Aprox R$: ${totalTrib} Federal/Estadual. Fonte: IBPT.` }
            }
        };
        // dest é obrigatório apenas se tiver CPF/CNPJ
        // SEFAZ NFC-e: Se não tem identificação, NÃO ENVIAR a tag dest.
        // O erro 'xNome is unexpected' acontece pq xNome só pode existir se tiver CPF/CNPJ ou idEstrangeiro na NuvemFiscal/SEFAZ v4.00
        if (cpf_nota && cpf_nota.length > 5) {
            payload.infNFe.dest = {
                CPF: cpf_nota.replace(/\D/g, ''),
                xNome: (body.nome_nota || 'CONSUMIDOR').substring(0, 60),
                indIEDest: 9
            };
        }

        // Chamada à API
        const jsonNuvem = await service.apiCall('/nfce', 'POST', token, payload);
        if (!jsonNuvem || jsonNuvem.error) return res.status(200).json({ sucesso: false, status: 'erro', message: jsonNuvem?.error?.message || "Erro na API da Nuvem Fiscal", raw: jsonNuvem });

        // Atualização inicial com Chave e ID
        await supabase.from('orders').update({ id_nuvem: jsonNuvem.id, status_sefaz: jsonNuvem.status, numero_nfce: numReservado, serie_nfce: SERIE_EMISSAO, chave_acesso: jsonNuvem.chave }).eq('id', order_id);

        // Polling de Status
        const start = Date.now();
        let statusFinal = jsonNuvem;
        while (Date.now() - start < TIMEOUT_LIMITE) {
            if (statusFinal.status === 'autorizado' || statusFinal.status === 'erro' || statusFinal.status === 'rejeitado') break;
            await delay(2500);
            statusFinal = await service.apiCall(`/nfce/${jsonNuvem.id}`, 'GET', token);
        }

        let pdf = statusFinal.url_pdf_danfe;
        let xmlHex = null;
        if (statusFinal.status === 'autorizado') {
            if (!pdf) pdf = await service.baixarPdfBinario(token, jsonNuvem.id);
            const xmlText = await service.baixarXmlBinario(token, jsonNuvem.id);
            if (xmlText) xmlHex = '\\x' + Buffer.from(xmlText, 'utf-8').toString('hex');
        }

        const motivo = statusFinal.autorizacao?.motivo_status || statusFinal.motivo_status || statusFinal.mensagem_sefaz || "Rejeição sem detalhes da SEFAZ";
        const updateData = { status_sefaz: statusFinal.status, motivo_sefaz: motivo, url_pdf: (pdf && pdf.startsWith('http')) ? pdf : null, xml_arquivo: xmlHex || null };

        // Atualização Final
        await supabase.from('orders').update(updateData).eq('id', order_id);

        return res.status(200).json({ sucesso: statusFinal.status === 'autorizado', status: statusFinal.status, pdf: updateData.url_pdf || pdf, xml_salvo: !!xmlHex, motivo_sefaz: motivo, raw: statusFinal });

    } catch (e) {
        console.error("❌ Erro Crítico no Handler:", e.message);
        return res.status(500).json({ sucesso: false, error: e.message });
    }
}
