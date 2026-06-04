---
name: nextjs-16
description: Next.js 16 App Router development guide with latest patterns (params Promise, PageProps helpers, useActionState, Server Components, Cache Components, Proxy). Use when creating pages, layouts, routes, Server Actions, or working with Next.js 16 projects.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Next.js 16 Quick Reference

**Version:** 16.1.1 (Jan 2025)  
**Doc Source:** Official Next.js documentation

---

## 🚨 CRITICAL RULES (Always Enforce)

### 1. params are Promise
```typescript
// ❌ WRONG
export default function Page({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1>
}

// ✅ CORRECT
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <h1>{slug}</h1>
}
```

### 2. Use useActionState (NOT useFormState)
```typescript
// ❌ DEPRECATED
import { useFormState } from 'react-dom'

// ✅ CORRECT
import { useActionState } from 'react'
```

### 3. Form Actions Return Void
```typescript
// ❌ WRONG - Form actions can't return data
export async function submitForm(formData: FormData) {
  'use server'
  return { success: true }  // Type error!
}

// ✅ CORRECT - Use revalidation
export async function submitForm(formData: FormData) {
  'use server'
  await saveData(formData)
  revalidatePath('/posts')
  // No return
}
```

### 4. NO `any` Types
```typescript
// ❌ WRONG
const data: any = await fetch(...)

// ✅ CORRECT
const data: Post[] = await fetch(...).then(r => r.json())
```

### 5. Use PageProps/LayoutProps Helpers
```typescript
// ✅ Type-safe with auto-completion
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
}
```

### 6. Use 'use cache' for Cached Dynamic Content
```typescript
// ❌ WRONG - Dynamic data without caching
export default async function Page() {
  const posts = await db.posts.findMany() // Fetched on every request
  return <PostList posts={posts} />
}

// ✅ CORRECT - Cache with 'use cache'
'use cache'
import { cacheLife } from 'next/cache'

export default async function Page() {
  cacheLife('hours') // Cache for 1 hour
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}
```

---

## ⚡ Essential Patterns

### Static Page
```typescript
// app/about/page.tsx
export default function Page() {
  return <h1>About</h1>
}

export const metadata = {
  title: 'About',
  description: 'About page'
}
```

### Dynamic Page
```typescript
// app/blog/[slug]/page.tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPost(slug)
  return <article><h1>{post.title}</h1></article>
}

export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map(p => ({ slug: p.slug }))
}
```

### Root Layout
```typescript
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <nav>{/* Nav */}</nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
```

### Server Action (Form - Void Return)
```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  await db.posts.create({ data: { title } })
  revalidatePath('/posts')
}

// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Server Action (With State - Returns Data)
```typescript
// app/actions.ts
'use server'

export async function updateProfile(prevState: any, formData: FormData) {
  const name = formData.get('name') as string
  if (!name) return { error: 'Name required' }
  await db.users.update({ name })
  return { success: true }
}

// app/profile/page.tsx
'use client'
import { useActionState } from 'react'
import { updateProfile } from '@/app/actions'

export default function Profile() {
  const [state, action, isPending] = useActionState(updateProfile, null)
  
  return (
    <form action={action}>
      <input name="name" required />
      <button disabled={isPending}>Save</button>
      {state?.error && <p>{state.error}</p>}
    </form>
  )
}
```

### Client Component
```typescript
// app/components/counter.tsx
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

### Cache Components (PPR)
```typescript
// app/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'

// Static shell - prerendered at build
export default function Page() {
  return (
    <>
      <header><h1>My Blog</h1></header>
      {/* Cached dynamic - included in static shell */}
      <BlogPosts />
      {/* Runtime dynamic - streams at request */}
      <Suspense fallback={<div>Loading...</div>}>
        <UserPreferences />
      </Suspense>
    </>
  )
}

// Cached component - everyone sees same data
async function BlogPosts() {
  'use cache'
  cacheLife('hours')
  cacheTag('posts')
  
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}

// Runtime component - personalized per user
async function UserPreferences() {
  const session = (await cookies()).get('session')
  return <div>Welcome {session.user}</div>
}
```

### Proxy (Middleware)
```typescript
// proxy.ts (root level)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Redirect
  if (request.nextUrl.pathname === '/old') {
    return NextResponse.redirect(new URL('/new', request.url))
  }
  
  // Modify headers
  const response = NextResponse.next()
  response.headers.set('X-Custom-Header', 'value')
  
  return response
}

// Run on specific paths
export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*']
}
```

---

## 📚 When to Read Additional Files

### Project Setup
**Starting new project?** → [reference/01-project-structure.md](reference/01-project-structure.md)
- Folder conventions (app/, pages/, public/, src/)
- File conventions (page.tsx, layout.tsx, route.ts)
- Route groups `(marketing)`, private folders `_lib`

### Creating Routes
**Creating pages/layouts?** → [reference/02-routing-pages.md](reference/02-routing-pages.md)
- Static and dynamic pages
- Nested routes and layouts
- Dynamic segments `[slug]`, catch-all `[...slug]`
- Parallel routes `@modal`, intercepting routes `(.)`

### Navigation
**Implementing links?** → [reference/03-navigation.md](reference/03-navigation.md)
- `<Link>` component usage
- Prefetching strategies
- Streaming with `loading.tsx`
- `useLinkStatus` hook for slow networks

### Server/Client Components
**Choosing component type?** → [reference/04-server-client.md](reference/04-server-client.md)
- When to use Server vs Client Components
- Data fetching patterns
- Context providers
- Third-party component integration

### TypeScript
**Type issues?** → [reference/05-typescript.md](reference/05-typescript.md)
- PageProps/LayoutProps helpers
- Common type patterns
- Avoiding `any`

### Server Actions
**Form handling?** → [reference/06-server-actions.md](reference/06-server-actions.md)
- Form action patterns
- useActionState usage
- Error handling
- Progressive enhancement

### SEO/Metadata
**Adding metadata?** → [reference/07-metadata-seo.md](reference/07-metadata-seo.md)
- Static & dynamic metadata
- generateMetadata function
- OpenGraph, Twitter cards
- Streaming metadata
- ImageResponse for dynamic OG images
- File-based metadata (favicon, sitemap, robots)

### Cache Components & PPR
**Need caching/prerendering?** → [reference/08-cache-components.md](reference/08-cache-components.md)
- Partial Prerendering (PPR)
- `use cache` directive
- `cacheLife` and cache profiles
- `cacheTag` / `revalidateTag` / `updateTag`
- Static shell + dynamic content patterns

### Proxy (Middleware)
**Request/response modification?** → [reference/09-proxy.md](reference/09-proxy.md)
- Authentication checks
- A/B testing
- Redirects and rewrites
- Header manipulation
- Localization
- Bot detection

### Data Fetching
**Fetching data?** → [reference/10-fetching-data.md](reference/10-fetching-data.md)
- Server Components data fetching
- fetch API with caching
- Parallel vs sequential fetching
- Database queries (Prisma, Drizzle)
- Third-party libraries (Axios, GraphQL)

### Data Updating
**Updating data?** → [reference/11-updating-data.md](reference/11-updating-data.md)
- Server Actions patterns
- Form handling with useActionState
- Optimistic updates with useOptimistic
- Revalidation (revalidatePath, revalidateTag)
- CRUD operations

### Caching & Revalidation
**Configuring cache?** → [reference/12-caching-revalidating.md](reference/12-caching-revalidating.md)
- Request memoization
- Data cache (fetch options)
- Full route cache (ISR)
- Time-based & on-demand revalidation
- Cache configuration

### Error Handling
**Handling errors?** → [reference/13-error-handling.md](reference/13-error-handling.md)
- Error boundaries (error.tsx)
- Not found pages (not-found.tsx)
- Loading states (loading.tsx)
- Server Action error handling
- API route error responses

### CSS & Styling
**Styling components?** → [reference/14-css.md](reference/14-css.md)
- CSS Modules
- Tailwind CSS setup
- Global styles
- CSS-in-JS (styled-jsx, styled-components, Emotion)
- Sass/SCSS

### Image Optimization
**Working with images?** → [reference/15-image-optimization.md](reference/15-image-optimization.md)
- Image component usage
- Local vs remote images
- Responsive images (fill, sizes)
- Performance optimization (priority, lazy loading)
- Placeholder strategies

### Font Optimization
**Adding custom fonts?** → [reference/16-font-optimization.md](reference/16-font-optimization.md)
- Google Fonts integration
- Local fonts setup
- Variable fonts
- Font display strategies
- Multiple fonts configuration

### API Routes
**Creating APIs?** → [reference/17-route-handlers.md](reference/17-route-handlers.md)
- Route handlers (route.ts)
- HTTP methods (GET, POST, PUT, DELETE)
- Request/response handling
- Dynamic routes with params
- CRUD API patterns

### Templates/Examples
**Need templates?**
- [examples/pages.md](examples/pages.md) - Page templates
- [examples/layouts.md](examples/layouts.md) - Layout patterns
- [examples/actions.md](examples/actions.md) - Server Action examples
- [examples/api-routes.md](examples/api-routes.md) - API Route examples

---

### Quick Validation
```bash
# Check params without await
grep -rn "params\." app/ | grep -v "await" | grep -v "props.params"

# TypeScript validation
npx tsc --noEmit

# Find 'any' types (if using ESLint)
npx eslint app/ --ext .ts,.tsx --rule '@typescript-eslint/no-explicit-any: error'
```

---

## ✅ Pre-Coding Checklist

Copy and check before starting:
```
Next.js 16 Requirements:
- [ ] Using PageProps/LayoutProps helpers?
- [ ] All params handled with await?
- [ ] Using useActionState (not useFormState)?
- [ ] Form actions return void?
- [ ] No any types?
- [ ] Server Component unless needs interactivity?
- [ ] 'use client' only when necessary?
- [ ] Added loading.tsx for dynamic routes?
- [ ] generateStaticParams for static generation?
- [ ] Metadata export for SEO?
- [ ] Cache Components enabled if needed?
- [ ] Proxy setup for auth/routing?
- [ ] Error boundaries (error.tsx) added?
- [ ] Using Image component for images?
- [ ] Font optimization with next/font?
- [ ] API routes using NextResponse?
```

---

## 🎯 Common Workflows

### Create New Page Workflow
1. Determine route type (static/dynamic)
2. Create page.tsx in appropriate directory
3. Add PageProps if dynamic: `PageProps<'/path/[param]'>`
4. Await params: `const { param } = await props.params`
5. Add generateStaticParams if prerenderable
6. Export metadata for SEO
7. Add loading.tsx if dynamic

**Detailed guide:** [reference/02-routing-pages.md](reference/02-routing-pages.md)

### Server Action Workflow
1. Create actions.ts with 'use server'
2. Decide: Form action (void) or useActionState (returns data)?
3. Implement function with appropriate return type
4. Add error handling
5. Use revalidatePath/revalidateTag for cache updates
6. Test with form submission

**Detailed guide:** [reference/06-server-actions.md](reference/06-server-actions.md)

### Layout Creation Workflow
1. Identify shared UI elements
2. Create layout.tsx at appropriate level
3. Add LayoutProps if using parallel routes
4. Nest children prop correctly
5. Consider metadata inheritance

**Detailed guide:** [reference/02-routing-pages.md](reference/02-routing-pages.md)

### Cache Components Workflow
1. Enable in next.config.ts: `cacheComponents: true`
2. Identify cacheable vs runtime content
3. Add 'use cache' to cacheable components
4. Set cacheLife: 'hours', 'days', etc.
5. Add cacheTag for revalidation
6. Wrap runtime content in Suspense
7. Use updateTag in Server Actions

**Detailed guide:** [reference/08-cache-components.md](reference/08-cache-components.md)

### Proxy Setup Workflow
1. Create proxy.ts in project root
2. Export proxy function
3. Add matcher config for specific routes
4. Implement logic (auth, redirects, headers)
5. Test with request patterns
6. Optimize for performance (keep fast!)

**Detailed guide:** [reference/09-proxy.md](reference/09-proxy.md)

### Data Fetching Workflow
1. Identify data requirements
2. Use Server Component for data fetching
3. Choose fetch strategy (cached, no-cache, revalidate)
4. Handle parallel vs sequential fetching
5. Add error handling
6. Consider memoization with React cache
7. Add loading.tsx for better UX

**Detailed guide:** [reference/10-fetching-data.md](reference/10-fetching-data.md)

### Error Handling Setup Workflow
1. Create error.tsx at appropriate level
2. Add 'use client' directive
3. Implement error and reset props
4. Add not-found.tsx for 404s
5. Use loading.tsx for loading states
6. Handle Server Action errors with try-catch
7. Test error scenarios

**Detailed guide:** [reference/13-error-handling.md](reference/13-error-handling.md)

### Image Optimization Workflow
1. Replace <img> with next/image
2. Add required props (src, alt, width, height)
3. Configure remotePatterns for external images
4. Use priority for above-the-fold images
5. Add sizes for responsive images
6. Consider placeholder strategies
7. Test performance with Lighthouse

**Detailed guide:** [reference/15-image-optimization.md](reference/15-image-optimization.md)

---

## 🔍 File Conventions Quick Ref

| File | Purpose | Extensions |
|------|---------|------------|
| `page.tsx` | Public route | `.js` `.jsx` `.tsx` |
| `layout.tsx` | Shared wrapper | `.js` `.jsx` `.tsx` |
| `loading.tsx` | Loading state | `.js` `.jsx` `.tsx` |
| `error.tsx` | Error boundary | `.js` `.jsx` `.tsx` |
| `not-found.tsx` | 404 page | `.js` `.jsx` `.tsx` |
| `route.ts` | API endpoint | `.js` `.ts` |
| `proxy.ts` | Middleware | `.js` `.ts` |

**Full reference:** [reference/01-project-structure.md](reference/01-project-structure.md)

---

## 🚫 Common Mistakes

### Mistake 1: Not Awaiting params
```typescript
// ❌ Type Error
const post = await getPost(params.slug)

// ✅ Correct
const { slug } = await params
const post = await getPost(slug)
```

### Mistake 2: Form Action Returns Data
```typescript
// ❌ Type Error
export async function action(formData: FormData) {
  'use server'
  return { success: true }
}

// ✅ Option 1: Void + revalidate
export async function action(formData: FormData) {
  'use server'
  await save(formData)
  revalidatePath('/data')
}

// ✅ Option 2: useActionState
export async function action(prev: any, formData: FormData) {
  'use server'
  await save(formData)
  return { success: true }
}
```

### Mistake 3: Client Component for Data Fetching
```typescript
// ❌ Wrong
'use client'
export default async function Page() { // Can't use async
  const data = await fetch(...)
}

// ✅ Correct
// Server Component (default)
export default async function Page() {
  const data = await fetch(...)
  return <ClientComponent data={data} />
}
```

### Mistake 4: Not Using Cache Components
```typescript
// ❌ Slow - Fetches on every request
export default async function Page() {
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}

// ✅ Fast - Cached with PPR
'use cache'
export default async function Page() {
  cacheLife('hours')
  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}
```

### Mistake 5: Using <img> Instead of <Image>
```typescript
// ❌ Wrong - No optimization
<img src="/photo.jpg" alt="Photo" />

// ✅ Correct - Optimized
import Image from 'next/image'
<Image src="/photo.jpg" alt="Photo" width={800} height={600} />
```

### Mistake 6: Missing Error Boundaries
```typescript
// ❌ Wrong - No error handling
export default async function Page() {
  const data = await fetch(url).then(r => r.json())
  return <div>{data.title}</div>
}

// ✅ Correct - Add error.tsx
// app/posts/error.tsx
'use client'
export default function Error({ error, reset }) {
  return <div>Error: {error.message}</div>
}
```

---

## 📖 Full Documentation Links

### Core Features
- **Project Structure** → [reference/01-project-structure.md](reference/01-project-structure.md)
- **Routing & Pages** → [reference/02-routing-pages.md](reference/02-routing-pages.md)
- **Navigation** → [reference/03-navigation.md](reference/03-navigation.md)
- **Server/Client Components** → [reference/04-server-client.md](reference/04-server-client.md)
- **TypeScript Patterns** → [reference/05-typescript.md](reference/05-typescript.md)
- **Server Actions** → [reference/06-server-actions.md](reference/06-server-actions.md)
- **Metadata & SEO** → [reference/07-metadata-seo.md](reference/07-metadata-seo.md)

### Performance & Optimization
- **Cache Components (PPR)** → [reference/08-cache-components.md](reference/08-cache-components.md)
- **Proxy (Middleware)** → [reference/09-proxy.md](reference/09-proxy.md)
- **Data Fetching** → [reference/10-fetching-data.md](reference/10-fetching-data.md)
- **Data Updating** → [reference/11-updating-data.md](reference/11-updating-data.md)
- **Caching & Revalidation** → [reference/12-caching-revalidating.md](reference/12-caching-revalidating.md)
- **Image Optimization** → [reference/15-image-optimization.md](reference/15-image-optimization.md)
- **Font Optimization** → [reference/16-font-optimization.md](reference/16-font-optimization.md)

### Error Handling & Styling
- **Error Handling** → [reference/13-error-handling.md](reference/13-error-handling.md)
- **CSS & Styling** → [reference/14-css.md](reference/14-css.md)

### API Development
- **Route Handlers (API)** → [reference/17-route-handlers.md](reference/17-route-handlers.md)

---

**Remember:** params are Promise, use useActionState, leverage Cache Components for performance, optimize images with next/image!