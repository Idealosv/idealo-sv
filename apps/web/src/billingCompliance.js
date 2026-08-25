const UUID_V4_UPPER=/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/
const CONTROL=/^DTE-(01|03|04|05|06|07|08|09|11|14)-[A-Z]\d{3}P\d{3}-\d{15}$/
export const SUPPORTED_DTE_TYPES=['01','03','04','05','06','07','08','09','11','14']
export const FINAL_DTE_STATES=new Set(['PROCESSED','REJECTED','INVALIDATED'])

export function normalizeMhEnvironment(value){const raw=String(value||'').trim().toLowerCase();if(raw==='test'||raw==='00')return'00';if(raw==='production'||raw==='01')return'01';return String(value||'').trim()}
export function normalizeGenerationCode(value){return String(value||'').trim().toUpperCase()}
export function mhEnvironmentLabel(value){const normalized=normalizeMhEnvironment(value);return normalized==='01'?'PRODUCCIÓN':normalized==='00'?'PRUEBAS':'SIN DEFINIR'}
export function isFiscalImmutable(row){return row?.status==='PROCESSED'||Boolean(row?.mh_receipt_seal)}
export function hasMhAcceptanceEvidence(row){return Boolean(row?.mh_receipt_seal)&&row?.status==='PROCESSED'}

export function inspectDte(row){
  const payload=row?.dte_payload||{}
  const id=payload.identificacion||{}
  const issues=[]
  const warnings=[]
  const type=String(row?.dte_type||id.tipoDte||'')
  const environment=normalizeMhEnvironment(row?.environment||id.ambiente||'')
  const payloadEnvironment=normalizeMhEnvironment(id.ambiente||'')
  const storedGeneration=String(row?.generation_code||'').trim()
  const payloadGeneration=String(id.codigoGeneracion||'').trim()
  const generation=normalizeGenerationCode(payloadGeneration||storedGeneration)
  const control=String(row?.control_number||id.numeroControl||'')
  if(!SUPPORTED_DTE_TYPES.includes(type))issues.push('Tipo DTE fuera del catálogo controlado')
  if(environment!=='00'&&environment!=='01')issues.push('Ambiente MH inválido o ausente')
  if(generation&&!UUID_V4_UPPER.test(generation))issues.push('Código de generación no es UUID v4 válido')
  if(payloadGeneration&&payloadGeneration!==normalizeGenerationCode(payloadGeneration))issues.push('Código de generación del payload no está serializado en mayúsculas')
  if(control&&!CONTROL.test(control))issues.push('Número de control no cumple el patrón DTE esperado')
  if(id.tipoDte&&String(id.tipoDte)!==type)issues.push('Tipo DTE no coincide entre registro e identificación')
  if(payloadEnvironment&&payloadEnvironment!==environment)issues.push('Ambiente no coincide entre registro e identificación')
  if(payloadGeneration&&storedGeneration&&normalizeGenerationCode(payloadGeneration)!==normalizeGenerationCode(storedGeneration))issues.push('Código de generación no coincide con el payload')
  if(id.numeroControl&&String(id.numeroControl)!==control)issues.push('Número de control no coincide con el payload')
  if(row?.status==='PROCESSED'&&!row?.mh_receipt_seal)issues.push('Marcado procesado sin sello de recepción MH')
  if(row?.mh_receipt_seal&&row?.status!=='PROCESSED')warnings.push('Existe sello MH pero el estado local no es PROCESSED')
  if(environment==='01'&&!generation)issues.push('Documento de producción sin código de generación')
  if(environment==='01'&&!control)issues.push('Documento de producción sin número de control')
  if(type==='03'){
    const receptor=payload.receptor||{}
    if(!receptor.nit)issues.push('DTE-03 sin NIT del receptor')
    if(!receptor.nrc)issues.push('DTE-03 sin NRC del receptor')
    if(!receptor.nombre)issues.push('DTE-03 sin nombre del receptor')
  }
  if(type==='01'&&!payload.receptor)warnings.push('DTE-01 sin receptor identificado: permitido solo cuando las reglas aplicables lo permitan')
  const total=Number(payload?.resumen?.totalPagar??payload?.resumen?.montoTotalOperacion??0)
  if(!Number.isFinite(total)||total<0)issues.push('Total fiscal inválido')
  if(!Array.isArray(payload?.cuerpoDocumento)||payload.cuerpoDocumento.length===0)warnings.push('Documento sin cuerpo cargado en la copia local')
  return {ok:issues.length===0,issues,warnings,type,environment,generation,total,immutable:isFiscalImmutable(row),accepted:hasMhAcceptanceEvidence(row)}
}

export function billingComplianceMetrics(rows=[]){
  const result={total:rows.length,accepted:0,rejected:0,draft:0,production:0,test:0,withSeal:0,critical:0,warnings:0,amountAccepted:0}
  rows.forEach(row=>{const check=inspectDte(row);if(row.status==='PROCESSED')result.accepted++;if(row.status==='REJECTED')result.rejected++;if(row.status==='DRAFT')result.draft++;if(check.environment==='01')result.production++;if(check.environment==='00')result.test++;if(row.mh_receipt_seal)result.withSeal++;if(check.issues.length)result.critical++;if(check.warnings.length)result.warnings++;if(check.accepted)result.amountAccepted+=check.total})
  return result
}

export function canMutateFiscalDocument(row){return !isFiscalImmutable(row)}
