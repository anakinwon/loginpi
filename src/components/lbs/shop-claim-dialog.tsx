'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// 구글 카페 → 내 매장 반자동 인증 등록 폼 (무승인 + 구글 정보 재입력 대조)
// 검증 2종: place_id(자동) + 전화번호(구글 대조) | 필수 입력: 대표자명·주소·이메일
// 현장 GPS(userLat/Lng)는 서버가 구글 좌표와 ≤100m 대조

export interface ClaimTarget {
  place_id: string
  name: string
  addr?: string | null // 구글 주소 — 주소 입력칸 기본값(편의)
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
      toast.error('모든 항목을 입력해주세요')
      return
    }
    // place_id 전체 일치 클라이언트 1차 검증 (대소문자 구분, 서버도 최종 강제)
    if (!placeIdMatches) {
      toast.error('place_id가 정확히 일치하지 않습니다 (대소문자 구분)')
      return
    }
    // 본인 매장 보증 동의 필수 (타인 매장 무단 등록 = 불법)
    if (!agreeWarn) {
      toast.error('본인이 운영하는 매장임을 보증해주세요')
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
          user_lat: userLat,
          user_lng: userLng,
          shop_nm: shopNm.trim(),
          contact_tel: tel.trim(),
          owner_nm: ownerNm.trim(),
          addr: addr.trim(),
          contact_email: email.trim(),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        toast.success(
          '✅ 내 매장으로 인증 등록되었습니다! 이제 메뉴를 추가해보세요',
        )
        onSuccess?.()
        onClose()
      } else {
        toast.error(data.error ?? '등록에 실패했습니다')
      }
    } catch {
      toast.error('등록 중 오류가 발생했습니다')
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
          <h3 className="text-base font-semibold">🏪 내 매장 인증 등록</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <p className="text-muted-foreground mb-3 text-xs">
          <span className="font-medium">{target.name}</span> — 구글에 등록된
          정보와 대조합니다. 전화번호가 구글과 일치해야 등록됩니다.
        </p>

        <div className="space-y-2.5">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              place_id{' '}
              <span className="text-muted-foreground">
                (구글 매장 식별자 — 복사 불가)
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
              place_id 전체 입력{' '}
              <span className="text-primary">
                (대소문자 구분, 붙여넣기 불가)
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
              placeholder="위 식별자를 그대로 직접 입력"
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
                place_id가 일치하지 않습니다 (대소문자까지 정확히)
              </p>
            )}
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              매장명 <span className="text-muted-foreground">(필수)</span>
            </label>
            <input
              value={shopNm}
              onChange={(e) => setShopNm(e.target.value)}
              placeholder="○○카페"
              maxLength={200}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              전화번호 <span className="text-primary">(구글과 대조 검증)</span>
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
              대표자명 <span className="text-muted-foreground">(필수)</span>
            </label>
            <input
              value={ownerNm}
              onChange={(e) => setOwnerNm(e.target.value)}
              placeholder="홍길동"
              maxLength={100}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              주소 <span className="text-muted-foreground">(필수)</span>
            </label>
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="서울시 ..."
              maxLength={500}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              이메일 <span className="text-muted-foreground">(필수)</span>
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
          <p className="font-semibold">⚠️ 본인이 운영하는 매장만 등록할 수 있습니다</p>
          <p className="mt-1">
            타인의 매장을 본인 명의로 등록하는 것은 <b>불법</b>이며, 개인정보 무단 이용에 따라{' '}
            <b>민·형사상 처벌</b>을 받을 수 있습니다.
          </p>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={agreeWarn}
              onChange={(e) => setAgreeWarn(e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span>
              위 내용을 확인했으며, 등록 매장이 <b>본인이 운영하는 매장</b>임을 보증합니다.
            </span>
          </label>
        </div>

        <button
          onClick={submit}
          disabled={saving || !agreeWarn || !placeIdMatches}
          className="bg-primary text-primary-foreground mt-3 w-full rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '인증 확인 중…' : '인증 등록'}
        </button>
      </div>
    </div>
  )
}
