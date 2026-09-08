import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

const rawClient = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

// Todos los runtimes del ERP importan este mismo cliente. Cuando SafeWorkspaceGate
// ya resolvió la empresa activa, reutilizamos esa resolución para evitar que cada
// launcher dependa de una segunda llamada a get_my_companies que puede llegar tarde
// o fallar de forma transitoria y dejar el módulo invisible.
export const supabase = rawClient
  ? new Proxy(rawClient, {
      get(target, property) {
        if (property === 'rpc') {
          return (functionName, args, options) => {
            if (functionName === 'get_my_companies' && typeof window !== 'undefined') {
              const activeCompany = window.__IDEALO_ACTIVE_COMPANY__
              if (activeCompany?.id) {
                return Promise.resolve({ data: [activeCompany], error: null })
              }
            }
            return target.rpc(functionName, args, options)
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  : null
