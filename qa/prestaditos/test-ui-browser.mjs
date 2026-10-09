// Browser-level mobile and ERP navigation smoke tests; all pages run on localhost.
// Screens use fake preview data, no authentication to live systems.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const origin=process.env.PRESTADITOS_QA_URL || 'http://127.0.0.1:4173'
const url=new URL(origin)
if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))
 throw new Error('QA browser refuses remote hosts')
const browser=await chromium.launch({headless:true})
const test=async(name,fn)=>{await fn();console.log('PASS · '+name)}
let page
try{
 page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1})
 await page.goto(origin+'/prestaditos/app?demo=1',{waitUntil:'domcontentloaded'})
 await test('Demo móvil muestra nombre, inversiones y marca',async()=>{
  await page.getByRole('heading',{name:'Mis inversiones'}).first().waitFor()
  assert.ok(await page.getByText('PRESTADITO$').count()>0)
  assert.ok(await page.getByText('INV-DEMO-100').count()>0)
 })
 await test('Icono/logo original carga en móvil',async()=>{
  const img=page.locator('.pti-brand img')
  await img.waitFor()
  assert.equal(await img.evaluate(el=>el.naturalWidth>0),true)
 })
 await test('Móvil permite solicitar inversión ficticia',async()=>{
  await page.getByRole('button',{name:'Solicitar inversión'}).click()
  await page.getByLabel('Monto solicitado (USD)').fill('125.50')
  await page.getByRole('button',{name:'Enviar solicitud'}).click()
  await page.getByText('SOL-DEMO-NUEVA').waitFor()
  assert.ok((await page.locator('body').innerText()).includes('125.50'))
 })
 await test('Móvil permite solicitar retiro ficticio',async()=>{
  await page.getByRole('button',{name:/Invertir/}).click()
  await page.getByRole('button',{name:'Retiro',exact:true}).click()
  await page.getByLabel('Monto solicitado (USD)').fill('50')
  await page.getByRole('button',{name:'Enviar solicitud'}).click()
  await page.getByText('Retiro',{exact:true}).first().waitFor()
 })
 await test('Pago histórico y navegación móvil visibles',async()=>{
  await page.getByRole('button',{name:/Pagos/}).last().click()
  await page.getByRole('heading',{name:'Historial de pagos'}).waitFor()
  assert.ok(await page.getByText('PAG-DEMO-001').count()>0)
 })
 await test('Pantalla móvil no tiene desplazamiento horizontal',async()=>{
  const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth}))
  assert.ok(dimensions.scrollWidth<=dimensions.width+3,JSON.stringify(dimensions))
 })
 await page.close()
 page=await browser.newPage({viewport:{width:1380,height:900}})
 await page.goto(origin+'/?preview=prestaditos',{waitUntil:'domcontentloaded'})
 await test('ERP Prestaditos conserva vista previa de escritorio',async()=>{
  await page.getByText('IDEALO SV · VISTA PREVIA').first().waitFor()
  assert.ok(await page.getByText('PRESTADITO$').count()>0)
 })
 await test('ERP permite cambiar secciones sin recarga',async()=>{
  await page.getByRole('button',{name:/Inversionistas/}).first().click()
  assert.ok((await page.locator('body').innerText()).includes('Inversionistas'))
  await page.getByRole('button',{name:/Solicitudes/}).first().click()
  assert.ok((await page.locator('body').innerText()).includes('Solicitudes'))
 })
 await page.close()
 page=await browser.newPage({viewport:{width:1380,height:900}})
 await page.goto(origin+'/investors',{waitUntil:'domcontentloaded'})
 await test('Ruta ERP /investors carga sin empresa de workspace seleccionada',async()=>{
  await page.getByText('IDEALO SV · FINANCIERA / INVERSIONISTAS').first().waitFor({timeout:20000})
  const body=await page.locator('body').innerText()
  assert.ok(body.includes('PRESTADITO$'))
 })
 console.log('BROWSER QA: integración visual móvil, ERP y acceso independiente completada')
}catch(e){
 console.error('FALLO QA VISUAL: '+e.message)
 if(page)await page.screenshot({path:process.env.RUNNER_TEMP+'/prestaditos-visual-error.png',fullPage:true}).catch(()=>{})
 process.exitCode=1
}finally{await browser.close()}
