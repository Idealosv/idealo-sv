-- Auditoría maestra: impedir estados financieros imposibles incluso si una UI futura falla.

alter table public.accounts_receivable
  add constraint accounts_receivable_paid_not_over_total
  check (amount_paid <= amount_total);

alter table public.accounts_payable
  add constraint accounts_payable_paid_not_over_total
  check (amount_paid <= amount_total);
