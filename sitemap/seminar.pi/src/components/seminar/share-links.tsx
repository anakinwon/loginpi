'use client'

// S2 상세 '일정·공유' 줄(UI 설계 15.8, 계획 SA1) — [캘린더에 추가][일정 파일][메일로 초대] 3버튼 + 기본 메일 앱(mailto)·링크 복사·앱으로 공유 글자 링크.
//  전부 일반 링크(OAuth 없음, M-2). 외부는 새 탭(noopener), .ics 는 공개 라우트라 세션 불필요. 링크 = 상세 딥링크(배포 주소)
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { calendarUrl, canCopy, canShare, copyText, mailtoUrl, shareLink, webMailUrl } from '@/lib/calendar-rules'
import { hereBase, piBase, webBase } from '@/lib/site-url'
import { useStartText, type SeminarCard } from './shared'

// min-h — 글자 확대(WCAG 1.4.4)·좁은 폭(360px)에서 두세 줄로 접혀도 칸이 늘어난다(고정 h-10 이면 글자가 칸 밖으로 넘침)
const CELL =
  'bg-surface-raised grid min-h-10 place-items-center rounded-lg px-2 py-1 text-center text-sm'

export function ShareLinks({ d }: { d: SeminarCard }) {
  const t = useTranslations('seminar.share')
  const start = useStartText()
  const locale = useLocale()
  const [copied, setCopied] = useState<'ok' | 'fail' | 'shareFail' | null>(null)
  // 데스크톱 주소·Pi Browser 주소를 둘 다 알린다(메일·캘린더). 복사·공유는 지금 보는 곳 기준 1개
  const url = `${webBase()}/s/${d.id}`
  const piUrl = `${piBase()}/s/${d.id}`
  const here = `${hereBase(window.location.hostname)}/s/${d.id}`
  const subject = t('mailSubject', { title: d.title })
  const body = t('mailBody', { title: d.title, start: start(d.startAt, true), url, piUrl })
  const ext = { target: '_blank', rel: 'noopener' }

  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm">{t('title')}</h2>
      <div className="grid grid-cols-3 gap-2">
        <a className={CELL} href={calendarUrl({ id: d.id, title: d.title, startAt: d.startAt, url, piUrl })} {...ext}>
          {t('calendar')}
        </a>
        <a className={CELL} href={`/api/seminars/${d.id}/ics?hl=${locale.split('-')[0]}`} download>
          {t('ics')}
        </a>
        <a className={CELL} href={webMailUrl(subject, body)} {...ext}>
          {t('mail')}
        </a>
      </div>
      {/* 글자 링크·버튼도 터치 대상 높이 24px 이상(WCAG 2.5.8) — text-xs 그대로면 16px */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs [&>*]:inline-flex [&>*]:min-h-6 [&>*]:items-center">
        <a className="text-muted-foreground hover:underline" href={mailtoUrl(subject, body)}>
          {t('mailApp')}
        </a>
        {/* 링크 복사 — 기능 탐지(클립보드 있을 때만), 하단 바·버튼 칸 추가 없음(글자 링크 줄) */}
        {canCopy() && (
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => void copyText(here).then((ok) => setCopied(ok ? 'ok' : 'fail'))}
          >
            {t('copy')}
          </button>
        )}
        {/* 기기 공유 시트 — 기능 탐지(Web Share 있을 때만). 닫기(cancel)는 안내 없음, 실패는 링크 복사로 안내 */}
        {canShare() && (
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() =>
              void shareLink({ title: d.title, text: subject, url: here }).then((r) =>
                setCopied(r === 'fail' ? 'shareFail' : null),
              )
            }
          >
            {t('share')}
          </button>
        )}
        <span role="status" aria-live="polite" className="text-muted-foreground">
          {copied && t(copied === 'ok' ? 'copied' : copied === 'fail' ? 'copyFail' : 'shareFail')}
        </span>
      </div>
    </section>
  )
}
