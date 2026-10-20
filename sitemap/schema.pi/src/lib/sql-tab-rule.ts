// SQL 편집기 편집 탭 규칙(마스터 지시 2026-10-20, sql/062) — 요금제별 탭 상한·탭 이름 형식·내용 길이·새 탭 기본 이름. 화면·서버 공용, 실행 : pnpm test
import type { PlanCd } from './roles'

// 계정(분류체계 × 사용자)당 활성 탭 상한 — 개발자 3 · 표준담당자 5 · 모델러 8 · DA 10
export const SQL_TAB_MAX: Record<PlanCd, number> = { FREE: 0, P1: 3, P2: 5, P3: 8, P4: 10 }
export const SQL_TAB_NM = /^[A-Za-z0-9가-힣_\- .]{1,50}$/
export const SQL_TXT_MAX = 500_000 // 문자

const AUTO_NM = /^sql-(\d+)$/
// 새 탭 기본 이름 = 'sql-NNN' 중 가장 큰 번호 + 1(3자리 0 채움), 형식 다른 이름은 무시
export function nextTabNm(names: string[]): string {
  const max = names.reduce((m, n) => Math.max(m, Number(AUTO_NM.exec(n)?.[1] ?? 0)), 0)
  return `sql-${String(max + 1).padStart(3, '0')}`
}

// 새 탭 가능 = 활성 탭 수 < 상한(요금제가 내려가 이미 넘친 계정도 새 탭만 막고 기존 탭은 그대로)
export const canCreateTab = (activeCnt: number, limit: number) => activeCnt < limit
// 동시 등록 보정 : 등록 순(reg_dtm·id) 활성 탭 중 방금 탭이 앞쪽 limit 개 밖이면 물러남(늦은 쪽만)
export const mustRollbackTab = (orderedIds: string[], newId: string, limit: number) => orderedIds.indexOf(newId) >= limit
