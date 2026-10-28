// 내 표시 이름 — PATCH {name} : sys_user.dsp_nm 을 바꾼다(모든 세미나·다음 로그인에도 그대로, 로그인은 dsp_nm 을 덮어쓰지 않음 — @pi/db upsertPiUser).
//  룸 [이름 바꾸기]가 부른다(마스터 2026-10-29 — 세미나별 별명 대신 계정 이름). 바꾸면 내 세미나별 별명(smn_ncknm, sql/014)은 논리삭제해 어디서나 같은 이름.
//  사칭 막기 — 다른 사용자의 Pi 사용자명·표시 이름과 같으면(대소문자·공백 무시) 409 NAME_TAKEN. 비로그인 401(redirect 없음)
//  같은 이름 판정 = DB ilike(대소문자 무시)·공백 제거 두 형태, NFKC 정규형이 아닌 입력(전각 글자 등)은 거절해 닮은꼴 우회를 막는다(보안 검토)
// ponytail: 확인과 갱신 사이 두 사람이 같은 이름을 동시에 고르는 경합은 열려 있다(표시 이름일 뿐 인증과 무관) — 막으려면 정규화 키 칼럼 + 유일 인덱스
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import { apiError, db, dbFail, dbRoute, parseBody, requireUser } from '@/lib/api'
import { nameOk } from '@/lib/seminar-rules'

const schema = z.object({ name: z.string().trim().refine((n) => nameOk(n) && n.normalize('NFKC') === n) })
// ilike 패턴 이스케이프 — 역슬래시·%·_ 를 글자 그대로
const like = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

export const PATCH = withAuthGuard(
  dbRoute(async (req) => {
    const [user, body] = await Promise.all([requireUser(req), parseBody(req, schema)])
    if (user instanceof NextResponse) return user
    if (body instanceof NextResponse) return body
    const forms = [...new Set([body.name, body.name.replace(/\s+/g, '')])].map(like)
    // 다른 사용자 이름과 겹치는지 — Pi 사용자명·표시 이름·(예전) 세미나 별명, 형태·칼럼별로 병렬(R-P1), 1행이면 충분
    const hits = await Promise.all(
      forms.flatMap((f) => [
        ...['pi_usr_nm', 'dsp_nm'].map((col) =>
          db().from('sys_user').select('usr_id').ilike(col, f).neq('usr_id', user.id).eq('del_yn', 'N').limit(1),
        ),
        db().from('smn_ncknm').select('usr_id').ilike('ncknm', f).neq('usr_id', user.id).eq('del_yn', 'N').limit(1),
      ]),
    )
    const bad = hits.find((h) => h.error)
    if (bad?.error) return dbFail(bad.error)
    if (hits.some((h) => h.data?.length)) return apiError('NAME_TAKEN', 409)
    const now = new Date().toISOString()
    // 계정 이름 갱신 + 세미나별 별명 정리 — 서로 의존 없음 → 병렬
    const [u, n] = await Promise.all([
      db().from('sys_user').update({ dsp_nm: body.name, modr_id: user.id, mod_dtm: now }).eq('usr_id', user.id),
      db().from('smn_ncknm').update({ del_yn: 'Y', del_dtm: now, modr_id: user.id, mod_dtm: now }).eq('usr_id', user.id).eq('del_yn', 'N'),
    ])
    if (u.error) return dbFail(u.error)
    if (n.error) return dbFail(n.error)
    return NextResponse.json({ name: body.name }, { headers: { 'Cache-Control': 'no-store' } })
  }),
)
