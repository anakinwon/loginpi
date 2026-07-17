# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵 (라이트버전)

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 16 기반 Pi Network 앱 플랫폼

> **버전**: v13.5 · **기준일**: 2026-07-17
> **배포 URL**: **staging** https://loginpi.vercel.app (Testnet·🧪) · **운영** https://cafepi.vercel.app (production 브랜치 게이팅·메인넷 PI모드 운영 중)
> **기술 스택**: Next.js 16 App Router · React 19 · TypeScript 6 · Tailwind CSS v4 · NextAuth v5 · Supabase PostgreSQL
>
> ⭐ **본 문서는 라이트버전이다.** Phase 0~27 TASK 단위 구현 상세·마일스톤 M0~M31·과거 변경 이력 전문은
> **`docs/archive/ROADMAP_FULL_v12.10_2026-07-08.md`** 로 이관했다. 기능별 정본은 각 하위 PRD(`docs/README.md` 인덱스),
> 전체 기능 요약은 `docs/PRD.md`(라이트), 사고·리스크는 `docs/TROUBLESHOOT.md` 참조.

---

## 🚨 0순위 — 메인넷 등재 승인 완료 시 즉시 실행 (2026-07-15 마스터 지시)

> **등재 승인 = Pi가 이 앱의 A2U(앱→사용자 송금)를 개방하는 시점.** ⭐**감지 자동화 완료(2026-07-16)**: cron `a2u-probe`(매일 09:30 KST)가 A2U 생성 프로브(즉시 취소·송금 0)로 개방을 감지하면 **마스터 텔레그램으로 즉시 알림**한다. 알림(또는 승인 소식) 확인 즉시 다른 모든 작업보다 먼저 아래를 실행하고, **마스터에게 반드시 결과를 보고(알림)한다.** 완료 전까지 이 블록을 삭제하지 말 것.

| # | 작업 | 방법·판정 |
|---|---|---|
| 1 | **A2U 개방 검증** | `/admin/payments`에서 결제 `Z9UwKh…`(0.8π) 환불 버튼 1클릭 → 성공(txid)이면 개방 확정. 실패 시 에러 판별표=TROUBLESHOOT [2026-07-15]편 |
| 2 | **미환불 취소건 자동 소급 확인** | refund-sweep cron(30일 윈도우)이 `REFUND_IN` 생성했는지 확인 (0.8π 건 포함) |
| 3 | **정산 백필** | `/api/admin/store/settle` 실행 — feature_not_available 8건 해소. `user_not_found` 16건은 해당 구매자 재로그인(uid 갱신) 후 재실행 |
| 4 | **기타 A2U 경로 정상화 확인** | 팁(tip-pi-payout)·후기보상(fbck-pi-payout) cron, 이벤트·캠페인 보상(관리자 승인 게이트) |

> 전제(✅완료): 메인넷 앱 지갑 시드 교체·실측 검증(serverWallet=GA3L…, 2026-07-15) — **앱 구성은 완결, 남은 차단은 Pi 승인뿐.** 정본: MAINNET_READINESS_CHECKLIST §0순위 + TROUBLESHOOT [2026-07-15]

---

## ⚠️ 운영 인프라 제약사항 (필독)

> 개발·배포 시 반드시 확인해야 할 플랫폼 제약. 위반 시 배포 차단 또는 서비스 오동작 발생.

| 항목 | 제약 | 현재 설정 | 해결책 |
|---|---|---|---|
| **Vercel Pro — Cron 주기** | 분 단위 cron 지원 (2026-06-18 Pro 전환) | 고빈도 가능 | Pro 유지 필수 (다운그레이드 시 분단위 cron 배포 차단) |
| **Pi Browser — Set-Cookie** | WebView에서 모든 방식의 Set-Cookie 저장 안 됨 | 쿠키 + `X-Pi-Token` 헤더 이중 경로 | `piFetch` 사용 필수, `redirect` 금지 |
| **NextAuth v5** | beta.31 유지 — stable 미출시 | `5.0.0-beta.31` | stable 출시 시 UPGRADE_STRATEGY.md 참조 |

> 상세 트러블슈팅: `docs/TROUBLESHOOT.md`

---

## 📊 전체 진행률 요약 (2026-07-08)

| Phase | 명칭 | 상태 | 잔여·비고 (정본) |
|---|---|---|---|
| 0~6 | 스타터킷·Pi 인증/결제·Google 연동·관리자·게시판·DA 표준·다국어 기초 | ✅ 100% | — |
| 7~9 | PyCafé™ MVP·수익화·생태계 확장 | ✅ 100% | PRD_4·PRD_7 |
| 10~11 | 마이페이지·어드민 통계 대시보드 | ✅ 100% | PRD_5·PRD_6 |
| 12 | PyTranslate™ 글로벌 동시통역 | ✅ 100% | PRD_4 |
| 13 | PyShop™(MPS) P1+P2+P3 O2O+P4 카트·자국통화 | ✅ 100% | PiRC3 실 에스크로만 보류 (PRD_8) |
| 14 | PyVoice™ v3.0 N:N 음성채널 | ✅ 100% | S0 실기기 검증·TURN env 잔여 (PRD_9) |
| 15 | LBS 위치기반서비스 P0+P1 | ✅ 100% | +매장 거리 표시 3층(인포윈도우 📍·등록 다이얼로그 실시간 배지·제출 좌표 최신 GPS)·동의 게이트 401 오판 근본수정 (2026-07-17). 지도 UI 확장 예정 (PRD_10) |
| 16 | 이벤트 미션 시스템 (Pi 요원 육성) | ✅ 운영 중 | 보상=1π 보증금 적립·관리자 수동 지급 (PRD_11) |
| 17 | BEAN 토큰 발행 (Pi Launchpad) | 📝 기획·문서 전용 | 앱 코드 0 유지. T01 KYC·T02 신청·T05 법무 외부 회신 대기 (PRD_12) |
| 18 | 판매자 주문 알림 (Telegram 3계층 Outbox) | ✅ 100% | PRD_13 |
| 19 | Bean Token 경제 관리 | 🔶 P0 완료 | 잔여: bean_fee_plan 하드코딩 DB 이전(보류) (PRD_16) |
| 20 | 화면 성능 최적화 (6탭 전수 진단) | ✅ **CRITICAL 전량 종결** (2026-07-09 전수 확인) | CAFE 폴백·MAP 클러스터링=6/23 기구현(bda03c35)·SHOP 가드=기구현 — 스테일 잔여 표기 정리. +유령 폴링 실버그 수정(방 이탈 후 폴링 누수, disposed 가드). 잔여는 HIGH/MEDIUM급 (PRD_18) |
| 21 | 보안 강화 (KISA 21 + DDoS 5계층) | 🔶 코드 완료 | 잔여: Vercel Firewall/BotID 수동 설정·Supabase timeout·세션 블랙리스트 (PRD_2) |
| 22 | 데이터 분석 4탭 통합 페이지 | ✅ **구현 완결** (실사 v1.2 + CSV 내보내기 2026-07-10) | 4탭(매출·주문·접속/사용·퍼포먼스) 전부 운영 중 — "잔여 탭 3종"은 스테일이었음. +**현재 탭 CSV 내보내기**(csv-export.ts·BOM·섹션별 직렬화) 구현. 잔여=채널 전환 퍼널·지리 지도(둘 다 선결 대기·정당 보류) (PRD_21 §7-0) |
| 23 | 실시간 시스템 모니터링 | ✅ **핵심 완결** (2026-07-09 정책 확정) | `/admin/monitor` 실작동(staging 299·운영 666행 계측)·운영 정책 3건 마스터 확정(**전량 저장·보존 7일 물리정리 cron·5초 폴링**). 잔여=고도화 2건(Vercel Analytics API 통합·RPC 2종 후속) (PRD_22 §9.3) |
| 24 | 메인넷 전환 & 2단계 배포 인프라 | ✅ **신청 완결·승인 대기** (2026-07-16) | **체크리스트 19/19 전원 DONE** — 가상심사(5역할, 레드라인 BLOCK 0)→후속 완결(베팅 키 4,512행 삭제 sql/182·오버레이 25키+크립토 라운지·_comment 직렬화 차단)·도메인 검증 통과(env 라우트 200·포털 Verify). **별도 제출 절차 부재 공식 확인**(포털 Checklist 10/10=신청 행위, Ecosystem 노출=Core Team 선별 큐레이션). 승인 감지=a2u-probe cron 자동화. 잔여=**Pi 승인 대기뿐** (MAINNET_READINESS_CHECKLIST) |
| 25 | 이중 요금제(BEAN/PI) 런타임 스위칭 | ✅ 운영 PI모드 | 잔여: 보상 A2U(이벤트미션·캠페인) 미전환 (PRD_24) |
| 26 | 오픈기념 무료요금 OneKey | ✅ 활성 (전략적 연장 운영) | ⭐무료 프로모=사용자 유입 전략으로 **계속 연장 예정**(2026-07-09 마스터 확정, 현재 종료값 2026-12-31 KST·staging은 6/30 종료). 종료 게이트 검증 완료(R-02). 잔여: 기간연장·PyShop·노출 품목 추가 (PRD_26) |
| 27 | P2P 채팅 텔레그램 릴레이 + 직거래 문의방 | ✅ **완결** (2026-07-09 확인) | 통합알림(TXN_ST/FBCK)도 구현·운영 배포 완료(4bac4502, trade-noti.ts — 상태 전이 5곳+취소+후기+cron). 실사용 이벤트 발생 시 자연 검증 (PRD_13 §18) |
| 28 | 글로벌 i18n 대확장 (189 locale·66언어 완역) + Pi Sign-In(OAuth) 일반 브라우저 Pi 로그인 | ✅ 완료 (2026-07-07~08) | 3종 여정(PC QR·모바일 딥링크·Pi Browser SDK) 실기기 검증 완결 (PRD_3 v2.0·TROUBLESHOOT 2026-07-08) |
| 29 | **Pi 앱 팩토리** — .pi 도메인 멀티테넌트 인큐베이팅 | ⏸️ **무기한 홀딩** (2026-07-09 마스터) | 가능성 타진 완료(설계 v1.3·도메인 19개 매핑·파일럿 yea.pi·DDL 초안 sql/173 미적용). **구현 착수·모선 복잡도 추가 금지 — 모선 집중.** 재개=마스터 지시로만 (PRD_27) |
| 하네스 | **멀티에이전트 팀 하네스 2종 구축·실전 가동** (2026-07-10) | ✅ 운영 중 | ① **메인넷 등록팀**(4역할 병렬 — 레드라인·체크리스트·제출·P0, `.claude/workflows/mainnet-listing-team.js` 재실행 가능) ② **DA팀 5인**(da-team 스킬 — 리더·표준·모델·품질·이행): 첫 전수감사 sql/102~175 **PASS**(P1 0건·오탐 2건 리더 기각)→접두사 22종 현행화(정본+가드) + 1차 실전 설계 `sys_cfg_chg_hist`(sql/176~178, 스테이징 검증 통과·운영 적용 대기) |
| 법무 | **법무 문서 4종 v1.1 동시 개정** (방침·환불·약관·커뮤니티) + **방침·약관 v1.2 표현 정정** | ✅ v1.1 시행 + v1.2 즉시 시행 (2026-07-16) | v1.1=텔레그램/Gemini 제3자·kakao_id·후기 보상·판매보증금 신설(7/16 시행). **v1.2=등재요건 문면 정합(실질 변경 없음)** — 제4조 Pi 인증 필수·Google 선택 보조 명확화·환율→지역 맞춤 표기·invokeContract→createPayment(2493099c, 법무 4페이지+홈 운영 실측 금지어 0건). 잔여: T05 외부 대기·G-8/9 경미 (갭점검 정본) |
| 횡단 9차 | **하드코딩 한국어 전수 제거 + API 에러코드 i18n** (2026-07-08~09) | ✅ 완료 | UI 837줄 화면 계층 완결(신규 키 1,124)+apiError 카탈로그(헬퍼·훅)·**107 route 587지점+admin 82파일 전환**·1,633키 × 66언어 완역·감사 정본 잔여 0·ESLint 91→0 |
| 횡단 1~8차 | 성능 튜닝·Pi Browser 안정화·검색 trgm 표준화·DA 거버넌스 점검·홈 정비 등 | ✅ 완료 | 상세: 아카이브 원문 |

### 요약 통계
- **완료**: Phase 0~16, 18, 25~28 + 횡단 1~8차 + GTM 문서화 + **24(메인넷 등재 — 신청 완결·승인 대기, a2u-probe 자동 감지)**
- **진행 중**: Phase 20(성능)·21(보안)·23(모니터링)
- **기획**: Phase 17(BEAN 토큰 — 문서 전용)·19 후속·22(분석)
- **예정**: PiRC3 보류 해제 대기·LBS 지도 확장·PyVoice TURN 운영·StarterKit 패키지 제품화(PRD_0_INT)·알림 Phase 2(카카오 알림톡·Telegram 양방향 버튼)

---

## ★ 핵심 기능 — 재사용 구현 가이드

> 다른 Pi Network 프로젝트 시작 시 이 두 SKILL 파일이 완전한 구현 매뉴얼이 된다.

### ① Pi + Google 계정 연동 — `.claude/skills/pi_google_link/SKILL.md`

Pi Browser는 WebView라 외부 브라우저를 열 수 없음 → **6자리 OTP 코드 + 연동 URL 클립보드 복사**로 해결.

- `sys_user` 단일화 — Pi row 원본에 Google 필드를 덧씌움
- `session.user.sub`=Google raw sub · `session.user.id`=users row UUID (연동 후 변경)
- 브루트포스 방지 5회 제한 · 쿠키 실패 시 X-Pi-Token 폴백
- 재사용 파일: `src/auth.ts`·`src/lib/users.ts`·`api/auth/link-start|complete|status`·`app/link/page.tsx`·`account-link-card.tsx`

### ② Pi 결제 시스템 (U2A) — `.claude/skills/pi_pay/SKILL.md`

U2A 3단계: `createPayment()` → `onReadyForServerApproval`(POST /approve) → 지갑 승인 → `onReadyForServerCompletion`(POST /complete).
**`/complete` 미구현 시 해당 사용자의 모든 미래 결제가 영구 차단** — 반드시 구현.

- 사용자 API=`Bearer <accessToken>` / 결제 API=`Key <PI_API_KEY>` (완전히 다름)
- `onIncompletePayment` 미완료 자동 복구 필수 · sandbox는 `NEXT_PUBLIC_PI_SANDBOX`(환경 내 고정 철칙 — PRD.md §3)
- 재사용 파일: `api/payments/approve|complete`·`pi-pay-button.tsx`·`pi-product-card.tsx`

---

## 개발 워크플로우

1. 기능 구현 후 타입 체크(`pnpm tsc --noEmit`) 통과 확인
2. 커밋 메시지는 한국어로 작성
3. **커밋·배포는 명시적 요청 시에만 수행** (자동 커밋·푸시 금지)
4. 새 Phase 시작 전 이 파일 진행률 표에 행 추가 — TASK 상세는 해당 하위 PRD에 기록

---

## 기술 업그레이드 모니터링

> `docs/UPGRADE_STRATEGY.md` 참조. 외부 조건 해소 시 즉시 진행.

| 항목 | 현재 | 대기 조건 |
|---|---|---|
| **next-auth v5 stable** | beta.31 유지 | npm `latest`가 5.x가 되면 `pnpm add next-auth@^5` |
| **ESLint 10** | 9.39.4 유지 | react/import/jsx-a11y 플러그인이 ESLint 10 peerDep 추가 시 |
| **middleware.ts → proxy.ts** | middleware.ts 유지 | next-intl이 Next.js 16 proxy(nodejs runtime) 지원 시 |
| **react-hooks/set-state-in-effect** | warn 20개 | 별도 리팩토링 — useEffect 내 setLoading 패턴 정리 |

---

## 알려진 이슈 및 결정 사항

| 항목 | 결정 내용 | 이유 |
|---|---|---|
| Pi Browser 감지 | `Pi.authenticate()` 성공/실패 기준 | UA 패턴 신뢰 불가 — 실제 SDK 동작으로만 판단 |
| 연동 URL 전달 | 클립보드 복사 | WebView에서 `target='_blank'`=WebView 내 열림 (외부 브라우저 강제 불가) |
| google_id 불일치 | `google_email` fallback 조회 | NextAuth UUID ↔ Google sub 숫자 형식 불일치 |
| Admin 라우팅 | `(admin)/admin/page.tsx` 구조 | Route group은 URL 세그먼트 없음 |
| Supabase admin 초기화 | lazy init 패턴 | 빌드 시점 SERVICE_ROLE_KEY 미설정 빌드 실패 방지 |
| DB 명명 | DA 도메인 접두사 표준 + 시스템 컬럼 4개 강제 | `docs/da/데이터표준규칙.md` 정본 |
| routing.ts locale | 203개 선점 등록 | `defineRouting()` 빌드 타임 고정 — 런타임 수정 불가 |
| locale 단일 소스 | `locale-currency.ts`·`locale-country.ts` | 중복 맵의 sync 버그 반복 방지 |
| locale_cd 검증 | `/^[a-z]{2,3}(-[A-Z]{2,3})?$/` 화이트리스트 | routing.ts 쓰기 전 코드 인젝션 차단 |

---

## 변경 이력 (최근)

> v12.10 이전 전체 이력은 `docs/archive/ROADMAP_FULL_v12.10_2026-07-08.md` 참조.

| 버전 | 날짜 | 내용 |
|---|---|---|
| v13.5 | 2026-07-17 | **LBS 지도·매장 등록 UX의 날 (운영 승격 4회·전부 실측 검증)** — ① **등재 알람 사전 테스트 완결**: a2u-probe 운영 직접 호출 `CLOSED` 정상(CRON_SECRET·LISTING_MODE·PI_API_KEY 전 구간 통과) + 운영 봇(cafe_pi_areal_bot)→마스터 텔레그램 실발송·수신 확인 — 승인 감지 대기 체계 신뢰성 확보(Vercel Cron이라 PC 전원 무관) ② **Map 업종 콤보 '전체 (Pi 매장)'→'Pi 매장'** 189 locale 일괄(bizCat.ALL 값 복사 — 번역 0·오역 위험 0, json+운영·스테이징 DB 3중, 3370afca) ③ **매장 인증 등록 거리 표시 3층 구축**: 등록 다이얼로그 실시간 거리 배지(100m 이내 초록/초과 빨강, watchPosition)+제출 좌표 최신 GPS(부모 7일 캐시 stale 해소, 342808d6)·구글 검색 매장 인포윈도우 📍 거리(클라 haversine, 20a68cef) — 실기기 확인 완료 ④ **'동의하고 시작' 무반응 근본수정**(2c2a7748): 401(Pi 자동인증 레이스)을 미동의 확정으로 오판·캐시 삭제→동의자 게이트 오뜸 + POST 실패 무피드백 이중 결함 — 200만 정본 반영+실패 토스트(lbs.consentFail) ⑤ 병행 트랙: 업종 콤보 Google 공식 12종 확장(b1293271)·상품 상세→스토어프론트 링크(b3b4899b) |
| v13.4 | 2026-07-16 | **메인넷 등재 신청 완결의 날 (커밋 17건·4트랙)** — ① **등재**: 가상심사(등록팀 확장 5역할 — 공식기준 리서치 추가, 레드라인 BLOCK 0)→당일 후속 완결(죽은 베팅 키 4,512행 json 189+staging+운영DB 삭제 sql/182 · 절제 오버레이 25키 보강+테마 'Pi투자'→'크립토 라운지' · `_comment` 번들 직렬화 노출 차단)·**도메인 검증 통과**(Vercel env 라우트 200·포털 Verify)·**체크리스트 19/19 DONE — 별도 제출 절차 부재 공식 확인(3소스), 승인 대기 전환**·**A2U 개방 자동 감지 cron**(a2u-probe 매일 09:30, 개방 시 텔레그램 0순위 런북 알림) ② **권한**: ADMIN=최상위 확정 — MASTER 단독 게이트 6곳 사문화 해소(`isMaster()` 중앙화·타입 술어)·admin 26화면 fetch→piFetch 63건 교체(Pi Browser 401 근본수정, 마스터 실기기 검증) ③ **i18n**: 한국 한정 개념 번역 통일 — 당근→P2P Marketplace·싸이렌오더→Mobile Order-Ahead(188 locale × 2키, json+staging+운영DB 3중 적용) ④ 세션 교훈 4건 CLAUDE.md 명문화(배포검증=commit status·커밋 전 pnpm build·piFetch 진단·번들 직렬화 노출) ⑤ **법무**: 방침·약관 v1.2 표현 정정(등재요건 문면 정합 — Pi 인증 필수 명확화·환율/invokeContract 정정, 국·영 4파일·부칙 '실질 변경 없음') + 절제 오버레이 '환율·시세' 9키 추가(총 47키) — 법무 4페이지+홈 운영 실측 금지어 0건 |
| v13.3 | 2026-07-10 | **하네스의 날 (14커밋·4트랙)** — ① **메인넷 등록팀 하네스** 가동: 레드라인 4종 전부 OK 실측·등재 실행 런북(7단+P0 12단계) 확정·기술부록 2종 현행화(189 locale·Pi Sign-In)·절제 오버레이 보강 → **잔여=마스터 포털 5건뿐** ② **DA팀 하네스**(5인) 구축·전수감사 sql/102~175 PASS(78파일·P1 0)·접두사 22종 현행화·1차 실전 sys_cfg_chg_hist 설계(sql/176~178 스테이징 검증 통과) ③ PyTranslate™ 국가파생 locale 오번역 근본수정+af·ar 매핑(채팅 언어콤보 189 완전 노출)+오염캐시 정리(sql/175·179) ④ 보안: 임시 스크립트 비밀값 하드코딩 재발 방지(gitignore+하네스 지침) ⑤ 분석 CSV 내보내기·운영 promote(오전) |
| v13.2 | 2026-07-10 | **스테일 대청소 완결 + 분석 CSV 내보내기** — ① Phase 27 완결 확인(통합알림 TXN_ST/FBCK=기구현·운영 배포, 4bac4502) ② 성능 CRITICAL 전량 종결 확인(CAFE 폴백·MAP 클러스터링=6/23 기구현) + **유령 폴링 실버그 수정**(방 이탈 후 폴링 누수, disposed 가드) ③ Phase 23 운영 정책 3건 마스터 확정(전량 저장·보존 7일·5초 폴링 — 샘플링 10% 제안은 결제 성공률 표본 보호 사유로 전량 유지 재확정) ④ Phase 22 완결: 4탭 기구현 확인 + **CSV 내보내기 신규**(csv-export.ts·BOM·현재 탭 데이터) + 번역키 3종 × 66언어 확산(json 188개·운영 DB 델타 564행) ⑤ 법무: 체크리스트 컨설팅 항목 제거·책임 3분리 확정(트리거형 NA) | 아소카 |
| v13.1 | 2026-07-09 | **4트랙 동시 진행일** — ① 법무 4종 v1.1 완결·공지 3건 게시(7/16 시행) + R-02 프로모 게이트 검증(운영 종료 실측 12/31=전략적 연장 확정) + SHOP window.Pi 가드 종결(CRITICAL 3→2) ② 횡단 9차: 하드코딩 한국어 전수 제거+API 에러코드 i18n 완결(107 route·1,633키×66언어·ESLint 0) ③ 등재: 절제 오버레이 운영 검증(C-1-F-①)·listing live(sql/169~172) ④ Phase 29 Pi 앱 팩토리 승인→설계 완결(PRD_27 v1.3)→**무기한 홀딩(모선 집중)** ⑤ 분석 매출 탭 P1(7/8) |
| v13.0 | 2026-07-08 | **라이트버전 개편** — Phase별 TASK 상세·마일스톤 M0~M31·과거 이력을 아카이브 이관, 진행률 1줄 표 체계 전환, 인코딩 깨짐 교정, Phase 28(i18n 대확장+Pi Sign-In) 행 추가 |
| v12.10 | 2026-07-08 | 헤더 세션 표시 소유권 정리(Pi Sign-In↔Google 버튼) + 모바일 딥링크 경로 실기기 검증 — Pi Sign-In 3종 여정 최종 완결 |
| v12.9 | 2026-07-08 | Pi Sign-In 실사용 검증 완료·일반 브라우저 Pi 로그인 공식 개통 (isLoading 잠복 버그·state 재마운트 경합·QR 경로 확정) |
| v12.8 | 2026-07-08 | Pi Sign-In(OAuth) 구현 + 대형 콤보 키인 검색 + 콤보 정렬 재배치(sql/168) |
| v12.7 | 2026-07-07~08 | 글로벌 i18n 대확장 — 활성 189 locale·66언어 완역·카페 테마명 번역키 전환·UI 테마 12종 (sql/165~167) |
| v12.6 | 2026-07-03 | 운영 텔레그램 webhook 자가치유 + 딥링크 세션 오리진 교정 + 관리자 퀵메뉴 겹침 근본수정 |
