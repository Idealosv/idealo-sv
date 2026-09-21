import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')

const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')
const statement=read('apps/web/src/PrestaditosInvestorStatementPanel.jsx')
const notifications=read('apps/web/src/PrestaditosAlertsPanel.jsx')
const analytics=read('apps/web/src/PrestaditosExecutiveAnalytics.jsx')
const closeout=read('apps/web/src/PrestaditosMonthlyCloseoutPanel.jsx')
const technicalAudit=read('apps/web/src/PrestaditosTechnicalAuditPanel.jsx')
const integrity=read('apps/web/src/prestaditos-integrity.js')
const migration=read('supabase/migrations/20260921222000_prestaditos_notifications_monthly_closeout.sql')

test('estado de cuenta resume movimientos vigentes y ofrece PDF imprimible',()=>{
 assert.match(statement,/Estado de cuenta del inversionista/)
 assert.match(statement,/Rendimientos pagados/)
 assert.match(statement,/Capital devuelto/)
 assert.match(statement,/Imprimir \/ guardar PDF/)
 assert.match(statement,/payment\.status\|\|'POSTED'/)
 assert.match(statement,/no calcula rendimientos no confirmados/i)
})

test('centro de notificaciones persiste revisadas y archivadas por usuario',()=>{
 assert.match(migration,/create table if not exists public\.inv_notification_states/)
 assert.match(migration,/user_id=auth\.uid\(\)/)
 assert.match(migration,/READ','DISMISSED/)
 assert.match(migration,/inv_set_notification_state/)
 assert.match(migration,/inv_clear_notification_state/)
 assert.match(notifications,/CENTRO DE NOTIFICACIONES/)
 assert.match(notifications,/Revisadas/)
 assert.match(notifications,/Archivadas/)
 assert.match(notifications,/Restaurar/)
})

test('dashboard ejecutivo analiza tasas rangos vencimientos y flujo de seis meses',()=>{
 assert.match(analytics,/Capital vigente por tasa anual/)
 assert.match(analytics,/Capital por rango provisional/)
 assert.match(analytics,/Capital por ventana de vencimiento/)
 assert.match(analytics,/FLUJO 6 MESES/)
 assert.match(analytics,/status\|\|'POSTED'/)
 assert.match(host,/PrestaditosExecutiveAnalytics/)
})

test('cierre mensual crea snapshots versionados sin modificar movimientos',()=>{
 assert.match(migration,/create table if not exists public\.inv_monthly_closeouts/)
 assert.match(migration,/coalesce\(max\(version\),0\)\+1/)
 assert.match(migration,/status='POSTED'/)
 assert.match(migration,/MONTHLY_CLOSEOUT_GENERATED/)
 assert.match(migration,/revoke insert,update,delete on public\.inv_monthly_closeouts from authenticated/)
 assert.match(closeout,/Snapshot/)
 assert.match(closeout,/nueva versión/)
 assert.match(closeout,/sin alterar movimientos/i)
})

test('auditoría técnica revisa integridad financiera y documental del vertical',()=>{
 assert.match(integrity,/DUPLICATE_APPLICATION_INVESTMENT/)
 assert.match(integrity,/INVALID_RATE_BASIS/)
 assert.match(integrity,/CAPITAL_OVER_RETURNED/)
 assert.match(integrity,/SIGNED_WITHOUT_DOCUMENT/)
 assert.match(integrity,/EXECUTED_WITHOUT_SUCCESSOR/)
 assert.match(integrity,/DOCUMENT_WITHOUT_PATH/)
 assert.match(technicalAudit,/AUDITORÍA TÉCNICA/)
 assert.match(technicalAudit,/ARQUITECTURA DE SEGURIDAD/)
})

test('navegación expone los cinco bloques nuevos',()=>{
 for(const label of ['Notificaciones','Estado de cuenta','Cierre mensual','Auditoría técnica']){
  assert.match(host,new RegExp(label))
 }
 assert.match(host,/PrestaditosExecutiveAnalytics/)
})
