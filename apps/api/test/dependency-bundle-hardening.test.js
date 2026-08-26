import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const apiPackage=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'))
const vite=fs.readFileSync(new URL('../../web/vite.config.js',import.meta.url),'utf8')
const ci=fs.readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8')

test('Nodemailer exige versión corregida 9.0.1 o superior',()=>{
  assert.match(apiPackage.dependencies.nodemailer,/^\^9\.0\.1$/)
})

test('Vite separa dependencias pesadas del bundle principal',()=>{
  for(const chunk of ['tesseract.js','@supabase','react','qrcode']) assert.match(vite,new RegExp(chunk.replace('.','\\.')))
  assert.match(vite,/manualChunks/)
})

test('CI bloquea vulnerabilidades altas o críticas',()=>{
  assert.match(ci,/npm audit --audit-level=high/)
})
