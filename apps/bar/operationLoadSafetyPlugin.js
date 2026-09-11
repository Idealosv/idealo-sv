export default function standaloneBarOperationLoadSafety(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  return{
    name:'idealo-bar-standalone-operation-load-safety',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null

      let next=code

      // El dashboard de Pedidos se inyecta después del return temprano de loading.
      // Un useMemo allí cambia el número de hooks entre renders y provoca React #310.
      const unsafeOrderItemHook=" const orderItemCount=useMemo(()=>{const map=new Map();items.filter(item=>item.status!=='cancelled').forEach(item=>map.set(item.order_id,(map.get(item.order_id)||0)+Number(item.quantity||0)));return map},[items])"
      const safeOrderItemCalculation=" const orderItemCount=(()=>{const map=new Map();items.filter(item=>item.status!=='cancelled').forEach(item=>map.set(item.order_id,(map.get(item.order_id)||0)+Number(item.quantity||0)));return map})()"
      if(!next.includes(unsafeOrderItemHook))throw new Error('[IDEALO BAR] No se encontró el cálculo de productos de Pedidos')
      next=next.replace(unsafeOrderItemHook,safeOrderItemCalculation)

      const coreMarker="   setTables(tablesRes.data||[]);setOrders(ordersRes.data||[]);setItems(itemsRes.data||[])"
      if(!next.includes(coreMarker))throw new Error('[IDEALO BAR] No se encontró el punto de carga de Mesas/Pedidos')
      next=next.replace(coreMarker,`${coreMarker}\n   // El POS ya puede operar; los datos secundarios continúan cargando después.\n   setLoading(false)`)

      const effectMarker=' useEffect(()=>{load()},[load])'
      if(!next.includes(effectMarker))throw new Error('[IDEALO BAR] No se encontró el efecto de carga de Operación')
      next=next.replace(effectMarker,`${effectMarker}\n\n // Seguridad: ninguna consulta puede dejar la interfaz bloqueada indefinidamente.\n useEffect(()=>{\n  if(!loading)return\n  const timer=window.setTimeout(()=>{\n   setLoading(false)\n   setError(current=>current||'La carga está tardando más de lo esperado. El POS quedó disponible mientras terminan los datos pendientes.')\n  },10000)\n  return()=>window.clearTimeout(timer)\n },[loading])`)

      return{code:next,map:null}
    },
  }
}
