const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value)||0)
const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim()
const pdfEscape=value=>clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
const wrap=(value,max=68)=>{const words=clean(value).split(' ').filter(Boolean),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines.length?lines:['']}
const wrapNotes=(value,max=88)=>{const raw=String(value??'').replace(/\r/g,'');const paragraphs=raw.split('\n');const lines=[];paragraphs.forEach((paragraph,index)=>{const trimmed=paragraph.trim();if(index>0&&lines.length&&lines[lines.length-1]!=='')lines.push('');if(trimmed)lines.push(...wrap(trimmed,max))});return lines.filter((line,index)=>line!==''||index===0||lines[index-1]!=='')}
const winAnsiBytes=text=>{const map={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};const bytes=[];for(const ch of text){const code=ch.charCodeAt(0);bytes.push(code<=255?code:(map[code]??63))}return new Uint8Array(bytes)}
function buildPdf(objects){let body='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(body.length);body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=body.length;body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)body+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;body+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([winAnsiBytes(body)],{type:'application/pdf'})}
function buildPagedPdf(streams){const count=streams.length;const font1=3+count*2,font2=font1+1;const kids=streams.map((_,index)=>`${3+index*2} 0 R`).join(' ');const objects=[`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [${kids}] /Count ${count} >>`];streams.forEach((stream,index)=>{const pageId=3+index*2,contentId=pageId+1;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)});objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');return buildPdf(objects)}

export function createQuotePdfBlob({company,client,quote,items=[],totals={}}){
 const pages=[[]]
 let c=pages[0]
 const ORANGE='1 0.36 0',BLACK='0.035 0.035 0.035',CHARCOAL='0.10 0.10 0.10',DARK='0.16 0.16 0.16',MID='0.42 0.42 0.42',BORDER='0.82 0.82 0.82',LIGHT='0.955 0.955 0.955',WHITE='1 1 1'
 const text=(x,y,v,size=10,bold=false,color=BLACK)=>c.push(`${color} rg BT /F${bold?'2':'1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(v)}) Tj ET`)
 const fill=(x,y,w,h,color)=>c.push(`${color} rg ${x} ${y} ${w} ${h} re f`)
 const stroke=(x,y,w,h,color=BORDER,width=.6)=>c.push(`${color} RG ${width} w ${x} ${y} ${w} ${h} re S`)
 const line=(x1,y1,x2,y2,color=BORDER,width=.6)=>c.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
 const circle=(x,y,r,color)=>c.push(`${color} rg ${x} ${y-r} m ${x+r*.5523} ${y-r} ${x+r} ${y-r*.5523} ${x+r} ${y} c ${x+r} ${y+r*.5523} ${x+r*.5523} ${y+r} ${x} ${y+r} c ${x-r*.5523} ${y+r} ${x-r} ${y+r*.5523} ${x-r} ${y} c ${x-r} ${y-r*.5523} ${x-r*.5523} ${y-r} ${x} ${y-r} c f`)
 const status=quote?.status==='DRAFT'?'BORRADOR':clean(quote?.status||'BORRADOR')
 const legalName=company?.name&&company.name!=='IDEALO SV'?company.name:''
 const drawFooter=(compact=false)=>{if(compact){fill(36,45,523,46,BLACK);text(54,75,'GRACIAS POR CONFIAR EN IDEALO SV',9,true,WHITE);text(54,60,'Esta cotizacion esta sujeta a disponibilidad, vigencia y confirmacion comercial.',6.5,false,'0.72 0.72 0.72');text(54,49,'Documento generado por IDEALO SV',6.5,false,'0.58 0.58 0.58');text(501,60,'USD',9,true,ORANGE);fill(0,0,595,31,CHARCOAL);text(42,14,'IDEALO SV',7,true,WHITE);text(476,14,'COTIZACION',7,true,ORANGE);return}fill(36,76,523,58,BLACK);text(54,113,'GRACIAS POR CONFIAR EN IDEALO SV',10,true,WHITE);text(54,96,'Esta cotizacion esta sujeta a disponibilidad, vigencia y confirmacion comercial.',7,false,'0.72 0.72 0.72');text(54,84,'Documento generado por IDEALO SV',7,false,'0.58 0.58 0.58');text(501,96,'USD',10,true,ORANGE);fill(0,0,595,39,CHARCOAL);text(42,18,'IDEALO SV',8,true,WHITE);text(476,18,'COTIZACION',7,true,ORANGE)}
 const drawContinuationPage=(rows,pageNumber)=>{c=[];pages.push(c);fill(0,0,595,842,WHITE);fill(0,720,595,122,BLACK);fill(0,712,595,8,ORANGE);circle(58,789,23,ORANGE);text(48.5,782,'ISV',13,true,WHITE);text(94,802,'IDEALO SV',26,true,WHITE);text(95,782,'COTIZACIONES PROFESIONALES',8,false,'0.76 0.76 0.76');fill(407,755,145,49,CHARCOAL);stroke(407,755,145,49,'0.24 0.24 0.24',.7);text(422,786,'COTIZACION',15,true,ORANGE);text(422,767,quote?.code||'BORRADOR',10,true,WHITE);text(42,674,'OBSERVACIONES',10,true,ORANGE);text(465,674,`PAG. ${pageNumber}`,7,true,MID);const boxTop=654;const lineHeight=11;const boxHeight=Math.min(540,26+rows.length*lineHeight);fill(36,boxTop-boxHeight,523,boxHeight,LIGHT);stroke(36,boxTop-boxHeight,523,boxHeight,BORDER,.5);let oy=boxTop-18;rows.forEach(row=>{if(row)text(51,oy,row,8,false,DARK);oy-=lineHeight});drawFooter(false)}

 fill(0,0,595,842,WHITE)
 fill(0,720,595,122,BLACK)
 fill(0,712,595,8,ORANGE)
 circle(58,789,23,ORANGE);text(48.5,782,'ISV',13,true,WHITE)
 text(94,802,'IDEALO SV',26,true,WHITE)
 text(95,782,'COTIZACIONES PROFESIONALES',8,false,'0.76 0.76 0.76')
 if(legalName)text(95,764,legalName,8,false,'0.62 0.62 0.62')
 fill(407,755,145,49,CHARCOAL);stroke(407,755,145,49,'0.24 0.24 0.24',.7)
 text(422,786,'COTIZACION',15,true,ORANGE)
 text(422,767,quote?.code||'BORRADOR',10,true,WHITE)

 let y=680
 text(42,y,'PREPARADO PARA',8,true,ORANGE);text(327,y,'DOCUMENTO',8,true,ORANGE);y-=14
 fill(36,y-78,523,84,LIGHT);fill(36,y-78,7,84,ORANGE);stroke(36,y-78,523,84,BORDER,.5)
 text(55,y,client?.name||'Cliente sin seleccionar',14,true,BLACK)
 if(client?.nit)text(55,y-18,`NIT: ${client.nit}`,8,false,MID)
 if(client?.email)text(55,y-33,client.email,8,false,MID)
 if(client?.phone||client?.whatsapp)text(55,y-48,`Tel. ${client.whatsapp||client.phone}`,8,false,MID)
 text(341,y,`Fecha`,7,true,MID);text(341,y-14,new Date().toLocaleDateString('es-SV'),10,true,BLACK)
 text(427,y,`Vigencia`,7,true,MID);text(427,y-14,quote?.valid_until||'--',10,true,BLACK)
 fill(341,y-55,194,23,BLACK);text(352,y-47,'ESTADO',7,true,WHITE);text(401,y-47,status,8,true,ORANGE)
 y-=111
 if(quote?.title){text(42,y,'PROYECTO / SERVICIO',8,true,ORANGE);y-=18;text(42,y,quote.title,17,true,BLACK);y-=30}

 fill(36,y-2,523,30,BLACK)
 text(55,y+7,'DESCRIPCION',8,true,WHITE);text(368,y+7,'CANT.',8,true,WHITE);text(420,y+7,'P. UNIT.',8,true,WHITE);text(499,y+7,'TOTAL',8,true,WHITE)
 y-=24
 items.forEach((item,index)=>{
   const desc=clean(item.description)||`Partida ${index+1}`;const rows=wrap(desc,50);const qty=Number(item.quantity)||0;const unit=Number(item.unit_price)||0;const h=Math.max(38,24+(rows.length-1)*11)
   if(index%2===1)fill(36,y-h+8,523,h,LIGHT)
   text(55,y,`${String(index+1).padStart(2,'0')}.`,8,true,ORANGE)
   text(82,y,rows[0],9,true,BLACK)
   text(374,y,String(qty),9,false,DARK);text(420,y,money(unit),9,false,DARK);text(499,y,money(qty*unit),9,true,BLACK)
   let yy=y-12;rows.slice(1).forEach(row=>{text(82,yy,row,8,false,MID);yy-=10})
   y-=h;line(36,y+8,559,y+8,'0.90 0.90 0.90',.4)
 })

 y=Math.min(y-10,326)
 fill(36,y-111,276,119,WHITE);stroke(36,y-111,276,119,BORDER,.7);fill(36,y-3,276,31,LIGHT);text(51,y+7,'CONDICIONES COMERCIALES',8,true,ORANGE)
 text(51,y-19,'Forma de pago',7,true,MID);text(51,y-33,quote?.payment_method||'Por definir',10,true,BLACK)
 text(174,y-19,'Condicion',7,true,MID);text(174,y-33,quote?.payment_terms||'Por definir',9,true,BLACK)
 if(quote?.promised_delivery_date){text(51,y-58,'Entrega estimada',7,true,MID);text(51,y-72,quote.promised_delivery_date,9,true,BLACK)}

 fill(329,y-111,230,119,LIGHT);stroke(329,y-111,230,119,BORDER,.7)
 text(346,y-18,'Subtotal',8,false,MID);text(481,y-18,money(totals.subtotal),9,true,BLACK)
 text(346,y-42,'IVA',8,false,MID);text(481,y-42,money(totals.tax),9,true,BLACK)
 line(346,y-54,542,y-54,'0.70 0.70 0.70',.7)
 fill(329,y-111,230,42,BLACK)
 text(346,y-96,'TOTAL',11,true,WHITE);text(461,y-96,money(totals.total),14,true,ORANGE)

 let overflowRows=[]
 if(quote?.customer_notes){const allRows=wrapNotes(quote.customer_notes,88);const ny=y-140;const boxTop=ny-16;const safeBottom=99;const lineHeight=10;const maxBoxHeight=Math.max(30,boxTop-safeBottom);const maxFirstRows=Math.max(1,Math.floor((maxBoxHeight-18)/lineHeight));const firstRows=allRows.slice(0,maxFirstRows);overflowRows=allRows.slice(maxFirstRows);const boxHeight=Math.max(34,18+firstRows.length*lineHeight);text(42,ny,'OBSERVACIONES',8,true,ORANGE);fill(36,boxTop-boxHeight,523,boxHeight,LIGHT);stroke(36,boxTop-boxHeight,523,boxHeight,BORDER,.5);let oy=boxTop-13;firstRows.forEach(row=>{if(row)text(51,oy,row,8,false,DARK);oy-=lineHeight});if(overflowRows.length)text(470,boxTop-boxHeight+9,'Continua en pagina 2',6.5,true,ORANGE)}
 drawFooter(Boolean(quote?.customer_notes))

 if(overflowRows.length){let pageNumber=2;for(let i=0;i<overflowRows.length;i+=46){drawContinuationPage(overflowRows.slice(i,i+46),pageNumber);pageNumber++}}
 const streams=pages.map(page=>page.join('\n'))
 return buildPagedPdf(streams)
}
