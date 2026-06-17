import { getTranslations } from 'next-intl/server'
import { BatchRunner } from '@/components/admin/batch-runner'
import { BatchLogTable } from '@/components/admin/batch-log-table'

export async function generateMetadata() {
  const t = await getTranslations('admin.batch')
  return { title: `${t('title')} — Admin` }
}

// 자동 작업 스케줄표 — 직접 실행하지 않아도 이력이 기록되는 작업을 명시해 오해 방지
function ScheduleTable({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>
}) {
  const rows = [
    {
      job: 'stats_aggregate',
      trigger: t('triggerCron'),
      when: t('schedCronWhen'),
      desc: t('schedCronDesc'),
    },
    {
      job: 'stats_aggregate',
      trigger: t('triggerOndemand'),
      when: t('schedOndemandWhen'),
      desc: t('schedOndemandDesc'),
    },
    {
      job: 'stats_aggregate',
      trigger: `${t('triggerManual')} / ${t('triggerBackfill')}`,
      when: t('schedManualWhen'),
      desc: t('schedManualDesc'),
    },
    {
      job: 'order_autocomplete',
      trigger: t('triggerCron'),
      when: t('schedOrderCronWhen'),
      desc: t('schedOrderCronDesc'),
    },
    {
      job: 'order_autocomplete',
      trigger: t('triggerBackfill'),
      when: t('schedOrderBackfillWhen'),
      desc: t('schedOrderBackfillDesc'),
    },
  ]

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <p className="text-sm font-semibold">{t('scheduleTitle')}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {t('scheduleDesc')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">{t('schedColJob')}</th>
              <th className="py-2 pr-3 font-medium">{t('schedColTrigger')}</th>
              <th className="py-2 pr-3 font-medium">{t('schedColWhen')}</th>
              <th className="py-2 font-medium">{t('schedColDesc')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.job}-${r.trigger}`}
                className="border-b last:border-0"
              >
                <td className="py-2 pr-3 whitespace-nowrap">{r.job}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{r.trigger}</td>
                <td className="py-2 pr-3">{r.when}</td>
                <td className="text-muted-foreground py-2 text-xs">{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function BatchPage() {
  const t = await getTranslations('admin.batch')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('desc')}</p>
      </div>
      <ScheduleTable t={t} />
      <BatchRunner />
      <BatchLogTable />
    </div>
  )
}
