import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const main = await readFile(resolve(src, 'main.jsx'), 'utf8')
const css = await readFile(resolve(src, 'modal-structure.css'), 'utf8')
const failures = []

if (!main.includes("'./modal-structure.css'")) failures.push('modal-structure.css no está cargado')
if (!/\.erp-modal-backdrop\s*\{[\s\S]*position:fixed!important/.test(css)) failures.push('El backdrop modal debe ser fixed')
if (!css.includes('inset:0!important')) failures.push('El backdrop modal debe cubrir toda la pantalla')
if (!/\.erp-modal-panel\s*\{[\s\S]*display:flex!important/.test(css)) failures.push('El panel modal debe conservar estructura flex')
if (!/\.erp-modal-head\s*\{[\s\S]*justify-content:space-between!important/.test(css)) failures.push('El encabezado modal debe mantener su distribución')
if (!/\.erp-module-tabs\s*\{[\s\S]*display:flex!important/.test(css)) failures.push('Las pestañas del módulo deben mantenerse en fila')
if (!css.includes('.sidebar-module-access')) failures.push('Los launchers heredados deben permanecer fuera de la interfaz visible')

if (failures.length) {
  console.error('Auditoría de modales falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Auditoría de modales OK')
