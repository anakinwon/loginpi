'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BeanIcon } from '@/components/ui/bean-icon'

interface Campaign {
  campaign_cd: string
  campaign_nm: string
  reward_bean: number
  max_grant_cnt: number
  src_wallet: string
  require_shop_yn: string
  require_item_yn: string
  require_telegram_yn: string
  require_mission_cnt: number
  active_yn: string
  start_dtm: string
  end_dtm: string | null
  pending: number
  approved: number
  rejected: number
}

interface ListData {
  campaigns: Campaign[]
  reward_pool_balance: number
}

interface PendingRow {
  grant_id: string
  usr_id: string
  bean_amt: number
  reg_dtm: string
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
    display_name: string
  } | null
}

interface PendingData {
  campaign_cd: string
  campaign_nm: string
  pending: PendingRow[]
  approved_cnt: number
  max_cnt: number
  reward_bean: number
}

const RESULT_MSG: Record<string, { text: string; ok: boolean }> = {
  APPROVED: { text: '승인·지급 완료', ok: true },
  REJECTED: { text: '거절 처리됨', ok: true },
  SOLD_OUT: { text: '선착순 한도 도달 — 더 승인할 수 없습니다', ok: false },
  INSUFFICIENT_POOL: { text: '보상 재원(REWARD_POOL)이 부족합니다', ok: false },
  NOT_PENDING: { text: '대기 중인 신청이 아닙니다', ok: false },
}

// ── 재원(REWARD_POOL) 충전 박스 ──────────────────────────────
function MintBox({ balance, onDone }: { balance: number; onDone: () => void }) {
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function mint() {
    const n = Math.floor(Number(amt))
    if (!Number.isInteger(n) || n <= 0) {
      toast.error('발행액은 1 이상 정수여야 합니다')
      return
    }
    if (!reason.trim()) {
      toast.error('발행 사유는 필수입니다')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/token/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bean_amt: n,
          dest_wallet: 'REWARD_POOL',
          reason: reason.trim(),
        }),
      })
      const d = (await res.json()) as { ok?: boolean; error?: string }
      if (res.ok && d.ok) {
        toast.success('REWARD_POOL 재원 충전 완료')
        setAmt('')
        setReason('')
        onDone()
      } else {
        toast.error(d.error ?? '발행 실패')
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-950/30">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          REWARD_POOL 생태계 기금 (보상 재원)
        </p>
        <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs font-semibold dark:bg-white/10">
          충전=발행
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
        <BeanIcon className="inline-block h-5 w-5" /> {balance.toLocaleString()}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums">
        ≈ π {(balance / 100).toFixed(2)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder="발행액(Bean)"
          className="bg-background w-32 rounded-md border px-2 py-1 text-sm tabular-nums"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="발행 사유 (필수)"
          className="bg-background min-w-40 flex-1 rounded-md border px-2 py-1 text-sm"
        />
        <button
          onClick={mint}
          disabled={busy}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          충전
        </button>
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">
        현금(Pi) 없는 보조금성 발행 — bean_mint_log 기록 + 대차대조표 발행
        총량에 합산
      </p>
    </div>
  )
}

// ── 새 캠페인 생성 폼 ────────────────────────────────────────
function CreateForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [cd, setCd] = useState('')
  const [nm, setNm] = useState('')
  const [reward, setReward] = useState('')
  const [maxCnt, setMaxCnt] = useState('')
  const [reqShop, setReqShop] = useState(false)
  const [reqItem, setReqItem] = useState(false)
  const [reqTlgm, setReqTlgm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          campaign: {
            campaign_cd: cd.trim().toUpperCase(),
            campaign_nm: nm.trim(),
            reward_bean: reward,
            max_grant_cnt: maxCnt,
            require_shop_yn: reqShop,
            require_item_yn: reqItem,
            require_telegram_yn: reqTlgm,
            active_yn: 'Y',
          },
        }),
      })
      const d = (await res.json()) as { status?: string; error?: string }
      if (res.ok && d.status === 'CREATED') {
        toast.success(`캠페인 생성: ${d.status}`)
        setCd('')
        setNm('')
        setReward('')
        setMaxCnt('')
        setReqShop(false)
        setReqItem(false)
        setReqTlgm(false)
        setOpen(false)
        onDone()
      } else {
        toast.error(d.error ?? '생성 실패')
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hover:bg-muted rounded-lg border border-dashed px-4 py-2 text-sm font-medium"
      >
        + 새 캠페인 만들기
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-semibold">새 캠페인</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">캠페인 코드 (대문자_)</span>
          <input
            value={cd}
            onChange={(e) => setCd(e.target.value)}
            placeholder="EVENT_M1"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm uppercase"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">캠페인 이름</span>
          <input
            value={nm}
            onChange={(e) => setNm(e.target.value)}
            placeholder="로그인 미션 보상"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">건당 보상 (Bean)</span>
          <input
            type="number"
            min={1}
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            placeholder="10000"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">선착순 한도 (명)</span>
          <input
            type="number"
            min={1}
            value={maxCnt}
            onChange={(e) => setMaxCnt(e.target.value)}
            placeholder="100"
            className="bg-background w-full rounded-md border px-2 py-1 text-sm tabular-nums"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqShop}
            onChange={(e) => setReqShop(e.target.checked)}
          />
          매장 가입 필요
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqItem}
            onChange={(e) => setReqItem(e.target.checked)}
          />
          상품 1개+ 필요
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={reqTlgm}
            onChange={(e) => setReqTlgm(e.target.checked)}
          />
          텔레그램 연동 필요
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
        >
          생성
        </button>
        <button
          onClick={() => setOpen(false)}
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ── 캠페인 카드 (활성 토글 + 신청 관리 진입) ──────────────────
function CampaignCard({
  c,
  onSelect,
  onChanged,
}: {
  c: Campaign
  onSelect: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const active = c.active_yn === 'Y'

  async function toggle() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          campaign_cd: c.campaign_cd,
          patch: { active_yn: active ? 'N' : 'Y' },
        }),
      })
      if (res.ok) {
        toast.success(active ? '비활성화됨' : '활성화됨')
        onChanged()
      } else {
        const d = (await res.json()) as { error?: string }
        toast.error(d.error ?? '수정 실패')
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(false)
    }
  }

  const reqs = [
    c.require_shop_yn === 'Y' && '매장',
    c.require_item_yn === 'Y' && '상품',
    c.require_telegram_yn === 'Y' && '텔레그램',
    c.require_mission_cnt > 0 && `미션${c.require_mission_cnt}`,
  ].filter(Boolean) as string[]

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.campaign_nm}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {c.campaign_cd}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            active
              ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {active ? '활성' : '비활성'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold tabular-nums">
            {c.reward_bean.toLocaleString()}
          </p>
          <p className="text-muted-foreground text-xs">건당 보상</p>
        </div>
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold tabular-nums">
            {c.approved}/{c.max_grant_cnt}
          </p>
          <p className="text-muted-foreground text-xs">승인/한도</p>
        </div>
        <div className="bg-muted/40 rounded-md py-1.5">
          <p className="font-bold text-amber-600 tabular-nums dark:text-amber-400">
            {c.pending}
          </p>
          <p className="text-muted-foreground text-xs">대기</p>
        </div>
      </div>

      {reqs.length > 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          자격: {reqs.join(' · ')}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onSelect}
          className="bg-primary text-primary-foreground flex-1 rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90"
        >
          신청 관리 {c.pending > 0 && `(${c.pending})`}
        </button>
        <button
          onClick={toggle}
          disabled={busy}
          className="hover:bg-muted rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {active ? '비활성화' : '활성화'}
        </button>
      </div>
    </div>
  )
}

// ── 선택 캠페인의 PENDING 신청 승인/거절 패널 ──────────────────
function PendingPanel({
  campaignCd,
  onClose,
  onActed,
}: {
  campaignCd: string
  onClose: () => void
  onActed: () => void
}) {
  const [data, setData] = useState<PendingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `/api/admin/campaign?campaign_cd=${encodeURIComponent(campaignCd)}`,
    )
    if (res.ok) setData((await res.json()) as PendingData)
    setLoading(false)
  }, [campaignCd])

  useEffect(() => {
    void load()
  }, [load])

  async function act(usrId: string, action: 'approve' | 'reject') {
    setBusy(usrId)
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          usr_id: usrId,
          campaign_cd: campaignCd,
        }),
      })
      const d = (await res.json()) as { status?: string }
      const m = RESULT_MSG[d.status ?? ''] ?? { text: '처리 완료', ok: true }
      if (m.ok) toast.success(m.text)
      else toast.error(m.text)
      await load()
      onActed()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">
            {data?.campaign_nm ?? campaignCd} — 신청 승인
          </p>
          {data && (
            <p className="text-muted-foreground mt-0.5 text-sm">
              승인 {data.approved_cnt}/{data.max_cnt} · 건당{' '}
              {data.reward_bean.toLocaleString()}{' '}
              <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
              · 대기 {data.pending.length}건
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="hover:bg-muted rounded-lg border px-2.5 py-1 text-xs"
        >
          닫기
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      ) : !data || data.pending.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          승인 대기 중인 신청이 없습니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">신청자</th>
                <th className="px-4 py-2 text-left font-medium">신청일</th>
                <th className="px-4 py-2 text-right font-medium">보상</th>
                <th className="px-4 py-2 text-center font-medium">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.pending.map((r) => {
                const soldOut = data.approved_cnt >= data.max_cnt
                return (
                  <tr key={r.grant_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {r.sys_user?.nick_nm ||
                          r.sys_user?.real_nm ||
                          r.sys_user?.display_name ||
                          '—'}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {r.sys_user?.pi_username
                          ? `@${r.sys_user.pi_username}`
                          : r.usr_id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                      {new Date(r.reg_dtm).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {r.bean_amt.toLocaleString()}{' '}
                      <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => act(r.usr_id, 'approve')}
                          disabled={busy === r.usr_id || soldOut}
                          title={soldOut ? '선착순 한도 도달' : undefined}
                          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => act(r.usr_id, 'reject')}
                          disabled={busy === r.usr_id}
                          className="hover:bg-muted rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-40"
                        >
                          거절
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────────
export default function AdminCampaignPage() {
  const [data, setData] = useState<ListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/campaign')
    if (res.ok) setData((await res.json()) as ListData)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" /> 보상 캠페인 운영
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          캠페인 생성·활성 관리 + REWARD_POOL 재원 충전 + 신청 승인. 지급은
          REWARD_POOL에서 차감되어 사용자 지갑으로 입금됩니다.
        </p>
      </div>

      {data && <MintBox balance={data.reward_pool_balance} onDone={load} />}

      <CreateForm onDone={load} />

      {selected && (
        <PendingPanel
          campaignCd={selected}
          onClose={() => setSelected(null)}
          onActed={load}
        />
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중...</p>
      ) : !data || data.campaigns.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          등록된 캠페인이 없습니다. 위에서 새 캠페인을 만들어 주세요.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.campaigns.map((c) => (
            <CampaignCard
              key={c.campaign_cd}
              c={c}
              onSelect={() => setSelected(c.campaign_cd)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}
