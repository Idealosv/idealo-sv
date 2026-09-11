import {useEffect,useRef,useState} from 'react'
import IdealoBarOperationsV2 from './IdealoBarOperationsV2.jsx'
import './idealo-bar-live-operations.css'

const LIVE_TABLES=['bar_orders','bar_order_items','bar_tables','bar_payments','bar_reservations','bar_print_jobs','cash_register_sessions']

export default function IdealoBarLiveOperations(props){
 const {company,supabase}=props
 const [revision,setRevision]=useState(0)
 const [live,setLive]=useState('connecting')
 const timerRef=useRef(null)

 useEffect(()=>{
  if(!company?.id||!supabase)return
  let active=true
  const bump=()=>{
   if(!active)return
   clearTimeout(timerRef.current)
   timerRef.current=setTimeout(()=>setRevision(value=>value+1),420)
  }
  const channel=supabase.channel(`idealo-bar-live-${company.id}-${Math.random().toString(36).slice(2)}`)
  LIVE_TABLES.forEach(table=>channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`company_id=eq.${company.id}`},bump))
  channel.subscribe(status=>{
   if(!active)return
   if(status==='SUBSCRIBED')setLive('online')
   else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setLive('fallback')
  })
  const poll=setInterval(()=>{if(active&&!document.hidden)setRevision(value=>value+1)},30000)
  const visibility=()=>{if(!document.hidden)bump()}
  window.addEventListener('focus',visibility)
  document.addEventListener('visibilitychange',visibility)
  return()=>{
   active=false
   clearTimeout(timerRef.current)
   clearInterval(poll)
   window.removeEventListener('focus',visibility)
   document.removeEventListener('visibilitychange',visibility)
   supabase.removeChannel(channel)
  }
 },[company?.id,supabase])

 return <div className="bar-live-operations">
  <div className={`bar-live-indicator ${live}`} title={live==='online'?'Sincronización en tiempo real activa':'Sincronización de respaldo activa'}><i></i>{live==='online'?'EN VIVO':live==='fallback'?'SINCRONIZANDO':'CONECTANDO'}</div>
  <IdealoBarOperationsV2 key={`${company?.id||'bar'}-${revision}`} {...props}/>
 </div>
}
