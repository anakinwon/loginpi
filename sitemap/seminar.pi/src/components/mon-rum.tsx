'use client'
// seminar.pi 애플리케이션 모니터링 계측(2026-10-31, M5 — sitemap.pi 와 같은 구성) — 공용 @pi/mon Rum 이 같은 출처 /api/* 응답을 모아
// 이 앱 /api/mon/app 으로 보내면, 서버가 세션 확인 후 schema.pi 모니터링 수집 API 로 전달(운영 배포만)
import { piFetch } from '@pi/auth/client'
import { Rum } from '@pi/mon/client'
import { routing } from '@/i18n/routing'

// 모듈 범위 함수 — Rum 의 effect 가 렌더마다 다시 걸리지 않게 고정
const send = (body: string) => piFetch('/api/mon/app', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body })

// 화면 경로의 locale 접두(/ko, /en) 제거 — 화면 집계가 locale 별로 쪼개지지 않게
const LOCALES = new Set<string>(routing.locales)
const page = (p: string) => {
  const seg = p.split('/')[1] ?? ''
  return LOCALES.has(seg) ? p.slice(seg.length + 1) || '/' : p
}

export function MonRum() {
  return <Rum send={send} page={page} />
}
