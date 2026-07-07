'use client'
import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, Link } from '@/i18n/navigation'
import { toast } from 'sonner'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'
import { getCurrentPosition } from '@/lib/geo'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeSelector, type ThemeRow } from './theme-selector'
import { useThemeName } from './use-theme-name'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { useFeeMode, beanToPi } from '@/hooks/use-fee-mode'
import { useOpenPromoActive } from '@/components/feature-flag-provider'

type Step = 1 | 2 | 3 | 4
type PayStatus =
  | 'idle'
  | 'approving'
  | 'waiting'
  | 'completing'
  | 'done'
  | 'error'
  | 'cancelled'
type RoomType = 'G' | 'E'

// 모든 카페·이벤트방 생성 고정 정책 (마스터 지시):
//   공개 · 정원 10 · 유효기간(카페)/종료(이벤트) 7일 · 이벤트 입장료 무료.
// 사용자 선택 불가 — UI는 안내만, 전송값은 아래 상수로 강제.
const FIXED_MAX_MBR = 10
const FIXED_VALID_DAYS = 7
// 생성 시점 +7일 ISO — 카페 만료(expr_dtm) · 이벤트 종료(entry_expire_dtm) 공통
function plus7dIso(): string {
  return new Date(Date.now() + FIXED_VALID_DAYS * 86400000).toISOString()
}

function StepBar({ current, total = 3 }: { current: Step; total?: number }) {
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

export function GroupRoomCreator() {
  const t = useTranslations('chat.creator')
  const themeName = useThemeName()
  const router = useRouter()
  const { isInPiBrowser, user } = usePiAuth()
  // PI 모드: 실제 Pi 결제이므로 표시도 Pi(÷100, π). BEAN 모드: 기존 Bean 표기.
  const feeMode = useFeeMode()
  const isPi = feeMode === 'PI'
  // 오픈 프로모(이벤트기간) 활성 시 모든 생성료 면제 표시 — 서버 applyPromoGate와 일관
  const openPromo = useOpenPromoActive()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [selectedTheme, setSelectedTheme] = useState<ThemeRow | null>(null)
  const [roomNm, setRoomNm] = useState('')
  const [roomDesc, setRoomDesc] = useState('')
  const [payStatus, setPayStatus] = useState<PayStatus>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const [canUsePremiumTheme, setCanUsePremiumTheme] = useState(false)
  const [canCreateRoomFree, setCanCreateRoomFree] = useState(false)
  // TASK-063: 이벤트방 모드 (Business 폐지 — 구독자 무료·비구독자 Bean 생성료)
  const [roomType, setRoomType] = useState<RoomType>('G')
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number
    lng: number
  } | null>(null)

  // 다이얼로그 열릴 때마다 폼 초기화 + 구독 상태 재확인
  // 구독 직후 동일 세션에서 방 생성 시에도 최신 권한 반영
  useEffect(() => {
    if (!open) return
    setStep(1)
    setSelectedTheme(null)
    setRoomNm('')
    setRoomDesc('')
    setPayStatus('idle')
    setPayError(null)
    setRoomType('G')
    setGpsCoords(null)

    // LBS 동의자이면 카페 위치 자동 수집 (서버가 동의 여부 재검증 후 저장)
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        if (d?.consent_yn === 'Y') {
          getCurrentPosition()
            .then(setGpsCoords)
            .catch(() => {
              /* 위치 수집 실패 시 조용히 무시 */
            })
        }
      })
      .catch(() => {
        /* 조용히 무시 */
      })

    piFetch('/api/subscriptions/check')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            canUsePremiumTheme?: boolean
            canCreateRoomFree?: boolean
          } | null,
        ) => {
          setCanUsePremiumTheme(d?.canUsePremiumTheme ?? false)
          setCanCreateRoomFree(d?.canCreateRoomFree ?? false)
        },
      )
      .catch(() => {
        /* 조용히 실패 — 비구독자로 취급 */
      })
  }, [open])

  const isPremium = selectedTheme?.theme_tp_cd === 'PREMIUM'
  // PREMIUM 테마 비구독자 생성료 = 일반요금제 Bean(10). 구독자·BASIC은 0(무료).
  // 결제 통화 = Bean (Pi 직접결제 폐기). 서버가 권위 부과·차감.
  // ⭐ 오픈 프로모 중엔 0(무료) — 서버 applyPromoGate가 실제 차감을 면제하는 것과 표시 일관.
  const createCostBean =
    openPromo || !isPremium
      ? 0
      : getRoomFeeBean('CREATE', 'PREMIUM', canCreateRoomFree)
  // 이벤트 카페 생성료 — 구독자는 무료(0), 비구독자는 EVENT 요금(Bean). 프로모 중 0.
  const eventCreateCostBean = openPromo
    ? 0
    : getRoomFeeBean('CREATE', 'EVENT', canCreateRoomFree)
  const isBusy =
    payStatus === 'approving' ||
    payStatus === 'waiting' ||
    payStatus === 'completing'

  const handleThemeSelect = useCallback((theme: ThemeRow) => {
    setSelectedTheme(theme)
    setStep(2)
  }, [])

  // PI 모드 유료 카페 — 서버가 내려준 pay 파라미터로 Pi 직결제. 방은 complete가 생성.
  const startRoomPiPayment = useCallback(
    (
      pay: { amount: number; memo: string; metadata: Record<string, unknown> },
      successMsg?: string,
    ) => {
      if (typeof window === 'undefined' || !window.Pi) {
        setPayStatus('error')
        setPayError('Pi Browser에서 결제할 수 있습니다')
        return
      }
      setPayStatus('approving')
      window.Pi.createPayment(
        { amount: pay.amount, memo: pay.memo, metadata: pay.metadata },
        {
          onReadyForServerApproval: async (paymentId: string) => {
            try {
              const r = await piFetch('/api/payments/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId }),
              })
              if (!r.ok) throw new Error()
              setPayStatus('waiting')
            } catch {
              setPayStatus('error')
              setPayError(t('createError'))
            }
          },
          onReadyForServerCompletion: async (
            paymentId: string,
            txid: string,
          ) => {
            setPayStatus('completing')
            try {
              const r = await piFetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId, txid }),
              })
              if (!r.ok) throw new Error()
              const cd = (await r.json()) as { room?: { room_id: string } }
              setPayStatus('done')
              setOpen(false)
              toast.success(successMsg ?? t('created'))
              if (cd.room?.room_id) router.push(`/chat/${cd.room.room_id}`)
            } catch {
              setPayStatus('error')
              setPayError(t('createError'))
            }
          },
          onCancel: () => setPayStatus('idle'),
          onError: (e: Error) => {
            setPayStatus('error')
            setPayError(e?.message ?? t('createError'))
          },
        },
      )
    },
    [router, t],
  )

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
          // 고정 정책 — 공개 · 정원 10 · 유효기간 7일 (사용자 선택 불가)
          is_public_yn: 'Y',
          max_mbr_cnt: FIXED_MAX_MBR,
          expr_dtm: plus7dIso(),
          lat: gpsCoords?.lat,
          lng: gpsCoords?.lng,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('createFail'))
      }
      const data = (await res.json()) as {
        room?: { room_id: string }
        mode?: string
        pay?: {
          amount: number
          memo: string
          metadata: Record<string, unknown>
        }
      }
      // PI 모드 유료 카페 — 서버가 결제 요구. Pi 직결제로 핸드오프(완료 시 complete가 방 생성).
      if (data.mode === 'PI' && data.pay) {
        startRoomPiPayment(data.pay)
        return
      }
      setPayStatus('done')
      setOpen(false)
      toast.success(t('created'))
      if (data.room?.room_id) {
        router.push(`/chat/${data.room.room_id}`)
      }
    } catch (e) {
      setPayStatus('error')
      setPayError(e instanceof Error ? e.message : t('createError'))
    }
  }, [
    selectedTheme,
    roomNm,
    roomDesc,
    gpsCoords,
    router,
    t,
    startRoomPiPayment,
  ])

  // TASK-063: 이벤트방 생성 — BUSINESS 전용, 생성 결제 없음 (참가자가 입장료 결제)
  const createEventRoomUi = useCallback(async () => {
    if (!selectedTheme) return
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
          // 고정 정책 — 공개 · 정원 10 · 입장료 무료 · 종료 7일 후 (사용자 선택 불가)
          is_public_yn: 'Y',
          max_mbr_cnt: FIXED_MAX_MBR,
          entry_fee_pi: 0,
          entry_expire_dtm: plus7dIso(),
          lat: gpsCoords?.lat ?? null,
          lng: gpsCoords?.lng ?? null,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('eventCreateFail'))
      }
      const data = (await res.json()) as {
        room?: { room_id: string }
        mode?: string
        pay?: {
          amount: number
          memo: string
          metadata: Record<string, unknown>
        }
      }
      // PI 모드 유료 이벤트방 — Pi 직결제로 핸드오프(완료 시 complete가 방 생성).
      if (data.mode === 'PI' && data.pay) {
        startRoomPiPayment(data.pay, t('eventCreated'))
        return
      }
      setPayStatus('done')
      setOpen(false)
      toast.success(t('eventCreated'))
      if (data.room?.room_id) {
        router.push(`/chat/${data.room.room_id}`)
      }
    } catch (e) {
      setPayStatus('error')
      setPayError(e instanceof Error ? e.message : t('eventCreateError'))
    }
  }, [
    selectedTheme,
    roomNm,
    roomDesc,
    gpsCoords,
    router,
    t,
    startRoomPiPayment,
  ])

  // 카페 만들기는 Pi Browser에서 로그인한 사용자만 가능 (비로그인·일반 브라우저는 버튼 숨김)
  // 생성·소유권이 걸려 있어 Pi 로그인 필수 (요금은 Bean 차감)
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
              {roomType === 'E' ? t('eventTitle') : t('groupTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <StepBar current={step} total={3} />

            {/* Step 1: 방 유형 + 테마 선택 */}
            {step === 1 && (
              <div>
                {/* 방 유형 선택 — 이벤트방은 구독자 무료·비구독자 Bean 생성료 (Business 폐지) */}
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setRoomType('G')}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      roomType === 'G'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {t('groupTab')}
                  </button>
                  <button
                    onClick={() => setRoomType('E')}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      roomType === 'E'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {t('eventTab')}
                  </button>
                </div>
                {roomType === 'E' && (
                  <p className="mb-2 rounded-xl bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                    {t('eventDesc')}
                    {eventCreateCostBean > 0
                      ? t('eventCreateCostDeduct', {
                          amount: isPi
                            ? `${beanToPi(eventCreateCostBean)} π`
                            : `${eventCreateCostBean} Bean`,
                        })
                      : t('eventCreateCostFree')}
                  </p>
                )}
                <p className="text-muted-foreground mb-3 text-sm">
                  {t('themeStep')}
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
                    {themeName(selectedTheme.theme_cd, selectedTheme.theme_nm_en || selectedTheme.theme_nm)} {t('theme')}
                  </span>
                  {isPremium && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      PREMIUM
                    </span>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {t('nameLabel')}
                  </label>
                  <input
                    type="text"
                    value={roomNm}
                    onChange={(e) => setRoomNm(e.target.value)}
                    placeholder={t('defaultRoomName', {
                      emoji: selectedTheme.theme_emoji,
                      theme: themeName(selectedTheme.theme_cd, selectedTheme.theme_nm_en || selectedTheme.theme_nm),
                    })}
                    maxLength={50}
                    className="bg-background focus:ring-ring w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {t('descLabel')}
                  </label>
                  <textarea
                    value={roomDesc}
                    onChange={(e) => setRoomDesc(e.target.value)}
                    placeholder={t('descPlaceholder')}
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
                    {t('back')}
                  </button>
                  <button
                    onClick={() => {
                      if (roomNm.trim()) setStep(3)
                    }}
                    disabled={!roomNm.trim()}
                    className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: 공개 설정 + 정원 + 유효기간 */}
            {step === 3 && (
              <div className="space-y-4">
                {/* 고정 정책 (마스터 지시) — 모든 카페·이벤트방: 공개 · 정원 10 · 7일.
                    사용자 선택 불가, 안내만 표시(전송값은 상수로 강제). */}
                <div className="bg-muted/40 space-y-2 rounded-xl border p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t('visibility')}
                    </span>
                    <span className="font-medium">{t('publicEmoji')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t('maxMembers')}
                    </span>
                    <span className="font-medium">
                      {t('capacityN', { n: FIXED_MAX_MBR })}
                    </span>
                  </div>
                  {roomType === 'E' && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('entryFee')}
                      </span>
                      <span className="font-medium">{t('freeEntry')}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {roomType === 'E' ? t('endTimeLabel') : t('validity')}
                    </span>
                    <span className="font-medium">
                      {t('validityDays', { n: FIXED_VALID_DAYS })}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="hover:bg-muted flex-1 rounded-xl border px-4 py-2 text-sm"
                  >
                    {t('back')}
                  </button>
                  {roomType === 'E' ? (
                    <button
                      onClick={createEventRoomUi}
                      disabled={isBusy}
                      className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      {isBusy ? (
                        t('creating')
                      ) : eventCreateCostBean > 0 ? (
                        isPi ? (
                          `${beanToPi(eventCreateCostBean)} π ${t('payAndCreateEvent')}`
                        ) : (
                          <>
                            {eventCreateCostBean}{' '}
                            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />{' '}
                            {t('payAndCreateEvent')}
                          </>
                        )
                      ) : (
                        t('createEventFree')
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={createFreeRoom}
                      disabled={isBusy}
                      className="bg-primary text-primary-foreground flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      {isBusy ? (
                        t('creating')
                      ) : createCostBean > 0 ? (
                        isPi ? (
                          `${beanToPi(createCostBean)} π ${t('payAndCreateGroup')}`
                        ) : (
                          <>
                            {createCostBean}{' '}
                            <BeanIcon className="inline-block h-4 w-4 align-text-bottom" />{' '}
                            {t('payAndCreateGroup')}
                          </>
                        )
                      ) : canCreateRoomFree && isPremium ? (
                        t('createWithBenefit')
                      ) : (
                        t('createFree')
                      )}
                    </button>
                  )}
                </div>
                {/* 오픈 프로모(이벤트기간) 중 생성료 면제 안내 — 카페방·이벤트방 공통 */}
                {openPromo && (
                  <p className="text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    🎉 이벤트기간 동안 무료
                  </p>
                )}
                {roomType === 'G' && createCostBean > 0 && (
                  <p className="text-muted-foreground text-center text-xs">
                    {t('premiumCreateCostMemo', {
                      amount: isPi ? beanToPi(createCostBean) : createCostBean,
                    })}{' '}
                    {isPi ? (
                      'π'
                    ) : (
                      <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                    )}{' '}
                    {t('createCostSuffix')}
                  </p>
                )}
                {roomType === 'E' && eventCreateCostBean > 0 && (
                  <p className="text-muted-foreground text-center text-xs">
                    {t('eventCreateCostMemo', {
                      amount: isPi
                        ? beanToPi(eventCreateCostBean)
                        : eventCreateCostBean,
                    })}{' '}
                    {isPi ? (
                      'π'
                    ) : (
                      <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                    )}{' '}
                    {t('createCostSuffix')}
                  </p>
                )}
                {payError && (
                  <div className="space-y-1 text-center">
                    <p className="text-destructive text-xs">{payError}</p>
                    {payError.includes('충전') && (
                      <Link
                        href="/bean"
                        onClick={() => setOpen(false)}
                        className="text-primary inline-block text-xs font-medium hover:underline"
                      >
                        <BeanIcon className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom" />
                        {t('goChargingBean')}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
