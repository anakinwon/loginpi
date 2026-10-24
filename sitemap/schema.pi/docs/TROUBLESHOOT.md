# schema.pi Trouble Shooting — 원인·결과·재발 방지

> 정본 위치 `sitemap/schema.pi/docs/TROUBLESHOOT.md` · R&R 정본 `docs/RNR.md` 4절(T1~T15)과 짝
> 기록 원칙 : 증상(결과·수치) → 원인(코드 위치) → 조치(커밋) → 재발 방지 규칙(`CLAUDE.md` '구축 결함 재발 방지') → 형제 점검 상태. 추측 금지, 미확정은 `[TBD]`·`[확인중 : 채널]`

---

## 2026-10-24 · TS-01 운영 모니터링에서 드러난 구축 결함 22건 (마스터 아나킨 → 파다완 아소카 부탁)

### 마스터의 문제 제기

> 구현도 아소카가 했고, 구현 후 실행의 문제 파악도 아소카가 했고, 문제를 해결하는 것도 아소카가 했는데, 왜 처음부터 문제를 발생시킬만한 문제를 만들지 않았으면 좋았겠다. 그런 문제를 troubleshoot에 구체적인 문제의 원인과 결과를 저장하고, 이후의 구축단계에서는 동일한 문제는 재발하지 말자.

### 판정

- **귀책 = 서비스(파다완 아소카) 전부.** 구축(3단계) 결함을 운영에 내보냈고, 모니터링(5단계)으로 다시 찾았고, AI 수정안 PR 로 하나씩 고객 결재(8단계)에 넘겼다
- 발생해야 할 이유는 없었다. 운영 구조(Vercel 함수 → 원격 Supabase, 조회 1회 = 네트워크 왕복 1회)와 성능 위험(루트 CLAUDE.md 데이터 패칭 표준)은 구축 전부터 알려져 있었다
- 놓친 이유 4가지
  1. **완료 기준이 정확성만 봄** — tsc·test·build·검토 통과 = 완료. 응답 시간·실패 경로는 기준에 없었다
  2. **시험 환경이 지연을 숨김** — PGlite 는 같은 프로세스라 왕복 ≈ 0ms, 직렬 await 비용이 시험에서 안 보인다
  3. **만든 쪽 = 검토한 쪽** — 검토 워크플로 관점이 정확성·보안뿐, 운영 지연은 아무도 안 봤다
  4. **같은 원인을 경로마다 따로 고침** — 직렬 조회 1개 원인을 PR 12건으로 쪼개 고객 결재로 넘김(비용을 고객에게 전가)

### 결과(운영 수치, `mon_app_hist` 10-21~24, 조회 2026-10-24 10:30 KST 전후)

| 경로 | 수정 전 요청/오류/느림 | 수정 후 | 관련 PR |
|---|---|---|---|
| `/api/dev/user` | 146 / 26 / 17 | 0 / 0 / 0 | #14 |
| `/api/areas/:id` | 354 / 3 / 124 | 183 / 0 / 3 | #11·#15 |
| `…/projects/:id/physical` | 180 / 4 / 53 | 3 / 0 / 1 | #17~#20·#32·#33 |
| `…/projects/:id/stage` | 298 / 8 / 42 | 3 / 0 / 0 | #27·#28 |
| `…/entities/:id/attributes` | 435 / 7 / 1 | 0 / 0 / 0 | #29 |
| `…/relations` | 146 / 4 / 1 | 5 / 0 / 0 | #30·#31 |
| `…/subjects/suggest` | 24 / 0 / 12 | 59 / 0 / 6 | #21~#23 |
| `…/subjects` | 68 / 0 / 13 | 69 / 0 / 3 | #26 |
| `…/words` | 75 / 0 / 24 | 0 / 0 / 0 | #24·#25 |
| `…/projects/:id/diagram` | 68 / 0 / 8 | 5 / 0 / 0 | #34·#35 |

- 전후 비교일 뿐 인과 증명 아님, 7개 경로는 수정 후 요청 0~5건(표본 작음) `[확인중 : 10-31 재조회]`
- 비용 : AI PR 27건(#9~#36, 반려 #16 제외) 병합·운영 배포 27회, 고객 결재 27회(별도 모집단 : 이력 테이블 `mon_ai_fix` 생긴 뒤 상태 DONE 22건 중 21건이 요청 0~3분 만에 승인)

### 원인 유형별 상세 (구축 결함 22건 + 결함 아님 5건)

#### P1 서로 독립인 DB 조회를 직렬 await — 12건 (느림)

| PR | 커밋 | 위치 | 직렬이던 것 |
|---|---|---|---|
| #11 | `474175e3` | `src/lib/api.ts requireAreaRole`, `api/areas/[areaId]/route.ts` | 멤버(`std_area_mbr`) → 요금제(`areaPlan`) — **모든 분류체계 API 가 거치는 공용 함수라 전 경로에 지연 전파** |
| #15 | `f6e19a21` | `api/areas/[areaId]/route.ts` | `requireAreaRole` → `std_area` |
| #17 | `c5b89aaa` | `…/physical/route.ts` GET | `mdl_prj`·`prjEnts`·`mdl_phy_mdl`·`listPhy` |
| #18 | `0887f161` | `src/lib/model-phy.ts phyPlan` | `loadLogical` → `std_tp_map` |
| #19 | `96de5ddb` | `…/physical/route.ts` 목록 | `mdl_phy_mdl` → `mdl_phy_tbl` |
| #20 | `d75d80a8` | `model-phy.ts loadPhy` | 칼럼 청크 → 인덱스 청크 |
| #21 | `b0bec25e` | `…/subjects/suggest/route.ts` | `mdl_prj`·`areaDict`·`std_dic` 2종·`mdl_subj` |
| #27 | `03ce82eb` | `src/lib/model-stage.ts stageInfo` | `loadLogical`·`mdl_ent`·`mdl_phy_mdl` |
| #28 | `109e5307` | `model-stage.ts setPhy` | `lg`·`dgmLock`·`entSubj` + 테이블별 `syncPlan` 순차 |
| #33 | `597994db` | `…/physical/route.ts`·`model-phy.ts` 미리보기 | 앞 묶음 → `loadLogical`·`std_tp_map` |
| #34 | `eba4d037` | `src/lib/model-dgm.ts loadDgm` | DB 6회 차례 대기 |
| #35 | `a3f7607c` | `src/lib/model-logical.ts loadLogical` | 프로젝트 확인 → 엔터티·속성·관계, `std_dic`·`std_dic_rel` |

#### P2 같은 결과를 반복 조회·중복 계산 — 3건 (느림)

| PR | 커밋 | 위치 | 내용 |
|---|---|---|---|
| #23 | `59f49c7b` | `src/lib/term.ts areaDict` | 입력 1글자마다 `std_dic` 를 1,000행씩 여러 번 직렬 재조회 → 분류체계·조회 칸별 단기 캐시 |
| #24 | `1c7b5fe9` | `api/areas/[areaId]/words/route.ts` | 선택지 조회(attr·key=Y)가 쓰지도 않는 `pendingChg` 호출 |
| #32 | `51289558` | `…/physical/route.ts`·`model-phy.ts` POST 전환 | 이미 계산한 `phyPlan`·`loadPhy` 를 `convertEntities` 가 다시 직렬 호출 |

#### P3 필요 이상 조회 — 2건 (느림)

| PR | 커밋 | 위치 | 내용 |
|---|---|---|---|
| #25 | `40b9a98a` | `words/route.ts` | 선택지에 전체 칼럼(`COLS`) + `count:'exact'`, 최대 1,000행 |
| #26 | `f503d17e` | `src/app/areas/[areaId]/model/use-subj.ts` | `prj_id` 필터를 서버가 아니라 클라이언트 메모리에서 — 전체를 받아 버림 |

#### P4 외부 호출을 요청 안에서 동기 대기 — 1건 (느림)

| PR | 커밋 | 위치 | 내용 |
|---|---|---|---|
| #22 | `c84cffeb` | `src/lib/wiki.ts` | ko.wikipedia.org 동기 호출, 최대 5초 지연 → 이름별 캐시·타임아웃 단축 |

#### P5 실패 경로(동시성·중복·잠금 상태) 미설계 — 3건 (오류)

| PR | 커밋 | 위치 | 내용 |
|---|---|---|---|
| #29 | `894aa4ac` | `…/entities/[entId]/attributes/route.ts` | 동시 등록 시 `attr_seq`·`pk_seq` 유일 충돌(23505) → 재계산 1회 재시도 |
| #30 | `323a748f` | `src/app/areas/[areaId]/model/relations.tsx` | 같은 부모·자식·관계명 중복을 등록 후에야 `REL_DUP` — 화면 사전 확인 없음 |
| #31 | `c15d03a6` | `relations.tsx` | 작성완료(잠금) 주제영역에서도 등록 버튼 활성 → 서버 `SUBJ_LOCKED` |

#### P6 개발 전용 코드가 운영에서 실행 — 1건 (오류 26건)

| PR | 커밋 | 위치 | 내용 |
|---|---|---|---|
| #14 | `398f14bc` | `src/app/dev-user-switch.tsx` | `useEffect` 가 `NODE_ENV` 검사 없이 `/api/dev/user` 호출 → 운영에서 불필요한 404 발생(요청 146 중 오류 26 — 전부가 아닌 이유 `[확인중 : mon_app_evt_hist 상태별]`) |

#### 결함 아님·별도 처리 — 5건

| PR | 커밋 | 분류 |
|---|---|---|
| #9·#10·#13 | `cd854ef9`·`57ac0c28`·`5ed25870` | 가짜 오류 — 로컬 dev 가 운영 DB 에 기록(RNR T2), `src/auth.ts` 변경 |
| #12 | `de51c169` | P1(#11)의 증상을 권한 캐시로 덮음 → 보안 저하, `003f0c51` 로 보정(RNR T4) |
| #36 | `e24867c1` | 진단용 구간 소요 기록(`words/route.ts`) |

### 재발 방지 규칙 (요약 — 정본은 `CLAUDE.md` '구축 결함 재발 방지', 문구가 다르면 정본 우선)

| 규칙 | 대상 | 구축 때 확인 |
|---|---|---|
| R-P1 | 직렬 조회 | 앞 결과를 쓰지 않는 `await` 가 연달아 있으면 `Promise.all`. 공용 함수(`requireAreaRole`·`loadLogical` 등)는 특히 먼저 |
| R-P2 | 반복 조회 | 한 요청 안에서 같은 조회·계산 2번 금지(계산 결과를 넘김), 입력마다 부르는 API 는 캐시·디바운스 |
| R-P3 | 과다 조회 | `select` 는 쓰는 칼럼만, `count:'exact'` 는 화면이 건수를 쓸 때만, 필터는 서버에서 |
| R-P4 | 외부 호출 | 요청 경로 안 외부 HTTP 는 타임아웃 ≤ 2초 + 캐시, 없어도 되는 값이면 비동기로 |
| R-P5 | 실패 경로 | 순번·유일값 생성은 충돌 재시도, 중복·잠금은 화면에서 먼저 막고 서버도 막음(둘 다) |
| R-P6 | 개발 전용 | dev 전용 호출·라우트는 운영 가드(`NODE_ENV`·`VERCEL_ENV`)가 첫 줄 |
| R-P0 | 원칙 | **서비스가 만든 결함은 고객 결재로 넘기지 않는다** — 같은 원인은 아소카가 `src/` 전체 grep 으로 형제까지 한 커밋에 고친다. 'PR 로 해결' 은 운영 데이터·환경에서만 생기는 문제용 |

### 한계 — 아직 장치가 아니라 규칙

- R-P0~P6 은 매 세션 로드되는 문장 규칙이고 자동 차단 장치가 아니다. 장치 후보 `[TBD]` : ① `select('*')`·`count:'exact'` grep 관문 ② 앞 결과를 안 쓰는 `await` 연속 탐지 점검 스크립트 ③ `api/dev/*` 호출 운영 가드 단위 테스트

### 형제 점검 상태

- 이번 22건은 모니터링에 걸린 경로만 고침 — 같은 유형(P1~P6)이 다른 경로에 남았는지 `src/` 전수 점검 `[TBD : 마스터 지시 시 S2 방식 — 패턴 · 매치 N · 처리 N 보고]`
