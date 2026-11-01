'use client'

// 모니터링 보드 머리 — 전체 상태 카드(큰 배지 + 건수 4칸 + 신호 14칸 띠) · 핵심 수치 4개(HTML 싱글 넘버) · 지금 할 일(위험→주의, 5건 + 더보기, 설정하면 볼 수 있는 항목)
//  전체 판정이 바뀔 때만 aria-live 로 알린다. 띠·할 일을 누르면 해당 신호 카드를 연다
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LEVEL, LEVEL_ICON } from '@/components/ui'
import {
  SIG_IDS,
  summarize,
  todo,
  type Kpi,
  type Lvl,
  type SigId,
  type Signal,
} from '@/lib/monitor/signals'
import {
  CopyBtn,
  fmtBytes,
  GO,
  GoLink,
  LvlBadge,
  openSignal,
  SQL_CHECK,
  useSigText,
  type Sel,
} from './signal-grid'

const CARD = 'bg-surface rounded-2xl p-4'
const nf = (v: number | null, d = 1) =>
  v === null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: d })
const BIG: Record<Lvl, string> = {
  RISK: 'border-2 border-red-500/60',
  WARN: 'border border-amber-500/50',
  OK: 'border border-emerald-500/40',
  UNKNOWN: 'border border-dashed border-white/25',
  NA: 'border border-transparent',
}

export function OverallCard({ signals }: { signals: Map<SigId, Signal> }) {
  const t = useTranslations('monitor.board')
  const { name } = useSigText()
  const list = [...signals.values()]
  const sum = summarize(list)
  const key = sum.cascade ? 'CONN_DOWN' : sum.overall
  return (
    <section className={`${CARD} ${BIG[sum.overall]} space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className={`grid size-12 shrink-0 place-items-center rounded-full text-2xl font-black ${LEVEL[sum.overall]}`}
        >
          {LEVEL_ICON[sum.overall]}
        </span>
        <p
          className="min-w-0 flex-1 text-lg font-extrabold break-keep md:text-xl"
          aria-live="polite"
        >
          {t(`overall.${key}`)}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['RISK', 'WARN', 'OK', 'UNKNOWN'] as const).map((l) => (
          <div key={l} className="bg-surface-raised rounded-xl px-3 py-2">
            <dt className="text-muted-foreground flex items-center gap-1 text-xs">
              <span aria-hidden>{LEVEL_ICON[l]}</span>
              {t(`level.${l}`)}
            </dt>
            <dd className="text-2xl font-extrabold tabular-nums">
              {
                sum[
                  l === 'RISK'
                    ? 'risk'
                    : l === 'WARN'
                      ? 'warn'
                      : l === 'OK'
                        ? 'ok'
                        : 'unknown'
                ]
              }
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-1" role="list">
        {SIG_IDS.map((id) => {
          const s = signals.get(id)
          const l: Lvl = s?.lvl ?? 'NA'
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              disabled={!s}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold disabled:opacity-40 ${s ? LEVEL[l] : 'text-muted-foreground border border-dashed border-white/15'}`}
              aria-label={`${name(id)} : ${t(`level.${l}`)}`}
              onClick={() => openSignal(id)}
            >
              <span aria-hidden>{s ? LEVEL_ICON[l] : '·'}</span>
              {name(id)}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function KpiNumbers({ kpi }: { kpi: Kpi | null }) {
  const t = useTranslations('monitor.board.kpi')
  const items = [
    {
      k: 'sess',
      v: kpi?.sess == null ? '—' : `${nf(kpi.sess, 0)} / ${nf(kpi.maxConn, 0)}`,
    },
    { k: 'tps', v: nf(kpi?.tps ?? null, 1) },
    { k: 'cache', v: kpi?.cachePct == null ? '—' : `${nf(kpi.cachePct, 2)}%` },
    { k: 'size', v: fmtBytes(kpi?.dbSzByte ?? null) },
  ] as const
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {items.map((x) => (
        <div key={x.k} className={CARD}>
          <dt className="text-muted-foreground text-xs">{t(x.k)}</dt>
          <dd className="text-2xl font-extrabold tabular-nums">{x.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TodoList({
  signals,
  sel,
}: {
  signals: Map<SigId, Signal>
  sel: Sel
}) {
  const t = useTranslations('monitor.board')
  const { name, fix, reason } = useSigText()
  const [all, setAll] = useState(false)
  const list = [...signals.values()]
  const d = todo(list, all ? list.length : 5)
  const unk = list.filter((s) => s.lvl === 'UNKNOWN').length // 할 일 0건이어도 확인 불가가 있으면 '정상'이라 하지 않는다
  return (
    <section className={`${CARD} space-y-3`}>
      <h2 className="font-bold">{t('todo.title')}</h2>
      {d.items.length === 0 ? (
        unk > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('todo.unknown', { n: unk })}
          </p>
        ) : (
          <p className="text-sm text-emerald-400">
            <span aria-hidden>✓ </span>
            {t('todo.none')}
          </p>
        )
      ) : (
        <ol className="space-y-2">
          {d.items.map((s) => (
            <li
              key={s.id}
              className="bg-surface-raised flex flex-col gap-2 rounded-xl p-3 md:flex-row md:items-center"
            >
              <div className="flex shrink-0 items-center gap-2 md:w-56">
                <LvlBadge lvl={s.lvl} />
                <button
                  type="button"
                  className="min-w-0 text-left font-semibold underline-offset-2 hover:underline"
                  onClick={() => openSignal(s.id)}
                >
                  {name(s.id)}
                </button>
              </div>
              <p className="min-w-0 flex-1 text-sm break-keep">
                {fix(s)}
                {s.params.rule ? (
                  <span className="block text-xs text-red-400">
                    {t('todo.myRule', { rule: String(s.params.rule) })}
                  </span>
                ) : null}
              </p>
              <div className="flex shrink-0 flex-wrap gap-3">
                <GoLink g={GO[s.id][0]} sel={sel} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {(d.more > 0 || all) && (
        <button
          type="button"
          className="text-accent text-sm font-semibold underline"
          onClick={() => setAll(!all)}
        >
          {all ? t('todo.less') : t('todo.more', { n: d.more })}
        </button>
      )}
      {d.setup.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <h3 className="text-sm font-bold">{t('todo.setup')}</h3>
          <ul className="space-y-2">
            {d.setup.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 text-sm md:flex-row md:items-center"
              >
                <span className="font-semibold md:w-56">
                  <span aria-hidden>? </span>
                  {name(s.id)}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 break-keep">
                  {s.reason === 'PGSS' ? t('fix.PGSS') : reason(s)}
                </span>
                {s.reason === 'PGSS' && <CopyBtn text={SQL_CHECK.PGSS!} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
