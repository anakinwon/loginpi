'use client'

// PC 도구 통계 표 — 종류 탭 + 이름 검색(300ms 디바운스) + 칼럼 정렬 + 페이지 단위 서버 조회(view=rows, 목록 표준 ①)
//  조건(탭·검색·정렬·페이지)이나 새 측정(at)이 바뀔 때 1페이지씩 받고, 실패하면 다음 polling·새로고침(tick) 때 재조회. 대시보드가 LazySection 안에서 마운트(뷰포트 진입 직전)
import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Pagination } from '@/components/pagination'
import { useApiErrorText } from '@/lib/client-api'
import { useSection } from './use-section'
import {
  KIND_COLOR,
  NUM_SORT,
  PAGE_SIZE,
  Q_MAX,
  TOOL_KINDS,
  type RowsResp,
  type SnapKey,
  type SortKey,
  type ToolTab,
} from './types'

const DEBOUNCE_MS = 300

export function ToolsTable({ snap, tick }: { snap: SnapKey; tick: number }) {
  const t = useTranslations('tools')
  const f = useFormatter()
  const errText = useApiErrorText()
  const [tab, setTab] = useState<ToolTab>('all')
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'calls', desc: true })
  const [page, setPage] = useState(1)

  // 검색어 디바운스(R-P2 입력마다 조회 금지) — 실제로 바뀐 경우만 1페이지로
  useEffect(() => {
    const next = input.trim()
    if (next === q) return
    const id = setTimeout(() => {
      setQ(next)
      setPage(1)
    }, DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [input, q])

  const params = new URLSearchParams({
    view: 'rows',
    pc: snap.pc,
    at: snap.at,
    ih: snap.ih ?? '',
    uh: snap.uh ?? '',
    type: tab,
    q,
    sort: sort.key,
    desc: sort.desc ? '1' : '0',
    page: String(page),
    size: String(PAGE_SIZE),
  })
  // 조건·측정 시각이 바뀌면 조회, 실패 상태면 다음 tick(polling·새로고침)에 재조회 — 오류는 이전 표 위에 항상 표시
  const { data, err, busy } = useSection<RowsResp>(`/api/admin/tools?${params}`, snap.at, tick)

  const onSort = (key: SortKey) => {
    setSort((s) => ({ key, desc: s.key === key ? !s.desc : NUM_SORT.includes(key) }))
    setPage(1)
  }
  const n = (v: number | null) => (v == null ? '–' : f.number(v))
  // 정렬 머리글 — 컴포넌트가 아닌 렌더 함수(재렌더 때 버튼이 다시 마운트돼 포커스를 잃지 않게)
  const th = (k: SortKey, label: string, right = false) => (
    <th
      className={right ? 'text-right' : undefined}
      aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : undefined}
    >
      <button type="button" className="tool-sort" onClick={() => onSort(k)}>
        {label}
        <span aria-hidden className={sort.key === k ? 'opacity-100' : 'opacity-0'}>
          {sort.desc ? '↓' : '↑'}
        </span>
      </button>
    </th>
  )
  const rows = data?.items ?? []

  return (
    <section className="tool-panel flex flex-col gap-3" aria-busy={busy}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="tablist" className="tool-tabs">
          {(['all', ...TOOL_KINDS] as ToolTab[]).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              className="tool-tab"
              onClick={() => {
                setTab(k)
                setPage(1)
              }}
            >
              {k !== 'all' && <span className="tool-dot" style={{ background: KIND_COLOR[k] }} />}
              {k === 'all' ? t('tabAll') : t(`kind.${k}`)}
              {data && <span className="tool-tab-n">{f.number(data.counts[k])}</span>}
            </button>
          ))}
        </div>
        <input
          className="input md:max-w-64"
          type="search"
          value={input}
          maxLength={Q_MAX}
          placeholder={t('search')}
          aria-label={t('search')}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      {err && (
        <p className="text-destructive text-sm" role="alert">
          {t('fetchFailed')} · {errText(err)}
        </p>
      )}

      <div className={`admin-table-wrap ${busy ? 'opacity-60' : ''}`}>
        <table className="admin-table">
          <thead>
            <tr>
              {th('name', t('colName'))}
              {th('type', t('colType'))}
              {th('src', t('colSrc'))}
              <th>{t('colVer')}</th>
              <th>{t('colOn')}</th>
              {th('turns', t('colTurns'), true)}
              {th('calls', t('colCalls'), true)}
              {th('errors', t('colErrors'), true)}
              {th('avg_ms', t('colAvgMs'), true)}
            </tr>
          </thead>
          <tbody>
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted-foreground py-6 text-center">
                  {data.missing ? t('detailMissing') : t('emptyRows')}
                </td>
              </tr>
            )}
            {!data && !err && (
              <tr>
                <td colSpan={9} className="text-muted-foreground py-6 text-center">
                  {t('loading')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="max-w-72">
                  <div className="truncate font-medium" title={r.name}>
                    {r.name}
                  </div>
                  {r.detail && <div className="text-muted-foreground truncate text-xs">{r.detail}</div>}
                </td>
                <td className="whitespace-nowrap">
                  <span className="tool-dot" style={{ background: KIND_COLOR[r.type] }} />
                  {t(`kind.${r.type}`)}
                </td>
                <td className="whitespace-nowrap">{t.has(`src.${r.src}`) ? t(`src.${r.src}`) : r.src}</td>
                <td className="text-muted-foreground whitespace-nowrap">{r.ver ?? '–'}</td>
                <td className="whitespace-nowrap">
                  {r.on == null ? (
                    '–'
                  ) : (
                    <span className={r.on ? 'tool-badge-on' : 'tool-badge-off'}>{r.on ? t('on') : t('off')}</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{n(r.turns)}</td>
                <td className="text-right tabular-nums">{n(r.calls)}</td>
                <td className={`text-right tabular-nums ${r.errors ? 'text-destructive' : ''}`}>{n(r.errors)}</td>
                <td className="text-right tabular-nums">{n(r.avg_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">{t('hookUsageNote')}</p>
      {data && <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onChange={setPage} />}
    </section>
  )
}
