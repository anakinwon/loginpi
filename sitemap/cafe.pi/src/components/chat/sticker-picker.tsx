'use client'
import { useEffect, useState, useCallback, Fragment } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { InlinePurchasePrompt } from './inline-purchase-prompt'
import { CustomStickerCreator } from './custom-sticker-creator'
import { StickerImg } from './sticker-img'

interface Sticker {
  stkr_id: string
  stkr_nm: string
  stkr_url: string
}

interface OwnedPack {
  pack_id: string
  pack_nm: string
  stickers: Sticker[]
  is_custom?: boolean
}

interface StorePack {
  pack_id: string
  pack_nm: string
  price_bean: number
  preview_stickers: Sticker[]
}

interface StickerPickerProps {
  onSelect: (stkrId: string, stkrUrl: string) => void
  onClose: () => void
  // 미리보기 대기 중인 스티커 — 하이라이트 + "한 번 더 누르면 전송" 안내
  selectedId?: string | null
}

export function StickerPicker({
  onSelect,
  onClose,
  selectedId = null,
}: StickerPickerProps) {
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  const [ownedPacks, setOwnedPacks] = useState<OwnedPack[]>([])
  const [storePacks, setStorePacks] = useState<StorePack[]>([])
  const [activePackId, setActivePackId] = useState<string | null>(null)
  const [showStore, setShowStore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [showSubscribePrompt, setShowSubscribePrompt] = useState(false)
  // TASK-074: 커스텀 스티커 제작 다이얼로그 (Business — 권한은 API 검증)
  const [showCreator, setShowCreator] = useState(false)

  const loadPacks = useCallback(async () => {
    const res = await piFetch('/api/stickers/packs')
    if (!res.ok) throw new Error('load_failed')
    return res.json() as Promise<{
      ownedPacks: OwnedPack[]
      storePacks: StorePack[]
    }>
  }, [])

  useEffect(() => {
    loadPacks()
      .then((d) => {
        setOwnedPacks(d.ownedPacks)
        setStorePacks(d.storePacks)
        if (d.ownedPacks.length > 0) setActivePackId(d.ownedPacks[0].pack_id)
        else setShowStore(true)
      })
      .catch(() => toast.error(t('sticker.loadFail')))
      .finally(() => setLoading(false))
  }, [loadPacks])

  // PI 모드 스티커팩 — 서버가 내려준 pay로 Pi 직결제. 소유권은 complete가 부여.
  const startStickerPiPayment = useCallback(
    (
      pay: { amount: number; memo: string; metadata: Record<string, unknown> },
      packId: string,
      packNm: string,
    ) => {
      if (typeof window === 'undefined' || !window.Pi) {
        toast.error(t('sticker.piBrowserPay'))
        setBuying(null)
        return
      }
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
            } catch {
              toast.error(t('sticker.buyFail'))
              setBuying(null)
            }
          },
          onReadyForServerCompletion: async (
            paymentId: string,
            txid: string,
          ) => {
            try {
              const r = await piFetch('/api/payments/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentId, txid }),
              })
              if (!r.ok) throw new Error()
              toast.success(t('sticker.boughtPlain', { pack: packNm }))
              const updated = await loadPacks().catch(() => null)
              if (updated) {
                setOwnedPacks(updated.ownedPacks)
                setStorePacks(updated.storePacks)
                setActivePackId(packId)
                setShowStore(false)
              }
            } catch {
              toast.error(t('sticker.buyProcessFail'))
            } finally {
              setBuying(null)
            }
          },
          onCancel: () => setBuying(null),
          onError: (e: Error) => {
            toast.error(e?.message ?? t('sticker.buyError'))
            setBuying(null)
          },
        },
      )
    },
    [loadPacks, t],
  )

  const buyPack = useCallback(
    async (packId: string, packNm: string) => {
      setBuying(packId)
      let piHandoff = false
      try {
        const res = await piFetch(`/api/stickers/packs/${packId}/buy`, {
          method: 'POST',
        })
        const data = (await res.json()) as {
          ok?: boolean
          error?: string
          requiresBean?: boolean
          feeBean?: number
          mode?: string
          pay?: {
            amount: number
            memo: string
            metadata: Record<string, unknown>
          }
        }

        // PI 모드 — 서버가 Pi 직결제 요구. createPayment로 핸드오프.
        if (data.mode === 'PI' && data.pay) {
          piHandoff = true
          startStickerPiPayment(data.pay, packId, packNm)
          return
        }

        if (!res.ok) {
          if (data.requiresBean) {
            toast.error(
              t('sticker.insufficientBean', { fee: data.feeBean ?? 0 }),
            )
          } else {
            toast.error(data.error ?? t('sticker.buyFail'))
          }
          return
        }

        toast.success(t('sticker.boughtPlain', { pack: packNm }))
        const updated = await loadPacks().catch(() => null)
        if (updated) {
          setOwnedPacks(updated.ownedPacks)
          setStorePacks(updated.storePacks)
          setActivePackId(packId)
          setShowStore(false)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('sticker.buyError'))
      } finally {
        if (!piHandoff) setBuying(null)
      }
    },
    [loadPacks, startStickerPiPayment, t],
  )

  const activePack = ownedPacks.find((p) => p.pack_id === activePackId)

  return (
    <div className="bg-popover absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border shadow-xl">
      {/* 팩 탭 */}
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 pt-2">
        {ownedPacks.map((pack, idx) => {
          const active = !showStore && activePackId === pack.pack_id
          // 커스텀(맨 앞 그룹)과 일반 팩 경계에 세로 구분선 — 가독성
          const showDivider =
            !pack.is_custom && idx > 0 && ownedPacks[idx - 1].is_custom
          return (
            <Fragment key={pack.pack_id}>
              {showDivider && (
                <span
                  className="bg-border mx-0.5 h-4 w-px shrink-0 self-center"
                  aria-hidden
                />
              )}
              <button
                onClick={() => {
                  setActivePackId(pack.pack_id)
                  setShowStore(false)
                }}
                title={pack.is_custom ? t('sticker.myCustomPack') : undefined}
                className={`shrink-0 rounded-t-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : pack.is_custom
                      ? 'text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {pack.is_custom ? `🎨 ${pack.pack_nm}` : pack.pack_nm}
              </button>
            </Fragment>
          )
        })}
        {storePacks.length > 0 && (
          <button
            onClick={() => setShowStore(true)}
            className={`ml-auto shrink-0 rounded-t-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              showStore
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('sticker.store')}
          </button>
        )}
        <button
          onClick={() => setShowCreator(true)}
          className="text-muted-foreground hover:text-foreground shrink-0 px-1 py-1.5 text-xs"
          aria-label={t('sticker.createCustom')}
          title={t('sticker.createCustomBusiness')}
        >
          🎨
        </button>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 px-1 py-1 text-xs"
          aria-label={tc('close')}
        >
          ✕
        </button>
      </div>

      {/* 컨텐츠 */}
      <div className="h-52 overflow-y-auto p-2">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {tc('fetching')}
          </div>
        ) : showStore ? (
          <StoreView
            storePacks={storePacks}
            buying={buying}
            onBuy={buyPack}
            onSubscribeBanner={() => setShowSubscribePrompt(true)}
          />
        ) : activePack ? (
          <>
            {selectedId && (
              <p className="text-primary mb-1 text-center text-[11px] font-medium">
                {t('sticker.pressAgainHint')}
              </p>
            )}
            <div className="grid grid-cols-4 gap-1">
              {activePack.stickers.map((s) => (
                <button
                  key={s.stkr_id}
                  onClick={() => onSelect(s.stkr_id, s.stkr_url)}
                  className={`aspect-square rounded-lg p-0.5 transition-colors ${
                    selectedId === s.stkr_id
                      ? 'ring-primary bg-muted ring-2'
                      : 'hover:bg-muted'
                  }`}
                  title={
                    selectedId === s.stkr_id
                      ? t('sticker.pressAgainToSend')
                      : s.stkr_nm
                  }
                >
                  <StickerImg
                    src={s.stkr_url}
                    alt={s.stkr_nm}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
            <span>{t('sticker.noOwned')}</span>
            {storePacks.length > 0 && (
              <button
                onClick={() => setShowStore(true)}
                className="text-primary text-xs underline"
              >
                {t('sticker.browseStore')}
              </button>
            )}
          </div>
        )}
      </div>
      {/* TASK-074: 커스텀 스티커팩 제작 */}
      {showCreator && (
        <CustomStickerCreator
          onCreated={() => {
            setShowCreator(false)
            loadPacks()
              .then((d) => {
                setOwnedPacks(d.ownedPacks)
                setStorePacks(d.storePacks)
              })
              .catch(() => {})
          }}
          onClose={() => setShowCreator(false)}
        />
      )}
      <InlinePurchasePrompt
        isOpen={showSubscribePrompt}
        featureName={t('sticker.subscrFeature')}
        description={t('sticker.subscrDesc')}
        onClose={() => setShowSubscribePrompt(false)}
      />
    </div>
  )
}

function StoreView({
  storePacks,
  buying,
  onBuy,
  onSubscribeBanner,
}: {
  storePacks: StorePack[]
  buying: string | null
  onBuy: (packId: string, packNm: string) => void
  onSubscribeBanner?: () => void
}) {
  const t = useTranslations('chat')
  if (storePacks.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {t('sticker.storeEmpty')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {storePacks.map((pack) => (
        <div key={pack.pack_id} className="rounded-xl border p-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{pack.pack_nm}</span>
            <button
              onClick={() => onBuy(pack.pack_id, pack.pack_nm)}
              disabled={buying === pack.pack_id}
              className="bg-primary text-primary-foreground rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50"
            >
              {buying === pack.pack_id
                ? t('sticker.buyingShort')
                : `${pack.price_bean} Bean`}
            </button>
          </div>
          {pack.preview_stickers.length > 0 && (
            <div className="mt-1.5 flex gap-1">
              {pack.preview_stickers.map((s) => (
                <StickerImg
                  key={s.stkr_id}
                  src={s.stkr_url}
                  alt={s.stkr_nm}
                  className="h-10 w-10 rounded-md object-contain"
                />
              ))}
            </div>
          )}
        </div>
      ))}
      {onSubscribeBanner && (
        <button
          onClick={onSubscribeBanner}
          className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 mt-1 w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors"
        >
          {t('sticker.subscribeBanner')}
        </button>
      )}
    </div>
  )
}
