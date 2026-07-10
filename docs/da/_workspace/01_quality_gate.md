# DA 품질 점검 게이트 판정 보고서

**점검 일시**: 2026-07-10
**점검 범위**: sql/102 ~ sql/174 (78개 파일)
**점검 기준**: docs/da/품질점검기준서.md · docs/da/데이터표준규칙.md
**직전 보고서**: docs/da/reports/2026-06-23_DA중간점검보고서.md

---

## 점검 요약

| 항목 | 결과 |
|------|------|
| **총 파일 수** | 78개 |
| **CREATE TABLE 파일** | 21개 (시스템 컬럼 4종·논리삭제 필수) |
| **DELETE 파일** | 3개 (물리 DELETE 예외 평가) |
| **DML 파일** | 54개 (UPDATE/INSERT/함수/기타) |
| **P1 위반** | **0건** ✓ |
| **P2 위반** | **1건** (근거 문서 참조 필요) |
| **P3 위반** | **0건** ✓ |
| **DA-APPROVED 예외** | 13건 (모두 사유 타당) |
| **게이트 판정** | **PASS** |

---

## P1(Critical) 점검 결과

### 시스템 컬럼 4종 준수 여부

21개 CREATE TABLE 파일 전수 검사:
- ✓ `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`
- ✓ `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- ✓ `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`
- ✓ `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`

**결과**: 모두 테이블 마지막 4개 컬럼 위치 정합 (P1 전수 통과)

### 논리삭제 규칙 준수 여부

- ✓ 신규 테이블: `del_yn CHAR(1) DEFAULT 'N'` + `del_dtm TIMESTAMPTZ` 모두 구현
- ✓ 기존 ALTER: 시스템 컬럼 추가(sql/102) 및 컬럼 확장(sql/152) 정상
- ✓ 물리 DELETE: 3건 모두 DA-APPROVED 주석으로 정당화

**결과**: P1 전수 통과

### 물리 DELETE 예외 적정성 평가

| 파일 | 사유 | 근거 조항 | 판정 |
|------|------|----------|------|
| sql/104_log_admin_monitor.sql | 로그성 테이블 정리(7일 최소 보존) | PURGEABLE 화이트리스트 + 이중 가드 | ✓ 적정 |
| sql/123_ui_theme_dedupe.sql | 중복 시드 정리(정상 데이터 아님) | 재발 방지 유니크 인덱스 추가 | ✓ 적정 |
| sql/170_metric_retention.sql | 휘발성 관측 데이터(업무 아님) | PRD_22 보존 정책 7일 기준 | ✓ 적정 |

**결과**: 예외 처리 모두 타당 (P1 통과)

---

## P2(Major) 점검 결과

### 표준용어 형식 확인

체크리스트: 모든 컬럼명이 `단어1(_단어n)_표준도메인` 형식인가?

**의심 항목**: sql/109_bean_tip_cfg.sql

| 파일 | 컬럼명 | 형식 | 상태 |
|------|--------|------|------|
| sql/109 | `custom_max_bean` | `custom_max` + `bean` | 재검토 필요 |

**분석**:
- 컬럼명: `custom_max_bean` = `custom`(표준단어, 관례 '직접입력') + `_max`(범위) + `_bean`(도메인?)
- 표준도메인 검토: `bean`이 표준도메인으로 등록되어 있는가?
  - 정본 데이터표준규칙.md 제1-2절: `amt`, `cnt`, `no` 등은 도메인이지만 `bean` 명시 없음
  - 기존 선례: `amt_bean`(금액 Bean 단위)은 `amt`(도메인) + `_bean`(단위 한정자) 패턴
- 결론: `custom_max_bean`은 `bean` 자체를 도메인으로 보는 해석이 필요
  - DA-APPROVED 주석에서 "표준약어 'tip'(선물/팁) + 'cfg'(설정)"로 신규 약어 승인만 있고 도메인 승인 명시 없음
  
**P2 판정**: **1건 — 표준도메인 형식 재검토 필요**
- **근거**: 데이터표준규칙.md §1-3 (표준용어는 **표준도메인으로 끝나야 함**)
- **권고**: `custom_max_bean` 컬럼을 `custom_max_amt` 또는 신규 표준도메인 등재 후 정규화

---

## P3(Minor) 점검 결과

### 코드성 컬럼 CHECK 제약

**검사 범위**: `_cd`, `_yn`, `_tp` 컬럼들

| 파일 | 코드 컬럼 | CHECK 제약 | 결과 |
|------|----------|-----------|------|
| sql/111 | `prio_cd`, `owner_cd`, `status_cd` | ✓ 모두 구현 | 통과 |
| sql/113 | `target_tp_cd`, `reason_cd`, `status_cd` | ✓ 모두 구현 | 통과 |
| sql/119 | `actv_yn`, `lock_yn` | ✓ CHECK 구현 | 통과 |
| 모든 테이블 | `del_yn` | ✓ CHECK('Y','N') | 통과 |

**결과**: P3 전수 통과 (CHECK 제약 미흡 없음)

### 메타데이터(COMMENT)

- ✓ 모든 CREATE TABLE에 TABLE·COLUMN 단위 COMMENT 완전 기재
- ✓ 함수 주석도 완전 구현

**결과**: P3 전수 통과

---

## DA-APPROVED 예외 평가

| 번호 | 파일 | 예외 사유 | 근거 §번호 | 타당성 | 의견 |
|------|------|----------|-----------|--------|------|
| 1 | sql/102 | 마스터 데이터 시스템컬럼 필수 | 통합정책 | ✓ 적정 | 논리삭제 정책 확대 |
| 2 | sql/104 | 로그 정리 물리 DELETE | P1 정당화 | ✓ 적정 | 회계 원장 원천 배제 |
| 3 | sql/109 | 신규 도메인 bean_tip_cfg | 도메인 등재 | ✓ 적정 | 단어는 승인, 도메인 재검토 |
| 4 | sql/110 | 신규 약어 dist(거리) | 표준단어 신규 | ✓ 적정 | 공간 도메인 표준어 |
| 5 | sql/111 | 신규 도메인 ops_ + chk | 문제영역 신설 | ✓ 적정 | 운영 메타 영역 정당화 |
| 6 | sql/113 | 신규 도메인 rpt_(신고) | 커뮤니티 기능 | ✓ 적정 | 신고 메타 영역 |
| 7 | sql/115 | 피드백 시스템 fbck_ | PRD_20 설계 | ✓ 적정 | 이용후기 도메인 |
| 8 | sql/116 | fbck 확장 테이블 2종 | 설계 연장 | ✓ 적정 | 카테고리·항목 구조 |
| 9 | sql/119 | UI 테마 설정 ui_theme | 관리자 스코프 | ✓ 적정 | 색상 토큰 JSONB |
| 10 | sql/122 | 분석 추적 stat_pageview | 관용 약어 유지 | ✓ 적정 | 웹 분석 표준 패턴 |
| 11 | sql/125 | 메트릭 시스템 sys_metric | 기술 용어 명확 | ✓ 적정 | API/성능/인증 계측 |
| 12 | sql/123 | 중복 시드 물리 DELETE | 정리 정당화 | ✓ 적정 | 재발 방지 인덱스 |
| 13 | sql/170 | 메트릭 보존 물리 DELETE | 휘발성 데이터 | ✓ 적정 | 회계 로그 원천 배제 |

**평가**: 13건 모두 사유 타당성 입증, P1 체크리스트 범위 내 승인 절차 정당 ✓

---

## 이전 보고서(2026-06-23) 대비 회귀 여부

### 주요 개선사항

1. **ALTER TABLE ADD COLUMN 표준화**:
   - sql/102(i18n_metadata_fix): 기존 테이블에 시스템컬럼 4종·논리삭제 추가
   - sql/152(msg_chat_relay): msg_noti_outbox·sys_user 확장
   - 이전 중간점검에서 식별한 "ALTER 검사 사각지대" 해소 완료 ✓

2. **신규 도메인 등재 규칙화**:
   - ops_(운영), rpt_(신고), fbck_(피드백) 등 신설 시 DA-APPROVED 주석으로 원인 명시
   - 이전 선례(lat/lng 좌표 사고) 학습 반영 ✓

3. **물리 DELETE 예외 이중 가드**:
   - sql/104 fn_log_table_purge: PURGEABLE 화이트리스트 + 7일 최소 보존
   - sql/170 fn_metric_purge: 메트릭 4종만 허용, 회계 원장 원천 배제
   - 이전 "회계 원장 물리삭제 금지" 원칙 강화 ✓

### 반복 위반 여부

- ✗ P1 위반: **0건** (이전도 0건 유지)
- ✓ P2 위반: **1건** (신규: `bean`도메인 형식 재검토)
- ✗ P3 위반: **0건** (이전도 0건 유지)

**결론**: 반복 위반 없음, 품질 유지 ✓

---

## 권고사항

### P2 위반 수정

| 위반 | 수정 방안 | 우선순위 |
|------|---------|----------|
| `custom_max_bean` 도메인 | 1. `bean_fee_plan` 선례에 맞춰 `custom_max_amt` 정규화 또는 2. `bean` 표준도메인 형식 승인 재신청 | 계획적 수정 |

### 표준용어 전수조사 결과

기존 누적분 스캔(Hook은 신규 DDL만 검사):

```sql
SELECT c.table_name, c.column_name, c.data_type
FROM information_schema.columns c
WHERE c.table_schema='public'
  AND c.column_name !~ '_(id|uid|nm|cd|yn|dtm|dt|no|cnt|amt|sz|ord|url|desc|txt|cont|key|pi|pct|seq|tp|sts|emoji|tag|crd)$'
  AND c.column_name NOT IN ('regr_id','reg_dtm','modr_id','mod_dtm','del_yn','del_dtm','id')
ORDER BY c.table_name, c.column_name;
```

**실행 필요**: Supabase 환경에서 실행하여 누적분 추가 위반 여부 확인 (DB 접근 불가로 미수행, 범위 축소)

---

## 최종 게이트 판정

### 📋 판정: **PASS** (차단 항목 없음)

**근거**:
- P1 위반: **0건** → 물리모델 수용
- P2 위반: 1건 (표준도메인 형식, 계획적 수정 권고 — 차단 아님)
- P3 위반: **0건** → 개선 과제 없음
- DA-APPROVED 예외: 13건 모두 타당성 입증 ✓

**조건**:
- P2 위반(bean_tip_cfg `custom_max_bean`)은 다음 주기 수정 계획 (로드맵 등재)
- 표준도메인 형식 정규화 미루지 말 것 (기술부채)

---

## 산출물

**최종 보고서**: docs/da/reports/2026-07-10_sql102-174범위전수조사.md (별도 정식 보고 예정)
**점검 데이터**: 이 문서
**재점검 필요**: 운영 DB 표준용어 전수조사 (Supabase 접근 가능 시점)

---

*작성자: DA 품질담당*
*최종 검토: 2026-07-10*
