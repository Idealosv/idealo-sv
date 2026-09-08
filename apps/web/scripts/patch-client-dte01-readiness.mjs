import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.resolve(here, '../src/Workspace.jsx')
const source = fs.readFileSync(file, 'utf8')

const oldBlock = `function getDteReadiness(client) {
  const common = [
    ['name', 'nombre o razón social'],
    ['email', 'correo electrónico'],
    ['phone', 'teléfono'],
    ['activity_code', 'código de actividad económica'],
    ['business_activity', 'descripción de actividad'],
    ['department_code', 'departamento'],
    ['municipality_code', 'municipio'],
    ['district_code', 'distrito'],
    ['address', 'complemento de dirección'],
  ]
  const fiscal = client.preferred_dte_type === '03'
    ? [['tax_id', 'NIT'], ['nrc', 'NRC']]
    : [['document_type', 'tipo de documento'], ['document_number', 'número de documento']]
  const missing = [...common, ...fiscal].filter(([key]) => !String(client[key] || '').trim())
  return { ready: missing.length === 0, missing: missing.map(([, label]) => label) }
}`

const newBlock = `function getDteReadiness(client) {
  if (client.preferred_dte_type !== '03') {
    const hasName = Boolean(String(client.name || '').trim())
    return { ready: hasName, missing: hasName ? [] : ['nombre o razón social'] }
  }

  const required = [
    ['name', 'nombre o razón social'],
    ['tax_id', 'NIT'],
    ['nrc', 'NRC'],
    ['activity_code', 'código de actividad económica'],
    ['business_activity', 'descripción de actividad'],
    ['department_code', 'departamento'],
    ['municipality_code', 'municipio'],
    ['district_code', 'distrito'],
    ['address', 'complemento de dirección'],
    ['phone', 'teléfono'],
    ['email', 'correo electrónico'],
  ]
  const missing = required.filter(([key]) => !String(client[key] || '').trim())
  return { ready: missing.length === 0, missing: missing.map(([, label]) => label) }
}`

if (!source.includes(newBlock)) {
  if (!source.includes(oldBlock)) throw new Error('No se encontró el contrato histórico de getDteReadiness; revisar manualmente antes de modificar.')
  fs.writeFileSync(file, source.replace(oldBlock, newBlock))
  console.log('Clientes DTE-01 alineado con Facturación: solo nombre obligatorio; DTE-03 conserva expediente fiscal.')
} else {
  console.log('Clientes DTE-01 ya está alineado.')
}

const billingFile = path.resolve(here, '../src/Billing360Dashboard.jsx')
const billingSource = fs.readFileSync(billingFile, 'utf8')
const structuredFeedback = `actionMessage.text&&<p className={\`feedback \${actionMessage.type==='neutral'?'':actionMessage.type}\`} role="status">{actionMessage.text}</p>`
const oldFeedback = `{error&&<p className="feedback error">{error}</p>}{actionMessage&&<p className="feedback success" role="status">{actionMessage}</p>}`
const newFeedback = `{error&&<p className="feedback error">{error}</p>}{actionMessage&&<p className={\`feedback \${actionMessage.startsWith('✓')?'success':/(detenida|No se firmó|REJECTED|rechaz)/i.test(actionMessage)?'error':''}\`} role="status">{actionMessage}</p>}`
if (billingSource.includes(structuredFeedback)) {
  console.log('Facturación: feedback fiscal estructurado ya separa éxito, rechazo y estado neutro.')
} else if (!billingSource.includes(newFeedback)) {
  if (!billingSource.includes(oldFeedback)) throw new Error('No se encontró un contrato de feedback fiscal conocido; revisar Billing360Dashboard antes de modificar.')
  fs.writeFileSync(billingFile, billingSource.replace(oldFeedback, newFeedback))
  console.log('Facturación: feedback fiscal separa éxito, rechazo y estado neutro.')
} else {
  console.log('Facturación: feedback fiscal ya está tipificado.')
}

const invoiceFile = path.resolve(here, '../src/FacturacionDte.jsx')
let invoiceSource = fs.readFileSync(invoiceFile, 'utf8')
const guidedImport = `import { applyDteTestScenarioPreset, DTE_TEST_SCENARIO_LABELS, readPendingDteTestScenario, scenarioInstruction } from './dteTestScenarioPresets.js'`
if (!invoiceSource.includes(guidedImport)) {
  invoiceSource = invoiceSource.replace("import './facturacion.css'", `import './facturacion.css'\n${guidedImport}`)
}
const busyAnchor = `  const [busy,setBusy]=useState(false)`
const guidedState = `${busyAnchor}\n  const [guidedScenario,setGuidedScenario]=useState('')`
if (!invoiceSource.includes("const [guidedScenario,setGuidedScenario]")) invoiceSource = invoiceSource.replace(busyAnchor, guidedState)
const clientEffectAnchor = `  useEffect(()=>{if(initialClientId){setClientId(initialClientId);setMessage('')}},[initialClientId])`
const guidedEffect = `${clientEffectAnchor}\n  useEffect(()=>{\n    const code=readPendingDteTestScenario()\n    if(!code)return\n    applyDteTestScenarioPreset(code,{setDteType,setClientId,setCondicionOperacion,setPaymentCode,setPaymentPeriod,setPaymentTerm,setNumPagoElectronico,setItems,emptyItem})\n    setGuidedScenario(code)\n    setMessage('')\n  },[])`
if (!invoiceSource.includes('readPendingDteTestScenario()')) invoiceSource = invoiceSource.replace(clientEffectAnchor, guidedEffect)
const readinessAnchor = `    if(dteType==='03'&&ccfMissing.length)pending.push(\`datos fiscales: \${ccfMissing.join(', ')}\`)`
const readinessGuided = `${readinessAnchor}\n    if(guidedScenario==='consumer_identified'&&!selectedClient)pending.push('receptor identificado')\n    if(guidedScenario==='discount'&&!items.some(item=>Number(item.montoDescu)>0))pending.push('descuento mayor que cero')`
if (!invoiceSource.includes("guidedScenario==='consumer_identified'")) invoiceSource = invoiceSource.replace(readinessAnchor, readinessGuided).replace(`  },[dteType,selectedClient,ccfMissing,items,condicionOperacion,paymentPeriod,paymentTerm])`, `  },[dteType,selectedClient,ccfMissing,items,condicionOperacion,paymentPeriod,paymentTerm,guidedScenario])`)
const returnAnchor = `  return <section className="facturacion-dte billing-simple-flow">`
const guidedBanner = `${returnAnchor}\n    {guidedScenario&&<div className="dte-note"><strong>Prueba MH guiada: {DTE_TEST_SCENARIO_LABELS[guidedScenario]}.</strong> {scenarioInstruction(guidedScenario)} La evidencia solo contará cuando Hacienda TEST responda PROCESSED.</div>}`
if (!invoiceSource.includes('Prueba MH guiada:')) invoiceSource = invoiceSource.replace(returnAnchor, guidedBanner)
fs.writeFileSync(invoiceFile, invoiceSource)
console.log('Facturación: escenarios MH pendientes se preparan automáticamente sin inventar datos fiscales.')
