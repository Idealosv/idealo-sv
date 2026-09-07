import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const file=fileURLToPath(new URL('../src/FacturacionDte.jsx',import.meta.url))
let text=fs.readFileSync(file,'utf8')

const signature="export default function FacturacionDte({session,supabase,company,initialClientId=''}){"
const nextSignature="export default function FacturacionDte({session,supabase,company,initialClientId='',allowProjectSource=false}){"
if(text.includes(signature)) text=text.replace(signature,nextSignature)

const start='    <div className="panel" style={{marginBottom:16}}>\n      <div className="form-grid two">'
const nextStart='    {allowProjectSource&&<div className="panel" style={{marginBottom:16}}>\n      <div className="form-grid two">'
if(text.includes(start)) text=text.replace(start,nextStart)

const end='    </div>\n\n    <div className="billing-document-picker" role="group" aria-label="Tipo de documento">'
const nextEnd='    </div>}\n\n    <div className="billing-document-picker" role="group" aria-label="Tipo de documento">'
if(text.includes(end)) text=text.replace(end,nextEnd)

fs.writeFileSync(file,text)
console.log('Facturación: venta manual separada del flujo desde proyecto.')
