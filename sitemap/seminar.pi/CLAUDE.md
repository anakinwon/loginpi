# CLAUDE.md — seminar.pi

@../../CLAUDE.md

> **우선순위** : 위 루트(loginpi) CLAUDE.md 규칙을 먼저 적용한다. 이 파일은 seminar.pi 전용 추가 규칙만 담고, 충돌 시 루트를 따른다.

- 요구사항 정본 : `docs/PRD.md` / 로드맵 : `docs/ROADMAP.md` / 장애 기록 : `docs/TROUBLESHOOT.md`
- 상위 플랜 : `../../docs/PRD_28_PI_MULTISITE.md` — 사이트별 앱·DB·배포 분리(PDB). 공용 코드는 `packages/pi-*` 사용, 복제 금지
- 공통 할 일 : `../multitenant_create_TODO-List.md` · 환경변수 : `../../docs/ENV_GUIDE.md`

## 명령어 (앱 골격 생성 후 유효)

```bash
pnpm dev | pnpm build | pnpm lint | pnpm tsc --noEmit
```

라우트·API 변경 커밋 전 최소 관문은 `pnpm build`.

## 구축 결함 재발 방지

루트 `loginpi/CLAUDE.md` '구축 결함 재발 방지 R-P0~P6' 상속(정본 복제 금지) — 첫 운영 배포 전 `../../docs/BUILD_DEFECTS.md` 1절 신규 시스템 체크리스트 통과.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-24 | 최초 생성(tenant-env.mjs new) |
