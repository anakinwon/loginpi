'use client'
import { useState, useEffect, useCallback } from 'react'
import { useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useChatRoom, type ChatMessage } from '@/hooks/use-chat-room'
import { piFetch } from '@/lib/pi-fetch'
import { ChatMessageList } from './chat-message-list'
import { ChatInput } from './chat-input'
import { ChatLocaleSelect } from './chat-locale-select'
import { InlinePurchasePrompt } from './inline-purchase-prompt'
import { BadgeAwardPopup, type BadgeAwardInfo } from './badge-award-popup'
import { RoomSettingsDialog, type RoomSettings } from './room-settings-dialog'
import { VoiceChannelPanel, RemoteAudio } from './voice-channel-panel'
import { MemberListPanel } from './member-list-panel'
import { useVoiceChannel } from '@/hooks/use-voice-channel'

interface ChatRoomPanelProps {
  roomId: string
  initialMessages: ChatMessage[]
  currentUserId: string
  currentUserDisplayName: string
  roomNm: string
  roomDesc?: string | null
  themeEmoji?: string
  themeCd?: string
  capacityAlert?: boolean
}

interface MyBadge extends BadgeAwardInfo {
  upgr_yn: 'Y' | 'N'
  noti_yn: 'Y' | 'N'
}

// 방별 번역 언어 localStorage 키 — 카페룸은 독립 공간이므로 방마다 따로 저장
const viewLocaleKey = (roomId: string) => `chat_view_locale:${roomId}`

export function ChatRoomPanel({
  roomId,
  initialMessages,
  currentUserId,
  currentUserDisplayName,
  roomNm,
  roomDesc,
  themeEmoji = '💬',
  themeCd,
  capacityAlert = false,
}: ChatRoomPanelProps) {
  const urlLocale = useLocale()
  // '' = 자동 (URL locale 기준 수신 번역만) / locale 코드 = 이 방 전체 강제 번역
  const [viewLocale, setViewLocale] = useState('')
  const [canTip, setCanTip] = useState(false)
  // 구독 확인 전까지 false(fail-closed) — 비구독자가 짧은 틈에 강제 번역 사용하는 것 방지
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [tipPromptOpen, setTipPromptOpen] = useState(false)
  const [expirePromptOpen, setExpirePromptOpen] = useState(false)
  const [aiLimitPromptOpen, setAiLimitPromptOpen] = useState(false)
  const [expireBannerDismissed, setExpireBannerDismissed] = useState(false)
  // TASK-062 Trigger 7: 배지 수여 축하 팝업 + 강화 배지 헤더 상시 표시
  const [badgeAward, setBadgeAward] = useState<BadgeAwardInfo | null>(null)
  const [upgradedBadge, setUpgradedBadge] = useState<BadgeAwardInfo | null>(
    null,
  )
  // 방장 전용 카페 수정 — 방 메타 조회 후 OWNER일 때만 버튼 노출
  const [isOwner, setIsOwner] = useState(false)
  const [roomSettings, setRoomSettings] = useState<RoomSettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 헤더 제목은 수정 결과를 즉시 반영 (서버 재조회 없이)
  const [displayRoomNm, setDisplayRoomNm] = useState(roomNm)
  // PiVoice™ v2.0 — 음성채널 패널 표시 + 방장 마이크 제어 권한
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  // 카페 입장 멤버 목록(online/offline) 패널
  const [memberPanelOpen, setMemberPanelOpen] = useState(false)
  const [canControlMic, setCanControlMic] = useState(false)
  const [displayRoomDesc, setDisplayRoomDesc] = useState<string | null>(
    roomDesc ?? null,
  )

  // 방 입장 시 이 방에 저장된 번역 언어 복원 (외부 저장소 구독 — 방별 독립)
  useEffect(() => {
    try {
      setViewLocale(localStorage.getItem(viewLocaleKey(roomId)) ?? '')
    } catch {}
  }, [roomId])

  const handleLocaleChange = useCallback(
    (cd: string) => {
      setViewLocale(cd)
      try {
        if (cd) localStorage.setItem(viewLocaleKey(roomId), cd)
        else localStorage.removeItem(viewLocaleKey(roomId))
      } catch {}
    },
    [roomId],
  )

  const checkSubscription = useCallback(() => {
    piFetch('/api/subscriptions/check')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { canTip?: boolean; tier?: string } | null) => {
        if (d?.canTip) setCanTip(true)
        if (d?.tier && d.tier !== 'FREE') setIsSubscribed(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    checkSubscription()
  }, [checkSubscription])

  // PiVoice™ v3.0 — N:N 음성채널 훅 (방장 보장 + 멤버 자동 2/승인 2)
  const {
    voiceState,
    participants: voiceParticipants,
    remoteStreams,
    isMuted,
    micState,
    joinError,
    join: joinVoice,
    leave: leaveVoice,
    toggleMute,
    controlMic,
    requestMic,
  } = useVoiceChannel({ roomId, currentUserId })

  // 방 메타 조회 — 방장(OWNER)이고 그룹/이벤트방이면 수정 버튼 노출
  useEffect(() => {
    piFetch(`/api/chat/rooms/${roomId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            myRole?: string
            room?: {
              room_nm: string
              room_desc: string | null
              is_public_yn: 'Y' | 'N'
              max_mbr_cnt: number
              has_join_pwd: boolean
              room_tp_cd: string
            }
          } | null,
        ) => {
          if (!d?.room) return
          // 방장(OWNER/ADMIN)은 음성채널 마이크 원격 제어 가능 — 서버가 재검증
          if (d.myRole === 'OWNER' || d.myRole === 'ADMIN')
            setCanControlMic(true)
          if (d.myRole === 'OWNER' && d.room.room_tp_cd !== 'D') {
            setIsOwner(true)
            setRoomSettings({
              room_nm: d.room.room_nm,
              room_desc: d.room.room_desc,
              is_public_yn: d.room.is_public_yn,
              max_mbr_cnt: d.room.max_mbr_cnt,
              has_join_pwd: d.room.has_join_pwd,
            })
          }
        },
      )
      .catch(() => {})
  }, [roomId])

  const onUpgradeForTip = useCallback(() => setTipPromptOpen(true), [])
  const onAiLimitExceeded = useCallback(() => setAiLimitPromptOpen(true), [])

  // 팝업을 봤다는 표시 — 다음 방문 시 중복 표시 방지
  const markBadgeNotified = useCallback((badgeId: string) => {
    piFetch(`/api/badges/${badgeId}`, { method: 'PATCH' }).catch(() => {})
  }, [])

  // 실시간 수여 broadcast 수신 → 축하 팝업 (Trigger 7)
  const onBadgeAward = useCallback(
    (badge: BadgeAwardInfo) => {
      setBadgeAward(badge)
      markBadgeNotified(badge.badge_id)
    },
    [markBadgeNotified],
  )

  // 방 입장 시: 미통지 배지 팝업(오프라인 중 수여 폴백) + 이 테마의 강화 배지 헤더 표시
  useEffect(() => {
    piFetch('/api/badges')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { badges?: MyBadge[] } | null) => {
        if (!d?.badges) return
        const unnotified = d.badges.find((b) => b.noti_yn === 'N')
        if (unnotified) {
          setBadgeAward(unnotified)
          markBadgeNotified(unnotified.badge_id)
        }
        if (themeCd) {
          const upgraded = d.badges.find(
            (b) => b.theme_cd === themeCd && b.upgr_yn === 'Y',
          )
          if (upgraded) setUpgradedBadge(upgraded)
        }
      })
      .catch(() => {})
  }, [themeCd, markBadgeNotified])

  // 강화 결제 완료 → 팝업 닫고 헤더에 즉시 반영
  const onBadgeUpgraded = useCallback(() => {
    setBadgeAward((prev) => {
      if (prev && prev.theme_cd === themeCd) setUpgradedBadge(prev)
      return null
    })
  }, [themeCd])

  // 콤보 선택 언어가 URL locale보다 우선 — 이 방의 모든 메시지가 해당 언어로 보임
  const effectiveLocale = viewLocale || urlLocale

  const {
    messages,
    onlineUserIds,
    sendMessage,
    sendSticker,
    sendFile,
    prependMessages,
  } = useChatRoom(roomId, initialMessages, {
      currentUserId,
      currentUserDisplayName,
      userLocale: effectiveLocale,
      // isSubscribed 이중 게이트 — localStorage에 남은 이전 viewLocale이 비구독자에게 활성화되는 것 방지
      forceTranslate: isSubscribed && !!viewLocale,
      // TASK-064 Trigger 3: @ai 멘션 한도 초과 → 업그레이드 모달
      onAiLimitExceeded,
      // TASK-062 Trigger 7: 배지 수여 broadcast → 축하 팝업
      onBadgeAward,
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 제목 섹션 — 고정 (스크롤 안 됨) */}
      <header className="border-border/50 flex shrink-0 items-center gap-3 border-b bg-zinc-200 px-4 py-3 shadow-md dark:bg-zinc-700">
        <Link
          href="/chat"
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
          aria-label="카페 목록으로"
        >
          ⬅️
        </Link>
        <span className="shrink-0 text-xl">{themeEmoji}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <span className="truncate">{displayRoomNm}</span>
            {roomSettings && (
              <span
                className="shrink-0 text-xs"
                title={roomSettings.is_public_yn === 'Y' ? '공개방' : '비밀방'}
              >
                {roomSettings.is_public_yn === 'Y' ? '🌐' : '🔒'}
              </span>
            )}
            {/* Trigger 7: 강화 배지 — 카페 이름 옆 상시 표시 (특별 디자인) */}
            {upgradedBadge && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-200 to-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 shadow-sm ring-1 ring-amber-400/60 dark:from-amber-700 dark:to-yellow-600 dark:text-amber-100"
                title={`${upgradedBadge.theme_nm} 강화 배지`}
              >
                {upgradedBadge.theme_emoji}🏅
              </span>
            )}
          </p>
          {displayRoomDesc && (
            <p className="text-muted-foreground truncate text-xs">
              {displayRoomDesc}
            </p>
          )}
        </div>
        {/* 방장 전용 카페 수정 버튼 */}
        {isOwner && roomSettings && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="shrink-0 text-2xl transition-transform hover:scale-110"
            aria-label="카페 수정"
            title="카페 수정 (방장)"
          >
            ⚙️
          </button>
        )}
        {/* TASK-073: 분석 대시보드 (Business — 권한은 API가 검증) */}
        <Link
          href={`/chat/${roomId}/analytics`}
          className="shrink-0 text-2xl transition-transform hover:scale-110"
          aria-label="카페 분석"
          title="카페 분석 (Business)"
        >
          📊
        </Link>
        {/* 카페 입장 멤버 목록 — 현재 접속(online) 인원 배지 표시 */}
        <button
          onClick={() => setMemberPanelOpen((o) => !o)}
          className="relative shrink-0 text-2xl transition-transform hover:scale-110"
          aria-label="카페 멤버"
          title="카페 멤버 (접속 현황)"
        >
          👥
          {onlineUserIds.length > 0 && (
            <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-0.5 text-[10px] font-bold text-white">
              {onlineUserIds.length}
            </span>
          )}
        </button>
        {/* PiVoice™ v2.0 음성채널 버튼 — 참여 인원 배지 표시 */}
        <button
          onClick={() => setVoicePanelOpen((o) => !o)}
          className="relative shrink-0 text-2xl transition-transform hover:scale-110"
          aria-label="음성채널"
          title="음성채널"
        >
          🎙️
          {voiceParticipants.length > 0 && (
            <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-0.5 text-[10px] font-bold text-white">
              {voiceParticipants.length}
            </span>
          )}
        </button>
        {/* PiTranslate™ 방별 번역 언어 콤보 — 구독자 전용 특혜 */}
        <ChatLocaleSelect
          value={viewLocale}
          onChange={handleLocaleChange}
          isSubscribed={isSubscribed}
        />
      </header>

      {/* Trigger 5: 정원 초과 방장 알림 배너 */}
      {capacityAlert && (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span>
            ⚠️ 카페 정원이 꽉 찼습니다. 구독 업그레이드로 정원을 늘리세요.
          </span>
          <button
            onClick={() => setExpirePromptOpen(true)}
            className="shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-white transition-colors hover:bg-amber-600"
          >
            업그레이드
          </button>
        </div>
      )}

      {/* Trigger 4: 메시지 만료 경고 배너 (FREE 플랜 — 7일 보관) */}
      {!isSubscribed && !expireBannerDismissed && (
        <div className="flex shrink-0 items-center justify-between gap-2 bg-blue-500/10 px-4 py-2 text-xs text-blue-700 dark:text-blue-400">
          <span>📦 무료 플랜은 메시지가 7일 후 만료됩니다.</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setExpirePromptOpen(true)}
              className="rounded-md bg-blue-500 px-2 py-0.5 text-white transition-colors hover:bg-blue-600"
            >
              업그레이드
            </button>
            <button
              onClick={() => setExpireBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 카페 본문 — 이 영역만 스크롤 (ChatMessageList 내부 overflow-y-auto) */}
      <ChatMessageList
        roomId={roomId}
        messages={messages}
        currentUserId={currentUserId}
        canTip={canTip}
        userLocale={effectiveLocale}
        prependMessages={prependMessages}
        onUpgradeForTip={onUpgradeForTip}
      />

      {/* 카페 입력 섹션 — 고정 */}
      <ChatInput
        onSend={sendMessage}
        onSendSticker={sendSticker}
        onSendFile={sendFile}
      />

      {/* Trigger 2: Bean 업그레이드 모달 */}
      <InlinePurchasePrompt
        isOpen={tipPromptOpen}
        featureName="Bean 보내기"
        description="프리미엄 구독자는 다른 참가자에게 Bean을 보낼 수 있습니다."
        onClose={() => setTipPromptOpen(false)}
      />

      {/* Trigger 4·5: 메시지 보관 / 정원 확장 업그레이드 모달 */}
      <InlinePurchasePrompt
        isOpen={expirePromptOpen}
        featureName="카페 보관 · 정원 확장"
        description="프리미엄 구독으로 메시지를 무제한 보관하고 카페 정원을 늘리세요."
        onClose={() => setExpirePromptOpen(false)}
      />

      {/* Trigger 7: 배지 수여 축하 + 강화 0.1 Pi 팝업 */}
      <BadgeAwardPopup
        badge={badgeAward}
        onUpgraded={onBadgeUpgraded}
        onClose={() => setBadgeAward(null)}
      />

      {/* 방장 전용 카페 수정 다이얼로그 */}
      {settingsOpen && roomSettings && (
        <RoomSettingsDialog
          roomId={roomId}
          initial={roomSettings}
          onSaved={(next) => {
            setRoomSettings(next)
            setDisplayRoomNm(next.room_nm)
            setDisplayRoomDesc(next.room_desc)
            setSettingsOpen(false)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Trigger 3: AI 봇 한도 초과 업그레이드 모달 */}
      <InlinePurchasePrompt
        isOpen={aiLimitPromptOpen}
        featureName="AI 카페 비서 한도 초과"
        description="이번 달 @ai 멘션 한도를 초과했습니다. 프리미엄 구독으로 무제한 AI 질문을 이용하세요."
        onClose={() => setAiLimitPromptOpen(false)}
      />

      {/* 카페 입장 멤버 목록 패널 — online/offline 실시간 표시 */}
      {memberPanelOpen && (
        <MemberListPanel
          roomId={roomId}
          currentUserId={currentUserId}
          onlineUserIds={onlineUserIds}
          onClose={() => setMemberPanelOpen(false)}
        />
      )}

      {/* PiVoice™ v3.0 음성채널 패널 — 방장 보장 + 멤버 자동 2/승인 2 */}
      {voicePanelOpen && (
        <VoiceChannelPanel
          voiceState={voiceState}
          participants={voiceParticipants}
          isMuted={isMuted}
          micState={micState}
          joinError={joinError}
          currentUserId={currentUserId}
          canControlMic={canControlMic}
          onJoin={joinVoice}
          onLeave={leaveVoice}
          onToggleMute={toggleMute}
          onControlMic={controlMic}
          onRequestMic={requestMic}
          onClose={() => setVoicePanelOpen(false)}
        />
      )}

      {/* 음성채널 원격 오디오 — 패널을 닫아도 통화 오디오 유지 */}
      {[...remoteStreams.entries()].map(([usrId, stream]) => (
        <RemoteAudio key={usrId} stream={stream} />
      ))}
    </div>
  )
}
