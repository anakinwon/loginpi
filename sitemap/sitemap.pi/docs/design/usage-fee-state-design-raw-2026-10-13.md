<!-- ⚠ 워크플로 원문(결론·비평 에이전트 출력). 폐기된 전제 포함(상태명 OPEN → 정리본은 EXPIRED, "VIP 영구" → sql/009 로 VIP 60개월, 절대경로 S=…). 정본은 ../PRD_USAGE_FEE_STATE.md 이며 충돌 시 정리본 우선. P6 개명 치환표·크론 검증 시나리오 참조용 -->
# DESIGN

## assumptions
- 결론 초안 : 강력추천 9건 / 추천 4건 / 확인중 7건 — 근거 파일은 S = C:/Users/anaki/workspace/loginpi/sitemap/sitemap.pi 기준. 외부 동작(Vercel cron 플랜 한도·Pi cancel 거부 조건)은 이 세션에서 문서 fetch 도구가 없어 [확인중]으로 남김.
- [쟁점 ① 상태 주체] 강력추천 : 주체 = 도메인 1건(site_mst 행). '신청가능'은 두 가지로 표현 — (a) 활성 행이 없는 도메인(파생, 저장 안 함: 광고 자리 화면 S/messages/ko.json:57-58 '이 버블은 비어 있는 샘플 자리') (b) 사용완료 재등록 창이 끝난 행의 저장 종료 상태 OPEN. 근거 : 도메인 점유 UNIQUE ux_site_mst_site_dom_nm_actv(S/sql/001:122-124)가 이미 '도메인 = 신청 단위'로 설계됨, 버블은 고정 슬롯 수가 없음(S/src/app/api/bubbles/route.ts:105 APPROVED 전건). 뒤집히는 조건 : 마스터가 '광고 자리 N개 고정 슬롯'을 원하면 ad_slot 테이블·슬롯 배정 모델이 필요(이번 설계 범위 밖, 재설계).
- [쟁점 ② 사용기간] 강력추천 : fee_plan.use_mon_cnt 개월(NULL=영구 VIP). use_end_dtm = use_bgn_dtm + make_interval(months => use_mon_cnt). 근거 : S/sql/006:5 '이용 개월수, 만료 처리는 Phase 2' — 이번이 그 Phase 2. 자사(own_site_yn='Y')·plan NONE 은 영구(NULL). 뒤집히는 조건 : DA 사전이 use_day_cnt(일수)로 통합(006:8)하면 interval 계산식만 교체.
- [쟁점 ③ 12시간 재등록] 강력추천 : USED(사용완료)는 직전 신청인 전용 재등록 창 — USED 행이 12시간(설정) 동안 도메인을 계속 점유(UNIQUE 술어에 USED 포함, DB 강제), 창 종료 시 크론이 USED→OPEN 으로 바꿔 점유 해제 → 누구나 신청가능. 근거 : 누구나 즉시 가능하면 '12시간'이 무의미하므로 우선권 창으로만 해석 가능. 재등록 = 소유자가 USED 행을 수정·신청(기존 PATCH submit 흐름 재사용, 같은 행 → 통계·apv_dtm 연속). 뒤집히는 조건 : 마스터가 '12시간 뒤 자동 삭제·새 행'을 원하면 OPEN 대신 WITHDRAWN 류 종료 + 신규 행.
- [쟁점 ④ 기존 데이터 이행] 강력추천 매핑 : DRAFT→DRAFT / PENDING+pymnt_id NULL→APPLYING(aply_dtm=이행 시각, 1시간 유예) / PENDING+결제→PAID(첫 크론에서 즉시 IN_USE — pay_dtm+1h 경과) / APPROVED→IN_USE(use_bgn=apv_dtm) / SUSPENDED→SUSPENDED(기간 동일 계산) / REJECTED·WITHDRAWN 유지. del_yn='Y' 행도 코드 치환(CHECK 위반 방지). 근거 : S/sql/001:91-97 CHECK·S/sql/005:48 상태 조건. 뒤집히는 조건 : 운영 DB에 결제 없이 승인된 외부 APPROVED(004 이전)가 있으면 사용기간 기산·무결제 IN_USE 허용 여부 결정 필요 [확인중 : DB COUNT].
- [쟁점 ⑤ 설정 저장] 강력추천 : 신규 최소 테이블 sys_cfg(cfg_key PK·cfg_val·cfg_desc + 시스템 컬럼·del_yn) 키 3개(site.pay_timeout_hours=1, site.use_start_delay_hours=1, site.reapply_window_hours=12). 근거 : S/docs/PRD.md §7 :199 '운영 설정 키-값 단일 출처, 코드 상수 금지'(계획만 있고 미구현), sitemap DB·@pi/db baseline 에 sys_cfg 없음(수집 결과). fee_plan 컬럼은 요금제별 값이라 부적합, env 는 관리자 런타임 변경 불가. 추천(차선) : env SITE_USE_START_DELAY_HOURS — 관리자 변경 요구를 못 채움. 뒤집히는 조건 : 루트 cafe.pi 식 sys_cfg_chg_hist 감사까지 요구되면 sql/176 패턴 추가(이번엔 modr_id/mod_dtm 로 충분).
- [쟁점 ⑥ 자동 전이 수단] 강력추천 : Vercel cron 1개(GET /api/cron/site-sts-sweep, */5 * * * *) + S/vercel.json crons + CRON_SECRET Bearer(루트 refund-sweep 패턴 C:/Users/anaki/workspace/loginpi/src/app/api/cron/refund-sweep/route.ts:16-20). Pi cancel HTTP 호출이 필요해 pg_cron 만으로는 불가. 추천(차선) : Hobby 플랜이면 pg_cron 으로 PAID→IN_USE·IN_USE→USED·USED→OPEN(순수 SQL)을 매분 처리하고 미결제 반려만 앱 크론(일 1회)으로. 뒤집히는 조건 : Vercel 플랜이 Hobby(크론 일 1회 한도)면 차선 채택 [확인중 : Vercel 플랜·공식 문서 https://vercel.com/docs/cron-jobs/usage-and-pricing 확인일 미정].
- [쟁점 ⑦ 결제완료→사용중 1시간] 강력추천 : 관리자 거부(반려) 창 — 심사 없이 자동 공개되되 관리자가 1시간 안에 볼 수 있는 유예, '혹은 관리자 설정' = 관리자 start 액션으로 즉시 IN_USE. 사용자 취소·환불 창이 아님(환불 수단 미확정 PRD §9 #6, 원장에 환불 상태 없음 packages/pi-db/sql/010). PAID 에서 사용자 철회는 기존처럼 차단(S/src/app/api/me/sites/[id]/route.ts:88). 뒤집히는 조건 : 마스터가 PAID 구간 사용자 취소를 허용하면 A2U 환불 경로 설계 선행.
- [쟁점 ⑧ 미결제 반려 시 Pi pending] 강력추천 : 크론이 APPLYING 만료 행마다 pi_pymnt APPROVED(진행 중) 존재 여부 확인(S/src/lib/payments.ts:162 hasOtherApprovedPayment 재사용) → 있으면 cancelPiPayment 시도, 성공 시만 원장 CANCELED + 반려, Pi 가 거부(서명 완료·거래 중)하면 이번 회차 건너뜀(complete 가 마무리). 추가로 RPC 가 REJECTED(PAY_TIMEOUT) 행의 늦은 결제를 PAID 로 구제(돈만 받는 상태 방지). 근거 : S/src/app/api/payments/cancel/route.ts:45-51 동일 규칙, S/sql/005:48 P0003 위험. 뒤집히는 조건 : Pi 공식 문서상 cancel 이 approve 후 언제나 가능하면 건너뜀 분기 불필요 [확인중 : https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md].
- [부가 가정 A — DRAFT] 추천 : DRAFT(작성 중)는 '신청 전' 임시저장으로 유지(마스터 6상태 밖, 도메인 미점유·타이머 없음·코드 변경 0). 뒤집히는 조건 : 마스터가 정확히 6상태만 원하면 임시저장 버튼·DRAFT 분기 제거 커밋 추가. [확인중 : 마스터]
- [부가 가정 B — SUSPENDED·WITHDRAWN] 강력추천 유지 : 신고 인용 정지(RPC fn_prcs_site_rpt S/sql/002:187-197)·사용자 철회는 등재 심사(금지 카테고리·신고 체계) 요건이라 상태 삭제 불가. 관리자 '반려'는 APPLYING·PAID 에서, '정지/복구'는 IN_USE 에서. 뒤집히는 조건 : 마스터가 정지도 '반려됨'으로 묶으라 하면 RPC·rjct_rsn_cd CHECK(RPT_ACCEPT 추가) 변경.
- [부가 가정 C — apv_dtm] 추천 : 컬럼 유지, 의미를 '최초 노출 개시일시(순위 기준)'로 재정의(COMMENT 변경, IN_USE 최초 진입 시 COALESCE 기록). 근거 : PUBLIC_SITE_COLS(S/src/lib/site.ts:184)·공개 인덱스 2개·정렬이 apv_dtm 의존 — 개명 시 공개 API 파급. 뒤집히는 조건 : da-team 이 의미 불일치로 개명(예: expo_bgn_dtm) 요구 시 뷰/컬럼 추가 후 단계 전환.
- [부가 가정 D — 소유 확인] 추천 : 승인 게이트가 사라지므로 DB 제약 site_mst_vrf_yn_apv_check(S/sql/002:47-49) 제거, 토큰·vrf_* 컬럼은 선택 '운영자 확인' 배지(PRD Phase 3)용으로 유지. 뒤집히는 조건 : 마스터가 자동 공개라도 소유 확인 필수를 원하면 IN_USE 전이 조건에 vrf_yn='Y' 를 넣고 관리자 확인 전까지 PAID 대기(사실상 심사 부활). [확인중 : 마스터]
- [부가 가정 E — IN_USE 중 수정] 강력추천 : 공개 중 수정은 재심사 없이 즉시 반영(기존 APPROVED→PENDING 재심사 S/src/app/api/me/sites/[id]/route.ts:112-116 제거). 도메인·요금제 변경 잠금은 유지. 위험은 신고→정지로 통제.

## stateMachine
결론 초안 : 강력추천 9건 / 추천 4건 / 확인중 7건

[상태 코드 — site_mst.site_sts_cd, DA 영문 코드]
| 코드 | 한글명(siteSts.*) | 도메인 점유 | 노출 | 비고 |
| DRAFT | 작성 중 | N | N | 유지(신청 전 임시저장) [확인중 : 마스터] |
| OPEN | 신청가능 | N | N | 사용완료 창 종료 후 종료 상태. 미등록 도메인의 '신청가능'은 파생 표시 |
| APPLYING | 신청중 | Y | N | 상세정보 입력 완료·결제 전. aply_dtm 기록 |
| PAID | 결제완료 | Y | N | complete RPC 가 전이. pay_dtm |
| IN_USE | 사용중 | Y | Y(버블·목록·검색) | use_bgn_dtm·use_end_dtm(NULL=영구) |
| USED | 사용완료 | Y(재등록 창) | N | 직전 신청인만 재등록 가능 |
| REJECTED | 반려됨 | N | N | rjct_rsn_cd 필수(PAY_TIMEOUT 신설) |
| SUSPENDED | 정지 | Y | N | 유지(신고·관리자) |
| WITHDRAWN | 철회 | N | N | 유지 |

[기존 코드 매핑] PENDING(미결제)→APPLYING · PENDING(결제)→PAID · APPROVED→IN_USE · 나머지 동일. 폐기 : PENDING·APPROVED(사이트 상태만 — pi_pymnt.pymnt_sts_cd 'APPROVED' 와 Pi approve 는 그대로).

[전이표]
| # | 전이 | 트리거 | 주체 | 조건 | 기록 | 타이머 |
| 1 | (없음)→DRAFT | POST /api/me/sites submit=false | 등록자 | 사용자당 DRAFT+APPLYING 5건 | reg_dtm | — |
| 2 | DRAFT·REJECTED·OPEN·USED→APPLYING | POST submit=true / PATCH submit=true | 등록자 | pvtCntc 필수, 같은 도메인 점유 행 없음(USED 는 본인 행만), OWNERSHIP 반려 이력 없음 | aply_dtm=now, rjct_* NULL, pymnt_id/pay_dtm NULL(USED·OPEN 재등록 시 초기화) | 미결제 타이머 시작 |
| 3 | APPLYING→PAID | POST /api/payments/complete → RPC fn_cmpl_site_reg_pymnt | 등록자(결제) | 원장 APPROVED/COMPLETED·결제자=소유자·금액=서버 정가 | pymnt_id, pay_dtm, plan_cd | 사용 시작 타이머 시작 |
| 3b | REJECTED(PAY_TIMEOUT)→PAID | 같은 RPC(늦은 결제 구제) | 시스템 | 도메인 UNIQUE 충돌 없음 | 동일 + rjct_* NULL | — |
| 4 | APPLYING→REJECTED | 크론 site-sts-sweep | SYSTEM | aply_dtm + cfg pay_timeout_hours(1h) ≤ now, 진행 중 결제(pi_pymnt APPROVED) 없거나 Pi cancel 성공 | rjct_rsn_cd='PAY_TIMEOUT', modr_id='SYSTEM', hist 자동 | — |
| 5 | APPLYING·PAID→REJECTED | PATCH /api/admin/sites/[id] action=reject | 관리자 | rsnCd 필수(9종+PAY_TIMEOUT) | rjct_rsn_cd/cont | PAID 반려는 환불 수동 경고 |
| 6 | PAID→IN_USE | 크론 | SYSTEM | pay_dtm + cfg use_start_delay_hours(1h) ≤ now | RPC fn_bgn_site_use : use_bgn_dtm=now, use_end_dtm=now+use_mon_cnt 개월(영구·자사 NULL), apv_dtm=COALESCE(apv_dtm,now) | 사용 종료 타이머 |
| 7 | PAID→IN_USE | PATCH admin action=start | 관리자 | 동일 RPC | 동일, modr_id=관리자 | — |
| 8 | IN_USE→USED | 크론 | SYSTEM | use_end_dtm IS NOT NULL AND ≤ now | mod_dtm·hist | 재등록 창 타이머 |
| 9 | USED→OPEN | 크론 | SYSTEM | use_end_dtm + cfg reapply_window_hours(12h) ≤ now | hist | — |
| 10 | IN_USE→SUSPENDED | admin suspend / 신고 인용 RPC fn_prcs_site_rpt | 관리자 | 기존 그대로(APPROVED→IN_USE 치환) | rjct_rsn_cont, hist RPT_ACCEPT | 정지 중에도 use_end_dtm 은 흐름 |
| 11 | SUSPENDED→IN_USE | admin restore | 관리자 | use_end_dtm NULL 또는 > now(아니면 USED 로) | hist | — |
| 12 | DRAFT·APPLYING·REJECTED·IN_USE·USED·OPEN→WITHDRAWN | PATCH me action=withdraw | 등록자 | PAID·SUSPENDED 제외, 진행 중 결제 없음 | hist | — |

[가드 상수(S/src/lib/site.ts)] SITE_STS 9종 / OCCUPY_STS=[APPLYING,PAID,IN_USE,SUSPENDED,USED] / OPEN_STS(상한 집계)=[DRAFT,APPLYING] / PAYABLE_STS=[APPLYING] / EDITABLE=[DRAFT,APPLYING,REJECTED,IN_USE,USED,OPEN] / DOMAIN_EDITABLE=[DRAFT,REJECTED,OPEN] / 공개 노출 필터 'APPROVED'→'IN_USE' 5곳(sites·sites/[domain]·bubbles×2·reports).

[타임스탬프 컬럼] aply_dtm(신규) · pay_dtm(기존) · use_bgn_dtm(신규) · use_end_dtm(신규) · apv_dtm(기존, 최초 노출일시로 재정의) · 반려·정지는 mod_dtm + site_sts_hist.chg_dtm.

## ddl
-- 012_sitemap_site_use_sts.sql — 심사 폐지·사용료 전환 : 신청 상태 6단계(OPEN·APPLYING·PAID·IN_USE·USED·REJECTED) + 사용기간 + 운영 설정 (마스터 지시 2026-10-13)
-- DA-APPROVED: [da-team 리뷰 후 기입 — 신규 표준단어 후보 APLY(신청)·USE_BGN/USE_END(PRD §7 fee_ordr 선례)·CFG(sql/176 등재 선례), sys_cfg 신규 테이블 1, site_mst 컬럼 3·CHECK 교체·인덱스 술어 교체, RPC 2]
-- 선행 : 011. 적용 : node scripts/db-migrate.mjs --app sitemap --tier dev|stg|prod
-- 순서 철칙 : ① hist CHECK 합집합 → ② site_mst CHECK·인덱스 해제 → ③ 코드 치환(del_yn 무관 전행) → ④ 새 CHECK·인덱스 → ⑤ RPC. 트리거 trg_site_mst_sts_hist 가 이행 전이를 자동 기록(chgr_id=SYSTEM)
BEGIN;

-- 1) sys_cfg — 운영 설정 키-값 (PRD §7 '운영 설정' 실현, 코드 상수 금지)
CREATE TABLE IF NOT EXISTS sys_cfg (
  cfg_key   VARCHAR(100)  NOT NULL,                                   -- 설정키
  cfg_val   TEXT          NOT NULL,                                   -- 설정값
  cfg_desc  TEXT,                                                     -- 설정설명
  del_yn    CHAR(1)       NOT NULL DEFAULT 'N',                       -- 삭제여부
  del_dtm   TIMESTAMPTZ,                                              -- 삭제일시
  regr_id   TEXT          NOT NULL DEFAULT 'ADMIN',
  reg_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id   TEXT          NOT NULL DEFAULT 'ADMIN',
  mod_dtm   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sys_cfg_pkey PRIMARY KEY (cfg_key),
  CONSTRAINT sys_cfg_del_yn_check CHECK (del_yn IN ('Y', 'N'))
);
COMMENT ON TABLE sys_cfg IS '운영 설정 키-값 — 관리자 화면에서 변경. 시간 단위 값은 시간(hour) 소수 허용';
CREATE TRIGGER trg_sys_cfg_mod_dtm BEFORE UPDATE ON sys_cfg FOR EACH ROW EXECUTE FUNCTION fn_upd_fee_plan_mod_dtm();  -- 본문 범용(004) — 이름 범용화 여부 da-team
INSERT INTO sys_cfg (cfg_key, cfg_val, cfg_desc) VALUES
  ('site.pay_timeout_hours',     '1',  '신청중(APPLYING) 미결제 자동 반려까지 시간'),
  ('site.use_start_delay_hours', '1',  '결제완료(PAID) → 사용중(IN_USE) 자동 전이 지연 시간'),
  ('site.reapply_window_hours',  '12', '사용완료(USED) 후 직전 신청인 재등록 우선 창 시간')
ON CONFLICT (cfg_key) DO NOTHING;
SELECT fn_grant_svc_only('TABLE', 'sys_cfg');

-- 2) site_mst 컬럼
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS aply_dtm    TIMESTAMPTZ;   -- 신청일시 (APPLYING 진입, 미결제 타이머 기준)
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS use_bgn_dtm TIMESTAMPTZ;   -- 사용시작일시
ALTER TABLE site_mst ADD COLUMN IF NOT EXISTS use_end_dtm TIMESTAMPTZ;   -- 사용종료일시 (NULL = 영구·자사)
COMMENT ON COLUMN site_mst.site_sts_cd IS 'DRAFT 작성중·OPEN 신청가능·APPLYING 신청중·PAID 결제완료·IN_USE 사용중·USED 사용완료·REJECTED 반려됨·SUSPENDED 정지·WITHDRAWN 철회';
COMMENT ON COLUMN site_mst.apv_dtm     IS '최초 노출 개시일시(구 승인일시) — IN_USE 최초 진입 시 기록, 일반 순위 기본 정렬';
COMMENT ON COLUMN site_mst.pymnt_id    IS '사용료 결제ID — fn_cmpl_site_reg_pymnt 만 기록(APPLYING→PAID)';
COMMENT ON COLUMN site_mst.pvt_cntc_txt IS '운영 연락처 — 비공개(공개 API 응답 제외 필수)';

-- 3) 이력 CHECK 를 신·구 합집합으로(append-only — 과거 행 재작성 금지)
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_old_sts_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_old_sts_cd_check CHECK (old_sts_cd IS NULL OR old_sts_cd IN
  ('DRAFT','OPEN','APPLYING','PAID','IN_USE','USED','REJECTED','SUSPENDED','WITHDRAWN','PENDING','APPROVED'));
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_new_sts_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_new_sts_cd_check CHECK (new_sts_cd IN
  ('DRAFT','OPEN','APPLYING','PAID','IN_USE','USED','REJECTED','SUSPENDED','WITHDRAWN','PENDING','APPROVED'));
ALTER TABLE site_sts_hist DROP CONSTRAINT IF EXISTS site_sts_hist_chg_rsn_cd_check;
ALTER TABLE site_sts_hist ADD  CONSTRAINT site_sts_hist_chg_rsn_cd_check CHECK (chg_rsn_cd IS NULL OR chg_rsn_cd IN
  ('GAMBLING','NON_PI_PYMNT','GIFT_CARD','INVEST','ADULT','PII_COLLECT','PI_BRAND','OWNERSHIP','ETC','PAY_TIMEOUT','RPT_ACCEPT'));

-- 4) site_mst 제약·인덱스 해제
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_site_sts_cd_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_apv_dtm_check;
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_vrf_yn_apv_check;   -- 심사 폐지 : 소유 확인은 선택 배지 [확인중 : 마스터]
ALTER TABLE site_mst DROP CONSTRAINT IF EXISTS site_mst_rjct_rsn_cd_check;
DROP INDEX IF EXISTS ux_site_mst_site_dom_nm_actv;
DROP INDEX IF EXISTS idx_site_mst_apv_dtm;
DROP INDEX IF EXISTS idx_site_mst_site_ctgr_cd;

-- 5) 데이터 이행 (del_yn 무관 전행 — 새 CHECK 위반 방지)
UPDATE site_mst SET site_sts_cd = 'APPLYING', aply_dtm = CURRENT_TIMESTAMP, modr_id = 'SYSTEM'
 WHERE site_sts_cd = 'PENDING' AND pymnt_id IS NULL;                     -- 이행 시각부터 1시간 유예
UPDATE site_mst SET site_sts_cd = 'PAID', aply_dtm = COALESCE(pay_dtm, reg_dtm), modr_id = 'SYSTEM'
 WHERE site_sts_cd = 'PENDING' AND pymnt_id IS NOT NULL;                 -- 첫 크론에서 즉시 IN_USE
UPDATE site_mst m
   SET site_sts_cd = CASE WHEN m.site_sts_cd = 'APPROVED' THEN 'IN_USE' ELSE m.site_sts_cd END,
       aply_dtm    = COALESCE(m.pay_dtm, m.apv_dtm, m.reg_dtm),
       use_bgn_dtm = COALESCE(m.apv_dtm, m.pay_dtm, m.reg_dtm),
       use_end_dtm = CASE WHEN m.own_site_yn = 'Y' THEN NULL ELSE (
                       SELECT CASE WHEN f.use_mon_cnt IS NULL THEN NULL
                                   ELSE COALESCE(m.apv_dtm, m.pay_dtm, m.reg_dtm) + make_interval(months => f.use_mon_cnt) END
                         FROM fee_plan f WHERE f.fee_tp_cd = 'REGISTER' AND f.plan_cd = m.plan_cd AND f.del_yn = 'N') END,
       modr_id     = 'SYSTEM'
 WHERE m.site_sts_cd IN ('APPROVED', 'SUSPENDED');

-- 6) 새 제약
ALTER TABLE site_mst ADD CONSTRAINT site_mst_site_sts_cd_check CHECK (site_sts_cd IN
  ('DRAFT','OPEN','APPLYING','PAID','IN_USE','USED','REJECTED','SUSPENDED','WITHDRAWN'));
ALTER TABLE site_mst ADD CONSTRAINT site_mst_rjct_rsn_cd_check CHECK (rjct_rsn_cd IS NULL OR rjct_rsn_cd IN
  ('GAMBLING','NON_PI_PYMNT','GIFT_CARD','INVEST','ADULT','PII_COLLECT','PI_BRAND','OWNERSHIP','ETC','PAY_TIMEOUT'));
ALTER TABLE site_mst ADD CONSTRAINT site_mst_aply_dtm_check CHECK (site_sts_cd NOT IN ('APPLYING','PAID','IN_USE','USED','OPEN','SUSPENDED') OR aply_dtm IS NOT NULL);
ALTER TABLE site_mst ADD CONSTRAINT site_mst_apv_dtm_check  CHECK (site_sts_cd NOT IN ('IN_USE','USED','OPEN','SUSPENDED') OR apv_dtm IS NOT NULL);
ALTER TABLE site_mst ADD CONSTRAINT site_mst_use_dtm_check  CHECK (
  (site_sts_cd NOT IN ('IN_USE','USED','OPEN','SUSPENDED') OR use_bgn_dtm IS NOT NULL)
  AND (site_sts_cd NOT IN ('USED','OPEN') OR use_end_dtm IS NOT NULL));
-- ponytail: '유료 상태는 pymnt_id 필수' CHECK 는 004 이전 무결제 승인 행 존재 가능성으로 보류 — 운영 COUNT 0 확인 후 추가

-- 7) 인덱스 — 점유(USED 포함 : 재등록 창 DB 강제)·노출(IN_USE)
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_mst_site_dom_nm_actv ON site_mst (site_dom_nm)
  WHERE del_yn = 'N' AND site_sts_cd IN ('APPLYING','PAID','IN_USE','USED','SUSPENDED');
CREATE INDEX IF NOT EXISTS idx_site_mst_apv_dtm     ON site_mst (apv_dtm DESC, site_id)                 WHERE del_yn = 'N' AND site_sts_cd = 'IN_USE';
CREATE INDEX IF NOT EXISTS idx_site_mst_site_ctgr_cd ON site_mst (site_ctgr_cd, apv_dtm DESC, site_id) WHERE del_yn = 'N' AND site_sts_cd = 'IN_USE';
-- 크론 후보 조회는 기존 idx_site_mst_site_sts_cd(site_sts_cd, reg_dtm) 로 충분(상태 선두·소량) — 느려지면 (site_sts_cd, use_end_dtm) 부분 인덱스 추가

-- 8) RPC — 결제 완료 = APPLYING→PAID 전이(한 트랜잭션). 늦은 결제(PAY_TIMEOUT 반려) 구제
CREATE OR REPLACE FUNCTION fn_cmpl_site_reg_pymnt(p_pymnt_id TEXT, p_tx_id TEXT, p_usr_id UUID)
RETURNS site_mst LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE v_p pi_pymnt; v_s site_mst; v_site UUID;
BEGIN
  UPDATE pi_pymnt SET pymnt_sts_cd = 'COMPLETED', tx_id = COALESCE(tx_id, p_tx_id), cmpl_dtm = COALESCE(cmpl_dtm, CURRENT_TIMESTAMP), modr_id = p_usr_id::TEXT
   WHERE pymnt_id = p_pymnt_id AND usr_id = p_usr_id AND del_yn = 'N' AND pymnt_tp_cd = 'SITE_REG' AND pymnt_sts_cd IN ('APPROVED','COMPLETED')
  RETURNING * INTO v_p;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 결제 없음·결제자 불일치·상태 불가 (%)', p_pymnt_id USING ERRCODE = 'P0002'; END IF;
  v_site := (v_p.meta_val ->> 'site_id')::UUID;
  UPDATE site_mst
     SET site_sts_cd = 'PAID', pymnt_id = p_pymnt_id, pay_dtm = COALESCE(pay_dtm, CURRENT_TIMESTAMP),
         plan_cd = COALESCE(NULLIF(v_p.meta_val ->> 'plan_cd', ''), plan_cd), rjct_rsn_cd = NULL, rjct_rsn_cont = NULL, modr_id = p_usr_id::TEXT
   WHERE site_id = v_site AND del_yn = 'N' AND ownr_usr_id = p_usr_id
     AND (site_sts_cd IN ('APPLYING','PAID') OR (site_sts_cd = 'REJECTED' AND rjct_rsn_cd = 'PAY_TIMEOUT'))
     AND (pymnt_id IS NULL OR pymnt_id = p_pymnt_id)
  RETURNING * INTO v_s;
  IF NOT FOUND THEN RAISE EXCEPTION 'fn_cmpl_site_reg_pymnt: 사이트 없음·소유자 불일치·결제 불가 상태·이미 다른 결제 (%)', v_site USING ERRCODE = 'P0003'; END IF;
  RETURN v_s;
END; $$;

-- 9) RPC — 사용 시작(PAID→IN_USE). 크론·관리자 start 공용, 기간 계산 단일 장소
CREATE OR REPLACE FUNCTION fn_bgn_site_use(p_site_id UUID, p_actor TEXT)
RETURNS site_mst LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE v_s site_mst;
BEGIN
  UPDATE site_mst m
     SET site_sts_cd = 'IN_USE', use_bgn_dtm = CURRENT_TIMESTAMP, apv_dtm = COALESCE(m.apv_dtm, CURRENT_TIMESTAMP),
         use_end_dtm = CASE WHEN m.own_site_yn = 'Y' THEN NULL ELSE (
           SELECT CASE WHEN f.use_mon_cnt IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + make_interval(months => f.use_mon_cnt) END
             FROM fee_plan f WHERE f.fee_tp_cd = 'REGISTER' AND f.plan_cd = m.plan_cd AND f.del_yn = 'N') END,
         modr_id = p_actor
   WHERE m.site_id = p_site_id AND m.del_yn = 'N' AND m.site_sts_cd = 'PAID'
  RETURNING * INTO v_s;
  RETURN v_s;   -- NULL = 대상 아님(멱등)
END; $$;
SELECT fn_grant_svc_only('FUNCTION', 'fn_cmpl_site_reg_pymnt(text, text, uuid)');
SELECT fn_grant_svc_only('FUNCTION', 'fn_bgn_site_use(uuid, text)');

-- 10) 사용자 노출 명칭 개명(관리 표시용)
UPDATE fee_plan SET fee_plan_nm = replace(fee_plan_nm, '등록 심사비', '사용료') WHERE fee_plan_nm LIKE '등록 심사비%';
COMMENT ON TABLE fee_plan IS '요금표 — REGISTER(사용료) × 사이트 요금제. 단가 변경은 UPDATE';
COMMIT;
-- 검증 : SELECT site_sts_cd, count(*) FROM site_mst GROUP BY 1 (PENDING·APPROVED 0) / SELECT count(*) FROM site_sts_hist WHERE chgr_id='SYSTEM' AND chg_dtm > now()-interval '5 min' = 이행 행수 / \d site_mst 제약 6·인덱스 술어 확인

## automation
[엔드포인트] GET S/src/app/api/cron/site-sts-sweep/route.ts (신규, 단일 크론으로 전이 4종 처리). 인증 : `authorization === Bearer ${CRON_SECRET}` 아니면 401(루트 refund-sweep/route.ts:16-20 패턴 복사). env : S/src/env.ts server.CRON_SECRET z.string().min(16).optional() + .env.example 동시 추가(루트 CLAUDE.md env 규칙). 옵트인 env 는 두지 않음 — 돈이 나가는 자동화가 아님(Pi cancel 은 미결제 정리). `export const dynamic = 'force-dynamic'`.

[vercel.json] S/vercel.json → {"regions":["icn1"],"crons":[{"path":"/api/cron/site-sts-sweep","schedule":"*/5 * * * *"}]}. 5분 주기 : 1시간 타이머에 ±5분 오차 허용, 루트 refund-sweep 과 동일 주기. 주기는 Vercel 플랜 한도 의존 [확인중 : Vercel 플랜 — Hobby 는 일 1회 수준이라 불가, Pro 필요. 공식 문서 https://vercel.com/docs/cron-jobs/usage-and-pricing 확인 필요]. Hobby 면 차선 : Supabase pg_cron 으로 fn_sweep_site_sts()(PAID→IN_USE·IN_USE→USED·USED→OPEN 순수 SQL) 매분 + 미결제 반려만 앱 크론.

[설정 읽기] S/src/lib/cfg.ts(신규 15줄) getCfgHours(key, defaultHours) : sys_cfg 조회(del_yn='N') → Number 파싱 실패·결측 시 기본값. 크론·checkSiteWrite·안내 문구({hours})가 공용.

[실행 순서·멱등 — 모든 UPDATE 는 현재 상태 조건부(.eq('site_sts_cd', 현재)) 라 재실행·중복 실행 안전, 실행당 상한 50건]
A) IN_USE→USED : update {site_sts_cd:'USED', modr_id:'SYSTEM'} where sts='IN_USE' and use_end_dtm <= now (bulk 1쿼리)
B) USED→OPEN : update {site_sts_cd:'OPEN'} where sts='USED' and use_end_dtm <= now - reapply_window_hours (bulk 1쿼리)
C) PAID→IN_USE : select site_id where sts='PAID' and pay_dtm <= now - use_start_delay_hours limit 50 → 각 건 rpc('fn_bgn_site_use', {p_site_id, p_actor:'SYSTEM'}) (NULL 반환 = 이미 전이, 무시)
D) APPLYING→REJECTED(미결제) : select site_id where sts='APPLYING' and aply_dtm <= now - pay_timeout_hours limit 50 → 각 건 :
   D1) pi_pymnt APPROVED(진행 중) 조회 — hasOtherApprovedPayment(siteId,'') 재사용(S/src/lib/payments.ts:162) 또는 행 반환 변형 getApprovedPaymentForSite
   D2) 있으면 cancelPiPayment(pymnt_id)(S/src/lib/payments.ts:120) → ok 면 원장 CANCELED(markPaymentCanceled 에 actor 'SYSTEM' 인자 추가 — 현재는 userId 를 필터·modr_id 겸용 :179-192) 후 D3, 실패(Pi 거부 = 서명·전송 진행 중)면 이번 회차 skip + console.error (complete 가 마무리 → RPC 가 PAID 로 전이)
   D3) update {site_sts_cd:'REJECTED', rjct_rsn_cd:'PAY_TIMEOUT', rjct_rsn_cont:null, modr_id:'SYSTEM'} where site_id and sts='APPLYING' (트리거가 hist chg_rsn_cd=PAY_TIMEOUT 자동 기록)
   순차 실행(Pi API 호출 직렬, 루트 refund-sweep :71 동일 이유)
응답 {ok:true, used, opened, started, rejected, skipped, failures[]} / 조회 실패 500 {ok:false,error}.

[Pi cancel 근거] S/src/app/api/payments/cancel/route.ts:45-51 — Pi cancel 성공 시에만 원장 CANCELED(거부 시 complete 가 마무리). Pi Platform API POST /v2/payments/{id}/cancel 공식 : https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md [확인중 : 승인 후 cancel 허용 조건 재확인, 확인일 미정]. 늦은 complete 는 RPC 구제(REJECTED(PAY_TIMEOUT)→PAID) 로 '돈만 받고 반려' 차단. 구제 시 도메인 UNIQUE 충돌(23505) 이면 RPC 실패 → complete 500 + 로그 → 운영자 수동 처리(극히 드묾, 이 경우 Pi complete 는 이미 성공).

[타이머 변경 즉시 반영] 설정값은 크론 회차마다 읽으므로 관리자가 바꾸면 다음 회차(≤5분)부터 적용. 1시간 미만 설정(예 0.05h=3분)은 실기기 검증용으로 허용.

[검증 시나리오(dev)] curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/site-sts-sweep 를 (1) 결제 직후 → started 0 (2) UPDATE pay_dtm = now()-'2h' → started 1, 재호출 0 (3) aply_dtm 조작 + pi_pymnt APPROVED 가짜 행 → skipped 1(Pi cancel 실패) 또는 rejected 1 (4) use_end_dtm 조작 → used 1 → +12h 조작 → opened 1.

## apiChanges
- S/src/lib/site.ts — SITE_STS 9종(DRAFT·OPEN·APPLYING·PAID·IN_USE·USED·REJECTED·SUSPENDED·WITHDRAWN), RJCT_RSN + 'PAY_TIMEOUT', OCCUPY_STS=[APPLYING,PAID,IN_USE,USED,SUSPENDED], OPEN_STS=[DRAFT,APPLYING], PAYABLE_STS=['APPLYING'], 신규 EDITABLE_STS=[DRAFT,APPLYING,REJECTED,IN_USE,USED,OPEN]·DOMAIN_EDITABLE_STS=[DRAFT,REJECTED,OPEN] 를 여기로 올려 서버(me/sites/[id]:28-29)·클라(my-sites.tsx:33) 중복 정의 제거, adminSiteActionSchema approve→start(ownershipVerified 삭제; 소유 확인 기록은 별도 action 'verify' 선택), OWNER_SITE_COLS + aply_dtm, use_bgn_dtm, use_end_dtm, OwnerSite 타입 동반
- S/src/app/api/me/sites/route.ts POST — submit=true 면 site_sts_cd='APPLYING' + aply_dtm=now
- S/src/app/api/me/sites/[id]/route.ts PATCH — nextSts : submit 이면 'APPLYING'(DRAFT·REJECTED·USED·OPEN 에서, aply_dtm=now, USED·OPEN 재등록 시 pymnt_id·pay_dtm·use_bgn/end NULL 초기화), IN_USE 수정은 상태 유지(재심사 제거 :112-116), APPLYING 수정은 aply_dtm 유지(타이머 리셋 금지), withdraw 금지 상태 = PAID·SUSPENDED·WITHDRAWN(:85-92 재정의), 도메인 변경 DOMAIN_EDITABLE_STS
- S/src/lib/api.ts checkSiteWrite — OCCUPY_STS 변경만으로 USED(재등록 창) 점유 반영(본인 USED 행은 exceptId 로 통과). 주석 '심사'→'신청'
- S/src/app/api/admin/sites/[id]/route.ts — FROM 맵 : start:'PAID'(→ rpc fn_bgn_site_use, modr_id 관리자), reject:['APPLYING','PAID'](PAID 반려는 응답에 refundRequired:true), suspend:'IN_USE', restore:'SUSPENDED'(use_end_dtm 경과면 'USED' 로). approve·getRegFee·PAYMENT_REQUIRED·OWNERSHIP_NOT_VERIFIED 분기 삭제
- S/src/app/api/admin/sites/route.ts — sts 기본값 'PAID'(검토 창 큐), 정렬 유지. 상태 검증은 SITE_STS
- S/src/app/api/admin/cfg/route.ts (신규) — GET 키 3개 / PATCH {key,val}(숫자·0.01~720h 범위 zod, requireAdmin, modr_id 관리자) → sys_cfg upsert
- S/src/app/api/cron/site-sts-sweep/route.ts (신규) — automation 참조
- S/src/app/api/payments/prepare·approve/route.ts — PAYABLE_STS 자동 반영(APPLYING 만), memo 'site registration fee' → 'site usage fee'(ASCII, 선택), 주석 개명
- S/src/app/api/payments/complete/route.ts — RPC 반환 site 가 PAID 로 돌아옴(코드 변경 없음, 주석만). RPC 23505 는 dbFail 500 + 로그
- S/src/lib/payments.ts — markPaymentCanceled(paymentId, userId, actor = userId) 서명 확장, 헤더 주석 '사용료'
- 공개 필터 'APPROVED'→'IN_USE' : S/src/app/api/sites/route.ts:42, sites/[domain]/route.ts:31, bubbles/route.ts:77·105, reports/route.ts:26 (신고는 IN_USE 만 가능 유지)
- S/src/app/api/fee-plans/route.ts — 응답에 cfg(useStartDelayHours·payTimeoutHours) 동봉(30초 캐시 그대로) → 안내 문구 {hours} 치환용. 대안 : 별도 GET /api/cfg — 호출 1개 줄이려 fee-plans 동봉 강력추천
- S/src/env.ts + .env.example — CRON_SECRET optional
- S/vercel.json — crons 1건
- S/src/lib/cfg.ts (신규) — getCfgHours

## uiChanges
- S/src/components/my-sites.tsx — 상태 배지 siteSts 9종, 결제 버튼 조건 = APPLYING(PAYABLE_STS) + 남은 결제 기한 표시(aply_dtm + payTimeoutHours − now, 1분 단위), PAID 면 '사용 시작 예정 {time}'(pay_dtm + delay), IN_USE 면 '사용 종료 {use_end_dtm}'(영구는 '영구'), USED 면 '재등록 가능 {use_end_dtm + 12h} 까지' + [재등록] 버튼(= 수정 폼 열고 submit), OPEN 면 [다시 신청], REJECTED(PAY_TIMEOUT) 사유 문구, 철회 버튼 가드 재정의, 제출 후 /pay 이동 유지(:293), 로컬 EDITABLE 상수 삭제(site.ts 공용)
- S/src/components/pay-panel.tsx — PAYABLE_STS 자동, 문구 pay.* 개명, 결제 기한 카운트다운 1줄
- S/src/components/site-pay-button.tsx — 주석만('사용료')
- S/src/components/admin-panel.tsx — SITE_TABS=[PAID, APPLYING, IN_USE, USED, REJECTED, SUSPENDED] 기본 PAID, 행 액션 : PAID→[사용 시작][반려] / APPLYING→[반려] / IN_USE→[정지] / SUSPENDED→[복구], 승인·소유확인 체크박스 영역(:421-466) 삭제 — 소유 확인 토큰 표시는 참고 정보로 유지, 열 추가 '신청일'·'사용기간'(use_bgn~use_end), PAID 반려 시 confirm '결제 완료 건 — 환불은 수동' / 신규 '설정' 섹션(탭 또는 상단 카드) : 3개 숫자 입력(시간) + 저장 → /api/admin/cfg
- S/src/components/site-detail.tsx:66 — '승인일' 라벨 → '등록일'(apv_dtm 표시 그대로)
- S/src/app/[locale]/ad/page.tsx — 안내 3단계 문구(ad.step1~3) : 등록·사용료 결제 → {hours}시간 후 자동 사용 시작 → 사용기간 동안 노출. '심사' 삭제
- S/src/app/[locale]/pay/[siteId]/page.tsx·admin/page.tsx — 헤더 주석·title 개명
- S/src/components/bubble-home.tsx — 변경 없음(IN_USE 필터는 API). 미커밋 작업트리 수정분(admin-panel·site-detail·bubble-home·sql/011·leave-dialog)은 이 설계 착수 전 먼저 커밋해 분리

## renameMap
[원칙] 사용자 표시 텍스트만 개명. 내부 식별자(fee_tp_cd 'REGISTER', fee_plan_cd 'REG_*', SITE_REG, getRegFee, pymnt_tp_cd) 유지 [확인중 : 마스터 — 기본 유지]. Pi 결제 approve·pi_pymnt APPROVED 는 Pi 규격이라 개명 금지. 결제 memo 'registration fee' 는 ASCII 유지(선택: 'usage fee').

[i18n — S/messages/ko.json ↔ en.json 같은 키, 라인은 수집 기준]
| 키(라인) | ko 구 → 신 | en 구 → 신 |
| meta(:8) | "사이트 등록은 무료이며 심사 후 공개" → "사용료(Pi)를 결제하면 사이트가 공개됩니다" | "…published after review" → "…listed once the usage fee is paid" |
| ad.lead(:58) | "…등록하면 심사 후 이 화면에 노출됩니다" → "…등록하고 사용료를 결제하면 이 화면에 노출됩니다" | "shown here after review" → "shown here once the usage fee is paid" |
| ad.step1(:60) | "1. 사이트 등록 — 요금제 선택 후 등록 심사비(Pi) 결제" → "1. 사이트 등록 — 요금제 선택 후 사용료(Pi) 결제" | "pay the review fee (Pi)" → "pay the usage fee (Pi)" |
| ad.step2(:61) | "2. 운영자 심사 — 승인되면 목록·검색·버블에 노출" → "2. 결제 후 {hours}시간이 지나면 자동으로 사용이 시작됩니다" | "Operator review — once approved…" → "Listing starts automatically {hours} hour(s) after payment" |
| ad.step3(:62) | "3. 승인 후 선택한 요금제 크기로…" → "3. 사용 기간 동안 선택한 요금제 크기로 메인 버블·목록·검색에 노출" | "After approval…" → "During the usage period…" |
| siteSts.*(:121-128) | DRAFT 작성 중(유지) / PENDING·APPROVED 키 삭제 / 신규 OPEN 신청가능 · APPLYING 신청중 · PAID 결제완료 · IN_USE 사용중 · USED 사용완료 / REJECTED "반려"→"반려됨" / SUSPENDED 정지 · WITHDRAWN 철회 유지 | OPEN Open · APPLYING Applying · PAID Paid · IN_USE In use · USED Used · REJECTED Rejected |
| rjctRsn.PAY_TIMEOUT(신규) | "결제 기한 초과" | "Payment deadline passed" |
| mySites.verifyGuide(:198) | "…관리자가 심사 때 확인합니다" → "…운영자 확인 배지에 사용됩니다(선택)" | "…admin checks during review" → "…used for the operator-verified badge (optional)" |
| mySites.payHint(:201) | "등록 심사비를 결제해야 관리자가 승인할 수 있습니다…" → "사용료를 결제하면 {delay}시간 후 자동으로 사용이 시작됩니다. 신청 후 {timeout}시간 안에 결제하지 않으면 반려됩니다. 결제는 Pi Browser에서만 가능합니다." | "The review fee must be paid before an admin can approve" → "Use starts automatically {delay} hour(s) after paying the usage fee. Unpaid applications are rejected after {timeout} hour(s)." |
| mySites.payGo(:202) | "심사비 {amount} Pi 결제하기" → "사용료 {amount} Pi 결제하기" | "Pay {amount} Pi review fee" → "Pay {amount} Pi usage fee" |
| mySites 신규 | payDeadline "결제 기한 {time}" · useStartAt "사용 시작 예정 {time}" · useEndAt "사용 종료 {time}" · permanent "영구" · reapplyUntil "재등록 가능 {time}까지" · reapply "재등록" · reapplyOpen "다시 신청" | Pay by {time} · Starts {time} · Ends {time} · Permanent · Re-register by {time} · Re-register · Apply again |
| pay.payNow(:205) | "{plan} 심사비 {amount} Pi 결제하기" → "{plan} 사용료 {amount} Pi 결제하기" | "…review fee" → "…usage fee" |
| pay.done(:207) | "결제가 완료되었습니다. 관리자 승인을 기다려 주세요." → "결제가 완료되었습니다. {delay}시간 후 자동으로 사용이 시작됩니다." | "…wait for admin approval" → "…use starts automatically in {delay} hour(s)" |
| pay.title(:211) | "등록 심사비 결제" → "사용료 결제" | "Pay registration review fee" → "Pay usage fee" |
| pay.intro(:212) | "…관리자 심사·승인이 진행됩니다…" → "아래 금액을 Pi로 결제하면 {delay}시간 후 사용이 시작됩니다…" | same pattern |
| pay.alreadyPaid(:219) | "…관리자 승인을 기다려 주세요." → "…사용 시작을 기다려 주세요." | "…wait for approval" → "…use will start shortly" |
| form.reReviewNote(:228) | 삭제(재심사 없음) | delete |
| form.piBrandWarn(:232) | "…심사에서 반려될 수 있습니다" → "…반려·정지될 수 있습니다" | "…rejected in review" → "…may be rejected or suspended" |
| form.imageHint(:237) | "…이미지도 심사 대상입니다" → "…부적절한 이미지는 반려·정지 사유입니다" | "Images are reviewed too" → "Inappropriate images lead to rejection or suspension" |
| form.pvtCntc(:239) | "심사용 연락처(비공개)" → "운영 연락처(비공개)" | "Review contact (private)" → "Operator contact (private)" |
| form.pvtHint(:240) | "심사 문의에만 쓰이며…" → "운영 문의에만 쓰이며…" | "review inquiries" → "operator inquiries" |
| form.pvtRequired(:241) | "심사 제출에는 심사용 연락처가 필요합니다." → "신청에는 운영 연락처가 필요합니다." | "…to submit for review" → "…to apply" |
| form.mvHint(:245) | "…입력·변경하면 다시 심사합니다." → 문장 삭제 | delete sentence |
| form.submit(:247) | "심사 제출" → "신청" | "Submit for review" → "Apply" |
| form.planHint(:250) | "…등록 기간·심사비(Pi)가 정해집니다. … 심사비 결제가 완료되어야 승인됩니다." → "…사용 기간·사용료(Pi)가 정해집니다. … 사용료 결제 후 사용이 시작됩니다." | "review fee…approved" → "usage fee…use starts after payment" |
| admin.tabSites(:255) | "사이트 심사" → "신청 관리" | "Site review" → "Applications" |
| admin.pvtCntc(:260) | "심사용 연락처" → "운영 연락처" | "Review contact" → "Operator contact" |
| admin.approve(:263) | 삭제 → 신규 admin.start "사용 시작" | "Approve" → start "Start now" |
| admin.ownershipVerified(:275) | 삭제(승인 체크 소멸) 또는 '운영자 확인 배지 부여'로 전용 [확인중] | delete |
| admin.unpaidNote(:278) | "등록 심사비가 결제되지 않아 승인할 수 없습니다(결제 후 승인)." → "사용료 미결제 — 신청 후 {timeout}시간 내 미결제 시 자동 반려" | "…cannot approve" → "Usage fee unpaid — auto-rejected {timeout} hour(s) after applying" |
| admin 신규 | colAply "신청일" · colUse "사용기간" · cfgTitle "운영 설정" · cfgPayTimeout "미결제 반려(시간)" · cfgUseStartDelay "사용 시작 지연(시간)" · cfgReapplyWindow "재등록 우선 창(시간)" · cfgSave "저장" · refundWarn "결제 완료 건입니다. 반려하면 환불은 수동 처리해야 합니다." | Applied · Usage period · Settings · Unpaid rejection (h) · Use start delay (h) · Re-register window (h) · Save · Paid application — refund must be handled manually |
| errors.DUPLICATE_DOMAIN(:316) | "이미 등록(심사 중 포함)된 도메인입니다" → "이미 등록(신청 중 포함)된 도메인입니다" | "(including in review)" → "(including applications)" |
| errors.SITE_LIMIT(:326) | "작성 중·심사 대기 사이트는…" → "작성 중·신청 중 사이트는…" | "pending review" → "applying" |
| errors.OWNERSHIP_NOT_VERIFIED(:330) | 삭제(코드 경로 소멸) | delete |
| errors.PAYMENT_REQUIRED(:336) | "등록 심사비 결제가…승인할 수 없습니다." → 삭제(코드 경로 소멸) | delete |
| errors.PAY_ALREADY_PAID(:338) | 유지(문구 그대로) | keep |

[코드 주석·헤더] S/src/lib/site.ts:86,182 · api.ts:22,30-33,41-42,168-170 · payments.ts:1 · components site-pay-button.tsx:3·pay-panel.tsx:3·my-sites.tsx:4·admin-panel.tsx:3·site-detail.tsx:66 · app ad/page.tsx:2·admin/page.tsx:1·pay/[siteId]/page.tsx:1·c/[ctgr]/page.tsx:1 · api fee-plans:1·me/sites:1-2·me/sites/[id]:3-6·admin/sites:1·admin/sites/[id]:1-6 — '등록 심사비'→'사용료', '심사 대기열'→'신청 목록', '심사 제출'→'신청', '승인'→'사용 시작'.
[SQL COMMENT] 012 에서 site_sts_cd·apv_dtm·pymnt_id·pvt_cntc_txt·fee_plan 재작성, fee_plan_nm 데이터 치환. 001·004·005·010 과거 파일은 수정 금지(이력).
[문서] S/docs/PRD.md §1(:12-14 '관리자(심사)'→'관리자(운영)', '등록 무료'→'사용료'), §3(:45,:51 심사 48시간 삭제, :56 구매 자격 IN_USE, :119-125 '등록 심사비'→'사용료'), §4(:138,:140), §5 상태 흐름 전면 교체(stateMachine 표 + site_st_cd 오기 → site_sts_cd), §6(:183 '심사 대기열'→'신청 관리'), §7 운영 설정 → sys_cfg 확정, §8(:211), §9 #6 환불 선결 그대로, 변경이력 v0.7 행. S/docs/ROADMAP.md :33-41·:50-51 완료 기준 '등록→결제→자동 사용중', 변경이력 2026-10-13 행, :50 'PRD v0.8' 표기 정합 [확인중 : PRD 버전]. S/docs/OPS_SETUP.md :20,:39,:42,:49,:64 '심사·승인'→'결제·자동 사용 시작'. S/CLAUDE.md :20·변경이력. 루트 docs/PRD_28_PI_MULTISITE.md 영향 없음(심사비·상태 표 없음) [확인중 : 최종 개정 때 재확인]. S/data-model ERD·S/pfd 다이어그램 상태 표기 갱신 [확인중 : grep 미수행].

## dataMigration
[대상] site_mst 전행(del_yn 무관) + site_sts_hist CHECK 합집합(과거 PENDING·APPROVED 행 보존, 재작성 금지) + fee_plan_nm 문구. 적용 순서 dev → stg → prod, 각 tier 에서 `node scripts/db-migrate.mjs --app sitemap --tier <tier>` 후 검증 SQL.
[매핑] (수집 결과 + S/sql/001:91-97·004:68-75 근거)
- DRAFT → DRAFT (변경 없음)
- PENDING ∧ pymnt_id NULL → APPLYING, aply_dtm = 이행 시각(1시간 유예 후 첫 크론이 PAY_TIMEOUT 반려) [확인중 : 마스터 — 유예 시간, 기본 1h]
- PENDING ∧ pymnt_id 있음 → PAID, aply_dtm = pay_dtm (pay_dtm + 1h 이미 경과 → 첫 크론에서 IN_USE 즉시 노출 = 심사 대기 중이던 결제 고객 즉시 공개)
- APPROVED → IN_USE, use_bgn_dtm = apv_dtm(노출 시작 시점 기준), use_end_dtm = apv_dtm + use_mon_cnt 개월(자사·VIP·NONE NULL). 이미 기간이 지난 행은 첫 크론에서 USED → 12h 후 OPEN (예 : 6개월 전 승인 BSC1 — 운영 COUNT 확인 필요)
- SUSPENDED → SUSPENDED + 동일 기간 계산 / REJECTED·WITHDRAWN → 그대로
- 자사 시드 19건(001:355-379 own_site_yn='Y' APPROVED) → IN_USE 영구(use_end_dtm NULL)
[전후 검증] ① 상태별 COUNT 합계 전후 동일 ② PENDING·APPROVED 0건 ③ site_sts_hist 에 chgr_id='SYSTEM' 이행 행수 = 치환 행수(트리거 자동) ④ IN_USE 행 use_bgn_dtm·apv_dtm NOT NULL 전건 ⑤ 공개 API /api/sites·/api/bubbles 건수 = 이행 전 APPROVED 건수 ⑥ 이행 직후 크론 1회 수동 호출 결과(started·used 건수)를 HANDOFF 에 기록
[롤백] 코드 치환은 역매핑(APPLYING·PAID→PENDING, IN_USE→APPROVED) UPDATE + 구 CHECK·인덱스 복원 SQL 을 012 하단 주석으로 동봉. sys_cfg 는 남겨도 무해.
[미확인] dev/stg/prod 상태별 행 분포·004 이전 무결제 APPROVED 외부 사이트 존재 여부 [확인중 : DB 직접 조회 — 마스터 승인 하 SELECT site_sts_cd, own_site_yn, (pymnt_id IS NOT NULL) paid, count(*) FROM site_mst GROUP BY 1,2,3].

## openQuestions
- Q1. 상태 주체는 도메인(site_mst 행) 1건으로 보는 게 맞는가? 고정 광고 슬롯 N개 모델이 아닌가 — 권장 기본값 : 도메인 행(현 UNIQUE 설계 그대로, 슬롯 테이블 없음).
- Q2. DRAFT(작성 중, 임시저장)를 '신청 전' 상태로 유지해도 되는가(6상태 밖) — 권장 기본값 : 유지(도메인 미점유·타이머 없음·코드 변경 0).
- Q3. SUSPENDED(정지)·WITHDRAWN(철회)를 예외 상태로 유지하는가, 정지를 '반려됨'에 합치는가 — 권장 기본값 : 유지(신고 체계·등재 심사 요건).
- Q4. 사용완료 후 12시간은 '직전 신청인만' 재등록 가능한 우선 창이고, 창이 끝나면 누구나 신청가능(OPEN)으로 보는가 — 권장 기본값 : 예.
- Q5. 재등록은 같은 행을 재사용(통계·최초 노출일 연속)하고 결제·기간 컬럼만 초기화하는가 — 권장 기본값 : 예.
- Q6. 결제완료(PAID) 상태에서 관리자가 반려하면 환불은? — 권장 기본값 : 수동 A2U(관리자 지갑), UI 경고만. 자동 환불은 PRD §9 #6 확정 후.
- Q7. 소유 확인(sitemap-verify.txt)을 강제하지 않고 선택 배지로 내리는가(심사 폐지 결과) — 권장 기본값 : 강제 해제, 토큰·배지 유지. 타인 도메인 등록은 신고→정지로 통제.
- Q8. 사용중(IN_USE) 사이트의 내용·이미지·이동 URL 수정을 재심사 없이 즉시 반영하는가 — 권장 기본값 : 예(도메인·요금제 변경은 잠금 유지).
- Q9. Vercel 플랜은 Pro 인가(크론 */5 가능)? Hobby 면 pg_cron 차선 — 권장 기본값 : Pro 전제, 플랜 확인 후 확정.
- Q10. 기존 PENDING 미결제 신청의 이행 유예 — 권장 기본값 : 이행 시각부터 설정값(1시간). 더 길게 원하면 이행 직전 sys_cfg 값을 임시 24 로 두고 다음날 1 로 복귀.
- Q11. apv_dtm 컬럼을 '최초 노출 개시일시'로 재정의해 유지하는가(개명 시 공개 API 파급) — 권장 기본값 : 유지, da-team 리뷰에서 최종.
- Q12. 내부 식별자(fee_tp_cd REGISTER·REG_*·SITE_REG·getRegFee·memo 'registration fee')는 비노출이라 개명 제외하는가 — 권장 기본값 : 제외(사용자 텍스트만 개명).
- Q13. 관리자 설정 3개(미결제 반려 1h·사용 시작 지연 1h·재등록 창 12h) 외에 추가 설정 키가 있는가 — 권장 기본값 : 3개.

## risks
- [결제 경합] 미결제 반려 크론과 Pi complete 경합 — 완화 : APPROVED 원장 존재 시 Pi cancel 선행·실패 시 건너뜀 + RPC 늦은 결제 구제. 잔여 : 구제 시 도메인 UNIQUE 충돌(타인이 그 사이 신청) → complete 500·수동 처리(극히 드묾).
- [무심사 공개] 금지 카테고리·Pi 상표 도메인(pi* : S/src/lib/site.ts:101)이 결제만으로 공개 — 등재 심사 레드라인(루트 docs/MAINNET_READINESS_CHECKLIST) 위험. 완화 : 1시간 관리자 검토 창(PAID 큐 기본 탭) + 신고→정지 + PI_BRAND 도메인은 신청 단계 409 차단 고려 [확인중 : 마스터 — 기본은 경고만 유지].
- [소유 확인 해제] 타인 .pi 도메인 선점 등록 가능 — 완화 : OWNERSHIP 반려 이력 차단 유지·신고. 잔여 : 마스터 Q7 결정 의존.
- [환불 부재] PAID 반려·IN_USE 정지 시 환불 수단 없음(원장에 환불 상태 없음) — 운영 수동 A2U, 분쟁 소지. PRD §9 #6 선결.
- [크론 주기] Vercel Hobby 면 1시간 타이머 불성립(일 1회) — 플랜 확인 전 배포 금지. 크론 미실행 시 PAID 가 영원히 대기(관리자 start 로 우회 가능).
- [시간 산술] use_mon_cnt 개월 가산은 월말 보정(make_interval) — JS 에서 재계산하지 말고 RPC 단일 장소만 사용(설계 반영). 설정값 변경은 소급 적용(USED→OPEN 창 등) — 의도된 단순화.
- [이력 CHECK 합집합] site_sts_hist 에 구 코드 허용이 남음 — 신규 유입은 트리거가 site_mst CHECK 로 막혀 불가. 수년 뒤 정리 대상.
- [미커밋 작업트리] admin-panel·admin/sites/route·ko/en·site-detail·bubble-home·sql/011·leave-dialog 수정분이 이번 변경과 같은 파일 — 착수 전 선커밋 필수(충돌·혼입 방지).
- [Pi Browser 실기기] 결제·노출 변경이므로 실기기 검증 전 완료 불가(루트 CLAUDE.md 핵심 가치) — 설정값을 0.05h 로 낮춰 1회 전 구간 검증 후 1h 복귀.
- [i18n 키 삭제] PENDING·APPROVED·OWNERSHIP_NOT_VERIFIED·PAYMENT_REQUIRED 키는 ko/en 동시 삭제(빈 값 금지, 루트 CLAUDE.md 번역 규칙) — sitemap 은 파일 번역만이라 DB 동기화 없음.

## phases
- P0 선행 커밋 — 작업트리 미커밋분(관리 테이블·sql/011·leave-dialog) 먼저 커밋. 검증 : git status clean, pnpm build.
- P1 DDL — S/sql/012_sitemap_site_use_sts.sql(위 초안) 작성 → da-team 리뷰(표준단어 APLY·USE_BGN/END·CFG 등재, sys_cfg 명명, apv_dtm 유지 판정, mod_dtm 트리거 함수명) → DA-APPROVED 주석 기입 → dev 적용. 검증 : 상태 COUNT 전후 동일·PENDING/APPROVED 0·hist SYSTEM 행수 일치·제약 6·인덱스 술어·RPC 2 존재. 커밋 1(SQL 만).
- P2 상태 코드 전환(서버) — site.ts 상수·타입, me/sites·me/sites/[id]·api.ts checkSiteWrite·admin/sites·admin/sites/[id](start/reject/suspend/restore)·payments prepare/approve/complete 주석·공개 필터 IN_USE 5곳·payments.ts markPaymentCanceled actor. 검증 : pnpm build + tsc, `rg "'PENDING'|'APPROVED'" src` 잔존 = pi_pymnt 원장 3곳만, dev 에서 등록→신청→결제→PAID 응답 확인(Pi Browser). 커밋 2.
- P3 상태 코드 전환(클라) — my-sites·pay-panel·admin-panel(탭·액션·열)·site-detail·ad page + siteSts·rjctRsn 번역키(ko/en 동시, 구 키 삭제). 검증 : pnpm build, 관리자 화면 PAID 탭 [사용 시작]→IN_USE→버블 노출, 내 사이트 상태 배지 9종. 커밋 3.
- P4 설정 — src/lib/cfg.ts·/api/admin/cfg·admin-panel 설정 섹션·fee-plans 응답 cfg 동봉·안내 문구 {hours}. 검증 : 값 변경 → GET 반영, 범위 밖 400. 커밋 4.
- P5 자동 전이 — /api/cron/site-sts-sweep·vercel.json crons·env.ts CRON_SECRET·.env.example. 검증 : automation 의 dev 시나리오 4종(curl Bearer) + 멱등 재호출 0건 + Pi cancel 분기(가짜 APPROVED 원장) 로그 확인. 커밋 5.
- P6 문구 개명 — ko/en 잔여 키(renameMap)·코드 주석·SQL 은 012 내 포함·fee_plan_nm. 검증 : `rg 심사 S/src S/messages` 잔존 0(허용 : 등재 '심사' 외부 문맥), ko↔en 키 집합 동일(scripts 없으면 jq 비교). 커밋 6.
- P7 문서 — PRD v0.7(§1·3·4·5·6·7·8), ROADMAP 변경이력 2026-10-13, OPS_SETUP, S/CLAUDE.md, HANDOFF, data-model ERD·pfd 상태 표기. 검증 : anakin_phase-review 검수(상태표·DDL 과 문서 일치). 커밋 7.
- P8 실기기·승격 — Pi Browser 실기기 : 신청→사용료 결제→PAID→(설정 0.05h)→IN_USE 버블 노출→(use 기간 조작)USED→OPEN, 미결제 1h 반려, 관리자 start·reject·설정 변경. 통과 후 stg→prod 마이그레이션 + prod/sitemap 승격, Vercel 개별 체크 success 확인(루트 CLAUDE.md 배포 검증 철칙). 완료 조건 = 실기기 로그 HANDOFF 기록.

# CRITIQUE

## gaps
- [치명] PAID 에서 관리자 반려 후 재신청 경로 미정의 — 전이 #5(PAID→REJECTED)는 pymnt_id·pay_dtm 을 지우지 않고(지울 수도 없음: site_mst_pay_dtm_check), 전이 #2 의 pymnt_id 초기화는 'USED·OPEN 재등록 시'만이다. 결과: REJECTED(관리자 사유, 결제 잔존) → 사용자 '다시 신청' → APPLYING(pymnt_id 보유) → prepare 는 PAY_ALREADY_PAID 409(S/src/app/api/payments/prepare/route.ts:48)로 결제 불가 → 크론 D 는 pymnt_id 를 안 보므로 1시간 뒤 PAY_TIMEOUT 반려(관리자 사유 덮어씀) → 무한 반복. 수정: ① 재신청 시 pymnt_id 가 있으면 곧바로 PAID 로(돈은 이미 받음) 또는 ② 결제 잔존 REJECTED 는 재신청 차단(환불 처리 전) 중 하나를 명시하고, 크론 D 조건에 `pymnt_id IS NULL` 추가.
- [치명] 관리자 반려(#5, APPLYING)에 진행 중 Pi 결제(pi_pymnt APPROVED) 검사가 없다 — 크론 D1 만 hasOtherApprovedPayment 를 본다. 지갑 서명 중 관리자가 반려하면 complete → RPC 는 `REJECTED AND rjct_rsn_cd='PAY_TIMEOUT'` 만 구제하므로 P0003 → 사용자 Pi 는 이미 전송됨(complete 선행, S/src/app/api/payments/complete/route.ts:46-55), 사이트는 반려. 기존 코드에도 있는 구멍(withdraw 는 막아놓고 admin reject 는 안 막음)이나 심사 폐지로 반려 빈도가 늘어 노출 커짐. 수정: admin reject 도 hasOtherApprovedPayment → 409 PAY_IN_PROGRESS(또는 크론과 같은 cancel-then-reject), 혹은 3b 구제 범위를 '모든 REJECTED(결제 잔존 없음)' 로 확장.
- [치명] 크론 D2 Pi cancel 이 온체인 전송 뒤(txid 존재, complete 미호출)에도 성공하면 '돈 나가고 반려'가 된다. 설계는 'Pi 가 거부한다'를 [확인중] 전제로 두고 있으나 거부 조건은 미검증. 수정: cancel 전 getPiPayment(S/src/lib/payments.ts:116)로 `transaction`(txid)·`status.transaction_verified`·`developer_completed` 를 확인하고 txid 가 있으면 cancel 하지 말고 skip(complete 가 마무리). 이미 있는 함수라 추가 비용 0.
- [높음] 무결제 도메인 점유 루프 — APPLYING 이 도메인을 점유(UNIQUE 술어 포함)하고 PAY_TIMEOUT 반려 뒤 같은 행을 즉시 재신청하면 aply_dtm 이 리셋된다. 결제 없이 1시간 점유 → 5분 공백 → 재점유를 무한 반복 가능(LIMITS.openMax=5 는 건수 제한이지 반복 제한이 아님). 수정: site_sts_hist(chg_rsn_cd='PAY_TIMEOUT') 를 세어 같은 (사용자,도메인) 24h 내 N회 초과 시 쿨다운 409, 또는 PAY_TIMEOUT 재신청은 DRAFT 로만 복귀(도메인 미점유) 후 다시 제출.
- [높음] fee_plan 결측 → 영구 무료 노출. fn_bgn_site_use 의 `(SELECT ... FROM fee_plan WHERE plan_cd = m.plan_cd AND del_yn='N')` 은 행이 없으면 NULL → use_end_dtm NULL = 영구. 해당 케이스: ① sql/001 기본값 plan_cd='NONE' 인 004 이전 외부 행(REGISTER×NONE 요금 행 없음), ② 요금제 폐기(del_yn='Y') 후 전이, ③ 관리자 단가 0 요금제. 수정: 외부 사이트(own_site_yn='N')는 fee_plan 행·use_mon_cnt 필수로 RAISE, CHECK `own_site_yn='Y' OR site_sts_cd<>'IN_USE' OR use_end_dtm IS NOT NULL` 추가, 이행 전 `SELECT count(*) FROM site_mst WHERE own_site_yn='N' AND plan_cd='NONE'` 확인·BSC1 등으로 정정.
- [높음] 0 Pi 요금제(fee_plan_pi_amt_check 는 ≥0 허용, ROADMAP '관리자 단가 0 허용')의 APPLYING→PAID 경로가 없다 — prepare/approve 는 PAY_NOT_REQUIRED 409(prepare:52) 라 결제가 불가하고, 크론은 1시간 뒤 PAY_TIMEOUT 반려. 수정: submit 시 서버가 fee=0 이면 즉시 PAID(pay_dtm=now, pymnt_id NULL → pay_dtm_check 위반!) — CHECK `(pymnt_id IS NULL)=(pay_dtm IS NULL)` 과 충돌하므로 0 Pi 를 허용할지(허용 시 CHECK 완화·free_yn 등) 아예 금지할지(fee_plan CHECK >0) 결정 필요.
- [높음] SUSPENDED 행의 사용기간 만료 전이 없음 — 크론 A 는 IN_USE 만 USED 로 보낸다. 정지 중 use_end_dtm 이 지나면 SUSPENDED 가 영구히 도메인을 점유(UNIQUE 포함)하고 사용자는 철회도 불가(#12 제외). '정지 중에도 use_end_dtm 은 흐름' 이라 적어 놓고 끝 상태로 가는 길이 없다. 수정: 크론에 SUSPENDED AND use_end_dtm + 재등록창 ≤ now → OPEN(점유 해제, 제재 이력은 hist 에 남음) 추가, 또는 정지 만료는 영구 점유가 의도라면 명시.
- [높음] 외부 사이트의 `site_mv_url`(이동 URL) 변경이 IN_USE 에서 즉시 반영 — sql/002 COMMENT 는 '입력·변경 시 PENDING 재심사' 전제였다. 공개 직후 피싱 URL 로 교체 가능(신고→정지는 사후). 수정: IN_USE 에서 site_mv_url·site_dom_nm 변경은 잠금(다음 재등록 때만) 또는 변경 시 관리자 큐 플래그(mv_url_chg_yn)만 추가.
- [중간] 금지 카테고리(GAMBLING 등)로 반려된 행이 전이 #2 로 재신청 → 결제 → 1시간 뒤 자동 IN_USE. OWNERSHIP 만 재제출 차단(checkSiteWrite)이고 나머지 8종은 심사 없이 재공개된다. 수정: 금지 7종(PRD §5)은 OWNERSHIP 과 같이 재신청 차단하거나, 해당 이력 행은 크론 자동 IN_USE 제외 + 관리자 start 필수(결제는 받되 수동 개시).
- [중간] 사용 중 연장(갱신) 전이 없음 — IN_USE 에서 재결제 불가(PAYABLE_STS=[APPLYING])라 소유자는 만료→USED→재등록→결제→+1h 를 거쳐야 하므로 최소 1시간+ 노출 공백이 강제된다. PRD §3 EXTEND(만료 7일 전부터 연장)와 충돌. 수정: 이번 범위 밖이면 PRD 에 '연장은 Phase 2' 로 명시하고 안내 문구에 공백을 고지.
- [중간] 공개 전 '1시간 검토 창'은 알림이 없으면 허구 — 관리자 패널 기본 탭을 PAID 로 두는 것 외에 통지 수단이 없다. 수정: 최소한 크론 응답/console 로 started 건을 기록하고, 후속으로 관리자 알림(메일·푸시) 과제를 ROADMAP 에 등재.
- [중간] CRON_SECRET 을 optional 로 두면 미설정 운영에서 401 이 영구 반환되어 PAID 가 영원히 대기(관리자 start 우회만 가능)하는데 아무 경보가 없다. 루트는 production 필수(C:/Users/anaki/workspace/loginpi/src/env.ts:45-47). 수정: sitemap env.ts createFinalSchema 에 prod tier 필수 조건 추가(ADMIN_PI_UIDS 선례와 동일).
- [중간] 크론 1회 상한 50건 × Pi cancel 직렬 호출 — Vercel 함수 기본 maxDuration(10~15s) 초과 가능. 수정: `export const maxDuration = 60` + D 단계 상한을 10~20건으로 축소.
- [낮음] OPEN 행이 영구 잔존 — UNIQUE 에서 빠져 타인이 새 행을 만들어도 옛 OPEN 행은 소유자 '내 사이트'에 [다시 신청]·수정 가능 상태로 남는다(EDITABLE 포함). 수정: OPEN 은 수정 불가·재신청만 허용하고, 재신청 시 DUPLICATE_DOMAIN 이면 안내.
- [낮음] 재등록 시 pymnt_id/pay_dtm 을 NULL 로 초기화하면 '어느 결제가 어느 사용기간을 샀는가'가 site_mst 에서 사라진다(pi_pymnt.meta_val 의 site_id 로만 역추적). 감사 요구(PRD §8 '결제 상태 변경 이력 보존')에 걸릴 수 있음. 수정: 간단히는 site_sts_hist 트리거가 PAID→IN_USE 전이 시 chg_rsn_cont 에 pymnt_id·use_bgn/end 스냅샷을 남기도록 확장.
- [낮음] 자사 사이트(own_site_yn='Y')의 신규 생성 경로가 시드 SQL 뿐인데 새 CHECK(aply_dtm·apv_dtm·use_bgn_dtm NOT NULL for IN_USE)가 추가되므로 향후 시드 INSERT 가 CHECK 위반으로 실패한다. 수정: 012 주석에 자사 시드 작성 규칙(세 컬럼 CURRENT_TIMESTAMP) 명시 또는 자사 행은 CHECK 제외(own_site_yn='Y' OR ...).
- [낮음] hasOtherApprovedPayment 의 `.contains('meta_val',{site_id})` 는 pi_pymnt 에 JSONB 인덱스가 없어 크론 후보마다 seq scan. 지금은 소량이나 공개 집계 성능 규칙상 `CREATE INDEX ... ((meta_val->>'site_id')) WHERE pymnt_sts_cd='APPROVED'` 부분 인덱스 1개를 012 에 동봉 권장.

## contradictions
- [높음] 'VIP = 영구(NULL)' 전제가 낡음 — sql/009 로 VIP use_mon_cnt=60, PRD §3-4 '영구 요금제 없음'. 현재 fee_plan 에 NULL 인 REGISTER 행은 없다. 설계문·안내 문구('영구' 표시)·fn_bgn_site_use 의 NULL 분기는 자사 전용으로만 서술할 것.
- [높음] bubbles/route.ts:77 의 'APPROVED' 는 DB 가 아니라 ../sites.json 레지스트리 `listSts`(19건 전부 "APPROVED") 필터다. 설계가 이 줄을 IN_USE 로 치환 대상 5곳에 넣었는데 sites.json 을 같이 바꾸지 않으면 DB 미연결 데모 폴백 버블이 0건이 된다. 치환 대상은 bubbles/route.ts:105 만(또는 sites.json 19행 동시 갱신).
- [중간] 상태 코드 OPEN 과 기존 상수 OPEN_STS(사용자당 상한 집계 = DRAFT+APPLYING) 가 이름 충돌 — 'OPEN' 상태는 OPEN_STS 에 들어가지 않는다. 코드 리뷰·검색(`rg OPEN`)에서 혼선 확실. 상태명을 AVAIL/EXPIRED 로 하거나 상수를 LIMIT_STS 로 개명.
- [중간] 스펙 '신청가능 — 현재 광고가 등록되지 않아서 누가 신청가능' 은 등록이 없는 상태(파생)인데 설계는 저장 상태 OPEN 을 겸용한다. 저장된 OPEN 행은 옛 소유자의 콘텐츠·상태 배지를 유지하므로 사용자에게 '신청가능' 으로 보이는 행이 사실은 '만료 종료' 행이다. 명칭 EXPIRED(사용종료) 가 스펙 의도에 가깝고, 화면의 '신청가능' 은 파생 라벨로 분리.
- [중간] 스펙 '반려됨 — 특정사유로 관리자가 반려시킬 수 있음' 에 상태 제한이 없으나 설계는 APPLYING·PAID 에서만 반려, IN_USE 는 정지(SUSPENDED)로 분리했다(부가 가정 B). 마스터 확인 항목(Q3)으로는 들어 있으나 전이표 #5 가 이미 확정체로 쓰여 있어 문서 간 불일치. [확인중: 마스터] 를 #5 에도 표기.
- [중간] renameMap 이 `admin.unpaidNote`·`mySites.payHint` 에서 '신청 후 {timeout}시간 내 미결제 시 자동 반려' 라고 안내하지만, 전이표 #4 는 진행 중 Pi 결제가 있으면 반려를 건너뛴다. 문구와 동작이 다르면 분쟁 소지 — '결제를 시작하지 않으면' 으로 문구 조정.
- [낮음] 전이 #6/#7 이 apv_dtm 을 '최초 노출 개시' 로 COALESCE 유지해 재등록 사이트는 일반 순위에서 옛 승인일로 정렬된다(PRD §4 '승인일 역순' = 최신 등록 상단). 재등록 사이트가 항상 하단 → 설계 의도('순위 연속')가 PRD 문구와 반대. PRD §4 문구를 '최초 노출일 역순' 으로 함께 고칠 것.
- [낮음] 설계 'DRAFT 코드 변경 0' 과 apiChanges 의 EDITABLE/DOMAIN_EDITABLE 공용화·my-sites EDITABLE 삭제는 DRAFT 분기도 건드린다 — '변경 0' 은 과장.

## migrationRisks
- [높음] PENDING+결제 행 → PAID 이행 후 첫 크론(≤5분)이 pay_dtm+1h 경과로 즉시 IN_USE — 심사 대기 중이던 결제 고객이 소유 확인·금지 카테고리 검토 없이 즉시 공개된다. 완화: 이행 커밋과 vercel.json crons 배포를 분리해 관리자가 PAID 탭을 한 번 훑은 뒤 크론을 켜거나, 이행 직전 sys_cfg use_start_delay 를 크게(예 24h) 두고 복귀.
- [높음] 운영 DB 의 004 이전 외부 APPROVED(무결제·plan_cd NONE 가능) 행수 미확인 — 이 행들은 IN_USE·use_end NULL(영구 무료) 로 넘어간다. 이행 전 `SELECT site_sts_cd, own_site_yn, plan_cd, (pymnt_id IS NOT NULL) paid, count(*) FROM site_mst GROUP BY 1,2,3,4` 를 dev·stg·prod 전부 실행해 HANDOFF 에 기록하고, NONE·무결제 외부 행 처리(수동 요금제 배정 또는 USED 이행)를 012 에 코드로 박을 것.
- [높음] 환불 기록 수단 부재 — pi_pymnt_pymnt_sts_cd_check 는 APPROVED/COMPLETED/CANCELED 뿐이라 PAID 반려·정지 시 수동 A2U 환불을 원장에 남길 수 없다. 법적 청약철회(PRD §9 #9·#10)와 결합해 분쟁 시 증빙 불가. 최소: pi-db 에 rfnd_dtm·rfnd_tx_id 컬럼(또는 REFUNDED 상태) 선행, 아니면 PAID 반려 액션 자체를 보류.
- [중간] 전이 3b(REJECTED(PAY_TIMEOUT)→PAID) 는 사실상 도달 불가 경로 — approve 가 PAYABLE_STS=APPLYING 을 검사하고 크론 D1 이 APPROVED 원장을 건너뛰므로, 남는 창은 approve 의 상태 읽기와 크론 UPDATE 사이 수 ms 뿐. 유지하되 '극히 드묾' 근거를 이렇게 명시하고, 발생 시 23505 로 complete 가 500 → 사용자 Pi 전송 완료·사이트 반려 상태라는 사고 처리 절차(수동 환불)를 OPS_SETUP 에 적을 것.
- [중간] 이행 트랜잭션 안에서 DROP INDEX → UPDATE → CREATE UNIQUE INDEX(비동시) — 운영 표가 작아 잠금은 짧지만, UPDATE 가 트리거로 site_sts_hist 에 행당 INSERT 를 발생시키고 hist 의 새 CHECK(3단계)가 먼저 적용되어야 한다. 순서는 맞으나 `CREATE TRIGGER trg_sys_cfg_mod_dtm` 에 DROP IF EXISTS 가 없어 부분 실패 후 재실행 시 42710 으로 전체 롤백. 프로젝트 패턴(004:42-45) 대로 DROP TRIGGER IF EXISTS 선행.
- [중간] 롤백 SQL 이 주석으로만 동봉 — 역매핑(IN_USE→APPROVED) 시 site_mst_vrf_yn_apv_check(삭제됨) 를 되살리면 소유 미확인 외부 IN_USE 행이 CHECK 위반으로 복원 실패한다. 롤백은 vrf 제약 복원을 제외하거나 별도 파일로 검증해 둘 것.
- [중간] Vercel 크론은 production 배포에서만 실행된다 — staging 이 preview 브랜치라면 stg 에서 자동 전이를 검증할 수 없고 curl 수동 호출만 가능. 검증 시나리오에 'stg 는 수동 curl, prod 1회 관찰' 을 명시. 플랜은 팀 단위라 sitemaps 프로젝트가 loginpi 와 같은 팀이면 루트가 이미 `* * * * *` 크론을 돌리므로 Pro 전제 성립(Q9 해소 가능 — 팀 소속만 확인).
- [낮음] i18n PENDING·APPROVED 키 삭제 후 site_sts_hist 과거 행(old_sts_cd 구 코드)을 화면에 보여줄 때 번역 누락 — 현재 hist 화면이 없으니 즉시 문제는 아니나 폐기 키 삭제와 함께 '이력 표시는 코드 원문' 규칙을 남길 것.
- [낮음] 중복 크론 실행(이전 회차가 5분을 넘길 때 Vercel 은 겹침을 막지 않음) — 모든 UPDATE 가 현재 상태 조건부라 안전하지만 D2 의 Pi cancel 이 두 번 호출될 수 있다(두 번째는 Pi 오류 → skip). 허용 가능, 로그 노이즈만 각오.

## verdict
조건부 반려(REVISE) — 상태 모델·DDL 골격·크론 멱등 설계는 타당하나 결제·반려 경계에서 돈이 걸린 결함이 있다. 착수 전 필수 수정 6건: ① PAID 반려 후 재신청(pymnt_id 잔존) 경로 정의 + 크론 D 에 pymnt_id IS NULL 조건, ② 관리자 반려에 진행 중 Pi 결제 검사, ③ 크론 Pi cancel 전 txid 존재 확인(getPiPayment 재사용), ④ 무결제 점유 루프 쿨다운, ⑤ fee_plan 결측·NONE·0 Pi 외부 행의 영구 무료 노출 차단(RAISE + CHECK), ⑥ bubbles/route.ts:77 은 sites.json 필터이므로 치환 제외. 추가로 SUSPENDED 만료 전이·mv_url 즉시 변경·환불 기록 부재는 마스터 결정 항목으로 openQuestions 에 올릴 것(Q6 확장). DA: APLY(4자)는 2026-10-10 '2~3자' 규칙과 충돌(APL 등 재검토), cfg_key 는 도메인 접미사 미등재(cfg_cd 권장), cfg_val 은 등재 도메인 VAL(JSONB) 과 타입 불일치 명시 필요, 공용 트리거 함수 fn_upd_fee_plan_mod_dtm 재사용은 테이블별 함수 관례 위반(fn_upd_sys_cfg_mod_dtm). 성능 규칙 위반은 없음(페이징 유지, 크론 상한, 캐시 동봉) — hasOtherApprovedPayment 의 JSONB containment 부분 인덱스만 권고. 근거 파일: S/sql/001:91-124, 002:47-49·187-197, 004:68-75, 005:48, 009, S/src/lib/api.ts:168-200, S/src/lib/payments.ts:116-192, S/src/app/api/payments/{prepare,approve,complete,cancel}/route.ts, S/src/app/api/me/sites/[id]/route.ts:85-116, S/src/app/api/admin/sites/[id]/route.ts, S/src/app/api/bubbles/route.ts:77·105, ../sites.json listSts, 루트 src/env.ts:45-47·src/app/api/cron/refund-sweep/route.ts, docs/da/데이터표준규칙.md:65-110.