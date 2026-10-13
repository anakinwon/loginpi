// sitemap.pi 도메인 상수·입력 검증(zod) — 서버 API와 클라이언트 폼이 공유. 코드값 정본은 sql/001_sitemap_phase1.sql CHECK 제약
import { z } from 'zod'

export const SITE_CTGR = [
  'COMMUNITY',
  'EDU',
  'SHOP',
  'CONTENT',
  'PERSONAL',
  'EVENT',
  'GAME',
  'TOOL',
  'ETC',
] as const
export type SiteCtgr = (typeof SITE_CTGR)[number]

// 사이트 상태 9종(PRD_USAGE_FEE_STATE §2, sql/012) — 심사 없음 : 신청(APPLYING) → 결제(PAID) → 사용(IN_USE) → 사용완료(USED, 재등록 창) → 만료(EXPIRED, 신청가능)
export const SITE_STS = [
  'DRAFT',
  'APPLYING',
  'PAID',
  'IN_USE',
  'USED',
  'EXPIRED',
  'REJECTED',
  'SUSPENDED',
  'WITHDRAWN',
] as const
export type SiteSts = (typeof SITE_STS)[number]

// 금지 카테고리 7종(PRD §5) + OWNERSHIP(도메인 소유 확인 불가 — 같은 사용자·도메인 재제출 409) + PAY_TIMEOUT(미결제 자동 반려) + ETC
// 재신청 영구 차단 사유(마스터 D2 2026-10-13) — 소유 확인 불가 + 금지 카테고리 7종. 심사 폐지 뒤 결제만으로 공개되므로 반려 이력으로 막는다
export const BLOCK_REAPPLY_RSN = [
  'OWNERSHIP',
  'GAMBLING',
  'NON_PI_PYMNT',
  'GIFT_CARD',
  'INVEST',
  'ADULT',
  'PII_COLLECT',
  'PI_BRAND',
] as const
export const RJCT_RSN = [
  'GAMBLING',
  'NON_PI_PYMNT',
  'GIFT_CARD',
  'INVEST',
  'ADULT',
  'PII_COLLECT',
  'PI_BRAND',
  'OWNERSHIP',
  'PAY_TIMEOUT',
  'ETC',
] as const

export const RPT_RSN = [
  'GAMBLING',
  'NON_PI_PYMNT',
  'GIFT_CARD',
  'INVEST',
  'ADULT',
  'PII_COLLECT',
  'PI_BRAND',
  'FRAUD',
  'BROKEN',
  'ETC',
] as const

export const LIMITS = {
  pageSize: 12,
  adminPageSize: 20,
  descMax: 500, // 기본형(PRD §3) — 멤버십 2,000자는 Phase 2
  nameMax: 100,
  cntcMax: 200,
  rpt: 1000,
  rsnCont: 500,
  searchMin: 2, // pg_trgm 3글자 단위 — UI 최소 2글자(CLAUDE.md 검색 표준)
  imgMaxBytes: 2 * 1024 * 1024,
  openMax: 5, // 사용자당 DRAFT+APPLYING 합계 상한(도메인 대량 선점 방지)
  payTimeoutMax: 3, // 같은 사용자·도메인 PAY_TIMEOUT 반려 횟수 상한(아래 시간 창 안) — 초과 시 409 APPLY_COOLDOWN
  payTimeoutWindowH: 24,
} as const

// 도메인 점유 상태 — DB 활성 UNIQUE(ux_site_mst_site_dom_nm_actv)와 동일. DRAFT·EXPIRED 는 점유하지 않는다(USED 는 직전 신청인 재등록 창)
export const OCCUPY_STS: SiteSts[] = [
  'APPLYING',
  'PAID',
  'IN_USE',
  'USED',
  'SUSPENDED',
]
// 사용자당 상한(openMax) 집계 대상
export const OPEN_STS: SiteSts[] = ['DRAFT', 'APPLYING']
// 신청(submit) 전이 출발 상태 → APPLYING. USED·EXPIRED 는 재등록(결제·사용기간 초기화)
export const APPLY_FROM_STS: SiteSts[] = [
  'DRAFT',
  'REJECTED',
  'USED',
  'EXPIRED',
]
// 등록 본문 수정 가능 상태(EXPIRED 는 재신청만 — submit 필수). IN_USE 는 도메인·요금제·이동 URL 잠금
export const EDITABLE_STS: SiteSts[] = [
  'DRAFT',
  'APPLYING',
  'REJECTED',
  'IN_USE',
  'USED',
]
export const DOMAIN_EDITABLE_STS: SiteSts[] = ['DRAFT', 'REJECTED']
// 철회 불가 — PAID(결제만 날아감)·SUSPENDED(제재 회피)·WITHDRAWN
export const WITHDRAW_BLOCKED_STS: SiteSts[] = [
  'PAID',
  'SUSPENDED',
  'WITHDRAWN',
]

// 도메인 소유 확인 파일 경로 — 등록자가 자기 사이트에 vrfy_tkn 을 게시, 관리자가 수동 확인(.pi 는 서버 fetch 불가)
export const VERIFY_FILE = '/sitemap-verify.txt'

export const IMG_BUCKET = 'site-img'
// 회사 로고 한 변(px) — 신청 폼이 올리기 전에 이 크기 정사각형으로 맞춘다(중앙 자르기). 메인 버블·목록이 원형으로 그린다(마스터 지시 2026-10-13)
export const LOGO_PX = 300
export const IMG_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

// 단일 라벨 .pi 도메인, 소문자 — DB CHECK(site_mst_site_dom_nm_check)와 동일
export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.pi$/
// 신청자가 고를 수 있는 등록 요금제(단가는 fee_plan, /api/fee-plans) — PLAN_CD 에서 NONE 제외
export const APPLY_PLAN_CD = ['VIP', 'PRM2', 'PRM1', 'BSC2', 'BSC1'] as const
export type ApplyPlanCd = (typeof APPLY_PLAN_CD)[number]
// 요금제별 총 슬롯(메인 버블 자리) — 마스터 지시 2026-10-09 "5·15·20·30·40 = 110" → 2026-10-13 기본요금제 각 10 감축(20·30, 합 90).
//  남은 수량 = 총 슬롯 − 점유 상태(OCCUPY_STS) 실사이트
// ponytail: 상수 고정 — 관리자 변경이 필요해지면 sys_cfg(PLAN_CAP) 로 이전
export const PLAN_CAP: Record<ApplyPlanCd, number> = {
  VIP: 5,
  PRM2: 15,
  PRM1: 20,
  BSC2: 20,
  BSC1: 30,
}
// 사용료 결제가 가능한 사이트 상태 — prepare·approve·RPC(sql/012 fn_cmpl_site_reg_pymnt)·결제 페이지가 같은 값을 쓴다
export const PAYABLE_STS = ['APPLYING'] as const satisfies readonly string[]
// 반짝임 부가서비스 단독 결제가 가능한 상태 — 사용료 결제 뒤(APPLYING 은 pymnt_id 있을 때만)·사용 중. prepare·approve·RPC fn_cmpl_site_spk_pymnt(sql/013) 동일
export const SPK_PAYABLE_STS = [
  'APPLYING',
  'PAID',
  'IN_USE',
] as const satisfies readonly string[]
// 이동 URL 형식 — DB CHECK(sql/002 site_mst_site_mv_url_check)와 동일: https + 호스트
export const MV_URL_RE = /^https:\/\/[^\s/?#]+/

// 경로 세그먼트 → 소문자 도메인. 잘못된 퍼센트 인코딩(URIError)은 '' → DOMAIN_RE 불일치 → 호출부 404(500 방지)
export const decodeDomain = (raw: string) => {
  try {
    return decodeURIComponent(raw).toLowerCase()
  } catch {
    return ''
  }
}

// 'pi'로 시작하는 라벨 = PI_BRAND 금지 카테고리 → 등록은 받되 관리자가 반려·정지(클라이언트 경고만)
export const isPiBrandDomain = (domain: string) => /^pi/.test(domain)

export const normalizeDomain = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()

// 콘텐츠 필드 — 소유자 등록·수정(siteInputSchema)과 관리자 수정(adminSiteActionSchema edit)이 공유. 도메인·요금제·상태는 포함하지 않는다
const SITE_CONTENT_FIELDS = {
  name: z.string().trim().min(1).max(LIMITS.nameMax),
  ctgr: z.enum(SITE_CTGR),
  desc: optText(LIMITS.descMax),
  imgUrl: z.string().url().max(1000).nullable().optional(),
  // 이동 URL(일반 브라우저용 https 연결 주소) — DB CHECK site_mst_site_mv_url_check 와 같은 형식. null·빈 문자열은 null
  mvUrl: z
    .string()
    .nullable()
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .pipe(z.string().url().regex(MV_URL_RE).max(1000).nullable())
    .optional(),
  pubCntc: optText(LIMITS.cntcMax),
  // 반짝임 부가서비스 신청(spk_yn) — 결제는 prepare(합산)·/pay?kind=spk(단독)
  spk: z.boolean().default(false),
}

// 등록·수정 본문. submit=true 면 APPLYING 신청(비공개 연락처 필수), 아니면 DRAFT 저장
export const siteInputSchema = z
  .object({
    domain: z
      .string()
      .transform(normalizeDomain)
      .pipe(z.string().regex(DOMAIN_RE)),
    ...SITE_CONTENT_FIELDS,
    pvtCntc: optText(LIMITS.cntcMax),
    // 등록 요금제(사용료 결제 대상) — 신청자는 유료 5단계만 선택, NONE 은 자사(관리자) 전용
    planCd: z.enum(APPLY_PLAN_CD).default('BSC1'),
    submit: z.boolean().default(false),
  })
  .refine((v) => !v.submit || !!v.pvtCntc, {
    path: ['pvtCntc'],
    message: 'pvtCntc required on submit',
  })
export type SiteInput = z.input<typeof siteInputSchema>

export const reportInputSchema = z.object({
  siteId: z.uuid(),
  rsn: z.enum(RPT_RSN),
  cont: optText(LIMITS.rpt),
})

export const statInputSchema = z.object({
  siteId: z.uuid(),
  type: z.enum(['VIEW', 'CLCK']),
})

// 관리자 액션 — start(PAID→IN_USE 즉시 사용 시작) · reject(APPLYING) · suspend(IN_USE) · restore(SUSPENDED). 승인·소유 확인 단계 없음
//  edit : 콘텐츠 수정(이름·구분·소개·로고·공개 연락처·이동 URL) — 상태·도메인·요금제는 그대로(마스터 지시 2026-10-13, 관리자 로고 등록)
export const adminSiteActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('edit'), ...SITE_CONTENT_FIELDS }),
  z.object({
    action: z.literal('reject'),
    rsnCd: z.enum(RJCT_RSN),
    rsnCont: optText(LIMITS.rsnCont),
  }),
  z.object({ action: z.literal('suspend'), rsnCont: optText(LIMITS.rsnCont) }),
  z.object({ action: z.literal('restore') }),
])

export const adminReportActionSchema = z.object({
  action: z.enum(['accept', 'dismiss']),
  prcsCont: optText(LIMITS.rsnCont),
})

export const siteActionSchema = z.object({ action: z.literal('withdraw') })

// 공개 응답 컬럼 — pvt_cntc_txt(운영 비공개 연락처) 절대 포함 금지
export const PUBLIC_SITE_COLS =
  'site_id, site_dom_nm, site_nm, site_ctgr_cd, site_desc, site_img_url, site_mv_url, pub_cntc_txt, apv_dtm, own_site_yn'

export interface PublicSite {
  site_id: string
  site_dom_nm: string
  site_nm: string
  site_ctgr_cd: SiteCtgr
  site_desc: string | null
  site_img_url: string | null
  site_mv_url: string | null // 이동 URL(https) — NULL 이면 도메인으로 이동
  pub_cntc_txt: string | null
  apv_dtm: string | null
  own_site_yn: 'Y' | 'N'
}

// 소유자·관리자 조회 컬럼 — 비공개 연락처·상태·반려 사유 포함
export const OWNER_SITE_COLS = `${PUBLIC_SITE_COLS}, site_sts_cd, rjct_rsn_cd, rjct_rsn_cont, pvt_cntc_txt, plan_cd, pymnt_id, pay_dtm, aply_dtm, use_bgn_dtm, use_end_dtm, spk_yn, spk_pymnt_id, spk_pay_dtm, reg_dtm, mod_dtm`

// RPC 가 돌려준 site_mst 전체 행에서 소유자 응답 컬럼만 추림
export const pickOwnerSite = (row: Record<string, unknown>) =>
  Object.fromEntries(
    OWNER_SITE_COLS.split(',').map((c) => [c.trim(), row[c.trim()]]),
  )

// 소유자·관리자 응답 — 비공개 연락처·상태·반려 사유·요금제·결제·사용기간 포함
export interface OwnerSite extends PublicSite {
  // 도메인 소유 확인 토큰(서버 계산값, 컬럼 아님) — 소유자·관리자 목록 응답에만(선택 배지용)
  vrfy_tkn?: string | null
  site_sts_cd: SiteSts
  plan_cd: PlanCd // 등록 요금제(신청자 선택)
  pymnt_id: string | null // 사용료 결제ID — null 이면 미결제
  pay_dtm: string | null
  aply_dtm: string | null // 신청일시(APPLYING 진입, 미결제 타이머 기준)
  use_bgn_dtm: string | null // 사용 시작(fn_bgn_site_use)
  use_end_dtm: string | null // 사용 종료 — null 이면 영구(자사)
  spk_yn: 'Y' | 'N' // 반짝임 부가서비스 신청
  spk_pymnt_id: string | null // 반짝임 결제ID(합산이면 pymnt_id 와 같음) — null 이면 미결제
  spk_pay_dtm: string | null
  rjct_rsn_cd: string | null
  rjct_rsn_cont: string | null
  pvt_cntc_txt: string | null
  reg_dtm: string
  mod_dtm: string
}

// 요금제 표시명 접미 — 반짝임 부가서비스를 함께 하는 사이트는 "요금제++"(마스터 지시 2026-10-13). admin-panel·my-sites·pay-panel 이 tp(plan_cd) 뒤에 붙인다
// 반짝임 노출 조건 — 신청 + (결제 완료 또는 자사). 상태(IN_USE)는 호출처 쿼리가 거른다(sql/013 규칙)
export const isSparkleOn = (s: {
  spk_yn: 'Y' | 'N'
  spk_pay_dtm: string | null
  own_site_yn: 'Y' | 'N'
}) => s.spk_yn === 'Y' && (s.spk_pay_dtm != null || s.own_site_yn === 'Y')

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// 요금제 5단계 + NONE(무료), 큰 순서 = 메인 버블 크기 순서. DB CHECK(site_mst_plan_cd_check)와 동일.
// 표시명은 번역키 plan.<cd>. Phase 2 에서 멤버십 주문(fee_ordr) 기준으로 동기화 예정(5단계 개편 — 마스터 지시 2026-10-09)
export const PLAN_CD = ['VIP', 'PRM2', 'PRM1', 'BSC2', 'BSC1', 'NONE'] as const
export type PlanCd = (typeof PLAN_CD)[number]

// 버블 배지 — NONE 은 유료 노출이 아니므로 배지·광고 라벨 없음
export const PLAN_BADGE: Record<PlanCd, string> = {
  // 명칭 확정(마스터 2026-10-13) : 기본·골드·프리미엄·플래티넘·VIP — 코드값은 유지, 배지는 머리글자
  VIP: 'VIP',
  PRM2: 'PT',
  PRM1: 'P',
  BSC2: 'G',
  BSC1: 'B',
  NONE: '',
}

// 요금제 색 — 레벨이 높을수록 채도·명도를 올려 더 눈에 띄게(마스터 지시 2026-10-09) : 기본1 무채색 → VIP 밝은 골드
export const PLAN_COLOR: Record<PlanCd, string> = {
  VIP: '#FFC21A', // VIP요금(24개월) · 브릴리언트 골드(최고 명도·채도)
  PRM2: '#FF3D9A', // 플래티넘요금(12개월) · 핫 핑크
  PRM1: '#7C5CFF', // 프리미엄요금(6개월) · 비비드 바이올렛
  BSC2: '#2A8FA8', // 골드요금(3개월) · 차분한 틸
  BSC1: '#5E6A7D', // 기본요금(1개월) · 저채도 슬레이트
  NONE: '#9CA3AF', // 무료(요금제 없음)
}

// 부가서비스 "반짝임" 색 — PLAN_COLOR 의 보색(HSL 색상 +180°, 채도 유지, 어두운 배경 가시성 위해 명도 하한 62%, 마스터 지시 2026-10-10)
export const PLAN_SPARKLE: Record<PlanCd, string> = {
  VIP: '#3D71FF', // 골드 ↔ 로열 블루
  PRM2: '#3DFFA2', // 핫 핑크 ↔ 민트
  PRM1: '#DFFF5C', // 바이올렛 ↔ 라임
  BSC2: '#D87B64', // 틸 ↔ 코랄
  BSC1: '#ACA190', // 슬레이트 ↔ 웜 그레이(원색이 저채도라 보색도 저채도)
  NONE: '#FFFFFF', // 무료는 부가서비스 대상 아님 — 폴백
}

// 버블 면적 가중치 — 레벨마다 면적 ×2 등비(인접 레벨 반지름 ×√2, VIP:기본1 반지름 4:1, 마스터 지시 2026-10-09)
// 예외(마스터 지시 2026-10-10, 등비 기준 대비 반지름) : BSC1 ×1.3×1.2 = ×1.56(면적 1 × 2.4336 ≈ 2.43), BSC2 ×1.2×1.2 = ×1.44(면적 2 × 2.0736 ≈ 4.15),
// PRM1 ×1.3(면적 4 × 1.69 = 6.76), PRM2 ×1.3×0.8×1.15×0.9 ≈ ×1.076(면적 8 × 1.1586 ≈ 9.27), VIP ×1.15(면적 16 × 1.3225 = 21.16)
export const PLAN_AREA: Record<PlanCd, number> = {
  VIP: 21.16,
  PRM2: 9.27,
  PRM1: 6.76,
  BSC2: 4.15,
  BSC1: 2.43,
  NONE: 0.7,
}

// 메인 버블 기간 — 일·주·월 = 최근 N일 vs 직전 N일(UTC 일자)
export const BUBBLE_DAYS = { day: 1, week: 7, month: 30 } as const
export type BubblePeriod = keyof typeof BUBBLE_DAYS

export interface BubbleItem {
  id: string
  domain: string
  name: string
  ctgr: SiteCtgr
  img: string | null
  plan: PlanCd
  own: boolean // 자사 사이트(own_site_yn=Y) — 요금제는 관리자 배정, 배지 "자사"(마스터 결정 2026-10-09)
  views: number // 선택 기간 조회 합
  chgPct: number // 직전 동일 기간 대비 증감률(%) — 직전 0·현재 >0 이면 100, 둘 다 0 이면 0
  sample?: boolean // 데모 화면 전용 가상 샘플(src/data/sample-sites.json) — 배지 "샘플", 상세 이동 없음
  url?: string // 연결 주소 재지정(sitemap/sites.json url) — 있으면 버블 클릭 시 상세 대신 이동 안내 후 이 주소로
  sparkle?: boolean // 부가서비스 "반짝임"(요금제 외 추가요금 결제) — 버블에 반짝임 효과. 실사이트는 isSparkleOn(sql/013), 샘플은 api/bubbles SPARKLE
}

export interface BubbleResponse {
  items: BubbleItem[]
  period: BubblePeriod
  demo: boolean // DB 미연결 — sitemap/sites.json 정적 폴백(값 0%) + 샘플
}
