# ROADMAP: seminar.pi

> 작성일 2026-10-24 · 요구사항 `PRD.md` · 공통 단계 정본 [TODO 목록](../../multitenant_create_TODO-List.md)

## 진행률 요약

| Phase | 이름 | 상태 |
|---|---|---|
| 0 | 선결(결정·환경·포털·DB) | **진행중** |
| 1 | MVP(로그인 + 고유 기능 1개 + 결제 1개) | 대기 — PRD v1.0 확정 후 |
| M | 자체 미디어 서버 S0~S4(DECISION_01 7.3) | **S0 준비** — 단계별 통과 기준, 건너뛰기 금지 |
| 2 | 수익 | 대기 |
| 3 | 등재(A-1~A-7·실기기) | 대기 |

## Phase 0 — 선결

- [x] 설정 한 세트 생성 — `node scripts/tenant-env.mjs new seminar.pi --port 3003` (2026-10-24)
- [ ] PRD v1.0 확정(4절 로그인·5절 기능·8절 수익)
- [ ] Pi Developer Portal testnet 앱 등록 · API 키 · 도메인 검증 (ENV_GUIDE 3.2)
- [ ] pi-nonprod Exposed schemas `seminar_dev`·`seminar_stg` + `db-migrate.mjs --app seminar --tier dev`
- [ ] Vercel 프로젝트(Root Directory `sitemap/seminar.pi`, 운영 브랜치 `prod/seminar`)

**완료 기준** : PRD v1.0 · Pi 앱 ID · 비운영 DB · 스테이징 URL

## Phase 1 — MVP

- [ ] 앱 골격(sitemap.pi 복제 지점 — TODO 3단계) · `pnpm build` 통과
- [ ] 모니터링 연결(TODO 7단계)
- [ ] Pi Browser 실기기 로그인·결제
