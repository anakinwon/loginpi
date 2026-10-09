// 이용률 등 성과지표 집계 — inventory.json(설치 정본) × events.jsonl(원자 이벤트) × usage_daily.json(기간·활동일)
// 실행: node utilization.mjs   (같은 폴더의 입력 파일을 읽고 utilization.json / utilization_summary.md 를 씀)
// 지표 정의는 팀 리더 지시문 그대로이며 새 지표는 만들지 않는다. 계산 불가 항목은 null + 사유.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const P = (f) => path.join(DIR, f);
const KINDS = ["Skill", "MCP", "Agent", "Hook", "Plugin"];
const STALE_CUTOFF = "2026-09-07"; // 마지막 사용일이 이 날짜 이하이면 장기 미사용(14일 이상 전)

const inv = JSON.parse(fs.readFileSync(P("inventory.json"), "utf8"));
const usage = JSON.parse(fs.readFileSync(P("usage_daily.json"), "utf8"));
const events = fs.readFileSync(P("events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const activeDays = usage.days.map((d) => d.date); // 활동일 29일 (usage_daily 정본 그대로)

// ---------- 이름 대응 ----------
// 훅 매처: null → 전부 일치, "*" → 전부 일치, 그 외는 정규식 전체 일치
function matcherHits(matcher, value) {
  if (matcher == null || matcher === "*") return true;
  if (value == null) return false; // 매처가 있는데 이벤트에 값이 없으면 불일치
  try { return new RegExp(`^(?:${matcher})$`).test(value); } catch { return matcher === value; }
}

// Skill 별칭: 정확 일치 → 대소문자 무시 일치. 플러그인 제공 스킬은 "provider_plugin:name" 조합 정확 일치도 허용(부분 일치 아님)
function skillKeys(it) {
  const keys = [it.name];
  if (it.provider_plugin) keys.push(`${it.provider_plugin}:${it.name}`);
  return keys;
}

// 종류별 인덱스: 키(소문자) → inventory 항목 배열(중복 항목 포함)
const byKind = Object.fromEntries(KINDS.map((k) => [k, inv.items.filter((i) => i.kind === k)]));
const idx = { Skill: new Map(), MCP: new Map(), Agent: new Map() };
for (const it of byKind.Skill) for (const k of skillKeys(it)) push(idx.Skill, k, it);
for (const it of byKind.MCP) push(idx.MCP, it.name, it);
for (const it of byKind.Agent) push(idx.Agent, it.name, it);
function push(map, key, it) {
  for (const k of new Set([key, key.toLowerCase()])) map.set(k, [...(map.get(k) || []), it]);
}
function lookup(kind, key) {
  return idx[kind].get(key) || idx[kind].get(key.toLowerCase()) || [];
}
function itemId(it) { return `${it.kind}|${it.name}|${it.source}`; }

// 이벤트 → inventory 항목 대응 (한 이벤트가 여러 항목에 대응될 수 있음 — 훅·중복 스킬)
function resolve(e) {
  if (e.kind === "Skill") return { key: e.detail.replace(/^\//, ""), items: lookup("Skill", e.detail.replace(/^\//, "")) };
  if (e.kind === "MCP") return { key: e.name, items: lookup("MCP", e.name) };
  if (e.kind === "Agent") return { key: e.detail, items: lookup("Agent", e.detail) };
  if (e.kind === "Hook") {
    const i = e.name.indexOf(":");
    const event = i < 0 ? e.name : e.name.slice(0, i);
    const value = i < 0 ? null : e.name.slice(i + 1);
    return { key: e.name, items: byKind.Hook.filter((h) => h.event === event && matcherHits(h.matcher, value)) };
  }
  return null;
}

// ---------- 집계 ----------
// 항목별 통계: id → {item, count, first, last, dates:Set}
const stat = new Map();
const calls = Object.fromEntries(KINDS.map((k) => [k, 0]));
const unmatched = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
function hit(it, e) {
  const id = itemId(it);
  const s = stat.get(id) || { item: it, count: 0, first: e.date, last: e.date, dates: new Set() };
  s.count++; s.dates.add(e.date);
  if (e.date < s.first) s.first = e.date;
  if (e.date > s.last) s.last = e.date;
  stat.set(id, s);
}
for (const e of events) {
  const r = resolve(e);
  if (!r) continue;
  calls[e.kind]++;
  if (r.items.length === 0) { unmatched[e.kind].set(r.key, (unmatched[e.kind].get(r.key) || 0) + 1); continue; }
  for (const it of r.items) hit(it, e);
  // Plugin: via_plugin 이벤트를 대응 항목의 provider_plugin 으로 역대응
  if (e.via_plugin) {
    const plugins = new Set(r.items.map((it) => it.provider_plugin).filter(Boolean));
    calls.Plugin++;
    if (plugins.size === 0) { unmatched.Plugin.set(r.key, (unmatched.Plugin.get(r.key) || 0) + 1); continue; }
    for (const p of plugins) {
      const pit = byKind.Plugin.find((x) => x.name === p);
      if (pit) hit(pit, e); else unmatched.Plugin.set(`provider_plugin=${p}`, (unmatched.Plugin.get(`provider_plugin=${p}`) || 0) + 1);
    }
  }
}

const r4 = (x) => (x == null ? null : Math.round(x * 10000) / 10000);
const by_kind = {};
for (const k of KINDS) {
  const all = byKind[k];
  const avail = all.filter((i) => i.status === "available");
  const usedAll = all.filter((i) => stat.has(itemId(i)));
  const usedAvail = avail.filter((i) => stat.has(itemId(i)));
  // 집중도: 항목별 호출 수(훅은 이벤트가 대응된 모든 훅 항목에 각각 귀속) 내림차순
  const counts = usedAll.map((i) => stat.get(itemId(i)).count).sort((a, b) => b - a);
  const total = counts.reduce((a, b) => a + b, 0);
  let cum = 0, n80 = null;
  for (let i = 0; i < counts.length; i++) { cum += counts[i]; if (cum >= total * 0.8) { n80 = i + 1; break; } }
  const top5 = counts.slice(0, 5).reduce((a, b) => a + b, 0);
  by_kind[k] = {
    installed_all: all.length,
    installed_available: avail.length,
    used_unique: usedAll.length,
    used_unique_available: usedAvail.length,
    rate_all: all.length ? r4(usedAll.length / all.length) : null,
    rate_available: avail.length ? r4(usedAvail.length / avail.length) : null,
    calls: total,
    top5_share: total ? r4(top5 / total) : null,
    n_for_80pct: n80,
    top5: usedAll.map((i) => ({ name: i.name, count: stat.get(itemId(i)).count })).sort((a, b) => b.count - a.count).slice(0, 5),
    used: usedAll.map((i) => ({ name: i.name, status: i.status, count: stat.get(itemId(i)).count, first: stat.get(itemId(i)).first, last: stat.get(itemId(i)).last })).sort((a, b) => b.count - a.count),
    unused_available: avail.filter((i) => !stat.has(itemId(i))).map((i) => i.name).sort((a, b) => a.localeCompare(b)),
    stale_14d: usedAll.filter((i) => stat.get(itemId(i)).last <= STALE_CUTOFF).map((i) => ({ name: i.name, last: stat.get(itemId(i)).last })),
    unmatched: [...unmatched[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, count]) => ({ name, count })),
    unmatched_total_events: [...unmatched[k].values()].reduce((a, b) => a + b, 0),
  };
  if (!total) { by_kind[k].top5_share = null; by_kind[k].n_for_80pct = null; by_kind[k].concentration_note = "호출 0건 — 집중도 계산 불가"; }
}

// 일별 활성 비율: 그날 사용된 고유 available 항목 수 / available 설치 수
const daily = activeDays.map((date) => {
  const active = {}, active_rate = {};
  for (const k of KINDS) {
    const n = byKind[k].filter((i) => i.status === "available" && stat.has(itemId(i)) && stat.get(itemId(i)).dates.has(date)).length;
    active[k] = n;
    active_rate[k] = by_kind[k].installed_available ? r4(n / by_kind[k].installed_available) : null;
  }
  return { date, active, active_rate };
});

const definitions = {
  "이용률(rate_all)": "기간 내 1회 이상 사용된 고유 항목 수 / 설치 항목 수(status 무관)",
  "이용률(rate_available)": "기간 내 1회 이상 사용된 고유 available 항목 수 / available 설치 수(failed·disabled·duplicate 제외)",
  "일별 활성 비율(active_rate)": "그날 사용된 고유 available 항목 수 / available 설치 수 — 활동일 29일만",
  "미사용 목록(unused_available)": "기간 내 사용 0회인 available 항목 이름",
  "장기 미사용(stale_14d)": `마지막 사용일이 ${STALE_CUTOFF} 이하(기준일 2026-09-21에서 14일 이상 전)인 사용 항목`,
  "집중도(top5_share / n_for_80pct)": "종류별 호출 수 상위 5개 항목의 점유율, 누적 80%에 도달하는 항목 수",
  "대응 실패(unmatched)": "events 이름이 inventory에 없는 경우 — 종류별 고유 이름·건수(최대 30개)",
};
const notes = [
  "이름 대응 규칙: Skill = 이벤트 detail(접두어 '/' 제거) ↔ inventory name 정확 일치 → 대소문자 무시 일치. 플러그인 제공 스킬(inventory name 'pptx', provider_plugin 'document-skills')은 이벤트가 'document-skills:pptx' 형식이므로 'provider_plugin:name' 조합의 정확 일치만 추가 허용(부분 일치 아님). 이 별칭 없이는 document-skills:pptx(3건)·document-skills:docx(1건)가 대응 실패로 분류됨.",
  "Hook 대응: 이벤트 name이 '이벤트:매처값'(예 SessionStart:startup, PostToolUse:Bash) 형식이므로 콜론 앞을 event, 뒤를 매처 대상값으로 분해해 inventory 훅의 event 일치 + 매처 정규식 전체 일치(null·'*'는 전부 일치)로 판정. 한 이벤트가 여러 훅 항목에 대응되면 모두 사용으로 집계하므로 Hook·Plugin의 호출 수 합계(calls)는 원자 이벤트 수보다 큼.",
  "Plugin 대응: via_plugin=true 이벤트가 대응된 inventory 항목의 provider_plugin(비어 있지 않은 것)으로 역대응. 훅 이벤트는 어느 플러그인 훅이 실행됐는지 기록이 없어 매처가 맞는 플러그인 훅 전부(ponytail·headroom·claude-mem)에 귀속됨 — 플러그인 호출 수는 상한 추정치.",
  "사이드체인(서브에이전트) 이벤트와 is_error=true 이벤트도 '호출됨'이므로 사용으로 포함.",
  "MCP inventory 항목 'ide'·'Claude Docs'·'mcp-search'·failed 2건(claude-flow·tibero)은 기간 내 호출 이벤트 없음.",
  "Hook 'Setup' 이벤트(claude-mem version-check.js)는 events.jsonl에 해당 이벤트 종류가 없어 미사용으로 분류됨(세션 기록에 남지 않는 훅일 수 있음).",
  "Hook 미사용 6건(PreToolUse record-skill.py·headroom, Stop 2건, SessionEnd, Setup)은 events.jsonl에 해당 이벤트 종류(PreToolUse:Skill·Bash, Stop, SessionEnd, Setup)가 전혀 없음 — 세션 기록이 출력 있는 훅만 남기는 원천 한계로 보이며 실제 미실행과 구분 불가. inventory의 SessionStart bun-runner.js 항목 2건은 동일 정의 중복이라 같은 수치로 집계됨.",
];

const out = { generated_at: new Date().toISOString(), range: { ...usage.range, active_days: activeDays.length, events_total: events.length }, by_kind, daily, definitions, notes };
fs.writeFileSync(P("utilization.json"), JSON.stringify(out, null, 2), "utf8");

// ---------- 요약 MD ----------
const pct = (x) => (x == null ? "null" : `${(x * 100).toFixed(1)}%`);
const md = [];
md.push("# 이용률 등 성과지표 요약", "", `- 기간: ${usage.range.from} ~ ${usage.range.to} (활동일 ${activeDays.length}일, 이벤트 ${events.length}건)`, `- 장기 미사용 기준: 마지막 사용일 ≤ ${STALE_CUTOFF}`, "");
md.push("## 종류별 이용률", "", "| 종류 | 설치(a 전체) | 설치(b available) | 사용 고유 항목 | 이용률(a) | 이용률(b) | 호출 수 |", "|---|---|---|---|---|---|---|");
for (const k of KINDS) { const b = by_kind[k]; md.push(`| ${k} | ${b.installed_all} | ${b.installed_available} | ${b.used_unique} | ${pct(b.rate_all)} | ${pct(b.rate_available)} | ${b.calls} |`); }
md.push("", "## 사용된 항목 (종류별 전체)", "");
for (const k of KINDS) md.push(`- ${k}: ${by_kind[k].used.map((u) => `${u.name}(${u.count}, 최근 ${u.last})`).join(" · ") || "없음"}`);
md.push("", "## 집중도", "", "| 종류 | 상위 5개 점유율 | 누적 80% 도달 항목 수 | 상위 5개 |", "|---|---|---|---|");
for (const k of KINDS) { const b = by_kind[k]; md.push(`| ${k} | ${pct(b.top5_share)} | ${b.n_for_80pct ?? "null(호출 0건)"} | ${b.top5.map((t) => `${t.name}(${t.count})`).join(", ") || "-"} |`); }
md.push("", "## 미사용 available 항목 (종류별 상위 10개, 전체는 utilization.json)", "");
for (const k of KINDS) { const u = by_kind[k].unused_available; md.push(`- ${k} ${u.length}개: ${u.slice(0, 10).join(", ")}${u.length > 10 ? ` … 외 ${u.length - 10}개` : ""}`); }
md.push("", "## 장기 미사용 (마지막 사용일 ≤ " + STALE_CUTOFF + ")", "");
for (const k of KINDS) md.push(`- ${k}: ${by_kind[k].stale_14d.map((s) => `${s.name}(${s.last})`).join(", ") || "없음"}`);
md.push("", "## 대응 실패 (events 이름이 inventory에 없음)", "");
for (const k of KINDS) md.push(`- ${k}: ${by_kind[k].unmatched_total_events}건 — ${by_kind[k].unmatched.map((u) => `${u.name}(${u.count})`).join(", ") || "없음"}`);
md.push("", "## 일별 활성 비율 (b available 기준)", "", "| 날짜 | Skill | MCP | Agent | Hook | Plugin |", "|---|---|---|---|---|---|");
for (const d of daily) md.push(`| ${d.date} | ${d.active.Skill} (${pct(d.active_rate.Skill)}) | ${d.active.MCP} (${pct(d.active_rate.MCP)}) | ${d.active.Agent} (${pct(d.active_rate.Agent)}) | ${d.active.Hook} (${pct(d.active_rate.Hook)}) | ${d.active.Plugin} (${pct(d.active_rate.Plugin)}) |`);
md.push("", "## 주석", "", ...notes.map((n) => `- ${n}`), "");
fs.writeFileSync(P("utilization_summary.md"), md.join("\n"), "utf8");

// ---------- 자체 점검 (매처 판정·별칭 대응이 깨지면 실패) ----------
console.assert(matcherHits("startup|resume|clear|compact", "startup") && !matcherHits("Write|Edit|Bash|PowerShell", "mcp__playwright__x") && matcherHits("*", "anything") && matcherHits(null, null), "매처 판정 오류");
console.assert(lookup("Skill", "document-skills:pptx").length === 1 && lookup("Skill", "pptx").length === 1, "플러그인 스킬 별칭 대응 오류");
console.assert(Object.values(by_kind).every((b) => b.rate_available == null || (b.rate_available >= 0 && b.rate_available <= 1)), "이용률 범위 오류");
console.log("written:", P("utilization.json"), P("utilization_summary.md"));
for (const k of KINDS) console.log(k, `used ${by_kind[k].used_unique}/${by_kind[k].installed_all} (a ${pct(by_kind[k].rate_all)}, b ${by_kind[k].used_unique_available}/${by_kind[k].installed_available}=${pct(by_kind[k].rate_available)})`, `unused ${by_kind[k].unused_available.length}`, `unmatched ${by_kind[k].unmatched_total_events}`);
