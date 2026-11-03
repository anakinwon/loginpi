// 유료 기체(DAGGER) 껍데기 — 뒤쪽 약간 위에서 본 단검형 돌격기(3연 붉은 배기구·격자 날개 판 2쌍), 단검 꼬리 끝이 목적지 명판 홈에 꽂히고 그 아래 이중 베젤 콘솔.
// 시안 e-dagger-wing-rear. 점프 = 배기구 백열 + 추진 불꽃(로컬 원점 scale). CSS = globals.css .ship-dagger-*
import { useId } from 'react'
import type { ShipSlots } from '.'

export function DaggerShip({ dest, body }: ShipSlots) {
  const p = useId().replace(/\W/g, '')
  return (
    <>
      <div className="ship-dagger-frame">
        <svg viewBox="0 0 400 220" aria-hidden>
          <defs>
            {/* 회흑 금속 : 위 광원 */}
            <linearGradient id={`${p}e-gun`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6b717d" />
              <stop offset="0.45" stopColor="#363a43" />
              <stop offset="1" stopColor="#17191e" />
            </linearGradient>
            {/* 등판 : 왼쪽 빛, 오른쪽 그늘 */}
            <linearGradient id={`${p}e-hull`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3a3e47" />
              <stop offset="0.35" stopColor="#8a909b" />
              <stop offset="0.6" stopColor="#4a4f59" />
              <stop offset="1" stopColor="#1d2026" />
            </linearGradient>
            {/* 후면 판 : 위 모서리(빛) 밝고 아래 어두움 */}
            <linearGradient id={`${p}e-rear`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7a808b" />
              <stop offset="0.25" stopColor="#474c56" />
              <stop offset="1" stopColor="#1a1c21" />
            </linearGradient>
            {/* 단검 꼬리 두 면 : 빛 받는 왼쪽 / 그늘진 오른쪽 */}
            <linearGradient id={`${p}e-blade-l`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8a909b" />
              <stop offset="0.5" stopColor="#474c56" />
              <stop offset="1" stopColor="#22252b" />
            </linearGradient>
            <linearGradient id={`${p}e-blade-r`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a3e47" />
              <stop offset="1" stopColor="#121418" />
            </linearGradient>
            {/* 조종석 유리 : 어두운 유리 + 아래쪽 붉은 내부광 */}
            <linearGradient id={`${p}e-glass`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a1d24" />
              <stop offset="1" stopColor="#07080a" />
            </linearGradient>
            <radialGradient id={`${p}e-red-in`} cx="0.5" cy="0.75" r="0.6">
              <stop offset="0" stopColor="#f87171" stopOpacity="0.85" />
              <stop offset="1" stopColor="#b91c1c" stopOpacity="0" />
            </radialGradient>
            {/* 배기구 안 붉은 발광 : 심 밝고 가장자리 어두운 진홍 */}
            <radialGradient id={`${p}e-ex`} cx="0.5" cy="0.55" r="0.62">
              <stop offset="0" stopColor="#fecaca" />
              <stop offset="0.35" stopColor="#ef4444" />
              <stop offset="1" stopColor="#7f1d1d" />
            </radialGradient>
            {/* 점프 백열 : 흰 심 → 크림 → 주황 투명 */}
            <radialGradient id={`${p}e-hot`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor="#ffedd5" stopOpacity="0.9" />
              <stop offset="1" stopColor="#f97316" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${p}e-plume`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="0.4" stopColor="#fecaca" stopOpacity="0.7" />
              <stop offset="0.72" stopColor="#ef4444" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            {/* 날개 격자 : 날개 뻗는 방향(약 52°)으로 정렬한 정사각 칸 */}
            <pattern
              id={`${p}e-grid`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(52)"
            >
              <path
                d="M0 0.5H7M0.5 0V7"
                stroke="#3a3f4a"
                strokeWidth="0.7"
                fill="none"
              />
            </pattern>

            {/* 왼쪽 위 날개 판 : 뿌리(엔진 블록 114,94·92,108) → 끝 가장자리(78,8·8,40)로 넓어지는 사다리꼴.
                   꺾임선(99,58 ↔ 46,71)에서 안쪽 면(밝음)·바깥 면(어두움) 2면 + 왼아래 두께 띠 = 넓은 판이 바깥으로 꺾인 입체 */}
            <polygon id={`${p}e-wing`} points="114,94 78,8 8,40 92,108" />
            <g id={`${p}e-wing-up`}>
              <use
                href={`#${p}e-wing`}
                transform="translate(-2 3)"
                fill="#3a3e47"
              />
              <polygon points="114,94 99,58 46,71 92,108" fill="#17191e" />
              <polygon points="99,58 78,8 8,40 46,71" fill="#0c0d11" />
              <use href={`#${p}e-wing`} fill={`url(#${p}e-grid)`} />
              <line
                x1="103"
                y1="101"
                x2="43"
                y2="24"
                stroke="#2b2e35"
                strokeWidth="1.4"
              />
              <line
                x1="99"
                y1="58"
                x2="46"
                y2="71"
                stroke="#5f6570"
                strokeWidth="1.8"
              />
              <use
                href={`#${p}e-wing`}
                fill="none"
                stroke="#7a808b"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <line
                x1="77"
                y1="9.5"
                x2="10"
                y2="40"
                stroke="#c9ced8"
                strokeWidth="1"
                opacity="0.55"
              />
            </g>

            {/* 한쪽 날개 세트 : 위 날개 + 아래 날개(y=112 기준 상하 반전) + 엔진 블록 + 가로 동체. 오른쪽은 좌우 반전 재사용 */}
            <g id={`${p}e-side`}>
              <use href={`#${p}e-wing-up`} />
              <use href={`#${p}e-wing-up`} transform="matrix(1 0 0 -1 0 224)" />
              {/* 가로 동체 : 엔진 블록 ↔ 후면 판 */}
              <polygon
                points="116,104 160,102 160,122 116,120"
                fill={`url(#${p}e-gun)`}
                stroke="#1b1d22"
                strokeWidth="0.8"
              />
              <line
                x1="116"
                y1="104.5"
                x2="160"
                y2="102.5"
                stroke="#b4bac5"
                strokeWidth="1"
              />
              <g stroke="#1b1d22" strokeWidth="1">
                <line x1="134" y1="103.3" x2="134" y2="120.7" />
                <line x1="148" y1="102.7" x2="148" y2="121.4" />
              </g>
              {/* 엔진 블록(날개 뿌리) : 8각 금속 블록 + 패널선 + 리벳 */}
              <polygon
                points="98,92 112,92 118,98 118,126 112,132 98,132 92,126 92,98"
                fill={`url(#${p}e-gun)`}
                stroke="#9aa0ab"
                strokeWidth="1.2"
              />
              <line
                x1="92"
                y1="112"
                x2="118"
                y2="112"
                stroke="#1b1d22"
                strokeWidth="1.2"
              />
              <line
                x1="105"
                y1="92"
                x2="105"
                y2="132"
                stroke="#1b1d22"
                strokeWidth="0.8"
                opacity="0.7"
              />
              <g fill="#c9ced8">
                <circle cx="98" cy="97" r="1.1" />
                <circle cx="112" cy="97" r="1.1" />
                <circle cx="98" cy="127" r="1.1" />
                <circle cx="112" cy="127" r="1.1" />
              </g>
            </g>
          </defs>

          {/* 날개 세트 (오른쪽은 좌우 반전 재사용) */}
          <use href={`#${p}e-side`} />
          <use href={`#${p}e-side`} transform="matrix(-1 0 0 1 400 0)" />

          {/* 등판 : 뒤(아래·가까움) 넓고 앞(위·멀어짐)으로 좁아지는 원근 단검 등 */}
          <polygon
            points="164,86 236,86 213,34 200,20 187,34"
            fill={`url(#${p}e-hull)`}
            stroke="#9aa0ab"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <line
            x1="200"
            y1="22"
            x2="200"
            y2="86"
            stroke="#0e1013"
            strokeWidth="1.2"
          />
          <g stroke="#14161a" strokeWidth="1">
            <line x1="172" y1="70" x2="228" y2="70" />
            <line x1="168" y1="78" x2="232" y2="78" />
          </g>
          {/* 조종석 뒷모습 : 멀리 작게 보이는 6각 창 + 붉은 내부광 */}
          <polygon
            points="191,40 209,40 214,51 209,62 191,62 186,51"
            fill="#2b2e35"
            stroke="#b4bac5"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon
            points="193,42.5 207,42.5 211,51 207,59.5 193,59.5 189,51"
            fill={`url(#${p}e-glass)`}
          />
          <polygon
            className="ship-dagger-glow-win"
            points="193,42.5 207,42.5 211,51 207,59.5 193,59.5 189,51"
            fill={`url(#${p}e-red-in)`}
          />
          <line
            x1="189"
            y1="51"
            x2="211"
            y2="51"
            stroke="#6b717d"
            strokeWidth="1.4"
          />
          {/* 짧은 안테나 + 끝 붉은 등 */}
          <rect
            x="217"
            y="78"
            width="7"
            height="4"
            rx="1"
            fill="#2b2e35"
            stroke="#7a808b"
            strokeWidth="0.6"
          />
          <line
            x1="220.5"
            y1="78"
            x2="223"
            y2="57"
            stroke="#9aa0ab"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle
            className="ship-dagger-glow-eng"
            cx="223.2"
            cy="56"
            r="1.8"
            fill="#ef4444"
            style={{ animationDelay: '-0.5s' }}
          />

          {/* 단검 꼬리 : 후면 판 아래로 짧게, 끝(200,221)이 명판 홈에 꽂힘 */}
          <polygon
            points="176,140 200,140 200,221"
            fill={`url(#${p}e-blade-l)`}
          />
          <polygon
            points="200,140 224,140 200,221"
            fill={`url(#${p}e-blade-r)`}
          />
          <polygon
            points="176,140 224,140 200,221"
            fill="none"
            stroke="#9aa0ab"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <line
            x1="200"
            y1="146"
            x2="200"
            y2="216"
            stroke="#0e1013"
            strokeWidth="1.2"
          />
          <line
            x1="186"
            y1="172"
            x2="214"
            y2="172"
            stroke="#14161a"
            strokeWidth="1"
          />
          <line
            className="ship-dagger-glow-edge"
            x1="177.5"
            y1="143"
            x2="199.5"
            y2="218"
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <circle
            className="ship-dagger-glow-edge"
            cx="200"
            cy="219"
            r="1.6"
            fill="#fca5a5"
          />

          {/* 동체 후면 판 : 각진 8각 단면 */}
          <polygon
            points="172,84 228,84 242,98 242,134 228,146 172,146 158,134 158,98"
            fill={`url(#${p}e-rear)`}
            stroke="#9aa0ab"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <line
            x1="173"
            y1="85"
            x2="227"
            y2="85"
            stroke="#c9ced8"
            strokeWidth="1"
            opacity="0.7"
          />
          <rect
            x="162"
            y="93"
            width="76"
            height="40"
            rx="3"
            fill="#111317"
            stroke="#4a4f5a"
            strokeWidth="0.9"
          />
          <line
            x1="164"
            y1="139"
            x2="236"
            y2="139"
            stroke="#14161a"
            strokeWidth="1"
          />
          <g fill="#c9ced8">
            <circle cx="166" cy="89" r="1.1" />
            <circle cx="234" cy="89" r="1.1" />
            <circle cx="166" cy="142" r="1.1" />
            <circle cx="234" cy="142" r="1.1" />
          </g>

          {/* 점프 백열 후광 (평상시 0) */}
          <ellipse
            className="ship-hot"
            cx="200"
            cy="113"
            rx="58"
            ry="34"
            fill={`url(#${p}e-hot)`}
          />

          {/* 3연 배기구 : 각진 사다리꼴 창 — 안쪽 흑적 → 붉은 발광(맥동) → 점프 백열 → 격자 살대 → 테 */}
          <g>
            <polygon points="167,98 186,98 185,128 171,128" fill="#1a0507" />
            <polygon points="191,98 209,98 207,128 193,128" fill="#1a0507" />
            <polygon points="214,98 233,98 229,128 215,128" fill="#1a0507" />
            <polygon
              className="ship-dagger-glow-eng"
              points="167,98 186,98 185,128 171,128"
              fill={`url(#${p}e-ex)`}
            />
            <polygon
              className="ship-dagger-glow-eng"
              points="191,98 209,98 207,128 193,128"
              fill={`url(#${p}e-ex)`}
              style={{ animationDelay: '-0.3s' }}
            />
            <polygon
              className="ship-dagger-glow-eng"
              points="214,98 233,98 229,128 215,128"
              fill={`url(#${p}e-ex)`}
              style={{ animationDelay: '-0.6s' }}
            />
            <polygon
              className="ship-hot"
              points="167,98 186,98 185,128 171,128"
              fill={`url(#${p}e-hot)`}
            />
            <polygon
              className="ship-hot"
              points="191,98 209,98 207,128 193,128"
              fill={`url(#${p}e-hot)`}
            />
            <polygon
              className="ship-hot"
              points="214,98 233,98 229,128 215,128"
              fill={`url(#${p}e-hot)`}
            />
            <g stroke="#17191e" strokeWidth="1.3">
              <line x1="174" y1="98" x2="175" y2="128" />
              <line x1="180" y1="98" x2="180" y2="128" />
              <line x1="197" y1="98" x2="197.5" y2="128" />
              <line x1="203" y1="98" x2="202.5" y2="128" />
              <line x1="220" y1="98" x2="220" y2="128" />
              <line x1="226" y1="98" x2="225" y2="128" />
              <line x1="168" y1="108" x2="232" y2="108" />
              <line x1="169" y1="118" x2="231" y2="118" />
            </g>
            <g
              fill="none"
              stroke="#9aa0ab"
              strokeWidth="1.1"
              strokeLinejoin="round"
            >
              <polygon points="167,98 186,98 185,128 171,128" />
              <polygon points="191,98 209,98 207,128 193,128" />
              <polygon points="214,98 233,98 229,128 215,128" />
            </g>
          </g>

          {/* 추진 불꽃 : 배기구 중심 로컬 원점에서 보는 사람 쪽으로 확산 (점프 때만) */}
          <g transform="translate(177 113)">
            <ellipse
              className="ship-dagger-plume"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
            <ellipse
              className="ship-dagger-plume ship-dagger-plume-b"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
          </g>
          <g transform="translate(200 113)">
            <ellipse
              className="ship-dagger-plume"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
            <ellipse
              className="ship-dagger-plume ship-dagger-plume-b"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
          </g>
          <g transform="translate(223 113)">
            <ellipse
              className="ship-dagger-plume"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
            <ellipse
              className="ship-dagger-plume ship-dagger-plume-b"
              rx="12"
              ry="17"
              fill={`url(#${p}e-plume)`}
            />
          </g>
        </svg>
      </div>
      <div className="ship-dagger-plate">{dest}</div>
      <div className="ship-dagger-strut" aria-hidden />
      <div className="ship-dagger-console">
        <div className="ship-dagger-console-in">{body}</div>
      </div>
    </>
  )
}
