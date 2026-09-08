import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase.js'
import Client360Timeline from './Client360Timeline.jsx'

export default function Client360TimelineHost() {
  const [target, setTarget] = useState(null)
  const [clientId, setClientId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [data, setData] = useState({})

  useEffect(() => {
    const sync = () => {
      const root = document.querySelector('.client360')
      const select = root?.querySelector('header select')
      setTarget(root || null)
      setClientId(select?.value || '')
    }
    const onChange = event => { if (event.target?.matches?.('.client360 header select')) sync() }
    const onModule = () => queueMicrotask(sync)
    sync()
    document.addEventListener('change', onChange, true)
    window.addEventListener('idealo-module-change', onModule)
    return () => {
      document.removeEventListener('change', onChange, true)
      window.removeEventListener('idealo-module-change', onModule)
    }
  }, [])

  useEffect(() => {
    if (!clientId) { setData({}); return }
    ;(async () => {
      const { data: companies } = await supabase.rpc('get_my_companies')
      const id = companies?.[0]?.id
      if (id) setCompanyId(id)
    })()
  }, [clientId])

  useEffect(() => {
    if (!clientId || !companyId) return
    ;(async () => {
      const specs = [
        ['quotes', 'id,number,status,total,created_at'],
        ['work_orders', 'id,number,title,status,total,due_at,created_at'],
        ['deliveries', 'id,status,scheduled_at,received_at'],
        ['accounts_receivable', 'id,amount_total,amount_paid,due_date,status'],
        ['customer_payments', 'id,amount,paid_at,payment_method'],
        ['dte_documents', 'id,dte_type,status,generation_code,mh_receipt_seal,created_at'],
        ['client_interactions', 'id,interaction_type,channel,subject,details,occurred_at,outcome,created_at'],
        ['client_audit_log', 'id,action,field_name,created_at']
      ]
      const out = {}
      await Promise.all(specs.map(async ([table, columns]) => {
        const response = await supabase.from(table).select(columns).eq('company_id', companyId).eq('client_id', clientId).limit(200)
        out[table] = response.error ? [] : (response.data || [])
      }))
      setData(out)
    })()
  }, [clientId, companyId])

  if (!target || !clientId) return null
  return createPortal(<Client360Timeline data={data} />, target)
}
