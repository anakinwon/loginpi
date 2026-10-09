// 툴체인 관제판 생성기 : 4개 에이전트 산출(inventory·usage_daily·utilization·efficiency_daily JSON)을 읽어
// 단일 HTML(tooldash.html)로 취합한다. 차트는 브라우저에서 인라인 SVG로 그린다(외부 라이브러리 없음).
// 실행 : node build_dashboard.mjs [출력경로]  (기본 = 같은 폴더의 tooldash.html)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, "../../work-statistics/main-dashboard/tooldash.html");   // HTML 시각화 파일 공통 폴더 (2026-09-22 지시)
fs.mkdirSync(path.dirname(out), { recursive: true });
const read = (f) => {
  const p = path.join(here, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

const inv = read("inventory.json");
const usage = read("usage_daily.json");
const util = read("utilization.json");
const eff = read("efficiency_daily.json");
if (!inv || !usage || !eff) throw new Error("inventory·usage_daily·efficiency_daily JSON이 모두 필요합니다");

// 임베드 데이터는 화면에 쓰는 필드만 남긴다(경로·설명 80자 유지, sources_read 제외)
const data = {
  generated_at: new Date().toISOString(),
  range: usage.range,
  inventory: {
    counts: inv.counts,
    items: inv.items.map((x) => ({
      kind: x.kind, name: x.name, source: x.source, scope: x.scope, status: x.status,
      provider_plugin: x.provider_plugin || null, description: (x.description || "").slice(0, 80), note: x.note || "",
    })),
    duplicates: inv.duplicates || [],
  },
  usage: { range: usage.range, days: usage.days, by_name: usage.by_name, by_kind_total: usage.by_kind_total, sources: usage.sources || {} },
  utilization: util ? { by_kind: util.by_kind, daily: util.daily, definitions: util.definitions || {}, notes: util.notes || [] } : null,
  efficiency: { days: eff.days, overall: eff.overall, definitions: eff.definitions || {}, cross_check: eff.cross_check || {} },
};

const html = `<meta charset="utf-8">
<title>툴체인 관제판</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ebe9e3;--ink:#0b0b0b;--ink2:#52514e;--ink3:#8a8884;
  --s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--other:#9a9893;
  --ok:#1a7f37;--warn:#b45309;--bad:#c0392b;--okbg:#e6f4ea;--warnbg:#fdf1e2;--badbg:#fbe9e7;
  --sans:"IBM Plex Sans KR",system-ui,"Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--other:#6f6e69;
  --ok:#4cbb6c;--warn:#e0a24d;--bad:#e66767;--okbg:#17301f;--warnbg:#332714;--badbg:#3a1c1a}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#151514;--surface:#1a1a19;--line:#2e2e2b;--grid:#262624;--ink:#ffffff;--ink2:#c3c2b7;--ink3:#8d8c85;
  --s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--other:#6f6e69;
  --ok:#4cbb6c;--warn:#e0a24d;--bad:#e66767;--okbg:#17301f;--warnbg:#332714;--badbg:#3a1c1a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans)}
.wrap{max-width:1240px;margin:0 auto;padding:28px 20px 56px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;margin-bottom:6px}
header h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.01em}
.meta{color:var(--ink2);font-family:var(--mono);font-size:12px}
.lede{color:var(--ink2);margin:0 0 22px;max-width:70ch}
h2{font-size:15px;font-weight:600;margin:34px 0 10px;display:flex;align-items:center;gap:10px}
h2 .eyebrow{font-family:var(--mono);font-size:11px;color:var(--ink3);letter-spacing:.06em;text-transform:uppercase;font-weight:500}
h3{font-size:13px;font-weight:600;margin:0 0 8px;color:var(--ink2)}
.kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:12px 14px 10px;position:relative;overflow:hidden}
.kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
.kpi .k{font-size:12px;color:var(--ink2);display:flex;justify-content:space-between;align-items:center}
.kpi .k .tag{font-family:var(--mono);font-size:11px;color:var(--ink3)}
.kpi b{display:block;font-size:26px;font-weight:600;font-family:var(--mono);line-height:1.1;margin:4px 0 2px}
.kpi small{color:var(--ink3);font-family:var(--mono);font-size:11px;display:block}
.kpi .spark{margin-top:6px;width:100%;height:28px;display:block}
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px}
.grid2{display:grid;grid-template-columns:1.6fr 1fr;gap:12px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.grid5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
@media (max-width:900px){.grid2,.grid3,.grid5{grid-template-columns:1fr}}
.chart{width:100%;height:auto;display:block;font-family:var(--sans)}
.chart .tick{fill:var(--ink3);font-size:11px;font-variant-numeric:tabular-nums}
.chart .val{fill:var(--ink);font-size:11px;font-family:var(--mono);font-variant-numeric:tabular-nums}
.chart .lbl{fill:var(--ink2);font-size:12px}
.chart .gridline{stroke:var(--grid);stroke-width:1}
.chart .axis{stroke:var(--line);stroke-width:1}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2);margin:6px 0 2px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;background:var(--c)}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-family:var(--mono);line-height:1.6;border:1px solid transparent}
.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.warn{background:var(--warnbg);color:var(--warn)}
.pill.dup{background:transparent;color:var(--ink3);border-color:var(--line)}
.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.chip{border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:999px;padding:3px 11px;font:12px var(--sans);cursor:pointer}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.chip:focus-visible,input:focus-visible,button:focus-visible{outline:2px solid var(--s1);outline-offset:2px}
input.q{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:4px;padding:4px 9px;font:13px var(--sans);min-width:220px;margin-left:auto}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:6px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{padding:6px 10px;border-bottom:1px solid var(--grid);text-align:left;vertical-align:top}
th{font-weight:600;color:var(--ink2);font-size:12px;position:sticky;top:0;background:var(--surface)}
td.num,th.num{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
td.name{font-family:var(--mono);font-size:12px;white-space:nowrap}
td:first-child{white-space:nowrap}
td.desc{color:var(--ink2);max-width:46ch}
.kdot{display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--c);margin-right:6px;vertical-align:0}
.tbl.scroll{max-height:440px;overflow:auto}
.foot{color:var(--ink3);font-size:12px;margin-top:8px}
.defs{columns:2;column-gap:28px;font-size:12.5px;color:var(--ink2)}
.defs dt{font-weight:600;color:var(--ink);break-inside:avoid}
.defs dd{margin:0 0 8px}
@media (max-width:900px){.defs{columns:1}}
details{margin-top:8px}summary{cursor:pointer;color:var(--ink2);font-size:12.5px}
.unused{font-family:var(--mono);font-size:11.5px;color:var(--ink2);line-height:1.7;word-break:break-all}
.stat{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px}
@media (max-width:900px){.stat{grid-template-columns:repeat(2,minmax(0,1fr))}}
.stat .kpi::before{background:var(--line)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:6px 9px;font-size:12px;border-radius:3px;max-width:380px;display:none;z-index:9;font-family:var(--mono);white-space:pre-line}
.hot:hover{filter:brightness(1.12)}
</style>
<div class="wrap">
<header><h1>툴체인 관제판</h1><span class="meta" id="meta"></span></header>
<p class="lede">Claude Code 작업공간(nia-dr-project)에서 쓸 수 있는 다섯 종류 도구의 설치·가용 현황과, 세션 기록에서 집계한 일별 사용횟수·이용률·효율을 한 화면에 모았습니다. 도구 종류마다 색이 고정되어 있어 어느 차트에서든 같은 색은 같은 종류입니다.</p>
<section class="kpis" id="kpis"></section>

<h2><span class="eyebrow">01</span>설치 · 가용 현황</h2>
<div class="chips" id="chips"></div>
<div class="tbl scroll"><table id="invtbl"><thead><tr><th>종류</th><th>이름</th><th>출처</th><th>상태</th><th>설명</th></tr></thead><tbody></tbody></table></div>
<p class="foot" id="invfoot"></p>

<h2><span class="eyebrow">02</span>일별 사용횟수</h2>
<div class="grid2">
  <div class="card"><h3>날짜별 호출 수 (종류별 누적)</h3><div class="legend" id="lg1"></div><svg class="chart" id="c_daily"></svg><p class="foot" id="dailyfoot"></p></div>
  <div class="card"><h3>많이 쓴 도구 상위 12 (다섯 종류만)</h3><svg class="chart" id="c_top"></svg><p class="foot">막대 색 = 종류. 기본 도구(Bash·Read·Edit 등)는 제외했으며 설치 현황 표의 검색으로 확인할 수 있습니다.</p></div>
</div>

<h2><span class="eyebrow">03</span>이용률</h2>
<div id="utilwrap"></div>

<h2><span class="eyebrow">04</span>효율</h2>
<div class="stat" id="effstat"></div>
<div class="grid3" id="effcharts"></div>
<div class="grid2" style="margin-top:12px">
  <div class="card"><h3>종류별 도구 호출 성공률</h3><svg class="chart" id="c_succ"></svg><p class="foot">성공률 = 1 − 오류 결과 수 / 전체 호출 수 (세션 기록 tool_result.is_error 기준)</p></div>
  <div class="card"><h3>종류별 평균 결과 길이 (문자)</h3><svg class="chart" id="c_len"></svg><p class="foot">호출 1건이 대화에 되돌려 주는 결과의 평균 길이. 길수록 컨텍스트를 많이 차지합니다.</p></div>
</div>

<h2><span class="eyebrow">05</span>지표 정의와 데이터 범위</h2>
<div class="card"><dl class="defs" id="defs"></dl><p class="foot" id="srcfoot"></p></div>
</div>
<div id="tip"></div>
<script>
const DATA = ${JSON.stringify(data)};
const KINDS = ["Skill","MCP","Agent","Hook","Plugin"];
const COLOR = {Skill:"var(--s1)",MCP:"var(--s2)",Agent:"var(--s3)",Hook:"var(--s4)",Plugin:"var(--s5)","기타":"var(--other)"};
const KO = {Skill:"스킬",MCP:"MCP",Agent:"에이전트",Hook:"훅",Plugin:"플러그인","기타":"기타"};
const nf = new Intl.NumberFormat("ko-KR");
const pct = (x, d=1) => x==null ? "–" : (x*100).toFixed(d) + "%";
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $ = (id) => document.getElementById(id);
const tip = $("tip");
document.addEventListener("mousemove", (e) => { if (tip.style.display !== "block") return; tip.style.left = Math.min(e.clientX + 14, innerWidth - 400) + "px"; tip.style.top = (e.clientY + 14) + "px"; });
function hoverable(root){ root.querySelectorAll("[data-tip]").forEach(el => { el.addEventListener("mouseenter", () => { tip.textContent = el.getAttribute("data-tip"); tip.style.display = "block"; }); el.addEventListener("mouseleave", () => tip.style.display = "none"); }); }
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs={}, text){ const n = document.createElementNS(svgNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (text != null) n.textContent = text; return n; }
function ticks(max, n=4){ if (!max) return [0]; const raw = max / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const step = [1,2,2.5,5,10].map(m => m*p).find(s => s >= raw); const out=[]; for (let v=0; v<=max+1e-9; v+=step) out.push(+v.toFixed(6)); if (out[out.length-1] < max) out.push(out[out.length-1]+step); return out; }
function calendar(from, to){ const d=[]; for (let t=new Date(from+"T00:00:00Z"); t<=new Date(to+"T00:00:00Z"); t.setUTCDate(t.getUTCDate()+1)) d.push(t.toISOString().slice(0,10)); return d; }
const md = (s) => s.slice(5).replace("-", "/");

// ── 헤더 · KPI ─────────────────────────────────────────────
const inv = DATA.inventory, U = DATA.usage, E = DATA.efficiency, T = DATA.utilization;
$("meta").textContent = "기간 " + U.range.from + " ~ " + U.range.to + " · 생성 " + DATA.generated_at.slice(0,16).replace("T"," ") + "Z";
const byKindStatus = {}; inv.items.forEach(x => { const s = byKindStatus[x.kind] ??= {all:0, available:0, failed:0, duplicate:0, disabled:0}; s.all++; s[x.status] = (s[x.status]||0)+1; });
const days = U.days;
$("kpis").innerHTML = KINDS.map(k => {
  const s = byKindStatus[k] || {all:0,available:0,failed:0};
  const used = T ? T.by_kind[k].used_unique : null, rate = T ? T.by_kind[k].rate_available : null;
  const series = days.map(d => d[k]||0), mx = Math.max(1, ...series);
  const w=200,h=28, pts = series.map((v,i)=> (i*(w/(series.length-1||1))).toFixed(1)+","+(h-2-(v/mx)*(h-4)).toFixed(1)).join(" ");
  return '<div class="kpi" style="--c:'+COLOR[k]+'"><div class="k"><span>'+KO[k]+' <span class="tag">'+k+'</span></span><span class="tag">' + (s.failed? '<span class="pill bad">실패 '+s.failed+'</span>' : '<span class="pill ok">정상</span>') + '</span></div>'
   + '<b>'+nf.format(s.all)+'<span style="font-size:13px;color:var(--ink3);font-weight:400"> 설치</span></b>'
   + '<small>가용 '+nf.format(s.available)+' · 호출 '+nf.format(U.by_kind_total[k]||0)+'회 · 사용 '+(used==null?'–':nf.format(used))+'개 → 이용률 '+pct(rate,0)+'</small>'
   + '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+COLOR[k]+'" stroke-width="1.5"/></svg></div>';
}).join("");

// ── 01 설치 현황 표 ─────────────────────────────────────────
const state = { kind:"전체", status:"전체", q:"" };
const kindsAll = ["전체", ...KINDS], statusAll = ["전체","available","failed","duplicate"];
function renderChips(){
  $("chips").innerHTML = kindsAll.map(k => '<button class="chip" data-k="'+k+'" aria-pressed="'+(state.kind===k)+'">'+(k==="전체"?"전체":KO[k]+" "+(byKindStatus[k]?.all||0))+'</button>').join("")
    + '<span style="width:10px"></span>' + statusAll.map(s => '<button class="chip" data-s="'+s+'" aria-pressed="'+(state.status===s)+'">'+({전체:"모든 상태",available:"가용",failed:"실패",duplicate:"중복"})[s]+'</button>').join("")
    + '<input class="q" placeholder="이름·출처·설명 검색" value="'+esc(state.q)+'" aria-label="검색">';
  $("chips").querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { if (b.dataset.k) state.kind = b.dataset.k; else state.status = b.dataset.s; renderChips(); renderTable(); }));
  const q = $("chips").querySelector("input.q"); q.addEventListener("input", () => { state.q = q.value; renderTable(); });
}
function renderTable(){
  const ql = state.q.trim().toLowerCase();
  const rows = inv.items.filter(x => (state.kind==="전체" || x.kind===state.kind) && (state.status==="전체" || x.status===state.status)
    && (!ql || (x.name+" "+x.source+" "+x.description+" "+(x.provider_plugin||"")).toLowerCase().includes(ql)));
  const order = {failed:0, disabled:1, available:2, duplicate:3};
  rows.sort((a,b) => KINDS.indexOf(a.kind)-KINDS.indexOf(b.kind) || order[a.status]-order[b.status] || a.name.localeCompare(b.name));
  const pill = (s) => s==="available" ? '<span class="pill ok">가용</span>' : s==="failed" ? '<span class="pill bad">실패</span>' : s==="duplicate" ? '<span class="pill dup">중복</span>' : '<span class="pill warn">'+s+'</span>';
  $("invtbl").tBodies[0].innerHTML = rows.slice(0, 600).map(x => '<tr><td><span class="kdot" style="--c:'+COLOR[x.kind]+'"></span>'+KO[x.kind]+'</td><td class="name">'+esc(x.name)+'</td><td>'+esc(x.source)+'</td><td>'+pill(x.status)+(x.note?'<div class="foot" style="margin:2px 0 0">'+esc(x.note)+'</div>':'')+'</td><td class="desc">'+esc(x.description)+'</td></tr>').join("");
  $("invfoot").textContent = rows.length + "건 표시 (전체 " + inv.items.length + "건" + (rows.length>600 ? ", 600건까지만 그림" : "") + "). 중복 = 같은 이름이 여러 출처에 있어 앞 출처가 우선하는 항목.";
}
renderChips(); renderTable();

// ── 02 일별 사용횟수 : 누적 막대 ───────────────────────────
(function(){
  const cal = calendar(U.range.from, U.range.to), byDate = Object.fromEntries(days.map(d => [d.date, d]));
  const W=760, H=250, ml=44, mr=8, mt=10, mb=34, iw=W-ml-mr, ih=H-mt-mb, n=cal.length, bw = iw/n;
  const totals = cal.map(dt => KINDS.reduce((s,k) => s + ((byDate[dt]||{})[k]||0), 0)), max = Math.max(1, ...totals);
  const tk = ticks(max), top = tk[tk.length-1], y = (v) => mt + ih - (v/top)*ih;
  const svg = $("c_daily"); svg.setAttribute("viewBox", "0 0 "+W+" "+H);
  tk.forEach(v => { svg.append(el("line",{x1:ml,x2:W-mr,y1:y(v),y2:y(v),class:"gridline"})); svg.append(el("text",{x:ml-6,y:y(v)+4,class:"tick","text-anchor":"end"}, nf.format(v))); });
  cal.forEach((dt,i) => {
    let acc = 0; const d = byDate[dt];
    KINDS.forEach(k => { const v = d ? (d[k]||0) : 0; if (!v) return; const y1 = y(acc+v), y0 = y(acc);
      const r = el("rect",{x:(ml+i*bw+1).toFixed(1), y:y1.toFixed(1), width:Math.max(1,bw-2).toFixed(1), height:Math.max(0,y0-y1-1).toFixed(1), fill:COLOR[k], class:"hot"});
      r.setAttribute("data-tip", dt+"  "+KO[k]+" "+nf.format(v)+"회"+(d.sessions?"  ·  세션 "+d.sessions:"")+"  ·  합계 "+nf.format(totals[i])+"회"); svg.append(r); acc += v; });
    if (i % Math.ceil(n/12) === 0 || i===n-1) svg.append(el("text",{x:ml+i*bw+bw/2, y:H-mb+16, class:"tick","text-anchor":"middle"}, md(dt)));
    if (!d) { const g = el("rect",{x:(ml+i*bw+1).toFixed(1), y:mt, width:Math.max(1,bw-2).toFixed(1), height:ih, fill:"transparent"}); g.setAttribute("data-tip", dt+"  세션 기록 없음"); svg.append(g); }
  });
  svg.append(el("line",{x1:ml,x2:W-mr,y1:y(0),y2:y(0),class:"axis"}));
  $("lg1").innerHTML = KINDS.map(k => '<span><i style="--c:'+COLOR[k]+'"></i>'+KO[k]+' '+nf.format(U.by_kind_total[k]||0)+'</span>').join("") + '<span style="color:var(--ink3)">기타(기본 도구) '+nf.format(U.by_kind_total["기타"]||0)+'회는 제외</span>';
  const active = days.length, peak = days.reduce((a,b) => (KINDS.reduce((s,k)=>s+(b[k]||0),0) > KINDS.reduce((s,k)=>s+(a[k]||0),0)) ? b : a, days[0]);
  $("dailyfoot").textContent = "달력 "+n+"일 중 활동일 "+active+"일. 최다일 "+peak.date+" ("+nf.format(KINDS.reduce((s,k)=>s+(peak[k]||0),0))+"회). 플러그인은 스킬·MCP·훅 중 플러그인 제공분을 다시 센 값이라 다른 종류와 겹칩니다. 훅은 2026-08-31 이후 기록만 존재합니다.";
  hoverable(svg);
})();

// ── 02 상위 도구 가로 막대 ─────────────────────────────────
(function(){
  const rows = [...U.by_name].filter(x => KINDS.includes(x.kind)).sort((a,b)=>b.count-a.count).slice(0,12);
  const W=420, rh=22, ml=150, mr=54, H = rows.length*rh + 8, iw = W-ml-mr, max = Math.max(1, ...rows.map(r=>r.count));
  const svg = $("c_top"); svg.setAttribute("viewBox","0 0 "+W+" "+H);
  rows.forEach((r,i) => { const y = 4 + i*rh, w = (r.count/max)*iw;
    svg.append(el("text",{x:ml-8,y:y+14,class:"lbl","text-anchor":"end"}, (r.name.length>18? r.name.slice(0,17)+"…" : r.name)));
    const b = el("rect",{x:ml,y:y+3,width:w.toFixed(1),height:rh-8,rx:2,fill:COLOR[r.kind]||COLOR["기타"],class:"hot"}); b.setAttribute("data-tip", KO[r.kind]+" · "+r.name+"  "+nf.format(r.count)+"회 · 오류 "+nf.format(r.errors||0)+"\\n첫 사용 "+r.first+" · 마지막 "+r.last); svg.append(b);
    svg.append(el("text",{x:ml+w+6,y:y+14,class:"val"}, nf.format(r.count))); });
  hoverable(svg);
})();

// ── 03 이용률 ──────────────────────────────────────────────
(function(){
  const wrap = $("utilwrap");
  if (!T) { wrap.innerHTML = '<div class="card"><p class="foot">이용률 산출(utilization.json)이 아직 없습니다.</p></div>'; return; }
  const W=720, rh=30, ml=88, mr=150, H = KINDS.length*rh+10, iw=W-ml-mr;
  let svg = '<svg class="chart" viewBox="0 0 '+W+' '+H+'" id="c_util">';
  KINDS.forEach((k,i) => { const b = T.by_kind[k]; const y = 6+i*rh; const r = b.rate_available ?? 0;
    svg += '<text x="'+(ml-8)+'" y="'+(y+15)+'" class="lbl" text-anchor="end">'+KO[k]+'</text>'
      + '<rect x="'+ml+'" y="'+(y+4)+'" width="'+iw+'" height="'+(rh-10)+'" rx="2" fill="var(--grid)"/>'
      + '<rect x="'+ml+'" y="'+(y+4)+'" width="'+(iw*Math.min(1,r)).toFixed(1)+'" height="'+(rh-10)+'" rx="2" fill="'+COLOR[k]+'" class="hot" data-tip="'+KO[k]+' 이용률 '+pct(r)+'\\n사용 '+b.used_unique+' / 가용 '+b.installed_available+' (전체 설치 '+b.installed_all+' 기준 '+pct(b.rate_all)+')\\n상위 5개 비중 '+pct(b.top5_share)+' · 80% 도달 항목 수 '+(b.n_for_80pct??"–")+'"/>'
      + '<text x="'+(ml+iw+8)+'" y="'+(y+15)+'" class="val">'+pct(r)+'  <tspan class="tick">'+b.used_unique+'/'+b.installed_available+'</tspan></text>'; });
  svg += '</svg>';
  // 일별 활성 비율 소형 다중 차트
  const cal = calendar(U.range.from, U.range.to), byDate = Object.fromEntries((T.daily||[]).map(d=>[d.date,d]));
  const sm = KINDS.map(k => { const w=460,h=96,ml2=42,mt2=8,mb2=18,iw2=w-ml2-8,ih2=h-mt2-mb2; const vals = cal.map(dt => byDate[dt] ? (byDate[dt].active_rate?.[k] ?? null) : null); const max = Math.max(0.01, ...vals.filter(v=>v!=null)); const top = Math.min(1, Math.ceil(max*10)/10 || 0.1);
    let pts="", segs=[]; vals.forEach((v,i) => { if (v==null) { if (pts) segs.push(pts); pts=""; return; } pts += (ml2 + i*(iw2/(cal.length-1))).toFixed(1)+","+(mt2+ih2-(v/top)*ih2).toFixed(1)+" "; }); if (pts) segs.push(pts);
    const dots = vals.map((v,i) => (v==null || v===0) ? "" : '<circle cx="'+(ml2 + i*(iw2/(cal.length-1))).toFixed(1)+'" cy="'+(mt2+ih2-(v/top)*ih2).toFixed(1)+'" r="3" fill="'+COLOR[k]+'" stroke="var(--surface)" stroke-width="1.5" class="hot" data-tip="'+cal[i]+'  '+KO[k]+' 활성 '+(byDate[cal[i]].active?.[k]??"–")+'개 = '+pct(v)+'"/>').join("");
    return '<div class="card" style="padding:10px 12px"><h3 style="margin-bottom:2px">'+KO[k]+' 일별 활성 비율</h3><svg class="chart" viewBox="0 0 '+w+' '+h+'">'
      + '<line x1="'+ml2+'" x2="'+(w-8)+'" y1="'+(mt2+ih2)+'" y2="'+(mt2+ih2)+'" class="axis"/><line x1="'+ml2+'" x2="'+(w-8)+'" y1="'+mt2+'" y2="'+mt2+'" class="gridline"/>'
      + '<text x="'+(ml2-4)+'" y="'+(mt2+4)+'" class="tick" text-anchor="end">'+pct(top,0)+'</text><text x="'+(ml2-4)+'" y="'+(mt2+ih2+4)+'" class="tick" text-anchor="end">0</text>'
      + segs.map(p => '<polyline points="'+p.trim()+'" fill="none" stroke="'+COLOR[k]+'" stroke-width="1.5"/>').join("") + dots
      + '<text x="'+ml2+'" y="'+(h-3)+'" class="tick">'+md(cal[0])+'</text><text x="'+(w-8)+'" y="'+(h-3)+'" class="tick" text-anchor="end">'+md(cal[cal.length-1])+'</text></svg></div>'; });
  const unused = KINDS.map(k => { const b=T.by_kind[k]; const list = b.unused_available||[]; return '<details><summary>'+KO[k]+' 미사용 '+list.length+'개 · 14일 이상 미사용 '+(b.stale_14d||[]).length+'개 · 이름 대응 실패 '+(b.unmatched||[]).length+'건</summary><div class="unused">'+esc(list.join("  ·  ")||"없음")+'</div>'+((b.unmatched||[]).length?'<div class="unused" style="color:var(--warn)">대응 실패: '+esc(b.unmatched.join("  ·  "))+'</div>':'')+'</details>'; }).join("");
  wrap.innerHTML = '<div class="grid2"><div class="card"><h3>종류별 이용률 (사용된 고유 항목 / 가용 설치 항목)</h3>'+svg+'<p class="foot">막대 끝 숫자 = 사용 항목 수 / 가용 항목 수. 실패·중복 항목은 분모에서 제외. 전체 설치 기준 값은 막대에 마우스를 올리면 보입니다.</p>'+unused+'</div><div style="display:grid;gap:10px">'+sm.join("")+'</div></div>';
  hoverable(wrap);
})();

// ── 04 효율 ────────────────────────────────────────────────
(function(){
  const o = E.overall;
  const tiles = [
    ["도구 호출 성공률", pct(o.success_rate), "오류 "+nf.format(o.n?.tool_errors??0)+" / "+nf.format(o.calls)+"회"],
    ["캐시 적중률", pct(o.cache_hit_rate), "입력 토큰 중 캐시에서 읽은 비율"],
    ["호출당 토큰", nf.format(o.tokens_per_call), "전체 토큰 ÷ 도구 호출 수"],
    ["호출당 비용", o.cost_per_call_usd==null?"–":"$"+o.cost_per_call_usd.toFixed(3), "작업 이력 "+(o.turns||0)+"턴 · $"+(o.cost_usd||0).toFixed(2)],
    ["검증률", pct(o.verified_rate), "실행 확인 후 완료 보고한 턴 비율"],
    ["첫 토큰 지연 중앙값", o.ttft_ms_median==null?"–":(o.ttft_ms_median/1000).toFixed(1)+"s", "턴 소요 중앙값 "+(o.elapsed_ms_median==null?"–":(o.elapsed_ms_median/1000).toFixed(0)+"s")],
  ];
  $("effstat").innerHTML = tiles.map(t => '<div class="kpi"><div class="k">'+t[0]+'</div><b style="font-size:22px">'+t[1]+'</b><small>'+t[2]+'</small></div>').join("");
  const series = [
    ["success_rate","도구 호출 성공률",v=>pct(v),1,"var(--s1)"],
    ["cache_hit_rate","캐시 적중률",v=>pct(v),1,"var(--s3)"],
    ["tokens_per_call","호출당 토큰",v=>nf.format(Math.round(v)),null,"var(--s2)"],
    ["cost_per_call_usd","호출당 비용 (USD)",v=>"$"+v.toFixed(3),null,"var(--s4)"],
    ["verified_rate","검증률",v=>pct(v),1,"var(--s5)"],
    ["ttft_ms_median","첫 토큰 지연 중앙값",v=>(v/1000).toFixed(1)+"s",null,"var(--s1)"],
  ];
  const cal = calendar(U.range.from, U.range.to), byDate = Object.fromEntries(E.days.map(d=>[d.date,d]));
  $("effcharts").innerHTML = series.map(([key,label,fmt,cap,color]) => {
    const w=380,h=120,ml=52,mt=8,mb=18,iw=w-ml-8,ih=h-mt-mb; const vals = cal.map(dt => byDate[dt] ? byDate[dt][key] : null); const present = vals.filter(v=>v!=null);
    if (!present.length) return '<div class="card"><h3>'+label+'</h3><p class="foot">계산 가능한 날이 없습니다.</p></div>';
    const max = Math.max(...present), top = cap ?? ticks(max)[ticks(max).length-1]; const y = v => mt+ih-(v/top)*ih, x = i => ml + i*(iw/(cal.length-1));
    let segs=[], p=""; vals.forEach((v,i)=>{ if (v==null){ if(p) segs.push(p); p=""; return;} p += x(i).toFixed(1)+","+y(v).toFixed(1)+" "; }); if (p) segs.push(p);
    const dots = vals.map((v,i)=> v==null?"":'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3.5" fill="'+color+'" stroke="var(--surface)" stroke-width="1.5" class="hot" data-tip="'+cal[i]+'  '+label+' '+fmt(v)+(byDate[cal[i]].calls?'  ·  호출 '+nf.format(byDate[cal[i]].calls)+'회':'')+'"/>').join("");
    const last = [...vals].reverse().find(v=>v!=null);
    return '<div class="card"><h3>'+label+'</h3><svg class="chart" viewBox="0 0 '+w+' '+h+'">'
      + '<line x1="'+ml+'" x2="'+(w-8)+'" y1="'+y(0)+'" y2="'+y(0)+'" class="axis"/><line x1="'+ml+'" x2="'+(w-8)+'" y1="'+y(top/2)+'" y2="'+y(top/2)+'" class="gridline"/><line x1="'+ml+'" x2="'+(w-8)+'" y1="'+y(top)+'" y2="'+y(top)+'" class="gridline"/>'
      + '<text x="'+(ml-6)+'" y="'+(y(top)+4)+'" class="tick" text-anchor="end">'+fmt(top)+'</text><text x="'+(ml-6)+'" y="'+(y(top/2)+4)+'" class="tick" text-anchor="end">'+fmt(top/2)+'</text><text x="'+(ml-6)+'" y="'+(y(0)+4)+'" class="tick" text-anchor="end">0</text>'
      + segs.map(s=>'<polyline points="'+s.trim()+'" fill="none" stroke="'+color+'" stroke-width="1.5"/>').join("") + dots
      + '<text x="'+ml+'" y="'+(h-4)+'" class="tick">'+md(cal[0])+'</text><text x="'+(w-8)+'" y="'+(h-4)+'" class="tick" text-anchor="end">'+md(cal[cal.length-1])+'</text>'
      + '</svg><p class="foot">마지막 값 '+fmt(last)+' · 전체 '+fmt(o[key]??0)+'</p></div>'; }).join("");
  // 종류별 성공률 · 결과 길이
  const kinds4 = ["Agent","MCP","Skill","기타"];
  function hbar(id, obj, fmt, unitMax){ const rows = kinds4.filter(k => obj && obj[k]!=null); const W=600,rh=26,ml=76,mr=80,H=rows.length*rh+8,iw=W-ml-mr, max = unitMax ?? Math.max(1,...rows.map(k=>obj[k]));
    const svg=$(id); svg.setAttribute("viewBox","0 0 "+W+" "+H); rows.forEach((k,i)=>{ const yy=4+i*rh, w=(obj[k]/max)*iw; svg.append(el("text",{x:ml-8,y:yy+16,class:"lbl","text-anchor":"end"},KO[k])); const b=el("rect",{x:ml,y:yy+4,width:w.toFixed(1),height:rh-9,rx:2,fill:COLOR[k],class:"hot"}); b.setAttribute("data-tip",KO[k]+"  "+fmt(obj[k])); svg.append(b); svg.append(el("text",{x:ml+w+6,y:yy+16,class:"val"},fmt(obj[k]))); }); hoverable(svg); }
  hbar("c_succ", o.success_by_kind, v=>pct(v), 1);
  hbar("c_len", o.avg_result_chars_by_kind, v=>nf.format(Math.round(v))+"자");
  hoverable($("effcharts"));
})();

// ── 05 정의 · 범위 ─────────────────────────────────────────
(function(){
  const defs = Object.assign({}, T?.definitions||{}, E.definitions||{});
  $("defs").innerHTML = Object.entries(defs).map(([k,v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join("");
  const notes = [
    "원천 : 이 프로젝트의 세션 기록 "+(U.sources.transcripts??"–")+"개 + 서브에이전트 기록 "+(U.sources.subagent_files??"–")+"개 (2026-08-05~09-21), 작업 이력 로그 (2026-09-18~, 로거 도입 이후), 설정·플러그인·스킬 파일 "+inv.items.length+"건.",
    "훅 기록은 2026-08-31 이후 세션에만 남아 있고 출력이 있는 훅만 기록되므로 실제 훅 실행 수보다 적습니다.",
    "2026-09-19·20은 다른 작업 장소의 세션이라 이 PC에 세션 기록이 없어 호출 수가 0으로 보이며, 작업 이력 기반 지표(비용·검증률·지연)만 있습니다.",
    "플러그인은 스킬·MCP·훅 중 플러그인이 제공한 것을 다시 센 값이라 종류 합계에 더하면 이중 계산이 됩니다.",
  ].concat(T?.notes||[]);
  $("srcfoot").innerHTML = notes.map(n => "※ "+esc(n)).join("<br>");
})();
</script>`;

fs.writeFileSync(out, html, "utf8");
console.log("written:", out, (fs.statSync(out).size/1024).toFixed(0)+"KB");
