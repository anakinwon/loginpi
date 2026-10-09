// 홈 — 크립토버블 컨셉 메인 화면(요금제 크기 버블 ↔ 정렬 표). 구 홈의 카테고리 9개는 상단 필터, 최신 목록은 표 보기로 흡수.
// 화면 폭 전체(data-fullbleed → 레이아웃 main 폭 제한 해제), 사이트 공통 어두운 테마(globals.css 토큰)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BubbleHome } from '@/components/bubble-home'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  return (
    <div data-fullbleed className="bg-background text-white">
      <h1 className="sr-only">{t('title')}</h1>
      <p className="sr-only">{t('description')}</p>
      <BubbleHome />
    </div>
  )
}
