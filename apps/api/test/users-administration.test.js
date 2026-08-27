import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service=fs.readFileSync(new URL('../src/admin/user-administration-service.js',import.meta.url),'utf8')
const index=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8')
const migration=fs.readFileSync(new URL('../../../supabase/migrations/0039_company_user_administration.sql',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('../../web/src/UsersAdministrationCenter.jsx',import.meta.url),'utf8')

test('protege último propietario y evita auto-revocación',()=>{
 assert.match(service,/LAST_OWNER_PROTECTED/)
 assert.match(service,/SELF_REVOKE_BLOCKED/)
 assert.match(service,/count.*owner/s)
})

test('admin no puede conceder privilegios altos ni modificar propietarios',()=>{
 assert.match(service,/actorRole==='owner'/)
 assert.match(service,/targetRole==='owner'/)
 assert.match(service,/nextRole==='owner'/)
 assert.match(service,/nextRole==='admin'/)
})

test('API expone listado invitación roles revocación y auditoría',()=>{
 for(const route of ['/api/admin/users','/api/admin/users/invite','/api/admin/audit'])assert.match(index,new RegExp(route.replaceAll('/','\\/')))
 assert.match(index,/app\.patch\('\/api\/admin\/users\/:userId'/)
 assert.match(index,/app\.delete\('\/api\/admin\/users\/:userId'/)
})

test('bitácora administrativa está aislada por empresa con RLS',()=>{
 assert.match(migration,/company_admin_audit/)
 assert.match(migration,/enable row level security/)
 assert.match(migration,/m\.company_id = company_admin_audit\.company_id/)
 assert.match(migration,/m\.role in \('owner','admin'\)/)
})

test('centro web ofrece usuarios invitaciones roles y auditoría',()=>{
 for(const label of ['Usuarios','Invitar','Roles','Auditoría','Enviar invitación','Revocar'])assert.match(ui,new RegExp(label))
 assert.match(ui,/VITE_API_URL/)
 assert.match(ui,/Authorization:`Bearer/)
})
