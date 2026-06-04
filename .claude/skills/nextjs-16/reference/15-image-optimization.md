# Image Optimization Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Image Optimization Documentation

---

## Contents

- [Overview](#overview)
- [Image Component](#image-component)
- [Local Images](#local-images)
- [Remote Images](#remote-images)
- [Image Sizing](#image-sizing)
- [Performance Optimization](#performance-optimization)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js provides the `<Image>` component for automatic image optimization:

- **Automatic lazy loading** - Images load as they enter viewport
- **Format conversion** - Automatically serves WebP/AVIF when supported
- **Responsive images** - Serves correct size based on device
- **Prevents layout shift** - Reserves space to prevent CLS
- **On-demand optimization** - Images optimized when requested

---

## Image Component

### Basic Usage

```typescript
import Image from 'next/image'

export default function Page() {
  return (
    <Image
      src="/hero.jpg"
      alt="Hero image"
      width={1200}
      height={600}
    />
  )
}
```

### Required Props

```typescript
<Image
  src="/image.jpg"      // Image path
  alt="Description"     // Alt text (required for accessibility)
  width={800}           // Width in pixels
  height={600}          // Height in pixels
/>
```

---

## Local Images

Images in `public/` folder or imported.

### From Public Folder

```typescript
import Image from 'next/image'

export default function Page() {
  return (
    <Image
      src="/logo.png"
      alt="Logo"
      width={200}
      height={50}
    />
  )
}
```

### With Import (Automatic Sizing)

```typescript
import Image from 'next/image'
import heroImage from '@/public/hero.jpg'

export default function Page() {
  // No need for width/height!
  return (
    <Image
      src={heroImage}
      alt="Hero image"
    />
  )
}
```

---

## Remote Images

Images from external domains.

### Configuration Required

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.example.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.example.com',
        pathname: '/images/**',
      },
    ],
  },
}

export default nextConfig
```

### Usage

```typescript
import Image from 'next/image'

export default function Page() {
  return (
    <Image
      src="https://images.example.com/photo.jpg"
      alt="Photo"
      width={800}
      height={600}
    />
  )
}
```

### With Dynamic URLs

```typescript
type Post = {
  id: string
  title: string
  imageUrl: string
}

export default function PostCard({ post }: { post: Post }) {
  return (
    <div>
      <Image
        src={post.imageUrl}
        alt={post.title}
        width={400}
        height={300}
      />
      <h2>{post.title}</h2>
    </div>
  )
}
```

---

## Image Sizing

### Fill Container

```typescript
// Parent must have position: relative
export default function Page() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '400px' }}>
      <Image
        src="/hero.jpg"
        alt="Hero"
        fill
        style={{ objectFit: 'cover' }}
      />
    </div>
  )
}
```

### Responsive Sizes

```typescript
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

### Priority Loading

```typescript
// Load immediately (above the fold)
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority
/>
```

### Quality

```typescript
// Default quality is 75
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  quality={90}  // 1-100
/>
```

---

## Performance Optimization

### Lazy Loading (Default)

```typescript
// Automatically lazy loads when entering viewport
<Image
  src="/image.jpg"
  alt="Image"
  width={800}
  height={600}
/>
```

### Eager Loading for Above-the-Fold

```typescript
// Disable lazy loading for critical images
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  loading="eager"
  priority
/>
```

### Placeholder

```typescript
// Blur placeholder (local images only)
import heroImage from '@/public/hero.jpg'

<Image
  src={heroImage}
  alt="Hero"
  placeholder="blur"
/>

// Custom blur data URL
<Image
  src="https://example.com/image.jpg"
  alt="Image"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
/>

// No placeholder (default)
<Image
  src="/image.jpg"
  alt="Image"
  width={800}
  height={600}
  placeholder="empty"
/>
```

### Disable Optimization

```typescript
// Use for already optimized images
<Image
  src="/optimized.webp"
  alt="Image"
  width={800}
  height={600}
  unoptimized
/>
```

---

## Common Patterns

### Pattern 1: Responsive Hero Image

```typescript
export default function Hero() {
  return (
    <div className="relative w-full h-[500px] md:h-[700px]">
      <Image
        src="/hero.jpg"
        alt="Hero image"
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <h1 className="text-4xl md:text-6xl text-white font-bold">
          Welcome
        </h1>
      </div>
    </div>
  )
}
```

### Pattern 2: Avatar Image

```typescript
export function Avatar({ src, name }: { src: string; name: string }) {
  return (
    <div className="relative w-12 h-12 rounded-full overflow-hidden">
      <Image
        src={src}
        alt={name}
        fill
        className="object-cover"
        sizes="48px"
      />
    </div>
  )
}
```

### Pattern 3: Image Grid

```typescript
export function ImageGrid({ images }: { images: string[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map((src, i) => (
        <div key={i} className="relative aspect-square">
          <Image
            src={src}
            alt={`Image ${i + 1}`}
            fill
            className="object-cover rounded-lg"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          />
        </div>
      ))}
    </div>
  )
}
```

### Pattern 4: Product Image with Fallback

```typescript
'use client'

import Image from 'next/image'
import { useState } from 'react'

export function ProductImage({ 
  src, 
  alt 
}: { 
  src: string
  alt: string
}) {
  const [error, setError] = useState(false)
  
  if (error) {
    return (
      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
        <span>Image not available</span>
      </div>
    )
  }
  
  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={400}
      onError={() => setError(true)}
    />
  )
}
```

### Pattern 5: Background Image

```typescript
export function Section() {
  return (
    <section className="relative min-h-screen">
      {/* Background image */}
      <Image
        src="/background.jpg"
        alt="Background"
        fill
        className="object-cover -z-10"
        quality={85}
        priority
      />
      
      {/* Content */}
      <div className="relative z-10 p-8">
        <h1>Content over image</h1>
      </div>
    </section>
  )
}
```

### Pattern 6: Image Carousel

```typescript
'use client'

import Image from 'next/image'
import { useState } from 'react'

export function Carousel({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  
  return (
    <div className="relative w-full h-96">
      <Image
        src={images[currentIndex]}
        alt={`Slide ${currentIndex + 1}`}
        fill
        className="object-cover"
        priority={currentIndex === 0}
      />
      
      <button
        onClick={() => setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1))}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white p-2 rounded"
      >
        Previous
      </button>
      
      <button
        onClick={() => setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0))}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white p-2 rounded"
      >
        Next
      </button>
    </div>
  )
}
```

### Pattern 7: Optimized Blog Post Images

```typescript
// app/blog/[slug]/page.tsx
import Image from 'next/image'
import { db } from '@/lib/db'

export default async function BlogPost({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug } })
  
  return (
    <article className="max-w-4xl mx-auto">
      {/* Featured image */}
      <div className="relative w-full h-96 mb-8">
        <Image
          src={post.featuredImage}
          alt={post.title}
          fill
          priority
          className="object-cover rounded-lg"
        />
      </div>
      
      {/* Content */}
      <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
      <div className="prose">{post.content}</div>
    </article>
  )
}
```

### Pattern 8: Image with Loading State

```typescript
'use client'

import Image from 'next/image'
import { useState } from 'react'

export function ImageWithLoading({ src, alt }: { src: string; alt: string }) {
  const [loading, setLoading] = useState(true)
  
  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      <Image
        src={src}
        alt={alt}
        width={800}
        height={600}
        onLoad={() => setLoading(false)}
      />
    </div>
  )
}
```

---

## Best Practices

### 1. Always Provide Alt Text

```typescript
// ✅ GOOD - Descriptive alt text
<Image
  src="/team-photo.jpg"
  alt="Team members at annual conference 2024"
  width={800}
  height={600}
/>

// ❌ BAD - No alt text
<Image
  src="/photo.jpg"
  alt=""
  width={800}
  height={600}
/>
```

### 2. Use Priority for Above-the-Fold Images

```typescript
// ✅ GOOD - Priority for hero image
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority
/>

// ❌ BAD - No priority, will lazy load
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
/>
```

### 3. Use Appropriate Sizes

```typescript
// ✅ GOOD - Responsive sizes
<Image
  src="/image.jpg"
  alt="Image"
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// ❌ BAD - No sizes, loads full resolution
<Image
  src="/image.jpg"
  alt="Image"
  width={800}
  height={600}
/>
```

### 4. Configure Remote Patterns Properly

```typescript
// ✅ GOOD - Specific patterns
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'cdn.example.com',
      pathname: '/images/**',
    },
  ],
}

// ❌ BAD - Too permissive
images: {
  domains: ['*'],  // Allows any domain!
}
```

### 5. Use Fill for Unknown Dimensions

```typescript
// ✅ GOOD - Fill when dimensions unknown
<div style={{ position: 'relative', width: '100%', height: '400px' }}>
  <Image
    src={dynamicUrl}
    alt="Image"
    fill
    className="object-cover"
  />
</div>

// ❌ BAD - Hardcoded dimensions
<Image
  src={dynamicUrl}
  alt="Image"
  width={800}  // Might not match actual image
  height={600}
/>
```

---

## Configuration

### Image Formats

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}
```

### Device Sizes

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
}
```

### Image Sizes (for responsive images)

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
}
```

### Minimize Allowed Widths

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 60,
  },
}
```

---

## Quick Reference

### Image Props

```typescript
<Image
  src="/image.jpg"         // Required: path or URL
  alt="Description"        // Required: alt text
  width={800}              // Required (unless fill or import)
  height={600}             // Required (unless fill or import)
  fill                     // Fill parent container
  priority                 // Load immediately
  loading="lazy"           // Lazy load (default)
  quality={75}             // 1-100 (default 75)
  placeholder="blur"       // Blur placeholder
  blurDataURL="..."        // Custom blur
  sizes="..."              // Responsive sizes
  className="..."          // CSS classes
  style={{}}               // Inline styles
  onLoad={() => {}}        // Load callback
  onError={() => {}}       // Error callback
  unoptimized              // Skip optimization
/>
```

### Common Patterns

```typescript
// Hero image
<Image src="/hero.jpg" alt="Hero" fill priority className="object-cover" />

// Avatar
<Image src={avatarUrl} alt={name} width={48} height={48} className="rounded-full" />

// Responsive grid
<Image src={url} alt="Image" fill sizes="(max-width: 768px) 100vw, 50vw" />
```

---

**Related Documentation:**
- [Font Optimization](16-font-optimization.md)
- [CSS Styling](14-css.md)
- [Next.js Image Docs](https://nextjs.org/docs/app/api-reference/components/image)