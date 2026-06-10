'use client'
import { getLocaleOptions } from '@/lib/locale-options'

// PiTranslate™ 방 헤더 언어 콤보 — 선택한 언어로 방 전체 메시지를 강제 번역
// '' = 구독자 특혜 (선택 해제 상태 — URL locale 기준 수신 번역만)
// isSubscribed=false 시 disabled + 잠금 표시
const LOCALE_OPTIONS = getLocaleOptions('ko')

export function ChatLocaleSelect({ value, onChange, isSubscribed }: {
  value: string
  onChange: (locale: string) => void
  isSubscribed: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={!isSubscribed}
      aria-label='번역 언어 선택'
      title={
        isSubscribed
          ? '이 방의 메시지를 선택한 언어로 번역해서 보여줍니다'
          : '구독 서비스를 신청한 회원만 사용할 수 있습니다'
      }
      className='max-w-[10rem] shrink-0 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50'
    >
      <option value=''>{isSubscribed ? '🌐 구독특혜 자동번역' : '🔒 구독특혜 자동번역'}</option>
      {isSubscribed && LOCALE_OPTIONS.map(({ value: cd, label }) => (
        <option key={cd} value={cd}>{label}</option>
      ))}
    </select>
  )
}
