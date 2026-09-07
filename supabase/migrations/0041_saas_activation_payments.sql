alter table public.saas_company_subscriptions
  add column if not exists activation_paid_at timestamptz,
  add column if not exists activation_paid_amount numeric(12,2),
  add column if not exists activation_reference text;

comment on column public.saas_company_subscriptions.activation_paid_at is 'Fecha en que se registró el pago de activación del plan.';
comment on column public.saas_company_subscriptions.activation_paid_amount is 'Monto efectivamente recibido por activación.';
comment on column public.saas_company_subscriptions.activation_reference is 'Referencia o comprobante del pago de activación.';
