'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ItemFormProps {
  serverAuthed?: boolean // 서버 getSessionUser() 확인 결과 (Google 쿠키 로그인 포함)
  itemId?: string // 지정 시 수정 모드 — 기존 값 로드 후 PATCH
}

// 상품 등록·수정 폼 (SCR-04) — 이미지는 URL 입력 (Storage 업로드는 후속 TASK)
export function StoreItemForm({ serverAuthed = false, itemId }: ItemFormProps) {
  const t = useTranslations('store')
  const router = useRouter()
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user
  const editMode = !!itemId

  const [itemNm, setItemNm] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [pricePi, setPricePi] = useState('')
  const [cndCd, setCndCd] = useState<'NEW' | 'USED' | 'HANDMADE'>('USED')
  const [regQty, setRegQty] = useState('1')
  const [unlimited, setUnlimited] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingItem, setLoadingItem] = useState(editMode)

  // 수정 모드 — 기존 상품 값 로드
  useEffect(() => {
    if (!editMode || !authed) return
    void (async () => {
      const res = await piFetch(`/api/store/items/${itemId}`)
      if (res.ok) {
        const { item } = (await res.json()) as {
          item: {
            item_nm: string
            item_desc: string | null
            price_pi: number
            item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
            reg_qty: number
            thumbnail_url: string | null
          }
        }
        setItemNm(item.item_nm)
        setItemDesc(item.item_desc ?? '')
        setPricePi(String(item.price_pi))
        setCndCd(item.item_cnd_cd)
        setUnlimited(item.reg_qty === 9999)
        setRegQty(item.reg_qty === 9999 ? '1' : String(item.reg_qty))
        setThumbnailUrl(item.thumbnail_url ?? '')
      } else {
        toast.error(t('itemNotFound'))
      }
      setLoadingItem(false)
    })()
  }, [editMode, authed, itemId, t])

  if (!authed && isLoading) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }
  if (!authed) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loginRequired')}
      </p>
    )
  }
  if (loadingItem) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }

  async function submit(status?: 'DRAFT' | 'OPEN') {
    const price = Number(pricePi)
    const qty = unlimited ? 9999 : Number(regQty)
    if (!itemNm.trim() || !price || price <= 0) {
      toast.error(t('formInvalid'))
      return
    }
    if (!unlimited && (!Number.isInteger(qty) || qty < 1 || qty > 9998)) {
      toast.error(t('qtyInvalid'))
      return
    }

    const payload = {
      item_nm: itemNm.trim(),
      item_desc: itemDesc.trim() || undefined,
      price_pi: price,
      item_cnd_cd: cndCd,
      reg_qty: qty,
      thumbnail_url: thumbnailUrl.trim() || undefined,
      ...(status ? { item_st_cd: status } : {}),
    }

    setSaving(true)
    try {
      const res = await piFetch(
        editMode ? `/api/store/items/${itemId}` : '/api/store/items',
        {
          method: editMode ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (res.ok) {
        toast.success(
          editMode
            ? t('editSuccess')
            : status === 'OPEN'
              ? t('publishSuccess')
              : t('draftSuccess'),
        )
        router.push('/store/my/items')
      } else {
        const { error } = (await res.json()) as { error?: string }
        toast.error(error ?? t('saveFail'))
      }
    } catch {
      toast.error(t('saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="item-nm">{t('form.name')} *</Label>
        <Input
          id="item-nm"
          value={itemNm}
          onChange={(e) => setItemNm(e.target.value)}
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-desc">{t('form.desc')}</Label>
        <textarea
          id="item-desc"
          value={itemDesc}
          onChange={(e) => setItemDesc(e.target.value)}
          rows={5}
          maxLength={5000}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="item-price">{t('form.price')} (π) *</Label>
          <Input
            id="item-price"
            type="number"
            min="0.0000001"
            step="any"
            value={pricePi}
            onChange={(e) => setPricePi(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('form.cnd')}</Label>
          <div className="flex gap-1.5">
            {(['NEW', 'USED', 'HANDMADE'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCndCd(c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${cndCd === c ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t(`cnd.${c}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-qty">{t('form.qty')}</Label>
        <div className="flex items-center gap-3">
          <Input
            id="item-qty"
            type="number"
            min="1"
            max="9998"
            value={regQty}
            onChange={(e) => setRegQty(e.target.value)}
            disabled={unlimited}
            className="w-28"
          />
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
            />
            {t('form.unlimited')}
          </label>
        </div>
        <p className="text-muted-foreground text-xs">
          {t('form.unlimitedHint')}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-thumb">{t('form.thumbUrl')}</Label>
        <Input
          id="item-thumb"
          type="url"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://…"
        />
      </div>

      <div className="flex gap-2 pt-2">
        {editMode ? (
          <Button onClick={() => submit()} disabled={saving} className="flex-1">
            {saving ? t('saving') : t('form.saveEdit')}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => submit('OPEN')}
              disabled={saving}
              className="flex-1"
            >
              {saving ? t('saving') : t('form.publish')}
            </Button>
            <Button
              onClick={() => submit('DRAFT')}
              disabled={saving}
              variant="outline"
            >
              {t('form.saveDraft')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
