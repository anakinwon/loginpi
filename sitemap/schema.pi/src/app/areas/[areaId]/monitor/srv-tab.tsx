'use client'
// 서버 모니터링 탭 — 로컬 에이전트가 설치된 PC·서버(에이전트 1.3.0 이상이 폴링 때 보고) : 서버 수·평균 CPU/메모리/디스크, 서버별 현재값·CPU 추이, CPU·메모리 TOP5
import { useMemo } from 'react'
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

  if (err) return <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{err}</p>
  const top = (k: 'cpu' | 'mem') => [...v.on].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 5)
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5b6578]">이 분류체계에 등록된 로컬 에이전트(설정 → DB 접속)가 1분마다 보내는 호스트 지표입니다. 에이전트를 1.3.0 이상으로 다시 빌드해야 값이 들어옵니다.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="서버" val={`${v.on.length} / ${v.rows.length}`} sub="최근 3분 보고 / 등록" />
        <Tile nm="코어 합계" val={String(v.cores)} />
        <Tile nm="평균 CPU" val={`${avg(v.on.map((r) => r.cpu)) ?? '—'}%`} warn={(avg(v.on.map((r) => r.cpu)) ?? 0) >= 90} />
        <Tile nm="평균 메모리" val={`${avg(v.on.map((r) => r.mem)) ?? '—'}%`} />
        <Tile nm="평균 디스크" val={`${avg(v.on.map((r) => r.disk)) ?? '—'}%`} warn={(avg(v.on.map((r) => r.disk)) ?? 0) >= 90} />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <Line title="평균 CPU(%)" pts={v.cpuAll} unit="%" max={100} color="#f59e0b" />
        {(['cpu', 'mem'] as const).map((k) => (
          <figure key={k} className="rounded-lg border border-[#d6deeb] bg-white p-2">
            <figcaption className="px-1 text-xs font-semibold text-[#2c3850]">{k === 'cpu' ? 'CPU' : '메모리'} TOP5</figcaption>
            <ul className="mt-1 space-y-1.5 px-1">
              {top(k).map((r) => (
                <li key={r.a.agt_id} className="text-xs">
                  <div className="flex justify-between">
                    <span className="truncate">{r.l?.host_nm ?? r.a.agt_nm}</span>
                    <span className="tabular-nums">{r[k] ?? '—'}%</span>
                  </div>
                  <Meter pct={r[k]} />
                </li>
              ))}
              {!top(k).length && <li className="py-3 text-center text-xs text-gray-500">보고 중인 서버가 없습니다</li>}
            </ul>
          </figure>
        ))}
      </div>
      <section>
        <h3 className="mb-1 text-sm font-bold text-[#2c3850]">서버 목록</h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {v.rows.map((r) => (
            <li key={r.a.agt_id} className="rounded-lg border border-[#d6deeb] bg-white p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${r.fresh ? 'bg-emerald-500' : 'bg-gray-300'}`} title={r.fresh ? '보고 중' : '최근 3분 보고 없음'} />
                <span className="font-semibold">{r.a.agt_nm}</span>
                <span className="truncate text-xs text-[#5b6578]">
                  {r.l?.host_nm ?? '—'} · {r.l?.os_nm ?? '지표 없음(1.3.0 미만?)'} · {r.l?.core_cnt ?? '—'}코어
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {(
                  [
                    ['CPU', r.cpu, null],
                    ['메모리', r.mem, r.l ? `${fmtB(r.l.mem_used_sz)} / ${fmtB(r.l.mem_tot_sz)}` : null],
                    ['디스크', r.disk, r.l ? `${fmtB(r.l.disk_used_sz)} / ${fmtB(r.l.disk_tot_sz)}` : null],
                  ] as const
                ).map(([nm, p, sub]) => (
                  <div key={nm}>
                    <div className="flex justify-between">
                      <span>{nm}</span>
                      <span className="tabular-nums">{p ?? '—'}%</span>
                    </div>
                    <Meter pct={p} />
                    {sub && <div className="mt-0.5 text-[10px] text-[#5b6578]">{sub}</div>}
                  </div>
                ))}
              </div>
              <Spark pts={r.cpuPts} />
            </li>
          ))}
          {data && !v.rows.length && <li className="rounded-lg border p-4 text-center text-sm text-gray-500">등록된 로컬 에이전트가 없습니다 — 설정 → DB 접속에서 에이전트를 등록하십시오</li>}
        </ul>
      </section>
    </div>
  )
}
