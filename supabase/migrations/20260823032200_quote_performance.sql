-- Ajustes de rendimiento detectados por Supabase Advisors para Cotizaciones 360.
drop index if exists public.quote_items_product_idx;
drop index if exists public.quote_items_quote_sort_idx;

create index if not exists quotes_client_id_idx on public.quotes(client_id);
create index if not exists quotes_seller_user_id_idx on public.quotes(seller_user_id) where seller_user_id is not null;
create index if not exists quotes_follow_up_owner_idx on public.quotes(follow_up_owner) where follow_up_owner is not null;
create index if not exists quote_items_variant_id_idx on public.quote_items(variant_id) where variant_id is not null;
create index if not exists quote_versions_company_id_idx on public.quote_versions(company_id);
create index if not exists quote_status_history_company_id_idx on public.quote_status_history(company_id);
create index if not exists quote_communications_company_id_idx on public.quote_communications(company_id);
create index if not exists quote_approvals_company_id_idx on public.quote_approvals(company_id);
create index if not exists quote_followups_quote_id_idx on public.quote_followups(quote_id);
create index if not exists quote_followups_owner_user_id_idx on public.quote_followups(owner_user_id) where owner_user_id is not null;
create index if not exists quote_attachments_company_id_idx on public.quote_attachments(company_id);
create index if not exists quote_payment_schedule_company_id_idx on public.quote_payment_schedule(company_id);
