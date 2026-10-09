-- Process only approved verified requests; row locks prevent duplicate withdrawals.
create function public.prestaditos_process_request(p_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
 v public.prestaditos_requests%rowtype;
 v_balance numeric;
 v_kind text;
begin
 if not exists(select 1 from public.prestaditos_staff where user_id=auth.uid() and role='admin')
 then raise exception 'Administrador requerido'; end if;
 select * into v from public.prestaditos_requests where id=p_id for update;
 if not found or v.status<>'approved' then raise exception 'Primero apruebe la solicitud'; end if;
 perform 1 from public.prestaditos_investors where id=v.investor_id for update;
 if v.request_type='contribution' then
   v_kind:='capital_in';
 elsif v.withdrawal_source='capital' then
   v_kind:='capital_out';
   select coalesce(sum(case movement_type when 'capital_in' then amount when 'capital_out' then -amount else 0 end),0)
     into v_balance from public.prestaditos_ledger where investor_id=v.investor_id;
   if v.amount>v_balance then raise exception 'Capital insuficiente'; end if;
 else
   v_kind:='yield_paid';
   select coalesce(sum(case movement_type when 'yield' then amount when 'yield_paid' then -amount else 0 end),0)
     into v_balance from public.prestaditos_ledger where investor_id=v.investor_id;
   if v.amount>v_balance then raise exception 'Rendimientos insuficientes'; end if;
 end if;
 insert into public.prestaditos_ledger(investor_id,request_id,movement_type,amount,notes,created_by)
 values(v.investor_id,v.id,v_kind,v.amount,'Solicitud procesada',auth.uid());
 update public.prestaditos_requests set status='processed',reviewed_by=auth.uid(),reviewed_at=now()
 where id=v.id;
end $$;
revoke all on function public.prestaditos_process_request(uuid) from public,anon;
grant execute on function public.prestaditos_process_request(uuid) to authenticated;
