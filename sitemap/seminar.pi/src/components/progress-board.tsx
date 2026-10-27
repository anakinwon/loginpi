// 홈 "제작 진행 현황" — 기능별 워크플로(단계 점 + 상태)와 완료·진행·계획 요약. 정적 데이터라 서버 컴포넌트, 조회 없음
import { useTranslations } from 'next-intl'
import {
  FEATURES,
  PROGRESS_UPDATED,
  featureRefs,
  featureStatus,
  type RefModel,
  type StepStatus,
} from '@/data/progress'

const ORDER: StepStatus[] = ['done', 'doing', 'todo']

// 상태별 색 — 완료 녹색 / 진행 하늘 / 계획 회색
const TONE: Record<StepStatus, { dot: string; text: string; ring: string }> = {
  done: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    ring: 'border-emerald-400/40 bg-emerald-400/10',
  },
  doing: {
    dot: 'bg-sky-400 animate-pulse motion-reduce:animate-none',
    text: 'text-sky-300',
    ring: 'border-sky-400/50 bg-sky-400/10',
  },
  todo: {
    dot: 'bg-white/25',
    text: 'text-muted-foreground',
    ring: 'border-white/10 bg-white/[0.03]',
  },
}

// 참조 모델 색 — Galène 녹색 / mediasoup 파랑 / LiveKit 주황 / Jitsi 하늘 / 자체(1호 사이트) 보라
const REF_TONE: Record<RefModel, string> = {
  Galène: 'border-emerald-400/50 text-emerald-300',
  mediasoup: 'border-indigo-400/50 text-indigo-300',
  LiveKit: 'border-orange-400/50 text-orange-300',
  Jitsi: 'border-sky-400/50 text-sky-300',
  'sitemap.pi': 'border-violet-400/50 text-violet-300',
}

function RefTag({ name }: { name: RefModel }) {
  return (
    <span
      className={`rounded border px-1.5 py-px font-mono text-[11px] ${REF_TONE[name]}`}
    >
      {name}
    </span>
  )
}

export function ProgressBoard() {
  const t = useTranslations('progress')
  const withStatus = FEATURES.map((f) => ({ ...f, status: featureStatus(f) }))
  const count = (s: StepStatus) =>
    withStatus.filter((f) => f.status === s).length
  const steps = FEATURES.flatMap((f) => f.steps)
  const doneSteps = steps.filter((s) => s.status === 'done').length
  const pct = Math.round((doneSteps / steps.length) * 100)

  return (
    <section aria-labelledby="progress-title" className="space-y-5">
      <div className="space-y-1">
        <h2 id="progress-title" className="text-xl font-bold">
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('subtitle', { date: PROGRESS_UPDATED })}
        </p>
      </div>

      {/* 요약 — 기능 수(완료·진행·계획) + 전체 단계 진척률 */}
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((s) => (
          <div key={s} className={`rounded-lg border px-3 py-2 ${TONE[s].ring}`}>
            <div className={`text-xs ${TONE[s].text}`}>{t(`status.${s}`)}</div>
            <div className="text-2xl font-bold tabular-nums">
              {count(s)}
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                {t('featureUnit')}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{t('overall')}</span>
          <span className="tabular-nums">
            {t('stepsDone', { done: doneSteps, total: steps.length, pct })}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('overall')}
        >
          <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 기능별 워크플로 — 진행 → 완료 → 계획 순, 단계는 왼쪽부터 순서대로 */}
      <ol className="space-y-3">
        {[...withStatus]
          .sort(
            (a, b) =>
              ['doing', 'done', 'todo'].indexOf(a.status) -
              ['doing', 'done', 'todo'].indexOf(b.status),
          )
          .map((f) => {
            const done = f.steps.filter((s) => s.status === 'done').length
            const refs = featureRefs(f)
            return (
              <li
                key={f.id}
                className={`space-y-3 rounded-xl border p-4 ${TONE[f.status].ring}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      {f.id.replace('F', 'F-')}
                    </span>
                    <h3 className="font-bold">{t(`features.${f.id}.name`)}</h3>
                    <span className="text-muted-foreground text-xs">
                      {f.prio}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold ${TONE[f.status].text}`}>
                    {t(`status.${f.status}`)} · {done}/{f.steps.length}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {t(`features.${f.id}.desc`)}
                </p>
                {refs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">{t('refLabel')}</span>
                    {refs.map((r) => (
                      <RefTag key={r} name={r} />
                    ))}
                  </div>
                )}
                <ol className="flex flex-wrap gap-2">
                  {f.steps.map((s, i) => (
                    <li
                      key={s.id}
                      className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${TONE[s.status].ring}`}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${TONE[s.status].dot}`}
                        aria-hidden
                      />
                      <span className="text-muted-foreground font-mono text-xs">
                        {s.stage ?? i + 1}
                      </span>
                      <span>{t(`steps.${s.id}`)}</span>
                      <span className="sr-only">{t(`status.${s.status}`)}</span>
                      {s.ref?.map((r) => (
                        <RefTag key={r} name={r} />
                      ))}
                      {s.note && (
                        <span className="text-muted-foreground text-xs">
                          {s.note}
                        </span>
                      )}
                      {s.date && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {s.date.slice(5)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            )
          })}
      </ol>
    </section>
  )
}
