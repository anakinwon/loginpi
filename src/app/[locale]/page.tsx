'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  { title: 'Next.js 16',     badge: 'v15',      descKey: 'stack.nextjsDesc'  },
  { title: 'Tailwind CSS v4', badge: 'v4',      descKey: 'stack.tailwindDesc' },
  { title: 'shadcn/ui',      badge: 'latest',   descKey: 'stack.shadcnDesc'  },
  { title: 'TypeScript',     badge: 'v5',       descKey: 'stack.tsDesc'      },
  { title: 'next-themes',    badge: 'included', descKey: 'stack.themesDesc'  },
  { title: 't3-env + Zod',   badge: 'included', descKey: 'stack.envDesc'     },
] as const

export default function HomePage() {
  const t = useTranslations('home')
  const [inputValue, setInputValue] = useState('')
  const { user: piUser, isLoading: piLoading, isInPiBrowser } = usePiAuth()
  const showPiSection = isInPiBrowser || !!piUser

  return (
    <div className='mx-auto max-w-5xl px-4 py-12'>
      <section className='mb-12 text-center'>
        <h1 className='mb-3 text-4xl font-bold tracking-tight'>{t('title')}</h1>
        <p className='text-muted-foreground text-lg'>{t('subtitle')}</p>
      </section>

      <section className='mb-12'>
        <h2 className='mb-4 text-2xl font-semibold'>{t('loginSection')}</h2>

        {piLoading ? (
          <div className='flex items-center gap-2 text-sm text-muted-foreground py-6'>
            <div className='h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent' />
            {t('detectingEnv')}
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {showPiSection && (
              <div>
                <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                  {t('piNetwork')}
                </p>
                <PiUserCard />
              </div>
            )}
            {!isInPiBrowser && (
              <div>
                <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                  {t('google')}
                </p>
                <GoogleUserCard />
              </div>
            )}
            <div>
              <p className='text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider'>
                {t('accountLink')}
              </p>
              <AccountLinkCard />
            </div>
          </div>
        )}
      </section>

      {showPiSection && (
        <section className='mb-12'>
          <h2 className='mb-4 text-2xl font-semibold'>{t('piPayment')}</h2>
          <div className='grid gap-6 sm:grid-cols-2'>
            <div className='rounded-xl border p-6'>
              <PiPayButton />
            </div>
            <PiProductCard />
          </div>
        </section>
      )}

      <section className='mb-12'>
        <h2 className='mb-6 text-2xl font-semibold'>{t('techStack')}</h2>
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
                <p className='text-muted-foreground text-sm'>{t(item.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className='mb-12'>
        <h2 className='mb-6 text-2xl font-semibold'>{t('components')}</h2>

        <div className='mb-6'>
          <h3 className='mb-3 font-medium'>{t('button')}</h3>
          <div className='flex flex-wrap gap-3'>
            <Button>{t('buttonDefault')}</Button>
            <Button variant='secondary'>Secondary</Button>
            <Button variant='outline'>Outline</Button>
            <Button variant='ghost'>Ghost</Button>
            <Button variant='destructive'>Destructive</Button>
          </div>
        </div>

        <div className='mb-6'>
          <h3 className='mb-3 font-medium'>{t('inputLabel')}</h3>
          <div className='max-w-sm space-y-2'>
            <Label htmlFor='demo-input'>{t('email')}</Label>
            <Input
              id='demo-input'
              type='email'
              placeholder='hello@example.com'
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>
        </div>

        <div>
          <h3 className='mb-3 font-medium'>{t('dialogToast')}</h3>
          <div className='flex flex-wrap gap-3'>
            <Dialog>
              <DialogTrigger className={cn(buttonVariants({ variant: 'outline' }))}>
                {t('openDialog')}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('dialogTitle')}</DialogTitle>
                  <DialogDescription>{t('dialogDesc')}</DialogDescription>
                </DialogHeader>
                <Button
                  onClick={() => toast.success(t('dialogToastMsg'))}
                  className='mt-2'
                >
                  {t('showToast')}
                </Button>
              </DialogContent>
            </Dialog>

            <Button
              variant='outline'
              onClick={() =>
                toast.success(t('successToastMsg'), {
                  description: t('successToastDesc'),
                })
              }
            >
              {t('successToast')}
            </Button>
            <Button
              variant='outline'
              onClick={() => toast.error(t('errorToastMsg'))}
            >
              {t('errorToast')}
            </Button>
          </div>
        </div>
      </section>

      <section className='bg-muted rounded-xl p-6'>
        <h2 className='mb-4 text-xl font-semibold'>{t('gettingStarted')}</h2>
        <ol className='text-muted-foreground space-y-2 text-sm'>
          <li>
            <span className='text-foreground font-medium'>1.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              cp .env.example .env.local
            </code>{' '}
            — {t('step1')}
          </li>
          <li>
            <span className='text-foreground font-medium'>2.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              pnpm dlx shadcn@latest add [컴포넌트]
            </code>{' '}
            — {t('step2')}
          </li>
          <li>
            <span className='text-foreground font-medium'>3.</span>{' '}
            <code className='bg-background rounded px-1.5 py-0.5 font-mono'>
              src/env.ts
            </code>
            {t('step3')}
          </li>
        </ol>
      </section>
    </div>
  )
}
