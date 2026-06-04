# Metadata & SEO Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Metadata and OG Images Documentation

---

## Contents

- [Overview](#overview)
- [Default Fields](#default-fields)
- [Static Metadata](#static-metadata)
- [Generated Metadata](#generated-metadata)
- [Streaming Metadata](#streaming-metadata)
- [Memoizing Data Requests](#memoizing-data-requests)
- [File-Based Metadata](#file-based-metadata)
- [Favicons](#favicons)
- [Open Graph Images](#open-graph-images)
- [Generated OG Images](#generated-og-images)
- [Common Patterns](#common-patterns)

---

## Overview

The Metadata APIs can be used to define your application metadata for improved SEO and web shareability:

1. **Static `metadata` object** - For static metadata
2. **Dynamic `generateMetadata` function** - For data-dependent metadata
3. **File conventions** - For favicons and OG images

Next.js automatically generates the relevant `<head>` tags for your page.

**Important:** The `metadata` object and `generateMetadata` function exports are **only supported in Server Components**.

---

## Default Fields

Two default `meta` tags are **always added** even if a route doesn't define metadata:

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

- **charset** - Sets character encoding for the website
- **viewport** - Sets viewport width and scale for different devices

---

## Static Metadata

To define static metadata, export a `Metadata` object from a `layout.tsx` or `page.tsx` file.

### Basic Example

```typescript
// app/blog/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Blog',
  description: 'A blog about web development',
}

export default function Layout({ children }) {
  return <>{children}</>
}
```

### Complete Example

```typescript
// app/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Site',
  description: 'Welcome to my site',
  keywords: ['Next.js', 'React', 'JavaScript'],
  authors: [{ name: 'John Doe' }],
  creator: 'John Doe',
  publisher: 'John Doe',
  openGraph: {
    title: 'My Site',
    description: 'Welcome to my site',
    url: 'https://example.com',
    siteName: 'My Site',
    images: [
      {
        url: 'https://example.com/og.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Site',
    description: 'Welcome to my site',
    images: ['https://example.com/twitter.png'],
    creator: '@username',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function Page() {
  return <h1>Home</h1>
}
```

### Title Template

```typescript
// app/layout.tsx
export const metadata: Metadata = {
  title: {
    template: '%s | My Site',
    default: 'My Site',
  },
}

// app/blog/page.tsx
export const metadata: Metadata = {
  title: 'Blog',  // Becomes "Blog | My Site"
}
```

---

## Generated Metadata

Use `generateMetadata` function to fetch metadata that depends on dynamic data.

### Basic Example

```typescript
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  
  // Fetch post information
  const post = await fetch(`https://api.example.com/blog/${slug}`)
    .then((res) => res.json())
  
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/blog/${slug}`)
    .then((res) => res.json())
  
  return <article>{post.title}</article>
}
```

### With Parent Metadata

```typescript
import type { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/blog/${slug}`)
    .then((res) => res.json())
  
  // Access parent metadata
  const previousImages = (await parent).openGraph?.images || []
  
  return {
    title: post.title,
    openGraph: {
      images: [post.coverImage, ...previousImages],
    },
  }
}
```

---

## Streaming Metadata

For dynamically rendered pages, Next.js **streams metadata separately**, injecting it into the HTML once `generateMetadata` resolves, without blocking UI rendering.

### How It Works

1. **Visual content streams first** - Improves perceived performance
2. **Metadata streams separately** - Injected when ready
3. **Disabled for bots** - Bots that expect metadata in `<head>` (e.g., Twitterbot, Slackbot, Bingbot) get blocking metadata

### Configuration

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    htmlLimitedBots: {
      // Customize or disable streaming metadata
      disabled: false,  // Set to true to disable
    },
  },
}

export default nextConfig
```

**Note:** Statically rendered pages don't use streaming since metadata is resolved at build time.

---

## Memoizing Data Requests

To avoid duplicate requests when fetching the **same data** for both metadata and the page, use React's `cache` function.

### Example

```typescript
// app/lib/data.ts
import { cache } from 'react'
import { db } from '@/lib/db'

// getPost will be used twice, but execute only once
export const getPost = cache(async (slug: string) => {
  const post = await db.post.findUnique({ where: { slug } })
  return post
})
```

```typescript
// app/blog/[slug]/page.tsx
import { getPost } from '@/lib/data'

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)  // First call
  
  return {
    title: post.title,
    description: post.description,
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)  // Memoized, doesn't fetch again
  
  return <article>{post.title}</article>
}
```

---

## File-Based Metadata

The following special files are available for metadata:

- `favicon.ico`, `apple-icon.jpg`, `icon.jpg` - App icons
- `opengraph-image.jpg`, `twitter-image.jpg` - Social images
- `robots.txt` - Robots file
- `sitemap.xml` - Sitemap

You can use these for static metadata, or programmatically generate them with code.

---

## Favicons

Favicons are small icons that represent your site in bookmarks and search results.

### Static Favicon

```
app/
├── favicon.ico       ← Add favicon here
├── layout.tsx
└── page.tsx
```

### Using Metadata API

```typescript
// app/layout.tsx
export const metadata: Metadata = {
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}
```

### Programmatic Favicon

```typescript
// app/icon.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'black',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
        }}
      >
        A
      </div>
    ),
    { ...size }
  )
}
```

---

## Open Graph Images

Open Graph (OG) images represent your site in social media.

### Static OG Image

```
app/
├── opengraph-image.jpg    ← Root OG image
├── layout.tsx
└── blog/
    ├── opengraph-image.jpg ← Blog-specific OG image
    └── page.tsx
```

The **more specific image** takes precedence over images above it in the folder structure.

**Supported formats:** `.jpg`, `.jpeg`, `.png`, `.gif`

---

## Generated OG Images

The `ImageResponse` constructor allows you to generate **dynamic images** using JSX and CSS.

### Basic Example

```typescript
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

// Image generation
export default async function Image({ params }: { params: { slug: string } }) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/blog/${slug}`)
    .then((res) => res.json())
  
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {post.title}
      </div>
    )
  )
}
```

### Advanced Example

```typescript
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
  const { slug } = await params
  const post = await fetch(`https://api.example.com/blog/${slug}`)
    .then((res) => res.json())
  
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom, #1e3a8a, #3b82f6)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
      >
        <div
          style={{
            fontSize: 60,
            fontWeight: 'bold',
            color: 'white',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          {post.title}
        </div>
        <div
          style={{
            fontSize: 30,
            color: 'rgba(255, 255, 255, 0.8)',
            textAlign: 'center',
          }}
        >
          {post.excerpt}
        </div>
      </div>
    )
  )
}
```

**Supported CSS properties:** Flexbox, absolute positioning, custom fonts, text wrapping, centering, nested images. See [full list of supported CSS properties](https://nextjs.org/docs/app/api-reference/functions/image-response).

**Resources:**
- [Vercel OG Playground](https://og-playground.vercel.app/)
- Uses `@vercel/og`, `satori`, and `resvg` to convert HTML/CSS to PNG

---

## Common Patterns

### Pattern 1: Blog with Dynamic Metadata

```typescript
// app/blog/[slug]/page.tsx
import type { Metadata } from 'next'
import { getPost } from '@/lib/data'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author.name],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  
  return <article>{post.content}</article>
}
```

### Pattern 2: E-commerce Product

```typescript
// app/products/[id]/page.tsx
import type { Metadata } from 'next'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id)
  
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: product.images,
      type: 'product',
    },
    other: {
      'product:price:amount': product.price,
      'product:price:currency': 'USD',
    },
  }
}
```

### Pattern 3: Robots.txt

```typescript
// app/robots.ts
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin/'],
      },
    ],
    sitemap: 'https://example.com/sitemap.xml',
  }
}
```

### Pattern 4: Dynamic Sitemap

```typescript
// app/sitemap.ts
import { MetadataRoute } from 'next'
import { db } from '@/lib/db'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await db.post.findMany()
  
  const postUrls = posts.map((post) => ({
    url: `https://example.com/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
  
  return [
    {
      url: 'https://example.com',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
    },
    {
      url: 'https://example.com/blog',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...postUrls,
  ]
}
```

### Pattern 5: JSON-LD Structured Data

```typescript
// app/blog/[slug]/page.tsx
export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Person',
      name: post.author.name,
      url: post.author.website,
    },
  }
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <h1>{post.title}</h1>
        <div>{post.content}</div>
      </article>
    </>
  )
}
```

---

## Best Practices

### 1. Use Descriptive Titles and Descriptions

```typescript
// ✅ GOOD - Descriptive and unique
export const metadata: Metadata = {
  title: 'How to Build a Next.js App - Complete Guide',
  description: 'Learn how to build a production-ready Next.js application with this step-by-step guide covering routing, data fetching, and deployment.',
}

// ❌ BAD - Generic and vague
export const metadata: Metadata = {
  title: 'Blog Post',
  description: 'Read this blog post.',
}
```

### 2. Optimize OG Images

```typescript
// ✅ GOOD - Correct dimensions
export const size = {
  width: 1200,
  height: 630,  // 1.91:1 aspect ratio
}

// ❌ BAD - Wrong dimensions
export const size = {
  width: 800,
  height: 800,
}
```

### 3. Use React cache for Data Reuse

```typescript
// ✅ GOOD - Memoized
import { cache } from 'react'

export const getPost = cache(async (slug: string) => {
  return await db.post.findUnique({ where: { slug } })
})

// ❌ BAD - Duplicate fetches
export async function generateMetadata({ params }) {
  const post = await db.post.findUnique({ where: { slug: params.slug } })
  return { title: post.title }
}

export default async function Page({ params }) {
  const post = await db.post.findUnique({ where: { slug: params.slug } })
  return <div>{post.title}</div>
}
```

---

## Quick Reference

### Static Metadata

```typescript
export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
}
```

### Dynamic Metadata

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const data = await fetchData(params)
  return { title: data.title }
}
```

### File Conventions

```
app/
├── favicon.ico              # Favicon
├── icon.png                 # App icon
├── apple-icon.png           # Apple touch icon
├── opengraph-image.jpg      # OG image
├── twitter-image.jpg        # Twitter image
├── robots.ts                # Robots.txt
└── sitemap.ts               # Sitemap
```

### Generated OG Image

```typescript
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (<div style={{ fontSize: 128 }}>My Image</div>)
  )
}
```

---

**Related Documentation:**
- [generateMetadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [ImageResponse API](https://nextjs.org/docs/app/api-reference/functions/image-response)
- [Metadata Files](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)