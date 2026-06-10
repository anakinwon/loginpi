import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { broadcastToRoom } from './realtime-broadcast'
import { translateMessage, baseLang, LOCALE_CD_RE } from './chat-translate'

// PiTranslate™ 동시성 dedup (Phase 12 — TASK-092)
// 같은 (msgId, locale) 번역 요청이 동시에 여러 건 들어와도 번역 API는 1회만 호출된다.
// in-memory pending map은 서버 재시작 시 소멸 — msg_trans DB 캐시 + UPSERT가 보완.

export interface TranslationOutcome {
  transCont: string
  srcLangCd: string | null
  cached: boolean
}

const pending = new Map<string, Promise<TranslationOutcome>>()

export async function getOrTranslateMessage(params: {
  msgId: string
  roomId: string
  localeCd: string
  msgCont: string
}): Promise<TranslationOutcome> {
  const { msgId, roomId, localeCd, msgCont } = params
  const key = `${msgId}:${localeCd}`

  // 이미 진행 중인 번역이 있으면 그 Promise를 공유
  const inflight = pending.get(key)
  if (inflight) return inflight

  const job = (async (): Promise<TranslationOutcome> => {
    const supabase = getSupabaseAdmin()

    // 1. DB 캐시 확인 — 히트 시 번역 API 호출 없음
    const { data: cachedRow } = await supabase
      .from('msg_trans')
      .select('trans_cont')
      .eq('msg_id', msgId)
      .eq('locale_cd', localeCd)
      .eq('del_yn', 'N')
      .maybeSingle()

    if (cachedRow) {
      return { transCont: cachedRow.trans_cont as string, srcLangCd: null, cached: true }
    }

    // 2. Gemini Flash 번역 (실패 시 Claude Haiku fallback)
    const { translated, srcLangCd, modelVer } = await translateMessage(msgCont, localeCd)

    // 3. DB 캐시 저장 — 멀티 인스턴스 동시 번역 경합은 UPSERT로 흡수
    await supabase.from('msg_trans').upsert(
      {
        msg_id: msgId,
        locale_cd: localeCd,
        trans_cont: translated,
        model_ver: modelVer,
        regr_id: 'SYSTEM',
        modr_id: 'SYSTEM',
      },
      { onConflict: 'msg_id,locale_cd' },
    )

    // 4. 원본 언어 코드 기록 (최초 감지 1회만 — 이미 값 있으면 유지)
    if (srcLangCd) {
      await supabase
        .from('msg_msg')
        .update({ src_lang_cd: srcLangCd })
        .eq('msg_id', msgId)
        .is('src_lang_cd', null)
    }

    // 5. 같은 locale 선택 사용자 전원에게 실시간 전달
    await broadcastToRoom(roomId, 'msg_trans', {
      msg_id: msgId,
      locale_cd: localeCd,
      trans_cont: translated,
    })

    return { transCont: translated, srcLangCd, cached: false }
  })().finally(() => pending.delete(key))

  pending.set(key, job)
  return job
}

// 방 참가자들의 표시 언어 목록 (sys_user.display_locale_cd — 미설정 사용자는 제외)
export async function getDistinctRoomLocales(roomId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin()

  const { data: mbrs } = await supabase
    .from('msg_room_mbr')
    .select('usr_id')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')

  const usrIds = (mbrs ?? []).map((m: { usr_id: string }) => m.usr_id)
  if (usrIds.length === 0) return []

  const { data: users } = await supabase
    .from('sys_user')
    .select('display_locale_cd')
    .in('id', usrIds)
    .not('display_locale_cd', 'is', null)

  const locales = (users ?? [])
    .map((u: { display_locale_cd: string | null }) => u.display_locale_cd)
    .filter((cd): cd is string => !!cd && LOCALE_CD_RE.test(cd))

  return [...new Set(locales)]
}

// 메시지 전송 시 번역 큐 (TASK-094) — fire-and-forget으로 호출 (전송 응답을 막지 않음)
// 첫 번역에서 감지된 원본 언어와 같은 locale은 건너뛴다.
export async function queueRoomTranslations(params: {
  roomId: string
  msgId: string
  msgCont: string
}): Promise<void> {
  const { roomId, msgId, msgCont } = params

  const locales = await getDistinctRoomLocales(roomId)
  if (locales.length === 0) return

  let detectedSrcLang: string | null = null
  for (const localeCd of locales) {
    if (detectedSrcLang && baseLang(localeCd) === detectedSrcLang) continue
    try {
      const { srcLangCd } = await getOrTranslateMessage({ msgId, roomId, localeCd, msgCont })
      if (!detectedSrcLang && srcLangCd) detectedSrcLang = baseLang(srcLangCd)
    } catch (err) {
      console.error(`[chat-translate] 번역 큐 실패 msg:${msgId} locale:${localeCd}`, err)
    }
  }
}
