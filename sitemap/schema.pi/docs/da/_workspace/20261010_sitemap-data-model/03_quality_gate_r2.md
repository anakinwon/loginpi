# 03_quality_gate_r2 — sitemap.pi 1차 데이터 모델 품질 재확인 (r2, #8 심사 지원)

- 잡 : `20261010_sitemap-data-model` / 단계 : 03 재게이트 / 점검자 : quality / 점검일 2026-10-10
- 대상 : `02_modeler_ddl.sql` **r2**(1,037행), `02_modeler_model.md` r2, 최종 문서 `sitemap/sitemap.pi/data-model/sitemaps-data-model.md`(747행)
- 기준 : `03_quality_gate_r1.md` 위반 목록 + `03_leader_quality-approval.md` 처리 판정(Q-P2-1~3·Q-P3-1~5·7·8 필수, Q-P3-6 허용(P-7), Q-P3-9 선택), 정본 v2.3, 01 §6 금지 어휘
- 요청 범위(leader) : gate.mjs 재실행(000→001→02 + 재적용), 탐침 1~3 기대값 + Q-P3-8 단언, 필수 항목 반영 여부, 신규 회귀(사이트별 advisory lock 교착·기존 단언). 최종 문서는 표본 점검

## 최종 판정 : PASS — 미해소 P1·P2 0건

| 등급 | r1 | r2 미해소 | 신규 |
|---|---|---|---|
| P1 | 0 | 0 | 0 |
| P2 | 3 | **0** | 0 |
| P3 | 9 | 필수 대상 0(Q-P3-6 허용·P-7, Q-P3-9 선택) | **1**(R2-1, 비차단) |

## 1. 실측 — gate.mjs(PGlite 0.2.17) 22/22 PASS

| 구분 | 단언 | 결과 |
|---|---|---|
| 적용 | 000_baseline → 001 → 02 r2, **02 재적용(멱등)** | PASS — `fn_sel_mbr_actv_yn`의 LANGUAGE를 sql→plpgsql로 바꾼 것도 CREATE OR REPLACE 재적용에서 오류 없음 |
| 탐침 1 | 501자 사유 → `site_mst_rjct_rsn_cont_check`(23514)로 **원천 거절** | PASS(r1 : 이력 CHECK에서 전이 실패 → 해소) |
| 탐침 2 | 같은 사이트 HOME_SLOT NEW 2건째 → `ALREADY_OCCUPIED: HOME_SLOT` | PASS(r1 : 2건 모두 생성 → 해소) |
| 신규 | HOME_SLOT 점유 중 PREMIUM30(구성에 HOME_SLOT 포함) → `ALREADY_OCCUPIED: PREMIUM30` | PASS — 묶음 구성 유형까지 겹침을 판정 |
| 회귀 | 같은 사이트의 다른 유형(CTGR_SLOT) 신규는 허용 | PASS — 과잉 차단 없음 |
| Q-P3-8 | 프로모 대상 외 상품(HOME_SLOT_7)에 promo_apl_yn='Y' → `PROMO_NOT_ELIGIBLE` | PASS |
| 탐침 3 | GRACE_DAY 논리삭제 → `fn_sel_mbr_actv_yn`이 `CFG_MISSING` 예외(정상 시 'Y') | PASS(r1 : 조용히 'N' → 해소, 트리거와 동작 일치) |
| Q-P3-1 | 신고 인용 정지 이력 `chg_rsn_cont` = 처리 내용('인용') | PASS |
| 기존 회귀 | 기준선 이력 19, 소유 확인 없는 승인 23514, 생성 이력 chgr_id=등록자, REQ-55 NONE 거절·BSC1 허용, REQ-44 자사 거절, 멤버십 site_id 거절, 인용 → SUSPENDED·RPT_ACCEPT·주문 회수, 제재 → 'N', 오인 취소 → 복귀·CMPN, sys_user 미확장 | 전부 PASS — r1 대비 회귀 없음 |

추가 실측 : da-ddl-guard Hook 재실행 결과, 승인 주석이 있으면 exit 0이고 주석을 떼면 `site_` R2 2건만 나옵니다(r1과 같고 리더 확정상 위반 아님). R7 경고 0, 신규 `_ord` 종결 0.

## 2. r1 위반 해소 대조

| ID | r1 내용 | r2 확인 | 판정 |
|---|---|---|---|
| Q-P2-1 | C-1 동시 배포·modr_id 확인 | 모델 371행 "⚠ 동시 배포 조건(C-1)", 최종 문서 666행 동시 배포 필수 + 23514 증상, 677행 ⑥ INSERT 시 modr_id 확인 항목 | ✅ 해소 |
| Q-P2-2 | P-6 FK 제약명 예외 본문 미기재 | 최종 문서 66행 규칙 명문화 + 관계표 ※P-6 표기(139·145행 등), 688행 "FK 7개" | ✅ 해소 |
| Q-P2-3 | 같은 사이트 중복 NEW | DDL 764-786행 사이트 lock + 소비 유형 교집합 판정, 실측 PASS | ✅ 해소 |
| Q-P3-1 | 인용 정지 사유 스냅샷 | DDL 191행 `rjct_rsn_cont = p_prcs_cont`, 실측 PASS | ✅ 해소 |
| Q-P3-2 | GRACE_DAY 누락 시 조용히 'N' | DDL 986-999행 plpgsql + CFG_MISSING, 실측 PASS | ✅ 해소 |
| Q-P3-3 | rjct_rsn_cont 길이 경계 | DDL 37-39행 `site_mst_rjct_rsn_cont_check ≤500`(멱등 DROP/ADD), 실측 PASS | ✅ 해소 |
| Q-P3-4 | 컬럼 COMMENT 부족(부분 필수 : 코드값·FK 컬럼) | COMMENT ON COLUMN 18 → **39**. 코드값(`chg_actn_cd`·`ord_sts_cd`·`snc_tp_cd`·`stk_scp_cd`)과 FK 컬럼 13개(신규 FK 13개와 1:1) 전부 확인. `promo_fee_cfg`는 코드값·FK 컬럼이 없어 대상 아님 | ✅ 해소(부분 범위) |
| Q-P3-5 | 승인 주석 형식·판 표기 | 1행이 "01 r3(leader r4 APPROVED) 준수 (2026-10-10)"로 끝남 | ✅ 해소 |
| Q-P3-6 | `ux_` 인덱스 명명 | 리더 허용, 정본 개정 제안 P-7 | — (허용) |
| Q-P3-7 | sys_cfg_chg_hist 대상 서술 3종 | DDL 276행 주석 "대상 4종", 300행 COMMENT에 `fee_plan_bnd` 포함 | ✅ 해소 |
| Q-P3-8 | 프로모 대상 상품 DB 미강제 | DDL 725-728행 `PROMO_NOT_ELIGIBLE`, 실측 PASS | ✅ 해소 |
| Q-P3-9 | 컬럼 정렬 | 선택 항목 — 미점검 | — |

## 3. 신규 회귀 점검 — 사이트별 advisory lock

**lock 순서(정적 분석)** : `fn_vrf_fee_ord_ins`의 NEW·RENEW 경로는 항상 ① `fee_site:<site_id>`를 잡고, 그다음 ② `fee_stk:<유형>:<범위>`를 `ORDER BY fee_tp_cd` 고정 순서로 잡습니다. 멤버십(사이트 lock 전에 RETURN)·EXTEND·CMPN은 lock을 잡지 않습니다. 사이트 정지 회수 트리거(B6-2)와 제재 트리거(B6-3)는 advisory lock을 쓰지 않고, 보상 CMPN INSERT는 멤버십 경로라 lock이 없습니다. → **트랜잭션당 주문 INSERT가 1건이면 모든 경로가 "사이트 → 재고(유형순)"로 같은 순서를 지키므로 교착이 생기지 않습니다.**

| ID | 내용 | 등급 | 근거 | 수정 권고 |
|---|---|---|---|---|
| **R2-1** | 한 트랜잭션에서 **서로 다른 사이트의 주문 2건 이상을 INSERT**하면 순서가 교차할 수 있음(Tx1 : 사이트 A → 재고 HOME → 사이트 B 대기 / Tx2 : 사이트 B → 재고 HOME 대기). PostgreSQL이 교착을 감지해 한쪽을 40P01로 중단하므로 무한 대기는 아니고 재시도로 회복됨. 현행 설계의 주문 생성 경로(approve 시 1건 INSERT)에는 해당이 없음. 최종 문서에 lock 순서와 "주문 INSERT는 트랜잭션당 1건" 전제가 없음(`fee_site` 0건, 545행은 재고 lock만 서술) | P3(비차단) | 모델 M-8 원자성 주장의 전제 미기재 | 최종 문서 §8-3에 "lock 순서 = 사이트 → 재고(유형순), 주문 INSERT는 트랜잭션당 1건(일괄 생성 RPC를 만들 때는 site_id 정렬 후 INSERT)"을 한 줄 추가 |

검증 한계 : PGlite는 연결이 하나라 동시 트랜잭션을 실행으로 재현할 수 없습니다. R2-1과 교착 없음 판정은 코드 경로 정적 분석에 근거합니다. 운영에 적용하기 전 Supabase(Postgres)에서 동시 2세션 approve 테스트를 권고합니다. hashtext 32비트 충돌은 불필요한 직렬화만 일으키고 정합성에는 영향이 없습니다.

## 4. 최종 문서 표본 점검

| 항목 | 결과 |
|---|---|
| 금지 어휘(01 §6 전 목록 + r2 폐기 약어, COMMENT 포함) | DDL·모델·최종 문서 **사용 0건**. 적중은 코드값 `LFTM_UPGRADE`(정본 r3 §9 "코드값 유지"), 금지 규칙 서술("`_st_cd` 금지"), 인용("BEAN/TOKEN/COIN 0건")뿐. r1에서 순화를 권고한 "토큰" 인용은 최종 문서에 없음 |
| DDL ↔ 최종 문서 객체명 | 표본 13종(ALREADY_OCCUPIED·PROMO_NOT_ELIGIBLE·site_mst_rjct_rsn_cont_check·CFG_MISSING·site_mv_url·upr_ord_id·sort_seq·img_seq·fee_ord_hist·ux_promo_fee_cfg_sngl·fn_prcs_site_rpt 등) 모두 양쪽에 존재. 예외는 `fee_site` lock(R2-1) |
| fee_ord 정의서 | DDL 업무 컬럼 19개 모두 최종 문서에 존재 |
| 신규 `_ord` 종결·ordr·move | 0건 |

## 5. 결론

r1의 P2 3건과 필수 P3 7건(Q-P3-4는 부분 범위)이 모두 DDL·문서 실물과 실측으로 해소됐습니다. 기존 단언에서 회귀는 없습니다. 신규 지적은 R2-1(P3, 문서 한 줄) 1건뿐이라 최종 승인을 막지 않습니다.

- 재현 : `node gate.mjs <repo_root>` — `tools/gate.mjs`(r2 기대값), r1판은 `tools/gate_r1.mjs` — 잡 임시 디렉토리에서 이 잡 디렉토리의 `tools/`로 보존 이동(2026-10-10, 실행법 `tools/README.md`)
