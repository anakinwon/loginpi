// ModelPi 업종(Industry) 템플릿 — 반자동 추천 근거 데이터 로더·스키마·업종 추천(순수, 서버·화면·테스트 공용)
// 정본 데이터 : src/data/industry/<cd>.json(코드 = sql/022 std_cmn_cd INDSTRY·mdl_prj.indstry_cd CHECK). 추천은 저장하지 않는다(사용자가 골라 기존 등록 API 로 저장)
// 엔터티 키 = 단어 결합 + 엔터티 분류어(예 '주문'+'상세' = 주문상세) — 관계·속성·물리 권고가 이 키로 참조
import { z } from 'zod'
import ECOM from '../../data/industry/ECOM.json' with { type: 'json' }
import FIN from '../../data/industry/FIN.json' with { type: 'json' }
import MFG from '../../data/industry/MFG.json' with { type: 'json' }
import LOG from '../../data/industry/LOG.json' with { type: 'json' }
import PUB from '../../data/industry/PUB.json' with { type: 'json' }
import MED from '../../data/industry/MED.json' with { type: 'json' }
import TEL from '../../data/industry/TEL.json' with { type: 'json' }
import EDU from '../../data/industry/EDU.json' with { type: 'json' }

export const INDSTRY_CDS = ['ECOM', 'FIN', 'MFG', 'LOG', 'PUB', 'MED', 'TEL', 'EDU'] as const
export type IndstryCd = (typeof INDSTRY_CDS)[number]
// 엔터티 분류어(테이블 접미어 12종, PRD §5 엔터티 분류어) — 템플릿 clss 는 이 이름만
export const ENT_CLSS = ['정보', '기본', '상세', '이력', '내역', '로그', '인터페이스', '코드', '집계', '통계', '백업', '관계'] as const

const yn = z.enum(['Y', 'N'])
export const tmplSchema = z.object({
  cd: z.enum(INDSTRY_CDS),
  nm: z.string().min(1),
  ver: z.string(),
  status: z.string(),
  keywords: z.array(z.string().min(1)).min(1),
  traits: z.object({ biz: z.string(), reg: z.string(), data: z.string(), volume: z.string() }),
  subjects: z.array(z.object({ nm: z.string().min(1), eng: z.string().min(1), abbr: z.string().regex(/^[A-Z]{3}$/), desc: z.string() })).min(1),
  entities: z.array(z.object({ subj: z.string(), words: z.array(z.string().min(1)).min(1), clss: z.enum(ENT_CLSS).nullable(), tp: z.enum(['BASE', 'ACT', 'AGG']), desc: z.string() })).min(1),
  rels: z.array(z.object({ prnt: z.string(), chld: z.string(), crdn: z.enum(['11', '1N', 'NM']), idnt: yn, nm: z.string() })),
  attrs: z.array(z.object({ ent: z.string(), terms: z.array(z.string()).min(1), pk: z.array(z.string()) })),
  physical: z.array(z.object({ ent: z.string(), kind: z.enum(['partition', 'index', 'denorm']), hint: z.string() })),
})
export type IndstryTmpl = z.infer<typeof tmplSchema>
export type TmplEnt = IndstryTmpl['entities'][number]

export const entKey = (e: Pick<TmplEnt, 'words' | 'clss'>) => e.words.join('') + (e.clss ?? '')

// 모듈 로드 시 1회 검증(형식 위반 = 빌드·기동 실패로 드러남, test/modelpi-template.test.ts 가 정합까지 검사)
const RAW: Record<IndstryCd, unknown> = { ECOM, FIN, MFG, LOG, PUB, MED, TEL, EDU }
export const TEMPLATES: Record<IndstryCd, IndstryTmpl> = Object.fromEntries(INDSTRY_CDS.map((cd) => [cd, tmplSchema.parse(RAW[cd])])) as Record<IndstryCd, IndstryTmpl>

export const isIndstry = (v: unknown): v is IndstryCd => typeof v === 'string' && (INDSTRY_CDS as readonly string[]).includes(v)

// 업종 목록(화면 콤보·특성 표시)
export const industryList = () => INDSTRY_CDS.map((cd) => ({ cd, nm: TEMPLATES[cd].nm, traits: TEMPLATES[cd].traits, subjects: TEMPLATES[cd].subjects.length, entities: TEMPLATES[cd].entities.length }))

// 프로젝트 업종 추천 — 프로젝트명·설명에 템플릿 키워드(가중 3)·업종명(3)·주제영역명(2)·엔터티 단어(1)가 나오면 점수, 0점은 제외, 근거 단어 표시
// ponytail: 부분 문자열 일치 점수 — 동의어·영문 혼용은 LLM 2차 공급자(provider 'llm')로 보강
export function recommendIndustries(text: string, max = 3) {
  const s = text.toLowerCase()
  if (!s.trim()) return []
  return INDSTRY_CDS.map((cd) => {
    const t = TEMPLATES[cd]
    const why = new Map<string, number>()
    const hit = (w: string, n: number) => w && s.includes(w.toLowerCase()) && why.set(w, Math.max(why.get(w) ?? 0, n))
    hit(t.nm, 3)
    t.keywords.forEach((k) => hit(k, 3))
    t.subjects.forEach((x) => hit(x.nm, 2))
    t.entities.forEach((e) => e.words.forEach((w) => w.length >= 2 && hit(w, 1)))
    const score = [...why.values()].reduce((a, b) => a + b, 0)
    return { cd, nm: t.nm, score, why: [...why.keys()].slice(0, 5) }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || INDSTRY_CDS.indexOf(a.cd) - INDSTRY_CDS.indexOf(b.cd))
    .slice(0, max)
}

// 스키마 접두사 후보(규칙, sql/023) — AI 후보(있으면) → 업종 코드 → 업종 코드 앞 2·3자 → TB 순, 영문 대문자 2~4자만, 같은 분류체계 다른 프로젝트가 쓰는 접두사 제외, 최대 4개
// 모두 쓰이면 업종 코드 앞 3자(없으면 TB) + A~Z 로 빈 자리를 찾음
export function tblPfxCands(cd: string | null, used: Iterable<string>, ai: string[] = [], max = 4): string[] {
  const taken = new Set([...used].map((x) => x.toUpperCase()))
  const base = isIndstry(cd) ? [cd, cd.slice(0, 2), cd.slice(0, 3)] : []
  const out: string[] = []
  for (const x of [...ai.map((a) => a.trim().toUpperCase()), ...base, 'TB']) if (/^[A-Z]{2,4}$/.test(x) && !taken.has(x) && !out.includes(x)) out.push(x)
  const stem = isIndstry(cd) ? cd.slice(0, 3) : 'TB'
  for (let i = 0; out.length < max && i < 26; i++) {
    const x = stem + String.fromCharCode(65 + i)
    if (!taken.has(x) && !out.includes(x)) out.push(x)
  }
  return out.slice(0, max)
}
