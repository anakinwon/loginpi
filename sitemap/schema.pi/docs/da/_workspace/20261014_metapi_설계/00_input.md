# 00_input — 메타시스템(METAPI) 구축 설계서 (2026-10-14, 마스터 지시)

## 마스터 요청 원문

> `docs/da/메타시스템_구축_제안서.md` 이 제안서를 토대로, REA가 가장 요건에 맞는 사이트를 찾아서 분석하고 최적의 설계서를 만들어 줘
> 설계서: `docs/da/references/메타시스템(METAPI)_구축_설계서.md`

## 마스터 확정 (계획 승인 2026-10-14)

1. REA 분석 = 마스터가 Google 로그인한 Chrome(디버그 포트 9222)에 connect, 대상 OpenMetadata 샌드박스(1순위), DataHub 보조
2. 범위 = **1단계 상세 + 2·3단계 개요**
3. 구현 위치 = **B안 `schema.pi` 독립 앱**(19 사이트 DB 대상, PRD_28 §3 구조)
4. 접두사 `mdl_`·`prf_`(·`biz_`)·신규 표준단어·`ms` 도메인 = 제안서 §4 안을 "DA 승인 전제"로 설계서 안 DDL 에만 사용. `sql/` 파일 미작성

## 수정 범위

- 신규 `docs/da/references/메타시스템(METAPI)_구축_설계서.md` 1파일
- 이 잡 디렉토리 산출물(팀원 `01~04_*`, `rea/` Evidence·스크린샷)
- `docs/da/README.md` 계층 1 목록 1줄
- 변경 금지 : `sql/`, `docs/da/데이터표준규칙.md`, `docs/da/품질점검기준서.md`, `src/`

## 점검 범위 (전 객체)

- 제안서 §2 메뉴 43(1단계 18·2단계 7·3단계 17·제외 1)·§3 프로그램 P01~P45 전수 → 설계서 절 매핑 누락 0
- 신규 테이블 17(1단계 `cod_set`·`cod_val`·`mdl_sys`·`mdl_db`·`mdl_tbl`·`mdl_col`·`mdl_tbl_hist`·`mdl_col_hist`·`mdl_idx_hist`·`mdl_chg_hist`·`std_chk_rslt`, 2단계 `prf_clct_hist`·`prf_qry_hist`·`prf_tbl_hist`·`prf_idx_hist`·`prf_tune_rcmd`·`prf_tune_rslt`) 전 컬럼
- **이관 대상(승계 객체)도 점검** : `std_dic`·`std_dom`·`std_term`·`approval_queue`·`std_audit_log` — "이관·승계"라고 점검에서 빼지 않는다. 규칙 어긋남(`del_dtm` 없음·트리거 `NOW()`·`apv_id TEXT`)은 grandfathered 표기 + 소급 계획
- 승인 보고는 "점검 컬럼 수 = 전체 / 신규 / 승계" 분리

## B안 전제 (설계서 §2·§4·§8 필수)

- `sitemap/schema.pi/` 앱, `@pi/auth`·`@pi/db`·`@pi/guard` 의존, 사이트별 Supabase(개발·스테이징 공유 프로젝트 `schema_dev`·`schema_stg`), 운영 `prod/schema`, 별도 Vercel
- 로그인 Pi 인증만(PRD_28 §1.1-2), 관리자 `isAdmin`/`isMaster`, Pi Browser 이중 경로
- 표준사전 소유권 METAPI DB 로 이관 → cafe.pi `/admin/std` 는 조회 API(P29) 소비자 전환 권고(결정 요청)
- 19 사이트 DB : env `META_DB_<SITE>` 이름만 `mdl_db.env_key_nm`, 구조·통계 전용 role [확인중 : Supabase 문서], 사이트 간 데이터 정책 [확인중 : legal-compliance-advisor](PRD_28 §1.1-1·§11 #4)

## 산출물 규칙

파일명 `{NN}_{팀원}_{산출물}.{ext}`. DDL 은 `02_modeler_ddl.sql`(잡 디렉토리 안, `sql/` 아님). 모든 [확인중] 은 `[확인중 : 채널]` 형식. 절대경로·시크릿 금지. 브랜드 표기 PyCafé™.
