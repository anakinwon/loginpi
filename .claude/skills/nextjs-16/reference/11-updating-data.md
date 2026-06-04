# Updating Data Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Data Updating Documentation

---

## Contents

- [Overview](#overview)
- [Server Actions](#server-actions)
- [Form Handling](#form-handling)
- [Optimistic Updates](#optimistic-updates)
- [Revalidation](#revalidation)
- [Error Handling](#error-handling)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js 16 uses **Server Actions** as the primary method for updating data. Server Actions are asynchronous functions that run on the server.

### Why Server Actions?

- **Type-safe** - End-to-end TypeScript support
- **No API routes needed** - Direct database access
- **Progressive enhancement** - Works without JavaScript
- **Built-in revalidation** - Automatic cache updates
- **Secure** - Runs on server only

---

## Server Actions

### Basic Server Action

```typescript
// app/actions.ts
'use server'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  // Save to database
  await db.post.create({
    data: { title }
  })
  
  // No return needed for form actions
}
```

### With Type Safety

```typescript
// app/actions.ts
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1),
})

export async function createPost(formData: FormData) {
  const validated = PostSchema.parse({
    title: formData.get('title'),
    content: formData.get('content'),
  })
  
  await db.post.create({
    data: validated
  })
}
```

### Inline Server Actions

```typescript
// app/posts/new/page.tsx
export default function NewPost() {
  async function handleSubmit(formData: FormData) {
    'use server'
    
    const title = formData.get('title') as string
    await db.post.create({ data: { title } })
  }
  
  return (
    <form action={handleSubmit}>
      <input name="title" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

---

## Form Handling

### Simple Form Action

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  
  await db.post.create({
    data: { title, published: true }
  })
  
  revalidatePath('/posts')
}

// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create Post</button>
    </form>
  )
}
```

### With useActionState (Client Component)

```typescript
// app/actions.ts
'use server'

type State = {
  error?: string
  success?: boolean
}

export async function createPost(
  prevState: State,
  formData: FormData
): Promise<State> {
  const title = formData.get('title') as string
  
  if (!title) {
    return { error: 'Title is required' }
  }
  
  try {
    await db.post.create({ data: { title } })
    return { success: true }
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}

// app/posts/new/page.tsx
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, formAction, isPending] = useActionState(createPost, {})
  
  return (
    <form action={formAction}>
      <input name="title" required />
      <button disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">Post created!</p>}
    </form>
  )
}
```

### Programmatic Form Submission

```typescript
'use client'
import { useActionState } from 'react'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const [state, formAction, isPending] = useActionState(createPost, {})
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formAction(formData)
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <button disabled={isPending}>Submit</button>
    </form>
  )
}
```

---

## Optimistic Updates

Update the UI immediately before server confirms.

### useOptimistic Hook

```typescript
'use client'
import { useOptimistic } from 'react'
import { addTodo } from '@/app/actions'

type Todo = {
  id: string
  text: string
}

export default function TodoList({ todos }: { todos: Todo[] }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: string) => [
      ...state,
      { id: crypto.randomUUID(), text: newTodo }
    ]
  )
  
  async function formAction(formData: FormData) {
    const text = formData.get('text') as string
    addOptimisticTodo(text)
    await addTodo(text)
  }
  
  return (
    <>
      <ul>
        {optimisticTodos.map(todo => (
          <li key={todo.id}>{todo.text}</li>
        ))}
      </ul>
      <form action={formAction}>
        <input name="text" required />
        <button type="submit">Add Todo</button>
      </form>
    </>
  )
}
```

### Optimistic Update Pattern

```typescript
'use client'
import { useOptimistic } from 'react'
import { toggleComplete } from '@/app/actions'

type Todo = {
  id: string
  text: string
  completed: boolean
}

export default function TodoItem({ todo }: { todo: Todo }) {
  const [optimisticTodo, setOptimisticTodo] = useOptimistic(todo)
  
  async function handleToggle() {
    setOptimisticTodo({ ...todo, completed: !todo.completed })
    await toggleComplete(todo.id)
  }
  
  return (
    <li>
      <input
        type="checkbox"
        checked={optimisticTodo.completed}
        onChange={handleToggle}
      />
      {optimisticTodo.text}
    </li>
  )
}
```

---

## Revalidation

### revalidatePath

Revalidate all pages at a specific path.

```typescript
'use server'
import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({
    data: { title: formData.get('title') as string }
  })
  
  // Revalidate the posts list page
  revalidatePath('/posts')
}

// Revalidate dynamic routes
export async function updatePost(id: string, formData: FormData) {
  await db.post.update({
    where: { id },
    data: { title: formData.get('title') as string }
  })
  
  // Revalidate both list and detail pages
  revalidatePath('/posts')
  revalidatePath(`/posts/${id}`)
}
```

### revalidateTag

Revalidate by cache tag.

```typescript
'use server'
import { revalidateTag } from 'next/cache'

export async function createPost(formData: FormData) {
  await db.post.create({
    data: { title: formData.get('title') as string }
  })
  
  // Revalidate all requests tagged with 'posts'
  revalidateTag('posts')
}

// The corresponding fetch with tag
const posts = await fetch('https://api.example.com/posts', {
  next: { tags: ['posts'] }
})
```

### updateTag (Immediate)

Use in Server Actions for read-your-own-writes.

```typescript
'use server'
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const post = await db.post.create({
    data: { title: formData.get('title') as string }
  })
  
  // Immediately expire cache
  updateTag('posts')
  
  // User sees their new post immediately
  redirect(`/posts/${post.id}`)
}
```

---

## Error Handling

### Try-Catch in Server Action

```typescript
'use server'

export async function createPost(formData: FormData) {
  try {
    await db.post.create({
      data: { title: formData.get('title') as string }
    })
  } catch (error) {
    console.error('Failed to create post:', error)
    throw new Error('Failed to create post')
  }
}
```

### Return Error State

```typescript
'use server'

type State = {
  error?: string
  success?: boolean
}

export async function createPost(
  prevState: State,
  formData: FormData
): Promise<State> {
  try {
    const title = formData.get('title') as string
    
    if (!title) {
      return { error: 'Title is required' }
    }
    
    await db.post.create({ data: { title } })
    return { success: true }
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}
```

### With Zod Validation

```typescript
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title too long'),
  content: z.string().min(1, 'Content is required'),
})

type State = {
  errors?: {
    title?: string[]
    content?: string[]
  }
  success?: boolean
}

export async function createPost(
  prevState: State,
  formData: FormData
): Promise<State> {
  const result = PostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })
  
  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
    }
  }
  
  try {
    await db.post.create({ data: result.data })
    return { success: true }
  } catch (error) {
    return { errors: { title: ['Failed to create post'] } }
  }
}
```

---

## Common Patterns

### Pattern 1: Create Record

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const post = await db.post.create({
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
      authorId: formData.get('authorId') as string,
    }
  })
  
  revalidatePath('/posts')
  redirect(`/posts/${post.id}`)
}

// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="content" required />
      <input type="hidden" name="authorId" value="user-123" />
      <button type="submit">Create Post</button>
    </form>
  )
}
```

### Pattern 2: Update Record

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function updatePost(id: string, formData: FormData) {
  await db.post.update({
    where: { id },
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    }
  })
  
  revalidatePath('/posts')
  revalidatePath(`/posts/${id}`)
}

// app/posts/[id]/edit/page.tsx
import { updatePost } from '@/app/actions'
import { db } from '@/lib/db'

export default async function EditPost({ params }: PageProps<'/posts/[id]/edit'>) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })
  
  return (
    <form action={updatePost.bind(null, id)}>
      <input name="title" defaultValue={post.title} required />
      <textarea name="content" defaultValue={post.content} required />
      <button type="submit">Update Post</button>
    </form>
  )
}
```

### Pattern 3: Delete Record

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function deletePost(id: string) {
  await db.post.delete({ where: { id } })
  
  revalidatePath('/posts')
  redirect('/posts')
}

// app/posts/[id]/page.tsx
import { deletePost } from '@/app/actions'

export default async function PostPage({ params }: PageProps<'/posts/[id]'>) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })
  
  return (
    <article>
      <h1>{post.title}</h1>
      <form action={deletePost.bind(null, id)}>
        <button type="submit">Delete Post</button>
      </form>
    </article>
  )
}
```

### Pattern 4: Toggle Boolean

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function togglePublished(id: string) {
  const post = await db.post.findUnique({ where: { id } })
  
  await db.post.update({
    where: { id },
    data: { published: !post.published }
  })
  
  revalidatePath('/posts')
}

// app/posts/page.tsx
import { togglePublished } from '@/app/actions'

export default async function PostsPage() {
  const posts = await db.post.findMany()
  
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>
          {post.title}
          <form action={togglePublished.bind(null, post.id)}>
            <button type="submit">
              {post.published ? 'Unpublish' : 'Publish'}
            </button>
          </form>
        </li>
      ))}
    </ul>
  )
}
```

### Pattern 5: File Upload

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
  
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  
  const path = join('/tmp', file.name)
  await writeFile(path, buffer)
  
  return { success: true, path }
}

// app/upload/page.tsx
'use client'
import { useActionState } from 'react'
import { uploadFile } from '@/app/actions'

export default function UploadPage() {
  const [state, formAction, isPending] = useActionState(uploadFile, null)
  
  return (
    <form action={formAction}>
      <input type="file" name="file" required />
      <button disabled={isPending}>
        {isPending ? 'Uploading...' : 'Upload'}
      </button>
      {state?.success && <p>File uploaded to {state.path}</p>}
    </form>
  )
}
```

### Pattern 6: Bulk Operations

```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache'

export async function bulkDelete(ids: string[]) {
  await db.post.deleteMany({
    where: {
      id: { in: ids }
    }
  })
  
  revalidatePath('/posts')
}

// app/posts/page.tsx
'use client'
import { useState } from 'react'
import { bulkDelete } from '@/app/actions'

export default function PostsPage({ posts }) {
  const [selected, setSelected] = useState<string[]>([])
  
  async function handleDelete() {
    await bulkDelete(selected)
    setSelected([])
  }
  
  return (
    <>
      <button onClick={handleDelete} disabled={selected.length === 0}>
        Delete Selected ({selected.length})
      </button>
      <ul>
        {posts.map(post => (
          <li key={post.id}>
            <input
              type="checkbox"
              checked={selected.includes(post.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelected([...selected, post.id])
                } else {
                  setSelected(selected.filter(id => id !== post.id))
                }
              }}
            />
            {post.title}
          </li>
        ))}
      </ul>
    </>
  )
}
```

---

## Best Practices

### 1. Always Revalidate After Mutations

```typescript
// ✅ GOOD - Revalidates cache
export async function createPost(formData: FormData) {
  await db.post.create({ data: {...} })
  revalidatePath('/posts')
}

// ❌ BAD - Stale cache
export async function createPost(formData: FormData) {
  await db.post.create({ data: {...} })
  // No revalidation!
}
```

### 2. Use Type-Safe Validation

```typescript
// ✅ GOOD - Type-safe with Zod
const PostSchema = z.object({
  title: z.string().min(1),
})

export async function createPost(formData: FormData) {
  const data = PostSchema.parse({
    title: formData.get('title')
  })
  await db.post.create({ data })
}

// ❌ BAD - No validation
export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  await db.post.create({ data: { title } })
}
```

### 3. Handle Errors Gracefully

```typescript
// ✅ GOOD - Returns error state
export async function createPost(prevState, formData): Promise<State> {
  try {
    await db.post.create({...})
    return { success: true }
  } catch (error) {
    return { error: 'Failed to create post' }
  }
}

// ❌ BAD - Throws unhandled error
export async function createPost(formData: FormData) {
  await db.post.create({...}) // Might throw
}
```

### 4. Use Optimistic Updates for Better UX

```typescript
// ✅ GOOD - Immediate UI feedback
const [optimisticTodos, addOptimisticTodo] = useOptimistic(todos)

async function addTodo(text: string) {
  addOptimisticTodo(text) // Instant UI update
  await createTodo(text)    // Confirm on server
}

// ❌ BAD - Wait for server
async function addTodo(text: string) {
  await createTodo(text) // User waits
  // UI updates after response
}
```

---

## Quick Reference

### Server Action Template

```typescript
'use server'
import { revalidatePath } from 'next/cache'

export async function actionName(formData: FormData) {
  // 1. Get data
  const data = formData.get('field') as string
  
  // 2. Validate
  if (!data) throw new Error('Invalid data')
  
  // 3. Mutate
  await db.model.create({ data: { field: data } })
  
  // 4. Revalidate
  revalidatePath('/path')
}
```

### Form with useActionState

```typescript
'use client'
import { useActionState } from 'react'

export default function Form() {
  const [state, formAction, isPending] = useActionState(serverAction, {})
  
  return (
    <form action={formAction}>
      <input name="field" />
      <button disabled={isPending}>Submit</button>
      {state.error && <p>{state.error}</p>}
    </form>
  )
}
```

---

**Related Documentation:**
- [Fetching Data](10-fetching-data.md)
- [Server Actions](06-server-actions.md)
- [Caching and Revalidating](12-caching-revalidating.md)