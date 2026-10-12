import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCertificationTypes, getCertificationSchema, prepareDteTestTemplate,
  validateCertificationPayload,
} from '../src/dte/certification-document-service.js'

const company = {
  nit: '06140101234567', nrc:'123456', name:'EMPRESA TEST S.A. DE C.V.',
  activity_code:'18110',business_activity:'Servicios de impresión',
  department_code:'01', municipality_code:'01',district_code:'01',
  address:'Dirección fiscal de pruebas',phone:'22223333',
  email:'facturacion@example.test',establishment_code:'M001',point_of_sale_code:'P001',
}

test('Los nueve tipos restantes tienen esquema JSON completo y un tipo único',()=>{
  const types=getCertificationTypes()
  assert.deepEqual(types.map(x=>x.type).sort(),['04','05','06','07','08','09','11','14','15'].sort())
  for(const t of types){
    const {schema,validate}=getCertificationSchema(t.type)
    assert.equal(schema.properties.identificacion.properties.tipoDte.const,t.type)
    assert.equal(schema.properties.identificacion.properties.version.const,t.version)
    assert.equal(typeof validate,'function')
  }
})

test('Plantilla MH TEST solo usa empresa real y deja los importes sin inventar',()=>{
  for(const {type,version} of getCertificationTypes()){
    const doc=prepareDteTestTemplate({type,company,now:new Date('2026-10-12T15:20:30.000Z')})
    assert.equal(doc.identificacion.tipoDte,type)
    assert.equal(doc.identificacion.version,version)
    assert.equal(doc.identificacion.ambiente,'00')
    assert.equal(doc.identificacion.tipoModelo,1)
    assert.equal(doc.identificacion.fecEmi,'2026-10-12')
    assert.equal(doc.emisor.nit || doc.emisor.numDocumento,company.nit)
    assert.match(doc.identificacion.numeroControl,new RegExp('^DTE-'+type))
  }
})

test('Rechaza empresas y ambientes falsificados incluso antes de intentar transmisión',()=>{
  const doc=prepareDteTestTemplate({type:'06',company})
  assert.throws(()=>validateCertificationPayload('06',{...doc,identificacion:{...doc.identificacion,ambiente:'01'}},company),/TEST 00/)
  assert.throws(()=>validateCertificationPayload('06',{...doc,emisor:{...doc.emisor,nit:'00000000000000'}},company),/empresa activa/)
  assert.throws(()=>validateCertificationPayload('06',{...doc,identificacion:{...doc.identificacion,tipoDte:'01'}},company),/Tipo y versión/)
  assert.throws(()=>validateCertificationPayload('06',{...doc,identificacion:{...doc.identificacion,tipoOperacion:2}},company),/emisión normal/)
  assert.throws(()=>validateCertificationPayload('06',doc,company),/esquema MH/)
})
