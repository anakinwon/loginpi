'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DistCfgRow } from '@/lib/mps-dist-cfg'

const PRESETS = [
  { label: '5km', value: 5, desc: '도보·자전거권' },
  { label: '10km', value: 10, desc: '대중교통 30분' },
  { label: '20km', value: 20, desc: '차량 30분' },
  { label: '30km', value: 30, desc: '수도권 내권' },
  { label: '50km', value: 50, desc: '광역권 (기본값)' },
  { label: '100km', value: 100, desc: '인접 도시권' },
  { label: '무제한', value: 0, desc: '전국 노출' },
] as const

interface HistoryResp {
  history: DistCfgRow[]
}

export default function DistanceCfgPage() {
  const [history, setHistory] = useState<DistCfgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [km, setKm] = useState(50)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/admin/store/distance-cfg')
      .then((r) => r.json() as Promise<HistoryResp>)
      .then((d) => {
        setHistory(d.history ?? [])
        if (d.history?.length) setKm(d.history[0].max_dist_km)
      })
      .catch(() => setErr('설정을 불러오지 못했습니다'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setErr(null)
    try {
      const res = await fetch('/api/admin/store/distance-cfg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_dist_km: km, note_txt: note }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '저장 실패')
      }
      setSaved(true)
      setNote('')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 오류')
    } finally {
      setSaving(false)
    }
  }

  const current = history[0]
  const unchanged = current ? current.max_dist_km === km : false

  const labelKm = (v: number) => (v === 0 ? '무제한' : `${v}km`)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">PiShop™ 거리 제한 설정</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          사용자 위치 기준 이 거리를 초과한 상품은 목록에 노출되지 않습니다.
          <br />
          좌표가 없는 상품(LBS 미동의 판매자)과 사용자 위치 미확인 시에는 항상 전체 노출됩니다.
        </p>
      </div>

      {/* 현재 설정 배지 */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-sm">현재 적용 중:</span>
        {loading ? (
          <span className="text-muted-foreground text-sm">불러오는 중…</span>
        ) : (
          <span className="rounded-full bg-blue-100 px-4 py-1 text-base font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {current ? labelKm(current.max_dist_km) : '—'}
          </span>
        )}
      </div>

      {err && <p className="text-sm text-red-500">⚠ {err}</p>}

      {/* 설정 카드 */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="mb-4 text-sm font-semibold">새 거리 제한 설정</p>

        {/* 프리셋 버튼 */}
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setKm(p.value)}
              className={`flex flex-col items-center rounded-xl border px-4 py-2 text-xs transition-colors ${
                km === p.value
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:border-muted-foreground/40'
              }`}
            >
              <span className="text-sm font-bold">{p.label}</span>
              <span className="mt-0.5 text-[10px] opacity-70">{p.desc}</span>
            </button>
          ))}
        </div>

        {/* 슬라이더 */}
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">무제한 (0)</span>
            <span className="font-bold tabular-nums">
              {km === 0 ? '무제한' : `${km} km`}
            </span>
            <span className="text-muted-foreground">200km</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* 직접 입력 */}
        <div className="mb-5 flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={200}
            step={1}
            value={km}
            onChange={(e) => {
              const v = Math.max(0, Math.min(200, Number(e.target.value)))
              setKm(isNaN(v) ? 0 : v)
            }}
            className="border-input w-28 rounded-lg border bg-background px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2"
          />
          <span className="text-sm">km</span>
          {km === 0 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              무제한 모드
            </span>
          )}
        </div>

        {/* 변경 사유 */}
        <div className="mb-5">
          <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
            변경 사유 (선택)
          </label>
          <input
            type="text"
            maxLength={200}
            placeholder="예: 신규 도시 진출, 상품 공급 부족 등"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="border-input w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
        </div>

        {/* 저장 영역 */}
        <div className="flex items-center gap-3">
          <Button
            disabled={saving || unchanged}
            onClick={handleSave}
            className="px-6"
          >
            {saving ? '저장 중…' : '저장'}
          </Button>
          {unchanged && (
            <span className="text-muted-foreground text-xs">
              현재와 동일한 값입니다
            </span>
          )}
          {saved && !unchanged && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              ✓ 저장됨 — 서비스에 즉시 반영됩니다
            </span>
          )}
        </div>
      </div>

      {/* 안내 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        💡 <strong>적용 조건:</strong> 거리 제한은 <strong>사용자가 위치 동의(LBS)를 허용</strong>하고 좌표가 수집된 경우에만 작동합니다.
        미동의 사용자에게는 전국 상품이 계속 표시됩니다. 좌표 없는 상품(P2P 미동의 판매자)도 항상 포함됩니다.
      </div>

      {/* 변경 이력 */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold">변경 이력 (최근 20건)</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">거리 제한</th>
                  <th className="px-4 py-2 text-left font-medium">변경 사유</th>
                  <th className="px-4 py-2 text-left font-medium">변경자</th>
                  <th className="px-4 py-2 text-left font-medium">변경 일시</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((row, i) => (
                  <tr
                    key={row.cfg_id}
                    className={`transition-colors ${i === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-muted/30'}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.max_dist_km === 0
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {labelKm(row.max_dist_km)}
                      </span>
                      {i === 0 && (
                        <span className="ml-2 text-[10px] font-medium text-blue-600">
                          현행
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground max-w-xs truncate px-4 py-3 text-xs">
                      {row.note_txt ?? '—'}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs font-mono">
                      {row.modr_id.slice(0, 8)}…
                    </td>
                    <td className="text-muted-foreground whitespace-nowrap px-4 py-3 text-xs">
                      {new Date(row.reg_dtm).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
