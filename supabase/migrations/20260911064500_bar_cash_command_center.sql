create or replace function public.bar_cash_dashboard(p_company uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
begin
  if not (public.erp_can_admin(p_company) or public.bar_has_permission(p_company,'cash.view')) then
    raise exception 'Tu rol no puede consultar Caja';
  end if;

  return jsonb_build_object(
    'movements', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.movement_date desc)
      from (
        select id,company_id,cash_account_id,movement_date,movement_type,source_type,source_id,concept,amount,reference,notes,cash_register_session_id,created_at
        from public.cash_movements
        where company_id=p_company
        order by movement_date desc
        limit 300
      ) m
    ), '[]'::jsonb),
    'cuts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.cut_at desc)
      from (
        select id,session_id,company_id,cash_account_id,cut_at,expected_balance,income_total,expense_total,movement_count,created_by,notes
        from public.cash_register_cuts
        where company_id=p_company
        order by cut_at desc
        limit 60
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.bar_cash_dashboard(uuid) to authenticated;

create or replace function public.bar_register_cash_movement(
  p_session uuid,
  p_movement_type text,
  p_amount numeric,
  p_concept text,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  s public.cash_register_sessions%rowtype;
  v_type text:=upper(trim(coalesce(p_movement_type,'')));
  v_id uuid;
begin
  select * into s from public.cash_register_sessions where id=p_session for update;
  if not found then raise exception 'Turno de caja no encontrado'; end if;
  if s.status<>'OPEN' then raise exception 'La caja está cerrada'; end if;
  if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.cut')) then
    raise exception 'Tu rol no puede registrar movimientos de caja';
  end if;
  if v_type not in ('INCOME','EXPENSE') then raise exception 'Tipo de movimiento inválido'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if char_length(trim(coalesce(p_concept,'')))<4 then raise exception 'Indicá el concepto del movimiento'; end if;

  insert into public.cash_movements(
    company_id,cash_account_id,movement_type,source_type,concept,amount,reference,notes,cash_register_session_id
  ) values(
    s.company_id,s.cash_account_id,v_type,'MANUAL',trim(p_concept),round(p_amount,2),nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),s.id
  ) returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.bar_register_cash_movement(uuid,text,numeric,text,text,text) to authenticated;

create or replace function public.bar_close_cash_register(p_session uuid,p_counted numeric,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  s public.cash_register_sessions%rowtype;
  v_open_orders integer;
begin
  select * into s from public.cash_register_sessions where id=p_session;
  if not found then raise exception 'Turno de caja no encontrado'; end if;
  if not (public.erp_can_admin(s.company_id) or public.bar_has_permission(s.company_id,'cash.close')) then
    raise exception 'Tu rol no puede cerrar caja';
  end if;
  select count(*) into v_open_orders
  from public.bar_orders
  where company_id=s.company_id and status in ('open','sent','preparing','ready','served');
  if v_open_orders>0 then
    raise exception 'No podés cerrar caja: hay % pedido(s) activo(s)',v_open_orders;
  end if;
  return public.close_cash_register(p_session,p_counted,p_notes);
end;
$$;

grant execute on function public.bar_close_cash_register(uuid,numeric,text) to authenticated;
