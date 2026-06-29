import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getTipPresets, updateTipPresets } from '@/lib/bean'

// 카페방 P2P 선물 설정 — GET은 공개(선물 버튼이 읽음), PUT은 관리자 전용.
// 고정 프리셋 3종 + 직접입력 상한(프리셋 4). 서버 검증과 UI가 동일 출처(getTipPresets)를 읽어
// 불일치(=돈 입력 구멍)를 구조적으로 차단.

const HARD_MAX_BEAN = 1_000_000 // 직접입력 상한이 가질 수 있는 절대 한도(오입력 방어)

// 현행 설정 조회 (공개)
export async function GET() {
  const cfg = await getTipPresets()
  return NextResponse.json(cfg)
}

// 설정 변경 (관리자 전용)
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

  const { presets, customMax } = body as {
    presets?: unknown
    customMax?: unknown
  }
  if (!Array.isArray(presets) || presets.length !== 3) {
    return NextResponse.json(
      { error: '고정 프리셋 3개가 필요합니다' },
      { status: 400 },
    )
  }

  // 정수·양수·상한 검증 (Bean은 정수 전용)
  const vals = presets.map((v) => Number(v))
  const maxVal = Number(customMax)
  const all = [...vals, maxVal]
  for (const v of all) {
    if (!Number.isInteger(v) || v <= 0 || v > HARD_MAX_BEAN) {
      return NextResponse.json(
        {
          error: `각 값은 1~${HARD_MAX_BEAN.toLocaleString()} 사이 정수여야 합니다`,
        },
        { status: 400 },
      )
    }
  }

  // 고정 프리셋은 오름차순(중복 불가, DB CHECK와 동일)
  if (!(vals[0] < vals[1] && vals[1] < vals[2])) {
    return NextResponse.json(
      {
        error: '고정 프리셋은 오름차순(작은 값 → 큰 값)으로 서로 달라야 합니다',
      },
      { status: 400 },
    )
  }

  // 직접입력 상한은 최대 고정 프리셋 이상이어야 한다(직접입력이 버튼보다 작으면 모순)
  if (maxVal < vals[2]) {
    return NextResponse.json(
      { error: '직접입력 상한은 가장 큰 고정 프리셋 이상이어야 합니다' },
      { status: 400 },
    )
  }

  const result = await updateTipPresets(
    [vals[0], vals[1], vals[2]],
    maxVal,
    requester!.id,
  )
  if (!result.ok) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, presets: vals, customMax: maxVal })
}
