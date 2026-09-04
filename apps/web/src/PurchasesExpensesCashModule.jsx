import {useEffect,useMemo,useState} from 'react'

const money=(v)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0))
const today=()=>new Date().toISOString().slice(0,10)

export default function PurchasesExpensesCashModule({company,supabase}){
  const [suppliers,setSuppliers]=useState([])
  const [purchases,setPurchases]=useState([])
  const [expenses,setExpenses]=useState([])
  const [cashAccounts,setCashAccounts]=useState([])
  const [message,setMessage]=useState('')
  const [purchase,setPurchase]=useState({supplier_id:'',purchase_date:today(),document_type:'INVOICE',document_number:'',concept:'',subtotal:'',tax:'',total:'',payment_status:'PENDING',due_date:'',notes:'',cash_account_id:''})
  const [expense,setExpense]=useState({supplier_id:'',expense_date:today(),category:'OPERATING',concept:'',amount:'',payment_method:'CASH',reference:'',notes:'',cash_account_id:''})

  const load=async()=>{
    const [s,p,e,a]=await Promise.all([
      supabase.from('suppliers').select('id,name,active').eq('company_id',company.id).eq('active',true).order('name'),
      supabase.from('purchases').select('*,suppliers(name)').eq('company_id',company.id).order('purchase_date',{ascending:false}).limit(100),
      supabase.from('expenses').select('*,suppliers(name)').eq('company_id',company.id).order('expense_date',{ascending:false}).limit(100),
      supabase.from('cash_account_balances').select('cash_account_id,name,account_type,current_balance,active').eq('company_id',company.id).eq('active',true).order('name')
    ])
    const error=s.error||p.error||e.error||a.error
    if(error){setMessage(error.message);return}
    const accounts=a.data||[]
    const preferred=accounts.find(x=>['CASH','PETTY_CASH'].includes(x.account_type))||accounts[0]
    setSuppliers(s.data||[])
    setPurchases(p.data||[])
    setExpenses(e.data||[])
    setCashAccounts(accounts)
    setPurchase(v=>({...v,cash_account_id:v.cash_account_id||preferred?.cash_account_id||''}))
    setExpense(v=>({...v,cash_account_id:v.cash_account_id||preferred?.cash_account_id||''}))
  }

  useEffect(()=>{load()},[company.id])

  const savePurchase=async(e)=>{
    e.preventDefault()
    setMessage('')
    const subtotal=Number(purchase.subtotal||0)
    const tax=Number(purchase.tax||0)
    const total=Number(purchase.total||subtotal+tax)
    if(total<=0){setMessage('Ingresa un monto de compra mayor que cero.');return}
    if(purchase.payment_status==='PAID'&&!purchase.cash_account_id){setMessage('Selecciona de qué Caja o Banco se pagó la compra.');return}
    const payload={...purchase,company_id:company.id,supplier_id:purchase.supplier_id||null,subtotal,tax,total,due_date:purchase.due_date||null,cash_account_id:purchase.payment_status==='PAID'?purchase.cash_account_id:null}
    const {error}=await supabase.from('purchases').insert(payload)
    if(error){setMessage(error.message);return}
    const account=cashAccounts.find(x=>x.cash_account_id===purchase.cash_account_id)
    setMessage(purchase.payment_status==='PAID'?`Compra registrada y descontada de ${account?.name||'Caja/Banco'}.`:'Compra registrada. Queda pendiente de pago y no descuenta Caja.')
    setPurchase(v=>({supplier_id:'',purchase_date:today(),document_type:'INVOICE',document_number:'',concept:'',subtotal:'',tax:'',total:'',payment_status:'PENDING',due_date:'',notes:'',cash_account_id:v.cash_account_id}))
    await load()
  }

  const saveExpense=async(e)=>{
    e.preventDefault()
    setMessage('')
    const amount=Number(expense.amount||0)
    if(amount<=0){setMessage('Ingresa un monto de gasto mayor que cero.');return}
    if(!expense.cash_account_id){setMessage('Selecciona de qué Caja o Banco sale el dinero.');return}
    const {error}=await supabase.from('expenses').insert({...expense,company_id:company.id,supplier_id:expense.supplier_id||null,amount})
    if(error){setMessage(error.message);return}
    const account=cashAccounts.find(x=>x.cash_account_id===expense.cash_account_id)
    setMessage(`Gasto registrado y descontado de ${account?.name||'Caja/Banco'}.`)
    setExpense(v=>({supplier_id:'',expense_date:today(),category:'OPERATING',concept:'',amount:'',payment_method:'CASH',reference:'',notes:'',cash_account_id:v.cash_account_id}))
    await load()
  }

  const voidPurchase=async(row)=>{
    if(row.voided_at)return
    const reason=window.prompt(`Motivo para anular la compra de ${money(row.total)}:\n${row.concept}`,'Registrada por error')
    if(reason===null)return
    if(!reason.trim()){setMessage('Debes indicar el motivo de la anulación.');return}
    setMessage('')
    const {data,error}=await supabase.rpc('void_purchase',{p_purchase_id:row.id,p_reason:reason.trim()})
    if(error){setMessage(error.message);return}
    const reversed=Number(data?.reversed_amount||0)
    setMessage(reversed>0?`Compra anulada. ${money(reversed)} fue devuelto automáticamente a la Caja/Banco de origen.`:'Compra anulada. No había salida de Caja/Banco que revertir.')
    await load()
  }

  const voidExpense=async(row)=>{
    if(row.status==='VOIDED')return
    const reason=window.prompt(`Motivo para anular el gasto de ${money(row.amount)}:\n${row.concept}`,'Registrado por error')
    if(reason===null)return
    if(!reason.trim()){setMessage('Debes indicar el motivo de la anulación.');return}
    setMessage('')
    const {error}=await supabase.from('expenses').update({status:'VOIDED',void_reason:reason.trim(),updated_at:new Date().toISOString()}).eq('id',row.id).eq('company_id',company.id)
    if(error){setMessage(error.message);return}
    setMessage(`Gasto anulado. ${money(row.amount)} fue devuelto automáticamente a la Caja/Banco de origen.`)
    await load()
  }

  const monthKey=today().slice(0,7)
  const monthPurchases=useMemo(()=>purchases.filter(r=>r.purchase_date?.startsWith(monthKey)&&!r.voided_at).reduce((s,r)=>s+Number(r.total||0),0),[purchases])
  const monthExpenses=useMemo(()=>expenses.filter(r=>r.expense_date?.startsWith(monthKey)&&r.status!=='VOIDED').reduce((s,r)=>s+Number(r.amount||0),0),[expenses])
  const supplierOptions=<><option value="">Sin proveedor / ocasional</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</>
  const cashOptions=<><option value="">Seleccionar Caja / Banco</option>{cashAccounts.map(a=><option key={a.cash_account_id} value={a.cash_account_id}>{a.name} · {a.account_type==='BANK'?'Banco':'Caja'} · Saldo {money(a.current_balance)}</option>)}</>

  return <section className="clients-module">
    <div className="clients-titlebar"><div><p className="form-kicker">COSTOS</p><h2>Compras y gastos</h2><p>Todo pago realizado descuenta automáticamente la Caja o Banco seleccionado.</p></div></div>
    <div className="metrics-grid"><article className="metric-card"><span>Compras del mes</span><strong>{money(monthPurchases)}</strong></article><article className="metric-card"><span>Gastos del mes</span><strong>{money(monthExpenses)}</strong></article><article className="metric-card"><span>Compras pendientes</span><strong>{purchases.filter(r=>!r.voided_at&&['PENDING','PARTIAL'].includes(r.payment_status)).length}</strong></article></div>
    {message&&<p className={message.includes('registrad')||message.includes('anulad')?'feedback success':'feedback error'}>{message}</p>}
    <div className="module-grid two-column">
      <form className="panel" onSubmit={savePurchase}>
        <div className="panel-heading"><div><p className="form-kicker">COMPRA</p><h3>Materiales / tercerización</h3></div></div>
        <div className="form-grid">
          <label className="field"><span>Proveedor</span><select value={purchase.supplier_id} onChange={e=>setPurchase({...purchase,supplier_id:e.target.value})}>{supplierOptions}</select></label>
          <label className="field"><span>Fecha</span><input type="date" value={purchase.purchase_date} onChange={e=>setPurchase({...purchase,purchase_date:e.target.value})}/></label>
          <label className="field"><span>Documento</span><select value={purchase.document_type} onChange={e=>setPurchase({...purchase,document_type:e.target.value})}><option value="INVOICE">Factura</option><option value="CCF">CCF</option><option value="TICKET">Ticket</option><option value="RECEIPT">Recibo</option><option value="OTHER">Otro</option></select></label>
          <label className="field"><span>Número</span><input value={purchase.document_number} onChange={e=>setPurchase({...purchase,document_number:e.target.value})}/></label>
          <label className="field form-span-2"><span>Concepto *</span><input required value={purchase.concept} onChange={e=>setPurchase({...purchase,concept:e.target.value})}/></label>
          <label className="field"><span>Subtotal</span><input type="number" min="0" step="0.01" value={purchase.subtotal} onChange={e=>setPurchase({...purchase,subtotal:e.target.value})}/></label>
          <label className="field"><span>IVA / impuesto</span><input type="number" min="0" step="0.01" value={purchase.tax} onChange={e=>setPurchase({...purchase,tax:e.target.value})}/></label>
          <label className="field"><span>Total *</span><input type="number" min="0" step="0.01" required value={purchase.total} onChange={e=>setPurchase({...purchase,total:e.target.value})}/></label>
          <label className="field"><span>Estado pago</span><select value={purchase.payment_status} onChange={e=>setPurchase({...purchase,payment_status:e.target.value})}><option value="PENDING">Pendiente</option><option value="PARTIAL">Parcial</option><option value="PAID">Pagada</option></select></label>
          {purchase.payment_status==='PAID'&&<label className="field form-span-2"><span>Pagar desde *</span><select required value={purchase.cash_account_id} onChange={e=>setPurchase({...purchase,cash_account_id:e.target.value})}>{cashOptions}</select></label>}
          <label className="field"><span>Vence</span><input type="date" value={purchase.due_date} onChange={e=>setPurchase({...purchase,due_date:e.target.value})}/></label>
        </div>
        <div className="form-actions end"><button>Registrar compra</button></div>
      </form>

      <form className="panel" onSubmit={saveExpense}>
        <div className="panel-heading"><div><p className="form-kicker">GASTO</p><h3>Operación del negocio</h3></div></div>
        <div className="form-grid">
          <label className="field"><span>Proveedor</span><select value={expense.supplier_id} onChange={e=>setExpense({...expense,supplier_id:e.target.value})}>{supplierOptions}</select></label>
          <label className="field"><span>Fecha</span><input type="date" value={expense.expense_date} onChange={e=>setExpense({...expense,expense_date:e.target.value})}/></label>
          <label className="field"><span>Categoría</span><select value={expense.category} onChange={e=>setExpense({...expense,category:e.target.value})}><option value="RENT">Alquiler</option><option value="UTILITIES">Servicios básicos</option><option value="PAYROLL">Planilla</option><option value="TRANSPORT">Transporte</option><option value="MAINTENANCE">Mantenimiento</option><option value="MARKETING">Publicidad</option><option value="TAXES">Impuestos</option><option value="OPERATING">Operativo</option><option value="OTHER">Otro</option></select></label>
          <label className="field"><span>Forma pago</span><select value={expense.payment_method} onChange={e=>setExpense({...expense,payment_method:e.target.value})}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
          <label className="field form-span-2"><span>Concepto *</span><input required value={expense.concept} onChange={e=>setExpense({...expense,concept:e.target.value})}/></label>
          <label className="field"><span>Monto *</span><input type="number" min="0.01" step="0.01" required value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})}/></label>
          <label className="field"><span>Referencia</span><input value={expense.reference} onChange={e=>setExpense({...expense,reference:e.target.value})}/></label>
          <label className="field form-span-2"><span>¿De dónde sale el dinero? *</span><select required value={expense.cash_account_id} onChange={e=>setExpense({...expense,cash_account_id:e.target.value})}>{cashOptions}</select></label>
        </div>
        <div className="form-actions end"><button disabled={!cashAccounts.length}>Registrar gasto y descontar</button></div>
      </form>
    </div>

    <div className="module-grid two-column">
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">HISTORIAL</p><h3>Compras recientes</h3></div></div>{purchases.length?<div className="client-list">{purchases.slice(0,20).map(r=><div className="client-row" key={r.id}><div><strong>COM-{String(r.number).padStart(5,'0')} · {r.suppliers?.name||'Proveedor ocasional'}{r.voided_at?' · ANULADA':''}</strong><small>{r.purchase_date} · {r.concept}{r.voided_at&&r.void_reason?` · Motivo: ${r.void_reason}`:''}</small></div><div><strong>{money(r.total)}</strong><small>{r.voided_at?'DEVUELTO / CANCELADO':r.payment_status}</small>{!r.voided_at&&<button type="button" onClick={()=>voidPurchase(r)}>Anular</button>}</div></div>)}</div>:<div className="empty-state"><strong>Sin compras</strong></div>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="form-kicker">HISTORIAL</p><h3>Gastos recientes</h3></div></div>{expenses.length?<div className="client-list">{expenses.slice(0,20).map(r=><div className="client-row" key={r.id}><div><strong>{r.suppliers?.name||'Gasto operativo'}{r.status==='VOIDED'?' · ANULADO':''}</strong><small>{r.expense_date} · {r.concept} · {r.payment_method}{r.status==='VOIDED'&&r.void_reason?` · Motivo: ${r.void_reason}`:''}</small></div><div><strong>{money(r.amount)}</strong><small>{r.status==='VOIDED'?'DEVUELTO A CAJA/BANCO':r.category}</small>{r.status!=='VOIDED'&&<button type="button" onClick={()=>voidExpense(r)}>Anular</button>}</div></div>)}</div>:<div className="empty-state"><strong>Sin gastos</strong></div>}</section>
    </div>
  </section>
}
