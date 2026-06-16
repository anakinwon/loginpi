'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { getCurrentPosition } from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'
import {
  ProductImageUploader,
  type ProductImage,
} from '@/components/store/product-image-uploader'

interface ItemFormProps {
  serverAuthed?: boolean // 서버 getSessionUser() 확인 결과 (Google 쿠키 로그인 포함)
  itemId?: string // 지정 시 수정 모드 — 기존 값 로드 후 PATCH
  defaultShopId?: string // 신규 등록 시 소속 매장 미리 선택 (?shop= 쿼리)
}

// GET /api/store/categories 트리 노드 (2단계)
interface CtgrNode {
  ctgr_id: string
  ctgr_nm: string
  children: CtgrNode[]
}

// GET /api/store/shops 내 매장 (상품 소속 매장 선택용 — FR-06 N:1)
interface ShopOption {
  shop_id: string
  shop_nm: string
}

// 상품 등록·수정 폼 (SCR-04) — 이미지는 URL 입력 (Storage 업로드는 후속 TASK)
export function StoreItemForm({
  serverAuthed = false,
  itemId,
  defaultShopId,
}: ItemFormProps) {
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
  const [images, setImages] = useState<ProductImage[]>([])
  const [ctgrId, setCtgrId] = useState('')
  const [ctgrTree, setCtgrTree] = useState<CtgrNode[]>([])
  // 신규 등록 시 ?shop= 쿼리로 소속 매장 미리 선택 (수정 모드는 기존 값 로드가 덮어씀)
  const [shopId, setShopId] = useState(itemId ? '' : (defaultShopId ?? ''))
  const [myShops, setMyShops] = useState<ShopOption[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingItem, setLoadingItem] = useState(editMode)

  // 판매 위치 (LBS) — 동의자만 GPS 수집해 상품에 저장 (Rule LBS-01)
  const [lbsConsent, setLbsConsent] = useState<'Y' | 'N' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const autoLocTried = useRef(false) // 마운트 시 위치 자동수집 1회 가드 (중복 GPS 호출 방지)

  // 현재 위치 수집 (동의자 전용) — 실패 원인별 메시지 안내
  const captureLocation = useCallback(() => {
    setLocLoading(true)
    getCurrentPosition()
      .then((p) => {
        setLat(p.lat)
        setLng(p.lng)
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLocLoading(false))
  }, [])

  // 카테고리 트리 로드 (공개 API — 로그인 불필요)
  useEffect(() => {
    fetch('/api/store/categories')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { categories?: CtgrNode[] } | null) => {
        if (d?.categories) setCtgrTree(d.categories)
      })
      .catch(() => {})
  }, [])

  // 내 매장 목록 로드 (상품 소속 매장 선택 — 매장 없으면 드롭다운 숨김)
  useEffect(() => {
    if (!authed) return
    piFetch('/api/store/shops')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { shops?: ShopOption[] } | null) => {
        if (d?.shops) setMyShops(d.shops)
      })
      .catch(() => {})
  }, [authed])

  // 심층방어: URL ?shop= 등으로 들어온 prefill이 내 매장이 아니면 떨궈낸다
  // (서버가 최종 차단하지만, 잘못된 선택을 UI에서 미리 제거 — 수정 모드는 기존 값 유지)
  useEffect(() => {
    if (editMode || !shopId || myShops.length === 0) return
    if (!myShops.some((s) => s.shop_id === shopId)) setShopId('')
  }, [myShops, shopId, editMode])

  // 마운트 시 LBS 동의 여부 확인 + 동의자는 화면 로딩과 동시에 현재 위치 자동 수집 (등록 모드, 1회)
  useEffect(() => {
    if (!authed) return
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        const consented = d?.consent_yn === 'Y'
        setLbsConsent(consented ? 'Y' : 'N')
        // 동의자 + 등록 모드: 마운트 직후 GPS 자동 수집 (미동의자는 Rule LBS-01에 따라 자동 수집 금지)
        if (consented && !editMode && !autoLocTried.current) {
          autoLocTried.current = true
          captureLocation()
        }
      })
      .catch(() => setLbsConsent('N'))
  }, [authed, editMode, captureLocation])

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
            ctgr_id: string | null
            shop_id: string | null
            reg_qty: number
            thumbnail_url: string | null
            images?: {
              img_url: string
              sort_ord: number
              thumbnail_yn: string
            }[]
          }
        }
        setItemNm(item.item_nm)
        setItemDesc(item.item_desc ?? '')
        setPricePi(String(item.price_pi))
        setCndCd(item.item_cnd_cd)
        setCtgrId(item.ctgr_id ?? '')
        setShopId(item.shop_id ?? '')
        setUnlimited(item.reg_qty === 9999)
        setRegQty(item.reg_qty === 9999 ? '1' : String(item.reg_qty))
        // 기존 이미지 복원 — 첫 장 썸네일은 목록용 thumbnail_url 유지(나머지는 원본 미리보기)
        const imgs = (item.images ?? [])
          .slice()
          .sort((a, b) => a.sort_ord - b.sort_ord)
          .map((im, i) => ({
            url: im.img_url,
            thumbUrl: i === 0 ? (item.thumbnail_url ?? im.img_url) : im.img_url,
          }))
        setImages(imgs)
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
    // 게시(OPEN)는 판매 위치 필수 — 현재 위치 등록 후에만 게시 가능 (임시저장은 위치 없이 허용)
    if (status === 'OPEN' && !editMode && (lat === null || lng === null)) {
      toast.error('현재 위치를 등록해야 게시할 수 있습니다')
      return
    }

    const payload = {
      item_nm: itemNm.trim(),
      item_desc: itemDesc.trim() || undefined,
      price_pi: price,
      item_cnd_cd: cndCd,
      reg_qty: qty,
      // 이미지 — 등록: 있을 때만 전송 / 수정: 항상 전송(빈 배열=전체 삭제).
      // thumbnail_url = 첫 장(대표)의 목록용 썸네일
      ...(editMode
        ? {
            images: images.map((im) => im.url),
            thumbnail_url: images[0]?.thumbUrl ?? null,
          }
        : images.length > 0
          ? {
              images: images.map((im) => im.url),
              thumbnail_url: images[0].thumbUrl,
            }
          : {}),
      ...(status ? { item_st_cd: status } : {}),
      // 카테고리 — 등록: 빈값이면 키 생략(uuid optional), 수정: 빈값은 null(미분류로 변경)
      ...(editMode
        ? { ctgr_id: ctgrId || null }
        : ctgrId
          ? { ctgr_id: ctgrId }
          : {}),
      // 소속 매장 — 카테고리와 동일 규칙(등록: 키 생략, 수정: null=매장 없음)
      ...(editMode
        ? { shop_id: shopId || null }
        : shopId
          ? { shop_id: shopId }
          : {}),
      // 판매 위치 — 등록 모드에서 동의자가 위치를 잡은 경우만 전송
      ...(!editMode && lat !== null && lng !== null ? { lat, lng } : {}),
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

      <div className="space-y-1.5">
        <Label htmlFor="item-ctgr">{t('form.category')}</Label>
        <select
          id="item-ctgr"
          value={ctgrId}
          onChange={(e) => setCtgrId(e.target.value)}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="">{t('form.categoryNone')}</option>
          {ctgrTree.map((p) => (
            <optgroup key={p.ctgr_id} label={p.ctgr_nm}>
              <option value={p.ctgr_id}>
                {p.ctgr_nm} · {t('form.categoryAll')}
              </option>
              {p.children.map((c) => (
                <option key={c.ctgr_id} value={c.ctgr_id}>
                  {c.ctgr_nm}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* 소속 매장 — 등록된 매장이 있을 때만 노출 (FR-06 N:1, 선택) */}
      {myShops.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="item-shop">{t('form.shop')}</Label>
          <select
            id="item-shop"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">{t('form.shopNone')}</option>
            {myShops.map((s) => (
              <option key={s.shop_id} value={s.shop_id}>
                {s.shop_nm}
              </option>
            ))}
          </select>
        </div>
      )}

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
        <Label>상품 이미지</Label>
        <ProductImageUploader images={images} onChange={setImages} max={3} />
      </div>

      {/* 판매 위치 — 등록 모드 전용. 동의자: GPS 수집, 미동의자: 동의 다이얼로그 (Rule LBS-01) */}
      {!editMode && (
        <div className="space-y-1.5">
          <Label>📍 판매 위치</Label>
          {lat !== null && lng !== null ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="bg-muted rounded px-2 py-1 text-xs">
                위치 등록됨 ({lat.toFixed(4)}, {lng.toFixed(4)})
              </span>
              <button
                type="button"
                onClick={() => {
                  setLat(null)
                  setLng(null)
                }}
                className="text-destructive text-xs underline"
              >
                해제
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={locLoading || lbsConsent === null}
              onClick={() =>
                lbsConsent === 'Y' ? captureLocation() : setConsentOpen(true)
              }
            >
              {locLoading ? '📍 위치 확인 중…' : '📍 현재 위치 등록'}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">
            위치를 등록하면 구매자 목록에 거리로 표시되고 주변순 검색에
            노출됩니다. (위치 서비스 동의자만)
          </p>
          {lat === null && (
            <p className="text-destructive text-xs">
              게시하려면 현재 위치 등록이 필요합니다. (임시저장은 위치 없이
              가능)
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        {editMode ? (
          <Button onClick={() => submit()} disabled={saving} className="flex-1">
            {saving ? t('saving') : t('form.saveEdit')}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => submit('OPEN')}
              disabled={saving || lat === null || lng === null}
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

      {/* 위치 서비스 동의 다이얼로그 — 미동의 판매자가 위치 등록 클릭 시 */}
      <LbsConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsented={() => {
          setLbsConsent('Y')
          captureLocation()
        }}
      />
    </div>
  )
}
