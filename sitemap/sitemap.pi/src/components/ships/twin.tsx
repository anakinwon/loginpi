// 유료 기체(TWIN) 껍데기 — 정면 양날개 요격기(금속 구체 조종석 + 8각 날개 판 2장) 아래 두 날개 사이 목적지 명판, 지지대에 매달린 이중 베젤 콘솔.
// 시안 d-twin-wing. SVG 안은 opacity 맥동만. CSS = globals.css .ship-twin-*
import { useId } from 'react'
import type { ShipSlots } from '.'

export function TwinShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <>
      <div className="ship-twin-frame">
        <svg viewBox="0 0 400 214" aria-hidden>
          <defs>
            {/* 구체 음영 : 왼쪽 위 광원 */}
            <radialGradient id={`${p}g-sphere`} cx="0.36" cy="0.3" r="0.78">
              <stop offset="0" stopColor="#eef1f6" />
              <stop offset="0.35" stopColor="#9aa3b4" />
              <stop offset="0.75" stopColor="#454c5c" />
              <stop offset="1" stopColor="#1b1f28" />
            </radialGradient>
            {/* 창 유리 : 중심 청록 계기 빛, 아래 붉은 빛 */}
            <radialGradient id={`${p}g-glass`} cx="0.5" cy="0.45" r="0.6">
              <stop offset="0" stopColor="#0c3b3a" />
              <stop offset="0.6" stopColor="#070d16" />
              <stop offset="1" stopColor="#03050a" />
            </radialGradient>
            <radialGradient id={`${p}g-teal`} cx="0.42" cy="0.4" r="0.5">
              <stop offset="0" stopColor="#5eead4" stopOpacity="0.75" />
              <stop offset="1" stopColor="#5eead4" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}g-ember`} cx="0.6" cy="0.78" r="0.35">
              <stop offset="0" stopColor="#f87171" stopOpacity="0.7" />
              <stop offset="1" stopColor="#f87171" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}g-hot`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#e0f2fe" stopOpacity="0.85" />
              <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
            </radialGradient>
            {/* 날개 : 윗판(빛 받음) / 아랫판(꺾여 그늘) */}
            <linearGradient id={`${p}g-wing-up`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1c2436" />
              <stop offset="1" stopColor="#0c111c" />
            </linearGradient>
            <linearGradient id={`${p}g-wing-dn`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0a0e17" />
              <stop offset="1" stopColor="#05070c" />
            </linearGradient>
            <linearGradient id={`${p}g-pylon`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#c3cad6" />
              <stop offset="0.5" stopColor="#6b7385" />
              <stop offset="1" stopColor="#2a303d" />
            </linearGradient>
            {/* 태양전지 격자 : 엇갈린 벽돌형(줄마다 반 칸 밀림) */}
            <pattern
              id={`${p}p-cells`}
              width="12"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 0.5H12M0 5.5H12M0.5 0.5V5.5M6.5 5.5V10"
                stroke="#3b4a66"
                strokeWidth="0.7"
                fill="none"
              />
            </pattern>
            {/* 왼쪽 날개 윤곽 : 가운데(y=107)에서 바깥으로 꺾인 8각 */}
            <polygon
              id={`${p}wing`}
              points="70,107 60,28 38,4 10,22 20,107 10,192 38,210 60,186"
            />
            <clipPath id={`${p}c-wing`}>
              <use href={`#${p}wing`} />
            </clipPath>
            <g id={`${p}wing-full`}>
              <use href={`#${p}wing`} fill={`url(#${p}g-wing-up)`} />
              <polygon
                points="70,107 60,186 38,210 10,192 20,107"
                fill={`url(#${p}g-wing-dn)`}
              />
              <rect
                x="0"
                y="0"
                width="80"
                height="214"
                fill={`url(#${p}p-cells)`}
                clipPath={`url(#${p}c-wing)`}
              />
              {/* 꺾임선 + 세로 척추(고유 변형 : 척추가 바깥쪽으로 치우침) */}
              <line
                x1="20"
                y1="107"
                x2="70"
                y2="107"
                stroke="#8a93a6"
                strokeWidth="2.4"
              />
              <line
                x1="36"
                y1="10"
                x2="36"
                y2="204"
                stroke="#5a6375"
                strokeWidth="1.6"
              />
              {/* 프레임 + 안쪽 홈 */}
              <use
                href={`#${p}wing`}
                fill="none"
                stroke="#9aa3b4"
                strokeWidth="3.2"
                strokeLinejoin="round"
              />
              <use
                href={`#${p}wing`}
                fill="none"
                stroke="#1b1f28"
                strokeWidth="0.8"
                transform="translate(40 107) scale(0.9) translate(-40 -107)"
              />
              {/* 안쪽 모서리 글로우 */}
              <polyline
                className="ship-twin-glow-edge"
                points="60,30 70,107 60,184"
                fill="none"
                stroke="#5eead4"
                strokeOpacity="0.55"
                strokeWidth="1.2"
              />
              {/* 리벳 */}
              <g fill="#d5dbe6">
                <circle cx="38" cy="7" r="1.4" />
                <circle cx="13" cy="23" r="1.4" />
                <circle cx="58" cy="29" r="1.4" />
                <circle cx="22" cy="107" r="1.6" />
                <circle cx="67" cy="107" r="1.6" />
                <circle cx="13" cy="191" r="1.4" />
                <circle cx="38" cy="207" r="1.4" />
                <circle cx="58" cy="185" r="1.4" />
              </g>
            </g>
            {/* 파일런(왼쪽) : 날개 → 구체, 칼라 링 2개 */}
            <g id={`${p}pylon`}>
              <path
                d="M66 99 L142 102 L142 112 L66 115 Z"
                fill={`url(#${p}g-pylon)`}
              />
              <rect
                x="122"
                y="97"
                width="7"
                height="20"
                rx="1.5"
                fill="#5a6375"
              />
              <rect
                x="84"
                y="100"
                width="4"
                height="14"
                rx="1"
                fill="#3a4150"
              />
            </g>
          </defs>

          {/* 날개·파일런 (오른쪽은 좌우 반전 재사용) */}
          <use href={`#${p}pylon`} />
          <use href={`#${p}pylon`} transform="translate(400 0) scale(-1 1)" />
          <use href={`#${p}wing-full`} />
          <use
            href={`#${p}wing-full`}
            transform="translate(400 0) scale(-1 1)"
          />

          {/* 조종석 구체 */}
          <circle cx="200" cy="96" r="64" fill={`url(#${p}g-sphere)`} />
          {/* 외피 홈 : 위 아치 + 적도 */}
          <path
            d="M146 66 A64 64 0 0 1 254 66"
            fill="none"
            stroke="#2a303d"
            strokeWidth="1.2"
            opacity="0.6"
          />
          <path
            d="M137 108 Q200 124 263 108"
            fill="none"
            stroke="#2a303d"
            strokeWidth="1.4"
            opacity="0.7"
          />
          {/* 하부 엔진 배기 */}
          <rect x="186" y="150" width="28" height="7" rx="3.5" fill="#0b0f19" />
          <rect
            className="ship-twin-glow-eng"
            x="189"
            y="152"
            width="22"
            height="3"
            rx="1.5"
            fill="#5eead4"
          />

          {/* 전면 창 */}
          <circle cx="200" cy="90" r="40" fill="#3a4150" />
          <circle cx="200" cy="90" r="36" fill={`url(#${p}g-glass)`} />
          <circle
            className="ship-twin-glow-win"
            cx="200"
            cy="90"
            r="36"
            fill={`url(#${p}g-teal)`}
          />
          <circle
            className="ship-twin-glow-win"
            cx="200"
            cy="90"
            r="36"
            fill={`url(#${p}g-ember)`}
            style={{ animationDelay: '-1.3s' }}
          />
          {/* 살대 : 비대칭 5갈래(위가 비어 있는 별자리형) + 동심 링 + 육각 렌즈 */}
          <g stroke="#8a93a6" strokeWidth="3" strokeLinecap="round">
            <line x1="200" y1="90" x2="166" y2="79" />
            <line x1="200" y1="90" x2="234" y2="79" />
            <line x1="200" y1="90" x2="178" y2="119" />
            <line x1="200" y1="90" x2="222" y2="119" />
            <line x1="200" y1="90" x2="200" y2="126" />
          </g>
          <circle
            cx="200"
            cy="90"
            r="21"
            fill="none"
            stroke="#8a93a6"
            strokeWidth="2"
          />
          <polygon
            points="200,80 209,85 209,95 200,100 191,95 191,85"
            fill="#1b2230"
            stroke="#c3cad6"
            strokeWidth="1.6"
          />
          <circle
            className="ship-twin-glow-win"
            cx="200"
            cy="90"
            r="3"
            fill="#5eead4"
          />
          <circle
            cx="200"
            cy="90"
            r="40"
            fill="none"
            stroke="#c3cad6"
            strokeWidth="1.2"
          />
          {/* 창 하이라이트 */}
          <path
            d="M174 70 A34 34 0 0 1 196 57"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* 점프 백열 (평상시 0) */}
          <circle
            className="ship-hot"
            cx="200"
            cy="90"
            r="46"
            fill={`url(#${p}g-hot)`}
          />
          <ellipse
            className="ship-hot"
            cx="200"
            cy="154"
            rx="30"
            ry="12"
            fill={`url(#${p}g-hot)`}
          />
        </svg>
        <div className="ship-twin-plate">{dest}</div>
      </div>
      <div className="ship-twin-strut" aria-hidden />
      <div className="ship-twin-console">
        <div className="ship-twin-console-in">{body}</div>
      </div>
    </>
  )
}
