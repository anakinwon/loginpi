// 역할 × 요금제 권한표 검사(2026-10-18 마스터 표) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, canAssign, effPerms, PLANS, ROLES, type Perm } from '../src/lib/roles.ts'

// 표 칸(권한 6 + 메뉴 4) — 역할별 ● (마스터 이미지 그대로)
const COLS = ['APPROVE', 'SELF_APPROVE', 'SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_MODEL', 'MENU_SET', 'MENU_BAN', 'MENU_CHK', 'MENU_ADM'] as const
const SET = ['MENU_SET', 'MENU_BAN', 'MENU_CHK', 'MENU_ADM'] as const // 설정 서브메뉴 4단(2026-10-19)
const M = ['MENU_SQL', 'MENU_STD', 'MENU_MODEL', ...SET] as const
const ROLE_WANT: Record<string, readonly string[]> = {
  SYS: COLS,
  DA: COLS,
  STD: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', ...M],
  MDL: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', ...M],
  QLT: ['REQUEST', 'CRUD', 'MENU_SQL', 'MENU_MODEL', ...SET],
  MIG: ['REQUEST', 'CRUD', 'MENU_SQL'],
  VIEWER: ['MENU_STD'],
}
const PLAN_WANT: Record<string, readonly string[]> = {
  FREE: ['MENU_STD'],
  P1: ['SETTINGS', 'CRUD', 'MENU_SQL', 'MENU_SET'],
  P2: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_SET', 'MENU_BAN'],
  P3: ['SETTINGS', 'BULK', 'REQUEST', 'CRUD', 'MENU_SQL', 'MENU_STD', 'MENU_MODEL', 'MENU_SET', 'MENU_BAN', 'MENU_CHK'],
  P4: COLS,
}

test('역할 7종 × 표 10칸 전수(요금제4 = 역할 그대로)', () => {
  for (const r of ROLES) for (const c of COLS) assert.equal(can(r, c), ROLE_WANT[r].includes(c), `${r} ${c}`)
})

test('역할 × 요금제 = 교집합 전수', () => {
  for (const r of ROLES)
    for (const p of PLANS) {
      const got = effPerms(r, p)
      for (const c of COLS) assert.equal(got.includes(c), ROLE_WANT[r].includes(c) && PLAN_WANT[p].includes(c), `${r} ${p} ${c}`)
      assert.ok(got.includes('VIEW'), `${r} ${p} VIEW`) // 멤버면 항상 조회
    }
})

test('파생 권한 — 메뉴·신청 조합, DB 접속 관리 = 승인 ∧ 설정', () => {
  const has = (r: string, p: string, x: Perm) => effPerms(r, p).includes(x)
  assert.ok(has('QLT', 'P4', 'MODEL_EDIT') && !has('QLT', 'P4', 'STD_REQ') && !has('QLT', 'P4', 'STD_VIEW')) // 품질 = 메뉴2 없음
  assert.ok(has('MDL', 'P2', 'STD_REQ') && !has('MDL', 'P2', 'MODEL_VIEW')) // 요금제2 = 모델 메뉴 없음
  assert.ok(has('MIG', 'P4', 'SQL_QUERY') && !has('MIG', 'P4', 'SET_VIEW'))
  assert.ok(has('DA', 'P4', 'DB_CONN_ADMIN') && has('DA', 'P4', 'DDL_APPROVE'))
  assert.ok(!has('MDL', 'P4', 'DB_CONN_ADMIN') && !has('STD', 'P4', 'DDL_APPROVE')) // 설정만 있고 승인 없음
  assert.ok(!has('DA', 'P3', 'APPROVE') && !has('DA', 'P3', 'DB_CONN_ADMIN')) // DA 라도 요금제3 = 승인 없음
  assert.deepEqual(effPerms('DA', 'FREE'), ['VIEW', 'MENU_STD', 'STD_VIEW']) // 무료 = 표준 조회만
})

test('설정 서브메뉴 × 요금제(마스터 표 2026-10-19) — 시스템담당자 기준 누적', () => {
  const sub = { SET_VIEW: '설정·이력', BAN_VIEW: '금칙어', BAN_EDIT: '금칙어 일괄등록', CHK_VIEW: '표준 점검·리버스', ADM_VIEW: '멤버·승인' } as const
  const want: Record<string, (keyof typeof sub)[]> = {
    FREE: [],
    P1: ['SET_VIEW'],
    P2: ['SET_VIEW', 'BAN_VIEW', 'BAN_EDIT'],
    P3: ['SET_VIEW', 'BAN_VIEW', 'BAN_EDIT', 'CHK_VIEW'],
    P4: ['SET_VIEW', 'BAN_VIEW', 'BAN_EDIT', 'CHK_VIEW', 'ADM_VIEW'],
  }
  for (const p of PLANS) for (const x of Object.keys(sub) as (keyof typeof sub)[]) assert.equal(effPerms('SYS', p).includes(x), want[p].includes(x), `${p} ${sub[x]}`)
  // 멤버 관리 = 멤버 메뉴 ∧ 설정 : 요금제1~3 은 설정이 있어도 멤버 관리 불가, 품질담당자(설정 없음)는 요금제4 라도 불가
  assert.ok(effPerms('SYS', 'P3').includes('SETTINGS') && !effPerms('SYS', 'P3').includes('MBR_ADMIN'))
  assert.ok(effPerms('SYS', 'P4').includes('MBR_ADMIN') && !effPerms('QLT', 'P4').includes('MBR_ADMIN'))
  // 금칙어 등록 = 금칙어 메뉴 ∧ 일괄등록 : 품질담당자(일괄 없음) 불가
  assert.ok(effPerms('STD', 'P2').includes('BAN_EDIT') && !effPerms('QLT', 'P4').includes('BAN_EDIT'))
})

test('요금제 미지정·이상 값 = FREE', () => {
  assert.deepEqual(effPerms('DA', null), effPerms('DA', 'FREE'))
  assert.deepEqual(effPerms('DA', 'P9'), effPerms('DA', 'FREE'))
})

test('구 역할 코드·빈 값 = 권한 없음', () => {
  for (const r of ['ADMIN', 'EDITOR', '', null, undefined]) {
    assert.equal(can(r, 'VIEW'), false)
    assert.deepEqual(effPerms(r, 'P4'), [])
  }
})

test('역할 지정 — 본인 역할 표 권한 안의 역할만, 설정 권한 필요', () => {
  assert.ok(canAssign('DA', 'SYS') && canAssign('SYS', 'DA') && canAssign('DA', 'VIEWER'))
  assert.ok(canAssign('MDL', 'STD') && canAssign('MDL', 'QLT') && canAssign('MDL', 'MIG') && canAssign('MDL', 'VIEWER'))
  assert.ok(!canAssign('MDL', 'DA') && !canAssign('STD', 'SYS')) // 상승 불가
  assert.ok(!canAssign('MDL', 'DA', 'MDL')) // DA 를 MDL 로 강등도 불가(현재 역할이 더 높음)
  assert.ok(!canAssign('QLT', 'VIEWER') && !canAssign('VIEWER', 'VIEWER')) // 설정 권한 없음
  assert.ok(!canAssign('DA', 'ADMIN') && !canAssign(null, 'MDL'))
})
