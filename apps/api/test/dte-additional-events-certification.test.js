import test from 'node:test'
import assert from 'node:assert/strict'
import { eventSchemaFor, eventTemplate } from '../src/dte/additional-event-certification-service.js'

const company = {nit:'06140101234567',name:'EMPRESA TEST S.A. DE C.V.'}

test('Eventos nuevos usan esquemas MH Retorno 18 y Operaciones Especiales 17',()=>{
 for(const [eventType,code] of [['RETURN','18'],['SPECIAL_OPERATIONS','17']]){
  const {schema,validate}=eventSchemaFor(eventType)
  assert.equal(schema.properties.identificacion.properties.tipoEvento.const,code)
  assert.equal(typeof validate,'function')
  const template=eventTemplate({eventType,company})
  assert.equal(template.identificacion.ambiente,'00')
  assert.equal(template.identificacion.tipoEvento,code)
  assert.equal(template.emisor.nit,company.nit)
  assert.equal(template.emisor.nombre,company.name)
 }
})

test('El editor no ofrece rutas de transmisión hasta verificar autorización MH',()=>{
 assert.throws(()=>eventSchemaFor('PRODUCTION'),/no soportado/)
})
