export default function standaloneBarCashStyles(){
  const target='/apps/web/src/IdealoBarOperationsV2.jsx'
  return{
    name:'idealo-bar-standalone-cash-styles',
    enforce:'pre',
    transform(code,id){
      const normalized=id.split('?')[0].replace(/\\/g,'/')
      if(!normalized.endsWith(target))return null
      if(code.includes("../../bar/src/cash-dashboard.css"))return null
      return{code:`import '../../bar/src/cash-dashboard.css'\n${code}`,map:null}
    },
  }
}
