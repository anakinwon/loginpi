// AI 튜닝 권고 엔진(서버 전용) — 마스킹된 SQL·계획 요약·규칙 권고 → Claude 구조화 출력 → parseAiItems 검증.
//  ANTHROPIC_API_KEY 없거나 실패·빈 결과면 null(라우트가 규칙 권고로 대체 — engn_cd RULE). 외부로 보내는 값 = 상수 마스킹본 SQL·계획 노드 요약뿐(A3)
//  타임아웃 30초 = R-P4 예외(BUILD_DEFECTS 2.7 등재 — 사람이 버튼 누르고 기다리는 1회 호출)
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { walk, type PlanNode } from './plan.ts'
import { parseAiItems, TUN_KINDS, TUN_LIMITS, type TunItem } from './tune.ts'

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: `튜닝 권고 1~${TUN_LIMITS.items}개, 효과 큰 순`,
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [...TUN_KINDS],
            description:
              'INDEX 인덱스 / REWRITE SQL 재작성 / STATS 통계·ANALYZE / CONFIG 파라미터',
          },
          title: {
            type: 'string',
            description: '권고 한 줄, 사용자 언어(locale)로 60자 이내',
          },
          reason: {
            type: 'string',
            description:
              '계획의 어느 노드 때문에 왜 효과가 있는지, 사용자 언어(locale)로 200자 이내',
          },
          ddl: {
            type: 'string',
            description:
              'kind=INDEX·STATS 일 때만 CREATE INDEX 또는 ANALYZE 1문장. 인덱스명은 x_<테이블>_NN',
          },
          sql: {
            type: 'string',
            description: 'kind=REWRITE 일 때만 재작성 SQL(상수는 ? 유지)',
          },
        },
        required: ['kind', 'title', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

const TIMEOUT_MS = 30_000
const MAX_NODES_SENT = 60

// 계획 노드를 한 줄씩 요약(비용·행·조건) — 전체 JSON 보다 짧고 상수는 이미 마스킹
function planDigest(plan: PlanNode): string {
  return walk(plan)
    .slice(0, MAX_NODES_SENT)
    .map(([n, p]) => {
      const extra = [
        'Relation Name',
        'Index Name',
        'Join Type',
        'Filter',
        'Index Cond',
        'Hash Cond',
        'Sort Key',
      ]
        .filter((k) => n[k] !== undefined)
        .map((k) => `${k}=${JSON.stringify(n[k])}`)
        .join(' ')
      return `${p} ${n['Node Type']} cost=${n['Total Cost'] ?? '?'} rows=${n['Plan Rows'] ?? '?'} ${extra}`.trim()
    })
    .join('\n')
}

let client: Anthropic | null = null

export async function aiRecommend(
  sql: string,
  plan: PlanNode,
  rules: TunItem[],
  lang: string,
): Promise<TunItem[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 })
  try {
    const res = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system:
        '당신은 PostgreSQL 성능 튜닝 전문가(SQLP)입니다. EXPLAIN 계획 요약과 SQL 을 보고 실제로 비용을 줄일 권고만 냅니다. ' +
        '근거 없는 일반론은 쓰지 않고, 계획 노드 경로(예 0.1)를 reason 에 적습니다. 데이터 삭제·테이블 변경 DDL 은 제안하지 않습니다. ' +
        '상수는 ? 로 가려져 있으니 값을 추측하지 않습니다. ' +
        `title·reason 은 사용자 언어(${lang})로 씁니다. SQL·DDL·식별자는 번역하지 않습니다.`,
      messages: [
        {
          role: 'user',
          content: [
            `SQL(상수 마스킹) :\n${sql.slice(0, 8000)}`,
            `계획 요약(경로 노드 비용 행 조건) :\n${planDigest(plan)}`,
            rules.length
              ? `규칙 점검 결과(참고) : ${rules.map((r) => r.code).join(', ')}`
              : '규칙 점검 결과 : 없음',
          ].join('\n\n'),
        },
      ],
    })
    const text =
      res.stop_reason === 'end_turn'
        ? res.content.find((b) => b.type === 'text')?.text
        : undefined
    if (!text) return null
    const items = parseAiItems(JSON.parse(text))
    return items.length ? items : null
  } catch (e) {
    console.error('[sql-lab] ai', e instanceof Error ? e.name : 'error')
    return null
  }
}
