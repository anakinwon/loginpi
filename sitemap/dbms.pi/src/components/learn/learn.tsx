'use client'

// DBA 학습 화면(PRD 12 §10) — 로그인 게이트 → 탭 3개 : 실습 문제(10-1, 진도 GET·POST /api/learn/progress) / 튜닝 사례집(10-2, 정적) / DBMS 비교 사전(10-3, 정적 + 연결 선택 시 GET /api/learn/type-map)
//  연결 없이 동작한다. 선택한 탭만 렌더(그 탭의 조회도 그때만 — 섹션 지연 조회)
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from '@/components/login-gate'
import { LinkPicker } from '@/components/link/link-picker'
import { useLinkErrText } from '@/components/link/link-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'
import { readApi, useApiErrorText } from '@/lib/client-api'
import { QUESTIONS, TOPICS, summarize, type ProgressRow, type Topic } from '@/lib/learn/questions'
import { CASES } from '@/lib/learn/cases'
import { DICT, DICT_CATS, filterDict, type DictCat } from '@/lib/learn/dict'

const CARD = 'bg-surface rounded-2xl p-4 sm:p-5'
const PRE = 'bg-surface-raised overflow-x-auto rounded-lg p-3 text-xs whitespace-pre-wrap break-all'
const TABS = ['quiz', 'cases', 'dict'] as const
type Tab = (typeof TABS)[number]

export function Learn() {
  return <LoginGate>{() => <Body />}</LoginGate>
}

function Body() {
  const t = useTranslations('learn')
  const [tab, setTab] = useState<Tab>('quiz')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? BTN_PRIMARY : BTN}
            onClick={() => setTab(k)}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'quiz' && <Quiz />}
      {tab === 'cases' && <Cases />}
      {tab === 'dict' && <Dict />}
    </div>
  )
}

type Answer = { choice: number; correct: boolean }

function Quiz() {
  const t = useTranslations('learn')
  const errText = useApiErrorText()
  const [topic, setTopic] = useState<Topic>('INDEX')
  const [rows, setRows] = useState<ProgressRow[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void readApi<{ items: ProgressRow[] }>(piFetch('/api/learn/progress')).then((r) => {
      if (!alive) return
      if (r.ok) setRows(r.data.items)
      else {
        setRows([]) // 진도 저장소가 없어도 문제는 풀 수 있게
        setErr(errText(r.body))
      }
    })
    return () => {
      alive = false
    }
  }, [errText])

  async function answer(qstId: string, choice: number) {
    setBusy(qstId)
    setErr(null)
    const r = await readApi<{ correct: boolean }>(
      piFetch('/api/learn/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qstId, choice }),
      }),
    )
    setBusy(null)
    if (!r.ok) return setErr(errText(r.body))
    const crctYn = r.data.correct ? 'Y' : 'N'
    setAnswers((a) => ({ ...a, [qstId]: { choice, correct: r.data.correct } }))
    setRows((prev) => [...(prev ?? []).filter((p) => p.qstId !== qstId), { qstId, crctYn }])
  }

  const sum = rows ? summarize(rows) : null
  const done = new Map((rows ?? []).map((r) => [r.qstId, r.crctYn]))

  return (
    <div className="flex flex-col gap-3">
      <section className={CARD}>
        <h2 className="mb-2 font-semibold">{t('quiz.score')}</h2>
        {sum ? (
          <>
            <p className="text-sm">{t('quiz.scoreLine', { solved: sum.solved, total: sum.total, correct: sum.correct })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sum.byTopic.map((b) => (
                <button
                  key={b.topic}
                  className={`${topic === b.topic ? 'bg-accent text-white' : 'bg-surface-raised'} rounded-lg px-3 py-2 text-left text-xs`}
                  onClick={() => setTopic(b.topic)}
                >
                  <span className="block font-semibold">{t(`topics.${b.topic}`)}</span>
                  {b.correct}/{b.total}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        )}
        {err && <p className="text-danger mt-2 text-xs">{err}</p>}
      </section>
      {/* 주제 단위로 끊어 보여준다(주제당 3~4문제 — 목록 페이지 역할) */}
      {QUESTIONS.filter((q) => q.topic === topic).map((q) => {
        const a = answers[q.id]
        const prev = done.get(q.id)
        return (
          <section key={q.id} className={CARD}>
            <p className="text-muted-foreground mb-1 text-xs">
              {q.id.toUpperCase()} · {t(`levels.${q.level}`)}
              {prev && !a && ` · ${prev === 'Y' ? t('quiz.prevRight') : t('quiz.prevWrong')}`}
            </p>
            <p className="text-sm font-semibold break-keep">{q.q}</p>
            {q.sql && <pre className={`${PRE} mt-2`}>{q.sql}</pre>}
            {q.plan !== undefined && <pre className={`${PRE} mt-2`}>{JSON.stringify(q.plan, null, 2)}</pre>}
            <div className="mt-3 flex flex-col gap-2">
              {q.choices.map((c, i) => {
                const mark = a ? (i === q.answer ? 'border-accent' : i === a.choice ? 'border-danger' : 'border-transparent') : 'border-transparent'
                return (
                  <button
                    key={i}
                    disabled={!!a || busy === q.id}
                    className={`bg-surface-raised rounded-lg border-2 px-3 py-2 text-left text-sm break-keep disabled:cursor-default ${mark}`}
                    onClick={() => void answer(q.id, i)}
                  >
                    {i + 1}. {c}
                  </button>
                )
              })}
            </div>
            {a && (
              <div className="mt-3 text-sm">
                <p className={a.correct ? 'text-accent font-semibold' : 'text-danger font-semibold'}>
                  {a.correct ? t('quiz.right') : t('quiz.wrong')}
                </p>
                <p className="text-muted-foreground mt-1 break-keep">{q.expl}</p>
                <button
                  className="text-accent mt-2 text-xs underline"
                  onClick={() => setAnswers(({ [q.id]: _, ...rest }) => rest)}
                >
                  {t('quiz.retry')}
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Cases() {
  const t = useTranslations('learn.cases')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">{t('notice')}</p>
      {CASES.map((c) => (
        <details key={c.id} className={CARD}>
          <summary className="cursor-pointer font-semibold break-keep">{c.title}</summary>
          <dl className="mt-3 grid gap-2 text-sm">
            <dt className="text-muted-foreground text-xs">{t('problem')}</dt>
            <dd><pre className={PRE}>{c.problemSql}</pre></dd>
            <dt className="text-muted-foreground text-xs">{t('plan')}</dt>
            <dd><pre className={PRE}>{c.plan}</pre></dd>
            <dt className="text-muted-foreground text-xs">{t('cause')}</dt>
            <dd className="break-keep">{c.cause}</dd>
            <dt className="text-muted-foreground text-xs">{t('fix')}</dt>
            <dd><pre className={PRE}>{c.fixSql}</pre></dd>
            <dt className="text-muted-foreground text-xs">{t('effect')}</dt>
            <dd className="break-keep">{c.effect}</dd>
          </dl>
        </details>
      ))}
    </div>
  )
}

type TypeMap = { dbms: { dbmsCd: string; dbmsNm: string }[]; typeMap: { dbmsCd: string; lgcTpCd: string; phyTpNm: string }[] }

function Dict() {
  const t = useTranslations('learn.dict')
  const tc = useTranslations('learn.cats')
  const errText = useLinkErrText()
  const [cat, setCat] = useState<DictCat | 'ALL'>('ALL')
  const [term, setTerm] = useState('')
  const [linkId, setLinkId] = useState<string | null>(null)
  const [live, setLive] = useState<{ linkId: string; data: TypeMap } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const rows = filterDict(DICT, cat, term)

  async function loadLive() {
    if (!linkId) return
    setBusy(true)
    setErr(null)
    const r = await readApi<TypeMap>(piFetch(`/api/learn/type-map?link=${encodeURIComponent(linkId)}`))
    setBusy(false)
    if (r.ok) setLive({ linkId, data: r.data })
    else setErr(errText(r.body))
  }

  // 논리타입 → DBMS별 물리타입 피벗
  const liveData = live?.linkId === linkId ? live.data : null
  const lgcTypes = liveData ? [...new Set(liveData.typeMap.map((m) => m.lgcTpCd))].sort() : []
  const phyOf = (dbmsCd: string, lgc: string) =>
    liveData?.typeMap.filter((m) => m.dbmsCd === dbmsCd && m.lgcTpCd === lgc).map((m) => m.phyTpNm).join(', ') || '—'

  return (
    <div className="flex flex-col gap-3">
      <section className={CARD}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className="bg-surface-raised h-10 rounded-lg px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value as DictCat | 'ALL')}>
            <option value="ALL">{tc('ALL')}</option>
            {DICT_CATS.map((c) => (
              <option key={c} value={c}>{tc(c)}</option>
            ))}
          </select>
          <input
            className="bg-surface-raised h-10 min-w-0 flex-1 rounded-lg px-3 text-sm"
            placeholder={t('search')}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-2">{t('item')}</th>
                <th className="p-2">Oracle</th>
                <th className="p-2">Tibero</th>
                <th className="p-2">PostgreSQL</th>
                <th className="p-2">{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.cat}-${r.item}`} className="border-border border-t align-top">
                  <td className="p-2 font-semibold">{r.item}</td>
                  <td className="p-2 font-mono">{r.oracle}</td>
                  <td className="p-2 font-mono">{r.tibero}</td>
                  <td className="p-2 font-mono">{r.pg}</td>
                  <td className="text-muted-foreground p-2">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-muted-foreground p-2 text-sm">{t('empty')}</p>}
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-1 font-semibold">{t('liveTitle')}</h2>
        <p className="text-muted-foreground mb-3 text-xs break-keep">{t('liveIntro')}</p>
        <LinkPicker needConn={false} onChange={(s) => setLinkId(s.linkId)} />
        <button className={`${BTN} mt-3`} disabled={!linkId || busy} onClick={() => void loadLive()}>
          {busy ? t('loading') : t('liveLoad')}
        </button>
        {err && <p className="text-danger mt-2 text-xs">{err}</p>}
        {liveData && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-2">{t('lgcType')}</th>
                  {liveData.dbms.map((d) => (
                    <th key={d.dbmsCd} className="p-2">{d.dbmsNm}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lgcTypes.map((lgc) => (
                  <tr key={lgc} className="border-border border-t">
                    <td className="p-2 font-semibold">{lgc}</td>
                    {liveData.dbms.map((d) => (
                      <td key={d.dbmsCd} className="p-2 font-mono">{phyOf(d.dbmsCd, lgc)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {lgcTypes.length === 0 && <p className="text-muted-foreground p-2 text-sm">{t('empty')}</p>}
          </div>
        )}
      </section>
    </div>
  )
}
