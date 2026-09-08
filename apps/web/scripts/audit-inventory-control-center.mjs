import fs from 'node:fs'
const center=fs.readFileSync(new URL('../src/InventoryControlCenter.jsx',import.meta.url),'utf8')
const launcher=fs.readFileSync(new URL('../src/InventoryCostLauncher.jsx',import.meta.url),'utf8')
const required=['inventory_items','inventory_reservations','inventory_counts','inventory_movements','company_id','Abrir reposición','Agotados','Bajo mínimo','Reservas bloqueadas','Capital inmovilizado']
for(const token of required)if(!center.includes(token))throw new Error(`Inventario: falta ${token}`)
if(!launcher.includes('InventoryControlCenter'))throw new Error('Inventario: centro de control no integrado')
console.log('Inventario control center: OK')
