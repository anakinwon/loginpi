'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'

const MAX_TIP_BEAN = 1_000_000

export default function TipPresetsPage() {
  const [vals, setVals] = useState<[string, string, string]>(['', '', ''])
  const [customMax, setCustomMax] = useState('') // 프리셋 4 — 직접입력 상한
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 현행 설정 로드
  useEffect(() => {
    let alive = true
    piFetch('/api/tip-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { presets?: number[]; customMax?: number } | null) => {
        if (!alive || !d) return
        if (d.presets?.length === 3) {
          setVals([String(d.presets[0]), String(d.presets[1]), String(d.presets[2])])
        }
        if (typeof d.customMax === 'number') setCustomMax(String(d.customMax))
      })
      .catch(() => toast.error('설정을 불러오지 못했습니다'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  function setAt(i: number, v: string) {
    setVals((prev) => {
      const next = [...prev] as [string, string, string]
      next[i] = v.replace(/[^0-9]/g, '') // 정수만
      return next
    })
  }

  const nums = vals.map((v) => Number(v))
  const maxNum = Number(customMax)
  // 클라이언트 사전 검증 — 서버(api/tip-presets PUT)와 동일 규칙
  const presetsValid =
    vals.every((v) => v !== '') &&
    nums.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_TIP_BEAN) &&
    nums[0] < nums[1] &&
    nums[1] < nums[2]
  const maxValid =
    customMax !== '' &&
    Number.isInteger(maxNum) &&
    maxNum > 0 &&
    maxNum <= MAX_TIP_BEAN &&
    maxNum >= nums[2] // 직접입력 상한은 가장 큰 고정 프리셋 이상
  const valid = presetsValid && maxValid

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      const res = await piFetch('/api/tip-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: nums, customMax: maxNum }),
      })
      const d = (await res.json()) as { error?: string }
      if (res.ok) toast.success('선물 설정을 저장했습니다')
      else toast.error(d.error ?? '저장 실패')
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-muted-foreground p-6 text-sm">불러오는 중…</p>
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <BeanIcon className="h-6 w-6" /> 카페 선물하기 설정
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          카페방 선물(Bean 전송) 금액을 설정합니다. 고정 버튼 3종 + 직접입력
          상한(프리셋 4). 저장 즉시 선물 버튼과 서버 검증에 함께 반영됩니다. (1 Pi
          = 100 Bean)
        </p>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs font-semibold">고정 버튼</p>
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className="flex items-center gap-3">
            <label className="text-muted-foreground w-20 shrink-0 text-sm">
              프리셋 {i + 1}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={vals[i]}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder="Bean"
              className="border-input bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-right text-sm tabular-nums"
            />
            <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
              Bean ≈ π{nums[i] ? (nums[i] / 100).toFixed(2) : '0'}
            </span>
          </div>
        ))}

        {!presetsValid && vals.some((v) => v !== '') && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 고정 버튼은 1~{MAX_TIP_BEAN.toLocaleString()} 사이 정수이며, 작은
            값 → 큰 값 순으로 서로 달라야 합니다.
          </p>
        )}

        <div className="mt-2 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-semibold">
            프리셋 4 — 직접 입력
          </p>
          <div className="flex items-center gap-3">
            <label className="text-muted-foreground w-20 shrink-0 text-sm">
              상한
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={customMax}
              onChange={(e) => setCustomMax(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Bean"
              className="border-input bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-right text-sm tabular-nums"
            />
            <span className="text-muted-foreground w-28 shrink-0 text-right text-xs tabular-nums">
              Bean ≈ π{maxNum ? (maxNum / 100).toFixed(2) : '0'}
            </span>
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            사용자가 1 ~ 상한 사이 금액을 직접 입력해 송금할 수 있습니다.
          </p>
          {!maxValid && customMax !== '' && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              ⚠️ 상한은 정수이며 가장 큰 고정 프리셋(
              {nums[2] ? nums[2].toLocaleString() : '—'}) 이상이어야 합니다.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={save}
        disabled={!valid || saving}
        className="bg-primary text-primary-foreground w-full rounded-xl py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {saving ? '저장 중…' : '저장'}
      </button>

      <p className="text-muted-foreground text-xs">
        변경 이력은 보존됩니다(수정 시 새 설정 행 추가). DB 테이블{' '}
        <code>bean_tip_cfg</code> 미적용 시에는 기본값(100/500/1000 · 상한
        10,000)으로 동작합니다.
      </p>
    </div>
  )
}
