import test from 'node:test'
import assert from 'node:assert/strict'
import { productionMetrics,taskProgress,materialStatus,canAdvanceProduction } from '../../web/src/productionEngine.js'
test('calcula progreso y materiales',()=>{assert.equal(taskProgress([{status:'DONE'},{status:'PENDING'}]),50);assert.equal(materialStatus([{required_qty:5,reserved_qty:5}]),'READY');assert.equal(materialStatus([{required_qty:5,reserved_qty:2}]),'PARTIAL')})
test('bloquea avance sin aprobacion, materiales o calidad',()=>{assert.equal(canAdvanceProduction({status:'APPROVAL',design_status:'PENDING'},[],[]).ok,false);assert.equal(canAdvanceProduction({status:'WAITING_MATERIAL'},[],[{required_qty:2,reserved_qty:0}]).ok,false);assert.equal(canAdvanceProduction({status:'QUALITY',quality_status:'PENDING'},[],[]).ok,false)})
test('calcula indicadores de produccion',()=>{const m=productionMetrics([{status:'PRODUCTION',priority:'URGENT',total:100,actual_cost:40},{status:'DELIVERED',total:100,actual_cost:60}]);assert.equal(m.open,1);assert.equal(m.urgent,1);assert.equal(m.actualCost,100);assert.equal(m.margin,50)})
