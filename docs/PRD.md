# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v8.0
> **작성일**: 2026-06-05
> **최종 업데이트**: 2026-06-10
> **작성자**: anakin
> **배포 URL**: https://loginpi.vercel.app
> **저장소**: https://github.com/anakinwon/loginpi
> **카페 상세 스펙**: `docs/PRD_4_CHAT.md` (v1.6)

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제, Google 소셜 로그인, 계정 연동, 관리자 시스템, 게시판, 다국어, **테마 기반 카페 플랫폼 PiCafé**, 그리고 **Pi Coin 전용 P2P 직거래 마켓플레이스 MyPiShop(MPS)**를 구현한다.

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
| 카페 | PiCafé — 테마 기반 Pi Network 커뮤니티 카페 + PiTranslate™ 글로벌 동시통역 (Phase 7~12) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

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
| 10 | PiCafé MVP — 1:1·그룹 카페 + 테마 선택 + Pi 결제 | ✅ 완료 | Phase 7 |
| 11 | 사용자 프로필 — 마이페이지 (개인정보·결제내역·구독현황) | ✅ 완료 | Phase 10 |
| 12 | 어드민 통계 대시보드 — DAU/WAU/MAU·테마별 매출 (react-plotly.js) | ✅ 완료 | Phase 11 |
| 13 | PiCafé 수익화 — Pi Tip·스티커·AI 봇·이벤트방 | 🔜 준비중 | Phase 8 |
| 14 | PiCafé 생태계 — 마켓플레이스·Webhook·대시보드 | 🔜 준비중 | Phase 9 |
| 15 | PiTranslate™ — 글로벌 동시통역 (Gemini Flash + Claude Haiku 하이브리드) | 🔜 준비중 | Phase 12 |
| 16 | MyPiShop(MPS) — Pi Coin P2P 직거래 마켓플레이스 (에스크로·재고·매장 관리) | 🔜 준비중 | Phase 13 |

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

## 11. Phase 7~9 — PiCafé 테마 기반 카페 플랫폼 ✅

> 상세 명세: `docs/PRD_4_CHAT.md` (v1.6)

### 11.1 제품 개요

**PiCafé** — 테마 기반 Pi Network 카페 플랫폼

내가 좋아하는 테마(여행·골프·먹방...)를 선택하고, 같은 관심사 Pi 사용자들과 카페하면서 Pi를 자연스럽게 주고받는 라이프스타일 커뮤니티.

| # | 핵심 차별점 | 설명 |
|---|---|---|
| 1 | **테마 퍼스트** | 카페 개설 전 테마 선택 → 전용 스티커·AI 봇·배지 자동 세팅 |
| 2 | **Pi 마이크로 트랜잭션** | 카페 중 Pi Tip·스티커·AI 기능 단건 결제 (0.01~5 Pi) |
| 3 | **인라인 구매 UX** | 카페창을 벗어나지 않고 구매 완료 — 흐름 단절 없음 |
| 4 | **KYC 기반 신뢰** | Pi Network 인증 사용자만 참여 — 익명 도배·스팸 방지 |
| 5 | **PiTranslate™** | 어떤 언어로 카페해도 선택 언어로 실시간 동시통역 — Gemini 2.0 Flash + Claude Haiku 하이브리드 (비용 ~76% 절감) |

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
PiCafé:    라이프스타일·실명·Pi 경제 → 새로 추가
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
- **테마 독점 이벤트** — 프로 골퍼 라이브 Q&A, 여행 유튜버 PiCafé 전용 이벤트

---

### 11.4 탈중앙화와 프라이버시

**"인간 검증된 익명성 (Human-Verified Anonymity)"** — 세계 어디에도 없는 포지션

```
Discord:    무검증 익명 → 봇·사기꾼 섞임
카카오톡:  실명 중앙화 → 정부·기업에 데이터 노출
PiCafé:    KYC로 "사람임"만 증명 + Pi UID로 카페 내 완전 익명
```

**탈중앙화 3계층**:

| 계층 | 구현 | 효과 |
|---|---|---|
| **신원** | Pi 지갑 = 계정 (PiCafé 서버 외부) | 플랫폼이 계정 삭제 불가 |
| **결제** | Pi 블록체인 직접 정산 | 중간 수수료 없음, 동결 불가 |
| **메시지** | 1:1·비밀방 E2E 암호화 | 서버조차 내용 읽기 불가 |

**4가지 공개 약속**:
1. 1:1 메시지를 읽지 않는다 (E2E 암호화)
2. Pi 자산을 동결하거나 빼앗지 않는다 (Pi 블록체인)
3. 카페를 이유 없이 삭제하지 않는다 (Pi 지갑 소유권)
4. 대화를 광고·학습 데이터로 사용하지 않는다 (No data monetization)

> **핵심**: Discord·카카오는 광고 수익 모델 = 데이터 수집 필수. PiCafé는 Pi 트랜잭션 수익 모델 = 데이터 판매 불필요. 탈중앙화가 마케팅이 아닌 비즈니스 모델의 구조적 결과다.

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

**PiTranslate™ 하이브리드 번역 아키텍처 (Phase 12)**:
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

**Phase 12: PiTranslate™ — 글로벌 동시통역**

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

## 14. Phase 12 — PiTranslate™ 글로벌 동시통역 🔜

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
| TASK-090 | `sql/018_msg_trans.sql` 마이그레이션 + `msg_msg.src_lang_cd` + `env.ts` `GEMINI_API_KEY` | 🔜 |
| TASK-091 | `src/lib/chat-translate.ts` — Gemini 2.0 Flash 번역·언어감지 + Claude Haiku fallback | 🔜 |
| TASK-092 | `src/lib/chat-translate-dedup.ts` — in-memory pending map 동시성 처리 | 🔜 |
| TASK-093 | `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate` 번역 API | 🔜 |
| TASK-094 | 메시지 전송 시 방 참가자 locale 자동 번역 큐 (비동기, non-blocking) | 🔜 |
| TASK-095 | `use-chat-room.ts` 확장 — `msg_trans` broadcast 이벤트 구독 + 메시지 번역 교체 | 🔜 |
| TASK-096 | 사용자 프로필 — 표시 언어 설정 UI (203개 locale, 1회 설정) | 🔜 |
| TASK-097 | 메시지 버블 `[원문 보기]` 토글 UI (번역 투명성 보장) | 🔜 |
| TASK-098 | 어드민 번역 통계 (일별 번역 건수·캐시 히트율·비용 추정) | 🔜 |
| TASK-099 | 번역 품질 피드백 UI (메시지별 👍/👎 — 향후 fine-tune 데이터) | 🔜 |

> **구현 순서**: TASK-090 → 091 → 092 → 093 → 094 → 095 (P0 완료 = MVP) → 096 → 097 → 098 → 099

---

## 15. Phase 13 — MyPiShop (MPS) 🔜

> **상세 스펙**: `docs/PRD_8_MPS.md` (v1.0)

Pi Coin 전용 P2P 직거래 마켓플레이스. 배송 없이 구매자·판매자가 직접 만나 거래하며, PiRC2 가상 에스크로로 결제를 보호한다.

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
| Phase 3 | PiRC3 실 에스크로 마이그레이션, Google Maps 연동 |

---

## 16. 환경변수 전체 목록

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
| `GEMINI_API_KEY` | 6, 12 | Gemini AI 번역 (Phase 6 다국어 + Phase 12 PiTranslate™ 주력 엔진) |
| `RESEND_API_KEY` | 6 | 결제 영수증 이메일 발송 |
| `ANTHROPIC_API_KEY` | 7 | Claude AI 카페 비서 (Phase 7 신규) · PiTranslate™ fallback (Phase 12) |
| `CRON_SECRET` | 11 | 통계 집계 배치 인증 (Vercel Cron 경로 채택 시, Phase 11 신규) |

---

## 17. 디렉토리 구조

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

## 18. DB 테이블 현황

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
| public | msg_tip | Pi Tip 내역 |

### 신규 테이블 (Phase 11 — 통계 대시보드)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user_actvty_log | 사용자 활동 원천 로그 (`UNIQUE(usr_id, actvty_dt)`, DAU/WAU/MAU 산출) — `sql/015` |
| public | stat_actvty_dly | 일별 활동 중간집계 (DAU/WAU/MAU 사전 계산) — `sql/016` |
| public | stat_revenue_dly | 일별 × 테마별 매출 중간집계 (PK `stat_dt, theme_cd`) — `sql/016` |

### 신규 테이블 (Phase 12 — PiTranslate™)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | msg_trans | 번역 캐시 (`UNIQUE(msg_id, locale_cd)`) — On-demand 번역 결과 저장, 같은 조합 1회만 번역 — `sql/018` |

> **Phase 12 컬럼 추가**: `msg_msg.src_lang_cd VARCHAR(20)` — 원본 언어 코드 (Gemini Flash 감지) — `sql/018`

### 신규 테이블 (Phase 13 — MyPiShop MPS, `mps_` 접두사)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | mps_ctgr | 상품 카테고리 (2단계 계층, `parent_ctgr_id` 자기 참조) |
| public | mps_shop | 판매자 매장 (ONLINE/OFFLINE/BOTH, `lat`·`lng`·`place_id` Google Maps 확장 포인트) |
| public | mps_item | 상품 (`reg_qty`·`ordered_qty`·`stock_qty` 삼위일체, `stock_qty = reg_qty - ordered_qty` CHECK 제약) |
| public | mps_item_img | 상품 이미지 (최대 5장, 썸네일 지정, `sort_ord`) |
| public | mps_order | 주문 (`escrow_txid`·`release_txid`·`cancel_req_id`·`order_st_cd` 상태 머신) |
| public | mps_txn_hist | 거래 이력 (ESCROW_IN/RELEASE_OUT/AUTO_RELEASE/REFUND/FEE) |

> **코드 도메인**: `item_cnd_cd`(NEW/USED/HANDMADE), `item_st_cd`(DRAFT/OPEN/CLOSED/SOLD), `order_st_cd`(PENDING/ESCROW/TRADING/SELLER_DONE/DONE/CANCELLED), `shop_type_cd`(ONLINE/OFFLINE/BOTH)
> **DA 표준**: `mps_` 접두사 신규 주제영역 등록, 시스템 컬럼 4개 필수, 논리삭제 적용

---

## 19. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 |
| v2.0 | 2026-06-05 | Phase 0~3 진행 상황 반영 |
| v3.0 | 2026-06-07 | Phase 4~6 완료 반영. 다국어 아키텍처 상세화. 환경변수·디렉토리 전면 업데이트 |
| v4.0 | 2026-06-07 | Phase 7~9 PiCafé 통합. 섹션 11 신규 추가 (테마 시스템·구독 티어·인라인 트리거·DB 13개·API·Realtime·탈중앙화). Next.js 16·TypeScript 6 업그레이드 반영. `docs/PRD_CHAT.md`에서 핵심 내용 통합 |
| v5.0 | 2026-06-09 | Phase 7 PiCafé MVP 완료 상태 현행화. Phase 10 사용자 프로필 관리(마이페이지) 신규 추가 — 섹션 12 신설(DB 마이그레이션 014·API 명세·컴포넌트 구조·Pi Browser 클라이언트 게이트 패턴). `PRD_USERS.md` 핵심 내용 통합. 섹션 번호 12→13, 13→14, 14→15, 15→16 재정렬. |
| v6.0 | 2026-06-09 | Phase 10 완료 반영. Phase 11 어드민 통계 대시보드(DAU/WAU/MAU·테마별 매출) 신규 추가 — 섹션 13 신설(`PRD_CHART.md` 수용: react-plotly.js 채택·활동로그 `sys_user_actvty_log`·중간집계 rollup `stat_actvty_dly`/`stat_revenue_dly`·`fn_build_daily_stats` 멱등 집계·4경로 매출 귀속·TASK-080~087). 섹션 13→14, 14→15, 15→16, 16→17 재정렬. CRON_SECRET 환경변수·신규 통계 테이블 3종 추가. |
| v7.0 | 2026-06-10 | Phase 11 완료 반영. Phase 12 PiTranslate™ 글로벌 동시통역 신규 추가 — 섹션 14 신설(`PRD_4_CHAT.md` v1.6 수용: Gemini 2.0 Flash 주력 + Claude Haiku fallback 하이브리드·비용 ~76% 절감·`msg_trans` 번역 캐시 테이블·in-memory dedup·broadcast 기반 실시간 전달·TASK-090~099). 기존 섹션 14→15, 15→16, 16→17, 17→18 재번호화. `GEMINI_API_KEY` Phase `6, 12`로 업데이트. Phase 12 파일 디렉토리 구조 추가. `msg_trans` DB 테이블 현황 추가. |
| v8.0 | 2026-06-10 | Phase 13 MyPiShop(MPS) Pi Coin P2P 직거래 마켓플레이스 통합 — 섹션 15 신설(`PRD_8_MPS.md` 수용: 양방향 거래완료 확인·9999 무제한 재고 센티널·PiRC2 가상 에스크로·`mps_` 테이블 6개·API 17개·마일스톤 3단계). 기존 섹션 15→16, 16→17, 17→18, 18→19 재번호화. MPS 디렉토리 구조(`store/`·`api/store/`)·lib 헬퍼 파일(`mps-item.ts`·`mps-order.ts`·`mps-shop.ts`) 추가. |
