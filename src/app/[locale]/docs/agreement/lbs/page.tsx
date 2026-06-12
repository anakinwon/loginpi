import { readFile } from 'fs/promises'
import path from 'path'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const metadata = { title: '위치기반서비스 이용약관' }

// 위치기반서비스 이용약관 전문 — LBS 동의 다이얼로그 "전문 보기" 링크 대상.
// 서버 컴포넌트에서 docs/law 마크다운을 readFile로 읽어 렌더 (클라이언트 번들 영향 없음).
// Vercel 번들 포함은 next.config.ts outputFileTracingIncludes가 보장한다.
export default async function LbsAgreementPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const fileName =
    locale === 'ko'
      ? '위치기반서비스이용약관및위치정보수집이용동의서_kor.md'
      : '위치기반서비스이용약관및위치정보수집이용동의서_eng.md'

  const md = await readFile(
    path.join(process.cwd(), 'docs', 'law', 'agreement', fileName),
    'utf-8',
  )

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
            p: ({ children }) => <p className="text-foreground/90">{children}</p>,
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
