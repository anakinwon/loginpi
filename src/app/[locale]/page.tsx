'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { PiUserCard } from '@/components/pi-user-card'
import { GoogleUserCard } from '@/components/google-user-card'
import { AccountLinkCard } from '@/components/account-link-card'
import { PiProductCard } from '@/components/pi-product-card'
import { PiPayButton } from '@/components/pi-pay-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { usePiAuth } from '@/components/pi-auth-provider'

const STACK_ITEMS = [
  {
    title: 'Next.js 15',
    desc: 'App Router, React 19, Turbopack',
    badge: 'v15',
  },
  {
    title: 'Tailwind CSS v4',
    desc: 'CSS-first 설정, @theme 디렉티브',
    badge: 'v4',
  },
  {
    title: 'shadcn/ui',
    desc: 'base-nova 스타일, Radix UI 기반',
    badge: 'latest',
  },
  {
    title: 'TypeScript',
    desc: 'strict 모드, 타입 안전성',
    badge: 'v5',
  },
  {
    title: 'next-themes',
    desc: '다크모드 / 시스템 테마 자동 연동',
    badge: 'included',
  },
  {
    title: 't3-env + Zod',
    desc: '빌드 시점 환경변수 타입 검증',
    badge: 'included',
  },
]

export default function HomePage() {
  const [inputValue, setInputValue] = useState('')
  const { user: piUser, isLoading: piLoading, isInPiBrowser } = usePiAuth()
  // 로딩 완료 후 Pi Browser 또는 Pi 로그인 상태일 때만 Pi 섹션 표시
  const showPiSection = isInPiBrowser || !!piUser

  return (
    <div className='mx-auto max-w-5xl px-4 py-12'>
      <section className='mb-12 text-center'>
        <h1 className='mb-3 text-4xl font-bold tracking-tight'>
          Next.js Starter Kit
        </h1>
        <p className='text-muted-foreground text-lg'>
          빠르게 시작하는 Next.js 15 + Tailwind CSS v4 + shadcn/ui
          보일러플레이트
        </p>
      </section>

      {/* 로그인 */}
      <section className='mb-12'>
        <h2 className='mb-4 text-2xl font-semibold'>로그인</h2>

        {/* Pi Browser 여부 판단 중 (authenticate() 시도 중) */}
        {piLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground py-6'>
            <div className='h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent' />
            환경 감지 중…
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {/* Pi Browser: Pi Network 카드 */}
            {showPiSection && (
              <div>
                <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                  Pi Network
                </p>
                <PiUserCard />
              </div>
            )}
            {/* 일반 브라우저: Google 카드 */}
            {!isInPiBrowser && (
              <div>
                <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                  Google
                </p>
                <GoogleUserCard />
              </div>
            )}
            <div>
              <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                계정 연동
              </p>
              <AccountLinkCard />
            </div>
          </div>
        )}
      </section>

      {/* Pi 결제 버튼 — Pi Browser 또는 Pi 로그인 상태에서만 표시 */}
      {showPiSection && (
        <section className='mb-12'>
          <h2 className='mb-4 text-2xl font-semibold'>Pi 코인 결제</h2>
          <div className='grid gap-6 sm:grid-cols-2'>
            <div className='rounded-xl border p-6'>
              <PiPayButton />
            </div>
            <PiProductCard />
          </div>
        </section>
      )}

      {/* 기술 스택 카드 */}
      <section className='mb-12'>
        <h2 className='mb-6 text-2xl font-semibold'>포함된 기술 스택</h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {STACK_ITEMS.map((item) => (
            <Card key={item.title}>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-base'>{item.title}</CardTitle>
                  <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'>
                    {item.badge}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground text-sm'>{item.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 컴포넌트 쇼케이스 */}
      <section className='mb-12'>
        <h2 className='mb-6 text-2xl font-semibold'>shadcn/ui 컴포넌트 예시</h2>

        {/* Button variants */}
        <div className='mb-6'>
          <h3 className='mb-3 font-medium'>Button</h3>
          <div className='flex flex-wrap gap-3'>
            <Button>기본</Button>
            <Button variant='secondary'>Secondary</Button>
            <Button variant='outline'>Outline</Button>
            <Button variant='ghost'>Ghost</Button>
            <Button variant='destructive'>Destructive</Button>
          </div>
        </div>

        {/* Input + Label */}
        <div className='mb-6'>
          <h3 className='mb-3 font-medium'>Input + Label</h3>
          <div className='max-w-sm space-y-2'>
            <Label htmlFor='demo-input'>이메일</Label>
            <Input
              id='demo-input'
              type='email'
              placeholder='hello@example.com'
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>
        </div>

        {/* Dialog + Sonner */}
        <div>
          <h3 className='mb-3 font-medium'>Dialog & Toast (Sonner)</h3>
          <div className='flex flex-wrap gap-3'>
            <Dialog>
              <DialogTrigger
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                다이얼로그 열기
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>스타터킷에 오신 걸 환영합니다!</DialogTitle>
                  <DialogDescription>
                    shadcn/ui의 Dialog 컴포넌트입니다. @base-ui/react 기반으로
                    접근성을 완벽히 지원합니다.
                  </DialogDescription>
                </DialogHeader>
                <Button
                  onClick={() => toast.success('다이얼로그에서 토스트!')}
                  className='mt-2'
                >
                  토스트 띄우기
                </Button>
              </DialogContent>
            </Dialog>

            <Button
              variant='outline'
              onClick={() =>
                toast.success('Sonner 토스트!', {
                  description: 'richColors 옵션이 활성화되어 있습니다.',
                })
              }
            >
              Success Toast
            </Button>
            <Button
              variant='outline'
              onClick={() => toast.error('에러 토스트 예시')}
            >
              Error Toast
            </Button>
          </div>
        </div>
      </section>

      {/* 시작하기 */}
      <section className='bg-muted rounded-xl p-6'>
        <h2 className='mb-4 text-xl font-semibold'>시작하기</h2>
        <ol className='text-muted-foreground space-y-2 text-sm'>
          <li>
            <span className='text-foreground font-medium'>1.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              cp .env.example .env.local
            </code>{' '}
            — 환경변수 파일 생성
          </li>
          <li>
            <span className='text-foreground font-medium'>2.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              pnpm dlx shadcn@latest add [컴포넌트]
            </code>{' '}
            — 필요한 컴포넌트 추가
          </li>
          <li>
            <span className='text-foreground font-medium'>3.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              src/env.ts
            </code>
            에서 환경변수 스키마 정의 후 개발 시작!
          </li>
        </ol>
      </section>
    </div>
  )
}
