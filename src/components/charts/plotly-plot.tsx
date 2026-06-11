'use client'

import dynamic from 'next/dynamic'
import type { PlotParams } from 'react-plotly.js'

// plotly.js-basic-dist-min + react-plotly.js/factory 조합으로 번들 크기 최소화.
// SSR 불가(window 의존) → dynamic + ssr:false 필수.
const PlotlyPlot = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, Plotly] = await Promise.all([
      import('react-plotly.js/factory'),
      import('plotly.js-basic-dist-min'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { default: createPlotlyComponent(Plotly as any) }
  },
  {
    ssr: false,
    loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" />,
  },
)

export type { PlotParams }
export default PlotlyPlot
