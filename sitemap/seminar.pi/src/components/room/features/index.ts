// 룸 부가 기능 등록부(설계서 15절) — 기능 팀은 features/<이름>/index.ts(x) 에서 RoomFeature 를 내보내고 아래 배열에 1줄만 더한다.
// 순서 = ⋯ 메뉴 항목·패널 탭·오버레이 그리는 순서(15.2 : presenter 기준 자막·번역 → 녹화 → AI 회의록 → 효과, 탭은 Q&A → 설문).
// 비어 있으면 룸은 기존과 같다(마이크 동의·대기실 고지도 consent 기능이 등록될 때만 켜짐).
// 예) import { captions } from './captions'  →  export const FEATURES: readonly RoomFeature[] = [captions]
import type { RoomFeature } from '../extensions'
import { backgrounds } from './backgrounds'
import { captions } from './captions'
import { dubbing } from './dubbing'
import { attend } from './engage/attend'
import { polls } from './engage/polls'
import { qna } from './engage/qna'
import { notes } from './notes'
import { mediaFx } from './media-fx'
import { mirror } from './mirror'
import { recording } from './recording'

export const FEATURES: readonly RoomFeature[] = [
  captions,
  dubbing,
  recording,
  notes,
  mediaFx,
  backgrounds,
  mirror,
  qna,
  polls,
  attend,
]
