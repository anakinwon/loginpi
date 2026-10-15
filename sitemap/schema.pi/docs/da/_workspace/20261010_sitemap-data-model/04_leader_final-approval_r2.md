# 04_leader_final-approval_r2 — 재점검 반영본 최종 승인 (#13)

- 대상 : 최종 문서 `sitemap/sitemap.pi/data-model/sitemaps-data-model.md` 1.1, `02_modeler_ddl.sql`·`02_modeler_model.md` r3, ERD 부속(`05_erd_inventory.json`·`erd/*`), `01_standards_dictionary.md`(§8 51행·§10-2) / 판정자 : leader / 2026-10-10
- 근거 : `09_standards_reinspection.md`, `10_leader_reinspection-decision.md`(§7 마스터 확정), `11_leader_reflect-review_r1.md`(r1 반려 → r2 승인 → 별칭 판정 정정), `03_quality_gate_r3.md`·`r4.md`(최종 PASS)
- **판정 : APPROVED**

## 1. 점검 범위 (전 객체)

| 구분 | 컬럼 수 | 위반 | 처리 |
|---|---|---|---|
| 전체 | 212 (14 테이블) | 7 → 0 | |
| 신규(02) | 152 | 0 | — |
| 승계 000 `sys_user` | 15 | 7 | 7건 전부 이번 개명 |
| 승계 001 | 45 | 0 | — |
| 함수 인자(참고) | 13 | 3 | grandfathered(`p_kind`·`p_obj`·`p_days` — 기존 함수 계약, 추적처 정본 §10) |

standards(09)·quality(information_schema 실측)·modeler 3자의 수치가 일치한다. 단어 하나짜리 컬럼 0, 도메인 미종결 0.

## 2. 위반 처리 결과

- 개명 확정 7건 : `id→usr_id` · `role→role_cd`(VARCHAR(20)) · `pi_username→pi_usr_nm`(활성 UNIQUE `ux_sys_user_pi_usr_nm_actv`) · `pi_wallet_address→pi_wlt_adr_txt` · `display_name→dsp_nm` · `last_login_dtm→lst_lgn_dtm` · `rejoin_dtm→rjn_dtm`. 대상은 sitemap DB이고 cafe.pi DB는 변경하지 않는다.
- 세션·API 응답 필드 불변 : `@pi/db` `users.ts` 한 곳에서 매핑. 관리자 임베드는 별칭으로 응답 키 `pi_username` 유지 — `sys_user!site_mst_sys_user_id_fkey(pi_username:pi_usr_nm)`, `sys_user(pi_username:pi_usr_nm)`. `admin-panel.tsx` 무변경.
- 표준단어 등재 7개 : ROLE(마스터 지정 4자 예외)·WLT·ADR·DSP·LST·LGN·RJN — 등재 SQL 51행.
- 신규 발견 결함 반영 : `vrf_usr_id` FK 추가 시 관리자 사이트 목록 임베드 PGRST201 → FK 힌트를 Part A 동시 배포 필수 항목으로 지정(⑦).

## 3. 검증

- quality r4 : P1·P2 0. gate new 31/31·rename 33/33, modeler 스크립트 new 40·rename 39(독립 재실행), Hook R8 02 exit 0(원본 000 은 R8 이 id·role 차단 — 원결함 탐지 확인), ERD 생성기 재현성 확인.
- 리더 확인 : DDL 구명·`p_day_cnt` 0건(grep), 최종 문서 ⑦·R-5 별칭 단일 기술.

## 4. 라운드 이력 (재점검)

#9 재점검 → #10 판정(이후 마스터 확정 §7 우선) → #11 r1 반려(마스터 확정 미반영 — 메시지 경합) → r2 승인(role_cd 조건) → 임베드 별칭 판정 정정(리더 r1 표기 오류) → #12 r3(P1 ERD·P2 별칭) → r4 PASS → #13 승인.

## 5. 리더 오류 기록

- 1차 승인에서 승계 객체를 점검하지 않음(§10 #22 원인 ⑥ 승인 단계 몫).
- r1 검토서에 임베드 FK 힌트를 별칭 없이 적어 modeler 가 별칭을 제거하게 했고, r2 에서 응답 키 변경을 한때 수용했다가 철회.

## 6. 잔여 (비차단)

- 구현 단계 동반(같은 배포) : R-1 `000_baseline.sql`, R-2 001 REFERENCES 2곳, `@pi/db`·`@pi/auth`, 임베드 별칭 2곳, Part A 동시 배포(⑦ 포함) — 상태 열 "구현 대기"로 추적.
- P3 : Q3-P3-2 리터럴 캐스트 표기(선택), Q-P3-9 컬럼 정렬(003 확정 시), R2-1 2세션 동시 approve 테스트(운영 전).
- 미결 : #18 cafe 가 공용 패키지로 옮겨 올 때 cafe DB 개명 선행 [확인중 : 마스터] 외 1차 미결(문서 §12).
