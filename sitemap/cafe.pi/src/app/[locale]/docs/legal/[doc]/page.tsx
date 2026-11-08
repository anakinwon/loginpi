import { readFile } from 'fs/promises'
import path from 'path'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// 범용 법무 문서 렌더 — 동의 UI "보기" 링크·푸터 등에서 재사용.
// docs/law/* 마크다운을 서버에서 readFile(클라이언트 번들 영향 없음).
// Vercel 번들 포함은 next.config.ts outputFileTracingIncludes 설정 필요(아래 plan 참고).
const DOCS: Record<string, { dir: string; base: string; title: string }> = {
  terms: { dir: 'terms', base: '서비스이용약관', title: '서비스 이용약관' },
  privacy: {
    dir: 'privacy',
    base: '개인정보처리방침',
    title: '개인정보처리방침',
  },
  'privacy-consent': {
    dir: 'agreement',
    base: '개인정보수집이용동의서',
    title: '개인정보 수집·이용 동의',
  },
  refund: {
    dir: 'refund',
    base: '환불및청약철회정책',
    title: '환불 및 청약철회 정책',
  },
  youth: { dir: 'youth', base: '청소년보호정책', title: '청소년 보호정책' },
  community: {
    dir: 'community',
    base: '커뮤니티운영정책',
    title: '커뮤니티 운영정책',
  },
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>
}) {
  const { doc } = await params
  return { title: DOCS[doc]?.title ?? '약관' }
}

async function readDoc(
  dir: string,
  base: string,
  locale: string,
): Promise<string> {
  const root = path.join(process.cwd(), 'docs', 'law', dir)
  const suffix = locale === 'ko' ? 'kor' : 'eng'
  try {
    return await readFile(path.join(root, `${base}_${suffix}.md`), 'utf-8')
  } catch {
    // 영문 미존재 시 한국어 폴백
    return readFile(path.join(root, `${base}_kor.md`), 'utf-8')
  }
}

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>
}) {
  const { locale, doc } = await params
  const meta = DOCS[doc]
  if (!meta) notFound()

  const md = await readDoc(meta.dir, meta.base, locale)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <article className="space-y-4 text-sm leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-8 text-lg font-semibold">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-6 text-base font-semibold">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-foreground/90">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc space-y-1 pl-5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal space-y-1 pl-5">{children}</ol>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-primary/40 text-muted-foreground border-l-4 pl-3">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-6" />,
            table: ({ children }) => (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="bg-muted border px-3 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border px-3 py-2 align-top">{children}</td>
            ),
          }}
        >
          {md}
        </ReactMarkdown>
      </article>
    </div>
  )
}
