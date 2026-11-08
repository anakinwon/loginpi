# CLAUDE.md — cafe.pi

@../../CLAUDE.md

> **우선순위** : 위 루트(loginpi) CLAUDE.md 규칙을 먼저 적용한다. 루트 CLAUDE.md 의 인증·결제·i18n·DA·Supabase·PiRC2·브랜드 표기 절은 **이 앱(cafe.pi)이 원래 대상**이므로 그대로 적용하고, 구축 결함 R-P0~P6 은 루트 정본을 상속한다(문구 복제 금지). 이 파일은 앱 위치·배포·명령만 담는다.

Pi 커뮤니티 카페·상점·게시판(PyCafé™ · PyShop™). 2026-11-08 저장소 루트 → `sitemap/cafe.pi` 로 이동(커밋 97728103, 내용 수정 0).

## 배포

| 항목 | 값 |
|---|---|
| Vercel 프로젝트 | `cafe` = https://cafepi.vercel.app (운영) · `loginpi` = https://loginpi.vercel.app (테스트넷) |
| Root Directory | `sitemap/cafe.pi` (두 프로젝트 공통) |
| 운영 브랜치 | `master` |
| 반영 확인 | 운영 주소의 배포 ID 대조(루트 CLAUDE.md '배포 검증 철칙') |

## 명령

이 폴더에서 실행하거나, 저장소 루트의 프록시 스크립트(`pnpm --filter @site/cafe …`)를 쓴다.

```bash
pnpm dev                 # http://localhost:3000
pnpm build               # validate-locales + next build (라우트 수정 커밋 전 관문)
pnpm lint
pnpm exec tsc --noEmit   # 루트에서는 pnpm tsc
pnpm test                # test/**/*.test.mjs
```

- 포트 3000(형제 앱 : sitemap.pi 3001 · schema.pi 3002)
- 앱 전용 도구 = `scripts/`(validate-locales·i18n-*·build-prod-db-bundle 등), 공용 도구(작업 이력·메뉴 지도·테넌트 env) = 루트 `scripts/`
