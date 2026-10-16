// 목록 페이징 공용 — size 10·20·50·100이면 해당 페이지만(전체 건수 포함), 그 외는 최대 max건(선택지 용도)
// 마지막 페이지를 넘는 요청(PGRST103)은 빈 목록 + 전체 건수(첫 행만 다시 조회해 count 확보)
export const PAGE_SIZES = [10, 20, 50, 100]

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
