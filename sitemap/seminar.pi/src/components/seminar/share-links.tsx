'use client'

// S2 상세 '일정·공유' 줄(UI 설계 15.8, 계획 SA1) — [캘린더에 추가][일정 파일][메일로 초대] 3버튼 + 기본 메일 앱(mailto) 글자 링크.
//  전부 일반 링크(OAuth 없음, M-2). 외부는 새 탭(noopener), .ics 는 공개 라우트라 세션 불필요. 링크 = 상세 딥링크(배포 주소)
import { useTranslations } from 'next-intl'
import { calendarUrl, mailtoUrl, webMailUrl } from '@/lib/calendar-rules'
import { useStartText, type SeminarCard } from './shared'

const CELL =
  'bg-surface-raised grid h-10 place-items-center rounded-lg px-2 text-center text-sm'

export function ShareLinks({ d }: { d: SeminarCard }) {
  const t = useTranslations('seminar.share')
  const start = useStartText()
  const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')
  const url = `${base}/s/${d.id}`
  const subject = t('mailSubject', { title: d.title })
  const body = t('mailBody', { title: d.title, start: start(d.startAt), url })
  const ext = { target: '_blank', rel: 'noopener' }

  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm">{t('title')}</h2>
      <div className="grid grid-cols-3 gap-2">
        <a className={CELL} href={calendarUrl({ id: d.id, title: d.title, startAt: d.startAt, url })} {...ext}>
          {t('calendar')}
        </a>
        <a className={CELL} href={`/api/seminars/${d.id}/ics`} download>
          {t('ics')}
        </a>
        <a className={CELL} href={webMailUrl(subject, body)} {...ext}>
          {t('mail')}
        </a>
      </div>
      <a className="text-muted-foreground text-xs hover:underline" href={mailtoUrl(subject, body)}>
        {t('mailApp')}
      </a>
    </section>
  )
}
