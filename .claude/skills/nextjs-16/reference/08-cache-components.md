# Cache Components & Partial Prerendering Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Cache Components Documentation

---

## Contents

- [What is Cache Components](#what-is-cache-components)
- [Enabling Cache Components](#enabling-cache-components)
- [How Prerendering Works](#how-prerendering-works)
- [Automatically Prerendered Content](#automatically-prerendered-content)
- [Defer to Request Time](#defer-to-request-time)
- [Using use cache](#using-use-cache)
- [cacheLife Profiles](#cachelife-profiles)
- [Cache Tagging and Revalidation](#cache-tagging-and-revalidation)
- [Common Patterns](#common-patterns)

---

## What is Cache Components

Cache Components (also known as Partial Prerendering or PPR) lets you mix **static**, **cached**, and **dynamic** content in a single route. This gives you:

- **Speed of static sites** - Instant HTML shell
- **Flexibility of dynamic rendering** - Fresh data when needed
- **No trade-offs** - Best of both worlds

### The Problem It Solves

Traditional approaches force a choice:

```typescript
// ❌ Fully static - Fast but stale
export const dynamic = 'force-static'

// ❌ Fully dynamic - Fresh but slow
export const dynamic = 'force-dynamic'

// ❌ Client-side - Smaller server load, larger bundles
'use client'
```

### The Solution

```typescript
// ✅ Cache Components - Mix all three!
export default function Page() {
  return (
    <>
      {/* Static - Prerendered at build */}
      <header><h1>My App</h1></header>
      
      {/* Cached dynamic - Included in static shell */}
      <CachedPosts />
      
      {/* Runtime dynamic - Streams at request */}
      <Suspense fallback={<Skeleton />}>
        <UserContent />
      </Suspense>
    </>
  )
}
```

---

## Enabling Cache Components

Add the `cacheComponents` flag to your Next.js config:

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
}

module.exports = nextConfig
```

---

## How Prerendering Works

At **build time**, Next.js renders your component tree:

### 1. Automatic Static Shell

Operations that complete during prerendering are **automatically** included in the static shell:

- Synchronous I/O (`fs.readFileSync`)
- Module imports (`import`)
- Pure computations

```typescript
// app/page.tsx
import fs from 'node:fs'

export default async function Page() {
  // ✅ Runs at build time
  const config = fs.readFileSync('./config.json', 'utf-8')
  const data = JSON.parse(config)
  
  return <div>{data.title}</div>
}
```

### 2. Dynamic Content Handling

When Next.js encounters work it **can't complete** at build time, you must handle it:

- **Option A**: Defer with `<Suspense>` (streams at request time)
- **Option B**: Cache with `use cache` (included in static shell)

If neither is used → **Build error**

---

## Automatically Prerendered Content

### Pure Computations

```typescript
export default async function Page() {
  // ✅ Automatically prerendered
  const items = [1, 2, 3].map(x => x * 2)
  const total = items.reduce((a, b) => a + b, 0)
  
  return <div>Total: {total}</div>
}
```

### Synchronous File System

```typescript
import fs from 'node:fs'

export default async function Page() {
  // ✅ Automatically prerendered
  const content = fs.readFileSync('./data.txt', 'utf-8')
  return <div>{content}</div>
}
```

### Module Imports

```typescript
import { constants } from './constants.json'

export default async function Page() {
  // ✅ Automatically prerendered
  return <div>{constants.appName}</div>
}
```

---

## Defer to Request Time

### Dynamic Content (Fetch, DB, Async FS)

Network requests and database queries **cannot** complete during prerendering. Wrap them in `<Suspense>`:

```typescript
import { Suspense } from 'react'

async function DynamicContent() {
  // ❌ Can't prerender - needs request time
  const data = await fetch('https://api.example.com/data')
  const users = await db.query('SELECT * FROM users')
  
  return <div>Dynamic Data</div>
}

export default function Page() {
  return (
    <>
      <h1>Static Header</h1>
      {/* Fallback is in static shell */}
      <Suspense fallback={<p>Loading...</p>}>
        <DynamicContent />
      </Suspense>
    </>
  )
}
```

### Runtime Data (Cookies, Headers, Params)

Request-specific data requires `<Suspense>`:

```typescript
import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'

async function RuntimeData({ searchParams }) {
  // ❌ Can't prerender - needs request context
  const cookieStore = await cookies()
  const headerStore = await headers()
  const search = await searchParams
  
  return <div>Runtime Data</div>
}

export default function Page(props) {
  return (
    <>
      <h1>Static Header</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <RuntimeData searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
```

### Non-Deterministic Operations

`Math.random()`, `Date.now()`, etc. must run after `connection()`:

```typescript
import { connection } from 'next/server'
import { Suspense } from 'react'

async function UniqueContent() {
  // Signal: defer to request time
  await connection()
  
  // ✅ Now runs per request
  const random = Math.random()
  const now = Date.now()
  
  return <div>{random} - {now}</div>
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <UniqueContent />
    </Suspense>
  )
}
```

---

## Using use cache

The `use cache` directive caches the return value of async functions and components.

### Basic Usage

```typescript
'use cache'
import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('hours')
  
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}
```

### Cache Keys

Arguments and closed-over values **automatically** become part of the cache key:

```typescript
async function CachedContent({ userId }: { userId: string }) {
  'use cache'
  // userId is part of the cache key
  const data = await fetchUserData(userId)
  return <div>{data}</div>
}
```

Different `userId` values = separate cache entries.

### With Runtime Data

**Cannot** use runtime APIs in the same scope as `use cache`. Extract and pass as arguments:

```typescript
// ❌ WRONG - runtime data in cached scope
async function Page() {
  'use cache'
  const session = await cookies() // Error!
}

// ✅ CORRECT - pass as argument
async function Page() {
  const session = (await cookies()).get('session')?.value
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CachedContent sessionId={session} />
    </Suspense>
  )
}

async function CachedContent({ sessionId }) {
  'use cache'
  // sessionId is part of cache key
  const data = await fetchData(sessionId)
  return <div>{data}</div>
}
```

### With Non-Deterministic Operations

Inside `use cache`, non-deterministic operations run **once** during prerendering:

```typescript
export default async function Page() {
  'use cache'
  
  // ✅ Runs once, cached for all requests
  const random = Math.random()
  const now = Date.now()
  const uuid = crypto.randomUUID()
  
  return <div>{random} - {now} - {uuid}</div>
}
```

All users see the **same** values until cache revalidates.

---

## cacheLife Profiles

### Predefined Profiles

```typescript
import { cacheLife } from 'next/cache'

// Profile names
cacheLife('seconds')  // 1 second
cacheLife('minutes')  // 5 minutes
cacheLife('hours')    // 1 hour
cacheLife('days')     // 1 day
cacheLife('weeks')    // 1 week
cacheLife('max')      // Forever (until revalidated)
```

### Custom Configuration

```typescript
cacheLife({
  stale: 3600,      // 1 hour until stale
  revalidate: 7200, // 2 hours until revalidated
  expire: 86400,    // 1 day until expired
})
```

**Behavior:**
- `stale`: Data is fresh, served immediately
- `revalidate`: Data is stale, served while revalidating in background
- `expire`: Data is expired, must revalidate before serving

---

## Cache Tagging and Revalidation

### Tagging Cached Data

```typescript
import { cacheTag } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheTag('products')
  
  return await db.products.findMany()
}
```

### Revalidation Methods

#### updateTag (Immediate)

Use in Server Actions for **read-your-own-writes**:

```typescript
'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({...})
  
  // ✅ Immediately expire cache
  updateTag('posts')
  
  redirect(`/posts/${post.id}`)
}
```

#### revalidateTag (Stale-While-Revalidate)

Use for **eventual consistency**:

```typescript
'use server'
import { revalidateTag } from 'next/cache'

export async function updatePost() {
  await db.posts.update({...})
  
  // ✅ Serve stale, revalidate in background
  revalidateTag('posts', 'max')
}
```

---

## Common Patterns

### Pattern 1: Blog with Cached Posts

```typescript
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

export default function BlogPage() {
  return (
    <>
      {/* Static */}
      <header><h1>Blog</h1></header>
      
      {/* Cached dynamic */}
      <BlogPosts />
      
      {/* Runtime dynamic */}
      <Suspense fallback={<div>Loading...</div>}>
        <UserPreferences />
      </Suspense>
    </>
  )
}

// Everyone sees same posts
async function BlogPosts() {
  'use cache'
  cacheLife('hours')
  cacheTag('posts')
  
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}

// Personalized per user
async function UserPreferences() {
  const theme = (await cookies()).get('theme')?.value
  return <div>Theme: {theme}</div>
}
```

### Pattern 2: E-commerce Product Page

```typescript
export default async function ProductPage({ params }) {
  const { id } = await params
  
  return (
    <>
      {/* Cached product info */}
      <ProductInfo id={id} />
      
      {/* Runtime inventory */}
      <Suspense fallback={<div>Checking stock...</div>}>
        <InventoryStatus id={id} />
      </Suspense>
      
      {/* Runtime user cart */}
      <Suspense fallback={<div>Loading cart...</div>}>
        <UserCart />
      </Suspense>
    </>
  )
}

async function ProductInfo({ id }) {
  'use cache'
  cacheLife('hours')
  cacheTag('products', `product-${id}`)
  
  const product = await db.products.findUnique({ where: { id } })
  return <ProductDetails product={product} />
}
```

### Pattern 3: Dashboard with Real-time Data

```typescript
export default function DashboardPage() {
  return (
    <>
      {/* Static shell */}
      <header><h1>Dashboard</h1></header>
      
      {/* Cached analytics */}
      <Analytics />
      
      {/* Real-time notifications */}
      <Suspense fallback={<div>Loading...</div>}>
        <Notifications />
      </Suspense>
    </>
  )
}

async function Analytics() {
  'use cache'
  cacheLife('minutes')
  
  const stats = await db.analytics.aggregate({...})
  return <AnalyticsChart stats={stats} />
}

async function Notifications() {
  await connection() // Defer to request time
  const userId = (await cookies()).get('userId')?.value
  const notifications = await db.notifications.findMany({
    where: { userId, read: false }
  })
  return <NotificationList items={notifications} />
}
```

---

## Migrating from Route Segment Configs

### dynamic = 'force-static'

```typescript
// ❌ Old way
export const dynamic = 'force-static'

// ✅ New way
export default async function Page() {
  'use cache'
  cacheLife('max')
  // ...
}
```

### revalidate

```typescript
// ❌ Old way
export const revalidate = 3600

// ✅ New way
export default async function Page() {
  'use cache'
  cacheLife('hours')
  // ...
}
```

### fetchCache

```typescript
// ❌ Old way
export const fetchCache = 'force-cache'

// ✅ New way - not needed
// All fetches inside 'use cache' are automatically cached
```

---

## Quick Reference

### Enabling

```typescript
// next.config.ts
export default { cacheComponents: true }
```

### Patterns

```typescript
// Cached component
async function Component() {
  'use cache'
  cacheLife('hours')
  cacheTag('data')
  // ...
}

// Defer to request
<Suspense fallback={<Loading />}>
  <RuntimeComponent />
</Suspense>

// Revalidate
updateTag('data')        // Immediate
revalidateTag('data', 'max') // Stale-while-revalidate
```

---

**Related Documentation:**
- [Server Actions](06-server-actions.md)
- [Fetching Data](10-fetching-data.md)
- [Caching Guide](12-caching-revalidating.md)