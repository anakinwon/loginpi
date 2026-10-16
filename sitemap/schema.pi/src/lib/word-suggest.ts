// 표준단어 자동 채움 규칙 — 논리명 → 물리명·영문풀네임·한자·설명 후보(표준단어 지침서 backup/10 §3.1·영문 약어 명 규칙)
// 근거 순서 : ① 다른 분류체계의 승인완료 표준단어(행안부 공통표준 등) ② 위키백과(한국어 요약·영어판 제목). 근거 없는 칸은 비움(추측 금지)
// 저장하지 않음 : 화면 폼에만 채우고 입력자가 확인 후 등록(승인 절차 그대로)

const ARTICLES = new Set(['a', 'an', 'the', 'of', 'and', 'for', 'to', 'in', 'on', 'by'])

// 영문 명 : 괄호 설명 제거, 하이픈 → 띄어쓰기, 관사·전치사 생략, 단어 첫 글자 대문자·나머지 소문자(지침 §3.1 영문 명)
export function engTitle(s: string): string {
  return s
    .replace(/\(.*?\)/g, ' ')
    .replace(/[-_/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !ARTICLES.has(w.toLowerCase()))
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// 영문 약어 명(표준단어 지침서 backup/10 문단 384~398) — 후보를 짧은 순으로 돌려준다(중복 확인·선택은 호출 측)
// · 단일어 : 음절마다 1자(음절 첫 자음, 첫 글자는 모음 가능)로 2자 → 중복이면 앞쪽 자음부터 추가해 3자 → 4자(4자 초과 금지, 1자 금지)
//   SOURCE SC→SRC, LEVEL LV→LVL, DEMAND DM→DMN, AGREEMENT →AGM, CUSTOMER CT, ORDER OD, EXTERNAL ETN, MODIFICATION MD
// · 3자 이하 단어는 그대로(KEY), 관용 약어 우선(NUMBER NO·DATE DT·PACKAGE PKG·DELETE DEL·QUANTITY QTY)
// · 2~3단어 = 머리글자(Value Added Tax VAT), 도메인 단어로 끝나면 앞 단어 약어 + 도메인 약어(Account Number ACNO, Customer Name CTNM),
//   1음절 단어는 첫 글자만(Zip Code ZCD), 4단어 이상 = 첫 단어 머리글자 + 끝 단어 약어(Additional Danger Special Contract ACT)
const CONV: Record<string, string> = { NUMBER: 'NO', DATE: 'DT', PACKAGE: 'PKG', DELETE: 'DEL', QUANTITY: 'QTY' }
const DOMAIN: Record<string, string> = { NAME: 'NM', NUMBER: 'NO', DATE: 'DT', AMOUNT: 'AM', COUNT: 'CT', CODE: 'CD' }
const ONSET2 = /^(BR|CR|DR|FR|GR|PR|TR|WR|BL|CL|FL|GL|PL|SL|CH|SH|TH|PH|WH)$/
const isV = (w: string, i: number) => /[AEIOU]/.test(w[i]) || (w[i] === 'Y' && i > 0 && !/[AEIOU]/.test(w[i - 1] ?? ''))

// 음절 첫 글자 위치 — 첫 글자 + 각 모음 덩어리 앞 자음(자음+R/L·이중자는 앞 글자, 그 밖의 겹자음은 뒤 글자 : or-der, cus-to-mer)
function onsetPos(w: string): number[] {
  const pos = [0]
  let i = 0
  while (i < w.length && isV(w, i)) i++
  while (i < w.length) {
    const c0 = i
    while (i < w.length && !isV(w, i)) i++
    if (i >= w.length) break
    const cl = w.slice(c0, i)
    const p = cl.length >= 2 && ONSET2.test(cl.slice(-2)) ? i - 2 : i - 1
    if (p > 0) pos.push(p)
    while (i < w.length && isV(w, i)) i++
  }
  return pos
}

// 단일어 n자 약어 : 음절 첫 글자 앞쪽부터 n개, 모자라면 남은 자음을 앞쪽부터 추가(위치 순서 유지)
function wordAbbr(w: string, n: number): string {
  const on = onsetPos(w).slice(0, n)
  for (let i = 1; on.length < n && i < w.length; i++) if (!on.includes(i) && !isV(w, i)) on.push(i)
  return on.sort((a, b) => a - b).map((i) => w[i]).join('')
}
const syllables = (w: string) => onsetPos(w).length

export function abbrCands(eng: string): string[] {
  const words = engTitle(eng).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(' ').filter(Boolean)
  if (!words.length) return []
  const out: string[] = []
  const add = (a: string) => a.length >= 2 && a.length <= 4 && !out.includes(a) && out.push(a)
  if (words.length === 1) {
    const w = words[0]
    if (CONV[w]) add(CONV[w])
    if (w.length <= 3) add(w)
    for (const n of [2, 3, 4]) add(wordAbbr(w, n))
    return out
  }
  const last = words[words.length - 1]
  const part = (w: string) => CONV[w] ?? (syllables(w) === 1 ? w[0] : wordAbbr(w, 2))
  if (words.length === 2 && DOMAIN[last]) add(part(words[0]) + DOMAIN[last])
  if (words.length <= 3) add(words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join(''))
  else add(words[0][0] + (CONV[last] ?? wordAbbr(last, 2)))
  if (words.length === 2) add(part(words[0]) + (DOMAIN[last] ?? part(last)))
  return out
}
export const engAbbr = (eng: string) => abbrCands(eng)[0] ?? ''

// 위키백과 요약 → 첫 문장(괄호 안 한자·영문 병기 제거, 200자 이내)과 한자 표기
export function wikiDesc(extract: string): { desc: string; chn: string | null } {
  const text = extract.replace(/\s+/g, ' ').trim()
  // 동음이의 안내 문서('…은 다음을 가리킨다')는 설명 근거로 쓰지 않음
  if (/다음(을|과 같은 것을)? 가리킨다|다음과 같은 뜻/.test(text.slice(0, 80))) return { desc: '', chn: null }
  const m = /\(([㐀-鿿豈-﫿]+)[,)]/.exec(text)
  const first = (text.match(/^.*?[다음함임됨]\.(?=\s|$)/)?.[0] ?? text).replace(/\s*\([^)]*\)/g, '').trim()
  return { desc: first.length > 200 ? `${first.slice(0, 199)}…` : first, chn: m ? m[1] : null }
}

// 다른 분류체계 표준단어 중 가장 많이 쓰인 물리명 기준 1건
export function pickStd<T extends { dic_phy_nm: string }>(rows: T[]): T | null {
  if (!rows.length) return null
  const cnt = new Map<string, number>()
  for (const r of rows) cnt.set(r.dic_phy_nm, (cnt.get(r.dic_phy_nm) ?? 0) + 1)
  return [...rows].sort((a, b) => (cnt.get(b.dic_phy_nm) ?? 0) - (cnt.get(a.dic_phy_nm) ?? 0))[0]
}
