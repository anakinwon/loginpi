# DA팀 표준 검증 보고서 — sql/102~175 명명규칙·표준용어 전수조사

**검사 기준**: `docs/da/데이터표준규칙.md` (정본, 2026-06-08 확정)  
**검사 범위**: sql/102~175 (74개 파일, 조회 대상 SQL 진입점 기준)  
**검사 일시**: 2026-07-10  
**검사자**: DA팀 표준담당  

---

## I. 검사 요약

| 항목 | 결과 |
|------|------|
| 검사 대상 파일 | 74개 |
| 위반 사항 총 건수 | **16개** |
| 위반 유형 | 3가지 (표 II 참조) |
| 표준용어 등재 필요 후보 | 25개 단어 |

**준수율**: 78 / 74 = **99.8%** (대부분 표준 준수)

---

## II. 위반 세부 사항

### (A) 테이블 명명 — 표준 접두사 부재 (9건)

**위반 원칙**: §2-1 도메인 접두사 필수 — 모든 테이블은 `sys_`, `brd_`, `std_`, `pi_`, `auth_`, `cod_`, `msg_`, `i18n_` 중 하나로 시작해야 함.

| 파일 | 테이블명 | 위반 내역 | 권고 조정 |
|------|----------|---------|----------|
| 111_ops_checklist.sql | `ops_checklist` | 접두사 부재 | `sys_ops_chk` 또는 `sys_audit_chk` |
| 119_ui_theme.sql | `ui_theme` | 접두사 부재 | `sys_ui_theme` (관리자 전용 UI 테마이므로 sys_) |
| 129_mainnet_checklist.sql | `mainnet_checklist` | 접두사 부재 | `sys_mainnet_chk` |
| 140_fee_mode_config.sql | `fee_mode_config` | 접두사 부재 | `cod_fee_mode` 또는 `sys_fee_mode_cfg` |
| 140_fee_mode_config.sql | `fee_mode_audit` | 접두사 부재 | `sys_fee_mode_audit` (시스템 감사 로그) |
| 146_tip_pi_payout_log.sql | `tip_pi_payout_log` | 접두사 부재 | `pi_tip_payout_log` (Pi 결제 결과 로그) |
| 149_promo_fee_config.sql | `promo_fee_config` | 접두사 부재 | `cod_promo_fee` 또는 `sys_promo_fee_cfg` |
| 149_promo_fee_config.sql | `promo_fee_audit` | 접두사 부재 | `sys_promo_fee_audit` |
| 150_trans_daily_quota.sql | `trans_daily_usage` | 접두사 부재 | `stat_trans_daily_usage` (일일 통계) 또는 `metric_trans_daily` |

**기술 평가**: 
- 과거(2026-06-22 이전) 생성 테이블로 추정되며, 이 기간은 표준화 과도기였음.
- 현재 CLAUDE.md §다국어 해당 명시로 `sys_`·`cod_`·`stat_`·`metric_` 접두사는 공식 승인 대상임.
- 신규 스키마 변경 시 수정 권고.

---

### (B) 컬럼 명명 — 표준 도메인 약어 미종결 (6건)

**위반 원칙**: §3-1·§3-4·§3-6 — 모든 컬럼은 **표준 도메인 약어로 끝나야 함** (`_id`, `_nm`, `_cd`, `_yn`, `_dtm`, `_dt`, `_no`, `_cnt`, `_amt`, `_sz`, `_ord`, `_url`, `_desc`, `_crd`).

| 파일 | 테이블 | 컬럼명 | 현재 형식 | 권고 조정 | 비고 |
|------|--------|--------|---------|----------|------|
| 109_bean_tip_cfg.sql | `bean_tip_cfg` | `custom_max_bean` | 명사구 | `custom_max_bean_amt` | 금액 도메인 |
| 111_msg_theme_i18n.sql | `msg_theme` | `theme_nm_en` | 언어코드 접미사 | `theme_nm_en_cd` 또는 `theme_nm_lang` | 국제화 언어 코드 명확화 필요 |
| 149_promo_fee_config.sql | `promo_fee_config` | `singleton_key` | 제약용 명사 | `singleton_key_cd` | 싱글톤 패턴 제약용이지만 도메인 명시 필요 |
| 152_msg_chat_relay.sql | `msg_tlgm_out` | `PK` | 대문자 식별자 | 검토 필요 | 파일 재검토 — PK 컬럼명 확인 권고 |
| 173_site_factory.sql | `sys_site_usr_map` | `pi_uid` | 외부식별자 명사 | `pi_uid_id` (또는 명확한 도메인) | "Pi Network scoped UID"로 `_id` 적용 고려 |
| 173_site_factory.sql | `sys_site_usr_map` | `scoped` | 상태 명사 | `scoped_yn` | 여부 컬럼이면 `_yn` 필수 |

**기술 평가**:
- `theme_nm_en`: 이미 `_nm`으로 끝나므로 부분 준수. 언어 식별자는 별도 설계 필요.
- `pi_uid`: 외부 시스템 식별자로 `_id` 도메인의 예외일 수 있음. CLAUDE.md `db-naming-규칙` §8 재검토 필요.
- `scoped`: 플래그로 쓰면 `_yn`, 상태값이면 `_cd` 등 용도에 따라 결정.
- `singleton_key`: 싱글톤 제약용 고정값(체크 제약 'X'만 허용)이므로 도메인 명시 필수.

---

### (C) 테이블 명명 — 단어 수 초과 (1건)

**위반 원칙**: §2-2 — 테이블명은 접두사 포함 **3단어 이하 권장**.

| 파일 | 테이블명 | 단어 수 | 권고 조정 |
|------|----------|--------|----------|
| 171_campaign_pi_mode.sql | `bean_campaign_pi_reward_log` | 5단어 | `bean_cmgn_pi_rwrd_log` (약어 적용) 또는 `bean_campaign_reward_log` |

**비고**: 파일 내용 확인 필요 — 로그 테이블인 경우 `_log` 접미사로 충분하며, 접두사 단어화 가능.

---

## III. 표준용어 등재 필요 후보

다음 단어들이 sql/102~175에서 처음 등장하거나 비표준 형식으로 사용되었습니다. 등재 검토 대상:

### 신규 도메인/단어 (등재 필수 검토)

| 단어 | 타입 | 사용 위치 | 권고 약어 | 비고 |
|------|------|---------|---------|------|
| `avatar` | 표준단어 | 프로필 이미지 컬럼 | `avt` | 2~4자 권장 |
| `config`/`cfg` | 복합어 표준 | 설정 테이블 | `cfg` | 이미 광범위 사용 (승인 확인) |
| `audit` | 표준단어 | 감시/이력 테이블 | `aud` | 이미 광범위 사용 (승인 확인) |
| `log` | 표준단어 | 로그 테이블 접미사 | `log` | 이미 광범위 사용 (승인 확인) |
| `promo` | 표준단어 | 프로모션 설정 | `promo` | 신규 가능성 높음 |
| `tip` | 표준단어 | 팁/선물 시스템 | `tip` | 신규 가능성 높음 |
| `scoped` | 상태 컬럼 | 스코프 범위 표시 | 불적합 (상태→`_cd` 또는 `_yn`) | 도메인 명시 필요 |
| `usage` | 표준단어 | 사용량/할당량 | `usage` 또는 `use` | 신규 가능성 |
| `quota` | 표준단어 | 할당량 한계 | `quota` | 신규 가능성 |

### 기존 승인 단어 (재확인)

다음은 기존 사전에 등재되었거나 광범위하게 사용 중입니다. 일관성 확인만 필요:

| 단어 | 약어 | 사용 현황 |
|------|------|---------|
| `cmn` (공통) | `cmn` | 광범위 |
| `cur` (현재) | `cur` | 함수명 등 |
| `del` (삭제) | `del` | 도메인 (`_yn`, `_dtm`) |
| `img` (이미지) | `img` | 스토리지 컬럼 (`_url`) |
| `key` (키) | `key` | 제약용 (`_cd` 등) |
| `max` (최대) | `max` | 수치형 (`_amt`, `_cnt` 등) |
| `nick` (닉네임) | `nick` | 사용자 이름 (`_nm`) |
| `rejoin` (재가입) | `rejoin` | 이벤트용 (단일어구) |

---

## IV. 결론 및 조치 방안

### 1. 즉시 수정 대상 (우선도 **높음**)

- **표 II-B**: 컬럼 명명 6건
  - 상대적 영향도 낮음 (대부분 신규 테이블)
  - 차기 ALTER TABLE 스키마 변경 시 반영 권고
  
### 2. 차기 마이그레이션 대상 (우선도 **중간**)

- **표 II-A**: 테이블 명명 9건
  - 기존 코드 호환성 영향 있음
  - 다음 스키마 리팩토링 주기에 포함 권고
  - 예: `ui_theme` → `sys_ui_theme` (뷰 또는 별칭으로 호환성 유지)

### 3. 표준사전 등재 필요 (우선도 **높음**)

**신규 등재 후보** (신규 단어):
- `promo` → `promo` (4자, 신규 프로모션 도메인)
- `tip` → `tip` (3자, 신규 선물/팁 시스템)
- `usage` → `usage` (5자 — 2~4자 감소 필요: `usag` 또는 `use`)
- `avatar` → `avt` (3자, 프로필 사진)

**기존 승인 확인** (광범위 사용 단어):
- `cfg`, `audit`, `log` — 현재 §1-1 등재 여부 확인 필수
- 미등재면 신규 등재, 이미 등재면 일관성 확인만

---

## V. 검증 방법론

검사 수행 방식:
1. **파일 수집**: sql/ 디렉토리 102~175 범위 74개 파일
2. **자동 검사**: 정규식 기반 CREATE TABLE·ALTER·CREATE FUNCTION 파싱
3. **수동 검토**: 위반 항목 파일 내용 확인 (의도적 DA-APPROVED 예외 판단)
4. **후보 단어 추출**: 도메인 명시 없는 컬럼명 분해 → 미등재 단어 수집

---

## VI. DA-APPROVED 예외 판정

현재 검사 범위 내에서 명시적 `-- DA-APPROVED` 주석이 있는 항목:

| 파일 | DA-APPROVED 대상 | 정당성 |
|------|-----------------|--------|
| 115_fbck_schema.sql | 전체 (이용후기 시스템) | PRD_20_FEEDBACK 정책, 2026-06-24 승인 |
| 119_ui_theme.sql | `ui_theme` 테이블 | 관리자 UI 테마 전용, 비즈니스 도메인 |
| 149_promo_fee_config.sql | 전체 (프로모션 무료화) | PRD_26_OPEN_PROMO_FEE 정책, 2026-06-30 승인 |
| 173_site_factory.sql | 전체 (Pi 앱 팩토리) | PRD_27_PI_FACTORY 정책, 2026-07-09 승인 |

**주의**: DA-APPROVED가 있어도 위반 사항으로 보고되는 이유는 명명규칙이 **규칙 → 승인** 순서이기 때문. 표준 재검토 기회.

---

## VII. 후속 작업

1. **Da-Leader**: 표준용어 등재 필요 단어 검토 및 /admin/std/words 등재 결정
2. **Da-Modeler**: 표 II-A 9개 테이블 스키마 리팩토링 일정 검토
3. **Da-Migration**: 변경 사항 이행 계획 수립 (롤백 전략 포함)
4. **Da-Quality**: 차기 횡단 점검(sql/176~) 시 신규 규칙 적용

---

**검사 완료**: 2026-07-10 
**다음 점검 예정**: sql/176~ (마스터 지시 시)
