/* cafe.pi 인프라 환경 전략 — 개발·스테이징·운영 3단계 (pptxgenjs)
 * 청중: 마스터(운영 관리자). DB 1개·스테이징 부재 현황 → 3환경 분리 가이드.
 * 팔레트: 딥퍼플(인디고) + Pi 골드 + 환경 시맨틱컬러(DEV=블루/STG=앰버/PROD=퍼플)
 */
const pptxgen = require('pptxgenjs')
const OUT = 'C:/Users/anaki/workspace/cafe-pi-claude/docs/Infrastructure.pptx'

const pres = new pptxgen()
pres.defineLayout({ name: 'W', width: 13.333, height: 7.5 })
pres.layout = 'W'
pres.author = 'cafe.pi'
pres.title = 'cafe.pi 인프라 환경 전략 (Dev·Staging·Prod)'

const C = {
  dark: '1A1145', deep: '2A1A66', purple: '5B2A9D', violet: '7C3AED',
  lilac: '9B8BC4', bgLight: 'F7F5FB', card: 'FFFFFF', cardAlt: 'EEE9F8',
  gold: 'F5B731', goldDk: 'C98A12', ink: '241B3A', gray: '6B6485', white: 'FFFFFF',
  blue: '2563EB', blueLt: 'E9F0FF', amber: 'E8910C', amberLt: 'FCEFD6',
  green: '16A34A', red: 'DC2626',
}
const HF = 'Malgun Gothic', BF = 'Malgun Gothic'
const W = 13.333, H = 7.5

const bg = (s, color) => { s.background = { color } }
const shadow = () => ({ type: 'outer', color: '1A1145', blur: 8, offset: 3, angle: 135, opacity: 0.16 })

function header(s, kicker, title, opt = {}) {
  s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.42, w: 12, h: 0.3, margin: 0, fontFace: HF, fontSize: 12, bold: true, color: opt.kickerColor || C.purple, charSpacing: 3 })
  s.addText(title, { x: 0.6, y: 0.72, w: 12.1, h: 0.7, margin: 0, fontFace: HF, fontSize: 26, bold: true, color: opt.titleColor || C.ink })
}
function pageNum(s, n) {
  s.addText(String(n).padStart(2, '0'), { x: 12.5, y: 6.98, w: 0.6, h: 0.35, margin: 0, fontFace: BF, fontSize: 11, color: C.lilac, align: 'right' })
  s.addText('cafe.pi · Infrastructure', { x: 0.6, y: 6.98, w: 5, h: 0.35, margin: 0, fontFace: BF, fontSize: 10, color: C.lilac })
}

// 환경 카드 (3-tier 다이어그램용)
function envCard(s, x, w, name, emoji, head, tint, rows) {
  const y = 1.65, h = 4.7
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: C.white }, line: { color: head, width: 1.25 }, shadow: shadow() })
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.8, rectRadius: 0.1, fill: { color: head }, line: { type: 'none' } })
  s.addShape(pres.shapes.RECTANGLE, { x, y: y + 0.45, w, h: 0.35, fill: { color: head }, line: { type: 'none' } })
  s.addText(`${emoji}  ${name}`, { x, y, w, h: 0.8, margin: 0, fontFace: HF, fontSize: 17, bold: true, color: C.white, align: 'center', valign: 'middle' })
  let ry = y + 1.0
  rows.forEach((r) => {
    if (r.hl) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.12, y: ry - 0.04, w: w - 0.24, h: 0.66, rectRadius: 0.05, fill: { color: tint }, line: { type: 'none' } })
    s.addText(r.k, { x: x + 0.24, y: ry, w: w - 0.48, h: 0.24, margin: 0, fontFace: BF, fontSize: 9.5, bold: true, color: r.hl ? head : C.gray, charSpacing: 1 })
    s.addText(r.v, { x: x + 0.24, y: ry + 0.22, w: w - 0.48, h: 0.4, margin: 0, fontFace: BF, fontSize: r.hl ? 12.5 : 11, bold: !!r.hl, color: C.ink })
    ry += 0.74
  })
}
function chevron(s, x, y) {
  s.addShape(pres.shapes.CHEVRON, { x, y, w: 0.5, h: 0.62, fill: { color: C.gold }, line: { type: 'none' } })
  s.addText('승격', { x: x - 0.15, y: y - 0.42, w: 0.8, h: 0.3, margin: 0, fontFace: BF, fontSize: 9, bold: true, color: C.goldDk, align: 'center' })
}

// ════════ 1. 표지 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, { x: 9.4, y: -1.8, w: 6, h: 6, fill: { color: C.purple, transparency: 55 }, line: { type: 'none' } })
  s.addShape(pres.shapes.OVAL, { x: 11.4, y: 3.6, w: 4, h: 4, fill: { color: C.violet, transparency: 70 }, line: { type: 'none' } })
  s.addShape(pres.shapes.OVAL, { x: -1.2, y: 4.8, w: 4.2, h: 4.2, fill: { color: C.gold, transparency: 80 }, line: { type: 'none' } })
  s.addText('CAFE.PI · INFRASTRUCTURE STRATEGY', { x: 0.8, y: 2.0, w: 11, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.gold, charSpacing: 4 })
  s.addText('개발 · 스테이징 · 운영\n3단계 환경 전략', { x: 0.8, y: 2.5, w: 11.5, h: 2.0, margin: 0, fontFace: HF, fontSize: 44, bold: true, color: C.white, lineSpacingMultiple: 1.05 })
  s.addText('DEV  →  STAGING  →  PRODUCTION', { x: 0.85, y: 4.7, w: 11, h: 0.5, margin: 0, fontFace: BF, fontSize: 18, bold: true, color: C.lilac, charSpacing: 2 })
  s.addText('단일 DB·스테이징 부재 현황을 3환경 완전 분리로 — 안전한 마이그레이션·배포 거버넌스', { x: 0.85, y: 5.5, w: 11, h: 0.5, margin: 0, fontFace: BF, fontSize: 13, color: C.lilac })
  s.addText('2026-06-26', { x: 0.85, y: 6.6, w: 5, h: 0.35, margin: 0, fontFace: BF, fontSize: 11, color: C.gray })
})()

// ════════ 2. 현재(As-Is) vs 목표(To-Be) ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Why · 왜 바꿔야 하나', '현재(As-Is) → 목표(To-Be)')
  const card = (x, ttl, color, tint, lines) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.85, w: 5.85, h: 4.6, rectRadius: 0.1, fill: { color: C.white }, line: { color, width: 1.25 }, shadow: shadow() })
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.85, w: 5.85, h: 0.7, rectRadius: 0.1, fill: { color }, line: { type: 'none' } })
    s.addShape(pres.shapes.RECTANGLE, { x, y: 2.2, w: 5.85, h: 0.35, fill: { color }, line: { type: 'none' } })
    s.addText(ttl, { x, y: 1.85, w: 5.85, h: 0.7, margin: 0, fontFace: HF, fontSize: 16, bold: true, color: C.white, align: 'center', valign: 'middle' })
    s.addText(lines.map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 10 } })), { x: x + 0.3, y: 2.8, w: 5.25, h: 3.4, margin: 0, fontFace: BF, fontSize: 13.5, color: C.ink })
  }
  card(0.6, '⚠️  현재 (As-Is)', C.red, C.amberLt, [
    'DB 1개 — 운영 겸용 (분리 없음)',
    '스테이징 환경 없음',
    '개발·운영 환경 미분리',
    '운영 DB에서 직접 실험 → 사고 위험',
    '마이그레이션 검증 단계 부재',
  ])
  card(6.9, '✅  목표 (To-Be)', C.green, C.blueLt, [
    '3환경 완전 분리 (Dev·Staging·Prod)',
    'DB도 환경별 독립 프로젝트',
    'Dev→Staging→Prod 마이그레이션 파이프라인',
    '운영 데이터·시크릿 격리',
    '스테이징에서 리허설 후 운영 반영',
  ])
  pageNum(s, 2)
})()

// ════════ 3. 핵심 그림 — 3-Tier 아키텍처 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Core · 핵심 구조', '3단계 환경 아키텍처 — 환경마다 완전 분리')
  const w = 3.71
  envCard(s, 0.6, w, '개발 DEV', '🛠️', C.blue, C.blueLt, [
    { k: '코드', v: 'feature/* · localhost' },
    { k: '호스팅', v: '로컬 (pnpm dev)' },
    { k: 'DATABASE', v: '로컬 Supabase (CLI)', hl: true },
    { k: 'Pi 네트워크', v: 'Testnet / Sandbox' },
    { k: '데이터', v: '시드 · 더미' },
  ])
  envCard(s, 4.81, w, '스테이징 STAGING', '🧪', C.amber, C.amberLt, [
    { k: '코드', v: 'staging · Vercel Preview' },
    { k: '호스팅', v: 'Vercel Preview 배포' },
    { k: 'DATABASE', v: 'Supabase Staging 프로젝트', hl: true },
    { k: 'Pi 네트워크', v: 'Testnet (최종 리허설)' },
    { k: '데이터', v: '익명화 · 합성' },
  ])
  envCard(s, 9.02, w, '운영 PRODUCTION', '🚀', C.purple, C.cardAlt, [
    { k: '코드', v: 'master → Production' },
    { k: '호스팅', v: 'Vercel Production (커스텀 도메인)' },
    { k: 'DATABASE', v: 'Supabase Prod (현재 DB 승격)', hl: true },
    { k: 'Pi 네트워크', v: 'Mainnet (실 거래)' },
    { k: '데이터', v: '실제 사용자' },
  ])
  chevron(s, 4.34, 3.7)
  chevron(s, 8.55, 3.7)
  s.addText('⛔  DB는 환경마다 완전히 분리 — 절대 공유 금지   |   하위 환경의 사고가 운영에 닿지 않게', { x: 0.6, y: 6.5, w: 12.1, h: 0.4, margin: 0, fontFace: BF, fontSize: 12, bold: true, color: C.red, align: 'center' })
  s.addNotes('테스트넷=Dev/Staging, 메인넷=Prod. 테스트넷 검증은 메인넷에 승계되지 않으며, 운영(메인넷)은 별도 환경을 새로 구축해 검증·오픈한다.')
  pageNum(s, 3)
})()

// ════════ 4. 스테이징 DB 스위칭 메커니즘 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Deep-dive · 스테이징 DB 스위칭', 'Edge Config 무재배포 전환 + 운영DB 읽기 전용')

  // Edge Config 컨트롤러 (상단)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.45, y: 1.55, w: 6.4, h: 1.0, rectRadius: 0.1, fill: { color: C.white }, line: { color: C.gold, width: 1.5 }, shadow: shadow() })
  s.addText('⚡  Vercel Edge Config — 스위치 컨트롤러', { x: 3.45, y: 1.66, w: 6.4, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.goldDk, align: 'center' })
  s.addText('stagingDb = dev ⟷ prod   ·   무재배포 · 전 리전 ~5ms 반영', { x: 3.45, y: 2.06, w: 6.4, h: 0.4, margin: 0, fontFace: BF, fontSize: 11.5, color: C.gray, align: 'center' })

  // 제어 화살표 (Edge Config → 라우터)
  s.addShape(pres.shapes.DOWN_ARROW, { x: 6.4, y: 2.55, w: 0.5, h: 0.95, fill: { color: C.gold }, line: { type: 'none' } })
  s.addText('제어', { x: 6.95, y: 2.78, w: 0.9, h: 0.3, margin: 0, fontFace: BF, fontSize: 9, bold: true, color: C.goldDk })

  // 스테이징 WAS (좌)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 3.7, w: 2.85, h: 1.5, rectRadius: 0.1, fill: { color: C.white }, line: { color: C.amber, width: 1.5 }, shadow: shadow() })
  s.addText('🧪  스테이징 WAS', { x: 0.6, y: 3.95, w: 2.85, h: 0.4, margin: 0, fontFace: HF, fontSize: 13.5, bold: true, color: C.amber, align: 'center' })
  s.addText('Vercel Staging\n(staging 브랜치)', { x: 0.6, y: 4.35, w: 2.85, h: 0.7, margin: 0, fontFace: BF, fontSize: 11, color: C.ink, align: 'center' })

  // WAS → 라우터 화살표
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 3.5, y: 4.25, w: 1.0, h: 0.4, fill: { color: C.amber }, line: { type: 'none' } })

  // DB 라우터 (중앙)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 4.55, y: 3.7, w: 3.0, h: 1.5, rectRadius: 0.1, fill: { color: C.deep }, line: { type: 'none' }, shadow: shadow() })
  s.addText('🔀  DB 라우터', { x: 4.55, y: 3.92, w: 3.0, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.gold, align: 'center' })
  s.addText('supabase-admin.ts\n요청 시점에 DB 선택', { x: 4.55, y: 4.32, w: 3.0, h: 0.7, margin: 0, fontFace: BF, fontSize: 10.5, color: C.white, align: 'center' })

  // 라우터 → Dev DB (위, RW)
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 7.6, y: 3.46, w: 1.7, h: 0.36, fill: { color: C.green }, line: { type: 'none' } })
  s.addText('RW', { x: 7.6, y: 3.14, w: 1.7, h: 0.3, margin: 0, fontFace: BF, fontSize: 9.5, bold: true, color: C.green, align: 'center' })
  // 라우터 → Prod DB (아래, RO)
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 7.6, y: 5.06, w: 1.7, h: 0.36, fill: { color: C.purple }, line: { type: 'none' } })
  s.addText('읽기만 RO', { x: 7.5, y: 5.44, w: 1.9, h: 0.3, margin: 0, fontFace: BF, fontSize: 9.5, bold: true, color: C.purple, align: 'center' })

  // Dev DB (우상)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.4, y: 2.95, w: 3.33, h: 1.15, rectRadius: 0.1, fill: { color: C.white }, line: { color: C.green, width: 1.5 }, shadow: shadow() })
  s.addText('🛠️  개발 DB', { x: 9.4, y: 3.12, w: 3.33, h: 0.4, margin: 0, fontFace: HF, fontSize: 13.5, bold: true, color: C.green, align: 'center' })
  s.addText('읽기 + 쓰기  ·  기본값(안전)', { x: 9.4, y: 3.52, w: 3.33, h: 0.4, margin: 0, fontFace: BF, fontSize: 10.5, color: C.ink, align: 'center' })

  // Prod DB (우하, 읽기전용)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.4, y: 4.7, w: 3.33, h: 1.45, rectRadius: 0.1, fill: { color: C.cardAlt }, line: { color: C.purple, width: 1.5 }, shadow: shadow() })
  s.addText('🔒  운영 DB — 읽기 전용', { x: 9.4, y: 4.85, w: 3.33, h: 0.4, margin: 0, fontFace: HF, fontSize: 12.5, bold: true, color: C.purple, align: 'center' })
  s.addText('read-only 롤 / Read Replica /\nSupabase Branch (복제본)', { x: 9.4, y: 5.25, w: 3.33, h: 0.7, margin: 0, fontFace: BF, fontSize: 10, color: C.ink, align: 'center' })

  // 하단 경고 바
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 6.35, w: 12.13, h: 0.55, rectRadius: 0.08, fill: { color: 'FBE9E9' }, line: { color: C.red, width: 1 } })
  s.addText('⛔  운영DB로의 쓰기 경로 없음   ·   운영 환경 DB는 스위칭 불가(고정)   ·   마이그레이션 DDL은 Staging DB에서만', { x: 0.6, y: 6.35, w: 12.13, h: 0.55, margin: 0, fontFace: BF, fontSize: 11.5, bold: true, color: C.red, align: 'center', valign: 'middle' })

  s.addNotes('스테이징은 평소 개발DB(RW)로 안전하게 테스트하고, 필요 시 Edge Config 플래그로 운영DB를 읽기 전용으로만 연결한다. 운영 쓰기·DDL 경로는 원천 차단.')
  pageNum(s, 4)
})()

// ════════ 5. 스키마↑ / 데이터↓ 동기화 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Sync · 환경 간 동기화', '스키마 ↑ / 데이터 ↓ — 올바른 도구 선택')

  // 개발 DB (좌)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.9, y: 2.75, w: 3.7, h: 1.75, rectRadius: 0.1, fill: { color: C.white }, line: { color: C.blue, width: 1.5 }, shadow: shadow() })
  s.addText('🛠️  개발 DB', { x: 0.9, y: 3.05, w: 3.7, h: 0.45, margin: 0, fontFace: HF, fontSize: 16, bold: true, color: C.blue, align: 'center' })
  s.addText('로컬 Supabase (CLI)', { x: 0.9, y: 3.55, w: 3.7, h: 0.4, margin: 0, fontFace: BF, fontSize: 11.5, color: C.ink, align: 'center' })

  // 운영 DB (우)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.73, y: 2.75, w: 3.7, h: 1.75, rectRadius: 0.1, fill: { color: C.cardAlt }, line: { color: C.purple, width: 1.5 }, shadow: shadow() })
  s.addText('🚀  운영 DB', { x: 8.73, y: 3.05, w: 3.7, h: 0.45, margin: 0, fontFace: HF, fontSize: 16, bold: true, color: C.purple, align: 'center' })
  s.addText('Supabase Prod', { x: 8.73, y: 3.55, w: 3.7, h: 0.4, margin: 0, fontFace: BF, fontSize: 11.5, color: C.ink, align: 'center' })

  // ① 스키마 ↑ (dev → prod) 상단 우향 화살표
  s.addText('①  스키마 ↑  —  마이그레이션', { x: 4.55, y: 2.5, w: 4.15, h: 0.3, margin: 0, fontFace: HF, fontSize: 12, bold: true, color: C.green, align: 'center' })
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 4.72, y: 2.85, w: 3.8, h: 0.5, fill: { color: C.green }, line: { type: 'none' } })
  s.addText('db diff → db push  /  Branching', { x: 4.6, y: 2.92, w: 4.04, h: 0.36, margin: 0, fontFace: BF, fontSize: 10, bold: true, color: C.white, align: 'center', valign: 'middle' })

  // ② 데이터 ↓ (prod → dev) 하단 좌향 화살표
  s.addShape(pres.shapes.LEFT_ARROW, { x: 4.72, y: 3.9, w: 3.8, h: 0.5, fill: { color: C.blue }, line: { type: 'none' } })
  s.addText('🔒  마스킹 스냅샷 / seed', { x: 4.6, y: 3.97, w: 4.04, h: 0.36, margin: 0, fontFace: BF, fontSize: 10, bold: true, color: C.white, align: 'center', valign: 'middle' })
  s.addText('②  데이터 ↓  —  운영 PII 원본 금지', { x: 4.55, y: 4.45, w: 4.15, h: 0.3, margin: 0, fontFace: HF, fontSize: 12, bold: true, color: C.blue, align: 'center' })

  // 정보 칩 2개
  const chip = (x, emoji, ttl, body, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.15, w: 5.85, h: 1.05, rectRadius: 0.08, fill: { color: C.white }, line: { color, width: 1.25 }, shadow: shadow() })
    s.addText(`${emoji}  ${ttl}`, { x: x + 0.25, y: 5.27, w: 5.4, h: 0.35, margin: 0, fontFace: HF, fontSize: 12.5, bold: true, color })
    s.addText(body, { x: x + 0.25, y: 5.62, w: 5.4, h: 0.5, margin: 0, fontFace: BF, fontSize: 10.5, color: C.ink })
  }
  chip(0.6, '✅', 'CDC가 진짜 필요한 곳', '분석 웨어하우스(ETL/Pipelines) · 라이브 UI(Realtime). dev-prod 미러링용 아님', C.green)
  chip(6.88, '⛔', 'CDC ≠ dev-prod 동기화', '운영 PII 연속 복제 금지 · Kafka CDC는 과하고 부적합', C.red)

  // 하단 핵심 바
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 6.4, w: 12.13, h: 0.5, rectRadius: 0.08, fill: { color: C.deep }, line: { type: 'none' } })
  s.addText('스키마 = 마이그레이션(↑)   ·   데이터 = 마스킹 스냅샷(↓)   ·   Supabase Branching + CLI면 충분 (Kafka 불필요)', { x: 0.6, y: 6.4, w: 12.13, h: 0.5, margin: 0, fontFace: BF, fontSize: 11.5, bold: true, color: C.gold, align: 'center', valign: 'middle' })

  s.addNotes('스키마는 CDC가 아니라 마이그레이션으로 개발→운영. 데이터는 연속 CDC가 아니라 마스킹 스냅샷으로 운영→개발(PII 원본 금지). CDC(ETL/Realtime)의 본래 용도는 분석·라이브이지 환경 미러링이 아니다.')
  pageNum(s, 5)
})()

// ════════ 6. 승격 흐름 — 코드 + DB ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Flow · 승격 파이프라인', '코드와 DB는 단방향으로만 흐른다')
  const lane = (y, label, color, stages) => {
    s.addText(label, { x: 0.6, y: y - 0.05, w: 2, h: 0.4, margin: 0, fontFace: HF, fontSize: 13, bold: true, color })
    let x = 2.5
    const bw = 2.7, gap = 0.75
    stages.forEach((st, i) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y - 0.18, w: bw, h: 0.95, rectRadius: 0.08, fill: { color: C.white }, line: { color, width: 1.25 }, shadow: shadow() })
      s.addText(st, { x: x + 0.1, y: y - 0.18, w: bw - 0.2, h: 0.95, margin: 0, fontFace: BF, fontSize: 11.5, bold: true, color: C.ink, align: 'center', valign: 'middle' })
      if (i < stages.length - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + bw + 0.08, y: y + 0.05, w: gap - 0.16, h: 0.5, fill: { color }, line: { type: 'none' } })
      x += bw + gap
    })
  }
  lane(2.0, '코드 (git)', C.purple, ['feature/*\n(개발)', 'staging\n(PR·리뷰·검증)', 'master\n(운영 배포)'])
  lane(3.55, 'DB (sql/NNN)', C.blue, ['Dev 적용\n검증', 'Staging 적용\n검증', 'Prod 적용\n(최종)'])
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.95, w: 12.1, h: 1.55, rectRadius: 0.1, fill: { color: C.deep }, line: { type: 'none' }, shadow: shadow() })
  s.addText('불변 원칙', { x: 0.95, y: 5.1, w: 3, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.gold })
  s.addText([
    { text: '운영(Prod)에 먼저 적용 절대 금지 — 항상 Dev→Staging에서 검증 후 승격', options: { bullet: { code: '2022' }, breakLine: true, color: C.white, paraSpaceAfter: 6 } },
    { text: 'sql/NNN 번호·순서 유지 (DA 표준·da-ddl-guard) — 같은 마이그레이션을 각 환경에 순차 적용', options: { bullet: { code: '2022' }, breakLine: true, color: C.white, paraSpaceAfter: 6 } },
    { text: '롤백 = Vercel revert(코드) + 보상 마이그레이션(DB) · 물리 DELETE 금지(논리삭제)', options: { bullet: { code: '2022' }, breakLine: true, color: C.white } },
  ], { x: 1.0, y: 5.5, w: 11.4, h: 1.0, margin: 0, fontFace: BF, fontSize: 12 })
  pageNum(s, 6)
})()

// ════════ 5. 격리 원칙 — 데이터·시크릿 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Isolation · 격리', '데이터와 시크릿은 환경 경계를 넘지 않는다')
  const box = (x, y, w, h, emoji, ttl, lines, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: C.white }, line: { color, width: 1.25 }, shadow: shadow() })
    s.addText(`${emoji}  ${ttl}`, { x: x + 0.3, y: y + 0.22, w: w - 0.6, h: 0.4, margin: 0, fontFace: HF, fontSize: 15, bold: true, color })
    s.addText(lines.map((t) => ({ text: t, options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 8 } })), { x: x + 0.35, y: y + 0.8, w: w - 0.7, h: h - 1.0, margin: 0, fontFace: BF, fontSize: 12.5, color: C.ink })
  }
  box(0.6, 1.85, 5.85, 2.25, '🔒', '데이터 격리', [
    '운영 PII(실명·연락처·위치)는 하위 환경에 원본 복제 금지',
    '필요 시 마스킹·합성 데이터로 대체',
    '논리삭제(del_yn) 원칙 유지',
  ], C.purple)
  box(6.9, 1.85, 5.85, 2.25, '🔑', '시크릿 격리', [
    '환경별 키 완전 분리 (재사용 금지)',
    'SUPABASE_SERVICE_ROLE_KEY · PI_API_KEY(testnet↔mainnet)',
    'PI_SESSION_SECRET · AUTH_SECRET · CRON_SECRET',
  ], C.blue)
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 4.35, w: 12.1, h: 2.1, rectRadius: 0.1, fill: { color: C.cardAlt }, line: { type: 'none' }, shadow: shadow() })
  s.addText('🧩  Vercel 환경 스코프 = 3분리', { x: 0.95, y: 4.55, w: 11, h: 0.4, margin: 0, fontFace: HF, fontSize: 15, bold: true, color: C.ink })
  const scope = (x, t, sub, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 5.15, w: 3.75, h: 1.05, rectRadius: 0.08, fill: { color: C.white }, line: { color, width: 1.25 } })
    s.addText(t, { x, y: 5.27, w: 3.75, h: 0.4, margin: 0, fontFace: HF, fontSize: 13, bold: true, color, align: 'center' })
    s.addText(sub, { x: x + 0.15, y: 5.66, w: 3.45, h: 0.45, margin: 0, fontFace: BF, fontSize: 10.5, color: C.gray, align: 'center' })
  }
  scope(0.95, 'Development', '로컬 Supabase · Testnet', C.blue)
  scope(4.79, 'Preview', 'Staging DB · Testnet', C.amber)
  scope(8.63, 'Production', 'Prod DB · Mainnet', C.purple)
  pageNum(s, 7)
})()

// ════════ 6. 비용·도구 현실 가이드 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Cost · 현실적 도구', '무료 범위로 3환경 만들기')
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y: 1.85, w: 12.1, h: 2.3, rectRadius: 0.1, fill: { color: C.white }, line: { color: C.green, width: 1.25 }, shadow: shadow() })
  s.addText('💡  Supabase 무료 플랜 = 활성 프로젝트 보통 2개 → 이렇게 배치하면 무료로 3환경', { x: 0.95, y: 2.05, w: 11.4, h: 0.4, margin: 0, fontFace: HF, fontSize: 14.5, bold: true, color: C.ink })
  const tier = (x, t, sub, color) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.6, w: 3.75, h: 1.35, rectRadius: 0.08, fill: { color: C.bgLight }, line: { color, width: 1.25 } })
    s.addText(t, { x, y: 2.75, w: 3.75, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color, align: 'center' })
    s.addText(sub, { x: x + 0.2, y: 3.18, w: 3.35, h: 0.7, margin: 0, fontFace: BF, fontSize: 11, color: C.ink, align: 'center' })
  }
  tier(0.95, '🛠️ Dev', '로컬 Supabase (CLI)\n무료 · 무제한', C.blue)
  tier(4.79, '🧪 Staging', '클라우드 프로젝트 #1\n무료 티어', C.amber)
  tier(8.63, '🚀 Prod', '클라우드 프로젝트 #2\n(현재 DB) 무료 티어', C.purple)
  s.addText([
    { text: '확장 옵션 (트래픽·팀 성장 시):  Supabase Pro($25/월) + Branching(Git연동 preview DB)로 스테이징 자동화', options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 9 } },
    { text: 'Vercel:  환경 스코프(Development/Preview/Production)는 이미 쓰는 Pro에 포함 — 추가 비용 0', options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 9 } },
    { text: '주의:  무료 티어는 프로젝트 수·용량 제한이 바뀔 수 있으니 도입 직전 현행 한도 확인', options: { bullet: { code: '2022' }, breakLine: true } },
  ], { x: 1.0, y: 4.45, w: 11.6, h: 2.0, margin: 0, fontFace: BF, fontSize: 12.5, color: C.ink })
  pageNum(s, 8)
})()

// ════════ 7. 단계적 도입 로드맵 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'Roadmap · 단계적 도입', '단일 DB에서 3환경으로 — 점진 전환')
  const steps = [
    ['1', '운영 동결', '현재 단일 DB를 ‘운영(Prod)’으로 확정 · 직접 실험 금지', C.purple],
    ['2', 'Staging 신설', 'Supabase Staging 프로젝트 + sql/NNN 재생으로 스키마 복제 + 합성 데이터', C.amber],
    ['3', 'Dev 구성', '로컬 Supabase(CLI)로 개발 DB 분리', C.blue],
    ['4', '스코프 분리', 'Vercel env 3분리 — 각자 자기 DB·Pi 설정 가리키게', C.green],
    ['5', '파이프라인', '마이그레이션 규율 확립: Dev→Staging→Prod 순차 적용', C.deep],
    ['6', '메인넷 컷오버', '(출시 시점) Prod = Mainnet 전환 — 새 도메인·API Key·지갑', C.goldDk],
  ]
  let y = 1.85
  steps.forEach(([n, t, d, color]) => {
    s.addShape(pres.shapes.OVAL, { x: 0.7, y, w: 0.62, h: 0.62, fill: { color }, line: { type: 'none' } })
    s.addText(n, { x: 0.7, y: y - 0.02, w: 0.62, h: 0.62, margin: 0, fontFace: HF, fontSize: 18, bold: true, color: C.white, align: 'center', valign: 'middle' })
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.55, y: y - 0.05, w: 11.15, h: 0.72, rectRadius: 0.07, fill: { color: C.white }, line: { color, width: 1 }, shadow: shadow() })
    s.addText(t, { x: 1.8, y: y - 0.05, w: 2.5, h: 0.72, margin: 0, fontFace: HF, fontSize: 14, bold: true, color, valign: 'middle' })
    s.addText(d, { x: 4.3, y: y - 0.05, w: 8.2, h: 0.72, margin: 0, fontFace: BF, fontSize: 11.5, color: C.ink, valign: 'middle' })
    y += 0.82
  })
  pageNum(s, 9)
})()

// ════════ 8. 거버넌스 원칙 요약 (마무리) ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, { x: -1.5, y: -1.5, w: 5, h: 5, fill: { color: C.purple, transparency: 65 }, line: { type: 'none' } })
  s.addShape(pres.shapes.OVAL, { x: 10.5, y: 4.2, w: 4.5, h: 4.5, fill: { color: C.gold, transparency: 80 }, line: { type: 'none' } })
  s.addText('GOVERNANCE · 5대 원칙', { x: 0.8, y: 0.8, w: 11, h: 0.4, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.gold, charSpacing: 3 })
  s.addText('환경 거버넌스 원칙', { x: 0.8, y: 1.2, w: 11, h: 0.7, margin: 0, fontFace: HF, fontSize: 30, bold: true, color: C.white })
  const rules = [
    'DB는 환경마다 분리 — 절대 공유 금지',
    '마이그레이션은 Dev → Staging → Prod 순서로만',
    '운영 데이터·시크릿은 하위 환경으로 흐르지 않는다',
    '코드는 git, 스키마는 sql/NNN — 둘 다 단방향 승격',
    '운영 직접 변경 금지 — 항상 스테이징에서 리허설',
  ]
  let y = 2.25
  rules.forEach((r, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.8, y, w: 11.7, h: 0.74, rectRadius: 0.07, fill: { color: C.deep }, line: { type: 'none' } })
    s.addText(String(i + 1), { x: 1.0, y, w: 0.6, h: 0.74, margin: 0, fontFace: HF, fontSize: 20, bold: true, color: C.gold, align: 'center', valign: 'middle' })
    s.addText(r, { x: 1.75, y, w: 10.5, h: 0.74, margin: 0, fontFace: BF, fontSize: 14.5, bold: true, color: C.white, valign: 'middle' })
    y += 0.85
  })
  s.addText('cafe.pi · 인프라 환경 전략 · 2026-06-26', { x: 0.8, y: 6.9, w: 11, h: 0.35, margin: 0, fontFace: BF, fontSize: 10, color: C.lilac })
})()

pres.writeFile({ fileName: OUT }).then((f) => console.log('OK ->', f)).catch((e) => { console.error(e); process.exit(1) })
