'use client'

// 내 경보 규칙(dbm_mon_rule) 관리 — 보드 기본 판정(THR) 위에 사용자가 더하는 경보. 위반 평가는 서버 보드가 하고(신호 RISK 승격 + '내 규칙'),
//  여기서는 추가·끄기·삭제만. 신호 카드의 '이 지표에 규칙 추가'가 지표·접속을 미리 채운다(prefill). 모든 호출 piFetch
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import {
  METRICS,
  OPS,
  type MetricCd,
  type OpCd,
  type Rule,
} from '@/lib/monitor/rules'
import { isRuleEvaluated } from '@/lib/monitor/signals'

export const OP_SIGN: Record<OpCd, string> = {
  GT: '>',
  GE: '≥',
  LT: '<',
  LE: '≤',
}
const fmt = (v: number) =>
  v.toLocaleString(undefined, { maximumFractionDigits: 4 })
type RulesRes = { rules: Rule[]; total: number; page: number; pageSize: number }
export type Prefill = { metricCd: MetricCd; n: number } | null

// 오류 본문 → 문구 : monitor.errors.<code> → apiErrors.<code> → 서버 문구
export function useMonErrText() {
  const t = useTranslations('monitor.errors')
  const api = useApiErrorText()
  return useCallback(
    (b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : api(b)),
    [t, api],
  )
}

type Props = {
  linkId: string
  connId: string | null
  prefill: Prefill
  onChanged: () => void
}

export function RulesPanel({ linkId, connId, prefill, onChanged }: Props) {
  const t = useTranslations('monitor')
  const errText = useMonErrText()
  const box = useRef<HTMLDetailsElement>(null)
  const thrRef = useRef<HTMLInputElement>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [metricCd, setMetricCd] = useState<MetricCd>('DB_SESS_CNT')
  const [opCd, setOpCd] = useState<OpCd>('GT')
  const [thr, setThr] = useState('')
  const [forConn, setForConn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // ponytail: 규칙은 1쪽(50건)만 — 연결당 상한이 50이라 한 쪽에 다 들어감
  const load = useCallback(async () => {
    const r = await readApi<RulesRes>(
      piFetch(`/api/monitor/rules?link=${encodeURIComponent(linkId)}&page=1`),
    )
    if (r.ok) {
      setRules(r.data.rules)
      setMsg(null)
    } else setMsg(errText(r.body))
  }, [linkId, errText])
  useEffect(() => {
    void load()
  }, [load])

  // 카드에서 '이 지표에 규칙 추가' — 지표 채우고 펼친 뒤 임계값 칸으로
  useEffect(() => {
    if (!prefill) return
    setMetricCd(prefill.metricCd)
    setOpCd(prefill.metricCd === 'DB_CACHE_HIT_PCT' ? 'LT' : 'GT')
    setForConn(true)
    if (box.current) {
      box.current.open = true
      box.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    thrRef.current?.focus({ preventScroll: true })
  }, [prefill])

  async function send(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    setBusy(true)
    const r = await readApi(
      piFetch('/api/monitor/rules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: linkId, ...body }),
      }),
    )
    setBusy(false)
    setMsg(r.ok ? null : errText(r.body))
    if (r.ok) {
      await load()
      onChanged()
    }
    return r.ok
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(thr)
    if (thr.trim() === '' || !Number.isFinite(v)) return setMsg(t('thrInvalid'))
    if (
      await send('POST', {
        metricCd,
        opCd,
        thrVal: v,
        connId: metricCd.startsWith('DB_') && forConn && connId ? connId : null,
      })
    )
      setThr('')
  }

  const used = rules.filter((r) => r.useYn === 'Y').length
  const field =
    'bg-surface-raised h-10 min-w-0 max-w-full rounded-lg px-2 text-sm'
  return (
    <details ref={box} className="bg-surface scroll-mt-20 rounded-2xl p-4">
      <summary className="cursor-pointer font-bold">
        {t('board.aux.rules', { n: used })}
      </summary>
      <p className="text-muted-foreground my-3 text-xs break-keep">
        {t('rulesNote')}
      </p>
      <form
        onSubmit={(e) => void add(e)}
        className="mb-3 flex flex-wrap items-end gap-2"
      >
        <select
          aria-label={t('metric')}
          className={field}
          value={metricCd}
          onChange={(e) => setMetricCd(e.target.value as MetricCd)}
        >
          {METRICS.filter(isRuleEvaluated).map((m) => (
            <option key={m} value={m}>
              {t(`metrics.${m}`)}
            </option>
          ))}
        </select>
        {metricCd.startsWith('DB_') && connId && (
          <select
            aria-label={t('conn')}
            className={`${field} max-w-48`}
            value={forConn ? 'c' : ''}
            onChange={(e) => setForConn(e.target.value === 'c')}
          >
            <option value="c">{connId}</option>
            <option value="">{t('allConns')}</option>
          </select>
        )}
        <select
          aria-label={t('op')}
          className={field}
          value={opCd}
          onChange={(e) => setOpCd(e.target.value as OpCd)}
        >
          {OPS.map((o) => (
            <option key={o} value={o}>
              {OP_SIGN[o]}
            </option>
          ))}
        </select>
        <input
          ref={thrRef}
          aria-label={t('threshold')}
          className={`${field} w-28`}
          inputMode="decimal"
          value={thr}
          onChange={(e) => setThr(e.target.value)}
          placeholder={t('threshold')}
        />
        <button className={BTN_PRIMARY} disabled={busy}>
          {t('addRule')}
        </button>
      </form>
      {msg && (
        <p className="text-danger mb-2 text-sm" role="alert">
          {msg}
        </p>
      )}
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noRules')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rules.map((r) => (
            <li
              key={r.ruleId}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span
                className={`min-w-0 break-all ${r.useYn === 'N' ? 'text-muted-foreground line-through' : ''}`}
              >
                {t(`metrics.${r.metricCd}`)}
                {r.connId ? ` (${r.connId})` : ''} {OP_SIGN[r.opCd]}{' '}
                {fmt(r.thrVal)}
                {!isRuleEvaluated(r.metricCd) && (
                  <span className="text-muted-foreground ml-2 text-xs no-underline">
                    {t('notEvaluated')}
                  </span>
                )}
              </span>
              <span className="flex gap-1">
                <button
                  className={BTN}
                  disabled={busy}
                  onClick={() =>
                    void send('PATCH', {
                      ruleId: r.ruleId,
                      useYn: r.useYn === 'Y' ? 'N' : 'Y',
                    })
                  }
                >
                  {r.useYn === 'Y' ? t('disable') : t('enable')}
                </button>
                <button
                  className={BTN}
                  disabled={busy}
                  onClick={() =>
                    confirm(t('delConfirm')) &&
                    void send('PATCH', { ruleId: r.ruleId, del: true })
                  }
                >
                  {t('delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
