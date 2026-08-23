import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = new URL('../src/', import.meta.url)
const failures = []
let checked = 0

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (extname(entry.name) === '.jsx') await inspect(path)
  }
}

async function inspect(path) {
  const source = await readFile(path, 'utf8')
  const buttonPattern = /<button\b[\s\S]*?>/g
  for (const match of source.matchAll(buttonPattern)) {
    checked += 1
    const tag = match[0]
    const isSubmit = /type\s*=\s*["']submit["']/.test(tag)
    const disabled = /\bdisabled(?:\s|=|>)/.test(tag)
    const interactive = /\bon(?:Click|MouseDown|PointerDown|KeyDown)\s*=/.test(tag)
    const spreadsProps = /\{\.\.\.[^}]+\}/.test(tag)
    if (isSubmit || disabled || interactive || spreadsProps) continue
    const line = source.slice(0, match.index).split('\n').length
    failures.push(`${relative(new URL('../src/', import.meta.url).pathname, path)}:${line} botón sin acción explícita`)
  }
}

await walk(root.pathname)

const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8')
if (main.includes('BillingConsumerClientEnhancer')) failures.push('main.jsx todavía monta BillingConsumerClientEnhancer, que puede bloquear la interacción global')

if (failures.length) {
  console.error(`\nAuditoría de botones falló (${checked} botones revisados):`)
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Auditoría de botones OK: ${checked} botones JSX revisados sin acciones muertas detectadas.`)
