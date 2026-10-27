// sql/010 음성 사용량 선예약·환급·청중 몫 상한 — 실제 PostgreSQL(dev 스키마) 회귀 시험. 한 트랜잭션 안에서 010 을 올리고 시나리오를 돌린 뒤 ROLLBACK(흔적 0).
// 실행 : SEMINAR_DEV_DATABASE_URL=<pg url> node --test src/lib/vc-reserve.db.test.mjs (pnpm test 에선 env 가 없으면 건너뜀)
// 스키마 = SEMINAR_TEST_SCHEMA 또는 seminar_dev (008 이 적용돼 있어야 한다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.SEMINAR_DEV_DATABASE_URL
const SCHEMA = process.env.SEMINAR_TEST_SCHEMA ?? 'seminar_dev'
const SQL010 = readFileSync(
  join(import.meta.dirname, '../../sql/010_seminar_vc_reserve.sql'),
  'utf8',
).replace(/^(BEGIN|COMMIT);$/gm, '') // 바깥 트랜잭션(ROLLBACK)에 싣는다

test('sql/010 — 선예약·분당 판정·환급·청중 몫', { skip: !URL }, async () => {
  const { default: pg } = await import('pg')
  const c = new pg.Client({ connectionString: URL })
  await c.connect()
  try {
    await c.query('BEGIN')
    await c.query(
      `SET LOCAL search_path = ${pg.escapeIdentifier(SCHEMA)}, public`,
    )
    await c.query(SQL010)
    const u = (
      await c.query(
        `INSERT INTO sys_user (dsp_nm) SELECT 't' || g FROM generate_series(1, 4) g RETURNING usr_id`,
      )
    ).rows.map((r) => r.usr_id)
    const [hst, ...ptc] = u
    const smn = (
      await c.query(
        `INSERT INTO smn_mst (hst_usr_id, smn_nm, start_dtm, smn_sts_cd) VALUES ($1, 't', now(), 'LIVE') RETURNING smn_id`,
        [hst],
      )
    ).rows[0].smn_id
    for (const p of ptc)
      await c.query('INSERT INTO smn_ptc (smn_id, usr_id) VALUES ($1, $2)', [
        smn,
        p,
      ])
    for (const x of u)
      await c.query(
        `INSERT INTO smn_agr (usr_id, smn_id, agr_tp_cd, agr_ver_cd) VALUES ($1, $2, 'SPEECH_XFER', 't')`,
        [x, smn],
      )
    const use = async (usr, sec) =>
      (
        await c.query(
          'SELECT fn_use_smn_vc($1, NULL, $2, $3, 7200, 20, 70, 1800) AS r',
          [smn, usr, sec],
        )
      ).rows[0].r
    const row = async (usr) =>
      (
        await c.query(
          'SELECT vc_sec_cnt FROM smn_vc_use WHERE smn_id = $1 AND usr_id = $2',
          [smn, usr],
        )
      ).rows[0]?.vc_sec_cnt

    // 개최자 : 43 OK → 86 OK(43 < 70) → RATE(86 >= 70)
    assert.equal(await use(hst, 43), 'OK')
    assert.equal(await row(hst), 43)
    assert.equal(await use(hst, 43), 'OK')
    assert.equal(await row(hst), 86)
    assert.equal(await use(hst, 43), 'RATE')
    // 환급 38 → 48, 환급 뒤 분당 판정 다시 통과
    await c.query('SELECT fn_ref_smn_vc_sec($1, NULL, $2, 38)', [smn, hst])
    assert.equal(await row(hst), 48)
    // 환급이 남은 초보다 크면 아무 행도 고르지 않는다(0 미만 금지)
    await c.query('SELECT fn_ref_smn_vc_sec($1, NULL, $2, 999)', [smn, hst])
    assert.equal(await row(hst), 48)
    // 청중 2명 × 1800 → 세 번째 청중 QUOTA(청중 몫 3600 = 7200/2), 같은 상태에서 개최자 OK
    assert.equal(await use(ptc[0], 1800), 'OK')
    assert.equal(await use(ptc[1], 1800), 'OK')
    assert.equal(await use(ptc[2], 5), 'QUOTA')
    assert.equal(await use(hst, 5), 'OK')
    // 같은 분에 이미 1800초(>= 분당 70)를 예약한 청중은 RATE 가 먼저 걸린다
    assert.equal(await use(ptc[0], 1), 'RATE') // 이번 분 1800 >= 70 이 먼저
    // search_path 고정 유지(CREATE OR REPLACE 뒤 ALTER)
    const cfg = (
      await c.query(
        `SELECT p.proname, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1 AND p.proname IN ('fn_use_smn_vc', 'fn_ref_smn_vc_sec')`,
        [SCHEMA],
      )
    ).rows
    assert.equal(cfg.length, 2)
    for (const r of cfg)
      assert.ok(
        r.proconfig?.some((s) => s.startsWith('search_path=')),
        r.proname,
      )
  } finally {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
  }
})
