import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase.js'

const RATES=[10,12,15]
const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const date=value=>value?new Date(String(value).includes('T')?value:String(value)+'T12:00:00').toLocaleDateString('es-SV',{day:'2-digit',month:'long',year:'numeric'}):'—'
const fullName=x=>[x?.first_names,x?.last_names].filter(Boolean).join(' ')||'—'
const normalized=value=>String(value||'').trim()

function Field({label,children,hint,className=''}){return <label className={'prst-field '+className}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
function Empty({title,children}){return <div className="prst-empty"><strong>{title}</strong>{children&&<p>{children}</p>}</div>}

export default function PrestaditosContractsPanel({company,role,investments,contracts,investorMap,saving,act}){
 const canManage=['owner','admin'].includes(String(role||'').toLowerCase())
 const [selectedInvestmentId,setSelectedInvestmentId]=useState('')
 const [rate,setRate]=useState('')
 const [contractNumber,setContractNumber]=useState('')
 const [signedFile,setSignedFile]=useState(null)
 const [search,setSearch]=useState('')

 useEffect(()=>{
  if(!selectedInvestmentId&&investments[0])setSelectedInvestmentId(investments[0].id)
 },[investments,selectedInvestmentId])

 const selectedInvestment=investments.find(x=>x.id===selectedInvestmentId)||null
 const selectedInvestor=selectedInvestment?investorMap.get(selectedInvestment.investor_id):null
 const selectedContract=contracts.find(x=>x.investment_id===selectedInvestmentId)||null

 useEffect(()=>{
  if(selectedContract){
   setRate(String(Number(selectedContract.return_rate_percent||0)))
   setContractNumber(selectedContract.contract_number||'')
  }else if(selectedInvestment){
   setRate(selectedInvestment.agreed_return_rate?String(Number(selectedInvestment.agreed_return_rate)):'')
   setContractNumber(selectedInvestment.contract_number||'')
  }
 },[selectedInvestmentId,selectedContract?.id])

 const filtered=useMemo(()=>{
  const term=search.trim().toLowerCase()
  return contracts.filter(row=>{
   if(!term)return true
   const investment=investments.find(x=>x.id===row.investment_id)
   const investor=investorMap.get(row.investor_id)
   return (row.contract_code+' '+row.contract_number+' '+fullName(investor)+' '+(investment?.investment_code||'')).toLowerCase().includes(term)
  })
 },[contracts,investments,investorMap,search])

 const prepare=e=>{
  e.preventDefault()
  if(!canManage||!selectedInvestment)return
  const numericRate=Number(rate)
  if(!RATES.includes(numericRate))return
  act(async()=>{
   const {error}=await supabase.rpc('inv_prepare_contract',{
    p_investment_id:selectedInvestment.id,
    p_return_rate:numericRate,
    p_contract_number:normalized(contractNumber),
   })
   if(error)throw error
  },'Contrato preparado con el porcentaje acordado.')
 }

 const printContract=contract=>{
  const investment=investments.find(x=>x.id===contract.investment_id)
  const investor=investorMap.get(contract.investor_id)
  const snapshot=contract.snapshot||{}
  const popup=window.open('','_blank','noopener,noreferrer')
  if(!popup)return
  const html='<!doctype html><html><head><meta charset="utf-8"><title>'+contract.contract_code+'</title><style>body{font-family:Arial,sans-serif;color:#111;padding:38px;line-height:1.45}h1{font-size:22px;margin:0 0 4px}.meta{color:#555;font-size:12px;margin-bottom:24px}.box{border:1px solid #bbb;border-radius:8px;padding:16px;margin:14px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid div{padding:8px;border-bottom:1px solid #ddd}strong{display:block;font-size:12px}.value{font-size:14px}.warning{margin:18px 0;padding:12px;background:#fff7e8;border:1px solid #e8c986;font-size:12px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:70px}.line{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:12px}@media print{button{display:none}body{padding:22px}}</style></head><body>'+
   '<h1>PRESTADITO$ EL SALVADOR</h1><div class="meta">Documento operativo de inversión · '+contract.contract_code+(contract.contract_number?' · Contrato '+contract.contract_number:'')+'</div>'+
   '<div class="box"><div class="grid">'+
   '<div><strong>Inversionista</strong><span class="value">'+fullName(investor)+'</span></div>'+
   '<div><strong>DUI</strong><span class="value">'+(investor?.dui||snapshot.dui||'—')+'</span></div>'+
   '<div><strong>Inversión</strong><span class="value">'+(investment?.investment_code||snapshot.investment_code||'—')+'</span></div>'+
   '<div><strong>Capital</strong><span class="value">'+money(investment?.principal||snapshot.principal)+'</span></div>'+
   '<div><strong>Plazo</strong><span class="value">'+(investment?.term_months||snapshot.term_months||'—')+' meses</span></div>'+
   '<div><strong>Vencimiento</strong><span class="value">'+date(investment?.maturity_date||snapshot.maturity_date)+'</span></div>'+
   '<div><strong>Porcentaje acordado</strong><span class="value">'+Number(contract.return_rate_percent)+'%</span></div>'+
   '<div><strong>Base / periodicidad</strong><span class="value">Pendiente de definición formal</span></div>'+
   '</div></div>'+
   '<div class="warning"><strong>Importante:</strong> Este documento no presume si el 10%, 12% o 15% corresponde a una periodicidad específica, interés simple, compuesto, mensual, anual o al plazo total. Esas condiciones deben completarse cuando Prestadito$ defina oficialmente la regla de rendimiento.</div>'+
   '<p>Las demás condiciones y obligaciones aplicables deben corresponder al contrato aprobado por la empresa. Esta impresión funciona como borrador operativo y ficha de formalización dentro del ERP.</p>'+
   '<div class="sign"><div class="line">Firma del inversionista</div><div class="line">Representante autorizado</div></div>'+
   '<button onclick="window.print()">Imprimir / guardar PDF</button></body></html>'
  popup.document.write(html)
  popup.document.close()
 }

 const uploadSigned=()=>{
  if(!selectedContract||!selectedInvestment||!signedFile||!canManage)return
  act(async()=>{
   if(signedFile.size>10*1024*1024)throw new Error('El archivo supera el límite de 10 MB.')
   const ext=(signedFile.name.split('.').pop()||'pdf').toLowerCase().replace(/[^a-z0-9]/g,'')||'pdf'
   const path=company.id+'/'+selectedInvestment.investor_id+'/contracts/'+Date.now()+'-'+selectedContract.contract_code+'.'+ext
   const {error:uploadError}=await supabase.storage.from('investor-documents').upload(path,signedFile,{upsert:false,contentType:signedFile.type||undefined})
   if(uploadError)throw uploadError
   const {data:doc,error:docError}=await supabase.rpc('inv_record_document',{
    p_company_id:company.id,
    p_investor_id:selectedInvestment.investor_id,
    p_application_id:selectedInvestment.application_id||null,
    p_investment_id:selectedInvestment.id,
    p_document_type:'CONTRACT',
    p_title:'Contrato firmado '+selectedContract.contract_code,
    p_storage_path:path,
    p_mime_type:signedFile.type||'application/pdf',
    p_file_size:signedFile.size||null,
    p_document_date:new Date().toISOString().slice(0,10),
    p_notes:'Contrato firmado cargado desde el módulo Contratos.',
   })
   if(docError){
    await supabase.storage.from('investor-documents').remove([path]).catch(()=>null)
    throw docError
   }
   const {error:signError}=await supabase.rpc('inv_mark_contract_signed',{
    p_contract_id:selectedContract.id,
    p_document_id:doc.id,
    p_signature_method:'SIGNED_DOCUMENT_UPLOAD',
   })
   if(signError)throw signError
   setSignedFile(null)
  },'Contrato firmado registrado y archivado.')
 }

 return <section className="prst-contracts-module">
  <section className="prst-investor-summary prst-contracts-summary">
   <article><span>Contratos preparados</span><strong>{contracts.length}</strong><small>documentos operativos</small></article>
   <article><span>Firmados</span><strong>{contracts.filter(x=>x.status==='SIGNED').length}</strong><small>con documento archivado</small></article>
   <article><span>Pendientes de firma</span><strong>{contracts.filter(x=>x.status==='GENERATED').length}</strong><small>requieren seguimiento</small></article>
   <article><span>Porcentajes disponibles</span><strong>10 · 12 · 15%</strong><small>sin periodicidad asumida</small></article>
  </section>

  <section className="prst-grid form-list">
   <form className="prst-card prst-form" onSubmit={prepare}>
    <div className="prst-card-head"><div><small>PREPARAR CONTRATO</small><h2>Datos de formalización</h2><p>Selecciona la inversión y el porcentaje informado.</p></div></div>
    {!canManage&&<div className="prst-note">Solo propietario o administrador puede preparar o registrar contratos firmados.</div>}
    <Field label="Inversión *"><select value={selectedInvestmentId} onChange={e=>setSelectedInvestmentId(e.target.value)} disabled={!canManage}><option value="">Seleccionar</option>{investments.map(x=><option key={x.id} value={x.id}>{x.investment_code} · {fullName(investorMap.get(x.investor_id))} · {money(x.principal)}</option>)}</select></Field>
    <div className="prst-form-grid">
     <Field label="Porcentaje acordado *"><select value={rate} onChange={e=>setRate(e.target.value)} required disabled={!canManage}><option value="">Seleccionar</option>{RATES.map(x=><option key={x} value={x}>{x}%</option>)}</select></Field>
     <Field label="Número de contrato"><input value={contractNumber} onChange={e=>setContractNumber(e.target.value)} disabled={!canManage}/></Field>
    </div>
    <div className="prst-note"><strong>Sin suposiciones:</strong> 10%, 12% y 15% quedan registrados como porcentajes posibles, pero todavía no se define a qué plazo o periodicidad corresponde cada uno.</div>
    <button className="prst-primary" disabled={saving||!canManage||!selectedInvestment||!rate}>{saving?'Preparando…':selectedContract?'Actualizar contrato':'Preparar contrato'}</button>

    {selectedContract&&<div className="prst-contract-actions">
     <button type="button" onClick={()=>printContract(selectedContract)}>Imprimir / guardar PDF</button>
     <Field label="Contrato firmado" hint="PDF o imagen, máximo 10 MB."><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setSignedFile(e.target.files?.[0]||null)} disabled={!canManage||selectedContract.status==='SIGNED'}/></Field>
     <button type="button" className="primary" onClick={uploadSigned} disabled={saving||!signedFile||selectedContract.status==='SIGNED'}>{selectedContract.status==='SIGNED'?'Firma registrada':'Registrar contrato firmado'}</button>
    </div>}
   </form>

   <article className="prst-card">
    <div className="prst-card-head"><div><small>CONTRATOS</small><h2>Control contractual</h2><p>Seguimiento de borradores operativos y documentos firmados.</p></div></div>
    <input className="prst-search" placeholder="Buscar contrato, inversión o inversionista" value={search} onChange={e=>setSearch(e.target.value)}/>
    {!filtered.length?<Empty title="Sin contratos preparados"/>:<div className="prst-table-wrap"><table className="prst-contract-table"><thead><tr><th>Contrato</th><th>Inversionista</th><th>Inversión</th><th>Capital</th><th>Porcentaje</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map(row=>{
      const investment=investments.find(x=>x.id===row.investment_id)
      const investor=investorMap.get(row.investor_id)
      return <tr key={row.id}><td><b>{row.contract_code}</b><small>{row.contract_number||'Sin número externo'}</small></td><td>{fullName(investor)}</td><td>{investment?.investment_code||'—'}</td><td>{money(investment?.principal)}</td><td><b>{Number(row.return_rate_percent)}%</b><small>Base pendiente</small></td><td><span className={'prst-status '+(row.status==='SIGNED'?'active':'review')}>{row.status==='SIGNED'?'Firmado':'Preparado'}</span></td><td><button type="button" onClick={()=>{setSelectedInvestmentId(row.investment_id);printContract(row)}}>Ver / imprimir</button></td></tr>
     })}</tbody></table></div>}
   </article>
  </section>
 </section>
}
