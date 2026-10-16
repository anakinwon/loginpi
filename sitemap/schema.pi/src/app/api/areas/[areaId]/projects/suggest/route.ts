// 프로젝트 업종 추천 — GET ?text=(프로젝트명 + 설명) → { industries:[{cd, nm, score, why[]}], src }. 반자동 : 저장하지 않음(사용자가 골라 프로젝트 등록·수정 시 indstry_cd 로 저장)
// 엔진 = 템플릿 키워드 점수(src/lib/modelpi/template.ts), LLM 공급자는 AI 키·외부 전송 승인 뒤 같은 응답 형식으로 추가
import { NextResponse } from 'next/server'
import { requireAreaRole } from '@/lib/api'
import { recommendIndustries } from '@/lib/modelpi/template'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const text = (new URL(req.url).searchParams.get('text') ?? '').slice(0, 500)
  return NextResponse.json({ ok: true, industries: recommendIndustries(text), src: ['업종 템플릿(키워드)'] })
}
