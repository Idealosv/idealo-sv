const PRODUCT_MODULE = '.products360-simple'
const EDITOR = '.products360-editor'

function setEditorVisible(module, visible) {
  const editor = module?.querySelector(EDITOR)
  if (!editor) return
  editor.hidden = !visible
  editor.setAttribute('aria-hidden', visible ? 'false' : 'true')
  module.classList.toggle('product-editor-open', visible)
}

function initializeModule(module) {
  if (!module || module.dataset.productFormGate === 'ready') return
  module.dataset.productFormGate = 'ready'
  const editing = module.querySelector('.products360-editor-head-simple small')?.textContent?.trim() === 'EDITANDO'
  setEditorVisible(module, editing)
}

function closeAfterSuccessfulSave(module) {
  if (!module) return
  const feedback = module.querySelector('.feedback.success')
  const text = feedback?.textContent?.trim() || ''
  const saved = text.startsWith('Producto creado correctamente') || text.startsWith('Producto actualizado correctamente')
  if (!saved || module.dataset.lastProductSaveMessage === text) return
  module.dataset.lastProductSaveMessage = text
  setEditorVisible(module, false)
}

function scan() {
  document.querySelectorAll(PRODUCT_MODULE).forEach(module => {
    initializeModule(module)
    closeAfterSuccessfulSave(module)
  })
}

document.addEventListener('click', event => {
  const module = event.target.closest(PRODUCT_MODULE)
  if (!module) return

  if (event.target.closest('.products360-hero-actions button')) {
    module.dataset.lastProductSaveMessage = ''
    requestAnimationFrame(() => setEditorVisible(module, true))
    return
  }

  if (event.target.closest('.product360-row')) {
    module.dataset.lastProductSaveMessage = ''
    requestAnimationFrame(() => setEditorVisible(module, true))
  }
})

new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
scan()
