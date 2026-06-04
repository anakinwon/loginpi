# Next.js 16 Routing, Pages & Layouts Reference

**Doc Version:** 16.1.1  
**Source:** Official Next.js Layouts and Pages documentation

---

## Contents

- [Creating Pages](#creating-pages)
- [Creating Layouts](#creating-layouts)
- [Dynamic Routes](#dynamic-routes)
- [Search Params](#search-params)
- [Linking Between Pages](#linking-between-pages)
- [Route Props Helpers](#route-props-helpers)
- [Page Examples](#page-examples)
- [Layout Examples](#layout-examples)

---

## Creating Pages

A **page** is UI rendered at a specific route. Export a React component from `page.tsx`.

### Basic Page
```typescript
// app/page.tsx (Home page: /)
export default function Page() {
  return <h1>Hello Next.js!</h1>
}
```

### Page with Metadata
```typescript
// app/about/page.tsx (/about)
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'About our company',
}

export default function Page() {
  return <h1>About Us</h1>
}
```

### Nested Page
```typescript
// app/blog/page.tsx (/blog)
export default function Page() {
  return <h1>Blog</h1>
}

// app/blog/authors/page.tsx (/blog/authors)
export default function Page() {
  return <h1>Authors</h1>
}
```

**URL Structure:**
```
app/page.tsx              → /
app/blog/page.tsx         → /blog
app/blog/authors/page.tsx → /blog/authors
```

---

## Creating Layouts

A **layout** is UI shared between multiple pages. Layouts preserve state and don't rerender on navigation.

### Root Layout (Required)
```typescript
// app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <header>
          <nav>{/* Navigation */}</nav>
        </header>
        <main>{children}</main>
        <footer>{/* Footer */}</footer>
      </body>
    </html>
  )
}
```

**Rules:**
- Must exist at `app/layout.tsx`
- Must contain `<html>` and `<body>` tags
- Wraps all pages in the app

### Nested Layout
```typescript
// app/blog/layout.tsx
export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <aside>
        <h2>Blog Sidebar</h2>
        {/* Blog navigation */}
      </aside>
      <section>{children}</section>
    </div>
  )
}
```

**Nesting behavior:**
```
app/layout.tsx (Root)
  └─ Wraps everything
      └─ app/blog/layout.tsx (Blog)
          └─ Wraps /blog and /blog/*
              └─ app/blog/page.tsx (Blog Page)
```

### Layout with Metadata
```typescript
// app/blog/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | Blog',
    default: 'Blog',
  },
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <section>{children}</section>
}
```

**Result:**
- `/blog` → "Blog"
- `/blog/hello` → "hello | Blog"

---

## Dynamic Routes

Dynamic segments generate routes from data.

### Single Dynamic Segment
```typescript
// app/blog/[slug]/page.tsx (/blog/hello, /blog/world)
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}
```

**URLs matched:**
- `/blog/hello` → `{ slug: 'hello' }`
- `/blog/world` → `{ slug: 'world' }`

### Multiple Dynamic Segments
```typescript
// app/shop/[category]/[product]/page.tsx
export default async function Page(
  props: PageProps<'/shop/[category]/[product]'>
) {
  const { category, product } = await props.params
  
  return (
    <div>
      <h1>{category}</h1>
      <h2>{product}</h2>
    </div>
  )
}
```

**URLs matched:**
- `/shop/shoes/nike-air` → `{ category: 'shoes', product: 'nike-air' }`
- `/shop/clothing/t-shirt` → `{ category: 'clothing', product: 't-shirt' }`

### Catch-All Segments
```typescript
// app/docs/[...slug]/page.tsx
export default async function Page(
  props: PageProps<'/docs/[...slug]'>
) {
  const { slug } = await props.params // slug is string[]
  
  return (
    <div>
      <h1>Docs: {slug.join('/')}</h1>
    </div>
  )
}
```

**URLs matched:**
- `/docs/intro` → `{ slug: ['intro'] }`
- `/docs/guides/getting-started` → `{ slug: ['guides', 'getting-started'] }`
- `/docs` → NOT matched (requires at least one segment)

### Optional Catch-All Segments
```typescript
// app/docs/[[...slug]]/page.tsx
export default async function Page(
  props: PageProps<'/docs/[[...slug]]'>
) {
  const { slug } = await props.params // slug is string[] | undefined
  
  if (!slug) {
    return <h1>Docs Home</h1>
  }
  
  return <h1>Docs: {slug.join('/')}</h1>
}
```

**URLs matched:**
- `/docs` → `{ slug: undefined }` ✅
- `/docs/intro` → `{ slug: ['intro'] }` ✅
- `/docs/guides/setup` → `{ slug: ['guides', 'setup'] }` ✅

### Static Generation with Dynamic Routes
```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()
  
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  return <article><h1>{post.title}</h1></article>
}
```

**What this does:**
- Pre-renders all blog posts at build time
- `/blog/hello`, `/blog/world`, etc. are static HTML
- Faster load times, better SEO

---

## Search Params

Access query strings like `?sort=asc&filter=active`.

### Server Component (Page)
```typescript
// app/shop/page.tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const sort = params.sort // 'asc' or 'desc'
  const filter = params.filter // 'active', etc.
  
  const products = await getProducts({ sort, filter })
  
  return (
    <div>
      <h1>Products</h1>
      <ProductList products={products} />
    </div>
  )
}
```

**URLs:**
- `/shop?sort=asc` → `{ sort: 'asc' }`
- `/shop?sort=asc&filter=active` → `{ sort: 'asc', filter: 'active' }`

### Client Component (useSearchParams)
```typescript
// app/components/search.tsx
'use client'

import { useSearchParams } from 'next/navigation'

export default function Search() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q')
  
  return (
    <div>
      <p>Search: {query}</p>
      <input defaultValue={query || ''} />
    </div>
  )
}
```

### When to Use Which

| Use Case | Use |
|----------|-----|
| Load data based on search params | `searchParams` prop (Server Component) |
| Filter/sort already loaded data | `useSearchParams` (Client Component) |
| Event handlers, callbacks | `new URLSearchParams(window.location.search)` |

**Performance tip:**
- `searchParams` prop opts into dynamic rendering
- Use only when needed for data fetching

---

## Linking Between Pages

Use the `<Link>` component for client-side navigation.

### Basic Link
```typescript
import Link from 'next/link'

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/blog">Blog</Link>
      <Link href="/about">About</Link>
    </nav>
  )
}
```

### Dynamic Link
```typescript
import Link from 'next/link'

export default function PostList({ posts }) {
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>
          <Link href={`/blog/${post.slug}`}>
            {post.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

### Link with Search Params
```typescript
<Link href="/shop?category=shoes&sort=asc">
  Shoes (A-Z)
</Link>

// Or using object syntax
<Link href={{
  pathname: '/shop',
  query: { category: 'shoes', sort: 'asc' },
}}>
  Shoes (A-Z)
</Link>
```

### Prefetching Behavior
```typescript
// Automatic prefetching (default)
<Link href="/blog">Blog</Link>

// Disable prefetching
<Link href="/blog" prefetch={false}>
  Blog
</Link>

// Prefetch on hover only
<Link 
  href="/blog" 
  prefetch={false}
  onMouseEnter={(e) => {
    // Custom prefetch logic
  }}
>
  Blog
</Link>
```

---

## Route Props Helpers

Next.js provides type-safe helpers for route props.

### PageProps Helper
```typescript
// Automatically inferred from route structure
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  // props.params is typed as Promise<{ slug: string }>
  const { slug } = await props.params
  
  // props.searchParams is typed automatically
  const params = await props.searchParams
  
  return <h1>{slug}</h1>
}
```

**Benefits:**
- Auto-completion for params
- Type safety
- No manual typing needed

**Examples:**
```typescript
// Static route
PageProps<'/about'>
// params: Promise<{}>

// Single param
PageProps<'/blog/[slug]'>
// params: Promise<{ slug: string }>

// Multiple params
PageProps<'/shop/[category]/[id]'>
// params: Promise<{ category: string; id: string }>

// Catch-all
PageProps<'/docs/[...slug]'>
// params: Promise<{ slug: string[] }>

// Optional catch-all
PageProps<'/docs/[[...slug]]'>
// params: Promise<{ slug?: string[] }>
```

### LayoutProps Helper
```typescript
// app/dashboard/layout.tsx
export default function Layout(props: LayoutProps<'/dashboard'>) {
  return (
    <div>
      {props.children}
      {/* If you have @analytics slot: */}
      {/* {props.analytics} */}
    </div>
  )
}
```

**With Parallel Routes:**
```
app/dashboard/
├── layout.tsx
├── @analytics/
│   └── page.tsx
└── page.tsx
```
```typescript
export default function Layout(props: LayoutProps<'/dashboard'>) {
  // props.children is typed
  // props.analytics is typed (from @analytics folder)
  
  return (
    <div>
      <main>{props.children}</main>
      <aside>{props.analytics}</aside>
    </div>
  )
}
```

---

## Page Examples

### Static Page with Metadata
```typescript
// app/about/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about our company',
  openGraph: {
    title: 'About Us',
    description: 'Learn about our company',
    images: ['/about-og.png'],
  },
}

export default function Page() {
  return (
    <div>
      <h1>About Us</h1>
      <p>We are a company...</p>
    </div>
  )
}
```

### Dynamic Page with Data Fetching
```typescript
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata(
  props: PageProps<'/blog/[slug]'>
) {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  if (!post) return { title: 'Not Found' }
  
  return {
    title: post.title,
    description: post.excerpt,
  }
}

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  if (!post) notFound()
  
  return (
    <article>
      <h1>{post.title}</h1>
      <time>{post.date}</time>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  )
}
```

### Page with Search Params
```typescript
// app/shop/page.tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ 
    category?: string
    sort?: 'asc' | 'desc'
    page?: string
  }>
}) {
  const params = await searchParams
  const category = params.category || 'all'
  const sort = params.sort || 'asc'
  const page = parseInt(params.page || '1')
  
  const products = await getProducts({
    category,
    sort,
    page,
  })
  
  return (
    <div>
      <h1>Shop - {category}</h1>
      <ProductGrid products={products} />
      <Pagination current={page} />
    </div>
  )
}
```

### Page with Loading State
```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

async function SlowData() {
  const data = await fetchSlowData()
  return <div>{data}</div>
}

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SlowData />
      </Suspense>
    </div>
  )
}
```

Or use `loading.tsx`:
```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return <div>Loading dashboard...</div>
}

// app/dashboard/page.tsx
export default async function Page() {
  const data = await fetchData()
  return <div>{data}</div>
}
```

---

## Layout Examples

### Root Layout with Font
```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className={inter.className}>
      <body>
        <header>
          <nav>{/* Nav */}</nav>
        </header>
        {children}
        <footer>{/* Footer */}</footer>
      </body>
    </html>
  )
}
```

### Nested Layout with Sidebar
```typescript
// app/docs/layout.tsx
import Sidebar from './sidebar'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="docs-container">
      <Sidebar />
      <main className="docs-content">
        {children}
      </main>
    </div>
  )
}
```

### Layout with Multiple Root Layouts
```
app/
├── (marketing)/
│   ├── layout.tsx      # Marketing layout
│   └── page.tsx
└── (app)/
    ├── layout.tsx      # App layout
    └── dashboard/
        └── page.tsx
```
```typescript
// app/(marketing)/layout.tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <nav>{/* Public nav */}</nav>
        {children}
        <footer>{/* Marketing footer */}</footer>
      </body>
    </html>
  )
}

// app/(app)/layout.tsx
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <nav>{/* App nav */}</nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
```

### Layout with Parallel Routes
```
app/dashboard/
├── layout.tsx
├── @analytics/
│   └── page.tsx
├── @team/
│   └── page.tsx
└── page.tsx
```
```typescript
// app/dashboard/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  team: React.ReactNode
}) {
  return (
    <div className="dashboard">
      <main>{children}</main>
      <aside className="sidebar">
        <section>{analytics}</section>
        <section>{team}</section>
      </aside>
    </div>
  )
}
```

---

## Quick Checklist

### Creating a New Page
```
✓ Create page.tsx in route folder
✓ Export default React component
✓ Add metadata export (optional)
✓ Use PageProps<'/path'> for type safety
✓ Await params if dynamic
```

### Creating a New Layout
```
✓ Create layout.tsx in route folder
✓ Accept children prop
✓ Return JSX wrapping children
✓ Root layout must have <html> and <body>
✓ Use LayoutProps<'/path'> for type safety
```

### Dynamic Route Checklist
```
✓ Use [param] folder name
✓ Use PageProps<'/path/[param]'> type
✓ Await props.params
✓ Add generateStaticParams for SSG
✓ Handle not found case
```

---

**Related Documentation:**
- [Project Structure](01-project-structure.md)
- [Navigation](03-navigation.md)
- [Server/Client Components](04-server-client.md)
- [TypeScript Patterns](05-typescript.md)