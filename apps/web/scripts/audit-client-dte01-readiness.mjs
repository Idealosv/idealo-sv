import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const workspace = fs.readFileSync(path.resolve(here, '../src/Workspace.jsx'), 'utf8')
const start = workspace.indexOf('function getDteReadiness(client)')
const end = workspace.indexOf('\nfunction ClientsModule', start)
if (start < 0 || end < 0) throw new Error('No se encontró getDteReadiness en Workspace.jsx')
const block = workspace.slice(start, end)

const requiredTokens = [
  "if (client.preferred_dte_type !== '03')",
  "['tax_id', 'NIT']",
  "['nrc', 'NRC']",
  "['activity_code', 'código de actividad económica']",
  "['business_activity', 'descripción de actividad']",
  "['department_code', 'departamento']",
  "['municipality_code', 'municipio']",
  "['district_code', 'distrito']",
  "['address', 'complemento de dirección']",
  "['phone', 'teléfono']",
  "['email', 'correo electrónico']",
]
for (const token of requiredTokens) if (!block.includes(token)) throw new Error(`Contrato DTE Clientes incompleto: ${token}`)
if (block.includes("['document_type', 'tipo de documento']") || block.includes("['document_number', 'número de documento']")) {
  throw new Error('DTE-01 sigue exigiendo documento de identificación de forma indiscriminada.')
}
if (!block.includes("missing: hasName ? [] : ['nombre o razón social']")) throw new Error('DTE-01 debe exigir únicamente nombre o razón social como mínimo del expediente de Clientes.')
console.log('OK Clientes DTE-01: validación alineada con Facturación; DTE-03 permanece estricta.')
