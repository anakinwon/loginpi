'use client'
import { piFetch } from '@pi/auth/client'
// 개념 모델 화면(PRD §2.5 MD1) — 상단 프로젝트(여러 개) 선택·등록, 그 아래 왼쪽 주제영역(2레벨·약어 3자) 트리·등록·수정·삭제, 오른쪽 선택 주제영역의 핵심 엔터티 등록(표준단어 분해 → 논리명·물리 테이블명 미리보기)·목록
// 주제영역명 입력 시 약어 3자·설명 자동 채움(/subjects/suggest, 저장 안 함), 선택 주제영역의 핵심 엔터티 추천 칩(누르면 엔터티명 채움)
// 탭(?tab=, 하단 메뉴 서브 탭) : prj 프로젝트(기본) · subj 주제영역 · ent 핵심엔터티(주제영역 목록으로 소속 선택 + 관계) — 엔터티 분류어는 별도 화면(/entity-classes)
// 엔터티 이름은 승인완료 표준단어로만 생성(미등록 단어는 표준단어 신청), 끝 단어 엔터티 분류어 → 테이블 접미어(TB_주제영역_단어_접미어)
import Link from 'next/link'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { type MbrRole, type Perm } from '@/lib/roles'
import { ActorCells, noEnterSubmit } from '../words/word-board'
import Relations from './relations'
import Attrs from './attrs'

interface Prj {
  prj_id: string
  prj_nm: string
  prj_desc: string | null
  indstry_cd: string | null
  tbl_pfx_txt: string
  trgt_dbms_cd: string
  sort_seq: number
  ver_no: number
}
interface Subj {
  prj_id: string
  subj_id: string
  up_subj_id: string | null
  subj_nm: string
  subj_abbr_nm: string
  subj_desc: string | null
  sort_seq: number
  ver_no: number
}
interface Ent {
  ent_id: string
  ent_log_nm: string
  ent_tp_cd: string
  ent_desc: string | null
  ver_no: number
  tbl_phy_nm: string
  too_long: boolean
  words: { dic_log_nm: string; ok: boolean }[]
  mdl_subj: { subj_nm: string; subj_abbr_nm: string }
  mdl_lvl_cd: string
  regr_nm?: string | null
  reg_dtm: string
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
const TP_NM: Record<string, string> = {
  BASE: '실체·기준',
  ACT: '행위',
  AGG: '집계',
}
const RULE_MSG: Record<string, string> = {
  ENT_FORBIDDEN_WORD: '금칙어 포함',
  ENT_LAST_ATTR: '속성 분류어(도메인 단어)로 끝남 : 테이블명은 속성 불필요',
  ENT_AGG_SUFFIX: "집계 엔터티는 '집계'로 끝나야 함",
}
// 업종(Industry) — 프로젝트 등록 시 추천(반자동 : 사용자가 골라 저장), 코드 sql/022·템플릿 src/data/industry
interface Ind {
  cd: string
  nm: string
  traits: { biz: string; reg: string; data: string; volume: string }
}
interface EntSug {
  ent_log_nm: string
  tbl_phy_nm: string
  dic_ids: string[]
  ent_tp_cd: string
  ent_desc: string
  ok: boolean
  missing_words: string[]
  rule_error: string | null
  src: 'industry' | 'pattern'
}
interface SubjRec {
  nm: string
  eng: string
  abbr: string
  desc: string
  std_ok: boolean
  missing_words: string[]
}
// tbl_pfx_txt = 스키마 접두사(물리 테이블명 맨 앞, 영문 대문자 2~4자, sql/023) — 비우면 서버 기본 TB
// trgt_dbms_cd = 대상 DBMS(예정, 필수, sql/024) — 물리명 미리보기 대소문자 기준, 물리 모델(MD5)에서 확정
const PF0 = { prj_nm: '', prj_desc: '', indstry_cd: '', tbl_pfx_txt: '', trgt_dbms_cd: '' }
interface DbmsOpt {
  cd: string
  nm: string
  identCase: string
  identMax: number
  pk: string
  fk: string
  idx: string
  partition: string
}
const PFX_RE = /^[A-Z]{2,4}$/
const SUBJ0 = {
  subj_nm: '',
  subj_abbr_nm: '',
  up_subj_id: '',
  subj_desc: '',
  sort_seq: '1',
}

export default function ModelPage({ params, searchParams }: { params: Promise<{ areaId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { areaId } = use(params)
  const t = use(searchParams).tab
  const tab = t === 'subj' || t === 'ent' ? t : 'prj'
  const api = `/api/areas/${areaId}`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [subjs, setSubjs] = useState<Subj[]>([])
  const [sel, setSel] = useState<Subj | null>(null)
  const [prjs, setPrjs] = useState<Prj[]>([])
  const [prj, setPrj] = useState<Prj | null>(null)
  const [pf, setPf] = useState(PF0)
  const [inds, setInds] = useState<Ind[]>([])
  const [indSug, setIndSug] = useState<{ cd: string; nm: string; why: string[] }[]>([])
  const [pEdit, setPEdit] = useState<Prj | null>(null)
  const [chk, setChk] = useState<Set<string>>(new Set())
  const [sf, setSf] = useState(SUBJ0)
  const [sEdit, setSEdit] = useState<Subj | null>(null)
  const [ents, setEnts] = useState<Ent[]>([])
  // 속성 패널을 펼친 엔터티(MD3) — 단건 등록 직후 자동 펼침(주식별자·필수 속성 추천 즉시 노출)
  const [openEnt, setOpenEnt] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [ef, setEf] = useState({ name: '', tp: 'BASE', desc: '' })
  // 논리 모델에서 추가한 엔터티(LGCL, sql/026)까지 보기 — 기본 = 핵심 엔터티만
  const [withLg, setWithLg] = useState(false)
  const [cands, setCands] = useState<Cand[]>([])
  const [pick, setPick] = useState(0)
  const [msg, setMsg] = useState('')
  // 자동 채움 : 출처·약어 대안·직전 채운 값(입력자가 고친 칸은 덮어쓰지 않음), 선택 주제영역 엔터티 추천
  const [sug, setSug] = useState<{
    busy: boolean
    src: string[]
    alts: string[]
    isWord: boolean | null
  }>({ busy: false, src: [], alts: [], isWord: null })
  const lastFill = useRef<{ subj_abbr_nm: string; subj_desc: string }>({
    subj_abbr_nm: '',
    subj_desc: '',
  })
  const [entSug, setEntSug] = useState<EntSug[]>([])
  // 업종 주제영역 추천(프로젝트 업종 지정 시, 반자동 : 칩을 누르면 폼만 채움)
  const [subjRecs, setSubjRecs] = useState<SubjRec[]>([])
  const [subjChk, setSubjChk] = useState<Set<string>>(new Set())
  // 업종 목록(1회)·업종 추천(프로젝트명·설명 입력 0.4초 뒤, 저장 안 함)
  // 대상 DBMS 프로파일 목록(1회, sql/024) — 콤보·툴팁(이름은 물리 모델 전환 전까지 항상 대문자)
  const [dbmsOpts, setDbmsOpts] = useState<DbmsOpt[]>([])
  useEffect(() => {
    piFetch('/api/dbms-profiles')
      .then((r) => r.json())
      .then((j) => j.ok && setDbmsOpts(j.dbms))
  }, [])
  const dbmsNm = (cd: string) => dbmsOpts.find((x) => x.cd === cd)?.nm ?? cd
  const dbmsTitle = (cd: string) => {
    const d = dbmsOpts.find((x) => x.cd === cd)
    return d ? `${d.nm} : 식별자 최대 ${d.identMax}자, 물리 모델 전환 시 ${d.identCase === 'lower' ? '소문자' : '대문자'} 기본 제안(그 전 단계는 항상 대문자)
PK ${d.pk}
FK ${d.fk}
인덱스 ${d.idx}
파티션 ${d.partition}` : ''
  }
  useEffect(() => {
    piFetch('/api/industries')
      .then((r) => r.json())
      .then((j) => j.ok && setInds(j.industries))
  }, [])
  useEffect(() => {
    const text = `${pf.prj_nm} ${pf.prj_desc}`.trim()
    if (!text) return setIndSug([])
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${api}/projects/suggest?${new URLSearchParams({ text })}`)).json()
      if (j.ok) setIndSug(j.industries)
    }, 400)
    return () => clearTimeout(t)
  }, [api, pf.prj_nm, pf.prj_desc])
  const indNm = (cd: string) => inds.find((x) => x.cd === cd)?.nm ?? cd
  const indTitle = (cd: string) => {
    const t = inds.find((x) => x.cd === cd)?.traits
    return t
      ? `핵심 업무 : ${t.biz}
규제 : ${t.reg}
데이터 특성 : ${t.data}
대용량 : ${t.volume}`
      : ''
  }
  // 프로젝트 목록 — 처음에는 첫 프로젝트 선택
  const loadPrj = useCallback(async () => {
    const j = await (await piFetch(`${api}/projects`)).json()
    if (!j.ok) return
    setPrjs(j.items)
    setPrj((p) => j.items.find((x: Prj) => x.prj_id === p?.prj_id) ?? j.items[0] ?? null)
  }, [api])
  useEffect(() => {
    loadPrj()
  }, [loadPrj])
  useEffect(() => {
    piFetch(api)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
  }, [api])
  const editor = perms.includes('MODEL_EDIT')

  // 업종 선택 → AI 추천(POST /projects/ai-suggest)
  //  · 새 프로젝트 등록 : 업종을 바꿀 때마다 이름·설명을 비우고 새 업종 추천으로 다시 채움(마스터 지시 2026-10-17 — 직전 업종 값이 남던 문제)
  //  · 수정 모드 : 설명은 비었거나 직전 AI 문장 그대로일 때만, 이름은 비었을 때만 채움(저장된 값 보존)
  const [aiP, setAiP] = useState<{ busy: boolean; names: string[]; prefixes: string[]; src: string; dbms?: { cd: string; why: string } }>({ busy: false, names: [], prefixes: [], src: '' })
  const aiDesc = useRef('')
  const aiSeq = useRef(0) // 업종을 빠르게 바꿀 때 마지막 요청 응답만 반영
  // edit·cur : 수정 진입(startEdit)처럼 setPEdit·setPf 직후 같은 틱에 부를 때 — 클로저의 pEdit·pf 가 아직 이전 값이라 명시 전달
  const pickInd = async (cd: string, edit = !!pEdit, cur?: { prj_nm: string; prj_desc: string }) => {
    const fresh = !edit
    const src = cur ?? pf
    const seq = ++aiSeq.current
    setPf((p) => (fresh ? { ...p, indstry_cd: cd, prj_nm: '', prj_desc: '', tbl_pfx_txt: '', trgt_dbms_cd: '' } : { ...p, indstry_cd: cd }))
    if (fresh) aiDesc.current = ''
    if (!cd) return setAiP({ busy: false, names: [], prefixes: [], src: '' })
    setAiP((a) => ({ ...a, busy: true }))
    try {
      const r = await piFetch(`${api}/projects/ai-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fresh ? { indstry_cd: cd, prj_nm: '', prj_desc: '' } : { indstry_cd: cd, prj_nm: src.prj_nm, prj_desc: src.prj_desc === aiDesc.current ? '' : src.prj_desc }),
      })
      const j = await r.json()
      if (seq !== aiSeq.current) return
      if (!j.ok) {
        setMsg(j.message)
        return setAiP({ busy: false, names: [], prefixes: [], src: '' })
      }
      setPf((p) => ({
        ...p,
        prj_desc: fresh || !p.prj_desc.trim() || p.prj_desc === aiDesc.current ? j.desc : p.prj_desc,
        prj_nm: fresh || !p.prj_nm.trim() ? (j.names[0] ?? '') : p.prj_nm,
        tbl_pfx_txt: fresh || !p.tbl_pfx_txt ? (j.prefixes?.[0] ?? '') : p.tbl_pfx_txt,
        trgt_dbms_cd: fresh || !p.trgt_dbms_cd ? (j.dbms?.cd ?? '') : p.trgt_dbms_cd,
      }))
      aiDesc.current = j.desc
      setAiP({ busy: false, names: j.names, prefixes: j.prefixes ?? [], src: j.src, dbms: j.dbms })
    } catch {
      if (seq === aiSeq.current) setAiP({ busy: false, names: [], prefixes: [], src: '' })
    }
  }

  // 프로젝트 수정 진입(바 '수정'·목록 행 '수정') — 저장값을 폼에 채우고, 업종이 있으면 같은 업종으로 AI 추천을 불러 접두사·이름 후보 칩만 제시(저장값은 덮지 않음)
  const startEdit = (p: Prj) => {
    const cur = { prj_nm: p.prj_nm, prj_desc: p.prj_desc ?? '' }
    setPrj(p)
    setSel(null)
    setPage(1)
    setPEdit(p)
    setPf({ ...cur, indstry_cd: p.indstry_cd ?? '', tbl_pfx_txt: p.tbl_pfx_txt ?? '', trgt_dbms_cd: p.trgt_dbms_cd ?? '' })
    aiDesc.current = ''
    setAiP({ busy: false, names: [], prefixes: [], src: '' })
    if (p.indstry_cd) void pickInd(p.indstry_cd, true, cur)
  }

  const loadSubj = useCallback(async () => {
    const j = await (await piFetch(`${api}/subjects`)).json()
    if (j.ok) setSubjs(j.items)
  }, [api])
  useEffect(() => {
    loadSubj()
  }, [loadSubj])
  const loadEnt = useCallback(async () => {
    if (!prj) return (setEnts([]), setTotal(0))
    const sp = new URLSearchParams({
      page: String(page),
      size: '20',
      prj: prj.prj_id,
      ...(sel ? { subj: sel.subj_id } : {}),
      ...(withLg ? { lvl: 'ALL' } : {}),
    })
    const j = await (await piFetch(`${api}/entities?${sp}`)).json()
    if (j.ok) {
      setEnts(j.items)
      setTotal(j.total)
    }
  }, [api, sel, page, prj, withLg])
  useEffect(() => {
    loadEnt()
  }, [loadEnt])
  // 엔터티명 입력 시 분해 후보(0.4초 지연)
  useEffect(() => {
    const nm = ef.name.trim()
    if (!nm) return setCands([])
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${api}/entities/analyze?${new URLSearchParams({ name: nm, tp: ef.tp, ...(sel ? { subj: sel.subj_id } : {}) })}`)).json()
      if (j.ok) {
        setCands(j.candidates)
        setPick(0)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [ef.name, ef.tp, sel, api])

  // 주제영역명 입력 시 자동 채움(0.6초 지연, 등록 모드만)
  useEffect(() => {
    const nm = sf.subj_nm.trim()
    if (sEdit || !nm) return setSug({ busy: false, src: [], alts: [], isWord: null })
    let live = true
    const t = setTimeout(async () => {
      setSug((s) => ({ ...s, busy: true }))
      const j = await (await piFetch(`${api}/subjects/suggest?${new URLSearchParams({ nm, ...(prj ? { prj: prj.prj_id } : {}) })}`)).json().catch(() => null)
      if (!live || !j?.ok) return setSug({ busy: false, src: [], alts: [], isWord: null })
      const prev = lastFill.current
      const fill = {
        subj_abbr_nm: j.fill.subj_abbr_nm ?? '',
        subj_desc: j.fill.subj_desc ?? '',
      }
      lastFill.current = fill
      setSf((f) => ({
        ...f,
        subj_abbr_nm: f.subj_abbr_nm === '' || f.subj_abbr_nm === prev.subj_abbr_nm ? fill.subj_abbr_nm : f.subj_abbr_nm,
        subj_desc: f.subj_desc === '' || f.subj_desc === prev.subj_desc ? fill.subj_desc : f.subj_desc,
      }))
      setSug({ busy: false, src: j.src, alts: j.abbr_alts, isWord: j.is_word })
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [sf.subj_nm, sEdit, api, prj])
  useEffect(() => {
    if (!prj?.indstry_cd) return setSubjRecs([])
    piFetch(`${api}/subjects/suggest?${new URLSearchParams({ prj: prj.prj_id })}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setSubjRecs(j.subjects ?? []), setSubjChk(new Set())))
  }, [api, prj, subjs])
  // 추천 주제영역 선택 등록 — 확인 1회 후 차례로 1레벨 등록(반자동 : 사용자가 고른 것만, 서버가 이름·약어 규칙 재검증), 결과 건수 표시
  const addSubjRecs = async () => {
    const list = subjRecs.filter((r) => r.std_ok && subjChk.has(r.nm))
    if (!prj || !list.length || !confirm(`추천 주제영역 ${list.length}건(${list.map((r) => `${r.nm} ${r.abbr}`).join(', ')})을 등록하시겠습니까?`)) return
    let n = 0
    let seq = roots.length
    const fail: string[] = []
    for (const r of list) {
      const j = await (
        await piFetch(`${api}/subjects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prj_id: prj.prj_id, subj_nm: r.nm, subj_abbr_nm: r.abbr, subj_desc: r.desc || null, sort_seq: ++seq }) })
      ).json()
      if (j.ok) n++
      else fail.push(`${r.nm}(${j.message ?? ''})`)
    }
    setMsg(`추천 주제영역 ${n}건 등록${fail.length ? ` · 실패 ${fail.join(', ')}` : ''}`)
    loadSubj()
  }
  // 선택 주제영역의 핵심 엔터티 추천(주제영역 단어 + 상세·이력·상태이력, 주제영역명으로 시작하는 복합어)
  useEffect(() => {
    if (!sel) return setEntSug([])
    piFetch(`${api}/subjects/suggest?${new URLSearchParams({ nm: sel.subj_nm, prj: sel.prj_id, abbr: sel.subj_abbr_nm })}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setEntSug(j.ents), setChk(new Set())))
  }, [sel, api, ents])

  const roots = subjs.filter((s) => s.prj_id === prj?.prj_id && !s.up_subj_id)
  const kids = (id: string) => subjs.filter((s) => s.up_subj_id === id)
  // 추천 엔터티 선택 추가 — 확인 1회 후 차례로 등록(결과 건수 표시)
  const addSug = async () => {
    const list = entSug.filter((e) => e.ok && chk.has(e.ent_log_nm))
    if (!sel || !list.length || !confirm(`추천 엔터티 ${list.length}건(${list.map((e) => e.ent_log_nm).join(', ')})을 '${sel.subj_nm}'에 추가하시겠습니까?`)) return
    let n = 0
    const fail: string[] = []
    for (const e of list) {
      const j = await (
        await piFetch(`${api}/entities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subj_id: sel.subj_id,
            dic_ids: e.dic_ids,
            ent_tp_cd: e.ent_tp_cd,
            ent_desc: e.ent_desc || null,
          }),
        })
      ).json()
      if (j.ok) n++
      else fail.push(`${e.ent_log_nm}(${j.message ?? ''})`)
    }
    setMsg(`추천 엔터티 ${n}건 추가${fail.length ? ` · 실패 ${fail.join(', ')}` : ''}`)
    setChk(new Set())
    loadEnt()
  }
  const savePrj = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = {
      prj_nm: pf.prj_nm.trim(),
      prj_desc: pf.prj_desc.trim() || null,
      indstry_cd: pf.indstry_cd || null,
      ...(pf.tbl_pfx_txt ? { tbl_pfx_txt: pf.tbl_pfx_txt } : {}),
      trgt_dbms_cd: pf.trgt_dbms_cd,
    }
    if (!pf.trgt_dbms_cd) return setMsg('대상 DBMS(예정)를 선택하십시오 — 물리명 미리보기 기준, 물리 모델에서 확정')
    if (pf.tbl_pfx_txt && !PFX_RE.test(pf.tbl_pfx_txt)) return setMsg('스키마 접두사는 영문 대문자 2~4자입니다')
    if (!body.prj_nm || !confirm(pEdit ? `프로젝트 '${pEdit.prj_nm}' 수정 내용을 저장하시겠습니까?` : `프로젝트 '${body.prj_nm}'을(를) 등록하시겠습니까?`)) return
    const j = await (
      await piFetch(pEdit ? `${api}/projects/${pEdit.prj_id}` : `${api}/projects`, {
        method: pEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pEdit ? { ...body, ver_no: pEdit.ver_no } : body),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`프로젝트 ${body.prj_nm} ${pEdit ? '수정' : '등록'} 완료`)
    setPf(PF0)
    setPEdit(null)
    if (!pEdit) setPrj(j.item)
    loadPrj()
  }
  const delPrj = async () => {
    if (!prj || !confirm(`프로젝트 '${prj.prj_nm}'을(를) 삭제하시겠습니까?`)) return
    const j = await (
      await piFetch(`${api}/projects/${prj.prj_id}?ver_no=${prj.ver_no}`, {
        method: 'DELETE',
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setPrj(null)
    setSel(null)
    loadPrj()
  }
  const cur = cands[pick]
  const okCand = !!sel && !!cur?.complete && !cur.rule_error && !cur.dup

  const saveSubj = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prj) return
    const body = {
      prj_id: prj.prj_id,
      subj_nm: sf.subj_nm.trim(),
      subj_abbr_nm: sf.subj_abbr_nm.trim(),
      up_subj_id: sf.up_subj_id || null,
      subj_desc: sf.subj_desc.trim() || null,
      sort_seq: Number(sf.sort_seq) || 1,
    }
    if (!confirm(sEdit ? `주제영역 '${sEdit.subj_nm}' 수정 내용을 저장하시겠습니까?` : `주제영역 '${body.subj_nm}(${body.subj_abbr_nm.toUpperCase()})'을(를) 등록하시겠습니까?`))
      return
    const j = await (
      await piFetch(sEdit ? `${api}/subjects/${sEdit.subj_id}` : `${api}/subjects`, {
        method: sEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sEdit ? { ...body, ver_no: sEdit.ver_no } : body),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`주제영역 ${body.subj_nm} ${sEdit ? '수정' : '등록'} 완료`)
    setSf(SUBJ0)
    setSEdit(null)
    lastFill.current = { subj_abbr_nm: '', subj_desc: '' }
    loadSubj()
  }
  const delSubj = async (s: Subj) => {
    if (!confirm(`주제영역 '${s.subj_nm}'을(를) 삭제하시겠습니까?`)) return
    const j = await (
      await piFetch(`${api}/subjects/${s.subj_id}?ver_no=${s.ver_no}`, {
        method: 'DELETE',
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    if (sel?.subj_id === s.subj_id) setSel(null)
    loadSubj()
  }
  const saveEnt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!okCand || !sel || !cur?.dic_ids) return
    if (!confirm(`엔터티 '${cur.ent_log_nm}'(${cur.tbl_phy_nm})을(를) 주제영역 '${sel.subj_nm}'에 등록하시겠습니까?`)) return
    const j = await (
      await piFetch(`${api}/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subj_id: sel.subj_id,
          dic_ids: cur.dic_ids,
          ent_tp_cd: ef.tp,
          ent_desc: ef.desc.trim() || null,
        }),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`엔터티 ${cur.ent_log_nm} 등록 완료 — 아래 속성 패널에서 주식별자·필수 속성을 고르십시오`)
    setEf({ name: '', tp: ef.tp, desc: '' })
    setOpenEnt(j.item?.ent_id ?? null)
    loadEnt()
  }
  const delEnt = async (x: Ent) => {
    if (!confirm(`엔터티 '${x.ent_log_nm}'을(를) 삭제하시겠습니까? 속성·관계도 함께 삭제됩니다(논리 삭제).`)) return
    const j = await (
      await piFetch(`${api}/entities/${x.ent_id}?ver_no=${x.ver_no}`, {
        method: 'DELETE',
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    if (j.partial) setMsg(j.message)
    loadEnt()
  }
  const subjRow = (s: Subj, lvl: number) => (
    <li
      key={s.subj_id}
      className={`flex items-center gap-1 rounded px-2 py-1 ${sel?.subj_id === s.subj_id ? 'bg-[#1f3a68] text-white' : 'hover:bg-[#e9eff9]'}`}
      style={{ paddingLeft: 8 + lvl * 16 }}
    >
      <button onClick={() => (setSel(s), setPage(1))} className="flex-1 text-left">
        {s.subj_nm} <span className="font-mono text-xs opacity-70">{s.subj_abbr_nm}</span>
      </button>
      {editor && (
        <>
          <button
            onClick={() => (
              setSEdit(s),
              setSf({
                subj_nm: s.subj_nm,
                subj_abbr_nm: s.subj_abbr_nm,
                up_subj_id: s.up_subj_id ?? '',
                subj_desc: s.subj_desc ?? '',
                sort_seq: String(s.sort_seq),
              })
            )}
            className="text-xs underline opacity-80"
          >
            수정
          </button>
          <button onClick={() => delSubj(s)} className="text-xs underline opacity-80">
            삭제
          </button>
        </>
      )}
    </li>
  )

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">개념 모델</h1>
      <p className="mt-1 text-sm text-gray-600">
        주제영역을 먼저 정의하고, 주제영역별 핵심 엔터티를 표준단어로 만듭니다(정의서 §8.4 : 주제영역 2레벨·약어 3자, 엔터티명 = 엔터티 정의 + 데이터 성격).
      </p>
      <form
        onSubmit={savePrj}
        onKeyDown={noEnterSubmit}
        className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-3 text-sm text-white shadow-md"
      >
        {/* 프로젝트 탭은 선택을 아래 프로젝트 목록 표에서(행 클릭) — 콤보는 다른 탭의 빠른 전환용 */}
        <span className="font-semibold">{tab === 'prj' ? (pEdit ? '프로젝트 수정' : '새 프로젝트') : '프로젝트'}</span>
        {tab !== 'prj' && (
          <>
            <select
              value={prj?.prj_id ?? ''}
              onChange={(e) => (setPrj(prjs.find((p) => p.prj_id === e.target.value) ?? null), setSel(null), setPage(1))}
              className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900"
              aria-label="프로젝트 선택"
            >
              {prjs.length === 0 && <option value="">프로젝트를 먼저 등록하십시오</option>}
              {prjs.map((p) => (
                <option key={p.prj_id} value={p.prj_id}>
                  {p.prj_nm}
                </option>
              ))}
            </select>
            {prj?.indstry_cd && (
              <span className="rounded bg-white/20 px-2 py-0.5 text-xs" title={indTitle(prj.indstry_cd)}>
                {indNm(prj.indstry_cd)}
              </span>
            )}
            {prj && (
              <span className="rounded bg-white/20 px-2 py-0.5 text-xs" title={dbmsTitle(prj.trgt_dbms_cd)}>
                {dbmsNm(prj.trgt_dbms_cd)}
              </span>
            )}
            {prj && (
              <span className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs" title="스키마 접두사 — 물리 테이블명 = 접두사_주제영역약어_단어약어[접미어]">
                {prj.tbl_pfx_txt}_
              </span>
            )}
            {prj?.prj_desc && <span className="text-xs opacity-80">{prj.prj_desc}</span>}
          </>
        )}
        {editor && tab === 'prj' && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={pf.indstry_cd}
              onChange={(e) => void pickInd(e.target.value)}
              className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900"
              aria-label="업종"
              title={pf.indstry_cd ? indTitle(pf.indstry_cd) : '업종을 고르면 주제영역·핵심 엔터티를 추천합니다'}
            >
              <option value="">업종 선택(선택)</option>
              {inds.map((x) => (
                <option key={x.cd} value={x.cd}>
                  {x.nm}
                </option>
              ))}
            </select>
            <input
              value={pf.prj_nm}
              onChange={(e) => setPf({ ...pf, prj_nm: e.target.value })}
              placeholder={pEdit ? '프로젝트명' : '새 프로젝트명'}
              maxLength={100}
              className="w-40 rounded border border-white/60 bg-white px-2 py-1 text-gray-900 placeholder:text-gray-500"
              aria-label="프로젝트명"
            />
            <input
              value={pf.tbl_pfx_txt}
              onChange={(e) => setPf({ ...pf, tbl_pfx_txt: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) })}
              placeholder="접두사(TB)"
              maxLength={4}
              className={`w-24 rounded border bg-white px-2 py-1 font-mono text-gray-900 placeholder:text-gray-500 ${pf.tbl_pfx_txt && !PFX_RE.test(pf.tbl_pfx_txt) ? 'border-red-500' : 'border-white/60'}`}
              aria-label="스키마 접두사"
              title="스키마 접두사 : 물리 테이블명 맨 앞 영문 대문자 2~4자(비우면 TB). 업종을 고르면 AI가 추천"
            />
            <select
              value={pf.trgt_dbms_cd}
              onChange={(e) => setPf({ ...pf, trgt_dbms_cd: e.target.value })}
              required
              className={`rounded border bg-white px-2 py-1 text-gray-900 ${pf.trgt_dbms_cd ? 'border-white/60' : 'border-amber-400'}`}
              aria-label="대상 DBMS"
              title={pf.trgt_dbms_cd ? dbmsTitle(pf.trgt_dbms_cd) : '대상 DBMS(예정, 필수) : 식별자 길이 경고 기준, 물리 모델 전환 때 확정(대·소문자는 그때 선택, 그 전은 항상 대문자)'}
            >
              <option value="">대상 DBMS(필수)</option>
              {dbmsOpts.map((x) => (
                <option key={x.cd} value={x.cd}>
                  {x.nm}
                </option>
              ))}
            </select>
            {!aiP.busy && aiP.dbms && aiP.dbms.cd !== pf.trgt_dbms_cd && (
              <button type="button" onClick={() => setPf((p) => ({ ...p, trgt_dbms_cd: aiP.dbms!.cd }))} className="rounded-full bg-sky-200 px-2 py-0.5 text-xs font-semibold text-gray-900" title={`업종 추천 DBMS — ${aiP.dbms.why}`}>
                추천 {dbmsNm(aiP.dbms.cd)}
              </button>
            )}
            {!aiP.busy &&
              aiP.prefixes
                .filter((x) => x !== pf.tbl_pfx_txt)
                .map((x) => (
                  <button key={x} type="button" onClick={() => setPf((p) => ({ ...p, tbl_pfx_txt: x }))} className="rounded-full bg-sky-200 px-2 py-0.5 font-mono text-xs font-semibold text-gray-900" title={`${aiP.src} 추천 접두사 — 누르면 접두사 칸에 넣음(같은 분류체계 다른 프로젝트가 쓰는 접두사는 제외)`}>
                    {x}_
                  </button>
                ))}
            <input
              value={pf.prj_desc}
              onChange={(e) => setPf({ ...pf, prj_desc: e.target.value })}
              placeholder={aiP.busy ? 'AI가 설명을 작성하는 중…' : '설명(업종을 고르면 AI가 채움)'}
              maxLength={4000}
              className="w-full min-w-0 rounded border border-white/60 bg-white px-2 py-1 text-gray-900 placeholder:text-gray-500 md:w-[32rem]"
              aria-label="프로젝트 설명"
              title={pf.prj_desc}
            />
            {aiP.busy && <span className="text-xs opacity-90">AI 추천 중…</span>}
            {!aiP.busy &&
              aiP.names
                .filter((x) => x !== pf.prj_nm)
                .map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setPf((p) => ({ ...p, prj_nm: x }))}
                    className="rounded-full bg-sky-200 px-2 py-0.5 text-xs font-semibold text-gray-900"
                    title={`${aiP.src} 추천 이름 — 누르면 프로젝트명에 넣음`}
                  >
                    ✨ {x}
                  </button>
                ))}
            {indSug
              .filter((x) => x.cd !== pf.indstry_cd)
              .map((x) => (
                <button
                  key={x.cd}
                  type="button"
                  onClick={() => void pickInd(x.cd)}
                  className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-semibold text-gray-900"
                  title={`추천 근거 : ${x.why.join(', ')}`}
                >
                  추천 {x.nm}
                </button>
              ))}
            <button disabled={!pf.prj_nm.trim()} className="btn-3d px-4 disabled:opacity-40">
              {pEdit ? '수정 저장' : '프로젝트 등록'}
            </button>
            {pEdit ? (
              <button type="button" onClick={() => (setPEdit(null), setPf(PF0), setAiP({ busy: false, names: [], prefixes: [], src: '' }))} className="underline">
                취소
              </button>
            ) : (
              prj && (
                <>
                  <button type="button" onClick={() => startEdit(prj)} className="underline">
                    수정
                  </button>
                  <button type="button" onClick={delPrj} className="underline">
                    삭제
                  </button>
                </>
              )
            )}
          </span>
        )}
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}
      {tab === 'prj' && (
        // 프로젝트 목록 — 행을 누르면 선택(아래 주제영역 목록·다른 탭이 이 프로젝트 기준). 수정·삭제는 선택 후 위 바에서
        <section className="mt-4 overflow-hidden rounded-xl border border-[#c7d2e6] bg-white text-sm shadow-sm">
          <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">프로젝트 목록 {prjs.length}개</h2>
          {prjs.length === 0 ? (
            <p className="p-5 text-gray-500">등록된 프로젝트가 없습니다. 위에서 업종을 고르고 새 프로젝트를 등록하십시오</p>
          ) : (
            <table className="w-full">
              <thead className="bg-[#f4f7fc] text-left text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-2">프로젝트명</th>
                  <th className="px-4 py-2">업종</th>
                  <th className="px-4 py-2">대상 DBMS</th>
                  <th className="px-4 py-2">접두사</th>
                  <th className="px-4 py-2">설명</th>
                  {editor && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {prjs.map((p) => {
                  const on = p.prj_id === prj?.prj_id
                  return (
                    <tr
                      key={p.prj_id}
                      onClick={() => (setPrj(p), setSel(null), setPage(1))}
                      aria-selected={on}
                      className={`cursor-pointer ${on ? 'bg-[#1f3a68] text-white' : 'hover:bg-[#e9eff9]'}`}
                    >
                      <td className="px-4 py-2 font-medium">{p.prj_nm}</td>
                      <td className="px-4 py-2" title={p.indstry_cd ? indTitle(p.indstry_cd) : undefined}>
                        {p.indstry_cd ? indNm(p.indstry_cd) : '-'}
                      </td>
                      <td className="px-4 py-2" title={dbmsTitle(p.trgt_dbms_cd)}>
                        {dbmsNm(p.trgt_dbms_cd)}
                      </td>
                      <td className="px-4 py-2 font-mono">{p.tbl_pfx_txt}_</td>
                      <td className={`px-4 py-2 ${on ? '' : 'text-gray-700'}`}>{p.prj_desc ?? '-'}</td>
                      {editor && (
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={(e) => (e.stopPropagation(), startEdit(p))}
                            className={`rounded border px-2 py-0.5 text-xs whitespace-nowrap ${on ? 'border-white/70 hover:bg-white/10' : 'border-[#1f3a68] text-[#1f3a68] hover:bg-[#e9eff9]'}`}
                          >
                            수정
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
      {tab === 'prj' && prj && (
        // 프로젝트 탭 : 선택 프로젝트의 주제영역 목록(상위 → 하위 순, 이미 불러온 subjs 재사용 — 추가 조회 없음). 등록·수정은 주제영역 탭
        <section className="mt-4 overflow-hidden rounded-xl border border-[#c7d2e6] bg-white shadow-sm">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-white">
            <h2 className="text-base font-semibold">
              {prj.prj_nm} 주제영역 {roots.length + roots.reduce((n, r) => n + kids(r.subj_id).length, 0)}개
            </h2>
            <Link href={`/areas/${areaId}/model?tab=subj`} className="text-xs underline">
              주제영역 관리
            </Link>
          </div>
          {roots.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">등록된 주제영역이 없습니다. 주제영역 탭에서 등록하십시오</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#f4f7fc] text-left text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-2">구분</th>
                  <th className="px-4 py-2">주제영역명</th>
                  <th className="px-4 py-2">약어</th>
                  <th className="px-4 py-2">설명</th>
                  <th className="px-4 py-2 text-right">정렬</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {roots.flatMap((r) =>
                  [r, ...kids(r.subj_id)].map((x) => (
                    <tr key={x.subj_id} className={x.up_subj_id ? '' : 'bg-[#fafbfe] font-medium'}>
                      <td className="px-4 py-2 text-xs text-gray-500">{x.up_subj_id ? '하위' : '상위'}</td>
                      <td className={`px-4 py-2 ${x.up_subj_id ? 'pl-8' : ''}`}>{x.up_subj_id ? `└ ${x.subj_nm}` : x.subj_nm}</td>
                      <td className="px-4 py-2 font-mono">{x.subj_abbr_nm}</td>
                      <td className="px-4 py-2 text-gray-700">{x.subj_desc ?? '-'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{x.sort_seq}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </section>
      )}
      {tab !== 'prj' && (
        <div className={`mt-4 grid gap-6 md:grid-cols-[18rem_1fr]`}>
          <aside className="space-y-3">
            <div className="rounded-xl border border-[#c7d2e6] bg-white p-3 text-sm shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold text-[#1f3a68]">주제영역</h2>
                <button onClick={() => (setSel(null), setPage(1))} className="text-xs text-blue-700 underline">
                  전체 엔터티
                </button>
              </div>
              {roots.length === 0 ? (
                <p className="text-gray-500">등록된 주제영역이 없습니다</p>
              ) : (
                <ul className="space-y-0.5">{roots.flatMap((r) => [subjRow(r, 0), ...kids(r.subj_id).map((k) => subjRow(k, 1))])}</ul>
              )}
            </div>
            {tab === 'subj' && (
              <form
                onSubmit={saveSubj}
                onKeyDown={noEnterSubmit}
                className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md"
              >
                <h2 className={`px-4 py-2 font-semibold text-white ${sEdit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>
                  {sEdit ? `주제영역 수정 : ${sEdit.subj_nm}` : '주제영역 등록'}
                </h2>
                <fieldset
                  disabled={!editor || !prj}
                  className="space-y-2 p-3 disabled:opacity-60 [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-[#b8c6e0] [&_input]:bg-white [&_input]:px-2 [&_input]:py-1"
                >
                  <select
                    value={sf.up_subj_id}
                    onChange={(e) => setSf({ ...sf, up_subj_id: e.target.value })}
                    className="w-full rounded border border-[#b8c6e0] bg-white px-2 py-1"
                    aria-label="상위 주제영역"
                  >
                    <option value="">1레벨(상위 없음)</option>
                    {roots
                      .filter((r) => r.subj_id !== sEdit?.subj_id)
                      .map((r) => (
                        <option key={r.subj_id} value={r.subj_id}>
                          {r.subj_nm} 아래(2레벨)
                        </option>
                      ))}
                  </select>
                  {!sEdit && subjRecs.length > 0 && (
                    <div className="rounded border border-[#d5ddec] bg-white p-2 text-xs text-gray-700">
                      <p className="mb-1 font-semibold text-[#1f3a68]">업종 추천 주제영역 : 체크 후 한 번에 등록(이름을 누르면 아래 폼에 채움, 빨강 = 표준단어 신청 필요)</p>
                      <ul className="divide-y divide-[#eef2f8]">
                        {subjRecs.map((r) => (
                          <li key={r.nm} className={`flex items-start gap-2 py-1 ${r.std_ok ? '' : 'text-red-700'}`}>
                            <input
                              type="checkbox"
                              className="mt-0.5 !w-auto"
                              disabled={!r.std_ok}
                              checked={subjChk.has(r.nm)}
                              onChange={() => setSubjChk((c) => (c.has(r.nm) ? new Set([...c].filter((x) => x !== r.nm)) : new Set([...c, r.nm])))}
                              aria-label={`${r.nm} 선택`}
                            />
                            <span className="min-w-0 flex-1">
                              {r.std_ok ? (
                                <button
                                  type="button"
                                  onClick={() => ((lastFill.current = { subj_abbr_nm: '', subj_desc: '' }), setSf({ ...SUBJ0, subj_nm: r.nm, subj_abbr_nm: r.abbr, subj_desc: r.desc }))}
                                  className="font-semibold hover:underline"
                                >
                                  {r.nm}
                                </button>
                              ) : (
                                <span className="font-semibold">{r.nm}</span>
                              )}{' '}
                              <span className="font-mono text-gray-500">{r.abbr}</span>
                              {r.std_ok ? (
                                <span className="block truncate text-gray-500" title={r.desc}>
                                  {r.desc}
                                </span>
                              ) : (
                                <Link href={`/areas/${areaId}/words?new=${encodeURIComponent(r.missing_words[0] ?? r.nm)}`} className="block underline" title={`표준단어 미등록 : ${r.missing_words.join(', ')} — 신청·승인 후 등록 가능`}>
                                  표준단어 신청 필요 : {r.missing_words.join(', ')}
                                </Link>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" onClick={() => setSubjChk(new Set(subjRecs.filter((r) => r.std_ok).map((r) => r.nm)))} className="underline">
                          전체 선택
                        </button>
                        <button type="button" onClick={() => setSubjChk(new Set())} className="underline">
                          선택 해제
                        </button>
                        <button type="button" onClick={addSubjRecs} disabled={!subjChk.size} className="btn-3d ml-auto px-4 py-0.5 disabled:opacity-40">
                          선택 등록({subjChk.size})
                        </button>
                      </div>
                    </div>
                  )}
                  <input value={sf.subj_nm} onChange={(e) => setSf({ ...sf, subj_nm: e.target.value })} placeholder="주제영역명(단수형 명사)" maxLength={100} required />
                  {!sEdit && sf.subj_nm.trim() && (
                    <p className="text-xs text-[#1f3a68]">
                      {sug.busy ? '자동 채움 조회 중…' : sug.src.length ? `자동 채움(확인 후 등록) : ${sug.src.join(' / ')}` : '자동 채움 근거 없음 : 직접 입력하십시오'}
                      {sug.isWord === false && (
                        <span className="block font-medium text-red-700">
                          표준단어에 없는 이름이라 등록할 수 없습니다 :{' '}
                          <Link href={`/areas/${areaId}/words?new=${encodeURIComponent(sf.subj_nm.trim())}`} className="underline">
                            표준단어 등록
                          </Link>{' '}
                          후 승인되면 등록할 수 있습니다
                        </span>
                      )}
                    </p>
                  )}
                  <input
                    value={sf.subj_abbr_nm}
                    onChange={(e) => setSf({ ...sf, subj_abbr_nm: e.target.value })}
                    placeholder="약어 영문 3자(예 : CCS)"
                    maxLength={3}
                    pattern="[A-Za-z]{3}"
                    required
                    className="font-mono uppercase"
                  />
                  {!sEdit && sug.alts.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
                      다른 약어 :
                      {sug.alts.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setSf((f) => ({ ...f, subj_abbr_nm: a }))}
                          className="rounded border border-[#b8c6e0] bg-white px-1.5 font-mono hover:bg-[#e9eff9]"
                        >
                          {a}
                        </button>
                      ))}
                    </p>
                  )}
                  <input value={sf.subj_desc} onChange={(e) => setSf({ ...sf, subj_desc: e.target.value })} placeholder="설명" maxLength={4000} />
                  <input value={sf.sort_seq} onChange={(e) => setSf({ ...sf, sort_seq: e.target.value })} type="number" min={1} max={9999} aria-label="정렬순서" />
                  <div className="flex justify-end gap-2">
                    {sEdit && (
                      <button type="button" onClick={() => (setSEdit(null), setSf(SUBJ0))} className="rounded border bg-white px-3 py-1">
                        취소
                      </button>
                    )}
                    <button disabled={!sEdit && (sug.busy || sug.isWord === false)} className="btn-3d px-5 disabled:opacity-40">
                      {sEdit ? '수정 저장' : '등록'}
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
          </aside>

          {tab === 'ent' && (
            <section className="space-y-4">
              <form
                onSubmit={saveEnt}
                onKeyDown={noEnterSubmit}
                className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md"
              >
                <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">
                  핵심 엔터티 등록 {sel ? `: ${sel.subj_nm}(${sel.subj_abbr_nm})` : ''}
                </h2>
                <fieldset disabled={!editor || !sel} className="p-5 disabled:opacity-60">
                  {!sel && <p className="mb-2 text-gray-600">왼쪽에서 주제영역을 먼저 선택하십시오(엔터티는 주제영역에 속해야 합니다)</p>}
                  {sel && entSug.length > 0 && (
                    <div className="mb-3 rounded border border-[#d5ddec] bg-white p-2 text-xs text-gray-700">
                      <p className="mb-1 font-semibold text-[#1f3a68]">
                        추천 핵심 엔터티 : 체크 후 추가, 이름을 누르면 아래 입력칸에 채움(★ = 업종 추천, 빨강 = 표준단어 신청 필요)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {entSug.map((e) => (
                          <label
                            key={e.ent_log_nm}
                            className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${e.ok ? 'border-[#b8c6e0]' : 'border-red-300 bg-red-50'}`}
                            title={e.ent_desc || undefined}
                          >
                            <input
                              type="checkbox"
                              disabled={!e.ok}
                              checked={chk.has(e.ent_log_nm)}
                              onChange={() => setChk((c) => (c.has(e.ent_log_nm) ? new Set([...c].filter((x) => x !== e.ent_log_nm)) : new Set([...c, e.ent_log_nm])))}
                            />
                            <button type="button" onClick={() => setEf((f) => ({ ...f, name: e.ent_log_nm }))} className="hover:underline">
                              {e.src === 'industry' && '★'}
                              {e.ent_log_nm}
                            </button>
                            <span className="font-mono text-gray-500">{e.tbl_phy_nm}</span>
                            {e.missing_words.map((w) => (
                              <Link key={w} href={`/areas/${areaId}/words?new=${encodeURIComponent(w)}`} className="text-red-700 underline">
                                {w} 신청
                              </Link>
                            ))}
                            {e.rule_error && <span className="text-red-700">{RULE_MSG[e.rule_error] ?? e.rule_error}</span>}
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => setChk(new Set(entSug.filter((e) => e.ok).map((e) => e.ent_log_nm)))} className="underline">
                          전체 선택
                        </button>
                        <button type="button" onClick={addSug} disabled={!chk.size} className="btn-3d px-4 py-0.5 disabled:opacity-40">
                          선택 추가({chk.size})
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-3 md:grid-cols-4">
                    <input
                      value={ef.name}
                      onChange={(e) => setEf({ ...ef, name: e.target.value })}
                      placeholder="엔터티명(예 : 고객등급이력)"
                      maxLength={200}
                      className="rounded border border-[#b8c6e0] bg-white px-3 py-2 md:col-span-2"
                      aria-label="엔터티명"
                    />
                    <select
                      value={ef.tp}
                      onChange={(e) => setEf({ ...ef, tp: e.target.value })}
                      className="rounded border border-[#b8c6e0] bg-white px-3 py-2"
                      aria-label="엔터티 유형"
                    >
                      {Object.entries(TP_NM).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input
                      value={ef.desc}
                      onChange={(e) => setEf({ ...ef, desc: e.target.value })}
                      placeholder="설명(관리하는 데이터)"
                      maxLength={4000}
                      className="rounded border border-[#b8c6e0] bg-white px-3 py-2"
                      aria-label="설명"
                    />
                  </div>
                  {cands.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {cands.map((c, i) => (
                        <label
                          key={i}
                          className={`flex cursor-pointer flex-wrap items-center gap-2 rounded border px-3 py-1.5 ${i === pick ? 'border-[#1f3a68] bg-white' : 'border-transparent'}`}
                        >
                          <input type="radio" checked={i === pick} onChange={() => setPick(i)} />
                          {c.segments.map((s, k) =>
                            'word' in s ? (
                              <span key={k} className="rounded bg-[#e9eff9] px-1.5">
                                {s.word.dic_log_nm}
                              </span>
                            ) : (
                              <span key={k} className="rounded bg-red-100 px-1.5 text-red-700">
                                {s.unknown}(미등록)
                              </span>
                            ),
                          )}
                          {c.complete && (
                            <span className="font-mono text-[#1f3a68]">
                              → {c.tbl_phy_nm}
                              {c.too_long && <span className="ml-1 text-amber-700">(25자 초과)</span>}
                            </span>
                          )}
                          {c.rule_error && <span className="text-red-700">{RULE_MSG[c.rule_error] ?? c.rule_error}</span>}
                          {c.dup && <span className="text-red-700">같은 이름의 엔터티 있음</span>}
                        </label>
                      ))}
                      {cur && !cur.complete && (
                        <p className="text-red-700">
                          미등록 단어가 있습니다 :{' '}
                          <Link href={`/areas/${areaId}/words`} className="underline">
                            표준단어 신청
                          </Link>
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button disabled={!okCand} className="btn-3d px-8 disabled:opacity-40">
                      등록
                    </button>
                  </div>
                </fieldset>
              </form>

              <label className="mb-1 flex items-center justify-end gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={withLg} onChange={() => (setWithLg(!withLg), setPage(1))} /> 논리 엔터티 포함(논리 모델에서 추가)
              </label>
              <table className="w-full border-collapse text-[0.7rem] [&_.text-xs]:text-[0.6rem] [&_td]:whitespace-nowrap">
                <thead>
                  <tr className="thead-3d text-center">
                    {['#', '엔터티명', '물리 테이블명', '유형', '주제영역', '설명', '등록자', '등록일시', '처리'].map((h) => (
                      <th key={h} className="border px-2 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="border px-2 py-4 text-center text-gray-500">
                        등록된 엔터티가 없습니다
                      </td>
                    </tr>
                  ) : (
                    ents.map((x, i) => [
                      <tr key={x.ent_id} className="hover:bg-gray-50">
                        <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{(page - 1) * 20 + i + 1}</td>
                        <td className="border px-2 py-1 font-medium" title={x.words.map((w) => w.dic_log_nm).join('+')}>
                          {x.ent_log_nm}
                          {x.mdl_lvl_cd === 'LGCL' && <span className="ml-1 rounded bg-purple-100 px-1 text-purple-800">논리</span>}
                          {x.words.some((w) => !w.ok) && <span className="ml-1 text-red-700">(구성 단어 미확정)</span>}
                        </td>
                        <td className="border px-2 py-1 font-mono text-[#1f3a68]">
                          {x.tbl_phy_nm}
                          {x.too_long && <span className="ml-1 text-amber-700">25자 초과</span>}
                        </td>
                        <td className="border px-2 py-1 text-center">{TP_NM[x.ent_tp_cd]}</td>
                        <td className="border px-2 py-1">
                          {x.mdl_subj.subj_nm} <span className="font-mono text-gray-500">{x.mdl_subj.subj_abbr_nm}</span>
                        </td>
                        <td className="w-[30%] border px-2 py-1 !whitespace-normal">{x.ent_desc}</td>
                        <ActorCells nm={x.regr_nm} d={x.reg_dtm} />
                        <td className="border px-2 py-1 text-center">
                          <button onClick={() => setOpenEnt(openEnt === x.ent_id ? null : x.ent_id)} className="mr-2 text-blue-700 underline" aria-expanded={openEnt === x.ent_id}>
                            속성{openEnt === x.ent_id ? ' ▲' : ' ▼'}
                          </button>
                          {editor && (
                            <button onClick={() => delEnt(x)} className="text-red-700 underline">
                              삭제
                            </button>
                          )}
                        </td>
                      </tr>,
                      openEnt === x.ent_id && (
                        <tr key={`${x.ent_id}-attrs`}>
                          <td colSpan={9} className="border px-2 py-2 !whitespace-normal">
                            <Attrs api={api} areaId={areaId} entId={x.ent_id} entNm={x.ent_log_nm} editor={editor} />
                          </td>
                        </tr>
                      ),
                    ])
                  )}
                </tbody>
              </table>
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-gray-600">총 {total.toLocaleString()}건</span>
                <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                  ‹
                </button>
                <span className="tabular-nums">{page}</span>
                <button onClick={() => setPage(page + 1)} disabled={page * 20 >= total} className="rounded border px-2 py-1 disabled:opacity-30">
                  ›
                </button>
              </div>
            </section>
          )}
          {tab === 'subj' && (
            // 주제영역 탭 : 선택 주제영역(미선택 = 프로젝트 전체)의 핵심 엔터티 목록(읽기 전용, 이미 불러온 ents·20건 페이지 재사용). 등록·수정은 핵심엔터티 탭
            <section className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-white text-sm shadow-sm">
              <div className="flex items-center justify-between bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-white">
                <h2 className="text-base font-semibold">
                  {sel ? `${sel.subj_nm}(${sel.subj_abbr_nm})` : '전체 주제영역'} 핵심 엔터티 {total.toLocaleString()}건
                </h2>
                <Link href={`/areas/${areaId}/model?tab=ent`} className="text-xs underline">
                  핵심엔터티 관리
                </Link>
              </div>
              {ents.length === 0 ? (
                <p className="p-5 text-gray-500">{sel ? '이 주제영역에 등록된 핵심 엔터티가 없습니다' : '등록된 핵심 엔터티가 없습니다'}</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-[#f4f7fc] text-left text-xs text-gray-600">
                    <tr>
                      <th className="px-4 py-2">엔터티명</th>
                      <th className="px-4 py-2">유형</th>
                      <th className="px-4 py-2">테이블명</th>
                      {!sel && <th className="px-4 py-2">주제영역</th>}
                      <th className="px-4 py-2">설명</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ents.map((x) => (
                      <tr key={x.ent_id}>
                        <td className="px-4 py-2 font-medium">{x.ent_log_nm}</td>
                        <td className="px-4 py-2">{TP_NM[x.ent_tp_cd] ?? x.ent_tp_cd}</td>
                        <td className="px-4 py-2 font-mono text-xs">{x.tbl_phy_nm}</td>
                        {!sel && <td className="px-4 py-2">{x.mdl_subj?.subj_nm}</td>}
                        <td className="px-4 py-2 text-gray-700">{x.ent_desc ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {total > 20 && (
                <div className="flex items-center justify-center gap-2 border-t py-2">
                  <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                    ‹
                  </button>
                  <span className="tabular-nums">{page}</span>
                  <button onClick={() => setPage(page + 1)} disabled={page * 20 >= total} className="rounded border px-2 py-1 disabled:opacity-30">
                    ›
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {prj && tab === 'ent' && <Relations api={api} prjId={prj.prj_id} editor={editor} entsKey={ents} onSaved={loadEnt} />}
    </main>
  )
}
