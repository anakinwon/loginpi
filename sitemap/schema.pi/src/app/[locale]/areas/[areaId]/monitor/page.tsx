'use client'
// 모니터링 화면(2026-10-21, 마스터 지시 — WhaTap 4종을 심플하게) : 애플리케이션·서버·데이터베이스·URL 탭(?tab=app|srv|db|url) + AI 수정 이력(?tab=fix, 2026-10-22)
// LIVE(10초 갱신, 일시정지 가능)·기간(30분~24시간). 권한 = 모니터링 보기(요금제1~ 기술 메뉴), URL 등록·삭제 = 모니터링 편집, 애플리케이션·AI 수정 이력 = MON_AI(요금제1~ SQL 쓰기 역할), 결재 = MON_FIX_APV(DA 역할 ∩ 요금제4) — 2026-10-22
//  앱 경계상 dbms.pi 영역 — 마스터 선택으로 schema.pi 에 두고 dbms.pi 가 생기면 이전(MASTER_ROADMAP §3-10)
import { piFetch } from '@pi/auth/client'
import { Pause, Play } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import { use, useEffect, useState } from 'react'
import { Icon3D } from '@/components/icon-3d'
import { InfoTip, PageHead } from '@/components/page-head'
import { MENU_ICON } from '@/lib/menu-icons'
import type { Perm } from '@/lib/roles'
import AppTab from './app-tab'
import DbTab from './db-tab'
import FixTab from './fix-tab'
import SrvTab from './srv-tab'
import UrlTab from './url-tab'

const TABS = [
  { k: 'app', nm: '애플리케이션' },
  { k: 'srv', nm: '서버' },
  { k: 'db', nm: '데이터베이스' },
  { k: 'url', nm: 'URL' },
  { k: 'fix', nm: 'AI 수정 이력' }, // 2026-10-22 — PR 로 해결 진행 보고서(MON_AI)
] as const
type Tab = (typeof TABS)[number]['k']
const MINS = [30, 60, 360, 1440]

// 권한 없음 빈 상태 — 3D 키 + 한 줄, 규칙 문장은 InfoTip(2026-11-12 디자인 개편)
function NoPerm({ line, rule }: { line: string; rule: string }) {
  return (
    <div className="panel empty">
      <Icon3D icon={MENU_ICON.monitor} />
      <p className="flex items-center gap-1">
        {line}
        <InfoTip>{rule}</InfoTip>
      </p>
    </div>
  )
}
// 애플리케이션·AI 수정 이력 = MON_AI(요금제1 개발자~ SQL 쓰기 역할, 2026-10-22 마스터 지시) — 없으면 안내
function NoAi() {
  return <NoPerm line="조회 권한 없음" rule="애플리케이션 모니터링·AI 원인 분석·AI 수정 이력은 요금제1(개발자) 이상 분류체계의 SQL 쓰기 역할(시스템담당자·데이터아키텍트·표준담당자·모델러·품질담당자·이행담당자)만 볼 수 있습니다. 결재(승인·반려·되돌리기)는 데이터아키텍트 역할 + 요금제4(DA)만 할 수 있습니다." />
}

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
      <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
        <PageHead title="모니터링" />
        <NoPerm line="조회 권한 없음" rule="모니터링은 요금제 1(개발자) 이상의 기술 역할(SQL 편집기 메뉴)이 볼 수 있습니다." />
      </main>
    )
  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="모니터링" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="seg" aria-label="모니터링 종류">
          {TABS.map(({ k, nm }) => (
            <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => router.replace(`/areas/${areaId}/monitor?tab=${k}`)} className="seg-item">
              {nm}
            </button>
          ))}
        </nav>
        <span className="ms-auto flex items-center gap-2">
        <button type="button" onClick={() => setLive(!live)} className="btn-key btn-sm" aria-pressed={live} aria-label={live ? '실시간 갱신 멈춤' : '실시간 갱신 시작'} title={live ? '10초마다 갱신 중 — 누르면 멈춤' : '멈춤 — 누르면 10초마다 갱신'}>
          {live ? <Pause aria-hidden /> : <Play aria-hidden />}
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-ok' : 'bg-ink-off'}`} aria-hidden />
          실시간
          <span className="font-mono text-xs tabular-nums">{clock}</span>
        </button>
        <select className="input-sm w-auto" value={min} onChange={(e) => setMin(Number(e.target.value))} aria-label="조회 기간">
          {MINS.map((m) => (
            <option key={m} value={m}>
              최근 {m < 60 ? `${m}분` : `${m / 60}시간`}
            </option>
          ))}
        </select>
        </span>
      </div>
      <div className="pb-6">
        {!perms ? (
          <p className="text-sm text-ink-3">불러오는 중…</p>
        ) : tab === 'app' ? (
          !perms.includes('MON_AI') ? (
            <NoAi />
          ) : (
            <AppTab live={live} min={min} canApv={perms.includes('MON_FIX_APV')} />
          )
        ) : tab === 'srv' ? (
          <SrvTab areaId={areaId} live={live} min={min} />
        ) : tab === 'db' ? (
          <DbTab areaId={areaId} live={live} min={min} />
        ) : tab === 'fix' ? (
          !perms.includes('MON_AI') ? (
            <NoAi />
          ) : (
            <FixTab live={live} canApv={perms.includes('MON_FIX_APV')} />
          )
        ) : (
          <UrlTab areaId={areaId} live={live} min={min} editor={perms.includes('MON_EDIT')} />
        )}
      </div>
    </main>
  )
}
