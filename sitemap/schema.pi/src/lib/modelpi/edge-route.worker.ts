// ERD 관계선 경로 계산 작업 스레드(2026-11-07) — 큰 주제영역(관계 50개 남짓)은 격자 A* 가 수백 ms 걸려 화면 스레드를 막지 않게 분리
//  받음 { seq, boxes: [id, Box][], reqs } → 보냄 { seq, out: [관계ID, RoutedEdge][] }, 계산 본체는 edge-route.ts routeAll(화면 직접 계산과 같은 결과)
import { routeAll, type RouteReq } from './edge-route.ts'
import type { Box } from './edge-geo'

self.onmessage = (e: MessageEvent<{ seq: number; boxes: [string, Box][]; reqs: (RouteReq & { label?: string | null })[] }>) => {
  const { seq, boxes, reqs } = e.data
  self.postMessage({ seq, out: [...routeAll(new Map(boxes), reqs)] })
}
