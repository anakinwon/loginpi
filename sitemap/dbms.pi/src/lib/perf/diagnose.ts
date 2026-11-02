// 느린 쿼리 '원인 진단' 순수 함수 — 수집 통계(최고·평균·호출·행·블록)와 쿼리문 모양으로 원인 → 조치 코드 목록을 낸다. 문구는 화면(perf.diag.<cd>)
//  값이 없는 입력(033 이전 max·034 이전 블록)은 그 규칙을 건너뜀. 시험 : node --test src/lib/perf/diagnose.test.mjs
//  이번 구간 호출 0(두 수집 사이 안 불림)이면 withCum 으로 누적치(통계 리셋 이후) 대체 — 최고값 1등 쿼리가 '원인 없음'으로 침묵하지 않게
import { THR } from '../monitor/signals.ts'
import type { QryCum } from './calc.ts'
import { isSelfQry, type SrcCd, type SrcConf } from './source.ts'

// 판정 기준값 — 바꾸면 화면 문구(perf.diag.*)도 함께 확인
export const DIAG = {
  slowMs: THR.slowMs, // 1회 최고 경고·위험 = 모니터링 보드 SLOW_SQL 기준 그대로
  spikeX: 5, // 최고 ≥ 평균 × 5 = 간헐 지연
  readPct: 10, // 디스크 읽기 비율(%) — 읽기 / (캐시 적중 + 읽기)
  minRead: 1000, // 디스크 읽기 블록 하한(8KB 블록 = 약 8MB) — 작은 쿼리의 비율 잡음 제외
  manyRows: 1000, // 1회당 행
}

export type DiagCd =
  | 'SELF_MON'
  | 'NO_MAX'
  | 'SLOW_EACH'
  | 'SPIKE'
  | 'DISK_READ'
  | 'TEMP_SPILL'
  | 'MANY_ROWS'
  | 'PGRST_EMBED'
  | 'OFFSET_PAGING'
export type DiagLvl = 'info' | 'warn' | 'risk'
export type Diag = { cd: DiagCd; lvl: DiagLvl; params: Record<string, number> }

export type DiagIn = {
  qryTxt: string | null
  calls: number
  totalMs: number
  meanMs: number
  maxMs: number | null
  rows: number
  blkHit?: number | null
  blkRead?: number | null
  tmpBlk?: number | null
  srcCd?: SrcCd | null
  srcConf?: SrcConf | null
}

// 진단 입력 고르기 — 구간 호출 0 + 누적 호출 있음이면 누적치로(cum = true, 화면 근거 줄에 '누적' 표기). 최고(maxMs)는 원래 누적 최고
export function withCum<T extends DiagIn & Partial<QryCum>>(
  r: T,
): T & { cum: boolean } {
  if (r.calls > 0 || !r.cumCalls) return { ...r, cum: false }
  return {
    ...r,
    cum: true,
    calls: r.cumCalls,
    meanMs: r.cumMeanMs ?? 0,
    totalMs: (r.cumMeanMs ?? 0) * r.cumCalls,
    rows: r.cumRows ?? 0,
    blkHit: r.cumBlkHit ?? null,
    blkRead: r.cumBlkRead ?? null,
    tmpBlk: r.cumTmpBlk ?? null,
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function diagnose(i: DiagIn): Diag[] {
  // 자체 수집(지문 또는 연결 API application_name 표본 확신 높음) — 고객 조치 없음, 다른 규칙은 우리 쪽 몫이라 보이지 않는다
  if (isSelfQry(i.qryTxt) || (i.srcCd === 'MONITOR' && i.srcConf === 'high'))
    return [{ cd: 'SELF_MON', lvl: 'info', params: {} }]
  const out: Diag[] = []
  const add = (cd: DiagCd, lvl: DiagLvl, params: Record<string, number> = {}) =>
    out.push({ cd, lvl, params })
  const called = i.calls > 0
  const mean = called ? i.meanMs : null
  if (i.maxMs == null) add('NO_MAX', 'info')
  else if (i.maxMs >= DIAG.slowMs[0] && mean != null) {
    const lvl: DiagLvl = i.maxMs >= DIAG.slowMs[1] ? 'risk' : 'warn'
    const spike = i.maxMs >= DIAG.spikeX * mean
    // 매번 느림 = 평균도 경고선 이상이거나, 최고가 평균의 5배 안(튀는 게 아니라 늘 그 근처)
    if (mean >= DIAG.slowMs[0] || !spike)
      add('SLOW_EACH', lvl, { max: r1(i.maxMs), mean: r1(mean) })
    if (spike)
      add('SPIKE', 'warn', {
        max: r1(i.maxMs),
        mean: r1(mean),
        x: r1(i.maxMs / Math.max(mean, 0.001)),
      })
  }
  const hit = i.blkHit ?? null
  const read = i.blkRead ?? null
  if (hit != null && read != null && read >= DIAG.minRead) {
    const pct = (read / Math.max(1, hit + read)) * 100
    if (pct >= DIAG.readPct) add('DISK_READ', 'warn', { pct: r1(pct), read })
  }
  if (i.tmpBlk != null && i.tmpBlk > 0)
    add('TEMP_SPILL', 'warn', {
      blk: i.tmpBlk,
      mb: r1((i.tmpBlk * 8) / 1024), // 8KB 블록(PostgreSQL 기본)
      perCall: called ? r1(i.tmpBlk / i.calls) : 0,
    })
  if (called && i.rows / i.calls >= DIAG.manyRows)
    add('MANY_ROWS', 'warn', { perCall: r1(i.rows / i.calls) })
  // 문장 모양 힌트 — 느린 쿼리에만(빠른 쿼리의 OFFSET·임베드는 소음)
  const slow = (i.maxMs ?? mean ?? 0) >= DIAG.slowMs[0]
  const txt = i.qryTxt ?? ''
  if (slow && /pgrst_source/i.test(txt) && /\binner\s+join\b/i.test(txt))
    add('PGRST_EMBED', 'info')
  if (slow && /\boffset\s+(\$\d+|\?|\d+)/i.test(txt))
    add('OFFSET_PAGING', 'info')
  return out
}
