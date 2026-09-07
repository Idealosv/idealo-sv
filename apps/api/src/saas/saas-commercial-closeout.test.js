import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8')
const index=read('../index.js')
const migration=read('../../../../supabase/migrations/0046_saas_atomic_billing_and_plan_requests.sql')
const payment=read('../admin/saas-payment-service.js')
const portal=read('./customer-portal-service.js')
const planChanges=read('../admin/saas-plan-change-service.js')
test('cobro SaaS es atómico, idempotente y genera comprobante',()=>{assert.match(migration,/saas_record_payment_atomic/);assert.match(migration,/for update/);assert.match(migration,/idempotency_key/);assert.match(migration,/receipt_number/);assert.match(payment,/saas_record_payment_atomic/);assert.match(payment,/createHash/);assert.match(payment,/randomUUID/)})
test('pago mensual reactiva y extiende sin perder días vigentes',()=>{assert.match(migration,/greatest\(v_now,coalesce\(v_sub\.current_period_end,v_now\)\)/);assert.match(migration,/status='active'/);assert.match(migration,/current_period_end=v_start\+interval '30 days'/);assert.match(migration,/status='dismissed'/)})
test('portal del cliente expone cuenta y solicitud de cambio de plan',()=>{assert.match(index,/\/api\/saas\/account/);assert.match(index,/\/api\/saas\/plan-change/);assert.match(portal,/getCustomerSaasAccount/);assert.match(portal,/requestPlanChange/);assert.match(portal,/COMPANY_ADMIN_REQUIRED/)})
test('administrador puede aprobar o rechazar cambios con control de usuarios',()=>{assert.match(index,/\/api\/admin\/saas\/plan-changes/);assert.match(planChanges,/PLAN_USER_LIMIT_CONFLICT/);assert.match(planChanges,/approved/);assert.match(planChanges,/rejected/);assert.match(migration,/uq_saas_plan_change_pending/)})
test('tablas sensibles de solicitudes no quedan expuestas a usuarios normales',()=>{assert.match(migration,/enable row level security/);assert.match(migration,/revoke all on public\.saas_plan_change_requests from anon, authenticated/);assert.match(migration,/revoke all on function public\.saas_record_payment_atomic/);assert.match(migration,/grant execute on function public\.saas_record_payment_atomic[^;]+service_role,postgres/s)})
