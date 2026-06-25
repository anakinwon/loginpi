'use client'

// 가입 코호트 리텐션 히트맵 (Phase 22 §12 ③) — CSS 그리드.
//   행: 가입 코호트(주 단위), 열: 가입 후 경과 주차(0주차=가입주). 셀=잔존율%.
//   색 농도 = 잔존율. plotly-basic heatmap 부재 → CSS 구현(treemap/order-heatmap 선례).

interface CohortRow {
  cohort: string
  size: number
  retention: (number | null)[]
}

export default function CohortHeatmapChart({ rows }: { rows: CohortRow[] }) {
  const hasData = rows.some((r) => r.size > 0)
  if (!hasData)
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        최근 8주 내 가입 코호트가 없습니다.
      </p>
    )

  const maxK = Math.max(0, ...rows.map((r) => r.retention.length - 1))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal">코호트</th>
            <th className="font-normal">규모</th>
            {Array.from({ length: maxK + 1 }).map((_, k) => (
              <th key={k} className="font-normal">
                {k}주차
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohort}>
              <td className="text-muted-foreground text-left whitespace-nowrap">
                {r.cohort}
              </td>
              <td className="text-muted-foreground">{r.size}</td>
              {Array.from({ length: maxK + 1 }).map((_, k) => {
                const v = r.retention[k]
                if (v === null || v === undefined)
                  return <td key={k} />
                return (
                  <td key={k}>
                    <div
                      className="rounded-sm py-1 font-medium"
                      style={{
                        background:
                          v === 0
                            ? 'var(--muted)'
                            : `color-mix(in srgb, var(--primary) ${Math.round(15 + (v / 100) * 85)}%, transparent)`,
                        color: v >= 55 ? 'white' : 'inherit',
                      }}
                    >
                      {v}%
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-2 text-[10px]">
        가입 주차 기준 · 0주차=가입한 주의 활동률 · 색이 진할수록 높은 잔존율
      </p>
    </div>
  )
}
