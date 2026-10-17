// 관계 FK 상속 계획(PRD_PiErd S1 L1) — GET : 부모 주식별자 → 자식 상속 속성 맞춤 단계(add·link·fix) 미리보기(조회 권한, 저장 없음)
// GET 은 역할명 상속이 필요한 식별자(needs : 자기참조·다른 관계 상속·자식 자체 PK)도 돌려줌(S1 L2)
// POST { src_attr_ids?, roles?: [{ src_attr_id, term_id }] } : 계획을 다시 계산해 고른 원천(없으면 전부)만 적용 + 역할명 상속(승인 용어)(신청 권한) — 추가는 nextSeq 순서·PK 순서 자동, 연결·수정은 ver_no 증가, 감사 이력 ATTR
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { listAttrs, nextSeq } from '@/lib/model-attr'
import { fkNeeds, fkPlan, fkWant, type FkChildIn, type FkRelIn, type FkStep } from '@/lib/modelpi/fk'

type Ctx = { params: Promise<{ areaId: string; relId: string }> }
type ARow = FkChildIn & { ver_no: number; pk_seq: number | null; std_term: { term_log_nm: string } | null }

async function plan(areaId: string, relId: string) {
  const r = await db().from('mdl_rel').select('rel_id, prnt_ent_id, chld_ent_id, idnt_yn, prnt_opt_yn, rel_nm').eq('rel_id', relId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return null
  const rel = r.data as FkRelIn & { rel_nm: string | null }
  const [pa, ca] = await Promise.all([listAttrs(areaId, rel.prnt_ent_id), listAttrs(areaId, rel.chld_ent_id)])
  const prnt = (pa as unknown as ARow[]).filter((a) => a.pk_yn === 'Y').map((a) => ({ attr_id: a.attr_id, term_id: a.term_id, term_log_nm: a.std_term?.term_log_nm ?? '' }))
  const child = ca as unknown as ARow[]
  return { rel, child, steps: fkPlan(rel, prnt, child), needs: fkNeeds(rel, prnt, child), no_pk: prnt.length === 0, self: rel.prnt_ent_id === rel.chld_ent_id }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'VIEW')
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
  const auth = await requireAreaRole(areaId, 'REQUEST')
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
    const done: FkStep[] = []
    const fail: { term_log_nm: string; reason: string }[] = []
    for (const s of steps) {
      if (s.kind === 'add') {
        const seq = await nextSeq(p.rel.chld_ent_id)
        const row = { area_id: areaId, ent_id: p.rel.chld_ent_id, term_id: s.term_id, attr_seq: seq.attr, pk_yn: s.pk ? 'Y' : 'N', pk_seq: s.pk ? seq.pk : null, esntl_yn: s.pk || s.esntl ? 'Y' : 'N', fk_rel_id: relId, src_attr_id: s.src_attr_id, regr_id: uid, modr_id: uid }
        const { data, error } = await db().from('mdl_attr').insert(row).select('attr_id').single()
        if (error) {
          fail.push({ term_log_nm: s.term_log_nm, reason: error.code === '23505' ? 'ATTR_DUP' : (error.code ?? 'DB') })
          continue
        }
        await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: data.attr_id, act_cd: 'INS', aftr_val: { ...row, fk_plan: 'add' }, usr_id: uid })
      } else {
        const cur = p.child.find((a) => a.attr_id === s.attr_id)
        if (!cur) continue
        const pkSeq = s.pk ? (cur.pk_seq ?? (await nextSeq(p.rel.chld_ent_id)).pk) : null
        const set = { fk_rel_id: relId, src_attr_id: s.src_attr_id, pk_yn: s.pk ? 'Y' : 'N', pk_seq: pkSeq, esntl_yn: s.pk || s.esntl ? 'Y' : 'N', ver_no: cur.ver_no + 1, modr_id: uid }
        const { data, error } = await db().from('mdl_attr').update(set).eq('attr_id', s.attr_id).eq('ver_no', cur.ver_no).eq('del_yn', 'N').select('attr_id')
        if (error || !data.length) {
          fail.push({ term_log_nm: s.term_log_nm, reason: error ? (error.code ?? 'DB') : 'VERSION_CONFLICT' })
          continue
        }
        await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: s.attr_id, act_cd: 'UPD', bfr_val: cur, aftr_val: { ...cur, ...set, fk_plan: s.kind }, usr_id: uid })
      }
      done.push(s)
    }
    // 역할명 상속 : 필요한 원천(needs)만, 승인완료 용어(같은 분류체계), 관계가 요구하는 PK·필수
    let roled = 0
    const need = new Set(p.needs.map((n) => n.src_attr_id))
    const w = fkWant(p.rel)
    for (const r of b.roles ?? []) {
      const nm = p.needs.find((n) => n.src_attr_id === r.src_attr_id)?.term_log_nm ?? r.src_attr_id
      if (!need.has(r.src_attr_id)) {
        fail.push({ term_log_nm: nm, reason: 'ROLE_NOT_NEEDED' })
        continue
      }
      const t = await db().from('std_term').select('term_id, term_log_nm').eq('term_id', r.term_id).eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').maybeSingle()
      if (t.error) throw t.error
      if (!t.data) {
        fail.push({ term_log_nm: nm, reason: 'ATTR_TERM_INVALID' })
        continue
      }
      const pk = w.pk && !p.self
      const seq = await nextSeq(p.rel.chld_ent_id)
      const row = { area_id: areaId, ent_id: p.rel.chld_ent_id, term_id: r.term_id, attr_seq: seq.attr, pk_yn: pk ? 'Y' : 'N', pk_seq: pk ? seq.pk : null, esntl_yn: pk || w.esntl ? 'Y' : 'N', fk_rel_id: relId, src_attr_id: r.src_attr_id, regr_id: uid, modr_id: uid }
      const { data, error } = await db().from('mdl_attr').insert(row).select('attr_id').single()
      if (error) {
        fail.push({ term_log_nm: t.data.term_log_nm, reason: error.code === '23505' ? 'ATTR_DUP' : (error.code ?? 'DB') })
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
