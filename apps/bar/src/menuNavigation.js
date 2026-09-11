export const TOP_LEVEL_GROUPS=['Todos','Cervezas','Licores','Bebidas','Comida','Combos / Promociones']

export const SUBGROUPS={
 Licores:['Whisky','Vodka','Ron','Tequila / Mezcal','Gin','Aguardiente','Licores / Digestivos','Vinos','Espumantes','Sangrías','RTD / Hard Seltzer'],
 Bebidas:['Energizantes','Gaseosas','Agua','Jugos','Mezcladores','Sin alcohol'],
 Comida:['Hamburguesas','Alitas','Hot Dogs','Nachos','Papas','Tacos','Otros'],
 'Combos / Promociones':['Baldes','Hielerazos','Combos','Happy Hour','Otros'],
}

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
const has=(text,pattern)=>pattern.test(text)

const classifyFood=name=>{
 if(has(name,/hamburg/))return'Hamburguesas'
 if(has(name,/\balitas?\b/))return'Alitas'
 if(has(name,/hot\s*dogs?|hotdogs?|perro\s+caliente/))return'Hot Dogs'
 if(has(name,/nachos?/))return'Nachos'
 if(has(name,/\bpapas?\b|papas\s+fritas|french\s+fries/))return'Papas'
 if(has(name,/\btacos?\b/))return'Tacos'
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
 const foodCategory=has(category,/comida|hamburg|alitas?|hot\s*dogs?|nachos?|papas?|tacos?/)
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

export function filterStandaloneMenu(menu,group='Todos',subgroup='Todos',query=''){
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
 })
}
