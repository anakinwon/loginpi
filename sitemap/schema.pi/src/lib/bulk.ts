// 일괄등록 공용(순수 함수, 화면·서버 공용) — CSV 파싱, 헤더 대응, 행안부 공통표준 값 변환(한자 분리·도메인명 분해·도메인유형)
// 설계 : docs/design/bulk-import.md. DB 조회가 필요한 판정은 bulk-check.ts

export const BULK_KINDS = ['words', 'domains', 'terms', 'forbidden', 'codes'] as const
export type BulkKind = (typeof BULK_KINDS)[number]
export type BulkStatus = 'OK' | 'NSTD' | 'SKIP' | 'EXCL' | 'ERR'
export interface BulkResult {
  row_no: number
  status: BulkStatus
  name: string
  code?: string
  detail?: string
  keys?: string[] // 정상·비표준 행의 유일 이름(묶음 사이 중복 대조용)
}
export const BATCH_SIZE = 1000
export const MAX_ROWS = 20000

// 유형별 CSV 헤더(행안부 공통표준 2025-11-01 양식) — 키 = 내부 이름, 값 = 헤더 문자열, required = 필수 헤더
export const HEADERS = {
  words: {
    log_nm: '공통표준단어명',
    phy_nm: '공통표준단어영문약어명',
    eng_nm: '공통표준단어 영문명',
    desc: '공통표준단어 설명',
    fmt_word: '형식단어여부',
    syns: '이음동의어 목록',
    forbid: '금칙어 목록',
    rev: '개정구분명(폐기 또는 변경)',
    key_dom: '대표도메인여부',
  },
  domains: {
    grp_nm: '공통표준도메인그룹명',
    key_nm: '공통표준도메인분류명',
    dom_nm: '공통표준도메인명',
    desc: '공통표준도메인설명',
    tp_nm: '데이터타입',
    len: '데이터길이',
    scale: '데이터소수점길이',
    stor_fmt: '저장형식',
    disp_fmt: '표현형식',
    unit: '단위',
    alw: '허용값',
    rev: '개정구분명(폐기 또는 변경)',
  },
  terms: {
    log_nm: '공통표준용어명',
    desc: '공통표준용어설명',
    phy_nm: '공통표준용어영문약어명',
    dom_nm: '공통표준도메인명',
    alw: '허용값',
    disp_fmt: '표현 형식',
    adm_cd: '행정표준코드명',
    org: '소관기관명',
    syns: '용어 이음동의어 목록',
    rev: '개정구분명(폐기 또는 변경)',
  },
  // 금칙어·이음동의어(2026-10-18) — 행안부 공통표준단어의 금칙어·이음동의어 목록을 한 행 한 표기로 펼친 양식. 구분 = 금칙어|이음동의어(BAN|SYN)
  forbidden: {
    tp: '구분',
    txt: '금칙어·이음동의어',
    word: '대체 표준단어',
  },
  // 표준코드(공통코드, 2026-10-20) — 한 행 = 코드상세 하나. 코드명 = ~구분코드·~종류코드·~유형코드 확정 표준용어, 없는 코드기본은 첫 행의 코드분류로 함께 등록
  codes: {
    cd_nm: '코드명',
    cls: '코드분류',
    val: '코드값',
    val_nm: '코드값명',
    sort: '정렬순서',
    use: '사용여부',
    desc: '코드값설명',
  },
} as const
export const REQUIRED: Record<BulkKind, string[]> = {
  words: ['log_nm', 'phy_nm'],
  domains: ['grp_nm', 'key_nm', 'tp_nm'],
  terms: ['log_nm', 'phy_nm', 'dom_nm'],
  forbidden: ['tp', 'txt', 'word'],
  codes: ['cd_nm', 'val', 'val_nm'],
}

// RFC 4180 CSV 파서 — 따옴표 안 쉼표·줄바꿈·"" 이스케이프, UTF-8 BOM 제거, 빈 줄 제외
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some((v) => v !== '')) rows.push(row)
  return rows
}

// 헤더 → 내부 이름별 열 위치. 필수 헤더가 없으면 빠진 헤더 문자열 목록을 돌려준다
export function mapHeader(kind: BulkKind, header: string[]): { idx: Record<string, number> } | { missing: string[] } {
  const H = HEADERS[kind] as Record<string, string>
  const norm = header.map((h) => h.trim())
  const idx = Object.fromEntries(Object.entries(H).map(([k, h]) => [k, norm.indexOf(h)]))
  const missing = REQUIRED[kind].filter((k) => idx[k] < 0).map((k) => H[k])
  return missing.length ? { missing } : { idx }
}

// 행 → 내부 이름별 값(앞뒤 공백 제거, 없는 열은 '')
export const pick = (idx: Record<string, number>, row: string[]) =>
  Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? (row[i] ?? '').trim() : ''])) as Record<string, string>

// 단어 설명 앞부분의 한자 표기 분리 : '一回投與量. 한 번에…' → { chn: '一回投與量', desc: '한 번에…' }
export function splitChn(desc: string): { chn: string | null; desc: string } {
  const m = /^([㐀-鿿豈-﫿]+)\.\s*([\s\S]*)$/.exec(desc.trim())
  return m ? { chn: m[1], desc: m[2].trim() } : { chn: null, desc: desc.trim() }
}

// 쉼표 목록 → 중복·빈 값 제거 배열
export const splitList = (s: string) => [...new Set(s.split(',').map((v) => v.trim()).filter(Boolean))]

// 행안부 도메인명 분해 : '가격N9,2' → { key: '가격', tp: 'NUMERIC', len: 9, scale: 2 }, '연월일시분초D' → DATETIME 길이 없음
const MOIS_TP: Record<string, string> = { N: 'NUMERIC', V: 'VARCHAR', C: 'CHAR', D: 'DATETIME' }
export function parseMoisDomName(nm: string): { key: string; tp: string; len: number | null; scale: number | null } | null {
  const m = /^(.*[^A-Z0-9,])([NVCD])(\d*)(?:,(\d+))?$/.exec(nm.trim())
  if (!m) return null
  return { key: m[1], tp: MOIS_TP[m[2]], len: m[3] ? Number(m[3]) : null, scale: m[4] ? Number(m[4]) : null }
}

// 도메인유형 : 그룹 번호 → NO, 코드 → CD, 그 외 → GNRL(2026-10-15 마스터 결정 D8)
export const domTpByGrp = (grp: string) => (grp === '번호' ? 'NO' : grp === '코드' ? 'CD' : 'GNRL')

// 대표도메인명 → 도메인그룹 추정(등록 폼 자동 선택, 2026-10-18) — ① 그룹명 = 대표도메인명 ② 그룹 설명의 구성 목록('… : 금액·가격·비용·요금', 끝 '류' 무시)에 있음
// ③ 대표도메인명이 그룹명으로 끝남(일련번호 → 번호). 못 찾으면 null(사용자가 고름)
export function guessDomGroup<G extends { dom_grp_nm: string; dom_grp_desc?: string | null }>(key: string, groups: G[]): G | null {
  const members = (g: G) => (g.dom_grp_desc?.split(':').pop() ?? '').split(/[·,]/).map((m) => m.trim().replace(/류$/, '')).filter(Boolean)
  return groups.find((g) => g.dom_grp_nm === key) ?? groups.find((g) => members(g).includes(key)) ?? groups.find((g) => key.endsWith(g.dom_grp_nm)) ?? null
}

export const isDiscarded = (rev: string) => rev === '폐기'

// 숫자 칸 : 빈 값 → null, 정수 아님 → NaN
export const toInt = (s: string) => (s === '' ? null : /^\d+$/.test(s) ? Number(s) : NaN)

// 묶음 사이 중복 : 서버는 묶음 안만 대조하므로, 앞 묶음 정상 행과 이름이 겹치는 뒤 행을 DUP_IN_FILE 오류로 바꾼다(검증 결과 = 반영 결과 일치)
export function markCrossBatchDup(results: BulkResult[]): BulkResult[] {
  const seen = new Set<string>()
  return results.map((r) => {
    if (!r.keys) return r
    const dup = r.keys.some((k) => seen.has(k))
    r.keys.forEach((k) => seen.add(k))
    return dup ? { row_no: r.row_no, status: 'ERR', name: r.name, code: 'DUP_IN_FILE', detail: '파일 안에 같은 이름이 앞 행에 있습니다' } : r
  })
}

// 행 배열 → CSV(UTF-8 BOM : 엑셀에서 한글이 깨지지 않음, CRLF)
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

// 결과 → CSV(화면 내려받기)
export const resultsCsv = (results: BulkResult[]) => toCsv([['행', '판정', '이름', '코드', '내용'], ...results.map((r) => [r.row_no, r.status, r.name, r.code, r.detail])])

// 등록일시 표시(한국 시간 'YYYY-MM-DD HH:mm:ss') — CSV 출력·목록 화면 공용
export const kstDtm = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) : '')
