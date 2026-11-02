import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Supabase 환경변수가 .env 에 설정돼 있는지 */
export const isConfigured = Boolean(url && anon && !url.includes('YOUR-PROJECT'))

/**
 * Supabase 클라이언트.
 * 아직 .env 가 설정되지 않았어도 앱이 죽지 않도록, 더미 값으로 생성해 둔다.
 * (로그인 화면에서 "연결 설정이 필요합니다" 안내를 띄우는 용도)
 */
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
