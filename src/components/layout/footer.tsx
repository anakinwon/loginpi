import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

const FOOTER_GROUPS = [
  {
    titleKey: 'dashboard',
    items: [
      { href: '/admin',                labelKey: 'dashboard'    },
      { href: '/admin/board',          labelKey: 'board'        },
      { href: '/admin/std/audit',      labelKey: 'stdAudit'     },
      { href: '/admin/std/approvals',  labelKey: 'stdApprovals' },
    ],
  },
  {
    titleKey: 'users',
    items: [
      { href: '/admin/users',    labelKey: 'users'    },
      { href: '/admin/links',    labelKey: 'links'    },
      { href: '/admin/payments', labelKey: 'payments' },
    ],
  },
  {
    titleKey: 'stdSection',
    items: [
      { href: '/admin/std/words',   labelKey: 'stdWords'   },
      { href: '/admin/std/domains', labelKey: 'stdDomains' },
      { href: '/admin/std/terms',   labelKey: 'stdTerms'   },
    ],
  },
  {
    titleKey: 'i18nSection',
    items: [
      { href: '/admin/i18n',    labelKey: 'i18n'    },
      { href: '/admin/std/ddl', labelKey: 'stdDdl'  },
    ],
  },
] as const

export async function Footer() {
  const user = await getSessionUser()
  const adminUser = isAdmin(user)
  const t = await getTranslations('admin.nav')

  return (
    <footer className='border-t'>
      {adminUser && (
        <div className='border-b py-8 md:hidden'>
          <div className='mx-auto max-w-5xl px-4'>
            <div className='grid grid-cols-2 gap-8 md:grid-cols-4'>
              {FOOTER_GROUPS.map((group) => (
                <div key={group.titleKey}>
                  <p className='text-foreground mb-3 text-xs font-semibold tracking-wider uppercase'>
                    {t(group.titleKey)}
                  </p>
                  <ul className='space-y-2'>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className='text-muted-foreground hover:text-foreground text-sm transition-colors'
                        >
                          {t(item.labelKey)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className='py-6'>
        <div className='mx-auto max-w-5xl px-4 text-center'>
          <p className='text-muted-foreground text-sm'>
            © {new Date().getFullYear()} Next.js Starter Kit. Built with Next.js
            15, Tailwind CSS v4, shadcn/ui.
          </p>
        </div>
      </div>
    </footer>
  )
}
