export async function reverseCustomerPayment({supabase,paymentId,reason,reversalKey=crypto.randomUUID()}){
  const cleanReason=String(reason||'').trim()
  if(cleanReason.length<4)throw new Error('Indicá el motivo de la reversión.')
  const {data,error}=await supabase.rpc('reverse_customer_payment',{p_payment:paymentId,p_reason:cleanReason,p_reversal_key:reversalKey})
  if(error)throw error
  return data
}
