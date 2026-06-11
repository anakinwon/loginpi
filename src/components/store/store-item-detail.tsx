'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'

interface ItemImage {
  img_id: string
  img_url: string
}

interface ItemDetail {
  item_id: string
  seller_id: string
  item_nm: string
  item_desc: string | null
  price_pi: number
  item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
  item_st_cd: string
  stock_qty: number
  reg_qty: number
  view_cnt: number
  thumbnail_url: string | null
  images: ItemImage[]
  shop: { shop_nm: string; shop_type_cd: string; addr: string | null } | null
}

interface OrderPrep {
  order: { order_id: string }
  amount: number
  memo: string
  metadata: Record<string, unknown>
}

export function StoreItemDetail({ itemId }: { itemId: string }) {
  const t = useTranslations('store')
  const router = useRouter()
  const { user } = usePiAuth()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [activeImg, setActiveImg] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await piFetch(`/api/store/items/${itemId}`)
      if (!res.ok) {
        setState('notfound')
        return
      }
      const data = (await res.json()) as { item: ItemDetail }
      setItem(data.item)
      setActiveImg(data.item.thumbnail_url ?? data.item.images[0]?.img_url ?? null)
      setState('ready')
    })()
  }, [itemId])

  // 결제 중단·실패 시 주문 취소 → 선점된 재고 복원
  async function rollbackOrder(orderId: string) {
    await piFetch(`/api/store/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '결제 미완료 (사용자 취소 또는 오류)' }),
    })
  }

  async function buy() {
    if (!user) {
      toast.error(t('loginRequired'))
      return
    }
    if (!window.Pi) {
      toast.error(t('piBrowserOnly'))
      return
    }
    setBuying(true)
    try {
      const res = await piFetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      })
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string }
        throw new Error(error ?? t('buyFail'))
      }
      const prep = (await res.json()) as OrderPrep
      const orderId = prep.order.order_id

      window.Pi.createPayment(
        { amount: prep.amount, memo: prep.memo, metadata: prep.metadata },
        {
          onReadyForServerApproval: async paymentId => {
            await fetch('/api/payments/approve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId }),
            })
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            const r = await fetch('/api/payments/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId, txid }),
            })
            setBuying(false)
            if (r.ok) {
              toast.success(t('buySuccess'))
              router.push('/store/my/orders')
            } else {
              toast.error(t('buyFail'))
            }
          },
          onCancel: () => {
            void rollbackOrder(orderId)
            setBuying(false)
          },
          onError: e => {
            void rollbackOrder(orderId)
            setBuying(false)
            toast.error(e.message)
          },
        },
      )
    } catch (e) {
      setBuying(false)
      toast.error(e instanceof Error ? e.message : t('buyFail'))
    }
  }

  if (state === 'loading') {
    return <p className='text-muted-foreground py-16 text-center text-sm'>{t('loading')}</p>
  }
  if (state === 'notfound' || !item) {
    return <p className='text-muted-foreground py-16 text-center text-sm'>{t('itemNotFound')}</p>
  }

  const soldOut = item.item_st_cd === 'SOLD' || item.stock_qty <= 0
  const isMine = user?.userId === item.seller_id
  const gallery = item.images.length > 0
    ? item.images.map(i => i.img_url)
    : item.thumbnail_url ? [item.thumbnail_url] : []

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {/* 이미지 갤러리 */}
      <div className='space-y-2'>
        <div className='bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg'>
          {activeImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeImg} alt={item.item_nm} className='h-full w-full object-cover' />
          ) : (
            <span className='text-6xl'>🛒</span>
          )}
        </div>
        {gallery.length > 1 && (
          <div className='flex gap-2 overflow-x-auto'>
            {gallery.map(url => (
              <button
                key={url}
                onClick={() => setActiveImg(url)}
                className={`size-16 shrink-0 overflow-hidden rounded border-2 ${activeImg === url ? 'border-primary' : 'border-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt='' className='h-full w-full object-cover' />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 상품 정보 */}
      <div className='space-y-4'>
        <div>
          <h1 className='text-xl font-bold'>{item.item_nm}</h1>
          <p className='mt-2 text-2xl font-bold'>{Number(item.price_pi)} π</p>
        </div>

        <div className='text-muted-foreground flex flex-wrap gap-2 text-sm'>
          <span className='bg-muted rounded-full px-2.5 py-0.5'>{t(`cnd.${item.item_cnd_cd}`)}</span>
          {item.reg_qty !== 9999 && (
            <span className='bg-muted rounded-full px-2.5 py-0.5'>{t('stockLeft', { count: item.stock_qty })}</span>
          )}
          <span className='bg-muted rounded-full px-2.5 py-0.5'>{t('viewCount', { count: item.view_cnt })}</span>
        </div>

        {item.item_desc && (
          <p className='text-sm whitespace-pre-wrap'>{item.item_desc}</p>
        )}

        {item.shop && (
          <div className='rounded-lg border p-3 text-sm'>
            <p className='font-medium'>🏪 {item.shop.shop_nm}</p>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t(`shopType.${item.shop.shop_type_cd}`)}
              {item.shop.addr && ` · ${item.shop.addr}`}
            </p>
          </div>
        )}

        <div className='pt-2'>
          {isMine ? (
            <p className='text-muted-foreground text-sm'>{t('myOwnItem')}</p>
          ) : (
            <Button onClick={buy} disabled={soldOut || buying} className='w-full' size='lg'>
              {soldOut ? t('soldOut') : buying ? t('buying') : t('buyEscrow')}
            </Button>
          )}
          <p className='text-muted-foreground mt-2 text-center text-xs'>{t('escrowNotice')}</p>
        </div>
      </div>
    </div>
  )
}
