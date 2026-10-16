'use client'
import { piFetch } from '@pi/auth/client'
// 분류체계 목록·생성(클라이언트) — /api/areas
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ROLE_NM, type MbrRole } from '@/lib/roles'

interface Area {
  area_id: string
  area_nm: string
  area_desc: string | null
  role: string
}

export default function AreaHome() {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [msg, setMsg] = useState('')
  const [nm, setNm] = useState('')
  const [desc, setDesc] = useState('')

  const load = async () => {
    const j = await (await piFetch('/api/areas')).json()
    if (!j.ok) {
      setMsg(j.message)
      setAreas([])
      return
    }
    setAreas(j.areas)
  }
  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const r = await piFetch('/api/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_nm: nm, area_desc: desc || undefined }),
    })
    const j = await r.json()
    setMsg(j.ok ? `분류체계 ${j.area.area_nm} 생성` : j.message)
    if (j.ok) {
      setNm('')
      setDesc('')
      load()
    }
  }

  return (
    <section className="mt-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">내 표준분류체계</h2>
        {areas === null ? (
          <p className="mt-2 text-sm text-gray-500">불러오는 중</p>
        ) : areas.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">참여 중인 분류체계가 없습니다</p>
        ) : (
          <ul className="mt-3 divide-y rounded border">
            {areas.map((a) => (
              <li key={a.area_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium">{a.area_nm}</p>
                  {a.area_desc && <p className="text-xs text-gray-500">{a.area_desc}</p>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{ROLE_NM[a.role as MbrRole] ?? a.role}</span>
                  {/* 화면별 메뉴는 분류체계 안 하단 고정 바(areas/[areaId]/area-nav.tsx) */}
                  <Link href={`/areas/${a.area_id}/words`} className="text-blue-700 underline">
                    열기
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={create} className="space-y-2 rounded border p-4">
        <h3 className="font-semibold">새 분류체계</h3>
        <input value={nm} onChange={(e) => setNm(e.target.value)} placeholder="분류체계명(필수)" className="w-full rounded border px-3 py-2 text-sm" required maxLength={200} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" className="w-full rounded border px-3 py-2 text-sm" maxLength={4000} />
        <button className="rounded bg-gray-800 px-4 py-2 text-sm text-white">생성</button>
      </form>
      {msg && (
        <p role="status" className="text-sm text-gray-700">
          {msg}
        </p>
      )}
    </section>
  )
}
