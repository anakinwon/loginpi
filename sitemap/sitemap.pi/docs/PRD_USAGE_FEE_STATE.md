# PRD — 사용료 전환 · 신청 상태 6단계 (v0.2c 설계안, 2026-10-13)

> 마스터 지시(2026-10-13): "모든 심사비는 **사용료**로. 별도 심사 없음. 신청 상태 = 신청가능 · 신청중 · 결제완료 · 사용중 · 사용완료 · 반려됨."
> 본 문서는 **설계안**이다. §8 결정 사항이 확정되면 구현(§9 단계)에 착수한다. 정본 PRD.md §5(상태 흐름)·§3(요금)·§7(운영 설정)은 구현 커밋과 함께 개정한다.
> 산출 경로: 수집(anakin_phase-collect) → 결론(anakin_phase-decide) → 적대적 비평(REVISE 판정, 치명 결함 6건 반영) → 팀장 반려 3회(해석 결정 3건 추가 → D3·크론 순서 정합 → CRON_SECRET optional 명시) → 본 문서 v0.2c.

## 1. 원칙

- **심사 폐지**: 결제가 곧 등록. 관리자 승인 단계 없음. 관리자는 **반려·정지·복구·사용 시작(즉시)·운영 설정**만 수행.
- **사용자 표시 텍스트만 개명**(심사비→사용료, 심사 제출→신청, 승인→사용 시작). 내부 식별자(`fee_tp_cd='REGISTER'`, `SITE_REG`, `getRegFee`, Pi `approve`, `pi_pymnt.APPROVED`)는 유지.
- **상태 주체 = 도메인 1건(site_mst 행)** [확인중 : 마스터 D0]. 현 UNIQUE(`ux_site_mst_site_dom_nm_actv`) 설계 그대로. 마스터 원문 "현재 광고가 등록되지 않아서"를 **버블 자리·슬롯 단위**(PRD.md §3 CTGR_SLOT·HOME_SLOT 재고형)로 읽으면 상태기계 전체가 바뀌므로 §8 D0 이 최우선 결정.
- 타이머 3개는 **관리자 설정값**(`sys_cfg`)이며 크론 회차마다 읽는다.

## 2. 상태 정의 (site_mst.site_sts_cd)

| 코드 | 한글명 | 마스터 6단계 | 도메인 점유 | 공개 노출 | 비고 |
|---|---|---|---|---|---|
| `DRAFT` | 작성 중 | — | N | N | 신청 전 임시저장(유지, 타이머 없음) |
| `APPLYING` | 신청중 | 2 | Y | N | 상세정보 입력 완료·결제 전. `aply_dtm` 기록, 미결제 타이머 시작 |
| `PAID` | 결제완료 | 3 | Y | N | 결제 complete RPC가 전이. `pay_dtm` |
| `IN_USE` | 사용중 | 4 | Y | **Y** | `use_bgn_dtm`·`use_end_dtm` |
| `USED` | 사용완료 | 5 | Y(재등록 창) | N | 직전 신청인만 재등록 가능 창 [확인중 : 마스터 D-A — 누구나 재등록 가능이면 점유 해제·UNIQUE 술어에서 제외] |
| `EXPIRED` | 사용종료(=신청가능) | 1 | N | N | 재등록 창 종료. 도메인 해제 → 누구나 신청가능. 화면 라벨 "신청가능" |
| `REJECTED` | 반려됨 | 6 | N | N | `rjct_rsn_cd` 필수(`PAY_TIMEOUT` 신설) |
| `SUSPENDED` | 정지 | — | Y | N | 신고 인용·관리자 정지(등재 심사 요건, 유지) |
| `WITHDRAWN` | 철회 | — | N | N | 유지 |

- "신청가능"은 ① 등록 행이 없는 도메인(파생 표시) ② `EXPIRED` 행(저장) 두 경우. 비평 반영: 저장 상태명은 `OPEN` 대신 **`EXPIRED`**(기존 상수 `OPEN_STS`와 충돌 회피, 스펙 의도 "등록 없음"과 구분).
- 폐기 코드: `PENDING`·`APPROVED`(사이트 상태만).

## 3. 전이표

| # | 전이 | 트리거 | 주체 | 조건 | 기록 |
|---|---|---|---|---|---|
| 1 | →`DRAFT` | 등록(submit=false) | 등록자 | DRAFT+APPLYING 5건 상한 | reg_dtm |
| 2 | `DRAFT`·`REJECTED`·`USED`·`EXPIRED`→`APPLYING` | 신청(submit) | 등록자 | 운영 연락처 필수, 도메인 미점유(USED는 본인 행만), OWNERSHIP·금지 7종 반려 이력 없음, **PAY_TIMEOUT 쿨다운**(24h 내 3회 초과 409), **pymnt_id 잔존 행은 재신청 차단**(환불 처리 전) | aply_dtm=now, rjct_* NULL, USED·EXPIRED 재등록 시 pymnt_id·pay_dtm·use_* 초기화 |
| 3 | `APPLYING`→`PAID` | 결제 complete → RPC | 등록자 | 원장 APPROVED/COMPLETED, 결제자=소유자, 금액=서버 정가 | pymnt_id, pay_dtm, plan_cd |
| 4 | `APPLYING`→`REJECTED(PAY_TIMEOUT)` | 크론 | SYSTEM | aply_dtm + 미결제 시간 ≤ now **AND pymnt_id IS NULL** AND (진행 중 Pi 결제 없음 OR Pi cancel 성공) — **txid 있는 결제는 cancel 금지·건너뜀** | rjct_rsn_cd=PAY_TIMEOUT, modr_id=SYSTEM |
| 5 | `APPLYING`→`REJECTED` (`PAID`·`IN_USE` 반려는 [확인중 : 마스터 D3·D-B]) | 관리자 반려 | 관리자 | 사유 필수. **진행 중 Pi 결제 있으면 409 PAY_IN_PROGRESS**. D3 권장값 채택 시 PAID 반려 전이는 **삭제**(환불 기록 수단 선행 전), D-B 권장값 채택 시 IN_USE 는 반려 대신 정지(#10) | rjct_* |
| 6 | `PAID`→`IN_USE` | 크론 | SYSTEM | pay_dtm + 사용 시작 지연 ≤ now | RPC `fn_bgn_site_use`: use_bgn=now, use_end=now+use_mon_cnt개월, apv_dtm=COALESCE(최초 노출일) |
| 7 | `PAID`→`IN_USE` | 관리자 "사용 시작" | 관리자 | 동일 RPC | modr_id=관리자 |
| 8 | `IN_USE`→`USED` | 크론 | SYSTEM | use_end_dtm ≤ now | hist |
| 9 | `USED`→`EXPIRED` | 크론 | SYSTEM | use_end_dtm + 재등록 창 ≤ now | hist |
| 9b | `SUSPENDED`→`EXPIRED` | 크론 | SYSTEM | use_end_dtm + 재등록 창 ≤ now(정지 중 만료 — 영구 점유 방지) | hist |
| 10 | `IN_USE`→`SUSPENDED` | 관리자 정지 / 신고 인용 RPC | 관리자 | 기존 그대로 | hist RPT_ACCEPT |
| 11 | `SUSPENDED`→`IN_USE` | 관리자 복구 | 관리자 | use_end_dtm > now(아니면 USED) | hist |
| 12 | `DRAFT`·`APPLYING`·`REJECTED`·`IN_USE`·`USED`·`EXPIRED`→`WITHDRAWN` | 철회 | 등록자 | PAID·SUSPENDED 제외, 진행 중 결제 없음 | hist |

가드 상수(`src/lib/site.ts`): `OCCUPY_STS=[APPLYING,PAID,IN_USE,USED,SUSPENDED]` / `PAYABLE_STS=[APPLYING]` / `EDITABLE_STS=[DRAFT,APPLYING,REJECTED,IN_USE,USED]`(EXPIRED는 재신청만) / `DOMAIN_EDITABLE_STS=[DRAFT,REJECTED]` / 공개 노출 필터 `'APPROVED'→'IN_USE'`(DB 조회 4곳 — `bubbles/route.ts:77`은 sites.json 레지스트리 필터라 제외).
`IN_USE` 중 수정: 내용·이미지·연락처는 즉시 반영, **도메인·요금제·이동 URL(site_mv_url)은 잠금**(피싱 교체 방지, 다음 재등록 때만).

## 4. 타이머 · 운영 설정 (`sys_cfg`)

| 키 | 기본 | 의미 |
|---|---|---|
| `site.pay_timeout_hours` | 1 | 신청중 미결제 자동 반려까지 |
| `site.use_start_delay_hours` | 1 | 결제완료 → 사용중 자동 전이 지연. 관리자가 볼 수 있는 유예이지만 **통지 수단이 없고 D3 권장값에선 PAID 단계 차단 수단도 없어 "검토 창"이 아니라 단순 대기 시간**(관리자는 "사용 시작"으로 앞당길 수만 있음) — 관리자 알림(PAID 발생 시 메일·텔레그램)은 ROADMAP 후속 과제로 등재, 그전엔 관리자 화면 PAID 탭 수동 확인 |
| `site.reapply_window_hours` | 12 | 사용완료 후 직전 신청인 재등록 우선 창 |

관리자 화면 "운영 설정" 섹션에서 변경(`/api/admin/cfg`, 0.01~720h). 실기기 검증 시 0.05h로 낮춰 전 구간 1회 통과 후 복귀.

## 5. DB 변경 (sql/012, da-team 리뷰 후 DA-APPROVED)

- `sys_cfg` 신규(cfg_cd PK·cfg_val·cfg_desc + 시스템 컬럼·del_yn, 테이블별 mod_dtm 트리거 `fn_upd_sys_cfg_mod_dtm`). 표준단어 등재 APL(신청)·USE_BGN/USE_END·CFG·cfg_val 타입 [확인중 : da-team].
- `site_mst` 컬럼 3: `aply_dtm`[확인중 : da-team — 표준단어 APL(3자) 등재 시 `apl_dtm`], `use_bgn_dtm`, `use_end_dtm`. `apv_dtm`은 "최초 노출 개시일시"로 COMMENT 재정의(공개 API·인덱스 파급 회피) [확인중 : da-team].
- 자사 시드(own_site_yn='Y') INSERT 는 새 CHECK(aply·apv·use_bgn NOT NULL) 때문에 세 컬럼을 CURRENT_TIMESTAMP 로 채워야 함 — 012 주석에 시드 작성 규칙 명시.
- 재등록 시 pymnt_id·pay_dtm 초기화로 "어느 결제가 어느 사용기간을 샀는가"가 site_mst 에서 사라짐 → `site_sts_hist` 트리거가 PAID→IN_USE 전이 때 `chg_rsn_cont` 에 pymnt_id·use_bgn/end 스냅샷을 남기도록 확장(감사, PRD §8).
- 무결제 점유 쿨다운(#2)은 `site_sts_hist`(chg_rsn_cd=PAY_TIMEOUT, 같은 사용자·도메인, 24h) 집계로 판정.
- CHECK 교체: `site_sts_cd` 9종, `rjct_rsn_cd` + `PAY_TIMEOUT`, 상태별 타임스탬프 NOT NULL, **외부 사이트 IN_USE는 use_end_dtm NOT NULL**(fee_plan 결측·NONE·0 Pi로 영구 무료 노출 차단 — RPC도 RAISE). `site_mst_vrf_yn_apv_check` 제거(소유 확인 = 선택 배지, §8 D1).
- 인덱스: 점유 UNIQUE 술어 `IN (APPLYING,PAID,IN_USE,USED,SUSPENDED)`, 노출 인덱스 `IN_USE`, `pi_pymnt ((meta_val->>'site_id')) WHERE APPROVED` 부분 인덱스.
- `site_sts_hist` CHECK는 신·구 합집합(과거 행 보존). RPC 2: `fn_cmpl_site_reg_pymnt`(APPLYING→PAID, 늦은 결제 구제 PAY_TIMEOUT→PAID), `fn_bgn_site_use`(PAID→IN_USE, 기간 계산 단일 장소).
- 데이터 이행: `PENDING`+미결제→`APPLYING`(유예 = 설정값) / `PENDING`+결제→`PAID` / `APPROVED`→`IN_USE`(use_bgn=apv_dtm, use_end=apv_dtm+개월) / `SUSPENDED` 동일 계산 / 자사 19건 `IN_USE` 영구. **이행 전 dev·stg·prod 상태×own×plan×paid COUNT 기록**, 무결제·NONE 외부 행은 수동 요금제 배정 후 이행. 롤백 SQL 동봉(vrf 제약 복원 제외).
- fee_plan: `fee_plan_nm` "등록 심사비"→"사용료". VIP 포함 전 요금제에 `use_mon_cnt` 존재(sql/009) — "영구"는 자사 전용.

## 6. 자동 전이 (Vercel cron)

- `GET /api/cron/site-sts-sweep`, `*/5 * * * *`, `Authorization: Bearer CRON_SECRET`(env.ts 에서 **optional** — 운영 tier 필수 검사를 넣지 말 것. P8 ①~④ 동안 미등록 상태로 빌드·승격돼야 하며, 미설정이면 라우트가 401 로 멈춘다), `maxDuration=60`, 회차당 반려 상한 20건.
- 순서: IN_USE→USED(bulk) → USED·SUSPENDED→EXPIRED(bulk) → PAID→IN_USE(RPC 건별) → APPLYING 미결제 반려(건별: 원장 APPROVED 조회 → `getPiPayment`로 txid 없을 때만 cancel → 성공 시 원장 CANCELED+반려, 실패·txid 있음은 skip).
- 모든 UPDATE는 현재 상태 조건부(멱등, 중복 실행 안전). 응답에 건수·실패 목록. 크론은 production에서만 실행 — stg는 수동 curl 검증.
- 크론 라우트는 **fail-closed**: `CRON_SECRET` 미설정이면 401(실행 안 함). 이행 직후 첫 크론이 기존 결제 고객을 즉시 공개하므로 **운영 `CRON_SECRET` 은 P8 에서 관리자가 PAID 탭을 1회 검토한 뒤 등록**(그전까지 크론은 401 로 멈춤, vercel.json crons 는 P5 커밋에 포함돼도 무해).

## 7. 개명 범위

- i18n ko/en 약 30키(meta·ad.step1~3·siteSts·pay.*·form.*·admin.*·errors.*) — 상세 치환표는 `docs/design/usage-fee-state-design-raw-2026-10-13.md`(워크플로 원문, 폐기 전제 포함 — 본 정리본이 정본) 기준으로 P6에서 적용. 예외: "등재 심사"(Pi 메인넷 심사) 등 외부 문맥의 "심사"는 유지. 폐기 키(`PENDING`·`APPROVED`·`OWNERSHIP_NOT_VERIFIED`·`PAYMENT_REQUIRED`·`form.reReviewNote`)는 ko/en 동시 삭제.
- 안내 문구는 `{hours}` 치환(설정값 동봉 `/api/fee-plans`). "미결제 시 반려" 문구는 "**결제를 시작하지 않으면**"으로(진행 중 결제는 반려 제외와 일치).
- 코드 주석·SQL COMMENT·PRD §1·3·4·5·6·7·8, ROADMAP, OPS_SETUP, CLAUDE.md 변경이력.

## 8. 마스터 결정 필요 (권장 기본값 표기)

| # | 질문 | 권장 |
|---|---|---|
| **D0** | **"광고" 단위 = 도메인(사이트) 1건인가, 버블 자리·슬롯(PRD.md §3 CTGR_SLOT·HOME_SLOT) 단위인가** — 슬롯이면 상태기계 전체 재설계 | 도메인 1건(현 UNIQUE 설계) |
| D-A | 사용완료 후 12시간 창은 **직전 신청인만** 재등록(도메인 점유 유지)인가, 누구나 가능인가 | 직전 신청인만 |
| D-B | 관리자 반려 가능 상태 — 사용중(IN_USE) 도 "반려"인가, 정지(SUSPENDED)로 대체하는가 | 정지로 대체(신고 체계·등재 요건) |
| D1 | 소유 확인(sitemap-verify.txt)을 강제 해제하고 선택 배지로 두는가 | 해제(신고→정지로 통제) |
| D2 | 금지 카테고리 7종으로 반려된 사이트의 재신청 | 차단(OWNERSHIP과 동일) |
| D3 | 결제완료(PAID) 상태 관리자 반려 시 환불 | **환불 기록 수단(원장 REFUNDED/rfnd_* 컬럼) 선행 전엔 PAID 반려 전이 없음** — 문제 사이트는 자동 사용 시작 뒤 정지(#10)로 대응. 즉 **PAID 단계에서 공개를 막는 수단은 없음**(§4) — 다만 관리자가 #7 "사용 시작" 직후 #10 정지를 걸면 노출을 수 초로 줄이는 운용 경로는 있음(새 전이 불필요). 막아야 한다면 PAID→SUSPENDED 전이 + use_end_dtm NULL 정지 행의 만료·복구 규칙(#9b·#11) 추가 설계 필요 |
| D4 | 0 Pi 요금제 허용 여부 | 금지(fee_plan pi_amt > 0 CHECK) |
| D5 | 사용중 연장(만료 전 재결제) | Phase 2(이번 범위 밖, 안내 문구에 공백 고지) |
| D6 | 정지(SUSPENDED)·철회 상태 유지 | 유지(D-B 와 연동) |

기본값으로 확정(질문 아님): 저장 상태명 `EXPIRED` + 화면 라벨 "신청가능" / 기존 미결제 PENDING 이행 유예 = 설정값 1h / Vercel 크론 5분 주기 — sitemaps·loginpi 모두 `anakinwon` 팀 소속이고 loginpi 가 이미 `* * * * *` 크론을 운용 중이라 플랜 요건 충족 [확인중 : Vercel 플랜 문서 — Hobby 는 일 1회 제한으로 알려져 있음, 미충족 시 pg_cron 차선].

## 9. 구현 단계 (커밋 단위 · 검증)

| 단계 | 내용 | 검증 |
|---|---|---|
| P0 | 작업트리 선커밋(관리 테이블·sql/011·leave-dialog) | git clean·build |
| P1 | sql/012 + da-team 리뷰 → dev 적용 | COUNT 전후·PENDING/APPROVED 0·제약·RPC |
| P2 | 서버 상태 전환(site.ts 상수·me/sites·admin·payments·공개 필터 4곳) | build·`rg 'PENDING\|APPROVED'` 잔존=원장만 |
| P3 | 클라(my-sites·pay-panel·admin-panel 탭/액션/열·ad page) + siteSts/rjctRsn 키 | build·관리자 PAID→사용 시작→버블 노출 |
| P4 | sys_cfg 읽기·`/api/admin/cfg`·설정 UI·fee-plans cfg 동봉 | 값 변경 반영·범위 400 |
| P5 | 크론·vercel.json crons·env.ts `CRON_SECRET`(미설정 시 401 fail-closed, 운영 등록은 P8) | dev 시나리오 4종 curl·멱등·시크릿 없이 401·**VERCEL_ENV=production 에 CRON_SECRET 없이 `pnpm build` 통과** |
| P6 | 문구 개명 전수 | `rg 심사` 잔존 0·ko↔en 키 동일 |
| P7 | 문서(PRD v0.7·ROADMAP·OPS·CLAUDE·HANDOFF·ERD) | anakin_phase-review |
| P8 | Pi Browser 실기기 전 구간(설정 0.05h) → **prod 이행과 코드 승격을 한 창에서**: ① sql/012 적용 직후 즉시 `promote-to-prod` → ② `Vercel – sitemaps: success` 개별 확인 → ③ 공개 API 건수 = 이행 전 APPROVED 건수 → ④ 관리자 PAID 탭 검토(이행된 결제 고객) → ⑤ **운영 Vercel env `CRON_SECRET` 등록 + Redeploy**(이때부터 자동 전이 시작). 012 가 CHECK 를 교체해 `APPROVED`·`PENDING` 을 없애므로 이행~승격 사이엔 운영 공개 필터 4곳이 0건·등록/결제 경로 실패(수 분 허용, 심야 권장). 대안: CHECK 를 신·구 합집합으로 2단계 적용. dev 도 P1~P2 사이 같은 공백 허용 | 실기기 로그 HANDOFF·승격 체크 success |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-13 | v0.1 설계안 — 워크플로(수집·결론·비평) 산출, 비평 치명 6건 반영(PAID 반려 재신청 경로·관리자 반려 Pi 결제 검사·cancel 전 txid 확인·무결제 점유 쿨다운·영구 무료 노출 차단·bubbles.ts:77 제외) |
| 2026-10-13 | v0.2 → v0.2c — 팀장 반려 3회 반영(2차: D3 "PAID 차단 수단 없음" 정합·크론 fail-closed·운영 CRON_SECRET 등록을 P8 검토 뒤로 / 3차: CRON_SECRET env optional 명시·P5 build 검증·D3 운용 경로): 결정 D0(광고 단위)·D-A(12h 창)·D-B(관리자 반려 범위) 추가, 전이 #5 PAID 를 [확인중 : D3] 로 정합, P8 이행~승격 공백 대책, 검토 창 알림 부재·자사 시드 CHECK·감사 스냅샷·쿨다운 출처 추가, 기본값 확정 3건(상태명·이행 유예·크론 플랜)으로 내림, 표기 통일 |
