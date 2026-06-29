'use client'
import { useState, useCallback, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
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
import { ThemeSelector, type ThemeRow, getThemeName } from './theme-selector'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { useFeeMode, beanToPi } from '@/hooks/use-fee-mode'

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

// datetime-local input의 min 값 — 현재 로컬 시각 (YYYY-MM-DDTHH:mm)
function localDtmNow(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function GroupRoomCreator() {
  const t = useTranslations('chat.creator')
  const locale = useLocale()
  const router = useRouter()
  const { isInPiBrowser, user } = usePiAuth()
  // PI 모드: 실제 Pi 결제이므로 표시도 Pi(÷100, π). BEAN 모드: 기존 Bean 표기.
  const feeMode = useFeeMode()
  const isPi = feeMode === 'PI'
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
  // TASK-063: 이벤트방 모드 (Business 폐지 — 구독자 무료·비구독자 Bean 생성료)
  const [roomType, setRoomType] = useState<RoomType>('G')
  const [entryFee, setEntryFee] = useState<EntryFee>(0)
  const [eventEndDtm, setEventEndDtm] = useState('')
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
  // 일반(BASIC) 테마 그룹 카페는 무료 생성. PREMIUM 테마만 유료(구독자는 구독 혜택으로 무료).
  const isFree = !isPremium || canCreateRoomFree
  // 무료로 개설되는 모든 방(무료 테마·구독 혜택 무료 생성 포함)은 서버에서 7일 고정·연장 불가
  // → 유효기간 선택 불가. 결제로 만드는 방만 기간 선택 가능.
  const isFreeRoom7d = isFree
  // PREMIUM 테마 비구독자 생성료 = 일반요금제 Bean(10). 구독자·BASIC은 0(무료).
  // 결제 통화 = Bean (Pi 직접결제 폐기). 서버가 권위 부과·차감.
  const createCostBean = isPremium
    ? getRoomFeeBean('CREATE', 'PREMIUM', canCreateRoomFree)
    : 0
  // 이벤트 카페 생성료 — 구독자는 무료(0), 비구독자는 EVENT 요금(Bean). 서버가 권위 부과·차감.
  const eventCreateCostBean = getRoomFeeBean(
    'CREATE',
    'EVENT',
    canCreateRoomFree,
  )
  const isBusy =
    payStatus === 'approving' ||
    payStatus === 'waiting' ||
    payStatus === 'completing'

  // 무료로 개설되는 그룹방은 무조건 공개 + 최대 정원 10명 제한 (마스터 정책).
  // Bean 결제로 만드는 방만 비공개·정원 확대 선택 가능.
  const restrictFreeRoom = roomType === 'G' && isFree
  const FREE_ROOM_MAX = 10

  // 무료 방으로 확정되면 공개·정원 10명을 강제 (잘못된 이전 선택값 정정)
  useEffect(() => {
    if (restrictFreeRoom) {
      setIsPublic('Y')
      setMaxMbr(FREE_ROOM_MAX)
    }
  }, [restrictFreeRoom])

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
    isPublic,
    maxMbr,
    exprDays,
    gpsCoords,
    router,
    t,
    startRoomPiPayment,
  ])

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
    isPublic,
    maxMbr,
    entryFee,
    eventEndDtm,
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
                    {getThemeName(selectedTheme, locale)} {t('theme')}
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
                      theme: getThemeName(selectedTheme, locale),
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
                <div>
                  <p className="mb-2 text-sm font-medium">{t('visibility')}</p>
                  {restrictFreeRoom ? (
                    <>
                      <div className="border-primary bg-primary/10 text-primary rounded-xl border px-4 py-2 text-center text-sm font-medium">
                        {t('publicEmoji')}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('freeRoomPublicOnly')}
                      </p>
                    </>
                  ) : (
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
                          {v === 'Y' ? t('publicEmoji') : t('privateEmoji')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">{t('maxMembers')}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {([10, 30, 50, 100] as Capacity[]).map((n) => {
                      const locked = restrictFreeRoom && n !== FREE_ROOM_MAX
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            if (!locked) setMaxMbr(n)
                          }}
                          disabled={locked}
                          className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                            maxMbr === n
                              ? 'border-primary bg-primary/10 text-primary'
                              : locked
                                ? 'cursor-not-allowed opacity-40'
                                : 'hover:bg-muted'
                          }`}
                        >
                          {t('capacityN', { n })}
                        </button>
                      )
                    })}
                  </div>
                  {restrictFreeRoom && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('freeRoomCapacityLimit')}
                    </p>
                  )}
                </div>

                {roomType === 'G' ? (
                  isFreeRoom7d ? (
                    <div className="bg-muted/40 rounded-xl border p-3 text-sm">
                      <p className="font-medium">{t('freeRoom7dValidity')}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('freeRoom7dHint')}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        {t('validity')}
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {(
                          [
                            { days: 0 as ExprDays, label: t('unlimited') },
                            {
                              days: 1 as ExprDays,
                              label: t('validityDays', { n: 1 }),
                            },
                            {
                              days: 3 as ExprDays,
                              label: t('validityDays', { n: 3 }),
                            },
                            {
                              days: 7 as ExprDays,
                              label: t('validityDays', { n: 7 }),
                            },
                            {
                              days: 30 as ExprDays,
                              label: t('validityDays', { n: 30 }),
                            },
                          ] as { days: ExprDays; label: string }[]
                        ).map(({ days, label }) => (
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
                  )
                ) : (
                  <>
                    {/* TASK-063: 이벤트방 — 입장료 + 종료 시각 */}
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        {t('entryFee')}
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
                            {fee === 0
                              ? t('freeEntry')
                              : isPi
                                ? `${fee} π`
                                : t('entryFeeBean', { amount: fee * 100 })}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        {t('endTimeLabel')}
                      </label>
                      <input
                        type="datetime-local"
                        value={eventEndDtm}
                        min={localDtmNow()}
                        onChange={(e) => setEventEndDtm(e.target.value)}
                        className="bg-background focus:ring-ring w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                      />
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t('endTimeHint')}
                      </p>
                    </div>
                  </>
                )}

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
                      disabled={
                        isBusy ||
                        !eventEndDtm ||
                        new Date(eventEndDtm) <= new Date()
                      }
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
