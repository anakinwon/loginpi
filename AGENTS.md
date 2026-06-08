# AGENTS.md — cafe-pi-claude

> AI 코딩 에이전트(Claude Code·Codex·Cursor 등)를 위한 진입 안내.
> **정본 지침은 [CLAUDE.md](./CLAUDE.md), 빠른 금지/패턴 참조는 [RULES.md](./RULES.md).**
> 이 파일과 충돌 시 CLAUDE.md를 따른다.

## 프로젝트 한 줄 요약

Pi Network 기반 다국어 카페/커뮤니티 웹앱 — Next.js 16 App Router + Supabase + Pi SDK 로그인·결제.

## ⭐ 절대 훼손 금지 (최우선)

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

> **치명적 제약**: Pi Browser WebView는 모든 방식의 `Set-Cookie`를 저장하지 않는다.
> 인증 필요 경로는 **쿠키 OR `X-Pi-Token` 헤더** 두 경로를 지원해야 하며,
> `getSessionUser()` null 시 `redirect` 금지(무한 루프) → 클라이언트 게이트로 위임.

## 빌드·검증 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드 + locale/환경변수 검증
pnpm lint             # ESLint (eslint.config.mjs — Next.js flat config)
pnpm format           # Prettier (Tailwind 클래스 순서 정렬)
pnpm tsc --noEmit     # 타입 체크
```

변경 제출 전 `pnpm tsc --noEmit`와 `pnpm lint`를 통과시킨다.

## 코드 스타일

들여쓰기 2칸 · 세미콜론 없음 · 작은따옴표. 상세 규칙은 RULES.md / CLAUDE.md 참조.

## 프로젝트 지식·스킬 위치

- 아키텍처·인증·DB·다국어 상세: [CLAUDE.md](./CLAUDE.md)
- 도메인 스킬 문서: `.claude/skills/` (예: `pi_auth`, `pi_pay`, `pi_google_link`, `nextjs-16`, `da-naming-rules`)
- 데이터 표준(DA): `docs/da/데이터표준규칙.md`
- 제품 요구사항: `docs/PRD*.md`, 로드맵: `docs/ROADMAP.md`
