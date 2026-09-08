export async function seedAgencyDemo({supabase,companyId,createdBy}){
 if(!companyId||!createdBy)throw new Error('La precarga DEMO requiere empresa y usuario responsable.')
 const {data,error}=await supabase.rpc('seed_agency_demo_data',{p_company_id:companyId,p_created_by:createdBy})
 if(error)throw error
 return data||{company_id:companyId}
}
