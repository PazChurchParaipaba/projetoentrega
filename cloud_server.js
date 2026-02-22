// cloud_server.js
// SERVIDOR NAXIO (Modo Raiz / Flat Structure)

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // <--- OBRIGATÓRIO

require('dotenv').config();

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://groezaseypdbpgymgpvo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ===============================================================
// 1. SERVIR O SITE (O QUE FALTAVA)
// ===============================================================

// Libera o acesso às pastas que estão NA MESMA PASTA do servidor
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(__dirname, 'img')));
// Se tiver outras pastas (ex: 'assets'), adicione aqui:
// app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Rota Principal: Quando entrar no site, entrega o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===============================================================
// 2. API (BACK-END)
// ===============================================================

app.post('/api/orders', async (req, res) => {
    const orderData = req.body;
    
    const { data, error } = await supabase
        .from('orders')
        .insert({
            ...orderData,
            status: 'pendente',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    io.emit('novo_pedido_nuvem', data);
    res.json({ success: true, order: data });
});

app.post('/api/comandas/add', async (req, res) => {
    const { comanda_id, items } = req.body;
    const { error } = await supabase
        .from('comandas')
        .update({ 
            items: items, 
            status: 'ocupada', 
            updated_at: new Date().toISOString() 
        })
        .eq('id', comanda_id);

    if (error) return res.status(500).json({ error: error.message });

    io.emit('atualizacao_mesa', { id: comanda_id });
    res.json({ success: true });
});

app.post('/api/comandas/print', async (req, res) => {
    const { comanda_id } = req.body;
    const { error } = await supabase
        .from('comandas')
        .update({ imprimir_cozinha: true })
        .eq('id', comanda_id);

    if (error) return res.status(500).json({ error: error.message });

    io.emit('imprimir_cozinha', { comanda_id });
    res.json({ success: true });
});

// ===============================================================
// 3. INICIALIZAÇÃO
// ===============================================================
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Sistema Naxio (Raiz) rodando na porta ${PORT}`);
});
