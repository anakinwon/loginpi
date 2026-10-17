// 물리 diff 동기화 + 변경분 DDL(순수, PRD_PiErd S5) — 저장된 물리 모델(prev)과 현재 논리의 새 변환(next)으로 동기화 계획(ops)을 만들고,
// 같은 계획으로 ① 변경분 DDL(ALTER) ② 저장 모델 갱신을 한다(DDL 과 저장 상태가 어긋나지 않음)
// 사용자 결정값(순서·NULL·기본값)은 유지 : 논리 변경(추가·삭제·이름·타입·길이·주키)만 반영. 도메인 버전만 오르고 모양이 같으면 스냅샷만 갱신
// 데이터 손실 문장(DROP TABLE·DROP COLUMN)은 주석으로만 낸다 — DBA 확인 후 주석을 풀어 실행
import { DBMS_PRFL, type DbmsCd } from './dbms.ts'
import { bscOk, pkName, type PhyCol, type PhyTbl } from './phy.ts'

export type StoredCol = PhyCol & { phy_col_id: string }
export type StoredTbl = { phy_tbl_id: string; ent_id: string; tbl_nm: string; tbl_desc: string | null; cols: StoredCol[] }

export type SyncOp =
  | { op: 'ADD_TBL'; tbl: PhyTbl }
  | { op: 'DEL_TBL'; phy_tbl_id: string; tbl_nm: string }
  | { op: 'REN_TBL'; phy_tbl_id: string; from: string; to: string }
  | { op: 'ADD_COL'; phy_tbl_id: string; tbl_nm: string; col: PhyCol }
  | { op: 'DEL_COL'; phy_col_id: string; tbl_nm: string; col_nm: string }
  | { op: 'MOD_COL'; phy_col_id: string; tbl_nm: string; from: PhyCol; to: PhyCol; ddl: boolean } // ddl=false : 스냅샷만(모양 같음)
  | { op: 'SEQ'; phy_col_id: string; col_seq: number } // 시스템 칼럼 뒤로 밀기(새 칼럼 자리)
  | { op: 'PK'; tbl_nm: string; old_tbl_nm: string; old_pk: string[]; new_pk: string[] } // 제약명은 생성 당시 테이블명 기준

const key = (c: PhyCol) => c.attr_id ?? `SYS:${c.col_nm}`
const shapeOf = (c: PhyCol) => `${c.phy_tp_nm}|${c.data_len}|${c.data_scale}`

export function planSync(prev: StoredTbl[], next: PhyTbl[]): SyncOp[] {
  const ops: SyncOp[] = []
  const pm = new Map(prev.map((t) => [t.ent_id, t]))
  const nm = new Set(next.map((t) => t.ent_id))
  for (const t of next) if (!pm.has(t.ent_id)) ops.push({ op: 'ADD_TBL', tbl: t })
  for (const t of prev) if (!nm.has(t.ent_id)) ops.push({ op: 'DEL_TBL', phy_tbl_id: t.phy_tbl_id, tbl_nm: t.tbl_nm })
  for (const n of next) {
    const p = pm.get(n.ent_id)
    if (!p) continue
    if (p.tbl_nm !== n.tbl_nm) ops.push({ op: 'REN_TBL', phy_tbl_id: p.phy_tbl_id, from: p.tbl_nm, to: n.tbl_nm })
    const tn = n.tbl_nm
    const pc = new Map(p.cols.map((c) => [key(c), c]))
    const nk = new Set(n.cols.map(key))
    // 새 칼럼은 일반 칼럼 끝(시스템 칼럼 앞)에 — 시스템 칼럼을 그만큼 뒤로
    const adds = n.cols.filter((c) => c.sys_col_yn !== 'Y' && !pc.has(key(c)))
    const normalMax = Math.max(0, ...p.cols.filter((c) => c.sys_col_yn !== 'Y' && nk.has(key(c))).map((c) => c.col_seq))
    adds.forEach((c, i) => ops.push({ op: 'ADD_COL', phy_tbl_id: p.phy_tbl_id, tbl_nm: tn, col: { ...c, col_seq: normalMax + i + 1 } }))
    const sys = p.cols.filter((c) => c.sys_col_yn === 'Y' && nk.has(key(c))).sort((a, b) => a.col_seq - b.col_seq)
    sys.forEach((c, i) => {
      const s = normalMax + adds.length + i + 1
      if (c.col_seq !== s) ops.push({ op: 'SEQ', phy_col_id: c.phy_col_id, col_seq: s })
    })
    // 시스템 칼럼(삭제 칼럼 켜기/끄기는 물리 모델 설정 — 여기서는 기존 구성 유지) 은 추가하지 않는다
    for (const c of p.cols) if (!nk.has(key(c)) && c.sys_col_yn !== 'Y') ops.push({ op: 'DEL_COL', phy_col_id: c.phy_col_id, tbl_nm: tn, col_nm: c.col_nm })
    for (const c of n.cols) {
      const o = pc.get(key(c))
      if (!o || c.sys_col_yn === 'Y') continue
      const shape = shapeOf(o) !== shapeOf(c)
      const meta = o.col_nm !== c.col_nm || o.pk_yn !== c.pk_yn || o.pk_seq !== c.pk_seq || o.dom_id !== c.dom_id || o.dom_ver_no !== c.dom_ver_no
      if (shape || meta) ops.push({ op: 'MOD_COL', phy_col_id: o.phy_col_id, tbl_nm: tn, from: o, to: c, ddl: shape || o.col_nm !== c.col_nm })
    }
    const oldPk = p.cols.filter((c) => c.pk_yn === 'Y').sort((a, b) => (a.pk_seq ?? 0) - (b.pk_seq ?? 0)).map((c) => c.col_nm)
    const newPk = n.cols.filter((c) => c.pk_yn === 'Y').sort((a, b) => (a.pk_seq ?? 0) - (b.pk_seq ?? 0)).map((c) => c.col_nm)
    if (oldPk.join() !== newPk.join()) ops.push({ op: 'PK', tbl_nm: tn, old_tbl_nm: p.tbl_nm, old_pk: oldPk, new_pk: newPk })
  }
  return ops
}

const tpOf = (c: PhyCol) => (c.data_len != null ? `${c.phy_tp_nm}(${c.data_len}${c.data_scale != null ? `,${c.data_scale}` : ''})` : c.phy_tp_nm)

// 변경분 DDL — PostgreSQL / Oracle·Tibero 문법. 새 테이블 CREATE 는 genDdl 이 담당(여기서는 안내 주석), FK 변경은 S5 후속
export function alterDdl(ops: SyncOp[], o: { dbms: DbmsCd; ltr: 'UPPER' | 'LOWER'; prjNm: string; at: string }): string {
  const nm = (s: string) => (o.ltr === 'LOWER' ? s.toLowerCase() : s.toUpperCase())
  const one = (s: string) => s.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
  const pg = o.dbms === '0014'
  const out = [`-- ${one(o.prjNm)} 물리 모델 변경분 DDL — ${DBMS_PRFL[o.dbms].nm}, 생성 ${one(o.at)}`, '-- 데이터 손실 문장(DROP)은 주석 — DBA 확인 후 실행. 새 칼럼은 테이블 끝에 붙음(물리 순서는 재생성 시 반영)', '']
  const colDef = (c: PhyCol) => `${nm(c.col_nm)} ${tpOf(c)}${c.bsc_val_txt && bscOk(c.bsc_val_txt, o.dbms) ? ` DEFAULT ${c.bsc_val_txt}` : ''}${c.null_yn === 'N' ? ' NOT NULL' : ''}`
  // 이름 변경 먼저(칼럼 추가보다 앞) — 같은 테이블에서 바뀐 이름이 기존 이름과 겹치면(맞바꿈·연쇄) 임시 이름을 거침
  const rens = ops.filter((x): x is Extract<SyncOp, { op: 'MOD_COL' }> => x.op === 'MOD_COL' && x.from.col_nm !== x.to.col_nm)
  const byTbl = new Map<string, typeof rens>()
  for (const r of rens) byTbl.set(r.tbl_nm, [...(byTbl.get(r.tbl_nm) ?? []), r])
  for (const [t, rs] of byTbl) {
    const olds = new Set(rs.map((r) => r.from.col_nm))
    const clash = rs.some((r) => olds.has(r.to.col_nm))
    if (clash) rs.forEach((r, i) => out.push(`ALTER TABLE ${nm(t)} RENAME COLUMN ${nm(r.from.col_nm)} TO ${nm(`TMP_REN_${i + 1}`)};`))
    rs.forEach((r, i) => out.push(`ALTER TABLE ${nm(t)} RENAME COLUMN ${nm(clash ? `TMP_REN_${i + 1}` : r.from.col_nm)} TO ${nm(r.to.col_nm)};`))
  }
  for (const x of ops) {
    if (x.op === 'ADD_TBL') out.push(one(`-- 새 테이블 ${nm(x.tbl.tbl_nm)} : 동기화 후 전체 DDL 내려받기에서 CREATE 문을 사용하십시오`))
    else if (x.op === 'DEL_TBL') out.push(one(`-- DROP TABLE ${nm(x.tbl_nm)};`))
    else if (x.op === 'REN_TBL') out.push(`ALTER TABLE ${nm(x.from)} RENAME TO ${nm(x.to)};`)
    else if (x.op === 'ADD_COL') out.push(pg ? `ALTER TABLE ${nm(x.tbl_nm)} ADD COLUMN ${colDef(x.col)};` : `ALTER TABLE ${nm(x.tbl_nm)} ADD (${colDef(x.col)});`)
    else if (x.op === 'DEL_COL') out.push(one(`-- ALTER TABLE ${nm(x.tbl_nm)} DROP COLUMN ${nm(x.col_nm)};`))
    else if (x.op === 'MOD_COL' && x.ddl) {
      if (shapeOf(x.from) !== shapeOf(x.to))
        out.push(pg ? `ALTER TABLE ${nm(x.tbl_nm)} ALTER COLUMN ${nm(x.to.col_nm)} TYPE ${tpOf(x.to)};` : `ALTER TABLE ${nm(x.tbl_nm)} MODIFY (${nm(x.to.col_nm)} ${tpOf(x.to)});`)
    } else if (x.op === 'PK') {
      // 테이블 이름을 바꿔도 기존 제약명은 옛 이름 그대로 — 옛 이름으로 지우고 새 이름으로 만든다
      if (x.old_pk.length) out.push(`ALTER TABLE ${nm(x.tbl_nm)} DROP CONSTRAINT ${nm(pkName(o.dbms, x.old_tbl_nm))};`)
      if (x.new_pk.length) out.push(`ALTER TABLE ${nm(x.tbl_nm)} ADD CONSTRAINT ${nm(pkName(o.dbms, x.tbl_nm))} PRIMARY KEY (${x.new_pk.map(nm).join(', ')});`)
    }
  }
  if (out.length === 3) out.push('-- 변경 없음')
  // ponytail: 테이블 이름 변경 뒤 유지 FK 이름·이미 한 번 이름이 바뀐 테이블의 주키 제약명은 갱신 안 함(저장 제약명 없음) — 필요 시 mdl_phy_tbl 에 pk_nm 저장
  return out.join('\n') + '\n'
}
