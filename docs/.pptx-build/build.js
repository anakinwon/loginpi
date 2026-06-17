/* cafe.pi 제품소개서 — 단기 4목표 버전 (pptxgenjs)
 * 청중: cafe.pi를 경험할 비개발자 파이오니어 + 잠재 buyer
 * 글로벌 5단계(대외비)는 의도적으로 제외. 단기 4목표만 노출.
 * 팔레트: 딥 퍼플(인디고) + Pi Coin 골드
 */
const pptxgen = require('pptxgenjs')
const OUT =
  'C:/Users/anaki/workspace/cafe-pi-claude/docs/제품설명서_202060615.pptx'

const pres = new pptxgen()
pres.defineLayout({ name: 'W', width: 13.333, height: 7.5 })
pres.layout = 'W'
pres.author = 'cafe.pi'
pres.title = 'cafe.pi 제품소개서'

const C = {
  dark: '1A1145',
  deep: '2A1A66',
  purple: '5B2A9D',
  violet: '7C3AED',
  lilac: '9B8BC4',
  bgLight: 'F7F5FB',
  card: 'FFFFFF',
  cardAlt: 'EEE9F8',
  gold: 'F5B731',
  goldDk: 'C98A12',
  ink: '241B3A',
  gray: '6B6485',
  white: 'FFFFFF',
}
const HF = 'Malgun Gothic'
const BF = 'Malgun Gothic'
const W = 13.333,
  H = 7.5
const shadow = () => ({
  type: 'outer',
  color: '1A1145',
  blur: 9,
  offset: 3,
  angle: 135,
  opacity: 0.18,
})

function bg(slide, color) {
  slide.background = { color }
}
function header(slide, kicker, title, opt = {}) {
  slide.addText(kicker.toUpperCase(), {
    x: 0.6,
    y: 0.42,
    w: 12,
    h: 0.3,
    margin: 0,
    fontFace: HF,
    fontSize: 12,
    bold: true,
    color: opt.kickerColor || C.purple,
    charSpacing: 3,
  })
  slide.addText(title, {
    x: 0.6,
    y: 0.72,
    w: 12.1,
    h: 0.7,
    margin: 0,
    fontFace: HF,
    fontSize: 29,
    bold: true,
    color: opt.titleColor || C.ink,
  })
}
function pageNum(slide, n) {
  slide.addText(String(n).padStart(2, '0'), {
    x: 12.5,
    y: 6.95,
    w: 0.6,
    h: 0.35,
    margin: 0,
    fontFace: BF,
    fontSize: 11,
    color: C.lilac,
    align: 'right',
  })
  slide.addText('cafe.pi', {
    x: 0.6,
    y: 6.95,
    w: 4,
    h: 0.35,
    margin: 0,
    fontFace: BF,
    fontSize: 10,
    color: C.lilac,
  })
}
function iconCircle(slide, x, y, d, fill, emoji, emSize) {
  slide.addShape(pres.shapes.OVAL, {
    x,
    y,
    w: d,
    h: d,
    fill: { color: fill },
    line: { type: 'none' },
  })
  slide.addText(emoji, {
    x,
    y: y - 0.02,
    w: d,
    h: d,
    margin: 0,
    fontFace: BF,
    fontSize: emSize || 18,
    align: 'center',
    valign: 'middle',
  })
}

// ════════ 1. 표지 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, {
    x: 9.6,
    y: -1.7,
    w: 5.6,
    h: 5.6,
    fill: { color: C.purple, transparency: 60 },
    line: { type: 'none' },
  })
  s.addShape(pres.shapes.OVAL, {
    x: 11.2,
    y: 3.4,
    w: 4.2,
    h: 4.2,
    fill: { color: C.violet, transparency: 70 },
    line: { type: 'none' },
  })
  s.addShape(pres.shapes.OVAL, {
    x: 10.7,
    y: 1.0,
    w: 1.5,
    h: 1.5,
    fill: { color: C.gold },
    line: { type: 'none' },
  })
  s.addText('π', {
    x: 10.7,
    y: 0.92,
    w: 1.5,
    h: 1.5,
    margin: 0,
    fontFace: HF,
    fontSize: 40,
    bold: true,
    color: C.dark,
    align: 'center',
    valign: 'middle',
  })

  s.addText('PI NETWORK COMMUNITY PLATFORM', {
    x: 0.9,
    y: 1.5,
    w: 9,
    h: 0.4,
    margin: 0,
    fontFace: HF,
    fontSize: 13,
    bold: true,
    color: C.gold,
    charSpacing: 4,
  })
  s.addText('cafe.pi', {
    x: 0.85,
    y: 1.95,
    w: 10,
    h: 1.2,
    margin: 0,
    fontFace: HF,
    fontSize: 64,
    bold: true,
    color: C.white,
  })
  s.addText(
    [
      {
        text: '전세계가 모이는 Pi 커뮤니티',
        options: { color: C.gold, bold: true },
      },
    ],
    { x: 0.9, y: 3.35, w: 10.5, h: 0.5, margin: 0, fontFace: HF, fontSize: 23 },
  )
  s.addText('그리고, 코딩을 몰라도 누구나 쉽게 시작하는 나만의 Pi 서비스', {
    x: 0.9,
    y: 3.95,
    w: 10.5,
    h: 0.5,
    margin: 0,
    fontFace: BF,
    fontSize: 15,
    color: 'C9BEE6',
  })
  s.addText('쉽게 만들어 · 쉽게 설치하고 · 쉽게 쓴다 — 훈민정음의 정신으로', {
    x: 0.9,
    y: 4.5,
    w: 10.5,
    h: 0.45,
    margin: 0,
    fontFace: BF,
    fontSize: 13,
    color: 'B7ACD6',
    italic: true,
  })

  s.addShape(pres.shapes.LINE, {
    x: 0.9,
    y: 6.25,
    w: 11.5,
    h: 0,
    line: { color: C.purple, width: 1 },
  })
  s.addText(
    [
      { text: 'loginpi.vercel.app', options: { color: C.gold, bold: true } },
      { text: '      지금 무료로 열려 있습니다', options: { color: 'B7ACD6' } },
    ],
    { x: 0.9, y: 6.4, w: 8, h: 0.4, margin: 0, fontFace: BF, fontSize: 13 },
  )
  s.addText('제품소개서 · 2026.06.15', {
    x: 8,
    y: 6.4,
    w: 4.4,
    h: 0.4,
    margin: 0,
    fontFace: BF,
    fontSize: 13,
    color: 'B7ACD6',
    align: 'right',
  })
})()

// ════════ 2. 철학 — 훈민정음 ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, {
    x: 10.6,
    y: 4.6,
    w: 4.8,
    h: 4.8,
    fill: { color: C.purple, transparency: 65 },
    line: { type: 'none' },
  })
  s.addText('OUR PHILOSOPHY', {
    x: 0.7,
    y: 0.55,
    w: 8,
    h: 0.35,
    margin: 0,
    fontFace: HF,
    fontSize: 13,
    bold: true,
    color: C.gold,
    charSpacing: 4,
  })
  s.addText('훈민정음의 정신으로', {
    x: 0.65,
    y: 0.92,
    w: 11,
    h: 0.7,
    margin: 0,
    fontFace: HF,
    fontSize: 34,
    bold: true,
    color: C.white,
  })

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 2.0,
    w: 11.9,
    h: 1.75,
    fill: { color: C.deep },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 2.0,
    w: 0.12,
    h: 1.75,
    fill: { color: C.gold },
    line: { type: 'none' },
  })
  s.addText(
    [
      {
        text: '"만들고 싶은 Pi 앱이 있어도, 기술이 없어 펴지 못하는 파이오니어가 많으니라.\n',
        options: { color: C.white, bold: true },
      },
      { text: '  내 이를 위하여 가엾이 여겨, ', options: { color: 'D9CFF2' } },
      { text: '쉽게 가져다 쓰게', options: { color: C.gold, bold: true } },
      { text: ' 하노라."', options: { color: 'D9CFF2' } },
    ],
    {
      x: 1.1,
      y: 2.1,
      w: 11.2,
      h: 1.55,
      margin: 0,
      fontFace: HF,
      fontSize: 18,
      valign: 'middle',
      lineSpacingMultiple: 1.15,
    },
  )

  const vals = [
    ['🇰🇷', '자주(自主)', 'Pi 생태계가 외부 빅테크 없이 자립한다'],
    ['🤍', '애민(愛民)', '기술 없는 파이오니어를 위해 만든다'],
    ['⚡', '실용(實用)', '쉽게 만들고 · 설치하고 · 쓴다'],
  ]
  const cw = 3.85,
    gap = 0.35,
    x0 = 0.7,
    y = 4.1,
    ch = 1.95
  vals.forEach((v, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.deep },
      line: { color: C.purple, width: 1 },
    })
    iconCircle(s, x + 0.3, y + 0.32, 0.85, C.purple, v[0], 26)
    s.addText(v[1], {
      x: x + 1.3,
      y: y + 0.45,
      w: cw - 1.5,
      h: 0.5,
      margin: 0,
      fontFace: HF,
      fontSize: 18,
      bold: true,
      color: C.gold,
    })
    s.addText(v[2], {
      x: x + 0.32,
      y: y + 1.15,
      w: cw - 0.6,
      h: 0.65,
      margin: 0,
      fontFace: BF,
      fontSize: 12.5,
      color: 'D9CFF2',
    })
  })
  s.addText('앱을 못 만들던 사람도, 만들 수 있는 세상.', {
    x: 0.7,
    y: 6.5,
    w: 12,
    h: 0.5,
    margin: 0,
    fontFace: HF,
    fontSize: 16,
    bold: true,
    color: C.white,
    align: 'center',
    italic: true,
  })
})()

// ════════ 3. cafe.pi란? ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'cafe.pi란?', 'Pi 커뮤니티가 모이는 광장')
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 1.75,
    w: 6.3,
    h: 4.6,
    fill: { color: C.dark },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addText(
    [
      {
        text: '우리가 직접 만들고 운영하는\n',
        options: { color: C.white, bold: true },
      },
      { text: '전세계 Pi 사용자의\n', options: { color: C.white, bold: true } },
      { text: '커뮤니티 광장', options: { color: C.gold, bold: true } },
    ],
    {
      x: 0.95,
      y: 2.15,
      w: 5.7,
      h: 1.9,
      margin: 0,
      fontFace: HF,
      fontSize: 26,
      lineSpacingMultiple: 1.1,
    },
  )
  s.addText(
    'Pi 계정만 있으면 누구나 들어와 관심사로 모이고, Pi를 주고받습니다. 지금 무료로 열려 있습니다.',
    {
      x: 0.95,
      y: 4.7,
      w: 5.6,
      h: 1.0,
      margin: 0,
      fontFace: BF,
      fontSize: 14,
      color: 'C9BEE6',
    },
  )
  s.addText('백 마디 설명보다, 한 번 들어와 보세요 → loginpi.vercel.app', {
    x: 0.95,
    y: 5.75,
    w: 5.6,
    h: 0.5,
    margin: 0,
    fontFace: BF,
    fontSize: 12.5,
    color: C.gold,
    bold: true,
  })
  // 우측 두 기둥
  const pillars = [
    [
      '🗣️',
      'PiChat',
      '관심사로 모이는 채팅·카페 커뮤니티. 실시간 동시통역으로 언어 장벽 없이.',
    ],
    [
      '🛒',
      'PiShop',
      'Pi로 사고파는 직거래 장터. 내 주변 위치 기반으로 안전하게.',
    ],
  ]
  const px = 7.2,
    pw = 5.5,
    ph = 2.18,
    pgy = 0.24
  pillars.forEach((p, i) => {
    const y = 1.75 + i * (ph + pgy)
    s.addShape(pres.shapes.RECTANGLE, {
      x: px,
      y,
      w: pw,
      h: ph,
      fill: { color: C.card },
      line: { type: 'none' },
      shadow: shadow(),
    })
    s.addShape(pres.shapes.RECTANGLE, {
      x: px,
      y,
      w: 0.1,
      h: ph,
      fill: { color: C.gold },
      line: { type: 'none' },
    })
    iconCircle(s, px + 0.35, y + 0.4, 1.0, C.cardAlt, p[0], 32)
    s.addText(p[1], {
      x: px + 1.55,
      y: y + 0.45,
      w: pw - 1.8,
      h: 0.5,
      margin: 0,
      fontFace: HF,
      fontSize: 21,
      bold: true,
      color: C.purple,
    })
    s.addText(p[2], {
      x: px + 1.55,
      y: y + 1.05,
      w: pw - 1.85,
      h: 0.95,
      margin: 0,
      fontFace: BF,
      fontSize: 13,
      color: C.gray,
    })
  })
  pageNum(s, 3)
})()

// ════════ 4. 우리의 약속 (단기 4목표) ════════
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, '우리의 약속', '지금, 우리가 집중하는 네 가지')
  const goals = [
    [
      '🗣️',
      '① PiChat',
      '전세계가 모이는 커뮤니티',
      '무료로 시작 — 사람이 먼저',
      C.purple,
    ],
    [
      '🛒',
      '② PiShop',
      'Pi를 쓰는 곳을 넓힌다',
      '중고거래부터 내 주변까지',
      C.violet,
    ],
    [
      '🧰',
      '③ StarterKit',
      '나만의 Pi 서비스를 쉽게',
      '$100~$500, 부담 없이',
      C.deep,
    ],
    [
      '🤝',
      '④ 큰 프로젝트',
      '규모 있는 일은 함께',
      '믿을 파트너와 연계·외주',
      C.lilac,
    ],
  ]
  const cw = 5.9,
    ch = 2.18,
    gx = 0.35,
    gy = 0.32,
    x0 = 0.6,
    y0 = 1.75
  goals.forEach((g, i) => {
    const r = Math.floor(i / 2),
      c = i % 2
    const x = x0 + c * (cw + gx),
      y = y0 + r * (ch + gy)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.card },
      line: { type: 'none' },
      shadow: shadow(),
    })
    iconCircle(s, x + 0.35, y + 0.55, 1.05, g[4], g[0], 34)
    s.addText(g[1], {
      x: x + 1.6,
      y: y + 0.38,
      w: cw - 1.8,
      h: 0.45,
      margin: 0,
      fontFace: HF,
      fontSize: 19,
      bold: true,
      color: C.ink,
    })
    s.addText(g[2], {
      x: x + 1.6,
      y: y + 0.86,
      w: cw - 1.8,
      h: 0.45,
      margin: 0,
      fontFace: HF,
      fontSize: 14,
      bold: true,
      color: C.purple,
    })
    s.addText(g[3], {
      x: x + 1.6,
      y: y + 1.3,
      w: cw - 1.85,
      h: 0.7,
      margin: 0,
      fontFace: BF,
      fontSize: 12.5,
      color: C.gray,
    })
  })
  pageNum(s, 4)
})()

// ── 약속 상세 공통(좌측 컬러 패널) ──
function goalDetail(num, badge, name, tone, headline, points, footnote, dark) {
  const s = pres.addSlide()
  bg(s, dark ? C.dark : C.bgLight)
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 3.9,
    h: H,
    fill: { color: tone },
    line: { type: 'none' },
  })
  s.addText(badge, {
    x: 0.5,
    y: 1.0,
    w: 3,
    h: 0.5,
    margin: 0,
    fontFace: HF,
    fontSize: 15,
    bold: true,
    color: C.gold,
    charSpacing: 1,
  })
  s.addText(name, {
    x: 0.5,
    y: 1.55,
    w: 3.1,
    h: 1.4,
    margin: 0,
    fontFace: HF,
    fontSize: 34,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.0,
  })
  s.addText(headline, {
    x: 0.5,
    y: 3.2,
    w: 3.0,
    h: 2.5,
    margin: 0,
    fontFace: BF,
    fontSize: 15,
    color: 'F0EBFB',
    lineSpacingMultiple: 1.15,
  })

  const x0 = 4.3,
    areaW = W - x0 - 0.6
  let y = 1.3
  points.forEach((p) => {
    const ph = 1.35
    s.addShape(pres.shapes.RECTANGLE, {
      x: x0,
      y,
      w: areaW,
      h: ph,
      fill: { color: C.card },
      line: { type: 'none' },
      shadow: shadow(),
    })
    iconCircle(s, x0 + 0.3, y + 0.35, 0.65, C.cardAlt, p[0], 20)
    s.addText(p[1], {
      x: x0 + 1.15,
      y: y + 0.22,
      w: areaW - 1.4,
      h: 0.45,
      margin: 0,
      fontFace: HF,
      fontSize: 16,
      bold: true,
      color: C.ink,
    })
    s.addText(p[2], {
      x: x0 + 1.15,
      y: y + 0.66,
      w: areaW - 1.45,
      h: 0.6,
      margin: 0,
      fontFace: BF,
      fontSize: 12.5,
      color: C.gray,
    })
    y += ph + 0.22
  })
  if (footnote)
    s.addText(footnote, {
      x: x0,
      y: 6.95,
      w: areaW,
      h: 0.35,
      margin: 0,
      fontFace: BF,
      fontSize: 11.5,
      italic: true,
      color: C.purple,
    })
  pageNum(s, num)
}

// 5. 약속① PiChat
goalDetail(
  5,
  '약속 ①',
  'PiChat',
  C.purple,
  '전세계 Pi 사용자가 관심사로 모이는 커뮤니티. 사람을 모으는 일이 가장 먼저입니다.',
  [
    ['🌐', '관심사로 모인다', '여행·골프·먹방… 같은 취향의 Pi 사용자들과 카페'],
    [
      '💬',
      '언어 장벽이 없다',
      '실시간 동시통역 — 어떤 언어로 써도 내 언어로 읽힘',
    ],
    ['🎁', '무료로 시작', '오픈은 전액 무료 → 자리잡으면 아주 작은 수수료만'],
  ],
  '사람이 먼저, 수익은 천천히. 활성 사용자가 우리의 첫 번째 목표입니다.',
)

// 6. 약속② PiShop
goalDetail(
  6,
  '약속 ②',
  'PiShop',
  C.violet,
  'Pi로 사고파는 곳을 넓힙니다. 쓸 곳이 늘수록 Pi의 가치도 커집니다.',
  [
    ['📦', '개인 직거래부터', '내 물건을 Pi로 사고팔기 — 가장 쉬운 시작'],
    ['📍', '내 주변에서', '위치 기반으로 가까운 거래를 안전하게'],
    [
      '🌱',
      'Pi를 진짜 돈으로',
      'Pi를 쓸 곳이 많아질수록, Pi는 진짜 화폐가 됩니다',
    ],
  ],
  'Pi의 사용처를 키우는 것 — 이것이 cafe.pi 생태계의 든든한 교두보입니다.',
)

// 7. 약속③ StarterKit
goalDetail(
  7,
  '약속 ③',
  'StarterKit',
  C.deep,
  '나만의 Pi 서비스를 갖고 싶다면 — 코딩을 몰라도, 작게 시작할 수 있습니다.',
  [
    ['🧰', '검증된 부품을 그대로', '이미 만들어 운영 중인 모듈을 골라 빠르게'],
    ['🤝', '컨설팅과 함께', '기술이 없어도 됩니다. 함께 설계하고 세워드립니다'],
    [
      '💰',
      '$100 ~ $500, 부담 없이',
      '큰 비용 없이 작게 시작 → 필요한 만큼 확장',
    ],
  ],
  '비싸게 적게가 아니라, 누구나 쉽게. 더 많은 분이 Pi 서비스를 갖는 게 목표입니다.',
)

// 8. StarterKit 구성
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, 'StarterKit 구성', '$100~$500 — 필요한 만큼만 골라 담으세요')
  const mods = [
    ['🔐', 'Pi 로그인', 'Pi 계정 보안 로그인'],
    ['💳', 'Pi 결제', 'Pi Coin 결제 + 자동 복구'],
    ['🔗', '계정 연동', 'Pi + Google 안전 연결'],
    ['🛠️', '관리자', '사용자·결제 통합 관리'],
    ['📋', '게시판', '공지·자유·질문·자료'],
    ['🗄️', '데이터 표준', '기업급 데이터 품질'],
    ['🌐', '다국어', '전세계 언어 자동 지원'],
    ['📊', '통계·프로필', '활동 분석 + 마이페이지'],
  ]
  const cols = 4,
    cw = 2.95,
    gx = 0.13,
    ch = 1.95,
    gy = 0.25,
    x0 = 0.6,
    y0 = 1.7
  mods.forEach((m, i) => {
    const r = Math.floor(i / cols),
      c = i % cols
    const x = x0 + c * (cw + gx),
      y = y0 + r * (ch + gy)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.card },
      line: { type: 'none' },
      shadow: shadow(),
    })
    iconCircle(s, x + cw / 2 - 0.5, y + 0.3, 1.0, C.cardAlt, m[0], 32)
    s.addText(m[1], {
      x: x + 0.1,
      y: y + 1.35,
      w: cw - 0.2,
      h: 0.35,
      margin: 0,
      fontFace: HF,
      fontSize: 14.5,
      bold: true,
      color: C.ink,
      align: 'center',
    })
    s.addText(m[2], {
      x: x + 0.12,
      y: y + 1.66,
      w: cw - 0.24,
      h: 0.28,
      margin: 0,
      fontFace: BF,
      fontSize: 10.5,
      color: C.gray,
      align: 'center',
    })
  })
  s.addText(
    '이미 실서비스에서 검증된 부품들입니다 — 처음부터 만들 필요가 없습니다.',
    {
      x: 0.6,
      y: 6.55,
      w: 12,
      h: 0.4,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      italic: true,
      color: C.purple,
    },
  )
  pageNum(s, 8)
})()

// 9. 약속④ 큰 프로젝트
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, {
    x: 10.8,
    y: 4.4,
    w: 4.8,
    h: 4.8,
    fill: { color: C.purple, transparency: 65 },
    line: { type: 'none' },
  })
  s.addText('약속 ④', {
    x: 0.7,
    y: 0.55,
    w: 6,
    h: 0.4,
    margin: 0,
    fontFace: HF,
    fontSize: 15,
    bold: true,
    color: C.gold,
    charSpacing: 1,
  })
  s.addText('큰 프로젝트는, 함께', {
    x: 0.65,
    y: 0.95,
    w: 11,
    h: 0.7,
    margin: 0,
    fontFace: HF,
    fontSize: 32,
    bold: true,
    color: C.white,
  })
  s.addText(
    '규모 있는 프로젝트를 직접 다 떠안지 않습니다. 믿을 수 있는 파트너와 연계·외주로 함께합니다.',
    {
      x: 0.7,
      y: 1.75,
      w: 11.5,
      h: 0.5,
      margin: 0,
      fontFace: BF,
      fontSize: 14,
      color: 'C9BEE6',
    },
  )
  const cards = [
    ['🧩', '작은 건 빠르게', 'StarterKit으로 가볍게 직접 — 부담 없이'],
    ['🤝', '큰 건 함께', '규모 있는 개발은 검증된 파트너와 연계·외주'],
    ['🎯', '코어에 집중', '우리는 cafe.pi를 키우는 데 힘을 모읍니다'],
  ]
  const cw = 3.85,
    gap = 0.35,
    x0 = 0.7,
    y = 2.6,
    ch = 2.7
  cards.forEach((cd, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.deep },
      line: { color: C.purple, width: 1 },
    })
    iconCircle(s, x + 0.35, y + 0.4, 1.0, C.purple, cd[0], 32)
    s.addText(cd[1], {
      x: x + 0.3,
      y: y + 1.55,
      w: cw - 0.6,
      h: 0.45,
      margin: 0,
      fontFace: HF,
      fontSize: 17,
      bold: true,
      color: C.gold,
    })
    s.addText(cd[2], {
      x: x + 0.32,
      y: y + 2.0,
      w: cw - 0.6,
      h: 0.55,
      margin: 0,
      fontFace: BF,
      fontSize: 12.5,
      color: 'D9CFF2',
    })
  })
  s.addText('작은 건 빠르게, 큰 건 함께 — 자원을 cafe.pi에 집중합니다.', {
    x: 0.7,
    y: 5.75,
    w: 12,
    h: 0.5,
    margin: 0,
    fontFace: HF,
    fontSize: 15,
    bold: true,
    color: C.white,
    align: 'center',
    italic: true,
  })
  pageNum(s, 9)
})()

// 10. 신뢰의 근거
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, '신뢰의 근거', '기획이 아니라, 이미 배포해 운영 중입니다')
  const stats = [
    ['17', '개 Phase', '0단계부터 단계적으로 구현 완료'],
    ['14', '개 모듈', 'StarterKit으로 검증된 기능 블록'],
    ['203', '개 locale', '전 세계 국가·통화·언어 자동'],
    ['LIVE', '실서비스', 'loginpi.vercel.app 운영 중'],
  ]
  const cw = 2.95,
    gap = 0.2,
    x0 = 0.6,
    y = 1.95,
    ch = 2.6
  stats.forEach((st, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.dark },
      line: { type: 'none' },
      shadow: shadow(),
    })
    s.addText(st[0], {
      x: x + 0.1,
      y: y + 0.35,
      w: cw - 0.2,
      h: 1.0,
      margin: 0,
      fontFace: HF,
      fontSize: st[0] === 'LIVE' ? 40 : 54,
      bold: true,
      color: C.gold,
      align: 'center',
    })
    s.addText(st[1], {
      x: x + 0.1,
      y: y + 1.42,
      w: cw - 0.2,
      h: 0.4,
      margin: 0,
      fontFace: HF,
      fontSize: 16,
      bold: true,
      color: C.white,
      align: 'center',
    })
    s.addText(st[2], {
      x: x + 0.2,
      y: y + 1.85,
      w: cw - 0.4,
      h: 0.65,
      margin: 0,
      fontFace: BF,
      fontSize: 11,
      color: 'C9BEE6',
      align: 'center',
    })
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 4.95,
    w: W - 1.2,
    h: 1.55,
    fill: { color: C.card },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 4.95,
    w: 0.12,
    h: 1.55,
    fill: { color: C.gold },
    line: { type: 'none' },
  })
  s.addText('검증된 것을 그대로 드립니다', {
    x: 1.0,
    y: 5.2,
    w: 11.5,
    h: 0.5,
    margin: 0,
    fontFace: HF,
    fontSize: 20,
    bold: true,
    color: C.ink,
  })
  s.addText(
    '실제 사용자가 Pi로 로그인·결제·거래하는 환경에서 다듬어진 부품을 그대로 제공합니다. 보안·다국어·데이터 표준까지 기업 수준으로 기본 탑재됩니다.',
    {
      x: 1.0,
      y: 5.7,
      w: 11.4,
      h: 0.8,
      margin: 0,
      fontFace: BF,
      fontSize: 13,
      color: C.gray,
    },
  )
  pageNum(s, 10)
})()

// 11. 핵심 기술 7가지 (마스터 강조 포인트 · 별표 등급)
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(s, '핵심 기술', '우리가 특히 자신 있는 7가지')
  const star = (n) => '★'.repeat(n)

  // 상단: Pi 결제 시스템 3단계 진화 (PiRC1 → 2 → 3)
  s.addText('Pi 결제 시스템의 3단계 진화', {
    x: 0.6,
    y: 1.48,
    w: 9,
    h: 0.3,
    margin: 0,
    fontFace: HF,
    fontSize: 13,
    bold: true,
    color: C.purple,
  })
  const rc = [
    ['💳', 'PiRC1', '결제', 2, C.lilac],
    ['🔁', 'PiRC2', '구독', 2, C.purple],
    ['🛡️', 'PiRC3', '에스크로', 3, C.deep],
  ]
  const rcW = 3.6,
    rcGap = 0.55,
    rcX0 = 0.6,
    rcY = 1.82,
    rcH = 1.62
  rc.forEach((r, i) => {
    const x = rcX0 + i * (rcW + rcGap)
    const top = r[3] === 3
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: rcY,
      w: rcW,
      h: rcH,
      fill: { color: r[4] },
      line: { type: 'none' },
      shadow: shadow(),
    })
    let pad = 0
    if (top) {
      s.addShape(pres.shapes.RECTANGLE, {
        x,
        y: rcY,
        w: rcW,
        h: 0.4,
        fill: { color: C.gold },
        line: { type: 'none' },
      })
      s.addText('가장 강력한 차별점', {
        x,
        y: rcY + 0.04,
        w: rcW,
        h: 0.32,
        margin: 0,
        fontFace: HF,
        fontSize: 10.5,
        bold: true,
        color: C.dark,
        align: 'center',
      })
      pad = 0.42
    }
    iconCircle(
      s,
      x + 0.3,
      rcY + pad + 0.34,
      0.76,
      top ? C.gold : C.violet,
      r[0],
      23,
    )
    s.addText('Pi ' + r[1], {
      x: x + 1.2,
      y: rcY + pad + 0.26,
      w: rcW - 1.35,
      h: 0.3,
      margin: 0,
      fontFace: HF,
      fontSize: 11,
      bold: true,
      color: top ? C.gold : 'E7DEF8',
    })
    s.addText(r[2], {
      x: x + 1.2,
      y: rcY + pad + 0.55,
      w: rcW - 1.35,
      h: 0.4,
      margin: 0,
      fontFace: HF,
      fontSize: 19,
      bold: true,
      color: C.white,
    })
    s.addText(star(r[3]), {
      x: x + 1.2,
      y: rcY + pad + 0.98,
      w: rcW - 1.35,
      h: 0.28,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      color: C.gold,
    })
    if (i < 2)
      s.addText('→', {
        x: x + rcW - 0.02,
        y: rcY + 0.5,
        w: rcGap + 0.1,
        h: 0.6,
        margin: 0,
        fontFace: HF,
        fontSize: 24,
        bold: true,
        color: C.lilac,
        align: 'center',
        valign: 'middle',
      })
  })

  // 하단: 나머지 4가지 (등급 색상 바로 차등)
  const lo = [
    ['🔗', '계정 통합', 1, 'Pi + Google 두 계정을 하나로'],
    ['🌐', '203개국 다국어', 2, '모든 페이지가 전세계 언어로'],
    ['💬', '203개국 실시간 채팅', 3, '언어 달라도 실시간 동시통역'],
    ['📍', '위치기반 직거래', 3, '내 주변 거래에 특화된 강점'],
  ]
  const lw = 2.88,
    lg = 0.21,
    lx0 = 0.6,
    ly = 3.78,
    lh = 2.5
  lo.forEach((m, i) => {
    const x = lx0 + i * (lw + lg)
    const g = m[2]
    const barColor = g === 3 ? C.gold : g === 2 ? C.purple : C.lilac
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: ly,
      w: lw,
      h: lh,
      fill: { color: C.card },
      line: { type: 'none' },
      shadow: shadow(),
    })
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: ly,
      w: lw,
      h: 0.12,
      fill: { color: barColor },
      line: { type: 'none' },
    })
    iconCircle(
      s,
      x + lw / 2 - 0.48,
      ly + 0.35,
      0.96,
      g === 3 ? C.dark : C.cardAlt,
      m[0],
      30,
    )
    s.addText(m[1], {
      x: x + 0.1,
      y: ly + 1.42,
      w: lw - 0.2,
      h: 0.45,
      margin: 0,
      fontFace: HF,
      fontSize: 14,
      bold: true,
      color: C.ink,
      align: 'center',
    })
    s.addText(star(g), {
      x: x + 0.1,
      y: ly + 1.85,
      w: lw - 0.2,
      h: 0.28,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      color: g === 3 ? C.goldDk : C.purple,
      align: 'center',
    })
    s.addText(m[3], {
      x: x + 0.14,
      y: ly + 2.12,
      w: lw - 0.28,
      h: 0.32,
      margin: 0,
      fontFace: BF,
      fontSize: 10,
      color: C.gray,
      align: 'center',
    })
  })
  s.addText(
    '★ 별이 많을수록, 다른 곳에서 따라 하기 어려운 우리만의 강점입니다.',
    {
      x: 0.6,
      y: 6.5,
      w: 12,
      h: 0.35,
      margin: 0,
      fontFace: BF,
      fontSize: 11.5,
      italic: true,
      color: C.purple,
    },
  )
  pageNum(s, 11)
})()

// 12. Pi Browser 기술 해자
;(() => {
  const s = pres.addSlide()
  bg(s, C.bgLight)
  header(
    s,
    '우리의 강점',
    '아무나 못 푸는 Pi Browser 문제, 우리는 해결했습니다',
  )
  const colW = 5.85
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 1.75,
    w: colW,
    h: 4.55,
    fill: { color: C.card },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 1.75,
    w: colW,
    h: 0.7,
    fill: { color: 'B0413E' },
    line: { type: 'none' },
  })
  s.addText('❌  일반 개발사가 겪는 문제', {
    x: 0.8,
    y: 1.87,
    w: colW - 0.4,
    h: 0.45,
    margin: 0,
    fontFace: HF,
    fontSize: 16,
    bold: true,
    color: C.white,
  })
  const probs = [
    'Pi Browser는 쿠키를 저장 안 해 로그인이 자꾸 풀린다',
    '로그인 화면이 무한 반복되어 진입조차 못 한다',
    '결제 마지막 단계를 놓치면 고객이 영구 결제 불가',
  ]
  probs.forEach((p, i) => {
    const y = 2.75 + i * 1.1
    s.addText('•', {
      x: 0.85,
      y,
      w: 0.3,
      h: 0.5,
      margin: 0,
      fontFace: HF,
      fontSize: 16,
      bold: true,
      color: 'B0413E',
    })
    s.addText(p, {
      x: 1.15,
      y,
      w: colW - 0.7,
      h: 0.9,
      margin: 0,
      fontFace: BF,
      fontSize: 13.5,
      color: C.ink,
    })
  })
  const rx = 0.6 + colW + 0.4
  s.addShape(pres.shapes.RECTANGLE, {
    x: rx,
    y: 1.75,
    w: colW,
    h: 4.55,
    fill: { color: C.dark },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: rx,
    y: 1.75,
    w: colW,
    h: 0.7,
    fill: { color: C.purple },
    line: { type: 'none' },
  })
  s.addText('✓  cafe.pi는 해결했습니다', {
    x: rx + 0.2,
    y: 1.87,
    w: colW - 0.4,
    h: 0.45,
    margin: 0,
    fontFace: HF,
    fontSize: 16,
    bold: true,
    color: C.white,
  })
  const sols = [
    ['이중 인증 경로', '어떤 환경에서도 로그인이 유지됩니다'],
    ['무한 루프 차단', '안전한 화면 전환으로 진입 보장'],
    ['결제 자동 복구', '미완료 결제를 스스로 찾아 복구'],
  ]
  sols.forEach((sl, i) => {
    const y = 2.75 + i * 1.1
    iconCircle(s, rx + 0.25, y - 0.02, 0.5, C.gold, '✓', 15)
    s.addText(sl[0], {
      x: rx + 0.9,
      y: y - 0.05,
      w: colW - 1.1,
      h: 0.4,
      margin: 0,
      fontFace: HF,
      fontSize: 14.5,
      bold: true,
      color: C.gold,
    })
    s.addText(sl[1], {
      x: rx + 0.9,
      y: y + 0.33,
      w: colW - 1.15,
      h: 0.6,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      color: 'D9CFF2',
    })
  })
  s.addText(
    '실기기에서 로그인·결제를 반복 검증해 확보한, 따라 하기 어려운 노하우입니다.',
    {
      x: 0.6,
      y: 6.5,
      w: 12,
      h: 0.4,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      italic: true,
      color: C.purple,
    },
  )
  pageNum(s, 12)
})()

// 12. CTA
;(() => {
  const s = pres.addSlide()
  bg(s, C.dark)
  s.addShape(pres.shapes.OVAL, {
    x: -1.8,
    y: 4.2,
    w: 5.5,
    h: 5.5,
    fill: { color: C.purple, transparency: 65 },
    line: { type: 'none' },
  })
  s.addShape(pres.shapes.OVAL, {
    x: 11.0,
    y: -1.6,
    w: 4.5,
    h: 4.5,
    fill: { color: C.violet, transparency: 70 },
    line: { type: 'none' },
  })
  s.addText('이렇게 시작합니다', {
    x: 0.7,
    y: 0.7,
    w: 11,
    h: 0.7,
    margin: 0,
    fontFace: HF,
    fontSize: 30,
    bold: true,
    color: C.white,
  })
  const steps = [
    ['👀', '1. 경험하기', 'cafe.pi에 들어와 직접 써보세요. 지금 무료입니다.'],
    ['💬', '2. 상담하기', '나만의 Pi 서비스가 필요하면, 가볍게 물어보세요.'],
    ['🚀', '3. 시작하기', 'StarterKit으로 작게 시작 — 함께 세워드립니다.'],
  ]
  const cw = 3.85,
    gap = 0.35,
    x0 = 0.7,
    y = 1.85,
    ch = 2.4
  steps.forEach((st, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y,
      w: cw,
      h: ch,
      fill: { color: C.deep },
      line: { color: C.purple, width: 1 },
    })
    iconCircle(s, x + 0.35, y + 0.4, 1.0, C.purple, st[0], 32)
    s.addText(st[1], {
      x: x + 0.3,
      y: y + 1.5,
      w: cw - 0.6,
      h: 0.4,
      margin: 0,
      fontFace: HF,
      fontSize: 17,
      bold: true,
      color: C.gold,
    })
    s.addText(st[2], {
      x: x + 0.32,
      y: y + 1.9,
      w: cw - 0.6,
      h: 0.45,
      margin: 0,
      fontFace: BF,
      fontSize: 12,
      color: 'D9CFF2',
    })
  })
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.7,
    y: 4.75,
    w: W - 1.4,
    h: 1.25,
    fill: { color: C.gold },
    line: { type: 'none' },
    shadow: shadow(),
  })
  s.addText('지금 cafe.pi에서 경험하고, 당신만의 Pi 서비스를 작게 시작하세요', {
    x: 0.9,
    y: 4.9,
    w: W - 1.8,
    h: 0.5,
    margin: 0,
    fontFace: HF,
    fontSize: 19,
    bold: true,
    color: C.dark,
    valign: 'middle',
  })
  s.addText(
    '우리는 제품을 파는 것이 아니라, 함께 cafe.pi를 키우려 합니다. 사람이 모일수록, 모두의 Pi가 커집니다.',
    {
      x: 0.9,
      y: 5.42,
      w: W - 1.8,
      h: 0.45,
      margin: 0,
      fontFace: BF,
      fontSize: 12.5,
      color: '3A2A0A',
      valign: 'middle',
    },
  )
  s.addText(
    [
      { text: 'cafe.pi', options: { color: C.white, bold: true } },
      {
        text: '   ·   전세계가 모이는 Pi 커뮤니티   ·   ',
        options: { color: 'B7ACD6' },
      },
      { text: 'loginpi.vercel.app', options: { color: C.gold, bold: true } },
    ],
    {
      x: 0.7,
      y: 6.55,
      w: 12,
      h: 0.4,
      margin: 0,
      fontFace: BF,
      fontSize: 13,
      align: 'center',
    },
  )
})()

pres.writeFile({ fileName: OUT }).then((f) => console.log('생성 완료:', f))
