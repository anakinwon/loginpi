// 외부 AI 사용 공용 관문(필수 과제 ③) — 음성→글(chunk)·번역(translate)·합성(tts)의 자격·계량을 한 곳에서 판정한다.
//  자격(개최자·ADMIN·활성 참가 등록 + LIVE)과 계량(분당·누적 상한)은 DB 함수 1왕복이 행 잠금 안에서 함께 본다(R-P5) — VC = fn_use_smn_vc(초, 동의 포함), TRANS·TTS = fn_use_smn_ai(글자).
//  통과면 null, 거절이면 그대로 돌려줄 NextResponse. 회의록 요약(notes end)은 계량 대상이 아니라 loadNote.manage(시작자·개최자·ADMIN) + 조건부 갱신(노트당 1회)이 관문
import 'server-only'
import type { NextResponse } from 'next/server'
import type { UserRow } from '@pi/db'
import { env } from '@/env'
import { apiError, db, dbFail } from './api'
import { MAX_REQ_PER_MIN, MAX_SEC_PER_MIN, speechMaxSec, usrMaxSec, vcUseError } from './speech-rules'
import { AI_LIMIT } from './translate-rules'

type ApiCode = Parameters<typeof apiError>[0]
export type SpeechKind = 'VC' | 'TRANS' | 'TTS'
// 대상 — 세미나 또는 대면 노트(대면 노트는 VC 만)
export type SpeechTarget = { smnId: string | null; ntId?: string | null }

// amount = VC 는 예약 초, TRANS·TTS 는 글자 수
export async function speechGate(t: SpeechTarget, user: UserRow, kind: SpeechKind, amount: number): Promise<NextResponse | null> {
  let q
  if (kind === 'VC') {
    const maxSec = speechMaxSec(env.SPEECH_MAX_MIN)
    q = db().rpc('fn_use_smn_vc', {
      p_smn_id: t.smnId,
      p_nt_id: t.ntId ?? null,
      p_usr_id: user.id,
      p_sec: amount,
      p_max_sec: maxSec,
      p_max_req: MAX_REQ_PER_MIN,
      p_max_min_sec: MAX_SEC_PER_MIN,
      p_max_usr_sec: usrMaxSec(maxSec),
    })
  } else {
    if (!t.smnId) return apiError('INVALID_INPUT', 400)
    q = db().rpc('fn_use_smn_ai', {
      p_smn_id: t.smnId,
      p_usr_id: user.id,
      p_kind: kind,
      p_chr: amount,
      p_max_chr: AI_LIMIT[kind].maxChr,
      p_max_min_chr: AI_LIMIT[kind].maxMinChr,
    })
  }
  const { data, error } = await q
  if (error) return dbFail(error)
  const e = vcUseError(data as string | null)
  return e ? apiError(e.code as ApiCode, e.status) : null
}
