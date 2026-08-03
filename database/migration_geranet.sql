-- Migração para a API Fiscal da Geranet
-- Adiciona os campos necessários para o certificado digital A1 em formato Hexadecimal e a senha,
-- bem como os campos para o CSC exigido pela NFC-e.

ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS certificado_hex TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS senha_certificado VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS csc_id VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS csc_token VARCHAR(255) DEFAULT NULL;
