// 다이어그램(PRD_PiErd S3 E2) — GET ?subj=&lvl=CNCP|LGCL|PHY : 엔터티(참조 표시)·관계·배치 좌표(다이어그램이 없으면 좌표 없음 → 화면 자동 배치), 조회 권한
// GET &phy= : 기준 물리 모델(없으면 첫 모델) — 물리 모델로 전환된 엔터티만(순서 : 논리 → 물리 → ERD)
// PUT : 좌표 저장(다이어그램 없으면 생성), 편집 권한. 좌표는 마지막 저장 우선
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { loadDgm, saveDgm, type DgmLvl } from '@/lib/model-dgm'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const lvl = z.enum(['CNCP', 'LGCL', 'PHY'])
const crd = z.number().finite().min(-1e6).max(1e6)
const body = z.object({
  subj_id: uuid.nullable(),
  mdl_lvl_cd: lvl,
  dgm_nm: z.string().trim().min(1).max(100).optional(),
  pos: z.array(z.object({ ent_id: uuid, x: crd, y: crd, fix: z.boolean(), seq: z.number().int().min(1).max(100000).optional() })).max(5000),
})

export async function GET(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  const sp = new URL(req.url).searchParams
  const subj = sp.get('subj') || null
  const phy = sp.get('phy') || null
  const l = lvl.safeParse(sp.get('lvl') ?? 'LGCL')
  if (!uuid.safeParse(prjId).success || (subj && !uuid.safeParse(subj).success) || (phy && !uuid.safeParse(phy).success) || !l.success) return apiError('INVALID_INPUT', 400)
  try {
    const d = await loadDgm(areaId, prjId, subj, l.data, phy)
    if (!d) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true, ...d })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (new Set(b.pos.map((p) => p.ent_id)).size !== b.pos.length) return apiError('INVALID_INPUT', 400)
  try {
    const r = await saveDgm(areaId, prjId, b.subj_id, b.mdl_lvl_cd as DgmLvl, b.dgm_nm ?? (b.subj_id ? '주제영역' : '전체'), b.pos, auth.user.usr_id)
    return NextResponse.json({ ok: true, dgm_id: r.dgm.dgm_id, ins: r.ins, upd: r.upd })
  } catch (e) {
    return dbError(e as { code?: string; message?: string }) // 23514 = 다른 프로젝트·삭제 엔터티·주제영역(트리거) → 400
  }
}
