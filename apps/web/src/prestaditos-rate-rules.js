export const ANNUAL_RATE_EXAMPLE_TIERS=[
 {min:1000,max:4999.99,rate:10,label:'$1,000 a $4,999.99'},
 {min:5000,max:9999.99,rate:12,label:'$5,000 a $9,999.99'},
 {min:10000,max:null,rate:15,label:'$10,000 en adelante'},
]

export const RETURN_RATES=ANNUAL_RATE_EXAMPLE_TIERS.map(row=>row.rate)

export const suggestedAnnualRate=amount=>{
 const value=Number(amount)
 if(!Number.isFinite(value)||value<=0)return null
 return ANNUAL_RATE_EXAMPLE_TIERS.find(row=>value>=row.min&&(row.max===null||value<=row.max))?.rate??null
}

export const annualReferenceGain=(amount,rate)=>{
 const principal=Number(amount)
 const pct=Number(rate)
 if(!Number.isFinite(principal)||principal<0||!Number.isFinite(pct)||pct<0)return null
 return principal*pct/100
}

export const tierForAmount=amount=>{
 const value=Number(amount)
 if(!Number.isFinite(value)||value<=0)return null
 return ANNUAL_RATE_EXAMPLE_TIERS.find(row=>value>=row.min&&(row.max===null||value<=row.max))||null
}
