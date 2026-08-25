import assert from 'node:assert/strict'
import fs from 'node:fs'

const parser = fs.readFileSync(new URL('../src/clientVatCardParser.js', import.meta.url), 'utf8')
const scanner = fs.readFileSync(new URL('../src/ClientVatCardScannerHost.jsx', import.meta.url), 'utf8')

assert.match(parser, /DIRECCI\[ÓO\]N\\s\+DE\\s\+CASA\\s\+MATRIZ/)
assert.match(parser, /DIRECCI\[ÓO\]N\\s\+GENERAL\\s\+DE\\s\+IMPUESTOS\\s\+INTERNOS/)
assert.match(parser, /ready_for_dte03:\s*missing\.length\s*===\s*0/)
assert.match(parser, /if \(!nit\) missing\.push\('NIT'\)/)
assert.match(parser, /if \(!nrc\) missing\.push\('NRC'\)/)
assert.match(parser, /if \(!address\) missing\.push\('dirección de casa matriz'\)/)
assert.match(scanner, /parseVatCardSides\(frontOcr\.data\.text \|\| '', backOcr\.data\.text \|\| ''\)/)
assert.match(scanner, /disabled=\{!result\.ready_for_dte03\}/)
assert.match(scanner, /Los encabezados de Hacienda nunca se usan como datos del cliente/)

console.log('✓ OCR IVA: separación frente/reverso, campos DTE-03 y bloqueo de datos incompletos auditados')
