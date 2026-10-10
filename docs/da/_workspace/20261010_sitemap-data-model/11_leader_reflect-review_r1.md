# 11_leader_reflect-review_r1 — 재점검 반영본(#11) 리더 검토

- 대상 : `02_modeler_ddl.sql`·`02_modeler_model.md` r3, 최종 문서 1.1 / 판정자 : leader / 2026-10-10
- 점검 컬럼 수(보고·실측) : 전체 212 = 신규 152 / 승계 60(000 15 · 001 45) — 재점검 범위 충족
- **판정 : REJECTED (r1)** — 마스터 확정(10 판정서 §7) 미반영 P1. 반영본은 §7 이전의 #10 원판정 기준으로 작성됨

## 1. P1 — 마스터 확정 미반영

| # | 마스터 확정(§7) | 반영본 현황 | 수정 |
|---|---|---|---|
| M1 | V3~V7 이번 개명(`pi_usr_nm`·`pi_wlt_adr_txt`·`dsp_nm`·`lst_lgn_dtm`·`rjn_dtm`) | [확인중]·grandfathered 로 기재(최종 문서 776~780행 등) | 확정 개명표로 이동, 개명본 000 사본·RENAME 델타·동반 변경표(UNIQUE `ux_sys_user_pi_usr_nm_actv`, `@pi/auth` username 매칭, 임베드 3곳 선택 컬럼)에 반영, grandfathered 표에서 삭제 |
| M2 | J-3 신규 함수만 — 기존 `p_days`·`p_kind`·`p_obj` grandfathered | `p_day_cnt` 개명(Part A A4 DROP·재생성, 앱 ⑦/R-8) | A4·⑦·R-8·관련 단언 삭제, F-1 에 `p_days` 포함 3건 grandfathered(사유 : 기존 함수 계약, 추적처 : 정본 §10 잔여 위반) |
| M3 | 세션 필드(`userId`·`role` 등) 유지, DB 컬럼만 개명 — `@pi/db` 조회 계층 매핑 | 미결 #17 로 판정 요청 | 미결에서 삭제, 동반 변경표에 확정 사항으로 기재(`displayName` 등 세션 필드도 유지 — `dsp_nm` 매핑) |

## 2. 리더 판정

- **#16 role_cd 타입 → `VARCHAR(20)` 확정** : 정본 §1-2 도메인 Type·Length 한정 원칙(`cd` = VARCHAR(n)). 개명과 같은 배포라 추가 비용 없음. CHECK 값(ADMIN·USER) 유지.
- **⑧ PGRST201 신규 발견 수용** — 우수. `vrf_usr_id` FK 추가로 `site_mst→sys_user` FK 가 2개가 되어 `api/admin/sites/route.ts:29` 무힌트 임베드가 깨지는 실제 화면을 찾아냈다. Part A 동시 배포 필수 유지. M1 반영 후 표기는 `sys_user!site_mst_sys_user_id_fkey(pi_usr_nm)`.
- 재현 스크립트 보존(`02_modeler_pglite_check.mjs`)·new/rename 두 경로 검증·Hook R8 확인 : 수용. M1·M2 반영 후 재실행(단언 갱신 : 5컬럼 신명 존재·구명 부재, `p_days` 이름 호출 성공으로 원복).
- quality `tools/gate.mjs` 갱신 필요 사항은 #12 에서 처리.

## 3. 원인

리더 정정 메시지(§7 반영 지시)가 modeler 작업 중 도착해 원판정 기준으로 완료됐다(메시지 경합). 재작업은 §1 수정만.

---

## r2 판정 (2026-10-10) — **APPROVED**

- M1 sys_user 7컬럼 개명 반영(확정 개명표·개명본 000·멱등 RENAME 델타·단언·동반 변경표), M2 `p_day_cnt` DDL·최종 문서 0건(리더 grep 확인)·F-1 grandfathered 3건, M3 세션 필드 불변·`@pi/db` 매핑 원칙 확정 기재 — 확인.
- #16 `role_cd VARCHAR(20)` : 최종 문서 228·710·720·729·738행, RENAME 블록 ALTER COLUMN TYPE, 단언 반영 — 확인.
- 임베드 : 응답 키가 DB 컬럼명을 따르는 방식으로 admin-panel.tsx 타입·표시(R-5)를 함께 바꾸는 쪽으로 정리 — 수용(별칭 방식도 가능했으나 동반 변경표에 위치가 명시돼 있어 문제 없음).
- 점검 컬럼 : 전체 212 = 신규 152 / 승계 60(000 15·001 45), 위반 0·단일 단어 0, grandfathered = 함수 인자 3. PGlite new 40·rename 39 통과(modeler 보고).
- 다음 : #12 quality 재게이트 r3.

## r2 판정 정정 (2026-10-10, quality r3 Q3-P2-1·main 지적)

- 임베드 방식 **별칭으로 확정** : 관리자 사이트 목록 `sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`, 신고 목록 `sys_user(pi_username:pi_usr_nm)`. API 응답 키 `pi_username` 유지 → `admin-panel.tsx` 무변경. 근거 : 마스터 확정 "세션·API 응답 필드 불변, DB 컬럼만 개명"(10 판정서 §7)과 같은 변경 최소화 원칙.
- 원인 : 리더 r1 검토서 §2 가 FK 힌트 표기를 별칭 없이 적어(`...(pi_usr_nm)`) modeler 가 별칭을 제거했다 — 리더 표기 오류. r2 판정의 "응답 키 변경 수용"은 철회.
- 반영 : 최종 문서 앱 동반 ⑦·R-5 를 별칭 방식 한쪽으로만 기술, `admin-panel.tsx` 19·27·146·332 동반 변경 삭제.
