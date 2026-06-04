# Next.js 16 TypeScript Patterns Reference

**Doc Version:** 16.1.1  
**Focus:** Type-safe patterns, helpers, and best practices

---

## Contents

- [Critical Rules](#critical-rules)
- [PageProps Helper](#pageprops-helper)
- [LayoutProps Helper](#layoutprops-helper)
- [Common Type Patterns](#common-type-patterns)
- [Server Actions Types](#server-actions-types)
- [API Route Types](#api-route-types)
- [Metadata Types](#metadata-types)
- [Avoiding any Types](#avoiding-any-types)
- [Type Utilities](#type-utilities)

---

## Critical Rules

### Rule 1: NO `any` Types Ever
```typescript
// ❌ WRONG - Defeats type safety
const data: any = await fetch(...)
const params: any = await props.params

// ✅ CORRECT - Proper typing
const data: Post[] = await fetch(...).then(r => r.json())
const { slug } = await props.params
```

**Why it matters:**
- `any` disables all type checking
- Errors caught at runtime, not compile time
- No auto-completion or IntelliSense

**Enable strict checking:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true
  }
}
```

### Rule 2: Use PageProps/LayoutProps Helpers
```typescript
// ❌ Manual typing (error-prone)
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
}

// ✅ Helper (auto-generated, type-safe)
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params // Fully typed!
}
```

### Rule 3: params Are Always Promise
```typescript
// ❌ WRONG - params is not Promise
export default function Page({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1> // Type error!
}

// ✅ CORRECT - params is Promise
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  return <h1>{slug}</h1>
}
```

---

## PageProps Helper

Auto-generated type helper for page components.

### How It Works
```typescript
// Generated automatically during:
// - next dev
// - next build
// - next typegen

// No imports needed - globally available
```

### Basic Usage
```typescript
// app/blog/[slug]/page.tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  // props.params is Promise<{ slug: string }>
  const { slug } = await props.params
  
  // props.searchParams is Promise<{ [key: string]: string | string[] | undefined }>
  const search = await props.searchParams
  
  return <h1>{slug}</h1>
}
```

### Static Route
```typescript
// app/about/page.tsx
export default function Page(props: PageProps<'/about'>) {
  // props.params is Promise<{}> (empty object)
  // props.searchParams is Promise<{ [key: string]: string | string[] | undefined }>
}
```

### Single Dynamic Segment
```typescript
// app/blog/[slug]/page.tsx
export default async function Page(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  // slug: string
}
```

### Multiple Dynamic Segments
```typescript
// app/shop/[category]/[product]/page.tsx
export default async function Page(
  props: PageProps<'/shop/[category]/[product]'>
) {
  const { category, product } = await props.params
  // category: string
  // product: string
}
```

### Catch-All Segments
```typescript
// app/docs/[...slug]/page.tsx
export default async function Page(props: PageProps<'/docs/[...slug]'>) {
  const { slug } = await props.params
  // slug: string[]
  
  const path = slug.join('/')
  return <h1>Docs: {path}</h1>
}
```

### Optional Catch-All Segments
```typescript
// app/docs/[[...slug]]/page.tsx
export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const { slug } = await props.params
  // slug: string[] | undefined
  
  if (!slug) {
    return <h1>Docs Home</h1>
  }
  
  return <h1>Docs: {slug.join('/')}</h1>
}
```

### With searchParams
```typescript
// app/shop/page.tsx
export default async function Page(props: PageProps<'/shop'>) {
  const search = await props.searchParams
  
  // Type-safe access
  const category = search.category // string | string[] | undefined
  const sort = search.sort // string | string[] | undefined
  
  // Handle different types
  const categoryStr = Array.isArray(category) ? category[0] : category
  const sortStr = Array.isArray(sort) ? sort[0] : sort
  
  return <h1>{categoryStr}</h1>
}
```

### Custom searchParams Type
```typescript
type ShopSearchParams = {
  category?: string
  sort?: 'asc' | 'desc'
  page?: string
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<ShopSearchParams>
}) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  
  return <div>Page {page}</div>
}
```

---

## LayoutProps Helper

Auto-generated type helper for layout components.

### Basic Usage
```typescript
// app/blog/layout.tsx
export default function Layout(props: LayoutProps<'/blog'>) {
  return (
    <section>
      {props.children}
    </section>
  )
}
```

### With Parallel Routes
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
export default function Layout(props: LayoutProps<'/dashboard'>) {
  return (
    <div>
      <main>{props.children}</main>
      <aside>
        {props.analytics}  // Typed from @analytics folder
        {props.team}       // Typed from @team folder
      </aside>
    </div>
  )
}
```

### Nested Layout with params
```typescript
// app/blog/[category]/layout.tsx
export default async function Layout(
  props: LayoutProps<'/blog/[category]'>
) {
  const { category } = await props.params
  // category: string
  
  return (
    <div>
      <h2>{category}</h2>
      {props.children}
    </div>
  )
}
```

---

## Common Type Patterns

### Fetched Data
```typescript
// Define types for API responses
type Post = {
  id: string
  title: string
  content: string
  createdAt: Date
}

async function getPosts(): Promise<Post[]> {
  const res = await fetch('...')
  return res.json()
}

export default async function Page() {
  const posts = await getPosts()
  // posts: Post[]
  
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Form Events
```typescript
'use client'

export default function Form() {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const title = formData.get('title') as string
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value)
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="title" onChange={handleChange} />
      <button type="submit">Submit</button>
    </form>
  )
}
```

### Component Props
```typescript
// Explicit prop types
type ButtonProps = {
  variant: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  children: React.ReactNode
}

export default function Button({ 
  variant, 
  size = 'md', 
  onClick,
  children 
}: ButtonProps) {
  return (
    <button 
      className={`btn-${variant} btn-${size}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

### Children Props
```typescript
// For components that wrap children
type ContainerProps = {
  children: React.ReactNode
  className?: string
}

export default function Container({ children, className }: ContainerProps) {
  return <div className={className}>{children}</div>
}
```

### Async Component Return Type
```typescript
// Server Components can be async
async function AsyncComponent(): Promise<JSX.Element> {
  const data = await fetchData()
  return <div>{data}</div>
}

// Or just let TypeScript infer
async function AsyncComponent() {
  const data = await fetchData()
  return <div>{data}</div>
}
```

---

## Server Actions Types

### Basic Server Action
```typescript
// app/actions.ts
'use server'

// FormData parameter (from form submission)
export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  // Validation
  if (!title) {
    throw new Error('Title required')
  }
  
  await db.posts.create({ data: { title } })
  // Returns void implicitly
}
```

### With useActionState
```typescript
// app/actions.ts
'use server'

type ActionState = {
  error?: string
  success?: boolean
}

export async function updateProfile(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const name = formData.get('name') as string
  
  if (!name) {
    return { error: 'Name required' }
  }
  
  await db.users.update({ name })
  return { success: true }
}

// app/profile/page.tsx
'use client'

import { useActionState } from 'react'
import { updateProfile } from './actions'

export default function Profile() {
  const [state, action, isPending] = useActionState(updateProfile, null)
  
  return (
    <form action={action}>
      <input name="name" />
      <button disabled={isPending}>Save</button>
      {state?.error && <p>{state.error}</p>}
    </form>
  )
}
```

### Typed Server Action
```typescript
'use server'

type CreatePostInput = {
  title: string
  content: string
  published: boolean
}

export async function createPost(input: CreatePostInput) {
  // input is fully typed
  await db.posts.create({ data: input })
}

// Call from Client Component
'use client'

import { createPost } from './actions'

export default function Form() {
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    await createPost({
      title: 'Hello',
      content: 'World',
      published: true,
    })
  }
  
  return <form onSubmit={handleSubmit}>...</form>
}
```

---

## API Route Types

### GET Request
```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'

type Post = {
  id: string
  title: string
}

export async function GET(request: NextRequest) {
  const posts: Post[] = await db.posts.findMany()
  
  return NextResponse.json(posts)
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
  const body: CreatePostBody = await request.json()
  
  // Validation
  if (!body.title) {
    return NextResponse.json(
      { error: 'Title required' },
      { status: 400 }
    )
  }
  
  const post = await db.posts.create({ data: body })
  
  return NextResponse.json(post, { status: 201 })
}
```

### Dynamic Route Handler
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
  const { id } = await context.params
  
  const post = await db.posts.findUnique({ where: { id } })
  
  if (!post) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    )
  }
  
  return NextResponse.json(post)
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params
  
  await db.posts.delete({ where: { id } })
  
  return NextResponse.json({ success: true })
}
```

---

## Metadata Types

### Static Metadata
```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page',
  description: 'Page description',
  openGraph: {
    title: 'My Page',
    description: 'Page description',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Page',
    description: 'Page description',
  },
}
```

### Dynamic Metadata
```typescript
import type { Metadata } from 'next'

export async function generateMetadata(
  props: PageProps<'/blog/[slug]'>
): Promise<Metadata> {
  const { slug } = await props.params
  const post = await getPost(slug)
  
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
```

### Metadata with Template
```typescript
// app/blog/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s | My Blog',
    default: 'My Blog',
  },
}

// app/blog/[slug]/page.tsx
export async function generateMetadata(
  props: PageProps<'/blog/[slug]'>
): Promise<Metadata> {
  const { slug } = await props.params
  const post = await getPost(slug)
  
  return {
    title: post.title, // Becomes "Post Title | My Blog"
  }
}
```

---

## Avoiding any Types

### Problem: Unknown API Response
```typescript
// ❌ Bad - Using any
async function fetchUser(id: string): Promise<any> {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
}

// ✅ Good - Define type
type User = {
  id: string
  name: string
  email: string
}

async function fetchUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
}
```

### Problem: Event Handlers
```typescript
// ❌ Bad - any parameter
const handleClick = (e: any) => {
  console.log(e.target.value)
}

// ✅ Good - Proper type
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  console.log(e.currentTarget.value)
}
```

### Problem: Third-Party Library
```typescript
// ❌ Bad - Casting to any
const data: any = externalLib.getData()

// ✅ Good - Create type definition
type ExternalData = {
  id: string
  value: number
}

const data = externalLib.getData() as ExternalData

// ✅ Better - Use unknown and validate
const data = externalLib.getData() as unknown

if (isValidData(data)) {
  // data is now typed
  console.log(data.id)
}

function isValidData(data: unknown): data is ExternalData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'value' in data
  )
}
```

### Use unknown Instead of any
```typescript
// ❌ Bad - any disables all checks
function processData(data: any) {
  return data.value.toUpperCase() // No error, crashes at runtime
}

// ✅ Good - unknown forces validation
function processData(data: unknown) {
  if (
    typeof data === 'object' &&
    data !== null &&
    'value' in data &&
    typeof data.value === 'string'
  ) {
    return data.value.toUpperCase() // Type-safe
  }
  
  throw new Error('Invalid data')
}
```

---

## Type Utilities

### Extract Props Type
```typescript
import { ComponentProps } from 'react'

// Extract props from existing component
type ButtonProps = ComponentProps<'button'>
type LinkProps = ComponentProps<typeof Link>

function CustomButton(props: ButtonProps) {
  return <button {...props} />
}
```

### Omit Props
```typescript
import { ComponentProps } from 'react'

// Omit specific props
type CustomButtonProps = Omit
  ComponentProps<'button'>,
  'onClick'
> & {
  onClick: (id: string) => void
}

function CustomButton({ onClick, ...props }: CustomButtonProps) {
  return (
    <button 
      onClick={() => onClick('123')}
      {...props}
    />
  )
}
```

### Pick Props
```typescript
// Pick only specific props
type UserBasic = Pick<User, 'id' | 'name'>

function UserCard({ id, name }: UserBasic) {
  return <div>{name}</div>
}
```

### Partial Props
```typescript
// Make all props optional
type UpdateUserInput = Partial<User>

function updateUser(id: string, data: UpdateUserInput) {
  // All fields optional
}
```

### Required Props
```typescript
// Make all props required
type CreateUserInput = Required<User>

function createUser(data: CreateUserInput) {
  // All fields required
}
```

### Array Element Type
```typescript
type Post = {
  id: string
  title: string
}

type Posts = Post[]

// Extract array element type
type SinglePost = Posts[number] // Same as Post
```

---

## Quick Reference

### Type Helpers
```typescript
// Auto-generated (no imports)
PageProps<'/path/[param]'>
LayoutProps<'/path'>

// Next.js types
import type { Metadata } from 'next'
import { NextRequest, NextResponse } from 'next/server'

// React types
import type { 
  ReactNode,
  FormEvent,
  ChangeEvent,
  MouseEvent,
  ComponentProps
} from 'react'
```

### Common Type Patterns
```typescript
// Props
type Props = {
  children: ReactNode
  className?: string
}

// Events
FormEvent<HTMLFormElement>
ChangeEvent<HTMLInputElement>
MouseEvent<HTMLButtonElement>

// Async component
async function Component(): Promise<JSX.Element>

// Server Action (form)
async function action(formData: FormData): Promise<void>

// Server Action (state)
async function action(
  prev: State | null,
  formData: FormData
): Promise<State>

// API Route
async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse>
```

---

**Related Documentation:**
- [Project Structure](01-project-structure.md)
- [Routing & Pages](02-routing-pages.md)
- [Server/Client Components](04-server-client.md)
- [Server Actions](06-server-actions.md)