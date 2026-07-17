'use client'

import { piFetch } from '@/lib/pi-fetch'

// admin 화면 전용 router.refresh() 래퍼 — Pi Browser 게이트 사이클 방지 (2026-07-17 사고)
//
// Pi Browser의 admin 인증은 URL의 `_pit`(60초 단기 티켓)이 정본인데, 화면 조작 후
// router.refresh()를 그대로 부르면 만료된 티켓으로 서버가 재렌더 → ClientAdminGate 재발동
// → 티켓 재발급 하드 내비게이션 → 전체 리로드마다 Pi 자동 signIn(/v2/me) 호출이 반복돼
// Pi Platform 429(too_many_requests)까지 이어진다(UI 테마 변경 사고).
// → refresh 직전에 티켓을 선갱신해 URL을 교체(replaceState)하면 게이트가 발동하지 않는다.
//
// PC(쿠키 세션)는 URL에 _pit이 없으므로 그대로 refresh — 추가 왕복 없음.
export async function adminRefresh(router: { refresh: () => void }) {
  try {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (url.searchParams.has('_pit')) {
        const res = await piFetch('/api/admin/pit-ticket', { method: 'POST' })
        if (res.ok) {
          const { ticket } = (await res.json()) as { ticket?: string }
          if (ticket) {
            url.searchParams.set('_pit', ticket)
            window.history.replaceState(null, '', url.toString())
          }
        }
      }
    }
  } catch {
    // 티켓 갱신 실패 시에도 refresh는 진행 — 최악의 경우 기존 게이트 경로(1회)로 회복
  }
  router.refresh()
}
