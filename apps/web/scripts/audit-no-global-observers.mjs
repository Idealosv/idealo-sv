import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const src=resolve(here,'../src')
const files=['ErpUxCoordinator.jsx','FormSimplificationManager.jsx']
const failures=[]
for(const file of files){
  const source=await readFile(resolve(src,file),'utf8')
  if(source.includes('new MutationObserver')) failures.push(`${file} no debe observar todo el DOM continuamente`)
  if(source.includes("observe(document.body")) failures.push(`${file} no debe observar document.body`)
}
if(failures.length){console.error('\nAuditoría de estabilidad falló:');failures.forEach(f=>console.error(`- ${f}`));process.exit(1)}
console.log('Auditoría de estabilidad OK: sin observadores globales continuos en coordinadores UX.')
