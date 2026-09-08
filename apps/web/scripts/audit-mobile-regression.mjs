import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
const json = rel => JSON.parse(read(rel))
const checks = []

function expect(name, condition, detail='') {
  if (!condition) throw new Error(`FAIL móvil: ${name}${detail ? ` · ${detail}` : ''}`)
  checks.push(name)
}
function has(source, ...tokens) { return tokens.every(token => source.includes(token)) }

const manifest = json('public/manifest.webmanifest')
const capacitor = json('capacitor.config.json')
const sw = read('public/sw.js')
const main = read('src/main.jsx')
const runtime = read('src/MobileRuntimeGuard.jsx')
const app = read('src/MobileAppHost.jsx')
const dte = read('src/MobileDteHost.jsx')
const evidence = read('src/MobileEvidenceSheet.jsx')
const offline = read('src/mobileOffline.js')
const health = read('src/MobileHealthGuard.jsx')
const nativeCss = read('src/mobile-native-shell.css')
const workflow = fs.readFileSync(path.resolve(root, '../../.github/workflows/android-apk.yml'), 'utf8')

expect('PWA abre directamente /mobile', manifest.start_url === '/mobile')
expect('PWA funciona como aplicación standalone', manifest.display === 'standalone')
expect('PWA mantiene alcance del ERP', manifest.scope === '/')

expect('Android usa identificador oficial', capacitor.appId === 'sv.idealo.erp')
expect('Capacitor compila desde dist', capacitor.webDir === 'dist')
expect('Android usa esquema HTTPS', capacitor.server?.androidScheme === 'https')
expect('Android bloquea contenido mixto', capacitor.android?.allowMixedContent === false)
expect('WebView debugging desactivado', capacitor.android?.webContentsDebuggingEnabled === false)

expect('Runtime detecta Android/iPhone', has(runtime, 'Android|iPhone|iPad|iPod|Mobile'))
expect('Runtime detecta Capacitor nativo', has(runtime, 'window.Capacitor?.isNativePlatform', "getPlatform?.()==='android'"))
expect('Runtime activa /mobile y standalone', has(runtime, "window.location.pathname==='/mobile'", 'isStandalone()'))
expect('Runtime aplica clase Android nativa', runtime.includes('idealo-native-android'))
expect('Runtime móvil está montado', has(main, "import MobileRuntimeGuard", '<MobileRuntimeGuard/>'))
expect('Host móvil está montado', has(main, "import MobileAppHost", '<MobileAppHost/>'))
expect('DTE móvil está montado', has(main, "import MobileDteHost", '<MobileDteHost/>'))
expect('Guardas de salud/ambiente/actualización están montadas', has(main, '<MobileDteEnvironmentGuard/>', '<MobileHealthGuard/>', '<MobileUpdateNotice/>'))

expect('Shell usa viewport dinámico', nativeCss.includes('100dvh'))
expect('Shell respeta safe areas', nativeCss.includes('env(safe-area-inset-bottom)'))
expect('Scroll táctil iOS habilitado', nativeCss.includes('-webkit-overflow-scrolling:touch'))
expect('Diseño Android nativo tiene scope propio', nativeCss.includes('html.idealo-native-android'))
expect('Modo standalone tiene estilos propios', nativeCss.includes('@media(display-mode:standalone)'))

expect('Service Worker usa caché versionada', /const CACHE='idealo-mobile-v\d+'/.test(sw))
expect('Service Worker precarga /mobile', sw.includes("'/mobile'"))
expect('Service Worker activa versión nueva', has(sw, 'self.skipWaiting()', 'self.clients.claim()'))
expect('Service Worker elimina cachés viejas', has(sw, 'caches.keys()', 'caches.delete(key)'))
expect('Navegación es network-first con fallback offline', has(sw, "request.mode==='navigate'", 'fetch(request)', 'caches.match'))
expect('Push vuelve a /mobile', has(sw, "data.url||'/mobile'", "clients.openWindow(target)"))
expect('Registro SW evita caché del propio worker', main.includes("register('/sw.js',{updateViaCache:'none'})"))
expect('Cambio de controlador refresca una sola vez', has(main, 'controllerchange', 'idealo-sw-controller-reload'))

expect('App escucha pérdida/recuperación de red', has(app, "addEventListener('online'", "addEventListener('offline'"))
expect('App mantiene cola offline', has(app, 'enqueueOffline', 'listOffline', 'removeOffline', 'offlineCount'))
expect('App sincroniza estado de OT offline', has(app, "kind:'order_status'", "item.kind==='order_status'"))
expect('App sincroniza agenda offline', has(app, "kind:'event_complete'", "item.kind==='event_complete'"))
expect('App sincroniza evidencia offline', has(app, "item.kind==='evidence'", "storage.from('work-order-evidence').upload"))
expect('App protege escritura por rol', has(app, "role&&role!=='viewer'", "['owner','admin'].includes(role)"))
expect('App carga clientes y cotizaciones', has(app, "from('clients')", "from('quotes')"))
expect('App incluye navegación inferior', has(app, 'mobile-bottom-nav', "const tabs=['Inicio','Trabajo','Clientes','Más']"))

expect('Evidencia usa cámara/galería del dispositivo', has(evidence, 'accept="image/*"', 'capture="environment"'))
expect('Evidencia solicita GPS', has(evidence, 'navigator.geolocation', 'getCurrentPosition'))
expect('Evidencia soporta firma táctil', has(evidence, 'onPointerDown', 'onTouchStart', "toDataURL('image/png')"))
expect('Evidencia se puede encolar offline', has(evidence, "if(!navigator.onLine)", "kind:'evidence'"))
expect('Almacén offline usa IndexedDB', has(offline, 'indexedDB.open', 'openDb'))

expect('DTE móvil soporta 01 y 03', has(dte, "dteType:'01'", "form.dteType==='03'"))
expect('DTE móvil exige conexión', dte.includes("if(!navigator.onLine)return setError('La emisión DTE requiere conexión.')"))
expect('DTE móvil restringe emisión a owner/admin', has(dte, "['owner','admin'].includes(role)", 'Solo Propietario/Administrador'))
expect('DTE móvil crea, firma y transmite con backend existente', has(dte, "'/api/dte/invoices'", "'/api/dte/sign-test'", "'/api/dte/transmit-test'"))
expect('DTE móvil permite compartir', has(dte, 'navigator.share', 'navigator.clipboard.writeText'))
expect('DTE móvil permite imprimir/guardar PDF', has(dte, 'window.print()', 'Imprimir / Guardar PDF'))

expect('Guard de salud observa red, PWA y errores', has(health, 'navigator.onLine', 'navigator.serviceWorker?.controller', 'unhandledrejection'))
expect('Guard de salud adapta visualViewport', has(health, 'window.visualViewport?.height', '--mobile-safe-height'))

expect('Workflow Android compila frontend', workflow.includes('npm --workspace apps/web run build'))
expect('Workflow Android sincroniza Capacitor', workflow.includes('npx cap sync android'))
expect('Workflow Android compila APK', workflow.includes('./gradlew assembleDebug'))
expect('Workflow Android publica artefacto', workflow.includes('actions/upload-artifact@v4'))

console.log(`OK regresión móvil automática: ${checks.length} controles PASS (Android + PWA/iPhone contracts).`)
console.log('NOTA: cámara/GPS/firma/share/instalación física requieren prueba final en dispositivos reales.')
