-- Eventos nuevos de la normativa MH 2.0. Se habilita únicamente el almacenamiento
-- de borradores; ninguna ruta nueva transmite a Hacienda.
alter table public.dte_fiscal_events
  drop constraint if exists dte_fiscal_events_event_type_check;
alter table public.dte_fiscal_events
  add constraint dte_fiscal_events_event_type_check
  check (event_type in ('INVALIDATION','CONTINGENCY','RETURN','SPECIAL_OPERATIONS'));
create index if not exists idx_dte_fiscal_events_certification
  on public.dte_fiscal_events(company_id,environment,event_type,status,created_at desc);
