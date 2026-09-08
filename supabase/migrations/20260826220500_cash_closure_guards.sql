-- IDEALO SV · Un cierre diario congela el día para esa cuenta.
create or replace function public.guard_closed_cash_day()
returns trigger language plpgsql security invoker set search_path='public' as $$
declare v_account uuid; v_company uuid; v_date date;
begin
  v_account:=coalesce(new.cash_account_id,old.cash_account_id);
  v_company:=coalesce(new.company_id,old.company_id);
  v_date:=coalesce(new.movement_date,old.movement_date)::date;
  if exists(select 1 from public.cash_daily_closures c where c.company_id=v_company and c.cash_account_id=v_account and c.closure_date=v_date) then
    raise exception 'El día ya fue cerrado para esta caja o banco';
  end if;
  return coalesce(new,old);
end; $$;
revoke all on function public.guard_closed_cash_day() from public,anon,authenticated;
drop trigger if exists trg_guard_closed_cash_day on public.cash_movements;
create trigger trg_guard_closed_cash_day before insert or update or delete on public.cash_movements for each row execute function public.guard_closed_cash_day();

create or replace function public.guard_cash_daily_closure_immutability()
returns trigger language plpgsql security invoker set search_path='public' as $$
begin
  raise exception 'Un cierre diario es inmutable';
end; $$;
revoke all on function public.guard_cash_daily_closure_immutability() from public,anon,authenticated;
drop trigger if exists trg_guard_cash_daily_closure_immutability on public.cash_daily_closures;
create trigger trg_guard_cash_daily_closure_immutability before update or delete on public.cash_daily_closures for each row execute function public.guard_cash_daily_closure_immutability();
