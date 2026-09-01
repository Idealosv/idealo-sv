import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../../web/src/App.jsx', import.meta.url), 'utf8')
const safeWorkspaceGate = fs.readFileSync(new URL('../../web/src/SafeWorkspaceGate.jsx', import.meta.url), 'utf8')

test('la sesión autenticada entra por la guardia segura y termina en Workspace', () => {
  assert.match(app, /import\s+SafeWorkspaceGate\s+from\s+'\.\/SafeWorkspaceGate\.jsx'/)
  assert.match(app, /return\s+<SafeWorkspaceGate\s+session=\{session\}\s+supabase=\{supabase\}\s*\/>/)
  assert.match(safeWorkspaceGate, /import\s+Workspace\s+from\s+'\.\/Workspace\.jsx'/)
  assert.match(safeWorkspaceGate, /return\s+<Workspace\s+session=\{session\}\s+supabase=\{safeSupabase\}\s*\/>/)
  assert.match(safeWorkspaceGate, /get_my_companies/)
  assert.match(safeWorkspaceGate, /company_members/)
})

test('el componente legacy AccountScreen no forma parte del flujo activo', () => {
  const calls = app.match(/<AccountScreen\b/g) || []
  assert.equal(calls.length, 0, 'AccountScreen volvió a entrar al flujo activo y puede duplicar la arquitectura del ERP')
})
