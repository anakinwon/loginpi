# API Routes Examples - Ready to Use Templates

Copy and adapt these patterns for your API routes.

---

## Contents

- [Basic Routes](#basic-routes)
- [Dynamic Routes](#dynamic-routes)
- [Request & Response](#request--response)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [CORS & Headers](#cors--headers)
- [File Operations](#file-operations)
- [Database Operations](#database-operations)
- [External API Integration](#external-api-integration)
- [Webhooks](#webhooks)

---

## Basic Routes

### GET Request
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const posts = await db.posts.findMany({
      select: {
        id: true,
        title: true,
        excerpt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    return NextResponse.json(posts)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    )
  }
}
```

### POST Request
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

type CreatePostBody = {
  title: string
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreatePostBody = await request.json()
    
    // Validation
    if (!body.title || body.title.length < 5) {
      return NextResponse.json(
        { error: 'Title must be at least 5 characters' },
        { status: 400 }
      )
    }
    
    if (!body.content || body.content.length < 20) {
      return NextResponse.json(
        { error: 'Content must be at least 20 characters' },
        { status: 400 }
      )
    }
    
    // Create post
    const post = await db.posts.create({
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
```

### PUT Request
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

type UpdatePostBody = {
  id: string
  title?: string
  content?: string
}

export async function PUT(request: NextRequest) {
  try {
    const body: UpdatePostBody = await request.json()
    
    if (!body.id) {
      return NextResponse.json(
        { error: 'Post ID required' },
        { status: 400 }
      )
    }
    
    // Build update data
    const updateData: any = {}
    if (body.title) updateData.title = body.title
    if (body.content) updateData.content = body.content
    
    const post = await db.posts.update({
      where: { id: body.id },
      data: updateData,
    })
    
    return NextResponse.json(post)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    )
  }
}
```

### DELETE Request
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Post ID required' },
        { status: 400 }
      )
    }
    
    await db.posts.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    )
  }
}
```

---

## Dynamic Routes

### Single Dynamic Segment
```typescript
// app/api/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    
    const post = await db.posts.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(post)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    
    await db.posts.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete post' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    
    const post = await db.posts.update({
      where: { id },
      data: body,
    })
    
    return NextResponse.json(post)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update post' },
      { status: 500 }
    )
  }
}
```

### Multiple Dynamic Segments
```typescript
// app/api/users/[userId]/posts/[postId]/route.ts
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{
    userId: string
    postId: string
  }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { userId, postId } = await context.params
    
    const post = await db.posts.findFirst({
      where: {
        id: postId,
        authorId: userId,
      },
    })
    
    if (!post) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(post)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    )
  }
}
```

---

## Request & Response

### Reading Query Parameters
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  // Single value
  const category = searchParams.get('category') // ?category=tech
  const page = parseInt(searchParams.get('page') || '1') // ?page=2
  
  // Multiple values
  const tags = searchParams.getAll('tag') // ?tag=react&tag=nextjs
  
  // Build query
  const posts = await db.posts.findMany({
    where: {
      ...(category && { category }),
      ...(tags.length > 0 && {
        tags: {
          hasSome: tags,
        },
      }),
    },
    skip: (page - 1) * 10,
    take: 10,
  })
  
  return NextResponse.json(posts)
}
```

### Reading Request Headers
```typescript
// app/api/protected/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // Get specific header
  const auth = request.headers.get('authorization')
  const contentType = request.headers.get('content-type')
  
  // Get all headers
  const headers = Object.fromEntries(request.headers.entries())
  
  if (!auth) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  return NextResponse.json({ success: true })
}
```

### Setting Response Headers
```typescript
// app/api/data/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const data = { message: 'Hello' }
  
  return NextResponse.json(data, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      'X-Custom-Header': 'custom-value',
    },
  })
}
```

### Cookies
```typescript
// app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  // Verify credentials...
  
  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set('session', 'token-value', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  
  return NextResponse.json({ success: true })
}

export async function GET(request: NextRequest) {
  // Read cookie
  const cookieStore = await cookies()
  const session = cookieStore.get('session')
  
  if (!session) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }
  
  return NextResponse.json({ session: session.value })
}

export async function DELETE() {
  // Delete cookie
  const cookieStore = await cookies()
  cookieStore.delete('session')
  
  return NextResponse.json({ success: true })
}
```

---

## Authentication

### JWT Authentication
```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    // Verify credentials
    const user = await db.users.findUnique({ where: { email } })
    
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Create JWT
    const token = await new SignJWT({ 
      userId: user.id,
      email: user.email 
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET))
    
    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
    
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    )
  }
}
```

### Protected Route
```typescript
// app/api/protected/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'

async function verifyAuth(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')
  
  if (!token) {
    return null
  }
  
  try {
    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    )
    return payload
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const user = await verifyAuth(request)
  
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // Proceed with authorized user
  return NextResponse.json({ 
    message: 'Protected data',
    userId: user.userId 
  })
}
```

### API Key Authentication
```typescript
// app/api/external/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key required' },
      { status: 401 }
    )
  }
  
  // Verify API key
  const validKey = await db.apiKeys.findUnique({
    where: { key: apiKey },
  })
  
  if (!validKey || !validKey.active) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 403 }
    )
  }
  
  // Log usage
  await db.apiKeyUsage.create({
    data: {
      keyId: validKey.id,
      endpoint: request.url,
    },
  })
  
  return NextResponse.json({ message: 'Success' })
}
```

---

## Error Handling

### Comprehensive Error Handling
```typescript
// app/api/posts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    
    const post = await db.posts.findUnique({
      where: { id },
    })
    
    if (!post) {
      return NextResponse.json(
        { 
          error: 'Post not found',
          code: 'NOT_FOUND'
        },
        { status: 404 }
      )
    }
    
    return NextResponse.json(post)
  } catch (error) {
    // Zod validation error
    if (error instanceof ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors 
        },
        { status: 400 }
      )
    }
    
    // Prisma error
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json(
          { error: 'Record not found' },
          { status: 404 }
        )
      }
    }
    
    // Log error
    console.error('API Error:', error)
    
    // Generic error
    return NextResponse.json(
      { 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    )
  }
}
```

### Custom Error Response
```typescript
// lib/api-error.ts
export class ApiError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message)
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { 
        error: error.message,
        code: error.code 
      },
      { status: error.statusCode }
    )
  }
  
  console.error('Unexpected error:', error)
  
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}

// app/api/posts/route.ts
import { ApiError, errorResponse } from '@/lib/api-error'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (!body.title) {
      throw new ApiError('Title required', 400, 'MISSING_TITLE')
    }
    
    const post = await db.posts.create({ data: body })
    
    return NextResponse.json(post, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
```

---

## CORS & Headers

### CORS Configuration
```typescript
// app/api/public/route.ts
import { NextRequest, NextResponse } from 'next/server'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // or specific domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400', // 24 hours
}

// Handle OPTIONS request (preflight)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  const data = { message: 'Hello from API' }
  
  return NextResponse.json(data, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  return NextResponse.json(
    { success: true, data: body },
    { headers: corsHeaders }
  )
}
```

### Rate Limiting
```typescript
// app/api/limited/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
})

export async function GET(request: NextRequest) {
  const ip = request.ip ?? '127.0.0.1'
  
  const { success, limit, reset, remaining } = await ratelimit.limit(ip)
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(reset).toISOString(),
        },
      }
    )
  }
  
  return NextResponse.json({ message: 'Success' })
}
```

---

## File Operations

### File Upload
```typescript
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }
    
    // Validate file
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 400 }
      )
    }
    
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      )
    }
    
    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    const filename = `${Date.now()}-${file.name}`
    const filepath = join(process.cwd(), 'public/uploads', filename)
    
    await writeFile(filepath, buffer)
    
    return NextResponse.json({
      success: true,
      url: `/uploads/${filename}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}
```

### File Download
```typescript
// app/api/download/[filename]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

type RouteContext = {
  params: Promise<{ filename: string }>
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { filename } = await context.params
    
    // Security: validate filename
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      )
    }
    
    const filepath = join(process.cwd(), 'private/files', filename)
    const file = await readFile(filepath)
    
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'File not found' },
      { status: 404 }
    )
  }
}
```

---

## Database Operations

### Pagination
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '10')
  const skip = (page - 1) * limit
  
  const [posts, total] = await Promise.all([
    db.posts.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    db.posts.count(),
  ])
  
  return NextResponse.json({
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasMore: skip + posts.length < total,
    },
  })
}
```

### Search & Filtering
```typescript
// app/api/posts/search/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  
  const posts = await db.posts.findMany({
    where: {
      AND: [
        // Search
        query ? {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        } : {},
        
        // Category filter
        category ? { category } : {},
        
        // Status filter
        status ? { status } : {},
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
  
  return NextResponse.json(posts)
}
```

### Aggregation
```typescript
// app/api/stats/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const stats = await db.posts.aggregate({
    _count: { id: true },
    _avg: { views: true },
    _sum: { likes: true },
  })
  
  const categoryStats = await db.posts.groupBy({
    by: ['category'],
    _count: { id: true },
  })
  
  return NextResponse.json({
    total: stats._count.id,
    avgViews: stats._avg.views,
    totalLikes: stats._sum.likes,
    byCategory: categoryStats,
  })
}
```

---

## External API Integration

### Proxy API Request
```typescript
// app/api/proxy/weather/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  
  if (!city) {
    return NextResponse.json(
      { error: 'City required' },
      { status: 400 }
    )
  }
  
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    )
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Weather data not found' },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch weather' },
      { status: 500 }
    )
  }
}
```

### OAuth Callback
```typescript
// app/api/auth/callback/google/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', request.url))
  }
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    })
    
    const tokens = await tokenResponse.json()
    
    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    
    const user = await userResponse.json()
    
    // Create or update user in database
    const dbUser = await db.users.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: user.name,
        avatar: user.picture,
      },
      update: {
        name: user.name,
        avatar: user.picture,
      },
    })
    
    // Set session
    const cookieStore = await cookies()
    cookieStore.set('user_id', dbUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
    })
    
    return NextResponse.redirect(new URL('/dashboard', request.url))
  } catch (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
  }
}
```

---

## Webhooks

### Stripe Webhook
```typescript
// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')!
  
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('Webhook signature verification failed')
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }
  
  // Handle event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      
      await db.orders.update({
        where: { paymentIntentId: paymentIntent.id },
        data: { status: 'paid' },
      })
      
      break
    
    case 'customer.subscription.created':
      const subscription = event.data.object as Stripe.Subscription
      
      await db.subscriptions.create({
        data: {
          stripeId: subscription.id,
          userId: subscription.metadata.userId,
          status: subscription.status,
        },
      })
      
      break
    
    default:
      console.log(`Unhandled event type: ${event.type}`)
  }
  
  return NextResponse.json({ received: true })
}
```

### GitHub Webhook
```typescript
// app/api/webhooks/github/route.ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function verifySignature(payload: string, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  
  if (!signature || !verifySignature(body, signature)) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    )
  }
  
  const event = request.headers.get('x-github-event')
  const payload = JSON.parse(body)
  
  switch (event) {
    case 'push':
      console.log(`Push to ${payload.repository.full_name}`)
      // Handle push event
      break
    
    case 'pull_request':
      console.log(`PR ${payload.action}: ${payload.pull_request.title}`)
      // Handle pull request
      break
    
    default:
      console.log(`Unhandled event: ${event}`)
  }
  
  return NextResponse.json({ success: true })
}
```

---

## Quick Reference

### Route Structure
```typescript
// app/api/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({ method: 'GET' })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  return NextResponse.json(body, { status: 201 })
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({ method: 'PUT' })
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  return NextResponse.json({ method: 'PATCH' })
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204 })
}
```

### Common Patterns
```typescript
// Query params
const { searchParams } = new URL(request.url)
const param = searchParams.get('key')

// Headers
const auth = request.headers.get('authorization')

// Body
const body = await request.json()
const formData = await request.formData()

// Response
return NextResponse.json(data, { status: 200 })

// Redirect
return NextResponse.redirect(new URL('/path', request.url))

// Cookies
const cookieStore = await cookies()
cookieStore.set('key', 'value')
const value = cookieStore.get('key')
```

---

**Related Documentation:**
- [Server Actions Examples](./actions.md)
- [TypeScript Patterns](../reference/05-typescript.md)
- [Server/Client Components](../reference/04-server-client.md)