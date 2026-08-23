import {useEffect,useMemo,useState} from 'react'

const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}

export default function ProcurementControlCenter({company,supabase,onOpen}){
  const [suppliers,setSuppliers]=useState([]),[purchases,setPurchases]=useState([]),[payables,setPayables]=useState([]),[message,setMessage]=useState('')
  useEffect(()=>{let live=true;(async()=>{const [s,p,a]=await Promise.all([
    supabase.from('suppliers').select('id,name,active,phone,email').eq('company_id',company.id),
    supabase.from('purchases').select('id,number,total,purchase_date,due_date,payment_status,procurement_status,source_type,received_at,supplier_id,suppliers(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(200),
    supabase.from('accounts_payable').select('id,amount_total,amount_paid,due_date,status,supplier_id,suppliers(name)').eq('company_id',company.id).order('created_at',{ascending:false}).limit(200),
  ]);if(!live)return;const err=s.error||p.error||a.error;if(err)setMessage(err.message);else{setSuppliers(s.data||[]);setPurchases(p.data||[]);setPayables(a.data||[])}})();return()=>{live=false}},[company.id,supabase])
  const data=useMemo(()=>{const now=today(),week=addDays(7);const openPayables=payables.filter(x=>!['PAID','CANCELLED'].includes(x.status));const overdue=openPayables.filter(x=>x.due_date&&x.due_date<now);const dueSoon=openPayables.filter(x=>x.due_date&&x.due_date>=now&&x.due_date<=week);const ordered=purchases.filter(x=>['ORDERED','PARTIAL_RECEIVED'].includes(x.procurement_status));const staleOrders=ordered.filter(x=>x.purchase_date&&x.purchase_date<addDays(-7));const drafts=purchases.filter(x=>x.procurement_status==='DRAFT');const withoutSupplier=purchases.filter(x=>!x.supplier_id);const inactive=suppliers.filter(x=>x.active===false);const noContact=suppliers.filter(x=>x.active!==false&&!x.phone&&!x.email);const balance=list=>list.reduce((s,x)=>s+Math.max(0,Number(x.amount_total||0)-Number(x.amount_paid||0)),0);return{openPayables,overdue,dueSoon,ordered,staleOrders,drafts,withoutSupplier,inactive,noContact,pending:balance(openPayables),overdueValue:balance(overdue),soonValue:balance(dueSoon)}},[suppliers,purchases,payables])
  const cards=[['CxP vencidas',data.overdue.length,money(data.overdueValue),'Cuentas por pagar'],['Vencen en 7 días',data.dueSoon.length,money(data.soonValue),'Cuentas por pagar'],['Órdenes sin recibir +7d',data.staleOrders.length,`${data.ordered.length} en recepción`,'Recepción'],['Compras en borrador',data.drafts.length,'Pendientes de ordenar','Recepción'],['Compras sin proveedor',data.withoutSupplier.length,'Revisar trazabilidad','Compras y gastos'],['Proveedores sin contacto',data.noContact.length,`${data.inactive.length} inactivos`,'Proveedores']]
  return <section className="procurement-control"><div className="clients-titlebar"><div><p className="form-kicker">CONTROL DE ABASTECIMIENTO</p><h2>Compras y proveedores</h2><p>Prioriza pagos, recepciones y compras que requieren acción antes de que afecten caja o producción.</p></div><span className={data.overdue.length||data.staleOrders.length?'status dte-pending':'status dte-ready'}>{data.overdue.length+data.staleOrders.length} críticas</span></div>
    <div className="procurement-control-summary"><article><small>Saldo por pagar</small><strong>{money(data.pending)}</strong></article><article><small>Órdenes en recepción</small><strong>{data.ordered.length}</strong></article><article><small>Proveedores activos</small><strong>{suppliers.filter(x=>x.active!==false).length}</strong></article></div>
    {message&&<p className="feedback error">{message}</p>}
    <div className="procurement-control-grid">{cards.map(([label,count,detail,tab])=><button type="button" key={label} className={count?'procurement-risk active':'procurement-risk'} onClick={()=>onOpen(tab)}><span>{label}</span><strong>{count}</strong><small>{detail}</small></button>)}</div>
  </section>
}
