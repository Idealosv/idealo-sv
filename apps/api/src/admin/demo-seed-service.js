function first(rows){return Array.isArray(rows)&&rows.length?rows[0]:null}

async function findOne(query){const {data,error}=await query.limit(1);if(error)throw error;return first(data)}

async function ensureClient({supabase,companyId,createdBy,row}){
 const existing=await findOne(supabase.from('clients').select('id,name').eq('company_id',companyId).eq('email',row.email))
 if(existing)return existing
 const {data,error}=await supabase.from('clients').insert({...row,company_id:companyId,created_by:createdBy,status:'active',source:'DEMO'}).select('id,name').single()
 if(error)throw error
 return data
}

async function ensureProduct({supabase,companyId,row}){
 const existing=await findOne(supabase.from('finished_products').select('id,name,sale_price').eq('company_id',companyId).eq('sku',row.sku))
 if(existing)return existing
 const {data,error}=await supabase.from('finished_products').insert({...row,company_id:companyId}).select('id,name,sale_price').single()
 if(error)throw error
 return data
}

async function ensureQuote({supabase,companyId,row}){
 const existing=await findOne(supabase.from('quotes').select('id,client_id,title').eq('company_id',companyId).eq('reference',row.reference))
 if(existing)return existing
 const {data,error}=await supabase.from('quotes').insert({...row,company_id:companyId}).select('id,client_id,title').single()
 if(error)throw error
 return data
}

async function ensureQuoteItem({supabase,quoteId,row}){
 const existing=await findOne(supabase.from('quote_items').select('id').eq('quote_id',quoteId).eq('sku',row.sku))
 if(existing)return existing
 const {data,error}=await supabase.from('quote_items').insert({...row,quote_id:quoteId}).select('id').single()
 if(error)throw error
 return data
}

async function ensureWorkOrder({supabase,companyId,row}){
 const existing=await findOne(supabase.from('work_orders').select('id').eq('quote_id',row.quote_id))
 if(existing)return existing
 const {data,error}=await supabase.from('work_orders').insert({...row,company_id:companyId}).select('id').single()
 if(error)throw error
 return data
}

async function ensureWorkOrderItem({supabase,workOrderId,row}){
 const existing=await findOne(supabase.from('work_order_items').select('id').eq('work_order_id',workOrderId).eq('description',row.description))
 if(existing)return existing
 const {data,error}=await supabase.from('work_order_items').insert({...row,work_order_id:workOrderId}).select('id').single()
 if(error)throw error
 return data
}

export async function seedAgencyDemo({supabase,companyId,createdBy}){
 if(!companyId||!createdBy)throw new Error('La precarga DEMO requiere empresa y usuario responsable.')
 const now=new Date()
 const validUntil=new Date(now.getTime()+10*86400000).toISOString().slice(0,10)

 const cafe=await ensureClient({supabase,companyId,createdBy,row:{name:'[DEMO] Café Central',email:'compras@cafe-demo.example',phone:'7000-1001',notes:'Cliente ficticio para demostrar cotizaciones, producción y seguimiento.'}})
 const clinica=await ensureClient({supabase,companyId,createdBy,row:{name:'[DEMO] Clínica Sonrisa',email:'mercadeo@clinica-demo.example',phone:'7000-1002',notes:'Cliente ficticio para pruebas del ERP.'}})
 await ensureClient({supabase,companyId,createdBy,row:{name:'[DEMO] Constructora Norte',email:'proyectos@constructora-demo.example',phone:'7000-1003',notes:'Cliente ficticio para pruebas del ERP.'}})

 const lona=await ensureProduct({supabase,companyId,row:{name:'[DEMO] Banner lona 13 oz',sku:'DEMO-LONA-001',category:'Impresión gran formato',description:'Banner impreso con acabados básicos.',unit:'m²',sale_price:18,cost_estimate:8,design_included:true,requires_production:true,tags:['DEMO','LONA']}})
 await ensureProduct({supabase,companyId,row:{name:'[DEMO] Rótulo PVC 5 mm',sku:'DEMO-PVC-001',category:'Rotulación',description:'PVC impreso para señalización interior.',unit:'m²',sale_price:34,cost_estimate:16,design_included:true,requires_production:true,tags:['DEMO','PVC']}})
 const camisa=await ensureProduct({supabase,companyId,row:{name:'[DEMO] Camisa personalizada',sku:'DEMO-TEX-001',category:'Textil',description:'Camisa personalizada para marca o evento.',unit:'unidad',sale_price:12.5,cost_estimate:6.25,design_included:true,requires_production:true,tags:['DEMO','TEXTIL']}})
 await ensureProduct({supabase,companyId,row:{name:'[DEMO] Taza personalizada',sku:'DEMO-SUB-001',category:'Sublimación',description:'Taza promocional personalizada.',unit:'unidad',sale_price:7.5,cost_estimate:3.25,design_included:true,requires_production:true,tags:['DEMO','SUBLIMACION']}})

 const quote1=await ensureQuote({supabase,companyId,row:{client_id:cafe.id,status:'SENT',title:'[DEMO] Campaña apertura sucursal',reference:'DEMO-APERTURA-001',project_name:'Apertura Café Central',valid_until:validUntil,subtotal:216,discount:0,total:216,balance_amount:216,customer_notes:'Datos ficticios de demostración.',seller_user_id:createdBy,sent_at:now.toISOString(),tags:['DEMO']}})
 const quote2=await ensureQuote({supabase,companyId,row:{client_id:clinica.id,status:'APPROVED',title:'[DEMO] Uniformes promocionales',reference:'DEMO-UNIFORMES-001',project_name:'Jornada de salud',valid_until:validUntil,subtotal:250,discount:0,total:250,balance_amount:250,customer_notes:'Datos ficticios de demostración.',seller_user_id:createdBy,approved_at:now.toISOString(),tags:['DEMO']}})

 await ensureQuoteItem({supabase,quoteId:quote1.id,row:{product_id:lona.id,sku:'DEMO-LONA-001',category:'Impresión gran formato',description:'Banner de lona para fachada',quantity:12,unit:'m²',unit_price:18,line_total:216,unit_cost:8,cost_total:96,profit_total:120,margin_percent:55.56,design_included:true,requires_production:true}})
 await ensureQuoteItem({supabase,quoteId:quote2.id,row:{product_id:camisa.id,sku:'DEMO-TEX-001',category:'Textil',description:'Camisas personalizadas',quantity:20,unit:'unidad',unit_price:12.5,line_total:250,unit_cost:6.25,cost_total:125,profit_total:125,margin_percent:50,design_included:true,requires_production:true}})

 const workOrder=await ensureWorkOrder({supabase,companyId,row:{quote_id:quote2.id,client_id:clinica.id,status:'PRODUCTION',title:'[DEMO] Producción uniformes Clínica Sonrisa',due_at:new Date(now.getTime()+3*86400000).toISOString(),production_notes:'Orden ficticia precargada para demostrar el flujo de producción.',design_status:'APPROVED',production_started_at:now.toISOString(),progress_percent:40,total:250,tags:['DEMO']}})
 await ensureWorkOrderItem({supabase,workOrderId:workOrder.id,row:{product_id:camisa.id,description:'Camisas personalizadas',quantity:20,unit:'unidad',unit_price:12.5,line_total:250,specifications:'Diseño promocional ficticio para demostración.',sort_order:1}})

 const seededAt=new Date().toISOString()
 const {error:markError}=await supabase.from('companies').update({demo_seeded_at:seededAt}).eq('id',companyId)
 if(markError)throw markError
 return{company_id:companyId,seeded_at:seededAt,clients:3,products:4,quotes:2,work_orders:1}
}
