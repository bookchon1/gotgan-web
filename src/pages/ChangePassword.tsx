import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** 최초 로그인 시(또는 비밀번호 변경 시) 새 비밀번호 설정 화면.
 *  must_change_pw=true 인 동안 다른 화면 접근을 막고 이 화면만 보여준다. */
export default function ChangePassword() {
  const { me, reloadMe, signOut } = useAuth()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (pw1.length < 4) {
      setErr('비밀번호는 4자 이상으로 설정해 주세요.')
      return
    }
    if (pw1 === '0000') {
      setErr('초기 비밀번호(0000)가 아닌 새 비밀번호로 변경해 주세요.')
      return
    }
    if (pw1 !== pw2) {
      setErr('두 비밀번호가 일치하지 않습니다.')
      return
    }
    setBusy(true)
    // 1) 실제 비밀번호 변경
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    // 2) 최초 재설정 플래그 해제
    await supabase.rpc('mark_pw_changed')
    await reloadMe()
    setBusy(false)
    // reloadMe 로 must_change_pw=false 가 되면 가드가 자동으로 홈으로 보냄
  }

  return (
    <main className="login-page">
      <div className="login-demo" style={{ gridTemplateColumns: '1fr' }}>
        <form className="login-form" onSubmit={onSubmit} style={{ maxWidth: 420, margin: '0 auto' }}>
          <span className="fbadge">
            <Icon name="lock" size={12} /> 비밀번호 설정
          </span>
          <h3>{me?.name ? `${me.name} 님, ` : ''}새 비밀번호를 설정해 주세요.</h3>
          <p className="sub">
            보안을 위해 초기 비밀번호(0000)를 본인만 아는 새 비밀번호로 변경합니다.
          </p>

          <div className="login-field">
            <label>새 비밀번호</label>
            <div className="box">
              <Icon name="lock" size={16} />
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="새 비밀번호 (4자 이상)"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                required
                autoFocus
              />
              <button type="button" className="eye-btn" onClick={() => setShow((v) => !v)}>
                <Icon name="eye" size={16} className="icon eye" />
              </button>
            </div>
          </div>

          <div className="login-field">
            <label>새 비밀번호 확인</label>
            <div className="box">
              <Icon name="lock" size={16} />
              <input
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="한 번 더 입력"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </div>
          </div>

          {err && <div className="login-alert err">{err}</div>}

          <button className="login-btn" type="submit" disabled={busy}>
            {busy ? '변경 중…' : '비밀번호 변경하고 시작하기'}
          </button>

          <button
            type="button"
            className="btn txt"
            style={{ marginTop: 10, color: 'var(--muted)' }}
            onClick={() => signOut()}
          >
            로그아웃
          </button>
        </form>
      </div>
    </main>
  )
}
