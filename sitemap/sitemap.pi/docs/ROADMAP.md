# ROADMAP: sitemap.pi

> 작성일 2026-10-09 · 요구사항 `PRD.md` · 기간은 착수 기준 상대 일정, 착수일 2026-10-09(git 첫 커밋 ccef0860 기준) · 진행 상태 점검 2026-10-11 · 프로세스 다이어그램 `../pfd/`(진행 현황·세션·로그인·연동·세션 판정·멀티사이트 6종)

## 진행률 요약

| Phase | 이름 | 기간 | 상태 |
|---|---|---|---|
| 0 | 선결 | 1주 | **진행중** — 완료 3 · 부분 1 · 미착수 4 |
| 1 | MVP(무료 디렉터리) | 2주 | **구현 완료 · 실기기 검증 대기** — 7/8, `pnpm build` 통과(2026-10-11) |
| 2 | 수익(부가서비스·프리미엄·멤버십·구독) | 2주 | 대기 (착수 조건 PRD §9 #2 미회신) |
| 2+ | 장기 요금(2년·5년·10년·영구) 개시 | — | 법무·환불 확정 대기 |
| 3 | 신뢰(리뷰·소유 검증) | 2주 | 대기 (소유 검증은 수동 방식이 Phase 1에 선행 구현됨) |
| 4 | 허브(PRD_27 §2.6) | — | **동결** (마스터 재개 지시 전 착수 금지) |

## Phase 0 — 선결

- [ ] A-6 공식 질의(`.pi` 간 이동·디렉터리 등재) 제출 — pi-mainnet-listing-auditor 질의문 작성 (PRD §9 #1 [확인중])
- [ ] 유료 노출(광고) 판매 허용 여부 질의 (PRD §9 #2 [확인중] — Phase 2 착수 게이트)
- [x] Developer Portal sitemap.pi 앱 등록·도메인 검증, Pi API 키 발급 — testnet 앱 등록·App URL sitemapst.vercel.app·도메인 검증 통과(2026-10-11, 검증 키 커밋 c9ee2fc0). mainnet 앱은 운영 도메인 확정 후
- [x] 별도 Supabase 프로젝트(PostgreSQL) 생성 — cafe.pi DB와 분리(확정). `sitemap_postgres`에 `sitemap_dev`·`sitemap_stg` 스키마 000→002 적용·시드 19(2026-10-11, HANDOFF §3). Data API Exposed schemas 등록 완료(2026-10-11)
- [ ] 독립 웹서버 구축 — **부분** : Vercel 프로젝트 `sitemaps` 배포 성공(Root Directory `sitemap/sitemap.pi`). 미완 : `sitemap.pi` 도메인 연결, loginpi 프로젝트 Ignored Build Step `sitemap/**` 제외, 스테이징 Vercel env(`STAGING_SUPABASE_*`·`APP_TIER`·`SUPABASE_SCHEMA`) 등록 확인 (자체 호스팅 여부 [확인중 : 마스터])
- [x] loginpi 워크스페이스 전환(`pnpm-workspace.yaml` packages `packages/*`·`sitemap/*`) + 루트 `tsconfig.json`·`eslint.config`·`.prettierignore`에 `packages/**`·`sitemap/**` 제외 — PRD_28 Phase 0 (e28ac56f)
- [ ] 약관·금지 카테고리·광고 표시·연락처 처리방침 초안 — legal-compliance-advisor
- [ ] 부가서비스·멤버십·구독 단가와 기간제 적용 해석 마스터 확정(PRD §9 #3·#11)

**완료 기준** : 질의 접수 번호·Pi 앱 ID·환경변수 확보

## Phase 1 — MVP (무료만)

- [x] Next 앱 스캐폴드(cafe.pi 동일 스택·버전) + 공용 패키지 `@pi/auth`·`@pi/db`·`@pi/guard` 추출·의존(PRD_28 Phase 1, 9e541ea7). `@pi/payments`는 결제가 생기는 Phase 2로 이동
- [x] DDL : `sys_user`·디렉터리 마스터·`site_rpt`·조회·클릭 집계 — `sql/001`(`site_mst`·`site_rpt`·`stat_site_dly`) + `sql/002`(`site_sts_hist`·sys_user 표준 개명 7컬럼), DA 1차 모델 최종 승인(9885408f, `data-model/`)
- [x] 등록 폼(`.pi` 형식 검증·카테고리·소개·이미지 업로드) → PENDING
- [x] 관리자 심사(승인·반려 사유) / 신고 접수·처리 — 승인 시 도메인 소유 수동 확인(`sitemap-verify.txt` 토큰) 포함
- [x] 홈·카테고리 목록(페이지네이션·검색)·상세(이동 안내) — 홈은 버블 메인으로 설계 변경(PRD v0.7)
- [x] 우선등록 19개 시드(`own_site_yn=Y`) — **19건 전부 APPROVED 노출 중**(마스터 지시 2026-10-09). 리스크 플래그 4건(gifticon·omok·yoda·fondation)은 sitemap.pi 등재 제출 전 재검토(OPS_SETUP §4). 구 문구 "15 APPROVED·3 PENDING·fondation 보류"는 폐기
- [x] 상세 조회수 합계 (`/api/stat`, `fn_inc_stat_site_dly`)
- [ ] 보안 점검 — kisa-web-security-auditor. **부분** : 2026-10-09 재점검 조치(`ADMIN_PI_UIDS` 필수·비운영 DB 운영 폴백 차단)는 반영됨, 업로드·신고·검색 입력 공식 점검 기록 없음

**완료 기준** : Pi Browser 실기기에서 로그인 → 등록 → 승인 → 목록·상세·방문 버튼 동작, `pnpm build` 통과
→ `pnpm build`·`tsc` 통과(2026-10-11). **Pi Browser 실기기 로그인 ✅ 2026-10-11**(스테이징 sitemapst.vercel.app, Portal testnet 앱 등록·도메인 검증·`NEXT_PUBLIC_PI_SANDBOX=true` 후 성공). Google 실왕복·연동 ✅(로컬). 잔여 : 실기기 등록 → 승인 → 목록·상세·방문 흐름

**후속 (HANDOFF 2026-10-11 §4, Phase 1 완료 전 처리)**

- [x] 스테이징 `/api/sites` 503 `DB_UNAVAILABLE` 해소 — 원인 Supabase Exposed schemas 미등록(`PGRST106`), 2026-10-11 등록 완료. 스테이징 Vercel env 등록·Redeploy 확인은 독립 웹서버 항목에서 추적
- [ ] 자격증명 교체 — DB 비밀번호(이전 값 대화 노출) + `service_role` 키(2026-10-11 대화 노출) 재발급 후 `.env.local`·Vercel env 갱신
- [ ] `public` 스키마에 남은 동일 구조 테이블 5개(`schema_migrations` 없음, 마이그레이션 도구 외 생성) 처리 방침 — 운영 선행이면 유지, 아니면 삭제 [확인중 : 마스터]
- [ ] 데이터 모델 §10 후속 — ② 신고 RPC 전환 ✅(2026-10-11, `fn_prcs_site_rpt` 호출·보상 코드 삭제), ③ `site_mv_url` 입력 ✅(2026-10-11, 스키마 `mvUrl`·등록/수정 저장·공개 컬럼 — 폼 입력란·상세 이동 버튼 반영은 ④와 함께), ④ 버블 URL 대체 ✅(2026-10-11, `site_mv_url` 우선·정적 폴백 유지 + 등록 폼 입력란·상세 이동 버튼 반영), ⑤ OWNERSHIP 재제출 확장
- [ ] DA 미결 — #18(cafe DB 개명 선행 여부), 정본 개정 제안 P-1~P-7·D-2(데이터 모델 §12) [확인중 : 마스터]

## Phase 2 — 수익

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
- [ ] 도메인 소유 검증 → "운영자 확인" 무료 배지 — **수동 검증은 Phase 1 선행 구현**(승인 시 관리자가 `sitemap-verify.txt` 토큰 확인, `vrf_usr_id` 기록, 미확인 시 `OWNERSHIP_NOT_VERIFIED`). 잔여 : 자동 검증(서버 fetch 대조)·배지 노출·OWNERSHIP 재제출 확장(데이터 모델 §10 ⑤)

**완료 기준** : 실기기에서 리뷰 1건·소유 검증 배지 1건 동작

## 리스크

| 리스크 | 대응 |
|---|---|
| A-6 회신이 "외부 이동"으로 판정 | 방문 버튼을 URL 텍스트 표시·복사로 대체(상태 흐름 불변) |
| 유료 노출이 순위 구매로 인식 | 광고 라벨·결제 비반영 정렬·순환·자사 구매 금지 |
| 리스크 플래그 사이트(gifticon·omok·yoda·fondation) 노출 | 마스터 지시(2026-10-09)로 노출 중 — sitemap.pi 등재 제출 전 재검토(상품권·도박 광고 노출이 sitemap.pi 자체 심사 리스크) |
| 하위 앱이 cafe.pi 빌드에 섞임 | **대응 완료** — 루트 tsconfig·eslint·prettier에서 `packages/**`·`sitemap/**` 제외(e28ac56f). Vercel Ignored Build Step은 독립 웹서버 항목에서 추적 |
| 장기 선불 환급 의무(계속거래) | 2년 이상 판매를 법무 검토 후로 분리, 서비스 종료 시 일할 환불 약정 |
| 공용 패키지 breaking 변경 | 패키지 변경 시 의존 앱 전부 재빌드·실기기 검증(PRD_28 §4) |
| 진행 문서 드리프트 | ROADMAP 체크는 feat 커밋·배포 시점에 같이 갱신(2026-10-09~11 이틀간 0건 체크 사고) |

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
