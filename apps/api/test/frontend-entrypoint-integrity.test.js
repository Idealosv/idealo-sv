import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../../web/src/App.jsx', import.meta.url), 'utf8')

test('la sesión autenticada entra por Workspace', () => {
  assert.match(app, /return\s+<Workspace\s+session=\{session\}\s+supabase=\{supabase\}\s*\/>/)
})

test('el componente legacy AccountScreen no forma parte del flujo activo', () => {
  const calls = app.match(/<AccountScreen\b/g) || []
  assert.equal(calls.length, 0, 'AccountScreen volvió a entrar al flujo activo y puede duplicar la arquitectura del ERP')
})
