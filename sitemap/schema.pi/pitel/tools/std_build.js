// 표준사전 생성기(2차 — 03 논리 관문) — std_words.js(단어 원장)·std_codes.js(코드 값)로 model/std/*.json 을 만들고
// 개념·논리 모델(model/conceptual·logical/*.json)의 속성명 동의어 정리·phyNm·domNm·엔터티 phyNm/tblNm 을 사전 기준으로 다시 계산한다
// 실행 : node tools/std_build.js          (점검만, 미등록 단어·누락 코드 출력)
//        node tools/std_build.js --write  (std 4종 JSON 기록 + 개념 모델 갱신)
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CNCP_DIR = path.join(ROOT, 'model', 'conceptual')
const LGCL_DIR = path.join(ROOT, 'model', 'logical')
const STD_DIR = path.join(ROOT, 'model', 'std')
const WRITE = process.argv.includes('--write')

// 속성명 동의어·규칙 위반 정리(개념 모델 원문 → 표준용어) — 근거는 docs/03_standards.md 4절
const RENAME = {
  연체가산금누계금액: '연체가산금누적금액', 대손회수누계금액: '대손회수누적금액',
  수신전화번호암호문: '수신전화번호암호화값', 회선번호: '서비스관리번호',
  정지기준미납금액: '이용정지기준미납금액', 정지기준경과일수: '이용정지기준경과일수',
  정지해제일시: '이용정지해제일시', 정지해제사유유형코드: '이용정지해제사유유형코드',
  정지해제조건여부: '이용정지해제조건여부', 첫납부예정일자: '최초납부예정일자',
  고객등급코드: '고객등급유형코드', 등급변경사유코드: '등급변경사유유형코드',
  동의항목코드: '동의항목유형코드', 납기일자: '납부기한일자',
  수납채널코드: '수납채널유형코드', 수납배분순위코드: '수납배분우선순위', 수납순위: '수납배분우선순위',
  환불수취인명: '환불수령인명', IMSI: 'IMSI번호', 국제이동가입자식별번호: 'IMSI번호',
  IMEI: 'IMEI번호', ESIM여부: 'eSIM여부', 할부원금액: '할부원금', 할부잔여원금액: '할부잔여원금',
  공시지원금액: '공시지원금', 추가지원금액: '추가지원금', 부가가치세액: '부가가치세금액',
  조정부가가치세액: '조정부가가치세금액', 부가세금액: '부가가치세금액',
  네트워크요소코드: '망요소유형코드', 변경전월정액금액: '이전월정액금액',
  청구서출력순서: '청구서출력순번', 요금항목분류유형코드: '요금항목분류코드', // 03 관문 : PRD 요금항목분류코드(코드 엔터티 키)로 통일, 공통코드 폐기
  연체가산금기준코드: '연체가산금기준유형코드', 청구조정사유코드: '청구조정사유유형코드',
  정산대행사코드: '정산대행사유형코드', 폐점일자: '폐쇄일자', 'PRM:과세유형코드': '사업자과세유형코드',
}

// 외부 표준 코드(공통코드 아님 — codes.json 대상 밖, 값은 외부 기관 정본)
const EXT_CODES = {
  국가코드: 'ISO 3166-1 alpha-2', 통화코드: 'ISO 4217', 정산통화코드: 'ISO 4217',
  TADIG코드: 'GSMA TADIG(TD.13)', 이동국가코드: 'ITU-T E.212 MCC', 이동망코드: 'ITU-T E.212 MNC',
  번호이동사업자코드: 'KTOA 번호이동 사업자 식별코드', 업종코드: '통계청 KSIC 대분류', 비용센터코드: 'ERP 원가센터', 망식별코드: 'ITU-T E.212 MCC+MNC',
}

// 도메인 : 대표도메인(속성 분류어) + 길이 변형. 각 대표도메인의 첫 행 = 기본 변형
const DOMAINS = [
  ['번호V20', '번호', '번호', 'VARCHAR', 20, null, '식별·외부 부여 번호(기본)'],
  ['번호V30', '번호', '번호', 'VARCHAR', 30, null, '국세청 승인번호·건물관리번호 등 긴 번호'],
  ['일련번호N5', '일련번호', '번호', 'NUMERIC', 5, 0, '부모 안 등록 차례 일련번호'],
  ['일련번호V20', '일련번호', '번호', 'VARCHAR', 20, null, '기기(유심) 일련번호 문자열'],
  ['순번N5', '순번', '수량', 'NUMERIC', 5, 0, '부모 안 처리·표시 순번(기본)'],
  ['순번N10', '순번', '수량', 'NUMERIC', 10, 0, '이력·상세가 많은 부모의 순번'],
  ['코드V10', '코드', '코드', 'VARCHAR', 10, null, '공통코드·기준 코드(기본)'],
  ['코드V20', '코드', '코드', 'VARCHAR', 20, null, '상품·단말모델 코드'],
  ['명V100', '명', '명칭', 'VARCHAR', 100, null, '이름(기본)'],
  ['명V200', '명', '명칭', 'VARCHAR', 200, null, '법인명·상품 공시명 등 긴 이름'],
  ['일시TS', '일시', '날짜/시간', 'TIMESTAMP', null, null, '연월일 시분초(마이크로초)'],
  ['일자C8', '일자', '날짜/시간', 'CHAR', 8, null, 'YYYYMMDD'],
  ['년월C6', '년월', '날짜/시간', 'CHAR', 6, null, 'YYYYMM'],
  ['일C2', '일', '날짜/시간', 'CHAR', 2, null, 'DD(01~31, 말일 = 99 허용)'],
  ['여부C1', '여부', '코드', 'CHAR', 1, null, 'Y/N'],
  ['금액N15', '금액', '금액', 'NUMERIC', 15, 0, '원화 금액(원 단위, 음수 = 조정·환입)'],
  ['금액N18_4', '금액', '금액', 'NUMERIC', 18, 4, '외화·SDR 금액(소수 4자리, 로밍 TAP·국제 정산) — 03 관문(구 금액N18_3 대체)'],
  ['수N10', '수', '수량', 'NUMERIC', 10, 0, '개수(기본)'],
  ['수N3', '수', '수량', 'NUMERIC', 3, 0, '회차·개월 등 작은 개수'],
  ['수N5', '수', '수량', 'NUMERIC', 5, 0, '개월수·회선수 등'],
  ['수N18', '수', '수량', 'NUMERIC', 18, 0, '바이트 수 등 큰 개수'],
  ['건수N10', '건수', '수량', 'NUMERIC', 10, 0, '처리·발생 건수'],
  ['일수N5', '일수', '수량', 'NUMERIC', 5, 0, '경과 일수(기본)'],
  ['일수N3', '일수', '수량', 'NUMERIC', 3, 0, '월 안의 일할 일수'],
  ['회차N3', '회차', '수량', 'NUMERIC', 3, 0, '분할·할부 회차'],
  ['수량N18', '수량', '수량', 'NUMERIC', 18, 0, '사용·과금량(초·바이트·건)'],
  ['율N5_2', '율', '율', 'NUMERIC', 5, 2, '백분율(소수 2자리, 최대 999.99)'],
  ['환율N15_4', '환율', '율', 'NUMERIC', 15, 4, '통화 환산 비율(소수 4자리) — 03 관문(구 율N12_4 대체)'],
  ['내용V4000', '내용', '내용', 'VARCHAR', 4000, null, '자유 서술(기본)'],
  ['내용V200', '내용', '내용', 'VARCHAR', 200, null, '짧은 서술(연락처 값 등)'],
  ['주소V200', '주소', '명칭', 'VARCHAR', 200, null, '우편 주소(기본)'],
  ['주소V100', '주소', '명칭', 'VARCHAR', 100, null, '이메일 주소'],
  ['전화번호V20', '전화번호', '번호', 'VARCHAR', 20, null, '전화번호 숫자 문자열'],
  ['우편번호C5', '우편번호', '번호', 'CHAR', 5, null, '우편번호 5자리'],
  ['값V256', '값', '내용', 'VARCHAR', 256, null, '암호화 값(Base64)'],
  ['값N10', '값', '수량', 'NUMERIC', 10, 0, '숫자 설정 값(속도 Kbps 등)'],
]

// ---------- 단어 ----------
const words = require('./std_words.js').trim().split('\n').map((l) => {
  const [wordNm, abbr, engNm, def, cls = ''] = l.split('|')
  const ent = cls.match(/E(_[A-Z])/)
  const attr = cls.match(/A:(\S+)/)
  return { wordNm, abbr, engNm, def, entClss: !!ent, attrClss: !!attr, tblSfx: ent ? ent[1] : null, keyDom: attr ? attr[1] : null }
})
const byNm = new Map()
const byAbbr = new Map()
const errs = []
for (const w of words) {
  if (byNm.has(w.wordNm)) errs.push(`단어 중복 ${w.wordNm}`)
  if (byAbbr.has(w.abbr)) errs.push(`약어 중복 ${w.abbr} : ${byAbbr.get(w.abbr).wordNm} / ${w.wordNm}`)
  byNm.set(w.wordNm, w)
  byAbbr.set(w.abbr, w)
}

// 최소 단어 수 분할(DP) — 합성어가 있으면 합성어 우선, 같은 단어 수면 1글자 단어가 적은 쪽
const segCache = new Map()
const cost = (ws) => ws.length * 10 + ws.filter((w) => w.wordNm.length === 1).length
// 동점이면 앞 단어가 긴 쪽(사용+량 > 사+용량)
function better(a, b) {
  if (cost(a) !== cost(b)) return cost(a) < cost(b)
  for (let k = 0; k < a.length; k++) if (a[k].wordNm.length !== b[k].wordNm.length) return a[k].wordNm.length > b[k].wordNm.length
  return false
}
function segment(nm) {
  if (segCache.has(nm)) return segCache.get(nm)
  const best = [[]]
  for (let i = 1; i <= nm.length; i++) {
    for (let j = 0; j < i; j++) {
      if (!best[j]) continue
      const w = byNm.get(nm.slice(j, i))
      if (!w) continue
      const c = [...best[j], w]
      if (!best[i] || better(c, best[i])) best[i] = c
    }
  }
  const r = best[nm.length] || null
  segCache.set(nm, r)
  return r
}

const domMap = new Map(DOMAINS.map((d) => [d[0], d]))
const keyDefault = new Map()
for (const d of DOMAINS) if (!keyDefault.has(d[1])) keyDefault.set(d[1], d[0])

// 속성 분류어(끝 단어)의 대표도메인 + 원래 길이 변형 → 도메인
function pickDom(lastWord, oldDom) {
  const key = lastWord.keyDom
  const variant = (oldDom || '').replace(/^[가-힣]+/, '')
  return domMap.has(key + variant) ? key + variant : keyDefault.get(key)
}

const terms = new Map() // termNm → term
const unknown = new Map()
const domFix = []
function termOf(attrNm, oldDom, where) {
  const seg = segment(attrNm)
  if (!seg) { unknown.set(attrNm, where); return null }
  const last = seg[seg.length - 1]
  if (!last.attrClss) { errs.push(`속성 분류어로 끝나지 않음 : ${attrNm} (${where})`); return null }
  const phyNm = seg.map((w) => w.abbr).join('_')
  let t = terms.get(attrNm)
  if (!t) {
    const domNm = pickDom(last, oldDom)
    t = { termNm: attrNm, words: seg.map((w) => w.wordNm), phyNm, domNm, def: termDef(attrNm, seg) }
    terms.set(attrNm, t)
  } else if (oldDom && t.domNm !== pickDom(last, oldDom)) {
    domFix.push(`${attrNm} : ${oldDom} → ${t.domNm} (${where})`)
  }
  return t
}

function termDef(nm, seg) {
  const last = seg[seg.length - 1]
  const head = seg.slice(0, -1).map((w) => w.wordNm).join(' ')
  if (EXT_CODES[nm]) return `${head} 코드 — 외부 표준 ${EXT_CODES[nm]} 값을 그대로 쓴다(공통코드 아님)`
  if (/(유형|구분|종류)코드$/.test(nm)) return `${head.replace(/ (유형|구분|종류)$/, '')}의 ${seg[seg.length - 2].wordNm} 코드 — 공통코드(codes.json)`
  if (!head) return last.def
  return `${head}의 ${last.wordNm} — ${last.def}`
}

// ---------- 개념 모델 순회 ----------
const files = [CNCP_DIR, LGCL_DIR].flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => path.join(d, f)))
const models = {}
const renamed = []
const phyChg = []
const entChg = []
for (const f of files) {
  const area = path.basename(f, '.json')
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  models[f] = j
  const walk = (o, where) => {
    if (Array.isArray(o)) return o.forEach((x) => walk(x, where))
    if (!o || typeof o !== 'object') return
    if (typeof o.attrNm === 'string') {
      const parts = o.attrNm.split(/\s*\+\s*/)
      const nparts = parts.map((p) => RENAME[area + ':' + p] || RENAME[p] || p)
      if (nparts.join() !== parts.join()) { renamed.push(`${area} ${where} : ${o.attrNm} → ${nparts.join(' + ')}`); o.attrNm = nparts.join(' + ') }
      const oldDoms = typeof o.domNm === 'string' ? o.domNm.split(/\s*,\s*/) : []
      const ts = nparts.map((p, i) => termOf(p, oldDoms[i], `${area} ${where}`))
      if (ts.every(Boolean)) {
        const phy = ts.map((t) => t.phyNm).join(', ')
        if (o.phyNm !== undefined && o.phyNm !== phy) { phyChg.push(`${area} ${o.attrNm} : ${o.phyNm} → ${phy}`); o.phyNm = phy }
        if (o.domNm !== undefined) o.domNm = ts.map((t) => t.domNm).join(', ')
      }
    }
    // FK·관계의 속성 참조도 같은 이름 변경을 따른다
    const rn = (x) => x.split(/\s*\+\s*/).map((p) => RENAME[area + ':' + p] || RENAME[p] || p).join(' + ')
    if (typeof o.attr === 'string' && o.ent) o.attr = rn(o.attr)
    for (const k of ['fkAttrs', 'fkAttr']) if (Array.isArray(o[k])) o[k] = o[k].map((x) => (typeof x === 'string' ? rn(x) : x)); else if (typeof o[k] === 'string') o[k] = rn(o[k])
    if (typeof o.termNm === 'string') o.termNm = RENAME[area + ':' + o.termNm] || RENAME[o.termNm] || o.termNm
    if (typeof o.entNm === 'string' && typeof o.phyNm === 'string') {
      const seg = segment(o.entNm)
      if (!seg) unknown.set(o.entNm, `${area} 엔터티`)
      else {
        const last = seg[seg.length - 1]
        if (!last.entClss) errs.push(`엔터티 분류어로 끝나지 않음 : ${o.entNm}`)
        else {
          // 엔터티 phyNm = 접두어 없는 <단어 약어>_<분류어 약어>(02 관문 K1), tblNm = 물리 미리보기 PTL_<영역>_<단어 약어>_<사전 tblSfx>
          const phy = seg.map((w) => w.abbr).join('_')
          const tbl = ['PTL', area, ...seg.slice(0, -1).map((w) => w.abbr), last.tblSfx.slice(1)].join('_')
          if (o.phyNm !== phy || o.tblNm !== tbl) { entChg.push(`${area} ${o.entNm} : ${o.phyNm}/${o.tblNm} → ${phy}/${tbl}`); o.phyNm = phy; o.tblNm = tbl }
        }
      }
    }
    for (const [k, v] of Object.entries(o)) if (k !== 'decisions') walk(v, o.entNm || where)
  }
  walk(j, area)
}

// ---------- 코드 ----------
const MANUAL = require('./std_codes.js')
const cand = {}
for (const j of Object.values(models)) for (const c of j.codeCandidates || []) cand[c.termNm] = c
const codes = []
const missing = []
for (const t of [...terms.values()].sort((a, b) => a.termNm.localeCompare(b.termNm, 'ko'))) {
  const m = t.termNm.match(/(유형|구분|종류)코드$/)
  if (!m) continue
  const kind = m[1]
  let src = MANUAL[t.termNm] || (cand[t.termNm] && cand[t.termNm].vals)
  if (typeof src === 'string' && src[0] === '@') src = MANUAL[src.slice(1)] || (cand[src.slice(1)] && cand[src.slice(1)].vals)
  if (!src) { missing.push(t.termNm); continue }
  const vals = (Array.isArray(src) ? src : src.split(',')).map((v) => v.trim()).filter(Boolean)
  if (kind === '구분' && vals.length > 3) errs.push(`구분코드 값 4개 이상 : ${t.termNm}`)
  codes.push({
    termNm: t.termNm, kind,
    vals: vals.map((v, i) => {
      const [nm, def] = v.split('=')
      return { cd: String(i + 1).padStart(2, '0'), nm, def: def || `${t.termNm.replace(/(유형|구분|종류)코드$/, '')} '${nm}'` }
    }),
  })
}

// ---------- 출력 ----------
const used = new Set([...terms.values()].flatMap((t) => t.words))
for (const j of Object.values(models)) for (const e of j.entities) (segment(e.entNm) || []).forEach((w) => used.add(w.wordNm))
const unusedWords = words.filter((w) => !used.has(w.wordNm) && !w.entClss && !w.attrClss).map((w) => w.wordNm)

console.log(`단어 ${words.length}(미사용 일반어 ${unusedWords.length}: ${unusedWords.join(',')}) · 용어 ${terms.size} · 도메인 ${DOMAINS.length} · 코드 ${codes.length}`)
console.log(`속성명 정리 ${renamed.length} · phyNm 변경 ${phyChg.length} · 엔터티 phyNm 변경 ${entChg.length} · 도메인 조정 ${domFix.length}`)
if (unknown.size) console.log('미등록 분할 실패 :\n ' + [...unknown].map(([k, v]) => `${k} (${v})`).join('\n '))
if (missing.length) console.log('코드 값 누락 :\n ' + missing.join('\n '))
if (errs.length) console.log('오류 :\n ' + errs.join('\n '))
if (process.argv.includes('-t')) console.log([...terms.values()].map((t) => t.termNm + ' ' + t.phyNm + ' ' + t.domNm).join('\n'))
if (process.argv.includes('-v')) console.log([...renamed, ...entChg, ...domFix].join('\n'))

if (WRITE) {
  if (unknown.size || errs.length || missing.length) { console.error('오류가 있어 기록하지 않음'); process.exit(1) }
  fs.mkdirSync(STD_DIR, { recursive: true })
  const out = (n, d) => fs.writeFileSync(path.join(STD_DIR, n), JSON.stringify(d, null, 2) + '\n')
  out('words.json', words.filter((w) => !unusedWords.includes(w.wordNm)).map(({ keyDom, ...w }) => ({ ...w, keyDom: keyDom || null })))
  out('domains.json', DOMAINS.map(([domNm, keyDom, grp, lgcTp, len, scale, def]) => ({ domNm, keyDom, grp, lgcTp, len, scale, def })))
  out('terms.json', [...terms.values()].sort((a, b) => a.termNm.localeCompare(b.termNm, 'ko')))
  out('codes.json', codes)
  for (const [f, j] of Object.entries(models)) fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
  fs.writeFileSync(path.join(STD_DIR, '_build_log.txt'), [...renamed, '', ...entChg, '', ...phyChg, '', ...domFix].join('\n') + '\n')
  console.log('기록 완료')
}
