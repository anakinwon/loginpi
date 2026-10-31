# ROADMAP: sitemap.pi

> 작성일 2026-10-09 · 요구사항 `PRD.md` · 기간은 착수 기준 상대 일정, 착수일 2026-10-09(git 첫 커밋 ccef0860 기준) · 진행 상태 점검 2026-10-13 · 프로세스 다이어그램 `../pfd/`(진행 현황·세션·로그인·연동·세션 판정·멀티사이트 6종)

## 진행률 요약

| Phase | 이름 | 기간 | 상태 |
|---|---|---|---|
| 0 | 선결 | 1주 | **진행중** — 완료 3 · 부분 1(스테이징 env 등록 완료, 도메인·Ignored Build Step 미완) · 미착수 4 |
| 1 | MVP(사용료 디렉터리) | 2주 | **구현 완료 · 스테이징 운용 중** — 실기기 ✅ 로그인(2026-10-11)·사용료 결제 1건(2026-10-12, 마스터 확인)·반짝임 모바일(2026-10-13). 2026-10-13 심사 폐지·사용료 전환 P0~P3 반영, 잔여 P5~P8(크론·문구 개명·문서·운영 승격) |
| 2 | 수익(부가서비스·프리미엄·멤버십·구독) | 2주 | **일부 착수** — 반짝임 부가서비스(합산·단독 결제, sql/013~015) 스테이징 반영·실기기 결제 ✅(2026-10-13) + **버블 이펙트 3종**(궤도·펄스·혜성, sql/017, dev·stg, 시연 3사이트 — 실기기 미검증). 슬롯·STATS·멤버십은 대기(착수 조건 PRD §9 #2 미회신) |
| 2+ | 장기 요금(2년·5년·10년·영구) 개시 | — | 법무·환불 확정 대기 |
| 3 | 신뢰(리뷰·소유 검증) | 2주 | 대기 (수동 소유 검증은 Phase 1 선행 구현 → 2026-10-13 강제 검증 해제(D1), 선택 배지로 전환 — 잔여) |
| 4 | 허브(PRD_27 §2.6) | — | **동결** (마스터 재개 지시 전 착수 금지) |

## Phase 0 — 선결

- [ ] A-6 공식 질의(`.pi` 간 이동·디렉터리 등재) 제출 — pi-mainnet-listing-auditor 질의문 작성 (PRD §9 #1 [확인중])
- [ ] 유료 노출(광고) 판매 허용 여부 질의 (PRD §9 #2 [확인중] — Phase 2 착수 게이트)
- [x] Developer Portal sitemap.pi 앱 등록·도메인 검증, Pi API 키 발급 — testnet 앱 등록·App URL sitemapst.vercel.app·도메인 검증 통과(2026-10-11, 검증 키 커밋 c9ee2fc0). mainnet 앱은 운영 도메인 확정 후
- [x] 별도 Supabase 프로젝트(PostgreSQL) 생성 — cafe.pi DB와 분리(확정). `sitemap_postgres`에 `sitemap_dev`·`sitemap_stg` 스키마 000→002 적용·시드 19(2026-10-11, HANDOFF §3). Data API Exposed schemas 등록 완료(2026-10-11)
- [ ] 독립 웹서버 구축 — **부분** : Vercel 프로젝트 `sitemaps` 배포 성공(Root Directory `sitemap/sitemap.pi`), 스테이징 env 등록 완료(`STAGING_SUPABASE_*`·`PI_API_KEY` 2026-10-12·Google 4종(AUTH_SECRET 포함) — 스테이징 연동 확인 TROUBLESHOOT 2026-10-13), Storage 버킷 `site-img`(nonprod) 생성(2026-10-13). 미완 : `sitemap.pi` 도메인 연결, loginpi 프로젝트 Ignored Build Step `sitemap/**` 제외, 운영 Supabase 프로젝트(sql/012~016 미적용·버킷 미생성) (자체 호스팅 여부 [확인중 : 마스터])
- [x] loginpi 워크스페이스 전환(`pnpm-workspace.yaml` packages `packages/*`·`sitemap/*`) + 루트 `tsconfig.json`·`eslint.config`·`.prettierignore`에 `packages/**`·`sitemap/**` 제외 — PRD_28 Phase 0 (e28ac56f)
- [ ] 약관·금지 카테고리·광고 표시·연락처 처리방침 초안 — legal-compliance-advisor
- [ ] 부가서비스·멤버십·구독 단가와 기간제 적용 해석 마스터 확정(PRD §9 #3·#11)

**완료 기준** : 질의 접수 번호·Pi 앱 ID·환경변수 확보

## Phase 1 — MVP (사용료 디렉터리 — 2026-10-11 v0.8 유료 전환, 구 "무료만")

- [x] Next 앱 스캐폴드(cafe.pi 동일 스택·버전) + 공용 패키지 `@pi/auth`·`@pi/db`·`@pi/guard` 추출·의존(PRD_28 Phase 1, 9e541ea7). `@pi/payments`는 결제가 생기는 Phase 2로 이동
- [x] DDL : `sys_user`·디렉터리 마스터·`site_rpt`·조회·클릭 집계 — `sql/001`(`site_mst`·`site_rpt`·`stat_site_dly`) + `sql/002`(`site_sts_hist`·sys_user 표준 개명 7컬럼), DA 1차 모델 최종 승인(9885408f, `data-model/`)
- [x] 등록 폼(`.pi` 형식 검증·카테고리·소개·회사 로고 300×300 자동 맞춤·요금제·반짝임 옵션·이동 URL) → APPLYING(2026-10-13 심사 폐지, 구 PENDING)
- [x] 관리자 신청 관리(사용 시작·반려 사유·정지·복구·콘텐츠 수정) / 신고 접수·처리 — 심사·승인·소유 확인 단계는 2026-10-13 폐지(결제 완료 → 자동 사용 시작). 테이블·페이징·정렬(비싼 요금제 → 결제일시), 기본 탭 사용중, 결제 배지 툴팁
- [x] 홈·카테고리 목록(페이지네이션·검색)·상세(이동 안내) — 홈은 버블 메인으로 설계 변경(PRD v0.7)
- [x] 우선등록 19개 시드(`own_site_yn=Y`) — **19건 전부 IN_USE 노출 중**(마스터 지시 2026-10-09, sql/012 이행으로 APPROVED → IN_USE). 리스크 플래그 4건(gifticon·omok·yoda·fondation)은 sitemap.pi 등재 제출 전 재검토(OPS_SETUP §4). 구 문구 "15 APPROVED·3 PENDING·fondation 보류"는 폐기
- [x] 상세 조회수 합계 (`/api/stat`, `fn_inc_stat_site_dly`)
- [ ] 보안 점검 — kisa-web-security-auditor. **부분** : 2026-10-09 재점검 조치(`ADMIN_PI_UIDS` 필수·비운영 DB 운영 폴백 차단)는 반영됨, 업로드·신고·검색 입력 공식 점검 기록 없음

**완료 기준** : Pi Browser 실기기에서 로그인 → 등록 → 결제 → 사용 시작 → 목록·상세·방문 버튼 동작, `pnpm build` 통과
→ `pnpm build`·`tsc` 통과. **실기기 ✅** 로그인(스테이징 2026-10-11) · 사용료 결제 1건(2026-10-12, PI_API_KEY 교정 후 — 마스터 확인 "결제는 성공했어", pi_pymnt COMPLETED) · 반짝임 모바일 효과(2026-10-13). Google 실왕복·연동 ✅(스테이징 env 2026-10-12, 연동 판정 3상태 수정 2026-10-13). 잔여 실기기 : 사용 시작 → 목록·상세·방문, 로고 업로드, 반짝임 부가서비스 결제(합산·단독)

**후속 (HANDOFF 2026-10-11 §4, Phase 1 완료 전 처리)**

- [x] 스테이징 `/api/sites` 503 `DB_UNAVAILABLE` 해소 — 원인 Supabase Exposed schemas 미등록(`PGRST106`), 2026-10-11 등록 완료. 스테이징 Vercel env 등록·Redeploy 확인은 독립 웹서버 항목에서 추적
- [ ] 자격증명 교체 — **부분** : `service_role` 회전 키로 로컬 `.env.local` 교체(2026-10-13, 재발급 시점 [확인중 : 마스터]). 잔여 : DB 비밀번호(이전 값 대화 노출) 재발급, 로컬 `PI_API_KEY` 무효(2026-10-12 실측, Vercel 만 교정 — 로컬 결제 테스트 불가)
- [ ] `public` 스키마에 남은 동일 구조 테이블 5개(`schema_migrations` 없음, 마이그레이션 도구 외 생성) 처리 방침 — 운영 선행이면 유지, 아니면 삭제 [확인중 : 마스터]
- [ ] 데이터 모델 §10 후속 — ② 신고 RPC 전환 ✅(2026-10-11, `fn_prcs_site_rpt` 호출·보상 코드 삭제), ③ `site_mv_url` 입력 ✅(2026-10-11, 스키마 `mvUrl`·등록/수정 저장·공개 컬럼 — 폼 입력란·상세 이동 버튼 반영은 ④와 함께), ④ 버블 URL 대체 ✅(2026-10-11, `site_mv_url` 우선·정적 폴백 유지 + 등록 폼 입력란·상세 이동 버튼 반영), ⑤ OWNERSHIP 재제출 확장
- [ ] DA 미결 — #18(cafe DB 개명 선행 여부), 정본 개정 제안 P-1~P-7·D-2(데이터 모델 §12) [확인중 : 마스터]
- [x] **승인 전 요금 결제**(마스터 지시 2026-10-11, PRD v0.8) — pi-db/010 `pi_pymnt` · sitemap/004 `fee_plan` + `site_mst.pymnt_id`, 결제 API prepare/approve/complete(metadata.type `SITE_REG`), 승인 게이트 402 `PAYMENT_REQUIRED`(2026-10-13 심사 폐지로 폐기), 폼 요금제 선택. 실기기 결제 ✅ 2026-10-12
- [x] **결제 경로 보강 + 전용 결제 페이지 `/pay/<siteId>`**(2026-10-11 밤, 적대적 검증 블로커 6건 반영 — `../../../docs/HANDOFF.md` §6) — approve "조회→검증→원장→승인" 순서, complete 원장 선조회 + sql/005 RPC `p_usr_id`, `POST /api/payments/cancel`, `PAYABLE_STS` 공용, 철회 잠금(APPROVED 원장), 결제 버튼 `isInPiBrowser` 가드, 관리자 단가 0 허용, `GET /api/me/sites/<id>`. 내 사이트는 결제 링크·제출 직후 자동 이동. ✅ **실기기 결제 1건 성공(2026-10-12, 마스터 확인)** — 타임아웃 원인은 Vercel `PI_API_KEY` 무효(401), `scripts/pi-key-probe.mjs` 로 진단(TROUBLESHOOT 2026-10-12)

**2026-10-13 마스터 지시 묶음(스테이징 반영, PRD v0.9)**

- [x] **심사 폐지·사용료 전환 P0~P3**(정본 `PRD_USAGE_FEE_STATE.md` v0.2c, sql/012 DA 승인, 0e150859) — 신청 상태 9종(APPLYING·PAID·IN_USE·USED·EXPIRED·REJECTED·SUSPENDED·WITHDRAWN·DRAFT), sys_cfg 타이머(결제 1h·사용 시작 지연 1h·재등록 12h), RPC `fn_cmpl_site_reg_pymnt`·`fn_bgn_site_use`, 관리자 액션 start/reject/suspend/restore, 재등록·쿨다운·결제 경계 가드, 금지 카테고리 반려 도메인 재신청 차단(D2, 4a758cda). stg DB 적용(IN_USE 20)
- [x] **P4** 운영 설정(2026-10-13) — `src/lib/cfg.ts`·`/api/admin/cfg`·관리자 "운영 설정" 탭·`/api/fee-plans` cfg 동봉·안내 문구 실제 시간(h). 변경 감사 `sys_cfg_chg_hist` 는 후속. 반짝임 부가서비스 결제 실기기 ✅(마스터 2026-10-13)
- [x] **P5** 크론(2026-10-13) — `/api/cron/site-sts-sweep`(vercel.json `*/5`, Bearer `CRON_SECRET` fail-closed, 4전이 + 진행 중 결제 txid 가드, 멱등). stg 수동 실측 4전이·skip·401 ✅. 운영 `CRON_SECRET` 은 PAID 탭 검토 뒤 등록(OPS_SETUP §6-1)
- [ ] 사용료 전환 잔여 — **P6** '심사비' 문구 전수 개명 → **P7** 문서 → **P8** 실기기(설정 0.05h 전 구간) + **운영 DB sql/012~016 적용과 `prod/sitemap` 승격을 한 창**. ⚠ 운영 크론 가동(P8 CRON_SECRET 등록) 전까지 PAID→IN_USE 는 관리자 "사용 시작" 수동
- [x] **요금 재편·명칭 확정**(sql/014~016, fa6ade8b·4cc53c1f) — 기본·골드·프리미엄·플래티넘·VIP, 약정 1·3·6·12·24개월, 사용료 10·25·45·80·130, 반짝임 2·5·9·16·26 Pi, 할인율 소수 2자리, 화면 총수(PLAN_CAP) 110 → 90
- [x] 빈 버블 안내 `/ad` 개편(19b559ea) — "내 비지니스를 등록하자!" 문구, 요금제 콤보 + 남은 수량(`PLAN_CAP` − 점유), 0 이면 미노출, `/api/fee-plans` `remaining`
- [x] 회사 로고 300×300(`logo.ts`·`logo-field.tsx`, 중앙 자르기 PNG) + 관리자 콘텐츠 수정(`PATCH action=edit`) + Storage 버킷 `site-img` 스크립트(2575d96d). 실기기 로고 업로드 검증 대기
- [x] 관리 화면 테이블·페이징(20/50/100)·정렬(31974344·3eb13a29), 기본 탭 사용중·열 7개·결제 배지 툴팁·요금제명 `++`(1c759d23)
- [x] 외부 이동 아이보리 3D 카드(사이트 설명 본문, 0098e438) · Google 연동 판정 3상태(DB 오류 ≠ 미연동, f745cc35·87b4fa52) · 반짝임 모바일 정적 수정(e1bec1eb, 실기기 ✅)
- [ ] 마스터 결정 대기 [확인중 : 마스터] — 금지 카테고리 반려 도메인 **전역 차단** 여부(현재 4a758cda 는 본인·같은 도메인 판정, 설계 권장 전역 — PRD_USAGE_FEE_STATE D2) · `/slot` 콤보 선택 요금제를 `/my` 폼에 전달(현재 미전달) · 반짝임 결제 후 관리자 해제 시 환불 정책(현재 환불 없음, teamanakin-admin 지적 2026-10-13)

## Phase 2 — 수익

- [x] **반짝임 부가서비스(SPARKLE)**(마스터 지시 2026-10-13, fa6ade8b, PRD_USAGE_FEE_STATE §10) — sql/013 `site_mst.spk_yn·spk_pymnt_id·spk_pay_dtm` + `fee_plan` SPARKLE × 요금제 + RPC `fn_cmpl_site_spk_pymnt`(DA 조건부 승인 반영), 신청·수정·관리자 폼 선택, 사용료 합산 결제(prepare REG + `metadata.spk`)·사용 중 단독 결제(`/pay?kind=spk`, `SITE_SPK`), approve 정가 재계산·spk 일치 검증, 철회·정지 가드 두 결제 유형, 결제 사이트(자사는 토글)만 버블 반짝임. 적대적 리뷰 반영(sql/014 RPC 상태 게이트 제거·철회/정지 가드 두 결제 유형·관리자 토글 보존). **실기기 결제(합산·단독) 검증 대기**
- [x] **버블 이펙트 부가서비스(EFFECT)**(마스터 지시 2026-10-13, PRD_01 §3-1 채택, 정본 `PRD_02_EFCT.md`) — sql/017 `site_mst.efct_cd·efct_pymnt_id·efct_pay_dtm` + `fee_plan` EFFECT × 요금제(15% [확인중]) + RPC `fn_cmpl_site_efct_pymnt`·`fn_cmpl_site_reg_pymnt` 재정의(DA 조건부 승인 반영 — EFCT 4자 예외 등재), 렌더 3종 `src/components/effects`(궤도 토성형 타원 고리+마스크 위성·펄스 SMIL 링·혜성 대시 테이퍼 꼬리, CSS transform 애니메이션 금지 철칙, 스타일은 globals.css), 신청·수정·관리자 콤보, 합산(`metadata.efct`)·단독(`/pay?kind=efct`, `SITE_EFCT`) 결제, 시연 barista 🪐·seminar 💓·gifticon ☄ 미결제 예외(`EFCT_TRIAL_DOMAINS`). dev·stg 적용. **Pi Browser 실기기 미검증**
- [ ] 공용 패키지 `@pi/payments` 추출(cafe.pi `pi-pay-button`·`api/payments/approve·complete` 출처) — Phase 1에서 이동
- [ ] `010_pi_pymnt.sql`(@pi/db baseline) 선행 → `003_sitemap_phase2.sql`(`fee_plan`·`fee_plan_bndl`·`fee_ordr`·`promo_fee_config` 등 테이블 9) + 시드 — da-governance-expert 리뷰
- [ ] U2A approve/complete — `@pi/payments` 레지스트리에 핸들러 등록(서버 정가 재계산), CTGR_SLOT·HOME_SLOT·EXTEND·STATS·PREMIUM30
- [ ] STATS 리포트(일별 조회·클릭·유입) — STATS·PREMIUM30 판매와 같은 Phase
- [ ] MEMBERSHIP 1·6·12개월 + 월·연 구독(수동 갱신·만료 7/3/1일 알림 배치·유예 7일) — 2년 이상은 `use_yn=N`으로 차단
- [ ] 약관(영구 정의·서비스 종료 환불·자동결제 아님 고지) — legal-compliance-advisor
- [ ] 추천 영역 "광고·추천" 라벨·랜덤 순환·재고 원자 확보(HELD 15분)·자사 구매 차단
- [ ] 오픈 프로모션 토글 — pricing-promo-manager 검토

**착수 조건** : Phase 0 질의(유료 노출 허용, PRD §9 #2) 회신 확보. 멤버십·구독은 추가로 PRD §9 #7(자동결제 오인 문구)·#8·#9·#10 회신 후 판매 개시

**완료 기준** : 실기기 Pi 결제 1건(슬롯)·멤버십 구매 1건·구독 갱신 1건(`prnt_ordr_id` 체인)·유예 7일 동작 확인 + pi-mainnet-listing-auditor 재점검 통과

## Phase 2+ — 장기 요금 개시

- [ ] 2년·5년·10년·영구 판매 개시(`use_yn=Y`)

**착수 조건** : PRD §9 #6~#10 전부 확정(환불 수단·등재 심사 문구·선불전자지급수단·계속거래·영구 표시)

## Phase 3 — 신뢰

- [ ] `site_rvw` DDL(da-governance-expert 리뷰) + 리뷰(1인 1평점)·평점순 정렬·신고 연계
- [ ] 리뷰 운영정책 — legal-compliance-advisor
- [ ] 도메인 소유 검증 → "운영자 확인" 무료 배지 — 수동 검증은 Phase 1 선행 구현됐으나 **2026-10-13 심사 폐지로 강제 검증 해제(D1, sql/012 `site_mst_vrf_yn_apv_check` 제거, `OWNERSHIP_NOT_VERIFIED` 폐기)** — 토큰·`vrf_usr_id` 는 선택 배지용으로 유지. 잔여 : 자동 검증(서버 fetch 대조)·배지 노출·OWNERSHIP 재제출 확장(데이터 모델 §10 ⑤)

**완료 기준** : 실기기에서 리뷰 1건·소유 검증 배지 1건 동작

## 리스크

| 리스크 | 대응 |
|---|---|
| A-6 회신이 "외부 이동"으로 판정 | 방문 버튼을 URL 텍스트 표시·복사로 대체(상태 흐름 불변) |
| 유료 노출이 순위 구매로 인식 | 광고 라벨·결제 비반영 정렬·순환·자사 구매 금지 |
| 리스크 플래그 사이트(gifticon·omok·yoda·fondation) 노출 | 마스터 지시(2026-10-09)로 노출 중 — sitemap.pi 등재 제출 전 재검토(상품권·도박 광고 노출이 sitemap.pi 자체 심사 리스크) |
| 하위 앱이 cafe.pi 빌드에 섞임 | **대응 완료** — 루트 tsconfig·eslint·prettier에서 `packages/**`·`sitemap/**` 제외(e28ac56f). Vercel Ignored Build Step은 독립 웹서버 항목에서 추적 |
| 장기 선불 환급 의무(계속거래) | 2년 이상 멤버십 판매를 법무 검토 후로 분리, 서비스 종료 시 일할 환불 약정. **사용료 약정 3~24개월은 이미 스테이징 판매 중 — PRD §9 #8·#9 포함 여부 [확인중 : legal-compliance-advisor]** |
| 공용 패키지 breaking 변경 | 패키지 변경 시 의존 앱 전부 재빌드·실기기 검증(PRD_28 §4) |
| 진행 문서 드리프트 | ROADMAP 체크는 feat 커밋·배포 시점에 같이 갱신(2026-10-09~11 이틀간 0건 체크 사고, 2026-10-12~13 재발 → 2026-10-13 일괄 현행화) |
| 운영 DB 스키마 드리프트 | 운영 Supabase 는 sql/004~011 수동 적용 상태, **012~016 미적용** — 코드만 `prod/sitemap` 승격 시 공개 필터 0건·`spk_*` 조회 실패. 승격과 마이그레이션을 한 창에서, Storage 버킷 `site-img` 도 승격 전 생성 |
| Vercel "success" ≠ 반영 | Ignored Build Step 으로 빈 커밋이 success 로 보고됨(2026-10-12) — 승격·배포 뒤 라이브 번들·API 응답 실측 필수 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-09 | 최초 작성 — Phase 0~4, 완료 기준, 리스크 |
| 2026-10-09 | 검수 반영 — 루트 빌드 격리, 시드 15+1, Phase 2 착수 조건, Phase 3 완료 기준·DDL |
| 2026-10-09 | 팀장 반려 반영 — STATS 리포트를 판매 Phase(2)로 이동 |
| 2026-10-09 | 마스터 지시 반영 — 별도 Supabase·독립 웹서버, 멤버십 기간제·구독, 장기 요금 개시 조건 |
| 2026-10-09 | 검수 반영 — Phase 2+ 진행률 행·위치, Phase 2 이름·착수 게이트·완료 기준(멤버십·구독 갱신·유예), 단가 확정 범위 |
| 2026-10-09 | PRD_28 정합 — 워크스페이스 전환·공용 패키지 추출·리스크 갱신 |
| 2026-10-11 | 실기기 로그인 성공(스테이징) · Portal testnet 앱 등록·도메인 검증 완료 · Google 로그인 통합(sql/003)·로컬 왕복 검증 · 로그인 플레이북·프로세스 다이어그램 연결 |
| 2026-10-11 | 진행 상태 점검 반영 — 진행률 표(Phase 0 진행중·Phase 1 구현 완료), 착수일 확정, 완료 항목 체크(Phase 0 2건·Phase 1 7건), `@pi/payments`를 Phase 2로 이동, 시드 문구 19건 APPROVED로 정정, Phase 3 소유 검증 선행 구현 명시, HANDOFF §4 후속 항목(자격증명 교체·`public` 사본·데이터 모델 §10·DA 미결) 추가 |
| 2026-10-11 | 승인 전 결제 보강 — 적대적 검증 블로커 6건 반영(approve 순서·complete 선조회·cancel API·PAYABLE·isInPiBrowser·단가 0), 전용 결제 페이지 `/pay/<siteId>`, sql/005 |
| 2026-10-11 | 마스터 지시 — 요금제에 기간·1개월 요금 대비 할인율 표시(sql/006 `fee_plan.use_mon_cnt`·`mon_pi_amt`, 서버 계산 `dc_pct`, 폼 선택지·내 사이트·결제 페이지), select 드롭다운 글자색 보정(`select.input option`) |
| 2026-10-11 | 마스터 확정 — 프리미엄1 기간 3년(sql/007, 1개월 대비 50%), 영구 할인 10년 환산 표시(VIP 25%) |
| 2026-10-11 | 마스터 확정 — 프리미엄 단가 조정(sql/008) PRM1 64.8 Pi(40%)·PRM2 90 Pi(50%), 기간 길수록 할인 커지는 순서 복원 |
| 2026-10-11 | 마스터 확정 — 기간 재확정(sql/009) PRM1 2년·PRM2 3년·VIP 5년(영구 폐지), 단가 미조정 |
| 2026-10-11 | 마스터 확정 — 단가 재산정(sql/010) 할인율 6개월 10%·1년 12%·2년 15%·3년 18%·5년 23% → 16.2·31.68·61.2·88.56·138.6 Pi |
| 2026-10-12 | 반짝임 부가서비스 모바일 정적 수정 — SVG transform 대신 stroke-dashoffset·opacity, 움직임 줄이기 모드는 정지 대신 3배 감속(TROUBLESHOOT 2026-10-12). ✅ 모바일 실기기 정상 동작 확인(마스터 2026-10-13), reduce 감속 정책은 마스터 확인 [확인중] |
| 2026-10-12 | 스테이징 결제 타임아웃 해결 — 원인 Vercel `PI_API_KEY` 무효(Pi API 401), `scripts/pi-key-probe.mjs` 신설, ✅ 실기기 사용료 결제 1건 성공(마스터 확인). 일반 브라우저 로그인 복구 — Google env 4종(AUTH_SECRET 포함) 스테이징 등록, Google OAuth redirect_uri 등록 안내 [확인중 : 마스터 등록 완료 시점] |
| 2026-10-13 | 진행 현행화 — 진행률 표(Phase 1 스테이징 운용·Phase 2 일부 착수), 2026-10-13 마스터 지시 묶음 8항목(완료 6 — 심사 폐지·사용료 전환 P0~P3, 요금 재편·명칭 확정, 빈 버블 안내, 로고·관리자 수정, 관리 테이블, 외부 이동 카드·연동 3상태 / 미완 2 — 사용료 전환 잔여 P4~P8, 마스터 결정 대기), Phase 2 반짝임 부가서비스 체크, 사용료 전환 잔여 P4~P8·마스터 결정 대기 항목, 리스크 2건(운영 DB 스키마 드리프트·Vercel success≠반영) 추가 |
| 2026-10-13 | 버블 이펙트 부가서비스 3종(궤도·펄스·혜성) 구축 — 서브에이전트 3(기획·설계·구축) + 팀장 검토, sql/017 dev·stg, 시연 3사이트 미결제 예외, 문서 PRD_02_EFCT·PRD §3·FEE_STATE §11·PRD_01 §3-1 |
| 2026-10-16 | 모바일(Pi Browser) 효과 4종·우주선 모션 동일 적용 — reduce 3배 감속·점프 건너뜀 폐기, 점프 1.4s + 소멸 뒤 0.3s 정지 후 열기, 메인 버블 물리·드래그앤드롭도 reduce 분기 폐기(마스터 지시). PRD v0.9.4·PRD_02_EFCT §3. Pi Browser 실기기 미검증 |
