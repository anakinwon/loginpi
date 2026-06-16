'use client'
import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { getCurrentPosition } from '@/lib/geo'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeSelector, type ThemeRow } from './theme-selector'

type Step = 1 | 2 | 3 | 4
type PayStatus =
  | 'idle'
  | 'approving'
  | 'waiting'
  | 'completing'
  | 'done'
  | 'error'
  | 'cancelled'
type Capacity = 10 | 30 | 50 | 100
type ExprDays = 0 | 1 | 3 | 7 | 30
type RoomType = 'G' | 'E'
type EntryFee = 0 | 0.1 | 0.5 | 1

const PAY_STATUS_MSG: Partial<Record<PayStatus, string>> = {
  approving: '승인 중…',
  waiting: '지갑 확인 중…',
  completing: '방 생성 중…',
}

function StepBar({ current, total = 4 }: { current: Step; total?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => i + 1).map((s) => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors ${s <= current ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  )
}

// datetime-local input의 min 값 — 현재 로컬 시각 (YYYY-MM-DDTHH:mm)
function localDtmNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function GroupRoomCreator() {
  const t = useTranslations('chat.creator')
  const router = useRouter()
  const { isInPiBrowser, user } = usePiAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [selectedTheme, setSelectedTheme] = useState<ThemeRow | null>(null)
  const [roomNm, setRoomNm] = useState('')
  const [roomDesc, setRoomDesc] = useState('')
  const [isPublic, setIsPublic] = useState<'Y' | 'N'>('Y')
  const [maxMbr, setMaxMbr] = useState<Capacity>(50)
  const [exprDays, setExprDays] = useState<ExprDays>(0)
  const [payStatus, setPayStatus] = useState<PayStatus>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const [canUsePremiumTheme, setCanUsePremiumTheme] = useState(false)
  const [canCreateRoomFree, setCanCreateRoomFree] = useState(false)
  // TASK-063: 이벤트방 모드 (BUSINESS 전용 — 결제 단계 없이 3단계 생성)
  const [roomType, setRoomType] = useState<RoomType>('G')
  const [canCreateEventRoom, setCanCreateEventRoom] = useState(false)
  const [entryFee, setEntryFee] = useState<EntryFee>(0)
  const [eventEndDtm, setEventEndDtm] = useState('')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)

  // 다이얼로그 열릴 때마다 폼 초기화 + 구독 상태 재확인
  // 구독 직후 동일 세션에서 방 생성 시에도 최신 권한 반영
  useEffect(() => {
    if (!open) return
    setStep(1)
    setSelectedTheme(null)
    setRoomNm('')
    setRoomDesc('')
    setIsPublic('Y')
    setMaxMbr(50)
    setExprDays(0)
    setPayStatus('idle')
    setPayError(null)
    setRoomType('G')
    setEntryFee(0)
    setEventEndDtm('')
    setGpsCoords(null)

    // LBS 동의자이면 카페 위치 자동 수집 (서버가 동의 여부 재검증 후 저장)
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        if (d?.consent_yn === 'Y') {
          getCurrentPosition().then(setGpsCoords).catch(() => { /* 위치 수집 실패 시 조용히 무시 */ })
        }
      })
      .catch(() => { /* 조용히 무시 */ })

    piFetch('/api/subscriptions/check')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            canUsePremiumTheme?: boolean
            canCreateRoomFree?: boolean
            canCreateEventRoom?: boolean
          } | null,
        ) => {
          setCanUsePremiumTheme(d?.canUsePremiumTheme ?? false)
          setCanCreateRoomFree(d?.canCreateRoomFree ?? false)
          setCanCreateEventRoom(d?.canCreateEventRoom ?? false)
        },
      )
      .catch(() => {
        /* 조용히 실패 — 비구독자로 취급 */
      })
  }, [open])

  const isPremium = selectedTheme?.theme_tp_cd === 'PREMIUM'
  // FITNESS(PT/피트니스)는 무료, 또는 구독자의 월 무료 쿼터 내에서는 결제 없이 생성
  const isFree = selectedTheme?.theme_cd === 'FITNESS' || canCreateRoomFree
  // 비구독자만 결제: PREMIUM 테마는 0.3π(방0.1+테마0.2), BASIC은 0.1π
  const payAmount = isPremium && !canUsePremiumTheme ? 0.3 : 0.1
  const isBusy =
    payStatus === 'approving' ||
    payStatus === 'waiting' ||
    payStatus === 'completing'

  const handleThemeSelect = useCallback((theme: ThemeRow) => {
    setSelectedTheme(theme)
    setStep(2)
  }, [])

  const startPayment = useCallback(() => {
    if (!window.Pi) {
      setPayError('Pi Browser에서만 결제가 가능합니다')
      setPayStatus('error')
      return
    }
    if (!selectedTheme) return

    setPayStatus('approving')
    setPayError(null)

    window.Pi.createPayment(
      {
        amount: payAmount,
        memo: `카페 생성: ${roomNm}`,
        metadata: {
          type: 'CHAT_ROOM_CREATE',
          theme_cd: selectedTheme.theme_cd,
          theme_tp_cd: selectedTheme.theme_tp_cd,
          room_nm: roomNm,
          room_desc: roomDesc || null,
          is_public_yn: isPublic,
          max_mbr_cnt: maxMbr,
          expr_dtm:
            exprDays === 0
              ? null
              : new Date(Date.now() + exprDays * 86400000).toISOString(),
          lat: gpsCoords?.lat ?? null,
          lng: gpsCoords?.lng ?? null,
        },
      },
      {
        onReadyForServerApproval: async (paymentId) => {
          try {
            const res = await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
            if (!res.ok) {
              const d = (await res.json()) as { error?: string }
              throw new Error(d.error ?? '서버 승인 실패')
            }
            setPayStatus('waiting')
          } catch (e) {
            setPayStatus('error')
            setPayError(e instanceof Error ? e.message : '승인 오류')
          }
        },

        onReadyForServerCompletion: async (paymentId, txid) => {
          setPayStatus('completing')
          try {
            const res = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            if (!res.ok) {
              const d = (await res.json()) as { error?: string }
              throw new Error(d.error ?? '완료 처리 실패')
            }
            const data = (await res.json()) as { room?: { room_id: string } }
            setPayStatus('done')
            setOpen(false)
            toast.success('카페가 생성되었습니다!')
            if (data.room?.room_id) {
              router.push(`/chat/${data.room.room_id}`)
            }
          } catch (e) {
            setPayStatus('error')
            setPayError(e instanceof Error ? e.message : '완료 오류')
          }
        },

        onCancel: () => setPayStatus('cancelled'),
        onError: (e) => {
          setPayStatus('error')
          setPayError(e.message)
        },
      },
    )
  }, [
    selectedTheme,
    payAmount,
    roomNm,
    roomDesc,
    isPublic,
    maxMbr,
    exprDays,
    gpsCoords,
    router,
  ])

  const createFreeRoom = useCallback(async () => {
    if (!selectedTheme) return
    setPayStatus('completing')
    setPayError(null)
    try {
      const res = await piFetch('/api/chat/rooms/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme_cd: selectedTheme.theme_cd,
          room_nm: roomNm,
          room_desc: roomDesc || null,
          is_public_yn: isPublic,
          max_mbr_cnt: maxMbr,
          expr_dtm:
            exprDays === 0
              ? null
              : new Date(Date.now() + exprDays * 86400000).toISOString(),
          lat: gpsCoords?.lat,
          lng: gpsCoords?.lng,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '방 생성 실패')
      }
      const data = (await res.json()) as { room?: { room_id: string } }
      setPayStatus('done')
      setOpen(false)
      toast.success('카페가 생성되었습니다!')
      if (data.room?.room_id) {
        router.push(`/chat/${data.room.room_id}`)
      }
    } catch (e) {
      setPayStatus('error')
      setPayError(e instanceof Error ? e.message : '방 생성 오류')
    }
  }, [selectedTheme, roomNm, roomDesc, isPublic, maxMbr, exprDays, gpsCoords, router])

  // TASK-063: 이벤트방 생성 — BUSINESS 전용, 생성 결제 없음 (참가자가 입장료 결제)
  const createEventRoomUi = useCallback(async () => {
    if (!selectedTheme || !eventEndDtm) return
    setPayStatus('completing')
    setPayError(null)
    try {
      const res = await piFetch('/api/chat/rooms/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme_cd: selectedTheme.theme_cd,
          room_nm: roomNm,
          room_desc: roomDesc || null,
          is_public_yn: isPublic,
          max_mbr_cnt: maxMbr,
          entry_fee_pi: entryFee,
          entry_expire_dtm: new Date(eventEndDtm).toISOString(),
          lat: gpsCoords?.lat ?? null,
          lng: gpsCoords?.lng ?? null,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '이벤트방 생성 실패')
      }
      const data = (await res.json()) as { room?: { room_id: string } }
      setPayStatus('done')
      setOpen(false)
      toast.success('이벤트방이 생성되었습니다!')
      if (data.room?.room_id) {
        router.push(`/chat/${data.room.room_id}`)
      }
    } catch (e) {
      setPayStatus('error')
      setPayError(e instanceof Error ? e.message : '이벤트방 생성 오류')
    }
  }, [
    selectedTheme,
    roomNm,
    roomDesc,
    isPublic,
    maxMbr,
    entryFee,
    eventEndDtm,
    gpsCoords,
    router,
  ])

  const retryPayment = useCallback(() => {
    setPayStatus('idle')
    setPayError(null)
  }, [])

  // 카페 만들기는 Pi Browser에서 로그인한 사용자만 가능 (비로그인·일반 브라우저는 버튼 숨김)
  // 목록은 게스트 공개지만, 생성은 Pi 결제·소유권이 걸려 있어 Pi 로그인 필수
  if (!isInPiBrowser || !user) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90"
      >
        {t('openBtn')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!isBusy}>
          <DialogHeader>
            <DialogTitle>
              {roomType === 'E' ? '이벤트 카페 만들기' : '그룹 카페 만들기'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <StepBar current={step} total={roomType === 'E' ? 3 : 4} />

            {/* Step 1: 방 유형 + 테마 선택 */}
            {step === 1 && (
              <div>
                {/* TASK-063: 이벤트방 탭 — BUSINESS 플랜만 선택 가능 */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRoomType('G')}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      roomType === 'G'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    💬 그룹방
                  </button>
                  <button
                    onClick={() => {
                      if (canCreateEventRoom) setRoomType('E')
                      else toast.info('이벤트 카페는 Business 플랜 전용입니다')
                    }}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      roomType === 'E'
                        ? 'border-primary bg-primary/10 text-primary'
                        : canCreateEventRoom
                          ? 'hover:bg-muted'
                          : 'hover:bg-muted opacity-60'
                    }`}
                  >
                    🎟️ 이벤트방 {!canCreateEventRoom && '🔒'}
                  </button>
                </div>
                {roomType === 'E' && (
                  <p className="mb-2 rounded-xl bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                    참가자가 입장료(π)를 결제하고 입장하는 기간 한정 방입니다.
                    생성 비용은 없습니다.
                  </p>
                )}
                <p className="text-muted-foreground mb-3 text-sm">
                  카페의 테마를 선택하세요
                </p>
                <div className="max-h-72 overflow-y-auto pr-1">
                  <ThemeSelector
                    selectedThemeCode={selectedTheme?.theme_cd ?? null}
                    onSelect={handleThemeSelect}
                    hasPremiumAccess={canUsePremiumTheme}
                  />
                </div>
              </div>
            )}

            {/* Step 2: 카페 정보 */}
            {step === 2 && selectedTheme && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-2xl">{selectedTheme.theme_emoji}</span>
                  <span className="font-medium">
                    {selectedTheme.theme_nm} 테마
                  </span>
                  {isPremium && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      PREMIUM
                    </span>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    카페 이름 *
                  </label>
                  <input
                    type="text"
                    value={roomNm}
                    onChange={(e) => setRoomNm(e.target.value)}
                    placeholder={`${selectedTheme.theme_emoji} ${selectedTheme.theme_nm} 모임`}
                    maxLength={50}
                    className="bg-background focus:ring-ring w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    카페 소개 (선택)
                  </label>
                  <textarea
                    value={roomDesc}
                    onChange={(e) => setRoomDesc(e.target.value)}
                    placeholder="카페에 대해 소개해 주세요"
                    rows={3}
                    maxLength={200}
                    className="bg-background focus:ring-ring w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="hover:bg-muted flex-1 rounded-xl border px-4 py-2 text-sm"
                  >
                    이전
                  </button>
                  <button
                    onClick={() => {
                      if (roomNm.trim()) setStep(3)
                    }}
                    disabled={!roomNm.trim()}
                    className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: 공개 설정 + 정원 + 유효기간 */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">공개 여부</p>
                  <div className="flex gap-2">
                    {(['Y', 'N'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setIsPublic(v)}
                        className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                          isPublic === v
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {v === 'Y' ? '🌐 공개' : '🔒 비공개'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">최대 정원</p>
                  <div className="grid grid-cols-4 gap-2">
                    {([10, 30, 50, 100] as Capacity[]).map((n) => (
                      <button
                        key={n}
                        onClick={() => setMaxMbr(n)}
                        className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                          maxMbr === n
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {n}명
                      </button>
                    ))}
                  </div>
                </div>

                {roomType === 'G' ? (
                  <div>
                    <p className="mb-2 text-sm font-medium">유효기간</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { days: 0 as ExprDays, label: '무기한' },
                        { days: 1 as ExprDays, label: '1일' },
                        { days: 3 as ExprDays, label: '3일' },
                        { days: 7 as ExprDays, label: '7일' },
                        { days: 30 as ExprDays, label: '30일' },
                      ].map(({ days, label }) => (
                        <button
                          key={days}
                          onClick={() => setExprDays(days)}
                          className={`rounded-xl border py-2 text-xs font-medium transition-colors ${
                            exprDays === days
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* TASK-063: 이벤트방 — 입장료 + 종료 시각 */}
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        입장료 (참가자 결제)
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {([0, 0.1, 0.5, 1] as EntryFee[]).map((fee) => (
                          <button
                            key={fee}
                            onClick={() => setEntryFee(fee)}
                            className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                              entryFee === fee
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'hover:bg-muted'
                            }`}
                          >
                            {fee === 0 ? '무료' : `π${fee}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        이벤트 종료 시각 *
                      </label>
                      <input
                        type="datetime-local"
                        value={eventEndDtm}
                        min={localDtmNow()}
                        onChange={(e) => setEventEndDtm(e.target.value)}
                        className="bg-background focus:ring-ring w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                      />
                      <p className="text-muted-foreground mt-1 text-xs">
                        종료 시각이 지나면 참가자(GUEST) 멤버십이 자동
                        만료됩니다
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="hover:bg-muted flex-1 rounded-xl border px-4 py-2 text-sm"
                  >
                    이전
                  </button>
                  {roomType === 'E' ? (
                    <button
                      onClick={createEventRoomUi}
                      disabled={
                        isBusy ||
                        !eventEndDtm ||
                        new Date(eventEndDtm) <= new Date()
                      }
                      className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      {isBusy ? '생성 중…' : '🎟️ 이벤트방 만들기'}
                    </button>
                  ) : isFree ? (
                    <button
                      onClick={createFreeRoom}
                      disabled={isBusy}
                      className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      {isBusy
                        ? '생성 중…'
                        : canCreateRoomFree &&
                            selectedTheme?.theme_cd !== 'FITNESS'
                          ? '구독 혜택으로 방 만들기'
                          : '무료 방 만들기'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep(4)}
                      className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium"
                    >
                      다음
                    </button>
                  )}
                </div>
                {roomType === 'E' && payError && (
                  <p className="text-destructive text-center text-xs">
                    {payError}
                  </p>
                )}
              </div>
            )}

            {/* Step 4: 결제 확인 */}
            {step === 4 && selectedTheme && (
              <div className="space-y-4">
                <div className="bg-muted/40 space-y-2 rounded-xl border p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">테마</span>
                    <span>
                      {selectedTheme.theme_emoji} {selectedTheme.theme_nm}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">카페 이름</span>
                    <span className="max-w-[60%] truncate text-right font-medium">
                      {roomNm}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">공개 여부</span>
                    <span>{isPublic === 'Y' ? '공개' : '비공개'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최대 정원</span>
                    <span>{maxMbr}명</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">유효기간</span>
                    <span>{exprDays === 0 ? '무기한' : `${exprDays}일`}</span>
                  </div>
                  <div className="border-t pt-2">
                    {isPremium && !canUsePremiumTheme && (
                      <div className="flex justify-between text-amber-600 dark:text-amber-400">
                        <span>PREMIUM 테마 단건</span>
                        <span>0.2 π</span>
                      </div>
                    )}
                    {isPremium && canUsePremiumTheme && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>PREMIUM 테마</span>
                        <span>구독 혜택 (무료)</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">방 생성</span>
                      <span>0.1 π</span>
                    </div>
                    <div className="mt-1.5 flex justify-between border-t pt-1.5 font-semibold">
                      <span>합계</span>
                      <span className="text-primary">{payAmount} π</span>
                    </div>
                  </div>
                </div>

                {!isInPiBrowser && (
                  <p className="rounded-xl bg-yellow-50 px-4 py-2.5 text-center text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                    Pi Browser에서만 결제가 가능합니다
                  </p>
                )}

                {payStatus === 'waiting' && (
                  <p className="text-muted-foreground text-center text-xs">
                    Pi 지갑 화면에서 결제를 승인해 주세요.
                  </p>
                )}

                {payError && (
                  <p className="text-destructive text-center text-xs">
                    {payError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(3)}
                    disabled={isBusy}
                    className="hover:bg-muted flex-1 rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
                  >
                    이전
                  </button>
                  <button
                    onClick={
                      payStatus === 'cancelled' || payStatus === 'error'
                        ? retryPayment
                        : startPayment
                    }
                    disabled={isBusy || !isInPiBrowser}
                    className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    {isBusy
                      ? (PAY_STATUS_MSG[payStatus] ?? '처리 중…')
                      : payStatus === 'cancelled' || payStatus === 'error'
                        ? '다시 시도'
                        : `${payAmount} π 결제 및 방 만들기`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
