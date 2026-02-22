require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library'); // Autenticação moderna
const credenciais = require('./credentials.json'); // Seu arquivo baixado do Google

// --- CONFIGURAÇÕES ---
const SUPABASE_URL = 'SUA_URL_SUPABASE';
const SUPABASE_KEY = 'SUA_KEY_SERVICE_ROLE'; // Use a Service Role para garantir acesso total
const SHEET_ID = 'ID_DA_SUA_PLANILHA'; // Fica na URL: docs.google.com/spreadsheets/d/ESSE_CODIGO_AQUI/edit

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sincronizarDiaAnterior() {
    console.log("🚀 Iniciando sincronização diária...");

    // 1. DEFINIR O PERÍODO (ONTEM)
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    
    // Formata para buscar no banco (Inicio e Fim do dia de ontem)
    const dataInicio = ontem.toISOString().split('T')[0] + 'T00:00:00';
    const dataFim = ontem.toISOString().split('T')[0] + 'T23:59:59';
    const dataFormatada = ontem.toLocaleDateString('pt-BR'); // Para escrever na planilha

    console.log(`📅 Buscando dados de: ${dataFormatada}`);

    // 2. BUSCAR DADOS NO SUPABASE
    // Somamos as comandas fechadas. Ajuste 'total_pago' se sua coluna tiver outro nome.
    const { data: vendas, error } = await supabase
        .from('comandas')
        .select('total_pago')
        .eq('status', 'fechada')
        .gte('created_at', dataInicio)
        .lte('created_at', dataFim);

    if (error) {
        console.error("❌ Erro ao buscar no Supabase:", error.message);
        return;
    }

    if (!vendas || vendas.length === 0) {
        console.log("ℹ️ Nenhuma venda encontrada ontem. Pulando...");
        // Opcional: Ainda assim gravar uma linha com zero? Se quiser, remova o return.
        return;
    }

    // 3. CALCULAR TOTAIS (Resumo)
    const qtdPedidos = vendas.length;
    const faturamentoTotal = vendas.reduce((acc, venda) => acc + (venda.total_pago || 0), 0);
    const ticketMedio = qtdPedidos > 0 ? (faturamentoTotal / qtdPedidos) : 0;

    console.log(`💰 Faturamento: R$ ${faturamentoTotal.toFixed(2)} | Pedidos: ${qtdPedidos}`);

    // 4. ENVIAR PARA O GOOGLE SHEETS
    try {
        // Configura autenticação
        const serviceAccountAuth = new JWT({
            email: credenciais.client_email,
            key: credenciais.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo(); // Carrega infos da planilha
        const sheet = doc.sheetsByIndex[0]; // Pega a primeira aba (Página 1)

        // Adiciona a linha
        await sheet.addRow({
            'Data': dataFormatada,
            'Faturamento': faturamentoTotal.toFixed(2), // Formato texto/número
            'Qtd Pedidos': qtdPedidos,
            'Ticket Médio': ticketMedio.toFixed(2)
        });

        console.log("✅ Dados salvos no Google Sheets com sucesso!");

    } catch (err) {
        console.error("❌ Erro ao conectar com Google Sheets:", err);
    }
}

sincronizarDiaAnterior();
