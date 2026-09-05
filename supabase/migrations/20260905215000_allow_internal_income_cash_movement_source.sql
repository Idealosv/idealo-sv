alter table public.cash_movements drop constraint if exists cash_movements_source_type_check;
alter table public.cash_movements add constraint cash_movements_source_type_check check (
  source_type = any (array[
    'MANUAL','CUSTOMER_PAYMENT','CUSTOMER_PAYMENT_REVERSAL','CUSTOMER_ADVANCE',
    'PURCHASE','PURCHASE_REVERSAL','EXPENSE','EXPENSE_REVERSAL','CASH_TRANSFER',
    'CASH_ADJUSTMENT','INTERNAL_INCOME','OTHER'
  ]::text[])
);
