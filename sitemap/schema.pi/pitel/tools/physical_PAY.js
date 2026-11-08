// PAY(청구 — 사용량·요금계산 포함) 물리 모델 생성기 — model/physical/PAY.json + ddl/40_pay_{tables,constraints}.sql + docs/05_physical_PAY.md
// 실행 : node tools/physical_PAY.js  (model/logical/*.json·model/std/domains.json 을 읽는다. 물리 결정은 아래 PHY 원장에서 손으로 관리)
// 규칙 : CONTEXT.md 2절(PK_·X_·FK_ 이름, 칼럼 순서 PK→FK→일반) · D6(FK 는 정의만) · D7(시스템 칼럼은 DDL 때만) · D14(테이블 → 적재 → PK·인덱스)
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const AREA = 'PAY'
const PART_FROM = '2010-01'
const PART_TO = '2027-12'
const SYS_COLS = [
  ['LST_MDDTM', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종수정일시'],
  ['LST_MDFR_ID', 'VARCHAR(50)', "'SYSTEM'", '최종수정자ID'],
  ['LST_RGDTM', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종등록일시'],
  ['LST_RGTR_ID', 'VARCHAR(50)', "'SYSTEM'", '최종등록자ID']
]

const domains = new Map(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const logical = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  const m = rd('model/logical/' + f)
  logical[m.area] = m
}
const entOf = (area, entNm) => {
  const e = logical[area] && logical[area].entities.find((x) => x.entNm === entNm)
  if (!e) throw new Error(`부모 엔터티 없음 : ${area}.${entNm}`)
  return e
}

// 도메인 → PostgreSQL 17 타입
function pgType(domNm) {
  const d = domains.get(domNm)
  if (!d) throw new Error('도메인 없음 : ' + domNm)
  if (d.lgcTp === 'VARCHAR' || d.lgcTp === 'CHAR') return `${d.lgcTp}(${d.len})`
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return d.lgcTp
}

// ── 물리 결정 원장 (엔터티 ID → 결정) ────────────────────────────────────────
// part : {type:'M'(월)|'Y'(연), key} · denorm : 부모에서 끌어온 칼럼(PK 에 포함되면 pkAdd) · idx : [cols, why, where?]
const PHY = {
  'PAY-001': { estRows: 100000000, part: { type: 'M', key: 'CLCT_DTM' },
    idx: [
      [['CLCT_FILE_NO'], 'FK 조인(수집파일 → 원시 CDR) — 파일 단위 건수 대사·재수집 삭제 범위'],
      [['SVC_NO', 'USE_BGNG_DTM'], '서비스번호 + 사용 기간 원시 CDR 조회(과금 이의·민원 원본 확인)'],
      [['CLCT_DTM'], '미과금 처리 큐 — 수집·파싱완료·과금대기·오류 상태만(98% 과금완료 저선택도 S3 회피 부분 인덱스)', "raw_use_prcs_stts_ty_cd IN ('01','02','03','05')"]
    ] },
  'PAY-002': { estRows: 150000000, part: { type: 'M', key: 'BILL_YM' },
    idx: [
      [['SVC_MGMT_NO', 'BILL_YM', 'USE_BGNG_DTM'], '회선 + 청구년월 사용내역 조회(요금 상세·통화내역서) — 최다 조회 경로, FK 조인(회선기본)'],
      [['SVC_NO', 'USE_BGNG_DTM'], '서비스번호 + 사용 일시 조회(상담 화면 — 서비스관리번호 모르는 진입)'],
      [['RAW_USE_NO'], 'FK 조인(원시사용내역 ↔ 사용내역 대사·재Rating)'],
      [['BILL_YM'], 'Bill Run 직전 미완료 과금 점검 — 과금대기·재과금·오류만(부분 인덱스)', "use_rat_stts_ty_cd IN ('01','03','05')"]
    ] },
  'PAY-003': { estRows: 20000000, part: { type: 'Y', key: 'BILL_YM' }, idx: [] },
  'PAY-004': { estRows: 100000000, part: { type: 'M', key: 'BILL_YM' },
    idx: [
      [['BILL_ACNT_NO', 'BILL_YM'], '청구계정 + 청구년월 요금계산 결과 조회(청구서 구성·상담) — FK 조인(청구계정기본)'],
      [['SVC_MGMT_NO', 'BILL_YM'], '회선 + 청구년월 요금계산 조회 — FK 조인(회선기본)'],
      [['BILL_JOB_NO'], 'FK 조인(청구작업) — Bill Run 단위 재계산·롤백 대상'],
      [['BILL_NO', 'BILL_DTL_SEQ'], 'FK 조인(청구상세) — 청구 라인의 계산 근거 역추적'],
      [['SBSC_PROD_NO'], 'FK 조인(가입상품기본) — 가입상품별 요금 이력']
    ] },
  'PAY-005': { estRows: 30, idx: [] },
  'PAY-006': { estRows: 5000,
    idx: [[['BILL_YM', 'BILL_CYCL_CD'], '청구년월 + 청구주기 Bill Run 조회 — FK 조인(청구주기코드)']] },
  'PAY-007': { estRows: 25000000, part: { type: 'Y', key: 'BILL_YM' },
    idx: [
      [['BILL_ACNT_NO', 'BILL_YM'], '청구계정 + 청구년월 청구서 조회(수납·상담 최다 경로) — FK 조인(청구계정기본), 핫 키 S14 는 BILL_YM 으로 범위 축소'],
      [['BILL_JOB_NO'], 'FK 조인(청구작업) — Bill Run 단위 청구서 확정·발행'],
      [['ORGN_BILL_NO'], '재청구 → 원청구 추적(자기 참조 FK) — 재청구만(부분 인덱스)', 'orgn_bill_no IS NOT NULL'],
      [['PAY_TMLMT_DT'], '납부기한 경과 미납 확정 배치(COL 입력) — 발행·일부수납·미납 상태만(부분 인덱스)', "bill_stts_ty_cd IN ('03','05','06')"]
    ] },
  'PAY-008': { estRows: 100000000, part: { type: 'M', key: 'BILL_YM' },
    denorm: [{ col: 'BILL_YM', src: 'PAY-007', pkAdd: true, why: '월 RANGE 파티션 키(논리 M1 에서 제거한 청구년월 복원) — 청구기본과 같은 월 파티션 정렬, 회선 + 청구년월 청구 라인 조회. 값은 청구기본.청구년월과 항상 같음(청구서 생성 시 함께 기록)' }],
    idx: [[['SVC_MGMT_NO', 'BILL_YM'], '회선 + 청구년월 청구 라인 조회(회선별 요금 명세) — FK 조인(회선기본)']] },
  'PAY-009': { estRows: 5000000,
    idx: [
      [['BILL_NO', 'BILL_DTL_SEQ'], 'FK 조인(청구기본·청구상세) — 청구서별 조정 내역'],
      [['RFLT_BILL_YM'], '승인되었으나 미반영된 조정 → 반영 청구년월 Bill Run 입력(부분 인덱스)', "bill_adj_stts_ty_cd = '02'"]
    ] },
  'PAY-010': { estRows: 30000000, part: { type: 'Y', key: 'BILL_YM' },
    denorm: [{ col: 'BILL_YM', src: 'PAY-007', pkAdd: true, why: '연 RANGE 파티션 키 — 부모 청구기본과 같은 연 파티션 정렬(부가가치세 신고 기간 = 청구년월 기준 조회)' }],
    idx: [[['ELCTR_TXINV_APRV_NO'], '전자세금계산서 승인번호 조회(국세청 대사) — 발행분만(부분 인덱스)', 'elctr_txinv_aprv_no IS NOT NULL']] },
  'PAY-011': { estRows: 2000000,
    idx: [
      [['CLCT_DTM'], '수집일시 범위 파일 대사(일별 수집 건수 점검)'],
      [['CLCT_FILE_NM'], '파일명 중복 수집 확인(재전송 파일 판별)']
    ] },
  'PAY-012': { estRows: 3000000,
    idx: [
      [['RAW_USE_NO'], 'FK 조인(원시사용내역) — 원본 CDR 별 오류 이력'],
      [['ERR_OCRN_DTM'], '재처리 대상 큐 — 미처리·재처리중만(부분 인덱스)', "err_prcs_stts_ty_cd IN ('01','02')"]
    ] },
  'PAY-013': { estRows: 100000000, part: { type: 'M', key: 'USE_DT' }, idx: [] },
  'PAY-014': { estRows: 20000000, part: { type: 'Y', key: 'BILL_YM' },
    idx: [[['SBSC_PROD_NO', 'BILL_YM'], 'FK 조인(가입상품기본) — 가입상품(데이터 부가팩)별 월 소진 조회']] },
  'PAY-015': { estRows: 15000000,
    idx: [[['BILL_JOB_NO'], 'FK 조인(청구작업) — Bill Run 별 재계산 이력']] },
  'PAY-016': { estRows: 8000000, idx: [] },
  'PAY-017': { estRows: 30000000, part: { type: 'Y', key: 'DSCNT_APLCN_DTM' },
    idx: [
      [['CHRG_CALC_NO'], 'FK 조인(요금계산내역) — 요금계산 건별 할인'],
      [['SBSC_PROD_NO'], 'FK 조인(가입상품기본) — 가입 할인상품 적용 실적'],
      [['PROD_CD', 'DSCNT_APLCN_DTM'], 'FK 조인(할인상품기본) — 할인상품별 기간 적용 실적(선택약정 25% 등)']
    ] },
  'PAY-018': { estRows: 10000000,
    idx: [
      [['CMBN_CTRT_NO', 'BILL_YM'], 'FK 조인(결합계약기본) — 결합계약 + 청구년월 배분 조회'],
      [['SVC_MGMT_NO', 'BILL_YM'], 'FK 조인(회선기본) — 회선 + 청구년월 결합할인'],
      [['CHRG_CALC_NO'], 'FK 조인(요금계산내역)']
    ] },
  'PAY-019': { estRows: 3000000,
    idx: [
      [['SVC_MGMT_NO'], 'FK 조인(회선기본) — 회선별 위약금 조회(해지 상담)'],
      [['AGRMT_CTRT_NO'], 'FK 조인(약정계약기본)'],
      [['CHRG_CALC_NO'], 'FK 조인(요금계산내역)']
    ] },
  'PAY-020': { estRows: 20000000, part: { type: 'Y', key: 'BILL_YM' },
    idx: [[['BILL_NO', 'BILL_DTL_SEQ'], 'FK 조인(청구상세) — 청구 라인별 할부금']] },
  'PAY-021': { estRows: 5000000,
    idx: [
      [['SVC_MGMT_NO', 'USE_BGNG_DTM'], 'FK 조인(회선기본) — 회선 로밍 사용 조회'],
      [['ROAM_BZMN_NO', 'BILL_YM'], 'FK 조인(로밍사업자기본) — 사업자 + 청구년월 로밍 정산 집계(STL)'],
      [['USE_NO'], 'FK 조인(사용내역)'],
      [['TAP_FILE_NM'], 'TAP 파일 단위 수신 대사·RAP 반송']
    ] },
  'PAY-022': { estRows: 10000000,
    idx: [
      [['SVC_MGMT_NO', 'PYMT_DTM'], 'FK 조인(회선기본) — 회선 소액결제 이용 내역(상담·한도)'],
      [['CNTS_PRVD_CO_NO', 'BILL_YM'], 'FK 조인(콘텐츠제공사기본) — 제공사 + 청구년월 정산(STL)'],
      [['BILL_NO', 'BILL_DTL_SEQ'], 'FK 조인(청구상세)']
    ] },
  'PAY-023': { estRows: 10000000,
    idx: [
      [['SVC_MGMT_NO', 'CNTS_UTLZ_DTM'], 'FK 조인(회선기본) — 회선 콘텐츠 이용 내역'],
      [['CNTS_PRVD_CO_NO', 'BILL_YM'], 'FK 조인(콘텐츠제공사기본) — 제공사 + 청구년월 정산(STL)'],
      [['BILL_NO', 'BILL_DTL_SEQ'], 'FK 조인(청구상세)'],
      [['USE_NO'], 'FK 조인(사용내역)']
    ] },
  'PAY-024': { estRows: 200, idx: [] },
  'PAY-025': { estRows: 15000, idx: [] },
  'PAY-026': { estRows: 28000000, part: { type: 'Y', key: 'INVC_PBLCN_DTM' },
    idx: [[['BILL_NO'], 'FK 조인(청구기본) — 청구서별 발송 결과']] },
  'PAY-027': { estRows: 2000000,
    idx: [
      [['BILL_NO'], 'FK 조인(청구기본)'],
      [['INVC_PBLCN_NO'], 'FK 조인(청구서발행내역) — 원 발행 건 추적']
    ] },
  'PAY-028': { estRows: 25000000, part: { type: 'Y', key: 'BILL_YM' }, idx: [] },
  'PAY-029': { estRows: 100000,
    idx: [[['BILL_YM'], '청구년월 전체 요금항목 매출 통계(PK 선두가 요금항목코드라 월 단위 조회 보완)']] },
  'PAY-030': { estRows: 50000, idx: [] }
}

const lc = (s) => s.toLowerCase()
const tierOf = (n) => (n >= 1e8 ? 'T4' : n >= 1e7 ? 'T3' : n >= 1e6 ? 'T2' : 'T1')

// ── 물리 모델 계산 ─────────────────────────────────────────────────────────
const L = logical[AREA]
const tblOfEnt = new Map()
for (const a of Object.values(logical)) for (const e of a.entities) tblOfEnt.set(`${a.area}.${e.entNm}`, e)

const tables = L.entities.map((e) => {
  const d = PHY[e.entId]
  if (!d) throw new Error('물리 결정 없음 : ' + e.entId)
  const attrs = e.attrs.map((a) => ({ ...a }))
  // 반정규화 칼럼 추가
  for (const dn of d.denorm || []) {
    const src = L.entities.find((x) => x.entId === dn.src)
    const sa = src.attrs.find((a) => a.phyNm === dn.col)
    attrs.push({ ...sa, pk: false, fk: null, nullYn: false, seq: 900, denorm: true })
  }
  const pkCols = attrs.filter((a) => a.pk).sort((x, y) => x.seq - y.seq).map((a) => a.phyNm)
  const partKey = d.part && d.part.key
  if (partKey && !pkCols.includes(partKey)) pkCols.push(partKey) // 파티션 키는 PK 에 포함
  const isPk = (c) => pkCols.includes(c)
  const pkA = pkCols.map((c) => attrs.find((a) => a.phyNm === c))
  const fkA = attrs.filter((a) => !isPk(a.phyNm) && a.fk).sort((x, y) => x.seq - y.seq)
  const etc = attrs.filter((a) => !isPk(a.phyNm) && !a.fk).sort((x, y) => x.seq - y.seq)
  const ordered = [...pkA, ...fkA, ...etc]
  const tblNm = e.tblNm
  const cols = ordered.map((a, i) => ({
    colNm: a.phyNm, dataTp: pgType(a.domNm), nullYn: isPk(a.phyNm) ? false : !!a.nullYn, pk: isPk(a.phyNm), seq: i + 1, termNm: a.attrNm, dflt: null,
    ...(a.denorm ? { denorm: true } : {})
  }))

  // FK 정의 — 부모 엔터티별로 묶어 부모 PK 칼럼 순서에 맞춘다(복합 FK 는 같은 이름 칼럼으로 보완)
  const groups = new Map()
  for (const a of e.attrs) {
    if (!a.fk) continue
    for (const f of [a.fk, ...(a.fk.also || [])]) {
      const k = `${f.area}.${f.ent}`
      if (!groups.has(k)) groups.set(k, { area: f.area, ent: f.ent, map: new Map() })
      groups.get(k).map.set(f.attr, a.phyNm)
    }
  }
  const fks = []
  for (const g of groups.values()) {
    const p = entOf(g.area, g.ent)
    const pPk = p.attrs.filter((a) => a.pk).sort((x, y) => x.seq - y.seq)
    const cs = pPk.map((pa) => g.map.get(pa.attrNm) || (attrs.find((a) => a.phyNm === pa.phyNm) || {}).phyNm)
    if (cs.some((c) => !c)) throw new Error(`FK 칼럼 대응 실패 : ${e.entNm} → ${g.ent}`)
    fks.push({ nm: `FK_${tblNm}_${String(fks.length + 1).padStart(2, '0')}`, cols: cs, refTbl: p.tblNm, refCols: pPk.map((a) => a.phyNm), refArea: g.area, refEnt: g.ent })
  }

  const pk = { nm: `PK_${tblNm}`, cols: pkCols }
  const idx = d.idx.map(([cs, why, where], i) => ({ nm: `X_${tblNm}_${String(i + 1).padStart(2, '0')}`, cols: cs, unq: false, why, ...(where ? { where } : {}) }))
  for (const ix of idx) for (const c of ix.cols) if (!cols.find((x) => x.colNm === c)) throw new Error(`인덱스 칼럼 없음 ${ix.nm}.${c}`)
  // 중복 인덱스 검사 — PK·다른 인덱스의 앞부분과 같으면 중복(부분 인덱스는 조건이 다르므로 제외)
  const keys = [pk.cols, ...idx.filter((x) => !x.where).map((x) => x.cols)]
  for (const ix of idx) {
    if (ix.where) continue
    for (const k of keys) if (k !== ix.cols && ix.cols.length <= k.length && ix.cols.every((c, i) => k[i] === c)) throw new Error(`중복 인덱스 ${ix.nm} ⊆ [${k}]`)
  }

  let partition = null
  if (d.part) {
    const kc = cols.find((c) => c.colNm === d.part.key)
    partition = { type: 'RANGE', key: d.part.key, unit: d.part.type === 'M' ? 'MONTH' : 'YEAR', from: PART_FROM, to: PART_TO,
      note: `${d.part.type === 'M' ? '월' : '연'} 단위 ${d.part.type === 'M' ? 216 : 18}개 + DEFAULT 1개(${kc.dataTp}) — 파티션 키는 PK 에 포함` }
  }
  const denorm = (d.denorm || []).map((dn) => ({ col: dn.col, srcTbl: L.entities.find((x) => x.entId === dn.src).tblNm, why: dn.why }))
  return { tblNm, entId: e.entId, entNm: e.entNm, tp: e.tp, ...(e.moduleCd ? { moduleCd: e.moduleCd } : {}), def: e.def, estRows: d.estRows, volTier: tierOf(d.estRows), cols, pk, idx, fks, partition, denorm }
})
// STL 모듈 표시 승계(논리 엔터티 moduleCd 없으면 areas.json 에서)
const areas = rd('model/areas.json')
const payArea = areas.areas.find((a) => a.code === AREA)
for (const t of tables) if (!t.moduleCd && payArea.moduleCd && payArea.moduleCd[t.entNm]) t.moduleCd = payArea.moduleCd[t.entNm]

const out = {
  area: AREA, areaNm: '청구', stg: 'PHY', trgtDbms: 'POSTGRESQL', dbmsVer: '17', ver: '2026-11-07', author: 'subagent_physical_modeler',
  conv: 'cols 순서 = PK → FK → 일반(DDL 때 시스템 칼럼 4개 추가). nullYn true = NULL 허용. idx.where = 부분 인덱스 조건(PostgreSQL 소문자 SQL). fks = 설계 정의만(D6 — DDL 미생성), refArea·refEnt = 부모 위치. denorm 칼럼은 cols 에 denorm:true',
  decisions: [
    { id: 'P1', dec: '파티션 키는 PK 에 포함 — 파티션 테이블의 물리 PK = 논리 PK + 파티션 키', why: 'PostgreSQL 파티션 테이블의 PK·유일 인덱스는 파티션 키를 포함해야 한다. 논리 식별자(번호)는 결정적 키 공식으로 전역 유일하게 발번(데이터 생성 5절)하므로 업무 유일성은 유지' },
    { id: 'P2', dec: 'T4(1억+) = 월 RANGE 2010-01~2027-12(216 + DEFAULT), T3 2천만+ 누적 이력 = 연 RANGE 2010~2027(18 + DEFAULT), 그 외 비파티션', why: '과제 지시. 월 키는 청구년월(청구 마감 단위 = 보관·재청구·삭제 단위)이 있으면 그것, 없으면 행위 일시(원시사용 = 수집일시, 사용량일집계 = 사용일자)' },
    { id: 'P3', dec: '청구상세·청구세금상세에 청구년월 반정규화(파티션 키)', why: '논리 M1 에서 부분 종속으로 제거한 칼럼 — 파티션 정렬·회선 + 청구년월 조회 때문에 물리에서만 복원. 다른 반정규화(서비스번호 등)는 회선기본 1회 조회로 충분해 하지 않음' },
    { id: 'P4', dec: 'FK 의 부모가 파티션 키를 PK 에 추가한 테이블이면(원시사용내역·사용내역·요금계산내역·청구기본·청구상세·청구서발행내역) 참조 칼럼 = 논리 PK 만', why: 'FK 는 DDL 미생성(D6) — 설계 정의는 업무 키 기준. PostgreSQL 에서 실제 FK 를 걸려면 자식에 파티션 키를 추가해야 하므로 RI 물리 구현 시 재검토' },
    { id: 'P5', dec: '상태 칼럼 단독 인덱스 금지 — 저선택도(S3) 상태는 처리 대상 상태만 부분 인덱스', why: '98% 한 값 칼럼의 B-tree 는 옵티마이저가 쓰지 않거나 오판(S3 편향). 처리 큐(미과금·재처리·미반영 조정·미납 확정 대상)만 작게 유지' },
    { id: 'P6', dec: '기준 코드 FK(요금항목코드·청구조정사유유형코드·청구주기코드) 단독 인덱스 없음', why: '부모가 수십~수백 행 기준 테이블이라 부모→자식 조인 경로가 없고 저선택도. 요금항목별 집계는 요금항목월통계(PROC)가 담당' },
    { id: 'P7', dec: 'estRows 는 볼륨 등급 목표 — 청구주기코드(30)·청구조정사유코드(200)는 코드 성격상 T1 하한 미만', why: '실무 코드 수. 최종 행 수·배율은 data_migrationner(docs/06) 결정' }
  ],
  tables
}
fs.mkdirSync(path.join(ROOT, 'model/physical'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'model/physical/PAY.json'), JSON.stringify(out, null, 1) + '\n')

// ── DDL ─────────────────────────────────────────────────────────────────
const q = (s) => "'" + s.replace(/'/g, "''") + "'"
const T = []
T.push('-- 40_pay_tables.sql : PAY(청구 — 사용량·요금계산 포함) 테이블 생성 — PK·인덱스 없이(D14 적재 순서), 파티션 포함')
T.push('-- 실행 : psql -v ON_ERROR_STOP=1 -f 40_pay_tables.sql (search_path 대상 스키마). 재실행 안전(IF NOT EXISTS). 생성기 tools/physical_PAY.js')
T.push('-- FK 제약 없음(D6 — 설계 정의는 model/physical/PAY.json fks). 시스템 칼럼 4개는 맨 끝(D7)\n')
for (const t of tables) {
  const tn = lc(t.tblNm)
  T.push(`-- ${t.entId} ${t.entNm}${t.moduleCd ? ' [' + t.moduleCd + ']' : ''} · 예상 ${t.estRows.toLocaleString('en-US')}행(${t.volTier})${t.partition ? ' · ' + (t.partition.unit === 'MONTH' ? '월' : '연') + ' RANGE ' + t.partition.key : ''}`)
  const body = t.cols.map((c) => `  ${lc(c.colNm).padEnd(28)} ${c.dataTp.padEnd(14)}${c.nullYn ? '' : ' NOT NULL'}`)
  for (const [n, tp, df] of SYS_COLS) body.push(`  ${lc(n).padEnd(28)} ${tp.padEnd(14)} NOT NULL DEFAULT ${df}`)
  T.push(`CREATE TABLE IF NOT EXISTS ${tn} (\n${body.join(',\n')}\n)${t.partition ? ` PARTITION BY RANGE (${lc(t.partition.key)})` : ''};`)
  if (t.partition) {
    const kc = t.cols.find((c) => c.colNm === t.partition.key)
    const fmt = kc.dataTp === 'CHAR(6)' ? 'YYYYMM' : kc.dataTp === 'CHAR(8)' ? 'YYYYMMDD' : 'YYYY-MM-DD'
    const m = t.partition.unit === 'MONTH'
    T.push(`DO $$\nDECLARE d date;\nBEGIN\n  FOR d IN SELECT generate_series(DATE '${PART_FROM}-01', DATE '${m ? PART_TO + '-01' : PART_TO.slice(0, 4) + '-01-01'}', INTERVAL '1 ${m ? 'month' : 'year'}')::date LOOP\n    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ${tn} FOR VALUES FROM (%L) TO (%L)',\n      '${tn}_p' || to_char(d, '${m ? 'YYYYMM' : 'YYYY'}'), to_char(d, '${fmt}'), to_char(d + INTERVAL '1 ${m ? 'month' : 'year'}', '${fmt}'));\n  END LOOP;\nEND $$;`)
    T.push(`CREATE TABLE IF NOT EXISTS ${tn}_pdef PARTITION OF ${tn} DEFAULT;`)
  }
  T.push(`COMMENT ON TABLE ${tn} IS ${q(t.entNm)};`)
  for (const c of t.cols) T.push(`COMMENT ON COLUMN ${tn}.${lc(c.colNm)} IS ${q(c.termNm)};`)
  for (const [n, , , nm] of SYS_COLS) T.push(`COMMENT ON COLUMN ${tn}.${lc(n)} IS ${q(nm)};`)
  T.push('')
}
fs.mkdirSync(path.join(ROOT, 'ddl'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'ddl/40_pay_tables.sql'), T.join('\n'))

const C = []
C.push('-- 40_pay_constraints.sql : PAY PK·인덱스 — 데이터 적재 뒤 실행(D14). 재실행 안전(IF NOT EXISTS·제약 존재 확인)')
C.push('-- 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX / 파티션 테이블 = ADD CONSTRAINT PRIMARY KEY (파티션 키 포함). FK 제약은 만들지 않음(D6)')
C.push('-- 실행 후 ANALYZE 는 메인 적재 절차가 수행. 생성기 tools/physical_PAY.js\n')
for (const t of tables) {
  const tn = lc(t.tblNm)
  const pk = lc(t.pk.nm)
  const pc = t.pk.cols.map(lc).join(', ')
  C.push(`-- ${t.entId} ${t.entNm}`)
  if (t.partition) {
    C.push(`DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '${tn}'::regclass AND contype = 'p') THEN\n    ALTER TABLE ${tn} ADD CONSTRAINT ${pk} PRIMARY KEY (${pc});\n  END IF;\nEND $$;`)
  } else {
    C.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${pk} ON ${tn} (${pc});`)
    C.push(`DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '${tn}'::regclass AND contype = 'p') THEN\n    ALTER TABLE ${tn} ADD CONSTRAINT ${pk} PRIMARY KEY USING INDEX ${pk};\n  END IF;\nEND $$;`)
  }
  for (const ix of t.idx) C.push(`CREATE ${ix.unq ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${lc(ix.nm)} ON ${tn} (${ix.cols.map(lc).join(', ')})${ix.where ? ' WHERE ' + ix.where : ''};`)
  C.push('')
}
fs.writeFileSync(path.join(ROOT, 'ddl/40_pay_constraints.sql'), C.join('\n'))

// ── 문서 ────────────────────────────────────────────────────────────────
const fmtN = (n) => n.toLocaleString('en-US')
const D = []
D.push('# 05 물리 모델 — PAY 청구(사용량·요금계산 포함)\n')
D.push('> 작성 2026-11-07 · subagent_physical_modeler · 대상 PostgreSQL 17 · 생성기 `tools/physical_PAY.js` · 산출 `model/physical/PAY.json`, `ddl/40_pay_tables.sql`, `ddl/40_pay_constraints.sql`')
D.push('> 마스터 위임 자동 승인 모드 — 판단 근거는 6절 결정 메모.\n')
D.push('## 1. 테이블 목록\n')
D.push('| ID | 엔터티 | 테이블 | 유형 | 모듈 | 칼럼 | PK | 파티션 | 인덱스 | FK(정의) | 예상 행 수 | 등급 |')
D.push('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const t of tables) D.push(`| ${t.entId} | ${t.entNm} | \`${t.tblNm}\` | ${t.tp} | ${t.moduleCd || ''} | ${t.cols.length}(+4) | ${t.pk.cols.join(' + ')} | ${t.partition ? (t.partition.unit === 'MONTH' ? '월' : '연') + ' ' + t.partition.key : '-'} | ${t.idx.length} | ${t.fks.length} | ${fmtN(t.estRows)} | ${t.volTier} |`)
const sum = tables.reduce((s, t) => s + t.estRows, 0)
D.push(`\n테이블 ${tables.length}개 · 예상 합계 ${fmtN(sum)}행 · 인덱스 ${tables.reduce((s, t) => s + t.idx.length, 0)}개(PK 제외) · FK 정의 ${tables.reduce((s, t) => s + t.fks.length, 0)}개(DDL 미생성, D6)\n`)
D.push('## 2. 파티션\n')
D.push('| 테이블 | 단위 | 키(타입) | 범위 | 하위 테이블 | 사유 |')
D.push('|---|---|---|---|---|---|')
for (const t of tables.filter((x) => x.partition)) {
  const kc = t.cols.find((c) => c.colNm === t.partition.key)
  const m = t.partition.unit === 'MONTH'
  D.push(`| \`${t.tblNm}\` | ${m ? '월' : '연'} | ${t.partition.key}(${kc.dataTp}) | ${PART_FROM}~${PART_TO} | ${m ? 216 : 18} + DEFAULT(\`_pdef\`) | ${m ? 'T4 ' : 'T3 누적 이력 '}${fmtN(t.estRows)}행 — 청구월 단위 보관·삭제·재청구, 최근 파티션 쏠림(S6) 분리 |`)
}
D.push('\n하위 테이블 이름 = `<테이블>_pYYYYMM`(월)·`<테이블>_pYYYY`(연)·`<테이블>_pdef`(기본). 파티션 키는 PK 에 포함(결정 P1). 2028년 이후 파티션은 운영 배치가 매년 추가(DEFAULT 에 쌓이지 않게).\n')
D.push('## 3. 인덱스\n')
D.push('| 테이블 | 이름 | 칼럼 | 조건 | 근거 |')
D.push('|---|---|---|---|---|')
for (const t of tables) {
  D.push(`| \`${t.tblNm}\` | \`${t.pk.nm}\` | ${t.pk.cols.join(', ')} | PK | 주식별자${t.partition ? ' + 파티션 키' : ''} |`)
  for (const ix of t.idx) D.push(`| \`${t.tblNm}\` | \`${ix.nm}\` | ${ix.cols.join(', ')} | ${ix.where ? '`' + ix.where + '`' : ''} | ${ix.why} |`)
}
D.push('\n중복 인덱스 검사 : PK·다른 인덱스의 앞부분과 같은 칼럼 열 = 0건(생성기가 검사). 부분 인덱스는 조건이 달라 별도.\n')
D.push('## 4. 반정규화\n')
D.push('| 테이블 | 칼럼 | 원천 | 사유 |')
D.push('|---|---|---|---|')
for (const t of tables) for (const dn of t.denorm) D.push(`| \`${t.tblNm}\` | ${dn.col} | \`${dn.srcTbl}\` | ${dn.why} |`)
D.push('\n그 외 반정규화 없음 — 청구기본 금액 합계는 논리 E2(확정 금액 스냅샷)로 이미 논리 속성이고, 서비스번호·청구계정번호 복사는 PK 조인 1회로 충분해 하지 않음.\n')
D.push('## 5. FK 정의(DDL 미생성, D6)\n')
D.push('| 이름 | 자식 칼럼 | 부모 테이블 | 부모 칼럼 | 부모 영역 |')
D.push('|---|---|---|---|---|')
for (const t of tables) for (const f of t.fks) D.push(`| \`${f.nm}\` | ${f.cols.join(', ')} | \`${f.refTbl}\` | ${f.refCols.join(', ')} | ${f.refArea} |`)
D.push('\n## 6. 결정 메모\n')
D.push('| # | 결정 | 근거 |')
D.push('|---|---|---|')
for (const x of out.decisions) D.push(`| ${x.id} | ${x.dec} | ${x.why} |`)
D.push('\n## 7. 타입·시스템 칼럼\n')
D.push('- 칼럼 타입 = 표준 도메인 그대로(`번호V20` → VARCHAR(20), `금액N15` → NUMERIC(15), `일자C8` → CHAR(8), `일시TS` → TIMESTAMP, `금액N18_4` → NUMERIC(18,4) 등). 칼럼 순서 = PK → FK → 일반.')
D.push('- 시스템 칼럼(DDL 만, D7) : `lst_mddtm TIMESTAMP` · `lst_mdfr_id VARCHAR(50)` · `lst_rgdtm TIMESTAMP` · `lst_rgtr_id VARCHAR(50)` — NOT NULL, 기본값 CURRENT_TIMESTAMP / \'SYSTEM\'.')
D.push('- 이름 길이 : 테이블 25자 권고(schema.pi TBL_NM_MAX) 초과 1건 `PTL_PAY_USE_QTY_CLCT_FILE_L`(27자) — 논리 단계 tblNm 승계, PostgreSQL 63자 한도 안이라 유지(인덱스명 `x_ptl_pay_use_qty_clct_file_l_02` 32자).')
fs.writeFileSync(path.join(ROOT, 'docs/05_physical_PAY.md'), D.join('\n') + '\n')
console.log('tables', tables.length, 'rows', sum, 'part', tables.filter((t) => t.partition).map((t) => t.tblNm).join(','))
