import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase.js'

const num=v=>new Intl.NumberFormat('es-SV').format(Number(v||0))
const errorText=e=>String(e?.message||e||'No se pudo completar la operación.')

function parseLine(line){
 const raw=String(line||'').trim()
 if(!raw)return null
 const parts=raw.split(/[;,\t]/).map(x=>x.trim()).filter(Boolean)
 const weight=Number(String(parts[0]||'').replace(',','.'))
 if(!Number.isFinite(weight)||weight<=0)return null
 let quality=String(parts[1]||'GOOD').toUpperCase()
 let uv=String(parts[2]||'UNKNOWN').toUpperCase()
 if(['OK','PASS','GOOD','1'].includes(quality))quality='GOOD'
 if(['BAD','REJECT','DAMAGED','0'].includes(quality))quality='DAMAGED'
 if(!['GOOD','DAMAGED'].includes(quality))quality='GOOD'
 if(['OK','GOOD','1'].includes(uv))uv='PASS'
 if(['BAD','REJECT','0'].includes(uv))uv='FAIL'
 if(!['PASS','FAIL','UNKNOWN'].includes(uv))uv='UNKNOWN'
 return{weight_g:weight,quality,uv,raw}
}

export default function EggMachinePanel({companyId}){
 const [devices,setDevices]=useState([])
 const [batches,setBatches]=useState([])
 const [grades,setGrades]=useState([])
 const [imports,setImports]=useState([])
 const [deviceForm,setDeviceForm]=useState({name:'Clasificadora principal',protocol:'CSV',baud_rate:'9600',data_format:'WEIGHT,QUALITY,UV',notes:''})
 const [batchId,setBatchId]=useState('')
 const [deviceId,setDeviceId]=useState('')
 const [source,setSource]=useState('CSV')
 const [raw,setRaw]=useState('')
 const [serialConnected,setSerialConnected]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const portRef=useRef(null)
 const readerRef=useRef(null)
 const serialBufferRef=useRef('')

 const load=useCallback(async()=>{
  if(!companyId)return
  const [d,b,g,i]=await Promise.all([
   supabase.from('egg_machine_devices').select('*').eq('company_id',companyId).order('name'),
   supabase.from('egg_batches').select('id,batch_code,total_eggs,status,received_at').eq('company_id',companyId).order('received_at',{ascending:false}).limit(100),
   supabase.from('egg_grades').select('*').eq('company_id',companyId).eq('active',true).order('sort_order'),
   supabase.from('egg_machine_imports').select('*,egg_batches(batch_code),egg_machine_devices(name)').eq('company_id',companyId).order('created_at',{ascending:false}).limit(50)
  ])
  for(const r of [d,b,g,i])if(r.error)throw r.error
  setDevices(d.data||[]);setBatches(b.data||[]);setGrades(g.data||[]);setImports(i.data||[])
  setDeviceId(current=>current||d.data?.[0]?.id||'')
  setBatchId(current=>current||b.data?.find(x=>x.status==='OPEN')?.id||'')
 },[companyId])

 useEffect(()=>{load().catch(e=>setError(errorText(e)))},[load])
 useEffect(()=>()=>{readerRef.current?.cancel?.().catch(()=>{});portRef.current?.close?.().catch(()=>{})},[])

 const entries=useMemo(()=>raw.split(/\r?\n/).map(parseLine).filter(Boolean),[raw])
 const preview=useMemo(()=>{
  const counts=new Map()
  for(const entry of entries){
   const grade=grades.find(g=>(g.min_weight_g==null||entry.weight_g>=Number(g.min_weight_g))&&(g.max_weight_g==null||entry.weight_g<=Number(g.max_weight_g)))
   const key=grade?.name||'Sin clasificación'
   const current=counts.get(key)||{good:0,bad:0}
   if(entry.quality==='DAMAGED'||entry.uv==='FAIL')current.bad+=1
   else current.good+=1
   counts.set(key,current)
  }
  return[...counts.entries()]
 },[entries,grades])

 const act=async(fn,message)=>{setSaving(true);setError('');setNotice('');try{await fn();setNotice(message);await load()}catch(e){setError(errorText(e))}finally{setSaving(false)}}

 const createDevice=e=>{e.preventDefault();return act(async()=>{
  const {data,error}=await supabase.from('egg_machine_devices').insert({company_id:companyId,name:deviceForm.name,protocol:deviceForm.protocol,baud_rate:Number(deviceForm.baud_rate),data_format:deviceForm.data_format,notes:deviceForm.notes}).select('id').single()
  if(error)throw error
  setDeviceId(data.id)
 },'Equipo guardado. Ya puede utilizarse para importar lecturas.')}

 const importReadings=e=>{e.preventDefault();if(!batchId) return setError('Seleccioná un lote abierto.')
  if(!entries.length)return setError('No hay lecturas válidas para importar.')
  return act(async()=>{
   const {data,error}=await supabase.rpc('egg_import_weight_events',{p_company_id:companyId,p_batch_id:batchId,p_device_id:deviceId||null,p_entries:entries,p_source:source})
   if(error)throw error
   setRaw('')
   setNotice(`Importación completada: ${data?.accepted||0} buenos, ${data?.rejected||0} rechazados.`)
  },'Lecturas importadas e inventario actualizado automáticamente.')
 }

 const fileSelected=async e=>{
  const file=e.target.files?.[0];if(!file)return
  setRaw(await file.text());setSource('CSV')
 }

 const disconnectSerial=async()=>{
  try{await readerRef.current?.cancel?.()}catch{}
  try{readerRef.current?.releaseLock?.()}catch{}
  try{await portRef.current?.close?.()}catch{}
  readerRef.current=null;portRef.current=null;setSerialConnected(false)
 }

 const connectSerial=async()=>{
  setError('');setNotice('')
  if(!('serial'in navigator)){setError('Este navegador no permite conexión serial. Usá Chrome o Edge de escritorio, o importá CSV.');return}
  try{
   const selected=devices.find(d=>d.id===deviceId)
   const port=await navigator.serial.requestPort()
   await port.open({baudRate:Number(selected?.baud_rate||9600)})
   portRef.current=port;setSerialConnected(true);setSource('SERIAL');setNotice('Puerto serial conectado. Las lecturas se agregarán automáticamente.')
   const decoder=new TextDecoderStream()
   port.readable.pipeTo(decoder.writable).catch(()=>{})
   const reader=decoder.readable.getReader();readerRef.current=reader
   while(true){
    const {value,done}=await reader.read()
    if(done)break
    serialBufferRef.current+=value
    const parts=serialBufferRef.current.split(/\r?\n/)
    serialBufferRef.current=parts.pop()||''
    const valid=parts.map(x=>x.trim()).filter(x=>parseLine(x))
    if(valid.length)setRaw(current=>current+(current&&!current.endsWith('\n')?'\n':'')+valid.join('\n')+'\n')
   }
  }catch(e){
   if(String(e?.name)!=='NotFoundError')setError(errorText(e))
  }finally{
   try{readerRef.current?.releaseLock?.()}catch{}
   readerRef.current=null
   if(portRef.current){try{await portRef.current.close()}catch{}}
   portRef.current=null;setSerialConnected(false)
  }
 }

 return <div className="eggs-v2-stack">
  {error&&<div className="eggs-alert error">{error}</div>}
  {notice&&<div className="eggs-alert success">{notice}</div>}

  <section className="eggs-two-column">
   <form className="eggs-card eggs-form" onSubmit={createDevice}>
    <div className="eggs-section-head"><div><small>EQUIPO</small><h2>Clasificadora / báscula</h2><p>Configura el equipo que entrega las lecturas de peso.</p></div></div>
    <label className="eggs-field"><span>Nombre del equipo</span><input required value={deviceForm.name} onChange={e=>setDeviceForm({...deviceForm,name:e.target.value})}/></label>
    <div className="eggs-form-grid">
     <label className="eggs-field"><span>Conexión</span><select value={deviceForm.protocol} onChange={e=>setDeviceForm({...deviceForm,protocol:e.target.value})}><option value="CSV">Archivo CSV/TXT</option><option value="SERIAL">USB / Serial</option><option value="API">API</option><option value="MANUAL">Manual</option></select></label>
     <label className="eggs-field"><span>Baud rate</span><input type="number" min="300" value={deviceForm.baud_rate} onChange={e=>setDeviceForm({...deviceForm,baud_rate:e.target.value})}/></label>
    </div>
    <label className="eggs-field"><span>Formato esperado</span><input value={deviceForm.data_format} onChange={e=>setDeviceForm({...deviceForm,data_format:e.target.value})}/><small>Formato genérico: peso, calidad, UV. Ejemplo: 62.4,GOOD,PASS</small></label>
    <label className="eggs-field"><span>Notas</span><textarea value={deviceForm.notes} onChange={e=>setDeviceForm({...deviceForm,notes:e.target.value})}/></label>
    <button className="eggs-primary" disabled={saving}>Guardar equipo</button>
   </form>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>CONEXIÓN</small><h2>Captura automática</h2><p>Compatible con archivo exportado y puerto serial USB cuando el equipo envía texto.</p></div></div>
    <label className="eggs-field"><span>Equipo</span><select value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Sin equipo</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name} · {d.protocol} · {d.baud_rate} baud</option>)}</select></label>
    <label className="eggs-field"><span>Lote destino</span><select value={batchId} onChange={e=>setBatchId(e.target.value)}><option value="">Seleccionar lote abierto</option>{batches.filter(b=>b.status==='OPEN').map(b=><option key={b.id} value={b.id}>{b.batch_code} · {num(b.total_eggs)} huevos</option>)}</select></label>
    <div className="eggs-machine-actions">
     <label className="eggs-file-button">Importar CSV/TXT<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={fileSelected}/></label>
     {!serialConnected?<button type="button" onClick={connectSerial}>Conectar USB/Serial</button>:<button type="button" className="danger" onClick={disconnectSerial}>Desconectar serial</button>}
    </div>
    <div className="eggs-machine-status"><span className={`eggs-pill ${serialConnected?'good':'neutral'}`}>{serialConnected?'Serial conectado':'Sin conexión serial'}</span><small>{entries.length} lecturas listas</small></div>
   </section>
  </section>

  <section className="eggs-two-column">
   <form className="eggs-card eggs-form eggs-machine-import" onSubmit={importReadings}>
    <div className="eggs-section-head"><div><small>LECTURAS</small><h2>Pesos recibidos</h2><p>Una lectura por línea. Puede incluir calidad y resultado UV.</p></div></div>
    <label className="eggs-field"><span>Origen</span><select value={source} onChange={e=>setSource(e.target.value)}><option value="CSV">CSV / TXT</option><option value="SERIAL">Serial USB</option><option value="API">API</option><option value="MANUAL">Manual</option></select></label>
    <label className="eggs-field"><span>Datos</span><textarea className="eggs-machine-textarea" value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'62.4,GOOD,PASS\n59.8,GOOD,PASS\n48.2,DAMAGED,FAIL'}/></label>
    <button className="eggs-primary" disabled={saving||!entries.length||!batchId}>Clasificar e ingresar al inventario</button>
   </form>

   <section className="eggs-card">
    <div className="eggs-section-head"><div><small>VISTA PREVIA</small><h2>Clasificación automática</h2></div><span className="eggs-pill">{entries.length} lecturas</span></div>
    <div className="eggs-machine-preview">
     {preview.map(([name,c])=><div key={name}><span><b>{name}</b><small>Según rango de peso configurado</small></span><span><b>{c.good}</b><small>buenos</small></span><span><b>{c.bad}</b><small>rechazo</small></span></div>)}
     {!preview.length&&<div className="eggs-empty">Cargá un archivo o conectá la clasificadora para ver la clasificación.</div>}
    </div>
    <div className="eggs-note">La luz UV puede reportarse como PASS/FAIL. Un FAIL se registra como rechazo y no entra al inventario vendible.</div>
   </section>
  </section>

  <section className="eggs-card">
   <div className="eggs-section-head"><div><small>HISTORIAL</small><h2>Importaciones de máquina</h2></div></div>
   <div className="eggs-table-wrap"><table><thead><tr><th>Fecha</th><th>Lote</th><th>Equipo</th><th>Origen</th><th>Leídos</th><th>Aceptados</th><th>Rechazos</th><th>Estado</th></tr></thead><tbody>
    {imports.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString('es-SV')}</td><td>{row.egg_batches?.batch_code||'—'}</td><td>{row.egg_machine_devices?.name||'—'}</td><td>{row.source}</td><td>{num(row.rows_received)}</td><td>{num(row.rows_accepted)}</td><td>{num(row.rows_rejected)}</td><td><span className={`eggs-pill ${row.status==='COMPLETED'?'good':row.status==='FAILED'?'danger':'warn'}`}>{row.status}</span></td></tr>)}
    {!imports.length&&<tr><td colSpan="8"><div className="eggs-empty">Todavía no hay importaciones.</div></td></tr>}
   </tbody></table></div>
  </section>
 </div>
}
