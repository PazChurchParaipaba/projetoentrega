# 🎨 GUIA DE USO - NAXIO UI SYSTEM

## Sistema de Modais Ultra Profissional

Este sistema substitui **TODOS** os `alert()`, `prompt()` e `confirm()` nativos do navegador por modais customizados e bonitos.

---

## 📚 **MÉTODOS DISPONÍVEIS**

### 1. **NaxioUI.alert()** - Alertas Customizados

Substitui `alert()` nativo.

```javascript
// USO BÁSICO
await NaxioUI.alert('Título', 'Mensagem');

// COM TIPO
await NaxioUI.alert('Sucesso!', 'Operação concluída', 'success');
await NaxioUI.alert('Erro!', 'Algo deu errado', 'error');
await NaxioUI.alert('Atenção!', 'Verifique os dados', 'warning');
await NaxioUI.alert('Informação', 'Dados salvos', 'info');

// EXEMPLO REAL
if (error) {
    await NaxioUI.alert('❌ Erro', error.message, 'error');
}
```

**Tipos disponíveis:**
- `success` - Verde ✅
- `error` - Vermelho ❌
- `warning` - Laranja ⚠️
- `info` - Azul ℹ️

---

### 2. **NaxioUI.confirm()** - Confirmações

Substitui `confirm()` nativo.

```javascript
// USO BÁSICO
const confirmado = await NaxioUI.confirm('Título', 'Mensagem');
if (confirmado) {
    // Usuário clicou em "Confirmar"
}

// COM TEXTOS CUSTOMIZADOS
const resultado = await NaxioUI.confirm(
    'Deletar Item?',
    'Esta ação não pode ser desfeita',
    'Sim, Deletar',
    'Cancelar'
);

// EXEMPLO REAL
const confirma = await NaxioUI.confirm(
    '🗑️ Excluir Produto?',
    'Tem certeza que deseja excluir este produto?',
    'Sim, Excluir',
    'Não, Manter'
);

if (confirma) {
    await deletarProduto(id);
}
```

**Retorna:** `true` ou `false`

---

### 3. **NaxioUI.prompt()** - Entrada de Texto

Substitui `prompt()` nativo.

```javascript
// USO BÁSICO
const nome = await NaxioUI.prompt('Título', 'Mensagem');

// COM VALOR PADRÃO E PLACEHOLDER
const valor = await NaxioUI.prompt(
    'Digite o Valor',
    'Informe o valor do produto:',
    '0.00',
    'Ex: 25.90',
    'number'
);

// EXEMPLO REAL
const numComanda = await NaxioUI.prompt(
    '🔗 Vincular Comanda',
    'Digite o número da comanda:',
    '',
    'Ex: 5',
    'text'
);

if (numComanda) {
    vincularComanda(numComanda);
}
```

**Tipos de input:**
- `text` - Texto (padrão)
- `number` - Números
- `email` - Email
- `tel` - Telefone
- `password` - Senha

**Retorna:** `string` ou `null` (se cancelado)

---

### 4. **NaxioUI.textarea()** - Texto Longo

Para textos maiores (observações, descrições, etc).

```javascript
// USO BÁSICO
const texto = await NaxioUI.textarea('Título', 'Mensagem');

// COM VALIDAÇÃO DE TAMANHO MÍNIMO
const motivo = await NaxioUI.textarea(
    '📝 Motivo do Cancelamento',
    'Descreva o motivo (mínimo 15 caracteres):',
    '',
    'Digite aqui...',
    15
);

// EXEMPLO REAL
const observacoes = await NaxioUI.textarea(
    '📋 Observações da Reserva',
    'Alguma observação especial?',
    '',
    'Ex: Sem cebola, mesa perto da janela...',
    0
);
```

**Retorna:** `string` ou `null` (se cancelado)

---

### 5. **NaxioUI.select()** - Seleção de Opções

Para escolher entre várias opções.

```javascript
// USO BÁSICO
const opcao = await NaxioUI.select(
    'Escolha uma Opção',
    'Selecione o tipo de pagamento:',
    ['Dinheiro', 'Cartão', 'Pix']
);

// COM ÍCONES E DESCRIÇÕES
const metodo = await NaxioUI.select(
    '💳 Método de Pagamento',
    'Como deseja pagar?',
    [
        {
            value: 'dinheiro',
            label: 'Dinheiro',
            icon: 'ri-money-dollar-circle-line',
            description: 'Pagamento em espécie'
        },
        {
            value: 'cartao',
            label: 'Cartão',
            icon: 'ri-bank-card-line',
            description: 'Débito ou crédito'
        },
        {
            value: 'pix',
            label: 'PIX',
            icon: 'ri-qr-code-line',
            description: 'Transferência instantânea'
        }
    ]
);

if (metodo === 'pix') {
    mostrarQRCode();
}
```

**Retorna:** `string` (value) ou `null` (se cancelado)

---

### 6. **NaxioUI.datePicker()** - Seleção de Data

```javascript
// USO BÁSICO
const data = await NaxioUI.datePicker('Título', 'Mensagem');

// COM DATA PADRÃO
const dataReserva = await NaxioUI.datePicker(
    '📅 Data da Reserva',
    'Selecione a data:',
    '2026-02-10'
);

// EXEMPLO REAL
const dataInicio = await NaxioUI.datePicker(
    '📊 Relatório',
    'Data de início:',
    new Date().toISOString().split('T')[0]
);
```

**Retorna:** `string` (YYYY-MM-DD) ou `null`

---

### 7. **NaxioUI.timePicker()** - Seleção de Hora

```javascript
// USO BÁSICO
const hora = await NaxioUI.timePicker('Título', 'Mensagem');

// COM HORA PADRÃO
const horario = await NaxioUI.timePicker(
    '⏰ Horário da Reserva',
    'Que horas o cliente chegará?',
    '12:30'
);

// EXEMPLO REAL
const horaEntrega = await NaxioUI.timePicker(
    '🚚 Horário de Entrega',
    'Selecione o horário:',
    '18:00'
);
```

**Retorna:** `string` (HH:MM) ou `null`

---

### 8. **NaxioUI.showLoading()** / **NaxioUI.hideLoading()** - Loading

```javascript
// MOSTRAR LOADING
NaxioUI.showLoading('Carregando...');
NaxioUI.showLoading('Salvando dados...');
NaxioUI.showLoading('Processando pagamento...');

// ESCONDER LOADING
NaxioUI.hideLoading();

// EXEMPLO REAL
async function salvarProduto(data) {
    NaxioUI.showLoading('Salvando produto...');
    
    try {
        await _sb.from('products').insert(data);
        NaxioUI.hideLoading();
        await NaxioUI.alert('✅ Sucesso', 'Produto salvo!', 'success');
    } catch (error) {
        NaxioUI.hideLoading();
        await NaxioUI.alert('❌ Erro', error.message, 'error');
    }
}
```

---

## 🔄 **SUBSTITUINDO CÓDIGO ANTIGO**

### ❌ **ANTES** (Feio e Nativo)
```javascript
const nome = prompt('Digite o nome:');
if (!nome) return;

if (!confirm('Tem certeza?')) return;

alert('Salvo com sucesso!');
```

### ✅ **DEPOIS** (Bonito e Profissional)
```javascript
const nome = await NaxioUI.prompt('📝 Nome', 'Digite o nome:', '', 'Ex: João');
if (!nome) return;

const confirma = await NaxioUI.confirm('❓ Confirmar', 'Tem certeza?');
if (!confirma) return;

await NaxioUI.alert('✅ Sucesso', 'Salvo com sucesso!', 'success');
```

---

## 🎯 **EXEMPLOS PRÁTICOS**

### Exemplo 1: Deletar Item
```javascript
async function deletarProduto(id) {
    const confirma = await NaxioUI.confirm(
        '🗑️ Excluir Produto',
        'Esta ação não pode ser desfeita. Deseja continuar?',
        'Sim, Excluir',
        'Cancelar'
    );
    
    if (!confirma) return;
    
    NaxioUI.showLoading('Excluindo...');
    
    const { error } = await _sb.from('products').delete().eq('id', id);
    
    NaxioUI.hideLoading();
    
    if (error) {
        await NaxioUI.alert('❌ Erro', error.message, 'error');
    } else {
        await NaxioUI.alert('✅ Sucesso', 'Produto excluído!', 'success');
        recarregarLista();
    }
}
```

### Exemplo 2: Criar Reserva
```javascript
async function criarReserva() {
    const horario = await NaxioUI.timePicker(
        '⏰ Horário',
        'Que horas o cliente chegará?',
        '12:00'
    );
    
    if (!horario) return;
    
    const observacoes = await NaxioUI.textarea(
        '📋 Observações',
        'Alguma observação especial?',
        '',
        'Ex: Sem cebola, mesa perto da janela...'
    );
    
    NaxioUI.showLoading('Criando reserva...');
    
    const { error } = await _sb.from('reservas_dia').insert({
        horario_reserva: horario,
        observacoes: observacoes || '',
        // ... outros campos
    });
    
    NaxioUI.hideLoading();
    
    if (error) {
        await NaxioUI.alert('❌ Erro', error.message, 'error');
    } else {
        await NaxioUI.alert('✅ Reserva Criada!', 'Reserva registrada com sucesso', 'success');
    }
}
```

### Exemplo 3: Escolher Método de Pagamento
```javascript
async function escolherPagamento() {
    const metodo = await NaxioUI.select(
        '💳 Pagamento',
        'Como deseja pagar?',
        [
            {
                value: 'dinheiro',
                label: 'Dinheiro',
                icon: 'ri-money-dollar-circle-line',
                description: 'Pagamento em espécie'
            },
            {
                value: 'pix',
                label: 'PIX',
                icon: 'ri-qr-code-line',
                description: 'Transferência instantânea'
            },
            {
                value: 'cartao',
                label: 'Cartão',
                icon: 'ri-bank-card-line',
                description: 'Débito ou crédito'
            }
        ]
    );
    
    if (!metodo) return;
    
    processarPagamento(metodo);
}
```

---

## 🚀 **BENEFÍCIOS**

✅ **Visual Profissional** - Design moderno e bonito  
✅ **Animações Suaves** - Transições elegantes  
✅ **Responsivo** - Funciona em mobile e desktop  
✅ **Acessível** - Suporte a teclado e leitores de tela  
✅ **Customizável** - Cores, ícones e textos personalizados  
✅ **Async/Await** - Código mais limpo e legível  
✅ **Sem Dependências** - JavaScript puro  

---

## 📱 **COMPATIBILIDADE**

- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari
- ✅ Mobile (iOS/Android)
- ✅ Tablets

---

**🎉 Use em TODO o sistema para uma experiência ultra profissional!**
