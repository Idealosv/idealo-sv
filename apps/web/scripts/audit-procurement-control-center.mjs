import fs from 'node:fs'
const launcher=fs.readFileSync(new URL('../src/OperationsFinanceLauncher.jsx',import.meta.url),'utf8')
const center=fs.readFileSync(new URL('../src/ProcurementControlCenter.jsx',import.meta.url),'utf8')
for(const token of ['ProcurementControlCenter','Control','Cuentas por pagar','Recepción'])if(!launcher.includes(token))throw new Error(`Falta integración: ${token}`)
for(const token of ['accounts_payable','purchases','suppliers','company_id','CxP vencidas','Órdenes sin recibir +7d','Compras sin proveedor'])if(!center.includes(token))throw new Error(`Falta control: ${token}`)
console.log('OK procurement control center')
