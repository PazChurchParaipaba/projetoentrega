# 📅 SISTEMA DE RESERVAS DE PRATOS - DOCUMENTAÇÃO COMPLETA

## 🎯 **VISÃO GERAL**

Sistema inteligente para gerenciar reservas de pratos durante o horário de pré-almoço (09:00 - 11:30).

---

## 🕐 **COMO FUNCIONA**

### **1. Horário de Operação**
- ⏰ **Ativo:** 09:00 às 11:30
- 🚫 **Inativo:** Fora desse horário (não pergunta)

### **2. Fluxo Completo**

```
CLIENTE PEDE → GARÇOM LANÇA NA COMANDA → SISTEMA PERGUNTA
                                              ↓
                                    "É para reserva?"
                                              ↓
                        ┌─────────────────────┴─────────────────────┐
                        ↓                                           ↓
                   SIM (Reserva)                              NÃO (Normal)
                        ↓                                           ↓
        Item VAI para COMANDA                         Item VAI para COMANDA
                +                                          (fim)
        Item VAI para LISTA DE RESERVAS
                ↓
        Cozinha vê lista de reservas
                ↓
        Prepara pratos para o almoço
```

---

## ✅ **CARACTERÍSTICAS PRINCIPAIS**

### **1. Item Permanece na Comanda**
- ✅ O item **NÃO SAI** da comanda original
- ✅ Cliente paga normalmente no final
- ✅ Garçom mantém controle total

### **2. Item Também Vai para Lista de Reservas**
- ✅ Cozinha vê lista separada
- ✅ Organizado por mesa
- ✅ Mostra garçom que lançou
- ✅ Mostra horário do lançamento

### **3. Controle de Status**
- ⏳ **Pendente** - Aguardando preparo
- 🔥 **Preparando** - Em produção
- ✅ **Pronto** - Finalizado
- 🍽️ **Entregue** - Servido ao cliente
- ❌ **Cancelado** - Cancelado

---

## 📊 **PAINEL DE RESERVAS**

### **Acesso:**
1. Menu Principal → **📊 Central de Gestão**
2. Clique em **📅 RESERVAS DE PRATOS (Almoço)**

### **Visualização:**

```
┌─────────────────────────────────────────────┐
│  📅 Reservas de Pratos                      │
│  Sábado, 8 de fevereiro de 2026             │
├─────────────────────────────────────────────┤
│                                             │
│  🪑 Mesa 5                  Total: R$ 85,00 │
│  ┌─────────────────────────────────────┐   │
│  │ 2x Picanha Grelhada      R$ 60,00   │   │
│  │ 📝 Mal passada                       │   │
│  │ 👤 João Silva • 09:15                │   │
│  │ Status: [🔥 Preparando ▼]            │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ 2x Refrigerante          R$ 10,00   │   │
│  │ 👤 João Silva • 09:15                │   │
│  │ Status: [⏳ Pendente ▼]              │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  🪑 Mesa 8                  Total: R$ 45,00 │
│  ┌─────────────────────────────────────┐   │
│  │ 1x Frango Assado         R$ 35,00   │   │
│  │ 📝 Sem cebola                        │   │
│  │ 👤 Maria Santos • 10:30              │   │
│  │ Status: [✅ Pronto ▼]                │   │
│  └─────────────────────────────────────┘   │
│                                             │
├─────────────────────────────────────────────┤
│  Total de Reservas: R$ 130,00               │
│  [🖨️ Imprimir Resumo]                      │
└─────────────────────────────────────────────┘
```

---

## 🖨️ **IMPRESSÃO DE RESUMO**

### **Formato:**

```
📅 RESERVAS DE PRATOS
08/02/2026
─────────────────────────────

MESA 5
2x Picanha Grelhada        R$ 60,00
   Obs: Mal passada
   Garçom: João Silva

2x Refrigerante            R$ 10,00
   Garçom: João Silva

MESA 8
1x Frango Assado           R$ 35,00
   Obs: Sem cebola
   Garçom: Maria Santos

─────────────────────────────
TOTAL:                    R$ 130,00

Sistema Naxio
```

---

## 📋 **CONFERÊNCIA DE COMANDA MELHORADA**

### **Antes:**
```
CONFERÊNCIA MESA 5
─────────────────
2x Picanha         R$ 60,00
2x Refrigerante    R$ 10,00
─────────────────
Subtotal:          R$ 70,00
Serviço (10%):     R$ 7,00
TOTAL:             R$ 77,00
```

### **Depois (COM DETALHES):**
```
CONFERÊNCIA MESA 5
─────────────────
2x Picanha Grelhada        R$ 60,00
   Obs: Mal passada
   👤 João Silva • 09:15

2x Refrigerante            R$ 10,00
   👤 João Silva • 09:15

1x Cerveja                 R$ 8,00
   👤 Maria Santos • 12:30
─────────────────
Subtotal:          R$ 78,00
Serviço (10%):     R$ 7,80
TOTAL:             R$ 85,80

* Conferência de Mesa - Não Fiscal *
```

**✨ Agora mostra:**
- ✅ Garçom que lançou cada item
- ✅ Horário do lançamento
- ✅ Observações de cada item
- ✅ **SEM AGRUPAR** - Cada lançamento separado

---

## 🗄️ **ESTRUTURA DO BANCO DE DADOS**

### **Tabela: `reservas_pratos`**

```sql
CREATE TABLE reservas_pratos (
    id UUID PRIMARY KEY,
    store_id UUID NOT NULL,
    comanda_id UUID NOT NULL,
    mesa_numero INTEGER,
    garcom_nome TEXT NOT NULL,
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,
    observacoes TEXT,
    data_reserva DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
```

### **Status Possíveis:**
- `pendente`
- `preparando`
- `pronto`
- `entregue`
- `cancelado`

---

## 🔧 **ARQUIVOS DO SISTEMA**

### **1. JavaScript**
- `js/reservas-pratos.js` - Sistema principal
- `js/comandas.js` - Integração com lançamento

### **2. SQL**
- `database/create_reservas_pratos_table.sql` - Criação da tabela

### **3. Documentação**
- `docs/SISTEMA_RESERVAS_PRATOS.md` - Este arquivo

---

## 💡 **CASOS DE USO**

### **Caso 1: Reserva Normal**
```
09:30 - Cliente liga pedindo 2 Picanhas para o almoço
      → Garçom cria comanda Mesa 5
      → Lança 2x Picanha
      → Sistema pergunta: "É para reserva?"
      → Garçom clica "Sim, é Reserva"
      → Item fica na comanda E vai para lista de reservas
      → Cozinha vê na lista e prepara
      → 12:00 - Cliente chega, come, paga normalmente
```

### **Caso 2: Pedido Normal (Fora do Horário)**
```
14:00 - Cliente pede 1 Frango
      → Garçom lança na comanda
      → Sistema NÃO pergunta (fora do horário 09:00-11:30)
      → Item vai direto para comanda
      → Preparo normal
```

### **Caso 3: Pedido Normal (Dentro do Horário)**
```
10:00 - Cliente na mesa pede 1 Cerveja
      → Garçom lança na comanda
      → Sistema pergunta: "É para reserva?"
      → Garçom clica "Não, é Normal"
      → Item vai apenas para comanda
      → Preparo imediato
```

---

## 🎨 **BENEFÍCIOS**

### **Para a Cozinha:**
- ✅ Lista organizada de pratos para preparar
- ✅ Agrupado por mesa
- ✅ Controle de status
- ✅ Impressão de resumo

### **Para o Garçom:**
- ✅ Item permanece na comanda
- ✅ Controle total do pedido
- ✅ Conferência detalhada

### **Para o Gerente:**
- ✅ Visão completa das reservas
- ✅ Rastreamento por garçom
- ✅ Relatórios precisos

### **Para o Cliente:**
- ✅ Prato pronto quando chegar
- ✅ Pagamento normal
- ✅ Experiência melhorada

---

## ⚙️ **CONFIGURAÇÕES**

### **Horário de Reserva:**
```javascript
// Em js/comandas.js, linha ~330
const isHorarioReserva = horaAtual >= 9 && horaAtual <= 11.5;
```

**Para alterar:**
- `9` = Hora de início (09:00)
- `11.5` = Hora de fim (11:30)

---

## 🚀 **PRÓXIMOS PASSOS**

1. **Executar SQL:**
   ```sql
   -- Rodar o arquivo:
   database/create_reservas_pratos_table.sql
   ```

2. **Testar Sistema:**
   - Criar comanda
   - Lançar item entre 09:00-11:30
   - Confirmar reserva
   - Verificar painel de reservas

3. **Treinar Equipe:**
   - Mostrar como funciona
   - Explicar horário de operação
   - Demonstrar painel de reservas

---

## 📞 **SUPORTE**

**Dúvidas?**
- Consulte este documento
- Veja o código em `js/reservas-pratos.js`
- Teste em ambiente de desenvolvimento primeiro

---

**🎉 Sistema de Reservas de Pratos - Pronto para Uso!**
