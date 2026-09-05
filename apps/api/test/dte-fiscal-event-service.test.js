import test from 'node:test'
import assert from 'node:assert/strict'
import { __test__ } from '../src/dte/fiscal-event-service.js'

const company={nit:'0614-010101-101-1',name:'IDEALO SV',trade_name:'IDEALO SV',establishment_type:'02',establishment_code:'M001',point_of_sale_code:'P001',phone:'22223333',email:'factura@example.com'}
const document={id:'00000000-0000-4000-8000-000000000001',company_id:'00000000-0000-4000-8000-000000000002',dte_type:'01',generation_code:'11111111-1111-4111-8111-111111111111',control_number:'DTE-01-M001P001-000000000000001',environment:'test',mh_receipt_seal:'SELLO',dte_payload:{identificacion:{fecEmi:'2026-09-04'},receptor:{tipoDocumento:'13',numDocumento:'000000000',nombre:'Cliente'},resumen:{totalIva:1.15}}}

test('buildInvalidationPayload keeps MH references and replacement',()=>{
 const payload=__test__.buildInvalidationPayload({document,company,eventGenerationCode:'22222222-2222-4222-8222-222222222222',reasonType:1,reason:'Error de receptor',responsible:{name:'Responsable',documentType:'13',documentNumber:'000000000'},requester:{name:'Solicitante',documentType:'13',documentNumber:'000000000'},replacement:{generation_code:'33333333-3333-4333-8333-333333333333'}})
 assert.equal(payload.identificacion.ambiente,'00')
 assert.equal(payload.documento.codigoGeneracion,document.generation_code.toUpperCase())
 assert.equal(payload.documento.codigoGeneracionR,'33333333-3333-4333-8333-333333333333'.toUpperCase())
 assert.equal(payload.motivo.tipoAnulacion,1)
})

test('buildContingencyPayload reports every document',()=>{
 const docs=[{generation_code:'11111111-1111-4111-8111-111111111111',dte_type:'01'},{generation_code:'22222222-2222-4222-8222-222222222222',dte_type:'03'}]
 const payload=__test__.buildContingencyPayload({company,environment:'test',generationCode:'33333333-3333-4333-8333-333333333333',documents:docs,startAt:'2026-09-04T10:00:00-06:00',endAt:'2026-09-04T11:00:00-06:00',contingencyType:4,reason:'No disponibilidad MH',responsible:{name:'Responsable',documentType:'13',documentNumber:'000000000'}})
 assert.equal(payload.detalleDTE.length,2)
 assert.equal(payload.identificacion.ambiente,'00')
 assert.equal(payload.motivo.tipoContingencia,4)
})
