'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface ChkItem {
  chk_id: string
  item_key: string
  sect_cd: string
  sect_nm: string
  title: string
  prio_cd: 'BLOCKING' | 'IMPORTANT' | 'RECOMMEND'
  owner_cd: 'CODE' | 'MASTER' | 'EXTERNAL'
  status_cd: 'TODO' | 'DOING' | 'DONE' | 'NA'
  note_txt: string | null
  sort_ord: number
}
interface Summary {
  total: number
  done: number
  doing: number
  todo: number
  na: number
  blockingLeft: number
  percent: number
}

const STATUS_LABEL: Record<ChkItem['status_cd'], string> = {
  TODO: '미착수',
  DOING: '진행중',
  DONE: '완료',
  NA: '해당없음',
}
const PRIO_LABEL: Record<ChkItem['prio_cd'], string> = {
  BLOCKING: '블로킹',
  IMPORTANT: '중요',
  RECOMMEND: '권장',
}
const OWNER_LABEL: Record<ChkItem['owner_cd'], string> = {
  CODE: '코드',
  MASTER: '마스터',
  EXTERNAL: '외부',
}
const PRIO_CLS: Record<ChkItem['prio_cd'], string> = {
  BLOCKING: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  IMPORTANT:
    'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  RECOMMEND: 'bg-muted text-muted-foreground',
}
const OWNER_CLS: Record<ChkItem['owner_cd'], string> = {
  CODE: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  MASTER:
    'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  EXTERNAL: 'bg-muted text-muted-foreground',
}

export default function ChecklistPage() {
  const [items, setItems] = useState<ChkItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [applied, setApplied] = useState(true)
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState<string>('') // '' = 전체

  const load = useCallback(async () => {
    try {
      const res = await piFetch('/api/admin/checklist')
      if (!res.ok) throw new Error()
      const d = (await res.json()) as {
        items: ChkItem[]
        summary: Summary
        applied: boolean
      }
      setItems(d.items)
      setSummary(d.summary)
      setApplied(d.applied)
    } catch {
      toast.error('체크리스트를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 진척 재계산(클라이언트) — 낙관적 갱신 후 즉시 반영
  const liveSummary = useMemo<Summary | null>(() => {
    if (items.length === 0) return summary
    const done = items.filter((i) => i.status_cd === 'DONE').length
    const doing = items.filter((i) => i.status_cd === 'DOING').length
    const todo = items.filter((i) => i.status_cd === 'TODO').length
    const na = items.filter((i) => i.status_cd === 'NA').length
    const denom = items.length - na
    const blockingLeft = items.filter(
      (i) =>
        i.prio_cd === 'BLOCKING' &&
        i.status_cd !== 'DONE' &&
        i.status_cd !== 'NA',
    ).length
    return {
      total: items.length,
      done,
      doing,
      todo,
      na,
      blockingLeft,
      percent: denom > 0 ? Math.round((done / denom) * 100) : 0,
    }
  }, [items, summary])

  async function patch(
    chk_id: string,
    body: Partial<Pick<ChkItem, 'status_cd' | 'note_txt'>>,
  ) {
    // 낙관적 갱신
    setItems((prev) =>
      prev.map((i) => (i.chk_id === chk_id ? { ...i, ...body } : i)),
    )
    try {
      const res = await piFetch('/api/admin/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chk_id, ...body }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error('저장 실패 — 새로고침 후 다시 시도')
      void load() // 롤백
    }
  }

  if (loading) {
    return <p className="text-muted-foreground p-6 text-sm">불러오는 중…</p>
  }

  // 섹션 그룹 (정렬 유지)
  const filtered = fStatus
    ? items.filter((i) => i.status_cd === fStatus)
    : items
  const sections: { cd: string; nm: string; items: ChkItem[] }[] = []
  for (const it of filtered) {
    let s = sections.find((x) => x.cd === it.sect_cd)
    if (!s) {
      s = { cd: it.sect_cd, nm: it.sect_nm, items: [] }
      sections.push(s)
    }
    s.items.push(it)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">✅ Open Beta 준비 체크리스트</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          일반인 공개 전 준비 항목을 상태별로 관리합니다. (담당: 코드=개발 ·
          마스터=수동 · 외부=전문가/기관)
        </p>
      </div>

      {!applied && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          ⚠️ <code>ops_checklist</code> 테이블 미적용 — <code>sql/111</code>을
          staging→운영에 적용하세요.
        </div>
      )}

      {/* 진척 요약 */}
      {liveSummary && (
        <div className="space-y-2 rounded-xl border p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              진척률 {liveSummary.percent}%{' '}
              <span className="text-muted-foreground font-normal">
                ({liveSummary.done}/{liveSummary.total - liveSummary.na} ·
                해당없음 {liveSummary.na} 제외)
              </span>
            </span>
            {liveSummary.blockingLeft > 0 ? (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                🔴 블로킹 잔여 {liveSummary.blockingLeft}건
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
                ✓ 블로킹 0건
              </span>
            )}
          </div>
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${liveSummary.percent}%` }}
            />
          </div>
          <div className="text-muted-foreground flex gap-3 text-xs">
            <span>완료 {liveSummary.done}</span>
            <span>진행중 {liveSummary.doing}</span>
            <span>미착수 {liveSummary.todo}</span>
            <span>해당없음 {liveSummary.na}</span>
          </div>
        </div>
      )}

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { v: '', l: '전체' },
          { v: 'TODO', l: '미착수' },
          { v: 'DOING', l: '진행중' },
          { v: 'DONE', l: '완료' },
          { v: 'NA', l: '해당없음' },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFStatus(f.v)}
            className={`rounded-full border px-3 py-1 text-xs ${fStatus === f.v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* 섹션별 항목 */}
      {sections.map((sec) => (
        <div key={sec.cd} className="space-y-2">
          <p className="text-sm font-semibold">
            {sec.cd}. {sec.nm}
          </p>
          <ul className="divide-y rounded-lg border">
            {sec.items.map((it) => (
              <li key={it.chk_id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`text-sm ${it.status_cd === 'DONE' ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {it.title}
                  </span>
                  <select
                    value={it.status_cd}
                    onChange={(e) =>
                      patch(it.chk_id, {
                        status_cd: e.target.value as ChkItem['status_cd'],
                      })
                    }
                    className="border-input bg-background shrink-0 rounded-md border px-2 py-1 text-xs"
                  >
                    {(['TODO', 'DOING', 'DONE', 'NA'] as const).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIO_CLS[it.prio_cd]}`}
                  >
                    {PRIO_LABEL[it.prio_cd]}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${OWNER_CLS[it.owner_cd]}`}
                  >
                    {OWNER_LABEL[it.owner_cd]}
                  </span>
                  <input
                    type="text"
                    defaultValue={it.note_txt ?? ''}
                    placeholder="메모…"
                    onBlur={(e) => {
                      const v = e.target.value
                      if (v !== (it.note_txt ?? ''))
                        patch(it.chk_id, { note_txt: v })
                    }}
                    className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-xs"
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
