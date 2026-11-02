import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './supabase'

/** 현재 로그인한 직원 (employees 테이블의 내 레코드) */
export interface CurrentEmployee {
  id: string
  name: string
  dept_key: string | null
  dept_label?: string | null
  title: string | null
  role: 'admin' | 'user'
  is_mgmt: boolean
  is_root: boolean
  status: string
}

interface AuthState {
  loading: boolean
  session: Session | null
  me: CurrentEmployee | null
  isAdmin: boolean
  isMgmt: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  reloadMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

/** auth.users 와 연결된 내 직원 레코드를 읽어온다. 스키마 미배포 시 null. */
async function fetchMe(userId: string): Promise<CurrentEmployee | null> {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('id,name,dept_key,title,role,is_mgmt,is_root,status, departments(label)')
      .eq('auth_user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    // departments 조인은 객체 또는 배열로 올 수 있어 안전하게 처리
    const dep = (data as Record<string, unknown>).departments as
      | { label?: string }
      | { label?: string }[]
      | null
    const dept_label = Array.isArray(dep) ? dep[0]?.label : dep?.label
    return {
      id: data.id,
      name: data.name,
      dept_key: data.dept_key,
      dept_label: dept_label ?? null,
      title: data.title,
      role: (data.role as 'admin' | 'user') ?? 'user',
      is_mgmt: Boolean(data.is_mgmt),
      is_root: Boolean(data.is_root),
      status: data.status ?? '재직',
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<CurrentEmployee | null>(null)

  async function loadFor(sess: Session | null) {
    setSession(sess)
    if (sess?.user) {
      setMe(await fetchMe(sess.user.id))
    } else {
      setMe(null)
    }
  }

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      await loadFor(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      loadFor(sess)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    loading,
    session,
    me,
    isAdmin: me?.role === 'admin',
    isMgmt: Boolean(me?.is_mgmt),
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return { error: error ? error.message : null }
    },
    async signOut() {
      await supabase.auth.signOut()
    },
    async reloadMe() {
      if (session?.user) setMe(await fetchMe(session.user.id))
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
