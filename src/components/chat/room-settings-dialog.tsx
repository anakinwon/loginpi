'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// 카페 수정 다이얼로그 (방장 OWNER 전용)
// 공개/비밀 전환 · 비밀방 비밀번호 설정/변경/제거 · 이름 · 설명 · 정원

export interface RoomSettings {
  room_nm: string
  room_desc: string | null
  is_public_yn: 'Y' | 'N'
  max_mbr_cnt: number
  has_join_pwd: boolean
}

export function RoomSettingsDialog({
  roomId,
  initial,
  onSaved,
  onClose,
}: {
  roomId: string
  initial: RoomSettings
  onSaved: (next: RoomSettings) => void
  onClose: () => void
}) {
  const [roomNm, setRoomNm] = useState(initial.room_nm)
  const [roomDesc, setRoomDesc] = useState(initial.room_desc ?? '')
  const [isPublic, setIsPublic] = useState(initial.is_public_yn === 'Y')
  const [maxMbr, setMaxMbr] = useState(String(initial.max_mbr_cnt))
  // 비밀번호 입력: 빈 값이면 "변경 안 함"(기존 유지) — 명시적으로 바꿀 때만 입력
  const [newPwd, setNewPwd] = useState('')
  const [removePwd, setRemovePwd] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    const nm = roomNm.trim()
    if (!nm) {
      toast.error('방 이름을 입력해주세요')
      return
    }
    const cnt = Number(maxMbr)
    if (!Number.isInteger(cnt) || cnt < 2 || cnt > 1000) {
      toast.error('정원은 2~1000명이어야 합니다')
      return
    }
    if (!isPublic && newPwd && (newPwd.length < 4 || newPwd.length > 64)) {
      toast.error('비밀번호는 4~64자여야 합니다')
      return
    }

    // 비밀번호 처리 결정
    // - 공개방: 서버가 자동 제거 → join_pwd 생략
    // - 비밀방 + removePwd: null (제거)
    // - 비밀방 + newPwd 입력: 신규 설정
    // - 비밀방 + 입력 없음: 변경 안 함(undefined) → 키 자체를 보내지 않음
    const payload: Record<string, unknown> = {
      room_nm: nm,
      room_desc: roomDesc.trim() || null,
      is_public_yn: isPublic ? 'Y' : 'N',
      max_mbr_cnt: cnt,
    }
    if (!isPublic) {
      if (removePwd) payload.join_pwd = null
      else if (newPwd) payload.join_pwd = newPwd
    }

    setSaving(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        error?: string
        room?: { has_join_pwd: boolean }
      }
      if (!res.ok) {
        toast.error(data.error ?? '수정 실패')
        return
      }
      toast.success('카페 정보를 수정했습니다')
      onSaved({
        room_nm: nm,
        room_desc: roomDesc.trim() || null,
        is_public_yn: isPublic ? 'Y' : 'N',
        max_mbr_cnt: cnt,
        has_join_pwd: !!data.room?.has_join_pwd,
      })
    } catch {
      toast.error('수정 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background w-full max-w-sm rounded-2xl border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">⚙️ 카페 수정</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* 방 이름 */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              방 이름
            </label>
            <input
              value={roomNm}
              onChange={(e) => setRoomNm(e.target.value)}
              maxLength={100}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>

          {/* 방 설명 */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              방 설명 (선택)
            </label>
            <input
              value={roomDesc}
              onChange={(e) => setRoomDesc(e.target.value)}
              maxLength={500}
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>

          {/* 정원 */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              정원 (2~1000명)
            </label>
            <input
              type="number"
              value={maxMbr}
              onChange={(e) => setMaxMbr(e.target.value)}
              min="2"
              max="1000"
              className="w-28 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
          </div>

          {/* 공개/비밀 토글 */}
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {isPublic ? '🌐 공개방' : '🔒 비밀방'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {isPublic
                    ? '누구나 입장 가능 (마켓플레이스 노출)'
                    : '비밀번호를 아는 사람만 입장'}
                </p>
              </div>
              <button
                onClick={() => setIsPublic((p) => !p)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  isPublic ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                aria-label="공개 여부 전환"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    isPublic ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* 비밀방 비밀번호 — 비밀방일 때만 노출 */}
            {!isPublic && (
              <div className="mt-3 space-y-2 border-t pt-3">
                {initial.has_join_pwd && !removePwd && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    🔑 비밀번호가 설정되어 있습니다 (비우면 유지)
                  </p>
                )}
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => {
                    setNewPwd(e.target.value)
                    setRemovePwd(false)
                  }}
                  placeholder={
                    initial.has_join_pwd
                      ? '새 비밀번호 (변경 시에만 입력)'
                      : '입장 비밀번호 (4~64자)'
                  }
                  disabled={removePwd}
                  maxLength={64}
                  className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm disabled:opacity-50"
                />
                {initial.has_join_pwd && (
                  <label className="text-muted-foreground flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={removePwd}
                      onChange={(e) => {
                        setRemovePwd(e.target.checked)
                        if (e.target.checked) setNewPwd('')
                      }}
                    />
                    비밀번호 제거 (초대/방장만 입장 가능)
                  </label>
                )}
              </div>
            )}
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="bg-primary text-primary-foreground w-full rounded-lg py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
