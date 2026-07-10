# 02. 명명 검증 보고 — 운영 설정 변경 감사 이력 (sys_cfg_chg_hist)

- **검증**: DA 표준담당 (da-standards)
- **검증일**: 2026-07-10
- **대상**: `01_modeler_ddl.sql` (모델담당 초안) · 설계 근거 `01_modeler_model.md`
- **정본**: `docs/da/데이터표준규칙.md` §0~§10 · Hook `.claude/hooks/da-ddl-guard.mjs`
- **판정 결과**: **조건부 통과** — Hook 차단 위반(R1~R6) **0건**, R7 경고 **2건**(`old_val`·`new_val`). 표준 완전 준수(경고 0)를 위해 **표준단어 10개 + 표준도메인 2개 등재** 및 미확정 3건 확정 필요.

---

## 1. 검증 범위·방법

- 검증 대상: `CREATE TABLE sys_cfg_chg_hist` 전 컬럼(13개) + 헬퍼 함수 `fn_log_cfg_change` + 뷰 `v_sys_cfg_chg_recent`.
- **ALTER TABLE ADD COLUMN 없음** — 본 DDL은 CREATE 전용이라 R7 ALTER 사각지대 대상 컬럼 없음(2026-06-12 lat/lng 사고 유형 해당 없음).
- **⚠️ DB 역검증 미수행**: `std_dic`·`std_dom`은 `/admin/std/words` UI 런타임 등록분으로 **시드 SQL 파일이 존재하지 않으며**(`INSERT INTO std_dic` 파일 0건 확인), 실 운영/스테이징 DB 미접속. 따라서 표준단어·도메인 등록 여부는 **정본 §1-2 도메인표·§9 약어목록·Hook `DOMAIN_SUFFIXES`·기존 sql/* 선례** 기준으로 판정함. 등재안 확정 전 리더가 실 DB `SELECT dic_phy_nm FROM std_dic WHERE del_yn='N'`로 최종 확인 권장.

---

## 2. da-ddl-guard Hook 판정 (R1~R7)

| 규칙 | 검사 항목 | 판정 | 근거 |
|---|---|---|---|
| R1 | 시스템 컬럼 4개(형식 일치) | ✅ 통과 | `regr_id·reg_dtm·modr_id·mod_dtm` 정확한 형식·순서 |
| R2 | 도메인 접두사 | ✅ 통과 | `sys_` (시스템 공통) |
| R3 | 소문자 snake_case | ✅ 통과 | 테이블·전 컬럼 소문자, 따옴표 식별자 없음 |
| R4 | 날짜 컬럼 타입 | ✅ 통과 | `chg_dtm·del_dtm·reg_dtm·mod_dtm` 전부 TIMESTAMPTZ |
| R5 | 물리삭제 금지 | ✅ 통과 | DROP/DELETE/TRUNCATE 없음 |
| R6 | 논리삭제 컬럼 | ✅ 통과(면제) | 테이블명 `_hist` 종결 → `LOG_TABLE_RE` 매칭으로 R6 면제. 단 `del_yn·del_dtm` 자발 포함(위반 아님) |
| R7 | 표준도메인 종결(경고) | ⚠️ 경고 2건 | `old_val`·`new_val` 종결 토큰 `val`이 `DOMAIN_SUFFIXES` 미포함 |

**Hook 최종 판정: 현 초안 그대로 `exit 0`(통과) — R7은 경고이며 차단하지 않음.** 다만 R7 경고 2건은 표준 미준수 상태이므로, 경고 0 클린 통과를 위해 §5 `val` 도메인 등재를 권고한다.

---

## 3. 전 컬럼 명명 검증

| # | 컬럼명 | 논리 의미 | 종결 도메인 | 도메인 판정 | 사용 단어 | 단어 판정 |
|---|---|---|---|---|---|---|
| 1 | `hist_id` | 이력식별자 | `id` | ✅ 등록 | hist | ⚠️ 미등재 |
| 2 | `cfg_tbl_nm` | 대상설정테이블명 | `nm` | ✅ 등록 | cfg·tbl | ⚠️ 미등재 |
| 3 | `cfg_row_id` | 대상설정행식별자 | `id` | ✅ 등록 | cfg·row | ⚠️ 미등재(§4-③ 재명명 권고) |
| 4 | `chg_actn_cd` | 변경행위코드 | `cd` | ✅ 등록 | chg·actn | ⚠️ 미등재 |
| 5 | `old_val` | 변경전값 | `val` | ❌ **미등록(R7)** | old | ⚠️ 미등재 |
| 6 | `new_val` | 변경후값 | `val` | ❌ **미등록(R7)** | new | ⚠️ 미등재 |
| 7 | `chg_rsn_cont` | 변경사유내용 | `cont` | △ Hook만 등록 | chg·rsn | ⚠️ 미등재 |
| 8 | `chgr_id` | 변경자식별자 | `id` | ✅ 등록 | chgr | ⚠️ 미등재(복합어) |
| 9 | `chg_dtm` | 변경일시 | `dtm` | ✅ 등록 | chg | ⚠️ 미등재 |
| 10 | `del_yn` | 논리삭제여부 | `yn` | ✅ 등록 | del | ✅ 등록(§9) |
| 11 | `del_dtm` | 논리삭제일시 | `dtm` | ✅ 등록 | del | ✅ 등록(§9) |
| 12~15 | `regr_id·reg_dtm·modr_id·mod_dtm` | 시스템 컬럼 | id·dtm | ✅ 등록 | regr·reg·modr·mod | ✅ 등록(§9) |

> 형식(`표준단어1(_표준단어n)_표준도메인`)은 전 컬럼이 **구조적으로 적합**하다(모두 도메인 약어로 종결). 문제는 종결 도메인 `val`의 미등록(R7)과, 사용 단어 다수의 표준사전 미등재다.

### 위반·경고 목록 (컬럼명 | 위반유형 | 권장값)

| 컬럼명 | 위반유형 | 권장값 |
|---|---|---|
| `old_val` | R7 — 종결 도메인 `val` 미등록 | `old_val` 유지 + **`val` 도메인 등재**(JSONB) → 경고 해소 |
| `new_val` | R7 — 종결 도메인 `val` 미등록 | `new_val` 유지 + **`val` 도메인 등재**(JSONB) → 경고 해소 |
| `cfg_row_id` | 단어 `row` 미등재 + SQL 키워드성 | **`cfg_tgt_id`** 로 변경(§4-③) |
| `chg_rsn_cont` | 도메인 `cont` 정본 §1-2 미기재(Hook만 존재) | `chg_rsn_cont` 유지 + **`cont` 도메인을 정본 §1-2에 등재**(Hook/정본 동기화, §6) |
| `hist_id`·`cfg_tbl_nm`·`chg_actn_cd`·`chgr_id`·`chg_dtm` 등 | 사용 단어 미등재(cfg·tbl·chg·hist·actn·rsn·chgr·old·new) | 형식은 적합 — **§5 표준단어 등재로 정합화**(컬럼명 변경 불요) |

---

## 4. 미확정 3건 판정

### ① 접미사 `_hist` vs `_audit` → **`_hist` 확정(권고)**

- **선례**: `_hist`=`mps_txn_hist`(sql/029) / `_audit`=`fee_mode_audit`(140)·`promo_fee_audit`(149) / `_log`=`std_audit_log`(009)·`bean_audit_log`(069). 접미사가 혼재.
- **결정 근거**:
  1. **Hook 정합성**: `LOG_TABLE_RE = /(_log|_hist)$/` 는 `_hist`를 append-only 로그 범주로 명시 인식하나 **`_audit`는 미인식**. `_hist`가 R6(논리삭제) 면제와 정본 §4-3(로그성 물리삭제 허용) 취지에 정확히 부합한다.
  2. **의미 부합**: 요구(§1 "이력이 없어 추적 불가")의 핵심어가 "이력"이며 `hist`(history)가 직역이다.
  3. **경로 일관**: 테이블 초안명·워크스페이스 디렉토리(`20260710_cfg_chg_hist`)가 이미 `hist`.
- **부대 조건**: `hist`는 정본 §9 약어목록에 **미등재**(선례 mps_txn_hist가 비공식 사용). **`hist` 표준단어 등재 필요**(§5).

### ② `old_val`/`new_val` vs `bfor_val`/`aftr_val` → **`old_val`/`new_val` 확정(권고)**

- **핵심**: 두 후보 **모두 종결 도메인이 `val`** 이라 R7 문제는 동일. 실질 쟁점은 접두 단어(old/new vs bfor/aftr)뿐이다.
- **결정 근거**: `std_audit_log`(범용 감사 정본 선례)가 `old_val`/`new_val`을 확립했고, 본 설계가 그 범용 패턴을 계승한다. `bfor`/`aftr`는 선례·명료성 모두 열위. → **`old_val`/`new_val` 계승**.
- **필수 부대 조건**: `val` 종결이 R7 경고를 유발하므로 **`val` 표준도메인 등재(JSONB) + Hook `DOMAIN_SUFFIXES`에 `val` 추가**가 확정 조건. 이 조치는 기존 `std_audit_log.old_val/new_val`도 소급 정합화한다.

### ③ `cfg_row_id` vs `cfg_tgt_id` → **`cfg_tgt_id` 확정(권고)**

- **결정 근거**:
  1. **선례 계승**: 범용 감사 정본 `std_audit_log`가 다형 참조 대상을 `tgt_tbl`+`tgt_id`(target)로 확립. 본 설계도 다형 참조(`cfg_tbl_nm`+대상행) 구조이므로 `tgt` 어간이 일관.
  2. **`row` 회피**: `ROW`는 SQL 표준 예약어. 컬럼명 일부라도 `tgt`가 모호성 없이 안전.
  3. `cfg_tbl_nm`(대상 테이블명)은 이미 `nm` 도메인 종결로 std 선례(`tgt_tbl`, 무도메인)보다 우수하므로 **유지**하고, 짝이 되는 대상행 식별자만 `cfg_tgt_id`로 정렬.
- **부대 조건**: `tgt` 표준단어 등재 필요(§5). `cfg_row_id` → `cfg_tgt_id` 한 컬럼만 재명명.

---

## 5. 표준단어 등재안 (std_dic)

정본 §9·§1-2·Hook 대조 결과 **미등재로 판정된 사용 단어 10개**. 표준등록=즉시 `APPROVED` 우회 정책(std-approval-workflow-dormant)에 따라 아래 INSERT로 등재하거나 `/admin/std/words`에서 등록한다.

| 물리약어(대문자) | 논리명 | 풀네임 | 복합어 | 근거·선례 |
|---|---|---|---|---|
| `CFG` | 설정 | config | | 워크스페이스·설정 도메인 신규 |
| `CHG` | 변경 | change | | mod(수정)과 구분되는 변경행위 |
| `HIST` | 이력 | history | | mps_txn_hist 선례 정식화 |
| `TBL` | 테이블 | table | | std_audit_log `tgt_tbl` 정식화 |
| `TGT` | 대상 | target | | std_audit_log `tgt_id`/`tgt_tbl` 정식화 |
| `ACTN` | 행위 | action | | std_audit_log `action_cd` 축약형 표준화 |
| `RSN` | 사유 | reason | | fee/promo `reason_memo` 대체 표준어 |
| `CHGR` | 변경자 | changer | ✔ REGR/MODR 계열 | std_audit_log `chgr_id` 정식화 |
| `OLD` | 전(前) | old | | std_audit_log `old_val` 계승 |
| `NEW` | 후(後) | new | | std_audit_log `new_val` 계승 |

```sql
-- 표준단어 등재 (std_dic). dic_gbn_cd='0001'(단어), apv_status='APPROVED'(즉시승인 우회)
-- data_type/data_len은 단어에는 NULL, 도메인(std_dom)에서 한정
INSERT INTO public.std_dic (dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, apv_status, regr_id)
VALUES
  (gen_random_uuid(), '설정',   'CFG',  'config',  '운영 설정(config)',            '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '변경',   'CHG',  'change',  '변경 행위(mod와 구분)',        '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '이력',   'HIST', 'history', '변경 이력(append-only)',       '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '테이블', 'TBL',  'table',   '대상 테이블',                  '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '대상',   'TGT',  'target',  '다형 참조 대상',               '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '행위',   'ACTN', 'action',  '변경 행위 유형',               '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '사유',   'RSN',  'reason',  '변경 사유',                    '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '변경자', 'CHGR', 'changer', '변경 수행자(복합어, REGR/MODR 계열)', '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '전',     'OLD',  'old',     '변경 전 상태',                 '0001', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '후',     'NEW',  'new',     '변경 후 상태',                 '0001', 'APPROVED', 'ADMIN')
ON CONFLICT DO NOTHING;
```

> 이미 등재된 단어(`sys`·`del`·`reg`·`regr`·`mod`·`modr`)와 도메인 약어(`id`·`nm`·`cd`·`dtm`·`yn`)는 재등록 불요. `ON CONFLICT DO NOTHING`은 dic_phy_nm UNIQUE 제약 가정 — 실 DB 제약 확인 후 조정.

---

## 6. 표준도메인 등재안 (std_dom) + Hook 동기화

R7 경고 해소와 `cont` 도메인 정합화를 위해 도메인 2개를 등재/명문화한다.

| 도메인약어 | 의미 | 기본 타입 | 조치 |
|---|---|---|---|
| `val` | 값(스냅샷/JSONB) | `JSONB` | std_dom 등재 + **정본 §1-2 표 추가** + **Hook `DOMAIN_SUFFIXES`에 `'val'` 추가** |
| `cont` | 내용 | `TEXT` | Hook에는 이미 존재 → **정본 §1-2 표에만 추가**(문서 지연 해소) |

```sql
-- 표준도메인 등재 (std_dom). dic_gbn_cd 등 스키마는 std_dom 실 구조 확인 후 매핑
-- (std_dom은 표준단어를 먼저 등록한 뒤 Type/Length 한정 — 정본 §1-2)
INSERT INTO public.std_dom (dom_id, dom_log_nm, dom_phy_nm, data_type, data_len, dom_desc, apv_status, regr_id)
VALUES
  (gen_random_uuid(), '값',   'VAL',  'JSONB', NULL, '변경 전/후 스냅샷 값(범용 감사)', 'APPROVED', 'ADMIN'),
  (gen_random_uuid(), '내용', 'CONT', 'TEXT',  NULL, '자유 서술 내용',                 'APPROVED', 'ADMIN')
ON CONFLICT DO NOTHING;
```

> std_dom 실제 컬럼명(dom_log_nm/dom_phy_nm/data_type 등)은 std_dic 패턴 유추값 — 리더가 std_dom 스키마 확인 후 컬럼 매핑 확정 요망.

**Hook 수정(정본·화이트리스트 동기 유지 원칙)**: `.claude/hooks/da-ddl-guard.mjs` `DOMAIN_SUFFIXES`에 `'val'` 1개 추가. (`cont`는 이미 존재.) 이 수정으로 `old_val`/`new_val` R7 경고가 소멸하여 **경고 0 클린 통과** 달성. ※ Hook 파일 수정은 표준담당 권한 밖(판정만) — 리더/승인 후 반영.

---

## 7. ⚠️ 정본 ↔ Hook 화이트리스트 불일치 (da-leader 보고 필요)

역할 지침(정본·Hook 불일치 즉시 보고)에 따라 보고한다. Hook `DOMAIN_SUFFIXES`가 **정본 §1-2 도메인표보다 넓다**:

- **Hook에만 존재(정본 §1-2 미기재)**: `uid`, `txt`, `cont`, `key`, `pi`, `pct`, `seq`, `tp`, `sts`, `emoji`, `tag`
- 본 건 직접 관련: **`cont`** (컬럼 `chg_rsn_cont`가 Hook은 통과하나 정본 문서엔 근거 없음).
- 조치 권고: 정본 §1-2 도메인 표에 위 11개(최소 `cont`)를 소급 명문화하여 문서-Hook 단일 진실 소스 정합 복원. **한쪽만 갱신 금지 원칙**(역할 지침)에 따라 `val` 신규 등재 시 정본·Hook **동시** 반영.

---

## 8. 결론 및 확정 명명

**판정: 조건부 통과.** 현 초안은 da-ddl-guard **차단 위반 0건**으로 그대로 물리적용 가능하나(R7 경고 2건 잔존), 아래 확정·등재를 이행하면 **경고 0 완전 준수**가 된다.

**확정 명명(권고안)**:
- 테이블명: **`sys_cfg_chg_hist`** (변경 없음, `_hist` 확정)
- 컬럼 재명명 1건: **`cfg_row_id` → `cfg_tgt_id`**
- 전/후 값: **`old_val` / `new_val`** 유지 (`val` 도메인 등재 전제)
- 그 외 컬럼: 형식 적합 — 변경 불요

**선행 조치(확정 조건)**:
1. 표준단어 10개 등재: `CFG·CHG·HIST·TBL·TGT·ACTN·RSN·CHGR·OLD·NEW` (§5)
2. 표준도메인 등재: `VAL`(JSONB) + `CONT`(TEXT) (§6)
3. Hook `DOMAIN_SUFFIXES`에 `'val'` 추가 + 정본 §1-2 동기화 (§6·§7) — 리더 승인 후
4. da-modeler에 컬럼 재명명 1건(`cfg_row_id→cfg_tgt_id`) 반영 요청 → 재검증

**후속**: 모델담당이 `cfg_tgt_id` 반영 시 재검증(이전 위반 대조표 제시). 헬퍼 함수 `fn_log_cfg_change`의 파라미터 `p_cfg_row_id`도 `p_cfg_tgt_id`로 동반 변경 필요.

---

## 9. 재검증 (2회차) — 2026-07-10

모델담당이 1차 판정을 반영해 `01_modeler_ddl.sql`·`01_modeler_model.md`를 수정 완료함(리더 지시). 이행 여부를 항목별 대조한다.

### 9-1. 1차 판정 조건 이행 대조표

| # | 1차 조건 | 담당 | 이행 여부 | 근거 |
|---|---|---|---|---|
| ① | 접미사 `_hist` 확정(테이블 `sys_cfg_chg_hist` 유지) | modeler | ✅ 이행 | DDL L12 테이블명 `sys_cfg_chg_hist` 유지 |
| ② | `old_val`/`new_val` 유지 | modeler | ✅ 이행 | DDL L18~19 유지 (val 도메인 등재는 리더 조치 대기) |
| ③ | `cfg_row_id` → `cfg_tgt_id` 재명명 | modeler | ✅ 이행 | DDL 컬럼(L15)·주석(L33)·인덱스(L51 `idx_sys_cfg_chg_tgt`)·헬퍼 파라미터(L60 `p_cfg_tgt_id`)·INSERT(L73)·VALUES(L77)·뷰(L89)·헤더주석(L8) **일괄 반영** |
| — | 헬퍼 파라미터 `p_cfg_row_id`→`p_cfg_tgt_id` 동반 변경 | modeler | ✅ 이행 | DDL L60·L77·모델 §5 L128 시그니처 일치 |
| — | 인덱스명 `idx_sys_cfg_chg_row`→`idx_sys_cfg_chg_tgt` 정렬 | modeler | ✅ 이행 | DDL L51 |
| 1 | 표준단어 10개 등재(CFG·CHG·HIST·TBL·TGT·ACTN·RSN·CHGR·OLD·NEW) | **leader** | ⏳ 대기 | 등재는 표준등록(즉시 APPROVED) 권한=리더. DDL 변경 불요 |
| 2 | 표준도메인 VAL(JSONB)·CONT(TEXT) 등재 | **leader** | ⏳ 대기 | §6 INSERT안 제출 완료, 승인 대기 |
| 3 | Hook `DOMAIN_SUFFIXES`에 `'val'` 추가 + 정본 §1-2 동기화 | **leader** | ⏳ 대기 | Hook 수정은 표준담당 권한 밖. 미이행 시 old_val/new_val R7 경고 잔존(비차단) |

**모델담당 소관 조건(①②③ + 부대) 전량 이행 완료.** 조건 1~3은 리더 소관 등재·Hook 조치로, DDL 정확성과 무관하게 병행 진행.

### 9-2. 잔여 `cfg_row_id` 참조 점검

- **모델담당 산출물(`01_modeler_ddl.sql`·`01_modeler_model.md`)**: 잔여 `cfg_row_id` 사용 **0건**. model.md의 `cfg_row_id` 표기는 전부 "`cfg_row_id`→`cfg_tgt_id` 확정" 변경 이력 서술(사용 아님) — 정상.
- **⚠️ 교차 산출물 불일치(리더 상신)**: `02_migration_plan.md`(이행담당)에 **활성 `cfg_row_id` 참조 9건 잔존** — 확정 DDL 컬럼 `cfg_tgt_id`와 불일치. 백필 INSERT가 존재하지 않는 컬럼을 타깃하여 **적용 시 실패**한다.
  - INSERT 타깃 컬럼: L139, L163
  - JOIN 조건: L156(`h.cfg_row_id = a.fee_mode_id::TEXT`), L185(`h.cfg_row_id = a.promo_fee_id::TEXT`)
  - 매핑표·멱등 가드·점검쿼리: L33, L48, L131, L228
  - (참고: `null_row_id`(L108·117·124·245·275)는 검증쿼리 별칭이라 컬럼 참조 아님 — 무해)
  - **조치**: 이행담당이 `02_migration_plan.md`의 `cfg_row_id` → `cfg_tgt_id` 일괄 치환 필요. 표준담당은 판정만 하며 타 산출물 미수정.

### 9-3. Hook 재판정 (수정본)

수정본은 `cfg_row_id`→`cfg_tgt_id`(종결 도메인 `id` ✅)만 변경 — R1~R6 위반 **0건 유지**, R7 경고 **2건 유지**(`old_val`·`new_val`, `val` 도메인 미등재). Hook 최종 `exit 0`(통과). 조건 2·3(val 도메인 등재+Hook 반영) 이행 시 경고 0.

### 9-4. 최종 판정 (2회차)

**모델담당 DDL: 통과.** 표준용어 형식 전 컬럼 적합, 1차 판정 조건 ①②③ 전량 반영, 잔여 `cfg_row_id` 0건. da-ddl-guard 차단 위반 0건.

**단, 두 갈래 후속 필수**:
1. **리더**: 표준단어 10개 + 도메인 2개 등재, Hook `'val'` 추가·정본 §1-2 동기화(§5·§6·§7) → 경고 0 완전 준수 달성.
2. **이행담당**: `02_migration_plan.md`의 잔여 `cfg_row_id` 9건 → `cfg_tgt_id` 치환(9-2) → 백필 정합.
