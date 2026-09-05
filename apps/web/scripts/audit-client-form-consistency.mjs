import assert from 'node:assert/strict'
import fs from 'node:fs'

const organizer = fs.readFileSync(new URL('../src/ClientModuleOrganizer.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/client-module-organizer.css', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../../../supabase/migrations/0042_client_notes_consistency.sql', import.meta.url), 'utf8')

assert.match(organizer, /Un dato se captura una sola vez/)
assert.match(organizer, /DUI \/ NIT homologado \*/)
assert.match(organizer, /documentNumberLabel\.hidden = true/)
assert.match(organizer, /taxIdLabel\.hidden = true/)
assert.match(organizer, /contactName\.hidden = clientType === 'person'/)
assert.match(organizer, /contactPosition\.hidden = clientType === 'person'/)
assert.match(organizer, /creditLimitLabel\.hidden = payment === 'cash'/)
assert.match(organizer, /nativeSet\(dui, documentNumber\.value\)/)
assert.match(organizer, /nativeSet\(taxId, documentNumber\.value\)/)
assert.doesNotMatch(organizer, /counts\[key\]/)

assert.match(css, /label\[hidden\]/)
assert.match(css, /client-integrity-center/)
assert.match(css, /client360/)

assert.match(migration, /alter column notes set default ''/)
assert.match(migration, /new\.notes := coalesce\(new\.notes, ''\)/)
assert.match(migration, /before insert or update on public\.clients/)

console.log('✓ Clientes: identidad fiscal unificada, campos condicionales, paneles sin duplicación y notes protegido')
