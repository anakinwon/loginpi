# 03_quality_gate_r1 — sitemap.pi 1차 데이터 모델 품질 게이트 (r1)

- 잡 : `20261010_sitemap-data-model` / 단계 : 03 품질 게이트 / 점검자 : quality / 점검일 2026-10-10
- 대상 : **r1-a 현행 파일로 고정**(leader 지시) — `02_modeler_model.md`(r1-a), `02_modeler_ddl.sql`(Part A·B, 981행, 52행 COMMENT "확인 키(HMAC 계산값)"·트리거 `trg_usr_snc_ord_chg` 반영판) — leader 승인 `02_leader_model-approval_r1.md`(§4-1 유지), 01 §10 V-1~V-8·P-6은 승인 범위 내 추가 기록
- standards 명명 재검증(r1-a) 통과 회신을 함께 반영 : 컬럼 152개 lint 0건, 1차 P1(금지 어휘 "토큰")은 r1-a에서 해소. quality 독립 점검(E-1·E-3·E-4·E-6) 결과와 일치
- 기준 : `docs/da/품질점검기준서.md` v1.0 §3 · `docs/da/데이터표준규칙.md` **v2.3** · `01_standards_dictionary.md`(leader r4 APPROVED — §2-3 r3 약어·§9 변경표) · `00_requirements.md` REQ-01~92 · `00_input.md` §3 마스터 결정 8건·§3-1 마스터 확정 4건 · leader 확정 사항(MBR 재사용, FK 제약명 P-6 예외, mod_dtm 함수 search_path 미설정 허용, site_ 승계 주석 유효)
- 직전 보고서 대조 : `docs/da/reports/2026-07-10_sys_cfg_chg_hist_품질게이트.md`(Q1~Q6)

## 최종 판정 : PASS (P2 조건부)

| 등급 | 건수 | 차단 |
|---|---|---|
| **P1** | **0** | — |
| **P2** | **3** | 비차단. 2건은 최종 문서(#7)에서 반영하고, 1건은 Part B 확정(003) 전에 해소 |
| **P3** | **9** | 개선 과제 |

P1이 없으므로 modeler 재작업 요청과 재게이트는 생략합니다. P2 3건은 leader 판단 사항입니다.

---

## 1. 점검 방법 (주장 대신 실측)

| # | 방법 | 결과 |
|---|---|---|
| E-1 | **da-ddl-guard Hook 실제 실행**(`sql/999_gate_probe.sql`로 위장한 Write 입력) | 승인 주석이 있으면 exit 0. 주석을 떼면 R2(`site_sts_hist`·`site_img` 접두사) 2건만 걸림 — 리더 확정상 위반이 아님. **R1·R3~R7 0건, R7 도메인 종결 경고 0건** |
| E-2 | **PGlite 0.2.17 재실행**(quality 독립 실행, 잡 임시 디렉토리) : 000_baseline → 001 → 02 → 02 재적용 | 적용 3건과 **재적용 멱등 모두 PASS**. 단언 18건 중 17건 PASS, 탐침 3(GRACE_DAY)만 FAIL → Q-P3-2 |
| E-3 | 주석을 제거한 DDL 정규식 스캔 : DELETE/TRUNCATE/DROP TABLE, 스키마 접두, BEAN/TOKEN/COIN, r2 폐기 약어 15종, 신규 `_ord` 종결, CHAR(n) 비 `_yn`, TIMESTAMP(무 tz), sys_user/pi_pymnt ALTER·재정의·REFERENCES | 전부 0건. `USR_SANCTIONED`는 예외 메시지 코드 문자열이라 단어 판정 대상이 아님 |
| E-4 | 컬럼 84개를 토큰으로 분해해 01 사전·정본과 역대조 | 미등재 단어 0. sql/176 등재 10종, 시스템 4종, PROMO(D-5 grandfathered), EXPR·ACTV·ITEM·IMG·PRCS(01 §2-2) 모두 확인 |
| E-5 | 경계면 교차 비교 : DDL ↔ 모델 문서(d절 정의서·c-2 FK·i절 인덱스) ↔ 001 컬럼 타입 ↔ 앱 코드(`src/app/api/**`·`site.ts`) | §3 참조 |
| E-6 | **금지 어휘 전수 점검(COMMENT·주석·시드·함수 본문 포함)** — 01 §6 목록 전부 : 토큰·BEAN·TOKEN·TKN·COIN, `amt_pi`, `_st_cd`, use_days·stock_qty·singleton_key·reason_memo·active_mode·`*_at`, created_at 계열, `'infinity'`, CHAT_SUBSCR, MASTER, 평생·투자·상위 노출 보장, 스키마 접두, 이음동의(knd·conn·susp·prc)·동음이의(link·lst·rls) | **DDL 사용 0건.** 적중 2건(391·581행 COMMENT "infinity 금지")은 금지를 밝히는 문구라 위반이 아님. 모델 문서 적중 2건(287행 "BEAN/TOKEN/COIN 0건", 485행 교정 경위 인용 "토큰")도 인용이라 위반이 아님 — 485행은 최종 문서로 옮길 때 표현 순화 권고(standards 의견과 같음, 미집계) |

PGlite 단언 목록(E-2) : 기준선 이력 19, 소유 확인 없는 승인 23514, 생성 이력 chgr_id=등록자, REQ-55 NONE 거절·BSC1 허용, REQ-44 자사 거절, 멤버십 site_id 거절, 신고 인용 → SUSPENDED·RPT_ACCEPT·주문 회수, 제재 → 판정 N, 오인 취소 → 복귀·CMPN 1건, sys_user 미확장, 그리고 탐침 1·2·3.

## 2. P1/P2/P3 체크리스트 (품질점검기준서 §3)

| 등급 | 항목 | 결과 | 근거·위치 |
|---|---|---|---|
| P1 | 테이블 접두사 | ✅ | 신규 10개 = `site_`(001 DA-APPROVED 승계, 리더 확정)·`sys_`·`promo_`·`fee_`·`usr_`(정본 §2-1) |
| P1 | 소문자 snake·비표준 접미사·복수형 | ✅ | E-1 R3 0건. `_hist`는 정본 §4-3 감사 접미사 |
| P1 | 시스템 컬럼 4종 끝·순서·NOT NULL·DEFAULT | ✅ | E-1 R1 0건. 10개 테이블 모두 `regr_id→reg_dtm→modr_id→mod_dtm` 끝 배치를 눈으로 확인 |
| P1 | `del_yn CHAR(1)` + CHECK, `del_dtm TIMESTAMPTZ` | ✅ | 10/10 |
| P1 | 물리 DELETE/DROP TABLE 부재 | ✅ | E-3 0건. `DROP CONSTRAINT IF EXISTS`(멱등 재생성)만 있음 |
| P1 | `_dt`/`_dtm` 날짜형·TIMESTAMPTZ | ✅ | E-3 0건 |
| P1 | **마스터 확정 4건 반영**(미반영·[확인중] = P1) | ✅ | §4 |
| P2 | 표준용어 형식·도메인 종결 | ✅ | E-1 R7 0건, E-4 미등재 0 |
| P2 | 정본 v2.3 약어(MV·ORD, `_ord` 신규 금지, 자음 2~3자) | ✅ | E-3. `site_mv_url`·`fee_ord`·`ord_*`·`upr_ord_id`·`sort_seq`·`img_seq`. ordr·move·r2 약어 잔존 0 |
| P2 | 금액 `*_pi_amt NUMERIC(18,7)`(리더 판정 1) | ✅ | `pi_amt`·`nrm_pi_amt`·`ord_pi_amt`. `*_amt_pi` 0건 |
| P2 | `use_days`·`stock_qty` → 기존 도메인 | ✅ | `use_day_cnt`·`stk_cnt`(INT) |
| P2 | `mod_dtm` 트리거 | ✅ | 비 hist 7개 테이블 `trg_<tbl>_mod_dtm`. hist 3종은 정본 §6 예외이며, DDL 주석에 "논리삭제 시 modr_id·mod_dtm 수동"이 명시됨 |
| P2 | 제약·인덱스 명명 | ✅(예외 적용) | FK 13개 중 같은 부모·자연키·자기참조 7개(vrf_usr_id·bnd_plan_cd·item_plan_cd·tgt_usr_id·prcs_usr_id·fee_plan_cd·upr_ord_id)는 `<자식>_<컬럼>_fkey`(리더 확정 P-6). 나머지는 표준형. `ux_` 접두는 Q-P3-6 |
| P2 | Top-down·주제영역·PK | ✅ | 모델 (a) 주제영역 → (b) 개념 ERD → (c) 논리 → (d) 물리 |
| P2 | **C-1 반영** | ❌ → **Q-P2-1** | |
| P2 | **C-2 반영** | △ → **Q-P2-2** | |
| P3 | Y/N `CHAR(1)` + CHECK | ✅ | `_yn` 9종 모두 |
| P3 | COMMENT | △ → **Q-P3-4** | 테이블 COMMENT는 10/10, 컬럼 COMMENT는 부족 |
| P3 | FK 참조 무결성 | ✅ | 신규 관계 FK 13개 NO ACTION. `pi_pymnt`는 010 이후 ALTER로 추가(주석으로 위치 확보) — 리더 판정상 정답 |
| — | 스키마 비의존·권한 | ✅ | 스키마 접두 0. 업무 함수 7개 모두 `SET search_path FROM CURRENT`(leader 승인서의 "8개"는 7개로 정정 — RPC 2·트리거 함수 5)(mod_dtm 함수 7개 미설정은 리더 허용). `fn_grant_svc_only` 테이블 10·RPC 2 = 모델 주장(A 2·B 10)과 일치 |
| — | baseline 승계 | ✅ | `sys_user`·`pi_pymnt` ALTER·재정의 0(E-3, E-2 컬럼 조회 0) |
| — | pg_trgm 표준 | ✅ | 신규 부분일치 검색 대상 없음. 001 GIN 2종 유지(REQ-07) |

## 3. 경계면 교차 비교

| 경계 | 결과 | 비고 |
|---|---|---|
| DDL ↔ 모델 d절(컬럼·타입·NULL·기본값) | ✅ | 10개 테이블 전수 대조, 불일치 0 |
| DDL ↔ 모델 c-2 FK 13개·제약명 | ✅ | 개수·이름 일치 |
| DDL ↔ 모델 i절 인덱스 | ✅ | 일치 |
| DDL ↔ 001 타입 | ✅ | `site_dom_nm`·`vrf_dom_nm` VARCHAR(253), `site_ctgr_cd` VARCHAR(20), 상태코드 VARCHAR(20) 일치 |
| DDL ↔ 01 §3 도메인 Type/Length | ✅ | `cfg_key VARCHAR(50)`, `cont` 사유 500, `url` https·≤1000, `fee_plan_cd VARCHAR(30)` |
| 이력 CHECK ↔ 원천 컬럼 | ❌ → **Q-P3-3** | `site_sts_hist.chg_rsn_cont ≤500` ↔ `site_mst.rjct_rsn_cont` 무제한(001) |
| DDL 헤더·COMMENT ↔ CHECK | △ → **Q-P3-7** | `sys_cfg_chg_hist` 대상 테이블 서술(3종) ↔ CHECK(4종, `fee_plan_bnd` 포함) |
| 트리거 행위자 ↔ 앱 INSERT | ✅ | `api/me/sites/route.ts:74-75`가 `regr_id·modr_id = user.id`를 넣음. 이력 `chgr_id` 오귀속 없음을 E-2로 실측 확인 |
| DDL 1행 승인 주석 ↔ 모델 헤더 | △ → **Q-P3-5** | 주석은 "leader r3 APPROVED", 모델은 "01 r3(leader r4 APPROVED)" |

## 4. 요구 반영 — DDL 실물 대조 (추적표 주장 검증)

### 4-1. 마스터 확정 4건 (00_input §3-1, 미반영 = P1)

| REQ | 확정 내용 | DDL 실물 | 판정 |
|---|---|---|---|
| 35 | 회사명 = `site_nm` | 회사명 신규 컬럼 없음(ALTER ADD 5개 = mv_url·vrf_* 4) | ✅ |
| 36 | 이동 URL 등록자 입력 + 관리자 심사 | `site_mst.site_mv_url TEXT` + https·≤1000 CHECK + COMMENT. 재심사는 기존 앱 규칙 "APPROVED 변경 → PENDING"(모델 M-4·f절 앱 변경 ③) | ✅(재심사 = 앱) |
| 55 | 반짝임 NONE 사이트 구매 불가 + 가격·기간·재고 [확인중] | `fee_tp_cd` SPARKLE + **트리거** `SPARKLE_PLAN_REQUIRED`(E-2 실측: NONE 거절·BSC1 허용). SPARKLE 행 시드 없음, (j)#3 [확인중] | ✅ **DB 강제** |
| 14 | 계정 제재는 sitemap 별도 엔터티, sys_user 미확장 | `usr_snc` + `trg_usr_snc_ord_chg` 연쇄(E-2 실측: 정지·판정 N·오인 취소 복귀·CMPN). sys_user ALTER 0 | ✅ |

### 4-2. 마스터 결정 8건 (00_input §3)

| # | DDL 실물 | 판정 |
|---|---|---|
| 1 면적 가중치 | DB 미저장 — M-14(leader D-8). 화면 상수가 원천 | ✅ |
| 2 표 보기 LV | 파생(PLAN_CD 순서), 저장 컬럼 없음 | ✅ |
| 3 반짝임 실구매 | fee_plan SPARKLE·fee_ord 사이트 단위·트리거 자격 | ✅ |
| 4 이동 URL | `site_mv_url` | ✅ |
| 5 로고·회사명, 광고 판정 가능 | `site_img_url`·`site_nm` 재사용. 광고 = 파생(h-5) — 판정 입력값(plan_cd·own_site_yn·ACTIVE 주문)이 모두 DB에 있음 | ✅ |
| 6 자사 = 관리자 배정·구매 금지 | 트리거 `OWN_SITE_NOT_BUYABLE`(E-2 실측) | ✅ |
| 7 샘플 91개 미시드 | 시드는 sys_cfg 7키·promo 1행뿐 | ✅ |
| 8 DB 구성 | 스키마 접두 0, search_path FROM CURRENT, fn_grant_svc_only | ✅ |

### 4-3. REQ 전수 (01~92)

추적표 (e)의 행을 DDL 실물과 하나씩 대조했고, 누락은 0건입니다. 주요 실물 확인 결과는 다음과 같습니다.
- REQ-28 : vrf_* 4컬럼 + `vrf_yn_apv_check`(E-2 23514)
- REQ-80 : 이력 3종
- REQ-26 : OWNERSHIP 부분 인덱스
- REQ-53·56·58 : fee_plan·fee_plan_bnd, 시드 없음
- REQ-54 : advisory lock + 점유 판정
- REQ-61 : 싱글톤 `((1))` + 사이트당 1건 UNIQUE + NEW·0 Pi CHECK
- REQ-62·63 : 스냅샷 NOT NULL
- REQ-65 : 상태 CHECK 6종
- REQ-66 : fn_sel_mbr_actv_yn
- REQ-68 : 회수 트리거(E-2 실측)
- REQ-69 : `pymnt_id` [TBD 010] — 키 타입 미확정이 리더 판정상 정답이고, FK는 주석으로 처리되어 010 이전에도 DDL이 실행됨(E-2)

§15 미결 항목(REQ-32·45·46·69·71·73·81, 등록 상한)은 모두 (j)에 [확인중]/[TBD]로 남아 있고 임의 확정은 0건입니다. 신규 제기된 (j)#10·#11은 질의로 올바르게 표시돼 있습니다.

---

## 5. 위반 목록

| ID | 위반 항목 | 등급 | 근거 조항 | 위치 | 수정 권고 |
|---|---|---|---|---|---|
| **Q-P2-1** | C-1 미반영 — (f) 적용 순서에 "Part A 적용과 앱 변경 ①(승인 API의 `vrf_*` 4컬럼 기록) **동시 배포 필수**, A만 적용하면 외부 사이트 승인이 23514로 전부 실패"라는 문장이 없음. INSERT 시 `modr_id` 확인 항목도 없음 | P2(최종 문서 반영 대상) | leader 조건 C-1, 품질점검기준서 §3 P2 모델링 절차 | 모델 (f) 368·370행 | 적용 순서에 동시 배포 필수와 실패 증상(23514)을 명시합니다. INSERT 시 modr_id 확인 항목을 추가하되, **현행 코드는 이미 충족**(`api/me/sites/route.ts:74-75`, E-2 실측)함을 함께 기재합니다. 23514 실패는 E-2에서 재현했습니다 |
| **Q-P2-2** | C-2 일부 미반영 — MBR 판정은 M-16·(j)#15에 반영됐으나, **FK 제약명 예외(P-6)는 본문에 없음**(c-2는 "컬럼명으로 구분"만, P-6은 변경 이력 485행에만 있음) | P2(최종 문서 반영 대상) | leader 조건 C-2, 정본 §5 | 모델 c-2 표 아래 | c-2에 "같은 부모 2개 이상·자연키·자기참조 FK는 `<자식>_<FK컬럼>_fkey`(정본 개정 제안 P-6)" 규칙과 해당 7개 제약명을 기재합니다 |
| **Q-P2-3** | **같은 사이트·같은 유형 신규(NEW) 주문 중복 허용** — 재고 판정이 `o.site_id <> NEW.site_id`로 자기 사이트를 빼므로, 이미 HELD/ACTIVE인 HOME_SLOT이 있는 사이트가 NEW 주문을 또 넣을 수 있음. 재고는 1개만 점유되는데 결제는 2회 발생하고 기간이 겹침. 이어 구매는 EXTEND(REQ-57)여야 함 | P2(Part B 003 확정 전) | REQ-54·57, 모델 M-8("모든 주문 생성 경로의 단일 관문" 주장과 불일치) | DDL B6-1 `fn_vrf_fee_ord_ins` 761행 | 트리거의 NEW·RENEW 분기에서, 같은 site_id·같은 소비 유형의 점유 주문(HELD 미만료·ACTIVE 미만료)이 있으면 `ALREADY_OCCUPIED`(P0001)로 거절해 EXTEND로 유도합니다. **E-2에서 재현했습니다**(2건 모두 HELD 생성) |
| Q-P3-1 | 신고 인용 정지 시 `chg_rsn_cont`가 `rjct_rsn_cont` 현재값을 그대로 복사 — 남은 반려 문구가 정지 사유로 기록될 수 있음 | P3 | leader 관찰 1 | DDL A3 184-189행, 트리거 127행 | RPC가 정지와 함께 `rjct_rsn_cont := p_prcs_cont`를 설정합니다(직권 정지 경로와 같은 의미) |
| Q-P3-2 | `GRACE_DAY` 설정이 없으면 `fn_sel_mbr_actv_yn`이 조용히 'N'을 반환 — **실측 결과 만료 경계가 아니라 이용 기간 중(종료 29일 전)인 비영구 멤버십 전원이 'N'**(NULL interval 비교). 설정 1행이 논리삭제되면 유료 회원 전원의 혜택이 소리 없이 박탈됨. 트리거(`fn_chg_usr_snc_fee_ord`)는 같은 상황에서 예외를 던져 동작이 서로 다름 | P3(영향 큼 — 우선 처리 권고) | leader 관찰 2, E-2 탐침 3(정상 Y → 누락 N) | DDL B8 952-954행 | 함수를 plpgsql로 바꿔 누락 시 `CFG_MISSING` 예외를 던지게 하거나 `COALESCE(...,0)`으로 유예 0일을 적용해 트리거와 동작을 맞춥니다. 운영상 `GRACE_DAY` 논리삭제 금지도 명시합니다 |
| Q-P3-3 | 이력 CHECK ↔ 원천 컬럼 길이 불일치 — `site_mst.rjct_rsn_cont`(001, 무제한)에 501자 이상을 쓰면 `site_sts_hist_chg_rsn_cont_check`에 걸려 **상태 전이 자체가 23514로 실패**. 앱 상한 `LIMITS.rsnCont=500`이 막고 있지만 SQL 콘솔·향후 RPC 경로는 무방비 | P3 | 01 §3 `cont` 500, 품질점검기준서 §3(메타데이터 정합) | DDL A2 92행 ↔ 001 72행 | Part A에서 `site_mst_rjct_rsn_cont_check (≤500)`을 ALTER로 추가(원천에서 차단)하거나 트리거에서 `left(…,500)`으로 자릅니다. **E-2에서 재현했습니다** |
| Q-P3-4 | 컬럼 COMMENT 부족 — 업무 컬럼 87개 중 18개만 있음. `sys_cfg_chg_hist`·`promo_fee_cfg`·`fee_plan_bnd`·`fee_ord_hist`는 0개(인라인 `--` 주석만). 001은 14개 | P3 | 품질점검기준서 §3 P3 "메타데이터(컬럼 설명, COMMENT)" | Part B | 최소한 코드값 컬럼(`chg_actn_cd`·`ord_sts_cd`·`snc_tp_cd`·`stk_scp_cd`)과 FK 컬럼에 COMMENT를 추가합니다. 인라인 주석을 COMMENT ON COLUMN으로 옮기면 됩니다 |
| Q-P3-5 | 승인 주석 형식 — 1행이 정본 §0-4 형식 `-- DA-APPROVED: <사유> (<YYYY-MM-DD>)`의 끝 날짜 괄호를 갖추지 않음(날짜는 본문 안에만 있음). "leader r3 APPROVED"는 01 승인 r4와 불일치 | P3 | 정본 §0-4, 품질점검기준서 §2 | DDL 1행 | 끝에 `(2026-10-10)`을 붙이고 "01 r3(leader r4 APPROVED)"로 정정합니다 |
| Q-P3-6 | 인덱스 명명 — `ux_` 접두(001 선례이나 정본 §5는 `idx_`만 정의). `ux_promo_fee_cfg_sngl`의 SNGL은 컬럼도 사전 단어도 아니고, `ux_fee_plan_bnd_item_actv`도 컬럼명 축약 | P3 | 정본 §5 `idx_<테이블>_<컬럼>` | DDL 240·323·430·493·586·590·916행 | 정본 §5에 부분 UNIQUE `ux_<테이블>_<컬럼>_actv` 패턴 명문화를 정본 개정 제안에 추가합니다(001 선례 소급). `sngl` → 표현식 인덱스 관례명을 리더가 판단합니다 |
| Q-P3-7 | 서술 불일치 — `sys_cfg_chg_hist` 대상이 DDL 270행 주석·COMMENT에는 3종, CHECK·모델 d-8에는 4종(`fee_plan_bnd` 포함) | P3 | 품질점검기준서 §3(문서 정합) | DDL 270·294행 | 주석·COMMENT에 `fee_plan_bnd`를 추가합니다 |
| Q-P3-8 | 오픈 프로모 대상 상품 판정 DB 미강제 — `fee_ord.promo_apl_yn='Y'`가 `fee_plan.promo_apl_yn='Y'`(7일 슬롯) 상품인지 트리거가 확인하지 않음. 설계서 h-3에 "앱/RPC 판정"으로 명시돼 있으나 M-8의 단일 관문 원칙과 어긋남 | P3 | REQ-61, 모델 M-8 | DDL B6-1 | 트리거에 `NEW.promo_apl_yn='Y' AND v_plan.promo_apl_yn<>'Y'` 거절 1줄을 추가합니다(Q-P2-3과 같은 위치) |
| Q-P3-9 | 서식 — r3 개명 후 컬럼 정렬이 어긋남(`lft_yn`·`nrm_pi_amt`·`promo_apl_yn`·`apl_*`·`bnd_plan_cd`·`ord_*`·`upr_ord_id`·`snc_*` 등) | P3 | 가독성 | Part B | 003 확정 시 정렬합니다. 기능 영향 없음 |

### 후속 조치 (위반 아님 — 정본·Hook 드리프트, leader 지시로 P3 기재만)

- 정본 §2-1·Hook `PREFIX_RE`에 `site_`(001 승인)·`rpt_`(cafe sql/113)가 미등재이고, Hook에만 있는 `approval_`이 정본에는 없음 → 정본 개정 제안으로 마스터에게 상신(이 잡 쓰기 범위 밖).
- 신규 `_ord` 종결 차단은 현재 **게이트에만 의존**합니다(Hook `DOMAIN_SUFFIXES`의 `ord`는 정본 v2.3 이력상 기존 컬럼 호환을 위한 의도적 유지라 불일치가 아님) → P-5 "Hook 신규 `_ord` 경고 기능 추가".

## 6. 직전 보고서(2026-07-10) 대비 — 반복·퇴행

| 직전 | 내용 | 이번 |
|---|---|---|
| Q1 `val` 도메인 미등재 | 정본 §1-2·Hook 등재 완료 | ✅ 해소 유지(`old_val`·`new_val` R7 경고 0) |
| Q2 hist 트리거 부재·수동 modr_id | 정본 §6 예외 명문화 | ✅ hist 3종 모두 예외 적용 + DDL 주석에 수동 설정 명시. 퇴행 없음 |
| Q3 인덱스명 테이블명 축약 | `idx_sys_cfg_chg_*` | ✅ 이번엔 `idx_sys_cfg_chg_hist_cfg_tgt_id`(전체 테이블명). 단 `ux_` 계열 축약은 새 유형(Q-P3-6) |
| Q4~Q6 문서↔SQL 서술 불일치 | | **유사 패턴 재발** : Q-P3-7(주석↔CHECK). 반복 위반 패턴은 "주석·COMMENT 갱신 누락" |
| 2026-06-12 교훈(승인 주석 순환 논리) | | 이번 승인 주석은 001 승인 승계이고, 사유("기존 22종에 맞는 주제영역 없음")를 리더가 재검증 — 순환 논리 아님 |

**재발방지 제안** : 주석·COMMENT와 CHECK 값 목록의 불일치는 Hook이 잡지 못합니다. 최종 문서 단계(#7)에서 "CHECK IN 목록 ↔ COMMENT 열거" 대조를 체크리스트 항목으로 추가할 것을 권고합니다.

## 7. 개선 권고 (우선순위순)

1. **Q-P2-3** — Part B(003) 확정 전에 트리거에 같은 사이트 중복 점유 거절을 추가합니다(결제 무결성). Q-P3-8(프로모 대상 상품)도 같은 위치에서 함께 처리할 수 있습니다.
2. **Q-P2-1·Q-P2-2** — 최종 문서(#7)에 C-1·C-2를 반영합니다.
3. **Q-P3-2** — `fn_sel_mbr_actv_yn` 설정 누락 시 동작을 트리거와 맞춥니다(설정 1행으로 전원 혜택 박탈 위험).
4. Q-P3-3 → Q-P3-1 → Q-P3-4 → Q-P3-5·6·7·9 순으로 처리합니다(003 확정 또는 최종 문서 시).

## 8. 승인 필요 항목 (예외 처리)

| 번호 | 위반 항목 | 예외 사유 | DA 승인 여부 |
|---|---|---|---|
| X-1 | `site_` 접두사(R2) | 001 DA-APPROVED 승계, 맞는 주제영역 없음 | ✅ leader 확정(유효) |
| X-2 | FK 제약명 `<자식>_<FK컬럼>_fkey` 7개 | 같은 부모 복수·자연키·자기참조는 정본 §5 형식으로 구분 불가 | ✅ leader 확정(P-6 상신) |
| X-3 | mod_dtm 트리거 함수 7개 search_path 미설정 | 테이블을 참조하지 않음, 001 선례 | ✅ leader 확정 |
| X-4 | `pymnt_id TEXT` 가안·FK 주석 | 010 PK 미확정 | ✅ leader 판정(정답) |

---

- 실측 스크립트(재현용) : `C:\Users\anaki\.claude\jobs\14d45916\tmp\pg\gate.mjs` — 잡 임시 디렉토리라 잡 삭제 시 함께 지워짐. 재현이 필요하면 `node gate.mjs <repo_root>`(PGlite 0.2.17)
- 운영 DB 전수조사 쿼리 : **미수행** — sitemap DB 스키마 미생성 상태이고, 대상이 초안 DDL이라 해당 없음
