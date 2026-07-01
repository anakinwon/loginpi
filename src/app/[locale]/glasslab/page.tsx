'use client'

/**
 * Prism Glass UI 쇼케이스 (/[locale]/ui-lab)
 * -------------------------------------------------------------------------
 * 참고 이미지(newStyle_UI000001.png) 레이아웃을 재현한 데모 페이지.
 * 기존 사이트와 완전 분리된 실험용 라우트 — 마음에 들면 컴포넌트를 확산한다.
 */

import { Power } from 'lucide-react'

import {
  GlassButton,
  GlassCard,
  GlassIconButton,
  GlassPopover,
  GlassSearch,
  GlassSelect,
  GlassTabs,
  GlassToast,
  GlassToggle,
} from '@/components/glass/glass-ui'

export default function UiLabPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#eef0f4] px-6 py-16 dark:bg-[#0d0f14]">
      {/* 배경 프리즘 컬러 블롭 — 유리 질감이 살아나도록 은은한 색을 깐다 */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-20 left-[8%] size-72 rounded-full bg-[#ff9a4d]/30 blur-3xl [animation:glass-float_14s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 right-[6%] size-80 rounded-full bg-[#3dd0ff]/30 blur-3xl [animation:glass-float_18s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-0 left-1/3 size-72 rounded-full bg-[#9d6bff]/25 blur-3xl [animation:glass-float_16s_ease-in-out_infinite]" />
        <div className="absolute top-1/2 left-1/2 size-64 rounded-full bg-[#3fe0a3]/20 blur-3xl [animation:glass-float_20s_ease-in-out_infinite]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl">
        <header className="mb-10 text-center">
          <p className="text-sm font-medium tracking-[0.3em] text-slate-400 uppercase">
            Prism Glass
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-800 dark:text-white">
            UI 세트 미리보기
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            글래스모피즘 · 무지개빛 프리즘 엣지 컴포넌트
          </p>
        </header>

        <div className="flex flex-col gap-6">
          {/* 1행: Primary / Secondary / Icon 버튼 */}
          <div className="flex flex-wrap items-center gap-4">
            <GlassButton variant="primary" className="flex-1">
              Start project
            </GlassButton>
            <GlassButton variant="secondary">Secondary</GlassButton>
            <GlassIconButton>
              <Power className="size-6" />
            </GlassIconButton>
          </div>

          {/* 2행: 검색 바 + 추가 버튼 */}
          <GlassSearch />

          {/* 3행: 셀렉트+체크박스 / 토글 */}
          <div className="flex items-center gap-4">
            <GlassSelect className="flex-1" />
            <GlassToggle />
          </div>

          {/* 4행: 탭 / 토스트 */}
          <div className="grid grid-cols-2 gap-4">
            <GlassTabs tabs={['Tabs']} />
            <GlassToast title="Toast" />
          </div>

          {/* 5행: 카드 / 팝오버 */}
          <div className="grid grid-cols-2 gap-4">
            <GlassCard className="min-h-44">
              <span className="mt-auto text-right text-2xl font-semibold text-slate-700 dark:text-slate-100">
                Card
              </span>
            </GlassCard>
            <GlassPopover />
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-slate-400">
          기존 화면과 분리된 실험 라우트 · Pi 결제·인증 화면 불변
        </p>
      </div>
    </div>
  )
}
