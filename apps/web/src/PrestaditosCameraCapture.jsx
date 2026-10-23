import { useEffect, useRef, useState } from 'react'

export default function PrestaditosCameraCapture({label='Abrir cámara',facingMode='environment',onCapture,fileName='captura'}){
 const [open,setOpen]=useState(false)
 const [error,setError]=useState('')
 const [previewUrl,setPreviewUrl]=useState('')
 const videoRef=useRef(null)
 const streamRef=useRef(null)
 const previewUrlRef=useRef('')

 const stop=()=>{
  streamRef.current?.getTracks?.().forEach(track=>track.stop())
  streamRef.current=null
 }
 const close=()=>{stop();setOpen(false)}
 const rememberCapture=file=>{
  if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current)
  const url=URL.createObjectURL(file)
  previewUrlRef.current=url
  setPreviewUrl(url)
 }

 useEffect(()=>()=>{
  stop()
  if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current)
 },[])

 useEffect(()=>{
  if(!open)return undefined
  let cancelled=false
  const start=async()=>{
   setError('')
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador no permite abrir la cámara directamente.')
    const stream=await navigator.mediaDevices.getUserMedia({
     audio:false,
     video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:720}}
    })
    if(cancelled){stream.getTracks().forEach(track=>track.stop());return}
    streamRef.current=stream
    if(videoRef.current){
     videoRef.current.srcObject=stream
     await videoRef.current.play().catch(()=>{})
    }
   }catch(err){
    const message=err?.name==='NotAllowedError'
     ?'El navegador bloqueó la cámara. Permití el acceso a la cámara para continuar.'
     :err?.name==='NotFoundError'
      ?'No se encontró una cámara disponible en este dispositivo.'
      :String(err?.message||err)
    setError(message)
   }
  }
  start()
  return ()=>{cancelled=true;stop()}
 },[open,facingMode])

 const capture=()=>{
  const video=videoRef.current
  if(!video?.videoWidth||!video?.videoHeight){setError('Esperá un momento a que la cámara termine de iniciar.');return}
  const canvas=document.createElement('canvas')
  canvas.width=video.videoWidth
  canvas.height=video.videoHeight
  const ctx=canvas.getContext('2d')
  if(!ctx){setError('No se pudo preparar la captura.');return}
  ctx.drawImage(video,0,0,canvas.width,canvas.height)
  canvas.toBlob(blob=>{
   if(!blob){setError('No se pudo capturar la imagen.');return}
   const file=new File([blob],`${fileName}-${Date.now()}.jpg`,{type:'image/jpeg'})
   rememberCapture(file)
   onCapture?.(file)
   close()
  },'image/jpeg',0.92)
 }

 return <>
  {previewUrl&&<div className="prst-camera-captured">
   <img src={previewUrl} alt={`Vista previa de ${label.toLowerCase()}`}/>
   <span>Captura lista</span>
  </div>}
  <button type="button" className="prst-camera-launch" onClick={()=>setOpen(true)}>{previewUrl?'Repetir captura':label}</button>
  {open&&<div className="prst-camera-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}>
   <section className="prst-camera-modal" role="dialog" aria-modal="true" aria-label={label}>
    <header><div><small>CÁMARA</small><h3>{label}</h3></div><button type="button" onClick={close} aria-label="Cerrar cámara">×</button></header>
    <div className="prst-camera-stage"><video ref={videoRef} autoPlay muted playsInline/></div>
    {error&&<div className="prst-camera-error">{error}</div>}
    <div className="prst-camera-actions"><button type="button" onClick={close}>Cancelar</button><button type="button" className="primary" onClick={capture} disabled={Boolean(error)}>Tomar foto</button></div>
   </section>
  </div>}
 </>
}
