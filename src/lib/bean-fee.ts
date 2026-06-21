// Bean 플랫폼 요금 단일 소스 — 카페 생성·입장·배지 강화 등 건당 과금(SPEND) 금액의 정본.
// 정책 변경 시 이 파일만 수정 (chat-auth.ts PLAN_CAPS·locale-currency 단일 소스와 동일 원칙).
//
// 출처: docs/PRD_15_FEE.md / bean_fee_plan 표준(엑셀 요금제종합 v0.1)을 코드로 미러.
//   - 통화 라우팅 규칙([currency-routing-rule]): 플랫폼 요금 = Bean (Pi 직접결제 X).
//   - 구독 = 패키지 할인 → 구독자(PREMIUM/BUSINESS)는 건당 요금 면제(0).
//   - 1 Pi = 100 Bean 고정. Bean 정수 전용.
// ⚠️ Bean 미발행(레드라인 Phase 17) → 현재는 오프체인 내부 잔액(store credit) 차감.

// 배지 강화 요금 — 0.1 Pi × 100 = 10 Bean (PRD_15_FEE §1-6 #7)
export const BADGE_UPGRADE_BEAN = 10

// 자동번역 건당 요금 — 비구독자 맛보기/소량 이용용 (구독자는 무료, TRANSLATE 구독 월 1000 Bean).
//   신규 번역 1회 = 1 Bean(=0.01 Pi). 구독 손익분기 ≈ 1000회/월 → 가벼운 사용자는 건당, 헤비는 구독.
//   캐시(이미 번역된 것) 재사용·동일언어는 과금 없음(실제 번역 비용 발생 시에만 과금).
export const TRANSLATE_ONCE_BEAN = 1

// AI(@ai) 월 한도 초과 후 추가 호출 1회 요금 — LLM 호출 비용 반영해 번역보다 높게(5 Bean=0.05 Pi).
//   PREMIUM 월 10회 무료 → 초과분만 건당 과금. 동의(confirm) 없는 차감 금지.
export const AI_EXTRA_BEAN = 5

// 카페 부스팅(노출 우선) — 방장이 공개 목록 상단 노출권을 시간제 구매. 기간 내 재구매 시 연장.
//   1회 = 7일 50 Bean(=0.5 Pi). 광고성 매출이라 건당 과금보다 높게 책정.
export const ROOM_BOOST_BEAN = 50
export const ROOM_BOOST_DAYS = 7

// 카페 등급 — 요금표의 grade_cd(GENERAL/PREMIUM/EVENT)에 대응.
export type RoomGrade = 'GENERAL' | 'PREMIUM' | 'EVENT'

// 요금 종류 — bean_fee_plan.fee_knd_cd 일부 (CREATE 생성 / ENTER 입장).
export type RoomFeeKind = 'CREATE' | 'ENTER'

// 무료/유료 카페의 단일 진실 소스 = msg_theme.theme_tp_cd ('BASIC' | 'PREMIUM').
// 생성 요금(group route)도 theme_tp_cd로 판정하므로, 입장 등급도 같은 컬럼을 따라야
// "무료로 생성된 방인데 입장은 유료" 같은 모순이 생기지 않는다.
// (테마 코드 화이트리스트 하드코딩은 테마 추가 시 drift → DB 컬럼을 권위 소스로 사용)

// 방 타입·테마타입으로 카페 등급을 도출.
//   이벤트방(room_tp_cd='E') → EVENT
//   그룹방 + PREMIUM 테마      → PREMIUM (프리미엄카페)
//   그룹방 + BASIC/미상 테마   → GENERAL (일반카페·무료)
export function getRoomGrade(
  roomTpCd: string,
  themeTpCd: string | null | undefined,
): RoomGrade {
  if (roomTpCd === 'E') return 'EVENT'
  if (themeTpCd === 'PREMIUM') return 'PREMIUM'
  return 'GENERAL'
}

// 비구독(일반요금제) 기준 Bean 요금표. 0 = 무료.
//   생성: 일반 0 · 프리미엄 10 · 이벤트 20
//   입장: 일반 0 · 프리미엄 10 · 이벤트 20
const NONSUBSCRIBER_FEE_BEAN: Record<RoomFeeKind, Record<RoomGrade, number>> = {
  CREATE: { GENERAL: 0, PREMIUM: 10, EVENT: 20 },
  ENTER: { GENERAL: 0, PREMIUM: 10, EVENT: 20 },
}

// 사용자가 부담할 Bean 요금.
//   구독자(isSubscriber=true)는 패키지 할인으로 0 — '구독 = 패키지 할인'.
//   비구독자는 등급별 요금표 적용.
export function getRoomFeeBean(
  kind: RoomFeeKind,
  grade: RoomGrade,
  isSubscriber: boolean,
): number {
  if (isSubscriber) return 0
  return NONSUBSCRIBER_FEE_BEAN[kind][grade]
}
