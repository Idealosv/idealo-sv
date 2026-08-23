import { useEffect } from 'react'

const makeToggle=(label,owner,className)=>{
  if(owner.querySelector(`:scope > .${className}`))return
  const button=document.createElement('button')
  button.type='button'
  button.className=`secondary-action form-advanced-toggle ${className}`
  button.textContent=label
  button.setAttribute('aria-expanded','false')
  button.addEventListener('click',()=>{
    const expanded=owner.classList.toggle('show-advanced-fields')
    button.setAttribute('aria-expanded',String(expanded))
    button.textContent=expanded?'Ocultar opciones avanzadas':label
  })
  owner.appendChild(button)
}

function simplifyQuoteItems(){document.querySelectorAll('.q360-item').forEach(item=>{const grid=item.querySelector(':scope > .form-grid');const head=item.querySelector(':scope > .q360-item-head');if(!grid||!head||item.dataset.formSimplified)return;item.dataset.formSimplified='1';grid.classList.add('simplified-quote-item-grid');makeToggle('Más opciones',head,'quote-item-advanced-toggle')})}
function simplifyQuoteDocument(){const card=document.querySelector('.q360-editor > .q360-card:not(.q360-items)');if(!card||card.dataset.formSimplified)return;const grid=card.querySelector('.form-grid');const heading=card.querySelector('.panel-heading');if(!grid||!heading)return;card.dataset.formSimplified='1';grid.classList.add('simplified-quote-document-grid');makeToggle('Datos comerciales avanzados',heading,'quote-document-advanced-toggle')}
function simplifyQuoteConditions(){const card=[...document.querySelectorAll('.q360-bottom-grid > .q360-card')].find(node=>node.textContent.includes('Condiciones comerciales'));if(!card||card.dataset.formSimplified)return;const grid=card.querySelector('.form-grid');const heading=card.querySelector('.panel-heading');if(!grid||!heading)return;card.dataset.formSimplified='1';grid.classList.add('simplified-quote-conditions-grid');makeToggle('Notas y condiciones avanzadas',heading,'quote-conditions-advanced-toggle')}
function simplifyBilling(){document.querySelectorAll('.billing-admin-tools[open]').forEach(details=>details.removeAttribute('open'))}
function scan(){simplifyQuoteDocument();simplifyQuoteItems();simplifyQuoteConditions();simplifyBilling()}

export default function FormSimplificationManager(){
  useEffect(()=>{
    let timers=[]
    const schedule=()=>{
      timers.forEach(window.clearTimeout)
      timers=[0,100,300].map(delay=>window.setTimeout(scan,delay))
    }
    const onClick=(event)=>{
      if(event.target.closest('.idealo-main-menu-item,.commercial-tabs button,.billing-nav-item,.erp-modal-close'))schedule()
    }
    schedule()
    window.addEventListener('idealo-module-change',schedule)
    document.addEventListener('click',onClick)
    return()=>{
      timers.forEach(window.clearTimeout)
      window.removeEventListener('idealo-module-change',schedule)
      document.removeEventListener('click',onClick)
    }
  },[])
  return null
}
