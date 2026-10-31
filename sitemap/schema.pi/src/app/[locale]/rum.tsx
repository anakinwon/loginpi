'use client'
// 애플리케이션 모니터링 계측(2026-10-21) — 공용 @pi/mon Rum(2026-10-24 단일 소스, cafe.pi·sitemap.pi 와 같은 계측)이 같은 출처 /api/* 응답을 모아 15초마다 /api/mon/app 으로 전송
// 표본마다 화면 경로를 붙여 느림·오류가 어느 화면에서 났는지 남김(sql/069). 로그인 안 된 화면은 첫 전송이 401 이면 그 화면에서는 더 보내지 않음. /api/mon/* 은 제외(자기 증폭 방지)
import { piFetch } from '@pi/auth/client'
import { Rum as PiRum } from '@pi/mon/client'

// 모듈 범위 함수 — Rum 의 effect 가 렌더마다 다시 걸리지 않게 고정
const send = (body: string) => piFetch('/api/mon/app', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body })

export default function Rum() {
  return <PiRum send={send} />
}
