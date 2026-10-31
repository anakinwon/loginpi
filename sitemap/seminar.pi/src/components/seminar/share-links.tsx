'use client'

// S2 상세 '일정·공유' 줄(UI 설계 15.8, 계획 SA1) — [캘린더에 추가][일정 파일][메일로 초대] 3버튼 + 기본 메일 앱(mailto)·링크 복사·앱으로 공유 글자 링크.
//  전부 일반 링크(OAuth 없음, M-2). 외부는 새 탭(noopener), .ics 는 공개 라우트라 세션 불필요. 링크 = 상세 딥링크(배포 주소)
//  Pi Browser(F-08, 판정 = usePiAuth().isInPiBrowser — authenticate 성공 신호, UA 아님) : WebView 는 target=_blank·<a download>·mailto 가 무반응이라
//   외부 링크는 Pi.openUrlInSystemBrowser(시스템 브라우저, 캡션 1줄로 사전 고지 — A-6), .ics 는 같은 경로 + 실패 시 '일반 브라우저에서만' 안내(F-13 패턴),
//   mailto 글자 링크는 숨기고 공유창(Pi.openShareDialog, 메일 앱 포함)·복사(Pi.copyText)로 대체. 유틸이 없는 구 Pi Browser 는 앵커 기본 동작(calendar-rules openExternal = null)
import { useEffect, useState, type MouseEvent } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePiAuth } from '@pi/auth/client'
import { NewTab } from '@/components/room/consent'
import { calendarUrl, canCopy, canShare, copyText, mailtoUrl, openExternal, shareLink, webMailUrl, type PiUtil } from '@/lib/calendar-rules'
import { hereBase, piBase, webBase } from '@/lib/site-url'
import { BTN_PRIMARY, useStartText, type SeminarCard } from './shared'

// min-h — 글자 확대(WCAG 1.4.4)·좁은 폭(360px)에서 두세 줄로 접혀도 칸이 늘어난다(고정 h-10 이면 글자가 칸 밖으로 넘침)
const CELL =
  'bg-surface-raised grid min-h-10 place-items-center rounded-lg px-2 py-1 text-center text-sm'

// 개설 직후 안내 — 만들기 화면이 표식을 남기고(sessionStorage, 이 탭만), 상세 첫 화면이 한 번 읽고 지운다(새로고침하면 다시 안 뜸)
const CREATED_KEY = 'smn-created'
export const markCreated = (id: string) => {
  try {
    sessionStorage.setItem(CREATED_KEY, id)
  } catch {} // 저장 막힌 WebView = 안내 없이 상세로(기존 '일정·공유' 줄은 그대로)
}
function takeCreated(id: string) {
  try {
    if (sessionStorage.getItem(CREATED_KEY) !== id) return false
    sessionStorage.removeItem(CREATED_KEY)
    return true
  } catch {
    return false
  }
}

// Pi Browser 일 때만 SDK 유틸을 넘긴다 — 일반 브라우저에도 window.Pi 가 주입되므로(루트 CLAUDE.md 철칙) isInPiBrowser 가 아니면 undefined(브라우저 기본 동작)
const piUtil = (inPi: boolean): PiUtil => (inPi ? window.Pi : undefined)

// 외부 앵커 클릭 — Pi Browser 면 시스템 브라우저로(결과 ok|fail 을 onDone 에), 아니면 앵커 기본 동작(새 탭, onDone 없음).
//  onClick 은 동기 preventDefault 가 필요해 openExternal 의 null(유틸 없음)을 그대로 쓴다. 형제 : month-calendar GcalManager
export function clickExternal(e: MouseEvent<HTMLAnchorElement>, pi: PiUtil, onDone: (v: 'ok' | 'fail') => void) {
  const r = openExternal(e.currentTarget.href, pi)
  if (!r) return
  e.preventDefault()
  void r.then(onDone)
}

// 개설 직후 'Google 캘린더에 추가' — 시작일시를 담은 일정 추가 링크(OAuth 없음, M-2). 새 탭은 사용자가 눌러야 열린다(자동 열기는 팝업 차단)
export function CreatedCalendar({ d }: { d: SeminarCard }) {
  const t = useTranslations('seminar.share')
  const tr = useTranslations('room')
  const { isInPiBrowser } = usePiAuth()
  const [show, setShow] = useState(false)
  const [fail, setFail] = useState(false)
  // 렌더 중 sessionStorage 를 읽으면 서버 HTML 과 어긋난다 — 마운트 뒤 1회
  useEffect(() => setShow(takeCreated(d.id)), [d.id])
  if (!show) return null
  const href = calendarUrl({ id: d.id, title: d.title, startAt: d.startAt, url: `${webBase()}/s/${d.id}`, piUrl: `${piBase()}/s/${d.id}` })
  return (
    <section role="status" className="bg-surface space-y-3 rounded-xl p-4 text-sm">
      <p>{t('created')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          className={BTN_PRIMARY}
          href={href}
          target="_blank"
          rel="noopener"
          onClick={(e) => {
            clickExternal(e, piUtil(isInPiBrowser), (v) => (v === 'ok' ? setShow(false) : setFail(true)))
            if (!e.defaultPrevented) setShow(false)
          }}
        >
          {t('addGoogle')} <NewTab label={tr('consent.newTab')} />
        </a>
        <button type="button" className="text-muted-foreground inline-flex min-h-6 items-center hover:underline" onClick={() => setShow(false)}>
          {t('later')}
        </button>
      </div>
      {isInPiBrowser && <p className="text-muted-foreground text-xs">{fail ? t('extFail') : t('piBrowserOpen')}</p>}
    </section>
  )
}

// 상태 줄 문구 = seminar.share 키 그대로
type Msg = 'copied' | 'copyFail' | 'shareFail' | 'extFail' | 'icsPiBrowser'

export function ShareLinks({ d }: { d: SeminarCard }) {
  const t = useTranslations('seminar.share')
  const start = useStartText()
  const locale = useLocale()
  const { isInPiBrowser } = usePiAuth()
  const pi = piUtil(isInPiBrowser)
  const [msg, setMsg] = useState<Msg | null>(null)
  // 데스크톱 주소·Pi Browser 주소를 둘 다 알린다(메일·캘린더). 복사·공유는 지금 보는 곳 기준 1개
  const url = `${webBase()}/s/${d.id}`
  const piUrl = `${piBase()}/s/${d.id}`
  const here = `${hereBase(window.location.hostname)}/s/${d.id}`
  const subject = t('mailSubject', { title: d.title })
  const body = t('mailBody', { title: d.title, start: start(d.startAt, true), url, piUrl })
  const ext = { target: '_blank', rel: 'noopener', onClick: (e: MouseEvent<HTMLAnchorElement>) => clickExternal(e, pi, (v) => v === 'fail' && setMsg('extFail')) }
  const icsPath = `/api/seminars/${d.id}/ics?hl=${locale.split('-')[0]}`
  // .ics — Pi Browser 는 <a download> 를 막는다(F-13 실기기) → 절대 주소로 시스템 브라우저에서 열고, 유틸 없음·실패는 '일반 브라우저에서만' 안내
  const clickIcs = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!pi) return
    e.preventDefault()
    const r = openExternal(`${webBase()}${icsPath}`, pi)
    if (!r) return setMsg('icsPiBrowser')
    void r.then((v) => v === 'fail' && setMsg('icsPiBrowser'))
  }

  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-sm">{t('title')}</h2>
      <div className="grid grid-cols-3 gap-2">
        <a className={CELL} href={calendarUrl({ id: d.id, title: d.title, startAt: d.startAt, url, piUrl })} {...ext}>
          {t('calendar')}
        </a>
        <a className={CELL} href={icsPath} download={!pi} onClick={clickIcs}>
          {t('ics')}
        </a>
        <a className={CELL} href={webMailUrl(subject, body)} {...ext}>
          {t('mail')}
        </a>
      </div>
      {/* A-6 외부 이동 사전 고지 — Pi Browser 에서만 캡션 1줄(아소카 결정, 확인 레이어는 마스터·PCT 재확인 대상) */}
      {isInPiBrowser && <p className="text-muted-foreground text-xs">{t('piBrowserOpen')}</p>}
      {/* 글자 링크·버튼도 터치 대상 높이 24px 이상(WCAG 2.5.8) — text-xs 그대로면 16px */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs [&>*]:inline-flex [&>*]:min-h-6 [&>*]:items-center">
        {/* mailto — Pi Browser 는 커스텀 스킴이 무반응이라 숨김(OS 공유창이 메일 앱을 포함) */}
        {!isInPiBrowser && (
          <a className="text-muted-foreground hover:underline" href={mailtoUrl(subject, body)}>
            {t('mailApp')}
          </a>
        )}
        {/* 링크 복사 — 기능 탐지(Pi.copyText 또는 클립보드), 하단 바·버튼 칸 추가 없음(글자 링크 줄) */}
        {canCopy(navigator.clipboard, pi) && (
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => void copyText(here, navigator.clipboard, pi).then((ok) => setMsg(ok ? 'copied' : 'copyFail'))}
          >
            {t('copy')}
          </button>
        )}
        {/* 기기 공유 시트 — 기능 탐지(Pi.openShareDialog 또는 Web Share). 닫기(cancel)는 안내 없음, 실패는 링크 복사로 안내 */}
        {canShare(navigator, pi) && (
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() =>
              void shareLink({ title: d.title, text: subject, url: here }, navigator, pi).then((r) =>
                setMsg(r === 'fail' ? 'shareFail' : null),
              )
            }
          >
            {t('share')}
          </button>
        )}
        <span role="status" aria-live="polite" className="text-muted-foreground">
          {msg && t(msg)}
        </span>
      </div>
    </section>
  )
}
