# 차기 프로젝트 플레이북 — cafe.pi 전 과정의 증류

> **작성일**: 2026-07-17 · **작성자**: 아소카 (검토: 아나킨 마스터)
> **입력**: `docs/REVIEW_TOTAL_2026-07-17.md` (9개 영역 총정리) — 본 문서는 그 결론만 남긴 것
> **목적**: 다음 프로젝트를 **시행착오 없이** 시작한다. cafe.pi가 사고로 배운 것을 여기서는 규칙으로 시작한다.
> **사용법**: 새 프로젝트 Day-1에 이 문서 하나만 읽는다. 각 절은 "철칙 → 이유 한 줄 → 재사용 자산" 순서다.

---

## 0. 시작 전 1시간 — 이것부터 그린다

새 프로젝트에서 코드보다 먼저 만들 것 3가지:

1. **환경×네트워크 매트릭스** (아래 §1 표 양식) — cafe.pi 사고의 절반은 "한 군데만 바꾼 전환"이었다.
2. **CLAUDE.md 초안** — 핵심 가치(절대 불가침 1~2개)·금지 목록·빌드 게이트를 첫날 명문화.
3. **정본 문서 지도** — PRD(라이트)+ROADMAP(1줄 표)+TROUBLESHOOT 3종 골격. 문서는 처음부터 라이트버전 체계로 (나중에 이관하는 비용이 크다).

---

## 1. 환경 설계 — "환경×네트워크 매트릭스" 먼저

**철칙: 모든 시크릿·키·도메인·봇·DB는 (환경 × 외부 네트워크) 좌표를 가진다. 표부터 채우고 시작한다.**

| 항목 | dev | staging | prod | 비고 |
|---|---|---|---|---|
| DB URL/KEY | | | | service_role은 서버 전용 |
| 외부 API 키(결제 등) | | | | 네트워크(테스트/메인) 정합 |
| 지갑 시드/주소 | — | | | 주소는 env 선언, 하드코딩 금지 |
| 봇 토큰/webhook | | | | 환경별 분리 |
| 공개 도메인/딥링크 | | | | 세션이 사는 오리진 기준 |
| 기능 플래그(절제 모드 등) | off | off | on | |

- env 스키마는 **t3-env로 빌드 시점 검증** (`src/env.ts` 재사용). 신규 env=스키마+.env.example **동시 수정**.
- 운영에서만 치명적인 키(CRON_SECRET류)는 **프로덕션 빌드에서 필수로 강제** — 조용한 죽음 차단.
- Vercel env는 **타깃(production/preview)까지** 지정 확인. preview 빌드도 빌드는 돈다.
- ⛔ `.env.local`(실값) 커밋 금지 — 전 파일 커밋 정책의 유일한 예외.

**재사용**: `src/env.ts` · `src/lib/db-env.ts`(3-tier 라우터) · `.env.example` 골격

---

## 2. 인증 — Pi Browser 5대 철칙

**한 줄 요약: 인증 신호는 "성공"만 믿고, 실패·부재·불일치는 전부 "아직 모름"으로 다룬다.**

1. **Pi Browser WebView는 Set-Cookie를 저장하지 않는다** → 쿠키 + `X-Pi-Token` 헤더 이중 경로. 인증 API 호출은 전부 `piFetch` (일반 fetch는 "PC 정상·실기기 401" 잠복 버그).
2. **UA로 인증을 사전 차단하지 않는다** — window.Pi 존재≠Pi Browser, UA 패턴≠실기기. 유일 신호=`authenticate()` 성공.
3. **마운트 직후 401="아직 모름"** — 자동인증은 비동기 레이스. 200 응답만 상태 정본으로 반영, 401로 캐시를 지우지 않는다.
4. **불변키를 정하고 지킨다** — 플랫폼 uid는 (앱×네트워크) scoped라 재발급된다. 사람의 키=username류 불변값(UNIQUE 강제+재바인딩 폴백). 이메일 폴백 등 3단 조회.
5. **미인증 시 redirect 금지** → 클라이언트 게이트 렌더 (WebView 무한 루프).

+ 프록시 뒤 NextAuth는 `trustHost: true` 필수. 세션 표시 소유권(어느 버튼이 어느 세션을 표시하나)을 처음부터 정의.

**재사용**: `.claude/skills/pi_auth`·`pi_google_link` SKILL.md · `src/lib/pi-fetch.ts` · `auth-check.ts`(통합 세션+타입 술어 게이트)

---

## 3. 결제 — 돈은 원칙 3개

1. **U2A는 `/complete` 미구현 시 그 사용자의 모든 미래 결제가 영구 차단** — approve/complete/미완결 복구 3종은 첫 구현에 포함.
2. **유출(A2U)은 플랫폼 게이트가 있다** — 승인·개방 전엔 `feature_not_available`이 정상. "버그 아님" 판별표와 개방 시 런북을 미리 만든다. 고액 유출은 관리자 승인 게이트(무인 자동송금 금지).
3. **장부 무결성은 RPC 원자성으로** — 금액·통화 누락 0, 소급은 소스 실재 건만, 환불은 매출이 아니다(집계·랭킹 제외).

**재사용**: `.claude/skills/pi_pay` SKILL.md · `api/payments/approve|complete` · refund-sweep(멱등 30일 윈도우) 패턴

---

## 4. DB — 처음부터 지키면 공짜인 것들

- **DA 표준 4종 세트**: 시스템 컬럼 4개(regr/reg/modr/mod) · 논리삭제(del_yn — 물리 DELETE 금지) · 도메인 접두사 명명 · TEXT/VARCHAR(CHAR(n) 금지).
- **클라이언트 초기화는 전부 lazy** — 모듈 스코프 `createClient(env)`는 빌드(collect page data)에서 폭발한다. 단일 `getSupabaseAdmin()` 경유.
- **집계는 catch-all 구조** — 열린 집합(결제 type 등)을 화이트리스트로 집계하면 성장이 곧 구멍. "명시 분류 + 나머지 전부 UNKNOWN 수용". 배치 성공≠데이터 정확(0건 삽입도 성공이다).
- **FK 정책은 조회 방식과 세트로 결정** — PostgREST 임베디드 조인을 쓰면 FK가 계약이다. 제거는 "조인 대체 → 개별 제거" 순서만.
- 연결은 pooler(Session) 경유 · 부분일치 검색=pg_trgm GIN 표준 · 단건=`.maybeSingle()`.
- 함수 교체 전 `pg_get_functiondef`로 배포본 대조, 교체 후 **백필**(멱등 재계산)까지가 한 작업.

**재사용**: `docs/da/데이터표준규칙.md` · da-ddl-guard 훅 · da-team 하네스 · `supabase-admin.ts`

---

## 5. i18n — source of truth를 첫날 결정

- 구조: **기준 언어 json = 소스**, 타 locale 정본 = DB, 동기화는 단방향 명시. **수정=json+전 환경 DB 동시**(안 그러면 sync가 되돌린다).
- locale 코드≠언어 코드 — 국가파생 코드를 번역 엔진에 raw로 주면 오역. 매핑 단일소스 파일 1개.
- **번들은 페이지에 전부 직렬화된다** — 죽은 키·주석도 소스 노출(심사 스캔 대상). 폐기=물리 삭제.
- 빌드 게이트에 locale 교차 검증 스크립트를 처음부터 포함.
- 새 UI 문자열=기준 언어+영어 동반, 나머지는 폴백. 대량 번역은 배치 분할·429=크레딧 의심.

**재사용**: `scripts/validate-locales.mjs` · `scripts/i18n-bulk-*` 파이프라인 · `locale-lang.ts` 패턴

---

## 6. 성능 — 3대 표준 + 위치 2개

- **3대 프론트 표준(예외 없음)**: ①목록=페이지네이션 ②이벤트 조회=비동기 논블로킹 ③섹션=뷰포트 진입 직전 lazy.
- **함수 리전=DB 리전** 첫날 고정 (기본 iad1 방치 시 전 페이지 태평양 왕복).
- 캐시는 뷰어 의존성으로 결정: 공개 집계=s-maxage/SWR, 뷰어별=private+Vary(공유 CDN 캐시 금지).
- 이미지=WebP 변환+blur placeholder, above-the-fold만 priority.
- 성능 리스크 레지스터(터지기 전 예측 병목 문서)를 초기부터 운영 — 공통 천장은 대개 **DB 커넥션 풀**.

---

## 7. 보안 — 기본기 체크리스트

- [ ] 세션 시크릿 32자+ · HMAC 서명 · 만료 검증
- [ ] 권한 게이트 함수 단일화(타입 술어) — 역할 문자열 직접 비교 금지(운영 실데이터와 대조해 사문화 방지)
- [ ] RLS 끄면 반드시: service_role 서버 전용 + anon 클라이언트 금지 + 문서로 정당화
- [ ] 개인정보: 비관리자 뷰어 마스킹 유틸 · 뷰어별 응답 캐시 분리 · 동의 이력(IP·UA)·철회 즉시 파기
- [ ] 플랫폼 헤더(HSTS·nosniff·Referrer·Permissions) + API no-store/noindex — vercel.json 골격 복사
- [ ] webhook=시크릿 대조 · cron=Bearer 시크릿
- [ ] 지갑 시드류는 마스터 전용, 세션·저장소·스크립트에 남기지 않는다(인자 전달만)

---

## 8. 배포 파이프라인 — 2단계 게이팅 + 검증 철칙

- 토폴로지: **스테이징 프로젝트(master 자동) + 운영 프로젝트(production 브랜치, ff-only 승격 스크립트)**.
- **배포 검증 3단**: ①커밋 전 `pnpm build`(lint는 타입을 못 잡는다) ②승격 후 commit status를 **운영 프로젝트 컨텍스트로 개별** 확인(빌드 실패 시 구배포를 조용히 계속 서빙) ③운영 HTML **실측 프로브**(신규 문자열 존재 확인).
- cron 목록은 vercel.json 한 곳 — 매 잡에 인증·멱등·로그(sys_batch_log류) 3종 세트.
- 알림 채널(텔레그램류)은 환경별 봇 + webhook 자가치유 cron.
- 다중 세션 협업 시: 공유 파일 즉시 push+pull · SQL은 git 정본 · 도메인 디렉토리 격리.

**재사용**: `scripts/promote-to-prod.mjs` · vercel.json(crons·headers) · 배포 폴링 스니펫(commit status+HTML 프로브)

---

## 9. 사고 회피 — 코드 리뷰 때 묻는 4가지 질문

> cafe.pi 사고 15건의 전부는 이 4개 질문 중 하나에 걸렸다.

1. **"이 실패는 보이는가?"** — else 없는 `if(res.ok)`, 비블로킹 insert, 0건 배치, 구배포 서빙… 실패가 침묵하면 사용자는 "고장"으로만 보고하고 단서가 사라진다. → 모든 실패 경로에 toast/로그/실측.
2. **"이 신호를 확정으로 다뤄도 되는가?"** — UA·401·초기 상태·플랫폼 uid는 "아직 모름"일 수 있다. → 성공 신호만 정본, 캐시 파괴는 정본 응답에서만.
3. **"이 값의 스코프 좌표는?"** — 키·시드·도메인·env·봇·DB는 (환경×네트워크) 좌표가 있다. → 전환 작업은 매트릭스의 행 전체를 함께 바꾼다.
4. **"이 목록은 닫혀 있는가?"** — 결제 type·locale·기능 코드는 자란다. → 화이트리스트 대신 catch-all+명시 분류.

---

## 10. Day-1 체크리스트 (한 페이지 요약)

```
□ 환경×네트워크 매트릭스 작성 (§1 표)
□ CLAUDE.md: 핵심 가치·금지 목록·빌드 게이트 명문화
□ t3-env 스키마 + .env.example (운영 필수 키는 빌드 강제)
□ DB: DA 4종 세트 + lazy init 클라이언트 + pooler 연결
□ 인증: 이중 경로 + piFetch류 래퍼 + 불변키 결정 + redirect 금지 게이트
□ 결제: approve/complete/미완결복구 3종 + A2U 게이트 판별표
□ i18n: source of truth 구조 + 교차 검증 스크립트 빌드 게이트
□ 함수 리전=DB 리전 고정 (vercel.json regions)
□ 보안 헤더·cron 시크릿·권한 게이트 함수 (vercel.json 골격 복사)
□ 배포: 승격 스크립트 + 검증 3단 습관화
□ 문서 3종 골격(PRD 라이트·ROADMAP 1줄 표·TROUBLESHOOT 레지스터)
□ 코드 리뷰 4질문(§9)을 PR 체크리스트에 등록
```

**재사용 자산 인덱스** (cafe.pi에서 그대로 가져갈 것):
`src/env.ts` · `db-env.ts` · `supabase-admin.ts` · `pi-fetch.ts` · `auth-check.ts` · `api-errors`(카탈로그+훅) · `validate-locales.mjs` · `promote-to-prod.mjs` · vercel.json(crons·headers) · skills(pi_auth·pi_pay·pi_google_link) · da 표준 문서+가드 훅 · 마스킹·캐시 헤더 유틸

> 이 문서가 낡으면 정본(REVIEW_TOTAL·TROUBLESHOOT)을 다시 증류해 갱신한다 — 플레이북은 살아있는 문서다.
