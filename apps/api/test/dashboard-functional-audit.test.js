import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.resolve(here, '../../web/src/Workspace.jsx'), 'utf8')

const requiredModules = [
  'Dashboard', 'App móviles', 'Clientes', 'Productos', 'Cotizaciones', 'Producción',
  'Inventario', 'Facturación', 'Proveedores', 'Compras', 'Caja', 'Asistente IA',
  'Agenda', 'Reportes', 'Seguridad',
]

test('dashboard: usa el Workspace activo del ERP', () => {
  const app = fs.readFileSync(path.resolve(here, '../../web/src/App.jsx'), 'utf8')
  assert.match(app, /return <Workspace session=\{session\} supabase=\{supabase\}/)
})

test('dashboard: no presenta métricas financieras falsas en cero', () => {
  assert.doesNotMatch(src, /<Metric label="Ventas" value="\$0\.00"/)
  assert.doesNotMatch(src, /<Metric label="Cotizaciones" value="0"/)
})

test('dashboard: menú principal conserva el orden comercial acordado', () => {
  let last = -1
  for (const module of requiredModules) {
    const index = src.indexOf(`'${module}'`)
    assert.ok(index > last, `Falta o está fuera de orden: ${module}`)
    last = index
  }
})

test('dashboard: todos los módulos del menú tienen destino funcional', () => {
  for (const module of requiredModules) {
    assert.ok(
      src.includes(`activeModule === '${module}'`) || module === 'Dashboard',
      `El módulo ${module} no tiene render funcional`,
    )
  }
})

test('dashboard: evita previews que aparentan módulos funcionales', () => {
  assert.doesNotMatch(src, /<ModulePreview name=\{activeModule\}/)
})
