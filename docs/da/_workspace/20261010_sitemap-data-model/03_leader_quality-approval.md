# 03_leader_quality-approval — 품질 게이트 결과 승인

- 대상 : `03_quality_gate_r1.md` (판정 PASS·P2 조건부, P1 0·P2 3·P3 9) / 판정자 : leader / 판정일 2026-10-10
- **판정 : APPROVED** — 게이트 결과를 수용한다. P1 0 이므로 재게이트 없음. 아래 처리 지시를 최종 문서(#7)와 DDL 초안(r2)에 반영하고, 최종 승인(#8)에서 리더가 확인한다.

## 1. 게이트 신뢰성

- Hook 실제 실행, PGlite 독립 재실행(멱등 포함), 컬럼 토큰 역대조, 마스터 결정·REQ 실물 대조 — 작성자(modeler) 실측과 독립된 근거라 수용.
- quality 의 정정 2건(업무 함수 7개, P-6 대상 FK 7개) 수용 — 02 승인서 §1 정정 완료.

## 2. 항목별 처리 판정

| # | 판정 | 처리 |
|---|---|---|
| Q-P2-1 (C-1) | 필수 | (f)에 Part A·앱 승인 API 동시 배포 필수 + 23514 증상, INSERT 시 `modr_id` 확인 항목(현행 `api/me/sites/route.ts:74-75` 충족 사실 병기) |
| Q-P2-2 (C-2) | 필수 | c-2 에 P-6 규칙과 해당 FK 7개 명기 |
| **Q-P2-3** | **필수 — 결제 무결성 결함** | `fn_vrf_fee_ord_ins` NEW·RENEW 분기에 같은 site_id·같은 소비 유형 점유 주문(HELD 미만료·ACTIVE 미만료) 존재 시 `ALREADY_OCCUPIED`(P0001) 거절. 이중 결제·기간 중복을 막고 이어 구매는 EXTEND 로 유도. PGlite 재현 단언 추가 |
| Q-P3-2 | **필수로 상향** | 설정 1행 누락으로 유료 회원 전원 혜택이 조용히 박탈되는 위험. `fn_sel_mbr_actv_yn` 을 plpgsql 로 바꿔 누락 시 `CFG_MISSING` 예외(트리거와 동일 동작). 기본값 0일 처리는 채택하지 않는다(잘못된 설정을 숨김) |
| Q-P3-3 | **필수로 상향** | Part A 에 `site_mst_rjct_rsn_cont_check (rjct_rsn_cont IS NULL OR char_length(rjct_rsn_cont) <= 500)` ALTER 추가 — 원천에서 차단(트리거 절단은 근거 손실이라 불채택). 001 시드 영향 없음 확인 |
| Q-P3-1 | 필수(1줄) | `fn_prcs_site_rpt` 정지 시 `rjct_rsn_cont := p_prcs_cont` |
| Q-P3-8 | 필수(1줄) | 트리거에 `NEW.promo_apl_yn='Y' AND v_plan.promo_apl_yn<>'Y'` 거절(`PROMO_NOT_ELIGIBLE`) — M-8 단일 관문 원칙 일치 |
| Q-P3-4 | 부분 필수 | 코드값 컬럼(`chg_actn_cd`·`ord_sts_cd`·`ord_tp_cd`·`snc_tp_cd`·`snc_sts_cd`·`stk_scp_cd`·`fee_tp_cd`)과 신규 FK 컬럼에 COMMENT ON COLUMN 추가. 나머지는 003 확정 시 |
| Q-P3-5 | 필수(서식) | 승인 주석 끝에 `(2026-10-10)`, "01 r3(leader r4 APPROVED)"로 정정 |
| Q-P3-6 | 리더 확정 | `ux_<테이블>_<컬럼>_actv` 는 001 선례대로 허용, 정본 개정 제안 **P-7** 로 상신. `ux_promo_fee_cfg_sngl` 은 표현식 인덱스라 대상 컬럼이 없으므로 의미 명칭(sngl) 허용 — P-7 에 함께 기재 |
| Q-P3-7 | 필수(서식) | `sys_cfg_chg_hist` 주석·COMMENT 에 `fee_plan_bnd` 추가(4종) |
| Q-P3-9 | 선택 | 003 확정 시 정렬 |

## 3. 다음 단계

- #7 modeler : 위 필수 항목을 `02_modeler_ddl.sql`(r2)·`02_modeler_model.md`(r2)에 반영 → PGlite 재검증(신규 단언 : 중복 점유 거절·프로모 대상 거절·GRACE_DAY 누락 예외·501자 반려 거절) → 최종 문서 `sitemap/sitemap.pi/data-model/sitemaps-data-model.md` 편집.
- 반복 위반 패턴(주석·COMMENT 갱신 누락, quality §Q4~Q6) — 최종 문서 편집 시 DDL 주석↔CHECK↔문서 3자 대조를 자체 점검 항목으로 둘 것.

## 4. 정본 개정 제안 누적

P-1~P-4 · D-2 · P-5 · P-6 · **P-7(부분 UNIQUE `ux_<테이블>_<컬럼>_actv`·표현식 인덱스 의미 명칭 명문화)**
