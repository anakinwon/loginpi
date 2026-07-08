# cafe.pi Pi Network 메인넷 출시 체크리스트 (공식문서 기반)

> **정본 원칙**: 메인넷 출시 절차·등재 요건은 **Pi Network 공식문서만**을 근거로 한다. 추측·비공식 출처 사용 금지(2026-06-26 마스터 지시).
> **면책**: 본 문서의 cafe.pi 적합 여부는 **Pi 심사팀의 최종 판정 권한**이다. 아래 '확인필요' 항목은 단정하지 않으며, 신청 전 Pi에 직접 확인한다.
> **최종 갱신**: 2026-07-08 · 대상: master
> **운영 인프라 진척(2026-06-28~29)**: 운영DB 컷오버 완료(ajdwlcqoljkjamostutc·dev 100% 미러·센티넬 검증) + 읽기전용 보호 + 2단계 배포 분리. 상세는 Part D-4 · 오픈베타 체크리스트(`ops_checklist` sql/137).
> **등재 준비 진척(2026-06-30~07-08)**: ① 운영 `fee_mode=PI` 전환(플랫폼 거래 Pi 통일 — C-1-F-③ 이행) ② 운영 sandbox=false 확정(WBS 6.3 완료) ③ **절제 오버레이 구현**(`NEXT_PUBLIC_LISTING_MODE`·`messages/listing/*` — C-1-F-① 코드 완료, 운영 env 설정 잔여) ④ **도메인 검증 라우트 구현**(`/validation-key.txt`·`PI_DOMAIN_VALIDATION_KEY` env 주입식 — E-4 기술 준비 완료) ⑤ Pi Sign-In(OAuth) 일반 브라우저 Pi 로그인 신설(A-4 강화).

---

## ⚠️ 가장 먼저 알아야 할 핵심 개념 (관리자 필독)

### 테스트넷은 메인넷으로 "자동 승계"되지 않는다

> **흔한 오해**: 테스트넷에서 검증받으면 그게 곧바로 메인넷으로 이어진다.
> **사실**: 아니다. 테스트넷과 메인넷은 **완전히 별개의 환경**이다.

1. **테스트넷 = 연습·테스트 전용**(가짜 Pi). 메인넷을 위한 검증이 아니라, 내 앱이 제대로 도는지 미리 확인하는 **리허설**이다.
2. **테스트넷의 검증(도메인·앱·결제)은 메인넷에 승계되지 않는다.** 네트워크 선택이 비가역이라 테스트넷용·메인넷용 프로젝트가 **별도**이기 때문이다.
3. **메인넷은 "별도로 세팅된 서버 환경"이 준비된 뒤에야 검증·오픈이 결정된다:**
   - 새 메인넷 Developer Portal 프로젝트 (App Network = Mainnet, 비가역)
   - 새 도메인 + 도메인 검증(validation-key.txt) — **테스트넷 URL 재사용 불가**
   - 새 메인넷 API Key — 테스트넷 키는 메인넷에서 실패
   - 메인넷 지갑 — KYC + 슬롯
4. **올바른 순서**: 테스트넷 연습 완료 → **메인넷 환경 신규 구축** → 메인넷에서 검증 → 등재 심사(A-1~A-7) → 오픈

→ **결론**: 테스트넷 검증을 메인넷에 재활용하려 하지 말 것. **메인넷은 처음부터 새로 차린다.** 이 점을 모르면 "테스트넷 다 됐으니 곧 오픈"이라 착각해 **일정을 크게 오판**한다.

**근거(공식)**: 네트워크 비가역 · 테스트넷↔메인넷 별도 프로젝트 · 새 API Key 필수 · URL 중복 불가 — [Getting Started Checklist](https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/gettingStartedChecklist/)

---

## 📚 공식 출처 (정본)

| 문서 | URL |
|---|---|
| Mainnet Listing Requirements | https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/mainnetListingRequirements/ |
| Getting Started Checklist | https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/gettingStartedChecklist/ |
| Developer Portal (절차) | https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/devPortal/ |
| developer_portal.md (플랫폼 공식) | https://github.com/pi-apps/pi-platform-docs/blob/master/developer_portal.md |

> 위 4개는 Pi 공식 GitHub(`pi-apps`) 자료다. 아래 Part A·B는 이 출처의 **원문 기준**이며, 임의 URL·콜백 패턴·내부 추정은 본 문서에서 제거했다.

---

# Part A. 공식 메인넷 등재 요건 (Mainnet Listing Requirements)

> 출처: Mainnet Listing Requirements. 생태계 인터페이스(Ecosystem) 등재 자격. 미충족 시 등재만 불가하며 앱 독립 운영은 가능.

| # | 공식 요건 | 원문 핵심 |
|---|---|---|
| A-1 | 완전 동작 + 전문적 UI | "fully operational with a clean, user-friendly interface" |
| A-2 | 개발자 KYC 완료 | "Developers must complete KYC...before submitting an application to list" |
| A-3 | 상표 침해 금지 | "Your app's URL/domain must not start with 'pi' or misuse Pi branding" — Pi 로고·색상·디자인 요소 사용 불가 |
| A-4 | Pi 인증만 사용 | "Apps must integrate Pi's Authentication SDK for user logins. Other login methods...are prohibited" |
| A-5 | Pi 전용 거래 | "All transactions must be conducted in Pi, with no support for non-Pi Tokens or fiat currencies" |
| A-6 | 외부 사이트 리다이렉트 지양 | "Apps should not redirect users to external websites, apps or services" (필요성 기준 케이스별 심사) |
| A-7 | 데이터 수집 최소화 | "Only collect user data essential for your app's functionality" |

---

# Part B. 공식 신청·등록 절차 (Developer Portal App Checklist)

> 출처: Getting Started Checklist · developer_portal.md. Pi Developer Portal(`pi://develop.pi`)의 App Checklist는 단계별로 순차 잠금 해제된다.

## B-1. 개발/Testnet 등록 (13단계)

1. Pi App 설치
2. 계정 등록
3. **Pi Browser** 설치 및 로그인
4. **이메일 인증** — 5단계 진입 전 필수
5. **앱 등록** — 앱 이름·설명·**App Network 선택**
   - ⚠️ **비가역**: "once you've registered the app, this option cannot be changed" — 네트워크는 등록 후 변경 불가
6. 앱 호스팅 구성 — third-party 또는 Pi Engine
7. **지갑 생성** — `wallet.pi`에서 접근 확인 후 진행
8. 공식 문서 숙지 (Pi Developer Guide)
9. 개발 URL(localhost) 구성
10. 샌드박스 실행 — `sandbox=true` 후 Pi Mining App에서 인가
11. 프로덕션 배포 — Production URL 입력
12. **도메인 소유 검증** — `validation-key.txt` 파일을 호스팅 도메인에 배치
13. **트랜잭션 처리** — U2A(User-to-App) Pi 결제 1건으로 생태계 연결 확인

## B-2. 메인넷 출시 (5단계)

1. **메인넷 지갑 확보** — Pi KYC 필수 + **초대 기반 슬롯(invitation-based slot system)**
2. **메인넷 Developer Portal 프로젝트 별도 생성** — testnet 프로젝트와 분리(네트워크 비가역 규칙 때문)
3. **앱 URL 검증** — "URL cannot match the URL that is verified of another Developer Portal Project" (타 프로젝트와 URL 중복 불가)
4. **API Key 신규 발급** — "API calls will fail if the API Key from a Testnet application is not updated" (Testnet 키 재사용 불가)
5. 출시 및 메인넷 동작 테스트

## B-3. ⭐ 반드시 기억할 공식 규칙

- **네트워크 비가역**: App Network는 앱 등록 시 1회 결정, 이후 변경 불가 → testnet용·mainnet용 앱을 **각각 별도** 생성. ("Testnet→Mainnet 전환"이 아니라 **신규 메인넷 프로젝트 생성**)
- **송금 지갑 귀속**: "the wallet address of the Pioneer who registers the Developer Portal project will be used for all mainnet transfers" → cafe.pi의 A2U 정산(`PI_WALLET_PRIVATE_SEED`)은 **이 프로젝트 등록 지갑**과 일치해야 함.
- **API Key 갱신**: 메인넷 프로젝트에서 새 API Key 발급(Testnet 키는 메인넷 호출 실패).
- **Testnet 식별 표시**: Testnet 연결 앱은 Pi Browser 상단에 흑황 줄무늬 표시.

---

# Part C. cafe.pi 현황 대조 (공식 요건 기준 — 판정 보류)

> 공식 요건(Part A)과 현재 코드/정책을 **사실 대조**만 한다. 합격/불합격은 Pi 심사팀 권한이므로 단정하지 않는다.

| 공식 요건 | cafe.pi 관련 사실 | 상태 |
|---|---|---|
| A-2 KYC | 아나킨님 본인 Pi KYC 완료 여부 = 메인넷 지갑 슬롯 전제 | 🟡 **확인필요** |
| A-3 상표 | 제품명 **PiCafé™·PiShop™·PiTranslate™ = "Pi"+이름 접두형** | 🟠 **개명으로 해소 결정** — 모더레이터 공식 "Not recommended"(Pi 접두). Py 개명 결정(E-2), 실행+새이름 확인 잔여. **C-1-A** 참조 |
| A-4 Pi 인증만 | Pi Browser에서 Google 버튼 미렌더(`google-login-button` 코드 검증) | 🟢 **충족(모더레이터 확인)** — 최종 빌드 재확인만. C-1-B 참조 |
| A-5 Pi 전용거래 | Pi/Bean 거래. 자국통화=참고 표시값(거래 아님)·법정화폐 직결제 0건. 플랫폼 거래=운영 fee_mode=PI로 Pi 통일(2026-06-30) | 🟢 **방침 이행 대부분 완료(C-1-F)** — 표현 순화 오버레이 코드 완료(운영 env `NEXT_PUBLIC_LISTING_MODE=true` 설정 잔여)·테스트 발행 데이터 초기화만 잔여 |
| A-6 외부 리다이렉트 | Telegram 주문알림(판매자 opt-in, 주문·결제는 인앱 완결) | 🟡 **조건부 완료** — 코드 충족, PCT 미확인(추후 재조정). C-1-C 참조 |
| A-7 데이터 최소화 | 수집항목 = O2O용 선택 옵션(강제 아님)·매핑표(부록2)·UI 선택표기 | 🟢 **완료** — C-1-D 참조 |
| A-1 동작/UI | 앱 동작·UI 완성도 | 🟢 자체 점검 양호(Part D), Pi 심사 별도 |

---

## Part C-1. Pi 직접 확인 항목 (공식 질문 + 채널)

> 각 항목 = ① 공식 원문 ② cafe.pi 사실 ③ Pi에 던질 구체적 질문/조치 ④ 출처. 답은 추측하지 않는다.
> **출처 추가**: [PI Trademark Usage Guidelines](https://minepi.com/pi-trademark-guidelines/) · [Community Support](https://pi-apps.github.io/community-developer-guide/docs/communitySupport/)

### 🔴 C-1-A. 상표/앱 이름 (A-3) — 최우선·공식 확정 규칙

- **공식 원문**(Trademark Guidelines):
  - "You may not name your app in the form of **'Pi App_Name'**." (Pi 접두형 금지)
  - 라이선스 시 허용형: "**App_Name for Pi**" 또는 "**App_Name on Pi**".
  - "you may not use the Pi trademark in a company name, **app name, domain name, social media account** ... unless you are **licensed** to do so by Pi."
  - 무라이선스 허용범위: "refer to PI **solely to indicate that your app is compatible** with the Pi Network" (예: "This app works on the Pi Network").
  - 브랜드 색상: "do NOT use Pi Network's brand color palettes."
  - 라이선스 경로: "execute a **Trademark Licensing Agreement**" — **Dev Portal in Pi Browser**에서 신청.
- **cafe.pi 사실**: `PiCafé™`·`PiShop™`·`PiTranslate™` = 전부 `Pi`+이름 = 금지된 'Pi App_Name' 형태. 도메인 `cafe.pi`(‘pi’로 시작은 아님).
- **조치(택1, Pi 확인 동반)**:
  1. **Trademark Licensing Agreement 체결**(Dev Portal) → 라이선스 후 사용 또는 "Café for Pi / Café on Pi"식 허용형으로 표기, **또는**
  2. **개명** — Pi 접두 제거(예: "Café for Pi", "Shop on Pi"). 무라이선스라면 "Pi 호환" 표기만 가능.
- **🔎 라이선스 경로 조사 결과(공식, 2026-06-26)** — *"라이선스만 받으면 PiCafé™ 유지 가능?"의 답은 NO에 가깝다*:
  - 라이선스는 **Pi Browser의 Dev Portal 앱**에서 제공("made available on the Dev Portal app of the Pi Browser"). **공개 문서엔 신청 폼·자격·심사단계·수수료·소요기간 미기재** → Dev Portal 직접 접근 또는 Core Team 문의로만 확인 가능.
  - **결정적**: 라이선스가 승인돼도 허용 형태는 **"App_Name for Pi" / "App_Name on Pi" / 유사형(suffix)뿐**. **"PiCafé"(prefix) 형태는 라이선스가 있어도 허용 목록에 없음.** 금지 사유 원문: *"Your app name may NOT be in the form of 'Pi App_Name' to avoid Pioneers confusion that your app was created by the Pi Core Team."*
  - **따라서 라이선스 경로를 택해도 prefix 'PiCafé'는 'Café for Pi'식 suffix로 개명이 수반될 가능성이 높다.** 라이선스 vs 개명이 양자택일이 아니라 **라이선스 + suffix 개명**이 한 묶음일 수 있음.
  - **유일하게 남은 핵심 변수**: 이 규칙이 **등록 앱 이름**에만 적용되는지, **앱 내 기능 라벨(PiShop·PiTranslate 등 서브 브랜드)**까지 구속하는지는 **공식 문서가 침묵** → 반드시 Pi에 질의(질문 (c)).
- **Pi 확인 질문(영문, 그대로 송부 가능)**:
  > "Our app brands its features as 'PiCafé', 'PiShop', 'PiTranslate' (Pi-prefixed). Per the Trademark Guidelines, app names may not be in the form 'Pi App_Name', and the permitted licensed forms are 'App_Name for/on Pi'. (a) Even with a Trademark Licensing Agreement, is the prefix form 'PiCafé' disallowed (i.e., must we use 'Café for Pi')? (b) Does this naming rule bind only the registered app name, or also in-app feature/sub-brand labels shown inside the app? (c) Where exactly in the Dev Portal is the licensing application, and what are the eligibility/fees/timeline?"
- **✅ 공식 답변(모더레이터 2026-06-27)**: *"Not recommended. 'Picafe' / 'Pishop' use 'Pi' as a prefix, so they may conflict with Pi trademark guidance or look like official Pi apps."* → **Pi 접두 불가 확정**, 개명(E-2 Py) 결정 검증됨. ⚠️ 단 새 이름이 여전히 "Pi처럼 보이는지"(Py 유사성)는 최종 확정 전 확인 권장.
- **채널**: Dev Portal in Pi Browser(라이선스 신청) · Pi Ecosystem Discord(Core Team 상주) · Pi App 내 Developer chat room.

### 🟢 C-1-B. Pi 인증 외 로그인 (A-4) — 권장사항 충족

- **공식 원문**: "Apps must integrate Pi's Authentication SDK for user logins. Other login methods ... are prohibited."
- **cafe.pi 사실**: Pi Browser에서 Google 버튼 숨김. 단 일반 브라우저용 Google 로그인 경로 존재.
- **질문**: "We use Pi Auth as primary. A Google login path exists only for non-Pi-Browser web access, and for optional account linking. For a Mainnet-listed app, must Google be fully removed, or is it acceptable if the listed (Pi Browser) experience uses Pi Auth exclusively?"
- **✅ 모더레이터 답변(2026-06-27)**: *"Pi Auth should be the primary and required login inside Pi Browser. If Google login is only for non-Pi-Browser web access and is hidden/disabled in the Pi Browser version, it may be fine. But for Mainnet listing, I would avoid showing Google login inside Pi Browser to prevent any policy or review issue."*
- **✅ 코드 검증**: `src/components/google-login-button.tsx` L22 `if (inPiBrowser) return null` — **Pi Browser에서 Google 버튼 미렌더**(헤더가 유일 진입점, 게이팅됨). → 권장사항 이미 충족.
- **잔여**: 최종 메인넷 빌드에서 "Pi Browser 내 Google 미노출" 1회 육안 재확인.
- **➕ 강화(2026-07-08)**: **Pi Sign-In(OAuth)** 신설 — 일반 브라우저에서도 Pi 계정 로그인 가능(`accounts.pinet.com` 인가 → 기존 `/api/auth/pi` 재사용, 실기기 3종 여정 검증 완결). Google 의존이 줄어 "Pi 인증이 주 경로"라는 A-4 취지에 더 부합. Pi Browser 내에서는 SDK `signIn()` 선시도(UA 분기 금지 철칙 준수).

### 🟡 C-1-C. 외부 리다이렉트 (A-6) — 조건부 완료(PCT 미확인)

- **공식 원문**: "Apps should not redirect users to external websites, apps or services." (필요성 기준 케이스별 심사)
- **cafe.pi 사실**: Telegram 주문 알림 연동 시 외부 telegram.org/앱 실행.
- **질문**: "We open Telegram (external app) only to deliver seller order notifications, since Pi Browser lacks native push. Is this an acceptable 'necessity' case under the no-external-redirect rule?"
- **⚠️ 모더레이터 답변(2026-06-27)**: *"Opening Telegram only for seller order notifications may still be considered an external redirect. It is safer if the core order flow stays fully inside the Pi app, and Telegram is only an optional notification method chosen by the seller. Do not force users or sellers to leave Pi Browser to complete orders, payments, login, or support. I'd recommend asking PCT/Support portal for confirmation before relying on it."*
- **✅ 코드 검증**: `src/components/.../telegram-connect.tsx` = 판매자 **opt-in 알림** 연동, 주문·결제는 **인앱 완결** → 안전 3조건(①핵심 플로우 인앱 ②선택 알림 ③이탈 강제 금지) 부합.
- **✅ 마스터 결정(2026-06-27)**: 모더레이터 안전조건을 코드가 충족 → **조건부 완료 수용**. PCT 미확인이므로 추후 PCT/Support portal 판정이 다를 경우 재조정. (선택 질의: support.minepi.com — *"Telegram is purely an optional seller-chosen notification; the entire order/payment/login/support flow stays inside the Pi app. Is this acceptable under the no-external-redirect policy?"*)
- **채널**: Pi Support portal(support.minepi.com) — PCT 권한 확인 / Discord · Developer chat room(보조).

### 🟢 C-1-D. 데이터 수집 최소화 (A-7) — 완료

- **공식 원문**: "Only collect user data essential for your app's functionality."
- **cafe.pi 사실**: 실명·전화·주소·카카오ID·위치정보 수집.
- **조치**: 수집 항목별 **필수 기능 매핑표** 작성(예: 주소=O2O 배송, 위치=주변 매장). 비필수 항목은 선택/제거.
- **✅ 마스터 결정(2026-06-27)**: 수집항목은 **O2O 서비스용 선택 옵션·강제 아님** → 완료. 매핑표=부록2, 프로필 UI 필수/선택 표기 완료(common.optional). 개인정보처리방침 반영은 별도 법무.
- **채널**: Discord · Developer chat room.

### 🟡 C-1-E. 개발자 KYC (A-2)

- **공식 원문**: "Developers must complete KYC ... before submitting an application to list." + 메인넷 지갑은 KYC + 초대 슬롯 전제.
- **조치(질문 아님·선행 확인)**: 아나킨님 본인 Pi App에서 KYC 완료 상태 및 메인넷 지갑 슬롯 확보 여부 확인.
- **채널**: Pi App > KYC / Mainnet Checklist.

### 🟠 C-1-F. 임시 Bean 토큰 발행·테스트 (A-5) — 공식 침묵 회색지대 → 보수적 제거 방침

- **공식 원문(A-5)**: *"All transactions must be conducted in Pi, with no support for non-Pi Tokens or fiat currencies."*
- **공식 침묵(2026-06-29 공식문서 직접 확인)**: Pi 등재 요건 문서는 **인앱 포인트·크레딧·보상 시스템, 토큰 발행/민팅을 일절 다루지 않는다**(명시 금지도 허용도 없음). → A-5는 *거래(transactions)* 만 규율.
- **cafe.pi 사실**:
  - **현재 Bean = 오프체인 인앱 포인트**(`bean_wlt`·`bean_txn`·`fn_bean_mint`). 블록체인 토큰 아님 — `fn_bean_mint`는 `bean_token_wallet` DB 잔액 +amt + `bean_mint_log` 기록(현금·체인 무관 보조금성 발행). 외부 거래·환전 불가.
  - 단 ⓐ 명칭이 **"Bean Token"·"토큰 발행/충전/경제"**(ko.json L727·902·1639·1695-6 등), ⓑ 일부 **플랫폼 거래(구독)를 Bean으로** 정산, ⓒ `PRD_12_TOKEN`이 **메인넷 시 Pi Launchpad 온체인 BEAN 토큰 공식 발행** 계획(미발행·Launchpad Mainnet 미출시).
- **공식 기준 판단**:
  - **오프체인 포인트로서의 Bean 자체** = 공식 명시 금지 없음 → **"위반"으로 단정 불가**(회색지대). 기술적으로 체인 토큰 발행이 아니므로 A-5 *"non-Pi Tokens"* 직접 해당 어려움.
  - **그러나 A-5 저촉 *소지***: "Token" 명칭·"발행" 표현은 *"non-Pi Tokens"* 와 충돌하는 **인상**을 주고(심사관은 문구를 본다), Bean으로의 거래는 *"transactions in Pi"* 와 충돌 소지. 공식이 포인트를 안 다루므로 **명칭이 "Token"이면 토큰으로 판정될 위험**을 배제 못 함.
- **🔵 Pi 직접 질의(보수)**: *"Bean is an off-chain in-app point (a DB balance, not tradable or withdrawable). (a) Does naming it 'Bean Token' or describing a future Launchpad issuance conflict with the no-non-Pi-Token rule? (b) Are in-app reward points that are only spent within the app acceptable if all real transactions settle in Pi?"*
- **⭐ 마스터 방침(2026-06-29) — "조금의 소지라도 있으면 메인넷에서 제거"**:
  - **유지**: Bean 포인트 *기능*(보상·적립)과 내부 `fn_bean_mint`(관리자 전용·사용자 미노출)는 유지 — 핵심 기능, 공식 위반 근거 없음.
  - **메인넷 제거/순화(운영=cafepi에만, staging은 유지)**:
    1. **표현(P0)**: "Bean Token / 토큰 발행 / 토큰 충전 / 토큰 경제" → "Bean(포인트·크레딧) / 지급 / 적립"으로 순화. 운영 i18n 오버레이(`NEXT_PUBLIC_LISTING_MODE`), 원본 `ko.json`·staging 불변. PRD_23 §3·§8.5.
    2. **발행 계획 노출 제거**: ko.json L727·902의 "메인넷 시 Bean Token 공식 발행" 문구 비노출. `PRD_12_TOKEN` 계열은 내부 대외비 — 등재 제출물에서 제외.
    3. **거래는 Pi로**: 플랫폼 거래(구독 등)는 메인넷에서 Pi 결제로 통일(Bean은 보상·적립 한정, 거래 수단 아님). 메모리 `currency-routing-rule` 의 "과도기 Pi" 유지와 일치.
    4. **테스트 발행 데이터 초기화**: `fn_bean_mint` 테스트 발행분(`bean_mint_log` + 사용자 테스트 Bean 잔액)은 컷오버 직전 초기화(기존 방침 — 메모리 `prod-db-bootstrap-and-supabase-conn`).
- **채널**: Pi Ecosystem Discord · Developer chat room. (Launchpad는 Pi Browser 'Pi Launchpad' 앱 — Mainnet 미출시라 현재 온체인 발행 불가)
- **✅ 이행 현황(2026-07-08 현행화)**:
  1. **표현 순화(P0)** = 🟢 **코드 완료**. `NEXT_PUBLIC_LISTING_MODE` env + `src/i18n/request.ts` 로드 후처리 오버레이 + `messages/listing/{ko,en}.json`(절제 키만). 오버레이도 ko→en→locale 폴백을 따라 189개 locale 전부 en 절제문으로 커버(silent 원문 노출 방지). 원본 ko.json·DB `i18n_message` 정본 불변. **잔여 = 운영(cafepi) Vercel env `NEXT_PUBLIC_LISTING_MODE=true` 설정+재배포(마스터)**. staging·로컬은 미설정(절제 OFF).
     - 절제 대상 실측(2026-07-08): "Bean Token"·"토큰 발행/충전" 문자열은 ko.json에서 **이미 소멸**(검색 0건). 잔존 = `admin.nav.beanSection`("Bean 경제")·`adminStats.whitepaper.highlight2Desc`(en "Token Economy" ⚠️심사 주 언어)·`pillar3Desc`("발행")·`adminStats.beanFlowCharge`("충전(발행)") + 통화 참고 라벨(`store.fiatRefAt`·`store.form.priceConverted`) → 전부 오버레이 커버.
  2. **발행 계획 노출 제거** = 🟢 ko.json 실측상 해당 문구 소멸(위 1 실측). `PRD_12_TOKEN` 계열 내부 대외비·등재 제출물 제외 방침 유지.
  3. **거래는 Pi로** = 🟢 **완료(2026-06-30)** — 운영 `fee_mode=PI` 전환(PRD_24·sql/140~148). 구독 등 플랫폼 거래 Pi 직결제, 마이크로 요금 무료화, 후기 보상 실 A2U.
  4. **테스트 발행 데이터 초기화** = 🟡 **잔여** — 메인넷 컷오버 직전 `bean_mint_log`+테스트 Bean 잔액 초기화(마스터 실행, 메모리 `prod-db-bootstrap` 방침).

> **공식 문의 채널 요약**: ① **Dev Portal in Pi Browser**(상표 라이선스 신청) ② **Pi Ecosystem Discord**(Core Team 상주, 가장 빠름) ③ **Pi App 내 Developer chat room**(Chat > + 아이콘 > Developer room). *(검색 결과엔 `support.minepi.com` 포털도 있으나 공식 개발자 가이드 본문에는 미기재 — 보조 수단으로만 간주)*

---

# Part D. 참고: 자체 코드베이스 점검 (Pi 공식 요건 아님)

> ⚠️ 아래는 **cafe.pi 내부 출시 준비 자체 점검**이며 Pi 공식 등재 요건이 아니다. 공식 가이드와 혼동하지 말 것. 근거는 코드/CLAUDE.md/메모리.

## D-1. [P0] Pi Browser 실기기 검증 (핵심가치 — 출시 게이트)

- **로그인**: `pi-auth-provider.tsx` `window.Pi.authenticate()` + `pi-fetch.ts` X-Pi-Token 이중경로 + `auth-check.ts` 쿠키/헤더 폴백. 커밋 53e8340으로 UA 사전게이트 제거 복구.
  - 검증: Pi Browser 실기기 로그인 → `localStorage.pi_token` 존재 → 새 탭 세션 유지.
  - ⛔ BLOCKER: UA 기반 signIn 사전차단 코드 재발견 시 즉시 중단(8bf8752 사고). signIn 가드는 `if (!window.Pi)`만.
- **결제**: `api/payments/{approve,complete,cancel}` + `pi-a2u.ts`. 검증: 결제 완료 후 `pi_pymnt` COMPLETED 행 + 멱등성.
- **클라이언트 게이트**: `getSessionUser()` null 시 redirect 금지(무한루프 방지) — 코드 확인됨.

## D-2. 환경변수 (Vercel 프로덕션 — 아나킨님 수동)

`src/env.ts` 스키마 기준 필수: `PI_SESSION_SECRET`, `AUTH_SECRET`, `CRON_SECRET`(프로덕션 강제), `PI_API_KEY`(**메인넷용**), `PI_WALLET_PRIVATE_SEED`(**메인넷 프로젝트 등록 지갑과 동일해야 함** — Part B-3), `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID/SECRET`. 선택: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `CLOUDFLARE_TURN_*`.
**메인넷 등재 전용(2026-07-08 신설)**: `NEXT_PUBLIC_LISTING_MODE=true`(운영만 — 절제 오버레이 ON) · `PI_DOMAIN_VALIDATION_KEY`(메인넷 Dev Portal 도메인 검증 키 — `/validation-key.txt` 라우트가 서빙, E-3 후 발급값 입력).
- ⛔ `.env.local` git 커밋 금지. Vercel UI/CLI로만 설정. `pnpm build`가 env 스키마 검증.

## D-3. 등재 레드라인 자체 코드체크 (Part A-3~A-6 보강)

- 도박/베팅: 코드 0건(베팅 제거 완료, 메모리 pi-mainnet-listing-redlines).
- Pi 외 통화 직결제: 코드 0건(Pi+Bean 오프체인만).
- Pi 외 로그인 강제: 없음(Pi 우선, Google은 연동/폴백).
- 브랜딩 표기: UI=PiCafé™/PiShop™/PiTranslate™, 코드값=PICAFE/PISHOP/TRANSLATE, 결제 memo ™ 제외.

## D-4. 인프라·무결성·운영 (자체)

- Vercel Pro(2026-06-18) — Cron 다수·상업적 사용. Cron: settle(5분), bean-mint(일1회), 구독 처리.
- 결제 멱등성·통화 라우팅(플랫폼↔Bean / P2P↔Pi / O2O↔Pi+Bean보상)·원자적 RPC(sql/074).
- 다국어 **활성 189개 locale·66개 언어 완역**(2026-07-08 글로벌 대확장) `validate:locales` 통과 / username 마스킹 / 현지 시간 표시.
- 모니터링 `/admin/monitor` / 롤백=Vercel revert·Supabase 백업.
- **운영DB 컷오버 완료(2026-06-28~29)**: 운영DB(`ajdwlcqoljkjamostutc`) 신설·dev 100% 미러(96테이블·59,280행)·센티넬 검증. 읽기전용 보호(`SUPABASE_READONLY_MODE`+쓰기 가드+read-only 롤 sql/136). 외부 테이블 12종(sql/134)·i18n 레거시 2종(sql/135) 정리. 접속=aws-1-ap-northeast-2 Session pooler.
- **2단계 배포 분리**: staging(loginpi·master·🧪배너) / 운영(cafepi·production 브랜치) 2-프로젝트 + `promote-to-prod.mjs`(ff-only 승격) + 배포 컨트롤 화면·진행상태 폴링. ⚠️ `NEXT_PUBLIC_APP_URL` 도메인별 필수(통짜 복사 시 api-guard Origin 검증으로 `/api/auth/pi` 403→로그인 깨짐).

---

# Part E. 아나킨님 액션 아이템 (공식 절차 기반)

> 순서는 공식 절차(Part B) 의존성 기준. 날짜는 신청 확정 후 역산.

| 순서 | 액션 | 공식 근거 | 상태 |
|---|---|---|---|
| 1 | **본인 Pi KYC 완료 확인** (메인넷 지갑 슬롯 전제) | B-2-1 / A-2 | 🟡 확인필요 |
| 2 | **A-3 상표 결정**: Trademark Licensing Agreement(Dev Portal) 체결 **또는** Pi 접두 개명. 공식 규칙상 'Pi App_Name' 형태 금지 | A-3 / C-1-A | ✅ **Py 개명 완료**(2026-06-27, PyCafé™/PyShop™/PyTranslate™ — C-A 공식답변 반영) |
| 3 | **메인넷 Developer Portal 프로젝트 신규 생성** (testnet과 별도, App Network=Mainnet) | B-2-2, B-3 | 🚫 수동 |
| 4 | **앱 URL 확보 + 도메인 검증** (`validation-key.txt`, 타 프로젝트와 URL 중복 불가) | B-1-12, B-2-3 | 🟡 운영 URL 확보 + **서빙 라우트 구현 완료(2026-07-08)** — E-3에서 키 발급되면 Vercel env `PI_DOMAIN_VALIDATION_KEY` 설정+재배포만 |
| 5 | **메인넷 API Key 발급** → Vercel `PI_API_KEY` 설정 | B-2-4 | 🚫 수동 |
| 6 | **등록 지갑 = A2U 정산 지갑 일치** 확인 → `PI_WALLET_PRIVATE_SEED` | B-3 | 🚫 수동 |
| 7 | Vercel 환경변수 전체 + Cron 등록 | D-2, D-4 | 🟡 운영 env+운영DB 컷오버+**SANDBOX=false 확정(2026-07-02)**+fee_mode=PI 완료. 잔여=메인넷 `PI_API_KEY`·지갑 시드·시크릿 rotate·`NEXT_PUBLIC_LISTING_MODE=true` |
| 8 | **Pi Browser 실기기 로그인·결제 검증** (P0 게이트) | D-1 | ⏳ |
| 9 | U2A 트랜잭션 1건으로 생태계 연결 확인 | B-1-13 | ⏳ |
| 10 | 등재 신청 제출 (요건 A-1~A-7 충족 상태) | A 전체 | 🚫 수동 |

---

## ✅ 사용 규칙

1. 본 문서의 **Part A·B는 공식문서 원문만** 갱신한다(추측 추가 금지).
2. cafe.pi 적합성은 **Part C에 '확인필요'로만** 기록하고, Pi 직접 확인 결과로 갱신한다.
3. 공식 출처 4개가 갱신되면 본 문서도 재대조한다.

**근거 정본**: 위 공식 출처 4개 · **최종 갱신**: 2026-07-08

---

# 부록 1. Pi→Py 개명안 영향 분석 (사전 검토 — 미실행)

> 목적: A-3 상표 충돌 해소책 중 **"Pi 접두 → Py 개명"**(PiCafé™→PyCafé™ 등)을 택할 경우의 영향 범위를 사전 분석. **아직 실행하지 않은 검토 자료.**
> ⚠️ **"Py"의 상표 적합성은 본 분석이 보증하지 않는다** — "Py"는 "Pi"와 한 글자 차이라 Pi가 "confusingly similar / 브랜딩 오용"으로 볼 수 있다(공식 규칙 취지: *"avoid Pioneers confusion that your app was created by Pi Core Team"*). 채택 전 Pi 직접 질의 필수.

## 핵심 구조 발견 — 코드값과 표시명이 이미 분리됨

`messages/ko.json` 2114~2116행이 증거:
```json
"PICAFE": "PiCafé™ 구독",     // KEY=코드값(불변) / VALUE=표시명(변경대상)
"PISHOP": "PiShop™ 구독",
"TRANSLATE": "PiTranslate™ 구독"
```
→ **표시명(VALUE)만 바꾸고 코드값(KEY/DB enum)은 그대로 둘 수 있다.** 중앙 브랜드 상수는 없고 표시명은 전부 i18n VALUE에 존재.

## 🟥 Tier 1 — 반드시 변경 (사용자 노출 표시명 = 상표 대상)

| 대상 | 위치 | 규모 | 비고 |
|---|---|---|---|
| i18n 표시값 | `messages/ko.json`(정본) VALUE 측 | ~20개 문자열 | `"PiCafé™"`→`"PyCafé™"`. é·™ 규칙 유지 |
| 나머지 21개 locale | `messages/*.json` | DB 재싱크 자동 | 손수 편집 금지(`i18n_message` 정본) |
| 외부 노출 문서 | `PI_등재_기술부록`·`공개_라이선스_정책`·`WHITEPAPER_EN` | 중 | 대외 제출물 우선 |

→ Tier 1 기계적 변경은 **ko.json ~20줄 + DB 재싱크로 수렴**(코드 로직 거의 무변경).

## 🟩 Tier 2 — 절대 변경 금지 (내부값·플랫폼 참조)

| 대상 | 예시 | 변경 시 위험 |
|---|---|---|
| DB 코드값 | `prod_ctgr_cd='PICAFE'/'PISHOP'/'PISHOP_SUBSCR'/'TRANSLATE'` | DB 마이그레이션 + 14개 src 로직 동시 수정 |
| i18n KEY | `"PICAFE": ...` | 키 변경 시 전 컴포넌트 `t()` 파손 |
| Pi 결제 memo | memo의 `PICAFE` 코드값 | 결제 호환·정산 추적 파손 |
| ⛔ Pi 플랫폼 토큰 | `Pi Browser`·`window.Pi`·`piFetch`·`pi_session`·`pi_pymnt`·`PiRC2`·`isInPiBrowser`·`X-Pi-Token` | **Pi 로그인·결제 systemic 붕괴(핵심가치 #1·#2)** |

> 공식 상표 규칙은 **앱 이름·도메인·소셜 핸들**(노출명)만 대상. 내부 enum 코드값은 비노출 → **변경 의무 없음, PICAFE 유지가 정답.**

## 🟦 Tier 3 — 일관성 갱신 (내부 문서·메모리, 긴급도 없음)

- `CLAUDE.md` "공식 브랜드 표기" 섹션
- 메모리: `cafe-brand-naming`·`pistore-p2p-o2o-marketplace`·`bean-means-coffee-bean`
- 내부 PRD: `PRD_4_CHAT`(66)·`PRD_7_CHAT2`(66)·`PRD.md`(46)·`PRD_14_SUBSC`(38)·`ROADMAP`(36) 등

## ⚠️ 리스크 3가지

1. **블라인드 치환 = 치명적.** `Pi`→`Py` 전역 replace는 `Pi Browser`·`window.Pi`·`piFetch`까지 바꿔 로그인·결제 파괴. **표시명 토큰만 외과적으로** 변경할 것.
2. **브랜드 가족 5종.** `PiCafé`·`PiShop`·`PiTranslate`·`PiVoice`(ko.json:2424)·`PiChat` 전부 동일 규칙 대상.
3. **"Py" 적합성 미확정.** Pi 직접 질의 필요(한 글자 차 유사성).

## 📌 결론

| 질문 | 답 |
|---|---|
| 코드값(PICAFE)도 변경? | **아니오** — 비노출 내부값, 변경 의무 없음·고위험. 유지 |
| 실제 변경 규모? | Tier 1 = ko.json ~20줄 + DB 재싱크 |
| 최대 위험? | 블라인드 치환에 의한 Pi 플랫폼 토큰 오염 |
| Py 상표 OK? | **미확정** — Pi 직접 질의 필요 |

**검토일**: 2026-06-26 · **상태**: 미실행 사전분석

---

# 부록 2. 개인정보 수집 필수성 매핑표 (C-D 산출물)

> 목적: 공식 요건 **A-7 "Only collect user data essential for your app's functionality"** 대응.
> 방법: `sys_user`(UserRow) 전 필드를 코드의 **실제 소비 지점**으로 추적해 필수성 판정. 🔴=재검토 권고.

| 수집 항목 | 저장 | 수집 시점 | 실제 사용 기능(소비처) | 판정 |
|---|---|---|---|---|
| pi_uid | sys_user | Pi 로그인 | 인증·세션 핵심(getSessionUser) | ✅ 필수 |
| pi_username | sys_user | Pi 로그인 | 표시·식별(마스킹 적용) | ✅ 필수 |
| pi_wallet_address | sys_user | Pi 로그인 | 결제·A2U 정산 수신 | ✅ 필수 |
| display_name | sys_user | 자동/프로필 | 화면 표시명 | ✅ 필수 |
| display_locale_cd | sys_user | 프로필 | PiTranslate 표시언어(비식별) | ✅ 필수(기능설정) |
| last_login_dtm | sys_user | 로그인 | 운영·보안 | ✅ 필수(비민감) |
| google_id/email/name/image | sys_user | Google 연동(선택) | 일반브라우저 로그인·계정연동 | 🟡 선택 — C-B 질의 결과 의존 |
| nick_nm | sys_user | 프로필(선택) | 표시 별명 | 🟡 선택 |
| self_intro | sys_user | 프로필(선택) | 프로필 자기소개 | 🟡 선택 |
| kakao_id | sys_user | 프로필(선택) | 이벤트 미션 M2 선물 전달 | 🟡 조건부(이벤트 참여 시) |
| 위치(latd/lngt·lbs_consent) | usr_loc_hist·sys_user | LBS 동의 시 | 주변 매장·상품 탐색 | 🟡 동의기반 선택(행정구역 단위) |
| real_nm (실명) | sys_user | 프로필(선택) | 선택적 입력(표시명 폴백) | 🟡 선택 — 필수 아님 |
| phone_no (연락처) | sys_user | 프로필(선택) | **O2O 픽업 미이행 시 구매자 연락 수단** | 🟡 선택 — 용도 명확 |
| addr·addr_dtl (주소) | sys_user | 프로필(선택) | **O2O 향후 배송 대비** | 🟡 선택 — 용도 명확 |

## ✅ 마스터 결정 반영 (2026-06-26)

A-7 대응 = "수집하되 ① 기능적 용도가 있고 ② 선택 입력" 으로 정리:

1. **phone_no(연락처)** → **선택**. 용도: **O2O 거래에서 구매자가 픽업하지 않은 경우 연락 수단**.
2. **real_nm(실명)** → **선택**. 선택적 입력, 필수 아님.
3. **addr(주소)** → **선택**. 용도: **O2O 서비스의 향후 배송 대비**.

→ 셋 다 **mandatory가 아니므로 A-7 충족**. 단, ⑴ 프로필 UI에 "(선택)" 표기, ⑵ 개인정보처리방침에 항목·용도 명시가 뒤따라야 입증이 완결된다.

## 권고 조치 (잔여)
- 프로필 폼에 **선택 항목 라벨** 추가(필수=display_name만 명확화).
- 개인정보처리방침에 **수집 항목·용도·선택여부** 반영(위 표를 근거로).
- 등재 신청 시 본 매핑표를 "수집 항목별 필수성 근거"로 제출.

**작성일**: 2026-06-26 · **근거**: 코드 소비처 추적 + 마스터 용도 확정

"메인넷 승인"은 사실 2단계입니다

┌────────────────────────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┐
│                  단계                  │                 무엇                 │                게이트                │
├────────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. 메인넷 프로젝트 만들기 + API Key    │ 메인넷용 앱을 등록하고 키를 받음     │ 심사 아님 — KYC(✅) + 지갑 슬롯만    │
│ (E-3·E-5)                              │                                      │ 있으면 됨                            │
├────────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ 2. 생태계 등재 심사 (E-10)             │ Pi 디렉토리에 우리 앱을 올려줄지     │ 진짜 "승인" — 맨 마지막              │
│                                        │ 검토·승인                            │                                      │
└────────────────────────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘

→ 즉, 2번(등재 승인)은 "앱이 메인넷에서 잘 돌아가는 걸 확인한 뒤" 맨 마지막에 받는 것입니다. 그래서 메인넷 환경 구축은 *"승인 전에 미리"*가 아니라, **"승인을 받기 위해 먼저 갖춰야 하는 준비"**예요. 순서가 그렇습니다: 환경 만들고 → 테스트하고 → 그다음 등재 승인 신청.
