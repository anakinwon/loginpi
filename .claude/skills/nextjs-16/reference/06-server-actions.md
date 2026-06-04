# Next.js 16 Server Actions Reference

**Doc Version:** 16.1.1  
**Focus:** Form handling, mutations, and progressive enhancement

---

## Contents

- [What Are Server Actions](#what-are-server-actions)
- [Basic Usage](#basic-usage)
- [Form Actions (Void Return)](#form-actions-void-return)
- [useActionState Pattern](#useactionstate-pattern)
- [Error Handling](#error-handling)
- [Revalidation](#revalidation)
- [Redirect After Action](#redirect-after-action)
- [File Uploads](#file-uploads)
- [Optimistic Updates](#optimistic-updates)
- [Security Best Practices](#security-best-practices)
- [Common Patterns](#common-patterns)

---

## What Are Server Actions

Server Actions are **async functions that run on the server** but can be called from Client Components. They enable form mutations, data updates, and server-side operations without building API routes.

### Key Features

- **Type-safe**: Full TypeScript support
- **Progressive enhancement**: Works without JavaScript
- **Automatic revalidation**: Built-in cache updates
- **Secure**: Run on server, can access secrets
- **Simple**: No API routes needed

### When to Use

✅ **Use Server Actions for:**
- Form submissions
- Database mutations
- Revalidating cached data
- Server-side operations with secrets

❌ **Don't use Server Actions for:**
- Data fetching (use direct async calls in Server Components)
- Real-time updates (use WebSockets/SSE)
- File downloads (use API routes)

---

## Basic Usage

### Define Server Action
```typescript
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  
  // Server-side operations
  await db.posts.create({
    data: { title, content }
  })
  
  // No return needed for form actions
}
```

**Critical:** `'use server'` must be at top of file.

### Use in Form
```typescript
// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit">Create Post</button>
    </form>
  )
}
```

**Benefits:**
- ✅ Works without JavaScript
- ✅ Progressive enhancement
- ✅ Automatic form handling

---

## Form Actions (Void Return)

Form actions **must return void** (or nothing).

### ❌ Wrong: Returning Data
```typescript
// ❌ TYPE ERROR
'use server'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ data: {...} })
  return { success: true, post } // ❌ Form actions can't return data!
}
```

### ✅ Correct: Void Return
```typescript
// ✅ CORRECT
'use server'

import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  await db.posts.create({
    data: { title }
  })
  
  revalidatePath('/posts')
  // No return - returns void implicitly
}
```

### Why Void?

Form actions are called by native HTML forms. The browser expects standard form submission behavior, not data responses.

**For data responses, use `useActionState`** (see next section).

---

## useActionState Pattern

For actions that need to return data (errors, success messages), use `useActionState`.

### Basic Pattern
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
  
  // Validation
  if (!name || name.length < 2) {
    return { error: 'Name must be at least 2 characters' }
  }
  
  try {
    await db.users.update({ data: { name } })
    return { success: true }
  } catch (error) {
    return { error: 'Failed to update profile' }
  }
}
```
```typescript
// app/profile/page.tsx
'use client'

import { useActionState } from 'react'
import { updateProfile } from '@/app/actions'

export default function Profile() {
  const [state, action, isPending] = useActionState(updateProfile, null)
  
  return (
    <form action={action}>
      <input name="name" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
      
      {state?.error && (
        <p className="error">{state.error}</p>
      )}
      {state?.success && (
        <p className="success">Profile updated!</p>
      )}
    </form>
  )
}
```

### useActionState Signature
```typescript
const [state, action, isPending] = useActionState(
  serverAction,  // Server Action
  initialState   // Initial state
)

// state: Current state (ActionState)
// action: Function to pass to form action
// isPending: Boolean - true while action running
```

### Multiple Form Fields
```typescript
// app/actions.ts
'use server'

type FormState = {
  errors?: {
    title?: string
    content?: string
    category?: string
  }
  success?: boolean
}

export async function createPost(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  const category = formData.get('category') as string
  
  // Validation
  const errors: FormState['errors'] = {}
  
  if (!title || title.length < 5) {
    errors.title = 'Title must be at least 5 characters'
  }
  
  if (!content || content.length < 20) {
    errors.content = 'Content must be at least 20 characters'
  }
  
  if (!category) {
    errors.category = 'Category is required'
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors }
  }
  
  // Save
  await db.posts.create({
    data: { title, content, category }
  })
  
  return { success: true }
}
```
```typescript
// app/posts/new/page.tsx
'use client'

import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, action, isPending] = useActionState(createPost, null)
  
  return (
    <form action={action}>
      <div>
        <input name="title" />
        {state?.errors?.title && (
          <p className="error">{state.errors.title}</p>
        )}
      </div>
      
      <div>
        <textarea name="content" />
        {state?.errors?.content && (
          <p className="error">{state.errors.content}</p>
        )}
      </div>
      
      <div>
        <select name="category">
          <option value="">Select...</option>
          <option value="tech">Tech</option>
          <option value="lifestyle">Lifestyle</option>
        </select>
        {state?.errors?.category && (
          <p className="error">{state.errors.category}</p>
        )}
      </div>
      
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
      
      {state?.success && (
        <p className="success">Post created!</p>
      )}
    </form>
  )
}
```

---

## Error Handling

### Option 1: Return Errors (Recommended)
```typescript
'use server'

type ActionResult = {
  error?: string
  data?: Post
}

export async function createPost(
  prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  try {
    const title = formData.get('title') as string
    
    // Validation
    if (!title) {
      return { error: 'Title is required' }
    }
    
    // Business logic error
    const existing = await db.posts.findFirst({ where: { title } })
    if (existing) {
      return { error: 'Post with this title already exists' }
    }
    
    // Success
    const post = await db.posts.create({ data: { title } })
    return { data: post }
    
  } catch (error) {
    console.error('Create post error:', error)
    return { error: 'Failed to create post' }
  }
}
```

### Option 2: Throw Errors
```typescript
'use server'

export async function deletePost(formData: FormData) {
  const id = formData.get('id') as string
  
  const post = await db.posts.findUnique({ where: { id } })
  
  if (!post) {
    throw new Error('Post not found')
  }
  
  await db.posts.delete({ where: { id } })
}
```

**Caught by error boundary:**
```typescript
// app/posts/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Option 3: toast/notification
```typescript
'use client'

import { useActionState } from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'

export default function Form() {
  const [state, action, isPending] = useActionState(createPost, null)
  
  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    }
    if (state?.success) {
      toast.success('Post created!')
    }
  }, [state])
  
  return <form action={action}>...</form>
}
```

---

## Revalidation

Server Actions can revalidate cached data.

### revalidatePath

Revalidate all data on a path.
```typescript
'use server'

import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  await db.posts.create({ data: { title } })
  
  // Revalidate posts list page
  revalidatePath('/posts')
  
  // Revalidate all blog pages
  revalidatePath('/blog', 'layout') // Revalidates layout and all children
}
```

**Options:**
```typescript
revalidatePath('/posts')              // Single page
revalidatePath('/posts', 'page')      // Single page (explicit)
revalidatePath('/blog', 'layout')     // Layout and all nested pages
```

### revalidateTag

Revalidate data with specific cache tag.
```typescript
// Fetch with tag
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] }
  })
  return res.json()
}

// Revalidate by tag
'use server'

import { revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.posts.create({ data: {...} })
  
  // Revalidate all data tagged 'posts'
  revalidateTag('posts')
}
```

### Multiple Revalidations
```typescript
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.posts.create({ data: {...} })
  
  // Revalidate multiple paths
  revalidatePath('/posts')
  revalidatePath('/')
  revalidatePath('/blog', 'layout')
  
  // Revalidate multiple tags
  revalidateTag('posts')
  revalidateTag('homepage')
}
```

---

## Redirect After Action

### Option 1: redirect (Server Action)
```typescript
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  const post = await db.posts.create({
    data: { title }
  })
  
  revalidatePath('/posts')
  
  // Redirect to new post
  redirect(`/posts/${post.id}`)
}
```

### Option 2: router.push (Client)
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useActionState } from 'react'

export default function Form() {
  const router = useRouter()
  const [state, action, isPending] = useActionState(createPost, null)
  
  // Redirect on success
  if (state?.success && state?.postId) {
    router.push(`/posts/${state.postId}`)
  }
  
  return <form action={action}>...</form>
}
```

### With Confirmation
```typescript
'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'

export default function Form() {
  const router = useRouter()
  const [state, action, isPending] = useActionState(createPost, null)
  
  if (state?.success) {
    // Show success message, then redirect
    setTimeout(() => {
      router.push('/posts')
    }, 2000)
  }
  
  return (
    <form action={action}>
      {state?.success && (
        <div className="success">
          Post created! Redirecting...
        </div>
      )}
      {/* form fields */}
    </form>
  )
}
```

---

## File Uploads

### Single File Upload
```typescript
// app/actions.ts
'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'

export async function uploadFile(formData: FormData) {
  const file = formData.get('file') as File
  
  if (!file) {
    throw new Error('No file uploaded')
  }
  
  // Convert to buffer
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  
  // Save to disk
  const path = join(process.cwd(), 'public/uploads', file.name)
  await writeFile(path, buffer)
  
  return { success: true, path: `/uploads/${file.name}` }
}
```
```typescript
// app/upload/page.tsx
'use client'

import { useActionState } from 'react'
import { uploadFile } from '@/app/actions'

export default function Upload() {
  const [state, action, isPending] = useActionState(uploadFile, null)
  
  return (
    <form action={action}>
      <input type="file" name="file" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Uploading...' : 'Upload'}
      </button>
      
      {state?.success && (
        <p>File uploaded: {state.path}</p>
      )}
    </form>
  )
}
```

### Multiple Files
```typescript
'use server'

export async function uploadFiles(formData: FormData) {
  const files = formData.getAll('files') as File[]
  
  const uploads = await Promise.all(
    files.map(async (file) => {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const path = join(process.cwd(), 'public/uploads', file.name)
      await writeFile(path, buffer)
      return `/uploads/${file.name}`
    })
  )
  
  return { success: true, paths: uploads }
}
```
```typescript
<input type="file" name="files" multiple required />
```

### With Validation
```typescript
'use server'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function uploadImage(
  prevState: any,
  formData: FormData
) {
  const file = formData.get('file') as File
  
  // Validation
  if (!file) {
    return { error: 'No file selected' }
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { error: 'File too large (max 5MB)' }
  }
  
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'Invalid file type. Use JPEG, PNG, or WebP' }
  }
  
  // Upload
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = `${Date.now()}-${file.name}`
  const path = join(process.cwd(), 'public/uploads', filename)
  
  await writeFile(path, buffer)
  
  return { success: true, url: `/uploads/${filename}` }
}
```

---

## Optimistic Updates

Show UI changes immediately while server processes.

### Basic Pattern
```typescript
'use client'

import { useOptimistic } from 'react'
import { likePost } from '@/app/actions'

type Post = {
  id: string
  likes: number
}

export default function Post({ post }: { post: Post }) {
  const [optimisticLikes, setOptimisticLikes] = useOptimistic(
    post.likes,
    (state, newLikes: number) => newLikes
  )
  
  const handleLike = async () => {
    // Show optimistic update
    setOptimisticLikes(optimisticLikes + 1)
    
    // Call server action
    await likePost(post.id)
  }
  
  return (
    <button onClick={handleLike}>
      ❤️ {optimisticLikes}
    </button>
  )
}
```

### With useActionState
```typescript
'use client'

import { useActionState, useOptimistic } from 'react'

type Todo = {
  id: string
  text: string
  completed: boolean
}

export default function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, setOptimisticTodos] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, newTodo]
  )
  
  const [state, action, isPending] = useActionState(createTodo, null)
  
  const handleSubmit = async (formData: FormData) => {
    const text = formData.get('text') as string
    
    // Optimistic update
    setOptimisticTodos({
      id: 'temp-' + Date.now(),
      text,
      completed: false,
    })
    
    // Server action
    await action(formData)
  }
  
  return (
    <div>
      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id} style={{ opacity: todo.id.startsWith('temp') ? 0.5 : 1 }}>
            {todo.text}
          </li>
        ))}
      </ul>
      
      <form action={handleSubmit}>
        <input name="text" required />
        <button type="submit" disabled={isPending}>
          Add Todo
        </button>
      </form>
    </div>
  )
}
```

---

## Security Best Practices

### 1. Always Validate Input
```typescript
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(5).max(100),
  content: z.string().min(20),
  published: z.boolean(),
})

export async function createPost(formData: FormData) {
  // Parse and validate
  const parsed = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published') === 'true',
  })
  
  if (!parsed.success) {
    throw new Error('Invalid input')
  }
  
  await db.posts.create({ data: parsed.data })
}
```

### 2. Check Authentication
```typescript
'use server'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function deletePost(formData: FormData) {
  const session = await auth()
  
  if (!session) {
    redirect('/login')
  }
  
  const postId = formData.get('id') as string
  const post = await db.posts.findUnique({ where: { id: postId } })
  
  // Check ownership
  if (post.authorId !== session.user.id) {
    throw new Error('Unauthorized')
  }
  
  await db.posts.delete({ where: { id: postId } })
}
```

### 3. Rate Limiting
```typescript
'use server'

import { ratelimit } from '@/lib/ratelimit'
import { headers } from 'next/headers'

export async function sendEmail(formData: FormData) {
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') || 'unknown'
  
  // Check rate limit (e.g., 5 requests per hour)
  const { success } = await ratelimit.limit(ip)
  
  if (!success) {
    throw new Error('Rate limit exceeded')
  }
  
  // Send email
  await sendEmailService(formData)
}
```

### 4. CSRF Protection

Server Actions have **built-in CSRF protection**. No additional work needed.
```typescript
// Next.js automatically:
// - Checks origin header
// - Validates request is from same site
// - No CSRF tokens needed
```

---

## Common Patterns

### Pattern 1: Create with Redirect
```typescript
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  
  const post = await db.posts.create({
    data: { title, content }
  })
  
  revalidatePath('/posts')
  redirect(`/posts/${post.id}`)
}
```

### Pattern 2: Update with Feedback
```typescript
'use server'

export async function updatePost(
  prevState: any,
  formData: FormData
) {
  const id = formData.get('id') as string
  const title = formData.get('title') as string
  
  try {
    await db.posts.update({
      where: { id },
      data: { title }
    })
    
    return { success: true, message: 'Post updated!' }
  } catch (error) {
    return { error: 'Failed to update post' }
  }
}
```

### Pattern 3: Delete with Confirmation
```typescript
'use client'

import { deletePost } from '@/app/actions'

export default function DeleteButton({ postId }: { postId: string }) {
  const handleDelete = async () => {
    if (!confirm('Are you sure?')) return
    
    await deletePost(postId)
  }
  
  return (
    <button onClick={handleDelete}>
      Delete
    </button>
  )
}
```

### Pattern 4: Multi-Step Form
```typescript
'use client'

import { useState } from 'react'
import { useActionState } from 'react'

export default function MultiStepForm() {
  const [step, setStep] = useState(1)
  const [state, action, isPending] = useActionState(submitForm, null)
  
  if (state?.success) {
    return <div>Form submitted!</div>
  }
  
  return (
    <form action={action}>
      {step === 1 && (
        <div>
          <input name="name" required />
          <button type="button" onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      )}
      
      {step === 2 && (
        <div>
          <input name="email" required />
          <button type="button" onClick={() => setStep(1)}>
            Back
          </button>
          <button type="submit" disabled={isPending}>
            Submit
          </button>
        </div>
      )}
    </form>
  )
}
```

---

## Quick Reference

### Basic Server Action
```typescript
'use server'

export async function action(formData: FormData) {
  // Validation
  // Database operation
  // Revalidation
  // No return (void)
}
```

### With useActionState
```typescript
'use server'

export async function action(
  prevState: State | null,
  formData: FormData
): Promise<State> {
  // Validation
  // Operation
  return { error: '...' } or { success: true }
}

// Client
const [state, action, isPending] = useActionState(action, null)
```

### Revalidation
```typescript
import { revalidatePath, revalidateTag } from 'next/cache'

revalidatePath('/posts')
revalidatePath('/blog', 'layout')
revalidateTag('posts')
```

### Redirect
```typescript
import { redirect } from 'next/navigation'

redirect('/posts')
```

---

**Related Documentation:**
- [TypeScript Patterns](05-typescript.md)
- [Server/Client Components](04-server-client.md)
- [Routing & Pages](02-routing-pages.md)