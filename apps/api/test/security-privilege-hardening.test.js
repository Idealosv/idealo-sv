import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql=fs.readFileSync(new URL('../../../supabase/migrations/20260826233000_security_privilege_hardening.sql',import.meta.url),'utf8')

test('anon pierde todos los privilegios de tabla',()=>{
  assert.match(sql,/revoke all privileges on all tables in schema public from anon/i)
})

test('authenticated no puede truncar ni administrar triggers',()=>{
  assert.match(sql,/revoke truncate, trigger, references on all tables in schema public from authenticated/i)
})

test('privilegios peligrosos no reaparecen en tablas futuras',()=>{
  assert.match(sql,/alter default privileges in schema public revoke all on tables from anon/i)
  assert.match(sql,/alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated/i)
})

test('RPC comerciales auxiliares requieren sesión autenticada',()=>{
  assert.match(sql,/revoke execute on function public\.client_duplicate_candidates\(uuid,uuid\) from public, anon/i)
  assert.match(sql,/grant execute on function public\.client_duplicate_candidates\(uuid,uuid\) to authenticated/i)
  assert.match(sql,/grant execute on function public\.refresh_client_commercial_tasks\(uuid\) to authenticated/i)
  assert.match(sql,/grant execute on function public\.sync_crm_opportunities_from_quotes\(uuid\) to authenticated/i)
})

test('funciones internas no quedan expuestas como RPC',()=>{
  assert.match(sql,/refresh_inventory_reserved_stock\(uuid\) from public, anon, authenticated/i)
  assert.match(sql,/guard_processed_dte_immutability\(\) from public, anon, authenticated/i)
})
