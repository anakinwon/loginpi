'use client'
// 설문·Q&A 탭 공용(SubAgent4) — refresh 신호 묶어 읽기(SIGNAL_API 3.6 v1.3.1 : 1.5초 디바운스), 탭 배지, 서버 호출(piFetch — Pi Browser 는 쿠키가 없어 X-Pi-Token).
//  신호 계약 : app.send('refresh', {what:'polls'|'qna', kind?:'new'}) — 내용은 싣지 않고 '다시 읽어라'만(받는 쪽이 parseRefresh 로 검사, 맞지 않으면 버린다)
import { useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { featureStore, useStore, type AppMsg, type FeatureStore, type RoomCtx } from '../../extensions'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import { parseRefresh, type RefreshWhat } from '@/lib/engage-rules'
import { isUuid } from '@/lib/seminar-rules'

const DEBOUNCE_MS = 1500

type Slot = { ver: FeatureStore<number>; badge: FeatureStore<number>; seen: FeatureStore<boolean>; timer?: ReturnType<typeof setTimeout> }
const mk = (): Slot => ({ ver: featureStore(0), badge: featureStore(0), seen: featureStore(false) })
export const SLOTS: Record<RefreshWhat, Slot> = { polls: mk(), qna: mk() }
export const pollToast = featureStore(false) // 새 설문 알림(10초, [투표하기])

// 받은 refresh — 묶어서 1번만 다시 읽게 ver 를 올린다. 새 항목이면 탭이 안 보일 때 배지 +1
export function onRefresh(m: AppMsg) {
  if (m.topic !== 'refresh') return
  const r = parseRefresh(m.d)
  if (!r) return
  const s = SLOTS[r.what]
  if (r.isNew && !s.seen.get()) s.badge.set((n) => n + 1)
  // 낭독은 토스트(role=status, polite)가 맡는다 — announce 까지 쓰면 이중 낭독
  if (r.isNew && r.what === 'polls' && !s.seen.get()) pollToast.set(true)
  if (s.timer) return
  s.timer = setTimeout(() => {
    s.timer = undefined
    s.ver.set((v) => v + 1)
  }, DEBOUNCE_MS)
}

export function resetSlots() {
  for (const s of Object.values(SLOTS)) {
    if (s.timer) clearTimeout(s.timer)
    s.timer = undefined
    s.ver.reset()
    s.badge.reset()
    s.seen.reset()
  }
  pollToast.reset()
}

// 변경을 알린다 — 엔진이 app 을 모르면(구 엔진) 실패해도 그만(다른 사람은 탭을 열 때 다시 읽는다, 15.3)
export const tell = (ctx: RoomCtx, what: RefreshWhat, isNew = false) =>
  void ctx.sendApp('refresh', isNew ? { what, kind: 'new' } : { what })

export const engageable = (seminarId: string) => isUuid(seminarId) // 실험실 방(UUID 아님)은 서버 기록이 없다

export const api = <T>(path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: unknown) =>
  readApi<T>(
    piFetch(path, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

// 탭 목록 읽기 — 보일 때만 읽는다(숨은 탭은 신호가 와도 조회 0, 열 때 1번). 내 변경 뒤에는 reload()
export function useLoad<T>(url: string | null, visible: boolean, what: RefreshWhat) {
  const slot = SLOTS[what]
  const ver = useStore(slot.ver)
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState<ApiErrorBody | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    slot.seen.set(visible)
    if (visible) {
      slot.badge.set(0)
      if (what === 'polls') pollToast.set(false)
    }
  }, [visible, slot, what])
  useEffect(() => {
    if (!visible || !url) return
    let live = true
    void api<T>(url).then((r) => {
      if (!live) return
      if (r.ok) {
        setData(r.data)
        setErr(null)
      } else setErr(r.body)
    })
    return () => {
      live = false
    }
  }, [visible, url, ver, n])
  return { data, err, reload: () => setN((x) => x + 1) }
}
