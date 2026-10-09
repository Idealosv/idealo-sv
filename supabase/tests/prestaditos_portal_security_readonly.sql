-- SOLO METADATOS. Ejecutar tras las migraciones en una base STAGING AISLADA.
-- No crea registros, no cambia permisos y NO prueba aislamiento entre usuarios reales.
-- Si alguna verificación regresa false, NO publicar.
with checks(name, passed) as (
 values
  ('Tablas portal existen', (
   to_regclass('public.inv_portal_enrollments') is not null and
   to_regclass('public.inv_portal_links') is not null and
   to_regclass('public.inv_portal_withdrawals') is not null
  )),
  ('Un libro financiero: ERP existente', (
   to_regclass('public.inv_investors') is not null and
   to_regclass('public.inv_applications') is not null and
   to_regclass('public.inv_investments') is not null and
   to_regclass('public.inv_payments') is not null
  )),
  ('RLS habilitado: registros', (
   select relrowsecurity from pg_class where oid='public.inv_portal_enrollments'::regclass
  )),
  ('RLS habilitado: vínculos', (
   select relrowsecurity from pg_class where oid='public.inv_portal_links'::regclass
  )),
  ('RLS habilitado: retiros', (
   select relrowsecurity from pg_class where oid='public.inv_portal_withdrawals'::regclass
  )),
  ('Anónimo sin acceso a registros', (
   not has_table_privilege('anon','public.inv_portal_enrollments','SELECT') and
   not has_table_privilege('anon','public.inv_portal_enrollments','INSERT')
  )),
  ('Anónimo sin acceso a retiros', (
   not has_table_privilege('anon','public.inv_portal_withdrawals','SELECT') and
   not has_table_privilege('anon','public.inv_portal_withdrawals','INSERT')
  )),
  ('Inversionista sin escritura directa de movimientos de retiro', (
   not has_table_privilege('authenticated','public.inv_portal_withdrawals','INSERT') and
   not has_table_privilege('authenticated','public.inv_portal_withdrawals','UPDATE') and
   not has_table_privilege('authenticated','public.inv_portal_withdrawals','DELETE')
  )),
  ('Inversionista sin escritura directa de vínculos de identidad', (
   not has_table_privilege('authenticated','public.inv_portal_links','INSERT') and
   not has_table_privilege('authenticated','public.inv_portal_links','UPDATE') and
   not has_table_privilege('authenticated','public.inv_portal_links','DELETE')
  )),
  ('RPC de consulta no visible para anónimo', (
   not has_function_privilege('anon','public.inv_portal_dashboard(uuid)','EXECUTE')
  )),
  ('RPC de retiro no visible para anónimo', (
   not has_function_privilege('anon','public.inv_portal_submit_withdrawal(uuid,uuid,text,numeric,text,text)','EXECUTE')
  )),
  ('RPC de aprobación no visible para anónimo', (
   not has_function_privilege('anon','public.inv_portal_link_account(uuid,uuid)','EXECUTE') and
   not has_function_privilege('anon','public.inv_portal_review_withdrawal(uuid,text,text,uuid)','EXECUTE')
  )),
  ('RPC de consulta con SECURITY DEFINER', (
   select prosecdef from pg_proc where oid='public.inv_portal_dashboard(uuid)'::regprocedure
  )),
  ('Comprobantes en bucket privado', (
   select not public from storage.buckets where id='prestaditos-portal-receipts'
  )),
  ('Tamaño y formatos de comprobantes limitados', (
   select file_size_limit=5242880 and
    allowed_mime_types @> array['image/jpeg','image/png','application/pdf']::text[]
   from storage.buckets where id='prestaditos-portal-receipts'
  )),
  ('Referencia única de pago por solicitud de retiro', (
   select exists(
    select 1 from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    where t.oid='public.inv_portal_withdrawals'::regclass
    and c.contype='u'
    and pg_get_constraintdef(c.oid) like '%payment_id%'
   )
  ))
)
select name as control,
 case when coalesce(passed,false) then 'APROBADO' else 'FALLÓ / PENDIENTE' end as resultado
from checks order by name;
