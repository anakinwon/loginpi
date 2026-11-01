// 관문 보드 순수 평가 검사 — 실행 : node --test src/lib/monitor/signals.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRules,
  deltas,
  evalFast,
  evalSlow,
  evalUrl,
  FLOW_TOP,
  gaugeScale,
  levelsByBucket,
  lsnDiff,
  RADAR_AXES,
  RADAR_SAFE,
  radarScores,
  rateDead,
  rowLevels,
  SCORE,
  SIG_IDS,
  sigLevels,
  storageLimit,
  THR,
  TREE_SCHEMA_TOP,
  TREE_TBL_TOP,
  summarize,
  todo,
  worst,
} from './signals.ts'

const NOW = Date.parse('2026-11-01T12:00:30Z')
const ds = (o = {}) => ({
  ms: 100,
  xactCmt: 100000,
  xactRlbk: 100,
  blksHit: 990000,
  blksRead: 1000,
  cachePct: 99.9,
  deadlocks: 0,
  tempBytes: 0,
  dbSz: 1e9,
  statsReset: '2026-10-01T00:00:00Z',
  ...o,
})
const ver = (o = {}) => ({
  versionNum: 160000,
  inRecovery: false,
  startDtm: '2026-10-01T00:00:00Z',
  maxConn: 100,
  ...o,
})
const cb = (n, o = {}) =>
  Array.from({ length: n }, (_, k) => ({
    pid: k + 1,
    usename: 'app',
    appNm: 'app1',
    backendType: 'client backend',
    state: 'idle',
    waitType: null,
    xactStart: null,
    queryStart: null,
    runMs: 0,
    query: 'select 1',
    ...o,
  }))
const fast = (o = {}) =>
  evalFast({
    dbStats: ds(),
    activity: cb(10),
    version: ver(),
    locks: null,
    prev: null,
    now: NOW,
    ...o,
  })
const get = (sigs, id) => sigs.find((s) => s.id === id)
const snap = (bkt, o = {}) => ({
  bkt_dtm: bkt,
  stat_reset_dtm: '2026-10-01T00:00:00Z',
  sess_cnt: 10,
  actv_sess_cnt: 1,
  idle_tx_sess_cnt: 0,
  lock_wait_cnt: 0,
  long_qry_cnt: 0,
  max_run_ms: 0,
  max_idle_tx_ms: 0,
  xact_cmt_cnt: 0,
  xact_rlbk_cnt: 0,
  blks_hit_cnt: 0,
  blks_read_cnt: 0,
  dlck_cnt: 0,
  db_sz_byte: 1e9,
  max_conn_cnt: 100,
  ...o,
})

test('① CONN_USE 경계 69.9/70/85', () => {
  const lvl = (sess, max) =>
    get(
      fast({ activity: cb(sess), version: ver({ maxConn: max }) }).signals,
      'CONN_USE',
    ).lvl
  assert.equal(lvl(699, 1000), 'OK')
  assert.equal(lvl(70, 100), 'WARN')
  assert.equal(lvl(85, 100), 'RISK')
})

test('② AVAIL CONN_FAIL → RISK, 나머지 CONN_DOWN, cascade, 할 일 1건 / TIMEOUT 은 UNKNOWN', () => {
  const e = evalFast({
    dbStats: 'CONN_FAIL',
    activity: 'CONN_FAIL',
    version: 'CONN_FAIL',
    locks: null,
    prev: null,
    now: NOW,
  })
  assert.equal(get(e.signals, 'AVAIL').lvl, 'RISK')
  assert.ok(
    e.signals
      .filter((s) => s.id !== 'AVAIL')
      .every((s) => s.lvl === 'UNKNOWN' && s.reason === 'CONN_DOWN'),
  )
  assert.equal(summarize(e.signals).cascade, true)
  assert.deepEqual(
    todo(e.signals).items.map((s) => s.id),
    ['AVAIL'],
  )
  assert.equal(e.snap, null)
  const t = evalFast({
    dbStats: 'TIMEOUT',
    activity: cb(1),
    version: ver(),
    locks: null,
    prev: null,
    now: NOW,
  })
  assert.equal(get(t.signals, 'AVAIL').reason, 'LINK_TIMEOUT')
  assert.equal(get(t.signals, 'CONN_USE').lvl, 'OK') // activity 는 살아 있으면 판정
})

test('③ CACHE_HIT : prev 없음·reset 변경·음수·10분 초과 → 누적, Δ 정상 → live, 표본 부족 → UNKNOWN', () => {
  const c = (o) => get(fast(o).signals, 'CACHE_HIT')
  assert.equal(c({}).params.basis, 'stored')
  const prev = snap('2026-11-01T11:59:00Z', {
    blks_hit_cnt: 980000,
    blks_read_cnt: 500,
  }) // Δhit 10000 Δread 500
  const live = c({ prev })
  assert.equal(live.params.basis, 'live')
  assert.equal(live.value, 95.24)
  assert.equal(live.lvl, 'WARN')
  assert.equal(
    c({ prev: { ...prev, stat_reset_dtm: '2026-10-20T00:00:00Z' } }).params
      .basis,
    'stored',
  )
  assert.equal(
    c({ prev: { ...prev, blks_hit_cnt: 2e6 } }).params.basis,
    'stored',
  )
  assert.equal(
    c({ prev: { ...prev, bkt_dtm: '2026-11-01T11:40:00Z' } }).params.basis,
    'stored',
  )
  const x = c({ dbStats: ds({ blksHit: 5000, blksRead: 10 }) })
  assert.equal(x.lvl, 'UNKNOWN')
  assert.equal(x.reason, 'SAMPLE')
  // 오래된 prev 는 교착 Δ 도 버림
  const xe = get(
    fast({ prev: { ...prev, bkt_dtm: '2026-11-01T11:40:00Z', dlck_cnt: -5 } })
      .signals,
    'XACT_ERR',
  )
  assert.equal(xe.params.dlck, 0)
})

const slowIn = (o = {}) => ({
  topSql: [],
  tbl: [],
  idx: [],
  sizes: [],
  arc: {
    archivedCount: 1,
    lastArchivedTime: '2026-11-01T11:00:00Z',
    failedCount: 0,
    lastFailedTime: null,
    archiveMode: 'on',
  },
  repl: [],
  version: ver(),
  statsReset: '2026-10-01T00:00:00Z',
  dbSzByte: 1e9,
  summaryUrl: [],
  capacity: { points: [], limitByte: null, perDay: null, daysLeft: null },
  now: NOW,
  ...o,
})
const slow = (o) => evalSlow(slowIn(o)).signals

test('④ REPL : 0행 primary → NA, standby → NA, catchup → RISK', () => {
  assert.equal(get(slow({}), 'REPL').lvl, 'NA')
  assert.equal(
    get(slow({ version: ver({ inRecovery: true }) }), 'REPL').reason,
    'STANDBY',
  )
  const r = {
    appNm: 's1',
    state: 'catchup',
    sentLsn: '0/3000000',
    replayLsn: '0/1000000',
    replayLag: null,
  }
  assert.equal(get(slow({ repl: [r] }), 'REPL').lvl, 'RISK')
  assert.equal(
    get(
      slow({ repl: [{ ...r, state: 'streaming', replayLag: '00:00:06' }] }),
      'REPL',
    ).lvl,
    'WARN',
  )
})

test('⑤ BACKUP : off → RISK, 실패가 성공보다 뒤 → RISK, standby → NA', () => {
  const a = slowIn().arc
  assert.equal(get(slow({}), 'BACKUP').lvl, 'OK')
  assert.equal(
    get(slow({ arc: { ...a, archiveMode: 'off' } }), 'BACKUP').lvl,
    'RISK',
  )
  assert.equal(
    get(
      slow({ arc: { ...a, lastFailedTime: '2026-11-01T11:30:00Z' } }),
      'BACKUP',
    ).lvl,
    'RISK',
  )
  assert.equal(
    get(
      slow({ arc: { ...a, lastArchivedTime: '2026-10-30T00:00:00Z' } }),
      'BACKUP',
    ).lvl,
    'WARN',
  )
  assert.equal(
    get(slow({ version: ver({ inRecovery: true }) }), 'BACKUP').lvl,
    'NA',
  )
})

test('⑥ SLOW_SQL : PGSS·VER, calls<20·유틸 제외, share 합 1', () => {
  assert.equal(get(slow({ topSql: 'PGSS_MISSING' }), 'SLOW_SQL').reason, 'PGSS')
  assert.equal(
    get(slow({ topSql: [], version: ver({ versionNum: 120000 }) }), 'SLOW_SQL')
      .reason,
    'VER',
  )
  const q = (id, query, calls, totalMs) => ({
    queryid: id,
    query,
    calls,
    totalMs,
    meanMs: totalMs / calls,
  })
  const e = evalSlow(
    slowIn({
      topSql: [
        q('1', 'select a', 100, 100000),
        q('2', 'select b', 50, 5000),
        q('3', 'select c', 5, 99999),
        q('4', 'VACUUM t', 100, 999999),
      ],
    }),
  )
  assert.deepEqual(
    e.slowTop.map((r) => r.key),
    ['1', '2'],
  )
  assert.ok(Math.abs(e.slowTop.reduce((s, r) => s + r.share, 0) - 1) < 1e-9)
  assert.equal(get(e.signals, 'SLOW_SQL').lvl, 'WARN') // 평균 1000ms
  assert.equal(
    get(slow({ topSql: [q('3', 'select c', 5, 99999)] }), 'SLOW_SQL').lvl,
    'NA',
  )
})

test('⑦ worst 순서·summarize 설정성 사유 제외', () => {
  assert.equal(worst(['OK', 'UNKNOWN', 'WARN', 'NA']), 'WARN')
  assert.equal(worst(['OK', 'UNKNOWN', 'NA']), 'UNKNOWN')
  assert.equal(worst(['RISK', 'WARN']), 'RISK')
  assert.equal(worst(['NA']), 'NA')
  // 정상 DB + pg_stat_statements 없음 + 용량 한도 없음 → 전체 OK, 설정 2
  const sigs = [...fast().signals, ...slow({ topSql: 'PGSS_MISSING' })]
  const s = summarize(sigs)
  assert.equal(s.overall, 'OK')
  assert.equal(s.unknown, 0)
  assert.equal(s.setup, 2)
  assert.deepEqual(
    todo(sigs)
      .setup.map((x) => x.id)
      .sort(),
    ['SLOW_SQL', 'STORAGE'],
  )
})

test('⑧ todo 정렬(RISK→WARN, 범주 순)·limit·more', () => {
  const mk = (id, cat, lvl) => ({ id, cat, lvl, reason: null })
  const t = todo(
    [
      mk('STORAGE', 'store', 'RISK'),
      mk('CACHE_HIT', 'eff', 'WARN'),
      mk('BACKUP', 'protect', 'RISK'),
      mk('LONG_QRY', 'load', 'WARN'),
      mk('AVAIL', 'avail', 'OK'),
    ],
    3,
  )
  assert.deepEqual(
    t.items.map((s) => s.id),
    ['BACKUP', 'STORAGE', 'LONG_QRY'],
  )
  assert.equal(t.more, 1)
})

test('⑨ deltas : tps 계산, 10분 초과 간격·reset 변경 null', () => {
  const rows = [
    snap('2026-11-01T12:00:00Z', {
      xact_cmt_cnt: 1000,
      xact_rlbk_cnt: 0,
      blks_hit_cnt: 0,
      blks_read_cnt: 0,
    }),
    snap('2026-11-01T12:01:00Z', {
      xact_cmt_cnt: 1570,
      xact_rlbk_cnt: 30,
      blks_hit_cnt: 90,
      blks_read_cnt: 10,
    }),
    snap('2026-11-01T12:20:00Z', { xact_cmt_cnt: 2000, xact_rlbk_cnt: 30 }),
    snap('2026-11-01T12:21:00Z', {
      xact_cmt_cnt: 10,
      stat_reset_dtm: '2026-11-01T12:20:30Z',
    }),
  ]
  const d = deltas(rows)
  assert.equal(d[0].tps, null)
  assert.equal(d[1].tps, 10)
  assert.equal(d[1].rlbkPct, 5)
  assert.equal(d[1].cachePct, null) // 표본 1만 블록 미만
  const d2 = deltas([
    rows[0],
    snap('2026-11-01T12:01:00Z', {
      xact_cmt_cnt: 1001,
      xact_rlbk_cnt: 1,
      blks_hit_cnt: 18000,
      blks_read_cnt: 2000,
    }),
  ])
  assert.equal(d2[1].cachePct, 90)
  assert.equal(d2[1].rlbkPct, null) // 표본 100건 미만
  assert.equal(d[2].tps, null)
  assert.equal(d[3].tps, null)
})

test('⑩ levelsByBucket : 24시간 = 1시간 열 24개, 빈 열 NA, 구간 최악', () => {
  const now = Date.parse('2026-11-01T12:30:00Z')
  const h = levelsByBucket(
    [
      snap('2026-11-01T12:05:00Z', { lock_wait_cnt: 1 }),
      snap('2026-11-01T12:06:00Z', { lock_wait_cnt: 6 }),
    ],
    1440,
    now,
  )
  assert.equal(h.cols.length, 24)
  assert.equal(h.cols[23], '2026-11-01T12:00:00.000Z')
  assert.ok(!h.rows.includes('DLCK'))
  const li = h.rows.indexOf('LOCK_WAIT')
  assert.equal(h.cells[li][23], 'RISK')
  assert.equal(h.cells[li][0], 'NA')
  assert.equal(levelsByBucket([], 30, now).cols.length, 6)
})

test('⑪ lsnDiff', () => {
  assert.equal(lsnDiff('0/3000000', '0/1000000'), 0x2000000n)
  assert.equal(lsnDiff('1/0', '0/FFFFFFFF'), 1n)
})

test('⑫ STORAGE : 한도 없음 → OK + NO_LIMIT, 7일 → RISK / 한도 = GT·GE·이 접속만 최솟값', () => {
  const s0 = get(slow({}), 'STORAGE')
  assert.equal(s0.lvl, 'OK')
  assert.equal(s0.reason, 'NO_LIMIT')
  const s7 = get(
    slow({
      capacity: { points: [], limitByte: 2e9, perDay: 1e6, daysLeft: 7 },
    }),
    'STORAGE',
  )
  assert.equal(s7.lvl, 'RISK')
  const r = (ruleId, opCd, thrVal, connId = null, metricCd = 'DB_SIZE_MB') => ({
    ruleId,
    metricCd,
    opCd,
    thrVal,
    connId,
    useYn: 'Y',
  })
  assert.equal(
    storageLimit(
      [
        r('1', 'GT', 2000),
        r('2', 'GE', 1000, 'c1'),
        r('3', 'LT', 10),
        r('4', 'GT', 5, 'c2'),
      ],
      'c1',
    ),
    1000 * 1024 ** 2,
  )
  assert.equal(storageLimit([r('3', 'LT', 10)], 'c1'), null)
})

test('⑬ applyRules : 위반 → RISK·params.rule, 다른 접속 규칙 무시', () => {
  const e = fast()
  const r = (ruleId, metricCd, opCd, thrVal, connId = null) => ({
    ruleId,
    metricCd,
    opCd,
    thrVal,
    connId,
    useYn: 'Y',
  })
  const out = applyRules(e.signals, [r('1', 'DB_SESS_CNT', 'GT', 5, 'c2')], {
    connId: 'c1',
    vals: e.vals,
  })
  assert.equal(get(out, 'CONN_USE').lvl, 'OK')
  const out2 = applyRules(e.signals, [r('1', 'DB_SESS_CNT', 'GT', 5, 'c1')], {
    connId: 'c1',
    vals: e.vals,
  })
  assert.equal(get(out2, 'CONN_USE').lvl, 'RISK')
  assert.equal(get(out2, 'CONN_USE').params.rule, 'DB_SESS_CNT GT 5')
  const s = evalSlow(slowIn())
  const out3 = applyRules(s.signals, [r('2', 'DB_SIZE_MB', 'GT', 100)], {
    connId: 'c1',
    vals: s.vals,
  })
  assert.equal(get(out3, 'STORAGE').lvl, 'RISK')
})

test('URL : 점검 없음·오래됨은 실패 아님(STALE), 실패 → RISK, 사용 안 함 → NA', () => {
  const u = (o) => ({
    url: 'https://a',
    stsNo: 200,
    rspMs: 100,
    ok: true,
    chkCnt: 10,
    errCnt: 0,
    useYn: 'Y',
    lstDtm: '2026-11-01T11:59:00Z',
    ...o,
  })
  assert.equal(
    evalUrl([u({ stsNo: null, chkCnt: 0, lstDtm: null })], NOW).signal.reason,
    'STALE',
  )
  assert.equal(
    evalUrl([u({ lstDtm: '2026-11-01T11:00:00Z' })], NOW).signal.reason,
    'STALE',
  )
  assert.equal(
    evalUrl([u({ stsNo: 503 }), u({ stsNo: null, chkCnt: 0 })], NOW).signal
      .params.n,
    1,
  )
  assert.equal(evalUrl([u({ stsNo: 503 })], NOW).signal.lvl, 'RISK')
  assert.equal(evalUrl([u({ useYn: 'N' })], NOW).signal.lvl, 'NA')
  assert.equal(evalUrl('LINK_DOWN', NOW).signal.reason, 'LINK_LINK_DOWN')
})

test('LOCK_WAIT·IDLE_TX·스냅샷 값', () => {
  const act = [
    ...cb(2, { state: 'active', waitType: 'Lock', runMs: 40000 }),
    {
      ...cb(1)[0],
      pid: 9,
      state: 'idle in transaction',
      xactStart: '2026-11-01T11:50:00Z',
      queryStart: '2026-11-01T11:55:00Z',
      runMs: 300000,
    },
  ]
  const locks = [
    { pid: 1, granted: false, blockedBy: [9], relNm: 't' },
    { pid: 2, granted: false, blockedBy: [9], relNm: 't' },
  ]
  const e = fast({ activity: act, locks })
  assert.equal(get(e.signals, 'LOCK_WAIT').lvl, 'WARN') // 대기 2건 — 실행 40초는 락 대기 시간이 아니므로 판정에 안 씀
  assert.deepEqual(
    get(e.signals, 'LOCK_WAIT').top.map((t) => [t.key, t.value]),
    [['9', 2]],
  )
  assert.equal(get(e.signals, 'IDLE_TX').value, 600) // 5분 실행 + 5분 앞선 트랜잭션 시작
  assert.equal(get(e.signals, 'IDLE_TX').lvl, 'RISK')
  assert.equal(e.snap.lock_wait_cnt, 2)
  assert.equal(e.snap.max_idle_tx_ms, 600000)
  assert.equal(e.snap.rsp_ms, 100)
  assert.equal(e.snap.tmp_sz_byte, 0)
  assert.equal(fast({ activity: 'TIMEOUT' }).snap, null)
})

test('RADAR_AXES : 14개 신호가 정확히 한 축씩', () => {
  const all = Object.values(RADAR_AXES).flat()
  assert.equal(all.length, SIG_IDS.length)
  assert.deepEqual([...new Set(all)].sort(), [...SIG_IDS].sort())
})

test('radarScores : 최악 점수·평가 없음 null·안전선', () => {
  const by = (lv) => Object.fromEntries(radarScores(lv).map((p) => [p.axis, p]))
  const allOk = Object.fromEntries(SIG_IDS.map((id) => [id, 'OK']))
  assert.ok(radarScores(allOk).every((p) => p.score === SCORE.OK))
  const r = by({
    ...allOk,
    AVAIL: 'RISK',
    LONG_QRY: 'WARN',
    IDLE_TX: 'WARN',
    LOCK_WAIT: 'UNKNOWN',
    STORAGE: 'NA',
    BACKUP: 'UNKNOWN',
    REPL: 'WARN',
  })
  assert.equal(r.avail.score, SCORE.RISK) // OK + RISK
  assert.equal(r.sess.score, SCORE.WARN) // WARN 만
  assert.equal(r.lock.score, null)
  assert.equal(r.lock.lvl, 'NA')
  assert.equal(r.store.score, null)
  assert.equal(r.protect.score, SCORE.WARN) // UNKNOWN + WARN
  assert.equal(RADAR_SAFE, (SCORE.OK + SCORE.WARN) / 2)
  // 설정성 사유(STORAGE NO_LIMIT) 는 현재 레이더에서 빠짐
  const lv = sigLevels([...fast().signals, ...slow({})])
  assert.equal(lv.STORAGE, undefined)
  assert.equal(by(lv).store.score, null)
})

test('gaugeScale : THR 파생 구간', () => {
  const c = gaugeScale(get(fast().signals, 'CONN_USE').thr, 'pct')
  assert.equal(c.min, 0)
  assert.equal(c.max, 100)
  assert.equal(c.stops[0][0], THR.connPct[0] / 100)
  assert.deepEqual(
    c.stops.map((x) => x[1]),
    ['OK', 'WARN', 'RISK'],
  )
  const h = gaugeScale(get(fast().signals, 'CACHE_HIT').thr, 'pct')
  assert.equal(h.min, 2 * THR.cachePct[1] - THR.cachePct[0])
  assert.equal(h.max, 100)
  assert.deepEqual(
    h.stops.map((x) => x[1]),
    ['RISK', 'WARN', 'OK'],
  )
  assert.equal(h.stops[0][0], (THR.cachePct[1] - h.min) / (h.max - h.min))
  const a = gaugeScale(get(fast().signals, 'AVAIL').thr, 'ms')
  assert.equal(a.max, THR.rspMs[1] * 1.5)
  for (const g of [c, h, a]) assert.equal(g.stops.at(-1)[0], 1)
})

test('flow : 상위 접기·합계 보존·앱명 없음·락 대기·방향', () => {
  const act = Array.from({ length: 20 }, (_, k) =>
    cb(k + 1, {
      appNm: `app${String(k).padStart(2, '0')}`,
      usename: `u${k % 9}`,
    }),
  ).flat()
  const e = fast({ activity: act, version: ver({ maxConn: 1000 }) })
  const apps = e.flow.nodes.filter((n) => n.kind === 'app')
  assert.ok(apps.length <= FLOW_TOP + 1)
  assert.equal(apps.find((n) => n.id === 'a:*').fold, 20 - FLOW_TOP)
  assert.ok(
    e.flow.nodes.filter((n) => n.kind === 'user').length <= FLOW_TOP + 1,
  )
  const sum = (f) => e.flow.links.filter(f).reduce((s, l) => s + l.value, 0)
  assert.equal(
    sum((l) => l.source.startsWith('a:')),
    e.sessMix.total,
  )
  assert.equal(
    sum((l) => l.source.startsWith('u:')),
    e.sessMix.total,
  )
  assert.equal(e.sessMix.total, act.length)
  assert.ok(
    e.flow.links.every(
      (l) =>
        (l.source.startsWith('a:') && l.target.startsWith('u:')) ||
        (l.source.startsWith('u:') && l.target.startsWith('s:')),
    ),
  )
  const f2 = fast({
    activity: [
      ...cb(2, { appNm: '' }),
      ...cb(3, { appNm: null }),
      ...cb(2, { state: 'active', waitType: 'Lock' }),
      ...cb(1, { state: 'active' }),
      { ...cb(1)[0], backendType: 'autovacuum worker', appNm: 'bg' },
    ],
  }).flow
  const n = (id) => f2.nodes.find((x) => x.id === id)
  assert.equal(n('a:').value, 5)
  assert.equal(n('a:').label, '')
  assert.equal(n('s:lockWait').value, 2)
  assert.equal(n('s:active').value, 1)
  assert.equal(n('a:bg'), undefined) // 클라이언트 세션만
  assert.equal(n('s:idleTx'), undefined) // 값 0 상태 없음
  for (const a of [[], 'TIMEOUT']) {
    const f = fast({ activity: a }).flow
    assert.deepEqual([f.nodes, f.links], [[], []])
  }
})

test('tree : 접기·총량 보존·짝 없음 NA·VACUUM 과 같은 판정', () => {
  const sizes = []
  const tbl = []
  for (let s = 0; s < 10; s++)
    for (let k = 0; k < 15; k++) {
      sizes.push({
        schema: `s${s}`,
        rel: `t${k}`,
        tblSz: 1,
        idxSz: 1,
        toastSz: 0,
        totalSz: (s + 1) * 1000 + k,
      })
      if (k !== 12)
        tbl.push({
          schema: `s${s}`,
          rel: `t${k}`,
          seqScan: 0,
          seqTupRead: 0,
          idxScan: 0,
          liveTup: 1000,
          deadTup: k * 1000,
          modSinceAnalyze: 0,
          lastVacuum: '2026-11-01T00:00:00Z',
          lastAnalyze: '2026-11-01T00:00:00Z',
        })
    }
  const e = evalSlow(slowIn({ sizes, tbl }))
  const ns = e.tree.nodes
  assert.ok(ns.length <= TREE_SCHEMA_TOP + 1)
  assert.equal(ns.at(-1).fold, 10 - TREE_SCHEMA_TOP)
  for (const s of ns.filter((x) => x.children))
    assert.ok(s.children.length <= TREE_TBL_TOP + 1)
  const leaves = ns.flatMap((x) => x.children ?? [x])
  assert.equal(
    leaves.reduce((a, x) => a + x.value, 0),
    sizes.reduce((a, x) => a + x.totalSz, 0),
  )
  const top = ns[0] // 가장 큰 스키마 s9
  assert.equal(top.id, 's9')
  const t3 = top.children.find((x) => x.id === 's9.t12')
  assert.equal(t3.lvl, 'NA')
  assert.equal(t3.deadPct, null)
  const vac = get(e.signals, 'VACUUM').top
  let seen = 0
  for (const leaf of top.children.filter((x) => !x.fold && x.lvl !== 'NA')) {
    const row = tbl.find((t) => `${t.schema}.${t.rel}` === leaf.id)
    assert.equal(leaf.lvl, rateDead(row, NOW).lvl)
    const v = vac.find((x) => x.key === leaf.id)
    if (v) {
      assert.equal(v.lvl, leaf.lvl)
      seen++
    }
  }
  assert.ok(seen > 0)
  assert.ok(top.children.some((x) => x.lvl === 'RISK'))
  assert.deepEqual(evalSlow(slowIn({ sizes: 'TIMEOUT' })).tree.nodes, [])
})

test('rowLevels = levelsByBucket 칸(추출 동작 동일)', () => {
  const now = Date.parse('2026-11-01T12:30:00Z')
  const rows = [
    snap('2026-11-01T12:20:00Z', { blks_hit_cnt: 0, blks_read_cnt: 0 }),
    snap('2026-11-01T12:21:00Z', {
      sess_cnt: 90,
      blks_hit_cnt: 9000,
      blks_read_cnt: 1000,
    }),
  ]
  const lv = rowLevels(rows[0], rows[1])
  assert.equal(lv.CONN_USE, 'RISK')
  assert.equal(lv.CACHE_HIT, 'RISK')
  const h = levelsByBucket(rows, 30, now)
  assert.equal(h.cells[h.rows.indexOf('CONN_USE')][3], 'RISK') // 12:20·12:21 = 4번째 5분 칸
  assert.equal(h.cells[h.rows.indexOf('CACHE_HIT')][3], 'RISK')
})
