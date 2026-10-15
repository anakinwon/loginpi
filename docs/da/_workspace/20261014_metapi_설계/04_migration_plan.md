# 04 이행 계획서 — 표준사전 5테이블 cafe.pi → METAPI(schema.pi) 이관

> 작성 : DA팀 이행담당 · 2026-10-14 · 설계서 수록 위치 §4-8(이관)·§9(컷오버·리스크)
> SQL : 같은 폴더 `04_migration_ddl.sql` (S0 실측 · M1 대상 DDL · M2 적재 · M3 백필 · M4 apv_id 전환 · V 검증 · C 동결 · R 롤백)
> 운영 적용은 마스터만 한다. 이 계획서와 SQL 은 `sql/`·`src/` 를 바꾸지 않는다.

## 0. 요약

| 항목 | 결정 |
|---|---|
| 대상 | `std_dic`·`std_dom`·`std_term`·`approval_queue`·`std_audit_log` 5테이블, 소유권을 cafe.pi DB 에서 METAPI DB 로 1회 이전 |
| 정의 정본 | 승계 컬럼·타입·NULL 은 `02_modeler_model.md` §3(cafe.pi 개발 DB PostgREST OpenAPI 2026-10-14). 운영 원천은 S0-0·S0-1 게이트로 재확인 |
| 방식 | 원천 `\copy`(binary, 파일 경유) → 대상 임시테이블 → PK `ON CONFLICT` 업서트. 트리거는 `session_replication_role=replica` 로 끈다 |
| 컬럼 | 원천 1:1 승계, 이관 중 이름 변경 0, NULL 허용 그대로. 규칙 소급 9컬럼 추가 |
| apv_id | TEXT → UUID 전환 권고(선택지 ②). 비UUID 1건이라도 있으면 전체 중단하는 게이트 내장 |
| 이중 기록 | 하지 않는다. 짧은 쓰기 동결 창(분 단위)으로 대체 |
| cafe.pi | `/admin/std` 조회는 METAPI P29 소비자로 전환, 쓰기·승인·감사는 METAPI 로 이동, 원천 테이블은 DB 트리거로 읽기 전용 동결 |
| 검증 | 실 정의 기준 원천으로 로컬 PostgreSQL 17 리허설 22개 점검 전부 통과(§13). 운영 DB 실측은 미실행 |

**점검 컬럼 수** : 전체 81 = 신규 0 + 승계 72 + 소급 추가 9.

**정정 이력(2026-10-14 r2)** : 1차 M1 은 API 9개 라우트와 sql/004~010 에서만 컬럼을 역추적했다. 그래서 API 가 쓰지 않는 실 DB 컬럼 7개(std_dic 6개·`approval_queue.req_at`)를 놓쳤고, 이대로 적재하면 그 컬럼 값이 조용히 사라질 뻔했다. `std_term.term_id` 타입(실 DB UUID)과 NULL 허용 6곳도 달랐다. 모델러의 OpenAPI 확인으로 정정했고, 재발을 막으려고 S0-0 게이트(OpenAPI·카탈로그·적재 목록 3중 diff 0)를 넣었다.

## 1. 범위 · 전제

| 구분 | 원천 | 대상 |
|---|---|---|
| 개발 리허설 | cafe.pi 운영 DB `public`(읽기만) | `pi-nonprod` 프로젝트 `schema_dev` |
| 스테이징 리허설 | cafe.pi 운영 DB `public`(읽기만) | `pi-nonprod` 프로젝트 `schema_stg` |
| 운영 본적재 | cafe.pi 운영 DB `public`(동결 후) | schema.pi 운영 프로젝트 `public` |

- 표준사전은 단일 정본이다. 그래서 세 환경 모두 운영 원천에서 복사한다. 개발·스테이징 원천을 따로 두면 사전이 갈라진다.
- 대상 DDL 은 스키마 비한정으로 쓴다. `scripts/db-migrate.mjs` 가 tier 별 search_path 를 잡는다(PRD_28 §5, baseline 규칙 1).
- 선행 : `packages/pi-db/sql/000_baseline.sql` 적용. M1 이 그 안의 `fn_grant_svc_only` 를 재사용한다. M1 은 `pg_trgm` 확장도 만든다.
- 접속은 Supabase Session pooler(aws-1-ap-northeast-2)만 쓴다. 직접연결 DNS 는 폐지됐다.
- 원천의 최초 CREATE 문은 저장소에 없다. `sql/004` 이전에 외부 동기화 테이블(`std_dic_sync`·`std_dom_sync`)로 만들어졌다. 그래서 정의는 OpenAPI 와 카탈로그 실측으로만 확정한다.
- **실행 순서는 04 M1~M4 → 02 로 고정한다(모델러 통지·품질 P1 반영 2026-10-14).** 02 는 `std_term(term_id)`·`std_dom(dom_id)`·`approval_queue(apv_id)`·`fn_std_audit_log()` 에 기댄다. 02 의 `metric_impv_rcmnd.apv_id` 는 UUID 로 `approval_queue.apv_id` 를 FK 참조한다. 그래서 M4 전에 02 를 적용하면 FK 가 걸린 PK 의 타입을 바꿀 수 없어 42804 로 실패한다. M4 게이트가 미통과(TEXT 유지)로 끝나면 02 의 그 컬럼만 TEXT 로 바꿔 적용한다.

## 2. 원천 → 대상 매핑

### 2-1. 테이블

| 원천(cafe.pi `public`) | 대상(METAPI) | 승계 컬럼 | 소급 추가 | 행 성격 |
|---|---|---|---|---|
| `std_dic` | `std_dic` | 21 | 1 | 표준단어 |
| `std_dom` | `std_dom` | 16 | 1 | 표준도메인 |
| `std_term` | `std_term` | 12 | 1 | 표준용어 |
| `approval_queue` | `approval_queue` | 15 | 2 | 승인 대기열 |
| `std_audit_log` | `std_audit_log` | 8 | 4 | 감사 로그(append-only) |

### 2-2. 컬럼 (1:1, 변환 없음 — 소급 컬럼만 ★)

| 테이블 | 컬럼(원천 = 대상) |
|---|---|
| `std_dic` | dic_id · dic_log_nm · dic_phy_nm · dic_phy_fll_nm · dic_desc · dic_gbn_cd · ent_clss_yn · attr_clss_yn · dom_use_yn · dom_id · data_type · data_len · data_scale · stored_term_comp_ids · apv_status · synced_at · del_yn · regr_id · reg_dtm · modr_id · mod_dtm · ★del_dtm |
| `std_dom` | dom_id · key_dom_nm · key_dom_phy_nm · dom_nm · dom_type_cd · data_type_cd · data_len · data_scale · dom_desc · apv_status · synced_at · del_yn · regr_id · reg_dtm · modr_id · mod_dtm · ★del_dtm |
| `std_term` | term_id(UUID) · term_log_nm · term_phy_nm · term_phy_fll_nm · term_desc · apv_status · synced_at · del_yn · regr_id · reg_dtm · modr_id · mod_dtm · ★del_dtm |
| `approval_queue` | apv_id · entity_type · entity_id · entity_nm · apv_status · req_data · req_by · req_at · decided_by · decided_at · reject_reason · regr_id · reg_dtm · modr_id · mod_dtm · ★del_yn · ★del_dtm |
| `std_audit_log` | log_id · tgt_tbl · tgt_id · action_cd · old_val · new_val · chgr_id · chg_dtm · ★regr_id · ★reg_dtm · ★modr_id · ★mod_dtm |

- NULL 허용은 실 DB 그대로다. `std_dic` 의 dic_log_nm·dic_phy_nm·apv_status 와 `std_dom` 의 dom_nm·key_dom_nm·key_dom_phy_nm 은 NULL 을 허용한다. 대상에서 NOT NULL 로 강화하면 원천 NULL 행이 적재에서 실패한다. 강화는 데이터 정비 뒤 후속 순번으로 한다.
- `_yn` 3개(ent_clss_yn·attr_clss_yn·dom_use_yn)는 실 DB 가 TEXT·CHECK 없음이라 그대로 둔다. CHAR(1)+CHECK 전환은 값 분포 확인 뒤 후속 순번이다.

### 2-3. grandfathered 명명 (이관 중 유지 · 후속 순번에서 정비)

da-ddl-guard 가 경고 21건을 냈다(차단 0). 모두 원천 그대로 승계한 이름이다. 정비 후보 이름은 02 모델 §3 개명안을 따른다.

| 컬럼 | 위반 |
|---|---|
| `apv_status` ×4 · `entity_type` · `tgt_tbl` · `req_data` · `req_by` · `decided_by` · `reject_reason` · `data_type` · `data_len` ×2 · `data_scale` ×2 · `stored_term_comp_ids` | 표준도메인 미종결 |
| `synced_at` ×3 · `req_at` · `decided_at` | `_at` 비표준 |

- 이관과 이름 변경을 한 번에 하지 않는다. 위험 두 개를 겹치면 대사 불일치의 원인을 가를 수 없다.
- 정비는 METAPI API(P01~P03·P20·P21)가 새로 쓰이는 시점에 맞춰 schema.pi 쪽 새 순번 SQL 로 한다. cafe.pi 소비자는 P29 응답 계약만 보므로 영향이 없다.
- `stored_term_comp_ids` 는 다중값이라 1NF 위반이다. 개명이 아니라 구조 재검토 대상이다(02 모델 §3).

### 2-4. 규칙 소급 · 원천 대비 변경

| 규칙 | 원천 상태 | 대상 처리 | 값 |
|---|---|---|---|
| 논리삭제 `del_dtm` | 4테이블 부재 | 컬럼 추가 | 이관분 NULL |
| 논리삭제 `del_yn` | `approval_queue` 부재 | 컬럼 추가 | 전건 'N' |
| 시스템 컬럼 4개 | `std_audit_log` 부재(sql/009 의도적 제외) | sql/176 선례대로 추가 | regr_id·modr_id = chgr_id, reg_dtm·mod_dtm = chg_dtm (M3, 원천 실재 값에서만 파생) |
| `std_audit_log` 논리삭제 | 부재 | **두지 않는다** | `_log` 면제(R6, 02 모델 요청 ④) |
| mod_dtm 트리거 `NOW()` | 3함수 | `CURRENT_TIMESTAMP` 로 교체, 함수명 승계 | 의미 동일 |
| `approval_queue` mod_dtm 트리거 | 부재(API 가 직접 설정) | 신설 | 02 모델 §4 |
| 감사 트리거 INSERT 대상 | `public.std_audit_log` 하드코딩 | `TG_TABLE_SCHEMA` 동적 INSERT | tier 마다 스키마가 달라 필수 |
| 감사 트리거 PK 추출 | COALESCE(dic_id·dom_id·term_id) | `TG_TABLE_NAME` 별 매핑(std_dic·std_dom·std_term·cod_group·cod_val) | COALESCE 는 `cod_group.term_id` 를 PK 로 잘못 뽑는다. 미매핑 테이블은 tgt_id NOT NULL 로 실패(02 모델 요청 ①) |
| 인덱스 이름 4개 | 구 이름 | 표준 이름(`idx_std_audit_log_tgt_tbl_chg_dtm` 등), approval_queue 2개는 `del_yn='N'` 부분 인덱스 | 02 모델 요청 ③ |
| 검색 인덱스 | 없음 | 표준 3종 trgm 부분 인덱스 8개 신설 | 02 모델 요청 ②, 검색 표준(pg_trgm GIN) |
| 함수 search_path | 미지정 | `SET search_path = pg_catalog, pg_temp` | Supabase 린터 경고 해소 |

- **이관분 `del_dtm` 은 NULL 로 둔다(리더 판정 2026-10-14).** 원천에 삭제일시가 없고, `mod_dtm` 으로 근사 백필하면 삭제 뒤 수정과 구분되지 않아 감사 추적이 왜곡되기 때문이다.

### 2-5. `apv_id` TEXT → UUID

| 선택지 | 내용 | 장점 | 단점 |
|---|---|---|---|
| ① 유지(grandfathered) | TEXT 그대로 | 변환 위험 0 | 표준 위반 잔존, 신규 테이블 UUID 와 불일치 |
| **② 전환(권고)** | 적재·대사 후 M4 에서 `USING apv_id::UUID` | 표준 정합. supabase-js 는 uuid 를 문자열로 다뤄 API 코드 영향 0 | 원천 값이 전부 UUID 형식이어야 한다 |

- 근거 : sql/010 이 기본값을 `gen_random_uuid()::TEXT` 로 정했다. 그 전 행은 앱이 직접 값을 넣었을 수 있다.
- 검증 : S0-4 가 원천에서 UUID형·비UUID형·대문자 건수를 센다. M4 는 대상에서 다시 세고, 비UUID 1건이라도 있으면 EXCEPTION 으로 멈춘다. tier 마다 타입이 갈리지 않도록 조용히 건너뛰지 않는다.
- 순서 : V2 체크섬 대사를 끝낸 뒤 M4 를 돌린다. 로컬 리허설에서 소문자 UUID 는 전환 뒤에도 체크섬이 같았다.
- 02 연동 : M4 를 통과하면 `metric_impv_rcmnd.apv_id` 도 UUID 로 만든다(FK 타입 일치, 02 E절).

## 3. 이관 방법 · 순서

| 단계 | 위치 | 내용 | 재실행 |
|---|---|---|---|
| S0-0 | 원천 | OpenAPI 정의 · 카탈로그 컬럼명 · M2 적재 목록 3중 diff 0 | 조회 전용 |
| S0-1~6 | 원천 | 타입·제약·인덱스·트리거 실측, apv_id·Pi 식별자·작성자 값 점검 | 조회 전용 |
| M1 | 대상 | 테이블·인덱스·트리거·권한 | IF NOT EXISTS·CREATE OR REPLACE |
| 게이트 | 양쪽 | 타입·NOT NULL 목록 diff. 원천에만 0개, 대상에만 소급 9개여야 한다 | — |
| M2 | 원천→대상 | 테이블별 binary 파일 → 임시테이블 → 업서트, 테이블 1개 = 트랜잭션 1개 | 업서트 |
| M3 | 대상 | 감사 로그 시스템 컬럼 백필 | 이미 같으면 0건 |
| V1~V5 | 양쪽 | 같은 SQL 을 양쪽에서 돌려 결과 파일 diff | 조회 전용 |
| M4 | 대상 | apv_id UUID 전환(②일 때) | 이미 uuid 면 건너뜀 |
| V6·V7 | 대상 | 트리거 스모크(개발만), 백필 누락 0 | — |

**방법 선택 근거**

- `pg_dump` 는 쓰지 않는다. 덤프 안의 `public.` 접두와 함수 본문의 하드코딩 스키마를 tier 별로 고쳐야 하고, 소급 컬럼도 따로 넣어야 한다. DDL 은 M1 이 맡고 데이터만 `\copy` 로 옮기는 편이 단순하다.
- 컬럼 목록을 명시하는 방식은 목록 밖 컬럼을 조용히 버린다. 1차 M1 의 누락이 바로 이 경로였다. 그래서 S0-0 이 원천의 모든 컬럼이 적재 목록에 있는지 먼저 확인한다.
- binary 형식은 원천·대상 타입이 정확히 같아야 성공한다. 그래서 타입 게이트를 놓쳐도 적재 단계가 한 번 더 막는다.
- 업서트라 대상 행을 지우는 단계가 없다. 리허설과 본적재를 몇 번 반복해도 안전하다. 프로젝트 표준의 truncate 단계는 da-ddl-guard R5 가 막으므로 업서트로 대체했다.
- 원천에서 사라진 행은 업서트로 지워지지 않는다. 원천의 유일한 물리삭제 경로는 `std_audit_log` 365일 purge(sql/104)다. 그래서 리허설 시작부터 컷오버까지 purge 를 멈춘다(§8 C0).
- **Windows 실측 교훈** : 표준입출력 파이프로 binary 를 넘기면 깨진다. 파일 경유와 `-1` 단일 트랜잭션, `&&` 체인으로 고쳤다. `WORK_DIR` 은 네이티브 경로(`C:/...`)여야 하고, 셸 인코딩은 `PGCLIENTENCODING=UTF8` 로 고정한다. psql.exe·node 출력은 CRLF 라서 S0-0 diff 앞에 `tr -d '\r'` 가 필요하다.

## 4. 3환경 절차

1. **개발(schema_dev)** — `db-migrate.mjs --app schema --tier dev` 로 baseline·M1 적용 → S0-0 → S0-1~6 → 타입 게이트 → M2 → M3 → V1~V5 대사 → M4 → V6·V7 → **02 적용(M4 통과 뒤에만)**. 결과 파일을 잡 디렉토리 evidence 로 남긴다.
2. **스테이징(schema_stg)** — 1과 같은 절차를 다시 한다. V6 은 생략한다. P29 를 스테이징 데이터로 띄워 cafe.pi 스테이징의 `/admin/std` 조회 전환을 검증한다.
3. **운영(public)** — §8 컷오버 체크리스트대로 한다. 동결 뒤 본적재, 대사 PASS 뒤에만 쓰기를 연다. S0-0 은 운영 원천의 OpenAPI 로 다시 돌린다. 개발 DB 정의와 운영 DB 정의가 같다는 보장은 없다.

- 개발·스테이징 스키마는 Supabase Exposed schemas 에 등록돼야 PostgREST 로 보인다. GRANT 는 baseline 과 M1-9 가 처리한다.

## 5. 검증 쿼리 · 합격 기준

| ID | 내용 | 합격 기준 |
|---|---|---|
| S0-0 | OpenAPI 정의 · 카탈로그 컬럼명 · M2 적재 목록 | 세 목록 diff 0(승계 72컬럼) |
| S0-1 | 컬럼 타입·NULL·기본값 | 대상과 diff 시 원천에만 0개, 대상에만 소급 9개 |
| S0-2 | PK·UNIQUE·CHECK·FK(들어오고 나가는 것) | 들어오는 FK 0. 있으면 동결·폐지 보류 |
| S0-4 | apv_id 형식 | 비UUID 0(②의 전제) |
| S0-5 | JSONB 안 Pi 식별자 키 | 0. 아니면 이관 보류·상신 |
| S0-6 | 작성자 컬럼 값 분포 | 'ADMIN' 또는 ADMIN 역할 sys_user.id 만 |
| V1 | 건수·삭제·승인상태 분포 | 원천 = 대상, 1건 차이도 차단 |
| V2 | 승계 72컬럼 체크섬(UTC 고정, PK 정렬) | 5테이블 모두 동일 |
| V3 | 다형 참조 고아 | 원천 = 대상. 보고만 하고 보정하지 않는다 |
| V4 | 활성 물리명 중복 | 0행 |
| V5 | 일시 최소·최대 | 원천 = 대상 |
| V6 | 감사·mod_dtm 트리거 스모크(ROLLBACK) | 감사 1건이 대상 스키마에 생성, tgt_id = 해당 PK |
| V7 | 백필 누락 | 0 |

## 6. cafe.pi 전환 계획

### 6-1. API 라우트별 처리

| 라우트(`src/app/api/admin/std/`) | 현재 | 전환 후 |
|---|---|---|
| `words`·`domains`·`terms` GET | 자기 DB 조회 | METAPI P29 서버 측 조회로 교체, 응답 모양(`{ words }` 등) 유지 → 화면·`ddl` 페이지 코드 무변경 |
| 위 3종 POST · `[id]` PATCH·DELETE | 자기 DB 쓰기 | 410 + schema.pi 관리 화면 안내 |
| `approvals` GET·POST · `[apvId]` PATCH | 자기 DB | METAPI(P20)로 이동, cafe.pi 는 410 |
| `audit` GET | 자기 DB | METAPI(P21)로 이동, cafe.pi 는 410 |

- 화면 : words·domains·terms 는 읽기 전용(등록·수정 버튼 숨김), approvals·audit 는 schema.pi 안내로 바꾼다.
- 이 코드는 개발 작업이다. 라우트 수정 뒤 `pnpm build` 관문, 배포 뒤 `Vercel – cafe: success` 개별 확인, Pi Browser 실기기 `/admin/std` 확인이 완료 조건이다.
- P29 는 공개 읽기다. 작성자 컬럼(regr_id·modr_id)은 응답에서 뺀다. 현재 목록 select 에 regr_id 가 있으므로 cafe.pi 화면의 작성자 열도 함께 뺀다.
- METAPI API 를 새로 쓸 때 현재 패턴 `regr_id: requester?.id ?? null` 을 옮기지 않는다. NOT NULL 컬럼에 명시적 null 은 기본값을 쓰지 않고 오류를 낸다.

### 6-2. FK 정책 영향

- 5테이블은 PostgREST 임베디드 조인 대상이 아니다. `src` 전체에서 이 테이블을 쓰는 코드는 `admin/std` 라우트 9개뿐이고 전부 단일 테이블 조회다. FK 를 옮기거나 지워도 PGRST200 위험은 없다.
- 그래도 S0-2 에 FK 가 나오면 대상에 같은 FK 를 재현한다. cafe.pi 다른 테이블을 가리키는 FK(예 : sys_user)는 DB 를 넘어 옮길 수 없으므로 리더 판정으로 넘긴다.

### 6-3. 동결 → 폐지

1. **동결(C1)** : 원천 5테이블에 BEFORE INSERT·UPDATE·DELETE 트리거로 오류를 낸다. API 410 과 별개로 SQL 파일·MCP 직접 실행 같은 우회 쓰기까지 막는다. 데이터는 손대지 않는다.
2. **purge 정책(C2)** : sql/104 `fn_log_catalog` 의 `std_audit_log` 를 PURGEABLE 에서 READONLY 로 바꾸는 새 순번 SQL 을 낸다. 바꾸지 않으면 "로그 관리" 화면 정리가 동결 오류로 끝난다.
3. **폐지** : 코드 참조 0(grep) + 들어오는 FK 0 + 안정화 관찰 기간 [확인중 : 마스터, 권고 30일] 뒤 라우트 파일을 지운다. 테이블은 동결 상태로 보관한다(용량 미미). DROP 은 pg_dump 백업 보관과 마스터 승인이 있을 때만 한다.

### 6-4. da-ddl-guard Hook 영향

- Hook 은 DB 의 `std_dic` 을 조회하지 않는다. 표준 약어·도메인 목록을 파일 안 상수로 갖는다(`DOMAIN_SUFFIXES` 등). 이관은 Hook 동작에 영향이 없다.
- 바뀌는 것은 등재 절차다. sql/176 처럼 `INSERT INTO public.std_dic` 으로 단어를 등재하던 cafe.pi SQL 은 동결 뒤 오류로 멈춘다. 앞으로 등재 SQL 은 `sitemap/schema.pi/sql/` 에 둔다. Hook 상수와 정본 §1-2 동기화 규칙은 그대로다. P17 규칙 모듈 추출 때 Hook 이 METAPI 사전을 읽을지는 별도 결정이다.

## 7. 이중 기록 판단 — 하지 않는다

- 쓰는 사람이 ADMIN 몇 명이고 손으로 쓴다. 건수가 적고 쓰기를 몇 분 멈춰도 업무 영향이 없다.
- 두 DB 에 걸친 트랜잭션이 없다. 이중 기록은 한쪽만 성공하는 경우를 반드시 만들고, 그 보정 코드가 이관보다 크다.
- 이중 기록은 cafe.pi 와 schema.pi 양쪽 API 를 바꿔야 한다. 동결 방식은 SQL 트리거 1개와 라우트 교체뿐이다.
- 대신 읽기는 끊기지 않는다. 동결 동안 cafe.pi 는 자기 테이블을 계속 읽고, 대사 PASS 뒤에 P29 로 넘어간다.

## 8. 컷오버 체크리스트 (운영)

| # | 시점 | 항목 | 확인 |
|---|---|---|---|
| P1 | 사전 | schema.pi 운영 Supabase 프로젝트 생성, 리전·Session pooler 주소 확인 | ☐ |
| P2 | 사전 | baseline·M1 운영 적용(`--tier prod`), `schema_migrations` 기록 확인. **02 는 이때 적용하지 않는다**(C2a) | ☐ |
| P3 | 사전 | schema.pi Vercel env : Supabase URL·`SUPABASE_SERVICE_ROLE_KEY` 가 **service_role 키인지**(anon 아님) 확인 | ☐ |
| P4 | 사전 | P29 배포, `Vercel – <schema 프로젝트>: success` 개별 확인 | ☐ |
| P5 | 사전 | cafe.pi env 에 P29 주소 추가(`src/env.ts`·`.env.example` 동시) | ☐ |
| P6 | 사전 | 개발·스테이징 리허설 2회 V1~V5 PASS evidence | ☐ |
| P7 | 사전 | S0-2 들어오는 FK 0, S0-5 = 0, S0-4 결과로 ①/② 확정 | ☐ |
| C0 | 리허설 시작 | `std_audit_log` purge 중지(관리자 "로그 관리" 화면에서 실행 금지 공지) | ☐ |
| C1 | T0 | 원천 동결 SQL 적용 → 쓰기 시도가 읽기 전용 오류로 끝나는지 확인 | ☐ |
| C2 | T0+ | M2 → M3 → V1~V5 diff PASS → M4 → V7 | ☐ |
| C2a | T0+ | **02_modeler_ddl.sql(신규 17테이블)은 04 M1~M4 적용·V 검증 통과 뒤에 별도 순번으로 적용한다.** M4 미통과 또는 선택지 ①로 apv_id 가 TEXT 로 남으면 02 는 `metric_impv_rcmnd.apv_id` 만 TEXT 로 바꾼 본을 적용한다 | ☐ |
| C3 | T0+ | cafe.pi 라우트 전환 배포, `Vercel – cafe: success` 확인, Pi Browser 실기기 `/admin/std` 단어·도메인·용어·DDL 화면 확인 | ☐ |
| C4 | T0+ | METAPI 쓰기 개방(schema.pi 관리 화면에서 단어 1건 등록 → 감사 로그 1건 생성 확인) | ☐ |
| C5 | 사후 | C2 purge 정책 SQL 적용, 안정화 관찰 시작 | ☐ |
| F1 | 후속 | **등재 SQL 경로 전환** — sql/176 처럼 `std_dic`·`std_dom`·`std_term` 에 등재하는 SQL 은 C1 이후 `sitemap/schema.pi/sql/` 에 둔다(설계서 §9 구현 순서에 공지 항목으로 수록, 리더 판정 2026-10-14). cafe.pi `sql/` 에 두면 동결 트리거 오류로 멈춘다 | ☐ |

- **DB 밖 자산** : Storage 버킷은 대상 아님(5테이블은 파일을 참조하지 않는다). cron 도 대상 아님(purge 는 수동 실행). 확인 대상은 env(P3·P5)와 Exposed schemas(개발·스테이징)다.
- **테스트 금전 데이터** : 해당 없음. 5테이블에 금액·통화 컬럼이 없다.
- 쓰기 동결 창은 C1~C4 이고, 읽기 중단은 0이다.

## 9. 데이터 정책 점검 — 사이트 간 교차 금지 조항 비해당

PRD_28 §1.1-1 은 사이트 간 **사용자 데이터**(`pi_username`·uid·access token) 교차 조회·전송을 금지한다.

- **비해당 근거 1** : 5테이블 81컬럼에 Pi 사용자 식별자 컬럼이 없다. 행은 단어·도메인·용어 정의와 그 승인·변경 기록이다.
- **비해당 근거 2** : JSONB(`old_val`·`new_val`·`req_data`)에 Pi 식별자 키가 섞였는지 S0-5 가 검사하고, 0이 아니면 이관을 멈춘다.
- **비해당 근거 3** : 흐름이 소유권 1회 이전이다. 이관 뒤 cafe.pi 는 P29 공개 사전만 받고, P29 는 작성자 컬럼을 뺀다.
- **잔여 쟁점** : 작성자 컬럼에 cafe.pi `sys_user.id`(ADMIN 운영자 UUID)가 들어 있다. Pi 식별자는 아니고, 사이트별 UUID 가 따로라 METAPI 에서는 아무 계정과도 이어지지 않는다. 그래도 운영자 내부 ID 가 다른 사이트 DB 로 가는 것이 조항 범위인지는 **[확인중 : legal-compliance-advisor → Pi 서포트, PRD_28 §11 #4]** 이다.
- **이관 기본은 원값 유지다(리더 판정 2026-10-14).** 'ADMIN' 치환은 기본으로 하지 않는다.
- 치환은 선택 단계 **M3-opt** 로 준비만 해 두었다. 법무가 해당으로 판정하고 마스터가 승인할 때만 실행한다. UUID 형식 값만 'ADMIN' 으로 바꾸고, 감사 로그 JSONB 스냅샷의 regr_id·modr_id 키도 같이 바꾼다. replica 모드라 감사 로그가 새로 생기거나 mod_dtm 이 바뀌지 않는다.
- 롤백은 **R-opt** 다. 원천이 동결 상태로 원값을 보관하므로 원천에서 되읽어 복원한다. 별도 백업 테이블은 필요 없다. C4 이전에는 M2 재적재 + M3 로 복원하고, C4 이후에는 컷오버 전 행의 작성자 컬럼만 원천 값으로 되돌린다.

## 10. 롤백

| 시점 | 트리거 조건 | 절차 | 데이터 손실 |
|---|---|---|---|
| 리허설 | M2 실패·V 불일치·M4 예외 | 원인 수정 후 M2 재실행(업서트). 원천 무영향 | 0 |
| C1~C3 | V1~V5 1건이라도 불일치, M2 실패, S0-5 > 0 | R1 동결 해제 → cafe.pi 원상. 대상은 비정본이라 그대로 둔다 | 0 |
| C3 직후 | cafe.pi 빌드 실패·`Vercel – cafe` 비성공·Pi Browser `/admin/std` 401·500·P29 오류 | cafe.pi 이전 커밋 재승격 + R1 해제 | 0(METAPI 쓰기 미개방) |
| C4 이후 | METAPI 쓰기 경로 장애로 복귀 결정 | R2 : 컷오버 시각 이후 METAPI 변경분을 원천에 업서트(역방향 load) → R1 해제 → 라우트 복귀 | 0(역반영 범위 = 변경분 전량) |

M3-opt 를 실행한 뒤 되돌려야 하면 R-opt 를 쓴다. M4 를 적용한 뒤 approval_queue 를 재적재할 때는 `load()` 4번째 인자로 `apv_id::uuid` 를 넘긴다. 빠뜨리면 binary 타입 불일치로 멈춘다.

M4 예외는 컷오버 차단 사유가 아니다. 마스터가 ①(유지)을 고르면 M4 를 빼고 진행한다.

## 11. 마스터 적용 절차

1. **사전 실측** — 운영 원천에서 S0-0(OpenAPI·카탈로그·적재 목록 3중 diff)과 S0-1~6 을 실행하고 결과를 잡 디렉토리 evidence 로 저장한다. S0-0 diff 가 0이 아니면 M1·M2·V2 컬럼 목록을 고친 뒤 다시 돌린다. S0-2 로 CHECK 유무·PK 제약명(`[확인중 : 마스터 운영 S0-2 실측]`)을 확정한다.
2. **파일 이동** — M1 을 `sitemap/schema.pi/sql/NNN_std_migration.sql` 로, C1 을 cafe.pi `sql/NNN_std_freeze.sql` 로 옮긴다. 채번은 마스터가 한다. da-quality 게이트를 통과시킨다.
   - **파일 투입 순서 규칙** : `db-migrate.mjs` 는 대기 중인 파일을 파일명 순으로 한 번에 모두 적용한다. 그래서 세 파일을 동시에 넣지 않는다. ① M1 파일만 넣고 적용 → M2·M3·V 데이터 단계 → ② M4 파일을 넣고 적용 → ③ 02 파일을 넣고 적용. M4·02 를 미리 넣으면 적재 전 빈 테이블에서 M4 가 돌아 게이트가 무의미해지고, 02 가 먼저 FK 를 걸어 M4 가 42804 로 실패한다.
3. **개발 리허설** — 셸 준비는 아래와 같다. URL 은 셸에만 둔다.

```bash
export PGCLIENTENCODING=UTF8 TGT_SCHEMA=schema_dev WORK_DIR=C:/<저장소 밖 임시폴더>
export SRC_URL='<cafe.pi Session pooler URL>' TGT_URL='<pi-nonprod Session pooler URL>'
# 순번 분리 : db-migrate 는 대기 파일을 한 번에 모두 적용하므로 04 → 검증 → 02 를 세 번에 나눠 투입한다
node scripts/db-migrate.mjs --app schema --tier dev   # ① sql/ 에 04 M1 파일만 있는 상태로 적용
# S0-0·S0-1 게이트 → 04_migration_ddl.sql M2 의 load() 정의·호출 실행 → M3 → V1~V5 양쪽 실행 후 diff
node scripts/db-migrate.mjs --app schema --tier dev   # ② 04 M4 파일을 넣고 적용 → V6·V7
node scripts/db-migrate.mjs --app schema --tier dev   # ③ V 검증 통과 뒤 02 확정본을 넣고 적용(apv_id TEXT 유지 시 TEXT 본)
```

4. **스테이징 리허설** — `TGT_SCHEMA=schema_stg`, `--tier stg` 로 3을 반복한다(V6 생략).
5. **운영 컷오버** — §8 체크리스트 순서대로 한다. 롤백 조건은 §10 이다.
6. **적재 파일 삭제** — `WORK_DIR` 의 `*.bin` 을 지운다. 운영자 UUID 가 들어 있다.

## 12. 리스크 · 확인중

| # | 리스크·확인 항목 | 영향 | 대응 | 채널 |
|---|---|---|---|---|
| 1 | 운영 원천 정의가 개발 DB(02 §3 근거)와 다름 | 컬럼 유실·적재 실패 | S0-0 3중 diff + 타입 게이트 + binary 2차 게이트. 1차 M1 의 7컬럼 누락이 실제 발생 사례 | [확인중 : 마스터 운영 S0-0·S0-1 실측] |
| 2 | `session_replication_role` 설정 권한이 신규 프로젝트에서도 되는지 | M2 실패 | 안 되면 테이블 소유자로 `ALTER TABLE … DISABLE TRIGGER USER` 후 적재·재활성 | [확인중 : Supabase 문서] |
| 3 | 리허설~컷오버 사이 purge 실행 | V1 불일치 | C0 purge 중지 | 마스터 공지 |
| 4 | 개발·스테이징 스키마 Exposed schemas 미등록 | P29 조회 실패 | §4 등록 확인 | [확인중 : 마스터 — pi-nonprod 설정] |
| 5 | schema.pi 운영 프로젝트 리전·pooler 주소 | 접속 실패 | P1 | [확인중 : 마스터] |
| 6 | 운영자 UUID 이전이 교차 금지 조항 범위인지 | 원값 유지 or M3-opt 실행 | 기본 원값 유지, 해당 판정 시 M3-opt(롤백 R-opt) | [확인중 : legal-compliance-advisor → Pi 서포트] |
| 7 | 기존 삭제행 `del_dtm` 근사 백필 | — | 해소 : NULL 유지(리더 판정 2026-10-14) | — |
| 8 | apv_id ①/② | M4 포함 여부 | 권고 ②, 설계서 §10 에 상정 | [확인중 : 마스터 결정] |
| 9 | 등재 SQL 위치 변경을 팀이 모름 | 동결 뒤 등재 실패 | 해소 : §8 F1, 설계서 §9 구현 순서에 공지(리더 판정 2026-10-14) | — |
| 10 | P29 미구현 | 컷오버 불가 | P4 선행 조건 | 설계서 P29 일정 |
| 11 | 안정화 관찰 기간 | 폐지 시점 | 권고 30일, 설계서 §10 에 상정 | [확인중 : 마스터] |

## 13. 로컬 리허설 결과 (2026-10-14 r2, PostgreSQL 17.6 스크래치 클러스터)

원천 DB 는 02 모델 §3 의 실 정의대로 만들었다(NULL 허용·`std_term.term_id` UUID·std_dic 숨은 6컬럼·`req_at`). 그 위에 sql/006 트리거·009·010 원문을 그대로 실행했다. 데이터는 API 와 같은 문장으로 넣어 감사 트리거가 실제 로그를 만들게 했다. 경계행으로 논리명·물리명·승인상태 NULL, 개행(CRLF·LF)·탭·이모지·빈 문자열, 숨은 컬럼 값(Y/N·다중값 문자열), `req_at` NULL, 고아 승인 1건을 넣었다. 원천과 대상을 새로 만든 깨끗한 상태에서 한 번에 돌렸다.

| 검증 | 결과 |
|---|---|
| S0-1~6 원천 실행 | PASS |
| S0-0 3중 컬럼 목록 diff | PASS — 72컬럼 diff 0. ① 목록은 OpenAPI 대신 02 모델 §3 표(OpenAPI 기반)에서 소급 표시 행을 뺀 것 |
| baseline · M1 2회 연속 | PASS(멱등) |
| 타입·NOT NULL diff | PASS — 원천에만 0개, 대상에만 소급 9개 |
| M2 1차 · 2차 | PASS — 2차는 같은 건수 업서트 |
| M3 2회 · V7 | PASS — 백필 누락 0 |
| V1~V5 원천·대상 diff | PASS — 체크섬 포함 완전 일치, 감사 로그 354 = 354(적재 중 트리거 중복 생성 0) |
| V3 고아 | 의도한 1건 검출(보고만) |
| M4 전환 · 재실행 · 전환 뒤 V1~V5 | PASS — UUID 전환, 재실행 건너뜀, 체크섬 동일 |
| M4 음성 | PASS — 비UUID 1건에서 중단, TEXT 유지 |
| V6 트리거 | PASS — std_dic 감사 tgt_id 정확, mod_dtm 갱신, cod_group 감사 tgt_id = cd_group_id(term_id 오추출 없음) |
| 미매핑 테이블 감사 | PASS — tgt_id NOT NULL 위반으로 큰 실패 |
| public 오기록 | PASS — `public.std_audit_log` 없음 |
| M3-opt · R-opt | PASS — 치환 잔여 0, 원천 재적재 뒤 V1~V5 일치 |
| C1 동결 2회 · 4종 차단 · R1 해제 | PASS |

**리허설에서 고친 결함 4건**

- Windows 파이프를 거치면 binary 스트림이 깨졌다. 파일 경유로 고쳤다(§3).
- 파이프 종료코드가 0건 적재를 가렸다. 테이블 단위 단일 트랜잭션과 `&&` 체인으로 고쳤다(§3).
- M4 뒤 approval_queue 를 재적재하면 타입 불일치로 멈췄다. `load()` 4번째 인자로 고쳤다(§10).
- S0-0 diff 가 CRLF 줄끝 때문에 내용이 같아도 실패했다. `tr -d '\r'` 로 고쳤다(§3).

운영 원천 DB 실측은 하지 않았다. 운영 정의가 개발 DB 와 다를 수 있으므로 S0-0·S0-1 이 운영에서 첫 관문이다.
