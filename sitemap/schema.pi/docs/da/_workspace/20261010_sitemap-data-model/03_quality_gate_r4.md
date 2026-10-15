# 03_quality_gate_r4 — 재점검 반영본 재게이트 (r4, #12)

- 잡 : `20261010_sitemap-data-model` / 점검자 : quality / 점검일 2026-10-10
- 대상 : modeler r4 수정분 **+ P2 별칭 반영 추가판(일괄 재점검)** — `05_erd_inventory.json`, `sitemap/sitemap.pi/data-model/erd/`(`gen-sitemaps-erd.mjs`·`.erd`·`.png`·README), 최종 문서 §10 ⑦·§10-3(R-1~R-6 + 상태 열)·§11·§13, 모델 8행·§k R-5 + 회귀(02 DDL r3·문서 전체)
- 기준 : `03_quality_gate_r3.md` 위반 목록, leader 판정(Q3-P2-1 = **별칭 방식 확정**, 응답 키 변경 예외 불허 / Q3-P3-2 선택·비차단)

## 최종 판정 : PASS — 미해소 P1·P2 0

| 등급 | r3 | r4 미해소 |
|---|---|---|
| P1 | 1 | **0** |
| P2 | 1 | **0** |
| P3 | 3 | 2(비차단 — Q3-P3-2 선택, Q3-P3-3 추적) |

1차 점검(추가판 이전)에서는 P2 조건부였습니다. 별칭이 아직 반영되지 않았기 때문이고, modeler 추가판으로 해소됐습니다.

## 1. r3 위반 해소 대조

| ID | 확인 | 판정 |
|---|---|---|
| **Q3-P1-1** ERD 구명 잔존 | `05_erd_inventory.json`·`.erd` 구명 grep **0건**(pi_username·pi_wallet_address·display_name·last_login_dtm·rejoin_dtm·sys_user.id·pi_username_actv·"role") / 인벤토리 sys_user 15컬럼 = usr_id·pi_uid·pi_usr_nm·pi_wlt_adr_txt·dsp_nm·role_cd(VARCHAR(20))·lst_lgn_dtm·rjn_dtm·…, sys_user 참조 FK 6곳 전부 usr_id / `.erd` JSON 파싱 : 컬럼 212·단일 토큰 0 / **생성기 독립 재실행**(임시 출력) : "테이블 14 · 컬럼 212 · FK 17, 인벤토리와 차이 0건", 저장소 `.erd`와 테이블·컬럼·타입 구조 **동일**(재현 가능) / **PNG 육안 확인** : sys_user에 개명 7컬럼·`role_cd VARCHAR(20)` 렌더링, 관계선 유지 | ✅ 해소 |
| **Q3-P2-1** R-5 응답 키 변경 | 최종 문서 ⑦(700행)·R-5(791행), 모델 R-5(580행) **3곳 모두 별칭 방식 한쪽으로만 기술** : 관리자 사이트 목록 `sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`(PGRST201 힌트 포함), 신고 목록 `sys_user(pi_username:pi_usr_nm)`(FK 1개라 힌트 불필요). 별칭 없는 `sys_user(pi_usr_nm)` 임베드 표기 0건. `admin-panel.tsx` 동반 변경 항목(19·27·146·332) 삭제 — "화면 무변경"으로만 언급. 동반 변경표에 상태 열 추가(R-1·R-2 구현 대기 + 반영 확인 기준, R-3~R-5 구현 대기, R-6 해당 없음). **최종판 재확인** : R-6(최종 문서 792행·모델 581행)에 "임베드 응답 키 불변(R-5 별칭) + `admin-panel.tsx`(19·27·146·332) 무변경" 이동 확인, 별칭 없는 임베드 0건, 남은 `(pi_usr_nm)`은 활성 UNIQUE 인덱스 정의뿐 | ✅ 해소 |
| Q3-P3-1 단언 수 | 최종 문서 829행·모델 8행 = **40 / 39**(실측과 일치) | ✅ 해소 |
| Q3-P3-2 리터럴 캐스트 표기 | leader : 선택·비차단 | — (잔여, 비차단) |
| Q3-P3-3 원본 000·001 추적 | 동반 변경표 R-1·R-2 상태 "구현 대기" + 반영 확인 기준 기재 | — (추적, 비차단) |

## 2. 회귀 (추가판 문서 기준 재실행)

| 검증 | 결과 |
|---|---|
| `tools/gate.mjs` r3 — §10-2 델타를 추가판 문서에서 다시 추출 | new **31/31** · rename **33/33** PASS(r2 단언 22건 + r3 단언 9건) |
| modeler `02_modeler_pglite_check.mjs` | new **40** · rename **39** 통과 |
| 전 객체 스캔 `tools/scan_all.mjs` | 전체 **212** / 신규 **152** / 승계 **60**(000 15 · 001 45), 테이블 14, 단일 토큰 0, 도메인 미종결 0, 함수 인자 grandfathered 3(`p_kind`·`p_obj`·`p_days`) |
| da-ddl-guard(R8 포함) 02 r3 | exit 0 |

## 3. 결론

r3 위반(P1 1·P2 1·P3 1)이 모두 해소됐고 회귀는 0입니다. 남은 2건은 비차단입니다. → **#13 DA 최종 승인 진행 가능.**

- 재현 : `tools/gate.mjs <repo_root> new|rename` · `tools/scan_all.mjs` · `tools/compare_r3.mjs`(+`rename_prelude.sql`), ERD는 `erd/gen-sitemaps-erd.mjs`(000·001 개명 메모리 사본)
- 한계 : PGlite 단일 연결(동시성 미검증), 운영 Supabase 미적용, 운영 `std_dic` 역검증 미수행
