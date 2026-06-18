// Bean 플랫폼 요금 단일 소스 — 카페 생성·입장 등 건당 과금(SPEND) 금액의 정본.
// 정책 변경 시 이 파일만 수정 (chat-auth.ts PLAN_CAPS·locale-currency 단일 소스와 동일 원칙).
//
// 출처: docs/PRD_15_FEE.md / bean_fee_plan 표준(엑셀 요금제종합 v0.1)을 코드로 미러.
//   - 통화 라우팅 규칙([currency-routing-rule]): 플랫폼 요금 = Bean (Pi 직접결제 X).
//   - 구독 = 패키지 할인 → 구독자(PREMIUM/BUSINESS)는 건당 요금 면제(0).
//   - 1 Pi = 100 Bean 고정. Bean 정수 전용.
// ⚠️ Bean 미발행(레드라인 Phase 17) → 현재는 오프체인 내부 잔액(store credit) 차감.

// 카페 등급 — 요금표의 grade_cd(GENERAL/PREMIUM/EVENT)에 대응.
export type RoomGrade = 'GENERAL' | 'PREMIUM' | 'EVENT'

// 요금 종류 — bean_fee_plan.fee_knd_cd 일부 (CREATE 생성 / ENTER 입장).
export type RoomFeeKind = 'CREATE' | 'ENTER'

// 무료 테마 = 일반(GENERAL) 카페. 그 외 그룹 테마 = 프리미엄(PREMIUM).
// (group route의 무료 테마 판정과 단일 소스로 공유)
export const FREE_THEME_CODES = new Set(['FITNESS'])

// 방 타입·테마로 카페 등급을 도출.
//   이벤트방(room_tp_cd='E') → EVENT
//   그룹방 + 무료 테마        → GENERAL (일반카페)
//   그룹방 + 그 외 테마       → PREMIUM (프리미엄카페)
export function getRoomGrade(
  roomTpCd: string,
  themeCd: string | null | undefined,
): RoomGrade {
  if (roomTpCd === 'E') return 'EVENT'
  if (themeCd && FREE_THEME_CODES.has(themeCd)) return 'GENERAL'
  return 'PREMIUM'
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
