# CLAUDE.md : schema.pi

데이터 표준사전 메타시스템(표준분류체계·표준단어·표준도메인·표준용어·승인·변경 이력). nia-dr-project 저장소 안의 **독립 프로젝트**이며, 상위 `nia-dr-project/.claude/CLAUDE.md`의 언어·커밋·문체 규칙을 함께 따른다.

- 요구사항 정본 : `docs/PRD.md` / 일정·진행 현황 : `docs/ROADMAP.md` / 출발 근거 : `docs/requirement/reqst.md`(DA Wordict 분석서)
- 기능·규칙을 바꾸면 ROADMAP 해당 단계에 진행 기록 1줄을 같은 커밋으로 남긴다

## 절대 규칙

1. **loginpi 무영향** : loginpi 저장소(`C:\Users\USER\workspace\loginpi`)와 sitemap.pi는 수정·커밋·푸시·배포 금지. loginpi 코드·문서는 **읽기 참고만** 허용(2026-10-15 마스터 결정). `@pi/*` 패키지 의존 금지, 필요한 기능은 schema.pi 안에 직접 구현
2. **푸시·배포는 명시 승인 후** : 로컬 커밋까지만 기본. Vercel 배포는 마스터 지시 전 금지
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
- `DEV_USER_PI_NM` : 개발 전용 임시 사용자(쿠키 `dev_user`로 전환 가능, 운영 빌드에서는 무시)
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

- 역할 R&R 7종(SYS·DA·STD·MDL·QLT·MIG·VIEWER, PRD §3.1) : 권한 검사는 `requireAreaRole(areaId, VIEW|REQUEST|APPROVE|BULK|SETTINGS)`, 권한표 정본 `src/lib/roles.ts`
- 승인 절차(PRD §3.2, `sql/012`·`src/lib/approval.ts`) : 최초 등록도 승인대기 → 승인완료 후 사용, 1단계 승인(DA·STD), 신청 시 즉시 승인은 DA만 선택(기본 꺼짐, 권한 SELF_APPROVE), 반려사유 필수, 일괄등록 = 승인대기
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
- 로그인 : Pi 로그인 미구현(개발 임시 사용자). 구현 시 `src/lib/api.ts`의 `currentUser()`만 교체
