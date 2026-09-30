export const PRESTADITOS_E2E_SCENARIOS=[
 {
  id:'demo-10',
  investor:{code:'DEMO-INV-10',name:'Ana Lucía Prueba',dui:'90000001-1'},
  amount:2000,
  rate:10,
  termMonths:12,
  annualReference:200,
  path:[
   ['INVESTOR','Expediente registrado','DONE'],
   ['APPLICATION','Solicitud enviada','DONE'],
   ['APPROVAL','Solicitud aprobada','DONE'],
   ['FUNDS','Fondos recibidos','DONE'],
   ['INVESTMENT','Inversión formalizada','DONE'],
   ['CONTRACT','Contrato preparado y firmado','DONE'],
   ['PAYMENT','Rendimiento de demostración registrado','DONE'],
   ['MATURITY','Vencimiento controlado','DONE'],
   ['WITHDRAWAL','Capital devuelto y retiro finalizado','DONE'],
   ['CLOSEOUT','Incluida en cierre mensual','DONE'],
  ],
 },
 {
  id:'demo-12',
  investor:{code:'DEMO-INV-12',name:'Brenda Sofía Ejemplo',dui:'90000002-2'},
  amount:7500,
  rate:12,
  termMonths:12,
  annualReference:900,
  path:[
   ['INVESTOR','Expediente registrado','DONE'],
   ['APPLICATION','Solicitud enviada','DONE'],
   ['APPROVAL','Solicitud aprobada','DONE'],
   ['FUNDS','Fondos recibidos','DONE'],
   ['INVESTMENT','Inversión formalizada','DONE'],
   ['CONTRACT','Contrato preparado y firmado','DONE'],
   ['PAYMENT','Rendimiento de demostración registrado','DONE'],
   ['MATURITY','Vencimiento controlado','DONE'],
   ['RENEWAL','Renovación ejecutada con inversión sucesora','DONE'],
   ['CLOSEOUT','Incluida en cierre mensual','DONE'],
  ],
 },
 {
  id:'demo-15',
  investor:{code:'DEMO-INV-15',name:'Carlos Andrés Demostración',dui:'90000003-3'},
  amount:15000,
  rate:15,
  termMonths:12,
  annualReference:2250,
  path:[
   ['INVESTOR','Expediente registrado','DONE'],
   ['APPLICATION','Solicitud enviada','DONE'],
   ['APPROVAL','Solicitud aprobada','DONE'],
   ['FUNDS','Fondos recibidos','DONE'],
   ['INVESTMENT','Inversión formalizada','DONE'],
   ['CONTRACT','Contrato preparado y firmado','DONE'],
   ['PAYMENT','Rendimiento de demostración registrado','DONE'],
   ['MATURITY','Vencimiento controlado','DONE'],
   ['WITHDRAWAL','Capital devuelto y no renovación','DONE'],
   ['CLOSEOUT','Incluida en cierre mensual','DONE'],
  ],
 },
]

export const validatePrestaditosDemoScenario=scenario=>{
 const errors=[]
 const expectedAnnual=Number(scenario.amount||0)*Number(scenario.rate||0)/100
 if(![10,12,15].includes(Number(scenario.rate)))errors.push('Tasa fuera de 10%, 12% o 15%.')
 if(Number(scenario.termMonths)!==12)errors.push('El escenario demo integral debe ser de 12 meses para no asumir prorrateo.')
 if(Math.abs(expectedAnnual-Number(scenario.annualReference||0))>0.005)errors.push('Referencia anual inconsistente.')
 const required=['INVESTOR','APPLICATION','APPROVAL','FUNDS','INVESTMENT','CONTRACT','PAYMENT','MATURITY','CLOSEOUT']
 for(const code of required)if(!scenario.path.some(step=>step[0]===code))errors.push('Falta paso '+code+'.')
 return errors
}
