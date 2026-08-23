import { readFile, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const mainPath = resolve(src, 'main.jsx')
const main = await readFile(mainPath, 'utf8')

const relativeImports = [...main.matchAll(/import\s+(?:[^'\"]+from\s+)?['\"](\.\/[^'\"]+)['\"]/g)].map((match) => match[1])
const missing = []
for (const specifier of relativeImports) {
  try { await access(resolve(src, specifier.replace(/^\.\//, ''))) } catch { missing.push(specifier) }
}

const failures = []
if (missing.length) failures.push(`Imports inexistentes: ${missing.join(', ')}`)
if (!main.includes('RuntimeBoundary')) failures.push('Falta RuntimeBoundary en el arranque')
if (!main.includes('FormAccordionManager')) failures.push('Falta el gestor seguro de formularios')
if (main.includes('FormAccordionCoordinator')) failures.push('El coordinador global inestable volvió al arranque')

const obsoleteGlobalSheets = [
  'corporate-premium-global.css',
  'corporate-gray-dark.css',
  'orange-button-clean.css',
  'solid-button-clean.css',
  'less-orange-global.css',
  'enterprise-theme-final.css',
  'enterprise-ui-v2.css',
  'enterprise-ui-v3-hotfix.css',
]
const stillLoaded = obsoleteGlobalSheets.filter((name) => main.includes(name))
if (stillLoaded.length) failures.push(`Capas CSS globales obsoletas todavía cargadas: ${stillLoaded.join(', ')}`)

if (failures.length) {
  console.error('\nAuditoría frontend falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Auditoría frontend OK: ${relativeImports.length} imports verificados y arranque protegido.`)
