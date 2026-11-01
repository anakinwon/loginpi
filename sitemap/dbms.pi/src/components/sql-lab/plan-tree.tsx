'use client'

// 실행계획 트리·경고 목록·카드 클래스·오류 문구 훅(sql-lab 화면 공용) — 노드 종류·대상·비용·행·폭 + 조건식, 경고 노드 강조. 깊이 3 이후는 접어서 시작
import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import type { PlanNode, PlanWarning } from '@/lib/sql-lab/plan'

export const CARD = 'bg-surface rounded-2xl p-4 sm:p-5'

// 연결 오류 코드(LinkError) 우선 번역 → 공용 apiErrors
export function useLabErrorText() {
  const t = useTranslations('sqlLab.errors')
  const apiText = useApiErrorText()
  return useCallback((b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : apiText(b)), [t, apiText])
}

export function Warnings({ warnings }: { warnings: PlanWarning[] }) {
  const t = useTranslations('sqlLab.warn')
  if (!warnings.length) return <p className="text-muted-foreground mb-2 text-xs">{t('none')}</p>
  return (
    <ul className="mb-3 flex flex-col gap-1 text-sm">
      {warnings.map((w) => (
        <li key={`${w.code}:${w.path}`} className="text-danger break-keep">
          ⚠ {t(w.code, { relation: w.relation ?? '-', rows: w.rows, kb: w.kb ?? 0 })}
        </li>
      ))}
    </ul>
  )
}

const DETAIL_KEYS = ['Index Cond', 'Filter', 'Join Filter', 'Hash Cond', 'Merge Cond', 'Recheck Cond', 'Sort Key', 'Group Key']

export function PlanTree({ root, warnings = [] }: { root: PlanNode; warnings?: PlanWarning[] }) {
  const warned = new Set(warnings.map((w) => w.path))
  return (
    <div className="overflow-x-auto text-sm">
      <Node node={root} path="0" warned={warned} />
    </div>
  )
}

function Node({ node, path, warned }: { node: PlanNode; path: string; warned: Set<string> }) {
  const t = useTranslations('sqlLab.plan')
  const depth = path.split('.').length
  const kids = Array.isArray(node.Plans) ? node.Plans : []
  const target = [node['Join Type'], node['Relation Name'], node['Index Name'] && `(${node['Index Name']})`].filter(Boolean).join(' ')
  const details = DETAIL_KEYS.filter((k) => node[k] != null)
  return (
    <details open={depth <= 3} className={depth > 1 ? 'ml-3 border-l border-white/10 pl-3' : ''}>
      <summary className="cursor-pointer py-1">
        <span className={warned.has(path) ? 'text-danger font-semibold' : 'font-semibold'}>
          {warned.has(path) && '⚠ '}
          {node['Node Type']}
        </span>
        {target && <span className="ml-1 break-all">{target}</span>}
        <span className="text-muted-foreground ml-2 font-mono text-xs">
          {t('cost')} {node['Startup Cost'] ?? 0}..{node['Total Cost'] ?? 0} · {t('rows')} {node['Plan Rows'] ?? 0} · {t('width')}{' '}
          {node['Plan Width'] ?? 0}
        </span>
      </summary>
      {details.map((k) => (
        <p key={k} className="text-muted-foreground ml-3 font-mono text-xs break-all">
          {k}: {Array.isArray(node[k]) ? (node[k] as unknown[]).join(', ') : String(node[k])}
        </p>
      ))}
      {kids.map((c, i) => (
        <Node key={i} node={c} path={`${path}.${i}`} warned={warned} />
      ))}
    </details>
  )
}
