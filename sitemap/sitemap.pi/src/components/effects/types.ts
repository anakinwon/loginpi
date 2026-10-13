// 버블 이펙트 부가서비스 공통 계약 — 궤도(ORBIT)·펄스(PULSE)·혜성(COMET). 반짝임(SPARKLE)과 중복 가능, 요금제별 1종 선택(PRD_01 §3-1)
//  렌더 위치 : bubble-canvas 버블 <g> 안, 요금제 링 다음·로고/글자 앞. 좌표계 = 버블 중심(0,0), 반지름 r. pointerEvents 는 부모가 none
//  ⚠ 모바일 WebView 철칙(TROUBLESHOOT 2026-10-12 반짝임 사고) : SVG 요소에 CSS transform 애니메이션 금지 — stroke-dashoffset·opacity·SMIL <animate> 만. 움직임 줄이기는 정지 대신 3배 감속
import type { ReactNode } from 'react'

// 코드 목록 단일 소스 = src/lib/site.ts(DB CHECK·zod 와 같은 곳) — 여기선 재수출만
export { EFCT_CD, type EfctCd } from '@/lib/site'

export interface EffectProps {
  r: number // 버블 반지름(px, 화면 스케일 적용 후)
  color: string // 효과 색(요금제 보색 PLAN_SPARKLE — currentColor 로 쓴다)
  stage: 0 | 1 | 2 | 3 // 표시 단계(글자 가독성 단계, 0 = 글자 없음) — 효과는 단계로 단순화하지 않는다(모바일 동일, 마스터 2026-10-13). 참고용
  id: string // 버블 고유 id — SVG id(gradient·clipPath) 충돌 방지 접두에 사용
}

export type EffectRenderer = (p: EffectProps) => ReactNode
