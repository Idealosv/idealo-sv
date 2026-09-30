-- PRESTADITO$ / IDEALO SV
-- Compatibilidad para entornos donde la migración anterior ya fue aplicada:
-- los porcentajes 10%, 12% y 15% quedan definidos como ANUALES.

alter table public.inv_investments
  alter column return_rate_basis set default 'ANNUAL';

update public.inv_investments
set return_rate_basis='ANNUAL'
where agreed_return_rate in (10,12,15)
  and return_rate_basis<>'ANNUAL';

update public.inv_contracts
set rate_basis='ANNUAL'
where return_rate_percent in (10,12,15)
  and rate_basis<>'ANNUAL';

create or replace function public.inv_force_annual_investment_rate_basis()
returns trigger
language plpgsql
as $$
begin
  if new.agreed_return_rate in (10,12,15) then
    new.return_rate_basis:='ANNUAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inv_force_annual_investment_rate_basis on public.inv_investments;
create trigger trg_inv_force_annual_investment_rate_basis
before insert or update of agreed_return_rate,return_rate_basis
on public.inv_investments
for each row execute function public.inv_force_annual_investment_rate_basis();

create or replace function public.inv_force_annual_contract_rate_basis()
returns trigger
language plpgsql
as $$
begin
  if new.return_rate_percent in (10,12,15) then
    new.rate_basis:='ANNUAL';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inv_force_annual_contract_rate_basis on public.inv_contracts;
create trigger trg_inv_force_annual_contract_rate_basis
before insert or update of return_rate_percent,rate_basis
on public.inv_contracts
for each row execute function public.inv_force_annual_contract_rate_basis();

comment on column public.inv_investments.agreed_return_rate is
'Porcentaje anual acordado. Valores actualmente informados: 10, 12 o 15.';

comment on column public.inv_investments.return_rate_basis is
'Base temporal del porcentaje; para 10/12/15 corresponde a ANNUAL.';

comment on column public.inv_contracts.return_rate_percent is
'Porcentaje anual acordado del contrato.';

comment on column public.inv_contracts.rate_basis is
'Base del porcentaje contractual; actualmente ANNUAL para 10/12/15.';
