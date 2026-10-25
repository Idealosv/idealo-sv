import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.resolve(here, '../../web/src/FacturacionDte.jsx')
const patchPath = path.resolve(here, '../../web/scripts/patch-billing-auto-sign.mjs')

test('facturacion: un fallo del firmador conserva el borrador y deja continuar', () => {
  const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idealo-billing-sign-'))
  try {
    fs.mkdirSync(path.join(workingDir, 'src'))
    const target = path.join(workingDir, 'src/FacturacionDte.jsx')
    fs.copyFileSync(sourcePath, target)

    const run = () => spawnSync(process.execPath, [patchPath], { cwd: workingDir, encoding: 'utf8' })
    const first = run()
    assert.equal(first.status, 0, first.stderr || first.stdout)
    const source = fs.readFileSync(target, 'utf8')
    assert.match(source, /await apiRequest\('\/api\/dte\/sign-test'/)
    assert.match(source, /catch \(signError\)/)
    assert.match(source, /guardado como borrador sin firmar/)
    assert.match(source, /Facturación → Documentos/)
    assert.match(source, /setMessageType\('success'\)/)

    const failedSignature = source.indexOf('catch (signError)')
    const formReset = source.indexOf('setItems([emptyItem()])', failedSignature)
    assert.ok(failedSignature > 0 && formReset > failedSignature, 'El formulario debe limpiarse después de guardar, aunque falle la firma')

    const second = run()
    assert.equal(second.status, 0, second.stderr || second.stdout)
    assert.equal(fs.readFileSync(target, 'utf8'), source, 'El parche debe ser idempotente')
  } finally {
    fs.rmSync(workingDir, { recursive: true, force: true })
  }
})
