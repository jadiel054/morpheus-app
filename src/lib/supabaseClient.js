import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isConfigured = Boolean(supabaseUrl && supabaseKey)

function resultadoVazio() {
  return Promise.resolve({ data: null, error: null })
}

function criarQueryBuilderMock() {
  const builder = {
    then(resolve) {
      return resultadoVazio().then(resolve)
    },
    catch() {
      return resultadoVazio()
    },
    single() {
      return resultadoVazio()
    },
    maybeSingle() {
      return resultadoVazio()
    },
    select() {
      return builder
    },
    insert() {
      return resultadoVazio()
    },
    upsert() {
      return resultadoVazio()
    },
    update() {
      return builder
    },
    delete() {
      return builder
    },
    eq() {
      return builder
    },
    ilike() {
      return builder
    },
    order() {
      return builder
    },
    limit() {
      return builder
    },
  }

  return builder
}

function criarSupabaseMock() {
  const indisponivel = () => Promise.resolve({ data: null, error: { message: 'Supabase nao configurado no frontend' } })

  return {
    __mock: true,
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: indisponivel,
      signInWithOtp: indisponivel,
      signOut: () => Promise.resolve({ error: null }),
      signUp: indisponivel,
      updateUser: indisponivel,
      resetPasswordForEmail: indisponivel,
      resend: indisponivel,
    },
    from() {
      return criarQueryBuilderMock()
    },
  }
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'morpheus-auth',
      },
    })
  : criarSupabaseMock()

export default supabase
