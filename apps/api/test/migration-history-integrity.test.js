import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(here, '../../../supabase/migrations')

// Prefijos duplicados que ya forman parte del historial aplicado del proyecto.
// Se mantienen explícitos para impedir que aparezcan colisiones nuevas sin revisión.
const allowedLegacyDuplicates = new Set([
  '0002','0022','0024','0025','0027','0030','0031','0033','0101',
  '20260822191500','20260823175500','20260826223000',
  '20260904114500','20260904230000','20260905033000',
])

function prefixOf(name) {
  return name.split('_', 1)[0]
}

test('no se agregan nuevas colisiones de migraciones', () => {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))
  const groups = new Map()
  for (const file of files) {
    const prefix = prefixOf(file)
    groups.set(prefix, [...(groups.get(prefix) || []), file])
  }
  const unexpected = [...groups.entries()]
    .filter(([, names]) => names.length > 1)
    .filter(([prefix]) => !allowedLegacyDuplicates.has(prefix))
  assert.deepEqual(unexpected, [], `Hay nuevas colisiones de migraciones: ${JSON.stringify(unexpected)}`)
})

test('los duplicados legacy quedan identificados explícitamente', () => {
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))
  const counts = new Map()
  for (const file of files) {
    const prefix = prefixOf(file)
    counts.set(prefix, (counts.get(prefix) || 0) + 1)
  }
  for (const prefix of allowedLegacyDuplicates) {
    assert.ok((counts.get(prefix) || 0) > 1, `El prefijo legacy ${prefix} ya no está duplicado; revisa el allowlist`)
  }
})
