alter table public.purchases
  add column if not exists tax_mode text not null default 'ADDED';

alter table public.purchases
  drop constraint if exists purchases_tax_mode_check;

alter table public.purchases
  add constraint purchases_tax_mode_check
  check (tax_mode in ('ADDED','INCLUDED','EXEMPT'));
