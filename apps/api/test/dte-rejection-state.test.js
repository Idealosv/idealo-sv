import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(here, '../src/dte/transmit-test-service.js'), 'utf8')

test('rechazo documental MH queda REJECTED y fallo técnico conserva SIGNED', () => {
  assert.match(source, /const documentRejected = error\.mhPhase === 'recepcion' && Boolean\(error\.mhBody\)/)
  assert.match(source, /status: documentRejected \? 'REJECTED' : 'SIGNED'/)
  assert.match(source, /mh_response: error\.mhBody \|\| document\.mh_response \|\| null/)
  assert.match(source, /mh_message: error\.message/)
})
