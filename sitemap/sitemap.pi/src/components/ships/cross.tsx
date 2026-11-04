// 유료 기체(CROSS) 껍데기 — 뒤쪽 약간 위에서 본 십자익(4익) 전투기(원통 엔진 노즐 4기 정면), 동체 아래 지지대에 목적지 명판, 그 아래 이중 베젤 콘솔.
// 시안 f-cross4-rear. 점프 = 노즐 백열·추진 불꽃 + 4익 십자 벌림(.ship-cross-wg rotate). <use> 복제본은 상속 변수로. CSS = globals.css .ship-cross-*
import { useId } from 'react'
import type { ShipSlots } from '.'

export function CrossShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <>
      <div className="ship-cross-frame">
        <svg viewBox="0 0 400 236" aria-hidden>
          <defs>
            <linearGradient id={`${p}g-wing`} x1="0" y1="0" x2="1" y2="0.4">
              <stop offset="0" stopColor="#aeb4be" />
              <stop offset="0.55" stopColor="#e6e9ee" />
              <stop offset="1" stopColor="#c3c8d0" />
            </linearGradient>
            <linearGradient id={`${p}g-hull`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6e7582" />
              <stop offset="0.38" stopColor="#f1f3f6" />
              <stop offset="0.62" stopColor="#d3d7de" />
              <stop offset="1" stopColor="#7d8492" />
            </linearGradient>
            {/* 후면 판 : 위 모서리(빛) 밝고 아래 어두움 */}
            <linearGradient id={`${p}g-rear`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e6e9ee" />
              <stop offset="0.6" stopColor="#b9bfc9" />
              <stop offset="1" stopColor="#8a92a0" />
            </linearGradient>
            <linearGradient id={`${p}g-eng`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5b6170" />
              <stop offset="0.4" stopColor="#e2e5ea" />
              <stop offset="1" stopColor="#6e7582" />
            </linearGradient>
            {/* 노즐 심 : 청백 */}
            <radialGradient id={`${p}g-core`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f0f9ff" />
              <stop offset="0.55" stopColor="#7dd3fc" stopOpacity="0.75" />
              <stop offset="1" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
            {/* 노즐 안벽 발광 : 주황 */}
            <radialGradient id={`${p}g-ex`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.35" stopColor="#fdba74" stopOpacity="0.15" />
              <stop offset="0.75" stopColor="#fb923c" stopOpacity="0.85" />
              <stop offset="1" stopColor="#ea580c" stopOpacity="0.25" />
            </radialGradient>
            <radialGradient id={`${p}g-hot`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#e0f2fe" stopOpacity="0.85" />
              <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}g-plume`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="0.45" stopColor="#bae6fd" stopOpacity="0.6" />
              <stop offset="0.75" stopColor="#fdba74" stopOpacity="0.35" />
              <stop offset="1" stopColor="#fb923c" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${p}g-glass`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0b1220" />
              <stop offset="1" stopColor="#103a3a" />
            </linearGradient>
            {/* 낡은 금속 : 얼룩·긁힘 반복(filter 없음) */}
            <pattern
              id={`${p}p-grime`}
              width="34"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <ellipse
                cx="8"
                cy="6"
                rx="5"
                ry="1.6"
                fill="#3a3f49"
                opacity="0.18"
              />
              <ellipse
                cx="24"
                cy="15"
                rx="3"
                ry="1"
                fill="#3a3f49"
                opacity="0.22"
              />
              <path
                d="M14 18 L22 17"
                stroke="#2a2e36"
                strokeWidth="0.5"
                opacity="0.3"
              />
              <circle cx="30" cy="4" r="0.8" fill="#2a2e36" opacity="0.35" />
            </pattern>

            {/* 왼쪽 위 날개 판(뒤 약간 위에서 본 윗면 띠) : 뿌리(178) → 끝(40) */}
            <polygon
              id={`${p}wing-shape`}
              points="178,118 178,140 46,78 40,64"
            />
            <clipPath id={`${p}c-wing`}>
              <use href={`#${p}wing-shape`} />
            </clipPath>
            <g id={`${p}wing-plate`}>
              <use href={`#${p}wing-shape`} fill={`url(#${p}g-wing)`} />
              <rect
                x="36"
                y="60"
                width="146"
                height="84"
                fill={`url(#${p}p-grime)`}
                clipPath={`url(#${p}c-wing)`}
              />
              {/* 붉은 띠 : 굵은 띠 + 가는 띠(날개 끝 쪽) */}
              <polygon points="62,73.5 74,78.8 76,93.5 64,88" fill="#c8372d" />
              <polygon
                points="80,81.5 84,83.3 86,98.3 82,96.4"
                fill="#c8372d"
              />
              {/* 뒷전 붉은 핀스트라이프(뿌리 쪽 절반) */}
              <line
                x1="112"
                y1="108.5"
                x2="178"
                y2="139"
                stroke="#c8372d"
                strokeWidth="1.3"
              />
              {/* 패널 선 */}
              <g stroke="#4a505c" strokeWidth="0.7" opacity="0.7" fill="none">
                <line x1="43" y1="71" x2="178" y2="129" />
                <line x1="104" y1="90" x2="105" y2="105" />
                <line x1="134" y1="101" x2="135" y2="119" />
              </g>
              <use
                href={`#${p}wing-shape`}
                fill="none"
                stroke="#5b6170"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </g>

            {/* <use> 복제본 안은 문서 선택자(.ship-jump .x)가 안 닿는다 → 상속되는 CSS 변수(--hot·--plume·--pulse-*)를 인라인 style 로 받는다.
                   원통 엔진(후면) : 원점 = 배기 노즐 중심, 몸통은 위(진행 방향·멀어짐)로 좁아지며 숨음 */}
            <g id={`${p}eng`}>
              <polygon
                points="-15,-2 15,-2 11,-27 -11,-27"
                fill={`url(#${p}g-eng)`}
                stroke="#4a505c"
                strokeWidth="0.6"
              />
              <polygon
                points="-13.4,-13 13.4,-13 12.8,-17 -12.8,-17"
                fill="#c8372d"
              />
              <ellipse
                cx="0"
                cy="-27"
                rx="11"
                ry="3"
                fill="#9aa1ad"
                stroke="#4a505c"
                strokeWidth="0.6"
              />
              {/* 노즐 : 겹 링 → 깊은 원통 → 내부 발광 */}
              <circle
                r="18"
                fill="#d3d7de"
                stroke="#5b6170"
                strokeWidth="1.1"
              />
              <circle
                r="15"
                fill="#7d8492"
                stroke="#4a505c"
                strokeWidth="0.8"
              />
              <circle r="12.4" fill="#0b0f18" />
              <circle
                r="12.4"
                fill={`url(#${p}g-ex)`}
                style={{ animation: 'var(--ship-pulse-ex)' }}
              />
              <circle
                cy="-1.2"
                r="8.6"
                fill="none"
                stroke="#1b1f28"
                strokeWidth="1.6"
                opacity="0.8"
              />
              <circle
                cy="-1.6"
                r="6.4"
                fill={`url(#${p}g-core)`}
                style={{ animation: 'var(--ship-pulse-core)' }}
              />
              <path
                d="M-12 -7 A14 14 0 0 1 -4 -14"
                stroke="#fff"
                strokeOpacity="0.55"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
              <circle
                r="19"
                fill={`url(#${p}g-hot)`}
                style={{
                  opacity: 'var(--ship-hot, 0)',
                  transition: 'opacity .35s',
                }}
              />
              <circle
                r="20"
                fill={`url(#${p}g-plume)`}
                style={{ opacity: '0', animation: 'var(--ship-plume)' }}
              />
              <circle
                r="20"
                fill={`url(#${p}g-plume)`}
                style={{
                  opacity: '0',
                  animation: 'var(--ship-plume)',
                  animationDelay: '.21s',
                }}
              />
            </g>

            {/* 날개 끝 포신 : 원점 = 날개 끝, 진행 방향(위)으로 원근 축소, 끝 소염기 작은 원 */}
            <g id={`${p}gun`}>
              <rect
                x="-4.5"
                y="-6"
                width="9"
                height="12"
                rx="1.5"
                fill="#9aa1ad"
                stroke="#4a505c"
                strokeWidth="0.6"
              />
              <rect x="-4.5" y="-1" width="9" height="2" fill="#c8372d" />
              <polygon
                points="-2,-6 2,-6 1.2,-32 -1.2,-32"
                fill="#c3c8d0"
                stroke="#4a505c"
                strokeWidth="0.4"
              />
              <circle cy="-33" r="2.4" fill="#5b6170" />
              <circle cy="-33" r="1" fill="#1b1f28" />
            </g>

            {/* 왼쪽 위 날개 세트 / 왼쪽 아래(위 판을 y=138 기준 상하 반전, 엔진·포신은 진행 방향 유지) */}
            <g id={`${p}set-up`}>
              <use href={`#${p}wing-plate`} />
              <use href={`#${p}gun`} transform="translate(43 71) rotate(10)" />
              {/* 엔진 받침 */}
              <rect x="153" y="103" width="10" height="9" rx="1" fill="#7d8492" stroke="#4a505c" strokeWidth="0.5" />
              <use href={`#${p}eng`} transform="translate(158 96) scale(0.72)" />
            </g>
            <g id={`${p}set-dn`}>
              <use
                href={`#${p}wing-plate`}
                transform="matrix(1 0 0 -1 0 276)"
              />
              <use href={`#${p}gun`} transform="translate(43 205) rotate(10)" />
              <rect x="153" y="164" width="10" height="9" rx="1" fill="#7d8492" stroke="#4a505c" strokeWidth="0.5" />
              <use href={`#${p}eng`} transform="translate(158 180) scale(0.72)" />
            </g>
          </defs>

          {/* 동체 축소(마스터 2026-11-04 "본체가 상대적으로 너무 크다") — 폭 78%·높이 92%, 지지대 아래끝(200,236) 고정 */}
          <g transform="translate(200 236) scale(0.78 0.92) translate(-200 -236)">
          {/* 동체 윗면 : 뒤(아래·가까움) 넓고 앞(위·멀어짐)으로 좁아지는 원근 사다리꼴 */}
          <polygon
            points="172,152 228,152 210,36 200,26 190,36"
            fill={`url(#${p}g-hull)`}
            stroke="#5b6170"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points="172,152 228,152 210,36 200,26 190,36"
            fill={`url(#${p}p-grime)`}
          />
          <g stroke="#4a505c" strokeWidth="0.7" opacity="0.7" fill="none">
            <line x1="187" y1="60" x2="213" y2="60" />
            <line x1="183" y1="86" x2="217" y2="86" />
            <line x1="176" y1="140" x2="224" y2="140" />
          </g>
          {/* 붉은 척추선(멀어지며 가늘어짐) */}
          <polygon points="199.3,38 200.7,38 202,92 198,92" fill="#c8372d" />

          {/* 캐노피 뒷부분 : 위(앞)로 기운 유리 + 뒤 받침 판 */}
          <polygon points="186,96 214,96 222,128 178,128" fill="#5b6170" />
          <polygon
            points="188.5,99 211.5,99 216,118 184,118"
            fill={`url(#${p}g-glass)`}
          />
          <polygon
            className="ship-cross-glow-win"
            points="188.5,99 211.5,99 216,118 184,118"
            fill="#5eead4"
            fillOpacity="0.22"
          />
          <line
            x1="200"
            y1="99"
            x2="200"
            y2="118"
            stroke="#9aa1ad"
            strokeWidth="1.6"
          />
          <path
            d="M187 112 L190 102"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <polygon
            className="ship-hot"
            points="188.5,99 211.5,99 216,118 184,118"
            fill="#e0f2fe"
          />
          <rect x="180" y="120" width="40" height="6" fill="#9aa1ad" />
          </g>

          {/* 4익 X : 기본 각도는 판 모양, 점프 전개 = 바깥 .wg CSS rotate(±7). 오른쪽은 좌우 반전 재사용. 동체 윗면 위 · 후면 판 아래에 겹침 */}
          <g className="ship-cross-wg ship-cross-wg-ll">
            <use href={`#${p}set-dn`} />
          </g>
          <g className="ship-cross-wg ship-cross-wg-lr">
            <use href={`#${p}set-dn`} transform="matrix(-1 0 0 1 400 0)" />
          </g>
          <g className="ship-cross-wg ship-cross-wg-ul">
            <use href={`#${p}set-up`} />
          </g>
          <g className="ship-cross-wg ship-cross-wg-ur">
            <use href={`#${p}set-up`} transform="matrix(-1 0 0 1 400 0)" />
          </g>

          <g transform="translate(200 236) scale(0.78 0.92) translate(-200 -236)">
          {/* 동체 후면 : 각진 사각 단면(모서리 깎임) */}
          <polygon
            points="178,146 222,146 232,156 232,198 222,208 178,208 168,198 168,156"
            fill={`url(#${p}g-rear)`}
            stroke="#5b6170"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points="178,146 222,146 232,156 232,198 222,208 178,208 168,198 168,156"
            fill={`url(#${p}p-grime)`}
          />
          <rect x="169" y="152" width="62" height="4" fill="#c8372d" />
          {/* 정비 해치 : 사각 판 + 볼트 + 작은 계기 판 */}
          <rect
            x="182"
            y="162"
            width="36"
            height="34"
            rx="2"
            fill="#aeb4be"
            stroke="#4a505c"
            strokeWidth="0.9"
          />
          <g fill="#5b6170">
            <circle cx="185.5" cy="165.5" r="1.3" />
            <circle cx="214.5" cy="165.5" r="1.3" />
            <circle cx="185.5" cy="192.5" r="1.3" />
            <circle cx="214.5" cy="192.5" r="1.3" />
          </g>
          <rect
            x="190"
            y="168"
            width="20"
            height="9"
            rx="1.2"
            fill="#0b1220"
            stroke="#4a505c"
            strokeWidth="0.6"
          />
          <rect
            className="ship-cross-glow-win"
            x="192"
            y="170"
            width="9"
            height="5"
            fill="#5eead4"
            fillOpacity="0.55"
          />
          <circle
            className="ship-cross-glow-ex"
            cx="205.5"
            cy="172.5"
            r="1.6"
            fill="#f87171"
          />
          <g stroke="#4a505c" strokeWidth="0.8">
            <line x1="190" y1="183" x2="210" y2="183" />
            <line x1="190" y1="187" x2="204" y2="187" />
          </g>
          {/* 꼬리 배기 슬릿 */}
          <rect x="186" y="199" width="28" height="5" rx="2.5" fill="#1b1f28" />
          <rect
            className="ship-cross-glow-ex"
            x="189"
            y="200"
            width="22"
            height="3"
            rx="1.5"
            fill="#fb923c"
          />
          {/* 명판 지지대 : 후면 아래 → 명판 */}
          <g fill="#7d8492" stroke="#4a505c" strokeWidth="0.6">
            <rect x="187" y="208" width="4" height="28" />
            <rect x="209" y="208" width="4" height="28" />
            <rect x="184" y="230" width="32" height="6" rx="1" />
          </g>
          </g>
        </svg>
      </div>
      <div className="ship-cross-plate">{dest}</div>
      <div className="ship-cross-strut" aria-hidden />
      <div className="ship-cross-console">
        <div className="ship-cross-console-in">{body}</div>
      </div>
    </>
  )
}
