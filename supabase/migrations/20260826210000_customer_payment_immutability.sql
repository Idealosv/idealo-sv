-- IDEALO SV · Integridad Facturación -> CxC -> Caja
-- Un cobro aplicado genera un movimiento de caja y no debe poder editarse o borrarse
-- por CRUD directo, porque eso desincronizaría CxC y Caja/Bancos.

create or replace function public.guard_customer_payment_immutability()
returns trigger
language plpgsql
security invoker
set search_path='public'
as $$
begin
  raise exception 'Un cobro aplicado no se puede editar ni eliminar. Registrá una reversión controlada.';
end;
$$;

revoke all on function public.guard_customer_payment_immutability() from public,anon,authenticated;

drop trigger if exists trg_guard_customer_payment_immutability on public.customer_payments;
create trigger trg_guard_customer_payment_immutability
before update or delete on public.customer_payments
for each row execute function public.guard_customer_payment_immutability();
