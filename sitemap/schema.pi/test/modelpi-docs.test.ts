// 논리 모델 정의서(PRD_PiErd S1 L6) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docCsv, docHtml, docTables } from '../src/lib/modelpi/docs.ts'
import type { LAttr, LEnt, LRel } from '../src/lib/modelpi/normalize.ts'

const A = (id: string, nm: string, o: Partial<LAttr> = {}): LAttr => ({ attr_id: id, term_id: `t-${nm}`, term_log_nm: nm, term_phy_nm: nm.toUpperCase(), dom_nm: '번호VC10', pk_yn: 'N', pk_seq: null, esntl_yn: 'Y', fk_rel_id: null, ver_no: 1, term_ok: true, ...o })
const cust = { ent_id: 'c', ent_log_nm: '고객기본', tbl_phy_nm: 'ECM_CST_CUST_M', ent_tp_cd: 'BASE', subj_nm: '고객', words: [], attrs: [A('c1', '고객번호', { pk_yn: 'Y', pk_seq: 1 }), A('c2', '고객명', { attr_desc: '성명, "실명"' })], mdl_lvl_cd: 'CNCP', ent_desc: '회원 <기본>' } as LEnt & { mdl_lvl_cd: string; ent_desc: string }
const ord = { ent_id: 'o', ent_log_nm: '주문기본', tbl_phy_nm: 'ECM_ORD_ORDR_M', ent_tp_cd: 'ACT', subj_nm: '주문', words: [], attrs: [A('o1', '주문번호', { pk_yn: 'Y', pk_seq: 1 }), A('o2', '고객번호', { fk_rel_id: 'r1' })], mdl_lvl_cd: 'LGCL' } as LEnt & { mdl_lvl_cd: string }
const rels: (LRel & { rel_desc?: string })[] = [{ rel_id: 'r1', prnt_ent_id: 'c', chld_ent_id: 'o', rel_nm: '주문', crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y', rel_desc: '고객이 주문' }]

test('정의서 3종 : 엔터티(PK·속성 수·관계 수·단계)·속성(FK 부모)·관계', () => {
  const t = docTables([cust, ord], rels)
  assert.deepEqual(t.ent.rows[0], ['고객', '고객기본', 'ECM_CST_CUST_M', '실체·기준', '핵심', '고객번호', 2, 1, '회원 <기본>'])
  assert.equal(t.ent.rows[1][4], '논리')
  const fk = t.attr.rows.find((r) => r[0] === '주문기본' && r[3] === '고객번호')!
  assert.equal(fk[9], '고객기본')
  assert.deepEqual(t.rel.rows[0], ['고객기본', '주문기본', '주문', '1:N', '비식별', 'N', 'Y', '고객이 주문'])
})

test('CSV : BOM·쉼표/따옴표 이스케이프, HTML : 이스케이프·3종 섹션', () => {
  const t = docTables([cust, ord], rels)
  const csv = docCsv(t.attr)
  assert.ok(csv.startsWith('﻿속성명'.slice(0, 1)))
  assert.ok(csv.includes('"성명, ""실명"""'))
  const html = docHtml('시험<프로젝트>', '2026-10-17 12:00:00', [t.ent, t.attr, t.rel])
  assert.ok(html.includes('시험&lt;프로젝트&gt;'))
  assert.ok(html.includes('회원 &lt;기본&gt;'))
  assert.equal((html.match(/<section>/g) ?? []).length, 3)
  assert.ok(!/<script/i.test(html))
})

test('CSV 수식 인젝션 방지 : =·+·-·@ 로 시작하는 문자열 앞에 따옴표, 숫자는 그대로 / 상한 초과 HTML 안내', () => {
  const csv = docCsv({ title: 't', headers: ['a', 'b', 'c'], rows: [['=HYPERLINK("x")', -1, '@cmd']] })
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`))
  assert.ok(csv.includes(',-1,'))
  assert.ok(csv.includes("'@cmd"))
  assert.ok(docHtml('p', 'now', [], true).includes('일부만 출력'))
})
