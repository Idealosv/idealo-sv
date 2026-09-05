import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'..')
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8')
const collections=read('src/MobileCollectionsHost.jsx')
const main=read('src/main.jsx')
const css=read('src/mobile-collections.css')
const migration=fs.readFileSync(path.resolve(root,'../../supabase/migrations/20260905072000_harden_customer_receivables_payments_advances.sql'),'utf8')
const financial=fs.readFileSync(path.resolve(root,'../../supabase/migrations/20260904103000_dte_control_and_financial_posting.sql'),'utf8')
const checks=[]
const expect=(name,condition)=>{if(!condition)throw new Error(`FAIL cobros móvil: ${name}`);checks.push(name)}
const has=(source,...tokens)=>tokens.every(token=>source.includes(token))

expect('Host de cobros móviles montado una sola vez',has(main,"import MobileCollectionsHost from './MobileCollectionsHost.jsx'",'<MobileCollectionsHost/>'))
expect('Estilos de cobros móviles montados',main.includes("import './mobile-collections.css'"))
expect('Cobros sólo para owner/admin',has(collections,"['owner','admin'].includes(role)",'Solo Propietario/Administrador'))
expect('Cobros requieren conexión y nunca se encolan offline',has(collections,"if(!navigator.onLine)",'No se guardan cobros financieros sin internet')&&!collections.includes("kind:'payment'"))
expect('CxC se limita a DTE procesado de producción',has(collections,"row.dte_documents?.status==='PROCESSED'","row.dte_documents?.environment==='production'","row.dte_documents?.financial_state==='RECEIVABLE'"))
expect('DTE TEST queda fuera de Caja real',collections.includes('Los DTE TEST nunca generan un cobro real'))
expect('Cobro usa RPC financiera endurecida',collections.includes("supabase.rpc('register_customer_payment'"))
expect('Cobro usa llave idempotente UUID',has(collections,'crypto.randomUUID()','p_payment_key:payment.key'))
expect('Interfaz bloquea sobrepago antes del RPC',has(collections,'amount>balance+0.001','El cobro excede el saldo pendiente'))
expect('Interfaz exige Caja o banco',has(collections,'p_cash_account:payment.cashAccountId','Seleccioná la Caja o banco'))
expect('Métodos de pago coinciden con RPC segura',has(collections,'CASH','TRANSFER','CARD','CHECK','OTHER'))
expect('DTE aceptado puede abrir cobro por realtime',has(collections,"table:'dte_documents'","doc.status!=='PROCESSED'","setOpen(true)"))
expect('Cobro muestra DTE cliente OT total pagado y saldo',has(collections,'control_number','clients?.name','work_orders?.number','amount_total','amount_paid','Saldo'))
expect('Cobro informa actualización de CxC y Caja',collections.includes('CxC y Caja quedaron actualizadas sin duplicar el ingreso.'))
expect('RPC servidor bloquea sobrepago y cuenta cerrada',has(migration,'El cobro excede el saldo pendiente','Caja cerrada. Abrí la caja antes de recibir efectivo'))
expect('RPC servidor es idempotente por payment_key',has(migration,'where payment_key=p_payment_key','return v_existing'))
expect('RPC servidor requiere permisos administrativos',migration.includes('Solo propietario o administrador puede registrar cobros'))
expect('TEST aceptado no altera Caja/CxC reales',financial.includes('TEST 00 solo marca estado financiero simulado. Nunca altera Caja/CxC reales.'))
expect('DTE crédito producción genera CxC única',has(financial,"financial_state := case when v_condition = 2 then 'RECEIVABLE'",'accounts_receivable_dte_document_unique'))
expect('DTE contado producción se registra una vez en Caja',has(financial,"then 'RECEIVABLE' else 'PERCEIVED'",'cash_movements_source_unique'))
expect('FAB de cobros no tapa el botón DTE',has(css,'.mobile-collections-fab','right:78px','bottom:148px'))

console.log(`OK DTE → Cobro → Caja móvil: ${checks.length} controles PASS.`)
