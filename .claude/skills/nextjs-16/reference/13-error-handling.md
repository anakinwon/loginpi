# Error Handling Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Error Handling Documentation

---

## Contents

- [Overview](#overview)
- [Error Boundaries](#error-boundaries)
- [Not Found Pages](#not-found-pages)
- [Loading States](#loading-states)
- [Server Action Errors](#server-action-errors)
- [API Route Errors](#api-route-errors)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js 16 provides multiple ways to handle errors:

1. **error.tsx** - Error boundaries for route segments
2. **global-error.tsx** - Root layout error boundary
3. **not-found.tsx** - 404 pages
4. **loading.tsx** - Loading and Suspense fallbacks

---

## Error Boundaries

### Basic Error Boundary

```typescript
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
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### How It Works

```
app/
├── layout.tsx
├── page.tsx           # If this throws...
└── error.tsx          # ...this catches it
```

### Nested Error Boundaries

```
app/
├── layout.tsx
├── error.tsx          # Catches errors in posts/*
└── posts/
    ├── page.tsx
    ├── error.tsx      # Catches errors in posts/[id]/*
    └── [id]/
        ├── page.tsx
        └── error.tsx  # Most specific error handler
```

### Global Error Handler

```typescript
// app/global-error.tsx
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
        <h2>Something went wrong!</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  )
}
```

**Note:** `global-error.tsx` must include `<html>` and `<body>` tags.

---

## Not Found Pages

### Custom 404 Page

```typescript
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}
```

### Programmatic Not Found

```typescript
// app/posts/[id]/page.tsx
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

export default async function PostPage({ params }: PageProps<'/posts/[id]'>) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })
  
  if (!post) {
    notFound()  // Triggers not-found.tsx
  }
  
  return <article>{post.title}</article>
}
```

### Nested Not Found Pages

```
app/
├── not-found.tsx          # Global 404
└── posts/
    ├── [id]/
    │   ├── page.tsx
    │   └── not-found.tsx  # Posts-specific 404
```

---

## Loading States

### Basic Loading UI

```typescript
// app/posts/loading.tsx
export default function Loading() {
  return <div>Loading posts...</div>
}
```

### With Suspense

```typescript
// app/page.tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <>
      <h1>Dashboard</h1>
      
      {/* Suspense with custom fallback */}
      <Suspense fallback={<div>Loading stats...</div>}>
        <Stats />
      </Suspense>
      
      <Suspense fallback={<div>Loading posts...</div>}>
        <Posts />
      </Suspense>
    </>
  )
}

async function Stats() {
  const stats = await fetch('https://api.example.com/stats')
  return <div>{/* Stats UI */}</div>
}

async function Posts() {
  const posts = await fetch('https://api.example.com/posts')
  return <div>{/* Posts UI */}</div>
}
```

### Streaming with Loading States

```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <>
      {/* Instant shell */}
      <header><h1>Dashboard</h1></header>
      
      {/* Streams independently */}
      <Suspense fallback={<Skeleton />}>
        <UserData />
      </Suspense>
      
      <Suspense fallback={<Skeleton />}>
        <Analytics />
      </Suspense>
    </>
  )
}
```

---

## Server Action Errors

### Throwing Errors

```typescript
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  if (!title) {
    throw new Error('Title is required')
  }
  
  try {
    await db.post.create({ data: { title } })
  } catch (error) {
    throw new Error('Failed to create post')
  }
}
```

### Returning Error State

```typescript
// app/actions.ts
'use server'

type State = {
  error?: string
  success?: boolean
}

export async function createPost(
  prevState: State,
  formData: FormData
): Promise<State> {
  const title = formData.get('title') as string
  
  if (!title) {
    return { error: 'Title is required' }
  }
  
  try {
    await db.post.create({ data: { title } })
    return { success: true }
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}

// app/posts/new/page.tsx
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, formAction, isPending] = useActionState(createPost, {})
  
  return (
    <form action={formAction}>
      <input name="title" />
      <button disabled={isPending}>Create</button>
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">Success!</p>}
    </form>
  )
}
```

### With Zod Validation Errors

```typescript
// app/actions.ts
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
})

type State = {
  errors?: {
    title?: string[]
    content?: string[]
    _form?: string[]
  }
  success?: boolean
}

export async function createPost(
  prevState: State,
  formData: FormData
): Promise<State> {
  const result = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })
  
  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
    }
  }
  
  try {
    await db.post.create({ data: result.data })
    return { success: true }
  } catch (error) {
    return {
      errors: {
        _form: ['Failed to create post']
      }
    }
  }
}

// app/posts/new/page.tsx
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, formAction] = useActionState(createPost, {})
  
  return (
    <form action={formAction}>
      <div>
        <input name="title" />
        {state.errors?.title && (
          <p className="error">{state.errors.title[0]}</p>
        )}
      </div>
      
      <div>
        <textarea name="content" />
        {state.errors?.content && (
          <p className="error">{state.errors.content[0]}</p>
        )}
      </div>
      
      {state.errors?._form && (
        <p className="error">{state.errors._form[0]}</p>
      )}
      
      <button type="submit">Create Post</button>
    </form>
  )
}
```

---

## API Route Errors

### Basic Error Response

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const posts = await db.post.findMany()
    return NextResponse.json(posts)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    )
  }
}
```

### With Status Codes

```typescript
// app/api/posts/[id]/route.ts
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const post = await db.post.findUnique({ where: { id } })
  
  if (!post) {
    return NextResponse.json(
      { error: 'Post not found' },
      { status: 404 }
    )
  }
  
  return NextResponse.json(post)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.post.delete({ where: { id } })
    
    return NextResponse.json(
      { success: true },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    )
  }
}
```

### Validation Errors

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const result = PostSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { errors: result.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    
    const post = await db.post.create({ data: result.data })
    
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## Common Patterns

### Pattern 1: Error Boundary with Logging

```typescript
// app/posts/error.tsx
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
    // Log error to external service
    console.error('Error:', error)
    
    // Example: Send to Sentry
    // Sentry.captureException(error)
  }, [error])
  
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Pattern 2: Custom Error Components

```typescript
// components/error-message.tsx
export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded p-4">
      <p className="text-red-800">{message}</p>
    </div>
  )
}

// app/posts/error.tsx
'use client'

import { ErrorMessage } from '@/components/error-message'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <ErrorMessage message={error.message} />
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Pattern 3: Graceful Degradation

```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <>
      <h1>Dashboard</h1>
      
      {/* If Stats fails, show fallback */}
      <Suspense fallback={<div>Loading...</div>}>
        <ErrorBoundary fallback={<div>Stats unavailable</div>}>
          <Stats />
        </ErrorBoundary>
      </Suspense>
      
      {/* Rest of dashboard still works */}
      <Suspense fallback={<div>Loading...</div>}>
        <Posts />
      </Suspense>
    </>
  )
}

// components/error-boundary.tsx
'use client'

import { Component, ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    
    return this.props.children
  }
}
```

### Pattern 4: Form with Field-Level Errors

```typescript
// app/posts/new/page.tsx
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, formAction, isPending] = useActionState(createPost, {})
  
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          className={state.errors?.title ? 'border-red-500' : ''}
        />
        {state.errors?.title && (
          <p className="text-red-500 text-sm mt-1">
            {state.errors.title[0]}
          </p>
        )}
      </div>
      
      <div>
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          name="content"
          className={state.errors?.content ? 'border-red-500' : ''}
        />
        {state.errors?.content && (
          <p className="text-red-500 text-sm mt-1">
            {state.errors.content[0]}
          </p>
        )}
      </div>
      
      {state.errors?._form && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-800">{state.errors._form[0]}</p>
        </div>
      )}
      
      <button
        type="submit"
        disabled={isPending}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

### Pattern 5: Loading with Skeletons

```typescript
// components/skeleton.tsx
export function PostSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-1" />
      <div className="h-4 bg-gray-200 rounded w-5/6" />
    </div>
  )
}

// app/posts/page.tsx
import { Suspense } from 'react'
import { PostSkeleton } from '@/components/skeleton'

export default function PostsPage() {
  return (
    <>
      <h1>Posts</h1>
      <Suspense fallback={<PostSkeleton />}>
        <PostList />
      </Suspense>
    </>
  )
}
```

---

## Best Practices

### 1. Use Specific Error Messages

```typescript
// ✅ GOOD - Specific error messages
if (!title) {
  return { error: 'Title is required' }
}
if (title.length > 100) {
  return { error: 'Title must be less than 100 characters' }
}

// ❌ BAD - Generic error messages
if (!title || title.length > 100) {
  return { error: 'Invalid input' }
}
```

### 2. Don't Expose Internal Errors

```typescript
// ✅ GOOD - User-friendly error
try {
  await db.post.create({ data })
} catch (error) {
  return { error: 'Failed to create post. Please try again.' }
}

// ❌ BAD - Exposes internal details
try {
  await db.post.create({ data })
} catch (error) {
  return { error: error.message }  // "Prisma error: Unique constraint..."
}
```

### 3. Provide Recovery Options

```typescript
// ✅ GOOD - Offers retry
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}

// ❌ BAD - No recovery option
export default function Error({ error }) {
  return <div>{error.message}</div>
}
```

### 4. Use Progressive Enhancement

```typescript
// ✅ GOOD - Works without JavaScript
<form action={serverAction}>
  <input name="title" />
  <button type="submit">Create</button>
</form>

// ❌ BAD - Requires JavaScript
<form onSubmit={handleSubmit}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

---

## Quick Reference

### Error Handling Files

```
app/
├── error.tsx          # Route segment error boundary
├── global-error.tsx   # Root error boundary
├── not-found.tsx      # 404 page
└── loading.tsx        # Loading UI
```

### Common Status Codes

```typescript
200 - OK
201 - Created
400 - Bad Request (validation error)
401 - Unauthorized
403 - Forbidden
404 - Not Found
500 - Internal Server Error
```

### Error Boundary Template

```typescript
'use client'

export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Error</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )
}
```

---

**Related Documentation:**
- [Server Actions](06-server-actions.md)
- [API Routes](17-route-handlers.md)