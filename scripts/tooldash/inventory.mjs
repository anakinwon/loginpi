// 도구 전수 인벤토리 생성기 — Agent / MCP / Hook / Skill / Plugin 5종을 설정 파일에서 읽어
// inventory.json(정본)과 inventory_summary.md(요약)를 만든다. 추측 없이 파일에 있는 것만 기록.
// 실행: node inventory.mjs [출력폴더]   (기본값: 이 스크립트가 있는 폴더)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import os from "node:os";
const H = (process.env.TOOLDASH_HOME || os.homedir()).replace(/\\/g, "/");                 // 사용자 홈 (기본값 = OS 홈)
const P = (process.env.TOOLDASH_PROJECT || process.cwd()).replace(/\\/g, "/");       // 프로젝트 루트 (기본값 = 현재 작업 폴더)
const OUT = process.argv[2] || path.dirname(fileURLToPath(import.meta.url));

// 이번 세션에서 관측된 MCP 연결 상태(설정 파일로는 알 수 없는 사실 — 팀 리더 전달값)
const MCP_SESSION_STATUS = {
  "claude-flow": ["failed", "CONNECT_TIMEOUT(30000ms)"],
  tibero: ["failed", "CONNECTION_CLOSED"],
  playwright: ["available", "연결 성공"],
  ide: ["available", "연결 성공"],
  agentmemory: ["available", "연결 성공"],
  "mcp-search": ["available", "연결 성공, 도구 접두사 mcp__plugin_claude-mem_mcp-search__*"],
  "Claude Docs": ["available", "연결 성공, 원격 커넥터(claude.ai)"],
};

// 내장(파일 없음) 스킬·에이전트 — 팀 리더가 제공한 목록 그대로
const BUILTIN_SKILLS = [
  "artifact-design", "artifact-diagramming", "artifact-capabilities", "dataviz", "update-config",
  "keybindings-help", "code-review", "simplify", "fewer-permission-prompts", "loop", "schedule",
  "claude-api", "workflow-authoring", "run", "init", "security-review", "theme-factory",
];
const BUILTIN_AGENTS = [
  ["general-purpose", "General-purpose agent for researching complex questions and multi-step tasks"],
  ["Explore", "Read-only search agent for broad fan-out searches"],
  ["Plan", "Software architect agent for designing implementation plans"],
  ["claude-code-guide", "Answers questions about Claude Code, Agent SDK, Claude API"],
  ["statusline-setup", "Configures the user's Claude Code status line setting"],
  ["claude", "Catch-all agent, FleetView default when no agent name is typed"],
];

const items = [];
const sourcesRead = new Set();
const norm = (p) => p.replace(/\\/g, "/");
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const readText = (p) => { sourcesRead.add(norm(p)); return fs.readFileSync(p, "utf8"); };
const readJson = (p) => { try { return JSON.parse(readText(p)); } catch (e) { return null; } };
const clip = (s, n = 80) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const realPath = (p) => { try { return norm(fs.realpathSync(p)); } catch { return norm(p); } };

// frontmatter 파서 — name/description/model/tools만 필요하므로 단순 키:값 + 접힌 다중행만 지원
function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (m) {
    let key = null;
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) { key = kv[1]; fm[key] = kv[2].replace(/^[>|][-+]?\s*$/, "").replace(/^["']|["']$/g, ""); }
      else if (key && /^\s+\S/.test(line)) fm[key] = (fm[key] + " " + line.trim()).trim();
      else if (!/^\s/.test(line)) key = null;
    }
  }
  // description 없으면 본문 첫 제목/문장으로 대체
  if (!fm.description) {
    const body = m ? text.slice(m[0].length) : text;
    const h = body.match(/^#+\s*(.+)$/m) || body.match(/^\s*([^\s#].+)$/m);
    fm.description = h ? h[1] : "";
  }
  return fm;
}

function add(kind, name, source, p, scope, status, provider, description, note, extra = {}) {
  items.push({ kind, name, source, path: p ? norm(p) : null, scope, status,
    provider_plugin: provider || null, description: clip(description), note: note || "", ...extra });
}

// ───────────────────────── 1. Plugin ─────────────────────────
const installed = readJson(`${H}/.claude/plugins/installed_plugins.json`) || { plugins: {} };
const hSettings = readJson(`${H}/.claude/settings.json`) || {};
const pSettings = readJson(`${P}/.claude/settings.json`) || {};
const pLocal = readJson(`${P}/.claude/settings.local.json`) || {};
readJson(`${H}/.claude/plugins/known_marketplaces.json`);
const enabled = hSettings.enabledPlugins || {};
const plugins = []; // { key, name, marketplace, root, skillsAllowed }

for (const [key, entries] of Object.entries(installed.plugins || {})) {
  const [name, marketplace] = key.split("@");
  const e = entries[0];
  const root = norm(e.installPath);
  const cacheRoot = `${H}/.claude/plugins/cache/${marketplace}/${name}`;
  const versionsInCache = exists(cacheRoot) ? fs.readdirSync(cacheRoot) : [];
  const count = (sub, filt = () => true) => exists(`${root}/${sub}`)
    ? fs.readdirSync(`${root}/${sub}`).filter(filt).length : 0;
  // 마켓플레이스 선언(marketplace.json)에 skills 목록이 있으면 그 목록만 노출됨
  let skillsAllowed = null;
  const mk = `${root}/.claude-plugin/marketplace.json`;
  if (exists(mk)) {
    const mj = readJson(mk);
    const decl = (mj?.plugins || []).find((x) => x.name === name);
    if (decl?.skills) skillsAllowed = decl.skills.map((s) => path.basename(s));
  }
  const pj = exists(`${root}/.claude-plugin/plugin.json`) ? readJson(`${root}/.claude-plugin/plugin.json`) : null;
  // 훅 파일: hooks/hooks.json 또는 plugin.json의 hooks 필드가 가리키는 파일
  let hooksFile = exists(`${root}/hooks/hooks.json`) ? `${root}/hooks/hooks.json` : null;
  if (!hooksFile && pj?.hooks) { const hp = `${root}/${pj.hooks.replace(/^\.\//, "")}`; if (exists(hp)) hooksFile = hp; }
  const mcpFile = exists(`${root}/.mcp.json`) ? `${root}/.mcp.json` : null;
  const skillDirs = exists(`${root}/skills`) ? fs.readdirSync(`${root}/skills`).filter((d) => exists(`${root}/skills/${d}/SKILL.md`)) : [];
  const exposed = skillsAllowed ? skillDirs.filter((d) => skillsAllowed.includes(d)) : skillDirs;
  const isOn = enabled[key] === true;
  const notes = [
    `version=${e.version}`,
    `skills ${exposed.length}${skillsAllowed && skillDirs.length !== exposed.length ? `(캐시 폴더 ${skillDirs.length}개 중 marketplace.json 선언 ${exposed.length}개만 노출)` : ""}`,
    `agents ${count("agents", (f) => f.endsWith(".md"))}`,
    `commands ${count("commands")}`,
    `hooks ${hooksFile ? "有" : "無"}`,
    `.mcp.json ${mcpFile ? "有" : "無"}`,
    versionsInCache.length > 1 ? `캐시에 구버전 잔존: ${versionsInCache.filter((v) => v !== path.basename(root)).join(",")}` : "",
  ].filter(Boolean).join(" / ");
  add("Plugin", name, `마켓플레이스:${marketplace}`, root, "user", isOn ? "available" : "disabled", null,
    pj?.description || "", notes, { version: e.version, marketplace, enabled: isOn });
  plugins.push({ key, name, marketplace, root, exposed, hooksFile, mcpFile, enabled: isOn });
}

// ───────────────────────── 2. Skill ─────────────────────────
const skillDesc = (skillMd) => { const fm = frontmatter(readText(skillMd)); return fm; };

// 2-1 전역 스킬 (심링크는 실제 경로 표기)
for (const d of fs.readdirSync(`${H}/.claude/skills`).sort()) {
  const dir = `${H}/.claude/skills/${d}`;
  const md = `${dir}/SKILL.md`;
  const link = fs.lstatSync(dir).isSymbolicLink();
  if (!exists(md)) { add("Skill", d, "전역", dir, "user", "failed", null, "", "SKILL.md 없음(스킬 폴더 아님)"); continue; }
  const fm = skillDesc(md);
  add("Skill", d, "전역", realPath(md), "user", "available", null, fm.description,
    link ? `심링크 ${norm(dir)} → ${realPath(dir)}` : "");
}
// 2-2 프로젝트 스킬 (하위 재귀 — SKILL.md 기준)
function walkSkills(base, rel = "") {
  const dir = path.join(base, rel);
  for (const d of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, d);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    const md = path.join(full, "SKILL.md");
    const relName = rel ? `${rel}/${d}` : d;
    if (exists(md)) {
      const fm = skillDesc(md);
      const link = fs.lstatSync(full).isSymbolicLink();
      add("Skill", d, "프로젝트", realPath(md), "project", "available", null, fm.description,
        link ? `심링크 ${norm(full)} → ${realPath(full)}` : (rel ? `하위 폴더 ${relName}` : ""));
    } else if (fs.readdirSync(full).some((f) => f.endsWith(".md"))) {
      // SKILL.md 없는 문서 폴더(예: skill_list) — 스킬 아님, 기록만
      add("Skill", d, "프로젝트", norm(full), "project", "failed", null, "", "SKILL.md 없음 — 문서 폴더(스킬로 로드되지 않음)");
    } else walkSkills(base, relName);
  }
}
walkSkills(`${P}/.claude/skills`);
// 2-3 플러그인 스킬
for (const pl of plugins) {
  for (const d of pl.exposed) {
    const md = `${pl.root}/skills/${d}/SKILL.md`;
    const fm = skillDesc(md);
    add("Skill", d, `플러그인:${pl.name}`, md, "user", pl.enabled ? "available" : "disabled", pl.name,
      fm.description, "", { invoke: `${pl.name}:${d}` });
  }
}
// 2-4 커맨드형 스킬 (프로젝트 .claude/commands + 전역 .claude/commands)
function walkCommands(base, source, scope) {
  if (!exists(base)) return;
  const walk = (dir, prefix) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full, prefix ? `${prefix}:${f}` : f);
      else if (f.endsWith(".md")) {
        const fm = frontmatter(readText(full));
        const name = prefix ? `${prefix}:${f.replace(/\.md$/, "")}` : f.replace(/\.md$/, "");
        add("Skill", name, source, full, scope, "available", null, fm.description, "커맨드형(.claude/commands)");
      }
    }
  };
  walk(base, "");
}
walkCommands(`${P}/.claude/commands`, "커맨드", "project");
walkCommands(`${H}/.claude/commands`, "커맨드", "user");
// 2-5 내장 스킬
for (const s of BUILTIN_SKILLS) add("Skill", s, "내장", null, "builtin", "available", null, "Claude Code 내장 스킬(파일 없음)", "");

// ───────────────────────── 3. Agent ─────────────────────────
function walkAgents(base, source, scope) {
  if (!exists(base)) return;
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (f.endsWith(".md")) {
        const fm = frontmatter(readText(full));
        add("Agent", fm.name || f.replace(/\.md$/, ""), source, full, scope, "available", null, fm.description,
          [fm.type ? `type=${fm.type}` : "", fm.category ? `category=${fm.category}` : ""].filter(Boolean).join(" "),
          { model: fm.model || null, tools: fm.tools || null });
      }
    }
  };
  walk(base);
}
walkAgents(`${P}/.claude/agents`, "프로젝트", "project");
walkAgents(`${H}/.claude/agents`, "전역", "user");
for (const pl of plugins) walkAgents(`${pl.root}/agents`, `플러그인:${pl.name}`, "user");
for (const [n, d] of BUILTIN_AGENTS) add("Agent", n, "내장", null, "builtin", "available", null, d, "", { model: null, tools: null });

// ───────────────────────── 4. MCP ─────────────────────────
function addMcp(name, cfg, source, p, scope, provider) {
  const transport = cfg.type || (cfg.url ? "http" : "stdio");
  const cmd = cfg.command ? path.basename(String(cfg.command)) : (cfg.url ? "<url>" : "");
  const [status, why] = MCP_SESSION_STATUS[name] || ["unknown", "이번 세션 연결 상태 미관측"];
  const secretish = cfg.env && Object.keys(cfg.env).some((k) => /token|key|secret|pass/i.test(k));
  add("MCP", name, source, p, scope, status, provider, `${transport} / ${cmd}`,
    `${why}${secretish ? " / env에 자격증명 키 존재 <masked>" : ""}`, { transport, command: cmd });
}
const pMcp = readJson(`${P}/.mcp.json`) || {};
for (const [n, c] of Object.entries(pMcp.mcpServers || {})) addMcp(n, c, "프로젝트", `${P}/.mcp.json`, "project", null);
const hClaude = readJson(`${H}/.claude.json`) || {};
for (const [n, c] of Object.entries(hClaude.mcpServers || {})) addMcp(n, c, "전역", `${H}/.claude.json`, "user", null);
const projKey = Object.keys(hClaude.projects || {}).find((k) => norm(k).toLowerCase() === P.toLowerCase());
for (const [n, c] of Object.entries(hClaude.projects?.[projKey]?.mcpServers || {})) addMcp(n, c, "전역(projects)", `${H}/.claude.json`, "project", null);
for (const [file, cfg, src] of [[`${H}/.claude/settings.json`, hSettings, "전역"], [`${P}/.claude/settings.json`, pSettings, "프로젝트"], [`${P}/.claude/settings.local.json`, pLocal, "프로젝트(local)"]])
  for (const [n, c] of Object.entries(cfg.mcpServers || {})) addMcp(n, c, src, file, src.startsWith("전역") ? "user" : "project", null);
for (const pl of plugins) if (pl.mcpFile) {
  const mj = readJson(pl.mcpFile) || {};
  for (const [n, c] of Object.entries(mj.mcpServers || {})) addMcp(n, c, `플러그인:${pl.name}`, pl.mcpFile, "user", pl.name);
}
// 설정 파일에 없는 세션 제공 서버
add("MCP", "ide", "내장", null, "builtin", MCP_SESSION_STATUS.ide[0], null, "IDE 통합(getDiagnostics·executeCode)", MCP_SESSION_STATUS.ide[1] + " / 설정 파일 없음", { transport: "builtin", command: "" });
add("MCP", "Claude Docs", "원격 커넥터", null, "user", MCP_SESSION_STATUS["Claude Docs"][0], null, "claude.ai 문서 커넥터(mcp__claude_ai_Claude_Docs__*)", MCP_SESSION_STATUS["Claude Docs"][1] + " / 설정 파일 없음", { transport: "remote", command: "" });
if (pLocal.enabledMcpjsonServers) {
  const on = new Set(pLocal.enabledMcpjsonServers);
  for (const it of items) if (it.kind === "MCP" && it.source === "프로젝트") it.note += on.has(it.name) ? " / settings.local enabledMcpjsonServers 등록" : " / settings.local enabledMcpjsonServers 미등록";
}

// ───────────────────────── 5. Hook ─────────────────────────
const haveBin = (bin) => { const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" }); return r.status === 0; };
function hookStatus(cmd, pluginRoot) {
  if (/^echo\b/.test(cmd.trim())) return ["available", "셸 내장 echo"];
  const c = cmd.replace(/\$\{?CLAUDE_PLUGIN_ROOT\}?/g, pluginRoot || "").replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, P);
  // 셸 변수 뒤에 붙은 경로("$_Q/scripts/x.js")는 실제 경로가 아니므로 제외(음수 후방탐색)
  const files = [...c.matchAll(/(?<![\w}$])([A-Za-z]:)?[\/\\][^\s"'`;]+\.(py|mjs|cjs|js|sh|ps1)/g)].map((m) => norm(m[0]));
  if (files.length) {
    const missing = files.filter((f) => !exists(f));
    return missing.length ? ["failed", `파일 없음: ${missing.join(", ")}`] : ["available", files.join(", ")];
  }
  // claude-mem류: 플러그인 루트의 scripts/*.js 를 탐색해 실행 — 참조 스크립트 존재 여부로 판정
  const scripts = [...c.matchAll(/scripts\/([\w.-]+\.(?:js|cjs))/g)].map((m) => m[1]);
  if (scripts.length && pluginRoot) {
    const missing = [...new Set(scripts)].filter((s) => !exists(`${pluginRoot}/scripts/${s}`));
    return missing.length ? ["failed", `스크립트 없음: ${missing.join(", ")}`] : ["available", `${pluginRoot}/scripts/{${[...new Set(scripts)].join(",")}}`];
  }
  const bin = c.trim().split(/\s+/)[0];
  return haveBin(bin) ? ["available", `실행파일 ${bin} PATH에 존재`] : ["failed", `실행파일 ${bin} PATH에 없음`];
}
function addHooks(hooksObj, source, file, scope, provider, pluginRoot) {
  for (const [event, groups] of Object.entries(hooksObj || {})) {
    for (const g of groups) for (const h of g.hooks || []) {
      const cmd = h.command || "";
      const [status, why] = hookStatus(cmd, pluginRoot);
      const label = cmd.match(/([\w.-]+\.(?:py|mjs|cjs|js|sh|ps1))/)?.[1] || cmd.split(/\s+/).slice(0, 3).join(" ");
      add("Hook", `${event} / ${label}`, source, file, scope, status, provider, cmd.slice(0, 100),
        `${why}${g.matcher ? ` / matcher=${g.matcher}` : ""}${h.timeout ? ` / timeout=${h.timeout}` : ""}${h.async ? " / async" : ""}`,
        { event, matcher: g.matcher || null });
    }
  }
}
addHooks(hSettings.hooks, "전역", `${H}/.claude/settings.json`, "user", null, null);
addHooks(pSettings.hooks, "프로젝트", `${P}/.claude/settings.json`, "project", null, null);
addHooks(pLocal.hooks, "프로젝트(local)", `${P}/.claude/settings.local.json`, "project", null, null);
for (const pl of plugins) if (pl.hooksFile) {
  const hj = readJson(pl.hooksFile) || {};
  addHooks(hj.hooks || hj, `플러그인:${pl.name}`, pl.hooksFile, "user", pl.name, pl.root);
  if (!pl.enabled) for (const it of items) if (it.kind === "Hook" && it.provider_plugin === pl.name) it.status = "disabled";
}

// ───────────────────────── 중복 판정 (동명 · 같은 kind, 먼저 기록된 출처 우선) ─────────────────────────
const dupMap = new Map();
for (const it of items) {
  if (it.kind === "Hook") continue; // 훅은 이벤트별로 같은 이름이 정상
  const k = `${it.kind}|${it.name.toLowerCase()}`;
  if (!dupMap.has(k)) dupMap.set(k, []);
  const arr = dupMap.get(k);
  if (arr.length && it.status === "available") it.status = "duplicate";
  arr.push(it.source);
}
const duplicates = [...dupMap.entries()].filter(([, v]) => v.length > 1)
  .map(([k, v]) => ({ kind: k.split("|")[0], name: items.find((i) => `${i.kind}|${i.name.toLowerCase()}` === k).name, sources: v }));

// ───────────────────────── 출력 ─────────────────────────
const counts = {};
for (const k of ["Agent", "MCP", "Hook", "Skill", "Plugin"]) counts[k] = items.filter((i) => i.kind === k).length;
const inv = { generated_at: new Date().toISOString(), counts, items, duplicates, sources_read: [...sourcesRead].sort() };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "inventory.json"), JSON.stringify(inv, null, 2), "utf8");

// 요약 md
const bySource = {};
for (const it of items) { const s = it.source.replace(/:.*/, ""); bySource[s] = bySource[s] || {}; bySource[s][it.kind] = (bySource[s][it.kind] || 0) + 1; }
const byStatus = {};
for (const it of items) byStatus[it.status] = (byStatus[it.status] || 0) + 1;
const kinds = ["Agent", "MCP", "Hook", "Skill", "Plugin"];
let md = `# 도구 인벤토리 요약 (${inv.generated_at})\n\n## 종류별 개수\n\n| 종류 | 개수 | available | duplicate | failed | disabled |\n|---|---|---|---|---|---|\n`;
for (const k of kinds) { const s = items.filter((i) => i.kind === k); md += `| ${k} | ${s.length} | ${s.filter((i) => i.status === "available").length} | ${s.filter((i) => i.status === "duplicate").length} | ${s.filter((i) => i.status === "failed").length} | ${s.filter((i) => i.status === "disabled").length} |\n`; }
md += `| 합계 | ${items.length} | ${byStatus.available || 0} | ${byStatus.duplicate || 0} | ${byStatus.failed || 0} | ${byStatus.disabled || 0} |\n`;
md += `\n## 출처별 개수\n\n| 출처 | ${kinds.join(" | ")} | 합계 |\n|---|${kinds.map(() => "---").join("|")}|---|\n`;
for (const [s, c] of Object.entries(bySource)) md += `| ${s} | ${kinds.map((k) => c[k] || 0).join(" | ")} | ${Object.values(c).reduce((a, b) => a + b, 0)} |\n`;
md += `\n## 플러그인 (enabledPlugins 기준)\n\n| 플러그인 | 마켓플레이스 | 버전 | 상태 | 구성 |\n|---|---|---|---|---|\n`;
for (const it of items.filter((i) => i.kind === "Plugin")) md += `| ${it.name} | ${it.marketplace} | ${it.version} | ${it.status} | ${it.note} |\n`;
md += `\n## 실패 목록\n\n`;
const failed = items.filter((i) => i.status === "failed");
md += failed.length ? failed.map((i) => `- [${i.kind}] ${i.name} (${i.source}) : ${i.note}`).join("\n") + "\n" : "- 없음\n";
md += `\n## 중복 목록 (동명 · 첫 출처가 정본, 나머지 duplicate)\n\n`;
md += duplicates.length ? duplicates.map((d) => `- [${d.kind}] ${d.name} : ${d.sources.join(" · ")}`).join("\n") + "\n" : "- 없음\n";
md += `\n## 읽은 원천 파일 수 : ${inv.sources_read.length}\n`;
fs.writeFileSync(path.join(OUT, "inventory_summary.md"), md, "utf8");
console.log(JSON.stringify({ counts, total: items.length, failed: failed.length, duplicates: duplicates.length, sources: inv.sources_read.length }));
