## 부록 A. REA Evidence 목록

| ID | 종류 | 대상 | 파일 | 반영 절 |
|---|---|---|---|---|
| — | 스펙·문서 추출 | openmetadata-spec glossaryTerm·status·entityHistory·table·tag, docs approval·import | `rea/00_spec_notes.md` | §1-2 |
| (대기 — 이 세션은 헤드리스 Chrome 실행 거부로 S0 비로그인 분석도 미수행) | `rea list-browser-targets` / `inspect-web-page` / `observe-web-session` / `capture-web-screenshot` / `analyze-web-bundle` / `trace` / `evidence-export` | sandbox.open-metadata.org S1~S8 | `rea/01_targets.json` … `rea/07_evidence_bundle.json` | §1-3 [확인중 : 마스터] |

## 부록 B. OpenMetadata ↔ METAPI 매핑표

| OpenMetadata 개념 | METAPI 객체 | 채택 | 비고 |
|---|---|---|---|
| Glossary / GlossaryTerm | `std_term`(+`std_dic`·`std_dom`) | 부분 | OM 은 1계층 용어, METAPI 는 단어+도메인 조립 |
| entityStatus | `apv_sts_cd`·`approval_queue.apv_status` | 채택(4값 DRAFT·PENDING·APPROVED·REJECTED) | In Review=PENDING, Deprecated 는 `use_yn`/`del_yn`, Archived·Unprocessed 제외 |
| Reviewer·Task | `approval_queue` + master 승인 | 변형 | 자동 승인 불채택 |
| Classification / Tag | `cod_group` / `cod_val` | 채택 | `disabled`→`use_yn`, `deprecated`→`vld_end_dt` |
| Service → Database → Schema | `mdl_sys` → `mdl_db`(1행 = 스키마 1) | 채택 | 커넥터 비밀 = env 키 이름 |
| Table / Column (+constraint·ordinalPosition) | `mdl_tbl`/`mdl_col`(설계), `mdl_tbl_hist`/`mdl_col_hist`(수집) | 채택 | `profile` 미수집 |
| Version history `changeDescription` | `mdl_chg_hist` | 채택 | 버전 번호 대신 수집 시점 쌍 |
| Ingestion(커넥터 수집) | P13 `pg_catalog` 수집 + cron | 채택 | 구조만 |
| Lineage | P23 역조회 목록 | 축소 | 그래프 3단계 |
| TestCase / TestSuite | `std_chck_rslt`(R1~R10) | 변형 | 명명 규칙 검사, 값 검증 아님 |
| CSV Import(Preview) | P06 3단계(행별 사유) | 확장 | |
| Search | P25 `pg_trgm` UNION | 채택 | |
| Usage / 성능 | `metric_*`(2단계) | 직접 설계 | OM 에 없음 |

## 부록 C. 제안서 커버리지 (메뉴 43 · 프로그램 P01~P45 → 설계서 절)

| 프로그램 | 절 | 프로그램 | 절 | 프로그램 | 절 |
|---|---|---|---|---|---|
| P01 | §3-3·§5 A1 | P16 | §3-3·§5 A13·§6-3 | P31 | §3-1(3단계) |
| P02 | §3-3·A2 | P17 | §3-3·A14·§6-4 | P32 | §3-1(3단계) |
| P03 | §3-3·A3 | P18 | §3-3·A14·§6-4 | P33 | §3-1(3단계) |
| P04 | §3-3·A4·§4 `cod_*` | P19 | §3-3·A15 | P34 | §3-1(3단계) |
| P05 | §3-1(3단계)·§4-0 예약 `std_synm`·`std_phwrd` | P20 | §3-3·A16·§3-2 | P35 | §5-4·§7-1 |
| P06 | §3-3·A5 | P21 | §3-3·A17 | P36 | §3-4·§5-4·§7-2 |
| P07 | §3-3·A6 | P22 | §3-1(3단계) | P37 | §3-4·§7-2 |
| P08 | §3-3·A7·§4 `mdl_tbl/col` | P23 | §3-3·A18 | P38 | §3-4·§7-2 |
| P09 | §3-3·A8·§6-5 | P24 | §3-1(3단계)·§4-0 예약 `mdl_prgrm*` | P39 | §3-4·§7-3 |
| P10 | §3-3·A9·§2-4 `genDdl` | P25 | §3-3·A19 | P40 | §3-4·§7-4 |
| P11 | §3-1(3단계)·§4-0 예약 `mdl_tbl_ver` | P26 | §3-1(3단계)·§4-0 예약 `biz_*` | P41 | §3-4·§7-5 |
| P12 | §3-3·A10·§4 `mdl_sys/db` | P27 | §3-1(3단계) | P42 | §3-4·§7-5 |
| P13 | §3-3·A11·§6-1 | P28 | §3-1(3단계) | P43 | §3-1(3단계) |
| P14 | §3-1(3단계)·§6-6 cron | P29 | §5 A20(1단계 선행 구현) | P44 | §3-1(3단계) |
| P15 | §3-3·A12·§6-2 | P30 | §3-1·§8 | P45 | §3-1(3단계) |

메뉴 43 : 1단계 18 → §3-1 행 1~17 + M9 사용자·권한(=18), 2단계 7 → §3-1 M11·M12 행, 3단계 17 → §3-1 마지막 행(목록, M10 대시보드 포함), 제외 1(범정부·ITSM) → §0-2 제외.

## 부록 D. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-14 | v0.1 최초 작성 — 마스터 결정(B안 schema.pi·1단계 상세·REA OpenMetadata·접두사 전제) 반영, da-team(standards 단어 51·도메인 2·접두사 `mdl_`, modeler 테이블 17+승계 5 DDL·ERD·정의서, migration 표준사전 이관 계획, quality 게이트) 산출물 수록, OpenMetadata 스펙 분석, REA 화면 관찰은 마스터 세션 대기 |
| 2026-10-14 | v0.2 — 문서 검수(anakin_phase-review) 결함 26건 반영 : 승인 상태 코드 4값 통일, 수집·diff·검증·성능 서술을 DDL 컬럼명과 일치, DDL 보강(`tbl_tp_cd`·`excp_yn`·`dmnd_cont`/`rspns_cont`·`vld_end_dt`·`tpc_rlm_cd`·`mdl_db` 결과 컬럼·`env_key_nm` CHECK 축소, 품질 r5·r6), 감사 범위·사이트 간 잠정 범위·P29 단계·3단계 예약 일람·zod·경로·표 이스케이프·절 번호 안내, §4-9 r6 판정·요약·위반 목록 발췌 |
