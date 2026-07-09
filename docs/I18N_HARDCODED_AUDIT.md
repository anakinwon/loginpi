# i18n 하드코딩 한국어 감사 — 잔여 작업 정본 (2026-07-09)

> 배경: 2026-07-09 i18n 전수 전환(커밋 4c8d1591)에서 **화면 컴포넌트 계층은 완결**(UI 노출 837줄→100줄).
> 본 문서는 그 잔여분 — 주로 **API 에러 메시지(~1,000줄/190여 파일)** — 의 감사 결과와 처리 전략이다.
> 권장 전략: 파일별 t() 전환이 아니라 **공유 에러코드 카탈로그(ko/en) 신설 → API `{ error, code }` 반환 → 클라이언트 `t(code)` 해석**.
> 추가 보류 2건: `payError.includes('충전')` 조건분기(group-room-creator.tsx:602)·`chat-auth.ts` plan_nm — 에러코드화 단계에서 함께 처리.

> ## ✅ P2-A/B·성공 message 완결 (2026-07-09 저녁, 커밋 09bc3f4c·74c195f8)
> - admin API 82파일/233지점 → apiError 전환(기존 재사용 + 신규 ADM_ 141코드, 카탈로그 4파일: admin-stats·admin-std·admin-content·admin-ops)
> - 성공 message → apiMessage()/useApiMessage (apiMsgs 5코드) · admin lib: stats-labels(adminAnalytics.theme 재사용)·ABC차트 전환, telegram-webhook은 비노출 확인
> - 457키(에러 451+메시지 등) × 66언어 완주·운영DB 델타 85,916행 반영. 정당 잔존만 유지(sanitizeError 폴백=KISA·Pi memo·AI 프롬프트·DB 저장값)
> - 최종 잔여(소규모 후속): analytics 차트 라벨맵(소비 컴포넌트 동시 개편 필요) · ops-deploy MASTER 동적 문구 12종 · chat-auth plan_nm · payError.includes('충전') 분기
>
> ## ✅ P1-C 완결 (2026-07-09 오후, 커밋 124edb4·cdb832d9·8771de21·7fe339fa·9f43bb4d)
> 사용자 API 에러 **107개 route / 약 487지점 전량** 에러코드 체계로 전환 완료.
> - 아키텍처: `src/lib/api-errors/`(공통 23 + 도메인 287 = **310코드**, 도메인별 파일로 분리) + `apiError(code, status, params?)` → `{ error: 한국어 폴백, code, params }` 반환 + 클라이언트 `useApiErrorMessage()` 훅(`src/hooks/use-api-error.ts`) — code 없으면 error 폴백이라 **미전환 소비처 하위호환**
> - 번역키: `messages/ko.json`·`en.json` `apiErrors` 네임스페이스 310키(카탈로그와 3중 정합 검증 0불일치). **비 ko/en 187개 locale은 증분 번역 파이프라인 대상**(차기 배치)
> - 소비 컴포넌트 전환 6곳: group-room-creator(충전 분기 code화 — 보류건 ① 해소)·custom-sticker-creator·shop-claim-dialog·shop-bond-card·FeedbackForm·client-bean-wallet. 나머지 `d.error ?? fallback` 소비처는 폴백으로 동작하며 점진 전환
> - 부수 개선: 'PI_SESSION_SECRET 미설정' 등 서버 변수명 노출 → SERVER_CONFIG 일반화(KISA IL)
> - **신규 규칙: 사용자 API 에러 응답은 반드시 `apiError()`로 반환** (한국어 리터럴 직접 반환 금지)
> - 잔여: P1-A/B(15파일 ~40줄, 개별 t()) · P2-A/B(admin 86파일 — 동일 코드맵 확장) · 성공 message 필드(각 도메인 보고 목록 참조) · chat-auth.ts plan_nm(보류건 ②)

# 회색지대(gray) 한글 재분류 감사 결과

**대상**: `hangul-scan.json`의 gray 분류 2,218줄 / 340파일 중, 제외 필터(타 에이전트 담당분) 적용 후 **239파일**을 코드 문맥으로 판정.

**핵심 확증**: 프론트가 API 응답의 `error` 필드를 **그대로 화면에 표시**한다. 소비 코드에서 확인:
- `group-room-creator.tsx:235` `throw new Error(d.error ?? t('createFail'))`
- `shop-claim-dialog.tsx:88` `toast.error(data.error ?? '등록에 실패했습니다')`
- `FeedbackForm.tsx:62` `setError(json.error ?? '후기 저장에 실패했습니다.')`
- `client-bean-wallet.tsx:85`, `custom-sticker-creator.tsx:60`, `shop-bond-card.tsx:57` 등 전 도메인 공통

→ 비-제외 API 라우트의 `NextResponse.json({ error: '한국어' })`는 거의 전부 사용자 노출 → 전환 대상.

---

## 1. 전환 필요 파일 목록

### P1-A. 일반 사용자 · JSX 직접 렌더 (최우선, 개별 t() 키 필요)

| 파일 | 노출 라인 수 | 대표 예시 | 권장 처리 |
|---|---|---|---|
| `src/app/global-error.tsx` | 3 | "문제가 발생했습니다" / "일시적인 오류일 수 있어요…" / "다시 시도 / Retry" | 컴포넌트 t(). ⚠️루트 에러바운더리라 i18n provider 밖일 수 있음 → 이중언어 하드코딩 유지도 검토 |
| `src/app/not-found.tsx` | 3 | "페이지를 찾을 수 없습니다" / "요청하신 페이지가 없거나…" | 위와 동일 |
| `src/app/[locale]/layout.tsx` | 2 | APP_TITLE "CafePi — Pi 커뮤니티 카페…" / meta description | `generateMetadata` + getTranslations |
| `src/app/[locale]/bean/page.tsx` | 1 | "현재 이용할 수 없는 메뉴입니다." | 컴포넌트 t() |
| `src/app/[locale]/store/shop/[shopId]/page.tsx` | 4 | "매장을 찾을 수 없습니다" / "✅ 인증" / "· 🛵 배달가능" | 컴포넌트 t() |
| `src/app/[locale]/store/my/orders/[orderId]/feedback/page.tsx` | 2 | "← 구매 내역으로" / "현재 이용후기 작성을 일시 중지했습니다." | 컴포넌트 t() |

### P1-B. 일반 사용자 · lib/hook (JSX로 흐르는 상수·에러)

| 파일 | 노출 라인 수 | 대표 예시 | 권장 처리 |
|---|---|---|---|
| `src/lib/display-mask.ts` | 2 | "익명" (이름 폴백) | **모든 화면 username 표시에 등장** — 우선. t() 주입 or 카탈로그 |
| `src/components/feature-flag-provider.tsx` | 2 | "무료" / `${beanAmt} Bean` (요금 라벨) | useMicroFeeLabel류로 화면 표시 → t() |
| `src/lib/geo.ts` | 4 | "위치 권한이 차단되어 있습니다…" 등 4종 | 위치 실패 시 사용자 표시 → 에러코드/카탈로그 |
| `src/hooks/use-chat-room.ts` | 2 | "오늘 무료 번역 한도를 모두 사용했어요…" / "번역 서버에 연결할 수 없습니다…" | (363은 console — 제외) t() |
| `src/hooks/use-voice-channel.ts` | 7 | "마이크 권한이 거부되었습니다…" / "상대와 음성 연결에 실패했습니다…" | setJoinError 화면 표시 → t() |
| `src/lib/image-resize.ts` | 2 | "이미지를 불러올 수 없습니다" / "이미지 변환 실패" | 업로드 에러 노출 → t() |
| `src/lib/chat-auth.ts` | 2 | plan_nm "Pi Host (운영자)" / "PyCafé™ 구독" | 구독 상태 화면(profile) 표시. profile 페이지는 타 에이전트 담당이나 **문자열 원본이 여기** → 조율 필요 |
| `src/lib/chat-webhook.ts` | 5 | "Webhook URL은 https만 허용됩니다" 등 | 방장 Webhook 관리 UI에 error 반환 → 카탈로그 |
| `src/lib/sanitize-error.ts` | 1 | DEFAULT_PUBLIC_MSG "데이터 처리 중 오류가 발생했습니다" | 다수 API 공개 폴백 → 카탈로그 |

### P1-C. 일반 사용자 API 에러 메시지 (최대 버킷, **에러코드화 권장**)

**106개 파일 / 약 600줄** (`src/app/api/**`, admin·cron 제외). `error`가 프론트에 그대로 표시됨. 도메인별 파일 수·예시:

| 도메인 | 파일 수 | 대표 예시 |
|---|---|---|
| chat | 22 | "카페 멤버가 아닙니다" / "Bean 잔액이 부족합니다. 충전 후 다시 시도하세요." / "PyTranslate™는 구독자 전용입니다" / "AI 월 호출 한도를 초과했습니다" |
| store | 21 | "본인 매장이 아니거나 존재하지 않는 매장입니다" / "매장에서 N m 떨어져 있습니다…" / "이미지 크기는 1MB 이하여야 합니다" |
| board | 8 | "존재하지 않는 게시판입니다" / "제목을 입력해주세요" / "첨부파일은 최대 N개까지…" |
| location | 7 | "위치기반서비스 이용약관에 동의하지 않으셨습니다" / "유효하지 않은 좌표값입니다" |
| voice | 7 | "동시 보이스챗은 멤버 최대 N명까지입니다" / "음성채널 참여 중이 아닙니다" |
| subscriptions | 6 | "레거시 Pi 구독은 종료되었습니다. Bean 구독(/subscribe)을 이용해 주세요." |
| auth | 5 | "유효한 6자리 코드를 입력해주세요" / "코드가 만료됐습니다 (10분 초과)" |
| event | 5 | "미션 진행도 조회 실패" / "π 선물" |
| feedback | 4 | "별점은 1~5점이어야 합니다" / "후기가 저장되었고, N Bean 보상을 받으셨습니다!" (성공 메시지도 노출) |
| bean/badges/campaign/stickers/payments | 각 3 | "최소 N Bean(1π)부터…" / "이미 강화된 배지입니다" / "Pi 승인 실패 (…)" |
| tips/tip-presets/consent/report/lbs | 각 1 | "자기 자신에게 Bean을 보낼 수 없습니다" / "만 N세 미만은 법정대리인(보호자)의 동의가 필요합니다" |

**권장**: 파일별 t()가 아니라 **에러코드 카탈로그**. 중복이 극심 — "로그인이 필요합니다"(≈60회), "권한이 없습니다", "잘못된 요청 본문", "조회/저장/삭제 실패" 등 상위 10여 개 코드가 전체 절반 이상 커버.
→ ① 공유 코드→메시지맵(ko/en) 신설 → ② API `{ error, code }` 반환 → ③ 소비부 `d.error ?? fallback`을 `t(code)` 조회로 교체. 106개 파일 개별 대신 코드맵 1개 + code 부여로 종결.

### P2-A. 관리자 API 에러 메시지

**82개 파일 / 385줄** (`src/app/api/admin/**`). 동일 패턴으로 admin UI에 표시. 대표: "권한이 없습니다(MASTER 전용)" / "발행액(bean_amt)은 1 이상…" / "테마 코드는 영문 대문자·숫자·_…". 포함된 **라벨 맵**도 렌더:
- `api/admin/analytics/orders` 25~28: DINE_IN "매장 이용" / PICKUP "픽업" 등 (차트 축)
- `api/admin/analytics/pageviews` 14~19, `performance` 21~24: 유입경로·활동 라벨
- `api/admin/token/stats` 101,104: "이벤트 #2 · …" / "캠페인 · …" / "기타"
- 다수 admin stats의 `'(이름 없음)'` 폴백

### P2-B. 관리자 lib/charts

| 파일 | 예시 | 비고 |
|---|---|---|
| `src/lib/stats-labels.ts` | "구독" / "빈(Bean)" / "직접 전송" / "상품 구매" / "기타" | admin 매출 차트 4곳 사용 |
| `src/components/charts/revenue-abc-chart.tsx` | hovertemplate "누적: …" | admin 차트 |
| `src/lib/ops-deploy.ts` | "승격할 커밋 없음(이미 최신)" / "운영DB… 차단" | MASTER 배포 화면 에러 |
| `src/lib/telegram-webhook.ts` | detail "(미등록)" | admin 진단 |

---

## 2. 제외 (비노출) — 다른 에이전트가 건드리지 않도록 명시

- **`src/env.ts`** — 빌드타임 zod 검증(3줄), 사용자 무관
- **Pi 결제 memo 문자열** — 여러 API·lib의 `memo:`/`memo_txt:` ("Bean N 충전", "🛒 PyShop 에스크로 결제", "프리미엄 카페 생성료 …" 등). ⛔**전환 금지** — CLAUDE.md 철칙(Pi memo는 코드값 취급, ™·특수문자 결제 호환 파손 위험). Pi Wallet에 표시되나 앱-화면 i18n 대상 아님
- **텔레그램/이메일 발송 본문** — `lib/email.ts`, `chat-noti.ts`, `mps-noti.ts`, `trade-noti.ts`, `chat-relay.ts`, `chat-badge.ts`, `api/telegram/webhook`, `lib/telegram-webhook.ts` 발송부 (수신자 한국어 의도)
- **서버 로그/throw/저장값** — `mps-order.ts`·`mps-refund.ts`·`mps-bond.ts`(정산 memo·CRITICAL 로그), `tip-pi-reward.ts`·`fbck-pi-reward.ts`·`campaign-pi-reward.ts`·`pi-reward.ts`(fail_reason_tx·헤더·빈줄 다수 false positive), `bean.ts`(note_txt "관리자 수정"), cron 3종, `chat-translate*.ts` 로그, `supabase-admin/client.ts`(dev init throw)
- **AI 시스템 프롬프트** — `chat-ai-prompts.ts` (LLM 전송용, 화면 미표시)
- **법률 문서 페이지** — `docs/agreement/lbs/page.tsx`, `docs/legal/[doc]/page.tsx` (한국어 정본 의도 + doc 파일 선택 로직)
- **스파이크/랩 페이지** — `voice-test/page.tsx`, `voice-test/_components/spike-runner.tsx`, `glasslab/page.tsx` (진단/데모, glasslab 라인은 대부분 false positive)
- **false positive** — `lib/event.ts`(85·654·663은 `.from('sys_user')` 등 테이블명), `lib/navigation.ts`(31·44 `return null`), 다수 `-reward.ts`의 빈줄·헤더 라인

---

## 3. 우선순위 · 요약 통계

### 우선순위 (일반 사용자 노출 > admin > 기타)
1. **P1-A/B** — 일반 사용자 직접 노출, 15파일 · ~40줄. 손수 t() 키. 특히 `display-mask '익명'`, `feature-flag-provider '무료'`는 전 화면 등장
2. **P1-C** — 사용자 API 에러, 106파일 · ~600줄. **에러코드 카탈로그**로 일괄. 노출 총량 최대이나 중복이 커 코드맵 1개로 대부분 해결
3. **P2-A/B** — 관리자 API·lib, 86파일 · ~400줄. 동일 코드맵 확장 + admin 라벨 맵 t()

### 통계 (제외 필터 후 gray 239파일 기준)
- **전환 필요: 약 207파일 / ≈1,040줄**
  - 일반 사용자 JSX/lib: 15파일 (~40줄)
  - 일반 사용자 API 에러: 106파일 (~600줄)
  - 관리자 API 에러+라벨: 82파일 (385줄)
  - 관리자 lib/charts: 4파일 (~15줄)
- **제외(비노출): 약 32파일** (env.ts, 결제 memo, 텔레그램·이메일, 로그/throw, AI 프롬프트, 법률·스파이크 페이지, false positive)

### 전략 제언
P1-C·P2-A가 물량의 95%인데 반복 문자열이 지배적. 파일별 t() 전환보다 **공유 에러코드 카탈로그(ko/en) 신설 → API `code` 필드 부가 → 클라이언트 소비부를 `t(code)`로 교체**가 훨씬 적은 diff. P1-A/B의 순수 JSX 문자열만 개별 t() 키로 처리.
