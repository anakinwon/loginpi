// 홈 "제작 진행 현황" 데이터 — 기능(PRD 5절 F-01~07)별 단계와 상태. 문구는 messages progress.* (i18n)
// ⚠ 상태를 바꿀 때 docs/ROADMAP.md 도 같이 갱신한다(이 파일은 화면용 요약, 정본은 ROADMAP)
export type StepStatus = 'done' | 'doing' | 'todo'

// 참조 모델(제품명) — 화상 엔진은 REA 분석 3종(PRD_02), 로그인은 1호 사이트 구현(LOGIN_PLAYBOOK)
export type RefModel = 'Galène' | 'mediasoup' | 'LiveKit' | 'sitemap.pi'

export interface FeatureStep {
  id: string
  status: StepStatus
  stage?: string // 화상 엔진 단계(M0~M5)
  date?: string // 완료일
  ref?: RefModel[] // 이 단계의 참조 모델
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
      { id: 'piLogin', status: 'done', date: '2026-10-25', ref: ['sitemap.pi'] },
      { id: 'googleLogin', status: 'done', date: '2026-10-25', ref: ['sitemap.pi'] },
      { id: 'accountLink', status: 'done', date: '2026-10-25', ref: ['sitemap.pi'] },
    ],
  },
  {
    id: 'F05',
    prio: 'P0',
    steps: [
      { id: 'deviceTest', status: 'doing', stage: 'M0', note: 'Android ✓ · iOS …' },
      {
        id: 'oneToTwo',
        status: 'doing',
        stage: 'M1',
        ref: ['Galène'],
        note: 'LAN ✓ · LTE …',
      },
      { id: 'recovery', status: 'doing', stage: 'M2', ref: ['Galène'], note: 'local ✓ · LTE …' },
      { id: 'structure', status: 'doing', stage: 'M3', ref: ['mediasoup'], note: 'gate ✓ · v1.1 ✓' },
      { id: 'autoQuality', status: 'todo', stage: 'M4', ref: ['LiveKit'] },
      { id: 'roomService', status: 'todo', stage: 'M5', ref: ['Galène', 'LiveKit'] },
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

// 기능의 참조 모델 = 단계 참조의 합(첫 등장 순)
export function featureRefs(f: Feature): RefModel[] {
  return [...new Set(f.steps.flatMap((s) => s.ref ?? []))]
}

// 기능 상태 = 단계 전부 완료면 done, 하나라도 완료·진행이면 doing, 아니면 todo
export function featureStatus(f: Feature): StepStatus {
  if (f.steps.every((s) => s.status === 'done')) return 'done'
  if (f.steps.some((s) => s.status !== 'todo')) return 'doing'
  return 'todo'
}
