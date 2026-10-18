// 역할 권한표 검사(R&R 2026-10-15) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, ROLES, type Perm } from '../src/lib/roles.ts'

// 역할별 기대 권한(VIEW·REQUEST·APPROVE·SELF_APPROVE·BULK·SETTINGS) : 즉시 승인은 DA만
const WANT: Record<string, Perm[]> = {
  SYS: ['VIEW', 'SETTINGS'],
  DA: ['VIEW', 'REQUEST', 'APPROVE', 'SELF_APPROVE', 'BULK', 'SETTINGS', 'DDL_APPROVE', 'DB_CONN_ADMIN'],
  STD: ['VIEW', 'REQUEST', 'APPROVE', 'BULK'],
  MDL: ['VIEW', 'REQUEST'],
  QLT: ['VIEW'],
  MIG: ['VIEW'],
  VIEWER: ['VIEW'],
}

test('역할 7종 × 권한 8종 전수', () => {
  const perms: Perm[] = ['VIEW', 'REQUEST', 'APPROVE', 'SELF_APPROVE', 'BULK', 'SETTINGS', 'DDL_APPROVE', 'DB_CONN_ADMIN']
  for (const r of ROLES) for (const p of perms) assert.equal(can(r, p), WANT[r].includes(p), `${r} ${p}`)
})

test('구 역할 코드·빈 값은 권한 없음', () => {
  for (const r of ['ADMIN', 'EDITOR', '', null, undefined]) assert.equal(can(r, 'VIEW'), false)
})
