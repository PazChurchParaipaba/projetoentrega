-- ==============================================================================
-- ⚠️ IMPORTANTE: Execute este script no "SQL Editor" do seu Supabase
-- para habilitar as funcionalidades de Autopeças, Oficina e Financeiro.
-- ==============================================================================

-- 1. Novos campos para tabela de PRODUTOS
ALTER TABLE products ADD COLUMN IF NOT EXISTS cod_fornecedor text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cod_fabricante text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cod_aplicacao text; -- Modelos de carro compatíveis
ALTER TABLE products ADD COLUMN IF NOT EXISTS localizacao text; -- Rua/Prateleira
ALTER TABLE products ADD COLUMN IF NOT EXISTS estoque_minimo int DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_negative_stock boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preco_custo numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS preco_prazo numeric DEFAULT 0; -- Valor parcelado/prazo

-- 2. Novos campos para EQUIPE (Store Staff)
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS cargo_detalhado text; -- Vendedor, Mecânico, Caixa
ALTER TABLE store_staff ADD COLUMN IF NOT EXISTS comissao_percentual numeric DEFAULT 0;

-- 3. Tabela de ORDENS DE SERVIÇO (Oficina)
CREATE TABLE IF NOT EXISTS service_orders (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    store_id uuid REFERENCES stores(id),
    cliente_id uuid REFERENCES profiles(id), -- Cliente cadastrado
    cliente_nome text, -- Cliente avulso
    cliente_contato text,
    veiculo_modelo text,
    veiculo_placa text,
    descricao_problema text,
    status text DEFAULT 'aberta', -- aberta, em_andamento, aguardando_peca, concluida, cancelada
    mecanico_responsavel_id uuid REFERENCES profiles(id),
    valor_pecas numeric DEFAULT 0,
    valor_mao_obra numeric DEFAULT 0,
    valor_total numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    data_previsao timestamp with time zone,
    observacoes text
);

-- 4. Itens da Ordem de Serviço
CREATE TABLE IF NOT EXISTS service_order_items (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    os_id uuid REFERENCES service_orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES products(id), -- Pode ser nulo se for apenas mão de obra avulsa
    descricao text, -- Nome da peça ou serviço
    qtd numeric DEFAULT 1,
    preco_unitario numeric DEFAULT 0,
    tipo text DEFAULT 'peca', -- peca, servico
    comissao_funcionario_id uuid REFERENCES profiles(id) -- Quem ganha comissão neste item
);

-- 5. Tabela de REGISTROS FINANCEIROS (Contas a Pagar/Receber e Vales)
CREATE TABLE IF NOT EXISTS financial_records (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    store_id uuid REFERENCES stores(id),
    tipo text, -- receita, despesa, vale_funcionario
    categoria text, -- autopeças, oficina, adiantamento, boleto, venda_prazo
    descricao text,
    valor numeric DEFAULT 0,
    data_vencimento date,
    data_pagamento date, -- Se null, está pendente
    status text DEFAULT 'pendente', -- pendente, pago, atrasado, cancelado
    funcionario_id uuid REFERENCES profiles(id), -- Para vales (quem pegou o dinheiro)
    cliente_id uuid REFERENCES profiles(id),     -- Para contas a receber (quem deve pagar)
    metodo_pagamento text, -- dinheiro, pix, caixa_loja, boleto, fiado
    parcela_atual int DEFAULT 1,
    total_parcelas int DEFAULT 1,
    obs text,
    created_at timestamp with time zone DEFAULT now()
);

-- Garante que as colunas existam caso a tabela já tenha sido criada anteriormente
ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES profiles(id);
ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS parcela_atual int DEFAULT 1;
ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS total_parcelas int DEFAULT 1;
ALTER TABLE financial_records ADD COLUMN IF NOT EXISTS obs text;

-- 6. Políticas de Segurança (Row Level Security) - Básico
-- Habilita RLS nas novas tabelas se ainda não estiver
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_records ENABLE ROW LEVEL SECURITY;

-- Cria políticas básicas de leitura/escrita para usuários autenticados (ajuste conforme necessidade real de segurança)
-- Nota: Em produção, você deve restringir isso por store_id e role do usuário.
CREATE POLICY "Permitir acesso total a usuarios autenticados em service_orders" ON service_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir acesso total a usuarios autenticados em service_order_items" ON service_order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir acesso total a usuarios autenticados em financial_records" ON financial_records FOR ALL USING (auth.role() = 'authenticated');
