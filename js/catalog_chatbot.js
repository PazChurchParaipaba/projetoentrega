// =============================================================================
// 🤖 CHATBOT DO CATÁLOGO ONLINE v2.0 - Integrado com Catálogo de Produtos
// =============================================================================
(function () {
    'use strict';

    const BOT_NAME = 'Naxio';
    const QUICK_REPLIES = [
        { label: '🔥 Ver ofertas em destaque', action: 'ofertas' },
        { label: '🛒 Como fazer meu pedido?', action: 'pedido' },
        { label: '💳 Formas de pagamento', action: 'pagamento' },
        { label: '🔍 Buscar produto', action: 'buscar' },
        { label: '💬 Falar com uma loja', action: 'chat_loja' },
        { label: '🚚 Dúvidas sobre entrega', action: 'entrega' },
        { label: '⭐ Programa de fidelidade', action: 'fidelidade' }
    ];

    const RESPONSES = {
        ofertas: 'Clique em "Catálogo" no menu ou role a página para ver as ofertas. Produtos em promoção aparecem no topo com o selo PROMOÇÃO. 🔥',
        pedido: '1️⃣ Escolha os produtos no catálogo\n2️⃣ Clique em "Comprar" ou "Adicionar"\n3️⃣ Abra o carrinho (ícone no topo)\n4️⃣ Escolha a forma de entrega e finalize com pagamento seguro (Pix/Cartão).',
        pagamento: '💳 Aceitamos Pix, cartão de crédito e débito de forma segura. No fechamento do pedido você escolhe a opção que preferir.\n\n✅ Todas as transações são processadas pelo Mercado Pago.',
        entrega: '🚚 Opções de entrega:\n• Entrega Local - motoboy da loja\n• Correios - informe seu CEP\n• Retirada na Loja - sem taxa\n\nA taxa é calculada automaticamente no carrinho.',
        chat_loja: '💬 Em cada produto há o botão "Dúvidas?" para falar direto com a loja. Faça login para usar o chat.',
        buscar: '🔍 Digite o nome do produto que procura no campo abaixo. Vou buscar no catálogo para você!',
        fidelidade: '⭐ Programa de Fidelidade Naxio:\n• A cada R$ 1,00 gasto = 1 ponto\n• Acumule pontos e troque por descontos\n• Verificar saldo: faça login e acesse "Meus Pontos"',
        horarios: '🕐 Cada loja define seu próprio horário de funcionamento. Consulte diretamente a loja pelo chat para confirmar.',
        devolucao: '🔄 Política de devoluções:\n• Produtos com defeito: até 7 dias\n• Arrependimento: até 7 dias\n• Entre em contato com a loja pelo chat para solicitar.'
    };

    // Mapeamento inteligente de palavras-chave → ações
    const KEYWORD_MAP = [
        { keywords: ['olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hey'], response: 'Olá! 😊 Como posso ajudar? Escolha uma opção ou digite sua dúvida:', showQuick: true },
        { keywords: ['oferta', 'promoção', 'desconto', 'barato', 'promo'], action: 'ofertas' },
        { keywords: ['comprar', 'pedido', 'como compro', 'como faço'], action: 'pedido' },
        { keywords: ['pagar', 'pagamento', 'pix', 'cartão', 'cartao', 'débito', 'credito'], action: 'pagamento' },
        { keywords: ['entrega', 'frete', 'correios', 'motoboy', 'retirada'], action: 'entrega' },
        { keywords: ['falar', 'atendente', 'humano', 'loja', 'dúvida'], action: 'chat_loja' },
        { keywords: ['horário', 'horario', 'abre', 'fecha', 'funcionamento'], action: 'horarios' },
        { keywords: ['devolver', 'devolução', 'devoluçao', 'troca', 'trocar', 'defeito'], action: 'devolucao' },
        { keywords: ['ponto', 'fidelidade', 'recompensa', 'fiel'], action: 'fidelidade' },
        { keywords: ['obrigad', 'valeu', 'vlw', 'thanks'], response: 'De nada! 😊 Estou aqui sempre que precisar. Boas compras! 🛍️' }
    ];

    let messagesEl, _appendBotMessage, _appendUserMessage;

    function createWidget() {
        if (document.getElementById('catalog-chatbot-root')) return;

        const root = document.createElement('div');
        root.id = 'catalog-chatbot-root';
        root.innerHTML = `
            <div id="catalog-chatbot-panel" class="catalog-chatbot-panel" style="display:none;">
                <div class="catalog-chatbot-header">
                    <span><i class="ri-robot-2-line"></i> ${BOT_NAME}</span>
                    <button type="button" class="catalog-chatbot-close" aria-label="Fechar">&times;</button>
                </div>
                <div class="catalog-chatbot-messages">
                    <div class="catalog-chatbot-msg bot">
                        <p>Olá! 😊 Sou o assistente virtual. Como posso ajudar?</p>
                        <div class="catalog-chatbot-quick">
                            ${QUICK_REPLIES.map(r => `<button type="button" class="catalog-chatbot-qbtn" data-action="${r.action}">${r.label}</button>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="catalog-chatbot-input-area">
                    <input type="text" id="chatbot-user-input" placeholder="Digite sua dúvida ou busque produtos..." autocomplete="off">
                    <button type="button" id="chatbot-send-btn" aria-label="Enviar"><i class="ri-send-plane-2-fill"></i></button>
                </div>
            </div>
            <button type="button" id="catalog-chatbot-toggle" class="catalog-chatbot-toggle" aria-label="Abrir atendimento">
                <i class="ri-chat-smile-2-line"></i>
            </button>
        `;

        document.body.appendChild(root);

        const panel = document.getElementById('catalog-chatbot-panel');
        const toggle = document.getElementById('catalog-chatbot-toggle');
        messagesEl = panel.querySelector('.catalog-chatbot-messages');
        const closeBtn = panel.querySelector('.catalog-chatbot-close');
        const userInput = document.getElementById('chatbot-user-input');
        const sendBtn = document.getElementById('chatbot-send-btn');

        _appendBotMessage = function (text, html = false) {
            const div = document.createElement('div');
            div.className = 'catalog-chatbot-msg bot';
            if (html) {
                div.innerHTML = text;
            } else {
                div.innerHTML = '<p>' + text.replace(/\n/g, '<br>') + '</p>';
            }
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        };

        _appendUserMessage = function (text) {
            const div = document.createElement('div');
            div.className = 'catalog-chatbot-msg user';
            div.innerHTML = '<p>' + text + '</p>';
            messagesEl.appendChild(div);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        };

        function handleAction(action, label) {
            _appendUserMessage(label || action);
            const response = RESPONSES[action];
            if (response) {
                setTimeout(() => _appendBotMessage(response), 400);
            }
            if (action === 'chat_loja') {
                setTimeout(() => {
                    if (typeof App !== 'undefined' && App.router) App.router.go('auth');
                }, 800);
            }
            if (action === 'ofertas') {
                if (typeof App !== 'undefined' && App.catalog && App.catalog.filter) {
                    const btn = document.querySelector('#category-list .cat-pill');
                    if (btn) App.catalog.filter('Todos', btn);
                }
            }
            if (action === 'buscar') {
                setTimeout(() => userInput.focus(), 500);
            }

            // Add follow-up quick replies
            setTimeout(() => {
                showFollowUp();
            }, 600);
        }

        function showFollowUp() {
            const followDiv = document.createElement('div');
            followDiv.className = 'catalog-chatbot-msg bot';
            followDiv.innerHTML = `<div class="catalog-chatbot-quick" style="margin-top:4px;">
                <button type="button" class="catalog-chatbot-qbtn" data-action="buscar">🔍 Buscar produto</button>
                <button type="button" class="catalog-chatbot-qbtn" data-action="pedido">🛒 Como comprar</button>
            </div>`;
            messagesEl.appendChild(followDiv);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        async function handleFreeText(text) {
            const lower = text.toLowerCase().trim();
            if (!lower) return;

            _appendUserMessage(text);

            // 1. Check keywords first
            for (const mapping of KEYWORD_MAP) {
                if (mapping.keywords.some(kw => lower.includes(kw))) {
                    if (mapping.action) {
                        const resp = RESPONSES[mapping.action];
                        if (resp) setTimeout(() => _appendBotMessage(resp), 400);
                    } else if (mapping.response) {
                        setTimeout(() => {
                            _appendBotMessage(mapping.response);
                            if (mapping.showQuick) showFollowUp();
                        }, 400);
                    }
                    return;
                }
            }

            // 2. Try product search
            setTimeout(() => _appendBotMessage('🔍 Buscando "' + text + '" no catálogo...'), 200);

            try {
                const storeId = App?.state?.catalogStoreId || App?.state?.storeId;
                if (!storeId) {
                    setTimeout(() => _appendBotMessage('Não consegui identificar a loja. Tente navegar pelo catálogo diretamente.'), 600);
                    return;
                }

                const { data } = await _sb.from('products')
                    .select('id, nome, preco, imagem_url, categoria, estoque')
                    .eq('store_id', storeId)
                    .or(`nome.ilike.%${lower}%,categoria.ilike.%${lower}%,descricao.ilike.%${lower}%`)
                    .limit(5);

                if (data && data.length > 0) {
                    const productCards = data.map(p => `
                        <div class="chatbot-product-card">
                            ${p.imagem_url ? `<img src="${p.imagem_url}" alt="${p.nome}">` : `<div class="chatbot-product-noimg"><i class="ri-image-line"></i></div>`}
                            <div class="chatbot-product-info">
                                <div class="chatbot-product-name">${p.nome}</div>
                                <div class="chatbot-product-price">R$ ${p.preco.toFixed(2)}</div>
                                <div class="chatbot-product-stock" style="color:${(p.estoque || 0) > 0 ? '#10b981' : '#ef4444'};">${(p.estoque || 0) > 0 ? '✅ Em estoque' : '❌ Esgotado'}</div>
                            </div>
                        </div>
                    `).join('');

                    setTimeout(() => {
                        _appendBotMessage(`<p>Encontrei ${data.length} produto(s):</p><div class="chatbot-products-grid">${productCards}</div>`, true);
                    }, 800);
                } else {
                    setTimeout(() => {
                        _appendBotMessage('Não encontrei produtos com "' + text + '". 😔\n\nTente termos diferentes ou navegue pelo catálogo.');
                    }, 600);
                }
            } catch (e) {
                setTimeout(() => _appendBotMessage('Use o catálogo principal para buscar produtos. 📦'), 600);
            }
        }

        // Event listeners
        toggle.addEventListener('click', function () {
            const open = panel.style.display === 'flex' || panel.style.display === 'block';
            panel.style.display = open ? 'none' : 'flex';
            toggle.setAttribute('aria-label', open ? 'Abrir atendimento' : 'Fechar atendimento');
            if (!open) setTimeout(() => userInput.focus(), 300);
        });

        closeBtn.addEventListener('click', function () {
            panel.style.display = 'none';
            toggle.setAttribute('aria-label', 'Abrir atendimento');
        });

        panel.addEventListener('click', function (e) {
            const qbtn = e.target.closest('.catalog-chatbot-qbtn');
            if (qbtn) {
                const action = qbtn.dataset.action;
                const label = qbtn.textContent.trim();
                handleAction(action, label);
            }
        });

        sendBtn.addEventListener('click', () => {
            const val = userInput.value.trim();
            if (val) { handleFreeText(val); userInput.value = ''; }
        });

        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = userInput.value.trim();
                if (val) { handleFreeText(val); userInput.value = ''; }
            }
        });
    }

    function injectStyles() {
        if (document.getElementById('catalog-chatbot-styles')) return;
        const style = document.createElement('style');
        style.id = 'catalog-chatbot-styles';
        style.textContent = `
            #catalog-chatbot-root { position: fixed; bottom: 24px; right: 24px; z-index: 9990; font-family: inherit; }
            .catalog-chatbot-toggle {
                width: 56px; height: 56px; border-radius: 50%;
                background: linear-gradient(135deg, var(--primary), #0891b2); color: #fff; border: none;
                box-shadow: 0 4px 14px rgba(6, 182, 212, 0.5);
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                font-size: 1.5rem; transition: all 0.3s;
                animation: chatbot-pulse 3s infinite;
            }
            @keyframes chatbot-pulse {
                0%, 100% { box-shadow: 0 4px 14px rgba(6, 182, 212, 0.5); }
                50% { box-shadow: 0 4px 28px rgba(6, 182, 212, 0.8); }
            }
            .catalog-chatbot-toggle:hover { transform: scale(1.1); }
            .catalog-chatbot-panel {
                position: absolute; bottom: 70px; right: 0;
                width: 360px; max-width: calc(100vw - 32px); max-height: 500px;
                background: var(--surface); border: 1px solid var(--border);
                border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                display: flex; flex-direction: column; overflow: hidden;
            }
            .catalog-chatbot-header {
                padding: 14px 16px; background: linear-gradient(135deg, #0f172a, #1e293b);
                border-bottom: 1px solid var(--border);
                display: flex; justify-content: space-between; align-items: center;
                font-weight: 600; color: #fff;
            }
            .catalog-chatbot-close {
                background: none; border: none; color: rgba(255,255,255,0.6);
                font-size: 1.4rem; cursor: pointer; padding: 0 4px; line-height: 1;
            }
            .catalog-chatbot-close:hover { color: #fff; }
            .catalog-chatbot-messages {
                flex: 1; overflow-y: auto; padding: 12px; min-height: 200px; max-height: 340px;
            }
            .catalog-chatbot-msg { margin-bottom: 12px; animation: chatbot-fade-in 0.3s ease; }
            @keyframes chatbot-fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
            .catalog-chatbot-msg p {
                margin: 0; padding: 10px 12px; border-radius: 12px;
                font-size: 0.88rem; line-height: 1.45;
            }
            .catalog-chatbot-msg.bot p {
                background: var(--background); color: var(--text-main);
                border-bottom-left-radius: 4px;
            }
            .catalog-chatbot-msg.user p {
                background: linear-gradient(135deg, var(--primary), #0891b2); color: #fff;
                margin-left: 24px; border-bottom-right-radius: 4px;
            }
            .catalog-chatbot-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .catalog-chatbot-qbtn {
                background: var(--background); border: 1px solid var(--border);
                color: var(--text-main); padding: 6px 10px;
                border-radius: 8px; font-size: 0.75rem; cursor: pointer;
                transition: all 0.2s;
            }
            .catalog-chatbot-qbtn:hover { background: var(--primary); color: #fff; border-color: var(--primary); transform: scale(1.02); }
            
            /* Input area */
            .catalog-chatbot-input-area {
                display: flex; gap: 8px; padding: 10px 12px;
                border-top: 1px solid var(--border); background: var(--background);
            }
            .catalog-chatbot-input-area input {
                flex: 1; padding: 8px 12px; border: 1px solid var(--border);
                border-radius: 20px; background: var(--surface); color: var(--text-main);
                font-size: 0.85rem; outline: none; transition: border-color 0.2s;
            }
            .catalog-chatbot-input-area input:focus { border-color: var(--primary); }
            .catalog-chatbot-input-area button {
                width: 36px; height: 36px; border-radius: 50%;
                background: var(--primary); color: #fff; border: none;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: transform 0.2s;
            }
            .catalog-chatbot-input-area button:hover { transform: scale(1.1); }
            
            /* Product cards in chat */
            .chatbot-products-grid { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
            .chatbot-product-card {
                display: flex; gap: 10px; padding: 8px; border-radius: 10px;
                background: var(--surface); border: 1px solid var(--border); cursor: pointer;
                transition: all 0.2s;
            }
            .chatbot-product-card:hover { border-color: var(--primary); transform: translateX(3px); }
            .chatbot-product-card img {
                width: 50px; height: 50px; object-fit: cover; border-radius: 8px; flex-shrink: 0;
            }
            .chatbot-product-noimg {
                width: 50px; height: 50px; border-radius: 8px; background: #f1f5f9;
                display: flex; align-items: center; justify-content: center; color: #94a3b8;
                flex-shrink: 0;
            }
            .chatbot-product-info { flex: 1; min-width: 0; }
            .chatbot-product-name { font-size: 0.82rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .chatbot-product-price { font-size: 0.85rem; font-weight: 700; color: var(--primary); }
            .chatbot-product-stock { font-size: 0.7rem; }
            
            @media (max-width: 480px) {
                .catalog-chatbot-panel { width: calc(100vw - 16px); right: -8px; max-height: 60vh; }
            }
        `;
        document.head.appendChild(style);
    }

    function showOnlyOnCatalog() {
        const home = document.getElementById('view-home');
        const root = document.getElementById('catalog-chatbot-root');
        if (!root) return;
        const panel = root.querySelector('.catalog-chatbot-panel');
        const isCatalog = home && home.classList.contains('active');
        root.style.display = isCatalog ? '' : 'none';
        if (!isCatalog && panel && (panel.style.display === 'flex' || panel.style.display === 'block')) panel.style.display = 'none';
    }

    function init() {
        injectStyles();
        createWidget();
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                if (m.target.id === 'view-home' && m.attributeName === 'class') showOnlyOnCatalog();
            });
        });
        const home = document.getElementById('view-home');
        if (home) {
            observer.observe(home, { attributes: true, attributeFilter: ['class'] });
        }
        showOnlyOnCatalog();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }
})();
