// 기본 기체(SAUCER) 껍데기 — 위에서 본 원반 1차 선체(카드) 안 함교 유리 패널에 목적지·본문, 원반 아래로 목·2차 선체·파일론·워프 나셀 2기(SVG, 흐름 안 — 인라인 래퍼 높이에 포함).
// 시안 a-saucer-top. CSS = globals.css .ship-saucer-*, SVG id 는 useId 접두(다이얼로그 2개 동시 대비)
import { useId } from 'react'
import type { ShipSlots } from '.'

export function SaucerShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <>
      <div className="ship-saucer-disc">
        <span className="ship-saucer-win" aria-hidden />
        <span className="ship-saucer-win ship-saucer-win-in" aria-hidden />
        <span className="ship-saucer-nav ship-saucer-nav-port" aria-hidden />
        <span className="ship-saucer-nav ship-saucer-nav-star" aria-hidden />
        <span className="ship-saucer-nav ship-saucer-nav-strobe" aria-hidden />
        <span
          className="ship-saucer-impulse ship-saucer-impulse-l"
          aria-hidden
        />
        <span
          className="ship-saucer-impulse ship-saucer-impulse-r"
          aria-hidden
        />
        <div className="ship-saucer-panel">
          <span className="ship-saucer-dome" aria-hidden />
          {dest}
          {body}
        </div>
      </div>
      {/* 후방 선체 : 목 → 2차 선체 → 파일론 → 워프 나셀 2기(원반 밑 50px 뒤에서 시작) */}
      <div className="ship-saucer-rear" aria-hidden>
        <svg viewBox="0 0 400 190">
          <defs>
            <linearGradient id={`${p}metal-x`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#0b1020" />
              <stop offset=".3" stopColor="#36425f" />
              <stop offset=".5" stopColor="#8090b2" />
              <stop offset=".7" stopColor="#36425f" />
              <stop offset="1" stopColor="#0b1020" />
            </linearGradient>
            <linearGradient id={`${p}pylon-l`} x1="1" x2="0" y1="0" y2="0">
              <stop offset="0" stopColor="#2a3450" />
              <stop offset="1" stopColor="#5b6a8e" />
            </linearGradient>
            <linearGradient id={`${p}pylon-r`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#2a3450" />
              <stop offset="1" stopColor="#5b6a8e" />
            </linearGradient>
            <linearGradient id={`${p}coil`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1d4ed8" />
              <stop offset=".5" stopColor="#60a5fa" />
              <stop offset="1" stopColor="#a5f3fc" />
            </linearGradient>
            <linearGradient id={`${p}halo`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#60a5fa" stopOpacity=".55" />
              <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${p}bussard`} cx=".42" cy=".38" r=".65">
              <stop offset="0" stopColor="#fee2e2" />
              <stop offset=".45" stopColor="#ef4444" />
              <stop offset="1" stopColor="#7f1d1d" />
            </radialGradient>
            <radialGradient id={`${p}bussard-halo`} cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#f87171" stopOpacity=".7" />
              <stop offset="1" stopColor="#f87171" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}hull2`} cx=".35" cy=".3" r=".9">
              <stop offset="0" stopColor="#5c6b90" />
              <stop offset=".55" stopColor="#26304a" />
              <stop offset="1" stopColor="#0d1222" />
            </radialGradient>
          </defs>

          {/* 목(원반 → 2차 선체) */}
          <path
            d="M186 0 L214 0 L222 74 L178 74 Z"
            fill={`url(#${p}metal-x)`}
            stroke="rgba(199,210,254,.35)"
            strokeWidth=".8"
          />
          <circle cx="200" cy="58" r="1.4" fill="#e0f2fe" opacity=".85" />
          <circle cx="200" cy="66" r="1.4" fill="#e0f2fe" opacity=".65" />

          {/* 파일론 — 2차 선체에서 바깥·앞으로 젖혀 나셀에 */}
          <polygon
            points="176,112 176,136 60,110 60,88"
            fill={`url(#${p}pylon-l)`}
            stroke="rgba(199,210,254,.3)"
            strokeWidth=".8"
          />
          <polygon
            points="224,112 224,136 340,110 340,88"
            fill={`url(#${p}pylon-r)`}
            stroke="rgba(199,210,254,.3)"
            strokeWidth=".8"
          />

          {/* 2차 선체 */}
          <ellipse
            cx="200"
            cy="122"
            rx="27"
            ry="62"
            fill={`url(#${p}hull2)`}
            stroke="rgba(199,210,254,.45)"
            strokeWidth=".9"
          />
          <line
            x1="200"
            y1="76"
            x2="200"
            y2="170"
            stroke="rgba(199,210,254,.18)"
            strokeWidth=".8"
          />
          <rect
            x="191"
            y="172"
            width="18"
            height="8"
            rx="2"
            fill="#070a14"
            stroke="rgba(251,191,36,.6)"
            strokeWidth=".8"
          />
          <circle
            cx="200"
            cy="176"
            r="1.6"
            fill="#fbbf24"
            className="ship-saucer-bussard-glow"
          />

          {/* 좌 나셀 */}
          <g>
            <rect
              x="58"
              y="30"
              width="16"
              height="140"
              fill={`url(#${p}halo)`}
              className="ship-saucer-coil-pulse"
            />
            <rect
              x="36"
              y="4"
              width="24"
              height="178"
              rx="12"
              fill={`url(#${p}metal-x)`}
              stroke="rgba(199,210,254,.45)"
              strokeWidth=".9"
            />
            <rect
              x="52"
              y="34"
              width="6"
              height="134"
              rx="3"
              fill={`url(#${p}coil)`}
              className="ship-saucer-coil-pulse"
            />
            <line
              x1="55"
              y1="34"
              x2="55"
              y2="168"
              stroke="#0a0f1e"
              strokeWidth="6"
              strokeDasharray="1.2 7"
            />
            <rect
              x="52"
              y="34"
              width="6"
              height="134"
              rx="3"
              fill="#f0f9ff"
              className="ship-hot"
            />
            <rect
              x="38.5"
              y="40"
              width="3"
              height="120"
              rx="1.5"
              fill="#60a5fa"
              opacity=".35"
            />
            <ellipse
              cx="48"
              cy="18"
              rx="17"
              ry="20"
              fill={`url(#${p}bussard-halo)`}
              className="ship-saucer-bussard-glow"
            />
            <ellipse
              cx="48"
              cy="18"
              rx="11"
              ry="13"
              fill={`url(#${p}bussard)`}
            />
            <ellipse
              cx="48"
              cy="18"
              rx="11"
              ry="13"
              fill="#fff1f2"
              className="ship-hot"
            />
            <ellipse cx="45" cy="13" rx="3" ry="4" fill="#fff" opacity=".55" />
            <rect x="39" y="170" width="18" height="10" rx="4" fill="#0d1324" />
          </g>
          {/* 우 나셀(좌 거울상) */}
          <g transform="translate(400 0) scale(-1 1)">
            <rect
              x="58"
              y="30"
              width="16"
              height="140"
              fill={`url(#${p}halo)`}
              className="ship-saucer-coil-pulse ship-saucer-coil-r"
            />
            <rect
              x="36"
              y="4"
              width="24"
              height="178"
              rx="12"
              fill={`url(#${p}metal-x)`}
              stroke="rgba(199,210,254,.45)"
              strokeWidth=".9"
            />
            <rect
              x="52"
              y="34"
              width="6"
              height="134"
              rx="3"
              fill={`url(#${p}coil)`}
              className="ship-saucer-coil-pulse ship-saucer-coil-r"
            />
            <line
              x1="55"
              y1="34"
              x2="55"
              y2="168"
              stroke="#0a0f1e"
              strokeWidth="6"
              strokeDasharray="1.2 7"
            />
            <rect
              x="52"
              y="34"
              width="6"
              height="134"
              rx="3"
              fill="#f0f9ff"
              className="ship-hot"
            />
            <rect
              x="38.5"
              y="40"
              width="3"
              height="120"
              rx="1.5"
              fill="#60a5fa"
              opacity=".35"
            />
            <ellipse
              cx="48"
              cy="18"
              rx="17"
              ry="20"
              fill={`url(#${p}bussard-halo)`}
              className="ship-saucer-bussard-glow"
            />
            <ellipse
              cx="48"
              cy="18"
              rx="11"
              ry="13"
              fill={`url(#${p}bussard)`}
            />
            <ellipse
              cx="48"
              cy="18"
              rx="11"
              ry="13"
              fill="#fff1f2"
              className="ship-hot"
            />
            <ellipse cx="51" cy="13" rx="3" ry="4" fill="#fff" opacity=".55" />
            <rect x="39" y="170" width="18" height="10" rx="4" fill="#0d1324" />
          </g>
        </svg>
      </div>
    </>
  )
}
