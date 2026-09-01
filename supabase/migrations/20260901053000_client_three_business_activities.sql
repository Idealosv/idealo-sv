alter table public.clients
  add column if not exists activity_code_2 text,
  add column if not exists business_activity_2 text,
  add column if not exists activity_code_3 text,
  add column if not exists business_activity_3 text;

comment on column public.clients.activity_code is 'CAT-019: actividad económica principal usada por DTE';
comment on column public.clients.business_activity is 'Descripción de actividad económica principal usada por DTE';
comment on column public.clients.activity_code_2 is 'CAT-019: segunda actividad económica adicional del cliente';
comment on column public.clients.business_activity_2 is 'Descripción de segunda actividad económica adicional del cliente';
comment on column public.clients.activity_code_3 is 'CAT-019: tercera actividad económica adicional del cliente';
comment on column public.clients.business_activity_3 is 'Descripción de tercera actividad económica adicional del cliente';
