# CLAUDE.md : schema.pi

데이터 표준사전 메타시스템(표준분류체계·표준단어·표준도메인·표준용어·승인·변경 이력). **loginpi 워크스페이스 멤버**(`sitemap/schema.pi`, 2026-10-16 dr-project에서 승계)이며, 루트 `loginpi/CLAUDE.md`의 규칙(Pi Browser 핵심가치·쿠키 OR `X-Pi-Token` 이중 경로·`redirect` 금지·DA 표준)을 먼저 적용한다. 배포 : Vercel 프로젝트 `schema`(Root Directory `sitemap/schema.pi`, 운영 브랜치 `prod/schema`, https://schem.vercel.app)

- 상위 7단계 계획(METAPi→ModelPi→PiErd→물리 구축→PiMig→PiCDC/PipeLine→PiAnal) : `docs/MASTER_ROADMAP.md`(단계별 앱 분리, METAPi = 이 앱) / 요구사항 정본 : `docs/PRD.md` / 일정·진행 현황 : `docs/ROADMAP.md` / 출발 근거 : `docs/requirement/reqst.md`(DA Wordict 분석서)
- 기능·규칙을 바꾸면 ROADMAP 해당 단계에 진행 기록 1줄을 같은 커밋으로 남긴다

## 절대 규칙

1. **공용 패키지 재사용** : 인증·가드는 `@pi/auth`·`@pi/guard`(workspace) 의존 — 복제 금지(PRD_28 §4). cafe.pi·sitemap.pi 코드는 수정하지 않는다. (구 "loginpi 무영향·`@pi/*` 금지" 규칙은 nia-dr-project 분리 시절 — 2026-10-16 loginpi 편입으로 폐기)
2. **운영 반영은 명시 승인 후** : master 푸시까지 기본, `prod/schema` 푸시(운영 배포)는 마스터 지시 뒤. 배포 후 `Vercel – schema: success` 개별 확인(루트 CLAUDE.md 배포 검증 철칙)
3. **추측 금지** : 미확정 값은 `[TBD]`·`[확인중 : 확인 채널]`로만 표기

## 스택·명령

Next.js 16(App Router, Turbopack) · React 19 · Tailwind v4 · zod 4 · Supabase(전용 프로젝트, PostgreSQL 17) · pnpm 11.4.0(corepack)

```bash
corepack pnpm@11.4.0 install         # 의존성(이 폴더 node_modules 전용, 루트 node_modules = 장표 도구용 별개)
corepack pnpm@11.4.0 dev             # http://localhost:3002
corepack pnpm@11.4.0 build           # 라우트·API 변경 후 최소 관문
corepack pnpm@11.4.0 test            # node:test 단위 테스트(test/**/*.test.ts, 타입 제거 실행)
npx --no-install tsc --noEmit -p .   # 타입 체크
corepack pnpm@11.4.0 db:migrate [-- --dry-run]   # sql/NNN_*.sql 순서 적용, sys_mgrt_hist 에 파일 해시 기록
corepack pnpm@11.4.0 db:seed [-- --dry-run]      # DA#_META/SQLiteDB_v5.db → DBMS·논리타입·타입매핑 기준 데이터
```

- **dev 서버 실행 중 build 금지** : 같은 `.next`를 써서 실행 중 서버가 500을 낸다. dev 중지 → `.next` 삭제 → build → dev 재기동 순서. 3002 포트를 잡은 고아 node 프로세스가 남으면 먼저 종료
- Windows 파일 잠금(EBUSY)으로 `.next` 삭제·빌드 정리가 실패하면 잠시 뒤 재시도

## 환경변수(`.env.local`, 커밋 금지)

- `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`(**`sb_secret_` 서버 전용 키**, publishable 키 사용 금지) · `SCHEMA_DATABASE_URL`(**Session pooler** 주소 `aws-0-<리전>.pooler.supabase.com:5432`, Direct 주소는 IPv6 전용이라 접속 불가)
- `PI_SESSION_SECRET`(32자 이상, 필수 — HMAC 세션 서명) · `NEXT_PUBLIC_PI_SANDBOX`(운영 false) · `NEXT_PUBLIC_PI_APP_DOMAIN`(Portal 포워딩 도메인 `<app>.pinet.com`, 없으면 Pi Browser 로그인 POST 403 cross_origin_auth) · `ADMIN_PI_USERNAMES`(로그인 시 `role_cd=ADMIN` 승격)
- `DEV_USER_PI_NM` : 개발 전용 임시 사용자(쿠키 `dev_user`로 전환 가능, 운영 빌드에서는 무시). Pi 세션이 있으면 그쪽 우선
- 값 확인은 키 이름·접두사만 출력, 비밀값을 화면·로그·커밋에 남기지 않는다
- 목록 정본 : `.env.example`

## 구조

| 경로 | 역할 |
|---|---|
| `sql/NNN_*.sql` | DDL·DB 함수. **적용된 파일 수정 금지**(해시 불일치 시 마이그레이션 중단) : 변경은 새 번호 파일 |
| `scripts/` | `db-migrate.mjs`, `db-seed.mjs` |
| `src/lib/` | `db.ts`(서버 전용 클라이언트), `api.ts`(오류 카탈로그·역할 확인·감사 이력), 업무 규칙(`dom-name`·`term-split`·`term`·`domain`·`change`·`settings`·`simple-crud`) |
| `src/app/api/` | REST 라우트(파일은 HTTP 메서드 함수만 export : 공용 스키마·함수는 `src/lib`) |
| `src/app/areas/[areaId]/` | 화면(words·domains·terms·approvals·members·settings) |
| `test/` | 업무 규칙 단위 테스트 |

## 업무 규칙(구현 기준)

- 역할 R&R 7종 × 요금제(PRD §3.1·§7) : **실제 권한 = 역할 ∩ 분류체계 요금제**(`roles.ts effPerms`, 요금제 = `src/lib/plan.ts` `std_area_plan`, 전역 ADMIN 도 결제한 요금제만 — 2026-10-19). 권한 검사는 `requireAreaRole(areaId, Perm)` — 메뉴 경로는 파생 권한(STD_VIEW·STD_REQ·MODEL_VIEW·MODEL_EDIT·SET_VIEW·SQL_QUERY)으로, 화면은 `GET /api/areas/[areaId]` 의 `perms` 로 판정(`can(role)` 직접 판정 금지). 결제 = `/api/payments/*`(SYS·DA, 테스트넷 `PI_API_KEY`)
- 승인 절차(PRD §3.2, `sql/012`·`src/lib/approval.ts`) : 최초 등록도 승인대기 → 승인완료 후 사용, 1단계 승인(SYS·DA, 요금제4), 신청 시 즉시 승인도 SYS·DA만 선택(기본 꺼짐, 권한 SELF_APPROVE), 반려사유 필수, 일괄등록 = 승인대기
- 이름은 **서버가 생성**하고 클라이언트 값을 신뢰하지 않는다 : 도메인명 = 대표도메인명 + 논리타입 약어 + 길이[,소수점], 용어명 = 구성 단어 결합(물리명 구분자 = 분류체계 설정, 기본 `_`)
- **동의어 불허**(2026-10-16) : 동음이의어(같은 논리명)·이음동의어(같은 물리명)·대체 표기(금칙어 BAN·이음동의어 SYN, `std_dic_rel`)와 겹치는 단어는 등록·수정 불가, DB 강제(sql/002 유일·014 물리명 유일·016 트리거). 금칙어는 `/forbidden`에서만 관리
- 엔터티 분류어·테이블 접미어(sql/017) : 단어 물리명(컬럼용)과 별도 칸 `tbl_sfx_txt`, 엔터티 분류어 전용·분류체계 유일, `/entity-classes`에서 단어 수정 신청으로 관리
- 용어 구성 : **표준단어 2개 이상**(DA 정의서 §8.5 R18), 금칙어 불가, 끝 단어 속성 분류어
- 수정 : `ver_no` 낙관적 잠금, 바뀐 항목만 반영. 삭제 : **논리 삭제만**(`del_yn`·`del_dtm`, 물리 DELETE 금지). 용어에서 사용 중인 단어·도메인은 이름·구조 변경과 삭제 불가
- 승인 시점 재검증 : 이름 재생성·구성 규칙·중복·기준 버전 일치 후 DB 함수(`fn_apv_std_req`)로 원자 처리
- 모든 변경은 `std_audit_log`에 변경 전후 값 기록
- **시스템 컬럼은 항상 맨 뒤**(2026-10-15 마스터 지시) : 기존 테이블에 컬럼을 추가할 때도 `ADD COLUMN`만 쓰지 않고 `fn_add_cols_keep_sys(테이블, ADD 절)`(`sql/010`)로 시스템 컬럼 4개를 다시 맨 끝에 둔다(값 보존·mod_dtm 트리거 정지 후 복사)
- 신규 테이블 : RLS 비활성 + anon·authenticated 권한 회수 + service_role 만 허용(`fn_grant_svc_only`), 시스템 컬럼 4개(`regr_id`·`reg_dtm`·`modr_id`·`mod_dtm`) 맨 끝, `mod_dtm` 트리거. DA 표준 규칙 요약은 메모리 `da-standard-core-rules`(원본 : loginpi `docs/da/references/` 01 정의서 §8.5)

## 검증·완료 기준

- 코드 변경 : `tsc` · `pnpm test` · `pnpm build` 통과
- DB 변경 : 로컬 PostgreSQL(PGlite 소켓, 스크래치패드 전용)에서 먼저 적용·시나리오 시험 → Supabase `db:migrate`
- API 변경 : 로컬 3002에서 역할별 시나리오 시험, 시험 데이터는 논리 삭제로 정리
- 보고 수치는 이번 실행 출력에서만 인용, 이전 실행 결과는 그 사실을 밝힌다

## 환경 주의

- 이 PC DRM이 새로 생성된 Office·PDF·일부 파일을 `.exs`로 암호화 : `.exs`·`" 2.exs"` 파일은 스테이징 금지, 파일은 개별 지정 스테이징
- 폴더명 `DA#_META`의 `#` : SQLite를 `file:` URI로 열면 `#` 뒤가 잘려 빈 DB가 생성됨 → 일반 경로로 연다
- 로그인(2026-10-16) : Pi Browser = Pi SDK(`src/lib/auth.ts` `getSessionUser`, `@pi/auth` 세션 ↔ `sys_user`, `pi_usr_nm` 불변키) / 일반 브라우저 = Google NextAuth(`src/auth.ts`, sitemap.pi 방식) — **Google 단독 계정 생성 없음**, Pi Browser에서 발급한 6자리 연동 코드(`/link`, `sql/020` `sys_auth_lnk_cd`)를 입력해 `sys_usr_auth_lnk`로 결합. 통합 판정은 `getAppUser`(Pi 우선) → `currentUser()`. 클라이언트는 `useAppUser`(`src/app/google-auth.tsx`)·`LoginGate`(UA 판정 금지·redirect 금지). API 호출은 `fetch` 대신 **`piFetch`**. Pi Sign-In(OAuth)은 미구현. env : `AUTH_SECRET`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`(셋 모두, 버튼 플래그 `NEXT_PUBLIC_GOOGLE_LOGIN`은 next.config 가 셋에서 빌드 때 파생), Google Console Redirect URI `<origin>/api/auth/callback/google`
- `src/proxy.ts` 는 무동작 자리표시자 — 삭제 금지(저장소 루트 `src/middleware.ts` 가 이 앱 미들웨어로 번들돼 `/` 404, next.config 주석 참조)
