// 홈 "제작 진행 현황" 데이터 — 기능(PRD 5절 F-01~07, 5.1절 F-U·F-08~17)별 단계와 상태. 문구는 messages progress.* (i18n)
// ⚠ 상태를 바꿀 때 docs/ROADMAP.md 도 같이 갱신한다(이 파일은 화면용 요약, 정본은 ROADMAP)
export type StepStatus = 'done' | 'doing' | 'todo'

// 참조 모델(제품명) — 화상 엔진은 REA 분석 3종(PRD_02), 룸 화면은 오픈소스 소스 분석 2종(ui-design 14절), 로그인은 1호 사이트 구현(LOGIN_PLAYBOOK)
export type RefModel = 'Galène' | 'mediasoup' | 'LiveKit' | 'Jitsi' | 'sitemap.pi'

export interface FeatureStep {
  id: string
  status: StepStatus
  stage?: string // 화상 엔진 단계(M0~M5) 또는 화면 단계(UI)
  date?: string // 완료일
  ref?: RefModel[] // 이 단계의 참조 모델
  note?: string // 부분 결과(언어 무관 짧은 표기, 예 'Android ✓ · iOS …')
}

export interface Feature {
  id:
    | 'F01'
    | 'F02'
    | 'F03'
    | 'F04'
    | 'F05'
    | 'F06'
    | 'F07'
    | 'FU'
    | 'F08'
    | 'F09'
    | 'F10'
    | 'F11'
    | 'F12'
    | 'F13'
    | 'F14'
    | 'F15'
    | 'F16'
    | 'F17'
  prio: 'P0' | 'P1' | 'P2'
  steps: FeatureStep[]
}

export const PROGRESS_UPDATED = '2026-10-28'

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
      { id: 'deviceTest', status: 'done', stage: 'M0', date: '2026-10-27', note: 'Android ✓ · iOS ✓' },
      {
        id: 'oneToTwo',
        status: 'doing',
        stage: 'M1',
        ref: ['Galène'],
        note: 'LAN ✓ · LAN fix ✓ · retest … · LTE …',
      },
      { id: 'recovery', status: 'doing', stage: 'M2', ref: ['Galène'], note: 'local ✓ · TURN API ✓ · LTE …' },
      { id: 'structure', status: 'doing', stage: 'M3', ref: ['mediasoup'], note: 'gate ✓ · v1.2 ✓' },
      { id: 'autoQuality', status: 'doing', stage: 'M4', ref: ['LiveKit'], note: 'score·layer ✓ · 30 …' },
      { id: 'roomService', status: 'doing', stage: 'M5', ref: ['Galène', 'LiveKit'], note: 'ticket·status ✓ · device …' },
      // 룸 화면(S3·S4) — UI 설계서 v1.0(c16bc230) → M1~M2(a7affafb) → v1.1·v1.2(8eed64d2·74e2c7cd), 브라우저 QA ✓
      { id: 'roomUi', status: 'doing', stage: 'UI', ref: ['LiveKit', 'Jitsi'], note: 'QA ✓ · device …' },
    ],
  },
  {
    id: 'F02',
    prio: 'P0',
    steps: [{ id: 'createForm', status: 'doing', note: 'QA ✓ · device …' }],
  },
  {
    id: 'F03',
    prio: 'P0',
    steps: [
      { id: 'list', status: 'doing', note: 'QA ✓ · device …' },
      { id: 'detail', status: 'doing', note: 'QA ✓ · device …' },
    ],
  },
  {
    id: 'F04',
    prio: 'P0',
    steps: [
      { id: 'payRequest', status: 'doing', note: 'API ✓ · device …' },
      { id: 'payVerify', status: 'doing', note: 'API ✓ · device …' },
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
  // 회의 부가 기능(v2) — 구현·검토·야간 E2E r1~r6 완료(master 4f322641), 실기기 대기. 정본 ROADMAP Phase X
  {
    id: 'FU',
    prio: 'P1',
    steps: [
      { id: 'appRelay', status: 'doing', ref: ['Jitsi', 'LiveKit'], note: 'v1.3.2 ✓ · QA ✓ · engine swap …' },
      { id: 'aiBase', status: 'doing', note: 'DB ✓ · QA ✓ · key …' },
    ],
  },
  { id: 'F08', prio: 'P1', steps: [{ id: 'shareLinks', status: 'doing', note: 'QA ✓ · device …' }] },
  { id: 'F09', prio: 'P2', steps: [{ id: 'noiseLight', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · device …' }] },
  { id: 'F10', prio: 'P1', steps: [{ id: 'liveCaptions', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · engine … · key … · device …' }] },
  { id: 'F11', prio: 'P1', steps: [{ id: 'pollQnaAttend', status: 'doing', ref: ['Jitsi'], note: 'DB ✓ · QA ✓ · device …' }] },
  {
    id: 'F12',
    prio: 'P2',
    steps: [{ id: 'backgrounds', status: 'doing', ref: ['Jitsi', 'LiveKit'], note: 'model ✓ · QA ✓ · device …' }],
  },
  { id: 'F13', prio: 'P1', steps: [{ id: 'localRecording', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · device …' }] },
  { id: 'F14', prio: 'P1', steps: [{ id: 'aiNotes', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · key … · device …' }] },
  { id: 'F15', prio: 'P2', steps: [{ id: 'inPersonNotes', status: 'doing', note: 'QA ✓ · key … · device …' }] },
  { id: 'F16', prio: 'P2', steps: [{ id: 'captionTranslate', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · engine … · key … · device …' }] },
  { id: 'F17', prio: 'P2', steps: [{ id: 'dubbing', status: 'doing', ref: ['Jitsi'], note: 'QA ✓ · engine … · key … · device …' }] },
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
