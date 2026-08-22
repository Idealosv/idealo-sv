alter table cash_movements drop constraint if exists cash_movements_source_type_check;
alter table cash_movements add constraint cash_movements_source_type_check check (source_type in ('MANUAL','CUSTOMER_PAYMENT','PURCHASE','EXPENSE','SUPPLIER_PAYMENT','PAYROLL','OTHER'));
create unique index if not exists cash_payroll_once_idx on cash_movements(company_id,source_type,source_id) where source_type='PAYROLL' and source_id is not null;

create or replace function recalc_payroll_run_totals() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_run uuid:=coalesce(new.payroll_run_id,old.payroll_run_id);
begin
 update payroll_runs r set gross_total=x.gross,deductions_total=x.ded,net_total=x.net,updated_at=now()
 from (select coalesce(sum(gross_pay),0) gross,coalesce(sum(deductions),0) ded,coalesce(sum(net_pay),0) net from payroll_items where payroll_run_id=v_run) x where r.id=v_run;
 return coalesce(new,old);
end $$;
drop trigger if exists payroll_item_totals_sync on payroll_items;
create trigger payroll_item_totals_sync after insert or update or delete on payroll_items for each row execute function recalc_payroll_run_totals();

create or replace function pay_payroll_run(target_run_id uuid,target_cash_account_id uuid) returns payroll_runs language plpgsql security invoker set search_path=public as $$
declare r payroll_runs; a cash_accounts;
begin
 select * into r from payroll_runs where id=target_run_id for update;
 if r.id is null or not is_company_member(r.company_id) then raise exception 'Planilla no disponible'; end if;
 if r.status='PAID' then raise exception 'La planilla ya fue pagada'; end if;
 if r.status='CANCELLED' then raise exception 'La planilla está cancelada'; end if;
 select * into a from cash_accounts where id=target_cash_account_id and company_id=r.company_id and active=true;
 if a.id is null then raise exception 'Caja o banco no válido'; end if;
 if r.net_total<=0 then raise exception 'La planilla no tiene monto neto a pagar'; end if;
 insert into cash_movements(company_id,cash_account_id,movement_type,source_type,source_id,concept,amount,reference)
 values(r.company_id,a.id,'EXPENSE','PAYROLL',r.id,'Pago de planilla '||r.period_start||' a '||r.period_end,r.net_total,'PLANILLA')
 on conflict (company_id,source_type,source_id) where source_type='PAYROLL' and source_id is not null do nothing;
 update payroll_runs set status='PAID',pay_date=current_date,updated_at=now() where id=r.id returning * into r;
 update employee_commissions c set status='PAID' where c.company_id=r.company_id and c.status='PENDING' and c.commission_date between r.period_start and r.period_end and exists(select 1 from payroll_items pi where pi.payroll_run_id=r.id and pi.employee_id=c.employee_id);
 return r;
end $$;
revoke all on function pay_payroll_run(uuid,uuid) from public,anon;
grant execute on function pay_payroll_run(uuid,uuid) to authenticated;
