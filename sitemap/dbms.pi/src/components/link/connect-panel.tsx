'use client'

// /connect 본문 — 로그인 게이트 + 연결 토큰 등록 폼 + 내 연결 목록(20건 페이지) + 연결별 접속 상태판(화면에 보일 때 지연 조회)
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { LoginGate } from '@/components/login-gate'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { useLinkErrText, type LinkConn, type LinkItem, type LinkList } from './link-api'

// LoginGate 의 children 은 함수라 서버 페이지에서 넘길 수 없다 — 여기서 감싼다
export function ConnectPanel() {
  return <LoginGate>{() => <ConnectBody />}</LoginGate>
}

function ConnectBody() {
  const t = useTranslations('link2')
  const errText = useLinkErrText()
  const [page, setPage] = useState(1)
  const [list, setList] = useState<LinkList | null>(null)
  const [listErr, setListErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    void readApi<LinkList>(piFetch(`/api/link?page=${page}`)).then((r) => {
      if (!alive) return
      if (r.ok) {
        setList(r.data)
        setListErr(null)
      } else setListErr(errText(r.body))
    })
    return () => {
      alive = false
    }
  }, [page, reload, errText])

  const refresh = useCallback(() => setReload((n) => n + 1), [])

  return (
    <div className="flex flex-col gap-4">
      <RegisterForm
        onDone={() => {
          setPage(1)
          refresh()
        }}
      />
      <section className="flex flex-col gap-3">
        <h2 className="font-bold">{t('myLinks')}</h2>
        {listErr && <p className="text-danger text-sm">{listErr}</p>}
        {!list && !listErr && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
        {list && list.items.length === 0 && (
          <p className="text-muted-foreground bg-surface rounded-2xl p-4 text-sm">{t('empty')}</p>
        )}
        {list?.items.map((l) => (
          <LinkCard key={l.linkId} link={l} onRemoved={refresh} />
        ))}
        {list && (page > 1 || list.hasMore) && (
          <div className="flex items-center justify-center gap-2">
            <button className={BTN} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('prev')}
            </button>
            <span className="text-muted-foreground text-sm tabular-nums">{page}</span>
            <button className={BTN} disabled={!list.hasMore} onClick={() => setPage((p) => p + 1)}>
              {t('next')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('link2')
  const errText = useLinkErrText()
  const [tkn, setTkn] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg(null)
    const r = await readApi<{ link: LinkItem; replaced: boolean }>(
      piFetch('/api/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tkn: tkn.trim() }),
      }),
    )
    setBusy(false)
    if (r.ok) {
      setTkn('')
      setMsg({ ok: true, text: t(r.data.replaced ? 'replaced' : 'registered', { area: r.data.link.areaNm }) })
      onDone()
    } else setMsg({ ok: false, text: errText(r.body) })
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="bg-surface flex flex-col gap-3 rounded-2xl p-5">
      <h2 className="font-bold">{t('registerTitle')}</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('tokenLabel')}</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={tkn}
          onChange={(e) => setTkn(e.target.value)}
          placeholder={t('tokenPlaceholder')}
          className="bg-surface-raised h-11 w-full rounded-lg px-3 font-mono text-sm"
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={BTN_PRIMARY} disabled={busy || !tkn.trim()}>
          {busy ? t('registering') : t('register')}
        </button>
        {msg && (
          <p role="status" className={msg.ok ? 'text-sm' : 'text-danger text-sm'}>
            {msg.text}
          </p>
        )}
      </div>
    </form>
  )
}

// 화면에 들어오기 직전 1번 true (섹션 지연 조회 표준)
function useOnVisible<T extends Element>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '200px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  return [ref, visible] as const
}

function LinkCard({ link, onRemoved }: { link: LinkItem; onRemoved: () => void }) {
  const t = useTranslations('link2')
  const fmt = useFormatter()
  const errText = useLinkErrText()
  const [ref, visible] = useOnVisible<HTMLElement>()
  const [conns, setConns] = useState<LinkConn[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!visible) return
    let alive = true
    void readApi<{ items: LinkConn[] }>(piFetch(`/api/link/${link.linkId}/conns`)).then((r) => {
      if (!alive) return
      if (r.ok) {
        setConns(r.data.items)
        setErr(null)
      } else setErr(errText(r.body))
    })
    return () => {
      alive = false
    }
  }, [visible, tick, link.linkId, errText])

  async function remove() {
    if (!window.confirm(t('removeConfirm', { area: link.areaNm }))) return
    setBusy(true)
    const r = await readApi(piFetch(`/api/link/${link.linkId}`, { method: 'DELETE' }))
    setBusy(false)
    if (r.ok) onRemoved()
    else setErr(errText(r.body))
  }

  const dtm = (v: string | null) =>
    v ? fmt.dateTime(new Date(v), { dateStyle: 'short', timeStyle: 'short' }) : t('never')

  return (
    <article ref={ref} className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-all">{link.areaNm}</h3>
          <p className="text-muted-foreground text-xs">{t('regDtm', { dtm: dtm(link.regDtm) })}</p>
        </div>
        <button className={BTN} disabled={busy} onClick={() => void remove()}>
          {t('remove')}
        </button>
      </div>
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs font-semibold">{t('statusTitle')}</h4>
        {err && (
          <p className="text-danger flex flex-wrap items-center gap-2 text-xs">
            {err}
            <button className="underline" onClick={() => setTick((n) => n + 1)}>
              {t('retry')}
            </button>
          </p>
        )}
        {!conns && !err && <p className="text-muted-foreground text-xs">{t('loading')}</p>}
        {conns && conns.length === 0 && <p className="text-muted-foreground text-xs">{t('noConns')}</p>}
        {conns && conns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t('colConn')}</th>
                  <th className="py-1 pr-2 font-medium">{t('colDbms')}</th>
                  <th className="py-1 pr-2 font-medium">{t('colMthd')}</th>
                  <th className="py-1 pr-2 font-medium">{t('colHost')}</th>
                  <th className="py-1 pr-2 font-medium">{t('colTest')}</th>
                  <th className="py-1 font-medium">{t('colAgent')}</th>
                </tr>
              </thead>
              <tbody>
                {conns.map((c) => (
                  <tr key={c.connId} className="border-t border-white/10">
                    <td className="py-1 pr-2">
                      {c.connNm}
                      {c.dbNm && <span className="text-muted-foreground"> · {c.dbNm}</span>}
                    </td>
                    <td className="py-1 pr-2">{c.dbmsCd}</td>
                    <td className="py-1 pr-2">{c.execMthdCd}</td>
                    <td className="py-1 pr-2 font-mono">{c.hostMasked ?? '—'}</td>
                    <td className="py-1 pr-2 tabular-nums">{dtm(c.lstTestDtm)}</td>
                    <td className="py-1 tabular-nums">{c.execMthdCd === 'AGT' ? dtm(c.agtLstSeenDtm) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  )
}
