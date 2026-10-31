'use client'

// 방 관리 화면(M5, PRD_01 5절) — 엔진에 열린 방(접속·송출·정원·종료 예정) + 세미나 정보, 엔진 전역 지표, 방 강제 종료(2단계 확인).
//  조회 = piFetch(X-Pi-Token — Pi Browser 는 쿠키가 없다), 비로그인 = LoginGate, ADMIN 아님 = 안내(redirect 없음). 자동 갱신 없음 — [새로고침]
import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { Pagination } from '@/components/seminar/pagination'
import { BTN, useStartText } from '@/components/seminar/shared'
import { Link } from '@/i18n/navigation'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { isUuid, OPEN_STS, pageCount } from '@/lib/seminar-rules'

type Row = {
  id: string
  cap: number
  peers: number
  producers: number
  end: string | null
  seminar: { title: string; status: string; host: string } | null
}
type Res = { rows: Row[]; total: number; page: number; metrics: Record<string, number> | null }

export function AdminRooms() {
  const t = useTranslations('adminRooms')
  return (
    <LoginGate>
      {(user) =>
        user.role === 'ADMIN' || user.role === 'MASTER' ? (
          <Rooms />
        ) : (
          <p role="alert" className="bg-surface rounded-xl p-4 text-sm">
            {t('adminOnly')}
          </p>
        )
      }
    </LoginGate>
  )
}

function Rooms() {
  const t = useTranslations('adminRooms')
  const tl = useTranslations('list')
  const f = useFormatter()
  const when = useStartText()
  const errText = useApiErrorText()
  const [page, setPage] = useState(1)
  const [tries, setTries] = useState(0) // [새로고침]·종료 뒤 다시 읽기
  const [res, setRes] = useState<Res | null>(null)
  const [err, setErr] = useState<ApiErrorBody | null>(null)
  const [ask, setAsk] = useState<string | null>(null) // 종료 확인 중인 방
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void readApi<Res>(piFetch(`/api/admin/rooms?page=${page}`, { cache: 'no-store' })).then((r) => {
      if (!live) return
      if (r.ok) {
        setRes(r.data)
        setErr(null)
      } else setErr(r.body)
    })
    return () => {
      live = false
    }
  }, [page, tries])

  async function close(id: string) {
    setBusy(true)
    setMsg(null)
    const r = await readApi<{ ok: true }>(
      piFetch(`/api/admin/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    )
    setBusy(false)
    setAsk(null)
    setMsg(r.ok ? t('closed') : errText(r.body))
    setTries((n) => n + 1)
  }

  const refresh = (
    <button type="button" className={BTN} onClick={() => setTries((n) => n + 1)}>
      {t('refresh')}
    </button>
  )
  if (err)
    return (
      <p role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        {errText(err)}
        {refresh}
      </p>
    )
  if (!res) return <p className="text-muted-foreground text-sm">{tl('loading')}</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">{t('count', { n: res.total })}</p>
        {refresh}
        {msg && (
          <p role="status" className="text-muted-foreground text-sm">
            {msg}
          </p>
        )}
      </div>

      {res.total ? (
        <ul className="bg-surface divide-y divide-white/5 rounded-xl">
          {res.rows.map((r) => {
            const s = r.seminar
            // DB 는 끝났는데 엔진에 남은 방 — 강제 종료 대상
            const stale = !!s && !(OPEN_STS as readonly string[]).includes(s.status)
            return (
              <li key={r.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {s ? (
                    <Link href={`/s/${r.id}`} className="font-semibold hover:underline">
                      {s.title}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs break-all">{r.id}</span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {s
                      ? tl.has(`status.${s.status}`)
                        ? tl(`status.${s.status}`)
                        : s.status
                      : isUuid(r.id)
                        ? t('noSeminar')
                        : t('lab')}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {[
                    s?.host && tl('host', { name: s.host }),
                    t('peers', { n: r.peers, cap: r.cap }),
                    t('producers', { n: r.producers }),
                    r.end && t('end', { time: when(r.end) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {stale && <p className="text-danger text-xs">{t('stale')}</p>}
                {ask === r.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs">{t(s ? 'confirmSeminar' : 'confirmRoom')}</span>
                    <button
                      type="button"
                      disabled={busy}
                      className={`${BTN} bg-danger text-white`}
                      onClick={() => void close(r.id)}
                    >
                      {busy ? t('closing') : t('confirmYes')}
                    </button>
                    <button type="button" disabled={busy} className={BTN} onClick={() => setAsk(null)}>
                      {t('cancel')}
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={busy} className={BTN} onClick={() => setAsk(r.id)}>
                    {t('close')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      <Pagination page={page} pages={pageCount(res.total)} onPage={setPage} />

      <section className="space-y-2">
        <h2 className="font-semibold">{t('metrics')}</h2>
        {res.metrics ? (
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {Object.entries(res.metrics).map(([k, v]) => (
              <div key={k} className="bg-surface rounded-lg p-2">
                <dt className="text-muted-foreground text-xs">{t.has(`m.${k}`) ? t(`m.${k}`) : k}</dt>
                <dd className="font-semibold tabular-nums">{f.number(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{t('metricsOff')}</p>
        )}
      </section>
    </div>
  )
}
