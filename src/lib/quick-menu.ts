import 'server-only'
import { cache } from 'react'
import { getSupabaseAdmin } from './supabase-admin'
import {
  ADMIN_NAV_BY_HREF,
  DEFAULT_QUICK_MENU_HREFS,
} from './admin-nav-catalog'

// 팝업에 렌더할 항목 — href + 한국어 label (카탈로그에서 해석, i18n 컨텍스트 비의존)
export type QuickMenuItem = { href: string; label: string }

// 활성 팝업 메뉴 조회 (use_yn='Y', sort_ord 순). DB 미설정 시 카탈로그 기본값 폴백.
// React cache로 요청 단위 메모이즈 — layout이 매 렌더 호출해도 DB 1회.
export const getQuickMenuItems = cache(async (): Promise<QuickMenuItem[]> => {
  const toItem = (href: string): QuickMenuItem | null => {
    const cat = ADMIN_NAV_BY_HREF.get(href)
    if (!cat) return null // 카탈로그에서 사라진 메뉴는 제외
    return { href: cat.href, label: cat.label }
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('sys_quick_menu')
      .select('menu_href, sort_ord')
      .eq('use_yn', 'Y')
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })

    if (error || !data || data.length === 0) {
      // 테이블 미생성(마이그레이션 전)·빈 설정 → 기본값
      return DEFAULT_QUICK_MENU_HREFS.map(toItem).filter(
        (x): x is QuickMenuItem => x !== null,
      )
    }
    return (data as { menu_href: string }[])
      .map((r) => toItem(r.menu_href))
      .filter((x): x is QuickMenuItem => x !== null)
  } catch {
    return DEFAULT_QUICK_MENU_HREFS.map(toItem).filter(
      (x): x is QuickMenuItem => x !== null,
    )
  }
})
