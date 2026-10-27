// 배경 효과 판정 시험 — node --test src/components/room/features/backgrounds/rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BG, checkMine, coverRect, overflowIds, pipelineKilled, slowWatch } from './rules.ts'

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

test('파이프라인 끔 판정 — 사용자 끔·고르는 중·이미 없음은 아니다', () => {
  assert.equal(pipelineKilled(false, 'blur', 'idle'), true) // 연속 실패로 꺼짐 → 알림·분리기 버림
  assert.equal(pipelineKilled(false, 'none', 'idle'), false) // choose('none') 은 선택부터 '없음'
  assert.equal(pipelineKilled(false, 'p:dusk', 'loading'), false) // 처음 고르는 중
  assert.equal(pipelineKilled(true, 'blur', 'idle'), false)
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
