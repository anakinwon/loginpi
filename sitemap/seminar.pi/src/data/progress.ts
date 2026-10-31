// 홈 "제작 진행 현황" 데이터 — 기능(PRD 5절 F-01~07, 5.1절 F-U·F-08~17)별 단계와 상태. 문구는 messages progress.* (i18n)
// ⚠ 상태를 바꿀 때 docs/ROADMAP.md 도 같이 갱신한다(이 파일은 화면용 요약, 정본은 ROADMAP)
export type StepStatus = 'done' | 'doing' | 'todo' | 'drop' // drop = 마스터 결정으로 범위 제외(진척률 분모에서 뺌)

// 참조 모델(제품명) — 화상 엔진은 REA 분석 3종(PRD_02), 룸 화면은 오픈소스 소스 분석 2종(ui-design 14절), 로그인은 1호 사이트 구현(LOGIN_PLAYBOOK)
//  'seminar.pi' = UI 기준 태그(점선) — 사용 1위 웹 화상회의 앱의 화면·기능 패턴(ui-design 2·3절). 공개 화면 상표 미표기 규칙(2026-10-27)으로 앱 이름 대신 표기(마스터 2026-10-29)
export type RefModel =
  | 'Galène'
  | 'mediasoup'
  | 'LiveKit'
  | 'Jitsi'
  | 'sitemap.pi'
  | 'seminar.pi'

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

export const PROGRESS_UPDATED = '2026-10-31'

export const FEATURES: Feature[] = [
  {
    id: 'F01',
    prio: 'P0',
    steps: [
      {
        id: 'piLogin',
        status: 'done',
        date: '2026-10-25',
        ref: ['sitemap.pi'],
      },
      {
        id: 'googleLogin',
        status: 'done',
        date: '2026-10-25',
        ref: ['sitemap.pi'],
      },
      {
        id: 'accountLink',
        status: 'done',
        date: '2026-10-25',
        ref: ['sitemap.pi'],
      },
    ],
  },
  {
    id: 'F05',
    prio: 'P0',
    steps: [
      {
        id: 'deviceTest',
        status: 'done',
        stage: 'M0',
        date: '2026-10-27',
        note: 'Android ✓ · iOS ✓',
      },
      {
        id: 'oneToTwo',
        status: 'doing',
        stage: 'M1',
        ref: ['Galène'],
        note: 'LAN ✓ · WAN ✓ (VPS probe 4/4) · LTE …',
      },
      {
        id: 'recovery',
        status: 'done',
        stage: 'M2',
        date: '2026-10-29',
        ref: ['Galène'],
        note: 'local ✓ · TURN API ✓',
      },
      {
        id: 'structure',
        status: 'done',
        stage: 'M3',
        date: '2026-10-31',
        ref: ['mediasoup'],
        note: 'gate ✓ · -race ✓ · v1.3.3 ✓',
      },
      // M4 청중 30 시험 = 마스터 결정 2026-10-29 생략(테스터 30명 모집 불가) — 통과가 아니라 면제
      {
        id: 'autoQuality',
        status: 'done',
        stage: 'M4',
        date: '2026-10-29',
        ref: ['LiveKit'],
        note: 'score·layer ✓ · 30 ✗ waived',
      },
      {
        id: 'roomService',
        status: 'doing',
        stage: 'M5',
        ref: ['Galène', 'LiveKit'],
        note: 'ticket·status ✓ · host-away ✓ · room admin ✓ · device ✓ · monitor …',
      },
      // 룸 화면(S3·S4) — UI 설계서 v1.0(c16bc230) → M1~M2(a7affafb) → v1.1·v1.2(8eed64d2·74e2c7cd), 브라우저 QA ✓
      {
        id: 'roomUi',
        status: 'done',
        stage: 'UI',
        date: '2026-10-29',
        ref: ['LiveKit', 'Jitsi', 'seminar.pi'],
        note: 'QA ✓ · device ✓',
      },
    ],
  },
  {
    id: 'F02',
    prio: 'P0',
    steps: [
      {
        id: 'createForm',
        status: 'done',
        date: '2026-10-29',
        note: 'QA ✓ · plan ✓ · device ✓',
      },
    ],
  },
  {
    id: 'F03',
    prio: 'P0',
    steps: [
      // 완료 = 마스터 판정(2026-10-29), Pi Browser 실기기 ✓(마스터 2026-10-29)
      {
        id: 'list',
        status: 'done',
        date: '2026-10-29',
        note: 'QA ✓ · device ✓',
      },
      {
        id: 'detail',
        status: 'done',
        date: '2026-10-29',
        note: 'QA ✓ · device ✓',
      },
    ],
  },
  {
    id: 'F04',
    prio: 'P0',
    steps: [
      {
        id: 'payRequest',
        status: 'done',
        date: '2026-10-29',
        note: 'API ✓ · device ✓',
      },
      {
        id: 'payVerify',
        status: 'done',
        date: '2026-10-29',
        note: 'API ✓ · device ✓',
      },
    ],
  },
  {
    id: 'F06',
    prio: 'P1',
    steps: [{ id: 'settle', status: 'drop' }], // 마스터 결정 2026-10-29 드롭,
  },
  {
    id: 'F07',
    prio: 'P2',
    steps: [{ id: 'vod', status: 'drop' }], // 마스터 결정 2026-10-29 드롭,
  },
  // 회의 부가 기능(v2) — 구현·검토·야간 E2E r1~r6 완료(master 4f322641), 엔진 1f23d219 교체(2026-10-30), 실기기 대기. 정본 ROADMAP Phase X
  {
    id: 'FU',
    prio: 'P1',
    steps: [
      {
        id: 'appRelay',
        status: 'doing',
        ref: ['Jitsi', 'LiveKit'],
        note: 'v1.3.3 ✓ · QA ✓ · engine ✓ · device …',
      },
      // 남은 막힘 없음(DB·QA·키) — 완료, 마이크 동의 화면 실기기는 대기(device …)
      {
        id: 'aiBase',
        status: 'done',
        date: '2026-10-29',
        note: 'DB ✓ · QA ✓ · key ✓ · device …',
      },
    ],
  },
  {
    id: 'F08',
    prio: 'P1',
    steps: [
      {
        id: 'shareLinks',
        status: 'doing',
        ref: ['seminar.pi'],
        note: 'QA ✓ · device …',
      },
    ],
  },
  {
    id: 'F09',
    prio: 'P2',
    steps: [
      {
        id: 'noiseLight',
        status: 'doing',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · device …',
      },
    ],
  },
  {
    id: 'F10',
    prio: 'P1',
    steps: [
      {
        id: 'liveCaptions',
        status: 'doing',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · engine ✓ · key ✓ · device …',
      },
    ],
  },
  {
    id: 'F11',
    prio: 'P1',
    steps: [
      {
        id: 'pollQnaAttend',
        status: 'done',
        date: '2026-10-29',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'DB ✓ · QA ✓ · device ✓',
      },
    ],
  },
  {
    id: 'F12',
    prio: 'P2',
    steps: [
      {
        id: 'backgrounds',
        status: 'done',
        date: '2026-10-29',
        ref: ['Jitsi', 'LiveKit', 'seminar.pi'],
        note: 'model ✓ · QA ✓ · device …',
      },
    ],
  },
  {
    id: 'F13',
    prio: 'P1',
    steps: [
      {
        id: 'localRecording',
        status: 'done', // 2026-10-29 실기기 : 일반 브라우저 mp4 ✓ · Pi Browser 는 '일반 브라우저에서만' 안내 ✓(파일 저장 불가 — 마스터 결정)
        date: '2026-10-29',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · web mp4 ✓ · Pi 안내 ✓',
      },
    ],
  },
  {
    id: 'F14',
    prio: 'P1',
    steps: [
      {
        id: 'aiNotes',
        status: 'doing',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · engine ✓ · key ✓ · bucket ✓ · device …',
      },
    ],
  },
  {
    id: 'F15',
    prio: 'P2',
    steps: [
      {
        id: 'inPersonNotes',
        status: 'doing',
        ref: ['seminar.pi'],
        note: 'QA ✓ · key ✓ · STT v2 ✓ · M/F speakers ✓ · device …',
      },
    ],
  },
  {
    id: 'F16',
    prio: 'P2',
    steps: [
      {
        id: 'captionTranslate',
        status: 'doing',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · engine ✓ · key ✓ · device …',
      },
    ],
  },
  {
    id: 'F17',
    prio: 'P2',
    steps: [
      {
        id: 'dubbing',
        status: 'doing',
        ref: ['Jitsi', 'seminar.pi'],
        note: 'QA ✓ · engine ✓ · key ✓ · device …',
      },
    ],
  },
]

// 기능의 참조 모델 = 단계 참조의 합(첫 등장 순)
export function featureRefs(f: Feature): RefModel[] {
  return [...new Set(f.steps.flatMap((s) => s.ref ?? []))]
}

// 기능 상태 = 단계 전부 드롭이면 drop, 드롭 뺀 단계 전부 완료면 done, 하나라도 완료·진행이면 doing, 아니면 todo
export function featureStatus(f: Feature): StepStatus {
  const live = f.steps.filter((s) => s.status !== 'drop')
  if (!live.length) return 'drop'
  if (live.every((s) => s.status === 'done')) return 'done'
  if (live.some((s) => s.status !== 'todo')) return 'doing'
  return 'todo'
}
