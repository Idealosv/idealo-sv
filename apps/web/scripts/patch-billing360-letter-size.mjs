import fs from 'node:fs'

const file = new URL('../src/Billing360Dashboard.jsx', import.meta.url)
let source = fs.readFileSync(file, 'utf8')

source = source.replace('@page{size:A4;margin:9mm}', '@page{size:Letter;margin:9mm}')
source = source.replace('.paper{width:794px;min-height:1123px;', '.paper{width:816px;min-height:1056px;')

fs.writeFileSync(file, source)
console.log('Billing360: representación DTE ajustada a tamaño carta.')
