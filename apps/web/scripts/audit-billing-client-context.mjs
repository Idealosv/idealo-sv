import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(here, '../src')
const read = name => fs.readFileSync(path.join(src, name), 'utf8')
const requireText = (text, token, label) => { if (!text.includes(token)) throw new Error(`${label}: falta ${token}`) }
const forbidText = (text, token, label) => { if (text.includes(token)) throw new Error(`${label}: no debe contener ${token}`) }

const launcher = read('FacturacionLauncher.jsx')
const invoice = read('FacturacionDte.jsx')

requireText(launcher, 'initialClientId={contextClient.id}', 'Facturación recibe contexto de Clientes')
forbidText(launcher, 'setInterval(', 'Facturación sin polling DOM')
forbidText(launcher, 'document.querySelector(', 'Facturación sin manipulación DOM')
requireText(invoice, "initialClientId=''", 'Formulario DTE acepta cliente inicial')
requireText(invoice, 'setClientId(initialClientId)', 'Formulario DTE aplica cliente inicial')

console.log('OK contexto Cliente → Facturación: selección directa, sin polling ni manipulación DOM')
