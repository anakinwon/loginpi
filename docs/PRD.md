# PRD: Pi Network 기반 풀스택 앱 플랫폼

> **버전**: v4.0
> **작성일**: 2026-06-05
> **최종 업데이트**: 2026-06-07
> **작성자**: anakin
> **배포 URL**: https://loginpi.vercel.app
> **저장소**: https://github.com/anakinwon/loginpi
> **채팅 상세 스펙**: `docs/PRD_CHAT.md`

---

## 1. 프로젝트 개요

Pi Network 생태계 위에서 동작하는 풀스택 웹 앱 플랫폼.
Pi 계정 인증·결제, Google 소셜 로그인, 계정 연동, 관리자 시스템, 게시판, 다국어, 그리고 **테마 기반 채팅 플랫폼 PiChat**을 구현한다.

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16 App Router |
| 배포 | Vercel (loginpi.vercel.app) |
| 인증 1 | Pi Network (Pi SDK 2.0) |
| 인증 2 | Google OAuth (NextAuth.js v5) |
| DB | Supabase PostgreSQL |
| 실시간 | Supabase Realtime (채팅 — Phase 7~9) |
| 결제 | Pi Coin (U2A) |
| 다국어 | next-intl v4 (18개 언어 + AI 자동번역) |
| 채팅 | PiChat — 테마 기반 Pi Network 커뮤니티 채팅 (Phase 7~9) |
| 대상 환경 | Pi Browser + 일반 브라우저 |

---

## 2. 기술 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 App Router + React 19 + TypeScript 6 strict |
| 스타일 | Tailwind CSS v4 (CSS-first) + shadcn/ui base-nova (`@base-ui/react`) |
| 인증 | Pi SDK 2.0 + NextAuth.js v5 (Google OAuth) |
| DB | Supabase PostgreSQL (RLS 비활성화, 서버 전용 service_role 사용) |
| 실시간 | Supabase Realtime (`postgres_changes` + `presence`) — Phase 7~9 |
| 암호화 | E2E 암호화 (1:1·비밀 채팅방) — Phase 7~9 |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) — 채팅 AI 봇·테마별 프롬프트 |
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
| 10 | PiChat MVP — 1:1·그룹 채팅 + 테마 선택 + Pi 결제 | 🔜 준비중 | Phase 7 |
| 11 | PiChat 수익화 — Pi Tip·스티커·AI 봇·이벤트방 | 🔜 준비중 | Phase 8 |
| 12 | PiChat 생태계 — 마켓플레이스·Webhook·대시보드 | 🔜 준비중 | Phase 9 |

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

## 11. Phase 7~9 — PiChat 테마 기반 채팅 플랫폼 🔜

> 상세 명세: `docs/PRD_CHAT.md` (v1.2)

### 11.1 제품 개요

**PiChat** — 테마 기반 Pi Network 채팅 플랫폼

내가 좋아하는 테마(여행·골프·먹방...)를 선택하고, 같은 관심사 Pi 사용자들과 채팅하면서 Pi를 자연스럽게 주고받는 라이프스타일 커뮤니티.

| # | 핵심 차별점 | 설명 |
|---|---|---|
| 1 | **테마 퍼스트** | 채팅방 개설 전 테마 선택 → 전용 스티커·AI 봇·배지 자동 세팅 |
| 2 | **Pi 마이크로 트랜잭션** | 채팅 중 Pi Tip·스티커·AI 기능 단건 결제 (0.01~5 Pi) |
| 3 | **인라인 구매 UX** | 채팅창을 벗어나지 않고 구매 완료 — 흐름 단절 없음 |
| 4 | **KYC 기반 신뢰** | Pi Network 인증 사용자만 참여 — 익명 도배·스팸 방지 |

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
PiChat:    라이프스타일·실명·Pi 경제 → 새로 추가
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
- **테마 독점 이벤트** — 프로 골퍼 라이브 Q&A, 여행 유튜버 PiChat 전용 이벤트

---

### 11.4 탈중앙화와 프라이버시

**"인간 검증된 익명성 (Human-Verified Anonymity)"** — 세계 어디에도 없는 포지션

```
Discord:    무검증 익명 → 봇·사기꾼 섞임
카카오톡:  실명 중앙화 → 정부·기업에 데이터 노출
PiChat:    KYC로 "사람임"만 증명 + Pi UID로 채팅 내 완전 익명
```

**탈중앙화 3계층**:

| 계층 | 구현 | 효과 |
|---|---|---|
| **신원** | Pi 지갑 = 계정 (PiChat 서버 외부) | 플랫폼이 계정 삭제 불가 |
| **결제** | Pi 블록체인 직접 정산 | 중간 수수료 없음, 동결 불가 |
| **메시지** | 1:1·비밀방 E2E 암호화 | 서버조차 내용 읽기 불가 |

**4가지 공개 약속**:
1. 1:1 메시지를 읽지 않는다 (E2E 암호화)
2. Pi 자산을 동결하거나 빼앗지 않는다 (Pi 블록체인)
3. 채팅방을 이유 없이 삭제하지 않는다 (Pi 지갑 소유권)
4. 대화를 광고·학습 데이터로 사용하지 않는다 (No data monetization)

> **핵심**: Discord·카카오는 광고 수익 모델 = 데이터 수집 필수. PiChat은 Pi 트랜잭션 수익 모델 = 데이터 판매 불필요. 탈중앙화가 마케팅이 아닌 비즈니스 모델의 구조적 결과다.

---

### 11.5 테마 시스템 (Theme-First Architecture)

테마는 채팅방 분류 체계이자 **수익화 진입점**이다. 채팅방 개설 첫 화면이 테마 선택이다.

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

**채팅방 생성 UX**:
```
Step 1: 테마 선택 (BASIC 자유 / PREMIUM 🔒)
Step 2: 채팅방 이름 + 설명 (테마 이모지·태그 자동 제안)
Step 3: 공개/비공개 + 정원 설정
Step 4: Pi 결제 (Free: 0.1 Pi / Premium: 월 3개 무료)
```

---

### 11.6 구독 티어

| 기능 | Free "Pi Explorer" | Premium "Pi Creator" | Business "Pi Host" |
|---|---|---|---|
| **요금** | 0 Pi | 1 Pi/월 또는 10 Pi/년 | 5 Pi/월 또는 50 Pi/년 |
| 1:1 채팅 | 무제한 | 무제한 | 무제한 |
| 테마 접근 | 기본 6개 | 20개+ 전체 | 20개+ 전체 |
| 그룹방 참여 | 최대 5개 | 무제한 | 무제한 |
| 그룹방 생성 | 0.1 Pi/개 | 3개/월 무료 | 무제한 |
| Pi Tip 전송 | 0.01 Pi 단건 | 가능 | 가능 |
| 스티커 | 기본 3개 | 팩 구매 + 월 1개 무료 | 커스텀 제작 |
| 음성 메시지 | 30초 | 1분 | 5분 |
| AI 채팅 비서 | 0.05 Pi/회 | 10회/월 | 무제한 |
| 메시지 보관 | 7일 | 1년 | 영구 |
| 파일 공유 | 불가 | 100 MB/월 | 1 GB/월 |
| 이벤트방 개설 | 불가 | 불가 | 가능 |
| 분석 대시보드 | 불가 | 불가 | 가능 |
| 채팅 봇 Webhook | 불가 | 불가 | 가능 |

---

### 11.7 인라인 구매 트리거 8종

채팅 흐름을 끊지 않고, 문맥에 맞는 순간에 구매 옵션을 제시한다.

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
| `CHAT_ROOM_CREATE` | 채팅방 생성 | `msg_room` + `msg_room_mbr(OWNER)` INSERT |
| `CHAT_SUBSCR` | 구독 결제 | `msg_subscr` UPSERT (expire_dtm 갱신) |
| `THEME_UNLOCK` | 테마 단건 잠금해제 | `msg_usr_theme` INSERT |
| `STICKER_PACK` | 스티커 팩 구매 | `msg_usr_stkr_pack` INSERT |
| `PI_TIP` | Pi Tip 전송 | `msg_tip` INSERT + 수신자 Realtime 알림 + TIP_NOTI 메시지 자동 발송 |
| `EVENT_ROOM_JOIN` | 이벤트방 입장 | `msg_room_mbr(GUEST, expire_dtm)` INSERT |
| `FEATURE_ADDON` | 단건 기능 구매 | feature_cd별 분기 (AI_SUMMARY·MSG_KEEP·MEMBER_EXT·TIP_SINGLE·EXPORT·BADGE_UPGRADE) |

---

### 11.9 DB 스키마 (13개 테이블, `msg_` 접두사)

> 전 테이블 DA 표준 시스템 컬럼 4개 필수:
> `regr_id VARCHAR(20) NOT NULL DEFAULT 'system'`, `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`,
> `modr_id VARCHAR(20)`, `mod_dtm TIMESTAMPTZ`

| 테이블 | 설명 | 주요 컬럼 |
|---|---|---|
| `msg_theme` | 테마 마스터 | `theme_cd` PK, `theme_tp_cd` ('BASIC'/'PREMIUM') |
| `msg_theme_stkr` | 테마 기본 스티커 매핑 | `theme_cd` FK, `stkr_pack_id` |
| `msg_room` | 채팅방 | `room_tp_cd` ('D'/'G'/'E'), `entry_fee_pi`, `is_public_yn` |
| `msg_room_mbr` | 채팅방 멤버 | `mbr_role_cd` ('OWNER'/'ADMIN'/'MEMBER'/'GUEST'), `lst_read_msg_id` |
| `msg_msg` | 메시지 | `msg_tp_cd` ('TEXT'/'IMAGE'/'FILE'/'VOICE'/'STICKER'/'TIP_NOTI'/'SYSTEM') |
| `msg_msg_reac` | 메시지 이모지 반응 | `msg_id` FK, `emoji_cd`, `usr_id` |
| `msg_attch` | 첨부파일 | `msg_id` FK, `file_url`, `file_sz_byte` |
| `msg_subscr_plan` | 구독 플랜 정의 | `plan_cd` PK, `plan_nm`, `price_pi`, `period_mth` |
| `msg_subscr` | 사용자 구독 현황 | `usr_id` UNIQUE, `expire_dtm`, `auto_renew_yn` |
| `msg_stkr_pack` | 스티커 팩 | `theme_cd` FK, `pack_price_pi` |
| `msg_stkr` | 스티커 개별 | `pack_id` FK, `stkr_img_url` |
| `msg_usr_stkr` | 사용자 보유 스티커 | `usr_id`, `stkr_id` UNIQUE |
| `msg_tip` | Pi Tip 내역 | `snd_usr_id`, `rcvr_usr_id`, `tip_amt_pi`, `pymnt_id` FK |

**Realtime RLS 정책** (채팅방 멤버만 구독 가능):
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
```

메시지 cursor 페이지네이션:
```
GET /api/chat/rooms/[id]/messages?limit=50&before=<msg_id>
→ { messages: [...], hasMore: boolean, oldestMsgId: string }
```

---

### 11.11 기술 아키텍처

**실시간 메시지 (Supabase Realtime)**:
```typescript
// src/hooks/use-chat-room.ts
const channel = supabase.channel(`msg_room:${roomId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'msg_msg',
      filter: `room_id=eq.${roomId}` }, (payload) => addMessage(payload.new as MsgMsg))
  .on('presence', { event: 'sync' }, () => setOnlineUsers(Object.keys(channel.presenceState())))
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

**AI 채팅 비서** (`@ai` 멘션 → Anthropic Claude):
- 기존 `@anthropic-ai/sdk` 연동 활용 (Phase 1부터 설치됨)
- 테마별 시스템 프롬프트: 골프방=골프 코치, 먹방방=칼로리 전문가, 여행방=번역 플래너

---

### 11.12 보안 요구사항

| 항목 | 요건 |
|---|---|
| XSS 방지 | 메시지 콘텐츠 서버 측 sanitize |
| Pi Tip 검증 | `payment.amount === tip_amt_pi` 서버 재검증 |
| 멤버십 체크 | 모든 메시지 API에서 `msg_room_mbr` 존재·만료 확인 |
| Realtime 접근 | RLS: 채팅방 멤버만 구독 가능 |
| Rate limiting | 메시지 전송 1초당 최대 5건 |
| 구독 등급 | 유료 기능 API에서 서버 측 `msg_subscr` 재조회 |
| 파일 업로드 | MIME 화이트리스트, 파일 크기 강제 |

---

### 11.13 개발 로드맵

**Phase 7: 채팅 MVP**

| Task | 내용 |
|---|---|
| TASK-050 | DB 마이그레이션 (`msg_*` 13개 테이블 + 테마 마스터 데이터) |
| TASK-051 | 테마 마스터 데이터 세팅 (20개 테마 + 기본 스티커팩) |
| TASK-052 | 1:1 채팅 API + Supabase Realtime + E2E 암호화 |
| TASK-053 | 그룹 채팅방 생성 (Pi 결제 연동 + 테마 선택 UX) |
| TASK-054 | 구독 시스템 (플랜 관리 + Pi 결제) |

**Phase 8: 수익화 기능**

| Task | 내용 |
|---|---|
| TASK-060 | Pi Tip (인라인 결제 + TIP_NOTI 메시지 자동 발송) |
| TASK-061 | 스티커 마켓 (테마별 팩 + 인라인 업셀 트리거) |
| TASK-062 | 인라인 구매 트리거 8종 구현 |
| TASK-063 | 이벤트 채팅방 (유료 입장 + 방장 수익 분배) |
| TASK-064 | AI 채팅 비서 (`@ai` 멘션 + 테마별 프롬프트) |
| TASK-065 | 파일·이미지·음성 메시지 (Supabase Storage) |

**Phase 9: 생태계 확장**

| Task | 내용 |
|---|---|
| TASK-070 | 채팅 마켓플레이스 (테마별 공개방 디렉토리) |
| TASK-071 | Pi Bet 투표 (채팅방 내 베팅 이벤트) |
| TASK-072 | 채팅 봇·Webhook 연동 (Business 전용) |
| TASK-073 | 분석 대시보드 (Business: 방 통계·수익) |
| TASK-074 | 커스텀 스티커 제작 (Business: 브랜드 스티커팩) |

---

## 12. 환경변수 전체 목록

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
| `GEMINI_API_KEY` | 6 | Gemini AI 번역 |
| `RESEND_API_KEY` | 6 | 결제 영수증 이메일 발송 |
| `ANTHROPIC_API_KEY` | 7 | Claude AI 채팅 비서 (Phase 7 신규) |

---

## 13. 디렉토리 구조

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
│   │   │   └── chat/               # 채팅 관리 (Phase 7~9)
│   │   ├── board/                  # 게시판
│   │   ├── link/                   # Pi·Google 계정 연동
│   │   ├── chat/                   # 채팅 홈 — 테마 탐색 (Phase 7~9)
│   │   │   └── [roomId]/           # 채팅방
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── board/
│   │   ├── payments/               # Pi 결제 (approve/complete) — 채팅 결제도 공유
│   │   ├── chat/                   # 채팅 API (Phase 7~9)
│   │   ├── subscriptions/          # 구독 API (Phase 7~9)
│   │   ├── stickers/               # 스티커 API (Phase 8)
│   │   └── tips/                   # Pi Tip API (Phase 8)
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── admin/
│   ├── layout/
│   ├── ui/
│   └── chat/                       # 채팅 UI 컴포넌트 (Phase 7~9)
│       ├── theme-selector.tsx      # 테마 선택 (채팅방 생성 Step 1)
│       ├── chat-room-list.tsx
│       ├── chat-message-list.tsx
│       ├── chat-input.tsx
│       ├── sticker-picker.tsx
│       ├── pi-tip-button.tsx
│       ├── subscription-gate.tsx
│       └── inline-purchase-prompt.tsx
├── hooks/
│   └── use-chat-room.ts            # Supabase Realtime 구독 훅 (Phase 7~9)
├── i18n/
│   ├── routing.ts
│   └── request.ts
├── lib/
│   ├── auth-check.ts
│   ├── board.ts
│   ├── chat-auth.ts                # 구독 등급 체크 헬퍼 (Phase 7~9)
│   ├── chat.ts                     # 채팅 CRUD 헬퍼 (Phase 7~9)
│   ├── chat-ai-prompts.ts          # 테마별 AI 시스템 프롬프트 (Phase 7~9)
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

## 14. DB 테이블 현황

### 기존 테이블 (Phase 0~6)

| 스키마 | 테이블 | 설명 |
|---|---|---|
| public | sys_user | 사용자 (Pi + Google 통합) |
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
| public | msg_room | 채팅방 |
| public | msg_room_mbr | 채팅방 멤버 |
| public | msg_msg | 메시지 |
| public | msg_msg_reac | 메시지 이모지 반응 |
| public | msg_attch | 채팅 첨부파일 |
| public | msg_subscr_plan | 구독 플랜 정의 |
| public | msg_subscr | 사용자 구독 현황 |
| public | msg_stkr_pack | 스티커 팩 |
| public | msg_stkr | 스티커 개별 항목 |
| public | msg_usr_stkr | 사용자 보유 스티커 |
| public | msg_tip | Pi Tip 내역 |

---

## 15. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1.0 | 2026-06-05 | 초안 작성 — Pi Network 플랫폼 기준 |
| v2.0 | 2026-06-05 | Phase 0~3 진행 상황 반영 |
| v3.0 | 2026-06-07 | Phase 4~6 완료 반영. 다국어 아키텍처 상세화. 환경변수·디렉토리 전면 업데이트 |
| v4.0 | 2026-06-07 | Phase 7~9 PiChat 통합. 섹션 11 신규 추가 (테마 시스템·구독 티어·인라인 트리거·DB 13개·API·Realtime·탈중앙화). Next.js 16·TypeScript 6 업그레이드 반영. `docs/PRD_CHAT.md`에서 핵심 내용 통합 |
