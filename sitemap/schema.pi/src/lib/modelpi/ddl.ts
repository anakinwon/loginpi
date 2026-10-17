// DDL 생성(순수, PRD_PiErd S2 P6) — 저장된 물리 모델 → PostgreSQL·Oracle·Tibero CREATE TABLE·PK·COMMENT·FK 스크립트(.sql 내려받기만, DB 직접 실행 없음)
// FK : PostgreSQL = ALTER TABLE ADD CONSTRAINT, Oracle·Tibero = 주석으로만(DBMS 프로파일 STD-08 물리 FK 미생성). 칼럼 쌍 = 자식 칼럼 속성의 원천(src_attr_id) → 부모 칼럼
// ponytail: 변경일시 갱신 트리거·인덱스(PK 외)·ALTER 변경분은 미생성 — 인덱스 설계·변경분 DDL 은 S5
import { DBMS_PRFL, type DbmsCd } from './dbms.ts'
import { pkName, type PhyCol } from './phy.ts'
import type { DocTable } from './docs.ts'

export interface DdlTbl {
  ent_id: string
  tbl_nm: string
  tbl_desc: string | null
  cols: (PhyCol & { col_desc?: string | null })[]
}
export interface DdlFk {
  rel_id: string
  fk_nm: string
  prnt_ent_id: string
  chld_ent_id: string
}
export interface DdlIn {
  dbms: DbmsCd
  ltr: 'UPPER' | 'LOWER'
  tables: DdlTbl[]
  fks: DdlFk[]
  src: Map<string, string | null> // 자식 속성ID → 원천 부모 속성ID(src_attr_id)
  fkOf: Map<string, string | null> // 속성ID → 상속 관계ID(fk_rel_id)
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const tpOf = (c: PhyCol) => (c.data_len != null ? `${c.phy_tp_nm}(${c.data_len}${c.data_scale != null ? `,${c.data_scale}` : ''})` : c.phy_tp_nm)

// FK 칼럼 쌍 — 원천 우선, 없으면 부모 PK 중 같은 칼럼명
export function fkPairs(fk: DdlFk, byEnt: Map<string, DdlTbl>, d: Pick<DdlIn, 'src' | 'fkOf'>): [string, string][] {
  const c = byEnt.get(fk.chld_ent_id)
  const p = byEnt.get(fk.prnt_ent_id)
  if (!c || !p) return []
  const pk = p.cols.filter((x) => x.pk_yn === 'Y')
  return c.cols
    .filter((x) => x.attr_id && d.fkOf.get(x.attr_id) === fk.rel_id)
    .map((x): [string, string] | null => {
      const s = d.src.get(x.attr_id!)
      const pc = pk.find((y) => (s ? y.attr_id === s : y.col_nm === x.col_nm))
      return pc ? [x.col_nm, pc.col_nm] : null
    })
    .filter((v): v is [string, string] => !!v)
}

export function genDdl(d: DdlIn, head: { prjNm: string; at: string }): string {
  const nm = (s: string) => (d.ltr === 'LOWER' ? s.toLowerCase() : s.toUpperCase())
  const pg = d.dbms === '0014'
  const out: string[] = [`-- ${head.prjNm} 물리 모델 DDL — ${DBMS_PRFL[d.dbms].nm}, 생성 ${head.at}`, '-- 표준 데이터 모델에서 생성(직접 실행 전 DBA 검토)', '']
  for (const t of d.tables) {
    const cols = [...t.cols].sort((a, b) => a.col_seq - b.col_seq)
    const lines = cols.map((c) => `  ${nm(c.col_nm).padEnd(30)} ${tpOf(c)}${c.bsc_val_txt ? ` DEFAULT ${c.bsc_val_txt}` : ''}${c.null_yn === 'N' ? ' NOT NULL' : ''}`)
    const pk = cols.filter((c) => c.pk_yn === 'Y').sort((a, b) => (a.pk_seq ?? 0) - (b.pk_seq ?? 0))
    if (pk.length) lines.push(`  CONSTRAINT ${nm(pkName(d.dbms, t.tbl_nm))} PRIMARY KEY (${pk.map((c) => nm(c.col_nm)).join(', ')})`)
    out.push(`CREATE TABLE ${nm(t.tbl_nm)} (`, lines.join(',\n'), ');')
    if (t.tbl_desc) out.push(`COMMENT ON TABLE ${nm(t.tbl_nm)} IS ${q(t.tbl_desc)};`)
    for (const c of cols) if (c.col_desc) out.push(`COMMENT ON COLUMN ${nm(t.tbl_nm)}.${nm(c.col_nm)} IS ${q(c.col_desc)};`)
    out.push('')
  }
  const byEnt = new Map(d.tables.map((t) => [t.ent_id, t]))
  for (const f of d.fks) {
    const pairs = fkPairs(f, byEnt, d)
    const c = byEnt.get(f.chld_ent_id), p = byEnt.get(f.prnt_ent_id)
    if (!c || !p || !pairs.length) {
      out.push(`-- ${f.fk_nm} : 칼럼 쌍을 찾지 못함(관계 FK 상속을 확인하십시오)`)
      continue
    }
    const want = c.cols.filter((x) => x.attr_id && d.fkOf.get(x.attr_id) === f.rel_id).length
    if (pairs.length !== want) out.push(`-- ⚠ ${f.fk_nm} : FK 칼럼 ${want}개 중 ${pairs.length}개만 부모 PK 와 짝지음(원천 속성을 확인하십시오)`)
    const sql = `ALTER TABLE ${nm(c.tbl_nm)} ADD CONSTRAINT ${nm(f.fk_nm)} FOREIGN KEY (${pairs.map((x) => nm(x[0])).join(', ')}) REFERENCES ${nm(p.tbl_nm)} (${pairs.map((x) => nm(x[1])).join(', ')});`
    out.push(pg ? sql : `-- (관계, 물리 FK 미생성 STD-08) ${sql}`)
  }
  return out.join('\n') + '\n'
}

// 물리 정의서 2종(테이블·칼럼) — CSV 는 docs.ts docCsv 재사용
export function phyDocTables(tables: DdlTbl[]): { tbl: DocTable; col: DocTable } {
  return {
    tbl: { title: '테이블정의서', headers: ['테이블명', '설명', '칼럼 수', '주키'], rows: tables.map((t) => [t.tbl_nm, t.tbl_desc ?? '', t.cols.length, t.cols.filter((c) => c.pk_yn === 'Y').map((c) => c.col_nm).join(', ')]) },
    col: {
      title: '칼럼정의서',
      headers: ['테이블명', '순서', '칼럼명', '설명', '데이터타입', 'NULL', '기본값', 'PK', '시스템'],
      rows: tables.flatMap((t) => [...t.cols].sort((a, b) => a.col_seq - b.col_seq).map((c) => [t.tbl_nm, c.col_seq, c.col_nm, c.col_desc ?? '', tpOf(c), c.null_yn, c.bsc_val_txt ?? '', c.pk_yn === 'Y' ? (c.pk_seq ?? 1) : '', c.sys_col_yn])),
    },
  }
}
