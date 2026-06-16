'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { usePiAuth } from '@/components/pi-auth-provider'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ShopType = 'ONLINE' | 'OFFLINE' | 'BOTH'

interface Shop {
  shop_id: string
  shop_nm: string
  shop_type_cd: ShopType
  shop_desc: string | null
  addr: string | null
  biz_hour: string | null
  contact_tel: string | null
  contact_email: string | null
  sns_url: string | null
  thumb_url: string | null
  // 인증·구글 정보
  place_id: string | null
  owner_nm: string | null
  owner_verified_yn: string | null
  verify_method_cd: string | null
  google_nm: string | null
  website_url: string | null
  gmap_url: string | null
  biz_status_cd: string | null
  rating_cnt: number | null
  google_place_json: unknown
}

interface ShopForm {
  shop_nm: string
  shop_type_cd: ShopType
  shop_desc: string
  addr: string
  biz_hour: string
  contact_tel: string
  contact_email: string
  sns_url: string
  thumb_url: string
  // 구글 제공 정보 (수정 가능)
  owner_nm: string
  google_nm: string
  website_url: string
  gmap_url: string
  biz_status_cd: string
  rating_cnt: string
}

const EMPTY_FORM: ShopForm = {
  shop_nm: '',
  shop_type_cd: 'ONLINE',
  shop_desc: '',
  addr: '',
  biz_hour: '',
  contact_tel: '',
  contact_email: '',
  sns_url: '',
  thumb_url: '',
  owner_nm: '',
  google_nm: '',
  website_url: '',
  gmap_url: '',
  biz_status_cd: '',
  rating_cnt: '',
}

const SHOP_TYPES: ShopType[] = ['ONLINE', 'OFFLINE', 'BOTH']

// 내 매장 관리 (SCR-08) — 목록 + 인라인 등록/수정 폼. FR-06
// serverAuthed: 서버 getSessionUser() 결과(Google 쿠키 포함) → Pi 로그인과 OR 게이트
export function ClientMyShops({
  serverAuthed = false,
}: {
  serverAuthed?: boolean
}) {
  const t = useTranslations('store')
  const { user, isLoading } = usePiAuth()
  const authed = serverAuthed || !!user

  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null) // null=닫힘, ''=신규, uuid=수정
  const [form, setForm] = useState<ShopForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/store/shops')
      if (res.ok) {
        const data = (await res.json()) as { shops: Shop[] }
        setShops(data.shops)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authed) void load()
  }, [authed, load])

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

  function openNew() {
    setForm(EMPTY_FORM)
    setEditingId('')
  }

  function openEdit(shop: Shop) {
    setForm({
      shop_nm: shop.shop_nm,
      shop_type_cd: shop.shop_type_cd,
      shop_desc: shop.shop_desc ?? '',
      addr: shop.addr ?? '',
      biz_hour: shop.biz_hour ?? '',
      contact_tel: shop.contact_tel ?? '',
      contact_email: shop.contact_email ?? '',
      sns_url: shop.sns_url ?? '',
      thumb_url: shop.thumb_url ?? '',
      owner_nm: shop.owner_nm ?? '',
      google_nm: shop.google_nm ?? '',
      website_url: shop.website_url ?? '',
      gmap_url: shop.gmap_url ?? '',
      biz_status_cd: shop.biz_status_cd ?? '',
      rating_cnt: shop.rating_cnt != null ? String(shop.rating_cnt) : '',
    })
    setEditingId(shop.shop_id)
  }

  // 수정 중인 매장(읽기전용 place_id·인증상태·원본 JSON 표시용)
  const editingShop =
    editingId && editingId !== ''
      ? (shops.find((s) => s.shop_id === editingId) ?? null)
      : null

  function set<K extends keyof ShopForm>(key: K, value: ShopForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.shop_nm.trim()) {
      toast.error(t('shop.nameRequired'))
      return
    }
    // 빈 문자열은 서버 스키마(email/url)에서 거부되므로 미전송으로 변환
    const ratingCnt = form.rating_cnt.trim()
    const payload = {
      shop_nm: form.shop_nm.trim(),
      shop_type_cd: form.shop_type_cd,
      shop_desc: form.shop_desc.trim() || undefined,
      addr: form.addr.trim() || undefined,
      biz_hour: form.biz_hour.trim() || undefined,
      contact_tel: form.contact_tel.trim() || undefined,
      contact_email: form.contact_email.trim() || undefined,
      sns_url: form.sns_url.trim() || undefined,
      thumb_url: form.thumb_url.trim() || undefined,
      // 구글 제공 정보 (수정 가능)
      owner_nm: form.owner_nm.trim() || undefined,
      google_nm: form.google_nm.trim() || undefined,
      website_url: form.website_url.trim() || undefined,
      gmap_url: form.gmap_url.trim() || undefined,
      biz_status_cd: form.biz_status_cd.trim() || undefined,
      rating_cnt: ratingCnt ? Number(ratingCnt) : undefined,
    }

    setSaving(true)
    try {
      const isEdit = editingId !== '' && editingId !== null
      const res = await piFetch(
        isEdit ? `/api/store/shops/${editingId}` : '/api/store/shops',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (res.ok) {
        toast.success(isEdit ? t('shop.editSuccess') : t('shop.createSuccess'))
        setEditingId(null)
        void load()
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

  async function remove(shopId: string) {
    if (!confirm(t('shop.deleteConfirm'))) return
    const res = await piFetch(`/api/store/shops/${shopId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      toast.success(t('shop.deleteSuccess'))
      void load()
    } else {
      toast.error(t('saveFail'))
    }
  }

  const formOpen = editingId !== null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{t('shop.intro')}</p>
        {!formOpen && (
          <Button size="sm" onClick={openNew}>
            {t('shop.add')}
          </Button>
        )}
      </div>

      {/* 등록/수정 인라인 폼 */}
      {formOpen && (
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            {editingId ? t('shop.editTitle') : t('shop.addTitle')}
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="shop-nm">{t('shop.name')} *</Label>
            <Input
              id="shop-nm"
              value={form.shop_nm}
              onChange={(e) => set('shop_nm', e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('shop.type')}</Label>
            <div className="flex gap-1.5">
              {SHOP_TYPES.map((ty) => (
                <button
                  key={ty}
                  type="button"
                  onClick={() => set('shop_type_cd', ty)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.shop_type_cd === ty ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {t(`shop.type_${ty}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop-desc">{t('shop.desc')}</Label>
            <textarea
              id="shop-desc"
              value={form.shop_desc}
              onChange={(e) => set('shop_desc', e.target.value)}
              rows={3}
              maxLength={2000}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          {/* 주소 — OFFLINE/BOTH에서 의미. 좌표는 향후 지도 핀 UI로 보강(FR-06) */}
          {form.shop_type_cd !== 'ONLINE' && (
            <div className="space-y-1.5">
              <Label htmlFor="shop-addr">{t('shop.addr')}</Label>
              <Input
                id="shop-addr"
                value={form.addr}
                onChange={(e) => set('addr', e.target.value)}
                maxLength={500}
              />
              <p className="text-muted-foreground text-xs">
                {t('shop.addrHint')}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="shop-tel">{t('shop.tel')}</Label>
              <Input
                id="shop-tel"
                value={form.contact_tel}
                onChange={(e) => set('contact_tel', e.target.value)}
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-email">{t('shop.email')}</Label>
              <Input
                id="shop-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shop-hour">{t('shop.bizHour')}</Label>
            <Input
              id="shop-hour"
              value={form.biz_hour}
              onChange={(e) => set('biz_hour', e.target.value)}
              maxLength={200}
              placeholder={t('shop.bizHourPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="shop-sns">{t('shop.sns')}</Label>
              <Input
                id="shop-sns"
                type="url"
                value={form.sns_url}
                onChange={(e) => set('sns_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shop-thumb">{t('shop.thumb')}</Label>
              <Input
                id="shop-thumb"
                type="url"
                value={form.thumb_url}
                onChange={(e) => set('thumb_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          {/* 🌍 구글 제공 정보 — 인증 등록 매장은 자동 채워짐, 직접 수정 가능 */}
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <p className="text-sm font-semibold">
              🌍 구글 제공 정보 (수정 가능)
            </p>

            {/* 읽기전용: place_id·인증상태 (식별·검증 앵커라 수정 불가) */}
            {editingShop?.place_id && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">
                  place_id (읽기전용)
                </Label>
                <p className="bg-muted/50 text-muted-foreground rounded-md border px-2.5 py-1.5 font-mono text-xs break-all">
                  {editingShop.place_id}
                </p>
                {editingShop.owner_verified_yn === 'Y' && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✅ 인증 매장 (검증수단:{' '}
                    {editingShop.verify_method_cd ?? '—'})
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shop-owner">대표자명</Label>
                <Input
                  id="shop-owner"
                  value={form.owner_nm}
                  onChange={(e) => set('owner_nm', e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-gnm">구글 매장명</Label>
                <Input
                  id="shop-gnm"
                  value={form.google_nm}
                  onChange={(e) => set('google_nm', e.target.value)}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shop-website">웹사이트</Label>
              <Input
                id="shop-website"
                type="url"
                value={form.website_url}
                onChange={(e) => set('website_url', e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shop-gmap">구글지도 URL</Label>
              <Input
                id="shop-gmap"
                type="url"
                value={form.gmap_url}
                onChange={(e) => set('gmap_url', e.target.value)}
                placeholder="https://maps.google.com/…"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="shop-bizstatus">영업상태</Label>
                <Input
                  id="shop-bizstatus"
                  value={form.biz_status_cd}
                  onChange={(e) => set('biz_status_cd', e.target.value)}
                  maxLength={20}
                  placeholder="OPERATIONAL"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-ratingcnt">평점 수</Label>
                <Input
                  id="shop-ratingcnt"
                  type="number"
                  min="0"
                  value={form.rating_cnt}
                  onChange={(e) => set('rating_cnt', e.target.value)}
                />
              </div>
            </div>

            {/* 원본 JSON — 구글이 준 전체 정보 (읽기전용 펼침 보기) */}
            {editingShop?.google_place_json != null && (
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer select-none">
                  구글 Place 원본 전체 보기 (JSON)
                </summary>
                <pre className="bg-muted/50 mt-2 max-h-60 overflow-auto rounded-md border p-2 text-[10px] break-all whitespace-pre-wrap">
                  {JSON.stringify(editingShop.google_place_json, null, 2)}
                </pre>
              </details>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? t('saving') : t('shop.save')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditingId(null)}
              disabled={saving}
            >
              {t('shop.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* 매장 목록 */}
      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('loading')}
        </p>
      ) : shops.length === 0 ? (
        !formOpen && (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {t('shop.empty')}
          </p>
        )
      ) : (
        <div className="space-y-2">
          {shops.map((shop) => (
            <div
              key={shop.shop_id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded">
                {shop.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.thumb_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg">🏪</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {shop.shop_nm}
                  </span>
                  <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-xs">
                    {t(`shop.type_${shop.shop_type_cd}`)}
                  </span>
                  {shop.owner_verified_yn === 'Y' && (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                      ✅ 인증
                    </span>
                  )}
                </div>
                {shop.addr && (
                  <p className="text-muted-foreground truncate text-xs">
                    📍 {shop.addr}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(shop)}
                >
                  {t('shop.edit')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => remove(shop.shop_id)}
                >
                  {t('shop.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
