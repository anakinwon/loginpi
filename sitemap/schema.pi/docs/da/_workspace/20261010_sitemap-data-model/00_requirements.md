# 00_requirements — sitemap.pi 데이터 요구사항 목록 (REQ)

- 잡 : `20261010_sitemap-data-model` / 단계 : 00 요구 수집 / 작성일 2026-10-10
- 입력 : `00_input.md` §2 정본 전량 — `sitemap/sitemap.pi/docs/PRD.md`(v0.7, 전체), `ROADMAP.md`, `OPS_SETUP.md`, `sitemap/sitemap.pi/CLAUDE.md`, `sql/001_sitemap_phase1.sql`, `packages/pi-db/sql/000_baseline.sql`, `src/lib/site.ts`, `src/lib/api.ts`(verifyToken·isOwnImgUrl·checkSiteWrite), `src/lib/auth.ts`, `src/app/api/**/route.ts` 13개 전부, `sitemap/sites.json`(19개), `src/data/sample-sites.json`(91개), `docs/PRD_28_PI_MULTISITE.md` §4
- 표기 : **As-Is 구분** = `기존`(001·baseline 에 이미 있음, 변경 없음) / `변경`(기존 객체에 속성·규칙 추가·수정 필요) / `신규`(새 엔터티·속성·함수) / `앱`(DB 객체 없이 앱 규칙으로 충족 — 모델 반영 여부 판단 대상) / `제외`(DB에 두지 않음)
- Phase : `1` MVP(기존 범위) / `2` 결제·부가서비스(멤버십·구독 포함, 2+ 장기 요금 포함) / `3` 이후(리뷰·소유 검증 배지)
- 확인 못 한 값은 `[TBD]` / `[확인중 : 마스터]`

---

## 1. 공통·플랫폼

| REQ | 요구 | 출처 | 데이터 영향(엔터티·속성·규칙) | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-01 | 전 테이블 시스템 컬럼 4종 + 논리삭제(`del_yn`·`del_dtm`), 물리 DELETE 금지 | 루트 CLAUDE.md DB 절, PRD §7 마지막 줄, `docs/da/데이터표준규칙.md` | 신규 테이블 전부 `regr_id`·`reg_dtm`·`modr_id`·`mod_dtm`·`del_yn`·`del_dtm` + `mod_dtm` 트리거(append-only `_hist` 는 트리거 예외 — 표준규칙 §6) | 1·2·3 | 기존(001 3테이블 준수) / 신규 테이블 적용 |
| REQ-02 | sitemap 전용 DB — 운영 = 전용 Supabase `public`, 개발·스테이징 = pi-nonprod `sitemap_dev`·`sitemap_stg`. 스키마명 하드코딩 금지(search_path) | 00_input 마스터 결정 #8, sitemap CLAUDE.md 아키텍처, 001 판정 8, baseline 판정 1 | DDL 에 스키마 접두 금지, 함수 `SET search_path FROM CURRENT`, cafe.pi DB 와 공유 금지(교차 FK 불가) | 1 | 기존 |
| REQ-03 | RLS 비활성 + service_role 전용, anon·authenticated 권한 회수 | 00_input #8, baseline `fn_grant_svc_only`, 001 §4 | 신규 테이블·함수마다 `fn_grant_svc_only` 호출 | 1·2·3 | 기존(함수) / 신규 객체 적용 |
| REQ-04 | FK 유지 — PostgREST 임베디드 조인이 FK 에 의존 (`site_rpt → site_mst(...)`, `sys_user(pi_username)` 임베드 사용 중) | 루트 CLAUDE.md FK 정책, `api/admin/reports/route.ts:30`, `api/admin/sites/route.ts:29`, 001 판정 6 | 신규 참조도 FK 선언(ON DELETE 없음 = NO ACTION). FK 제거 시 임베디드 조인 선대체 필수 | 1·2 | 기존 / 신규 FK 필요 |
| REQ-05 | 일시는 TIMESTAMPTZ, 통계 일자는 UTC 일자 | 표준규칙 §3-5(UTC), 001 `stat_dt` 주석 | 신규 일시 컬럼 `_dtm TIMESTAMPTZ`, 일자 `_dt DATE`(UTC) | 1·2 | 기존 |
| REQ-06 | 가격 등 Pi 금액은 Pi 직접 표기, Bean·토큰·코인 어휘 금지(컬럼명·코드값·코멘트 포함) | sitemap CLAUDE.md 승계 철칙, PRD §3 | 금액 컬럼 `*_amt_pi NUMERIC(18,7)`(PRD §7 `amt_pi` 초안), 코드값에 BEAN/TOKEN/COIN 금지 | 2 | 신규 |
| REQ-07 | 텍스트 부분일치 검색은 pg_trgm GIN(활성행 부분 인덱스) | 루트 CLAUDE.md Supabase 절, 001 판정 9, `api/sites/route.ts:44-47` | `site_nm`·`site_dom_nm` GIN 이미 존재. 신규 검색 대상 생기면 동일 패턴 | 1 | 기존 |
| REQ-08 | 목록 API 는 페이지네이션(전량 로드 금지), 공개 목록 `s-maxage` 캐시 | 루트 CLAUDE.md 프론트 표준, PRD §8, `api/sites/route.ts`(range), `lib/api.ts` PUBLIC_CACHE | 정렬 키 + 타이브레이커(`site_id`) 인덱스 — 승인일 역순·카테고리별·심사 대기열 인덱스 존재 | 1 | 기존 |

## 2. 사용자·관리자 (sys_user 승계)

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-10 | Pi 사용자는 `@pi/db` baseline `sys_user` 승계 — 재정의·컬럼명 표준화 금지(공용 패키지 계약) | baseline 판정 3·4, PRD §7 `sys_user` 행, 00_input §2 | 사이트 테이블은 `sys_user.id`(UUID) 를 FK 로 참조만. 컬럼명 `id`·`role` 등 원형 유지 | 1 | 기존(baseline) |
| REQ-11 | 사람의 불변 키 = `pi_username`(활성 UNIQUE), `pi_uid` 는 앱×네트워크 scoped 라 영구 식별자 금지. 이 앱은 username 재바인딩 안 함 | baseline `ux_sys_user_pi_username_actv`, `lib/auth.ts:24-27`(rebindByUsername:false), sitemap CLAUDE.md 승계 철칙 | 사이트 소유·주문 귀속은 `sys_user.id` FK, `pi_uid` 를 업무 키로 복제 저장 금지 | 1 | 기존 |
| REQ-12 | 관리자 = `sys_user.role='ADMIN'`(최상위, MASTER 행 없음), env `ADMIN_PI_USERNAMES`+`ADMIN_PI_UIDS` 로 승격 | baseline `sys_user_role_check`, `lib/auth.ts`, OPS_SETUP §4 | 별도 관리자 테이블 불필요. 처리자 기록은 `modr_id = admin.id` | 1 | 기존 |
| REQ-13 | 탈퇴·차단은 `del_yn`+`del_rsn_cd`(WDRW·SYS_DUP·ADMIN_BLCK), 재가입은 행 부활(`rejoin_dtm`) | baseline `sys_user_del_rsn_cd_check` | 멤버십 "탈퇴 시 소멸"(PRD §3-1 영구) 판정 근거가 `sys_user.del_yn` | 1·2 | 기존 |
| REQ-14 | **계정 제재(관리자의 계정 정지)** 시 멤버십 혜택 정지(`ordr_sts_cd='SUSPENDED'`), 복구 시 0 Pi 보상 연장 | PRD §3-1 정지, §5 주문 상태 `ACTIVE→SUSPENDED→ACTIVE` | baseline 에 "정지" 상태가 없음(`ADMIN_BLCK` 은 삭제=부활 불가). 계정 정지 표현 수단 결정 필요 — sys_user 확장(baseline 변경 = 공용 패키지 영향) vs 사이트 측 엔터티 [확인중 : 마스터] | 2 | 신규(미정) |

## 3. 사이트(디렉터리 마스터 `site_mst`) — 등록·심사

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-20 | 사이트 등록 단위 = `.pi` 단일 라벨 소문자 도메인(대리키 UUID PK, 도메인은 자연키) | PRD §5, 001 판정 4·`site_mst_site_dom_nm_check`, `site.ts` DOMAIN_RE | `site_mst.site_id`(PK)·`site_dom_nm`(CHECK 정규식) | 1 | 기존 |
| REQ-21 | 사이트 구분 9종 평면(COMMUNITY·EDU·SHOP·CONTENT·PERSONAL·EVENT·GAME·TOOL·ETC), 표시명은 번역키 `siteCtgr.<cd>`, 하위 카테고리는 외부 등록 증가 후(그 전 금지) | PRD §2, 001 판정 3, `site.ts` SITE_CTGR | `site_ctgr_cd` CHECK 9값. 하위 카테고리 도입 시 코드 테이블+FK 전환(현 범위 밖) | 1 | 기존 |
| REQ-22 | 사이트 상태 흐름 : DRAFT→PENDING(제출) → APPROVED/REJECTED(관리자, `rjct_rsn_cd` 필수) / APPROVED↔SUSPENDED / 임의→WITHDRAWN(SUSPENDED·WITHDRAWN 제외) / APPROVED 내용 변경 시 재심사(PENDING) | PRD §5, 001 `site_sts_cd` CHECK, `api/admin/sites/[id]/route.ts` FROM 맵, `api/me/sites/[id]/route.ts:59-82` | `site_sts_cd` CHECK 6값 + 조건 CHECK(REJECTED→사유 필수, APPROVED·SUSPENDED→`apv_dtm` 필수). 전이 규칙 자체는 앱(낙관적 동시성 `.eq(site_sts_cd, cur)`) | 1 | 기존 |
| REQ-23 | 반려 사유 코드 고정 : 금지 카테고리 7종(GAMBLING·NON_PI_PYMNT·GIFT_CARD·INVEST·ADULT·PII_COLLECT·PI_BRAND) + OWNERSHIP + ETC, 안내 문구 별도 | PRD §5 금지 카테고리, 001 판정 13, `site.ts` RJCT_RSN | `rjct_rsn_cd` CHECK 9값 + `rjct_rsn_cont` | 1 | 기존 |
| REQ-24 | 도메인 유일성 : PENDING·APPROVED·SUSPENDED 활성 행만 점유, DRAFT 는 미점유(선점 공격 차단), 같은 도메인 DRAFT 다건 허용 | PRD §5, 001 판정 4·`ux_site_mst_site_dom_nm_actv`, `site.ts` OCCUPY_STS | 부분 UNIQUE 인덱스(23505 → 409) | 1 | 기존 |
| REQ-25 | 사용자당 DRAFT+PENDING 합계 5건 상한 | PRD §5, `site.ts` LIMITS.openMax, `lib/api.ts` checkSiteWrite | 앱 검사(카운트 쿼리) — `idx_site_mst_ownr_usr_id` 사용. DB 강제 없음 | 1 | 앱 |
| REQ-26 | OWNERSHIP 반려된 (사용자, 도메인)은 같은 사용자가 재제출 불가, 그 행은 도메인 변경 불가(반려 이력 세탁 방지) | 001 판정 13 주석, `api/me/sites/[id]/route.ts:74-75`, OPS_SETUP §4 | 반려 행이 보존(논리삭제 아님)되어야 판정 가능 — 반려 이력 조회 근거. 상태가 덮이면(재제출 등) 근거 소실 위험 → REQ-80 감사 이력과 연동 | 1 | 앱(+감사 연동) |
| REQ-27 | **도메인 소유 확인 토큰** : HMAC(`SITEMAP_VERIFY_SECRET`, `sitemap-verify:<site_id>:<도메인>`) 앞 16자, 컬럼 없이 매번 계산(결정적). 등록자가 `https://<도메인>/sitemap-verify.txt` 게시 → 관리자 수동 확인 | PRD §5, `lib/api.ts:121-132`, `site.ts` VERIFY_FILE·OwnerSite.vrfy_tkn 주석, OPS_SETUP §4 | 토큰 자체는 **저장하지 않음**(제외). 단 아래 REQ-28 의 확인 결과는 저장 필요 | 1 | 제외(토큰) |
| REQ-28 | 외부 등록 승인 시 관리자의 소유 확인(`ownershipVerified:true`) 필수 — **현재 확인 사실이 DB 에 남지 않음**. Phase 3 "운영자 확인" 무료 배지는 소유 검증 통과 여부를 표시해야 함 | `api/admin/sites/[id]/route.ts:53-58`, `site.ts` adminSiteActionSchema, PRD §3 "배지는 판매하지 않음", ROADMAP Phase 3 | 소유 확인 결과(확인 여부·확인 일시·확인자, 확인 시점 도메인) 저장 속성 또는 이력 필요 — 감사·배지 근거. 형태는 모델러 판단 | 1(감사)·3(배지) | 신규 |
| REQ-29 | `apv_dtm` = 최초 승인 일시(재승인·복구 시 유지) — 일반 순위 기준 | 001 `apv_dtm` 코멘트, `api/admin/sites/[id]/route.ts:65` | 기존 컬럼, 덮어쓰기 금지 규칙(앱) | 1 | 기존 |
| REQ-30 | 연락처 : 심사용 비공개(제출 시 필수, 공개 응답 제외 필수) + 공개(옵트인) | PRD §4 연락처, 001 `pvt_cntc_txt`·`pub_cntc_txt`, `site.ts` PUBLIC_SITE_COLS(제외), LIMITS.cntcMax 200 | 기존 컬럼. 길이 200 은 앱 검증만(DB 무제한 TEXT) — 개인정보 컬럼 표기 [TBD : 표준 개인정보 등급] | 1 | 기존 |
| REQ-31 | 사이트 설명 : 기본 500자, 멤버십 2,000자(DB 상한 2,000, 기본 한도는 앱) | PRD §3 REGISTER·MEMBERSHIP, 001 `site_mst_site_desc_check`, `site.ts` LIMITS.descMax | 기존 CHECK ≤2000 | 1·2 | 기존 |
| REQ-32 | 자사 우선등록 19개 시드 — `own_site_yn='Y'`, `ownr_usr_id NULL` 허용(관리자 첫 로그인 후 귀속), 19개 전부 APPROVED(보류 4개 gifticon·omok·yoda·fondation 은 등재 제출 전 재검토) | PRD §2, 001 §5 시드·`site_mst_ownr_usr_id_check`, OPS_SETUP §4, sites.json hold | 기존 시드. 보류 사유(`hold`)는 sites.json·시드 주석에만 존재 — DB 보관 여부 [확인중 : 마스터] | 1 | 기존 |
| REQ-33 | 가상 샘플 91개는 **DB 에 넣지 않음** — 데모 전용(`src/data/sample-sites.json`, env `SITEMAP_SHOW_SAMPLES=1`) | 00_input 마스터 결정 #7, PRD §3-4, `api/bubbles/route.ts:53-72` | 샘플 여부 컬럼·샘플 행 불필요 | 1 | 제외 |

## 4. 화면 표시 속성 — 로고·회사명·이동 URL

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-35 | **버블 표시 = 회사 로고 + 회사명** — 로고 = `site_img_url`, 회사명 = `site_nm`. 광고·자사·등급 배지와 증감률은 툴팁·aria-label 로만(화면 한정 완화) | 00_input 마스터 결정 #5, `site.ts` BubbleItem(img·name), `api/bubbles/route.ts:124-137` | 기존 컬럼 재사용. "회사명" 과 사이트 표시명이 동일 컬럼인지(별도 회사명 속성 필요 여부) [확인중 : 마스터] — 현 목업은 `site_nm` 단일 | 1 | 기존(확인 필요) |
| REQ-36 | **이동 URL(연결 주소 재지정)** — `.pi` 도메인은 일반 브라우저에서 열리지 않으므로 사이트별 이동 URL 을 도메인과 별도 보관(예 cafe.pi → `https://cafepi.vercel.app/`). 현재는 `sites.json url` + 코드 Map(`REG_URL`) 으로만 존재 | 00_input 마스터 결정 #4, `api/bubbles/route.ts:45-51,132`, `site.ts` BubbleItem.url, sites.json `url` | `site_mst` 에 이동 URL 속성 신규(선택, https URL 형식 CHECK·길이 제한), 공개 응답 컬럼 포함. 등록자 입력 허용 시 심사 대상·URL 입력 검증(KISA) [확인중 : 마스터 — 관리자 전용 여부] | 1 | 신규 |
| REQ-37 | 외부 이동은 사용자 클릭 + 이동 안내 + 새 창(A-6), 자동 리다이렉트·iframe 금지 | sitemap CLAUDE.md 승계 철칙, PRD §4 외부 이동, 00_input #4 | DB 영향 없음(앱). 클릭 수는 REQ-60 `CLCK` 으로 집계 | 1 | 앱 |
| REQ-38 | 이미지 업로드 : 등록자 업로드만(크롤링·스크린샷 금지), 이미지도 심사 대상, Storage 공개 버킷 `site-img/<userId>/<UUID>.<ext>`, 2MB·png/jpeg/webp/gif(매직바이트), 본인 폴더 URL 만 허용 | PRD §4 이미지, `api/me/upload/route.ts`, `lib/api.ts` isOwnImgUrl, OPS_SETUP §2 | DB 에는 URL 1개(`site_img_url`). 파일 메타 테이블 없음(Storage 가 원천). 반려·철회 이미지 정리는 범위 밖 | 1 | 기존 |
| REQ-39 | 이미지 장수 : 기본 1장, 멤버십 5장 / 멤버십 만료 시 한도 초과분(2건째 이후 등록·초과 글자·이미지)은 삭제 없이 **비노출**, 재가입 시 복원 | PRD §3 REGISTER·MEMBERSHIP, §3-1 수명주기 | 다건 이미지 보관 구조(사이트-이미지 1:N 또는 배열) + 항목별 노출/비노출 판정 필요. 현 `site_img_url` 단일 컬럼으로 불충분 | 2 | 신규 |

## 5. 요금제(plan) 5단계·레벨·버블

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-40 | 요금제 5단계 + NONE(무료) : VIP·PRM2·PRM1·BSC2·BSC1·NONE, 기본 NONE, 표시명 번역키 `plan.<cd>` | PRD §3-4, 001 판정 12·`site_mst_plan_cd_check`, `site.ts` PLAN_CD | `site_mst.plan_cd` CHECK 6값 존재 | 1 | 기존 |
| REQ-41 | **버블 면적 가중치 변경** VIP 21.16 · PRM2 9.27 · PRM1 6.76 · BSC2 4.15 · BSC1 2.43 · NONE 0.7 (구 "면적 ×2 등비" 폐기). 크기·색·반짝임 색은 현재 화면 상수 | 00_input 마스터 결정 #1, `site.ts` PLAN_AREA·PLAN_COLOR·PLAN_SPARKLE | DB 저장 여부 모델러 판단 — 요금제 코드 마스터 신설 시 정렬순서·배지·면적가중치·색을 둘 수 있음. CHECK 유지 시 코드 상수가 원천. PRD §3-4 "면적 ×2 등비" 서술은 문서 갱신 대상 | 1 | 신규(선택) |
| REQ-42 | **표 보기 레벨 표시** VIP=LV5 … BSC1=LV1, NONE=없음 — 요금제 정렬 순서(ordr)로 산출 | 00_input 마스터 결정 #2, `components/bubble-home.tsx:398` | 정렬순서 속성(요금제 마스터) 또는 코드 상수 배열 순서. 레벨 값 자체는 파생(저장 금지) | 1 | 신규(선택)/앱 |
| REQ-43 | 요금제 배지(VIP·P2·P1·B2·B1, NONE 없음) | PRD §3-4, `site.ts` PLAN_BADGE | REQ-41 과 같은 판단(마스터 테이블 속성 또는 상수) | 1 | 앱/신규(선택) |
| REQ-44 | **자사 사이트 요금제는 관리자 배정**(결제 없음, `fee_ordr` 동기화 제외), 자사 사이트는 요금제·부가서비스 구매 금지 | 00_input 마스터 결정 #6, PRD §3 구매 자격·v0.6.1, `site.ts` BubbleItem.own | `own_site_yn='Y'` 행의 `plan_cd` 는 관리자 수기. 구매 차단은 주문 생성 검증(앱/DB 제약 — 모델러 판단) | 1·2 | 기존(+2 신규 규칙) |
| REQ-45 | Phase 2 부터 외부 사이트 `plan_cd` 는 **멤버십 주문(`fee_ordr`) 기준 동기화**(ACTIVE 주문 기간 → plan_cd, 만료 시 NONE) — 진실 원천은 `fee_ordr`, `plan_cd` 는 노출용 반정규화 | PRD §3-4 데이터, 001 판정 12 | 동기화 규칙(배치/트리거/RPC) 필요. **쟁점** : 멤버십은 계정 단위(§3 MEMBERSHIP "계정 단위")인데 `plan_cd` 는 사이트 단위 — 계정당 등록 5건 사이트 전부에 같은 요금제가 붙는지 [확인중 : 마스터]. 요금제 기간(영구·5년·1년·12개월·6개월) ↔ 멤버십 7기간 대응도 "Phase 2 결제 설계 때 재정의"(PRD §3-4) [확인중 : 마스터] | 2 | 신규 |
| REQ-46 | 프리미엄1(1년)·기본2(12개월) 기간 동일 — 차이 미정 | PRD §3-4 기간 중복, 001 판정 12 | 요금제-기간 매핑 확정 전 기간 속성 DB 고정 금지 [확인중 : 마스터] | 2 | 미정 |
| REQ-47 | 메인 버블 API : APPROVED·활성 사이트 + plan_cd + 기간 증감, 상한 200, DB 장애 시 sites.json 정적 폴백(캐시 안 함) | PRD §3-4 API, `api/bubbles/route.ts` | 조회 컬럼 `site_id·site_dom_nm·site_nm·site_ctgr_cd·site_img_url·plan_cd·own_site_yn` (+ 이동 URL REQ-36, 반짝임 REQ-55). 인덱스 `idx_site_mst_apv_dtm` 사용 | 1 | 기존(+변경) |

## 6. 노출·정렬·광고 구분

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-50 | **유료 노출은 항상 "광고" 라벨로 구분**, 데이터는 광고 여부를 판정할 수 있어야 함 — 판정 = `plan_cd<>'NONE' AND own_site_yn='N'` → 광고 / `own_site_yn='Y'` → "자사" / NONE → 라벨 없음. 추천 슬롯·반짝임도 광고 | sitemap CLAUDE.md 핵심가치 ③, PRD §3-4 등재 가드레일, 00_input #5 | 파생 판정(저장 컬럼 불필요). 반짝임·슬롯은 ACTIVE 주문 존재로 판정 | 1·2 | 기존(파생) |
| REQ-51 | **결제는 일반 순위에 영향 없음** — 일반 순위 = `apv_dtm` 역순(기본)·이름순(옵션)·평점순(Phase 3) | PRD §4 일반 순위, sitemap CLAUDE.md 핵심가치 ③, 001 `apv_dtm` 코멘트 | 정렬 키에 결제·요금제 속성 사용 금지(앱). 이름순 인덱스는 1만 건 이상 시 추가(001 판정 9) | 1 | 기존/앱 |
| REQ-52 | 추천 영역 : 목록 상단 분리 + "광고·추천" 라벨, 영역 안 순서는 요청마다 랜덤 순환 | PRD §4 추천 영역 | 순서 저장 불필요. ACTIVE 슬롯 주문 조회(사이트·카테고리·유형별 인덱스) | 2 | 신규(조회 경로) |

## 7. 상품·요금·프로모션 (Phase 2)

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-53 | **단가 단일 출처 `fee_plan`** — 코드 하드코딩 금지. 상품 종류(`fee_knd_cd`) REGISTER(무료)·CTGR_SLOT·HOME_SLOT·EXTEND·STATS·PREMIUM30·MEMBERSHIP (+ 신규 SPARKLE REQ-55). 속성 초안 : `fee_plan_cd`·`use_days`(영구 NULL)·`lftm_yn`·`subscr_yn`·`amt_pi`·`list_amt_pi`·`stock_qty`·`stock_scope_cd`(PER_CTGR/GLOBAL/NULL)·`promo_aply_yn`·`aply_bgn_dtm`/`aply_end_dtm`·`use_yn`·`sort_ord`, CHECK `(lftm_yn='Y' AND use_days IS NULL) OR (lftm_yn='N' AND use_days>0)` | PRD §3, §7 `fee_plan` 행 | 신규 엔터티. 단가는 제안값 [확인중 : 마스터 확정 — PRD §9 #3]. `sort_ord`·`stock_scope_cd` 등 명칭은 표준 판정 대상(001 판정 2의 `_sts_cd` 처럼) | 2 | 신규 |
| REQ-54 | 슬롯 재고 = 동시 노출 수 : CTGR_SLOT 카테고리당 3, HOME_SLOT 전체 6. 유료는 approve 단계 원자 확보(실패 시 거절, Pi 미차감), HELD 15분 경과 EXPIRED·재고 반환, 0 Pi 프로모는 주문 생성 시 확보. 재고 0 이면 가장 빠른 만료 시각 안내 | PRD §3 재고·경합 | 재고 판정 = 범위(카테고리/전체)별 ACTIVE+HELD 주문 수 ≤ `stock_qty` — 원자성 보장 수단(행 잠금·RPC·제약) 필요. 주문에 카테고리 스냅샷(`site_ctgr_cd`)·`hold_expr_dtm` | 2 | 신규 |
| REQ-55 | **부가서비스 "반짝임"(SPARKLE)** — 요금제와 별도로 추가요금을 내고 선택, 버블에 요금제 보색 반짝임. 현재 목업은 샘플 간주 플래그뿐 → **실구매 모델(결제·기간·상태) 필요**, 부가서비스 종류는 늘 수 있음(상품 코드화). 미결제 유료 표시 금지 | 00_input 마스터 결정 #3, `api/bubbles/route.ts:36-43`(ponytail 주석 "site_mst 부가서비스 컬럼 + fee_plan 결제"), `site.ts` BubbleItem.sparkle·PLAN_SPARKLE | `fee_plan` 에 부가서비스 상품(신규 `fee_knd_cd`) 행 + `fee_ordr`(사이트 단위) 로 구매·기간·상태 관리. 버블 표시 = 해당 사이트 ACTIVE 반짝임 주문 존재(파생) — `site_mst` 플래그 컬럼 반정규화 여부 모델러 판단. 반짝임 가격·기간·재고·NONE 요금제 사이트 구매 가능 여부 [확인중 : 마스터]. 자사 사이트 구매 금지(REQ-44) | 2 | 신규 |
| REQ-56 | 묶음 상품 PREMIUM30 = CTGR_SLOT + HOME_SLOT + STATS 30일, 두 슬롯 재고 모두 확보 시만 | PRD §3 표, §7 `fee_plan_bndl` | 신규 묶음 구성 엔터티(`bndl_plan_cd`·`item_plan_cd`) | 2 | 신규 |
| REQ-57 | EXTEND : 만료 7일 전부터, 동일 단가, 재고 미차감, 연속 90일 초과 거절, 이후 7일 쿨다운 | PRD §3 EXTEND, §7 운영 설정 | 연장 체인 = `prnt_ordr_id` 자기참조, 연속 일수 계산 근거. 7·90·7 은 운영 설정(REQ-59) | 2 | 신규 |
| REQ-58 | **기간제 요금 7종**(1개월 30·6개월 180·12개월 365·2년 730·5년 1825·10년 3650·영구 NULL) — MEMBERSHIP 에만 적용, 배타 슬롯은 7일·1개월만. 2년 이상은 `use_yn='N'` 으로 판매 차단(Phase 2+) | PRD §3-1, ROADMAP Phase 2·2+ | `fee_plan` 행 7개(+구독 2) — `use_days`·`lftm_yn`·`use_yn`. 기간제 멤버십 한정 해석 [확인중 : 마스터 — PRD §9 #11] | 2 | 신규 |
| REQ-59 | 운영 설정 단일 출처(코드 상수 금지) : 연장 시작 7일·연속 90일·쿨다운 7일·유예 7일·알림 7/3/1일·멤버십 할인율 10%(하한 1 Pi) | PRD §7 운영 설정 행·하단 주석 | 신규 키-값 설정 엔터티(가칭). 설정 변경 감사 이력 필요 여부 — cafe `sys_cfg_chg_hist` 선례(표준규칙 v2.2) | 2 | 신규 |
| REQ-60 | **구독**(자동결제 없음) : 월 2.7 Pi·연 27 Pi, 기간마다 사용자가 U2A 직접 결제, metadata.type `SITE_MBR`(cafe `CHAT_SUBSCR` 재사용 금지), 가격 잠금 = 갱신 금액이 `prnt_ordr_id` 체인 최초 주문 `ordr_amt_pi`, 해지 = `subscr_cncl_yn='Y'` 표시만(만료까지 ACTIVE). 구독 별도 테이블 없음 | PRD §3-2, §5 주문 상태, §7 `fee_ordr` | `fee_plan.subscr_yn`, `fee_ordr.prnt_ordr_id`·`subscr_cncl_yn`. 체인 최초 주문 탐색 비용 — 루트 주문 ID 반정규화 여부 모델러 판단 | 2 | 신규 |
| REQ-61 | **오픈 프로모션 싱글톤 토글**(cafe `promo_fee_config` 패턴) : 활성 여부·시작·종료. 7일 슬롯만 0 Pi, 프로모 기간 누적 1사이트 1건, 연장 불가, 주문 생성 시 1회 판정해 스냅샷, 유료는 approve 시 재판정, 청구 판정은 캐시 없이 DB 직접 | PRD §3-3, §7 `promo_fee_config` | 신규 싱글톤 엔터티(1행 강제). `fee_ordr.promo_aply_yn` 스냅샷, "1사이트 1건" 판정(부분 UNIQUE 후보). 토글 변경 감사(cafe `promo_fee_audit` 선례) 여부 | 2 | 신규 |
| REQ-62 | 가격 변경 시 기존 구매자는 주문 시점 금액 스냅샷으로 보호(소급 없음) | PRD §3-1 마지막 줄, §3-3 금액 확정 | `fee_ordr.ordr_amt_pi` 스냅샷 필수(NOT NULL) | 2 | 신규 |
| REQ-63 | 멤버십 할인 : 30일 슬롯·PREMIUM30 10% 할인(하한 1 Pi), 오픈 프로모 대상 제외, 슬롯 재고 상한 동일 | PRD §3 MEMBERSHIP, §3-1 금지선 | 주문 금액 계산 근거(정가·할인 구분) 저장 여부 — `list_amt_pi`(정가) vs `ordr_amt_pi`(실결제) | 2 | 신규 |

## 8. 주문·결제 (Phase 2)

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-64 | **전 구매 주문 `fee_ordr`**(슬롯·STATS·멤버십·구독·부가서비스 공통) : `usr_id`·`site_id`(멤버십 NULL)·`fee_plan_cd`·`site_ctgr_cd`(스냅샷)·`ordr_amt_pi`·`promo_aply_yn`·`pymnt_id`·상태·`use_bgn_dtm`/`use_end_dtm`(영구 NULL, `'infinity'` 금지)·`hold_expr_dtm`·`prnt_ordr_id`·`subscr_cncl_yn`·`rvk_rsn_cd` | PRD §7 `fee_ordr` 행, §7 판정 함수 주석 | 신규 엔터티. 상태 컬럼명은 001 판정 2 에 따라 `ordr_sts_cd`(PRD 가칭 `ordr_st_cd` 교정) | 2 | 신규 |
| REQ-65 | 주문 상태 흐름 : HELD→ACTIVE(complete / 0 Pi 즉시) · HELD→EXPIRED(15분) · HELD→CANCELED · ACTIVE→EXPIRED(`use_end_dtm` 경과, 멤버십 +유예) · ACTIVE↔SUSPENDED(계정 제재/복구) · ACTIVE→REVOKED(`rvk_rsn_cd` : 사이트 정지·철회 슬롯 회수, `LFTM_UPGRADE` 영구 전환) · SUSPENDED→EXPIRED · 갱신 = 새 주문 + `prnt_ordr_id` | PRD §5 구매 주문 표 | `ordr_sts_cd` CHECK 6값(HELD·ACTIVE·EXPIRED·CANCELED·SUSPENDED·REVOKED), `rvk_rsn_cd` 코드값 [TBD — 사이트 정지·철회 사유 코드명] | 2 | 신규 |
| REQ-66 | 멤버십 활성 판정 단일 함수 : `ordr_sts_cd='ACTIVE' AND (use_end_dtm IS NULL OR use_end_dtm + 유예일수 > now())` | PRD §7 하단 | 신규 함수(유예일수 = 운영 설정). 계정당 활성 멤버십 조회 인덱스 | 2 | 신규 |
| REQ-67 | 멤버십 수명주기 : 활성 중 추가 구매는 기존 종료일 다음부터 이어붙임, 영구 구매 시 남은 주문 REVOKED(LFTM_UPGRADE), 단건·구독 동시 활성 불가(이어붙여 시작), 유예 중 결제는 유예 일수 차감 | PRD §3-1 수명주기, §3-2 유예 | 계정 단위 기간 겹침 금지 규칙(배제 제약 또는 앱) — 모델러 판단 | 2 | 신규 |
| REQ-68 | 사이트 SUSPENDED·WITHDRAWN(등록자 귀책) → 슬롯 즉시 회수(REVOKED), 환불 없음. 관리자 오인 복구 시 정지 기간만큼 **0 Pi 보상 연장** 주문. 멤버십은 사이트 상태 영향 없음 | PRD §3 정지·철회, §3-1 정지 | 사이트 상태 전이와 주문 상태 연쇄(현 신고 인용 API 는 다중 테이블 트랜잭션 불가 → 보상 처리 패턴, `api/admin/reports/[id]/route.ts:2-3`) — RPC 단일 트랜잭션 권고 여부 모델러 판단. 보상 주문 식별(금액 0·사유) 속성 | 2 | 신규 |
| REQ-69 | **결제 = `pi_pymnt` 승계**(`@pi/db`) + `@pi/payments` 레지스트리(사이트는 자기 `metadata.type` 만 등록, 미등록 type 400, `pi_pymnt` 상태로 멱등). **complete 시 클라이언트 금액 불신, 서버가 `fee_plan` 으로 정가 재계산**(구독 갱신은 체인 최초 금액) | sitemap CLAUDE.md 승계 철칙, PRD_28 §4 `@pi/payments`·결제 레지스트리, PRD §3-2 | ⚠ **As-Is 불일치** : 00_input 은 baseline 에 `pi_pymnt` 가 있다고 했으나 `000_baseline.sql` 판정 5 는 **의도적 제외** — `packages/pi-db/sql/010_pi_pymnt.sql` 로 별도 추가 예정(sitemap Phase 2 착수 조건). 사이트 모델은 `fee_ordr.pymnt_id → pi_pymnt` 참조만 하고 `pi_pymnt` 재정의 금지. 참조 키 타입(UUID vs Pi paymentId TEXT) [TBD — 010 확정 전] | 2 | 신규(공용 010 대기) |
| REQ-70 | 주문 metadata.type : 멤버십 `SITE_MBR` 확정, 슬롯·STATS·PREMIUM30·EXTEND·SPARKLE type 명 미정 | PRD §3-2, PRD_28 §4 | 코드값 등록 대상 [TBD] | 2 | 신규 |
| REQ-71 | 환불 : 원칙 없음(약관), 서비스 종료 시 90일 고지·잔여 일할 환불(영구 10년 상각), 환불 수단 미정(A2U vs 보상 연장만) | PRD §3-1 서비스 종료, §9 #6 | 환불 기록 엔터티 필요 여부 [확인중 : 마스터 — §9 #6]. 확정 전 보상 연장(REQ-68)만 | 2+ | 미정 |
| REQ-72 | 판매 개시 게이트 : 슬롯·STATS = §9 #2 / 멤버십 1·6·12개월·구독 = #2·#7·#8·#9·#10 / 2년 이상 = #6~#10 | PRD §9 판매 개시 게이트 | `fee_plan.use_yn`·`aply_bgn_dtm` 으로 판매 on/off(데이터만 변경) | 2 | 신규 |
| REQ-73 | 만료 알림 : 만료 7·3·1일 전 앱 내 알림(일 1회 배치), Pi 푸시 [확인중 : Pi SDK] | PRD §3-2 알림 | "앱 내 알림" 저장 엔터티(발송 이력·중복 방지) 필요 여부 [TBD] — 화면 계산 표시만으로 충분한지 마스터 확인 | 2 | 미정 |

## 9. 신고

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-75 | 신고 : 로그인 필수, APPROVED 사이트만, 사유 10종(금지 7 + FRAUD·BROKEN·ETC), 내용 1,000자 | PRD §5 신고, 001 `site_rpt`, `api/reports/route.ts`, `site.ts` RPT_RSN | 기존 테이블·CHECK. 사유 코드 확정 [확인중 : legal-compliance-advisor](001 주석) | 1 | 기존 |
| REQ-76 | 신고 상태 RECEIVED→ACCEPTED(사이트 SUSPENDED 동반)/DISMISSED, 처리 일시·내용, 처리자 = `modr_id` | PRD §5, 001 `site_rpt_prcs_dtm_check`, `api/admin/reports/[id]/route.ts` | 기존. 인용↔정지 연쇄가 2-테이블 보상 처리(원자성 없음) — RPC 화 여부 모델러 판단 | 1 | 기존(개선 후보) |
| REQ-77 | 같은 사용자의 같은 사이트 미처리 신고 1건(중복 409) | 001 `ux_site_rpt_site_id_rptr_actv`, `api/reports/route.ts:41-44` | 기존 부분 UNIQUE | 1 | 기존 |

## 10. 통계(VIEW/CLCK)·증감

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-78 | 사이트 일별 조회(상세 조회)·클릭("사이트 방문" 이동 안내 확인) 집계, UTC 일자, 원자적 +1 RPC `fn_inc_stat_site_dly(p_site_id, 'VIEW'|'CLCK')`, 공개 엔드포인트(중복 완화는 앱·가드 rate limit) | PRD §7 조회·클릭 집계, 001 `stat_site_dly`·판정 10, `api/stat/route.ts` | 기존 테이블·RPC. 존재하지 않는 site_id 는 FK 23503 → 404 | 1 | 기존 |
| REQ-79 | 기간 증감 RPC `fn_sel_stat_site_chg(p_days 1/7/30)` — 최근 N일 vs 직전 N일 조회 합(DB 합산, PostgREST 1,000행 회피), 증감률 = 직전 0·현재>0 이면 +100% | PRD §3-4 값, 001 판정 12, `api/bubbles/route.ts:26-27,108` | 기존 RPC + `idx_stat_site_dly_stat_dt` | 1 | 기존 |
| REQ-83 | 상세 조회수 합계 = `stat_site_dly.view_cnt` 앱 합산(사이트당 연 365행), 느려지면 `site_mst` 누계 반정규화 | 001 판정 10, `api/sites/[domain]/route.ts:36-46` | 현 구조 유지, 반정규화는 성능 근거 생길 때 | 1 | 기존 |
| REQ-81 | STATS 리포트(Phase 2) = 일별 조회·클릭·**유입** | PRD §3 STATS, ROADMAP Phase 2 | "유입"(referrer/유입 경로) 집계 속성이 `stat_site_dly` 에 없음 — 유입 차원 정의 [TBD : 마스터] 후 신규 집계 구조 | 2 | 신규 |

## 11. 감사(변경 이력)

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-80 | **심사·신고·결제 상태 변경 이력 보존** | PRD §8 감사 | As-Is(001 판정 11)는 hist 없이 현재값 + `modr_id`/`mod_dtm` 만 — 이전 상태·사유가 **덮어써져 소실**됨 : ① suspend 가 `rjct_rsn_cont` 에 정지 사유 기록, restore 가 NULL 로 지움(`api/admin/sites/[id]/route.ts:76-77`) ② 재제출 시 `rjct_rsn_cd` 초기화(`api/me/sites/[id]/route.ts:99-101`) → OWNERSHIP 반려 근거(REQ-26) 소실 위험 ③ 소유 확인(REQ-28) 미기록 ④ 신고 보상 처리 시 처리 내용 NULL 복원. → 사이트 상태 이력(append-only `_hist`, 001 판정 11 이 예고한 `site_sts_hist`) 신설 필요. 주문 상태 이력·설정 변경 이력(REQ-59·61) 포함 범위 모델러 판단 | 1·2 | 신규 |

## 12. 다국어

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-85 | UI 다국어 = next-intl 메시지 파일(`messages/ko.json`·`en.json`), 초기 ko·en. 코드 표시명은 번역키(`siteCtgr.<cd>`·`plan.<cd>`·반짝임 등) — DB 에 이름 중복 저장 금지(001 판정 3) | PRD §8 다국어, 001 판정 3, `messages/ko.json`(plan·siteCtgr·sparkle 키) | DB 번역 테이블(cafe `i18n_message`) **불필요** — sitemap 은 DB 번역 미사용. 코드 테이블 신설 시에도 표시명 컬럼 대신 번역키 | 1 | 제외(DB) |
| REQ-86 | 사이트 콘텐츠(사이트명·설명)는 등록자 입력 단일 언어 | `site.ts` siteInputSchema(단일 name·desc), PRD 에 다국어 콘텐츠 요구 없음 | 다국어 콘텐츠 컬럼 불필요(현 범위). 필요 시 [확인중 : 마스터] | 1 | 기존 |

## 13. Phase 3 (참고 — 이번 1차 모델 범위 밖, 연결점만 확보)

| REQ | 요구 | 출처 | 데이터 영향 | Phase | As-Is |
|---|---|---|---|---|---|
| REQ-90 | 리뷰 : Pi 계정당 사이트별 1평점 `UNIQUE(site_id, usr_id) WHERE del_yn='N'`, 유료 무관, 평점순 정렬, 신고 연계 | PRD §4 리뷰, §7 `site_rvw`, ROADMAP Phase 3 | 신규 `site_rvw`(Phase 3). 평점순 정렬용 집계 반정규화 후보 | 3 | 신규(보류) |
| REQ-91 | "운영자 확인" 무료 배지 = 도메인 소유 검증 통과 | PRD §3, ROADMAP Phase 3 | REQ-28 저장 결과 재사용 | 3 | 신규(REQ-28 연동) |
| REQ-92 | 허브 기능(페르소나·통합 자산) — 동결, 포함 시 cafe.pi 데이터 연동 | PRD §9 #5, ROADMAP Phase 4 | 모델 반영 금지 | — | 제외 |

---

## 14. 요약 — As-Is 대비 델타

| 구분 | 대상 |
|---|---|
| 기존 유지 | `sys_user`(baseline), `site_mst`(도메인·구분 9종·상태 6종·반려사유 9종·연락처·자사·plan_cd), `site_rpt`, `stat_site_dly`, `fn_inc_stat_site_dly`, `fn_sel_stat_site_chg`, 인덱스·시드 19건 |
| Phase 1 변경·신규 | 이동 URL 속성(REQ-36), 소유 확인 결과 저장(REQ-28), 사이트 상태 변경 이력(REQ-80), 요금제 코드 마스터(정렬순서·배지·면적·색 — 선택, REQ-41~43) |
| Phase 2 신규 | `fee_plan`, `fee_plan_bndl`, `fee_ordr`(+`ordr_sts_cd`), `promo_fee_config`, 운영 설정, 부가서비스 SPARKLE 상품·구매(REQ-55), 멤버십 활성 판정 함수, plan_cd 동기화 규칙, 다건 이미지(REQ-39), STATS 유입 집계(REQ-81), 주문·설정 감사 이력, `pi_pymnt`(공용 010 — 재정의 금지) |
| DB 미저장(제외) | 소유 확인 토큰(HMAC 계산값), 가상 샘플 91개, 레벨 값(파생), 광고 여부(파생), UI 번역 |

## 15. 마스터 확인 필요 목록 (모델러 진행 시 [확인중] 유지)

1. REQ-14 계정 제재(정지) 표현 수단 — baseline `sys_user` 확장(공용 패키지 영향) vs 사이트 측 엔터티
2. REQ-35 "회사명" 이 `site_nm` 과 동일한지(별도 속성 여부)
3. REQ-36 이동 URL 입력 주체(관리자 전용 vs 등록자 입력 + 심사)
4. REQ-45 멤버십(계정 단위) ↔ `plan_cd`(사이트 단위) 대응, 요금제 5단계 기간 ↔ 멤버십 7기간 매핑, REQ-46 PRM1·BSC2 기간 동일 차이
5. REQ-55 반짝임 가격·기간·재고·NONE 사이트 구매 가능 여부
6. REQ-69 `pi_pymnt` 는 baseline 에 없음(010 예정) — 00_input §2 서술 정정 필요, 참조 키 타입 미정
7. REQ-71 환불 기록 엔터티, REQ-73 알림 저장, REQ-81 "유입" 정의
8. REQ-32 보류 4건 사유의 DB 보관 여부
9. PRD §3 REGISTER "사이트 1건 등록" vs 코드 DRAFT+PENDING 5건 상한·멤버십 "등록 5건" — 기본 계정의 승인 사이트 수 상한 정의 불일치 [확인중 : 마스터]
