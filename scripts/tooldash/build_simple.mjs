// 툴체인 관제판(간결판) 생성기 : 핵심 지표만 한 화면에 — 숫자 3개 · 종류별 신호등 표 · 최근 14일 차트 · 주목할 점.
// 상세판(build_dashboard.mjs)과 같은 4개 JSON을 읽는다. 실행 : node build_simple.mjs [출력경로]  (기본 tooldash.html)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, "../../work-statistics/main-dashboard/tooldash.html");   // HTML 시각화 파일 공통 폴더 (2026-09-22 지시)
fs.mkdirSync(path.dirname(out), { recursive: true });
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8"));
const inv = read("inventory.json"), usage = read("usage_daily.json"), util = read("utilization.json"), eff = read("efficiency_daily.json");
// 스킬 폴더 안의 문서 폴더(SKILL.md 없음, 예: skill_list)는 설치 실패가 아니라 스킬이 아닌 항목이므로 현황에서 제외
inv.items = inv.items.filter((x) => !(x.kind === "Skill" && x.status === "failed" && /SKILL\.md/.test(x.note || "")));

const KINDS = ["Skill", "MCP", "Agent", "Hook", "Plugin"];
const purposes = fs.existsSync(path.join(here, "purposes.json")) ? read("purposes.json") : {};
const invDesc = {}; inv.items.forEach((x) => { invDesc[x.kind + "/" + (x.provider_plugin ? x.provider_plugin + ":" + x.name : x.name)] ??= x.description || ""; invDesc[x.kind + "/" + x.name] ??= x.description || ""; });
function purposeOf(kind, name) {
  const m = (purposes[kind] || {})[name]; if (m) return m;
  if (kind === "Hook") { for (const [pre, txt] of Object.entries(purposes.hook_prefix || {})) if (name.startsWith(pre)) return txt; }
  const d = (invDesc[kind + "/" + name] || "").replace(/\s+/g, " ").trim();
  if (d && !/^Claude Code 내장 스킬/.test(d)) return d.length > 40 ? d.slice(0, 39) + "…" : d;
  return "";
}
const KO = { Skill: "스킬", MCP: "MCP", Agent: "에이전트", Hook: "훅", Plugin: "플러그인" };
const to = usage.range.to;
const dayAdd = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const inRange = (d, a, b) => d >= a && d <= b;
const last7 = [dayAdd(to, -6), to], prev7 = [dayAdd(to, -13), dayAdd(to, -7)], last14 = [dayAdd(to, -13), to];
const sum = (days, k, r) => days.filter((d) => inRange(d.date, r[0], r[1])).reduce((s, d) => s + (d[k] || 0), 0);
const total5 = (d) => KINDS.reduce((s, k) => s + (d[k] || 0), 0);

// ── 대표 도구 : events.jsonl 에서 종류별 항목 단위(호출·오류·첫/마지막 사용일) 집계 ─────
// 항목 키 = Skill:스킬명 / MCP:서버명 / Agent:서브에이전트 종류 / Hook:훅 이벤트. Plugin 은 이벤트에 플러그인명이 없어 utilization.top5(귀속 상한값) 사용
const agg = {};
for (const line of fs.readFileSync(path.join(here, "events.jsonl"), "utf8").split(String.fromCharCode(10))) {
  if (!line.trim()) continue; const e = JSON.parse(line);
  if (!["Skill", "MCP", "Agent", "Hook"].includes(e.kind)) continue;
  const key = (e.kind === "MCP" || e.kind === "Hook") ? e.name : (e.detail || e.name);   // Hook 은 name=훅 이벤트, detail=레코드 종류
  const a = (agg[e.kind] ??= {})[key] ??= { name: key, count: 0, errors: 0, known: 0, first: e.date, last: e.date };
  a.count++; if (e.is_error != null) { a.known++; if (e.is_error) a.errors++; }
  if (e.date < a.first) a.first = e.date; if (e.date > a.last) a.last = e.date;
}
const weeksOf = (first, last) => Math.max(1, (Math.round((new Date(last + "T00:00:00Z") - new Date(first + "T00:00:00Z")) / 86400000) + 1) / 7);
function topItems(k) {
  const totalK = usage.by_kind_total[k] || 0;
  if (k === "Plugin") {
    const t5 = (util.by_kind.Plugin.top5 || []), tot = t5.reduce((s, t) => s + (t.count ?? t[1]), 0) || 1;
    return t5.slice(0, 10).map((t) => ({ name: String(t.name ?? t[0]), purpose: purposeOf("Plugin", String(t.name ?? t[0])), count: t.count ?? t[1], share: (t.count ?? t[1]) / tot, perWeek: null, success: null, upper: true }));
  }
  return Object.values(agg[k] || {}).sort((a, b) => b.count - a.count).slice(0, 10)
    .map((a) => ({ name: a.name, purpose: purposeOf(k, a.name), count: a.count, share: totalK ? a.count / totalK : null, perWeek: a.count / weeksOf(a.first, a.last), success: a.known ? 1 - a.errors / a.known : null, first: a.first, last: a.last }));
}

// ── 종류별 스코어카드 ────────────────────────────────────────
const status = {};
inv.items.forEach((x) => { const s = (status[x.kind] ??= { all: 0, available: 0, failed: 0, failedNames: [] }); s.all++; if (x.status === "available") s.available++; if (x.status === "failed") { s.failed++; s.failedNames.push(x.name); } });
const rows = KINDS.map((k) => {
  const st = status[k] || { all: 0, available: 0, failed: 0, failedNames: [] }, u = util.by_kind[k];
  const calls7 = sum(usage.days, k, last7), callsPrev = sum(usage.days, k, prev7), callsAll = usage.by_kind_total[k] || 0;
  const rate = u.rate_available ?? 0;
  const signal = st.failed > 0 ? "bad" : rate < 0.1 ? "warn" : "ok";
  const reason = st.failed > 0 ? `실패 ${st.failed}개 (${st.failedNames.join(", ")})` : rate < 0.1 ? "가용 항목의 10% 미만 사용" : "정상";
  return { kind: k, ko: KO[k], all: st.all, available: st.available, failed: st.failed, used: u.used_unique, rate, unused: (u.unused_available || []).length, calls7, callsPrev, callsAll, signal, reason, top: topItems(k) };
});

// ── 상단 숫자 3개 ─────────────────────────────────────────────
const calls7 = rows.reduce((s, r) => s + r.calls7, 0), callsPrev = rows.reduce((s, r) => s + r.callsPrev, 0);
const usedSum = rows.reduce((s, r) => s + r.used, 0), availSum = rows.reduce((s, r) => s + r.available, 0);
const head = {
  calls7, callsPrev, delta: callsPrev ? (calls7 - callsPrev) / callsPrev : null,
  success: eff.overall.success_rate, errors: eff.overall.n?.tool_errors ?? 0, calls: eff.overall.calls,
  used: usedSum, avail: availSum,
};

// ── 최근 14일 일별(달력 기준, 기록 없는 날 0) ─────────────────
const byDate = Object.fromEntries(usage.days.map((d) => [d.date, d]));
const cal14 = []; for (let d = last14[0]; d <= to; d = dayAdd(d, 1)) cal14.push({ date: d, ...Object.fromEntries(KINDS.map((k) => [k, (byDate[d] || {})[k] || 0])), missing: !byDate[d] });

// ── 주목할 점 (고정 규칙, 사실만) ────────────────────────────
const byName5 = usage.by_name.filter((x) => KINDS.includes(x.kind)).sort((a, b) => b.count - a.count);
const top3 = byName5.slice(0, 3);
const succ = eff.overall.success_by_kind || {};
const worst = Object.entries(succ).filter(([k, v]) => v != null && KINDS.includes(k)).sort((a, b) => a[1] - b[1])[0];
const findings = [];
rows.filter((r) => r.failed).forEach((r) => findings.push({ level: "bad", text: `${r.ko} ${r.failed}개가 실패 상태입니다 : ${status[r.kind].failedNames.join(", ")}` }));
findings.push({ level: "info", text: `가장 많이 쓴 도구는 ${top3.map((t) => `${t.name}(${KO[t.kind]}, ${t.count}회)`).join(" · ")}입니다.` });
const idle = rows.filter((r) => r.unused > 0).sort((a, b) => b.unused - a.unused);
findings.push({ level: "warn", text: `한 번도 쓰지 않은 가용 도구가 ${idle.reduce((s, r) => s + r.unused, 0)}개입니다 : ${idle.map((r) => `${r.ko} ${r.unused}`).join(" · ")}` });
if (worst) findings.push({ level: worst[1] < 0.95 ? "warn" : "info", text: `호출 성공률이 가장 낮은 종류는 ${KO[worst[0]]} ${(worst[1] * 100).toFixed(1)}%입니다 (전체 ${(head.success * 100).toFixed(1)}%).` });
if (eff.overall.verified_rate != null) findings.push({ level: eff.overall.verified_rate < 0.5 ? "warn" : "info", text: `실행 확인 후 완료 보고한 턴은 ${(eff.overall.verified_rate * 100).toFixed(0)}%입니다 (작업 이력 ${eff.overall.turns}턴 기준).` });

const data = { generated_at: new Date().toISOString(), range: usage.range, last7, prev7, head, rows, cal14, findings,
  items: inv.items.map((x) => ({ kind: x.kind, name: x.name, source: x.source, status: x.status })) };

const html = `<meta charset="utf-8">
<title>툴체인 관제판</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ebe9e3;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8884;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;
  --ok:#1a7f37;--warn:#b45309;--bad:#c0392b;--okbg:#e6f4ea;--warnbg:#fdf1e2;--badbg:#fbe9e7;
  --sans:"IBM Plex Sans KR",system-ui,"Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--ok:#4cbb6c;--warn:#e0a24d;--bad:#e66767;--okbg:#17301f;--warnbg:#332714;--badbg:#3a1c1a}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--ok:#4cbb6c;--warn:#e0a24d;--bad:#e66767;--okbg:#17301f;--warnbg:#332714;--badbg:#3a1c1a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans)}
.wrap{max-width:1100px;margin:0 auto;padding:30px 20px 48px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px}
h1{font-size:24px;font-weight:700;margin:0;letter-spacing:-.01em}
.meta{color:var(--ink3);font-family:var(--mono);font-size:12px}
.lede{color:var(--ink2);margin:6px 0 22px;max-width:62ch}
.big{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:26px}
@media (max-width:720px){.big{grid-template-columns:1fr}}
.big .t{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px 18px 14px}
.big .k{font-size:13px;color:var(--ink2)}
.big b{display:block;font-size:38px;font-weight:600;font-family:var(--mono);line-height:1.1;margin:6px 0 4px}
.big small{color:var(--ink3);font-size:12.5px;display:block}
.up{color:var(--ok)}.down{color:var(--bad)}
h2{font-size:16px;font-weight:600;margin:26px 0 10px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 18px}
table{border-collapse:collapse;width:100%}
th,td{padding:10px 8px;border-bottom:1px solid var(--grid);text-align:left;vertical-align:middle}
th{font-size:12px;color:var(--ink3);font-weight:500}
tr:last-child td{border-bottom:0}
td.num,th.num{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.kind{font-weight:600;white-space:nowrap}
.kind i{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--c);margin-right:8px;vertical-align:-1px}
.dot{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:7px;vertical-align:-1px}
.ok .dot{background:var(--ok)}.warn .dot{background:var(--warn)}.bad .dot{background:var(--bad)}
.sig{font-size:13.5px;min-width:12ch}
.bar{position:relative;height:8px;background:var(--grid);border-radius:4px;min-width:80px}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--c)}
.ratecell{display:flex;align-items:center;gap:10px}
.ratecell span{font-family:var(--mono);font-size:12.5px;white-space:nowrap}
.sub{color:var(--ink3);font-size:12px;font-family:var(--mono);white-space:nowrap}
td.leadcell{padding:8px 8px;min-width:230px;width:34%}
.lead{border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 9%,var(--surface));border-radius:0 6px 6px 0;padding:7px 10px 7px 11px}
.lead-name{font-family:var(--mono);font-weight:600;font-size:14px;line-height:1.3;white-space:nowrap}
.lead-row{display:flex;align-items:center;gap:8px;margin-top:4px}
.lead-row b{font-family:var(--mono);font-size:15px;font-weight:600;white-space:nowrap}
.lead-bar{flex:1;height:6px;background:var(--grid);border-radius:3px;position:relative;min-width:60px}
.lead-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--c)}
.lead-share{font-family:var(--mono);font-size:12px;color:var(--ink2);min-width:4ch;text-align:right}
.lead-chips{display:flex;gap:6px;margin-top:5px;flex-wrap:wrap}
.lead-chips span{font-family:var(--mono);font-size:11.5px;color:var(--ink2);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:0 7px;line-height:1.7}
.lead-rest{font-family:var(--mono);font-size:11.5px;color:var(--ink3);margin-top:5px;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--ink2);margin:8px 0 0}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--c)}
.chart{width:100%;height:auto;display:block}
.chart .tick{fill:var(--ink3);font-size:11px;font-variant-numeric:tabular-nums}
.chart .gridline{stroke:var(--grid)}.chart .axis{stroke:var(--line)}
.find{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.find li{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:6px;background:var(--bg)}
.find li.bad{background:var(--badbg)}.find li.warn{background:var(--warnbg)}
.find .dot{margin-top:6px;flex:none}
.foot{color:var(--ink3);font-size:12.5px;margin:10px 0 0}
details{margin-top:14px}summary{cursor:pointer;color:var(--ink2);font-size:13.5px}
.tbl{overflow:auto;max-height:380px;border:1px solid var(--line);border-radius:6px;margin-top:10px;font-size:13px}
.tbl th{position:sticky;top:0;background:var(--surface)}
.tbl td.name{font-family:var(--mono);font-size:12px;white-space:nowrap}
input.q{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:4px;padding:5px 10px;font:13px var(--sans);width:260px;margin-top:8px}
input.q:focus-visible,summary:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
.pill{display:inline-block;padding:0 8px;border-radius:999px;font-size:11px;font-family:var(--mono);line-height:1.7}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.dup{color:var(--ink3);border:1px solid var(--line)}
.kinds{display:grid;grid-template-columns:repeat(auto-fit,minmax(500px,1fr));gap:12px}
@media (max-width:560px){.kinds{grid-template-columns:1fr}}
.kcard{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px 10px;border-top:3px solid var(--c)}
.kcard header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.kname{font-weight:700;font-size:15px}.kname i{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--c);margin-right:7px;vertical-align:-1px}
.ksig{font-size:12.5px;color:var(--ink2)}
.kstat{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--ink2);margin:6px 0 8px;font-variant-numeric:tabular-nums}
.kstat b{font-family:var(--mono);font-weight:600;color:var(--ink)}.kstat em{font-style:normal;color:var(--bad);font-family:var(--mono)}
.ktop{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--ink3);margin-bottom:4px}
.rank{list-style:none;margin:0;padding:0}
.rank li{display:grid;grid-template-columns:2ch minmax(14ch,1fr) 64px 6ch 4ch 5ch;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--grid);font-size:12.5px}
.rank li:last-child{border-bottom:0}
.rank .rk{font-family:var(--mono);color:var(--ink3);text-align:right}
.rank .nm{font-family:var(--mono);white-space:normal;line-height:1.35}
.rank .pu{font-family:var(--sans);color:var(--ink3);font-size:12px}
.rank li:first-child .nm{font-weight:600}
.rank .br{height:6px;background:var(--grid);border-radius:3px;position:relative}.rank .br i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--c)}
.rank .ct,.rank .sh,.rank .sc{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.rank .sh{color:var(--ink3)}.rank .sc{color:var(--ink3);font-size:11.5px}.rank .sc.warn{color:var(--warn)}
.rank .none{display:block;color:var(--ink3)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;font-size:12px;border-radius:3px;display:none;z-index:9;font-family:var(--mono);white-space:pre-line}
.hot:hover{filter:brightness(1.12)}
</style>
<div class="wrap">
<header><h1>툴체인 관제판</h1><span class="meta" id="meta"></span></header>
<p class="lede">이 작업공간의 도구 다섯 종류가 <b>잘 붙어 있는지</b>, <b>얼마나 쓰이는지</b>, <b>문제는 없는지</b>를 한 화면으로 봅니다. 색은 종류마다 고정, 신호등은 빨강(실패 있음) · 주황(거의 안 씀) · 초록(정상)입니다.</p>
<section class="big" id="big"></section>
<h2>종류별 상태와 TOP 10</h2>
<div class="kinds" id="kinds"></div>
<p class="foot">각 카드 : 신호등 판정 · 설치/사용 중/최근 7일 호출 · 그 종류에서 많이 쓴 항목 순위(최대 10개), 괄호 안은 용도(설치 정본의 설명·훅 명령 기준 요약). 막대 = 그 종류 호출 중 점유율, ▼ = 오류 없이 끝난 비율 95% 미만(훅은 오류 정보 없음). 사용 중 = 기록 기간(${usage.range.from} ~ ${to}) 안에 한 번이라도 호출된 항목 수, 가용 = 설치 항목 중 실패·중복을 뺀 수. 플러그인 호출 수는 훅 귀속 상한값(≤)이라 성공률을 내지 않으며, 스킬·MCP·훅 중 플러그인 제공분을 다시 센 값이라 다른 종류와 겹칩니다.</p>
<h2>최근 14일 도구 호출</h2>
<div class="card"><svg class="chart" id="c14"></svg><div class="legend" id="lg"></div><p class="foot" id="c14foot"></p></div>
<h2>주목할 점</h2>
<div class="card"><ul class="find" id="find"></ul></div>
<details><summary>전체 설치 목록 ${inv.items.length}건 보기</summary><input class="q" id="q" placeholder="이름·출처 검색" aria-label="검색"><div class="tbl"><table id="all"><thead><tr><th>종류</th><th>이름</th><th>출처</th><th>상태</th></tr></thead><tbody></tbody></table></div></details>
<details><summary>지표 정의와 데이터 범위</summary><p class="foot">
· 호출 수 = 세션 기록의 도구 호출 블록(Skill·Agent·mcp__*)과 훅 실행 레코드를 종류별로 센 값. 기본 도구(Bash·Read·Edit 등)는 제외.<br>
· 성공률 = 1 − 오류로 돌아온 결과 수 / 전체 호출 수 (세션 기록 tool_result.is_error 기준, 기본 도구 포함).<br>
· 실행 확인 후 완료 보고 비율 = 작업 이력 로그의 verified 표시 턴 / 전체 턴 (2026-09-18 로거 도입 이후).<br>
· 스킬 폴더 안의 문서 폴더(skill_list, SKILL.md 없음)는 스킬이 아니므로 현황에서 뺐습니다.<br>
· 원천 = 이 프로젝트의 세션 기록(2026-08-05 ~ ${to}) + 작업 이력 로그 + 설정·플러그인·스킬 파일 ${inv.items.length}건. 훅 기록은 2026-08-31 이후만 있고 출력이 있는 훅만 남습니다. 2026-09-19·20은 다른 작업 장소의 세션이라 이 PC에 기록이 없어 0으로 보입니다.
</p></details>
</div>
<div id="tip"></div>
<script>
const DATA = ${JSON.stringify(data)};
const KINDS = ["Skill","MCP","Agent","Hook","Plugin"];
const COLOR = {Skill:"var(--s1)",MCP:"var(--s2)",Agent:"var(--s3)",Hook:"var(--s4)",Plugin:"var(--s5)"};
const KO = {Skill:"스킬",MCP:"MCP",Agent:"에이전트",Hook:"훅",Plugin:"플러그인"};
const nf = new Intl.NumberFormat("ko-KR"), pct = (x,d=0) => x==null ? "–" : (x*100).toFixed(d)+"%";
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $ = (id) => document.getElementById(id), tip = $("tip");
document.addEventListener("mousemove", (e) => { if (tip.style.display !== "block") return; tip.style.left = Math.min(e.clientX+14, innerWidth-320)+"px"; tip.style.top = (e.clientY+14)+"px"; });
const hoverable = (root) => root.querySelectorAll("[data-tip]").forEach(el => { el.addEventListener("mouseenter", () => { tip.textContent = el.getAttribute("data-tip"); tip.style.display = "block"; }); el.addEventListener("mouseleave", () => tip.style.display = "none"); });
const H = DATA.head, md = (s) => s.slice(5).replace("-", "/");
$("meta").textContent = "기준일 " + DATA.range.to + " · 생성 " + DATA.generated_at.slice(0,10);

// 숫자 3개
const deltaTxt = H.delta==null ? "직전 7일 기록 없음" : (H.delta>=0 ? '<span class="up">▲ '+pct(H.delta)+'</span>' : '<span class="down">▼ '+pct(-H.delta)+'</span>') + " 직전 7일(" + nf.format(H.callsPrev) + "회) 대비";
$("big").innerHTML = [
  ["최근 7일 도구 호출", nf.format(H.calls7)+'<span style="font-size:16px;color:var(--ink3);font-weight:400"> 회</span>', deltaTxt, DATA.last7[0]+" ~ "+DATA.last7[1]],
  ["도구 호출 성공률", pct(H.success,1), "오류 "+nf.format(H.errors)+"건 / "+nf.format(H.calls)+"회", "전체 기간"],
  ["사용 중인 도구", nf.format(H.used)+'<span style="font-size:16px;color:var(--ink3);font-weight:400"> / '+nf.format(H.avail)+'</span>', "가용 도구의 "+pct(H.used/H.avail)+"를 한 번 이상 사용", "전체 기간"],
].map(t => '<div class="t"><div class="k">'+t[0]+'</div><b>'+t[1]+'</b><small>'+t[2]+'</small><small style="margin-top:2px">'+t[3]+'</small></div>').join("");

// 종류별 카드 : 상태 한 줄 + TOP 10 순위 목록
const cut = (n, m=34) => n.length > m ? n.slice(0, m-1) + "…" : n;
$("kinds").innerHTML = DATA.rows.map(r => {
  const top = r.top || [], max = Math.max(1, ...top.map(t => t.count));
  const list = top.length ? top.map((t, i) => '<li><span class="rk">'+(i+1)+'</span><span class="nm" title="'+esc(t.name)+'">'+esc(cut(t.name))+(t.purpose ? ' <span class="pu">('+esc(t.purpose)+')</span>' : '')+'</span>'
      + '<span class="br"><i style="width:'+(t.count/max*100).toFixed(0)+'%"></i></span>'
      + '<span class="ct">'+(t.upper?'≤':'')+nf.format(t.count)+'회</span><span class="sh">'+pct(t.share)+'</span>'
      + '<span class="sc'+(t.success!=null && t.success<0.95 ? ' warn':'')+'">'+(t.success==null ? '' : (t.success<0.95 ? '▼'+pct(t.success) : ''))+'</span></li>').join("")
    : '<li class="none">기록 기간에 호출된 항목이 없습니다</li>';
  return '<section class="kcard '+r.signal+'" style="--c:'+COLOR[r.kind]+'">'
    + '<header><span class="kname"><i></i>'+r.ko+'</span><span class="ksig"><span class="dot"></span>'+esc(r.reason)+'</span></header>'
    + '<div class="kstat"><span>설치 <b>'+nf.format(r.all)+'</b>'+(r.failed?' <em>(실패 '+r.failed+')</em>':'')+'</span><span>사용 중 <b>'+nf.format(r.used)+'</b> / '+nf.format(r.available)+' · '+pct(r.rate)+'</span><span>최근 7일 <b>'+nf.format(r.calls7)+'</b>회 · 전체 '+nf.format(r.callsAll)+'</span></div>'
    + '<div class="ktop">TOP '+Math.min(10, top.length)+(top.length<10 && top.length ? ' <span class="sub">(사용된 항목 전부)</span>' : '')+'</div><ol class="rank">'+list+'</ol></section>';
}).join("");

// 최근 14일 누적 막대
(function(){
  const c = DATA.cal14, W=900, Hh=230, ml=44, mr=8, mt=12, mb=30, iw=W-ml-mr, ih=Hh-mt-mb, bw=iw/c.length;
  const totals = c.map(d => KINDS.reduce((s,k)=>s+d[k],0)), max = Math.max(1, ...totals);
  const step = max<=10?2:max<=50?10:max<=100?20:max<=200?50:100, top = Math.ceil(max/step)*step, y = v => mt+ih-(v/top)*ih;
  const svg = $("c14"); svg.setAttribute("viewBox","0 0 "+W+" "+Hh); const ns="http://www.w3.org/2000/svg";
  const el = (t,a,txt) => { const n=document.createElementNS(ns,t); for (const k in a) n.setAttribute(k,a[k]); if (txt!=null) n.textContent=txt; return n; };
  for (let v=0; v<=top; v+=step) { svg.append(el("line",{x1:ml,x2:W-mr,y1:y(v),y2:y(v),class:v?"gridline":"axis"})); svg.append(el("text",{x:ml-8,y:y(v)+4,class:"tick","text-anchor":"end"},nf.format(v))); }
  c.forEach((d,i) => { let acc=0; KINDS.forEach(k => { if (!d[k]) return; const r = el("rect",{x:(ml+i*bw+4).toFixed(1), y:y(acc+d[k]).toFixed(1), width:(bw-8).toFixed(1), height:Math.max(0,y(acc)-y(acc+d[k])-1).toFixed(1), rx:2, fill:COLOR[k], class:"hot"}); r.setAttribute("data-tip", d.date+"  "+KO[k]+" "+nf.format(d[k])+"회  ·  합계 "+nf.format(totals[i])+"회"); svg.append(r); acc += d[k]; });
    if (totals[i]) svg.append(el("text",{x:ml+i*bw+bw/2, y:y(totals[i])-5, class:"tick","text-anchor":"middle"}, nf.format(totals[i])));
    svg.append(el("text",{x:ml+i*bw+bw/2, y:Hh-mb+17, class:"tick","text-anchor":"middle"}, md(d.date)));
    if (d.missing) { const g = el("rect",{x:(ml+i*bw+4).toFixed(1), y:mt, width:(bw-8).toFixed(1), height:ih, fill:"transparent"}); g.setAttribute("data-tip", d.date+"  세션 기록 없음"); svg.append(g); } });
  $("lg").innerHTML = KINDS.map(k => '<span><i style="--c:'+COLOR[k]+'"></i>'+KO[k]+'</span>').join("");
  const miss = c.filter(d=>d.missing).map(d=>md(d.date));
  $("c14foot").textContent = "막대 위 숫자 = 그날 다섯 종류 호출 합계." + (miss.length ? " 기록 없는 날 : "+miss.join(", ")+"." : "");
  hoverable(svg);
})();

// 주목할 점
$("find").innerHTML = DATA.findings.map(f => '<li class="'+f.level+'"><span class="dot"></span><span>'+esc(f.text)+'</span></li>').join("");

// 전체 목록(접이식)
const pill = s => s==="available"?'<span class="pill ok">가용</span>':s==="failed"?'<span class="pill bad">실패</span>':'<span class="pill dup">'+s+'</span>';
const order = {failed:0, available:1, duplicate:2, disabled:3};
function renderAll(q){ const ql=(q||"").trim().toLowerCase(); const rows = DATA.items.filter(x => !ql || (x.name+" "+x.source).toLowerCase().includes(ql)).sort((a,b)=>KINDS.indexOf(a.kind)-KINDS.indexOf(b.kind) || order[a.status]-order[b.status] || a.name.localeCompare(b.name));
  $("all").tBodies[0].innerHTML = rows.slice(0,600).map(x => '<tr><td class="kind" style="font-weight:500"><i style="--c:'+COLOR[x.kind]+'"></i>'+KO[x.kind]+'</td><td class="name">'+esc(x.name)+'</td><td>'+esc(x.source)+'</td><td>'+pill(x.status)+'</td></tr>').join(""); }
renderAll(""); $("q").addEventListener("input", e => renderAll(e.target.value));
</script>`;
fs.writeFileSync(out, html, "utf8");
console.log("written:", out, (fs.statSync(out).size / 1024).toFixed(0) + "KB");
