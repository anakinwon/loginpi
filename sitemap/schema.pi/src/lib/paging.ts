// 목록 페이징 공용 — size 10·20·50·100이면 해당 페이지만(전체 건수 포함), 그 외는 최대 max건(선택지 용도)
// 마지막 페이지를 넘는 요청(PGRST103)은 빈 목록 + 전체 건수(첫 행만 다시 조회해 count 확보)
export const PAGE_SIZES = [10, 20, 50, 100]

// .in() 값 나누기 — PostgREST .in() 은 값을 GET 주소에 싣는다. UUID 수백 개면 주소가 20KB를 넘어 요청이 끊기므로(fetch failed) 150개(약 6KB)씩 나눠 조회
export const IN_CHUNK = 150
export const chunks = <T>(xs: T[], n = IN_CHUNK): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
// .in() 조회를 chunks 로 나눠 병렬 실행 후 합침 — 결과 모양 { data, error } 는 단건 조회와 같음, 값 0개면 조회 없이 빈 배열
//  주의 : .order()·.limit() 은 묶음마다 적용(같은 키는 한 묶음에만 들어가므로 키별 순서는 유지, 전체 순서·전체 상한은 아님)
type InErr = { code?: string; message?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inChunks<T = any>(vals: readonly string[], q: (part: string[]) => PromiseLike<{ data: unknown; error: InErr | null }>): Promise<{ data: T[]; error: null } | { data: null; error: InErr }> {
  const rs = await Promise.all(chunks([...vals]).map(q))
  const bad = rs.find((r) => r.error)
  if (bad) return { data: null, error: bad.error as InErr }
  return { data: rs.flatMap((r) => (r.data ?? []) as T[]), error: null }
}

interface Res<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
  count: number | null
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = { range: (a: number, b: number) => any; limit: (n: number) => any }

export async function pageRows<T>(build: () => Q, sp: URLSearchParams, max = 1000) {
  const size = Number(sp.get('size'))
  const page = Math.max(1, Math.floor(Number(sp.get('page')) || 1))
  const paged = PAGE_SIZES.includes(size)
  const r: Res<T> = await (paged ? build().range((page - 1) * size, page * size - 1) : build().limit(max))
  if (r.error?.code === 'PGRST103') {
    const head: Res<T> = await build().range(0, 0)
    if (head.error) return { error: head.error }
    return { rows: [] as T[], total: head.count ?? 0, page, size }
  }
  if (r.error) return { error: r.error }
  const rows = r.data ?? []
  return { rows, total: r.count ?? rows.length, page, size: paged ? size : null }
}
