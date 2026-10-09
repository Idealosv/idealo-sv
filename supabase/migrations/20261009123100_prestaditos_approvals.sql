-- Approval functions: only specifically appointed Prestaditos admins.
create function public.prestaditos_review_investor(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.prestaditos_staff where user_id=auth.uid() and role='admin')
 then raise exception 'Administrador requerido'; end if;
 if p_status not in ('approved','rejected') then raise exception 'Estado inválido'; end if;
 update public.prestaditos_investors set approval_status=p_status
 where id=p_id and approval_status='pending';
 if not found then raise exception 'Registro ya revisado o inexistente'; end if;
end $$;
create function public.prestaditos_review_request(p_id uuid,p_status text,p_notes text default '')
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.prestaditos_staff where user_id=auth.uid() and role='admin')
 then raise exception 'Administrador requerido'; end if;
 if p_status not in ('review','approved','rejected') then raise exception 'Estado inválido'; end if;
 if length(coalesce(p_notes,''))>1000 then raise exception 'Observación muy larga'; end if;
 update public.prestaditos_requests set status=p_status,admin_notes=coalesce(p_notes,''),
 reviewed_by=auth.uid(),reviewed_at=now()
 where id=p_id and status in ('pending','review');
 if not found then raise exception 'Solicitud no revisable'; end if;
end $$;
revoke all on function public.prestaditos_review_investor(uuid,text),
 public.prestaditos_review_request(uuid,text,text) from public,anon;
grant execute on function public.prestaditos_review_investor(uuid,text),
 public.prestaditos_review_request(uuid,text,text) to authenticated;
