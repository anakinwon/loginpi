# 01_leader_standards-approval_r4 — 표준사전 개정 승인 (마스터 약어 규칙 변경)

- 대상 : `01_standards_dictionary.md` (작성자 표기 r3 — 마스터 지시 2026-10-10 약어 규칙 개정본) / 판정자 : leader / 판정일 2026-10-10
- 기준 : 정본 `데이터표준규칙.md` **v2.3**(신규 단어 자음 위주 2~3자·현장 최빈형, 이동 MV·주문 ORD, `ord` 도메인 신규 금지→`seq`, 기존 등재·grandfathered 유지)
- 이전 승인 : r3 APPROVED(01_leader_standards-approval_r3.md) — 본 판정은 개정분만 심사
- **판정 : APPROVED**

## 1. 확인 결과

| 항목 | 결과 |
|---|---|
| MV·ORD 지정 반영 | ✅ `site_mv_url`, `fee_ord`·`ord_id`·`ord_sts_cd`·`ord_pi_amt`·`ord_usr_id`·`upr_ord_id`. 잔존 `ordr`·`move` 는 폐기·교정 기록 문맥뿐(grep) |
| `ord` 도메인 신규 금지·`seq` 통합 | ✅ §3 `seq` 행 신설(INT/BIGINT), `sort_seq`·`img_seq`. 신규 `_ord` 종결 0건 |
| 신규 21개 재검토 | ✅ 15 변경·8 유지, 유지 사유(이미 2~3자, DAY 현장 최빈·DD 날짜 포맷 혼동) 타당 |
| 충돌 회피 판단 | ✅ 수용 — LIST→NRM(cafe `lst`=last), RLSE→REL(RLS=Row Level Security, 정본 §7), PRNT→UPR(공공 표준 관행 '상위=UPR'과도 일치), ROOT→FST, INFL→IFL('infinity' 금지값 혼동), MV 는 객체명 접두 `mv_` 사용 금지 명기 |
| 등재 SQL | ✅ 44행 실측, 약어 중복 0 |
| 기존 등재·grandfathered·001 단어 | ✅ 유지(재명명 없음) |

## 2. 관찰(P3, 승인 조건 아님)

- `LFT`(영구, lifetime) : 'left' 로 오독될 여지가 있다. 대안(PRM — 영구 permanent)은 요금제 코드값 PRM1·PRM2(프리미엄)와 충돌하므로 LFT 유지가 상대적으로 낫다. 등재 설명에 "lifetime(영구)" 명기를 유지할 것.
- `BND`(묶음) : bond 와 동형이나 sitemap 범위에 채권 개념이 없어 충돌 없음.

## 3. ord 동음이의 판정 (quality 상신 회신과 동일)

- 위치 규칙 : 마지막 토큰 `_ord` = 순서 도메인(grandfathered 기존 컬럼만), 그 앞 토큰 `ord` = 주문 단어. 정본 v2.3 과 일치.
- Hook `DOMAIN_SUFFIXES` 의 `ord` 는 기존 파일 호환용 유지. 신규 `_ord` 종결은 명명 검증·품질 게이트 P2 로 수동 차단.
- 정본 개정 제안 **P-5 = "Hook 에 신규 `_ord` 종결 경고 기능 추가"**(범위 축소 — 정본 본문은 main 이 v2.3 으로 이미 개정).

## 4. 모델러 적용 지시

- 개정 §9 변경표(r2 → r3 약어)대로 일괄 교체. 테이블 `fee_ord`·`fee_ord_hist`·`fee_plan_bnd`·`usr_snc` 포함.
