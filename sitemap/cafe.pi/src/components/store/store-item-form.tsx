'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter, Link } from '@/i18n/navigation'
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
import { defaultCcyForLocale } from '@/lib/format-ccy'
import { CurrencyCombo } from '@/components/store/currency-combo'

interface ItemFormProps {
  serverAuthed?: boolean // 서버 getSessionUser() 확인 결과 (Google 쿠키 로그인 포함)
  itemId?: string // 지정 시 수정 모드 — 기존 값 로드 후 PATCH
  defaultShopId?: string // 신규 등록 시 소속 매장 미리 선택 (?shop= 쿼리)
  // 등록 유형: p2p=중고직거래(매장 미연결) | offline=오프라인매장(매장 필수·자국통화 우선)
  mode?: 'p2p' | 'offline'
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
  mode = 'p2p',
}: ItemFormProps) {
  const t = useTranslations('store')
  const locale = useLocale()
  const router = useRouter()
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user
  const editMode = !!itemId

  const [itemNm, setItemNm] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  // 가격 — 통화 선택('PI'=Pi 직접입력, 그 외=자국통화) + 입력 금액. 자국통화는 견적으로 Pi 환산
  const [priceCcy, setPriceCcy] = useState<string>(() =>
    defaultCcyForLocale(locale),
  )
  const [priceInput, setPriceInput] = useState('')
  const [quotePi, setQuotePi] = useState<number | null>(null) // 환산된 Pi(자국통화 모드)
  const [quoting, setQuoting] = useState(false)
  const [quoteErr, setQuoteErr] = useState<string | null>(null)
  // 수정 모드에서 가격을 실제로 손댔는지 — 미변경 시 저장된 Pi가를 유지(불필요 재환산·환율 장애 차단 회피)
  const priceTouchedRef = useRef(false)
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
        // 동의자 + 등록 모드 + P2P: 마운트 직후 GPS 자동 수집 (offline 모드는 매장 좌표 상속으로 GPS 불필요)
        if (
          consented &&
          !editMode &&
          mode !== 'offline' &&
          !autoLocTried.current
        ) {
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
            ccy_cd: string | null
            ccy_amt: number | null
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
        // 가격 복원 — 자국통화로 등록됐으면 통화·금액 복원(Pi 환산은 quote 효과가 재계산),
        // 아니면 Pi 직접입력 모드. quotePi 시드로 변경 전까지 저장 Pi가 유지되게 한다
        if (item.ccy_cd) {
          setPriceCcy(item.ccy_cd)
          setPriceInput(item.ccy_amt != null ? String(item.ccy_amt) : '')
          setQuotePi(item.price_pi)
        } else {
          setPriceCcy('PI')
          setPriceInput(String(item.price_pi))
        }
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

  // 자국통화 → Pi 환산 견적 (디바운스 500ms). 'PI' 모드·빈 금액은 견적 없이 통과.
  // ⚠️ 등록시점 1회 환산 보조 — 견적 결과(quotePi)가 곧 저장될 Pi 정본가가 된다.
  useEffect(() => {
    if (priceCcy === 'PI') {
      setQuotePi(null)
      setQuoteErr(null)
      setQuoting(false)
      return
    }
    const amt = Number(priceInput)
    if (!amt || amt <= 0) {
      setQuotePi(null)
      setQuoteErr(null)
      setQuoting(false)
      return
    }
    // 수정 모드에서 가격 미변경이면 저장된 Pi가(시드)를 유지 — 자동 재환산하지 않음
    if (editMode && !priceTouchedRef.current) return
    setQuoting(true)
    setQuoteErr(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      piFetch(`/api/store/price-quote?ccy=${priceCcy}&amt=${amt}`, {
        signal: ctrl.signal,
      })
        .then(async (r) => {
          if (r.ok) {
            const q = (await r.json()) as { price_pi: number }
            setQuotePi(q.price_pi)
            setQuoteErr(null)
          } else {
            const { error } = (await r.json()) as { error?: string }
            setQuotePi(null)
            setQuoteErr(error ?? t('form.priceQuoteFail'))
          }
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError') return
          setQuotePi(null)
          setQuoteErr(t('form.priceQuoteFail'))
        })
        .finally(() => setQuoting(false))
    }, 500)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [priceCcy, priceInput, editMode, t])

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
    const fiatMode = priceCcy !== 'PI'
    // 정본 Pi가 — Pi 모드는 입력값 그대로, 자국통화 모드는 환산 견적(quotePi)
    const price = fiatMode ? (quotePi ?? 0) : Number(priceInput)
    const qty = unlimited ? 9999 : Number(regQty)
    if (!itemNm.trim() || !price || price <= 0) {
      toast.error(t('formInvalid'))
      return
    }
    // 오프라인매장 상품은 소속 매장 필수 (중고직거래는 매장 미연결)
    if (mode === 'offline' && !shopId) {
      toast.error(t('form.shopRequired'))
      return
    }
    // 자국통화 모드인데 환율 견적이 없으면(조회 실패·진행 중) 저장 차단 — Pi 직접입력 유도
    if (fiatMode && (quotePi == null || quoteErr || quoting)) {
      toast.error(quoteErr ?? t('form.priceQuoteRequired'))
      return
    }
    if (!unlimited && (!Number.isInteger(qty) || qty < 1 || qty > 9998)) {
      toast.error(t('qtyInvalid'))
      return
    }
    // 게시(OPEN)는 P2P 모드에서 판매 위치 필수 — offline 모드는 매장 좌표 자동 상속
    if (
      status === 'OPEN' &&
      !editMode &&
      mode !== 'offline' &&
      (lat === null || lng === null)
    ) {
      toast.error(t('locRequiredToPublish'))
      return
    }

    const payload = {
      item_nm: itemNm.trim(),
      item_desc: itemDesc.trim() || undefined,
      price_pi: price,
      // 자국통화 모드: 통화·금액 스냅샷 동봉 / 수정 중 Pi 모드 전환: null로 통화 해제
      ...(fiatMode
        ? { ccy_cd: priceCcy, ccy_amt: Number(priceInput) }
        : editMode
          ? { ccy_cd: null, ccy_amt: null }
          : {}),
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
      // 판매 위치 — P2P 등록 모드 + 동의자가 위치를 잡은 경우만 전송 (offline은 서버에서 매장 좌표 자동 상속)
      ...(!editMode && mode !== 'offline' && lat !== null && lng !== null
        ? { lat, lng }
        : {}),
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

      {/* 소속 매장 — 오프라인매장 모드: 필수 선택(매장 없으면 등록 유도). 중고직거래(p2p): 매장 미연결(숨김) */}
      {mode === 'offline' &&
        (myShops.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="item-shop">{t('form.shop')} *</Label>
            <select
              id="item-shop"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">{t('form.shopSelect')}</option>
              {myShops.map((s) => (
                <option key={s.shop_id} value={s.shop_id}>
                  {s.shop_nm}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <p className="text-muted-foreground text-sm">
              {t('form.noShopYet')}
            </p>
            <Link
              href="/store/my/shops"
              className="text-primary text-xs underline"
            >
              {t('shop.manage')}
            </Link>
          </div>
        ))}

      {/* 가격 — 자국통화로 등록하면 등록시점 환율로 Pi 환산(정본=Pi). Pi 직접입력도 가능 */}
      <div className="space-y-1.5">
        <Label htmlFor="item-price">{t('form.price')} *</Label>
        <div className="flex gap-2">
          {/* 통화 콤보 — 헤더 LanguageSwitcher와 동일한 국기·통화·환율 UI(로케일 이동 없이 통화만 선택) */}
          <CurrencyCombo
            value={priceCcy}
            onChange={(ccy) => {
              priceTouchedRef.current = true
              setPriceCcy(ccy)
            }}
          />
          <Input
            id="item-price"
            type="number"
            min="0"
            step="any"
            value={priceInput}
            onChange={(e) => {
              priceTouchedRef.current = true
              setPriceInput(e.target.value)
            }}
            placeholder={priceCcy === 'PI' ? '0.0' : '0'}
          />
        </div>
        {/* 환산 미리보기 — 자국통화 모드에서만. 견적 결과가 저장될 Pi 정본가 */}
        {priceCcy !== 'PI' && (
          <p className="text-xs">
            {quoting ? (
              <span className="text-muted-foreground">
                {t('form.priceConverting')}
              </span>
            ) : quoteErr ? (
              <span className="text-destructive">{quoteErr}</span>
            ) : quotePi != null ? (
              <span className="text-muted-foreground">
                {t('form.priceConverted', { pi: String(quotePi) })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t('form.priceConvertHint')}
              </span>
            )}
          </p>
        )}
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
        <Label>{t('form.images')}</Label>
        <ProductImageUploader images={images} onChange={setImages} max={3} />
      </div>

      {/* 판매 위치 — P2P 등록 모드 전용. offline 모드는 매장 좌표 자동 상속이므로 표시 안 함 */}
      {!editMode && mode !== 'offline' && (
        <div className="space-y-1.5">
          <Label>{t('location.title')}</Label>
          {lat !== null && lng !== null ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="bg-muted rounded px-2 py-1 text-xs">
                {t('locRegisteredCoord', {
                  lat: lat.toFixed(4),
                  lng: lng.toFixed(4),
                })}
              </span>
              <button
                type="button"
                onClick={() => {
                  setLat(null)
                  setLng(null)
                }}
                className="text-destructive text-xs underline"
              >
                {t('location.clear')}
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
              {locLoading ? t('location.checking') : t('location.register')}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">{t('location.hint')}</p>
          {lat === null && (
            <p className="text-destructive text-xs">{t('locRequiredHint')}</p>
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
              disabled={
                saving || (mode !== 'offline' && (lat === null || lng === null))
              }
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
