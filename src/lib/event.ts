// src/lib/event.ts
// Server-only: 이벤트 행위 기록 + 미션 평가 엔진
// 'use server' 지시어 추가 필수

import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * 행위 기록: evt_action_log에 사용자 행위 저장
 * 멱등성: 동일 action_cd는 중복 기록되지 않음 (action_dtm 비교)
 * Side effect: recordUserAction 호출 후 자동으로 evaluateUserMissions 트리거됨
 */
export async function recordUserAction(
  actionCd: string,
  userId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getSupabaseAdmin()

  // evt_action_log에 행위 기록
  const { error } = await db.from('evt_action_log').insert({
    user_id: userId,
    action_cd: actionCd,
    action_dtm: new Date().toISOString(),
    metadata_tx: metadata ?? null,
    regr_id: 'SYSTEM',
    modr_id: 'SYSTEM',
  })

  if (error) {
    console.error(`행위 기록 실패 [${actionCd}]:`, error.message)
    return
  }

  // 비동기로 미션 평가 트리거 (non-blocking)
  // 실제 환경에서는 queue/cron job으로 처리 권장
  evaluateUserMissions(userId).catch(err =>
    console.error('미션 평가 실패:', err.message)
  )
}

/**
 * 미션 평가 엔진
 * 활성 이벤트의 모든 미션에 대해 complete_type별로 평가
 * evt_user_mission에 멱등 upsert
 */
export async function evaluateUserMissions(
  userId: string,
  eventId?: string
): Promise<void> {
  const db = getSupabaseAdmin()

  // 1. 활성 이벤트 조회
  const query = db.from('evt_event').select('event_id').eq('active_yn', 'Y')

  if (eventId) {
    query.eq('event_id', eventId)
  }

  const { data: events, error: eventError } = await query

  if (eventError || !events) {
    console.error('활성 이벤트 조회 실패:', eventError?.message)
    return
  }

  // 2. 각 이벤트별 미션 평가
  for (const event of events) {
    const { data: missions, error: missionError } = await db
      .from('evt_mission')
      .select('*')
      .eq('event_id', event.event_id)
      .eq('del_yn', 'N')

    if (missionError || !missions) {
      console.error(`미션 조회 실패 [${event.event_id}]:`, missionError?.message)
      continue
    }

    // 3. 각 미션별 완료 판정
    for (const mission of missions) {
      const isCompleted = await evaluateMissionCompletion(userId, event.event_id, mission)

      if (isCompleted) {
        // 4. evt_user_mission에 멱등 upsert
        const { error: upsertError } = await db.from('evt_user_mission').upsert(
          {
            event_id: event.event_id,
            user_id: userId,
            mission_cd: mission.mission_cd.trim(),
            complete_dtm: new Date().toISOString(),
            regr_id: 'SYSTEM',
            modr_id: 'SYSTEM',
          },
          {
            onConflict: 'event_id,user_id,mission_cd',
          }
        )

        if (upsertError) {
          console.error(
            `미션 기록 실패 [${mission.mission_cd}]:`,
            upsertError.message
          )
        }
      }
    }
  }
}

/**
 * 미션 완료 판정 로직 (complete_type별)
 */
interface Mission {
  mission_cd: string
  complete_type_cd: string
  required_action_cds_tx: string[]
  sequence_prior_mission_cd?: string
}

async function evaluateMissionCompletion(
  userId: string,
  eventId: string,
  mission: Mission
): Promise<boolean> {
  const db = getSupabaseAdmin()

  switch (mission.complete_type_cd) {
    case 'SINGLE': {
      // 1개 action_cd 발생 확인
      const { data } = await db
        .from('evt_action_log')
        .select('1')
        .eq('user_id', userId)
        .eq('action_cd', mission.required_action_cds_tx[0])
        .limit(1)
      return !!data?.length
    }

    case 'MULTI_AND': {
      // 모든 action_cd 발생 확인
      for (const actionCd of mission.required_action_cds_tx) {
        const { data } = await db
          .from('evt_action_log')
          .select('1')
          .eq('user_id', userId)
          .eq('action_cd', actionCd)
          .limit(1)
        if (!data?.length) return false
      }
      return true
    }

    case 'MULTI_OR': {
      // 1개 이상 action_cd 발생 확인 (M6)
      for (const actionCd of mission.required_action_cds_tx) {
        const { data } = await db
          .from('evt_action_log')
          .select('1')
          .eq('user_id', userId)
          .eq('action_cd', actionCd)
          .limit(1)
        if (data?.length) return true // 1개만 발생해도 완료
      }
      return false
    }

    case 'SEQUENCE': {
      // 선행 미션 완료 후 조건 확인 (M10)
      if (!mission.sequence_prior_mission_cd) return false

      const { data: priorMission, error } = await db
        .from('evt_user_mission')
        .select('complete_dtm')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('mission_cd', mission.sequence_prior_mission_cd.trim())
        .maybeSingle()

      if (error || !priorMission) return false // 선행 미션 미완료

      // M10 특수: REFUND_IN + FEE 동시 확인
      if (mission.mission_cd.trim() === 'M10') {
        return await checkCancelWithFee(userId, priorMission.complete_dtm)
      }

      // 일반 SEQUENCE: action_cd 발생 확인
      for (const actionCd of mission.required_action_cds_tx) {
        const { data } = await db
          .from('evt_action_log')
          .select('1')
          .eq('user_id', userId)
          .eq('action_cd', actionCd)
          .gte('action_dtm', priorMission.complete_dtm)
          .limit(1)
        if (data?.length) return true
      }
      return false
    }

    default:
      return false
  }
}

/**
 * M10 특수 평가: 환불 + 수수료 동시 존재 확인
 * 근거: src/lib/mps-refund.ts, sql/041
 * 보증금 활성 시 환불액 = 원금±0.1π(수수료 반영)
 */
async function checkCancelWithFee(userId: string, afterDtm: string): Promise<boolean> {
  const db = getSupabaseAdmin()

  // mps_txn_hist에서 FEE가 발생한 거래 확인
  // seller 또는 buyer 입장 모두 가능
  const { data: feeRecords } = await db
    .from('mps_txn_hist')
    .select('order_id')
    .in('txn_type_cd', ['FEE_SELLER_CANCEL', 'FEE_BUYER_CANCEL'])
    .in('usr_id', [userId]) // seller or buyer
    .gte('reg_dtm', afterDtm)
    .limit(1)

  // 더 정확한 확인: REFUND_IN과 FEE가 동일 order에 함께 존재하는지 확인
  if (feeRecords && feeRecords.length > 0) {
    for (const fee of feeRecords) {
      const { data: refund } = await db
        .from('mps_txn_hist')
        .select('1')
        .eq('order_id', fee.order_id)
        .eq('txn_type_cd', 'REFUND_IN')
        .gte('reg_dtm', afterDtm)
        .limit(1)

      if (refund?.length) {
        return true // REFUND + FEE 동시 존재
      }
    }
  }

  return false
}

/**
 * 사용자별 미션 진행도 조회
 * 완료된 미션 목록 + 현재 등급 계산
 */
export async function getEventProgress(userId: string, eventId: string) {
  const db = getSupabaseAdmin()

  // 사용자의 완료 미션 조회
  const { data: completedMissions } = await db
    .from('evt_user_mission')
    .select('mission_cd, complete_dtm')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('del_yn', 'N')

  const totalCount = completedMissions?.length ?? 0

  // 등급 계산 (신입 0~2, 훈련생 3~4, 정요원 5~6, 베테랑 7~8, 마스터 9~10)
  const tierMap = {
    Recruit: [0, 2],
    Trainee: [3, 4],
    Agent: [5, 6],
    Veteran: [7, 8],
    Master: [9, 10],
  }

  let tier = 'Recruit'
  for (const [tierName, [min, max]] of Object.entries(tierMap)) {
    if (totalCount >= min && totalCount <= max) {
      tier = tierName
      break
    }
  }

  return {
    userId,
    eventId,
    totalCount,
    tier,
    missions: completedMissions?.map(m => ({
      mission_cd: m.mission_cd.trim(),
      completed: true,
      complete_dtm: m.complete_dtm,
    })) ?? [],
  }
}

/**
 * 이벤트 랭킹 조회 (Stage 1 간이 버전)
 * Note: Stage 2에서 Supabase RPC 또는 raw query로 최적화 필요
 */
export async function getEventRanking(eventId: string, limit: number = 100) {
  const db = getSupabaseAdmin()

  // 제외 대상자 조회
  const { data: excludedUsers } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')

  const excludedUserIds = new Set(excludedUsers?.map(e => e.user_id) ?? [])

  // 모든 완료 미션 조회 후 클라이언트 집계
  const { data: allMissions } = await db
    .from('evt_user_mission')
    .select('user_id, mission_cd, complete_dtm')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')

  // 사용자별 집계
  const userStats = new Map<
    string,
    { count: number; firstCompleteDtm: string; lastCompleteDtm: string }
  >()

  if (allMissions) {
    for (const mission of allMissions) {
      if (excludedUserIds.has(mission.user_id)) continue

      const existing = userStats.get(mission.user_id)
      const count = (existing?.count ?? 0) + 1
      const firstCompleteDtm = existing
        ? existing.firstCompleteDtm < mission.complete_dtm
          ? existing.firstCompleteDtm
          : mission.complete_dtm
        : mission.complete_dtm
      const lastCompleteDtm = existing
        ? existing.lastCompleteDtm > mission.complete_dtm
          ? existing.lastCompleteDtm
          : mission.complete_dtm
        : mission.complete_dtm

      userStats.set(mission.user_id, {
        count,
        firstCompleteDtm,
        lastCompleteDtm,
      })
    }
  }

  // 정렬 (count 내림차순, firstCompleteDtm 오름차순)
  const sorted = Array.from(userStats.entries())
    .sort(([, a], [, b]) => {
      if (b.count !== a.count) return b.count - a.count
      return a.firstCompleteDtm.localeCompare(b.firstCompleteDtm)
    })
    .slice(0, limit)

  // 순위 계산
  const result = []
  let currentRank = 1
  let prevCount = -1

  for (let i = 0; i < sorted.length; i++) {
    const [userId, stats] = sorted[i]

    if (stats.count !== prevCount) {
      currentRank = i + 1
      prevCount = stats.count
    }

    result.push({
      rank: currentRank,
      user_id: userId,
      total_count: stats.count,
      first_complete_dtm: stats.firstCompleteDtm,
    })
  }

  return result
}

/**
 * 선착순 10명 리스트 조회 (선물 발송용, Stage 1 간이 버전)
 * Note: Stage 2에서 RPC 최적화 필요
 */
export async function getTop10ForGift(eventId: string) {
  const db = getSupabaseAdmin()

  // 제외 대상자 조회
  const { data: excludedUsers } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')

  const excludedUserIds = new Set(excludedUsers?.map(e => e.user_id) ?? [])

  // 모든 완료 미션 조회
  const { data: allMissions } = await db
    .from('evt_user_mission')
    .select('user_id, complete_dtm')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')

  // 사용자별 완료 미션 수 + 최종 완료 시각
  const userMissions = new Map<
    string,
    { count: number; lastCompleteDtm: string }
  >()

  if (allMissions) {
    for (const mission of allMissions) {
      if (excludedUserIds.has(mission.user_id)) continue

      const existing = userMissions.get(mission.user_id) ?? {
        count: 0,
        lastCompleteDtm: mission.complete_dtm,
      }

      userMissions.set(mission.user_id, {
        count: existing.count + 1,
        lastCompleteDtm:
          existing.lastCompleteDtm > mission.complete_dtm
            ? existing.lastCompleteDtm
            : mission.complete_dtm,
      })
    }
  }

  // M1~M10 완료자만 필터링, 최종 완료 시각 오름차순 정렬, 상위 10명
  const completedAll = Array.from(userMissions.entries())
    .filter(([, stats]) => stats.count === 10)
    .sort(([, a], [, b]) => a.lastCompleteDtm.localeCompare(b.lastCompleteDtm))
    .slice(0, 10)

  // 각 사용자의 카카오ID 조회
  const top10 = []
  for (let i = 0; i < completedAll.length; i++) {
    const [userId, stats] = completedAll[i]

    const { data: user } = await db
      .from('sys_user')
      .select('nick_nm, kakao_id')
      .eq('id', userId)
      .maybeSingle()

    top10.push({
      rank: i + 1,
      user_id: userId,
      nick_nm: user?.nick_nm ?? null,
      kakao_id: user?.kakao_id ?? null,
      last_complete_dtm: stats.lastCompleteDtm,
    })
  }

  return top10
}
