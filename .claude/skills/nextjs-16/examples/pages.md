# Page Examples - Ready to Use Templates

Copy and adapt these patterns for your pages.

---

## Contents

- [Static Pages](#static-pages)
- [Dynamic Pages](#dynamic-pages)
- [Data Fetching Pages](#data-fetching-pages)
- [Search Params Pages](#search-params-pages)
- [Error Handling](#error-handling)
- [Loading States](#loading-states)

---

## Static Pages

### Basic Static Page
```typescript
// app/about/page.tsx
export default function Page() {
  return (
    <div className="container">
      <h1>About Us</h1>
      <p>We are building the future of web development.</p>
    </div>
  )
}
```

### Static Page with Metadata
```typescript
// app/about/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us',
  description: 'Learn about our company and mission',
}

export default function Page() {
  return (
    <div className="container">
      <h1>About Us</h1>
      <p>We are building the future of web development.</p>
    </div>
  )
}
```

### Static Page with Complete SEO
```typescript
// app/about/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us - Company Name',
  description: 'Learn about our company, mission, and the team behind our success',
  keywords: ['about', 'company', 'team', 'mission'],
  
  openGraph: {
    title: 'About Us',
    description: 'Learn about our company and mission',
    images: ['/og-about.png'],
    type: 'website',
  },
  
  twitter: {
    card: 'summary_large_image',
    title: 'About Us',
    description: 'Learn about our company and mission',
  },
}

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-6">About Us</h1>
      
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
        <p className="text-lg">
          We are building the future of web development with cutting-edge technology.
        </p>
      </section>
      
      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Our Team</h2>
        <p className="text-lg">
          A diverse group of talented individuals passionate about innovation.
        </p>
      </section>
    </div>
  )
}
```

---

## Dynamic Pages

### Single Dynamic Segment
```typescript
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'

export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  
  // Fetch post
  const post = await getPost(slug)
  
  if (!post) {
    notFound()
  }
  
  return (
    <article>
      <h1>{post.title}</h1>
      <time>{post.publishedAt}</time>
      <div dangerouslySetInnerHTML={{ __html: post.content }} />
    </article>
  )
}

// Type-safe helper
async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) return null
  return res.json()
}
```

### Dynamic Page with Static Generation
```typescript
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ slug: string }>
}

// Generate static params at build time
export async function generateStaticParams() {
  const posts = await getAllPosts()
  
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

// Generate metadata
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  if (!post) {
    return { title: 'Post Not Found' }
  }
  
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [post.coverImage],
    },
  }
}

export default async function Page(props: Props) {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  if (!post) {
    notFound()
  }
  
  return (
    <article className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{post.title}</h1>
        <time className="text-gray-600">{post.publishedAt}</time>
        <p className="text-xl text-gray-700 mt-4">{post.excerpt}</p>
      </header>
      
      <div 
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: post.content }} 
      />
    </article>
  )
}

async function getAllPosts() {
  const res = await fetch('https://api.example.com/posts')
  return res.json()
}

async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) return null
  return res.json()
}
```

### Multiple Dynamic Segments
```typescript
// app/shop/[category]/[product]/page.tsx
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  const categories = await getCategories()
  
  const params = []
  
  for (const category of categories) {
    const products = await getProductsByCategory(category.slug)
    
    for (const product of products) {
      params.push({
        category: category.slug,
        product: product.slug,
      })
    }
  }
  
  return params
}

export default async function Page(
  props: PageProps<'/shop/[category]/[product]'>
) {
  const { category, product } = await props.params
  
  const productData = await getProduct(category, product)
  
  if (!productData) {
    notFound()
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <nav className="text-sm mb-4">
        <a href="/shop">Shop</a> / 
        <a href={`/shop/${category}`}>{category}</a> / 
        {productData.name}
      </nav>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <img 
            src={productData.image} 
            alt={productData.name}
            className="w-full rounded-lg"
          />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold mb-4">{productData.name}</h1>
          <p className="text-2xl font-semibold mb-4">${productData.price}</p>
          <p className="text-gray-700 mb-6">{productData.description}</p>
          
          <button className="bg-blue-600 text-white px-6 py-3 rounded-lg">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

async function getCategories() {
  // Fetch categories
  return []
}

async function getProductsByCategory(category: string) {
  // Fetch products
  return []
}

async function getProduct(category: string, product: string) {
  const res = await fetch(`https://api.example.com/products/${category}/${product}`)
  if (!res.ok) return null
  return res.json()
}
```

### Catch-All Route
```typescript
// app/docs/[...slug]/page.tsx
import { notFound } from 'next/navigation'

export default async function Page(props: PageProps<'/docs/[...slug]'>) {
  const { slug } = await props.params
  
  // slug is string[]
  const path = slug.join('/')
  const doc = await getDoc(path)
  
  if (!doc) {
    notFound()
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <aside className="w-64 fixed left-0 top-0 h-full">
        {/* Sidebar navigation */}
      </aside>
      
      <main className="ml-64 pl-8">
        <h1 className="text-4xl font-bold mb-6">{doc.title}</h1>
        <div 
          className="prose"
          dangerouslySetInnerHTML={{ __html: doc.content }} 
        />
      </main>
    </div>
  )
}

async function getDoc(path: string) {
  // Fetch documentation
  return null
}
```

---

## Data Fetching Pages

### Parallel Data Fetching
```typescript
// app/dashboard/page.tsx
async function getUser() {
  const res = await fetch('https://api.example.com/user')
  return res.json()
}

async function getPosts() {
  const res = await fetch('https://api.example.com/posts')
  return res.json()
}

async function getStats() {
  const res = await fetch('https://api.example.com/stats')
  return res.json()
}

export default async function Page() {
  // Fetch in parallel
  const [user, posts, stats] = await Promise.all([
    getUser(),
    getPosts(),
    getStats(),
  ])
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1>Welcome, {user.name}</h1>
      
      <div className="grid grid-cols-3 gap-4 my-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3>Posts</h3>
          <p className="text-3xl font-bold">{stats.postCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3>Views</h3>
          <p className="text-3xl font-bold">{stats.viewCount}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3>Likes</h3>
          <p className="text-3xl font-bold">{stats.likeCount}</p>
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4">Recent Posts</h2>
        <ul>
          {posts.map((post) => (
            <li key={post.id} className="mb-2">
              <a href={`/posts/${post.slug}`}>{post.title}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

### Sequential Data Fetching
```typescript
// app/profile/[id]/page.tsx
export default async function Page(props: PageProps<'/profile/[id]'>) {
  const { id } = await props.params
  
  // Fetch user first
  const user = await getUser(id)
  
  // Then fetch user's posts (depends on user data)
  const posts = await getUserPosts(user.id)
  
  return (
    <div>
      <h1>{user.name}</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

### With Suspense Streaming
```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

async function UserStats() {
  const stats = await fetch('https://api.example.com/stats').then(r => r.json())
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3>Posts</h3>
        <p className="text-3xl font-bold">{stats.postCount}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <h3>Views</h3>
        <p className="text-3xl font-bold">{stats.viewCount}</p>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <h3>Likes</h3>
        <p className="text-3xl font-bold">{stats.likeCount}</p>
      </div>
    </div>
  )
}

async function RecentPosts() {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json())
  
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      {/* Stats load independently */}
      <Suspense fallback={<div>Loading stats...</div>}>
        <UserStats />
      </Suspense>
      
      {/* Posts load independently */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Recent Posts</h2>
        <Suspense fallback={<div>Loading posts...</div>}>
          <RecentPosts />
        </Suspense>
      </div>
    </div>
  )
}
```

---

## Search Params Pages

### Basic Search Params
```typescript
// app/shop/page.tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>
}) {
  const params = await searchParams
  const category = params.category || 'all'
  const sort = params.sort || 'popular'
  
  const products = await getProducts({ category, sort })
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Shop</h1>
        
        <div className="flex gap-4">
          <select 
            defaultValue={category}
            onChange={(e) => {
              const url = new URL(window.location.href)
              url.searchParams.set('category', e.target.value)
              window.location.href = url.toString()
            }}
          >
            <option value="all">All Categories</option>
            <option value="electronics">Electronics</option>
            <option value="clothing">Clothing</option>
          </select>
          
          <select 
            defaultValue={sort}
            onChange={(e) => {
              const url = new URL(window.location.href)
              url.searchParams.set('sort', e.target.value)
              window.location.href = url.toString()
            }}
          >
            <option value="popular">Popular</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-6">
        {products.map((product) => (
          <div key={product.id} className="border rounded-lg p-4">
            <img src={product.image} alt={product.name} />
            <h3 className="font-semibold mt-2">{product.name}</h3>
            <p className="text-gray-600">${product.price}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

async function getProducts({ category, sort }) {
  const res = await fetch(
    `https://api.example.com/products?category=${category}&sort=${sort}`
  )
  return res.json()
}
```

### Pagination with Search Params
```typescript
// app/blog/page.tsx
const POSTS_PER_PAGE = 10

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  
  const { posts, total } = await getPosts(page, POSTS_PER_PAGE)
  const totalPages = Math.ceil(total / POSTS_PER_PAGE)
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>
      
      <div className="space-y-6">
        {posts.map((post) => (
          <article key={post.id} className="border-b pb-6">
            <h2 className="text-2xl font-semibold mb-2">
              <a href={`/blog/${post.slug}`}>{post.title}</a>
            </h2>
            <p className="text-gray-700">{post.excerpt}</p>
          </article>
        ))}
      </div>
      
      {/* Pagination */}
      <div className="flex justify-center gap-2 mt-8">
        {page > 1 && (
          <a 
            href={`/blog?page=${page - 1}`}
            className="px-4 py-2 border rounded"
          >
            Previous
          </a>
        )}
        
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          
            key={p}
            href={`/blog?page=${p}`}
            className={`px-4 py-2 border rounded ${
              p === page ? 'bg-blue-600 text-white' : ''
            }`}
          >
            {p}
          </a>
        ))}
        
        {page < totalPages && (
          <a 
            href={`/blog?page=${page + 1}`}
            className="px-4 py-2 border rounded"
          >
            Next
          </a>
        )}
      </div>
    </div>
  )
}

async function getPosts(page: number, perPage: number) {
  const res = await fetch(
    `https://api.example.com/posts?page=${page}&per_page=${perPage}`
  )
  const data = await res.json()
  
  return {
    posts: data.posts,
    total: data.total,
  }
}
```

---

## Error Handling

### With notFound()
```typescript
// app/posts/[id]/page.tsx
import { notFound } from 'next/navigation'

export default async function Page(props: PageProps<'/posts/[id]'>) {
  const { id } = await props.params
  const post = await getPost(id)
  
  if (!post) {
    notFound() // Shows not-found.tsx
  }
  
  return <article>{post.title}</article>
}

// app/posts/[id]/not-found.tsx
export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <h1 className="text-4xl font-bold mb-4">Post Not Found</h1>
      <p className="text-gray-600 mb-6">
        The post you're looking for doesn't exist.
      </p>
      <a 
        href="/posts"
        className="bg-blue-600 text-white px-6 py-3 rounded-lg"
      >
        Back to Posts
      </a>
    </div>
  )
}
```

### With Error Boundary
```typescript
// app/posts/[id]/page.tsx
export default async function Page(props: PageProps<'/posts/[id]'>) {
  const { id } = await props.params
  
  const post = await getPost(id)
  
  if (!post) {
    throw new Error('Post not found')
  }
  
  return <article>{post.title}</article>
}

// app/posts/[id]/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <h1 className="text-4xl font-bold mb-4">Something went wrong!</h1>
      <p className="text-gray-600 mb-6">{error.message}</p>
      <button 
        onClick={reset}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg"
      >
        Try again
      </button>
    </div>
  )
}
```

---

## Loading States

### Route-Level Loading
```typescript
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-300 rounded w-1/4 mb-8"></div>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="h-32 bg-gray-300 rounded"></div>
          <div className="h-32 bg-gray-300 rounded"></div>
          <div className="h-32 bg-gray-300 rounded"></div>
        </div>
        
        <div className="space-y-4">
          <div className="h-4 bg-gray-300 rounded"></div>
          <div className="h-4 bg-gray-300 rounded"></div>
          <div className="h-4 bg-gray-300 rounded"></div>
        </div>
      </div>
    </div>
  )
}

// app/dashboard/page.tsx
export default async function Page() {
  const data = await fetchData() // Slow
  return <div>{data}</div>
}
```