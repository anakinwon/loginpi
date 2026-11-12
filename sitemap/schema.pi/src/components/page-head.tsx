// 화면 머리 공용 — 뒤로(분류체계 목록) · 제목 1줄 · 접힌 도움말(InfoTip) · 오른쪽 동작. 훅 없음 → 서버·클라이언트 공용
//  사용 : <PageHead title='표준단어' info='규칙 문장' actions={<button className='btn-3d'>등록</button>} /> — dense = SQL·ERD 한 줄(40), back={false} = 대시보드
import { ChevronLeft, Info } from 'lucide-react'
import { Link } from '@/i18n/navigation'

export function InfoTip({ label = '도움말', align = 'start', children }: { label?: string; align?: 'start' | 'end'; children: React.ReactNode }) {
  return (
    <details className='info-tip'>
      <summary aria-label={label} title={label} className='btn-ghost btn-icon btn-sm'>
        <Info aria-hidden />
      </summary>
      <div className='info-pop' data-align={align}>
        {children}
      </div>
    </details>
  )
}

export function PageHead({ title, sub, info, actions, back = true, dense = false }: { title: React.ReactNode; sub?: React.ReactNode; info?: React.ReactNode; actions?: React.ReactNode; back?: boolean; dense?: boolean }) {
  if (dense)
    return (
      <header className='flex h-10 items-center gap-2'>
        {back && (
          <Link href='/' aria-label='분류체계 목록' title='분류체계 목록' className='btn-ghost btn-icon btn-sm'>
            <ChevronLeft className='rtl:rotate-180' aria-hidden />
          </Link>
        )}
        <h1 className='truncate text-sm font-semibold text-ink'>{title}</h1>
        {info && <InfoTip>{info}</InfoTip>}
        {actions && <div className='ms-auto flex items-center gap-2'>{actions}</div>}
      </header>
    )
  return (
    <header className='mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2'>
      <div className='min-w-0'>
        {back && (
          <Link href='/' className='inline-flex items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink'>
            <ChevronLeft className='h-3.5 w-3.5 rtl:rotate-180' aria-hidden />
            분류체계 목록
          </Link>
        )}
        <div className='mt-1 flex items-center gap-1'>
          <h1 className='truncate text-xl font-semibold text-ink'>{title}</h1>
          {info && <InfoTip>{info}</InfoTip>}
        </div>
        {sub && <p className='mt-1 truncate text-dense text-ink-3'>{sub}</p>}
      </div>
      {actions && <div className='flex flex-wrap items-center gap-2'>{actions}</div>}
    </header>
  )
}
