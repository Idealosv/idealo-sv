create table if not exists public.crm_opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  from_stage text null,
  to_stage text not null,
  probability smallint not null,
  amount numeric(14,2) not null default 0,
  changed_by uuid null references auth.users(id) on delete set null,
  note text null,
  created_at timestamptz not null default now()
);

alter table public.crm_opportunity_stage_history enable row level security;
create index if not exists crm_stage_history_opp_idx on public.crm_opportunity_stage_history(opportunity_id, created_at desc);

drop policy if exists crm_stage_history_select_company on public.crm_opportunity_stage_history;
create policy crm_stage_history_select_company on public.crm_opportunity_stage_history for select to authenticated
using (public.is_company_member(company_id));

grant select on public.crm_opportunity_stage_history to authenticated;
revoke all on public.crm_opportunity_stage_history from anon;

create or replace function public.crm_track_stage_change()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if tg_op='INSERT' or old.stage is distinct from new.stage or old.probability is distinct from new.probability or old.amount is distinct from new.amount then
    insert into public.crm_opportunity_stage_history(company_id,opportunity_id,from_stage,to_stage,probability,amount,changed_by,note)
    values(new.company_id,new.id,case when tg_op='INSERT' then null else old.stage end,new.stage,new.probability,new.amount,auth.uid(),
      case when new.stage='LOST' then new.lost_reason else null end);
  end if;
  return new;
end;
$$;

drop trigger if exists crm_opportunity_stage_history_trg on public.crm_opportunities;
create trigger crm_opportunity_stage_history_trg
after insert or update on public.crm_opportunities
for each row execute function public.crm_track_stage_change();
