# Server Actions Examples - Ready to Use Templates

Copy and adapt these patterns for your server actions.

---

## Contents

- [Form Actions (Void Return)](#form-actions-void-return)
- [useActionState Actions](#useactionstate-actions)
- [File Upload Actions](#file-upload-actions)
- [Validation Patterns](#validation-patterns)
- [Authentication Actions](#authentication-actions)
- [CRUD Operations](#crud-operations)
- [Multi-Step Forms](#multi-step-forms)
- [Optimistic Updates](#optimistic-updates)

---

## Form Actions (Void Return)

### Basic Create Action
```typescript
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  
  // Validation
  if (!title || title.length < 5) {
    throw new Error('Title must be at least 5 characters')
  }
  
  // Database operation
  const post = await db.posts.create({
    data: { title, content }
  })
  
  // Revalidate and redirect
  revalidatePath('/posts')
  redirect(`/posts/${post.id}`)
}

// app/posts/new/page.tsx
import { createPost } from '@/app/actions'

export default function NewPost() {
  return (
    <form action={createPost} className="space-y-4">
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          required
          className="w-full px-4 py-2 border rounded"
        />
      </div>
      
      <div>
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          name="content"
          required
          className="w-full px-4 py-2 border rounded"
          rows={10}
        />
      </div>
      
      <button 
        type="submit"
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Create Post
      </button>
    </form>
  )
}
```

### Update Action
```typescript
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function updatePost(formData: FormData) {
  const id = formData.get('id') as string
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  
  await db.posts.update({
    where: { id },
    data: { title, content }
  })
  
  revalidatePath(`/posts/${id}`)
}

// app/posts/[id]/edit/page.tsx
import { updatePost } from '@/app/actions'

export default async function EditPost({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const post = await getPost(id)
  
  return (
    <form action={updatePost} className="space-y-4">
      <input type="hidden" name="id" value={post.id} />
      
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={post.title}
          required
          className="w-full px-4 py-2 border rounded"
        />
      </div>
      
      <div>
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          name="content"
          defaultValue={post.content}
          required
          className="w-full px-4 py-2 border rounded"
          rows={10}
        />
      </div>
      
      <button 
        type="submit"
        className="bg-blue-600 text-white px-6 py-2 rounded"
      >
        Update Post
      </button>
    </form>
  )
}
```

### Delete Action
```typescript
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function deletePost(formData: FormData) {
  const id = formData.get('id') as string
  
  await db.posts.delete({
    where: { id }
  })
  
  revalidatePath('/posts')
  redirect('/posts')
}

// app/posts/[id]/page.tsx
import { deletePost } from '@/app/actions'

export default async function Post({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const post = await getPost(id)
  
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
      
      <form action={deletePost}>
        <input type="hidden" name="id" value={post.id} />
        <button 
          type="submit"
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Delete Post
        </button>
      </form>
    </article>
  )
}
```

---

## useActionState Actions

### Basic Form with Feedback
```typescript
// app/actions.ts
'use server'

type FormState = {
  error?: string
  success?: boolean
  data?: any
}

export async function submitContact(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const message = formData.get('message') as string
  
  // Validation
  if (!name || name.length < 2) {
    return { error: 'Name must be at least 2 characters' }
  }
  
  if (!email || !email.includes('@')) {
    return { error: 'Invalid email address' }
  }
  
  if (!message || message.length < 10) {
    return { error: 'Message must be at least 10 characters' }
  }
  
  try {
    // Send email or save to database
    await sendEmail({ name, email, message })
    
    return { 
      success: true,
      data: { name, email }
    }
  } catch (error) {
    return { error: 'Failed to send message. Please try again.' }
  }
}

// app/contact/page.tsx
'use client'

import { useActionState } from 'react'
import { submitContact } from '@/app/actions'

export default function Contact() {
  const [state, action, isPending] = useActionState(submitContact, null)
  
  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Contact Us</h1>
      
      {state?.success ? (
        <div className="bg-green-50 border border-green-200 rounded p-4">
          <h2 className="font-semibold text-green-900">Message Sent!</h2>
          <p className="text-green-700">
            Thanks {state.data.name}, we'll get back to you soon.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          {state?.error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
              {state.error}
            </div>
          )}
          
          <div>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-4 py-2 border rounded"
            />
          </div>
          
          <div>
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              name="message"
              required
              className="w-full px-4 py-2 border rounded"
              rows={5}
            />
          </div>
          
          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {isPending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      )}
    </div>
  )
}
```

### Multi-Field Validation
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
  postId?: string
}

export async function createPost(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const title = formData.get('title') as string
  const content = formData.get('content') as string
  const category = formData.get('category') as string
  
  // Validate all fields
  const errors: FormState['errors'] = {}
  
  if (!title || title.length < 5) {
    errors.title = 'Title must be at least 5 characters'
  }
  
  if (!content || content.length < 20) {
    errors.content = 'Content must be at least 20 characters'
  }
  
  if (!category) {
    errors.category = 'Please select a category'
  }
  
  // Return errors if any
  if (Object.keys(errors).length > 0) {
    return { errors }
  }
  
  // Create post
  try {
    const post = await db.posts.create({
      data: { title, content, category }
    })
    
    return { 
      success: true,
      postId: post.id
    }
  } catch (error) {
    return { 
      errors: { 
        title: 'Failed to create post. Please try again.' 
      }
    }
  }
}

// app/posts/new/page.tsx
'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { createPost } from '@/app/actions'

export default function NewPost() {
  const router = useRouter()
  const [state, action, isPending] = useActionState(createPost, null)
  
  // Redirect on success
  if (state?.success && state?.postId) {
    router.push(`/posts/${state.postId}`)
  }
  
  return (
    <form action={action} className="max-w-2xl mx-auto py-8 space-y-4">
      <h1 className="text-3xl font-bold mb-6">Create Post</h1>
      
      <div>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          className={`w-full px-4 py-2 border rounded ${
            state?.errors?.title ? 'border-red-500' : ''
          }`}
        />
        {state?.errors?.title && (
          <p className="text-red-500 text-sm mt-1">
            {state.errors.title}
          </p>
        )}
      </div>
      
      <div>
        <label htmlFor="content">Content</label>
        <textarea
          id="content"
          name="content"
          className={`w-full px-4 py-2 border rounded ${
            state?.errors?.content ? 'border-red-500' : ''
          }`}
          rows={10}
        />
        {state?.errors?.content && (
          <p className="text-red-500 text-sm mt-1">
            {state.errors.content}
          </p>
        )}
      </div>
      
      <div>
        <label htmlFor="category">Category</label>
        <select
          id="category"
          name="category"
          className={`w-full px-4 py-2 border rounded ${
            state?.errors?.category ? 'border-red-500' : ''
          }`}
        >
          <option value="">Select a category</option>
          <option value="tech">Technology</option>
          <option value="design">Design</option>
          <option value="business">Business</option>
        </select>
        {state?.errors?.category && (
          <p className="text-red-500 text-sm mt-1">
            {state.errors.category}
          </p>
        )}
      </div>
      
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-blue-600 text-white px-6 py-3 rounded disabled:opacity-50"
      >
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

---

## File Upload Actions

### Single File Upload
```typescript
// app/actions.ts
'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'

type UploadState = {
  error?: string
  success?: boolean
  url?: string
}

export async function uploadImage(
  prevState: UploadState | null,
  formData: FormData
): Promise<UploadState> {
  const file = formData.get('file') as File
  
  // Validation
  if (!file) {
    return { error: 'No file selected' }
  }
  
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB
  if (file.size > MAX_SIZE) {
    return { error: 'File size must be less than 5MB' }
  }
  
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: 'File must be JPEG, PNG, or WebP' }
  }
  
  try {
    // Convert to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Generate unique filename
    const filename = `${Date.now()}-${file.name}`
    const filepath = join(process.cwd(), 'public/uploads', filename)
    
    // Save to disk
    await writeFile(filepath, buffer)
    
    return {
      success: true,
      url: `/uploads/${filename}`
    }
  } catch (error) {
    return { error: 'Failed to upload file' }
  }
}

// app/upload/page.tsx
'use client'

import { useActionState } from 'react'
import { uploadImage } from '@/app/actions'

export default function Upload() {
  const [state, action, isPending] = useActionState(uploadImage, null)
  
  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Upload Image</h1>
      
      <form action={action} className="space-y-4">
        {state?.error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
            {state.error}
          </div>
        )}
        
        {state?.success && state?.url && (
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <p className="text-green-700 mb-2">Upload successful!</p>
            <img 
              src={state.url} 
              alt="Uploaded"
              className="max-w-full rounded"
            />
          </div>
        )}
        
        <div>
          <label htmlFor="file">Choose image</label>
          <input
            id="file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className="w-full"
          />
        </div>
        
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  )
}
```

### Multiple Files Upload
```typescript
// app/actions.ts
'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'

type UploadState = {
  error?: string
  success?: boolean
  urls?: string[]
}

export async function uploadImages(
  prevState: UploadState | null,
  formData: FormData
): Promise<UploadState> {
  const files = formData.getAll('files') as File[]
  
  if (files.length === 0) {
    return { error: 'No files selected' }
  }
  
  if (files.length > 10) {
    return { error: 'Maximum 10 files allowed' }
  }
  
  try {
    const uploadPromises = files.map(async (file) => {
      // Validate each file
      const MAX_SIZE = 5 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        throw new Error(`${file.name} is too large`)
      }
      
      const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(`${file.name} is not a valid image type`)
      }
      
      // Upload
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filename = `${Date.now()}-${file.name}`
      const filepath = join(process.cwd(), 'public/uploads', filename)
      
      await writeFile(filepath, buffer)
      return `/uploads/${filename}`
    })
    
    const urls = await Promise.all(uploadPromises)
    
    return {
      success: true,
      urls
    }
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }
  }
}

// app/upload/page.tsx
'use client'

import { useActionState } from 'react'
import { uploadImages } from '@/app/actions'

export default function Upload() {
  const [state, action, isPending] = useActionState(uploadImages, null)
  
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Upload Images</h1>
      
      <form action={action} className="space-y-4">
        {state?.error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
            {state.error}
          </div>
        )}
        
        {state?.success && state?.urls && (
          <div className="bg-green-50 border border-green-200 rounded p-4">
            <p className="text-green-700 mb-4">
              {state.urls.length} files uploaded successfully!
            </p>
            <div className="grid grid-cols-3 gap-4">
              {state.urls.map((url, index) => (
                <img 
                  key={index}
                  src={url}
                  alt={`Upload ${index + 1}`}
                  className="w-full rounded"
                />
              ))}
            </div>
          </div>
        )}
        
        <div>
          <label htmlFor="files">Choose images (max 10)</label>
          <input
            id="files"
            name="files"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            required
            className="w-full"
          />
        </div>
        
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'Uploading...' : 'Upload Images'}
        </button>
      </form>
    </div>
  )
}
```

---

## Validation Patterns

### With Zod Schema
```typescript
// app/actions.ts
'use server'

import { z } from 'zod'

const PostSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  content: z.string().min(20, 'Content must be at least 20 characters'),
  published: z.boolean(),
  tags: z.array(z.string()).min(1, 'At least one tag required'),
})

type FormState = {
  errors?: {
    title?: string[]
    content?: string[]
    published?: string[]
    tags?: string[]
    _form?: string[]
  }
  success?: boolean
}

export async function createPost(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  // Parse form data
  const data = {
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published') === 'true',
    tags: formData.getAll('tags'),
  }
  
  // Validate with Zod
  const result = PostSchema.safeParse(data)
  
  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors
    }
  }
  
  // Save to database
  try {
    await db.posts.create({
      data: result.data
    })
    
    return { success: true }
  } catch (error) {
    return {
      errors: {
        _form: ['Failed to create post']
      }
    }
  }
}
```

### Custom Validation
```typescript
// app/actions.ts
'use server'

type FormState = {
  errors?: Record<string, string>
  success?: boolean
}

function validateEmail(email: string): string | null {
  if (!email) return 'Email is required'
  if (!email.includes('@')) return 'Invalid email format'
  if (email.length < 5) return 'Email too short'
  return null
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain number'
  return null
}

export async function register(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  
  // Validate
  const errors: Record<string, string> = {}
  
  const emailError = validateEmail(email)
  if (emailError) errors.email = emailError
  
  const passwordError = validatePassword(password)
  if (passwordError) errors.password = passwordError
  
  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors }
  }
  
  // Register user
  try {
    await createUser({ email, password })
    return { success: true }
  } catch (error) {
    return {
      errors: { email: 'Email already exists' }
    }
  }
}
```

---

## Authentication Actions

### Login Action
```typescript
// app/actions.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT } from 'jose'

type LoginState = {
  error?: string
}

export async function login(
  prevState: LoginState | null,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  
  // Validate
  if (!email || !password) {
    return { error: 'Email and password are required' }
  }
  
  // Check credentials
  const user = await db.users.findUnique({
    where: { email }
  })
  
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Invalid email or password' }
  }
  
  // Create session
  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET))
  
  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  
  redirect('/dashboard')
}

// app/login/page.tsx
'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions'

export default function Login() {
  const [state, action, isPending] = useActionState(login, null)
  
  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Login</h1>
      
      <form action={action} className="space-y-4">
        {state?.error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">
            {state.error}
          </div>
        )}
        
        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full px-4 py-2 border rounded"
          />
        </div>
        
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full px-4 py-2 border rounded"
          />
        </div>
        
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}
```

### Logout Action
```typescript
// app/actions.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/login')
}

// app/components/logout-button.tsx
'use client'

import { logout } from '@/app/actions'

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button 
        type="submit"
        className="text-red-600 hover:text-red-700"
      >
        Logout
      </button>
    </form>
  )
}
```

---

## CRUD Operations

### Complete CRUD Actions
```typescript
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// CREATE
export async function createTodo(formData: FormData) {
  const text = formData.get('text') as string
  
  if (!text) {
    throw new Error('Text is required')
  }
  
  await db.todos.create({
    data: { text, completed: false }
  })
  
  revalidatePath('/todos')
}

// READ - done in page component

// UPDATE
export async function updateTodo(formData: FormData) {
  const id = formData.get('id') as string
  const completed = formData.get('completed') === 'true'
  
  await db.todos.update({
    where: { id },
    data: { completed }
  })
  
  revalidatePath('/todos')
}

// DELETE
export async function deleteTodo(formData: FormData) {
  const id = formData.get('id') as string
  
  await db.todos.delete({
    where: { id }
  })
  
  revalidatePath('/todos')
}

// app/todos/page.tsx
import { createTodo, updateTodo, deleteTodo } from '@/app/actions'

async function getTodos() {
  return db.todos.findMany()
}

export default async function Todos() {
  const todos = await getTodos()
  
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Todos</h1>
      
      {/* Create Form */}
      <form action={createTodo} className="mb-8 flex gap-2">
        <input
          name="text"
          type="text"
          placeholder="Add a todo..."
          required
          className="flex-1 px-4 py-2 border rounded"
        />
        <button 
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded"
        >
          Add
        </button>
      </form>
      
      {/* Todo List */}
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li 
            key={todo.id}
            className="flex items-center gap-4 p-4 bg-white rounded shadow"
          >
            {/* Update Form */}
            <form action={updateTodo}>
              <input type="hidden" name="id" value={todo.id} />
              <input 
                type="hidden" 
                name="completed" 
                value={(!todo.completed).toString()} 
              />
              <button type="submit">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  readOnly
                  className="w-5 h-5"
                />
              </button>
            </form>
            
            <span className={todo.completed ? 'line-through text-gray-500' : ''}>
              {todo.text}
            </span>
            
            {/* Delete Form */}
            <form action={deleteTodo} className="ml-auto">
              <input type="hidden" name="id" value={todo.id} />
              <button 
                type="submit"
                className="text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Multi-Step Forms

### Multi-Step with State
```typescript
// app/actions.ts
'use server'

type StepOneState = {
  email?: string
  name?: string
  errors?: Record<string, string>
}

type StepTwoState = {
  company?: string
  role?: string
  errors?: Record<string, string>
}

export async function submitStepOne(
  prevState: StepOneState | null,
  formData: FormData
): Promise<StepOneState> {
  const email = formData.get('email') as string
  const name = formData.get('name') as string
  
  const errors: Record<string, string> = {}
  
  if (!email || !email.includes('@')) {
    errors.email = 'Valid email required'
  }
  
  if (!name || name.length < 2) {
    errors.name = 'Name must be at least 2 characters'
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors }
  }
  
  return { email, name }
}

export async function submitStepTwo(
  prevState: StepTwoState | null,
  formData: FormData
): Promise<StepTwoState> {
  const company = formData.get('company') as string
  const role = formData.get('role') as string
  
  const errors: Record<string, string> = {}
  
  if (!company) {
    errors.company = 'Company required'
  }
  
  if (!role) {
    errors.role = 'Role required'
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors }
  }
  
  return { company, role }
}

export async function submitFinal(formData: FormData) {
  const data = {
    email: formData.get('email') as string,
    name: formData.get('name') as string,
    company: formData.get('company') as string,
    role: formData.get('role') as string,
  }
  
  await db.registrations.create({ data })
  redirect('/success')
}

// app/register/page.tsx
'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { submitStepOne, submitStepTwo, submitFinal } from '@/app/actions'

export default function Register() {
  const [step, setStep] = useState(1)
  const [stepOneData, setStepOneData] = useState<any>(null)
  const [stepTwoData, setStepTwoData] = useState<any>(null)
  
  const [stateOne, actionOne, isPendingOne] = useActionState(submitStepOne, null)
  const [stateTwo, actionTwo, isPendingTwo] = useActionState(submitStepTwo, null)
  
  // Move to step 2 when step 1 succeeds
  if (stateOne?.email && stateOne?.name && !stateOne?.errors && step === 1) {
    setStepOneData(stateOne)
    setStep(2)
  }
  
  // Move to step 3 when step 2 succeeds
  if (stateTwo?.company && stateTwo?.role && !stateTwo?.errors && step === 2) {
    setStepTwoData(stateTwo)
    setStep(3)
  }
  
  return (
    <div className="max-w-md mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Register</h1>
      
      {/* Progress indicator */}
      <div className="flex justify-between mb-8">
        <div className={`flex-1 text-center ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
          Step 1
        </div>
        <div className={`flex-1 text-center ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
          Step 2
        </div>
        <div className={`flex-1 text-center ${step >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
          Review
        </div>
      </div>
      
      {/* Step 1 */}
      {step === 1 && (
        <form action={actionOne} className="space-y-4">
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full px-4 py-2 border rounded"
            />
            {stateOne?.errors?.email && (
              <p className="text-red-500 text-sm mt-1">
                {stateOne.errors.email}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-4 py-2 border rounded"
            />
            {stateOne?.errors?.name && (
              <p className="text-red-500 text-sm mt-1">
                {stateOne.errors.name}
              </p>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isPendingOne}
            className="w-full bg-blue-600 text-white px-6 py-2 rounded"
          >
            Next
          </button>
        </form>
      )}
      
      {/* Step 2 */}
      {step === 2 && (
        <form action={actionTwo} className="space-y-4">
          <div>
            <label htmlFor="company">Company</label>
            <input
              id="company"
              name="company"
              type="text"
              required
              className="w-full px-4 py-2 border rounded"
            />
            {stateTwo?.errors?.company && (
              <p className="text-red-500 text-sm mt-1">
                {stateTwo.errors.company}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="role">Role</label>
            <input
              id="role"
              name="role"
              type="text"
              required
              className="w-full px-4 py-2 border rounded"
            />
            {stateTwo?.errors?.role && (
              <p className="text-red-500 text-sm mt-1">
                {stateTwo.errors.role}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 border px-6 py-2 rounded"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPendingTwo}
              className="flex-1 bg-blue-600 text-white px-6 py-2 rounded"
            >
              Next
            </button>
          </div>
        </form>
      )}
      
      {/* Step 3 - Review */}
      {step === 3 && (
        <form action={submitFinal} className="space-y-4">
          <div className="bg-gray-50 p-4 rounded">
            <h3 className="font-semibold mb-2">Review Your Information</h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-gray-600">Email:</dt>
                <dd>{stepOneData?.email}</dd>
                <input type="hidden" name="email" value={stepOneData?.email} />
              </div>
              <div>
                <dt className="text-sm text-gray-600">Name:</dt>
                <dd>{stepOneData?.name}</dd>
                <input type="hidden" name="name" value={stepOneData?.name} />
              </div>
              <div>
                <dt className="text-sm text-gray-600">Company:</dt>
                <dd>{stepTwoData?.company}</dd>
                <input type="hidden" name="company" value={stepTwoData?.company} />
              </div>
              <div>
                <dt className="text-sm text-gray-600">Role:</dt>
                <dd>{stepTwoData?.role}</dd>
                <input type="hidden" name="role" value={stepTwoData?.role} />
              </div>
            </dl>
          </div>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 border px-6 py-2 rounded"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white px-6 py-2 rounded"
            >
              Submit
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
```

---

## Optimistic Updates

### Todo List with Optimistic UI
```typescript
// app/actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function toggleTodo(id: string, completed: boolean) {
  await db.todos.update({
    where: { id },
    data: { completed }
  })
  
  revalidatePath('/todos')
}

export async function addTodo(text: string) {
  const todo = await db.todos.create({
    data: { text, completed: false }
  })
  
  revalidatePath('/todos')
  return todo
}

// app/todos/page.tsx
'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleTodo, addTodo } from '@/app/actions'

type Todo = {
  id: string
  text: string
  completed: boolean
}

export default function Todos({ initialTodos }: { initialTodos: Todo[] }) {
  const [isPending, startTransition] = useTransition()
  const [optimisticTodos, setOptimisticTodos] = useOptimistic(
    initialTodos,
    (state, newTodo: Todo) => [...state, newTodo]
  )
  
  const handleToggle = (todo: Todo) => {
    startTransition(async () => {
      // Optimistic update
      setOptimisticTodos(
        optimisticTodos.map((t) =>
          t.id === todo.id ? { ...t, completed: !t.completed } : t
        )
      )
      
      // Server update
      await toggleTodo(todo.id, !todo.completed)
    })
  }
  
  const handleAdd = async (formData: FormData) => {
    const text = formData.get('text') as string
    
    startTransition(async () => {
      // Optimistic update
      const tempTodo: Todo = {
        id: `temp-${Date.now()}`,
        text,
        completed: false,
      }
      setOptimisticTodos(tempTodo)
      
      // Server update
      await addTodo(text)
    })
  }
  
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Todos</h1>
      
      <form action={handleAdd} className="mb-8 flex gap-2">
        <input
          name="text"
          type="text"
          placeholder="Add a todo..."
          required
          className="flex-1 px-4 py-2 border rounded"
        />
        <button 
          type="submit"
          disabled={isPending}
          className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          Add
        </button>
      </form>
      
      <ul className="space-y-2">
        {optimisticTodos.map((todo) => (
          <li 
            key={todo.id}
            className={`flex items-center gap-4 p-4 bg-white rounded shadow ${
              todo.id.startsWith('temp-') ? 'opacity-50' : ''
            }`}
          >
            <button 
              onClick={() => handleToggle(todo)}
              disabled={isPending}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                readOnly
                className="w-5 h-5"
              />
            </button>
            
            <span className={todo.completed ? 'line-through text-gray-500' : ''}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Quick Reference

### Action Types
```typescript
// Form Action (Void Return)
'use server'
export async function action(formData: FormData) {
  // No return
  revalidatePath('/path')
}

// useActionState Action (Data Return)
'use server'
export async function action(
  prevState: State | null,
  formData: FormData
): Promise<State> {
  return { error: '...' } or { success: true }
}
```

### Common Patterns
```typescript
// Validation
if (!data) return { error: 'Required' }

// Database
await db.table.create({ data })

// Revalidation
revalidatePath('/path')
revalidateTag('tag')

// Redirect
redirect('/path')

// Error handling
try { } catch { return { error: '...' } }
```

---

**Related Documentation:**
- [Server Actions Reference](../reference/06-server-actions.md)
- [TypeScript Patterns](../reference/05-typescript.md)
- [Page Examples](./pages.md)