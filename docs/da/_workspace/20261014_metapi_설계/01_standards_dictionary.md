# 01_standards_dictionary — METAPI 신규 표준단어·표준도메인·접두사 신청서

> 작성 : da-standards · 2026-10-14 · 잡 `20261014_metapi_설계` 작업 T2 · 설계서 §4-6 수록용
> 입력 : 제안서 §4(`메타시스템_구축_제안서.md`), 정본 `데이터표준규칙.md` v2.4 §1-1·§1-2·§1-3·§2-1·§9, sql/176 등재분, 행안부 공통표준단어·도메인·용어 CSV(2025-11-01판), da-ddl-guard Hook(`DOMAIN_SUFFIXES`·`PREFIX_RE`)
> DB 역검증 : 개발 DB `std_dic` 67건·`std_dom` 19건 조회 완료. **운영 DB 역검증 미수행**(읽기 전용 키 거부) [확인중 : 운영 std_dic 조회]
> 상태 : **리더 판정 반영본(2026-10-14) — 마스터 승인 전제** — 승인 전에는 `sql/` 에 쓰지 않는다. 승인 판정은 da-leader → 마스터.

## 0. 적용 원칙 (판정 순서)

1. **기관 정본 기등재·실사용 약어 유지** — 정본 §9·§1-2·sql/176 에 있고 실제 컬럼에 쓰이는 약어는 공통표준과 달라도 그대로 쓴다. 같은 뜻을 두 약어로 등록하면 이음동의어 금지(§1-1) 위반이다. 해당 : `hist`(공통 HSTRY)·`old`/`new`(공통 이전 BFR·이후 AFTR, 공통 CSV 가 이음동의어로 '전'·'후'를 명시)·`tgt`(TRGT)·`apv`(APRV)·`tp`(TYPE)·`sts`(STTS)·`desc`(EXPLN)·`cont`(CN)·`cnt`(NOCS)·`dtm`(DT).
2. **공통표준 우선** — 1에 해당하지 않으면 공통표준단어의 영문약어를 그대로 쓴다(01 지침서 2장). 한글명이 공통표준단어에 없으면 공통표준 **용어**(예 '기대효과내용' = `EXPT_EFCT_CN`)의 구성 단어를 따른다.
3. **기관 신규 축약** — 공통표준 단어·용어 어디에도 없을 때만 §1-1(자음 위주 2~3자·관용형 우선)로 새로 만든다. 새 약어는 공통표준 약어 3,284건과 **역방향 충돌**(같은 약어가 다른 뜻으로 등재)이 없어야 한다.
4. **신규 단어를 늘리지 않는 대체 우선** — 기등재·공통표준 단어로 같은 뜻을 낼 수 있으면 새 단어를 만들지 않는다(예 심각도 → 등급 `GRD`, 튜닝 → 개선 `IMPV`, 총 → 합계 `SUM`, 튜플 → 행 `ROW`).
5. **형식단어 이중 역할 허용** — 도메인 약어와 **같은 뜻**의 단어는 컬럼 중간 토큰으로 쓸 수 있다(공통표준 형식단어 원칙. 개발 `std_dic` 에도 `CD`·`NM`·`YN` 이 단어로 등재돼 있음). 금지 대상은 '다른 뜻'이 같은 약어를 쓰는 경우(`ord` 주문↔순서)뿐이다. → 제안서 질의 `val`(`cd_val_*`)·`key`(`env_key_nm`)·`cd`(`cd_group_id`) **사용 가능**.

## 1. 단어 신청서

> **길이 규칙 예외(판정 1, 리더 2026-10-14)** : 공통표준 등재분은 §1-1 길이 규칙(자음 위주 2~3자) 예외로 하여 공통표준 영문약어를 길이와 무관하게 그대로 쓴다(01 지침서 2장 공통표준 우선이 §1-1 보다 상위). §1-1 길이 규칙은 기관 신규 축약에만 적용한다.

길이 판정 : ✅ = 자음 위주 2~3자 충족 / ⚠ = 4자 이상(공통표준 채택분, §1-1 예외 필요 — §5 판정 1). 충돌 검사 : 동음 = 같은 약어·다른 뜻, 이음 = 같은 뜻·다른 약어, 도메인 = §1-2 도메인 약어와 겹침.

### 1-1. 공통표준 채택 (57 = 이번 등재 묶음 54 + 3단계 예약 3)

| # | 한글명 | 영문명 | 영문약어(확정안) | 근거 | 길이 | 충돌 검사 | 사용 컬럼·테이블 |
|---|---|---|---|---|---|---|---|
| 1 | 모델 | Model | MDL | 공통표준단어 | ✅ | 없음. 제안서 이음동의 회피 메모(`model`)와 일치 | 접두사 `mdl_`, `mdl_nm` |
| 2 | 수집 | Collection | CLCT | 공통표준단어(용어 '수집일시' CLCT_DT) | ⚠ | 없음 | `clct_id`·`clct_dtm`·`old_clct_dtm`, `metric_clct_hist` |
| 3 | 점검 | Check | CHCK | 공통표준단어(용어 '점검결과내용' CHCK_RSLT_CN) | ⚠ | '검사 INSP'와 근접 이음 → **점검 하나만 등재**(품질점검기준서 용어와 일치) | `std_chck_rslt`, `chck_rslt_id`·`chck_grd_cd`·`chck_rslt_cont`·`chck_dtm` |
| 4 | 결과 | Result | RSLT | 공통표준단어 | ⚠ | 제안서 축약안 `rst`(reset 충돌)는 폐기 | `std_chck_rslt`·`metric_impv_rslt`, `*_rslt_*` |
| 5 | 규칙 | Rule | RUL | 공통표준단어(용어 '규칙명' RUL_NM) | ✅ | 제안서 축약안 `rl` 대신 공통표준 | `rul_cd` |
| 6 | 등급 | Grade | GRD | 공통표준 형식단어(분류 '번호') | ✅ | 없음. **심각도(공통 미등재)·위험수준을 대체** — 공통 용어 '위험등급명' RISK_GRD_NM | `chck_grd_cd`(P1~P3)·`risk_grd_cd` |
| 7 | 객체 | Object | OBJT | 공통표준단어 | ⚠ | 없음 | `objt_tp_cd`·`objt_nm` |
| 8 | 실행 | Execution | EXCN | 공통표준단어(용어 '실행횟수' EXCN_NMTM) | ⚠ | 없음 | `sum_excn_ms`·`avg_excn_ms`·`old/new_avg_excn_ms` |
| 9 | 호출 | Call Out | CLOT | 공통표준단어(용어 '호출수' CLOT_CNT) | ⚠ | 없음 | `clot_cnt`·`old/new_clot_cnt` |
| 10 | 블록 | Block | BLCK | 공통표준단어 | ⚠ | 없음 | `blck_hit_cnt`·`blck_rd_cnt` |
| 11 | 합계 | Sum | SUM | 공통표준단어 | ✅ | **총(`tot`, 공통 미등재) 대체** | `sum_excn_ms` |
| 12 | 평균 | Average | AVG | 공통표준단어 | ✅ | `mean` 대체(제안서 메모와 일치) | `avg_excn_ms` |
| 13 | 유효 | Validity | VLD | 공통표준단어 | ✅ | pg `live` 대체(살아있는 행 = 유효 행) | `vld_row_cnt` |
| 14 | 무효 | Invalidity | INVLD | 공통표준단어 | ⚠(5) | pg `dead` 대체. 공통 '사망 DTH'는 뜻이 달라 미채택 | `invld_row_cnt` |
| 15 | 전체 | Whole | WHOL | 공통표준단어 | ⚠ | pg `full`/`seq_scan` 대체. 제안서 축약안 `fl` 은 개발 `std_dic` 의 FL(파일)과 동음 → 폐기 | `whol_scn_cnt` |
| 16 | 최종 | Last | LAST | 공통표준단어(용어 '최종점검일시' LAST_CHCK_DT) | ⚠ | 없음 | `last_vcm_dtm` |
| 17 | 위험 | Risk | RISK | 공통표준단어 | ⚠ | 없음 | `risk_grd_cd` |
| 18 | 개선 | Improvement | IMPV | 공통표준단어(용어 '개선효과내용' IMPV_EFCT_CN) | ⚠ | **튜닝(공통 미등재) 대체** — 테이블명 연동 변경 | `metric_impv_rcmnd`·`metric_impv_rslt`, `impv_rslt_id` |
| 19 | 권고 | Recommendation | RCMND | 공통표준단어(용어 '권고내용' RCMND_CN) | ⚠(5) | 제안서 `rcmd` 는 공통과 다른 축약 → 공통 채택. '추천 RCMDTN'은 미채택 | `metric_impv_rcmnd`, `rcmnd_*` |
| 20 | 기대 | Expectation | EXPT | 공통표준 용어 '기대효과내용' EXPT_EFCT_CN | ⚠ | '예상 EXPC'와 근접 이음 → 기대만 등재. 제안서 축약안 `exp`(expire 충돌) 폐기 | `expt_efct_cont` |
| 21 | 효과 | Effect | EFCT | 공통표준단어 | ⚠ | 없음 | `expt_efct_cont` |
| 22 | 측정 | Measurement | MSRMT | 공통표준단어(용어 '측정일시' MSRMT_DT) | ⚠(5) | 없음 | `msrmt_dtm` |
| 23 | 통계 | Statistics | STATS | 공통표준단어 | ⚠(5) | 접두사 `stat_`(통계 중간집계)와 표기만 다름 — 접두사는 표준단어가 아니므로 위반 아님, 혼동 주의 | `stats_init_dtm` |
| 24 | 초기화 | Initialization | INIT | 공통표준단어(용어 '초기화여부' INIT_YN) | ⚠ | `reset` 대체. 제안서 축약안 `rst` 폐기 | `stats_init_dtm` |
| 25 | 인덱스 | Index | INDEX | 공통표준단어(용어 '인덱스명' INDEX_NM) | ⚠(5) | 인덱스 **객체명** 접두사 `idx_`(정본 §5)와 표기 불일치 — 단어 사전 충돌은 아님(§5 판정 1) | `mdl_index_hist`·`metric_index_hist`, `index_nm`·`index_sz`·`index_scn_cnt`·`index_dfn_txt` |
| 26 | 스키마 | Schema | SCHM | 공통표준단어(용어 '스키마명' SCHM_NM) | ⚠ | 없음 | `schm_nm` |
| 27 | 버전 | Version | VER | 공통표준단어 | ✅ | 없음 | `db_ver_nm`, 3단계 `mdl_tbl_ver` |
| 28 | 환경 | Environment | ENV | 공통표준단어 | ✅ | 없음 | `env_cd`·`env_key_nm` |
| 29 | 사이트 | Site | SITE | 공통표준단어(용어 '사이트명' SITE_NM) | ⚠ | 제안서 축약안 `st`(start·status) 폐기 | `site_nm` |
| 30 | 정렬 | Sort | SORT | 공통표준 용어 '정렬순서' SORT_SEQ | ⚠ | 없음. 기존 `sort_ord` 15테이블은 grandfathered | `sort_seq` |
| 31 | 데이터베이스 | Database | DB | 공통표준단어 | ✅ | 없음 | `mdl_db`, `db_id`·`db_tp_cd`·`db_desc`·`db_ver_nm` |
| 32 | 자료 | Data | DATA | 공통표준단어(이음동의어 '데이터' 명시) | ⚠ | 승계 컬럼 `std_dom.data_type_cd`·`data_len` 과 토큰 일치 | `data_tp_nm`·`data_len` |
| 33 | 참조 | Reference | RFRNC | 공통표준 용어 '참조컬럼명' RFRNC_COL_NM | ⚠(5) | 제안서 `ref` 대체 | `rfrnc_tbl_nm`·`rfrnc_col_nm`, 3단계 `mdl_prgrm_rfrnc` |
| 34 | 기본키 | Primary Key | PK | 공통표준 용어 '기본키여부' PK_YN | ✅ | 없음 | `pk_yn` |
| 35 | 널 | Null | NUL | 공통표준 용어 '널허용여부' NUL_PRM_YN | ✅ | 없음 | `nul_prm_yn` |
| 36 | 허용 | Permit | PRM | 공통표준단어 | ✅ | 없음 | `nul_prm_yn` |
| 37 | 기본 | Basic | BSC | 공통표준단어(금칙어 '디폴트') | ✅ | `default`·`dflt` 금지 | `bsc_val_txt` |
| 38 | 논리 | Logic | LGC | 공통표준 용어 '컬럼논리명' COL_LGC_NM | ✅ | 승계 컬럼 `dic_log_nm` 의 `log` 는 테이블 접미사 `_log`(로그)와 동음 → 신규는 LGC, 승계분 grandfathered(§6) | `tbl_lgc_nm`·`col_lgc_nm` |
| 39 | 물리 | Physics | PHYS | 공통표준 용어 '컬럼물리명' COL_PHYS_NM | ⚠ | 승계 컬럼 `dic_phy_nm` 의 `phy` 와 이음 → 신규는 PHYS, 승계분 grandfathered(§6) | `tbl_phys_nm`·`col_phys_nm` |
| 40 | 고유 | Unique | UNQ | 공통표준단어 | ✅ | 없음 | `unq_yn` |
| 41 | 정의 | Definition | DFN | 공통표준 형식단어(분류 '내용') | ✅ | 없음 | `index_dfn_txt` |
| 42 | 소수점 | Decimal Point | DCPT | 공통표준 용어 '소수점자릿수' DCPT_DGT | ⚠ | 없음 | `dcpt_len` |
| 43 | 영문 | English | ENG | 공통표준 용어 '공통코드영문명' COM_CD_ENG_NM | ✅ | 제안서 `en`·`ko` 대체. 국문명은 공통표준 관례대로 `_nm` 단독(공통코드명 COM_CD_NM) | `cd_val_eng_nm` |
| 44 | 그룹 | Group | GROUP | 공통표준 용어 '코드그룹명' CD_GROUP_NM | ⚠(5) | 개발 `std_dic` 에 GRP(그룹) 있으나 정본 §9 미수록·`sql/` 사용 0건이고, 공통표준에서 GRP 는 '단체' → **동음 회피로 GROUP 채택, 개발 GRP 폐기 권고**(§5 판정 4). 제안서 `set`(집합, 공통 미등재) 대체 | `cod_group`, `cd_group_*` |
| 45 | 주제 | Topic | TPC | 공통표준 용어 '주제영역명' TPC_RLM_NM | ✅ | 없음 — r5 에서 1단계 사용으로 앞당김(3단계 예약 해제) | `mdl_tbl.tpc_rlm_cd`, 3단계 `biz_tpc`(구 `biz_subj`) |
| 46 | 동의어 | Synonym | SYNM | 공통표준 용어 '동의어명' SYNM_NM | ⚠ | 3단계 | `std_synm`(구 `std_syn`) |
| 47 | 금칙어 | Prohibited Words | PHWRD | 공통표준 용어 '금칙어명' PHWRD_NM | ⚠(5) | 3단계. `ban` 대체 | `std_phwrd`(구 `std_ban`) |
| 48 | 프로그램 | Program | PRGRM | 공통표준단어 | ⚠(5) | 3단계 | `mdl_prgrm`·`mdl_prgrm_rfrnc`(구 `mdl_prg`·`mdl_prg_ref`) |
| 49 | 적용 | Application | APLCN | 공통표준단어(1차 2020-08) | ⚠ | 없음 — modeler r1 추가 요청(2026-10-14 승인) | `metric_impv_rcmnd.aplcn_dtm`(P42 전후 구간 경계) |
| 50 | 영역 | Realm | RLM | 공통표준 용어 '주제영역명' TPC_RLM_NM | ✅ | 없음 — r5 추가 | `tpc_rlm_cd`(주제영역코드) |
| 51 | 요청 | Demand | DMND | 공통표준 용어 '변경요청내용' CHG_DMND_CN | ⚠ | 없음. `RQST` 는 공통에서 '의뢰'로 등재돼 있어 요청에 쓰면 동음 → 미채택 — r5 추가 | `metric_impv_rcmnd.dmnd_cont` |
| 52 | 응답 | Response | RSPNS | 공통표준 용어 '응답내용' RSPNS_CN | ⚠(5) | 없음 — r5 추가 | `metric_impv_rcmnd.rspns_cont` |
| 53 | 종료 | End | END | 공통표준 용어 '유효종료일자' VLD_END_YMD | ✅ | 없음(SQL 예약어지만 단독 식별자로 쓰지 않음) — r5 추가 | `cod_val.vld_end_dt` |
| 54 | 접속 | Connection | CNTN | 공통표준단어 | ⚠ | '연결 LNKG'(이음동의어 링크)와 뜻 구분 — r5 추가 | `mdl_db.cntn_test_dtm`·`cntn_test_rslt_cd` |
| 55 | 시험 | Test | TEST | 공통표준단어(이음동의어 '테스트') | ⚠ | 없음. `TST` 는 공통 미등재 — r5 추가 | `cntn_test_*` |
| 56 | 오류 | Error | ERR | 공통 용어 '오류내용' ERR_CN | ✅ | 없음(공통 개정은 설명 수정뿐) — r5 추가 | `mdl_db.last_err_txt` |
| 57 | 예외 | Exception | EXCP | 공통표준 용어 '예외여부' EXCP_YN | ⚠ | 없음. `GF` 는 공통 미등재 — r5 추가 | `std_chck_rslt.excp_yn` |

> 3단계 접두사 `biz_` 의 단어 '사업 BIZ'(공통표준, Business)는 §3 에서 접두사와 함께 신청한다(공통 54(이번 묶음)에는 넣지 않음). 3단계 '용어집'(`glos`)은 기등재 '용어 `term`'으로 대체 → `biz_term`(구 `biz_glos`). 3단계 `biz_tag` 의 '태그'는 도메인 `tag` 와 같은 뜻이라 형식단어로 허용(원칙 5).

### 1-2. 기관 신규 축약 (6)

| # | 한글명 | 영문명 | 영문약어(확정안) | 근거 | 길이 | 충돌 검사 | 사용 컬럼·테이블 |
|---|---|---|---|---|---|---|---|
| 58 | 쿼리 | Query | QRY | 공통 미등재(쿼리·질의·질의어 없음) | ✅ | 공통 역충돌 없음 | `qry_uid`·`qry_txt`·`rcmnd_qry_txt`, `metric_qry_hist` |
| 59 | 행 | Row | ROW | 공통 미등재('레코드 RCRD'는 있으나 pg 관용어 rows) | ✅ | 공통 역충돌 없음. 튜플(`tup`) 대체 | `row_cnt`·`vld_row_cnt`·`invld_row_cnt` |
| 60 | 적중 | Hit | HIT | 공통 미등재 | ✅ | 공통 역충돌 없음 | `blck_hit_cnt` |
| 61 | 읽기 | Read | RD | 공통 미등재 | ✅ | 공통 역충돌 없음. 개발 `std_dic` 의 '조회 VW'와 뜻 다름(디스크 블록 읽기) | `blck_rd_cnt` |
| 62 | 스캔 | Scan | SCN | 공통 미등재 | ✅ | 공통 역충돌 없음 | `whol_scn_cnt`·`index_scn_cnt` |
| 63 | 배큠 | Vacuum | VCM | 공통 미등재. 공통 '정리 ARNGMT'는 뜻이 달라 미채택 | ✅ | 공통 역충돌 없음 | `last_vcm_dtm` |

### 1-3. 기존 등재 재사용 (신청 불필요)

`sys`·`tbl`·`col`·`cd`·`val`·`key`·`hist`·`chg`·`tp`·`sts`·`old`·`new`·`rsn`·`apv`·`term`·`dom`·`std`·`seq`·`desc`·`cont`·`txt`·`nm`·`sz`·`cnt`·`dtm`·`yn`·`id`·`use`(개발 `std_dic` 의 USE, 공통 USE 일치).
※ 이 중 `seq`·`apv`·`sys`·`std`·`dom`·`term`·`col`·`desc` 등 정본 §9 약어 다수가 개발 `std_dic` 에 **행으로 없다** — §5 판정 5.

### 1-4. 제안서 후보 토큰 처리 결과 (전량 처리)

| 처리 | 토큰 |
|---|---|
| 공통표준 채택 | `mdl` `clct` `chk→chck` `rslt` `rule→rul` `obj→objt` `exec→excn` `call→clot` `blk→blck` `mean→avg` `full→whol` `last` `risk` `rcmd→rcmnd` `efct` `msr→msrmt` `stat→stats` `reset→init` `idx→index` `schema→schm` `ver` `env` `site` `sort` `db` `ref→rfrnc` `syn→synm` `ban→phwrd` `subj→tpc` `prg→prgrm` `en→eng` `expct→expt` `biz` |
| 대체(신규 단어 없음) | `sevr`·`lvl`→`grd` · `tot`→`sum` · `tune`→`impv` · `live`→`vld` · `dead`→`invld` · `tup`→`row` · `bef`/`aft`→`old`/`new`(sql/176) · `glos`→`term` · `set`→`group` · `dbms`→`db`+`tp` · `ko`→(`_nm` 단독) · `sql`→`qry` |
| 기관 신규 | `qry` `row` `hit` `read→rd` `scan→scn` `vacuum→vcm` (`fk` 는 modeler r1 의 `pk_seq` 구조로 미사용 → 신청 철회) |
| 형식단어 허용 | `val`·`key`·`cd`(`cd_group_id`·`cd_val_*`) |
| 미사용 확정 | `dom`(웹 도메인 뜻) · `seq`(sequential 뜻) · `model` · `aprv` · `cod`(컬럼 토큰) · `ord`(순서 뜻) · `tup` · `dbms` · `prf`(공통 PRF=이익 동음 — 판정 2 로 `metric_` 재사용, 단어 '성능' 등재 불필요) |

## 2. 도메인 신청서

| 도메인 약어 | 의미 | 기본 타입 | 공통표준도메인 대조 | 사용 컬럼 | 판정 |
|---|---|---|---|---|---|
| `ms` | 밀리초(경과 시간) | NUMERIC(18,3) | **해당 없음** — 공통 '날짜/시간' 그룹은 시각 형식(`시분초C6`·`연월일시분초C14`·`연월일시분초D`)뿐이고 경과 시간 도메인이 없다. 수치는 '수량' 그룹 `수N22,6` 류 범용 → 기관 도메인 신설 | `sum_excn_ms`·`avg_excn_ms`·`old_avg_excn_ms`·`new_avg_excn_ms` | 신청(제안서 원안) |
| `len` | 길이(문자 수·자릿수) | INT | 공통 '길이 LEN'은 **형식단어**(분류 '수')로 등재 — 도메인 역할 근거. 공통 도메인은 `수N7` 등 범용 | `data_len`·`dcpt_len` | **신청(추가안)** — 승계 컬럼 `std_dic.data_len`·`std_dom.data_len` 도 소급 적법화 |

- 두 도메인 모두 공통표준 약어 역충돌 없음(`MS` 미등재, `LEN` = 길이 동일 뜻).
- 승인 시 **정본 §1-2 표 + Hook `DOMAIN_SUFFIXES` 동시 추가**(한쪽만 갱신 금지) + da-quality 전수조사 정규식 갱신.
- `ms` 는 pg `double precision` 을 받으므로 NUMERIC(18,3) 으로 반올림 저장(마이크로초 미만 버림).
- 수치 컬럼 타입 메모(modeler 전달) : `*_cnt` 중 pg 누적 카운터(`clot_cnt`·`row_cnt`·`blck_*_cnt`·`*_scn_cnt`·`*_row_cnt`)는 INT 상한을 넘을 수 있어 BIGINT. `qry_uid` 는 pg `queryid`(bigint, 음수 가능)라 `uid` 도메인 TEXT 로 저장.

## 3. 접두사 신청

| 접두사 | 정의 | 주제영역 | 공통표준 단어 대조 | 권고 |
|---|---|---|---|---|
| `mdl_` | 데이터 모델링 메타 | 대상 시스템·DB·설계 모델(논리·물리)·카탈로그 수집 이력·변경 이력 — 1단계 8테이블 | 모델 MDL 일치, 역충돌 없음 | **신설(DA 승인 대상)** — 정본 §2-1·Hook `PREFIX_RE`·README §3 동시 갱신 |
| `prf_` | 성능 메타 | (미채택) | 공통 PRF = '이익' 동음 | **미채택(판정 2)** — 대안 열로만 유지. 차선이던 `pfm_` 도 미채택 |
| `metric_`(기존) | 시스템 계측(모니터링) — DB 성능 통계·AI 개선 권고·효과 측정 | 2단계 6테이블 | 접두사 전용, 기존 등재 | **채택(판정 2)** — 정본 §2-1·Hook 기등재라 DA 승인·Hook 갱신 불필요. 범위는 테이블명 둘째 토큰(`clct`·`qry`·`tbl`·`index`·`impv`)과 COMMENT 로 드러낸다 |
| `biz_` | 사업(비즈니스) 메타 | 3단계 업무 용어집·주제영역·태그 | 사업 BIZ(공통) 일치 | **3단계 착수 시 신설, 지금은 보류**(수요 발생 시 설계 — 제안서 §4-3). 단어 '사업 BIZ'도 그때 등재 |
| `cod_`(기존) | 공통 코드 | `cod_group`·`cod_val` | — | 기존 예약 사용. 컬럼 토큰은 `cd`(원칙 5) |
| `std_`(기존) | 표준 데이터 | `std_chck_rslt` | — | 기존 사용 |

> 제안서 §4-2 의 `prf_` 신설 사유(`stat_` 은 서비스 지표, `metric_` 은 계측 일반)는 타당했으나, 공통표준 동음(PRF=이익)이 확인돼 판정 2 로 `metric_` 재사용이 확정됐다. 마스터 보고는 설계서 §10. 컬럼명 영향 0.

## 4. 테이블명·컬럼명 치환표 (17 테이블 — modeler 는 이 표를 그대로 DDL 에 쓴다)

> **r1 이후 컬럼 목록 정본 = `02_modeler_ddl.sql`.** modeler 의 구조 판단(PK 엔터티약어화 `tbl_hist_id`·`qry_stats_id` 등, `pk_yn`·`fk_yn`→`pk_seq`, `avg_excn_ms`·`std_chck_rslt.db_id/objt_*`·통계 `schm_nm` 제거, `term_id`·`apv_sts_cd`·`clct_id`·`aplcn_dtm`·`old/new_blck_rd_cnt` 추가)은 `02_standards_naming-review.md` 에서 명명 승인했다. 이 표는 단어 근거 대조용으로 남긴다.

**공통 꼬리 규칙** (각 표에 반복하지 않음)
- `_hist` **아닌** 테이블 : 업무 컬럼 뒤 `del_yn CHAR(1) NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y','N'))` · `del_dtm TIMESTAMPTZ` → 마지막 시스템 4컬럼.
- `_hist` 테이블 : 논리삭제 면제(Hook `LOG_TABLE_RE`), 시스템 4컬럼만.
- 시스템 4컬럼 : `regr_id TEXT NOT NULL DEFAULT 'ADMIN'` · `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` · `modr_id TEXT NOT NULL DEFAULT 'ADMIN'` · `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- PK 는 `<엔터티약어>_id` UUID `DEFAULT gen_random_uuid()`(§3-2·v2.4). 타입 칸은 도메인 기준 권장값이며 길이·제약은 modeler 가 확정.
- Y/N 컬럼은 전부 `CHAR(1) NOT NULL DEFAULT … CHECK (… IN ('Y','N'))`.

### 4-0. 테이블명

| 단계 | 최종 물리명 | 대안(미채택) | 제안서 임시명 | 변경 사유 |
|---|---|---|---|---|
| 1 | `cod_group` | — | `cod_set` | 집합(공통 미등재) → 그룹 GROUP(공통 '코드그룹명' CD_GROUP_NM) |
| 1 | `cod_val` | — | `cod_val` | 유지 |
| 1 | `mdl_sys` | — | `mdl_sys` | 유지 |
| 1 | `mdl_db` | — | `mdl_db` | 유지 |
| 1 | `mdl_tbl` | — | `mdl_tbl` | 유지 |
| 1 | `mdl_col` | — | `mdl_col` | 유지 |
| 1 | `mdl_tbl_hist` | — | `mdl_tbl_hist` | 유지 |
| 1 | `mdl_col_hist` | — | `mdl_col_hist` | 유지 |
| 1 | `mdl_index_hist` | — | `mdl_idx_hist` | 인덱스 INDEX(공통) |
| 1 | `mdl_chg_hist` | — | `mdl_chg_hist` | 유지 |
| 1 | `std_chck_rslt` | — | `std_chk_rslt` | 점검 CHCK(공통) |
| 2 | `metric_clct_hist` | `prf_clct_hist` | `prf_clct_hist` | 접두사만 `metric_`(판정 2) |
| 2 | `metric_qry_hist` | `prf_qry_hist` | `prf_qry_hist` | 접두사만 `metric_`(판정 2) |
| 2 | `metric_tbl_hist` | `prf_tbl_hist` | `prf_tbl_hist` | 접두사만 `metric_`(판정 2) |
| 2 | `metric_index_hist` | `prf_index_hist` | `prf_idx_hist` | 접두사 `metric_`(판정 2) + 인덱스 INDEX(공통) |
| 2 | `metric_impv_rcmnd` | `prf_impv_rcmnd` | `prf_tune_rcmd` | 접두사 `metric_`(판정 2) + 튜닝 → 개선 IMPV, 권고 RCMND(공통) |
| 2 | `metric_impv_rslt` | `prf_impv_rslt` | `prf_tune_rslt` | 접두사 `metric_`(판정 2) + 튜닝 → 개선 IMPV |
| 3 | `std_synm`·`std_phwrd`·`biz_term`·`biz_tpc`·`biz_tag`·`mdl_tbl_ver`·`mdl_prgrm`·`mdl_prgrm_rfrnc`·`sys_cfg` | — | `std_syn`·`std_ban`·`biz_glos`·`biz_subj`·`biz_tag`·`mdl_tbl_ver`·`mdl_prg`·`mdl_prg_ref`·`sys_cfg` | 3단계 — 이름만 예약, 컬럼은 수요 발생 시 |

### 4-1. `cod_group` — 코드 그룹

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `cd_group_id` | `cd_set_id` | UUID PK | 코드그룹ID | |
| `cd_group_cd` | `cd_set_cd` | VARCHAR(50) UNIQUE | 코드그룹코드 | 활성행 부분 UNIQUE(`WHERE del_yn='N'`) |
| `cd_group_nm` | `cd_set_nm` | VARCHAR(100) | 코드그룹명 | 공통 CD_GROUP_NM |
| `cd_group_desc` | (신규) | TEXT | 코드그룹설명 | |
| `use_yn` | (신규) | CHAR(1) CHECK | 사용여부 | 공통 '공통코드사용여부' |

### 4-2. `cod_val` — 코드 값

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `cd_val_id` | `cd_val_id` | UUID PK | 코드값ID | |
| `cd_group_id` | `cd_set_id` | UUID FK → `cod_group` | 코드그룹ID | |
| `cd_val_cd` | `cd_val_cd` | VARCHAR(50) | 코드값코드 | UNIQUE(`cd_group_id`,`cd_val_cd`) 활성행 |
| `cd_val_nm` | `cd_val_ko_nm` | VARCHAR(100) | 코드값명 | 국문명 = `_nm` 단독(공통 관례) |
| `cd_val_eng_nm` | `cd_val_en_nm` | VARCHAR(100) | 코드값영문명 | |
| `cd_val_desc` | (신규) | TEXT | 코드값설명 | |
| `sort_seq` | `sort_seq` | INT | 정렬순서 | 공통 SORT_SEQ |
| `use_yn` | (신규) | CHAR(1) CHECK | 사용여부 | |

### 4-3. `mdl_sys` — 대상 시스템

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `sys_id` | `sys_id` | UUID PK | 시스템ID | |
| `sys_nm` | `sys_nm` | VARCHAR(100) | 시스템명 | 공통 SYS_NM |
| `site_nm` | `site_nm` | VARCHAR(100) | 사이트명 | sites.json 도메인 문자열(예 `cafe.pi`), 공통 SITE_NM |
| `sys_desc` | (신규) | TEXT | 시스템설명 | |
| `use_yn` | (신규) | CHAR(1) CHECK | 사용여부 | 수집 대상 여부 |

### 4-4. `mdl_db` — DB·스키마

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `db_id` | `db_id` | UUID PK | 데이터베이스ID | |
| `sys_id` | `sys_id` | UUID FK → `mdl_sys` | 시스템ID | |
| `db_tp_cd` | `dbms_cd` | VARCHAR(20) | 데이터베이스유형코드 | 'PG' 고정 — `dbms` 신규 단어 불필요 |
| `env_cd` | (신규) | VARCHAR(20) | 환경코드 | DEV·STG·PROD(`schema_dev`·`schema_stg`·`prod/schema` 구분) |
| `schm_nm` | `schema_nm` | VARCHAR(63) | 스키마명 | pg 식별자 상한 63 |
| `env_key_nm` | `env_key_nm` | VARCHAR(100) | 환경키명 | env 이름만(`META_DB_<SITE>`), 비밀값 금지 |
| `db_desc` | (신규) | TEXT | 데이터베이스설명 | |
| `use_yn` | (신규) | CHAR(1) CHECK | 사용여부 | |

### 4-5. `mdl_tbl` — 설계 모델 테이블

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `tbl_id` | (PK 미기재) | UUID PK | 테이블ID | |
| `db_id` | (FK 미기재) | UUID FK → `mdl_db` | 데이터베이스ID | |
| `schm_nm` | (신규) | VARCHAR(63) | 스키마명 | |
| `tbl_phys_nm` | (물리명) | VARCHAR(63) | 테이블물리명 | 공통 TBL_PHYS_NM. UNIQUE(`db_id`,`schm_nm`,`tbl_phys_nm`) 활성행 |
| `tbl_lgc_nm` | (논리명) | VARCHAR(200) | 테이블논리명 | |
| `tbl_desc` | (신규) | TEXT | 테이블설명 | COMMENT 원천 |

### 4-6. `mdl_col` — 설계 모델 컬럼

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `col_id` | (PK 미기재) | UUID PK | 컬럼ID | |
| `tbl_id` | (FK 미기재) | UUID FK → `mdl_tbl` | 테이블ID | |
| `col_seq` | (신규) | INT | 컬럼순번 | pg `attnum` |
| `col_phys_nm` | (물리명) | VARCHAR(63) | 컬럼물리명 | 공통 COL_PHYS_NM |
| `col_lgc_nm` | (논리명) | VARCHAR(200) | 컬럼논리명 | 공통 COL_LGC_NM |
| `term_id` | (표준용어 FK) | `std_term.term_id` 타입 FK | 용어ID | NULL = 표준용어 미매핑(점검 대상) |
| `dom_id` | (도메인) | `std_dom.dom_id` 타입 FK | 도메인ID | |
| `data_tp_nm` | (도메인) | VARCHAR(50) | 자료유형명 | 예 `TIMESTAMPTZ` |
| `data_len` | (신규) | INT (`len`) | 자료길이 | 신규 도메인 `len` |
| `dcpt_len` | (신규) | INT (`len`) | 소수점길이 | NUMERIC scale |
| `nul_prm_yn` | (NULL) | CHAR(1) CHECK | 널허용여부 | 공통 NUL_PRM_YN |
| `pk_yn` | (PK) | CHAR(1) CHECK | 기본키여부 | 공통 PK_YN |
| `fk_yn` | (FK) | CHAR(1) CHECK | 외래키여부 | 기관 신규 FK |
| `rfrnc_tbl_nm` | (FK 대상) | VARCHAR(63) | 참조테이블명 | `fk_yn='Y'` 일 때 |
| `rfrnc_col_nm` | (FK 대상) | VARCHAR(63) | 참조컬럼명 | 공통 RFRNC_COL_NM |
| `bsc_val_txt` | (기본값) | TEXT | 기본값텍스트 | `default`·`dflt` 금칙 |
| `col_desc` | (신규) | TEXT | 컬럼설명 | |

### 4-7. `mdl_tbl_hist` — 테이블 카탈로그 수집 이력

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | `hist_id` | UUID PK | 이력ID | |
| `db_id` | `db_id` | UUID FK → `mdl_db` | 데이터베이스ID | |
| `clct_dtm` | `clct_dtm` | TIMESTAMPTZ | 수집일시 | 공통 CLCT_DT |
| `schm_nm` | (카탈로그 원본) | VARCHAR(63) | 스키마명 | |
| `tbl_nm` | (카탈로그 원본) | VARCHAR(63) | 테이블명 | 카탈로그 값은 물리명뿐이라 `_phys_` 생략(이력·통계 테이블 공통) |
| `tbl_desc` | (카탈로그 원본) | TEXT | 테이블설명 | `obj_description` |

### 4-8. `mdl_col_hist` — 컬럼 카탈로그 수집 이력

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | `hist_id` | UUID PK | 이력ID | |
| `db_id` | `db_id` | UUID FK | 데이터베이스ID | |
| `clct_dtm` | `clct_dtm` | TIMESTAMPTZ | 수집일시 | |
| `schm_nm` | (원본) | VARCHAR(63) | 스키마명 | |
| `tbl_nm` | (원본) | VARCHAR(63) | 테이블명 | |
| `col_seq` | (원본) | INT | 컬럼순번 | |
| `col_nm` | (원본) | VARCHAR(63) | 컬럼명 | 공통 COL_NM |
| `data_tp_nm` | (원본) | VARCHAR(50) | 자료유형명 | |
| `data_len` | (원본) | INT (`len`) | 자료길이 | |
| `dcpt_len` | (원본) | INT (`len`) | 소수점길이 | |
| `nul_prm_yn` | (원본) | CHAR(1) CHECK | 널허용여부 | |
| `bsc_val_txt` | (원본) | TEXT | 기본값텍스트 | |
| `col_desc` | (원본) | TEXT | 컬럼설명 | |

### 4-9. `mdl_index_hist` — 인덱스 카탈로그 수집 이력

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | `hist_id` | UUID PK | 이력ID | |
| `db_id` | `db_id` | UUID FK | 데이터베이스ID | |
| `clct_dtm` | `clct_dtm` | TIMESTAMPTZ | 수집일시 | |
| `schm_nm` | (원본) | VARCHAR(63) | 스키마명 | |
| `tbl_nm` | (원본) | VARCHAR(63) | 테이블명 | |
| `index_nm` | (`idx_nm`) | VARCHAR(63) | 인덱스명 | 공통 INDEX_NM |
| `unq_yn` | (원본) | CHAR(1) CHECK | 고유여부 | |
| `pk_yn` | (원본) | CHAR(1) CHECK | 기본키여부 | |
| `index_dfn_txt` | (원본) | TEXT | 인덱스정의텍스트 | `pg_get_indexdef` |

### 4-10. `mdl_chg_hist` — 수집 시점 간 변경

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | `hist_id` | UUID PK | 이력ID | |
| `db_id` | `db_id` | UUID FK | 데이터베이스ID | |
| `clct_dtm` | `clct_dtm` | TIMESTAMPTZ | 수집일시 | 이번 수집 |
| `old_clct_dtm` | (신규) | TIMESTAMPTZ | 전수집일시 | 비교 기준 수집 |
| `objt_tp_cd` | (신규) | VARCHAR(20) | 객체유형코드 | TBL·COL·INDEX |
| `objt_nm` | (신규) | VARCHAR(200) | 객체명 | `schm.tbl[.col]` |
| `chg_tp_cd` | `chg_tp_cd` | VARCHAR(20) | 변경유형코드 | ADD·DROP·ALTER |
| `old_val` | (전 값) | JSONB (`val`) | 전값 | sql/176 패턴, ADD 면 NULL |
| `new_val` | (후 값) | JSONB (`val`) | 후값 | DROP 이면 NULL |

### 4-11. `std_chck_rslt` — 표준 점검 결과

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `chck_rslt_id` | (PK 미기재) | UUID PK | 점검결과ID | |
| `db_id` | (신규) | UUID FK → `mdl_db` (NULL 허용) | 데이터베이스ID | DDL 파일 점검이면 NULL |
| `rul_cd` | `rule_cd` | VARCHAR(10) | 규칙코드 | R1~R8 |
| `chck_grd_cd` | `sevr_cd` | VARCHAR(10) | 점검등급코드 | P1~P3(품질점검기준서) |
| `objt_tp_cd` | (신규) | VARCHAR(20) | 객체유형코드 | TBL·COL·INDEX·FILE |
| `objt_nm` | `obj_nm` | VARCHAR(200) | 객체명 | |
| `chck_rslt_cont` | (신규) | TEXT | 점검결과내용 | 위반 내용·권장값, 공통 CHCK_RSLT_CN |
| `chck_dtm` | `chk_dtm` | TIMESTAMPTZ | 점검일시 | 공통 CHCK_DT |

### 4-12. `metric_clct_hist` — 성능 수집 시점

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `clct_id` | `clct_id` | UUID PK | 수집ID | |
| `db_id` | `db_id` | UUID FK → `mdl_db` | 데이터베이스ID | |
| `clct_dtm` | `clct_dtm` | TIMESTAMPTZ | 수집일시 | |
| `stats_init_dtm` | `stat_reset_dtm` | TIMESTAMPTZ | 통계초기화일시 | `pg_stat_statements` reset 시점 — 증분 환산 기준 |
| `db_ver_nm` | (신규) | VARCHAR(50) | 데이터베이스버전명 | GENERIC_PLAN 가능 여부 판단(제안서 §6 선행 ②). 공통 VER_NO 는 문자형이나 기관 `no` 도메인이 INT 라 `_nm` |

### 4-13. `metric_qry_hist` — 쿼리 통계

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | (PK 미기재) | UUID PK | 이력ID | |
| `clct_id` | `clct_id` | UUID FK → `metric_clct_hist` | 수집ID | |
| `qry_uid` | `qry_id` | TEXT (`uid`) | 쿼리외부식별자 | pg `queryid`(bigint) 문자열 — 외부 발급값이라 `_uid`(§8, r1 판정 5) |
| `qry_txt` | `qry_txt` | TEXT | 쿼리텍스트 | 정규화 + 상수 마스킹 |
| `clot_cnt` | `call_cnt` | BIGINT | 호출건수 | 공통 CLOT_CNT |
| `sum_excn_ms` | `tot_exec_ms` | NUMERIC(18,3) (`ms`) | 합계실행밀리초 | |
| `avg_excn_ms` | `mean_exec_ms` | NUMERIC(18,3) (`ms`) | 평균실행밀리초 | |
| `row_cnt` | `row_cnt` | BIGINT | 행건수 | |
| `blck_hit_cnt` | `blk_hit_cnt` | BIGINT | 블록적중건수 | shared_blks_hit |
| `blck_rd_cnt` | `blk_read_cnt` | BIGINT | 블록읽기건수 | shared_blks_read |

### 4-14. `metric_tbl_hist` — 테이블 통계·크기

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | (PK 미기재) | UUID PK | 이력ID | |
| `clct_id` | `clct_id` | UUID FK | 수집ID | |
| `schm_nm` | (신규) | VARCHAR(63) | 스키마명 | public 외 스키마 구분 |
| `tbl_nm` | `tbl_nm` | VARCHAR(63) | 테이블명 | |
| `whol_scn_cnt` | `full_scan_cnt` | BIGINT | 전체스캔건수 | pg `seq_scan` |
| `index_scn_cnt` | `idx_scan_cnt` | BIGINT | 인덱스스캔건수 | |
| `vld_row_cnt` | `live_tup_cnt` | BIGINT | 유효행건수 | `n_live_tup` |
| `invld_row_cnt` | `dead_tup_cnt` | BIGINT | 무효행건수 | `n_dead_tup` |
| `tbl_sz` | `tbl_sz` | BIGINT (`sz`) | 테이블크기 | 바이트 |
| `index_sz` | `idx_sz` | BIGINT (`sz`) | 인덱스크기 | |
| `last_vcm_dtm` | `last_vacuum_dtm` | TIMESTAMPTZ | 최종배큠일시 | `greatest(last_vacuum, last_autovacuum)` |

### 4-15. `metric_index_hist` — 인덱스 통계

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `hist_id` | (PK 미기재) | UUID PK | 이력ID | |
| `clct_id` | `clct_id` | UUID FK | 수집ID | |
| `schm_nm` | (신규) | VARCHAR(63) | 스키마명 | |
| `index_nm` | `idx_nm` | VARCHAR(63) | 인덱스명 | |
| `tbl_nm` | `tbl_nm` | VARCHAR(63) | 테이블명 | |
| `index_scn_cnt` | `idx_scan_cnt` | BIGINT | 인덱스스캔건수 | 0 = 미사용 인덱스 후보 |
| `index_sz` | `idx_sz` | BIGINT (`sz`) | 인덱스크기 | |

### 4-16. `metric_impv_rcmnd` — AI 개선 권고 (구 `prf_tune_rcmd`)

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `rcmnd_id` | `rcmd_id` | UUID PK | 권고ID | |
| `db_id` | `db_id` | UUID FK → `mdl_db` | 데이터베이스ID | |
| `qry_uid` | `qry_id` | TEXT (`uid`) | 쿼리외부식별자 | 쿼리 무관 권고(VACUUM 등)면 NULL |
| `rcmnd_tp_cd` | `rcmd_tp_cd` | VARCHAR(20) | 권고유형코드 | 값 INDEX·REWRITE·VACUUM·PARTITION(코드값은 명명 대상 아님) |
| `rcmnd_rsn_cont` | `rcmd_rsn_cont` | TEXT | 권고사유내용 | |
| `rcmnd_qry_txt` | `rcmd_sql_txt` | TEXT | 권고쿼리텍스트 | DDL·재작성 SQL 초안 — `sql` 단어 대신 `qry` |
| `expt_efct_cont` | `expct_efct_cont` | TEXT | 기대효과내용 | 공통 EXPT_EFCT_CN |
| `risk_grd_cd` | `risk_lvl_cd` | VARCHAR(10) | 위험등급코드 | 공통 RISK_GRD 계열 |
| `mdl_nm` | `mdl_nm` | VARCHAR(100) | 모델명 | AI 모델명, 공통 MDL_NM |
| `rcmnd_sts_cd` | `sts_cd` | VARCHAR(20) | 권고상태코드 | DRAFT·REVIEW·APPROVED·APPLIED·REJECTED |
| `apv_id` | `apv_id` | TEXT FK → `approval_queue.apv_id` | 승인ID | 승계 `apv_id TEXT` 에 맞춤(grandfathered, §6) |

### 4-17. `metric_impv_rslt` — 효과 측정 (구 `prf_tune_rslt`)

| 최종 물리명 | 제안서 임시명 | 권장 타입 | 한글 용어명 | 비고 |
|---|---|---|---|---|
| `impv_rslt_id` | `rslt_id` | UUID PK | 개선결과ID | 엔터티약어 PK(§3-2) |
| `rcmnd_id` | `rcmd_id` | UUID FK → `metric_impv_rcmnd` | 권고ID | |
| `old_avg_excn_ms` | `bef_mean_ms` | NUMERIC(18,3) (`ms`) | 전평균실행밀리초 | `bef` → 기등재 `old`(이음동의 회피) |
| `new_avg_excn_ms` | `aft_mean_ms` | NUMERIC(18,3) (`ms`) | 후평균실행밀리초 | `aft` → 기등재 `new` |
| `old_clot_cnt` | `bef_call_cnt` | BIGINT | 전호출건수 | |
| `new_clot_cnt` | `aft_call_cnt` | BIGINT | 후호출건수 | |
| `msrmt_dtm` | `msr_dtm` | TIMESTAMPTZ | 측정일시 | 공통 MSRMT_DT |

## 5. 리더 판정 결과 (2026-10-14 회신 반영)

| # | 쟁점 | 판정 | 반영 |
|---|---|---|---|
| 1 | 공통표준 약어 4자 이상 28건 vs §1-1 자음 2~3자 | **A안** — 공통표준 등재분은 길이 무관 그대로(01 2장이 §1-1 보다 상위) | §1 머리 예외 1문장. 기관 축약 대안(`clct→clc` 등)은 폐기 |
| 2 | `prf_` 가 공통 PRF(이익)와 동음 | **`metric_` 재사용** — 기존 등재라 DA 승인 불필요 | §3·§4 의 `prf_*` 6테이블을 `metric_*` 로 치환, `prf_` 는 §4-0 대안(미채택) 열로만. 단어 '성능 PRF' 신청 철회. 마스터 보고는 설계서 §10 |
| 3 | 신규 도메인 `len` | **승인** | §2 유지 |
| 4 | 개발 std_dic GRP(그룹) | **폐기, GROUP 채택** | `cod_group`·`cd_group_*` 유지 |
| 5 | 정본 ↔ 개발 std_dic 드리프트 | **별도 잡** — 설계서 §10 후속 과제로만 | 본 신청서 범위 밖. 내역 : §9 약어 다수 미등재, OD↔ORD·RGST↔REGR·CAT↔CTGR 이음동의, TP '종류'·TYP '유형', MOD·MODR '수정', LVL 단어·도메인 중복, 운영 미검증 |
| 6 | 3단계 단어 등재 시점 | **3단계 착수 시 등재** | 이번 묶음 = 공통 54 + 기관 6 = 60(r5 반영 — 주제 TPC 는 1단계 사용으로 앞당김). 동의어·금칙어·프로그램·사업 4개는 예약만 |

## 6. 승계 객체 명명 점검 (grandfathered — 재정의 금지, 점검만)

| 객체 | 컬럼 | 위반 유형 | 권장값(소급 시) |
|---|---|---|---|
| `std_dic` | `dic_log_nm`·`dic_phy_nm`·`dic_phy_fll_nm` | `log`(접미사 `_log` 동음)·`phy`(PHYS 이음)·`fll` 미등재 | `dic_lgc_nm`·`dic_phys_nm`·`dic_eng_nm` |
| `std_dic` | `dic_gbn_cd` | `gbn` 미등재(공통 구분 = SE) | `dic_se_cd` |
| `std_dic` | `ent_clss_yn`·`attr_clss_yn` | `ent`·`attr`·`clss` 미등재(공통 ENTTY·ATRB) | 등재 후 판단 |
| `std_dic` | `data_type`·`data_scale`·`data_len` | 도메인 미종결(R7)·`type` 은 `tp` 이음 | `data_tp_cd`·`dcpt_len`·`data_len`(`len` 승인 시 적법) |
| `std_dic` | `stored_term_comp_ids` | 도메인 미종결·복수형·미등재 단어 | 설계 재검토 |
| `std_dic`·`std_dom`·`std_term` | `apv_status`·`synced_at` | 도메인 미종결(`status`→`sts`, `_at`→`_dtm`) | `apv_sts_cd`·`sync_dtm` |
| `std_dic`·`std_dom`·`std_term` | (없음) | `del_dtm` 누락 | `del_dtm TIMESTAMPTZ` 추가 |
| `std_dom` | `key_dom_nm`·`key_dom_phy_nm`·`dom_type_cd`·`data_type_cd`·`data_len`·`data_scale` | `phy` 이음·`type` 이음·도메인 미종결 | `key_dom_phys_nm`·`dom_tp_cd`·`data_tp_cd`·`dcpt_len` |
| `std_term` | `term_log_nm`·`term_phy_nm`·`term_phy_fll_nm` | `std_dic` 와 동일 | 동일 |
| `std_audit_log` | `tgt_tbl`·`action_cd` | 도메인 미종결·`action` 은 `actn`(sql/176) 이음 | `tgt_tbl_nm`·`actn_cd` |
| `std_audit_log` | (없음) | 시스템 4컬럼 없음(개발 DB 조회 8컬럼) | 소급 추가 |
| `approval_queue` | 테이블명 | 접두사 `approval_`(Hook 만 허용, 정본 §2-1 미수록)·`apv` 와 이음 | 소급 검토 |
| `approval_queue` | `apv_status`·`entity_type`·`entity_id`·`apv_id TEXT` | 도메인 미종결·`entity`(공통 ENTTY) 미등재·`type` 이음·UUID 를 TEXT 로 보관 | `apv_sts_cd`·`entty_tp_cd`·`entty_id` |

- 점검 컬럼 수(승계) : **원천 72**(std_dic 21 · std_dom 16 · std_term 12 · approval_queue 15 · std_audit_log 8), 이관 후 81 — modeler 의 PostgREST OpenAPI 조회(개발 DB, 운영 미확인) 기준으로 정정했다(초판 64 는 개발 DB 키 조회라 approval_queue 를 5컬럼만 셌다).
- 소급 계획은 da-migration 몫이다. METAPI 이관 때 개명하면 cafe.pi `/admin/std` API 가 깨지므로 P29 조회 API 전환(00_input 결정 요청)과 묶어야 한다.

## 7. 치환표 기계 검증 · 집계

검증 방법 : §4-1~4-17 의 최종 물리명을 `_` 로 나눠 ① 마지막 토큰이 도메인(Hook `DOMAIN_SUFFIXES` + 신청 `ms`·`len`)인지 ② 모든 토큰이 §1 신청 단어·§1-3 기존 등재·도메인에 있는지 ③ 토큰이 2개 이상인지(R8) 검사했다.

결과 : **위반 0건**(도메인 미종결 0·미등재 토큰 0·R8 0). 판정 반영(`prf_`→`metric_`) 뒤 2026-10-14 재실행 결과다. 검증 스크립트는 잡 밖 스크래치(`chk.py`)에 있다.

| 구분 | 테이블 | 업무 컬럼 | 공통 꼬리 | 전체 |
|---|---|---|---|---|
| 1단계 | 11(`_hist` 4 포함) | 94 | 7×6 + 4×4 = 58 | 152 |
| 2단계 | 6(`_hist` 4 포함) | 51 | 2×6 + 4×4 = 28 | 79 |
| **신규 계** | **17** | **145** | **86** | **231** |
| 승계(§6) | 5 | — | — | 원천 72 · 이관 후 81 |

> 위 231 은 치환표 기준이다. DDL r1 기준 정본 집계는 **신규 226(1단계 147·2단계 79) + 승계 이관 후 81 = 307** 이다(`02_standards_naming-review.md` §3).

## 부록 A. 등재 SQL 초안 (승인 후 `sql/` 별도 파일로 옮긴다 — 이 파일은 `sql/` 아님)

sql/176 형식을 따른다. 판정 1·2·4·6 결과에 따라 행을 조정한다.

```sql
-- DA-APPROVED: (승인 후 기재) — METAPI 표준단어·도메인 등재
INSERT INTO public.std_dic (dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, apv_status, regr_id)
SELECT gen_random_uuid(), v.log_nm, v.phy_nm, v.fll_nm, v.dsc, '0001', 'APPROVED', 'ADMIN'
FROM (VALUES
  ('모델','MDL','model','공통표준'),('수집','CLCT','collection','공통표준'),('점검','CHCK','check','공통표준'),
  ('결과','RSLT','result','공통표준'),('규칙','RUL','rule','공통표준'),('등급','GRD','grade','공통표준 형식단어'),
  ('객체','OBJT','object','공통표준'),('실행','EXCN','execution','공통표준'),('호출','CLOT','call out','공통표준'),
  ('블록','BLCK','block','공통표준'),('합계','SUM','sum','공통표준'),('평균','AVG','average','공통표준'),
  ('유효','VLD','validity','공통표준'),('무효','INVLD','invalidity','공통표준'),('전체','WHOL','whole','공통표준'),
  ('최종','LAST','last','공통표준'),('위험','RISK','risk','공통표준'),('개선','IMPV','improvement','공통표준'),
  ('권고','RCMND','recommendation','공통표준'),('기대','EXPT','expectation','공통표준'),('효과','EFCT','effect','공통표준'),
  ('측정','MSRMT','measurement','공통표준'),('통계','STATS','statistics','공통표준'),('초기화','INIT','initialization','공통표준'),
  ('인덱스','INDEX','index','공통표준'),('스키마','SCHM','schema','공통표준'),('버전','VER','version','공통표준'),
  ('환경','ENV','environment','공통표준'),('사이트','SITE','site','공통표준'),('정렬','SORT','sort','공통표준'),
  ('데이터베이스','DB','database','공통표준'),('자료','DATA','data','공통표준(이음동의어 데이터)'),('참조','RFRNC','reference','공통표준'),
  ('기본키','PK','primary key','공통표준'),('널','NUL','null','공통표준'),('허용','PRM','permit','공통표준'),
  ('기본','BSC','basic','공통표준(금칙어 디폴트)'),('논리','LGC','logic','공통표준'),('물리','PHYS','physics','공통표준'),
  ('고유','UNQ','unique','공통표준'),('정의','DFN','definition','공통표준 형식단어'),('소수점','DCPT','decimal point','공통표준'),
  ('영문','ENG','english','공통표준'),('그룹','GROUP','group','공통표준 — 개발 GRP 폐기(판정 4)'),
  ('쿼리','QRY','query','기관 신규'),('행','ROW','row','기관 신규'),
  ('적중','HIT','hit','기관 신규'),('읽기','RD','read','기관 신규'),('스캔','SCN','scan','기관 신규'),
  ('배큠','VCM','vacuum','기관 신규(PostgreSQL VACUUM)'),('적용','APLCN','application','공통표준'),
  ('주제','TPC','topic','공통표준'),('영역','RLM','realm','공통표준'),('요청','DMND','demand','공통표준'),
  ('응답','RSPNS','response','공통표준'),('종료','END','end','공통표준'),('접속','CNTN','connection','공통표준'),
  ('시험','TEST','test','공통표준(이음동의어 테스트)'),('오류','ERR','error','공통표준'),('예외','EXCP','exception','공통표준')
) AS v(log_nm, phy_nm, fll_nm, dsc)
WHERE NOT EXISTS (SELECT 1 FROM public.std_dic d WHERE d.dic_phy_nm = v.phy_nm AND d.del_yn = 'N');

INSERT INTO public.std_dom (dom_id, dom_nm, key_dom_nm, key_dom_phy_nm, dom_type_cd, data_type_cd, data_len, data_scale, dom_desc, regr_id)
SELECT gen_random_uuid(), v.dom_nm, v.key_nm, v.key_phy, '0003', '0003', v.len, v.scl, v.dsc, 'ADMIN'
FROM (VALUES
  ('밀리초','밀리초','MS', 18, 3, '경과 시간(밀리초) — 기본 타입 NUMERIC(18,3)'),
  ('길이','길이','LEN', NULL::INT, NULL::INT, '문자 길이·자릿수 — 기본 타입 INT')
) AS v(dom_nm, key_nm, key_phy, len, scl, dsc)
WHERE NOT EXISTS (SELECT 1 FROM public.std_dom d WHERE d.key_dom_phy_nm = v.key_phy AND d.del_yn = 'N');
-- 3단계 단어(동의어 SYNM·금칙어 PHWRD·프로그램 PRGRM·사업 BIZ — 주제 TPC 는 r5 에서 1단계로 앞당김)는 판정 6 에 따라 3단계 착수 때 등재
-- 동시 갱신 : 정본 §1-2·§2-1·§9 + Hook DOMAIN_SUFFIXES(ms·len)·PREFIX_RE(mdl_ 와 판정 2 결과) + README §3
-- 개발 GRP(그룹) 폐기는 판정 4 승인 후 da-migration 이 논리삭제 SQL 로 작성(std_dic 은 del_dtm 결손 — §6)
```
