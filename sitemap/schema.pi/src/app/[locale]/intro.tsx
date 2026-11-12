'use client'
// 메인 공개 영역(로그인 전, 마스터 결정 2026-10-21) — 소개·흐름(구현 완료 단계만)·역할 7종·요금제 이름과 열리는 메뉴(가격은 결제 화면에서만)
// API 호출 없음(고정 문구 + roles.ts). 로그인하면 숨김 — 로그인 버튼은 아래 LoginGate 가 그대로 담당(UA 판정·redirect 없음)
import { CodeXml } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAppUser } from './google-auth'
import { PLAN_PERMS, PLANS, ROLES } from '@/lib/roles'
import { MENU_ICON as I } from '@/lib/menu-icons'
import { Icon3D } from '@/components/icon-3d'

// 표준 → 모델 → ERD → DDL(MASTER_ROADMAP 1~4단계 중 구현된 범위, 이행·CDC·분석은 미착수라 넣지 않음)
// 이름 = messages intro.flow.<k>.nm(단계 설명 desc 는 렌더하지 않음 — 키 정리 대상)
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

export default function Intro() {
  const { user } = useAppUser()
  const t = useTranslations('intro')
  const tc = useTranslations('codes')
  // 로그인 확인 중에도 소개를 보임(Pi SDK 응답 대기 동안 빈 화면 방지) — 확인 끝나 user 가 생기면 숨김
  if (user) return null
  return (
    <div className="space-y-6">
      {/* 머리 블록(흰 패널) — 왼쪽 2줄 제목, 오른쪽 6단계 키 흐름(이 화면의 빛나는 요소) */}
      <section className="panel grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-10">
        <div>
          <p className="text-xs text-ink-3">{t('kicker')}</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink lg:text-display">
            {t('headline1')}
            <br />
            {t('headline2')}
          </h1>
        </div>
        {/* lg 이상 = 키 가운데(번호 16 + 간격 8 + 키 절반 24 = 48px)를 잇는 1px 연결선, 양끝 = 첫·끝 칸 가운데 */}
        <ol aria-label={t('flowTitle')} className="relative grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-6 lg:before:absolute lg:before:inset-x-[8.333%] lg:before:top-12 lg:before:h-px lg:before:bg-line-strong lg:before:content-['']">
          {FLOW.map(({ Icon, k }, i) => (
            <li key={k} className="flex flex-col items-center gap-2 text-center">
              <span className="font-mono text-xs text-ink-3">{String(i + 1).padStart(2, '0')}</span>
              <Icon3D icon={Icon} size="lg" />
              <span className="text-dense font-medium text-ink">{t(`flow.${k}.nm`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="role-h">
        <h2 id="role-h" className="mb-2 text-sm font-semibold text-ink">
          {t('roleTitle')}
        </h2>
        <ul className="panel divide-y divide-line">
          {ROLES.map((r) => (
            <li key={r} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="shrink-0 text-sm font-medium text-ink sm:w-40">{tc(`role.${r}`)}</span>
              <span className="text-xs text-ink-3">{tc(`roleDesc.${r}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plan-h">
        <h2 id="plan-h" className="mb-2 text-sm font-semibold text-ink">
          {t('planTitle')} <span className="text-xs font-normal text-ink-3">{t('planNote')}</span>
        </h2>
        <ul className="panel divide-y divide-line">
          {PLANS.map((p) => (
            <li key={p} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="shrink-0 text-sm font-medium text-ink sm:w-40">{tc(`plan.${p}`)}</span>
              <span className="flex flex-wrap gap-1">
                {menusOf(p).map((m) => (
                  <span key={m} className="badge">
                    {p === 'FREE' ? t('viewOnly', { menu: t(`menu.${m}`) }) : t(`menu.${m}`)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
