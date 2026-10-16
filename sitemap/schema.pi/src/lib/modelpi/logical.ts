// ModelPi 논리모델 추천(순수, MD3 1차, 2026-10-17 마스터 지시) — 핵심 엔터티의 주식별자(PK)·필수 속성 후보
// 반자동 : 후보만 만들고 저장하지 않는다(사용자가 골라 POST /entities/[entId]/attributes). 속성 = 승인완료 표준용어만, 없는 용어는 missing(용어 신청 안내)
// 근거 : 데이터 모델링 가이드 04 §2.2(식별자 4원칙·본질 식별자 ~번호·시스템 발급 ~ID·복합 3개 초과 인조), §3(식별 관계 = 부모 식별자 + 순번 상속), §5(이력 = 부모 키 + 유효시작일시), M:N 해소 = 양쪽 부모 키
// 시스템 컬럼(등록자ID 등)은 물리 단계 자동 추가라 후보에서 제외
import type { EntTp, EntWord } from '../model-name.ts'

export interface TermRow {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
}
// 이 엔터티가 자식인 관계와 부모의 등록된 PK 속성
export interface ParentKey {
  rel_id: string
  idnt_yn: string
  prnt_opt_yn: string
  prnt_nm: string
  pk: TermRow[]
}
export interface AttrCand {
  term_log_nm: string
  term_id?: string
  term_phy_nm?: string
  dom_nm?: string | null
  role: 'PK' | 'FK' | 'REQ'
  esntl: boolean
  src: 'industry' | 'rule' | 'inherit'
  reason: string
  missing: boolean
  fk_rel_id?: string
}
export interface AttrInput {
  words: EntWord[]
  tp: EntTp
  tmpl?: { terms: string[]; pk: string[] } | null // 업종 템플릿 속성(엔터티 키 일치 시)
  parents: ParentKey[]
  terms: TermRow[] // 핵심어 접두 승인 용어 + 공통 후보(GENERIC_TERMS) 조회 결과
  have: Set<string> // 이미 등록된 속성 용어명
}

// 핵심어와 무관하게 찾아야 하는 공통 후보 용어(라우트가 정확 일치로 함께 조회)
export const GENERIC_TERMS = ['유효시작일시', '유효종료일시', '변경일시', '기준일자', '기준년월', '일련번호']

// 핵심어 = 구성 단어에서 끝 엔터티 분류어를 뺀 결합(주문상세 → 주문, 고객등급이력 → 고객등급), 분류어명
export function entCore(words: EntWord[]) {
  const last = words[words.length - 1]
  const clss = last && last.ent_clss_yn === 'Y' && words.length > 1 ? last.dic_log_nm : null
  const core = (clss ? words.slice(0, -1) : words).map((w) => w.dic_log_nm).join('')
  return { core, clss, head: words[0]?.dic_log_nm ?? '' }
}

export function recommendAttrs(i: AttrInput): { pk: AttrCand[]; required: AttrCand[]; warn: string[] } {
  const byNm = new Map(i.terms.map((t) => [t.term_log_nm, t]))
  const { core, clss } = entCore(i.words)
  const warn: string[] = []
  const used = new Set<string>(i.have)
  const cand = (nm: string, role: AttrCand['role'], esntl: boolean, src: AttrCand['src'], reason: string, fk_rel_id?: string): AttrCand => {
    const t = byNm.get(nm)
    return { term_log_nm: nm, term_id: t?.term_id, term_phy_nm: t?.term_phy_nm, dom_nm: t?.dom_nm, role, esntl, src, reason, missing: !t, ...(fk_rel_id ? { fk_rel_id } : {}) }
  }
  // 이름 후보 중 승인 용어가 있는 첫 이름(없으면 첫 이름을 missing 으로)
  const firstOf = (names: string[], role: AttrCand['role'], esntl: boolean, reason: string, showMissing = true) => {
    const nm = names.find((n) => byNm.has(n)) ?? (showMissing ? names[0] : undefined)
    return nm ? [cand(nm, role, esntl, 'rule', reason)] : []
  }

  // ① 주식별자
  const inherit = i.parents
    .filter((p) => p.idnt_yn === 'Y')
    .flatMap((p) => p.pk.map((t) => ({ ...cand(t.term_log_nm, 'PK', true, 'inherit', `식별 관계 상속 : ${p.prnt_nm} 의 식별자(04 §3)`, p.rel_id), term_id: t.term_id, term_phy_nm: t.term_phy_nm, dom_nm: t.dom_nm, missing: false })))
  let pk: AttrCand[]
  if (i.tmpl?.pk.length) {
    pk = [...inherit, ...i.tmpl.pk.filter((n) => !inherit.some((x) => x.term_log_nm === n)).map((n) => cand(n, 'PK', true, 'industry', '업종 템플릿 주식별자'))]
  } else if (clss === '상세') {
    pk = [...inherit, ...firstOf([`${core}일련번호`, `${core}순서`, '일련번호'], 'PK', true, '상세 = 부모 식별자 + 순번(04 §3)')]
    if (!inherit.length) warn.push('상세 엔터티는 부모와 식별 관계를 맺으면 부모 식별자를 상속합니다(관계 등록 후 다시 추천)')
  } else if (clss === '이력') {
    pk = [...inherit, ...firstOf(['유효시작일시', `${core}변경일시`, '변경일시', `${core}일련번호`], 'PK', true, '이력 = 부모 키 + 유효시작일시(04 §5)')]
    if (!inherit.length) warn.push('이력 엔터티는 원천 엔터티와 식별 관계를 맺어 원천 식별자를 상속합니다')
  } else if (clss === '관계') {
    pk = inherit
    if (inherit.length < 2) warn.push('관계(N:M 해소) 엔터티 식별자 = 양쪽 부모 식별자 — 두 부모와 식별 관계를 등록하십시오')
  } else if (clss === '집계' || clss === '통계' || i.tp === 'AGG') {
    pk = [...inherit, ...firstOf(['기준일자', '기준년월'], 'PK', true, '집계 = 기준 시점 + 집계 차원')]
  } else if (clss === '내역' || clss === '로그') {
    pk = inherit.length ? [...inherit, ...firstOf([`${core}일련번호`, '일련번호'], 'PK', true, '부모 식별자 + 순번')] : firstOf([`${core}번호`, `${core}일련번호`], 'PK', true, '본질 식별자 ~번호(04 §2.2)')
  } else if (clss === '코드') {
    pk = [...inherit, ...firstOf([`${core}코드`, `${core}번호`], 'PK', true, '코드 엔터티 식별자 = ~코드')]
  } else {
    pk = [...inherit, ...firstOf([`${core}번호`, `${core}ID`, `${core}코드`], 'PK', true, '본질 식별자 ~번호, 시스템 발급이면 ~ID(04 §2.2)')]
  }
  pk = pk.filter((c, k, a) => a.findIndex((x) => x.term_log_nm === c.term_log_nm) === k)
  if (pk.length > 3) warn.push(`복합 식별자 ${pk.length}개 — 3개를 넘으면 인조 식별자(${core}번호) 검토(04 §2.2)`)
  pk.forEach((c) => used.add(c.term_log_nm))

  // ② 필수 속성
  const req: AttrCand[] = []
  const push = (c: AttrCand) => {
    if (used.has(c.term_log_nm)) return
    used.add(c.term_log_nm)
    req.push(c)
  }
  for (const p of i.parents.filter((x) => x.idnt_yn !== 'Y'))
    for (const t of p.pk) push({ ...cand(t.term_log_nm, 'FK', p.prnt_opt_yn === 'N', 'inherit', `비식별 관계 : ${p.prnt_nm} 참조(${p.prnt_opt_yn === 'N' ? '부모 필수 → 필수' : '부모 선택 → 선택'})`, p.rel_id), term_id: t.term_id, term_phy_nm: t.term_phy_nm, dom_nm: t.dom_nm, missing: false })
  for (const n of i.tmpl?.terms ?? []) if (!i.tmpl?.pk.includes(n)) push(cand(n, 'REQ', true, 'industry', '업종 템플릿 핵심 속성'))
  const codes = i.terms
    .filter((t) => t.term_log_nm.startsWith(core) && /(상태|구분|유형|종류)코드$/.test(t.term_log_nm))
    .sort((a, b) => a.term_log_nm.length - b.term_log_nm.length)
    .slice(0, 2)
  if (i.tp === 'BASE') {
    firstOf([`${core}명`, `${core}명칭`], 'REQ', true, '실체 엔터티 = 이름 필수').forEach(push)
    codes.forEach((t) => push(cand(t.term_log_nm, 'REQ', true, 'rule', '상태·구분 코드(공통코드 참조)')))
  } else if (i.tp === 'ACT') {
    firstOf([`${core}일시`, `${core}일자`], 'REQ', true, '행위 엔터티 = 발생 일시 필수').forEach(push)
    for (const n of [`${core}금액`, `${core}수량`]) firstOf([n], 'REQ', true, '행위 측정값', false).forEach(push)
    codes.forEach((t) => push(cand(t.term_log_nm, 'REQ', true, 'rule', '상태·구분 코드(공통코드 참조)')))
  } else {
    for (const n of [`${core}건수`, `${core}금액`]) firstOf([n], 'REQ', true, '집계 측정값', false).forEach(push)
  }
  return { pk: pk.filter((c) => !i.have.has(c.term_log_nm)), required: req, warn }
}
