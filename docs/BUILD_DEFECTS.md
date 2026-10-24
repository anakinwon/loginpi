# 구축 결함 원장 — 전 시스템 R-P0~P6 점검·수정 추적

> 정본 규칙 : 루트 `CLAUDE.md` '구축 결함 재발 방지 R-P0~P6' · 출발 사례 : `sitemap/schema.pi/docs/TROUBLESHOOT.md` TS-01
> 자동 장치 : `.claude/hooks/build-defect-guard.mjs`(코드를 쓸 때마다 경고 + `--scan <디렉터리>` 전수 검사)
> 대상 : 이 저장소의 모든 시스템 — 현재 cafe.pi·sitemap.pi·schema.pi, **이후 신규 15개+ 시스템도 첫 배포 전 이 원장에 1절 추가**

## 0. 장치와 한계

| 장치 | 잡는 것 | 못 잡는 것 |
|---|---|---|
| `build-defect-guard` 훅(PostToolUse Write·Edit) | 방금 쓴 코드 조각의 R-P1(연달아 있는 독립 await 원격 호출)·R-P3(`select('*')`·`count:'exact'`)·R-P4(외부 fetch 타임아웃 없음)·R-P6(dev 코드 운영 가드 없음) | 떨어진 위치의 직렬 조회, N+1 루프(R-P2), 전량 로드 후 메모리 집계, 경합(R-P5) — 사람·검토 에이전트 몫 |
| `--scan` 전수 검사 | 위와 같은 패턴을 디렉터리 전체에서 | 2026-10-24 기준 schema.pi 에서 에이전트 확신 높음 P1 19건 중 2건만 잡음 → 보조 수단 |
| 서브에이전트 전수 점검(이 원장 2절) | 코드를 읽어 P1~P6 판정 | 실측 지연(ms) — 모니터링으로 확인 |

## 1. 신규 시스템 체크리스트 (15개+ 구축 시 매번)

1. 시스템 CLAUDE.md 는 루트 R-P0~P6 상속 1줄 + 그 시스템 공용 함수 예시만(규칙 복제 금지)
2. 공용 함수(세션·권한·요금제 확인)는 처음부터 `Promise.all` — 모든 API 에 곱해진다(TS-01 #11)
3. 첫 운영 배포 전 `node .claude/hooks/build-defect-guard.mjs --scan <앱>/src` 0건 또는 사유 기록 + 서브에이전트 P1~P6 점검 1회 → 이 원장에 절 추가
4. 외부 HTTP 는 공용 래퍼 하나로(타임아웃 기본값 포함) — 호출부마다 fetch 금지
5. 운영 모니터링 연결(schema.pi 모니터링 방식) 후 첫 주 느림·오류를 이 원장에 기록, 결함이면 R-P0(형제까지 한 커밋)

## 2. 2026-10-24 전수 점검 결과 (서브에이전트 4개, 읽기 전용, 확신 높음만)

등급 : **A** = 인증·결제 아님·기계적 수정(바로 수정 가능) / **B** = 인증·결제·Pi 로그인 경로(타임아웃 값 결정 + Pi Browser 실기기 검증 필요) / **C** = 설계 변경(DB RPC·집계 뷰·쿼리 재구성)

### 2.1 schema.pi (29행 — P1 20 · P2 7 · P5 2, P3·P4·P6 위반 없음)

| P | 위치(`sitemap/schema.pi/src/`) | 내용 | 등급 | 상태 |
|---|---|---|---|---|
| P1 | `lib/api.ts:258` | `currentUser()` 뒤 `areaPlan` 직렬(공용·모든 API) | B | ✅ 수정 |
| P1 | `lib/model-phy.ts:64` `loadPhy` | 모델 확인 뒤 테이블·칼럼 조회 | A | ✅ 수정 |
| P1 | `lib/model-phy.ts:149` `syncPlan` | `entInfoOf`→`phyPlan`, 청크 루프 직렬 | A | ✅ 수정 |
| P1 | `lib/model-dgm.ts:48` `loadDgm` | `phy_tbl` 뒤 `dgm_rel`·`dgm_ent` | A | ✅ 수정 |
| P1 | `api/…/physical/route.ts:58` | `loadPhy` 뒤 `phyPlan` | A | ✅ 수정 |
| P1 | `api/…/attributes/route.ts:42` | `getEnt`→`std_term`→`nextSeq` | A | ✅ 수정 |
| P1 | `lib/model.ts:96` `prepareEnt` | `mdl_subj`→`entWords` | A | ✅ 수정 |
| P1 | `api/…/entities/route.ts:47` | `std_dic`→`withActors` | A | ✅ 수정 |
| P1 | `api/…/terms·domains·key-domains·entity-classes/route.ts` | 권한 뒤 `pendingChg` 직렬(words #24 의 형제 4곳) | A | ✅ 수정 |
| P1 | `api/…/key-domains/route.ts:49` | 건수→`withActors` | A | ✅ 수정 |
| P1 | `api/…/approvals/route.ts:46` | 이름 조회 4회 직렬 | A | ✅ 수정 |
| P1 | `lib/home.ts:25` | 멤버→`lst_area_id` | A | ✅ 수정 |
| P1 | `api/mon/app/route.ts:26` | `addApp`→`addAppEvt`(모니터링 수집) | A | ✅ 수정 |
| P1 | `api/…/subjects/suggest/route.ts:47` | `ex`·`eq` 가 첫 `Promise.all` 밖 | A | ✅ 수정 |
| P1 | `api/…/versions/route.ts:36` | 스냅샷 a→b→현재, POST 현재→mx | A | ✅ 수정 |
| P1 | `lib/model-ddl.ts:24` | `ddlTargets`·`buildDdl` 직렬 | A | ✅ 수정 |
| P1 | `lib/change.ts:70` | `inUse`·`wordNameError` 3조회씩 | A | ✅ 수정 |
| P1 | `api/…/domains/route.ts:57` | 검증 4단계 직렬 | A | ✅ 수정 |
| P1 | `lib/bulk-check.ts:39…` | 100개 청크 for+await(`inChunks` 있음) | A | ✅ 수정 |
| P1 | `api/payments/approve/route.ts:40` | 결제 승인 3조회 직렬 | B | ✅ 수정 |
| P2 | `lib/model-stage.ts:96` `setPhy` | 테이블마다 같은 `phyPlan` N회 | A | ✅ 수정 |
| P2 | `lib/model-stage.ts:156` `setDgm` | `loadDgm` 결과 두고 `findDgm` 재조회 | A | ✅ 수정 |
| P2 | `lib/model-fk.ts:29`·`fk-plan/route.ts:58` | 단계마다 `nextSeq`·`std_term` 재조회 | A | ✅ 수정 |
| P2 | `lib/home.ts:44` | 가진 `user` 를 `requireAreaRole` 이 재조회 | B | ✅ 수정 |
| P2 | `api/…/relations/[relId]/route.ts:44` | 권한 2회·감사 insert 루프 | A | ✅ 수정 |
| P2 | `api/…/plan/route.ts:134`·`lib/plan.ts` | `areaPlan`·`feePlans` 재조회 | B | ✅ 수정 |
| P2 | `lib/sql-run.ts:315` | `getConn` 2회 | A | ✅ 수정 |
| P5 | `attributes/[attrId]/route.ts:76`·`model-fk.ts:29`·`fk-plan/route.ts:65` | `nextSeq` 충돌 재시도 없음(#29 형제), 23505 를 ATTR_DUP 로 오표시 | A | ✅ 수정 |
| P5 | `model/relations.tsx:52` + 호출처 3곳 | **#31 의 `locked` prop 을 아무도 안 넘김 — 화면 가드가 실제로 꺼져 있음**, `attrs.tsx` 잠금 가드 없음 | A | ✅ 수정 |

### 2.2 sitemap.pi + 공용 패키지 (9건 — P1 3 · P2 3 · P3 2 · P4 1)

| P | 위치 | 내용 | 등급 | 상태 |
|---|---|---|---|---|
| P4 | `packages/pi-auth/src/route.ts:117` | **Pi `/v2/me` 타임아웃 없음 — 공용, 3시스템 로그인 영향** | B | ✅ 수정 |
| P1 | `sitemap.pi/src/app/api/payments/approve/route.ts:112` | 요금 조회 직렬 | B | ✅ 수정 |
| P1 | `…/payments/prepare/route.ts:122` | 요금 3조회 직렬 | B | ✅ 수정 |
| P1 | `sitemap.pi/src/lib/api.ts:193` `checkSiteWrite` | 독립 count 4개 직렬 | A | ✅ 수정 |
| P2 | `components/google-auth.tsx:35` | 화면마다 `/api/auth/me` 3회 | B | ✅ 수정 |
| P2 | `api/cron/site-sts-sweep/route.ts:129` | 루프 안 `pi_pymnt` 조회(N+1) | B | ✅ 수정 |
| P2 | `api/cron/site-sts-sweep/route.ts:92` | RPC 최대 50건 직렬 | C | ✅ 수정 |
| P3 | `api/sites/[domain]/route.ts:37` | 일별 조회수 전 행 받아 JS 합산(1000행 상한 시 과소) | C | ✅ 수정(sql/018 DB 적용 대기 — 미적용이면 기존 합산 폴백) |
| P3 | `lib/payments.ts:92` `getPlanRemaining` | 전 행 받아 메모리 집계 | B | ✅ 수정 |

### 2.3 cafe.pi 사용자 경로 (25 지점 — P1 6 · P2 2 · P3 2 · P4 15 — Telegram 행은 위치 2곳이 결함 1건)

| P | 위치(`src/`) | 내용 | 등급 | 상태 |
|---|---|---|---|---|
| P1 | `app/[locale]/layout.tsx:75` | **루트 레이아웃 DB 3회 직렬 — 모든 페이지** | A | ✅ 수정 |
| P1 | `app/api/chat/rooms/[roomId]/messages/route.ts:125` | 메시지 전송마다 멤버·최근 수 직렬 | A | ✅ 수정 |
| P1 | `app/[locale]/chat/[roomId]/page.tsx:155` | 테마 이모지 조회가 `Promise.all` 밖 | A | ✅ 수정 |
| P1 | `app/api/feedback/route.ts:78` | 이미지·사용자 조회 직렬 | A | ✅ 수정 |
| P1 | `lib/chat-room-list.ts:71` | 부스트 방→일반 방 직렬 | A | ✅ 수정 |
| P1 | `lib/mps-item.ts:320` | 상품 상세 매장 조회 직렬 | A | ✅ 수정 |
| P2 | `lib/chat.ts:201` | 방마다 멤버 조회(N+1) | A | ✅ 수정 |
| P2 | `lib/event.ts:259` | 행위마다 이벤트×미션 N+1(after) | C | ✅ 수정 |
| P3 | `app/api/feedback/route.ts:137` | 별점 전량 메모리 집계 | C | ✅ 수정 |
| P3 | `app/api/location/nearby/shops/route.ts:32` | 좌표 매장 전량 후 메모리 거리 필터 | C | ✅ 수정 |
| P4 | `app/api/auth/pi/route.ts:106` 외 4곳(pi-redirect·pi-code·link-start·link-status) | Pi `/v2/me` 타임아웃 없음 | B | ✅ 수정 |
| P4 | `app/api/payments/approve·complete·cancel` | Pi 결제 API 타임아웃 없음 | B | ✅ 수정 |
| P4 | `payments/complete/route.ts:135`·`lib/telegram.ts:74` | 결제 완료 응답 안에서 Telegram 대기 → `after()` | B | ✅ 수정 |
| P4 | `lib/realtime-broadcast.ts:17` | 채팅 전송마다 Realtime fetch 타임아웃 없음 | A | ✅ 수정 |
| P4 | `lib/google-maps.ts:86` | Geocode 타임아웃 없음 | A | ✅ 수정 |
| P4 | `lib/tip-pi-reward.ts`·`campaign-`·`fbck-`·`pi-reward.ts` | A2U 타임아웃 없음 | B | ✅ 수정 |

### 2.4 cafe.pi 관리자·크론 (19건 — P1 3 · P2 1 · P3 6 · P4 4 · 일반 fetch 5)

| P | 위치(`src/app/`) | 내용 | 등급 | 상태 |
|---|---|---|---|---|
| P1 | `api/admin/open-promo/route.ts:23`·`fee-mode/route.ts:20` | 현재·이력 조회 직렬 | A | ✅ 수정 |
| P1 | `api/admin/stickers/[packId]/items/route.ts:85` | 파일 20개 업로드 직렬 | A | ✅ 수정 |
| P2 | `api/admin/event/exclude/route.ts:92` | 이름마다 3왕복, 상한 없음 | A | ✅ 수정 |
| P3 | `api/admin/links/route.ts:17`·`subscriptions/route.ts:40` | 페이지네이션 없는 전량(데이터 패칭 표준 ① 위반) | A | links ✅ 수정 / subscriptions 보류(아래 2.7) |
| P3 | `api/admin/event/completions`·`stickers/route.ts:32` | 전량 메모리 집계 | C | stickers ✅ 수정 / completions 보류(아래 2.7) |
| P3 | `api/admin/analytics/usage:42`·`orders:66` | 기간 전량 메모리 집계 | C | 보류(아래 2.7) |
| P4 | `api/cron/a2u-probe:78`·`admin/payments/a2u-status:46` | Pi·Horizon 타임아웃 없음 | B | ✅ 수정 |
| P4 | `api/admin/i18n/translate:62`·`translate-all:47` | Gemini·자기 호출 타임아웃 없음 | A | ✅ 수정 |
| 기타 | `[locale]/(admin)/admin/campaign·std/domains·std/terms·std/words·store/categories` 페이지 | **일반 `fetch` — Pi Browser 401**(piFetch 교체) | A | ✅ 수정 |

### 2.5 합계

| 시스템 | 확신 높음 | A | B | C | 확신 중간(별도) |
|---|---|---|---|---|---|
| schema.pi | 29행(에이전트 집계 28) | 25 | 4 | 0 | 19 |
| sitemap.pi·공용 | 9 | 1 | 6 | 2 | 16 |
| cafe.pi 사용자 | 16행(25 지점) | 9 | 4 | 3 | 9 |
| cafe.pi 관리자·크론 | 9행(19건) | 6 | 1 | 2 | 7 |

## 2.6 확신 중간(51건) — 남은 기록

점검 에이전트가 위치째 넘긴 대표 항목만 남는다(나머지는 건수만 — 세션 밖 원문 없음, 수정 전 재점검 `[TBD]`).

| 시스템 | 건수 | 대표 항목 |
|---|---|---|
| schema.pi | 19 | 쓰기 루프 9건(`syncPhy`·`setLgc`·physical PATCH:254·`attributes/order`:35·propagate:99·`applyCodes`·`approvals/batch`·`resolve-nm`·`delPhy` — `ver_no`·유일 인덱스 순서 의도 가능), `lib/auth.ts:100` 요청마다 비-await `lst_lgn_dtm` UPDATE(인증), `lib/change.ts:150`·`entities/[entId]/route.ts:12`·`attributes/[attrId]/route.ts:52` `select('*')`(감사 전체 행 필요 가능), `physical/idx` POST 전체 `loadPhy`, `words/route.ts:61` 진단 `console.log` 상시 출력 |
| sitemap.pi·공용 | 16 | `packages/pi-db/src/users.ts:119`(로그인 직렬)·`:248,259`(인증 전체 칼럼), `lib/auth.ts:31`, `src/auth.ts:72`, `api/fee-plans/route.ts:13`, `components/my-sites.tsx:91`, `lib/payments.ts:139`·`:166`(결제 타임아웃 8초), `components/bubble-home.tsx`, `api/sites/route.ts:40`, P5 4건(`payments/approve:112` 비원자 확인·`me/sites:55` 상한 경합·`auth/link-complete:40`), P6 `api/bubbles/route.ts:73` 운영에서 demo 노출 |
| cafe.pi 사용자 | 9 | `lib/users.ts:255` 모든 요청 `sys_user` 전체 칼럼(인증)·`:83` 로그인 2왕복, `lib/chat.ts:182` 직거래 방 중복 생성 경합, `chat/[roomId]/page.tsx:73`, `store/items/route.ts:33`, `lib/board.ts:45`, `exchange-rates`·`pi-price` 타임아웃(캐시 있음), P6 `[locale]/voice-test/page.tsx` 운영 가드 없음 |
| cafe.pi 관리자·크론 | 7 | `api/cron/campaign-grant-all:105`(선착순 순서 의존 가능), `api/admin/stats/aggregate:45`, `api/cron/event-bean-reward:96`·`admin/event/bond-reward:102`, `admin/campaign/grant-all:109`, `cron/chat-noti:24`, `admin/std/approvals:19`·`i18n/stats:43` `select('*')` |

## 2.7 보류(설계 변경 — 상향 조건 명시, 2026-10-24)

실측 행 수가 작고 정확도 문제가 없어 지금은 고치지 않는다. **상향 조건에 닿으면 R-P0 로 즉시 처리**(고객 결재 아님). 감지 = 4개 API 가 500행 초과 시 `console.warn('[BUILD_DEFECTS 2.7] …')`(Vercel 로그). `admin/subscriptions` 목록은 데이터 패칭 표준 ①(예외 없음)의 **임시 예외** — 마스터 확인 대상.

| 위치 | 보류 이유(실측 2026-10-24) | 상향 조건 · 방법 |
|---|---|---|
| `api/admin/subscriptions` | 통계 차트(`SubscrStatsCharts`)가 전체 행 필요, 활성 구독은 사용자×상품으로 상한(3행) | 500행 초과 → 서버 집계 API + 목록 서버 페이지네이션(links 방식) |
| `api/admin/event/completions` | 종료 이벤트(`evt-20260614-001`) 완료 기록 59행, 직렬 2조회만 병렬화 | 새 이벤트에 재사용 시 → 사용자별 count RPC |
| `api/admin/analytics/usage`·`orders` | 활동 로그 90일 42행·주문 0행, cafe.pi 루트에 DB 마이그레이션 도구 없음 | 기간 행 수 500 초과(PostgREST 1000행 상한 전) → 집계 RPC + 적용 도구 |

**R-P4 타임아웃 예외 값(2026-10-24 결정)** — 기본 2초 대신 : Pi `/v2/me` 5초 · Pi 결제·A2U 10초 · Telegram·Horizon 5초 · Gemini 번역 30초(전체 일괄 240초, 동기화 60초). 실패해도 각 호출부의 기존 실패 경로(try/catch)로 간다.

## 3. 수정 이력

| 날짜 | 시스템 | 등급 | 처리(패턴 · 매치 N · 처리 N) | 커밋 |
|---|---|---|---|---|
| 2026-10-24 | schema.pi | A | P1 직렬 조회 · 매치 18행(공용 함수·라우트·bulk-check 묶음 7곳) · 처리 18 — 커밋 메시지의 '19'는 syncPlan 보조 함수를 따로 센 것 | `87c1141d` |
| 2026-10-24 | schema.pi | A | P2 반복 조회 · 매치 5 · 처리 5 / P5 순번 충돌·잠금 가드 · 매치 2 · 처리 2(#31 가드가 실제로 꺼져 있던 것 포함) | `4aa5fe32` |
| 2026-10-24 | cafe.pi | A | P1 직렬 · 매치 6 · 처리 6 / P2 N+1 · 매치 1 · 처리 1 / P4 Realtime·Geocode · 매치 2 · 처리 2 | `f6b505a2` |
| 2026-10-24 | cafe.pi | A | 일반 fetch(인증 필요) · 매치 61 중 대상 12 · 처리 12(부트스트랩·공개 호출 49 는 의도) / 관리자 P1·P2·P4 · 매치 6 · 처리 6 / links 서버 페이지네이션 · 처리 1 | `ebe81731` |
| 2026-10-24 | cafe.pi·sitemap.pi·schema.pi·공용 | B | P4 외부 호출 타임아웃 · 매치 cafe 11파일·pi-auth 1·sitemap 1 · 처리 전부 / P1·P2 결제·권한 · 매치 schema 4·sitemap 5 · 처리 전부 — Pi Browser 실기기 검증 대기 | `ca73b24f`·`5cd4da85`·`9cd43d63` |
| 2026-10-24 | cafe.pi·sitemap.pi | C | event N+1·feedback·nearby·stickers 집계 · 처리 4 / sitemap 조회수 SUM RPC·sweep 동시 5 · 처리 2 / 보류 3(2.7) | `0d915dc7`·`5cd4da85` |
