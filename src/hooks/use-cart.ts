'use client'

// 오프라인매장 장바구니(카트) — 클라이언트 전역 상태 (FR-14)
// Provider 없이 모듈 레벨 store + useSyncExternalStore 로 4개 화면(목록·상세·스토어프론트·카트뷰) 공유.
// localStorage 영속 + 'storage' 이벤트로 탭 간 동기화. 카트는 **매장(shopId) 단위** — 한 카트엔 동일 매장만.
import { useSyncExternalStore } from 'react'

export interface CartLine {
  itemId: string
  itemNm: string
  thumbUrl: string | null
  unitPricePi: number // 주문 시점 단가(정본)
  ccyCd: string | null // 등록시점 통화 스냅샷
  ccyAmt: number | null // 등록시점 자국통화 단가 스냅샷(고정 참고가)
  qty: number
  stockQty: number // 담기 가능 상한(무제한 상품은 큰 값)
}

export interface CartState {
  shopId: string | null
  shopNm: string | null
  lines: CartLine[]
}

const STORAGE_KEY = 'mps_cart_v1'
const EMPTY: CartState = { shopId: null, shopNm: null, lines: [] }
const round7 = (n: number) => Math.round(n * 1e7) / 1e7

let state: CartState = EMPTY
let hydrated = false
const listeners = new Set<() => void>()

function readStorage(): CartState {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as CartState
    return p && Array.isArray(p.lines) ? p : EMPTY
  } catch {
    return EMPTY
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  state = readStorage()
  hydrated = true
}

function emit() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* 용량 초과 등은 무시 — 메모리 상태는 유지 */
    }
  }
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  ensureHydrated()
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = readStorage()
      listeners.forEach((l) => l())
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

function getSnapshot(): CartState {
  ensureHydrated()
  return state
}
function getServerSnapshot(): CartState {
  return EMPTY
}

// ───────── 조작 API ─────────

export interface AddCartInput {
  shopId: string
  shopNm: string
  line: Omit<CartLine, 'qty'> & { qty?: number }
}

// 카트 담기. 다른 매장 상품을 비어있지 않은 카트에 담으면 { conflict:true } 반환 →
// 호출자가 "기존 카트 비우고 담기" 확인 후 replaceShopAndAdd() 호출.
export function addToCart(input: AddCartInput): { ok: boolean; conflict: boolean } {
  ensureHydrated()
  if (state.shopId && state.shopId !== input.shopId && state.lines.length > 0) {
    return { ok: false, conflict: true }
  }
  const addQty = input.line.qty ?? 1
  const existing = state.lines.find((l) => l.itemId === input.line.itemId)
  const lines = existing
    ? state.lines.map((l) =>
        l.itemId === input.line.itemId
          ? { ...l, qty: Math.min(l.stockQty, l.qty + addQty) }
          : l,
      )
    : [
        ...state.lines,
        { ...input.line, qty: Math.min(input.line.stockQty, addQty) },
      ]
  state = { shopId: input.shopId, shopNm: input.shopNm, lines }
  emit()
  return { ok: true, conflict: false }
}

// 기존 카트(다른 매장)를 비우고 새 매장 상품으로 시작
export function replaceShopAndAdd(input: AddCartInput) {
  ensureHydrated()
  state = EMPTY
  addToCart(input)
}

export function setQty(itemId: string, qty: number) {
  ensureHydrated()
  if (qty <= 0) return removeFromCart(itemId)
  state = {
    ...state,
    lines: state.lines.map((l) =>
      l.itemId === itemId ? { ...l, qty: Math.min(l.stockQty, qty) } : l,
    ),
  }
  emit()
}

export function removeFromCart(itemId: string) {
  ensureHydrated()
  const lines = state.lines.filter((l) => l.itemId !== itemId)
  state = lines.length === 0 ? EMPTY : { ...state, lines }
  emit()
}

export function clearCart() {
  ensureHydrated()
  state = EMPTY
  emit()
}

// ───────── 파생 셀렉터 ─────────

export interface CartTotals {
  count: number // 총 수량
  pi: number // Pi 합계(정본)
  ccyCd: string | null // 전 라인 동일 통화일 때만
  ccyAmt: number | null // 자국통화 합계(등록시점 고정 참고가)
}

export function cartTotals(s: CartState): CartTotals {
  const count = s.lines.reduce((n, l) => n + l.qty, 0)
  const pi = round7(s.lines.reduce((sum, l) => sum + l.unitPricePi * l.qty, 0))
  const ccy = s.lines[0]?.ccyCd ?? null
  const sameCcy =
    !!ccy && s.lines.every((l) => l.ccyCd === ccy && l.ccyAmt != null)
  const ccyAmt = sameCcy
    ? s.lines.reduce((sum, l) => sum + (l.ccyAmt ?? 0) * l.qty, 0)
    : null
  return { count, pi, ccyCd: sameCcy ? ccy : null, ccyAmt }
}

// ───────── React 훅 ─────────

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
