-- Permite a usuarios autenticados leer y registrar entregas de correo
-- únicamente para empresas a las que pertenecen.

alter table public.invoice_email_deliveries enable row level security;

drop policy if exists invoice_email_deliveries_select_company_members on public.invoice_email_deliveries;
drop policy if exists invoice_email_deliveries_insert_company_members on public.invoice_email_deliveries;
drop policy if exists invoice_email_deliveries_update_company_members on public.invoice_email_deliveries;

create policy invoice_email_deliveries_select_company_members
on public.invoice_email_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = invoice_email_deliveries.company_id
      and cm.user_id = auth.uid()
  )
);

create policy invoice_email_deliveries_insert_company_members
on public.invoice_email_deliveries
for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = invoice_email_deliveries.company_id
      and cm.user_id = auth.uid()
  )
);

create policy invoice_email_deliveries_update_company_members
on public.invoice_email_deliveries
for update
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = invoice_email_deliveries.company_id
      and cm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = invoice_email_deliveries.company_id
      and cm.user_id = auth.uid()
  )
);
