# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v12.7
> **작성일**: 2026-06-05
> **최종 업데이트**: 2026-07-01
> **작성자**: anakin
> **배포 URL**: **staging** https://loginpi.vercel.app(Testnet) · **운영** https://cafepi.vercel.app(Mainnet 전환 중·production 브랜치)
> **배포 전략**: `docs/DEPLOY_STRATEGY.md`·`docs/DEPLOY_NOTICE.md` — 2단계 배포(staging→운영) 분리, `production` 브랜치 게이팅, 3-tier DB 라우터(`src/lib/db-env.ts`). 메인넷 전환: `docs/MAINNET_READINESS_CHECKLIST.md`·`docs/PROD_DB_SETUP.md` (ROADMAP Phase 24)
> **저장소**: https://github.com/anakinwon/loginpi
> **카페 상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6)
> **GTM 문서**: `docs/제품설명서_202060615.pptx` (단기 4목표 13장 슬라이드) · `docs/공개_라이선스_정책.md` (오픈코어 3계층)
> **운영 리스크**: `docs/TROUBLESHOOT.md` (A. 성능 리스크 레지스터 7종 + B. 운영 이슈 기록)
> **판매자 주문 알림**: `docs/PRD_13_MSG.md` (v1.1) — Telegram+Realtime+Pull 3계층 Outbox, 결제완료 즉시 발송 (✅ Phase 1 구현 완료 2026-06-18, ROADMAP Phase 18)
> **사용자 매뉴얼(쉬움)**: `docs/Cafe.pi_쉬운_사용자매뉴얼.pptx` — 컴맹 기준 7장(로그인·Bean·구독·PiCafÃ©â¢ 동시통역·중고장터·PyShopâ¢ O2O·차별점)
> **구독 요금제**: `docs/PRD_14_SUBSC.md` (v1.0) — PiCafÃ©â¢(Explorer·Creator·Host) + PyShopâ¢(PyShopâ¢ Seller 신설안) 월간/연간, Bean 환산(1 Pi=100 Bean), 원화는 비공개 설계참고. ⚠️ 시드·plan_tp_cd 결정 후 적용
> **종합 요금 표준**: `docs/PRD_15_FEE.md` (v0.1) — ⭐Bean 경제 표준 요금 마스터(`bean_fee_plan`), 카페·스토어·자동번역 구독+일반요금 43행. 모든 SPEND/REWARD 금액 출처. ⚠️ xlsx 교정 후 시드 확정
> **Bean Token 경제 관리**: `docs/PRD_16_TOKEN_MNG.md` (v1.2) — ☕빈토큰지갑(`bean_token_wallet`) 핵심 개념 확정 + 어드민 경제 관리 시스템. wallet_type PLATFORM(발행)/USER(보유) 이중구조. 소각 없음, 1Pi=100Bean 고정불변. Phase 19 구현 목표.
> **토큰 발행 (기획)**: `docs/PRD_12_TOKEN.md` (v1.8) · `_백서.md` · `_법무자문의뢰서.md` — BEAN 생태계 토큰, Pi Launchpad. ⚠️ 발행 전 **앱 코드 미포함**(레드라인 #2 유지) — 단 문서는 git 커밋(파일럿 인큐베이팅, 2026-06-17 정책)
> **보안 요구사항**: `docs/PRD_2_SECURITY.md` (v2.0) — KISA 23개 항목 전체 분석 + cafe.pi 특수환경(Pi Browser 이중인증·Supabase RLS 비활성) 반영 (✅ 18개 양호 · 🔍 3개 추가확인 · ➖ 2개 해당없음) · `docs/보안취약점점검결과표.pptx` (공식 점검결과표, 11슬라이드)
> **DDoS 방어 정책**: `docs/SECURITY_DDOS_POLICY.md` — 5계층 방어 아키텍처·Rate Limiting 정책·Pi Browser NAT 특수 대응·공격 감지 절차

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제, Google 소셜 로그인, 계정 연동, 관리자 시스템, 게시판, 다국어, **테마 기반 카페 플랫폼 PyCafé**, 그리고 **Pi Coin 전용 P2P·O2O 마켓플레이스 PyShopâ¢(MPS)**를 구현한다.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16 App Router |
| 배포 | Vercel (loginpi.vercel.app) |
| 인증 1 | Pi Network (Pi SDK 2.0) |
| 인증 2 | Google OAuth (NextAuth.js v5) |
| DB | Supabase PostgreSQL |
| 실시간 | Supabase Realtime (카페 broadcast + 번역 완료 알림 — Phase 7~12) |
| 결제 | Pi Coin (U2A) |
| 다국어 | next-intl v4 (18개 언어 + AI 자동번역) |
| 카페 | PyCafé — 테마 기반 Pi Network 커뮤니티 카페 + PyTranslateâ¢™ 글로벌 동시통역 (Phase 7~12) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 1.3. 🎯 핵심 하이라이트 (30초 요약)

> **투자자·파트너·개발팀이 빠르게 파악하기 위한 핵심 차별점**

### 기술 차별화
- **Pi Browser 쿠키 미저장 문제 완벽 해결**: X-Pi-Token 이중 경로 자동 처리 → Pi Browser 무한 루프 방지
- **글로벌 203개 locale 자동 배포**: 통화·국가 자동 매핑, 동시 지원
- **실시간 글로벌 동시통역** (PyTranslateâ¢™): Gemini Flash + Claude Haiku 하이브리드, 채팅 번역 지연 < 1초
- **통합 텍스트 검색 (pg_trgm GIN + 입력 즉시 검색)**: 카페·상품·게시판 3대 검색을 단일 trigram GIN 색인 + 입력 즉시(debounce) UX로 표준화 — `%검색어%` 부분일치를 풀스캔 없이, PostgREST `.ilike` 자동 색인으로 **애플리케이션 코드 변경 0**으로 가속하고, 세 검색이 동일한 검색 경험으로 수렴 (`sql/072` 카페 · `sql/076` 상품·게시판 · 게시판 전체 통합검색)

### 기능 차별화
- **P2P 직거래 에스크로**: Pi Coin 자동 정산, 분쟁 조정 (PyShopâ¢ MPS)
- **N:N 음성채널** (PyVoice™): WebRTC Full Mesh, 1~4명, 방장 제어, TURN 지원
- **위치기반 커머스** (LBS): 거리 기반 직거래 성사율 극대화
- **데이터 표준 시스템**: 표준단어·도메인·용어·DDL 자동 감사 → 기업 수준 거버넌스

### 사업 차별화
- **스타터킷 제품화 (AI인큐베이터)**: 자문·구축·운영 컨설팅 패키지 (베이직~인피니티)
- **Pi Network 생태계 네이티브**: Pi 결제·구독 시스템 공식 구현 (PiRC2 Soroban 스마트 컨트랙트)
- **실증된 아키텍처**: Phase 0~15 단계적 구현, 검증된 패턴 재사용

---

## 1.5. ⭐ 핵심 가치 (최우선 원칙)

이 플랫폼의 모든 기능은 다음 두 가치 위에 존재한다. 둘 중 하나라도 막히면 프로젝트는 무가치하다.

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

> **Pi Browser 제약**: WebView가 모든 방식의 `Set-Cookie`를 저장하지 않으므로, 인증은
> 쿠키 + `X-Pi-Token` 헤더(localStorage) **이중 경로**로 구현한다. 인증이 필요한 페이지는
> redirect 보호 대신 **클라이언트 게이트**를 쓴다(쿠키 미저장 시 무한 루프 방지).
> 모든 인증·페이지 변경은 **Pi Browser 실기기 검증**을 완료 조건으로 한다.
> (구현 상세: CLAUDE.md "인증 + 세션 구조", ROADMAP TASK-055)

---

## 2. 기술 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 App Router + React 19 + TypeScript 6 strict |
| 스타일 | Tailwind CSS v4 (CSS-first) + shadcn/ui base-nova (`@base-ui/react`) |
| 인증 | Pi SDK 2.0 + NextAuth.js v5 (Google OAuth) |
| DB | Supabase PostgreSQL (RLS 비활성화, 서버 전용 service_role 사용) |
| 실시간 | Supabase Realtime (broadcast + presence) — Phase 7~12 |
| 암호화 | E2E 암호화 (1:1·비밀 카페) — Phase 7~9 |
| AI | **Gemini 2.0 Flash** (번역·언어감지) + **Anthropic Claude Haiku** (AI 봇·번역 fallback) — 하이브리드 |
| 다국어 | next-intl v4 + Gemini 2.5 Flash AI 번역 |
| 배포 | Vercel + pnpm 11 |
| 환경변수 검증 | t3-env + Zod (빌드 시점 실패) |

---

## 3. 전체 기능 현황

| # | 기능 | 상태 | Phase |
|---|---|---|---|
| 1 | 스타터킷 현행화 (Next.js 16 + Tailwind v4 + shadcn/ui base-nova) | ✅ 완료 | Phase 0 |
| 2 | Pi 계정 로그인 + HMAC 세션 | ✅ 완료 | Phase 1 |
| 3 | Pi Coin 결제 (U2A 3단계) | ✅ 완료 | Phase 1 |
| 4 | Google 계정 로그인 (NextAuth.js) | ✅ 완료 | Phase 2 |
| 5 | Pi + Google 계정 연동 (6자리 OTP) | ✅ 완료 | Phase 2 |
| 6 | 관리자 시스템 (대시보드·사용자·결제·연동현황) | ✅ 완료 | Phase 3 |
| 7 | 통합 게시판 (4종 + 댓글·첨부·채택) | ✅ 완료 | Phase 4 |
| 8 | 데이터 표준 시스템 (표준단어·도메인·용어·DDL·감사) | ✅ 완료 | Phase 5 |
| 9 | 다국어 처리 (next-intl v4 + Gemini AI 번역) | ✅ 완료 | Phase 6 |
| 10 | PyCafé MVP — 1:1·그룹 카페 + 테마 선택 + Pi 결제 | ✅ 완료 | Phase 7 |
| 11 | 사용자 프로필 — 마이페이지 (개인정보·결제내역·구독현황) | ✅ 완료 | Phase 10 |
| 12 | 어드민 통계 대시보드 — DAU/WAU/MAU·테마별 매출 (react-plotly.js) | ✅ 완료 | Phase 11 |
| 13 | PyCafé 수익화 — Pi Bean(구 Tip)·스티커·AI 봇·이벤트방 | ✅ 완료 | Phase 8 |
| 14 | PyCafé 생태계 — 마켓플레이스·Pi Bet·Webhook·분석 대시보드 | ✅ 완료 | Phase 9 |
| 15 | PyTranslateâ¢™ — 글로벌 동시통역 (Gemini Flash + Claude Haiku 하이브리드) | ✅ 완료 | Phase 12 |
| 16 | PyShopâ¢(MPS) — Pi Coin P2P 직거래 마켓플레이스 (에스크로·재고·매장 관리·카테고리·거래내역) | ✅ Phase 1 MVP + Phase 2 확장 완료 (Phase 3 PiRC3·Maps 예정) | Phase 13 |
| 17 | PyVoice™ — WebRTC N:N 음성채널 (1~4명 Full Mesh·방장 마이크 제어·TURN) | ✅ 완료 (v2.0) | Phase 14 |
| 18 | LBS 위치기반서비스 — 동의 기반 위치 수집·주변 탐색·MPS 거리 표시 (직거래 성사율 향상) | ✅ 완료 (P0+P1) | Phase 15 |
| 19 | 화면 성능 튜닝 — 무한 스크롤(Cafe·Shop)·대시보드 지연 로딩(IntersectionObserver) + SWR 캐싱·병렬 호출 | ✅ 완료 | 횡단 개선 |
| 20 | Pi Browser 안정화·콤보 성능 — admin 다국어 전환 무반응 수정(`_pit` 티켓 선발급) + 헤더 다국어 콤보 3계층 캐시(서버 revalidate·sessionStorage·idle 프리페치) | ✅ 완료 | 횡단 3차 (2026-06-13) |
| 21 | 이벤트 미션 시스템 (Pi 요원 육성) — 10미션 게이미피케이션·자동감지·화이트리스트·sum 랭킹·선착순 10명 카카오 선물 + **평가 정밀화**(M2 상태형 양방향 멱등·평가엔진 select후분기 복구·SEQUENCE del_yn 필터·CHAR→VARCHAR·CRON_SECRET 필수·관리자 재평가 버튼) + **보상 전환**(10미션 완주 실 보상 = 1π 판매보증금 적립, A2U 폐기·관리자 수동 지급 버튼·원자적 RPC `fn_evt_grant_bond_reward` 이중지급 차단·M3 유료테마 게이트) | ✅ 구현 완료·운영 중 (참여 7·완주 1) | Phase 16 |
| 22 | PyShopâ¢(MPS) 후속 개선 — A2U 자동 환불(MPS_CANCEL_REFUND)·취소수수료 FR-10 ADMIN 게이트 버그 교정·상품 이미지 업로드(3장·1MB·썸네일)·상품 등록 시 위치 자동수집·주문관리 취소 버튼 역할 구분 | ✅ 완료 | Phase 13 후속 (2026-06-14) |
| 23 | 어드민 대시보드 고도화 — coin360 스타일 테마별 매출 트리맵·사용자 관리 통합·KST 집계 교정·매출 차트 색상 통일·결제내역 거래구분 통합+취소내역 포함 | ✅ 완료 | Phase 11 후속 (2026-06-14) |
| 24 | Pi Browser 안정화 4차 — CafePi 헤더 로고 교체·Pi Bet UI 아코디언+스포트라이트·다국어 선택기 기억·PyShopâ¢ 브랜드 통일·admin 게이트 open redirect 방어 | ✅ 완료 | 횡단 4차 (2026-06-14) |
| 25 | i18n 자동번역 백그라운드화 — 전체 자동번역을 서버 `after()` 백그라운드 작업으로 전환(요청 타임아웃 회피)·번역률 pct 반올림 버그 수정(미완료 완료 오표기 해소)·언어 콤보 캐시 키 v1→v2 무효화(신규 활성 locale 미표시 해소)·validate-locales ko 기준 초과 키 차단 | ✅ 완료 | 횡단 5차 (2026-06-15) |
| 26 | GTM 문서화 — 제품소개서(단기 4목표 13장: PyChat·PyShopâ¢·StarterKit·외주연계) + 공개·라이선스 정책(오픈코어 3계층: 미끼/상품/금고, 왕관보석 직영 비매 원칙) + 성능 리스크 레지스터(7종 병목 proactive 분석: 채팅·LBS·에스크로 등) + 운영 이슈 기록(Vercel Hobby cron 제약·GitHub Webhook 누락 대응) | ✅ 완료 | 문서화 (2026-06-16) |
| 27 | **PyShopâ¢ O2O 오프라인 매장 커머스** (§15.8) — 구글 카페 반자동 인증등록(half-인증: place_id 전체타이핑·전화 구글대조·GPS 100m·필수입력)·구글 Place 전체정보 보관(JSONB)·오프라인 주문 상태머신(주문중→준비중→상품대기중→10분 자동 판매완료)·주문방법 3종(매장/픽업/배달)·취소수수료(구매 0.9/판매 1.1, 역할 명시)·사장님 보이스 주문알림(차임+TTS×3)·지도 상품 썸네일 판매·카페 카테고리·상품 shop_id IDOR 차단 | ✅ 완료 | Phase 13 Phase 3 (2026-06-16) |
| 28 | **BEAN 토큰 발행 (Pi Launchpad)** — Cafe.pi 생태계 유틸리티 토큰 10억 개 발행 기획. 토큰명 BEAN(기존 Pi Bean 팁 온체인화)·세일가 0.01 Pi(`1 Pi=100 BEAN`)·분배 40/25/15/12/8·발행주체 개인·유동성 Pi 페어 단독(레드라인 #2). T05 증권성 법무 자문/T01 개인 KYC/T02 Launchpad 신청 = 외부 회신 대기. ⚠️ **발행 전 앱 코드 미포함(문서 전용)** | 📝 기획·문서 (PRD_12 v1.7) | Phase 17 (2026-06-17) |
| 29 | **PyShopâ¢ 카트 다건 일괄 판매 + 자국통화** (PRD_8 v2.1 FR-14·15) — ① **등록 페이지 분리**: 중고직거래(`/store/my/items/new`)·오프라인매장(`/store/my/shop-items/new`), `StoreItemForm` mode 분기. ② **자국통화 등록·표시**: 판매자 자국통화 입력→등록시점 1회 환산으로 `price_pi` 확정, 목록·상세에 `≈자국통화` 고정 참고가(실시간 틱커 아님·레드라인 #2 준수), `mps_item/order/txn_hist` ccy 스냅샷(sql/062). ③ **오프라인매장 카트**: `useCart` 전역 스토어(매장 단위)·수량 담기·담기 팝업(카트가기/쇼핑계속)·장바구니 화면(라인 소계)→**다중상품 단일 Pi 결제**(`mps_order_item`+원자 RPC `fn_mps_cart_order_create`/`_cancel`, sql/063, 결제완료는 MPS_ESCROW by order_id 재사용·라인전체 롤백). ④ **주문관리 고도화**: 라인(상품명×수량) 표시·판매자 주문자 호명·구매자 픽업 매장명·판매(앰버)/구매(에메랄드) 색상 | ✅ 완료 (sql 062·063 DB적용·실기기 결제 검증 잔여) | Phase 13 후속 (2026-06-17) |
| 30 | **화면 성능 최적화 — 6개 탭 전수 진단** (`docs/PRD_18_PERFORM.md` 수용) — home·event·cafe·shop·map·admin 6탭 진단으로 CRITICAL 4·HIGH 15·MEDIUM 18 식별, 공통 병목 도출(메모이제이션·캐싱·N+1 쿼리·중복 API·이미지 최적화). **Phase 1 즉시개선 적용**: HOME 매출 `LazySection` rootMargin 200→50px(bean-revenue RPC 조기호출 -20~40%)+aggregate 실패 로깅 / EVENT 미션 재평가 중복클릭 가드+실패 피드백(미션 평가=신뢰 직결) / SHOP `ItemCard` memo화(필터·정렬 리렌더 -30%). 목표 LCP<2.5s·INP<200ms·번들<500KB | 🚧 진단 완료·Phase 1 착수 | Phase 20 (2026-06-23) |
| 31 | **보안 강화 — KISA 21개 웹 취약점 + DDoS 5계층 방어** (`docs/PRD_2_SECURITY.md` · `docs/SECURITY_DDOS_POLICY.md` 수용) — KISA 21개 항목 전체 분석(✅13·🔍6·➖2) + 5계층 방어(Vercel Anycast→WAF→Middleware→API Guard→Supabase). 구현: `src/lib/ddos-guard.ts`(rate limiting 엔진·봇 UA 차단·보안 헤더) + `src/lib/api-guard.ts`(`withGuard`/`withAuthGuard`) + middleware 통합 + `vercel.json` 보안 헤더. 잔여: Vercel Firewall/BotID 수동 설정·Supabase 타임아웃·세션 블랙리스트 | 🔶 코드 구현 완료·Vercel 설정 잔여 | Phase 21 (2026-06-23) |
| 32 | **PyShop™ 상품 카테고리 표준** (`docs/PRD_CATEGORY.md` 수용) — 샘플성 6대분류(중고편중·식품/뷰티/유아/헬스 등 14도메인 누락) 폐기, 국내 E커머스 표준 **17대분류 3단계(대>중>소)** 체계 정립. 기존 `mps_ctgr` 재귀(parent_ctgr_id) 활용 — **스키마 변경 0**. 제거+시드 SQL(`sql/105`, 임시테이블로 기존만 안전 폐기·기존 상품 미분류 재지정·물리 DELETE 금지). 소분류는 운영 CRUD 확장 | 📝 설계 완료·SQL 적용 대기 | 카테고리 표준 (2026-06-23) |
| 33 | **데이터 분석 & 시각화 — 4-탭 통합 분석 페이지** (`docs/PRD_21_DATA_ANAL.md` v1.1 수용) — 기존 통계 인프라(`stat_*_dly`·`fn_build_daily_stats`·Plotly 차트 6종·stats API 7종) 확장. 6개 분석 도메인을 4탭(**매출·주문·접속/사용·퍼포먼스**)으로 재편한 `/admin/analytics` 허브 설계. 북극성(활성 사용자) 최우선 배너·Pi/Bean 2층위 매출 분리·4-Zone 공통 레이아웃·Plotly 표준. 신규 집계 제안 sql/122~125(코호트·RFM 즉시 / 세션·퍼널 추적 선결). ⚠️ 매장주 후기 동의(`mps_shop.fbck_consent_yn`, sql/117)·후기 평가항목 전체 시드(sql/118) 포함 | 📝 기획 완료·구현 대기 | Phase 22 (2026-06-25) |
| 35 | **메인넷 전환 & 2단계 배포 인프라 + 인증 안정화** (ROADMAP Phase 24) — ① **Pi Browser 인증 복구**(2026-06-26): UA 사전차단 사고(8bf8752) 복구·`if(!window.Pi)`만 유지·CLAUDE.md 핵심 규칙 명문화. Google 로그인 UI 세션 버그 수정(GET /api/auth/pi getSessionUser 폴백). ② **Py 개명**(2026-06-27): PyCafé™/PyShop™/PyTranslate™ 표시 전환(Pi 접두 상표 회피). 관리자 첫 화면 /admin/monitor 변경·메인넷 체크리스트 화면(/admin/checklist) 신설. ③ **2단계 배포 분리**: staging(loginpi/master/Testnet🧪)·운영(cafepi/production 브랜치 게이팅) + scripts/promote-to-prod.mjs. ④ **3-tier DB 라우터**(`src/lib/db-env.ts`). ⑤ **운영DB 컷오버** (ajdwlcqoljkjamostutc·96테이블·59,280행·pg_dump·센티넬 검증 완료 2026-06-28~29). ⑥ **읽기전용 스위치+쓰기 가드**: SUPABASE_READONLY_MODE·JWT 전용 스크립트. ⑦ **배포 컨트롤 2단**: Stage/운영 버튼+Staging DB 스위치+진행상태 폴링. ⑧ **DB 정리**: 외부 테이블 12종+i18n 레거시 2종 DROP(sql/134). 잔여(메인넷 등재): Dev Portal·API Key·Pi 지갑·도메인·P0 실기기·U2A·등재 신청 | 🔶 운영DB 컷오버 완료·배포 파이프라인 완성·메인넷 등재 잔여 | Phase 24 (2026-06-25~29) |
| 34 | **실시간 시스템 모니터링 — 관리자 헬스 대시보드** (`docs/PRD_22_MONITOR.md` v1.0 수용) — 6대 영역(시스템 헬스·DB 부하·트래픽/보안·비즈니스 실시간·기능별·알림) 24메트릭을 `/admin/monitor`에 실시간 시각화. ⭐**Pi 결제 성공률**을 독립 최우선 메트릭으로 격상(신호등 ≥99%🟢/95~99%🟡/<95%🔴 + 미완료 5분 자동복구). Vercel Fluid Compute의 OS레벨 측정 한계를 인정하고 **Vercel Analytics + Supabase 메트릭 + 앱 자체 계측** 조합으로 대체("실시간"=분 단위 재정의). SSE 갱신, 관리자 전용(클라이언트 게이트). 신규 `metric_*` 4테이블 + RPC 4종(DA 표준). MVP(기존 데이터 기반·인프라 0)→고도화→자동화 3단계 | 🚧 기획 완료·구현 착수 | Phase 23 (2026-06-25) |
| 36 | **이중 요금제(BEAN/PI) 런타임 스위칭** (`docs/PRD_24_FEES_STRATAGE.md`) — 메인넷 A-5 대응 `fee_mode_config(BEAN/PI)` 런타임 전환(`/admin/fee-mode`·캐시 60s→원자 전환). **PI 모드=진짜 Pi 직결제**(window.Pi→pi_pymnt). 카페생성·이벤트방·스티커팩·카페선물(P2P)·구독을 Bean 차감→Pi 직결제로 전환(sql/140~148)·마이크로요금(입장·번역·AI·배지·부스팅) PI 무료화·후기보상 매장주 보증금 선행 게이트+PI 후기 실 A2U 송금(sql/144 멱등·cron)·대시보드/통합분석 매출 Pi 통계(sql/147 `_pi` 컬럼)·클라 요금표시 PI 반영. 잔여: 보상 A2U(이벤트미션·캠페인) 미전환 | ✅ 구현 완료·운영 fee_mode=PI 전환(2026-06-30·메인넷 PI모드 운영 중) | Phase 25 (2026-06-29~30) |
| 37 | **오픈기념 무료요금 OneKey** (`docs/PRD_26_OPEN_PROMO_FEE.md`) — `promo_fee_config.promo_active_yn` 단일 스위치로 9개 요금(카페생성·입장·번역·부스팅·배지·AI초과·기간연장·PyShop·노출) 전부 0 오버라이드(정상요금 `bean_fee_plan` 보존)·`promo_end_dtm` 도달 시 `fn_is_open_promo_active()` FALSE 자동 종료. `applyPromoGate` 7개 청구경로 통합(번역 포함)·`/api/admin/open-promo`·그랜드오픈 Welcome 배너(KST·D-day)·번역 일일 무료한도(비구독자 10건). 잔여: 미구현 품목(기간연장·PyShop·노출) 추가 | ✅ 구현 완료·운영+staging 활성 (2026-06-30~07-31 KST 자동 복귀) | Phase 26 (2026-06-30) |
| 38 | **P2P 채팅 텔레그램 알림·봇 릴레이** (`docs/PRD_13_MSG.md` §18) — 당근마켓 앱 푸시를 Pi Browser(WebView·푸시 부재)에서 텔레그램으로 대체. **하이브리드**: 앱 내 DM(`msg_room` D)=채팅 본체 + 텔레그램=오프라인 미러 푸시·인용답장 릴레이. 기존 3계층(Realtime→Telegram→Pull) 재사용·`msg_noti_outbox.noti_tp_cd`(ORDER/CHAT/TXN_ST/FBCK) 통합·`msg_tlgm_out` 인용답장 매핑·`sys_user.cur_relay_room_id`·45초 지연+미읽음 게이트(sql/152). **"판매자에게 문의" 진입 UI**(상품상세·주문관리 양방향, 기존 `/api/chat/rooms` 재사용)·번역 21 locale. 잔여: 통합알림(TXN_ST/FBCK) 트리거 | ✅ 구현 완료·운영 배포 | Phase 27 (2026-07-01) |
| 39 | **직거래 문의방 (Direct방 규격)** — P2P 상품 문의 채팅방 정밀 정의. ① 당사자 2명만 노출(비공개·내 카페 멤버 전용) ② 이름 '직거래 문의' ③ 전용 테마 🤝 DIRECT(`theme_tp_cd`에 별도 3분류·`use_yn='N'` 시스템전용, sql/158~159) ④ 12시간 자동 만료(`expr_dtm`+`listMyRooms` 필터)+수동 만기(🗑️ `expire` API) ⑤ **상품별 분리**(`msg_room.item_id` — 같은 판매자 다른 상품=별도 방·`room_desc`=상품명, sql/160) ⑥ **"내 카페" 최상단 정렬**(직거래>구독>일반) ⑦ **선물(Bean/Pi) 금지**(거래 당사자 간 금전 선물 3계층 차단: `/api/tips` 403·`canTip`·complete PI_TIP 변조방어) | ✅ 구현 완료·운영 배포 | Phase 27 (2026-07-01) |
| 40 | **관리자 빠른 메뉴(quick-menu)** — 관리자 하단 플로팅 팝업(AdminQuickMenu)에 `admin-nav-catalog` 항목 선별 노출(`sys_quick_menu` sql/157·`/admin/quick-menu` 관리) | ✅ 구현 완료·운영 배포 | 관리 편의 (2026-07-01) |

---

## 4. Phase 0 — 스타터킷 현행화 ✅

- Next.js 16 App Router + React 19 + TypeScript 6 strict
- Tailwind CSS v4 (`tailwind.config` 없음, `globals.css` CSS-first)
- shadcn/ui base-nova (`@base-ui/react`, `asChild` prop 없음)
- next-themes 다크모드 (`@custom-variant dark (&:where(.dark, .dark *))`)
- t3-env 빌드 시점 환경변수 검증
- pnpm 11 + `pnpm-workspace.yaml allowBuilds`

---

## 5. Phase 1 — Pi 인증 + Pi 결제 ✅

### Pi 계정 로그인
- `Pi.authenticate()` 성공 여부로 Pi Browser 감지 (UA 패턴은 신뢰도 낮음)
- HMAC-SHA256 서명 세션 쿠키 (`httpOnly`, `sameSite: strict`)
- `pi_session` 쿠키 검증 + `X-Pi-Token` 헤더 fallback

### Pi Coin 결제 (U2A)
```
createPayment() → onReadyForServerApproval → POST /api/payments/approve
               → [Pi 지갑 사용자 확인]
               → onReadyForServerCompletion → POST /api/payments/complete
```
- `/complete` 미구현 시 해당 사용자의 모든 미래 결제 영구 차단 (치명적 트랩)
- `onIncompletePayment` 핸들러로 미완료 결제 자동 복구 필수

---

## 6. Phase 2 — Google 로그인 + 계정 연동 ✅

### Google 로그인
- NextAuth.js v5 + Google OAuth Provider + Supabase 어댑터

### Pi·Google 계정 연동 (6자리 OTP 방식)
Pi Browser WebView는 `target='_blank'`가 WebView 내에서 열림 → 외부 브라우저 강제 불가
→ **URL 클립보드 복사**로 일반 브라우저에 코드 전달

```
Pi Browser → "코드 생성" (6자리, 10분 유효) → "연동 URL 복사"
일반 브라우저 → Google 로그인 → 코드 입력 → 계정 연동 완료
```

---

## 7. Phase 3 — 관리자 기능 ✅

**RBAC**: `ADMIN` / `MASTER` / `MANAGER` / `USER`

| 관리자 페이지 | URL | 기능 |
|---|---|---|
| 대시보드 | `/admin` | 사용자 통계 4종 |
| 사용자 관리 | `/admin/users` | 목록 + 역할 변경 |
| 결제 내역 | `/admin/payments` | 상태 필터 5종 + π 합계 |
| 계정 연동 현황 | `/admin/links` | 연동/Pi전용/Google전용 분류 |
| 게시판 관리 | `/admin/board` | 핀 토글 + 강제 삭제 |

---

## 8. Phase 4 — 통합 게시판 ✅

| 카테고리 | 코드 | 최소 작성 역할 |
|---|---|---|
| 공지 | NOTICE | MASTER |
| 자료실 | ARCHIVE | MANAGER |
| 자유 | FREE | USER |
| 질문 | QNA | USER |

- 게시글 CRUD (논리삭제 `del_yn`)
- 댓글, 채택 (QNA), 첨부파일 (20MB × 5개, Supabase Storage)
- 검색 + 페이지네이션 (PostgREST 인젝션 방지 처리 포함)

---

## 9. Phase 5 — 데이터 표준 시스템 ✅

- 표준단어(`std_dic`) / 표준도메인(`std_dom`) / 표준용어(`std_term`) CRUD
- DDL Export (PostgreSQL / MySQL, 도메인 약어 기반 타입 자동 추론)
- Audit Trail (`std_audit_log`, JSONB old/new 값 저장)
- 승인 워크플로우 (`approval_queue`, MASTER 전용)
- DA 품질 표준화: Migration 003~010, 전 테이블 `regr_id/reg_dtm/modr_id/mod_dtm NOT NULL DEFAULT`

---

## 10. Phase 6 — 다국어 처리 ✅

- **라이브러리**: next-intl v4 (`[locale]` App Router 라우팅)
- **지원 언어**: 18개 (ko/en/zh/ja/hi/vi/af/fil/th/id/ms/es/fr/de/it/ru/pt/ar) + il(이스라엘)/au(호주) 등
- **라우팅**: `as-needed` prefix (기본언어 ko는 `/`, 나머지는 `/en/`, `/zh/` 등)
- **번역 파일**: `messages/{locale}.json` — `ko.json`이 source of truth
- **fallback**: locale → en → ko (키 노출 방지)
- **AI 번역**: Gemini 2.5 Flash, 배치 50건 + 4.5초 rate-limit 대기
- **routing.ts**: 203개 국가 코드 선점 등록 (Admin 활성화 시 재배포 불필요)
- **단일 소스**: `src/lib/locale-currency.ts` / `src/lib/locale-country.ts`로 중복 제거

**핵심 아키텍처**:
- `routing.ts`는 빌드 시점 정적 — Vercel 프로덕션에서는 런타임 수정 불가
- Admin 활성화 시 `addLocaleToRouting()` 로컬 자동 수정 시도 (프로덕션은 무시)
- locale_cd 형식 검증: `/^[a-z]{2,3}(-[A-Z]{2,3})?$/` (보안 인젝션 방지)

---

## 11. Phase 7~9 — PyCafé 테마 기반 카페 플랫폼 ✅

> 상세 명세: `docs/PRD_4_CHAT.md` (v1.6)

### 11.1 제품 개요

**PyCafé** — 테마 기반 Pi Network 카페 플랫폼

내가 좋아하는 테마(여행·골프·먹방...)를 선택하고, 같은 관심사 Pi 사용자들과 카페하면서 Pi를 자연스럽게 주고받는 라이프스타일 커뮤니티.

| # | 핵심 차별점 | 설명 |
|---|---|---|
| 1 | **테마 퍼스트** | 카페 개설 전 테마 선택 → 전용 스티커·AI 봇·배지 자동 세팅 |
| 2 | **Pi 마이크로 트랜잭션** | 카페 중 Pi Tip·스티커·AI 기능 단건 결제 (0.01~5 Pi) |
| 3 | **인라인 구매 UX** | 카페창을 벗어나지 않고 구매 완료 — 흐름 단절 없음 |
| 4 | **KYC 기반 신뢰** | Pi Network 인증 사용자만 참여 — 익명 도배·스팸 방지 |
| 5 | **PyTranslateâ¢™** | 어떤 언어로 카페해도 선택 언어로 실시간 동시통역 — Gemini 2.0 Flash + Claude Haiku 하이브리드 (비용 ~76% 절감) |

---

### 11.2 왜 Pi를 내면서 사용하는가 (사용자 동기)

> Discord·Telegram·카카오톡이 무료인데 왜 Pi를 내는가? — 이 질문에 답하지 못하면 비즈니스가 성립하지 않는다.

| # | 이유 | 핵심 |
|---|---|---|
| 1 | **KYC 신뢰** | 봇·가짜 계정 없는 유일한 공간 — 신뢰 자체가 Pi의 가격 |
| 2 | **Pi 소비 욕구** | Pi 보유자에게 결제는 부담이 아닌 "내 Pi가 작동한다"는 증명 |
| 3 | **품질 필터** | 0.1 Pi 진입 장벽 = 진지한 방장 자동 선별 (무료 방은 99% 방치) |
| 4 | **관심사 일치** | 테마 자기 선택 → 깊은 대화, 지속 참여 |
| 5 | **경제적 보상** | Pi Tip → 좋은 조언·콘텐츠에 즉각 Pi 보상 |
| 6 | **수익 창출** | 강사·전문가에게 Business 5 Pi/월은 수익 대비 투자 |
| 7 | **소유감** | Pi를 낸 방 = "내가 키우고 싶은 커뮤니티" — 장기 운영 동기 |
| 8 | **선점 가치** | 초기 커뮤니티 빌더 이력은 Pi로만 살 수 있는 자산 |

> **결론**: Pi는 비용이 아니라 KYC 신뢰 + 관심사 커뮤니티 + 경제적 보상 + 소유감을 한 번에 구매하는 것이다.

---

### 11.3 Discord 차별화 전략

**전략**: Discord를 이기려는 것이 아니라 **다른 시장을 창조**한다.

```
Discord:    게임·익명 커뮤니티 시장 지배 → 계속 쓰세요
카카오톡:  가족·친구·업무 → 계속 쓰세요
PyCafé:    라이프스타일·실명·Pi 경제 → 새로 추가
```

**Discord가 복제할 수 없는 3중 해자**:

| 해자 | 이유 |
|---|---|
| **KYC 실명 문화** | Discord의 창립 DNA는 익명성 — KYC 추가 시 기존 사용자 대규모 이탈 |
| **Pi 경제 레이어** | 금융당국 심사·Nitro 모델 충돌·Pi Network API 파트너십 장벽 |
| **테마 커뮤니티 그래프** | 테마별 공개방 선점 → 네트워크 효과 형성 후 이동 비용 급증 |

**실행 전술**:
- **창작자 Pi Tip 수수료 0%** (Discord는 30% 징수) → 크리에이터 이전 유도
- **Pi Browser 네이티브 UX** — Discord는 Pi Browser에서 구조적 열세
- **테마 독점 이벤트** — 프로 골퍼 라이브 Q&A, 여행 유튜버 PyCafé 전용 이벤트

---

### 11.4 탈중앙화와 프라이버시

**"인간 검증된 익명성 (Human-Verified Anonymity)"** — 세계 어디에도 없는 포지션

```
Discord:    무검증 익명 → 봇·사기꾼 섞임
카카오톡:  실명 중앙화 → 정부·기업에 데이터 노출
PyCafé:    KYC로 "사람임"만 증명 + Pi UID로 카페 내 완전 익명
```

**탈중앙화 3계층**:

| 계층 | 구현 | 효과 |
|---|---|---|
| **신원** | Pi 지갑 = 계정 (PyCafé 서버 외부) | 플랫폼이 계정 삭제 불가 |
| **결제** | Pi 블록체인 직접 정산 | 중간 수수료 없음, 동결 불가 |
| **메시지** | 1:1·비밀방 E2E 암호화 | 서버조차 내용 읽기 불가 |

**4가지 공개 약속**:
1. 1:1 메시지를 읽지 않는다 (E2E 암호화)
2. Pi 자산을 동결하거나 빼앗지 않는다 (Pi 블록체인)
3. 카페를 이유 없이 삭제하지 않는다 (Pi 지갑 소유권)
4. 대화를 광고·학습 데이터로 사용하지 않는다 (No data monetization)

> **핵심**: Discord·카카오는 광고 수익 모델 = 데이터 수집 필수. PyCafé는 Pi 트랜잭션 수익 모델 = 데이터 판매 불필요. 탈중앙화가 마케팅이 아닌 비즈니스 모델의 구조적 결과다.

---

### 11.5 테마 시스템 (Theme-First Architecture)

테마는 카페 분류 체계이자 **수익화 진입점**이다. 카페 개설 첫 화면이 테마 선택이다.

**테마 카탈로그 (20개+ 초기 제공)**

| 카테고리 | 테마 | 이모지 | 등급 |
|---|---|---|---|
| 액티비티 | 골프 | ⛳ | PREMIUM |
| 액티비티 | 수영 | 🏊 | PREMIUM |
| 액티비티 | PT/피트니스 | 💪 | BASIC |
| 액티비티 | 서핑 | 🏄 | PREMIUM |
| 액티비티 | 요가/명상 | 🧘 | PREMIUM |
| 여행 | 여행 | ✈️ | BASIC |
| 여행 | 항공/마일리지 | 🛫 | PREMIUM |
| 음식 | 먹방 | 🍜 | BASIC |
| 음식 | 요리 | 🍳 | PREMIUM |
| 취미 | 사진/카메라 | 📸 | BASIC |
| 취미 | 독서/스터디 | 📚 | BASIC |
| 취미 | 반려동물 | 🐕 | PREMIUM |
| 라이프 | 뷰티/패션 | 💄 | PREMIUM |
| 라이프 | 재테크/투자 | 💰 | PREMIUM |
| 테크 | 코딩/IT | 💻 | BASIC |
| 테크 | 게임 | 🎮 | PREMIUM |
| 문화 | 음악 | 🎵 | PREMIUM |
| 문화 | 아트/DIY | 🎨 | PREMIUM |
| 라이프 | 환경/제로웨이스트 | 🌱 | PREMIUM |
| 자동차 | 드라이브/차 | 🚗 | PREMIUM |

- **BASIC** (6개): Free 사용자 무료 접근
- **PREMIUM** (14개+): 단건 0.2 Pi 또는 구독으로 잠금해제

**테마 선택 시 자동 세팅**: 기본 스티커팩 3개 + 테마별 AI 봇 프리셋 + 활동 배지 기준

**카페 생성 UX**:
```
Step 1: 테마 선택 (BASIC 자유 / PREMIUM 🔒)
Step 2: 카페 이름 + 설명 (테마 이모지·태그 자동 제안)
Step 3: 공개/비공개 + 정원 설정
Step 4: Pi 결제 (Free: 0.1 Pi / Premium: 월 3개 무료)
```

---

### 11.6 구독 티어

| 기능 | Free "Pi Explorer" | Premium "Pi Creator" | Business "Pi Host" |
|---|---|---|---|
| **요금** | 0 Pi | 1 Pi/월 또는 10 Pi/년 | 5 Pi/월 또는 50 Pi/년 |
| 1:1 카페 | 무제한 | 무제한 | 무제한 |
| 테마 접근 | 기본 6개 | 20개+ 전체 | 20개+ 전체 |
| 그룹방 참여 | 최대 5개 | 무제한 | 무제한 |
| 그룹방 생성 | 0.1 Pi/개 | 3개/월 무료 | 무제한 |
| Pi Tip 전송 | 0.01 Pi 단건 | 가능 | 가능 |
| 스티커 | 기본 3개 | 팩 구매 + 월 1개 무료 | 커스텀 제작 |
| 음성 메시지 | 30초 | 1분 | 5분 |
| AI 카페 비서 | 0.05 Pi/회 | 10회/월 | 무제한 |
| 메시지 보관 | 7일 | 1년 | 영구 |
| 파일 공유 | 불가 | 100 MB/월 | 1 GB/월 |
| 이벤트방 개설 | 불가 | 불가 | 가능 |
| 분석 대시보드 | 불가 | 불가 | 가능 |
| 카페 봇 Webhook | 불가 | 불가 | 가능 |

---

### 11.7 인라인 구매 트리거 8종

카페 흐름을 끊지 않고, 문맥에 맞는 순간에 구매 옵션을 제시한다.

| # | 트리거 | 발동 조건 | 전환 포인트 |
|---|---|---|---|
| 1 | **스티커 하단 업셀** | 스티커 메뉴 열 때 | 기본 3개론 부족하다는 순간 |
| 2 | **Pi Tip 수신 → 보내기** | Free 사용자가 TIP_NOTI의 "보내기" 클릭 | 받은 후 "나도 보내고 싶다"는 상호 보답 심리 |
| 3 | **AI 한도 초과** | Free: 항상 / Premium: 월 10회 초과 | 필요한 순간 즉각 결제 → 이탈 없음 |
| 4 | **메시지 만료 경고** | 7일 내 만료 메시지 존재 시 | "소중한 대화가 사라진다"는 손실 회피 심리 |
| 5 | **정원 초과** | 멤버 수 = max_mbr_cnt | 커뮤니티를 키우고 싶은 방장 |
| 6 | **프리미엄 테마 잠금** | Free 사용자가 PREMIUM 테마 클릭 | 원하는 테마로 방을 만들고 싶은 순간 |
| 7 | **활동 배지 강화** | 테마 배지 자동 수여 시 팝업 | 배지를 자랑하고 싶은 성취감 |
| 8 | **이벤트방 알림** | 팔로우 테마에 이벤트방 개설 | 관심사 이벤트를 놓치고 싶지 않은 FOMO |

---

### 11.8 Pi 결제 메타데이터 (7가지 유형)

기존 3단계 결제 흐름(`/api/payments/approve → complete`) 그대로 사용. `metadata.type`으로 분기.

| type | 결제 목적 | 결제 완료 후처리 |
|---|---|---|
| `CHAT_ROOM_CREATE` | 카페 생성 | `msg_room` + `msg_room_mbr(OWNER)` INSERT |
| `CHAT_SUBSCR` | 구독 결제 | `msg_subscr` UPSERT (expire_dtm 갱신) |
| `THEME_UNLOCK` | 테마 단건 잠금해제 | `msg_usr_theme` INSERT |
| `STICKER_PACK` | 스티커 팩 구매 | `msg_usr_stkr_pack` INSERT |
| `PI_TIP` | Pi Tip 전송 | `msg_tip` INSERT + 수신자 Realtime 알림 + TIP_NOTI 메시지 자동 발송 |
| `EVENT_ROOM_JOIN` | 이벤트방 입장 | `msg_room_mbr(GUEST, expire_dtm)` INSERT |
| `FEATURE_ADDON` | 단건 기능 구매 | feature_cd별 분기 (AI_SUMMARY·MSG_KEEP·MEMBER_EXT·TIP_SINGLE·EXPORT·BADGE_UPGRADE) |

---

### 11.9 DB 스키마 (14개 테이블, `msg_` 접두사)

> 전 테이블 DA 표준 시스템 컬럼 4개 필수:
> `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`,
> `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`

| 테이블 | 설명 | 주요 컬럼 |
|---|---|---|
| `msg_theme` | 테마 마스터 | `theme_cd` PK, `theme_tp_cd` ('BASIC'/'PREMIUM') |
| `msg_theme_stkr` | 테마 기본 스티커 매핑 | `theme_cd` FK, `stkr_pack_id` |
| `msg_room` | 카페 | `room_tp_cd` ('D'/'G'/'E'), `entry_fee_pi`, `is_public_yn` |
| `msg_room_mbr` | 카페 멤버 | `mbr_role_cd` ('OWNER'/'ADMIN'/'MEMBER'/'GUEST'), `lst_read_msg_id` |
| `msg_msg` | 메시지 | `msg_tp_cd` ('TEXT'/'IMAGE'/'FILE'/'VOICE'/'STICKER'/'TIP_NOTI'/'SYSTEM'), `src_lang_cd` (원본 언어 코드 — Phase 12) |
| `msg_msg_reac` | 메시지 이모지 반응 | `msg_id` FK, `emoji_cd`, `usr_id` |
| `msg_attch` | 첨부파일 | `msg_id` FK, `file_url`, `file_sz_byte` |
| `msg_subscr_plan` | 구독 플랜 정의 | `plan_cd` PK, `plan_nm`, `price_pi`, `period_mth` |
| `msg_subscr` | 사용자 구독 현황 | `usr_id` UNIQUE, `expire_dtm`, `auto_renew_yn` |
| `msg_stkr_pack` | 스티커 팩 | `theme_cd` FK, `pack_price_pi` |
| `msg_stkr` | 스티커 개별 | `pack_id` FK, `stkr_img_url` |
| `msg_usr_stkr` | 사용자 보유 스티커 | `usr_id`, `stkr_id` UNIQUE |
| `msg_tip` | Pi Tip 내역 | `snd_usr_id`, `rcvr_usr_id`, `tip_amt_pi`, `pymnt_id` FK |
| `msg_trans` | 번역 캐시 (Phase 12) | `msg_id` FK, `locale_cd`, `trans_cont` — `UNIQUE(msg_id, locale_cd)` |

**Realtime RLS 정책** (카페 멤버만 구독 가능):
```sql
ALTER TABLE msg_msg ENABLE ROW LEVEL SECURITY;
CREATE POLICY "room_member_read" ON msg_msg
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM msg_room_mbr
      WHERE room_id = msg_msg.room_id
        AND usr_id = auth.uid()
        AND del_yn = 'N'
        AND (expire_dtm IS NULL OR expire_dtm > NOW())
    )
  );
```

---

### 11.10 API 설계

```
/api/chat/rooms                             GET(목록+테마필터), POST(생성)
/api/chat/rooms/[roomId]                    GET(상세), PATCH(설정), DELETE
/api/chat/rooms/[roomId]/messages           GET(cursor 페이지네이션), POST(전송)
/api/chat/rooms/[roomId]/members            GET, POST(초대), DELETE(강퇴)
/api/chat/rooms/[roomId]/join               POST(공개/코드/결제 분기)
/api/chat/rooms/[roomId]/leave              POST
/api/chat/themes                            GET(잠금 상태 포함)
/api/chat/themes/[cd]/unlock                POST(단건 잠금해제)
/api/subscriptions/plans                    GET(플랜+현재 등급)
/api/subscriptions                          GET, POST(시작), DELETE(취소)
/api/subscriptions/check                    GET → { canTip, canCreateRoom, aiQuota... }
/api/stickers/packs                         GET(마켓), POST(구매)
/api/stickers/mine                          GET(보유 목록)
/api/tips                                   GET(내역), POST(결제 완료 후 기록)
/api/admin/chat/rooms                       GET(전체), DELETE(강제삭제)
/api/admin/chat/themes                      GET, POST, PATCH, DELETE
/api/admin/chat/subscriptions               GET(구독 현황 통계)
/api/chat/rooms/[roomId]/messages/[msgId]/translate  POST(번역 요청 — Phase 12)
```

메시지 cursor 페이지네이션:
```
GET /api/chat/rooms/[id]/messages?limit=50&before=<msg_id>
→ { messages: [...], hasMore: boolean, oldestMsgId: string }
```

---

### 11.11 기술 아키텍처

**실시간 메시지 (Supabase Realtime broadcast)**:
```typescript
// src/hooks/use-chat-room.ts — broadcast 기반 (postgres_changes 미사용, RLS 불필요)
const channel = supabase.channel(`room:${roomId}`)
  .on('broadcast', { event: 'new_msg' }, ({ payload }) => addMessage(payload as ChatMessage))
  .on('broadcast', { event: 'msg_trans' }, ({ payload }) => {
    // Phase 12: 번역 완료 시 해당 locale 사용자 메시지 교체
    if (payload.locale_cd === userLocale) replaceTranslation(payload.msg_id, payload.trans_cont)
  })
  .on('presence', { event: 'sync' }, () => setOnlineUserIds(Object.keys(channel.presenceState())))
  .subscribe()
```

**구독 등급 체크 헬퍼** (`src/lib/chat-auth.ts`):
```typescript
export type ChatPlan = 'FREE' | 'PREMIUM' | 'BUSINESS'
export async function getChatPlan(userId: string): Promise<ChatPlan>
export function canCreateRoom(plan: ChatPlan): boolean
export function canSendTip(plan: ChatPlan): boolean
export function getAiQuota(plan: ChatPlan): number  // 0=불가, 10=Premium, -1=무제한
```

**AI 카페 비서** (`@ai` 멘션 → Anthropic Claude Haiku):
- 기존 `@anthropic-ai/sdk` 연동 활용 (Phase 1부터 설치됨)
- 테마별 시스템 프롬프트: 골프방=골프 코치, 먹방방=칼로리 전문가, 여행방=번역 플래너

**PyTranslateâ¢™ 하이브리드 번역 아키텍처 (Phase 12)**:
```
[메시지 전송] POST /api/chat/rooms/[roomId]/messages
    ↓
1. msg_msg 저장 + src_lang_cd(언어감지) 기록
2. 방 참가자 locale 목록 조회 (getDistinctRoomLocales)
3. 각 locale별 비동기 번역 큐 (non-blocking — void)

[번역 워커] chat-translate-dedup.ts
    ↓
4. DB 캐시 확인 (msg_trans 조회) → 캐시 히트 시 즉시 broadcast
5. 미캐시 → in-memory pending map (동일 요청 중복 API 호출 방지)
6. Gemini 2.0 Flash API (번역 + 언어감지)
   → 실패 시 Claude Haiku fallback 자동 전환
7. msg_trans UPSERT (UNIQUE(msg_id, locale_cd))
8. Supabase Realtime broadcast → 'msg_trans' 이벤트

[클라이언트] use-chat-room.ts
    ↓
9. msg_trans broadcast 수신
10. 내 locale 일치 시 메시지 번역 내용 교체 (replaceTranslation)
```

---

### 11.12 보안 요구사항

| 항목 | 요건 |
|---|---|
| XSS 방지 | 메시지 콘텐츠 서버 측 sanitize |
| Pi Tip 검증 | `payment.amount === tip_amt_pi` 서버 재검증 |
| 멤버십 체크 | 모든 메시지 API에서 `msg_room_mbr` 존재·만료 확인 |
| Realtime 접근 | RLS: 카페 멤버만 구독 가능 |
| Rate limiting | 메시지 전송 1초당 최대 5건 |
| 구독 등급 | 유료 기능 API에서 서버 측 `msg_subscr` 재조회 |
| 파일 업로드 | MIME 화이트리스트, 파일 크기 강제 |

---

### 11.13 개발 로드맵

**Phase 7: 카페 MVP**

| Task | 내용 |
|---|---|
| TASK-050 | DB 마이그레이션 (`msg_*` 13개 테이블 + 테마 마스터 데이터) |
| TASK-051 | 테마 마스터 데이터 세팅 (20개 테마 + 기본 스티커팩) |
| TASK-052 | 1:1 카페 API + Supabase Realtime + E2E 암호화 |
| TASK-053 | 그룹 카페 생성 (Pi 결제 연동 + 테마 선택 UX) |
| TASK-054 | 구독 시스템 (플랜 관리 + Pi 결제) |

**Phase 8: 수익화 기능**

| Task | 내용 |
|---|---|
| TASK-060 | Pi Tip (인라인 결제 + TIP_NOTI 메시지 자동 발송) |
| TASK-061 | 스티커 마켓 (테마별 팩 + 인라인 업셀 트리거) |
| TASK-062 | 인라인 구매 트리거 8종 구현 |
| TASK-063 | 이벤트 카페 (유료 입장 + 방장 수익 분배) |
| TASK-064 | AI 카페 비서 (`@ai` 멘션 + 테마별 프롬프트) |
| TASK-065 | 파일·이미지·음성 메시지 (Supabase Storage) |

**Phase 9: 생태계 확장**

| Task | 내용 |
|---|---|
| TASK-070 | 카페 마켓플레이스 (테마별 공개방 디렉토리) |
| TASK-071 | Pi Bet 투표 (카페 내 베팅 이벤트) |
| TASK-072 | 카페 봇·Webhook 연동 (Business 전용) |
| TASK-073 | 분석 대시보드 (Business: 방 통계·수익) |
| TASK-074 | 커스텀 스티커 제작 (Business: 브랜드 스티커팩) |

**Phase 12: PyTranslateâ¢™ — 글로벌 동시통역**

| Task | 내용 |
|---|---|
| TASK-090 | `sql/018_msg_trans.sql` 마이그레이션 + `msg_msg.src_lang_cd` + `env.ts` `GEMINI_API_KEY` |
| TASK-091 | `src/lib/chat-translate.ts` — Gemini 2.0 Flash 번역·언어감지 + Claude Haiku fallback |
| TASK-092 | `src/lib/chat-translate-dedup.ts` — in-memory pending map 동시성 처리 |
| TASK-093 | `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate` 번역 API |
| TASK-094 | 메시지 전송 시 방 참가자 locale 자동 번역 큐 (비동기, non-blocking) |
| TASK-095 | `use-chat-room.ts` 확장 — `msg_trans` broadcast 이벤트 구독 + 메시지 번역 교체 |
| TASK-096 | 카페 UI 번역 토글 + 사용자 표시 언어 설정 (203개 locale) |
| TASK-097 | 메시지 버블 `[원문 보기]` 토글 UI (번역 투명성 보장) |
| TASK-098 | 어드민 번역 통계 (일별 번역 건수·캐시 히트율·비용 추정) |
| TASK-099 | 번역 품질 피드백 UI (메시지별 👍/👎) |

> **구현 순서**: TASK-090 → 091 → 092 → 093 → 094 → 095 (P0 완료 = MVP) → 096 → 097 → 098 → 099

---

## 12. Phase 10 — 사용자 프로필 관리 (마이페이지) ✅

> 상세 명세: `docs/PRD_5_USERS.md` | 담당 에이전트: `.claude/agents/user-profile-manager.md`

### 12.1 범위

| 섹션 | 기능 |
|---|---|
| 개인정보 | real_nm, nick_nm, phone_no, addr, addr_dtl, display_name 수정; pi_username·Google 계정 읽기 전용 |
| 결제 내역 | pi_pymnt 기반 최근 결제 내역 조회 (최신순 20건) |
| 구독 현황 | msg_subscr + msg_subscr_plan 기반 현재 플랜 표시, 자동갱신 취소 |

### 12.2 Pi Browser 필수 제약

| 제약 | 준수 방법 |
|---|---|
| `redirect()` 절대 금지 | `getSessionUser()` null → `<ClientProfileGate />` 반환 |
| 쿠키 비의존 | 클라이언트 API 호출은 `piFetch()` 사용 (X-Pi-Token 헤더 자동 첨부) |
| 물리 DELETE 금지 | 미래 삭제 기능 추가 시 `del_yn = 'Y'` 논리삭제만 허용 |
| anon key 금지 | 모든 DB 접근은 서버 라우트를 통해서만 |

### 12.3 DB 마이그레이션

**`sql/014_user_profile_columns.sql`** — sys_user 프로필 컬럼 5개 추가

```sql
ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS real_nm   TEXT,
  ADD COLUMN IF NOT EXISTS nick_nm   TEXT,
  ADD COLUMN IF NOT EXISTS phone_no  TEXT,
  ADD COLUMN IF NOT EXISTS addr      TEXT,
  ADD COLUMN IF NOT EXISTS addr_dtl  TEXT;
```

### 12.4 API 설계

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/profile` | GET | 내 프로필 조회 (쿠키 OR X-Pi-Token) |
| `/api/profile` | PATCH | 프로필 수정 (display_name, real_nm, nick_nm, phone_no, addr, addr_dtl) |
| `/api/profile/payments` | GET | 내 결제 내역 최신순 20건 |
| `/api/subscriptions/check` | GET | 구독 현황 — **기존 API 재사용** |
| `/api/subscriptions` | DELETE | 자동갱신 취소 — **기존 API 재사용** |

### 12.5 컴포넌트 구조

```
src/app/[locale]/profile/
├── page.tsx                           # Server Component + ClientProfileGate
└── _components/
    ├── profile-tabs.tsx               # 'use client' — 탭 컨트롤러
    ├── profile-form.tsx               # 'use client' — 개인정보 수정 폼
    ├── payment-history.tsx            # 'use client' — 결제 내역 (piFetch)
    ├── subscription-status.tsx        # 'use client' — 구독 현황 (piFetch)
    └── client-profile-gate.tsx        # 'use client' — Pi Browser 게이트
src/app/api/profile/
├── route.ts                           # GET/PATCH
└── payments/route.ts                  # GET
```

### 12.6 page.tsx 패턴 (Pi Browser 필수)

```tsx
export default async function ProfilePage() {
  const user = await getSessionUser()
  if (!user) return <ClientProfileGate />    // redirect 절대 금지
  return (
    <div className='mx-auto max-w-2xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>내 프로필</h1>
      <ProfileTabs initialUser={user} />
    </div>
  )
}
```

### 12.7 개발 태스크

| Task | 내용 | 상태 |
|---|---|---|
| TASK-056 | `sql/014_user_profile_columns.sql` 마이그레이션 작성·적용 | ✅ |
| TASK-057 | `src/lib/users.ts` — UserRow 타입 확장 + `updateUserProfile()` 구현 | ✅ |
| TASK-058 | `src/app/api/profile/route.ts` (GET/PATCH) | ✅ |
| TASK-059 | `src/app/api/profile/payments/route.ts` (GET) | ✅ |
| TASK-060 | `src/app/[locale]/profile/page.tsx` + `_components/` 5개 컴포넌트 | ✅ |
| TASK-061 | `messages/ko.json` — profile 네임스페이스 번역 추가 | ✅ |
| TASK-062 | 3단계 검증: 로컬 → Playwright(X-Pi-Token) → Pi Browser 실기기 | ✅ |

---

## 13. Phase 11 — 어드민 통계 대시보드 (DAU/WAU/MAU · 테마별 매출) ✅

> 상세 명세: `docs/PRD_6_CHART.md` | 담당 에이전트: `.claude/agents/chart/dashboard-stats-builder.md`

### 13.1 범위

| 섹션 | 기능 |
|---|---|
| 사용자 활동 | DAU/WAU/MAU 멀티 라인 차트 + 요약 카드(전기간 대비 증감율) |
| 테마별 매출 | 도넛(비중) + 누적 바(기간별 추이) + 총매출 카드 |
| 공통 | 기간 필터 7 / 30 / 90 / 365일, 다크모드, 반응형 |

### 13.2 핵심 결정

| 항목 | 결정 |
|---|---|
| 차트 라이브러리 | **react-plotly.js (순수 JS)** — `next/dynamic` + `ssr:false` 필수, 경량 번들 `plotly.js-basic-dist-min`. Seaborn·Matplotlib 미사용(Python 전용) |
| 활동 집계 원천 | **신규 활동 로그 `sys_user_actvty_log`** — `UNIQUE(usr_id, actvty_dt)` 하루 1행 UPSERT + 인증 진입점 계측 |
| **집계 방식** | **중간집계(Rollup) 테이블 사전 집계 → 대시보드 직접 조회.** 일배치로 일자별 1행 계산, 당일분만 실시간 보정(하이브리드) |
| 인증 | `getSessionUser()` + `isAdmin()`, 클라이언트는 `piFetch`(어드민 Pi Browser 대응) |
| 매출 단위 | Pi (소수). `status='completed'` 결제만 집계 |

> 에이전트 정의는 Recharts를 1순위로 권장하나, 사용자 지시(Plotly 추천)에 따라 react-plotly.js를 채택했다.

### 13.3 DB 변경 (신규 마이그레이션 2종)

| 마이그레이션 | 테이블/함수 | 설명 |
|---|---|---|
| `sql/015_user_activity_log.sql` | `sys_user_actvty_log` | 활동 원천 — `UNIQUE(usr_id, actvty_dt)`, `fn_record_activity` UPSERT |
| `sql/016_stat_rollup_tables.sql` | `stat_actvty_dly` | 일별 DAU/WAU/MAU 사전 집계 |
| `sql/016_stat_rollup_tables.sql` | `stat_revenue_dly` | 일별 × 테마별 매출 사전 집계 (PK `stat_dt, theme_cd`) |
| `sql/016_stat_rollup_tables.sql` | `fn_build_daily_stats(date)` | 멱등 집계 RPC (백필·보정 안전) |

> DA 표준: 두 집계 테이블 모두 시스템 컬럼 4개 + `del_yn`, `regr_id/modr_id` 기본값 `'BATCH'`. `-- DA-APPROVED:` 주석 필수.

### 13.4 매출 → 테마 귀속 (4경로 UNION)

| 매출 유형 | 결제 경로 | 테마 |
|---|---|---|
| 카페 | `msg_room.pymnt_id` | `msg_room.theme_cd` |
| 팁 | `msg_tip.pymnt_id` | `msg_tip.room_id → msg_room.theme_cd` |
| 스티커팩 | `msg_usr_stkr.pymnt_id` | `msg_usr_stkr.pack_id → msg_stkr_pack.theme_cd` |
| 구독 | `msg_subscr.pymnt_id` | 테마 없음 → `SUBSCR` 별도 세그먼트 |

### 13.5 API 설계

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/admin/stats/activity?period=` | GET | DAU/WAU/MAU — rollup 조회 + 당일 실시간 보정 |
| `/api/admin/stats/revenue?period=` | GET | 테마별 매출 — rollup 조회 |
| `/api/admin/stats/aggregate` | POST | 일배치 집계(CRON_SECRET 보호, `fn_build_daily_stats`) |

### 13.6 컴포넌트 구조

```
src/app/[locale]/(admin)/admin/stats/page.tsx     # isAdmin 게이트 → StatsDashboard
src/app/api/admin/stats/{activity,revenue,aggregate}/route.ts
src/components/admin/stats/
├── StatsDashboard.tsx       # 기간 필터 + piFetch 데이터 페치
├── StatsCard.tsx            # 요약 카드(증감 ↑↓ + 스켈레톤)
├── StatsDateFilter.tsx      # 7/30/90/365 필터
├── DauWauMauChart.tsx       # react-plotly.js 멀티 라인 (dynamic ssr:false)
├── RevenueDonutChart.tsx    # 테마 비중 도넛
└── RevenueTimelineChart.tsx # 테마 추이 누적 바
src/lib/activity-log.ts      # recordActivity() 계측 UPSERT
src/lib/plotly-theme.ts      # 다크모드 layout 프리셋
src/types/stats.ts           # ActivityStatsResponse / RevenueStatsResponse
```

### 13.7 개발 태스크

| Task | 내용 | 상태 |
|---|---|---|
| TASK-080 | `sql/015` 활동 로그 마이그레이션 + `fn_record_activity` | ✅ |
| TASK-081 | `lib/activity-log.ts` + 인증 진입점 계측 (원천 적재 시작) | ✅ |
| TASK-082 | `sql/016` rollup 2종 + `fn_build_daily_stats(date)` 집계 RPC | ✅ |
| TASK-083 | `/api/admin/stats/aggregate` + Cron(pg_cron/Vercel) + 과거 백필 | ✅ |
| TASK-084 | `types/stats.ts` + `activity`·`revenue` API (rollup 조회 + 당일 보정) | ✅ |
| TASK-085 | react-plotly.js 설치 + `plotly-theme.ts` + 차트 컴포넌트 3종 | ✅ |
| TASK-086 | `StatsCard`·`StatsDashboard` + `stats/page.tsx` + 어드민 메뉴 | ✅ |
| TASK-087 | 검증 — 멱등성·백필 대조·당일 보정·다크모드·Pi Browser | ✅ |

> ⚠️ DAU/WAU/MAU는 소급 불가 — TASK-080·081(원천 계측)을 **가장 먼저** 배포해 데이터를 축적한 뒤 집계·차트를 붙인다.

---

## 14. Phase 12 — PyTranslateâ¢™ 글로벌 동시통역 ✅ (완료 — 2026-06-12, 어드민 번역 통계·품질 피드백 포함)

> 상세 명세: `docs/PRD_4_CHAT.md` (v1.6, Section 1-4) | 담당 에이전트: Phase 12 전용 에이전트 없음 — `chat-translate.ts` 직접 구현

### 14.1 범위

| 섹션 | 기능 |
|---|---|
| 자동 번역 | 메시지 수신 시 사용자 선택 locale로 자동 번역 (원본 언어 ≠ 사용자 locale 시) |
| 번역 엔진 | **Gemini 2.0 Flash** 주력 (번역·언어감지) + **Claude Haiku** fallback |
| 동시성 처리 | in-memory pending map — 동일 (msgId, locale) 동시 요청 시 API 1회만 호출 |
| 캐시 | `msg_trans` 테이블 (msg_id, locale_cd) UNIQUE — 동일 조합 1회만 번역 |
| 실시간 전달 | Supabase Realtime broadcast `msg_trans` 이벤트 — 같은 locale 사용자 동시 수신 |
| 투명성 | 메시지 버블 `[원문 보기]` 토글 UI |

### 14.2 핵심 결정

| 항목 | 결정 |
|---|---|
| 번역 엔진 | **하이브리드**: Gemini 2.0 Flash (주력, ~76% 비용 절감) + Claude Haiku (fallback) |
| 번역 제공 범위 | **전 사용자 무료** — 월 ~$30 인프라로 글로벌 킬러 피처 제공 |
| 동시성 | in-memory pending map (`chat-translate-dedup.ts`) — 서버 재시작 시 소멸, 경합 없음 |
| 언어 감지 | Gemini Flash API 단일 호출 (번역 + 감지 동시) → `msg_msg.src_lang_cd` 저장 |
| 클라이언트 구독 | `use-chat-room.ts`에 `msg_trans` broadcast 이벤트 추가 |

### 14.3 DB 마이그레이션

**`sql/018_msg_trans.sql`** — 번역 캐시 테이블 신설 + `msg_msg.src_lang_cd` 컬럼 추가

```sql
-- msg_msg에 원본 언어 코드 추가
ALTER TABLE msg_msg ADD COLUMN IF NOT EXISTS src_lang_cd VARCHAR(20);

-- 번역 캐시 테이블 (On-demand, UNIQUE(msg_id, locale_cd))
CREATE TABLE IF NOT EXISTS msg_trans (
  trans_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id     UUID NOT NULL REFERENCES msg_msg(msg_id) ON DELETE CASCADE,
  locale_cd  VARCHAR(20) NOT NULL,
  trans_cont TEXT NOT NULL,
  regr_id    TEXT NOT NULL DEFAULT 'SYSTEM',
  reg_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id    TEXT NOT NULL DEFAULT 'SYSTEM',
  mod_dtm    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (msg_id, locale_cd)
);
```

### 14.4 API 설계

| 엔드포인트 | 메서드 | 설명 |
|---|---|---|
| `/api/chat/rooms/[roomId]/messages/[msgId]/translate` | POST | 번역 API — 캐시 → dedup → Gemini Flash → broadcast |

**번역 흐름**:
```
POST /translate
  1. msg_trans 캐시 조회 → 캐시 히트 시 즉시 반환 + broadcast
  2. pending map 확인 (중복 API 호출 방지)
  3. Gemini 2.0 Flash API (번역 + 언어감지)
     → 실패 시 Claude Haiku fallback
  4. msg_trans UPSERT
  5. Supabase Realtime broadcast('msg_trans', { msg_id, locale_cd, trans_cont })
```

### 14.5 컴포넌트 구조

```
src/lib/
├── chat-translate.ts           # Gemini Flash + Claude Haiku fallback 번역
└── chat-translate-dedup.ts     # in-memory pending map 동시성 처리
src/app/api/chat/rooms/[roomId]/messages/[msgId]/translate/
└── route.ts                    # POST — 번역 API
src/hooks/
└── use-chat-room.ts            # msg_trans broadcast 이벤트 추가 (Phase 12 확장)
src/components/chat/
├── chat-message-list.tsx       # 번역 텍스트 표시 + [원문 보기] 토글
└── translated-message.tsx      # 번역 버블 컴포넌트 (신규)
```

### 14.6 클라이언트 broadcast 확장

```tsx
// use-chat-room.ts — Phase 12 확장
channel
  .on('broadcast', { event: 'new_msg' }, ({ payload }) => addMessage(payload as ChatMessage))
  .on('broadcast', { event: 'msg_trans' }, ({ payload }) => {
    if (payload.locale_cd === userLocale) replaceTranslation(payload.msg_id, payload.trans_cont)
  })
  .on('presence', { event: 'sync' }, () => setOnlineUserIds(Object.keys(channel.presenceState())))
  .subscribe()
```

### 14.7 개발 태스크

| Task | 내용 | 상태 |
|---|---|---|
| TASK-090 | `sql/018_msg_trans.sql` 마이그레이션 + `msg_msg.src_lang_cd` + `env.ts` `GEMINI_API_KEY` | ✅ |
| TASK-091 | `src/lib/chat-translate.ts` — Gemini 2.0 Flash 번역·언어감지 + Claude Haiku fallback | ✅ |
| TASK-092 | `src/lib/chat-translate-dedup.ts` — in-memory pending map 동시성 처리 | ✅ |
| TASK-093 | `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate` 번역 API | ✅ |
| TASK-094 | 메시지 전송 시 방 참가자 locale 자동 번역 큐 (비동기, non-blocking) | ✅ |
| TASK-095 | `use-chat-room.ts` 확장 — `msg_trans` broadcast 이벤트 구독 + 메시지 번역 교체 | ✅ |
| TASK-096 | 사용자 프로필 — 표시 언어 설정 UI (203개 locale, 1회 설정) | ✅ |
| TASK-097 | 메시지 버블 `[원문 보기]` 토글 UI (번역 투명성 보장) | ✅ |
| TASK-098 | 어드민 번역 통계 (일별 번역 건수·캐시 히트율·비용 추정) | ✅ |
| TASK-099 | 번역 품질 피드백 UI (메시지별 👍/👎 — 향후 fine-tune 데이터) | ✅ |

> **구현 순서**: TASK-090 → 091 → 092 → 093 → 094 → 095 (P0 완료 = MVP) → 096 → 097 → 098 → 099

---

## 15. Phase 13 — PyShopâ¢ (MPS) ✅ Phase 1+2 완료 (2026-06-13) · Phase 3 O2O 카페 커머스 완료 (2026-06-16) · PiRC3 보류

> **상세 스펙**: `docs/PRD_8_MPS.md` (v1.0)

Pi Coin 전용 P2P 마켓플레이스. **두 갈래로 진화**한다:
- **직거래(중고)**: 배송 없이 구매자·판매자가 직접 만나 거래 (Phase 1+2)
- **오프라인 매장(O2O 카페)**: 구글 지도의 실제 매장을 인증 등록 → 메뉴 판매 → 픽업/배달 (Phase 3, §15.8)

PiRC2 가상 에스크로로 결제를 보호한다.

### 15.1 핵심 개념

| 항목 | 내용 |
|---|---|
| 결제 수단 | Pi Coin 단독 (법정화폐 없음) |
| 거래 방식 | 직거래 전용 (배송 없음) |
| 에스크로 | PiRC2 U2A 가상 에스크로 (운영자 Pi 계정 중간 보관) |
| 완료 방식 | **양방향 확인** — ① 판매자 전달 확인 → ② 구매자 수령 확인 → Pi 정산 |

### 15.2 사용자 권한 매트릭스

| 기능 | Guest | Buyer | Seller | Admin |
|------|-------|-------|--------|-------|
| 상품 목록·상세 조회 | ✅ | ✅ | ✅ | ✅ |
| 상품 등록·수정·삭제 | ❌ | ❌ | ✅ | ✅ |
| 주문 생성 (구매하기) | ❌ | ✅ | ❌ | ✅ |
| 거래 시작 (판매자) | ❌ | ❌ | ✅ | ✅ |
| 판매자 전달 완료 확인 | ❌ | ❌ | ✅ | ✅ |
| 거래 완료 확인 (구매자) | ❌ | ✅ | ✅ | ✅ |
| 주문 취소 | ❌ | ✅ | ✅ | ✅ |
| 매장 등록·관리 | ❌ | ❌ | ✅ | ✅ |

### 15.3 기능 요건 요약

| FR | 기능 | 우선순위 | Phase |
|----|------|---------|-------|
| FR-01 | 상품 등록·수정·삭제 (CRUD) | P0 | MVP |
| FR-02 | 상품 상태 관리 (DRAFT/OPEN/CLOSED/SOLD) | P0 | MVP |
| FR-03 | 카테고리 시스템 (2단계 계층) | P1 | Phase 2 |
| FR-04 | 상품 검색·목록 조회 (키워드·카테고리·가격 필터) | P0 | MVP |
| FR-05 | 상품 상세 페이지 (이미지 갤러리·판매자 정보) | P0 | MVP |
| FR-06 | 판매자 매장 등록·관리 (Google Maps 확장 포인트) | P1 | Phase 2 |
| FR-07 | **재고수량 엄격 관리** — `stock_qty = reg_qty - ordered_qty` 항등식 | P0 | MVP |
| FR-08 | 주문 생성 + Pi Coin 에스크로 송금 | P0 | MVP |
| FR-09 | 주문 상태 관리 (PENDING→ESCROW→TRADING→SELLER_DONE→DONE) | P0 | MVP |
| FR-10 | 양방향 주문 취소 (취소 요청자 수수료 부담) | P1 | Phase 2 |
| FR-11 | **양방향 거래 완료** → 판매자 Pi Coin 정산 + 자동 타임아웃(N일) | P0 | MVP |
| FR-12 | 거래 내역 조회 | P1 | Phase 2 |
| FR-13 | PiRC2 기반 가상 에스크로 구현 | P0 | MVP |

> **9999 무제한 센티널**: 커피·피자 등 재고 추적이 무의미한 상품은 `reg_qty = 9999`로 등록 — `stock_qty = 0` 도달 시 자동 SOLD 전환 억제, 불변 조건 유지.

### 15.4 주문 상태 머신

```
[구매하기] → PENDING → ESCROW(Pi 결제) → TRADING(판매자 거래시작)
           → SELLER_DONE(판매자 전달완료) → DONE(구매자 수령확인 or 자동 N일)
                                          → CANCELLED(구매자·Admin만)
PENDING/ESCROW/TRADING → CANCELLED(구·판·Admin)
```

### 15.5 핵심 DB 테이블 (6개)

| 테이블 | 설명 |
|--------|------|
| `mps_ctgr` | 상품 카테고리 (2단계 계층, `parent_ctgr_id` 자기 참조) |
| `mps_shop` | 판매자 매장 (ONLINE/OFFLINE/BOTH, `lat`·`lng`·`place_id` Google Maps 준비) |
| `mps_item` | 상품 (`reg_qty`·`ordered_qty`·`stock_qty` 삼위일체 + CHECK 제약) |
| `mps_item_img` | 상품 이미지 (최대 5장, 썸네일 지정) |
| `mps_order` | 주문 (`escrow_txid`·`release_txid`·`cancel_req_id`) |
| `mps_txn_hist` | 거래 이력 (ESCROW_IN/RELEASE_OUT/AUTO_RELEASE/REFUND/FEE) |

### 15.6 API 엔드포인트 (17개)

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/store/items` | 상품 목록 조회 / 등록 |
| GET/PATCH/DELETE | `/api/store/items/[itemId]` | 상품 상세·수정·삭제 |
| GET/POST | `/api/store/shops` | 매장 목록·등록 |
| PATCH/DELETE | `/api/store/shops/[shopId]` | 매장 수정·삭제 |
| POST | `/api/store/orders` | 주문 생성 (원자적 재고 차감) |
| GET | `/api/store/orders/[orderId]` | 주문 상세 (당사자만) |
| PATCH | `/api/store/orders/[orderId]/cancel` | 주문 취소 |
| POST | `/api/store/orders/[orderId]/seller-done` | ① 판매자 전달 완료 확인 |
| POST | `/api/store/orders/[orderId]/buyer-done` | ② 구매자 수령 완료 확인 → Pi 정산 |
| GET | `/api/store/my/history` | 거래 내역 조회 |
| POST | `/api/store/payments/approve` | Pi 결제 승인 콜백 |
| POST | `/api/store/payments/complete` | Pi 결제 완료 콜백 |

### 15.7 마일스톤

| Phase | 내용 |
|-------|------|
| Phase 1 (MVP) | FR-01·02·04·05·07·08·09·11·13 — 기본 거래 흐름 완성 |
| Phase 2 | FR-03·06·10·12 — 매장·카테고리·취소·거래 내역 |
| Phase 3 ✅ | **O2O 카페 커머스** (§15.8) — 구글 매장 인증등록·오프라인 주문 상태머신·주문방법 3종·보이스 알림·지도 상품판매 (2026-06-16) |
| Phase 3 (보류) | PiRC3 실 에스크로 마이그레이션 (invokeContract 공식 미지원 — TASK-112 보류) |

### 15.8 Phase 3 — O2O 오프라인 매장 커머스 ✅ (2026-06-16)

> 온라인 커뮤니티(PyChat)에서 시작한 cafe.pi가 **오프라인 실물 카페 운영(O2O)** 으로 흐르는 교두보. 구글 지도의 실제 카페를 사장님이 인증 등록 → Pi로 메뉴 판매.

#### 15.8.1 구글 카페 소유권 반자동 인증·등록 (half-인증)

무승인 탈중앙화 원칙 — 관리자 개입 없이 **구글 정보 재입력 대조**로 무분별 선점을 거른다.

| 검증 항목 | 방식 |
|---|---|
| place_id | 지도에서 선택 캡처 + **전체 직접 타이핑**(복사 차단·대소문자 구분) |
| 전화번호 | 서버가 place_id로 구글 Place Details 직접 조회 → **입력값과 대조** |
| 현장 GPS | 구글 매장 좌표 기준 **≤100m** (LBS 동의 전제) |
| 매장명·대표자명·주소·이메일 | **필수 입력**(검증X, 분쟁·회수 책임소재) |

- 통과 시 `owner_verified_yn='Y'`, `verify_method_cd='MATCH'` 자동 등록 → **"✅ 인증" 배지**
- `place_id` 부분 유니크 인덱스로 **"한 카페 = 한 주인"** DB 강제 (검증 매장만)
- 구글 Place 전체 정보 보관: 구조화 컬럼(`google_nm`·`website_url`·`gmap_url`·`biz_status_cd`·`rating_cnt`) + `google_place_json`(JSONB 원본). 매장 관리 화면에서 표시·수정
- 배달 가능 토글(`dlvr_yn`)

#### 15.8.2 오프라인 매장 주문 상태 머신 (직거래와 별개)

```
판매등록 → [판매중]
구매자 결제 → 🛒 주문중(ORDERED)      ← 구매자·판매자 취소 가능(수수료)
   판매자 [📥 상품접수]
        → 👨‍🍳 준비중(PREPARING)        ← 양측 취소 불가 (접수=약속)
   판매자 [📦 상품완료]
        → 📦 상품대기중(READY)         ← 구매자 액션 없음
        → (10분 자동) → 🎉 판매완료(DONE) + 정산
```

- **주문방법 3종**: 매장이용(DINE_IN)·픽업(PICKUP)·배달(DELIVERY, 배달가능 매장만 + 배달위치 필수)
- **오프라인 판정**: 상품의 매장 소속(`shop_id`) 유무 → 결제완료(`markEscrow`) 시 ORDERED vs 직거래 TRADING 분기
- **10분 자동완료**: READY + `ready_dtm` 10분 경과 → DONE (GET orders on-demand sweep + 일일 cron 백스톱)

#### 15.8.3 취소 규칙·수수료 (주문중 단계만)

| 취소 주체 | 구매자 환불 | 비고 |
|---|---|---|
| 판매자 취소 | **1.1π** (1.0 + 보상 0.1) | 보상은 판매자 보증금(`mps_seller_bond`)에서 충당 |
| 구매자 취소 | **0.9π** (1.0 − 수수료 0.1) | 공제 0.1은 플랫폼 귀속(미송금) |

- 취소 가능 구간 = **주문중(ORDERED) 단 한 곳** (접수 후 양측 불가)
- 취소 당사자는 **취소 화면 역할**(판매관리=SELLER/구매관리=BUYER)로 명시 판정 — self-purchase(buyer=seller) 구분. 비-self 주문은 DB가 id로 강제(보안)

#### 15.8.4 사장님 보이스 주문 알림

- 결제완료(에스크로) 시 서버가 `seller:{userId}` 토픽 broadcast (기존 채팅 broadcast 인프라 재사용)
- `OrderAlertListener`(전역) 구독 → **🔔 차임(Web Audio) + 🗣️ TTS ×3**(로케일별 음성) + 토스트
- 자동재생 정책 대응: "음성 알림 켜기" 1회 탭으로 오디오 잠금 해제. TTS 미지원 기기는 차임·토스트로 폴백

#### 15.8.5 지도 상품 판매 + 메뉴 동선

- 지도 매장 핀 클릭 → InfoWindow에 **판매 상품 썸네일 그리드**(영업시간 자리 대체) → 탭 시 상품 상세 에스크로 거래
- 매장 관리 카드 **"+ 메뉴 추가"** → 소속 매장 미리 선택된 상품 등록 폼(`?shop=` 쿼리)
- **카페/음료 카테고리** 신설(커피음료·디저트, 최상단 노출)
- 길찾기 외부앱 연동: Google Maps(글로벌)·카카오맵·네이버지도(국내)

#### 15.8.6 DB 마이그레이션 (`sql/050~060`)

| # | 내용 |
|---|---|
| 050 | mps_shop 소유권 검증 컬럼(`owner_verified_yn`·`verify_method_cd`) + place_id 부분 유니크 |
| 051 | 대표자명(`owner_nm`) + `verify_method_cd='MATCH'` |
| 052 | 구글 Place 전체정보(구조화 5컬럼 + `google_place_json` JSONB) |
| 053 | 카페/음료 카테고리(커피음료·디저트) |
| 054 | 주문방법(`order_mthd_cd`·`dlvr_addr`) + 매장 배달가능(`dlvr_yn`) |
| 055 | 관리자 본인상품 테스트 결제(`fn_mps_order_create.p_allow_self`) |
| 056 | 오프라인 상태머신(ORDERED/PREPARING/READY + `ready_dtm`) + 취소 RPC 확장 |
| 057 | 상품준비중 이후 양측 취소 불가 |
| 058 | 오프라인 주문 TRADING→ORDERED 데이터 교정 |
| 059~060 | 주문중 판매자 취소수수료 + 취소 역할(`p_cancel_role`) 명시 |

#### 15.8.7 신규 API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/store/shops/claim` | 구글 카페 반자동 인증 등록 |
| POST | `/api/store/orders/[orderId]/accept` | 판매자 상품접수 (ORDERED→PREPARING) |
| POST | `/api/store/orders/[orderId]/ready` | 판매자 상품완료 (PREPARING→READY) |
| GET | `/api/cron/order-autocomplete` | READY 10분 자동완료 백스톱 |

#### 15.8.8 보안 (커밋 시 자동 리뷰 적발·교정)

- **IDOR 차단**: `POST/PATCH /api/store/items`가 `shop_id`를 형식만 검증하고 소유권 미확인 → 타인 매장에 상품 부착 가능하던 취약점. `seller_id`+`del_yn` 본인 매장 검증으로 차단

---

## 16. Phase 14 — PyVoice™ N:N 음성채널 ✅ (v2.0 구현 완료 — 2026-06-12)

> **상세 스펙**: `docs/PRD_9_VOICE_CHAT.md` (v2.0) | **담당 에이전트**: `.claude/agents/chat/voice-chat-architect.md`

카페 멤버 간 브라우저 기반 **N:N 다:다 음성채널** (1~4명 P2P Full Mesh). 1명도 입장해 대기할 수 있고, 방장(OWNER/ADMIN)이 참여자 마이크를 원격 제어한다.

### 16.1 핵심 정책 (v2.0 — 2026-06-12 확정)

| 항목 | 결정 |
|---|---|
| 참여 모델 | N:N 다:다 (1~4명) — 1명도 입장 가능(혼자 대기, 피어 join 시 자동 offer) |
| 동시 마이크 | 최대 4명 — 5명째부터 청취 전용(`mic_yn='N'`) 강제 입장 |
| 방장 제어 | OWNER/ADMIN이 `mic_mute_force`/`mic_unmute_allow`로 원격 mute/unmute |
| 토폴로지 | P2P Full Mesh — 신규 입장자만 기존 피어에 offer (glare 원천 차단) |
| TURN | 관리형 서비스(HMAC 임시 자격증명, TTL 1h) — 미설정 시 STUN 폴백 |
| 수익화 | 베타 완전 무료 (결제 게이팅은 S3에서 데이터 기반 결정) |

### 16.2 구현 내역

- **DB** (`sql/032_voice_channel.sql`): `msg_call_participant` 신규(참여자별 `mic_yn`·입퇴장), `msg_call_log` room 레벨 세션 메타로 전환(caller/callee 제거), `msg_call_quality_stat` room 단위 upsert, RLS 활성화
- **API 5종** (`/api/voice/rooms/[roomId]/…`): `join`(1인 대기+4마이크 제한), `leave`(품질 적재), `signal`(WebRTC 중계, 신원 보증), `mic-control`(방장 검증+상한 재확인), `participants`(점유 현황) + `/api/voice/turn-credentials`
- **클라이언트**: `use-voice-channel.ts`(피어별 PC Map·ICE candidate 큐·ICE restart·keepalive 퇴장), `voice-channel-panel.tsx`(참여자 목록·방장 제어 버튼), 채팅방 헤더 🎙️ 버튼 + 참여 인원 배지
- **Pi Browser 제약 준수**: 전 API `piFetch`(X-Pi-Token) 이중 경로, redirect 금지

### 16.3 남은 작업 (Go/No-Go)

- 🔜 **S0**: Pi Browser 실기기 마이크 권한·`getUserMedia` 검증 (iOS WKWebView가 핵심 리스크)
- 🔜 **TURN 운영 설정**: `TURN_HOST`/`TURN_SECRET` env 미설정 — 현재 STUN 전용(동일 네트워크만), 관리형 TURN 가입 필요
- 🔜 **S2**: 품질 데이터(RTT·loss·relay 비율)로 자체 coturn 전환 판단

---

## 17. Phase 15 — LBS 위치기반서비스 ✅ (P0+P1 완료 — 2026-06-12)

> **상세 명세**: `docs/PRD_10_GPS.md` (v1.2) | **담당 에이전트**: `.claude/agents/gps/lbs-consulting-architect.md`

MPS 직거래 전용 마켓플레이스에서 **"나와의 거리"는 구매 가능 여부를 결정하는 핵심 데이터**다.
한국 위치정보법 기반 동의 게이트 + Haversine 거리 계산으로 직거래 성사율을 높인다.

### 17.1 핵심 비즈니스 규칙 (LBS Rule 4종)

| Rule | 내용 | 구현 위치 |
|------|------|---------|
| **LBS-01** | 동의자에게만 위치기반 UI 노출 (`lbs_consent_yn='Y'` 체크) | 클라이언트 조건부 렌더 |
| **LBS-02** | 동의자만 위치 자동 저장 — 미동의 시 API 403 반환 | `/api/location/save` 서버 검증 |
| **LBS-03** | 동의 철회 시 즉시 데이터 파기 (`usr_loc_hist.del_yn='Y'`) | `DELETE /api/location/consent` |
| **LBS-04** | 동의자에게만 MPS 상품목록 거리 표시 + 거리 가까운 순 기본 정렬 | `/api/store/items` 파라미터 확장 |

> **직거래 비즈니스 근거**: MPS는 배송 없는 직거래 전용 — 구매자가 판매자를 직접 만나야 거래 성사. 거리 = 거래 가능성 판단 핵심 데이터.

| 거리 | 직거래 가능성 |
|-----|------------|
| 1~5km | 도보/자전거 — 즉시 거래 의향 높음 |
| 5~20km | 차량 이동 — 선택적 거래 의향 |
| 20km+ | 일반적으로 거래 성사 어려움 |

### 17.2 DB 스키마 (`sql/030_lbs.sql`)

**sys_user 컬럼 추가:**
```sql
ALTER TABLE sys_user
  ADD COLUMN lbs_consent_yn   CHAR(1)     DEFAULT 'N',
  ADD COLUMN lbs_consent_dtm  TIMESTAMPTZ,
  ADD COLUMN lbs_consent_ver  TEXT;
```

**신규 테이블 2종:**

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|---------|
| `sys_user_consent` | 동의 이력 (6개월 보관) | `consent_tp_cd` ('LBS'/'MKT'/'PUSH'), `consent_yn`, `consent_ver` |
| `usr_loc_hist` | 위치 수집 이력 | `loc_tp_cd` ('01' 가입/'02' 로그인/'04' 상품), `lat DECIMAL(10,8)`, `lng DECIMAL(11,8)`, `ref_id` |

> **설계 결정**: 매장 위치(`loc_tp_cd='03'`)는 `mps_shop.lat/lng` 재활용 — 이중 저장 금지

**거리 계산 (Haversine, PostGIS 없이):**
```sql
ROUND(
  6371 * acos(
    LEAST(1.0,
      cos(radians($user_lat)) * cos(radians(COALESCE(s.lat, l.lat))) *
      cos(radians(COALESCE(s.lng, l.lng)) - radians($user_lng)) +
      sin(radians($user_lat)) * sin(radians(COALESCE(s.lat, l.lat)))
    )
  )::numeric, 1
) AS distance_km
```

### 17.3 API 엔드포인트 (10개)

| 메서드 | 경로 | 설명 | 동의 필수 |
|--------|------|------|----------|
| GET | `/api/location/consent` | 동의 상태 조회 | 불필요 |
| POST | `/api/location/consent` | 동의 등록 | 불필요 |
| DELETE | `/api/location/consent` | 동의 철회 + 즉시 파기 | 불필요 |
| POST | `/api/location/save` | 위치 저장 (4가지 트리거) | **필수** |
| GET | `/api/location/history` | 내 위치 이력 열람 | 필수 |
| GET | `/api/location/nearby/rooms` | 주변 채팅방 탐색 | 필수 |
| GET | `/api/location/nearby/shops` | 주변 MPS 매장 | 필수 |
| GET | `/api/location/nearby/items` | 주변 상품 | 필수 |
| POST | `/api/location/geocode` | 주소 → 좌표 (서버 프록시) | 불필요 |
| POST | `/api/location/reverse-geocode` | 좌표 → 주소 (서버 프록시) | 불필요 |

**`/api/store/items` 파라미터 확장** (Rule LBS-04):
- `?lat=&lng=` — 사용자 현재 위치 (동의자만)
- `?radius=` — 반경 필터 `1/5/10/30` km
- `?sort=distance` — 거리 가까운 순 정렬 (동의자 기본값)

### 17.4 Pi Browser 특수 처리

- `navigator.geolocation.getCurrentPosition()` Pi Browser WebView 호환 테스트 필요
- GPS 실패 시 `usr_loc_hist` 최신 로그인 위치(loc_tp_cd='02') 폴백
- 모든 위치 API: `piFetch()` 필수 (X-Pi-Token 헤더 자동 첨부)
- `getSessionUser()` null 시 **`redirect` 금지** — `ClientLbsGate` 반환

### 17.5 법적 요건

- **근거 문서**: `docs/law/agreement/위치기반서비스이용약관및위치정보수집이용동의서_kor.md`
- **보유기간**: 목적 달성 후 즉시 파기 (위치정보법 제5조) → `del_yn='Y'` 논리삭제
- **6개월 확인자료**: `sys_user_consent` 테이블 del_yn='N' 유지 (위치정보법 제16조)
- **방통위 신고 의무 여부**: 법률 자문 권고 (`docs/law/compliance/정부신고사항_가이드.md`)

### 17.6 개발 태스크

| Task | 내용 | 상태 |
|------|------|------|
| TASK-130 | `sql/030_lbs.sql` — sys_user_consent + usr_loc_hist + sys_user 컬럼 추가 | 🔜 |
| TASK-131 | `src/env.ts` + `.env.example` — GOOGLE_MAPS_API_KEY (서버) + NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (클라이언트) | 🔜 |
| TASK-132 | `/api/location/consent` (GET/POST/DELETE) — 동의 등록·철회·즉시 파기 | 🔜 |
| TASK-133 | `/api/location/save` — 위치 저장 (4가지 트리거, 동의 서버 재검증) | 🔜 |
| TASK-134 | `/api/location/geocode` + `/reverse-geocode` — Google Maps API 서버 프록시 | 🔜 |
| TASK-135 | `/api/location/nearby/*` — 주변 채팅방/매장/상품 탐색 (Haversine) | 🔜 |
| TASK-136 | `/api/store/items` 파라미터 확장 — lat/lng/radius/sort=distance (Rule LBS-04) | 🔜 |
| TASK-137 | 클라이언트 동의 플로우 UI — 동의 바텀시트 + 마이페이지 설정 | 🔜 |
| TASK-138 | MPS 상품 목록 거리 표시 + 반경 필터 UI (동의자 전용) | 🔜 |
| TASK-139 | `touchLastLogin()` 연동 + 로그인/가입 위치 자동 수집 + Pi Browser GPS 검증 | 🔜 |

---

## 18. Phase 16 — 이벤트 미션 시스템 (Pi 요원 육성) ✅ (구현 완료·운영 중 — 2026-06-15)

> 상세 요구사항: **`docs/PRD_11_EVENT.md` (v2.x)**

플랫폼 전 기능을 미션으로 경험시키는 게이미피케이션 이벤트. 10가지 미션을 실제 비즈니스 로직 트리거에서 **멱등 자동 감지**해 기록하고, 전부 완료 시 화이트리스트 등록 → 미션 수행 합계(sum) 내림차순 랭킹. 첫 완료 **선착순 10명**에게 카카오 선물 증정.

### 18.1 핵심 컨셉
- **"Pi 요원 육성"** — 미션 = 스킬 습득, 요원 등급 5단계 (Recruit 🆕 → Trainee 📚 → Agent 🕵️ → Veteran 🏅 → Master Agent 👑)
- Footer 'Event' 탭 신설: `[Home] [Cafe] [Shop] [Event] [My]` → `/[locale]/event`

### 18.2 10가지 미션 (트리거 실증 기반 · 2026-06-15 명칭/순서 현행화)
> M4↔M5 순서 교환(Bean을 앞으로) + PiRC 표기 정비 반영. 미션 명칭 정본은 `messages/ko.json`(ko) + `i18n_message`(en).

| # | 미션 | 트리거 |
|---|---|---|
| M1 | 계정 통합 (Pi + Google) | `api/auth/link-complete` |
| M2 | 별명 + 카카오톡 ID 입력 | `api/profile` PATCH |
| M3 | PREMIUM 카페 생성(PiRC1) + 자동번역 | `api/chat/rooms` + translate |
| M4 | Bean(팁) 1인 이상 전송 (PiRC1) | `api/tips` |
| M5 | Pi구독서비스(PiRC2) 신청 후 Pi Bet 생성·분배 | `api/chat/rooms/[id]/bets` |
| M6 | 스티커 + 파일 + 음성채널 | voice/join + file + sticker |
| M7 | PyShopâ¢ 판매자 거래 취소 (에스크로서비스;PiRC3) | `api/store/orders/[id]/cancel` (판매자) |
| M8 | PyShopâ¢ 구매자 거래 취소 (에스크로서비스;PiRC3) | `api/store/orders/[id]/cancel` (구매자) |
| M9 | 판매자 보증금 1π + 위치동의 (에스크로서비스;PiRC3) (선행) | `api/store/bond` + `api/location/consent` |
| M10 | M9 후 M7·M8 재수행 (취소수수료 0.1π 경험) | `cancel` (M9 완료 이후, FEE 발생) |

### 18.3 보상 설계 (3계층 · 2026-06-17 실 보상 확정)
- **전원**: 미션·등급 뱃지 + 전 미션 완료 시 화이트리스트
- **선착순 10명**: 카카오 선물 (`gift.kakao.com/product/11105359`) — **M2에서 받은 카카오톡 ID로 수동 발송**(`evt_gift_log` 추적), 10명 채워지면 마감
- **10미션 완주 실 보상**: **1π 판매보증금(`mps_seller_bond`) 직접 적립** — A2U 송금 폐기(시드 미설정·실패 시 PENDING 리스크). **관리자 수동 지급 버튼**으로만 트리거(자동 지급 폐기), 원자적 RPC로 이중지급 차단 → §18.8
- **Phase 2+**: 상위 랭커 추가 배분·카카오 API 자동화 (경영 결정)

### 18.4 데이터 모델 제안 (DA 표준)
- `evt_mission` (미션 정의) · `evt_user_mission` (완료 이력, `UNIQUE(user_id, mission_cd)`) · `evt_exclude` (제외 대상자) · `evt_gift_log` (선물 발송 추적)
- 전 테이블 시스템 컬럼 4개 + 논리삭제(`del_yn`/`del_dtm`)

### 18.5 화면·API
- **SCR**: `/event` (미션 진행도 + 요원 등급 + 랭킹), `/(admin)/admin/event/exclude` (관리자 제외 관리)
- **API**: `/api/event/my-progress`·`/ranking`, `/api/admin/event/exclude`, `/api/event/top-10-gifts`

### 18.6 상태 및 운영 현황 (2026-06-15)
- ✅ **구현 완료·운영 중** — DB(`evt_*` 6테이블, `sql/044`·`045`), 평가 엔진(`src/lib/event.ts`), `/event` 페이지(`ClientEventGate`), 랭킹·진행도·선물·제외 API 전부 가동.
- **운영 통계**: 참여자 7 · 완료기록 34 · 10미션 완주 1 · 제외 0 · `evt_action_log` 19건.
- ✅ **확인 필요 항목 해소**:
  - 선착순 기준 → **전체 10미션 완주자**로 확정 (`getTop10ForGift`: `count === 10`, 최종 완료 시각 오름차순 상위 10).
  - M10 판정 → `checkCancelWithFee`로 구현 (M9 완료 시각 이후 `CANCEL_FEE_IN` + 동일 order `REFUND_IN` 동시 존재 확인).
- ⚠️ **잔여 점검 권장**: `recordUserAction` 행위 훅이 일부 비즈니스 API에만 삽입된 정황(`action_log` 19건 < 완료기록 34건) — 미삽입 트리거 전수 점검 필요.

### 18.7 평가 엔진 정밀화 (2026-06-15, `4f623d9`)

운영 신뢰도(고객 신뢰 직결)를 위해 평가 엔진을 **양방향 멱등**으로 재작성했다.

| 항목 | 변경 내용 |
|---|---|
| **M2 상태형 전환** | `profile_update` 행위 로그 의존 폐기 → `sys_user`의 **별명(`nick_nm`) + 카카오톡 ID(`kakao_id`) 유무**만으로 판정(`hasNickAndKakao`). 상태가 사라지면(예: kakao_id 삭제) **즉시 완료 취소**(양방향). 행위형(M1·M3~M10)은 이벤트 전 수행을 미충족 오판할 위험이 있어 **단방향 유지**(자동 취소 안 함) |
| **평가 엔진 교체** | `upsert(onConflict)` → **`select` 후 `insert`/`update` 분기**. 부분 unique 인덱스(`WHERE del_yn='N'`)의 `ON CONFLICT` 충돌 회피 + 논리삭제된 미션 **재충족 시 복구**(`del_yn='Y'`→`'N'`) 가능 |
| **SEQUENCE(M10)** | 선행 미션(M9) 조회에 `del_yn='N'` 필터 추가 — 취소(논리삭제)된 선행 미션은 미완료로 간주 |
| **평가 순서** | 미션을 `mission_ord` 오름차순 평가 — SEQUENCE가 같은 루프에서 선행 상태를 올바르게 참조 |
| **프로필 빈값 저장** | 선택 필드 빈값(`''`)도 전송(필수 `display_name` 제외) + 서버에서 빈문자열→`null` 정규화 → kakao_id '지우기'가 DB에 반영되어 M2 판정과 정합 |
| **관리자 재평가 버튼** | 이벤트 페이지 랭킹 옆 관리자 전용 '🔄 미션 재평가' + `POST /api/admin/event/reeval`(온디맨드 전체 재평가). Vercel Hobby cron 자정 1회 제약 사이 누락분 즉시 보정 |
| **인프라 안정화** | `evt` 미션 코드 컬럼 `CHAR(3)`→`VARCHAR(10)`(`sql/046`, 공백 패딩 매칭 실패 방지) · `CRON_SECRET` 프로덕션 필수 강제 · `voice_join` 미션 트리거를 현행 N:N 음성채널 입장 경로에 연결 |

> ⚠️ **후속 권장(이번 리뷰 식별)**: `reevaluateAllActiveUsers`는 `evt_action_log` 보유자만 재평가 대상으로 삼으나, M2는 상태형이라 행위 로그 없이 프로필만 채운 사용자가 누락될 수 있다. 대상 집합에 `sys_user.nick_nm`/`kakao_id` 보유자 UNION 권장.

### 18.8 보상 시스템 전환 — A2U → 1π 보증금 적립 + 관리자 수동 지급 (2026-06-16~17)

10미션 완주 실 보상을 **Pi A2U 직접 송금에서 판매보증금(`mps_seller_bond`) 1π 직접 적립으로 전환**했다. A2U는 시드 미설정·송금 실패 시 PENDING을 반환해 실 지급 신뢰도가 낮은 반면, 보증금 적립은 블록체인 송금 없이 플랫폼 장부에 잔액을 가산하므로 송금 실패가 구조적으로 없고, 적립분이 PyShopâ¢ 판매 신뢰 자본으로 즉시 활용된다.

| 항목 | 내용 |
|---|---|
| **지급 방식** | 자동 지급 폐기 → **관리자 수동 버튼** '1Pi 판매보증금 지급'(이벤트 화면 재평가 버튼 옆, 관리자 전용). `event.ts` 미션 평가의 자동 보상 호출 제거 — 보상은 명시적 승인 시점에만 발생 |
| **지급 대상** | 10미션 완주(`count===10`) + 미지급(`reward_st_cd` 미존재) + `evt_exclude` 어뷰저 제외자만 |
| **API** | `POST /api/admin/event/bond-reward` (`isAdmin` 이중 검증) |
| **원자적 중복방지** | DB 함수 `fn_evt_grant_bond_reward`(`sql/061`) — 단일 트랜잭션 + `FOR UPDATE` 행잠금 + `reward_st_cd`('BONDED'/'PAID') 게이트. 앱 레벨 check-then-act의 TOCTOU race + A2U-보증금 교차 이중지급 차단. `grantBondReward`는 RPC 래퍼로 교체 |
| **추적 테이블** | `evt_pi_reward_log`(`sql/048`) — `UNIQUE(event_id, user_id)` 멱등 + `reward_st_cd` 상태 추적 |
| **M3 결함 동시 수정** | `premium_cafe_create` 행위 기록을 **유료 테마로 게이트** — 무료 FITNESS 테마로 M3를 부정 완료하던 우회 경로 차단(`group/route.ts`) |

> 관련 커밋: `5f5e6b9`(A2U→보증금 전환) · `d540f68`(자동 적립 + O2O 통합) · `a277b80`(수동 버튼 + 원자적 RPC + 자동 보상 제거 + M3 게이트) · `6a648b5`(병합 부작용 LBS 블록 중복 제거).

---

## 19. Phase 19 — Bean Token 경제 가시화 및 회계 정합성 (2026-06-21)

> Bean 토큰 경제의 투명한 순환과 데이터 정합성을 확보하기 위한 대차대조표 가시화, 회계 버그 수정, 신규 수익원 설계

### 19.1 Bean 대차대조표 대시보드 (/admin/token)

**목표**: Bean 발행·유통·회수의 흐름을 T계정 형식으로 시각화하고, 차변(발행) = 대변(유통+회수) 균형 검증

| 구성 | 내용 |
|---|---|
| **차변 (발행)** | ΣCHARGE(사용자 충전) + Σmint(프로모션 발행) |
| **대변 (유통/회수)** | ΣUSER(사용자 보유) + ΣGOVERNANCE(거버넌스 3종 회수) |
| **균형 검증** | `차변 = 대변` 항등식 확인, diff 불일치 시 경고 |

**RPC**: `fn_bean_revenue_summary(sql/079)` — 항목별(구독·번역·AI·생성·부스트·입장·스티커·뱃지) 0 포함 전체 라인업 + 합계

### 19.2 매출 분석 대시보드 — 2층위 분리

**목표**: Pi 현금 수입(충전)과 Bean 토큰 회수 매출을 분리하여 수익 구조 투명화

| 매출원 | 단위 | 계산식 |
|---|---|---|
| **① Pi 현금매출** | Pi Coin | ΣCHARGE(사용자→PLATFORM 충전) |
| **② Bean 회수매출** | Bean Token | fn_bean_revenue_summary로 추출 |
| | 구독비 | 구독 갱신 시 Bean 차감 |
| | 번역비 | 건당 1 Bean(비구독자) |
| | AI 한도초과 | 건당 5 Bean |
| | 카페 부스팅 | 7일 50 Bean |
| | 기타(생성·부스트·입장·스티커·뱃지·선물) | 각 항목별 집계 |

### 19.3 사용자 Bean 지갑 관리 개선

| 기능 | 내용 |
|---|---|
| **프로필 Bean 탭** | 전체 거래내역(페이지네이션 + 유형필터) |
| **거래내역 UX** | 날짜 현지시간 표시(시·분·초) + 잔액 변화 |
| **Bean 부족 안내** | 카페 생성 시 Bean 부족 시 `/bean` 충전 링크 제공 |

### 19.4 회계 정합성 수정 (sql/077, sql/085)

#### A. REFUND 거버넌스 역차감 버그 (sql/077)

**문제**: fn_bean_apply의 REFUND 처리 시, 거버넌스 지갑에서 역차감이 누락되어 발행 = 유통 + 회수 항등식이 깨짐

**수정**: 거버넌스 역차감 로직 추가 (70:20:10 분배)
- 사용자 지갑에 Bean 복구
- 거버넌스에서 역차감 (충전 당시 70:20:10으로 배분한 것 되돌림)

**누적 보정**: 기존 불일치분을 멱등 수정하여 항등식 회복

#### B. sys_user FK 임베디드 조인 버그 6곳 수정

**문제**: PostgREST의 `sys_user!inner(...)` 조인이 FK 제약 부재로 항상 실패 → 빈 데이터 반환

**영향받은 6곳**:
1. 거래내역·지갑 화면 (사용자 이름 미표시)
2. 카페멤버 패널
3. 이벤트 완료자 목록
4. Pi보상 트래킹
5. Top10 랭킹
6. 음성 참가자 목록

**수정 방식**: FK 조인 제거 → 별도 병합 처리로 데이터 정합성 확보

#### C. 정산 자국통화 원자화 (sql/074)

**개선**: 오프라인 매장 등록 시점의 환율을 고정하여 이후 정산 시 원가 인상 방지

### 19.5 카페방 선물 — Pi결제 → Bean P2P 전송 (sql/078)

**목표**: 사용자 간 직접 Bean 전송으로 카페 활성화 (선물=응원 문화)

#### 핵심 설계

| 항목 | 내용 |
|---|---|
| **전송 함수** | `fn_bean_transfer(USER→USER, 원자적, 거버넌스 무회수)` — 항등식 불변 |
| **금액 프리셋** | 10/50/100 Bean (= 0.1/0.5/1π 감각) |
| **권한 게이트** | canTip 제거 — 자기 Bean 보내는 P2P라 구독 불요, 모든 사용자 허용 |
| **UX** | 메시지 탭 → 선물 버튼(hover 의존 제거) → 금액 팝업 → 확인 다이얼로그 |
| **브라우저 제약** | window.Pi 불필요 — 일반 브라우저도 가능 |

### 19.6 신규 매출원 4종

#### 1. 자동번역 건당 과금 (TRANSLATE_ONCE, 1 Bean)

| 항목 | 내용 |
|---|---|
| 대상 | 비구독자(tier=FREE) |
| 동작 | 번역 전 확인(confirm) 필수, 동의 후 Bean 자동 차감 |
| 캐시 | 동일 메시지→locale 조합은 무료(기존 번역 캐시 재사용) |
| 구독자 | TRANSLATE 구독 시에도 자동번역 무료 사용 가능(canAutoTranslate 기준 수정) |

#### 2. AI 한도초과 추가 과금 (AI_EXTRA, 5 Bean)

| 항목 | 내용 |
|---|---|
| 대상 | @ai 월 한도 초과 사용자 |
| 동작 | 초과 건당 5 Bean 추가 차감 → 한도 회복 |
| 구독자 | 구독 중이면 무제한 사용 가능 |

#### 3. 카페 부스팅 (ROOM_BOOST, 7일 50 Bean) (sql/080)

| 항목 | 내용 |
|---|---|
| 목표 | 카페 방장의 공개목록 상단 노출 권 판매 |
| 금액 | 7일 50 Bean(= 0.5π) |
| 갱신 | 만료 후 연장 가능(누적 가능) |
| UI | 방 설정 → 부스팅 버튼 → 구매 다이얼로그 |

#### 4. 프로모션 Bean 발행 (sql/081, fn_bean_mint)

| 항목 | 내용 |
|---|---|
| 용도 | 캠페인 보조금성 발행(현금 없이 Bean 추가) |
| 회계 | 대차대조표 발행=ΣCHARGE+Σmint로 확장 |
| 명목 | 판촉비(재무제표 항목) |
| 관리 | 관리자 발행 UI (`/admin/token/mint`) |
| 추적 | `bean_mint_log` 테이블로 이력 기록 |

### 19.7 매장 온보딩 캠페인 (sql/082~084, fn_bean_campaign_grant)

**목표**: 초기 PyShopâ¢ 판매자 100명 선착순 확보 + 1차 인센티브 배분

#### 자격 조건

| 항목 | 기준 |
|---|---|
| 매장 가입 | 필수 |
| 상품 최소 1개 등록 | 필수 |
| Telegram 연동 | 필수 |
| 오픈 미션 N개 완료 | 현재 0 = 면제 |

#### 지급 절차

```
자격 확인 → 신청 (PENDING) → 관리자 승인 (자동지급 금지) → 지급 (1차 10,000 Bean)
```

#### 규모

- **선착순**: 100매장
- **1차 지급액**: 매점당 10,000 Bean
- **재원**: REWARD_POOL 발행 100만 Bean 완료
- **API**: 
  - `POST /api/campaign/apply` — 신청 (자격 확인)
  - `POST /api/admin/campaign/approve` — 관리자 승인 + 지급
  - `POST /api/admin/campaign/reject` — 거절
- **화면**:
  - `/campaign` — 판매자용 신청 화면
  - `/admin/campaign` — 관리자용 승인 화면

### 19.8 기타 UX·정책 개선

| 항목 | 내용 |
|---|---|
| **Bean 시각표현** | BeanIcon 통일, 콩 이모지 전면 금지 + PreToolUse 차단 hook |
| **자동번역 게이트** | TRANSLATE 단독 구독자(tier=FREE) 도 canAutoTranslate 기준으로 자동번역 사용 가능 |
| **Bean 부족 안내** | 카페 생성 후 Bean 부족 시 `/bean` 링크 제공 |
| **우하단 알림 버튼** | "주문알림 ON/OFF" 버튼 제거(Telegram 경로 유지) |

### 19.9 관련 RPC 및 SQL 마이그레이션

| Task | SQL | 내용 | 상태 |
|---|---|---|---|
| REFUND 회계 버그 | sql/077 | fn_bean_apply REFUND 거버넌스 역차감 추가 | 진행 중 |
| 정산 자국통화 | sql/074 | 오프라인 매장 환율 고정 원자화 | 완료(재적용) |
| Bean 전송 | sql/078 | fn_bean_transfer (USER→USER 원자) | 진행 중 |
| 카페 부스팅 | sql/080 | `cafe_room_boost` 테이블 + RPC | 진행 중 |
| 프로모션 발행 | sql/081 | `bean_mint_log` 테이블 | 진행 중 |
| 캠페인 신청 | sql/082 | `bean_campaign_application` 테이블 | 진행 중 |
| 캠페인 승인 | sql/083 | `fn_bean_campaign_grant` RPC | 진행 중 |
| 매장 온보딩 | sql/084 | 캠페인 자격 검증 시스템 | 진행 중 |
| 매출 요약 | sql/079 | `fn_bean_revenue_summary` RPC | 진행 중 |

---

## 20. Phase 20 — 화면 성능 최적화 (6개 탭 전수 진단 · PRD_18_PERFORM, 2026-06-23)

> cafe.pi 6개 주요 탭(home·event·cafe·shop·map·admin)의 성능을 전수 진단하고, 사용자 체감 성능(Core Web Vitals)을 개선하기 위한 3단계 로드맵. 북극성 지표가 **활성 사용자 수(DAU)**이고 HOME 탭이 첫 진입 화면이므로, 탭 성능은 신뢰도·이탈률에 직결된다. 정본: `docs/PRD_18_PERFORM.md`

### 20.1 목표 (Core Web Vitals)

| 지표 | 목표 | 현재(추정) | 개선율 |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | < 2.5s | 1.2~5s | -50% |
| **INP** (Interaction to Next Paint) | < 200ms | 200~500ms | -60% |
| **CLS** (Cumulative Layout Shift) | < 0.1 | 0.05~0.15 | 안정화 |
| **번들 크기** | < 500KB | 600~800KB | -30% |

### 20.2 탭별 진단 요약 (CRITICAL 4 · HIGH 15 · MEDIUM 18 = 37건)

| 탭 | C | H | M | 핵심 병목 |
|---|---|---|---|---|
| HOME | 0 | 3 | 6 | 매출 `LazySection` rootMargin 과도(bean-revenue RPC 조기호출)·`BeanTopSpenders` 캐싱 부재 |
| EVENT | 0 | 3 | 2 | 미션 평가 피드백 미흡(중복 클릭)·M2 kakao_id 검증·랭킹 쿼리 메모리 비효율 |
| CAFE | 1 | 2 | 3 | 🔴 Pi Browser WebSocket 미검증(polling 폴백 없음)·메시지 메모이제이션 부재 |
| SHOP | 2 | 2 | 2 | 🔴 `ItemCard` memo 미흡·🔴 Pi 결제 `window.Pi` 선검증 미확인·중복 API 호출 |
| MAP | 1 | 2 | 2 | 🔴 마커 클러스터링 미구현(100+ 마커 렉)·마커 재렌더링·Places API 중복 |
| ADMIN | 0 | 3 | 3 | 결제 내역 클라이언트 페이지네이션(메모리 오버로드)·표준단어 캐싱 부재 |

> 검증 완료(양호): MAP `latd_crd/lngt_crd` 마이그레이션(sql/037)·Pi Browser Geolocation·ADMIN 3중 권한 인증·`approval_queue` 의도적 비활성·FK 없는 임베디드 조인 미사용.

### 20.3 공통 병목 패턴 및 예방책

| 패턴 | 발생 탭 | 예방책 |
|---|---|---|
| 메모이제이션 미흡 | HOME·CAFE·SHOP | `memo` + `useMemo` + `useCallback` |
| 캐싱 전략 부재 | HOME·SHOP·ADMIN | `unstable_cache`·localStorage SWR·`Cache-Control` |
| N+1 쿼리 | EVENT·ADMIN | 배치 조회(`.in()`)·GROUP BY·단일 RPC |
| 중복 API 호출 | SHOP·EVENT | debounce(200~300ms)·의존성 배열 엄격화 |
| 폴링 오버헤드 | EVENT·CAFE | WebSocket 우선·polling은 폴백만 |

### 20.4 구현 로드맵 (3주 · 38시간)

- **Phase 1 (CRITICAL, ~10h)**: HOME LazySection·로깅 / EVENT 미션 평가 피드백 / CAFE WebSocket 검증+polling 폴백 / SHOP ItemCard memo·debounce·Pi 결제 검증 / MAP 마커 클러스터링
- **Phase 2 (HIGH, ~16h)**: BeanTopSpenders SWR·M2 kakao_id 검증·랭킹 쿼리 최적화·메시지 메모이제이션·Suspense 스켈레톤·번역 API 폴백·GPS 권한 캐싱·이미지 최적화·결제 내역 서버 페이지네이션
- **Phase 3 (MEDIUM, ~12h)**: bean-daily-chart period 전달·Plotly config·캠페인 페이지네이션·카테고리 캐시 헤더·마커 재렌더링·Places API 제거·표준단어 캐싱·다국어 통계 동시성 제한

### 20.5 Phase 1 즉시개선 적용 현황 (2026-06-23)

| 탭 | 개선 | 효과 | 상태 |
|---|---|---|---|
| HOME | 매출 `LazySection` rootMargin 200→50px + aggregate 실패 `console.warn` | bean-revenue RPC 조기호출 -20~40%, 집계 실패 추적 가능 | ✅ 적용 |
| EVENT | 관리자 미션 재평가 중복클릭 가드 + 실패 `alert` 피드백 | 중복 평가 방지(신뢰 직결)·조용한 실패 제거 | ✅ 적용 |
| SHOP | `ItemCard` `memo` 화 | 검색·필터·정렬 시 변하지 않은 카드 리렌더 -30% | ✅ 적용 |

> 잔여 CRITICAL: CAFE WebSocket 폴백·SHOP Pi 결제 `window.Pi` 가드·MAP 마커 클러스터링 → 후속 착수.

### 20.6 비기능 요구사항 (Pi Browser 제약 준수)

- Pi 결제는 Pi Browser 전용 — 결제 진입 전 `window.Pi` 선검사 가드(최우선)
- 모든 보호 API는 `X-Pi-Token` 헤더 경로 지원(`piFetch`)·쿠키 비의존
- `getSessionUser()` null 시 `redirect` 금지 → 클라이언트 게이트(무한 루프 방지)
- 모든 변경은 **Pi Browser 실기기 검증** 후 완료 간주

---

## 21. Phase 21 — 보안 강화 (KISA 21개 + DDoS 5계층, 2026-06-23)

> **정본 보안 문서**: `docs/PRD_2_SECURITY.md` (v1.0 · KISA 21개 항목) · `docs/SECURITY_DDOS_POLICY.md` (DDoS 방어 정책)

### 21.1 적용 기준 및 현황

KISA 행정안전부 21개 웹 취약점 분석·평가 방법 기준 적용 (Next.js 16 + Supabase + Pi Browser 환경).

**KISA 21개 항목 현황** (상세: `docs/PRD_2_SECURITY.md`):

| 항목 | 설명 | 현황 |
|---|---|---|
| OC | 운영체제 명령 인젝션 | ✅ 양호 — 외부 명령 미사용 |
| SQ | SQL 인젝션 | ✅ 양호 — Supabase 파라미터 바인딩 |
| XP | XPath 인젝션 | ✅ 양호 — XML/XPath 미사용 |
| XS | 크로스 사이트 스크립팅(XSS) | ✅ 양호 — React JSX 자동 이스케이프 + CSP |
| MC | LDAP 인젝션 | ➖ 해당없음 — LDAP 미사용 |
| WP/WA | 파일 업로드·다운로드 | 🔍 추가확인 — 확장자·MIME 검증 강화 필요 |
| WR | 불충분한 인가 처리 | ✅ 양호 — `isAdmin()` + SERVICE_ROLE |
| CS | CSRF | ✅ 양호 — HMAC 서명 + `withAuthGuard` cross-origin 차단 |
| SP | HTTP 응답 분할 | ✅ 양호 — Next.js 내장 처리 |
| WI | 경로 탐색(Path Traversal) | ✅ 양호 — `import 'server-only'`·경로 파라미터 검증 |
| IE | 정보 누출 | 🔍 추가확인 — 에러 메시지 모니터링 강화 필요 |
| SF | 세션 고정(Session Fixation) | ✅ 양호 — 로그인 시 신규 HMAC 토큰 발급 |
| AA | 불충분한 인증 처리 | ✅ 양호 — Pi + Google 이중 경로, `getSessionUser()` 통합 |
| PV | 비밀번호 복잡도 미준수 | ➖ 해당없음 — OAuth 전용, 비밀번호 없음 |
| FU/FD | 파일 업로드·다운로드 취약점 | 🔍 추가확인 — Supabase Storage 업로드·공개 URL 정책 |
| IL/DT | 자원 삽입 | ✅ 양호 — 화이트리스트 기반 외부 리소스 |
| DI | 디렉토리 리스팅 | ✅ 양호 — Vercel 정적 디렉토리 리스팅 비활성 |
| AE | 에러 처리 | 🔍 추가확인 — 프로덕션 500 스택트레이스 노출 검토 |
| PL | 악성 콘텐츠 필터링 | 🔍 추가확인 — 채팅·게시판 스캐닝 미비 |
| MS | 메모리 관리 | ✅ 양호 — TypeScript + Next.js GC 위임 |

**요약**: ✅ 양호 13개 / 🔍 추가확인필요 6개 / ➖ 해당없음 2개

### 21.2 DDoS 5계층 방어 아키텍처

> 상세: `docs/SECURITY_DDOS_POLICY.md`

```
계층 1: Vercel Anycast      ─ L3/L4 볼류메트릭 공격 자동 흡수 (자동)
계층 2: Vercel Firewall WAF ─ IP rate limiting · BotID · Geo-block (수동 설정 필요)
계층 3: Next.js Middleware  ─ 악성 UA 차단 + 페이지 rate limiting (src/middleware.ts)
계층 4: API Guard          ─ withGuard/withAuthGuard 엔드포인트 보호 (src/lib/api-guard.ts)
계층 5: Supabase           ─ 연결 풀 + Statement timeout (수동 설정 필요)
```

### 21.3 Rate Limiting 정책 (src/lib/ddos-guard.ts)

| 그룹 | 60초 허용 | 차단 유지 | 래퍼 |
|---|---|---|---|
| `/api/auth/**` | 8건 | 5분 | `withAuthGuard` |
| `/api/payments/**`, `/api/tips/**` | 12건 | 3분 | `withGuard` |
| `/api/admin/**` | 40건 | 1분 | `withGuard` |
| `/api/campaign/**` | 20건 | 2분 | `withGuard` |
| `/api/chat/**` | 30건 | 1분 | `withGuard` |
| 기타 API | 60건 | 30초 | `withGuard` |
| 페이지 라우트 | 120건 | 10초 | middleware |

> **Pi Browser NAT 고려**: 공유 IP → 시간제 차단(5분 max), `Retry-After` 헤더 필수, 영구 차단 금지

### 21.4 구현 완료 파일 (2026-06-23)

| 파일 | 설명 |
|---|---|
| `src/lib/ddos-guard.ts` | Rate limiting 엔진 · 봇 UA 차단 · 보안 헤더 · IP 추출 |
| `src/lib/api-guard.ts` | `withGuard()` / `withAuthGuard()` API 라우트 래퍼 |
| `src/middleware.ts` | 봇 차단 + rate limiting + 보안 헤더 (페이지 라우트) |
| `vercel.json` | 전역 보안 헤더 (HSTS · X-Frame-Options · X-Content-Type · CSP) |
| `src/app/api/auth/pi/route.ts` | `withAuthGuard` 적용 |
| `src/app/api/payments/approve/route.ts` | `withGuard` 적용 |

### 21.5 보안 헤더 (vercel.json + middleware 이중 적용)

| 헤더 | 값 | 목적 |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS 강제 2년 |
| `X-Content-Type-Options` | `nosniff` | MIME 스니핑 방지 |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking 방지 |
| `Content-Security-Policy` | `script-src ... *.minepi.com` | XSS 방지 + Pi Browser SDK 허용 |
| `Permissions-Policy` | `camera=(), microphone=(self)` | 불필요한 브라우저 권한 차단 |

### 21.6 수동 설정 잔여 (아나킨 마스터 직접)

| 설정 | 위치 | 긴급도 |
|---|---|---|
| Vercel WAF 활성화 | Vercel Dashboard → Security → Firewall | 🔴 즉시 |
| Vercel BotID 활성화 | Vercel Dashboard → Security → Bot Protection | 🔴 즉시 |
| Supabase Statement Timeout | Supabase SQL Editor: `ALTER DATABASE SET statement_timeout='30s'` | 🟠 7일 내 |
| 세션 블랙리스트 (`pi_session_revoked`) | 신규 SQL + `getSessionUser()` 연동 | 🟡 30일 내 |
| 파일 업로드 검증 강화 | `/api/board/upload` + Supabase Storage 정책 | 🟡 30일 내 |
| Upstash Redis 분산 rate limiting | Vercel Marketplace 연동 + `ddos-guard.ts` 교체 | 🟢 트래픽 증가 시 |

### 21.7 Pi Browser 보안 제약 (절대 훼손 금지)

- **쿠키 미저장**: 보안 구현 변경 시 `X-Pi-Token` 헤더 경로 반드시 유지
- **CSP**: `*.minepi.com` 반드시 허용 (Pi SDK 로드 차단 방지)
- **클라이언트 게이트 패턴**: `getSessionUser()` null 시 `redirect` 절대 금지 (Pi Browser 무한 루프)
- **rate limiting**: 시간제 차단만 허용, IP 영구 차단 금지 (Pi Browser NAT 공유)

---

## 22. Phase 22 — 데이터 분석 & 시각화 (4-탭 통합 분석 페이지, PRD_21_DATA_ANAL) 📝 기획

> 정본: `docs/PRD_21_DATA_ANAL.md` (v1.1). 기존 통계 인프라(`stat_actvty_dly`·`stat_revenue_dly`·`fn_build_daily_stats`·Plotly 차트 6종·stats API 7종)를 **확장**하는 분석 고도화 계획.

### 22.1 범위

6개 분석 도메인을 **사용자 요청 4개 대분류 탭**으로 재편한 단일 분석 허브 `/admin/analytics`(기존 `/admin/stats` 흡수):

1. **매출 분석** — Pi 현금매출 vs Bean 회수매출 2층위, 일/주/월/분기, 테마·카테고리 분해, Z-차트·이동평균·YoY·ABC
2. **주문 분석** — 객단가(AOV)·취소/재구매율·주문간격 히스토그램·RFM 세그먼트·장바구니 연관
3. **웹 접속·사용 분석** — DAU/WAU/MAU·고착도·신규/재방문·리텐션 코호트·지역 지도
4. **웹 퍼포먼스 분석** — 전환 퍼널(방문→가입→첫주문→재구매)·채널 기여·반송/이탈·체류시간 ⚠️ 세션 추적층 선결

### 22.2 핵심 결정

- **북극성(활성 사용자) 최우선**: 모든 탭 상단에 MAU·고착도 고정 배너(판매는 수단).
- **2층위 통화 분리**: Pi(외부 현금 유입)와 Bean(내부 순환 회수) 합산 금지 — 별도 계열.
- **재사용 우선**: 매출 3종 차트·DAU/WAU/MAU 차트·activity/revenue API는 기존 자산 활용. 주문·퍼널·코호트만 신규.
- **4-Zone 공통 레이아웃**(KPI 카드 → 메인 차트 → 보조 2-up → 상세 테이블)으로 전 탭 일관.
- **시각화 표준**: Plotly(`PlotlyPlot` 래퍼)·테마색(`useThemeChartColors`)·다크모드·반응형·CSV/PNG 내보내기.

### 22.3 신규 제안 스키마 (DA 표준, git-only → 마스터 staging→운영)

| SQL | 테이블 | 용도 | 선결조건 |
|---|---|---|---|
| sql/122 | `stat_cohort_retention` | 코호트 리텐션 히트맵 | 없음 (즉시 가능) |
| sql/123 | `stat_rfm_segment` | RFM 세그먼테이션 | 없음 (즉시 가능) |
| sql/124 | `stat_session_pageview` | 웹 성능(PV·체류·반송) | 세션 추적 필드 신설 |
| sql/125 | `stat_channel_funnel` | 전환 퍼널·채널 기여 | 채널 분류 코드 확정 |

### 22.4 구현 로드맵 (PRD_21 §7)

- Phase 2: 기존 대시보드 강화(매출 탭 Z-차트·YoY) — 즉시
- Phase 3: 주문 분석 + 코호트·RFM(sql/122~123) — 즉시
- Phase 4~6: 웹 퍼포먼스·채널·지리 — 데이터 추적층/Google Maps 선결 조건부

### 22.5 라우트·컴포넌트

- `src/app/[locale]/(admin)/admin/analytics/page.tsx`(탭 컨테이너) + 탭별 클라이언트 4종(`RevenueTab`·`OrderTab`·`UsageTab`·`PerformanceTab`)
- `admin-sidebar.tsx` NAV: `/admin/stats` → `/admin/analytics` 교체
- Pi Browser admin 호환: `piFetch` + 클라이언트 게이트(redirect 금지)

---

## 23. 환경변수 전체 목록

| 변수명 | Phase | 용도 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 0 | 앱 URL |
| `PI_SESSION_SECRET` | 1 | HMAC 세션 서명 (32자+) |
| `NEXT_PUBLIC_PI_SANDBOX` | 1 | Pi 샌드박스 모드 |
| `PI_API_KEY` | 1 | Pi 결제 API 키 |
| `AUTH_SECRET` | 2 | NextAuth.js 서명 시크릿 |
| `GOOGLE_CLIENT_ID` | 2 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | 2 | Google OAuth Client Secret |
| `NEXT_PUBLIC_SUPABASE_URL` | 2 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2 | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 | Supabase Service Role (서버 전용) |
| `GEMINI_API_KEY` | 6, 12 | Gemini AI 번역 (Phase 6 다국어 + Phase 12 PyTranslateâ¢™ 주력 엔진) |
| `RESEND_API_KEY` | 6 | 결제 영수증 이메일 발송 |
| `ANTHROPIC_API_KEY` | 7 | Claude AI 카페 비서 (Phase 7 신규) · PyTranslateâ¢™ fallback (Phase 12) |
| `CRON_SECRET` | 11, 16 | Vercel Cron 인증 (통계 집계 + 이벤트 미션 재평가 안전망 cron). **프로덕션 필수 강제**(미설정 시 무인증 호출 차단, `d9f0f78`) |
| `GOOGLE_MAPS_API_KEY` | 15 | Google Maps Geocoding·Reverse Geocoding·Places API (서버 전용, 클라이언트 노출 금지) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 15 | Google Maps JavaScript API (클라이언트 지도 뷰 — Phase 15 P1) |

---

## 24. 디렉토리 구조

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (admin)/admin/
│   │   │   ├── page.tsx            # /admin 대시보드
│   │   │   ├── users/              # 사용자 관리
│   │   │   ├── payments/           # 결제 내역
│   │   │   ├── links/              # 연동 현황
│   │   │   ├── board/              # 게시판 관리
│   │   │   ├── std/                # 데이터 표준
│   │   │   ├── i18n/               # 다국어 관리
│   │   │   └── chat/               # 카페 관리 (Phase 7~9)
│   │   ├── board/                  # 게시판
│   │   ├── link/                   # Pi·Google 계정 연동
│   │   ├── profile/                # 마이페이지 (Phase 10)
│   │   │   └── _components/        # profile-tabs, profile-form, payment-history, subscription-status, client-profile-gate
│   │   ├── chat/                   # 카페 홈 — 테마 탐색 (Phase 7~9)
│   │   │   └── [roomId]/           # 카페
│   │   ├── store/                  # MPS 마켓플레이스 (Phase 13)
│   │   │   ├── page.tsx            # 상품 목록·검색 (SCR-01)
│   │   │   ├── [itemId]/           # 상품 상세 (SCR-02)
│   │   │   └── my/
│   │   │       ├── items/          # 내 상품 관리 (SCR-03·04)
│   │   │       ├── sales/          # 주문 관리 — 판매자 (SCR-05)
│   │   │       ├── orders/         # 주문 관리 — 구매자 (SCR-06)
│   │   │       ├── history/        # 거래 내역 (SCR-07)
│   │   │       └── shops/          # 매장 관리 (SCR-08)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── board/
│   │   ├── payments/               # Pi 결제 (approve/complete) — 카페 결제도 공유
│   │   ├── chat/                   # 카페 API (Phase 7~9)
│   │   ├── profile/                # 프로필 API (Phase 10)
│   │   ├── subscriptions/          # 구독 API (Phase 7~9)
│   │   ├── stickers/               # 스티커 API (Phase 8)
│   │   ├── tips/                   # Pi Tip API (Phase 8)
│   │   └── store/                  # MPS API (Phase 13)
│   │       ├── items/              # 상품 CRUD
│   │       ├── shops/              # 매장 CRUD
│   │       ├── orders/             # 주문 생성·취소·완료 확인
│   │       ├── my/history/         # 거래 내역 조회
│   │       └── payments/           # Pi 결제 콜백 (approve/complete)
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── admin/
│   ├── layout/
│   ├── ui/
│   └── chat/                       # 카페 UI 컴포넌트 (Phase 7~9)
│       ├── theme-selector.tsx      # 테마 선택 (카페 생성 Step 1)
│       ├── chat-room-list.tsx
│       ├── chat-message-list.tsx
│       ├── chat-input.tsx
│       ├── sticker-picker.tsx
│       ├── pi-tip-button.tsx
│       ├── subscription-gate.tsx
│       └── inline-purchase-prompt.tsx
├── hooks/
│   └── use-chat-room.ts            # Supabase Realtime 구독 훅 (Phase 7~9, 12 확장)
├── i18n/
│   ├── routing.ts
│   └── request.ts
├── lib/
│   ├── auth-check.ts
│   ├── board.ts
│   ├── chat-auth.ts                # 구독 등급 체크 헬퍼 (Phase 7~9)
│   ├── chat.ts                     # 카페 CRUD 헬퍼 (Phase 7~9)
│   ├── chat-ai-prompts.ts          # 테마별 AI 시스템 프롬프트 (Phase 7~9)
│   ├── chat-translate.ts           # Gemini Flash + Claude Haiku fallback 번역 (Phase 12)
│   ├── chat-translate-dedup.ts     # in-memory pending map 동시성 처리 (Phase 12)
│   ├── activity-log.ts             # 사용자 활동 계측 UPSERT (Phase 11)
│   ├── plotly-theme.ts             # Plotly 다크모드 layout 프리셋 (Phase 11)
│   ├── mps-item.ts                 # 상품 CRUD + 원자적 재고 차감 (Phase 13)
│   ├── mps-order.ts                # 주문 상태 관리 + 에스크로 흐름 (Phase 13)
│   ├── mps-shop.ts                 # 매장 CRUD (Phase 13)
│   ├── locale-currency.ts
│   ├── locale-country.ts
│   ├── supabase-admin.ts
│   ├── users.ts
│   └── utils.ts
├── messages/
├── types/
│   ├── next-auth.d.ts
│   └── pi-session.ts
├── auth.ts
└── env.ts
```

---

## 25. DB 테이블 현황

### 기존 테이블 (Phase 0~6)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user | 사용자 (Pi + Google 통합) — Phase 10에서 프로필 컬럼 5개 추가 예정 (`014_user_profile_columns.sql`) |
| public | pi_pymnt | Pi 결제 내역 |
| public | auth_link_cd | Pi·Google 연동 OTP 코드 |
| public | brd_ctgr/post/cmnt/attch | 게시판 |
| public | std_dic/dom/term | 데이터 표준 |
| public | std_audit_log | 변경 이력 |
| public | approval_queue | 승인 워크플로우 |
| public | i18n_locale | 활성 언어 목록 |
| public | i18n_message | DB 번역 관리 |
| public | i18n_cntry_mst | 국가 마스터 |

### 신규 테이블 (Phase 7~9 — `msg_` 접두사)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | msg_theme | 테마 마스터 (20개+) |
| public | msg_theme_stkr | 테마 기본 스티커 매핑 |
| public | msg_room | 카페 |
| public | msg_room_mbr | 카페 멤버 |
| public | msg_msg | 메시지 |
| public | msg_msg_reac | 메시지 이모지 반응 |
| public | msg_attch | 카페 첨부파일 |
| public | msg_subscr_plan | 구독 플랜 정의 |
| public | msg_subscr | 사용자 구독 현황 |
| public | msg_stkr_pack | 스티커 팩 |
| public | msg_stkr | 스티커 개별 항목 |
| public | msg_usr_stkr | 사용자 보유 스티커 |
| public | msg_tip | Pi Bean 내역 (구 Tip — 2026-06-12 Bean 리브랜딩, 테이블명·분류코드 PI_TIP은 호환성 유지) |

### 신규 테이블 (Phase 11 — 통계 대시보드)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user_actvty_log | 사용자 활동 원천 로그 (`UNIQUE(usr_id, actvty_dt)`, DAU/WAU/MAU 산출) — `sql/015` |
| public | stat_actvty_dly | 일별 활동 중간집계 (DAU/WAU/MAU 사전 계산) — `sql/016` |
| public | stat_revenue_dly | 일별 × 테마별 매출 중간집계 (PK `stat_dt, theme_cd`) — `sql/016` |

### 신규 테이블 (Phase 12 — PyTranslateâ¢™)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | msg_trans | 번역 캐시 (`UNIQUE(msg_id, locale_cd)`) — On-demand 번역 결과 저장, 같은 조합 1회만 번역 — `sql/018` |

> **Phase 12 컬럼 추가**: `msg_msg.src_lang_cd VARCHAR(20)` — 원본 언어 코드 (Gemini Flash 감지) — `sql/018`

### 신규 테이블 (Phase 13 — PyShopâ¢ MPS, `mps_` 접두사)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | mps_ctgr | 상품 카테고리 (2단계 계층, `parent_ctgr_id` 자기 참조) |
| public | mps_shop | 판매자 매장 (ONLINE/OFFLINE/BOTH, `lat`·`lng`·`place_id` Google Maps 확장 포인트) |
| public | mps_item | 상품 (`reg_qty`·`ordered_qty`·`stock_qty` 삼위일체, `stock_qty = reg_qty - ordered_qty` CHECK 제약) |
| public | mps_item_img | 상품 이미지 (최대 5장, 썸네일 지정, `sort_ord`) |
| public | mps_order | 주문 (`escrow_txid`·`release_txid`·`cancel_req_id`·`order_st_cd` 상태 머신) |
| public | mps_txn_hist | 거래 이력 (ESCROW_IN/RELEASE_OUT/AUTO_RELEASE/REFUND/FEE) |

> **코드 도메인**: `item_cnd_cd`(NEW/USED/HANDMADE), `item_st_cd`(DRAFT/OPEN/CLOSED/SOLD), `order_st_cd`(PENDING/ESCROW/TRADING/SELLER_DONE/BUYER_DONE/DONE/CANCELLED **+ 오프라인: ORDERED/PREPARING/READY**), `shop_type_cd`(ONLINE/OFFLINE/BOTH), `order_mthd_cd`(DINE_IN/PICKUP/DELIVERY), `verify_method_cd`(GPS/DOC/PHONE/MATCH)
> **DA 표준**: `mps_` 접두사 신규 주제영역 등록, 시스템 컬럼 4개 필수, 논리삭제 적용
> **Phase 3 O2O 컬럼 추가(`sql/050~060`)**: mps_shop(`owner_verified_yn`·`verify_method_cd`·`verify_dtm`·`owner_nm`·`dlvr_yn`·`google_nm`·`website_url`·`gmap_url`·`biz_status_cd`·`rating_cnt`·`google_place_json` JSONB), mps_order(`order_mthd_cd`·`dlvr_addr`·`ready_dtm`). place_id 부분 유니크(검증 매장 1주인). 상세 §15.8

### 신규 테이블 (Phase 15 — LBS 위치기반서비스)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user_consent | 사용자 동의 이력 — `consent_tp_cd`('LBS'/'MKT'/'PUSH'), 6개월 보관 의무 (위치정보법 제16조) |
| public | usr_loc_hist | 위치 수집 이력 — `loc_tp_cd`('01'가입/'02'로그인/'04'상품), `lat DECIMAL(10,8)`, `lng DECIMAL(11,8)`, `ref_id` |

> **sys_user 컬럼 추가**: `lbs_consent_yn CHAR(1) DEFAULT 'N'`, `lbs_consent_dtm TIMESTAMPTZ`, `lbs_consent_ver TEXT` — `sql/033_lbs.sql`
> **설계 결정**: 매장 위치(`loc_tp_cd='03'`)는 `mps_shop.lat/lng` 재활용 — 이중 저장 금지
> **DA 표준**: 시스템 컬럼 4개 + `del_yn`/`del_dtm` 논리삭제, `-- DA-APPROVED:` 주석 필수

### 신규 테이블 (Phase 14 — PyVoice™ N:N 음성채널)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | msg_call_log | 통화 세션 메타 (room 레벨 — 첫 입장 시 시작, 마지막 퇴장 시 종료, `end_rsn_cd`) — `sql/028`+`032` |
| public | msg_call_participant | 음성채널 참여자 (`mic_yn` 마이크 상태, `join_dtm`/`leave_dtm`, 활성 중복 입장 차단 unique) — `sql/032` |
| public | msg_call_quality_stat | 통화 품질 메트릭 (`rtt_ms`·`packet_loss_pct`·`jitter_ms`·`relay_yn`, room+usr upsert) — `sql/028`+`032` |

> **v2.0 전환**: 1:1 caller/callee 구조 폐기 → N:N room 레벨. RLS 활성화(서버 service role만 접근)

---

## 26. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v12.7 | 2026-07-01 | **P2P 채팅 텔레그램 알림·봇 릴레이 + 직거래 문의방 정밀 정의 (`docs/PRD_13_MSG.md` §18)** — ① **P2P 채팅 알림·릴레이**(당근 앱푸시 대체): 하이브리드(앱 내 DM `msg_room` D + 텔레그램 미러 45초지연·미읽음게이트·인용답장 릴레이)·sql/152(`noti_tp_cd` 통합·`msg_tlgm_out`·`cur_relay_room_id`)·"판매자에게 문의" 진입 UI(상품상세·주문관리 양방향, `/api/chat/rooms` 재사용)·번역 21 locale. ② **직거래 문의방** 정밀 정의: 당사자2명 전용·이름 '직거래 문의'·🤝 DIRECT 전용테마(sql/158·`use_yn='N'`)·12h `expr_dtm` 자동만기+🗑️수동만기·상품별 분리(`msg_room.item_id` sql/160·같은판매자 다른상품=별도방·`room_desc` 상품명)·"내 카페" 최상단 별도분류(`theme_tp_cd='DIRECT'` sql/159·직거래>구독>일반)·선물(Bean/Pi) 금지(3계층 차단). ③ **관리자 빠른메뉴**(`sys_quick_menu` sql/157). 기능 현황 #38~40 추가. staging+운영 DB(sql/152·157~160)+코드 전량 배포(promote). 커밋 bb24fd4~3e9c722. | asoká |
| v12.6 | 2026-06-29~30 | **이중 요금제(BEAN/PI) 완성·운영 PI모드 전환 + 오픈기념 무료요금 OneKey + 매장별 Telegram 알림** — ① **이중 요금제 런타임 스위칭**(`docs/PRD_24_FEES_STRATAGE.md`): 메인넷 A-5 대응 `fee_mode_config(BEAN/PI)` 전환(`/admin/fee-mode`). PI=진짜 Pi 직결제(window.Pi→pi_pymnt). 카페생성·이벤트방·스티커·선물(P2P)·구독 Pi 직결제 전환(sql/140~148)·마이크로요금(입장·번역·AI·배지·부스팅) PI 무료화·후기보상 매장주 보증금 게이트+PI A2U 송금(sql/144 cron)·대시보드 Pi 통계(sql/147). **운영 fee_mode=PI 전환 완료(2026-06-30) — 운영=메인넷 PI모드 운영 중**('메인넷 전 BEAN 유지' 정책 종료). ② **오픈기념 무료요금 OneKey**(`docs/PRD_26_OPEN_PROMO_FEE.md`): `promo_fee_config` 단일 토글로 9개 요금 0 오버라이드(정상요금 보존)·`promo_end_dtm` 자동 종료·`applyPromoGate` 7개 청구경로·그랜드오픈 배너·번역 일일 무료한도. **활성 2026-06-30~2026-07-31 KST(sql/149)**. ③ 매장별 Telegram 주문 알림(sql/148 `mps_shop.tlgm`)+Pi 딥링크 환경별(`pi://<host>`·브리지 `/ko/open`). ④ 메인넷 데이터 클린시작 SQL(testnet 데이터 단일 TRUNCATE). 기능 현황 #36(이중 요금제·Phase 25)·#37(오픈 프로모·Phase 26) 추가. | asoká |
| v12.5 | 2026-06-28~29 | **운영DB 컷오버 완료 + 2단계 배포 파이프라인 완성 + 읽기전용 모드** — 운영DB(ajdwlcqoljkjamostutc·96테이블·59,280행) pg_dump 컷오버(truncate→data-only→`session_replication_role=replica`·센티넬 검증)·SERVICE_ROLE_KEY 함정(service_role 아닌 publishable key 사용 시 sys_user RLS 0행→세션 미인지) 해소. 운영DB 읽기전용 스위치(`SUPABASE_READONLY_MODE`·전용 JWT 발급 스크립트·로그인 세션 유지)·배포 컨트롤 2단 분리(`/admin/deploy` Stage/운영·Staging DB 스위치·진행상태 폴링)·DB 정리(외부 테이블 12종+i18n 레거시 2종 DROP `sql/134`)·DB 연결 라이브 진단 API(`/api/admin/db-health`). 기능 현황 #35 갱신. 정본 `docs/MAINNET_READINESS_CHECKLIST.md`·`docs/PROD_DB_SETUP.md`. | asoká |
| v12.4 | 2026-06-26~27 | **Pi Browser 인증 systemic 복구 + Py 개명 + 관리자 모니터링/체크리스트 화면** — ① Pi Browser 인증 UA 사전차단 사고(8bf8752) 복구(`if(!window.Pi)`만·CLAUDE.md 핵심 규칙 명문화·유일 신뢰 신호=`authenticate()` 성공)·Google 로그인 일반 브라우저 UI 세션 버그 수정(`GET /api/auth/pi` `getSessionUser` 폴백). ② **Pi→Py 공식 브랜드 전환**: 표시 텍스트 PyCafé™/PyShop™/PyTranslate™/PyVoice™/PyChat™(코드값·결제 memo·식별자 원형 유지). ③ 관리자 첫 화면 `/admin/monitor` 변경·메인넷 체크리스트 화면(`/admin/checklist`) 신설·계정 연동 del_yn 토글(`/admin/links` PATCH). 기능 현황 #34(모니터링·Phase 23)·#35(메인넷 전환·Phase 24) 추가. 정본 `docs/PRD_22_MONITOR.md`·`docs/PRD_23_MAINNET_OPEN.md`. | asoká |
| v12.3 | 2026-06-25 | **Phase 22 데이터 분석 & 시각화 (섹션 22 신설 · PRD_21_DATA_ANAL v1.1 수용)** — 기존 통계 인프라(`stat_*_dly`·`fn_build_daily_stats`·Plotly 차트 6종·stats API 7종) 확장. 6개 분석 도메인을 **4-탭 통합 분석 페이지**(매출·주문·접속/사용·퍼포먼스, `/admin/analytics`)로 재편 구상: 북극성(활성 사용자) 최우선 배너·Pi/Bean 2층위 매출 분리·4-Zone 공통 레이아웃·Plotly 표준(`useThemeChartColors`). 신규 집계 제안 sql/122(코호트)·123(RFM) 즉시 / sql/124(세션 PV)·125(퍼널) 추적 선결. 매장주 후기·Bean 보상 동의(`mps_shop.fbck_consent_yn`, sql/117)+후기 평가항목 전체 카테고리 시드(sql/118) 반영. 기능 현황 #33 추가. 섹션 재번호화(22→23 환경변수·23→24 디렉토리·24→25 DB·25→26 변경이력). 정본 `docs/PRD_21_DATA_ANAL.md` §12. | asoka |
| v12.2 | 2026-06-23 | **Phase 21 보안 강화 (섹션 21 신설 · PRD_2_SECURITY + SECURITY_DDOS_POLICY 수용)** — KISA 행정안전부 21개 웹 취약점 적용 현황 수립(✅13·🔍6·➖2) + DDoS 5계층 방어 코드 구현(`src/lib/ddos-guard.ts` rate limiting 엔진·봇 UA 차단·보안 헤더 / `src/lib/api-guard.ts` `withGuard`/`withAuthGuard` 래퍼 / `src/middleware.ts` 통합 / `vercel.json` 보안 헤더) + `/api/auth/pi`·`/api/payments/approve` guard 적용. 잔여: Vercel Firewall/BotID 수동 설정(즉시)·Supabase 타임아웃(7일)·추가확인 6항목·세션 블랙리스트(30일). 기능 현황 #31 추가. 섹션 재번호화(21→22 환경변수·22→23 디렉토리·23→24 DB·24→25 변경이력). 정본 `docs/PRD_2_SECURITY.md` · `docs/SECURITY_DDOS_POLICY.md`. | asoká |
| v12.1 | 2026-06-23 | **Phase 20 화면 성능 최적화 (섹션 20 신설 · PRD_18_PERFORM 수용)** — 6개 탭(home·event·cafe·shop·map·admin) 전수 성능 진단: CRITICAL 4·HIGH 15·MEDIUM 18(총 37건) 식별 + 공통 병목(메모이제이션·캐싱·N+1·중복 API·이미지) 도출 + 3단계 로드맵(38h). **Phase 1 즉시개선 적용**(§20.5): ① HOME 매출 `LazySection` rootMargin 200→50px(bean-revenue RPC 조기호출 -20~40%) + aggregate 실패 `console.warn` 로깅 ② EVENT 관리자 미션 재평가 중복클릭 가드 + 실패 `alert` 피드백(미션 평가=신뢰 직결) ③ SHOP `ItemCard` `memo` 화(검색·필터·정렬 리렌더 -30%). 목표 LCP<2.5s·INP<200ms·번들<500KB. 전체 기능 현황 #30. 섹션 재번호화(20→21 환경변수·21→22 디렉토리·22→23 DB·23→24 변경이력). 정본 `docs/PRD_18_PERFORM.md`. | asoká |
| v12.0 | 2026-06-21 | **Phase 19 Bean Token 경제 가시화 및 회계 정합성 (섹션 19 신설)** — ① **Bean 대차대조표 대시보드**(§19.1, `/admin/token`): 차변(ΣCHARGE+Σmint) = 대변(ΣUSER+ΣGOVERNANCE) T계정 시각화 + `fn_bean_revenue_summary`(sql/079) 항목별 매출 집계. ② **2층위 매출 분석**(§19.2): Pi 현금매출(충전) vs Bean 회수매출(구독·번역·AI·부스팅·기타) 분리. ③ **사용자 Bean 지갑 개선**(§19.3): 프로필 Bean 탭(거래내역 현지시간) + 카페 생성 Bean 부족 시 `/bean` 링크. ④ **회계 정합성 수정**(§19.4): REFUND 거버넌스 역차감 누락 버그(sql/077)·sys_user FK 조인 6곳(별도 병합)·중복 구독함수 오버로드 DROP(sql/085). ⑤ **카페방 선물 Bean P2P**(§19.5, sql/078): fn_bean_transfer(USER→USER, 거버넌스 무회수)·금액 10/50/100 Bean·모든 사용자 허용(canTip 제거)·일반 브라우저 가능. ⑥ **신규 매출원 4종**(§19.6): 자동번역 건당 1 Bean(비구독자 확인)·AI 한도초과 건당 5 Bean·카페 부스팅 7일 50 Bean(sql/080)·프로모션 발행(sql/081, fn_bean_mint). ⑦ **매장 온보딩 캠페인**(§19.7, sql/082~084): 자격(매장가입·상품·Telegram·미션 0면제)·신청→관리자 승인→지급(100매점 선착순 10,000 Bean/점, REWARD_POOL 100만 발행). ⑧ **UX·정책**(§19.8): BeanIcon 통일·자동번역 게이트 TRANSLATE 구독자도 사용가능·주문알림 버튼 제거. 섹션 번호 재정렬(19→20 환경변수, 20→21 디렉토리, 21→22 DB, 22→23 변경이력). | asoká |
| v11.8 | 2026-06-20 | **통합 텍스트 검색 trgm GIN 표준화 + 정산 자국통화 무결성** — ① **3대 검색 통합·표준화**(§1.3 기술 차별화 추가): **백엔드** 카페 pg_trgm GIN(`sql/072`)을 상품·게시판으로 확대(`sql/076`), `.ilike` 자동 가속·코드 0줄로 `%검색어%` 풀스캔 제거. **프론트** 상품·게시판을 카페식 입력 즉시(debounce) 검색으로 통일 + 게시판 전체 통합검색 신규(결과→게시글 딥링크). 카페·상품·게시판이 동일 색인 표준 + 동일 검색 경험으로 수렴(UI 최소 2글자 권장). ② **카페 목록 UX**: '내 카페' 구독/일반 서브섹션 그룹화 + 🔒비공개 배지(공개 디렉토리 미노출 명시) + 전 카페 유효기간/무기한 표시(이벤트방 `entry_expire_dtm`). ③ **정산 자국통화 무결성(돈 양보없음)**: 카트 주문 RPC가 ccy를 라인에만 기록·헤더 NULL → 정산장부 전파 버그를 주문생성 RPC 원자 내장(`sql/074`) + 누락분 소급(소스 실재 건만)으로 해결, RPC 직접호출 실증 검증. ④ 마켓 폐기테마 INNER JOIN 회귀 수정(`sql/075`). `TROUBLESHOOT.md`·`ROADMAP.md`(v10.8) 동기화. | asoká |
| v11.7 | 2026-06-17 | **PyShopâ¢ 카트 다건 일괄 판매 + 자국통화 (PRD_8 v2.1 수용, FR-14·15)** — 전체 기능 현황 #29. ① **등록 페이지 분리**(중고직거래·오프라인매장, `StoreItemForm` mode). ② **자국통화 등록·표시**: 등록시점 1회 환산 고정 참고가(`fx-rates.ts`·`/api/store/price-quote`, ccy 스냅샷 sql/062), 목록·상세 `≈자국통화` 항상표시(시세칩 플래그서 디커플링, 레드라인 #2 정적 가격표만). ③ **오프라인매장 카트**: `useCart`(useSyncExternalStore·localStorage·매장단위)·담기 팝업·장바구니(라인 소계)·**다중상품 단일 Pi 결제**(`mps_order_item`+원자 RPC `fn_mps_cart_order_create`/`_cancel` sql/063, `/api/store/orders/cart`, /complete의 MPS_ESCROW by order_id 재사용, 결제실패 시 라인전체 재고복원). ④ **주문관리 고도화**: 카트 라인(상품명×수량)·판매자 주문자 호명(준비완료 `📣 OOO님 호명`)·구매자 픽업 매장명·판매(앰버)/구매(에메랄드) 색상 구분. ⚠️ sql 062·063 DB적용 + Pi Browser 실기기 결제 검증 필요. `PRD_8_MPS.md` v2.1 동기화. | anakin |
| v11.6 | 2026-06-17 | **Phase 17 BEAN 토큰 발행 기획 추가** — 전체 기능 현황 #28 추가(`docs/PRD_12_TOKEN.md` v1.7 수용). Pi Launchpad 통한 Cafe.pi 생태계 유틸리티 토큰 10억 개 발행 기획: 토큰명 BEAN(기존 Pi Bean 팁 온체인화·`1 Pi=100 BEAN` 리베이스)·세일가 0.01 Pi·분배 세일40/리저브25/유동성15/마케팅12/팀8·발행주체 개인(아나킨)·유동성 BEAN/Pi 단독(레드라인 #2 준수). 잔여 차단: T05 증권성 법무자문·T01 개인 KYC·T02 Launchpad 신청양식(외부 회신 대기). ⚠️ **발행 전 앱 코드 0(문서 전용)** — 레드라인 정책상 PRD_12는 git 비추적 유지. 헤더 토큰 참조·버전 v11.6 갱신. | anakin |
| v11.5 | 2026-06-17 | **이벤트 보상 시스템 전환 — A2U → 1π 판매보증금 적립 + 관리자 수동 지급 (§18.8 신설·§18.3 갱신)** — ① 10미션 완주 실 보상을 Pi A2U 직접 송금(PENDING 리스크)에서 `mps_seller_bond` 보증금 1π 직접 적립으로 전환(`5f5e6b9`·`d540f68`). ② **자동 지급 폐기 → 관리자 수동 버튼** '1Pi 판매보증금 지급' + `POST /api/admin/event/bond-reward`(isAdmin 이중검증), `event.ts` 자동 보상 호출 제거(`a277b80`). ③ **원자적 중복방지** `fn_evt_grant_bond_reward`(`sql/061`) — 단일 트랜잭션 + `FOR UPDATE` 행잠금 + `reward_st_cd`('BONDED'/'PAID') 게이트로 TOCTOU race·A2U-보증금 교차 이중지급 차단, `grantBondReward` RPC 래퍼 교체. ④ 추적 `evt_pi_reward_log`(`sql/048`, `UNIQUE(event_id,user_id)`). ⑤ M3 우회 결함 수정(`premium_cafe_create` 유료테마 게이트로 무료 FITNESS 우회 차단) + 병합 부작용 LBS 블록 중복 제거(`6a648b5`). 전체 기능 현황 #21 갱신. `PRD_11_EVENT.md` v2.1 동기화. | anakin |
| v11.4 | 2026-06-16 | **PyShopâ¢ Phase 3 — O2O 오프라인 매장 커머스 (§15.8 신설)** — ① **구글 카페 반자동 인증 등록**(half-인증: place_id 전체 직접타이핑+복사차단+대소문자, 전화번호 구글 Place Details 서버대조, 현장 GPS≤100m, 매장명·대표자명·주소·이메일 필수입력) + place_id 부분 유니크(한 카페 한 주인) + 구글 Place 전체정보 보관(구조화 5컬럼 + `google_place_json` JSONB) + 매장관리 표시·수정 + ✅인증 배지 + 배달가능 토글. ② **오프라인 주문 상태머신**(주문중→준비중→상품대기중→10분 자동 판매완료, 직거래 TRADING과 분리, `shop_id`로 판정) + 주문방법 3종(매장/픽업/배달+배달위치) + 취소수수료(구매 0.9π/판매 1.1π, 취소 화면 역할 명시로 self-purchase 구분, 구매자취소 보상 미송금) + 상품접수·상품완료 액션. ③ **사장님 보이스 주문알림**(seller 토픽 broadcast → 차임+TTS×3, 전역 리스너). ④ **지도 상품 썸네일 판매**(InfoWindow 영업시간 자리 대체→에스크로) + 카페/음료 카테고리 + 메뉴추가 동선 + 길찾기(구글/카카오/네이버). ⑤ 관리자 본인상품 테스트결제(`p_allow_self`). ⑥ 보안: 상품 `shop_id` IDOR 차단(자동 리뷰 적발). DB `sql/050~060`. ROADMAP v11.0 동기화. | anakin |
| v11.3 | 2026-06-15 | **Jun 15 후속 현행화** — ① **이벤트 평가 엔진 정밀화(`4f623d9`)**: 섹션 18.7 신설 — M2 상태형 양방향 멱등(별명+카톡ID 유무, 미충족 시 완료 취소)·평가엔진 `upsert`→`select`후 `insert`/`update`(부분 unique 회피 + 논리삭제 복구)·SEQUENCE(M10) `del_yn='N'` 필터·`mission_ord` 순 평가·프로필 빈값 저장(빈문자열→null)·관리자 '미션 재평가' 버튼 + `/api/admin/event/reeval`·`CHAR(3)`→`VARCHAR(10)`(sql/046)·`CRON_SECRET` 프로덕션 필수·`voice_join` 트리거 연결. ② **i18n 자동번역 백그라운드화**: 전체 기능 현황 #25 추가(서버 `after()` 전환·번역률 반올림 버그·콤보 캐시 키 v2). ③ 환경변수 `CRON_SECRET` 설명 갱신(Phase 11+16·프로덕션 필수). **후속 권장**: `reevaluateAllActiveUsers` 대상 선정이 행위 로그 기반이라 M2 상태형과 불일치 — 프로필 보유자 UNION 권장. | anakin |
| v11.2 | 2026-06-15 | **Phase 16 이벤트 미션 명칭/순서 현행화** — 섹션 18.2 미션표 M4↔M5 순서 교환(Bean을 M4로·PiBet을 M5로) + M3/M5/M7/M8/M9 PiRC 표기 정비(PiRC1 위치·PiRC2·에스크로서비스;PiRC3). M2 완료 판정에 kakao_id 필수 조건(선물 발송용) 추가. 18.6 운영 현황 갱신(참여 7·완주 1·제외 0·action_log 19). ROADMAP v9.0과 동기화. *(변경이력 행 누락분 소급 기재)* | anakin |
| v11.1 | 2026-06-14 | Phase 12 TASK-090~099 완료 상태 현행화(🔜→✅ 전체). Phase 13 섹션 제목 업데이트(Phase 1+2 완료). MPS 후속 개선 반영 — A2U 자동 환불(MPS_CANCEL_REFUND, 512a4a5·a619378·76e2fb7)·FR-10 ADMIN 게이트 버그 교정(c8829c4)·주문관리 취소 UI(7b2203a)·상품 이미지 업로드(3cd0bc8)·상품 등록 위치 자동수집(23bf3ba). 어드민 대시보드 고도화 — coin360 트리맵(3738ffc)·사용자 관리 통합(b5611bf)·차트 색상 통일(cacba8e)·KST 집계 교정(c46d9c3)·결제내역 개선(6172020). 횡단4차 — 헤더 로고(12118e7)·Pi Bet UI 아코디언(c490fb7)·다국어 기억(d52d7ef)·PyShopâ¢ 브랜드 치환(04c9350)·open redirect 방어(43ab342). 전체 기능 현황 #22~24 추가. 버전 헤더 v11.1·최종 업데이트 2026-06-14 갱신. | anakin |
| v11.0 | 2026-06-14 | Phase 16 이벤트 미션 시스템(Pi 요원 육성) 신규 추가 — 섹션 18 신설(`PRD_11_EVENT.md` v1.2 수용: 10미션 게이미피케이션·미션 완료 멱등 자동감지·화이트리스트·요원 등급 5단계·sum 내림차순 랭킹·관리자 제외 관리·보상 3계층[전원 뱃지/선착순 10명 카카오 선물·M2 카톡ID 발송 연계/Phase2+ Pi A2U]·데이터모델 `evt_mission`·`evt_user_mission`·`evt_exclude`·`evt_gift_log`). 전체 기능 현황 #21 추가. 기존 섹션 18→19(환경변수), 19→20(디렉토리), 20→21(DB), 21→22(변경이력) 재번호화. ⚠️ 확인 필요: 선착순 기준·M10 판정 로직. |
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 |
| v2.0 | 2026-06-05 | Phase 0~3 진행 상황 반영 |
| v3.0 | 2026-06-07 | Phase 4~6 완료 반영. 다국어 아키텍처 상세화. 환경변수·디렉토리 전면 업데이트 |
| v4.0 | 2026-06-07 | Phase 7~9 PyCafé 통합. 섹션 11 신규 추가 (테마 시스템·구독 티어·인라인 트리거·DB 13개·API·Realtime·탈중앙화). Next.js 16·TypeScript 6 업그레이드 반영. `docs/PRD_CHAT.md`에서 핵심 내용 통합 |
| v5.0 | 2026-06-09 | Phase 7 PyCafé MVP 완료 상태 현행화. Phase 10 사용자 프로필 관리(마이페이지) 신규 추가 — 섹션 12 신설(DB 마이그레이션 014·API 명세·컴포넌트 구조·Pi Browser 클라이언트 게이트 패턴). `PRD_USERS.md` 핵심 내용 통합. 섹션 번호 12→13, 13→14, 14→15, 15→16 재정렬. |
| v6.0 | 2026-06-09 | Phase 10 완료 반영. Phase 11 어드민 통계 대시보드(DAU/WAU/MAU·테마별 매출) 신규 추가 — 섹션 13 신설(`PRD_CHART.md` 수용: react-plotly.js 채택·활동로그 `sys_user_actvty_log`·중간집계 rollup `stat_actvty_dly`/`stat_revenue_dly`·`fn_build_daily_stats` 멱등 집계·4경로 매출 귀속·TASK-080~087). 섹션 13→14, 14→15, 15→16, 16→17 재정렬. CRON_SECRET 환경변수·신규 통계 테이블 3종 추가. |
| v7.0 | 2026-06-10 | Phase 11 완료 반영. Phase 12 PyTranslateâ¢™ 글로벌 동시통역 신규 추가 — 섹션 14 신설(`PRD_4_CHAT.md` v1.6 수용: Gemini 2.0 Flash 주력 + Claude Haiku fallback 하이브리드·비용 ~76% 절감·`msg_trans` 번역 캐시 테이블·in-memory dedup·broadcast 기반 실시간 전달·TASK-090~099). 기존 섹션 14→15, 15→16, 16→17, 17→18 재번호화. `GEMINI_API_KEY` Phase `6, 12`로 업데이트. Phase 12 파일 디렉토리 구조 추가. `msg_trans` DB 테이블 현황 추가. |
| v8.0 | 2026-06-10 | Phase 13 PyShopâ¢(MPS) Pi Coin P2P 직거래 마켓플레이스 통합 — 섹션 15 신설(`PRD_8_MPS.md` 수용: 양방향 거래완료 확인·9999 무제한 재고 센티널·PiRC2 가상 에스크로·`mps_` 테이블 6개·API 17개·마일스톤 3단계). 기존 섹션 15→16, 16→17, 17→18, 18→19 재번호화. MPS 디렉토리 구조(`store/`·`api/store/`)·lib 헬퍼 파일(`mps-item.ts`·`mps-order.ts`·`mps-shop.ts`) 추가. |
| v9.0 | 2026-06-12 | Phase 15 LBS 위치기반서비스 통합 — 섹션 16 신설(`PRD_10_GPS.md` v1.2 수용: 동의 게이트 Rule LBS-01~04·직거래 비즈니스 근거·`sql/030_lbs.sql`(sys_user_consent·usr_loc_hist·sys_user 컬럼 3개)·API 10개·Haversine 거리 계산·MPS 상품 거리 표시·TASK-130~139). PyVoice™ Phase 14 기능 현황 표 추가(#17). 섹션 16→17(환경변수), 17→18(디렉토리), 18→19(DB 테이블), 19→20(변경이력) 재번호화. GOOGLE_MAPS_API_KEY 환경변수 추가. DB 테이블 현황에 LBS 테이블 2종 추가. |
| v10.2 | 2026-06-13 | Phase 13 MPS Phase 2 확장 완료 반영 — 전체 기능 현황 #16 상태 `🚧 Phase 1`→`✅ Phase 1+2`. TASK-108 카테고리(검증)·**TASK-109 매장 관리**(shops API 2종 + 관리 UI/`/store/my/shops` + 상품폼 매장 선택)·TASK-110 양방향 취소(기 구현 FR-10 충족 검증)·**TASK-111 거래 내역**(txns API + history UI/`/store/my/history` + 구매/판매/기타 탭·날짜필터, FR-12). 신규 마이그레이션 0(mps_shop·mps_txn_hist 기 완비), i18n ko/en + DB upsert. 상세는 ROADMAP v6.5. |
| v10.1 | 2026-06-13 | 횡단 3차 현행화 — 전체 기능 현황에 #20(Pi Browser 안정화·콤보 성능) 추가. ① **admin 다국어 전환 무반응 수정**: `language-switcher.tsx` admin 분기에서 Pi Browser는 쿠키 미저장이라 티켓 없는 하드 네비게이션이 미인증 게이트로 빠지고 게이트 soft `router.replace` 재렌더가 WebView에서 불안정해 멈추던 문제를 `_pit` 티켓 선발급 후 URL 첨부 하드 네비게이션으로 해결(게이트 왕복 제거·핵심가치 ① Pi Browser 로그인 흐름 보호). ② **헤더 다국어 콤보 3계층 캐시**: 매 열기 재조회 지연 제거 — `/api/i18n/countries` `revalidate=600`(서버)·sessionStorage+메모리 TTL 10분(클라이언트 lazy init)·`requestIdleCallback` 프리페치. 커밋 70bfaac·9c62512 배포 완료. |
| v10.0 | 2026-06-12 | 전면 현행화 — ① Phase 12 PyTranslateâ¢™ 완료(어드민 번역 통계 TASK-098·품질 피드백 099 포함) ② Phase 13 MPS Phase 1 MVP 완료 표시 ③ **Phase 14 PyVoice™ 섹션 16 신설** (`PRD_9_VOICE_CHAT.md` v2.0 수용: N:N 다:다 1~4명 Full Mesh·1인 대기·방장 마이크 제어·동시 마이크 4명 제한·`sql/032`·API 5종·use-voice-channel 훅 — 구현 완료, S0 실기기 검증·TURN env 설정 잔여) ④ Phase 15 LBS P0+P1 완료 표시 ⑤ Pi Tip → Pi Bean 리브랜딩 반영(표시 명칭·아이콘만, 식별자 유지) ⑥ 화면 성능 튜닝 기능 현황 추가(무한 스크롤·지연 로딩) ⑦ DB 현황에 Phase 14 테이블 3종 추가, sql/033 오타 수정. 섹션 17~21 재번호화. |
