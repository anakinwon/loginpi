'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// TASK-071: Pi Bet 투표 패널 — 방장 베팅 생성 + 참가(Pi 결제) + 정산
// 참가 결제는 pi-tip-button과 동일한 U2A 3단계 흐름 (metadata.type='PI_BET')

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
  // 생성 폼
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('0.1')
  const [optionsText, setOptionsText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/bets`)
      if (res.ok) {
        const data = (await res.json()) as {
          bets: Bet[]
          is_room_owner: boolean
        }
        setBets(data.bets)
        setIsOwner(data.is_room_owner)
      }
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    void load()
  }, [load])

  async function createBet() {
    const options = optionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!title.trim() || options.length < 2) {
      toast.error('주제와 선택지 2개 이상(쉼표 구분)을 입력해주세요')
      return
    }
    setCreating(true)
    try {
      const res = await piFetch(`/api/chat/rooms/${roomId}/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bet_titl: title.trim(),
          bet_amt_pi: Number(amount),
          options,
        }),
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
      const prep = await piFetch(
        `/api/chat/rooms/${roomId}/bets/${bet.bet_id}/entries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optn_no: optnNo }),
        },
      )
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
        onCancel: () => {
          setPaying(false)
        },
        onError: (e) => {
          setPaying(false)
          toast.error(e.message)
        },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e instanceof Error ? e.message : '베팅 참가 오류')
    }
  }

  async function settleBet(bet: Bet, winOptnNo: number) {
    const res = await piFetch(
      `/api/chat/rooms/${roomId}/bets/${bet.bet_id}/settle`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ win_optn_no: winOptnNo }),
      },
    )
    if (res.ok) {
      const d = (await res.json()) as {
        winner_cnt: number
        payout_each_pi: number
      }
      toast.success(
        `정산 완료 — 승자 ${d.winner_cnt}명, 1인당 π${d.payout_each_pi}`,
      )
      void load()
    } else {
      const d = (await res.json()) as { error?: string }
      toast.error(d.error ?? '정산 실패')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="bg-background max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">🎲 Pi Bet</h3>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => setShowForm((f) => !f)}
                className="bg-primary text-primary-foreground rounded-lg px-2.5 py-1 text-xs font-medium hover:opacity-90"
              >
                + 베팅 만들기
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 베팅 생성 폼 (방장 전용) */}
        {showForm && (
          <div className="mb-4 space-y-2 rounded-xl border p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="베팅 주제 (예: 오늘 경기 승자는?)"
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
              maxLength={200}
            />
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="선택지 (쉼표 구분, 예: 팀A, 팀B)"
              className="w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground text-xs">참가비 π</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0.01"
                max="100"
                step="0.01"
                className="w-24 rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={createBet}
                disabled={creating}
                className="bg-primary text-primary-foreground ml-auto rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creating ? '생성 중…' : '생성'}
              </button>
            </div>
          </div>
        )}

        {/* 베팅 목록 */}
        {loading ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            불러오는 중…
          </div>
        ) : bets.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-8 text-center text-sm">
            진행 중인 베팅이 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <div key={bet.bet_id} className="rounded-xl border p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{bet.bet_titl}</p>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      bet.bet_st_cd === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {bet.bet_st_cd === 'OPEN'
                      ? '진행중'
                      : bet.bet_st_cd === 'SETTLED'
                        ? '정산완료'
                        : '마감'}
                  </span>
                </div>
                <p className="text-muted-foreground mb-2 text-xs">
                  참가 π{bet.bet_amt_pi} · 총 풀 π{bet.total_pool_pi}
                  {bet.my_entry && (
                    <span className="text-primary ml-1">
                      · 내 선택:{' '}
                      {
                        bet.options.find(
                          (o) => o.optn_no === bet.my_entry?.optn_no,
                        )?.optn_nm
                      }
                      {bet.bet_st_cd === 'SETTLED' &&
                        bet.my_entry.win_yn === 'Y' && (
                          <span className="font-semibold">
                            {' '}
                            🎉 +π{bet.my_entry.payout_pi}
                          </span>
                        )}
                    </span>
                  )}
                </p>
                <div className="space-y-1.5">
                  {bet.options.map((opt) => {
                    const isWin = bet.win_optn_no === opt.optn_no
                    return (
                      <div
                        key={opt.optn_no}
                        className="flex items-center gap-2"
                      >
                        <span
                          className={`flex-1 text-xs ${isWin ? 'text-primary font-semibold' : ''}`}
                        >
                          {isWin && '🏆 '}
                          {opt.optn_nm}
                          <span className="text-muted-foreground ml-1">
                            ({opt.entry_cnt}명)
                          </span>
                        </span>
                        {bet.bet_st_cd === 'OPEN' &&
                          !bet.my_entry &&
                          !bet.is_creator && (
                            <button
                              disabled={paying}
                              onClick={() => enterBet(bet, opt.optn_no)}
                              className="bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                            >
                              π{bet.bet_amt_pi} 베팅
                            </button>
                          )}
                        {bet.bet_st_cd === 'OPEN' && bet.is_creator && (
                          <button
                            onClick={() => settleBet(bet, opt.optn_no)}
                            className="text-muted-foreground hover:bg-muted rounded-lg border px-2 py-1 text-[11px]"
                          >
                            이 옵션으로 정산
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
