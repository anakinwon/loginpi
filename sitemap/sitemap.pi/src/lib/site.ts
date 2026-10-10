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

export const SITE_STS = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'WITHDRAWN',
] as const
export type SiteSts = (typeof SITE_STS)[number]

// 금지 카테고리 7종(PRD §5) + OWNERSHIP(도메인 소유 확인 불가 — 같은 사용자·도메인 재제출 409) + ETC
export const RJCT_RSN = [
  'GAMBLING',
  'NON_PI_PYMNT',
  'GIFT_CARD',
  'INVEST',
  'ADULT',
  'PII_COLLECT',
  'PI_BRAND',
  'OWNERSHIP',
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
  openMax: 5, // 사용자당 DRAFT+PENDING 합계 상한(도메인 대량 선점·심사 큐 폭주 방지)
} as const

// 도메인 점유 상태 — DB 활성 UNIQUE(ux_site_mst_site_dom_nm_actv)와 동일. DRAFT 는 점유하지 않는다
export const OCCUPY_STS: SiteSts[] = ['PENDING', 'APPROVED', 'SUSPENDED']
export const OPEN_STS: SiteSts[] = ['DRAFT', 'PENDING']

// 도메인 소유 확인 파일 경로 — 등록자가 자기 사이트에 vrfy_tkn 을 게시, 관리자가 수동 확인(.pi 는 서버 fetch 불가)
export const VERIFY_FILE = '/sitemap-verify.txt'

export const IMG_BUCKET = 'site-img'
export const IMG_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

// 단일 라벨 .pi 도메인, 소문자 — DB CHECK(site_mst_site_dom_nm_check)와 동일
export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.pi$/

// 경로 세그먼트 → 소문자 도메인. 잘못된 퍼센트 인코딩(URIError)은 '' → DOMAIN_RE 불일치 → 호출부 404(500 방지)
export const decodeDomain = (raw: string) => {
  try {
    return decodeURIComponent(raw).toLowerCase()
  } catch {
    return ''
  }
}

// 'pi'로 시작하는 라벨 = PI_BRAND 금지 카테고리 → 등록은 받되 심사에서 반려(클라이언트 경고만)
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

// 등록·수정 본문. submit=true 면 PENDING 제출(비공개 연락처 필수), 아니면 DRAFT 저장
export const siteInputSchema = z
  .object({
    domain: z
      .string()
      .transform(normalizeDomain)
      .pipe(z.string().regex(DOMAIN_RE)),
    name: z.string().trim().min(1).max(LIMITS.nameMax),
    ctgr: z.enum(SITE_CTGR),
    desc: optText(LIMITS.descMax),
    imgUrl: z.string().url().max(1000).nullable().optional(),
    pvtCntc: optText(LIMITS.cntcMax),
    pubCntc: optText(LIMITS.cntcMax),
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

export const adminSiteActionSchema = z.discriminatedUnion('action', [
  // 외부 등록(own_site_yn='N') 승인은 ownershipVerified:true 필수(관리자가 소유 확인 파일을 확인했다는 명시 — 서버 400 강제)
  z.object({
    action: z.literal('approve'),
    ownershipVerified: z.boolean().optional(),
  }),
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

// 공개 응답 컬럼 — pvt_cntc_txt(심사용 비공개 연락처) 절대 포함 금지
export const PUBLIC_SITE_COLS =
  'site_id, site_dom_nm, site_nm, site_ctgr_cd, site_desc, site_img_url, pub_cntc_txt, apv_dtm, own_site_yn'

export interface PublicSite {
  site_id: string
  site_dom_nm: string
  site_nm: string
  site_ctgr_cd: SiteCtgr
  site_desc: string | null
  site_img_url: string | null
  pub_cntc_txt: string | null
  apv_dtm: string | null
  own_site_yn: 'Y' | 'N'
}

// 소유자·관리자 조회 컬럼 — 비공개 연락처·상태·반려 사유 포함
export const OWNER_SITE_COLS = `${PUBLIC_SITE_COLS}, site_sts_cd, rjct_rsn_cd, rjct_rsn_cont, pvt_cntc_txt, reg_dtm, mod_dtm`

// 소유자·관리자 응답 — 비공개 연락처·상태·반려 사유 포함
export interface OwnerSite extends PublicSite {
  // 도메인 소유 확인 토큰(서버 계산값, 컬럼 아님) — 소유자·관리자 목록 응답에만
  vrfy_tkn?: string | null
  site_sts_cd: SiteSts
  rjct_rsn_cd: string | null
  rjct_rsn_cont: string | null
  pvt_cntc_txt: string | null
  reg_dtm: string
  mod_dtm: string
}

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
  VIP: 'VIP',
  PRM2: 'P2',
  PRM1: 'P1',
  BSC2: 'B2',
  BSC1: 'B1',
  NONE: '',
}

// 요금제 색 — 레벨이 높을수록 채도·명도를 올려 더 눈에 띄게(마스터 지시 2026-10-09) : 기본1 무채색 → VIP 밝은 골드
export const PLAN_COLOR: Record<PlanCd, string> = {
  VIP: '#FFC21A', // VIP(영구) · 브릴리언트 골드(최고 명도·채도)
  PRM2: '#FF3D9A', // 프리미엄2(5년) · 핫 핑크
  PRM1: '#7C5CFF', // 프리미엄1(1년) · 비비드 바이올렛
  BSC2: '#2A8FA8', // 기본2(12개월) · 차분한 틸
  BSC1: '#5E6A7D', // 기본1(6개월) · 저채도 슬레이트
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
  sparkle?: boolean // 부가서비스 "반짝임"(요금제 외 추가요금 결제) — 버블에 반짝임 효과. 현재 샘플만(api/bubbles SPARKLE)
}

export interface BubbleResponse {
  items: BubbleItem[]
  period: BubblePeriod
  demo: boolean // DB 미연결 — sitemap/sites.json 정적 폴백(값 0%) + 샘플
}
