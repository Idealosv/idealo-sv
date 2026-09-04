import {useCallback,useEffect,useMemo,useState} from 'react'

const LABELS={
  TEST_REAL_RECEIVABLE:'TEST 00 → CxC real',
  TEST_REAL_CASH:'TEST 00 → Caja/Banco real',
  CREDIT_WITHOUT_RECEIVABLE:'Crédito → cuenta por cobrar',
  CASH_WITHOUT_COLLECTION:'Contado → cobro real',
  RECEIVABLE_BALANCE_MISMATCH:'Abonos → saldo CxC',
  ADVANCE_OVERAPPLIED:'Anticipos → aplicación',
  INVALIDATED_WITH_LIVE_FINANCE:'Anulación → reversión financiera',
  REISSUE_WITHOUT_SOURCE:'Reemisión → documento origen',
  PRODUCTION_PROCESSED:'DTE producción aceptados',
}

export default function DteFinancialIntegrityPanel({company,supabase}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[message,setMessage]=useState('')
  const load=useCallback(async()=>{
    setLoading(true);setMessage('')
    const {data,error}=await supabase.rpc('audit_dte_financial_integrity',{p_company:company.id})
    if(error){setMessage(error.message);setRows([])}else setRows(data||[])
    setLoading(false)
  },[company.id,supabase])
  useEffect(()=>{load()},[load])
  const problems=useMemo(()=>rows.filter(r=>r.severity==='ERROR'&&Number(r.affected)>0),[rows])
  const warnings=useMemo(()=>rows.filter(r=>r.severity==='WARN'&&Number(r.affected)>0),[rows])
  return <section className="panel dte-financial-audit">
    <div className="panel-heading"><div><p className="form-kicker">AUDITORÍA DTE ↔ FINANZAS</p><h3>Integridad financiera</h3><p>Valida contado, crédito, anticipos, abonos, anulaciones y reemisiones sin mezclar TEST 00 con saldos reales.</p></div><button type="button" onClick={load} disabled={loading}>{loading?'Revisando…':'Revisar ahora'}</button></div>
    {message&&<p className="feedback error">{message}</p>}
    {!message&&!loading&&<div className={problems.length?'dte-note':'feedback success'}><strong>{problems.length?'Requiere corrección':'Auditoría limpia'}</strong>{problems.length?` · ${problems.reduce((s,r)=>s+Number(r.affected||0),0)} inconsistencia(s) financiera(s).`:warnings.length?` · Sin errores. ${warnings.length} advertencia(s) para revisar.`:' · Sin inconsistencias detectadas.'}</div>}
    <div className="client-list">{rows.filter(r=>r.code!=='PRODUCTION_PROCESSED').map(r=>{const n=Number(r.affected||0),ok=n===0;return <div className="client-row" key={r.code}><div><strong>{LABELS[r.code]||r.code}</strong><small>{r.detail}</small></div><div><strong>{ok?'OK':n}</strong><small>{ok?'Sin hallazgos':r.severity==='WARN'?'REVISAR':'ERROR'}</small></div></div>})}</div>
    <div className="dte-note"><strong>Producción:</strong> {rows.find(r=>r.code==='PRODUCTION_PROCESSED')?.affected||0} DTE aceptado(s) incluido(s) actualmente en Finanzas. Los documentos TEST 00 permanecen fuera de Caja, Banco y CxC reales.</div>
  </section>
}
