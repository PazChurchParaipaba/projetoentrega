-- =============================================================================
-- 📦 NAXIO ENTERPRISE - SQL Migrations
-- Tabelas para: Movimentação de Estoque, Fidelidade, Promoções, Wishlist
-- =============================================================================

-- 1. TABELA DE MOVIMENTAÇÃO DE ESTOQUE
-- Registra todas as entradas, saídas, vendas e ajustes de estoque
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'venda', 'ajuste', 'devolucao')),
    quantidade INTEGER NOT NULL,
    motivo TEXT,
    usuario TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);


-- 2. TABELA DE PONTOS DE FIDELIDADE
-- Acumula pontos por cliente por loja
CREATE TABLE IF NOT EXISTS loyalty_points (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_store ON loyalty_points(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_client ON loyalty_points(client_id);


-- 3. TABELA DE PROMOÇÕES POR CATEGORIA
-- Permite criar descontos por categoria ou geral
CREATE TABLE IF NOT EXISTS promotions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    categoria TEXT, -- NULL = todas as categorias
    desconto INTEGER NOT NULL CHECK (desconto > 0 AND desconto <= 90),
    data_inicio TIMESTAMPTZ DEFAULT NOW(),
    data_fim TIMESTAMPTZ, -- NULL = sem prazo
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions(store_id, ativo);


-- 4. TABELA DE LISTA DE DESEJOS (WISHLIST)
-- Clientes podem salvar produtos favoritos
CREATE TABLE IF NOT EXISTS wishlist (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_client ON wishlist(client_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_store ON wishlist(store_id);


-- 5. TABELA DE AVALIAÇÕES DE PRODUTOS
-- Clientes podem avaliar e comentar produtos
CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_store ON product_reviews(store_id);


-- 6. ADICIONAR CAMPOS EXTRAS À TABELA DE PRODUTOS (SE NÃO EXISTIREM)
-- Mínimo de estoque customizável, localização, etc.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'estoque_minimo') THEN
        ALTER TABLE products ADD COLUMN estoque_minimo INTEGER DEFAULT 3;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'localizacao') THEN
        ALTER TABLE products ADD COLUMN localizacao TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'preco_prazo') THEN
        ALTER TABLE products ADD COLUMN preco_prazo DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'preco_custo') THEN
        ALTER TABLE products ADD COLUMN preco_custo DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cod_fabricante') THEN
        ALTER TABLE products ADD COLUMN cod_fabricante TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cod_fornecedor') THEN
        ALTER TABLE products ADD COLUMN cod_fornecedor TEXT;
    END IF;
END $$;


-- 7. RLS (Row Level Security) - Políticas de Segurança

-- Stock Movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own store movements" ON stock_movements;
CREATE POLICY "Users can read own store movements" ON stock_movements
    FOR SELECT USING (store_id IN (SELECT id FROM stores WHERE admin_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert own store movements" ON stock_movements;
CREATE POLICY "Users can insert own store movements" ON stock_movements
    FOR INSERT WITH CHECK (store_id IN (SELECT id FROM stores WHERE admin_id = auth.uid()));

-- Loyalty Points
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store admins can manage loyalty" ON loyalty_points;
CREATE POLICY "Store admins can manage loyalty" ON loyalty_points
    FOR ALL USING (store_id IN (SELECT id FROM stores WHERE admin_id = auth.uid()));
DROP POLICY IF EXISTS "Clients can view own points" ON loyalty_points;
CREATE POLICY "Clients can view own points" ON loyalty_points
    FOR SELECT USING (client_id = auth.uid());

-- Promotions
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store admins can manage promotions" ON promotions;
CREATE POLICY "Store admins can manage promotions" ON promotions
    FOR ALL USING (store_id IN (SELECT id FROM stores WHERE admin_id = auth.uid()));
DROP POLICY IF EXISTS "Anyone can view active promotions" ON promotions;
CREATE POLICY "Anyone can view active promotions" ON promotions
    FOR SELECT USING (ativo = true);

-- Wishlist
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own wishlist" ON wishlist;
CREATE POLICY "Users can manage own wishlist" ON wishlist
    FOR ALL USING (client_id = auth.uid());

-- Product Reviews
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read reviews" ON product_reviews;
CREATE POLICY "Anyone can read reviews" ON product_reviews
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create own reviews" ON product_reviews;
CREATE POLICY "Users can create own reviews" ON product_reviews
    FOR INSERT WITH CHECK (client_id = auth.uid());

-- ✅ Migração concluída!
SELECT 'Naxio Enterprise tables created successfully!' AS status;
