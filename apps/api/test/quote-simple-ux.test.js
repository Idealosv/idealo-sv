import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../../web/src/QuotesSimpleModule.jsx', import.meta.url), 'utf8')
const launcher = fs.readFileSync(new URL('../../web/src/CommercialLauncher.jsx', import.meta.url), 'utf8')

test('cotizaciones usa la experiencia simplificada', () => {
  assert.match(launcher, /QuotesSimpleModule/)
  assert.match(source, /Datos básicos/)
  assert.match(source, /Opciones avanzadas de esta partida/)
  assert.match(source, /Condiciones avanzadas/)
  assert.match(source, /Rentabilidad interna/)
})

test('el estado no se edita como un campo ordinario del formulario', () => {
  assert.doesNotMatch(source, /label="Estado"[\s\S]{0,200}update\('status'/)
  assert.match(source, /changeStatus\(form, event\.target\.value\)/)
  assert.match(source, /quote_status_history/)
})

test('guardar una edicion no borra primero todas las partidas', () => {
  assert.doesNotMatch(source, /from\('quote_items'\)\.delete\(\)\.eq\('quote_id', quoteId\)[\s\S]{0,200}insert/)
  assert.match(source, /retainedIds/)
  assert.match(source, /removedIds/)
})

test('el enlace publico no copia un token inexistente', () => {
  assert.match(source, /todavía no tiene enlace público/)
})
