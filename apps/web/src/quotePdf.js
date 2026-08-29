const money = value => new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value)||0)

const clean = value => String(value ?? '').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim()
const pdfEscape = value => clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
const wrap = (value, max=84) => {
  const words=clean(value).split(' ').filter(Boolean), lines=[]
  let line=''
  for(const word of words){
    const next=line?`${line} ${word}`:word
    if(next.length>max&&line){lines.push(line);line=word}else line=next
  }
  if(line)lines.push(line)
  return lines.length?lines:['']
}

const winAnsiBytes = text => {
  const map={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159}
  const bytes=[]
  for(const ch of text){const code=ch.charCodeAt(0);bytes.push(code<=255?code:(map[code]??63))}
  return new Uint8Array(bytes)
}

function buildPdf(objects){
  let body='%PDF-1.4\n', offsets=[0]
  for(let i=0;i<objects.length;i++){offsets.push(body.length);body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}
  const xref=body.length
  body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`
  for(let i=1;i<offsets.length;i++)body+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`
  body+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([winAnsiBytes(body)],{type:'application/pdf'})
}

export function createQuotePdfBlob({company,client,quote,items=[],totals={}}){
  const commands=[]
  const text=(x,y,value,size=10,bold=false)=>commands.push(`BT /F${bold?'2':'1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`)
  const line=(x1,y1,x2,y2,width=.7)=>commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
  let y=790
  text(44,y,company?.name||'IDEALO SV',19,true);text(420,y,'COTIZACION',16,true);y-=24
  text(44,y,`Cliente: ${client?.name||'Sin seleccionar'}`,11,true);text(420,y,quote?.code||'BORRADOR',10,true);y-=17
  if(client?.nit){text(44,y,`NIT: ${client.nit}`,9);y-=14}
  if(client?.email){text(44,y,`Correo: ${client.email}`,9);y-=14}
  if(client?.phone||client?.whatsapp){text(44,y,`Telefono: ${client.whatsapp||client.phone}`,9);y-=14}
  text(360,y+28,`Fecha: ${new Date().toLocaleDateString('es-SV')}`,9)
  text(360,y+14,`Vigencia: ${quote?.valid_until||'--'}`,9)
  y-=9;line(44,y,551,y,1);y-=22
  if(quote?.title){text(44,y,quote.title,12,true);y-=20}
  text(44,y,'Descripcion',9,true);text(360,y,'Cant.',9,true);text(410,y,'P. unit.',9,true);text(492,y,'Total',9,true);y-=8;line(44,y,551,y,.5);y-=16
  items.forEach((item,index)=>{
    const description=clean(item.description)||`Partida ${index+1}`
    const rows=wrap(description,50)
    text(44,y,rows[0],9);text(365,y,String(Number(item.quantity)||0),9);text(410,y,money(item.unit_price),9);text(492,y,money((Number(item.quantity)||0)*(Number(item.unit_price)||0)),9)
    y-=14
    rows.slice(1,3).forEach(row=>{text(44,y,row,8);y-=12})
    if(y<190){text(44,y,'(La cotizacion continua con mas partidas en el sistema.)',8);y=190}
  })
  y=Math.min(y-8,250);line(330,y,551,y,.5);y-=18
  text(370,y,'Subtotal',10);text(490,y,money(totals.subtotal),10,true);y-=17
  text(370,y,'IVA',10);text(490,y,money(totals.tax),10,true);y-=20
  line(330,y,551,y,1);y-=23;text(370,y,'TOTAL',13,true);text(475,y,money(totals.total),13,true);y-=30
  text(44,y,`Forma de pago: ${quote?.payment_method||'Por definir'}`,9,true);y-=16
  if(quote?.customer_notes){text(44,y,'Notas:',9,true);y-=14;wrap(quote.customer_notes,92).slice(0,4).forEach(row=>{text(44,y,row,8);y-=12})}
  y=Math.max(55,y-12);line(44,y,551,y,.5);y-=16;text(44,y,'Documento generado por IDEALO SV. Revise la informacion antes de aprobar.',8)
  const stream=commands.join('\n')
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  return buildPdf(objects)
}
