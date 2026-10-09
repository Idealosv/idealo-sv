-- Explicitly documented yields; never generated automatically or promised.
create function public.prestaditos_record_yield(p_investor uuid,p_amount numeric,p_notes text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.prestaditos_staff where user_id=auth.uid() and role='admin')
 then raise exception 'Administrador requerido'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999999.99 then raise exception 'Monto inválido'; end if;
 if length(trim(coalesce(p_notes,'')))<5 or length(p_notes)>1000 then raise exception 'Incluya la referencia del rendimiento'; end if;
 perform 1 from public.prestaditos_investors where id=p_investor and approval_status='approved' for update;
 if not found then raise exception 'Inversionista no aprobado'; end if;
 insert into public.prestaditos_ledger(investor_id,movement_type,amount,notes,created_by)
 values(p_investor,'yield',p_amount,trim(p_notes),auth.uid());
end $$;
revoke all on function public.prestaditos_record_yield(uuid,numeric,text) from public,anon;
grant execute on function public.prestaditos_record_yield(uuid,numeric,text) to authenticated;
