'use client'

// 라이프사이클 전환 퍼널 (Phase 22 §12 ④) — CSS 구현.
//   plotly-basic 번들에 funnel trace가 없어 중앙정렬 막대 폭(=비중)으로 표현.
//   각 단계: 라벨 · 인원 · 전체대비% · 직전단계 전환%.

interface Stage {
  key: string
  label: string
  cnt: number
  pctOfTop: number
  convFromPrev: number
}

export default function FunnelChart({ stages }: { stages: Stage[] }) {
  if (stages.length === 0 || stages[0].cnt === 0)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        퍼널을 그릴 데이터가 없습니다.
      </p>
    )

  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.key}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">
              {i + 1}. {s.label}
            </span>
            <span className="text-muted-foreground">
              {s.cnt.toLocaleString('ko-KR')}명 · 전체 {s.pctOfTop.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-center">
            <div
              className="flex h-9 items-center justify-center rounded-md transition-all"
              style={{
                width: `${Math.max(s.pctOfTop, 6)}%`,
                background: `color-mix(in srgb, var(--primary) ${Math.round(35 + (s.pctOfTop / 100) * 55)}%, transparent)`,
              }}
              title={`${s.label}: ${s.cnt}명`}
            >
              <span className="text-xs font-semibold text-white drop-shadow-sm">
                {s.cnt.toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
          {i > 0 && (
            <p className="text-muted-foreground mt-0.5 text-center text-[10px]">
              ↓ 직전 단계 대비 {s.convFromPrev.toFixed(1)}% 전환
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
