import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { Resend } from 'resend';

// --- CONFIGURAÇÃO E BLINDAGEM ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; 
const RESEND_KEY = process.env.RESEND_API_KEY;

// Limites
const MAX_RAW_SIZE_PER_BATCH = 15 * 1024 * 1024; // 15MB
const MAX_FILES_PER_BATCH = 2000;
const MAX_STORE_RETRIES = 5; // Tenta a MESMA loja 5 vezes se der erro

if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_KEY) {
    console.error("❌ FATAL: Variáveis de ambiente ausentes.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

const resend = new Resend(RESEND_KEY);

// --- UTILITÁRIOS ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Retry simples para operações de rede (API calls)
async function retryNetworkOp(operation, context = "") {
    for (let i = 1; i <= 3; i++) {
        try {
            return await operation();
        } catch (error) {
            console.warn(`⚠️ [Rede] ${context} (Tentativa ${i}/3): ${error.message}`);
            if (i === 3) throw error;
            await delay(1000 * i);
        }
    }
}

// Busca Notas (Paginada)
async function fetchAllOrders(storeId, startStr, endStr) {
    let allOrders = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const batchData = await retryNetworkOp(async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('id, xml_autorizado, chave_acesso, status_sefaz') // ID incluído para rastreio
                .eq('store_id', storeId)
                .not('xml_autorizado', 'is', null)
                .gte('created_at', startStr)
                .lte('created_at', endStr)
                .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (error) throw new Error(error.message);
            return data;
        }, `Busca SQL Loja ${storeId}`);

        if (batchData && batchData.length > 0) {
            allOrders = allOrders.concat(batchData);
            if (batchData.length < pageSize) hasMore = false;
            else page++;
        } else {
            hasMore = false;
        }
    }
    return allOrders;
}

// Envia um lote específico
async function sendBatch(store, ordersBatch, batchIndex, totalBatches, mesRef) {
    const zip = new JSZip();
    const fAuto = zip.folder("Autorizadas");
    const fCanc = zip.folder("Canceladas");
    const fRej = zip.folder("Rejeitadas");
    const fCont = zip.folder("Contingencia");
    const fOutros = zip.folder("Outros");

    ordersBatch.forEach(o => {
        if (!o.xml_autorizado) return;
        // Sanitização de chave e nome
        let safeKey = (o.chave_acesso || `nfe_${Math.random().toString(36).substr(2,9)}`).replace(/[^a-z0-9]/gi, '_');
        const fname = `${safeKey}.xml`;
        
        // Verifica se o XML parece válido (mínimo de estrutura)
        if (!o.xml_autorizado.includes('<') || o.xml_autorizado.length < 50) {
            console.warn(`⚠️ XML inválido/corrompido ignorado. ID: ${o.id}`);
            return;
        }

        const st = o.status_sefaz ? o.status_sefaz.toLowerCase() : 'desconhecido';
        
        if (st.includes('autorizado')) fAuto.file(fname, o.xml_autorizado);
        else if (st.includes('cancelado')) fCanc.file(fname, o.xml_autorizado);
        else if (st.includes('rejeitado') || st.includes('erro')) fRej.file(fname, o.xml_autorizado);
        else if (st.includes('contingencia')) fCont.file(fname, o.xml_autorizado);
        else fOutros.file(fname, o.xml_autorizado);
    });

    const content = await zip.generateAsync({ type: "base64" });
    
    // Assunto e Nome Dinâmicos
    const subjectSuffix = totalBatches > 1 ? ` - Parte ${batchIndex}/${totalBatches}` : "";
    const fileNameSuffix = totalBatches > 1 ? `_Parte${batchIndex}` : "";

    await retryNetworkOp(async () => {
        await resend.emails.send({
            from: 'Naxio Fiscal <onboarding@resend.dev>',
            to: [store.email_contador],
            subject: `XMLs Fiscais - ${store.nome_loja} - Ref: ${mesRef}${subjectSuffix}`,
            html: `
                <h3>Olá, Contabilidade.</h3>
                <p>Segue em anexo o pacote de XMLs referente ao mês <strong>${mesRef}</strong>.</p>
                ${totalBatches > 1 ? `<p style="color:orange;">⚠️ Envio particionado: Parte ${batchIndex} de ${totalBatches}.</p>` : ''}
                <ul>
                    <li><strong>Loja:</strong> ${store.nome_loja}</li>
                    <li><strong>Qtd Notas:</strong> ${ordersBatch.length}</li>
                </ul>
                <p><em>Automação Naxio Software</em></p>
            `,
            attachments: [{
                filename: `Fiscal_${store.nome_loja.replace(/[^a-z0-9]/gi, '_')}_${mesRef.replace('/','-')}${fileNameSuffix}.zip`,
                content: content
            }]
        });
    }, `Envio Email ${store.nome_loja} PT ${batchIndex}`);
}

// --- LÓGICA DE PROCESSAMENTO DE UMA LOJA (COM RETRY INTERNO) ---
async function processStoreWithRetry(store, startStr, endStr, mesRef) {
    let attempt = 1;
    let lastError = null;

    while (attempt <= MAX_STORE_RETRIES) {
        try {
            if (attempt > 1) console.log(`🔄 [${store.nome_loja}] Tentativa de recuperação ${attempt}/${MAX_STORE_RETRIES}...`);

            // 1. Busca Dados
            const allOrders = await fetchAllOrders(store.id, startStr, endStr);
            
            if (!allOrders.length) {
                console.log(`   - Sem movimento.`);
                return true; // Sucesso (vazio)
            }

            console.log(`   - ${allOrders.length} notas carregadas.`);

            // 2. Fragmentação Inteligente (Chunking)
            let batches = [];
            let currentBatch = [];
            let currentBatchSize = 0;

            for (const order of allOrders) {
                if (!order.xml_autorizado) continue;
                
                // Se estivermos em retry (tentativa > 1), fazemos uma verificação extra de integridade
                if (attempt > 1) {
                    if (typeof order.xml_autorizado !== 'string') continue; // Pula tipos errados
                    // Pula XMLs suspeitos de estarem corrompidos/vazios
                    if (order.xml_autorizado.length < 20) continue; 
                }

                const itemSize = order.xml_autorizado.length;
                
                if ((currentBatchSize + itemSize > MAX_RAW_SIZE_PER_BATCH) || (currentBatch.length >= MAX_FILES_PER_BATCH)) {
                    batches.push(currentBatch);
                    currentBatch = [];
                    currentBatchSize = 0;
                }
                currentBatch.push(order);
                currentBatchSize += itemSize;
            }
            if (currentBatch.length > 0) batches.push(currentBatch);

            // 3. Envio Sequencial
            console.log(`   - Enviando ${batches.length} lote(s)...`);
            
            for (let i = 0; i < batches.length; i++) {
                await sendBatch(store, batches[i], i + 1, batches.length, mesRef);
                if (batches.length > 1) await delay(2000); // Pausa anti-spam
            }

            return true; // SUCESSO TOTAL! Sai do loop while.

        } catch (error) {
            lastError = error;
            console.error(`❌ [${store.nome_loja}] Falha na tentativa ${attempt}: ${error.message}`);
            
            // Estratégia de espera progressiva (Backoff)
            // Tenta esperar: 2s, 5s, 10s, 20s...
            await delay(Math.pow(2, attempt) * 1000); 
            attempt++;
        }
    }

    // Se saiu do while, falhou 5 vezes
    throw new Error(`Falha definitiva após ${MAX_STORE_RETRIES} tentativas. Último erro: ${lastError.message}`);
}

// --- MAIN ---
async function main() {
    console.log("🚀 Iniciando Rotina Fiscal BLINDADA (Auto-Healing)...");

    const now = new Date();
    const startObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endObj = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const startStr = startObj.toISOString();
    const endStr = endObj.toISOString();
    const mesRef = `${startObj.getMonth() + 1}/${startObj.getFullYear()}`;

    try {
        const { data: stores, error: errStore } = await supabase
            .from('stores')
            .select('id, nome_loja, email_contador')
            .neq('email_contador', null)
            .neq('email_contador', '');

        if (errStore) throw errStore;
        if (!stores?.length) { console.log("⚠️ Nenhuma loja configurada."); return; }

        let globalSuccess = 0;
        let globalErrors = 0;

        for (const store of stores) {
            console.log(`\n🏢 Iniciando: ${store.nome_loja}...`);
            
            try {
                // Chama a função que insiste na mesma loja
                await processStoreWithRetry(store, startStr, endStr, mesRef);
                
                console.log(`✅ ${store.nome_loja} FINALIZADA com sucesso.`);
                globalSuccess++;

            } catch (fatalStoreError) {
                // Só chega aqui se falhar 5 vezes seguidas
                console.error(`☠️ ABORTANDO ${store.nome_loja}: ${fatalStoreError.message}`);
                console.error(`➡️ Pulando para próxima loja para não travar o processo geral.`);
                globalErrors++;
            }
        }

        console.log(`\n🏁 RELATÓRIO FINAL: Sucessos: ${globalSuccess} | Falhas Definitivas: ${globalErrors}`);
        if (globalErrors > 0) process.exit(1);

    } catch (fatal) {
        console.error("☠️ ERRO SISTÊMICO (BANCO OU API OFF):", fatal);
        process.exit(1);
    }
}

main();
