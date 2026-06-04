---
name: nextjs-quick-reference
description: Next.js 최신 App Router 버전 (v15+) 빠른 참조 가이드. 파일 기반 라우팅, 서버/클라이언트 컴포넌트, 데이터 페칭, 최적화 패턴.
allowed-tools: Read, Write, Edit
---

# Next.js Quick Reference (v15+)

Next.js App Router 기반의 최신 개발 패턴 빠른 참조.

---

## 🗂️ 파일 기반 라우팅 (App Router)

### 디렉토리 구조

```
app/
├── layout.tsx           # 루트 레이아웃
├── page.tsx             # 홈 페이지 (/)
├── dashboard/
│   ├── layout.tsx       # 중첩 레이아웃
│   └── page.tsx         # /dashboard
├── dashboard/[id]/
│   └── page.tsx         # /dashboard/:id (동적)
├── dashboard/[...slug]/
│   └── page.tsx         # /dashboard/** (캐치올)
├── api/
│   └── route.ts         # API 라우트
└── globals.css
```

### 라우트 생성 규칙

| 파일 | 라우트 | 설명 |
|------|--------|------|
| `page.tsx` | `/` | 페이지 생성 |
| `layout.tsx` | 레이아웃 | 중첩 구조 |
| `route.ts` | `/api/*` | API 엔드포인트 |
| `not-found.tsx` | 404 | 커스텀 404 |
| `error.tsx` | 에러 바운더리 | 에러 처리 |
| `loading.tsx` | Suspense | 로딩 상태 |

---

## ⚙️ 서버 컴포넌트 vs 클라이언트 컴포넌트

### 서버 컴포넌트 (기본값)

```tsx
// app/dashboard/page.tsx
// 직접 데이터베이스 접근 가능

async function getDashboardData() {
  const data = await db.query('SELECT * FROM dashboard')
  return data
}

export default async function Dashboard() {
  const data = await getDashboardData()

  return (
    <div>
      <h1>Dashboard</h1>
      <DataList data={data} />
    </div>
  )
}
```

**장점:**
- ✅ 데이터베이스/API에 직접 접근
- ✅ 민감한 정보 안전하게 처리
- ✅ 큰 번들 크기 감소
- ✅ 한 번의 왕복으로 데이터 페칭

### 클라이언트 컴포넌트

```tsx
'use client'

import { useState, useEffect } from 'react'

export default function InteractiveComponent() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    console.log('마운트됨')
  }, [])

  return (
    <button onClick={() => setCount(count + 1)}>
      클릭: {count}
    </button>
  )
}
```

**필요한 경우:**
- 상태 관리 (useState, useReducer)
- 라이프사이클 훅 (useEffect)
- 브라우저 API (localStorage, window)
- 이벤트 리스너

### 서버 → 클라이언트 데이터 전달

```tsx
// app/page.tsx (서버)
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    cache: 'no-store' // 매 요청마다 새로 fetch
  })
  return res.json()
}

export default async function Home() {
  const posts = await getPosts()

  // 데이터를 props로 전달
  return <PostsList initialPosts={posts} />
}
```

```tsx
// components/PostsList.tsx (클라이언트)
'use client'

export default function PostsList({ initialPosts }) {
  const [posts, setPosts] = useState(initialPosts)

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>{post.title}</article>
      ))}
    </div>
  )
}
```

---

## 📡 데이터 페칭 패턴

### 1. 정적 캐싱 (기본값)

```tsx
// 빌드 시 한 번만 fetch, 영구 캐싱
export default async function Page() {
  const data = await fetch('https://api.example.com/data', {
    cache: 'force-cache' // 명시적 (기본값)
  })

  return <div>{data}</div>
}
```

### 2. 동적 페칭 (매 요청마다)

```tsx
// 매 요청마다 새로운 데이터 fetch
export default async function Page() {
  const res = await fetch('https://api.example.com/data', {
    cache: 'no-store'
  })

  return <div>{res}</div>
}
```

### 3. ISR (증분 정적 재검증)

```tsx
// 10초마다 백그라운드에서 재생성
export default async function Page() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 10 }
  })

  return <div>{res}</div>
}
```

### 4. revalidateTag (온디맨드 재검증)

```tsx
// app/api/revalidate/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(request) {
  revalidateTag('posts')
  return Response.json({ revalidated: true })
}
```

```tsx
// 태그와 함께 fetch
export default async function Page() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] }
  })

  return <div>{res}</div>
}
```

---

## 🎯 동적 라우트 & 매개변수

### 동적 세그먼트

```tsx
// app/posts/[id]/page.tsx
type Params = Promise<{ id: string }>

export default async function PostPage(props: { params: Params }) {
  const { id } = await props.params

  return <h1>Post {id}</h1>
}
```

### 캐치올 세그먼트

```tsx
// app/docs/[...slug]/page.tsx
type Params = Promise<{ slug: string[] }>

export default async function DocsPage(props: { params: Params }) {
  const { slug } = await props.params
  // slug = ['guide', 'installation']

  return <h1>{slug.join('/')}</h1>
}
```

### 선택적 캐치올

```tsx
// app/[[...slug]]/page.tsx
// /blog, /blog/hello, /blog/hello/world 모두 매칭
```

---

## 🔌 API 라우트

### 기본 API 라우트

```tsx
// app/api/hello/route.ts
export async function GET(request: Request) {
  return Response.json({ message: 'Hello' })
}

export async function POST(request: Request) {
  const data = await request.json()
  return Response.json({ received: data }, { status: 201 })
}
```

### 동적 API 라우트

```tsx
// app/api/posts/[id]/route.ts
type Params = Promise<{ id: string }>

export async function GET(
  request: Request,
  props: { params: Params }
) {
  const { id } = await props.params
  return Response.json({ postId: id })
}
```

### 쿠키 처리

```tsx
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value

  return Response.json({ token })
}
```

---

## 🎬 로딩 & Suspense

### loading.tsx (자동 Suspense)

```tsx
// app/dashboard/loading.tsx
export default function DashboardLoading() {
  return <div>로딩 중...</div>
}
```

### 수동 Suspense

```tsx
import { Suspense } from 'react'

async function SlowComponent() {
  await new Promise(resolve => setTimeout(resolve, 3000))
  return <div>완료</div>
}

export default function Page() {
  return (
    <Suspense fallback={<p>로딩...</p>}>
      <SlowComponent />
    </Suspense>
  )
}
```

---

## 🛡️ 에러 처리

### error.tsx (클라이언트 에러 바운더리)

```tsx
'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>문제 발생</h2>
      <button onClick={() => reset()}>다시 시도</button>
    </div>
  )
}
```

### global-error.tsx (루트 에러)

```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>오류 발생</h2>
        <button onClick={() => reset()}>다시 시도</button>
      </body>
    </html>
  )
}
```

---

## 🎨 이미지 최적화

```tsx
import Image from 'next/image'

export default function Home() {
  return (
    <Image
      src="/hero.png"
      alt="Hero"
      width={800}
      height={600}
      priority // LCP 최적화
      sizes="(max-width: 768px) 100vw, 50vw"
    />
  )
}
```

---

## ⚡ 성능 최적화

### 폰트 최적화

```tsx
// app/layout.tsx
import { Geist, Geist_Mono } from 'next/font/google'

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
})

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={geist.className}>
      <body>{children}</body>
    </html>
  )
}
```

### 동적 import (code splitting)

```tsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('./component'), {
  loading: () => <p>로딩...</p>,
})

export default function Page() {
  return <DynamicComponent />
}
```

---

## 🔐 환경 변수

```bash
# .env.local (모든 환경)
NEXT_PUBLIC_API_URL=https://api.example.com

# .env.production (프로덕션만)
DATABASE_URL=...
```

```tsx
// 사용
const apiUrl = process.env.NEXT_PUBLIC_API_URL
const dbUrl = process.env.DATABASE_URL // 서버에서만 접근 가능
```

---

## 🚀 배포 최적화

### next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lodash-es'],
  },
}

module.exports = nextConfig
```

---

## 📚 더 알아보기

- [Next.js 공식 문서](https://nextjs.org/docs)
- [App Router 가이드](https://nextjs.org/docs/app)
- [성능 최적화](https://nextjs.org/docs/app/building-your-application/optimizing)
