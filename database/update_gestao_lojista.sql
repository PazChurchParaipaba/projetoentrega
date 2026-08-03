-- ==============================================================================
-- 🚀 UPDATE: MÓDULO GESTÃO DE LOJISTA (Cobrança, Maquinetas, Robôs)
-- ==============================================================================

-- 1. Tabela de MAQUINETAS
CREATE TABLE IF NOT EXISTS card_machines (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    store_id uuid REFERENCES stores(id),
    nome text NOT NULL, -- Ex: "Stone Balcão 1"
    taxas jsonb DEFAULT '{}'::jsonb, 
    -- Exemplo de JSON para taxas: 
    -- { "debito": 1.99, "credito_vista": 3.49, "credito_2x_6x": 4.99, "credito_7x_12x": 5.99 }
    status text DEFAULT 'ativa',
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Tabela de COBRANÇAS
CREATE TABLE IF NOT EXISTS collections (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    store_id uuid REFERENCES stores(id),
    cliente_id uuid REFERENCES profiles(id),
    divida_origem_id uuid REFERENCES financial_records(id), -- A qual conta isso se refere
    cobrador_id uuid REFERENCES profiles(id), -- Quem está cobrando
    status text DEFAULT 'pendente', -- pendente, em_negociacao, promessa_pagamento, finalizado, incobravel
    tipo_contato text, -- telefone, whatsapp, visita
    observacoes text,
    data_promessa_pagamento date,
    data_ultimo_contato timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- 3. Tabela de PONTUAÇÃO DE CLIENTES (Score)
CREATE TABLE IF NOT EXISTS client_scores (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    cliente_id uuid REFERENCES profiles(id) UNIQUE,
    store_id uuid REFERENCES stores(id),
    score int DEFAULT 50, -- 0 a 100
    classificacao text DEFAULT 'Médio', -- Ouro, Médio, Risco
    historico_pagamento jsonb DEFAULT '{"pagos":0, "atrasos":0}'::jsonb,
    last_updated timestamp with time zone DEFAULT now()
);

-- 4. Função Trigger: GERAR CÓDIGO INTERNO AUTOMÁTICO
CREATE OR REPLACE FUNCTION generate_internal_product_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo_barras IS NULL OR NEW.codigo_barras = '' THEN
        -- Gera código no formato: INT-TIMESTAMP-RANDOM
        -- Ex: INT-1709234001-99
        NEW.codigo_barras := 'INT-' || to_char(now(), 'YYMMDDHH24MI') || '-' || floor(random() * 100)::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_code_products ON products;
CREATE TRIGGER trigger_auto_code_products
BEFORE INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION generate_internal_product_code();

-- 5. Função para UNIFICAR PRODUTOS DUPLICADOS
-- Uso: SELECT unificar_produtos_duplicados('store_uuid');
CREATE OR REPLACE FUNCTION unificar_produtos_duplicados(target_store_id uuid)
RETURNS void AS $$
DECLARE
    rec RECORD;
    master_id uuid;
    dup_id uuid;
BEGIN
    -- Loop para encontrar grupos de duplicatas (Mesmo Nome e Mesmo Código)
    FOR rec IN 
        SELECT nome, codigo_barras, array_agg(id ORDER BY created_at ASC) as ids
        FROM products 
        WHERE store_id = target_store_id
        GROUP BY nome, codigo_barras
        HAVING count(*) > 1
    LOOP
        -- O primeiro ID criado será o MESTRE
        master_id := rec.ids[1];
        
        -- Os outros serão fundidos
        FOR i IN 2 .. array_length(rec.ids, 1) LOOP
            dup_id := rec.ids[i];
            
            -- 1. Transfere itens de pedido
            UPDATE order_items SET product_id = master_id WHERE product_id = dup_id;
            
            -- 2. Transfere itens de estoque/movimentação (se houver tabela de log)
            -- (Adicione tabelas extras aqui se necessário)
            
            -- 3. Soma estoque
            UPDATE products 
            SET estoque = products.estoque + (SELECT estoque FROM products WHERE id = dup_id)
            WHERE id = master_id;
            
            -- 4. Deleta duplicata
            DELETE FROM products WHERE id = dup_id;
        END LOOP;
        
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. Políticas de Segurança (RLS)
ALTER TABLE card_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total autenticado maquinetas" ON card_machines FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total autenticado cobrancas" ON collections FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Acesso total autenticado scores" ON client_scores FOR ALL USING (auth.role() = 'authenticated');
