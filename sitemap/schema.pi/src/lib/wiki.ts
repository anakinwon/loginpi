// 위키백과 한국어판 조회(요약·영어판 제목) — 표준단어·주제영역 자동 채움 공용, 실패·시간 초과(2초)는 근거 없음(null)
const WIKI = 'https://ko.wikipedia.org/w/api.php?action=query&prop=langlinks|extracts&lllang=en&exintro=1&explaintext=1&redirects=1&format=json&titles='

type Wiki = { title: string; en: string | null; extract: string } | null

// 이름 단위 결과 캐시(null 포함, 진행 중 요청 공유) — 서버 인스턴스 메모리 한정, 1000건 넘으면 비움
const cache = new Map<string, Promise<Wiki>>()

export async function wiki(name: string): Promise<Wiki> {
  const hit = cache.get(name)
  if (hit) return hit
  if (cache.size >= 1000) cache.clear()
  const p = load(name)
  cache.set(name, p)
  return p
}

async function load(name: string): Promise<Wiki> {
  try {
    const r = await fetch(WIKI + encodeURIComponent(name), { headers: { 'User-Agent': 'schema.pi/0.1 (data standard dictionary)' }, signal: AbortSignal.timeout(2000) })
    if (!r.ok) return null
    const p = Object.values(((await r.json()) as { query?: { pages?: Record<string, { title: string; missing?: string; extract?: string; langlinks?: { '*': string }[] }> } }).query?.pages ?? {})[0]
    if (!p || 'missing' in p) return null
    return { title: p.title, en: p.langlinks?.[0]?.['*'] ?? null, extract: p.extract ?? '' }
  } catch {
    return null
  }
}
