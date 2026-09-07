create extension if not exists pg_cron;

select cron.schedule(
  'saas-commercial-reminders',
  '23 * * * *',
  $$select public.saas_refresh_commercial_lifecycle();$$
);
