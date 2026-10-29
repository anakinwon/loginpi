// AI 회의록 서버 공용 — 열람 권한 확인(1왕복)·Storage 비공개 버킷 smn-note(없으면 만든다)·서명 URL.
// 회의록 끝내기·요약(finishNote)·1000행 넘는 조각 이어 읽기(readSegs).
// 사용 : import { loadNote, uploadShot, finishNote } from '@/lib/notes' (api/notes/* · api/speech/chunk · api/seminars/[id]/end)
import 'server-only'
import type { UserRow } from '@pi/db'
import { db } from './api'
import { isAdmin } from './auth'
import { MAX_SUMMARY_IMAGES, summarize } from './gemini'
import { refineNote, removeAudio, sweepAudio } from './note-audio'
import { hhmm } from './note-rules'

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
export const uploadShot = (path: string, bytes: Uint8Array) => uploadObj(path, bytes, 'image/jpeg')
// 비공개 버킷에 객체 1개(캡처·대면 노트 원본 음성). upsert = 같은 이름 다시 올리기 허용(원본 음성 재시도)
export async function uploadObj(path: string, bytes: Uint8Array, contentType: string, upsert = false) {
  const put = () =>
    db()
      .storage.from(NOTE_BUCKET)
      .upload(path, bytes, { contentType, upsert })
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

// 캡처 원본(요약 입력) — base64 + 캡처 시각(HH:MM, 요약이 캡처 위치를 말하게). 실패한 장은 건너뛴다
async function readShots(rows: SegRow[]) {
  const all = await Promise.all(
    rows.map(async (r) => {
      const { data } = await db()
        .storage.from(NOTE_BUCKET)
        .download(r.img_key as string)
      return data
        ? {
            data: Buffer.from(await data.arrayBuffer()).toString('base64'),
            mime: 'image/jpeg',
            at: hhmm(r.seg_dtm),
          }
        : null
    }),
  )
  return all.filter((x) => !!x)
}

// PostgREST 기본 응답 상한(1000행)에서 조용히 잘리지 않게 1000행씩 이어 받는다(BUILD_DEFECTS 72·138행).
//  max 까지만 모으고, 더 있으면 cut=true(호출부가 '이하 생략' 표시). 짧은 회의는 1왕복
export const PAGE_ROWS = 1000
export type SegRow = {
  seg_dtm: string
  spk_nm: string
  seg_cont: string | null
  img_key: string | null
}
export async function readSegs(
  ntId: string,
  max: number,
  only?: 'text' | 'shot',
): Promise<
  | { error: { code?: string; message?: string } }
  | { rows: SegRow[]; cut: boolean }
> {
  const rows: SegRow[] = []
  // max+1 행까지 읽어 '더 있음'을 안다
  while (rows.length <= max) {
    let q = db()
      .from('smn_nt_seg')
      .select('seg_dtm, spk_nm, seg_cont, img_key')
      .eq('nt_id', ntId)
      .eq('del_yn', 'N')
    if (only === 'text') q = q.not('seg_cont', 'is', null)
    if (only === 'shot') q = q.not('img_key', 'is', null)
    const from = rows.length
    const to = Math.min(from + PAGE_ROWS, max + 1) - 1
    const { data, error } = await q
      .order('seg_dtm')
      .order('seg_id')
      .range(from, to)
    if (error) return { error }
    rows.push(...((data ?? []) as SegRow[]))
    if ((data?.length ?? 0) < to - from + 1) break
  }
  return { rows: rows.slice(0, max), cut: rows.length > max }
}

export const MAX_SUMMARY_SEGS = 3000 // 요약 입력 조각 상한(5초 조각 약 4시간)
export const RETRY_GAP_MS = 60_000 // FAILED 다시 만들기 간격(외부 AI 호출 폭주 방지)

// 회의록 끝내기·요약 — RECORDING|FAILED → SUMMARIZING(조건부 갱신 — 이 갱신에 성공한 요청 1건만 요약, R-P5)
//  → 조각 글 + 캡처(최대 12장) → 외부 AI 요약 → DONE{smr_val} | FAILED.
//  api/notes/[id]/end(버튼·퇴장)와 api/seminars/[id]/end(세미나 종료 뒤 남은 기록 정리)가 같이 쓴다
export async function finishNote(
  ntId: string,
  from: 'RECORDING' | 'FAILED',
  usrId: string,
): Promise<
  { status: string } | { error: { code?: string; message?: string } }
> {
  const now = new Date()
  let up = db()
    .from('smn_nt')
    .update({
      nt_sts_cd: 'SUMMARIZING',
      ...(from === 'RECORDING' ? { end_dtm: now.toISOString() } : {}),
      modr_id: usrId,
      mod_dtm: now.toISOString(),
    })
    .eq('nt_id', ntId)
    .eq('nt_sts_cd', from)
    // 삭제된 회의록은 요약하지 않는다 — 권한 확인(loadNote)과 이 갱신 사이에 삭제되면 0행(지운 내용을 외부 AI 로 보내지 않게)
    .eq('del_yn', 'N')
  // 다시 만들기는 마지막 실패 1분 뒤부터 — 권한자가 되풀이해도 외부 AI 호출은 분당 1회
  if (from === 'FAILED')
    up = up.lt('mod_dtm', new Date(now.getTime() - RETRY_GAP_MS).toISOString())
  const { data: won, error: upErr } = await up.select('nt_id, nt_nm, start_dtm')
  if (upErr) return { error: upErr }
  if (!won?.length)
    return { status: from === 'FAILED' ? 'RETRY_SOON' : 'SUMMARIZING' }
  // 대면 노트 정밀 전사(원본 음성이 있을 때만, STT 1단계) — 끝낼 때 1회. 다시 만들기(FAILED)는 이미 바꾼 문장을 그대로 요약
  if (from === 'RECORDING') {
    await refineNote(won[0] as { nt_id: string; nt_nm: string; start_dtm: string }, usrId).catch((e) =>
      console.error('[notes] 정밀 전사 실패 — 초안으로 요약', e instanceof Error ? e.message : e),
    )
    // 정밀 전사(최대 240초) 중 삭제됐으면 — 그사이 넣은 정밀 문장도 논리삭제하고 원본을 지우며 요약하지 않는다(지운 내용을 외부 AI 로 보내지 않게).
    //  refineNote 가 모든 창을 기다린 뒤 돌아오므로 여기 1번이면 이후 새로 들어갈 문장이 없다
    const g = await db().from('smn_nt').select('del_yn').eq('nt_id', ntId).maybeSingle<{ del_yn: string }>()
    if (g.error) return { error: g.error }
    if (g.data?.del_yn !== 'N') {
      const at = new Date().toISOString()
      const { error } = await db()
        .from('smn_nt_seg')
        .update({ del_yn: 'Y', del_dtm: at, modr_id: usrId, mod_dtm: at })
        .eq('nt_id', ntId)
        .eq('del_yn', 'N')
      await removeAudio(ntId)
      return error ? { error } : { status: 'DELETED' }
    }
  }

  // 글 조각·캡처 키는 서로 독립 — 병렬(R-P1)
  const [t, s] = await Promise.all([
    readSegs(ntId, MAX_SUMMARY_SEGS, 'text'),
    readSegs(ntId, MAX_SUMMARY_IMAGES, 'shot'),
  ])
  // ponytail: 함수가 요약 중 죽으면(시간 초과) SUMMARIZING 에 남는다 — 화면은 2분 뒤 새로 고침 안내. 잦으면 mod_dtm 2분 지난 SUMMARIZING 도 다시 만들기 허용
  let smr: NoteRow['smr_val'] = null
  if ('rows' in t && 'rows' in s) {
    // 말한 내용이 없다 = 빈 요약(실패 아님)
    if (!t.rows.length) smr = { points: [], decisions: [], todos: [] }
    else {
      smr = await summarize(
        t.rows.map((x) => ({
          at: hhmm(x.seg_dtm),
          spk: x.spk_nm,
          text: x.seg_cont ?? '',
        })),
        await readShots(s.rows),
        t.cut,
      )
    }
  }
  const status = smr ? 'DONE' : 'FAILED'
  const { error } = await db()
    .from('smn_nt')
    .update({
      nt_sts_cd: status,
      smr_val: smr,
      modr_id: usrId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('nt_id', ntId)
    .eq('del_yn', 'N') // 요약 중 삭제되면 요약을 남기지 않는다
  // 원본 음성 보관 정리(종료 1일 지난·삭제된 노트) — 실패해도 요약 결과와 무관
  await sweepAudio().catch(() => {})
  return error ? { error } : { status }
}
