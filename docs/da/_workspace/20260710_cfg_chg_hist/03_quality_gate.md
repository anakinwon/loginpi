# 03. 품질 게이트 판정 — 운영 설정 변경 감사 이력 (sys_cfg_chg_hist)

- **판정**: DA 품질담당 (da-quality)
- **판정일**: 2026-07-10
- **대상**: `01_modeler_ddl.sql` · `01_modeler_model.md` · `02_migration_plan.md` · `02_standards_naming-review.md`(참고)
- **기준**: `docs/da/품질점검기준서.md`(v1.0) §3 P1/P2/P3 · `docs/da/데이터표준규칙.md`(v2.1)
- **원천 대조**: `sql/140_fee_mode_config.sql`(fee_mode_audit) · `sql/149_promo_fee_config.sql`(promo_fee_audit) · `.claude/hooks/da-ddl-guard.mjs`
- **DB 검증 범위**: 대상 테이블 `sys_cfg_chg_hist`는 미생성 초안(실 DB 없음) → 원천 audit 적재 건수·`std_dic` 등재 상태는 **DB 미검증**(파일·선례 기준 판정). 검증 쿼리 논리 타당성만 검토.

---

## 최종 판정: ✅ PASS (P2 조건부)

- **P1 Critical 위반: 0건** — Hook 차단 대상 전 항목 통과. DDL 그대로 물리 적용 가능.
- **P2 Major: 2건**(조건부 — 확정 전 해소 권고, 비차단).
- **P3 Minor: 4건**(개선 권고).
- **경계면 교차 비교 4종 전량 정합** — DDL↔백필 컬럼, 헬퍼 시그니처↔RPC 호출, 멱등 가드↔인덱스, 원천 실컬럼↔백필 SELECT 모두 일치.

DDL 자체는 **P1 클린 + 표준용어 형식 전 컬럼 적합**하여 확정·적용에 결격이 없다. P2 2건은 (a) 표준담당·리더 소관으로 이미 상신된 `val` 도메인 등재 잔여분, (b) append-only audit 관례와 정본 §6의 형식 충돌로, **DDL 재작성 없이** 리더 등재·정본 명문화·이행 SQL 1줄 보정으로 해소된다. P1 부재이므로 차단하지 않는다.

---

## 위반·지적 목록

| # | 위반/지적 항목 | 등급 | 근거 조항 | 수정 권고 |
|---|---|---|---|---|
| Q1 | `old_val`·`new_val` 종결 도메인 `val` 미등록 (R7 경고 2건) | **P2** | 정본 §1-3(표준도메인 종결) · 품질기준서 §3 P2("표준도메인 약어로 끝나는가") | `val` 표준도메인(JSONB) 등재 + Hook `DOMAIN_SUFFIXES`에 `'val'` 추가 + 정본 §1-2 동기화. **리더 소관**(표준담당 §6 상신분). 등재 시 경고 0 완전 준수 |
| Q2 | `mod_dtm` 자동 갱신 트리거 부재 + 이행 롤백 UPDATE가 `mod_dtm`·`modr_id` 미설정 | **P2** | 정본 §6(트리거 필수) ↔ §4-3(_hist append-only) 형식 충돌 · §4-1(논리삭제 UPDATE는 `mod_dtm`·`modr_id` 동반) | 관례(선례 5종 전부 트리거 부재)와 정합하므로 **정본 §6에 `_hist`/`_audit` append-only 예외 명문화**(R6 del_yn 예외 방식 준용) 권고. **단, 트리거가 없으므로** 이행계획 §7.3 롤백 UPDATE에 `mod_dtm=CURRENT_TIMESTAMP, modr_id='MIGRATION'` 추가 필수 |
| Q3 | 인덱스명이 테이블명 축약형(`idx_sys_cfg_chg_*`, `_hist` 생략) | **P3** | 정본 §5(`idx_<테이블명>_<컬럼명>`) · 선례 sql/140·149는 전체 테이블명 사용 | 기능 무해·유일성 확보됨. 선례 정합 위해 `idx_sys_cfg_chg_hist_*` 권고(확정 시 리더 판단) |
| Q4 | 이행 매핑표(§1) `del_yn ← del_yn 소스 승계` ↔ 실제 백필 SQL(§5) `del_yn` INSERT 미포함(DEFAULT 'N' + `WHERE del_yn='N'` 필터) 서술 불일치 | **P3** | 품질기준서 §3(메타/문서 정합) | 결과 동일(활성행만 백필→전부 'N'). 매핑표 문구를 "활성행만 대상, DEFAULT 'N' 적용"으로 정정 |
| Q5 | 멱등 가드 주석은 5컬럼(`+chg_actn_cd`) 표기 ↔ 실제 SQL은 4컬럼(`cfg_tbl_nm·cfg_tgt_id·chg_dtm·chgr_id`) | **P3** | 이행계획 §5 주석-SQL 정합 | 4컬럼으로 멱등 충분(chg_actn_cd는 소스 종속 파생). 주석을 4컬럼으로 정정 or `src_audit_id` provenance 컬럼 채택 |
| Q6 | JSONB 내부 키 규약(원천 컬럼명 그대로) 미명문화 + R2 이중기록 키 일치 미검증(개념 서술만) | **P3** | 모델 §6·§7(품질 점검 요청 항목) | 키 규약을 "원천 업무 컬럼명 그대로"로 정본/이행에 명문화. R2 dual-write가 백필과 **동일 키**(`promo_active_yn·promo_start_dtm·promo_end_dtm`) 사용하도록 구현 시 강제 |

---

## 경계면 교차 비교 (핵심 — 지시 항목 2)

### ① DDL 컬럼 목록 ↔ 백필 INSERT 컬럼 목록 — ✅ 정합
- DDL 15컬럼: `hist_id·cfg_tbl_nm·cfg_tgt_id·chg_actn_cd·old_val·new_val·chg_rsn_cont·chgr_id·chg_dtm·del_yn·del_dtm·regr_id·reg_dtm·modr_id·mod_dtm`.
- 백필 INSERT 타깃 10컬럼(§5.1·§5.2 동일): `cfg_tbl_nm·cfg_tgt_id·chg_actn_cd·old_val·new_val·chg_rsn_cont·chgr_id·chg_dtm·regr_id·modr_id` — **전량 DDL에 실재**.
- 생략 컬럼 처리 정당: `hist_id`(gen_random_uuid), `del_yn`(DEFAULT 'N'), `del_dtm`(NULL, 활성만 백필), `reg_dtm`·`mod_dtm`(DEFAULT=백필 실행시각). `chg_dtm`은 원 `changed_at` 명시 주입으로 이벤트 시각 보존(감사 충실성) — 적절.
- ⚠️ 단 매핑표(§1) 문구와 SQL(§5) 불일치 1건 → **Q4(P3)**.

### ② 헬퍼 `fn_log_cfg_change` 시그니처 ↔ RPC 이중기록 호출 — ✅ 정합
- DDL 시그니처(7파라미터): `(p_cfg_tbl_nm TEXT, p_cfg_tgt_id TEXT, p_chg_actn_cd VARCHAR(20), p_old_val JSONB, p_new_val JSONB, p_chgr_id TEXT, p_chg_rsn_cont TEXT DEFAULT NULL)`.
- R1(`fn_switch_fee_mode`) 호출: `('fee_mode_config', v_id::TEXT, CASE.., jsonb_build_object('active_mode',v_cur), jsonb_build_object('active_mode',p_new_mode), p_changed_by, p_reason_memo)` — **위치·타입 일치**. `v_id`는 sql/140 L75에서 `UUID` 선언 → `::TEXT` 캐스팅으로 `p_cfg_tgt_id TEXT` 정합.
- R2(`fn_toggle_open_promo`) 호출: `('promo_fee_config', v_id::TEXT, CASE WHEN v_old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END, <old jsonb/NULL>, <new jsonb>, p_changed_by, p_reason_memo)` — `v_id`(UUID, sql/149 L112)·`v_old_active_yn`(sql/149 L113) 모두 스코프 내 실재, 위치 일치.
- `COMMENT ON FUNCTION ...(TEXT,TEXT,VARCHAR,JSONB,JSONB,TEXT,TEXT)`(DDL L84)은 함수 해석상 `VARCHAR(20)≡VARCHAR`이므로 시그니처 정확 매칭 — 정합.
- R3(`fn_rollback_fee_mode`)는 내부에서 R1 호출 → 전이적 커버. reason `'ROLLBACK: '` 접두 → R1 CASE의 `LIKE 'ROLLBACK:%'`가 `chg_actn_cd='ROLLBACK'` 자동 분류. **패턴 매칭 검증: 실제 접두 `'ROLLBACK: '`(콜론+공백)을 `'ROLLBACK:%'`가 매칭(% ← 공백+나머지) ✅**.

### ③ 멱등 가드 복합키 ↔ DDL 인덱스 — ✅ 정합(성능 무관, 정정 권고)
- 가드 4컬럼(`cfg_tbl_nm·cfg_tgt_id·chg_dtm·chgr_id`): `idx_sys_cfg_chg_tbl(cfg_tbl_nm,chg_dtm)` + `idx_sys_cfg_chg_tgt(cfg_tgt_id)`가 부분 커버. 백필은 1회성 극소 건이라 성능 무관. 멱등 자체는 **정확**.
- 주석 5컬럼 표기 vs SQL 4컬럼 → **Q5(P3)**. 4컬럼으로 멱등 충분(chg_actn_cd 소스 종속).
- 이론적 4-tuple 충돌 위험: 동일 관리자·동일 config·동일 마이크로초 두 변경 필요 → 인간 조작 페이스상 불가. 모델 §5·이행 §8-3의 `src_audit_id` provenance 제안은 견고성 강화책(선택). 채택 시 Q5 동시 해소.

### ④ 원천 테이블 실컬럼 ↔ 백필 SELECT 매핑 — ✅ 전량 실재 확인
- **fee_mode_audit(sql/140 L30-44)**: `fee_mode_id·old_mode·new_mode·changed_by·changed_at·reason_memo·del_yn` — 백필 §5.1 참조 컬럼 **전부 실재**. `chg_actn_cd` 파생(`reason_memo LIKE 'ROLLBACK:%'`)은 sql/140 L119 롤백 접두와 정합(소스 파생, 임의값 아님).
- **promo_fee_audit(sql/149 L46-64)**: `promo_fee_id·old_active_yn·new_active_yn·old_start_dtm·new_start_dtm·old_end_dtm·new_end_dtm·changed_by·changed_at·reason_memo·del_yn` — 백필 §5.2 참조 컬럼 **전부 실재**. `chg_actn_cd` 파생(`old_active_yn IS NULL → INSERT`)은 sql/149 L135(최초 생성 시 `v_old_active_yn:=NULL`)와 정합.
- **JSONB 키 = 원천 컬럼명 그대로**(fee: `active_mode` / promo: `promo_active_yn·promo_start_dtm·promo_end_dtm`) → 백필·이중기록 **양방향 동일 키**로 통일 확인. `->>'키'` 조회가 과거·신규 행에서 동일 동작(반쪽 깨짐 방지) — 이 설계의 최대 무결성 포인트, **정합**. 다만 규약 명문화 미비 → **Q6(P3)**.
- CHECK 제약 정합: DDL `chg_actn_cd IN ('INSERT','UPDATE','SWITCH','TOGGLE','ROLLBACK','DELETE')` ⊇ 백필/RPC 산출값(`ROLLBACK·SWITCH·INSERT·TOGGLE`). 위반 0.

---

## 백필 검증 쿼리 논리 타당성 (지시 항목 3 — 돈·데이터 품질 양보 없음)

이행계획 §4·§6의 대사 논리를 검토했다. **타당**.

- **§4 사전 점검(고아·NULL PK)**: `null_row_id`(config 참조 소실)·`null_chgr`(NOT NULL이라 기대 0)를 백필 전 확인, `null_row_id>0` 시 **백필 제외+리더 상신(임의 보정 금지)** — [money-data-quality-no-compromise]·[no-test-dummy-data] 원칙 준수. ✅
- **고아 행 처리 방침**: `cfg_tgt_id NOT NULL` 제약 위반 행을 제외하고 건수·audit_id 상신 — 소급은 소스 실재 건만, 임의값 0. **적절**. ✅
- **§6 건수 대사**: V1(설정별 원천 활성건=대상 적재건)·V2(총계)·V3(멱등 재실행 불변)·V4(샘플 값·시각 동일)·V5(NULL/CHECK 무결성 0). "대략 맞음 없음"·전량 통과를 이행 확정 조건으로 명시 — **금전/장부 대사 원칙 충족**. ✅
- **활성행(del_yn='N')만 백필**: 소스가 논리삭제한 이력을 신규 테이블에 활성 부활시키지 않음 — 정합. ✅
- **비파괴 보장**: 원천 fee_mode_audit·promo_fee_audit 불변, 롤백도 논리삭제(`del_yn='Y'`)만 — 물리 DELETE 0. ✅

> ⚠️ **Q2 연동**: §6 검증은 신규 테이블 무결성엔 충분하나, §7.3 롤백 UPDATE가 `mod_dtm`/`modr_id` 미설정(정본 §4-1 위반)이므로 이행 SQL 확정 시 보정 필수.

---

## 표준담당 2회차 §9 지적 재확인 (지시 항목 4)

- **`02_migration_plan.md`의 `cfg_row_id` 잔여 참조: 0건** — 직접 grep 결과 `cfg_row_id`는 이행계획서에 **전무**. INSERT 타깃(L139·L163)·JOIN(L156·L185)·매핑표·멱등 가드·검증쿼리 전부 `cfg_tgt_id` 사용. 표준담당 §9-2의 "9건 잔존" 지적은 **수정 전 파일을 읽은 경합으로 무효**(리더 확인과 일치). **P1으로 재등재하지 않음.**
- grep 히트는 전부 `02_standards_naming-review.md`(표준담당 자체 리뷰 서술)·`01_modeler_model.md`(변경이력 서술)뿐 — 확정 컬럼 `cfg_tgt_id`와 무관.

---

## P1/P2/P3 체크리스트 요약

| 영역 | 항목 | 판정 |
|---|---|---|
| **P1** 테이블명 | 접두사 `sys_`·소문자 snake·비표준 접미사/복수형 없음 | ✅ |
| **P1** 시스템 컬럼 | 4개 마지막 배치·NOT NULL·TEXT 'ADMIN'·TIMESTAMPTZ CURRENT_TIMESTAMP·순서 | ✅ |
| **P1** 논리삭제 | `del_yn CHAR(1)`+CHECK·`del_dtm`·물리 DELETE/DROP 없음 | ✅ |
| **P1** 타입 | `chg_dtm·del_dtm·reg_dtm·mod_dtm` 전부 TIMESTAMPTZ·CHAR(n) 텍스트 없음(`chg_actn_cd`=VARCHAR(20)) | ✅ |
| **P2** 표준사전 | 표준용어 형식 전 컬럼 적합 / `val` 도메인 미등록(R7×2) → **Q1** / 단어 10개 등재 대기(리더) | ⚠️ 조건부 |
| **P2** 명명일관성 | 시스템 suffix ✅ / `mod_dtm` 트리거 부재 → **Q2** / 제약명 표준(inline auto-name) ✅ | ⚠️ 조건부 |
| **P2** 모델링절차 | Top-down·주제영역·PK(hist_id) 명시 | ✅ |
| **P3** 기타 | Y/N CHAR(1)+CHECK ✅·del_yn 필터(뷰·부분인덱스) ✅·regr_id 주입 ✅·COMMENT 풍부(테이블+7컬럼+함수+뷰) ✅·FK 의도적 부재(다형참조 근거) ✅ / 인덱스명 축약 **Q3**·문서정합 **Q4·Q5·Q6** | ⚠️ 개선 |

---

## 후속 조치 (→ da-leader)

1. **확정 전 P2 해소 권고(비차단)**:
   - Q1: `val` 도메인(JSONB) 등재 + Hook `DOMAIN_SUFFIXES` `'val'` 추가 + 정본 §1-2 동기화(표준담당 §6 INSERT안 승인) → R7 경고 0.
   - Q2: 정본 §6에 `_hist`/`_audit` append-only 트리거 예외 명문화 **또는** 트리거 추가. **어느 쪽이든 이행계획 §7.3 롤백 UPDATE에 `mod_dtm=CURRENT_TIMESTAMP, modr_id='MIGRATION'` 추가는 필수**(정본 §4-1).
2. **P3 개선(확정 시 반영 권고)**: Q3 인덱스명·Q4·Q5·Q6 문서 정합 — DDL 정확성 무관, 리더 판단.
3. **DB 미검증 명시**: 원천 audit 실 건수·`std_dic`/`std_dom` 등재 상태는 미검증. 리더가 실 DB `SELECT dic_phy_nm FROM std_dic WHERE del_yn='N'` + §4 사전 점검 쿼리로 확정 단계 확인.
4. **모델·이행 산출물 상호 정합 확인 완료**: 경계면 4종 정합, 백필 대사 논리 타당 — **이행 계획 자체는 SQL 로직상 실행 가능**(컬럼명 정합·소스 실컬럼 확인).

**결론: P1 부재로 확정 차단 없음. P2 2건은 리더 등재·정본 명문화·이행 SQL 1줄 보정으로 해소되는 조건부 사항. 게이트 통과(P2 조건부).**
