'use client'
// SQL 편집기 탭(마스터 지시 2026-10-20) — 계정별(분류체계 × 사용자) 서버 저장 탭, 상한 = 요금제(서버 강제, 409 SQL_TAB_LIMIT)
//  저장 = 바뀐 탭만 PATCH : 1분마다 자동 · 실행 때 · 탭 전환 직전 · 화면 떠날 때(visibilitychange hidden·pagehide·화면 이동, keepalive)
//  충돌 = 마지막 저장 우선(서버). 내용은 ref(texts)에 두고 화면 갱신은 탭 목록·바뀜 표시·저장 상태 바뀔 때만(입력마다 다시 그리지 않음)
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PLAN_NM, type PlanCd } from '@/lib/roles'

interface Tab {
  sql_tab_id: string
  tab_nm: string
}
type SaveSt = { st: 'idle' } | { st: 'saving' } | { st: 'ok'; at: string } | { st: 'err' }
const AUTO_MS = 60_000
const KEEPALIVE_MAX = 60_000 // 한 번 떠날 때 keepalive 본문 합계 예산(UTF-8 바이트, 브라우저 한도 64KB) — 넘는 탭은 일반 요청(떠날 때 끊길 수 있음)
const JSON_H = { 'content-type': 'application/json' }
const errText = (j: { message?: string; detail?: unknown }) => `${j.message ?? '요청이 실패했습니다'}${typeof j.detail === 'string' ? ` — ${j.detail}` : ''}`

export function useSqlTabs(api: string, setMsg: (m: string) => void, setDenied: (v: boolean) => void) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [cur, setCurS] = useState('')
  const [limit, setLimit] = useState(0)
  const [plan, setPlan] = useState<PlanCd>('FREE')
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [save, setSave] = useState<SaveSt>({ st: 'idle' })
  const texts = useRef<Record<string, string>>({}) // 탭별 지금 내용
  const saved = useRef<Record<string, string>>({}) // 탭별 서버에 마지막으로 저장한 내용
  const saving = useRef(new Set<string>())
  const again = useRef(new Set<string>()) // 저장 진행 중 다시 저장 요청된 탭
  const kaLeft = useRef(KEEPALIVE_MAX)
  const legacyRef = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)
  const loaded = useRef(false)
  const adding = useRef(false)
  const curRef = useRef('')

  const syncDirty = useCallback(() => setDirty(new Set(Object.keys(texts.current).filter((id) => texts.current[id] !== saved.current[id]))), [])
  const setCur = useCallback((id: string) => ((curRef.current = id), setCurS(id)), [])
  // keepalive 는 진행 중 keepalive 본문 합계 64KB(UTF-8 바이트) 한도 — 예산 안이면 keepalive, 넘거나 거부(TypeError)되면 일반 요청
  const send = useCallback(async (url: string, init: RequestInit, keepalive: boolean) => {
    const n = keepalive ? new TextEncoder().encode(String(init.body ?? '')).length : 0
    const ka = keepalive && n <= kaLeft.current
    if (ka) kaLeft.current -= n
    try {
      return await piFetch(url, { ...init, keepalive: ka })
    } catch (e) {
      if (ka && e instanceof TypeError) return piFetch(url, init)
      throw e
    }
  }, [])
  // 한 탭 저장 — 바뀌지 않았으면 건너뜀. 그 탭 저장이 진행 중이면 끝난 뒤 다시 저장(떠날 때 keepalive 는 기다리지 않고 바로 — 마지막 저장 우선)
  //  성공하면 보낸 내용 기준으로 바뀜 해제(저장 중 더 고친 내용은 계속 바뀜). 404 = 다른 창·기기에서 닫힘 → 지금 내용으로 새 탭을 만들어 옮김(유실 방지)
  const saveTab = useCallback(
    async (id: string, keepalive = false): Promise<void> => {
      const t = texts.current[id]
      if (t == null || t === saved.current[id]) return
      if (saving.current.has(id) && !keepalive) return void again.current.add(id)
      saving.current.add(id)
      setSave({ st: 'saving' })
      try {
        const r = await send(`${api}/sql/tabs/${id}`, { method: 'PATCH', headers: JSON_H, body: JSON.stringify({ sql_txt: t }) }, keepalive)
        const j = await r.json()
        if (texts.current[id] == null) return // 저장 중 탭을 닫음
        if (r.status === 404) {
          const c = await (await send(`${api}/sql/tabs`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ sql_txt: t }) }, keepalive)).json()
          if (!c.ok) return (setSave({ st: 'err' }), setMsg(`다른 곳에서 닫힌 탭을 다시 만들지 못했습니다 — ${errText(c)}`))
          const nid: string = c.item.sql_tab_id
          ;(texts.current[nid] = texts.current[id]), (saved.current[nid] = t)
          delete texts.current[id], delete saved.current[id]
          setTabs((x) => x.map((y) => (y.sql_tab_id === id ? { sql_tab_id: nid, tab_nm: c.item.tab_nm } : y)))
          if (curRef.current === id) setCur(nid)
          syncDirty()
          setSave({ st: 'ok', at: c.item.mod_dtm ?? new Date().toISOString() })
          return setMsg(`다른 곳에서 닫힌 탭이라 지금 내용을 새 탭 '${c.item.tab_nm}'(으)로 저장했습니다`)
        }
        if (!j.ok) return (setSave({ st: 'err' }), setMsg(`탭 저장 실패 — ${errText(j)}`))
        saved.current[id] = t
        syncDirty()
        setSave({ st: 'ok', at: j.item?.mod_dtm ?? new Date().toISOString() })
      } catch {
        setSave({ st: 'err' })
      } finally {
        saving.current.delete(id)
        if (again.current.delete(id)) void saveTab(id)
      }
    },
    [api, send, setCur, setMsg, syncDirty],
  )
  const saveAll = useCallback(
    (keepalive = false) => {
      if (keepalive) kaLeft.current = KEEPALIVE_MAX
      return Promise.all(Object.keys(texts.current).map((id) => saveTab(id, keepalive)))
    },
    [saveTab],
  )

  // 1분 자동 저장(진행 중 저장이 있으면 이번 차례 건너뜀) + 화면 떠날 때 저장(Pi Browser 는 쿠키가 없어 sendBeacon 대신 piFetch keepalive — 헤더 인증)
  useEffect(() => {
    const iv = window.setInterval(() => void (!saving.current.size && saveAll()), AUTO_MS)
    const onHide = () => void (document.visibilityState === 'hidden' && saveAll(true))
    const onPageHide = () => void saveAll(true)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void saveAll(true) // 사이트 안 이동(메뉴·링크)은 pagehide 가 없음
    }
  }, [saveAll])

  const add1 = useCallback(
    async (sql_txt: string): Promise<Tab | null> => {
      const j = await (await piFetch(`${api}/sql/tabs`, { method: 'POST', headers: JSON_H, body: JSON.stringify({ sql_txt }) })).json()
      if (!j.ok) return (setMsg(errText(j)), null)
      texts.current[j.item.sql_tab_id] = saved.current[j.item.sql_tab_id] = j.item.sql_txt ?? sql_txt
      return { sql_tab_id: j.item.sql_tab_id, tab_nm: j.item.tab_nm }
    },
    [api, setMsg],
  )

  // 처음 1회 — 탭이 없으면 1개 만들고 이 브라우저 초안(legacy, 접속별 localStorage)을 옮김. 실패하면 '다시 불러오기'(탭 막대)·접속 변경 때 다시 시도
  const load = useCallback(
    async (legacy: string | null) => {
      if (loaded.current) return
      loaded.current = true
      legacyRef.current = legacy
      setFailed(false)
      const fail = (m: string) => ((loaded.current = false), setFailed(true), setMsg(m))
      try {
        const r = await piFetch(`${api}/sql/tabs`)
        if (r.status === 403) return setDenied(true)
        const j = await r.json()
        if (!j.ok) return fail(`SQL 탭을 불러오지 못했습니다 — ${errText(j)}`)
        setLimit(j.limit), setPlan(j.plan)
        let items: Tab[] = (j.items as (Tab & { sql_txt: string })[]).map((x) => {
          texts.current[x.sql_tab_id] = saved.current[x.sql_tab_id] = x.sql_txt ?? ''
          return { sql_tab_id: x.sql_tab_id, tab_nm: x.tab_nm }
        })
        if (!items.length) {
          const t = await add1(legacy ?? 'SELECT 1;\n')
          if (!t) return fail('첫 SQL 탭을 만들지 못했습니다')
          items = [t]
        }
        setTabs(items)
        if (items[0]) setCur(items[0].sql_tab_id)
      } catch {
        fail('SQL 탭을 불러오지 못했습니다(네트워크)')
      }
    },
    [api, add1, setCur, setDenied, setMsg],
  )

  // 편집 — 바뀜 표시가 달라질 때만 화면 갱신
  const edit = useCallback(
    (id: string, t: string) => {
      const was = texts.current[id] !== saved.current[id]
      texts.current[id] = t
      if (was !== (t !== saved.current[id])) syncDirty()
    },
    [syncDirty],
  )
  const switchTo = (id: string) => {
    if (id === curRef.current) return
    void saveTab(curRef.current)
    setCur(id)
  }
  // 새 탭(text = 처음 내용, 예: 객체 편집기 DDL) — 만들었으면 true
  const add = async (text = ''): Promise<boolean> => {
    if (adding.current) return false
    adding.current = true
    try {
      void saveTab(curRef.current)
      const t = await add1(text)
      if (t) setTabs((x) => [...x, t]), setCur(t.sql_tab_id)
      return !!t
    } catch {
      setMsg('탭을 만들지 못했습니다(네트워크)')
      return false
    } finally {
      adding.current = false
    }
  }
  // 닫기 = 논리 삭제, 마지막 탭이면 새 빈 탭(항상 1개 이상)
  const close = async (tab: Tab) => {
    if (!window.confirm(`'${tab.tab_nm}' 탭을 닫을까요? 탭 내용은 지워집니다.`)) return
    try {
      const j = await (await piFetch(`${api}/sql/tabs/${tab.sql_tab_id}`, { method: 'DELETE' })).json()
      if (!j.ok) return setMsg(errText(j))
      delete texts.current[tab.sql_tab_id], delete saved.current[tab.sql_tab_id]
      syncDirty()
      const i = tabs.findIndex((x) => x.sql_tab_id === tab.sql_tab_id)
      let rest = tabs.filter((x) => x.sql_tab_id !== tab.sql_tab_id)
      if (!rest.length) {
        const t = await add1('')
        rest = t ? [t] : []
      }
      setTabs(rest)
      if (curRef.current === tab.sql_tab_id || !rest.length) setCur(rest[Math.min(i, rest.length - 1)]?.sql_tab_id ?? '')
    } catch {
      setMsg('탭을 닫지 못했습니다(네트워크)')
    }
  }
  const rename = async (tab: Tab) => {
    const nm = window.prompt('탭 이름(글자·숫자·_ - . 공백, 50자까지)', tab.tab_nm)?.trim()
    if (!nm || nm === tab.tab_nm) return
    try {
      const j = await (await piFetch(`${api}/sql/tabs/${tab.sql_tab_id}`, { method: 'PATCH', headers: JSON_H, body: JSON.stringify({ tab_nm: nm }) })).json()
      if (!j.ok) return setMsg(errText(j))
      setTabs((x) => x.map((y) => (y.sql_tab_id === tab.sql_tab_id ? { ...y, tab_nm: j.item?.tab_nm ?? nm } : y)))
    } catch {
      setMsg('탭 이름을 바꾸지 못했습니다(네트워크)')
    }
  }

  const full = tabs.length >= limit
  // 탭 줄 — extra = 같은 줄 뒤에 붙는 객체 탭(sql-obj), sqlActive = false 면 SQL 탭 강조 해제, onPick = SQL 탭(·+)을 눌러 SQL 쪽으로 돌아올 때
  const bar = ({ extra, sqlActive = true, onPick }: { extra?: ReactNode; sqlActive?: boolean; onPick?: () => void } = {}) => (
    <div className="flex shrink-0 items-end gap-2 border-b bg-gray-50 px-1 pt-1 text-xs" aria-label="SQL 탭">
      <div role="tablist" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden">
        {tabs.map((t) => {
          const on = sqlActive && t.sql_tab_id === cur
          return (
            <span key={t.sql_tab_id} className={`flex shrink-0 items-center rounded-t border ${on ? '-mb-px border-b-white bg-white font-semibold' : 'bg-gray-100 hover:bg-white'}`}>
              <button type="button" role="tab" aria-selected={on} onClick={() => (on ? void rename(t) : (onPick?.(), switchTo(t.sql_tab_id)))} title={on ? '한 번 더 누르면 이름 바꾸기' : '탭 열기(열린 탭을 한 번 더 누르면 이름 바꾸기)'} className="py-0.5 pl-2 font-mono whitespace-nowrap">
                {t.tab_nm}
                {dirty.has(t.sql_tab_id) && <span className="text-amber-600" aria-label="저장 안 된 변경"> ●</span>}
              </button>
              <button type="button" onClick={() => void close(t)} className="min-h-6 min-w-6 px-1.5 py-0.5 text-gray-500 hover:text-red-700" aria-label={`${t.tab_nm} 탭 닫기`} title="탭 닫기">
                ×
              </button>
            </span>
          )
        })}
        {extra}
        {failed && (
          <button type="button" className="mb-0.5 shrink-0 text-red-700 underline" onClick={() => void load(legacyRef.current)}>
            탭 다시 불러오기
          </button>
        )}
        <button type="button" className="mb-0.5 flex h-5 w-6 shrink-0 items-center justify-center rounded border border-[#1a3159] bg-[#1f3a68] text-sm leading-none font-bold text-white shadow-sm hover:bg-[#2b4c84] disabled:cursor-not-allowed disabled:opacity-40" disabled={full || !tabs.length} onClick={() => void add().then((ok) => ok && onPick?.())} aria-label="새 탭" title={full ? `요금제(${PLAN_NM[plan]}) 상한 ${limit}개 — 탭을 닫거나 요금제를 올리십시오` : `새 탭(요금제 ${PLAN_NM[plan]} 상한 ${limit}개)`}>
          +
        </button>
      </div>
      <span className="mb-0.5 shrink-0 whitespace-nowrap text-gray-500">
        <span title={`요금제(${PLAN_NM[plan]}) 상한`}>
          {tabs.length}/{limit}
        </span>
        {' · '}
        {save.st === 'saving' ? (
          '저장 중…'
        ) : save.st === 'err' ? (
          <button type="button" className="text-red-700 underline" onClick={() => void saveAll()}>
            저장 실패 — 다시 시도
          </button>
        ) : save.st === 'ok' ? (
          `저장됨 ${new Date(save.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
        ) : dirty.size ? (
          '저장 전'
        ) : (
          '자동 저장 1분'
        )}
      </span>
    </div>
  )
  return { cur, bar, load, edit, saveTab, add, full, text: (id: string) => texts.current[id] ?? '' }
}
