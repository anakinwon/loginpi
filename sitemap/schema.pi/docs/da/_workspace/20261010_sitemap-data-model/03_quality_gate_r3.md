# 03_quality_gate_r3 — 재점검 반영본 전 객체 품질 게이트 (r3, #12)

- 잡 : `20261010_sitemap-data-model` / 단계 : 03 재게이트 / 점검자 : quality / 점검일 2026-10-10
- 대상 : `02_modeler_ddl.sql` r3, `02_modeler_model.md` r3(§k), 최종 문서 `sitemap/sitemap.pi/data-model/sitemaps-data-model.md` 1.1(§5-0·§10-1~§10-5), 재현 스크립트 `02_modeler_pglite_check.mjs`, **모델 부속 산출물** `05_erd_inventory.json`·`sitemap/sitemap.pi/data-model/erd/*`
- 기준 : 정본 `데이터표준규칙.md` **v2.4**(§1-3 단일 표준단어 금지, §10 #22), `품질점검기준서.md` §3 P2(단일 단어·승계 포함 2항목 추가), `10_leader_reinspection-decision.md`(**§7 마스터 확정 우선**), leader r3 확인 항목, da-quality 정의(점검 범위 = 전 객체)
- **점검 범위 원칙(r1 반성)** : r1 E-4는 신규 컬럼 84개만 대조하고 승계 컬럼(000 `sys_user`·001)을 빼서 `sys_user.id`·`role`을 놓쳤다(정본 §10 #22 원인 중 quality 몫). 이번에는 **승계 객체를 포함해 전부 점검**했고, 원본 파일에 남은 위반도 빼지 않고 표기했다.

## 최종 판정 : P1 차단 (1건) — 해소 후 r4

| 등급 | 건수 | 내용 |
|---|---|---|
| **P1** | **1** | Q3-P1-1 ERD 부속 산출물(인벤토리·`.erd`·`.png`)에 `sys_user` 구명 잔존 |
| **P2** | **1** | Q3-P2-1 R-5 응답 키 변경 → **leader 확정 : 별칭 방식**(`admin-panel.tsx` 무변경, 응답 키 변경 예외 불허). modeler 수정 지시됨 — r4에서 ⑦·R-5·모델 §k 일관성 확인 |
| **P3** | **3** | 문서 단언 수 표기, 경로별 리터럴 캐스트 차이, 원본 파일 구현 전 상태 표기 |

DDL·임시 000/001 사본·모델 문서·최종 문서 본문의 개명은 **모두 정확**합니다(§2~§4). 차단 사유는 ERD 부속 산출물 1건뿐입니다.

## 1. 점검 범위 — 전 객체 (전체 / 신규 / 승계)

| 구분 | 테이블 | 컬럼 수 | 단일 단어 | 도메인 미종결 | 비고 |
|---|---|---|---|---|---|
| 신규(02) | 10 | **152** | 0 | 0 | CREATE 147 + ALTER ADD 5 |
| 승계 000 `sys_user` | 1 | **15** | 0 | 0 | 개명 7건 반영 후(임시 사본). 원본 000은 §5 Q3-P3-3 |
| 승계 001 | 3 | **45** | 0 | 0 | `site_mst` 21·`site_rpt` 14·`stat_site_dly` 10 |
| **합계** | **14** | **212** | **0** | **0** | |
| 함수 인자 | 5 | — | grandfathered 3 | — | `p_kind`·`p_obj`(000 `fn_grant_svc_only`)·`p_days`(001 `fn_sel_stat_site_chg`) — F-1 표기 확인. 02 신규 함수 인자 5종 적합 |

출처 : quality `scan_all.mjs`로 PGlite에 개명 000 사본 → 개명 001 사본 → 02를 적용한 뒤, information_schema를 적용 단계별로 분류해 셌습니다. modeler 수치(212 = 152 / 60), standards 09 수치와 **일치**합니다. 참고로 modeler 스크립트의 "inherited 65"는 site_mst에 Part A로 추가된 5컬럼을 승계 테이블 쪽에 넣어 센 정의 차이입니다.

## 2. 실측

| # | 검증 | 결과 |
|---|---|---|
| E-1 | **modeler `02_modeler_pglite_check.mjs` 독립 재실행**(new·rename) | new **40건**·rename **39건** 통과 |
| E-2 | **quality `tools/gate.mjs` r3 갱신판**(신규 컬럼명 + new/rename 두 경로, 델타는 최종 문서 §10-2 블록에서 직접 추출) | new **31/31**·rename **33/33** PASS(차이는 적용 단계 수 — rename은 델타 2회 적용 포함). 탐침 1~3·Q-P3-1·Q-P3-8·Q-P2-3(ALREADY_OCCUPIED)·REQ-44·REQ-55·제재·회수 등 **r2 단언 22건 회귀 0**, r3 단언 9건 추가(구명 7 부재·신명 7 존재·`role_cd` VARCHAR(20)·CHECK·UNIQUE 신명만·sys_user 참조 FK 6/6 `usr_id`·활성 `pi_usr_nm` 중복 23505·단일 단어 0·`p_days` 이름 호출·001 FK 조인) |
| E-3 | **델타 = 프렐류드 대조**(quality 독립 `rename_prelude.sql` + `role_cd` TYPE) — 컬럼·타입·NULL·기본값·제약·인덱스·함수 시그니처 전체 비교 | **IDENTICAL** — 불일치 P1 없음 |
| E-4 | 델타 멱등(REN vs REN+델타 재실행) | **IDENTICAL** |
| E-5 | 신규 DB 경로(NEW) vs 기적용 DB 경로(REN) 최종 스키마 | 의미는 동일. `role_cd` 기본값·CHECK 식의 **리터럴 캐스트 표기만** 다름 → Q3-P3-2 |
| E-6 | **da-ddl-guard 실제 실행(R8 포함)** | 02 r3 : exit 0(주석을 떼면 R2 `site_` 2건뿐) / 개명 000 사본·개명 001 사본 : exit 0 / **원본 000 : R8 `id`·`role` 차단 + R7 3건** — R8이 동작함을 확인. `last_login_dtm`·`rejoin_dtm`(미등재 단어)은 R7이 잡지 못함(도메인 종결) → 사전 대조로만 검출 가능 |

## 3. leader r3 확인 항목

| 항목 | 결과 | 근거 |
|---|---|---|
| 전 객체 212컬럼 분리 보고 | ✅ | §1 |
| 구명 7건 잔존 0 — **DDL·임시 사본·문서 본문** | ✅ | 02 DDL 실제 사용 0(헤더 8행 주석의 "001 `REFERENCES sys_user (id)` 2곳은 구현 단계에서 수정"은 설명), `REFERENCES sys_user (usr_id)` 4곳. 모델·최종 문서의 구명은 개명표·델타 블록·매핑표·"구 X" 표기 안에만 있음(실제 사용 0) |
| 구명 7건 잔존 0 — **ERD 부속 산출물** | ❌ | **Q3-P1-1** |
| `p_day_cnt` 잔존 0 | ✅ | 02·모델·최종 문서 0건(09·10·11 판정 기록 문서에만 이력으로 존재) |
| 단일 단어 0 | ✅ | E-2·§1 |
| 함수 인자 grandfathered 3건 표기 | ✅ | 최종 문서 §10-4 F-1, 모델 §k |
| 세션 필드 불변·`@pi/db` 매핑 | ✅ | §10-3 매핑 원칙 + 매핑표 7행(`usr_id`→`UserRow.id`→`userId` 등). `packages/pi-auth/src/route.ts`의 `u.pi_username`·`u.role`은 TS 레코드 필드라 무변경이 맞음(R-6 정합) — 실제 코드로 확인 |
| 임베드·PGRST201 힌트 동시 배포 | ❌ → Q3-P2-1 | PGRST201 힌트·동시 배포 표기는 있음(§10 ⑦·R-5). 현행 문서는 응답 키 변경 방식 — **leader 최종 확정은 별칭 방식**(`sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`·`sys_user(pi_username:pi_usr_nm)`, admin-panel 무변경). R-5 위치 표본 대조(`admin/sites/route.ts:29`·`admin/reports/route.ts:30`·`admin-panel.tsx` 19·27·146·332)는 일치 |
| `role_cd` VARCHAR(20) | ✅ | 실측 `character varying(20)`(두 경로), 문서 §10-1·§10-2 |
| 회귀(Q-P2-3 등 r1·r2 해소 단언) | ✅ | E-2 r2 단언 22건 전부 PASS |
| 동반 변경표 앱 참조 대조 | ✅ | `users.ts` `.from('sys_user')` **11곳** 실측 일치, R-3 표본 행(72·91·119·289) 실제 코드와 일치, 임베드 실측 2곳(`admin/sites:29`·`admin/reports:30`) + 화면 `admin-panel.tsx` 4곳(19·27·146·332) = R-5 표기와 일치 |
| 표준단어 7종 등재(ROLE·WLT·ADR·DSP·LST·LGN·RJN) | ✅ | 01 사전 각 1건 |

## 4. 위반 목록

| ID | 위반 항목 | 등급 | 근거 조항 | 위치 | 수정 권고 |
|---|---|---|---|---|---|
| **Q3-P1-1** | **ERD 부속 산출물에 `sys_user` 구명 잔존** — `05_erd_inventory.json`(20:47)에 `id`·`pi_username`·`pi_wallet_address`·`display_name`·`role`·`last_login_dtm`·`rejoin_dtm`이 그대로 있음. 이를 원천으로 만든 `erd/sitemaps-data-model.erd`(21:27)·`.png`(21:35)도 개명 전 상태(`.erd`에서 구명 5종 검출). 생성기 `gen-sitemaps-erd.mjs`의 기본 원천도 원본 000이라 지금 다시 돌려도 구명이 나옴. 최종 문서 §13이 `erd/`를 산출물로 등재하고 있음 | **P1** | leader 판정 §2 반영처 "모델·DDL 초안·**ERD**", leader r3 기준 "구명 잔존 = P1", 정본 v2.4 §1-3 | `05_erd_inventory.json` sys_user 블록, `sitemap/sitemap.pi/data-model/erd/*` | ① 인벤토리 sys_user 7컬럼명(+FK 참조 표기)을 개명 ② 생성기를 개명 000·001 임시 사본으로 실행(`--sql <개명000>,<개명001>,02` — 실제 000 무수정 원칙 유지) ③ `.erd`·`.png` 재생성 ④ README 원천 서술에 "000·001은 개명 임시 사본" 명시 |
| **Q3-P2-1** | **R-5가 관리자 API 응답 키를 `sys_user.pi_username` → `sys_user.pi_usr_nm`으로 바꾸고 화면 타입까지 고치는 방식** — §7 마스터 확정은 "세션·**API 응답 필드 불변**, 조회 계층 매핑"인데, 관리자 사이트·신고 목록 API의 응답 필드가 바뀜. leader r3 확인 항목도 별칭 `sys_user(pi_username:pi_usr_nm)`을 전제로 함 | P2 — **지적 유효 → 리더 판정 : 별칭 방식 확정, modeler 수정 대기**(응답 키 변경 예외 불허, 11_leader_reflect-review_r1 "판정 정정") | `10_leader_reinspection-decision.md` §7 세션 필드 행, 최종 문서 §10-3 매핑 원칙("세션·API 필드명은 그대로") 자기 모순 | 최종 문서 §10 ⑦·§10-3 R-5, 모델 §k 대응 행 | PostgREST 별칭으로 응답 키를 보존 : `sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`·`sys_user(pi_username:pi_usr_nm)`. `admin-panel.tsx`는 **무변경**으로 R-5에서 제외(→ R-6). 응답 키 변경을 택하려면 마스터 확정 예외로 leader 판정 필요 |
| Q3-P3-1 | 단언 수 표기 불일치 — 최종 문서 §11·모델 8행은 "new 39 / rename 38", modeler 통보와 실측(E-1)은 **40 / 39** | P3 | 품질점검기준서 §3(문서 정합) | 최종 문서 829행, 모델 8행 | 40 / 39로 정정 |
| Q3-P3-2(선택·비차단 — leader) | 두 경로 최종 스키마의 리터럴 캐스트 표기 차이 — NEW `DEFAULT 'USER'::character varying`·CHECK `ARRAY['ADMIN'::character varying,…]` vs REN `'USER'::text`·`ARRAY['ADMIN'::text,…]`. 동작 동일, 스키마 diff 도구(환경 간 드리프트 점검)에서는 차이로 잡힘 | P3 | — | §10-2 (2) 델타 | 선택 : 델타에 `ALTER COLUMN role_cd SET DEFAULT 'USER'` + CHECK 재생성(DROP/ADD)을 추가하면 두 경로가 텍스트까지 같아짐. 아니면 "의미 동일·표기 차이" 한 줄 기재 |
| Q3-P3-3 | 원본 `packages/pi-db/sql/000_baseline.sql`·`001` 텍스트에 구명이 남아 있고 Hook R8에 차단됨(`id`·`role`) — **이번 범위상 정상**(00_input §3-2, 구현 단계 같은 배포에서 R-1·R-2로 수정). 위반이 아니라 추적 표기 | P3(추적) | 정본 §10 #22(고치지 않는 객체도 점검·표기) | 원본 000 91~98행, 001 86·202행 | 최종 문서 §10-4에 "원본 000·001 텍스트 = 구현 단계 R-1·R-2 대기(현재 R8 차단 상태)" 한 줄 추가 권고 |

## 5. 직전 보고서 대비

| 항목 | 이번 |
|---|---|
| r1 E-4 범위 누락(승계 제외) | **재발 방지 적용** — 전 객체 212컬럼 스캔 + 원본 파일 R8 실행으로 승계 위반 표기 |
| r2 해소 단언(Q-P2-3·Q-P3-1~3·8) | 회귀 0(E-2) |
| r2 R2-1(lock 순서 문서화) | 범위 밖(이번 변경과 무관) — 유지 |
| 새 유형 | **부속 산출물(ERD)의 동기화 누락** — DDL·문서는 고쳤지만 그 파생물(인벤토리→ERD)이 남음. 재발방지 : 개명·스키마 변경 시 "파생 산출물 목록(ERD 인벤토리·생성물·재현 스크립트)"을 동반 변경표에 고정 항목으로 둘 것 |

## 6. 재현

- `tools/gate.mjs` — **r3로 갱신**(신규 컬럼명, `node gate.mjs <repo_root> new|rename`). r2 기대값은 `tools/gate_r2.mjs`로 보존
- `tools/scan_all.mjs` — 전 객체 컬럼·함수 인자 스캔(게이트 후 복사), `tools/compare_r3.mjs`·`tools/rename_prelude.sql` — 델타 = 프렐류드·두 경로 비교
- 한계 : PGlite 단일 연결(동시성 미검증), 운영 Supabase 미적용, 운영 `std_dic` 역검증 미수행(문서·등재 SQL 기준)
