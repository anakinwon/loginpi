'use client'
// 애플리케이션 모니터링 탭 — schema.pi API(브라우저 계측, 분 × 경로) : TPS·평균 응답·오류율·느림, 분 단위 분포, 경로 TOP(전역 관리자만)
import { useMemo } from 'react'
import { fmtN, Line, Stack, Tile, type Pt } from './charts'
import { usePoll } from './use-poll'

type Row = { bkt_dtm: string; route_txt: string; req_cnt: number; err_cnt: number; slow_cnt: number; rsp_sum_val: number | string; rsp_max_val: number }

export default function AppTab({ live, min }: { live: boolean; min: number }) {
  const { data, err } = usePoll<{ rows: Row[] }>(`/api/mon/app?min=${min}`, live)
  const v = useMemo(() => {
    const rows = data?.rows ?? []
    const by = new Map<string, { req: number; err: number; slow: number; sum: number }>()
    const rt = new Map<string, { req: number; err: number; sum: number; max: number }>()
    for (const r of rows) {
      const s = Number(r.rsp_sum_val)
      const b = by.get(r.bkt_dtm) ?? { req: 0, err: 0, slow: 0, sum: 0 }
      by.set(r.bkt_dtm, { req: b.req + r.req_cnt, err: b.err + r.err_cnt, slow: b.slow + r.slow_cnt, sum: b.sum + s })
      const x = rt.get(r.route_txt) ?? { req: 0, err: 0, sum: 0, max: 0 }
      rt.set(r.route_txt, { req: x.req + r.req_cnt, err: x.err + r.err_cnt, sum: x.sum + s, max: Math.max(x.max, r.rsp_max_val) })
    }
    const ts = [...by.keys()].sort()
    const tot = [...by.values()].reduce((a, b) => ({ req: a.req + b.req, err: a.err + b.err, slow: a.slow + b.slow, sum: a.sum + b.sum }), { req: 0, err: 0, slow: 0, sum: 0 })
    const last5 = ts.slice(-5).reduce((n, t) => n + by.get(t)!.req, 0)
    return {
      tot,
      tps: Math.round((last5 / Math.max(1, Math.min(5, ts.length) * 60)) * 100) / 100,
      tpsPts: ts.map((t) => ({ t, v: Math.round((by.get(t)!.req / 60) * 100) / 100 })) as Pt[],
      rspPts: ts.map((t) => ({ t, v: Math.round(by.get(t)!.sum / Math.max(1, by.get(t)!.req)) })) as Pt[],
      errPts: ts.map((t) => ({ t, v: by.get(t)!.err })) as Pt[],
      bars: ts.map((t) => {
        const b = by.get(t)!
        return { t, ok: Math.max(0, b.req - b.slow - b.err), slow: b.slow, err: b.err }
      }),
      top: [...rt.entries()].sort((a, b) => b[1].req - a[1].req).slice(0, 10),
    }
  }, [data])

  if (err) return <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{err}</p>
  const errPct = v.tot.req ? Math.round((v.tot.err / v.tot.req) * 1000) / 10 : 0
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5b6578]">schema.pi 화면이 부른 API 응답을 브라우저가 재서 모은 값입니다(로그인 사용자, 1분 단위). 서버 내부 구간(SQL·외부 호출) 분해는 없습니다.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="TPS(최근 5분)" val={fmtN(v.tps, 2)} sub="초당 요청" />
        <Tile nm="요청 수" val={v.tot.req.toLocaleString()} sub={`최근 ${min}분`} />
        <Tile nm="평균 응답" val={`${v.tot.req ? Math.round(v.tot.sum / v.tot.req) : 0}ms`} />
        <Tile nm="오류율" val={`${errPct}%`} sub={`${v.tot.err}건`} warn={errPct >= 5} />
        <Tile nm="느린 요청" val={v.tot.slow.toLocaleString()} sub="1초 이상" warn={v.tot.slow > 0} />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Stack title="요청 분포(분)" bars={v.bars} />
        <Line title="TPS" pts={v.tpsPts} unit="/s" />
        <Line title="평균 응답시간" pts={v.rspPts} unit="ms" color="#0891b2" />
        <Line title="오류 수" pts={v.errPts} color="#dc2626" />
      </div>
      <section>
        <h3 className="mb-1 text-sm font-bold text-[#2c3850]">경로 TOP 10(요청 수)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="thead-3d">
              <tr>
                <th className="px-2 py-1 text-left">경로</th>
                <th className="px-2 py-1">요청</th>
                <th className="px-2 py-1">평균(ms)</th>
                <th className="px-2 py-1">최대(ms)</th>
                <th className="px-2 py-1">오류</th>
              </tr>
            </thead>
            <tbody>
              {v.top.map(([r, x]) => (
                <tr key={r} className="border-b">
                  <td className="px-2 py-1 font-mono text-xs">{r}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{x.req.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{Math.round(x.sum / Math.max(1, x.req))}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{x.max}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${x.err ? 'text-red-700' : ''}`}>{x.err}</td>
                </tr>
              ))}
              {!v.top.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                    {data ? '아직 수집된 요청이 없습니다 — 화면을 사용하면 1분 안에 쌓입니다' : '불러오는 중…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
