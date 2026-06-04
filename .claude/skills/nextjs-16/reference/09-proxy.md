# Proxy (Middleware) Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Proxy (Middleware) Documentation

---

## Contents

- [What is Proxy](#what-is-proxy)
- [Convention](#convention)
- [Matcher Configuration](#matcher-configuration)
- [Request Modification](#request-modification)
- [Response Modification](#response-modification)
- [Common Patterns](#common-patterns)
- [Best Practices](#best-practices)

---

## What is Proxy

Starting with Next.js 16, **Middleware is now called Proxy** to better reflect its purpose. The functionality remains the same.

Proxy allows you to run code **before a request is completed**. You can:

- Modify request/response headers
- Redirect requests
- Rewrite URLs
- Return direct responses

### When to Use Proxy

**Good use cases:**
- Authentication checks (optimistic)
- A/B testing and experiments
- Bot detection
- Localization/i18n
- Header manipulation
- Simple redirects based on request data

**Avoid using Proxy for:**
- Heavy data fetching (use Server Components instead)
- Full session management
- Complex authorization logic
- Database queries

---

## Convention

Create a `proxy.ts` (or `.js`) file in the **project root** or inside `src/`:

```
project/
├── app/
├── proxy.ts      # ✅ Root level
└── package.json

# OR

project/
├── src/
│   ├── app/
│   └── proxy.ts  # ✅ Inside src/
└── package.json
```

### Basic Example

```typescript
// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.next()
}

// Alternatively, use default export
export default function proxy(request: NextRequest) {
  return NextResponse.next()
}
```

---

## Matcher Configuration

The `matcher` config limits which routes trigger the Proxy function.

### Simple Path

```typescript
export const config = {
  matcher: '/about',
}
```

### Multiple Paths

```typescript
export const config = {
  matcher: ['/about', '/dashboard', '/profile'],
}
```

### Path Patterns

```typescript
export const config = {
  matcher: [
    '/api/:path*',        // All /api/* routes
    '/dashboard/:path*',  // All /dashboard/* routes
    '/((?!_next|favicon.ico).*)', // Exclude Next.js internals
  ],
}
```

### With Regex

```typescript
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public files (.svg, .png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## Request Modification

### Reading Request Data

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // URL and pathname
  const url = request.nextUrl
  const pathname = url.pathname
  const searchParams = url.searchParams
  
  // Headers
  const userAgent = request.headers.get('user-agent')
  const acceptLanguage = request.headers.get('accept-language')
  
  // Cookies
  const token = request.cookies.get('token')?.value
  
  // Method
  const method = request.method
  
  console.log({ pathname, userAgent, method })
  
  return NextResponse.next()
}
```

### Rewriting URLs

Change the destination without changing the URL in the browser:

```typescript
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Rewrite /old-blog/* to /blog/*
  if (pathname.startsWith('/old-blog')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/old-blog', '/blog')
    return NextResponse.rewrite(url)
  }
  
  return NextResponse.next()
}
```

### Redirecting

```typescript
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Permanent redirect (308)
  if (pathname === '/old-page') {
    return NextResponse.redirect(
      new URL('/new-page', request.url),
      { status: 308 }
    )
  }
  
  // Temporary redirect (307)
  if (pathname === '/temp-moved') {
    return NextResponse.redirect(
      new URL('/destination', request.url),
      { status: 307 }
    )
  }
  
  return NextResponse.next()
}
```

---

## Response Modification

### Adding Headers

```typescript
export function proxy(request: NextRequest) {
  // Clone the response
  const response = NextResponse.next()
  
  // Add custom headers
  response.headers.set('X-Custom-Header', 'value')
  response.headers.set('X-Request-Id', crypto.randomUUID())
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  return response
}
```

### Setting Cookies

```typescript
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  
  // Set cookie
  response.cookies.set('visited', 'true', {
    maxAge: 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  })
  
  return response
}
```

### Direct Response

```typescript
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Return custom response
  if (pathname === '/api/health') {
    return NextResponse.json(
      { status: 'ok', timestamp: Date.now() },
      { status: 200 }
    )
  }
  
  return NextResponse.next()
}
```

---

## Common Patterns

### Pattern 1: Authentication Check

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Protected routes
  const protectedPaths = ['/dashboard', '/profile', '/settings']
  const isProtected = protectedPaths.some(path => 
    pathname.startsWith(path)
  )
  
  if (isProtected) {
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      // Redirect to login with return URL
      const url = new URL('/login', request.url)
      url.searchParams.set('from', pathname)
      return NextResponse.redirect(url)
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/profile/:path*', '/settings/:path*'],
}
```

### Pattern 2: A/B Testing

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Check for existing variant cookie
  let variant = request.cookies.get('ab-variant')?.value
  
  if (!variant) {
    // Assign random variant (50/50 split)
    variant = Math.random() < 0.5 ? 'A' : 'B'
  }
  
  const response = variant === 'B'
    ? NextResponse.rewrite(new URL('/variant-b', request.url))
    : NextResponse.next()
  
  // Set variant cookie
  response.cookies.set('ab-variant', variant, {
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  
  return response
}

export const config = {
  matcher: '/landing-page',
}
```

### Pattern 3: Localization

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['en', 'ko', 'ja', 'zh']
const defaultLocale = 'en'

function getLocale(request: NextRequest): string {
  // 1. Check URL parameter
  const locale = request.nextUrl.searchParams.get('locale')
  if (locale && locales.includes(locale)) return locale
  
  // 2. Check cookie
  const cookieLocale = request.cookies.get('locale')?.value
  if (cookieLocale && locales.includes(cookieLocale)) return cookieLocale
  
  // 3. Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const preferred = acceptLanguage.split(',')[0].split('-')[0]
    if (locales.includes(preferred)) return preferred
  }
  
  return defaultLocale
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Skip if already has locale
  const hasLocale = locales.some(locale => 
    pathname.startsWith(`/${locale}`)
  )
  
  if (!hasLocale) {
    const locale = getLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}${pathname}`
    
    const response = NextResponse.redirect(url)
    response.cookies.set('locale', locale, {
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
    
    return response
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Pattern 4: Bot Detection

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'slackbot',
  'twitterbot',
  'facebookexternalhit',
]

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return BOT_USER_AGENTS.some(bot => ua.includes(bot))
}

export function proxy(request: NextRequest) {
  const userAgent = request.headers.get('user-agent')
  
  if (isBot(userAgent)) {
    // Serve static version for bots
    return NextResponse.rewrite(
      new URL('/static-version', request.url)
    )
  }
  
  return NextResponse.next()
}
```

### Pattern 5: Rate Limiting

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple in-memory rate limiter (use Redis in production)
const requests = new Map<string, { count: number; resetTime: number }>()

const RATE_LIMIT = 10 // requests
const WINDOW = 60 * 1000 // 1 minute

export function proxy(request: NextRequest) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  
  const current = requests.get(ip)
  
  if (!current || now > current.resetTime) {
    // New window
    requests.set(ip, {
      count: 1,
      resetTime: now + WINDOW,
    })
    return NextResponse.next()
  }
  
  if (current.count >= RATE_LIMIT) {
    // Rate limit exceeded
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    )
  }
  
  // Increment counter
  current.count++
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
```

### Pattern 6: CORS Headers

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const allowedOrigins = [
  'https://example.com',
  'https://app.example.com',
]

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin')
  const isAllowedOrigin = origin && allowedOrigins.includes(origin)
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  
  // Add CORS headers to response
  const response = NextResponse.next()
  
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  
  return response
}

export const config = {
  matcher: '/api/:path*',
}
```

---

## Best Practices

### 1. Keep Proxy Fast

Proxy runs on **every request** that matches the matcher. Keep it fast:

```typescript
// ❌ BAD - Slow database query
export function proxy(request: NextRequest) {
  const user = await db.users.findOne({ token })
  // ...
}

// ✅ GOOD - Fast token validation
export function proxy(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  const isValid = token && token.startsWith('valid_')
  // ...
}
```

### 2. Use Specific Matchers

```typescript
// ❌ BAD - Runs on all routes
export const config = {
  matcher: '/:path*',
}

// ✅ GOOD - Only protected routes
export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
```

### 3. Avoid Heavy Computations

```typescript
// ❌ BAD - Complex logic
export function proxy(request: NextRequest) {
  const data = performComplexCalculation()
  // ...
}

// ✅ GOOD - Simple checks
export function proxy(request: NextRequest) {
  const hasAuth = request.cookies.has('token')
  // ...
}
```

### 4. Handle Errors Gracefully

```typescript
export function proxy(request: NextRequest) {
  try {
    // Your logic
    return NextResponse.next()
  } catch (error) {
    console.error('Proxy error:', error)
    // Fail open - allow request to proceed
    return NextResponse.next()
  }
}
```

### 5. Don't Use for Data Fetching

```typescript
// ❌ BAD - Data fetching in Proxy
export async function proxy(request: NextRequest) {
  const posts = await fetch('https://api.example.com/posts')
  // ...
}

// ✅ GOOD - Fetch in Server Component instead
export default async function Page() {
  const posts = await fetch('https://api.example.com/posts')
  return <PostList posts={posts} />
}
```

---

## Limitations

### 1. No Cache Options

`fetch` options like `cache`, `next.revalidate`, or `next.tags` **have no effect** in Proxy:

```typescript
// ❌ This won't work as expected
export async function proxy(request: NextRequest) {
  const data = await fetch('https://api.example.com', {
    next: { revalidate: 3600 }, // Ignored!
  })
}
```

### 2. Single File Only

Only **one** `proxy.ts` file per project. Organize complex logic by importing modules:

```typescript
// proxy.ts
import { handleAuth } from './lib/proxy/auth'
import { handleLocale } from './lib/proxy/locale'

export function proxy(request: NextRequest) {
  let response = handleAuth(request)
  if (response) return response
  
  response = handleLocale(request)
  if (response) return response
  
  return NextResponse.next()
}
```

### 3. Not for Complex Auth

For full authentication and session management, use dedicated auth libraries or Server Components instead.

---

## Migration from Middleware

If migrating from Next.js 15 or earlier:

1. **Rename function** (optional but recommended):
   ```typescript
   // Old
   export function middleware(request: NextRequest) { }
   
   // New
   export function proxy(request: NextRequest) { }
   ```

2. **Functionality remains the same** - No code changes needed if you keep the old name

3. **Update documentation/comments** to reference "Proxy" instead of "Middleware"

---

## Quick Reference

### Request Properties

```typescript
request.nextUrl          // URL object
request.nextUrl.pathname // Current path
request.nextUrl.search   // Query string
request.headers          // Headers
request.cookies          // Cookies
request.method           // HTTP method
request.ip               // IP address
```

### NextResponse Methods

```typescript
NextResponse.next()                    // Continue to next middleware/route
NextResponse.redirect(url)             // Redirect to URL
NextResponse.rewrite(url)              // Rewrite URL (invisible to user)
NextResponse.json(data, options)       // Return JSON response
```
