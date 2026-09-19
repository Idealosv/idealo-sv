import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here=path.dirname(fileURLToPath(import.meta.url))
const root=path.resolve(here,'..')
const checks=[
 ['src/EggWholesaleAppHost.jsx',['EggExecutiveDashboard','EggDocumentsPanel','EggAiPanel','EggCommercialPanel','Documentos','Comercial']],
 ['src/EggMachinePanel.jsx',['DIAGNÓSTICO DE INTEGRACIÓN','egg_import_weight_events_secure','Web Serial']],
 ['src/EggMobileDeliveryPanel.jsx',['egg_start_route_mobile','egg_deliver_route_stop_mobile']],
 ['src/EggDtePanel.jsx',['Firmar TEST','Enviar a MH TEST']],
 ['src/EggPricingPanel.jsx',['PRECIOS MAYORISTAS','Utilidad','Margen']],
 ['src/EggReturnsPanel.jsx',['MERMA Y PÉRDIDA','DEVOLUCIÓN DE CLIENTE']],
 ['src/EggReportsPanel.jsx',['RENTABILIDAD','CARTERA','COMPRAS','MERMA','REPARTO']],
 ['src/EggUsersPanel.jsx',['MATRIZ DE ACCESO','Motorista','Clasificador']],
 ['src/EggDocumentsPanel.jsx',['Comprobante de pedido','Nota de entrega','Manifiesto de carga','Estado de cuenta','Liquidación de motorista']],
 ['src/EggAiPanel.jsx',['IDEALO EGGS INTELLIGENCE','Solo lectura']],
 ['src/EggCommercialPanel.jsx',['AUDITORÍA ALTA','DEMO PROFESIONAL','PLANES DE VENTA']],
 ['src/EggSuppliersPanel.jsx',['Proveedores y granjas','Costo promedio','Recibir nuevo lote']],
 ['src/EggLotsPanel.jsx',['RECEPCIÓN Y TRAZABILIDAD','PASO 1 · RECEPCIÓN','PASO 2 · CLASIFICACIÓN','Por clasificar','Dañados / rechazo']]
]
const failures=[]
for(const [rel,needles] of checks){
 const file=path.join(root,rel)
 if(!fs.existsSync(file)){failures.push(rel+': archivo ausente');continue}
 const content=fs.readFileSync(file,'utf8')
 for(const needle of needles)if(!content.includes(needle))failures.push(rel+': falta '+needle)
}
if(failures.length){
 console.error('AUDITORÍA IDEALO EGGS: FAIL')
 failures.forEach(x=>console.error(' - '+x))
 process.exit(1)
}
console.log('AUDITORÍA IDEALO EGGS: PASS · '+checks.length+' superficies verificadas.')
