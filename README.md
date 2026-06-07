# Next.js 16 Starter Kit

웹 개발을 빠르게 시작할 수 있는 Next.js 16 + Tailwind CSS v4 + shadcn/ui 보일러플레이트입니다.

## 포함된 기술 스택

| 영역 | 기술 | 버전 |
|---|---|---|
| 프레임워크 | Next.js (App Router) | 15.x |
| 언어 | TypeScript | 5.x |
| 스타일 | Tailwind CSS (config 파일 없음) | 4.x |
| UI 컴포넌트 | shadcn/ui + Radix UI | latest |
| 아이콘 | lucide-react | latest |
| 다크모드 | next-themes | 0.4.x |
| 환경변수 검증 | @t3-oss/env-nextjs + Zod | latest |
| 포맷터 | Prettier + prettier-plugin-tailwindcss | 3.x |

## 시작하기

```bash
# 1. 저장소 클론 후 의존성 설치
pnpm install

# 2. 환경변수 파일 생성
cp .env.example .env.local

# 3. 개발 서버 실행
pnpm dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

## 디렉토리 구조

```
src/
├── app/
│   ├── layout.tsx        # 루트 레이아웃 (ThemeProvider, Header, Footer)
│   ├── page.tsx          # 홈페이지 (컴포넌트 쇼케이스)
│   └── globals.css       # Tailwind v4 CSS + 다크모드 토큰
├── components/
│   ├── ui/               # shadcn/ui 컴포넌트
│   ├── layout/
│   │   ├── header.tsx    # 헤더 + 다크모드 토글
│   │   └── footer.tsx
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── lib/
│   └── utils.ts          # cn() 유틸리티
└── env.ts                # 환경변수 타입 검증
```

## shadcn/ui 컴포넌트 추가

```bash
pnpm dlx shadcn@latest add [컴포넌트명]

# 예시
pnpm dlx shadcn@latest add table
pnpm dlx shadcn@latest add form
pnpm dlx shadcn@latest add toast
```

## 환경변수 추가 방법

1. `src/env.ts`에서 스키마 정의:

```ts
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),   // 서버 전용
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),  // 클라이언트 접근 가능
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
})
```

2. `.env.example`에 예시 값 추가
3. `.env.local`에 실제 값 추가

환경변수가 누락되면 `pnpm build` 시 빌드가 실패합니다.

## 주요 명령어

```bash
pnpm dev          # 개발 서버 (Turbopack)
pnpm build        # 프로덕션 빌드 (환경변수 검증 포함)
pnpm start        # 프로덕션 서버 실행
pnpm lint         # ESLint 검사
pnpm format       # Prettier 포맷 (Tailwind 클래스 자동 정렬)
pnpm format:check # 포맷 검사만 수행 (수정 없음)
```

## 배포 (Vercel)

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 배포
vercel
```

또는 GitHub 저장소를 [vercel.com](https://vercel.com)에 연결하면 Push마다 자동 배포됩니다.
