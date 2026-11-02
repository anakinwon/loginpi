'use client'

// 연결 요금제 조회 훅 — GET /api/plan?link= (piFetch). 같은 연결은 화면 사이에서 1번만(모듈 캐시 — 하단 메뉴 배지·요금제 화면 공용), 결제 뒤 reload
import { useCallback, useEffect, useState } from 'react'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import type { PaidPlan, PlanCd } from '@/lib/plan-rules'

export type PlanInfo = {
  cur: { plan: PlanCd; end: string | null; grace: boolean; aiMon: number; keepDays: number; clctDay: number | null }
  used: { ai: number; clct: number }
  bndl: boolean | null
  usdPerPi: number | null
  fees: { plan: PlanCd; prd: 'M' | 'Y'; months: number; krw: number; due: number | null; pi: string | null; aiMon: number; keepDays: number; clctDay: number | null }[]
  upgrades: { plan_cd: PaidPlan; prd: 'M' | 'Y'; krw: number; due: number | null; pi: string | null }[]
}

const cache = new Map<string, Promise<PlanInfo | null>>()
const load = (url: string) => {
  let p = cache.get(url)
  if (!p) {
    p = readApi<PlanInfo>(piFetch(url, { cache: 'no-store' })).then((r) => {
      if (!r.ok) cache.delete(url) // 실패(비로그인 등)는 다음에 다시
      return r.ok ? r.data : null
    })
    cache.set(url, p)
  }
  return p
}

// bndl = 묶음 할인 조회 포함(요금제 화면만 — schema.pi 호출 2초)
export function usePlanInfo(linkId: string | null, bndl = false) {
  const [info, setInfo] = useState<{ key: string; data: PlanInfo | null } | null>(null)
  const [n, setN] = useState(0)
  const url = linkId ? `/api/plan?link=${encodeURIComponent(linkId)}${bndl ? '&bndl=1' : ''}` : null
  useEffect(() => {
    if (!url) return
    let live = true
    void load(url).then((d) => live && setInfo({ key: url, data: d }))
    return () => {
      live = false
    }
  }, [url, n])
  const reload = useCallback(() => {
    for (const k of [...cache.keys()]) if (linkId && k.includes(linkId)) cache.delete(k)
    setN((v) => v + 1)
  }, [linkId])
  return { info: info && info.key === url ? info.data : null, loading: !!url && info?.key !== url, reload }
}
