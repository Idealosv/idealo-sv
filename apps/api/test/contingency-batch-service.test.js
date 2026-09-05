import test from 'node:test'
import assert from 'node:assert/strict'
import { splitMhBatches, buildContingencyBatchPayload } from '../src/dte/contingency-batch-service.js'

test('splitMhBatches keeps every batch between 2 and 100 documents',()=>{
  const docs=Array.from({length:201},(_,i)=>({id:i+1}))
  const batches=splitMhBatches(docs)
  assert.equal(batches.flat().length,201)
  assert.ok(batches.every(batch=>batch.length>=2&&batch.length<=100))
})

test('buildContingencyBatchPayload creates MH batch envelope',()=>{
  const payload=buildContingencyBatchPayload({
    environment:'test',
    nit:'0614-010101-001-0',
    requestId:'cf89b21e-4268-4711-832d-8a54866b1763',
    documents:[
      {generation_code:'81424523-b6ea-0225-bb20-792419b9a415',signed_document:'jws-1'},
      {generation_code:'81424523-b6ea-4402-bb20-792419b9a424',signed_document:'jws-2'},
    ],
  })
  assert.equal(payload.version,1)
  assert.equal(payload.ambiente,'00')
  assert.equal(payload.nitEmisor,'06140101010010')
  assert.equal(payload.documentos.length,2)
  assert.equal(payload.documentos[0].codigoGeneracion,'81424523-B6EA-0225-BB20-792419B9A415')
  assert.equal(payload.documentos[0].documento,'jws-1')
})
