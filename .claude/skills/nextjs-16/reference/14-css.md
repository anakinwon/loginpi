# CSS and Styling Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Styling Documentation

---

## Contents

- [Overview](#overview)
- [CSS Modules](#css-modules)
- [Tailwind CSS](#tailwind-css)
- [Global Styles](#global-styles)
- [CSS-in-JS](#css-in-js)
- [Sass](#sass)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js 16 supports multiple styling methods:

1. **CSS Modules** - Scoped CSS files
2. **Tailwind CSS** - Utility-first CSS framework
3. **Global CSS** - Traditional global styles
4. **CSS-in-JS** - Runtime CSS libraries
5. **Sass** - CSS preprocessor

---

## CSS Modules

Automatically scoped CSS files with `.module.css` extension.

### Basic Usage

```css
/* app/components/button.module.css */
.button {
  padding: 0.5rem 1rem;
  background: blue;
  color: white;
  border-radius: 4px;
}

.button:hover {
  background: darkblue;
}

.primary {
  background: blue;
}

.secondary {
  background: gray;
}
```

```typescript
// app/components/button.tsx
import styles from './button.module.css'

export function Button({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  return (
    <button className={`${styles.button} ${styles[variant]}`}>
      Click me
    </button>
  )
}
```

### Composing Classes

```css
/* styles.module.css */
.base {
  padding: 1rem;
  border-radius: 4px;
}

.primary {
  composes: base;
  background: blue;
  color: white;
}

.secondary {
  composes: base;
  background: gray;
  color: white;
}
```

```typescript
import styles from './styles.module.css'

export function Card({ type }: { type: 'primary' | 'secondary' }) {
  return <div className={styles[type]}>Content</div>
}
```

### With clsx for Conditional Classes

```typescript
import styles from './button.module.css'
import clsx from 'clsx'

export function Button({ 
  variant,
  disabled 
}: { 
  variant: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button
      className={clsx(
        styles.button,
        styles[variant],
        disabled && styles.disabled
      )}
    >
      Click me
    </button>
  )
}
```

---

## Tailwind CSS

Utility-first CSS framework, officially supported by Next.js.

### Installation

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Configuration

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```typescript
// app/layout.tsx
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

### Basic Usage

```typescript
// app/page.tsx
export default function Page() {
  return (
    <div className="container mx-auto px-4">
      <h1 className="text-4xl font-bold text-gray-900">
        Hello World
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        Welcome to Next.js
      </p>
      <button className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
        Click me
      </button>
    </div>
  )
}
```

### With Conditional Classes

```typescript
import clsx from 'clsx'

export function Button({ 
  variant,
  disabled 
}: { 
  variant: 'primary' | 'secondary'
  disabled?: boolean
}) {
  return (
    <button
      className={clsx(
        'px-4 py-2 rounded font-medium',
        variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
        variant === 'secondary' && 'bg-gray-500 text-white hover:bg-gray-600',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      disabled={disabled}
    >
      Click me
    </button>
  )
}
```

### Custom Theme

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
}
```

```typescript
export function Page() {
  return (
    <div className="bg-primary-50">
      <h1 className="text-primary-900 font-sans">
        Custom Theme
      </h1>
    </div>
  )
}
```

---

## Global Styles

Global CSS applied to all pages.

### Setup

```css
/* app/globals.css */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: #333;
}

a {
  color: blue;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

```typescript
// app/layout.tsx
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

### CSS Variables

```css
/* app/globals.css */
:root {
  --color-primary: #3b82f6;
  --color-secondary: #64748b;
  --spacing-unit: 0.25rem;
}

body {
  color: var(--color-primary);
  padding: calc(var(--spacing-unit) * 4);
}
```

```typescript
export function Page() {
  return (
    <div style={{ 
      color: 'var(--color-primary)',
      padding: 'calc(var(--spacing-unit) * 4)'
    }}>
      Using CSS Variables
    </div>
  )
}
```

---

## CSS-in-JS

### styled-jsx (Built-in)

```typescript
export default function Page() {
  return (
    <div>
      <h1>Hello</h1>
      <style jsx>{`
        h1 {
          color: blue;
          font-size: 2rem;
        }
      `}</style>
    </div>
  )
}
```

### styled-jsx (Global)

```typescript
export default function Page() {
  return (
    <div>
      <h1>Hello</h1>
      <style jsx global>{`
        body {
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  )
}
```

### Styled Components

```bash
npm install styled-components
```

```typescript
// lib/registry.tsx
'use client'

import { useServerInsertedHTML } from 'next/navigation'
import { ServerStyleSheet, StyleSheetManager } from 'styled-components'
import { useState } from 'react'

export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode
}) {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet())

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement()
    styledComponentsStyleSheet.instance.clearTag()
    return <>{styles}</>
  })

  if (typeof window !== 'undefined') return <>{children}</>

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  )
}
```

```typescript
// app/layout.tsx
import StyledComponentsRegistry from '@/lib/registry'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <StyledComponentsRegistry>
          {children}
        </StyledComponentsRegistry>
      </body>
    </html>
  )
}
```

```typescript
// components/button.tsx
'use client'

import styled from 'styled-components'

const StyledButton = styled.button`
  padding: 0.5rem 1rem;
  background: blue;
  color: white;
  border: none;
  border-radius: 4px;
  
  &:hover {
    background: darkblue;
  }
`

export function Button() {
  return <StyledButton>Click me</StyledButton>
}
```

### Emotion

```bash
npm install @emotion/react @emotion/styled
```

```typescript
// app/emotion.tsx
'use client'

import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import { useServerInsertedHTML } from 'next/navigation'
import { useState } from 'react'

export default function EmotionRegistry({ children }) {
  const [cache] = useState(() => {
    const cache = createCache({ key: 'css' })
    cache.compat = true
    return cache
  })

  useServerInsertedHTML(() => {
    return (
      <style
        data-emotion={`${cache.key} ${Object.keys(cache.inserted).join(' ')}`}
        dangerouslySetInnerHTML={{
          __html: Object.values(cache.inserted).join(' '),
        }}
      />
    )
  })

  return <CacheProvider value={cache}>{children}</CacheProvider>
}
```

```typescript
// components/button.tsx
'use client'

import styled from '@emotion/styled'

const Button = styled.button`
  padding: 0.5rem 1rem;
  background: blue;
  color: white;
  border-radius: 4px;
`

export default Button
```

---

## Sass

CSS preprocessor with variables, nesting, and mixins.

### Installation

```bash
npm install -D sass
```

### Basic Usage

```scss
/* app/components/button.module.scss */
$primary-color: blue;
$secondary-color: gray;

.button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  
  &.primary {
    background: $primary-color;
    color: white;
    
    &:hover {
      background: darken($primary-color, 10%);
    }
  }
  
  &.secondary {
    background: $secondary-color;
    color: white;
    
    &:hover {
      background: darken($secondary-color, 10%);
    }
  }
}
```

```typescript
import styles from './button.module.scss'

export function Button({ variant }: { variant: 'primary' | 'secondary' }) {
  return (
    <button className={`${styles.button} ${styles[variant]}`}>
      Click me
    </button>
  )
}
```

### With Mixins

```scss
/* app/styles/mixins.scss */
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin button-base {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

```scss
/* app/components/card.module.scss */
@use '../styles/mixins' as *;

.card {
  @include flex-center;
  padding: 2rem;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.button {
  @include button-base;
  background: blue;
  color: white;
}
```

---

## Common Patterns

### Pattern 1: Responsive Design with Tailwind

```typescript
export default function Page() {
  return (
    <div className="container mx-auto px-4">
      {/* Mobile: stack, Desktop: grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card />
        <Card />
        <Card />
      </div>
    </div>
  )
}

function Card() {
  return (
    <div className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
      <h2 className="text-xl font-bold mb-2">Card Title</h2>
      <p className="text-gray-600">Card content</p>
    </div>
  )
}
```

### Pattern 2: Dark Mode with CSS Variables

```css
/* app/globals.css */
:root {
  --bg-primary: #ffffff;
  --text-primary: #000000;
}

[data-theme='dark'] {
  --bg-primary: #000000;
  --text-primary: #ffffff;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}
```

```typescript
'use client'

import { useState } from 'react'

export default function Page() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  
  return (
    <div data-theme={theme}>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle Theme
      </button>
    </div>
  )
}
```

### Pattern 3: Component Variants with CSS Modules

```css
/* button.module.css */
.button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.primary {
  background: blue;
  color: white;
}

.secondary {
  background: gray;
  color: white;
}

.outline {
  background: transparent;
  border: 2px solid blue;
  color: blue;
}

.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.large {
  padding: 0.75rem 1.5rem;
  font-size: 1.125rem;
}
```

```typescript
import styles from './button.module.css'
import clsx from 'clsx'

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'small' | 'large'
  children: React.ReactNode
}

export function Button({ 
  variant = 'primary', 
  size,
  children 
}: ButtonProps) {
  return (
    <button
      className={clsx(
        styles.button,
        styles[variant],
        size && styles[size]
      )}
    >
      {children}
    </button>
  )
}
```

### Pattern 4: Animation with Tailwind

```typescript
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
    </div>
  )
}

export function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fadeIn">
      {children}
    </div>
  )
}
```

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        fadeIn: 'fadeIn 0.5s ease-in',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
}
```

### Pattern 5: Layout Components

```typescript
// components/container.tsx
export function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 max-w-7xl">
      {children}
    </div>
  )
}

// components/grid.tsx
export function Grid({ 
  cols = 3,
  children 
}: { 
  cols?: number
  children: React.ReactNode 
}) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${cols} gap-6`}>
      {children}
    </div>
  )
}

// app/page.tsx
export default function Page() {
  return (
    <Container>
      <Grid cols={3}>
        <Card />
        <Card />
        <Card />
      </Grid>
    </Container>
  )
}
```

---

## Best Practices

### 1. Use CSS Modules for Component Styles

```typescript
// ✅ GOOD - Scoped styles
import styles from './button.module.css'

export function Button() {
  return <button className={styles.button}>Click</button>
}

// ❌ BAD - Global styles conflict
export function Button() {
  return <button className="button">Click</button>
}
```

### 2. Organize Tailwind Classes Logically

```typescript
// ✅ GOOD - Grouped by type
<div className={clsx(
  // Layout
  'flex items-center justify-between',
  // Spacing
  'p-4 gap-4',
  // Visual
  'bg-white rounded-lg shadow-md',
  // Typography
  'text-lg font-medium'
)}>

// ❌ BAD - Random order
<div className="text-lg bg-white flex p-4 font-medium items-center">
```

### 3. Extract Reusable Components

```typescript
// ✅ GOOD - Reusable component
function Button({ children, variant = 'primary' }) {
  return (
    <button className={clsx(
      'px-4 py-2 rounded',
      variant === 'primary' && 'bg-blue-500 text-white'
    )}>
      {children}
    </button>
  )
}

// ❌ BAD - Duplicated styles
<button className="px-4 py-2 rounded bg-blue-500 text-white">A</button>
<button className="px-4 py-2 rounded bg-blue-500 text-white">B</button>
```

### 4. Use CSS Variables for Theming

```css
/* ✅ GOOD - Easy to theme */
:root {
  --color-primary: blue;
}

.button {
  background: var(--color-primary);
}

/* ❌ BAD - Hard to change */
.button {
  background: #3b82f6;
}
```

---

## Quick Reference

### Importing Styles

```typescript
// CSS Module
import styles from './component.module.css'

// Global CSS (only in layout.tsx)
import './globals.css'

// Sass Module
import styles from './component.module.scss'
```

### Tailwind Common Classes

```typescript
// Layout
'flex flex-col items-center justify-center'
'grid grid-cols-3 gap-4'

// Spacing
'p-4 px-6 py-2 m-4 mx-auto'

// Typography
'text-lg font-bold text-gray-900'

// Colors
'bg-blue-500 text-white'

// Borders
'border border-gray-300 rounded-lg'

// Effects
'shadow-md hover:shadow-lg transition-shadow'
```

---

**Related Documentation:**
- [Font Optimization](16-font-optimization.md)
- [Image Optimization](15-image-optimization.md)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)