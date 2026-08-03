-- =============================================================================
-- 🏛️ NAXIO - MIGRAÇÃO: REFORMA TRIBUTÁRIA (IBS/CBS) + CORREÇÃO NCM
-- Data: 2026-04-29
-- Descrição:
--   1. Adiciona colunas fiscais que faltavam na tabela products
--      (ncm, cest, origem, cfop) para que o NCM NÃO SUMA ao salvar/editar.
--   2. Adiciona campos CBS (Contribuição sobre Bens e Serviços) e
--      IBS (Imposto sobre Bens e Serviços) conforme Reforma Tributária
--      (Lei Complementar 214/2025 - vigência a partir de 2026).
--   3. Estes campos ficam na tabela stores (configuração da loja)
--      e na tabela products (alíquota por produto se necessário).
--
-- INSTRUÇÕES:
--   Execute no SQL Editor do painel Supabase (https://supabase.co → SQL Editor)
-- =============================================================================


-- =============================================================================
-- PARTE 1: CORRIGIR TABELA products (CAMPOS FISCAIS QUE FALTAVAM)
-- Isso resolve o bug do NCM sumindo — sem estas colunas o Supabase
-- rejeita silenciosamente o campo ncm no update e ele fica como NULL.
-- =============================================================================

DO $$
BEGIN
    -- NCM: Nomenclatura Comum do Mercosul (8 dígitos)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'ncm'
    ) THEN
        ALTER TABLE products ADD COLUMN ncm TEXT;
        RAISE NOTICE '✅ Coluna ncm adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna ncm já existe em products';
    END IF;

    -- CEST: Código Especificador da Substituição Tributária (7 dígitos)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'cest'
    ) THEN
        ALTER TABLE products ADD COLUMN cest TEXT;
        RAISE NOTICE '✅ Coluna cest adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna cest já existe em products';
    END IF;

    -- ORIGEM: Origem da mercadoria (0=Nacional, 1=Estrangeira importada, etc.)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'origem'
    ) THEN
        ALTER TABLE products ADD COLUMN origem TEXT DEFAULT '0';
        RAISE NOTICE '✅ Coluna origem adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna origem já existe em products';
    END IF;

    -- CFOP: Código Fiscal de Operações e Prestações
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'cfop'
    ) THEN
        ALTER TABLE products ADD COLUMN cfop TEXT DEFAULT '5102';
        RAISE NOTICE '✅ Coluna cfop adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna cfop já existe em products';
    END IF;

    -- ALÍQUOTA CBS POR PRODUTO (Fase de Testes 2026)
    -- CBS (Teste) = 0.9%
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'aliquota_cbs'
    ) THEN
        ALTER TABLE products ADD COLUMN aliquota_cbs DECIMAL(5,4) DEFAULT 0.0090;
        RAISE NOTICE '✅ Coluna aliquota_cbs adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna aliquota_cbs já existe em products';
    END IF;

    -- ALÍQUOTA IBS POR PRODUTO (Fase de Testes 2026)
    -- IBS (Teste) = 0.1%
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'aliquota_ibs'
    ) THEN
        ALTER TABLE products ADD COLUMN aliquota_ibs DECIMAL(5,4) DEFAULT 0.0010;
        RAISE NOTICE '✅ Coluna aliquota_ibs adicionada em products';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna aliquota_ibs já existe em products';
    END IF;

END $$;


-- =============================================================================
-- PARTE 2: ADICIONAR CAMPOS CBS/IBS NA TABELA stores
-- Permite configurar alíquotas globais por loja (regime fiscal)
-- =============================================================================

DO $$
BEGIN
    -- Código de regime tributário da loja para CBS/IBS
    -- 1 = Simples Nacional (alíquota reduzida)
    -- 2 = Lucro Presumido
    -- 3 = Lucro Real
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'regime_cbs_ibs'
    ) THEN
        ALTER TABLE stores ADD COLUMN regime_cbs_ibs INTEGER DEFAULT 1;
        RAISE NOTICE '✅ Coluna regime_cbs_ibs adicionada em stores';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna regime_cbs_ibs já existe em stores';
    END IF;

    -- Alíquota global CBS configurada pelo lojista (Teste 2026)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'aliquota_cbs_loja'
    ) THEN
        ALTER TABLE stores ADD COLUMN aliquota_cbs_loja DECIMAL(5,4) DEFAULT 0.0090;
        RAISE NOTICE '✅ Coluna aliquota_cbs_loja adicionada em stores';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna aliquota_cbs_loja já existe em stores';
    END IF;

    -- Alíquota global IBS configurada pelo lojista (Teste 2026)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'aliquota_ibs_loja'
    ) THEN
        ALTER TABLE stores ADD COLUMN aliquota_ibs_loja DECIMAL(5,4) DEFAULT 0.0010;
        RAISE NOTICE '✅ Coluna aliquota_ibs_loja adicionada em stores';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna aliquota_ibs_loja já existe em stores';
    END IF;

    -- Flag: loja já aderiu ao split payment CBS/IBS (fase de transição)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stores' AND column_name = 'aderiu_split_payment'
    ) THEN
        ALTER TABLE stores ADD COLUMN aderiu_split_payment BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '✅ Coluna aderiu_split_payment adicionada em stores';
    ELSE
        RAISE NOTICE 'ℹ️  Coluna aderiu_split_payment já existe em stores';
    END IF;

END $$;


-- =============================================================================
-- PARTE 3: ÍNDICE PARA BUSCA RÁPIDA DE PRODUTOS SEM NCM
-- Facilita o relatório diário de produtos sem NCM para o gestor
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_sem_ncm
    ON products (store_id)
    WHERE ncm IS NULL OR ncm = '';

-- =============================================================================
-- VERIFICAÇÃO FINAL
-- =============================================================================

SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('ncm', 'cest', 'origem', 'cfop', 'aliquota_cbs', 'aliquota_ibs')
ORDER BY column_name;

SELECT
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'stores'
  AND column_name IN ('regime_cbs_ibs', 'aliquota_cbs_loja', 'aliquota_ibs_loja', 'aderiu_split_payment')
ORDER BY column_name;

SELECT 'Migração Reforma Tributária IBS/CBS concluída com sucesso! ✅' AS status;
