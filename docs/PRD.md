# PRD: Pi Network 기반 풀스택 앱 플랫폼 (라이트버전)

> **버전**: v13.7
> **작성일**: 2026-06-05 · **최종 업데이트**: 2026-07-18
> **작성자**: anakin
> **배포 URL**: **staging** https://loginpi.vercel.app (Testnet) · **운영** https://cafepi.vercel.app (Mainnet·production 브랜치)
> **저장소**: https://github.com/anakinwon/loginpi
>
> ⭐ **본 문서는 라이트버전이다.** Phase 0~22 구현 상세·디렉토리 구조·전체 변경 이력 원문은
> **`docs/archive/PRD_FULL_v12.8_2026-07-08.md`** 로 이관했다. 기능별 상세는 각 하위 PRD가 정본이며,
> 문서 전체 지도는 `docs/README.md`, 개발 마일스톤은 `docs/ROADMAP.md`, 운영 리스크·사고 기록은 `docs/TROUBLESHOOT.md` 참조.

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제, Google 로그인, 계정 연동, 관리자 시스템, 게시판, 다국어(189 locale),
**테마 기반 카페 플랫폼 PyCafé™**, **Pi Coin 전용 P2P·O2O 마켓플레이스 PyShop™(MPS)** 를 구현한다.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16 App Router + React 19 + TypeScript 6 strict |
| 스타일 | Tailwind CSS v4 (CSS-first) + shadcn/ui base-nova (`@base-ui/react`) |
| 인증 | Pi SDK 2.0 (쿠키+X-Pi-Token 이중 경로) + NextAuth v5 (Google) + Pi Sign-In OAuth (일반 브라우저) |
| DB | Supabase PostgreSQL (RLS 비활성, 서버 전용 service_role) |
| 실시간 | Supabase Realtime (broadcast + presence) |
| 결제 | Pi Coin U2A + A2U (운영 fee_mode=PI, 메인넷 PI모드 운영 중) |
| AI | Gemini Flash (번역·언어감지) + Claude Haiku (AI 봇·번역 fallback) |
| 다국어 | next-intl v4 — 활성 189 locale·66개 언어 완역 |
| 배포 | Vercel + pnpm 11 — 2단계 배포(staging→production 브랜치 게이팅), 3-tier DB 라우터(`src/lib/db-env.ts`) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 2. ⭐ 핵심 가치 (최우선 원칙)

이 플랫폼의 모든 기능은 다음 두 가치 위에 존재한다. 둘 중 하나라도 막히면 프로젝트는 무가치하다.

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

> **Pi Browser 제약**: WebView가 모든 방식의 `Set-Cookie`를 저장하지 않으므로, 인증은
> 쿠키 + `X-Pi-Token` 헤더(localStorage) **이중 경로**로 구현한다. 인증이 필요한 페이지는
> redirect 보호 대신 **클라이언트 게이트**를 쓴다(무한 루프 방지).
> Pi Browser 판정에 UA를 절대 신뢰하지 않는다 — 유일한 신뢰 신호는 `authenticate()` 성공뿐.
> 모든 인증·페이지 변경은 **Pi Browser 실기기 검증**을 완료 조건으로 한다.
> (구현 상세: `CLAUDE.md` "인증 + 세션 구조")

---

## 3. 🔐 환경 플래그 & 데이터 무결성 원칙 (2026-07-02 확정)

> 사고 경위·진단: `docs/TROUBLESHOOT.md` [2026-07-02]

### SANDBOX_FLAG (`NEXT_PUBLIC_PI_SANDBOX`) — 환경별 고정값

Pi uid는 **(앱 × Testnet/Mainnet) 쌍마다 다른 scoped 값**이며 로그인 uid·결제가 전부 이 플래그에 종속된다.

| 환경 | 값 | 의미 |
|---|---|---|
| 로컬(dev) | 자동 `true` (코드 강제) | Testnet |
| staging | `true` | Testnet — 실제 돈 없이 검증 |
| 운영(cafepi) | `false` | **Mainnet 확정(2026-07-02)** |

**철칙**: ① 환경 내 고정(플립 시 전 사용자 pi_uid 재발급 → systemic 재동의·계정 재생성) ② 변경 시 재배포 필수(`NEXT_PUBLIC_*` 빌드 인라인) ③ 메인넷 전환은 DB 초기화·계정 마이그레이션과 세트 ④ 계정 삭제로는 해결 불가. 사람의 불변 키는 `pi_username`(uid 아님) — `upsertPiUser` 재바인딩 폴백 + UNIQUE(sql/162).

### 실 데이터 무결성 — 테스트 더미 절대 금지 ⛔

운영·staging에 테스트/더미 사용자·거래·자료를 생성하지 않는다. **Pi에서 가짜 인간(다중 계정) 테스트는 KYC·1인1계정 위반 → 계정 영구제명** 위험(핵심가치·메인넷 등재 통째 붕괴). 검증은 실사용자 행위로만, 통계·장부 소급도 소스가 실재하는 건만.

---

## 4. 전체 기능 현황 (요약)

> 각 행의 구현 상세는 **정본 문서** 열의 하위 PRD 및 `docs/archive/PRD_FULL_v12.8_2026-07-08.md` 해당 섹션 참조.

| # | 기능 | 상태 | Phase | 정본 문서 |
|---|---|---|---|---|
| 1 | 스타터킷 현행화 (Next.js 16·Tailwind v4·base-nova) | ✅ | 0 | — |
| 2 | Pi 로그인 + HMAC 세션 (쿠키+X-Pi-Token 이중 경로) | ✅ | 1 | CLAUDE.md |
| 3 | Pi Coin 결제 (U2A 3단계) | ✅ | 1 | — |
| 4 | Google 로그인 (NextAuth v5) | ✅ | 2 | — |
| 5 | Pi + Google 계정 연동 (6자리 OTP) | ✅ | 2 | — |
| 6 | 관리자 시스템 (대시보드·사용자·결제·연동) | ✅ | 3 | — |
| 7 | 통합 게시판 (4종 + 댓글·첨부·채택) | ✅ | 4 | — |
| 8 | 데이터 표준 시스템 (표준단어·도메인·용어·DDL 감사) | ✅ | 5 | docs/da/ |
| 9 | 다국어 (next-intl v4 + Gemini AI 번역, 활성 189 locale) | ✅ | 6 | PRD_3_MUL_LAN |
| 10 | PyCafé™ MVP — 테마 카페 + Pi 결제 | ✅ | 7 | PRD_4_CHAT |
| 11 | 마이페이지 (개인정보·결제내역·구독현황) | ✅ | 10 | PRD_5_USERS |
| 12 | 어드민 통계 대시보드 (DAU/WAU/MAU·테마별 매출) | ✅ | 11 | PRD_6_CHART |
| 13 | PyCafé™ 수익화 (Bean·스티커·AI 봇·이벤트방) | ✅ | 8 | PRD_7_CHAT2 |
| 14 | PyCafé™ 생태계 (마켓플레이스·Webhook·분석) | ✅ | 9 | PRD_7_CHAT2 |
| 15 | PyTranslate™ 글로벌 동시통역 (Gemini+Claude 하이브리드) | ✅ | 12 | PRD_4_CHAT |
| 16 | PyShop™(MPS) P2P 마켓 (에스크로·재고·매장·거래내역) | ✅ | 13 | PRD_8_MPS |
| 17 | PyVoice™ N:N 음성채널 (WebRTC Full Mesh·TURN) | ✅ | 14 | PRD_9_VOICE_CHAT |
| 18 | LBS 위치기반서비스 (동의 기반 수집·거리 표시·매장 거리 3층+100m 현장 인증 안내 — Rule LBS-05) | ✅ | 15 | PRD_10_GPS |
| 19 | 화면 성능 튜닝 (무한 스크롤·지연 로딩·SWR) | ✅ | 횡단 | PRD_18_PERFORM |
| 20 | Pi Browser 안정화·콤보 성능 (`_pit` 티켓·3계층 캐시) | ✅ | 횡단 3차 | TROUBLESHOOT |
| 21 | 이벤트 미션 시스템 (10미션·화이트리스트·보증금 보상) | ✅ 운영 중 | 16 | PRD_11_EVENT |
| 22 | MPS 후속 (A2U 자동환불·이미지 업로드·위치 수집) | ✅ | 13 후속 | PRD_8_MPS |
| 23 | 어드민 대시보드 고도화 (트리맵·KST 집계) | ✅ | 11 후속 | PRD_6_CHART |
| 24 | Pi Browser 안정화 4차 (로고·open redirect 방어 등) | ✅ | 횡단 4차 | — |
| 25 | i18n 자동번역 백그라운드화 (`after()` 전환) | ✅ | 횡단 5차 | PRD_3_MUL_LAN |
| 26 | GTM 문서화 (제품소개서·공개/라이선스 정책) | ✅ | 문서화 | 공개_라이선스_정책 |
| 27 | PyShop™ O2O 오프라인 매장 커머스 (반자동 인증·상태머신) | ✅ | 13-3 | PRD_8_MPS §15.8 |
| 28 | BEAN 토큰 발행 (Pi Launchpad) — 앱 코드 미포함 | 📝 기획 | 17 | PRD_12_TOKEN |
| 29 | PyShop™ 카트 다건 일괄 결제 + 자국통화 | ✅ | 13 후속 | PRD_8_MPS FR-14·15 |
| 30 | 화면 성능 6탭 전수 진단 (C4·H15·M18) | ✅ CRITICAL 전량 종결 (HIGH/MEDIUM 잔여) | 20 | PRD_18_PERFORM |
| 31 | 보안 강화 (KISA 21항목 + DDoS 5계층) | 🔶 코드 완료 | 21 | PRD_2_SECURITY |
| 32 | 상품 카테고리 표준 (17대분류 3단계) | 📝 설계 | — | PRD_19_CATEGORY |
| 33 | 데이터 분석 4탭 통합 페이지 (/admin/analytics) | ✅ 구현 완결 + CSV 내보내기 (퍼널·지리는 선결 대기) | 22 | PRD_21_DATA_ANAL |
| 34 | 실시간 시스템 모니터링 (/admin/monitor·24메트릭) | ✅ 핵심 완결 (전량·7일·5초 확정, 고도화 2건 잔여) | 23 | PRD_22_MONITOR |
| 35 | 메인넷 전환·2단계 배포·운영DB 컷오버 | ✅ **등재 신청 완결·승인 대기** (체크리스트 19/19·도메인 검증·a2u-probe 자동 감지) | 24 | MAINNET_READINESS_CHECKLIST |
| 36 | 이중 요금제(BEAN/PI) 런타임 스위칭 — 운영 fee_mode=PI | ✅ | 25 | PRD_24_FEES_STRATAGE |
| 37 | 오픈기념 무료요금 OneKey (운영 종료 실측 2026-12-31 23:59 KST) | ✅ 활성 | 26 | PRD_26_OPEN_PROMO_FEE |
| 38 | P2P 채팅 텔레그램 알림·봇 릴레이 + 통합알림(TXN_ST/FBCK) | ✅ 완결 | 27 | PRD_13_MSG §18 |
| 39 | 직거래 문의방 (DIRECT 테마·12h 만기·상품별 분리) | ✅ | 27 | PRD_13_MSG |
| 40 | 관리자 빠른 메뉴 (sys_quick_menu) | ✅ | 관리 편의 | — |
| 41 | Pi Sign-In — 일반 브라우저 Pi OAuth 로그인 (3종 여정 실기기 검증) | ✅ | 28 | TROUBLESHOOT 2026-07-08 |
| 42 | Pi 앱 팩토리 — .pi 도메인 멀티테넌트 인큐베이팅 | ⏸️ 무기한 홀딩 | 29 | PRD_27_PI_FACTORY |
| 43 | 하드코딩 한국어 전수 제거 + API 에러코드 i18n (107 route·1,633키×66언어) | ✅ | 횡단 9차 | i18n 감사 정본 |
| 44 | 법무 문서 4종 v1.1 개정 + 방침·약관 **v1.2 등재요건 문면 정합**(Pi 인증 필수 명확화·환율/invokeContract 정정, 실질 변경 없음) | ✅ v1.1·v1.2 시행 (7/16) | 법무 | docs/law/compliance/ 갭점검 |
| 45 | 멀티에이전트 하네스 2종 — 메인넷 등록팀(4역할)·DA팀(5인) 구축·실전 가동 | ✅ 운영 중 | 하네스 | .claude/workflows·da-team 스킬 |
| 46 | PyTranslate™ 국가파생 locale 오번역 근본수정 (언어명 해석기·오염캐시 정리·af/ar 매핑) | ✅ | 횡단 | sql/175·179 |
| 47 | 권한 체계 정렬 — ADMIN=최상위(isMaster 중앙 게이트) + admin 26화면 piFetch 전수 교체(Pi Browser 401 근본수정) | ✅ 실기기 검증 | 횡단 | CLAUDE.md 인증 §·auth-check.ts |
| 48 | A2U 개방(등재 승인) 자동 감지 — a2u-probe cron·텔레그램 0순위 런북 알림 | ✅ 운영 가동 | 24 | api/cron/a2u-probe |
| 49 | 한국 한정 개념 번역 통일 — 당근→P2P Marketplace·싸이렌오더→Mobile Order-Ahead (188 locale) | ✅ | 횡단 | 메모리 korea-only-concepts |

---

## 5. 환경변수 목록

| 변수명 | 용도 |
|---|---|
| `NEXT_PUBLIC_APP_URL` | 앱 URL (도메인별 정합 필수 — 딥링크·메타데이터 용도) |
| `NEXT_PUBLIC_PI_SANDBOX` | Pi 샌드박스 모드 (§3 철칙 — 환경 내 고정) |
| `NEXT_PUBLIC_PI_APP_DOMAIN` | Pi 딥링크 도메인 (환경별) |
| `NEXT_PUBLIC_PI_OAUTH_CLIENT_ID` | Pi Sign-In OAuth (환경별 필수, 미설정=버튼 미노출) |
| `PI_SESSION_SECRET` | HMAC 세션 서명 (32자+) |
| `PI_API_KEY` | Pi 결제 API 키 |
| `PI_WALLET_PRIVATE_SEED` | A2U 실송금 (판매자 정산·보상) |
| `AUTH_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | NextAuth Google OAuth |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase (service_role은 서버 전용, `sb_secret_` 형식) |
| `GEMINI_API_KEY` | AI 번역·언어감지 (주력) |
| `ANTHROPIC_API_KEY` | AI 봇 + 번역 fallback |
| `RESEND_API_KEY` | 영수증 이메일 |
| `CRON_SECRET` | Vercel Cron 인증 (**프로덕션 필수**) |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps 서버/클라이언트 |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 알림 봇 (환경별 분리) |

> 스키마 정본: `src/env.ts` (t3-env, 빌드 시점 검증). 신규 env는 `src/env.ts` + `.env.example` 동시 수정.

---

## 6. DB 테이블 현황 (도메인 요약)

> 운영DB 96테이블 (2026-06-28 컷오버 기준). 테이블별 상세 명세는 `docs/archive/PRD_FULL_v12.8_2026-07-08.md` §25 및 `sql/*.sql`. DA 표준(시스템 컬럼 4개·논리삭제)은 `docs/da/데이터표준규칙.md` 정본.

| 접두사/그룹 | 도메인 | 대표 테이블 |
|---|---|---|
| `sys_*` | 사용자·동의·활동로그·빠른메뉴 | sys_user, sys_user_consent, sys_user_actvty_log, sys_quick_menu |
| `pi_*` / `auth_*` | Pi 결제·계정 연동 | pi_pymnt, auth_link_cd |
| `brd_*` | 게시판 | brd_ctgr/post/cmnt/attch |
| `std_*` | 데이터 표준 | std_dic/dom/term, std_audit_log, approval_queue |
| `i18n_*` | 다국어 | i18n_locale, i18n_message, i18n_cntry_mst, i18n_lang_mst |
| `msg_*` | 카페·구독·스티커·통화·번역·알림 | msg_room/msg/mbr, msg_subscr, msg_trans, msg_call_*, msg_noti_outbox, msg_tlgm_out |
| `mps_*` | PyShop™ 마켓 (상품·매장·주문·정산) | mps_item/shop/order/order_item/txn_hist, mps_seller_bond |
| `bean_*` | Bean 경제 (지갑·거래·요금·캠페인) | bean_wlt, bean_txn, bean_fee_plan, bean_campaign |
| `evt_*` | 이벤트 미션 | evt_mission, evt_user_mission, evt_exclude, evt_pi_reward_log |
| `fbck_*` | 이용후기 + 보상 | fbck_mst, fbck_img, fbck_ctgr_item, fbck_pi_reward_log |
| `stat_*` / `metric_*` | 통계·모니터링 집계 | stat_actvty_dly, stat_revenue_dly |
| config 단건 | 런타임 스위치 | fee_mode_config(BEAN/PI), promo_fee_config(OneKey), ui_theme |
| `usr_*` | 위치 이력 | usr_loc_hist (좌표는 latd_crd/lngt_crd) |

---

## 7. 변경 이력 (최근)

> v12.7 이전 전체 이력은 `docs/archive/PRD_FULL_v12.8_2026-07-08.md` §26 참조.

| 버전 | 날짜 | 내용 |
|---|---|---|
| v13.7 | 2026-07-18 | **등재 알람 하트비트 전환**(a4378bda) — 미승인(CLOSED)도 매일 09:30 📡 "승인 대기 D+N"·ERROR ⚠️ 원문 알람 승격·OPEN 🚨 불변. "무소식=미승인 vs 알람 고장" 모호함 제거(알람 부재=이상 신호). 운영 검증 notified:true·마스터 수신 확인 |
| v13.6 | 2026-07-17 | **오후 4트랙** — ① 홈 커스터마이징(히어로 WebP+골드 태그라인 "글로벌 Pi 커뮤니티 & Pi 마켓플레이스"+전 카드 접이식) ② i18n API lazy init 전수(모듈 스코프 createClient 5곳 — preview 빌드 실패 노이즈 소멸) ③ 매출 집계 catch-all 복원(sql/183 — 신종 결제 type 누락으로 "구매왕 있는데 매출 0", 운영 157.8π 복원) ④ 9영역 종합 리뷰(REVIEW_TOTAL)+차기 플레이북(PLAYBOOK_NEXT_PROJECT)+홈 대시보드 심사 절제 이원화 |
| v13.5 | 2026-07-17 | **LBS 지도·매장 등록 UX (#18, 운영 승격 4회·실기기 검증)** — 매장 거리 표시 3층 구축(인포윈도우 📍 — 구글 매장은 클라 haversine·등록 다이얼로그 watchPosition 실시간 배지·제출 좌표 최신 GPS, PRD_10 Rule LBS-05 신규) + '동의하고 시작' 무반응 근본수정(401 레이스 오판·무피드백 — Rule LBS-01 보강) + Map 업종 콤보 'Pi 매장' 라벨 189 locale 3중 적용 + 등재 알람(a2u-probe→텔레그램) 전 구간 사전 테스트 완결 |
| v13.4 | 2026-07-16 | **메인넷 등재 신청 완결** — 가상심사(레드라인 BLOCK 0)→후속 당일 완결(베팅 키 4,512행 삭제 sql/182·오버레이 25키+크립토 라운지)·도메인 검증 통과·**체크리스트 19/19 DONE(#35 — 별도 제출 절차 부재 공식 확인, 승인 대기)**·A2U 자동 감지 cron(#48) + 권한 ADMIN 최상위·piFetch 63건(#47) + 한국 한정 개념 번역 통일(#49) + 세션 교훈 4건 CLAUDE.md 명문화 |
| v13.3 | 2026-07-10 | 하네스의 날 — 등록팀(#45, 등재 런북 확정·잔여=포털 5건)·DA팀(전수감사 PASS·접두사 22종 현행화·sys_cfg_chg_hist 설계)·번역 오염 근본수정(#46)·보안 재발 방지·CSV 내보내기 완결 |
| v13.2 | 2026-07-10 | 스테일 대청소 완결 — Phase 27(#38)·성능 CRITICAL(#30)·모니터링(#34)·분석(#33) 실상태 반영 + 유령 폴링 수정 + **분석 CSV 내보내기**(번역키 66언어 확산 포함) + 법무 체크리스트 린 정리 |
| v13.1 | 2026-07-09 | **4트랙 동시 진행** — 법무 4종 v1.1 공지 완료(#44, 7/16 시행)·횡단 9차 i18n 에러코드 완결(#43)·등재 절제 오버레이 검증(sql/169~172)·Pi 앱 팩토리 승인→설계→무기한 홀딩(#42)·분석 매출 탭 P1(#33)·SHOP window.Pi 가드 종결·프로모 전략적 연장 확정(R-02) |
| v13.0 | 2026-07-08 | **라이트버전 개편** — Phase 0~22 구현 상세·디렉토리 구조·과거 변경이력을 `docs/archive/PRD_FULL_v12.8_2026-07-08.md`로 이관. 기능 현황 41행 1줄 요약 체계 전환·인코딩 깨짐(PyCafé™ 등) 교정·#41 Pi Sign-In 추가. |
| v12.8 | 2026-07-02 | 환경 플래그 & 데이터 무결성 원칙 확정 (SANDBOX_FLAG 철칙·테스트 더미 금지) |
| v12.7 | 2026-07-01 | P2P 채팅 텔레그램 릴레이 + 직거래 문의방 + 관리자 빠른메뉴 (#38~40) |
| v12.6 | 2026-06-30 | 이중 요금제(BEAN/PI) 완성·운영 PI모드 전환 + 오픈 프로모 OneKey (#36~37) |
| v12.5 | 2026-06-29 | 운영DB 컷오버 완료 + 2단계 배포 파이프라인 (#35) |
