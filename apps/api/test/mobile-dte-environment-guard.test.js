import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const guard=fs.readFileSync(new URL('../../web/src/MobileDteEnvironmentGuard.jsx',import.meta.url),'utf8')
const mobile=fs.readFileSync(new URL('../../web/src/MobileDteHost.jsx',import.meta.url),'utf8')

test('Android identifica claramente ambiente TEST y no lo presenta como producción',()=>{
 assert.match(guard,/AMBIENTE TEST · NO PRODUCCIÓN/)
 assert.match(guard,/Enviar a Hacienda TEST/)
 assert.match(mobile,/\/api\/dte\/transmit-test/)
})

test('Android bloquea emisión si la empresa está configurada en producción hasta soporte 01',()=>{
 assert.match(guard,/settings\?\.environment==='production'/)
 assert.match(guard,/EMISIÓN ANDROID BLOQUEADA/)
 assert.match(guard,/creación y firma en ambiente 01/)
 assert.match(guard,/create\.disabled=true/)
})

test('guardia consulta runtime settings y preflight de la empresa',()=>{
 assert.match(guard,/\/api\/dte\/runtime-settings\?companyId=/)
 assert.match(guard,/settings\?\.preflight/)
})
