-- Auditoría integral IDEALO SV: trazabilidad de entrega y legado DTE.
-- Nota: deliveries.number ya es IDENTITY BY DEFAULT; no se crea una secuencia paralela.

-- Permite distinguir una reconstrucción histórica de una modalidad real inventada.
alter table public.deliveries drop constraint if exists deliveries_delivery_method_check;
alter table public.deliveries
  add constraint deliveries_delivery_method_check
  check (delivery_method = any (array['PICKUP'::text,'DELIVERY'::text,'INSTALLATION'::text,'HISTORICAL'::text]));

-- Reconstruye únicamente OTs que ya constaban como entregadas pero carecían de registro formal.
insert into public.deliveries(
  company_id, work_order_id, client_id, status, delivery_method,
  delivered_at, recipient_name, notes, created_at, updated_at
)
select
  w.company_id,
  w.id,
  w.client_id,
  'DELIVERED',
  'HISTORICAL',
  coalesce(w.delivered_at, w.updated_at, now()),
  null,
  'Registro reconstruido por auditoría integral: la OT ya constaba como DELIVERED antes de existir su trazabilidad formal. Modalidad y receptor no fueron inventados.',
  coalesce(w.delivered_at, w.updated_at, now()),
  coalesce(w.delivered_at, w.updated_at, now())
from public.work_orders w
where w.status = 'DELIVERED'
  and not exists (
    select 1 from public.deliveries d where d.work_order_id = w.id
  );

-- A partir de ahora ninguna OT puede pasar a DELIVERED sin una entrega confirmada.
create or replace function public._erp_require_delivery_before_delivered()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'DELIVERED'
     and (tg_op = 'INSERT' or old.status is distinct from 'DELIVERED')
     and not exists (
       select 1
       from public.deliveries d
       where d.work_order_id = new.id
         and d.status = 'DELIVERED'
     )
  then
    raise exception 'Confirmá la entrega desde el módulo Entrega antes de cerrar la OT como DELIVERED.';
  end if;
  return new;
end;
$$;

revoke all on function public._erp_require_delivery_before_delivered() from public;
revoke all on function public._erp_require_delivery_before_delivered() from authenticated;

drop trigger if exists trg_work_orders_require_delivery on public.work_orders;
create trigger trg_work_orders_require_delivery
before insert or update of status on public.work_orders
for each row execute function public._erp_require_delivery_before_delivered();

-- Completa trazabilidad final de documentos legacy sin inventar actor ni respuesta MH.
insert into public.dte_status_history(
  company_id, dte_document_id, from_status, to_status, environment,
  control_number, actor_user_id, source, detail, created_at
)
select
  d.company_id,
  d.id,
  null,
  d.status,
  d.environment,
  d.control_number,
  null,
  'INTEGRITY_BACKFILL',
  jsonb_build_object(
    'reason', 'Estado final reconstruido por auditoría integral',
    'legacy_record', true
  ),
  coalesce(d.updated_at, d.created_at, now())
from public.dte_documents d
where d.status in ('PROCESSED','REJECTED')
  and not exists (
    select 1
    from public.dte_status_history h
    where h.dte_document_id = d.id
      and h.to_status = d.status
  );
