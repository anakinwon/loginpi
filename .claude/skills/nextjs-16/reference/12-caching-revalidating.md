# Caching and Revalidating Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Caching and Revalidation Documentation

---

## Contents

- [Overview](#overview)
- [Request Memoization](#request-memoization)
- [Data Cache](#data-cache)
- [Full Route Cache](#full-route-cache)
- [Revalidation Methods](#revalidation-methods)
- [Cache Configuration](#cache-configuration)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js 16 has **four caching mechanisms**:

1. **Request Memoization** - Deduplicates requests in a single render
2. **Data Cache** - Stores fetch results across requests
3. **Full Route Cache** - Prerendered HTML and RSC payload
4. **Router Cache** - Client-side cached route segments

---

## Request Memoization

Automatic deduplication of identical `fetch` requests **during a single render**.

### How It Works

```typescript
// These three fetches will only execute ONCE
async function getData() {
  const data = await fetch('https://api.example.com/data')
  return data.json()
}

export default async function Page() {
  const data1 = await getData()  // Fetches from API
  const data2 = await getData()  // Uses memoized result
  const data3 = await getData()  // Uses memoized result
  
  return <div>...</div>
}
```

### Across Components

```typescript
// components/user-profile.tsx
async function getUserData(id: string) {
  const res = await fetch(`https://api.example.com/users/${id}`)
  return res.json()
}

// Multiple components calling same function
export async function UserProfile({ id }: { id: string }) {
  const user = await getUserData(id)  // Fetches
  return <div>{user.name}</div>
}

export async function UserAvatar({ id }: { id: string }) {
  const user = await getUserData(id)  // Memoized
  return <img src={user.avatar} />
}

// Same render = only 1 fetch
export default function Page() {
  return (
    <>
      <UserProfile id="123" />
      <UserAvatar id="123" />
    </>
  )
}
```

### Limitations

- Only works for `GET` requests
- Only during a **single render**
- Not shared between requests
- Resets on navigation

---

## Data Cache

Persistent cache for `fetch` results across requests and deployments.

### Cache Forever (Default)

```typescript
// Cached until manually revalidated
const data = await fetch('https://api.example.com/data')
// OR explicitly
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache'
})
```

### No Cache

```typescript
// Always fetch fresh data
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store'
})
```

### Time-Based Revalidation

```typescript
// Revalidate after 1 hour
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 }
})
```

### Tag-Based Revalidation

```typescript
// Tag for selective revalidation
const data = await fetch('https://api.example.com/posts', {
  next: { 
    tags: ['posts'],
    revalidate: 3600 
  }
})

// Later, revalidate all 'posts' requests
import { revalidateTag } from 'next/cache'
revalidateTag('posts')
```

---

## Full Route Cache

Prerendered HTML and RSC payload for static routes.

### Static by Default

```typescript
// app/about/page.tsx
// Automatically cached at build time
export default function AboutPage() {
  return <h1>About Us</h1>
}
```

### Dynamic Routes with generateStaticParams

```typescript
// app/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts')
    .then(r => r.json())
  
  return posts.map(post => ({
    slug: post.slug
  }))
}

export default async function PostPage({ params }: PageProps<'/posts/[slug]'>) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/posts/${slug}`)
    .then(r => r.json())
  
  return <article>{post.title}</article>
}
```

### Opt Out of Full Route Cache

```typescript
// Force dynamic rendering
export const dynamic = 'force-dynamic'

// OR use dynamic functions
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()  // Makes route dynamic
  return <div>Dynamic Page</div>
}
```

---

## Revalidation Methods

### 1. Time-Based Revalidation

Automatically revalidate after a time period.

```typescript
// Revalidate page every hour
export const revalidate = 3600

export default async function Page() {
  const data = await fetch('https://api.example.com/data')
  return <div>{data}</div>
}
```

```typescript
// Per-fetch revalidation
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 }
})
```

### 2. On-Demand Revalidation

Manually trigger revalidation.

#### revalidatePath

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({...})
  
  // Revalidate specific path
  revalidatePath('/posts')
  
  // Revalidate with type
  revalidatePath('/posts', 'page')     // Single page
  revalidatePath('/posts', 'layout')   // Layout + nested pages
}
```

#### revalidateTag

```typescript
// app/actions.ts
'use server'
import { revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({...})
  
  // Revalidate all requests with tag 'posts'
  revalidateTag('posts')
}

// The fetch that uses this tag
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] }
})
```

#### updateTag (Immediate)

```typescript
// app/actions.ts
'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const post = await db.post.create({...})
  
  // Immediately expire cache
  updateTag('posts')
  
  // User sees new post immediately
  redirect(`/posts/${post.id}`)
}
```

### 3. Route Segment Config

Configure caching per route.

```typescript
// app/posts/page.tsx

// Revalidate every 1 hour
export const revalidate = 3600

// Force static (default)
export const dynamic = 'force-static'

// Force dynamic (no cache)
export const dynamic = 'force-dynamic'

// Use dynamic functions but still try to cache
export const dynamic = 'error'

export default function Page() {
  return <div>Posts</div>
}
```

---

## Cache Configuration

### fetch Cache Options

```typescript
// No cache
fetch(url, { cache: 'no-store' })

// Cache forever
fetch(url, { cache: 'force-cache' })

// Default (cache + revalidate)
fetch(url, { 
  next: { 
    revalidate: 3600,
    tags: ['posts']
  }
})
```

### Route Segment Config

```typescript
// Force dynamic (no cache)
export const dynamic = 'force-dynamic'

// Force static (cache)
export const dynamic = 'force-static'

// Time-based revalidation
export const revalidate = 3600

// Fetch cache config
export const fetchCache = 'default-cache'
export const fetchCache = 'force-cache'
export const fetchCache = 'default-no-store'
export const fetchCache = 'only-cache'
export const fetchCache = 'force-no-store'
export const fetchCache = 'only-no-store'
```

### Database Query Caching (with `use cache`)

```typescript
'use cache'
import { cacheLife, cacheTag } from 'next/cache'

export async function getPosts() {
  cacheLife('hours')
  cacheTag('posts')
  
  return await db.post.findMany()
}
```

---

## Common Patterns

### Pattern 1: Blog with ISR (Incremental Static Regeneration)

```typescript
// app/blog/page.tsx
// Revalidate every 5 minutes
export const revalidate = 300

export default async function BlogPage() {
  const posts = await fetch('https://api.example.com/posts')
    .then(r => r.json())
  
  return <PostList posts={posts} />
}

// app/blog/[slug]/page.tsx
export const revalidate = 300

export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts')
    .then(r => r.json())
  
  return posts.map(post => ({ slug: post.slug }))
}

export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/posts/${slug}`)
    .then(r => r.json())
  
  return <article>{post.title}</article>
}
```

### Pattern 2: E-commerce with Tag-Based Revalidation

```typescript
// app/products/page.tsx
export default async function ProductsPage() {
  const products = await fetch('https://api.example.com/products', {
    next: { tags: ['products'] }
  })
  
  return <ProductList products={products} />
}

// app/actions.ts
'use server'
import { revalidateTag } from 'next/cache'

export async function updateProduct(id: string, data: any) {
  await db.product.update({ where: { id }, data })
  
  // Revalidate all product pages
  revalidateTag('products')
}
```

### Pattern 3: Dashboard with No Cache

```typescript
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Always fresh data
  const stats = await fetch('https://api.example.com/stats', {
    cache: 'no-store'
  })
  
  return <DashboardStats stats={stats} />
}
```

### Pattern 4: Mixed Static and Dynamic

```typescript
// app/page.tsx
export default async function HomePage() {
  // Cached for 1 hour
  const posts = await fetch('https://api.example.com/posts', {
    next: { revalidate: 3600 }
  })
  
  // Always fresh
  const stats = await fetch('https://api.example.com/stats', {
    cache: 'no-store'
  })
  
  return (
    <>
      <PostList posts={posts} />
      <Stats data={stats} />
    </>
  )
}
```

### Pattern 5: Partial Prerendering with Cache Components

```typescript
// app/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

export default function HomePage() {
  return (
    <>
      {/* Static */}
      <header><h1>Home</h1></header>
      
      {/* Cached dynamic */}
      <RecentPosts />
      
      {/* Runtime dynamic */}
      <Suspense fallback={<div>Loading...</div>}>
        <UserContent />
      </Suspense>
    </>
  )
}

// Cached component
async function RecentPosts() {
  'use cache'
  cacheLife('hours')
  cacheTag('posts')
  
  const posts = await db.post.findMany({ take: 5 })
  return <PostList posts={posts} />
}

// Runtime component
async function UserContent() {
  const session = (await cookies()).get('session')
  return <div>Welcome {session.user}</div>
}
```

---

## Best Practices

### 1. Use Appropriate Cache Strategy

```typescript
// ✅ GOOD - Cache static content
const posts = await fetch('https://api.example.com/posts', {
  next: { revalidate: 3600 }
})

// ✅ GOOD - No cache for user-specific data
const user = await fetch('https://api.example.com/user', {
  cache: 'no-store'
})

// ❌ BAD - Caching user-specific data
const user = await fetch('https://api.example.com/user', {
  cache: 'force-cache'  // Other users might see this!
})
```

### 2. Tag Related Data Together

```typescript
// ✅ GOOD - Related data has same tags
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts', 'content'] }
})

const comments = await fetch('https://api.example.com/comments', {
  next: { tags: ['comments', 'content'] }
})

// Revalidate all content at once
revalidateTag('content')

// ❌ BAD - No tags, can't revalidate selectively
const posts = await fetch('https://api.example.com/posts')
```

### 3. Revalidate After Mutations

```typescript
// ✅ GOOD - Revalidates after update
export async function updatePost(id: string, data: any) {
  await db.post.update({ where: { id }, data })
  revalidatePath('/posts')
  revalidateTag('posts')
}

// ❌ BAD - No revalidation, stale cache
export async function updatePost(id: string, data: any) {
  await db.post.update({ where: { id }, data })
}
```

### 4. Use Route Segment Config for Consistency

```typescript
// ✅ GOOD - Consistent caching for entire route
// app/posts/layout.tsx
export const revalidate = 3600

export default function Layout({ children }) {
  return <div>{children}</div>
}

// ❌ BAD - Mixed configurations can be confusing
// app/posts/page.tsx
const data1 = await fetch(url1, { next: { revalidate: 60 } })
const data2 = await fetch(url2, { next: { revalidate: 3600 } })
```

---

## Debugging Cache

### Check if Route is Cached

During `next build`, look for route indicators:

```
Route (app)                              Size     First Load JS
├ ○ /                                    5 kB          87 kB
├ ● /about                               137 B         85 kB
└ ƒ /posts/[slug]                        500 B         88 kB

○  (Static)  prerendered as static content
●  (SSG)     prerendered as static HTML (uses getStaticProps)
ƒ  (Dynamic) server-rendered on demand
```

### Check Data Cache

```typescript
// Add cache headers to see what's cached
const res = await fetch('https://api.example.com/data')
console.log(res.headers.get('cache-control'))
```

### Check in Development

In development, caching is disabled by default. To test caching:

```bash
# Build and start production server
npm run build
npm run start
```

---

## Quick Reference

### Cache Configurations

```typescript
// No cache
fetch(url, { cache: 'no-store' })
export const dynamic = 'force-dynamic'

// Cache forever
fetch(url, { cache: 'force-cache' })

// Time-based revalidation
fetch(url, { next: { revalidate: 3600 } })
export const revalidate = 3600

// Tag-based revalidation
fetch(url, { next: { tags: ['posts'] } })
```

### Revalidation Methods

```typescript
// Revalidate path
revalidatePath('/posts')

// Revalidate tag
revalidateTag('posts')

// Update tag (immediate)
updateTag('posts')
```

### Route Segment Options

```typescript
export const dynamic = 'force-dynamic'  // No cache
export const dynamic = 'force-static'   // Cache
export const revalidate = 3600          // ISR
export const fetchCache = 'force-cache' // Force all fetches to cache
```

---

**Related Documentation:**
- [Fetching Data](10-fetching-data.md)
- [Updating Data](11-updating-data.md)
- [Cache Components](08-cache-components.md)