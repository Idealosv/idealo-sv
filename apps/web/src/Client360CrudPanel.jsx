import { useEffect, useState } from 'react'

const emptyContact = { id: '', name: '', position: '', email: '', phone: '', whatsapp: '', is_primary: false, notes: '' }
const emptyAddress = { id: '', address_type: 'DELIVERY', label: '', department: '', municipality: '', address: '', latitude: '', longitude: '', is_primary: false }
const emptyInteraction = { id: '', interaction_type: 'FOLLOW_UP', channel: 'WHATSAPP', subject: '', details: '', occurred_at: '', next_follow_up_at: '', outcome: '' }
const emptyCredit = { credit_enabled: false, credit_limit: '0', credit_days: '0', risk_level: 'NORMAL', blocked: false, blocked_reason: '' }

const clean = (value) => value === '' ? null : value
const localDateTime = (value) => value ? new Date(value).toISOString().slice(0, 16) : ''

export default function Client360CrudPanel({ supabase, companyId, client, data, onChanged }) {
  const [section, setSection] = useState('contactos')
  const [contact, setContact] = useState(emptyContact)
  const [address, setAddress] = useState(emptyAddress)
  const [interaction, setInteraction] = useState(emptyInteraction)
  const [credit, setCredit] = useState(emptyCredit)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const row = data.client_credit_profiles?.[0]
    setCredit(row ? {
      credit_enabled: !!row.credit_enabled,
      credit_limit: String(row.credit_limit ?? 0),
      credit_days: String(row.credit_days ?? 0),
      risk_level: row.risk_level || 'NORMAL',
      blocked: !!row.blocked,
      blocked_reason: row.blocked_reason || '',
    } : emptyCredit)
  }, [client.id, data.client_credit_profiles])

  const finish = async (text) => {
    setMessage(text)
    setBusy('')
    await onChanged?.()
  }

  const fail = (error) => { setMessage(error?.message || String(error)); setBusy('') }

  const saveContact = async (event) => {
    event.preventDefault(); setBusy('contact'); setMessage('')
    const payload = { company_id: companyId, client_id: client.id, name: contact.name.trim(), position: clean(contact.position.trim()), email: clean(contact.email.trim()), phone: clean(contact.phone.trim()), whatsapp: clean(contact.whatsapp.trim()), notes: contact.notes || '', is_primary: !!contact.is_primary, updated_at: new Date().toISOString() }
    const result = contact.id ? await supabase.from('client_contacts').update(payload).eq('id', contact.id).eq('company_id', companyId) : await supabase.from('client_contacts').insert(payload)
    if (result.error) return fail(result.error)
    setContact(emptyContact); await finish(contact.id ? 'Contacto actualizado.' : 'Contacto agregado.')
  }

  const editContact = (row) => { setSection('contactos'); setContact({ ...emptyContact, ...row }) }
  const deleteContact = async (row) => {
    if (!window.confirm(`¿Eliminar el contacto ${row.name}?`)) return
    setBusy(`contact-${row.id}`)
    const { error } = await supabase.from('client_contacts').delete().eq('id', row.id).eq('company_id', companyId)
    if (error) return fail(error)
    if (contact.id === row.id) setContact(emptyContact)
    await finish('Contacto eliminado.')
  }

  const saveAddress = async (event) => {
    event.preventDefault(); setBusy('address'); setMessage('')
    const payload = { company_id: companyId, client_id: client.id, address_type: address.address_type, label: clean(address.label.trim()), department: clean(address.department.trim()), municipality: clean(address.municipality.trim()), address: address.address.trim(), latitude: clean(address.latitude), longitude: clean(address.longitude), is_primary: !!address.is_primary, updated_at: new Date().toISOString() }
    const result = address.id ? await supabase.from('client_addresses').update(payload).eq('id', address.id).eq('company_id', companyId) : await supabase.from('client_addresses').insert(payload)
    if (result.error) return fail(result.error)
    setAddress(emptyAddress); await finish(address.id ? 'Dirección actualizada.' : 'Dirección agregada.')
  }

  const editAddress = (row) => { setSection('direcciones'); setAddress({ ...emptyAddress, ...row, latitude: row.latitude ?? '', longitude: row.longitude ?? '' }) }
  const deleteAddress = async (row) => {
    if (!window.confirm('¿Eliminar esta dirección del cliente?')) return
    setBusy(`address-${row.id}`)
    const { error } = await supabase.from('client_addresses').delete().eq('id', row.id).eq('company_id', companyId)
    if (error) return fail(error)
    if (address.id === row.id) setAddress(emptyAddress)
    await finish('Dirección eliminada.')
  }

  const saveInteraction = async (event) => {
    event.preventDefault(); setBusy('interaction'); setMessage('')
    const payload = { company_id: companyId, client_id: client.id, interaction_type: interaction.interaction_type, channel: clean(interaction.channel), subject: clean(interaction.subject.trim()), details: interaction.details.trim(), occurred_at: interaction.occurred_at ? new Date(interaction.occurred_at).toISOString() : new Date().toISOString(), next_follow_up_at: interaction.next_follow_up_at ? new Date(interaction.next_follow_up_at).toISOString() : null, outcome: clean(interaction.outcome.trim()) }
    const result = interaction.id ? await supabase.from('client_interactions').update(payload).eq('id', interaction.id).eq('company_id', companyId) : await supabase.from('client_interactions').insert(payload)
    if (result.error) return fail(result.error)
    setInteraction(emptyInteraction); await finish(interaction.id ? 'Seguimiento actualizado.' : 'Seguimiento registrado.')
  }

  const editInteraction = (row) => { setSection('seguimiento'); setInteraction({ ...emptyInteraction, ...row, occurred_at: localDateTime(row.occurred_at), next_follow_up_at: localDateTime(row.next_follow_up_at) }) }
  const deleteInteraction = async (row) => {
    if (!window.confirm('¿Eliminar este seguimiento comercial?')) return
    setBusy(`interaction-${row.id}`)
    const { error } = await supabase.from('client_interactions').delete().eq('id', row.id).eq('company_id', companyId)
    if (error) return fail(error)
    if (interaction.id === row.id) setInteraction(emptyInteraction)
    await finish('Seguimiento eliminado.')
  }

  const saveCredit = async (event) => {
    event.preventDefault(); setBusy('credit'); setMessage('')
    const payload = { client_id: client.id, company_id: companyId, credit_enabled: !!credit.credit_enabled, credit_limit: Number(credit.credit_limit || 0), credit_days: Number(credit.credit_days || 0), risk_level: credit.risk_level, blocked: !!credit.blocked, blocked_reason: credit.blocked ? clean(credit.blocked_reason.trim()) : null, last_review_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    const { error } = await supabase.from('client_credit_profiles').upsert(payload, { onConflict: 'client_id' })
    if (error) return fail(error)
    await supabase.from('clients').update({ credit_limit: payload.credit_limit, credit_days: payload.credit_days, blocked_for_debt: payload.blocked, updated_at: new Date().toISOString() }).eq('id', client.id).eq('company_id', companyId)
    await finish('Perfil de crédito actualizado.')
  }

  const openModule = (target, tab) => window.dispatchEvent(new CustomEvent('idealo-open-client-context', { detail: { target, tab, clientId: client.id, clientName: client.name } }))

  return <section className="c360workspace">
    <div className="c360workspace-head"><div><small>GESTIÓN DEL EXPEDIENTE</small><h3>Editar Cliente 360 sin salir de la ficha</h3></div><div className="c360quick-actions"><button onClick={() => openModule('commercial', 'Cotizaciones')}>Nueva cotización</button><button onClick={() => openModule('commercial', 'Producción')}>Producción</button><button onClick={() => openModule('billing', 'Facturación')}>Facturar DTE</button><button onClick={() => openModule('commercial', 'Cuentas por cobrar')}>Cobros / CxC</button></div></div>
    <nav className="c360tabs">{[['contactos','Contactos'],['direcciones','Direcciones'],['seguimiento','Seguimiento'],['credito','Crédito']].map(([id,label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>)}</nav>
    {message && <p className="c360feedback">{message}</p>}

    {section === 'contactos' && <div className="c360editor-grid"><form onSubmit={saveContact} className="c360editor"><h4>{contact.id ? 'Editar contacto' : 'Nuevo contacto'}</h4><div className="c360form-grid"><label>Nombre *<input required value={contact.name} onChange={e => setContact({ ...contact, name: e.target.value })}/></label><label>Cargo<input value={contact.position} onChange={e => setContact({ ...contact, position: e.target.value })}/></label><label>Teléfono<input value={contact.phone} onChange={e => setContact({ ...contact, phone: e.target.value })}/></label><label>WhatsApp<input value={contact.whatsapp} onChange={e => setContact({ ...contact, whatsapp: e.target.value })}/></label><label className="span2">Correo<input type="email" value={contact.email} onChange={e => setContact({ ...contact, email: e.target.value })}/></label><label className="span2">Notas<textarea rows="2" value={contact.notes} onChange={e => setContact({ ...contact, notes: e.target.value })}/></label><label className="c360check"><input type="checkbox" checked={contact.is_primary} onChange={e => setContact({ ...contact, is_primary: e.target.checked })}/> Contacto principal</label></div><div className="c360form-actions">{contact.id && <button type="button" className="secondary" onClick={() => setContact(emptyContact)}>Cancelar</button>}<button disabled={busy === 'contact'}>{busy === 'contact' ? 'Guardando…' : 'Guardar contacto'}</button></div></form><CrudList rows={data.client_contacts || []} empty="Sin contactos adicionales" render={row => <><div><strong>{row.name}{row.is_primary ? ' · PRINCIPAL' : ''}</strong><small>{row.position || 'Sin cargo'} · {row.whatsapp || row.phone || row.email || 'Sin canal'}</small></div><div className="c360row-actions"><button onClick={() => editContact(row)}>Editar</button><button className="danger" disabled={busy === `contact-${row.id}`} onClick={() => deleteContact(row)}>Eliminar</button></div></>}/></div>}

    {section === 'direcciones' && <div className="c360editor-grid"><form onSubmit={saveAddress} className="c360editor"><h4>{address.id ? 'Editar dirección' : 'Nueva dirección'}</h4><div className="c360form-grid"><label>Tipo<select value={address.address_type} onChange={e => setAddress({ ...address, address_type: e.target.value })}><option value="FISCAL">Fiscal</option><option value="DELIVERY">Entrega</option><option value="INSTALLATION">Instalación</option><option value="OTHER">Otra</option></select></label><label>Etiqueta<input value={address.label} onChange={e => setAddress({ ...address, label: e.target.value })} placeholder="Casa, sucursal, taller…"/></label><label>Departamento<input value={address.department} onChange={e => setAddress({ ...address, department: e.target.value })}/></label><label>Municipio/Distrito<input value={address.municipality} onChange={e => setAddress({ ...address, municipality: e.target.value })}/></label><label className="span2">Dirección *<textarea required rows="2" value={address.address} onChange={e => setAddress({ ...address, address: e.target.value })}/></label><label>Latitud<input type="number" step="any" value={address.latitude} onChange={e => setAddress({ ...address, latitude: e.target.value })}/></label><label>Longitud<input type="number" step="any" value={address.longitude} onChange={e => setAddress({ ...address, longitude: e.target.value })}/></label><label className="c360check"><input type="checkbox" checked={address.is_primary} onChange={e => setAddress({ ...address, is_primary: e.target.checked })}/> Dirección principal</label></div><div className="c360form-actions">{address.id && <button type="button" className="secondary" onClick={() => setAddress(emptyAddress)}>Cancelar</button>}<button disabled={busy === 'address'}>{busy === 'address' ? 'Guardando…' : 'Guardar dirección'}</button></div></form><CrudList rows={data.client_addresses || []} empty="Sin direcciones adicionales" render={row => <><div><strong>{row.label || row.address_type}{row.is_primary ? ' · PRINCIPAL' : ''}</strong><small>{row.department || ''} {row.municipality || ''} · {row.address}</small></div><div className="c360row-actions"><button onClick={() => editAddress(row)}>Editar</button><button className="danger" disabled={busy === `address-${row.id}`} onClick={() => deleteAddress(row)}>Eliminar</button></div></>}/></div>}

    {section === 'seguimiento' && <div className="c360editor-grid"><form onSubmit={saveInteraction} className="c360editor"><h4>{interaction.id ? 'Editar seguimiento' : 'Registrar seguimiento'}</h4><div className="c360form-grid"><label>Tipo<select value={interaction.interaction_type} onChange={e => setInteraction({ ...interaction, interaction_type: e.target.value })}><option value="FOLLOW_UP">Seguimiento</option><option value="CALL">Llamada</option><option value="VISIT">Visita</option><option value="QUOTE">Cotización</option><option value="COMPLAINT">Reclamo</option><option value="COLLECTION">Cobranza</option></select></label><label>Canal<select value={interaction.channel} onChange={e => setInteraction({ ...interaction, channel: e.target.value })}><option value="WHATSAPP">WhatsApp</option><option value="PHONE">Teléfono</option><option value="EMAIL">Correo</option><option value="IN_PERSON">Presencial</option><option value="OTHER">Otro</option></select></label><label className="span2">Asunto<input value={interaction.subject} onChange={e => setInteraction({ ...interaction, subject: e.target.value })}/></label><label>Fecha/hora<input type="datetime-local" value={interaction.occurred_at} onChange={e => setInteraction({ ...interaction, occurred_at: e.target.value })}/></label><label>Próximo seguimiento<input type="datetime-local" value={interaction.next_follow_up_at} onChange={e => setInteraction({ ...interaction, next_follow_up_at: e.target.value })}/></label><label className="span2">Detalle *<textarea required rows="3" value={interaction.details} onChange={e => setInteraction({ ...interaction, details: e.target.value })}/></label><label className="span2">Resultado<input value={interaction.outcome} onChange={e => setInteraction({ ...interaction, outcome: e.target.value })}/></label></div><div className="c360form-actions">{interaction.id && <button type="button" className="secondary" onClick={() => setInteraction(emptyInteraction)}>Cancelar</button>}<button disabled={busy === 'interaction'}>{busy === 'interaction' ? 'Guardando…' : 'Guardar seguimiento'}</button></div></form><CrudList rows={data.client_interactions || []} empty="Sin seguimientos registrados" render={row => <><div><strong>{row.subject || row.interaction_type}</strong><small>{new Date(row.occurred_at).toLocaleString('es-SV')} · {row.channel || 'Sin canal'}{row.next_follow_up_at ? ` · próximo ${new Date(row.next_follow_up_at).toLocaleDateString('es-SV')}` : ''}</small></div><div className="c360row-actions"><button onClick={() => editInteraction(row)}>Editar</button><button className="danger" disabled={busy === `interaction-${row.id}`} onClick={() => deleteInteraction(row)}>Eliminar</button></div></>}/></div>}

    {section === 'credito' && <div className="c360editor-grid single"><form onSubmit={saveCredit} className="c360editor"><h4>Política de crédito del cliente</h4><div className="c360form-grid"><label className="c360check"><input type="checkbox" checked={credit.credit_enabled} onChange={e => setCredit({ ...credit, credit_enabled: e.target.checked })}/> Crédito habilitado</label><label>Nivel de riesgo<select value={credit.risk_level} onChange={e => setCredit({ ...credit, risk_level: e.target.value })}><option value="LOW">Bajo</option><option value="NORMAL">Normal</option><option value="MEDIUM">Medio</option><option value="HIGH">Alto</option></select></label><label>Límite de crédito<input type="number" min="0" step="0.01" value={credit.credit_limit} onChange={e => setCredit({ ...credit, credit_limit: e.target.value })}/></label><label>Días de crédito<input type="number" min="0" step="1" value={credit.credit_days} onChange={e => setCredit({ ...credit, credit_days: e.target.value })}/></label><label className="c360check"><input type="checkbox" checked={credit.blocked} onChange={e => setCredit({ ...credit, blocked: e.target.checked })}/> Bloquear nuevas operaciones por crédito</label><label>Motivo de bloqueo<input disabled={!credit.blocked} value={credit.blocked_reason} onChange={e => setCredit({ ...credit, blocked_reason: e.target.value })}/></label></div><div className="c360form-actions"><button disabled={busy === 'credit'}>{busy === 'credit' ? 'Guardando…' : 'Actualizar crédito'}</button></div></form></div>}
  </section>
}

function CrudList({ rows, empty, render }) {
  return <section className="c360crud-list">{rows.length ? rows.map(row => <article key={row.id || row.client_id} className="c360crud-row">{render(row)}</article>) : <div className="c360crud-empty">{empty}</div>}</section>
}
