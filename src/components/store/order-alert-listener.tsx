'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { toast } from 'sonner'
import { usePiAuth } from '@/components/pi-auth-provider'
import { getSupabaseClient } from '@/lib/supabase-client'

// 사장님 보이스 주문 알림 — 전역 리스너 (PiAuthProvider 안에 마운트)
// 결제완료 시 서버가 seller:{userId} 토픽에 'new_order' broadcast → 차임 + TTS ×3
// 브라우저 자동재생 정책상 "음성 알림 켜기" 1회 탭으로 오디오 잠금 해제 필요

interface NewOrderPayload {
  item_nm?: string
  order_mthd_cd?: string | null
  dlvr_addr?: string | null
}

// 로케일별 음성 메시지 (앞 2글자 prefix 매칭, 기본 영어)
const VOICE_MSG: Record<string, { lang: string; text: string }> = {
  ko: { lang: 'ko-KR', text: '주문이 들어왔습니다' },
  en: { lang: 'en-US', text: 'New order received' },
  ja: { lang: 'ja-JP', text: '注文が入りました' },
  zh: { lang: 'zh-CN', text: '有新订单' },
  es: { lang: 'es-ES', text: 'Nuevo pedido recibido' },
}

const STORAGE_KEY = 'order_alert_enabled'

export function OrderAlertListener() {
  const { user } = usePiAuth()
  const locale = useLocale()
  const [enabled, setEnabled] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // 마운트 시 이전 설정 복원
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === '1')
    }
  }, [])

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      audioCtxRef.current = new Ctor()
    }
    return audioCtxRef.current
  }, [])

  // 차임 "딩동" — Web Audio 오실레이터 (오디오 파일 불필요)
  const playChime = useCallback(() => {
    try {
      const ctx = getCtx()
      const now = ctx.currentTime
      ;[
        [880, 0],
        [660, 0.18],
      ].forEach(([freq, t]) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, now + t)
        gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + t)
        osc.stop(now + t + 0.17)
      })
    } catch {
      // 오디오 미지원 — 무시 (toast는 별도 표시)
    }
  }, [getCtx])

  // TTS 음성 ×3 — 기기 TTS 엔진 의존(미지원이면 무음, 차임이 폴백)
  const speak3 = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const m = VOICE_MSG[locale.split('-')[0]] ?? VOICE_MSG.en
    window.speechSynthesis.cancel()
    for (let i = 0; i < 3; i++) {
      const u = new SpeechSynthesisUtterance(m.text)
      u.lang = m.lang
      u.rate = 1
      window.speechSynthesis.speak(u)
    }
  }, [locale])

  // "음성 알림 켜기" — 사용자 제스처로 오디오 잠금 해제 + 확인 알림
  const enable = useCallback(() => {
    try {
      void getCtx().resume()
    } catch {
      // ignore
    }
    playChime()
    if ('speechSynthesis' in window) {
      const m = VOICE_MSG[locale.split('-')[0]] ?? VOICE_MSG.en
      const u = new SpeechSynthesisUtterance(m.text)
      u.lang = m.lang
      window.speechSynthesis.speak(u) // 잠금 해제용 1회 발화
    }
    window.localStorage.setItem(STORAGE_KEY, '1')
    setEnabled(true)
    toast.success('🔔 음성 주문 알림이 켜졌습니다')
  }, [getCtx, playChime, locale])

  const disable = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, '0')
    setEnabled(false)
    toast('🔕 음성 주문 알림을 껐습니다')
  }, [])

  // seller:{userId} 토픽 구독 — 활성화 + 로그인 시에만
  useEffect(() => {
    if (!enabled || !user?.userId) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`seller:${user.userId}`)
      .on('broadcast', { event: 'new_order' }, ({ payload }) => {
        const p = payload as NewOrderPayload
        playChime()
        speak3()
        toast.success(`🛒 새 주문: ${p.item_nm ?? '상품'}`, {
          description:
            p.order_mthd_cd === 'DELIVERY'
              ? `🛵 배달 · ${p.dlvr_addr ?? ''}`
              : p.order_mthd_cd === 'PICKUP'
                ? '🥡 픽업'
                : '🍽️ 매장이용',
          duration: 10000,
        })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, user?.userId, playChime, speak3])

  // 로그인 사용자에게만 노출 (비로그인은 알림 대상 아님)
  if (!user) return null

  return (
    <button
      onClick={enabled ? disable : enable}
      className={`fixed right-4 bottom-20 z-40 rounded-full px-3 py-2 text-xs font-semibold shadow-lg transition-colors ${
        enabled
          ? 'bg-emerald-600 text-white'
          : 'bg-background text-muted-foreground border'
      }`}
      aria-label="음성 주문 알림 토글"
    >
      {enabled ? '🔔 주문알림 ON' : '🔕 주문알림 OFF'}
    </button>
  )
}
