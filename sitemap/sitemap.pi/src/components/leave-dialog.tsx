'use client'

// "외부 사이트로 이동" 안내 레이어 — 아이보리 바탕 + 3D 입체 카드(마스터 지시 2026-10-13). 본문은 사이트 설명(없으면 기존 안내 문구).
//  외부 이동은 사용자 클릭 + 안내 후에만(MAINNET A-6) — 확인 버튼이 유일한 이동 경로. floating 이면 화면 하단 고정(메인 버블), 아니면 인라인(상세)
import { useTranslations } from 'next-intl'

export function LeaveDialog({
  url,
  name,
  desc,
  floating = false,
  onConfirm,
  onCancel,
}: {
  url: string
  name?: string | null
  desc?: string | null // undefined = 조회 중, null·'' = 설명 없음(안내 문구 폴백)
  floating?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useTranslations('detail')
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('leaveTitle')}
      className={`leave-card flex flex-col gap-3 ${
        floating
          ? 'fixed bottom-16 left-1/2 z-20 w-[min(92vw,26rem)] -translate-x-1/2'
          : 'w-full'
      }`}
    >
      <p className="leave-title">{t('leaveTitle')}</p>
      {name && <p className="text-base font-bold">{name}</p>}
      {/* 설명 최대 500자 — 작은 화면에서 카드가 화면 밖으로 밀리지 않게 높이 상한 + 내부 스크롤 */}
      <p className="max-h-[40vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-neutral-700">
        {desc === undefined ? '…' : desc || t('leaveBody')}
      </p>
      <p className="leave-url font-mono text-xs break-all">{url}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-3d btn-3d-primary"
          onClick={onConfirm}
        >
          {t('leaveConfirm')}
        </button>
        <button type="button" className="btn-3d" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
