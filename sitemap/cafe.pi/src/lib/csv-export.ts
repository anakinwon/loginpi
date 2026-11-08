// 분석 데이터 CSV 내보내기 (PRD_21 §7-0 잔여 '내보내기' — 2026-07-10)
//   서버 API 응답(JSON)에서 배열형 데이터셋을 자동 수집해 섹션별 CSV로 직렬화한다.
//   엑셀 한글 호환을 위해 UTF-8 BOM을 붙인다. 클라이언트 전용(서버 의존 없음).

type Row = Record<string, unknown>

// 응답 JSON에서 "객체 배열" 데이터셋 수집 — 최상위·1단계 중첩까지 (분석 API 응답 형태 커버)
export function collectArraySections(
  payload: unknown,
  rootName: string,
): Array<{ name: string; rows: Row[] }> {
  const sections: Array<{ name: string; rows: Row[] }> = []
  const isRowArray = (v: unknown): v is Row[] =>
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((e) => e !== null && typeof e === 'object' && !Array.isArray(e))

  if (isRowArray(payload)) {
    sections.push({ name: rootName, rows: payload })
    return sections
  }
  if (payload === null || typeof payload !== 'object') return sections

  for (const [k, v] of Object.entries(payload as Row)) {
    if (isRowArray(v)) {
      sections.push({ name: `${rootName}.${k}`, rows: v })
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Row)) {
        if (isRowArray(v2))
          sections.push({ name: `${rootName}.${k}.${k2}`, rows: v2 })
      }
    }
  }
  return sections
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s =
    typeof v === 'object' ? JSON.stringify(v) : String(v as string | number)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// 섹션 1개 → CSV 블록 (헤더 = 전 행 키의 합집합, 등장 순서 유지)
function sectionToCsv(name: string, rows: Row[]): string {
  const cols: string[] = []
  for (const r of rows)
    for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)
  const lines = [
    `# ${name}`,
    cols.join(','),
    ...rows.map((r) => cols.map((c) => escapeCell(r[c])).join(',')),
  ]
  return lines.join('\n')
}

export function buildCsv(
  sections: Array<{ name: string; rows: Row[] }>,
): string {
  return sections.map((s) => sectionToCsv(s.name, s.rows)).join('\n\n')
}

// BOM 포함 다운로드 — 엑셀에서 한글 헤더가 깨지지 않도록
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
