// 배경 효과 판정 시험 — node --test src/components/room/features/backgrounds/rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BG, checkMine, coverRect, failBack, nextTs, overflowIds, pipelineKilled, slowerEvery, slowWatch, withUnsaved } from './rules.ts'

// 30fps 로 프레임마다 ms 만큼 걸린다고 치고 sec 초 동안 돌린다 — 한 번이라도 끄라고 하면 true
function run(ms, sec, watch = slowWatch()) {
  let off = false
  for (let t = 0; t <= sec * 1000; t += 33) off = watch(ms, t) || off
  return off
}

test('빠른 기기(프레임당 20ms = 50fps 처리 능력)는 끄지 않는다', () => {
  assert.equal(run(20, 10), false)
})

test('느린 기기(프레임당 80ms = 12.5fps)는 3초 지속 뒤 끈다 — 2초에는 아직', () => {
  assert.equal(run(80, 2.5), false)
  assert.equal(run(80, 4.2), true)
})

test('느렸다가 회복하면 연속 횟수가 0으로 돌아간다', () => {
  const w = slowWatch()
  let off = false
  let t = 0
  for (const ms of [80, 80, 20, 80, 80])
    for (const end = t + 1000; t <= end; t += 33) off = w(ms, t) || off
  assert.equal(off, false)
})

test('숨은 탭으로 프레임이 끊긴 창은 판정하지 않는다', () => {
  const w = slowWatch()
  assert.equal(w(80, 0), false)
  assert.equal(w(80, 5000), false)
})

test('cover 맞춤 — 정사각 이미지를 16:9 에 채우면 위아래가 잘린다', () => {
  assert.deepEqual(coverRect(100, 100, 160, 90), { x: 0, y: -35, w: 160, h: 160 })
})

test('내 이미지 검사 — 2MB 초과·이미지 아님 거부', () => {
  assert.equal(checkMine('image/png', BG.myBytes), null)
  assert.equal(checkMine('image/png', BG.myBytes + 1), 'myTooBig')
  assert.equal(checkMine('text/plain', 10), 'bgFailed')
  assert.equal(checkMine('image/svg+xml', 10), 'bgFailed')
})

test('내 이미지 상한 3장 — 넘치면 오래된 것부터', () => {
  const l = [
    { id: 'c', ts: 3 },
    { id: 'a', ts: 1 },
    { id: 'd', ts: 4 },
    { id: 'b', ts: 2 },
  ]
  assert.deepEqual(overflowIds(l), ['a'])
  assert.deepEqual(overflowIds(l.slice(0, 3)), [])
})

// 회귀(T05 r1) — 조명이 배경 합성 뒤에 오면 어두운 가상 배경까지 재서 보통 조명의 사람을 과노출시켰다
test('조명은 배경보다 먼저 — 카메라 원본만 재고 고친다', async () => {
  const { LIGHT, lightGain } = await import('../media-fx/light.ts')
  assert.ok(LIGHT.order < BG.order)
  // 격자 배경(#0f172a, 밝기 약 0.08)이 화면 65%, 보통 조명 사람(0.5)이 35% 인 합성본
  const composite = 0.65 * 0.08 + 0.35 * 0.5
  assert.equal(lightGain(composite), LIGHT.max) // 합성본을 재면 1.8배 — 고치기 전 결함
  assert.equal(lightGain(0.5), 1) // 카메라 원본을 재면 손대지 않는다
})

test('파이프라인 끔 판정 — 사용자 끔·이미 없음은 아니다', () => {
  assert.equal(pipelineKilled(false, 'blur'), true) // 연속 실패로 꺼짐 → 알림·분리기 버림
  assert.equal(pipelineKilled(false, 'none'), false) // choose('none') 은 선택부터 '없음'
  assert.equal(pipelineKilled(true, 'blur'), false)
})

// 회귀(T05 r3) — 흐림이 돌던 중 다른 배경을 고르는 사이(loading) 파이프라인이 끄면 판정에서 빠졌다 →
// 망가진 분리기를 버리지 않아 선택이 끝나면 다시 켜져 같은 실패를 되풀이하고, 끔 알림도 없었다
test('파이프라인 끔 판정 — 다른 배경을 고르는 중이어도 끔으로 본다', async () => {
  assert.equal(pipelineKilled(false, 'p:dusk'), true)
  // 엔진 끔 처리가 고르는 중인 선택을 버리고(pick++) 상태를 idle 로 되돌리는지
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('bgOn.sub('), src.indexOf("autoOff.set('bgStopped')"))
  assert.match(body, /pick\+\+/)
  assert.match(body, /status\.set\('idle'\)/)
})

// 회귀(T05 r3) — 저장 실패로 이번 회의에만 둔 내 이미지가 시트를 닫았다 열면(목록 다시 읽기) 사라져 선택 표시·삭제가 없어졌다
test('내 이미지 목록 다시 읽기 — 저장 실패분은 남기고 저장된 것과 겹치지 않는다', () => {
  const db = [{ id: 'a' }, { id: 'b' }]
  const prev = [{ id: 'x', unsaved: true }, { id: 'a' }, { id: 'old' }, { id: 'b', unsaved: true }]
  assert.deepEqual(withUnsaved(db, prev).map((m) => m.id), ['x', 'a', 'b'])
  assert.deepEqual(withUnsaved(db, []).map((m) => m.id), ['a', 'b'])
})

// 보강(T05 r3) — 느린 기기에서 바로 끄면 가리던 방이 드러난다. 분리 간격을 2배로 낮춘 단계를 먼저 거친다
test('느림 단계 — 분리 간격 1→2, 2 에서 또 느리면 끔', () => {
  assert.equal(slowerEvery(1), 2)
  assert.equal(slowerEvery(BG.maxEvery), 0)
  // 분리 80ms·합성만 5ms 인 기기 : 매 프레임 분리면 12.5fps(끔 대상), 2장마다 분리면 평균 42.5ms = 23.5fps(유지)
  assert.equal(run(80, 4.2), true)
  const w = slowWatch()
  let off = false
  let i = 0
  for (let t = 0; t <= 10000; t += 33) off = w(i++ % 2 === 0 ? 80 : 5, t) || off
  assert.equal(off, false)
})

// 회귀(T05 r1) — 내 이미지 썸네일·삭제 버튼 이름이 모두 같아 낭독기로 구별 불가, 저장 실패를 '불러오지 못함'으로 오안내
test('효과 문구 — 내 이미지 번호·저장 실패·멈춤 문구가 ko·en 모두 있다', async () => {
  const { readFileSync } = await import('node:fs')
  for (const lang of ['ko', 'en']) {
    const fx = JSON.parse(readFileSync(new URL(`../../../../../messages/${lang}.json`, import.meta.url), 'utf8')).room.effects
    assert.match(fx.myItem, /\{n\}/, lang)
    assert.match(fx.myDel, /\{n\}/, lang)
    assert.ok(fx.mySaveFail && fx.bgStopped && fx.autoOff, lang)
  }
})

// 회귀(T05 r2) — 흐림을 켠 채 못 읽는 이미지(HEIC 등)를 고르면 실패와 함께 배경이 '없음'으로 떨어져 가리던 방이 상대에게 드러났다
test('새 선택 실패 — 앞 배경이 켜져 있으면 그대로 둔다', () => {
  assert.equal(failBack('blur', true), 'blur')
  assert.equal(failBack('p:dusk', true), 'p:dusk')
  assert.equal(failBack('blur', false), 'none') // 송출 중이 아니었으면(파이프라인이 끔 등) 없음
  assert.equal(failBack('none', false), 'none')
})

// 보강(T05 r2) — 분리기는 엄격히 커지는 시각만 받는다. 정밀도를 낮춘 타이머가 같은 값을 주면 프레임마다 예외 → 30회 뒤 배경이 꺼졌다
test('분리 시각 — 같은·거꾸로 간 시각도 1ms 씩 올린다', () => {
  assert.equal(nextTs(0, 100), 100)
  assert.equal(nextTs(100, 100), 101)
  assert.equal(nextTs(101, 100), 102)
  assert.equal(nextTs(102, 200), 200)
})

// 보강(T05 r2) — '내 이미지 추가'의 파일 입력은 sr-only 라 키보드 포커스가 안 보였다
test('내 이미지 추가 타일 — 키보드 포커스 표시', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')
  assert.match(src, /focus-within:ring-2/)
  assert.match(src, /type="file"[\s\S]{0,80}sr-only/)
})
