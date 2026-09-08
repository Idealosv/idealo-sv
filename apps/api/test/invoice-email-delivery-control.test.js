import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInvoiceEmail, buildInvoiceEmailWithPdf } from '../src/dte/invoice-email-service.js'

const document={
  id:'11111111-1111-4111-8111-111111111111',company_id:'22222222-2222-4222-8222-222222222222',dte_type:'01',control_number:'DTE-01-M001P001-000000000000001',generation_code:'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE',environment:'production',status:'PROCESSED',signed_document:'header.payload.signature',
  dte_payload:{
    identificacion:{fecEmi:'2026-08-26',horEmi:'06:00:00'},
    emisor:{nombre:'EMPRESA EJEMPLO, S.A. DE C.V.',nombreComercial:'IDEALO SV',nit:'0614-010101-101-1',nrc:'123456-7',descActividad:'PUBLICIDAD',direccion:{complemento:'Ahuachapán, El Salvador'}},
    receptor:{nombre:'CLIENTE EJEMPLO',correo:'cliente@example.com',numDocumento:'01234567-8',direccion:{complemento:'El Salvador'}},
    cuerpoDocumento:[{numItem:1,descripcion:'Taza personalizada',cantidad:1,precioUni:2.82,ventaGravada:2.82}],
    resumen:{totalGravada:2.82,totalExenta:0,totalNoSuj:0,totalIva:0.32,totalPagar:2.82,totalLetras:'DOS 82/100 DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA'}
  },
  mh_response:{estado:'PROCESADO',codigoMsg:'001',descripcionMsg:'RECIBIDO',selloRecibido:'SELLO-MH-DE-PRUEBA'}
}

test('correo DTE tiene presentación empresarial y enlace oficial de consulta',()=>{
  const message=buildInvoiceEmail(document)
  assert.match(message.subject,/IDEALO SV/)
  assert.match(message.subject,/Factura de Consumidor Final/)
  assert.match(message.html,/DTE ACEPTADO MH/)
  assert.match(message.html,/Consultar DTE en Hacienda/)
  assert.match(message.html,/admin\.factura\.gob\.sv\/consultaPublica/)
  assert.match(message.html,/TOTAL/)
  assert.match(message.html,/\$2\.82/)
  assert.match(message.html,/SELLO-MH-DE-PRUEBA/)
  assert.equal(message.attachments.some(a=>a.contentType==='application/json'),true)
  assert.equal(message.attachments.some(a=>a.filename.endsWith('.jws.txt')),true)
})

test('correo DTE con PDF adjunta representación gráfica antes de archivos electrónicos',async()=>{
  const message=await buildInvoiceEmailWithPdf(document)
  assert.equal(message.attachments[0].contentType,'application/pdf')
  assert.match(message.attachments[0].filename,/representacion-grafica\.pdf$/)
  assert.equal(Buffer.isBuffer(message.attachments[0].content),true)
  assert.equal(message.attachments[0].content.subarray(0,5).toString(),'%PDF-')
})
