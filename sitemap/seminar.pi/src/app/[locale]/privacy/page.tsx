// 개인정보 처리방침(음성·AI 기능) — /privacy. 국외 이전 고지(개인정보 보호법 제28조의8 : 이전받는 자·국가·시기·방법·항목·목적·보유·거부)를 공개 페이지로(계획 M-4·A-6).
// 로그인 불필요(세션을 보지 않음). 문안 = messages privacy.*(ko 원본·en). 문안을 바꾸면 speech-rules PRIVACY_VER 도 올린다(동의 기록 smn_agr.agr_ver_cd).
// 법정 고지라 이전받는 자의 법인·서비스명(Google LLC · Gemini API)을 그대로 적는다 — 'UI 문구 상표 금지'는 기능 화면 문구 규칙, 이 페이지는 예외
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PRIVACY_VER } from '@/lib/speech-rules'

// 미확정 값([확인중 …]·[TBD …])은 빨간색(코드 규칙 — 미확정 값 눈에 띄게)
function Text({ s }: { s: string }) {
  return (
    <>
      {s.split(/(\[(?:확인중|TBD)[^\]]*\])/).map((p, i) =>
        /^\[(?:확인중|TBD)/.test(p) ? (
          <span key={i} className="text-red-600">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  )
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('privacy')
  const who = t.raw('who') as string[]
  const xfer = t.raw('xfer') as { k: string; v: string }[]
  const keep = t.raw('keep') as string[]
  const h2 = 'mt-6 text-lg font-semibold'
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-2 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">
        {t('effective', { date: PRIVACY_VER })}
      </p>
      <p>{t('intro')}</p>

      <h2 className={h2}>{t('whoTitle')}</h2>
      <ul className="list-disc pl-5">
        {who.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <h2 className={h2}>{t('xferTitle')}</h2>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_1fr]">
        {xfer.map((r) => (
          <div key={r.k} className="contents">
            <dt className="font-medium">{r.k}</dt>
            <dd>
              <Text s={r.v} />
            </dd>
          </div>
        ))}
      </dl>

      <h2 className={h2}>{t('keepTitle')}</h2>
      <ul className="list-disc pl-5">
        {keep.map((s) => (
          <li key={s}>
            <Text s={s} />
          </li>
        ))}
      </ul>

      <h2 className={h2}>{t('recTitle')}</h2>
      <p>{t('rec')}</p>

      <h2 className={h2}>{t('rightsTitle')}</h2>
      <p>
        <Text s={t('rights')} />
      </p>
    </article>
  )
}
