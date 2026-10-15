# 02_standards_naming-review — METAPI DDL r1 명명 검증

> 작성 : da-standards · 2026-10-14 · 대상 `02_modeler_ddl.sql`·`02_modeler_model.md` r1 · 기준 `01_standards_dictionary.md`(리더 판정 반영본)
> 방법 : DDL 의 신규 17테이블 CREATE 본문에서 컬럼을 추출했다. 각 컬럼을 `_` 토큰으로 나눠 도메인 종결·토큰 등재·R8 을 기계 검사했다. 제약·인덱스명은 정본 §5 패턴으로 대조했다.
> 결과 : r1 위반 2건 → **r2 전량 해소, 통과**(§5 대조표).

## 1. 위반 목록

| # | 대상 | 위반유형 | 권장값 |
|---|---|---|---|
| V1 | 2단계 6테이블 `prf_clct_hist`·`prf_qry_hist`·`prf_tbl_hist`·`prf_index_hist`·`prf_impv_rcmnd`·`prf_impv_rslt`와, 이를 포함한 제약·인덱스명(DDL 내 `prf_` 36회) | 접두사 판정 미반영. 리더 판정 2로 `metric_` 재사용이 확정됐고 `prf_` 는 미채택 | 전부 `metric_*`. 예 `metric_qry_hist_metric_clct_hist_id_fkey`. C절 머리 주석 "prf_ 임시 유지"도 정정. 반영하면 Hook R2 차단이 14건에서 8건(`mdl_` 승인 대기분)으로 준다 |
| V2 | `prf_qry_hist.qry_id`·`prf_impv_rcmnd.qry_id`와 인덱스 `*_qry_id_key`·`idx_*_qry_id` | 외부 발급 식별자에 `_id` 를 썼다. 이 프로젝트에서 `_id` 는 자체 UUID PK·FK 를 뜻한다. 그래서 FK 규칙(§3-3, 참조 PK 이름 그대로)상 존재하지 않는 `qry` 엔터티의 PK 로 읽힌다 | `qry_uid`(도메인 `uid` TEXT, Hook 기등재) — 판정 5 |

## 2. modeler 판정 요청 회신

| # | 요청 | 판정 | 근거 |
|---|---|---|---|
| 1 | 추가 단어 '적용 APLCN' (`aplcn_dtm`) | **승인** | 공통표준단어 '적용' = APLCN(Application)이고 역충돌이 없다. 공통표준 등재분이라 길이 예외(판정 1)에 해당한다. 신청서 §1-1 #49 로 등재했다 |
| 2 | 이력·통계 PK 를 엔터티약어로 | **승인** | 정본 §3-2 `<엔터티약어>_id` 에 맞는다. 공통 `hist_id` 를 쓰면 자식 FK 와 이름이 겹친다. 통계 쪽 `*_stats_id` 도 승인한다. `mdl_tbl_hist` 와 `metric_tbl_hist` 가 둘 다 `tbl_hist_id` 를 쓰면 같은 용어가 다른 엔터티를 가리키는 동음이의가 되므로 이를 피하는 방법으로 타당하다. 테이블명 `_hist` 접미사는 R6 면제 때문에 유지한다 |
| 3 | `pk_yn`·`fk_yn` → `pk_seq` + `rfrnc_*` 쌍 | **승인** | 토큰은 모두 등재돼 있다. 이로써 `fk_yn` 이 사라져 기관 신규 단어 **'외래키 FK' 신청을 철회**했다. '기본키 PK'는 `pk_seq`·`mdl_index_hist.pk_yn` 에서 계속 쓴다 |
| 4 | `cod_group.term_id`·`mdl_tbl.apv_sts_cd`·`prf_impv_rcmnd.clct_id`·`old/new_blck_rd_cnt` | **통과** | 모두 기등재·신청 토큰이다. `apv_sts_cd` 는 신청서 §6 의 승계 `apv_status` 권장값과 같은 이름이라 이관 후 표준이 하나로 맞는다 |
| 5 | `qry_id` vs `qry_uid` | **`qry_uid` 채택** | V2 참조. 정본 §8 의 "외부 식별자 `<시스템>_uid`" 는 외부 시스템이 발급한 값에 `_uid` 를 쓰라는 규칙이다. `queryid` 는 pg_stat_statements 가 만든 해시다. 첫 토큰은 엔터티 `qry` 로 두는 편이 뜻이 분명하다(`pg_uid` 는 무엇의 식별자인지 드러나지 않음). COMMENT 에 "pg_stat_statements queryid" 를 명기할 것 |
| 6 | 구조 변경 참고 | 이름 판정 없음 | `avg_excn_ms` 제거로 '평균 AVG'가 쓰이는 곳은 `old/new_avg_excn_ms` 만 남는다. 단어 등재는 유지한다 |

## 3. 집계 정정 수용

modeler 의 PostgREST OpenAPI 조회 기준을 정본 집계로 채택한다. 조회 대상은 `.env.local` 의 **개발 DB 이고 운영 DB 는 미확인**이다(r2 때 modeler 정정, 초판의 "운영" 표기는 오기). 신청서 §6 의 64 는 행 키 조회 방식이라 0행인 approval_queue 를 5컬럼만 셌다.

| 구분 | 컬럼 |
|---|---|
| 신규(DDL r1, 17테이블) | 226 = 1단계 147 · 2단계 79 |
| 승계 원천 | 72 = std_dic 21 · std_dom 16 · std_term 12 · approval_queue 15 · std_audit_log 8 |
| 승계 이관 후 | 81 |
| **점검 전체(이관 후 기준)** | **307** |

초판의 "개발 22 · 운영 21" 비교는 철회한다. 같은 개발 DB 를 조회한 것이고, 표준담당 키 조회 결과를 다시 세면 21개라 OpenAPI 와 일치한다(초판 22 는 계수 오류). 운영 DB 역검증은 여전히 미수행이다 [확인중 : 운영 std_dic 조회].

## 4. 기계 검증 기록 (r1)

| 테이블 | 컬럼 | 결과 | 테이블 | 컬럼 | 결과 |
|---|---|---|---|---|---|
| cod_group | 12 | OK | std_chck_rslt | 13 | OK |
| cod_val | 14 | OK | metric_clct_hist | 9 | OK(V1) |
| mdl_sys | 11 | OK | metric_qry_hist | 13 | OK(V1·V2) |
| mdl_db | 14 | OK | metric_tbl_hist | 14 | OK(V1) |
| mdl_tbl | 12 | OK | metric_index_hist | 9 | OK(V1) |
| mdl_col | 22 | OK | metric_impv_rcmnd | 19 | OK(V1·V2) |
| mdl_tbl_hist | 9 | OK | metric_impv_rslt | 15 | OK(V1) |
| mdl_col_hist | 17 | OK | | | |
| mdl_index_hist | 10 | OK | | | |
| mdl_chg_hist | 13 | OK | **계** | **226** | 토큰 위반 0 |

- 제약·인덱스명 : PK·UK·FK(`<자식>_<부모>_id_fkey`)·CHECK·INDEX 전부 §5 패턴과 일치했다.
- Hook R7 경고 7건(`len` 4·`ms` 3)은 판정 3·원안 승인에 따른 예정 경고다. 승인 시 Hook `DOMAIN_SUFFIXES` 갱신으로 해소된다.

## 5. r1 → r2 대조 (재검증 때 채움)

| # | r1 | r2 |
|---|---|---|
| V1 | 위반 | **해소** — DDL 내 `prf_` 는 375행 주석("제안서 prf_ 미채택") 1건만 남음. 테이블 6·제약·인덱스·트리거 전부 `metric_*` |
| V2 | 위반 | **해소** — `qry_id` 0건, `qry_uid` 2컬럼·인덱스 3·COMMENT 2 |

- r2 기계 검증 : 신규 17테이블 226컬럼, 토큰·도메인·R8 위반 0, 제약·인덱스명 비패턴 0.
- 판정 : **명명 검증 통과(r2, 2026-10-14)**. 남은 Hook 차단 R2 8건(`mdl_` 접두사)과 R7 경고 7건(`len`·`ms`)은 DA 승인 대기 항목이라 명명 위반이 아니다.

## 6. r5 보강 신규 11컬럼 검증 (2026-10-14)

- 방법 : 단어 8개를 공통표준단어 CSV 로 정·역방향 조회했다. 공통 용어 CSV 로 구성도 대조했다. DDL 의 신규 17테이블 전 컬럼을 다시 기계 검사했다.
- 결과 : 신규 **237컬럼(1단계 156 · 2단계 81)**, 토큰·도메인·R8 위반 0, 제약·인덱스명 비패턴 0. 11컬럼이 DDL 에 모두 있다.
- 신청서 반영 : 공통표준 단어 8건(요청 DMND·응답 RSPNS·종료 END·영역 RLM·접속 CNTN·시험 TEST·오류 ERR·예외 EXCP)을 #50~57 로 추가했다. 주제 TPC 는 3단계 예약에서 이번 묶음으로 앞당겼다. 이번 등재는 **60 = 공통 54 + 기관 6**, 3단계 예약 단어는 4(동의어·금칙어·프로그램·사업)다. 역충돌은 0이다. `TST`·`GF` 는 공통 미등재라 쓰지 않는다. `RQST` 는 미등재가 아니라 공통에서 **'의뢰'로 등재**돼 있다. 그래서 '요청'에 쓰면 동음이 되므로 `DMND` 가 맞다(modeler 메시지의 "RQST 공통 미등재"는 결론은 같으나 사유 정정).

| 컬럼 | 판정 | 근거 |
|---|---|---|
| `mdl_tbl_hist.tbl_tp_cd` | 통과 | 공통 '테이블유형명' TBL_TYPE_NM, 유형은 기등재 `tp` |
| `std_chck_rslt.excp_yn` | 통과 | 공통 '예외여부' EXCP_YN 과 동일 |
| `metric_impv_rcmnd.dmnd_cont`·`rspns_cont` | 통과 | 공통 '변경요청내용' CHG_DMND_CN·'응답내용' RSPNS_CN, 내용은 기등재 `cont` |
| `cod_val.vld_end_dt` | 통과 | 공통 '유효종료일자' VLD_END_YMD, 일자는 기관 도메인 `dt` |
| `mdl_tbl.tpc_cd` | **수정 요청(R5-V1)** → `tpc_rlm_cd` | 담는 값은 주제영역(정본 §2-1 '주제영역')이다. 공통 용어 '주제영역명' = TPC_RLM_NM 이 있어 원칙 2(공통 용어 구성 단어를 따름)에 해당한다. `tpc_cd` 는 '주제코드'로 읽혀 3단계 `biz_tpc`(주제)와 뜻이 섞인다. 영역 RLM 은 공통표준 3자라 길이 문제도 없다 |
| `mdl_db.cntn_test_dtm`·`cntn_test_rslt_cd`·`last_clct_dtm`·`last_clct_rslt_cd`·`last_err_txt` | 통과 | 접속 CNTN·시험 TEST·최종 LAST·수집 CLCT·결과 RSLT·오류 ERR. `last_err_txt` 는 시스템이 내는 오류 문자열이라 `txt` 가 맞다(공통 '오류내용' ERR_CN 의 `cont` 는 사람이 쓰는 서술) |

- CHECK 값 변경 2건(`rcmnd_sts_cd` REVIEW→PENDING, `env_key_nm` 정규식 축소)은 명명 영향이 없다. `rcmnd_sts_cd` 값이 승계 `approval_queue.apv_status` 의 PENDING 과 같아진 것은 일관성 면에서 좋다.
- 집계 : 신규 237 + 승계(이관 후) 81 = **318**. R5-V1 은 컬럼 이름만 바꾸므로 집계 영향이 없다.

| # | r5 | r6 |
|---|---|---|
| R5-V1 | `tpc_cd` 수정 요청 | **DDL 해소** — `mdl_tbl.tpc_rlm_cd`(DDL 118행), 237컬럼 위반 0. **잔여 2건** : ① `02_modeler_model.md` §3 속성 정의서 211행이 `tpc_cd` 그대로(카탈로그 재생성 필요) ② DDL 주석의 코드그룹 값 `'TPC_CD'` → `'TPC_RLM_CD'` 권고(코드그룹코드는 그 코드를 쓰는 표준용어 물리명과 같게). da-quality 게이트 Q-P2-3 지적(2026-10-14)으로 확인 <br>**r6 재확인 : 전량 해소** — DDL `tpc_cd`·`TPC_CD` 0건, `tpc_rlm_cd`·`TPC_RLM_CD` 반영. 모델 문서 속성 정의서 갱신(남은 `tpc_cd` 1건은 699행 판정 근거 인용문). Q-P2-3 종결 |
