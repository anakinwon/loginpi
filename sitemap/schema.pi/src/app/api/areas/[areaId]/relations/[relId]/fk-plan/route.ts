// 관계 FK 상속 계획(PRD_PiErd S1 L1) — GET : 부모 주식별자 → 자식 상속 속성 맞춤 단계(add·link·fix) 미리보기(조회 권한, 저장 없음)
// GET 은 역할명 상속이 필요한 식별자(needs : 자기참조·다른 관계 상속·자식 자체 PK)도 돌려줌(S1 L2)
// POST { src_attr_ids?, roles?: [{ src_attr_id, term_id }] } : 계획을 다시 계산해 고른 원천(없으면 전부)만 적용 + 역할명 상속(승인 용어)(신청 권한) — 추가는 nextSeq 순서·PK 순서 자동, 연결·수정은 ver_no 증가, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { insertAttr, isSeqConflict, nextSeq } from '@/lib/model-attr'
import { applyFkSteps, fkState } from '@/lib/model-fk'
import { fkWant } from '@/lib/modelpi/fk'

type Ctx = { params: Promise<{ areaId: string; relId: string }> }
const plan = fkState

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(relId).success) return apiError('INVALID_INPUT', 400)
  try {
    const p = await plan(areaId, relId)
    if (!p) return apiError('NOT_FOUND', 404)
    return NextResponse.json({ ok: true, steps: p.steps, needs: p.needs, no_pk: p.no_pk, self: p.self })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

const body = z.object({
  src_attr_ids: z.array(z.string().uuid()).max(100).optional(),
  roles: z.array(z.object({ src_attr_id: z.string().uuid(), term_id: z.string().uuid() })).max(50).optional(),
})

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (!z.string().uuid().safeParse(relId).success) return apiError('INVALID_INPUT', 400)
  try {
    const p = await plan(areaId, relId)
    if (!p) return apiError('NOT_FOUND', 404)
    const pick = b.src_attr_ids || b.roles ? new Set(b.src_attr_ids ?? []) : null
    const steps = p.steps.filter((s) => !pick || pick.has(s.src_attr_id))
    const uid = auth.user.usr_id
    const { done, fail } = await applyFkSteps(areaId, p, steps, uid)
    // 역할명 상속 : 필요한 원천(needs)만, 승인완료 용어(같은 분류체계), 관계가 요구하는 PK·필수
    let roled = 0
    const need = new Set(p.needs.map((n) => n.src_attr_id))
    const w = fkWant(p.rel)
    // 역할 용어는 한 번에 조회, 순번은 상속 적용 뒤 한 번만 계산해 올려 씀(R-P2, 2026-10-24 전수 점검)
    const roles = b.roles ?? []
    const [tq, seq] = roles.length
      ? await Promise.all([db().from('std_term').select('term_id, term_log_nm').in('term_id', [...new Set(roles.map((r) => r.term_id))]).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM'), nextSeq(p.rel.chld_ent_id)])
      : [null, { attr: 1, pk: 1 }]
    if (tq?.error) throw tq.error
    const termBy = new Map((tq?.data ?? []).map((x) => [x.term_id as string, x as { term_id: string; term_log_nm: string }]))
    for (const r of roles) {
      const nm = p.needs.find((n) => n.src_attr_id === r.src_attr_id)?.term_log_nm ?? r.src_attr_id
      if (!need.has(r.src_attr_id)) {
        fail.push({ term_log_nm: nm, reason: 'ROLE_NOT_NEEDED' })
        continue
      }
      const t = { data: termBy.get(r.term_id) ?? null }
      if (!t.data) {
        fail.push({ term_log_nm: nm, reason: 'ATTR_TERM_INVALID' })
        continue
      }
      const pk = w.pk && !p.self
      const row = { area_id: areaId, ent_id: p.rel.chld_ent_id, term_id: r.term_id, attr_seq: seq.attr, pk_yn: pk ? 'Y' : 'N', pk_seq: pk ? seq.pk : null, esntl_yn: pk || w.esntl ? 'Y' : 'N', fk_rel_id: relId, src_attr_id: r.src_attr_id, regr_id: uid, modr_id: uid }
      const { data, error } = await insertAttr(row)
      seq.attr = Math.max(seq.attr, row.attr_seq + 1)
      if (row.pk_seq != null) seq.pk = Math.max(seq.pk, row.pk_seq + 1)
      if (error || !data) {
        fail.push({ term_log_nm: t.data.term_log_nm, reason: error?.code === '23505' && !isSeqConflict(error) ? 'ATTR_DUP' : (error?.code ?? 'DB') })
        continue
      }
      await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: data.attr_id, act_cd: 'INS', aftr_val: { ...row, fk_plan: 'role', role_of: nm }, usr_id: uid })
      need.delete(r.src_attr_id) // 같은 원천을 한 요청에서 두 번 역할 상속하지 않음
      roled++
    }
    return NextResponse.json({ ok: true, applied: done.length, roled, fail })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
