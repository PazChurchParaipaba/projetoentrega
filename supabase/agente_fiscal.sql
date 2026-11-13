-- ============================================================================
-- 🤖 AGENTE FISCAL NAXIO — rodar UMA vez no SQL Editor do Supabase
-- Chama a rota /api/agente_fiscal a cada 2 minutos (emite notas pendentes de
-- Cartão/Pix, inclusive misturadas com dinheiro, e cancela na SEFAZ as notas de
-- vendas estornadas/reabertas/canceladas).
--
-- Não precisa de nenhuma configuração extra: é só rodar este arquivo inteiro.
-- (Opcional: para proteger a rota, defina AGENT_SECRET na Vercel e adicione
--  "x-agent-secret":"SEU_SEGREDO" nos headers abaixo.)
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove agendamento antigo (se existir)
do $$
begin
  perform cron.unschedule('naxio_agente_fiscal');
exception when others then null;
end $$;

select cron.schedule(
  'naxio_agente_fiscal',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://naxiosoftware.vercel.app/api/agente_fiscal',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);

-- Conferir se está rodando:
--   select * from cron.job where jobname = 'naxio_agente_fiscal';
--   select status_code, content::text, created from net._http_response order by created desc limit 5;
-- Parar o agente:
--   select cron.unschedule('naxio_agente_fiscal');

