---
name: da-team
description: "DA팀(리더·표준·모델·품질·이행 5인) 에이전트 팀을 조율하는 오케스트레이터. 신규 테이블 설계, 스키마 변경, 데이터 모델링, 표준 등재, 데이터 마이그레이션, DA 품질 전수조사 등 다단계 DA 작업 요청 시 반드시 이 스킬을 사용. 후속 작업(DA 결과 수정, 모델만 다시, 이행 계획 보완, 재점검, 이전 설계 개선, 재실행, 업데이트) 요청 시에도 반드시 이 스킬을 사용. 단, 단건 DDL 리뷰·단순 명명 질의는 da-governance-expert 단독 호출로 충분하므로 팀을 소집하지 않는다."
---

# DA Team Orchestrator

DA팀 5인(da-leader·da-standards·da-modeler·da-quality·da-migration)을 조율하여 표준 준수 데이터 아키텍처 산출물(모델·DDL·이행 계획·품질 보고서)을 생성하는 통합 스킬.

## 실행 모드: 에이전트 팀

팀 도구(TeamCreate/SendMessage/TaskCreate)를 사용한다. 팀 기능이 비활성 환경이면 **서브 에이전트 모드로 폴백** — 동일 에이전트 정의를 Agent 도구로 순차/병렬 호출하고, 통신 규칙은 파일 기반 전달로 대체한다.

## 팀 소집 판단 (소집 전 필수)

| 작업 유형 | 처리 |
|----------|------|
| 단건 DDL 리뷰, 단순 명명 질의, 컬럼 1~2개 추가 | **팀 소집 안 함** — `da-governance-expert` 단독 호출 |
| 신규 테이블 설계(관계 포함), 스키마 개편, 마이그레이션, 전수조사, 표준 등재 동반 작업 | **팀 소집** — 아래 워크플로우 |

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 주 출력 |
|------|-------------|------|------|---------|
| leader | da-leader | 총괄·작업 분해·통합·최종 승인 | - | `{NN}_leader_review.md` |
| standards | da-standards | 표준사전·명명 검증·등재안 | da-naming-rules | `{NN}_standards_naming-review.md` |
| modeler | da-modeler | 논리/물리 모델·DDL 초안 | da-naming-rules(참조) | `{NN}_modeler_model.md`, `{NN}_modeler_ddl.sql` |
| quality | da-quality | P1/P2/P3 게이트·전수조사·보고서 | da-qa-checklist | `{NN}_quality_gate.md`, `docs/da/reports/*` |
| migration | da-migration | 이행 계획·이행 SQL·검증 쿼리 | - | `{NN}_migration_plan.md`, `{NN}_migration_ddl.sql` |

작업 디렉토리: `docs/da/_workspace/` (파일명 `{NN}_{팀원}_{산출물}.{ext}`, NN은 Phase 순번)

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. `docs/da/_workspace/` 존재 여부 확인
2. 실행 모드 결정:
   - **미존재** → 초기 실행. Phase 1로 진행
   - **존재 + 부분 수정 요청** → 부분 재실행. 해당 팀원만 재호출, 이전 산출물 경로를 프롬프트에 포함하여 피드백 반영 지시
   - **존재 + 새 주제 입력** → 새 실행. 기존 `_workspace/`를 `_workspace_{YYYYMMDD_HHMMSS}/`로 이동 후 Phase 1
3. 부분 재실행 시 품질 게이트(Phase 4)는 수정 산출물에 대해 반드시 재수행

### Phase 1: 준비

1. 요구 분석 — 작업 유형(설계/변경/이행/감사) 판별, 팀 소집 여부 판단(위 표)
2. `docs/da/_workspace/` 생성, 사용자 요구를 `00_input.md`로 저장
3. 관련 정본 확인 — `docs/da/데이터표준규칙.md`, 기존 `sql/` 최신 상태

### Phase 2: 팀 구성

작업 유형에 따라 필요한 팀원만 소집한다 (설계만이면 migration 제외 가능, 감사만이면 quality+standards만).

```
TeamCreate(
  team_name: "da-team",
  members: [
    { name: "standards", agent_type: "da-standards", model: "opus" },
    { name: "modeler",   agent_type: "da-modeler",   model: "opus" },
    { name: "quality",   agent_type: "da-quality",   model: "opus" },
    { name: "migration", agent_type: "da-migration", model: "opus" }
  ]
)
```

리더 역할은 오케스트레이터(메인 세션)가 da-leader 정의(`.claude/agents/da-leader.md`)를 읽고 수행한다.

작업 등록 (표준 설계 작업 기준):

```
TaskCreate(tasks: [
  { title: "표준사전 사전검토",  assignee: "standards" },
  { title: "논리/물리 모델 설계", assignee: "modeler" },
  { title: "DDL 초안 명명 검증",  assignee: "standards", depends_on: ["논리/물리 모델 설계"] },
  { title: "이행 영향 분석·계획", assignee: "migration", depends_on: ["논리/물리 모델 설계"] },
  { title: "품질 게이트(점진)",   assignee: "quality" },
  { title: "통합 검토·확정",     assignee: "leader",  depends_on: ["DDL 초안 명명 검증", "이행 영향 분석·계획", "품질 게이트(점진)"] }
])
```

### Phase 3: 팀 작업 수행 (자체 조율)

**팀원 간 통신 규칙:**
- modeler는 DDL 초안 완성 즉시 standards에게 검증 요청 (SendMessage)
- standards의 위반 지적 → modeler 수정 → 재검증 루프 (최대 3회, 초과 시 리더 판정)
- modeler는 기존 데이터 영향 발견 즉시 migration에게 조기 공유
- quality는 각 산출물 완성 알림을 받는 즉시 점진 QA 수행 — P1 발견 시 작성자에게 직접 발신
- 상충·판단 필요 사항은 leader에게 상신

**리더 모니터링:** TaskGet으로 진행 확인, 유휴 팀원 알림 처리, 막힌 팀원 재지시

### Phase 4: 품질 게이트 & 통합

1. quality의 게이트 판정 수집 — **P1 위반 잔존 시 확정 금지**, 해당 팀원 재작업
2. leader(오케스트레이터)가 산출물 교차 검토 — 모델↔명명↔이행 정합성
3. 확정 산출물 이동:
   - DDL·이행 SQL → `sql/{순번}_{설명}.sql` (⛔ 운영 적용은 마스터 — 적용 절차를 계획서에 명문화)
   - 품질 보고서 → `docs/da/reports/YYYY-MM-DD_<제목>.md`
   - 모델 문서 → `docs/da/` 하위

### Phase 5: 정리

1. 팀원 종료 요청 후 팀 정리 (TeamDelete)
2. `_workspace/` 보존 (감사 추적·후속 부분 재실행용)
3. 사용자에게 결과 요약 보고 — 산출물 목록·게이트 판정·마스터 적용 필요 항목·미해결 P2/P3
4. 피드백 기회 제공 — 개선점이 있으면 CLAUDE.md 변경 이력에 기록하고 하네스 갱신

## 데이터 흐름

```
[leader(메인)] → TeamCreate
   ├─ standards ←SendMessage→ modeler   (명명 검증 루프)
   │                             │
   │                             ├→ migration (이행 영향 조기 공유)
   │                             ↓
   │        _workspace/{NN}_modeler_ddl.sql 등
   │                             ↓
   ├─ quality (점진 QA, P1은 작성자 직접 통지)
   ↓
[leader: 교차 검토·확정] → sql/ · docs/da/reports/ · docs/da/
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| 팀원 1명 실패/무응답 | SendMessage 상태 확인 → 1회 재시작 → 재실패 시 리더가 해당 작업 흡수, 보고서에 명시 |
| 검증 루프 3회 초과 | 리더가 정본 기준 직권 판정, 판정 근거 기록 |
| 팀원 간 상충 | 삭제 금지·출처 병기 후 리더 판정 |
| 팀 도구 비활성 | 서브 에이전트 모드 폴백 — Agent 도구 병렬 호출 + 파일 기반 전달 |
| DB 접근 불가 | 파일 기준 진행 + "DB 미검증" 명시 (판정 보류 아님) |
| P1 위반 잔존 | 확정 차단 — 재작업 또는 사용자 에스컬레이션 |

## 테스트 시나리오

### 정상 흐름 (신규 테이블 설계)
1. 사용자: "구독 알림 이력 테이블 설계해줘"
2. Phase 1: 설계+이행 판별 → 팀 소집 (standards·modeler·quality·migration)
3. Phase 3: modeler 모델·DDL 초안 → standards 명명 검증(1회 위반→수정) → migration 이행 불필요 판정 → quality 게이트 PASS
4. Phase 4: leader 교차 검토 → `sql/1xx_noti_hist.sql` 확정
5. 예상 결과: DDL 1건 + 모델 문서 + 게이트 판정 기록, 마스터 적용 안내 포함

### 에러 흐름 (품질 게이트 차단)
1. Phase 3에서 quality가 P1 위반(시스템 컬럼 누락) 발견 → modeler에게 직접 통지
2. modeler 수정 → standards 재검증 → quality 재점검 PASS
3. 만약 modeler 무응답 → 리더가 상태 확인 → 재시작 실패 시 리더가 DDL 수정 직접 수행
4. 최종 보고에 "modeler 1회 재시작" 명시

### 트리거 경계 (팀 소집 안 함)
- "이 컬럼명 표준에 맞아?" → da-governance-expert 단독 (팀 미소집)
- "sql/170.sql 리뷰해줘" → da-governance-expert 단독 (팀 미소집)
