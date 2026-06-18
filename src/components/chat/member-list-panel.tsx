'use client'
import { useEffect, useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'

// 카페 입장 멤버 목록 + online/offline 상태 패널.
// presence(접속) 판정은 useChatRoom의 onlineUserIds(Supabase Realtime Presence)를 그대로 사용 —
// 별도 폴링 없이 실시간 동기화된 접속자 집합을 멤버 명단과 대조해 점등한다.
// 멤버 명단은 /members(가입자 전체)로 1회 로드 → 접속 여부로 재정렬(접속자 우선).

interface Member {
  usr_id: string
  display_nm: string
  mbr_role_cd: string
}

export function MemberListPanel({
  roomId,
  currentUserId,
  onlineUserIds,
  onClose,
}: {
  roomId: string
  currentUserId: string
  onlineUserIds: string[]
  onClose: () => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    piFetch(`/api/chat/rooms/${roomId}/members`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { members?: Member[] } | null) => {
        if (!cancelled) setMembers(d?.members ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roomId])

  const onlineSet = new Set(onlineUserIds)
  // 접속자 우선 → 같은 상태면 방장(OWNER) 우선 → 그 외 가입 순(서버 정렬 유지)
  const sorted = [...members].sort((a, b) => {
    const ao = onlineSet.has(a.usr_id) ? 1 : 0
    const bo = onlineSet.has(b.usr_id) ? 1 : 0
    if (ao !== bo) return bo - ao
    const aOwner = a.mbr_role_cd === 'OWNER' ? 1 : 0
    const bOwner = b.mbr_role_cd === 'OWNER' ? 1 : 0
    return bOwner - aOwner
  })
  const onlineCount = members.filter((m) => onlineSet.has(m.usr_id)).length

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center p-4 sm:bottom-4">
      <div className="bg-background/95 w-full max-w-sm rounded-2xl border p-5 shadow-xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">
            👥 카페 멤버{' '}
            <span className="text-muted-foreground font-normal">
              (접속 {onlineCount} / 전체 {members.length})
            </span>
          </p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            멤버를 불러오는 중…
          </p>
        ) : members.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            아직 멤버가 없습니다.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {sorted.map((m) => {
              const isOnline = onlineSet.has(m.usr_id)
              const isMe = m.usr_id === currentUserId
              const isOwner = m.mbr_role_cd === 'OWNER'
              return (
                <li
                  key={m.usr_id}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {/* 접속 상태 점 — 초록(접속)/회색(미접속) */}
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        isOnline
                          ? 'bg-green-500 ring-2 ring-green-500/30'
                          : 'bg-muted-foreground/30'
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">
                      {isOwner && <span className="mr-0.5">👑</span>}
                      {m.display_nm}
                      {isMe && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (나)
                        </span>
                      )}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[10px] ${
                      isOnline
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isOnline ? '접속 중' : '오프라인'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
