// 설문·Q&A·출석·동의 쓰기 라우트 순서 시험 — node --test src/lib/engage-routes.test.mjs
//  쓰기(update·insert·rpc)는 반드시 gate()(세미나 존재·유료 참가·OPEN) 뒤에 — 종료 세미나에 출석 시각이 늘던 결함(야간 시험 T04)의 회귀 방지.
//  라우트는 Supabase 를 직접 불러 단위 시험이 어렵다 → 원문에서 각 핸들러의 gate 호출이 첫 쓰기보다 앞인지 본다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const api = new URL('../app/api/seminars/[id]/', import.meta.url)
const src = (f) => readFileSync(new URL(f, api), 'utf8')
// 'export const NAME' 부터 다음 export 전까지
const handler = (s, name) => {
  const i = s.indexOf(`export const ${name} =`)
  assert.ok(i >= 0, `${name} 없음`)
  const j = s.indexOf('export const ', i + 1)
  return s.slice(i, j < 0 ? undefined : j)
}
const WRITE = /\.(update|insert|upsert)\(|\.rpc\('(fn_vote|fn_hb_smn_hst)/ // 쓰는 RPC(설문 투표·출석 하트비트 계량 sql/015)

for (const [file, names] of [
  ['attendance/route.ts', ['POST']],
  ['polls/route.ts', ['POST', 'PATCH']],
  ['qna/route.ts', ['POST', 'PATCH']],
]) {
  for (const name of names) {
    test(`${file} ${name} — gate·종료 확인이 첫 쓰기보다 앞`, () => {
      const h = handler(src(file), name)
      const g = h.indexOf('gate(')
      const c = h.indexOf('closed()')
      const w = h.search(WRITE)
      assert.ok(w > 0, '쓰기 없음')
      assert.ok(g > 0 && g < w, 'gate 가 쓰기보다 뒤')
      assert.ok(c > 0 && c < w, '종료(closed) 확인이 쓰기보다 뒤')
    })
  }
}

// 동의 POST 는 agreeGate(개최자·ADMIN·활성 참가 + 종료 409) 한 곳 — /api/speech/agree 와 형제(D-3·T04·T10 병합)
test('consent/route.ts POST — agreeGate 가 첫 쓰기보다 앞, agreeGate 안에 종료(closed) 확인', () => {
  const h = handler(src('consent/route.ts'), 'POST')
  const g = h.indexOf('agreeGate(')
  const w = h.search(WRITE)
  assert.ok(w > 0 && g > 0 && g < w, 'agreeGate 가 쓰기보다 뒤')
  const e = readFileSync(new URL('./engage.ts', import.meta.url), 'utf8')
  const ag = e.slice(e.indexOf('export async function agreeGate'))
  assert.ok(ag.includes('closed()'), 'agreeGate 에 종료 확인 없음')
})

test('처리방침 — 출석부의 Pi 사용자명 개최자 제공·보관 기간 고지(ko·en)', () => {
  const msg = (l) => JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), 'utf8')).privacy.keep
  const [ko, en] = [msg('ko'), msg('en')]
  assert.equal(ko.length, en.length)
  assert.ok(ko.some((s) => s.includes('Pi 사용자명') && s.includes('개최자') && s.includes('세미나를 삭제할 때까지')))
  assert.ok(en.some((s) => s.includes('Pi username') && s.includes('host') && s.includes('until the seminar is deleted')))
})

// 설문·Q&A·출석이 돌려주는 세미나 자격 코드(SMN_CLOSED·SMN_PAY_REQUIRED 등)가 영어 화면에서 한국어 서버 문구로 뜨던 결함(T04 r2)
//  → 서버 오류 카탈로그(api.ts)의 모든 코드는 apiErrors 또는 seminar.err 에 ko·en 번역이 있고, useApiErrorText 가 seminar.err 도 본다
test('오류 코드 번역 — api.ts 카탈로그 전 코드가 ko·en apiErrors|seminar.err 에 있음 + useApiErrorText 가 seminar.err 폴백', () => {
  const a = readFileSync(new URL('./api.ts', import.meta.url), 'utf8')
  const cat = a.slice(a.indexOf('createApiError({'), a.indexOf('\n})', a.indexOf('createApiError({')))
  const codes = [...cat.matchAll(/^\s+([A-Z_]+):/gm)].map((m) => m[1])
  assert.ok(codes.includes('SMN_CLOSED') && codes.length > 20, `카탈로그 파싱 실패 ${codes.length}`)
  for (const l of ['ko', 'en']) {
    const m = JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), 'utf8'))
    const miss = codes.filter((c) => !(c in m.apiErrors) && !(c in m.seminar.err))
    assert.deepEqual(miss, [], `${l} 번역 없음`)
  }
  const c = readFileSync(new URL('./client-api.ts', import.meta.url), 'utf8')
  assert.match(c, /useTranslations\('seminar\.err'\)/)
})

// 쪽 나눔 조회는 마지막 정렬에 PK 가 있어야 한다 — 같은 값(정각 시작 세미나·같은 추천 수)이면 PostgreSQL 이 순서를 보장하지 않아
//  쪽 사이에 중복·누락(T04 r3). '.range(' 를 쓰는 앱 전체 쿼리를 본다(R-P0 형제 경로)
test('쪽 나눔 조회 — .range( 앞 정렬에 PK 동률 경계', () => {
  const app = new URL('../', import.meta.url)
  const files = [
    ['app/api/seminars/route.ts', /smn_id|ptc_id/],
    ['app/api/notes/route.ts', /nt_id/],
    ['app/api/notes/[id]/route.ts', /seg_id/],
    ['lib/notes.ts', /seg_id/],
    ['app/api/seminars/[id]/attendance/route.ts', /atd_id/],
    ['app/api/seminars/[id]/polls/route.ts', /pll_id/],
    ['app/api/seminars/[id]/qna/route.ts', /qna_id/],
  ]
  for (const [f, pk] of files) {
    const s = readFileSync(new URL(f, app), 'utf8')
    let i = -1
    let n = 0
    while ((i = s.indexOf('.range(', i + 1)) >= 0) {
      // 이 .range( 바로 앞 쿼리 조각(앞 .from( 부터)
      const q = s.slice(s.lastIndexOf('.from(', i), i)
      const orders = [...q.matchAll(/\.order\('(\w+)'/g)].map((m) => m[1])
      // qna 는 정렬을 변수 q 에 따로 붙인다 — 그 줄을 함께 본다
      const extra = f.includes('qna') ? [...s.matchAll(/q = q\.order\('(\w+)'/g)].map((m) => m[1]) : []
      const last = [...orders, ...extra].filter((o) => o !== 'opt_seq')
      assert.ok(last.some((o) => pk.test(o)), `${f} ${n + 1}번째 .range( 에 PK 정렬 없음 (${last.join(',')})`)
      n++
    }
    assert.ok(n > 0, `${f} 에 .range( 없음`)
  }
})

test('설문 카드 — [취소](다시 투표)는 열린 설문에만(마감 뒤 실패한 투표가 남긴 [취소] 방지, T04 r3)', () => {
  const s = readFileSync(new URL('../components/room/features/engage/polls.tsx', import.meta.url), 'utf8')
  assert.match(s, /\{change && p\.open && \(/)
  assert.doesNotMatch(s, /\{change && \(/)
})

test('처리방침 — 질문·설문 공개 범위와 보관 고지(ko·en, T04 r3)', () => {
  const msg = (l) => JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), 'utf8')).privacy.keep
  assert.ok(msg('ko').some((s) => s.startsWith('질문과 설문') && s.includes('세미나를 삭제할 때까지')))
  assert.ok(msg('en').some((s) => s.startsWith('Q&A and polls') && s.includes('until the seminar is deleted')))
})

// refresh 는 caption 과 피어당 초당 2건 합산(SIGNAL_API 3.6) — 자막 켠 발표자의 [답변함]·추천 신호가 RATE_LIMITED 로 빠지던 결함(T04 r4).
//  패턴 = app.send('refresh') 1회 보내고 결과 무시 · 매치 1(engage/shared.ts tell) · 처리 1(sendRetry)
test('refresh 신호 — sendRetry 로 보냄(한도 초과 시 재시도), 맨 sendApp(refresh) 없음', () => {
  const s = readFileSync(new URL('../components/room/features/engage/shared.ts', import.meta.url), 'utf8')
  assert.match(s, /sendRetry\(\(\) => ctx\.sendApp\('refresh'/)
  assert.doesNotMatch(s, /void ctx\.sendApp\('refresh'/)
  const spec = readFileSync(new URL('../../docs/SIGNAL_API.md', import.meta.url), 'utf8')
  assert.ok(spec.includes('`caption`·`refresh` 는 합산'), '계약의 합산 규칙이 바뀌면 이 재시도 근거를 다시 볼 것')
})

// 설계서 15.3 의 선택지 길이가 DB(sql/008 VARCHAR(200))·POLL.OPT_LEN 과 달랐다(문서 500자, T04 r4)
test('설문 길이 — 설계서 15.3 · sql/008 · POLL 상수 일치', async () => {
  const { POLL } = await import('./engage-rules.ts')
  const doc = readFileSync(new URL('../../docs/ui-design/ui-design.md', import.meta.url), 'utf8')
  const ddl = readFileSync(new URL('../../sql/008_seminar_meet_ext.sql', import.meta.url), 'utf8')
  assert.ok(doc.includes(`질문 ${POLL.Q_MAX}자·선택지 ${POLL.OPT_LEN}자`))
  assert.match(ddl, new RegExp(`opt_cont\\s+VARCHAR\\(${POLL.OPT_LEN}\\)`))
  assert.match(ddl, new RegExp(`qst_cont\\s+VARCHAR\\(${POLL.Q_MAX}\\)`))
})

// 출석부 보강(T04 r4) — 보이는 동안 HB_MS 마다 다시 읽기, 다시 읽기 실패는 표 유지, 접속 판정 시각은 성공한 자료 기준
test('출석부 — 주기·복귀 즉시 다시 읽기·실패 시 표 유지·성공 때만 기준 시각', () => {
  const s = readFileSync(new URL('../components/seminar/attendance.tsx', import.meta.url), 'utf8')
  // 보일 때만 10초마다 + 탭으로 돌아온 순간 바로(새 입장자가 60초 늦게·다른 화면 다녀와야 보이던 것, 마스터 2026-10-28)
  assert.match(s, /const POLL_MS = 10_000/)
  assert.match(s, /visibilityState === 'visible'[\s\S]*?setInterval\(refresh, POLL_MS\)/)
  assert.match(s, /addEventListener\('visibilitychange', refresh\)/)
  assert.match(s, /removeEventListener\('visibilitychange', refresh\)/)
  assert.match(s, /\[id, page, tick, t, errText\]/)
  assert.match(s, /else if \(!tick \|\| r\.status === 403\) setErr/)
  assert.match(s, /if \(r\.ok\) \{\s*setNow\(Date\.now\(\)\)/)
})
