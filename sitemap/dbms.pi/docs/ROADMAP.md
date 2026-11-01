# ROADMAP: dbms.pi

> 작성일 2026-11-01 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **진행중** |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | 대기 — PRD v1.0 확정 후 |
| 2 | 수익 | 대기 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new dbms.pi --port 3004` (2026-11-01)
- [x] 결정 2건 — 연결 = 별도 DB + schema.pi 연결 API, 로그인 = Pi + Google 연동 예외(마스터 2026-11-01), W4 선착수 예외 기록(ROADMAP_MULTISITE)
- [ ] PRD v1.0 확정(v0.2 작성 2026-11-01 — 남은 확인 5건 : 분류체계 접근 범위·대리 실행·수익·모니터링 이전 시점·상표 점검)
- [ ] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2)
- [ ] pi-nonprod Exposed schemas `dbms_dev`·`dbms_stg` + `db-migrate.mjs --app dbms --tier dev`
- [ ] Vercel 프로젝트(Root Directory `sitemap/dbms.pi`, 운영 브랜치 `prod/dbms`)

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase 1 — MVP

- [ ] 앱 골격(sitemap.pi 복제 지점 — TODO 3단계) · `pnpm build` 통과
- [ ] 모니터링 연결(TODO 7단계)
- [ ] Pi Browser 실기기 로그인·결제
