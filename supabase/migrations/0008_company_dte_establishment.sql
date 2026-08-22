alter table public.companies
  add column if not exists establishment_type text,
  add column if not exists mh_establishment_code text,
  add column if not exists mh_point_of_sale_code text;
