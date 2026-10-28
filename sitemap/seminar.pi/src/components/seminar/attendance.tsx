'use client'
// 출석부(SubAgent4) — 개최자·ADMIN. 50명 단위 페이지, 이름·입장·마지막 확인·참석 시간·상태(접속 중/나감), [CSV 내려받기].
//  조회는 piFetch(X-Pi-Token — Pi Browser 는 쿠키 없음), 비로그인 = LoginGate(redirect 없음), 권한 없음 = 403 문구.
//  CSV 는 <a href> 직접 내려받기가 X-Pi-Token 을 못 붙이므로 piFetch 로 받아 화면에서 만든다(번역된 머리글, 수식 주입 방지 — engage-rules toCsv).
//  Pi Browser 의 Blob 내려받기 동작은 [확인중 : 실기기]
//  화면이 보이는 동안 10초(POLL_MS)마다 + 탭으로 돌아온 순간 지금 쪽을 다시 읽는다 — 새 입장자가 하트비트 간격(60초)만큼 늦게 보이거나
//  다른 화면에 다녀와야 보이던 것 보강(마스터 2026-10-28, T04 r4). 서버 응답은 no-store
//  다시 읽기 실패는 표를 지우지 않는다(처음 읽기 실패만 오류 화면)
import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Link } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { inViewerTz } from '@/lib/calendar-rules'
import { fmtDur, isOnline, toCsv } from '@/lib/engage-rules'
import { Pagination } from './pagination'
import { BTN, useSeminarErrText } from './shared'

type Row = { name: string; piName: string; ent: string; hb: string; sec: number } // sec = 들락거린 시간을 뺀 참석 시간(sql/020)
type List = { title: string; items: Row[]; total: number; page: number; pages: number }

// 출석부 다시 읽기 간격 — 개최자·ADMIN 만 여는 화면이라 요청 부담이 작다(보일 때만)
const POLL_MS = 10_000

const load = (id: string, q: string) => readApi<List>(piFetch(`/api/seminars/${id}/attendance?${q}`, { cache: 'no-store' }))

export function Attendance({ id }: { id: string }) {
  return <LoginGate>{() => <Sheet id={id} />}</LoginGate>
}

function Sheet({ id }: { id: string }) {
  const t = useTranslations('host.attendance')
  const errText = useSeminarErrText()
  const f = useFormatter()
  const [page, setPage] = useState(1)
  const [d, setD] = useState<List | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }
    const timer = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    let live = true
    void load(id, `page=${page}`).then((r) => {
      if (!live) return
      if (r.ok) {
        setNow(Date.now()) // 상태(접속 중/나감) 기준 시각 = 받은 자료 시각 — 실패한 다시 읽기는 옛 표를 새 시각으로 판정하지 않게
        setD(r.data)
        setErr(null)
      } else if (!tick || r.status === 403) setErr(r.status === 403 ? t('forbidden') : errText(r.body))
    })
    return () => {
      live = false
    }
  }, [id, page, tick, t, errText])

  const when = (iso: string) => f.dateTime(new Date(iso), inViewerTz({ dateStyle: 'short', timeStyle: 'short' }))
  const name = (r: Row) => r.name || r.piName || '—'

  async function csv() {
    setBusy(true)
    const r = await load(id, 'all=1')
    setBusy(false)
    if (!r.ok) return setErr(errText(r.body))
    const head = [t('col.name'), t('col.pi'), t('col.ent'), t('col.hb'), t('col.min')]
    const body = r.data.items.map((x) => [x.name, x.piName, when(x.ent), when(x.hb), Math.round(x.sec / 60)])
    const url = URL.createObjectURL(new Blob([toCsv([head, ...body])], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${id.slice(0, 8)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (err)
    return (
      <div role="alert" className="bg-surface space-y-3 rounded-xl p-4 text-sm">
        <p>{err}</p>
        <Link href={`/s/${id}`} className={BTN}>
          {t('back')}
        </Link>
      </div>
    )
  if (!d) return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  return (
    <section className="space-y-4">
      <Link href={`/s/${id}`} className="text-muted-foreground text-sm hover:underline">
        ← {t('back')}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold break-words">{t('title')}</h1>
          <p className="text-muted-foreground text-sm break-words">
            {d.title} · {t('count', { n: d.total })}
          </p>
        </div>
        <button type="button" className={BTN} disabled={busy || !d.total} onClick={() => void csv()}>
          {t('csv')}
        </button>
      </header>
      {!d.items.length ? (
        <p className="bg-surface rounded-xl p-4 text-sm">{t('empty')}</p>
      ) : (
        <div className="bg-surface overflow-x-auto rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t('col.name')}</th>
                <th className="p-3 font-medium whitespace-nowrap">{t('col.ent')}</th>
                <th className="p-3 font-medium whitespace-nowrap">{t('col.hb')}</th>
                <th className="p-3 font-medium">{t('col.dur')}</th>
                <th className="p-3 font-medium">{t('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((r, i) => (
                <tr key={i} className="border-t border-white/10">
                  <td className="p-3 break-words">{name(r)}</td>
                  <td className="p-3 whitespace-nowrap">{when(r.ent)}</td>
                  <td className="p-3 whitespace-nowrap">{when(r.hb)}</td>
                  <td className="p-3 tabular-nums">{fmtDur(r.sec)}</td>
                  <td className="p-3">{isOnline(r.hb, now) ? t('online') : t('left')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!d.items.length && <p className="text-muted-foreground text-xs">{t('durNote')}</p>}
      <Pagination page={d.page} pages={d.pages} onPage={setPage} />
    </section>
  )
}
