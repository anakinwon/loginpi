'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { toast } from 'sonner'
import { usePiAuth } from '@/components/pi-auth-provider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeSelector, type ThemeRow } from './theme-selector'

type Step = 1 | 2 | 3 | 4
type PayStatus = 'idle' | 'approving' | 'waiting' | 'completing' | 'done' | 'error' | 'cancelled'
type Capacity = 10 | 30 | 50 | 100

const PAY_STATUS_MSG: Partial<Record<PayStatus, string>> = {
  approving: '승인 중…',
  waiting: '지갑 확인 중…',
  completing: '방 생성 중…',
}

function StepBar({ current }: { current: Step }) {
  return (
    <div className='flex items-center gap-1.5'>
      {([1, 2, 3, 4] as Step[]).map(s => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors ${s <= current ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  )
}

export function GroupRoomCreator() {
  const router = useRouter()
  const { isInPiBrowser } = usePiAuth()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [selectedTheme, setSelectedTheme] = useState<ThemeRow | null>(null)
  const [roomNm, setRoomNm] = useState('')
  const [roomDesc, setRoomDesc] = useState('')
  const [isPublic, setIsPublic] = useState<'Y' | 'N'>('Y')
  const [maxMbr, setMaxMbr] = useState<Capacity>(50)
  const [payStatus, setPayStatus] = useState<PayStatus>('idle')
  const [payError, setPayError] = useState<string | null>(null)

  // 다이얼로그 열릴 때 마다 초기화
  useEffect(() => {
    if (open) {
      setStep(1)
      setSelectedTheme(null)
      setRoomNm('')
      setRoomDesc('')
      setIsPublic('Y')
      setMaxMbr(50)
      setPayStatus('idle')
      setPayError(null)
    }
  }, [open])

  const isPremium = selectedTheme?.theme_tp_cd === 'PREMIUM'
  // BASIC: 0.1 π, PREMIUM: 0.3 π (방생성 0.1 + 테마 0.2)
  const payAmount = isPremium ? 0.3 : 0.1
  const isBusy = payStatus === 'approving' || payStatus === 'waiting' || payStatus === 'completing'

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
        memo: `채팅방 생성: ${roomNm}`,
        metadata: {
          type: 'CHAT_ROOM_CREATE',
          theme_cd: selectedTheme.theme_cd,
          theme_tp_cd: selectedTheme.theme_tp_cd,
          room_nm: roomNm,
          room_desc: roomDesc || null,
          is_public_yn: isPublic,
          max_mbr_cnt: maxMbr,
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
            toast.success('채팅방이 생성되었습니다!')
            if (data.room?.room_id) {
              router.push(`/chat/${data.room.room_id}`)
            }
          } catch (e) {
            setPayStatus('error')
            setPayError(e instanceof Error ? e.message : '완료 오류')
          }
        },

        onCancel: () => setPayStatus('cancelled'),
        onError: (e) => { setPayStatus('error'); setPayError(e.message) },
      },
    )
  }, [selectedTheme, payAmount, roomNm, roomDesc, isPublic, maxMbr, router])

  const retryPayment = useCallback(() => {
    setPayStatus('idle')
    setPayError(null)
  }, [])

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'
      >
        + 채팅방 만들기
      </button>

      <Dialog open={open} onOpenChange={setOpen}>

      <DialogContent className='sm:max-w-lg' showCloseButton={!isBusy}>
        <DialogHeader>
          <DialogTitle>그룹 채팅방 만들기</DialogTitle>
        </DialogHeader>

        <div className='flex flex-col gap-5'>
          <StepBar current={step} />

          {/* Step 1: 테마 선택 */}
          {step === 1 && (
            <div>
              <p className='mb-3 text-sm text-muted-foreground'>채팅방의 테마를 선택하세요</p>
              <div className='max-h-72 overflow-y-auto pr-1'>
                <ThemeSelector selectedThemeCode={selectedTheme?.theme_cd ?? null} onSelect={handleThemeSelect} />
              </div>
            </div>
          )}

          {/* Step 2: 채팅방 정보 */}
          {step === 2 && selectedTheme && (
            <div className='space-y-4'>
              <div className='flex items-center gap-2 text-sm'>
                <span className='text-2xl'>{selectedTheme.theme_emoji}</span>
                <span className='font-medium'>{selectedTheme.theme_nm} 테마</span>
                {isPremium && (
                  <span className='rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'>
                    PREMIUM
                  </span>
                )}
              </div>

              <div>
                <label className='mb-1 block text-sm font-medium'>채팅방 이름 *</label>
                <input
                  type='text'
                  value={roomNm}
                  onChange={e => setRoomNm(e.target.value)}
                  placeholder={`${selectedTheme.theme_emoji} ${selectedTheme.theme_nm} 모임`}
                  maxLength={50}
                  className='w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
                />
              </div>

              <div>
                <label className='mb-1 block text-sm font-medium'>채팅방 소개 (선택)</label>
                <textarea
                  value={roomDesc}
                  onChange={e => setRoomDesc(e.target.value)}
                  placeholder='채팅방에 대해 소개해 주세요'
                  rows={3}
                  maxLength={200}
                  className='w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring'
                />
              </div>

              <div className='flex gap-2'>
                <button onClick={() => setStep(1)} className='flex-1 rounded-xl border px-4 py-2 text-sm hover:bg-muted'>
                  이전
                </button>
                <button
                  onClick={() => { if (roomNm.trim()) setStep(3) }}
                  disabled={!roomNm.trim()}
                  className='flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40'
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 공개 설정 + 정원 */}
          {step === 3 && (
            <div className='space-y-4'>
              <div>
                <p className='mb-2 text-sm font-medium'>공개 여부</p>
                <div className='flex gap-2'>
                  {(['Y', 'N'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setIsPublic(v)}
                      className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        isPublic === v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                      }`}
                    >
                      {v === 'Y' ? '🌐 공개' : '🔒 비공개'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className='mb-2 text-sm font-medium'>최대 정원</p>
                <div className='grid grid-cols-4 gap-2'>
                  {([10, 30, 50, 100] as Capacity[]).map(n => (
                    <button
                      key={n}
                      onClick={() => setMaxMbr(n)}
                      className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                        maxMbr === n ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                      }`}
                    >
                      {n}명
                    </button>
                  ))}
                </div>
              </div>

              <div className='flex gap-2'>
                <button onClick={() => setStep(2)} className='flex-1 rounded-xl border px-4 py-2 text-sm hover:bg-muted'>
                  이전
                </button>
                <button
                  onClick={() => setStep(4)}
                  className='flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground'
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* Step 4: 결제 확인 */}
          {step === 4 && selectedTheme && (
            <div className='space-y-4'>
              <div className='space-y-2 rounded-xl border bg-muted/40 p-4 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>테마</span>
                  <span>{selectedTheme.theme_emoji} {selectedTheme.theme_nm}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>채팅방 이름</span>
                  <span className='max-w-[60%] truncate text-right font-medium'>{roomNm}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>공개 여부</span>
                  <span>{isPublic === 'Y' ? '공개' : '비공개'}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>최대 정원</span>
                  <span>{maxMbr}명</span>
                </div>
                <div className='border-t pt-2'>
                  {isPremium && (
                    <div className='flex justify-between text-amber-600 dark:text-amber-400'>
                      <span>PREMIUM 테마 단건</span>
                      <span>0.2 π</span>
                    </div>
                  )}
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>방 생성</span>
                    <span>0.1 π</span>
                  </div>
                  <div className='mt-1.5 flex justify-between border-t pt-1.5 font-semibold'>
                    <span>합계</span>
                    <span className='text-primary'>{payAmount} π</span>
                  </div>
                </div>
              </div>

              {!isInPiBrowser && (
                <p className='rounded-xl bg-yellow-50 px-4 py-2.5 text-center text-xs text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'>
                  Pi Browser에서만 결제가 가능합니다
                </p>
              )}

              {payStatus === 'waiting' && (
                <p className='text-center text-xs text-muted-foreground'>
                  Pi 지갑 화면에서 결제를 승인해 주세요.
                </p>
              )}

              {payError && (
                <p className='text-center text-xs text-destructive'>{payError}</p>
              )}

              <div className='flex gap-2'>
                <button
                  onClick={() => setStep(3)}
                  disabled={isBusy}
                  className='flex-1 rounded-xl border px-4 py-2 text-sm disabled:opacity-40 hover:bg-muted'
                >
                  이전
                </button>
                <button
                  onClick={payStatus === 'cancelled' || payStatus === 'error' ? retryPayment : startPayment}
                  disabled={isBusy || !isInPiBrowser}
                  className='flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40'
                >
                  {isBusy
                    ? PAY_STATUS_MSG[payStatus] ?? '처리 중…'
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
