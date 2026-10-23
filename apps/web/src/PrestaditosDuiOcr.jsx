import { useState } from 'react'

const MONTHS={
 enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',
 julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12',
}

const normalizeDui=value=>{
 const digits=String(value||'').replace(/\D/g,'')
 if(digits.length!==9)return ''
 return digits.slice(0,8)+'-'+digits.slice(8)
}

const parseBirthDate=text=>{
 const numeric=String(text||'').match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.]((?:19|20)\d{2})\b/)
 if(numeric){
  const day=String(numeric[1]).padStart(2,'0')
  const month=String(numeric[2]).padStart(2,'0')
  return numeric[3]+'-'+month+'-'+day
 }
 const words=String(text||'').toLowerCase().match(/\b(0?[1-9]|[12]\d|3[01])\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?((?:19|20)\d{2})\b/)
 if(words)return words[3]+'-'+MONTHS[words[2]]+'-'+String(words[1]).padStart(2,'0')
 return ''
}

const candidateName=text=>{
 const blocked=['REPUBLICA','SALVADOR','DOCUMENTO','IDENTIDAD','UNICO','NACIONALIDAD','SEXO','NACIMIENTO','EXPEDICION','VENCIMIENTO','FIRMA','DUI']
 const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
 return lines
  .filter(line=>line.length>=8&&line.length<=55&&/^[A-ZÁÉÍÓÚÜÑ\s]+$/i.test(line))
  .filter(line=>!blocked.some(word=>line.toUpperCase().includes(word)))
  .sort((a,b)=>b.split(/\s+/).length-a.split(/\s+/).length||b.length-a.length)[0]||''
}

export default function PrestaditosDuiOcr({file,onApply,disabled=false}){
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [result,setResult]=useState(null)

 const run=async()=>{
  if(!file||disabled)return
  setLoading(true);setError('');setResult(null)
  try{
   const {createWorker}=await import('tesseract.js')
   let worker
   try{
    worker=await createWorker('spa')
   }catch{
    worker=await createWorker('eng')
   }
   const {data}=await worker.recognize(file)
   await worker.terminate()
   const text=data?.text||''
   const duiMatch=text.match(/\b\d{8}\s*[-–]?\s*\d\b/)
   setResult({
    dui:normalizeDui(duiMatch?.[0]||''),
    birth_date:parseBirthDate(text),
    possible_name:candidateName(text),
    confidence:Number(data?.confidence||0),
    text,
   })
  }catch(err){
   setError(String(err?.message||err||'No se pudo leer el DUI.'))
  }finally{
   setLoading(false)
  }
 }

 return <div className="prst-ocr-box">
  <div className="prst-ocr-head">
   <div><strong>Lectura OCR del DUI</strong><small>Se procesa la imagen seleccionada y siempre requiere confirmación humana.</small></div>
   <button type="button" onClick={run} disabled={disabled||!file||loading}>{loading?'Leyendo…':'Leer DUI'}</button>
  </div>
  {error&&<div className="prst-note">{error}</div>}
  {result&&<div className="prst-ocr-result">
   <div><span>DUI detectado</span><strong>{result.dui||'No detectado'}</strong></div>
   <div><span>Fecha de nacimiento</span><strong>{result.birth_date||'No detectada'}</strong></div>
   <div><span>Posible nombre</span><strong>{result.possible_name||'No detectado con suficiente claridad'}</strong></div>
   <div><span>Confianza OCR</span><strong>{result.confidence.toFixed(0)}%</strong></div>
   <details><summary>Ver texto leído</summary><pre>{result.text||'Sin texto'}</pre></details>
   <button type="button" className="prst-primary" onClick={()=>onApply?.({dui:result.dui,birth_date:result.birth_date,possible_name:result.possible_name})} disabled={!result.dui&&!result.birth_date}>Confirmar y aplicar campos detectados</button>
   <small>El nombre se muestra como referencia y no se aplica automáticamente para evitar errores de OCR.</small>
  </div>}
 </div>
}
