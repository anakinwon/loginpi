'use client'

// 기능 페이지 공통 상단 — 내 연결(schema.pi 분류체계)·접속 선택, 선택값은 URL ?link=&conn= (계약 docs/BUILD_CONTRACT.md 2.3)
//  URL 값이 목록에 없으면 첫 항목으로 맞춘다. 연결이 없으면 /connect 안내. LoginGate 안에서 쓴다(piFetch 인증)
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useLinkErrText, type LinkConn, type LinkList } from './link-api'

export type LinkSelection = { linkId: string | null; connId: string | null }

type Props = { needConn?: boolean; onChange?: (s: LinkSelection) => void }

const SELECT = 'bg-surface-raised h-10 min-w-0 max-w-full rounded-lg px-3 text-sm'

// useSearchParams 는 Suspense 경계가 필요(정적 렌더 빌드 오류 방지) — 호출 페이지가 신경 쓰지 않게 여기서 감싼다
export function LinkPicker(props: Props) {
  return (
    <Suspense fallback={null}>
      <Picker {...props} />
    </Suspense>
  )
}

function Picker({ needConn = true, onChange }: Props) {
  const t = useTranslations('link2')
  const errText = useLinkErrText()
  const sp = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const urlLink = sp.get('link')
  const urlConn = sp.get('conn')

  const [links, setLinks] = useState<LinkList['items'] | null>(null)
  const [conns, setConns] = useState<{ linkId: string; items: LinkConn[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void readApi<LinkList>(piFetch('/api/link')).then((r) => {
      if (!alive) return
      if (r.ok) setLinks(r.data.items)
      else setErr(errText(r.body))
    })
    return () => {
      alive = false
    }
  }, [errText])

  const linkId = links?.some((l) => l.linkId === urlLink) ? urlLink : (links?.[0]?.linkId ?? null)

  useEffect(() => {
    if (!needConn || !linkId) return
    let alive = true
    void readApi<{ items: LinkConn[] }>(piFetch(`/api/link/${linkId}/conns`)).then((r) => {
      if (!alive) return
      if (r.ok) {
        setErr(null)
        setConns({ linkId, items: r.data.items })
      } else {
        setErr(errText(r.body))
        setConns({ linkId, items: [] })
      }
    })
    return () => {
      alive = false
    }
  }, [needConn, linkId, errText])

  const connItems = conns?.linkId === linkId ? conns.items : null
  const connId = !needConn
    ? null
    : connItems?.some((c) => c.connId === urlConn)
      ? urlConn
      : (connItems?.[0]?.connId ?? null)
  // 접속 목록 로딩 중이면 판정 보류(URL 의 conn 을 지우지 않게)
  const settled = links !== null && (!needConn || !linkId || connItems !== null)

  // 확정된 선택을 URL 에 반영 + onChange 통지
  useEffect(() => {
    if (!settled) return
    if (linkId !== urlLink || (needConn && connId !== urlConn)) {
      const next = new URLSearchParams(sp.toString())
      if (linkId) next.set('link', linkId)
      else next.delete('link')
      if (needConn && connId) next.set('conn', connId)
      else next.delete('conn')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }
    onChange?.({ linkId, connId })
    // onChange 는 호출 측이 매 렌더 새로 만들 수 있어 의존성에서 뺀다(선택값이 바뀔 때만 통지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, linkId, connId])

  function pick(key: 'link' | 'conn', value: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(key, value)
    if (key === 'link') next.delete('conn')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  if (links === null && !err) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (links && links.length === 0)
    return (
      <p className="bg-surface rounded-2xl p-4 text-sm">
        {t('pickerEmpty')}{' '}
        <Link href="/connect" className="text-accent font-semibold underline">
          {t('pickerGo')}
        </Link>
      </p>
    )

  return (
    <div className="bg-surface flex flex-wrap items-center gap-2 rounded-2xl p-3">
      {links && (
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">{t('pickerLink')}</span>
          <select className={SELECT} value={linkId ?? ''} onChange={(e) => pick('link', e.target.value)}>
            {links.map((l) => (
              <option key={l.linkId} value={l.linkId}>
                {l.areaNm}
              </option>
            ))}
          </select>
        </label>
      )}
      {needConn && connItems && connItems.length > 0 && (
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">{t('pickerConn')}</span>
          <select className={SELECT} value={connId ?? ''} onChange={(e) => pick('conn', e.target.value)}>
            {connItems.map((c) => (
              <option key={c.connId} value={c.connId}>
                {c.connNm} · {c.dbmsCd}
              </option>
            ))}
          </select>
        </label>
      )}
      {needConn && connItems && connItems.length === 0 && !err && (
        <span className="text-muted-foreground text-xs">{t('noConns')}</span>
      )}
      <Link href="/connect" className="text-muted-foreground ml-auto text-xs underline">
        {t('title')}
      </Link>
      {err && <p className="text-danger w-full text-xs">{err}</p>}
    </div>
  )
}
