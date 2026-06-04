# Layout Examples - Ready to Use Templates

Copy and adapt these patterns for your layouts.

---

## Contents

- [Root Layouts](#root-layouts)
- [Nested Layouts](#nested-layouts)
- [Dashboard Layouts](#dashboard-layouts)
- [Blog Layouts](#blog-layouts)
- [E-commerce Layouts](#e-commerce-layouts)
- [Multiple Root Layouts](#multiple-root-layouts)
- [Parallel Routes Layouts](#parallel-routes-layouts)

---

## Root Layouts

### Basic Root Layout
```typescript
// app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

### Root Layout with Font
```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Root Layout with Multiple Fonts
```typescript
// app/layout.tsx
import { Inter, Roboto_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${robotoMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
```
```css
/* globals.css */
body {
  font-family: var(--font-inter);
}

code, pre {
  font-family: var(--font-roboto-mono);
}
```

### Root Layout with Metadata
```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: '%s | Company Name',
    default: 'Company Name',
  },
  description: 'Company tagline and description',
  keywords: ['keyword1', 'keyword2', 'keyword3'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Root Layout with Header & Footer
```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Header from '@/components/header'
import Footer from '@/components/footer'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: '%s | Company Name',
    default: 'Company Name',
  },
  description: 'Building the future of web development',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

### Root Layout with Providers
```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/components/auth-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'My App',
  description: 'My awesome app',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

---

## Nested Layouts

### Basic Nested Layout
```typescript
// app/blog/layout.tsx
export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>
      {children}
    </div>
  )
}
```

### Nested Layout with Sidebar
```typescript
// app/blog/layout.tsx
import Sidebar from './sidebar'

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0">
          <Sidebar />
        </aside>
        
        {/* Main content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}

// app/blog/sidebar.tsx
import Link from 'next/link'

export default function Sidebar() {
  return (
    <nav className="space-y-2">
      <h2 className="font-semibold mb-4">Categories</h2>
      <Link 
        href="/blog?category=tech"
        className="block px-4 py-2 rounded hover:bg-gray-100"
      >
        Technology
      </Link>
      <Link 
        href="/blog?category=design"
        className="block px-4 py-2 rounded hover:bg-gray-100"
      >
        Design
      </Link>
      <Link 
        href="/blog?category=business"
        className="block px-4 py-2 rounded hover:bg-gray-100"
      >
        Business
      </Link>
    </nav>
  )
}
```

### Nested Layout with Navigation
```typescript
// app/docs/layout.tsx
import Link from 'next/link'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {/* Top navigation */}
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex gap-6">
            <Link href="/docs" className="font-semibold">
              Documentation
            </Link>
            <Link href="/docs/guides" className="text-gray-600 hover:text-gray-900">
              Guides
            </Link>
            <Link href="/docs/api" className="text-gray-600 hover:text-gray-900">
              API Reference
            </Link>
            <Link href="/docs/examples" className="text-gray-600 hover:text-gray-900">
              Examples
            </Link>
          </div>
        </div>
      </nav>
      
      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}
```

### Nested Layout with Breadcrumbs
```typescript
// app/docs/[...slug]/layout.tsx
import Breadcrumbs from './breadcrumbs'

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  
  return (
    <div className="container mx-auto px-4 py-8">
      <Breadcrumbs slug={slug} />
      <div className="mt-6">
        {children}
      </div>
    </div>
  )
}

// app/docs/[...slug]/breadcrumbs.tsx
import Link from 'next/link'

export default function Breadcrumbs({ slug }: { slug: string[] }) {
  return (
    <nav className="flex items-center space-x-2 text-sm">
      <Link href="/docs" className="text-gray-600 hover:text-gray-900">
        Docs
      </Link>
      
      {slug.map((segment, index) => {
        const href = `/docs/${slug.slice(0, index + 1).join('/')}`
        const isLast = index === slug.length - 1
        
        return (
          <span key={segment} className="flex items-center space-x-2">
            <span className="text-gray-400">/</span>
            {isLast ? (
              <span className="text-gray-900 font-medium">{segment}</span>
            ) : (
              <Link href={href} className="text-gray-600 hover:text-gray-900">
                {segment}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
```

---

## Dashboard Layouts

### Basic Dashboard Layout
```typescript
// app/dashboard/layout.tsx
import Sidebar from './sidebar'
import Header from './header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white">
        <Sidebar />
      </aside>
      
      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b bg-white">
          <Header />
        </header>
        
        {/* Content */}
        <main className="flex-1 overflow-auto p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}

// app/dashboard/sidebar.tsx
import Link from 'next/link'

export default function Sidebar() {
  return (
    <nav className="p-4 space-y-2">
      <div className="text-xl font-bold mb-8">Dashboard</div>
      
      <Link 
        href="/dashboard"
        className="block px-4 py-2 rounded hover:bg-gray-800"
      >
        Overview
      </Link>
      <Link 
        href="/dashboard/analytics"
        className="block px-4 py-2 rounded hover:bg-gray-800"
      >
        Analytics
      </Link>
      <Link 
        href="/dashboard/users"
        className="block px-4 py-2 rounded hover:bg-gray-800"
      >
        Users
      </Link>
      <Link 
        href="/dashboard/settings"
        className="block px-4 py-2 rounded hover:bg-gray-800"
      >
        Settings
      </Link>
    </nav>
  )
}

// app/dashboard/header.tsx
export default function Header() {
  return (
    <div className="h-full px-8 flex items-center justify-between">
      <div>
        <input 
          type="search" 
          placeholder="Search..."
          className="px-4 py-2 border rounded-lg"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <button className="relative">
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
          🔔
        </button>
        
        <div className="flex items-center gap-2">
          <img 
            src="/avatar.png" 
            alt="User"
            className="w-8 h-8 rounded-full"
          />
          <span>John Doe</span>
        </div>
      </div>
    </div>
  )
}
```

### Dashboard with Collapsible Sidebar
```typescript
// app/dashboard/layout.tsx
'use client'

import { useState } from 'react'
import Sidebar from './sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <div className="flex h-screen">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} transition-all bg-gray-900 text-white`}>
        <Sidebar collapsed={collapsed} />
      </aside>
      
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b bg-white px-8 flex items-center">
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className="mr-4"
          >
            {collapsed ? '→' : '←'}
          </button>
          <h1>Dashboard</h1>
        </header>
        
        <main className="flex-1 overflow-auto p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}
```

---

## Blog Layouts

### Blog Layout with Categories
```typescript
// app/blog/layout.tsx
import Link from 'next/link'

async function getCategories() {
  // Fetch categories
  return [
    { slug: 'tech', name: 'Technology', count: 42 },
    { slug: 'design', name: 'Design', count: 28 },
    { slug: 'business', name: 'Business', count: 35 },
  ]
}

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = await getCategories()
  
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-5xl font-bold mb-4">Blog</h1>
          <p className="text-xl">
            Insights, stories, and knowledge from our team
          </p>
        </div>
      </header>
      
      <div className="container mx-auto px-4 py-12">
        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="w-64 flex-shrink-0">
            <div className="sticky top-8">
              <h3 className="font-semibold mb-4">Categories</h3>
              <nav className="space-y-2">
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/blog?category=${category.slug}`}
                    className="flex justify-between px-4 py-2 rounded hover:bg-gray-100"
                  >
                    <span>{category.name}</span>
                    <span className="text-gray-500">{category.count}</span>
                  </Link>
                ))}
              </nav>
              
              <div className="mt-8">
                <h3 className="font-semibold mb-4">Newsletter</h3>
                <form className="space-y-2">
                  <input
                    type="email"
                    placeholder="Your email"
                    className="w-full px-4 py-2 border rounded"
                  />
                  <button className="w-full bg-blue-600 text-white px-4 py-2 rounded">
                    Subscribe
                  </button>
                </form>
              </div>
            </div>
          </aside>
          
          {/* Main content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
```

### Blog Post Layout with Table of Contents
```typescript
// app/blog/[slug]/layout.tsx
export default function PostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <article className="max-w-4xl mx-auto">
      <div className="flex gap-12">
        {/* Content */}
        <div className="flex-1">
          {children}
        </div>
        
        {/* Table of Contents - sticky */}
        <aside className="w-64 flex-shrink-0">
          <div className="sticky top-8">
            <h3 className="font-semibold mb-4">On this page</h3>
            <nav className="text-sm space-y-2">
              {/* TOC will be generated from content */}
            </nav>
          </div>
        </aside>
      </div>
    </article>
  )
}
```

---

## E-commerce Layouts

### Shop Layout with Filters
```typescript
// app/shop/layout.tsx
import Filters from './filters'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Shop</h1>
      
      <div className="flex gap-8">
        {/* Filters sidebar */}
        <aside className="w-64 flex-shrink-0">
          <Filters />
        </aside>
        
        {/* Products grid */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}

// app/shop/filters.tsx
'use client'

import { useSearchParams, useRouter } from 'next/navigation'

export default function Filters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`/shop?${params.toString()}`)
  }
  
  return (
    <div className="space-y-6">
      {/* Category filter */}
      <div>
        <h3 className="font-semibold mb-3">Category</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            Electronics
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            Clothing
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            Home & Garden
          </label>
        </div>
      </div>
      
      {/* Price range */}
      <div>
        <h3 className="font-semibold mb-3">Price Range</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input type="radio" name="price" className="mr-2" />
            Under $50
          </label>
          <label className="flex items-center">
            <input type="radio" name="price" className="mr-2" />
            $50 - $100
          </label>
          <label className="flex items-center">
            <input type="radio" name="price" className="mr-2" />
            Over $100
          </label>
        </div>
      </div>
      
      {/* Brand */}
      <div>
        <h3 className="font-semibold mb-3">Brand</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            Brand A
          </label>
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            Brand B
          </label>
        </div>
      </div>
    </div>
  )
}
```

---

## Multiple Root Layouts

### Marketing vs App Layout
```
app/
├── (marketing)/
│   ├── layout.tsx       # Marketing layout
│   ├── page.tsx         # Homepage
│   └── about/
│       └── page.tsx
└── (app)/
    ├── layout.tsx       # App layout
    └── dashboard/
        └── page.tsx
```
```typescript
// app/(marketing)/layout.tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav className="bg-white border-b">
          <div className="container mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div className="text-xl font-bold">Company</div>
              <div className="flex gap-6">
                <a href="/">Home</a>
                <a href="/about">About</a>
                <a href="/pricing">Pricing</a>
                <a href="/login">Login</a>
              </div>
            </div>
          </div>
        </nav>
        
        <main>{children}</main>
        
        <footer className="bg-gray-900 text-white py-12">
          <div className="container mx-auto px-4">
            <p>© 2024 Company. All rights reserved.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}

// app/(app)/layout.tsx
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen">
          <aside className="w-64 bg-gray-900 text-white">
            {/* App sidebar */}
          </aside>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

---

## Parallel Routes Layouts

### Dashboard with Parallel Slots
```
app/dashboard/
├── layout.tsx
├── @analytics/
│   └── page.tsx
├── @team/
│   └── page.tsx
└── page.tsx
```
```typescript
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  team: React.ReactNode
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* Analytics slot */}
        <div className="bg-white p-6 rounded-lg shadow">
          {analytics}
        </div>
        
        {/* Team slot */}
        <div className="bg-white p-6 rounded-lg shadow">
          {team}
        </div>
      </div>
      
      {/* Main content */}
      <div className="bg-white p-6 rounded-lg shadow">
        {children}
      </div>
    </div>
  )
}

// app/dashboard/@analytics/page.tsx
export default async function AnalyticsSlot() {
  const stats = await getAnalytics()
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Analytics</h2>
      <div className="space-y-2">
        <div>Views: {stats.views}</div>
        <div>Clicks: {stats.clicks}</div>
        <div>Conversions: {stats.conversions}</div>
      </div>
    </div>
  )
}

// app/dashboard/@team/page.tsx
export default async function TeamSlot() {
  const team = await getTeamMembers()
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Team</h2>
      <ul className="space-y-2">
        {team.map((member) => (
          <li key={member.id} className="flex items-center gap-2">
            <img 
              src={member.avatar} 
              alt={member.name}
              className="w-8 h-8 rounded-full"
            />
            {member.name}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Quick Reference

### Layout Checklist
```typescript
// Root Layout (required)
✓ Must have <html> and <body>
✓ Can add metadata
✓ Can add fonts
✓ Can add providers

// Nested Layout (optional)
✓ Can add navigation
✓ Can add sidebar
✓ Can access params
✓ Wraps children only

// Route Groups
✓ Organize without URL
✓ (folder) syntax
✓ Multiple root layouts

// Parallel Routes
✓ @slot syntax
✓ Render simultaneously
✓ Independent loading/error states
```

---

**Related Documentation:**
- [Project Structure](../reference/01-project-structure.md)
- [Routing & Pages](../reference/02-routing-pages.md)
- [Page Examples](./pages.md)