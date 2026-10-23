export const PRESTADITOS_FREE_QA_CASES=[
 {
  key:'QA-10',
  investor:{id:'qa-i10',investor_code:'QA-INV-10',first_names:'Ana Lucía',last_names:'Prueba Diez',dui:'90000001-1',status:'ACTIVE'},
  application:{id:'qa-a10',application_code:'QA-SOL-10',status:'ACTIVE',requested_amount:2000,approved_amount:2000,requested_term_months:12,approved_term_months:12},
  investment:{id:'qa-n10',investment_code:'QA-INVEST-10',principal:2000,term_months:12,agreed_return_rate:10,return_rate_basis:'ANNUAL',status:'MATURED'},
  contract:{id:'qa-c10',contract_code:'QA-CTR-10',return_rate_percent:10,rate_basis:'ANNUAL',status:'SIGNED',signed_document_id:'qa-doc-contract-10'},
  payments:[
   {id:'qa-p10-y',payment_code:'QA-PAG-Y10',payment_type:'YIELD',amount:200,status:'POSTED'},
   {id:'qa-p10-c',payment_code:'QA-PAG-C10',payment_type:'CAPITAL_RETURN',amount:2000,status:'POSTED'},
  ],
  renewal:{id:'qa-r10',renewal_code:'QA-REN-10',decision_type:'WITHDRAW',status:'EXECUTED'},
  expected:{annual_gain:200,capital_returned:2000,yield_paid:200,ending_capital:0,outcome:'CLOSED'},
 },
 {
  key:'QA-12',
  investor:{id:'qa-i12',investor_code:'QA-INV-12',first_names:'Carlos David',last_names:'Prueba Doce',dui:'90000002-2',status:'ACTIVE'},
  application:{id:'qa-a12',application_code:'QA-SOL-12',status:'ACTIVE',requested_amount:7500,approved_amount:7500,requested_term_months:12,approved_term_months:12},
  investment:{id:'qa-n12',investment_code:'QA-INVEST-12',principal:7500,term_months:12,agreed_return_rate:12,return_rate_basis:'ANNUAL',status:'RENEWED'},
  contract:{id:'qa-c12',contract_code:'QA-CTR-12',return_rate_percent:12,rate_basis:'ANNUAL',status:'SIGNED',signed_document_id:'qa-doc-contract-12'},
  payments:[
   {id:'qa-p12-y',payment_code:'QA-PAG-Y12',payment_type:'YIELD',amount:900,status:'POSTED'},
  ],
  renewal:{id:'qa-r12',renewal_code:'QA-REN-12',decision_type:'RENEW_CAPITAL',status:'EXECUTED',successor_investment_id:'qa-n12b'},
  successor:{id:'qa-n12b',investment_code:'QA-INVEST-12B',principal:7500,term_months:12,agreed_return_rate:12,return_rate_basis:'ANNUAL',status:'ACTIVE'},
  expected:{annual_gain:900,capital_returned:0,yield_paid:900,ending_capital:7500,outcome:'RENEWED'},
 },
 {
  key:'QA-15',
  investor:{id:'qa-i15',investor_code:'QA-INV-15',first_names:'María Fernanda',last_names:'Prueba Quince',dui:'90000003-3',status:'ACTIVE'},
  application:{id:'qa-a15',application_code:'QA-SOL-15',status:'ACTIVE',requested_amount:15000,approved_amount:15000,requested_term_months:12,approved_term_months:12},
  investment:{id:'qa-n15',investment_code:'QA-INVEST-15',principal:15000,term_months:12,agreed_return_rate:15,return_rate_basis:'ANNUAL',status:'CLOSED'},
  contract:{id:'qa-c15',contract_code:'QA-CTR-15',return_rate_percent:15,rate_basis:'ANNUAL',status:'SIGNED',signed_document_id:'qa-doc-contract-15'},
  payments:[
   {id:'qa-p15-y',payment_code:'QA-PAG-Y15',payment_type:'YIELD',amount:2250,status:'POSTED'},
   {id:'qa-p15-c',payment_code:'QA-PAG-C15',payment_type:'CAPITAL_RETURN',amount:15000,status:'POSTED'},
  ],
  renewal:{id:'qa-r15',renewal_code:'QA-REN-15',decision_type:'WITHDRAW',status:'EXECUTED'},
  expected:{annual_gain:2250,capital_returned:15000,yield_paid:2250,ending_capital:0,outcome:'CLOSED'},
 },
]

export const summarizeFreeQaCase=qa=>{
 const yieldPaid=qa.payments.filter(x=>x.status==='POSTED'&&x.payment_type==='YIELD').reduce((s,x)=>s+Number(x.amount||0),0)
 const capitalReturned=qa.payments.filter(x=>x.status==='POSTED'&&x.payment_type==='CAPITAL_RETURN').reduce((s,x)=>s+Number(x.amount||0),0)
 const annualGain=Number(qa.investment.principal||0)*Number(qa.investment.agreed_return_rate||0)/100
 const endingCapital=Math.max(0,Number(qa.successor?.principal??qa.investment.principal)-capitalReturned)
 return {annualGain,yieldPaid,capitalReturned,endingCapital}
}
