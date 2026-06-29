'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'

// 일반 브라우저(쿠키 세션) SSR 경로에서 비멤버가 유료(프리미엄/이벤트) 카페에 입장할 때,
// 자동 입장 대신 Bean 소진을 사전 안내하고 동의 시에만 /join(confirm)으로 차감한다.
// Pi Browser는 ClientChatRoom 게이트가 동일 흐름을 처리 — 두 경로가 같은 요금 룰을 통과한다.
// (입장료 차감 = 서버 오프체인 원장(applyBean), Pi 결제(window.Pi) 아님 → 일반 브라우저 가능)
export function RoomEntryFeeGate({
  roomId,
  roomNm,
  feeBean,
  balance,
}: {
  roomId: string
  roomNm: string
  feeBean: number
  balance: number
}) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [bal, setBal] = useState(balance)
  const insufficient = bal < feeBean

  async function handleJoin() {
    setJoining(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      if (res.ok) {
        // 멤버 등록 완료 → 서버 컴포넌트 재실행으로 카페 패널 진입
        router.refresh()
        return
      }
      const d = (await res.json().catch(() => ({}))) as {
        requiresBean?: boolean
        balance?: number
      }
      // 경합 등으로 잔액 부족 판정 → 최신 잔액 반영 후 충전 안내로 전환
      if (
        res.status === 402 &&
        d.requiresBean &&
        typeof d.balance === 'number'
      ) {
        setBal(d.balance)
      }
      setJoining(false)
    } catch {
      setJoining(false)
    }
  }

  return (
    <div className="bg-background text-muted-foreground fixed inset-x-0 top-14 bottom-0 z-40 mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-2 text-center text-sm">
      {roomNm && <p className="font-semibold">{roomNm}</p>}
      {insufficient ? (
        <>
          <p>
            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />{' '}
            입장에 <b className="text-primary">{feeBean} Bean</b>이 필요하지만
            잔액이 부족합니다
          </p>
          <p className="text-xs">현재 잔액 {bal} Bean</p>
          <Link
            href="/bean"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Bean 충전하기
          </Link>
        </>
      ) : (
        <>
          <p>
            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" /> 이
            카페 입장에는 <b className="text-primary">{feeBean} Bean</b>이
            소진됩니다
          </p>
          <p className="text-xs">
            현재 잔액 {bal} Bean → 입장 후 {bal - feeBean} Bean
          </p>
          <button
            type="button"
            disabled={joining}
            onClick={handleJoin}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {joining ? '입장 중…' : `${feeBean} Bean 쓰고 입장`}
          </button>
        </>
      )}
      <Link href="/chat" className="text-muted-foreground text-xs underline">
        목록으로
      </Link>
    </div>
  )
}
