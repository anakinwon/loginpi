// 대면 노트 원본 음성·정밀 전사(STT PoC 1단계, 마스터 2026-10-29 : 원본 1일 보관·화자1·2·모델 3.5-flash — docs/STT_POC_2026-10-29.md 5절).
//  저장 : 비공개 버킷 smn-note 의 aud/<ntId>/<seq>-<노트 시작 뒤 ms>.<ext>(이름 규칙 note-rules audName) — DB 칼럼 없음.
//  정밀 전사(refineNote) : 종료 때 5분 창씩 전사 → 정밀 문장이 나온 시간대의 실시간 초안(spk_usr_id 있음)을 정밀 문장(spk_usr_id 없음, 남N·녀N)으로 바꾼다.
//   창이 실패·마감 초과·빈 결과면 그 시간대는 초안 그대로(기록 유실 0). 보관 정리(sweepAudio) : 종료 1일 지난·삭제된 노트의 원본을 지운다
// 사용 : import { refineNote, sweepAudio, removeAudio } from '@/lib/note-audio' (lib/notes finishNote · api/notes/[id] · api/notes/[id]/audio)
import 'server-only'
import { db } from './api'
import { PRECISE_TIMEOUT_MS, transcribeMeeting, type MeetRef } from './gemini'
import { AUD, audExpired, audWindows, callBudget, draftRanges, parseAudName, pickRef, spkName, type AudFile } from './note-rules'
import { aiMime, CHUNK_NOTE_MS } from './speech-rules'
import { NOTE_BUCKET, readSegs } from './notes'

const dir = (ntId: string) => `aud/${ntId}`
const bucket = () => db().storage.from(NOTE_BUCKET)

// 노트의 원본 파일 목록(이름 규칙에 맞는 것만)
export async function listAudio(ntId: string): Promise<AudFile[]> {
  // ponytail: 1000개(1분 파일 ≈ 16시간) 상한 1왕복 — 더 긴 노트는 offset 으로 이어 받기
  const { data, error } = await bucket().list(dir(ntId), { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  if (error) {
    console.error('[note-audio] 목록 실패', error.message)
    return []
  }
  return (data ?? []).flatMap((o) => parseAudName(o.name) ?? [])
}

// 노트 원본 전부 삭제 — 이름 규칙(parseAudName)을 거치지 않고 폴더 안 객체를 1000개씩 끝까지(정리가 이름 해석에 기대지 않게, 보안 검토)
export async function removeAudio(ntId: string) {
  for (;;) {
    const { data, error } = await bucket().list(dir(ntId), { limit: 1000 })
    if (error) return console.error('[note-audio] 삭제 목록 실패', ntId, error.message)
    if (!data?.length) return
    const { error: e2 } = await bucket().remove(data.map((o) => `${dir(ntId)}/${o.name}`))
    if (e2) return console.error('[note-audio] 삭제 실패', ntId, e2.message)
    if (data.length < 1000) return
  }
}

// 정밀 전사 — 종료(RECORDING → SUMMARIZING)에 이긴 요청 1건만 부른다(finishNote). 다시 만들기(FAILED)는 부르지 않는다(정밀 문장 중복 방지)
//  화자 남1~n·녀1~n 을 창이 달라도 같은 사람에게 같게 — 첫 창을 먼저 전사하고, 거기서 화자가 가장 많이 나온 1분 파일 + 라벨 전사를
//  기준(ref)으로 나머지 창에 같이 보낸다(나머지 창은 병렬). 창마다 정밀 문장만 넣고, 초안 지우기는 모든 창이 끝난 뒤 한 번에 —
//  정밀 문장이 실제로 나온 파일 구간만, 양끝을 안쪽으로 줄여서(note-rules draftRanges : 빠진 파일·부분 전사·실패한 이웃 창 경계의 초안은 남는다).
//  함수가 중간에 끊기면 초안과 정밀 문장이 겹쳐 남을 뿐 기록은 잃지 않는다
// ponytail: 기준 파일에 없던 새 목소리는 창끼리 같은 번호(예 남3)를 서로 다른 사람에게 줄 수 있고, 첫 창이 실패하면 기준 없이 창마다 번호를 매긴다
export async function refineNote(note: { nt_id: string; nt_nm: string; start_dtm: string }, usrId: string) {
  const files = await listAudio(note.nt_id)
  if (!files.length) return
  const t0 = Date.now()
  const base = Date.parse(note.start_dtm)
  // 앞 구간 문맥 = 그 창 직전까지의 초안 끝(창끼리 병렬이라 앞 창 정밀 결과는 기다리지 않는다)
  const drafts = await readSegs(note.nt_id, 3000, 'text')
  const draftRows = 'rows' in drafts ? drafts.rows : []
  const windows = audWindows(files)
  const hit = new Set<string>() // 정밀 문장을 넣은 파일 이름

  // 창 1개 전사·저장 — 성공하면 (전사 줄, 내려받은 음성) 을 돌려준다(첫 창의 기준 파일용). 실패·시간 부족·빈 결과 = null(그 창은 초안 유지)
  const run = async (w: AudFile[], ref: MeetRef | null) => {
    const ms = callBudget(Date.now() - t0, PRECISE_TIMEOUT_MS)
    if (!ms) return null
    const from = base + w[0].off
    const prev = draftRows
      .filter((r) => Date.parse(r.seg_dtm) < from)
      .map((r) => r.seg_cont ?? '')
      .join(' ')
      .slice(-300)
    const blobs = await Promise.all(w.map((f) => bucket().download(`${dir(note.nt_id)}/${f.name}`)))
    if (blobs.some((b) => !b.data)) return null
    // 형식은 실시간 경로와 같게(audio/mp4 → audio/m4a, speech-rules aiMime — iOS 원본)
    const audio = await Promise.all(
      blobs.map(async (b, i) => ({ data: Buffer.from(await b.data!.arrayBuffer()).toString('base64'), mime: aiMime(w[i].mime) ?? w[i].mime })),
    )
    const lines = await transcribeMeeting(audio, { title: note.nt_nm, prev, ref }, ms)
    if (!lines?.length) return null
    const { error } = await db()
      .from('smn_nt_seg')
      .insert(
        lines.map((l) => ({
          nt_id: note.nt_id,
          spk_usr_id: null,
          spk_nm: spkName(l.g, l.n),
          seg_cont: l.text,
          seg_dtm: new Date(base + w[l.f].off + Math.round(l.s * 1000)).toISOString(),
          regr_id: usrId,
          modr_id: usrId,
        })),
      )
    if (error) {
      console.error('[note-audio] 정밀 문장 저장 실패', error.code, error.message)
      return null
    }
    for (const l of lines) hit.add(w[l.f].name)
    return { lines, audio }
  }

  const [first, ...rest] = windows
  const r0 = await run(first, null)
  // 기준 = 첫 창에서 서로 다른 화자가 가장 많은 1분 파일 + 그 파일의 라벨 전사
  const rf = r0 ? pickRef(r0.lines) : null
  const ref: MeetRef | null =
    r0 && rf !== null
      ? { ...r0.audio[rf], lines: r0.lines.filter((l) => l.f === rf).map(({ s, g, n, text }) => ({ s, g, n, text })) }
      : null
  const queue = [...rest]
  const work = async () => {
    for (let w = queue.shift(); w; w = queue.shift()) await run(w, ref)
  }
  await Promise.all(Array.from({ length: AUD.par }, work))

  // 초안 지우기 — 정밀 문장이 나온 구간만(정밀 = spk_usr_id 없음이라 지우기에서 빠진다). 구간끼리 독립 → 병렬(R-P1)
  const now = new Date().toISOString()
  const ranges = draftRanges(files, hit, CHUNK_NOTE_MS)
  const res = await Promise.all(
    ranges.map(([a, b]) =>
      db()
        .from('smn_nt_seg')
        .update({ del_yn: 'Y', del_dtm: now, modr_id: usrId, mod_dtm: now })
        .eq('nt_id', note.nt_id)
        .eq('del_yn', 'N')
        .not('spk_usr_id', 'is', null)
        .not('seg_cont', 'is', null)
        .is('img_key', null)
        .gte('seg_dtm', new Date(base + a).toISOString())
        .lt('seg_dtm', new Date(base + b).toISOString()),
    ),
  )
  for (const r of res) if (r.error) console.error('[note-audio] 초안 정리 실패', r.error.code, r.error.message)
  console.info('[note-audio] 정밀 전사', note.nt_id, `파일 ${hit.size}/${files.length}`, `${Date.now() - t0}ms`)
}

// 보관 정리 — 종료 1일 지난·끝나지 않고 오래된(RECORDING 고착)·삭제된 노트의 원본 음성을 지운다.
//  매일 cron(api/cron/note-audio) + 노트 종료(finishNote) 때마다. 폴더 목록은 100개씩 끝까지 넘긴다
export async function sweepAudio() {
  const ids: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket().list('aud', { limit: 100, offset })
    if (error) return console.error('[note-audio] 정리 목록 실패', error.message)
    ids.push(...(data ?? []).map((o) => o.name).filter((n) => /^[0-9a-f-]{36}$/.test(n)))
    if ((data?.length ?? 0) < 100) break
  }
  if (!ids.length) return
  const { data: notes, error: e2 } = await db().from('smn_nt').select('nt_id, start_dtm, end_dtm, del_yn').in('nt_id', ids)
  if (e2) return console.error('[note-audio] 정리 조회 실패', e2.code)
  const now = Date.now()
  const known = new Map((notes ?? []).map((n) => [n.nt_id as string, n]))
  // 없는 노트(이름만 남음)·삭제·기한 지남 = 지움
  const gone = ids.filter((id) => {
    const n = known.get(id)
    return !n || n.del_yn === 'Y' || audExpired(n.end_dtm as string | null, n.start_dtm as string | null, now)
  })
  await Promise.all(gone.map(removeAudio))
  return gone.length
}
