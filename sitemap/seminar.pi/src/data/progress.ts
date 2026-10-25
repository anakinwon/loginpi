// 홈 "제작 진행 현황" 데이터 — 기능(PRD 5절 F-01~07)별 단계와 상태. 문구는 messages progress.* (i18n)
// ⚠ 상태를 바꿀 때 docs/ROADMAP.md 도 같이 갱신한다(이 파일은 화면용 요약, 정본은 ROADMAP)
export type StepStatus = 'done' | 'doing' | 'todo'

export interface FeatureStep {
  id: string
  status: StepStatus
  stage?: string // 화상 엔진 단계(M0~M5)
  date?: string // 완료일
  note?: string // 부분 결과(언어 무관 짧은 표기, 예 'Android ✓ · iOS …')
}

export interface Feature {
  id: 'F01' | 'F02' | 'F03' | 'F04' | 'F05' | 'F06' | 'F07'
  prio: 'P0' | 'P1' | 'P2'
  steps: FeatureStep[]
}

export const PROGRESS_UPDATED = '2026-10-25'

export const FEATURES: Feature[] = [
  {
    id: 'F01',
    prio: 'P0',
    steps: [
      { id: 'piLogin', status: 'done', date: '2026-10-25' },
      { id: 'googleLogin', status: 'done', date: '2026-10-25' },
      { id: 'accountLink', status: 'done', date: '2026-10-25' },
    ],
  },
  {
    id: 'F05',
    prio: 'P0',
    steps: [
      { id: 'deviceTest', status: 'doing', stage: 'M0', note: 'Android ✓ · iOS …' },
      { id: 'oneToTwo', status: 'todo', stage: 'M1' },
      { id: 'recovery', status: 'todo', stage: 'M2' },
      { id: 'structure', status: 'todo', stage: 'M3' },
      { id: 'autoQuality', status: 'todo', stage: 'M4' },
      { id: 'roomService', status: 'todo', stage: 'M5' },
    ],
  },
  {
    id: 'F02',
    prio: 'P0',
    steps: [{ id: 'createForm', status: 'todo' }],
  },
  {
    id: 'F03',
    prio: 'P0',
    steps: [
      { id: 'list', status: 'todo' },
      { id: 'detail', status: 'todo' },
    ],
  },
  {
    id: 'F04',
    prio: 'P0',
    steps: [
      { id: 'payRequest', status: 'todo' },
      { id: 'payVerify', status: 'todo' },
    ],
  },
  {
    id: 'F06',
    prio: 'P1',
    steps: [{ id: 'settle', status: 'todo' }],
  },
  {
    id: 'F07',
    prio: 'P2',
    steps: [{ id: 'vod', status: 'todo' }],
  },
]

// 기능 상태 = 단계 전부 완료면 done, 하나라도 완료·진행이면 doing, 아니면 todo
export function featureStatus(f: Feature): StepStatus {
  if (f.steps.every((s) => s.status === 'done')) return 'done'
  if (f.steps.some((s) => s.status !== 'todo')) return 'doing'
  return 'todo'
}
