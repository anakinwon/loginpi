게이트 판정 : PASS (r6 최종 — P1 0 · P2 0, P3 4건 개선 과제)

# 03_quality_gate — METAPI 모델·DDL 품질 게이트

> 작성 : da-quality · 2026-10-14 · 작업 T4
> 대상 : `02_modeler_model.md` · `02_modeler_ddl.sql`(20:41, r5 보강 11컬럼·CHECK 56) · `04_migration_plan.md`(20:28) · `04_migration_ddl.sql`(20:26) · `01_standards_dictionary.md` · `01_standards_dictionary.md`(20:45, r5 단어) — r5 재판정 기준본
> 기준 : `docs/da/품질점검기준서.md` §3 P1~P3 · `docs/da/데이터표준규칙.md` v2.4 · 신규 03 지침 별표 2(P1~P3 등급)
> 방법 : 주장 대신 실측으로 판정했다. ① da-ddl-guard Hook 을 두 SQL 에 실행 ② PGlite(PostgreSQL WASM)에 04 M1 → 02 를 적용하고 단언 ③ cafe.pi 개발 DB PostgREST OpenAPI 를 읽기 전용으로 조회해 승계 컬럼을 독립 대조 ④ 문서 grep.
> 점검 스크립트 : 스크래치패드 `qa/gate.mjs`(저장소 밖, 산출물 무수정). 운영 DB 는 조회하지 않았다 [확인중 : 마스터 S0 실측].

## 1. 판정 요약

| 등급 | 건수 | 내용 |
|---|---|---|
| **P1** | **0** (r1 1건 해소) | Q-P1-1 `apv_id` FK 타입 충돌 — r2 해소 |
| P2 | 0 (+ grandfathered 5종) | Q-P2-3 r5b 해소(`tpc_rlm_cd` 개명) · Q-P2-4 r6 해소(리더 승인). Q-P2-1·Q-P2-2 해소 |
| P3 | 4 | COMMENT 부족 · 02 재적용 비멱등 · 02 머리 주석 낡음 · 비밀값 마스킹 앱 책임(Q-P3-4, r5) |
| 승인 대기(위반 아님) | 15 | Hook R2 `mdl_` 8 · R7 `len` 4 · `ms` 3 |

r1 의 P1 은 modeler 수정(02 를 M4 뒤 실행·`apv_id UUID`)으로 해소됐고 PGlite 로 재확인했다(§5·§8). r3 에서 계획서 §4·컷오버 C2a 에 "02 는 M4 통과 뒤에만"이 들어가 Q-P2-2 도 해소됐다.

## 2. 점검 컬럼 수

> **r5 갱신** : 신규 237(1단계 156 · 2단계 81) + 승계 81 = **전체 318**(PGlite 카탈로그 실측, modeler 보고와 일치). r5 추가 11컬럼 = cod_val 1 · mdl_db 5 · mdl_tbl 1 · mdl_tbl_hist 1 · std_chck_rslt 1 · metric_impv_rcmnd 2. 아래 표는 r1~r4 기준.

PGlite 카탈로그(04 M1 → 02 적용 후)에서 직접 셌다. 리더 기준값과 일치한다.

| 구분 | 테이블 | 컬럼 |
|---|---|---|
| 신규 1단계 | 11 | 147 |
| 신규 2단계 | 6 | 79 |
| **신규 계** | **17** | **226** |
| 승계(이관 후, 04 M1) | 5 | 81 = 원천 72 + 소급 9 |
| **전체** | **22** | **307** |

승계 81 내역 : std_dic 22 · std_dom 17 · std_term 13 · approval_queue 17 · std_audit_log 12.
원천 72 는 개발 DB OpenAPI 독립 조회로 확인했다(std_dic 21 · std_dom 16 · std_term 12 · approval_queue 15 · std_audit_log 8).

## 3. 위반 목록

| ID | 위치 | 위반 항목 | 등급 | 근거 조항 | 수정 권고 |
|---|---|---|---|---|---|
| ~~Q-P1-1~~ **r2 해소** | 02 C-5 `metric_impv_rcmnd.apv_id TEXT` ↔ 04 M4 | `approval_queue.apv_id` 를 UUID 로 바꾸면 TEXT FK 가 성립하지 않는다. 04 M1 → M4 → 02 순서와 04 M1 → 02 → M4 순서 모두 `42804 foreign key constraint "metric_impv_rcmnd_approval_queue_id_fkey" cannot be implemented` 로 실패한다. 02 E절 "통과 시 동반 변경"은 실행문이 없다 | P1 | 정본 §3-3(FK = 참조 PK 와 같은 이름·타입) · 리더 지시 3(적용 검증) | A) 02 를 M4 뒤 실행으로 고정하고 `apv_id UUID` 선언, 선택지 ① 채택 시 TEXT 로 되돌린다고 머리 주석에 명기(권고). B) 04 M4 가 참조 FK 를 DROP → 두 컬럼 ALTER TYPE → FK 재생성 |
| ~~Q-P2-1~~ **r2 해소** | `04_migration_plan.md` §0·§2-1·§2-2·§2-3·§9 | DDL 갱신(20:19)이 계획서(20:06)에 반영되지 않았다. 계획서는 76컬럼 = 승계 65 + 소급 11 이고, §2-2 목록에 실 DB 컬럼 7개(`ent_clss_yn`·`attr_clss_yn`·`dom_use_yn`·`dom_id`·`data_scale`(std_dic)·`stored_term_comp_ids`·`req_at`)가 없다. Hook 경고도 18건으로 적었지만 실측은 21건이다 | P2 | 품질점검기준서 Phase 2 경계면 교차 비교 · 정본 §10 #22 | 81 = 승계 72 + 소급 9 로 일괄 정정. §11-1 의 맨 `[확인중]` 도 `[확인중 : 채널]` 형식으로 |
| ~~Q-P2-2~~ **r3 해소**(계획서 §4-1 "02 적용(M4 통과 뒤에만)"·컷오버 C2a), r4 에서 §11-2 파일 투입 순서 규칙·§11-3 db-migrate 3회 분할(① M1 ② M4 ③ 02) 확인 | `04_migration_plan.md` §11-3 · §8 컷오버 체크리스트 | 02 는 "04 M4 통과 뒤 적용"이 선행조건이다(02 머리 주석). 그런데 §11-3 은 `db-migrate.mjs --app schema` 로 schema.pi/sql 을 일괄 적용한 뒤 M4 를 수동으로 돌린다. 02 확정본이 같은 sql/ 순번에 들어가면 M4 전에 적용돼 42804 로 멈춘다(PGlite A3 실측) | P2 | 적용 순서 정합 · 리더 지시 5(모델↔이관 정합) | §11-3 과 컷오버 체크리스트에 "02 확정본은 M4 통과 뒤 별도 순번으로 적용, 선택지 ① 이면 `apv_id TEXT` 본 적용"을 명기. 또는 02 확정본 순번을 M4 뒤로 채번 |
| ~~Q-P2-3~~ **r5b 해소**(표준담당 R5-V1, modeler 개명) | 02 B-5 `mdl_tbl.tpc_cd` ↔ 01 §1-1 #45·#50 | 표준사전 r5 는 "주제영역코드"를 `tpc_rlm_cd`(주제 TPC + 영역 RLM, 공통 용어 TPC_RLM_NM)로 등재했다. DDL 은 `tpc_cd`(주제코드)라 표준용어와 다르다. 01 의 "영역 RLM" 등재 사유가 이 컬럼 하나뿐이다 | P2 | 정본 §1-3 표준용어 일치 · 경계면 교차 비교 | 표준담당 판정으로 하나로 확정. 01 안이면 02·모델 §3·설계서를 `tpc_rlm_cd` 로, 02 안이면 01 에서 RLM 신청 철회 |
| ~~Q-P2-4~~ **r6 해소**(리더 승인 2026-10-14) | 02 B-4 `mdl_db.last_clct_dtm`·`last_clct_rslt_cd`·`last_err_txt` · 모델 §5-3 | 성공 수집일시는 `mdl_tbl_hist.clct_dtm` 최댓값으로 도출되는 반정규화다. 모델은 "승인 요청"으로 기록했고 리더 승인 기록은 아직 없다 | P2 | 04 §7.3 #9(반정규화 승인 기록) | 리더 승인·사유 기록. 실패 사유(`last_err_txt`)는 원천이 없어 반정규화가 아닌 고유 속성으로 분리 기재 권고 |
| Q-P3-4 (r5) | 02 `mdl_db.last_err_txt` · `metric_impv_rcmnd.dmnd_cont`·`rspns_cont` | "접속 문자열·비밀값 기록 금지"·"마스킹 후"가 주석으로만 있다. CHECK 로 강제할 수 없어 앱(P39·P40) 책임이다 | P3 | 보안 심층화 | 수집기·AI 호출부에 마스킹 단위 테스트 1건을 두고 설계서 §8 에 명기 |
| Q-P3-1 | 02 F절 | `COMMENT ON` 이 2건(`qry_uid`)뿐이다. 신규 17 테이블·226 컬럼의 논리명은 DDL 행 끝 주석에만 있다 | P3 | 품질점검기준서 §3 P3 "메타데이터(COMMENT)" | sql/ 확정본에서 테이블·컬럼 COMMENT 일괄 생성. METAPI P28 이 이 일을 하는 기능이라 자기 등재 때 처리해도 된다 |
| Q-P3-2 | 02 전체 | 재적용하면 첫 문장에서 `42P07 relation "cod_group" already exists` 로 멈춘다. 이중 생성은 없어 리더 기준("IF NOT EXISTS 또는 오류")은 충족한다. 다만 04 는 IF NOT EXISTS·CREATE OR REPLACE 로 멱등이라 두 파일 관례가 다르다 | P3 | 정본 §0 bypass 절차 · 04 머리 주석 멱등 원칙 | sql/ 확정본에서 `CREATE TABLE IF NOT EXISTS`·`CREATE OR REPLACE TRIGGER` 로 통일 |
| Q-P3-3 | 02 A절 주석 ①~⑤ · `02_modeler_model.md` §4-2 | "04 반영 요청"으로 적힌 ①②③④가 04 갱신본에 이미 반영됐다. 감사 PK 매핑·trgm 8·인덱스명·`std_audit_log` del_yn 제외 모두 확인했다 | P3 | 문서 정합 | "반영 완료(04 M1-5·M1-6·M1-8)"로 갱신 |

### 3-1. grandfathered (승계 객체 위반 — 이관 중 유지, 고치지 않지만 점검은 함)

| 객체 | 위반 | 등급 | 근거 | 추적처 |
|---|---|---|---|---|
| 승계 21 컬럼 | 표준도메인 미종결(`apv_status`×4·`synced_at`×3·`data_type`·`data_len`×2·`data_scale`×2·`stored_term_comp_ids`·`entity_type`·`req_data`·`req_by`·`req_at`·`decided_by`·`decided_at`·`reject_reason`·`tgt_tbl`) — Hook R7 경고 21건과 일치 | P2 | 정본 §1-3 | 04 계획서 §2-3 후속 순번 |
| `synced_at`×3 · `req_at` · `decided_at` · `req_by` · `decided_by` | 금지 패턴 `_at`·`_by` | P2 | 정본 §3-1 금지 패턴 | 동일 |
| `std_dic.ent_clss_yn`·`attr_clss_yn`·`dom_use_yn` | `_yn` 인데 TEXT·CHECK 없음(PGlite 실측) | P3 | 정본 §3-4 | 동일. Hook 은 `_yn` 타입을 보지 않는다 |
| `std_dic.dic_id`·`std_dom.dom_id`·`approval_queue.apv_id` | PK 가 TEXT(앞 둘은 기본값 없음) | P2 | 정본 §3-2 UUID 권장 | `apv_id` 는 04 M4, 나머지 둘은 후속 |
| `std_dic.stored_term_comp_ids` · `std_dic` 도메인 속성 중복 | 1NF·3NF 위반 | P2 | 04 모델링 가이드 정규화 | 02 §5-3 기록, 후속 설계 재검토 |

## 4. da-ddl-guard 기계 검사 집계

저장소 루트에서 stdin JSON 으로 실행했다(파일은 스크래치패드 경로, `sql/` 미사용).

| 규칙 | 02 (exit 2 차단) | 04 (exit 0 통과) |
|---|---|---|
| R1 시스템 컬럼 | 0 | 0 |
| R2 접두사 | 8 — **전부 `mdl_` 승인 대기**(`mdl_sys`·`mdl_db`·`mdl_tbl`·`mdl_col`·`mdl_tbl_hist`·`mdl_col_hist`·`mdl_index_hist`·`mdl_chg_hist`) | 0 |
| R3 소문자 | 0 | 0 |
| R4 날짜 타입 | 0 | 0 |
| R5 물리삭제 | 0 | 0 |
| R6 논리삭제 | 0 | 0 |
| R8 단일 단어 | 0 | 0 |
| R7 경고 | 7 — **전부 승인 대기 도메인**(`len` 4 : `mdl_col`·`mdl_col_hist` 의 `data_len`·`dcpt_len` / `ms` 3 : `sum_excn_ms`·`old_avg_excn_ms`·`new_avg_excn_ms`) | 21 — 전부 grandfathered(§3-1) |
| **승인 대기 제외 후 순위반** | **0** | **0** |

- Hook R1 은 시스템 컬럼 "존재·형식"만 보고 순서는 보지 않는다. 순서는 PGlite 카탈로그로 따로 확인했다(§5).
- 04 초판(20:05)은 승계 4테이블에서 `del_yn`·`del_dtm` 이 시스템 컬럼 뒤에 있었는데 Hook 은 이를 통과시켰다. 갱신본에서 해소됐다. Hook 보강 후보로 리더에게 상신한다(§7).

## 5. PGlite 적용 검증

| # | 단언 | 결과 |
|---|---|---|
| A1·A2 | 04 M1 적용 · 재적용(멱등) | PASS · PASS |
| A3 | 04 M1 → 02(M4 없음) | 42804 실패 — r2 에서는 02 선행조건 위반이라 **실패가 정상** |
| B1·B2 | 04 M1 → **M4** → 02 | r1 : 02 FAIL 42804(Q-P1-1) → **r2 : PASS** |
| C-M4 | 02 적용 뒤 M4 재실행 | PASS(이미 uuid — 건너뜀 분기) |
| 권한(r4) | baseline 실물 `fn_grant_svc_only` + 역할 anon·authenticated·service_role : 22 테이블 anon SELECT·authenticated INSERT 불가, service_role 허용, RLS 비활성 | PASS |
| 권한(r4) | 트리거 함수 14(신규 `fn_upd_*_mod_dtm` 9 + 승계 4 + `fn_std_audit_log`) EXECUTE anon·authenticated 회수, service_role 허용 | PASS |
| 권한(r4) | 트리거 함수 14 `search_path = pg_catalog, pg_temp` 고정 | PASS |
| r5 | `env_key_nm` = `SUPABASE_SERVICE_ROLE_KEY` 거부 · `rcmnd_sts_cd` = REVIEW 거부 · `tbl_tp_cd` 범위 밖 거부 · `last_clct_rslt_cd` 범위 밖 거부 | PASS(23514 ×4) |
| r5 | `std_chck_rslt.excp_yn` CHAR(1) NOT NULL · `cod_val.vld_end_dt` DATE | PASS |
| r5 | CHECK 56 · FK 21 · 인덱스 43 명명 · 권한 잠금 22 테이블·14 함수 | PASS |
| C2·C3 | 04 M1 → M4 → 02 적용 · 02 재적용 | PASS · 오류 중단 42P07(이중 생성 없음, Q-P3-2) |
| 형식 | 시스템 컬럼 = 22 테이블 모두 마지막 4개·순서 고정 | PASS |
| 형식 | 시스템 컬럼 88개 타입·NOT NULL·DEFAULT(`'ADMIN'`·`CURRENT_TIMESTAMP`) | PASS |
| 형식 | `_dtm`·`_dt` 날짜형, TIMESTAMP WITHOUT TIME ZONE 0 | PASS |
| 형식 | 단일 단어 컬럼 0(R8) · 신규 `_ord` 0 | PASS |
| 형식 | `_yn` = CHAR(1) | 신규 PASS · 승계 3건 TEXT(grandfathered) |
| 형식 | `_hist` 8 테이블에 `del_yn`·`del_dtm` 없음 | PASS |
| 형식 | 운영 테이블 13(신규 9 + 승계 4) `del_yn`+`del_dtm` 보유 | PASS |
| 형식 | 신규 17 PK = UUID 단일 컬럼 · PK 명 `<테이블>_pkey` | PASS |
| 명명 | FK 21 `<자식>_<부모>_…_fkey` · CHECK 52 `<테이블>_…_check` · 인덱스 43 `_key`·`idx_<테이블>_` | PASS |
| 무결성 | `del_yn='X'` INSERT 거부 23514 | PASS |
| 무결성 | FK 고아 INSERT 거부 23503(`mdl_db`→`mdl_sys`, `metric_qry_hist`→`metric_clct_hist`) | PASS |
| 무결성 | `mdl_db.env_key_nm` 에 접속 문자열 거부 23514 | PASS |
| 무결성 | `metric_impv_rcmnd` APPROVED + `apv_id` NULL 거부 23514 | PASS |
| 트리거 | `mdl_sys` UPDATE 시 `mod_dtm` 갱신 | PASS |
| 트리거 | 운영 테이블 13개 모두 `trg_<t>_mod_dtm` 보유(`_hist`·`_log` 9개 면제) | PASS |
| 트리거 | `cod_group`(term_id NULL·지정) · `cod_val` INSERT 시 감사 행 생성, `tgt_id` = 자기 PK | PASS — 04 M1-8 TG_TABLE_NAME 매핑 반영 확인 |
| 이관 | 04 M3 백필 실행 | PASS |
| 이관 구조 | 02·04 실행문의 `DELETE FROM`·`TRUNCATE`·`DROP TABLE` | 0 · 0 (주석 롤백 예시 제외) |
| 이관 구조 | 04 롤백 절 R1·R2·R3·R-opt | 존재 |

04 이관 SQL(M2 적재·V 검증·C 동결)은 이행담당의 로컬 PG17 리허설 보고를 따르고 구조만 재확인했다. M2 `load()` 컬럼 목록과 V2 체크섬 목록은 갱신본에서 승계 72컬럼을 모두 담는다.

## 6. 04 §7.3 모델 검토 체크리스트 11항 독립 재판정

| # | 항목 | modeler | 재판정 | 차이 사유 |
|---|---|---|---|---|
| 1 | 주제영역·엔터티 명명 | 조건부 | 조건부(동의) | `mdl_` R2 8건 승인 대기 실측 일치 |
| 2 | 식별자 4원칙 | 충족 | 신규 충족 · 승계 미충족 | 승계 PK 3개 TEXT 를 별도 판정(§3-1). modeler §5-2 에는 기재돼 있으나 표 판정에 빠짐 |
| 3 | 속성명 표준용어·도메인 | 신규 충족 · 승계 미충족 | 동의 | 신규 순위반 0, 승계 21 Hook 실측 일치 |
| 4 | 관계 정의 | 충족 | 충족 | FK 21 이 카탈로그 21 과 일치 |
| 5 | 1:1·M:N 정리 | 충족 | 동의 | — |
| 6 | 서브타입 | 해당 없음 | 동의 | — |
| 7 | 이력 패턴 | 충족 | 동의 | 시점 스냅샷, `_hist` 면제 실측 |
| 8 | 코드 속성·코드그룹 연결 | 조건부 | 동의 | CHECK 고정 코드 10종의 `cod_group` 자기 등재는 1단계 초기 적재 과제 |
| 9 | 정규화·반정규화 승인 | 신규 충족 · 승계 미충족 | 신규 충족(r6 — 반정규화 3건 모두 리더 승인 2026-10-14 : ①②는 위 사유, ③ `mdl_db.last_clct_dtm`·`last_clct_rslt_cd` 목록 표시용 요약, 성공 이력 정본은 `mdl_tbl_hist.clct_dtm` · `last_err_txt` 는 고유 속성으로 분리) · 승계 미충족 | 반정규화 2건 **리더 승인 2026-10-14** — ① `metric_impv_rslt` 전·후 측정값 고정 저장 : 수집 행 보존기간 정리 뒤에도 효과 기록이 바뀌지 않게 하는 감사 증적 ② `mdl_chg_hist` 전·후 JSONB 저장 : 스냅샷 정리 뒤에도 변경 이력 보존 |
| 10 | STD·별표 1 R 규칙 | 조건부 | 조건부(r2) | r1 은 미충족(Q-P1-1, modeler PGlite 검증이 M4 미적용 경로만 다룸). r2 에서 해소, 남은 Hook 차단은 승인 대기분뿐 |
| 11 | 메타 리포지토리 등록 | 미충족(후행) | 동의 | 구조상 P09 자기 등재 후행 |

## 7. 경계면 교차 비교 · 문서 규칙

| 경계 | 결과 |
|---|---|
| 02 ↔ 04 승계 재정의 | 02 는 승계 5테이블을 CREATE 하지 않고 04 M1 을 정본으로 참조한다(A절) |
| 02 §3 승계 정의 ↔ 04 M1 ↔ 개발 DB | 81컬럼·NULL·기본값·`term_id` UUID 일치(04 갱신본). 04 초판은 코드 역추적이라 7컬럼 누락·`term_id` TEXT 였고 갱신본에서 해소 |
| 02 ERD 소급 ↔ 04 | `del_dtm` 4 · `approval_queue.del_yn` · `std_audit_log` 시스템 4 · `apv_id` UUID(M4) 일치. 02 FK `apv_id` 도 r2 에서 UUID 로 일치 |
| 02 ↔ 01 치환표 | 표준담당 r2 명명 검증 통과와 Hook 결과 일치 |
| 04 계획서 ↔ 04 DDL | r3 일치(81 = 72 + 9, 컬럼 목록·Hook 21건, 02 적용 시점 M4 뒤) |
| 절대경로 | 0 — 04 계획서의 `C:/...`·`C:/<저장소 밖 임시폴더>` 는 자리표시자 |
| 시크릿 | 0 — 접속 URL 은 셸 변수 `SRC_URL`·`TGT_URL` 로만 표기 |
| `[확인중 : 채널]` 형식 | r2 위반 0 — 04 계획서 §11-1 맨 `[확인중]` 제거 확인. `00_input.md` 의 1건은 규칙 서술 |
| 브랜드 | PyCafé™ 표기 정상 |

**리더 상신(정본·Hook 개정 안건)** — 리더 결정 2026-10-14 : 설계서 §10 정본 개정 안건으로 상정. Hook R1 에 "시스템 컬럼 = 마지막 4개·순서" 검사가 없다. 04 초판이 이 상태로 Hook 을 통과했다. 품질점검기준서 P1 항목인데 기계 검사가 비어 있다.

**반복 패턴(직전 게이트 대조)** : 2026-10-10 sitemap 게이트(r1~r4)는 승계 객체를 점검에서 빼 `sys_user.id` 를 놓쳤다(정본 §10 #22). 이번에는 승계 5테이블을 점검에 넣었다. 그래도 04 초판은 코드 역추적만으로 승계 정의를 만들어 실 DB 컬럼 7개를 빠뜨렸다. 승계 정의는 실 DB 카탈로그로 만든다는 원칙을 da-migration 지침에 넣기를 권고한다.

## 8. 재판정 기록

| 회차 | 일시 | P1 잔존 | 판정 |
|---|---|---|---|
| r1 | 2026-10-14 20:25 | Q-P1-1 | FAIL |
| r2 | 2026-10-14 20:30 | 0 | **PASS(P2 조건부)** — Q-P1-1 해소(02 `apv_id UUID`·M4 뒤 실행), Q-P2-1 해소(계획서 81컬럼·21건), Q-P2-2 신규. Hook 재실행 결과 r1 과 같음(02 R2 8·R7 7 승인 대기, 04 순위반 0·경고 21). PGlite 단언 전 항목 PASS(승계 `_yn` TEXT 3건은 grandfathered) |
| r3 | 2026-10-14 20:35 | 0 | **PASS** — modeler 재판정 요청 반영. 04·계획서 20:26 갱신본 기준 PGlite 재실행(M1 → M4 → 02 통과, M4 없이 02 는 42804 로 실패가 정상), Hook 04 순위반 0·경고 21 동일. Q-P2-2 해소. 남은 FAIL 1 은 승계 `_yn` TEXT 3건(grandfathered) |
| r4 | 2026-10-14 20:40 | 0 | **PASS** — 리더 반정규화 2건 승인 기록. 02 G절 권한 잠금·D-1 search_path 반영본을 baseline 실물 함수·역할 3종으로 PGlite 재단언(테이블 22·함수 14 전부 PASS). 계획서 §11 3회 분할 투입 확인. Hook 02 R2 8·R7 7(승인 대기), 04 순위반 0·경고 21 동일. PASS 40 · FAIL 1(승계 `_yn` TEXT grandfathered) |
| r5 | 2026-10-14 20:50 | 0 | **PASS(P2 2건 조건부)** — 02 r5 보강(11컬럼·CHECK 4 신설·REVIEW→PENDING·env_key_nm 축소) PGlite 재단언 PASS 45 · FAIL 1(승계 `_yn` grandfathered). Hook 02 R2 8·R7 7 동일, 신규 11컬럼 R7 0. 신규 P2 : Q-P2-3 `tpc_cd`↔`tpc_rlm_cd`, Q-P2-4 반정규화 승인 대기. 신규 단어 8 의 표준담당 판정은 별도(01 은 r5 등재 반영, naming-review 갱신 전) |
| r5b | 2026-10-14 20:55 | 0 | **PASS(P2 1건 조건부)** — `mdl_tbl.tpc_cd` → `tpc_rlm_cd` 개명 확인(DDL·모델 §3, 잔존 0). PGlite PASS 45 · FAIL 1(grandfathered), 집계 318 동일, Hook 02 R2 8·R7 7 동일. 남은 P2 = Q-P2-4 반정규화 리더 승인 |
| r6 | 2026-10-14 21:00 | 0 | **PASS(최종)** — Q-P2-3 : DDL `tpc_rlm_cd`·코드그룹 값 `TPC_RLM_CD`(`TPC_CD` 0건), 모델 §3 반영, 표준담당 확정. Q-P2-4 : **리더 승인 2026-10-14** — `mdl_db.last_clct_dtm`·`last_clct_rslt_cd` 는 목록 표시용 요약, 성공 이력 정본은 `mdl_tbl_hist.clct_dtm`, `last_err_txt` 는 고유 속성(반정규화 아님)으로 모델 §5-3 분리 기재 확인. Q-P3-4 : 마스킹 단위 테스트 1건은 설계서 §9-3 반영(리더 판정). DDL 구조 무변경이라 PGlite·Hook 결과는 r5b 와 같음 |
