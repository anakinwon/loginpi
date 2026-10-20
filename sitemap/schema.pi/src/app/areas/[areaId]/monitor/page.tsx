'use client'
// 모니터링 화면(2026-10-21, 마스터 지시 — WhaTap 4종을 심플하게) : 애플리케이션·서버·데이터베이스·URL 탭(?tab=app|srv|db|url)
// LIVE(10초 갱신, 일시정지 가능)·기간(30분~24시간). 권한 = 모니터링 보기(요금제1~ 기술 메뉴), URL 등록·삭제 = 모니터링 편집, 애플리케이션 = 전역 관리자
//  앱 경계상 dbms.pi 영역 — 마스터 선택으로 schema.pi 에 두고 dbms.pi 가 생기면 이전(MASTER_ROADMAP §3-10)
import { piFetch } from '@pi/auth/client'
import { Activity, AppWindow, Database, Globe, Pause, Play, Server } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { use, useEffect, useState } from 'react'
import type { Perm } from '@/lib/roles'
import AppTab from './app-tab'
import DbTab from './db-tab'
import SrvTab from './srv-tab'
import UrlTab from './url-tab'

const TABS = [
  { k: 'app', nm: '애플리케이션', Icon: AppWindow },
  { k: 'srv', nm: '서버', Icon: Server },
  { k: 'db', nm: '데이터베이스', Icon: Database },
  { k: 'url', nm: 'URL', Icon: Globe },
] as const
type Tab = (typeof TABS)[number]['k']
const MINS = [30, 60, 360, 1440]

export default function MonitorPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const sp = useSearchParams()
  const router = useRouter()
  const tab = (TABS.find((t) => t.k === sp.get('tab'))?.k ?? 'app') as Tab
  const [perms, setPerms] = useState<Perm[] | null>(null)
  const [live, setLive] = useState(true)
  const [min, setMin] = useState(60)
  const [clock, setClock] = useState('')
  useEffect(() => {
    void piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => setPerms(j.perms ?? []))
      .catch(() => setPerms([]))
  }, [areaId])
  useEffect(() => {
    const f = () => setClock(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    f()
    if (!live) return
    const t = setInterval(f, 1000)
    return () => clearInterval(t)
  }, [live])

  if (perms && !perms.includes('MON_VIEW'))
    return (
      <main className="p-4">
        <Link href="/" className="text-sm text-blue-700 underline">
          ← 분류체계 목록
        </Link>
        <p className="mt-4 text-sm text-gray-600">모니터링은 요금제 1(개발자) 이상의 기술 역할(SQL 편집기 메뉴)이 볼 수 있습니다.</p>
      </main>
    )
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Activity className="h-6 w-6 text-[#3b4a66]" strokeWidth={1.5} aria-hidden /> 모니터링
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 rounded-lg border border-gray-300 bg-gray-50 p-0.5" aria-label="모니터링 종류">
          {TABS.map(({ k, nm, Icon }) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k}
              onClick={() => router.replace(`/areas/${areaId}/monitor?tab=${k}`)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition ${tab === k ? 'bg-[#3b4a66] font-semibold text-white' : 'text-[#2c3850] hover:bg-[#e2e7ef]'}`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {nm}
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => setLive(!live)} className="flex items-center gap-1.5 rounded border border-[#c9d1df] bg-white px-2 py-1 text-sm" aria-pressed={live}>
          {live ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          <span className={`rounded px-1 text-xs font-bold ${live ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>LIVE</span>
          <span className="tabular-nums">{clock}</span>
        </button>
        <select className="rounded border px-2 py-1 text-sm" value={min} onChange={(e) => setMin(Number(e.target.value))} aria-label="조회 기간">
          {MINS.map((m) => (
            <option key={m} value={m}>
              최근 {m < 60 ? `${m}분` : `${m / 60}시간`}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 pb-6">
        {!perms ? (
          <p className="text-sm text-gray-500">불러오는 중…</p>
        ) : tab === 'app' ? (
          <AppTab live={live} min={min} />
        ) : tab === 'srv' ? (
          <SrvTab areaId={areaId} live={live} min={min} />
        ) : tab === 'db' ? (
          <DbTab areaId={areaId} live={live} min={min} />
        ) : (
          <UrlTab areaId={areaId} live={live} min={min} editor={perms.includes('MON_EDIT')} />
        )}
      </div>
    </main>
  )
}
