'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { useApiErrorMessage, type ApiErrorPayload } from '@/hooks/use-api-error'

// 구글 카페 → 내 매장 반자동 인증 등록 폼 (무승인 + 구글 정보 재입력 대조)
// 검증 2종: place_id(자동) + 전화번호(구글 대조) | 필수 입력: 대표자명·주소·이메일
// 현장 GPS(userLat/Lng)는 서버가 구글 좌표와 ≤100m 대조

// 서버 정본과 동기: /api/store/shops/claim의 CLAIM_RADIUS_M — 표시·안내용
const CLAIM_RADIUS_M = 100

// Haversine 거리(m) — 서버(claim route)와 동일 공식. 표시용이며 서버가 최종 강제.
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatMeters(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`
}

export interface ClaimTarget {
  place_id: string
  name: string
  addr?: string | null // 구글 주소 — 주소 입력칸 기본값(편의)
  lat?: number // 구글 매장 좌표 — 내 위치와의 거리 표시용 (없으면 배지 생략)
  lng?: number
}

export function ShopClaimDialog({
  target,
  userLat,
  userLng,
  onClose,
  onSuccess,
}: {
  target: ClaimTarget
  userLat: number
  userLng: number
  onClose: () => void
  onSuccess?: () => void
}) {
  const [placeIdConfirm, setPlaceIdConfirm] = useState('')
  const [shopNm, setShopNm] = useState(target.name ?? '')
  const [tel, setTel] = useState('')
  const [ownerNm, setOwnerNm] = useState('')
  const [addr, setAddr] = useState(target.addr ?? '')
  const [email, setEmail] = useState('')
  const [agreeWarn, setAgreeWarn] = useState(false) // 본인 매장 보증 동의 (타인 매장 무단 등록 차단)
  const [saving, setSaving] = useState(false)
  // 실시간 현재 위치 — 부모의 위치는 캐시(최대 7일)일 수 있어 다이얼로그가 열린 동안
  // watchPosition으로 갱신. 매장으로 이동하면 거리가 실시간으로 줄어드는 것이 보이고,
  // 제출 좌표도 최신값을 사용해 서버 100m 현장 검증 통과율을 높인다.
  const [pos, setPos] = useState({ lat: userLat, lng: userLng })
  const t = useTranslations('lbs')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()

  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, // 권한 거부·실패 시 부모가 준 위치 유지 (배지·제출 모두 폴백)
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // 내 위치 ↔ 선택 매장 거리 (매장 좌표 없으면 표시 생략)
  const distanceM =
    target.lat !== undefined && target.lng !== undefined
      ? Math.round(haversineMeters(pos.lat, pos.lng, target.lat, target.lng))
      : null
  const withinRadius = distanceM !== null && distanceM <= CLAIM_RADIUS_M

  // place_id 전체 일치 여부 — 대소문자 구분 정확 비교 (복사 차단 → 직접 타이핑 강제)
  const placeIdMatches = placeIdConfirm === target.place_id

  async function submit() {
    if (
      !placeIdConfirm.trim() ||
      !shopNm.trim() ||
      !tel.trim() ||
      !ownerNm.trim() ||
      !addr.trim() ||
      !email.trim()
    ) {
      toast.error(t('claim.allRequired'))
      return
    }
    // place_id 전체 일치 클라이언트 1차 검증 (대소문자 구분, 서버도 최종 강제)
    if (!placeIdMatches) {
      toast.error(t('claim.placeIdMismatchToast'))
      return
    }
    // 본인 매장 보증 동의 필수 (타인 매장 무단 등록 = 불법)
    if (!agreeWarn) {
      toast.error(t('claim.warrantRequired'))
      return
    }
    setSaving(true)
    try {
      const res = await piFetch('/api/store/shops/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: target.place_id,
          place_id_confirm: placeIdConfirm,
          user_lat: pos.lat,
          user_lng: pos.lng,
          shop_nm: shopNm.trim(),
          contact_tel: tel.trim(),
          owner_nm: ownerNm.trim(),
          addr: addr.trim(),
          contact_email: email.trim(),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ApiErrorPayload
      if (res.ok) {
        toast.success(t('claim.success'))
        onSuccess?.()
        onClose()
      } else {
        toast.error(apiErr(data, t('claim.registerFail')))
      }
    } catch {
      toast.error(t('claim.registerError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('claim.title')}</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={tc('close')}
          >
            ✕
          </button>
        </div>
        <p className="text-muted-foreground mb-3 text-xs">
          {t.rich('claim.desc', {
            name: target.name,
            b: (c) => <span className="font-medium">{c}</span>,
          })}
        </p>

        {/* 내 위치 ↔ 매장 실시간 거리 — 100m 현장 검증을 폼 작성 전에 미리 안내 */}
        {distanceM !== null && (
          <div
            className={`mb-3 rounded-lg border px-2.5 py-2 text-xs leading-relaxed ${
              withinRadius
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
            }`}
          >
            <p className="font-semibold">
              📍 {t('claim.distance', { dist: formatMeters(distanceM) })}
            </p>
            <p className="mt-0.5">
              {withinRadius
                ? t('claim.distanceOk', { radius: CLAIM_RADIUS_M })
                : t('claim.distanceTooFar', { radius: CLAIM_RADIUS_M })}
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              place_id{' '}
              <span className="text-muted-foreground">
                {t('claim.placeIdHint')}
              </span>
            </label>
            {/* 복사·선택·드래그 차단 → 눈으로 보고 직접 타이핑 강제 */}
            <div
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
              className="text-muted-foreground bg-muted/50 w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs break-all select-none"
              style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              {target.place_id}
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.placeIdInputLabel')}{' '}
              <span className="text-primary">
                {t('claim.placeIdInputHint')}
              </span>
            </label>
            <input
              value={placeIdConfirm}
              onChange={(e) => setPlaceIdConfirm(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('claim.placeIdPlaceholder')}
              maxLength={500}
              className={`w-full rounded-lg border bg-transparent px-2.5 py-1.5 font-mono text-xs break-all ${
                placeIdConfirm && !placeIdMatches
                  ? 'border-red-400'
                  : placeIdMatches
                    ? 'border-emerald-400'
                    : ''
              }`}
            />
            {placeIdConfirm && !placeIdMatches && (
              <p className="mt-1 text-[10px] text-red-500">
                {t('claim.placeIdMismatchInline')}
              </p>
            )}
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.shopNm')}{' '}
              <span className="text-muted-foreground">{tc('required')}</span>
            </label>
            <input
              value={shopNm}
              onChange={(e) => setShopNm(e.target.value)}
              placeholder={t('claim.shopNmPlaceholder')}
              maxLength={200}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.tel')}{' '}
              <span className="text-primary">{t('claim.telHint')}</span>
            </label>
            <input
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="02-1234-5678"
              maxLength={50}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.ownerNm')}{' '}
              <span className="text-muted-foreground">{tc('required')}</span>
            </label>
            <input
              value={ownerNm}
              onChange={(e) => setOwnerNm(e.target.value)}
              placeholder={t('claim.ownerNmPlaceholder')}
              maxLength={100}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.addr')}{' '}
              <span className="text-muted-foreground">{tc('required')}</span>
            </label>
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder={t('claim.addrPlaceholder')}
              maxLength={500}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              {t('claim.email')}{' '}
              <span className="text-muted-foreground">{tc('required')}</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              maxLength={200}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* 타인 매장 무단 등록 경고 — 본인 매장 보증 동의 강제 */}
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-semibold">{t('claim.warnTitle')}</p>
          <p className="mt-1">
            {t.rich('claim.warnBody', { b: (c) => <b>{c}</b> })}
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={agreeWarn}
              onChange={(e) => setAgreeWarn(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>{t.rich('claim.warnAgree', { b: (c) => <b>{c}</b> })}</span>
          </label>
        </div>

        <button
          onClick={submit}
          disabled={saving || !agreeWarn || !placeIdMatches}
          className="bg-primary text-primary-foreground mt-3 w-full rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('claim.submitting') : t('claim.submit')}
        </button>
      </div>
    </div>
  )
}
