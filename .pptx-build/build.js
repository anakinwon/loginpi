// Cafe.pi 인큐베이팅 소개서 생성 스크립트 (pptxgenjs)
// 디자인: 딥 인디고/바이올렛 + 골드 액센트, 8장, 16:9 와이드
const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const fa = require('react-icons/fa')

// ── 팔레트 ──────────────────────────────────────────────
const C = {
  dark: '1A1340', // 딥 인디고 (타이틀/클로징 배경)
  dark2: '241A52', // 살짝 밝은 인디고 (장식)
  primary: '4C1D95', // 바이올렛 700
  violet: '7C3AED', // 바이올렛 500
  violetLt: 'A78BFA', // 바이올렛 300
  gold: 'F5A623', // 앰버/골드 (Pi 코인 액센트)
  goldLt: 'FBD38D',
  light: 'F7F6FB', // 라벤더 화이트 (콘텐츠 배경)
  card: 'FFFFFF',
  ink: '20183A', // 본문 텍스트
  muted: '6B6580', // 캡션
  line: 'E6E2F0',
}
const FONT = 'Malgun Gothic' // 한글 가독성 (Windows 기본)

// ── 아이콘 래스터화 ────────────────────────────────────
async function icon(IconComp, hex, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComp, { color: '#' + hex, size: String(size) }),
  )
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return 'image/png;base64,' + png.toString('base64')
}
const makeShadow = () => ({
  type: 'outer',
  color: '1A1340',
  blur: 9,
  offset: 3,
  angle: 90,
  opacity: 0.12,
})

const pres = new pptxgen()
pres.defineLayout({ name: 'W', width: 13.333, height: 7.5 })
pres.layout = 'W'
pres.author = 'anakin'
pres.title = 'Cafe.pi 인큐베이팅 소개서'
const W = 13.333
const H = 7.5

// ── 공통 헬퍼 ──────────────────────────────────────────
// 콘텐츠 슬라이드 헤더 (eyebrow 라벨 + 타이틀)
function contentHeader(slide, eyebrow, title) {
  slide.background = { color: C.light }
  // 좌측 골드 세로 마커
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 0.62,
    w: 0.07,
    h: 0.92,
    fill: { color: C.gold },
    line: { type: 'none' },
  })
  slide.addText(eyebrow, {
    x: 0.82,
    y: 0.6,
    w: 11,
    h: 0.32,
    margin: 0,
    fontFace: FONT,
    fontSize: 12.5,
    bold: true,
    color: C.violet,
    charSpacing: 2,
  })
  slide.addText(title, {
    x: 0.8,
    y: 0.9,
    w: 12,
    h: 0.66,
    margin: 0,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: C.ink,
  })
}
// 하단 푸터
function footer(slide, pageNo) {
  slide.addText('Cafe.pi  ·  Pi Network 풀스택 인큐베이팅 플랫폼', {
    x: 0.8,
    y: 7.04,
    w: 9,
    h: 0.3,
    margin: 0,
    fontFace: FONT,
    fontSize: 9,
    color: C.muted,
  })
  slide.addText(String(pageNo).padStart(2, '0'), {
    x: 12.2,
    y: 7.04,
    w: 0.5,
    h: 0.3,
    margin: 0,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: C.violet,
    align: 'right',
  })
}

async function build() {
  // 자주 쓰는 아이콘 미리 래스터화
  const I = {
    userShield: await icon(fa.FaUserShield, 'FFFFFF'),
    globe: await icon(fa.FaGlobe, 'FFFFFF'),
    comments: await icon(fa.FaComments, 'FFFFFF'),
    coins: await icon(fa.FaCoins, 'FFFFFF'),
    sync: await icon(fa.FaSyncAlt, 'FFFFFF'),
    handshake: await icon(fa.FaHandshake, 'FFFFFF'),
    users: await icon(fa.FaUsers, 'FFFFFF'),
    store: await icon(fa.FaStore, 'FFFFFF'),
    mapPin: await icon(fa.FaMapMarkerAlt, 'FFFFFF'),
    lock: await icon(fa.FaLock, 'FFFFFF'),
    database: await icon(fa.FaDatabase, 'FFFFFF'),
    rocket: await icon(fa.FaRocket, 'FFFFFF'),
    shield: await icon(fa.FaShieldAlt, 'FFFFFF'),
    layers: await icon(fa.FaLayerGroup, 'FFFFFF'),
    language: await icon(fa.FaLanguage, 'FFFFFF'),
    paperPlane: await icon(fa.FaPaperPlane, 'FFFFFF'),
    tags: await icon(fa.FaTags, 'FFFFFF'),
    userCog: await icon(fa.FaUserCog, 'FFFFFF'),
    sitemap: await icon(fa.FaSitemap, 'FFFFFF'),
    bolt: await icon(fa.FaBolt, 'FFFFFF'),
    check: await icon(fa.FaCheckCircle, C.violet),
    checkGold: await icon(fa.FaCheckCircle, C.gold),
    seedling: await icon(fa.FaSeedling, 'FFFFFF'),
    chart: await icon(fa.FaChartLine, 'FFFFFF'),
  }

  // 아이콘 원 (컬러 OVAL + 중앙 아이콘) — 시각 모티프
  function iconCircle(slide, x, y, d, circleColor, iconData, pad) {
    slide.addShape(pres.shapes.OVAL, {
      x,
      y,
      w: d,
      h: d,
      fill: { color: circleColor },
      line: { type: 'none' },
      shadow: makeShadow(),
    })
    const p = pad == null ? d * 0.27 : pad
    slide.addImage({
      data: iconData,
      x: x + p,
      y: y + p,
      w: d - 2 * p,
      h: d - 2 * p,
    })
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 1 — 타이틀
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    s.background = { color: C.dark }
    // 장식 원 (우상단, 좌하단)
    s.addShape(pres.shapes.OVAL, {
      x: 9.7,
      y: -2.0,
      w: 5.6,
      h: 5.6,
      fill: { color: C.primary, transparency: 55 },
      line: { type: 'none' },
    })
    s.addShape(pres.shapes.OVAL, {
      x: 11.3,
      y: 1.2,
      w: 2.6,
      h: 2.6,
      fill: { color: C.gold, transparency: 70 },
      line: { type: 'none' },
    })
    s.addShape(pres.shapes.OVAL, {
      x: -1.4,
      y: 5.0,
      w: 4.2,
      h: 4.2,
      fill: { color: C.violet, transparency: 65 },
      line: { type: 'none' },
    })

    // eyebrow
    s.addText('PI NETWORK 풀스택 플랫폼 · 인큐베이팅 제안', {
      x: 0.9,
      y: 1.55,
      w: 10,
      h: 0.4,
      margin: 0,
      fontFace: FONT,
      fontSize: 13.5,
      bold: true,
      color: C.goldLt,
      charSpacing: 2,
    })
    // 로고타입
    s.addText(
      [
        { text: 'Cafe', options: { color: 'FFFFFF' } },
        { text: '.pi', options: { color: C.gold } },
      ],
      {
        x: 0.82,
        y: 2.0,
        w: 11,
        h: 1.5,
        margin: 0,
        fontFace: FONT,
        fontSize: 76,
        bold: true,
      },
    )
    s.addText('검증된 Pi 앱 모듈을 그대로 이식하는, 가장 빠른 출시 경로', {
      x: 0.9,
      y: 3.55,
      w: 11,
      h: 0.55,
      margin: 0,
      fontFace: FONT,
      fontSize: 21,
      color: 'D9D2F0',
    })
    // 핵심 4축 칩
    const chips = [
      '글로벌 커뮤니케이션',
      'Pi 경제 엔진',
      '위치기반 O2O',
      '기업형 표준',
    ]
    let cx = 0.9
    chips.forEach((t) => {
      const w = 0.42 + t.length * 0.205
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx,
        y: 4.45,
        w,
        h: 0.5,
        rectRadius: 0.25,
        fill: { color: 'FFFFFF', transparency: 88 },
        line: { color: C.violetLt, width: 1 },
      })
      s.addText(t, {
        x: cx,
        y: 4.45,
        w,
        h: 0.5,
        margin: 0,
        align: 'center',
        valign: 'middle',
        fontFace: FONT,
        fontSize: 12.5,
        bold: true,
        color: 'FFFFFF',
      })
      cx += w + 0.25
    })
    // 하단 메타 바
    s.addShape(pres.shapes.LINE, {
      x: 0.9,
      y: 6.35,
      w: 11.5,
      h: 0,
      line: { color: 'FFFFFF', width: 0.75, transparency: 70 },
    })
    s.addText(
      [
        {
          text: 'loginpi.vercel.app',
          options: { bold: true, color: 'FFFFFF' },
        },
        {
          text: '      18개 Phase 구현 완료 · 203개 locale 글로벌 배포',
          options: { color: 'B7AEDB' },
        },
      ],
      {
        x: 0.9,
        y: 6.5,
        w: 11.5,
        h: 0.4,
        margin: 0,
        fontFace: FONT,
        fontSize: 12.5,
      },
    )
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 2 — 인큐베이팅 가치 제안
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    s.background = { color: C.dark }
    s.addShape(pres.shapes.OVAL, {
      x: 10.6,
      y: -2.2,
      w: 5.4,
      h: 5.4,
      fill: { color: C.primary, transparency: 60 },
      line: { type: 'none' },
    })

    s.addText('WHY INCUBATING', {
      x: 0.9,
      y: 0.7,
      w: 8,
      h: 0.35,
      margin: 0,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: C.goldLt,
      charSpacing: 2,
    })
    s.addText('처음부터 만들지 않는다.\n검증된 자산을 이식한다.', {
      x: 0.85,
      y: 1.05,
      w: 7.4,
      h: 1.6,
      margin: 0,
      fontFace: FONT,
      fontSize: 33,
      bold: true,
      color: 'FFFFFF',
      lineSpacingMultiple: 1.05,
    })
    s.addText(
      'Pi Browser의 쿠키 미저장·결제 트랩·다국어 배포 같은 함정을 이미 통과한 18개 Phase의 코드가 그대로 출발점이 됩니다. 새 Pi 앱은 0에서가 아니라, 실증된 아키텍처에서 시작합니다.',
      {
        x: 0.9,
        y: 2.95,
        w: 7.0,
        h: 1.7,
        margin: 0,
        fontFace: FONT,
        fontSize: 15,
        color: 'CFC8E8',
        lineSpacingMultiple: 1.3,
      },
    )
    // 핵심 한 줄 강조
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.9,
      y: 4.95,
      w: 0.07,
      h: 1.15,
      fill: { color: C.gold },
      line: { type: 'none' },
    })
    s.addText(
      [
        {
          text: '“로그인되고 결제된다”',
          options: { bold: true, color: C.goldLt },
        },
        {
          text: '는 두 가지 절대 가치 위에,\n모든 기능이 실기기 검증을 거쳐 쌓였습니다.',
          options: { color: 'E4DEF5' },
        },
      ],
      {
        x: 1.12,
        y: 4.98,
        w: 6.8,
        h: 1.1,
        margin: 0,
        fontFace: FONT,
        fontSize: 15.5,
        lineSpacingMultiple: 1.25,
      },
    )

    // 우측 스탯 콜아웃 3종
    const stats = [
      {
        n: '18',
        u: '개 Phase',
        d: '인증·결제·카페·번역·커머스·LBS 전 영역 구현 완료',
      },
      {
        n: '203',
        u: '개 locale',
        d: '통화·국가 자동 매핑, 재배포 없이 활성화',
      },
      {
        n: '<1',
        u: '초 번역',
        d: 'Gemini Flash + Claude Haiku 하이브리드 동시통역',
      },
    ]
    let yy = 0.95
    stats.forEach((st) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 8.55,
        y: yy,
        w: 4.0,
        h: 1.78,
        rectRadius: 0.08,
        fill: { color: C.dark2 },
        line: { color: C.primary, width: 1 },
      })
      s.addShape(pres.shapes.RECTANGLE, {
        x: 8.55,
        y: yy,
        w: 0.09,
        h: 1.78,
        fill: { color: C.gold },
        line: { type: 'none' },
      })
      s.addText(
        [
          {
            text: st.n,
            options: { fontSize: 44, bold: true, color: 'FFFFFF' },
          },
          {
            text: '  ' + st.u,
            options: { fontSize: 16, bold: true, color: C.violetLt },
          },
        ],
        {
          x: 8.85,
          y: yy + 0.12,
          w: 3.6,
          h: 0.85,
          margin: 0,
          fontFace: FONT,
          valign: 'middle',
        },
      )
      s.addText(st.d, {
        x: 8.85,
        y: yy + 1.0,
        w: 3.5,
        h: 0.66,
        margin: 0,
        fontFace: FONT,
        fontSize: 11.5,
        color: 'B9B1D8',
        lineSpacingMultiple: 1.15,
      })
      yy += 1.95
    })
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 3 — 4대 특장점 오버뷰 (2x2)
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    contentHeader(
      s,
      '특장점 한눈에  ·  4 PILLARS',
      '네 개의 축으로 완성되는 Pi 생태계',
    )
    const cards = [
      {
        ic: I.globe,
        col: C.violet,
        no: '01',
        t: '글로벌 커뮤니케이션',
        d: '계정통합 · 다국어 페이지 · 채팅 실시간 번역으로\n언어 장벽 없는 글로벌 커뮤니티',
      },
      {
        ic: I.coins,
        col: C.gold,
        no: '02',
        t: 'Pi 경제 엔진',
        d: '결제·송금(PiRC1) · 구독(PiRC2) · 에스크로(PiRC3)\nPi Coin 트랜잭션 풀스택',
      },
      {
        ic: I.mapPin,
        col: C.primary,
        no: '03',
        t: '위치기반 O2O',
        d: '커뮤니티 · 중고 직거래 · 오프라인 매장 활성화\n온라인에서 실물경제로 연결',
      },
      {
        ic: I.database,
        col: '1C7293',
        no: '04',
        t: '기업형 프로그램 표준',
        d: '로그인·권한·관리자 표준 + DB 표준안(표준·모델·품질)\n엔터프라이즈 거버넌스',
      },
    ]
    const cw = 5.85,
      ch = 2.32,
      gx = 0.63,
      gy = 0.4
    const x0 = 0.8,
      y0 = 1.95
    cards.forEach((c, i) => {
      const cx = x0 + (i % 2) * (cw + gx)
      const cy = y0 + Math.floor(i / 2) * (ch + gy)
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: cy,
        w: cw,
        h: ch,
        fill: { color: C.card },
        line: { color: C.line, width: 1 },
        shadow: makeShadow(),
      })
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: cy,
        w: 0.1,
        h: ch,
        fill: { color: c.col },
        line: { type: 'none' },
      })
      iconCircle(s, cx + 0.42, cy + 0.45, 1.0, c.col, c.ic)
      s.addText(c.no, {
        x: cx + cw - 1.3,
        y: cy + 0.28,
        w: 1.05,
        h: 0.7,
        margin: 0,
        align: 'right',
        fontFace: FONT,
        fontSize: 36,
        bold: true,
        color: C.line,
      })
      s.addText(c.t, {
        x: cx + 1.7,
        y: cy + 0.42,
        w: cw - 2.6,
        h: 0.5,
        margin: 0,
        fontFace: FONT,
        fontSize: 18.5,
        bold: true,
        color: C.ink,
      })
      s.addText(c.d, {
        x: cx + 1.7,
        y: cy + 0.98,
        w: cw - 1.95,
        h: 1.1,
        margin: 0,
        fontFace: FONT,
        fontSize: 12.5,
        color: C.muted,
        lineSpacingMultiple: 1.25,
      })
    })
    footer(s, 3)
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 4 — 특징① 글로벌 커뮤니케이션
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    contentHeader(
      s,
      '특징 ①  ·  GLOBAL COMMUNICATION',
      '계정통합 · 다국어 · 실시간 번역',
    )
    const rows = [
      {
        ic: I.userShield,
        col: C.violet,
        t: '계정통합',
        d: 'Pi 계정 + Google 계정을 6자리 OTP로 안전하게 연동. Pi Browser 쿠키 미저장 문제를 X-Pi-Token 이중 경로로 완벽 우회.',
        tag: 'HMAC 세션 · 크로스 브라우저',
      },
      {
        ic: I.globe,
        col: '1C7293',
        t: '페이지 다국어 처리',
        d: '203개 locale 선점 등록, 통화·국가 자동 매핑. ko 정본 기준 AI 자동번역(Gemini 2.5 Flash)으로 재배포 없이 언어 확장.',
        tag: 'next-intl v4 · 18개 언어 기본',
      },
      {
        ic: I.comments,
        col: C.gold,
        t: '채팅 실시간 번역',
        d: 'PiTranslate™ — 어떤 언어로 채팅해도 상대의 선택 언어로 1초 내 동시통역. 캐시·중복 제거로 비용 약 76% 절감.',
        tag: 'Gemini Flash + Claude Haiku 하이브리드',
      },
    ]
    let yy = 2.0
    const rh = 1.48
    rows.forEach((r) => {
      s.addShape(pres.shapes.RECTANGLE, {
        x: 0.8,
        y: yy,
        w: 11.73,
        h: rh,
        fill: { color: C.card },
        line: { color: C.line, width: 1 },
        shadow: makeShadow(),
      })
      iconCircle(s, 1.15, yy + 0.34, 0.8, r.col, r.ic)
      s.addText(r.t, {
        x: 2.25,
        y: yy + 0.22,
        w: 3.3,
        h: 0.5,
        margin: 0,
        fontFace: FONT,
        fontSize: 17,
        bold: true,
        color: C.ink,
      })
      s.addText(r.tag, {
        x: 2.25,
        y: yy + 0.78,
        w: 3.4,
        h: 0.5,
        margin: 0,
        fontFace: FONT,
        fontSize: 11,
        bold: true,
        color: r.col,
        lineSpacingMultiple: 1.1,
      })
      s.addShape(pres.shapes.LINE, {
        x: 5.75,
        y: yy + 0.26,
        w: 0,
        h: rh - 0.52,
        line: { color: C.line, width: 1 },
      })
      s.addText(r.d, {
        x: 6.05,
        y: yy + 0.2,
        w: 6.25,
        h: rh - 0.4,
        margin: 0,
        valign: 'middle',
        fontFace: FONT,
        fontSize: 13,
        color: C.ink,
        lineSpacingMultiple: 1.3,
      })
      yy += rh + 0.28
    })
    footer(s, 4)
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 5 — 특징② Pi 경제 엔진 (3 컬럼)
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    contentHeader(
      s,
      '특징 ②  ·  PI ECONOMY ENGINE',
      '결제·송금 · 구독 · 에스크로',
    )
    const cols = [
      {
        ic: I.coins,
        col: C.gold,
        badge: 'PiRC1',
        t: '결제 · 송금',
        d: 'Pi Coin U2A 3단계 결제 흐름. 미완료 결제 자동 복구로 영구 차단 트랩 방지.',
        items: [
          '결제 메타데이터 7종 분기',
          'A2U 자동 송금·환불',
          '서버 측 금액 재검증',
        ],
      },
      {
        ic: I.sync,
        col: C.violet,
        badge: 'PiRC2',
        t: '구독 서비스',
        d: 'Soroban 스마트 컨트랙트 기반 반복 결제. 플랜·자동갱신·체험기간 관리.',
        items: [
          'register / subscribe / process',
          '월·연 구독 플랜',
          '자동갱신 토글',
        ],
      },
      {
        ic: I.handshake,
        col: '1C7293',
        badge: 'PiRC3',
        t: '에스크로 서비스',
        d: 'P2P 직거래 대금을 플랫폼이 보관·정산. 분쟁 조정으로 거래 신뢰 확보.',
        items: ['거래 상태머신', '취소수수료·역할 판정', '가상 에스크로 정산'],
      },
    ]
    const cw = 3.79,
      gx = 0.18
    const x0 = 0.8,
      y0 = 1.95,
      chh = 4.5
    cols.forEach((c, i) => {
      const cx = x0 + i * (cw + gx)
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: chh,
        fill: { color: C.card },
        line: { color: C.line, width: 1 },
        shadow: makeShadow(),
      })
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: 0.12,
        fill: { color: c.col },
        line: { type: 'none' },
      })
      iconCircle(s, cx + 0.4, y0 + 0.42, 0.92, c.col, c.ic)
      // 배지
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: cx + cw - 1.55,
        y: y0 + 0.5,
        w: 1.2,
        h: 0.42,
        rectRadius: 0.21,
        fill: { color: c.col },
        line: { type: 'none' },
      })
      s.addText(c.badge, {
        x: cx + cw - 1.55,
        y: y0 + 0.5,
        w: 1.2,
        h: 0.42,
        margin: 0,
        align: 'center',
        valign: 'middle',
        fontFace: FONT,
        fontSize: 12.5,
        bold: true,
        color: 'FFFFFF',
      })
      s.addText(c.t, {
        x: cx + 0.4,
        y: y0 + 1.55,
        w: cw - 0.8,
        h: 0.45,
        margin: 0,
        fontFace: FONT,
        fontSize: 18,
        bold: true,
        color: C.ink,
      })
      s.addText(c.d, {
        x: cx + 0.4,
        y: y0 + 2.05,
        w: cw - 0.7,
        h: 1.0,
        margin: 0,
        fontFace: FONT,
        fontSize: 12,
        color: C.muted,
        lineSpacingMultiple: 1.28,
      })
      let iy = y0 + 3.15
      c.items.forEach((it) => {
        s.addImage({
          data: I.check,
          x: cx + 0.42,
          y: iy + 0.03,
          w: 0.18,
          h: 0.18,
        })
        s.addText(it, {
          x: cx + 0.68,
          y: iy - 0.04,
          w: cw - 1.0,
          h: 0.34,
          margin: 0,
          fontFace: FONT,
          fontSize: 11.5,
          color: C.ink,
          valign: 'middle',
        })
        iy += 0.4
      })
    })
    footer(s, 5)
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 6 — 특징③ 위치기반 O2O (플로우)
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    contentHeader(
      s,
      '특징 ③  ·  LOCATION-BASED O2O',
      '위치기반 커뮤니티 · 중고 직거래 · 오프라인 매장',
    )
    s.addText(
      '온라인 커뮤니티에서 시작해 실물경제로 흐르는 완전 순환 — 동의 기반 위치 수집으로 거리 가까운 사용자·상품·매장을 연결합니다.',
      {
        x: 0.8,
        y: 1.85,
        w: 11.7,
        h: 0.55,
        margin: 0,
        fontFace: FONT,
        fontSize: 13.5,
        color: C.muted,
        lineSpacingMultiple: 1.25,
      },
    )
    const steps = [
      {
        ic: I.users,
        col: C.violet,
        no: '01',
        t: '위치기반 커뮤니티',
        d: '내 주변 테마 카페·음성채널을 거리순으로 탐색. 같은 동네 관심사 사용자와 실시간 연결.',
      },
      {
        ic: I.tags,
        col: C.gold,
        no: '02',
        t: '위치기반 중고 직거래',
        d: 'PiShop(MPS) — Pi Coin 직거래 마켓. 거리 표시로 성사율을 높인 배송 없는 P2P 거래.',
      },
      {
        ic: I.store,
        col: '1C7293',
        no: '03',
        t: '오프라인 매장 활성화',
        d: '구글 매장 반자동 인증등록 + 오프라인 주문 상태머신(주문→준비→픽업/배달). 지도 위 상품 판매.',
      },
    ]
    const cw = 3.7,
      gap = 0.52
    const x0 = 0.8,
      y0 = 2.62,
      chh = 3.5
    steps.forEach((st, i) => {
      const cx = x0 + i * (cw + gap)
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: chh,
        fill: { color: C.card },
        line: { color: C.line, width: 1 },
        shadow: makeShadow(),
      })
      iconCircle(s, cx + cw / 2 - 0.6, y0 + 0.42, 1.2, st.col, st.ic)
      s.addText(st.no, {
        x: cx + 0.25,
        y: y0 + 0.2,
        w: 1.0,
        h: 0.55,
        margin: 0,
        fontFace: FONT,
        fontSize: 26,
        bold: true,
        color: C.line,
      })
      s.addText(st.t, {
        x: cx + 0.3,
        y: y0 + 1.85,
        w: cw - 0.6,
        h: 0.5,
        margin: 0,
        align: 'center',
        fontFace: FONT,
        fontSize: 16.5,
        bold: true,
        color: C.ink,
      })
      s.addText(st.d, {
        x: cx + 0.35,
        y: y0 + 2.4,
        w: cw - 0.7,
        h: 0.95,
        margin: 0,
        align: 'center',
        fontFace: FONT,
        fontSize: 12,
        color: C.muted,
        lineSpacingMultiple: 1.28,
      })
      // 화살표 (마지막 제외)
      if (i < steps.length - 1) {
        s.addText('→', {
          x: cx + cw + 0.02,
          y: y0 + chh / 2 - 0.4,
          w: gap - 0.04,
          h: 0.8,
          margin: 0,
          align: 'center',
          valign: 'middle',
          fontFace: FONT,
          fontSize: 28,
          bold: true,
          color: C.violetLt,
        })
      }
    })
    footer(s, 6)
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 7 — 특징④ 기업형 표준 (2 컬럼)
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    contentHeader(
      s,
      '특징 ④  ·  ENTERPRISE STANDARD',
      '기업형 프로그램 표준 + DB 표준안 제안',
    )
    const blocks = [
      {
        ic: I.lock,
        col: C.primary,
        t: '기업형 프로그램 표준',
        sub: '로그인 · 권한 · 관리자',
        rows: [
          { h: '통합 로그인', d: 'Pi·Google 이중 인증 경로 + HMAC 세션 표준' },
          {
            h: '권한 체계 (RBAC)',
            d: 'ADMIN·MASTER·MANAGER·USER 역할 매트릭스',
          },
          {
            h: '관리자 시스템',
            d: '대시보드·사용자·결제·통계·승인 워크플로우',
          },
        ],
      },
      {
        ic: I.database,
        col: '1C7293',
        t: 'DB 표준안 제안',
        sub: '표준 · 모델 · 품질',
        rows: [
          { h: '표준 (사전)', d: '표준단어·도메인·용어 사전 + DDL 자동 생성' },
          { h: '모델', d: '시스템 컬럼 4종·논리삭제 전 테이블 일관 적용' },
          { h: '품질', d: 'DDL 자동 감사 + 변경이력(Audit) + 승인 게이트' },
        ],
      },
    ]
    const cw = 5.76,
      gx = 0.21
    const x0 = 0.8,
      y0 = 1.95,
      chh = 4.55
    blocks.forEach((b, i) => {
      const cx = x0 + i * (cw + gx)
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: chh,
        fill: { color: C.card },
        line: { color: C.line, width: 1 },
        shadow: makeShadow(),
      })
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: 0.12,
        fill: { color: b.col },
        line: { type: 'none' },
      })
      iconCircle(s, cx + 0.42, y0 + 0.46, 0.95, b.col, b.ic)
      s.addText(b.t, {
        x: cx + 1.55,
        y: y0 + 0.5,
        w: cw - 1.8,
        h: 0.45,
        margin: 0,
        fontFace: FONT,
        fontSize: 18.5,
        bold: true,
        color: C.ink,
      })
      s.addText(b.sub, {
        x: cx + 1.55,
        y: y0 + 0.98,
        w: cw - 1.8,
        h: 0.35,
        margin: 0,
        fontFace: FONT,
        fontSize: 12.5,
        bold: true,
        color: b.col,
        charSpacing: 1,
      })
      let ry = y0 + 1.78
      const rhh = 0.82
      b.rows.forEach((r) => {
        s.addShape(pres.shapes.RECTANGLE, {
          x: cx + 0.4,
          y: ry,
          w: cw - 0.8,
          h: rhh,
          fill: { color: C.light },
          line: { type: 'none' },
        })
        s.addShape(pres.shapes.RECTANGLE, {
          x: cx + 0.4,
          y: ry,
          w: 0.06,
          h: rhh,
          fill: { color: b.col },
          line: { type: 'none' },
        })
        s.addText(r.h, {
          x: cx + 0.62,
          y: ry + 0.1,
          w: cw - 1.1,
          h: 0.32,
          margin: 0,
          fontFace: FONT,
          fontSize: 13.5,
          bold: true,
          color: C.ink,
        })
        s.addText(r.d, {
          x: cx + 0.62,
          y: ry + 0.42,
          w: cw - 1.1,
          h: 0.34,
          margin: 0,
          fontFace: FONT,
          fontSize: 11.5,
          color: C.muted,
        })
        ry += rhh + 0.16
      })
    })
    footer(s, 7)
  }

  // ════════════════════════════════════════════════════
  // 슬라이드 8 — 인큐베이팅 패키지 + 클로징
  // ════════════════════════════════════════════════════
  {
    const s = pres.addSlide()
    s.background = { color: C.dark }
    s.addShape(pres.shapes.OVAL, {
      x: -1.6,
      y: -2.0,
      w: 5.2,
      h: 5.2,
      fill: { color: C.primary, transparency: 60 },
      line: { type: 'none' },
    })
    s.addShape(pres.shapes.OVAL, {
      x: 11.2,
      y: 4.6,
      w: 3.4,
      h: 3.4,
      fill: { color: C.gold, transparency: 72 },
      line: { type: 'none' },
    })

    s.addText('AI 인큐베이터 패키지', {
      x: 0.9,
      y: 0.66,
      w: 10,
      h: 0.4,
      margin: 0,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: C.goldLt,
      charSpacing: 2,
    })
    s.addText('당신의 Pi 앱을 4단계로 인큐베이팅합니다', {
      x: 0.85,
      y: 1.02,
      w: 11.6,
      h: 0.7,
      margin: 0,
      fontFace: FONT,
      fontSize: 29,
      bold: true,
      color: 'FFFFFF',
    })

    const pkgs = [
      {
        ic: I.seedling,
        t: '베이직',
        d: '인증·결제·다국어 코어 이식 + 셋업 가이드',
      },
      {
        ic: I.layers,
        t: '프리미엄',
        d: '카페·구독·커머스 모듈 + 커스터마이징',
      },
      {
        ic: I.shield,
        t: '플래티넘',
        d: 'LBS·음성·에스크로 + DB 표준 거버넌스 구축',
      },
      {
        ic: I.rocket,
        t: '인피니티',
        d: '전 모듈 + 전용 자문·운영 + 외주 연계',
      },
    ]
    const cw = 2.86,
      gx = 0.21
    const x0 = 0.85,
      y0 = 2.1,
      chh = 2.95
    pkgs.forEach((p, i) => {
      const cx = x0 + i * (cw + gx)
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: chh,
        fill: { color: C.dark2 },
        line: { color: C.primary, width: 1 },
      })
      s.addShape(pres.shapes.RECTANGLE, {
        x: cx,
        y: y0,
        w: cw,
        h: 0.1,
        fill: { color: i === 3 ? C.gold : C.violet },
        line: { type: 'none' },
      })
      iconCircle(
        s,
        cx + cw / 2 - 0.5,
        y0 + 0.42,
        1.0,
        i === 3 ? C.gold : C.violet,
        p.ic,
      )
      s.addText(p.t, {
        x: cx + 0.2,
        y: y0 + 1.55,
        w: cw - 0.4,
        h: 0.45,
        margin: 0,
        align: 'center',
        fontFace: FONT,
        fontSize: 18,
        bold: true,
        color: 'FFFFFF',
      })
      s.addText(p.d, {
        x: cx + 0.28,
        y: y0 + 2.05,
        w: cw - 0.56,
        h: 0.8,
        margin: 0,
        align: 'center',
        fontFace: FONT,
        fontSize: 11,
        color: 'C3BBE0',
        lineSpacingMultiple: 1.22,
      })
    })

    // 클로징 메시지 바
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.85,
      y: 5.5,
      w: 0.08,
      h: 1.0,
      fill: { color: C.gold },
      line: { type: 'none' },
    })
    s.addText(
      [
        {
          text: 'Pi가 온라인에서 오프라인 실물경제로 흐르는 완전한 순환.',
          options: { bold: true, color: 'FFFFFF', breakLine: true },
        },
        {
          text: '검증된 플랫폼 위에서, 당신의 아이디어를 가장 빠르게 출시하세요.',
          options: { color: 'CFC8E8' },
        },
      ],
      {
        x: 1.1,
        y: 5.5,
        w: 9.5,
        h: 1.0,
        margin: 0,
        fontFace: FONT,
        fontSize: 16.5,
        lineSpacingMultiple: 1.3,
        valign: 'middle',
      },
    )
    s.addText('loginpi.vercel.app', {
      x: 9.4,
      y: 6.78,
      w: 3.1,
      h: 0.4,
      margin: 0,
      align: 'right',
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: C.goldLt,
    })
  }

  await pres.writeFile({ fileName: '../docs/Cafe.pi설명서.pptx' })
  console.log('생성 완료: docs/Cafe.pi설명서.pptx')
}

build().catch((e) => {
  console.error(e)
  process.exit(1)
})
