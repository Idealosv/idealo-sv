const money=value=>new Intl.NumberFormat('es-SV',{style:'currency',currency:'USD'}).format(Number(value)||0)
const clean=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim()
const pdfEscape=value=>clean(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
const wrap=(value,max=74)=>{const words=clean(value).split(' ').filter(Boolean),lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>max&&line){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines.length?lines:['']}
const winAnsiBytes=text=>{const map={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};const bytes=[];for(const ch of text){const code=ch.charCodeAt(0);bytes.push(code<=255?code:(map[code]??63))}return new Uint8Array(bytes)}
function buildPdf(objects){let body='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(body.length);body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`}const xref=body.length;body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)body+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;body+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return new Blob([winAnsiBytes(body)],{type:'application/pdf'})}

export function createQuotePdfBlob({company,client,quote,items=[],totals={}}){
 const c=[];const text=(x,y,v,size=10,bold=false,color='0 0 0')=>c.push(`${color} rg BT /F${bold?'2':'1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(v)}) Tj ET`);const fill=(x,y,w,h,color)=>c.push(`${color} rg ${x} ${y} ${w} ${h} re f`);const stroke=(x,y,w,h,color='0.75 0.75 0.75',width=.6)=>c.push(`${color} RG ${width} w ${x} ${y} ${w} ${h} re S`);const line=(x1,y1,x2,y2,color='0.65 0.65 0.65',width=.6)=>c.push(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
 const ORANGE='1 0.39 0',BLACK='0.055 0.055 0.055',DARK='0.13 0.13 0.13',GRAY='0.42 0.42 0.42',LIGHT='0.95 0.95 0.95',WHITE='1 1 1'
 fill(0,0,595,842,WHITE);fill(0,762,595,80,BLACK);fill(0,754,595,8,ORANGE)
 text(42,807,company?.name||'IDEALO SV',22,true,WHITE);text(42,787,'SOLUCIONES · PRODUCCION · PUBLICIDAD',8,false,'0.78 0.78 0.78')
 text(414,810,'COTIZACION',18,true,ORANGE);text(414,788,quote?.code||'BORRADOR',10,true,WHITE)
 let y=720
 text(42,y,'CLIENTE',8,true,ORANGE);text(320,y,'DETALLE DEL DOCUMENTO',8,true,ORANGE);y-=13
 fill(36,y-69,523,76,LIGHT);stroke(36,y-69,523,76,'0.86 0.86 0.86',.5)
 text(48,y,client?.name||'Cliente sin seleccionar',12,true,DARK);text(332,y,`Fecha: ${new Date().toLocaleDateString('es-SV')}`,9,false,DARK);y-=16
 if(client?.nit)text(48,y,`NIT: ${client.nit}`,8,false,GRAY);text(332,y,`Vigencia: ${quote?.valid_until||'--'}`,9,false,DARK);y-=14
 if(client?.email)text(48,y,client.email,8,false,GRAY);text(332,y,`Estado: ${quote?.status==='DRAFT'?'BORRADOR':clean(quote?.status||'BORRADOR')}`,8,true,GRAY);y-=14
 if(client?.phone||client?.whatsapp)text(48,y,`Tel. ${client.whatsapp||client.phone}`,8,false,GRAY)
 y-=48
 if(quote?.title){text(42,y,'PROYECTO / TRABAJO',8,true,ORANGE);y-=17;text(42,y,quote.title,15,true,DARK);y-=28}
 fill(36,y-4,523,27,BLACK);text(48,y+5,'DESCRIPCION',8,true,WHITE);text(369,y+5,'CANT.',8,true,WHITE);text(421,y+5,'P. UNIT.',8,true,WHITE);text(503,y+5,'TOTAL',8,true,WHITE);y-=19
 items.forEach((item,index)=>{const desc=clean(item.description)||`Partida ${index+1}`,rows=wrap(desc,55),qty=Number(item.quantity)||0,unit=Number(item.unit_price)||0;const h=Math.max(32,20+(rows.length-1)*11);if(index%2===1)fill(36,y-h+8,523,h,LIGHT);text(48,y,rows[0],9,true,DARK);text(374,y,String(qty),9,false,DARK);text(421,y,money(unit),9,false,DARK);text(503,y,money(qty*unit),9,true,DARK);let yy=y-12;rows.slice(1,3).forEach(row=>{text(48,yy,row,8,false,GRAY);yy-=10});y-=h;line(36,y+8,559,y+8,'0.88 0.88 0.88',.4)})
 y=Math.min(y-8,315)
 fill(337,y-103,222,111,LIGHT);stroke(337,y-103,222,111,'0.84 0.84 0.84',.5);text(354,y-14,'Subtotal',9,false,GRAY);text(485,y-14,money(totals.subtotal),9,true,DARK);text(354,y-36,'IVA',9,false,GRAY);text(485,y-36,money(totals.tax),9,true,DARK);fill(337,y-94,222,39,BLACK);text(354,y-80,'TOTAL',12,true,WHITE);text(476,y-80,money(totals.total),13,true,ORANGE)
 let ny=y-128;text(42,ny,'CONDICIONES COMERCIALES',8,true,ORANGE);ny-=17;text(42,ny,`Forma de pago: ${quote?.payment_method||'Por definir'}`,9,true,DARK);if(quote?.payment_terms){ny-=14;text(42,ny,`Condicion: ${quote.payment_terms}`,8,false,GRAY)}
 if(quote?.customer_notes){ny-=23;text(42,ny,'OBSERVACIONES',8,true,ORANGE);ny-=15;wrap(quote.customer_notes,90).slice(0,4).forEach(row=>{text(42,ny,row,8,false,GRAY);ny-=11})}
 fill(0,0,595,48,BLACK);fill(0,48,595,4,ORANGE);text(42,27,'IDEALO SV',9,true,WHITE);text(112,27,'Cotizacion comercial · Documento sujeto a confirmacion',7,false,'0.7 0.7 0.7');text(474,27,'USD',8,true,ORANGE)
 const stream=c.join('\n');return buildPdf(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'])
}
