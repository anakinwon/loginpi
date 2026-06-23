import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getTipPresets, updateTipPresets } from '@/lib/bean'

// 카페방 P2P 선물 프리셋 — GET은 공개(선물 버튼이 읽음), PUT은 관리자 전용.
// 서버 검증과 UI가 동일 출처(getTipPresets)를 읽어 불일치(=돈 입력 구멍)를 구조적으로 차단.

const MAX_TIP_BEAN = 1_000_000 // 단일 선물 상한 (오입력 방어)

// 현행 프리셋 조회 (공개)
export async function GET() {
  const presets = await getTipPresets()
  return NextResponse.json({ presets })
}

// 프리셋 변경 (관리자 전용)
export async function PUT(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { presets } = body as { presets?: unknown }
  if (!Array.isArray(presets) || presets.length !== 3) {
    return NextResponse.json(
      { error: '선물 금액 3개가 필요합니다' },
      { status: 400 },
    )
  }

  // 정수·양수·상한 검증 (Bean은 정수 전용)
  const vals = presets.map((v) => Number(v))
  for (const v of vals) {
    if (!Number.isInteger(v) || v <= 0 || v > MAX_TIP_BEAN) {
      return NextResponse.json(
        { error: `각 금액은 1~${MAX_TIP_BEAN.toLocaleString()} 사이 정수여야 합니다` },
        { status: 400 },
      )
    }
  }

  // 오름차순(중복 불가) — DB CHECK와 동일 규칙을 사전 검증해 친절한 메시지 제공
  if (!(vals[0] < vals[1] && vals[1] < vals[2])) {
    return NextResponse.json(
      { error: '금액은 오름차순(작은 값 → 큰 값)으로 서로 달라야 합니다' },
      { status: 400 },
    )
  }

  const result = await updateTipPresets(
    [vals[0], vals[1], vals[2]],
    requester!.id,
  )
  if (!result.ok) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, presets: vals })
}
