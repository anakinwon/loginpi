// 통합 회귀 관문(T10) — 소스를 읽어 형제 경로·번역 짝·Pi Browser 철칙이 깨지지 않았는지 본다. 실행 : pnpm --dir sitemap/seminar.pi test
//  ① smn_agr 에 동의 행을 넣는 라우트는 모두 agreeGate(개최자·ADMIN·참가 등록자)를 거친다(D-3)
//  ② /privacy 전역 링크 + ko·en 키 ③ ko·en 번역 키 짝 ④ 일반 fetch('/api/…) 는 허용 목록만(나머지는 piFetch)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../..', import.meta.url))
const read = (p) => readFileSync(join(APP, p), 'utf8')
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const rel = (p) => relative(APP, p).split(sep).join('/')
const srcFiles = walk(join(APP, 'src')).filter((p) => /\.(ts|tsx)$/.test(p))

test('① smn_agr 에 넣는 라우트는 모두 agreeGate 를 거친다', () => {
  const writers = srcFiles.filter((p) => {
    const s = readFileSync(p, 'utf8')
    return /from\('smn_agr'\)\s*\.insert|const TABLE = 'smn_agr'[\s\S]*from\(TABLE\)\s*\.insert/.test(s)
  })
  assert.ok(writers.length >= 2, `동의 기록 라우트를 찾지 못함 : ${writers.map(rel)}`)
  for (const p of writers) assert.match(readFileSync(p, 'utf8'), /await agreeGate\(/, `${rel(p)} 에 agreeGate 없음`)
})

test('② 헤더에 /privacy 링크, nav.privacy 가 ko·en 모두 있다', () => {
  assert.match(read('src/components/site-header.tsx'), /href="\/privacy"/)
  for (const l of ['ko', 'en']) {
    const m = JSON.parse(read(`messages/${l}.json`))
    assert.ok(m.nav?.privacy?.trim(), `${l} nav.privacy 비어 있음`)
  }
})

test('③ ko·en 번역 키가 짝이 맞고 빈 값이 없다', () => {
  const keys = (o, pre = '') =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]))
  const [ko, en] = ['ko', 'en'].map((l) => new Map(keys(JSON.parse(read(`messages/${l}.json`)))))
  assert.deepEqual([...ko.keys()].filter((k) => !en.has(k)), [], 'en 에 없는 키')
  assert.deepEqual([...en.keys()].filter((k) => !ko.has(k)), [], 'ko 에 없는 키')
  const empty = [...ko, ...en].filter(([, v]) => typeof v === 'string' && v === '').map(([k]) => k)
  assert.deepEqual(empty, [], '빈 값("") 키')
})

test('④ 일반 fetch(\'/api/…) 는 허용 목록만 — 나머지는 piFetch(Pi Browser 는 쿠키가 없다)', () => {
  // 허용 : Pi 토큰 발급(로그인 전이라 토큰 없음)·Google 세션 확인(일반 브라우저 쿠키 경로)
  const ALLOW = new Set(['src/app/[locale]/auth/pi/callback/page.tsx:/api/auth/pi', 'src/components/google-auth.tsx:/api/auth/me'])
  const hits = srcFiles.flatMap((p) =>
    [...readFileSync(p, 'utf8').matchAll(/(?<![\w.])fetch\(\s*[`'"](\/api\/[^`'"$?]*)/g)].map((m) => `${rel(p)}:${m[1]}`),
  )
  assert.deepEqual(hits.filter((h) => !ALLOW.has(h)), [])
})

test('⑤ 외부 AI 를 부르는 라우트는 모두 speechGate 를 거치고, 사용 판정 RPC 는 관문 한 곳에만 있다(필수 과제 ③)', () => {
  const routes = srcFiles.filter((p) => rel(p).startsWith('src/app/api/'))
  // gemini 의 transcribe·translate·tts 를 가져오는 라우트 = 계량 대상
  const aiRoutes = routes.filter((p) =>
    /import \{[^}]*\b(transcribe|translate|tts)\b[^}]*\} from '@\/lib\/gemini'/.test(readFileSync(p, 'utf8')),
  )
  assert.deepEqual(aiRoutes.map(rel).sort(), [
    'src/app/api/speech/chunk/route.ts',
    'src/app/api/speech/translate/route.ts',
    'src/app/api/speech/tts/route.ts',
  ])
  const kinds = { chunk: 'VC', translate: 'TRANS', tts: 'TTS' }
  for (const p of aiRoutes) {
    const k = kinds[rel(p).split('/')[4]]
    // 번역·합성은 shareMiss(판정 전 진행 중 Promise 캐시, r3 T09) 안에서 speechGate 를 부른다
    assert.match(readFileSync(p, 'utf8'), new RegExp(`await (shareMiss\\(cache, key, \\(\\) => )?speechGate\\([^;]*'${k}'`), `${rel(p)} 에 speechGate ${k} 없음`)
  }
  const direct = srcFiles.filter(
    (p) => !rel(p).endsWith('lib/speech-gate.ts') && /rpc\(\s*'fn_use_smn_(ai|vc)'/.test(readFileSync(p, 'utf8')),
  )
  assert.deepEqual(direct.map(rel), [], '관문 밖에서 사용 판정 RPC 직접 호출')
  // 회의록 요약(summarize)은 lib/notes 만 부르고, 요약 라우트는 manage(시작자·개최자·ADMIN) 확인
  const sum = srcFiles.filter((p) => /\bsummarize\(/.test(readFileSync(p, 'utf8')) && !rel(p).endsWith('lib/gemini.ts'))
  assert.deepEqual(sum.map(rel), ['src/lib/notes.ts'])
  assert.match(read('src/app/api/notes/[id]/end/route.ts'), /if \(!n\.manage\) return apiError\('FORBIDDEN', 403\)/)
})

test('⑥ 녹화·AI 기록 배지·토스트는 공용 자리에 portal 로 붙는다 — 같은 absolute 좌표로 겹치지 않게(15.6)', () => {
  const view = read('src/components/room/room-view.tsx')
  assert.match(view, /id=\{BADGE_SLOT_ID\}[\s\S]*flex-wrap/)
  assert.match(view, /id=\{TOAST_SLOT_ID\}[\s\S]*flex-col/)
  // 슬롯은 오버레이보다 먼저 그린다(오버레이 마운트 때 getElementById 로 찾는다)
  assert.ok(view.indexOf('id={TOAST_SLOT_ID}') < view.indexOf('f.Overlay &&'))
  for (const f of ['recording', 'notes']) {
    const s = read(`src/components/room/features/${f}/index.tsx`)
    assert.match(s, /useStageSlot\(BADGE_SLOT_ID\)/, f)
    assert.match(s, /useStageSlot\(TOAST_SLOT_ID\)/, f)
    assert.doesNotMatch(s, /absolute top-\[calc\(12px|absolute top-12 /, `${f} 에 배지·토스트 고정 좌표 잔존`)
  }
  // 무대 고정 해제 버튼은 배지 줄(좌상단)과 다른 자리
  assert.doesNotMatch(read('src/components/room/stage.tsx'), /absolute top-2 left-2/)
})

test('⑦ 부가 기능의 ⋯ 항목·탭 이름 키와 useTranslations 이름공간이 ko·en 모두 있다(빠지면 화면에 키가 그대로 보인다)', () => {
  const feat = srcFiles.filter((p) => rel(p).startsWith('src/components/room/features/'))
  const msgs = Object.fromEntries(['ko', 'en'].map((l) => [l, JSON.parse(read(`messages/${l}.json`))]))
  const at = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o)
  const need = new Set()
  for (const p of feat) {
    const s = readFileSync(p, 'utf8')
    for (const m of s.matchAll(/\blabel: '([\w.]+)'/g)) need.add(`room.${m[1]}`)
    for (const m of s.matchAll(/useTranslations\('([\w.]+)'\)/g)) need.add(m[1])
  }
  assert.ok(need.size >= 10, `키 수집 실패 : ${need.size}`)
  const miss = [...need].flatMap((k) => ['ko', 'en'].filter((l) => at(msgs[l], k) === undefined).map((l) => `${l}:${k}`))
  assert.deepEqual(miss, [])
})

test('⑧ 세미나 음성 조각은 무대 관문(stageGate)을 계량 관문(speechGate)보다 먼저 거친다(D-1 — 청중 음성 AI 호출 차단)', () => {
  const s = read('src/app/api/speech/chunk/route.ts')
  const st = s.indexOf('await stageGate(')
  const sp = s.indexOf('await speechGate(')
  assert.ok(st > 0 && sp > st, 'stageGate 가 없거나 speechGate 뒤에 있음')
  assert.match(read('src/lib/speech-gate.ts'), /AbortSignal\.timeout\(2_000\)/, '엔진 호출 2초 제한(R-P4) 없음')
})

test('⑨ 부가 기능의 state 방송은 모두 재시도(sendRetry)를 거친다 — 녹화·AI 기록과 같은 초당 2건 창에서 조용히 빠지지 않게(T03 r5)', () => {
  const feat = srcFiles.filter((p) => rel(p).startsWith('src/components/room/features/'))
  const bare = feat.flatMap((p) =>
    readFileSync(p, 'utf8')
      .split('\n')
      .map((l, i) => [l, i + 1])
      .filter(([l]) => /sendApp\('state'|\('state', \{/.test(l) && !/sendRetry\(/.test(l))
      .map(([, i]) => `${rel(p)}:${i}`),
  )
  assert.deepEqual(bare, [])
})

test('⑩ 부가 기능 ctx.notice 키가 room.* 아래 ko·en 모두 있다', () => {
  const msgs = ['ko', 'en'].map((l) => JSON.parse(read(`messages/${l}.json`)).room)
  const at = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o)
  const keys = new Set()
  for (const p of srcFiles.filter((p) => rel(p).startsWith('src/components/room/features/')))
    for (const m of readFileSync(p, 'utf8').matchAll(/notice\(([^)]*)\)/g))
      for (const k of m[1].matchAll(/'([a-zA-Z]+\.[\w.]+)'/g)) keys.add(k[1])
  assert.ok(keys.size >= 10, `키 수집 실패 : ${keys.size}`)
  const miss = [...keys].flatMap((k) => msgs.flatMap((m, i) => (typeof at(m, k) === 'string' ? [] : [`${['ko', 'en'][i]}:${k}`])))
  assert.deepEqual(miss, [])
})

test('⑪ 부가 기능의 무대 위 토스트(새 설문·효과 꺼짐)도 공용 토스트 줄에 붙는다 — 상단 가운데 고정 좌표면 녹화 배지(M-4 전원 표시)를 덮는다(r5)', () => {
  const feat = srcFiles.filter((p) => rel(p).startsWith('src/components/room/features/') && p.endsWith('.tsx'))
  // 무대 위 겹침 좌표 = 가로 전체(inset-x-0)에 상단으로 붙는 absolute(자막은 bottom 이라 제외, 시트 안 장식 -top-1·top-1 도 제외)
  const bad = feat.filter((p) => /absolute[^'"`]*\binset-x-0\b[^'"`]*\btop-(?:\d|\[)/.test(readFileSync(p, 'utf8'))).map(rel)
  assert.deepEqual(bad, [])
  for (const f of ['engage/polls', 'backgrounds/index']) {
    const s = read(`src/components/room/features/${f}.tsx`)
    assert.match(s, /useStageSlot\(TOAST_SLOT_ID\)/, f)
    // 낭독 영역은 늘 붙어 있어야(조건부 마운트면 첫 알림이 낭독되지 않는다) — 비었을 땐 줄 맨 뒤
    assert.match(s, /role="status"[^>]*order-last/, f)
  }
})

test("⑫ 화면이 부르는 t('키') 는 ko·en 모두 있다 — 함수마다 useTranslations 이름공간을 따라간다(빠지면 화면에 키가 그대로 보인다)", () => {
  const msgs = Object.fromEntries(['ko', 'en'].map((l) => [l, JSON.parse(read(`messages/${l}.json`))]))
  const at = (o, path) => path.split('.').reduce((x, k) => (x && typeof x === 'object' ? x[k] : undefined), o)
  const BIND =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:'([\w.]+)'|\{[^}]*namespace:\s*'([\w.]+)'[^}]*\})?\s*\)/g
  let n = 0
  const miss = []
  for (const p of srcFiles) {
    const s = readFileSync(p, 'utf8')
    const binds = [...s.matchAll(BIND)]
    binds.forEach((b, i) => {
      // 이 바인딩이 유효한 구간 = 다음 바인딩 전까지(같은 파일 안에서도 함수마다 이름공간이 다르다)
      const part = s.slice(b.index, binds[i + 1]?.index ?? s.length)
      const ns = b[2] ?? b[3] ?? ''
      for (const m of part.matchAll(new RegExp(`\\b${b[1]}(?:\\.rich|\\.raw|\\.markup)?\\(\\s*'([\\w.]+)'`, 'g'))) {
        n++
        const key = ns ? `${ns}.${m[1]}` : m[1]
        for (const l of ['ko', 'en']) if (at(msgs[l], key) === undefined) miss.push(`${l}:${key} (${rel(p)})`)
      }
    })
  }
  assert.ok(n >= 300, `키 수집 실패 : ${n}`) // 2026-10-28 기준 345개
  assert.deepEqual(miss, [])
})

test('⑬ 새 탭 링크(target=_blank)는 낭독기에 새 탭임을 글로 알리고 ↗ 화살표는 숨긴다(WCAG 3.2.5 — 룸에서 처리방침을 열 때)', () => {
  const files = srcFiles.filter((p) => p.endsWith('.tsx') && readFileSync(p, 'utf8').includes('target="_blank"'))
  assert.ok(files.length >= 1)
  for (const p of files) {
    const s = readFileSync(p, 'utf8')
    assert.doesNotMatch(s, /\}\s*↗/, `${rel(p)} : 화살표가 낭독된다`)
    assert.match(s, /<NewTab /, rel(p))
  }
  for (const l of ['ko', 'en']) assert.ok(JSON.parse(read(`messages/${l}.json`)).room.consent.newTab, l)
})

test('⑭ ko·en 같은 키의 문구 변수({name} 등)가 짝이 맞는다 — 한쪽만 다르면 그 언어 화면에서 변수가 빠지거나 형식 오류가 난다(r6)', () => {
  const flat = (o, pre = '') =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]))
  // {변수} 와 {변수, plural, …} 의 이름만 모은다
  const vars = (s) =>
    [...String(s).matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)]
      .map((m) => m[1])
      .sort()
      .join(',')
  const [ko, en] = ['ko', 'en'].map((l) => new Map(flat(JSON.parse(read(`messages/${l}.json`)))))
  const bad = [...ko].filter(([k, v]) => en.has(k) && vars(v) !== vars(en.get(k))).map(([k]) => k)
  assert.ok([...ko.values()].filter((v) => vars(v)).length >= 30, '변수 문구 수집 실패')
  assert.deepEqual(bad, [])
})

test('⑮ 360px 폭 — 제작 현황 단계 칸은 줄바꿈된다(비고 글이 칸 밖으로 넘쳐 가로 스크롤 생기던 것, r6 실측 378px)', () => {
  assert.match(read('src/components/progress-board.tsx'), /flex min-w-0 flex-wrap items-center gap-2 rounded-md border/)
})

test('⑯ 글자 링크도 터치 대상 높이 24px 이상(WCAG 2.5.8) — 헤더 메뉴·상세 공유 줄·목록으로', () => {
  assert.match(read('src/components/site-header.tsx'), /<nav className="[^"]*\[&>a\]:min-h-6/)
  assert.match(read('src/components/seminar/share-links.tsx'), /text-xs \[&>\*\]:inline-flex \[&>\*\]:min-h-6/)
  assert.match(read('src/components/seminar/seminar-detail.tsx'), /inline-flex min-h-6 items-center text-sm hover:underline">\s*← /)
})

test('⑰ 방 관리 API(/api/admin/**)는 모두 requireAdmin 을 먼저 거치고, 세미나 방 강제 종료는 DB 종료(endSeminar)가 엔진 닫기보다 먼저다(M5)', () => {
  const routes = srcFiles.filter((p) => rel(p).startsWith('src/app/api/admin/'))
  assert.ok(routes.length >= 2, `방 관리 라우트를 찾지 못함 : ${routes.map(rel)}`)
  for (const p of routes) {
    const s = readFileSync(p, 'utf8')
    const gate = s.indexOf('requireAdmin(req)')
    assert.ok(gate > 0, `${rel(p)} 에 requireAdmin 없음`)
    assert.ok(!/engineAdmin\(|closeEngineRoom\(|endSeminar\(/.test(s.slice(0, gate)), `${rel(p)} : 권한 확인 전 엔진 호출`)
  }
  assert.match(read('src/app/api/admin/rooms/[id]/route.ts'), /isUuid\(id\) \? await endSeminar\(/)
  // endSeminar 는 DB 갱신(update) 뒤에야 엔진을 닫는다
  const plan = read('src/lib/plan.ts')
  const body = plan.slice(plan.indexOf('export async function endSeminar'))
  const upd = body.indexOf(".update({ smn_sts_cd: 'ENDED'")
  const close = body.indexOf('closeEngineRoom(')
  assert.ok(upd >= 0 && close >= 0, 'DB ENDED 갱신·엔진 닫기 문구를 찾지 못함 — 관문을 함께 고칠 것')
  assert.ok(upd < close) // DB 정본 먼저(입장권 재발급 방지)
})
