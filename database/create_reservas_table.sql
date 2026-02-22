-- Script SQL para criar a tabela de reservas_dia no Supabase
-- Execute este script no SQL Editor do Supabase

-- Cria a tabela de reservas do dia
CREATE TABLE IF NOT EXISTS public.reservas_dia (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    cliente_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    data_reserva DATE NOT NULL,
    horario_reserva TIME NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacoes TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'vinculada', 'cancelada')),
    comanda_id UUID REFERENCES public.comandas(id) ON DELETE SET NULL,
    vinculada_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Cria índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_reservas_dia_store_id ON public.reservas_dia(store_id);
CREATE INDEX IF NOT EXISTS idx_reservas_dia_data_reserva ON public.reservas_dia(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_dia_status ON public.reservas_dia(status);
CREATE INDEX IF NOT EXISTS idx_reservas_dia_comanda_id ON public.reservas_dia(comanda_id);

-- Habilita Row Level Security (RLS)
ALTER TABLE public.reservas_dia ENABLE ROW LEVEL SECURITY;

-- Política para permitir que usuários vejam apenas reservas da própria loja
CREATE POLICY "Usuários podem ver reservas da própria loja"
    ON public.reservas_dia
    FOR SELECT
    USING (
        store_id IN (
            SELECT id FROM public.stores 
            WHERE admin_id = auth.uid()
        )
    );

-- Política para permitir que usuários criem reservas
CREATE POLICY "Usuários podem criar reservas"
    ON public.reservas_dia
    FOR INSERT
    WITH CHECK (
        store_id IN (
            SELECT id FROM public.stores 
            WHERE admin_id = auth.uid()
        )
    );

-- Política para permitir que usuários atualizem reservas da própria loja
CREATE POLICY "Usuários podem atualizar reservas da própria loja"
    ON public.reservas_dia
    FOR UPDATE
    USING (
        store_id IN (
            SELECT id FROM public.stores 
            WHERE admin_id = auth.uid()
        )
    );

-- Política para permitir que usuários deletem reservas da própria loja
CREATE POLICY "Usuários podem deletar reservas da própria loja"
    ON public.reservas_dia
    FOR DELETE
    USING (
        store_id IN (
            SELECT id FROM public.stores 
            WHERE admin_id = auth.uid()
        )
    );

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_reservas_dia_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_reservas_dia_updated_at
    BEFORE UPDATE ON public.reservas_dia
    FOR EACH ROW
    EXECUTE FUNCTION update_reservas_dia_updated_at();

-- Comentários para documentação
COMMENT ON TABLE public.reservas_dia IS 'Armazena reservas de almoço/jantar para restaurantes';
COMMENT ON COLUMN public.reservas_dia.items IS 'Array JSON com os itens do pedido da reserva';
COMMENT ON COLUMN public.reservas_dia.status IS 'Status da reserva: pendente, vinculada (à comanda), ou cancelada';
COMMENT ON COLUMN public.reservas_dia.comanda_id IS 'ID da comanda real à qual a reserva foi vinculada';
COMMENT ON COLUMN public.reservas_dia.vinculada_em IS 'Timestamp de quando a reserva foi vinculada à comanda';
