// 외부 AI 사용 공용 관문(필수 과제 ③) — 음성→글(chunk)·번역(translate)·합성(tts)의 자격·계량을 한 곳에서 판정한다.
//  자격(개최자·ADMIN·활성 참가 등록 + LIVE)과 계량(분당·누적 상한)은 DB 함수 1왕복이 행 잠금 안에서 함께 본다(R-P5) — VC = fn_use_smn_vc(초, 동의 포함), TRANS·TTS = fn_use_smn_ai(글자).
//  통과면 null, 거절이면 그대로 돌려줄 NextResponse. 회의록 요약(notes end)은 계량 대상이 아니라 loadNote.manage(시작자·개최자·ADMIN) + 조건부 갱신(노트당 1회)이 관문
import 'server-only'
import type { NextResponse } from 'next/server'
import type { UserRow } from '@pi/db'
import { env } from '@/env'
import { apiError, db, dbFail } from './api'
import { isAdmin } from './auth'
import {
  engineAdminBase,
  MAX_REQ_PER_MIN,
  MAX_SEC_PER_MIN,
  speechMaxSec,
  stageAllowed,
  type StageInfo,
  usrMaxSec,
  vcUseError,
} from './speech-rules'
import { AI_LIMIT } from './translate-rules'

type ApiCode = Parameters<typeof apiError>[0]
export type SpeechKind = 'VC' | 'TRANS' | 'TTS'
// 대상 — 세미나 또는 대면 노트(대면 노트는 VC 만)
export type SpeechTarget = { smnId: string | null; ntId?: string | null }

// amount = VC 는 예약 초, TRANS·TTS 는 글자 수
export async function speechGate(t: SpeechTarget, user: UserRow, kind: SpeechKind, amount: number): Promise<NextResponse | null> {
  // 무료 개최자 세미나 = AI 제외(sql/015) — 계량보다 먼저(거절인데 계량되지 않게). 대부분 캐시 적중이라 직렬 비용 없음. 대면 노트(smnId 없음)는 대상 아님
  if (t.smnId) {
    const paid = await planAiOk(t.smnId)
    if (paid instanceof Error) return apiError('DB_UNAVAILABLE', 503)
    if (!paid) return apiError('PLAN_AI_PAID', 402)
  }
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

// 세미나 AI 허용(개최자 ADMIN 또는 유료 이용권) — 60초 캐시(5초 조각마다 묻지 않게, R-P2). 구매·소진은 최대 60초 늦게 반영.
const AI_TTL_MS = 60_000
const aiCache = new Map<string, { ok: boolean; at: number }>()
export async function planAiOk(smnId: string): Promise<boolean | Error> {
  const hit = aiCache.get(smnId)
  if (hit && Date.now() - hit.at < AI_TTL_MS) return hit.ok
  const { data, error } = await db().rpc('fn_chk_smn_plan_ai', { p_smn_id: smnId })
  if (error) {
    console.error('[speech] 요금제 AI 확인 실패', error.code)
    return new Error(error.code)
  }
  if (aiCache.size > 1000) aiCache.clear()
  aiCache.set(smnId, { ok: data === true, at: Date.now() })
  return data === true
}

// 무대 관문(D-1) — 세미나 음성 조각은 엔진 세션 역할이 presenter 이거나, panel 이면서 발표자가 방에 있을 때만(화면 speechOn 과 같은 규칙).
//  DB 는 무대 역할을 모르므로 역할 정본인 엔진 관리 API 에 묻는다(GET /admin/rooms/{smn}/peers/{usr}, 2초 제한 — R-P4).
//  결과는 10초 캐시(5초 조각마다 묻지 않게, R-P2) — 강등·발표자 퇴장은 최대 10초 늦게 반영된다.
//  ADMIN 은 묻지 않는다(발표자 입장권 발급 주체). 엔진 키·주소 미설정 = 확인 생략(DB 청중 몫 1/2 상한만, 경고 1회).
//  엔진 응답 실패 = 거절 503(fail-closed — 엔진이 죽으면 어차피 방도 없다)
const STAGE_TTL_MS = 10_000
const stageCache = new Map<string, { info: StageInfo; at: number }>()
let stageWarned = false

export async function stageGate(smnId: string, user: UserRow): Promise<NextResponse | null> {
  if (isAdmin(user)) return null
  const base = engineAdminBase(env.NEXT_PUBLIC_MEDIA_WS_URL)
  if (!base || !env.MEDIA_ADMIN_SECRET) {
    if (!stageWarned) console.warn('[speech] MEDIA_ADMIN_SECRET·엔진 주소 미설정 — 무대 확인 생략(D-1)')
    stageWarned = true
    return null
  }
  const key = `${smnId}:${user.id}`
  const now = Date.now()
  let hit = stageCache.get(key)
  if (!hit || now - hit.at > STAGE_TTL_MS) {
    const r = await fetch(`${base}/admin/rooms/${encodeURIComponent(smnId)}/peers/${encodeURIComponent(user.id)}`, {
      headers: { Authorization: `Bearer ${env.MEDIA_ADMIN_SECRET}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    }).catch(() => null)
    if (!r || (r.status !== 200 && r.status !== 404)) {
      console.error('[speech] 엔진 무대 확인 실패', r?.status ?? 'network')
      return apiError('AI_UNAVAILABLE', 503)
    }
    const info = r.status === 200 ? ((await r.json().catch(() => null)) as StageInfo) : null
    // ponytail: 인스턴스 메모리 캐시 — 1천 건 넘으면 통째로 비운다(서버리스 인스턴스 수명이 짧아 LRU 불필요)
    if (stageCache.size > 1_000) stageCache.clear()
    hit = { info, at: now }
    stageCache.set(key, hit)
  }
  return stageAllowed(hit.info) ? null : apiError('SPEECH_STAGE_ONLY', 403)
}
