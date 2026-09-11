-- El corte final debe registrarse mientras la sesión todavía está ABIERTA.
create or replace function public.bar_close_cash_with_count(p_session uuid,p_counts jsonb default '[]'::jsonb,p_notes text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s public.cash_register_sessions%rowtype;v_counted numeric:=0;v_in numeric:=0;v_out numeric:=0;v_expected numeric;v_diff numeric;v_pending int;v_open_sessions int;r jsonb;v_denom numeric;v_qty int;v_notes text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if auth.uid() is null then raise exception 'No autenticado.'; end if;
 select * into s from public.cash_register_sessions where id=p_session for update;
 if not found then raise exception 'Turno de caja no encontrado.'; end if;
 if s.status<>'OPEN' then raise exception 'La caja ya está cerrada.'; end if;
 if not public.bar_has_permission(s.company_id,'cash.close') and not public.bar_has_permission(s.company_id,'admin.manage') then raise exception 'Tu rol no puede cerrar caja.'; end if;
 select count(*) into v_open_sessions from public.cash_register_sessions where company_id=s.company_id and status='OPEN';
 if v_open_sessions>1 and s.opened_by is distinct from auth.uid() and not public.bar_has_permission(s.company_id,'admin.manage') then raise exception 'Hay varias cajas abiertas. Solo podés cerrar tu propio turno.'; end if;
 if jsonb_typeof(coalesce(p_counts,'[]'::jsonb))<>'array' then raise exception 'Conteo de efectivo inválido.'; end if;
 delete from public.bar_cash_count_lines where session_id=s.id;
 for r in select * from jsonb_array_elements(coalesce(p_counts,'[]'::jsonb)) loop
  v_denom:=round(coalesce((r->>'denomination')::numeric,0),2);v_qty:=coalesce((r->>'quantity')::int,0);
  if v_denom<=0 or v_qty<0 then raise exception 'Denominación o cantidad inválida.'; end if;
  if v_qty>0 then
   insert into public.bar_cash_count_lines(session_id,company_id,denomination,quantity)
   values(s.id,s.company_id,v_denom,v_qty)
   on conflict(session_id,denomination) do update set quantity=excluded.quantity,created_by=auth.uid(),created_at=now();
   v_counted:=v_counted+v_denom*v_qty;
  end if;
 end loop;
 v_counted:=round(v_counted,2);
 select coalesce(sum(case when movement_type in ('INCOME','TRANSFER_IN') then amount else 0 end),0),coalesce(sum(case when movement_type in ('EXPENSE','TRANSFER_OUT') then amount else 0 end),0)
 into v_in,v_out from public.cash_movements where cash_register_session_id=s.id;
 v_expected:=round(s.opening_balance+v_in-v_out,2);v_diff:=round(v_counted-v_expected,2);
 select count(*) into v_pending from public.bar_payments where cash_register_session_id=s.id and financial_posting_status<>'posted';
 if v_pending>0 then raise exception 'No se puede cerrar: hay % cobro(s) pendientes de contabilizar.',v_pending; end if;
 if abs(v_diff)>=0.01 and v_notes is null then raise exception 'Hay una diferencia de %. Es obligatorio indicar el motivo antes de cerrar.',v_diff; end if;
 insert into public.cash_register_cuts(session_id,company_id,cash_account_id,expected_balance,income_total,expense_total,movement_count,created_by,notes)
 select s.id,s.company_id,s.cash_account_id,v_expected,v_in,v_out,count(*),auth.uid(),'CIERRE FINAL · contado '||to_char(v_counted,'FM999999990.00')||' · diferencia '||to_char(v_diff,'FM999999990.00')
 from public.cash_movements where cash_register_session_id=s.id;
 update public.cash_register_sessions
 set status='CLOSED',closing_counted=v_counted,closing_expected=v_expected,difference=v_diff,notes=v_notes,closed_at=now(),closed_by=auth.uid()
 where id=s.id;
 return jsonb_build_object('session_id',s.id,'expected',v_expected,'counted',v_counted,'difference',v_diff,'income_total',round(v_in,2),'expense_total',round(v_out,2),'closed',true);
end;$$;
revoke execute on function public.bar_close_cash_with_count(uuid,jsonb,text) from public,anon;
grant execute on function public.bar_close_cash_with_count(uuid,jsonb,text) to authenticated;
