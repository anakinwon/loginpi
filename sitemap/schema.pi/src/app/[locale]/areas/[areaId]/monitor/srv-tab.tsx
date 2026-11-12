'use client'
// 서버 모니터링 탭 — 로컬 에이전트가 설치된 PC·서버(에이전트 1.3.0 이상이 폴링 때 보고) : 서버 수·평균 CPU/메모리/디스크, 서버별 현재값·CPU 추이, CPU·메모리 TOP5
import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Icon3D } from '@/components/icon-3d'
import { InfoTip } from '@/components/page-head'
import { MENU_ICON } from '@/lib/menu-icons'
import { fmtB, Line, Meter, Spark, Tile, type Pt } from './charts'
import { usePoll } from './use-poll'

type Agt = { agt_id: string; agt_nm: string; lst_seen_dtm: string | null }
type H = { agt_id: string; bkt_dtm: string; host_nm: string | null; os_nm: string | null; core_cnt: number | null; cpu_pct: number | string | null; mem_tot_sz: number | null; mem_used_sz: number | null; disk_tot_sz: number | null; disk_used_sz: number | null }
const pct = (u: number | null, t: number | null) => (u === null || !t ? null : Math.round((u / t) * 1000) / 10)
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

export default function SrvTab({ areaId, live, min }: { areaId: string; live: boolean; min: number }) {
  const { data, err } = usePoll<{ agents: Agt[]; hist: H[] }>(`/api/areas/${areaId}/mon/srv?min=${min}`, live)
  const v = useMemo(() => {
    const hist = data?.hist ?? []
    const rows = (data?.agents ?? []).map((a) => {
      const hs = hist.filter((h) => h.agt_id === a.agt_id)
      const l = hs[hs.length - 1]
      const fresh = !!l && Date.now() - new Date(l.bkt_dtm).getTime() < 3 * 60000
      return {
        a,
        l,
        fresh,
        cpu: l?.cpu_pct == null ? null : Number(l.cpu_pct),
        mem: l ? pct(l.mem_used_sz, l.mem_tot_sz) : null,
        disk: l ? pct(l.disk_used_sz, l.disk_tot_sz) : null,
        cpuPts: hs.map((h) => ({ t: h.bkt_dtm, v: h.cpu_pct == null ? null : Number(h.cpu_pct) })) as Pt[],
      }
    })
    const on = rows.filter((r) => r.fresh)
    // 전체 평균 CPU 추이(분)
    const by = new Map<string, number[]>()
    for (const h of hist) if (h.cpu_pct != null) by.set(h.bkt_dtm, [...(by.get(h.bkt_dtm) ?? []), Number(h.cpu_pct)])
    const cpuAll = [...by.keys()].sort().map((t) => ({ t, v: avg(by.get(t)!) })) as Pt[]
    return { rows, on, cpuAll, cores: on.reduce((n, r) => n + (r.l?.core_cnt ?? 0), 0) }
  }, [data])

  if (err)
    return (
      <p role="status" className="flex items-center gap-1.5 text-dense text-danger">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {err}
      </p>
    )
  if (data && !v.rows.length)
    return (
      <div className="panel empty">
        <Icon3D icon={MENU_ICON.monitor} />
        <p>등록된 로컬 에이전트 없음 — 설정 › DB 접속에서 등록</p>
      </div>
    )
  const top = (k: 'cpu' | 'mem') => [...v.on].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 5)
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <InfoTip align="end">이 분류체계에 등록된 로컬 에이전트(설정 › DB 접속)가 1분마다 보내는 호스트 지표입니다. 에이전트 1.3.0 이상이 필요합니다.</InfoTip>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="서버" val={`${v.on.length} / ${v.rows.length}`} sub="최근 3분 보고 / 등록" />
        <Tile nm="코어 합계" val={String(v.cores)} />
        <Tile nm="평균 CPU" val={`${avg(v.on.map((r) => r.cpu)) ?? '—'}%`} warn={(avg(v.on.map((r) => r.cpu)) ?? 0) >= 90} />
        <Tile nm="평균 메모리" val={`${avg(v.on.map((r) => r.mem)) ?? '—'}%`} />
        <Tile nm="평균 디스크" val={`${avg(v.on.map((r) => r.disk)) ?? '—'}%`} warn={(avg(v.on.map((r) => r.disk)) ?? 0) >= 90} />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <Line title="평균 CPU(%)" pts={v.cpuAll} unit="%" max={100} />
        {(['cpu', 'mem'] as const).map((k) => (
          <figure key={k} className="panel p-3">
            <figcaption className="text-xs font-medium text-ink-2">{k === 'cpu' ? 'CPU' : '메모리'} TOP 5</figcaption>
            <ul className="mt-2 space-y-2">
              {top(k).map((r) => (
                <li key={r.a.agt_id} className="text-xs">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate text-ink">{r.l?.host_nm ?? r.a.agt_nm}</span>
                    <span className="tabular-nums">{r[k] ?? '—'}%</span>
                  </div>
                  <Meter pct={r[k]} />
                </li>
              ))}
              {!top(k).length && <li className="py-6 text-center text-dense text-ink-3">보고 중인 서버 없음</li>}
            </ul>
          </figure>
        ))}
      </div>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">서버</h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {v.rows.map((r) => (
            <li key={r.a.agt_id} className="panel p-4 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.fresh ? 'bg-ok' : 'bg-ink-off'}`} title={r.fresh ? '보고 중' : '최근 3분 보고 없음'} />
                <span className="font-medium text-ink">{r.a.agt_nm}</span>
                <span className="truncate text-xs text-ink-3">
                  {r.l?.host_nm ?? '—'} · {r.l?.os_nm ?? '지표 없음(1.3.0 미만?)'} · {r.l?.core_cnt ?? '—'}코어
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-ink-2">
                {(
                  [
                    ['CPU', r.cpu, null],
                    ['메모리', r.mem, r.l ? `${fmtB(r.l.mem_used_sz)} / ${fmtB(r.l.mem_tot_sz)}` : null],
                    ['디스크', r.disk, r.l ? `${fmtB(r.l.disk_used_sz)} / ${fmtB(r.l.disk_tot_sz)}` : null],
                  ] as const
                ).map(([nm, p, sub]) => (
                  <div key={nm}>
                    <div className="mb-1 flex justify-between">
                      <span>{nm}</span>
                      <span className="tabular-nums text-ink">{p ?? '—'}%</span>
                    </div>
                    <Meter pct={p} />
                    {sub && <div className="mt-1 truncate text-xs text-ink-3 tabular-nums">{sub}</div>}
                  </div>
                ))}
              </div>
              <Spark pts={r.cpuPts} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
