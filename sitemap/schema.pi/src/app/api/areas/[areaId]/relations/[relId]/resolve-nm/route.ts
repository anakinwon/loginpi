// N:M 해소(PRD_PiErd S1 L3) — GET : 교차 엔터티 이름 후보(표준단어 분해·이름 규칙·프로젝트 중복) 미리보기(조회 권한, 저장 없음)
// POST { dic_ids, subj_id?, ent_desc? } : N:M 해소 → 교차 엔터티(논리 LGCL·행위) + 부모·자식 각각에서 식별 1:N 관계 2개 + 두 관계 FK 상속(주식별자 = 두 부모 PK). 신청 권한, 감사 이력
// 순서 : N:M 관계를 먼저 논리 삭제(ver_no 잠금 — 동시 두 번 해소 차단) → 교차 엔터티(실패 시 N:M 복구) → 관계 2개 → 옛 N:M 상속 속성 일반 전환 → FK 상속
// 응답 needs = 두 부모 PK 용어가 같아 역할명이 필요한 식별자(화면이 역할명 패널로 이어감), no_pk = 부모에 주식별자 없음. 자기참조 N:M 은 거부(REL_SELF_NM)
// ponytail: 단계별 쓰기(트랜잭션 없음) — 관계 생성 이후 실패는 partial 로 알림. 원자성이 필요하면 DB 함수(RPC)로
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { areaDict } from '@/lib/term'
import { prepareEnt } from '@/lib/model'
import type { EntWord } from '@/lib/model-name'
import { applyFkSteps, fkState } from '@/lib/model-fk'
import { nmNameCands } from '@/lib/modelpi/nm'

type Ctx = { params: Promise<{ areaId: string; relId: string }> }
type Ent = { ent_id: string; prj_id: string; subj_id: string; ent_log_nm: string; mdl_subj: { subj_abbr_nm: string } | null; mdl_prj: { tbl_pfx_txt: string; trgt_dbms_cd: string } | null }

async function load(areaId: string, relId: string) {
  const r = await db().from('mdl_rel').select('rel_id, prnt_ent_id, chld_ent_id, crdn_cd, rel_nm, ver_no').eq('rel_id', relId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return null
  const rel = r.data as { rel_id: string; prnt_ent_id: string; chld_ent_id: string; crdn_cd: string; rel_nm: string | null; ver_no: number }
  const e = await db()
    .from('mdl_ent')
    .select('ent_id, prj_id, subj_id, ent_log_nm, mdl_subj!inner(subj_abbr_nm), mdl_prj!mdl_ent_mdl_prj_id_fkey(tbl_pfx_txt, trgt_dbms_cd)')
    .in('ent_id', [rel.prnt_ent_id, rel.chld_ent_id])
    .eq('del_yn', 'N')
  if (e.error) throw e.error
  const ents = e.data as unknown as Ent[]
  const p = ents.find((x) => x.ent_id === rel.prnt_ent_id), c = ents.find((x) => x.ent_id === rel.chld_ent_id)
  if (!p || !c) return null
  return { rel, p, c }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_VIEW')
  if (auth instanceof NextResponse) return auth
  if (!z.string().uuid().safeParse(relId).success) return apiError('INVALID_INPUT', 400)
  try {
    const m = await load(areaId, relId)
    if (!m) return apiError('NOT_FOUND', 404)
    if (m.rel.crdn_cd !== 'NM') return apiError('REL_NOT_NM', 400)
    if (m.p.ent_id === m.c.ent_id) return apiError('REL_SELF_NM', 400)
    const [dict, have] = await Promise.all([
      areaDict<EntWord>(areaId, 'dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, ent_clss_yn, forbid_yn, tbl_sfx_txt'),
      db().from('mdl_ent').select('ent_log_nm').eq('prj_id', m.c.prj_id).eq('del_yn', 'N'),
    ])
    if (have.error) throw have.error
    const cands = nmNameCands({ prntNm: m.p.ent_log_nm, chldNm: m.c.ent_log_nm, relNm: m.rel.rel_nm, dict, have: new Set(have.data.map((x) => x.ent_log_nm as string)), subjAbbr: m.c.mdl_subj?.subj_abbr_nm ?? '', pfx: m.c.mdl_prj?.tbl_pfx_txt, dbms: m.c.mdl_prj?.trgt_dbms_cd })
    return NextResponse.json({ ok: true, prnt: m.p.ent_log_nm, chld: m.c.ent_log_nm, rel_nm: m.rel.rel_nm, subj_id: m.c.subj_id, cands })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

const body = z.object({ dic_ids: z.array(z.string().uuid()).min(1).max(20), subj_id: z.string().uuid().optional(), ent_desc: z.string().trim().max(4000).nullable().optional() })

export async function POST(req: Request, { params }: Ctx) {
  const { areaId, relId } = await params
  const auth = await requireAreaRole(areaId, 'MODEL_EDIT')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  if (!z.string().uuid().safeParse(relId).success) return apiError('INVALID_INPUT', 400)
  try {
    const m = await load(areaId, relId)
    if (!m) return apiError('NOT_FOUND', 404)
    if (m.rel.crdn_cd !== 'NM') return apiError('REL_NOT_NM', 400)
    if (m.p.ent_id === m.c.ent_id) return apiError('REL_SELF_NM', 400)
    const uid = auth.user.usr_id
    // ① 교차 엔터티 : 주제영역 = 지정(같은 프로젝트) 또는 자식의 주제영역, 이름은 서버가 표준단어로 다시 만듦
    const subjId = b.subj_id ?? m.c.subj_id
    const sj = await db().from('mdl_subj').select('prj_id').eq('subj_id', subjId).eq('area_id', areaId).eq('del_yn', 'N').maybeSingle()
    if (sj.error) throw sj.error
    if (!sj.data || sj.data.prj_id !== m.c.prj_id) return apiError('ENT_SUBJ_PRJ', 400)
    const entIn = { subj_id: subjId, dic_ids: b.dic_ids, ent_tp_cd: 'ACT' as const, ent_desc: b.ent_desc || `${m.p.ent_log_nm}·${m.c.ent_log_nm} N:M 해소 교차 엔터티${m.rel.rel_nm ? `(${m.rel.rel_nm})` : ''}` }
    const pe = await prepareEnt(areaId, entIn)
    if (typeof pe === 'string') return apiError(pe, pe === 'NOT_FOUND' ? 404 : 400)
    // N:M 먼저 논리 삭제(잠금) — 동시 해소·재해소 차단
    const d = await db().from('mdl_rel').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), ver_no: m.rel.ver_no + 1, modr_id: uid }).eq('rel_id', relId).eq('ver_no', m.rel.ver_no).eq('del_yn', 'N').select('rel_id')
    if (d.error) return dbError(d.error)
    if (!d.data.length) return apiError('VERSION_CONFLICT', 409)
    const ins = await db().from('mdl_ent').insert({ area_id: areaId, subj_id: subjId, ent_log_nm: pe.ent_log_nm, ent_tp_cd: 'ACT', ent_desc: entIn.ent_desc, dic_ids: b.dic_ids, mdl_lvl_cd: 'LGCL', regr_id: uid, modr_id: uid }).select('ent_id, ent_log_nm').single()
    if (ins.error) {
      // 교차 엔터티 실패 → N:M 복구
      await db().from('mdl_rel').update({ del_yn: 'N', del_dtm: null, ver_no: m.rel.ver_no + 2, modr_id: uid }).eq('rel_id', relId).eq('ver_no', m.rel.ver_no + 1)
      return dbError(ins.error, 'ENT_DUP')
    }
    await audit({ area_id: areaId, tgt_tp_cd: 'REL', tgt_id: relId, act_cd: 'DEL', bfr_val: m.rel, aftr_val: { resolved_to: ins.data.ent_id }, usr_id: uid })
    const x = ins.data
    await audit({ area_id: areaId, tgt_tp_cd: 'ENT', tgt_id: x.ent_id, act_cd: 'INS', aftr_val: { ...entIn, ent_log_nm: pe.ent_log_nm, nm_of: relId }, usr_id: uid })
    // ② 식별 1:N 관계 2개(부모 필수, 교차 엔터티 쪽 선택)
    const rels: string[] = []
    for (const prnt of [m.p, m.c]) {
      const row = { area_id: areaId, prnt_ent_id: prnt.ent_id, chld_ent_id: x.ent_id, rel_nm: m.rel.rel_nm, crdn_cd: '1N', idnt_yn: 'Y', prnt_opt_yn: 'N', chld_opt_yn: 'Y', regr_id: uid, modr_id: uid }
      const r = await db().from('mdl_rel').insert(row).select('rel_id').single()
      if (r.error) return NextResponse.json({ ok: true, partial: true, ent_id: x.ent_id, rel_ids: rels, message: `교차 엔터티는 만들었지만 관계 생성에 실패했습니다(${r.error.code}) — 관계 편집에서 확인하십시오` })
      rels.push(r.data.rel_id)
      await audit({ area_id: areaId, tgt_tp_cd: 'REL', tgt_id: r.data.rel_id, act_cd: 'INS', aftr_val: { ...row, nm_of: relId }, usr_id: uid })
    }
    // ③ 옛 N:M 로 상속했던 속성(규칙 변경 전 데이터) → 일반 속성 전환
    const old = await db().from('mdl_attr').update({ fk_rel_id: null, src_attr_id: null, modr_id: uid }).eq('fk_rel_id', relId).eq('del_yn', 'N').select('attr_id')
    if (!old.error) for (const a of old.data) await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: a.attr_id as string, act_cd: 'UPD', aftr_val: { fk_rel_id: null, src_attr_id: null, nm_resolved: relId }, usr_id: uid })
    // ④ 두 관계 FK 상속 → 교차 엔터티 주식별자 = 두 부모 PK
    let fk = 0
    let noPk = false
    const fail: { term_log_nm: string; reason: string }[] = []
    const needs: { rel_id: string; items: unknown[] }[] = []
    for (const id of rels) {
      const st = await fkState(areaId, id)
      if (!st) continue
      const a = await applyFkSteps(areaId, st, st.steps, uid)
      fk += a.done.length
      fail.push(...a.fail)
      if (st.no_pk) noPk = true
      // 두 부모 PK 용어가 같으면 두 번째 관계는 역할명 필요(같은 용어를 이미 첫 관계로 상속)
      const after = await fkState(areaId, id)
      if (after?.needs.length) needs.push({ rel_id: id, items: after.needs })
    }
    return NextResponse.json({ ok: true, ent_id: x.ent_id, ent_log_nm: x.ent_log_nm, rel_ids: rels, nm_deleted: true, old_fk_cleared: old.data?.length ?? 0, fk_applied: fk, no_pk: noPk, needs, fail })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
