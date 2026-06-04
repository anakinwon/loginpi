# Next.js 16 Project Structure Reference

**Doc Version:** 16.1.1  
**Source:** Official Next.js Project Structure documentation

---

## Contents

- [Top-Level Folders](#top-level-folders)
- [Top-Level Configuration Files](#top-level-configuration-files)
- [Routing Files](#routing-files)
- [Route Patterns](#route-patterns)
- [Metadata Files](#metadata-files)
- [Component Hierarchy](#component-hierarchy)
- [Organization Strategies](#organization-strategies)

---

## Top-Level Folders
```
my-nextjs-app/
├── app/            # App Router (recommended)
├── pages/          # Pages Router (legacy)
├── public/         # Static assets (served at /)
└── src/            # Optional source folder
```

### app/
App Router directory. All routes, layouts, and pages go here.
```
app/
├── layout.tsx      # Root layout (required)
├── page.tsx        # Home page (/)
├── blog/
│   ├── layout.tsx  # Blog layout
│   ├── page.tsx    # Blog list (/blog)
│   └── [slug]/
│       └── page.tsx # Blog post (/blog/hello)
```

### public/
Static files served from root URL.
```
public/
├── images/
│   └── logo.png    # Accessible at /images/logo.png
├── robots.txt      # Accessible at /robots.txt
└── favicon.ico     # Accessible at /favicon.ico
```

### src/
Optional. Move `app/` inside for cleaner root.
```
src/
└── app/            # Routes here instead of root
    ├── layout.tsx
    └── page.tsx
```

**Note:** Either `app/` or `src/app/`, not both.

---

## Top-Level Configuration Files

### Essential Files

| File | Purpose |
|------|---------|
| `next.config.js` | Next.js configuration |
| `package.json` | Dependencies and scripts |
| `.env.local` | Local environment variables (gitignored) |
| `.env.production` | Production environment variables |
| `tsconfig.json` | TypeScript configuration |
| `.gitignore` | Git ignore patterns |

### Example next.config.js
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['example.com'],
  },
  experimental: {
    typedRoutes: true,
  },
}

module.exports = nextConfig
```

### Environment Variables
```bash
# .env.local (gitignored, local development only)
DATABASE_URL=postgresql://localhost:5432/mydb
API_SECRET=your-secret-key

# .env.production (gitignored, production only)
DATABASE_URL=postgresql://prod-server/db
API_SECRET=production-secret
```

**Public variables:** Prefix with `NEXT_PUBLIC_`
```bash
NEXT_PUBLIC_API_URL=https://api.example.com
```

---

## Routing Files

### Core Files

| File | Purpose | When Route Becomes Public |
|------|---------|---------------------------|
| `page.tsx` | Page UI | ✅ Creates public route |
| `layout.tsx` | Shared wrapper | ❌ No public route (wraps children) |
| `loading.tsx` | Loading fallback | ❌ No public route |
| `error.tsx` | Error boundary | ❌ No public route |
| `not-found.tsx` | 404 page | ❌ No public route |
| `route.ts` | API endpoint | ✅ Creates public route |

### File Extensions
- Pages/Layouts: `.js`, `.jsx`, `.tsx`
- API Routes: `.js`, `.ts`

### Example Structure
```
app/
├── layout.tsx          # Root layout (wraps all)
├── page.tsx            # Public: /
├── blog/
│   ├── layout.tsx      # Blog layout (wraps blog/*)
│   ├── loading.tsx     # Loading state for blog pages
│   ├── error.tsx       # Error boundary for blog pages
│   ├── page.tsx        # Public: /blog
│   └── [slug]/
│       ├── page.tsx    # Public: /blog/[slug]
│       └── not-found.tsx # 404 for invalid slug
└── api/
    └── posts/
        └── route.ts    # Public: /api/posts
```

---

## Route Patterns

### Static Routes
```
app/about/page.tsx          → /about
app/blog/page.tsx           → /blog
app/products/list/page.tsx  → /products/list
```

### Dynamic Routes
```
app/blog/[slug]/page.tsx              → /blog/hello, /blog/world
app/shop/[category]/[id]/page.tsx     → /shop/shoes/123
```

**Access params:**
```typescript
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <h1>{slug}</h1>
}
```

### Catch-All Routes
```
app/docs/[...slug]/page.tsx   → /docs/a, /docs/a/b, /docs/a/b/c
```

**NOT matched:** `/docs` (requires at least one segment)
```typescript
export default async function Page(
  props: PageProps<'/docs/[...slug]'>
) {
  const { slug } = await props.params // slug: string[]
  return <h1>{slug.join('/')}</h1>
}
```

### Optional Catch-All Routes
```
app/docs/[[...slug]]/page.tsx → /docs, /docs/a, /docs/a/b
```

**ALSO matched:** `/docs` (zero segments OK)

---

## Route Groups and Private Folders

### Route Groups `(name)`

Organize without affecting URL.
```
app/
├── (marketing)/
│   ├── about/page.tsx      → /about (not /marketing/about)
│   └── contact/page.tsx    → /contact
└── (shop)/
    ├── cart/page.tsx       → /cart
    └── checkout/page.tsx   → /checkout
```

**Use cases:**
- Organize by feature/team
- Multiple layouts at same level
- Multiple root layouts

**Multiple Root Layouts:**
```
app/
├── (marketing)/
│   ├── layout.tsx          # Marketing layout
│   └── about/page.tsx
└── (app)/
    ├── layout.tsx          # App layout
    └── dashboard/page.tsx
```

### Private Folders `_name`

Not routable. Safe for utilities.
```
app/
├── blog/
│   ├── _components/        # Not routable
│   │   └── PostCard.tsx
│   ├── _lib/               # Not routable
│   │   └── api.ts
│   └── page.tsx            # Public: /blog
```

---

## Parallel and Intercepting Routes

### Parallel Routes `@slot`

Multiple pages in same layout.
```
app/
├── layout.tsx
├── @modal/
│   └── login/page.tsx
├── @sidebar/
│   └── page.tsx
└── page.tsx
```

**Access in layout:**
```typescript
export default function Layout({
  children,
  modal,
  sidebar,
}: {
  children: React.ReactNode
  modal: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <>
      {sidebar}
      <main>{children}</main>
      {modal}
    </>
  )
}
```

### Intercepting Routes

Show route in current context (modal over list).

| Pattern | Intercepts |
|---------|------------|
| `(.)folder` | Same level |
| `(..)folder` | Parent level |
| `(..)(..)folder` | Two levels up |
| `(...)folder` | From root |

**Example: Photo modal**
```
app/
├── photos/
│   ├── [id]/page.tsx           # Full page: /photos/123
│   └── page.tsx                # Gallery: /photos
└── @modal/
    └── (.)photos/
        └── [id]/page.tsx       # Modal: /photos/123 (intercepted)
```

---

## Metadata Files

### App Icons
```
app/
├── favicon.ico              # Favicon
├── icon.png                 # App icon
├── apple-icon.png           # Apple touch icon
```

**Or generate:**
```typescript
// app/icon.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(<div>🎨</div>)
}
```

### SEO Files
```
app/
├── sitemap.xml              # Static sitemap
├── robots.txt               # Static robots
├── opengraph-image.png      # OG image
└── twitter-image.png        # Twitter card
```

**Or generate:**
```typescript
// app/sitemap.ts
export default function sitemap() {
  return [
    {
      url: 'https://example.com',
      lastModified: new Date(),
    },
  ]
}
```

---

## Component Hierarchy

Components render in this order:

1. `layout.tsx`
2. `template.tsx` (if exists)
3. `error.tsx` (React error boundary)
4. `loading.tsx` (React suspense boundary)
5. `not-found.tsx` (React error boundary)
6. `page.tsx` or nested `layout.tsx`

**Visual:**
```
layout.tsx
  └─ template.tsx
      └─ error.tsx
          └─ loading.tsx
              └─ not-found.tsx
                  └─ page.tsx
```

**Nested routes inherit:**
```
app/layout.tsx (root)
  └─ app/blog/layout.tsx (blog)
      └─ app/blog/[slug]/page.tsx (post)
```

---

## Organization Strategies

### Strategy 1: Project Files Outside app/
```
my-app/
├── components/         # Shared components
├── lib/               # Utilities
├── app/               # Routes only
│   ├── layout.tsx
│   └── page.tsx
```

**Pros:** Clean separation  
**Cons:** Import paths longer

### Strategy 2: Top-Level Folders Inside app/
```
my-app/
└── app/
    ├── components/    # Shared components
    ├── lib/          # Utilities
    ├── layout.tsx
    └── page.tsx
```

**Pros:** Everything in one place  
**Cons:** app/ gets crowded

### Strategy 3: Split by Feature
```
my-app/
└── app/
    ├── blog/
    │   ├── _components/   # Blog-specific
    │   ├── _lib/         # Blog utilities
    │   └── page.tsx
    ├── shop/
    │   ├── _components/   # Shop-specific
    │   ├── _lib/         # Shop utilities
    │   └── page.tsx
    └── components/        # Shared components
```

**Pros:** Features self-contained  
**Cons:** May duplicate some code

### Recommendation

**Use Strategy 3 for medium/large apps:**
- Feature folders with `_` prefix for internals
- Shared components at `app/components/`
- Shared utilities at `app/lib/`

**Use Strategy 1 for small apps:**
- Simple structure
- Easy to understand

---

## Colocation Rules

**Key principle:** Folders create routes, files don't.
```
app/
├── blog/
│   ├── page.tsx           # Public: /blog
│   ├── PostCard.tsx       # NOT public (no special name)
│   ├── utils.ts           # NOT public
│   └── [slug]/
│       ├── page.tsx       # Public: /blog/[slug]
│       └── Comments.tsx   # NOT public
```

**Only these filenames create routes:**
- `page.tsx` → Public page
- `route.ts` → Public API endpoint
- Everything else → Not routable

**Safe to colocate:**
- Components
- Utilities
- Styles
- Tests
- Types

---

## Quick Reference

### Make Route Public
```bash
# Create page.tsx
touch app/about/page.tsx
```

### Make Route Private (Utilities)
```bash
# Use _ prefix
mkdir app/blog/_components
```

### Organize Without URL Change
```bash
# Use () group
mkdir app/(marketing)
```

### Create API Route
```bash
# Create route.ts
touch app/api/posts/route.ts
```

### Dynamic Segment
```bash
# Use []
mkdir app/blog/[slug]
touch app/blog/[slug]/page.tsx
```

---

## Common Patterns

### Blog Structure
```
app/
├── blog/
│   ├── _components/
│   │   ├── PostCard.tsx
│   │   └── PostList.tsx
│   ├── _lib/
│   │   └── posts.ts
│   ├── layout.tsx
│   ├── page.tsx              # List
│   └── [slug]/
│       ├── page.tsx          # Detail
│       └── not-found.tsx
```

### Dashboard with Layout Groups
```
app/
├── (marketing)/
│   ├── layout.tsx           # Public site layout
│   └── page.tsx
└── (dashboard)/
    ├── layout.tsx           # Dashboard layout
    ├── page.tsx
    └── settings/
        └── page.tsx
```

### E-commerce Structure
```
app/
├── (shop)/
│   ├── layout.tsx
│   ├── products/
│   │   ├── [id]/page.tsx
│   │   └── page.tsx
│   └── cart/
│       └── page.tsx
└── (checkout)/
    ├── layout.tsx          # Different layout
    └── page.tsx
```

---

**Related Documentation:**
- [Routing & Pages](02-routing-pages.md)
- [Navigation](03-navigation.md)
- [TypeScript Patterns](05-typescript.md)