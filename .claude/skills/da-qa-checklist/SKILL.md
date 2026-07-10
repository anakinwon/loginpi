---
name: da-qa-checklist
description: DDL·데이터 모델·메타데이터의 DA 표준 준수 품질 점검을 수행한다. 데이터 표준 점검, 명명규칙 검사, 품질 감사, 표준 준수 여부 확인 요청 시 사용. P1/P2/P3 체크리스트 기반 점검과 결과 보고서 작성 절차 포함.
---

# DA 품질 점검 수행

## 기준 문서 (반드시 먼저 읽기)

1. **`docs/da/품질점검기준서.md`** — 점검 절차 4단계 + P1/P2/P3 체크리스트 + 보고 양식
2. **`docs/da/데이터표준규칙.md`** — 규칙 정본 (위반 판정 근거)
3. `docs/da/reports/` — 직전 점검 보고서 (반복 위반 패턴 확인)

## 점검 절차

1. **Phase 1**: 위 기준 문서 파악
2. **Phase 2**: 점검 대상에 체크리스트 전 항목 적용 (표준사전·명명·시스템 컬럼·논리삭제·타입·메타데이터·무결성)
   - **컬럼 표준용어 종결 검사 필수** — 모든 컬럼이 `단어1(_단어n)_표준도메인` 형식인지, **반드시 표준도메인으로 끝나는지**(정본 §1-3). `CREATE TABLE`뿐 아니라 **`ALTER TABLE ADD COLUMN`으로 추가된 컬럼도 반드시 포함** (아래 사례 참조)
   - 컬럼에 쓰인 약어가 `std_dic`(표준단어)·`std_dom`(표준도메인)에 **실제 등록**됐는지 DB 조회로 역검증
3. **Phase 3**: 품질점검기준서.md §4 양식으로 결과 보고서 작성 → `docs/da/reports/YYYY-MM-DD_<제목>.md` 저장
4. **Phase 4**: P1 즉시 수정 / P2 계획 수정 / P3 개선 과제 / 예외는 DA 승인 절차

## 정기 전수조사 — 컬럼 표준용어 (분기 1회 권장)

표준도메인으로 끝나지 않는 컬럼을 DB에서 직접 스캔한다. Hook은 신규 DDL만 막으므로, 기존 누적분은 이 쿼리로 주기 점검한다.

```sql
SELECT c.table_name, c.column_name, c.data_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema='public' AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
WHERE c.table_schema='public'
  AND c.column_name !~ '_(id|uid|nm|cd|yn|dtm|dt|no|cnt|amt|sz|ord|url|desc|txt|cont|key|pi|pct|seq|tp|sts|emoji|tag|crd|val)$'
  AND c.column_name NOT IN ('regr_id','reg_dtm','modr_id','mod_dtm','del_yn','del_dtm','id')
ORDER BY c.table_name, c.column_name;
```

> 도메인 약어 화이트리스트는 `.claude/hooks/da-ddl-guard.mjs`의 `DOMAIN_SUFFIXES`와 **반드시 동일하게 유지**한다(한쪽만 갱신 금지).

## 재발방지 사례 — 위경도 컬럼 (2026-06-12)

**사고**: `lat`/`lng` 컬럼(`mps_shop`·`usr_loc_hist`·`mps_item`)이 표준단어·표준도메인·표준용어 3대 미준수로 들어감. 원인:
1. `ALTER TABLE ADD COLUMN`이 Hook R7 검사 사각지대였음 → **Hook에 ALTER ADD COLUMN 검사 추가**로 해소
2. `DA-APPROVED` 주석이 "위반 선례 준수"라는 **순환 논리**로 자가 부여됨 → Hook은 주석 존재만 보고 사유 타당성은 판단 못 함. **이 한계는 정기 전수조사로만 보완 가능**
3. 표준도메인 목록에 좌표 도메인 부재 → `crd`(좌표값, NUMERIC(11,8)) 정식 등재 후 `latd_crd`/`lngt_crd`로 표준화 (`sql/037_coord_standardize.sql`)

**교훈**: `DA-APPROVED`를 다는 본인이 사유의 타당성을 스스로 검증할 것. "선례 준수"는 그 선례가 표준 위반이면 무효다.

## 판정 원칙

- 미준수 판정 시 정본 문서의 **어느 규칙(§번호)을 위반했는지** 구체적으로 명시
- 단순 지적이 아닌 실행 가능한 개선 방안(마이그레이션 SQL 등)을 함께 제시
- 규칙 자체가 바뀌어야 하면 정본을 갱신하고 변경 이력에 기록 (다른 곳에 복제 금지)

## 심층 감사가 필요한 경우

대규모 점검(전체 스키마 감사 등)은 `da-qa-standard-auditor` 에이전트에 위임한다.

## 참고

- `references/DQ시스템기능.xls` — 품질 관리 시스템 기능 스펙 원본
- 자동 강제: `sql/*.sql` 작성 시 da-ddl-guard Hook이 P1 항목을 사전 차단
