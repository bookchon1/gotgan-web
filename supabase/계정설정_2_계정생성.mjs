// ============================================================
//  곳간 · 로그인 계정 일괄 생성 [2/2]
//  login_email 이 설정된 재직 직원들의 Supabase 로그인 계정을 만들고
//  초기비밀번호 0000 으로 설정 + employees.auth_user_id 연결까지 자동.
//
//  사용법 (대표님 PC, Node 18+):
//    1) 이 폴더에서:  npm i @supabase/supabase-js
//    2) 환경변수 2개 넣고 실행:
//       SUPABASE_URL="https://<프로젝트>.supabase.co" \
//       SUPABASE_SERVICE_ROLE="<service_role 키>" \
//       node 계정설정_2_계정생성.mjs
//
//  ※ service_role 키는 Supabase → Project Settings → API → service_role 에 있습니다.
//    (절대 외부에 공유 금지. 이 스크립트는 로컬에서만 쓰고 끝나면 지우세요)
//  ※ [1/2] 스키마 SQL 을 먼저 실행해 두어야 합니다.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE
const INIT_PW = process.env.INIT_PW || '0000' // 초기 비밀번호

if (!URL || !KEY) {
  console.error('❌ 환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE 를 설정하세요.')
  process.exit(1)
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

// 이미 만들어진 auth 계정을 이메일로 찾기 (재실행 안전)
async function findUserByEmail(email) {
  // admin.listUsers 는 페이지네이션 — 간단히 최대 10페이지(1000명) 훑기
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 100) break
  }
  return null
}

async function main() {
  // 1) login_email 이 있는 재직 직원
  const { data: emps, error } = await admin
    .from('employees')
    .select('id,name,login_email,auth_user_id')
    .eq('status', '재직')
    .not('login_email', 'is', null)
  if (error) throw error

  console.log(`\n대상 직원 ${emps.length}명 — 초기비밀번호 "${INIT_PW}"\n`)
  let created = 0, linked = 0, skipped = 0

  for (const e of emps) {
    const email = e.login_email.trim()
    try {
      // 이미 연결돼 있으면 건너뜀
      let user = null
      if (e.auth_user_id) {
        console.log(`• ${e.name}: 이미 연결됨 — 건너뜀`)
        skipped++
        continue
      }
      // 계정이 이미 있으면 재사용, 없으면 생성
      user = await findUserByEmail(email)
      if (user) {
        console.log(`• ${e.name}: 계정 존재(${email}) — 비번 ${INIT_PW} 로 재설정 + 연결`)
        await admin.auth.admin.updateUserById(user.id, { password: INIT_PW, email_confirm: true })
      } else {
        const { data, error: cErr } = await admin.auth.admin.createUser({
          email,
          password: INIT_PW,
          email_confirm: true, // 이메일 인증 없이 바로 로그인 가능
        })
        if (cErr) throw cErr
        user = data.user
        console.log(`• ${e.name}: 계정 생성(${email})`)
        created++
      }
      // employees.auth_user_id 연결
      const { error: uErr } = await admin
        .from('employees')
        .update({ auth_user_id: user.id })
        .eq('id', e.id)
      if (uErr) throw uErr
      linked++
    } catch (err) {
      console.error(`  ⚠ ${e.name}(${email}) 실패:`, err.message || err)
    }
  }

  console.log(`\n완료 — 생성 ${created} · 연결 ${linked} · 건너뜀 ${skipped}`)
  console.log('이제 각 직원은 "이름 + 0000" 으로 로그인 → 최초 비밀번호 재설정 화면이 뜹니다.\n')
}

main().catch((e) => {
  console.error('실패:', e.message || e)
  process.exit(1)
})
