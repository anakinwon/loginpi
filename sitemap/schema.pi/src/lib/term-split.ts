// 용어명 분해·결합 — 표준단어 사전 최장 일치로 분해 후보 생성, 선택한 단어 조합으로 논리·물리 용어명 생성
// 외부 형태소 분석기 없음(PRD v0.2 FR-08). 화면 미리보기와 서버 저장이 같은 함수를 쓴다
export interface DicWord {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  attr_clss_yn: string
  forbid_yn: string
}
export type Seg = { word: DicWord } | { unknown: string }

// 전체를 사전 단어로만 덮는 분해 후보(단어 수 적은 순 = 긴 단어 우선, 최대 max개). 없으면 최장 일치 + 미등록 구간 1개 후보
export function splitTerm(name: string, dict: DicWord[], max = 5): Seg[][] {
  const s = name.replace(/\s+/g, '')
  if (!s) return []
  const byNm = new Map(dict.map((w) => [w.dic_log_nm, w]))
  const lens = [...new Set(dict.map((w) => w.dic_log_nm.length))].sort((a, b) => b - a)
  const full: Seg[][] = []
  const dead = new Set<number>() // 끝까지 덮지 못하는 시작 위치(중복 탐색 방지)
  const walk = (i: number, acc: Seg[]): boolean => {
    if (i === s.length) {
      full.push([...acc])
      return true
    }
    if (dead.has(i)) return false
    let found = false
    for (const L of lens) {
      if (full.length >= max * 4) break
      const w = i + L <= s.length ? byNm.get(s.slice(i, i + L)) : undefined
      if (w && walk(i + L, [...acc, { word: w }])) found = true
    }
    if (!found) dead.add(i)
    return found
  }
  walk(0, [])
  if (full.length) return full.sort((a, b) => a.length - b.length).slice(0, max)

  // 미등록 구간 포함 : 위치마다 최장 일치, 일치 없는 글자는 미등록 구간으로 묶음
  const out: Seg[] = []
  let unk = ''
  for (let i = 0; i < s.length; ) {
    const L = lens.find((n) => i + n <= s.length && byNm.has(s.slice(i, i + n)))
    if (L) {
      if (unk) out.push({ unknown: unk })
      unk = ''
      out.push({ word: byNm.get(s.slice(i, i + L))! })
      i += L
    } else {
      unk += s[i]
      i += 1
    }
  }
  if (unk) out.push({ unknown: unk })
  return [out]
}

export function termNames(words: DicWord[], sep: string) {
  return {
    term_log_nm: words.map((w) => w.dic_log_nm).join(''),
    term_phy_nm: words.map((w) => w.dic_phy_nm).join(sep),
  }
}

// 용어 구성 규칙 위반 코드(없으면 null) — 단어 2개 이상(DA 정의서 §8.5 R18, 위반 = 품질 P2), 금칙어 포함 불가, 끝 단어는 속성 분류어(Wordict 문자열 129)
export function termRuleError(words: DicWord[]): 'TERM_SINGLE_WORD' | 'TERM_FORBIDDEN_WORD' | 'TERM_LAST_NOT_ATTR' | null {
  if (words.length < 2) return 'TERM_SINGLE_WORD'
  if (words.some((w) => w.forbid_yn === 'Y')) return 'TERM_FORBIDDEN_WORD'
  if (words[words.length - 1]?.attr_clss_yn !== 'Y') return 'TERM_LAST_NOT_ATTR'
  return null
}
