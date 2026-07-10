# 01. 모델 설계서 — 운영 설정 변경 감사 이력 (cfg_chg_hist)

- **작성**: DA 모델담당 (da-modeler)
- **작성일**: 2026-07-10
- **상태**: 명명 확정(표준 1차 통과, `02_standards_naming-review.md` 조건부 통과 반영) — 품질(quality) 게이트 대기. 명명 확정 조건=표준단어 10·도메인 2 등재(리더 확정 단계 이행).
- **관련 산출물**: `01_modeler_ddl.sql`
- **실 DB 미확인**: 본 설계는 `sql/` 디렉토리 DDL 파일 기준. 운영/스테이징 실 DB 스키마는 미조회.

---

## 1. 업무 요구 (재정의)

관리자 운영 설정 토글의 변경을 감사 추적한다. 대상은 `fee_mode_config`(BEAN|PI 요금제 전환), `promo_fee_config`(오픈기념 프로모 ON/OFF·기간), 그리고 **향후 추가될 운영 설정 테이블 전반**("등")이다. 남길 정보: **변경 주체(관리자)·변경 시각·대상 설정(테이블·행)·변경 유형·전값·후값·변경 사유**.

명시된 문제: "현재는 현재값만 있고 이력이 없어 누가 언제 바꿨나 추적 불가."

---

## 2. 중복 검토 결과 (기존 유사 테이블 조사)

`sql/` 전체에서 `audit`·`hist`·`_log` 성격 테이블을 전수 grep 하여 4종을 확인했다.

| 기존 테이블 | 파일 | 성격 | 본 요구와의 관계 |
|---|---|---|---|
| `fee_mode_audit` | sql/140 | **fee_mode_config 전용** 감사. `old_mode`/`new_mode` 스칼라 컬럼 쌍 + 시스템4 + del_yn | ⚠️ 본 요구 대상의 **일부를 이미 커버**. 단 fee_mode 전용 스키마 |
| `promo_fee_audit` | sql/149 | **promo_fee_config 전용** 감사. `old_*`/`new_*` 컬럼 쌍 6개(active_yn·start_dtm·end_dtm) + 시스템4 + del_yn | ⚠️ 본 요구 대상의 **일부를 이미 커버**. 단 promo 전용 스키마 |
| `std_audit_log` | sql/009 | **범용** 감사. `tgt_tbl`+`tgt_id`+`action_cd`+JSONB `old_val`/`new_val`. 트리거 기반, 순수 append-only(시스템 컬럼·del_yn 없음). std_* 3개 테이블에만 트리거 연결 | ✅ **범용 감사 패턴의 프로젝트 선례**. 단 `std_` 도메인(표준사전) 전용 명명·트리거 하드코딩이라 설정 도메인 직접 수용 부적합 |
| `bean_audit_log` | sql/069 | Bean 어드민 수동조정 전용. 시스템4 + del_yn + 도메인 스칼라 컬럼 | 참고용(감사 테이블 관례 확인) |

### 결론: 신설이 정당함 (단, 범용 패턴 계승)

- **"운영 설정 변경"을 담는 범용 감사 테이블은 없다.** fee/promo audit은 각 설정 전용(설정마다 새 테이블·스키마 파편화), std_audit_log는 표준사전(std_*) 도메인 전용이다.
- 따라서 **설정(config) 도메인의 범용 단일 감사 테이블 1개를 신설**한다. std_audit_log의 범용 컬럼 패턴(`tgt_tbl`+`tgt_id`+`action`+JSONB `old/new`)을 계승해 일관성을 유지한다.
- 기존 `fee_mode_audit`·`promo_fee_audit`은 **비파괴 유지**한다. 신규 범용 테이블은 향후 신규 설정 + 두 기존 설정을 수렴하는 통합 창구 역할이며, 기존 두 audit의 과거 데이터 백필/RPC 전환 여부는 이행담당·리더가 별도 판정한다(§7).

---

## 3. 논리 모델

### 3.1 핵심 판단 — 범용 단일 vs 설정별 개별

**선택: 범용 단일 감사 테이블.**

| 방식 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 설정별 개별(fee_mode_audit 패턴 확장) | 컬럼이 설정 속성과 1:1이라 조회 시 JSON 파싱 불필요, 타입 안전 | **설정 추가마다 신규 테이블 필요** → 스키마 파편화. "등"(무한 확장) 요구와 배치 | ✗ |
| **범용 단일(std_audit_log 패턴 계승)** | 설정이 늘어도 테이블 불변, 통합 조회('전체 설정 변경 타임라인') 단순, "누가 무엇을" 감사 관점 자연스러움 | 설정마다 속성이 달라 전값/후값을 정형 컬럼으로 못 담음 → JSONB 필요, 조회 시 `->>'키'` 파싱 | ✓ **채택** |

범용성의 핵심은 **전값/후값을 JSONB로 저장**하는 데 있다. fee_mode는 단일 속성(`active_mode`), promo는 다속성(`active_yn`+`start_dtm`+`end_dtm`)이라 정형 `old_/new_` 컬럼 쌍(promo_fee_audit 방식)으로는 설정별로 스키마가 갈라진다. JSONB 스냅샷이면 어떤 설정이든 동일 컬럼에 수용된다(std_audit_log가 이미 이 방식으로 std_dic/dom/term 3종을 단일 테이블에 담았다).

### 3.2 엔터티 정의

**엔터티: 운영설정변경이력 (config change history)** — 관리자가 운영 설정 행을 변경할 때마다 1건 발생하는 append-only 이벤트.

| 논리 속성 | 물리 컬럼(초안) | 타입 | Null | 설명 |
|---|---|---|---|---|
| 이력식별자 | `hist_id` | UUID PK | N | gen_random_uuid() |
| 대상설정테이블명 | `cfg_tbl_nm` | TEXT | N | 'fee_mode_config' \| 'promo_fee_config' \| ... (std_audit_log의 `tgt_tbl` 대응) |
| 대상설정행식별자 | `cfg_tgt_id` | TEXT | N | 변경된 config 행의 PK 값(fee_mode_id/promo_fee_id). 타입 상이 대응 위해 TEXT(std_audit_log `tgt_id` 계승). ⭐표준 1차 판정으로 `cfg_row_id`→`cfg_tgt_id` 확정(ROW 예약어 회피·tgt 계승) |
| 변경행위코드 | `chg_actn_cd` | VARCHAR(20)+CHECK | N | INSERT \| UPDATE \| SWITCH \| TOGGLE \| ROLLBACK \| DELETE. std_audit_log `action_cd` 확장 |
| 변경전값 | `old_val` | JSONB | Y | 변경 전 행 스냅샷 또는 변경 델타. INSERT면 NULL |
| 변경후값 | `new_val` | JSONB | Y | 변경 후 행 스냅샷 또는 변경 델타. DELETE면 NULL |
| 변경사유내용 | `chg_rsn_cont` | TEXT | Y | fee/promo의 `reason_memo` 대응. 예: '메인넷 등재 준비', '오픈기념행사' |
| 변경자식별자 | `chgr_id` | TEXT | N | 변경 수행 관리자 usr_id (업무 감사 데이터, std_audit_log `chgr_id` 계승) |
| 변경일시 | `chg_dtm` | TIMESTAMPTZ | N | 변경 시각. **업무 감사 데이터**(정렬·필터 대상) — 시스템 `reg_dtm`과 의미 구분 |
| 논리삭제여부 | `del_yn` | CHAR(1)+CHECK | N | 'N' 기본 |
| 논리삭제일시 | `del_dtm` | TIMESTAMPTZ | Y | |
| 등록자/등록일시/변경자/변경일시 | `regr_id`·`reg_dtm`·`modr_id`·`mod_dtm` | 시스템 컬럼 4개 | N | audit 전용. 업무 판정 금지 |

**타입 근거(지시서 요구)**:
- **전값/후값 = JSONB**: 위 §3.1대로 설정별 속성 개수·형태가 달라 범용 수용을 위해 정형 스칼라가 아닌 JSONB. std_audit_log 선례와 동일. 조회는 `old_val->>'active_mode'`, `new_val->>'promo_active_yn'` 등으로 접근.
- **cfg_tgt_id = TEXT**: 대상 설정 행 PK가 UUID지만, 향후 non-UUID PK 설정 테이블도 수용하기 위해 TEXT(std_audit_log가 `tgt_id TEXT`로 동일 결정). ⭐컬럼명은 표준 1차 판정으로 `cfg_row_id`→`cfg_tgt_id` 확정.
- **chg_actn_cd = VARCHAR(20)**: 코드성 짧은 값. CHAR(n) 금지 규칙 준수(공백 패딩 → `.eq` 미스매치 방지, [no-char-for-text-types]).
- **chg_dtm = TIMESTAMPTZ**: `_dtm`은 TIMESTAMPTZ 강제 규칙.

### 3.3 시스템 컬럼 + del_yn 포함 결정 (프로젝트 관례 정합)

`_hist`/`_audit` 접미사라도 **시스템 컬럼 4개 + del_yn을 포함**한다. 근거:
- 최신·다수 관례(`mps_txn_hist` sql/029, `fee_mode_audit` sql/140, `promo_fee_audit` sql/149, `bean_audit_log` sql/069)가 모두 `_hist`/`_audit`임에도 시스템4 + del_yn을 포함하고, **업무 시각 컬럼**(`txn_dtm`·`changed_at`)으로 정렬한다.
- 초기 `std_audit_log`(sql/009)만 예외적 순수 append-only(시스템 컬럼·del_yn 없음). 프로젝트가 진화하며 audit에도 표준 템플릿을 일관 적용하는 쪽으로 굳었다.
- Hook R1(시스템 컬럼 4개)은 `_log`/`_hist` 예외를 명시하지 않으므로, 포함이 Hook 통과에 안전하다(R6의 del_yn 예외만 `_log`/`_hist`에 적용).

**중복 컬럼 주의(의도된 설계)**: `chgr_id`(업무 감사 주체) ↔ `regr_id`(시스템 등록자), `chg_dtm`(업무 감사 시각) ↔ `reg_dtm`(시스템 등록시각)은 값이 같을 수 있으나 의미가 다르다. promo_fee_audit이 동일하게 `changed_by`+`regr_id`, `changed_at`+`reg_dtm`을 공존시킨다(sql/149 주석: "changed_at = 감사 본연의 업무 데이터, 시스템 컬럼 아님 — 정렬 허용"). 업무 판정·정렬은 `chg_dtm`으로, `reg_dtm`은 순수 시스템 audit으로만 사용한다.

### 3.4 관계·카디널리티

```
fee_mode_config (1) ──< (N) cfg_chg_hist   [cfg_tbl_nm='fee_mode_config', cfg_tgt_id=fee_mode_id]
promo_fee_config (1) ──< (N) cfg_chg_hist  [cfg_tbl_nm='promo_fee_config', cfg_tgt_id=promo_fee_id]
sys_user (1) ──< (N) cfg_chg_hist          [chgr_id=usr_id, 변경 주체 관리자]
```

- **FK 제약 없음**: 대상 설정 테이블이 복수·이질적(다형 참조, `cfg_tbl_nm`+`cfg_tgt_id` 조합)이라 단일 FK로 표현 불가 — 다형 참조는 FK 부적합. `chgr_id → sys_user`도 감사 로그의 불변성(원 주체 삭제돼도 이력 보존) 원칙상 FK 미설정. **이 테이블은 PostgREST 임베디드 조인 대상이 아니다**(감사 이력은 관리자 화면에서 별도 조회+Map 병합) → FK 무설계가 이번 건에선 적합([no-postgrest-embedded-join-fk-less] 원칙 준수). std_audit_log·fee_mode_audit·promo_fee_audit 모두 FK 없음(선례 일치).

### 3.5 정규화

3NF 준수. 전값/후값 JSONB는 "다속성 설정을 단일 범용 컬럼에 담기 위한 의도적 반구조화"이며 정규화 위반이 아니다(감사 스냅샷은 시점 불변 사실의 원자값으로 취급). 파생·중복 컬럼 없음.

---

## 4. 조회 패턴 → 인덱스 설계

| # | 조회 패턴 | 인덱스 |
|---|---|---|
| Q1 | 특정 설정을 누가 언제 바꿨나 (설정별 최신순) | `(cfg_tbl_nm, chg_dtm DESC) WHERE del_yn='N'` |
| Q2 | 특정 관리자가 무엇을 바꿨나 (감사 "누가") | `(chgr_id, chg_dtm DESC) WHERE del_yn='N'` |
| Q3 | 최근 N일 전체 설정 변경 타임라인 | Q1 인덱스의 `chg_dtm` prefix로 커버 가능하나, 전 설정 횡단이면 `(chg_dtm DESC) WHERE del_yn='N'` 별도 |
| Q4 | 특정 설정 행의 변경 계보 | `(cfg_tgt_id)` |

- 활성행 부분 인덱스(`WHERE del_yn='N'`) 표준 적용.
- JSONB(`old_val`/`new_val`) 내부 값 검색 요건은 현재 없음(설정별·관리자별·시각범위가 주 패턴) → GIN 인덱스 **미포함**. 향후 "특정 값으로 변경된 건 검색" 요건 발생 시 `GIN(new_val jsonb_path_ops)` 추가.
- 부분일치 텍스트 검색(pg_trgm) 대상 컬럼 없음(사유 전문검색 요건 미발생) → trgm 미적용.

---

## 5. 변경 기록 방식 — 트리거 vs RPC 내 INSERT (비교·권고)

| 방식 | 장점 | 단점 |
|---|---|---|
| **RPC 내 명시적 INSERT** (권고) | 변경 주체(`chgr_id`)·사유(`chg_rsn_cont`)를 파라미터로 명확히 전달. RPC 트랜잭션 원자성. 기존 fee/promo RPC 패턴과 동일 | RPC를 우회한 직접 UPDATE는 미포착 |
| 트리거(AFTER I/U/D) | 우회 UPDATE도 포착, 기록 누락 방지. std_audit_log 방식 | 변경 주체를 세션 변수(`SET LOCAL app.current_admin`)로 넘겨야 함 → 관리자 컨텍스트 배관 필요, 사유 전달 곤란 |

**권고: RPC 내 명시적 INSERT를 1차 표준.** 근거:
- 설정 변경은 항상 관리자 RPC(`fn_switch_fee_mode`·`fn_toggle_open_promo` 등)를 경유하고, **변경 사유 입력이 UX 요구**라 파라미터 전달이 자연스럽다.
- 트리거는 `chgr_id`·사유를 세션 변수로 우회 전달해야 해 관리자 컨텍스트 배관이 필요하고, 사유는 사실상 전달 불가.
- 우회 직접 UPDATE 위험은 이 프로젝트가 서비스롤 단일 접근(RLS 비활성)이라 낮다.

구현: 각 설정 RPC가 호출하는 공통 헬퍼 `fn_log_cfg_change(p_cfg_tbl_nm TEXT, p_cfg_tgt_id TEXT, p_chg_actn_cd VARCHAR, p_old_val JSONB, p_new_val JSONB, p_chgr_id TEXT, p_chg_rsn_cont TEXT)`를 함께 제공한다(DDL 초안 포함). 안전망으로 트리거를 추가 도입할 수는 있으나 이번 범위에서는 헬퍼만 포함하고 트리거는 옵션으로 남긴다.

---

## 6. 사용 단어·도메인 약어 목록 (표준 1차 검증 완료 반영)

표준담당 검증 결과(`02_standards_naming-review.md`, 조건부 통과)를 반영한다. 아래 표준단어 10개·표준도메인 2개는 **등재 전제**(등재 SQL은 리더가 확정 단계에서 통합, `/admin/std/words` 즉시승인 우회)이며, 등재를 조건으로 명명이 확정된다.

| 물리 약어 | 논리 의미 | 표준 등재 상태 | 근거·선례 |
|---|---|---|---|
| `sys` (접두사) | 시스템 | ✅ 등록 접두사 | Hook R2 등록 접두사. 운영 설정=시스템 성격 |
| `cfg` | 설정(config) | 🆕 표준단어 등재 전제 | 설정 도메인 신규(CFG) |
| `chg` | 변경(change) | 🆕 표준단어 등재 전제 | mod(수정)과 구분되는 변경행위 |
| `hist` | 이력(history) | 🆕 표준단어 등재 전제 | mps_txn_hist 선례 정식화 |
| `tbl` | 테이블 | 🆕 표준단어 등재 전제 | std_audit_log `tgt_tbl` 정식화 |
| `tgt` | 대상(target) | 🆕 표준단어 등재 전제 | std_audit_log `tgt_id`/`tgt_tbl` 정식화 (`row` 폐기·예약어 회피) |
| `nm` | 이름 | ✅ 등록 도메인 약어 | 표준 도메인 |
| `id` | 식별자 | ✅ 등록 도메인 약어 | 표준 도메인 |
| `actn` | 행위(action) | 🆕 표준단어 등재 전제 | std_audit_log `action_cd` 축약 표준화 |
| `cd` | 코드 | ✅ 등록 도메인 약어 | 표준 도메인 |
| `old` / `new` | 전(前) / 후(後) | 🆕 표준단어 등재 전제 | std_audit_log `old_val`/`new_val` 계승 |
| `val` | 값(JSONB) | 🆕 표준도메인 등재 전제 | R7 경고 해소 위해 VAL(JSONB) 도메인 등재 + Hook `DOMAIN_SUFFIXES` `'val'` 추가 |
| `rsn` | 사유(reason) | 🆕 표준단어 등재 전제 | fee/promo `reason_memo` 대체 표준어 |
| `cont` | 내용(content) | △ Hook 등록·정본 명문화 전제 | 정본 §1-2 표 추가(문서-Hook 동기화) |
| `chgr` | 변경자(changer) | 🆕 표준단어 등재 전제 | std_audit_log `chgr_id` 정식화. REGR/MODR 계열 복합어 |
| `dtm` | 일시 | ✅ 등록 도메인 약어 | 표준 도메인 |

**미확정 3건 → 표준 1차 판정으로 전건 확정**:
1. 접미사: **`_hist` 확정** — Hook `LOG_TABLE_RE`가 `_hist`를 append-only 로그로 인식(`_audit` 미인식), R6 면제·의미 부합.
2. 전/후 값: **`old_val`/`new_val` 확정** — std_audit_log 범용 선례 계승. `val` 도메인 등재가 확정 조건(R7 경고 해소).
3. 대상 행: **`cfg_row_id` → `cfg_tgt_id` 재명명 확정** — std_audit_log `tgt` 계승·ROW 예약어 회피. 본 산출물에 반영 완료(DDL·헬퍼 파라미터·인덱스·주석 일괄).

**표준담당 부대 조건(리더 확정 단계 이행)**: 표준단어 10개(CFG·CHG·HIST·TBL·TGT·ACTN·RSN·CHGR·OLD·NEW)·표준도메인 2개(VAL JSONB·CONT TEXT) 등재, Hook `DOMAIN_SUFFIXES`에 `'val'` 추가 + 정본 §1-2 동기화. 이행 시 경고 0 완전 준수 달성.

---

## 7. 이행·후속 협의 포인트 (migration/quality/leader)

- **이행담당**: (a) 기존 `fee_mode_audit`·`promo_fee_audit` 과거 데이터를 신규 테이블로 백필할지, (b) fee/promo RPC를 신규 헬퍼 호출로 전환(과도기 이중 기록 → 기존 audit 점진 폐기)할지 판정 필요. **본 설계 권고: 신규 테이블은 비파괴 신설, 기존 audit 수렴은 별도 이행 과제.** JSONB 스냅샷 규약(전체 행 vs 변경 델타)도 이행 시 통일 필요.
- **품질담당**: JSONB 값의 키 명명 규약(내부 키는 원본 컬럼명 그대로 vs 표준용어) 점검 요청.
- **명명 확정 전 DDL 미확정**: `01_modeler_ddl.sql`은 초안. 표준 검증 결과에 따라 컬럼명 수정 후 리더가 `sql/176`으로 이동.
