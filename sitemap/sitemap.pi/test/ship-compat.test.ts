// ship-compat 판정·재시도 시험 — 실행 : pnpm test (Node 내장 테스트, 타입 제거 실행)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isNoShipCol,
  selectWithShip,
  stripShipCols,
} from '../src/lib/ship-compat.ts'

test('isNoShipCol : ship 칼럼 없음 오류만 true', () => {
  assert.equal(
    isNoShipCol({
      code: '42703',
      message: 'column site_mst.ship_cd does not exist',
    }),
    true,
  )
  assert.equal(
    isNoShipCol({
      code: 'PGRST204',
      message:
        "Could not find the 'ship_cd' column of 'site_mst' in the schema cache",
    }),
    true,
  )
  assert.equal(
    isNoShipCol({ message: 'column site_mst.ship_pay_dtm does not exist' }),
    true,
  )
  assert.equal(
    isNoShipCol({
      code: '42703',
      message: 'column site_mst.efct_cd does not exist',
    }),
    false,
  )
  assert.equal(
    isNoShipCol({ code: '23505', message: 'duplicate key value' }),
    false,
  )
  assert.equal(isNoShipCol({ code: 'PGRST116', message: 'ship_cd' }), false)
  assert.equal(isNoShipCol(null), false)
})

test('stripShipCols : ship 칼럼만 제거, 임베디드 조인 유지', () => {
  assert.equal(
    stripShipCols(
      'site_id, ship_cd, ship_pymnt_id, ship_pay_dtm, pi_pymnt!fk(pi_amt)',
    ),
    'site_id, pi_pymnt!fk(pi_amt)',
  )
})

test('selectWithShip : 칼럼 없음이면 1회 재시도 + ship=null, 이후 요청은 처음부터 생략', async () => {
  const calls: string[] = []
  const run = async (cols: string) => {
    calls.push(cols)
    return cols.includes('ship_')
      ? {
          data: null,
          error: {
            code: '42703',
            message: 'column site_mst.ship_cd does not exist',
          },
        }
      : { data: [{ site_id: 'a' }], error: null }
  }
  const r = await selectWithShip('site_id, ship_cd', run)
  assert.equal(r.shipOff, true)
  assert.deepEqual(r.data, [
    { ship_cd: null, ship_pymnt_id: null, ship_pay_dtm: null, site_id: 'a' },
  ])
  assert.deepEqual(calls, ['site_id, ship_cd', 'site_id'])
  await selectWithShip('site_id, ship_cd', run)
  assert.deepEqual(calls.slice(2), ['site_id'])
})
