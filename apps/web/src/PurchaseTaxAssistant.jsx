import {useEffect} from 'react'

const IVA_RATE=0.13
const round2=(n)=>Math.round((Number(n||0)+Number.EPSILON)*100)/100
const setNativeValue=(input,value)=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set
  setter?.call(input,String(value))
  input.dispatchEvent(new Event('input',{bubbles:true}))
  input.dispatchEvent(new Event('change',{bubbles:true}))
}

function enhancePurchaseForm(form){
  if(!form||form.dataset.taxAssistant==='1')return
  const labels=[...form.querySelectorAll('label')]
  const findInput=(text)=>labels.find(l=>l.querySelector('span')?.textContent?.trim().startsWith(text))?.querySelector('input')
  const subtotal=findInput('Subtotal')
  const tax=findInput('IVA / impuesto')
  const total=findInput('Total')
  if(!subtotal||!tax||!total)return

  form.dataset.taxAssistant='1'
  const subtotalLabel=subtotal.closest('label')
  const taxLabel=tax.closest('label')
  const totalLabel=total.closest('label')
  ;[subtotalLabel,taxLabel,totalLabel].forEach(label=>label?.classList.add('purchase-tax-hidden-field'))
  tax.readOnly=true

  const simple=document.createElement('div')
  simple.className='purchase-tax-simple form-span-2'
  simple.innerHTML=`
    <label class="field purchase-amount-field">
      <span>Monto de la compra *</span>
      <input class="purchase-simple-amount" type="number" min="0.01" step="0.01" placeholder="Ej. 9.00" required>
    </label>
    <div class="purchase-iva-choice" role="group" aria-label="Cómo viene el IVA">
      <span>¿Cómo viene el precio?</span>
      <div>
        <button type="button" data-runtime-action="set-tax-mode" data-mode="INCLUDED" class="active">Ya incluye IVA</button>
        <button type="button" data-runtime-action="set-tax-mode" data-mode="PLUS">Agregar IVA</button>
        <button type="button" data-runtime-action="set-tax-mode" data-mode="EXEMPT">Sin IVA</button>
      </div>
    </div>`
  subtotalLabel?.parentElement?.insertBefore(simple,subtotalLabel)
  const amount=simple.querySelector('.purchase-simple-amount')
  const buttons=[...simple.querySelectorAll('[data-runtime-action="set-tax-mode"][data-mode]')]
  let mode='INCLUDED'

  const help=document.createElement('div')
  help.className='purchase-tax-summary form-span-2'
  help.innerHTML='<span>Base <strong>$0.00</strong></span><span>IVA <strong>$0.00</strong></span><span>Total a registrar <strong>$0.00</strong></span>'
  subtotalLabel?.parentElement?.insertBefore(help,subtotalLabel)
  const summaryValues=help.querySelectorAll('strong')

  const render=(base,iva,grand)=>{
    summaryValues[0].textContent=`$${round2(base).toFixed(2)}`
    summaryValues[1].textContent=`$${round2(iva).toFixed(2)}`
    summaryValues[2].textContent=`$${round2(grand).toFixed(2)}`
  }

  const calculate=()=>{
    const entered=round2(amount.value||0)
    let base=entered,iva=0,grand=entered
    if(mode==='INCLUDED'){
      grand=entered
      base=round2(grand/(1+IVA_RATE))
      iva=round2(grand-base)
    }else if(mode==='PLUS'){
      base=entered
      iva=round2(base*IVA_RATE)
      grand=round2(base+iva)
    }
    setNativeValue(subtotal,base)
    setNativeValue(tax,iva)
    setNativeValue(total,grand)
    render(base,iva,grand)
  }

  buttons.forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.mode
    buttons.forEach(item=>item.classList.toggle('active',item===button))
    calculate()
  }))
  amount.addEventListener('input',calculate)
  calculate()
}

export default function PurchaseTaxAssistant(){
  useEffect(()=>{
    const scan=()=>{
      document.querySelectorAll('form.panel').forEach(form=>{
        const title=form.querySelector('h3')?.textContent?.trim()
        if(title==='Materiales / tercerización')enhancePurchaseForm(form)
      })
    }
    scan()
    const observer=new MutationObserver(scan)
    observer.observe(document.body,{childList:true,subtree:true})
    return()=>observer.disconnect()
  },[])
  return null
}
