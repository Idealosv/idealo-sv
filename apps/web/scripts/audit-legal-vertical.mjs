import fs from 'node:fs'
const files={host:'../src/LegalAppHost.jsx',css:'../src/legal-app.css',main:'../src/main.jsx',migration:'../../../supabase/migrations/0041_legal_vertical_core.sql'}
const text=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(new URL(p,import.meta.url),'utf8')]))
const checks=[
 ['ruta /legal',text.host.includes("'/legal'")],
 ['host montado',text.main.includes('LegalAppHost')],
 ['estilo montado',text.main.includes("'./legal-app.css'")],
 ['tabla expedientes',text.migration.includes('create table if not exists public.legal_cases')],
 ['tabla plazos',text.migration.includes('create table if not exists public.legal_deadlines')],
 ['tabla eventos',text.migration.includes('create table if not exists public.legal_case_events')],
 ['tabla documentos',text.migration.includes('create table if not exists public.legal_documents')],
 ['RLS expedientes',text.migration.includes('members_manage_legal_cases')],
 ['aislamiento company_id',text.migration.includes('company_members cm')],
 ['creación expediente',text.host.includes("from('legal_cases').insert")],
 ['agenda jurídica',text.host.includes("from('legal_deadlines')")],
 ['dashboard jurídico',text.host.includes('Expedientes activos')],
 ['responsive',text.css.includes('@media(max-width:900px)')],
]
const failed=checks.filter(([,ok])=>!ok)
if(failed.length){console.error('FALLA auditoría jurídico:',failed.map(([n])=>n).join(', '));process.exit(1)}
console.log(`OK IDEALO Jurídico: ${checks.length} controles PASS.`)
