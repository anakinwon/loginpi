// 일괄등록 서버 판정 — 묶음(최대 1,000행)을 행 단위로 변환·검증해 결과와 반영할 행을 만든다(설계 docs/design/bulk-import.md §4)
// 규칙은 화면 등록과 같다 : 순수 규칙(domainSchema·domName·termRuleError·termNames)은 그대로 쓰고,
// DB 조회 규칙(domKeyWordError·termDomError·중복 검사)은 묶음 단위로 미리 읽은 사전에서 같은 조건으로 판정(행마다 조회하지 않음)
import { db } from './db'
import { chunks, inChunks } from './paging'
import { errMsg, type ErrorCode } from './api'
import { domainSchema } from './domain'
import { domName } from './dom-name'
import { areaSep } from './term'
import { termNames, termRuleError, type DicWord } from './term-split'
import { type BulkKind, type BulkResult, domTpByGrp, isDiscarded, parseMoisDomName, pick, splitChn, splitList, toInt } from './bulk'
import { CD_VAL_BAD, cdKind, valTooLong } from './std-code-rule'

type Row = Record<string, unknown>
export interface Checked {
  results: BulkResult[]
  rows: Row[] // 반영할 행(row_no 포함) = 결과 OK·NSTD
}

const err = (row_no: number, name: string, code: ErrorCode, extra?: string): BulkResult => ({ row_no, status: 'ERR', name, code, detail: errMsg(code) + (extra ? ` : ${extra}` : '') })
const skip = (row_no: number, name: string): BulkResult => ({ row_no, status: 'SKIP', name, detail: '이미 등록된 이름(건너뜀)' })
const nul = (s: string) => s || null

// 1,000행 단위 전체 조회(PostgREST 최대 행 수 제한 회피)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T>(make: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// 활성 행 가운데 col 값이 values 안에 있는 것(100개씩 나눠 조회 : URL 길이 제한)
async function existing(table: string, col: string, areaId: string, values: string[]): Promise<Set<string>> {
  // 묶음 병렬 조회(R-P1, 2026-10-24 전수 점검)
  const { data, error } = await inChunks<Record<string, string>>([...new Set(values.filter(Boolean))], (part) => db().from(table).select(col).eq('area_id', areaId).eq('del_yn', 'N').in(col, part))
  if (error) throw error
  return new Set(data.map((r) => r[col]))
}

const lgcTypes = async () => {
  const { data, error } = await db().from('std_lgc_tp').select('lgc_tp_cd, lgc_tp_nm, lgc_tp_abbr_nm').eq('del_yn', 'N')
  if (error) throw error
  return new Map(data.map((t) => [t.lgc_tp_nm, t]))
}

export async function checkBulk(kind: BulkKind, areaId: string, idx: Record<string, number>, raw: string[][], startRow: number): Promise<Checked> {
  const vals = raw.map((r) => pick(idx, r))
  if (kind === 'forbidden') return checkForbidden(areaId, vals, startRow)
  if (kind === 'codes') return checkCodes(areaId, vals, startRow)
  return kind === 'words' ? checkWords(areaId, vals, startRow) : kind === 'domains' ? checkDomains(areaId, vals, startRow) : checkTerms(areaId, vals, startRow)
}

// 금칙어·이음동의어(마스터 지시 2026-10-18) — 구분·표기·대체 표준단어(승인완료 논리명). 판정은 sql/016 트리거와 같은 규칙을 먼저 본다 :
//  표기 = 표준단어 논리명 불가(ALIAS_IS_WORD), 같은 표기는 한 단어에만(같은 단어면 건너뜀, 다른 단어면 ALIAS_DUP), 파일 안 중복 불가
const ALIAS_TP: Record<string, string> = { 금칙어: 'BAN', BAN: 'BAN', 이음동의어: 'SYN', SYN: 'SYN' }
async function checkForbidden(areaId: string, vals: Record<string, string>[], startRow: number): Promise<Checked> {
  const txts = [...new Set(vals.map((v) => v.txt).filter(Boolean))]
  const names = [...new Set([...vals.map((v) => v.word), ...txts].filter(Boolean))]
  // 단어와 대체 표기(표기 → 이미 둔 표준단어 논리명)는 서로 독립 — 동시 조회(R-P1)
  const [w, used] = await Promise.all([inChunks<{ dic_id: string; dic_log_nm: string; std_sts_cd: string }>(names, (part) => db().from('std_dic').select('dic_id, dic_log_nm, std_sts_cd').eq('area_id', areaId).eq('del_yn', 'N').in('dic_log_nm', part)), synTexts(areaId, txts)])
  if (w.error) throw w.error
  const words = new Map<string, { dic_id: string; std_sts_cd: string }>(w.data.map((x) => [x.dic_log_nm, x]))
  const seen = new Set<string>()
  const results: BulkResult[] = []
  const rows: Row[] = []
  vals.forEach((v, i) => {
    const no = startRow + i
    const nm = v.txt
    const tp = ALIAS_TP[v.tp]
    if (!tp) return results.push(err(no, nm, 'INVALID_INPUT', `구분 '${v.tp}'(금칙어·이음동의어만)`))
    if (!nm || nm.length > 200) return results.push(err(no, nm, 'INVALID_INPUT', '표기 1~200자'))
    const w = words.get(v.word)
    if (!w || w.std_sts_cd !== 'CNFM') return results.push(err(no, nm, 'NOT_FOUND', `승인완료 표준단어 '${v.word}' 없음`))
    if (words.has(nm)) return results.push(err(no, nm, 'ALIAS_IS_WORD'))
    const cur = used.get(nm)
    if (cur === v.word) return results.push({ row_no: no, status: 'SKIP', name: nm, detail: '이미 등록된 표기(건너뜀)' })
    if (cur) return results.push(err(no, nm, 'ALIAS_DUP', cur))
    if (seen.has(nm)) return results.push(err(no, nm, 'DUP_IN_FILE'))
    seen.add(nm)
    results.push({ row_no: no, status: 'OK', name: nm, detail: `${tp === 'BAN' ? '금칙어' : '이음동의어'} → ${v.word}`, keys: [nm] })
    rows.push({ row_no: no, dic_id: w.dic_id, rel_tp_cd: tp, rel_txt: nm })
  })
  return { results, rows }
}

// 표준코드(공통코드, 2026-10-20) — 한 행 = 코드상세 하나. 화면 등록과 같은 규칙 : 코드명 = 확정 표준용어·코드형(CD) 도메인·~구분코드·~종류코드·~유형코드,
//  코드값 길이 ≤ 용어 도메인 길이, 코드 안 코드값·코드값명 상호 배타(이미 있는 코드값 = 건너뜀, 다른 코드값의 같은 코드값명 = 오류). 코드기본이 없으면 반영 때 등록 신청(승인대기),
//  반려된 코드기본 아래는 등록 불가(CD_BAS_RJCT, sql/061)
async function checkCodes(areaId: string, vals: Record<string, string>[], startRow: number): Promise<Checked> {
  type T = { term_id: string; term_phy_nm: string; std_dom: { dom_tp_cd: string; data_len: number | null } }
  const names = [...new Set(vals.map((v) => v.cd_nm).filter(Boolean))]
  const tr = await inChunks<T & { term_log_nm: string }>(names, (part) => db().from('std_term').select('term_id, term_log_nm, term_phy_nm, std_dom!inner(dom_tp_cd, data_len)').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').in('term_log_nm', part))
  if (tr.error) throw tr.error
  const terms = new Map<string, T>(tr.data.map((r) => [r.term_log_nm, r]))
  const termIds = [...terms.values()].map((x) => x.term_id)
  const cdOf = new Map<string, string>() // term_id → 코드ID(활성 코드기본, 코드 영문 표준용어)
  const rjct = new Set<string>() // 반려된 코드기본의 코드ID
  const cb = await inChunks<{ cd_id: string; term_id: string; std_sts_cd: string }>(termIds, (part) => db().from('std_cd_bas').select('cd_id, term_id, std_sts_cd').eq('area_id', areaId).eq('del_yn', 'N').in('term_id', part))
  if (cb.error) throw cb.error
  {
    for (const r of cb.data) {
      cdOf.set(r.term_id as string, r.cd_id as string)
      if (r.std_sts_cd === 'RJCT') rjct.add(r.cd_id as string)
    }
  }
  const cdIds = [...cdOf.values()]
  const haveVal = new Set<string>() // cd_id|코드값
  const haveNm = new Map<string, string>() // cd_id|코드값명 → 코드값
  const dtl = await Promise.all(chunks(cdIds, 100).map((part) => fetchAll<{ cd_id: string; cd_val: string; cd_val_nm: string }>(() => db().from('std_cd_dtl').select('cd_id, cd_val, cd_val_nm').eq('area_id', areaId).eq('del_yn', 'N').in('cd_id', part).order('cd_id').order('cd_val'))))
  for (const rows of dtl) {
    for (const r of rows) {
      haveVal.add(`${r.cd_id}|${r.cd_val}`)
      haveNm.set(`${r.cd_id}|${r.cd_val_nm}`, r.cd_val)
    }
  }
  const seen = new Set<string>()
  const results: BulkResult[] = []
  const rows: Row[] = []
  vals.forEach((v, i) => {
    const no = startRow + i
    const nm = `${v.cd_nm} ${v.val}`.trim()
    if (!v.cd_nm || !v.val || !v.val_nm) return results.push(err(no, nm, 'INVALID_INPUT', '코드명·코드값·코드값명 필수'))
    if (v.val.length > 100 || v.val_nm.length > 400 || v.cls.length > 200 || v.desc.length > 4000) return results.push(err(no, nm, 'INVALID_INPUT', '길이 초과(코드값 100·코드값명 400·코드분류 200·설명 4000자)'))
    if (CD_VAL_BAD.test(v.val)) return results.push(err(no, nm, 'INVALID_INPUT', '코드값에 % / \\ ? # 를 쓸 수 없습니다'))
    const sort = toInt(v.sort)
    if (Number.isNaN(sort) || (sort ?? 0) > 99999) return results.push(err(no, nm, 'INVALID_INPUT', `정렬순서 '${v.sort}'(0~99999 정수)`))
    const use = v.use === '' ? 'Y' : v.use.toUpperCase()
    if (use !== 'Y' && use !== 'N') return results.push(err(no, nm, 'INVALID_INPUT', `사용여부 '${v.use}'(Y·N)`))
    const t = terms.get(v.cd_nm)
    if (!t) return results.push(err(no, nm, 'NOT_FOUND', `확정 표준용어 '${v.cd_nm}' 없음`))
    if (!cdKind(v.cd_nm)) return results.push(err(no, nm, 'CD_NAME_NOT_COMMON'))
    if (t.std_dom.dom_tp_cd !== 'CD') return results.push(err(no, nm, 'CD_TERM_INVALID'))
    if (valTooLong(v.val, t.std_dom.data_len)) return results.push(err(no, nm, 'CD_VAL_TOO_LONG', `도메인 길이 ${t.std_dom.data_len}`))
    const cd = cdOf.get(t.term_id)
    if (cd && rjct.has(cd)) return results.push(err(no, nm, 'CD_BAS_RJCT'))
    if (cd && haveVal.has(`${cd}|${v.val}`)) return results.push({ row_no: no, status: 'SKIP', name: nm, detail: '이미 등록된 코드값(건너뜀)' })
    if (cd && haveNm.has(`${cd}|${v.val_nm}`)) return results.push(err(no, nm, 'CD_VAL_NM_DUP', `코드값 ${haveNm.get(`${cd}|${v.val_nm}`)}`))
    const kv = `${v.cd_nm}|v|${v.val}`
    const kn = `${v.cd_nm}|n|${v.val_nm}`
    if (seen.has(kv)) return results.push(err(no, nm, 'DUP_IN_FILE'))
    if (seen.has(kn)) return results.push(err(no, nm, 'CD_VAL_NM_DUP', '파일 안 앞 행'))
    seen.add(kv)
    seen.add(kn)
    results.push({ row_no: no, status: 'OK', name: nm, detail: `${v.val_nm}${cd ? '' : ' · 코드기본 등록 신청(승인대기)'}`, keys: [kv, kn] })
    rows.push({ row_no: no, term_id: t.term_id, data_len: t.std_dom.data_len, cd_id: cd ?? null, new_cd_id: t.term_phy_nm, cd_cls_nm: v.cls || null, cd_val: v.val, cd_val_nm: v.val_nm, sort_seq: sort ?? 0, use_yn: use, cd_val_desc: v.desc || null })
  })
  return { results, rows }
}

// 대체 표기(이음동의어·금칙어) → 표준단어 논리명(이 분류체계 활성 단어 기준, 100개씩)
async function synTexts(areaId: string, names: string[]): Promise<Map<string, string>> {
  const { data, error } = await inChunks<{ rel_txt: string; std_dic: unknown }>([...new Set(names.filter(Boolean))], (part) => db().from('std_dic_rel').select('rel_txt, std_dic!inner(dic_log_nm, area_id, del_yn)').in('rel_tp_cd', ['SYN', 'BAN']).eq('del_yn', 'N').eq('std_dic.area_id', areaId).eq('std_dic.del_yn', 'N').in('rel_txt', part))
  if (error) throw error
  return new Map(data.map((r) => [r.rel_txt, (r.std_dic as { dic_log_nm: string }).dic_log_nm]))
}

// 4.1 단어
async function checkWords(areaId: string, vals: Record<string, string>[], start: number): Promise<Checked> {
  const names = vals.map((v) => v.log_nm)
  const allSyns = vals.flatMap((v) => [...splitList(v.syns), ...splitList(v.forbid)])
  const [have, synWords, havePhy, synTxt, aliasTxt] = await Promise.all([
    existing('std_dic', 'dic_log_nm', areaId, names),
    existing('std_dic', 'dic_log_nm', areaId, allSyns),
    existing('std_dic', 'dic_phy_nm', areaId, vals.map((v) => v.phy_nm.toUpperCase())),
    synTexts(areaId, names),
    synTexts(areaId, allSyns),
  ])
  const seenAlias = new Set<string>()
  const seenPhy = new Set<string>()
  const inFile = new Set(names)
  const seen = new Set<string>()
  const results: BulkResult[] = []
  const rows: Row[] = []
  vals.forEach((v, i) => {
    const no = start + i
    const nm = v.log_nm
    const phy = v.phy_nm.toUpperCase()
    const { chn, desc } = splitChn(v.desc)
    if (isDiscarded(v.rev)) return results.push({ row_no: no, status: 'EXCL', name: nm, detail: '폐기 행 제외' })
    if (!nm || nm.length > 200) return results.push(err(no, nm, 'INVALID_INPUT', '단어명'))
    if (!/^[A-Z][A-Z0-9]*$/.test(phy) || phy.length > 200) return results.push(err(no, nm, 'INVALID_INPUT', `영문약어명 '${v.phy_nm}'`))
    if (v.eng_nm.length > 500 || desc.length > 4000 || v.forbid.length > 4000 || (chn?.length ?? 0) > 200) return results.push(err(no, nm, 'INVALID_INPUT', '길이 초과'))
    // 대표도메인여부(선택 열, sql/013) : 지정하려면 형식단어(속성 분류어)여야 함
    const key = v.key_dom === 'Y' ? 'Y' : 'N'
    if (key === 'Y' && v.fmt_word !== 'Y') return results.push(err(no, nm, 'DOM_KEY_NOT_ATTR', '대표도메인여부 Y'))
    if (seen.has(nm)) return results.push(err(no, nm, 'DUP_IN_FILE'))
    seen.add(nm)
    if (have.has(nm)) return results.push(skip(no, nm))
    // 이음동의어 절대 금지(2026-10-16) : 물리명 중복(DB·파일 안), 기존 단어의 이음동의어 표기
    if (synTxt.has(nm)) return results.push(err(no, nm, 'WORD_IS_SYNONYM', `표준단어 '${synTxt.get(nm)}'`))
    if (havePhy.has(phy) || seenPhy.has(phy)) return results.push(err(no, nm, 'WORD_DUP_PHYSICAL', phy))
    seenPhy.add(phy)
    // 사전에 등록된(또는 이 파일에서 등록할) 단어와 같은 표기는 동의어로 두지 않음
    // 대체 표기(이음동의어·금칙어)는 표준단어 이름과 겹칠 수 없고 한 표준단어에만 둔다(sql/016 트리거와 같은 규칙)
    const dropped: string[] = []
    const pick = (list: string[]) =>
      list.filter((s) => {
        const ok = s !== nm && !synWords.has(s) && !inFile.has(s) && !aliasTxt.has(s) && !seenAlias.has(s) && s.length <= 200
        if (ok) seenAlias.add(s)
        else dropped.push(s)
        return ok
      })
    const bans = pick(splitList(v.forbid))
    const syns = pick(splitList(v.syns))
    results.push({ row_no: no, status: 'OK', name: nm, keys: [nm], detail: dropped.length ? `대체 표기 제외(표준단어 또는 다른 단어의 대체 표기와 같음) : ${dropped.join(', ')}` : undefined })
    rows.push({ row_no: no, dic_log_nm: nm, dic_phy_nm: phy, dic_eng_nm: nul(v.eng_nm), dic_chn_nm: chn, attr_clss_yn: v.fmt_word === 'Y' ? 'Y' : 'N', dic_desc: nul(desc), key_dom_yn: key, syns, bans })
  })
  return { results, rows }
}

// 대표도메인명 후보 단어의 속성 분류어·대표도메인 지정 여부(확정 활성 단어만, 100개씩 조회)
async function keyWordAttr(areaId: string, names: string[]): Promise<Map<string, { attr: string; key: string }>> {
  const { data, error } = await inChunks<{ dic_log_nm: string; attr_clss_yn: string; key_dom_yn: string }>([...new Set(names.filter(Boolean))], (part) => db().from('std_dic').select('dic_log_nm, attr_clss_yn, key_dom_yn').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').in('dic_log_nm', part))
  if (error) throw error
  return new Map(data.map((w) => [w.dic_log_nm, { attr: w.attr_clss_yn, key: w.key_dom_yn }]))
}

// 4.2 도메인
async function checkDomains(areaId: string, vals: Record<string, string>[], start: number): Promise<Checked> {
  const [grps, lgc, keyWords] = await Promise.all([
    db().from('std_dom_grp').select('dom_grp_id, dom_grp_nm').eq('area_id', areaId).eq('del_yn', 'N'),
    lgcTypes(),
    keyWordAttr(areaId, vals.map((v) => v.key_nm)),
  ])
  if (grps.error) throw grps.error
  const grpId = new Map(grps.data.map((g) => [g.dom_grp_nm, g.dom_grp_id]))
  const attr = keyWords

  const pre: { no: number; v: Record<string, string>; row?: Row; res?: BulkResult }[] = vals.map((v, i) => {
    const no = start + i
    const nm = v.dom_nm || v.key_nm
    if (isDiscarded(v.rev)) return { no, v, res: { row_no: no, status: 'EXCL', name: nm, detail: '폐기 행 제외' } }
    const gid = grpId.get(v.grp_nm)
    if (!gid) return { no, v, res: err(no, nm, 'NOT_FOUND', `도메인그룹 '${v.grp_nm}'`) }
    const tp = lgc.get(v.tp_nm)
    if (!tp) return { no, v, res: err(no, nm, 'INVALID_INPUT', `데이터타입 '${v.tp_nm}'`) }
    const len = toInt(v.len)
    const scale = toInt(v.scale)
    const p = domainSchema.safeParse({
      key_dom_nm: v.key_nm,
      dom_tp_cd: domTpByGrp(v.grp_nm),
      lgc_tp_cd: tp.lgc_tp_cd,
      data_len: len ?? undefined,
      data_scale: scale ?? undefined,
      fmt_txt: v.stor_fmt || undefined,
      disp_fmt_txt: v.disp_fmt || undefined,
      unit_nm: v.unit || undefined,
      alw_val_txt: v.alw || undefined,
      dom_desc: v.desc || undefined,
      dom_grp_id: gid,
    })
    if (!p.success) return { no, v, res: err(no, nm, 'INVALID_INPUT', '길이·소수점·칸 길이') }
    if (!attr.has(v.key_nm)) return { no, v, res: err(no, nm, 'DOM_KEY_NOT_WORD', v.key_nm) }
    if (attr.get(v.key_nm)?.attr !== 'Y') return { no, v, res: err(no, nm, 'DOM_KEY_NOT_ATTR', v.key_nm) }
    if (attr.get(v.key_nm)?.key !== 'Y') return { no, v, res: err(no, nm, 'DOM_KEY_NOT_REG', v.key_nm) }
    const dom_nm = domName(p.data.key_dom_nm, tp.lgc_tp_abbr_nm, p.data.data_len, p.data.data_scale)
    return { no, v, row: { row_no: no, ...p.data, dom_nm } }
  })
  const have = await existing('std_dom', 'dom_nm', areaId, pre.flatMap((p) => (p.row ? [p.row.dom_nm as string] : [])))
  const seen = new Set<string>()
  const results: BulkResult[] = []
  const rows: Row[] = []
  for (const p of pre) {
    if (p.res) {
      results.push(p.res)
      continue
    }
    const nm = p.row!.dom_nm as string
    const orig = p.v.dom_nm && p.v.dom_nm !== nm ? `원본 ${p.v.dom_nm}` : undefined
    if (seen.has(nm)) results.push(err(p.no, nm, 'DUP_IN_FILE', orig))
    else if (have.has(nm)) results.push({ ...skip(p.no, nm), detail: '이미 등록된 이름(건너뜀)' + (orig ? ` : ${orig}` : '') })
    else {
      results.push({ row_no: p.no, status: 'OK', name: nm, keys: [nm], detail: orig })
      rows.push(p.row!)
    }
    seen.add(nm)
  }
  return { results, rows }
}

// 영문약어 토큰 → 단어 조합(같은 물리명 단어가 여럿이면 논리명 결합이 용어명과 맞는 조합)
// byLog 를 주면 물리명이 이 분류체계와 다른 자리(행안부 약어 ≠ 우리 약어, 2026-10-17 일자 DT·일시 DTM 등)도 논리명으로 단어를 찾는다 —
// 토큰 수 = 단어 수는 유지(행안부 구성 그대로), 물리명은 우리 단어로 재생성. 물리명 일치 후보를 먼저 시도
function resolveWords(tokens: string[], logNm: string, byPhy: Map<string, DicWord[]>, byLog?: Map<string, DicWord[]>): DicWord[] | null {
  const walk = (i: number, at: number, acc: DicWord[]): DicWord[] | null => {
    if (i === tokens.length) return at === logNm.length ? acc : null
    const phy = byPhy.get(tokens[i]) ?? []
    const log = byLog ? (byLog.get(logNm[at]) ?? []).filter((w) => !phy.includes(w)) : []
    for (const w of [...phy, ...log]) {
      if (logNm.startsWith(w.dic_log_nm, at)) {
        const r = walk(i + 1, at + w.dic_log_nm.length, [...acc, w])
        if (r) return r
      }
    }
    return null
  }
  return walk(0, 0, [])
}

// 4.3 용어
async function checkTerms(areaId: string, vals: Record<string, string>[], start: number): Promise<Checked> {
  const [dict, doms, lgc, sep] = await Promise.all([
    fetchAll<DicWord>(() => db().from('std_dic').select('dic_id, dic_log_nm, dic_phy_nm, attr_clss_yn, forbid_yn').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').order('dic_id')),
    fetchAll<{ dom_id: string; dom_nm: string; key_dom_nm: string; alw_val_txt: string | null; disp_fmt_txt: string | null }>(() =>
      db().from('std_dom').select('dom_id, dom_nm, key_dom_nm, alw_val_txt, disp_fmt_txt').eq('area_id', areaId).eq('del_yn', 'N').eq('std_sts_cd', 'CNFM').order('dom_id'),
    ),
    lgcTypes(),
    areaSep(areaId),
  ])
  const byPhy = new Map<string, DicWord[]>()
  for (const w of dict) byPhy.set(w.dic_phy_nm.toUpperCase(), [...(byPhy.get(w.dic_phy_nm.toUpperCase()) ?? []), w])
  const domByNm = new Map(doms.map((d) => [d.dom_nm, d]))
  // 논리명 첫 글자 → 단어(긴 이름 먼저) : 물리명이 다른 행의 논리명 해석용
  const byLog = new Map<string, DicWord[]>()
  for (const w of [...dict].sort((a, b) => b.dic_log_nm.length - a.dic_log_nm.length)) byLog.set(w.dic_log_nm[0], [...(byLog.get(w.dic_log_nm[0]) ?? []), w])
  // 대체 표기(SYN) → 표준단어 : 행안부 도메인 분류명이 우리 표준과 다를 때(예 율 → 비율, 마스터 지시 2026-10-17)
  const synOf = new Map<string, string>()
  {
    const r = await db().from('std_dic_rel').select('rel_txt, std_dic!inner(dic_log_nm, area_id, del_yn, std_sts_cd)').eq('rel_tp_cd', 'SYN').eq('del_yn', 'N').eq('std_dic.area_id', areaId).eq('std_dic.del_yn', 'N').eq('std_dic.std_sts_cd', 'CNFM').limit(10000)
    if (r.error) throw r.error
    for (const x of r.data as unknown as { rel_txt: string; std_dic: { dic_log_nm: string } }[]) synOf.set(x.rel_txt, x.std_dic.dic_log_nm)
  }

  const pre: { no: number; nm: string; row?: Row; res?: BulkResult; mois_phy?: string; nstd_why?: string }[] = vals.map((v, i) => {
    const no = start + i
    const nm = v.log_nm
    if (isDiscarded(v.rev)) return { no, nm, res: { row_no: no, status: 'EXCL', name: nm, detail: '폐기 행 제외' } }
    if (!nm || !v.phy_nm) return { no, nm, res: err(no, nm, 'INVALID_INPUT', '용어명·영문약어명') }
    const tokens = v.phy_nm.toUpperCase().split('_')
    const unknown = tokens.filter((t) => !byPhy.has(t))
    // 물리명 그대로 해석 → 실패하면 논리명으로 해석(물리명은 우리 단어로 재생성, 결과 내용에 표시)
    const words = (unknown.length ? null : resolveWords(tokens, nm, byPhy)) ?? resolveWords(tokens, nm, byPhy, byLog)
    if (!words) return { no, nm, res: unknown.length ? err(no, nm, 'TERM_WORD_INVALID', `약어 ${unknown.join(', ')}`) : err(no, nm, 'TERM_NAME_MISMATCH', v.phy_nm) }
    // 단일 단어 용어는 비표준으로 수용(D2) : 금칙·끝 단어 속성 규칙은 그대로 적용
    let nstd = false
    const rule = termRuleError(words)
    if (rule === 'TERM_SINGLE_WORD') {
      if (words[0].forbid_yn === 'Y') return { no, nm, res: err(no, nm, 'TERM_FORBIDDEN_WORD') }
      if (words[0].attr_clss_yn !== 'Y') return { no, nm, res: err(no, nm, 'TERM_LAST_NOT_ATTR') }
      nstd = true
    } else if (rule) return { no, nm, res: err(no, nm, rule) }
    const md = parseMoisDomName(v.dom_nm)
    const abbr = md && lgc.get(md.tp)?.lgc_tp_abbr_nm
    const ourNm = md && abbr ? domName(md.key, abbr, md.len, md.scale) : null
    // 분류명이 대체 표기면 표준단어로 바꿔 다시 찾음(율N5,2 → 비율NM5,2)
    const synNm = md && abbr && synOf.has(md.key) ? domName(synOf.get(md.key)!, abbr, md.len, md.scale) : null
    const dom = (ourNm ? domByNm.get(ourNm) : undefined) ?? (synNm ? domByNm.get(synNm) : undefined)
    if (!dom) return { no, nm, res: err(no, nm, 'DOM_NOT_FOUND', ourNm ? `${v.dom_nm} → ${ourNm}` : v.dom_nm) }
    const last = words[words.length - 1].dic_log_nm
    // 끝 단어 ≠ 대표도메인(행안부 '끝 단어의 도메인분류명' 방식) = 비표준 수용(마스터 지시 2026-10-17, 설계 D1 예외)
    const domNstd = dom.key_dom_nm !== last ? `행안부 도메인 수용 : 끝 단어 '${last}' ≠ 도메인 ${dom.dom_nm}` : null
    if (domNstd) nstd = true
    if (v.desc.length > 4000 || v.alw.length > 4000 || v.disp_fmt.length > 200 || v.adm_cd.length > 200 || v.org.length > 200) return { no, nm, res: err(no, nm, 'INVALID_INPUT', '길이 초과') }
    const names = termNames(words, sep)
    return {
      no,
      nm,
      mois_phy: v.phy_nm.toUpperCase(),
      nstd_why: [rule === 'TERM_SINGLE_WORD' ? '단일 단어 용어(비표준 수용)' : null, domNstd].filter(Boolean).join(' · '),
      row: {
        row_no: no,
        ...names,
        dom_id: dom.dom_id,
        term_desc: nul(v.desc),
        dic_ids: words.map((w) => w.dic_id),
        nstd_yn: nstd ? 'Y' : 'N',
        // 허용값·표현형식은 도메인 값과 다를 때만 저장
        alw_val_txt: v.alw && v.alw !== (dom.alw_val_txt ?? '') ? v.alw : null,
        disp_fmt_txt: v.disp_fmt && v.disp_fmt !== (dom.disp_fmt_txt ?? '') ? v.disp_fmt : null,
        adm_cd_nm: nul(v.adm_cd),
        own_org_nm: nul(v.org),
        syn_txt: nul(splitList(v.syns).join(', ')),
      },
    }
  })
  const ok = pre.flatMap((p) => (p.row ? [p.row] : []))
  const [haveLog, havePhy] = await Promise.all([
    existing('std_term', 'term_log_nm', areaId, ok.map((r) => r.term_log_nm as string)),
    existing('std_term', 'term_phy_nm', areaId, ok.map((r) => r.term_phy_nm as string)),
  ])
  const seenLog = new Set<string>()
  const seenPhy = new Set<string>()
  const results: BulkResult[] = []
  const rows: Row[] = []
  for (const p of pre) {
    if (p.res) {
      results.push(p.res)
      continue
    }
    const log = p.row!.term_log_nm as string
    const phy = p.row!.term_phy_nm as string
    if (seenLog.has(log) || seenPhy.has(phy)) results.push(err(p.no, log, 'DUP_IN_FILE', phy))
    else if (haveLog.has(log) || havePhy.has(phy)) results.push({ ...skip(p.no, log), detail: `이미 등록된 이름(건너뜀) : ${phy}` })
    else {
      const nstd = p.row!.nstd_yn === 'Y'
      const regen = phy !== p.mois_phy ? `물리명 재생성 : 행안부 ${p.mois_phy} → ${phy}` : undefined
      results.push({ row_no: p.no, status: nstd ? 'NSTD' : 'OK', name: log, keys: [log, 'P:' + phy], detail: nstd ? [p.nstd_why, regen].filter(Boolean).join(' · ') : regen })
      rows.push(p.row!)
    }
    seenLog.add(log)
    seenPhy.add(phy)
  }
  return { results, rows }
}
