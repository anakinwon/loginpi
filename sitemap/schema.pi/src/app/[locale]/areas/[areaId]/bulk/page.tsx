'use client'
import { piFetch } from '@pi/auth/client'
// 일괄등록 화면 — 유형 = ?tab=words|domains|terms|forbidden|codes(하단 메뉴 표준단어·표준도메인·표준용어의 서브 '일괄등록', 마스터 지시 2026-10-17 — 화면 안 유형 탭 없음) → CSV 선택 → 검증(묶음별 check) → 결과 표·CSV 내려받기 → 반영(묶음별 apply, 서버 재검증)
// 일괄등록 권한(roles.ts 권한표) 전용(API가 확인), 반영 행은 승인대기. 순서 : 단어 → 도메인 → 용어. 설계 docs/design/bulk-import.md
import { Link } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { use, useEffect, useRef, useState } from 'react'
import { Download, FileUp, TriangleAlert } from 'lucide-react'
import { Icon3D } from '@/components/icon-3d'
import { PageHead } from '@/components/page-head'
import { BATCH_SIZE, HEADERS, MAX_ROWS, markCrossBatchDup, parseCsv, resultsCsv, type BulkKind, type BulkResult, type BulkStatus } from '@/lib/bulk'

const KIND_NM: Record<BulkKind, string> = { words: '표준단어', domains: '표준도메인', terms: '표준용어', forbidden: '금칙어', codes: '표준코드' }
// 반영 뒤 이동 화면(승인 대상이 아닌 금칙어·표준코드는 각 목록, 나머지는 승인 화면)
const DONE: Partial<Record<BulkKind, [string, string]>> = { forbidden: ['forbidden', '금칙어 목록으로'], codes: ['codes', '표준코드 목록으로'] }
const ST_NM: Record<BulkStatus, string> = { OK: '정상', NSTD: '비표준 수용', SKIP: '이미 있음(건너뜀)', EXCL: '폐기 행 제외', ERR: '오류' }
// 판정 배지 색조(badge data-tone) — 정상 = ok, 비표준 수용 = warn, 오류 = danger, 건너뜀·제외 = 기본 회색
const ST_TONE: Record<BulkStatus, string | undefined> = { OK: 'ok', NSTD: 'warn', SKIP: undefined, EXCL: undefined, ERR: 'danger' }
const SHOW = 500

export default function BulkPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const q = useSearchParams().get('tab')
  const kind: BulkKind = q === 'domains' || q === 'terms' || q === 'forbidden' || q === 'codes' ? q : 'words'
  const [file, setFile] = useState<{ name: string; header: string[]; rows: string[][] } | null>(null)
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const [mode, setMode] = useState<'check' | 'apply' | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const kindRef = useRef(kind) // 진행 중 유형이 바뀌면(메뉴 이동) 이전 유형 결과를 버리기 위함
  kindRef.current = kind

  const resetResult = () => {
    setResults(null)
    setApplied(null)
    setMode(null)
    setMsg('')
  }
  // 하단 메뉴로 유형이 바뀌면(같은 화면 재사용) 선택 파일·결과 초기화
  useEffect(() => {
    setFile(null)
    resetResult()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])
  const pickFile = async (f: File | undefined) => {
    resetResult()
    setFile(null)
    if (!f) return
    const all = parseCsv(await f.text())
    if (all.length < 2) return setMsg('데이터 행이 없습니다')
    if (all.length - 1 > MAX_ROWS) return setMsg(`최대 ${MAX_ROWS.toLocaleString()}행까지 올릴 수 있습니다(현재 ${(all.length - 1).toLocaleString()}행)`)
    setFile({ name: f.name, header: all[0], rows: all.slice(1) })
  }

  // 묶음(1,000행)별 순차 호출 — 첫 데이터 행 번호 = 2(헤더 1행)
  const run = async (m: 'check' | 'apply') => {
    if (!file) return
    const k = kind
    if (m === 'apply' && !confirm(`${KIND_NM[kind]} ${okCount.toLocaleString()}건을 반영합니다`)) return
    setMsg('')
    const out: BulkResult[] = []
    let done = 0
    for (let i = 0; i < file.rows.length; i += BATCH_SIZE) {
      setBusy(`${m === 'check' ? '검증' : '반영'} 중 ${Math.min(i + BATCH_SIZE, file.rows.length).toLocaleString()} / ${file.rows.length.toLocaleString()}행`)
      const res = await piFetch(`/api/areas/${areaId}/bulk/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, start_row: i + 2, header: file.header, rows: file.rows.slice(i, i + BATCH_SIZE) }),
      })
      const j = await res.json()
      if (!j.ok) {
        setMsg(`${j.message}${i ? ` (${(i + 2).toLocaleString()}행부터 중단, 앞 묶음은 ${m === 'apply' ? '반영됨' : '검증됨'})` : ''}`)
        break
      }
      out.push(...j.results)
      done += j.applied
    }
    setBusy('')
    if (kindRef.current !== k) return // 메뉴로 유형이 바뀜 — 새 유형 화면에 이전 결과를 쓰지 않음
    setResults(m === 'check' ? markCrossBatchDup(out) : out)
    setMode(m)
    setApplied(m === 'apply' ? done : null)
  }

  const count = (s: BulkStatus) => results?.filter((r) => r.status === s).length ?? 0
  const okCount = count('OK') + count('NSTD')
  const issues = results?.filter((r) => r.status !== 'OK') ?? []
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([resultsCsv(results ?? [])], { type: 'text/csv;charset=utf-8' }))
    a.download = `${kind}-${mode}-결과.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead
        title={`${KIND_NM[kind]} 일괄등록`}
        info={
          <div className="space-y-2">
            <p>
              {kind === 'codes'
                ? 'CSV(UTF-8) 한 행 = 코드상세 하나 : 코드명(~구분코드·~종류코드·~유형코드 확정 표준용어, 코드형 도메인), 코드분류, 코드값, 코드값명, 정렬순서, 사용여부(Y·N, 비우면 Y), 코드값설명. 코드기본이 없으면 첫 행의 코드분류로 함께 등록합니다. 승인 없이 바로 반영되며 이미 있는 코드값은 건너뜁니다. 같은 코드 안 코드값명은 겹칠 수 없습니다'
                : kind === 'forbidden'
                ? 'CSV(UTF-8) 한 행 = 표기 하나 : 구분(금칙어·이음동의어), 표기, 대체 표준단어(승인완료 논리명). 승인 없이 바로 반영되며, 반영된 표기는 표준단어로 등록할 수 없습니다. 같은 단어에 이미 있는 표기는 건너뜁니다. 데이터아키텍트·표준담당자 전용'
                : '행안부 공공데이터 공통표준 CSV 양식(UTF-8). 단어 → 도메인 → 용어 순서로 반영하십시오. 이미 있는 이름은 건너뜁니다. 반영된 행은 승인대기로 저장됩니다. 승인 화면에서 단어 → 도메인 → 용어 순서로 승인하십시오. 데이터아키텍트·표준담당자 전용'}
            </p>
            <p className="font-mono text-xs text-ink-3">{Object.values(HEADERS[kind]).join(', ')}</p>
          </div>
        }
        actions={
          kind === 'codes' && (
            // 엑셀 템플릿(scripts/gen-code-template.py 생성, 시트 = 표준코드·작성안내·작성예시) — 작성 뒤 CSV UTF-8 로 저장해 올림
            <a href="/templates/std-code-bulk-template.xlsx" download="표준코드_일괄등록_템플릿.xlsx" className="btn-key">
              <Download aria-hidden />
              템플릿
            </a>
          )
        }
      />
      {/* 파일 선택 대화창 — 버튼(또는 끌어다 놓기)으로 숨긴 기본 file input 을 연다. value 초기화 = 같은 파일을 다시 골라도 onChange 발생 */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void pickFile(e.target.files?.[0])
          e.target.value = ''
        }}
        aria-label="CSV 파일"
      />
      <button
        type="button"
        disabled={!!busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void pickFile(e.dataTransfer.files?.[0])
        }}
        className={`panel empty w-full border-dashed transition-colors ${drag ? 'border-accent-ink bg-accent-soft' : 'border-line-strong hover:bg-raised'}`}
      >
        <Icon3D icon={FileUp} />
        CSV 파일 선택 · 끌어다 놓기
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {file ? (
          <span className="me-auto text-dense text-ink">
            <span className="font-medium">{file.name}</span> <span className="font-mono text-xs text-ink-3 tabular-nums">{file.rows.length.toLocaleString()}행</span>
          </span>
        ) : (
          <span className="me-auto text-dense text-ink-3">선택한 파일 없음</span>
        )}
        {results && (
          <button onClick={download} className="btn-ghost btn-sm">
            <Download aria-hidden />
            결과 CSV
          </button>
        )}
        <button disabled={!file || !!busy} onClick={() => run('check')} className="btn-key">
          검증
        </button>
        <button disabled={!file || !!busy || mode !== 'check' || okCount === 0} onClick={() => run('apply')} className="btn-3d">
          반영{mode === 'check' && okCount ? ` ${okCount.toLocaleString()}건` : ''}
        </button>
      </div>
      {busy && (
        <p role="status" className="mt-2 flex items-center gap-2 text-dense text-ink-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          {busy}
        </p>
      )}
      {msg && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-dense text-danger">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {msg}
        </p>
      )}
      {results && (
        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{mode === 'apply' ? `반영 완료 ${applied?.toLocaleString()}건` : '검증 결과'}</h2>
            {(Object.keys(ST_NM) as BulkStatus[]).map((s) => (
              <span key={s} className="badge" data-tone={ST_TONE[s]}>
                {ST_NM[s]} <span className="tabular-nums">{count(s).toLocaleString()}</span>
              </span>
            ))}
            {mode === 'apply' && (
              <Link href={`/areas/${areaId}/${DONE[kind]?.[0] ?? 'approvals'}`} className="ms-auto text-xs text-accent-ink hover:underline">
                {DONE[kind]?.[1] ?? '승인 화면으로'}
              </Link>
            )}
          </div>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense">
              <thead>
                <tr className="thead-3d text-start">
                  {['행', '판정', '이름', '내용'].map((h) => (
                    <th key={h} className="border-b px-3 py-2 text-start">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-3">
                      정상 외 행 없음
                    </td>
                  </tr>
                ) : (
                  issues.slice(0, SHOW).map((r) => (
                    <tr key={r.row_no}>
                      <td className="border px-3 py-1.5 text-end font-mono text-xs text-ink-3 tabular-nums">{r.row_no}</td>
                      <td className="whitespace-nowrap border px-3 py-1.5">
                        <span className="badge" data-tone={ST_TONE[r.status]}>
                          {ST_NM[r.status]}
                        </span>
                      </td>
                      <td className="border px-3 py-1.5 font-medium">{r.name}</td>
                      <td className="border px-3 py-1.5 text-ink-2">{r.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {issues.length > SHOW && <p className="hint">정상 외 {issues.length.toLocaleString()}행 중 {SHOW}행만 표시 : 전체는 결과 CSV</p>}
        </section>
      )}
    </main>
  )
}
