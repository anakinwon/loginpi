# PRD_23_FUNC_TUNING — 메인넷 등재 기능 튜닝포인트 요구사항

> **목적**: Pi Network 메인넷 등재 심사를 앞두고, cafe.pi의 **개별 기능을 심사 레드라인에 맞춰 어떻게 절제(트리밍)·부각할지** 정의하는 실행 사양.
> **역할 구분**: `docs/MAINNET_READINESS_CHECKLIST.md` = 공식 요건·절차(정본). 본 문서 = 그 요건에 맞춘 **기능 단위 튜닝 요구사항**.
> **산출 근거**: `pi-mainnet-listing-auditor` 에이전트 검증 + **코드 직접 재검증(2026-06-29)**. ⚠️ 에이전트 1차 의견 중 일부를 코드 실재로 교정함(아래 §0 참조).
> **작성일**: 2026-06-29 · 대상: master · **면책**: 적합 최종판정은 Pi 심사팀 권한. '확인필요'는 단정하지 않음.

---

## §0. 에이전트 1차 의견 대비 코드 교정 사항 (중요)

에이전트 요약과 **실제 코드가 달랐던 2건**을 직접 검증해 바로잡았다. PRD는 코드 사실을 따른다.

| 항목 | 에이전트 1차 의견 | 코드 실재(2026-06-29 검증) | 교정 결론 |
|---|---|---|---|
| 6. 브랜딩(Py 개명) | "🟠 P0 — `ko.json` ~20줄 개명 필요" | `messages/ko.json` **전부 이미 PyCafé™/PyShop™/PyTranslate™** (L865, L2120-2122 등) | **개명 완료. P0 아님.** 잔여=Py 상표 유사성 Pi 질의만 |
| 5. Bean 토큰 | "🟢 안전 — 오프체인 포인트라 레드라인 회피" | 내부 구현은 오프체인이 맞으나 **노출 텍스트에 "Bean Token 공식 발행"·"토큰 충전"·"토큰 경제" 다수 존재** | **구현은 안전, 표현은 🟠 절제 필요(진짜 P0).** §2-5 참조 |

> 교훈: Bean의 **백엔드 구현(오프체인)**과 **사용자 노출 문구("토큰 발행")**를 분리해 평가해야 한다. 심사관은 문구를 본다.

---

## §1. 통과 리스크 한눈 평가

| 구분 | 항목 |
|---|---|
| 🟢 즉시 통과 가능 | ①대시보드 ④이벤트(미션형) ⑥브랜딩(개명완료) ⑦개인정보(선택옵션) ⑧Google로그인(Pi Browser 미렌더) |
| ✅ 적용 완료 | ③시세칩+통화콤보 환율 **운영 숨김/staging 노출**(런타임 tier 자동 분기·같은 빌드, env 불필요) |
| 🟠 절제 필요(메인넷 전) | ⑤Bean "토큰" **노출 표현** |
| 🟡 조건부(라벨 보강) | ②각국 통화 콤보 |
| 🔵 Pi 직접확인 | Py 상표 유사성 · Bean "공식 발행" 계획의 A-5 저촉 여부 |

**종합 등재 리스크: 낮음.** 코드 변경량은 작고(주로 i18n 문구 + 시세칩 게이트), 구조적 위반은 없음.

---

## §2. 항목별 판정표

> 판정: 🟢안전 / 🟡조건부 / 🟠절제필요 / 🔴위험 · 근거: 공식 요건 A-3~A-7 / 모더레이터 답변(2026-06-27)

### ① 대시보드(사용자/주문/매출/퍼포먼스) — 🟢 안전
- **근거**: A-5(Pi 전용 거래). 매출이 Pi 외 통화로 표시되면 위험.
- **코드 검증**: 관리자 대시보드 매출 집계는 Bean/Pi 단위. 법정화폐 직표시 0건.
- **현재 동작**: 활성 사용자·주문·매출 KPI 표시(`StatsDashboard` 홈 첫 화면 — 북극성 지표).
- **방안(부각)**: **활성 사용자 수·Pi 결제 활성도는 생태계 기여 강점**이므로 등재 신청서에서 부각. 매출은 Bean/Pi 단위 유지.

### ② 각국 통화 콤보박스 — 🟡 조건부
- **근거**: A-5. 통화 표시가 '결제 통화'로 오인되면 저촉.
- **코드 검증**: `src/components/store/currency-combo.tsx`. 주석 L8-9: *"로케일 전환 아니고 '이 상품의 통화'만 고르는 controlled 입력. value='PI'면 Pi 직접입력."* 환율은 `fmtRate`로 1 USD 기준 **참고 표시**, 실제 결제·정산은 Pi/Bean.
- **현재 동작**: 상품 등록 시 판매자가 자국 통화로 입력 → Pi 환산. `value='PI'` 직접입력 경로 존재(L202-209, 232-249).
- **방안(절제·P2)**: 콤보/입력 라벨에 **"참고용 환산(결제는 Pi)"** 문구 명시. 결제 단가 기준이 Pi units임을 UI에서 분리 표기.

### ③ 각국 맞춤 Pi 단가(시세칩) — 🟠 절제 필요
- **근거**: A-5 + 과거 심사 대응에서 **시세 칩 숨김 이력**(메모리 `pi-mainnet-listing-redlines`). 투기/시세 강조는 회피 대상.
- **코드 검증**: `src/components/layout/pi-price-chip.tsx`. `π {환산가} {통화코드}` 칩 렌더(L48-61), `title="1 π ≈ {usd} USD (CoinGecko)"`(L50). `/api/pi-price` + `/api/exchange-rates` 소비.
- **⚠️ 게이트 실태(정정)**: `NEXT_PUBLIC_FEATURE_PI_PRICE` 플래그가 `env.ts` L82-83에 **정의는 되어 있으나**, `header.tsx` **L30에서 `<PiPriceChip>`를 조건 없이 무조건 렌더** → **플래그가 시세칩 렌더에 미연결**. (`fx-rates.ts`·`sql/062` 주석은 "플래그로 게이트"라 명시하나 헤더 시세칩은 누락됨.)
- **현재 동작**: 환경 무관하게 헤더에 실시간 Pi 환산 시세 표시. 시세 로드 실패 시만 `null`(L35).
- **방안(절제·P1) ✅구현완료**: `header.tsx`(시세칩) + `currency-combo.tsx`(환율 숫자) 게이트 연결 → **운영(cafepi) 숨김 / staging(loginpi) 노출**. `NEXT_PUBLIC_FEATURE_PI_PRICE='true'`로 언제든 노출. 통화 선택 기능은 유지. §8.6.

### ④ 이벤트 목록 표시 — 🟢 안전
- **근거**: A(도박/베팅 레드라인). 확률형 추첨이면 위험, 조건부 미션 보상이면 허용.
- **코드 검증**: 이벤트=10미션 화이트리스트(`event.ts`). 확률/추첨/갬블링 요소 **0건**. 미션 완료 시 조건부 Bean 지급.
- **현재 동작**: `ko.json` L1639 "10미션 완료 선착순 100명 …", L1695~1723 미션 목록(M1~M9). **선착순=확정 조건**(추첨 아님).
- **방안**: 도박 레드라인 안전. 단 보상 문구의 "Bean Token" 표기는 §2-5와 함께 절제(표현만).

### ⑤ Pi 결제 외 임시 토큰(Bean) — 구현 🟢 / 표현 🟠 (P0)
- **근거**: A-5 원문 *"no support for non-Pi Tokens or fiat currencies"*. **"토큰 발행/통화" 노출은 직격 리스크.**
- **코드 검증(구현=안전, 유지)**: Bean은 오프체인 포인트(`bean_wlt`·`bean_txn`·`fn_bean_apply`). 결제 수단으로 체인에 노출되지 않음. → **의도된 설계, 변경 금지.**
- **코드 검증(표현=절제 필요)**: `messages/ko.json`에 **토큰 노출 문구 다수**:
  - L727 `"…Bean Token 공식 발행 시…"`
  - L811 `"PiRC1(토큰 경제) · PiRC2 · PiRC3…"`
  - L902 `"…Bean Token이 공식 발행되면…"`
  - L1639 `"…5,000 Bean Token 받자!"`
  - L1695 `"Bean Token 충전하기"`, L1696 `"Bean 토큰을 충전해서…"`
- **방안(절제·P0)**: 사용자 노출 문구의 **"Bean Token / Bean 토큰 / 토큰 경제 / 토큰 발행"→"Bean(포인트·크레딧)"** 류로 순화. 단:
  - **PiRC1/2/3**은 Pi 공식 스마트컨트랙트 명칭 → 삭제 말고 "토큰 경제"라는 *수식어*만 순화(§3 부각과 연계).
  - **"공식 발행" 계획 노출(L727·902)**은 향후 토큰화 계획을 드러냄 → §4 Pi 질의 동반(보수적 절제 권고).

### ⑥ PyCafé™/PyShop™ 등 Pi 유사 Prefix — 🟢 안전(개명 완료)
- **근거**: A-3(상표) + 모더레이터(2026-06-27) *"'Picafe'/'Pishop' … may conflict … Pi 접두 Not recommended."*
- **코드 검증**: `messages/ko.json` **전체가 이미 Py 표기**(L865·948·1648·1650·2120-2122·2142·2170 등). DB 코드값은 `PICAFE/PISHOP/TRANSLATE` 원형 유지(의도된 설계).
- **현재 동작**: 사용자 노출명=PyCafé™/PyShop™/PyTranslate™/PyVoice™/PyChat™. 표시명≠코드값 불일치는 **의도된 설계**(고치지 말 것).
- **방안**: 개명 작업 자체는 **완료**. 잔여=**"Py"가 "Pi"와 한 글자 차로 confusingly similar로 보일지** Pi 직접 질의(§4). 이전 결과 따라 suffix형("Café for Pi") 전환 가능성만 대비.

### ⑦ P2P·O2O 거래용 개인정보 선택 수집 — 🟢 안전
- **근거**: A-7 *"Only collect user data essential…"*.
- **코드 검증**: 실명·전화·주소·카카오ID·위치 = **전부 선택 입력**(필수=display_name만). 매핑표=`MAINNET_READINESS_CHECKLIST.md` 부록2.
- **현재 동작**: 프로필 UI에 `(선택)` 표기(`common.optional`), 위치는 LBS 동의 기반.
- **방안**: 충족. 잔여=개인정보처리방침에 항목·용도·선택여부 명시(법무, 본 PRD 범위 밖).

### ⑧ 일반 브라우저 Google·Pi 계정 통합 — 🟢 안전
- **근거**: A-4(Pi 인증 전용) + 모더레이터 *"avoid showing Google login inside Pi Browser."*
- **코드 검증**: `src/components/google-login-button.tsx` L13 `const inPiBrowser = usePiBrowserUI()`, **L22 `if (inPiBrowser) return null`** → Pi Browser에서 Google 버튼 미렌더.
- **현재 동작**: Pi Browser=Pi 인증 전용. 일반 브라우저에서만 Google 보조(연동/폴백). Pi 결제는 Pi Browser 전용.
- **방안**: 모더레이터 권장 충족. 잔여=**최종 메인넷 빌드에서 "Pi Browser 내 Google 미노출" 1회 육안 재확인.**

---

## §3. 절제(트리밍) 권고 — 우선순위순

> ⚠️ **모든 절제는 "운영(cafepi)에만 적용, loginpi(staging)엔 유지"가 원칙** — 환경 분기 설계는 §8. 아래 "구체 작업"은 그 게이트를 전제로 한다.

| 순위 | 항목 | 변경 대상 | 구체 작업 (운영에만 적용) |
|---|---|---|---|
| **P0** | ⑤ Bean 토큰 표현 | `messages/listing/{ko,en}.json` 오버레이 (원본 `ko.json`은 불변) | "Bean Token/토큰 충전/토큰 경제"→"Bean(포인트/크레딧)" 절제 문구를 **운영 오버레이로만** 정의. listing mode일 때 `request.ts`가 deepMerge. staging은 원본 유지. PiRC 명칭 보존. §8.5 |
| **P1 ✅완료** | ③ 시세칩+통화환율 | `header.tsx` + `currency-combo.tsx` | **운영 숨김 / staging 노출** 연결 완료. `NEXT_PUBLIC_FEATURE_PI_PRICE='true'`로 언제든 노출. §8.6 |
| **P2** | ② 통화 콤보 | `messages/listing/{ko,en}.json` 오버레이 `store.form.*` | "참고용 환산(결제는 Pi)" 문구를 운영 오버레이로. `currency-combo.tsx` 구조 변경 불필요(라벨만). §8.5 |
| 확인후 | ⑤ "공식 발행" 문구 | `listing` 오버레이 L727·902 대응 키 | §4 Pi 질의 결과에 따라 운영 노출만 유지/수정/삭제. staging은 비전 표현 유지 가능. |

> ⚠️ **블라인드 치환 금지**: "토큰" 일괄 replace는 PiRC·Pi 플랫폼 참조를 오염시킬 수 있음. 오버레이는 Bean 맥락 키만 외과적으로 정의.
> ⚠️ **원본 `ko.json` 직접 수정 금지(전략 변경)**: 환경 분기를 위해 절제 문구는 원본이 아닌 **운영 오버레이**에 둔다. 원본을 바꾸면 staging까지 절제돼 마스터 요구("loginpi 유지")에 위배.

---

## §4. 부각(강조) 권고 — 심사 강점

| 강점 | 위치/근거 | 부각 방법 |
|---|---|---|
| 활성 사용자 성장 | 홈 `StatsDashboard`(북극성 지표) | 등재 신청서에 활성 사용자·재방문 지표 제시 = Pi 생태계 기여 |
| Pi 결제 활성화 | `pi_pymnt` U2A/A2U, 5분 cron 정산 | "실제 Pi 거래가 도는 앱" 강조(A-5 부합 증거) |
| O2O 실물경제 순환 | PyShop™ 오프라인 매장·O2O | Pi가 온라인→오프라인 실물경제로 흐르는 순환(비전 아크) |
| Pi 공식 기술 적극 활용 | PiRC1/2/3(`ko.json` L811) | Pi 공식 스마트컨트랙트 구현 = 기술 생태계 기여(단 "토큰 경제" 수식어는 순화) |

---

## §5. 미해결 / Pi 직접 확인 필요

> 답을 추측하지 않는다. 보수적(거절 회피 우선) 판단. 채널=Pi Ecosystem Discord / Dev Portal in Pi Browser / Developer chat room.

1. **Py 상표 유사성** (A-3) — Py가 Pi와 한 글자 차로 confusingly similar인지.
   > *"We renamed our brands from 'PiCafé' to 'PyCafé' (Py prefix) to avoid the 'Pi App_Name' form. Is 'Py'-prefixed naming acceptable, or is it still considered confusingly similar to Pi branding?"*
2. **Bean 오프체인 포인트 vs '공식 발행' 계획** (A-5) — 현재 오프체인 포인트이고, 메인넷 시 토큰화 계획 문구가 노출됨. 이 계획 노출이 등재에 저촉되는지.
   > *"Bean is an off-chain in-app point (not a tradable token). Our UI mentions a future 'official Bean Token issuance' at mainnet launch. Does describing a future token plan conflict with the Pi-only transaction requirement?"*
3. **시세칩 처리 수준** (A-5) — 참고 환산으로 유지 가능한지, 완전 숨김이 안전한지.

---

## §6. 의도된 설계 — 변경 금지 (Do NOT touch)

> 아래는 심사 대응 과정에서 **유지가 정답**인 결정. 버그로 오인해 고치지 말 것.

| 설계 | 이유 |
|---|---|
| Bean 내부 구현 = 오프체인(`bean_wlt`·`bean_txn`·`fn_bean_apply`) | A-5 회피의 핵심. 체인 토큰 아님 |
| DB 코드값 `PICAFE`/`PISHOP`/`TRANSLATE` 원형 유지 | 결제 memo·정산 추적 무결성. 표시명(PyCafé™)≠코드값은 의도됨 |
| Pi 플랫폼 토큰 식별자(`window.Pi`·`piFetch`·`pi_session`·`pi_pymnt`·`X-Pi-Token`·`PiRC*`·`isInPiBrowser`) | 변경 시 Pi 로그인·결제 systemic 붕괴(핵심가치 #1·#2) |
| `google-login-button.tsx` `if(inPiBrowser) return null` | A-4 충족 장치. 제거 시 Pi Browser에 Google 노출 |
| 통화 콤보 `value='PI'` 직접입력 경로 | Pi 결제 우선 보장 |
| Pi 인증 UA 사전차단 금지(가드는 `if(!window.Pi)`만) | UA 게이트 시 실기기 Pi 로그인 systemic 붕괴(8bf8752 사고) |

---

## §8. 환경별 적용 전략 — Staging(loginpi) 유지 / 운영(cafepi) 절제

> **마스터 요구(2026-06-29)**: 메인넷 절제(⑤·③·②)는 **운영 서버에만 적용**하고 **loginpi.vercel.app(개발/스테이징)에는 기존 기능을 유지**한다.
> 근거 인프라: `docs/DEPLOY_STRATEGY.md`(2-프로젝트 모델) · `src/lib/db-env.ts`(tier 판정) · `src/components/layout/staging-banner.tsx`(tier 분기 선례) · `src/i18n/request.ts`(deepMerge).

### 8.1 환경 토폴로지 (이미 구축됨)

| | **loginpi (Staging)** | **cafepi (운영)** |
|---|---|---|
| 역할 | 개발·검증 WAS | 메인넷 등재 대상 WAS |
| Production Branch | `master`(자동배포) | `production`(게이팅) |
| tier | `staging`(`APP_TIER=staging`) | `prod`(VERCEL_ENV 자동) |
| Pi | Testnet | **Mainnet** |
| 절제 적용 | ❌ **유지(풍부한 표현)** | ✅ **절제 ON** |

### 8.2 게이트 메커니즘 — server 런타임 판정 + client Context 주입 ✅구현완료(2026-06-29)

| 축 | 대상 | 판정 수단 | 구현 |
|---|---|---|---|
| 서버(RSC/SSR) | i18n 문구(⑤·②) · 헤더 시세칩(③) | `resolveDbTier()` 런타임 | `header.tsx`가 server라 직접 호출 |
| 클라이언트(`'use client'`) | 통화콤보 환율(③) | server가 판정 → Context 주입 | `layout.tsx` → `FeatureFlagProvider` → `useFeatureFlags()` |

→ **"같은 빌드, 배포 환경별 다른 표시"**: client 컴포넌트는 런타임 env(`APP_TIER`)를 직접 못 읽지만, server(`layout.tsx`)가 `resolveDbTier()`로 판정한 boolean을 `FeatureFlagProvider` Context로 주입하면 client도 런타임 tier 분기를 따른다. `NEXT_PUBLIC_FEATURE_PI_PRICE`는 빌드타임 인라인이라 **기본 메커니즘에서 폐기**하고 긴급 override로만 남긴다(§8.6). → tier 신호 하나로 i18n·시세칩·환율 모두 일관 분기.

### 8.3 권장: 단일 플래그 `NEXT_PUBLIC_LISTING_MODE`

`src/env.ts` `client` 블록에 추가(`.env.example` 동시 수정):
```ts
// 메인넷 등재 절제 모드 — 'true'면 시세칩 숨김 + 토큰표현/통화라벨 절제 오버레이 적용.
// 운영(cafepi)에만 'true'. staging(loginpi)·로컬은 미설정(절제 OFF).
NEXT_PUBLIC_LISTING_MODE: z.enum(['true', 'false']).optional(),
```

| 환경 | `NEXT_PUBLIC_LISTING_MODE` | 결과 |
|---|---|---|
| cafepi(운영) | `true` | Bean "포인트" 표현 · 통화 "참고환산" 라벨 |
| loginpi(staging) | 미설정 | "Bean Token" 표현 · 기존 라벨 (유지) |
| 로컬 | 미설정 | staging과 동일(개발 편의) |

> ⚠️ **시세·각국통화칩+환율(③)은 이 플래그가 아니라 별도 `NEXT_PUBLIC_FEATURE_PI_PRICE`로 제어**한다(§8.6). 마스터 지시(2026-06-29): **운영(cafepi)만 숨김 / staging(loginpi) 노출**, 언제든 노출 가능.

- **왜 `NEXT_PUBLIC_`**: 서버(i18n)·클라이언트(시세칩) 양쪽이 단일 신호를 읽어 일관 분기.
- **왜 tier 자동판정(`resolveDbTier()`)에 의존하지 않나**: `db-env.ts` L45는 **로컬·일반 빌드 기본값을 `prod`로 폴백** → tier 기반으로 하면 **로컬 개발에서도 절제가 켜져** 개발자가 "Bean Token"을 못 봄. 명시 플래그가 사고 위험 없이 안전.

### 8.4 항목별 적용 매핑

| 항목 | 게이트 | 구현 지점 | staging(loginpi) | 운영(cafepi) |
|---|---|---|---|---|
| ⑤ Bean 토큰 표현 | `NEXT_PUBLIC_LISTING_MODE` (서버 i18n) | `request.ts` 오버레이 deepMerge | "Bean Token" 유지 | "Bean(포인트)" |
| ② 통화 라벨 | `NEXT_PUBLIC_LISTING_MODE` (서버 i18n) | 동일 오버레이(`store.form.*`) | 기존 유지 | "참고환산" |
| ③ 시세칩+통화환율 | **런타임 tier**(`resolveDbTier`)→Context | `layout.tsx`+`header.tsx`+`currency-combo.tsx` ✅**구현완료** | 노출(tier=staging) | **숨김**(tier=prod) |

> \* ③은 **런타임 자동 분기** — 운영(prod) 숨김 / staging 노출. 같은 빌드, env 설정 불필요. 긴급 override만 `NEXT_PUBLIC_FEATURE_PI_PRICE`. §8.6.
> ②의 통화 라벨은 클라이언트 컴포넌트(`currency-combo.tsx`)가 표시하지만 **문구 자체는 i18n**이므로, request.ts 오버레이가 적용되면 클라이언트는 코드 변경 없이 자동 반영된다.

### 8.5 i18n 오버레이 구현 (`src/i18n/request.ts`)

기존 `deepMerge`(L10)와 3단계 fallback을 그대로 재사용, **마지막에 운영 오버레이를 한 번 더 머지**:
```ts
// 메시지 빌드 완료 후, listing mode면 절제 오버레이를 최상위로 덮어씌움
if (process.env.NEXT_PUBLIC_LISTING_MODE === 'true') {
  const listingKo = await readJson('listing/ko.json')
  const listingLoc = locale === 'ko' ? {} : await readJson(`listing/${locale}.json`)
  messages = deepMerge(deepMerge(messages, listingKo), listingLoc)
}
```
- 오버레이 파일 `messages/listing/{ko,en}.json` = **절제 대상 키만**(소수). 예:
  ```json
  { "event": { "missions": { "0": { "name": "Bean 충전하기", "desc": "Bean을 충전해서 …" } } } }
  ```
- **22 locale 처리**: 심사 주 언어인 **en·ko 오버레이를 우선** 작성. "Bean"은 brand-neutral 단어라 대부분 언어에서 그대로 → en 폴백으로 충분. 통화 "참고환산" 문구만 주요 locale 보강(후속). **누락 시 silent하게 원문 노출되므로, 미커버 locale 목록을 로그/주석에 남길 것**(프론트 표준의 "no silent caps").
- **DB i18n_message sync와 독립**: 오버레이는 메시지 로드 **후처리**라 DB 정본(`i18n-db-source-of-truth`)을 건드리지 않음. 원본 `ko.json`·DB는 staging 기준 그대로.

### 8.6 시세·각국통화 노출 (③) — 런타임 tier 자동 분기 ✅ 구현완료(2026-06-29 재설계)

> **마스터 지시(2026-06-29)**: "**같은 소스인데 환경에 따라 다르게 보여야 한다.**" → 빌드타임 `NEXT_PUBLIC` 토글(환경마다 다른 값을 박는 방식)을 폐기하고, **동일 빌드가 런타임에 tier를 감지해 분기**하도록 재설계. 운영(cafepi) 숨김 / staging(loginpi) 노출.

**핵심 헬퍼** `src/lib/feature-flags.ts`(client-safe 순수함수):
```ts
export function computeShowPiValuation(tier, override?) {
  if (override === 'true') return true      // 긴급 강제 노출
  if (override === 'false') return false    // 긴급 강제 숨김
  return tier === 'staging' || tier === 'dev'  // 운영(prod)·미상은 숨김(안전 기본)
}
```

**대상 2곳**:
1. **헤더 Pi 시세칩** — `header.tsx`(server): `computeShowPiValuation(resolveDbTier(), …)` 직접 호출 → `{showPiValuation && <PiPriceChip/>}`.
2. **통화 콤보 환율 숫자** — `currency-combo.tsx`(client): `const { showPiValuation: showRate } = useFeatureFlags()`. 활성통화·전체국가의 `{currency} {fmtRate(rate)}`에서 **환율 숫자만** 조건부, **통화 선택·Pi 직접입력은 항상 유지**(P2P 핵심 보존).

**client 주입 경로**: `layout.tsx`(server)가 `computeShowPiValuation(resolveDbTier(), env.NEXT_PUBLIC_FEATURE_PI_PRICE)` 계산 → `<FeatureFlagProvider flags={{ showPiValuation }}>`로 `{children}` 래핑 → client는 `useFeatureFlags()`로 접근.

**환경별 결과 (env 설정 불필요 — 런타임 자동 분기)**:
| 환경 | tier (`resolveDbTier()`) | 결과 |
|---|---|---|
| **cafepi(운영)** | `prod` (APP_TIER 미설정→폴백) | 🔒 **숨김** (레드라인 안전 기본) |
| **loginpi(staging)** | `staging` (APP_TIER=staging) | 👁 **노출** |
| 로컬 개발 | `prod` 폴백 → 숨김 | 보려면 `.env.local`에 `APP_TIER=dev` 또는 `NEXT_PUBLIC_FEATURE_PI_PRICE=true` |

- **같은 빌드**: staging·운영이 동일 번들을 써도 런타임 `APP_TIER`로 분기 → 환경별 빌드 불필요(마스터 요구 충족).
- **운영 안전**: 운영은 APP_TIER 미설정→prod→자동 숨김(메모리 "APP_TIER 운영금지" 정책과 일치). 누락 사고로 노출될 위험 없음.
- **긴급 override**: `NEXT_PUBLIC_FEATURE_PI_PRICE='true'/'false'`로 tier 무시 강제(재배포 필요). 평상시 미설정.

> 정리: **시세·각국통화·환율 = 런타임 tier 자동 분기**(server 판정 + client Context). **브랜딩 문구 절제(⑤·②라벨) = `NEXT_PUBLIC_LISTING_MODE`**(운영만, i18n). 두 축 분리.

### 8.7 안전 고려

- **로컬/staging 무영향**: 플래그 미설정 시 절제 OFF — 개발·테스트는 기존 그대로.
- **빌드 그린 유지**: 플래그는 `optional` → 미설정이어도 t3-env 검증 통과.
- **롤백 용이**: 운영에서 `NEXT_PUBLIC_LISTING_MODE` 제거(재배포)만으로 절제 해제. 코드 롤백 불필요.
- **검증(양쪽 육안)**: loginpi=시세칩·"Bean Token" 노출 / cafepi=숨김·"Bean(포인트)". §1 부각 지표는 양쪽 공통 유지.

### 8.8 미해결 결정 (마스터 확인)

1. **게이트 단일화 vs 분리**: 단일 `NEXT_PUBLIC_LISTING_MODE`(권장) vs 기존 `FEATURE_PI_PRICE` + 신규 분리.
2. **22 locale 절제 범위**: en·ko 우선(권장, 심사 주 언어) vs 전 locale 동시.
3. **착수 시점**: 지금 구현 vs 메인넷 프로젝트(cafepi production) 프로비저닝과 함께.

---

## §7. 자체 레드라인 재확인

본 PRD의 어떤 권고도 4대 레드라인을 **새로 위반하지 않으며**, 인증 핵심가치(Pi Browser 로그인·결제)를 훼손하지 않음:
- 도박/베팅: 추가 없음(이벤트는 미션형 유지).
- Pi 외 통화: Bean **표현만** 순화(구현 오프체인 유지), 통화 콤보는 참고 표시 강화.
- Pi 외 로그인: Google 미렌더 유지(건드리지 않음).
- 브랜딩: Py 개명 유지, 추가 변경은 Pi 질의 후.

**최종 갱신**: 2026-06-29 · **근거**: 에이전트 검증 + 코드 직접 재검증
