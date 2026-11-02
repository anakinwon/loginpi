// 유료 기체(BRIDGE) 껍데기 — 함교 메인 뷰스크린(뒤쪽 약간 위 추적 시점 순양함 + 조준 괄호 속 목적지 행성) → 목적지 명판(조준경 아이콘) → 콘솔 데스크(점프 = 스로틀 레버, CSS).
// 시안 c-bridge-screen-rear. <use> 복제본은 문서 선택자가 안 닿아 점프 백열·불꽃은 상속 변수(--ship-hot·--ship-plume·--ship-pulse-*). CSS = globals.css .ship-bridge-*
import { useId } from 'react'
import type { ShipSlots } from '.'

export function BridgeShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <div className="ship-bridge-bezel">
      <span className="ship-bridge-nav ship-bridge-nav-port" aria-hidden />
      <span className="ship-bridge-nav ship-bridge-nav-stbd" aria-hidden />
      {/* 뷰박스 400×180 slice — 360px 에서 x 38~362 가 보임 */}
      <div className="ship-bridge-screen">
        <div className="ship-bridge-streak" aria-hidden />
        <svg
          className="ship-bridge-view"
          viewBox="0 0 400 180"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <radialGradient id={`${p}planet`} cx="38%" cy="34%" r="70%">
              <stop offset="0" stopColor="#a5f3fc" />
              <stop offset="0.35" stopColor="#3b82f6" />
              <stop offset="0.75" stopColor="#312e81" />
              <stop offset="1" stopColor="#0b0f2a" />
            </radialGradient>
            <radialGradient id={`${p}atmo`} r="50%">
              <stop offset="0.7" stopColor="#67e8f9" stopOpacity="0" />
              <stop offset="0.82" stopColor="#67e8f9" stopOpacity="0.45" />
              <stop offset="1" stopColor="#67e8f9" stopOpacity="0" />
            </radialGradient>
            {/* 원반 윗면 : 앞(위·멀다) 쪽에 빛 */}
            <radialGradient id={`${p}g-saucer`} cx="0.5" cy="0.32" r="0.68">
              <stop offset="0" stopColor="#eef2f9" />
              <stop offset="0.55" stopColor="#a3aec5" />
              <stop offset="1" stopColor="#4b5672" />
            </radialGradient>
            <linearGradient id={`${p}g-rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5b6782" />
              <stop offset="1" stopColor="#161c2c" />
            </linearGradient>
            <linearGradient id={`${p}g-ridge`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7a86a2" />
              <stop offset="0.5" stopColor="#f1f4fa" />
              <stop offset="1" stopColor="#6b7792" />
            </linearGradient>
            <linearGradient id={`${p}g-neck`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3a445e" />
              <stop offset="0.5" stopColor="#a7b2c9" />
              <stop offset="1" stopColor="#4a5571" />
            </linearGradient>
            {/* 2차 선체 후면 : 위 모서리 밝고 아래 어두움 */}
            <linearGradient id={`${p}g-stern`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d5dceb" />
              <stop offset="0.55" stopColor="#8592ad" />
              <stop offset="1" stopColor="#3a445e" />
            </linearGradient>
            <linearGradient id={`${p}g-hangar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
              <stop offset="0.6" stopColor="#f59e0b" stopOpacity="0.55" />
              <stop offset="1" stopColor="#b45309" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id={`${p}g-pylon`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b6c0d4" />
              <stop offset="1" stopColor="#4a5571" />
            </linearGradient>
            {/* 나셀 관 : 관 단면 방향(축에 수직)으로 명암 */}
            <linearGradient
              id={`${p}g-nac`}
              gradientUnits="userSpaceOnUse"
              x1="84"
              y1="129"
              x2="106"
              y2="149"
            >
              <stop offset="0" stopColor="#3a445e" />
              <stop offset="0.35" stopColor="#dde3ef" />
              <stop offset="0.65" stopColor="#8592ad" />
              <stop offset="1" stopColor="#2a3249" />
            </linearGradient>
            {/* 배기구 안벽 : 푸른 발광 */}
            <radialGradient id={`${p}g-ex`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.35" stopColor="#bfdbfe" stopOpacity="0.12" />
              <stop offset="0.75" stopColor="#3b82f6" stopOpacity="0.9" />
              <stop offset="1" stopColor="#1e3a8a" stopOpacity="0.35" />
            </radialGradient>
            <radialGradient id={`${p}g-core`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f0f9ff" />
              <stop offset="0.55" stopColor="#7dd3fc" stopOpacity="0.8" />
              <stop offset="1" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}g-hot`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#e0f2fe" stopOpacity="0.85" />
              <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}g-plume`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#bae6fd" stopOpacity="0.6" />
              <stop offset="0.75" stopColor="#60a5fa" stopOpacity="0.35" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>

            {/* 파일런(왼쪽) : 2차 선체 옆 → 아래·바깥 나셀. 나셀·선체가 양 끝을 덮는다 */}
            <polygon
              id={`${p}pylon`}
              points="173,118 173,134 112,143 117,129"
              fill={`url(#${p}g-pylon)`}
              stroke="#2a3249"
              strokeWidth="0.7"
              strokeLinejoin="round"
            />

            {/* 배기 캡 : 원점 = 배기구 중심(보는 사람 쪽). 점프 백열·불꽃은 상속 변수(--hot·--plume)로 */}
            <g id={`${p}cap`}>
              <circle
                r="17.5"
                fill="#c9d3e6"
                stroke="#2a3249"
                strokeWidth="1"
              />
              <circle
                r="14.6"
                fill="#5b6782"
                stroke="#2a3249"
                strokeWidth="0.7"
              />
              <path
                d="M14.6 0H17.5M-14.6 0H-17.5M0 14.6V17.5M0 -14.6V-17.5M10.3 10.3L12.4 12.4M-10.3 10.3L-12.4 12.4M10.3 -10.3L12.4 -12.4M-10.3 -10.3L-12.4 -12.4"
                stroke="#2a3249"
                strokeWidth="0.8"
              />
              <circle r="12.2" fill="#050813" />
              <circle
                r="12.2"
                fill={`url(#${p}g-ex)`}
                style={{ animation: 'var(--ship-pulse-ex)' }}
              />
              <circle
                cy="-1"
                r="8.4"
                fill="none"
                stroke="#0b1020"
                strokeWidth="1.4"
                opacity="0.8"
              />
              <circle
                cy="-1.2"
                r="6.6"
                fill={`url(#${p}g-core)`}
                style={{ animation: 'var(--ship-pulse-core)' }}
              />
              <path
                d="M-12.5 -6 A14 14 0 0 1 -5 -13.5"
                stroke="#fff"
                strokeOpacity="0.55"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
              <circle
                r="22"
                fill={`url(#${p}g-hot)`}
                style={{
                  opacity: 'var(--ship-hot, 0)',
                  transition: 'opacity .35s',
                }}
              />
              <circle
                r="21"
                fill={`url(#${p}g-plume)`}
                style={{ opacity: '0', animation: 'var(--ship-plume)' }}
              />
              <circle
                r="21"
                fill={`url(#${p}g-plume)`}
                style={{
                  opacity: '0',
                  animation: 'var(--ship-plume)',
                  animationDelay: '.21s',
                }}
              />
            </g>

            {/* 나셀(왼쪽) : 가까운 후미(92,146 r17.5) → 먼 앞끝(126,108 r7), 축은 행성(소실점) 쪽 */}
            <g id={`${p}nac`}>
              <circle
                cx="126"
                cy="108"
                r="7"
                fill={`url(#${p}g-nac)`}
                stroke="#2a3249"
                strokeWidth="0.8"
              />
              <polygon
                points="79.3,134.7 120.8,103.3 131.2,112.7 104.7,157.3"
                fill={`url(#${p}g-nac)`}
                stroke="#2a3249"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              {/* 푸른 코일 띠(윗면) */}
              <path
                d="M86.9 141.5 L123.9 106.1"
                stroke="#60a5fa"
                strokeWidth="3"
                strokeLinecap="round"
                style={{ animation: 'var(--ship-pulse-coil)' }}
              />
              <path
                d="M86.9 141.5 L123.9 106.1"
                stroke="#e0f2fe"
                strokeWidth="1"
                strokeLinecap="round"
                style={{ animation: 'var(--ship-pulse-coil)' }}
              />
              <path
                d="M86.9 141.5 L123.9 106.1"
                stroke="#fff"
                strokeWidth="3.6"
                strokeLinecap="round"
                style={{
                  opacity: 'var(--ship-hot, 0)',
                  transition: 'opacity .35s',
                }}
              />
              {/* 관 마디 */}
              <path
                d="M95.9 122.1 L115.3 139.5 M110.4 111.2 L124.6 123.9"
                stroke="#2a3249"
                strokeOpacity="0.55"
                strokeWidth="0.8"
              />
              <use href={`#${p}cap`} transform="translate(92 146)" />
            </g>
          </defs>

          {/* 별 */}
          <g fill="#fff">
            <circle cx="52" cy="22" r="0.9" opacity="0.7" />
            <circle cx="86" cy="52" r="0.6" />
            <circle cx="130" cy="16" r="1" opacity="0.8" />
            <circle cx="150" cy="44" r="0.6" opacity="0.6" />
            <circle cx="262" cy="14" r="0.8" />
            <circle cx="300" cy="40" r="0.6" opacity="0.6" />
            <circle cx="344" cy="22" r="0.8" opacity="0.7" />
            <circle cx="330" cy="110" r="0.7" opacity="0.5" />
            <circle cx="60" cy="98" r="0.6" opacity="0.5" />
            <circle cx="350" cy="150" r="0.5" opacity="0.5" />
            <circle cx="48" cy="160" r="0.6" opacity="0.5" />
            <circle cx="240" cy="168" r="0.5" opacity="0.4" />
          </g>

          {/* 목적지 행성(멀다 · 소실점) + 대기 테. 점프 때 대기 테 밝아짐 */}
          <circle cx="200" cy="27" r="26" fill={`url(#${p}atmo)`} />
          <circle cx="200" cy="27" r="19" fill={`url(#${p}planet)`} />
          <path
            d="M183 29 Q200 36 218 24"
            stroke="#a5f3fc"
            strokeOpacity="0.18"
            strokeWidth="2.4"
            fill="none"
          />
          <circle
            className="ship-hot"
            cx="200"
            cy="27"
            r="21"
            fill="none"
            stroke="#a5f3fc"
            strokeWidth="1.6"
            strokeOpacity="0.85"
          />

          {/* 기체 : 뒤쪽 약간 위에서 본 추적 시점. 먼 것부터 그린다 */}
          <g className="ship-bridge-craft">
            <g>
              {/* 목 : 원반 아래 → 2차 선체(원반 테 아래로 조금 보임) */}
              <polygon
                points="186,96 214,96 222,114 178,114"
                fill={`url(#${p}g-neck)`}
                stroke="#2a3249"
                strokeWidth="0.7"
              />

              {/* 원반 1차 선체 : 테(두께) → 윗면 */}
              <ellipse
                cx="200"
                cy="82"
                rx="106"
                ry="22"
                fill={`url(#${p}g-rim)`}
              />
              <ellipse
                cx="200"
                cy="76"
                rx="106"
                ry="22"
                fill={`url(#${p}g-saucer)`}
                stroke="#c9d3e6"
                strokeOpacity="0.35"
                strokeWidth="0.8"
              />
              <ellipse
                cx="200"
                cy="76"
                rx="72"
                ry="15"
                fill="none"
                stroke="#4b5672"
                strokeOpacity="0.6"
                strokeWidth="0.8"
              />
              <ellipse
                cx="200"
                cy="76"
                rx="30"
                ry="6.4"
                fill="#cbd5e6"
                stroke="#5b6782"
                strokeWidth="0.6"
              />
              <path
                d="M226 79.2 L286.6 86.4 M174 79.2 L113.4 86.4 M174 72.8 L113.4 65.6 M189.7 70 L165.8 56.5 M210.3 70 L234.2 56.5 M226 72.8 L286.6 65.6"
                stroke="#4b5672"
                strokeOpacity="0.55"
                strokeWidth="0.7"
              />
              {/* 등줄기 능선 : 함교 돔 → 뒤 테 → 목으로 이어짐 */}
              <polygon
                points="197,73 203,73 209,98 191,98"
                fill={`url(#${p}g-ridge)`}
                stroke="#4b5672"
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
              <ellipse
                cx="200"
                cy="72"
                rx="11"
                ry="4.2"
                fill="#e8eef8"
                stroke="#5b6782"
                strokeWidth="0.6"
              />
              <ellipse
                cx="200"
                cy="70.6"
                rx="5"
                ry="1.7"
                fill="#fff"
                opacity="0.85"
              />
              <circle
                className="ship-bridge-strobe"
                cx="200"
                cy="67.6"
                r="1.3"
                fill="#fff"
              />
              {/* 뒤 테 창문 열 + 추진 슬릿 2개 */}
              <path
                d="M95 79 A105 22 0 0 0 305 79"
                fill="none"
                stroke="#fde68a"
                strokeOpacity="0.8"
                strokeWidth="1"
                strokeDasharray="1.4 3.4"
              />
              <rect
                className="ship-bridge-glow-ex"
                x="140"
                y="97"
                width="20"
                height="3.4"
                rx="1.7"
                fill="#fb923c"
                transform="rotate(6 150 98.7)"
              />
              <rect
                className="ship-bridge-glow-ex"
                x="240"
                y="97"
                width="20"
                height="3.4"
                rx="1.7"
                fill="#fb923c"
                transform="rotate(-6 250 98.7)"
              />
              {/* 항법등 : 뒤에서 보므로 좌현(적)=왼쪽, 우현(녹)=오른쪽 */}
              <circle cx="95" cy="79" r="4" fill="#f87171" opacity="0.25" />
              <circle cx="95" cy="79" r="1.9" fill="#f87171" />
              <circle cx="305" cy="79" r="4" fill="#4ade80" opacity="0.25" />
              <circle cx="305" cy="79" r="1.9" fill="#4ade80" />

              {/* 파일런 */}
              <use href={`#${p}pylon`} />
              <use href={`#${p}pylon`} transform="matrix(-1 0 0 1 400 0)" />

              {/* 2차 선체 후미 : 각진 선미 + 보라 띠 + 격납고 문 불빛 */}
              <polygon
                points="180,112 220,112 232,124 230,148 216,162 184,162 170,148 168,124"
                fill={`url(#${p}g-stern)`}
                stroke="#2a3249"
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <path
                d="M181 113.2 H219"
                stroke="#fff"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
              <rect x="168.5" y="126" width="63" height="2.6" fill="#7f22fe" />
              <path
                d="M171 140 H183 M217 140 H229"
                stroke="#4b5672"
                strokeWidth="0.8"
              />
              <circle cx="175" cy="150" r="1.6" fill="#2a3249" />
              <circle cx="225" cy="150" r="1.6" fill="#2a3249" />
              <rect
                x="185"
                y="133"
                width="30"
                height="24"
                rx="2.5"
                fill="#0b1020"
                stroke="#4b5672"
                strokeWidth="0.9"
              />
              <rect
                className="ship-bridge-glow-win"
                x="187"
                y="135"
                width="26"
                height="20"
                rx="1.5"
                fill={`url(#${p}g-hangar)`}
              />
              <rect
                className="ship-hot"
                x="187"
                y="135"
                width="26"
                height="20"
                rx="1.5"
                fill="#fef3c7"
                opacity="0"
              />
              <path
                d="M187 139.5 H213 M187 143.5 H213 M187 147.5 H213 M187 151.5 H213 M200 135 V155"
                stroke="#0b1020"
                strokeWidth="1"
              />
              <circle
                className="ship-bridge-glow-ex"
                cx="189"
                cy="159.6"
                r="1.1"
                fill="#fde68a"
              />
              <circle
                className="ship-bridge-glow-ex"
                cx="211"
                cy="159.6"
                r="1.1"
                fill="#fde68a"
              />
              <polygon
                points="196,161 204,161 201.5,171 198.5,171"
                fill="#5b6782"
                stroke="#2a3249"
                strokeWidth="0.6"
              />

              {/* 나셀 2기(가장 가깝다) */}
              <use href={`#${p}nac`} />
              <use href={`#${p}nac`} transform="matrix(-1 0 0 1 400 0)" />
            </g>
          </g>

          {/* 기체가 사라지는 순간 행성 중심 섬광 */}
          <circle
            className="ship-bridge-flare"
            cx="200"
            cy="27"
            r="12"
            fill={`url(#${p}g-hot)`}
          />

          {/* HUD 조준 괄호(맨 위) */}
          <path
            className="ship-bridge-hud-bracket"
            d="M179 5 H172 V12 M221 5 H228 V12 M179 50 H172 V43 M221 50 H228 V43"
            stroke="#67e8f9"
            strokeOpacity="0.8"
            strokeWidth="1.3"
            fill="none"
          />
        </svg>
      </div>
      <div className="ship-bridge-plate">
        <div>{dest}</div>
        <svg className="ship-bridge-lock" viewBox="0 0 24 24" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </div>
      <div className="ship-bridge-console">{body}</div>
    </div>
  )
}
