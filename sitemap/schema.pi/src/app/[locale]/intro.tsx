'use client'
// 메인 공개 영역(로그인 전, 마스터 결정 2026-10-21) — 소개·흐름(구현 완료 단계만)·역할 7종·요금제 이름과 열리는 메뉴(가격은 결제 화면에서만)
// API 호출 없음(고정 문구 + roles.ts). 로그인하면 숨김 — 로그인 버튼은 아래 LoginGate 가 그대로 담당(UA 판정·redirect 없음)
import { ArrowRight, CodeXml, DatabaseZap } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAppUser } from './google-auth'
import { PLAN_PERMS, PLANS, ROLES } from '@/lib/roles'
import { MENU_ICON as I } from '@/lib/menu-icons'

// 표준 → 모델 → ERD → DDL(MASTER_ROADMAP 1~4단계 중 구현된 범위, 이행·CDC·분석은 미착수라 넣지 않음)
// 이름·설명 = messages intro.flow.<k>.{nm,desc}
const FLOW = [
  { Icon: I.words, k: 'words' },
  { Icon: I.domains, k: 'domains' },
  { Icon: I.terms, k: 'terms' },
  { Icon: I.logical, k: 'model' },
  { Icon: I.erd, k: 'erd' },
  { Icon: CodeXml, k: 'ddl' },
] as const
// 요금제별로 열리는 메뉴(roles.ts PLAN_PERMS 의 메뉴 권한 → 화면 이름 = messages intro.menu.<권한>)
const MENU_KEYS = ['MENU_STD', 'MENU_SQL', 'MENU_SET', 'MENU_BAN', 'MENU_MODEL', 'MENU_CHK', 'MENU_ADM'] as const
const menusOf = (p: (typeof PLANS)[number]) => MENU_KEYS.filter((k) => (PLAN_PERMS[p] as readonly string[]).includes(k))
const card = 'rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] p-4'

export default function Intro() {
  const { user, isLoading } = useAppUser()
  const t = useTranslations('intro')
  const tc = useTranslations('codes')
  if (user || isLoading) return null
  return (
    <div className="mt-4 space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-[#1f3a68] to-[#3b4a66] px-5 py-8 text-white sm:px-8">
        <p className="text-sm text-white/70">{t('kicker')}</p>
        <h2 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
          {t('headline1')}
          <br />
          {t('headline2')}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-white/80">{t('lead')}</p>
      </section>

      <section aria-labelledby="flow-h">
        <h3 id="flow-h" className="mb-2 font-bold text-[#2c3850]">
          {t('flowTitle')}
        </h3>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {FLOW.map(({ Icon, k }, i) => (
            <li key={k} className={`${card} relative flex flex-col items-start gap-1`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#3b4a66] text-white">
                <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-xs text-[#5b6578]">{t('step', { n: i + 1 })}</span>
              <span className="font-semibold text-[#2c3850]">{t(`flow.${k}.nm`)}</span>
              <span className="text-xs text-[#5b6578]">{t(`flow.${k}.desc`)}</span>
              {i < FLOW.length - 1 && <ArrowRight className="absolute end-2 top-3 hidden h-4 w-4 text-[#9aa6bd] lg:block rtl:rotate-180" aria-hidden />}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="role-h">
        <h3 id="role-h" className="mb-2 font-bold text-[#2c3850]">
          {t('roleTitle')}
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <li key={r} className={card}>
              <div className="font-semibold text-[#2c3850]">{tc(`role.${r}`)}</div>
              <p className="mt-1 text-xs text-[#5b6578]">{tc(`roleDesc.${r}`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plan-h">
        <h3 id="plan-h" className="mb-2 font-bold text-[#2c3850]">
          {t('planTitle')} <span className="text-xs font-normal text-[#5b6578]">{t('planNote')}</span>
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => (
            <li key={p} className={card}>
              <div className="font-semibold text-[#2c3850]">{tc(`plan.${p}`)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {menusOf(p).map((m) => (
                  <span key={m} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#4a5a78] ring-1 ring-[#c9d1df]">
                    {p === 'FREE' ? t('viewOnly', { menu: t(`menu.${m}`) }) : t(`menu.${m}`)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-center gap-2 text-sm text-[#4a5a78]">
        <DatabaseZap className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {t('footer')}
      </p>
    </div>
  )
}
