// 파이프라인 정의 검사(순수 함수) — PRD 12 §7-2. 단계 = 원천 1개 → 변환 0~N → 대상 1개(DAG-lite 직선), 일정 = cron 5필드(빈 값 = 수동)
//  ponytail: 분기 없는 직선 단계만 — 분기·병합 DAG 는 워커(D6) 확정 후. 시험 : node --test src/lib/pipeline/precheck.test.mjs

export const STEP_KINDS = ['SOURCE', 'TRANSFORM', 'TARGET'] as const
export type StepKind = (typeof STEP_KINDS)[number]
export type Step = { kind: StepKind; op: string; note: string }
export type PplDef = { steps: Step[]; tables: string[] }
export const MAX_STEPS = 20

// cron 5필드(분 시 일 월 요일) — 숫자·*·,·-·/ 만, 범위 검사는 워커 몫
const CRON_FIELD = /^(\*|\d+(-\d+)?)(\/\d+)?(,(\*|\d+(-\d+)?)(\/\d+)?)*$/
export function isCron(s: string): boolean {
  const f = s.trim().split(/\s+/)
  return f.length === 5 && f.every((x) => CRON_FIELD.test(x))
}

// 단계 순서 오류 코드(없으면 null)
export function checkSteps(steps: Step[]): string | null {
  if (steps.length < 2) return 'STEPS_TOO_FEW'
  if (steps.length > MAX_STEPS) return 'STEPS_TOO_MANY'
  if (steps[0].kind !== 'SOURCE') return 'STEP_FIRST_SOURCE'
  if (steps[steps.length - 1].kind !== 'TARGET') return 'STEP_LAST_TARGET'
  if (steps.slice(1, -1).some((s) => s.kind !== 'TRANSFORM')) return 'STEP_MIDDLE_TRANSFORM'
  return null
}
