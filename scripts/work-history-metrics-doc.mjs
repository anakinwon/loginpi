#!/usr/bin/env node
/**
 * work-history-metrics-doc — 지표 체계 문서를 레지스트리(core.METRICS / KPI_TREE / QUESTIONS / UNMEASURABLE)에서 생성한다.
 *   pnpm work:metrics-doc   → docs/WORK_METRICS.md  (코드가 정본, 문서는 파생물 — 손으로 고치지 말 것)
 */
import fs from 'node:fs'
import path from 'node:path'
import { METRICS, KPI_TREE, TIER_LABEL, QUESTIONS, UNMEASURABLE, SCHEMA_VERSION, CATEGORIES } from './work-history-core.mjs'
import { PROJECT, MIN_N_COMPARE } from './work-history-stats.mjs'

const fmtSlo = (k, m) => { if (!m.slo) return ''; const v = m.slo.warn; const u = m.unit; const s = u === 'USD' ? `$${v}` : u === 'ms' ? `${Math.round(v / 1000)}s` : u === '비율' ? `${Math.round(v * 100)}%` : u === '배' ? `${v}배` : String(v); return `${m.dir === 'higher' ? '<' : '>'} ${s}${m.slo.stat ? ` (${m.slo.stat})` : ''}${m.slo.min_n ? ` · n≥${m.slo.min_n}` : ''}` }
const row = k => { const m = METRICS[k]; return `| \`${k}\` | ${m.label} | ${m.formula.replace(/\|/g, '\\|')} | ${m.population} | ${m.unit} | ${fmtSlo(k, m)} | ${(m.note || '').replace(/\|/g, '\\|')} |` }
const tierSection = tier => `### ${tier} · ${TIER_LABEL[tier]}\n\n| 키 | 지표 | 정의 | 모집단 | 단위 | 경보 | 비고 |\n|---|---|---|---|---|---|---|\n${KPI_TREE[tier].map(row).join('\n')}\n`

const md = `# 작업 효율 지표 체계 (Work Metrics)

> 생성: \`pnpm work:metrics-doc\` (정본은 \`scripts/work-history-core.mjs\` 의 METRICS · KPI_TREE · QUESTIONS · UNMEASURABLE). 스키마 v${SCHEMA_VERSION}.
> 2026-09-20 지표 관점 10인 점검(비용·시간·산출·품질·컨텍스트·위임·도구·하네스·행동·체계)을 종합해 재설계.

## 1. 목적과 원칙

목적은 "Claude Code 작업이 얼마나 효율적인가"를 **산출 ÷ 투입**으로 매일 비교하는 것이다. 원칙:

1. **분모를 명시한다.** 요청(distinct 턴), 완료 턴(timed), 도구 호출(steps), 서브에이전트(agents) 중 하나를 각 지표에 적는다. 파트 레코드 수(\`turns\`)는 분모로 쓰지 않는다.
2. **비율의 분자·분모는 같은 모집단.** 흡수·재전송·중단·미완료 턴은 합계(토큰·비용)에는 들어가고 평균·비율에서는 빠진다.
3. **역지표는 강등한다.** 컨텍스트가 커질수록 좋아 보이는 캐시 적중률, 활동량을 생산성으로 오독하게 하는 레코드 수·출력 토큰·도구 호출 수는 참고 계층에 둔다.
4. **비교는 표본이 있을 때만.** 이전 기간과 n≥${MIN_N_COMPARE} 일 때 증감을 판정하고, 그 이하는 방향만 표시한다. 활동일·세션 수가 다르면 요청당 값으로 정규화한다.
5. **원천이 없으면 없다고 쓴다.** 추정치로 채우지 않는다(§6).

## 2. KPI 트리

\`\`\`
L0  완료 요청당 비용 ★  = (메인 비용 + 서브에이전트 비용) ÷ 완료 요청
 ├─ L1 결과   요청당 비용 · 요청당 소요 · 첫 응답 대기 · 교정률 · 완료 요청 수 · 변경 파일 · 편집 정착률
 ├─ L2 동인   컨텍스트 팽창률 · 캐시 미스 · 재작업률 · 무검증률 · 오류 회복 배수 · 위임 비용 비중 · 병렬도
 ├─ L3 진단   생성 속도 · 도구 시간 비중 · thinking 비율 · 요청당 API 호출 · 활성비 · 유휴 · 도구/훅 시간 · 도구 결과 크기
 └─ 참고      캐시 읽기 비중 · 도구 오류율 · 레코드 수 · 종단 처리량 · 하네스 턴 소요
\`\`\`

${Object.keys(KPI_TREE).map(tierSection).join('\n')}
## 3. 대시보드가 답해야 할 질문

| 질문 | 지표 | 판정 규칙 |
|---|---|---|
${QUESTIONS.map(q => `| ${q.q} | ${q.metrics.map(m => `\`${m}\``).join(', ')} | ${q.rule} |`).join('\n')}

## 4. 레코드 스키마 (v${SCHEMA_VERSION}, work-history/YYYY/MM/YYYY-MM-DD.jsonl)

| 레코드 | 키 | 내용 |
|---|---|---|
| 턴(파트) | \`id = <session_id>:<turn>.<part>\` | tokens · cost_usd · elapsed_ms · ttft_ms · idle_ms · tools · steps[{t, ok, ms, tgt, chars}] · files_changed · verified · resources · perf · category · flags(superseded/absorbed/incomplete/interrupted) — part>1 은 구간 델타 |
| 보정 | \`fix:true, id\` | Stop 이후 도착한 turn_duration_ms · hook_ms 를 값 없는 파트에 FIFO 병합 |
| 에이전트 | \`agent:true, id(턴), agent_id\` | 서브에이전트 모델·토큰·비용·실행시간·도구·오류 (디스패치 턴에 귀속: name → toolUseId → parentAgentId → 시작 시각) |

집계(\`loadRows\`)는 id 기준 last-write-wins 로 중복을 없애고 보정·에이전트를 병합한 뒤 \`correction\`(사용자 교정)·\`recovery\`(오류 회복)를 파생한다.

## 5. 카테고리 (요청문 점수제: 동사 4 · 명사 1 · 도구 증거 · 부정어 창)

| 키 | 라벨 | 예 |
|---|---|---|
${CATEGORIES.filter(c => c.key !== 'OTHER').map(c => `| ${c.key} | ${c.label} | ${c.verb.source.split('|').slice(0, 4).join(', ').replace(/\\b|\\s\?|\(\?[^)]*\)/g, '')} |`).join('\n')}

요청문에 \`#cat:NAME\` 을 쓰면 강제. 판정 근거는 레코드 \`rule\` · \`confidence\` 에 남는다.

## 6. 아직 측정할 수 없는 것

| 지표 | 이유 |
|---|---|
${UNMEASURABLE.map(u => `| ${u.metric} | ${u.reason} |`).join('\n')}

## 7. 사용법

| 명령 | 결과 |
|---|---|
| \`pnpm work:stats --type kpi [--date D]\` | KPI 트리 값 · 경보 · 질문별 판정 (터미널) |
| \`pnpm work:report --period all\` | 일·주·월·년 보고서 (summary/tokens/usage/performance/outcome/metrics.json + report.html) |
| \`pnpm work:metrics-doc\` | 이 문서 재생성 |
| \`pnpm test\` | 로거·집계·분류·마스킹 회귀 테스트 |
`
const out = path.join(PROJECT, 'docs', 'WORK_METRICS.md')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, md)
console.log(`${out} (${md.split('\n').length} lines, ${Object.keys(METRICS).length} metrics)`)
