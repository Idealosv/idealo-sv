export const TOP_LEVEL_GROUPS=['Todos','Cervezas','Licores','Bebidas','Comida','Combos / Promociones']

export const SUBGROUPS={
 Licores:['Whisky','Vodka','Ron','Tequila / Mezcal','Gin','Aguardiente','Licores / Digestivos','Vinos','Espumantes','Sangrías','RTD / Hard Seltzer'],
 Bebidas:['Energizantes','Gaseosas','Agua','Jugos','Mezcladores','Sin alcohol'],
 Comida:['Hamburguesas','Alitas','Boneless / Tenders','Hot Dogs','Nachos','Papas','Tacos','Pizzas','Quesadillas','Mexicana','Mariscos / Ceviches','Sopas','Sándwiches','Parrilla / Churrascos','Entradas / Bocas','Otros'],
 'Combos / Promociones':['Baldes','Hielerazos','Combos','Happy Hour','Otros'],
}

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const has=(text,pattern)=>pattern.test(text)

const classifyFood=name=>{
 if(has(name,/hamburg|\bburger\b|sliders?/))return'Hamburguesas'
 if(has(name,/\balitas?\b|chicken\s*wings?/))return'Alitas'
 if(has(name,/boneless|tenders?|chunks?|strippers?|fingers?\s+de\s+pollo|deditos?\s+de\s+pollo/))return'Boneless / Tenders'
 if(has(name,/hot\s*dogs?|hotdogs?|perro\s+caliente/))return'Hot Dogs'
 if(has(name,/nachos?|totopos?/))return'Nachos'
 if(has(name,/\bpapas?\b|papas\s+fritas|french\s+fries|wedge\s+fries|cheesy\s+fries|aros?\s+de\s+cebolla|onion\s+rings?/))return'Papas'
 if(has(name,/\btacos?\b/))return'Tacos'
 if(has(name,/\bpizzas?\b|pepperoni|cuatro\s+quesos/))return'Pizzas'
 if(has(name,/quesadillas?/))return'Quesadillas'
 if(has(name,/\bsopa\b|\bsopon\b|\bcaldo\b|mariscada|mondongo/))return'Sopas'
 if(has(name,/churrasco|costillas?|ribs?|parrill|asado\s+de\s+tira|carne\s+asada|lomito|lomo\s+de\s+aguja|ribeye|t[- ]?bone|mar\s+y\s+tierra|cielo\s+mar\s+y\s+tierra|chorizos?\s+argentinos?|cerdo\s+a\s+la\s+parrilla|carne\s+oreada|punta\s+jalapena/))return'Parrilla / Churrascos'
 if(has(name,/\bburritos?\b|\btortas?\s+mexican|cochinita|\bgringas?\b|quesabirria|\bbirria\b|\bmulitas?\b|enchiladas?|chilaquiles?|flautas?|taquizas?|al\s+pastor/))return'Mexicana'
 if(has(name,/ceviche|cebiche|coctel\s+de\s+camar|coctel\s+mixto|coctel\s+de\s+conch|cinco\s+mares|aguachile|camarones?|calamares?|langosta|\bpescado\b|curvina|\bconchas?\b|caracol|cangrejo|\bpulpo\b|jaiba|mejillon|almeja|paella/))return'Mariscos / Ceviches'
 if(has(name,/sandwich|sándwich|choripan|choripán|pulled\s+pork\s+pan/))return'Sándwiches'
 if(has(name,/mozzarella|mozarella|cheese\s+sticks?|jalapeno\s+poppers?|jalapeño\s+poppers?|dumplings?|gyoza|hummus|humus|tostones?|yuca|pastelitos?|queso\s+frito|pescaditas?|\bbocas?\b|enredos?|chicharrones?/))return'Entradas / Bocas'
 return'Otros'
}

const classifyBeverage=(name,category)=>{
 if(has(category,/mezcladores?/))return'Mezcladores'
 if(has(category,/energizantes?/))return'Energizantes'
 if(has(category,/sin\s+alcohol/))return'Sin alcohol'
 if(has(name,/red\s*bull|monster|volt|rockstar|energy|energizante/))return'Energizantes'
 if(has(name,/tonica|tonic|ginger\s*ale|club\s*soda|mezclador|mixer/))return'Mezcladores'
 if(has(name,/\bjugo\b|\bjugos\b|nectar/))return'Jugos'
 if(has(name,/\bagua\b|mineral/))return'Agua'
 if(has(name,/coca[ -]?cola|pepsi|sprite|fanta|7\s*up|seven\s*up|gaseosa|refresco/))return'Gaseosas'
 return'Sin alcohol'
}

const classifyCombo=name=>{
 if(has(name,/balde/))return'Baldes'
 if(has(name,/hielerazo/))return'Hielerazos'
 if(has(name,/happy\s*hour/))return'Happy Hour'
 if(has(name,/combo|promocion/))return'Combos'
 return'Otros'
}

const classifyLiquor=(name,category)=>{
 if(has(name,/smirnoff\s+ice|hard\s+seltzer|\bseltzer\b|four\s+loko|mamitas|mg\s+spirit|bamboo|cuba\s+libre|cubata|botran\s+vip|adan\s+y\s+eva|eazy\s+pary|\blivit\b|chispuda|bebida\s+alcoholica|agua\s+dura\s+cadejo/))return'RTD / Hard Seltzer'
 if(has(name,/sangria/))return'Sangrías'
 if(has(name,/champagne|prosecco|\bcava\b|espumante|espumoso|sparkling|\bchandon\b|freixenet|bottega\s+petalo|bottega\s+prosecco|saint[- ]louis|cinzano\s+rose/))return'Espumantes'
 if(has(name,/^vino\b|\bwine\b/)||has(category,/vinos?/))return'Vinos'
 if(has(name,/^licor\b|^crema\b|aperitivo|vermouth|bitters|baileys|frangelico|disaronno|campari|cointreau|jager|martini|angostura|flamingo|spresso\s+coffee|ultra\s+coco/))return'Licores / Digestivos'
 if(has(name,/tequila|mezcal/)||has(category,/tequila|mezcal/))return'Tequila / Mezcal'
 if(has(name,/\bgin\b|beefeater|bombay|tanqueray|bulldog|masters\s+pink|mg\s+rosa/)||has(category,/gin/))return'Gin'
 if(has(name,/aguardiente|quezalteca|petrov|troika|cana\s+rica|el\s+canal|trenzuda|el\s+chamaco/)||has(category,/aguardiente/))return'Aguardiente'
 if(has(name,/whisk|whiskey|buchanan|johnnie\s+walker|jack\s+daniel|jameson|chivas|fireball|bourbon|scotch|glenfiddich|glenlivet|glen\s+grant|macallan|dewars?|old\s+parr|ballantine|passport|cutty\s+sark|dalwhinnie|cardhu|tullamore|william\s+lawson|william\s+peel|wild\s+turkey|bulleit|highland\s+park|old\s+smuggler|something\s+special|spice\s+monkey|tottori|wilton/)||has(category,/whisk/))return'Whisky'
 if(has(name,/\bvodka\b|absolut|belvedere|finlandia|grey\s+goose|stolichnaya|tito'?s|smirnoff\s+vodka|^zero\b/)||has(category,/vodka/))return'Vodka'
 if(has(name,/^ron\b|\bron\s+flor\s+de\s+cana\b|bacardi|zacapa|cihuatan|brugal|barcelo|malibu|flor\s+de\s+cana\s+(eco|centenario)/)||has(category,/\bron\b/))return'Ron'
 return'Licores / Digestivos'
}

export function classifyBarMenuItem(item){
 const category=normalize(item?.category)
 const name=normalize(item?.display_name||item?.product?.name)
 const comboCategory=has(category,/combo|promoc/)
 const foodCategory=has(category,/comida|hamburg|alitas?|boneless|tenders?|hot\s*dogs?|nachos?|papas?|tacos?|pizzas?|quesadillas?|mexican|marisc|ceviche|cebiche|coctel|sopas?|caldos?|sandwich|choripan|parrill|churrasco|costillas?|ribs?|entradas?|bocas?/)
 const beerCategory=has(category,/cervezas?/)
 const beverageCategory=has(category,/bebidas?|energizantes?|gaseosas?|agua|jugos?|mezcladores?|sin\s+alcohol/)
 const liquorCategory=has(category,/licores?|whisk|vodka|\bron\b|tequila|mezcal|\bgin\b|aguardiente|vinos?|espumantes?|sangrias?|smirnoff|rtd/)

 if(comboCategory||has(name,/\bbalde\b|hielerazo|happy\s*hour|\bcombo\b|promocion/))return{group:'Combos / Promociones',subgroup:classifyCombo(name)}
 if(foodCategory)return{group:'Comida',subgroup:classifyFood(name)}
 if(beerCategory)return{group:'Cervezas',subgroup:null}
 if(liquorCategory)return{group:'Licores',subgroup:classifyLiquor(name,category)}
 if(beverageCategory)return{group:'Bebidas',subgroup:classifyBeverage(name,category)}
 if(item?.station==='kitchen')return{group:'Comida',subgroup:classifyFood(name)}
 return{group:'Bebidas',subgroup:classifyBeverage(name,category)}
}

export function getSubgroupsForGroup(group){
 const groups=SUBGROUPS[group]
 return groups?['Todos',...groups]:[]
}

const popularityWeight=createdAt=>{
 const time=createdAt?new Date(createdAt).getTime():0
 if(!Number.isFinite(time)||time<=0)return 1
 const ageDays=Math.max(0,(Date.now()-time)/86400000)
 if(ageDays<=7)return 4
 if(ageDays<=30)return 2
 return 1
}

export function buildMenuPopularity(items=[],orders=[]){
 const orderStatus=new Map((orders||[]).map(order=>[order.id,order.status]))
 const scores=new Map()
 for(const item of items||[]){
  if(!item?.menu_item_id||item.status==='cancelled'||item.voided_at)continue
  if(orderStatus.get(item.order_id)==='cancelled')continue
  const quantity=Number(item.quantity||0)
  if(!Number.isFinite(quantity)||quantity<=0)continue
  const score=quantity*popularityWeight(item.created_at)
  scores.set(item.menu_item_id,(scores.get(item.menu_item_id)||0)+score)
 }
 return scores
}

const popularityScore=(popularity,itemId)=>{
 if(popularity instanceof Map)return Number(popularity.get(itemId)||0)
 return Number(popularity?.[itemId]||0)
}

export function filterStandaloneMenu(menu,group='Todos',subgroup='Todos',query='',popularity=null){
 const search=normalize(query)
 return(menu||[]).filter(item=>{
  const classification=classifyBarMenuItem(item)
  const label=normalize(item?.display_name||item?.product?.name)
  if(search){
   const haystack=`${label} ${normalize(item?.category)} ${normalize(classification.group)} ${normalize(classification.subgroup)}`
   return haystack.includes(search)
  }
  if(group!=='Todos'&&classification.group!==group)return false
  if(subgroup&&subgroup!=='Todos'&&classification.subgroup!==subgroup)return false
  return true
 }).sort((a,b)=>{
  const scoreDiff=popularityScore(popularity,b.id)-popularityScore(popularity,a.id)
  if(scoreDiff)return scoreDiff
  const orderDiff=Number(a.sort_order??999999)-Number(b.sort_order??999999)
  if(orderDiff)return orderDiff
  return normalize(a.display_name||a.product?.name).localeCompare(normalize(b.display_name||b.product?.name),'es')
 })
}
