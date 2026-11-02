import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useAuth } from '../lib/auth'
import { isConfigured } from '../lib/supabase'

export default function Login() {
  const { session, signIn, loading } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // 이미 로그인 상태면 홈으로
  if (!loading && session) {
    const from = (loc.state as { from?: Location } | null)?.from
    return <Navigate to={(from as unknown as { pathname?: string })?.pathname ?? '/'} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!isConfigured) {
      setErr('Supabase 연결이 아직 설정되지 않았습니다. (.env 파일에 URL·anon key 입력 필요)')
      return
    }
    setBusy(true)
    const { error } = await signIn(email.trim(), pw)
    setBusy(false)
    if (error) {
      setErr(loginErrorKo(error))
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <main className="login-page">
      <div className="login-demo">
        {/* 좌측 아트 패널 */}
        <div className="login-art">
          <div className="msun" />
          <div className="motif" aria-hidden="true">
            <div className="mrow m1" />
            <div className="mrow m2" />
            <div className="mrow m3" />
            <div className="mfloor" />
          </div>
          <div className="lb">
            <span className="logo-mark">
              <i />
              <i />
              <i />
            </span>
            <span>
              <b>곳간</b>
              <small>BOOKCHON WORKSPACE</small>
            </span>
          </div>
          <div className="lead">
            <div className="eyebrow">OUR WORK, CONNECTED</div>
            <h2>
              좋은 일의 시작,
              <br />
              함께하는 업무 공간.
            </h2>
            <p>서로의 일을 연결하고, 소중한 기록을 안전하게 지킵니다.</p>
          </div>
          <div className="lfeat">
            <div>
              <span className="fi">
                <Icon name="tasks" size={15} />
              </span>{' '}
              업무·결재·일정을 한곳에서
            </div>
            <div>
              <span className="fi">
                <Icon name="shield" size={15} />
              </span>{' '}
              역할·담당 권한에 따른 안전한 접근
            </div>
            <div>
              <span className="fi">
                <Icon name="doc" size={15} />
              </span>{' '}
              보존 기록을 제자리에
            </div>
          </div>
          <div className="lfoot">
            <i /> (주)북촌불교미술보존연구소 · PRIVATE INTRANET
          </div>
        </div>

        {/* 우측 폼 */}
        <form className="login-form" onSubmit={onSubmit}>
          <span className="fbadge">
            <Icon name="lock" size={12} /> 비공개 업무 공간
          </span>
          <h3>다시 오신 것을 환영합니다.</h3>
          <p className="sub">등록된 이메일과 비밀번호로 로그인해 주세요.</p>

          {!isConfigured && (
            <div className="login-alert warn">
              아직 Supabase 프로젝트가 연결되지 않았습니다. 관리자가 <code>.env</code> 에
              프로젝트 URL·키를 설정하면 로그인할 수 있습니다.
            </div>
          )}

          <div className="login-field">
            <label>이메일</label>
            <div className={`box${email ? ' focus' : ''}`}>
              <Icon name="users" size={16} />
              <input
                type="email"
                autoComplete="username"
                placeholder="you@bookchon.kr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label>비밀번호</label>
            <div className="box">
              <Icon name="lock" size={16} />
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPw((v) => !v)}
                title={showPw ? '숨기기' : '보기'}
              >
                <Icon name="eye" size={16} className="icon eye" />
              </button>
            </div>
          </div>

          <div className="login-row">
            <label className="rem">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ display: 'none' }}
              />
              <i className={remember ? 'on' : ''}>
                {remember && <Icon name="check" size={10} style={{ color: '#fff' }} />}
              </i>{' '}
              로그인 상태 유지
            </label>
          </div>

          {err && <div className="login-alert err">{err}</div>}

          <button className="login-btn" type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
            {!busy && (
              <svg className="icon" width="17" height="17" viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>

          <div className="login-note">
            <Icon name="shield" className="icon ic" />
            <span>
              계정 역할과 담당 권한에 따라, 구성원은 허용된 업무와 문서만 이용합니다.
            </span>
          </div>
        </form>
      </div>
    </main>
  )
}

function loginErrorKo(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (m.includes('email not confirmed')) return '이메일 인증이 완료되지 않았습니다.'
  if (m.includes('network')) return '네트워크 오류입니다. 잠시 후 다시 시도해 주세요.'
  return msg
}
