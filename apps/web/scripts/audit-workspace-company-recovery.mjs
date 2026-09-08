import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const gate = fs.readFileSync(new URL('../src/SafeWorkspaceGate.jsx', import.meta.url), 'utf8')
const workspace = fs.readFileSync(new URL('../src/Workspace.jsx', import.meta.url), 'utf8')

assert.match(app, /SafeWorkspaceGate/)
assert.match(app, /<SafeWorkspaceGate session=\{session\} supabase=\{supabase\} \/>/)
assert.match(gate, /get_my_companies/)
assert.match(gate, /company_members/)
assert.match(gate, /RETRY_DELAYS/)
assert.match(gate, /No vamos a crear otra empresa/)
assert.match(gate, /Tu empresa y tus datos siguen guardados/)
assert.match(gate, /status === 'error'/)
assert.match(gate, /return <Workspace session=\{session\} supabase=\{safeSupabase\} \/>/)
assert.match(workspace, /create_company/)

const errorBlock = gate.slice(gate.indexOf("if (status === 'error')"), gate.indexOf('return <Workspace'))
assert.doesNotMatch(errorBlock, /create_company|Crear empresa y entrar/)

console.log('✓ Acceso: fallos de consulta no muestran onboarding ni permiten duplicar empresa')
