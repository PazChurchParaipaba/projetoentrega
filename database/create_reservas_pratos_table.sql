-- ========================================================================
-- 📅 TABELA DE RESERVAS DE PRATOS
-- Sistema de reservas de pratos para almoço (09:00 - 11:30)
-- ========================================================================

CREATE TABLE IF NOT EXISTS reservas_pratos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    comanda_id UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
    mesa_numero INTEGER,
    garcom_nome TEXT NOT NULL,
    produto_nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    observacoes TEXT,
    data_reserva DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'preparando', 'pronto', 'entregue', 'cancelado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_reservas_pratos_store ON reservas_pratos(store_id);
CREATE INDEX IF NOT EXISTS idx_reservas_pratos_comanda ON reservas_pratos(comanda_id);
CREATE INDEX IF NOT EXISTS idx_reservas_pratos_data ON reservas_pratos(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_pratos_status ON reservas_pratos(status);

-- ========================================================================
-- 🔒 ROW LEVEL SECURITY (RLS)
-- ========================================================================

ALTER TABLE reservas_pratos ENABLE ROW LEVEL SECURITY;

-- Policy: Usuários autenticados podem ver reservas da sua loja
CREATE POLICY "Users can view their store reservations"
ON reservas_pratos FOR SELECT
TO authenticated
USING (
    store_id IN (
        SELECT id FROM stores WHERE admin_id = auth.uid()
        UNION
        SELECT store_id FROM profiles WHERE id = auth.uid()
    )
);

-- Policy: Usuários autenticados podem inserir reservas na sua loja
CREATE POLICY "Users can insert reservations for their store"
ON reservas_pratos FOR INSERT
TO authenticated
WITH CHECK (
    store_id IN (
        SELECT id FROM stores WHERE admin_id = auth.uid()
        UNION
        SELECT store_id FROM profiles WHERE id = auth.uid()
    )
);

-- Policy: Usuários autenticados podem atualizar reservas da sua loja
CREATE POLICY "Users can update their store reservations"
ON reservas_pratos FOR UPDATE
TO authenticated
USING (
    store_id IN (
        SELECT id FROM stores WHERE admin_id = auth.uid()
        UNION
        SELECT store_id FROM profiles WHERE id = auth.uid()
    )
);

-- Policy: Usuários autenticados podem deletar reservas da sua loja
CREATE POLICY "Users can delete their store reservations"
ON reservas_pratos FOR DELETE
TO authenticated
USING (
    store_id IN (
        SELECT id FROM stores WHERE admin_id = auth.uid()
        UNION
        SELECT store_id FROM profiles WHERE id = auth.uid()
    )
);

-- ========================================================================
-- 🔄 TRIGGER PARA ATUALIZAR updated_at
-- ========================================================================

CREATE OR REPLACE FUNCTION update_reservas_pratos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reservas_pratos_updated_at
BEFORE UPDATE ON reservas_pratos
FOR EACH ROW
EXECUTE FUNCTION update_reservas_pratos_updated_at();

-- ========================================================================
-- 📊 COMENTÁRIOS
-- ========================================================================

COMMENT ON TABLE reservas_pratos IS 'Reservas de pratos para almoço (09:00-11:30)';
COMMENT ON COLUMN reservas_pratos.store_id IS 'ID da loja';
COMMENT ON COLUMN reservas_pratos.comanda_id IS 'ID da comanda onde o item foi lançado';
COMMENT ON COLUMN reservas_pratos.mesa_numero IS 'Número da mesa';
COMMENT ON COLUMN reservas_pratos.garcom_nome IS 'Nome do garçom que lançou';
COMMENT ON COLUMN reservas_pratos.produto_nome IS 'Nome do prato reservado';
COMMENT ON COLUMN reservas_pratos.quantidade IS 'Quantidade reservada';
COMMENT ON COLUMN reservas_pratos.preco_unitario IS 'Preço unitário do prato';
COMMENT ON COLUMN reservas_pratos.observacoes IS 'Observações do pedido';
COMMENT ON COLUMN reservas_pratos.data_reserva IS 'Data da reserva';
COMMENT ON COLUMN reservas_pratos.status IS 'Status: pendente, preparando, pronto, entregue, cancelado';
