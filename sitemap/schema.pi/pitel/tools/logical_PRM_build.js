// 파트너(PRM) 논리 모델 생성기 — 엔터티 명세(ENTS)를 표준사전으로 풀어 model/logical/PRM.json 과 docs/04_logical_PRM.md 를 만든다
// 실행 : node tools/logical_PRM_build.js (점검, -v 새 용어 목록) / node tools/logical_PRM_build.js --write (JSON·문서 기록)
// 사전에 없는 용어는 newTerms(다른 영역 논리 모델이 먼저 낸 용어·단어는 같은 이름·약어로 재사용, pendingFrom 표시), 새 공통코드는 newCodes
// 03 논리 관문(2026-11-07) 이후 model/logical JSON 이 정본 — 이 생성기를 다시 돌리면 관문 수정(형식 통일·FK 보강·표준 병합)이 되돌아간다
if (!process.argv.includes('--force-after-03')) { console.error('03 논리 관문 이후 실행 차단 — JSON 을 직접 고치고 reviews/03_logical.md 를 보라(강제 : --force-after-03)'); process.exit(1) }
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const AREA = 'PRM'
const words = rd('model/std/words.json')
const domains = rd('model/std/domains.json')
const terms = new Map(rd('model/std/terms.json').map((t) => [t.termNm, t]))
const codes = new Set(rd('model/std/codes.json').map((c) => c.termNm))

// 다른 주제영역 논리 모델이 먼저 낸 새 단어·용어·코드(표준 원장 반영 대기) — 같은 이름은 같은 약어로 재사용
const pendTerms = new Map()
const pendWords = new Map()
const pendCodes = new Set()
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  const a = f.replace('.json', '')
  if (a === AREA || !f.endsWith('.json')) continue
  const j = rd('model/logical/' + f)
  for (const w of j.newWords || []) if (!pendWords.has(w.wordNm)) pendWords.set(w.wordNm, { ...w, src: a })
  for (const t of j.newTerms || []) {
    if (!pendTerms.has(t.termNm)) pendTerms.set(t.termNm, { ...t, src: a })
    for (const w of t.newWords || []) if (!pendWords.has(w.wordNm)) pendWords.set(w.wordNm, { ...w, src: a })
  }
  for (const c of j.newCodes || []) pendCodes.add(c.termNm)
  for (const c of j.codeCandidates || []) pendCodes.add(c.termNm)
}

// PRM 새 표준단어(사전·다른 영역 미등재)
const NEW_WORDS = [
  { wordNm: '재고', abbr: 'STCK', engNm: 'Stock', def: '유통망이 보유한 단말·유심 물량' },
  { wordNm: '이동', abbr: 'MOV', engNm: 'Movement', def: '재고가 입고·출고·이관으로 옮겨 감(번호이동 MNP 와 다른 일반 단어)' },
  { wordNm: '유치', abbr: 'ATRC', engNm: 'Attraction', def: '유통망이 신규·번호이동·기기변경 가입을 끌어옴(유치 수수료 근거)' },
  { wordNm: '환수', abbr: 'RCLM', engNm: 'Reclaim', def: '이미 지급한 수수료를 조기 해지 등으로 돌려받음' },
  { wordNm: '장려금', abbr: 'INCNTV', engNm: 'Incentive', def: '유통망 판매 촉진을 위해 주는 판매 장려금(리베이트 — 단말기유통법)' },
  { wordNm: '상대', abbr: 'CNPT', engNm: 'Counterpart', def: '거래·이동의 맞은편 당사자' },
  { wordNm: '상계', abbr: 'OFST', engNm: 'Offset', def: '주고받을 채권·채무를 서로 비겨 지움' },
]
const byNm = new Map(words.map((w) => [w.wordNm, w]))
const errs = []
for (const [nm, w] of pendWords) if (!byNm.has(nm)) byNm.set(nm, { entClss: false, attrClss: false, tblSfx: null, keyDom: null, ...w, pending: w.src })
const allAbbr = new Set([...byNm.values()].map((w) => w.abbr))
for (const w of NEW_WORDS) {
  if (byNm.has(w.wordNm)) errs.push('이미 있는 단어 ' + w.wordNm)
  if (allAbbr.has(w.abbr)) errs.push('약어 중복 ' + w.abbr)
  byNm.set(w.wordNm, { ...w, entClss: false, attrClss: false, tblSfx: null, keyDom: null, isNew: true })
}

// 최소 단어 수 분할(std_build.js 와 같은 규칙)
const cost = (ws) => ws.length * 10 + ws.filter((w) => w.wordNm.length === 1).length
function better(a, b) {
  if (cost(a) !== cost(b)) return cost(a) < cost(b)
  for (let k = 0; k < a.length; k++) if (a[k].wordNm.length !== b[k].wordNm.length) return a[k].wordNm.length > b[k].wordNm.length
  return false
}
function segment(nm) {
  const best = [[]]
  for (let i = 1; i <= nm.length; i++) for (let j = 0; j < i; j++) {
    const w = best[j] && byNm.get(nm.slice(j, i))
    if (!w) continue
    const c = [...best[j], w]
    if (!best[i] || better(c, best[i])) best[i] = c
  }
  return best[nm.length] || null
}
const domByKey = new Map()
for (const d of domains) { const k = d.domNm.replace(/[A-Z].*$/, ''); if (!domByKey.has(k)) domByKey.set(k, d.domNm) }
const domSet = new Set(domains.map((d) => d.domNm))

const newTerms = new Map()
function term(nm, domOv) {
  if (terms.has(nm)) {
    const t = terms.get(nm)
    if (domOv && domOv !== t.domNm) errs.push(`도메인 불일치 ${nm} ${t.domNm}≠${domOv}`)
    return t
  }
  if (newTerms.has(nm)) return newTerms.get(nm)
  if (pendTerms.has(nm)) {
    const { src, ...t } = pendTerms.get(nm)
    if (domOv && domOv !== t.domNm) errs.push(`도메인 불일치(대기 용어) ${nm} ${t.domNm}≠${domOv}`)
    const out = { ...t, pendingFrom: src }
    newTerms.set(nm, out)
    return out
  }
  const seg = segment(nm)
  if (!seg) { errs.push('분할 불가 ' + nm); return { phyNm: '?', domNm: '?' } }
  const last = seg[seg.length - 1]
  if (!last.attrClss) errs.push('속성 분류어로 끝나지 않음 ' + nm)
  const domNm = domOv || domByKey.get(last.keyDom)
  if (!domSet.has(domNm)) errs.push('도메인 없음 ' + nm + ' ' + domNm)
  const head = seg.slice(0, -1).map((w) => w.wordNm).join(' ')
  const t = { termNm: nm, words: seg.map((w) => w.wordNm), phyNm: seg.map((w) => w.abbr).join('_'), domNm, def: /(유형|구분)코드$/.test(nm) ? `${head.replace(/ (유형|구분)$/, '')}의 ${seg[seg.length - 2].wordNm} 코드 — 공통코드(codes.json 신규 등재 필요)` : `${head}의 ${last.wordNm}` }
  const nw = seg.filter((w) => w.isNew || w.pending).map(({ wordNm, abbr, engNm }) => ({ wordNm, abbr, engNm }))
  if (nw.length) t.newWords = nw
  newTerms.set(nm, t)
  return t
}

// 새 공통코드 값 — 사전·다른 영역 대기 코드에 없는 ~유형·구분코드만 출력
const CODE_VALS = {
  파트너변경사유유형코드: '신규등록,상호변경,대표자변경,주소이전,상태변경,유형전환,관리조직변경,정정',
  파트너계약변경사유유형코드: '신규체결,조건변경,갱신,해지,만료,정정',
  조직변경사유유형코드: '신설,명칭변경,상위조직변경,통합,폐지,정정',
  재고이동유형코드: '입고,출고,이관입고,이관출고,반품,판매출고,분실폐기',
  재고상태유형코드: '보유,이동중,판매완료,반품완료,폐기',
  정산항목유형코드: '유치수수료,관리수수료,수수료환수,장려금,상호접속료,로밍정산,콘텐츠정산,수납대행수수료,추심수수료,조정',
  수수료유형코드: '유치수수료,관리수수료,판매수수료,유지수수료,부가서비스수수료',
  수수료정책상태유형코드: '작성,승인,적용중,종료,폐기',
  유치수수료상태유형코드: '발생,검증,정산포함,지급완료,환수,취소',
  관리수수료상태유형코드: '산정,검증,정산포함,지급완료,취소',
  수수료환수사유유형코드: '조기해지,기기변경,명의변경,번호이동전출,부정개통,기타',
  수수료환수상태유형코드: '발생,상계예정,상계완료,별도청구,면제',
  장려금유형코드: '판매장려금,목표달성장려금,번호이동장려금,기기변경장려금,부가서비스장려금,특별장려금',
  장려금정책상태유형코드: '작성,승인,적용중,종료,폐기',
  장려금지급상태유형코드: '산정,검증,정산포함,지급완료,취소',
  상호접속유형코드: '이동착신,유선착신,이동발신,문자착신,국제착신,인터넷전화착신',
  로밍정산파일유형코드: 'TAP,RAP,보정TAP,NRTRDE,재전송TAP',
  전송방향구분코드: '송신,수신',
  로밍정산파일상태유형코드: '수신,검증중,정상처리,부분반송,전체반송,재처리',
  로밍정산상태유형코드: '산정,상대확인,이의제기,확정,정산포함,취소',
  콘텐츠정산유형코드: '정보이용료,소액결제,부가서비스제휴,앱마켓',
  콘텐츠정산상태유형코드: '산정,검증,정산포함,지급완료,보류,취소',
  지급방법유형코드: '계좌이체,상계,수표,해외송금',
  정산지급상태유형코드: '지급요청,지급완료,지급실패,상계완료,취소',
}

// 엔터티 명세 : [속성명, 플래그(P=PK·!=필수·R:역할), FK 부모('엔터티' | '영역.엔터티' | '…@부모속성'), 정의, 도메인 지정]
const PRTNR = '파트너기본@파트너번호'
const ENTS = [
  // ── 핵심(CNCP) 10 — 개념 모델 승계
  { nm: '파트너기본', tp: 'BASE', stg: 'CNCP', def: '통신사와 거래하는 모든 외부 당사자(대리점·판매점·제휴사·콘텐츠제공사·통신사업자·로밍사업자·수납대행기관)의 공통 상위(슈퍼타입). 사업자 공통 속성(사업자등록·과세유형·관리조직·소재 지역)을 한 곳에 둔다. 거래 종료 후에도 행을 지우지 않고 상태·거래종료일자로 표현한다.', a: [
    ['파트너번호', 'P R:PK'], ['관리조직코드', '', '조직기본@조직코드', '관할 사내 영업 조직(해외 사업자는 NULL — S5)'], ['지역코드', '', 'CUS.지역코드', '유통망 소재 지역(해외 사업자 NULL, S10 지역↔대리점 강상관)'],
    ['파트너명', '! R:NM', null, '사업자등록상 상호·법인명(S8 같은 이름 다수, S13 표기 흔들림)'], ['파트너등록일시', '! R:DTM'], ['파트너상태유형코드', '! R:STS', null, '정상 98%(S3)'], ['파트너유형코드', '!', null, '서브타입 판별자(제휴사·수납대행기관은 서브타입 없음 — 개념 P3)'],
    ['사업자등록번호', '', null, '국내 사업자만(해외 NULL), 형식 함정 S12'], ['법인등록번호', '', null, '법인만'], ['대표자명'], ['사업자과세유형코드', '!'], ['국가코드', '!', null, 'ISO 3166-1 alpha-2 외부 표준 값(공통코드 아님)'], ['대표전화번호'], ['사업장주소'], ['거래시작일자', '!'], ['거래종료일자', '', null, '거래 중 = NULL']] },
  { nm: '조직기본', tp: 'REF', stg: 'CNCP', def: '사내 본사·본부·지사·영업팀·직영매장·고객센터 조직(D5). 상위조직코드로 계층(재귀)을 이루고 유효 기간으로 개편을 표현한다.', a: [
    ['조직코드', 'P R:PK'], ['상위조직코드', '', '조직기본@조직코드', '상위 조직(본사는 NULL — 재귀 1:N)'],
    ['조직명', '! R:NM'], ['조직등록일시', '! R:DTM'], ['조직상태유형코드', '! R:STS'], ['조직유형코드', '!'], ['조직장명'], ['비용센터코드', '', null, '회계(ERP) 비용센터 — 외부 시스템 소유 코드, 공통코드 아님'], ['유효시작일자', '!'], ['유효종료일자', '!', null, '현재 유효 = 99991231']] },
  { nm: '대리점기본', tp: 'BASE', stg: 'CNCP', def: '통신사와 직접 위탁 계약한 1차 대리점(파트너 서브타입). 관리 회선 실적·관리수수료·담보가 귀속된다.', a: [
    ['대리점번호', 'P R:PK', PRTNR, '파트너번호의 역할명(값 동일, 1:1 식별)'],
    ['대리점명', '! R:NM', null, '영업 표시 상호(사업자 상호 = 파트너명과 다를 수 있음)'], ['대리점등록일시', '! R:DTM'], ['대리점상태유형코드', '! R:STS'], ['대리점유형코드', '!'], ['대리점등급유형코드', '', null, '수수료요율 차등 기준'], ['개설일자', '!'], ['폐쇄일자', '', null, '영업 중 = NULL'], ['담보금액', '', null, '보증보험·담보 설정액'], ['전속대리점여부', '!']] },
  { nm: '판매점기본', tp: 'BASE', stg: 'CNCP', def: '대리점 산하 2차 판매점·양판점·온라인 판매점(파트너 서브타입). 단말기유통법 사전승낙을 받아야 개통을 접수할 수 있다.', a: [
    ['판매점번호', 'P R:PK', PRTNR, '파트너번호의 역할명(값 동일, 1:1 식별)'], ['대리점번호', '', '대리점기본', '상위 대리점(양판점·직계약 판매점 NULL — S5, 개념 P7)'],
    ['판매점명', '! R:NM'], ['판매점등록일시', '! R:DTM'], ['판매점상태유형코드', '! R:STS'], ['판매점유형코드', '!'], ['사전승낙번호'], ['사전승낙일자'], ['개설일자', '!'], ['폐쇄일자'], ['신분증스캐너보유여부', '!']] },
  { nm: '콘텐츠제공사기본', tp: 'BASE', stg: 'CNCP', def: '정보이용료를 통신요금에 함께 청구하는 콘텐츠 제공사(CP)·휴대폰 소액결제 가맹·결제대행사(PG)·앱마켓(파트너 서브타입).', a: [
    ['콘텐츠제공사번호', 'P R:PK', PRTNR, '파트너번호의 역할명(값 동일, 1:1 식별)'],
    ['콘텐츠제공사명', '! R:NM'], ['콘텐츠제공사등록일시', '! R:DTM'], ['콘텐츠제공사상태유형코드', '! R:STS'], ['콘텐츠제공사유형코드', '!'], ['부가통신사업신고번호'], ['정산수수료율', '', null, '현재 기본 정산 수수료율(건별 정산엔 정산 시점 값을 따로 둔다)'], ['휴대폰결제가맹여부', '!'], ['고객센터전화번호']] },
  { nm: '통신사업자기본', tp: 'BASE', stg: 'CNCP', def: '상호접속·번호이동 상대인 국내 기간·별정 통신사업자(MNO·MVNO·유선·인터넷전화·국제전화, 파트너 서브타입).', a: [
    ['통신사업자번호', 'P R:PK', PRTNR, '파트너번호의 역할명(값 동일, 1:1 식별)'], ['상위통신사업자번호', '', '통신사업자기본@통신사업자번호', '망을 빌린 MNO(MVNO 만, MNO 는 NULL — 재귀)'],
    ['통신사업자명', '! R:NM'], ['통신사업자등록일시', '! R:DTM'], ['통신사업자상태유형코드', '! R:STS'], ['통신사업자유형코드', '!'], ['번호이동사업자코드', '', null, 'KTOA 번호이동 사업자 코드(외부 표준)'], ['망식별코드', '', null, 'PLMN(MCC+MNC) 외부 표준'], ['상호접속계약일자'], ['상호접속정산대상여부', '!']] },
  { nm: '로밍사업자기본', tp: 'BASE', stg: 'CNCP', def: '국제로밍 협정을 맺은 해외 이동통신 사업자(파트너 서브타입). GSMA TADIG 코드로 TAP·RAP 파일을 주고받는다.', a: [
    ['로밍사업자번호', 'P R:PK', PRTNR, '파트너번호의 역할명(값 동일, 1:1 식별)'],
    ['로밍사업자명', '! R:NM'], ['로밍사업자등록일시', '! R:DTM'], ['로밍사업자상태유형코드', '! R:STS'], ['TADIG코드', '!', null, 'GSMA TD.13 외부 표준'], ['망식별코드', '!', null, 'PLMN 외부 표준'], ['로밍방향구분코드', '!'], ['로밍계약일자'], ['정산통화코드', '!', null, 'ISO 4217(SDR = XDR) 외부 표준'], ['데이터청산사명', '', null, 'DCH(Syniverse 등) 이름 — 기준 엔터티 없음(값 수 소수)']] },
  { nm: '파트너계약기본', tp: 'ACT', stg: 'CNCP', def: '파트너와 맺은 거래 계약(대리점·판매점 위탁, 콘텐츠 제공, 상호접속, 국제로밍, 제휴, 수납대행). 정산 주기·지급 조건의 근거.', a: [
    ['파트너계약번호', 'P R:PK'], ['파트너번호', '!', '파트너기본'],
    ['파트너계약명', '! R:NM'], ['파트너계약일시', '! R:DTM'], ['파트너계약상태유형코드', '! R:STS'], ['파트너계약유형코드', '!'], ['계약시작일자', '!'], ['계약종료일자', '!', null, '무기한 = 99991231'], ['자동갱신여부', '!'], ['정산주기유형코드', '!'], ['지급조건내용'], ['계약해지일자', '', null, '중도 해지만']] },
  { nm: '정산기본', tp: 'ACT', stg: 'CNCP', mod: 'STL', def: '정산년월 × 파트너계약 단위 정산서(지급 또는 수취). 수수료·장려금·접속료·로밍·콘텐츠·대행 수수료 내역이 정산번호로 묶이고, 확정되면 세금계산서·지급으로 이어진다.', a: [
    ['정산번호', 'P R:PK'], ['파트너계약번호', '!', '파트너계약기본', '정산 조건 계약(파트너는 계약에서 유도 — 3NF, 개념의 파트너번호 제거 L2)'],
    ['정산명', '! R:NM'], ['정산일시', '! R:DTM', null, '정산서 생성 시점'], ['정산상태유형코드', '! R:STS'], ['정산년월', '!'], ['정산유형코드', '!'], ['정산방향구분코드', '!'], ['정산대상금액', '!'], ['공제금액', '!', null, '환수·미납 공제·상계'], ['공급가액', '!', null, '확정 스냅숏(개념 P8)'], ['부가가치세금액', '!', null, '확정 스냅숏(개념 P8)'], ['통화코드', '!', null, 'ISO 4217 — 로밍만 외화'], ['정산확정일시'], ['지급예정일자']] },
  { nm: '세금계산서기본', tp: 'ACT', stg: 'CNCP', mod: 'STL', def: '확정 정산 금액으로 주고받는 (전자)세금계산서. 매출(통신사 발행)·매입(파트너 발행·역발행), 수정세금계산서는 원세금계산서를 가리킨다.', a: [
    ['세금계산서번호', 'P R:PK'], ['정산번호', '!', '정산기본', '발행 근거 정산(거래 상대 파트너는 정산 → 계약에서 유도 — L2)'], ['원세금계산서번호', '', '세금계산서기본@세금계산서번호', '수정 발행의 원본(정발행 NULL — 재귀)'],
    ['세금계산서품목명', '! R:NM'], ['세금계산서발행일시', '! R:DTM'], ['세금계산서상태유형코드', '! R:STS'], ['세금계산서유형코드', '!'], ['매입매출구분코드', '!'], ['작성일자', '!'], ['공급가액', '!', null, '법정 기재 금액(상세 합계의 확정 스냅숏 — P8)'], ['세액', '!'], ['전자세금계산서승인번호'], ['국세청전송일시'], ['수정사유유형코드', '', null, '수정세금계산서만']] },

  // ── 기본·일반(LGCL) 24
  { nm: '파트너이력', tp: 'ACT', def: '파트너기본 주요 속성(이름·상태·유형·대표자·주소·관리조직)의 변경 전후를 유효 기간(SCD2)으로 보존. 현재행 유효종료일시 = 9999-12-31 23:59:59.', a: [
    ['파트너번호', 'P!', '파트너기본'], ['유효시작일시', 'P'], ['유효종료일시', '!'], ['파트너명', '!'], ['파트너상태유형코드', '!'], ['파트너유형코드', '!'], ['대표자명'], ['사업장주소'], ['관리조직코드', '', null, '변경 당시 값 스냅숏(FK 아님)'], ['파트너변경사유유형코드', '!']] },
  { nm: '파트너계약이력', tp: 'ACT', def: '파트너 계약의 체결·조건 변경·갱신·해지 이력(상태 전이 순서가 업무 키 — 순번 방식).', a: [
    ['파트너계약번호', 'P!', '파트너계약기본'], ['파트너계약이력순번', 'P'], ['파트너계약변경일시', '!'], ['파트너계약상태유형코드', '!'], ['계약시작일자', '!'], ['계약종료일자', '!'], ['파트너계약변경사유유형코드', '!'], ['변경사유내용']] },
  { nm: '파트너계좌상세', tp: 'BASE', def: '파트너가 등록한 정산 지급(수취) 계좌. 변경 시 새 순번으로 추가(지급 실적의 계좌 보존 — 덮어쓰기 금지).', a: [
    ['파트너번호', 'P!', '파트너기본'], ['파트너계좌순번', 'P'], ['은행코드', '!', 'INV.은행코드', '지급 은행(D5 은행 기준 = INV)'], ['계좌번호암호화값', '!', null, 'D11 평문 저장 금지'], ['예금주명', '!'], ['계좌실명확인여부', '!'], ['대표계좌여부', '!'], ['파트너계좌등록일시', '!'], ['적용시작일자', '!'], ['적용종료일자', '!', null, '현재 = 99991231']] },
  { nm: '파트너담당자상세', tp: 'BASE', def: '파트너 쪽 계약·정산·기술 담당자 연락처(CUS 법인담당자와 같은 용어·코드 재사용).', a: [
    ['파트너번호', 'P!', '파트너기본'], ['담당자순번', 'P'], ['담당자명', '!'], ['담당자유형코드', '!'], ['담당자부서명'], ['담당자휴대전화번호', '', null, '합성 010 번호(D11)'], ['담당자이메일주소'], ['대표담당자여부', '!'], ['담당자상태유형코드', '!'], ['담당자등록일시', '!']] },
  { nm: '조직이력', tp: 'ACT', def: '조직 개편(신설·명칭 변경·상위 조직 변경·통합·폐지) 전후를 유효 기간(SCD2)으로 보존. 과거 실적을 당시 조직 계층으로 집계하는 근거.', a: [
    ['조직코드', 'P!', '조직기본'], ['유효시작일시', 'P'], ['유효종료일시', '!'], ['조직명', '!'], ['상위조직코드', '', null, '변경 당시 상위 조직 스냅숏(FK 아님)'], ['조직유형코드', '!'], ['조직상태유형코드', '!'], ['조직변경사유유형코드', '!']] },
  { nm: '단말재고내역', tp: 'ACT', def: '유통망(대리점·판매점)의 단말 입고·출고·이관·반품·판매 출고 1건(IMEI 단위). 이관은 상대 파트너를 함께 남긴다.', a: [
    ['단말재고번호', 'P'], ['파트너번호', '!', '파트너기본', '재고 보유 유통망'], ['상대파트너번호', '', PRTNR, '이관·반품 상대(입고·판매 출고는 NULL — S5)'], ['단말모델코드', '!', 'PRD.단말모델기본'],
    ['IMEI번호', '!', null, '같은 IMEI 가 이동마다 여러 행'], ['재고이동유형코드', '!'], ['재고이동일시', '!'], ['재고상태유형코드', '!', null, '이동 후 상태']] },
  { nm: '유심재고내역', tp: 'ACT', def: '유통망의 유심 입고·출고·이관·판매 출고 1건(유심 일련번호 단위).', a: [
    ['유심재고번호', 'P'], ['파트너번호', '!', '파트너기본', '재고 보유 유통망'], ['상대파트너번호', '', PRTNR, '이관·반품 상대'], ['유심상품코드', '!', 'PRD.유심상품기본@상품코드', '유심 상품(PRD 상품코드의 역할명)'],
    ['유심일련번호', '!'], ['재고이동유형코드', '!'], ['재고이동일시', '!'], ['재고상태유형코드', '!']] },
  { nm: '정산상세', tp: 'ACT', mod: 'STL', def: '정산서 1건의 항목별 산출 근거(수수료·장려금·접속료·로밍·콘텐츠·환수·조정). 원천 내역은 각 내역 엔터티가 정산번호로 가리킨다.', a: [
    ['정산번호', 'P!', '정산기본'], ['정산상세순번', 'P'], ['정산항목유형코드', '!'], ['정산항목명', '!'], ['정산대상건수', '!'], ['정산대상금액', '!'], ['공제금액', '!'], ['조정금액', '!', null, '수기 조정(음수 가능 S7)']] },
  { nm: '수수료정책기본', tp: 'REF', mod: 'STL', def: '대리점·판매점에 주는 유치·관리·판매 수수료 정책(대상 파트너 유형·적용 기간). 요율은 수수료요율상세.', a: [
    ['수수료정책번호', 'P'], ['수수료정책명', '!'], ['수수료유형코드', '!'], ['파트너유형코드', '!', null, '적용 대상 파트너 유형'], ['수수료정책상태유형코드', '!'], ['수수료정책등록일시', '!'], ['적용시작일자', '!'], ['적용종료일자', '!']] },
  { nm: '수수료요율상세', tp: 'REF', mod: 'STL', def: '수수료 정책의 상품·대리점 등급·기간별 요율(정률) 또는 정액 단가.', a: [
    ['수수료정책번호', 'P!', '수수료정책기본'], ['수수료요율순번', 'P'], ['상품코드', '', 'PRD.상품기본', '대상 상품(전 상품 공통 = NULL)'], ['대리점등급유형코드', '', null, '등급 차등(공통 = NULL)'],
    ['요율적용시작일자', '!'], ['요율적용종료일자', '!'], ['수수료율', '', null, '정률(정액이면 NULL)'], ['단위수수료금액', '', null, '건당 정액(정률이면 NULL)'], ['수수료상한금액']] },
  { nm: '유치수수료내역', tp: 'ACT', mod: 'STL', def: '개통(가입계약) 1건당 유치 판매점·대리점에 발생한 유치·판매 수수료. 정산에 포함되면 정산번호가 채워진다.', a: [
    ['유치수수료번호', 'P'], ['가입계약번호', '!', 'ORD.가입계약기본', '개통 계약'], ['판매점번호', '', '판매점기본', '유치 판매점(대리점 직접 유치 NULL)'], ['대리점번호', '!', '대리점기본', '수수료 귀속 대리점(유치 시점 사실값)'],
    ['수수료정책번호', '!', '수수료요율상세'], ['수수료요율순번', '!', '수수료요율상세'], ['정산번호', '', '정산기본', '정산 포함 후'],
    ['수수료산정일시', '!'], ['정산년월', '!'], ['수수료대상금액', '!', null, '요율 적용 기준 금액(요금제 월정액 등)'], ['수수료율', '', null, '산정 시점 적용 요율(사실값)'], ['수수료금액', '!'], ['유치수수료상태유형코드', '!']] },
  { nm: '관리수수료내역', tp: 'ACT', mod: 'STL', def: '유지 회선(가입계약) × 월 관리 대리점에 주는 관리 수수료(월 청구액 기반). 관리 대리점은 월마다 바뀔 수 있어 해당 월 사실값으로 둔다.', a: [
    ['관리수수료번호', 'P'], ['가입계약번호', '!', 'ORD.가입계약기본'], ['대리점번호', '!', '대리점기본', '해당 월 관리 대리점(사실값)'], ['수수료정책번호', '!', '수수료요율상세'], ['수수료요율순번', '!', '수수료요율상세'], ['정산번호', '', '정산기본'],
    ['수수료산정일시', '!'], ['정산년월', '!'], ['수수료대상금액', '!', null, '해당 월 회선 청구 금액'], ['수수료율', '!'], ['수수료금액', '!'], ['관리수수료상태유형코드', '!']] },
  { nm: '수수료환수내역', tp: 'ACT', mod: 'STL', def: '조기 해지·기기변경·명의변경 등으로 이미 지급한 유치 수수료를 돌려받는 1건(음수 금액 — S7). 다음 정산에서 상계한다.', a: [
    ['수수료환수번호', 'P'], ['유치수수료번호', '!', '유치수수료내역', '환수 대상 원 수수료'], ['해지신청번호', '', 'ORD.해지신청내역', '조기 해지 환수만(기기변경 등 NULL)'], ['정산번호', '', '정산기본', '상계 정산'],
    ['수수료환수일시', '!'], ['수수료환수사유유형코드', '!'], ['경과일수', '!', null, '개통 → 환수 사유 발생 일수(환수율 구간 기준)'], ['수수료환수금액', '!', null, '음수(S7)'], ['수수료환수상태유형코드', '!']] },
  { nm: '장려금정책기본', tp: 'REF', mod: 'STL', def: '유통망 판매 장려금 정책(대상 상품·단말·기간·단가). 단말기유통법상 이용자 차별 지원 금지 — 정책 단가는 공시 범위 점검 근거.', a: [
    ['장려금정책번호', 'P'], ['상품코드', '', 'PRD.상품기본', '대상 요금제·상품(공통 NULL)'], ['단말모델코드', '', 'PRD.단말모델기본', '대상 단말(공통 NULL)'],
    ['장려금정책명', '!'], ['장려금유형코드', '!'], ['파트너유형코드', '!', null, '대상 유통망 유형'], ['단위장려금금액', '!', null, '건당 단가'], ['장려금정책상태유형코드', '!'], ['장려금정책등록일시', '!'], ['적용시작일자', '!'], ['적용종료일자', '!']] },
  { nm: '장려금지급내역', tp: 'ACT', mod: 'STL', def: '장려금 정책 × 유통망 × 정산년월 장려금 산정·지급 1건.', a: [
    ['장려금지급번호', 'P'], ['장려금정책번호', '!', '장려금정책기본'], ['파트너번호', '!', '파트너기본', '받는 유통망(대리점·판매점)'], ['정산번호', '', '정산기본'],
    ['장려금산정일시', '!'], ['정산년월', '!'], ['장려금대상건수', '!'], ['장려금금액', '!'], ['장려금지급상태유형코드', '!']] },
  { nm: '상호접속요율상세', tp: 'REF', mod: 'STL', def: '상대 통신사업자 × 상호접속 유형 × 적용 기간 접속료율(과기정통부 상호접속 기준 고시 — 2년 주기 산정).', a: [
    ['통신사업자번호', 'P!', '통신사업자기본'], ['상호접속유형코드', 'P'], ['요율적용시작일자', 'P'], ['요율적용종료일자', '!'], ['사용단위유형코드', '!'], ['과금단위값', '!', null, '과금 단위(초·건)'], ['단위요금금액', '!', null, '단위당 접속료(원) — PRD 용어 도메인 금액N15 승계, 소수 원 요율은 물리 단계 검토(결정 L9)']] },
  { nm: '상호접속사용량집계', tp: 'PROC', mod: 'STL', def: '상대 통신사업자 × 정산년월 × 상호접속 유형 × 방향 접속 사용량(건수·초수)과 산정 접속료 집계(원천 = PAY 사용내역). 개념명 "상호접속통화집계"의 통화는 표준사전상 통화(Currency)라 사용량으로 정정(결정 L3).', a: [
    ['통신사업자번호', 'P!', '통신사업자기본'], ['정산년월', 'P'], ['상호접속유형코드', 'P'], ['사용방향구분코드', 'P'], ['사용건수', '!'], ['사용초수', '!'], ['정산대상금액', '!', null, '사용량 × 기간 요율 산정 접속료'], ['집계일시', '!']] },
  { nm: '로밍정산파일내역', tp: 'ACT', mod: 'STL', def: '로밍사업자와 주고받은 TAP·RAP·NRTRDE 파일 1건(GSMA TD.57·TD.52). 파일일련번호 누락·중복 점검과 반송(RAP) 추적의 근거.', a: [
    ['로밍정산파일번호', 'P'], ['로밍사업자번호', '!', '로밍사업자기본'], ['로밍정산파일명', '!'], ['로밍정산파일유형코드', '!'], ['전송방향구분코드', '!'], ['파일일련번호', '!', null, 'TAP 파일 순번(사업자·방향별 연속)'], ['정산년월', '!'], ['레코드건수', '!'], ['정산통화금액', '!', null, 'SDR 금액(PAY M5 도메인 금액N18_3 승계)'], ['파일생성일시', '!'], ['처리일시'], ['로밍정산파일상태유형코드', '!']] },
  { nm: '로밍정산내역', tp: 'ACT', mod: 'STL', def: '로밍사업자 × 정산년월 × 방향(인바운드 수취·아웃바운드 지급) 로밍 정산 금액(정산통화·환율·원화).', a: [
    ['로밍정산번호', 'P'], ['로밍사업자번호', '!', '로밍사업자기본'], ['정산번호', '', '정산기본'],
    ['로밍정산일시', '!'], ['정산년월', '!'], ['로밍방향구분코드', '!'], ['레코드건수', '!'], ['정산통화코드', '!', null, '정산 시점 통화(사업자 현재값과 다를 수 있음 — 사실값)'], ['정산통화금액', '!'], ['적용환율', '!'], ['정산대상금액', '!', null, '원화 확정 금액(환율 적용·반올림 확정값)'], ['로밍정산상태유형코드', '!']] },
  { nm: '콘텐츠정산내역', tp: 'ACT', mod: 'STL', def: '콘텐츠제공사·소액결제 가맹 × 정산년월 이용료 정산 1건(통신사가 대신 청구·수납한 금액에서 수수료·미납분을 떼고 지급).', a: [
    ['콘텐츠정산번호', 'P'], ['콘텐츠제공사번호', '!', '콘텐츠제공사기본'], ['정산번호', '', '정산기본'],
    ['콘텐츠정산일시', '!'], ['정산년월', '!'], ['콘텐츠정산유형코드', '!'], ['이용건수', '!'], ['이용금액', '!'], ['미납공제금액', '!', null, '고객 미납분 공제(소액결제 대손 위험)'], ['정산수수료율', '!', null, '정산 시점 적용 수수료율(사실값)'], ['수수료금액', '!'], ['콘텐츠정산상태유형코드', '!']] },
  { nm: '정산지급내역', tp: 'ACT', mod: 'STL', def: '확정 정산의 지급·수취 송금 또는 상계 1건(분할 지급 가능). 지급 계좌는 파트너계좌상세 복합 참조.', a: [
    ['정산지급번호', 'P'], ['정산번호', '!', '정산기본'], ['파트너번호', '', '파트너계좌상세', '지급 계좌 소유 파트너(상계 NULL) — 정산 파트너와 같아야 함(업무 규칙)'], ['파트너계좌순번', '', '파트너계좌상세'],
    ['정산지급일시', '!'], ['지급방법유형코드', '!'], ['지급금액', '!'], ['상계금액', '!', null, '상계 처리 금액(없으면 0)'], ['정산지급상태유형코드', '!']] },
  { nm: '정산확정이력', tp: 'ACT', mod: 'STL', def: '정산 상태 전이(생성 → 검증중 → 이의제기 → 확정 → 세금계산서발행 → 지급완료) 이력.', a: [
    ['정산번호', 'P!', '정산기본'], ['정산확정이력순번', 'P'], ['정산상태변경일시', '!'], ['정산상태유형코드', '!'], ['변경사유내용']] },
  { nm: '세금계산서상세', tp: 'ACT', mod: 'STL', def: '세금계산서 품목 줄(부가가치세법 — 품목·공급일자·공급가액·세액).', a: [
    ['세금계산서번호', 'P!', '세금계산서기본'], ['세금계산서상세순번', 'P'], ['세금계산서품목명', '!'], ['공급일자', '!'], ['공급가액', '!'], ['세액', '!']] },
  { nm: '정산월통계', tp: 'PROC', mod: 'STL', def: '정산년월 × 파트너 유형 × 정산 유형 정산 건수·금액 통계(가공 — 정산기본에서 재계산).', a: [
    ['정산년월', 'P'], ['파트너유형코드', 'P'], ['정산유형코드', 'P'], ['정산건수', '!'], ['정산대상금액', '!'], ['공제금액', '!'], ['공급가액', '!'], ['부가가치세금액', '!'], ['통계작성일시', '!']] },
]
// 1:1 관계 — 키 '부모>자식'
const ONE_TO_ONE = new Set(['파트너기본>대리점기본', '파트너기본>판매점기본', '파트너기본>콘텐츠제공사기본', '파트너기본>통신사업자기본', '파트너기본>로밍사업자기본'])

const NORM = {
  파트너기본: '2NF 단일 PK / 3NF 조직명·지역명 미보유(코드만). 서브타입 공통 속성은 여기 한 곳(서브타입에 사업자번호 중복 없음)',
  조직기본: '2NF 단일 PK / 3NF 이상 없음. 상위조직코드 재귀 1:N',
  대리점기본: '2NF 단일 PK / 3NF 이상 없음. 대리점명은 영업 표시 상호로 파트너명(사업자 상호)과 다른 사실값 — 이행 종속 아님',
  판매점기본: '2NF 단일 PK / 3NF 대리점명 미보유(대리점번호만)',
  콘텐츠제공사기본: '2NF 단일 PK / 3NF 이상 없음',
  통신사업자기본: '2NF 단일 PK / 3NF 이상 없음. 상위통신사업자번호 재귀',
  로밍사업자기본: '2NF 단일 PK / 3NF 국가코드는 슈퍼타입(파트너기본) 한 곳 — 중복 없음',
  파트너계약기본: '2NF 단일 PK / 3NF 이상 없음. 현재 상태는 파트너계약이력 최종행과 같은 값(현재값+이력 쌍 — 이력이 정본)',
  정산기본: '2NF 단일 PK / 3NF 개념 모델의 파트너번호는 파트너계약번호 → 파트너번호 이행 종속이라 제거(L2, 물리 반정규화 후보 — 파트너별 정산 조회). 공급가액·부가가치세금액은 정산상세 합계의 확정 스냅숏(개념 P8, 법적 근거 금액 보존)',
  세금계산서기본: '2NF 단일 PK / 3NF 개념 모델의 파트너번호는 정산번호 → 계약 → 파트너 이행 종속이라 제거(L2, 물리 반정규화 후보). 공급가액·세액은 상세 합계의 법정 확정값(P8)',
  파트너이력: '2NF (파트너번호, 유효시작일시) 전체 종속 / 3NF 변경 시점 스냅숏이라 기본과의 값 중복은 이행 종속 아님',
  파트너계약이력: '2NF (파트너계약번호, 이력순번) 전체 종속 / 3NF 이상 없음',
  파트너계좌상세: '2NF (파트너번호, 계좌순번) 전체 종속 / 3NF 은행명 미보유',
  파트너담당자상세: '2NF (파트너번호, 담당자순번) 전체 종속 / 3NF 이상 없음',
  조직이력: '2NF (조직코드, 유효시작일시) 전체 종속 / 3NF 스냅숏',
  단말재고내역: '2NF 단일 PK / 3NF 단말 모델명·제조사 미보유(PRD). 같은 IMEI 의 현재 위치는 최종 이동행에서 유도(물리 반정규화 후보)',
  유심재고내역: '2NF 단일 PK / 3NF 유심 상품명 미보유',
  정산상세: '2NF (정산번호, 상세순번) 전체 종속 / 3NF 항목 정산금액(= 대상 − 공제 + 조정)은 파생이라 미보유',
  수수료정책기본: '2NF 단일 PK / 3NF 이상 없음',
  수수료요율상세: '2NF (정책번호, 요율순번) 전체 종속 / 3NF 상품명 미보유. 정률·정액은 둘 중 하나만(업무 규칙)',
  유치수수료내역: '2NF 단일 PK / 3NF 대리점번호는 판매점→대리점·가입계약→관리대리점에서 유도되는 듯하나 유치 시점 귀속 사실값(이후 소속 변경과 무관) — 이행 종속 아님. 수수료율은 요율상세 값이지만 산정 시점 사실값(요율 변경 후에도 보존)',
  관리수수료내역: '2NF 단일 PK / 3NF 대리점번호는 해당 월 관리 대리점 사실값(가입계약의 현재 관리 대리점과 다를 수 있음). 수수료금액 = 대상 × 율이나 조정·확정된 지급 사실값',
  수수료환수내역: '2NF 단일 PK / 3NF 가입계약번호·대리점번호는 유치수수료내역에서 유도 → 미보유',
  장려금정책기본: '2NF 단일 PK / 3NF 이상 없음',
  장려금지급내역: '2NF 단일 PK / 3NF 단가는 정책 종속이라 미보유(금액은 확정 사실값)',
  상호접속요율상세: '2NF (사업자, 유형, 시작일자) 전체 종속 / 3NF 이상 없음',
  상호접속사용량집계: 'PROC 가공 엔터티 — 파생 집계 저장이 목적(정규화 예외), 재계산 기준 = PAY 사용내역 + 상호접속요율상세. 요율은 기간 조회라 FK 미보유',
  로밍정산파일내역: '2NF 단일 PK / 3NF TADIG 코드 미보유(사업자 종속). 사업자+방향+파일일련번호 = 후보키(물리 유일 인덱스)',
  로밍정산내역: '2NF 단일 PK / 3NF 원화 정산대상금액 = 통화금액 × 환율이나 반올림·확정 사실값이라 유지. 정산통화코드는 정산 시점 사실값',
  콘텐츠정산내역: '2NF 단일 PK / 3NF 지급대상금액(= 이용 − 미납공제 − 수수료)은 파생이라 미보유',
  정산지급내역: '2NF 단일 PK / 3NF 파트너번호는 계좌 복합 FK 구성 속성(계좌가 그 파트너 소유임을 관계로 강제) — 정산 → 계약 → 파트너와 같은 값이어야 하는 업무 규칙은 물리 점검 대상',
  정산확정이력: '2NF (정산번호, 이력순번) 전체 종속 / 3NF 이상 없음',
  세금계산서상세: '2NF (세금계산서번호, 상세순번) 전체 종속 / 3NF 이상 없음',
  정산월통계: 'PROC 가공 엔터티 — 파생 집계 저장(정규화 예외), 재계산 기준 = 정산기본 + 파트너계약기본 + 파트너기본',
}

const entIdx = new Map(ENTS.map((e, i) => [e.nm, i]))
const out = []
const relAll = []
for (const [i, e] of ENTS.entries()) {
  const seg = segment(e.nm)
  if (!seg) { errs.push('엔터티명 분할 불가 ' + e.nm); continue }
  const last = seg[seg.length - 1]
  if (!last.entClss) errs.push('엔터티 분류어 아님 ' + e.nm)
  const attrs = e.a.map(([nm, fl = '', fk = null, def = null, dom = null]) => {
    const t = term(nm, dom)
    let fkObj = null
    if (fk) {
      const [ent, pa] = fk.split('@')
      const local = !ent.includes('.')
      fkObj = { area: local ? AREA : ent.split('.')[0], ent: ent.replace(/^[A-Z]+\./, ''), attr: pa || nm }
      if (local && !entIdx.has(fkObj.ent)) errs.push('FK 부모 없음 ' + ent)
      else if (local && !ENTS[entIdx.get(fkObj.ent)].a.some((x) => x[0] === fkObj.attr && x[1].includes('P'))) errs.push(`FK 속성이 부모 PK 아님 ${e.nm}.${nm}→${ent}`)
    }
    const role = (fl.match(/R:(\w+)/) || [])[1]
    return { attrNm: nm, phyNm: t.phyNm, domNm: t.domNm, pk: fl.includes('P'), fk: fkObj, nullYn: !(fl.includes('P') || fl.includes('!')), def: def || t.def, ...(role ? { role } : {}) }
  })
  const rank = (a) => (a.pk ? 0 : a.fk ? 1 : 2)
  attrs.sort((x, y) => rank(x) - rank(y))
  attrs.forEach((a, k) => { a.seq = k + 1 })
  // 관계 = (부모, 역할) 마다 1건 — 같은 부모를 역할명으로 두 번 참조하면 관계 2건, 복합 FK(같은 부모·역할 없음)는 1건
  const pOf = (a) => (a.fk.area === AREA ? a.fk.ent : a.fk.area + '.' + a.fk.ent)
  const isRole = (a) => a.fk.attr !== a.attrNm && !(a.fk.area === AREA && ENTS[entIdx.get(a.fk.ent)] && ENTS[entIdx.get(a.fk.ent)].a.filter((x) => x[1].includes('P')).length === 1 && a.pk)
  const groups = new Map()
  for (const a of attrs.filter((x) => x.fk)) {
    const k = pOf(a) + (a.fk.attr !== a.attrNm ? '#' + a.attrNm : '')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(a)
  }
  const rels = []
  for (const [k, fa] of groups) {
    const p = pOf(fa[0])
    const role = fa.length === 1 && fa[0].fk.attr !== fa[0].attrNm ? fa[0].attrNm : null
    const r = { relNm: `${p.replace(/^[A-Z]+\./, '')} → ${e.nm}${role ? '(' + role + ')' : ''}`, parent: p, child: e.nm, card: ONE_TO_ONE.has(`${p}>${e.nm}`) ? '1:1' : '1:N', idn: fa.every((a) => a.pk), opt: fa.some((a) => a.nullYn), fkAttrs: fa.map((a) => a.attrNm) }
    if (p === e.nm) r.recursive = true
    rels.push(r)
    relAll.push(r)
  }
  void isRole
  if (e.stg === 'CNCP') for (const r of ['PK', 'NM', 'DTM', 'STS']) if (!attrs.some((a) => a.role === r)) errs.push(`핵심 필수 ${r} 없음 ${e.nm}`)
  for (const a of attrs) {
    if (/상태코드$/.test(a.attrNm) && !/상태유형코드$/.test(a.attrNm)) errs.push('상태코드 단독 ' + a.attrNm)
    if (/(유형|구분|종류)코드$/.test(a.attrNm) && !codes.has(a.attrNm) && !pendCodes.has(a.attrNm) && !CODE_VALS[a.attrNm] && !a.fk) errs.push('공통코드 값 없음 ' + a.attrNm)
  }
  if (!NORM[e.nm]) errs.push('normNote 없음 ' + e.nm)
  out.push({ entId: `${AREA}-${String(i + 1).padStart(3, '0')}`, entNm: e.nm, phyNm: seg.map((w) => w.abbr).join('_'), tblNm: ['PTL', AREA, ...seg.slice(0, -1).map((w) => w.abbr), last.tblSfx.slice(1)].join('_'), tp: e.tp, stg: e.stg || 'LGCL', ...(e.mod ? { moduleCd: e.mod } : {}), def: e.def, attrs, rels, normNote: '1NF 반복 그룹·다중값 없음 / ' + NORM[e.nm] })
}
// PK 이름 중복(엔터티 간 같은 phyNm 테이블) 점검
const tblDup = out.map((e) => e.tblNm).filter((t, k, arr) => arr.indexOf(t) !== k)
if (tblDup.length) errs.push('테이블명 중복 ' + tblDup.join(','))
for (const e of out) { const s = new Set(); for (const a of e.attrs) { if (s.has(a.phyNm)) errs.push(`속성 중복 ${e.entNm}.${a.phyNm}`); s.add(a.phyNm) } }

const newCodes = Object.entries(CODE_VALS).filter(([k]) => !codes.has(k) && !pendCodes.has(k)).map(([termNm, v]) => ({ termNm, kind: termNm.endsWith('구분코드') ? '구분' : '유형', vals: v.split(',').map((nm, k) => ({ cd: String(k + 1).padStart(2, '0'), nm, def: `${termNm.replace(/(유형|구분)코드$/, '')} '${nm}'` })) }))
const unusedCodes = Object.keys(CODE_VALS).filter((k) => !out.some((e) => e.attrs.some((a) => a.attrNm === k)))
if (unusedCodes.length) errs.push('쓰이지 않는 코드 ' + unusedCodes.join(','))

// 다른 주제영역 엔터티를 부모로 하는 관계(교차 관계) — areas.json crossRels 대조
const areas = rd('model/areas.json')
const crossNow = relAll.filter((r) => r.parent.includes('.')).map((r) => ({ from: `${AREA}.${r.child}`, to: r.parent, card: 'N:1', fkAttrs: r.fkAttrs, registered: areas.crossRels.some((c) => c.from === `${AREA}.${r.child}` && c.to === r.parent) }))

const DECISIONS = [
  { id: 'L1', dec: '핵심 10개 = 개념 모델 승계(PK·이름·도메인 무변경), 논리 단계에서 FK·필수 여부·관계·정규화만 확정. 개념의 서브타입(1:1 식별, PK = 파트너번호 역할명)·재귀 3건(조직·통신사업자·세금계산서) 그대로', why: '확정 엔터티 무단 재설계 금지 + ORD·PAY·PRD 가 이미 서브타입 키 이름(AGNC_NO·SHOP_NO·CNTS_PRVD_CO_NO·CARR_NO·ROAM_BZMN_NO)으로 참조' },
  { id: 'L2', dec: '정산기본·세금계산서기본의 파트너번호 제거 — 파트너는 정산 → 파트너계약 → 파트너로 유도', why: '규칙 2-7(3NF, 반정규화는 물리 단계에서만). ORD L1 과 같은 처리. 물리 반정규화 후보 = 파트너별 정산·세금계산서 조회(물리 단계가 사유·건수 기록)' },
  { id: 'L3', dec: '개념·01 문서 엔터티명 "상호접속통화집계" → **상호접속사용량집계**', why: '표준사전 통화 = CRNCY(화폐, 통화코드·정산통화코드). 같은 단어에 "전화 통화" 뜻을 겹치면 동음이의 — 사용(USE)+량 으로 정정. areas.json crossRels 의 PRM.상호접속통화집계(→ PRM.통신사업자기본, 영역 내부 힌트) 표기는 coordinator 가 새 이름으로 갱신 필요(이 단계는 다른 파일 수정 금지)' },
  { id: 'L4', dec: '이력 키 2방식 : 속성 스냅숏(파트너이력·조직이력) = 부모 PK + 유효시작일시(SCD2), 상태 전이(파트너계약이력·정산확정이력) = 부모 PK + 순번', why: 'CUS L2(SCD2)·ORD(순번) 선례를 업무 성격에 맞게 선택 — 시점 조회는 BETWEEN, 상태 전이는 순서가 업무 키' },
  { id: 'L5', dec: '정산 원천 내역(유치·관리수수료·환수·장려금·로밍·콘텐츠, INV 수납대행수수료·COL 추심수수료)은 각자 정산번호(선택 FK)로 정산기본을 가리키고, 정산상세는 항목 유형별 합계 줄만 가진다', why: '다형 FK(원천 유형 + 원천 번호) 회피 — 원천마다 관계 1개로 RI 설계 가능, 정산 전 내역은 정산번호 NULL(S5)' },
  { id: 'L6', dec: '유치·관리수수료의 대리점번호, 관리수수료·콘텐츠정산의 요율, 로밍정산의 정산통화코드는 발생 시점 사실값으로 보존', why: '소속·요율·통화가 바뀌어도 지급 근거는 그대로여야 함(이행 종속 아님 — normNote 에 근거)' },
  { id: 'L7', dec: '제휴사·수납대행기관은 서브타입 없음(개념 P3 유지). 수납대행기관 실체는 INV 수납대행기관기본', why: 'areas.json PRM scope F4. INV 수납대행수수료내역 → PRM.정산기본 관계는 INV 논리 모델이 소유' },
  { id: 'L8', dec: '새 교차 관계 4건 제안(areas.json 미등재) : PRM.파트너계좌상세 → INV.은행코드, PRM.수수료요율상세 → PRD.상품기본, PRM.장려금정책기본 → PRD.상품기본·PRD.단말모델기본', why: 'D5(은행 = INV), 수수료·장려금 정책의 상품·단말 차등은 실무 필수. 양끝 엔터티는 이미 존재 — coordinator 가 crossRels 에 등재' },
  { id: 'L9', dec: '로밍 정산통화금액·적용환율은 PAY 대기 용어(도메인 금액N18_3·율N12_4, PAY M5) 그대로, 상호접속 단위요금금액은 PRD 대기 용어(금액N15) 그대로 — 접속료의 소수 원 단가(예 분당 x.xx원)는 과금단위값(초)로 환산해 정수 단가로 담고 정밀도 부족 시 물리 단계에서 도메인 보완 [확인중]', why: '같은 용어 한 도메인(영역마다 다른 도메인 금지). 새 도메인 등재는 표준 담당 몫' },
  { id: 'L10', dec: '담당자 용어·코드(담당자유형코드·담당자상태유형코드 등)는 CUS 가 낸 대기 용어 재사용, 환율·생성·이용·TAP 등은 PAY 대기 단어 재사용(pendingFrom 표시)', why: '같은 개념 한 용어 — 영역마다 새로 만들면 표준사전 병합 때 충돌' },
  { id: 'L11', dec: 'nullYn = true 가 NULL 허용. 시스템 칼럼 4개·삭제여부 미포함', why: 'CONTEXT 3절·D7' },
]

const coreCnt = out.filter((e) => e.stg === 'CNCP').length
const json = {
  area: AREA, areaNm: '파트너', stg: 'LGCL', ver: '2026-11-07', author: 'subagent_logical_modeler',
  summary: { entityCnt: out.length, coreCnt, basicCnt: out.length - coreCnt, stlCnt: out.filter((e) => e.moduleCd).length, attrCnt: out.reduce((s, e) => s + e.attrs.length, 0), relCnt: relAll.length, idnRelCnt: relAll.filter((r) => r.idn).length, newTermCnt: newTerms.size, newWordCnt: NEW_WORDS.length, newCodeCnt: newCodes.length },
  conventions: { rels: '엔터티의 rels = 그 엔터티가 자식(FK 보유)인 관계. card 는 부모:자식, idn = FK 가 자식 PK 에 포함, opt = 자식 FK NULL 허용. 다른 주제영역 부모는 parent = "<영역>.<엔터티>". PRM 이 부모이고 자식이 다른 영역인 관계(ORD 가입신청·가입계약·가입상품·번호이동·서비스번호, PAY 로밍사용·소액결제·콘텐츠이용요금, PRD 부가서비스·할인상품, INV 수납대행수수료, COL 추심수수료)는 그 영역 논리 모델이 소유', fk: 'fk = {area, ent, attr} — 역할명 FK 는 attr 가 부모 PK 이름', history: '속성 스냅숏 이력 = 부모 PK + 유효시작일시(SCD2, 현재행 9999-12-31 23:59:59), 상태 전이 이력 = 부모 PK + 순번', stl: 'moduleCd:"STL" = 정산 업무 모듈(D15) — areas.json moduleEnts.STL 19건과 일치(상호접속통화집계 → 상호접속사용량집계 개명 L3)' },
  entities: out, newTerms: [...newTerms.values()], newWords: NEW_WORDS.map((w) => ({ ...w, entClss: false, attrClss: false, tblSfx: null })), newCodes, crossRels: crossNow, renames: [{ from: '상호접속통화집계', to: '상호접속사용량집계', why: 'L3' }], decisions: DECISIONS,
}
console.log(`엔터티 ${out.length} · 핵심 ${coreCnt} · STL ${json.summary.stlCnt} · 속성 ${json.summary.attrCnt} · 관계 ${relAll.length} · 새 용어 ${newTerms.size}(대기 재사용 ${[...newTerms.values()].filter((t) => t.pendingFrom).length}) · 새 단어 ${NEW_WORDS.length} · 새 코드 ${newCodes.length}`)
if (errs.length) { console.log('오류\n' + errs.join('\n')); process.exit(1) }
if (process.argv.includes('-v')) console.log([...newTerms.values()].map((t) => `${t.termNm} ${t.phyNm} ${t.domNm}${t.pendingFrom ? ' <' + t.pendingFrom : ''}${t.newWords ? ' *' : ''}`).join('\n'))
if (!process.argv.includes('--write')) process.exit(0)
fs.writeFileSync(path.join(ROOT, 'model/logical/PRM.json'), JSON.stringify(json, null, 2) + '\n')

// ── 문서 docs/04_logical_PRM.md
const esc = (s) => String(s).replace(/\|/g, '/')
const pkOf = (e) => e.attrs.filter((a) => a.pk).map((a) => a.attrNm).join(' + ')
const L = []
L.push('# 04 논리 모델 — PRM 파트너(+ 정산 모듈 STL)', '')
L.push('> 2026-11-07 · subagent_logical_modeler · 마스터 위임 자동 승인 모드')
L.push('> 정본 = `model/logical/PRM.json`(생성기 `tools/logical_PRM_build.js` — JSON·이 문서를 손으로 고치지 말고 생성기 ENTS 명세를 고친 뒤 `--write`).', '')
L.push('## 1. 요약', '', '| 항목 | 값 |', '|---|---|')
L.push(`| 엔터티 | ${out.length} (핵심 CNCP ${coreCnt} · 기본·일반 LGCL ${out.length - coreCnt}) — 01 계획 34(핵심 10 + 기본 24) 그대로 |`)
L.push(`| 정산 모듈(STL) | ${json.summary.stlCnt} — areas.json moduleEnts.STL 19건(개명 1건 L3) |`)
L.push(`| 속성 | ${json.summary.attrCnt} |`, `| 관계(FK 기준) | ${relAll.length} (식별 ${json.summary.idnRelCnt}) |`)
L.push(`| 새 표준용어 | ${newTerms.size} (다른 영역 대기 용어 재사용 ${[...newTerms.values()].filter((t) => t.pendingFrom).length}) |`)
L.push(`| 새 표준단어 | ${NEW_WORDS.length} : ${NEW_WORDS.map((w) => `${w.wordNm} ${w.abbr}`).join(' · ')} |`)
L.push(`| 새 공통코드 | ${newCodes.length} (유형 ${newCodes.filter((c) => c.kind === '유형').length} · 구분 ${newCodes.filter((c) => c.kind === '구분').length}) |`, '')
L.push('## 2. 결정 메모', '', '| # | 결정 | 근거 |', '|---|---|---|')
for (const d of DECISIONS) L.push(`| ${d.id} | ${esc(d.dec)} | ${esc(d.why)} |`)
L.push('', '## 3. 다른 주제영역이 참조하는 PRM 키(교차 키)', '', '| PRM 엔터티 | PK(물리명 · 도메인) | 참조하는 쪽 |', '|---|---|---|')
const XREF = { 파트너기본: 'PRD 할인상품기본(역할명 제휴파트너번호)', 대리점기본: 'ORD 가입계약기본(관리 대리점)', 판매점기본: 'ORD 가입신청기본·가입상품기본(유치 판매점)', 콘텐츠제공사기본: 'PRD 부가서비스기본, PAY 소액결제청구상세·콘텐츠이용요금내역(STL)', 통신사업자기본: 'ORD 번호이동신청기본·서비스번호기본(역할명 원통신사업자번호)', 로밍사업자기본: 'PAY 로밍사용내역(STL)', 정산기본: 'INV 수납대행수수료내역, COL 추심수수료내역(STL)' }
for (const [nm, who] of Object.entries(XREF)) { const e = out.find((x) => x.entNm === nm); const a = e.attrs.find((x) => x.pk); L.push(`| ${nm} | ${a.attrNm} ${a.phyNm} ${a.domNm} | ${who} |`) }
L.push('', '## 4. PRM 이 참조하는 다른 주제영역 키', '', '| 자식(PRM) | 부모 | FK 속성 | areas.json 등재 |', '|---|---|---|---|')
for (const c of crossNow) L.push(`| ${c.from.slice(4)} | ${c.to} | ${c.fkAttrs.join(', ')} | ${c.registered ? '등재' : '**미등재 — L8 제안**'} |`)
L.push('', '## 5. 엔터티 목록', '', '| ID | 엔터티 | 테이블(안) | 유형 | 단계 | 모듈 | PK | 속성 수 | 정의 |', '|---|---|---|---|---|---|---|---|---|')
for (const e of out) L.push(`| ${e.entId} | ${e.entNm} | ${e.tblNm} | ${e.tp} | ${e.stg} | ${e.moduleCd || ''} | ${pkOf(e)} | ${e.attrs.length} | ${esc(e.def)} |`)
L.push('', '## 6. 엔터티별 속성', '')
for (const e of out) {
  L.push(`### ${e.entId} ${e.entNm} (${e.phyNm}${e.moduleCd ? ' · STL' : ''})`, '', '| # | 속성 | 물리명 | 도메인 | PK | FK | NULL | 설명 |', '|---|---|---|---|---|---|---|---|')
  for (const a of e.attrs) L.push(`| ${a.seq} | ${a.attrNm}${a.role ? ' (' + a.role + ')' : ''} | ${a.phyNm} | ${a.domNm} | ${a.pk ? 'Y' : ''} | ${a.fk ? (a.fk.area !== AREA ? a.fk.area + '.' : '') + a.fk.ent + (a.fk.attr !== a.attrNm ? '.' + a.fk.attr : '') : ''} | ${a.nullYn ? 'Y' : 'N'} | ${esc(a.def)} |`)
  L.push('', `정규화 : ${e.normNote}`, '')
}
L.push('## 7. 관계', '', '| 관계 | 부모 | 자식 | 카디널리티 | 식별 | 선택 | FK 속성 |', '|---|---|---|---|---|---|---|')
for (const r of relAll) L.push(`| ${r.relNm} | ${r.parent} | ${r.child} | ${r.card} | ${r.idn ? '식별' : '비식별'} | ${r.opt ? '선택' : '필수'} | ${r.fkAttrs.join(', ')} |`)
L.push('', '## 8. 정규화 점검 요약', '')
L.push('- **1NF** : 34개 모두 반복 그룹·다중값 없음. 파트너 계좌·담당자는 상세(순번)로, 정산 항목은 정산상세로, 세금계산서 품목은 세금계산서상세로 분리.')
L.push('- **2NF** : 복합 PK 엔터티(이력·상세·요율·집계)의 모든 일반 속성이 PK 전체에 종속 — 부분 종속 0.')
L.push('- **3NF** : 이행 종속 제거 2건(정산기본·세금계산서기본의 파트너번호, L2), 파생값 미보유(정산상세 항목금액·콘텐츠 지급대상금액·재고 현재 위치), 시점 사실값 보존 5건(L6·P8 — normNote 근거). PROC 2건(상호접속사용량집계·정산월통계)은 가공 엔터티라 정규화 예외.')
L.push('- **N:M 해소** : 파트너 ↔ 정산 유형 ↔ 기간은 정산기본(계약 × 년월), 수수료 정책 ↔ 상품은 수수료요율상세, 장려금 정책 ↔ 유통망은 장려금지급내역, 통신사업자 ↔ 상호접속 유형 ↔ 기간은 상호접속요율상세가 관계 엔터티 역할.', '')
L.push('## 9. ERD(Mermaid)', '', '```mermaid', 'erDiagram')
const id = (nm) => out.find((e) => e.entNm === nm).phyNm
// 다른 영역 부모 = '<영역>_<그 영역 논리 phyNm>'(Mermaid 이름은 영문만)
const extId = (p) => { const [a, nm] = p.split('.'); const e = rd('model/logical/' + a + '.json').entities.find((x) => x.entNm === nm); return a + '_' + (e ? e.phyNm.replace(/^PTL_[A-Z]+_/, '') : 'UNKNOWN') }
for (const e of out) {
  L.push(`  ${e.phyNm} {`)
  for (const a of e.attrs) L.push(`    ${{ 일시TS: 'timestamp', 금액N15: 'numeric' }[a.domNm] || 'string'} ${a.phyNm}${a.pk && a.fk ? ' PK,FK' : a.pk ? ' PK' : a.fk ? ' FK' : ''}`)
  L.push('  }')
}
for (const r of relAll) {
  const child = id(r.child)
  const parent = r.parent.includes('.') ? extId(r.parent) : id(r.parent)
  const right = r.card === '1:1' ? '|o' : 'o{'
  L.push(`  ${parent} ${r.opt ? '|o' : '||'}${r.idn ? '--' : '..'}${right} ${child} : "${r.fkAttrs.join('+')}"`)
}
L.push('```', '', '> 다른 주제영역 부모(CUS_RGN_C 지역코드·INV_BANK_CD 은행코드·ORD_SBSC_CTRT_BAS 가입계약기본·ORD_TRMN_APLY_DTLS 해지신청내역·PRD_PROD_BAS 상품기본·PRD_EQP_MDL_BAS 단말모델기본·PRD_USIM_PROD_BAS 유심상품기본)는 속성 없이 이름만 표시(주제영역 1개 단위 ERD — 다른 영역은 참조 표시).', '')
L.push('## 10. 새 공통코드', '', '| 용어 | 종류 | 값 |', '|---|---|---|')
for (const c of newCodes) L.push(`| ${c.termNm} | ${c.kind} | ${c.vals.map((v) => v.cd + ' ' + v.nm).join(' · ')} |`)
L.push('', '## 11. 새 표준용어', '', '| 용어 | 물리명 | 도메인 | 비고 |', '|---|---|---|---|')
for (const t of newTerms.values()) L.push(`| ${t.termNm} | ${t.phyNm} | ${t.domNm} | ${t.pendingFrom ? t.pendingFrom + ' 대기 용어 재사용' : ''}${t.newWords ? ' 새 단어 ' + t.newWords.map((w) => w.wordNm).join('·') : ''} |`)
fs.writeFileSync(path.join(ROOT, 'docs/04_logical_PRM.md'), L.join('\n') + '\n')
console.log('기록 완료')
