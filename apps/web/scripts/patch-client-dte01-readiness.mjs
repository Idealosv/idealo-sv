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

if (source.includes(newBlock)) {
  console.log('Clientes DTE-01 ya está alineado.')
  process.exit(0)
}
if (!source.includes(oldBlock)) throw new Error('No se encontró el contrato histórico de getDteReadiness; revisar manualmente antes de modificar.')
fs.writeFileSync(file, source.replace(oldBlock, newBlock))
console.log('Clientes DTE-01 alineado con Facturación: solo nombre obligatorio; DTE-03 conserva expediente fiscal.')
