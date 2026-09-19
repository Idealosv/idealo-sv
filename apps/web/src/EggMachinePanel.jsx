import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'

const num=v=>new Intl.NumberFormat('es-SV',{maximumFractionDigits:0}).format(Number(v||0))
const decimal=v=>new Intl.NumberFormat('es-SV',{minimumFractionDigits:1,maximumFractionDigits:2}).format(Number(v||0))
const dateTime=v=>v?new Date(v).toLocaleString('es-SV',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—'
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')
const defaultDevice={name:'Clasificadora principal',protocol:'CSV',baud_rate:'9600',data_format:'WEIGHT,QUALITY,UV',adapter_name:'GENERIC',delimiter:',',decimal_separator:'.',weight_column:'0',quality_column:'1',uv_column:'2',weight_multiplier:'1',notes:''}

function parseLine(line,device={}){
 const raw=String(line||'').trim()
 if(!raw)return null
 const delimiter=device.delimiter==='TAB'?'\t':String(device.delimiter||',')
 const parts=raw.split(delimiter).map(x=>x.trim())
 const wi=Number(device.weight_column??0),qi=Number(device.quality_column??1),ui=Number(device.uv_column??2)
 const decimalSeparator=String(device.decimal_separator||'.')
 const weightRaw=String(parts[wi]||'').replace(decimalSeparator,'.')
 const weight=Number(weightRaw)*Number(device.weight_multiplier||1)
 if(!Number.isFinite(weight)||weight<=0)return null
 let quality=String(parts[qi]||'GOOD').toUpperCase()
 let uv=String(parts[ui]||'UNKNOWN').toUpperCase()
 if(['OK','PASS','GOOD','1'].includes(quality))quality='GOOD'
 if(['BAD','REJECT','DAMAGED','0'].includes(quality))quality='DAMAGED'
 if(!['GOOD','DAMAGED'].includes(quality))quality='GOOD'
 if(['OK','GOOD','1'].includes(uv))uv='PASS'
 if(['BAD','REJECT','0'].includes(uv))uv='FAIL'
 if(!['PASS','FAIL','UNKNOWN'].includes(uv))uv='UNKNOWN'
 return{weight_g:Number(weight.toFixed(2)),quality,uv,raw}
}

function gradeForWeight(grades,weight){
 return grades.find(g=>
  (g.min_weight_g==null||weight>=Number(g.min_weight_g))&&
  (g.max_weight_g==null||weight<=Number(g.max_weight_g))
 )||null
}

export default function EggMachinePanel({companyId,onGoLots}){
 const [devices,setDevices]=useState([])
 const [batches,setBatches]=useState([])
 const [grades,setGrades]=useState([])
 const [imports,setImports]=useState([])
 const [deviceForm,setDeviceForm]=useState(defaultDevice)
 const [batchId,setBatchId]=useState('')
 const [deviceId,setDeviceId]=useState('')
 const [source,setSource]=useState('CSV')
 const [raw,setRaw]=useState('')
 const [serialConnected,setSerialConnected]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [sessionStartedAt,setSessionStartedAt]=useState(null)
 const [clock,setClock]=useState(Date.now())
 const portRef=useRef(null)
 const readerRef=useRef(null)
 const serialBufferRef=useRef('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [d,b,g,i]=await Promise.all([
   supabase.from('egg_machine_devices').select('*').eq('company_id',companyId).order('name'),
   supabase.from('egg_batches').select('id,batch_code,total_eggs,status,received_at,egg_batch_classifications(quantity_eggs,damaged_eggs)').eq('company_id',companyId).order('received_at',{ascending:false}).limit(100),
   supabase.from('egg_grades').select('*').eq('company_id',companyId).eq('active',true).order('sort_order'),
   supabase.from('egg_machine_imports').select('*,egg_batches(batch_code),egg_machine_devices(name)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(50)
  ])
  for(const r of [d,b,g,i])if(r.error)throw r.error
  setDevices(d.data||[])
  setBatches(b.data||[])
  setGrades(g.data||[])
  setImports(i.data||[])
  setDeviceId(current=>current&&d.data?.some(x=>x.id===current)?current:d.data?.[0]?.id||'')
  setBatchId(current=>current&&b.data?.some(x=>x.id===current&&x.status==='OPEN')?current:b.data?.find(x=>x.status==='OPEN')?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])
 useEffect(()=>()=>{readerRef.current?.cancel?.().catch(()=>{});portRef.current?.close?.().catch(()=>{})},[])
 useEffect(()=>{
  if(!serialConnected)return
  const id=setInterval(()=>setClock(Date.now()),1000)
  return()=>clearInterval(id)
 },[serialConnected])

 useEffect(()=>{
  const selected=devices.find(d=>d.id===deviceId)
  if(!selected)return
  setDeviceForm({
   name:selected.name||'',
   protocol:selected.protocol||'CSV',
   baud_rate:String(selected.baud_rate||9600),
   data_format:selected.data_format||'WEIGHT,QUALITY,UV',
   adapter_name:selected.adapter_name||'GENERIC',
   delimiter:selected.delimiter||',',
   decimal_separator:selected.decimal_separator||'.',
   weight_column:String(selected.weight_column??0),
   quality_column:String(selected.quality_column??1),
   uv_column:String(selected.uv_column??2),
   weight_multiplier:String(selected.weight_multiplier??1),
   notes:selected.notes||''
  })
 },[deviceId,devices])

 const selectedDevice=devices.find(d=>d.id===deviceId)||deviceForm
 const openBatches=useMemo(()=>batches.filter(b=>b.status==='OPEN'),[batches])
 const selectedBatch=openBatches.find(b=>b.id===batchId)||null
 const remainingForBatch=batch=>{
  if(!batch)return 0
  const used=(batch.egg_batch_classifications||[]).reduce((sum,row)=>sum+Number(row.quantity_eggs||0)+Number(row.damaged_eggs||0),0)
  return Math.max(0,Number(batch.total_eggs||0)-used)
 }
 const selectedRemaining=remainingForBatch(selectedBatch)

 const rawLines=useMemo(()=>raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),[raw])
 const entries=useMemo(()=>rawLines.map(line=>parseLine(line,selectedDevice)).filter(Boolean),[rawLines,selectedDevice])
 const invalidLines=Math.max(0,rawLines.length-entries.length)
 const accepted=entries.filter(x=>x.quality==='GOOD'&&x.uv!=='FAIL')
 const rejected=entries.length-accepted.length
 const avgWeight=entries.length?entries.reduce((s,x)=>s+Number(x.weight_g||0),0)/entries.length:0
 const lastRead=entries.at(-1)||null
 const lastGrade=lastRead?gradeForWeight(grades,lastRead.weight_g):null
 const uvPass=entries.filter(x=>x.uv==='PASS').length
 const uvFail=entries.filter(x=>x.uv==='FAIL').length

 const preview=useMemo(()=>{
  const counts=new Map()
  for(const entry of entries){
   const grade=gradeForWeight(grades,entry.weight_g)
   const key=grade?.name||'Sin clasificación'
   const current=counts.get(key)||{good:0,bad:0,total:0,min:null,max:null}
   const bad=entry.quality==='DAMAGED'||entry.uv==='FAIL'
   if(bad)current.bad+=1
   else current.good+=1
   current.total+=1
   current.min=current.min==null?entry.weight_g:Math.min(current.min,entry.weight_g)
   current.max=current.max==null?entry.weight_g:Math.max(current.max,entry.weight_g)
   counts.set(key,current)
  }
  return [...counts.entries()].sort((a,b)=>b[1].total-a[1].total)
 },[entries,grades])

 const serialRate=useMemo(()=>{
  if(!serialConnected||!sessionStartedAt||!entries.length)return 0
  const minutes=Math.max((clock-sessionStartedAt)/60000,1/60)
  return Math.round(entries.length/minutes)
 },[serialConnected,sessionStartedAt,entries.length,clock])

 const act=async(fn,message)=>{
  setSaving(true);setError('');setNotice('')
  try{
   const result=await fn()
   await load()
   setNotice(message)
   return result
  }catch(e){
   setError(errorText(e))
   return null
  }finally{setSaving(false)}
 }

 const saveDevice=e=>{
  e.preventDefault()
  return act(async()=>{
   const payload={
    company_id:companyId,
    name:deviceForm.name.trim(),
    protocol:deviceForm.protocol,
    baud_rate:Number(deviceForm.baud_rate),
    data_format:deviceForm.data_format.trim(),
    adapter_name:deviceForm.adapter_name.trim()||'GENERIC',
    delimiter:deviceForm.delimiter,
    decimal_separator:deviceForm.decimal_separator,
    weight_column:Number(deviceForm.weight_column),
    quality_column:Number(deviceForm.quality_column),
    uv_column:Number(deviceForm.uv_column),
    weight_multiplier:Number(deviceForm.weight_multiplier),
    notes:deviceForm.notes.trim(),
    active:true,
    updated_at:new Date().toISOString()
   }
   if(deviceId){
    const {error}=await supabase.from('egg_machine_devices').update(payload).eq('id',deviceId).eq('company_id',companyId)
    if(error)throw error
   }else{
    const {data,error}=await supabase.from('egg_machine_devices').insert(payload).select('id').single()
    if(error)throw error
    setDeviceId(data.id)
   }
  },deviceId?'Configuración del equipo actualizada.':'Equipo guardado. Ya puede utilizarse para importar lecturas.')
 }

 const newDevice=()=>{
  setDeviceId('')
  setDeviceForm(defaultDevice)
  setNotice('')
  setError('')
 }

 const importReadings=e=>{
  e.preventDefault()
  if(!batchId)return setError('Seleccioná un lote abierto.')
  if(!entries.length)return setError('No hay lecturas válidas para importar.')
  if(entries.length>selectedRemaining)return setError('Hay '+num(entries.length)+' lecturas pero el lote solo tiene '+num(selectedRemaining)+' huevos pendientes.')
  return act(async()=>{
   const {data,error}=await supabase.rpc('egg_import_weight_events_secure',{
    p_company_id:companyId,p_batch_id:batchId,p_device_id:deviceId||null,p_entries:entries,p_source:source
   })
   if(error)throw error
   setRaw('')
   return data
  },'Clasificación procesada: '+num(accepted.length)+' aceptados y '+num(rejected)+' rechazados. Inventario actualizado.')
 }

 const fileSelected=async e=>{
  const file=e.target.files?.[0]
  if(!file)return
  setRaw(await file.text())
  setSource('CSV')
  setNotice('Archivo cargado: '+file.name)
  e.target.value=''
 }

 const disconnectSerial=async()=>{
  try{await readerRef.current?.cancel?.()}catch{}
  try{readerRef.current?.releaseLock?.()}catch{}
  try{await portRef.current?.close?.()}catch{}
  readerRef.current=null
  portRef.current=null
  setSerialConnected(false)
  setSessionStartedAt(null)
  setNotice('Conexión serial finalizada.')
 }

 const connectSerial=async()=>{
  setError('');setNotice('')
  if(!('serial'in navigator)){
   setError('Este navegador no permite conexión serial. Usá Chrome o Edge de escritorio, o importá un archivo CSV/TXT.')
   return
  }
  if(!deviceId){
   setError('Primero guardá o seleccioná un equipo.')
   return
  }
  try{
   const selected=devices.find(d=>d.id===deviceId)
   const port=await navigator.serial.requestPort()
   await port.open({baudRate:Number(selected?.baud_rate||9600)})
   portRef.current=port
   setSerialConnected(true)
   setSessionStartedAt(Date.now())
   setClock(Date.now())
   setSource('SERIAL')
   setNotice('Puerto serial conectado. Las lecturas aparecerán en tiempo real.')
   const decoder=new TextDecoderStream()
   port.readable.pipeTo(decoder.writable).catch(()=>{})
   const reader=decoder.readable.getReader()
   readerRef.current=reader
   while(true){
    const {value,done}=await reader.read()
    if(done)break
    serialBufferRef.current+=value
    const parts=serialBufferRef.current.split(/\r?\n/)
    serialBufferRef.current=parts.pop()||''
    const valid=parts.map(x=>x.trim()).filter(x=>parseLine(x,selected))
    if(valid.length)setRaw(current=>current+(current&&!current.endsWith('\n')?'\n':'')+valid.join('\n')+'\n')
   }
  }catch(e){
   if(String(e?.name)!=='NotFoundError')setError(errorText(e))
  }finally{
   try{readerRef.current?.releaseLock?.()}catch{}
   readerRef.current=null
   if(portRef.current){try{await portRef.current.close()}catch{}}
   portRef.current=null
   setSerialConnected(false)
   setSessionStartedAt(null)
  }
 }

 const loadSample=()=>{
  setRaw('72.2,GOOD,PASS\n66.8,GOOD,PASS\n62.4,GOOD,PASS\n58.1,GOOD,PASS\n51.7,GOOD,UNKNOWN\n48.0,DAMAGED,FAIL\n')
  setSource('MANUAL')
  setNotice('Muestra de diagnóstico cargada. No se guardará nada hasta que elijas un lote y confirmes la clasificación.')
 }

 return <div className="eggs-machine-v2">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-machine-hero">
   <div>
    <small>CLASIFICACIÓN AUTOMÁTICA</small>
    <h2>Clasificadora y control de pesaje</h2>
    <p>Conectá la máquina, recibí pesos, validá UV y enviá únicamente las lecturas confirmadas al inventario.</p>
   </div>
   <div className="eggs-machine-hero-actions">
    <span className={'eggs-machine-connection '+(serialConnected?'online':'offline')}><i></i>{serialConnected?'Serial conectado':'Sin conexión'}</span>
    {!openBatches.length&&<button type="button" onClick={()=>onGoLots?.()}>Recibir lote</button>}
   </div>
  </section>

  <section className="eggs-machine-kpis">
   <article><span>Lotes abiertos</span><strong>{num(openBatches.length)}</strong><small>{openBatches.length?'disponibles para clasificar':'recibí un nuevo lote'}</small></article>
   <article><span>Lecturas listas</span><strong>{num(entries.length)}</strong><small>{invalidLines} líneas inválidas</small></article>
   <article><span>Aceptados</span><strong>{num(accepted.length)}</strong><small>peso/calidad válidos</small></article>
   <article><span>Rechazos</span><strong>{num(rejected)}</strong><small>daño o UV FAIL</small></article>
   <article><span>Peso promedio</span><strong>{entries.length?decimal(avgWeight)+' g':'—'}</strong><small>sesión actual</small></article>
   <article><span>Velocidad</span><strong>{serialConnected?num(serialRate):'—'}</strong><small>{serialConnected?'lecturas/min':'solo conexión serial'}</small></article>
  </section>

  <section className="eggs-machine-workspace">
   <article className="eggs-card eggs-machine-control">
    <div className="eggs-section-head"><div><small>PASO 1 · PREPARACIÓN</small><h2>Lote y equipo</h2><p>Seleccioná dónde se aplicará la clasificación antes de confirmar lecturas.</p></div></div>

    {!openBatches.length?<div className="eggs-machine-no-batch">
     <div>✓</div>
     <strong>No hay lotes abiertos</strong>
     <p>Los lotes actuales ya están clasificados al 100%. Recibí un nuevo lote para habilitar la entrada automática al inventario.</p>
     <button type="button" onClick={()=>onGoLots?.()}>Ir a Lotes</button>
    </div>:<>
     <label className="eggs-field"><span>Lote activo</span><select value={batchId} onChange={e=>setBatchId(e.target.value)}><option value="">Seleccionar lote abierto</option>{openBatches.map(b=><option key={b.id} value={b.id}>{b.batch_code} · {num(remainingForBatch(b))} pendientes</option>)}</select></label>
     {selectedBatch&&<div className="eggs-machine-batch-summary">
      <div><span>Recibidos</span><b>{num(selectedBatch.total_eggs)}</b></div>
      <div><span>Pendientes</span><b>{num(selectedRemaining)}</b></div>
      <div><span>Lecturas preparadas</span><b>{num(entries.length)}</b></div>
      <div className={entries.length>selectedRemaining?'danger':''}><span>Después de importar</span><b>{num(Math.max(0,selectedRemaining-entries.length))}</b></div>
     </div>}
    </>}

    <label className="eggs-field"><span>Equipo</span><select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Sin equipo guardado</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name} · {d.protocol} · {d.baud_rate} baud</option>)}</select></label>

    <div className="eggs-machine-main-actions">
     <label className="eggs-machine-file">Cargar CSV/TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={fileSelected}/></label>
     {!serialConnected?<button type="button" onClick={connectSerial} disabled={!deviceId}>Conectar USB / Serial</button>:<button type="button" className="danger" onClick={disconnectSerial}>Desconectar</button>}
     <button type="button" className="secondary" onClick={loadSample}>Probar con muestra</button>
    </div>

    {!devices.length&&<div className="eggs-note">Todavía no hay equipos guardados. Abrí <b>Configuración del equipo</b> más abajo y registrá la clasificadora antes de conectar USB/Serial.</div>}
   </article>

   <article className="eggs-card eggs-machine-live">
    <div className="eggs-section-head"><div><small>PASO 2 · MONITOR</small><h2>Lectura en tiempo real</h2><p>Vista previa antes de modificar inventario.</p></div><span className={'eggs-pill '+(entries.length?'good':'neutral')}>{num(entries.length)} lecturas</span></div>

    {lastRead?<div className="eggs-machine-current">
     <div className="eggs-machine-weight"><span>PESO ACTUAL</span><strong>{decimal(lastRead.weight_g)}</strong><b>g</b></div>
     <div className="eggs-machine-current-info">
      <div><span>Clasificación</span><b>{lastGrade?.name||'Sin rango'}</b></div>
      <div><span>Calidad</span><b className={lastRead.quality==='GOOD'?'good':'bad'}>{lastRead.quality}</b></div>
      <div><span>UV</span><b className={lastRead.uv==='FAIL'?'bad':lastRead.uv==='PASS'?'good':''}>{lastRead.uv}</b></div>
     </div>
    </div>:<div className="eggs-machine-awaiting">
     <div className="eggs-machine-pulse"></div>
     <strong>Esperando lecturas</strong>
     <p>Cargá un archivo, usá la muestra o conectá la clasificadora por USB/Serial.</p>
    </div>}

    <div className="eggs-machine-live-stats">
     <div><span>UV PASS</span><b>{num(uvPass)}</b></div>
     <div><span>UV FAIL</span><b>{num(uvFail)}</b></div>
     <div><span>Sin dato UV</span><b>{num(entries.length-uvPass-uvFail)}</b></div>
     <div><span>Líneas inválidas</span><b>{num(invalidLines)}</b></div>
    </div>
   </article>
  </section>

  <section className="eggs-machine-processing">
   <article className="eggs-card">
    <div className="eggs-section-head"><div><small>PASO 3 · CLASIFICACIÓN</small><h2>Distribución automática</h2><p>Resultado calculado con los rangos de peso configurados.</p></div></div>
    <div className="eggs-machine-preview-v2">
     {preview.map(([name,c])=><div key={name}>
      <span className="name"><b>{name}</b><small>{decimal(c.min)}–{decimal(c.max)} g</small></span>
      <span><b>{num(c.total)}</b><small>leídos</small></span>
      <span className="good"><b>{num(c.good)}</b><small>buenos</small></span>
      <span className="bad"><b>{num(c.bad)}</b><small>rechazo</small></span>
     </div>)}
     {!preview.length&&<div className="eggs-empty">Aún no hay lecturas para clasificar.</div>}
    </div>
   </article>

   <form className="eggs-card eggs-machine-confirm" onSubmit={importReadings}>
    <div className="eggs-section-head"><div><small>PASO 4 · CONFIRMACIÓN</small><h2>Ingresar al inventario</h2><p>Revisá el resumen antes de hacer el movimiento definitivo.</p></div></div>
    <div className="eggs-machine-confirm-summary">
     <div><span>Origen</span><b>{source}</b></div>
     <div><span>Lecturas</span><b>{num(entries.length)}</b></div>
     <div><span>Aceptados</span><b>{num(accepted.length)}</b></div>
     <div><span>Rechazos</span><b>{num(rejected)}</b></div>
    </div>
    {entries.length>selectedRemaining&&selectedBatch&&<div className="eggs-alert error">Las lecturas superan los {num(selectedRemaining)} huevos pendientes del lote.</div>}
    {!selectedBatch&&<div className="eggs-note">Podés probar y revisar lecturas sin lote, pero para ingresarlas al inventario primero necesitás un lote abierto.</div>}
    <button className="eggs-primary" disabled={saving||!entries.length||!selectedBatch||entries.length>selectedRemaining}>Clasificar e ingresar al inventario</button>
    <small className="eggs-machine-confirm-help">Esta acción registra la clasificación por peso, marca rechazo por daño/UV y genera movimientos de inventario únicamente para huevos aceptados.</small>
   </form>
  </section>

  <section className="eggs-card eggs-machine-console">
   <details open={Boolean(raw)}>
    <summary><span><small>LECTURAS CRUDAS</small><strong>Consola de entrada</strong></span><b>{num(rawLines.length)} líneas</b></summary>
    <div className="eggs-machine-console-body">
     <label className="eggs-field"><span>Origen</span><select value={source} onChange={e=>setSource(e.target.value)}><option value="CSV">CSV / TXT</option><option value="SERIAL">Serial USB</option><option value="API">API</option><option value="MANUAL">Manual / prueba</option></select></label>
     <label className="eggs-field"><span>Datos recibidos</span><textarea className="eggs-machine-textarea" value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'62.4,GOOD,PASS\n59.8,GOOD,PASS\n48.2,DAMAGED,FAIL'}/></label>
     <div className="eggs-machine-console-footer"><span>{entries.length} válidas · {invalidLines} inválidas</span>{raw&&<button type="button" onClick={()=>setRaw('')}>Limpiar lecturas</button>}</div>
    </div>
   </details>
  </section>

  <section className="eggs-card eggs-machine-settings">
   <details>
    <summary><span><small>CONFIGURACIÓN AVANZADA</small><strong>Equipo, formato y adaptador</strong></span><b>{deviceId?'Editar equipo':'Nuevo equipo'}</b></summary>
    <form className="eggs-machine-settings-body" onSubmit={saveDevice}>
     <div className="eggs-machine-settings-toolbar">
      <label className="eggs-field"><span>Equipo guardado</span><select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Nuevo equipo</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <button type="button" onClick={newDevice}>Nuevo equipo</button>
     </div>
     <label className="eggs-field"><span>Nombre del equipo</span><input required value={deviceForm.name} onChange={e=>setDeviceForm({...deviceForm,name:e.target.value})}/></label>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Conexión</span><select value={deviceForm.protocol} onChange={e=>setDeviceForm({...deviceForm,protocol:e.target.value})}><option value="CSV">Archivo CSV/TXT</option><option value="SERIAL">USB / Serial</option><option value="API">API</option><option value="MANUAL">Manual</option></select></label>
      <label className="eggs-field"><span>Baud rate</span><input type="number" min="300" value={deviceForm.baud_rate} onChange={e=>setDeviceForm({...deviceForm,baud_rate:e.target.value})}/></label>
     </div>
     <label className="eggs-field"><span>Formato esperado</span><input value={deviceForm.data_format} onChange={e=>setDeviceForm({...deviceForm,data_format:e.target.value})}/><small>Ejemplo: 62.4,GOOD,PASS</small></label>
     <div className="eggs-form-grid">
      <label className="eggs-field"><span>Adaptador / modelo</span><input value={deviceForm.adapter_name} onChange={e=>setDeviceForm({...deviceForm,adapter_name:e.target.value})} placeholder="Marca / modelo"/></label>
      <label className="eggs-field"><span>Separador</span><select value={deviceForm.delimiter} onChange={e=>setDeviceForm({...deviceForm,delimiter:e.target.value})}><option value=",">Coma (,)</option><option value=";">Punto y coma (;)</option><option value="TAB">Tabulación</option><option value="|">Barra (|)</option></select></label>
     </div>
     <div className="eggs-form-grid eggs-machine-columns">
      <label className="eggs-field"><span>Columna peso</span><input type="number" min="0" value={deviceForm.weight_column} onChange={e=>setDeviceForm({...deviceForm,weight_column:e.target.value})}/></label>
      <label className="eggs-field"><span>Columna calidad</span><input type="number" min="0" value={deviceForm.quality_column} onChange={e=>setDeviceForm({...deviceForm,quality_column:e.target.value})}/></label>
      <label className="eggs-field"><span>Columna UV</span><input type="number" min="0" value={deviceForm.uv_column} onChange={e=>setDeviceForm({...deviceForm,uv_column:e.target.value})}/></label>
      <label className="eggs-field"><span>Multiplicador peso</span><input type="number" min="0.000001" step="0.000001" value={deviceForm.weight_multiplier} onChange={e=>setDeviceForm({...deviceForm,weight_multiplier:e.target.value})}/></label>
     </div>
     <label className="eggs-field"><span>Separador decimal</span><select value={deviceForm.decimal_separator} onChange={e=>setDeviceForm({...deviceForm,decimal_separator:e.target.value})}><option value=".">Punto</option><option value=",">Coma</option></select></label>
     <label className="eggs-field"><span>Notas</span><textarea value={deviceForm.notes} onChange={e=>setDeviceForm({...deviceForm,notes:e.target.value})}/></label>
     <button className="eggs-primary" disabled={saving}>{deviceId?'Actualizar configuración':'Guardar equipo'}</button>
    </form>
   </details>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Importaciones de máquina</h2><p>Últimas sesiones que modificaron clasificación e inventario.</p></div><span className="eggs-pill">{imports.length}</span></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Lote</th><th>Equipo</th><th>Origen</th><th>Leídos</th><th>Aceptados</th><th>Rechazos</th><th>Estado</th></tr></thead><tbody>
    {imports.map(row=><tr key={row.id}><td>{dateTime(row.created_at)}</td><td>{row.egg_batches?.batch_code||'—'}</td><td>{row.egg_machine_devices?.name||'Sin equipo'}</td><td>{row.source}</td><td>{num(row.rows_received)}</td><td>{num(row.rows_accepted)}</td><td>{num(row.rows_rejected)}</td><td><span className={'eggs-pill '+(row.status==='COMPLETED'?'good':row.status==='FAILED'?'danger':'warn')}>{row.status}</span></td></tr>)}
    {!imports.length&&<tr><td colSpan="8"><div className="eggs-empty">Todavía no hay importaciones. Podés probar el analizador con “Probar con muestra” sin afectar inventario.</div></td></tr>}
   </tbody></table></div>
  </section>
 </div>
}
