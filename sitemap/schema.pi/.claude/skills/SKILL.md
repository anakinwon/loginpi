---
name: da-team
description: "DA팀(리더·표준·모델·품질·이행 5인) 에이전트 팀을 조율하는 오케스트레이터. 신규 테이블 설계, 스키마 변경, 데이터 모델링, 표준 등재, 데이터 마이그레이션, DA 품질 전수조사 등 다단계 DA 작업 요청 시 반드시 이 스킬을 사용. 후속 작업(DA 결과 수정, 모델만 다시, 이행 계획 보완, 재점검, 이전 설계 개선, 재실행, 업데이트) 요청 시에도 반드시 이 스킬을 사용. 단, 단건 DDL 리뷰·단순 명명 질의는 da-governance-expert 단독 호출로 충분하므로 팀을 소집하지 않는다."
---

# DA Team Orchestrator

DA팀 5인(da-leader·da-standards·da-modeler·da-quality·da-migration)을 조율하여 표준 준수 데이터 아키텍처 산출물(모델·DDL·이행 계획·품질 보고서)을 생성하는 통합 스킬.

## 실행 모드: 에이전트 팀 (Claude Code 2.1.29x 암묵적 단일 팀)

**TeamCreate/TeamDelete 도구는 현행 버전에 없다** — 세션당 팀 1개가 암묵적으로 존재하고, `name`을 붙여 띄운 Agent가 곧 팀원이다(공식 문서 code.claude.com/docs/en/agent-teams.md, 2026-10-10 확인).

| 용도 | 도구 |
|---|---|
| 팀원 소집 | `Agent(subagent_type: "da-standards", name: "standards", run_in_background)` — 이름이 주소 |
| 팀원 간·리더 통신 | `SendMessage(to: "<팀원 이름>")` — 완료된 팀원에게 보내면 기록에서 재개 |
| 팀원 목록·상태 | `ListAgents` |
| 공유 작업 목록 | `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` |
| 팀원 종료 | `SendMessage({type:"shutdown_request"})` 또는 `TaskStop(task_id: "<팀원 이름>")` |

전제 설정(프로젝트 `.claude/settings.json` env): `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`(팀원·종료/계획승인 프로토콜), `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`(문서 미등재 모델에서 Task* 도구 활성). 비대화형(`-p`·SDK)에서는 teammate가 생성되지 않으므로 그때만 **서브 에이전트/Workflow 모드로 폴백**(파일 기반 전달).

## 팀 소집 판단 (소집 전 필수)

| 작업 유형 | 처리 |
|----------|------|
| 단건 DDL 리뷰, 단순 명명 질의, 컬럼 1~2개 추가 | **팀 소집 안 함** — `da-governance-expert` 단독 호출 |
| 신규 테이블 설계(관계 포함), 스키마 개편, 마이그레이션, 전수조사, 표준 등재 동반 작업 | **팀 소집** — 아래 워크플로우 |

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 주 출력 |
|------|-------------|------|------|---------|
| leader | da-leader | 총괄·작업 분해·통합·최종 승인 | - | `{NN}_leader_review.md` |
| standards | da-standards | 표준사전·명명 검증·등재안 | (명명규칙 내재화) | `{NN}_standards_naming-review.md` |
| modeler | da-modeler | 논리/물리 모델·DDL 초안 | (da-standards 검증 의존) | `{NN}_modeler_model.md`, `{NN}_modeler_ddl.sql` |
| quality | da-quality | P1/P2/P3 게이트·전수조사·보고서 | (점검 절차 내재화) | `{NN}_quality_gate.md`, `docs/da/reports/*` |
| migration | da-migration | 이행 계획·이행 SQL·검증 쿼리 | - | `{NN}_migration_plan.md`, `{NN}_migration_ddl.sql` |

작업 디렉토리: `docs/da/_workspace/{YYYYMMDD}_{잡슬러그}/` — **잡별 하위 디렉토리 필수** (파일명 `{NN}_{팀원}_{산출물}.{ext}`, NN은 Phase 순번). 다중 세션이 병렬로 DA 작업을 수행하므로 `_workspace/` 직속 파일·타 잡 디렉토리는 절대 건드리지 않는다 (2026-07-10 1차 실행에서 타 세션 전수조사와 충돌 회피 확인). Phase 0의 존재 검사도 해당 잡 디렉토리 기준으로 수행한다.

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
2. `docs/da/_workspace/` 생성, 사용자 요구를 `00_input.md`로 저장 — ⚠️ **"수정 범위"와 "점검 범위"를 따로 적는다.** 점검 범위는 항상 "모델에 등장하는 전 객체(신규·변경·승계·baseline·grandfathered)". "재정의 금지·승계 대상" 문구만 쓰면 팀원이 그 객체를 점검에서 빼 버린다(2026-10-10 sys_user.id·role 이 이렇게 통과 — 정본 §10 #22)
3. 관련 정본 확인 — `docs/da/데이터표준규칙.md`, 기존 `sql/` 최신 상태

### Phase 2: 팀 구성

작업 유형에 따라 필요한 팀원만 소집한다 (설계만이면 migration 제외 가능, 감사만이면 quality+standards만).

팀원은 이름 붙인 Agent 호출로 소집한다(한 메시지에 병렬 호출, 각자 백그라운드):

```
Agent(subagent_type: "da-standards", name: "standards", run_in_background: true, prompt: "<잡 디렉토리·역할·첫 작업>")
Agent(subagent_type: "da-modeler",   name: "modeler",   run_in_background: true, prompt: "...")
Agent(subagent_type: "da-quality",   name: "quality",   run_in_background: true, prompt: "...")
Agent(subagent_type: "da-migration", name: "migration", run_in_background: true, prompt: "...")   // 이행 대상 있을 때만
```

리더 역할은 오케스트레이터(메인 세션)가 da-leader 정의(`.claude/agents/da-leader.md`)를 읽고 수행한다. 단계별 승인 판정을 독립 관점으로 받으려면 `Agent(subagent_type: "da-leader", name: "leader")`를 추가 소집해도 된다.

작업 등록 (표준 설계 작업 기준 — 작업마다 TaskCreate 1회, 선후관계는 description 에 명시하고 TaskUpdate 로 상태·담당 갱신):

```
TaskCreate(subject: "표준사전 사전검토",   description: "담당 standards")
TaskCreate(subject: "논리/물리 모델 설계",  description: "담당 modeler · 선행: 표준사전 승인")
TaskCreate(subject: "DDL 초안 명명 검증",   description: "담당 standards · 선행: 모델 설계")
TaskCreate(subject: "이행 영향 분석·계획",  description: "담당 migration · 선행: 모델 설계")
TaskCreate(subject: "품질 게이트(점진)",    description: "담당 quality")
TaskCreate(subject: "통합 검토·확정",      description: "담당 leader · 선행: 명명 검증·이행·품질 게이트")
```

### Phase 3: 팀 작업 수행 (자체 조율)

**팀원 간 통신 규칙:**
- modeler는 DDL 초안 완성 즉시 standards에게 검증 요청 (SendMessage)
- standards의 위반 지적 → modeler 수정 → 재검증 루프 (최대 3회, 초과 시 리더 판정)
- modeler는 기존 데이터 영향 발견 즉시 migration에게 조기 공유
- quality는 각 산출물 완성 알림을 받는 즉시 점진 QA 수행 — P1 발견 시 작성자에게 직접 발신
- 상충·판단 필요 사항은 leader에게 상신

**리더 모니터링:** TaskList/TaskGet으로 진행 확인, ListAgents로 팀원 상태 확인, 유휴 팀원 알림 처리, 막힌 팀원 SendMessage 재지시 (ListAgents 반복 폴링 금지 — 완료 알림은 자동 도착)
- 팀원이 완료 메시지 없이 유휴 전환되면 **디스크의 산출물 존재·내용부터 확인**한다 (완료 메시지 유실 사례 — 산출물은 정상인 경우가 있음)
- 팀원 보고가 서로 상충하면(예: 파일 상태) **리더가 디스크 실물을 직접 grep/Read로 판정**한다 — 읽기 시점 경합이 흔한 원인

### Phase 4: 품질 게이트 & 통합

1. quality의 게이트 판정 수집 — **P1 위반 잔존 시 확정 금지**, 해당 팀원 재작업
2. leader(오케스트레이터)가 산출물 교차 검토 — 모델↔명명↔이행 정합성
3. 확정 산출물 이동:
   - DDL·이행 SQL → `sql/{순번}_{설명}.sql` (⛔ 운영 적용은 마스터 — 적용 절차를 계획서에 명문화)
   - 품질 보고서 → `docs/da/reports/YYYY-MM-DD_<제목>.md`
   - 모델 문서 → `docs/da/` 하위

### Phase 5: 정리

1. 팀원 종료 요청(SendMessage `shutdown_request` 또는 TaskStop) 후 TaskList 잔여 작업 정리 (TeamDelete 없음 — 팀은 세션 종료와 함께 사라짐)
2. `_workspace/` 보존 (감사 추적·후속 부분 재실행용)
3. 사용자에게 결과 요약 보고 — 산출물 목록·게이트 판정·마스터 적용 필요 항목·미해결 P2/P3
4. 피드백 기회 제공 — 개선점이 있으면 CLAUDE.md 변경 이력에 기록하고 하네스 갱신

## 데이터 흐름

```
[leader(메인)] → Agent(name: ...) × N 소집 + TaskCreate
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
| 팀원 소집 불가(비대화형 `-p`·SDK, 또는 env 미설정) | 서브 에이전트/Workflow 모드 폴백 — Agent 도구 병렬 호출 + 파일 기반 전달. Task* 도구 미노출이면 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 확인 |
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
