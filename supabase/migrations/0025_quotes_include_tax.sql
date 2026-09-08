alter table public.quotes
  add column if not exists include_tax boolean not null default true;

comment on column public.quotes.include_tax is 'Determina si la cotización debe calcular y mostrar IVA.';
