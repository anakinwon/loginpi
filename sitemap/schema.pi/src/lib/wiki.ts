// 위키백과 한국어판 조회(요약·영어판 제목) — 표준단어·주제영역 자동 채움 공용, 실패·시간 초과(5초)는 근거 없음(null)
const WIKI = 'https://ko.wikipedia.org/w/api.php?action=query&prop=langlinks|extracts&lllang=en&exintro=1&explaintext=1&redirects=1&format=json&titles='

export async function wiki(name: string): Promise<{ title: string; en: string | null; extract: string } | null> {
  try {
    const r = await fetch(WIKI + encodeURIComponent(name), { headers: { 'User-Agent': 'schema.pi/0.1 (data standard dictionary)' }, signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const p = Object.values(((await r.json()) as { query?: { pages?: Record<string, { title: string; missing?: string; extract?: string; langlinks?: { '*': string }[] }> } }).query?.pages ?? {})[0]
    if (!p || 'missing' in p) return null
    return { title: p.title, en: p.langlinks?.[0]?.['*'] ?? null, extract: p.extract ?? '' }
  } catch {
    return null
  }
}
