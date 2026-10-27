'use client'
// 설문 탭(SubAgent4, 설계서 15.3) — 개최자·ADMIN 은 [+ 새 설문]·[마감]·실시간 결과(투표는 [투표]를 눌러서), 전원은 1인 1표(라디오, 다시 투표 가능). 결과 = 막대 + '45% (9표)' 글자.
//  새 설문은 10초 토스트 [투표하기] → 이 탭을 연다. 변경 뒤 refresh 신호로 다른 사람이 다시 읽는다(shared.ts).
//  refresh 수신(onApp)·저장소 초기화(onReset)는 이 기능 하나가 설문·Q&A 두 탭 몫을 한다 — 두 기능에 다 걸면 배지가 2번 오른다
import { useEffect, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pagination } from '@/components/seminar/pagination'
import { useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { POLL, pollVoting } from '@/lib/engage-rules'
import { useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import { api, engageable, onRefresh, pollToast, resetSlots, SLOTS, tell, useLoad } from './shared'

type Opt = { id: string; text: string; n: number; pct: number }
type Poll = { id: string; q: string; open: boolean; mine: string | null; total: number; opts: Opt[] }
type List = { items: Poll[]; page: number; pages: number; staff: boolean }

const TOAST_MS = 10_000
const INPUT = 'bg-surface-raised w-full rounded-lg px-3 py-2 text-sm'
const SMALL = 'bg-surface-raised h-10 rounded-lg px-3 text-sm disabled:opacity-50'

function PollsPanel({ ctx, visible }: { ctx: RoomCtx; visible: boolean }) {
  const t = useTranslations('room.polls')
  const errText = useApiErrorText()
  const [page, setPage] = useState(1)
  const ok = engageable(ctx.seminarId)
  const { data, err, reload } = useLoad<List>(ok ? `/api/seminars/${ctx.seminarId}/polls?page=${page}` : null, visible, 'polls')
  const [msg, setMsg] = useState<ApiErrorBody | null>(null)
  const [adding, setAdding] = useState(false)

  if (!ok) return <p className="text-muted-foreground p-4 text-sm">{t('labOnly')}</p>

  // 쓰기 공통 — 성공하면 다시 읽고 다른 사람에게 알린다
  async function act(method: 'POST' | 'PATCH', body: unknown, isNew = false) {
    const r = await api(`/api/seminars/${ctx.seminarId}/polls`, method, body)
    if (!r.ok) {
      setMsg(r.body)
      reload()
      return false
    }
    setMsg(null)
    reload()
    tell(ctx, 'polls', isNew)
    return true
  }

  return (
    <div className="space-y-3 p-3">
      {data?.staff &&
        (adding ? (
          <NewPoll
            onCancel={() => setAdding(false)}
            onSubmit={async (q, opts) => {
              if (await act('POST', { q, opts }, true)) {
                setAdding(false)
                setPage(1)
              }
            }}
          />
        ) : (
          <button type="button" className={`${SMALL} w-full`} onClick={() => setAdding(true)}>
            + {t('new')}
          </button>
        ))}
      {(err || msg) && (
        <p role="alert" className="text-danger text-sm">
          {errText((msg ?? err)!)}
        </p>
      )}
      {!data && !err && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
      {data && !data.items.length && <p className="text-muted-foreground text-sm">{t('empty')}</p>}
      {data?.items.map((p) => (
        <PollCard
          key={p.id}
          p={p}
          staff={data.staff}
          onVote={(optId) => act('PATCH', { pllId: p.id, optId })}
          onClose={() => act('PATCH', { pllId: p.id, close: true })}
        />
      ))}
      {data && <Pagination page={data.page} pages={data.pages} onPage={setPage} />}
    </div>
  )
}

function PollCard({
  p,
  staff,
  onVote,
  onClose,
}: {
  p: Poll
  staff: boolean
  onVote: (optId: string) => Promise<boolean>
  onClose: () => Promise<boolean>
}) {
  const t = useTranslations('room.polls')
  const name = useId()
  const [pick, setPick] = useState<string | null>(p.mine)
  const [change, setChange] = useState(false)
  const [busy, setBusy] = useState(false)
  const voting = pollVoting({ open: p.open, mine: p.mine, staff, change })
  const run = async (f: () => Promise<boolean>) => {
    setBusy(true)
    if (await f()) setChange(false)
    setBusy(false)
  }

  return (
    <section className="bg-surface-raised/50 space-y-2 rounded-xl p-3">
      <h3 className="text-sm font-semibold break-words">
        {p.q}
        {!p.open && <span className="text-muted-foreground ml-2 text-xs font-normal">{t('closed')}</span>}
      </h3>
      {voting ? (
        <fieldset className="space-y-1">
          <legend className="sr-only">{p.q}</legend>
          {p.opts.map((o) => (
            <label key={o.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input type="radio" name={name} checked={pick === o.id} onChange={() => setPick(o.id)} />
              <span className="break-words">{o.text}</span>
            </label>
          ))}
          <button
            type="button"
            className={SMALL}
            disabled={!pick || busy}
            onClick={() => pick && void run(() => onVote(pick))}
          >
            {t('vote')}
          </button>
        </fieldset>
      ) : (
        <ul className="space-y-1">
          {p.opts.map((o) => (
            <li key={o.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="break-words">
                  {o.text}
                  {p.mine === o.id && <span className="text-accent ml-1 text-xs">✓ {t('mine')}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{t('result', { pct: o.pct, n: o.n })}</span>
              </div>
              <div className="bg-surface h-2 overflow-hidden rounded-full" aria-hidden>
                <div
                  className={`h-full ${p.mine === o.id ? 'bg-accent' : 'bg-surface-raised'}`}
                  style={{ width: `${o.pct}%` }}
                />
              </div>
            </li>
          ))}
          <li className="text-muted-foreground text-xs">{t('total', { n: p.total })}</li>
        </ul>
      )}
      <div className="flex gap-2">
        {p.open && (p.mine || staff) && !change && (
          <button type="button" className={SMALL} onClick={() => setChange(true)}>
            {t(p.mine ? 'change' : 'vote')}
          </button>
        )}
        {change && (
          <button type="button" className={SMALL} disabled={busy} onClick={() => setChange(false)}>
            {t('cancel')}
          </button>
        )}
        {staff && p.open && (
          <button type="button" className={SMALL} disabled={busy} onClick={() => void run(onClose)}>
            {t('close')}
          </button>
        )}
      </div>
    </section>
  )
}

function NewPoll({ onSubmit, onCancel }: { onSubmit: (q: string, opts: string[]) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations('room.polls')
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  const filled = opts.map((o) => o.trim())
  const valid =
    q.trim().length > 0 &&
    filled.every(Boolean) &&
    new Set(filled.map((o) => o.toLowerCase())).size === filled.length
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        await onSubmit(q, opts)
        setBusy(false)
      }}
    >
      <textarea
        className={INPUT}
        aria-label={t('question')}
        placeholder={t('question')}
        maxLength={POLL.Q_MAX}
        rows={2}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {opts.map((o, i) => (
        <div key={i} className="flex gap-1">
          <input
            className={INPUT}
            aria-label={t('option', { n: i + 1 })}
            placeholder={t('option', { n: i + 1 })}
            maxLength={POLL.OPT_LEN}
            value={o}
            onChange={(e) => setOpts((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {opts.length > POLL.OPT_MIN && (
            <button
              type="button"
              className={SMALL}
              aria-label={t('remove', { n: i + 1 })}
              onClick={() => setOpts((a) => a.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!valid && filled.every(Boolean) && q.trim() && <p className="text-danger text-xs">{t('dup')}</p>}
      <div className="flex flex-wrap gap-2">
        {opts.length < POLL.OPT_MAX && (
          <button type="button" className={SMALL} onClick={() => setOpts((a) => [...a, ''])}>
            + {t('addOption')}
          </button>
        )}
        <button type="submit" className={`${SMALL} bg-accent! text-white`} disabled={!valid || busy}>
          {t('start')}
        </button>
        <button type="button" className={SMALL} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

// 새 설문 토스트 — 10초, [투표하기] = 설문 탭 열기. 무대 위 상단 가운데(배지는 좌상단이라 겹치지 않게)
function PollToast({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  const t = useTranslations('room.polls')
  const on = useStore(pollToast)
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => pollToast.set(false), TOAST_MS)
    return () => clearTimeout(timer)
  }, [on])
  return (
    <div role="status" className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      {on && (
        <div className="bg-surface pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2 text-sm shadow-lg">
          <span>{t('started')}</span>
          <button
            type="button"
            className="bg-accent h-10 rounded-lg px-3 font-semibold text-white"
            onClick={() => {
              pollToast.set(false)
              ctx.openPanel('polls')
            }}
          >
            {t('goVote')}
          </button>
        </div>
      )}
    </div>
  )
}

export const polls: RoomFeature = {
  id: 'polls',
  tab: { id: 'polls', label: 'panel.polls', badge: SLOTS.polls.badge, Panel: PollsPanel },
  Overlay: PollToast,
  onApp: onRefresh,
  onReset: resetSlots,
}
