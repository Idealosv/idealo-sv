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
  tax.readOnly=true
  tax.tabIndex=-1
  tax.title='Se calcula automáticamente según el tratamiento de IVA seleccionado.'

  const subtotalLabel=subtotal.closest('label')
  const modeLabel=document.createElement('label')
  modeLabel.className='field purchase-tax-mode'
  modeLabel.innerHTML='<span>Tratamiento IVA *</span><select><option value="PLUS">Precio sin IVA + 13%</option><option value="INCLUDED">Precio ya incluye IVA</option><option value="EXEMPT">Sin IVA / exento</option></select><small>Selecciona cómo viene el precio de la compra.</small>'
  subtotalLabel?.parentElement?.insertBefore(modeLabel,subtotalLabel)
  const mode=modeLabel.querySelector('select')

  const help=document.createElement('div')
  help.className='purchase-tax-summary'
  help.innerHTML='<span>Subtotal <strong>$0.00</strong></span><span>IVA <strong>$0.00</strong></span><span>Total <strong>$0.00</strong></span>'
  const actions=form.querySelector('.form-actions')
  actions?.parentElement?.insertBefore(help,actions)
  const summaryValues=help.querySelectorAll('strong')

  const render=(base,iva,grand)=>{
    summaryValues[0].textContent=`$${round2(base).toFixed(2)}`
    summaryValues[1].textContent=`$${round2(iva).toFixed(2)}`
    summaryValues[2].textContent=`$${round2(grand).toFixed(2)}`
  }

  const calculateFromSubtotal=()=>{
    const base=Number(subtotal.value||0)
    if(mode.value==='EXEMPT'){
      setNativeValue(tax,round2(0));setNativeValue(total,round2(base));render(base,0,base);return
    }
    if(mode.value==='PLUS'){
      const iva=round2(base*IVA_RATE),grand=round2(base+iva)
      setNativeValue(tax,iva);setNativeValue(total,grand);render(base,iva,grand)
    }
  }

  const calculateFromTotal=()=>{
    if(mode.value!=='INCLUDED')return
    const grand=Number(total.value||0)
    const base=round2(grand/(1+IVA_RATE)),iva=round2(grand-base)
    setNativeValue(subtotal,base);setNativeValue(tax,iva);render(base,iva,grand)
  }

  const applyMode=()=>{
    subtotal.readOnly=mode.value==='INCLUDED'
    total.readOnly=mode.value!=='INCLUDED'
    subtotal.title=mode.value==='INCLUDED'?'Se calcula a partir del total con IVA incluido.':''
    total.title=mode.value==='INCLUDED'?'Escribe el total pagado; el sistema separará subtotal e IVA.':'Se calcula automáticamente.'
    if(mode.value==='INCLUDED')calculateFromTotal();else calculateFromSubtotal()
  }

  subtotal.addEventListener('input',calculateFromSubtotal)
  total.addEventListener('input',calculateFromTotal)
  mode.addEventListener('change',applyMode)
  applyMode()
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
