// COL(미납) 물리 모델 생성기 — model/logical/*.json → model/physical/COL.json + ddl/60_col_*.sql + docs/05_physical_COL.md
// 실행 : node sitemap/schema.pi/pitel/tools/physical_COL_build.js   (저장소 어디서 실행해도 이 파일 기준 상대경로)
// 설계 결정(볼륨·파티션·인덱스·반정규화)은 아래 상수 CFG 한 곳에 모은다.
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const LG = Object.fromEntries(AREAS.map((a) => [a, rd(`model/logical/${a}.json`)]))
const DOM = Object.fromEntries(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const TERMS = rd('model/std/terms.json')
const col = LG.COL
// 다른 영역 물리 모델(있으면) — 교차 FK refCols 를 부모 물리 PK(파티션 키 포함)로 맞춘다
const PH = {}
for (const a of AREAS) if (a !== 'COL' && fs.existsSync(path.join(ROOT, `model/physical/${a}.json`))) for (const t of rd(`model/physical/${a}.json`).tables) PH[t.tblNm] = t

const PART_FROM = 2010
const PART_TO = 2027
const HIGH = "'9999-12-31 23:59:59'"

// 테이블별 설계 : rows = 목표 행 수, part = 연 RANGE 파티션 키, den = 반정규화 칼럼, idx = 인덱스(순번 자동)
const CFG = {
  PTL_COL_UNPD_M: {
    rows: 20_000_000,
    den: [
      { after: 'BILL_NO', term: '청구계정번호', nullYn: false, src: 'PTL_PAY_BILL_M', fk: 'PTL_CUS_BILL_ACNT_M',
        why: '청구계정+청구년월 미납 조회(상담·수납배분 대상 선정)가 매일 수백만 회 — 청구기본(T4 수억 행) 조인 제거' },
      { after: 'BILL_ACNT_NO', term: '청구년월', nullYn: false, src: 'PTL_PAY_BILL_M', fkOf: 'PTL_PAY_BILL_M.BILL_YM',
        why: '청구계정+청구년월 복합 조회·월별 미납 발생 집계(미납월집계 생성) — 청구기본 조인 제거. 청구기본 PK(청구번호+청구년월, 연 파티션)를 완성하는 FK 칼럼 겸용' },
      { after: 'BILL_YM', term: '고객번호', nullYn: false, src: 'PTL_CUS_BILL_ACNT_M', fk: 'PTL_CUS_CUST_M',
        why: '고객번호 단위 미납 조회(상담·채권이관 묶음·신용정보 등록 판정 배치) — 청구계정 경유 2단 조인 제거' },
      { after: 'FRST_UNPD_AMT', term: '미납잔여금액', nullYn: false, src: 'PTL_COL_UNPD_D',
        why: '04 관문 F1 인계. 이용정지·독촉·직권해지 판정 배치가 매일 미납 채권 전체의 잔액을 봄 — 미납상세 6천만 행 SUM 회피. 수납배분 반영 시 같은 트랜잭션에서 갱신' },
    ],
    idx: [
      { cols: ['BILL_NO'], unq: true, why: 'PAY 청구기본과 1:1 대체키 — 청구서→미납 조인·중복 생성 방지' },
      { cols: ['BILL_ACNT_NO', 'BILL_YM'], why: '청구계정+청구년월 미납 조회(반정규화 칼럼)' },
      { cols: ['CUST_NO'], why: '고객번호 단위 미납 조회·채권이관 묶음 생성' },
      { cols: ['UNPD_STTS_TY_CD', 'UNPD_OCRN_DTM'], where: "unpd_stts_ty_cd IN ('01','02','04')",
        why: '진행 중 미납(미납·일부납부·분할납부중)만 부분 인덱스 — 완납이 대부분인 저선택도 상태값(S3)을 전체 인덱싱하지 않음. 독촉·정지 대상 추출 배치' },
      { cols: ['RCVB_TRNSF_NO'], where: 'rcvb_trnsf_no IS NOT NULL', why: '채권이관기본→미납 조인(FK, 대부분 NULL — S5 부분 인덱스)' },
      { cols: ['DIV_PAY_AGRMT_NO'], where: 'div_pay_agrmt_no IS NOT NULL', why: '분할납부약정→대상 미납 조인(FK, 대부분 NULL — S5 부분 인덱스)' },
    ],
  },
  PTL_COL_UNPD_D: {
    rows: 60_000_000,
    den: [
      { after: 'BILL_DTL_SEQ', term: '청구년월', nullYn: false, src: 'PTL_PAY_BILL_D', fkOf: 'PTL_PAY_BILL_D.BILL_YM',
        why: 'PAY 청구상세 PK(청구번호+청구상세순번+청구년월, 월 파티션 217개)를 완성하는 FK 칼럼 — 수납배분·조정의 청구상세 조인을 1개 파티션으로 프루닝(05 COL 물리 관문 R1)' },
      { after: 'ACML_RCV_AMT', term: '미납잔여금액', nullYn: false, src: 'PTL_COL_UNPD_D(자기 계산값)',
        why: '04 관문 F1 인계. 수납배분이 항목 순위대로 잔액 있는 항목을 찾는 핫 경로 — 최초미납금액−누적수납금액+미납조정금액 매번 계산 회피' },
    ],
    idx: [
      { cols: ['BILL_NO', 'BILL_DTL_SEQ'], why: '수납배분(INV)·청구 조정 시 청구상세→미납상세 조회(FK 조인)' },
    ],
  },
  PTL_COL_OVDU_ADCHG_L: {
    rows: 40_000_000, part: 'ADCHG_IMPS_DTM',
    den: [
      { after: 'RFLT_BILL_NO', term: '반영청구년월', nullYn: true, src: 'PTL_PAY_BILL_M', fkOf: 'PTL_PAY_BILL_M.BILL_YM',
        why: 'PAY 청구기본 PK(청구번호+청구년월, 연 파티션)를 완성하는 FK 칼럼 — 반영 청구서 조회 프루닝(05 COL 물리 관문 R1). 반영 전 NULL' },
    ],
    idx: [
      { cols: ['UNPD_NO', 'IMPS_YM'], why: '미납별 가산금 조회·같은 부과년월 중복 부과 점검(FK 조인)' },
      { cols: ['RFLT_BILL_NO'], where: 'rflt_bill_no IS NOT NULL', why: '청구서에 실린 가산금 조회(FK, 반영 전 NULL)' },
    ],
  },
  PTL_COL_DUN_L: {
    rows: 50_000_000, part: 'DUN_SNDNG_DTM',
    idx: [
      { cols: ['UNPD_NO', 'DUN_SNDNG_DTM'], why: '미납별 독촉 이력 조회(FK 조인·최근순)' },
      { cols: ['DUN_SNDNG_DTM'], where: "dun_sndng_stts_ty_cd = '01'", why: '발송대기 독촉만 부분 인덱스 — 발송 배치 큐(상태 대부분 발송 완료 S3)' },
    ],
  },
  PTL_COL_DUN_SNDNG_RSLT_L: {
    rows: 55_000_000, part: 'DUN_SNDNG_DTM',
    den: [
      { after: 'DUN_NO', term: '독촉발송일시', nullYn: false, pk: true, src: 'PTL_COL_DUN_L',
        why: '부모 독촉내역 PK(독촉번호+독촉발송일시, 파티션 키 포함)를 완성하는 FK 칼럼이자 이 테이블의 파티션 키 — 부모와 같은 연 파티션끼리 조인(partition-wise join)' },
    ],
    idx: [],
  },
  PTL_COL_SUSP_M: {
    rows: 6_000_000,
    idx: [
      { cols: ['SVC_MGMT_NO', 'SUSP_DTM'], why: '회선(서비스관리번호)별 미납 정지 조회 — 상담·회선상태 반영(FK 조인)' },
      { cols: ['UNPD_NO'], why: '미납→이용정지 조인(FK)' },
      { cols: ['SUSP_STTS_TY_CD', 'SUSP_DTM'], where: "susp_stts_ty_cd IN ('01','02')", why: '예고·정지 중인 건만 부분 인덱스 — 해제·직권해지 전환 배치' },
    ],
  },
  PTL_COL_EXOFTRMN_M: {
    rows: 1_500_000,
    idx: [
      { cols: ['SBSC_CTRT_NO'], why: '가입계약별 직권해지 조회(FK 조인)' },
      { cols: ['UNPD_NO'], why: '미납→직권해지 조인(FK)' },
      { cols: ['SUSP_NO'], where: 'susp_no IS NOT NULL', why: '이용정지→직권해지 조인(FK, 선택)' },
      { cols: ['EXOFTRMN_SCHD_DT'], where: "exoftrmn_stts_ty_cd IN ('01','02')", why: '예고·예정 건의 해지 예정일 도래 배치(부분 인덱스)' },
    ],
  },
  PTL_COL_RCVB_TRNSF_M: {
    rows: 1_000_000,
    idx: [
      { cols: ['CUST_NO'], why: '고객번호별 이관 채권 조회(FK 조인)' },
      { cols: ['RCVB_DSPSL_NO'], where: 'rcvb_dspsl_no IS NOT NULL', why: '채권매각→이관 묶음 조인(FK, 대부분 NULL)' },
    ],
  },
  PTL_COL_DIV_PAY_AGRMT_M: {
    rows: 2_000_000,
    idx: [{ cols: ['BILL_ACNT_NO'], why: '청구계정별 분할납부 약정 조회(FK 조인)' }],
  },
  PTL_COL_BDDT_M: {
    rows: 4_000_000,
    idx: [
      { cols: ['UNPD_NO'], why: '미납→대손 조인(FK)' },
      { cols: ['RCVB_TRNSF_NO'], where: 'rcvb_trnsf_no IS NOT NULL', why: '이관 묶음→대손 조인(FK, 선택)' },
      { cols: ['BDDT_CFMTN_DT'], why: '회계 월 마감·세무 대손금 집계(확정일자 범위 조회)' },
    ],
  },
  PTL_COL_UNPD_STTS_H: { rows: 70_000_000, part: 'STTS_CHG_DTM', idx: [] },
  PTL_COL_OVDU_ADCHG_STD_C: { rows: 20, idx: [] },
  PTL_COL_DUN_PLCY_M: { rows: 2_000, idx: [] },
  PTL_COL_SUSP_H: { rows: 15_000_000, idx: [] },
  PTL_COL_SUSP_RLS_L: {
    rows: 5_000_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['SUSP_NO'], why: '이용정지→해제 처리 조인(FK)' },
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '수납→정지 해제 역추적(FK, 선택)' },
      { cols: ['DIV_PAY_AGRMT_NO'], where: 'div_pay_agrmt_no IS NOT NULL', why: '분할납부약정→해제 조인(FK, 선택)' },
      { cols: ['PAY_PRMS_NO'], where: 'pay_prms_no IS NOT NULL', why: '납부약속→해제 조인(FK, 선택)' },
    ],
  },
  PTL_COL_EXOFTRMN_PRNTC_L: { rows: 3_000_000, idx: [] },
  PTL_COL_RCVB_COLL_CO_M: { rows: 200, idx: [] },
  PTL_COL_COLL_DLGT_D: {
    rows: 1_500_000,
    idx: [{ cols: ['RCVB_COLL_CO_NO', 'COLL_DLGT_DT'], why: '추심사별 위임 현황·기간 조회(FK 조인)' }],
  },
  PTL_COL_COLL_RTRVL_L: {
    rows: 3_000_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['RCVB_TRNSF_NO', 'COLL_DLGT_SEQ'], why: '추심위임→회수 조인(FK)' },
      { cols: ['UNPD_NO'], why: '미납별 추심 회수 조회(FK)' },
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '수납→추심회수 역추적(FK, 선택)' },
      { cols: ['COLL_FEE_NO'], where: 'coll_fee_no IS NOT NULL', why: '추심수수료→대상 회수 조인(FK, 정산 전 NULL)' },
    ],
  },
  PTL_COL_COLL_FEE_L: {
    rows: 12_000,
    idx: [
      { cols: ['RCVB_COLL_CO_NO', 'STLM_YM'], unq: true, why: '추심사×정산년월 1건 — 중복 정산 방지·월 정산 조회(FK 조인)' },
      { cols: ['STLM_NO'], where: 'stlm_no IS NOT NULL', why: 'PRM 정산기본→추심수수료 조인(FK, 선택)' },
    ],
  },
  PTL_COL_DIV_PAY_TMS_D: {
    rows: 12_000_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '수납→분할납부 회차 반영 조회(FK, 선택)' },
      { cols: ['PAY_SCHD_DT'], where: "div_pay_tms_stts_ty_cd IN ('01','03')", why: '예정·일부납 회차의 납부예정일 도래 배치(부분 인덱스)' },
    ],
  },
  PTL_COL_PAY_PRMS_L: {
    rows: 4_000_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['BILL_ACNT_NO', 'PAY_PRMS_DT'], why: '청구계정별 납부약속 조회·약속일 도래 점검(FK 조인)' },
      { cols: ['UNPD_NO'], where: 'unpd_no IS NOT NULL', why: '미납→납부약속 조인(FK, 선택)' },
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '수납→약속 이행 확인(FK, 선택)' },
    ],
  },
  PTL_COL_CRINFO_REG_L: {
    rows: 3_000_000,
    idx: [
      { cols: ['CUST_NO'], why: '고객번호별 신용정보 등록 조회(FK 조인)' },
      { cols: ['UNPD_NO'], where: 'unpd_no IS NOT NULL', why: '미납→신용정보 등록 조인(FK, 선택)' },
    ],
  },
  PTL_COL_CRINFO_RLS_L: {
    rows: 2_500_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['CRINFO_REG_NO'], why: '등록→해제 조인(FK)' },
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '완납 수납→해제 역추적(FK, 선택)' },
    ],
  },
  PTL_COL_BDDT_DPRC_D: {
    rows: 12_000_000,
    idx: [{ cols: ['UNPD_NO', 'UNPD_DTL_SEQ'], why: '미납상세→대손상각상세 조인(FK)' }],
  },
  PTL_COL_BDDT_RTRVL_L: {
    rows: 400_000,
    den: [
      { after: 'RCV_NO', term: '수납일자', nullYn: true, src: 'PTL_INV_RCV_M', fkOf: 'PTL_INV_RCV_M.RCV_DT', why: 'INV 수납기본 PK(수납번호+수납일자, 수납일자 월 파티션 217개)를 완성하는 FK 칼럼 — 없으면 수납번호 조회가 전 파티션 인덱스를 훑음(05 COL 물리 관문 R1). 수납 반영 시 수납번호와 함께 기록, 미반영 NULL' },
    ],
    idx: [
      { cols: ['BDDT_NO'], why: '대손→회수 조인(FK)' },
      { cols: ['RCV_NO'], where: 'rcv_no IS NOT NULL', why: '수납→대손 회수 역추적(FK, 선택)' },
      { cols: ['COLL_RTRVL_NO'], where: 'coll_rtrvl_no IS NOT NULL', why: '추심회수→대손 회수 조인(FK, 선택)' },
    ],
  },
  PTL_COL_RCVB_DSPSL_L: {
    rows: 3_000,
    idx: [{ cols: ['RCVB_COLL_CO_NO'], why: '매입사별 매각 조회(FK 조인)' }],
  },
  PTL_COL_RCVB_PRSCR_H: {
    rows: 26_000_000,
    idx: [
      { cols: ['EXTSH_PRSCR_EXPRY_DT'], where: `vld_end_dtm = ${HIGH}`, why: '현재 유효 시효만 부분 인덱스 — 소멸시효 만료 도래 배치(대손 전환)' },
    ],
  },
  PTL_COL_UNPD_MM_T: {
    rows: 60_000_000, part: 'STD_YM',
    idx: [], // PK = (청구계정번호, 기준년월) — 파티션 키를 끝으로 옮겨 계정 선두, 계정별 월 추이는 PK 로 처리
  },
  PTL_COL_UNPD_RTRVL_MM_S: { rows: 20_000, idx: [] },
}

// 참조 테이블 조회 : 'AREA.엔터티명' → {tbl, pkCols, attrPhy(attrNm)}
const entIndex = {}
for (const a of AREAS) for (const e of LG[a].entities) entIndex[`${a}.${e.entNm}`] = e
const termOf = (nm) => {
  const t = TERMS.find((x) => x.termNm === nm)
  if (!t) throw new Error('표준용어 없음 : ' + nm)
  return t
}
const dataTp = (domNm) => {
  const d = DOM[domNm]
  if (!d) throw new Error('도메인 없음 : ' + domNm)
  if (d.lgcTp === 'VARCHAR' || d.lgcTp === 'CHAR') return `${d.lgcTp}(${d.len})`
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return d.lgcTp
}

const tables = []
for (const e of col.entities) {
  const tbl = e.tblNm
  const cfg = CFG[tbl]
  if (!cfg) throw new Error('CFG 없음 : ' + tbl)
  // 논리 속성 → 칼럼(정렬 : PK → FK → 일반, 논리 순서 유지)
  let cols = e.attrs.map((a) => ({ colNm: a.phyNm, attrNm: a.attrNm, dataTp: dataTp(a.domNm), nullYn: a.nullYn, pk: a.pk, termNm: a.attrNm, fk: a.fk, dflt: null }))
  for (const d of cfg.den || []) {
    const t = termOf(d.term)
    const at = cols.findIndex((c) => c.colNm === d.after)
    if (at < 0) throw new Error('반정규화 위치 없음 : ' + d.after)
    cols.splice(at + 1, 0, { colNm: t.phyNm, attrNm: t.termNm, dataTp: dataTp(t.domNm), nullYn: d.nullYn, pk: !!d.pk, termNm: t.termNm, fk: null, den: d, dflt: null })
  }
  if (cfg.part) {
    const pc = cols.find((c) => c.colNm === cfg.part)
    if (!pc) throw new Error('파티션 키 없음 : ' + cfg.part)
    pc.pk = true
    if (pc.nullYn) throw new Error('파티션 키 NULL 허용 : ' + cfg.part)
  }
  const rank = (c) => (c.pk ? 0 : c.fk || c.den?.fk || c.den?.fkOf ? 1 : 2)
  cols = cols.map((c, i) => ({ c, i })).sort((x, y) => rank(x.c) - rank(y.c) || x.i - y.i).map((x) => x.c)
  // 파티션 테이블의 PK : 파티션 키를 PK 끝에 둔다(부모 PK 앞부분 = 업무 식별자 순서 유지)
  const pkCols = cols.filter((c) => c.pk).map((c) => c.colNm)
  if (cfg.part && pkCols[pkCols.length - 1] !== cfg.part) {
    pkCols.splice(pkCols.indexOf(cfg.part), 1)
    pkCols.push(cfg.part)
  }
  // FK 정의(설계만) — 부모 엔터티별 묶음, 부모 PK 순서로 정렬
  const groups = new Map()
  for (const c of cols) {
    if (!c.fk) continue
    const key = `${c.fk.area}.${c.fk.ent}`
    const parent = entIndex[key]
    if (!parent) throw new Error('부모 엔터티 없음 : ' + key)
    const pa = parent.attrs.find((x) => x.attrNm === c.fk.attr)
    if (!pa) throw new Error('부모 속성 없음 : ' + key + '.' + c.fk.attr)
    if (!groups.has(key)) groups.set(key, { refTbl: parent.tblNm, parent, pairs: [] })
    groups.get(key).pairs.push([c.colNm, pa.phyNm])
  }
  const fks = []
  for (const g of groups.values()) {
    const refPk = g.parent.attrs.filter((x) => x.pk).map((x) => x.phyNm)
    // 부모가 이 영역 파티션 테이블이면 부모 PK 에 파티션 키가 붙는다 — 자식 반정규화 칼럼으로 완성
    const pcfg = CFG[g.refTbl]
    if (pcfg?.part && !refPk.includes(pcfg.part)) {
      refPk.push(pcfg.part)
      if (cols.some((c) => c.colNm === pcfg.part)) g.pairs.push([pcfg.part, pcfg.part])
    }
    // 다른 영역 부모가 물리에서 파티션 키를 PK 에 붙였으면 den.fkOf 칼럼으로 완성 — 못 채우면 실패(관문 R1)
    const php = PH[g.refTbl]
    if (php) for (const rc of php.pk.cols) {
      if (g.pairs.some((p) => p[1] === rc)) continue
      const dc = cols.find((c) => c.den?.fkOf === `${g.refTbl}.${rc}` && !g.pairs.some((p) => p[0] === c.colNm))
      if (!dc) throw new Error(`부모 PK 미완성 FK : ${tbl} → ${g.refTbl}.${rc}`)
      g.pairs.push([dc.colNm, rc])
      if (!refPk.includes(rc)) refPk.push(rc)
    }
    if (php) refPk.splice(0, refPk.length, ...php.pk.cols)
    g.pairs.sort((x, y) => refPk.indexOf(x[1]) - refPk.indexOf(y[1]))
    fks.push({ cols: g.pairs.map((p) => p[0]), refTbl: g.refTbl, refCols: g.pairs.map((p) => p[1]) })
  }
  for (const c of cols) if (c.den?.fk) fks.push({ cols: [c.colNm], refTbl: c.den.fk, refCols: [c.colNm] })
  fks.forEach((f, i) => (f.nm = `FK_${tbl}_${String(i + 1).padStart(2, '0')}`))

  const idx = (cfg.idx || []).map((x, i) => ({ nm: `X_${tbl}_${String(i + 1).padStart(2, '0')}`, cols: x.cols, unq: !!x.unq, where: x.where || null, why: x.why }))
  // 중복 인덱스 점검 : PK 선두와 같거나 다른 인덱스의 앞부분이면 실패
  const all = [{ nm: 'PK', cols: pkCols, where: null }, ...idx]
  for (const a of idx) for (const b of all) {
    if (a === b || a.where !== b.where) continue
    if (a.cols.every((c, k) => b.cols[k] === c) && b.cols.length >= a.cols.length) throw new Error(`중복 인덱스 ${a.nm} ⊂ ${b.nm}`)
  }
  for (const x of idx) for (const c of x.cols) if (!cols.some((k) => k.colNm === c)) throw new Error(`인덱스 칼럼 없음 ${x.nm}.${c}`)

  tables.push({
    tblNm: tbl, entId: e.entId, entNm: e.entNm, moduleCd: e.moduleCd || null, def: e.def, estRows: cfg.rows,
    cols: cols.map((c, i) => ({ colNm: c.colNm, attrNm: c.attrNm, dataTp: c.dataTp, nullYn: c.nullYn, pk: pkCols.includes(c.colNm), seq: i + 1, termNm: c.termNm, dflt: c.dflt, ...(c.den ? { denorm: true } : {}) })),
    pk: { nm: `PK_${tbl}`, cols: pkCols },
    idx: idx.map((x) => ({ nm: x.nm, cols: x.cols, unq: x.unq, ...(x.where ? { where: x.where } : {}), why: x.why })),
    fks,
    partition: cfg.part ? {
      type: 'RANGE', key: cfg.part, unit: 'YEAR', from: `${PART_FROM}-01`, to: `${PART_TO}-12`,
      note: `연 단위 ${PART_TO - PART_FROM + 1}개(${PART_FROM}~${PART_TO}) + DEFAULT 1개, 파티션 키 = PK 끝 칼럼`,
    } : null,
    denorm: (cfg.den || []).map((d) => ({ col: termOf(d.term).phyNm, srcTbl: d.src, why: d.why })),
  })
}

// ---------- DDL ----------
const lc = (s) => s.toLowerCase()
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const SYS = [
  ['lst_mddtm', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', '최종수정일시'],
  ['lst_mdfr_id', "VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'", '최종수정자ID'],
  ['lst_rgdtm', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', '최종등록일시'],
  ['lst_rgtr_id', "VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'", '최종등록자ID'],
]
const hdr = (what) => `-- Pi통신 과금 데이터 표준화 — COL(미납) ${what}
-- 생성 : sitemap/schema.pi/pitel/tools/physical_COL_build.js (손으로 고치지 말고 생성기를 고칠 것)
-- 대상 : PostgreSQL 17, 실행 전 SET search_path 로 대상 스키마 지정. 재실행 안전(IF NOT EXISTS·존재 확인)
-- 참조무결성 FK 는 설계만(D6) — 이 파일에 FK 제약 없음
`
let t1 = hdr('테이블(PK·인덱스 없음, 적재 전 실행 — D14)') + '\n'
for (const t of tables) {
  const n = lc(t.tblNm)
  const lines = t.cols.map((c) => `  ${lc(c.colNm)} ${c.dataTp}${c.nullYn ? '' : ' NOT NULL'}`)
  for (const [k, ty] of SYS) lines.push(`  ${k} ${ty}`)
  t1 += `-- ${t.entId} ${t.entNm}${t.moduleCd ? ' [' + t.moduleCd + ']' : ''} · 목표 ${t.estRows.toLocaleString()}행\n`
  t1 += `CREATE TABLE IF NOT EXISTS ${n} (\n${lines.join(',\n')}\n)${t.partition ? ` PARTITION BY RANGE (${lc(t.partition.key)})` : ''};\n`
  if (t.partition) {
    const isYm = t.cols.find((c) => c.colNm === t.partition.key).dataTp.startsWith('CHAR')
    const lo = isYm ? "y || '01'" : "make_date(y, 1, 1)::text"
    const hi = isYm ? "(y + 1) || '01'" : "make_date(y + 1, 1, 1)::text"
    t1 += `DO $$\nBEGIN\n  FOR y IN ${PART_FROM}..${PART_TO} LOOP\n` +
      `    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF ${n} FOR VALUES FROM (%L) TO (%L)', '${n}_y' || y, ${lo}, ${hi});\n` +
      `  END LOOP;\nEND $$;\nCREATE TABLE IF NOT EXISTS ${n}_def PARTITION OF ${n} DEFAULT;\n`
  }
  t1 += `COMMENT ON TABLE ${n} IS ${q(t.entNm)};\n`
  for (const c of t.cols) t1 += `COMMENT ON COLUMN ${n}.${lc(c.colNm)} IS ${q(c.attrNm)};\n`
  for (const [k, , nm] of SYS) t1 += `COMMENT ON COLUMN ${n}.${k} IS ${q(nm)};\n`
  t1 += '\n'
}
let t2 = hdr('PK·인덱스(적재 뒤 실행 — D14)') + '\n'
for (const t of tables) {
  const n = lc(t.tblNm)
  const pk = lc(t.pk.nm)
  const pkc = t.pk.cols.map(lc).join(', ')
  t2 += `-- ${t.entId} ${t.entNm}\n`
  if (t.partition) {
    t2 += `DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${pk}' AND conrelid = '${n}'::regclass) THEN\n` +
      `    ALTER TABLE ${n} ADD CONSTRAINT ${pk} PRIMARY KEY (${pkc});\n  END IF;\nEND $$;\n`
  } else {
    t2 += `CREATE UNIQUE INDEX IF NOT EXISTS ${pk} ON ${n} (${pkc});\n` +
      `DO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${pk}' AND conrelid = '${n}'::regclass) THEN\n` +
      `    ALTER TABLE ${n} ADD CONSTRAINT ${pk} PRIMARY KEY USING INDEX ${pk};\n  END IF;\nEND $$;\n`
  }
  for (const x of t.idx) {
    t2 += `CREATE ${x.unq ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${lc(x.nm)} ON ${n} (${x.cols.map(lc).join(', ')})${x.where ? ' WHERE ' + x.where : ''};\n`
  }
  t2 += '\n'
}

// ---------- JSON ----------
const phys = {
  area: 'COL', areaNm: '미납', stg: 'PHY', trgtDbms: 'POSTGRESQL', ver: '2026-11-07', author: 'subagent_physical_modeler',
  tables: tables.map(({ entNm, ...t }) => t),
  decisions: [
    '파티션 기준 : COL 은 T3 영역 — 목표 3천만 행 이상인 누적형(내역·이력·월 스냅샷) 테이블만 연 RANGE 파티션(2010~2027 + DEFAULT). 현재값 ~기본(미납기본 2천만·미납상세 6천만)은 자식 FK 가 많고 날짜 조건 없는 키 조회가 주 경로라 파티션하지 않음',
    '파티션 키는 PK 끝에 둔다 — 업무 식별자(번호) 선두로 단건 조회는 그대로, PostgreSQL 파티션 PK 요건 충족',
    '독촉발송결과내역 = 부모 독촉내역 파티션 키(독촉발송일시)를 반정규화해 PK·파티션 키로 사용 → 부모·자식 같은 연 파티션끼리 조인',
    '04 관문 F1 반정규화 후보 9개 중 채택 2개(미납기본·미납상세 미납잔여금액) — 매일 배치·수납배분 핫 경로. 나머지 7개(연체가산금누적금액·누적회수금액·분할납부 집계 4종·대손회수누적금액)는 행 수 수백만 이하 또는 월 1회 조회라 원천 집계로 충분해 미채택',
    '미납기본에 청구계정번호·청구년월·고객번호 반정규화 — 실무 조회 경로(청구계정+청구년월, 고객번호)를 청구기본(T4) 조인 없이 처리',
    '저선택도 상태값(S3)은 전체 인덱스 대신 진행 중 상태만 부분 인덱스, NULL 이 대부분인 선택 FK(S5)는 IS NOT NULL 부분 인덱스',
    '작은 기준 테이블(코드·정책·추심사, 수천 행 이하)을 가리키는 FK 칼럼은 인덱스 없음 — 조인은 자식→부모 PK 방향만 쓰고 부모 삭제는 논리 처리(D6 RI 미구현)',
    'REF 기준 테이블 행 수는 업무 실제 규모(추심사 200·정책 2천·가산금 기준 20)로 T1 하한(1만) 미만 — data_migrationner 가 배율로 조정',
    '교차 FK 의 refCols 는 부모 물리 PK 전체(파티션 키 포함) — PAY 청구기본(청구년월)·청구상세(청구년월)·INV 수납기본(수납일자)의 파티션 키를 자식에 반정규화해 FK 를 완성(05 COL 물리 관문 R1, 미완성 시 생성기 실패). 부모 물리 모델이 아직 없는 영역(PRM)은 논리 PK 기준',
    '부모 물리 테이블명은 표준 접미어(_M 등) 기준 — ORD 물리가 엔터티 약어(_BAS)로 이름을 지은 불일치는 ORD 관문 소관(05 COL 물리 관문 R3)',
  ],
}
fs.mkdirSync(path.join(ROOT, 'model/physical'), { recursive: true })
fs.mkdirSync(path.join(ROOT, 'ddl'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'model/physical/COL.json'), JSON.stringify(phys, null, 2) + '\n')
fs.writeFileSync(path.join(ROOT, 'ddl/60_col_tables.sql'), t1)
fs.writeFileSync(path.join(ROOT, 'ddl/60_col_constraints.sql'), t2)

// ---------- 문서 ----------
const fmt = (n) => n.toLocaleString()
const total = tables.reduce((s, t) => s + t.estRows, 0)
let md = `# 05 물리 모델 — COL 미납

> 작성 2026-11-07 · subagent_physical_modeler · 생성기 \`tools/physical_COL_build.js\` → \`model/physical/COL.json\`, \`ddl/60_col_tables.sql\`, \`ddl/60_col_constraints.sql\`
> 대상 PostgreSQL 17 · 테이블 ${tables.length}개 · 목표 합계 약 ${fmt(total)}행 · FK 는 설계만(D6) · 시스템 칼럼 4개는 DDL 에만(D7)

## 1. 테이블

| ID | 테이블 | 논리명 | 유형 | 목표 행 수 | 파티션 | PK | 인덱스 | FK(설계) |
|---|---|---|---|---:|---|---|---:|---:|
`
for (const t of tables) {
  const e = col.entities.find((x) => x.tblNm === t.tblNm)
  md += `| ${t.entId} | \`${t.tblNm}\` | ${t.entNm}${t.moduleCd ? ' [STL]' : ''} | ${e.tp} | ${fmt(t.estRows)} | ${t.partition ? '연 RANGE `' + t.partition.key + '`' : '—'} | ${t.pk.cols.join(', ')} | ${t.idx.length} | ${t.fks.length} |\n`
}
md += `
## 2. 파티션

COL 은 T3(고객·가입계) 영역이라 월 파티션(T4) 대상이 없다. **목표 3천만 행 이상인 누적형 테이블만 연 RANGE**(${PART_FROM}~${PART_TO} 연 ${PART_TO - PART_FROM + 1}개 + DEFAULT 1개, 이름 \`<테이블>_yYYYY\`·\`<테이블>_def\`). 파티션 키는 PK 끝에 붙인다.

| 테이블 | 파티션 키 | PK | 근거 |
|---|---|---|---|
`
for (const t of tables.filter((x) => x.partition)) {
  md += `| \`${t.tblNm}\` | ${t.partition.key} | ${t.pk.cols.join(', ')} | ${fmt(t.estRows)}행 누적, 최근 연도 쏠림(S6) — 오래된 연도 분리·보관 정리, 기간 조회 프루닝 |\n`
}
md += `
파티션하지 않은 큰 테이블 : \`PTL_COL_UNPD_M\`(2천만)·\`PTL_COL_UNPD_D\`(6천만) — 현재값 테이블이고 여러 자식 테이블이 미납번호만으로 참조하므로 PK 에 날짜를 붙이면 모든 자식이 반정규화를 떠안는다. 조회는 미납번호·청구번호 키 조회가 주 경로라 파티션 이득 없음. \`PTL_COL_RCVB_PRSCR_H\`(2,600만)는 3천만 기준 미만.

## 3. 반정규화

| 테이블 | 칼럼 | 원천 | 사유 |
|---|---|---|---|
`
for (const t of tables) for (const d of t.denorm) md += `| \`${t.tblNm}\` | ${d.col} | ${d.srcTbl} | ${d.why} |\n`
md += `
미채택(04 관문 F1 후보) : 연체가산금누적금액·누적회수금액·최종납부예정일자·납부완료회차수·누적납부금액·불이행회차수·대손회수누적금액 — 원천이 수백만 행 이하이거나 월 1회 조회라 동기화 비용이 더 크다.

## 4. 인덱스

PK 인덱스 \`PK_<테이블>\` 외 보조 인덱스. 부분 인덱스는 WHERE 표시. 중복(PK·다른 인덱스의 앞부분과 같은 칼럼 목록)은 생성기가 막는다.

| 인덱스 | 칼럼 | 유일 | 조건 | 근거 |
|---|---|---|---|---|
`
for (const t of tables) for (const x of t.idx) md += `| \`${x.nm}\` | ${x.cols.join(', ')} | ${x.unq ? 'Y' : ''} | ${x.where ? '`' + x.where + '`' : ''} | ${x.why} |\n`
md += `
인덱스 없는 테이블 : 기준(연체가산금기준코드·독촉정책·채권추심사·미납회수월통계 — 수만 행 이하, PK 로 충분), 이력·상세 중 PK 선두가 부모 키인 것(미납상태이력·이용정지이력·직권해지예고내역·독촉발송결과내역 — 부모→자식 조인을 PK 가 처리).

## 5. FK 정의(설계만 — DDL 미생성, D6)

| FK | 자식 칼럼 | 부모 테이블 | 부모 칼럼 |
|---|---|---|---|
`
for (const t of tables) for (const f of t.fks) md += `| \`${f.nm}\` | ${f.cols.join(', ')} | \`${f.refTbl}\` | ${f.refCols.join(', ')} |\n`
md += `
## 6. 결정 메모

${phys.decisions.map((d) => '- ' + d).join('\n')}

## 7. 검증

\`pitel_dev\` 에 스키마 \`chk_col\` 을 만들어 두 DDL 을 순서대로 2회(재실행 안전 확인) 실행, 오류 0 확인 후 \`DROP SCHEMA chk_col CASCADE\`.
`
fs.writeFileSync(path.join(ROOT, 'docs/05_physical_COL.md'), md)
console.log('tables', tables.length, 'rows', total, 'part', tables.filter((x) => x.partition).map((x) => x.tblNm).join(','))
