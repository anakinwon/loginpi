# Pi Network 기반 풀스택 앱 플랫폼 — 개발 로드맵 (라이트버전)

Pi Browser + 일반 브라우저를 모두 지원하는 Next.js 16 기반 Pi Network 앱 플랫폼

> **버전**: v13.0 (라이트 개편) · **기준일**: 2026-07-08
> **배포 URL**: **staging** https://loginpi.vercel.app (Testnet·🧪) · **운영** https://cafepi.vercel.app (production 브랜치 게이팅·메인넷 PI모드 운영 중)
> **기술 스택**: Next.js 16 App Router · React 19 · TypeScript 6 · Tailwind CSS v4 · NextAuth v5 · Supabase PostgreSQL
>
> ⭐ **본 문서는 라이트버전이다.** Phase 0~27 TASK 단위 구현 상세·마일스톤 M0~M31·과거 변경 이력 전문은
> **`docs/archive/ROADMAP_FULL_v12.10_2026-07-08.md`** 로 이관했다. 기능별 정본은 각 하위 PRD(`docs/README.md` 인덱스),
> 전체 기능 요약은 `docs/PRD.md`(라이트), 사고·리스크는 `docs/TROUBLESHOOT.md` 참조.

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
| 15 | LBS 위치기반서비스 P0+P1 | ✅ 100% | 지도 UI 확장 예정 (PRD_10) |
| 16 | 이벤트 미션 시스템 (Pi 요원 육성) | ✅ 운영 중 | 보상=1π 보증금 적립·관리자 수동 지급 (PRD_11) |
| 17 | BEAN 토큰 발행 (Pi Launchpad) | 📝 기획·문서 전용 | 앱 코드 0 유지. T01 KYC·T02 신청·T05 법무 외부 회신 대기 (PRD_12) |
| 18 | 판매자 주문 알림 (Telegram 3계층 Outbox) | ✅ 100% | PRD_13 |
| 19 | Bean Token 경제 관리 | 🔶 P0 완료 | 잔여: bean_fee_plan 하드코딩 DB 이전(보류) (PRD_16) |
| 20 | 화면 성능 최적화 (6탭 전수 진단) | 🚧 Phase 1 적용 | 잔여 CRITICAL: CAFE WebSocket 폴백·SHOP window.Pi 가드·MAP 클러스터링 (PRD_18) |
| 21 | 보안 강화 (KISA 21 + DDoS 5계층) | 🔶 코드 완료 | 잔여: Vercel Firewall/BotID 수동 설정·Supabase timeout·세션 블랙리스트 (PRD_2) |
| 22 | 데이터 분석 4탭 통합 페이지 | 📝 기획 완료 | `/admin/analytics` 구현 대기. sql/122~125 제안 (PRD_21) |
| 23 | 실시간 시스템 모니터링 | 🚧 착수 | `/admin/monitor` 24메트릭·Pi 결제 성공률 최우선. 미결정: 저장·보존·갱신주기 (PRD_22) |
| 24 | 메인넷 전환 & 2단계 배포 인프라 | 🔶 컷오버 완료 | 운영DB 컷오버·PI모드·sandbox=false 확정·결제 전 흐름 실기기 검증 완료. **잔여: 메인넷 등재**(Dev Portal·도메인검증·등재 신청) (MAINNET_READINESS_CHECKLIST) |
| 25 | 이중 요금제(BEAN/PI) 런타임 스위칭 | ✅ 운영 PI모드 | 잔여: 보상 A2U(이벤트미션·캠페인) 미전환 (PRD_24) |
| 26 | 오픈기념 무료요금 OneKey | ✅ 활성 | 운영 종료시각 **실측 2026-12-31 23:59 KST**(2026-07-09 확인·staging은 6/30 종료). 종료 게이트 검증 완료(R-02). 잔여: 기간연장·PyShop·노출 품목 추가 (PRD_26) |
| 27 | P2P 채팅 텔레그램 릴레이 + 직거래 문의방 | ✅ 운영 배포 | 잔여: 통합알림(TXN_ST/FBCK) 트리거 (PRD_13 §18) |
| 28 | 글로벌 i18n 대확장 (189 locale·66언어 완역) + Pi Sign-In(OAuth) 일반 브라우저 Pi 로그인 | ✅ 완료 (2026-07-07~08) | 3종 여정(PC QR·모바일 딥링크·Pi Browser SDK) 실기기 검증 완결 (PRD_3 v2.0·TROUBLESHOOT 2026-07-08) |
| 횡단 1~8차 | 성능 튜닝·Pi Browser 안정화·검색 trgm 표준화·DA 거버넌스 점검·홈 정비 등 | ✅ 완료 | 상세: 아카이브 원문 |

### 요약 통계
- **완료**: Phase 0~16, 18, 25~28 + 횡단 1~8차 + GTM 문서화
- **진행 중**: Phase 20(성능)·21(보안)·23(모니터링)·**24(메인넷 등재 — 최우선 잔여)**
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
| v13.0 | 2026-07-08 | **라이트버전 개편** — Phase별 TASK 상세·마일스톤 M0~M31·과거 이력을 아카이브 이관, 진행률 1줄 표 체계 전환, 인코딩 깨짐 교정, Phase 28(i18n 대확장+Pi Sign-In) 행 추가 |
| v12.10 | 2026-07-08 | 헤더 세션 표시 소유권 정리(Pi Sign-In↔Google 버튼) + 모바일 딥링크 경로 실기기 검증 — Pi Sign-In 3종 여정 최종 완결 |
| v12.9 | 2026-07-08 | Pi Sign-In 실사용 검증 완료·일반 브라우저 Pi 로그인 공식 개통 (isLoading 잠복 버그·state 재마운트 경합·QR 경로 확정) |
| v12.8 | 2026-07-08 | Pi Sign-In(OAuth) 구현 + 대형 콤보 키인 검색 + 콤보 정렬 재배치(sql/168) |
| v12.7 | 2026-07-07~08 | 글로벌 i18n 대확장 — 활성 189 locale·66언어 완역·카페 테마명 번역키 전환·UI 테마 12종 (sql/165~167) |
| v12.6 | 2026-07-03 | 운영 텔레그램 webhook 자가치유 + 딥링크 세션 오리진 교정 + 관리자 퀵메뉴 겹침 근본수정 |
