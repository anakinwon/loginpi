'use client'

import { useEffect, useState, useRef } from 'react'
import { BeanIcon } from '@/components/ui/bean-icon'
import { Button } from '@/components/ui/button'

interface FeePlanRow {
  fee_plan_id: string
  fee_plan_cd: string
  prod_ctgr_cd: string
  grade_cd: string
  bill_cycle_cd: 'M' | 'Y'
  amt_bean: number
  fee_plan_desc: string | null
  use_yn: 'Y' | 'N'
  mod_dtm: string
}

type Product = 'PICAFE' | 'PISHOP' | 'TRANSLATE'
type ShopGrade = 'S' | 'M' | 'L'

const SHOP_GRADES: ShopGrade[] = ['S', 'M', 'L']

const SHOP_GRADE_META: Record<ShopGrade, { label: string; limit: string }> = {
  S: { label: 'S', limit: '10개 이하' },
  M: { label: 'M', limit: '30개 이하' },
  L: { label: 'L', limit: '무제한' },
}

const PRODUCT_META: Record<Product, { label: string; emoji: string; color: string }> = {
  PICAFE:    { label: 'PyCafé™',      emoji: '☕', color: 'border-blue-200 dark:border-blue-800' },
  PISHOP:    { label: 'PyShop™',      emoji: '🏪', color: 'border-amber-200 dark:border-amber-800' },
  TRANSLATE: { label: 'PyTranslate™', emoji: '🌐', color: 'border-green-200 dark:border-green-800' },
}

const SIMPLE_PRODUCTS: Product[] = ['PICAFE', 'TRANSLATE']

function prodKey(row: FeePlanRow): Product {
  if (row.prod_ctgr_cd.startsWith('PICAFE')) return 'PICAFE'
  if (row.prod_ctgr_cd.startsWith('PISHOP')) return 'PISHOP'
  return 'TRANSLATE'
}

function annualOk(monthly: number, annual: number): boolean {
  return annual > 0 && monthly > 0 && annual === monthly * 10
}

interface EditState {
  fee_plan_id: string
  value: string
}

interface SaveResult {
  fee_plan_id: string
  ok: boolean
}

export default function SubscrPricingPage() {
  const [rows, setRows] = useState<FeePlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<SaveResult | null>(null)
  const [shopGrade, setShopGrade] = useState<ShopGrade>('S')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    setErr(null)
    fetch('/api/admin/token/fee-plan?subscr_div_cd=SUBSCR')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: FeePlanRow[] }>
      })
      .then((d) => setRows(d.data.filter((r) => r.use_yn === 'Y')))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (edit) inputRef.current?.focus() }, [edit])

  const startEdit = (row: FeePlanRow) => {
    setSaved(null)
    setEdit({ fee_plan_id: row.fee_plan_id, value: String(row.amt_bean) })
  }

  const cancelEdit = () => setEdit(null)

  const saveEdit = async (row: FeePlanRow) => {
    const newAmt = parseInt(edit?.value ?? '', 10)
    if (isNaN(newAmt) || newAmt < 0) { alert('0 이상의 정수를 입력하세요'); return }
    if (newAmt === row.amt_bean) { setEdit(null); return }
    setSaving(row.fee_plan_id)
    try {
      const res = await fetch('/api/admin/token/fee-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee_plan_id: row.fee_plan_id, amt_bean: newAmt }),
      })
      if (!res.ok) throw new Error(`저장 실패 HTTP ${res.status}`)
      setRows((prev) =>
        prev.map((p) =>
          p.fee_plan_id === row.fee_plan_id
            ? { ...p, amt_bean: newAmt, mod_dtm: new Date().toISOString() }
            : p,
        ),
      )
      setSaved({ fee_plan_id: row.fee_plan_id, ok: true })
      setEdit(null)
    } catch (e) {
      setSaved({ fee_plan_id: row.fee_plan_id, ok: false })
      alert(e instanceof Error ? e.message : '저장 오류')
    } finally {
      setSaving(null)
    }
  }

  // 단순 상품 그룹 (PICAFE, TRANSLATE): { M, Y }
  const simpleGroup: Partial<Record<Product, { M?: FeePlanRow; Y?: FeePlanRow }>> = {}
  // PyShop 그룹: grade → { M, Y }
  const shopGroup: Partial<Record<ShopGrade, { M?: FeePlanRow; Y?: FeePlanRow }>> = {}

  rows.forEach((r) => {
    const p = prodKey(r)
    if (p === 'PISHOP') {
      const g = r.grade_cd as ShopGrade
      if (!shopGroup[g]) shopGroup[g] = {}
      shopGroup[g]![r.bill_cycle_cd] = r
    } else {
      if (!simpleGroup[p]) simpleGroup[p] = {}
      simpleGroup[p]![r.bill_cycle_cd] = r
    }
  })

  // 현재 선택된 PyShop 등급 그룹
  const shopGradeGroup = shopGroup[shopGrade] ?? {}
  const shopMRow = shopGradeGroup.M
  const shopYRow = shopGradeGroup.Y
  const shopPolicyOk = shopMRow && shopYRow ? annualOk(shopMRow.amt_bean, shopYRow.amt_bean) : null

  const renderCycleRow = (row: FeePlanRow | undefined, cycleLabel: string, cycleNote: string) => {
    if (!row) return null
    const isEditing = edit?.fee_plan_id === row.fee_plan_id
    const isSaving = saving === row.fee_plan_id
    const wasSaved = saved?.fee_plan_id === row.fee_plan_id

    return (
      <div key={row.fee_plan_id} className="bg-muted/40 rounded-xl p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">
            {cycleLabel}
            {cycleNote && (
              <span className="text-muted-foreground ml-1 font-normal">{cycleNote}</span>
            )}
          </span>
          <span className="text-muted-foreground text-[10px]">{row.fee_plan_cd}</span>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="number"
                min={0}
                step={100}
                value={edit.value}
                onChange={(e) =>
                  setEdit((prev) => prev ? { ...prev, value: e.target.value } : prev)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveEdit(row)
                  if (e.key === 'Escape') cancelEdit()
                }}
                className="border-primary w-full rounded-lg border bg-background px-3 py-1.5 text-right text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
              <BeanIcon className="h-5 w-5 shrink-0" />
            </div>
            <p className="text-muted-foreground text-right text-xs">
              = {(parseInt(edit.value || '0', 10) / 100).toFixed(2)} π
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 text-xs" disabled={isSaving} onClick={() => void saveEdit(row)}>
                {isSaving ? '저장 중…' : '저장'}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs" disabled={isSaving} onClick={cancelEdit}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xl font-bold tabular-nums">
                {row.amt_bean.toLocaleString()}{' '}
                <BeanIcon className="mb-0.5 inline-block h-5 w-5 align-text-bottom" />
              </p>
              <p className="text-muted-foreground text-xs">
                = {(row.amt_bean / 100).toFixed(0)} π
              </p>
            </div>
            <div className="flex items-center gap-2">
              {wasSaved && saved!.ok && (
                <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ 저장됨</span>
              )}
              <button
                onClick={() => startEdit(row)}
                disabled={edit !== null}
                className="text-primary rounded-lg border px-3 py-1 text-xs font-medium transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                수정
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" /> 구독요금제 관리
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          상품별 월·년 구독료를 수정합니다. 저장 즉시 서비스에 반영됩니다(캐시 자동 무효화).
        </p>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}
      {err && <p className="text-sm text-red-500">오류: {err}</p>}

      {!loading && !err && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            💡 <strong>연간 할인 정책:</strong> 년 요금 = 월 요금 × 10 (2개월 무료, 약 17% 절약).<br />
            연간 요금을 수정할 때 이 정책이 유지되는지 우측 아이콘으로 확인하세요.
          </div>

          {/* PyCafé™ · PyTranslate™ 단순 상품 카드 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {SIMPLE_PRODUCTS.map((prod) => {
              const meta = PRODUCT_META[prod]
              const g = simpleGroup[prod] ?? {}
              const mRow = g.M
              const yRow = g.Y
              const policyOk = mRow && yRow ? annualOk(mRow.amt_bean, yRow.amt_bean) : null

              return (
                <div key={prod} className={`rounded-2xl border-2 bg-card p-5 shadow-sm ${meta.color}`}>
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-2xl">{meta.emoji}</span>
                    <div>
                      <p className="font-bold">{meta.label}</p>
                      <p className="text-muted-foreground text-xs">구독</p>
                    </div>
                    {policyOk !== null && (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${policyOk ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {policyOk ? '✓ 정책 준수' : '⚠ 정책 불일치'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {renderCycleRow(mRow, '월간', '')}
                    {renderCycleRow(yRow, '연간', '(2개월 무료)')}
                  </div>
                  {mRow && (
                    <p className="text-muted-foreground mt-3 text-right text-[10px]">
                      최근 수정:{' '}
                      {new Date(mRow.mod_dtm).toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', hour12: false,
                      })}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* PyShop™ S / M / L 등급별 구독요금 */}
          <div className={`rounded-2xl border-2 bg-card p-5 shadow-sm ${PRODUCT_META.PISHOP.color}`}>
            {/* 카드 헤더 */}
            <div className="mb-4 flex items-center gap-2">
              <span className="text-2xl">{PRODUCT_META.PISHOP.emoji}</span>
              <div>
                <p className="font-bold">{PRODUCT_META.PISHOP.label}</p>
                <p className="text-muted-foreground text-xs">S / M / L 등급별 구독</p>
              </div>
              {shopPolicyOk !== null && (
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${shopPolicyOk ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {shopPolicyOk ? '✓ 정책 준수' : '⚠ 정책 불일치'}
                </span>
              )}
            </div>

            {/* S / M / L 등급 탭 */}
            <div className="mb-4 flex gap-1 rounded-xl border p-1">
              {SHOP_GRADES.map((g) => {
                const grp = shopGroup[g]
                const mAmt = grp?.M?.amt_bean
                return (
                  <button
                    key={g}
                    onClick={() => { setShopGrade(g); cancelEdit() }}
                    className={`flex flex-1 flex-col items-center rounded-lg px-3 py-2 text-xs transition-colors ${
                      shopGrade === g
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-sm font-bold">{SHOP_GRADE_META[g].label}</span>
                    <span className="mt-0.5 text-[10px] opacity-80">{SHOP_GRADE_META[g].limit}</span>
                    {mAmt !== undefined && (
                      <span className="mt-0.5 tabular-nums text-[10px] opacity-70">
                        {mAmt.toLocaleString()} ☕/월
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 선택된 등급의 월간 / 연간 */}
            <div className="space-y-3">
              {renderCycleRow(shopMRow, '월간', '')}
              {renderCycleRow(shopYRow, '연간', '(2개월 무료)')}
            </div>

            {shopMRow && (
              <p className="text-muted-foreground mt-3 text-right text-[10px]">
                최근 수정:{' '}
                {new Date(shopMRow.mod_dtm).toLocaleString('ko-KR', {
                  year: 'numeric', month: '2-digit', day: '2-digit',
                  hour: '2-digit', minute: '2-digit', hour12: false,
                })}
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="text-muted-foreground text-xs">
              구독요금제 외 카페·스토어·플랫폼 전체 요금은{' '}
              <a href="/admin/token/fee-plan" className="text-primary underline-offset-2 hover:underline">
                Bean 요금제 관리
              </a>
              에서 확인할 수 있습니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
