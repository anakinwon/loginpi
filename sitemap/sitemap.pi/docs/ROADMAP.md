# ROADMAP: sitemap.pi

> 작성일 2026-10-09 · 요구사항 `PRD.md` · 기간은 착수 기준 상대 일정, 착수일 [확인중 : 마스터]

## 진행률 요약

| Phase | 이름 | 기간 | 상태 |
|---|---|---|---|
| 0 | 선결 | 1주 | 대기 |
| 1 | MVP(무료 디렉터리) | 2주 | 대기 |
| 2 | 수익(부가서비스·프리미엄·멤버십·구독) | 2주 | 대기 |
| 2+ | 장기 요금(2년·5년·10년·영구) 개시 | — | 법무·환불 확정 대기 |
| 3 | 신뢰(리뷰·소유 검증) | 2주 | 대기 |
| 4 | 허브(PRD_27 §2.6) | — | **동결** (마스터 재개 지시 전 착수 금지) |

## Phase 0 — 선결

- [ ] A-6 공식 질의(`.pi` 간 이동·디렉터리 등재) 제출 — pi-mainnet-listing-auditor 질의문 작성
- [ ] 유료 노출(광고) 판매 허용 여부 질의
- [ ] Developer Portal sitemap.pi 앱 등록·도메인 검증, Pi API 키 발급
- [ ] 별도 Supabase 프로젝트(PostgreSQL) 생성 — cafe.pi DB와 분리(확정)
- [ ] 독립 웹서버 구축 — 기본안 별도 Vercel 프로젝트(Root Directory `sitemap/sitemap.pi`)·sitemap.pi 도메인 연결, loginpi Vercel 프로젝트 Ignored Build Step에 `sitemap/**` 제외 (자체 호스팅 여부 [확인중 : 마스터])
- [ ] loginpi 워크스페이스 전환(`pnpm-workspace.yaml` packages `packages/*`·`sitemap/*`) + 루트 `tsconfig.json`·`eslint.config`·`.prettierignore`에 `packages/**`·`sitemap/**` 제외 — PRD_28 Phase 0
- [ ] 약관·금지 카테고리·광고 표시·연락처 처리방침 초안 — legal-compliance-advisor
- [ ] 부가서비스·멤버십·구독 단가와 기간제 적용 해석 마스터 확정(PRD §9 #3·#11)

**완료 기준** : 질의 접수 번호·Pi 앱 ID·환경변수 확보

## Phase 1 — MVP (무료만)

- [ ] Next 앱 스캐폴드(cafe.pi 동일 스택·버전) + 공용 패키지 `@pi/auth`·`@pi/db`·`@pi/guard`·`@pi/payments` 추출·의존(PRD_28 Phase 1)
- [ ] DDL : `sys_user`·디렉터리 마스터·`site_rpt`·조회·클릭 집계 — da-governance-expert 리뷰
- [ ] 등록 폼(`.pi` 형식 검증·카테고리·소개·이미지 업로드) → PENDING
- [ ] 관리자 심사(승인·반려 사유) / 신고 접수·처리
- [ ] 홈·카테고리 목록(페이지네이션·검색)·상세(이동 안내)
- [ ] 우선등록 19개 시드(`own_site_yn=Y`) — 15개 APPROVED, 보류 3개 PENDING, fondation은 어휘 정비 확인 후 승인
- [ ] 상세 조회수 합계
- [ ] 보안 점검 — kisa-web-security-auditor

**완료 기준** : Pi Browser 실기기에서 로그인 → 등록 → 승인 → 목록·상세·방문 버튼 동작, `pnpm build` 통과

## Phase 2 — 수익

- [ ] `fee_plan`·`fee_plan_bndl`·`fee_ordr`·`promo_fee_config` DDL + 시드 — da-governance-expert 리뷰
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
- [ ] 도메인 소유 검증 → "운영자 확인" 무료 배지

**완료 기준** : 실기기에서 리뷰 1건·소유 검증 배지 1건 동작

## 리스크

| 리스크 | 대응 |
|---|---|
| A-6 회신이 "외부 이동"으로 판정 | 방문 버튼을 URL 텍스트 표시·복사로 대체(상태 흐름 불변) |
| 유료 노출이 순위 구매로 인식 | 광고 라벨·결제 비반영 정렬·순환·자사 구매 금지 |
| 보류 사이트(gifticon·omok·yoda) 노출 | PENDING 유지, 심사 체크리스트로 차단 |
| 하위 앱이 cafe.pi 빌드에 섞임 | 루트 tsconfig·eslint·prettier에서 `packages/**`·`sitemap/**` 제외, Vercel 변경 없는 앱 자동 빌드 생략 |
| 장기 선불 환급 의무(계속거래) | 2년 이상 판매를 법무 검토 후로 분리, 서비스 종료 시 일할 환불 약정 |
| 공용 패키지 breaking 변경 | 패키지 변경 시 의존 앱 전부 재빌드·실기기 검증(PRD_28 §4) |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-09 | 최초 작성 — Phase 0~4, 완료 기준, 리스크 |
| 2026-10-09 | 검수 반영 — 루트 빌드 격리, 시드 15+1, Phase 2 착수 조건, Phase 3 완료 기준·DDL |
| 2026-10-09 | 팀장 반려 반영 — STATS 리포트를 판매 Phase(2)로 이동 |
| 2026-10-09 | 마스터 지시 반영 — 별도 Supabase·독립 웹서버, 멤버십 기간제·구독, 장기 요금 개시 조건 |
| 2026-10-09 | 검수 반영 — Phase 2+ 진행률 행·위치, Phase 2 이름·착수 게이트·완료 기준(멤버십·구독 갱신·유예), 단가 확정 범위 |
| 2026-10-09 | PRD_28 정합 — 워크스페이스 전환·공용 패키지 추출·리스크 갱신 |
