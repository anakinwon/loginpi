// SQL 편집기 편집 탭 저장·닫기 — PATCH { sql_txt?, tab_nm? }(마지막 저장 우선) / DELETE 논리 삭제, 본인 탭 아니면 404
import { deleteTab, updateTab } from '@/lib/sql-tab'

export const PATCH = updateTab
export const DELETE = deleteTab
