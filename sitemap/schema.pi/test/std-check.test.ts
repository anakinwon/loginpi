// 표준 점검 규칙 엔진 검사(PRD §2.4 규칙 11종) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runCheck, type ChkDom, type ChkTerm, type ChkWord } from '../src/lib/std-check.ts'

const W = (id: string, nm: string, phy: string, o: Partial<ChkWord> = {}): ChkWord => ({ dic_id: id, dic_log_nm: nm, dic_phy_nm: phy, attr_clss_yn: 'N', forbid_yn: 'N', dic_eng_nm: null, key_dom_yn: 'N', ...o })
const words = [
  W('w1', '고객', 'CUST', { dic_eng_nm: 'Customer' }),
  W('w2', '번호', 'NO', { attr_clss_yn: 'Y', key_dom_yn: 'Y' }),
  W('w3', '명', 'NM', { attr_clss_yn: 'Y' }), // 대표도메인 미지정
  W('w4', '손님', 'GUEST', { dic_eng_nm: 'customer' }), // 5자·같은 영문 명·동의어 표기
  W('w5', '금지', 'BAN', { forbid_yn: 'Y' }),
]
const doms: ChkDom[] = [
  { dom_id: 'd1', dom_nm: '번호VC10', key_dom_nm: '번호', lgc_tp_abbr_nm: 'VC', data_len: 10, data_scale: null },
  { dom_id: 'd2', dom_nm: '명VC50', key_dom_nm: '명', lgc_tp_abbr_nm: 'VC', data_len: 100, data_scale: null }, // 이름 불일치·대표도메인 미지정
]
const T = (id: string, nm: string, phy: string, ids: string[], dom: string | null, nstd = 'N'): ChkTerm => ({ term_id: id, term_log_nm: nm, term_phy_nm: phy, dom_id: dom, nstd_yn: nstd, dic_ids: ids })
const terms = [
  T('t1', '고객번호', 'CUST_NO', ['w1', 'w2'], 'd1'), // 정상
  T('t2', '번호', 'NO', ['w2'], 'd1'), // 단일 단어
  T('t3', '번호', 'NO', ['w2'], 'd1', 'Y'), // 비표준 수용(제외)
  T('t4', '금지고객', 'BAN_CUST', ['w5', 'w1'], null), // 금칙어
  T('t5', '고객명칭', 'CUST_NM', ['w1', 'w3'], 'd1'), // 이름 불일치·끝 단어 ≠ 도메인
  T('t6', '고객명칭', 'CUST_NM', ['w1', 'w3'], 'd1', 'Y'), // 비표준 수용 : 끝 단어 ≠ 도메인이어도 T05 제외
]
const r = runCheck({ words, doms, terms, syns: ['손님'], sep: '_' })
const has = (rule: string, id: string) => r.violations.some((v) => v.rule === rule && v.id === id)

test('용어 규칙 T01~T05', () => {
  assert.ok(has('T01', 't2'))
  assert.ok(!has('T01', 't3'), '비표준 수용 용어 제외')
  assert.ok(has('T02', 't4'))
  assert.ok(has('T04', 't5'))
  assert.ok(has('T05', 't5'))
  assert.ok(!has('T05', 't6'), '비표준 수용 용어는 끝 단어 = 도메인 점검 제외')
  assert.ok(!r.violations.some((v) => v.id === 't1'), '정상 용어 위반 없음')
  assert.equal(r.nstd, 2)
})

test('도메인 규칙 D01·D02', () => {
  assert.ok(has('D01', 'd2'))
  assert.ok(has('D02', 'd2'))
  assert.ok(!has('D01', 'd1') && !has('D02', 'd1'))
})

test('단어 규칙 W01~W04', () => {
  assert.ok(has('W01', 'w4'))
  assert.ok(has('W02', 'w4') && !has('W02', 'w1'))
  assert.ok(has('W03', 'w1') && has('W03', 'w4'))
  assert.ok(has('W04', 'w4') && !has('W04', 'w1'))
})

test('준수율 : P1·P2 위반 대상만 차감, P3 제외', () => {
  const dic = r.summary.find((s) => s.tp === 'DIC')!
  assert.equal(dic.total, 5)
  assert.equal(dic.ok, 4) // w4 만 W01(P2)
  const dom = r.summary.find((s) => s.tp === 'DOM')!
  assert.deepEqual([dom.ok, dom.rate], [1, 50])
})

test('엔터티 분류어 규칙 E01·E02', () => {
  const ws = [W('e1', '이력', 'HSTRY', { ent_clss_yn: 'Y', tbl_sfx_txt: '_H' }), W('e2', '로그', 'LOG', { ent_clss_yn: 'Y' }), W('e3', '금지', 'BAN', { ent_clss_yn: 'Y', forbid_yn: 'Y', tbl_sfx_txt: '_X' })]
  const x = runCheck({ words: ws, doms: [], terms: [], syns: [], sep: '_' })
  const hit = (rule: string, id: string) => x.violations.some((v) => v.rule === rule && v.id === id)
  assert.ok(!hit('E01', 'e1') && hit('E01', 'e2'), '접미어 미지정 = E01')
  assert.ok(hit('E02', 'e3') && !hit('E02', 'e1'), '금칙어 엔터티 분류어 = E02')
  assert.equal(x.summary.find((s) => s.tp === 'DIC')!.ok, 2, 'E02(P2)만 준수율 차감')
})
