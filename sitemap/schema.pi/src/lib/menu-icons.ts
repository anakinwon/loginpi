// 메뉴 아이콘 단일 소스(3D 키캡 Icon3D·선 아이콘 공용) — 하단 메뉴(area-nav)·대시보드 바로가기·소개 흐름이 같은 아이콘을 쓰도록(마스터 지시 2026-10-21 "설정은 톱니바퀴, 가장 일반적인 아이콘")
import { Activity, BookA, Boxes, Database, Lightbulb, ListOrdered, Network, Ruler, Settings, SquareTerminal, Tags, Wallet, type LucideIcon } from 'lucide-react'

// 메뉴 경로(seg) → 아이콘 : 사전 = 책, 도메인 = 자(타입·길이 틀), 용어 = 태그, 코드 = 번호 목록, 개념 = 전구, 논리 = 상자 묶음, 물리 = DB, ERD = 연결망, SQL = 터미널
export const MENU_ICON = {
  words: BookA,
  domains: Ruler,
  terms: Tags,
  codes: ListOrdered,
  model: Lightbulb,
  logical: Boxes,
  physical: Database,
  erd: Network,
  monitor: Activity,
  sql: SquareTerminal,
  settings: Settings,
  plan: Wallet, // 결제 = 지갑(마스터 지시 2026-10-21 — 카드보다 직관적)
} satisfies Record<string, LucideIcon>

// 메뉴 묶음 → 글리프 색(tone) 단일 소스(2026-11-12 마스터 "아이콘 약간 더 눈에 띄게 색상") — 색은 글리프에만, 키 바탕은 단색 유지. 색 값 = globals.css --tone-*
export type Tone = 'std' | 'mdl' | 'tech' | 'ops'
export const MENU_TONE: Record<keyof typeof MENU_ICON, Tone> = {
  words: 'std',
  domains: 'std',
  terms: 'std',
  codes: 'std',
  model: 'mdl',
  logical: 'mdl',
  physical: 'mdl',
  erd: 'mdl',
  monitor: 'tech',
  sql: 'tech',
  settings: 'ops',
  plan: 'ops',
}
const TONE_BY_ICON = new Map<LucideIcon, Tone>((Object.keys(MENU_ICON) as (keyof typeof MENU_ICON)[]).map((k) => [MENU_ICON[k], MENU_TONE[k]]))
// 아이콘 → 묶음 tone(메뉴 아이콘이 아니면 undefined)
export const toneOf = (icon: LucideIcon): Tone | undefined => TONE_BY_ICON.get(icon)
