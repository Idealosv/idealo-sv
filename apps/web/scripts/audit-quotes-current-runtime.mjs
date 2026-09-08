import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../src')
const launcher = await readFile(resolve(src, 'CommercialLauncher.jsx'), 'utf8')
const quotes = await readFile(resolve(src, 'QuotesQuickModule.jsx'), 'utf8')

const failures = []
const expect = (source, token, message) => { if (!source.includes(token)) failures.push(message) }
const reject = (source, token, message) => { if (source.includes(token)) failures.push(message) }

expect(launcher, "supabase.rpc('get_my_companies')", 'Comercial debe resolver la misma empresa canónica que Workspace.')
expect(launcher, "window.__IDEALO_ACTIVE_COMPANY__ = row", 'Comercial debe publicar la empresa activa resuelta.')
expect(launcher, 'quotesRefreshKey', 'Cotizaciones debe forzar una recarga al abrirse de nuevo.')
expect(launcher, 'key={`${company.id}-${quotesRefreshKey}`}', 'El runtime de Cotizaciones debe remontarse por empresa/recarga.')

expect(quotes, "supabase.from('quotes').select('*').eq('company_id', company.id)", 'La lista debe consultar cotizaciones por empresa sin depender de un join opcional.')
expect(quotes, 'Cargando cotizaciones…', 'La lista debe distinguir carga de un estado realmente vacío.')
expect(quotes, 'No pudimos cargar las cotizaciones.', 'La lista debe mostrar error real en vez de un falso vacío.')
expect(quotes, "quotes.length ? 'No encontramos coincidencias.' : 'Todavía no hay cotizaciones.'", 'La búsqueda sin coincidencias debe distinguirse de una empresa sin cotizaciones.')
expect(quotes, "supabase.rpc('save_quote_quick'", 'El guardado debe permanecer transaccional mediante save_quote_quick.')
expect(quotes, "setForm((current) => ({ ...current, ...data, id: data.id", 'Después de guardar, la cotización debe conservar el id devuelto y no quedar como nueva.')
expect(quotes, "client.status !== 'active'", 'No se debe crear una cotización nueva para un cliente desactivado.')
expect(quotes, "T17:00:00-06:00", 'La fecha de entrega hacia OT debe conservar el huso horario de El Salvador.')
expect(quotes, "timeZone: 'America/El_Salvador'", 'Las fechas predeterminadas deben calcularse en hora de El Salvador.')
expect(quotes, "supabase.rpc('transition_quote_status'", 'Los cambios de estado deben pasar por el RPC controlado.')
expect(quotes, "supabase.rpc('convert_quote_to_work_order'", 'La conversión a OT debe pasar por el RPC idempotente.')
reject(quotes, ".from('quotes').insert(", 'El runtime actual no debe insertar cabecera de cotización directamente desde el navegador.')
reject(quotes, ".from('quote_items').insert(", 'El runtime actual no debe guardar partidas fuera de la transacción de la cotización.')

const newQuoteLabels = (quotes.match(/\+ Nueva cotización/g) || []).length
if (newQuoteLabels !== 1) failures.push(`La vista principal debe tener un solo CTA “+ Nueva cotización”; encontrados: ${newQuoteLabels}.`)

if (failures.length) {
  console.error('\nAuditoría runtime actual de Cotizaciones falló:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Auditoría runtime actual de Cotizaciones OK: empresa, carga, vacío real, búsqueda, guardado transaccional, estados, OT y fechas protegidos.')
