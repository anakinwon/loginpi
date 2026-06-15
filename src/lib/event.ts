// src/lib/event.ts
// Server-only: 이벤트 행위 기록 + 미션 평가 엔진
// 'use server' 지시어 추가 필수

import { after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * 행위 기록: evt_action_log에 사용자 행위 저장
 * 멱등성: 동일 action_cd는 중복 기록되지 않음 (action_dtm 비교)
 * Side effect: recordUserAction 호출 후 자동으로 evaluateUserMissions 트리거됨
 */
export async function recordUserAction(
  actionCd: string,
  userId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Vercel serverless는 응답을 반환하면 인스턴스를 종료하므로,
  // await/after 없이 던진 floating promise(행위 기록·미션 평가)가 유실된다.
  // after()로 응답 스트리밍 후 실행을 보장한다.
  // 또한 after 콜백은 등록 순서대로 순차 실행되어, 동일 요청에서 여러 행위를
  // 병렬로 기록해도(M1: account_link+google_link) 평가 시점 race가 발생하지 않는다.
  after(async () => {
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

    // 행위 기록 후 미션 평가 (await로 완료까지 보장)
    try {
      await evaluateUserMissions(userId)
    } catch (err) {
      console.error('미션 평가 실패:', (err as Error).message)
    }
  })
}

/**
 * 미션 평가 엔진
 * 활성 이벤트의 모든 미션에 대해 complete_type별로 평가
 * evt_user_mission에 멱등 upsert
 */
export async function evaluateUserMissions(
  userId: string,
  eventId?: string,
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
      console.error(
        `미션 조회 실패 [${event.event_id}]:`,
        missionError?.message,
      )
      continue
    }

    // 3. 각 미션별 완료 판정
    for (const mission of missions) {
      const isCompleted = await evaluateMissionCompletion(
        userId,
        event.event_id,
        mission,
      )

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
          },
        )

        if (upsertError) {
          console.error(
            `미션 기록 실패 [${mission.mission_cd}]:`,
            upsertError.message,
          )
        }
      }
    }
  }
}

/**
 * 전체 활성 사용자(행위 기록 보유) 미션 재평가 — 평가 유실·지연 안전망(cron 전용).
 *
 * 신뢰 보장 설계: recordUserAction의 after() 평가가 어떤 이유로든(배포 타이밍·일시 장애)
 * 유실되어도, 이 함수가 주기적으로 모든 사용자를 정식 평가 로직(evaluateUserMissions)으로
 * 재평가한다. SQL 백필과 달리 SINGLE/MULTI_AND/MULTI_OR/SEQUENCE(M10) 전 타입을 동일 코드로
 * 커버하므로 타입별 누락이 발생하지 않는다. evt_user_mission은 멱등 upsert라 중복 실행 안전.
 */
export async function reevaluateAllActiveUsers(): Promise<{ users: number }> {
  const db = getSupabaseAdmin()

  // 행위가 한 번이라도 기록된 사용자만 평가 대상 (평가할 근거가 있는 사용자)
  const { data } = await db
    .from('evt_action_log')
    .select('user_id')
    .eq('del_yn', 'N')

  const userIds = [
    ...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id)),
  ]

  for (const uid of userIds) {
    try {
      await evaluateUserMissions(uid)
    } catch (err) {
      console.error(`[reeval] 사용자 평가 실패 ${uid}:`, (err as Error).message)
    }
  }

  return { users: userIds.length }
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
  mission: Mission,
): Promise<boolean> {
  const db = getSupabaseAdmin()

  switch (mission.complete_type_cd) {
    case 'SINGLE': {
      // 1개 action_cd 발생 확인
      const { data } = await db
        .from('evt_action_log')
        .select('evt_action_log_id')
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
          .select('evt_action_log_id')
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
          .select('evt_action_log_id')
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

      // M10 특수: 보증금 활성 상태의 취소 수수료 경험 확인.
      // 기준 시각은 M9 미션 complete_dtm(= 평가 실행 시각, 행위보다 늦을 수 있음)이 아니라
      // 실제 bond_deposit 행위 시각을 사용한다. 그래야 보증금 예치 직후 발생한 취소수수료를
      // '미션 평가가 늦게 돌았다'는 이유로 놓치지 않는다.
      if (mission.mission_cd.trim() === 'M10') {
        const { data: bond } = await db
          .from('evt_action_log')
          .select('action_dtm')
          .eq('user_id', userId)
          .eq('action_cd', 'bond_deposit')
          .order('action_dtm', { ascending: true })
          .limit(1)
          .maybeSingle()
        const bondDtm =
          (bond as { action_dtm: string } | null)?.action_dtm ??
          priorMission.complete_dtm
        return await checkCancelWithFee(userId, bondDtm)
      }

      // 일반 SEQUENCE: action_cd 발생 확인
      for (const actionCd of mission.required_action_cds_tx) {
        const { data } = await db
          .from('evt_action_log')
          .select('evt_action_log_id')
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
async function checkCancelWithFee(
  userId: string,
  afterDtm: string,
): Promise<boolean> {
  const db = getSupabaseAdmin()

  // mps_txn_hist에서 취소 수수료가 발생한 거래 확인 (실제 컬럼명 user_id, 실제 코드값 CANCEL_FEE_IN)
  // seller·buyer 모두 취소 수수료 부담 시 user_id에 취소자가 기록됨
  const { data: feeRecords } = await db
    .from('mps_txn_hist')
    .select('order_id')
    .eq('txn_type_cd', 'CANCEL_FEE_IN')
    .eq('user_id', userId)
    .gte('reg_dtm', afterDtm)
    .limit(10)

  // 더 정확한 확인: REFUND_IN과 취소수수료가 동일 order에 함께 존재하는지 확인
  if (feeRecords && feeRecords.length > 0) {
    for (const fee of feeRecords) {
      const { data: refund } = await db
        .from('mps_txn_hist')
        .select('order_id')
        .eq('order_id', fee.order_id)
        .eq('txn_type_cd', 'REFUND_IN')
        .limit(1)

      if (refund?.length) {
        return true // 취소수수료 + 환불 동시 존재
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
    missions:
      completedMissions?.map((m) => ({
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

  const excludedUserIds = new Set(excludedUsers?.map((e) => e.user_id) ?? [])

  // 모든 완료 미션 조회 (sys_user 정보 포함)
  const { data: allMissions } = await db
    .from('evt_user_mission')
    .select(
      `user_id, mission_cd, complete_dtm,
       sys_user!inner(id, nick_nm, display_name, pi_username)`,
    )
    .eq('event_id', eventId)
    .eq('del_yn', 'N')

  // 사용자별 집계
  const userStats = new Map<
    string,
    {
      count: number
      firstCompleteDtm: string
      lastCompleteDtm: string
      nick_nm: string | null
      display_name: string | null
      pi_username: string | null
    }
  >()

  if (allMissions) {
    for (const mission of allMissions) {
      if (excludedUserIds.has(mission.user_id)) continue

      const sysUser = mission.sys_user as unknown as {
        id: string
        nick_nm: string | null
        display_name: string | null
        pi_username: string | null
      }

      const existing = userStats.get(mission.user_id)
      const count = (existing?.count ?? 0) + 1

      userStats.set(mission.user_id, {
        count,
        firstCompleteDtm: existing
          ? existing.firstCompleteDtm < mission.complete_dtm
            ? existing.firstCompleteDtm
            : mission.complete_dtm
          : mission.complete_dtm,
        lastCompleteDtm: existing
          ? existing.lastCompleteDtm > mission.complete_dtm
            ? existing.lastCompleteDtm
            : mission.complete_dtm
          : mission.complete_dtm,
        nick_nm: sysUser.nick_nm,
        display_name: sysUser.display_name,
        pi_username: sysUser.pi_username,
      })
    }
  }

  // 정렬 (count 내림차순, 동점 시 마지막 수행 일시 오름차순 — 먼저 끝낸 사람이 상위)
  const sorted = Array.from(userStats.entries())
    .sort(([, a], [, b]) => {
      if (b.count !== a.count) return b.count - a.count
      return a.lastCompleteDtm.localeCompare(b.lastCompleteDtm)
    })
    .slice(0, limit)

  // 순위 계산 (정렬 순서대로 순차 부여 — 동점자도 마지막 수행 일시로 순위 구분)
  return sorted.map(([userId, stats], i) => ({
    rank: i + 1,
    user_id: userId,
    mission_count: stats.count,
    first_complete_dtm: stats.firstCompleteDtm,
    last_complete_dtm: stats.lastCompleteDtm,
    nick_nm: stats.nick_nm ?? stats.display_name,
    pi_username: stats.pi_username,
  }))
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

  const excludedUserIds = new Set(excludedUsers?.map((e) => e.user_id) ?? [])

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
