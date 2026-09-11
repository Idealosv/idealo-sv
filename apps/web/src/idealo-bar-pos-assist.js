/* IDEALO BAR · asistente visual de cobro/ticket
   Mejora el flujo del POS sin sustituir las reglas de negocio de Supabase. */

const esc=value=>String(value??'')
 .replaceAll('&','&amp;')
 .replaceAll('<','&lt;')
 .replaceAll('>','&gt;')
 .replaceAll('"','&quot;')
 .replaceAll("'",'&#039;')

const text=(root,selector)=>root?.querySelector(selector)?.textContent?.trim()||''
const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value||0))
const methodLabel={cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia',other:'Otro'}

let lastPaymentIntent=null
let lastReceipt=null

const numberFromMoney=value=>{
 const raw=String(value??'').replace(/[^0-9,.-]/g,'')
 if(!raw)return 0
 let normalized=raw
 if(raw.includes('.')&&raw.includes(',')){
  normalized=raw.lastIndexOf('.')>raw.lastIndexOf(',')?raw.replaceAll(',',''):raw.replaceAll('.','').replace(',','.')
 }else if(raw.includes(','))normalized=raw.replace(',','.')
 const n=Number(normalized)
 return Number.isFinite(n)?n:0
}

const currentBusinessName=()=>{
 const label=document.querySelector('.barops-head p')?.textContent?.trim()||''
 const name=label.split(' · ')[0]?.trim()
 return name||'IDEALO BAR'
}

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
 const now=new Intl.DateTimeFormat('es-SV',{timeZone:'America/El_Salvador',dateStyle:'short',timeStyle:'short'}).format(new Date())
 return {brand:currentBusinessName(),headLines,items,totals,now,payment:null}
}

const paymentContext=ticket=>{
 const summary=ticket?.querySelector('.barops-payment-summary')
 if(!summary)return null
 const body=summary.parentElement?.querySelector('.barops-tool-body')
 const methodSelect=body?.querySelector('select')
 const amountInput=body?.querySelector('input[type="number"]')
 if(!body||!methodSelect||!amountInput)return null
 const parts=[...summary.querySelectorAll('span,b')].map(node=>node.textContent.trim())
 const findAmount=label=>numberFromMoney(parts.find(v=>v.toLowerCase().startsWith(label))||'')
 return {
  summary,body,methodSelect,amountInput,
  method:methodSelect.value||'cash',
  amount:Number(amountInput.value||0),
  total:findAmount('total'),
  paid:findAmount('pagado'),
  due:findAmount('saldo'),
 }
}

const makePaymentIntent=ticket=>{
 const ctx=paymentContext(ticket)
 if(!ctx||!(ctx.amount>0))return null
 const cash=ctx.method==='cash'
 const applied=cash?Math.min(ctx.amount,ctx.due):ctx.amount
 const change=cash?Math.max(0,ctx.amount-ctx.due):0
 const remaining=Math.max(0,ctx.due-applied)
 const receipt=buildReceipt(ticket)
 receipt.payment={method:ctx.method,total:ctx.total,paidBefore:ctx.paid,tendered:ctx.amount,applied,change,remaining}
 return {receipt,payment:receipt.payment}
}

const printReceiptData=receipt=>{
 if(!receipt?.items?.length){window.alert('Este pedido todavía no tiene productos para imprimir.');return}
 const w=window.open('','_blank','width=420,height=720')
 if(!w){window.alert('El navegador bloqueó la ventana del ticket. Permití ventanas emergentes para IDEALO BAR.');return}
 const rows=receipt.items.map(item=>`<div class="item"><div><b>${esc(item.name)}</b><small>${esc(item.detail)}</small></div><span>${esc(item.qty)}</span><strong>${esc(item.total)}</strong></div>`).join('')
 const baseTotals=receipt.payment
  ? receipt.totals.filter(row=>!/^pagado$|^saldo$/i.test(row.label)).concat([{label:'Total',value:money(receipt.payment.total)}])
  : receipt.totals
 const totals=baseTotals.map(row=>`<div class="total"><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join('')
 const pay=receipt.payment?`<div class="rule"></div><div class="pay"><div><span>Método</span><b>${esc(methodLabel[receipt.payment.method]||receipt.payment.method)}</b></div><div><span>Pago aplicado</span><b>${esc(money(receipt.payment.applied))}</b></div>${receipt.payment.method==='cash'?`<div><span>Efectivo recibido</span><b>${esc(money(receipt.payment.tendered))}</b></div><div class="change"><span>Cambio</span><b>${esc(money(receipt.payment.change))}</b></div>`:''}${receipt.payment.remaining>0?`<div><span>Saldo pendiente</span><b>${esc(money(receipt.payment.remaining))}</b></div>`:''}</div>`:''
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${esc(receipt.brand)}</title><style>
 *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#111;background:#fff}.receipt{width:80mm;max-width:100%;margin:auto}.center{text-align:center}.brand{font-size:20px;font-weight:900;margin:0}.sub{font-size:11px;margin:3px 0}.rule{border-top:1px dashed #555;margin:10px 0}.meta{font-size:11px;line-height:1.5}.item{display:grid;grid-template-columns:1fr 34px 62px;gap:6px;align-items:start;padding:6px 0;border-bottom:1px dotted #bbb;font-size:11px}.item b{display:block;font-size:12px}.item small{display:block;color:#555;margin-top:2px}.item span,.item strong{text-align:right}.total,.pay>div{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px}.total:last-child{font-size:15px;font-weight:900;border-top:1px solid #111;margin-top:5px;padding-top:7px}.pay .change{font-size:16px;font-weight:900;border-top:1px solid #111;margin-top:4px;padding-top:7px}.foot{font-size:10px;line-height:1.45;color:#444;margin-top:12px}@media print{body{padding:0}.receipt{width:72mm}}
 </style></head><body><div class="receipt"><div class="center"><p class="brand">${esc(receipt.brand)}</p><p class="sub">Ticket de consumo</p></div><div class="rule"></div><div class="meta">${receipt.headLines.map(v=>`<div>${esc(v)}</div>`).join('')}<div>${esc(receipt.now)}</div></div><div class="rule"></div>${rows}<div class="rule"></div>${totals}${pay}<div class="foot center">Gracias por su visita.<br>Ticket interno de consumo. No sustituye factura ni DTE cuando corresponda.</div></div><script>window.onload=()=>{window.print()}<\/script></body></html>`)
 w.document.close()
}

const printReceipt=ticket=>printReceiptData(buildReceipt(ticket))

const ensurePaymentPreview=ticket=>{
 const ctx=paymentContext(ticket)
 if(!ctx)return
 let preview=ctx.body.querySelector('.barops-change-preview')
 if(!preview){preview=document.createElement('div');preview.className='barops-change-preview wide';ctx.body.append(preview)}
 const update=()=>{
  const current=paymentContext(ticket)
  if(!current)return
  const amount=Number(current.amount||0),due=Number(current.due||0)
  preview.className='barops-change-preview wide'
  if(!(amount>0)||!(due>=0)){preview.textContent='';preview.hidden=true;return}
  preview.hidden=false
  if(current.method==='cash'){
   if(amount>due+.004){preview.textContent=`CAMBIO ${money(amount-due)}`;preview.classList.add('good')}
   else if(amount<due-.004){preview.textContent=`PAGO PARCIAL · QUEDA ${money(due-amount)}`;preview.classList.add('partial')}
   else{preview.textContent='PAGO EXACTO';preview.classList.add('good')}
  }else if(amount>due+.004){preview.textContent='EL MONTO SUPERA EL SALDO';preview.classList.add('warn')}
  else if(amount<due-.004){preview.textContent=`PAGO PARCIAL · QUEDA ${money(due-amount)}`;preview.classList.add('partial')}
  else{preview.textContent='PAGO COMPLETO';preview.classList.add('good')}
 }
 if(ctx.methodSelect.dataset.changePreview!=='true'){
  ctx.methodSelect.dataset.changePreview='true'
  ctx.methodSelect.addEventListener('change',()=>window.requestAnimationFrame(update))
 }
 if(ctx.amountInput.dataset.changePreview!=='true'){
  ctx.amountInput.dataset.changePreview='true'
  ctx.amountInput.addEventListener('input',()=>window.requestAnimationFrame(update))
 }
 update()
}

const guardActionButton=button=>{
 if(!button||button.dataset.actionGuard==='true')return
 button.dataset.actionGuard='true'
 button.addEventListener('click',event=>{
  const now=Date.now(),last=Number(button.dataset.lastActionAt||0)
  if(now-last<900){event.preventDefault();event.stopImmediatePropagation();return}
  button.dataset.lastActionAt=String(now)
 },true)
}

const attachPaymentCapture=(ticket,button)=>{
 if(!button||button.dataset.paymentCapture==='true')return
 button.dataset.paymentCapture='true'
 button.addEventListener('click',event=>{
  const now=Date.now(),last=Number(button.dataset.lastActionAt||0)
  if(now-last<900){event.preventDefault();event.stopImmediatePropagation();return}
  button.dataset.lastActionAt=String(now)
  lastPaymentIntent=makePaymentIntent(ticket)
 },true)
}

const ensureLastReceiptButton=()=>{
 if(!lastReceipt)return
 const ticket=document.querySelector('.barops-ticket')
 if(!ticket||!ticket.querySelector('.barops-empty')||ticket.querySelector('.barops-last-receipt'))return
 const button=document.createElement('button')
 button.type='button'
 button.className='barops-last-receipt'
 button.textContent='🧾 IMPRIMIR ÚLTIMO TICKET'
 button.addEventListener('click',()=>printReceiptData(lastReceipt))
 ticket.append(button)
}

const enhanceNotice=()=>{
 const ok=document.querySelector('.barops-alert-ok span')
 if(ok&&lastPaymentIntent&&/pago registrado/i.test(ok.textContent||'')){
  lastReceipt=lastPaymentIntent.receipt
  const {change,remaining}=lastPaymentIntent.payment
  ok.textContent=change>0?`Pago registrado · CAMBIO ${money(change)}`:remaining>0?`Pago parcial registrado · Queda ${money(remaining)}`:'Pago registrado · Cuenta pagada'
  lastPaymentIntent=null
 }
 const error=document.querySelector('.barops-alert:not(.barops-alert-ok) span')
 if(error&&lastPaymentIntent)lastPaymentIntent=null
 ensureLastReceiptButton()
}

const enhanceTicket=()=>{
 const ticket=document.querySelector('.barops-ticket')
 if(!ticket){ensureLastReceiptButton();return}
 const head=ticket.querySelector('.barops-ticket-head')
 if(!head){ensureLastReceiptButton();return}

 const payTab=[...ticket.querySelectorAll('.barops-tool-tabs button')].find(btn=>/dividir\s*\/\s*cobrar|cobrar/i.test(btn.textContent||''))
 if(payTab){payTab.textContent='Cobrar / dividir';payTab.dataset.paymentShortcut='true'}

 const registerButton=[...ticket.querySelectorAll('.barops-tool-body button')].find(btn=>/registrar pago|cobrar/i.test(btn.textContent||''))
 if(registerButton){
  if(/registrar pago/i.test(registerButton.textContent||''))registerButton.textContent='COBRAR / REGISTRAR PAGO'
  attachPaymentCapture(ticket,registerButton)
 }
 ensurePaymentPreview(ticket)

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

const enhanceActionGuards=()=>{
 const buttons=[...document.querySelectorAll('.barops button')]
 buttons.filter(btn=>/abrir turno de caja|cerrar caja|guardar corte parcial|enviar a cocina|enviar a cocina\s*\/\s*barra/i.test(btn.textContent||'')).forEach(guardActionButton)
}

const enhance=()=>{
 enhanceTicket()
 enhanceNotice()
 enhanceActionGuards()
 const noOrder=document.querySelector('.barops-ticket .barops-empty p')
 if(noOrder&&/ticket aparecerá/i.test(noOrder.textContent||''))noOrder.textContent='Seleccioná una mesa o pedido para comenzar.'
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
 let queued=false
 const queue=()=>{if(queued)return;queued=true;window.requestAnimationFrame(()=>{queued=false;enhance()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});else queue()
 const observer=new MutationObserver(queue)
 observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true})
}
