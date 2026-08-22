import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { ProductsModule, QuotesModule, WorkOrdersModule } from './CommercialFlow.jsx'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true } }) : null

export default function CommercialLauncher() {
  const [session,setSession]=useState(null), [company,setCompany]=useState(null), [open,setOpen]=useState(false), [tab,setTab]=useState('Productos y trabajos')
  useEffect(()=>{ if(!supabase)return; supabase.auth.getSession().then(({data})=>setSession(data.session||null)); const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>l.subscription.unsubscribe() },[])
  useEffect(()=>{ if(!session||!supabase){setCompany(null);return} supabase.rpc('get_my_companies').then(async({data})=>{const id=data?.[0]?.id;if(!id)return;const {data:row}=await supabase.from('companies').select('*').eq('id',id).single();setCompany(row||null)}) },[session])
  if(!session||!company)return null
  return <>
    <button type="button" onClick={()=>setOpen(true)} style={styles.launcher}>COMERCIAL</button>
    {open&&<div style={styles.backdrop} onMouseDown={()=>setOpen(false)}><section style={styles.panel} onMouseDown={e=>e.stopPropagation()}>
      <header style={styles.header}><div><strong>Gestión comercial y producción</strong><small> · Productos terminados → Cotización → Orden de trabajo</small></div><button style={styles.close} onClick={()=>setOpen(false)}>×</button></header>
      <nav style={styles.tabs}>{['Productos y trabajos','Cotizaciones','Órdenes de trabajo'].map(x=><button key={x} onClick={()=>setTab(x)} style={{...styles.tab,...(tab===x?styles.active:{})}}>{x}</button>)}</nav>
      {tab==='Productos y trabajos'?<ProductsModule company={company} supabase={supabase}/>:tab==='Cotizaciones'?<QuotesModule company={company} supabase={supabase}/>:<WorkOrdersModule company={company} supabase={supabase}/>} 
    </section></div>}
  </>
}

const styles={launcher:{position:'fixed',right:145,bottom:24,zIndex:70,border:0,borderRadius:16,padding:'15px 19px',background:'#b45309',color:'#fff',fontWeight:900,cursor:'pointer',boxShadow:'0 14px 35px rgba(15,23,42,.25)'},backdrop:{position:'fixed',inset:0,zIndex:90,background:'rgba(15,23,42,.55)',padding:24,overflow:'auto'},panel:{width:'min(1240px,100%)',minHeight:'calc(100vh - 48px)',margin:'0 auto',background:'#f8fafc',borderRadius:22,padding:24,boxSizing:'border-box'},header:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,color:'#334155'},close:{border:0,background:'transparent',fontSize:34,cursor:'pointer'},tabs:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:18},tab:{border:'1px solid #cbd5e1',background:'#fff',padding:'10px 14px',borderRadius:10,fontWeight:800,cursor:'pointer'},active:{background:'#111827',color:'#fff',borderColor:'#111827'}}
