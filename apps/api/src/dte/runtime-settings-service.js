import { getDteProductionPreflightStatus } from './config.js'
import { requireCompanyAccess, auditCompanyAction, COMPANY_ROLES } from '../security/company-access.js'

function forbidden(message, code = 'DTE_ADMIN_REQUIRED') {const error=new Error(message);error.statusCode=403;error.code=code;return error}
async function assertCompanyIsNotDemo({ companyId, supabase }) {const {data,error}=await supabase.from('companies').select('demo_mode').eq('id',companyId).maybeSingle();if(error)throw error;if(data?.demo_mode){const e=new Error('ENTORNO DEMO: PRODUCCIÓN DTE no puede habilitarse. El ambiente fiscal debe permanecer en TEST.');e.statusCode=409;e.code='DEMO_PRODUCTION_BLOCKED';throw e}}

export async function getRuntimeSettings({ request, supabase, env = process.env }) {
 const companyId=request.query?.companyId||request.body?.companyId
 await requireCompanyAccess({request,supabase,companyId,allowedRoles:COMPANY_ROLES.ALL,operation:'consultar la configuración DTE',auditAction:'DTE_ACCESS_DENIED'})
 const {data,error}=await supabase.from('dte_runtime_settings').select('*').eq('company_id',companyId).maybeSingle();if(error)throw error
 const row=data||{company_id:companyId,environment:'test',production_enabled:false,production_approved:false}
 const {data:company,error:companyError}=await supabase.from('companies').select('demo_mode').eq('id',companyId).maybeSingle();if(companyError)throw companyError
 const demoMode=Boolean(company?.demo_mode),effectiveRow=demoMode?{...row,environment:'test',production_enabled:false,production_approved:false}:row
 const effectiveEnv={...env,DTE_ENVIRONMENT:effectiveRow.environment,DTE_ENABLE_PRODUCTION:effectiveRow.production_enabled?'true':'false',DTE_PRODUCTION_APPROVAL:effectiveRow.production_approved?'IDEALO_SV_PRODUCTION_APPROVED':''}
 return{companyId,environment:effectiveRow.environment,productionEnabled:Boolean(effectiveRow.production_enabled),productionApproved:Boolean(effectiveRow.production_approved),demoMode,approvedAt:demoMode?null:row.approved_at||null,updatedAt:row.updated_at||null,preflight:getDteProductionPreflightStatus(effectiveEnv)}
}

export async function updateRuntimeSettings({ request, supabase, env = process.env }) {
 const companyId=request.query?.companyId||request.body?.companyId
 const {user,role}=await requireCompanyAccess({request,supabase,companyId,allowedRoles:COMPANY_ROLES.ADMIN,operation:'modificar la configuración DTE',auditAction:'DTE_ACCESS_DENIED'})
 const {environment,productionEnabled,productionApproved,confirmation}=request.body||{}
 if(!['test','production'].includes(environment)){const e=new Error('Ambiente inválido.');e.statusCode=400;throw e}
 if(environment==='production'){await assertCompanyIsNotDemo({companyId,supabase});if(role!=='owner')throw forbidden('Solo el propietario de la empresa puede habilitar PRODUCCIÓN DTE.','DTE_OWNER_REQUIRED');if(confirmation!=='ACTIVAR PRODUCCION DTE'){const e=new Error('Para seleccionar PRODUCCIÓN debes escribir exactamente: ACTIVAR PRODUCCION DTE');e.statusCode=409;throw e}if(productionEnabled!==true||productionApproved!==true){const e=new Error('PRODUCCIÓN requiere habilitación y aprobación explícita.');e.statusCode=409;throw e}}
 const isProduction=environment==='production',payload={company_id:companyId,environment,production_enabled:isProduction,production_approved:isProduction,approved_at:isProduction?new Date().toISOString():null,approved_by:isProduction?user.id:null,updated_at:new Date().toISOString(),updated_by:user.id}
 const {error}=await supabase.from('dte_runtime_settings').upsert(payload,{onConflict:'company_id'});if(error)throw error
 await auditCompanyAction({supabase,companyId,userId:user.id,action:'DTE_SETTINGS_UPDATED',detail:{environment,production_enabled:isProduction,role}})
 request.query={...(request.query||{}),companyId};return getRuntimeSettings({request,supabase,env})
}

export async function buildCompanyDteEnv({ companyId, supabase, env = process.env }) {const {data,error}=await supabase.from('dte_runtime_settings').select('environment, production_enabled, production_approved').eq('company_id',companyId).maybeSingle();if(error)throw error;const row=data||{environment:'test',production_enabled:false,production_approved:false};return{...env,DTE_ENVIRONMENT:row.environment,DTE_ENABLE_PRODUCTION:row.production_enabled?'true':'false',DTE_PRODUCTION_APPROVAL:row.production_approved?'IDEALO_SV_PRODUCTION_APPROVED':''}}
