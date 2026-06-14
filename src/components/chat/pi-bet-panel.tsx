'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// TASK-071: Pi Bet 투표 패널 — 방장 베팅 생성 + 참가(Pi 결제) + 정산

interface BetOption {
  optn_no: number
  optn_nm: string
  entry_cnt: number
}

interface Bet {
  bet_id: string
  bet_titl: string
  bet_amt_pi: number
  bet_st_cd: 'OPEN' | 'CLOSED' | 'SETTLED' | 'CANCELLED'
  close_dtm: string | null
  win_optn_no: number | null
  is_creator: boolean
  options: BetOption[]
  total_pool_pi: number
  my_entry: { optn_no: number; win_yn: string; payout_pi: number } | null
}

// 선택지별 순환 색상 팔레트 (배경·바·텍스트)
const OPTION_PALETTE = [
  {
    bar: 'from-cyan-400 to-blue-500',
    bg: 'bg-cyan-50 dark:bg-cyan-950/40',
    border: 'border-cyan-200 dark:border-cyan-800',
    label: 'text-cyan-700 dark:text-cyan-300',
  },
  {
    bar: 'from-purple-400 to-pink-500',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'text-purple-700 dark:text-purple-300',
  },
  {
    bar: 'from-amber-400 to-orange-500',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'text-amber-700 dark:text-amber-300',
  },
  {
    bar: 'from-emerald-400 to-teal-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    label: 'text-emerald-700 dark:text-emerald-300',
  },
] as const

const STATUS_META = {
  OPEN: { label: '🟢 진행중', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  CLOSED: { label: '🔴 마감', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
  SETTLED: { label: '✅ 정산완료', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  CANCELLED: { label: '❌ 취소', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
}

export function PiBetPanel({
  roomId,
  onClose,
}: {
  roomId: string
  onClose: () => void
}) {
  const [bets, setBets] = useState<Bet[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('0.1')
  const [optionsText, setOptionsText] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (betId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(betId) ? next.delete(betId) : next.add(betId)
      return next
    })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/bets`)
      if (res.ok) {
        const data = (await res.json()) as { bets: Bet[]; is_room_owner: boolean }
        setBets(data.bets)
        setIsOwner(data.is_room_owner)
        // OPEN 상태 베팅은 기본 펼침
        setExpanded(new Set(data.bets.filter((b) => b.bet_st_cd === 'OPEN').map((b) => b.bet_id)))
      }
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => { void load() }, [load])

  async function createBet() {
    const options = optionsText.split(',').map((s) => s.trim()).filter(Boolean)
    if (!title.trim() || options.length < 2) {
      toast.error('주제와 선택지 2개 이상(쉼표 구분)을 입력해주세요')
      return
    }
    setCreating(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet_titl: title.trim(), bet_amt_pi: Number(amount), options }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '베팅 생성 실패')
      }
      toast.success('베팅이 생성되었습니다')
      setShowForm(false)
      setTitle('')
      setOptionsText('')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '베팅 생성 오류')
    } finally {
      setCreating(false)
    }
  }

  async function enterBet(bet: Bet, optnNo: number) {
    if (!window.Pi) {
      toast.error('Pi Browser에서만 베팅에 참가할 수 있습니다')
      return
    }
    setPaying(true)
    try {
      const prep = await piFetch(`/api/chat/rooms/${roomId}/bets/${bet.bet_id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optn_no: optnNo }),
      })
      if (!prep.ok) {
        const d = (await prep.json()) as { error?: string }
        throw new Error(d.error ?? '참가 준비 실패')
      }
      const params = (await prep.json()) as {
        amount: number
        memo: string
        metadata: Record<string, unknown>
      }

      window.Pi.createPayment(params, {
        onReadyForServerApproval: async (paymentId) => {
          await fetch('/api/payments/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
        },
        onReadyForServerCompletion: async (paymentId, txid) => {
          const res = await fetch('/api/payments/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, txid }),
          })
          setPaying(false)
          if (res.ok) {
            toast.success(`π${params.amount} 베팅 참가 완료!`)
            void load()
          } else {
            toast.error('베팅 결제 완료 처리에 실패했습니다')
          }
        },
        onCancel: () => { setPaying(false) },
        onError: (e) => { setPaying(false); toast.error(e.message) },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : '베팅 참가 오류')
    }
  }

  async function settleBet(bet: Bet, winOptnNo: number) {
    const res = await piFetch(`/api/chat/rooms/${roomId}/bets/${bet.bet_id}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ win_optn_no: winOptnNo }),
    })
    if (res.ok) {
      const d = (await res.json()) as { winner_cnt: number; payout_each_pi: number }
      toast.success(`정산 완료 — 승자 ${d.winner_cnt}명, 1인당 π${d.payout_each_pi}`)
      void load()
    } else {
      const d = (await res.json()) as { error?: string }
      toast.error(d.error ?? '정산 실패')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="bg-background max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="from-primary/10 to-primary/5 sticky top-0 z-10 rounded-t-2xl border-b bg-gradient-to-r px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎲</span>
              <div>
                <h3 className="text-base font-bold tracking-tight">Pi Bet</h3>
                <p className="text-muted-foreground text-[10px]">Pi 베팅 · 예측 게임</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && (
                <button
                  onClick={() => setShowForm((f) => !f)}
                  className="bg-primary text-primary-foreground rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm hover:opacity-90 active:scale-95"
                >
                  + 베팅 만들기
                </button>
              )}
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1 transition-colors"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="p-4">
          {/* 베팅 생성 폼 */}
          {showForm && (
            <div className="mb-4 space-y-2.5 rounded-2xl border-2 border-dashed p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">새 베팅 만들기</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="베팅 주제 (예: 오늘 경기 승자는?)"
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                maxLength={200}
              />
              <input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="선택지 (쉼표 구분, 예: 팀A, 팀B)"
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="flex items-center gap-2">
                <label className="text-muted-foreground text-xs font-medium">참가비 π</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0.01"
                  max="100"
                  step="0.01"
                  className="w-24 rounded-xl border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={createBet}
                  disabled={creating}
                  className="bg-primary text-primary-foreground ml-auto rounded-xl px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? '생성 중…' : '베팅 생성'}
                </button>
              </div>
            </div>
          )}

          {/* 베팅 목록 */}
          {loading ? (
            <div className="text-muted-foreground py-12 text-center text-sm">
              <div className="mb-2 text-2xl animate-spin">🎲</div>
              불러오는 중…
            </div>
          ) : bets.length === 0 ? (
            <div className="text-muted-foreground rounded-2xl border-2 border-dashed py-12 text-center text-sm">
              <div className="mb-2 text-3xl">🎯</div>
              <p className="font-medium">진행 중인 베팅이 없습니다</p>
              {isOwner && <p className="mt-1 text-xs">위 버튼으로 첫 베팅을 만들어보세요!</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {bets.map((bet) => {
                const totalEntries = bet.options.reduce((s, o) => s + o.entry_cnt, 0)
                const iWon = bet.my_entry?.win_yn === 'Y' && bet.bet_st_cd === 'SETTLED'
                const status = STATUS_META[bet.bet_st_cd]
                const isOpen = expanded.has(bet.bet_id)

                return (
                  <div
                    key={bet.bet_id}
                    className={`rounded-2xl border-2 overflow-hidden ${
                      bet.bet_st_cd === 'OPEN'
                        ? 'border-emerald-200 dark:border-emerald-800'
                        : bet.bet_st_cd === 'SETTLED'
                          ? 'border-amber-200 dark:border-amber-800'
                          : 'border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    {/* 아코디언 헤더 — 클릭으로 토글 */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(bet.bet_id)}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                        bet.bet_st_cd === 'OPEN'
                          ? 'bg-emerald-50 hover:bg-emerald-100/70 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50'
                          : bet.bet_st_cd === 'SETTLED'
                            ? 'bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/50'
                            : 'bg-zinc-50 hover:bg-zinc-100/70 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/50'
                      }`}
                    >
                      {/* 상태 배지 */}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>
                        {status.label}
                      </span>

                      {/* 제목 */}
                      <span className="flex-1 truncate text-sm font-semibold">{bet.bet_titl}</span>

                      {/* 요약 정보 */}
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        π{bet.total_pool_pi} · {totalEntries}명
                      </span>

                      {/* 펼치기/접기 화살표 */}
                      <span
                        className={`shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>

                    {/* 당첨 배너 (항상 표시) */}
                    {iWon && (
                      <div
                        className="px-4 py-2 text-center text-sm font-bold text-amber-900 dark:text-amber-100"
                        style={{
                          background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 25%, #fde68a 50%, #f59e0b 75%, #fbbf24 100%)',
                          backgroundSize: '200% auto',
                          animation: 'bet-shimmer 2s linear infinite',
                        }}
                      >
                        🏆 당첨! 축하합니다! +π{bet.my_entry!.payout_pi} 획득 🎉
                      </div>
                    )}

                    {/* 아코디언 콘텐츠 */}
                    <div
                      className="grid transition-[grid-template-rows] duration-200"
                      style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                    >
                      <div className="overflow-hidden">
                        <div className="px-4 pb-3 pt-2.5">
                          {/* 메타 정보 */}
                          <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-muted-foreground">
                            <span>참가비 <strong className="text-foreground">π{bet.bet_amt_pi}</strong></span>
                            {bet.my_entry && (
                              <>
                                <span>·</span>
                                <span className="text-primary font-medium">
                                  내 선택:{' '}
                                  {bet.options.find((o) => o.optn_no === bet.my_entry?.optn_no)?.optn_nm}
                                </span>
                              </>
                            )}
                          </div>

                          {/* 선택지 목록 */}
                          <div className="ml-2 space-y-1 border-l-2 border-dashed border-muted pl-3">
                            {bet.options.map((opt, idx) => {
                              const palette = OPTION_PALETTE[idx % OPTION_PALETTE.length]
                              const isWin = bet.win_optn_no === opt.optn_no
                              const ratio = totalEntries > 0 ? (opt.entry_cnt / totalEntries) * 100 : 0
                              const iMyChoice = bet.my_entry?.optn_no === opt.optn_no

                              return (
                                <div
                                  key={opt.optn_no}
                                  className={`rounded-xl border p-2 transition-all ${
                                    isWin
                                      ? 'border-amber-400 dark:border-amber-500'
                                      : `${palette.border} ${palette.bg}`
                                  }`}
                                  style={isWin ? { animation: 'bet-spotlight 1.6s ease-in-out infinite' } : undefined}
                                >
                                  <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {isWin ? (
                                        <span className="shrink-0 text-base">🏆</span>
                                      ) : (
                                        <span className={`shrink-0 h-2 w-2 rounded-full bg-gradient-to-br ${palette.bar}`} />
                                      )}
                                      <span
                                        className={`truncate font-semibold ${
                                          isWin
                                            ? 'text-base text-amber-700 dark:text-amber-300'
                                            : `text-sm ${palette.label}`
                                        }`}
                                      >
                                        {opt.optn_nm}
                                      </span>
                                      {iMyChoice && !isWin && (
                                        <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                          내 선택
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                        {opt.entry_cnt}명 ({ratio.toFixed(0)}%)
                                      </span>
                                      {bet.bet_st_cd === 'OPEN' && !bet.my_entry && !bet.is_creator && (
                                        <button
                                          disabled={paying}
                                          onClick={() => enterBet(bet, opt.optn_no)}
                                          className={`bg-gradient-to-r ${palette.bar} rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50`}
                                        >
                                          π{bet.bet_amt_pi} 베팅
                                        </button>
                                      )}
                                      {bet.bet_st_cd === 'OPEN' && bet.is_creator && (
                                        <button
                                          onClick={() => settleBet(bet, opt.optn_no)}
                                          className="rounded-lg border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                                        >
                                          정산
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* 진행률 바 */}
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                    <div
                                      className={`h-full rounded-full bg-gradient-to-r ${
                                        isWin ? 'from-amber-400 to-yellow-300' : palette.bar
                                      } transition-all duration-700`}
                                      style={{ width: `${Math.max(ratio, ratio > 0 ? 4 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
