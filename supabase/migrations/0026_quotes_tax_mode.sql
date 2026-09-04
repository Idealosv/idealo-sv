alter table public.quotes
  add column if not exists tax_mode text;

update public.quotes
set tax_mode = case
  when include_tax is false then 'INCLUDED'
  else 'ADDED'
end
where tax_mode is null;

alter table public.quotes
  alter column tax_mode set default 'INCLUDED',
  alter column tax_mode set not null;

alter table public.quotes
  drop constraint if exists quotes_tax_mode_check;

alter table public.quotes
  add constraint quotes_tax_mode_check
  check (tax_mode in ('INCLUDED', 'ADDED'));

comment on column public.quotes.tax_mode is
  'INCLUDED: el precio digitado ya contiene IVA y se desglosa sin aumentar el total. ADDED: el IVA se suma al precio digitado.';
