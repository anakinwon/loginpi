# 01_standards_dictionary — sitemap.pi 1차 데이터 모델 표준사전 (r3)

- 잡 : `20261010_sitemap-data-model` / 단계 : 01 표준 / 작성 : standards / 작성일 2026-10-10 / 승인 : leader — r2 APPROVED(01_leader_standards-approval_r3), **r3 = 마스터 약어 규칙 변경에 따른 개정, 재승인 요청**
- 입력 : `00_input.md`(§3-1 마스터 확정 4건 포함), `00_requirements.md`(REQ-01~92), leader 사전 판정 D1~D3
- 정본 : `docs/da/데이터표준규칙.md`(v2.2, §0~§9), 루트 `CLAUDE.md` DB 절, `.claude/hooks/da-ddl-guard.mjs`(PREFIX_RE·DOMAIN_SUFFIXES)
- 선례 : As-Is `sitemap/sitemap.pi/sql/001_sitemap_phase1.sql`(DA 판정 1~13), `packages/pi-db/sql/000_baseline.sql`, cafe `sql/089`·`sql/149`·`sql/176`(표준단어 10종 등재 형식)·`sql/037`(crd 등재)
- **한계 — 운영 std_dic 역검증 미수행, 등재 SQL 기준** : 표준사전 원장(`std_dic`·`std_dom`, cafe DB)을 조회하려면 `.env.local` 을 읽어야 하는데 비밀 파일 가드에 막혔다(우회하지 않음, leader 인정). "정본 재사용" 판정 근거는 정본 §9 약어표, sql/176·037 등재 SQL, cafe·001 DDL 사용례다. `등재확인` 열의 `문서` = 정본이나 등재 SQL에 근거 있음 / `사용례` = DDL에서 쓰였지만 등재 여부 미확인. **사용례만 있는 단어는 전부 §8 등재 SQL에 멱등(`WHERE NOT EXISTS`) 형식으로 넣었다** — 이미 등재돼 있으면 건너뛴다.
- 표기 : `[TBD]` 근거 없는 값 / `[확인중 : 마스터]` 마스터 결정 대기 / `[DA 판정 필요]` leader 판정 대기 / `판정 완료(Dn)` leader 판정 반영 / `정본 개정 제안(Pn)` 이 잡 쓰기 범위 밖이라 마스터에게 상신

### 변경 이력

| 판 | 날짜 | 내용 |
|---|---|---|
| r1 | 2026-10-10 | 초판 |
| r2 | 2026-10-10 | leader 판정 D1(`*_pi_amt`·amt·NUMERIC(18,7)), D2(site_ 유효·정본 개정 제안), D3(days·qty 도메인 반려·sort 사전 확인) 반영. 마스터 확정 4건(REQ-14·35·36·55) 반영 → 제재 엔터티 `usr_sanc`·단어 SANC·RLSE 추가. 자체 결함 2건 정정 : ① r1 머리말은 "사용례 단어를 SQL에 포함"이라 했으나 실제로 빠져 있었음 → §8에 10개 추가 ② `fee_knd_cd` 의 KND 가 정본 §9 TP(유형)와 이음동의어 → `fee_tp_cd` 로 교정. §7 을 판정 완료·잔여 판정·정본 개정 제안으로 재구성. **r1 반려(P1 4건) 대응** : P1-1 제재 엔터티(`usr_sanc`, 처리자 `prcs_usr_id` 포함) / P1-2 REQ-35·36·55 확정 사실 기재 / P1-3 싱글톤 `cfg_key CHAR(1)` 삭제 → 상수 식 부분 UNIQUE 인덱스 규칙 / P1-4 사용례 10개 §8 추가(KND 는 TP 이음동의라 빼고 IMG 를 넣어 10개 유지, 신규 SANC·RLSE 포함 총 44행). §7-2 에 r1 D-1~D-9 판정 결과 기재. **r2 반려 대응** : §3 key 행 문구를 leader 지시문과 동일하게 교정(promo_fee_cfg cfg_key 행 삭제·§6 "_yn 외 CHAR(n)" 행은 r2 에서 이미 반영), §7-2 전건 "판정 완료(r1)" 표기 |
| r3 | 2026-10-10 | **마스터 지시 약어 규칙 변경** : 이동 MV·주문 ORD 지정, 신규 단어는 자음 위주 2~3자 현장 최빈형(21개 전부 재검토 — 15개 변경, 8개 유지), 순서 도메인 `ord` 신규 금지 → `seq` 통합(`sort_seq`·`img_seq`). LST(cafe = last)·RLS(Row Level Security) 충돌로 정가 NRM·해제 REL. 기존 등재·grandfathered·001 단어 유지. 전체 변경표 §9 |

---

## 1. 적용 명명 규칙 요약

### 1-1. 테이블 접두사 체계 (정본 §2-1) — 신규 접두사 없음

| 접두사 | 주제영역 | sitemap 사용처 | 근거·상태 |
|---|---|---|---|
| `sys_` | 시스템 공통(사용자·권한·설정) | `sys_user`(baseline 승계, 재정의·확장 금지), 운영 설정 `sys_cfg`·`sys_cfg_chg_hist` | 정본 등재. 운영 설정은 새 접두사를 만들지 않고 sys_ 를 재사용(정본 "설정" 범위). `sys_cfg_chg_hist` 는 cafe sql/176 과 같은 이름·구조 |
| `usr_` | 사용자 부속 이력 | 계정 제재 `usr_snc`(REQ-14, 마스터 확정 : sitemap 측 별도 엔터티) | 정본 등재. sys_user 를 확장하지 않는 사용자 부속 엔터티라 usr_ 가 맞다(sys_ 는 공용 baseline 영역이라 피함) |
| `pi_` | Pi Network 연동(결제) | `pi_pymnt` — `@pi/db` `010_pi_pymnt.sql` 대기, **참조만, 재정의 금지**(REQ-69) | 정본 등재 |
| `site_` | .pi 사이트 디렉터리 | `site_mst`·`site_rpt`(기존), `site_sts_hist`·`site_img`(신규 후보), Phase 3 `site_rvw` | **판정 완료(D2)** : 001 DA-APPROVED(2026-10-09)로 유효. DDL 초안 상단에 001 승인 승계 주석을 단다. 정본 §2-1·Hook 반영은 P-1 |
| `stat_` | 통계 중간집계(일별 rollup) | `stat_site_dly`(기존), STATS 유입 집계(Phase 2, [TBD]) | 정본 등재 |
| `fee_` | 요금 모드 설정 | `fee_plan`·`fee_plan_bnd`·`fee_ord`·`fee_ord_hist`(Phase 2) | 정본 등재. 정본 설명을 넓히는 일은 P-3 |
| `promo_` | 프로모션 설정 | 오픈 프로모션 싱글톤 `promo_fee_cfg`(Phase 2) | 정본 등재. PRD 가칭 `promo_fee_config` 는 교정(D-5) |

- 사이트 전용 DB(REQ-02)라 cafe 테이블명과 겹쳐도 충돌은 없다. 다만 **같은 이름이면 같은 의미와 구조**여야 한다. cafe 의 비표준 명칭(`promo_fee_config`·`stock_qty`·`reason_memo` 등)은 이름만 빌리지 않고 표준명으로 새로 짓는다. leader 판정 D1 대로 선례나 초안을 따랐다는 것은 사유가 되지 않는다.
- 테이블명 : 소문자 snake_case, 단수형, 단어 3개 이하(접두사 포함), 단어는 등재 약어만 쓴다.

### 1-2. 컬럼 명명 규칙 (정본 §1-3·§3)

1. 형식 `표준단어1(_표준단어n)_표준도메인`. 마지막 토큰은 반드시 Hook `DOMAIN_SUFFIXES` 26종 가운데 하나여야 한다. `ALTER TABLE ADD COLUMN` 도 같은 강도로 검사한다. **신규 도메인 `days`·`qty` 등재는 반려됐다(판정 완료 D3, cnt 와 이음동의어)** — 일수·수량은 `*_cnt` 로 끝낸다.
2. PK : `<엔터티약어>_id UUID DEFAULT gen_random_uuid()`. FK : 부모 PK 이름을 그대로 쓰거나, `sys_user.id` 참조는 `<역할>_usr_id`(선례 `ownr_usr_id`·`rptr_usr_id`).
3. 상태는 `*_sts_cd`(001 판정 2). 유형은 `*_tp_cd`(정본 §9 type = tp, 001 선례 `p_cnt_tp_cd`).
4. **금액은 `*_pi_amt`**(판정 완료 D1) : `pi` 는 수식어 단어, 도메인은 `amt`, 타입은 `NUMERIC(18,7)` 로 한정한다.
5. 코드값은 영문 대문자 UPPER_SNAKE이고 CHECK 로 강제한다(001 판정 3). 표시명은 번역키에 두고 DB에는 이름을 중복 저장하지 않는다(REQ-85).
6. 시스템 컬럼 4종 `regr_id → reg_dtm → modr_id → mod_dtm` 을 테이블 맨 끝에 둔다. 논리삭제 `del_yn CHAR(1)` + `del_dtm TIMESTAMPTZ` 를 쓰고 물리 DELETE 는 금지한다. append-only `_hist` 는 mod_dtm 트리거만 예외다(정본 §6).
7. 제약·인덱스·트리거 이름 : 정본 §5·§6(`<tbl>_<col>_check`, `<자식>_<부모>_id_fkey`, `idx_<tbl>_<col>`, 부분 UNIQUE `ux_<tbl>_<col>_actv`(001 선례), `fn_upd_<tbl>_mod_dtm`/`trg_<tbl>_mod_dtm`).
8. 감사 이력의 행위자·시각은 업무 컬럼 `chgr_id TEXT`·`chg_dtm TIMESTAMPTZ` 로 둔다(sql/176 선례). 시스템 컬럼은 따로 유지한다.

---

## 2. 표준단어

### 2-0. 이음동의어·동음이의어 사전 검색 방법 (leader 지시)

신규 단어마다 아래 네 곳을 검색했고, 결과는 §2-3 `동의어 점검` 열에 남겼다.
1. 정본 §9 표준 약어 목록(38개)
2. sql/176 등재분 10종(CFG·CHG·HIST·TBL·TGT·ACTN·RSN·CHGR·OLD·NEW)과 sql/037 등재분(LATD·LNGT·CRD)
3. cafe `sql/*.sql` 198개 파일의 식별자 사용례(약어 후보와 영문 원형 모두로 grep, 예 `ordr`/`order`, `bgn`/`start`, `vrfy`/`verify`, `stk`/`stock`, `knd`, `link`, `sanc`/`susp`/`block`)
4. baseline·001 의 컬럼·코드값

운영 std_dic 자체는 검색하지 못했다(머리말 한계). 따라서 "충돌 없음"은 위 네 곳 기준이다.

### 2-1. 정본 재사용

| 한글명 | 약어 | 영문 | 등재확인 | sitemap 용례 |
|---|---|---|---|---|
| 등록자 / 등록 | REGR / REG | registrant / register | 문서 §9 | 시스템 컬럼 |
| 변경자 / 변경(수정) | MODR / MOD | modifier / modified | 문서 §9 | 시스템 컬럼 |
| 삭제 | DEL | delete | 문서 §9 | `del_yn`·`del_dtm` |
| 사용자 | USR | user | 문서 §9 | `ownr_usr_id`·`ord_usr_id`·`tgt_usr_id` |
| 결제 | PYMNT* | payment | 문서 §9(grandfathered) | `pymnt_id` |
| 구독 | SUBSCR* | subscription | 문서 §9(grandfathered) | `subscr_yn`·`subscr_cnl_yn` |
| 카테고리 | CTGR | category | 문서 §9 | `site_ctgr_cd` |
| 도메인 | DOM | domain | 문서 §9 | `site_dom_nm`·`vrf_dom_nm` |
| 상태 | STS | status | 문서 §9 | `*_sts_cd` |
| 유형 | TP | type | 문서 §9 | `fee_tp_cd`·`ord_tp_cd`·`snc_tp_cd` |
| 승인 | APV | approval | 문서 §9 | `apv_dtm` |
| 설명 | DESC | description | 문서 §9 | `site_desc`·`fee_plan_desc` |
| 순번 / 건수 / 금액 / 코드 / 이름 / 번호 | SEQ / CNT / AMT / CD / NM / NO | — | 문서 §9 | 도메인 겸용. **r3 : "순서"는 SEQ 로 통합**(ORD 는 이제 "주문" 단어 — §2-3 W03, 순서 도메인 `ord` 는 신규 사용 금지) |
| 설정 / 변경 / 이력 / 테이블 / 대상 / 행위 / 사유 / 변경자 / 전 / 후 | CFG / CHG / HIST / TBL / TGT / ACTN / RSN / CHGR / OLD / NEW | — | 문서 sql/176 등재 | `sys_cfg`·`*_hist`·`old_sts_cd`·`chg_rsn_cont`·`tgt_usr_id` |
| 키 / 값 / 내용 / 텍스트 / URL | KEY / VAL / CONT / TXT / URL | — | 문서 §1-2(도메인 겸 단어) | `cfg_key`·`cfg_val`·`rpt_cont` |
| 신고 | RPT | report | 사용례(001 판정 5 "선례 등재어") → §8 | `site_rpt` |
| 통계 | STAT | statistics | 사용례(접두사·001) → §8 | `stat_site_dly` |
| 요금 | FEE | fee | 사용례(cafe `fee_plan_cd`·접두사) → §8 | `fee_plan_cd` |
| 사용 | USE | use | 사용례(정본 §3-4 `use_yn` 예시) → §8 | `use_yn`·`use_bgn_dtm` |
| 정렬 | SORT | sort | **사용례만 있음(cafe `sort_ord` 7곳). 정본 §9·sql/176 에 없음** → §8 등재(D3 확인 결과). r3 : 신규 정렬순서는 `sort_seq`(cafe `sort_ord` 는 grandfathered) | `sort_seq` |
| 종료 | END | end | 사용례(cafe `end_dtm`·`promo_end_dtm`) → §8 | `use_end_dtm` |
| 만료 | EXPR | expire | 사용례(cafe `expr_dtm`) → §8 | `hld_expr_dtm` |
| 활성 | ACTV | active | 사용례(cafe `actv_yn`, baseline `_actv` 인덱스) → §8 | `promo_actv_yn` |
| 항목 | ITEM | item | 사용례(cafe `mps_item`) → §8 | `item_plan_cd` |
| 이미지 | IMG | image | 사용례(cafe `img_url`·`img_ord`, 001 판정 5 등재 대상) → §8 | `site_img_url`·`site_img` |

> **KND(종류) 사용 중지** — r1 은 cafe `fee_knd_cd` 를 재사용 대상으로 봤다. 하지만 KND 는 정본 §9 에 없고, §9 등재어 TP(유형)와 뜻이 같아 이음동의어가 된다. 따라서 `fee_knd_cd` → **`fee_tp_cd`**(요금유형코드)로 교정한다. PRD·00_requirements 의 `fee_knd_cd` 는 가칭이다(D1 원칙).

### 2-2. 001 에서 쓰였으나 등재 대기 (001 판정 5·12 "신규 표준단어 등재 대상")

| 한글명 | 약어 | 영문 | 의미 | 근거 |
|---|---|---|---|---|
| 사이트 | SITE | site | 등록된 .pi 사이트(디렉터리 등재 단위) | 001 판정 5 |
| 소유자 | OWNR | owner | 사이트 등록·소유 사용자(복합어, REGR 계열) | 001 판정 5, cafe `ownr_usr_id` |
| 자사 | OWN | own(first-party) | 운영사 소유(자사) 사이트 — **"소유"의 뜻으로 쓰지 않는다**(소유자는 OWNR) | 001 판정 5 |
| 반려 | RJCT | reject | 심사 반려 | 001 판정 5 |
| 신고자 | RPTR | reporter | 신고한 사용자(복합어) | 001 판정 5 |
| 처리 | PRCS | process | 신고 처리 | 001 판정 5 |
| 클릭 | CLCK | click | "사이트 방문" 외부 이동 확인 클릭 | 001 판정 5 |
| 연락처 | CNTC | contact | 연락 수단 | 001 판정 5 |
| 비공개 / 공개 | PVT / PUB | private / public | 공개 범위 | 001 판정 5 |
| 조회 | VIEW | view | 상세 페이지 조회 | 001 판정 5 |
| 일별 | DLY | daily | 일 단위 집계 | 001 판정 5 |
| 마스터 | MST | master | 기준 정보 엔터티 | 001 판정 5 |
| 요금제 | PLAN | plan | 노출 요금 단계(VIP~BSC1·NONE) / 요금 상품(`fee_plan`) | 001 판정 12 — 동음이의 판정은 D-6 |
| 현재 / 직전 | CUR / PREV | current / previous | 기간 증감 비교 구간 | 001 판정 12 |

### 2-3. 신규 등재안 (이번 잡) — r3 마스터 약어 규칙 : 자음 위주 2~3자, 현장 최빈형

> r3(2026-10-10 마스터 지시) : 신규 단어 21개 전부 다시 검토했다. 기존 등재·grandfathered·001 사용 단어(§2-1·§2-2)는 유지한다. 이동 = MV, 주문 = ORD 는 마스터가 직접 정했다. 주문 ORD 와 순서 도메인 `ord` 의 동음이의는 **순서 도메인 `ord` 신규 사용 금지 → `seq` 통합**으로 해소한다(§3, 기존 `sort_ord` 등은 grandfathered).

| # | 한글명 | 약어(r3) | r2 약어 | 영문 | 의미 | 사용 용어(예) | 근거 | 동의어·충돌 점검(§2-0 검색 결과) |
|---|---|---|---|---|---|---|---|---|
| W01 | 이동 | **MV** | MOVE | move | 사용자 클릭에 의한 외부 사이트 이동(A-6). 이동 주소는 등록자가 입력하고 관리자가 심사한다(마스터 확정 REQ-36) | `site_mv_url` | REQ-36·37 | 마스터 지정. LINK 는 cafe "계정 연동"과 동음이의라 불가, CONN 은 MV 와 이음동의라 등재 안 함. 주의 : PostgreSQL 관례 `mv_`(materialized view 객체명)와 혼동하지 않도록 MV 는 컬럼 단어로만 쓰고 객체명 접두로 쓰지 않는다 |
| W02 | 확인(검증) | **VRF** | VRFY | verify | 도메인 소유 확인 | `vrf_yn`·`vrf_dtm`·`vrf_usr_id`·`vrf_dom_nm` | REQ-28·91 | 마스터 예시(VRFY→VRF). cafe 사용례 없음. CHK(점검)와 뜻이 다름 |
| W03 | 주문 | **ORD** | ORDR | order | 구매 주문 | `fee_ord`·`ord_id`·`ord_sts_cd`·`ord_pi_amt` | REQ-64 | 마스터 지정. cafe `ord_qty`(sql/063, "주문 수량") 사용례가 같은 뜻이다. 순서 도메인 `ord` 와의 동음이의는 `ord` 도메인 신규 금지로 해소(§3) |
| W04 | 상위 | **UPR** | PRNT | upper/parent | 연장·구독 갱신 체인의 직전 주문 | `upr_ord_id` | REQ-57·60 | PRT 는 print·part 와 혼동돼 불가. UPR 은 공공 DA 의 "상위" 관용형, cafe 사용례 없음 |
| W05 | 최초 | **FST** | ROOT | first | 체인의 최초 주문(가격 잠금 기준) | `fst_ord_id` | REQ-60 | **조건부** — 반정규화를 택할 때만. RT 는 rate·route 와 혼동돼 불가. cafe 사용례 없음 |
| W06 | 확보 | **HLD** | HOLD | hold | 결제 대기 중 재고 임시 확보(HELD) | `hld_expr_dtm` | REQ-54 | cafe 사용례 없음. RSV(예약)와 뜻이 다름 |
| W07 | 영구 | **LFT** | LFTM | lifetime | 기간 없는 상품(영구 멤버십) | `lft_yn` | REQ-53·58 | PERM 은 permission 과 혼동. cafe 사용례 없음. 사용자 표시 "평생"은 금지 어휘지만 약어와는 무관 |
| W08 | 해지(취소) | **CNL** | CNCL | cancel | 구독 갱신 안 함 표시 / 결제 취소 | `subscr_cnl_yn` | REQ-60·65 | cafe 사용례 없음. 코드값 CANCELED 와 같은 단어 |
| W09 | 회수 | RVK | (유지) | revoke | 슬롯·주문 강제 종료 | `rvk_rsn_cd`·`rvk_dtm` | REQ-65·68 | 이미 자음 3자. 충돌 없음 |
| W10 | 적용 | **APL** | APLY | apply | 단가·프로모 적용 | `apl_bgn_dtm`·`promo_apl_yn` | REQ-53·61 | cafe 사용례 없음(`apply_` 원형만) |
| W11 | 시작 | BGN | (유지) | begin | 기간 시작 | `use_bgn_dtm`·`apl_bgn_dtm`·`promo_bgn_dtm`·`snc_bgn_dtm` | REQ-53·64 | 이미 자음 3자. cafe START(5자) 사용례와의 관계는 D-7(판정 완료) |
| W12 | 일 | DAY | (유지) | day | 일수 단위(1개월 = 30일) | `use_day_cnt` | REQ-53·58 | **3자 현장 최빈형이라 유지**. DY·DD 는 현장에서 드물고 DD 는 날짜 포맷과 혼동된다. 도메인은 cnt(D3) |
| W13 | 정가 | **NRM** | LIST | normal price | 할인·프로모 적용 전 정상가(정가) | `nrm_pi_amt` | REQ-53·63 | ⚠ LST 는 cafe `lst_read_msg_id` 에서 "last(최종)" 뜻으로 쓰여 동음이의 → 불가. NRM(정상가)은 cafe 사용례 없음. 판매가는 `pi_amt` |
| W14 | 할인 | DC | (유지) | discount | 멤버십 할인 금액 | `dc_pi_amt` | REQ-63 | **조건부**. 2자 현장 최빈형 |
| W15 | 재고 | STK | (유지) | stock | 동시 노출 슬롯 수 | `stk_cnt`·`stk_scp_cd` | REQ-54 | 이미 자음 3자. STKR(스티커)과 다른 단어 |
| W16 | 범위 | SCP | (유지) | scope | 재고 산정 범위 | `stk_scp_cd` | REQ-54 | 이미 자음 3자 |
| W17 | 묶음 | **BND** | BNDL | bundle | 묶음 상품(PREMIUM30) | `fee_plan_bnd`·`bnd_plan_cd` | REQ-56 | cafe 사용례 없음. PKG 는 앱 패키지 뜻이라 피함 |
| W18 | 파이 | PI | (유지) | Pi | Pi Network 통화 — 금액 용어의 수식어(판정 완료 D1) | `pi_amt`·`ord_pi_amt`·`nrm_pi_amt` | REQ-06 | 고유명 2자 |
| W19 | 그룹 | GRP | (유지) | group | 상품군 | `fee_grp_cd` | REQ-53·55 | **조건부**. 이미 자음 3자 |
| W20 | 반짝임 | **SPK** | SPRK | sparkle | 부가서비스 "반짝임" | `spk_yn`(site_mst 반정규화 시) | REQ-55 | **조건부**. cafe 사용례 없음 |
| W21 | 유입 | **IFL** | INFL | inflow | STATS 유입 경로 | `ifl_src_cd`(가칭) | REQ-81 | **보류**("유입" 정의 [TBD : 마스터]). INF 는 info·infinity('infinity' 금지값)와 혼동돼 불가 |
| W22 | 제재 | **SNC** | SANC | sanction | 관리자의 계정 제재(혜택 정지) — 마스터 확정 REQ-14 | `usr_snc`·`snc_id`·`snc_tp_cd`·`snc_sts_cd`·`snc_rsn_cd`·`snc_bgn_dtm`·`snc_end_dtm` | REQ-14 | cafe 사용례 없음. SUSP 는 코드값 SUSPENDED 와 혼동, BLCK 는 baseline ADMIN_BLCK 뜻이라 제외(r2 판단 유지) |
| W23 | 해제 | **REL** | RLSE | release | 제재의 실제 해제(예정 종료와 별도) | `rel_dtm` | REQ-14 | ⚠ RLS 는 이 프로젝트에서 Row Level Security(정본 §7 정책 명명)라 불가. REL 은 cafe 사용례 없음. `snc_end_dtm` = 예정 종료, `rel_dtm` = 실제 해제 |

**등재하지 않는 단어 (요청 목록 중)**

| 후보 | 판정 | 사유 |
|---|---|---|
| 부가서비스(ADON) | 등재 안 함 | 부가서비스는 `fee_tp_cd` 코드값 묶음(상품 코드화, REQ-55)이고 컬럼명에 들어갈 자리가 없다. 상품군이 필요하면 W19 `fee_grp_cd` 의 코드값 `ADDON` 으로 표현한다(코드값은 단어 등재 대상이 아님) |
| 로고(LOGO) | 등재 안 함 | 마스터 결정 #5 "로고(site_img_url)" — 기존 `site_img_url` 재사용 |
| 회사명 | 등재 안 함 | **마스터 확정 REQ-35 : 회사명 = `site_nm`, 별도 속성 없음** |
| 레벨(LVL) | 등재 안 함 | 파생값, 저장 금지(REQ-42) |
| 광고(AD) | 등재 안 함 | 파생 판정(REQ-50). 2자 `AD` 는 사용례와도 혼동 |
| 연결(CONN·LINK) | 등재 안 함 | W01 동의어 점검 — MV 로 통일 |
| 정지(SUSP) | 등재 안 함 | W22 동의어 점검 — 코드값 `SUSPEND`/`SUSPENDED` 로만 표현 |
| 노출(DSPL) | 보류 | 비노출(REQ-39)을 계산으로 처리하면 불필요. 저장을 택하면 DSPL(display)로 등재 |
| 소유확인 토큰(TKN) | **사용 금지** | 토큰은 저장하지 않는다(REQ-27). "토큰"은 금지 어휘 스캔에 걸린다. 컬럼이 필요하면 `vrf_key` |
| 종류(KND) | **사용 중지** | §2-1 주석 — TP 와 이음동의 |

---

## 3. 표준도메인 (이번 잡 Type·Length 한정) — 신규 도메인 없음

| 도메인 | 타입·길이 (sitemap 한정) | 제약 규칙 | 용례 |
|---|---|---|---|
| `id` | PK·FK `UUID`(DEFAULT `gen_random_uuid()`) / 시스템·감사 행위자 `TEXT` | FK 는 NO ACTION(ON DELETE 미지정) | `site_id`·`ord_id`·`snc_id`·`regr_id`·`chgr_id` |
| `cd` | `VARCHAR(20)`(기본) / `plan_cd VARCHAR(10)`(001 선례) / `fee_plan_cd VARCHAR(30)` [TBD : 코드 체계 확정 후] | UPPER_SNAKE ASCII, CHECK IN 목록 | `site_sts_cd`·`fee_tp_cd` |
| `yn` | `CHAR(1) NOT NULL DEFAULT 'N'` | `CHECK (x IN ('Y','N'))` — BOOLEAN·TEXT 금지 | `own_site_yn`·`lft_yn` |
| `dtm` | `TIMESTAMPTZ`(UTC) | 영구·무기한은 **NULL**. `'infinity'` 금지(PRD §7) | `use_end_dtm`·`snc_end_dtm` |
| `dt` | `DATE`(UTC 일자) | — | `stat_dt` |
| `nm` | `VARCHAR(n)` : `site_nm` 100 · `site_dom_nm` 253(001) · `vrf_dom_nm` 253 · `cfg_tbl_nm` 63(PG 식별자 한도) | — | — |
| `cnt` | `INT`(집계 RPC 반환은 `BIGINT`) | `CHECK (x >= 0)`, 일수는 `> 0`. **일수·수량은 이 도메인으로 끝낸다(D3)** | `view_cnt`·`stk_cnt`·`use_day_cnt` |
| `amt` | **`NUMERIC(18,7)` — 판정 완료(D1)**. 용어는 `*_pi_amt` | `CHECK (x >= 0)` | `pi_amt`·`ord_pi_amt`·`nrm_pi_amt` |
| `url` | `TEXT` | `CHECK (x ~ '^https://' AND char_length(x) <= 1000)` — 1000 = 앱 `imgUrl` 상한(site.ts:122). 이동 URL 도 같은 값을 쓴다. 등록자 입력값이라 심사 대상이고 URL 검증(KISA)도 필요(REQ-36) | `site_img_url`·`site_mv_url`·`img_url` |
| `desc` | `TEXT` | `char_length <= 2000`(001) | `site_desc`·`fee_plan_desc` |
| `cont` | `TEXT` | 길이 CHECK : 신고 1000(001) · 반려·처리·변경·제재 사유 500(앱 LIMITS.rsnCont) | `rjct_rsn_cont`·`snc_rsn_cont` |
| `txt` | `TEXT` | 연락처 200(앱 LIMITS.cntcMax) — DB CHECK 추가 여부는 모델러 판단 | `pvt_cntc_txt` |
| `key` | `VARCHAR(50)` | 설정 키는 UPPER_SNAKE. **CHAR(n) 금지 — CHAR 는 `_yn` 전용**(협상 불가 원칙). 싱글톤 1행 강제는 키 컬럼 없이 상수 식 부분 UNIQUE 인덱스(`ux_promo_fee_cfg_sngl ON promo_fee_cfg ((1)) WHERE del_yn='N'`) | `sys_cfg.cfg_key` |

**싱글톤 1행 강제 규칙 (P1-3)** : 싱글톤 테이블(`promo_fee_cfg` 등)은 키 컬럼(cafe `singleton_key CHAR(1)='X'` 방식)을 두지 않는다. 대신 **상수 식 부분 UNIQUE 인덱스**로 활성 행 1개를 강제한다 — `CREATE UNIQUE INDEX ux_promo_fee_cfg_sngl ON promo_fee_cfg ((1)) WHERE del_yn = 'N';`. 인덱스명 토큰 `sngl` 은 컬럼이 아니라 인덱스 명칭 표기라 단어 등재 대상이 아니다(정본 §5 의 `ux_<tbl>_<의미>_actv` 선례와 같은 처리).
| `val` | `JSONB` | 설정값·변경 전후 스냅샷 | `cfg_val`·`old_val` |
| `ord` | — | **r3 신규 사용 금지**(주문 ORD 와 동음이의, 마스터 지시). 기존 사용분(cafe `sort_ord`·`img_ord` 등)만 grandfathered. Hook 은 `_ord` 종결을 여전히 통과시키므로 명명 검증·품질 게이트에서 수동 차단 | (신규 없음) |
| `seq` | `INT`(행 수가 2억을 넘을 수 있는 이력은 `BIGINT`) | 순서·순번 통합 도메인(r3) | `sort_seq`·`img_seq` |
| `pct` | `NUMERIC(5,2)` | 할인율을 컬럼으로 둘 때만 — 1차 권고는 `sys_cfg` 값 | (조건부) |

**Pi 금액 정밀도 — `NUMERIC(18,7)` (판정 완료 D1)**
- 1 Pi = 10,000,000 units(10⁷)이므로 소수 7자리면 최소 단위까지 정확하다.
- 정수부 11자리(최대 99,999,999,999 Pi)로, sitemap 단가 최대 270 Pi(PRD §3-1)에 충분하다. cafe `pi_amt NUMERIC(18,7)` 과 같아 `@pi/payments` 공용에서 형 변환이 없다.
- BIGINT units 저장은 하지 않는다(REQ-06 Pi 직접 표기 — units 변환은 PiRC2 경계 `toUnits` 에서만). FLOAT·REAL 은 금지한다.

**UUID** : 모든 신규 PK 는 UUID 다. `pymnt_id` 타입은 `pi_pymnt`(010) PK 확정을 따른다 — [TBD](REQ-69).

---

## 4. 표준용어 (테이블·컬럼 후보 명칭)

As-Is 001·baseline 컬럼은 그대로 둔다(재명명 금지). 아래는 신규 후보다. 엔터티 채택과 구조는 **모델러가 판단**하고, 표준담당은 이름을 확정한다.

### 4-1. 테이블

| 물리명 | 논리명 | 접두사 | 단어 | Phase | 비고 |
|---|---|---|---|---|---|
| `site_sts_hist` | 사이트상태이력 | site_ | SITE·STS·HIST | 1 | append-only(REQ-80, 001 판정 11 예고명) |
| `usr_snc` | 사용자제재 | usr_ | USR·SNC | 2 | 계정 제재(REQ-14, 마스터 확정 : sitemap 측 별도 엔터티, sys_user 확장 금지). 행이 해제·취소로 갱신되므로 `_hist` 가 아니라 일반 테이블(mod_dtm 트리거 대상) |
| `site_img` | 사이트이미지 | site_ | SITE·IMG | 2 | 다건 이미지(REQ-39) |
| `fee_plan` | 요금상품 | fee_ | FEE·PLAN | 2 | 단가 단일 출처(REQ-53) |
| `fee_plan_bnd` | 요금상품묶음 | fee_ | FEE·PLAN·BND | 2 | 단어 3개(상한) |
| `fee_ord` | 요금주문 | fee_ | FEE·ORD | 2 | 전 구매 주문(REQ-64) |
| `fee_ord_hist` | 요금주문이력 | fee_ | FEE·ORD·HIST | 2 | append-only, 채택은 모델러 판단 |
| `promo_fee_cfg` | 프로모션요금설정 | promo_ | (PROMO)·FEE·CFG | 2 | PRD 가칭 `promo_fee_config` 교정(D-5) |
| `sys_cfg` | 운영설정 | sys_ | SYS·CFG | 2 | 키-값 운영 설정(REQ-59). 신규 접두사 대신 sys_ 재사용 |
| `sys_cfg_chg_hist` | 설정변경이력 | sys_ | CFG·CHG·HIST | 2 | cafe sql/176 구조 승계 |
| `site_rvw` | 사이트리뷰 | site_ | SITE·RVW | 3 | 범위 밖. RVW 는 Phase 3 에 등재 |

### 4-2. 컬럼 — Phase 1 델타

| 테이블 | 물리명 | 논리명 | 도메인·타입 | REQ |
|---|---|---|---|---|
| site_mst | `site_mv_url` | 사이트이동URL — 등록자 입력·심사 대상(공개 응답 포함, 변경 시 재심사 대상 여부는 모델러가 001 판정의 "APPROVED 내용 변경 → PENDING" 규칙에 맞춤) | url / TEXT(https, ≤1000) | 36 |
| site_mst (또는 이력) | `vrf_yn` | 확인여부(도메인 소유) | yn | 28 |
| 〃 | `vrf_dtm` | 확인일시 | dtm | 28 |
| 〃 | `vrf_usr_id` | 확인사용자ID → sys_user.id | id / UUID | 28 |
| 〃 | `vrf_dom_nm` | 확인도메인명(확인 시점 스냅샷) | nm / VARCHAR(253) | 28 |
| site_sts_hist | `hist_id` | 이력ID(PK) | id / UUID | 80 |
| 〃 | `site_id` | 사이트ID → site_mst | id / UUID | 80 |
| 〃 | `old_sts_cd` / `new_sts_cd` | 이전상태코드 / 이후상태코드 | cd / VARCHAR(20) | 80 |
| 〃 | `chg_rsn_cd` | 변경사유코드 | cd | 26·80 |
| 〃 | `chg_rsn_cont` | 변경사유내용 | cont / TEXT(≤500) | 80 |
| 〃 | `site_dom_nm` | 사이트도메인명(스냅샷 — OWNERSHIP 반려 근거) | nm | 26 |
| 〃 | `chgr_id` / `chg_dtm` | 변경자ID / 변경일시(업무 감사) | id TEXT / dtm | 80 |

### 4-3. 컬럼 — Phase 2

| 테이블 | 물리명 | 논리명 | 도메인·타입 | PRD 가칭 → 교정 |
|---|---|---|---|---|
| usr_snc | `snc_id` | 제재ID(PK) | id / UUID | 신규 |
| 〃 | `tgt_usr_id` | 대상사용자ID → sys_user.id | id / UUID | 신규(TGT 등재어) |
| 〃 | `snc_tp_cd` | 제재유형코드 | cd | 신규 |
| 〃 | `snc_sts_cd` | 제재상태코드 | cd | 신규 |
| 〃 | `snc_rsn_cd` / `snc_rsn_cont` | 제재사유코드 / 제재사유내용 | cd / cont(≤500) | 신규 |
| 〃 | `snc_bgn_dtm` / `snc_end_dtm` | 제재시작일시 / 제재종료일시(예정, NULL = 무기한) | dtm | 신규 |
| 〃 | `rel_dtm` | 해제일시(실제 해제·취소 시각) | dtm | 신규 — 보상 연장 일수 = 제재 기간 계산 근거(REQ-14·68) |
| 〃 | `prcs_usr_id` | 처리사용자ID(제재를 건 관리자) → sys_user.id | id / UUID | 신규 — `<역할>_usr_id`(PRCS 처리, 001 등재 대기어). 해제·취소 처리자는 `modr_id` + `site_sts_hist` 와 같은 감사 이력으로 남긴다(모델러 판단) |
| fee_plan | `fee_plan_id` | 요금상품ID(PK) | id / UUID | — |
| 〃 | `fee_plan_cd` | 요금상품코드(UNIQUE, 자연키) | cd | — |
| 〃 | `fee_tp_cd` | 요금유형코드 | cd | `fee_knd_cd` → KND 이음동의 교정 |
| 〃 | `fee_grp_cd` | 요금그룹코드(조건부) | cd | 신규 |
| 〃 | `use_day_cnt` | 사용일건수(영구 NULL) | cnt / INT | `use_days` → 교정(D3) |
| 〃 | `lft_yn` | 영구여부 | yn | — |
| 〃 | `subscr_yn` | 구독여부 | yn | — |
| 〃 | `pi_amt` | Pi금액(판매가) | amt / NUMERIC(18,7) | `amt_pi` → 교정(D1) |
| 〃 | `nrm_pi_amt` | 정가Pi금액 | amt | `list_amt_pi` → 교정(D1) |
| 〃 | `stk_cnt` | 재고건수(동시 노출 수, NULL = 무제한) | cnt | `stock_qty` → 교정(D3) |
| 〃 | `stk_scp_cd` | 재고범위코드 | cd | `stock_scope_cd` → 5자 단어 교정 |
| 〃 | `promo_apl_yn` | 프로모션적용여부 | yn | — (PROMO D-5) |
| 〃 | `apl_bgn_dtm` / `apl_end_dtm` | 적용시작일시 / 적용종료일시 | dtm | — (BGN D-7) |
| 〃 | `use_yn` · `sort_seq` · `fee_plan_desc` | 사용여부 · 정렬순번 · 요금상품설명 | yn · seq · desc | r3 : `sort_ord`(D3 통과분) → `sort_seq`(ord 도메인 신규 금지). SORT 는 §8 등재 |
| fee_plan_bnd | `bnd_plan_cd` / `item_plan_cd` | 묶음상품코드 / 항목상품코드 → fee_plan.fee_plan_cd | cd | — |
| fee_ord | `ord_id` | 주문ID(PK) | id / UUID | — |
| 〃 | `ord_usr_id` | 주문사용자ID → sys_user.id | id / UUID | `usr_id` → 역할 접두(§3-3) |
| 〃 | `site_id` | 사이트ID(멤버십 NULL) | id / UUID | — |
| 〃 | `fee_plan_cd` | 요금상품코드 → fee_plan | cd | — |
| 〃 | `site_ctgr_cd` | 사이트카테고리코드(주문 시점 스냅샷) | cd | — |
| 〃 | `ord_pi_amt` | 주문Pi금액(실결제 스냅샷, NOT NULL) | amt | `ordr_amt_pi` → 교정(D1) |
| 〃 | `nrm_pi_amt` / `dc_pi_amt` | 정가Pi금액 / 할인Pi금액(조건부) | amt | 신규(REQ-63) |
| 〃 | `promo_apl_yn` | 프로모션적용여부(스냅샷) | yn | — |
| 〃 | `pymnt_id` | 결제ID → pi_pymnt | id / [TBD 010] | — |
| 〃 | `ord_sts_cd` | 주문상태코드 | cd | `ordr_st_cd` → 교정(001 판정 2) |
| 〃 | `ord_tp_cd` | 주문유형코드 | cd | 신규(REQ-68 보상 식별) |
| 〃 | `use_bgn_dtm` / `use_end_dtm` | 사용시작일시 / 사용종료일시(영구 NULL) | dtm | — |
| 〃 | `hld_expr_dtm` | 확보만료일시(HELD 15분) | dtm | — |
| 〃 | `upr_ord_id` / `fst_ord_id` | 상위주문ID / 최초주문ID(조건부) → fee_ord 자기참조 | id / UUID | — |
| 〃 | `subscr_cnl_yn` | 구독해지여부 | yn | — |
| 〃 | `rvk_rsn_cd` / `rvk_dtm` | 회수사유코드 / 회수일시 | cd / dtm | `rvk_dtm` 신규 |
| 〃 | `snc_id` | 제재ID → usr_snc(SUSPENDED 주문의 원인 제재, 조건부) | id / UUID | 신규 — 채택은 모델러 판단 |
| promo_fee_cfg | `promo_fee_id` | 프로모션요금ID(PK) | id / UUID | — |
| 〃 | (컬럼 없음) | 싱글톤 1행 강제 = `ux_promo_fee_cfg_sngl ON promo_fee_cfg ((1)) WHERE del_yn='N'`(§3 규칙) | — | cafe `singleton_key CHAR(1)` → **삭제**(CHAR(n) 금지, `sys_cfg.cfg_key` 와 같은 이름 다른 뜻 — P1-3) |
| 〃 | `promo_actv_yn` | 프로모션활성여부 | yn | cafe `promo_active_yn` → ACTV |
| 〃 | `promo_bgn_dtm` / `promo_end_dtm` | 프로모션시작일시 / 프로모션종료일시 | dtm | cafe `promo_start_dtm` → BGN |
| 〃 | `chg_rsn_cont` | 변경사유내용 | cont | cafe `reason_memo` → 교정 |
| sys_cfg | `cfg_key` / `cfg_val` / `cfg_desc` / `use_yn` | 설정키(PK 또는 UNIQUE) / 설정값 / 설정설명 / 사용여부 | key VARCHAR(50) / val JSONB / desc / yn | 신규 |
| sys_cfg_chg_hist | `hist_id`·`cfg_tbl_nm`·`cfg_tgt_id`·`chg_actn_cd`·`old_val`·`new_val`·`chg_rsn_cont`·`chgr_id`·`chg_dtm` | sql/176 과 같음 | — | 승계 |
| site_img | `img_id` / `site_id` / `img_url` / `img_seq` | 이미지ID / 사이트ID / 이미지URL / 이미지순번(1 = 대표 = 로고) | id / id / url / seq | 신규 |

**`sys_cfg` 키(코드값, `cfg_key`)** : `EXTEND_BGN_DAY`(7) · `EXTEND_MAX_DAY`(90) · `EXTEND_COOL_DAY`(7) · `GRACE_DAY`(7) · `NTCE_DAY_LIST`([7,3,1]) · `MBR_DC_PCT`(10) · `MBR_DC_MIN_PI`(1) — 값은 PRD §7 제안값, [확인중 : 마스터]. 키는 코드값이라 단어 등재 대상이 아니다.

---

## 5. 공통코드 그룹 후보·코드값

001 판정 3 을 따라 **CHECK 도메인**으로 둔다(코드 테이블 없음, 표시명은 번역키). 코드 테이블 전환 기준 : 하위 계층이 생기거나, 운영 중 코드값을 데이터로만 추가해야 할 때.

| 코드 그룹(컬럼) | 코드값 | 상태 | 근거 |
|---|---|---|---|
| `site_ctgr_cd` | COMMUNITY·EDU·SHOP·CONTENT·PERSONAL·EVENT·GAME·TOOL·ETC | 기존 | REQ-21 |
| `site_sts_cd` | DRAFT·PENDING·APPROVED·REJECTED·SUSPENDED·WITHDRAWN | 기존 | REQ-22 |
| `rjct_rsn_cd` | GAMBLING·NON_PI_PYMNT·GIFT_CARD·INVEST·ADULT·PII_COLLECT·PI_BRAND·OWNERSHIP·ETC | 기존 | REQ-23 |
| `rpt_rsn_cd` | 금지 7종 + FRAUD·BROKEN·ETC | 기존([확인중 : legal-compliance-advisor]) | REQ-75 |
| `rpt_sts_cd` | RECEIVED·ACCEPTED·DISMISSED | 기존 | REQ-76 |
| `plan_cd` | VIP·PRM2·PRM1·BSC2·BSC1·NONE — 정렬 순서 = 나열 순서, **레벨 = VIP LV5·PRM2 LV4·PRM1 LV3·BSC2 LV2·BSC1 LV1·NONE 없음(파생, 저장 금지)**. 배지 VIP·P2·P1·B2·B1. 면적 가중치 21.16·9.27·6.76·4.15·2.43·0.7(마스터 결정 #1, 화면 상수) | 기존(+레벨·가중치 규칙) | REQ-40~43 |
| `p_cnt_tp_cd`(RPC 인자) | VIEW·CLCK | 기존 | REQ-78 |
| `chg_rsn_cd`(site_sts_hist) | `rjct_rsn_cd` 9종 + 정지·복구·철회 사유 [TBD — 모델러 제안, 예 RPT_ACCEPT·ADMIN_SUSPEND·ADMIN_RESTORE·USER_WITHDRAW] | 신규 | REQ-80 |
| `fee_tp_cd` | REGISTER(무료, 판매 행 여부는 모델러)·CTGR_SLOT·HOME_SLOT·EXTEND·STATS·PREMIUM30·MEMBERSHIP·**SPARKLE** | 신규 | REQ-53·55 |
| ↳ SPARKLE 구매 자격 | **마스터 확정 REQ-55 : 유료 요금제 사이트만** — `site_mst.plan_cd <> 'NONE'` AND `own_site_yn = 'N'`(자사 구매 금지, REQ-44) AND `site_sts_cd = 'APPROVED'` AND `del_yn = 'N'`. 가격·기간·재고는 [확인중 : 마스터]. 강제 수단(주문 생성 검증 / DB 제약)은 모델러 판단 | 신규 규칙 | REQ-55 |
| `fee_grp_cd`(조건부) | BASIC·ADDON·PREMIUM·MEMBERSHIP — PRD §3 표의 "구분" 열. 부가서비스(슬롯·EXTEND·STATS·SPARKLE) = ADDON | 신규(조건부) | REQ-53·55 |
| `stk_scp_cd` | PER_CTGR·GLOBAL (NULL = 비배타, 재고 무제한) | 신규 | REQ-54 |
| `ord_sts_cd` | HELD·ACTIVE·EXPIRED·CANCELED·SUSPENDED·REVOKED | 신규 | REQ-65 |
| `ord_tp_cd` | NEW·RENEW·EXTEND·CMPN(보상 연장) [TBD — 모델러 확정] | 신규 | REQ-57·60·68 |
| `rvk_rsn_cd` | SITE_SUSPENDED·SITE_WITHDRAWN·LFTM_UPGRADE (LFTM_UPGRADE 만 PRD 확정, 나머지 2개는 [TBD] 제안명) | 신규 | REQ-65·68 |
| `snc_tp_cd` | SUSPEND(멤버십 혜택 정지) — 1차는 이 값 하나. 경고 등 추가 유형은 [TBD] | 신규 | REQ-14 |
| `snc_sts_cd` | ACTIVE(제재 중)·RELEASED(정상 해제·기간 만료)·CANCELED(관리자 오인 취소 → 0 Pi 보상 연장 대상, PRD §3-1) | 신규 | REQ-14·68 |
| `snc_rsn_cd` | [TBD : legal-compliance-advisor] — 제안 : `rpt_rsn_cd` 10종 재사용 + ADMIN_ETC | 신규(TBD) | REQ-14 |
| `chg_actn_cd`(sys_cfg_chg_hist) | INSERT·UPDATE·TOGGLE·ROLLBACK·DELETE (cafe 의 SWITCH 는 fee_mode 전용이라 제외) | 승계 | sql/176 |
| Pi 결제 `metadata.type` | `SITE_MBR`(확정) / 슬롯·STATS·PREMIUM30·EXTEND·SPARKLE 는 [TBD] — 제안 패턴 `SITE_<요약>`(예 SITE_SLOT·SITE_STATS·SITE_PRM·SITE_SPRK). DB 컬럼은 `pi_pymnt`(공용 010) 소관 | 신규(TBD) | REQ-70 |

코드값 규칙 : ASCII 대문자·숫자·`_` 만 쓴다. ™·é 같은 특수문자와 소문자는 금지한다(PyCafé™ 표기 규칙의 "DB 코드값 원형 유지").

---

## 6. 금지 어휘·금지 패턴

| 구분 | 금지 | 대체 | 근거 |
|---|---|---|---|
| 통화 어휘 | `BEAN`·`TOKEN`·`TKN`·`COIN` — 테이블·컬럼명, 코드값, COMMENT, 함수·인자명, 시드 주석 전부 | Pi 직접 표기(`*_pi_amt`) / 소유확인 키는 `vrf_key` | sitemap CLAUDE.md 승계 철칙, MAINNET 체크리스트 A-5, REQ-06 |
| 금액 용어 순서 | `amt_pi`·`ordr_amt_pi`·`list_amt_pi`, 도메인 `pi` 종결(`*_pi`) | `pi_amt`·`ord_pi_amt`·`nrm_pi_amt` | 정본 §1-3 예시, 판정 완료 D1 |
| 상태 약어 | `*_st_cd` | `*_sts_cd` | 001 판정 2 |
| 도메인 미종결 | `use_days`·`stock_qty`·`singleton_key`·`reason_memo`·`active_mode`·`*_at`, 신규 도메인 `days`·`qty` | §4-3 교정명 / `*_cnt` | 정본 §1-3, Hook R7, 판정 완료 D3 |
| 비등재·장음 단어 | `order`·`ordr`·`config`·`start`·`verify`·`vrfy`·`stock`·`scope`·`active`·`memo`·`domain`·`price`·`move` | ORD·CFG·BGN·VRF·STK·SCP·ACTV·CONT·DOM·(판매가 `pi_amt`) | 정본 §1-1(2~4자) |
| 이음동의어 | `knd`(TP 와 중복), `conn`·`link`(MV 와 중복), `susp`(코드값과 혼동), `prc`(AMT 와 중복) | TP / MV / SNC + 코드값 SUSPEND / AMT | §2-0 검색 결과 |
| 동음이의 | `link` = 이동 주소, `own` = "소유", 신규 `*_ord` 순서 컬럼(주문 ORD 와 충돌), `lst`(cafe = last), `rls`(= Row Level Security) | MV / OWNR / `*_seq` / NRM / REL | §2-3 W01, §2-2 |
| 시스템 컬럼 | `created_at`·`updated_at`·`create_dt`·`update_dt` | 시스템 컬럼 4종 | 정본 §3-1 |
| 영구 표현 | `'infinity'` 타임스탬프 | NULL | PRD §7 |
| 결제 type | `CHAT_SUBSCR` 재사용 | `SITE_MBR` | PRD §3-2 |
| 권한값 | `role='MASTER'` 행·비교 | ADMIN(최상위) | baseline 판정·루트 CLAUDE.md |
| 고정길이 문자 | `CHAR(n)` — `_yn` 외 전부(싱글톤 키 `CHAR(1)='X'` 포함) | `VARCHAR(n)`·`TEXT` / 싱글톤은 상수 식 부분 UNIQUE 인덱스 | 협상 불가 원칙, P1-3 |
| 공용 테이블 변경 | `sys_user` 에 제재·정지 컬럼 추가 | `usr_snc` | 마스터 확정 REQ-14, baseline 판정 3 |
| 사용자 표시 문구(COMMENT 포함 권고) | "평생"·"투자"·"상위 노출 보장" | "영구"·"추천 영역 노출" | PRD §3·§3-1 |
| 스키마 접두 | `public.`·`sitemap_dev.` 하드코딩 | search_path | REQ-02 |

---

## 7. 판정 현황

### 7-1. 판정 완료 (leader)

| # | 쟁점 | 판정 | 반영 위치 |
|---|---|---|---|
| D1 | 금액 용어 | `*_pi_amt` 확정, 도메인 amt, `NUMERIC(18,7)`, `pi` 는 수식어 단어. PRD 가칭은 정본보다 앞설 수 없음. 정가 단어는 표준담당이 확정 — r2 LIST → **r3 NRM**(마스터 약어 규칙 + LST 동음이의) | §1-2·§2-3 W13·W18·§3·§4-3 |
| D2 | `site_` 접두사 | 001 DA-APPROVED 로 유효. DDL 초안 상단에 001 승인 승계 주석. 정본·Hook 반영은 정본 개정 제안(P-1). 신규 접두사는 기존 재사용을 먼저 검토 → 이번 잡 신규 접두사 0건(운영 설정 = sys_, 계정 제재 = usr_) | §1-1·§7-3 |
| D3 | `days`·`qty` | 신규 도메인 등재 반려(cnt 이음동의) → `use_day_cnt`·`stk_cnt`. `sort_ord` 통과(**r3 : 신규는 `sort_seq`** — ord 도메인 신규 금지), SORT 는 사전 미확인이라 §8 등재 | §1-2·§2-1·§4-3·§8 |

### 7-2. r1 [DA 판정 필요] D-1~D-9 — 전건 판정 완료(r1) (leader, 01_leader_standards-approval_r1 §3) — 잔여 [DA 판정 필요] 0건

| # | 쟁점 | 표준담당 권고 | leader 판정 |
|---|---|---|---|
| D-1 | `site_`·`rpt_` 접두사의 정본·Hook 미반영, `approval_` 역방향 드리프트 | 정본 §2-1 과 Hook 동시 반영 | **판정 완료(r1·D2)** — 001 승인 승계 주석으로 처리, 정본·Hook 반영은 P-1 로 마스터 상신 |
| D-2 | 표준사전 원장 위치 — sitemap 은 별도 DB이고 std_* 테이블이 없음 | cafe DB `std_dic`·`std_dom` 을 조직 단일 사전으로 유지하고 sitemap 단어도 같은 곳에 등재. §8 SQL 은 cafe DB 대상 초안 | **판정 완료(r1) — 수용 — 마스터 상신 항목** |
| D-3 | `fee_` 설명이 sitemap 사용(요금 상품·주문)보다 좁음 | 정본 설명 확대(P-3) | **판정 완료(r1) — 수용** |
| D-4 | 도메인 `pi` 와 §1-3 예시 `*_pi_amt` 중복 | `*_pi_amt` 로 통일 | **판정 완료(r1) — 수용**(D1 확정, 정본 모순은 P-2) |
| D-5 | 5자 단어 `PROMO` / PRD 가칭 `promo_fee_config` | PROMO grandfathered 인정(PYMNT·SUBSCR 와 같은 처리), 테이블명은 `promo_fee_cfg` | **판정 완료(r1) — 수용** |
| D-6 | `PLAN` 동음이의 — 노출 요금제 단계 vs 요금 상품 | 한 단어로 등재, 용어로 구분 : `plan_cd`(노출 요금제 단계) / `fee_plan_cd`(요금 상품 코드). 등재 설명에 두 용례 명기 | **판정 완료(r1) — 수용** |
| D-7 | 시작 단어 BGN(신규) vs cafe 사용례 START(5자) | BGN 신규 등재. START 가 운영 std_dic 에 이미 있으면 레거시로 남기고 신규는 BGN | **판정 완료(r1) — 수용** |
| D-8 | 요금제 화면 상수(면적 가중치·색·배지)를 DB 에 둘지 | 두지 않는다 | **판정 완료(r1) — 리더 확정 — DB 저장 안 함, `wgt` 도메인 등재 안 함** |
| D-9 | 001 등재 대기 단어의 실제 등재 여부 미확인 | §8 멱등 INSERT 로 포함 | **판정 완료(r1) — 수용** |

### 7-3. 정본 개정 제안 (이 잡 쓰기 범위 밖 — 최종 보고 때 마스터에게 상신)

| # | 대상 | 제안 | 사유 |
|---|---|---|---|
| P-1 | 정본 §2-1 표 + Hook `PREFIX_RE`(da-ddl-guard.mjs:114) | `site_`·`rpt_` 를 양쪽에 추가하고, Hook 에만 있는 `approval_` 를 정본 §2-1 에 소급 등재 | 001 DA-APPROVED 의 후속 조치 미이행. 반영 전까지 site_* DDL 은 매번 승인 주석이 필요. 정본과 Hook 은 한쪽만 갱신 금지 |
| P-2 | 정본 §1-2 도메인 `pi` | 용도를 "레거시 전용(신규 사용 금지)"으로 명확히 하거나 폐지(폐지 시 Hook DOMAIN_SUFFIXES 동시 삭제) | §1-3 예시 `tip_pi_amt ✅` 와 같은 값을 두 방식으로 쓸 수 있는 정본 내부 모순(D1 이 §1-3 을 따름) |
| P-3 | 정본 §2-1 `fee_` 설명 | "요금 모드 설정" → "요금 설정·요금 상품·구매 주문" | sitemap `fee_plan`·`fee_ord` 사용 범위 반영 |
| P-4 | 정본 §9 약어 목록 | §8 로 등재되는 단어(SITE·OWNR·ORD·SNC 등 44개)를 §9 에 추가 | 문서와 std_dic 정합(sql/176 때와 같은 절차) |

---

## 8. 등재 SQL 초안 (cafe DB `std_dic` 대상, D-2 전제)

> ⛔ 초안이다. `sql/` 파일 생성·DB 적용은 하지 않는다(00_input §1). leader 승인과 마스터 승인 후 별도 턴에서 cafe `sql/NNN_std_sitemap_words.sql` 로 확정한다. 형식은 sql/176 과 같다.
> 조건부 단어(W05 FST · W14 DC · W19 GRP · W20 SPK · W21 IFL)는 제외했다. 모델러가 해당 컬럼을 채택하면 그때 추가한다. 신규 도메인은 없다.

```sql
-- 표준단어 — sitemap.pi 1차 모델 (사용례 확인분 10 + 001 등재 대기 16 + 신규 18 + #9 재점검 7 = 51, 멱등)
INSERT INTO public.std_dic (dic_id, dic_log_nm, dic_phy_nm, dic_phy_fll_nm, dic_desc, dic_gbn_cd, apv_status, regr_id)
SELECT gen_random_uuid(), v.log_nm, v.phy_nm, v.fll_nm, v.dsc, '0001', 'APPROVED', 'ADMIN'
FROM (VALUES
  -- 사용례만 확인된 기존 단어 (운영 std_dic 미확인 — 이미 있으면 건너뜀)
  ('신고',     'RPT',  'report',     '신고'),
  ('통계',     'STAT', 'statistics', '통계 집계'),
  ('요금',     'FEE',  'fee',        '요금'),
  ('사용',     'USE',  'use',        '사용'),
  ('정렬',     'SORT', 'sort',       '정렬 — 도메인 SEQ 와 결합(sort_seq). 기존 sort_ord 는 grandfathered'),
  ('종료',     'END',  'end',        '기간 종료'),
  ('만료',     'EXPR', 'expire',     '만료'),
  ('활성',     'ACTV', 'active',     '활성'),
  ('항목',     'ITEM', 'item',       '구성 항목'),
  ('이미지',   'IMG',  'image',      '이미지'),
  -- 001 판정 5·12 등재 대기분
  ('사이트',   'SITE', 'site',       '.pi 디렉터리 등재 단위 사이트'),
  ('소유자',   'OWNR', 'owner',      '사이트 등록·소유 사용자(복합어, REGR 계열)'),
  ('자사',     'OWN',  'own',        '운영사 소유(자사) — 소유자는 OWNR 사용'),
  ('반려',     'RJCT', 'reject',     '심사 반려'),
  ('신고자',   'RPTR', 'reporter',   '신고한 사용자(복합어)'),
  ('처리',     'PRCS', 'process',    '신고 등 업무 처리'),
  ('클릭',     'CLCK', 'click',      '외부 이동 확인 클릭'),
  ('연락처',   'CNTC', 'contact',    '연락 수단'),
  ('비공개',   'PVT',  'private',    '비공개 범위'),
  ('공개',     'PUB',  'public',     '공개 범위'),
  ('조회',     'VIEW', 'view',       '페이지 조회'),
  ('일별',     'DLY',  'daily',      '일 단위 집계'),
  ('마스터',   'MST',  'master',     '기준 정보 엔터티'),
  ('요금제',   'PLAN', 'plan',       '요금 체계상의 상품·단계 — plan_cd(노출 요금제 단계)·fee_plan_cd(요금 상품)'),
  ('현재',     'CUR',  'current',    '비교 기준 현재 구간'),
  ('직전',     'PREV', 'previous',   '비교 대상 직전 구간'),
  -- 이번 잡 신규
  ('이동',     'MV',   'move',       '사용자 클릭에 의한 외부 사이트 이동(자동 리다이렉트 아님) — 연결 주소 포함. 객체명 mv_(materialized view)와 별개'),
  ('확인',     'VRF',  'verify',     '소유 확인·검증'),
  ('주문',     'ORD',  'order',      '구매 주문 — 순서 도메인 ord 는 신규 사용 금지(seq 로 통합)'),
  ('상위',     'UPR',  'upper',      '체인상 직전(상위) 항목'),
  ('확보',     'HLD',  'hold',       '결제 대기 중 재고 임시 확보'),
  ('영구',     'LFT',  'lifetime',   '기간 없는 상품'),
  ('해지',     'CNL',  'cancel',     '해지·취소'),
  ('회수',     'RVK',  'revoke',     '권리·노출 강제 회수'),
  ('적용',     'APL',  'apply',      '단가·프로모션 적용'),
  ('시작',     'BGN',  'begin',      '기간 시작'),
  ('일',       'DAY',  'day',        '일수 단위 — 도메인 CNT 와 결합(use_day_cnt)'),
  ('정가',     'NRM',  'normal price', '할인 적용 전 정상가 — LST(cafe = last)와 별개'),
  ('재고',     'STK',  'stock',      '동시 노출 가능 수량 — STKR(스티커)와 별개'),
  ('범위',     'SCP',  'scope',      '산정 범위'),
  ('묶음',     'BND',  'bundle',     '묶음 상품'),
  ('파이',     'PI',   'Pi',         'Pi Network 통화 — 금액 수식어(*_pi_amt)'),
  ('제재',     'SNC',  'sanction',   '관리자의 계정 제재 — 정지는 유형 코드값 SUSPEND'),
  ('해제',     'REL',  'release',    '제재 등의 실제 해제 — RLS(Row Level Security)와 별개'),
  -- #9 재점검 sys_user 개명분 (10_leader_reinspection-decision §7, 마스터 확정)
  ('권한',     'ROLE', 'role',       '사용자 권한 등급 — role_cd(ADMIN·USER). 마스터 지정 4자 예외'),
  ('지갑',     'WLT',  'wallet',     'Pi 지갑 — pi_wlt_adr_txt'),
  ('주소',     'ADR',  'address',    '주소 문자열'),
  ('표시',     'DSP',  'display',    '화면 표시·노출 — dsp_nm'),
  ('최종',     'LST',  'last',       '마지막(최종) — lst_lgn_dtm. 정가(NRM)와 별개'),
  ('로그인',   'LGN',  'login',      '로그인'),
  ('재가입',   'RJN',  'rejoin',     '탈퇴 후 행 부활 — rjn_dtm')
) AS v(log_nm, phy_nm, fll_nm, dsc)
WHERE NOT EXISTS (
  SELECT 1 FROM public.std_dic d WHERE d.dic_phy_nm = v.phy_nm AND d.del_yn = 'N'
);
-- 검증 : SELECT count(*) FROM public.std_dic WHERE del_yn='N' AND dic_phy_nm IN (<위 VALUES 의 phy_nm 51개>);  -- 51
```

---

## 9. r3 변경표 (마스터 약어 규칙 변경 2026-10-10 — modeler 전달용)

| 구분 | r2 (폐기) | r3 (확정) |
|---|---|---|
| 단어 | MOVE · VRFY · ORDR · PRNT · ROOT · HOLD · LFTM · CNCL · APLY · LIST · BNDL · SPRK · INFL · SANC · RLSE | MV · VRF · ORD · UPR · FST · HLD · LFT · CNL · APL · **NRM** · BND · SPK · IFL · SNC · **REL** |
| 단어(유지) | RVK · BGN · DAY · DC · STK · SCP · PI · GRP — 이미 2~3자, DAY 는 현장 최빈형 | 같음 |
| 도메인 | `ord`(순서) | **신규 사용 금지 → `seq`**. 기존 `sort_ord` 등은 grandfathered |
| 테이블 | `fee_ordr` · `fee_ordr_hist` · `fee_plan_bndl` · `usr_sanc` | `fee_ord` · `fee_ord_hist` · `fee_plan_bnd` · `usr_snc` |
| site_mst | `site_move_url` · `vrfy_yn` · `vrfy_dtm` · `vrfy_usr_id` · `vrfy_dom_nm` | `site_mv_url` · `vrf_yn` · `vrf_dtm` · `vrf_usr_id` · `vrf_dom_nm` |
| fee_plan | `lftm_yn` · `list_pi_amt` · `promo_aply_yn` · `aply_bgn_dtm` · `aply_end_dtm` · `sort_ord` | `lft_yn` · `nrm_pi_amt` · `promo_apl_yn` · `apl_bgn_dtm` · `apl_end_dtm` · `sort_seq` |
| fee_plan_bnd | `bndl_plan_cd` | `bnd_plan_cd` |
| fee_ord | `ordr_id` · `ordr_usr_id` · `ordr_sts_cd` · `ordr_tp_cd` · `ordr_pi_amt` · `list_pi_amt` · `prnt_ordr_id` · `root_ordr_id` · `hold_expr_dtm` · `subscr_cncl_yn` | `ord_id` · `ord_usr_id` · `ord_sts_cd` · `ord_tp_cd` · `ord_pi_amt` · `nrm_pi_amt` · `upr_ord_id` · `fst_ord_id` · `hld_expr_dtm` · `subscr_cnl_yn` |
| usr_snc | `sanc_id` · `sanc_tp_cd` · `sanc_sts_cd` · `sanc_rsn_cd` · `sanc_rsn_cont` · `sanc_bgn_dtm` · `sanc_end_dtm` · `rlse_dtm` | `snc_id` · `snc_tp_cd` · `snc_sts_cd` · `snc_rsn_cd` · `snc_rsn_cont` · `snc_bgn_dtm` · `snc_end_dtm` · `rel_dtm` |
| site_img | `img_ord` | `img_seq` |
| 조건부 | `sprk_yn` · `infl_src_cd` · `vrfy_key` | `spk_yn` · `ifl_src_cd` · `vrf_key` |
| 변경 없음 | `tgt_usr_id` · `prcs_usr_id` · `stk_cnt` · `stk_scp_cd` · `use_day_cnt` · `rvk_rsn_cd` · `rvk_dtm` · `dc_pi_amt` · `fee_tp_cd` · `fee_grp_cd` · 코드값 전부(`LFTM_UPGRADE` 등 코드값은 단어가 아니라 유지) | — |

r1·r2 와 다르게 정한 2건(마스터 예시 규칙에서 기계적으로 줄이면 충돌) : 정가 LIST → LST 는 cafe `lst_read_msg_id`(last)와 동음이의라 **NRM**, 해제 RLSE → RLS 는 Row Level Security 와 동음이의라 **REL**.

**정본 개정 연계(P-5, main 개정 중)** : 정본 §1-1 약어 길이 "2~4자" → "자음 위주 2~3자, 현장 최빈형"(기존 등재·grandfathered 유지), §1-2 `ord` 도메인 "신규 사용 금지 → seq", §9 약어표 갱신. Hook `DOMAIN_SUFFIXES` 에서 `ord` 를 지우면 grandfathered 컬럼(cafe `sort_ord` 등)이 있는 기존 파일의 재검사가 깨지므로 Hook 은 유지하고, 신규 `_ord` 종결은 명명 검증과 품질 게이트에서 수동으로 차단할 것을 권고한다.

## 10. 02 DDL 명명 검증 반영 기록 (2026-10-10, modeler 판정 요청 8건 — 사전 추가분)

| # | 항목 | standards 판정 | 사전 반영 |
|---|---|---|---|
| V-1 | 함수명 `fn_sel_mbr_actv_yn` 의 MBR | **통과 — 등재 불필요.** 정본 §9 에 `member \| mbr` 가 이미 등재돼 있다. 멤버십(회원 자격)은 member 의 상태라 같은 단어로 본다. PRD metadata.type `SITE_MBR` 과도 일치 | §2-1 재사용 단어에 MBR(member·멤버십) 추가로 간주 |
| V-2 | PK `sys_cfg.cfg_id`·`fee_plan_bnd.bnd_id` | **통과** — 정본 §3-2 `<엔터티약어>_id`, CFG·BND 모두 등재어 | §4 용어에 추가 |
| V-3 | `fee_tp_cd` 에서 REGISTER·EXTEND 제외(M-6) | **통과**(명명 영향 없음). EXTEND 는 §5 `ord_tp_cd` 값(NEW·RENEW·EXTEND·CMPN)으로만 쓴다 | §5 `fee_tp_cd` = CTGR_SLOT·HOME_SLOT·STATS·PREMIUM30·MEMBERSHIP·SPARKLE |
| V-4 | 코드값 `chg_rsn_cd` RPT_ACCEPT, `rvk_rsn_cd` SITE_DELETED, `ord_tp_cd` CMPN | **통과** — UPPER_SNAKE ASCII, 금지 어휘 없음. 코드값은 단어 등재 대상이 아니다 | §5 제안값 확정 |
| V-5 | FK 제약명 예외(같은 부모 다중 FK·자연키 FK·자기참조 FK → `<자식>_<컬럼명>_fkey`) | **통과 — 확장 규칙으로 기록.** 정본 §5 의 `<자식>_<부모>_id_fkey` 로는 같은 부모를 참조하는 FK 2개를 구분할 수 없고, 자연키 FK(`fee_plan_cd`)와 자기참조 FK 에서는 이름이 오해를 부른다. 이 셋에 한해 PostgreSQL 기본 명명과 같은 `<자식>_<컬럼명>_fkey` 를 쓴다. 각 부모의 첫 FK(예 001 `site_mst_sys_user_id_fkey`)는 기본 규칙을 유지 | 정본 개정 제안 P-6 |
| V-6 | 함수 동사 vrf·rvk·chg·prcs | **통과** — 모두 등재어. 형식 `fn_<동사>_<대상>` 은 cafe `fn_log_cfg_change`·001 `fn_inc_stat_site_dly` 선례와 같다 | — |
| V-7 | `sys_cfg_chg_hist.cfg_tbl_nm` VARCHAR(63) | **통과** — §3 nm 규칙과 일치(sql/176 의 TEXT 를 표준에 맞춘 것) | — |
| V-8 | 조건부 단어 FST·DC·GRP·SPK·IFL·DSPL 미채택 | **확인** — §8 등재 SQL 에 이미 빠져 있다(DSPL 은 원래 보류) | — |

**P-6 (정본 개정 제안 추가)** : 정본 §5 FK 행에 "같은 부모를 참조하는 2번째 이후 FK, 자연키 참조 FK, 자기참조 FK 는 `<자식>_<컬럼명>_fkey`" 예외를 명문화.

### 10-2. #9 전 객체 재점검 반영 기록 (2026-10-10, 09_standards_reinspection → 10_leader_reinspection-decision)

| # | 항목 | 판정(leader·마스터) | 사전 반영 |
|---|---|---|---|
| R-1 | sys_user 7개 컬럼 개명 | **전부 개명 확정** : `id→usr_id` · `role→role_cd` · `pi_username→pi_usr_nm` · `pi_wallet_address→pi_wlt_adr_txt` · `display_name→dsp_nm` · `last_login_dtm→lst_lgn_dtm` · `rejoin_dtm→rjn_dtm`. 정본 v2.4 §1-3(단일 표준단어 금지)·미등재 단어 해소. 실제 000·`@pi/auth`·`@pi/db`·sitemap 코드는 구현 단계 같은 배포(00_input §3-2) | 용어 7개 확정 |
| R-2 | 신규 표준단어 7개 | **등재 확정** : ROLE(권한, 마스터 지정 4자 예외)·WLT(지갑)·ADR(주소)·DSP(표시)·LST(최종)·LGN(로그인)·RJN(재가입). 동의어 점검은 09 §5 | §8 등재 SQL 7행 추가(총 51행) |
| R-3 | 함수 인자 §1-3 적용(J-3) | **마스터 결정 : 신규 함수만 적용.** 기존 함수 인자 `p_days`(001 `fn_sel_stat_site_chg`)·`p_kind`·`p_obj`(000 `fn_grant_svc_only`)는 **grandfathered**(사유 : 앱·공용 함수 호출 계약, 추적처 : 이 표). OBJ 단어는 등재하지 않음 | — |
| R-4 | 등재 보류 정리 | DSP(표시)가 01 의 DSPL(노출, 보류)을 대체한다. LST 는 "최종" 뜻으로 확정됐다(정가는 NRM 유지) | §2-3 등재하지 않는 단어 표의 DSPL 보류는 DSP 로 해소 |

## 11. 다음 단계

- leader 승인 → 모델러는 §4 용어와 §5 코드값으로 02 모델·DDL 을 작성한다. 사전에 없는 단어가 필요하면 standards 에 등재를 요청한다(편법 명명 금지).
- 모델러 DDL 초안이 나오면 standards 가 명명을 검증한다(CREATE·ALTER ADD COLUMN 동일 강도, 위반은 `컬럼명 | 위반유형 | 권장값` 표, 이전 위반 해소 대조표 포함).
