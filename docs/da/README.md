# DA(Data Architecture) 프레임워크

> Pi Network 플랫폼의 데이터 아키텍처 표준·품질·모델링 체계.
> **최종 갱신**: 2026-06-08 (구조 재편 ReORG)

---

## 1. 3계층 구조

```
[계층 1] 정본 문서 — 사람이 읽는 Single Source of Truth
  docs/da/
  ├── README.md                  ← 이 문서 (프레임워크 맵)
  ├── 데이터표준규칙.md            ← 정본: 표준설계원칙·표준사전·명명·삭제·타입 규칙
  ├── 품질점검기준서.md            ← 점검 절차 + P1/P2/P3 체크리스트 + 보고 양식
  └── reports/                   ← 점검 보고서 (YYYY-MM-DD_제목.md)

[계층 2] 실행 지식 — DA팀 에이전트에 내재화 (2026-07-18, 구 스킬 da-naming-rules·da-qa-checklist 폐지)
  docs/da/references/            ← 지침서 원문 (표준단어·도메인·용어·코드 DOCX, 명명규칙 PPTX, DQ시스템기능.xls)

[계층 3] 역할 에이전트 — Claude Code Agents
  .claude/agents/
  ├── da-leader.md / da-standards.md(명명규칙 내재) / da-modeler.md
  ├── da-quality.md(점검 절차 내재) / da-migration.md   ← da-team 스킬이 팀 소집
  └── da-governance-expert.md    ← 단건 DDL 리뷰·단순 질의 단독 처리

[자동 강제] Hook — 규칙 위반 DDL 차단
  .claude/hooks/da-ddl-guard.mjs ← PreToolUse Hook (R1~R7 검사 + DA-APPROVED 승인)
  .claude/settings.json          ← Hook 등록
```

**설계 원칙**: 규칙 내용은 `docs/da/`에만 존재한다. 스킬·에이전트·Hook은 정본을 **참조**만 하고 복제하지 않는다 (단일 소스 원칙 — `src/lib/locale-currency.ts` 패턴과 동일).

---

## 2. 역할 매트릭스

| 구성요소 | 유형 | 역할 | 참조하는 정본 |
|---|---|---|---|
| `da-team-leader` | Agent | 표준화 원칙·절차 수립, 표준 의사결정, 점검 위임 | README + 데이터표준규칙.md |
| `da-qa-standard-auditor` | Agent | DDL·모델·메타데이터 표준 준수 감사 | 품질점검기준서.md + 데이터표준규칙.md |
| `da-standards` | Agent | 명명규칙 적용·검증 (구 da-naming-rules 스킬 내재화) | 데이터표준규칙.md §1~§3 |
| `da-quality` | Agent | 품질 점검 절차 수행 (구 da-qa-checklist 스킬 내재화) | 품질점검기준서.md |
| `da-ddl-guard` | Hook | DDL 자동 검사 — 준수 시 bypass, 위반 시 차단 | 데이터표준규칙.md (R1~R7) |
| Admin UI (`/admin/std/*`) | App | 표준단어·도메인·용어 CRUD, 승인 워크플로우, Audit | DB: `std_dic`·`std_dom`·`std_term` |

---

## 3. 자동 강제 체계 (da-ddl-guard Hook)

`sql/*.sql` 파일 작성(Write/Edit) 또는 Supabase 마이그레이션 적용(`apply_migration`/`execute_sql`) 시 **PreToolUse Hook이 자동 검사**한다.

### 검사 규칙

| # | 검사 | 위반 시 |
|---|---|---|
| R1 | CREATE TABLE에 시스템 컬럼 4개 + NOT NULL DEFAULT | ⛔ 차단 |
| R2 | 테이블명 도메인 접두사 (`sys_`·`brd_`·`std_`·`pi_`·`auth_`·`cod_`·`msg_`·`i18n_`) | ⛔ 차단 |
| R3 | 오브젝트명 대문자 포함 (소문자 원칙 위반) | ⛔ 차단 |
| R4 | `_dt`/`_dtm` 컬럼이 VARCHAR/TEXT/CHAR 타입 | ⛔ 차단 |
| R5 | `DROP TABLE` / `DELETE FROM` (물리삭제 금지) | ⛔ 차단 |
| R6 | 운영 테이블에 `del_yn`+`del_dtm` 부재 (`_log`·`_hist` 제외) | ⛔ 차단 |
| R7 | 컬럼명이 표준 도메인 약어로 끝나지 않음 | ⚠️ 경고 (통과) |

### Bypass / 승인 절차

```
규칙 전체 준수 → ✅ bypass (즉시 적용)
규칙 위반     → ⛔ 차단 → Claude가 DA(사용자)에게 위반 내역 보고
                → DA 승인 시 SQL 상단에 주석 추가 후 재시도:
                  -- DA-APPROVED: <승인사유> (<YYYY-MM-DD>)
```

승인 주석은 SQL 파일에 영구 잔존하여 감사 추적(audit trail) 역할을 한다.

---

## 4. 표준 설계 원칙 요약 (Top-down)

상세: [`데이터표준규칙.md`](./데이터표준규칙.md) §0~§1

```
개념모델 (주제영역 정의 + 주요 엔터티 도출)
  ↓
논리모델 (표준사전 준수 — 엔터티·속성·관계·논리명·물리명·주식별자)
  ↓
물리모델 (테이블·컬럼·PK·Index·파티션 — 성능 고려)
```

**표준사전 = 표준단어 + 표준도메인 + 표준용어**
- 표준단어: 한글명 + 영문약어(2~4자), 중복·동음이의어·이음동의어 불허
- 표준도메인: 단어 선등록 → Type·Length 한정
- 표준용어: `단어1(_단어n)_도메인` — 반드시 도메인으로 끝남, 미등록 단어 금지

---

## 5. 구성 로드맵

> 2026-06-08 ReORG에서 미구현 스캐폴딩(0바이트 파일 30여 개)을 삭제하고 구상을 이 표로 보존한다.
> 새 구성요소 추가 시: 에이전트는 `.claude/agents/da/<이름>.md` (frontmatter 필수), 스킬은 `.claude/skills/<이름>/SKILL.md` (1단계 평탄 구조 필수).

| 팀 | 구성요소 | 상태 | 비고 |
|---|---|---|---|
| 00-리더 | da-team-leader | ✅ 동작 | 오케스트레이터 |
| 00-공통 | SQLite 메타 운영 (da-common-sqlite-ops) | 📋 계획 | 자산 보존: `docs/da/assets/SQLiteDB_for_META_v5.db` + 패치이력 |
| 10-표준 | 표준단어 관리자 (da-std-word-manager) | 📋 계획 | Admin UI(`/admin/std/words`)가 현재 대체 |
| 10-표준 | 표준도메인 관리자 (da-std-domain-manager) | 📋 계획 | Admin UI(`/admin/std/domains`)가 현재 대체 |
| 10-표준 | 표준용어 관리자 (da-std-term-manager) | 📋 계획 | Admin UI(`/admin/std/terms`)가 현재 대체 |
| 10-표준 | 표준코드 거버넌스 (da-std-code-governance) | 📋 계획 | `cod_` 테이블 도입 시 |
| 20-모델링 | 논리 설계자 (da-mdl-logical-designer) | 📋 계획 | 표준사전 기반 논리모델 자동 설계 |
| 20-모델링 | 물리 설계자 (da-mdl-physical-designer) | 📋 계획 | DDL 자동 생성 (현재 `/admin/std/ddl`이 부분 대체) |
| 20-모델링 | DAH 연동 (da-mdl-dah-integration) | 📋 계획 | DA샵 import/export — CSV 템플릿·스크립트 필요 |
| 20-모델링 | 정규화 검토 (da-mdl-normalization) | 📋 계획 | |
| 30-품질 | 표준 감사 (da-qa-standard-auditor) | ✅ 동작 | 명명 점검 통합 (구 naming-auditor 병합) |
| 30-품질 | 무결성 감사 (da-qa-integrity-auditor) | 📋 계획 | FK·참조 무결성 전수 점검 |
| 30-품질 | 정규화 감사 (da-qa-normalization-auditor) | 📋 계획 | |
| 30-품질 | DDL 자동 가드 (da-ddl-guard) | ✅ 동작 | Hook — §3 참조 |
| 40-이행 | ETL 스크립터 (da-mig-etl-scripter) | 📋 계획 | |
| 40-이행 | 매핑 설계자 (da-mig-mapping-designer) | 📋 계획 | |
| 40-이행 | 샘플 생성기 (da-mig-sample-generator) | 📋 계획 | gen_sample.py 구현 필요 |
| 40-이행 | 이행 검증기 (da-mig-validator) | 📋 계획 | |

### 기술 부채 (소급 적용 과제)

| 과제 | 내용 | 우선순위 |
|---|---|---|
| `del_dtm` 소급 | 기존 운영 테이블에 `del_dtm TIMESTAMPTZ` 추가 마이그레이션 | P2 |
| 표준단어 일괄 등록 | 현재 사용 중인 전체 약어를 `std_dic`에 등재 (Hook R7 정확도 향상) | P2 |
| 컬럼 COMMENT | 전 테이블 컬럼 설명(COMMENT ON) 작성 | P3 |

---

## 6. 신규 테이블 DDL 템플릿

```sql
-- DA 표준 준수 템플릿 (da-ddl-guard 통과 보장)
CREATE TABLE <접두사>_<엔터티명> (
  <엔터티약어>_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... 업무 컬럼 (표준용어 형식: 단어1(_단어n)_도메인) ...
  del_yn  CHAR(1)     NOT NULL DEFAULT 'N' CHECK (del_yn IN ('Y', 'N')),
  del_dtm TIMESTAMPTZ,
  regr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id TEXT        NOT NULL DEFAULT 'ADMIN',
  mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- mod_dtm 자동 갱신 트리거
CREATE OR REPLACE FUNCTION fn_upd_<테이블명>_mod_dtm() RETURNS TRIGGER AS $$
BEGIN
  NEW.mod_dtm = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_<테이블명>_mod_dtm
  BEFORE UPDATE ON <테이블명>
  FOR EACH ROW EXECUTE FUNCTION fn_upd_<테이블명>_mod_dtm();
```
