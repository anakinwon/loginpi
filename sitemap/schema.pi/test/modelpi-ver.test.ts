// 모델 버전 스냅샷·비교 검사(PRD_PiErd S5 ERD-4) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffCnt, diffSnap, snapCnt, toMark, type Snap, type SnapAttr, type SnapEnt } from '../src/lib/modelpi/ver.ts'

const A = (id: string, o: Partial<SnapAttr> = {}): SnapAttr => ({ attr_id: id, term_log_nm: `용어${id}`, term_phy_nm: `T_${id}`, dom_nm: '번호VC10', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', fk_rel_id: null, attr_desc: null, ...o })
const E = (id: string, attrs: SnapAttr[], o: Partial<SnapEnt> = {}): SnapEnt => ({ ent_id: id, ent_log_nm: `엔터티${id}`, tbl_phy_nm: `TB_${id}`, ent_tp_cd: 'BASE', subj_nm: '고객', ent_desc: null, attrs, ...o })
const base: Snap = {
  ents: [E('1', [A('a', { pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y' }), A('b')]), E('2', [A('c')])],
  rels: [{ rel_id: 'r1', prnt_ent_id: '1', chld_ent_id: '2', rel_nm: '가진다', crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y', rel_desc: null }],
}

test('같은 스냅샷 = 차이 없음, 빈 문자열·undefined 는 NULL 과 같게', () => {
  assert.deepEqual(diffCnt(diffSnap(base, base)), { ins: 0, del: 0, upd: 0 })
  const b = structuredClone(base)
  b.ents[0].ent_desc = ''
  assert.deepEqual(diffCnt(diffSnap(base, b)), { ins: 0, del: 0, upd: 0 })
  assert.deepEqual(snapCnt(base), { ent_cnt: 2, attr_cnt: 3, rel_cnt: 1 })
})

test('엔터티·속성·관계 추가·삭제·변경', () => {
  const b = structuredClone(base)
  b.ents[0].ent_log_nm = '고객'
  b.ents[0].attrs[1].esntl_yn = 'Y' // 속성 변경
  b.ents[0].attrs.push(A('d')) // 속성 추가
  b.ents[1].attrs = [] // 속성 삭제
  b.ents.push(E('3', [A('e')])) // 엔터티 추가
  b.rels[0].crdn_cd = '11'
  b.rels.push({ ...b.rels[0], rel_id: 'r2', prnt_ent_id: '2', chld_ent_id: '3', rel_nm: null })
  const d = diffSnap(base, b)
  assert.deepEqual(d.ents.map((x) => [x.op, x.id]), [['UPD', '1'], ['INS', '3']])
  assert.deepEqual(d.ents[0].chg, [{ fld: 'ent_log_nm', bfr: '엔터티1', aftr: '고객' }])
  assert.deepEqual(d.attrs.map((x) => [x.op, x.id, x.ent_nm, x.ent_id]), [['UPD', 'b', '고객', '1'], ['INS', 'd', '고객', '1'], ['DEL', 'c', '엔터티2', '2']]) // 엔터티 순서대로, 소속 엔터티 ID
  assert.deepEqual(d.rels.map((x) => [x.op, x.nm]), [['UPD', '고객 → 엔터티2 (가진다)'], ['INS', '엔터티2 → 엔터티3']])
  assert.deepEqual(diffCnt(d), { ins: 3, del: 1, upd: 3 })
})

test('엔터티 삭제 = 엔터티 1건만(그 속성은 속성 목록에 따로 안 나옴), 관계 부모 변경은 이름으로', () => {
  const b = structuredClone(base)
  b.ents = [b.ents[0]]
  b.rels[0].chld_ent_id = '1'
  const d = diffSnap(base, b)
  assert.deepEqual(d.ents.map((x) => [x.op, x.id]), [['DEL', '2']])
  assert.equal(d.attrs.length, 0)
  assert.deepEqual(d.rels[0].chg, [{ fld: 'chld_ent_id', bfr: '엔터티2', aftr: '엔터티1' }])
})

test('ERD 표시 지도 : 추가·변경은 ID 별 색, 삭제는 건수, 속성만 바뀐 엔터티 = 변경', () => {
  const b = structuredClone(base)
  b.ents[0].attrs[1].esntl_yn = 'Y' // 엔터티1 속성 변경(엔터티 자체는 그대로)
  b.ents[1].attrs = [] // 엔터티2 속성 c 삭제
  b.ents.push(E('3', [A('e')])) // 엔터티 추가
  b.rels = [] // 관계 삭제
  const m = toMark(diffSnap(base, b))
  assert.deepEqual(m.ent, { '1': 'UPD', '2': 'UPD', '3': 'INS' })
  assert.deepEqual(m.attr, { b: 'UPD' })
  assert.deepEqual(m.delAttr, { '2': 1 })
  assert.deepEqual([m.delEnt, m.delRel, Object.keys(m.rel).length], [0, 1, 0])
})
