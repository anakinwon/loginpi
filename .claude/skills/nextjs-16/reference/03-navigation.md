# Next.js 16 Navigation & Performance Reference

**Doc Version:** 16.1.1  
**Source:** Official Next.js Linking and Navigating documentation

---

## Contents

- [How Navigation Works](#how-navigation-works)
- [Using Link Component](#using-link-component)
- [Prefetching Strategies](#prefetching-strategies)
- [Streaming with loading.tsx](#streaming-with-loadingtsx)
- [Optimizing Slow Networks](#optimizing-slow-networks)
- [Performance Optimization](#performance-optimization)
- [Programmatic Navigation](#programmatic-navigation)
- [Native History API](#native-history-api)

---

## How Navigation Works

Next.js optimizes navigation through four key mechanisms:

1. **Server Rendering** - Routes rendered on server (static or dynamic)
2. **Prefetching** - Routes loaded in background before user clicks
3. **Streaming** - Progressive rendering for dynamic content
4. **Client-side Transitions** - Fast updates without full page reload

### Server Rendering

Routes are Server Components by default and render on the server.

**Static Rendering (Build Time):**
```typescript
// app/about/page.tsx
export default function Page() {
  return <h1>About</h1>
}
// Pre-rendered at build time, cached
```

**Dynamic Rendering (Request Time):**
```typescript
// app/dashboard/page.tsx
export default async function Page() {
  const user = await getCurrentUser() // Runs on each request
  return <h1>Welcome {user.name}</h1>
}
```

### Prefetching

`<Link>` automatically prefetches routes when they enter the viewport.
```typescript
import Link from 'next/link'

export default function Nav() {
  return (
    <nav>
      {/* Prefetched when visible */}
      <Link href="/blog">Blog</Link>
      
      {/* No prefetching */}
      <a href="/contact">Contact</a>
    </nav>
  )
}
```

**How much is prefetched:**
- **Static routes**: Full route prefetched
- **Dynamic routes**: Prefetching skipped OR partial (if loading.tsx exists)

### Streaming

Streaming sends parts of a route as they're ready, instead of waiting for everything.

**Without streaming:**
```
Server renders everything → Client waits → Page appears
[████████████████] Wait... → Shows
```

**With streaming:**
```
Server sends layout → Shows immediately
[███░░░░░] → Layout visible
[█████░░░] → First section visible
[████████] → Complete
```

### Client-side Transitions

`<Link>` performs client-side navigation:
- Preserves scroll position
- Keeps shared layouts mounted
- Updates only changed content
- No full page reload

---

## Using Link Component

### Basic Usage
```typescript
import Link from 'next/link'

export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/blog">Blog</Link>
    </nav>
  )
}
```

### Dynamic Links
```typescript
export default function BlogList({ posts }) {
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

### Links with Search Params
```typescript
// String syntax
<Link href="/shop?category=shoes&sort=asc">
  Shoes (A-Z)
</Link>

// Object syntax (cleaner)
<Link href={{
  pathname: '/shop',
  query: { 
    category: 'shoes',
    sort: 'asc' 
  },
}}>
  Shoes (A-Z)
</Link>
```

### Active Link Styling
```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()
  
  return (
    <nav>
      <Link 
        href="/blog" 
        className={pathname === '/blog' ? 'active' : ''}
      >
        Blog
      </Link>
    </nav>
  )
}
```

---

## Prefetching Strategies

### Default Prefetching
```typescript
// Automatically prefetches when link enters viewport
<Link href="/blog">Blog</Link>
```

**Behavior:**
- **Static route**: Entire route prefetched
- **Dynamic route without loading.tsx**: No prefetch
- **Dynamic route with loading.tsx**: Partial prefetch (layout + loading)

### Disable Prefetching
```typescript
// No prefetching at all
<Link href="/blog" prefetch={false}>
  Blog
</Link>
```

**When to disable:**
- Large lists of links (e.g., infinite scroll)
- Links to external sites
- Resource-constrained environments

### Prefetch on Hover Only
```typescript
'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function HoverPrefetchLink({ href, children }) {
  const [prefetch, setPrefetch] = useState(false)
  
  return (
    <Link
      href={href}
      prefetch={prefetch ? undefined : false}
      onMouseEnter={() => setPrefetch(true)}
    >
      {children}
    </Link>
  )
}
```

**Benefits:**
- Reduces unnecessary prefetching
- Prefetches only likely-to-visit routes
- Better resource usage

---

## Streaming with loading.tsx

### Why Streaming Matters

Without `loading.tsx`, dynamic routes wait for server response before showing anything.

**Problem:**
```
User clicks link → Waits... → Page appears
❌ Feels slow, no visual feedback
```

**Solution with loading.tsx:**
```
User clicks link → Loading state immediately → Page appears
✅ Instant feedback, feels responsive
```

### Basic Loading State
```typescript
// app/blog/loading.tsx
export default function Loading() {
  return (
    <div>
      <div className="skeleton-header" />
      <div className="skeleton-content" />
    </div>
  )
}

// app/blog/page.tsx
export default async function Page() {
  const posts = await getPosts() // Slow
  return <PostList posts={posts} />
}
```

**What happens:**
1. User clicks link to `/blog`
2. Loading skeleton shows instantly
3. Server renders page in background
4. Loading swapped for actual content

### Route-Specific Loading
```
app/dashboard/
├── loading.tsx              # For entire /dashboard
├── page.tsx
└── (overview)/
    ├── loading.tsx          # Only for /dashboard (overview route)
    └── page.tsx
```
```typescript
// app/dashboard/(overview)/loading.tsx
export default function Loading() {
  return <DashboardSkeleton />
}

// Other dashboard routes won't use this loading state
```

### Suspense for Granular Loading
```typescript
import { Suspense } from 'react'

async function SlowComponent() {
  const data = await fetchSlowData()
  return <div>{data}</div>
}

async function FastComponent() {
  const data = await fetchFastData()
  return <div>{data}</div>
}

export default function Page() {
  return (
    <div>
      {/* Shows immediately */}
      <Suspense fallback={<p>Loading fast...</p>}>
        <FastComponent />
      </Suspense>
      
      {/* Shows when ready */}
      <Suspense fallback={<p>Loading slow...</p>}>
        <SlowComponent />
      </Suspense>
    </div>
  )
}
```

---

## Optimizing Slow Networks

### Problem: Prefetch Incomplete

On slow networks, prefetch may not finish before user clicks.

**Symptoms:**
- Click feels unresponsive
- No immediate visual feedback
- Loading state doesn't appear

### Solution 1: useLinkStatus Hook

Show loading indicator while transition is in progress.
```typescript
// app/components/loading-indicator.tsx
'use client'

import { useLinkStatus } from 'next/link'

export default function LoadingIndicator() {
  const { pending } = useLinkStatus()
  
  return (
    <div 
      className={`loading-bar ${pending ? 'active' : ''}`}
      aria-hidden
    />
  )
}
```

**CSS with delay (prevents flash):**
```css
.loading-bar {
  opacity: 0;
  animation-delay: 100ms; /* Show only if >100ms */
}

.loading-bar.active {
  opacity: 1;
  animation: progress 2s ease-out;
}

@keyframes progress {
  0% { width: 0%; }
  100% { width: 100%; }
}
```

### Solution 2: Always Use loading.tsx
```typescript
// app/blog/[slug]/loading.tsx
export default function Loading() {
  return <ArticleSkeleton />
}
```

**Benefits:**
- Enables partial prefetch (layout + loading)
- Shows instant feedback
- Better perceived performance

### Solution 3: Static Generation
```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPost(slug)
  return <article>{post.title}</article>
}
```

**Result:**
- Pages pre-rendered at build time
- No server wait on navigation
- Instant load

---

## Performance Optimization

### Checklist for Fast Navigation
```
Dynamic Routes:
✓ Add loading.tsx for instant feedback
✓ Use generateStaticParams if possible
✓ Enable partial prefetch

Static Routes:
✓ Pre-render at build time
✓ Automatic full prefetch
✓ Instant navigation

Slow Networks:
✓ Use useLinkStatus for feedback
✓ Add loading.tsx
✓ Consider hover-only prefetch

Large Link Lists:
✓ Disable prefetch: prefetch={false}
✓ Use intersection observer for selective prefetch
✓ Paginate if possible
```

### Avoid Common Pitfalls

❌ **No loading.tsx for dynamic routes**
```typescript
// Bad: No visual feedback
// app/blog/[slug]/page.tsx only
```

✅ **Add loading.tsx**
```typescript
// Good: Instant feedback
// app/blog/[slug]/loading.tsx
// app/blog/[slug]/page.tsx
```

---

❌ **Missing generateStaticParams**
```typescript
// Bad: Falls back to dynamic rendering
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  // Runtime rendering on each visit
}
```

✅ **Add generateStaticParams**
```typescript
// Good: Pre-rendered at build time
export async function generateStaticParams() {
  return await getPosts().map(p => ({ slug: p.slug }))
}
```

---

❌ **Prefetch all links in large lists**
```typescript
// Bad: 1000 prefetch requests
{posts.map(post => (
  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
))}
```

✅ **Disable or limit prefetch**
```typescript
// Good: No unnecessary prefetches
{posts.map(post => (
  <Link href={`/blog/${post.slug}`} prefetch={false}>
    {post.title}
  </Link>
))}
```

---

## Programmatic Navigation

### useRouter Hook
```typescript
'use client'

import { useRouter } from 'next/navigation'

export default function Form() {
  const router = useRouter()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    await saveData()
    router.push('/dashboard')
  }
  
  return <form onSubmit={handleSubmit}>...</form>
}
```

### Navigation Methods
```typescript
const router = useRouter()

// Navigate to route
router.push('/dashboard')

// Replace current route (no back button)
router.replace('/login')

// Go back
router.back()

// Go forward
router.forward()

// Refresh current route
router.refresh()

// Prefetch route
router.prefetch('/blog')
```

### Redirect (Server Component)
```typescript
import { redirect } from 'next/navigation'

export default async function Page() {
  const session = await getSession()
  
  if (!session) {
    redirect('/login')
  }
  
  return <Dashboard />
}
```

### Conditional Navigation
```typescript
'use client'

import { useRouter } from 'next/navigation'

export default function ConditionalNav() {
  const router = useRouter()
  
  const handleClick = () => {
    if (confirm('Are you sure?')) {
      router.push('/delete')
    }
  }
  
  return <button onClick={handleClick}>Delete</button>
}
```

---

## Native History API

Next.js integrates with browser History API for advanced use cases.

### window.history.pushState

Add new entry to history stack (user can go back).
```typescript
'use client'

import { useSearchParams } from 'next/navigation'

export default function SortProducts() {
  const searchParams = useSearchParams()
  
  function updateSorting(sortOrder: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sortOrder)
    window.history.pushState(null, '', `?${params.toString()}`)
  }
  
  return (
    <>
      <button onClick={() => updateSorting('asc')}>
        Sort Ascending
      </button>
      <button onClick={() => updateSorting('desc')}>
        Sort Descending
      </button>
    </>
  )
}
```

**Result:**
- URL updates: `/products?sort=asc`
- User can click back button
- `useSearchParams` automatically syncs

### window.history.replaceState

Replace current entry (user cannot go back).
```typescript
'use client'

import { usePathname } from 'next/navigation'

export default function LocaleSwitcher() {
  const pathname = usePathname()
  
  function switchLocale(locale: string) {
    const newPath = `/${locale}${pathname}`
    window.history.replaceState(null, '', newPath)
  }
  
  return (
    <>
      <button onClick={() => switchLocale('en')}>English</button>
      <button onClick={() => switchLocale('ko')}>한국어</button>
    </>
  )
}
```

**Result:**
- URL updates: `/ko/about`
- No back button entry
- Seamless locale switch

### Use Cases

| API | Use Case | Back Button |
|-----|----------|-------------|
| `pushState` | Filters, sorting, pagination | ✅ Works |
| `replaceState` | Locale, theme, temporary state | ❌ Skipped |

---

## Performance Patterns

### Pattern 1: Instant Navigation with Loading
```typescript
// app/blog/loading.tsx
export default function Loading() {
  return <ArticleSkeleton />
}

// app/blog/page.tsx
export default async function Page() {
  const posts = await getPosts()
  return <PostList posts={posts} />
}
```

### Pattern 2: Progressive Enhancement
```typescript
// Works without JS (form submission)
<form action="/search" method="get">
  <input name="q" />
  <button type="submit">Search</button>
</form>

// Enhanced with JS (client-side navigation)
'use client'

import { useRouter } from 'next/navigation'

export default function SearchForm() {
  const router = useRouter()
  
  const handleSubmit = (e) => {
    e.preventDefault()
    const q = new FormData(e.target).get('q')
    router.push(`/search?q=${q}`)
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="q" />
      <button type="submit">Search</button>
    </form>
  )
}
```

### Pattern 3: Optimistic UI
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LikeButton({ postId, initialLikes }) {
  const router = useRouter()
  const [likes, setLikes] = useState(initialLikes)
  const [pending, setPending] = useState(false)
  
  const handleLike = async () => {
    setPending(true)
    setLikes(likes + 1) // Optimistic update
    
    try {
      await likePost(postId)
      router.refresh() // Sync with server
    } catch (error) {
      setLikes(likes) // Rollback on error
    } finally {
      setPending(false)
    }
  }
  
  return (
    <button onClick={handleLike} disabled={pending}>
      ❤️ {likes}
    </button>
  )
}
```

---

## Quick Reference

### Navigation Methods
```typescript
// Link component (preferred)
<Link href="/blog">Blog</Link>

// Programmatic
router.push('/blog')
router.replace('/login')
router.back()
router.refresh()

// History API
window.history.pushState(null, '', '/new-url')
window.history.replaceState(null, '', '/new-url')

// Server redirect
redirect('/login')
```

### Prefetch Control
```typescript
// Default (auto prefetch)
<Link href="/blog">Blog</Link>

// Disabled
<Link href="/blog" prefetch={false}>Blog</Link>

// Manual
router.prefetch('/blog')
```

### Loading States
```typescript
// Route-level
// app/blog/loading.tsx

// Component-level
<Suspense fallback={<Loading />}>
  <AsyncComponent />
</Suspense>

// Transition indicator
const { pending } = useLinkStatus()
```

---

**Related Documentation:**
- [Project Structure](01-project-structure.md)
- [Routing & Pages](02-routing-pages.md)
- [Server/Client Components](04-server-client.md)