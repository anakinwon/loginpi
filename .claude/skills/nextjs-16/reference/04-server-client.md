# Next.js 16 Server & Client Components Reference

**Doc Version:** 16.1.1  
**Source:** Official Next.js Server and Client Components documentation

---

## Contents

- [When to Use Server vs Client](#when-to-use-server-vs-client)
- [How They Work](#how-they-work)
- [Using Client Components](#using-client-components)
- [Reducing Bundle Size](#reducing-bundle-size)
- [Passing Data Server to Client](#passing-data-server-to-client)
- [Interleaving Components](#interleaving-components)
- [Context Providers](#context-providers)
- [Third-Party Components](#third-party-components)
- [Environment Poisoning Prevention](#environment-poisoning-prevention)
- [Common Patterns](#common-patterns)

---

## When to Use Server vs Client

### Use Client Components When You Need

| Feature | Example |
|---------|---------|
| **Interactivity** | `onClick`, `onChange`, `onSubmit` |
| **State** | `useState`, `useReducer` |
| **Lifecycle** | `useEffect`, `useLayoutEffect` |
| **Browser APIs** | `window`, `localStorage`, `navigator` |
| **Custom Hooks** | `useAuth`, `useCart` |
| **Event Handlers** | Click, hover, focus handlers |
```typescript
// Client Component needed
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <button onClick={() => setCount(count + 1)}>
      Clicks: {count}
    </button>
  )
}
```

### Use Server Components When You Need

| Feature | Example |
|---------|---------|
| **Data Fetching** | Direct database access, API calls |
| **Backend Resources** | Database, filesystem, Redis |
| **Secrets** | API keys, tokens kept server-side |
| **Large Dependencies** | Heavy libraries kept off client bundle |
| **SEO** | Pre-rendered content for crawlers |
```typescript
// Server Component (default)
import { db } from '@/lib/db'

export default async function PostList() {
  const posts = await db.posts.findMany()
  
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Decision Tree
```
Need interactivity or browser APIs?
├─ YES → Client Component ('use client')
└─ NO → Server Component (default)
    │
    ├─ Fetch data from database?
    │  └─ YES → Server Component ✅
    │
    ├─ Use environment variables?
    │  └─ YES → Server Component ✅
    │
    └─ Keep heavy dependencies off client?
       └─ YES → Server Component ✅
```

---

## How They Work

### On the Server

Next.js renders components on the server before sending to client.

**Server Components:**
- Rendered into React Server Component Payload (RSC Payload)
- Compact binary format
- Contains rendered result + placeholders for Client Components

**Client Components:**
- Pre-rendered to HTML on server
- JavaScript sent to client for hydration

**Example:**
```typescript
// app/page.tsx (Server Component)
import LikeButton from './like-button' // Client Component

export default async function Page() {
  const post = await getPost() // Runs on server
  
  return (
    <article>
      <h1>{post.title}</h1>
      {/* Server-rendered content */}
      <LikeButton likes={post.likes} /> {/* Client Component */}
    </article>
  )
}
```

**What gets sent to client:**
1. HTML for initial render
2. RSC Payload with Client Component placeholders
3. JavaScript bundles for Client Components

### On the Client (First Load)

1. **HTML** shows fast non-interactive preview
2. **RSC Payload** reconciles Client/Server component trees
3. **JavaScript** hydrates Client Components (adds interactivity)

**What is hydration?**

Hydration attaches event handlers to static HTML.
```typescript
// Before hydration
<button>Click me</button> // Static HTML, no onClick

// After hydration
<button onClick={handleClick}>Click me</button> // Interactive
```

### Subsequent Navigations

On navigation after initial load:

- **RSC Payload** prefetched and cached
- **Client Components** rendered on client (no server HTML)
- Instant navigation with cached data

---

## Using Client Components

### Add 'use client' Directive

Place at top of file, above imports.
```typescript
// app/components/counter.tsx
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <p>{count} clicks</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  )
}
```

### Boundary Between Server and Client

`'use client'` creates a boundary.

**Everything imported into a Client Component becomes client-side:**
```typescript
// counter.tsx
'use client'

import { useState } from 'react'
import { HeavyChart } from 'heavy-chart-lib' // ⚠️ Now in client bundle!

export default function Counter() {
  const [count, setCount] = useState(0)
  return <div>{count}</div>
}
```

**Child components are automatically client-side:**
```typescript
// counter.tsx
'use client'

import CounterDisplay from './counter-display' // Also client-side now

export default function Counter() {
  const [count, setCount] = useState(0)
  return <CounterDisplay count={count} />
}

// counter-display.tsx
// No 'use client' needed - parent already marked it
export default function CounterDisplay({ count }) {
  return <div>{count}</div>
}
```

---

## Reducing Bundle Size

### Keep 'use client' Low in Tree

❌ **Bad: Large client boundary**
```typescript
// app/layout.tsx
'use client' // ⚠️ Everything is now client-side!

import Nav from './nav'
import Footer from './footer'
import Search from './search' // Only this needs interactivity

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <Nav />
        <Search />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

✅ **Good: Small client boundary**
```typescript
// app/layout.tsx
// Server Component (default)
import Nav from './nav'           // Server Component
import Footer from './footer'     // Server Component
import Search from './search'     // Client Component

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <Nav />           {/* Static */}
        <Search />        {/* Interactive */}
        <main>{children}</main>
        <Footer />        {/* Static */}
      </body>
    </html>
  )
}

// app/search.tsx
'use client' // Only Search is client-side

import { useState } from 'react'

export default function Search() {
  const [query, setQuery] = useState('')
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />
}
```

### Pattern: Extract Interactive Parts
```typescript
// ❌ Bad: Entire component is client
'use client'

export default function Article({ post }) {
  const [liked, setLiked] = useState(false)
  
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      <button onClick={() => setLiked(!liked)}>
        {liked ? '❤️' : '🤍'}
      </button>
    </article>
  )
}

// ✅ Good: Only button is client
// article.tsx (Server Component)
import LikeButton from './like-button'

export default function Article({ post }) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      <LikeButton />
    </article>
  )
}

// like-button.tsx (Client Component)
'use client'

import { useState } from 'react'

export default function LikeButton() {
  const [liked, setLiked] = useState(false)
  
  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? '❤️' : '🤍'}
    </button>
  )
}
```

---

## Passing Data Server to Client

### Props Are the Bridge
```typescript
// app/page.tsx (Server Component)
import LikeButton from './like-button'

export default async function Page({ params }) {
  const post = await getPost(params.id)
  
  return (
    <article>
      <h1>{post.title}</h1>
      {/* Pass data via props */}
      <LikeButton likes={post.likes} postId={post.id} />
    </article>
  )
}

// like-button.tsx (Client Component)
'use client'

import { useState } from 'react'

export default function LikeButton({ 
  likes, 
  postId 
}: { 
  likes: number
  postId: string 
}) {
  const [count, setCount] = useState(likes)
  
  const handleLike = async () => {
    await likePost(postId)
    setCount(count + 1)
  }
  
  return (
    <button onClick={handleLike}>
      ❤️ {count}
    </button>
  )
}
```

### Props Must Be Serializable

✅ **Serializable (OK):**
- Primitives: string, number, boolean
- Objects, arrays
- Dates (converted to ISO string)
- Plain objects

❌ **Not Serializable (Error):**
- Functions
- Class instances
- Symbols
- `undefined` (use `null` instead)
```typescript
// ❌ Bad: Non-serializable props
<ClientComponent 
  onClick={() => {}}        // ❌ Function
  date={new Date()}         // ⚠️ Converted to string
  user={new User()}         // ❌ Class instance
/>

// ✅ Good: Serializable props
<ClientComponent 
  postId="123"              // ✅ String
  likes={42}                // ✅ Number
  tags={['next', 'react']}  // ✅ Array
  metadata={{ views: 100 }} // ✅ Plain object
/>
```

### Stream Data with use Hook

For streaming data from Server to Client:
```typescript
// app/page.tsx (Server Component)
import Comments from './comments'

export default async function Page() {
  const commentsPromise = getComments() // Don't await
  
  return (
    <article>
      <h1>Post</h1>
      {/* Pass promise */}
      <Comments commentsPromise={commentsPromise} />
    </article>
  )
}

// comments.tsx (Client Component)
'use client'

import { use } from 'react'

export default function Comments({ 
  commentsPromise 
}: { 
  commentsPromise: Promise<Comment[]> 
}) {
  const comments = use(commentsPromise) // Unwrap promise
  
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  )
}
```

---

## Interleaving Components

### Server Components as Children

You can pass Server Components as props to Client Components.
```typescript
// modal.tsx (Client Component)
'use client'

import { useState } from 'react'

export default function Modal({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && (
        <div className="modal">
          {children} {/* Can be Server Component! */}
        </div>
      )}
    </>
  )
}

// page.tsx (Server Component)
import Modal from './modal'
import Cart from './cart' // Server Component

export default function Page() {
  return (
    <Modal>
      <Cart /> {/* Server Component inside Client Component */}
    </Modal>
  )
}
```

**Why this works:**

Server Components render on server first, result passed as RSC Payload to Client Component.

### Common Pattern: Slots
```typescript
// client-layout.tsx (Client Component)
'use client'

export default function ClientLayout({
  sidebar,
  content,
}: {
  sidebar: React.ReactNode
  content: React.ReactNode
}) {
  return (
    <div className="layout">
      <aside>{sidebar}</aside>
      <main>{content}</main>
    </div>
  )
}

// page.tsx (Server Component)
import ClientLayout from './client-layout'
import Sidebar from './sidebar'     // Server Component
import Content from './content'     // Server Component

export default function Page() {
  return (
    <ClientLayout
      sidebar={<Sidebar />}
      content={<Content />}
    />
  )
}
```

---

## Context Providers

Context is Client-only. Create Client Component wrapper.

### Create Provider
```typescript
// theme-provider.tsx
'use client'

import { createContext } from 'react'

export const ThemeContext = createContext({})

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeContext.Provider value="dark">
      {children}
    </ThemeContext.Provider>
  )
}
```

### Use in Root Layout
```typescript
// app/layout.tsx (Server Component)
import ThemeProvider from './theme-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### Consume Context
```typescript
// theme-toggle.tsx
'use client'

import { useContext } from 'react'
import { ThemeContext } from './theme-provider'

export default function ThemeToggle() {
  const theme = useContext(ThemeContext)
  return <div>Current theme: {theme}</div>
}
```

### Best Practice: Render Deep

Place providers as deep as possible.

❌ **Bad: Wraps everything**
```typescript
// app/layout.tsx
<html>
  <body>
    <ThemeProvider>
      <nav>...</nav>
      <main>{children}</main>
      <footer>...</footer>
    </ThemeProvider>
  </body>
</html>
```

✅ **Good: Only wraps what needs it**
```typescript
// app/layout.tsx
<html>
  <body>
    <nav>...</nav> {/* Static */}
    <ThemeProvider>
      <main>{children}</main> {/* Dynamic */}
    </ThemeProvider>
    <footer>...</footer> {/* Static */}
  </body>
</html>
```

---

## Third-Party Components

### Wrap Client-Only Libraries

Many npm packages don't have `'use client'` yet.
```typescript
// carousel.tsx (Your wrapper)
'use client'

import { Carousel } from 'acme-carousel' // No 'use client'

export default Carousel
```

**Now safe to use in Server Components:**
```typescript
// page.tsx (Server Component)
import Carousel from './carousel'

export default function Page() {
  return (
    <div>
      <h1>Gallery</h1>
      <Carousel /> {/* Works! */}
    </div>
  )
}
```

### Pattern: Lazy Load Heavy Libraries
```typescript
// heavy-chart.tsx
'use client'

import dynamic from 'next/dynamic'

const Chart = dynamic(() => import('heavy-chart-lib'), {
  loading: () => <div>Loading chart...</div>,
  ssr: false, // Skip server rendering
})

export default function HeavyChart({ data }) {
  return <Chart data={data} />
}
```

---

## Environment Poisoning Prevention

### The Problem

JavaScript modules can leak server-only code to client.
```typescript
// lib/data.ts
export async function getData() {
  const res = await fetch('https://api.example.com/data', {
    headers: {
      authorization: process.env.API_KEY, // ⚠️ Secret!
    },
  })
  
  return res.json()
}
```

**Risk:** If imported into Client Component, `API_KEY` becomes empty string (not exposed to client).

### Solution 1: server-only Package
```bash
npm install server-only
```
```typescript
// lib/data.ts
import 'server-only' // Build error if imported into Client Component

export async function getData() {
  const res = await fetch('https://api.example.com/data', {
    headers: {
      authorization: process.env.API_KEY, // Safe
    },
  })
  
  return res.json()
}
```

**Result:**
```typescript
// counter.tsx
'use client'

import { getData } from '@/lib/data' // ❌ Build error!
```

### Solution 2: client-only Package

For browser-only code:
```bash
npm install client-only
```
```typescript
// lib/analytics.ts
import 'client-only' // Build error if imported into Server Component

export function trackEvent(name: string) {
  window.gtag('event', name) // Uses window
}
```

### Environment Variable Rules

**Server-only (default):**
```bash
DATABASE_URL=postgresql://...
API_KEY=secret123
```

**Client-accessible (NEXT_PUBLIC_ prefix):**
```bash
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```
```typescript
// Server Component - All vars accessible
const dbUrl = process.env.DATABASE_URL // ✅ Works
const apiKey = process.env.API_KEY // ✅ Works
const publicUrl = process.env.NEXT_PUBLIC_API_URL // ✅ Works

// Client Component - Only NEXT_PUBLIC_ accessible
const dbUrl = process.env.DATABASE_URL // ❌ Empty string
const apiKey = process.env.API_KEY // ❌ Empty string
const publicUrl = process.env.NEXT_PUBLIC_API_URL // ✅ Works
```

---

## Common Patterns

### Pattern 1: Form with Server Action + Client State
```typescript
// app/actions.ts (Server)
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title')
  await db.posts.create({ data: { title } })
}

// app/form.tsx (Client)
'use client'

import { useActionState } from 'react'
import { createPost } from './actions'

export default function PostForm() {
  const [state, action, isPending] = useActionState(createPost, null)
  
  return (
    <form action={action}>
      <input name="title" required />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
```

### Pattern 2: Data Fetching + Interactive UI
```typescript
// page.tsx (Server)
export default async function Page() {
  const posts = await getPosts() // Server data fetching
  
  return (
    <div>
      <h1>Posts</h1>
      <PostList posts={posts} /> {/* Client interactivity */}
    </div>
  )
}

// post-list.tsx (Client)
'use client'

import { useState } from 'react'

export default function PostList({ posts }) {
  const [filter, setFilter] = useState('')
  
  const filtered = posts.filter(p => 
    p.title.includes(filter)
  )
  
  return (
    <>
      <input 
        value={filter} 
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter..."
      />
      <ul>
        {filtered.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </>
  )
}
```

### Pattern 3: Loading State + Error Boundary
```typescript
// page.tsx (Server)
import { Suspense } from 'react'
import ErrorBoundary from './error-boundary'
import SlowComponent from './slow-component'

export default function Page() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <SlowComponent />
      </Suspense>
    </ErrorBoundary>
  )
}

// error-boundary.tsx (Client)
'use client'

import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }
  
  static getDerivedStateFromError(error) {
    return { hasError: true }
  }
  
  render() {
    if (this.state.hasError) {
      return <h2>Something went wrong</h2>
    }
    
    return this.props.children
  }
}
```

---

## Quick Reference

### Server vs Client Decision
```typescript
// Server Component (default)
// ✓ Fetch data
// ✓ Access backend
// ✓ Use secrets
// ✗ No interactivity
// ✗ No browser APIs
async function ServerComponent() {
  const data = await db.query()
  return <div>{data}</div>
}

// Client Component ('use client')
// ✓ Interactivity
// ✓ Browser APIs
// ✓ State/effects
// ✗ No direct backend access
// ✗ No secrets
'use client'
function ClientComponent() {
  const [state, setState] = useState()
  return <button onClick={...}>Click</button>
}
```

### Common Client-Side Hooks
```typescript
'use client'

import { 
  useState,        // State
  useEffect,       // Side effects
  useContext,      // Context
  useReducer,      // Complex state
  useCallback,     // Memoized functions
  useMemo,         // Memoized values
  useRef,          // DOM refs
  useTransition,   // Transitions
  useDeferredValue // Deferred values
} from 'react'

import { 
  useRouter,       // Navigation
  usePathname,     // Current path
  useSearchParams, // Query params
  useParams        // Route params (client)
} from 'next/navigation'
```

---

**Related Documentation:**
- [Project Structure](01-project-structure.md)
- [Routing & Pages](02-routing-pages.md)
- [Navigation](03-navigation.md)
- [TypeScript Patterns](05-typescript.md)
- [Server Actions](06-server-actions.md)