# 02. 이행 계획서 — 운영 설정 변경 감사 이력 (sys_cfg_chg_hist)

- **작성**: DA 이행담당 (da-migration)
- **작성일**: 2026-07-10
- **입력**: `01_modeler_model.md` · `01_modeler_ddl.sql`(초안) · 원천 `sql/140`(fee_mode_audit) · `sql/149`(promo_fee_audit)
- **상태**: 초안 — 표준(명명)·품질 게이트 미통과. 아래 SQL의 **컬럼명은 표준담당 확정 전까지 잠정**(모델 §6 미결 항목 반영 필요).
- **⛔ 운영/스테이징 DB 직접 적용 금지**: 본 문서의 SQL은 전량 초안. 적용은 §7 "마스터 적용 절차"에 따라 마스터만 수행.
- **실 DB 미조회**: 원천 audit 두 테이블의 실제 적재 건수는 미확인(§6 검증 쿼리로 마스터가 대사).

---

## 0. 이행 필요 여부 판정 (요약)

| 항목 | 판정 | 근거 |
|---|---|---|
| **신규 테이블 이행 필요?** | ✅ 필요(경량) | 신규 테이블 1개 + 헬퍼 1개 + 뷰 1개 생성. 순수 DDL이라 데이터 이전 자체는 없음 |
| **기존 audit 과거 데이터 백필?** | ✅ **권고: 백필함**(조건부) | 소스 실재 건 100% 파생 가능(임의값 0)·통합 타임라인이 테이블 존재 이유·건수 극소. 단 멱등 NOT EXISTS 가드 필수 |
| **RPC 전환 방식?** | ✅ **권고: 이중기록(dual-write)** | 기존 audit 비파괴·앱 라우트 무변경(SQL 함수 본문만 1줄 추가)·구 뷰 계속 동작. 즉시 전환은 앱 코드·뷰 재작성 유발이라 배제 |
| **다운타임?** | ❌ 없음 | append-only 신규 테이블, 기존 쓰기 경로 무중단. 백필은 신규 빈 테이블 INSERT |
| **데이터 손실 위험?** | ❌ 없음 | 원본(fee_mode_audit·promo_fee_audit) 비파괴 유지. 물리 DELETE 없음 |

---

## 1. 원천 → 대상 매핑표

신규 `sys_cfg_chg_hist`(범용 JSONB)로 두 전용 audit을 수렴한다. **JSONB 전후값 규약**: 물리 전체 행 스냅샷이 아니라 **해당 설정의 업무 컬럼만** 담는다(시스템4·del_yn·singleton_key 제외). 설정별 키 집합은 결정적으로 고정한다.

### 1.1 `fee_mode_audit` → `sys_cfg_chg_hist`

| 대상 컬럼 | 원천 표현식 | 규칙·근거 |
|---|---|---|
| `cfg_tbl_nm` | `'fee_mode_config'` (상수) | 고정 리터럴 |
| `cfg_tgt_id` | `fee_mode_id::TEXT` | UUID→TEXT 캐스팅(대상 컬럼 TEXT). NULL이면 백필 제외(§4 품질 게이트) |
| `chg_actn_cd` | `CASE WHEN reason_memo LIKE 'ROLLBACK:%' THEN 'ROLLBACK' ELSE 'SWITCH' END` | 소스 실재 필드에서 파생(임의값 아님). 롤백은 `fn_rollback_fee_mode`가 `'ROLLBACK: '` 접두 기록 |
| `old_val` | `jsonb_build_object('active_mode', old_mode)` | 업무 컬럼 스냅샷 |
| `new_val` | `jsonb_build_object('active_mode', new_mode)` | 업무 컬럼 스냅샷 |
| `chg_rsn_cont` | `reason_memo` | 그대로 |
| `chgr_id` | `changed_by` | 업무 감사 주체 |
| `chg_dtm` | `changed_at` | 업무 감사 시각(원 이벤트 시각 보존) |
| `del_yn` | (INSERT 미포함) | 활성행(`del_yn='N'`)만 백필 대상 → 대상은 DEFAULT 'N' 적용 (품질 Q4 문구 정정) |
| `regr_id`/`modr_id` | `'MIGRATION'` (또는 `changed_by`) | 시스템 컬럼=백필 행위 주체. `reg_dtm`/`mod_dtm`은 DEFAULT(=백필 실행 시각) |

### 1.2 `promo_fee_audit` → `sys_cfg_chg_hist`

| 대상 컬럼 | 원천 표현식 | 규칙·근거 |
|---|---|---|
| `cfg_tbl_nm` | `'promo_fee_config'` (상수) | 고정 리터럴 |
| `cfg_tgt_id` | `promo_fee_id::TEXT` | UUID→TEXT |
| `chg_actn_cd` | `CASE WHEN old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END` | 최초 생성(CREATED, old NULL)=INSERT, 이후=TOGGLE. 소스 파생 |
| `old_val` | `CASE WHEN old_active_yn IS NULL THEN NULL ELSE jsonb_build_object('promo_active_yn',old_active_yn,'promo_start_dtm',old_start_dtm,'promo_end_dtm',old_end_dtm) END` | INSERT면 NULL(모델 규약) |
| `new_val` | `jsonb_build_object('promo_active_yn',new_active_yn,'promo_start_dtm',new_start_dtm,'promo_end_dtm',new_end_dtm)` | 다속성 스냅샷 |
| `chg_rsn_cont` | `reason_memo` | 그대로 |
| `chgr_id` | `changed_by` | 업무 감사 주체 |
| `chg_dtm` | `changed_at` | 원 이벤트 시각 보존 |
| `del_yn` | (INSERT 미포함) | 활성행(`del_yn='N'`)만 백필 대상 → 대상은 DEFAULT 'N' 적용 (품질 Q4 문구 정정) |
| `regr_id`/`modr_id` | `'MIGRATION'` | 백필 주체 |

### 1.3 백필 대상 밖(의도적 제외)

- **genesis(시드) 행**: `sql/140`·`sql/149`의 초기 `INSERT ... WHERE NOT EXISTS`는 audit 행을 남기지 않는다 → 신규 테이블에도 **최초 생성 이력 없음**. 소스 audit 행이 없으므로 **INSERT 이력을 임의 생성하지 않는다**(⭐임의값 금지 원칙). 최초 상태는 config 현재값으로 대체 확인.
- **`bean_supply_config`(sql/070)**: 향후 수렴 대상 후보이나 전용 audit·변경 RPC가 이번 범위 밖 → **이번 백필 제외**. "등"(향후 설정 전반)은 신규 발생분부터 헬퍼로 수용.

---

## 2. RPC 전환 — 대상 함수 목록·변경 지점 (⚠️ 코드 미작성, 지점만 명시)

**핵심 발견: 앱(TypeScript) 라우트는 변경 없음.** `src/app/api/admin/fee-mode/route.ts`·`open-promo/route.ts`는 동일 RPC명을 계속 호출하고, 감사 INSERT는 SQL 함수 본문 안에 있으므로 **변경은 SQL 함수 본문에 국한**된다. 방식은 **이중기록**: 기존 전용 audit INSERT는 그대로 두고, 그 **직후에 `fn_log_cfg_change(...)` 1회 호출을 추가**한다.

| # | 대상 SQL 함수 | 원천 파일 | 변경 지점 | 추가 호출(개념) |
|---|---|---|---|---|
| R1 | `fn_switch_fee_mode(VARCHAR,TEXT,TEXT)` | sql/140 §5 | `INSERT INTO fee_mode_audit ...`(L93-94) **직후**, `RETURN QUERY` 앞 | `PERFORM fn_log_cfg_change('fee_mode_config', v_id::TEXT, CASE WHEN p_reason_memo LIKE 'ROLLBACK:%' THEN 'ROLLBACK' ELSE 'SWITCH' END, jsonb_build_object('active_mode',v_cur), jsonb_build_object('active_mode',p_new_mode), p_changed_by, p_reason_memo)` |
| R2 | `fn_toggle_open_promo(CHAR,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT)` | sql/149 §5 | `INSERT INTO promo_fee_audit ...`(L148-159) **직후**, `RETURN QUERY` 앞 | `PERFORM fn_log_cfg_change('promo_fee_config', v_id::TEXT, CASE WHEN v_old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END, <old jsonb 또는 NULL>, <new jsonb>, p_changed_by, p_reason_memo)` |
| R3 | `fn_rollback_fee_mode(TEXT,TEXT)` | sql/140 §6 | **변경 없음** | 내부에서 `fn_switch_fee_mode`를 호출 → R1로 **전이적 커버**. 단 reason이 `'ROLLBACK: '` 접두라 R1의 CASE가 `chg_actn_cd='ROLLBACK'`으로 자동 분류 |

**전환 지점 주의사항**:
- R1은 `UNCHANGED` 조기 반환 경로(L84-86)에는 audit을 남기지 않으므로 **헬퍼 호출도 실제 변경 경로에만** 넣는다(기존 INSERT 위치와 동일 지점).
- R2의 old JSONB는 `v_old_active_yn IS NULL`(최초 생성)이면 `NULL`, 아니면 3속성 스냅샷 — 백필 매핑(§1.2)과 동일 규약으로 통일.
- 함수 시그니처(파라미터·반환타입) 불변 → `CREATE OR REPLACE`로 교체 가능(반환타입 변경 없어 DROP 불요).
- **전제**: R1·R2 교체 전에 `fn_log_cfg_change`가 이미 존재해야 함 → 적용 순서 강제(§7).

**이중기록 기간 정책**: 무기한 이중기록을 1차 표준으로 한다. 기존 뷰(`v_fee_mode_recent_history`·`v_promo_fee_recent_history`)를 두 라우트가 계속 소비하므로 구 audit을 끊으려면 앱·뷰 재작성이 필요 → 이번 범위 밖. 신규 테이블 전용 관리자 화면/뷰가 검증되면 **별도 로드맵**에서 구 audit 폐기(비파괴: `del_yn='Y'` 논리삭제 후 관망)를 판정한다.

---

## 3. 실행 순서 (멱등 SQL, 단계별)

> 모든 단계는 재실행 안전(멱등). 컬럼명은 표준 확정 후 일괄 반영.

- **S0. 선행 게이트**: 표준담당 컬럼명 확정 → 품질 게이트 통과 → 리더가 `01_modeler_ddl.sql`을 `sql/176_*.sql`로 이동. **이 전에는 하위 단계 SQL 미확정**.
- **S1. 구조 생성**: `sql/176`(= 모델 DDL) 적용 — 테이블 `sys_cfg_chg_hist` + 인덱스 4 + `fn_log_cfg_change` + `v_sys_cfg_chg_recent`. (`IF NOT EXISTS`·`CREATE OR REPLACE`로 멱등)
- **S2. 백필**: §5 백필 SQL 적용 — 두 audit → 신규 테이블. `WHERE NOT EXISTS` 가드로 재실행 시 중복 0.
- **S3. RPC 이중기록 전환**: R1(`fn_switch_fee_mode`)·R2(`fn_toggle_open_promo`) `CREATE OR REPLACE`로 헬퍼 호출 추가. R3 무변경.
- **S4. 검증**: §6 건수 대사·샘플 대조 전량 통과 확인. 불일치 시 이행 확정 차단.

**순서 강제 이유**: S1(헬퍼 생성) → S3(헬퍼 호출) 의존. S1 → S2(테이블 존재). S2와 S3는 상호 독립이나 S2를 먼저 두어 백필과 신규 발생분의 경계를 명확히 한다.

---

## 4. 원천 데이터 품질 — 사전 점검 (백필 전 필수)

임의 보정 없이 유형별 건수를 마스터가 확인 후 진행. 이상 발견 시 리더 상신.

```sql
-- P1. fee_mode_audit: 백필 저해 요소(고아·NULL PK) 점검
SELECT
  count(*)                                              AS total,
  count(*) FILTER (WHERE del_yn='N')                    AS active,
  count(*) FILTER (WHERE fee_mode_id IS NULL)           AS null_row_id,   -- 기대 0
  count(*) FILTER (WHERE changed_by IS NULL)            AS null_chgr,     -- 기대 0(NOT NULL)
  count(*) FILTER (WHERE old_mode IS NULL OR new_mode IS NULL) AS null_mode
FROM public.fee_mode_audit;

-- P2. promo_fee_audit: 동일 점검
SELECT
  count(*)                                              AS total,
  count(*) FILTER (WHERE del_yn='N')                    AS active,
  count(*) FILTER (WHERE promo_fee_id IS NULL)          AS null_row_id,   -- 기대 0
  count(*) FILTER (WHERE changed_by IS NULL)            AS null_chgr,     -- 기대 0
  count(*) FILTER (WHERE new_active_yn IS NULL)         AS null_new_yn    -- 기대 0(NOT NULL)
FROM public.promo_fee_audit;
```

**처리 방침**:
- `null_row_id > 0`(고아, config 참조 소실): 해당 행은 `cfg_tgt_id NOT NULL` 제약 위반 → **백필 제외**하고 건수·audit_id를 리더 상신(임의 보정 금지).
- `del_yn='Y'` 행: 백필 대상에서 제외(활성만) 권고. 소스가 논리삭제한 이력을 신규 테이블에 활성으로 되살리지 않는다.

---

## 5. 백필 SQL (초안 — ⛔적용 금지, 컬럼명 표준 확정 후 확정)

멱등 가드: 신규 테이블에 자연키가 없으므로 `(cfg_tbl_nm, cfg_tgt_id, chg_dtm, chgr_id, chg_actn_cd)` 복합 조건으로 중복 차단(`chg_dtm`=원 `changed_at`이 마이크로초 정밀이라 충돌 위험 무시 가능).

```sql
-- ⛔ 초안: 표준·품질 게이트 통과 후 sql/177_*.sql 로 확정. 운영 적용 금지.
-- 원천 실재 건만 이전(임의값 생성 0). 활성행(del_yn='N')만 대상.

-- 5.1 fee_mode_audit → sys_cfg_chg_hist
INSERT INTO public.sys_cfg_chg_hist
  (cfg_tbl_nm, cfg_tgt_id, chg_actn_cd, old_val, new_val, chg_rsn_cont, chgr_id, chg_dtm, regr_id, modr_id)
SELECT
  'fee_mode_config',
  a.fee_mode_id::TEXT,
  CASE WHEN a.reason_memo LIKE 'ROLLBACK:%' THEN 'ROLLBACK' ELSE 'SWITCH' END,
  jsonb_build_object('active_mode', a.old_mode),
  jsonb_build_object('active_mode', a.new_mode),
  a.reason_memo,
  a.changed_by,
  a.changed_at,
  'MIGRATION', 'MIGRATION'
FROM public.fee_mode_audit a
WHERE a.del_yn = 'N'
  AND a.fee_mode_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sys_cfg_chg_hist h
    WHERE h.cfg_tbl_nm = 'fee_mode_config'
      AND h.cfg_tgt_id = a.fee_mode_id::TEXT
      AND h.chg_dtm    = a.changed_at
      AND h.chgr_id    = a.changed_by
  );

-- 5.2 promo_fee_audit → sys_cfg_chg_hist
INSERT INTO public.sys_cfg_chg_hist
  (cfg_tbl_nm, cfg_tgt_id, chg_actn_cd, old_val, new_val, chg_rsn_cont, chgr_id, chg_dtm, regr_id, modr_id)
SELECT
  'promo_fee_config',
  a.promo_fee_id::TEXT,
  CASE WHEN a.old_active_yn IS NULL THEN 'INSERT' ELSE 'TOGGLE' END,
  CASE WHEN a.old_active_yn IS NULL THEN NULL
       ELSE jsonb_build_object('promo_active_yn', a.old_active_yn,
                               'promo_start_dtm', a.old_start_dtm,
                               'promo_end_dtm',   a.old_end_dtm) END,
  jsonb_build_object('promo_active_yn', a.new_active_yn,
                     'promo_start_dtm', a.new_start_dtm,
                     'promo_end_dtm',   a.new_end_dtm),
  a.reason_memo,
  a.changed_by,
  a.changed_at,
  'MIGRATION', 'MIGRATION'
FROM public.promo_fee_audit a
WHERE a.del_yn = 'N'
  AND a.promo_fee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sys_cfg_chg_hist h
    WHERE h.cfg_tbl_nm = 'promo_fee_config'
      AND h.cfg_tgt_id = a.promo_fee_id::TEXT
      AND h.chg_dtm    = a.changed_at
      AND h.chgr_id    = a.changed_by
  );
```

> **모델 개선 제안(이행담당→모델담당)**: 백필·이중기록 시기의 provenance·중복 방지를 위해 `src_audit_id UUID`(원천 audit_id) 컬럼 추가를 검토 권고. 있으면 (a) `NOT EXISTS(src_audit_id)`로 더 견고한 멱등, (b) 원천 추적성 확보. 없어도 위 복합키 가드로 이행 가능하므로 **필수는 아님** — 모델·리더 판정 사항.

---

## 6. 이행 전/후 검증 쿼리 (건수·합계·샘플 대사)

"대략 맞음"은 없음. 아래 전량 통과가 이행 확정 조건.

```sql
-- V1. 건수 대사: 원천 활성건(고아 제외) == 대상 적재건 (설정별)
--   fee_mode
SELECT
  (SELECT count(*) FROM public.fee_mode_audit  WHERE del_yn='N' AND fee_mode_id  IS NOT NULL) AS src_fee,
  (SELECT count(*) FROM public.sys_cfg_chg_hist WHERE cfg_tbl_nm='fee_mode_config')            AS dst_fee;   -- src_fee == dst_fee
--   promo
SELECT
  (SELECT count(*) FROM public.promo_fee_audit WHERE del_yn='N' AND promo_fee_id IS NOT NULL) AS src_promo,
  (SELECT count(*) FROM public.sys_cfg_chg_hist WHERE cfg_tbl_nm='promo_fee_config')          AS dst_promo; -- src_promo == dst_promo

-- V2. 총계 대사: 두 원천 합 == 대상 총건
SELECT
  (SELECT count(*) FROM public.fee_mode_audit  WHERE del_yn='N' AND fee_mode_id  IS NOT NULL)
+ (SELECT count(*) FROM public.promo_fee_audit WHERE del_yn='N' AND promo_fee_id IS NOT NULL) AS src_total,
  (SELECT count(*) FROM public.sys_cfg_chg_hist)                                              AS dst_total; -- 일치

-- V3. 멱등 재실행 대사: §5 백필을 2회 실행해도 dst 총건 불변(NOT EXISTS 가드 확인)

-- V4. 샘플 대조: fee 최신 3건 값 일치 확인
SELECT h.chg_dtm, h.chg_actn_cd, h.old_val->>'active_mode' AS old_m, h.new_val->>'active_mode' AS new_m, h.chgr_id
FROM public.sys_cfg_chg_hist h WHERE h.cfg_tbl_nm='fee_mode_config'
ORDER BY h.chg_dtm DESC LIMIT 3;
--   원천 대조
SELECT changed_at, old_mode, new_mode, changed_by FROM public.fee_mode_audit
WHERE del_yn='N' ORDER BY changed_at DESC LIMIT 3;   -- 값·시각 동일해야 함

-- V5. NULL/CHECK 무결성: 신규 테이블 필수값 위반 0
SELECT count(*) FILTER (WHERE chgr_id IS NULL) AS null_chgr,
       count(*) FILTER (WHERE cfg_tgt_id IS NULL) AS null_row,
       count(*) FILTER (WHERE chg_actn_cd NOT IN ('INSERT','UPDATE','SWITCH','TOGGLE','ROLLBACK','DELETE')) AS bad_actn
FROM public.sys_cfg_chg_hist;   -- 전부 0

-- V6. 이중기록 동작 확인(S3 후, 마스터 스테이징 1회 토글로): 신규 1건이 hist + 구 audit 양쪽에 기록되는지
--   SELECT * FROM public.fn_switch_fee_mode('PI','anakin','스테이징 이중기록 검증');
--   → fee_mode_audit +1  AND  sys_cfg_chg_hist(cfg_tbl_nm='fee_mode_config') +1
```

---

## 7. 마스터 적용 절차 (⭐필수)

> ⛔ 이행담당·에이전트는 DB에 적용하지 않는다. 아래는 **마스터 수행용** 절차. Supabase 연결은 `aws-1-ap-northeast-2` Session pooler만.

### 7.1 적용 순서 (역순 금지)
1. **게이트 확인**: 표준담당 컬럼명 확정 + 품질 게이트 통과 → 리더가 DDL을 `sql/176_sys_cfg_chg_hist.sql`로, 백필을 `sql/177_cfg_chg_hist_backfill.sql`로 확정.
2. **사전 품질 점검**: §4 P1·P2 실행 → `null_row_id`·`null_chgr` = 0 확인(이상 시 리더 상신 후 중단).
3. **S1 구조**: `sql/176` 적용(테이블·인덱스·헬퍼·뷰).
4. **S2 백필**: `sql/177`(§5) 적용.
5. **V1~V5 검증**: 전량 통과 확인(불일치 1건이라도 있으면 중단·원인 분석).
6. **S3 RPC 전환**: `fn_switch_fee_mode`·`fn_toggle_open_promo` `CREATE OR REPLACE` 적용(헬퍼 호출 추가분).
7. **V6 이중기록 검증**: **스테이징에서** 토글 1회 → 양쪽 +1 확인. ⚠️운영에서 검증 토글 금지(실 요금 상태 변경 위험).
8. **스테이징 선적용 → 운영**: 스테이징 전량 통과 후 동일 순서로 운영 적용.

### 7.2 검증 쿼리
§6 V1~V6 전량. 특히 V1(설정별 건수 일치)·V3(멱등)·V6(이중기록)을 게이트로.

### 7.3 롤백 트리거 조건 & 절차
| 트리거 | 조치 |
|---|---|
| V1/V2 건수 불일치 | 백필 중단. 신규 테이블만 논리삭제(`UPDATE sys_cfg_chg_hist SET del_yn='Y', del_dtm=now(), modr_id='MIGRATION', mod_dtm=now() WHERE regr_id='MIGRATION'`) 후 원인 분석 — append-only 예외로 트리거가 없어 `modr_id`·`mod_dtm` 수동 설정(품질 Q2). **원천 audit 불변**(비파괴) |
| V5 무결성 위반(bad_actn>0 등) | 동일 — 백필분 논리삭제·재매핑 |
| S3 후 RPC 오류/앱 장애 | `fn_switch_fee_mode`·`fn_toggle_open_promo`를 **직전 정의(sql/140·149 원본)로 `CREATE OR REPLACE` 복원**. 구 audit 경로는 원본 그대로라 즉시 정상화. 신규 테이블은 그대로 두어도 무해(append-only) |
| 헬퍼 부재로 R1/R2 실패 | S1 미적용 상태에서 S3 적용한 순서 위반 → S1 먼저 적용 |

- **물리 DELETE 금지**: 롤백도 논리삭제(`del_yn='Y'`)로. 신규 테이블은 append-only라 구조 DROP 불요(재이행 시 §5 멱등 가드가 중복 방지).
- **비파괴 보장**: 어떤 롤백에서도 `fee_mode_audit`·`promo_fee_audit` 원본은 손대지 않는다.

### 7.4 DB 외 자산 동반 이행
- Storage 버킷/env/cron: **해당 없음**(순수 DB 변경). 신규 cron·env 추가 없음.
- 앱 배포: **불요**(TypeScript 라우트 무변경). RPC 교체는 DB 반영만으로 즉시 반영.

---

## 8. 리스크·상신 사항 (→ da-leader)

1. **백필 권고=예**: 단 §4 사전 점검에서 `null_row_id>0` 발견 시 해당 건 제외·상신(임의 보정 금지).
2. **JSONB 규약 통일**: 업무 컬럼 스냅샷(시스템4·del_yn·singleton 제외)으로 §1·§2·§5 전 지점 통일 확정 요청.
3. **provenance 컬럼(`src_audit_id`)**: 모델담당 검토 권고(§5 주석). 채택 시 멱등·추적성 강화, 미채택 시 복합키 가드로 진행.
4. **chg_actn_cd 파생 규칙**: fee=ROLLBACK/SWITCH(reason 접두), promo=INSERT/TOGGLE(old NULL 여부). 소스 실재 필드 파생이라 임의값 아님 — 품질담당 확인 요청.
5. **이중기록 무기한 유지**: 구 audit 폐기는 신규 관리자 화면·뷰 검증 후 별도 로드맵. 이번 범위는 수렴 창구 개설까지.
