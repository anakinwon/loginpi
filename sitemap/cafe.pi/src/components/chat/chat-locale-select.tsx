'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useOpenPromoActive } from '@/components/feature-flag-provider'
import { comboMatch } from '@/lib/combo-search'

// PyTranslate™ 방 헤더 번역 언어 콤보 — 선택한 언어로 방 전체 메시지를 강제 번역
// i18n_cntry_mst 단일 소스: locale_cd 매핑된 국가만 노출 (컬러 국기 + 자국어 나라명)
// '' = 구독자 특혜 (선택 해제 상태 — URL locale 기준 수신 번역만)
// isSubscribed=false 시 disabled + 잠금 표시

interface Country {
  country_cd: string
  dis_ord_seq: number
  country_eng_nm: string
  country_mot_nm: string
  locale_cd: string | null
  use_yn: string
}

// 모듈 레벨 캐시 — 방 재입장·재마운트에도 fetch 1회
let cachedCountries: Country[] | null = null

async function fetchCountries(): Promise<Country[]> {
  if (cachedCountries) return cachedCountries
  const res = await fetch('/api/i18n/countries')
  const data = (await res.json()) as { countries: Country[] }
  cachedCountries = (data.countries ?? []).filter(
    (c) => !!c.locale_cd && c.use_yn !== 'N',
  )
  return cachedCountries
}

// flag-icons CSS 아이콘 (fi fi-{alpha2}) — 플랫폼 무관 컬러 SVG 국기
// (Windows는 국기 이모지를 글자로 렌더링하므로 CSS 플래그 사용)
function FlagIcon({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  return (
    <span
      className={`fi fi-${code.toLowerCase()} rounded-[2px] ${className}`}
    />
  )
}

export function ChatLocaleSelect({
  value,
  onChange,
  isSubscribed,
}: {
  value: string
  onChange: (locale: string) => void
  isSubscribed: boolean
}) {
  const t = useTranslations('langSwitcher')
  const tChat = useTranslations('chat')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // 오픈프로모 기간엔 누구나 자동번역 콤보 사용 가능(서버 applyPromoGate가 요금 0).
  //   프로모 종료 시 다시 구독자 전용으로 복귀(유료 전환). 단일 소스 useOpenPromoActive.
  const promoActive = useOpenPromoActive()
  const enabled = isSubscribed || promoActive
  const [countries, setCountries] = useState<Country[]>([])
  // 같은 locale_cd를 여러 국가가 공유(en: 미국·영국 등 6개국)하므로
  // 사용자가 클릭한 국가를 별도 기억해 트리거·체크 표시에 사용한다
  const [selectedCd, setSelectedCd] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 마운트 시 1회 로드 (모듈 캐시) — 저장된 value의 국기·나라명 표시에 필요
  useEffect(() => {
    fetchCountries()
      .then(setCountries)
      .catch(() => {})
  }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function select(c: Country | null) {
    setSelectedCd(c?.country_cd ?? null)
    onChange(c?.locale_cd ?? '')
    setOpen(false)
  }

  // 현재 선택 국가: 클릭한 국가 우선, 외부에서 value만 복원된 경우 첫 매칭 국가
  const selected = value
    ? (countries.find(
        (c) => c.country_cd === selectedCd && c.locale_cd === value,
      ) ?? countries.find((c) => c.locale_cd === value))
    : null

  const autoLabel = isSubscribed
    ? tChat('localeSelect.autoSubscribed')
    : promoActive
      ? tChat('localeSelect.autoPromo')
      : tChat('localeSelect.autoLocked')

  return (
    <div className="relative shrink-0" ref={containerRef}>
      {/* ── 트리거 ── */}
      <button
        onClick={() => {
          setQuery('')
          setOpen((o) => !o)
        }}
        disabled={!enabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={tChat('localeSelect.label')}
        title={
          enabled
            ? tChat('localeSelect.desc')
            : tChat('localeSelect.subscriberOrPromo')
        }
        className="bg-background focus:ring-primary/50 flex max-w-[10rem] items-center gap-1 rounded-md border px-2 py-1 text-[9px] outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected ? (
          <>
            <FlagIcon code={selected.country_cd} className="shrink-0" />
            <span className="truncate">{selected.country_mot_nm}</span>
          </>
        ) : (
          <span className="truncate">{autoLabel}</span>
        )}
        <svg
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 4.5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── 드롭다운 ── */}
      {open && enabled && (
        <div
          role="listbox"
          aria-label={tChat('localeSelect.listLabel')}
          className="border-border bg-background absolute top-full right-0 z-50 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border shadow-xl"
        >
          {/* ── 키인 검색 ── */}
          <div className="bg-background sticky top-0 z-10 border-b p-1.5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`🔍 ${t('searchPlaceholder')}`}
              aria-label={t('searchPlaceholder')}
              className="bg-muted/40 focus:border-primary w-full rounded-md border px-2 py-1 text-[10px] outline-none"
            />
          </div>

          {/* 선택 해제 — 구독특혜 PyTranslate™ */}
          <button
            role="option"
            aria-selected={!value}
            onClick={() => select(null)}
            className={[
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[9px] transition-colors',
              !value
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/60',
            ].join(' ')}
          >
            {autoLabel}
          </button>

          {countries
            .filter((c) =>
              comboMatch(
                query,
                c.country_eng_nm,
                c.country_mot_nm,
                c.country_cd,
                c.locale_cd,
              ),
            )
            .map((c) => {
              const isCurrent = selected?.country_cd === c.country_cd
              return (
                <button
                  key={c.country_cd}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => select(c)}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                    isCurrent
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted/60',
                  ].join(' ')}
                >
                  <FlagIcon code={c.country_cd} className="shrink-0" />
                  <span className="flex-1 truncate text-[9px]">
                    {c.country_mot_nm}
                  </span>
                  {isCurrent && (
                    <svg
                      className="text-primary h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 7l4 4 6-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
