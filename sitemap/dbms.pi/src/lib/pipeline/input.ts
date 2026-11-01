// 파이프라인 저장 입력 검증(zod) — POST /api/pipeline · PUT /api/pipeline/[pplId] 공용. 행 ↔ 화면 변환도 여기 한 곳
import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ADAPTERS } from './precheck'
import { MAX_STEPS, STEP_KINDS, checkSteps, isCron, type PplDef } from './def'

export const PplInput = z
  .object({
    link: z.string().uuid(),
    pplNm: z.string().trim().min(1).max(100),
    srcConnId: z.string().min(1).max(100),
    tgtDesc: z.string().trim().max(500).default(''),
    adapterCd: z.enum(ADAPTERS),
    schedTxt: z.string().trim().max(100).default(''),
    def: z.object({
      steps: z
        .array(z.object({ kind: z.enum(STEP_KINDS), op: z.string().trim().min(1).max(60), note: z.string().max(500).default('') }))
        .max(MAX_STEPS),
      tables: z.array(z.string().trim().min(1).max(200)).max(500).default([]),
    }),
  })
  .refine((v) => !v.schedTxt || isCron(v.schedTxt))
  .refine((v) => checkSteps(v.def.steps) === null)

export type PplBody = z.infer<typeof PplInput>

export function toRow(b: PplBody, by: string) {
  const def: PplDef = { steps: b.def.steps, tables: b.def.tables }
  return {
    ppl_nm: b.pplNm,
    src_conn_id: b.srcConnId,
    tgt_desc: b.tgtDesc || null,
    adapter_cd: b.adapterCd,
    sched_txt: b.schedTxt || null,
    def_json: def,
    modr_id: by,
    mod_dtm: new Date().toISOString(),
  }
}

// 목록 칼럼(R-P3 — def_json 제외, 편집 시 단건 조회)
export const LIST_COLS = 'ppl_id, ppl_nm, src_conn_id, tgt_desc, adapter_cd, sched_txt, sts_cd, mod_dtm'
export const ONE_COLS = `${LIST_COLS}, def_json`

// 공용 apiError 카탈로그(통합 소유)에 없는 코드 — 화면은 pipeline.errors.PPL_NAME_DUP 번역
export const nameDup = () =>
  NextResponse.json({ error: '같은 이름의 파이프라인이 이미 있습니다', code: 'PPL_NAME_DUP' }, { status: 409 })
