import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'src/FacturacionDte.jsx')
let source = fs.readFileSync(file, 'utf8')

const alreadyPatched = "body:JSON.stringify({documentId:payload.id})"
if (source.includes(alreadyPatched)) {
  console.log('Facturación: firma automática de DTE ya aplicada.')
  process.exit(0)
}

const marker = "    setMessage(`${dteType==='03'?'Crédito Fiscal':'Factura'} ${payload.control_number} guardado correctamente.`);setMessageType('success')"
const replacement = [
  "    await apiRequest('/api/dte/sign-test',{",
  "      method:'POST',",
  "      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},",
  "      body:JSON.stringify({documentId:payload.id}),",
  "    })",
  "    setMessage(`${dteType==='03'?'Crédito Fiscal':'Factura'} ${payload.control_number} firmado correctamente.`);setMessageType('success')",
].join('\n')

if (!source.includes(marker)) {
  throw new Error('No se encontró el punto de inserción de firma automática en FacturacionDte.jsx')
}

source = source.replace(marker, replacement)
fs.writeFileSync(file, source)
console.log('Facturación: los DTE nuevos se firman automáticamente después de crearse.')
