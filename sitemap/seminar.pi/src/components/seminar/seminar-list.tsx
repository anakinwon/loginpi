'use client'

// S1 세미나 목록 — 탭(전체·내가 연 것·내가 참가한 것) + 서버 페이지네이션(12건, 데이터 패칭 표준 ①).
// 조회는 탭·쪽 변경 이벤트에서 비동기(②, 렌더 차단 없음). 내 탭은 로그인 필요 — 서버 redirect 없이 클라이언트 LoginGate
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { useAppUser } from '@/components/google-auth'
import { LoginGate } from '@/components/login-gate'
import { Link } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { formatFee, pageCount, TABS, type Tab } from '@/lib/seminar-rules'
import { Pagination } from './pagination'
import {
  BTN,
  useSeminarErrText,
  useStartText,
  type SeminarCard,
} from './shared'

type ListRes = { rows: SeminarCard[]; total: number; page: number }

export function SeminarList() {
  const t = useTranslations('list')
  const [tab, setTab] = useState<Tab>('all')
  // 개설 버튼 노출 힌트(실제 권한은 POST /api/seminars 가 서버에서 판정, PRD D-1)
  const { user } = useAppUser()
  const canHost = user?.role === 'ADMIN' || user?.role === 'MASTER'
  // 탭 키보드(U3, WAI-ARIA 탭 패턴) — 좌우 화살표·Home·End 로 이동하며 바로 선택(선택 탭만 tabindex 0)
  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.indexOf(tab)
    const n = TABS.length
    const next =
      e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next])
    document.getElementById(`smn-tab-${TABS[next]}`)?.focus()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label={t('tabsLabel')}
          onKeyDown={onTabKey}
          className="flex gap-2 overflow-x-auto"
        >
          {TABS.map((k) => (
            <button
              key={k}
              id={`smn-tab-${k}`}
              type="button"
              role="tab"
              aria-selected={tab === k}
              aria-controls="smn-tabpanel"
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              className={`h-10 shrink-0 rounded-full px-4 text-sm ${tab === k ? 'bg-accent font-semibold text-white' : 'bg-surface'}`}
            >
              {t(`tabs.${k}`)}
            </button>
          ))}
        </div>
        {/* 탭 목록 밖 — tablist 안에는 tab 만 둔다 */}
        {canHost && (
          <Link href="/host/new" className={`${BTN} ml-auto shrink-0`}>
            {t('hostNew')}
          </Link>
        )}
      </div>
      <div id="smn-tabpanel" role="tabpanel" aria-labelledby={`smn-tab-${tab}`} tabIndex={0}>
        {/* key = 탭 — 탭 전환 시 쪽·결과 초기화 */}
        {tab === 'all' ? (
          <TabList key={tab} tab={tab} />
        ) : (
          <LoginGate>{() => <TabList key={tab} tab={tab} />}</LoginGate>
        )}
      </div>
    </div>
  )
}

function TabList({ tab }: { tab: Tab }) {
  const t = useTranslations('list')
  const errText = useSeminarErrText()
  const [page, setPage] = useState(1)
  const [res, setRes] = useState<ListRes | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let live = true
    void readApi<ListRes>(piFetch(`/api/seminars?tab=${tab}&page=${page}`)).then((r) => {
      if (!live) return
      if (r.ok) {
        setRes(r.data)
        setErr(null)
      } else setErr(errText(r.body))
    })
    return () => {
      live = false
    }
  }, [tab, page, retry, errText])

  if (err)
    return (
      <div role="alert" className="bg-surface space-y-3 rounded-xl p-4 text-sm">
        <p>{err}</p>
        <button type="button" className={BTN} onClick={() => setRetry((n) => n + 1)}>
          {t('retry')}
        </button>
      </div>
    )
  if (!res) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (res.rows.length === 0)
    return <p className="bg-surface text-muted-foreground rounded-xl p-6 text-center text-sm">{t(`empty.${tab}`)}</p>

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {res.rows.map((s) => (
          <li key={s.id}>
            <Card s={s} />
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={pageCount(res.total)} onPage={setPage} />
    </div>
  )
}

function Card({ s }: { s: SeminarCard }) {
  const t = useTranslations('list')
  const start = useStartText()
  const fee = formatFee(s.fee)
  return (
    <Link
      href={`/s/${s.id}`}
      className="bg-surface hover:bg-surface-raised block space-y-2 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 font-semibold break-words">{s.title}</h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${fee ? 'bg-accent text-white' : 'bg-speaking text-black'}`}
        >
          {fee ? t('fee', { amount: fee }) : t('free')}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">{start(s.startAt)}</p>
      <p className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
        {s.host && <span>{t('host', { name: s.host })}</span>}
        <span>{t('capacity', { n: s.maxCnt })}</span>
        <span>{t(`status.${s.status}`)}</span>
      </p>
    </Link>
  )
}
