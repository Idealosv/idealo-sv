/* IDEALO BAR · asistente visual de cobro/ticket
   Solo mejora la navegación del POS. No altera reglas de negocio ni llamadas Supabase. */

const esc=value=>String(value??'')
 .replaceAll('&','&amp;')
 .replaceAll('<','&lt;')
 .replaceAll('>','&gt;')
 .replaceAll('"','&quot;')
 .replaceAll("'",'&#039;')

const text=(root,selector)=>root?.querySelector(selector)?.textContent?.trim()||''

const buildReceipt=ticket=>{
 const head=ticket.querySelector('.barops-ticket-head')
 const headLines=[...head?.querySelectorAll('small,strong')||[]].map(n=>n.textContent.trim()).filter(Boolean)
 const items=[...ticket.querySelectorAll('.barops-ticket-lines .barops-line')].map(line=>({
  name:text(line,'strong'),
  detail:text(line,'small'),
  qty:text(line,'.barops-line-qty span'),
  total:[...line.children].find(n=>n.tagName==='B')?.textContent?.trim()||''
 }))
 const totals=[...ticket.querySelectorAll('.barops-totals > div')].map(row=>({
  label:text(row,'span'),
  value:text(row,'b')||text(row,'strong')
 }))
 const now=new Intl.DateTimeFormat('es-SV',{dateStyle:'short',timeStyle:'short'}).format(new Date())
 return {headLines,items,totals,now}
}

const printReceipt=ticket=>{
 const receipt=buildReceipt(ticket)
 if(!receipt.items.length){window.alert('Este pedido todavía no tiene productos para imprimir.');return}
 const w=window.open('','_blank','width=420,height=720')
 if(!w){window.alert('El navegador bloqueó la ventana del ticket. Permití ventanas emergentes para IDEALO BAR.');return}
 const rows=receipt.items.map(item=>`<div class="item"><div><b>${esc(item.name)}</b><small>${esc(item.detail)}</small></div><span>${esc(item.qty)}</span><strong>${esc(item.total)}</strong></div>`).join('')
 const totals=receipt.totals.map(row=>`<div class="total"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join('')
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket IDEALO BAR</title><style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#111;background:#fff}.receipt{width:80mm;max-width:100%;margin:auto}.center{text-align:center}.brand{font-size:20px;font-weight:900;margin:0}.sub{font-size:11px;margin:3px 0}.rule{border-top:1px dashed #555;margin:10px 0}.meta{font-size:11px;line-height:1.5}.item{display:grid;grid-template-columns:1fr 34px 62px;gap:6px;align-items:start;padding:6px 0;border-bottom:1px dotted #bbb;font-size:11px}.item b{display:block;font-size:12px}.item small{display:block;color:#555;margin-top:2px}.item span,.item strong{text-align:right}.total{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px}.total:last-child{font-size:15px;font-weight:900;border-top:1px solid #111;margin-top:5px;padding-top:7px}.foot{font-size:10px;line-height:1.45;color:#444;margin-top:12px}@media print{body{padding:0}.receipt{width:72mm}}
 </style></head><body><div class="receipt"><div class="center"><p class="brand">IDEALO BAR</p><p class="sub">Ticket de consumo</p></div><div class="rule"></div><div class="meta">${receipt.headLines.map(v=>`<div>${esc(v)}</div>`).join('')}<div>${esc(receipt.now)}</div></div><div class="rule"></div>${rows}<div class="rule"></div>${totals}<div class="foot center">Gracias por su visita.<br>Ticket interno de consumo. No sustituye factura ni DTE cuando corresponda.</div></div><script>window.onload=()=>{window.print()}<\/script></body></html>`)
 w.document.close()
}

const enhanceTicket=()=>{
 const ticket=document.querySelector('.barops-ticket')
 if(!ticket)return
 const head=ticket.querySelector('.barops-ticket-head')
 if(!head)return

 const payTab=[...ticket.querySelectorAll('.barops-tool-tabs button')].find(btn=>/dividir\s*\/\s*cobrar|cobrar/i.test(btn.textContent||''))
 if(payTab){payTab.textContent='Cobrar / dividir';payTab.dataset.paymentShortcut='true'}

 const registerButton=[...ticket.querySelectorAll('.barops-tool-body button')].find(btn=>/registrar pago|cobrar/i.test(btn.textContent||''))
 if(registerButton&&/registrar pago/i.test(registerButton.textContent||''))registerButton.textContent='COBRAR / REGISTRAR PAGO'

 let shortcuts=ticket.querySelector('.barops-pay-shortcuts')
 if(!shortcuts){
  shortcuts=document.createElement('div')
  shortcuts.className='barops-pay-shortcuts'
  const pay=document.createElement('button')
  pay.type='button'
  pay.className='barops-direct-pay'
  pay.textContent='💵 COBRAR'
  pay.addEventListener('click',()=>{
   const target=[...ticket.querySelectorAll('.barops-tool-tabs button')].find(btn=>/cobrar|dividir/i.test(btn.textContent||''))
   if(!target){window.alert('Tu rol no tiene permiso para cobrar este pedido.');return}
   target.click()
   window.setTimeout(()=>{
    const tools=ticket.querySelector('.barops-ticket-tools')
    if(tools){tools.classList.add('payment-focus');tools.scrollIntoView({behavior:'smooth',block:'nearest'});window.setTimeout(()=>tools.classList.remove('payment-focus'),1800)}
   },80)
  })
  const print=document.createElement('button')
  print.type='button'
  print.textContent='🧾 IMPRIMIR TICKET'
  print.addEventListener('click',()=>printReceipt(ticket))
  shortcuts.append(pay,print)
  const actions=ticket.querySelector('.barops-ticket-actions')
  if(actions)actions.insertAdjacentElement('afterend',shortcuts)
  else ticket.append(shortcuts)
 }
 const directPay=shortcuts.querySelector('.barops-direct-pay')
 if(directPay)directPay.disabled=!payTab
}

const enhance=()=>{
 enhanceTicket()
 const noOrder=document.querySelector('.barops-ticket .barops-empty p')
 if(noOrder&&/ticket aparecerá/i.test(noOrder.textContent||''))noOrder.textContent='Primero seleccioná una mesa. El pedido aparecerá aquí y tendrás botones directos para COBRAR e IMPRIMIR TICKET.'
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
 let queued=false
 const queue=()=>{if(queued)return;queued=true;window.requestAnimationFrame(()=>{queued=false;enhance()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});else queue()
 const observer=new MutationObserver(queue)
 observer.observe(document.documentElement,{childList:true,subtree:true})
}
