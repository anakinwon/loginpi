'use client'
// 데이터베이스 모니터링 탭 — 등록 접속(PostgreSQL 서버 직접) 선택 → 활성 세션·접속·락 대기·DB 크기, 트랜잭션/s·캐시 적중률·변경 행/s·교착 추이, 활성 세션 목록
// 누적 카운터(xact·blks·tup·deadlocks)는 이력 행 사이 차이로 초당 값 계산(mon.ts perSec). 화면이 열린 동안 1분 1행 기록
import { piFetch } from '@pi/auth/client'
import { useEffect, useMemo, useState } from 'react'
import { hitPct, perSec } from '@/lib/mon'
import { fmtB, fmtN, Line, Tile, type Pt } from './charts'
import { usePoll } from './use-poll'

type Conn = { conn_id: string; conn_nm: string; dbms_cd: string; exec_mthd_cd: string }
type Big = number | string | null
type Stat = { sess_cnt: number; conn_cnt: number; lock_wait_cnt: number; xact_cnt: Big; blks_hit_cnt: Big; blks_read_cnt: Big; tup_cnt: Big; dlck_cnt: Big; tmp_sz: Big; db_sz: Big }
type Hist = Stat & { bkt_dtm: string }
type Res = { now: { stat: Stat; sess: Record<string, unknown>[] } | { err: string }; hist: Hist[] }
const N = (v: Big) => (v === null ? null : Number(v))

export default function DbTab({ areaId, live, min }: { areaId: string; live: boolean; min: number }) {
  const [conns, setConns] = useState<Conn[] | null>(null)
  const [conn, setConn] = useState('')
  useEffect(() => {
    void piFetch(`/api/areas/${areaId}/db-conns`)
      .then((r) => r.json())
      .then((j) => {
        const pg = ((j.items ?? []) as Conn[]).filter((c) => c.dbms_cd === '0014' && c.exec_mthd_cd === 'SRV')
        setConns(pg)
        setConn((c) => c || pg[0]?.conn_id || '')
      })
      .catch(() => setConns([]))
  }, [areaId])
  const { data, err } = usePoll<Res>(conn ? `/api/areas/${areaId}/mon/db?conn=${conn}&min=${min}` : null, live)
  const v = useMemo(() => {
    const h = data?.hist ?? []
    const ser = (k: keyof Stat) => h.map((x) => ({ t: x.bkt_dtm, v: N(x[k] as Big) }))
    const hit = h.slice(1).map((x, i) => ({ t: x.bkt_dtm, v: hitPct(N(h[i].blks_hit_cnt) ?? 0, N(h[i].blks_read_cnt) ?? 0, N(x.blks_hit_cnt) ?? 0, N(x.blks_read_cnt) ?? 0) }))
    const dl = h.slice(1).map((x, i) => ({ t: x.bkt_dtm, v: Math.max(0, (N(x.dlck_cnt) ?? 0) - (N(h[i].dlck_cnt) ?? 0)) }))
    return { tps: perSec(ser('xact_cnt')), tup: perSec(ser('tup_cnt')), hit: hit as Pt[], dl: dl as Pt[], sess: ser('sess_cnt'), lock: ser('lock_wait_cnt') }
  }, [data])

  if (conns && !conns.length) return <p className="rounded border p-4 text-sm text-gray-600">PostgreSQL 서버 직접(SRV) 접속이 없습니다 — 설정 → DB 접속에서 등록하십시오(Oracle·Tibero·에이전트 접속은 이후 단계).</p>
  const now = data?.now && 'stat' in data.now ? data.now : null
  const nowErr = data?.now && 'err' in data.now ? data.now.err : null
  const last = (p: Pt[]) => [...p].reverse().find((x) => x.v !== null)?.v ?? null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-[#2c3850]" htmlFor="mon-conn">
          인스턴스
        </label>
        <select id="mon-conn" className="rounded border px-2 py-1 text-sm" value={conn} onChange={(e) => setConn(e.target.value)}>
          {(conns ?? []).map((c) => (
            <option key={c.conn_id} value={c.conn_id}>
              {c.conn_nm}
            </option>
          ))}
        </select>
        <span className="text-xs text-[#5b6578]">읽기 전용·5초 제한으로 pg_stat_activity·pg_stat_database·pg_locks 를 조회합니다(초당 값은 1분 이력 차이).</span>
      </div>
      {(err || nowErr) && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{err || `지금 값을 읽지 못했습니다 : ${nowErr}`}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="활성 세션" val={String(now?.stat.sess_cnt ?? '—')} />
        <Tile nm="접속" val={String(now?.stat.conn_cnt ?? '—')} />
        <Tile nm="락 대기" val={String(now?.stat.lock_wait_cnt ?? '—')} warn={(now?.stat.lock_wait_cnt ?? 0) > 0} />
        <Tile nm="트랜잭션/s" val={fmtN(last(v.tps))} sub="최근 1분" />
        <Tile nm="DB 크기" val={fmtB(N(now?.stat.db_sz ?? null))} />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Line title="트랜잭션(/s)" pts={v.tps} unit="/s" />
        <Line title="버퍼 캐시 적중률(%)" pts={v.hit} unit="%" max={100} color="#16a34a" />
        <Line title="변경 행(/s)" pts={v.tup} unit="/s" color="#7c3aed" />
        <Line title="활성 세션" pts={v.sess} color="#0891b2" />
        <Line title="락 대기" pts={v.lock} color="#f59e0b" />
        <Line title="교착(분당)" pts={v.dl} color="#dc2626" />
      </div>
      <section>
        <h3 className="mb-1 text-sm font-bold text-[#2c3850]">활성 세션(유휴 제외, 오래 실행된 순 20)</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-xs">
            <thead className="thead-3d">
              <tr>
                {['pid', '사용자', '클라이언트', '상태', '대기', '실행(ms)', '질의'].map((h) => (
                  <th key={h} className="px-2 py-1 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(now?.sess ?? []).map((s) => (
                <tr key={String(s.pid)} className="border-b align-top">
                  <td className="px-2 py-1 tabular-nums">{String(s.pid)}</td>
                  <td className="px-2 py-1">{String(s.usr_nm ?? '')}</td>
                  <td className="px-2 py-1">{String(s.client_addr ?? '')}</td>
                  <td className="px-2 py-1">{String(s.state ?? '')}</td>
                  <td className="px-2 py-1">{String(s.wait_event ?? '')}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtN(Number(s.run_ms ?? 0), 0)}</td>
                  <td className="max-w-[28rem] truncate px-2 py-1 font-mono" title={String(s.query ?? '')}>
                    {String(s.query ?? '')}
                  </td>
                </tr>
              ))}
              {now && !now.sess.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                    실행 중인 세션이 없습니다
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
