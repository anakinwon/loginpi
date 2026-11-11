# 그래프 엔지니어링 with Obsidian — 생성기·표시 규칙·볼트 연결

> 정본 = `.claude/engineering/50. graph/anakins_graph.md`(B-6 요청 처리 흐름 그래프, B-6-1~B-6-3). 생성기 = `scripts/request-graph.mjs`.
> 옵션·표시 세부는 바뀔 수 있다 — 생성기 머리 주석·함수 주석과 정본을 직접 확인한다.

## 1. 생성기 사용법

| 명령 | 산출 | 커밋 |
|---|---|---|
| `node scripts/request-graph.mjs` | 실데이터판 `work-statistics/mywork/myRequestGraph.html` | gitignore |
| `node scripts/request-graph.mjs --md` | + 요청별 md `.claude/engineering/50. graph/requests/` | gitignore |
| `node scripts/request-graph.mjs --design-only --md` | 설계도판 `.claude/engineering/50. graph/myRequestGraph.html` + 슬롯 md `request-flow/` | 커밋 대상(요청문·비용 없음) |

옵션(머리 주석 기준) : `--out <html>` · `--days 7` · `--md [dir]` · `--delay <ms>` · `--trigger …`(훅이 넘기는 호출 출처 — 무시, 실행 기록 runs.jsonl 은 2026-11-10 폐지) · `--quiet`.

**자동 갱신** : Stop 훅 `work-stats-refresh.mjs`(턴 끝, `--md --quiet --trigger`) + SubagentStart/Stop 훅 `request-graph-refresh.mjs`(턴 중간, 2초 잠금).

**원천** : `work-history/` jsonl 턴·agent 레코드(Stop 훅 `work-history-logger.mjs` 가 기록) + Codex 원장 `.omc/state/loop/<id>/ledger.json` + 세션 기록 꼬리 스캔 + graph 에이전트 요약 캐시 `.omc/state/request-graph/summaries/<요청 id>.json`.

**판독 담당** : `anakin_phase-graph`(Sonnet·medium) — 산출 턴의 산출·검수 뒤·팀장 승인 앞에 생성기를 돌리고 이 요청의 '엔지니어링 N/5'·미수행·비정상 흐름을 보고한다. 간소 절차 턴(SKILL.md 3절 조건 ①~⑤ 전부 충족)은 이 단계와 팀장 승인을 생략한다.

## 2. 표시 규칙(2026-11-11 현행 요약)

| 규칙 | 내용 | 정본 절 |
|---|---|---|
| 칸 구성 | 설계도 9칸 : 1 · 1.1 · SA 5칸(1.1.1~1.1.5) · CDX-루프(1.1.4.1) · 1.2 | B-6, B-6-2 |
| CDX 칸 | CDX-루프 하나. 상태 = 원장별 마지막 판정 AND(전부 PASS = Y, FAIL 하나 = N, 진행·보류). 원장 없음 + 끝난 요청 + 파일 변경 실행 있음 = '⚠ 검증 누락' | B-6-2 |
| 묶음 원장 | `-p1`…`-pN` 은 판정 실행(판정 시각 묶음) 단위 AND — 묶음마다 기준 시각 시점 최신 확정 행 이월, 미래 행 금지. 머리 줄 '원장 <기준 id> (묶음 n개 AND)' | 생성기 `scripts/request-graph.mjs` `mergeParts` |
| 면제 | 열린 결함이 전부 근거 있게 면제된 FAIL 원장 = 'Y(면제)', 근거 확인 불가 = FAIL 유지 | 생성기 `waiverOf` · `codex_procedure.md` 13절 9항 |
| 이어받은 원장 | 같은 에이전트가 다음 요청까지 이어 처리한 c4 원장의 판정 결과를 앞 요청 CDX-루프 칸에 반영('이어받은 원장'·'최종 판정 이어받음') | 생성기 `buildRequestGraph` 주석 |
| 순차 연결 | 보이는 칸을 시작 → 1 → 1.1 → SA → 짝 CDX → … → 승인 → 종료로 잇는다. 승인 칸은 늘 경로에(미실행이면 '⚠ 승인 미실행' 점선). Y 아니어도 선은 잇는다 | B-6-3 C-3 |
| 에이전트 | 칸 안 줄 '<단계> ×n (회송 n-1) · 소요' — 독립 노드 없음 | B-6-3 C-5 |
| CDX 회차 | 칸 안 '<k>회 Y\|N\|BLOCKED HH:mm · 결함 n', 끝 줄 '→ k회 만에 완료 · 되돌림 n회' | B-6-3 C-6 |
| 쌍 표시 | 프롬프트·컨텍스트·그래프 SA = 모든 요청 / 하네스 SA = 도구·훅 주입 1건 이상 / 루프 쌍 = c4 판정 1회 이상 OR 파일 변경 실행 OR N 1회 이상 OR 반복 | B-6-3 C-7·C-8·C-13 |
| 쌍 배치 | CDX = 짝 SA 자식(depth+1). 세로 = 바로 아래 + 오른쪽 들여쓰기, 가로 = 바로 오른쪽. 번호 = SA 번호 + '-1' | B-6-3 C-11 |
| 칸 내용 | SA-프롬프트 = 원문 축약 / SA-컨텍스트 = 전·후·좌우·요점 내용 줄(구획 제목 없음) / SA-하네스 = 도구 시각순 / SA-루프 = 되돌림·반복 줄 | B-6-3 C-9·C-10·C-12 |
| 세로 배치 | 시작 = 1번 칸 왼쪽 같은 행, 승인 = 맨 아래 정중앙, 종료 = 승인 왼쪽(간격 같음). 가로·자유 배치는 종전 유지 | B-6-3 C-15 |
| 총괄승인 | 칸 삭제(2026-11-10 마스터 "총괄승인 칸 삭제하고, 볼트는 루트로 정리해 줘") — 최종 종료 승인 = 1.2 | B-6, B-6-2 |
| 보기 | 계층 트리 ↔ 자유 배치(Obsidian 스타일) 토글, 오른쪽 상세 창 접기(폴더블 — 상태 저장) | B-6 · 생성기 `setFold` |

폐지(이력) : Codex1~3·5·6 칸, 턴 묶음 판정 칸, ⛔ 정지 표지·'게이트 위반' 배지, verify 실행 줄(과거 기록은 숨김).

## 3. Obsidian 연결

### 3-1. 볼트 루트 = `.claude/engineering`

- 생성기 상수 `ENG` 주석과 `.claude/engineering/00. index.md` 머리 줄이 **볼트 루트 = `.claude/engineering/`** 로 정한다(마스터 확정 2026-11-08).
- 이유 : md 링크는 파일명 기준 `[[이름]]` 이라 정본 5종(`anakins_*`·`codex_procedure`)·역할 노드(`60. nodes/`)·목차(`00. index`)가 **같은 볼트 안**에 있어야 이어진다.
- 앱 설정 폴더 `.obsidian/` 은 gitignore(`.claude/engineering/**/.obsidian/`).

### 3-2. `[[위키링크]]` 규칙

- 파일명만 쓴다 — 폴더명은 쓰지 않는다(`[[anakins_graph]]`, `[[1.1.4 SA-루프]]`).
- 표시 이름은 파이프 : `[[anakins_graph|50 그래프]]`, `[[1.1.5 SA-그래프|7. SA-그래프]]`.
- 생성기 산출 md(`request-flow/`·`requests/`)는 손으로 고치지 않는다 — 다음 실행이 덮어쓴다.
- 요청별 md 이름 = `YYYY-MM-DD HHMM <세션 앞 8자>-<번호> <요청 앞부분>.md`(gitignore, 많이 쌓인다).

### 3-3. `requests/` 필터

요청 md 는 수가 많아 정본 구조를 가린다. 그래프 뷰 검색(필터)에 아래 중 하나를 쓴다.
- 구조만 보기 : `-path:"50. graph/requests"`
- 요청만 보기 : `path:"50. graph/requests"`

### 3-4. 색 그룹 — 볼트 루트의 `.obsidian/graph.json`(2026-11-10 이 값으로 시드 + `"showOrphans": true`)

```json
{
  "search": "-path:\"50. graph/requests\"",
  "showArrow": true,
  "colorGroups": [
    { "query": "file:\"CDX-\"", "color": { "a": 1, "rgb": 15029067 } },
    { "query": "file:\"SA-\"", "color": { "a": 1, "rgb": 5016565 } },
    { "query": "path:\"50. graph/requests\"", "color": { "a": 1, "rgb": 10395294 } },
    { "query": "file:anakins_ OR file:codex_procedure OR file:\"00. index\"", "color": { "a": 1, "rgb": 2991182 } }
  ]
}
```

- 색 : CDX 빨강(0xE5534B) · SA 파랑(0x4C8BF5) · 요청 회색(0x9E9E9E) · 정본 초록(0x2DA44E). `rgb` 는 10진 정수.
- 여러 그룹에 맞으면 위의 그룹 색이 이긴다 [확인중 : 앱 동작] — 좁은 조건(CDX)을 위에 둔다.
- 나머지 키(힘·크기 등)는 앱이 채운다 [확인중 : 앱 실행 후 파일 재확인]. 앱이 열려 있는 동안 파일을 고치면 앱이 덮어쓸 수 있다 → 앱을 닫고 쓰거나 앱 UI(그래프 뷰 → 그룹)로 설정한다.

### 3-5. 현재 상태(2026-11-10 볼트 루트 정리 뒤 확인한 사실)

| 항목 | 사실 | 확인 방법 |
|---|---|---|
| 등록된 볼트 | `…\loginpi\.claude\engineering`(루트) — 옛 하위 볼트 항목(id `edf370b4b7e63d1a`)의 path 만 바꿈(id 유지, 백업 `obsidian.json.bak-20261110`), OneDrive 개인 볼트 항목은 그대로 | Obsidian 앱 설정 `%APPDATA%\obsidian\obsidian.json` |
| 끊긴 링크 | 루트 `.claude/engineering` 기준 위키링크 555건 중 미해결 2건 — `00. index` 의 표기 예 `[[파일명]]`, `50. graph/.obsidian.md` 의 `[[Wikilinks]]`(점으로 시작하는 파일 = 앱 색인 밖이면 실질 1건 [확인중 : 앱 동작]). 옛 하위 볼트 `50. graph` 기준은 360건 중 77건 | node 스크립트(파일명·볼트 상대 경로 해석, `.obsidian/` 제외) |
| 앱 실행 | 실행 중 아님(obsidian 프로세스 0) | `Get-Process obsidian` |
| `graph.json` | 있음 — `.claude/engineering/.obsidian/graph.json`(3-4 값 + 고아 노드 표시). 설정 폴더는 `50. graph/.obsidian/` 에서 루트로 옮김(app·appearance·core-plugins·workspace 유지) | 폴더 목록 |
| 지금 보이는 그래프 | 생성기 HTML(실데이터판·설계도판) | — |
| 이력 | 2026-11-09 하위 볼트 `50. graph` 등록 → 2026-11-10 마스터 "총괄승인 칸 삭제하고, 볼트는 루트로 정리해 줘" 로 루트 단일 볼트로 정리. `.gitignore` 62행 `.claude/engineering/**/.obsidian/` 가 루트 설정 폴더도 덮음(61행 주석의 '하위 볼트 포함' 문구는 이력) | `git check-ignore -v` |

### 3-6. 개선 단계

**마스터 수작업**(앱 UI — Claude 가 대신하지 않는다)
1. Obsidian 실행 → 볼트 목록의 `engineering`(`…\loginpi\.claude\engineering`) 열기 — 2026-11-10 전역 등록 path 를 루트로 바꿔 '폴더를 보관함으로 열기'는 필요 없다.
2. (해당 없음) 옛 `50. graph` 볼트 항목은 같은 id 의 path 를 루트로 바꿨으므로 목록에 따로 남지 않는다.
3. 그래프 뷰 열기 → 필터에 3-3 검색어 → 그룹에 3-4 색 4개.
4. 끊긴 링크 확인 : 설정 → 파일 및 링크 → '미해결 링크' 또는 그래프 뷰 '존재하는 파일만' 해제 후 회색 노드 확인.

**Claude 작업**(요청 시, 산출 턴)
1. 볼트 루트 위키링크 미해결 검사 스크립트를 돌려 0~1건 확인(이 스킬 작성 때 쓴 계산과 같은 방식). — 2026-11-10 실행 : 555건 중 2건(3-5)
2. 볼트 루트 `.obsidian/graph.json` 시드 작성(신규 파일)(앱이 닫혀 있을 때만, gitignore 대상이라 로컬 전용). — 2026-11-10 완료
3. `00. index.md` 의 폐지 노드(verify) 정리·현행 흐름 반영 — 정본 수정이므로 별도 브리프.
4. 옛 `50. graph/.obsidian/` 정리 — 2026-11-10 루트 `.obsidian/` 으로 이동 완료(삭제 아님)
