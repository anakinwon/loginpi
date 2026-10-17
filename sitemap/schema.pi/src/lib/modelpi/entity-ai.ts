// 논리 엔터티 AI 추천 — 업종·주제영역·등록된 엔터티 → 더할 엔터티명·유형·간단 설명 후보(이름 검증은 logical-ent.ts 가 표준단어로). 반자동 : 저장하지 않음
// 엔진 : ANTHROPIC_API_KEY 있으면 Claude(구조화 출력 JSON), 없거나 실패하면 빈 목록(라우트가 업종 템플릿·규칙 후보로 채움). 외부로 보내는 값 = 업종·주제영역·엔터티명·설명·분류어뿐
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { ENT_CLSS, type IndstryTmpl } from './template'
import type { LgCand } from './logical-ent'

const SCHEMA = {
  type: 'object',
  properties: {
    ents: {
      type: 'array',
      description: '추가할 논리 엔터티 후보 6~8개',
      items: {
        type: 'object',
        properties: {
          nm: { type: 'string', description: '엔터티명 한국어, 띄어쓰기 없이 표준단어 결합 + 엔터티 분류어로 끝남(예 : 주문배송이력), 12자 이내' },
          tp: { type: 'string', enum: ['BASE', 'ACT', 'AGG'], description: 'BASE 실체·기준 / ACT 행위 / AGG 집계(이름이 집계로 끝남)' },
          desc: { type: 'string', description: '관리하는 데이터 한 문장, 60자 이내' },
        },
        required: ['nm', 'tp', 'desc'],
        additionalProperties: false,
      },
    },
  },
  required: ['ents'],
  additionalProperties: false,
} as const

let client: Anthropic | null = null

export async function suggestLogicalAi(t: IndstryTmpl | null, subj: { nm: string; desc: string | null }, ents: { ent_log_nm: string; ent_desc: string | null }[]): Promise<LgCand[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 })
  try {
    const res = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        '당신은 데이터 아키텍처(DA) 논리 모델러입니다. 주제영역에 이미 있는 엔터티를 보고, 논리 모델을 완성하는 데 더 필요한 엔터티를 제안합니다. ' +
        '이력·상세·관계(N:M 해소)·내역·코드·집계 엔터티처럼 실무 모델에서 빠지기 쉬운 것을 우선하고, 이미 있는 이름은 다시 제안하지 않습니다. ' +
        `엔터티명은 한국어 표준단어를 띄어쓰기 없이 붙이고 엔터티 분류어(${ENT_CLSS.join('·')}) 중 하나로 끝냅니다. 실존 기업·브랜드명은 쓰지 않습니다.`,
      messages: [
        {
          role: 'user',
          content: [
            t ? `업종 : ${t.nm} (업무 ${t.traits.biz} / 데이터 ${t.traits.data})` : '업종 : 미지정',
            `주제영역 : ${subj.nm}${subj.desc ? ` — ${subj.desc}` : ''}`,
            ents.length ? `등록된 엔터티 :\n${ents.map((e) => `- ${e.ent_log_nm}${e.ent_desc ? ` : ${e.ent_desc}` : ''}`).join('\n')}` : '등록된 엔터티 : 없음',
          ].join('\n'),
        },
      ],
    })
    const text = res.stop_reason === 'end_turn' ? res.content.find((b) => b.type === 'text')?.text : undefined
    if (!text) return []
    const j = JSON.parse(text) as { ents?: unknown }
    if (!Array.isArray(j.ents)) return []
    return j.ents
      .filter((x): x is LgCand => !!x && typeof x.nm === 'string' && typeof x.desc === 'string' && ['BASE', 'ACT', 'AGG'].includes(x.tp))
      .map((x) => ({ nm: x.nm.trim().slice(0, 40), tp: x.tp, desc: x.desc.trim() }))
  } catch (e) {
    console.error('[entity-ai]', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
    return []
  }
}
