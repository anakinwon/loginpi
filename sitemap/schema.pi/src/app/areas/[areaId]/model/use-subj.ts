'use client'
// 주제영역 선택(마스터 지시 2026-10-17) — 논리·물리 화면 목록을 선택한 주제영역 1개로 한정, 프로젝트별 선택을 두 화면이 공유(localStorage)
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'

export interface Subj {
  subj_id: string
  subj_nm: string
}

export function useSubj(api: string, prjId: string) {
  const [subjs, setSubjs] = useState<Subj[]>([])
  const [subjId, setSubjIdRaw] = useState('')
  const key = `model-subj-${prjId}`
  useEffect(() => {
    setSubjs([])
    setSubjIdRaw('')
    if (!prjId) return
    let live = true
    piFetch(`${api}/subjects`)
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j.ok) return
        const list: Subj[] = j.items.filter((s: { prj_id: string }) => s.prj_id === prjId)
        let keep: string | null = null
        try {
          keep = window.localStorage.getItem(key)
        } catch {}
        setSubjs(list)
        setSubjIdRaw(list.find((s) => s.subj_id === keep)?.subj_id ?? list[0]?.subj_id ?? '')
      })
    return () => {
      live = false
    }
  }, [api, prjId, key])
  const setSubjId = useCallback(
    (id: string) => {
      setSubjIdRaw(id)
      try {
        window.localStorage.setItem(key, id)
      } catch {}
    },
    [key],
  )
  return { subjs, subjId, setSubjId }
}
