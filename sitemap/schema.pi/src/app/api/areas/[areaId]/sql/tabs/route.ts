// SQL 편집기 편집 탭(sql/062) — GET 본인 탭 목록 + 요금제 상한 / POST { sql_txt?, tab_nm? } 새 탭(상한 초과 409 SQL_TAB_LIMIT)
import { createTab, listTabs } from '@/lib/sql-tab'

export const GET = listTabs
export const POST = createTab
