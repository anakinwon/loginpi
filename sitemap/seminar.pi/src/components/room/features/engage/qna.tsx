'use client'
// Q&A 탭(SubAgent4, 설계서 15.3) — 질문 등록(500자)·추천 ▲(aria-pressed, 1인 1회)·추천순/최신순, 개최자·ADMIN 은 [답변함]·[숨기기](내 질문은 본인도 숨김).
//  Ctrl/⌘+Enter 로 보내기, 상한 90% 부터 남은 글자 수(T04 r3 보강). 답변한 질문은 아래 '답변함 N개'로 접힌다. 20개 단위 페이지. refresh 신호 수신·저장소 초기화는 polls 기능이 두 탭 몫을 함께 한다(중복 처리 방지)
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pagination } from '@/components/seminar/pagination'
import { useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { charsLeft, QNA_MAX, sendKey } from '@/lib/engage-rules'
import type { RoomCtx, RoomFeature } from '../../extensions'
import { api, engageable, SLOTS, tell, useLoad } from './shared'

type Item = { id: string; text: string; n: number; answered: boolean; mine: boolean; own: boolean; name: string }
type List = { items: Item[]; page: number; pages: number; answered: number; staff: boolean }
type Act = 'rcm' | 'unrcm' | 'answer' | 'unanswer' | 'hide'

const SMALL = 'bg-surface-raised h-10 rounded-lg px-3 text-sm disabled:opacity-50'

function QnaPanel({ ctx, visible }: { ctx: RoomCtx; visible: boolean }) {
  const t = useTranslations('room.qna')
  const errText = useApiErrorText()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'top' | 'new'>('top')
  const [ans, setAns] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<ApiErrorBody | null>(null)
  const ok = engageable(ctx.seminarId)
  const left = charsLeft(text.length, QNA_MAX)
  const base = `/api/seminars/${ctx.seminarId}/qna`
  const { data, err, reload } = useLoad<List>(
    ok ? `${base}?page=${page}&sort=${sort}&ans=${ans ? 1 : 0}` : null,
    visible,
    'qna',
  )

  if (!ok) return <p className="text-muted-foreground p-4 text-sm">{t('labOnly')}</p>

  async function act(method: 'POST' | 'PATCH', body: unknown, isNew = false) {
    setBusy(true)
    const r = await api(base, method, body)
    setBusy(false)
    reload()
    if (!r.ok) {
      setMsg(r.body)
      return false
    }
    setMsg(null)
    tell(ctx, 'qna', isNew)
    return true
  }
  const patch = (qnaId: string, a: Act) => void act('PATCH', { qnaId, act: a })
  const view = (nextAns: boolean) => {
    setAns(nextAns)
    setPage(1)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-2 p-3">
        <div className="flex gap-1" role="group" aria-label={t('sort')}>
          {(['top', 'new'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sort === s}
              className={`h-10 flex-1 rounded-lg text-sm ${sort === s ? 'bg-surface-raised font-medium' : 'text-muted-foreground'}`}
              onClick={() => {
                setSort(s)
                setPage(1)
              }}
            >
              {t(`by.${s}`)}
            </button>
          ))}
        </div>
        {ans && (
          <button type="button" className={`${SMALL} w-full`} onClick={() => view(false)}>
            ← {t('backOpen')}
          </button>
        )}
        {(err || msg) && (
          <p role="alert" className="text-danger text-sm">
            {errText((msg ?? err)!)}
          </p>
        )}
        {!data && !err && <p className="text-muted-foreground text-sm">{t('loading')}</p>}
        {data && !data.items.length && <p className="text-muted-foreground text-sm">{t(ans ? 'emptyDone' : 'empty')}</p>}
        <ul className="space-y-2">
          {data?.items.map((q) => (
            <li key={q.id} className="bg-surface-raised/50 flex gap-2 rounded-xl p-2">
              <button
                type="button"
                aria-pressed={q.mine}
                aria-label={t('rcm', { n: q.n })}
                disabled={busy}
                onClick={() => patch(q.id, q.mine ? 'unrcm' : 'rcm')}
                className={`grid h-12 w-10 shrink-0 place-items-center rounded-lg text-xs tabular-nums ${q.mine ? 'bg-accent text-white' : 'bg-surface-raised'}`}
              >
                <span aria-hidden>▲</span>
                {q.n}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm break-words whitespace-pre-wrap">{q.text}</p>
                <p className="text-muted-foreground text-xs">
                  {q.name}
                  {q.answered && ` · ${t('answered')}`}
                </p>
                {(data.staff || q.own) && (
                  <div className="flex flex-wrap gap-1">
                    {data.staff && (
                      <button
                        type="button"
                        className={SMALL}
                        disabled={busy}
                        onClick={() => patch(q.id, q.answered ? 'unanswer' : 'answer')}
                      >
                        {t(q.answered ? 'unanswer' : 'answer')}
                      </button>
                    )}
                    <button type="button" className={SMALL} disabled={busy} onClick={() => patch(q.id, 'hide')}>
                      {t('hide')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!ans && !!data?.answered && (
          <button type="button" className={`${SMALL} w-full`} onClick={() => view(true)}>
            ▸ {t('doneN', { n: data.answered })}
          </button>
        )}
        {data && <Pagination page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
      <form
        className="bg-surface sticky bottom-0 flex gap-2 border-t border-white/10 p-2"
        onSubmit={async (e) => {
          e.preventDefault()
          // requestSubmit()(Ctrl/⌘+Enter)은 비활성 [보내기] 버튼을 무시하고 제출한다 — 보내는 중이면 여기서 막는다(중복 질문, T04 r6)
          if (busy || !text.trim()) return
          if (await act('POST', { text }, true)) {
            setText('')
            view(false)
            setSort('new')
          }
        }}
      >
        <textarea
          className="bg-surface-raised min-h-10 flex-1 resize-none rounded-lg px-3 py-2 text-sm"
          rows={1}
          maxLength={QNA_MAX}
          aria-label={t('input')}
          placeholder={t('input')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (!sendKey({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, isComposing: e.nativeEvent.isComposing, repeat: e.repeat })) return
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }}
        />
        {left !== null && (
          <span aria-live="polite" className="text-muted-foreground self-center text-xs tabular-nums">
            {t('left', { n: left })}
          </span>
        )}
        <button type="submit" className={`${SMALL} bg-accent! text-white`} disabled={busy || !text.trim()}>
          {t('send')}
        </button>
      </form>
    </div>
  )
}

export const qna: RoomFeature = {
  id: 'qna',
  tab: { id: 'qna', label: 'panel.qna', badge: SLOTS.qna.badge, Panel: QnaPanel },
}
