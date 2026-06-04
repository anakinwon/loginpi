# Font Optimization Reference

**Doc Version:** 16.1.1  
**Last Updated:** January 2025  
**Source:** Next.js 16 Font Optimization Documentation

---

## Contents

- [Overview](#overview)
- [Google Fonts](#google-fonts)
- [Local Fonts](#local-fonts)
- [Variable Fonts](#variable-fonts)
- [Font Display](#font-display)
- [Common Patterns](#common-patterns)

---

## Overview

Next.js provides automatic font optimization through `next/font`:

- **Self-hosting** - Fonts hosted with your app (no external requests)
- **Zero layout shift** - Automatic font-swap optimization
- **Privacy-friendly** - No requests to Google servers
- **Performance** - CSS and font preloaded automatically

---

## Google Fonts

### Basic Usage

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

### With Custom CSS Variable

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
body {
  font-family: var(--font-inter), sans-serif;
}
```

### Multiple Fonts

```typescript
// app/layout.tsx
import { Inter, Roboto_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
body {
  font-family: var(--font-inter), sans-serif;
}

code {
  font-family: var(--font-roboto-mono), monospace;
}
```

### Font Weights

```typescript
import { Inter } from 'next/font/google'

// Single weight
const inter = Inter({
  subsets: ['latin'],
  weight: '400',
})

// Multiple weights
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
})

// Variable font (all weights)
const inter = Inter({
  subsets: ['latin'],
  // No weight needed for variable fonts
})
```

### Preload

```typescript
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  preload: true,  // Default is true
})

// Disable preload (not recommended)
const inter = Inter({
  subsets: ['latin'],
  preload: false,
})
```

---

## Local Fonts

### Basic Usage

```typescript
// app/layout.tsx
import localFont from 'next/font/local'

const myFont = localFont({
  src: './fonts/my-font.woff2',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={myFont.className}>
      <body>{children}</body>
    </html>
  )
}
```

### Multiple Files (Weights)

```typescript
import localFont from 'next/font/local'

const myFont = localFont({
  src: [
    {
      path: './fonts/my-font-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/my-font-bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: './fonts/my-font-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-my-font',
})
```

### From Public Folder

```
public/
└── fonts/
    ├── custom-font.woff2
    └── custom-font-bold.woff2
```

```typescript
import localFont from 'next/font/local'

const customFont = localFont({
  src: [
    {
      path: '../public/fonts/custom-font.woff2',
      weight: '400',
    },
    {
      path: '../public/fonts/custom-font-bold.woff2',
      weight: '700',
    },
  ],
})
```

---

## Variable Fonts

### Google Variable Font

```typescript
import { Inter } from 'next/font/google'

// Inter is a variable font (supports all weights)
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})
```

### Local Variable Font

```typescript
import localFont from 'next/font/local'

const myVariableFont = localFont({
  src: './fonts/my-variable-font.woff2',
  variable: '--font-variable',
})
```

### Using Variable Font Weights

```css
/* Any weight between 100-900 */
.light {
  font-weight: 300;
}

.regular {
  font-weight: 400;
}

.medium {
  font-weight: 500;
}

.bold {
  font-weight: 700;
}

.custom {
  font-weight: 650;  /* Variable fonts support any value */
}
```

---

## Font Display

### Font Display Strategies

```typescript
import { Inter } from 'next/font/google'

// Default: 'swap' (recommended)
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

// Other options
const inter = Inter({
  subsets: ['latin'],
  display: 'optional',   // Fallback if font takes too long
  display: 'auto',       // Browser decides
  display: 'block',      // Wait for font (not recommended)
  display: 'fallback',   // Brief blocking, then swap
})
```

### Fallback Fonts

```typescript
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  fallback: ['system-ui', 'arial'],
})
```

---

## Common Patterns

### Pattern 1: Sans + Mono Font

```typescript
// app/layout.tsx
import { Inter, Fira_Code } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${firaCode.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-family: var(--font-sans), sans-serif;
  }
  
  code {
    font-family: var(--font-mono), monospace;
  }
}
```

### Pattern 2: Display + Body Font

```typescript
// app/layout.tsx
import { Playfair_Display, Inter } from 'next/font/google'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
body {
  font-family: var(--font-body), sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display), serif;
}
```

### Pattern 3: Component-Specific Font

```typescript
// components/hero.tsx
import { Bebas_Neue } from 'next/font/google'

const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
})

export function Hero() {
  return (
    <section>
      <h1 className={bebasNeue.className}>
        BOLD HEADLINE
      </h1>
    </section>
  )
}
```

### Pattern 4: Multilingual Support

```typescript
import { Noto_Sans, Noto_Sans_KR, Noto_Sans_JP } from 'next/font/google'

const notoSans = Noto_Sans({
  subsets: ['latin'],
  variable: '--font-latin',
})

const notoSansKR = Noto_Sans_KR({
  subsets: ['korean'],
  variable: '--font-korean',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['japanese'],
  variable: '--font-japanese',
})

export default function RootLayout({ children }) {
  return (
    <html 
      lang="en" 
      className={`${notoSans.variable} ${notoSansKR.variable} ${notoSansJP.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
body {
  font-family: var(--font-latin), var(--font-korean), var(--font-japanese), sans-serif;
}
```

### Pattern 5: Brand Custom Font

```typescript
// app/layout.tsx
import localFont from 'next/font/local'
import { Inter } from 'next/font/google'

// Brand font for headings
const brandFont = localFont({
  src: './fonts/brand-font.woff2',
  variable: '--font-brand',
})

// Standard font for body
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${brandFont.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

```css
/* app/globals.css */
body {
  font-family: var(--font-body), sans-serif;
}

.brand {
  font-family: var(--font-brand), sans-serif;
}
```

### Pattern 6: Tailwind Integration

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
      },
    },
  },
}
```

```typescript
// Usage in components
export function Page() {
  return (
    <div className="font-sans">
      <h1>Uses Inter font</h1>
    </div>
  )
}
```

---

## Best Practices

### 1. Use Variable Fonts When Available

```typescript
// ✅ GOOD - Variable font (all weights)
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

// ❌ BAD - Loading multiple font files
import { Roboto } from 'next/font/google'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
})
```

### 2. Load Only Required Subsets

```typescript
// ✅ GOOD - Only Latin subset
const inter = Inter({
  subsets: ['latin'],
})

// ❌ BAD - All subsets (larger bundle)
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic', 'greek'],
})
```

### 3. Use CSS Variables for Flexibility

```typescript
// ✅ GOOD - Flexible with CSS variables
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// ❌ BAD - Direct className only
const inter = Inter({
  subsets: ['latin'],
})
```

### 4. Preload Critical Fonts

```typescript
// ✅ GOOD - Preload default (true)
const inter = Inter({
  subsets: ['latin'],
  preload: true,
})

// ❌ BAD - Disabling preload
const inter = Inter({
  subsets: ['latin'],
  preload: false,
})
```

### 5. Use display: 'swap' (Default)

```typescript
// ✅ GOOD - Swap (default, no need to specify)
const inter = Inter({
  subsets: ['latin'],
})

// ❌ BAD - Block display
const inter = Inter({
  subsets: ['latin'],
  display: 'block',
})
```

---

## Available Google Fonts

Popular variable fonts:

- **Inter** - Modern sans-serif
- **Roboto** - Google's sans-serif
- **Open_Sans** - Friendly sans-serif
- **Lato** - Rounded sans-serif
- **Montserrat** - Geometric sans-serif
- **Poppins** - Geometric sans-serif
- **Source_Sans_3** - Clean sans-serif
- **Fira_Code** - Monospace for code
- **JetBrains_Mono** - Monospace for code
- **Playfair_Display** - Elegant serif
- **Merriweather** - Readable serif

Full list: https://fonts.google.com/variablefonts

---

## Configuration

### Adjusting Font Subsets

```typescript
const inter = Inter({
  subsets: ['latin'],          // Basic Latin
  subsets: ['latin', 'latin-ext'],  // Extended Latin
  subsets: ['cyrillic'],       // Cyrillic
  subsets: ['greek'],          // Greek
})
```

### Custom Font Display

```typescript
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',      // Show fallback immediately (default)
  display: 'optional',  // Use fallback if font loads slowly
  display: 'fallback',  // Brief blocking, then swap
  display: 'block',     // Wait for font (not recommended)
  display: 'auto',      // Browser decides
})
```

### Axes for Variable Fonts

```typescript
const inter = Inter({
  subsets: ['latin'],
  axes: ['wght'],  // Weight axis only
  // Default includes all available axes
})
```

---

## Quick Reference

### Google Font

```typescript
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// In layout
<html className={inter.variable}>
```

### Local Font

```typescript
import localFont from 'next/font/local'

const myFont = localFont({
  src: './fonts/font.woff2',
  variable: '--font-my-font',
})

// In layout
<html className={myFont.variable}>
```

### Multiple Fonts

```typescript
const font1 = Font1({ variable: '--font-1' })
const font2 = Font2({ variable: '--font-2' })

<html className={`${font1.variable} ${font2.variable}`}>
```

---

**Related Documentation:**
- [CSS Styling](14-css.md)
- [Image Optimization](15-image-optimization.md)
- [Google Fonts](https://fonts.google.com)