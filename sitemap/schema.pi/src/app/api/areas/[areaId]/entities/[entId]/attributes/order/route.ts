// 엔터티 속성 순서 저장 — PUT { ids: [attr_id …] }(이 엔터티의 활성 속성 전부, 원하는 순서). 신청 권한, 감사 이력 ATTR(변경 전후 순서)
// 규칙 : 주식별자는 항상 앞 묶음(PK 끼리만 순서 변경 → pk_seq 1..n), 일반 속성은 그 뒤(attr_seq 1..m 전체 재부여)
// ponytail: 행별 UPDATE(트랜잭션 아님) — 동시 편집 경합이 생기면 RPC 로 묶는다
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, audit, dbError, parseBody, requireAreaRole } from '@/lib/api'

type Ctx = { params: Promise<{ areaId: string; entId: string }> }
const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })

export async function PUT(req: Request, { params }: Ctx) {
  const { areaId, entId } = await params
  const auth = await requireAreaRole(areaId, 'REQUEST')
  if (auth instanceof NextResponse) return auth
  const b = await parseBody(req, schema)
  if (b instanceof NextResponse) return b
  try {
    const { data, error } = await db().from('mdl_attr').select('attr_id, pk_yn, pk_seq, attr_seq, ver_no').eq('area_id', areaId).eq('ent_id', entId).eq('del_yn', 'N')
    if (error) throw error
    const cur = data as { attr_id: string; pk_yn: string; pk_seq: number | null; attr_seq: number; ver_no: number }[]
    const by = new Map(cur.map((a) => [a.attr_id, a]))
    // 같은 집합(누락·중복·다른 엔터티 없음)이어야 함
    if (b.ids.length !== cur.length || new Set(b.ids).size !== b.ids.length || b.ids.some((id) => !by.has(id))) return apiError('ATTR_ORDER_STALE', 409)
    const pkN = cur.filter((a) => a.pk_yn === 'Y').length
    if (b.ids.some((id, i) => (by.get(id)!.pk_yn === 'Y') !== i < pkN)) return apiError('ATTR_ORDER_PK', 400)
    const uid = auth.user.usr_id
    let pkSeq = 0
    const changed: { attr_id: string; pk_seq: number | null; attr_seq: number }[] = []
    b.ids.forEach((id, i) => {
      const a = by.get(id)!
      const next = { attr_id: id, pk_seq: a.pk_yn === 'Y' ? ++pkSeq : null, attr_seq: i + 1 }
      if (next.pk_seq !== a.pk_seq || next.attr_seq !== a.attr_seq) changed.push(next)
    })
    for (const c of changed) {
      const a = by.get(c.attr_id)!
      const u = await db().from('mdl_attr').update({ pk_seq: c.pk_seq, attr_seq: c.attr_seq, ver_no: a.ver_no + 1, modr_id: uid }).eq('attr_id', c.attr_id).eq('ver_no', a.ver_no).eq('del_yn', 'N').select('attr_id')
      if (u.error) return dbError(u.error)
      if (!u.data.length) return apiError('VERSION_CONFLICT', 409)
    }
    if (changed.length)
      await audit({ area_id: areaId, tgt_tp_cd: 'ATTR', tgt_id: entId, act_cd: 'UPD', bfr_val: { order: [...cur].sort((x, y) => x.attr_seq - y.attr_seq).map((a) => a.attr_id) }, aftr_val: { order: b.ids }, usr_id: uid })
    return NextResponse.json({ ok: true, changed: changed.length })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
