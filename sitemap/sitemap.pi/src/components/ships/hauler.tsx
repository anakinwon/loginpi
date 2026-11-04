// 유료 기체(HAULER) 껍데기 — 뒤쪽 약간 위에서 본 대형 원반 화물선(12시 방향 비행). 자체 디자인(마스터 2026-11-04 — 원작 기체 복제 아님) :
// 원반 선체 + 가운데 앞 조종석 모듈 + 둥근 화물 램프(뱃머리) + 상부 돔 쌍포탑 + 좌우 대칭 도킹 포드 + 후방 3연 추진 노즐, 청록 띠 장갑.
// 점프 = 노즐 백열·추진 불꽃(.ship-hauler-plume). 그 아래 지지대 → 명판 → 이중 베젤 콘솔. CSS = globals.css .ship-hauler-*
import { useId } from 'react'
import type { ShipSlots } from '.'

const NOZZLE_X = [158, 200, 242] // 후방 추진 노즐 중심 x(가운데 대칭)

export function HaulerShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <>
      <div className="ship-hauler-frame">
        <svg viewBox="0 0 400 250" aria-hidden>
          <defs>
            {/* 윗면 : 빛은 왼쪽 위 — 중심 밝고 가장자리 어둡게 */}
            <radialGradient id={`${p}h-top`} cx="0.42" cy="0.38" r="0.7">
              <stop offset="0" stopColor="#f4f6f8" />
              <stop offset="0.6" stopColor="#d5dae1" />
              <stop offset="1" stopColor="#9aa1ad" />
            </radialGradient>
            {/* 옆벽(테두리 두께) */}
            <linearGradient id={`${p}h-side`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8a92a0" />
              <stop offset="1" stopColor="#4a505c" />
            </linearGradient>
            <linearGradient id={`${p}h-pod`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7d8492" />
              <stop offset="0.45" stopColor="#e6e9ee" />
              <stop offset="1" stopColor="#8a92a0" />
            </linearGradient>
            <linearGradient id={`${p}h-glass`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0b1220" />
              <stop offset="1" stopColor="#0f3b3a" />
            </linearGradient>
            <radialGradient id={`${p}h-ex`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f0fdfa" />
              <stop offset="0.5" stopColor="#5eead4" stopOpacity="0.85" />
              <stop offset="1" stopColor="#0d9488" stopOpacity="0.2" />
            </radialGradient>
            <radialGradient id={`${p}h-plume`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#99f6e4" stopOpacity="0.6" />
              <stop offset="1" stopColor="#14b8a6" stopOpacity="0" />
            </radialGradient>
            <clipPath id={`${p}c-top`}>
              <ellipse cx="200" cy="118" rx="150" ry="82" />
            </clipPath>
          </defs>

          {/* 원반 옆벽(두께) → 윗면 */}
          <ellipse
            cx="200"
            cy="128"
            rx="150"
            ry="82"
            fill={`url(#${p}h-side)`}
          />
          <path
            d="M50 128 A150 82 0 0 0 350 128"
            fill="none"
            stroke="#2a2e36"
            strokeWidth="9"
            strokeDasharray="1.4 10"
            opacity="0.55"
          />
          <g className="ship-hauler-glow-rim" fill="#5eead4">
            <circle cx="78" cy="176" r="2" />
            <circle cx="322" cy="176" r="2" />
            <circle cx="118" cy="196" r="1.6" />
            <circle cx="282" cy="196" r="1.6" />
          </g>
          <ellipse
            cx="200"
            cy="118"
            rx="150"
            ry="82"
            fill={`url(#${p}h-top)`}
            stroke="#5b6170"
            strokeWidth="1.2"
          />

          {/* 윗면 장식(윗면 안으로 자름) : 방사 패널 선 · 동심 링 · 청록 띠 장갑 · 정비 해치 */}
          <g clipPath={`url(#${p}c-top)`}>
            <g stroke="#7d8492" strokeWidth="0.7" opacity="0.7" fill="none">
              <ellipse cx="200" cy="118" rx="108" ry="59" />
              <ellipse cx="200" cy="118" rx="62" ry="34" />
              <line x1="200" y1="118" x2="60" y2="70" />
              <line x1="200" y1="118" x2="340" y2="70" />
              <line x1="200" y1="118" x2="56" y2="160" />
              <line x1="200" y1="118" x2="344" y2="160" />
              <line x1="200" y1="118" x2="120" y2="200" />
              <line x1="200" y1="118" x2="280" y2="200" />
            </g>
            {/* 청록 띠 : 바깥 링 위 호 4개(좌우 대칭) */}
            <g
              stroke="#0f766e"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            >
              <path d="M84 88 A108 59 0 0 1 126 70" />
              <path d="M316 88 A108 59 0 0 0 274 70" />
              <path d="M90 152 A108 59 0 0 0 128 168" />
              <path d="M310 152 A108 59 0 0 1 272 168" />
            </g>
            {/* 정비 해치 판 좌우 */}
            <g fill="#c3c8d0" stroke="#5b6170" strokeWidth="0.8">
              <rect x="112" y="104" width="30" height="16" rx="2" />
              <rect x="258" y="104" width="30" height="16" rx="2" />
            </g>
            <g fill="#0f766e">
              <rect x="117" y="109" width="8" height="6" rx="1" />
              <rect x="275" y="109" width="8" height="6" rx="1" />
            </g>
            {/* 낡은 금속 얼룩(필터 없음) */}
            <g fill="#3a3f49" opacity="0.14">
              <ellipse cx="150" cy="80" rx="10" ry="3" />
              <ellipse cx="262" cy="150" rx="12" ry="3" />
              <ellipse cx="96" cy="128" rx="6" ry="2" />
              <ellipse cx="300" cy="96" rx="8" ry="2" />
            </g>
          </g>

          {/* 좌우 도킹 포드(대칭) : 테두리 위 둥근 원통 + 도킹 링 */}
          {[56, 344].map((x) => (
            <g key={x}>
              <rect
                x={x - 16}
                y="104"
                width="32"
                height="34"
                rx="10"
                fill={`url(#${p}h-pod)`}
                stroke="#4a505c"
                strokeWidth="0.9"
              />
              <ellipse
                cx={x}
                cy="138"
                rx="13"
                ry="5"
                fill="#5b6170"
                stroke="#4a505c"
                strokeWidth="0.6"
              />
              <ellipse cx={x} cy="138" rx="7" ry="2.6" fill="#1b1f28" />
              <rect x={x - 16} y="114" width="32" height="3" fill="#0f766e" />
            </g>
          ))}

          {/* 뱃머리 둥근 화물 램프 + 가운데 앞 조종석 모듈(앞으로 갈수록 좁아지는 캡슐) */}
          <ellipse
            cx="200"
            cy="52"
            rx="40"
            ry="13"
            fill="#b9bfc9"
            stroke="#5b6170"
            strokeWidth="1"
          />
          <path
            d="M170 52 Q200 41 230 52"
            fill="none"
            stroke="#7d8492"
            strokeWidth="0.8"
          />
          <g className="ship-hauler-glow-win" fill="#5eead4">
            <circle cx="166" cy="54" r="1.6" />
            <circle cx="234" cy="54" r="1.6" />
          </g>
          <path
            d="M184 98 L187 50 Q200 38 213 50 L216 98 Z"
            fill={`url(#${p}h-pod)`}
            stroke="#5b6170"
            strokeWidth="1"
          />
          <g stroke="#7d8492" strokeWidth="0.7">
            <line x1="185.6" y1="72" x2="214.4" y2="72" />
            <line x1="184.8" y1="86" x2="215.2" y2="86" />
          </g>
          <path
            d="M191 50 Q200 42 209 50 L208 58 L192 58 Z"
            fill={`url(#${p}h-glass)`}
          />
          <path
            className="ship-hauler-glow-win"
            d="M191 50 Q200 42 209 50 L208 58 L192 58 Z"
            fill="#5eead4"
            fillOpacity="0.25"
          />
          <path
            d="M192.5 52.5 L196 48.5"
            stroke="#fff"
            strokeOpacity="0.55"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            className="ship-hot"
            d="M191 50 Q200 42 209 50 L208 58 L192 58 Z"
            fill="#e0f2fe"
          />

          {/* 상부 돔 + 쌍포탑(진행 방향 = 위) */}
          <ellipse
            cx="200"
            cy="124"
            rx="30"
            ry="17"
            fill="#c3c8d0"
            stroke="#5b6170"
            strokeWidth="1"
          />
          <ellipse cx="200" cy="121" rx="18" ry="10" fill="#e6e9ee" />
          <rect
            x="190"
            y="112"
            width="20"
            height="13"
            rx="3"
            fill="#9aa1ad"
            stroke="#4a505c"
            strokeWidth="0.7"
          />
          <g fill="#c3c8d0" stroke="#4a505c" strokeWidth="0.5">
            <rect x="193" y="101" width="3.2" height="12" rx="1" />
            <rect x="203.8" y="101" width="3.2" height="12" rx="1" />
          </g>
          <rect x="190" y="118" width="20" height="2.4" fill="#0f766e" />

          {/* 후방 엔진 갑판 : 윗면 뒤쪽 돋은 판 + 배기 슬릿 */}
          <path
            d="M132 170 Q200 186 268 170 L262 190 Q200 204 138 190 Z"
            fill={`url(#${p}h-pod)`}
            stroke="#4a505c"
            strokeWidth="0.9"
          />
          <g fill="#1b1f28">
            {[150, 166, 182, 218, 234, 250].map((x) => (
              <rect key={x} x={x - 4} y="181" width="8" height="3" rx="1.5" />
            ))}
          </g>
          <rect x="190" y="180" width="20" height="5" rx="1" fill="#0f766e" />

          {/* 후방 추진 노즐 3기(옆벽 아래 가장자리) : 깊은 원통 → 청록 발광 → 점프 백열·불꽃 */}
          {NOZZLE_X.map((x) => (
            <g key={x} transform={`translate(${x} 202)`}>
              <ellipse
                rx="17"
                ry="9"
                fill="#5b6170"
                stroke="#4a505c"
                strokeWidth="0.8"
              />
              <ellipse rx="13" ry="6.6" fill="#0b0f18" />
              <ellipse
                className="ship-hauler-glow-ex"
                rx="13"
                ry="6.6"
                fill={`url(#${p}h-ex)`}
              />
              <ellipse className="ship-hot" rx="15" ry="8" fill="#e0f2fe" />
              <ellipse
                className="ship-hauler-plume"
                rx="16"
                ry="12"
                fill={`url(#${p}h-plume)`}
              />
              <ellipse
                className="ship-hauler-plume ship-hauler-plume-b"
                rx="16"
                ry="12"
                fill={`url(#${p}h-plume)`}
              />
            </g>
          ))}

          {/* 명판 지지대 : 옆벽 아래 → 명판 */}
          <g fill="#7d8492" stroke="#4a505c" strokeWidth="0.6">
            <rect x="178" y="208" width="4" height="42" />
            <rect x="218" y="208" width="4" height="42" />
            <rect x="172" y="244" width="56" height="6" rx="1" />
          </g>
        </svg>
      </div>
      <div className="ship-hauler-plate">{dest}</div>
      <div className="ship-hauler-strut" aria-hidden />
      <div className="ship-hauler-console">
        <div className="ship-hauler-console-in">{body}</div>
      </div>
    </>
  )
}
