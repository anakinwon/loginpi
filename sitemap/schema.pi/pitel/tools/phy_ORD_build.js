// 가입(ORD) 물리 모델 생성기 — model/logical/ORD.json(+전 영역 논리 = 교차 FK 해석)을 읽어
// model/physical/ORD.json · ddl/30_ord_tables.sql · ddl/30_ord_constraints.sql · docs/05_physical_ORD.md 를 만든다.
// 실행 : node tools/phy_ORD_build.js   (sitemap/schema.pi/pitel 에서)
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const AREA = 'ORD'
const YEAR_FROM = 2010
const YEAR_TO = 2027

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const lgc = rd('model/logical/ORD.json')
const domains = Object.fromEntries(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const terms = rd('model/std/terms.json')
const termByNm = Object.fromEntries(terms.map((t) => [t.termNm, t]))

// 전 영역 엔터티 사전(엔터티명 → 영역·물리명·속성) — 교차 FK 부모 테이블 해석
const entMap = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  const j = rd('model/logical/' + f)
  for (const e of j.entities) entMap[e.entNm] = { area: j.area, e }
}

// 도메인 → PostgreSQL 17 타입
const pgType = (domNm) => {
  const d = domains[domNm]
  if (!d) throw new Error('도메인 없음 : ' + domNm)
  if (d.lgcTp === 'TIMESTAMP' || d.lgcTp === 'DATE' || d.lgcTp === 'TEXT') return d.lgcTp
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return `${d.lgcTp}(${d.len})`
}

// ── 물리 설계 결정(테이블별) ─────────────────────────────────────────
// est = 목표 행 수(T3 가입계 1천만~9천만 기준, 2010-01 ~ 2026-10 누적·해지 포함)
// part = 연 단위 RANGE 파티션 키(T3 대용량 이력, PK 에 포함)
// den = 반정규화 칼럼 [용어명, 원천, 사유, 위치(after 칼럼 | null = 끝), nullYn, dflt]
// idx = [칼럼 목록, 사유, where(부분 인덱스, 선택)]
const CFG = {
  SBSC_APLY_BAS: {
    est: 13_000_000,
    idx: [
      [['CUST_NO'], '고객별 신청 이력 조회(상담·명의도용 점검) — 고객 조인 FK'],
      [['SHOP_NO', 'SBSC_APLY_DTM'], '판매점별 기간 유치 실적·유치 수수료(STL) 산정 경로'],
      [['SBSC_APLY_DTM'], '일자별 신청 현황·미처리 신청 추출 배치'],
    ],
  },
  SBSC_CTRT_BAS: {
    est: 13_000_000,
    den: [['서비스번호', '회선기본.서비스번호', '번호로 계약 찾기(상담·청구 검색 1순위 경로) — 회선 조인 1단계 제거. 번호 변경 시 회선변경 처리와 같은 트랜잭션에서 갱신', 'AGNC_NO', false, null]],
    idx: [
      [['CUST_NO'], '고객별 보유 계약 조회(S1 멱법칙 — 법인 1곳 100만 회선) — 고객 조인 FK'],
      [['BILL_ACNT_NO'], '청구계정별 계약 목록(요금계산·청구서 작성 배치) — 청구계정 조인 FK'],
      [['SVC_MGMT_NO'], '회선 → 계약 역조회(PAY 사용내역·COL 이용정지 조인) — 회선 조인 FK'],
      [['SVC_NO'], '서비스번호로 계약 검색(반정규화 칼럼)'],
      [['AGNC_NO', 'SBSC_CTRT_DTM'], '대리점별 유지 회선·관리수수료(STL) 산정 경로', 'agnc_no IS NOT NULL'],
      [['SBSC_APLY_NO'], '신청 → 계약 추적(개통 완료 확인)', 'sbsc_aply_no IS NOT NULL'],
    ],
  },
  LINE_BAS: {
    est: 12_000_000,
    idx: [
      [['SVC_NO'], '서비스번호 → 회선 조회(번호 재사용 S8 — 한 번호에 시기별 여러 회선) — 서비스번호 조인 FK'],
      [['IMSI_NO'], '망 이벤트·원시사용내역(CDR) IMSI → 회선 매칭'],
      [['IMEI_NO'], '분실·도난 단말 조회, 단말 기준 회선 찾기', 'imei_no IS NOT NULL'],
    ],
  },
  SVC_NO_BAS: {
    est: 10_000_000,
    den: [['서비스번호할당횟수', '서비스번호이력 COUNT(할당 사유)', '재사용 번호 골라내기(S8)·번호 풀 등급 산정 — 이력 집계 회피. 번호 할당 처리에서 +1', null, false, '0']],
    idx: [
      [['SVC_NO_STTS_TY_CD', 'RE_USE_PSBL_DT'], '신규 개통 번호 풀 — 회수 후 재사용 가능일 도래 번호 추출(상태 저선택도 S3 보완용 복합)'],
    ],
  },
  SBSC_PROD_BAS: {
    est: 30_000_000,
    den: [['서비스관리번호', '가입계약기본.서비스관리번호', '요금계산(PAY)·레이크 파티셔닝이 회선 단위 — 가입계약 조인 1단계 제거(개념 결정 O4). 계약의 회선은 불변(명의변경은 새 계약)', 'SHOP_NO', false, null]],
    idx: [
      [['SBSC_CTRT_NO'], '계약별 가입 상품 목록(상담·해지 정산) — 가입계약 조인 FK'],
      [['SVC_MGMT_NO', 'VLD_BGNG_DTM'], '회선 단위 요금계산 — 청구월 유효 상품 범위 조회(반정규화 칼럼)'],
      [['PROD_CD', 'SBSC_PROD_STTS_TY_CD'], '상품별 가입자 수·상품 폐지 영향 분석(S2 인기 상품 쏠림 — 통계 오판 점검 대상)'],
    ],
  },
  AGRMT_CTRT_BAS: {
    est: 8_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약별 약정 조회(해지 위약금 산정) — 가입계약 조인 FK'],
      [['AGRMT_END_DT'], '약정 만료 도래 대상 추출(재약정 안내·선택약정 종료 배치)'],
    ],
  },
  EQP_INSTL_CTRT_BAS: {
    est: 2_000_000,
    den: [['할부잔여원금', '단말할부상세 마지막 청구 회차의 할부잔여원금', '잔액 조회·해지 시 잔여 할부금 일시 청구·명의변경 승계 — 회차 상세 스캔 회피. 회차 청구 확정 때 갱신', null, false, null]],
    idx: [
      [['SBSC_CTRT_NO'], '계약별 할부 조회(해지·명의변경 정산) — 가입계약 조인 FK'],
    ],
  },
  MNP_APLY_BAS: {
    est: 3_000_000,
    idx: [
      [['SVC_NO', 'MNP_APLY_DTM'], '번호별 번호이동 이력(전출입 반복 고객 점검) — 서비스번호 조인 FK'],
      [['CARR_NO', 'MNP_APLY_DTM'], '상대 사업자별 기간 전출입 집계·상호 정산 — 통신사업자 조인 FK'],
      [['MNP_ACPT_NO'], '번호이동 관리기관(KTOA) 접수번호 대사'],
      [['SBSC_CTRT_NO'], '계약 → 번호이동 추적', 'sbsc_ctrt_no IS NOT NULL'],
      [['SBSC_APLY_NO'], '가입신청 → 번호이동 동반 신청 조회(번호이동 개통 처리 매 건) — 가입신청 조인 FK(05 ORD 물리 관문 추가)', 'sbsc_aply_no IS NOT NULL'],
    ],
  },
  CMBN_CTRT_BAS: {
    est: 2_000_000,
    den: [
      ['결합유형코드', 'PRD 결합상품기본.결합유형코드', '결합 유형별 집계·할인 산정 — PRD 조인 회피(결합상품의 유형은 불변)', null, false, null],
      ['결합회선수', '결합구성회선관계 COUNT(유효)', '결합 할인 단계 산정(회선 수 구간) — 구성 관계 집계 회피. 구성 변경 처리에서 갱신', null, false, '0'],
    ],
    idx: [
      [['RPRS_CUST_NO'], '대표 고객별 결합 조회 — 고객 조인 FK'],
      [['RPRS_SBSC_CTRT_NO'], '대표 회선 계약 → 결합 조회 — 가입계약 조인 FK'],
    ],
  },
  LINE_STTS_HIST: {
    est: 28_000_000,
    part: 'LINE_STTS_CHG_DTM',
    idx: [
      [['SBSC_CTRT_NO'], '계약별 상태 이력(해지·정지 기간 산정) — 가입계약 조인 FK', 'sbsc_ctrt_no IS NOT NULL'],
      [['SUSP_NO'], 'COL 미납 이용정지 → 회선 상태 결과 추적(S5 NULL 쏠림 — 부분 인덱스)', 'susp_no IS NOT NULL'],
      [['EXOFTRMN_NO'], 'COL 직권해지 → 회선 상태 결과 추적(부분 인덱스)', 'exoftrmn_no IS NOT NULL'],
    ],
  },
  SBSC_APLY_DTL: {
    est: 20_000_000,
    idx: [[['SBSC_PROD_NO'], '가입상품 → 신청 항목 역추적', 'sbsc_prod_no IS NOT NULL']],
  },
  SBSC_DOC_DTLS: {
    est: 15_000_000,
    idx: [[['DSTR_SCHD_DT'], '개인정보 서류 파기 기한 도래 추출 배치(개인정보보호법)']],
  },
  OPNG_PRCS_DTLS: {
    est: 13_000_000,
    idx: [
      [['SBSC_APLY_NO'], '신청별 개통 처리 결과 — 가입신청 조인 FK'],
      [['SBSC_CTRT_NO'], '계약별 개통 처리 조회', 'sbsc_ctrt_no IS NOT NULL'],
      [['OPNG_PRCS_DTM'], '일자별 개통 현황·망 연동 실패 재처리 배치'],
    ],
  },
  SBSC_CTRT_HIST: {
    est: 18_000_000,
    part: 'SBSC_CTRT_CHG_DTM',
    idx: [[['BILL_ACNT_NO'], '청구계정 변경 추적(청구계정별 과거 계약 귀속) — 청구계정 조인 FK']],
  },
  LINE_CHG_HIST: {
    est: 16_000_000,
    part: 'LINE_CHG_DTM',
    idx: [
      [['SVC_NO'], '번호별 과거 회선 추적(번호변경·재사용 S8) — 서비스번호 조인 FK'],
      [['IMSI_NO'], '과거 IMSI → 회선 매칭(지연 도착 CDR 재처리)'],
    ],
  },
  SBSC_PROD_HIST: {
    est: 32_000_000,
    part: 'SBSC_PROD_CHG_DTM',
    idx: [
      [['RTPLN_CHG_APLY_NO'], '요금제 변경 신청 → 반영 이력 추적(부분 인덱스)', 'rtpln_chg_aply_no IS NOT NULL'],
      [['ADSVC_APLY_NO'], '부가서비스 신청 → 반영 이력 추적(부분 인덱스)', 'adsvc_aply_no IS NOT NULL'],
    ],
  },
  RTPLN_CHG_APLY_DTLS: {
    est: 6_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약별 요금제 변경 신청 조회 — 가입계약 조인 FK'],
      [['APLCN_SCHD_DT', 'RTPLN_CHG_APLY_STTS_TY_CD'], '익월 1일 적용 예정 일괄 반영 배치(S4 1일 급증)'],
    ],
  },
  ADSVC_APLY_DTLS: {
    est: 12_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약별 부가서비스 신청 조회 — 가입계약 조인 FK'],
      [['SBSC_PROD_NO'], '가입상품 → 신청 추적', 'sbsc_prod_no IS NOT NULL'],
      [['APLCN_SCHD_DT'], '적용 예정 일괄 반영 배치'],
    ],
  },
  AGRMT_CTRT_HIST: { est: 9_000_000, idx: [] },
  SUBSD_APLCN_DTLS: {
    est: 8_000_000,
    idx: [[['SHOP_NO', 'SUBSD_APLCN_DTM'], '판매점별 지원금 정산(STL 근거)·추가지원금 한도 점검', 'shop_no IS NOT NULL']],
  },
  EQP_INSTL_DTL: {
    est: 45_000_000,
    idx: [[['INSTL_BILL_YM'], '월 청구 배치 — 해당 청구년월 할부 회차 추출(PAY 단말할부청구상세 생성)']],
  },
  LINE_EQP_REL: {
    est: 15_000_000,
    idx: [
      [['IMEI_NO'], 'IMEI → 사용 회선 기간 조회(분실·도난·자급제 점검)'],
      [['EQP_INSTL_CTRT_NO'], '할부 계약 → 단말 장착 회선', 'eqp_instl_ctrt_no IS NOT NULL'],
      [['EQP_CHG_NO'], '단말변경 처리 → 결과 관계', 'eqp_chg_no IS NOT NULL'],
    ],
  },
  EQP_CHG_DTLS: {
    est: 5_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약별 기기변경 이력 — 가입계약 조인 FK'],
      [['SHOP_NO', 'EQP_CHG_DTM'], '판매점별 기기변경 실적·수수료(STL)'],
    ],
  },
  USIM_CHG_DTLS: {
    est: 4_000_000,
    idx: [
      [['SVC_MGMT_NO'], '회선별 유심 교체 이력(유심 복제 의심 점검) — 회선 조인 FK'],
      [['USIM_SN'], '유심 일련번호 → 교체 처리 조회'],
    ],
  },
  MNP_HIST: { est: 10_000_000, idx: [] },
  NMNE_CHG_DTLS: {
    est: 1_000_000,
    idx: [
      [['SVC_MGMT_NO'], '회선별 명의변경 이력 — 회선 조인 FK'],
      [['BFR_CUST_NO'], '양도 고객 기준 조회(미납 승계 점검)'],
      [['CUST_NO'], '양수 고객 기준 조회'],
    ],
  },
  PAUS_DTLS: {
    est: 1_500_000,
    idx: [
      [['SVC_MGMT_NO'], '회선별 일시정지 이력(연간 횟수·기간 한도 점검) — 회선 조인 FK'],
      [['SBSC_CTRT_NO'], '계약별 일시정지 조회'],
      [['PAUS_END_SCHD_DT'], '종료 예정일 도래 자동 해제 배치 — 미해제 건만(부분)', 'paus_rls_dtm IS NULL'],
    ],
  },
  TRMN_APLY_DTLS: {
    est: 7_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약별 해지 신청 조회(PRM 수수료 환수 근거) — 가입계약 조인 FK'],
      [['MNP_APLY_NO'], '번호이동 전출 해지 연결', 'mnp_aply_no IS NOT NULL'],
      [['TRMN_SCHD_DT'], '해지 예정일 도래 일괄 해지 배치'],
    ],
  },
  CMBN_CMPS_LINE_REL: {
    est: 5_000_000,
    idx: [[['SBSC_CTRT_NO'], '회선 계약 → 소속 결합 역조회(결합 할인 대상 판정) — 가입계약 조인 FK']],
  },
  SVC_NO_HIST: {
    est: 23_000_000,
    idx: [[['SVC_MGMT_NO'], '회선 → 사용 번호 이력', 'svc_mgmt_no IS NOT NULL']],
  },
}

// ── 생성 ─────────────────────────────────────────────────────────────
const lc = (s) => s.toLowerCase()
const tables = []
const issues = []

for (const e of lgc.entities) {
  const cfg = CFG[e.phyNm]
  if (!cfg) throw new Error('설정 없음 : ' + e.phyNm)
  const tblNm = e.tblNm // 테이블명 = 논리 tblNm(PTL_<영역>_<약어>_<사전 tblSfx>, 05 ORD 물리 관문 교정 — 구 PFX+phyNm 은 접미어 규칙 위반)
  let cols = e.attrs.map((a) => ({
    colNm: a.phyNm,
    dataTp: pgType(a.domNm),
    nullYn: a.nullYn,
    pk: a.pk,
    seq: 0,
    termNm: a.attrNm,
    dflt: null,
    _fk: a.fk,
  }))
  // 반정규화 칼럼
  const denorm = []
  for (const [termNm, src, why, after, nullYn, dflt] of cfg.den || []) {
    const t = termByNm[termNm]
    if (!t) throw new Error('용어 없음 : ' + termNm)
    const c = { colNm: t.phyNm, dataTp: pgType(t.domNm), nullYn, pk: false, seq: 0, termNm, dflt, _fk: null }
    const i = after ? cols.findIndex((x) => x.colNm === after) + 1 : cols.length
    if (after && i === 0) throw new Error('after 없음 : ' + after)
    cols.splice(i, 0, c)
    denorm.push({ col: t.phyNm, srcTbl: src, why })
  }
  // 파티션 키 → PK 에 포함, PK 칼럼 바로 뒤로 이동(규칙 2-9 PK → FK → 일반)
  let partition = null
  if (cfg.part) {
    const i = cols.findIndex((x) => x.colNm === cfg.part)
    const [c] = cols.splice(i, 1)
    c.pk = true
    c.nullYn = false
    const lastPk = cols.map((x) => x.pk).lastIndexOf(true)
    cols.splice(lastPk + 1, 0, c)
    partition = {
      type: 'RANGE',
      key: cfg.part,
      unit: 'YEAR',
      from: `${YEAR_FROM}-01`,
      to: `${YEAR_TO}-12`,
      note: `T3 대용량 이력(1천5백만 행 이상) — 연 단위 ${YEAR_FROM}~${YEAR_TO} ${YEAR_TO - YEAR_FROM + 1}개 + DEFAULT 1개. 파티션 키를 PK 끝에 포함(PostgreSQL 파티션 유일성 제약) — 논리 식별자(부모 + 순번)의 전역 유일은 적재기·채번이 보장`,
    }
  }
  cols.forEach((c, i) => (c.seq = i + 1))
  const pkCols = cols.filter((c) => c.pk).map((c) => c.colNm)
  // FK 정의(DDL 미생성 — D6)
  const fks = []
  for (const c of cols) {
    if (!c._fk) continue
    const p = entMap[c._fk.ent]
    if (!p) throw new Error('부모 엔터티 없음 : ' + c._fk.ent)
    const pa = p.e.attrs.find((a) => a.attrNm === c._fk.attr)
    if (!pa) throw new Error('부모 속성 없음 : ' + c._fk.ent + '.' + c._fk.attr)
    fks.push({
      nm: `FK_${tblNm}_${String(fks.length + 1).padStart(2, '0')}`,
      cols: [c.colNm],
      refTbl: p.e.tblNm,
      refCols: [pa.phyNm],
    })
  }
  // 인덱스
  const idx = (cfg.idx || []).map(([ic, why, where], i) => {
    for (const x of ic) if (!cols.some((c) => c.colNm === x)) throw new Error(`인덱스 칼럼 없음 ${tblNm}.${x}`)
    const o = { nm: `X_${tblNm}_${String(i + 1).padStart(2, '0')}`, cols: ic, unq: false, why }
    if (where) o.where = where
    return o
  })
  // 중복 인덱스 점검 : 다른 인덱스·PK 의 앞부분과 같으면 중복(부분 인덱스는 조건이 같을 때만)
  const all = [{ nm: 'PK', cols: pkCols }, ...idx]
  for (const a of idx)
    for (const b of all)
      if (a !== b && a.cols.length <= b.cols.length && a.cols.every((x, k) => b.cols[k] === x) && (a.where || null) === (b.where || null))
        issues.push(`중복 인덱스 ${a.nm} ⊂ ${b.nm}`)
  for (const n of [tblNm, ...idx.map((x) => x.nm), 'PK_' + tblNm]) if (n.length > 63) issues.push('63자 초과 ' + n)

  tables.push({
    tblNm,
    entId: e.entId,
    entNm: e.entNm,
    tp: e.tp,
    stg: e.stg,
    def: e.def,
    estRows: cfg.est,
    cols: cols.map(({ _fk, ...c }) => c),
    pk: { nm: 'PK_' + tblNm, cols: pkCols },
    idx,
    fks,
    partition,
    denorm,
  })
}
if (issues.length) throw new Error(issues.join('\n'))

const out = {
  area: AREA,
  areaNm: '가입',
  stg: 'PHY',
  ver: '2026-11-07',
  author: 'subagent_physical_modeler',
  trgtDbms: 'POSTGRESQL 17',
  moduleCd: {},
  rules: {
    naming: 'PK_<테이블> / X_<테이블>_NN / FK_<테이블>_NN(정의만, DDL 미생성 D6) — DDL 은 소문자',
    sysCols: 'DDL 에만 맨 끝 LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID(D7)',
    partition: `T3 대용량 이력(1천5백만 행 이상 ~이력) = RANGE 연 단위 ${YEAR_FROM}~${YEAR_TO} + DEFAULT`,
  },
  summary: {
    tblCnt: tables.length,
    partTblCnt: tables.filter((t) => t.partition).length,
    idxCnt: tables.reduce((s, t) => s + t.idx.length, 0),
    fkCnt: tables.reduce((s, t) => s + t.fks.length, 0),
    estRowsTotal: tables.reduce((s, t) => s + t.estRows, 0),
  },
  tables,
}
fs.mkdirSync(path.join(ROOT, 'model/physical'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'model/physical/ORD.json'), JSON.stringify(out, null, 2) + '\n')

// ── DDL ──────────────────────────────────────────────────────────────
const sysCols = [
  ['lst_mddtm', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종수정일시'],
  ['lst_mdfr_id', 'VARCHAR(50)', "'SYSTEM'", '최종수정자ID'],
  ['lst_rgdtm', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종등록일시'],
  ['lst_rgtr_id', 'VARCHAR(50)', "'SYSTEM'", '최종등록자ID'],
]
// 시스템 칼럼 논리명은 표준용어 사전 우선
for (const s of sysCols) {
  const t = terms.find((x) => x.phyNm === s[0].toUpperCase())
  if (t) s[3] = t.termNm
}
const q = (s) => "'" + s.replace(/'/g, "''") + "'"
const T = []
T.push('-- 가입(ORD) 테이블 DDL — PostgreSQL 17, PK·인덱스 없음(적재 뒤 30_ord_constraints.sql), FK 미생성(D6)')
T.push('-- 생성 : node tools/phy_ORD_build.js (손으로 고치지 말 것) · 실행 : psql -v ON_ERROR_STOP=1 -f 30_ord_tables.sql (재실행 안전)')
T.push(`-- 파티션 : ${tables.filter((t) => t.partition).map((t) => lc(t.tblNm)).join(', ')} (연 단위 ${YEAR_FROM}~${YEAR_TO} + DEFAULT)`)
T.push('')
for (const t of tables) {
  const n = lc(t.tblNm)
  T.push(`-- ${t.entId} ${t.entNm} (목표 ${t.estRows.toLocaleString('en-US')}행)`)
  T.push(`CREATE TABLE IF NOT EXISTS ${n} (`)
  const lines = t.cols.map(
    (c) => `  ${lc(c.colNm)} ${c.dataTp}${c.dflt != null ? ' DEFAULT ' + c.dflt : ''}${c.nullYn ? '' : ' NOT NULL'}`,
  )
  for (const s of sysCols) lines.push(`  ${s[0]} ${s[1]} DEFAULT ${s[2]} NOT NULL`)
  T.push(lines.join(',\n'))
  T.push(t.partition ? `) PARTITION BY RANGE (${lc(t.partition.key)});` : ');')
  if (t.partition) {
    T.push('DO $$')
    T.push('DECLARE y INT;')
    T.push('BEGIN')
    T.push(`  FOR y IN ${YEAR_FROM}..${YEAR_TO} LOOP`)
    T.push(
      `    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', '${n}_p' || y, '${n}', y || '-01-01', (y + 1) || '-01-01');`,
    )
    T.push('  END LOOP;')
    T.push('END $$;')
    T.push(`CREATE TABLE IF NOT EXISTS ${n}_pdflt PARTITION OF ${n} DEFAULT;`)
  }
  T.push(`COMMENT ON TABLE ${n} IS ${q(t.entNm)};`)
  for (const c of t.cols) T.push(`COMMENT ON COLUMN ${n}.${lc(c.colNm)} IS ${q(c.termNm)};`)
  for (const s of sysCols) T.push(`COMMENT ON COLUMN ${n}.${s[0]} IS ${q(s[3])};`)
  T.push('')
}
fs.mkdirSync(path.join(ROOT, 'ddl'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'ddl/30_ord_tables.sql'), T.join('\n'))

const C = []
C.push('-- 가입(ORD) PK·인덱스 DDL — 적재 뒤 실행(D14), 재실행 안전. FK 제약은 만들지 않는다(D6, 정의는 model/physical/ORD.json)')
C.push('-- 생성 : node tools/phy_ORD_build.js · 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX, 파티션 테이블 = PRIMARY KEY (…) 직접')
C.push('')
for (const t of tables) {
  const n = lc(t.tblNm)
  const pk = lc(t.pk.nm)
  const pkc = t.pk.cols.map(lc).join(', ')
  C.push(`-- ${t.entNm}`)
  if (t.partition) {
    C.push(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${pk}' AND conrelid = '${n}'::regclass) THEN ALTER TABLE ${n} ADD CONSTRAINT ${pk} PRIMARY KEY (${pkc}); END IF; END $$;`,
    )
  } else {
    C.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${pk} ON ${n} (${pkc});`)
    C.push(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${pk}' AND conrelid = '${n}'::regclass) THEN ALTER TABLE ${n} ADD CONSTRAINT ${pk} PRIMARY KEY USING INDEX ${pk}; END IF; END $$;`,
    )
  }
  for (const x of t.idx)
    C.push(`CREATE INDEX IF NOT EXISTS ${lc(x.nm)} ON ${n} (${x.cols.map(lc).join(', ')})${x.where ? ' WHERE ' + x.where : ''};`)
  C.push('')
}
fs.writeFileSync(path.join(ROOT, 'ddl/30_ord_constraints.sql'), C.join('\n'))

// ── 문서 ─────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString('en-US')
const D = []
D.push('# 05 물리 모델 — 가입(ORD)')
D.push('')
D.push('> 작성 2026-11-07 · subagent_physical_modeler · 마스터 위임 자동 승인 모드. 정본 = `model/physical/ORD.json`, 생성기 = `tools/phy_ORD_build.js`(JSON·DDL·이 문서를 한 번에 생성 — 손으로 고치지 말고 생성기 설정을 고친다).')
D.push('')
D.push('## 1. 요약')
D.push('')
D.push(`| 항목 | 값 |`)
D.push('|---|---|')
D.push(`| 테이블 | ${out.summary.tblCnt}개 (엔터티 1:1, 핵심 10 · 기본 20) |`)
D.push(`| 파티션 테이블 | ${out.summary.partTblCnt}개 — 연 단위 RANGE ${YEAR_FROM}~${YEAR_TO} 18개 + DEFAULT 1개씩 |`)
D.push(`| 인덱스(PK 제외) | ${out.summary.idxCnt}개 |`)
D.push(`| FK 정의 | ${out.summary.fkCnt}개 (DDL 미생성 — D6) |`)
D.push(`| 목표 행 수 합계 | ${fmt(out.summary.estRowsTotal)}행 |`)
D.push(`| DDL | \`ddl/30_ord_tables.sql\`(테이블·파티션·주석) · \`ddl/30_ord_constraints.sql\`(PK·인덱스, 적재 뒤) |`)
D.push('')
D.push('## 2. 테이블')
D.push('')
D.push('| # | 테이블 | 엔터티 | 유형 | 칼럼 | PK | 인덱스 | 파티션 | 목표 행 수 |')
D.push('|---|---|---|---|---|---|---|---|---|')
tables.forEach((t, i) =>
  D.push(
    `| ${i + 1} | ${t.tblNm} | ${t.entNm} | ${t.tp}·${t.stg} | ${t.cols.length} | ${t.pk.cols.join(', ')} | ${t.idx.length} | ${t.partition ? '연 RANGE(' + t.partition.key + ')' : '-'} | ${fmt(t.estRows)} |`,
  ),
)
D.push('')
D.push('칼럼 수는 시스템 칼럼 4개(DDL 에만, D7) 제외.')
D.push('')
D.push('## 3. 파티셔닝')
D.push('')
D.push('- 기준 : ORD 는 T3(고객·가입계) 영역이라 T4 월 파티션 대상 없음. **T3 대용량 이력**(1천5백만 행 이상인 `~이력`, 시간이 갈수록 누적만 되고 최근 구간 조회·과거 구간 보관 분리가 필요한 테이블)만 **연 단위 RANGE** 로 나눈다.')
D.push('- 파티션 키 = 이력 행의 변경 일시(행이 생기는 시각, NULL 없음). PostgreSQL 은 파티션 테이블의 PK·유일 제약에 파티션 키를 반드시 포함해야 하므로 **PK 끝에 키를 추가**했다 — 논리 식별자(부모 키 + 순번)의 전역 유일은 순번 채번(부모별 max+1)이 보장한다.')
D.push('- 다른 영역이 FK 로 참조하는 테이블(가입계약·회선·가입상품·약정·단말할부상세·결합·해지신청)은 파티션하지 않는다 — 참조되는 논리 키 = PK 를 그대로 유지(교차 crossKeys 계약 보존).')
D.push('- 단말할부상세(4천5백만)는 행 수가 크지만 PAY 단말할부청구상세가 (단말할부계약번호, 할부회차) 로 참조하므로 PK 변경 없이 일반 테이블 + 청구년월 인덱스로 둔다.')
D.push('')
D.push('| 테이블 | 파티션 키 | 범위 | 하위 테이블 | PK |')
D.push('|---|---|---|---|---|')
for (const t of tables.filter((x) => x.partition))
  D.push(`| ${t.tblNm} | ${t.partition.key} | ${YEAR_FROM}-01-01 ~ ${YEAR_TO + 1}-01-01 | \`${lc(t.tblNm)}_p${YEAR_FROM}\`~\`_p${YEAR_TO}\` + \`_pdflt\` | ${t.pk.cols.join(', ')} |`)
D.push('')
D.push('## 4. 인덱스')
D.push('')
D.push('원칙 : ① 다른 테이블과 조인하는 FK 칼럼 중 **자식 → 부모 역조회가 실제로 일어나는 것**(고객·청구계정·회선·계약 단위 조회) ② 실무 조회 경로(서비스번호·IMSI·IMEI·판매점+기간·적용예정일 배치) ③ PK 앞부분과 겹치는 인덱스 금지(생성기가 중복 점검) ④ NULL 이 대부분인 선택 FK(S5)는 `WHERE … IS NOT NULL` 부분 인덱스 ⑤ 저선택도 상태 칼럼 단독 인덱스 금지(S3) — 날짜·상품과 복합으로만. 상품코드·단말모델코드 같은 기준 FK 는 역조회가 집계성이라 가입상품 1건 외 인덱스 생략.')
D.push('')
D.push('| 인덱스 | 칼럼 | 조건 | 사유 |')
D.push('|---|---|---|---|')
for (const t of tables) for (const x of t.idx) D.push(`| ${x.nm} | ${x.cols.join(', ')} | ${x.where || ''} | ${x.why} |`)
D.push('')
D.push('## 5. 반정규화')
D.push('')
D.push('논리 단계 denormCandidates(L1·L2·L12)를 물리에서 판정. 6건 모두 채택 — 대용량 조회 경로(요금계산·상담 검색·번호 풀·결합 할인·할부 잔액)에서 조인·집계 1단계를 없앤다. 갱신 책임 = 원천을 바꾸는 업무 처리와 같은 트랜잭션.')
D.push('')
D.push('| 테이블 | 칼럼 | 원천 | 사유 |')
D.push('|---|---|---|---|')
for (const t of tables) for (const d of t.denorm) D.push(`| ${t.tblNm} | ${d.col} | ${d.srcTbl} | ${d.why} |`)
D.push('')
D.push('## 6. 예상 행 수 근거')
D.push('')
D.push('- 기간 2010-01 ~ 2026-10 누적(해지 포함, D8). 회선 1천2백만(활성 약 1/2 + 해지 누적), 계약 = 회선 + 명의변경 재계약, 가입상품 = 계약당 요금제 1 + 부가·할인 평균 1.3. ORD 합계 약 3.9억 행은 D9 전체 10~12억 중 가입계 몫 — 디스크 한도에 걸리면 생성기 배율(scale)로 줄인다.')
D.push('- 이력은 변경 빈도 기준 : 회선상태 2.3건/회선, 가입상품 1.07건/가입상품, 가입계약 1.4건/계약, 서비스번호 2.3건/번호(재사용 S8).')
D.push('- 단말할부상세 = 할부 계약 200만 × 평균 22.5 회차 ≈ 4천5백만 — 최종 배분은 data_migrationner(docs/06)가 확정.')
D.push('')
D.push('## 7. 결정 메모')
D.push('')
D.push('| # | 결정 | 근거 |')
D.push('|---|---|---|')
D.push('| F1 | 파티션 = 회선상태이력·가입계약이력·회선변경이력·가입상품이력 4개(연 RANGE) | T3 대용량 이력 규칙(1천5백만 행 이상 이력), 다른 영역 FK 참조 없음, 최근 연도 조회·과거 연도 보관 분리(S6 최근 파티션 쏠림 재현) |')
D.push('| F2 | 파티션 키를 PK 끝에 추가하고 칼럼 순서는 PK 칼럼 바로 뒤로 이동 | PostgreSQL 파티션 PK 제약 + 규칙 2-9(PK → FK → 일반) |')
D.push('| F3 | 일반 테이블 PK 는 유일 인덱스 먼저 만든 뒤 `USING INDEX` 로 승격 | 대량 적재 뒤 인덱스 빌드 1회(D14), 재실행 시 pg_constraint 확인으로 건너뜀 |')
D.push('| F4 | 선택 FK 인덱스는 부분 인덱스 | NULL 90%+ (S5) 칼럼 인덱스 크기 1/10 이하 |')
D.push('| F5 | FK 칼럼 중 PRD 기준 코드(상품·단말모델·유심) 역조회 인덱스 생략(가입상품.상품코드만 예외) | 기준 → 가입 역조회는 집계 배치뿐, S2 쏠림으로 인덱스 효용 낮음 |')
D.push('| F6 | 일자C8·년월C6 은 도메인 정본대로 CHAR 유지 | 규칙 2-10 도메인 정본(이 저장소 앱 규칙 "CHAR 금지"는 cafe.pi 대상 — pitel 은 도메인 사전 우선) |')
D.push('')
fs.writeFileSync(path.join(ROOT, 'docs/05_physical_ORD.md'), D.join('\n'))
console.log(JSON.stringify(out.summary))
