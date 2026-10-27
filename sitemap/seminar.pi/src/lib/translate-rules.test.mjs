// translate-rules.ts 시험(SA8) — node --test src/lib/translate-rules.test.mjs. 한국어 → 영어 번역 요청의 규칙·캐시 키 확인
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_LIMIT,
  cacheKey,
  capSig,
  capSigOk,
  cleanText,
  hitRate,
  isTranslateLang,
  Lru,
  MAX_TEXT_CHARS,
  pickTrLang,
  sameLang,
  TR_LANG_SETTLE_MS,
  TRANSLATE_LANGS,
  trStopOf,
} from './translate-rules.ts'

test('대상 언어 — 60개 이상, 중복 없음, 목록 밖·형식 이상 거부', () => {
  assert.ok(TRANSLATE_LANGS.length >= 60)
  assert.equal(new Set(TRANSLATE_LANGS).size, TRANSLATE_LANGS.length)
  assert.ok(isTranslateLang('en') && isTranslateLang('ko') && isTranslateLang('zh-TW'))
  assert.ok(!isTranslateLang('dz') && !isTranslateLang('EN') && !isTranslateLang(1))
})

test('한국어 자막 → 영어 : 언어가 달라 번역 요청, 같은 언어면 건너뜀', () => {
  assert.equal(sameLang('ko', 'en'), false)
  assert.equal(sameLang('ko-KR', 'ko'), true)
  assert.equal(sameLang('en', 'en'), true)
  assert.equal(sameLang('zh', 'zh-TW'), false)
  assert.equal(sameLang('', 'en'), false) // 감지 실패 = 요청(외부 AI 가 같은 언어면 그대로 돌려줌)
})

test('같은 언어 — 표기만 다른 코드는 같음(문장마다 헛번역·헛합성 방지, r3 T08 회귀)', () => {
  // 대소문자·문자 체계 표기
  assert.equal(sameLang('zh-tw', 'zh-TW'), true)
  assert.equal(sameLang('zh-Hant', 'zh-TW'), true)
  assert.equal(sameLang('zh-Hant-TW', 'zh-TW'), true)
  assert.equal(sameLang('zh-HK', 'zh-TW'), true) // 번체
  assert.equal(sameLang('zh-HK', 'zh'), false) // 번체 → 간체는 변환 필요
  assert.equal(sameLang('zh-Hans-CN', 'zh'), true)
  assert.equal(sameLang('EN-us', 'en'), true)
  // 옛 코드
  assert.equal(sameLang('iw', 'he'), true)
  assert.equal(sameLang('in', 'id'), true)
  assert.equal(sameLang('tl', 'fil'), true)
  assert.equal(sameLang('no', 'nb'), true)
  // 형식 오류 = 다름(요청)
  assert.equal(sameLang('!!', '!!'), false)
  assert.equal(sameLang(undefined, 'en'), false)
})

test('번역 언어 기본값 — 브라우저 선호 언어 → UI locale → en (r3 T08 보강)', () => {
  assert.equal(pickTrLang(['vi-VN', 'en-US'], 'en'), 'vi')
  assert.equal(pickTrLang(['zh-HK'], 'ko'), 'zh-TW')
  assert.equal(pickTrLang(['zh-CN'], 'ko'), 'zh')
  assert.equal(pickTrLang(['pt-BR'], 'ko'), 'pt')
  assert.equal(pickTrLang(['xx-ZZ', 'qaa'], 'ko'), 'ko') // 목록 밖 → UI locale
  assert.equal(pickTrLang([], 'xx'), 'en')
  assert.equal(pickTrLang(undefined, 'en'), 'en')
  for (const c of ['vi', 'zh-TW', 'zh', 'nb', 'fil', 'he']) assert.ok(isTranslateLang(pickTrLang([c], 'en')))
})

test('문장 정리 — 공백 정규화, 빈 글·500자 초과 거부', () => {
  assert.equal(cleanText('  안녕하세요,\n 여러분  '), '안녕하세요, 여러분')
  assert.equal(cleanText('   '), null)
  assert.equal(cleanText('가'.repeat(500)), '가'.repeat(500))
  assert.equal(cleanText('가'.repeat(501)), null)
  assert.equal(cleanText(3), null)
})

test('글자 상한(D-2) = 자막 표시 상한 CAPTION.maxChars(500), 외부 AI translate 상한(speech-rules) 이하', async () => {
  const [{ MAX_TEXT_CHARS: AI_MAX }, { CAPTION }] = await Promise.all([
    import('./speech-rules.ts'),
    import('../components/room/features/captions/caption-rules.ts'),
  ])
  assert.equal(MAX_TEXT_CHARS, CAPTION.maxChars)
  assert.ok(MAX_TEXT_CHARS <= AI_MAX)
})

// D-2 회귀 — 번역·합성은 서버가 서명한 자막만. 임의 글·다른 세미나·변조 서명은 거부
const SECRET = 's'.repeat(32)
const SMN = '0b5e7a52-3c1d-4e8f-9a6b-1c2d3e4f5a6b'
test('자막 서명 — 서명한 글·세미나만 통과, 공백 차이·대문자 uuid 는 같은 글로 본다', async () => {
  const sig = await capSig(SECRET, SMN, '안녕하세요 여러분')
  assert.match(sig, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', sig), true)
  assert.equal(await capSigOk(SECRET, SMN.toUpperCase(), ' 안녕하세요\n여러분 ', sig), true)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분!', sig), false) // 글 변조
  assert.equal(await capSigOk(SECRET, '1b5e7a52-3c1d-4e8f-9a6b-1c2d3e4f5a6b', '안녕하세요 여러분', sig), false) // 다른 세미나
  assert.equal(await capSigOk('t'.repeat(32), SMN, '안녕하세요 여러분', sig), false) // 다른 키
  const bad = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', bad), false)
  for (const s of [undefined, null, '', 'x', sig + 'A', 1]) assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', s), false)
})

test('자막 서명 — 빈 글·500자 초과는 서명하지 않음(번역 불가 = 원문만)', async () => {
  assert.equal(await capSig(SECRET, SMN, '  '), null)
  assert.equal(await capSig(SECRET, SMN, 'a'.repeat(501)), null)
  assert.equal(await capSigOk(SECRET, SMN, 'a'.repeat(501), await capSig(SECRET, SMN, 'a'.repeat(500))), false)
})

test('AI 계량 상한 — 합성이 번역보다 작고, 분당 상한은 세미나 상한보다 작음', () => {
  for (const k of ['TRANS', 'TTS']) assert.ok(AI_LIMIT[k].maxMinChr > MAX_TEXT_CHARS && AI_LIMIT[k].maxMinChr < AI_LIMIT[k].maxChr)
  assert.ok(AI_LIMIT.TTS.maxChr < AI_LIMIT.TRANS.maxChr)
})

test('번역·합성 라우트 — engage.gate(OPEN·무료 미등록 통과) 대신 서명 확인 + fn_use_smn_ai 계량(D-2 회귀 방지)', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const [f, kind] of [['translate', 'TRANS'], ['tts', 'TTS']]) {
    const src = await readFile(new URL(`../app/api/speech/${f}/route.ts`, import.meta.url), 'utf8')
    assert.ok(src.includes('capSigOk(env.PI_SESSION_SECRET'), f)
    // 계량은 공용 관문 speechGate(kind) → fn_use_smn_ai(필수 과제 ③)
    //  미스는 shareMiss 가 speechGate 판정 전에 진행 중 Promise 를 캐시(동시 미스 1회 계량, r3 T09)
    assert.ok(src.includes(`'${kind}', `) && /await shareMiss\(cache, key, \(\) => speechGate\(/.test(src), f)
    assert.ok(!/\bgate\(/.test(src), f)
  }
  const sql = await readFile(new URL('../../sql/010_seminar_ai_use.sql', import.meta.url), 'utf8')
  assert.ok(sql.includes(`smn_sts_cd <> 'LIVE'`) && sql.includes('FROM smn_ptc p'))
})

test('캐시 키 =언어 + 문장 sha256 — 같은 문장·언어는 같은 키, 언어·문장이 다르면 다른 키', async () => {
  const a = await cacheKey('안녕하세요, 여러분', 'en')
  assert.match(a, /^en:[0-9a-f]{64}$/)
  assert.equal(a, await cacheKey('안녕하세요, 여러분', 'en'))
  assert.notEqual(a, await cacheKey('안녕하세요, 여러분', 'ja'))
  assert.notEqual(a, await cacheKey('안녕하세요 여러분', 'en'))
  await assert.rejects(cacheKey('x', 'en; drop'))
})

test('LRU — 상한 넘으면 가장 오래 안 쓴 것부터 버림, get 은 최근으로 올림', () => {
  const c = new Lru(2)
  c.set('a', 1)
  c.set('b', 2)
  assert.equal(c.get('a'), 1) // a 최근
  c.set('c', 3) // b 버림
  assert.equal(c.get('b'), undefined)
  assert.equal(c.get('a'), 1)
  assert.equal(c.size, 2)
})

test('사용자당 분당 60회 — 61번째 거부, 1분 지나면 다시 허용, 사용자별 분리', () => {
  const t = new Map()
  for (let i = 0; i < 60; i++) assert.ok(hitRate(t, 'u1', 1000))
  assert.equal(hitRate(t, 'u1', 1000), false)
  assert.ok(hitRate(t, 'u2', 1000))
  assert.ok(hitRate(t, 'u1', 61_000))
})

// r2 회귀 — 되풀이되는 실패는 이번 입장 동안 요청을 멈춘다(문장마다 403·503 헛요청 = 청중 수 × 문장 수 왕복·DB 잠금, R-P2)
test('번역 중단 사유 — 권한 없음·AI 미설정·세미나 한도만 멈추고, 일시 실패는 다음 문장에 다시 시도', async () => {
  const { vcUseError } = await import('./speech-rules.ts')
  const of = (r) => {
    const e = vcUseError(r)
    return trStopOf(e.status, e.code)
  }
  assert.equal(of('FORBIDDEN'), 'forbidden') // 무료 세미나 방 링크로 바로 입장(smn_ptc 없음)
  assert.equal(of('QUOTA'), 'quota')
  assert.equal(of('RATE'), null) // 분당 한도 — 1분 뒤 회복
  assert.equal(of('NOT_LIVE'), null)
  assert.equal(of('NOT_FOUND'), null)
  assert.equal(trStopOf(401, 'UNAUTHORIZED'), 'forbidden')
  assert.equal(trStopOf(403, 'FORBIDDEN'), 'forbidden') // 서명 불일치도 같은 화면에선 되풀이된다
  assert.equal(trStopOf(503, 'AI_UNAVAILABLE'), 'unavailable')
  assert.equal(trStopOf(503, 'DB_UNAVAILABLE'), null) // DB 일시 장애는 다시 시도
  assert.equal(trStopOf(502, 'TRANSLATE_FAILED'), null)
  assert.equal(trStopOf(429, 'SPEECH_RATE'), null)
  assert.equal(trStopOf(0, undefined), null)
})

test('화면 — 번역 중단은 요청 전에 막고 사유를 알림·시트에 표시, 더빙도 같은 사유면 끔(ko·en 문구 동시)', async () => {
  const { readFile } = await import('node:fs/promises')
  const rd = (p) => readFile(new URL(p, import.meta.url), 'utf8')
  const [tr, cap, dub, ko, en] = await Promise.all([
    rd('../components/room/features/captions/translate.ts'),
    rd('../components/room/features/captions/index.tsx'),
    rd('../components/room/features/dubbing/index.tsx'),
    rd('../../messages/ko.json').then(JSON.parse),
    rd('../../messages/en.json').then(JSON.parse),
  ])
  assert.ok(/if \(!sig \|\| trStop\.get\(\)\) return Promise\.resolve\(null\)/.test(tr))
  assert.ok(tr.includes('trStop.set(why)'))
  assert.ok(cap.includes('trStop.reset()')) // 다음 입장에 이어지지 않게
  // 더빙 중단 판정은 T09 dubStop(409·모든 503 포함, trStopOf 상위 집합)으로 통합 — 병합 r2
  assert.ok(dub.includes('dubStop(r.status') && dub.includes("ctx.notice('dubbing.stopped')"))
  for (const m of [ko, en]) {
    for (const k of ['forbidden', 'unavailable', 'quota']) assert.ok(m.room.captions.trStop[k], k)
    assert.ok(m.room.dubbing.stopped)
  }
})

test('언어 바꾸기 디바운스 — 정해진 시간 동안 안 바뀔 때만 요청(select 화살표 훑기 = 언어 수만큼 외부 AI 방지)', async () => {
  assert.ok(TR_LANG_SETTLE_MS >= 200 && TR_LANG_SETTLE_MS <= 1000) // 사람이 고르는 동안은 기다리고, 고른 뒤엔 바로 느껴지게
  const { readFile } = await import('node:fs/promises')
  const tr = await readFile(new URL('../components/room/features/captions/translate.ts', import.meta.url), 'utf8')
  assert.ok(tr.includes('setTimeout(() => setReqLang(lang), TR_LANG_SETTLE_MS)'))
  assert.ok(tr.includes('translateCaption(cap.text, cap.lang, reqLang,')) // 요청은 확정된 언어로만
})

test('자막 표시 — 번역문은 bdi(오른쪽→왼쪽 언어 격리) + lang(한자 글꼴·낭독기)', async () => {
  const { readFile } = await import('node:fs/promises')
  const cap = await readFile(new URL('../components/room/features/captions/index.tsx', import.meta.url), 'utf8')
  assert.ok(cap.includes('<bdi lang={shown?.lang || undefined}>{shown?.text}</bdi>'))
})

// 회귀(T09 r3) — 방송된 자막 1문장에 청중이 동시에 요청 : 판정 왕복 동안 온 요청이 전부 미스로 계량돼 세미나 누적 글자가 청중 수만큼 닳던 결함.
//  판정 전에 Promise 를 캐시에 넣어 뒤 요청은 적중(차감 없음)으로 공유 — 계량(gate) 1회·외부 AI(work) 1회
test('shareMiss — 동시 미스는 계량 1회·외부 AI 1회, 거절·실패·판정 예외는 null + 캐시에서 지움', async () => {
  const { shareMiss } = await import('./translate-rules.ts')
  const tick = () => new Promise((r) => setTimeout(r, 5))
  // 청중 20명 동시 — 라우트와 같은 흐름(get → 적중이면 공유, 미스면 shareMiss)
  const cache = new Lru(10)
  let gates = 0
  let works = 0
  const req = async () => {
    const hit = cache.get('k')
    if (hit) return hit
    const r = await shareMiss(
      cache,
      'k',
      async () => (gates++, await tick(), null),
      async () => (works++, await tick(), 'audio'),
    )
    return r.denied ? 'denied' : r.p
  }
  const out = await Promise.all(Array.from({ length: 20 }, req))
  assert.deepEqual(new Set(out), new Set(['audio']))
  assert.equal(gates, 1)
  assert.equal(works, 1)
  assert.ok(cache.get('k')) // 성공은 남는다

  // 첫 요청 거절(한도 소진 등) — 거절 응답 그대로, 외부 AI 호출 없음, 캐시 비움
  const c2 = new Lru(10)
  let w2 = 0
  const r2 = await shareMiss(c2, 'k', async () => 'QUOTA', async () => (w2++, 'x'))
  assert.equal(r2.denied, 'QUOTA')
  assert.equal(await r2.p, null)
  await tick()
  assert.equal(w2, 0)
  assert.equal(c2.get('k'), undefined)

  // 외부 AI 예외 — null, 캐시 비움
  const c3 = new Lru(10)
  const r3 = await shareMiss(c3, 'k', async () => null, async () => {
    throw new Error('502')
  })
  assert.equal(r3.denied, null)
  assert.equal(await r3.p, null)
  await tick()
  assert.equal(c3.get('k'), undefined)

  // 판정 예외(DB 장애) — 첫 요청에게 던지고 캐시 비움(처리 안 된 거부 없음)
  const c4 = new Lru(10)
  await assert.rejects(
    shareMiss(c4, 'k', async () => {
      throw new Error('db')
    }, async () => 'x'),
  )
  await tick()
  assert.equal(c4.get('k'), undefined)

  // 실패 정리가 같은 키의 새 항목을 지우지 않는다
  const c5 = new Lru(10)
  const r5 = await shareMiss(c5, 'k', async () => null, async () => (await tick(), null))
  const fresh = Promise.resolve('new')
  c5.set('k', fresh)
  await r5.p
  await tick()
  assert.equal(c5.get('k'), fresh)
})
