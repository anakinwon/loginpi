# CLAUDE.md — sitemap.pi

@../../CLAUDE.md

> **우선순위** : 위 루트(loginpi) CLAUDE.md 규칙을 먼저 적용한다. 이 파일은 sitemap.pi 전용 추가 규칙만 담고, 충돌 시 루트를 따른다.
> - 이 파일의 규칙 중 루트보다 **엄격한 제약**(Bean·토큰 어휘 금지와 Pi 직접 가격, 외부 이동 안내, 광고 라벨)은 충돌이 아니라 추가 제약으로 함께 적용한다.
> - cafe.pi 전용 항목(PiRC2 구독 컨트랙트·카페 테마·189 locale·Bean 요금제·Google 세션 등)은 해당 기능을 도입할 때만 적용한다.

Pi Network에서 만들어진 `.pi` 사이트를 등록·홍보하는 디렉터리 서비스.

- 요구사항 정본 : `docs/PRD.md` / 로드맵 : `docs/ROADMAP.md`
- 상위 플랜 : `../../docs/PRD_28_PI_MULTISITE.md`(19개 .pi 멀티사이트, 오라클 멀티테넌트형) — sitemap.pi는 W1 1호. 사이트별 앱·DB·배포 분리 원칙(PRD_28 §1)에 따라 **별도 앱**(별도 DB·독립 웹서버 마스터 확정 2026-10-09). 구 설계 `../../docs/PRD_27_PI_FACTORY.md`는 동결·대체됨

---

## ⭐ 핵심 가치 (최우선)

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**
3. **유료 노출은 항상 "광고" 라벨로 구분되고, 결제는 일반 순위에 영향을 주지 않는다.**

인증·결제·노출 변경은 **Pi Browser 실기기 검증 뒤에만 완료**로 간주한다.

## 승계 철칙 (cafe.pi에서 검증된 규칙 — 위반 시 장애)

- Pi Browser는 `Set-Cookie`를 저장하지 않음 → 인증은 **쿠키 OR `X-Pi-Token` 헤더** 이중 경로, 클라이언트는 `piFetch`
- `getSessionUser()` null 시 **redirect 금지**(무한 루프) → 클라이언트 게이트
- Pi Browser 판정에 UA 사용 금지 — `window.Pi.authenticate()` 성공만 신뢰
- 사람의 불변 키는 `pi_username`(uid는 앱별 scoped 값 — 이 앱은 cafe.pi와 uid가 다름)
- 결제 complete는 클라이언트 금액 불신, 서버가 `fee_plan`으로 정가 재계산
- 가격은 **Pi 직접 표기**, Bean·토큰·코인 어휘 금지(등재 심사 "Pi 외 통화" 레드라인, `../../docs/MAINNET_READINESS_CHECKLIST.md` A-5)
- 외부 사이트 이동은 **사용자 클릭 + 이동 안내** 후에만, 자동 리다이렉트·iframe 삽입 금지(`../../docs/MAINNET_READINESS_CHECKLIST.md` A-6)

## 아키텍처

| 항목 | 결정 |
|---|---|
| 앱 | 이 폴더의 독립 Next.js 앱 — loginpi pnpm 워크스페이스 멤버(`sitemap/*`, `../../docs/PRD_28_PI_MULTISITE.md` §3) |
| 웹서버 | **독립 웹서버(마스터 확정 2026-10-09)** — cafe.pi와 빌드·배포·런타임·도메인 완전 분리. 기본안 별도 Vercel 프로젝트(Root Directory = `sitemap/sitemap.pi`, 운영 브랜치 `prod/sitemap`), 자체 호스팅(VM·컨테이너) 여부 [확인중 : 마스터] |
| Pi | 별도 Developer Portal 앱·API 키 |
| DB | **별도 Supabase 프로젝트의 PostgreSQL(마스터 확정 2026-10-09)** — 운영은 전용 프로젝트, 개발·스테이징은 공유 `pi-nonprod` 프로젝트의 `sitemap_dev`·`sitemap_stg` 스키마(PRD_28 §5), cafe.pi DB와 공유하지 않음, RLS 비활성 + 서버 전용 SERVICE_ROLE_KEY(cafe.pi 패턴) |
| 공용 코드 | **워크스페이스 패키지 의존**(`@pi/auth`·`@pi/db`·`@pi/guard`·`@pi/payments`, PRD_28 §4 — 복제 금지). 출처 : `pi-session-crypto`·`pi-fetch`·`auth-check`(getSessionUser·isAdmin)·`api/auth/pi`·`pi-pay-button`·`api/payments/approve·complete` |
| 기술 스택 | cafe.pi와 동일 버전(Next 16 · React 19 · Tailwind v4 · shadcn base-nova · next-intl v4 · zod 4) |
| DA | `../../docs/da/데이터표준규칙.md` 적용(시스템 컬럼 4개·`del_yn` 논리삭제·물리 DELETE 금지). 공통 테이블(`sys_user`·`pi_pymnt`)은 `@pi/db` baseline 승계(PRD_28 §4) |

## 작업 팀

teamAnakin(`../../.claude/agents/teamAnakin/`) 단계 운용을 기본으로 하고, 도메인 판단은 보강 인원에 맡긴다.

| 구분 | 에이전트 | 역할 | 호출 시점 |
|---|---|---|---|
| 팀장 | teamanakin-admin | 취합·검토·승인 | 팀원이 실행된 모든 턴의 마지막 |
| 단계 | anakin_phase-collect / decide / verify / review / commit | 수집 / 결론 / 실행 검증 / 문서 검수 / 커밋 | 단계 전환 시 |
| 보강 | pi-mainnet-listing-auditor | A-6 질의·광고 라벨·어휘 심사 | Phase 0, Phase 2 출시 전 게이트 |
| 보강 | pricing-promo-manager | `fee_plan` 단가·프로모 토글·자사 구매 금지 규칙 | Phase 2 설계 |
| 보강 | legal-compliance-advisor | 약관·금지 카테고리·광고 표시·연락처·리뷰 운영정책 | Phase 0, Phase 3 |
| 보강 | da-governance-expert | DDL 리뷰(접두사·시스템 컬럼·`fee_`·`ordr` 명명) | DDL이 생기는 Phase마다(1·2·3) |
| 보강 | kisa-web-security-auditor | URL 입력·이미지 업로드·신고 API 점검 | Phase 1 출시 전 |
| 보강 | prd-roadmap-consultant | PRD·ROADMAP 갱신 | Phase 경계 |

## 명령어 (Phase 1 스캐폴드 후 유효)

```bash
pnpm dev | pnpm build | pnpm lint | pnpm tsc --noEmit | pnpm format
```

라우트·API 변경 커밋 전 최소 관문은 `pnpm build`.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-09 | 최초 작성 — 별도 앱 결정, 승계 철칙, 팀 구성(teamAnakin + 보강 6) |
| 2026-10-09 | 검수 반영 — sql/173 공유 범위 정정, 근거 문서 인용, 보강 인원 호출 시점 정정 |
| 2026-10-09 | 팀장 반려 반영 — 별도 앱을 결론 단계 판단·[확인중 : 마스터]로 정정, Pi 외 통화 근거를 체크리스트 A-5로 정정 |
| 2026-10-09 | 마스터 확정 반영 — 별도 Supabase(PostgreSQL)·독립 웹서버, 별도 앱 확정 |
| 2026-10-09 | 루트 loginpi/CLAUDE.md를 `@../../CLAUDE.md` import로 우선 적용, 우선순위·추가 제약·cafe.pi 전용 항목 원칙 명시 |
| 2026-10-09 | PRD_28 정합 — 워크스페이스 멤버·공용 패키지 의존(복제 폐기)·운영 브랜치·비운영 스키마 |
| 2026-10-09 | PRD_28 v0.2 정합 — 배경을 PRD_28로 교체, sql/173 공유 전제 삭제 |
| 2026-10-09 | 마스터 지시 — 메인 화면 버블(PRD §3-4) : 요금제 7종 크기(`site_mst.plan_cd`), 유료 노출이므로 버블마다 "광고"·요금제 배지 필수, DB 미연결 시 sites.json 폴백 |
| 2026-10-09 | 마스터 지시 — 요금제 5단계(VIP·PRM2·PRM1·BSC2·BSC1, 면적 ×2 등비), 가상 샘플 91개는 데모 전용(DB 미시드·`SITEMAP_SHOW_SAMPLES=1`·"샘플" 배지·상세 이동 없음), 버블 글자 9px 하한·표시 단계 |
