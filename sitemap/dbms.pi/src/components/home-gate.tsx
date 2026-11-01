'use client'

// dbms.pi 첫 화면 연동 안내 — Pi 세션이고 Google 연동 전이면 환영 문구 + 6자리 코드 발급(PiLinkCodeIssuer)
//  로그인 전(로그인은 아래 MonitorView 게이트가 맡음)·연동 완료(/api/auth/me linked)·Google 세션(연동돼야 생김)이면 아무것도 안 그림(2026-11-01·11-02 마스터)
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { PiLinkCodeIssuer, useAppUser } from './google-auth'

export function HomeLinkPrompt() {
  const t = useTranslations('home')
  const { source, user } = useAppUser()
  const name = user?.displayName || user?.username || ''
  // null = 판정 전(깜빡임 방지로 아무것도 안 그림). 조회 실패는 미연동으로(코드 발급이 보일 뿐)
  const [linked, setLinked] = useState<boolean | null>(null)
  useEffect(() => {
    if (source !== 'pi') return
    let alive = true
    void readApi<{ user: { linked?: boolean } | null }>(
      piFetch('/api/auth/me', { cache: 'no-store' }),
    ).then((r) => {
      if (alive) setLinked(r.ok ? !!r.data.user?.linked : false)
    })
    return () => {
      alive = false
    }
  }, [source])

  if (source !== 'pi' || linked !== false) return null
  return (
    <div className="flex flex-col gap-4">
      <p className="bg-surface rounded-2xl p-4 text-sm" role="status">
        {t('welcome', { name })}
      </p>
      <PiLinkCodeIssuer />
    </div>
  )
}
