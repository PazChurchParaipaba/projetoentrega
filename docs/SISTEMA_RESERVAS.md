# 🍽️ Sistema de Reservas - Naxio

## Visão Geral

O Sistema de Reservas permite que restaurantes gerenciem reservas de almoço/jantar de forma eficiente, mantendo uma lista temporária do dia e vinculando as reservas às comandas reais criadas pelos garçons.

## 🎯 Fluxo de Funcionamento

### 1. Cliente Faz a Reserva
- Cliente liga ou envia mensagem para fazer reserva
- Atendente registra:
  - Horário da reserva
  - Itens do pedido
  - Observações especiais

### 2. Lista Temporária do Dia
- Todas as reservas ficam em uma lista temporária
- Visível apenas para o dia atual
- Status: **Pendente**

### 3. Cliente Chega ao Restaurante
- Garçom cria uma **comanda REAL** no sistema (ex: Mesa 5)
- Caixa/Gerente acessa o painel de reservas
- Clica em "Cliente Chegou"
- Informa o número da comanda criada pelo garçom
- Sistema vincula automaticamente os itens da reserva à comanda real

### 4. Resultado
- ✅ Pedido da reserva aparece na comanda real do garçom
- ✅ Garçom pode adicionar mais itens normalmente
- ✅ Fechamento da conta é feito na comanda real
- ✅ Reserva sai da lista temporária (status: Vinculada)

## 📋 Como Usar

### Acessar o Painel de Reservas
1. Acesse o **Painel da Loja**
2. Clique no botão **"📅 Reservas"** (visível apenas para restaurantes)
3. Visualize todas as reservas do dia

### Criar uma Nova Reserva (Via Código)
```javascript
// Exemplo de criação de reserva
const items = [
    { id: 'prod123', nome: 'Picanha', qtd: 2, price: 45.00 },
    { id: 'prod456', nome: 'Refrigerante', qtd: 2, price: 5.00 }
];

await ReservasSystem.criarReserva(
    'cliente-uuid',      // ID do cliente
    items,               // Array de itens
    '12:30',            // Horário da reserva
    'Sem cebola'        // Observações
);
```

### Vincular Reserva à Comanda
1. Quando o cliente chegar, o garçom cria a comanda normalmente
2. No painel de reservas, clique em **"✅ Cliente Chegou"**
3. Digite o número da comanda criada pelo garçom
4. Pronto! Os itens da reserva agora estão na comanda real

### Enviar para Cozinha (Antecipado)
- Clique em **"🍳 Enviar p/ Cozinha"**
- Imprime o pedido da reserva na cozinha
- Útil para adiantar o preparo antes do cliente chegar

## 🗄️ Estrutura do Banco de Dados

### Tabela: `reservas_dia`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único da reserva |
| `store_id` | UUID | ID da loja/restaurante |
| `cliente_id` | UUID | ID do cliente (opcional) |
| `data_reserva` | DATE | Data da reserva |
| `horario_reserva` | TIME | Horário da reserva |
| `items` | JSONB | Array com os itens do pedido |
| `observacoes` | TEXT | Observações especiais |
| `status` | TEXT | pendente / vinculada / cancelada |
| `comanda_id` | UUID | ID da comanda vinculada |
| `vinculada_em` | TIMESTAMP | Quando foi vinculada |

## 🔧 Instalação

### 1. Criar Tabela no Supabase
Execute o script SQL no SQL Editor do Supabase:
```bash
database/create_reservas_table.sql
```

### 2. Verificar Arquivos
Certifique-se que os seguintes arquivos estão no projeto:
- `js/reservas.js` - Sistema de reservas
- `index.html` - Deve incluir o script de reservas

### 3. Configurar Tipo de Loja
No painel de configurações da loja, defina:
```
tipo_loja = 'Restaurante'
```

## ⚙️ Configurações

### Visibilidade do Botão
O botão de Reservas aparece automaticamente apenas para lojas do tipo **Restaurante**.

### Permissões
- Apenas usuários da loja podem ver/criar/editar reservas
- RLS (Row Level Security) está ativado

## 🎨 Melhorias de UX/UI

### Cores e Tema
- ✅ Fundos adaptados ao tema escuro do sistema
- ✅ Cards com bordas coloridas (laranja para reservas)
- ✅ Badges de status visíveis
- ✅ Botões com ícones intuitivos

### Impressão
- 🖨️ Cupom térmico formatado (300px)
- 📄 Inclui horário, cliente e observações
- ✅ Fonte monoespaçada para melhor legibilidade

## 🚀 Funcionalidades Futuras

- [ ] Notificações automáticas por WhatsApp
- [ ] Confirmação de reserva pelo cliente
- [ ] Histórico de reservas canceladas
- [ ] Estatísticas de reservas por período
- [ ] Integração com Google Calendar

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique se a tabela foi criada corretamente no Supabase
2. Confirme que o tipo de loja está como "Restaurante"
3. Verifique o console do navegador para erros

## 📝 Notas Importantes

- ⚠️ Reservas não vinculadas são limpas automaticamente após 24h
- ✅ Pedidos da reserva ficam na comanda REAL, não em comanda fictícia
- 🔒 Sistema usa RLS para segurança dos dados
- 📱 Interface responsiva para mobile

---

**Desenvolvido para Naxio - Sistema de Gestão Empresarial**
