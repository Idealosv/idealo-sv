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

test('el estado del editor rápido cambia mediante RPC con trazabilidad', () => {
  assert.doesNotMatch(quickSource, /label="Estado"[\s\S]{0,200}update\('status'/)
  assert.match(quickSource, /transition_quote_status/)
  assert.match(quickSource, /changeStatus\('SENT'\)/)
  assert.match(quickSource, /changeStatus\('APPROVED'\)/)
})

test('guardar una edición delega persistencia atómica y no borra partidas directamente', () => {
  assert.doesNotMatch(quickSource, /from\('quote_items'\)\.delete\(\)\.eq\('quote_id'/)
  assert.match(quickSource, /save_quote_quick/)
  assert.match(quickSource, /p_items:items\.map\(itemPayload\)/)
})

test('el módulo anterior sigue disponible como respaldo funcional', () => {
  assert.match(legacySource, /todavía no tiene enlace público/)
})
