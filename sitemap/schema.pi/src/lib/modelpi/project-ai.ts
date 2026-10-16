// 개념 모델 프로젝트 AI 추천 — 업종(+입력 중인 이름·설명) → 프로젝트 설명 1개·이름 후보 3개·스키마 접두사 후보(영문 대문자 2~4자, sql/023). 반자동 : 저장하지 않음(화면이 입력칸만 채움)
// 엔진 : ANTHROPIC_API_KEY 있으면 Claude(구조화 출력 JSON), 없거나 실패하면 업종 템플릿(traits) 문장. 외부로 보내는 값 = 업종명·특성·이름·설명뿐
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { TEMPLATES, type IndstryCd } from './template'

export interface ProjectSuggest {
  desc: string
  names: string[]
  prefixes: string[] // 스키마 접두사 AI 후보(형식 미검증 — 라우트가 tblPfxCands 로 걸러 규칙 후보와 합침)
  src: 'AI' | '업종 템플릿'
}

// 키 없는 환경·AI 실패 시 대체 — 템플릿 특성 문장 결합, 이름은 업종명 기반 고정 패턴
export function templateSuggest(cd: IndstryCd): ProjectSuggest {
  const t = TEMPLATES[cd]
  return {
    desc: `${t.nm} ${t.traits.biz} 데이터 표준·모델 구축(${t.traits.data})`.slice(0, 300),
    names: [`${t.nm} 통합 데이터 모델`, `차세대 ${t.nm} 데이터 플랫폼`, `${t.nm} 표준 데이터 체계`],
    prefixes: [],
    src: '업종 템플릿',
  }
}

const SCHEMA = {
  type: 'object',
  properties: {
    desc: { type: 'string', description: '프로젝트 설명 한국어 1~2문장, 200자 이내' },
    names: { type: 'array', items: { type: 'string' }, description: '프로젝트명 후보 3개, 각 25자 이내' },
    prefixes: { type: 'array', items: { type: 'string' }, description: '물리 테이블명 스키마 접두사 후보 3개, 영문 대문자 2~4자(예 : ECM, FIN), 프로젝트·업종을 나타내는 약어' },
  },
  required: ['desc', 'names', 'prefixes'],
  additionalProperties: false,
} as const

let client: Anthropic | null = null

export async function suggestProject(cd: IndstryCd, nm: string, desc: string): Promise<ProjectSuggest> {
  if (!process.env.ANTHROPIC_API_KEY) return templateSuggest(cd)
  const t = TEMPLATES[cd]
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 })
  try {
    const res = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        '당신은 데이터 아키텍처(DA) 컨설턴트입니다. 데이터 표준화·개념 모델링 프로젝트의 설명과 이름을 제안합니다. ' +
        '설명은 이 프로젝트가 어떤 업무 데이터를 어떤 목적으로 표준화·모델링하는지 구체적으로 씁니다. ' +
        '이름은 짧고 기억하기 쉬우며 업종 성격이 드러나게 짓되, 실존 기업·브랜드명은 쓰지 않습니다. ' +
        '스키마 접두사는 물리 테이블명 맨 앞에 붙는 영문 대문자 2~4자 약어입니다(예 : ECM_CST_CUST_M).',
      messages: [
        {
          role: 'user',
          content: [
            `업종 : ${t.nm}`,
            `업종 특성 : 업무 ${t.traits.biz} / 규제 ${t.traits.reg} / 데이터 ${t.traits.data} / 규모 ${t.traits.volume}`,
            nm ? `입력 중인 프로젝트명 : ${nm}` : '프로젝트명 : 미입력',
            desc ? `입력 중인 설명 : ${desc}` : '설명 : 미입력',
          ].join('\n'),
        },
      ],
    })
    const text = res.stop_reason === 'end_turn' ? res.content.find((b) => b.type === 'text')?.text : undefined
    if (!text) return templateSuggest(cd)
    const j = JSON.parse(text) as { desc?: unknown; names?: unknown; prefixes?: unknown }
    const names = Array.isArray(j.names) ? j.names.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, 100)) : []
    if (typeof j.desc !== 'string' || !j.desc.trim() || names.length === 0) return templateSuggest(cd)
    const prefixes = Array.isArray(j.prefixes) ? j.prefixes.filter((x): x is string => typeof x === 'string') : []
    return { desc: j.desc.trim().slice(0, 4000), names: names.slice(0, 3), prefixes, src: 'AI' }
  } catch (e) {
    console.error('[project-ai]', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e)
    return templateSuggest(cd)
  }
}
