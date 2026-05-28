# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 안내 문서입니다.

## 빌드 및 개발 명령어

```bash
pnpm dev              # 개발 서버 실행 (Turbopack, http://localhost:3000)
pnpm build            # 프로덕션 빌드 + 환경변수 검증
pnpm start            # 프로덕션 서버 실행
pnpm lint             # ESLint 검사
pnpm format           # Prettier 포맷 (Tailwind 클래스 순서 자동 정렬 포함)
pnpm format:check     # 포맷 검사만 수행 (파일 수정 없음)
pnpm tsc --noEmit     # 타입 체크
```

shadcn/ui 컴포넌트 추가:
```bash
pnpm dlx shadcn@latest add <컴포넌트명>
```

## 아키텍처 핵심 사항

### shadcn/ui: base-nova 스타일 (@base-ui/react)

이 프로젝트의 shadcn/ui는 **Radix UI가 아닌 `@base-ui/react`** 를 사용하는 `base-nova` 스타일로 초기화됐다.

- **`asChild` prop 없음** — Radix UI 패턴(`<Trigger asChild><Button/></Trigger>`)이 동작하지 않는다.
- 대신 `className={cn(buttonVariants({ variant: 'outline' }))}` 를 Trigger에 직접 적용한다.
- `relative` 클래스 없이 `absolute` 아이콘을 Trigger 안에 넣으면 위치가 이탈한다 — `relative` 명시 필요.

### Tailwind CSS v4 (CSS-first 설정)

- `tailwind.config.*` 파일이 **없다** — v4는 CSS로만 설정한다.
- `src/app/globals.css`의 `@import 'tailwindcss'` 한 줄이 진입점 전부.
- 테마 커스터마이징은 `@theme inline { ... }` 블록에서 CSS 변수로 처리.
- PostCSS 플러그인은 `@tailwindcss/postcss` (v3의 `tailwindcss` 직접 사용 방식과 다름).

### 다크모드 연동

next-themes와 Tailwind v4의 `dark:` 접두사를 연결하는 핵심 한 줄:

```css
/* src/app/globals.css */
@custom-variant dark (&:where(.dark, .dark *));
```

이 줄이 없으면 next-themes가 `<html class="dark">`를 주입해도 `dark:` 클래스가 적용되지 않는다.
`layout.tsx`에서 `<html suppressHydrationWarning>` + `<ThemeProvider attribute="class">` 조합 필수.

### 환경변수 검증 (t3-env)

- 스키마 정의: `src/env.ts` — server/client 분리, `NEXT_PUBLIC_*` 는 반드시 명시
- `next.config.ts` 상단의 `import './src/env'` 로 **빌드 시점에 자동 검증** 실행
- env 누락 시 `pnpm build`가 실패한다 (의도된 동작)
- 새 환경변수 추가 시 `src/env.ts` + `.env.example` 동시 수정 필요

### pnpm 11 빌드 스크립트 허용 설정

pnpm 11부터 `package.json`의 `pnpm` 필드는 무시된다. 네이티브 빌드 스크립트 허용은 `pnpm-workspace.yaml`의 `allowBuilds`로만 설정한다:

```yaml
allowBuilds:
  sharp: true
  unrs-resolver: true
  msw: true
```

새 패키지 추가 후 빌드 스크립트 차단 오류가 발생하면 이 목록에 추가한다.

## 디렉토리 구조

```
src/
├── app/
│   ├── globals.css       # Tailwind v4 + @custom-variant dark + CSS 변수 (oklch 색공간)
│   └── layout.tsx        # ThemeProvider + Header + Footer + Toaster
├── components/
│   ├── ui/               # shadcn/ui 컴포넌트 (@base-ui/react 기반)
│   ├── layout/           # Header, Footer
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx  # DropdownMenu + Sun/Moon/Monitor 아이콘
├── lib/
│   └── utils.ts          # cn() = twMerge + clsx
└── env.ts                # t3-env 환경변수 스키마 정의
```

## 코드 스타일

들여쓰기 2칸, 세미콜론 없음, 작은따옴표 사용. Prettier가 `pnpm format` 실행 시 Tailwind 클래스 순서를 자동으로 정렬한다.
