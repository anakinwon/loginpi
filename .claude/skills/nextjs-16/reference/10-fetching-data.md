# Fetching Data Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Data Fetching Documentation

---

## Contents

- [Overview](#overview)
- [Server Components Data Fetching](#server-components-data-fetching)
- [fetch API](#fetch-api)
- [Parallel vs Sequential](#parallel-vs-sequential)
- [Database Queries](#database-queries)
- [Third-Party Libraries](#third-party-libraries)
- [Error Handling](#error-handling)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js 16 extends the native `fetch` Web API and recommends fetching data in **Server Components** by default.

### Benefits of Server Components Data Fetching

- **Faster page loads** - Fetch on server, send HTML to client
- **Smaller bundle size** - No data fetching code in client bundle
- **Direct database access** - Query databases securely
- **Better SEO** - Content available on initial load
- **Type safety** - End-to-end TypeScript support

---

## Server Components Data Fetching

Server Components can use `async/await` to fetch data directly.

### Basic Example

```typescript
// app/posts/page.tsx
export default async function PostsPage() {
  const posts = await fetch('https://api.example.com/posts')
    .then(res => res.json())
  
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### With Database

```typescript
// app/posts/page.tsx
import { db } from '@/lib/db'

export default async function PostsPage() {
  const posts = await db.posts.findMany()
  
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

---

## fetch API

Next.js extends the native `fetch` with caching and revalidation options.

### Basic fetch

```typescript
const data = await fetch('https://api.example.com/data')
  .then(res => res.json())
```

### With Cache Control

```typescript
// Cache for 1 hour (3600 seconds)
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 }
})
```

### Force Dynamic (No Cache)

```typescript
// Always fetch fresh data
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store'
})
```

### Force Static (Cache Forever)

```typescript
// Cache until manually revalidated
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache'
})
```

### With Tags for Revalidation

```typescript
const data = await fetch('https://api.example.com/posts', {
  next: { 
    tags: ['posts'],
    revalidate: 3600 
  }
})
```

---

## Parallel vs Sequential

### Sequential Fetching (Waterfall)

Requests happen one after another - **slower but simpler**.

```typescript
// ❌ SLOW - Sequential (waterfall)
export default async function Page() {
  const user = await fetch('https://api.example.com/user/1')
    .then(res => res.json())
  
  // Waits for user before fetching posts
  const posts = await fetch('https://api.example.com/posts')
    .then(res => res.json())
  
  return (
    <div>
      <h1>{user.name}</h1>
      <PostList posts={posts} />
    </div>
  )
}
```

### Parallel Fetching

Requests happen simultaneously - **faster**.

```typescript
// ✅ FAST - Parallel
export default async function Page() {
  // Start both requests at the same time
  const userPromise = fetch('https://api.example.com/user/1')
    .then(res => res.json())
  const postsPromise = fetch('https://api.example.com/posts')
    .then(res => res.json())
  
  // Wait for both to complete
  const [user, posts] = await Promise.all([userPromise, postsPromise])
  
  return (
    <div>
      <h1>{user.name}</h1>
      <PostList posts={posts} />
    </div>
  )
}
```

### Preloading Pattern

```typescript
// lib/data.ts
export const preloadUser = (id: string) => {
  void getUserById(id) // Start fetching but don't await
}

export const getUserById = (id: string) => {
  return fetch(`https://api.example.com/users/${id}`)
    .then(res => res.json())
}

// app/user/[id]/page.tsx
import { preloadUser, getUserById } from '@/lib/data'

export default async function UserPage({ params }: PageProps<'/user/[id]'>) {
  const { id } = await params
  preloadUser(id) // Start fetching early
  
  const user = await getUserById(id) // Already in progress
  return <UserProfile user={user} />
}
```

---

## Database Queries

### With Prisma

```typescript
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// app/posts/page.tsx
import { db } from '@/lib/db'

export default async function PostsPage() {
  const posts = await db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  
  return <PostList posts={posts} />
}
```

### With Drizzle

```typescript
// lib/db.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)

// app/posts/page.tsx
import { db } from '@/lib/db'
import { posts } from '@/lib/schema'
import { desc } from 'drizzle-orm'

export default async function PostsPage() {
  const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt))
  
  return <PostList posts={allPosts} />
}
```

### With Raw SQL

```typescript
import { sql } from '@vercel/postgres'

export default async function PostsPage() {
  const { rows } = await sql`
    SELECT * FROM posts 
    ORDER BY created_at DESC 
    LIMIT 10
  `
  
  return <PostList posts={rows} />
}
```

---

## Third-Party Libraries

### Axios

```typescript
import axios from 'axios'

export default async function Page() {
  const { data } = await axios.get('https://api.example.com/data')
  
  return <div>{data.title}</div>
}
```

### GraphQL with Apollo

```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client'

const client = new ApolloClient({
  uri: 'https://api.example.com/graphql',
  cache: new InMemoryCache(),
})

export default async function Page() {
  const { data } = await client.query({
    query: gql`
      query GetPosts {
        posts {
          id
          title
          content
        }
      }
    `
  })
  
  return <PostList posts={data.posts} />
}
```

### REST API with Type Safety

```typescript
// lib/api.ts
type Post = {
  id: number
  title: string
  content: string
}

export async function getPosts(): Promise<Post[]> {
  const res = await fetch('https://api.example.com/posts')
  if (!res.ok) throw new Error('Failed to fetch posts')
  return res.json()
}

// app/posts/page.tsx
import { getPosts } from '@/lib/api'

export default async function PostsPage() {
  const posts = await getPosts()
  
  return <PostList posts={posts} />
}
```

---

## Error Handling

### Try-Catch Pattern

```typescript
export default async function Page() {
  try {
    const data = await fetch('https://api.example.com/data')
      .then(res => res.json())
    
    return <div>{data.title}</div>
  } catch (error) {
    return <div>Error loading data</div>
  }
}
```

### Check Response Status

```typescript
export default async function Page() {
  const res = await fetch('https://api.example.com/data')
  
  if (!res.ok) {
    // This will activate the closest error boundary
    throw new Error('Failed to fetch data')
  }
  
  const data = await res.json()
  return <div>{data.title}</div>
}
```

### With Error Boundary

```typescript
// app/posts/page.tsx
export default async function PostsPage() {
  const res = await fetch('https://api.example.com/posts')
  
  if (!res.ok) {
    throw new Error('Failed to fetch posts')
  }
  
  const posts = await res.json()
  return <PostList posts={posts} />
}

// app/posts/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Failed to load posts</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Graceful Fallback

```typescript
export default async function Page() {
  let data = null
  
  try {
    data = await fetch('https://api.example.com/data')
      .then(res => res.json())
  } catch (error) {
    console.error('Failed to fetch data:', error)
  }
  
  if (!data) {
    return <div>No data available</div>
  }
  
  return <div>{data.title}</div>
}
```

---

## Common Patterns

### Pattern 1: Blog Posts List

```typescript
// app/blog/page.tsx
import { db } from '@/lib/db'

export default async function BlogPage() {
  const posts = await db.post.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      excerpt: true,
      createdAt: true,
      author: {
        select: { name: true, avatar: true }
      }
    }
  })
  
  return (
    <div>
      <h1>Blog</h1>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <span>By {post.author.name}</span>
        </article>
      ))}
    </div>
  )
}
```

### Pattern 2: Single Post with Comments

```typescript
// app/blog/[slug]/page.tsx
import { db } from '@/lib/db'
import { notFound } from 'next/navigation'

export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  
  // Parallel fetch
  const [post, comments] = await Promise.all([
    db.post.findUnique({
      where: { slug },
      include: { author: true }
    }),
    db.comment.findMany({
      where: { postSlug: slug },
      orderBy: { createdAt: 'desc' }
    })
  ])
  
  if (!post) notFound()
  
  return (
    <article>
      <h1>{post.title}</h1>
      <div>{post.content}</div>
      <CommentList comments={comments} />
    </article>
  )
}
```

### Pattern 3: Dashboard with Multiple Data Sources

```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  // Parallel fetch from multiple sources
  const [user, stats, notifications] = await Promise.all([
    fetch('/api/user').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/notifications').then(r => r.json())
  ])
  
  return (
    <div>
      <UserProfile user={user} />
      <StatsWidget stats={stats} />
      <NotificationsList notifications={notifications} />
    </div>
  )
}
```

### Pattern 4: Paginated List

```typescript
// app/posts/page.tsx
type Props = {
  searchParams: Promise<{ page?: string }>
}

export default async function PostsPage({ searchParams }: Props) {
  const { page = '1' } = await searchParams
  const currentPage = parseInt(page)
  const perPage = 10
  
  const [posts, total] = await Promise.all([
    db.post.findMany({
      skip: (currentPage - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' }
    }),
    db.post.count()
  ])
  
  const totalPages = Math.ceil(total / perPage)
  
  return (
    <div>
      <PostList posts={posts} />
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </div>
  )
}
```

### Pattern 5: Search Results

```typescript
// app/search/page.tsx
type Props = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '' } = await searchParams
  
  if (!q) {
    return <div>Enter a search query</div>
  }
  
  const results = await db.post.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } }
      ]
    },
    take: 20
  })
  
  return (
    <div>
      <h1>Search Results for "{q}"</h1>
      <p>Found {results.length} results</p>
      <SearchResults results={results} />
    </div>
  )
}
```

---

## Best Practices

### 1. Use TypeScript for Type Safety

```typescript
type Post = {
  id: number
  title: string
  content: string
}

// ✅ GOOD - Type-safe
async function getPosts(): Promise<Post[]> {
  const res = await fetch('https://api.example.com/posts')
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

// ❌ BAD - No types
async function getPosts() {
  return fetch('https://api.example.com/posts').then(r => r.json())
}
```

### 2. Separate Data Fetching Logic

```typescript
// ✅ GOOD - Reusable
// lib/data.ts
export async function getPosts() {
  return db.post.findMany()
}

// app/posts/page.tsx
import { getPosts } from '@/lib/data'
export default async function Page() {
  const posts = await getPosts()
  return <PostList posts={posts} />
}

// ❌ BAD - Coupled
export default async function Page() {
  const posts = await db.post.findMany()
  return <PostList posts={posts} />
}
```

### 3. Handle Errors Gracefully

```typescript
// ✅ GOOD - Clear error handling
export default async function Page() {
  const res = await fetch('https://api.example.com/data')
  
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status}`)
  }
  
  const data = await res.json()
  return <div>{data.title}</div>
}

// ❌ BAD - Silent failure
export default async function Page() {
  const data = await fetch('https://api.example.com/data')
    .then(r => r.json())
    .catch(() => null)
  
  return <div>{data?.title}</div>
}
```

### 4. Fetch in Parallel When Possible

```typescript
// ✅ GOOD - Parallel (faster)
const [user, posts] = await Promise.all([
  getUser(),
  getPosts()
])

// ❌ BAD - Sequential (slower)
const user = await getUser()
const posts = await getPosts()
```

---

## Quick Reference

### fetch Options

```typescript
fetch(url, {
  cache: 'force-cache',     // Cache forever
  cache: 'no-store',        // Never cache
  next: { 
    revalidate: 3600,       // Revalidate after 1 hour
    tags: ['posts']         // Tag for revalidation
  }
})
```

### Common Patterns

```typescript
// Basic fetch
const data = await fetch(url).then(r => r.json())

// With error handling
const res = await fetch(url)
if (!res.ok) throw new Error('Failed')
const data = await res.json()

// Parallel fetch
const [a, b] = await Promise.all([fetchA(), fetchB()])

// Database query
const posts = await db.post.findMany()
```

---

**Related Documentation:**
- [Updating Data](11-updating-data.md)
- [Caching and Revalidating](12-caching-revalidating.md)
- [Error Handling](13-error-handling.md)