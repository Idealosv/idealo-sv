import { useEffect, useMemo, useState } from 'react'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0))
const dt = (value) => value ? new Date(value).toLocaleString('es-SV') : '—'
const newKey = () => crypto.randomUUID()

export function DeliveriesModule({ company, supabase, initialWorkOrderId = '' }) {
  const [orders, setOrders] = useState([])
  const [rows, setRows] = useState([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    work_order_id: '',
    delivery_method: 'PICKUP',
    scheduled_at: '',
    delivery_address: '',
    notes: '',
  })

  const load = async () => {
    const [o, d] = await Promise.all([
      supabase.from('work_orders')
        .select('id,number,title,status,client_id,total,clients(name)')
        .eq('company_id', company.id)
        .in('status', ['READY', 'DELIVERED'])
        .order('created_at', { ascending: false }),
      supabase.from('deliveries')
        .select('*,clients(name),work_orders(number,title,total,status)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false }),
    ])
    if (o.error || d.error) setMessage(o.error?.message || d.error?.message)
    else {
      setOrders(o.data || [])
      setRows(d.data || [])
    }
  }

  useEffect(() => { load() }, [company.id])
  useEffect(() => {
    if (!initialWorkOrderId || !orders.some((order) => order.id === initialWorkOrderId)) return
    const alreadyCreated = rows.some((row) => row.work_order_id === initialWorkOrderId)
    if (!alreadyCreated) setForm((value) => ({ ...value, work_order_id: initialWorkOrderId }))
  }, [initialWorkOrderId, orders, rows])

  const create = async (event) => {
    event.preventDefault()
    const order = orders.find((row) => row.id === form.work_order_id)
    if (!order) return setMessage('Seleccioná una orden lista para entregar.')

    const { error } = await supabase.from('deliveries').insert({
      company_id: company.id,
      work_order_id: order.id,
      client_id: order.client_id,
      delivery_method: form.delivery_method,
      scheduled_at: form.scheduled_at || null,
      delivery_address: form.delivery_address || null,
      notes: form.notes || null,
      status: form.scheduled_at ? 'SCHEDULED' : 'READY',
    })

    if (error) setMessage(error.message)
    else {
      setMessage('Entrega creada.')
      setForm({ work_order_id: '', delivery_method: 'PICKUP', scheduled_at: '', delivery_address: '', notes: '' })
      await load()
    }
  }

  const openBilling = (row) => {
    window.dispatchEvent(new CustomEvent('idealo-open-module', {
      detail: {
        target: 'billing',
        tab: 'emitir',
        workOrderId: row.work_order_id || '',
        workOrderNumber: row.work_orders?.number || '',
        clientId: row.client_id || '',
        clientName: row.clients?.name || '',
      },
    }))
  }

  const delivered = async (row) => {
    const recipient = window.prompt('Nombre de quien recibe:', '')
    if (recipient === null) return

    const { error: deliveryError } = await supabase.from('deliveries').update({
      status: 'DELIVERED',
      delivered_at: new Date().toISOString(),
      recipient_name: recipient || null,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).eq('company_id', company.id)

    let workOrderError = null
    if (!deliveryError && row.work_order_id) {
      const { error } = await supabase.from('work_orders').update({
        status: 'DELIVERED',
        updated_at: new Date().toISOString(),
      }).eq('id', row.work_order_id).eq('company_id', company.id)
      workOrderError = error
    }

    const error = deliveryError || workOrderError
    setMessage(error ? error.message : 'Entrega confirmada. Abriendo Facturación con la OT seleccionada…')
    await load()
    if (!error) window.setTimeout(() => openBilling(row), 350)
  }

  const open = rows.filter((row) => row.status !== 'DELIVERED' && row.status !== 'CANCELLED').length

  return <section className="clients-module">
    <div className="clients-titlebar">
      <div>
        <p className="form-kicker">LOGÍSTICA</p>
        <h2>Entregas</h2>
        <p>Controla retiro, envío o instalación del trabajo terminado y registra quién lo recibió.</p>
      </div>
      <span className="status dte-ready">{open} pendientes</span>
    </div>

    {message && <p className="feedback success">{message}</p>}

    <form className="panel client-form-full" onSubmit={create}>
      <div className="form-grid three">
        <label className="field form-span-2">
          <span>Orden lista *</span>
          <select required value={form.work_order_id} onChange={(event) => setForm({ ...form, work_order_id: event.target.value })}>
            <option value="">Seleccionar orden</option>
            {orders.filter((order) => !rows.some((row) => row.work_order_id === order.id)).map((order) =>
              <option key={order.id} value={order.id}>OT-{String(order.number).padStart(5, '0')} · {order.clients?.name || 'Cliente'} · {order.title}</option>
            )}
          </select>
        </label>
        <label className="field">
          <span>Modalidad</span>
          <select value={form.delivery_method} onChange={(event) => setForm({ ...form, delivery_method: event.target.value })}>
            <option value="PICKUP">Retiro en local</option>
            <option value="DELIVERY">Envío</option>
            <option value="INSTALLATION">Instalación</option>
          </select>
        </label>
        <label className="field">
          <span>Fecha programada</span>
          <input type="datetime-local" value={form.scheduled_at} onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}/>
        </label>
        <label className="field form-span-2">
          <span>Dirección / lugar</span>
          <input value={form.delivery_address} onChange={(event) => setForm({ ...form, delivery_address: event.target.value })}/>
        </label>
        <label className="field form-span-3">
          <span>Indicaciones</span>
          <textarea rows="2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/>
        </label>
      </div>
      <div className="form-actions end"><button>Crear entrega</button></div>
    </form>

    <section className="panel">
      <div className="panel-heading"><div><p className="form-kicker">SEGUIMIENTO</p><h3>Entregas recientes</h3></div></div>
      {rows.length ? <div className="client-list">
        {rows.map((row) => <div className="client-row" key={row.id}>
          <div>
            <strong>ENT-{String(row.number).padStart(5, '0')} · {row.clients?.name || 'Cliente'}</strong>
            <small>{row.work_orders?.title || 'Trabajo'} · {row.delivery_method} · programada {dt(row.scheduled_at)}</small>
            <small>{row.status === 'DELIVERED' ? `Recibió: ${row.recipient_name || 'Sin nombre'} · ${dt(row.delivered_at)}` : row.delivery_address || 'Sin dirección adicional'}</small>
          </div>
          <div>
            <strong>{row.status}</strong>
            {row.status !== 'DELIVERED' && row.status !== 'CANCELLED' && <button type="button" onClick={() => delivered(row)}>Confirmar entrega</button>}
            {row.status === 'DELIVERED' && row.work_order_id && <button type="button" onClick={() => openBilling(row)}>Facturar este trabajo</button>}
          </div>
        </div>)}
      </div> : <div className="empty-state"><strong>Sin entregas</strong><p>Cuando una orden llegue a LISTO podrás programar su entrega.</p></div>}
    </section>
  </section>
}

export function ReceivablesModule({ company, supabase }) {
  const [orders, setOrders] = useState([])
  const [rows, setRows] = useState([])
  const [payments, setPayments] = useState([])
  const [accounts, setAccounts] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ work_order_id: '', concept: '', amount_total: '', due_date: '' })
  const [pay, setPay] = useState({ receivable_id: '', cash_account_id: '', amount: '', payment_method: 'CASH', reference: '', notes: '', payment_key: newKey() })

  const load = async () => {
    const [o, r, p, a] = await Promise.all([
      supabase.from('work_orders').select('id,number,title,total,client_id,clients(name)').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('accounts_receivable').select('*,clients(name),work_orders(number,title),dte_documents(control_number,dte_type,status)').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('customer_payments').select('*,cash_accounts(name)').eq('company_id', company.id).order('paid_at', { ascending: false }).limit(100),
      supabase.from('cash_accounts').select('id,name,account_type,active').eq('company_id', company.id).eq('active', true).order('name'),
    ])
    if (o.error || r.error || p.error || a.error) setMessage(o.error?.message || r.error?.message || p.error?.message || a.error?.message)
    else {
      setOrders(o.data || [])
      setRows(r.data || [])
      setPayments(p.data || [])
      setAccounts(a.data || [])
      setPay((value) => ({ ...value, cash_account_id: value.cash_account_id || a.data?.[0]?.id || '' }))
    }
  }

  useEffect(() => { load() }, [company.id])

  const selectOrder = (id) => {
    const order = orders.find((row) => row.id === id)
    setForm({
      work_order_id: id,
      concept: order ? `OT-${String(order.number).padStart(5, '0')} · ${order.title}` : '',
      amount_total: order?.total || '',
      due_date: '',
    })
  }

  const create = async (event) => {
    event.preventDefault()
    const order = orders.find((row) => row.id === form.work_order_id)
    if (!order) return setMessage('Seleccioná una orden.')
    const { error } = await supabase.from('accounts_receivable').insert({
      company_id: company.id,
      client_id: order.client_id,
      work_order_id: order.id,
      concept: form.concept,
      amount_total: Number(form.amount_total || 0),
      due_date: form.due_date || null,
    })
    if (error) setMessage(error.message)
    else {
      setMessage('Cuenta por cobrar creada.')
      setForm({ work_order_id: '', concept: '', amount_total: '', due_date: '' })
      await load()
    }
  }

  const chooseReceivable = (id) => {
    const receivable = rows.find((row) => row.id === id)
    const balance = receivable ? Math.max(0, Number(receivable.amount_total) - Number(receivable.amount_paid)) : 0
    setPay((value) => ({ ...value, receivable_id: id, amount: balance ? balance.toFixed(2) : '' }))
  }

  const registerPayment = async (event) => {
    event.preventDefault()
    if (busy) return
    const receivable = rows.find((row) => row.id === pay.receivable_id)
    if (!receivable) return setMessage('Seleccioná una cuenta.')
    if (!pay.cash_account_id) return setMessage('Seleccioná la caja o banco donde ingresará el cobro.')
    const balance = Math.max(0, Number(receivable.amount_total) - Number(receivable.amount_paid))
    const amount = Number(pay.amount || 0)
    if (amount <= 0 || amount > balance + 0.001) return setMessage(`El pago debe ser mayor a $0 y no superar ${money(balance)}.`)

    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('register_customer_payment', {
      p_receivable: receivable.id,
      p_cash_account: pay.cash_account_id,
      p_amount: amount,
      p_payment_method: pay.payment_method,
      p_reference: pay.reference || null,
      p_notes: pay.notes || null,
      p_payment_key: pay.payment_key,
    })
    if (error) setMessage(error.message)
    else {
      setMessage('Cobro aplicado y entrada registrada en Caja.')
      setPay((value) => ({ ...value, receivable_id: '', amount: '', reference: '', notes: '', payment_key: newKey() }))
      await load()
    }
    setBusy(false)
  }

  const pending = useMemo(() => rows.filter((row) => !['PAID', 'CANCELLED'].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.amount_total) - Number(row.amount_paid)), 0), [rows])
  const collected = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments])

  return <section className="clients-module">
    <div className="clients-titlebar">
      <div><p className="form-kicker">FINANZAS</p><h2>Cuentas por cobrar</h2><p>Las facturas DTE a crédito aceptadas generan cartera automáticamente; los cobros entran a Caja con trazabilidad.</p></div>
    </div>
    <div className="metrics-grid">
      <article className="metric-card"><span>Saldo pendiente</span><strong>{money(pending)}</strong></article>
      <article className="metric-card"><span>Cobrado registrado</span><strong>{money(collected)}</strong></article>
      <article className="metric-card"><span>Cuentas abiertas</span><strong>{rows.filter((row) => !['PAID', 'CANCELLED'].includes(row.status)).length}</strong></article>
    </div>
    {message && <p className={/aplicado|creada/i.test(message) ? 'feedback success' : 'feedback error'}>{message}</p>}

    <div className="module-grid two-column">
      <form className="panel" onSubmit={create}>
        <div className="panel-heading"><div><p className="form-kicker">CUENTA MANUAL</p><h3>Generar saldo desde OT</h3></div></div>
        <div className="form-grid">
          <label className="field"><span>Orden de trabajo *</span><select required value={form.work_order_id} onChange={(event) => selectOrder(event.target.value)}><option value="">Seleccionar orden</option>{orders.filter((order) => !rows.some((row) => row.work_order_id === order.id)).map((order) => <option key={order.id} value={order.id}>OT-{String(order.number).padStart(5, '0')} · {order.clients?.name || 'Cliente'} · {money(order.total)}</option>)}</select></label>
          <label className="field"><span>Concepto *</span><input required value={form.concept} onChange={(event) => setForm({ ...form, concept: event.target.value })}/></label>
          <label className="field"><span>Total *</span><input type="number" min="0" step="0.01" required value={form.amount_total} onChange={(event) => setForm({ ...form, amount_total: event.target.value })}/></label>
          <label className="field"><span>Vencimiento</span><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })}/></label>
        </div>
        <div className="form-actions end"><button>Crear cuenta</button></div>
      </form>

      <form className="panel" onSubmit={registerPayment}>
        <div className="panel-heading"><div><p className="form-kicker">COBRO</p><h3>Registrar abono o pago</h3></div></div>
        <div className="form-grid">
          <label className="field"><span>Cuenta *</span><select required value={pay.receivable_id} onChange={(event) => chooseReceivable(event.target.value)}><option value="">Seleccionar cuenta</option>{rows.filter((row) => !['PAID', 'CANCELLED'].includes(row.status)).map((row) => <option key={row.id} value={row.id}>CXC-{String(row.number).padStart(5, '0')} · {row.clients?.name || 'Cliente'} · saldo {money(Number(row.amount_total) - Number(row.amount_paid))}</option>)}</select></label>
          <label className="field"><span>Caja / banco *</span><select required value={pay.cash_account_id} onChange={(event) => setPay({ ...pay, cash_account_id: event.target.value })}><option value="">Seleccionar</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.account_type}</option>)}</select></label>
          <label className="field"><span>Monto *</span><input type="number" min="0.01" step="0.01" required value={pay.amount} onChange={(event) => setPay({ ...pay, amount: event.target.value })}/></label>
          <label className="field"><span>Forma</span><select value={pay.payment_method} onChange={(event) => setPay({ ...pay, payment_method: event.target.value })}><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option><option value="CHECK">Cheque</option><option value="OTHER">Otro</option></select></label>
          <label className="field"><span>Referencia</span><input value={pay.reference} onChange={(event) => setPay({ ...pay, reference: event.target.value })}/></label>
          <label className="field"><span>Notas</span><input value={pay.notes} onChange={(event) => setPay({ ...pay, notes: event.target.value })}/></label>
        </div>
        <div className="form-actions end"><button disabled={busy || !accounts.length}>{busy ? 'Registrando…' : 'Registrar cobro y entrada de caja'}</button></div>
        {!accounts.length && <div className="dte-note">Primero crea una cuenta activa en Caja para registrar el ingreso.</div>}
      </form>
    </div>

    <section className="panel">
      <div className="panel-heading"><div><p className="form-kicker">CARTERA</p><h3>Saldos de clientes</h3></div></div>
      {rows.length ? <div className="client-list">{rows.map((row) => {
        const balance = Math.max(0, Number(row.amount_total) - Number(row.amount_paid))
        return <div className="client-row" key={row.id}>
          <div><strong>CXC-{String(row.number).padStart(5, '0')} · {row.clients?.name || 'Cliente'}</strong><small>{row.dte_documents ? `${row.dte_documents.control_number} · ` : ''}{row.concept} · vence {row.due_date || 'sin fecha'}</small></div>
          <div><strong>{money(balance)} pendiente</strong><small>{money(row.amount_paid)} pagado de {money(row.amount_total)} · {row.status}</small>{balance > 0 && <button type="button" onClick={() => chooseReceivable(row.id)}>Cobrar</button>}</div>
        </div>
      })}</div> : <div className="empty-state"><strong>Sin cuentas por cobrar</strong></div>}
    </section>

    <section className="panel">
      <div className="panel-heading"><div><p className="form-kicker">COBROS</p><h3>Últimos ingresos de clientes</h3></div></div>
      {payments.length ? <div className="client-list">{payments.slice(0, 30).map((payment) => <div className="client-row" key={payment.id}><div><strong>{money(payment.amount)} · {payment.payment_method}</strong><small>{dt(payment.paid_at)} · {payment.cash_accounts?.name || 'Caja'} · {payment.reference || 'Sin referencia'}</small></div></div>)}</div> : <div className="empty-state"><strong>Sin cobros registrados</strong></div>}
    </section>
  </section>
}