'use client'
// SQL 편집기 입력 칸(CodeMirror 6 + lang-sql, 2026-10-18) — PostgreSQL / PLSQL 방언 구문 강조·자동 완성(키워드 + 스키마 테이블·칼럼)
// 단축키(DBeaver 와 같게) : Ctrl+Enter = 현재 문장(선택 영역이 있으면 선택만), Alt+X = 스크립트 전체, Ctrl+/ = 주석(basicSetup), Ctrl+Space = 자동 완성
// 입력 중 예약어 대문자 : 단어 뒤에 공백·줄바꿈·; ( ) , 를 치면 직전 단어가 예약어일 때 대문자로(문자열·주석·식별자 제외, kwUpper)
// 들여쓰기(마스터 지시 2026-10-18, 강 정렬 — sql-format) : 줄 맨 앞 절 키워드 뒤 공백·Enter·( 를 치면 키워드 끝을 6열에, 줄 맨 앞 , 는 6열·; 는 2칸,
//  Enter = 키워드·쉼표 줄 다음은 내용 열(7), Ctrl+Shift+F·정렬 버튼 = 선택 영역(없으면 커서 문장) 다시 배치
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { PLSQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { kwUpper, splitSql, stmtAt } from '@/lib/modelpi/sql-split'
import { commaIndent, contIndent, riverFormat, riverIndent } from '@/lib/modelpi/sql-format'

export type EdState = { text: string; sel: string; from: number; to: number; cursor: number }
export type EdHandle = { get(): EdState; set(text: string): void; insert(text: string): void; select(from: number, to: number): void; focus(): void; format(): void }
type Props = {
  initial: string
  dialect: 'PG' | 'ORA'
  tables: Record<string, string[]>
  schema?: string
  onChange(text: string): void
  onRun(script: boolean): void
}

const langOf = (p: Pick<Props, 'dialect' | 'tables' | 'schema'>) => sql({ dialect: p.dialect === 'ORA' ? PLSQL : PostgreSQL, schema: p.tables, defaultSchema: p.schema, upperCaseKeywords: true })

// 선택 영역(없으면 커서가 든 문장 + 뒤 ;)을 강 정렬로 다시 배치
function formatAt(v: EditorView, d: 'PG' | 'ORA') {
  const s = v.state, r = s.selection.main
  let from = r.from, to = r.to
  if (r.empty) {
    const st = stmtAt(splitSql(s.doc.toString(), d), r.head)
    if (!st) return false
    from = st.from
    to = st.to
    const semi = /^\s*;/.exec(s.sliceDoc(to, to + 200))
    if (semi) to += semi[0].length
  }
  const out = riverFormat(s.sliceDoc(from, to), d)
  if (out !== s.sliceDoc(from, to)) v.dispatch({ changes: { from, to, insert: out }, selection: { anchor: from + out.length }, userEvent: 'format', scrollIntoView: true })
  return true
}

const SqlEditor = forwardRef<EdHandle, Props>(function SqlEditor(p, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const lang = useRef(new Compartment())
  const cb = useRef(p)
  useEffect(() => {
    cb.current = p
  })

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: cb.current.initial,
        extensions: [
          Prec.highest(
            keymap.of([
              { key: 'Mod-Enter', run: () => (cb.current.onRun(false), true) },
              { key: 'Alt-x', run: () => (cb.current.onRun(true), true) },
              { key: 'Mod-Shift-f', run: (v) => formatAt(v, cb.current.dialect) },
            ]),
          ),
          // Enter — 자동 완성 목록(최우선)보다 낮고 기본 Enter 보다 높게
          Prec.high(
            keymap.of([
              {
                key: 'Enter',
                run: (v) => {
                  const r = v.state.selection.main
                  if (!r.empty) return false
                  const line = v.state.doc.lineAt(r.head)
                  const pad = ' '.repeat(contIndent(v.state.sliceDoc(line.from, r.head)))
                  v.dispatch({ changes: { from: r.head, insert: '\n' + pad }, selection: { anchor: r.head + 1 + pad.length }, userEvent: 'input', scrollIntoView: true })
                  return true
                },
              },
            ]),
          ),
          basicSetup,
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || !tr.isUserEvent('input') || tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop')) return tr // 타이핑만(붙여넣기·끌어 놓기 글은 그대로)
            const ins: { at: number; text: string }[] = []
            tr.changes.iterChanges((fA, tA, _fB, _tB, t) => void (fA === tA && ins.push({ at: fA, text: t.toString() })))
            if (ins.length !== 1 || !/^[\s;(),]/.test(ins[0].text)) return tr
            const { at, text } = ins[0]
            const line = tr.startState.doc.lineAt(at), before = tr.startState.sliceDoc(line.from, at)
            const changes: { from: number; to: number; insert: string }[] = []
            // 줄 맨 앞 절 키워드 한 낱말 뒤 공백·줄바꿈·( → 강 정렬, 빈 줄 맨 앞 , ; → 정렬
            // 쉼표는 위 절 줄의 내용 열 − 2(위로 200줄까지 찾음)
            const above = () => { const d = tr.startState.doc, a: string[] = []; for (let n = Math.max(1, line.number - 200); n < line.number; n++) a.push(d.line(n).text); return a }
            const lead = /^\s*[A-Za-z]+$/.test(before) && /^[\s(]/.test(text) ? riverIndent(before) : /^\s*$/.test(before) && text === ',' ? commaIndent(above()) : /^\s*$/.test(before) && text === ';' ? riverIndent(';') : null
            const curLead = before.length - before.trimStart().length
            if (lead != null && lead !== curLead) changes.push({ from: line.from, to: line.from + curLead, insert: ' '.repeat(lead) })
            const k = kwUpper(tr.startState.sliceDoc(0, at), cb.current.dialect)
            if (k) changes.push({ from: k.from, to: k.to, insert: k.upper })
            return changes.length ? [tr, { changes, sequential: true }] : tr
          }),
          lang.current.of(langOf(cb.current)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current.onChange(u.state.doc.toString())
          }),
          EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { fontFamily: 'ui-monospace, Consolas, monospace' } }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
  }, [])

  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(langOf(p)) })
  }, [p.dialect, p.tables, p.schema]) // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    get() {
      const s = view.current!.state, r = s.selection.main
      return { text: s.doc.toString(), sel: s.sliceDoc(r.from, r.to), from: r.from, to: r.to, cursor: r.head }
    },
    set(text) {
      const v = view.current!
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } })
    },
    insert(text) {
      const v = view.current!, r = v.state.selection.main
      v.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length } })
      v.focus()
    },
    select(from, to) {
      const v = view.current!
      v.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
    },
    focus() {
      view.current?.focus()
    },
    format() {
      const v = view.current!
      formatAt(v, cb.current.dialect)
      v.focus()
    },
  }))

  return <div ref={host} className="h-full overflow-hidden" />
})
export default SqlEditor
