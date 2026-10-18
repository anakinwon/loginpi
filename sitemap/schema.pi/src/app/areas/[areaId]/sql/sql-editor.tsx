'use client'
// SQL 편집기 입력 칸(CodeMirror 6 + lang-sql, 2026-10-18) — PostgreSQL / PLSQL 방언 구문 강조·자동 완성(키워드 + 스키마 테이블·칼럼)
// 단축키(DBeaver 와 같게) : Ctrl+Enter = 현재 문장(선택 영역이 있으면 선택만), Alt+X = 스크립트 전체, Ctrl+/ = 주석(basicSetup), Ctrl+Space = 자동 완성
// 입력 중 예약어 대문자 : 단어 뒤에 공백·줄바꿈·; ( ) , 를 치면 직전 단어가 예약어일 때 대문자로(문자열·주석·식별자 제외, kwUpper)
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { keymap } from '@codemirror/view'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { PLSQL, PostgreSQL, sql } from '@codemirror/lang-sql'
import { kwUpper } from '@/lib/modelpi/sql-split'

export type EdState = { text: string; sel: string; from: number; to: number; cursor: number }
export type EdHandle = { get(): EdState; set(text: string): void; insert(text: string): void; select(from: number, to: number): void; focus(): void }
type Props = {
  initial: string
  dialect: 'PG' | 'ORA'
  tables: Record<string, string[]>
  schema?: string
  onChange(text: string): void
  onRun(script: boolean): void
}

const langOf = (p: Pick<Props, 'dialect' | 'tables' | 'schema'>) => sql({ dialect: p.dialect === 'ORA' ? PLSQL : PostgreSQL, schema: p.tables, defaultSchema: p.schema, upperCaseKeywords: true })

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
            ]),
          ),
          basicSetup,
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || !tr.isUserEvent('input') || tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop')) return tr // 타이핑만(붙여넣기·끌어 놓기 글은 그대로)
            const ins: { at: number; text: string }[] = []
            tr.changes.iterChanges((fA, tA, _fB, _tB, t) => void (fA === tA && ins.push({ at: fA, text: t.toString() })))
            if (ins.length !== 1 || !/^[\s;(),]/.test(ins[0].text)) return tr
            const k = kwUpper(tr.startState.sliceDoc(0, ins[0].at), cb.current.dialect)
            return k ? [tr, { changes: { from: k.from, to: k.to, insert: k.upper }, sequential: true }] : tr
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
  }))

  return <div ref={host} className="h-full overflow-hidden" />
})
export default SqlEditor
