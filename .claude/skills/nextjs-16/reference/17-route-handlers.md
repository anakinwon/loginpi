# Route Handlers Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Route Handlers Documentation

---

## Contents

- [Overview](#overview)
- [Basic Route Handlers](#basic-route-handlers)
- [HTTP Methods](#http-methods)
- [Request and Response](#request-and-response)
- [Dynamic Routes](#dynamic-routes)
- [Common Patterns](#common-patterns)

---

## Overview

Route Handlers allow you to create API endpoints in Next.js using Web `Request` and `Response` APIs.

### Convention

Create `route.ts` (or `.js`) files in the `app/` directory:

```
app/
└── api/
    ├── route.ts           # /api
    ├── posts/
    │   ├── route.ts       # /api/posts
    │   └── [id]/
    │       └── route.ts   # /api/posts/[id]
    └── users/
        └── route.ts       # /api/users
```

---

## Basic Route Handlers

### GET Request

```typescript
// app/api/hello/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Hello World' })
}
```

### With TypeScript

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'

type Post = {
  id: number
  title: string
  content: string
}

export async function GET(): Promise<NextResponse<Post[]>> {
  const posts: Post[] = [
    { id: 1, title: 'Post 1', content: 'Content 1' },
    { id: 2, title: 'Post 2', content: 'Content 2' },
  ]
  
  return NextResponse.json(posts)
}
```

---

## HTTP Methods

### GET

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const posts = await db.post.findMany()
  return NextResponse.json(posts)
}
```

### POST

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  const body = await request.json()
  
  const post = await db.post.create({
    data: {
      title: body.title,
      content: body.content,
    },
  })
  
  return NextResponse.json(post, { status: 201 })
}
```

### PUT/PATCH

```typescript
// app/api/posts/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  
  const post = await db.post.update({
    where: { id },
    data: body,
  })
  
  return NextResponse.json(post)
}
```

### DELETE

```typescript
// app/api/posts/[id]/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  await db.post.delete({ where: { id } })
  
  return NextResponse.json({ success: true })
}
```

---

## Request and Response

### Reading Request Data

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // JSON body
  const body = await request.json()
  
  // Form data
  const formData = await request.formData()
  const title = formData.get('title')
  
  // Headers
  const contentType = request.headers.get('content-type')
  
  // Cookies
  const token = request.cookies.get('token')
  
  // URL parameters
  const { searchParams } = new URL(request.url)
  const page = searchParams.get('page')
  
  return NextResponse.json({ body, title, page })
}
```

### Returning Responses

```typescript
import { NextResponse } from 'next/server'

// JSON response
export async function GET() {
  return NextResponse.json({ message: 'Success' })
}

// With status code
export async function POST() {
  return NextResponse.json({ message: 'Created' }, { status: 201 })
}

// With headers
export async function GET() {
  return NextResponse.json(
    { message: 'Success' },
    {
      headers: {
        'Cache-Control': 'max-age=3600',
      },
    }
  )
}

// Text response
export async function GET() {
  return new Response('Hello World', {
    headers: { 'Content-Type': 'text/plain' },
  })
}

// Redirect
export async function GET() {
  return NextResponse.redirect(new URL('/new-url', request.url))
}
```

### Setting Cookies

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  const response = NextResponse.json({ success: true })
  
  response.cookies.set('token', 'abc123', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  })
  
  return response
}
```

---

## Dynamic Routes

### Single Parameter

```typescript
// app/api/posts/[id]/route.ts
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  return NextResponse.json({ id })
}
```

### Multiple Parameters

```typescript
// app/api/users/[userId]/posts/[postId]/route.ts
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string; postId: string }> }
) {
  const { userId, postId } = await params
  
  return NextResponse.json({ userId, postId })
}
```

### Query Parameters

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  const page = searchParams.get('page') || '1'
  const limit = searchParams.get('limit') || '10'
  const search = searchParams.get('search') || ''
  
  return NextResponse.json({ page, limit, search })
}

// Usage: /api/posts?page=2&limit=20&search=nextjs
```

---

## Common Patterns

### Pattern 1: CRUD API

```typescript
// app/api/posts/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/posts - List all posts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  
  const posts = await db.post.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
  
  return NextResponse.json(posts)
}

// POST /api/posts - Create post
export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    const post = await db.post.create({
      data: {
        title: body.title,
        content: body.content,
      },
    })
    
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    )
  }
}

// app/api/posts/[id]/route.ts

// GET /api/posts/[id] - Get single post
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

// PATCH /api/posts/[id] - Update post
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  
  const post = await db.post.update({
    where: { id },
    data: body,
  })
  
  return NextResponse.json(post)
}

// DELETE /api/posts/[id] - Delete post
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  await db.post.delete({ where: { id } })
  
  return NextResponse.json({ success: true })
}
```

### Pattern 2: Authentication API

```typescript
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    
    // Find user
    const user = await db.user.findUnique({ where: { email } })
    
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password)
    
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    )
    
    // Set cookie
    const response = NextResponse.json({
      user: { id: user.id, email: user.email }
    })
    
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
    })
    
    return response
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Pattern 3: File Upload

```typescript
// app/api/upload/route.ts
import { NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }
    
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    const filename = `${Date.now()}-${file.name}`
    const path = join(process.cwd(), 'public/uploads', filename)
    
    await writeFile(path, buffer)
    
    return NextResponse.json({
      url: `/uploads/${filename}`,
      filename,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
```

### Pattern 4: Search API

```typescript
// app/api/search/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  
  if (!q) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    )
  }
  
  const results = await db.post.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
  })
  
  return NextResponse.json(results)
}
```

### Pattern 5: Webhook Handler

```typescript
// app/api/webhook/stripe/route.ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!
  
  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
    
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object
        // Handle successful payment
        break
      case 'customer.subscription.created':
        const subscription = event.data.object
        // Handle new subscription
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
    
    return NextResponse.json({ received: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Webhook error' },
      { status: 400 }
    )
  }
}
```

### Pattern 6: Proxy API

```typescript
// app/api/proxy/route.ts
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter required' },
      { status: 400 }
    )
  }
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    )
  }
}
```

---

## Best Practices

### 1. Use Proper HTTP Status Codes

```typescript
// ✅ GOOD - Proper status codes
export async function POST(request: Request) {
  const post = await db.post.create({ data })
  return NextResponse.json(post, { status: 201 })  // Created
}

export async function GET(request: Request) {
  const post = await db.post.findUnique({ where: { id } })
  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(post)
}

// ❌ BAD - Always 200
export async function POST(request: Request) {
  const post = await db.post.create({ data })
  return NextResponse.json(post)  // Default 200
}
```

### 2. Validate Input

```typescript
// ✅ GOOD - Validation with Zod
import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export async function POST(request: Request) {
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
}

// ❌ BAD - No validation
export async function POST(request: Request) {
  const body = await request.json()
  const post = await db.post.create({ data: body })
  return NextResponse.json(post)
}
```

### 3. Handle Errors Properly

```typescript
// ✅ GOOD - Try-catch with proper errors
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const post = await db.post.create({ data: body })
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    console.error('Failed to create post:', error)
    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    )
  }
}

// ❌ BAD - Unhandled errors
export async function POST(request: Request) {
  const body = await request.json()
  const post = await db.post.create({ data: body })  // Might throw
  return NextResponse.json(post)
}
```

### 4. Use Type-Safe Params

```typescript
// ✅ GOOD - Typed params
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return NextResponse.json({ id })
}

// ❌ BAD - Untyped params
export async function GET(request, { params }) {
  const id = params.id
  return NextResponse.json({ id })
}
```

---

## Quick Reference

### Basic Handler

```typescript
// app/api/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Hello' })
}

export async function POST(request: Request) {
  const body = await request.json()
  return NextResponse.json(body, { status: 201 })
}
```

### Common HTTP Methods

```typescript
export async function GET() { /* ... */ }
export async function POST(request: Request) { /* ... */ }
export async function PUT(request: Request) { /* ... */ }
export async function PATCH(request: Request) { /* ... */ }
export async function DELETE(request: Request) { /* ... */ }
export async function HEAD() { /* ... */ }
export async function OPTIONS() { /* ... */ }
```

### Response Helpers

```typescript
// JSON
NextResponse.json(data)
NextResponse.json(data, { status: 201 })

// Redirect
NextResponse.redirect(new URL('/path', request.url))

// Text
new Response('text', { headers: { 'Content-Type': 'text/plain' } })
```

---

**Related Documentation:**
- [Server Actions](06-server-actions.md)
- [Error Handling](13-error-handling.md)
- [Fetching Data](10-fetching-data.md)