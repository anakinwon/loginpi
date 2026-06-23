'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { BeanIcon } from '@/components/ui/bean-icon'

const MAX_TIP_BEAN = 1_000_000

export default function TipPresetsPage() {
  const [vals, setVals] = useState<[string, string, string]>(['', '', ''])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 현행 프리셋 로드
  useEffect(() => {
    let alive = true
    piFetch('/api/tip-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { presets?: number[] } | null) => {
        if (alive && d?.presets?.length === 3) {
          setVals([String(d.presets[0]), String(d.presets[1]), String(d.presets[2])])
        }
      })
      .catch(() => toast.error('프리셋을 불러오지 못했습니다'))
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
  // 클라이언트 사전 검증 — 서버(api/tip-presets PUT)와 동일 규칙
  const valid =
    vals.every((v) => v !== '') &&
    nums.every((n) => Number.isInteger(n) && n > 0 && n <= MAX_TIP_BEAN) &&
    nums[0] < nums[1] &&
    nums[1] < nums[2]

  async function save() {
    if (!valid) return
    setSaving(true)
    try {
      const res = await piFetch('/api/tip-presets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: nums }),
      })
      const d = (await res.json()) as { error?: string }
      if (res.ok) toast.success('선물 프리셋을 저장했습니다')
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
          <BeanIcon className="h-6 w-6" /> 카페 선물하기 프리셋
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          카페방에서 사용자가 선택하는 선물(Bean 전송) 금액 3종을 설정합니다.
          저장 즉시 선물 버튼과 서버 검증에 함께 반영됩니다. (1 Pi = 100 Bean)
        </p>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        {([0, 1, 2] as const).map((i) => (
          <div key={i} className="flex items-center gap-3">
            <label className="text-muted-foreground w-20 text-sm">
              프리셋 {i + 1}
            </label>
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                value={vals[i]}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder="Bean"
                className="border-input bg-background w-full rounded-lg border px-3 py-2 pr-24 text-right text-sm tabular-nums"
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                Bean ≈ π{nums[i] ? (nums[i] / 100).toFixed(2) : '0'}
              </span>
            </div>
          </div>
        ))}

        {!valid && vals.some((v) => v !== '') && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 금액은 1~{MAX_TIP_BEAN.toLocaleString()} 사이 정수이며, 작은 값 →
            큰 값 순으로 서로 달라야 합니다.
          </p>
        )}
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
        <code>bean_tip_cfg</code> 미적용 시에는 기본값 100/500/1000으로 동작합니다.
      </p>
    </div>
  )
}
