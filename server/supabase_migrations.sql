-- =============================================================================
-- NAXIO - MIGRAÇÕES SUPABASE
-- Execute no SQL Editor do painel Supabase (https://supabase.co → SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COLUNA imprimir_cozinha na tabela comandas
--    Necessária para o canal Realtime de impressão funcionar.
--    Garçom seta true ao enviar pedido → Python service reseta para false após imprimir.
-- -----------------------------------------------------------------------------
ALTER TABLE comandas
    ADD COLUMN IF NOT EXISTS imprimir_cozinha BOOLEAN DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 2. FUNÇÃO append_comanda_items — APPEND ATÔMICO (resolve concorrência)
--    Em vez de: SELECT items → merge no JS → UPDATE (race condition possível)
--    Agora:     RPC faz tudo em 1 instrução SQL atômica no servidor Postgres.
--    Resultado: Zero perda de itens mesmo com 10 garçons ao mesmo tempo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_comanda_items(
    p_comanda_id  UUID,
    p_new_items   JSONB,
    p_obs_geral   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_id UUID;
BEGIN
    UPDATE comandas
    SET
        -- COALESCE garante que se items for NULL não quebra
        items            = COALESCE(items, '[]'::jsonb) || p_new_items,
        status           = 'ocupada',
        imprimir_cozinha = TRUE,
        updated_at       = NOW(),
        -- Só sobrescreve obs_geral se foi enviada uma nova (não apaga obs anterior)
        obs_geral        = CASE
                               WHEN p_obs_geral IS NOT NULL AND p_obs_geral <> ''
                               THEN p_obs_geral
                               ELSE obs_geral
                           END
    WHERE id = p_comanda_id
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. COLUNA payments_info na tabela orders
--    Necessária para notas pendentes emitirem o método de pagamento correto.
--    Tipo JSONB para armazenar array de pagamentos [{tipo, valor}, ...]
-- -----------------------------------------------------------------------------
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payments_info JSONB DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 4. ÍNDICE de performance na tabela comandas
--    Acelera o polling do Python print_service (filtra por store_id + status)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comandas_store_status
    ON comandas (store_id, status)
    WHERE status NOT IN ('fechada', 'arquivada');

-- -----------------------------------------------------------------------------
-- 5. ÍNDICE para o canal Realtime de impressão
--    Acelera queries por store_id + imprimir_cozinha = true
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comandas_print_flag
    ON comandas (store_id, imprimir_cozinha)
    WHERE imprimir_cozinha = TRUE;

-- =============================================================================
-- VERIFICAÇÃO (rode após as migrações para confirmar)
-- =============================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'comandas'
-- ORDER BY ordinal_position;

-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_name = 'append_comanda_items';
