// AI 회의록 서버 공용 — 열람 권한 확인(1왕복)·Storage 비공개 버킷 smn-note(없으면 만든다)·서명 URL.
// 사용 : import { loadNote, uploadShot } from '@/lib/notes' (api/notes/* · api/speech/chunk)
import 'server-only'
import type { UserRow } from '@pi/db'
import { db } from './api'
import { isAdmin } from './auth'

export const NOTE_BUCKET = 'smn-note'
export const SIGN_SEC = 3600 // 서명 URL 유효 1시간(화면을 오래 열어 두면 새로 고침)

export type NoteRow = {
  nt_id: string
  smn_id: string | null
  usr_id: string
  nt_nm: string
  start_dtm: string
  end_dtm: string | null
  nt_sts_cd: string
  smr_val: { points: string[]; decisions: string[]; todos: string[] } | null
}
const NOTE_COLS =
  'nt_id, smn_id, usr_id, nt_nm, start_dtm, end_dtm, nt_sts_cd, smr_val'

// 회의록 + 열람 권한 — 볼 수 있는 사람 = 기록 시작자·개최자·관리자(manage) + 참가 등록자(view).
//  참가 등록 여부는 임베디드 필터(smn_mst.smn_ptc.usr_id = 나)로 같은 왕복에서 가린다(R-P1·R-P2)
export async function loadNote(ntId: string, user: UserRow) {
  const { data, error } = await db()
    .from('smn_nt')
    .select(`${NOTE_COLS}, smn_mst(hst_usr_id, smn_ptc(usr_id))`)
    .eq('nt_id', ntId)
    .eq('del_yn', 'N')
    .eq('smn_mst.smn_ptc.usr_id', user.id)
    .eq('smn_mst.smn_ptc.del_yn', 'N')
    .maybeSingle<
      NoteRow & {
        smn_mst: { hst_usr_id: string; smn_ptc: { usr_id: string }[] } | null
      }
    >()
  if (error) return { error }
  if (!data) return { note: null }
  const { smn_mst: smn, ...note } = data
  const manage =
    note.usr_id === user.id || smn?.hst_usr_id === user.id || isAdmin(user)
  const view = manage || !!smn?.smn_ptc?.length
  return { note: view ? note : null, manage, forbidden: !view }
}

// 캡처 1장 올리기 — 버킷이 없으면(첫 사용) 비공개로 만들고 1번 다시 시도
export async function uploadShot(path: string, bytes: Uint8Array) {
  const put = () =>
    db()
      .storage.from(NOTE_BUCKET)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  let { error } = await put()
  if (error && /not.?found/i.test(error.message)) {
    const c = await db().storage.createBucket(NOTE_BUCKET, { public: false })
    if (c.error && !/exist/i.test(c.error.message)) return c.error
    ;({ error } = await put())
  }
  return error
}

// 서명 URL 여러 개(1왕복). 실패 시 빈 배열
export async function signShots(keys: string[]) {
  if (!keys.length) return []
  const { data, error } = await db()
    .storage.from(NOTE_BUCKET)
    .createSignedUrls(keys, SIGN_SEC)
  if (error) {
    console.error('[notes] 서명 URL 실패', error.message)
    return []
  }
  return data.map((d) => d.signedUrl ?? null)
}

// 캡처 원본(요약 입력) — base64. 실패한 장은 건너뛴다
export async function readShots(keys: string[]) {
  const all = await Promise.all(
    keys.map(async (k) => {
      const { data } = await db().storage.from(NOTE_BUCKET).download(k)
      return data
        ? {
            data: Buffer.from(await data.arrayBuffer()).toString('base64'),
            mime: 'image/jpeg',
          }
        : null
    }),
  )
  return all.filter((x): x is { data: string; mime: string } => !!x)
}
