create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  source_quote_id uuid null references public.quotes(id) on delete set null,
  title text not null,
  stage text not null default 'PROSPECT' check (stage in ('PROSPECT','QUOTED','NEGOTIATION','WON','LOST')),
  probability smallint not null default 10 check (probability between 0 and 100),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  expected_close_date date null,
  lost_reason text null,
  notes text null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  won_at timestamptz null,
  lost_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_opportunities_quote_unique on public.crm_opportunities(source_quote_id) where source_quote_id is not null;
create index if not exists crm_opportunities_company_stage_idx on public.crm_opportunities(company_id, stage, expected_close_date);
create index if not exists crm_opportunities_client_idx on public.crm_opportunities(company_id, client_id);

alter table public.crm_opportunities enable row level security;

drop policy if exists crm_opportunities_select_company on public.crm_opportunities;
create policy crm_opportunities_select_company on public.crm_opportunities for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists crm_opportunities_insert_company on public.crm_opportunities;
create policy crm_opportunities_insert_company on public.crm_opportunities for insert to authenticated
with check (public.is_company_member(company_id));

drop policy if exists crm_opportunities_update_company on public.crm_opportunities;
create policy crm_opportunities_update_company on public.crm_opportunities for update to authenticated
using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

drop policy if exists crm_opportunities_delete_company on public.crm_opportunities;
create policy crm_opportunities_delete_company on public.crm_opportunities for delete to authenticated
using (public.is_company_member(company_id));

grant select, insert, update, delete on public.crm_opportunities to authenticated;
revoke all on public.crm_opportunities from anon;

create or replace function public.sync_crm_opportunities_from_quotes(p_company_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer := 0;
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'No autorizado para esta empresa';
  end if;

  insert into public.crm_opportunities(company_id, client_id, source_quote_id, title, stage, probability, amount, expected_close_date, notes)
  select q.company_id, q.client_id, q.id,
         'Cotización COT-' || q.number,
         case
           when q.status = 'CONVERTED' then 'WON'
           when q.status in ('REJECTED','EXPIRED') then 'LOST'
           when q.status = 'APPROVED' then 'NEGOTIATION'
           else 'QUOTED'
         end,
         case
           when q.status = 'CONVERTED' then 100
           when q.status in ('REJECTED','EXPIRED') then 0
           when q.status = 'APPROVED' then 75
           else 35
         end,
         coalesce(q.total,0), q.valid_until, q.notes
  from public.quotes q
  where q.company_id = p_company_id
    and q.client_id is not null
    and not exists (select 1 from public.crm_opportunities o where o.source_quote_id = q.id);
  get diagnostics affected = row_count;

  update public.crm_opportunities o
  set stage = 'WON', probability = 100, amount = coalesce(q.total,o.amount), won_at = coalesce(o.won_at,now()), lost_at = null, lost_reason = null, updated_at = now()
  from public.quotes q
  where o.source_quote_id = q.id and q.company_id = p_company_id and q.status = 'CONVERTED' and o.stage <> 'WON';

  update public.crm_opportunities o
  set stage = 'LOST', probability = 0, amount = coalesce(q.total,o.amount), lost_at = coalesce(o.lost_at,now()), won_at = null,
      lost_reason = coalesce(o.lost_reason, case when q.status='EXPIRED' then 'Cotización expirada' else 'Cotización rechazada' end), updated_at = now()
  from public.quotes q
  where o.source_quote_id = q.id and q.company_id = p_company_id and q.status in ('REJECTED','EXPIRED') and o.stage <> 'LOST';

  return affected;
end;
$$;

grant execute on function public.sync_crm_opportunities_from_quotes(uuid) to authenticated;
revoke execute on function public.sync_crm_opportunities_from_quotes(uuid) from anon;

create or replace view public.crm_pipeline_forecast with (security_invoker=true) as
select
  company_id,
  stage,
  count(*)::int as opportunity_count,
  coalesce(sum(amount),0)::numeric(14,2) as pipeline_amount,
  coalesce(sum(amount * probability / 100.0),0)::numeric(14,2) as weighted_forecast,
  coalesce(avg(probability),0)::numeric(6,2) as avg_probability
from public.crm_opportunities
group by company_id, stage;

grant select on public.crm_pipeline_forecast to authenticated;
revoke all on public.crm_pipeline_forecast from anon;
