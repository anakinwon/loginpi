// 워프 우주선 칼럼(sql/020) 미적용 DB 호환 — site_mst.ship_* 가 없으면 ship 칼럼을 뺀 쿼리로 1회 재시도하고 ship 값은 null(기본 SAUCER)로 채운다
// 판정은 인스턴스 메모리에 5분 기억(R-P2 — 이후 요청은 처음부터 ship 없이), 만료 뒤 다시 시도하므로 020 적용 시 자동으로 켜진다
// 사용 : selectWithShip(COLS, (cols, off) => db().from('site_mst').select(cols)...) — 쓰기는 off 일 때 omitShip(payload)

const SHIP_COLS = ['ship_cd', 'ship_pymnt_id', 'ship_pay_dtm'] as const
const SHIP_COL_RE = /\bship_(?:cd|pymnt_id|pay_dtm)\b/
const NO_SHIP_TTL_MS = 5 * 60_000

type DbError = { code?: string; message?: string } | null | undefined
type Res = { data: unknown; error: DbError }

// 칼럼 없음 오류 — select = Postgres 42703(undefined_column), insert·update 본문 = PostgREST PGRST204(schema cache), 메시지에 ship 칼럼명
export const isNoShipCol = (e: DbError): boolean =>
  !!e &&
  SHIP_COL_RE.test(e.message ?? '') &&
  (e.code === '42703' ||
    e.code === 'PGRST204' ||
    /does not exist|could not find/i.test(e.message ?? ''))

let noShipUntil = 0
export const isShipOff = () => Date.now() < noShipUntil
const markNoShip = () => {
  noShipUntil = Date.now() + NO_SHIP_TTL_MS
}

export const stripShipCols = (cols: string) =>
  cols.replace(/,\s*ship_(?:cd|pymnt_id|pay_dtm)\b/g, '')

// 쓰기 본문에서 ship_* 키 제거
export const omitShip = <T extends Record<string, unknown>>(p: T): T =>
  Object.fromEntries(
    Object.entries(p).filter(
      ([k]) => !(SHIP_COLS as readonly string[]).includes(k),
    ),
  ) as T

const fillRow = (r: unknown) =>
  r && typeof r === 'object'
    ? { ship_cd: null, ship_pymnt_id: null, ship_pay_dtm: null, ...r }
    : r

// shipOff = 이번 결과가 ship 칼럼 없이 나왔음(쓰기 응답의 shipUnavailable, 결제의 SHIP_UNAVAILABLE 판정에 사용)
export async function selectWithShip<R extends Res>(
  cols: string,
  run: (cols: string, off: boolean) => PromiseLike<R>,
): Promise<R & { shipOff: boolean }> {
  if (!isShipOff()) {
    const r = await run(cols, false)
    if (!isNoShipCol(r.error)) return { ...r, shipOff: false }
    markNoShip()
    console.error(
      '[ship-compat] ship 칼럼 없음 — sql/020 미적용, 기본 SAUCER 로 동작',
      r.error,
    )
  }
  const r = await run(stripShipCols(cols), true)
  const data = Array.isArray(r.data) ? r.data.map(fillRow) : fillRow(r.data)
  return { ...r, data, shipOff: true }
}
