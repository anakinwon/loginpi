// 논리 모델 CUS(고객) 생성기 — 개념 모델 승계 + 기본·일반 엔터티 정의 → model/logical/CUS.json, docs/04_logical_CUS.md
// 실행 : node tools/lgl_CUS_build.js (점검) / node tools/lgl_CUS_build.js --write (기록)
// 표준사전(model/std)·단어 원장(tools/std_words.js)은 읽기만 한다. 사전에 없는 용어·단어는 newTerms(newWords)로 올린다.
// 03 논리 관문(2026-11-07) 이후 model/logical JSON 이 정본 — 이 생성기를 다시 돌리면 관문 수정(형식 통일·FK 보강·표준 병합)이 되돌아간다
if (!process.argv.includes('--force-after-03')) { console.error('03 논리 관문 이후 실행 차단 — JSON 을 직접 고치고 reviews/03_logical.md 를 보라(강제 : --force-after-03)'); process.exit(1) }
const fs = require('fs')
const path = require('path')

const ROOT = process.env.PITEL_ROOT
const OUT = process.env.PITEL_OUT
const AREA = 'CUS'
const WRITE = process.argv.includes('--write')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))

// ---------- 신규 표준단어(원장 미등재) — newTerms[].newWords 로 올린다 ----------
const NEW_WORDS = [
  ['수단', 'MEANS', 'Means', '어떤 일을 이루기 위한 방법·도구'],
  ['실패', 'FAIL', 'Failure', '목적한 처리가 이루어지지 않음'],
  ['담당자', 'PIC', 'Person In Charge', '업무를 맡은 사람(합성어 — 담당+자)'],
  ['부서', 'DEPT', 'Department', '조직 안의 업무 단위'],
  ['직위', 'JBPS', 'Job Position', '조직 안의 직급·직책'],
  ['본사', 'HQ', 'Headquarters', '여러 사업장을 거느린 주된 사업장'],
  ['필수', 'ESNTL', 'Essential', '반드시 있어야 함'],
  ['마케팅', 'MKT', 'Marketing', '광고·판촉 활동'],
  ['거부', 'DENY', 'Denial', '받아들이지 않겠다는 의사 표시(수신거부)'],
  ['멤버십', 'MBSP', 'Membership', '고객 우대 회원 제도'],
  ['포인트', 'POINT', 'Point', '멤버십 적립·사용 단위 점수'],
  ['상담', 'CNSL', 'Consultation', '고객 문의에 응대하는 행위'],
  ['민원', 'CVLCPT', 'Civil Complaint', '고객이 제기한 불만·이의 신청'],
  ['보상', 'CMPNS', 'Compensation', '손해를 갚아 줌'],
  ['활성', 'ACTV', 'Active', '현재 사용 중인 상태'],
]

// ---------- 단어 사전(원장 전체 + 신규) ----------
const ledger = require(path.join(ROOT, 'tools/std_words.js')).trim().split('\n').map((l) => {
  const [wordNm, abbr, engNm, def, cls = ''] = l.split('|')
  const ent = cls.match(/E(_[A-Z])/)
  const attr = cls.match(/A:(\S+)/)
  return { wordNm, abbr, engNm, def, entClss: !!ent, attrClss: !!attr, tblSfx: ent ? ent[1] : null, keyDom: attr ? attr[1] : null }
})
const errs = []
const byNm = new Map(ledger.map((w) => [w.wordNm, w]))
const abbrs = new Map(ledger.map((w) => [w.abbr, w.wordNm]))
const newWordSet = new Set()
for (const [wordNm, abbr, engNm, def] of NEW_WORDS) {
  if (byNm.has(wordNm)) errs.push(`신규 단어가 이미 원장에 있음 : ${wordNm}`)
  if (abbrs.has(abbr)) errs.push(`신규 약어 충돌 : ${abbr} (${abbrs.get(abbr)} / ${wordNm})`)
  byNm.set(wordNm, { wordNm, abbr, engNm, def, entClss: false, attrClss: false, tblSfx: null, keyDom: null })
  abbrs.set(abbr, wordNm)
  newWordSet.add(wordNm)
}

// std_build.js 와 같은 분할 규칙(최소 단어 수 → 1글자 단어 적은 쪽 → 앞 단어 긴 쪽)
const cost = (ws) => ws.length * 10 + ws.filter((w) => w.wordNm.length === 1).length
function better(a, b) {
  if (cost(a) !== cost(b)) return cost(a) < cost(b)
  for (let k = 0; k < a.length; k++) if (a[k].wordNm.length !== b[k].wordNm.length) return a[k].wordNm.length > b[k].wordNm.length
  return false
}
function segment(nm) {
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
  return best[nm.length] || null
}

// ---------- 표준용어·도메인 ----------
const domains = rd('model/std/domains.json')
const domSet = new Set(domains.map((d) => d.domNm))
const domTp = new Map(domains.map((d) => [d.domNm, d.lgcTp]))
const keyDefault = new Map()
for (const d of domains) if (!keyDefault.has(d.keyDom)) keyDefault.set(d.keyDom, d.domNm)
const terms = new Map(rd('model/std/terms.json').map((t) => [t.termNm, t]))
const codeTerms = new Set(rd('model/std/codes.json').map((c) => c.termNm))
const newTerms = new Map()

function termDef(seg) {
  const last = seg[seg.length - 1]
  const head = seg.slice(0, -1).map((w) => w.wordNm).join(' ')
  if (/^(유형|구분|종류)$/.test(seg[seg.length - 2]?.wordNm) && last.wordNm === '코드')
    return `${seg.slice(0, -2).map((w) => w.wordNm).join(' ')}의 ${seg[seg.length - 2].wordNm} 코드 — 공통코드(codes.json 신규 등재 필요)`
  return head ? `${head}의 ${last.wordNm} — ${last.def}` : last.def
}
function term(attrNm, domHint) {
  const t = terms.get(attrNm)
  if (t) {
    if (domHint && domHint !== t.domNm) errs.push(`표준용어 도메인 불일치 : ${attrNm} ${t.domNm} ≠ ${domHint}`)
    return t
  }
  if (newTerms.has(attrNm)) return newTerms.get(attrNm)
  const seg = segment(attrNm)
  if (!seg) { errs.push(`분할 실패(단어 미등재) : ${attrNm}`); return { termNm: attrNm, phyNm: '?', domNm: '?' } }
  const last = seg[seg.length - 1]
  if (!last.attrClss) errs.push(`속성 분류어로 끝나지 않음 : ${attrNm}`)
  const domNm = domHint || keyDefault.get(last.keyDom)
  if (!domSet.has(domNm)) errs.push(`도메인 없음 : ${attrNm} ${domNm}`)
  const nt = { termNm: attrNm, words: seg.map((w) => w.wordNm), phyNm: seg.map((w) => w.abbr).join('_'), domNm, def: termDef(seg) }
  const nw = seg.filter((w) => newWordSet.has(w.wordNm)).map((w) => ({ wordNm: w.wordNm, abbr: w.abbr, engNm: w.engNm, def: w.def }))
  if (nw.length) nt.newWords = nw
  newTerms.set(attrNm, nt)
  return nt
}
function entPhy(entNm) {
  const seg = segment(entNm)
  if (!seg) { errs.push(`엔터티명 분할 실패 : ${entNm}`); return '?' }
  const last = seg[seg.length - 1]
  if (!last.entClss) { errs.push(`엔터티 분류어로 끝나지 않음 : ${entNm}`); return '?' }
  seg.filter((w) => newWordSet.has(w.wordNm)).forEach((w) => entNewWords.add(w.wordNm))
  // 엔터티 phyNm = 접두어 없는 <약어>_<분류어 약어>(개념 모델 K1), tblNm = 테이블명 미리보기 PTL_<영역>_<약어>_<접미어>
  const body = seg.slice(0, -1).map((w) => w.abbr)
  tblOf.set(entNm, ['PTL', AREA, ...body, last.tblSfx.slice(1)].join('_'))
  return [...body, last.abbr].join('_')
}
const tblOf = new Map()
const entNewWords = new Set()

// ---------- 다른 주제영역 부모(개념 모델 PK 그대로) ----------
const FOREIGN = {
  'PAY.청구주기코드': ['청구주기코드'],
  'PRM.파트너기본': ['파트너번호'],
  'PRM.조직기본': ['조직코드'],
  'ORD.가입신청기본': ['가입신청번호'],
  'ORD.회선기본': ['서비스관리번호'],
}
for (const k of Object.keys(FOREIGN)) {
  const [ar, ent] = k.split('.')
  const c = rd(`model/conceptual/${ar}.json`).entities.find((e) => e.entNm === ent)
  if (!c) { errs.push(`다른 주제영역 부모 없음 : ${k}`); continue }
  const pk = c.keyAttrs.filter((a) => a.role === 'PK').map((a) => a.attrNm)
  if (pk.join() !== FOREIGN[k].join()) errs.push(`부모 PK 불일치 : ${k} ${pk} ≠ ${FOREIGN[k]}`)
  c.keyAttrs.filter((a) => a.role === 'PK').forEach((a) => term(a.attrNm, a.domNm))
}

// ---------- 엔터티 정의 ----------
// 속성 표기 : [속성명, 플래그, FK, 정의(선택), 도메인(선택)]
//  플래그 P = PK, M = 필수(NOT NULL), 빈 문자열 = 선택(NULL 허용). PK 는 자동 필수.
//  FK : '부모엔터티' | '영역.부모엔터티' | '부모엔터티>부모속성'(역할명) | '부모엔터티#그룹'(같은 부모 두 번째 관계) — 배열이면 FK 여러 개에 동시 참여
// 관계 이름 : RELNM['자식|부모#그룹'] (없으면 기본 문구)
const cncp = rd(`model/conceptual/${AREA}.json`)
const C = Object.fromEntries(cncp.entities.map((e) => [e.entNm, e]))
// 핵심 엔터티 : 개념 모델 keyAttrs 그대로 + FK·필수 표시 + 논리 단계 보강 속성
const CORE_FK = {
  고객기본: {},
  개인고객상세: { 고객번호: '고객기본' },
  법인고객상세: { 고객번호: '고객기본' },
  청구계정기본: { 고객번호: ['고객기본', '고객주소상세#청구지'], 납부자번호: '납부자기본', 청구주기코드: 'PAY.청구주기코드', 청구지주소순번: '고객주소상세#청구지>주소순번' },
  납부자기본: { 고객번호: '고객기본' },
  고객연락처상세: { 고객번호: '고객기본' },
  고객주소상세: { 고객번호: '고객기본', 지역코드: '지역코드', 우편번호: '우편번호기본' },
  고객동의내역: { 고객번호: '고객기본', 동의항목유형코드: '동의항목코드', 동의항목버전번호: '동의항목코드' },
  고객등급이력: { 고객번호: '고객기본' },
  지역코드: { 상위지역코드: '지역코드>지역코드' },
}
const CORE_REQ = { 청구계정기본: ['고객번호', '납부자번호', '청구주기코드', '청구계정유형코드', '청구서수령방법유형코드', '통합청구여부'], 고객기본: ['고객유형코드', '내외국인구분코드', '명의도용신고여부'], 고객동의내역: ['고객번호', '동의항목유형코드', '동의항목버전번호', '동의여부'], 고객연락처상세: ['연락처유형코드', '연락처내용', '대표연락처여부'], 고객주소상세: ['주소유형코드', '지역코드', '대표주소여부'], 납부자기본: ['납부자유형코드'], 고객등급이력: ['고객등급유형코드'], 지역코드: ['지역단계구분코드'] }
const CORE_ADD = {
  // 논리 단계 보강 — 개념 모델에 없던 업무 필수 속성
  고객주소상세: [['고객주소변경사유유형코드', '', null, '주소 변경 사유(이사·반송·정정) — 현재값의 마지막 변경 사유']],
}

const BASIC = [
  { entNm: '고객이력', tp: 'ACT', def: '고객기본 주요 속성(이름·상태·유형·등급·명의도용)의 변경 전후를 유효 기간(SCD2)으로 보존. 현재행은 유효종료일시 = 9999-12-31 23:59:59.', attrs: [
    ['고객번호', 'P', '고객기본'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['고객명', 'M'], ['고객상태유형코드', 'M'], ['고객유형코드', 'M'], ['고객등급유형코드', ''], ['명의도용신고여부', 'M'], ['고객변경사유유형코드', 'M'], ['변경채널유형코드', ''],
  ] },
  { entNm: '실명인증내역', tp: 'ACT', def: '가입·명의변경·본인확인 시 수행한 실명인증(신분증 진위확인·휴대폰 본인확인 등) 1건. 신규 가입 전 인증은 고객번호가 없다(가입신청번호로 연결, 확정 후 고객번호 채움).', attrs: [
    ['실명인증번호', 'P'], ['고객번호', '', '고객기본'], ['가입신청번호', '', 'ORD.가입신청기본'], ['파트너번호', '', 'PRM.파트너기본', '인증을 수행한 매장(유통망) — 온라인 인증은 NULL'], ['인증대상명', 'M'], ['실명인증일시', 'M'], ['실명인증결과유형코드', 'M'], ['실명인증수단유형코드', 'M'], ['신분증종류코드', ''], ['신분증발급일자', ''], ['실명확인번호암호화값', 'M'], ['인증실패사유유형코드', ''],
  ] },
  { entNm: '법정대리인상세', tp: 'BASE', def: '미성년(만 19세 미만)·피후견 고객의 법정대리인. 가입·요금제 변경 동의 주체. 대리인이 자사 고객이면 대리인고객번호(역할명)로 연결.', attrs: [
    ['고객번호', 'P', '고객기본'], ['법정대리인순번', 'P'], ['법정대리인고객번호', '', '고객기본#대리인>고객번호'], ['법정대리인명', 'M'], ['법정대리인관계유형코드', 'M'], ['법정대리인생년월일', ''], ['법정대리인휴대전화번호', ''], ['법정대리인동의일시', 'M'], ['법정대리인관계종료일자', ''],
  ] },
  { entNm: '법인담당자상세', tp: 'BASE', def: '법인 고객의 업무 담당자(계약·요금·기술). 법인 1곳에 여러 명, 담당 유형별 대표 1명.', attrs: [
    ['고객번호', 'P', '법인고객상세'], ['담당자순번', 'P'], ['담당자명', 'M'], ['담당자유형코드', 'M'], ['담당자부서명', ''], ['담당자직위명', ''], ['담당자휴대전화번호', ''], ['담당자이메일주소', '', null, null, '주소V100'], ['대표담당자여부', 'M'], ['담당자등록일시', 'M'], ['담당자상태유형코드', 'M'],
  ] },
  { entNm: '법인사업장상세', tp: 'BASE', def: '법인 고객의 사업장(본사·지점). 사업장별 사업자등록번호·주소를 갖고 법인 회선의 설치·청구 위치가 된다.', attrs: [
    ['고객번호', 'P', '법인고객상세'], ['사업장순번', 'P'], ['지역코드', 'M', '지역코드'], ['우편번호', '', '우편번호기본'], ['사업장명', 'M'], ['사업장사업자등록번호', ''], ['도로명주소', ''], ['상세주소', ''], ['사업장대표전화번호', ''], ['본사여부', 'M'], ['사업장등록일시', 'M'], ['사업장상태유형코드', 'M'],
  ] },
  { entNm: '고객관계', tp: 'BASE', def: '고객과 고객 사이의 관계(가족·법인 소속 임직원·법정대리) — 고객↔고객 N:M 해소. 가족결합·법인 임직원 요금 대납의 근거.', attrs: [
    ['고객번호', 'P', '고객기본'], ['관계고객번호', 'P', '고객기본#관계>고객번호'], ['고객관계유형코드', 'P'], ['관계시작일자', 'M'], ['관계종료일자', ''], ['관계증빙유형코드', ''], ['관계확인일시', ''], ['관계상태유형코드', 'M'],
  ] },
  { entNm: '청구계정이력', tp: 'ACT', def: '청구계정 속성(이름·상태·납부자·청구주기·유형·통합청구)의 변경 이력(SCD2). 청구주기 변경은 다음 청구월부터 적용.', attrs: [
    ['청구계정번호', 'P', '청구계정기본'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['납부자번호', 'M', '납부자기본'], ['청구주기코드', 'M', 'PAY.청구주기코드'], ['청구계정명', 'M'], ['청구계정상태유형코드', 'M'], ['청구계정유형코드', 'M'], ['통합청구여부', 'M'], ['청구계정변경사유유형코드', 'M'],
  ] },
  { entNm: '청구서수령방법이력', tp: 'ACT', def: '청구서 수령 방법(우편·이메일·모바일·문자·미발행)과 수령처 변경 이력(SCD2). 청구 시점 수령 방법 재현용.', attrs: [
    ['청구계정번호', 'P', '청구계정기본'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['청구서수령방법유형코드', 'M'], ['청구서이메일주소', ''], ['청구서수신휴대전화번호', ''], ['변경채널유형코드', ''],
  ] },
  { entNm: '납부자이력', tp: 'ACT', def: '납부자 속성(이름·상태·유형·명의자 관계·연락처) 변경 이력(SCD2).', attrs: [
    ['납부자번호', 'P', '납부자기본'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['납부자명', 'M'], ['납부자상태유형코드', 'M'], ['납부자유형코드', 'M'], ['명의자관계유형코드', ''], ['납부자휴대전화번호', ''], ['납부자이메일주소', ''],
  ] },
  { entNm: '고객연락처이력', tp: 'ACT', def: '고객연락처상세 1건(고객번호+연락처순번)의 값·상태 변경 이력(SCD2). 개인정보 — 파기 시 연락처내용 마스킹.', attrs: [
    ['고객번호', 'P', '고객연락처상세'], ['연락처순번', 'P', '고객연락처상세'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['연락처유형코드', 'M'], ['연락처내용', 'M'], ['연락처상태유형코드', 'M'], ['대표연락처여부', 'M'], ['변경채널유형코드', ''],
  ] },
  { entNm: '고객주소이력', tp: 'ACT', def: '고객주소상세 1건(고객번호+주소순번)의 주소 변경 이력(SCD2). 반송·이사 추적.', attrs: [
    ['고객번호', 'P', '고객주소상세'], ['주소순번', 'P', '고객주소상세'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['지역코드', 'M', '지역코드'], ['우편번호', '', '우편번호기본'], ['주소유형코드', 'M'], ['도로명주소', ''], ['상세주소', ''], ['주소상태유형코드', 'M'], ['고객주소변경사유유형코드', 'M'], ['변경채널유형코드', ''],
  ] },
  { entNm: '동의항목코드', tp: 'REF', def: '동의 항목(개인정보 수집·이용 필수/선택, 마케팅 수신, 제3자 제공, 위치정보 등)과 그 약관 버전. 같은 항목의 약관 개정 = 새 버전 행.', attrs: [
    ['동의항목유형코드', 'P'], ['동의항목버전번호', 'P'], ['동의항목명', 'M'], ['필수동의여부', 'M'], ['동의항목내용', ''], ['동의유효개월수', ''], ['적용시작일자', 'M'], ['적용종료일자', ''], ['동의항목등록일시', 'M'], ['동의항목상태유형코드', 'M'],
  ] },
  { entNm: '고객동의이력', tp: 'ACT', def: '고객동의내역 1건의 상태 변경(동의→철회·만료·파기, 재동의) 이력(SCD2). 동의 증빙 보존 의무로 삭제 없음.', attrs: [
    ['고객동의번호', 'P', '고객동의내역'], ['유효시작일시', 'P'], ['유효종료일시', 'M'], ['동의상태유형코드', 'M'], ['동의여부', 'M'], ['동의채널유형코드', 'M'], ['동의변경사유유형코드', ''],
  ] },
  { entNm: '마케팅수신거부내역', tp: 'ACT', def: '광고성 정보 수신거부(정보통신망법 제50조) 1건 — 080 수신거부·고객센터·앱. 비고객 번호의 거부도 받으므로 고객번호는 선택.', attrs: [
    ['수신거부번호', 'P'], ['고객번호', '', '고객기본'], ['수신거부전화번호', 'M'], ['수신거부일시', 'M'], ['수신거부매체유형코드', 'M'], ['수신거부채널유형코드', 'M'], ['수신거부상태유형코드', 'M'], ['수신거부해제일시', ''],
  ] },
  { entNm: '우편번호기본', tp: 'REF', def: '도로명주소 기초구역 우편번호(5자리)와 소속 지역. 주소 정제·도서산간 배송 판정 기준.', attrs: [
    ['우편번호', 'P'], ['지역코드', 'M', '지역코드'], ['도서산간여부', 'M'], ['적용시작일자', 'M'], ['적용종료일자', ''], ['우편번호등록일시', 'M'], ['우편번호상태유형코드', 'M'],
  ] },
  { entNm: '고객멤버십기본', tp: 'BASE', def: '고객의 멤버십 가입(1고객 1멤버십). 등급은 고객 등급·회선 요금 기준으로 매년 산정. 포인트 잔액은 포인트내역 합계(파생 — 물리 단계 반정규화 후보).', attrs: [
    ['멤버십번호', 'P'], ['고객번호', 'M', '고객기본'], ['멤버십카드번호', ''], ['멤버십가입일시', 'M'], ['멤버십등급유형코드', 'M'], ['멤버십상태유형코드', 'M'], ['멤버십유효종료일자', ''], ['멤버십해지일시', ''],
  ] },
  { entNm: '멤버십포인트내역', tp: 'ACT', def: '멤버십 포인트 적립·사용·소멸·취소·조정 거래 1건. 사용처는 제휴사(PRM 파트너). 취소 거래는 원거래 순번을 가리킨다.', attrs: [
    ['멤버십번호', 'P', ['고객멤버십기본', '멤버십포인트내역#원거래>멤버십번호']], ['포인트거래순번', 'P', null, null, '순번N10'], ['파트너번호', '', 'PRM.파트너기본', '포인트 사용 제휴처 — 적립·소멸은 NULL(S5)'], ['원포인트거래순번', '', '멤버십포인트내역#원거래>포인트거래순번', '취소·조정 대상 원거래(같은 멤버십 안)', '순번N10'], ['포인트거래일시', 'M'], ['포인트거래유형코드', 'M'], ['거래포인트수', 'M'], ['포인트소멸예정일자', ''],
  ] },
  { entNm: '고객상담내역', tp: 'ACT', def: '고객센터·매장·채팅 상담 1건. 비고객(가입 문의)도 있어 고객번호 선택, 회선 관련 상담이면 서비스관리번호. 상담내용은 자유 서술(S9 넓은 행).', attrs: [
    ['상담번호', 'P'], ['고객번호', '', '고객기본'], ['서비스관리번호', '', 'ORD.회선기본'], ['조직코드', '', 'PRM.조직기본', '상담을 처리한 조직(고객센터·매장)'], ['상담일시', 'M'], ['상담채널유형코드', 'M'], ['상담유형코드', 'M'], ['상담결과유형코드', 'M'], ['상담초수', ''], ['상담내용', '', null, null, '내용V4000'], ['민원전환여부', 'M'],
  ] },
  { entNm: '고객민원내역', tp: 'ACT', def: '민원(요금 이의·부당 가입·해지 지연·품질) 접수·처리 1건. 외부 기관(방송통신위원회·한국소비자원) 이관 민원 포함. 상담에서 전환되면 상담번호.', attrs: [
    ['민원번호', 'P'], ['고객번호', 'M', '고객기본'], ['상담번호', '', '고객상담내역'], ['서비스관리번호', '', 'ORD.회선기본'], ['민원접수일시', 'M'], ['민원유형코드', 'M'], ['민원접수채널유형코드', 'M'], ['민원처리상태유형코드', 'M'], ['민원내용', '', null, null, '내용V4000'], ['처리기한일자', ''], ['처리완료일시', ''], ['처리결과내용', '', null, null, '내용V4000'], ['보상금액', ''],
  ] },
  { entNm: '고객월통계', tp: 'PROC', def: '고객 × 기준년월 집계(세분·회선 수·청구·수납). 월 마감 배치가 ORD·PAY·INV 원천에서 산출하는 가공 엔터티(ARPU = 청구금액÷회선수는 저장하지 않음 — 행 내 파생).', attrs: [
    ['기준년월', 'P'], ['고객번호', 'P', '고객기본'], ['고객유형코드', 'M'], ['고객등급유형코드', ''], ['지역코드', '', '지역코드', '기준월 대표 주소의 지역(집계 시점 스냅숏)'], ['회선수', 'M'], ['활성회선수', 'M'], ['청구금액', 'M'], ['수납금액', 'M'], ['미납금액', 'M'], ['가입기간개월수', ''],
  ] },
]

const RELNM = {
  '청구계정기본|고객주소상세#청구지': '청구지 주소로 발송한다(우편 수령만 — 역할명 청구지주소순번)',
  '법정대리인상세|고객기본#대리인': '자사 고객이 법정대리인이 된다(역할명 법정대리인고객번호)',
  '고객관계|고객기본#관계': '관계 상대 고객이 된다(역할명 관계고객번호)',
  '지역코드|지역코드': '상위 지역에 속한다(자기 참조, 시도는 NULL)',
  '멤버십포인트내역|멤버십포인트내역#원거래': '취소·조정이 원거래를 가리킨다(자기 참조)',
}

// ---------- 조립 ----------
const entities = []
const entByNm = new Map()
let seqNo = 0
function build(entNm, tp, stg, def, attrSpecs, extra = {}) {
  const ent = { entId: `${AREA}-${String(++seqNo).padStart(3, '0')}`, entNm, phyNm: entPhy(entNm), tblNm: null, tp, stg, def, ...extra, attrs: [], rels: [], _fk: [] }
  attrSpecs.forEach(([attrNm, flag = '', fk = null, adef = null, dom = null], i) => {
    const t = term(attrNm, dom)
    const pk = flag.includes('P')
    const a = { attrNm, phyNm: t.phyNm, domNm: t.domNm, pk, fk: null, nullYn: !(pk || flag.includes('M')), seq: i + 1, def: adef || t.def }
    ent.attrs.push(a)
    for (const f of [].concat(fk || [])) ent._fk.push({ a, f })
  })
  entities.push(ent)
  entByNm.set(entNm, ent)
  return ent
}

for (const c of cncp.entities) {
  const fkm = CORE_FK[c.entNm] || {}
  const req = new Set(CORE_REQ[c.entNm] || [])
  const specs = c.keyAttrs.map((k) => [k.attrNm, k.role === 'PK' ? 'P' : (['NM', 'DTM', 'STS'].includes(k.role) || req.has(k.attrNm) ? 'M' : ''), fkm[k.attrNm] || null, k.def || null, k.domNm])
  ;(CORE_ADD[c.entNm] || []).forEach((s) => specs.push(s))
  // 칼럼 순서 규칙(PK → FK → 일반)
  specs.sort((x, y) => (y[1].includes('P') - x[1].includes('P')) || (!!y[2] - !!x[2]))
  build(c.entNm, c.tp, 'CNCP', c.def, specs, { _cp: c.phyNm, _ct: c.tblNm })
}
for (const b of BASIC) {
  const specs = [...b.attrs].sort((x, y) => (y[1].includes('P') - x[1].includes('P')) || (!!y[2] - !!x[2]))
  build(b.entNm, b.tp, 'LGCL', b.def, specs)
}
// 엔터티 이름 = 테이블 이름 일치 확인(개념 모델 tblNm)
for (const e of entities) {
  e.tblNm = tblOf.get(e.entNm)
  if (e._cp && e._cp !== e.phyNm) errs.push(`개념 phyNm 불일치 ${e.entNm} ${e._cp} ≠ ${e.phyNm}`)
  if (e._ct && e._ct !== e.tblNm) errs.push(`개념 tblNm 불일치 ${e.entNm} ${e._ct} ≠ ${e.tblNm}`)
  delete e._cp; delete e._ct
}

// FK → fk·rels
for (const e of entities) {
  const groups = new Map()
  for (const { a, f } of e._fk) {
    const m = f.match(/^(?:([A-Z]{3})\.)?([^#>]+)(?:#([^>]+))?(?:>(.+))?$/)
    const [, ar = AREA, pEnt, grp = '', pAttr = a.attrNm] = m
    const key = `${ar}.${pEnt}#${grp}`
    let parentPk
    if (ar === AREA) {
      const p = entByNm.get(pEnt)
      if (!p) { errs.push(`부모 엔터티 없음 ${e.entNm} → ${pEnt}`); continue }
      parentPk = p.attrs.filter((x) => x.pk)
      const pa = parentPk.find((x) => x.attrNm === pAttr)
      if (!pa) errs.push(`부모 PK 속성 아님 ${e.entNm}.${a.attrNm} → ${pEnt}.${pAttr}`)
      else if (pa.domNm !== a.domNm) errs.push(`FK 도메인 불일치 ${e.entNm}.${a.attrNm} ${a.domNm} ≠ ${pa.domNm}`)
    } else if (!FOREIGN[`${ar}.${pEnt}`]?.includes(pAttr)) errs.push(`외부 부모 PK 미정의 ${ar}.${pEnt}.${pAttr}`)
    a.fk = a.fk || { ent: pEnt, attr: pAttr, area: ar }
    if (a.fk.ent !== pEnt || a.fk.attr !== pAttr) a.fk.also = [...(a.fk.also || []), { ent: pEnt, attr: pAttr, area: ar }]
    if (!groups.has(key)) groups.set(key, { ar, pEnt, grp, attrs: [], parentPk })
    groups.get(key).attrs.push(a)
  }
  for (const g of groups.values()) {
    if (g.parentPk && g.attrs.length !== g.parentPk.length) errs.push(`복합 FK 칼럼 수 불일치 ${e.entNm} → ${g.pEnt}`)
    const idn = g.attrs.every((a) => a.pk)
    const opt = g.attrs.some((a) => a.nullYn)
    const parent = g.ar === AREA ? g.pEnt : `${g.ar}.${g.pEnt}`
    const k = `${e.entNm}|${g.pEnt}${g.grp ? '#' + g.grp : ''}`
    const oneToOne = idn && g.parentPk && e.attrs.filter((x) => x.pk).length === g.parentPk.length
    e.rels.push({
      relNm: RELNM[k] || `${g.pEnt}의 ${e.entNm}`,
      parent, child: e.entNm, card: oneToOne ? '1:1' : '1:N', idn, opt,
      fkAttrs: g.attrs.map((a) => a.attrNm),
    })
  }
  delete e._fk
}

// 정규화 점검 메모(엔터티별) — 반복 그룹·부분 종속·이행 종속 검토 결과
const NORM = {
  고객기본: '1NF: 연락처·주소·동의 반복 그룹을 상세 엔터티로 분리. 2NF: 단일 PK. 3NF: 고객등급명은 코드값에서 파생되어 두지 않음(등급유형코드만). 현재 등급(고객등급유형코드)은 고객등급이력 현재행과 중복이지만 개념 결정 C3(현재값+이력 쌍) 유지 — 이력이 정본, 기본은 현재 스냅숏.',
  개인고객상세: '1NF·2NF 충족(PK = 고객번호 1:1 서브타입). 3NF: 성별·생년월일은 실명확인번호에서 파생 가능하나 원본은 암호화값이라 복호 없이 쓰도록 별도 보관(D11 — 파생 아님으로 판정).',
  법인고객상세: '1NF: 사업장·담당자 반복 그룹을 법인사업장상세·법인담당자상세로 분리. 2NF·3NF 충족(업종명은 업종코드에서 파생 — 두지 않음).',
  청구계정기본: '2NF: 단일 PK. 3NF: 청구지 주소 본문은 고객주소상세 참조(청구지주소순번)로만 두어 이행 종속 제거. 납부자 이름·연락처는 납부자기본 소유.',
  납부자기본: '3NF: 자사 고객 납부자의 이름·생년월일은 고객기본과 중복될 수 있으나 비고객 납부자 공통 속성이고 청구 시점 납부자 명의 보존 목적 — 이행 종속 아님(고객번호 → 납부자명 함수 종속이 성립하지 않음, 법인 대납 등).',
  고객연락처상세: '1NF: 연락 수단마다 1행(반복 그룹 해소). 2NF: 비키 속성은 (고객번호, 연락처순번) 전체에 종속. 3NF 충족.',
  고객주소상세: '1NF: 주소마다 1행. 3NF: 지역명은 지역코드, 도서산간은 우편번호기본에서 조회(두지 않음). 지역코드(법정동 10자리)는 우편번호(기초구역)로 결정되지 않아 이행 종속 아님.',
  고객동의내역: '2NF: 행위 번호 단일 PK. 3NF: 동의항목명·필수여부는 동의항목코드(유형코드+버전)로 이동, 여기에는 FK만.',
  고객등급이력: '2NF: (고객번호, 등급적용시작일시) 전체 종속. 고객등급명은 산정 당시 명칭 보존(개념 C9 — 시점 스냅숏, 이행 종속 예외로 기록).',
  지역코드: '3NF: 상위 지역 이름은 자기 참조로 조회(두지 않음). 계층 = 자기 참조 1:N.',
  고객이력: '2NF: (고객번호, 유효시작일시) 전체 종속. 이력 엔터티는 변경 시점 스냅숏이라 고객기본과의 값 중복은 이행 종속 아님.',
  실명인증내역: '1NF·2NF 충족(행위 번호 PK). 3NF: 인증 매장 이름은 파트너기본에서 조회. 인증대상명은 고객 확정 전 값이라 고객기본과 별개.',
  법정대리인상세: '1NF: 대리인 2명(부·모) 반복 → 순번 행. 3NF: 대리인이 자사 고객이어도 이름·생년월일을 남기는 이유 = 동의 당시 증빙(스냅숏).',
  법인담당자상세: '1NF: 담당자마다 1행. 2NF·3NF 충족.',
  법인사업장상세: '1NF: 사업장마다 1행. 3NF: 지역명·도서산간은 지역코드·우편번호기본에서 조회.',
  고객관계: 'N:M 해소(고객↔고객). PK = (고객번호, 관계고객번호, 고객관계유형코드) — 같은 두 고객이 가족이면서 법정대리 관계일 수 있어 유형까지 키. 2NF·3NF 충족.',
  청구계정이력: '2NF·3NF 충족(변경 시점 스냅숏). 청구주기 이름 등은 PAY.청구주기코드 조회.',
  청구서수령방법이력: '청구계정기본에서 수령 방법 변경만 따로 떼어 빈도 높은 변경을 분리(청구계정이력 행 폭증 방지). 2NF·3NF 충족.',
  납부자이력: '2NF·3NF 충족(변경 시점 스냅숏).',
  고객연락처이력: '부모 = 고객연락처상세(복합 PK 상속, 식별). 2NF: 비키 속성은 키 전체(유효시작일시 포함)에 종속. 3NF 충족.',
  고객주소이력: '부모 = 고객주소상세(복합 PK 상속, 식별). 3NF: 지역명 등은 코드 조회.',
  동의항목코드: '2NF: 동의항목명·필수동의여부는 (유형코드, 버전) 전체에 종속 — 개정 시 명칭·필수 여부가 바뀔 수 있음. 3NF 충족.',
  고객동의이력: '2NF·3NF 충족. 동의항목·고객은 부모 고객동의내역에서 조회(중복 보관하지 않음).',
  마케팅수신거부내역: '3NF: 수신거부전화번호는 비고객 거부 때문에 고객번호로 결정되지 않음 — 이행 종속 아님.',
  우편번호기본: '3NF: 시도·시군구 이름은 지역코드 → 지역코드 엔터티로 이행 종속이라 두지 않음.',
  고객멤버십기본: '3NF: 포인트 잔액은 멤버십포인트내역 합계(파생)라 논리 모델에서 제외 — 물리 반정규화 후보.',
  멤버십포인트내역: '2NF: (멤버십번호, 포인트거래순번) 전체 종속. 3NF: 제휴처 이름은 PRM 조회.',
  고객상담내역: '3NF: 고객·회선·조직 이름은 각 부모에서 조회. 상담내용 1건 = 원자값(1NF).',
  고객민원내역: '3NF 충족. 상담번호로 상담과 1:N(한 상담에서 여러 민원 가능성 낮으나 허용).',
  고객월통계: 'PROC 가공 엔터티 — 집계값은 원천 대비 파생이지만 월 마감 스냅숏이 정본(재계산 불가 시점 보존). 행 내 파생(ARPU) 제외로 3NF 형태 유지. 고객유형·등급·지역은 기준월 스냅숏.',
}
for (const e of entities) { e.normNote = NORM[e.entNm] || ''; if (!e.normNote) errs.push(`정규화 메모 없음 ${e.entNm}`) }

// 핵심 엔터티 필수 4종 점검
for (const e of entities.filter((x) => x.stg === 'CNCP')) {
  const c = C[e.entNm]
  for (const r of ['PK', 'NM', 'DTM', 'STS']) if (!c.keyAttrs.some((k) => k.role === r)) errs.push(`필수 4종 누락 ${e.entNm} ${r}`)
  const sts = c.keyAttrs.find((k) => k.role === 'STS')
  if (sts && !/상태유형코드$/.test(sts.attrNm)) errs.push(`상태 속성 이름 ${e.entNm} ${sts.attrNm}`)
}
// 공통코드 이름 3종 점검 + 신규 코드 용어
const newCodeTerms = []
for (const e of entities) for (const a of e.attrs) {
  if (/코드$/.test(a.attrNm) && !/(유형|구분|종류)코드$/.test(a.attrNm)) {
    const ok = a.fk || ['국가코드', '업종코드', '청구주기코드', '조직코드', '지역코드', '상위지역코드'].includes(a.attrNm) || (e.tp === 'REF' && a.pk)
    if (!ok) errs.push(`공통코드 이름 3종 위반 ${e.entNm}.${a.attrNm}`)
  }
  if (/(유형|구분|종류)코드$/.test(a.attrNm) && !codeTerms.has(a.attrNm) && !newCodeTerms.includes(a.attrNm)) newCodeTerms.push(a.attrNm)
}
// 신규 공통코드 값 제안(codes.json 형식) — 표준사전 담당이 std_codes.js 에 반영
const CODE_VALS = {
  고객변경사유유형코드: '개명,상태변경,유형전환,등급변경,명의도용신고,정정',
  변경채널유형코드: '매장,고객센터,온라인,앱,시스템배치',
  실명인증결과유형코드: '성공,실패,보류,재인증요청',
  실명인증수단유형코드: '신분증진위확인,휴대폰본인확인,공동인증서,간편인증,대면확인',
  인증실패사유유형코드: '정보불일치,분실신분증,유효기간만료,명의도용의심,기관장애',
  법정대리인관계유형코드: '부,모,후견인,기타',
  담당자유형코드: '계약,요금,기술,총괄',
  담당자상태유형코드: '재직,퇴사,변경',
  사업장상태유형코드: '운영,휴업,폐업,이전',
  고객관계유형코드: '배우자,부모,자녀,형제자매,법인임직원,법정대리,기타',
  관계증빙유형코드: '가족관계증명서,주민등록등본,재직증명서,후견등기사항증명서',
  관계상태유형코드: '유효,종료,확인필요',
  청구계정변경사유유형코드: '납부자변경,청구주기변경,명칭변경,통합청구,상태변경',
  동의항목상태유형코드: '사용,개정대기,폐지',
  동의변경사유유형코드: '고객철회,유효기간만료,재동의,파기,법정대리인철회',
  수신거부매체유형코드: '문자,전화,이메일,앱푸시',
  수신거부채널유형코드: '080수신거부,고객센터,앱,매장,온라인',
  수신거부상태유형코드: '거부,해제',
  우편번호상태유형코드: '사용,폐지',
  멤버십등급유형코드: 'VIP,골드,실버,일반',
  멤버십상태유형코드: '정상,정지,해지',
  포인트거래유형코드: '적립,사용,소멸,취소,조정',
  상담채널유형코드: '전화,매장,채팅,앱,이메일',
  상담유형코드: '요금,가입,해지,분실도난,기술품질,부가서비스,기타',
  상담결과유형코드: '완료,재상담,이관,민원전환',
  민원유형코드: '요금이의,부당가입,해지지연,통화품질,개인정보,기타',
  민원접수채널유형코드: '고객센터,매장,방송통신위원회,한국소비자원,홈페이지',
  민원처리상태유형코드: '접수,처리중,이관,완료,종결',
  고객주소변경사유유형코드: '이사,반송,정정,신규등록',
}
const codesProposal = newCodeTerms.map((tn) => {
  const kind = tn.match(/(유형|구분|종류)코드$/)[1]
  const v = CODE_VALS[tn]
  if (!v) errs.push(`신규 공통코드 값 없음 ${tn}`)
  const vals = (v || '').split(',').filter(Boolean)
  if (kind === '구분' && vals.length > 3) errs.push(`구분코드 4개 이상 ${tn}`)
  return { termNm: tn, kind, vals: vals.map((nm, i) => ({ cd: String(i + 1).padStart(2, '0'), nm, def: `${tn.replace(/(유형|구분|종류)코드$/, '')} '${nm}'` })) }
})

const out = {
  area: AREA, areaNm: '고객', ver: '2026-11-07', author: 'subagent_logical_modeler', stg: 'LGCL',
  summary: { entityCnt: entities.length, coreCnt: entities.filter((e) => e.stg === 'CNCP').length, basicCnt: entities.filter((e) => e.stg === 'LGCL').length, stlCnt: entities.filter((e) => e.moduleCd === 'STL').length, attrCnt: entities.reduce((s, e) => s + e.attrs.length, 0), relCnt: entities.reduce((s, e) => s + e.rels.length, 0), newTermCnt: newTerms.size, newWordCnt: NEW_WORDS.length, newCodeCnt: codesProposal.length },
  conventions: {
    rels: '엔터티의 rels = 그 엔터티가 자식(FK 보유)인 관계. card 는 부모:자식, idn = FK 가 자식 PK 에 포함, opt = 자식 FK 가 NULL 허용(부모 없이 존재 가능). 다른 주제영역 부모는 parent = "<영역>.<엔터티>". CUS 가 부모이고 자식이 다른 주제영역인 관계는 그 영역 논리 모델이 소유(문서 3절 목록).',
    fk: 'fk = {ent, attr, area} — 역할명 FK 는 attr 가 부모 PK 이름. 한 속성이 FK 두 개에 참여하면 also 배열.',
    history: '이력(_H) 엔터티 = 부모 PK + 유효시작일시(SCD2), 유효종료일시 현재행 9999-12-31 23:59:59.',
    stl: 'CUS 에는 정산 모듈(STL) 엔터티가 배치되지 않음(areas.json moduleEnts.STL = []).',
  },
  entities,
  newTerms: [...newTerms.values()].filter((t) => !terms.has(t.termNm)).sort((a, b) => a.termNm.localeCompare(b.termNm, 'ko')),
  newWords: NEW_WORDS.map(([wordNm, abbr, engNm, def]) => ({ wordNm, abbr, engNm, def, entClss: false, attrClss: false, tblSfx: null })),
  newCodes: codesProposal,
  decisions: [
    { id: 'L1', dec: '핵심 10개 = 개념 모델 그대로 승계(속성·PK 무변경), 논리 단계에서 FK·필수 여부·관계·정규화만 확정, 고객주소상세에 고객주소변경사유유형코드 1개 보강', why: '확정 엔터티 무단 재설계 금지(재호출 지침), 주소 이력의 변경 사유를 현재값에도 남겨 반송 처리 판단' },
    { id: 'L2', dec: '이력(_H) 7개는 부모 PK + 유효시작일시 SCD2 키', why: '표준사전에 이미 있는 유효시작일시·유효종료일시 용어 재사용(신규 용어 0), 시점 조회(BETWEEN) 단일 패턴. ORD 회선상태이력의 순번 방식은 상태 전이 순서가 업무 키인 경우라 다름' },
    { id: 'L3', dec: '고객동의내역 FK = 동의항목코드(동의항목유형코드 + 동의항목버전번호) 복합 참조', why: '개정된 약관 버전별 동의 증빙(개인정보보호법 제22조) — 유형코드만 참조하면 어느 약관에 동의했는지 잃음' },
    { id: 'L4', dec: '청구계정기본.청구지주소순번 → 고객주소상세(고객번호, 주소순번) 역할명 복합 FK, 고객번호는 고객기본 FK 와 겸용', why: '청구지는 반드시 소유 고객의 주소 중 하나(타 고객 주소 지정 차단)' },
    { id: 'L5', dec: '고객관계 = 고객↔고객 N:M 해소, PK 에 관계유형 포함', why: '가족결합(PRD·ORD)·법인 임직원 대납·법정대리 근거를 하나로, 같은 두 사람의 복수 관계 허용' },
    { id: 'L6', dec: '고객멤버십기본은 1고객 1멤버십이지만 대리 키 멤버십번호 사용', why: '멤버십 카드·포인트 거래가 해지 후 재가입 시 새 번호로 분리(국내 3사 멤버십 관행)' },
    { id: 'L7', dec: '포인트 잔액·ARPU 등 파생값은 논리 모델 제외', why: '3NF — 물리 단계 반정규화 후보로 문서에 기록' },
    { id: 'L8', dec: '법인담당자·법인사업장의 부모 = 법인고객상세(서브타입)', why: '법인에게만 존재하는 실체 — 개인 고객 번호로 담당자가 생기는 것을 관계로 차단' },
    { id: 'L9', dec: '시스템 칼럼 4개는 넣지 않음(D7), 삭제여부도 두지 않음 — 상태유형코드·종료일시로 생애 표현', why: 'CONTEXT D7·규칙 2절' },
  ],
}

// ---------- 문서 ----------
function md() {
  const L = []
  const s = out.summary
  L.push('# 04. 논리 모델 — CUS 고객', '', `> 작성 2026-11-07 · subagent_logical_modeler · 마스터 위임 자동 승인 모드 · 정본 \`model/logical/CUS.json\`(생성기 \`tools/lgl_CUS_build.js\`)`, `> 엔터티 ${s.entityCnt}(핵심 ${s.coreCnt} · 기본·일반 ${s.basicCnt} · 정산 STL ${s.stlCnt}) · 속성 ${s.attrCnt} · 관계 ${s.relCnt} · 신규 용어 ${s.newTermCnt} · 신규 단어 ${s.newWordCnt} · 신규 공통코드 ${s.newCodeCnt}`, '')
  L.push('## 1. 엔터티 목록', '', '| ID | 엔터티 | 물리명 | 테이블명(미리보기) | 유형 | 단계 | PK | 속성 수 | 설명 |', '|---|---|---|---|---|---|---|---|---|')
  for (const e of entities) L.push(`| ${e.entId} | ${e.entNm} | \`${e.phyNm}\` | \`${e.tblNm}\` | ${e.tp} | ${e.stg} | ${e.attrs.filter((a) => a.pk).map((a) => a.attrNm).join(' + ')} | ${e.attrs.length} | ${e.def.replace(/\|/g, '/')} |`)
  L.push('', '## 2. 엔터티별 속성', '')
  for (const e of entities) {
    L.push(`### ${e.entId} ${e.entNm} \`${e.phyNm}\` (${e.tp}·${e.stg})`, '', '| # | 속성 | 물리명 | 도메인 | PK | FK | NULL |', '|---|---|---|---|---|---|---|')
    for (const a of e.attrs) L.push(`| ${a.seq} | ${a.attrNm}${newTerms.has(a.attrNm) && !terms.has(a.attrNm) ? ' ★' : ''} | ${a.phyNm} | ${a.domNm} | ${a.pk ? 'PK' : ''} | ${a.fk ? (a.fk.area !== AREA ? a.fk.area + '.' : '') + a.fk.ent + '.' + a.fk.attr : ''} | ${a.nullYn ? 'Y' : 'N'} |`)
    L.push('', `정규화 : ${e.normNote}`, '')
  }
  L.push('★ = 신규 표준용어(newTerms).', '')
  L.push('## 3. 관계', '', '### 3.1 CUS 내부·CUS 가 자식인 관계', '', '| 부모 | 자식 | 카디널리티 | 식별 | 선택(FK NULL) | FK | 관계명 |', '|---|---|---|---|---|---|---|')
  for (const e of entities) for (const r of e.rels) L.push(`| ${r.parent} | ${r.child} | ${r.card} | ${r.idn ? '식별' : '비식별'} | ${r.opt ? '선택' : '필수'} | ${r.fkAttrs.join(', ')} | ${r.relNm} |`)
  L.push('', '### 3.2 CUS 가 부모인 교차 관계(자식 영역 논리 모델이 소유 — PK 이름·도메인 그대로 상속)', '', '| 부모(CUS) | 자식 | 카디널리티 | 상속 FK |', '|---|---|---|---|')
  const ownPk = { 고객기본: '고객번호 번호V20', 청구계정기본: '청구계정번호 번호V20', 납부자기본: '납부자번호 번호V20', 지역코드: '지역코드 코드V10' }
  const areas = rd('model/areas.json')
  for (const r of areas.crossRels.filter((x) => x.to.startsWith('CUS.') && !x.from.startsWith('CUS.'))) L.push(`| ${r.to.slice(4)} | ${r.from} | 1:N | ${ownPk[r.to.slice(4)] || ''} |`)
  L.push('', '## 4. Mermaid ERD', '', '```mermaid', 'erDiagram')
  const ali = new Map(entities.map((e) => [e.entNm, e.phyNm]))
  const ext = new Set()
  for (const e of entities) {
    L.push(`  ${ali.get(e.entNm)} ["${e.entNm}"] {`)
    for (const a of e.attrs.filter((x) => x.pk || x.fk)) L.push(`    ${(domTp.get(a.domNm) || 'varchar').toLowerCase()} ${a.phyNm} ${a.pk && a.fk ? 'PK,FK' : a.pk ? 'PK' : 'FK'}`)
    L.push('  }')
  }
  for (const e of entities) for (const r of e.rels) {
    let p = ali.get(r.parent)
    if (!p) { const [xa, xe] = r.parent.split('.'); p = 'X_' + rd(`model/conceptual/${xa}.json`).entities.find((x) => x.entNm === xe).tblNm.replace(/^PTL_/, ''); ext.add(`  ${p} ["${r.parent}(다른 영역)"] {\n    string KEY PK\n  }`) }
    L.push(`  ${p} ${r.opt ? '|o' : '||'}${r.idn ? '--' : '..'}${r.card === '1:1' ? 'o|' : 'o{'} ${ali.get(e.entNm)} : "${r.relNm.replace(/"/g, '')}"`)
  }
  L.push(...ext, '```', '')
  L.push('## 5. 신규 표준 요청(표준사전 담당 반영 대상)', '', '### 5.1 신규 표준단어', '', '| 단어 | 약어 | 영문 | 정의 |', '|---|---|---|---|')
  for (const w of out.newWords) L.push(`| ${w.wordNm} | ${w.abbr} | ${w.engNm} | ${w.def} |`)
  L.push('', '### 5.2 신규 표준용어', '', '| 용어 | 물리명 | 도메인 | 신규 단어 |', '|---|---|---|---|')
  for (const t of out.newTerms) L.push(`| ${t.termNm} | ${t.phyNm} | ${t.domNm} | ${(t.newWords || []).map((w) => w.wordNm).join(', ')} |`)
  L.push('', '### 5.3 신규 공통코드(값 제안)', '', '| 용어 | 종류 | 값 |', '|---|---|---|')
  for (const c of out.newCodes) L.push(`| ${c.termNm} | ${c.kind} | ${c.vals.map((v) => v.cd + ' ' + v.nm).join(' · ')} |`)
  L.push('', '## 6. 결정 메모', '', '| # | 결정 | 근거 |', '|---|---|---|')
  for (const d of out.decisions) L.push(`| ${d.id} | ${d.dec} | ${d.why} |`)
  L.push('', '## 7. 물리 단계 인계', '', '- 반정규화 후보 : 고객멤버십기본.포인트잔액(포인트내역 합계, 조회 빈도 높음), 고객월통계 ARPU.', '- 데이터 편향 대상 : 고객기본(S8 같은 이름 다수·S13 표기 흔들림), 납부자기본.고객번호(S5 NULL 쏠림), 고객상담내역.상담내용·고객민원내역(S9 넓은 행), 고객기본.고객상태유형코드(S3 정상 98%), 우편번호·지역(S10 대리점 상관·S12 앞자리 0).', '- 파티션 후보 : 고객상담내역·멤버십포인트내역(상담일시·포인트거래일시 RANGE 연), 고객월통계(기준년월 RANGE).', '- 이력 엔터티 현재행 조회용 부분 인덱스(유효종료일시 = 9999-12-31) 검토.', '')
  return L.join('\n')
}

// ---------- 출력 ----------
console.log(`엔터티 ${out.summary.entityCnt}(핵심 ${out.summary.coreCnt}) · 속성 ${out.summary.attrCnt} · 관계 ${out.summary.relCnt} · 신규 용어 ${out.newTerms.length} · 신규 코드 ${out.newCodes.length}`)
const unusedNew = NEW_WORDS.map((w) => w[0]).filter((w) => !out.newTerms.some((t) => t.words.includes(w)) && !entNewWords.has(w))
if (unusedNew.length) errs.push(`안 쓰인 신규 단어 : ${unusedNew}`)
if (errs.length) { console.log('오류 :\n ' + errs.join('\n ')); process.exit(1) }
if (WRITE) {
  fs.mkdirSync(path.join(OUT, 'model/logical'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(OUT, 'model/logical/CUS.json'), JSON.stringify(out, null, 2) + '\n')
  fs.writeFileSync(path.join(OUT, 'docs/04_logical_CUS.md'), md())
  console.log('기록 완료')
}
