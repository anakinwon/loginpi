'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 등록·수정 폼(논리 모델 화면용, sql/026 모델 단계) — 주제영역·엔터티명 → 승인 표준단어 분해 후보·물리명 미리보기(GET …/entities/analyze) → 유형·설명·단계
// 등록 = 논리 엔터티(LGCL), 수정 = 이름(분해 후보 다시 선택)·유형·설명·주제영역(같은 프로젝트)·단계(논리·핵심 승격). 이름은 서버가 표준단어로 다시 만든다(클라이언트 값 불신)
import { Link } from '@/i18n/navigation'
import { useEffect, useRef, useState } from 'react'
import { ENT_TP, ENT_TP_DESC } from '@/lib/model-name'
import { InfoTip } from '@/components/page-head'
import { confirmSave } from '../words/word-board'

export interface EntInit {
  ent_id: string
  ver_no: number
  subj_id: string
  ent_log_nm: string
  ent_tp_cd: string
  ent_desc: string | null
  ent_asst_nm?: string | null
  dic_ids: string[]
  mdl_lvl_cd: string
}
interface Cand {
  segments: ({ word: { dic_log_nm: string } } | { unknown: string })[]
  complete: boolean
  ent_log_nm?: string
  tbl_phy_nm?: string
  too_long?: boolean
  dic_ids?: string[]
  dup?: boolean
  rule_error?: string | null
}
const RULE_MSG: Record<string, string> = {
  ENT_FORBIDDEN_WORD: '금칙어 포함',
  ENT_LAST_ATTR: '속성 분류어(도메인 단어)로 끝남 : 테이블명은 속성 불필요',
}
interface Rec {
  nm: string
  tp: string
  desc: string
  tbl_phy_nm: string
  ok: boolean
  missing_words: string[]
  rule_error: string | null
  src: 'AI' | 'industry' | 'rule'
}
const SRC_NM = { AI: 'AI', industry: '업종', rule: '규칙' } as const
const LVL_NM: Record<string, string> = { LGCL: '논리', CNCP: '핵심' }
const DELAY = 400

export default function EntForm({ api, areaId, subjs, init, onDone, onCancel }: { api: string; areaId: string; subjs: { subj_id: string; subj_nm: string }[]; init?: EntInit; onDone: (entId: string, msg: string) => void; onCancel: () => void }) {
  const [subj, setSubj] = useState(init?.subj_id ?? subjs[0]?.subj_id ?? '')
  const [name, setName] = useState(init?.ent_log_nm ?? '')
  const [tp, setTp] = useState(init?.ent_tp_cd ?? 'BASE')
  const [desc, setDesc] = useState(init?.ent_desc ?? '')
  const [asst, setAsst] = useState(init?.ent_asst_nm ?? '') // 보조명(sql/035)
  const [lvl, setLvl] = useState(init?.mdl_lvl_cd ?? 'LGCL')
  const [cands, setCands] = useState<Cand[]>([])
  const [pick, setPick] = useState(0)
  const [msg, setMsg] = useState('')
  // 추천(등록 모드만) : 주제영역을 고르면 업종 템플릿·규칙 후보, "AI 추천"은 AI 후보까지(GET …/entities/suggest, 저장 없음)
  const [recs, setRecs] = useState<Rec[]>([])
  const [recSrc, setRecSrc] = useState<string[]>([])
  const [recBusy, setRecBusy] = useState(false)
  const recSeq = useRef(0)
  const loadRecs = async (ai: boolean) => {
    if (!subj) return
    // 늦게 온 이전 주제영역 응답은 버림(AI 6~9초 사이 주제영역 변경)
    const seq = ++recSeq.current
    setRecBusy(true)
    const j = await (await piFetch(`${api}/entities/suggest?${new URLSearchParams({ subj, ...(ai ? { ai: '1' } : {}) })}`)).json().catch(() => null)
    if (seq !== recSeq.current) return
    setRecBusy(false)
    if (!j?.ok) return setMsg(j?.message ?? '추천을 불러오지 못했습니다')
    setRecs(j.items)
    setRecSrc(j.src)
    if (ai && !j.ai_used) setMsg('AI 추천을 쓸 수 없어 업종 템플릿·규칙 후보만 보여 줍니다')
  }
  useEffect(() => {
    if (init || !subj) return
    setRecs([])
    void loadRecs(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subj, init])
  const pickRec = (r: Rec) => {
    setName(r.nm)
    setTp(r.tp)
    setDesc(r.desc)
    setMsg('')
  }

  // 주제영역 목록이 폼보다 늦게 도착하면 첫 주제영역으로
  useEffect(() => {
    if (!subj && subjs[0]) setSubj(subjs[0].subj_id)
  }, [subj, subjs])
  useEffect(() => {
    const nm = name.trim()
    if (!nm) return setCands([])
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${api}/entities/analyze?${new URLSearchParams({ name: nm, tp, ...(subj ? { subj } : {}) })}`)).json()
      if (j.ok) {
        setCands(j.candidates)
        setPick(0)
      }
    }, DELAY)
    return () => clearTimeout(t)
  }, [api, name, tp, subj])

  const cur = cands[pick]
  // 수정 중 자기 이름은 중복이 아님
  const dup = !!cur?.dup && cur.ent_log_nm !== init?.ent_log_nm
  const ok = !!subj && !!cur?.complete && !cur.rule_error && !dup

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || !confirmSave(!!init, `엔터티 ${cur.ent_log_nm}(${LVL_NM[lvl]})을(를) `)) return
    const body = { subj_id: subj, dic_ids: cur.dic_ids, ent_tp_cd: tp, ent_desc: desc.trim() || null, ent_asst_nm: asst.trim() || null, mdl_lvl_cd: lvl }
    const j = await (
      await piFetch(init ? `${api}/entities/${init.ent_id}` : `${api}/entities`, {
        method: init ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(init ? { ...body, ver_no: init.ver_no } : body),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    onDone(j.item.ent_id, `엔터티 ${j.item.ent_log_nm} ${init ? '수정' : '등록'} 완료`)
  }

  return (
    <form onSubmit={save} className="panel text-sm" aria-label={init ? '엔터티 수정' : '엔터티 추가'}>
      <h3 className="panel-head" data-mode={init ? 'edit' : undefined}>
        <span className="truncate">{init ? `엔터티 수정 : ${init.ent_log_nm}` : '논리 엔터티 추가'}</span>
      </h3>
      <div className="panel-body space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <select value={subj} onChange={(e) => setSubj(e.target.value)} className="input" aria-label="주제영역">
            {subjs.length === 0 && <option value="">주제영역 없음(개념 모델에서 등록)</option>}
            {subjs.map((s) => (
              <option key={s.subj_id} value={s.subj_id}>
                {s.subj_nm}
              </option>
            ))}
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="엔터티명" maxLength={200} className="input md:col-span-2" aria-label="엔터티명" />
          <select value={tp} onChange={(e) => setTp(e.target.value)} className="input" aria-label="엔터티 유형">
            {Object.entries(ENT_TP).map(([k, v]) => (
              <option key={k} value={k} title={ENT_TP_DESC[k as keyof typeof ENT_TP]}>
                {v}
              </option>
            ))}
          </select>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" maxLength={4000} className="input md:col-span-3" aria-label="설명" />
          <input value={asst} onChange={(e) => setAsst(e.target.value)} placeholder="보조명" title="약칭·영문명 등, ERD 개체명 보기옵션" maxLength={200} className="input" aria-label="보조명" />
          {init && (
            <select value={lvl} onChange={(e) => setLvl(e.target.value)} className="input" aria-label="모델 단계">
              <option value="LGCL">논리 엔터티</option>
              <option value="CNCP">핵심 엔터티(개념 모델에 표시)</option>
            </select>
          )}
        </div>
        {!init && subj && (
          <div className="rounded-control border border-line bg-well p-2 text-xs" aria-label="엔터티 추천">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-ink-2">엔터티 추천</span>
                <InfoTip>누르면 이름·유형·설명을 채움. 빨강 = 표준단어 신청 필요</InfoTip>
              </span>
              <span className="text-ink-3">{recSrc.join(' · ')}</span>
              <button type="button" onClick={() => void loadRecs(true)} disabled={recBusy} className="btn-key btn-sm ms-auto">
                {recBusy ? '추천 중' : 'AI 추천'}
              </button>
            </div>
            {recs.length === 0 ? (
              <p className="py-2 text-ink-3">{recBusy ? '불러오는 중' : '추천 없음'}</p>
            ) : (
              <ul className="divide-y divide-line">
                {recs.map((r) => (
                  <li key={r.nm}>
                    <button type="button" onClick={() => pickRec(r)} className={`flex w-full flex-wrap items-center gap-2 rounded-control px-1 py-1.5 text-start transition-colors hover:bg-raised ${r.ok ? '' : 'text-danger'}`} title={r.desc}>
                      <span className="font-medium">{r.nm}</span>
                      <span className="badge">
                        {ENT_TP[r.tp as keyof typeof ENT_TP]} · {SRC_NM[r.src]}
                      </span>
                      {r.ok && <span className="chip-phy">{r.tbl_phy_nm}</span>}
                      {r.missing_words.length > 0 && <span>미등록 단어 : {r.missing_words.join(', ')}</span>}
                      {r.rule_error && <span>{RULE_MSG[r.rule_error] ?? r.rule_error}</span>}
                      <span className="block w-full truncate text-ink-3">{r.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {cands.length > 0 && (
          <div className="space-y-1">
            {cands.map((c, i) => (
              <label key={i} className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-control border px-3 py-1.5 transition-colors ${i === pick ? 'border-accent-ink/40 bg-accent-soft' : 'border-transparent hover:bg-raised'}`}>
                <input type="radio" checked={i === pick} onChange={() => setPick(i)} />
                {c.segments.map((s, k) =>
                  'word' in s ? (
                    <span key={k} className="badge">
                      {s.word.dic_log_nm}
                    </span>
                  ) : (
                    <span key={k} className="badge" data-tone="danger">
                      {s.unknown} 미등록
                    </span>
                  ),
                )}
                {c.complete && (
                  <span className="inline-flex items-center gap-1">
                    <span className="chip-phy" data-size="lg">
                      {c.tbl_phy_nm}
                    </span>
                    {c.too_long && (
                      <span className="badge" data-tone="warn">
                        25자 초과
                      </span>
                    )}
                  </span>
                )}
                {c.rule_error && <span className="text-danger">{RULE_MSG[c.rule_error] ?? c.rule_error}</span>}
                {c.dup && c.ent_log_nm !== init?.ent_log_nm && <span className="text-danger">같은 이름의 엔터티 있음</span>}
              </label>
            ))}
            {cur && !cur.complete && (
              <p className="text-xs text-danger">
                미등록 단어 있음 ·{' '}
                <Link href={`/areas/${areaId}/words`} className="text-accent-ink hover:underline">
                  표준단어 신청
                </Link>
              </p>
            )}
          </div>
        )}
        {msg && (
          <p role="status" className="text-dense text-danger">
            {msg}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-key">
            취소
          </button>
          <button disabled={!ok} className="btn-3d">
            {init ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </form>
  )
}
