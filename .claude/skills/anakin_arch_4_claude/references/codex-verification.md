# Codex 검증 — 루프 판정만(하네스 흡수)

> 정본 = `.claude/engineering/40. loop/codex_procedure.md` **13절**(2026-11-10 개정). 루프 전반 = `.claude/engineering/40. loop/anakins_loop.md`.
> ⚠ 작성 시점에 13절이 수정 진행 중(루프 판정 결함 5건)이었다. 아래는 2026-11-10 개정 원칙 수준의 요약이다 — 세부 값은 정본·훅 머리 주석을 확인한다.
> 개정 원문(2026-11-10 마스터) : "프롬프트+컨텍스트+그래프+총괄=>제거, 루프 유지+하네스는 루프에 흡수로 결론내고 바로 수정해 줘"

## 1. 판정 흐름

```
서브에이전트 시작 ── SubagentStart 훅 codex-gate.mjs --base
                     └ 판정 대상 에이전트만 git stash create 스냅샷 → .omc/state/codex-gate/base/ (작업 트리 무변경)
서브에이전트 종료 ── SubagentStop 훅 codex-gate.mjs (timeout 600초)
   ① 대상 판단 : 바꾼 파일 1건 이상 + NO_GATE 밖 에이전트  → 아니면 판정 없음
   ② 원장 id   : c4-<주제>-<agentId 앞 6자>  (재전달 = 같은 원장 다음 회차)
   ③ 자동 계약 : L/contract.md = 마스터 요청 원문 + 브리프 + 추가 지시, AC-1~3(+하네스면 AC-4)
   ④ 증거      : 최종 보고 report.md · 도구 기록 tools.md · 바꾼 파일 diff/본문 · 생성물 실행 증거 generated.txt
   ⑤ node scripts/codex-verify.mjs --init  →  --confirm-real
   ⑥ 결과 파일 → .omc/state/codex-gate/pending/
메인 다음 도구 호출·요청 ── PostToolUse·UserPromptSubmit 훅 codex-gate.mjs --flush
   └ "[CDX 자동 판정 — codex-gate 훅]" 1회 전달 (SubagentStop 의 additionalContext 는 서브에이전트에게 가므로 쓰지 않음)
```

## 2. 종료 코드와 행동

| 종료 | 판정 | 다음 행동 |
|---|---|---|
| 0 | PASS(Y) | 다음 단계(검수·그래프 분석·팀장 승인) |
| 1 | FAIL(N) | 결함(`L/iter-N.codex.json`, 메인 triage `L/iter-N.triage.md`)을 **그 에이전트**에 회송 → 재실행 끝나면 같은 원장 다음 회차 |
| 2 | BLOCKED | 회차 미소모 — 사유 해소 후 같은 회차. `scope-too-broad`·`judge-unavailable`(쿨다운 10분)·`lock` 은 훅이 같은 요청 안에서 1회 자동 재판정, `device`·`master-permission`·`budget`·`ledger` 는 사람 몫 |

- **Y 전에는 다음 단계로 가지 않는다.** 팀장 승인 전제 = 이 요청의 c4 원장 전부 Y(BLOCKED `device` = 최대 CONDITIONAL, Claude 대체 판정 = `maxGrade` CONDITIONAL).
- **상한** : 원장마다 회차 5 · Codex 호출 5 · 벽시계 90분. 5회차 판정 = `loopEnd`(남은 결함 마스터 보고).

## 3. scope·계약·증거 규칙

| 항목 | 규칙 |
|---|---|
| 대상 | 파일을 바꾼 에이전트만. 비대상 `NO_GATE` = collect·decide·review·graph·commit·teamanakin-admin(훅과 생성기 값 동일 — 훅 selftest 가 확인) + 파일 변경 0건 실행 |
| scope 1차 | 그 에이전트 기록의 Write·Edit·NotebookEdit 대상(gitignore 무관 — 무시 대상 본문은 증거 `written-files.md`) |
| scope 2차(보조) | 그 에이전트가 Bash·PowerShell 을 썼을 때만 (기준선 diff ∪ 미추적) ∩ 시작 뒤 수정 시각 — 같은 시간 형제 에이전트·메인이 Write·Edit 한 경로는 빼고 계약에 '병렬 에이전트 귀속 제외 n건' |
| 기준선 | SubagentStart 스냅샷 → 판정은 `--diff <스냅샷>` + 그 뒤 바뀐 파일만. 스냅샷이 없으면 계약에 '기준선 없음' |
| 생성물 | 그래프 HTML·`request-flow/`·`requests/`·`work-statistics/` 는 scope 밖, 증거 `generated.txt` 로만 |
| 하네스 흡수 | 하네스 파일(`HARNESS_RE` — `.claude/` 아래 hooks·agents·skills·`engineering/40. loop` 폴더와 `.claude/settings*.json`)도 같은 c4 원장. 1건 이상이면 자동 계약에 **AC-4**(규칙 정합 / 우회·회귀 없음 / selftest·`node --check` 근거) |
| `-pN` 분할 | 프롬프트 상한 대응만 — 래퍼 `maxPromptBytes` 600KB 기준, 파일별 비용(diff + 본문×1.15) 추정 후 묶음당 360KB 를 넘으면 `-p1`…`-pN`(큰 것부터 첫 맞춤, 기준 원장 폴더에 `split.json`). **모든 묶음 PASS 일 때만 Y** |
| 계약 원문 | `## 마스터 요청 원문` 구획 = 메인 세션 기록에서. 브리프가 원문과 어긋나면 원문 기준으로 판정, 차이는 notes 에만 |
| 비밀 경로 | 증거 본문은 공용 `fileExcerpt` 하나로 — `isSecretPath`(래퍼 export 제외와 같은 목록 : `.env*`·`.omc`·`.codex`·`.ssh`·키·자격 증명 json 등)는 읽지 않고 경로만, 허용 확장자(`.md .mjs .js .cjs .ts .tsx .jsx .json .css .html .sql .yml .yaml .txt`) 밖은 경로·크기만, 허용 대상은 `redact` 후 본문 |
| 재귀 금지 | 실호출 주체는 훅뿐. 훅이 띄운 프로세스는 env `CODEX_GATE_ACTIVE` 로 재진입하지 않는다. 메인·서브에이전트는 `--confirm-real` 을 부르지 않는다(시험 = `CODEX_JS` 가짜 판정자) |
| 판정 입력 | 프롬프트 본문만(파일 전문 포함). Windows read-only 샌드박스가 Codex 셸 읽기를 막으므로 판정자가 직접 읽는다고 가정하지 않는다 |

**비용** : Codex 호출 수 = 파일을 바꾼 에이전트 수(+ `-pN` 묶음 수) + FAIL 회송. 산출 턴 기본(build 1회) = 1회, 조회·결론·커밋 단독 턴 = 0회.

## 4. 턴 끝과 커밋

- **turn-gate(Stop)** : 응답 끝 `종료 승인 : <승인|보류> — <근거>` 줄을 `.omc/state/codex-gate/approvals.jsonl` 에 적기만 한다. 판정·차단·stdout 없음, 항상 종료 0.
- **커밋** : Codex 대신 `scripts/precommit-check.mjs --commit`(금지 경로·5MB·추가 줄 비밀·Co-Authored-By, 종료 0 통과 / 1 위반 / 2 오류).

## 5. 도입 경위(이력) — 각 단계의 실패 교훈

| 단계 | 시기 | 형태 | 무엇이 잘못됐나 → 교훈 |
|---|---|---|---|
| ① verify 에이전트 | 2026-11-08~09 | 검증 단계 서브에이전트(Sonnet)가 래퍼 `--confirm-real` 을 실행하고 증거를 모음 | 검수(Codex) 위에 Claude 검수 단계가 또 있어 그래프·구조가 복잡해지고 오해를 낳음(마스터 "Codex 목적이 검수인데 클로드가 검수를 또 하는 의도가 뭘까 … 삭제 바람"). 실행 여부가 모델 판단에 달려 누락이 생김 → **실행 주체를 훅(결정적)으로** |
| ② 모든 칸 판정 | 2026-11-09 결정 → 11-10 오전 | 칸 c1 프롬프트·c2 컨텍스트·c3 하네스·c4 산출·c5 그래프·c6 총괄·커밋·승인을 서브에이전트마다 판정 | 파일이 없는 칸(c1 브리프·c2 수집)은 판정 근거가 대화뿐이라 '확인 불가' N 이 잦고, 호출 수가 에이전트 수 × 칸으로 늘어남 → **판정 대상은 파일 산출물이 있는 곳으로** |
| ③ 턴 묶음 판정 | 2026-11-10 오전 | Stop 훅 turn-gate 가 턴 끝에 칸을 묶어(`c<N>-turn-…`·`bundle-turn-…`) 판정하고 N 이면 턴 종료를 막음 | P·X·T 칸에서 '확인 불가' N 반복, 서브에이전트 실행 중 '결과 없음'을 N 으로 판정, 차단이 상한(3/3)까지 반복. 실제 코드 결함은 c4 에서만 잡힘 → **턴 끝은 기록만, 차단 없음** |
| ④ 루프만(현행) | 2026-11-10 개정 | 파일을 바꾼 에이전트 → c4 원장 하나, 하네스는 AC-4 로 흡수 | 남은 과제 : 병렬 에이전트 scope 오귀속·gitignore 산출물 누락·시험 결과 누출 등은 [lessons.md](lessons.md) — 작성 시점 결함 5건 수정 진행 중 |

폐지된 래퍼 옵션 `--bundle`·`--skip-judge`·`--skip-reason` 은 호출자 없음(코드는 유지). 과거 c1·c2·c3·c5·c6·턴 묶음 원장 폴더는 보존하고 그래프 집계에서만 뺀다(`isLoopLedger`).
