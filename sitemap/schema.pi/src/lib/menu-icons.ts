// 메인 메뉴 아이콘·묶음 색 단일 소스 — 하단 메뉴(area-nav)·대시보드 바로가기·소개 흐름이 같은 아이콘을 쓰도록(마스터 지시 2026-10-21 "설정은 톱니바퀴, 가장 일반적인 아이콘, 그룹별 무채색 계열 색감")
import { Activity, BookA, Boxes, CodeXml, Database, Lightbulb, ListOrdered, Network, Settings, Shapes, Tags, Wallet, type LucideIcon } from 'lucide-react'

// 메뉴 경로(seg) → 아이콘 : 사전 = 책, 도메인 = 도형(타입·길이 틀), 용어 = 태그, 코드 = 번호 목록, 개념 = 전구, 논리 = 상자 묶음, 물리 = DB, ERD = 연결망
export const MENU_ICON = {
  words: BookA,
  domains: Shapes,
  terms: Tags,
  codes: ListOrdered,
  model: Lightbulb,
  logical: Boxes,
  physical: Database,
  erd: Network,
  monitor: Activity,
  sql: CodeXml,
  settings: Settings,
  plan: Wallet, // 결제 = 지갑(마스터 지시 2026-10-21 — 카드보다 직관적)
} satisfies Record<string, LucideIcon>

// 묶음 색(무채색 계열 + 옅은 색조, 위→아래 그라데이션·그림자로 입체감 — 마스터 지시 2026-10-21 "음영 더, 색 더 진하게 그라데이션")
//  box = 묶음 박스, tile = 평소 아이콘 타일(bg-gradient-to-b 와 함께), on = 현재 메뉴 타일·서브 탭, soft = 현재 메뉴 버튼·서브 바 바탕, text = 현재 메뉴 글자
export type Tone = { box: string; tile: string; on: string; soft: string; text: string }
export const TONE = {
  // 슬레이트(푸른 회색)
  tech: {
    box: 'border-[#a9b6c5] bg-gradient-to-b from-[#eef2f6] to-[#d3dce6] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(30,41,59,0.22)]',
    tile: 'border-[#9fadbf] from-white to-[#e1e8f0] text-[#3b4a5e] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(30,41,59,0.3)]',
    on: 'border-[#2f3b4c] bg-gradient-to-b from-[#5c6b80] to-[#2f3b4c] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(30,41,59,0.4)]',
    soft: 'bg-[#dfe6ee] ring-[#9fadbf]',
    text: 'text-[#26313f]',
  },
  // 스톤(따뜻한 회색)
  std: {
    box: 'border-[#bfb2a3] bg-gradient-to-b from-[#f5f0ea] to-[#e0d5c9] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(68,52,36,0.22)]',
    tile: 'border-[#b8a999] from-white to-[#ece3d8] text-[#5a4b3c] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(68,52,36,0.3)]',
    on: 'border-[#4f4337] bg-gradient-to-b from-[#806f5d] to-[#4f4337] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(68,52,36,0.4)]',
    soft: 'bg-[#eae2d7] ring-[#b8a999]',
    text: 'text-[#3b3128]',
  },
  // 세이지(녹회색)
  model: {
    box: 'border-[#a8baad] bg-gradient-to-b from-[#eef4f0] to-[#d1ded4] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(36,58,44,0.22)]',
    tile: 'border-[#a0b3a5] from-white to-[#dfe9e2] text-[#3c5244] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(36,58,44,0.3)]',
    on: 'border-[#3a4e40] bg-gradient-to-b from-[#66806e] to-[#3a4e40] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(36,58,44,0.4)]',
    soft: 'bg-[#dce7df] ring-[#a0b3a5]',
    text: 'text-[#2b3a30]',
  },
  // 징크(중성 회색)
  set: {
    box: 'border-[#b4b4bc] bg-gradient-to-b from-[#f3f3f5] to-[#d8d8de] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(39,39,42,0.22)]',
    tile: 'border-[#acacb5] from-white to-[#e4e4e9] text-[#44444d] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(39,39,42,0.3)]',
    on: 'border-[#35353c] bg-gradient-to-b from-[#6a6a75] to-[#35353c] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(39,39,42,0.4)]',
    soft: 'bg-[#e2e2e7] ring-[#acacb5]',
    text: 'text-[#27272a]',
  },
  // 모브(보라 회색)
  plan: {
    box: 'border-[#bba9bd] bg-gradient-to-b from-[#f5eff5] to-[#dccfdd] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_5px_rgba(62,44,66,0.22)]',
    tile: 'border-[#b3a0b6] from-white to-[#eadfeb] text-[#584360] shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(62,44,66,0.3)]',
    on: 'border-[#4b3950] bg-gradient-to-b from-[#806985] to-[#4b3950] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(62,44,66,0.4)]',
    soft: 'bg-[#e9dfea] ring-[#b3a0b6]',
    text: 'text-[#3d2f42]',
  },
} satisfies Record<string, Tone>
