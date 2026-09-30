import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../../../${path}`,import.meta.url),'utf8')
const simulator=read('apps/web/src/PrestaditosSimulatorPanel.jsx')
const alertsPanel=read('apps/web/src/PrestaditosAlertsPanel.jsx')
const alertsEngine=read('apps/web/src/prestaditos-alerts.js')
const host=read('apps/web/src/PrestaditosInvestorAppHost.jsx')

test('simulador usa tasas anuales provisionales sin inventar prorrateo',()=>{
 assert.match(simulator,/Simular una inversión/)
 assert.match(simulator,/Ganancia anual de referencia/)
 assert.match(simulator,/Total de referencia a 12 meses/)
 assert.match(simulator,/months===12\?annualGain:null/)
 assert.match(simulator,/Para plazos distintos de 12 meses no calculamos automáticamente/)
 assert.match(simulator,/No es una cotización ni contrato/)
})

test('alertas detectan vencimientos, contratos, documentos y fondos sin formalizar',()=>{
 assert.match(alertsEngine,/Inversión vencida/)
 assert.match(alertsEngine,/Contrato pendiente de firma/)
 assert.match(alertsEngine,/Expediente incompleto/)
 assert.match(alertsEngine,/Fondos recibidos sin formalizar/)
 assert.match(alertsEngine,/Capital pendiente de liquidar al vencimiento/)
 assert.match(alertsEngine,/Decisión de renovación lista para ejecutar/)
})

test('alertas no inventan calendario de pagos de rendimiento',()=>{
 assert.match(alertsPanel,/no esté definida la regla de prorrateo/)
 assert.match(alertsPanel,/no inventa fechas ni cuotas de pago/)
 assert.match(alertsEngine,/Revisar liquidación de rendimiento/)
})

test('dashboard y navegación exponen simulador y centro de notificaciones',()=>{
 assert.match(host,/\['Notificaciones','Seguimiento operativo'\]/)
 assert.match(host,/\['Simulador','Tasas anuales por monto'\]/)
 assert.match(host,/PrestaditosAlertsPanel/)
 assert.match(alertsPanel,/Centro de notificaciones/i)
 assert.match(host,/PrestaditosSimulatorPanel/)
 assert.match(host,/Dashboard:\['Notificaciones','Agenda'\]/)
 assert.match(host,/Solicitudes:\['Simulador'\]/)
})
