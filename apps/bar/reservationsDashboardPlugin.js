export default function standaloneBarReservationsDashboard(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  return{
    name:'idealo-bar-standalone-reservations-dashboard',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null
      let next=code

      const stateFrom=" const [reservationForm,setReservationForm]=useState({name:'',phone:'',partySize:'2',reservedFor:'',tableId:'',notes:''})\n const [seatTables,setSeatTables]=useState({})"
      const stateTo=" const [reservationForm,setReservationForm]=useState({name:'',phone:'',partySize:'2',reservedFor:'',duration:'120',tableId:'',notes:''})\n const [reservationFilter,setReservationFilter]=useState('Hoy')\n const [reservationSearch,setReservationSearch]=useState('')\n const [reservationDate,setReservationDate]=useState(todayKey())\n const [seatTables,setSeatTables]=useState({})"
      if(!next.includes(stateFrom))throw new Error('[IDEALO BAR] No se encontró el estado base de Reservas')
      next=next.replace(stateFrom,stateTo)

      const computeFrom=" const todayReservations=reservations.filter(r=>localDay(r.reserved_for)===todayKey()&&['pending','confirmed'].includes(r.status))"
      const computeTo=`${computeFrom}
 const reservationStatusLabel={pending:'Pendiente',confirmed:'Confirmada',seated:'Sentada',completed:'Completada',cancelled:'Cancelada',no_show:'No llegó'}
 const reservationActiveStatuses=['pending','confirmed']
 const reservationNow=Date.now()
 const reservationUpcoming=reservations.filter(r=>reservationActiveStatuses.includes(r.status)&&new Date(r.reserved_for).getTime()>=reservationNow).sort((a,b)=>new Date(a.reserved_for)-new Date(b.reserved_for))
 const reservationPendingCount=reservations.filter(r=>r.status==='pending').length
 const reservationConfirmedCount=reservations.filter(r=>r.status==='confirmed').length
 const reservationDayChoices=Array.from({length:7},(_,index)=>{const date=new Date(Date.now()+index*86400000);const key=localDay(date);return{key,weekday:new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',weekday:'short'}).format(date).replace('.',''),day:new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',day:'2-digit',month:'short'}).format(date),count:reservations.filter(r=>reservationActiveStatuses.includes(r.status)&&localDay(r.reserved_for)===key).length}})
 const reservationNeedle=reservationSearch.trim().toLowerCase()
 const filteredReservations=reservations.filter(row=>{
  const status=row.status||'pending'
  const rowTime=new Date(row.reserved_for).getTime()
  let matches=true
  if(reservationFilter==='Hoy')matches=localDay(row.reserved_for)===todayKey()
  else if(reservationFilter==='Próximas')matches=reservationActiveStatuses.includes(status)&&rowTime>=reservationNow
  else if(reservationFilter==='Pendientes')matches=status==='pending'
  else if(reservationFilter==='Confirmadas')matches=status==='confirmed'
  else if(reservationFilter==='Sentadas')matches=status==='seated'
  else if(reservationFilter==='Historial')matches=['completed','cancelled','no_show'].includes(status)
  else if(reservationFilter==='Fecha')matches=localDay(row.reserved_for)===reservationDate
  if(!matches)return false
  if(reservationNeedle){const table=tableById.get(row.table_id);const haystack=[row.customer_name,row.customer_phone,table?.name,row.notes,reservationStatusLabel[status]].filter(Boolean).join(' ').toLowerCase();if(!haystack.includes(reservationNeedle))return false}
  return true
 }).sort((a,b)=>reservationFilter==='Historial'?new Date(b.reserved_for)-new Date(a.reserved_for):new Date(a.reserved_for)-new Date(b.reserved_for))`
      if(!next.includes(computeFrom))throw new Error('[IDEALO BAR] No se encontró el cálculo base de Reservas')
      next=next.replace(computeFrom,computeTo)

      const functionsPattern=/ const createReservation=.*?\n const updateReservation=.*?\n const seatReservation=.*?\n/
      if(!functionsPattern.test(next))throw new Error('[IDEALO BAR] No se encontraron las funciones de Reservas')
      const functionsTo=` const ensureReservationSlot=async({tableId,reservedFor,durationMinutes,excludeId=''})=>{
  if(!tableId)return
  const start=new Date(reservedFor).getTime();const end=start+Number(durationMinutes||120)*60000
  let query=supabase.from('bar_reservations').select('id,customer_name,reserved_for,duration_minutes,status').eq('company_id',companyId).eq('table_id',tableId).in('status',['pending','confirmed']).gte('reserved_for',new Date(start-12*60*60000).toISOString()).lte('reserved_for',new Date(end).toISOString())
  if(excludeId)query=query.neq('id',excludeId)
  const {data,error:e}=await query;if(e)throw e
  const conflict=(data||[]).find(existing=>{const existingStart=new Date(existing.reserved_for).getTime();const existingEnd=existingStart+Number(existing.duration_minutes||120)*60000;return existingStart<end&&existingEnd>start})
  if(conflict){const table=tableById.get(tableId);throw new Error(\`${'${table?.name||\'La mesa\'}'} ya está reservada para ${'${conflict.customer_name||\'otro cliente\'}'} a las ${'${localTime(conflict.reserved_for)}'}. Elegí otra hora o mesa.\`)}
 }
 const createReservation=()=>run(async()=>{
  if(!can('reservation.manage'))throw new Error('Tu rol no puede crear reservas.')
  const name=reservationForm.name.trim();const partySize=Number(reservationForm.partySize||0);const durationMinutes=Number(reservationForm.duration||120);const reservedAt=new Date(reservationForm.reservedFor)
  if(!name||!reservationForm.reservedFor)throw new Error('Nombre y fecha/hora son obligatorios.')
  if(!(partySize>=1&&partySize<=100))throw new Error('La cantidad de personas debe estar entre 1 y 100.')
  if(!(durationMinutes>=15&&durationMinutes<=720))throw new Error('La duración debe estar entre 15 minutos y 12 horas.')
  if(Number.isNaN(reservedAt.getTime())||reservedAt.getTime()<Date.now()-60000)throw new Error('La reserva debe ser para una fecha y hora futura.')
  await ensureReservationSlot({tableId:reservationForm.tableId,reservedFor:reservedAt,durationMinutes})
  const {error:e}=await supabase.from('bar_reservations').insert({company_id:companyId,table_id:reservationForm.tableId||null,customer_name:name,customer_phone:reservationForm.phone.trim()||null,party_size:partySize,reserved_for:reservedAt.toISOString(),duration_minutes:durationMinutes,status:'pending',notes:reservationForm.notes.trim()||null});if(e)throw e
  setReservationForm({name:'',phone:'',partySize:'2',reservedFor:'',duration:'120',tableId:'',notes:''});setReservationFilter('Próximas');await load()
 },'Reserva guardada como pendiente.')
 const updateReservation=(row,status)=>run(async()=>{
  if(!can('reservation.manage'))throw new Error('Tu rol no puede modificar reservas.')
  const tableId=seatTables[row.id]||row.table_id||null
  if(['pending','confirmed'].includes(status)&&tableId)await ensureReservationSlot({tableId,reservedFor:row.reserved_for,durationMinutes:row.duration_minutes,excludeId:row.id})
  const {error:e}=await supabase.from('bar_reservations').update({status,table_id:tableId}).eq('id',row.id).eq('company_id',companyId);if(e)throw e
  setSeatTables(current=>{const copy={...current};delete copy[row.id];return copy});await load()
 },status==='confirmed'?'Reserva confirmada.':status==='cancelled'?'Reserva cancelada.':status==='no_show'?'Reserva marcada como no llegó.':'Reserva actualizada.')
 const seatReservation=row=>run(async()=>{
  if(!can('reservation.manage'))throw new Error('Tu rol no puede sentar reservas.')
  const tableId=seatTables[row.id]||row.table_id;if(!tableId)throw new Error('Seleccioná una mesa para la reserva.')
  await ensureReservationSlot({tableId,reservedFor:row.reserved_for,durationMinutes:row.duration_minutes,excludeId:row.id})
  const {data,error:e}=await supabase.rpc('bar_seat_reservation',{p_reservation_id:row.id,p_table_id:tableId});if(e)throw e
  await load();setSelectedOrderId(data);setTab('Salón y ventas')
 },'Reserva sentada y pedido abierto.')
`
      next=next.replace(functionsPattern,functionsTo)

      const reservationPattern=/  \{tab==='Reservas'&&<div className="barops-res-layout">[\s\S]*?\n\n  \{tab==='Delivery'&&/
      if(!reservationPattern.test(next))throw new Error('[IDEALO BAR] No se encontró el bloque visual de Reservas')
      const reservationBlock=`  {tab==='Reservas'&&<section className="barops-reservations-dashboard">
   <header className="barops-res-head"><div><small>Agenda del salón</small><h3>Reservas</h3><p>Organizá llegadas, confirmaciones, mesas y clientes desde un solo lugar.</p></div><div className="barops-res-visible"><b>{filteredReservations.length}</b><span>visibles</span></div></header>
   <div className="barops-res-kpis">
    <button className={reservationFilter==='Hoy'?'active':''} onClick={()=>{setReservationFilter('Hoy');setReservationDate(todayKey())}}><span>Hoy</span><b>{todayReservations.length}</b><small>Reservas activas</small></button>
    <button className={reservationFilter==='Próximas'?'active':''} onClick={()=>setReservationFilter('Próximas')}><span>Próximas</span><b>{reservationUpcoming.length}</b><small>Por llegar</small></button>
    <button className={reservationFilter==='Pendientes'?'active attention':''} onClick={()=>setReservationFilter('Pendientes')}><span>Pendientes</span><b>{reservationPendingCount}</b><small>Por confirmar</small></button>
    <button className={reservationFilter==='Confirmadas'?'active':''} onClick={()=>setReservationFilter('Confirmadas')}><span>Confirmadas</span><b>{reservationConfirmedCount}</b><small>Listas para recibir</small></button>
   </div>
   <div className="barops-res-days">{reservationDayChoices.map(day=><button key={day.key} className={reservationFilter==='Fecha'&&reservationDate===day.key?'active':''} onClick={()=>{setReservationDate(day.key);setReservationFilter('Fecha')}}><span>{day.weekday}</span><b>{day.day}</b><small>{day.count} reserva{day.count===1?'':'s'}</small></button>)}</div>
   <div className="barops-res-controls"><div className="barops-res-filter-chips">{['Hoy','Próximas','Pendientes','Confirmadas','Sentadas','Historial','Todas'].map(value=><button key={value} className={reservationFilter===value?'active':''} onClick={()=>setReservationFilter(value)}>{value}</button>)}</div><div className="barops-res-search-row"><input value={reservationSearch} onChange={e=>setReservationSearch(e.target.value)} placeholder="Buscar cliente, teléfono, mesa o nota…"/><label><span>Ver fecha</span><input type="date" value={reservationDate} onChange={e=>{setReservationDate(e.target.value);setReservationFilter('Fecha')}}/></label>{(reservationSearch||reservationFilter==='Fecha')&&<button onClick={()=>{setReservationSearch('');setReservationFilter('Hoy');setReservationDate(todayKey())}}>Limpiar</button>}</div></div>
   <div className={`barops-res-workspace ${can('reservation.manage')?'with-form':'read-only'}`}>
    {can('reservation.manage')&&<aside className="barops-res-create"><div className="barops-res-card-head"><div><span className="barops-res-icon">＋</span><div><strong>Nueva reserva</strong><small>Registro rápido y control de conflictos</small></div></div></div><div className="barops-res-form-pro"><label>Cliente<input value={reservationForm.name} onChange={e=>setReservationForm(v=>({...v,name:e.target.value}))} placeholder="Nombre del cliente"/></label><label>Teléfono<input value={reservationForm.phone} onChange={e=>setReservationForm(v=>({...v,phone:e.target.value}))} placeholder="Ej. 7000-0000"/></label><div className="barops-res-form-split"><label>Personas<input type="number" min="1" max="100" value={reservationForm.partySize} onChange={e=>setReservationForm(v=>({...v,partySize:e.target.value}))}/></label><label>Duración<select value={reservationForm.duration} onChange={e=>setReservationForm(v=>({...v,duration:e.target.value}))}><option value="60">1 hora</option><option value="90">1 h 30 min</option><option value="120">2 horas</option><option value="180">3 horas</option><option value="240">4 horas</option></select></label></div><label>Fecha y hora<input type="datetime-local" value={reservationForm.reservedFor} onChange={e=>setReservationForm(v=>({...v,reservedFor:e.target.value}))}/></label><label>Mesa<select value={reservationForm.tableId} onChange={e=>setReservationForm(v=>({...v,tableId:e.target.value}))}><option value="">Asignar al llegar</option>{tables.filter(t=>t.status!=='inactive').map(t=><option key={t.id} value={t.id}>{t.name} · {t.area}{t.capacity?` · ${t.capacity} pers.`:''}</option>)}</select></label><label>Notas<textarea rows="3" value={reservationForm.notes} onChange={e=>setReservationForm(v=>({...v,notes:e.target.value}))} placeholder="Cumpleaños, ubicación preferida, decoración, observaciones…"/></label><div className="barops-res-conflict-note"><span>!</span><p>Si asignás mesa, el sistema valida que no exista otra reserva superpuesta.</p></div><button className="barops-res-save" disabled={working} onClick={createReservation}>{working?'Guardando…':'Guardar reserva'}</button></div></aside>}
    <main className="barops-res-agenda"><div className="barops-res-agenda-head"><div><strong>Agenda</strong><small>{reservationFilter==='Fecha'?`Reservas del ${reservationDate}`:`Vista: ${reservationFilter}`}</small></div><span>{filteredReservations.length}</span></div><div className="barops-res-grid-pro">{filteredReservations.slice(0,120).map(row=>{const table=tableById.get(row.table_id);const minutes=Math.round((new Date(row.reserved_for).getTime()-Date.now())/60000);const active=reservationActiveStatuses.includes(row.status);const urgent=active&&minutes<=60&&minutes>=-120;const timing=!active?'':minutes<0?`Hace ${Math.abs(minutes)} min`:minutes===0?'Ahora':minutes<120?`En ${minutes} min`:localTime(row.reserved_for);const selectedTable=seatTables[row.id]||row.table_id||'';return <article className={`barops-res-card-pro status-${row.status} ${urgent?'urgent':''}`} key={row.id}><header><div><span className="barops-res-avatar">{String(row.customer_name||'?').trim().slice(0,1).toUpperCase()}</span><div><strong>{row.customer_name}</strong><small>{row.party_size} persona{Number(row.party_size)===1?'':'s'} · {Number(row.duration_minutes||120)/60%1===0?`${Number(row.duration_minutes||120)/60} h`:`${row.duration_minutes} min`}</small></div></div><span className={`barops-res-status status-${row.status}`}>{reservationStatusLabel[row.status]||row.status}</span></header><div className="barops-res-time"><div><b>{localTime(row.reserved_for)}</b><span>{new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',weekday:'short',day:'2-digit',month:'short'}).format(new Date(row.reserved_for))}</span></div>{timing&&<em className={urgent?'urgent':''}>{timing}</em>}</div><div className="barops-res-info"><span>▦ {table?.name||'Mesa por asignar'}</span>{row.customer_phone&&<span>☎ {row.customer_phone}</span>}{row.notes&&<p>{row.notes}</p>}</div>{can('reservation.manage')&&reservationActiveStatuses.includes(row.status)&&<div className="barops-res-manage"><select value={selectedTable} onChange={e=>setSeatTables(v=>({...v,[row.id]:e.target.value}))}><option value="">Mesa…</option>{tables.filter(t=>t.status==='available'||t.id===row.table_id).map(t=><option key={t.id} value={t.id}>{t.name}{t.capacity?` · ${t.capacity} pers.`:''}</option>)}</select><div className="barops-res-actions-pro">{row.status==='pending'&&<button className="confirm" disabled={working} onClick={()=>updateReservation(row,'confirmed')}>Confirmar</button>}{selectedTable&&selectedTable!==String(row.table_id||'')&&<button disabled={working} onClick={()=>updateReservation(row,row.status)}>Guardar mesa</button>}<button className="seat" disabled={working||!selectedTable} onClick={()=>seatReservation(row)}>Sentar cliente</button><button disabled={working} onClick={()=>updateReservation(row,'no_show')}>No llegó</button><button className="danger" disabled={working} onClick={()=>updateReservation(row,'cancelled')}>Cancelar</button></div></div>}{row.status==='seated'&&row.seated_order_id&&can('sales.view')&&<button className="barops-res-open-order" onClick={()=>{setSelectedOrderId(row.seated_order_id);setTab('Salón y ventas')}}>Abrir pedido</button>}</article>})}</div>{!filteredReservations.length&&<div className="barops-res-empty"><span>◷</span><strong>No hay reservas en esta vista</strong><p>{reservationSearch?'Probá otra búsqueda o limpiá los filtros.':'La agenda está libre para este período.'}</p>{can('reservation.manage')&&<button onClick={()=>{setReservationFilter('Hoy');setReservationSearch('')}}>Nueva reserva</button>}</div>}</main>
   </div>
  </section>}`
      next=next.replace(reservationPattern,`${reservationBlock}\n\n  {tab==='Delivery'&&`)
      return{code:next,map:null}
    },
  }
}
