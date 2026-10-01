import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const apiPackage=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'))
const vite=fs.readFileSync(new URL('../../web/vite.config.js',import.meta.url),'utf8')
const ci=fs.readFileSync(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8')

test('Nodemailer exige versión corregida 10.0.9 o superior',()=>{
  const [major,minor,patch]=apiPackage.dependencies.nodemailer.replace(/^[^0-9]*/, '').split('.').map(Number)
  assert.ok(major>10||(major===10&&minor>0)||(major===10&&minor===0&&patch>=9))
})

test('Vite separa dependencias pesadas del bundle principal',()=>{
  for(const chunk of ['tesseract.js','@supabase','react','qrcode']) assert.match(vite,new RegExp(chunk.replace('.','\\.')))
  assert.match(vite,/manualChunks/)
})

test('CI bloquea vulnerabilidades altas o críticas',()=>{
  assert.match(ci,/npm audit --audit-level=high/)
})
