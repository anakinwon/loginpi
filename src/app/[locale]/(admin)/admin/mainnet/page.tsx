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
  desc_txt: string | null
  ref_txt: string | null
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
  EXTERNAL: 'Pi 확인',
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
  EXTERNAL: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
}
// 정본 문서의 섹션 코드 → 화면 표기
const SECT_ORDER = ['ACTION', 'CONFIRM', 'PROC']

export default function MainnetChecklistPage() {
  const [items, setItems] = useState<ChkItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [applied, setApplied] = useState(true)
  const [loading, setLoading] = useState(true)
  const [fStatus, setFStatus] = useState<string>('') // '' = 전체

  const load = useCallback(async () => {
    try {
      const res = await piFetch('/api/admin/mainnet/checklist')
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
      const res = await piFetch('/api/admin/mainnet/checklist', {
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

  // 섹션 그룹 (정본 문서 순서 유지)
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
  sections.sort((a, b) => SECT_ORDER.indexOf(a.cd) - SECT_ORDER.indexOf(b.cd))

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">🚀 메인넷 출시 체크리스트</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pi 공식문서 기반 출시 준비 항목을 상태별로 관리합니다. 정본:{' '}
          <code>docs/MAINNET_READINESS_CHECKLIST.md</code> (담당: 코드=개발 ·
          마스터=수동 · Pi 확인=등재팀 질의)
        </p>
      </div>

      {/* ⚠️ 핵심 개념 — 관리자 필독: 테스트넷 ≠ 메인넷 자동 승계 */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm dark:border-amber-600 dark:bg-amber-950/30">
        <p className="font-bold text-amber-900 dark:text-amber-200">
          ⚠️ 핵심 개념 — 테스트넷은 메인넷으로 자동 승계되지 않습니다
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-300">
          <li>
            테스트넷 = <b>연습·테스트 전용</b>(가짜 Pi). 메인넷을 위한 검증이
            아닙니다.
          </li>
          <li>
            테스트넷의 도메인·앱 검증은 <b>메인넷에 넘어가지 않습니다</b>(별개
            프로젝트).
          </li>
          <li>
            메인넷은 <b>별도로 세팅된 서버 환경</b>(새 프로젝트·새 도메인·새 API
            Key·메인넷 지갑)이 준비된 뒤에야 검증·오픈이 결정됩니다.
          </li>
          <li>
            순서: 테스트넷 연습 → <b>메인넷 환경 신규 구축</b> → 메인넷 검증 →
            등재 심사 → 오픈
          </li>
        </ul>
      </div>

      {!applied && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          ⚠️ <code>mainnet_checklist</code> 테이블 미적용 — <code>sql/129</code>
          를 staging→운영에 적용하세요. (적용 전까지 빈 목록으로 표시)
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
          <p className="text-sm font-semibold">{sec.nm}</p>
          <ul className="divide-y rounded-lg border">
            {sec.items.map((it) => (
              <li key={it.chk_id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className={`text-sm ${it.status_cd === 'DONE' ? 'text-muted-foreground line-through' : ''}`}
                    >
                      <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                        {it.item_key}
                      </span>
                      {it.title}
                    </span>
                    {it.desc_txt && (
                      <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                        {it.desc_txt}
                      </p>
                    )}
                  </div>
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
                  {it.ref_txt && (
                    <span className="text-muted-foreground rounded border px-1.5 py-0.5 text-[11px]">
                      📄 {it.ref_txt}
                    </span>
                  )}
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

      {/* 공식 문의 채널 */}
      <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs leading-relaxed">
        <p className="text-foreground mb-1 font-medium">
          Pi 직접 확인 채널 (공식)
        </p>
        <p>
          · 상표 라이선스: <b>Dev Portal in Pi Browser</b> ·{' '}
          <a
            className="text-primary hover:underline"
            href="https://minepi.com/pi-trademark-guidelines/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Trademark Guidelines
          </a>
        </p>
        <p>· 질의: Pi Ecosystem Discord · Pi App 내 Developer chat room</p>
        <p>
          ·{' '}
          <a
            className="text-primary hover:underline"
            href="https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/mainnetListingRequirements/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mainnet Listing Requirements
          </a>{' '}
          ·{' '}
          <a
            className="text-primary hover:underline"
            href="https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/gettingStartedChecklist/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Getting Started Checklist
          </a>
        </p>
      </div>
    </div>
  )
}
