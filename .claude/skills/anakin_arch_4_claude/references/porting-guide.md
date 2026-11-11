# 이식 가이드 — 다른 프로젝트에 anakin_arch_4_claude 구성

> 원본 = 이 저장소(loginpi). 경로는 저장소 루트 기준. 복사 직전에 최신본과 시험 통과를 확인한다.

## 1. 복사할 파일

| 묶음 | 파일 | 필수 |
|---|---|---|
| 훅 4종 | `.claude/hooks/model-advisor.mjs` · `.claude/hooks/codex-gate.mjs` · `.claude/hooks/turn-gate.mjs` · `.claude/hooks/push-guard.mjs` | 필수 |
| 관측 훅 | `.claude/hooks/work-history-logger.mjs` · `.claude/hooks/work-stats-refresh.mjs` · `.claude/hooks/request-graph-refresh.mjs` | 그래프를 쓰면 필수 |
| 판정·검사 | `scripts/codex-verify.mjs` · `scripts/precommit-check.mjs` | 필수(codex-gate·precommit-check 가 codex-verify 를 import) |
| 그래프 | `scripts/request-graph.mjs` + import 의존 `scripts/work-history-core.mjs` · `scripts/work-history-rows.mjs` · `scripts/work-history-stats.mjs` | 필수(model-advisor 가 core 의 `categorize` 를 import) |
| 대시보드 | `scripts/work-history-report.mjs` · `scripts/model-change-dashboard.mjs` · `scripts/my-claude-model-dashboard.mjs` | 선택 — 안 쓰면 `work-stats-refresh.mjs` 의 실행 목록에서 뺀다 |
| 에이전트 | `.claude/agents/teamAnakin/` 7종 | 필수 |
| 운용 기준 | `.claude/skills/anakin-skills/`(SKILL.md + 운용 기준서) · 이 스킬 폴더 | 필수 |
| 상태줄 | `.claude/subagent-statusline.mjs` | 선택 |
| 정본 문서 | `.claude/engineering/` 전체(00 목차 · 10~50 장표 · `40. loop/codex_procedure.md` · `60. nodes/`) — `50. graph/requests/`·`.obsidian/` 제외 | 필수(규칙 출처) |
| 시험 | `test/codex-gate.test.mjs` · `test/codex-verify.test.mjs` · `test/precommit-check.test.mjs` · `test/request-graph.test.mjs` · `test/turn-gate.test.mjs` · `test/work-history.test.mjs` · `test/request-resume.test.mjs`(work-history-rows 시험) | 필수 |

복사 뒤 바꿀 곳 : 에이전트 정의의 프로젝트 규칙(빌드 관문·DA·브랜드), `codex-verify.mjs` 의 'Codex 는 CLAUDE.md 를 모른다' 규칙 발췌, `model-advisor.mjs` 단계 문구, `push-guard.mjs` 의 보호 원격·브랜치.

## 2. `.claude/settings.json` 훅 등록 조각

원본 등록을 그대로 옮긴 형태(timeout 초). 기존 훅 배열에 **합친다** — 덮어쓰지 않는다.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/model-advisor.mjs\"", "timeout": 10 },
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/codex-gate.mjs\" --flush", "timeout": 10 } ] }
    ],
    "SubagentStart": [
      { "matcher": "anakin_phase-decide", "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/model-advisor.mjs\"", "timeout": 10 } ] },
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/request-graph-refresh.mjs\"", "timeout": 5 },
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/codex-gate.mjs\" --base", "timeout": 15 } ] }
    ],
    "SubagentStop": [
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/request-graph-refresh.mjs\"", "timeout": 5 },
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/codex-gate.mjs\"", "timeout": 600 } ] }
    ],
    "PostToolUse": [
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/codex-gate.mjs\" --flush", "timeout": 10 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit", "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/push-guard.mjs\"", "timeout": 10 } ] }
    ],
    "Stop": [
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/work-history-logger.mjs\" && node \"$CLAUDE_PROJECT_DIR/.claude/hooks/work-stats-refresh.mjs\"", "timeout": 20 },
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/turn-gate.mjs\"", "timeout": 300 } ] }
    ],
    "SessionEnd": [
      { "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/work-history-logger.mjs\"", "timeout": 20 } ] }
    ]
  },
  "subagentStatusLine": { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/subagent-statusline.mjs\"" }
}
```

- `codex-gate.mjs` SubagentStop timeout 600 은 판정 시간 예산(훅 안 `budgetMs` 560초)과 짝이다 — 줄이지 않는다.
- 하위 앱에 별도 `.claude/settings.json` 이 있으면 `push-guard` 는 거기에도 등록한다(원본 = 루트·하위 앱 모두 등록).

## 3. 필수 도구

| 도구 | 용도 | 비고 |
|---|---|---|
| Node.js | 훅·스크립트 전부(ESM `.mjs`, `node --test`) | 원본 머신 v24.15.0, 저장소 기준 Node 22 이상 |
| git | 기준선 스냅샷(`git stash create`)·diff·커밋 검사 | — |
| Codex CLI | 판정자 — `npm i -g @openai/codex`(원본 확인 버전 `codex-cli 0.167.0`) | 로그인은 **사람만** `! codex login`(헤드리스 `--device-auth`). 상태 `codex login status`. 사용량 한도 도달 = BLOCKED `judge-unavailable` |
| Obsidian | 엔지니어링 볼트 그래프 뷰 | 선택 — 볼트 루트 = `.claude/engineering` |

## 4. 환경변수(이름만)

| 이름 | 쓰는 곳 | 설정 |
|---|---|---|
| `CLAUDE_PROJECT_DIR` | 훅 명령 경로 | Claude Code 가 제공 |
| `WORKSPACE_ROOT` | 작업 이력 로거·행 로더의 경로 기준 | `.claude/settings.json` `env` + OS 사용자 환경변수 |
| `WORK_HISTORY_PROJECT` | 하위 앱 세션의 project 구분 | 하위 앱 settings `env`(선택) |
| `CODEX_JS` | 가짜 판정자 경로 — **시험 전용** | 시험이 설정. 평소에는 비움 |
| `CODEX_GATE_STATE` · `CODEX_LOOP_ROOT` | 상태·원장 루트 격리 — **시험 전용** | 시험이 임시 폴더로 설정 |
| `CODEX_GATE_ACTIVE` | 훅이 띄운 프로세스 표식(재진입 금지) | 훅이 설정 — 사람이 설정하지 않는다 |
| `CODEX_GATE_NO_RETRY` | BLOCKED 자동 재판정 끄기 | 선택 |

## 5. 첫 실행 순서

1. `node --check` 로 복사한 `.mjs` 전부 구문 확인.
2. 자체 시험 : `node .claude/hooks/model-advisor.mjs --selftest` → `node .claude/hooks/push-guard.mjs --selftest` → `node .claude/hooks/turn-gate.mjs --selftest` → `node scripts/codex-verify.mjs --selftest` → `node .claude/hooks/codex-gate.mjs --selftest`(가짜 판정자, 실호출 없음).
3. 회귀 시험 : `node --test test/**/*.test.mjs`(원본 `pnpm test`).
4. 그래프 : `node scripts/request-graph.mjs --design-only --md` 로 설계도판·슬롯 md 생성 → 브라우저로 HTML 확인.
5. Codex 로그인 확인(`codex login status`) → 작은 산출 턴 1회로 실호출 확인 : 원장 `.omc/state/loop/c4-…` 생성, `[CDX 자동 판정]` 전달, 그래프 CDX-루프 칸 Y.
6. 커밋 검사 : 스테이징 후 `node scripts/precommit-check.mjs`.

## 6. 주의

- **push-guard** : 설치 즉시 Claude 의 `git push` 가 전부 막힌다(`--dry-run` 만 허용). 해제는 사람만 `! node .claude/hooks/push-guard.mjs --allow [분] [원격] [브랜치]`(1회용, 기본 10분). 실수 방지 장치이지 보안 경계가 아니다(같은 OS 사용자).
- **`.gitignore`** 에 반드시 :
  ```
  .omc/*
  work-history/
  work-statistics/
  .claude/engineering/**/.obsidian/
  .claude/engineering/50. graph/requests/
  .claude/settings.local.json
  ```
  `work-history/`·`work-statistics/`·`requests/` 는 대화 전문·요청문을 담는다 — 저장소에 올리지 않는다. `precommit-check.mjs` 도 `work-history`·`work-statistics`·`settings.local.json` 을 금지 경로로 막는다.
- 원본은 `.claude/*` 를 통째 무시하고 추적할 폴더만 예외로 연다(예 `!.claude/engineering/` · `!.claude/engineering/**`) — 같은 방식이면 hooks·agents·skills·settings.json 도 예외로 열어야 추적된다. `settings.local.json` 은 개인 설정이라 계속 무시.
- 시험은 반드시 env 격리(`CODEX_GATE_STATE`·`CODEX_LOOP_ROOT`)로 — 실제 `.omc/state` 의 pending 에 가짜 결과가 들어가면 메인에 전달된다([lessons.md](lessons.md) 4).
- Windows : 셸 스크립트는 LF, 경로 구분자 `\`·`/` 혼용은 훅이 정규화한다.
