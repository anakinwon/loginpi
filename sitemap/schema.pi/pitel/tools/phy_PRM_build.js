// 파트너(PRM, 정산 모듈 STL 주 배치처) 물리 모델 생성기 — model/logical/PRM.json(+전 영역 논리 = 교차 FK 해석)을 읽어
// model/physical/PRM.json · ddl/70_prm_tables.sql · ddl/70_prm_constraints.sql · docs/05_physical_PRM.md 를 만든다.
// 실행 : node tools/phy_PRM_build.js   (sitemap/schema.pi/pitel 에서) — 골격은 tools/phy_ORD_build.js 승계
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const AREA = 'PRM'
const YEAR_FROM = 2010
const YEAR_TO = 2027

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const lgc = rd('model/logical/PRM.json')
const domains = Object.fromEntries(rd('model/std/domains.json').map((d) => [d.domNm, d]))
const terms = rd('model/std/terms.json')
const termByNm = Object.fromEntries(terms.map((t) => [t.termNm, t]))

// 전 영역 엔터티 사전('AREA.엔터티명' → 엔터티) — 교차 FK 부모 테이블 해석
const entIndex = {}
for (const f of fs.readdirSync(path.join(ROOT, 'model/logical'))) {
  const j = rd('model/logical/' + f)
  for (const e of j.entities) entIndex[`${j.area}.${e.entNm}`] = e
}

// 도메인 → PostgreSQL 17 타입
const pgType = (domNm) => {
  const d = domains[domNm]
  if (!d) throw new Error('도메인 없음 : ' + domNm)
  if (d.lgcTp === 'TIMESTAMP' || d.lgcTp === 'DATE' || d.lgcTp === 'TEXT') return d.lgcTp
  if (d.lgcTp === 'NUMERIC') return d.scale ? `NUMERIC(${d.len},${d.scale})` : `NUMERIC(${d.len})`
  return `${d.lgcTp}(${d.len})`
}

// ── 물리 설계 결정(테이블별, 키 = 논리 tblNm) ────────────────────────
// est = 목표 행 수(PRM 영역 T2 상품계 100만~900만, 기준·실체는 T1 — 실제 거래처 규모가 1만 미만인 표는 실무 값)
// part = 연 단위 RANGE 파티션 키(PK 에 포함)
// den = 반정규화 [용어명, 원천, 사유, after 칼럼(null = 끝), nullYn, dflt, fkRefTbl(선택)]
// idx = [칼럼 목록, 사유, where(부분 인덱스, 선택)]
const CFG = {
  PTL_PRM_PRTNR_M: {
    est: 60_000,
    idx: [
      [['MGMT_ORG_CD'], '관리 조직별 담당 파트너 목록(영업 조직 실적·개편 영향) — 조직기본 조인 FK', 'mgmt_org_cd IS NOT NULL'],
      [['RGN_CD'], '지역별 유통망 현황(S10 지역↔대리점 강상관 — 통계 오판 점검) — 지역코드 조인 FK', 'rgn_cd IS NOT NULL'],
      [['BRNO'], '사업자등록번호로 거래처 찾기(세금계산서 대사·중복 거래처 점검)', 'brno IS NOT NULL'],
    ],
  },
  PTL_PRM_ORG_M: {
    est: 2_000,
    idx: [[['UP_ORG_CD'], '조직 계층 전개(상위 → 하위, 재귀 조회) — 자기 참조 FK', 'up_org_cd IS NOT NULL']],
  },
  PTL_PRM_AGNC_M: { est: 5_000, idx: [] },
  PTL_PRM_SHOP_M: {
    est: 40_000,
    idx: [[['AGNC_NO'], '대리점 산하 판매점(2차점) 목록·대리점 단위 유치 실적 — 대리점기본 조인 FK', 'agnc_no IS NOT NULL']],
  },
  PTL_PRM_CNTS_PRVD_CO_M: { est: 8_000, idx: [] },
  PTL_PRM_CARR_M: { est: 300, idx: [] },
  PTL_PRM_ROAM_BZMN_M: {
    est: 1_200,
    idx: [[['TADIG_CD'], 'TAP·RAP 파일 헤더의 TADIG 코드 → 로밍사업자 매칭(파일·레코드 처리마다 조회)']],
  },
  PTL_PRM_PRTNR_CTRT_M: {
    est: 150_000,
    idx: [
      [['PRTNR_NO'], '파트너별 계약 목록 — 파트너기본 조인 FK'],
      [['CTRT_END_DT'], '계약 만료 도래 추출(자동 갱신·재계약 안내 배치) — 해지 안 된 계약만', 'ctrt_trmn_dt IS NULL'],
    ],
  },
  PTL_PRM_STLM_M: {
    est: 4_000_000,
    den: [
      ['파트너번호', '파트너계약기본.파트너번호(정산 → 계약 → 파트너)', '파트너별 정산 조회·정산월통계 집계 경로 — 계약 조인 1단계 제거(논리 L1 후보). 계약의 파트너는 불변이라 갱신 부담 없음', 'PRTNR_CTRT_NO', false, null, 'PTL_PRM_PRTNR_M'],
      ['정산확정일시', '정산확정이력 중 확정 상태 행의 처리일시', '확정 기간 조회·지급 예정 산정 — 이력(900만) 스캔 회피(논리 L1 후보). 확정 처리와 같은 트랜잭션에서 기록, 확정 전 NULL', null, true, null],
    ],
    idx: [
      [['PRTNR_CTRT_NO', 'STLM_YM'], '계약별 월 정산서 — 파트너계약기본 조인 FK'],
      [['PRTNR_NO', 'STLM_YM'], '파트너별 정산 이력·월 정산 조회(반정규화 칼럼)'],
      [['STLM_YM', 'STLM_TY_CD'], '정산월 마감 배치 — 해당 월 정산 유형별 일괄 확정·정산월통계 생성'],
      [['GIVE_SCHD_DT'], '지급 예정일 도래 정산 추출(자금 계획·지급 배치)', 'give_schd_dt IS NOT NULL'],
    ],
  },
  PTL_PRM_TXINV_M: {
    est: 3_500_000,
    den: [['파트너번호', '정산기본 → 파트너계약기본.파트너번호', '거래처별 세금계산서 조회·국세청 전송 묶음 — 2단계 조인 제거(논리 L1 후보). 발행 시점 확정, 이후 불변', 'ORGN_TXINV_NO', false, null, 'PTL_PRM_PRTNR_M']],
    idx: [
      [['STLM_NO'], '정산서 → 세금계산서 — 정산기본 조인 FK'],
      [['PRTNR_NO', 'WRT_DT'], '거래처별 작성일자 기간 조회(매입·매출 장부 대사, 반정규화 칼럼)'],
      [['ORGN_TXINV_NO'], '수정세금계산서 → 원본 추적', 'orgn_txinv_no IS NOT NULL'],
      [['ELCTR_TXINV_APRV_NO'], '국세청 전자세금계산서 승인번호 대사', 'elctr_txinv_aprv_no IS NOT NULL'],
      [['WRT_DT'], '국세청 미전송 건 추출(전송 기한 = 작성일 익월 10일) — 미전송만', 'nts_trnm_dtm IS NULL'],
    ],
  },
  PTL_PRM_PRTNR_H: { est: 400_000, idx: [] },
  PTL_PRM_PRTNR_CTRT_H: { est: 500_000, idx: [] },
  PTL_PRM_PRTNR_ACCT_D: { est: 90_000, idx: [] },
  PTL_PRM_PRTNR_PIC_D: { est: 150_000, idx: [] },
  PTL_PRM_ORG_H: { est: 10_000, idx: [] },
  PTL_PRM_EQP_STCK_L: {
    est: 9_000_000,
    idx: [
      [['PRTNR_NO', 'EQP_STCK_STTS_TY_CD'], '유통점별 재고 현황(보유·출고) — 파트너기본 조인 FK, 상태 저선택도(S3)는 선두에 두지 않음'],
      [['IMEI_NO'], '개통 시 IMEI 재고 차감·분실·도난 단말 입고처 조회'],
    ],
  },
  PTL_PRM_USIM_STCK_L: {
    est: 8_000_000,
    idx: [
      [['PRTNR_NO', 'USIM_STCK_STTS_TY_CD'], '유통점별 유심 재고 현황 — 파트너기본 조인 FK'],
      [['USIM_SN'], '개통·유심 교체 시 유심 일련번호 재고 차감'],
    ],
  },
  PTL_PRM_STLM_D: { est: 9_000_000, idx: [] },
  PTL_PRM_FEE_PLCY_M: { est: 5_000, idx: [] },
  PTL_PRM_FEE_TRF_D: { est: 80_000, idx: [] },
  PTL_PRM_ATRCT_FEE_L: {
    est: 9_000_000,
    idx: [
      [['SBSC_CTRT_NO'], '계약 → 유치 수수료(조기 해지 환수 대상 판정) — ORD 가입계약기본 조인 FK'],
      [['SHOP_NO', 'FEE_OCRN_DT'], '판매점별 기간 유치 수수료 집계(월 정산 생성) — 판매점기본 조인 FK'],
      [['STLM_NO'], '정산서 → 원천 수수료 내역(정산 전 = NULL, S5)', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_MGMT_FEE_L: {
    est: 40_000_000,
    part: 'STLM_YM',
    idx: [
      [['AGNC_NO', 'STLM_YM'], '대리점 월 관리수수료 집계(월 정산 생성) — 대리점기본 조인 FK, 파티션 프루닝'],
      [['SBSC_CTRT_NO'], '계약별 관리수수료 이력(해지·명의변경 정산) — ORD 가입계약기본 조인 FK'],
      [['STLM_NO'], '정산서 → 원천 수수료 내역', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_FEE_CLBK_L: {
    est: 1_500_000,
    idx: [
      [['ATRCT_FEE_NO'], '유치 수수료 → 환수 내역 — 유치수수료내역 조인 FK'],
      [['TRMN_APLY_NO'], 'ORD 해지신청 → 환수 추적', 'trmn_aply_no IS NOT NULL'],
      [['STLM_NO'], '정산서 → 환수 내역(음수 상계 S7)', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_INCNTV_PLCY_M: { est: 30_000, idx: [] },
  PTL_PRM_INCNTV_GIVE_L: {
    est: 8_000_000,
    idx: [
      [['PRTNR_NO', 'INCNTV_OCRN_DT'], '유통점별 기간 장려금 집계(월 정산 생성) — 파트너기본 조인 FK'],
      [['SBSC_CTRT_NO'], '개통 건 → 장려금 추적(불법 지원금 점검)', 'sbsc_ctrt_no IS NOT NULL'],
      [['STLM_NO'], '정산서 → 원천 장려금 내역', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_INTCN_TRF_D: { est: 3_000, idx: [] },
  PTL_PRM_INTCN_USE_T: {
    est: 200_000,
    idx: [[['STLM_NO'], '정산서 → 상호접속 집계', 'stlm_no IS NOT NULL']],
  },
  PTL_PRM_ROAM_STLM_FILE_L: {
    est: 6_000_000,
    idx: [
      [['ROAM_BZMN_NO', 'ROAM_DRCT_SE_CD', 'ROAM_STLM_FILE_SEQ'], 'TAP 파일 순번 누락·중복 점검(누락 = RAP 반송) — 로밍사업자기본 조인 FK'],
      [['ROAM_STLM_FILE_PRCS_DTM'], '일자별 파일 처리 현황·오류 파일 재처리 배치'],
      [['ROAM_STLM_NO'], '월 로밍 정산 → 포함 파일', 'roam_stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_ROAM_STLM_L: {
    est: 500_000,
    idx: [
      [['ROAM_BZMN_NO', 'STLM_YM'], '사업자×월 로밍 정산 조회 — 로밍사업자기본 조인 FK'],
      [['STLM_NO'], '정산서 → 로밍 정산', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_CNTS_STLM_L: {
    est: 1_600_000,
    idx: [
      [['CNTS_PRVD_CO_NO', 'STLM_YM'], '제공사×월 콘텐츠·소액결제 정산 조회 — 콘텐츠제공사기본 조인 FK'],
      [['STLM_NO'], '정산서 → 콘텐츠 정산', 'stlm_no IS NOT NULL'],
    ],
  },
  PTL_PRM_STLM_GIVE_L: {
    est: 4_200_000,
    idx: [
      [['STLM_GIVE_DTM'], '일자별 지급 실적·자금 집행 대사'],
      [['PRTNR_NO', 'PRTNR_ACCT_SEQ'], '지급 계좌별 지급 이력(채권양도 계좌 점검) — 파트너계좌상세 조인 FK', 'prtnr_no IS NOT NULL'],
    ],
  },
  PTL_PRM_STLM_CFMTN_H: { est: 9_000_000, idx: [] },
  PTL_PRM_TXINV_D: { est: 7_000_000, idx: [] },
  PTL_PRM_STLM_MM_S: { est: 20_000, idx: [] },
}

// ── 생성 ─────────────────────────────────────────────────────────────
const lc = (s) => s.toLowerCase()
const tables = []
const issues = []

for (const e of lgc.entities) {
  const tblNm = e.tblNm
  const cfg = CFG[tblNm]
  if (!cfg) throw new Error('설정 없음 : ' + tblNm)
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
  const denFks = []
  for (const [termNm, src, why, after, nullYn, dflt, fkRef] of cfg.den || []) {
    const t = termByNm[termNm]
    if (!t) throw new Error('용어 없음 : ' + termNm)
    const c = { colNm: t.phyNm, dataTp: pgType(t.domNm), nullYn, pk: false, seq: 0, termNm, dflt, _fk: null }
    const i = after ? cols.findIndex((x) => x.colNm === after) + 1 : cols.length
    if (after && i === 0) throw new Error('after 없음 : ' + after)
    cols.splice(i, 0, c)
    denorm.push({ col: t.phyNm, srcTbl: src, why })
    if (fkRef) denFks.push({ cols: [t.phyNm], refTbl: fkRef, refCols: [t.phyNm] })
  }
  // 파티션 키 → PK 끝에 포함, 칼럼은 PK 칼럼 바로 뒤로(규칙 2-9 PK → FK → 일반)
  let partition = null
  if (cfg.part) {
    const i = cols.findIndex((x) => x.colNm === cfg.part)
    if (i < 0) throw new Error('파티션 키 없음 : ' + cfg.part)
    const [c] = cols.splice(i, 1)
    if (c.nullYn) throw new Error('파티션 키 NULL 허용 : ' + cfg.part)
    c.pk = true
    const lastPk = cols.map((x) => x.pk).lastIndexOf(true)
    cols.splice(lastPk + 1, 0, c)
    partition = {
      type: 'RANGE',
      key: cfg.part,
      unit: 'YEAR',
      from: `${YEAR_FROM}-01`,
      to: `${YEAR_TO}-12`,
      note: `T3 규모 누적 내역 — 연 단위 ${YEAR_FROM}~${YEAR_TO} ${YEAR_TO - YEAR_FROM + 1}개 + DEFAULT 1개. 키가 년월 CHAR(6) 이라 경계 = 'YYYY01'. 파티션 키를 PK 끝에 포함(PostgreSQL 파티션 유일성 제약) — 관리수수료번호의 전역 유일은 채번이 보장`,
    }
  }
  cols.forEach((c, i) => (c.seq = i + 1))
  const pkCols = cols.filter((c) => c.pk).map((c) => c.colNm)
  // FK 정의(DDL 미생성 — D6) : 같은 부모의 서로 다른 PK 속성은 복합 FK 로 묶고, 같은 부모 속성이 또 나오면(자기·역할 참조) 새 FK
  const groups = []
  for (const c of cols) {
    if (!c._fk) continue
    const key = `${c._fk.area}.${c._fk.ent}`
    const parent = entIndex[key]
    if (!parent) throw new Error('부모 엔터티 없음 : ' + key)
    const pa = parent.attrs.find((a) => a.attrNm === c._fk.attr)
    if (!pa) throw new Error('부모 속성 없음 : ' + key + '.' + c._fk.attr)
    let g = groups.find((x) => x.key === key && !x.pairs.some((p) => p[1] === pa.phyNm))
    if (!g) groups.push((g = { key, parent, pairs: [] }))
    g.pairs.push([c.colNm, pa.phyNm])
  }
  const fks = []
  for (const g of groups) {
    const refPk = g.parent.attrs.filter((a) => a.pk).map((a) => a.phyNm)
    g.pairs.sort((x, y) => refPk.indexOf(x[1]) - refPk.indexOf(y[1]))
    fks.push({ cols: g.pairs.map((p) => p[0]), refTbl: g.parent.tblNm, refCols: g.pairs.map((p) => p[1]) })
  }
  fks.push(...denFks)
  const fkOut = fks.map((f, i) => ({ nm: `FK_${tblNm}_${String(i + 1).padStart(2, '0')}`, ...f }))
  // 인덱스
  const idx = (cfg.idx || []).map(([ic, why, where], i) => {
    for (const x of ic) if (!cols.some((c) => c.colNm === x)) throw new Error(`인덱스 칼럼 없음 ${tblNm}.${x}`)
    const o = { nm: `X_${tblNm}_${String(i + 1).padStart(2, '0')}`, cols: ic, unq: false, why }
    if (where) o.where = where
    return o
  })
  // 중복 인덱스 점검 : PK·다른 인덱스의 앞부분과 같으면 중복(부분 인덱스는 조건이 같을 때만)
  const all = [{ nm: 'PK', cols: pkCols }, ...idx]
  for (const a of idx)
    for (const b of all)
      if (a !== b && a.cols.length <= b.cols.length && a.cols.every((x, k) => b.cols[k] === x) && (a.where || null) === (b.where || null))
        issues.push(`중복 인덱스 ${a.nm} ⊂ ${b.nm}`)
  for (const n of [tblNm, ...idx.map((x) => x.nm), 'PK_' + tblNm, ...fkOut.map((f) => f.nm)]) if (n.length > 63) issues.push('63자 초과 ' + n)

  tables.push({
    tblNm,
    entId: e.entId,
    entNm: e.entNm,
    tp: e.tp,
    stg: e.stg,
    moduleCd: e.moduleCd || null,
    def: e.def,
    estRows: cfg.est,
    cols: cols.map(({ _fk, ...c }) => c),
    pk: { nm: 'PK_' + tblNm, cols: pkCols },
    idx,
    fks: fkOut,
    partition,
    denorm,
  })
}
if (issues.length) throw new Error(issues.join('\n'))

const out = {
  area: AREA,
  areaNm: '파트너',
  stg: 'PHY',
  ver: '2026-11-07',
  author: 'subagent_physical_modeler',
  trgtDbms: 'POSTGRESQL 17',
  moduleCd: Object.fromEntries(tables.filter((t) => t.moduleCd).map((t) => [t.tblNm, t.moduleCd])),
  rules: {
    naming: 'PK_<테이블> / X_<테이블>_NN / FK_<테이블>_NN(정의만, DDL 미생성 D6) — DDL 은 소문자',
    sysCols: 'DDL 에만 맨 끝 LST_MDDTM·LST_MDFR_ID·LST_RGDTM·LST_RGTR_ID(D7)',
    partition: `PRM 은 T2 영역 — T4 월 파티션 대상 없음. T3 규모(4천만) 누적 내역 1개만 RANGE 연 단위 ${YEAR_FROM}~${YEAR_TO} + DEFAULT`,
  },
  summary: {
    tblCnt: tables.length,
    stlTblCnt: tables.filter((t) => t.moduleCd === 'STL').length,
    partTblCnt: tables.filter((t) => t.partition).length,
    idxCnt: tables.reduce((s, t) => s + t.idx.length, 0),
    fkCnt: tables.reduce((s, t) => s + t.fks.length, 0),
    estRowsTotal: tables.reduce((s, t) => s + t.estRows, 0),
  },
  tables,
}
fs.mkdirSync(path.join(ROOT, 'model/physical'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'model/physical/PRM.json'), JSON.stringify(out, null, 2) + '\n')

// ── DDL ──────────────────────────────────────────────────────────────
const sysCols = [
  ['lst_mddtm', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종수정일시'],
  ['lst_mdfr_id', 'VARCHAR(50)', "'SYSTEM'", '최종수정자ID'],
  ['lst_rgdtm', 'TIMESTAMP', 'CURRENT_TIMESTAMP', '최종등록일시'],
  ['lst_rgtr_id', 'VARCHAR(50)', "'SYSTEM'", '최종등록자ID'],
]
for (const s of sysCols) {
  const t = terms.find((x) => x.phyNm === s[0].toUpperCase())
  if (t) s[3] = t.termNm
}
const q = (s) => "'" + s.replace(/'/g, "''") + "'"
// 파티션 경계 : 일시·일자 = 'YYYY-01-01', 년월 CHAR(6) = 'YYYY01'
const bound = (t) => {
  const c = t.cols.find((x) => x.colNm === t.partition.key)
  return c.dataTp === 'CHAR(6)' ? ["y || '01'", "(y + 1) || '01'"] : ["y || '-01-01'", "(y + 1) || '-01-01'"]
}
const T = []
T.push('-- 파트너(PRM, 정산 STL 모듈 포함) 테이블 DDL — PostgreSQL 17, PK·인덱스 없음(적재 뒤 70_prm_constraints.sql), FK 미생성(D6)')
T.push('-- 생성 : node tools/phy_PRM_build.js (손으로 고치지 말 것) · 실행 : psql -v ON_ERROR_STOP=1 -f 70_prm_tables.sql (재실행 안전)')
T.push(`-- 파티션 : ${tables.filter((t) => t.partition).map((t) => lc(t.tblNm)).join(', ')} (연 단위 ${YEAR_FROM}~${YEAR_TO} + DEFAULT)`)
T.push('')
for (const t of tables) {
  const n = lc(t.tblNm)
  T.push(`-- ${t.entId} ${t.entNm}${t.moduleCd ? ' [' + t.moduleCd + ']' : ''} (목표 ${t.estRows.toLocaleString('en-US')}행)`)
  T.push(`CREATE TABLE IF NOT EXISTS ${n} (`)
  const lines = t.cols.map(
    (c) => `  ${lc(c.colNm)} ${c.dataTp}${c.dflt != null ? ' DEFAULT ' + c.dflt : ''}${c.nullYn ? '' : ' NOT NULL'}`,
  )
  for (const s of sysCols) lines.push(`  ${s[0]} ${s[1]} DEFAULT ${s[2]} NOT NULL`)
  T.push(lines.join(',\n'))
  T.push(t.partition ? `) PARTITION BY RANGE (${lc(t.partition.key)});` : ');')
  if (t.partition) {
    const [lo, hi] = bound(t)
    T.push('DO $$')
    T.push('DECLARE y INT;')
    T.push('BEGIN')
    T.push(`  FOR y IN ${YEAR_FROM}..${YEAR_TO} LOOP`)
    T.push(
      `    EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', '${n}_p' || y, '${n}', ${lo}, ${hi});`,
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
fs.writeFileSync(path.join(ROOT, 'ddl/70_prm_tables.sql'), T.join('\n'))

const C = []
C.push('-- 파트너(PRM) PK·인덱스 DDL — 적재 뒤 실행(D14), 재실행 안전. FK 제약은 만들지 않는다(D6, 정의는 model/physical/PRM.json)')
C.push('-- 생성 : node tools/phy_PRM_build.js · 일반 테이블 = 유일 인덱스 pk_<테이블> → PRIMARY KEY USING INDEX, 파티션 테이블 = PRIMARY KEY (…) 직접')
C.push('')
for (const t of tables) {
  const n = lc(t.tblNm)
  const pk = lc(t.pk.nm)
  const pkc = t.pk.cols.map(lc).join(', ')
  const guard = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${pk}' AND conrelid = '${n}'::regclass) THEN ALTER TABLE ${n} ADD CONSTRAINT ${pk} PRIMARY KEY`
  C.push(`-- ${t.entNm}`)
  if (t.partition) {
    C.push(`${guard} (${pkc}); END IF; END $$;`)
  } else {
    C.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${pk} ON ${n} (${pkc});`)
    C.push(`${guard} USING INDEX ${pk}; END IF; END $$;`)
  }
  for (const x of t.idx)
    C.push(`CREATE INDEX IF NOT EXISTS ${lc(x.nm)} ON ${n} (${x.cols.map(lc).join(', ')})${x.where ? ' WHERE ' + x.where : ''};`)
  C.push('')
}
fs.writeFileSync(path.join(ROOT, 'ddl/70_prm_constraints.sql'), C.join('\n'))

// ── 문서 ─────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString('en-US')
const D = []
D.push('# 05 물리 모델 — 파트너(PRM, 정산 STL 모듈 주 배치처)')
D.push('')
D.push('> 작성 2026-11-07 · subagent_physical_modeler · 마스터 위임 자동 승인 모드. 정본 = `model/physical/PRM.json`, 생성기 = `tools/phy_PRM_build.js`(JSON·DDL·이 문서를 한 번에 생성 — 손으로 고치지 말고 생성기 설정을 고친다).')
D.push('')
D.push('## 1. 요약')
D.push('')
D.push('| 항목 | 값 |')
D.push('|---|---|')
D.push(`| 테이블 | ${out.summary.tblCnt}개 (엔터티 1:1, 핵심 10 · 기본 24, 그중 정산 STL ${out.summary.stlTblCnt}) |`)
D.push(`| 파티션 테이블 | ${out.summary.partTblCnt}개 — 연 단위 RANGE ${YEAR_FROM}~${YEAR_TO} 18개 + DEFAULT 1개 |`)
D.push(`| 인덱스(PK 제외) | ${out.summary.idxCnt}개 |`)
D.push(`| FK 정의 | ${out.summary.fkCnt}개 (DDL 미생성 — D6) |`)
D.push(`| 목표 행 수 합계 | ${fmt(out.summary.estRowsTotal)}행 |`)
D.push('| DDL | `ddl/70_prm_tables.sql`(테이블·파티션·주석) · `ddl/70_prm_constraints.sql`(PK·인덱스, 적재 뒤) |')
D.push('| 검증 | pitel_dev 스키마 chk_prm 에서 두 파일 실행 오류 0 → 스키마 삭제 (재실행 안전성은 같은 파일 2회 실행으로 확인) |')
D.push('')
D.push('## 2. 테이블')
D.push('')
D.push('| # | 테이블 | 엔터티 | 유형 | 모듈 | 칼럼 | PK | 인덱스 | FK | 파티션 | 목표 행 수 |')
D.push('|---|---|---|---|---|---|---|---|---|---|---|')
tables.forEach((t, i) =>
  D.push(
    `| ${i + 1} | ${t.tblNm} | ${t.entNm} | ${t.tp}·${t.stg} | ${t.moduleCd || ''} | ${t.cols.length} | ${t.pk.cols.join(', ')} | ${t.idx.length} | ${t.fks.length} | ${t.partition ? '연 RANGE(' + t.partition.key + ')' : '-'} | ${fmt(t.estRows)} |`,
  ),
)
D.push('')
D.push('칼럼 수는 시스템 칼럼 4개(DDL 에만, D7) 제외.')
D.push('')
D.push('## 3. 파티셔닝')
D.push('')
D.push('- 기준 : PRM 은 T2(상품계) 영역 — T4(1억+) 과금계 테이블이 없어 **월 단위 파티션 대상 없음**. 정산 원천 중 **관리수수료내역만 T3 규모(4천만)** 로 누적되므로 연 단위 RANGE 1개를 둔다.')
D.push('- 파티션 키 = 정산년월(`STLM_YM`, CHAR(6), NOT NULL) — 월 정산 생성·대리점 월 집계가 모두 정산년월 조건이라 프루닝이 그대로 맞는다. 경계는 `\'YYYY01\'`(문자 비교 = 시간 순). PK 끝에 키를 추가해 (관리수수료번호, 정산년월).')
D.push('- 다른 테이블이 FK 로 참조하는 정산기본·유치수수료내역·파트너 계열은 파티션하지 않는다(참조 키 = PK 유지). 관리수수료내역은 참조하는 자식이 없다.')
D.push('')
D.push('| 테이블 | 파티션 키 | 범위 | 하위 테이블 | PK |')
D.push('|---|---|---|---|---|')
for (const t of tables.filter((x) => x.partition))
  D.push(`| ${t.tblNm} | ${t.partition.key} | '${YEAR_FROM}01' ~ '${YEAR_TO + 1}01' | \`${lc(t.tblNm)}_p${YEAR_FROM}\`~\`_p${YEAR_TO}\` + \`_pdflt\` | ${t.pk.cols.join(', ')} |`)
D.push('')
D.push('## 4. 인덱스')
D.push('')
D.push('원칙 : ① 자식 → 부모 역조회가 실제로 일어나는 FK(파트너·계약·정산서·가입계약 단위) ② 실무 조회 경로(파트너+정산년월, 판매점+발생일자, TAP 파일 순번, IMEI·유심 일련번호, 국세청 미전송) ③ PK 앞부분과 겹치는 인덱스 금지(생성기 점검) ④ 정산 전 NULL 인 정산번호 같은 선택 FK(S5)는 `WHERE … IS NOT NULL` 부분 인덱스 ⑤ 저선택도 상태 칼럼(S3) 선두 금지 ⑥ 1만 행 안팎 기준 테이블(대리점·통신사업자·수수료정책·상호접속요율 등)은 PK 외 인덱스 생략(로밍사업자 TADIG 만 예외 — 파일 처리마다 조회).')
D.push('')
D.push('| 인덱스 | 칼럼 | 조건 | 사유 |')
D.push('|---|---|---|---|')
for (const t of tables) for (const x of t.idx) D.push(`| ${x.nm} | ${x.cols.join(', ')} | ${x.where || ''} | ${x.why} |`)
D.push('')
D.push('## 5. 반정규화')
D.push('')
D.push('논리 단계 denormCandidates 4건(L1 이행 종속 제거분)을 물리에서 판정 — 3건 채택, 1건 기각.')
D.push('')
D.push('| 테이블 | 칼럼 | 원천 | 사유 |')
D.push('|---|---|---|---|')
for (const t of tables) for (const d of t.denorm) D.push(`| ${t.tblNm} | ${d.col} | ${d.srcTbl} | ${d.why} |`)
D.push('| (기각) PTL_PRM_ROAM_STLM_L | 원화정산금액 | 정산통화금액 × 적용환율 | 표준용어 미등재(사전 수정 권한 밖) + 50만 행 소형 표라 조회 시 계산으로 충분 — 대용량 경로 아님 |')
D.push('')
D.push('## 6. 예상 행 수 근거')
D.push('')
D.push('- 기간 2010-01 ~ 2026-10(202개월) 누적, 거래 종료 파트너 포함(D8). 거래처 : 대리점 5천 · 판매점 4만 · 콘텐츠제공사 8천 · 통신사업자 300 · 로밍사업자 1,200 + 제휴사 → 파트너 6만.')
D.push('- 정산기본 = 활성 파트너계약 × 월(정산주기 월·분기 혼재) ≈ 400만, 정산상세·정산확정이력 ≈ 정산서당 2.2건, 세금계산서 = 정산서의 약 90%(상계·면세 제외).')
D.push('- 유치수수료 = 판매점 경유 개통(ORD 가입계약 3,200만 중 수수료 정책 대상) 900만, 관리수수료 = 대리점 관리 회선 × 월(2014년 정책 도입 이후·최근 쏠림 S6) 4천만, 환수 = 유치 건의 약 17%(조기 해지·기변).')
D.push('- 로밍정산파일 = 로밍사업자 × 방향 × 일 파일(TAP) ≈ 600만, 로밍정산 = 사업자 × 월 × 방향 50만, 콘텐츠정산 = 제공사 × 월 160만.')
D.push('- 최종 배분은 data_migrationner(docs/06)가 D9 총량 안에서 확정.')
D.push('')
D.push('## 7. 결정 메모')
D.push('')
D.push('| # | 결정 | 근거 |')
D.push('|---|---|---|')
D.push('| F1 | 테이블명 = 논리 `tblNm`(`PTL_PRM_<약어>_<사전 tblSfx>`) 그대로 | reviews/03_logical.md L12 — 생성기가 사전에서 기계 계산한 이름, FK 부모 테이블명도 같은 키 |')
D.push('| F2 | 파티션 = 관리수수료내역 1개(연 RANGE, 키 정산년월) | PRM 최대 누적 표(T3 규모), 월 정산·대리점 월 집계 프루닝, 참조 자식 없음(PK 확장 영향 0) |')
D.push('| F3 | 일반 테이블 PK 는 유일 인덱스 먼저 → `USING INDEX`, 파티션 테이블은 `PRIMARY KEY (…)` | 대량 적재 뒤 인덱스 빌드 1회(D14), pg_constraint 확인으로 재실행 안전 |')
D.push('| F4 | 정산번호 FK 는 전부 부분 인덱스 | 정산 전 원천 내역은 정산번호 NULL(논리 L5, S5) |')
D.push('| F5 | FK 묶음 = 같은 부모의 서로 다른 PK 속성만 복합으로, 같은 부모 속성이 반복되면 별도 FK | 정산지급내역 → 파트너계좌상세 복합 FK(L6)와 조직이력 → 조직기본 2개(자기·상위 조직)를 함께 맞게 표현 |')
D.push('| F6 | 반정규화 파트너번호 2건은 파트너기본으로 FK 정의 추가 | 반정규화 칼럼도 RI 설계 대상(정의만, D6) — ERD·적재 고아 점검(S11) 근거 |')
D.push('| F7 | 일자 CHAR(8)·년월 CHAR(6)·여부 CHAR(1) 은 도메인 정본 유지 | 규칙 2-10 도메인 사전 우선(ORD·PRD 물리와 동일) |')
D.push('| F8 | FK 정의 63건 중 14건은 자식 쪽 선두 인덱스를 두지 않음 — 부모가 코드·기준표(지역·은행·로밍국가·조직·상위통신사업자·단말모델·유심상품·상품·수수료정책·장려금정책)인 FK | 조인 방향이 자식 → 부모(부모 PK 사용)뿐이고 "이 코드·정책을 쓰는 자식 전부" 역조회는 정책 영향 분석 같은 월 배치라 전체 스캔으로 충분. DDL FK 제약이 없어(D6) 부모 갱신·삭제 때 자식 잠금 스캔도 없다. 단말·유심 모델별 재고는 유통점 조건과 함께 조회해 X_01(파트너번호 선두)로 처리(리뷰 05_physical_PRM 2026-11-07) |')
D.push('')
fs.writeFileSync(path.join(ROOT, 'docs/05_physical_PRM.md'), D.join('\n'))
console.log(JSON.stringify(out.summary))
