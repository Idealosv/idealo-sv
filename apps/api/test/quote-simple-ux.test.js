import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const legacySource = fs.readFileSync(new URL('../../web/src/QuotesSimpleModule.jsx', import.meta.url), 'utf8')
const quickSource = fs.readFileSync(new URL('../../web/src/QuotesQuickModule.jsx', import.meta.url), 'utf8')
const launcher = fs.readFileSync(new URL('../../web/src/CommercialLauncher.jsx', import.meta.url), 'utf8')

test('cotizaciones usa la experiencia rápida y conserva la anterior como respaldo', () => {
  assert.match(launcher, /QuotesQuickModule/)
  assert.match(quickSource, /Solo tres pasos: cliente, productos y total/)
  assert.match(legacySource, /Datos básicos/)
  assert.match(legacySource, /Opciones avanzadas de esta partida/)
})

test('el estado del editor rápido cambia con trazabilidad', () => {
  assert.doesNotMatch(quickSource, /label="Estado"[\s\S]{0,200}update\('status'/)
  assert.match(quickSource, /quote_status_history/)
  assert.match(quickSource, /changeStatus\('SENT'\)/)
  assert.match(quickSource, /changeStatus\('APPROVED'\)/)
})

test('guardar una edición no borra primero todas las partidas', () => {
  assert.doesNotMatch(quickSource, /from\('quote_items'\)\.delete\(\)\.eq\('quote_id'/)
  assert.match(quickSource, /retained/)
  assert.match(quickSource, /removed/)
})

test('el módulo anterior sigue disponible como respaldo funcional', () => {
  assert.match(legacySource, /todavía no tiene enlace público/)
})
