'use client'
// 메인 공개 영역(로그인 전, 마스터 결정 2026-10-21) — 소개·흐름(구현 완료 단계만)·역할 7종·요금제 이름과 열리는 메뉴(가격은 결제 화면에서만)
// API 호출 없음(고정 문구 + roles.ts). 로그인하면 숨김 — 로그인 버튼은 아래 LoginGate 가 그대로 담당(UA 판정·redirect 없음)
import { ArrowRight, CodeXml, DatabaseZap, Hexagon, Layers, Network, ScanText, Waypoints } from 'lucide-react'
import { useAppUser } from './google-auth'
import { PLAN_NM, PLAN_PERMS, PLANS, ROLE_DESC, ROLE_NM, ROLES } from '@/lib/roles'

// 표준 → 모델 → ERD → DDL(MASTER_ROADMAP 1~4단계 중 구현된 범위, 이행·CDC·분석은 미착수라 넣지 않음)
const FLOW = [
  { Icon: ScanText, nm: '표준단어', desc: '단어·약어·금칙어' },
  { Icon: Hexagon, nm: '표준도메인', desc: '타입·길이 규칙' },
  { Icon: Layers, nm: '표준용어', desc: '단어 결합·승인' },
  { Icon: Waypoints, nm: '데이터 모델', desc: '개념·논리·물리' },
  { Icon: Network, nm: 'ERD', desc: '주제영역별·버전 비교' },
  { Icon: CodeXml, nm: 'DDL', desc: 'DBMS별 생성·승인 실행' },
]
// 요금제별로 열리는 메뉴(roles.ts PLAN_PERMS 의 메뉴 권한 → 화면 이름)
const MENU_NM: Record<string, string> = { MENU_STD: '표준사전', MENU_SQL: 'SQL 편집기', MENU_SET: '설정·이력', MENU_BAN: '금칙어', MENU_MODEL: '모델·ERD·DDL', MENU_CHK: '표준 점검', MENU_ADM: '멤버·승인' }
const menusOf = (p: (typeof PLANS)[number]) => {
  const ms = Object.keys(MENU_NM).filter((k) => (PLAN_PERMS[p] as readonly string[]).includes(k)).map((k) => MENU_NM[k])
  return p === 'FREE' ? ms.map((m) => `${m}(조회)`) : ms
}
const card = 'rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] p-4'

export default function Intro() {
  const { user, isLoading } = useAppUser()
  if (user || isLoading) return null
  return (
    <div className="mt-4 space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-[#1f3a68] to-[#3b4a66] px-5 py-8 text-white sm:px-8">
        <p className="text-sm text-white/70">데이터 표준사전 메타시스템</p>
        <h2 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">
          표준이 없으면 이름을 만들 수 없고,
          <br />
          모델이 없으면 테이블을 만들 수 없습니다.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-white/80">승인된 표준단어로 용어를 만들고, 그 용어로 모델을 그리고, 모델에서 DDL 을 생성합니다. 사람이 결정하고 도구는 규칙을 지킵니다.</p>
      </section>

      <section aria-labelledby="flow-h">
        <h3 id="flow-h" className="mb-2 font-bold text-[#2c3850]">
          이렇게 이어집니다
        </h3>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {FLOW.map(({ Icon, nm, desc }, i) => (
            <li key={nm} className={`${card} relative flex flex-col items-start gap-1`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#3b4a66] text-white">
                <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-xs text-[#5b6578]">{i + 1}단계</span>
              <span className="font-semibold text-[#2c3850]">{nm}</span>
              <span className="text-xs text-[#5b6578]">{desc}</span>
              {i < FLOW.length - 1 && <ArrowRight className="absolute right-2 top-3 hidden h-4 w-4 text-[#9aa6bd] lg:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="role-h">
        <h3 id="role-h" className="mb-2 font-bold text-[#2c3850]">
          역할별로 할 수 있는 일
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <li key={r} className={card}>
              <div className="font-semibold text-[#2c3850]">{ROLE_NM[r]}</div>
              <p className="mt-1 text-xs text-[#5b6578]">{ROLE_DESC[r]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="plan-h">
        <h3 id="plan-h" className="mb-2 font-bold text-[#2c3850]">
          요금제 <span className="text-xs font-normal text-[#5b6578]">— 분류체계 단위 Pi 결제, 가격은 결제 화면에서 확인</span>
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {PLANS.map((p) => (
            <li key={p} className={card}>
              <div className="font-semibold text-[#2c3850]">{PLAN_NM[p]}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {menusOf(p).map((m) => (
                  <span key={m} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#4a5a78] ring-1 ring-[#c9d1df]">
                    {m}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-center gap-2 text-sm text-[#4a5a78]">
        <DatabaseZap className="h-4 w-4" strokeWidth={1.5} aria-hidden /> 위에서 로그인하면 내 분류체계의 할 일이 바로 보입니다.
      </p>
    </div>
  )
}
