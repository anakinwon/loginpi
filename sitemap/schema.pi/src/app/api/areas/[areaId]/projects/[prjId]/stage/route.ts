// 모델 단계 상태(마스터 지시 2026-10-17) — GET : 엔터티별 논리 상태·완료 막는 사유, 물리 모델별 테이블 상태 / POST : 상태 변경(작성완료·완료 취소, 여러 건)
// 순서 : 엔터티 작성완료 → 엔터티 선택 물리 전환 → 테이블 작성완료 → ERD 작성완료 → DDL. 완료 = 편집 잠금(DB 트리거), 수정은 완료 취소 후
// layer DGM(sql/037) : body subj_id·mdl_lvl_cd(·phy_mdl_id 기준 물리 모델) — 보고 있는 주제영역 다이어그램 1건, ids 불필요
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { setDgm, setLgc, setPhy, stageInfo } from '@/lib/model-stage'

type Ctx = { params: Promise<{ areaId: string; prjId: string }> }
const uuid = z.string().uuid()
const body = z
  .object({ layer: z.enum(['LGC', 'PHY', 'DGM']), ids: z.array(uuid).max(500).default([]), sts: z.enum(['WRT', 'CMPTN']), phy_mdl_id: uuid.optional(), subj_id: uuid.optional(), mdl_lvl_cd: z.enum(['CNCP', 'LGCL', 'PHY']).optional() })
  .refine((b) => (b.layer === 'DGM' ? !!b.subj_id && !!b.mdl_lvl_cd : b.ids.length > 0))

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  try {
    const d = await stageInfo(areaId, prjId)
    return d ? NextResponse.json({ ok: true, ...d }) : apiError('NOT_FOUND', 404)
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, prjId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  if (!uuid.safeParse(prjId).success) return apiError('INVALID_INPUT', 400)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (b.layer === 'PHY' && !b.phy_mdl_id) return apiError('INVALID_INPUT', 400)
  try {
    const r =
      b.layer === 'LGC'
        ? await setLgc(areaId, prjId, b.ids, b.sts, auth.user.usr_id)
        : b.layer === 'PHY'
          ? await setPhy(areaId, prjId, b.phy_mdl_id!, b.ids, b.sts, auth.user.usr_id)
          : await setDgm(areaId, prjId, b.subj_id!, b.mdl_lvl_cd!, b.phy_mdl_id ?? null, b.sts, auth.user.usr_id)
    if (!r) return apiError('NOT_FOUND', 404)
    if (r.done.length) await audit({ area_id: areaId, tgt_tp_cd: b.layer === 'LGC' ? 'ENT' : b.layer === 'PHY' ? 'PHY' : 'DGM', tgt_id: b.layer === 'DGM' ? r.done[0] : prjId, act_cd: 'UPD', aftr_val: { stage: b.layer, sts: b.sts, ids: r.done, phy_mdl_id: b.phy_mdl_id ?? null }, usr_id: auth.user.usr_id })
    // 일부 실패는 200 + fail 목록(화면이 사유 표시), 전부 실패는 409
    return NextResponse.json({ ok: r.fail.length === 0 || r.done.length > 0, code: r.fail.length && !r.done.length ? 'STAGE_GATE' : undefined, ...r }, { status: r.fail.length && !r.done.length ? 409 : 200 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
