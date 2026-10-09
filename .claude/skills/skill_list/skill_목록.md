# 프로젝트 사용 가능 스킬 목록 및 활용도 분석

> 작성일: 2026-09-10 / 대상 프로젝트: nia-dr-project
> 집계 근거: 이 프로젝트의 Claude Code 세션 기록(`~/.claude/projects/C--Users-USER-workspace-nia-dr-project/*.jsonl`) 전수
> 집계 기간: 2026-08-05 ~ 2026-09-10 / 세션 기록 16개(본세션 10 + 서브에이전트 6)
> 집계 방법: Skill 도구 호출(`input.skill`) + 슬래시 명령 호출(`<command-name>`)을 스킬명 기준으로 합산
> 제외: `/model`·`/compact`·`/statusline`·`/mobile`·`/login`은 CLI 내장 명령(스킬 아님)
> 활용률(전체 대비 사용율) = 해당 스킬 호출 수 ÷ 전체 스킬 호출 수(9건) × 100

## 1. 요약

| 구분 | 값 |
|---|---|
| 사용 가능 스킬 수 | 163개 |
| 실제 호출된 스킬 수 | 7개 (4.3%) |
| 전체 스킬 호출 수 | 9건 |
| 미사용 스킬 수 | 156개 |

### 출처별 현황

| 출처 | 스킬 수 | 사용 스킬 수 | 호출 수 | 스킬 활용률(사용/보유) | 호출 점유율(전체 대비) |
|---|---:|---:|---:|---:|---:|
| 전역 | 50 | 2 | 4 | 4.0% | 44.4% |
| 내장 | 18 | 3 | 3 | 16.7% | 33.3% |
| 플러그인 document-skills | 17 | 1 | 1 | 5.9% | 11.1% |
| 프로젝트 | 2 | 1 | 1 | 50.0% | 11.1% |
| 전역 커맨드(SuperClaude) | 31 | 0 | 0 | 0.0% | 0.0% |
| 플러그인 claude-mem | 20 | 0 | 0 | 0.0% | 0.0% |
| 플러그인 example-skills | 17 | 0 | 0 | 0.0% | 0.0% |
| 플러그인 ponytail | 6 | 0 | 0 | 0.0% | 0.0% |
| 플러그인 claude-code-setup | 1 | 0 | 0 | 0.0% | 0.0% |
| 플러그인 frontend-design | 1 | 0 | 0 | 0.0% | 0.0% |
| **합계** | **163** | **7** | **9** | **4.3%** | **100.0%** |

## 2. 활용 실적이 있는 스킬 (호출 수 내림차순)

| 순위 | 스킬 | 출처 | 호출 수 | 전체 대비 사용율 | 사용 세션 수 | 최근 사용일 | 호출 방식 |
|---:|---|---|---:|---:|---:|---|---|
| 1 | theme-factory | 전역 | 2 | 22.2% | 1 | 2026-09-03 | /theme-factory |
| 2 | watch | 전역 | 2 | 22.2% | 1 | 2026-08-31 | /watch |
| 3 | claude-in-chrome | 내장 | 1 | 11.1% | 1 | 2026-08-05 | Skill 도구 |
| 4 | design | 내장 | 1 | 11.1% | 1 | 2026-09-04 | /design |
| 5 | update-config | 내장 | 1 | 11.1% | 1 | 2026-08-05 | Skill 도구 |
| 6 | find-skills | 프로젝트 | 1 | 11.1% | 1 | 2026-09-10 | Skill 도구 |
| 7 | document-skills:pptx | 플러그인 document-skills | 1 | 11.1% | 1 | 2026-08-06 | Skill 도구 |

## 3. 전체 스킬 목록 (출처별, 호출 0건 포함)

### 전역 (50개, 호출 4건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| theme-factory | 2 | 22.2% | 2026-09-03 | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reporting | - |
| watch | 2 | 22.2% | 2026-08-31 | Watch a video (URL or local path). Downloads with yt-dlp, extracts auto-scaled frames with | - |
| agentmemory-agents | 0 | 0.0% | - | How agentmemory wires into host coding agents via the connect command. Use when installing | - |
| agentmemory-architecture | 0 | 0.0% | - | How agentmemory is built, the iii engine primitives it runs on, its storage model, ports,  | - |
| agentmemory-config | 0 | 0.0% | - | agentmemory configuration, environment variables, ports, and feature flags. Use when enabl | - |
| agentmemory-hooks | 0 | 0.0% | - | The agentmemory plugin hooks that capture observations automatically across the agent sess | - |
| agentmemory-mcp-tools | 0 | 0.0% | - | Map of every agentmemory MCP tool, what each does, and its parameters. Use when choosing w | - |
| agentmemory-rest-api | 0 | 0.0% | - | The agentmemory HTTP REST API surface, the primary protocol for talking to the memory serv | - |
| brainstorming | 0 | 0.0% | - | "You MUST use this before any creative work - creating features, building components, addi | - |
| cli-models | 0 | 0.0% | - | Query available AI models, list model aliases, and browse the full model catalog from the  | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| cli-providers | 0 | 0.0% | - | "Manage provider connections from the CLI: list available/configured providers, add, test, | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| cli-routing | 0 | 0.0% | - | Create, list, update, and delete routing combos from the CLI. Test routing strategies, ins | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| cli-setup | 0 | 0.0% | - | Run initial setup, configure global CLI settings, manage environment variables, check for  | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| commit-context | 0 | 0.0% | - | Trace a file, function, or line back to the agent session that produced its current commit | - |
| commit-history | 0 | 0.0% | - | List recent git commits linked to agent sessions, optionally filtered by branch or repo. U | - |
| dispatching-parallel-agents | 0 | 0.0% | - | Use when facing 2+ independent tasks that can be worked on without shared state or sequent | - |
| executing-plans | 0 | 0.0% | - | Use when you have a written implementation plan to execute in a separate session with revi | - |
| finishing-a-development-branch | 0 | 0.0% | - | Use when implementation is complete, all tests pass, and you need to decide how to integra | - |
| forget | 0 | 0.0% | - | Delete specific observations from agentmemory after showing them and getting explicit conf | - |
| handoff | 0 | 0.0% | - | Resume the most recent agent session for the current working directory, leading with any u | - |
| humanizer | 0 | 0.0% | - | AI가 생성한 한국어 텍스트의 특징적인 패턴을 감지하고 자연스러운 인간의 글쓰기로 변환합니다. 과학적 언어학 연구(KatFishNet 논문, 94.88% AUC  | - |
| karpathy-guidelines | 0 | 0.0% | - | Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, o | - |
| lesson | 0 | 0.0% | - | Save a correction or hard-won rule as a confidence-weighted lesson that resurfaces before  | - |
| memory-discipline | 0 | 0.0% | - | The session loop that makes agentmemory pay off, recall before starting work, save at deci | - |
| omni-combos-routing | 0 | 0.0% | - | Create and manage routing combos with 19 strategies (priority, weighted, round-robin, Auto | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| recall | 0 | 0.0% | - | Search agentmemory for past observations, sessions, and learnings about a topic using hybr | - |
| recap | 0 | 0.0% | - | Summarize the last N agent sessions for the current project, grouped by date, with highlig | - |
| receiving-code-review | 0 | 0.0% | - | Use when receiving code review feedback, before implementing suggestions, especially if fe | - |
| remember | 0 | 0.0% | - | Save an insight, decision, or learning to agentmemory's long-term storage with searchable  | - |
| requesting-code-review | 0 | 0.0% | - | Use when completing tasks, implementing major features, or before merging to verify work m | - |
| session-history | 0 | 0.0% | - | Show what happened in recent past sessions on this project as a clean timeline. Use when t | - |
| subagent-driven-development | 0 | 0.0% | - | Use when executing implementation plans with independent tasks in the current session | - |
| systematic-debugging | 0 | 0.0% | - | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixe | - |
| task-observer | 0 | 0.0% | - | Monitors task execution for skill improvement opportunities. Use during ANY multi-step tas | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| test-driven-development | 0 | 0.0% | - | Use when implementing any feature or bugfix, before writing implementation code | - |
| understand | 0 | 0.0% | - | Analyze a codebase to produce an interactive knowledge graph for understanding architectur | - |
| understand-chat | 0 | 0.0% | - | Use when you need to ask questions about a codebase or understand code using a knowledge g | - |
| understand-dashboard | 0 | 0.0% | - | Launch the interactive web dashboard to visualize a codebase's knowledge graph | - |
| understand-diff | 0 | 0.0% | - | Use when you need to analyze git diffs or pull requests to understand what changed, affect | - |
| understand-domain | 0 | 0.0% | - | Extract business domain knowledge from a codebase and generate an interactive domain flow  | - |
| understand-explain | 0 | 0.0% | - | Use when you need a deep-dive explanation of a specific file, function, or module in the c | - |
| understand-figma | 0 | 0.0% | - | Analyze a Figma file via the Figma REST API and generate an interactive design knowledge g | - |
| understand-knowledge | 0 | 0.0% | - | Analyze a Karpathy-pattern LLM wiki knowledge base and generate an interactive knowledge g | - |
| understand-onboard | 0 | 0.0% | - | Use when you need to generate an onboarding guide for new team members joining a project | - |
| using-git-worktrees | 0 | 0.0% | - | Use when starting feature work that needs isolation from current workspace or before execu | - |
| using-superpowers | 0 | 0.0% | - | Use when starting any conversation - establishes how to find and use skills, requiring ski | - |
| verification-before-completion | 0 | 0.0% | - | Use when about to claim work is complete, fixed, or passing, before committing or creating | - |
| write-agentmemory-skill | 0 | 0.0% | - | The house format and rules for writing or updating an agentmemory skill. Use when adding a | - |
| writing-plans | 0 | 0.0% | - | Use when you have a spec or requirements for a multi-step task, before touching code | - |
| writing-skills | 0 | 0.0% | - | Use when creating new skills, editing existing skills, or verifying skills work before dep | - |

### 내장 (18개, 호출 3건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| claude-in-chrome | 1 | 11.1% | 2026-08-05 | Chrome 브라우저 자동화 | - |
| design | 1 | 11.1% | 2026-09-04 | 디자인 캔버스(멀티 아트보드) 아티팩트 생성 | - |
| update-config | 1 | 11.1% | 2026-08-05 | settings.json 훅·권한·환경변수 설정 | - |
| artifact-capabilities | 0 | 0.0% | - | 아티팩트 런타임 기능(DB·사용자·파일) 사용법 | - |
| artifact-design | 0 | 0.0% | - | 아티팩트 작성 전 디자인 가이드 | - |
| artifact-diagramming | 0 | 0.0% | - | 아티팩트용 다이어그램 작성 지침 | - |
| claude-api | 0 | 0.0% | - | Claude API·SDK 참조 | - |
| code-review | 0 | 0.0% | - | 현재 diff/PR 코드 리뷰 | - |
| dataviz | 0 | 0.0% | - | 차트·대시보드 등 데이터 시각화 작성 기준 | - |
| fewer-permission-prompts | 0 | 0.0% | - | 권한 프롬프트 감소용 허용목록 생성 | - |
| init | 0 | 0.0% | - | CLAUDE.md 초기화 | - |
| keybindings-help | 0 | 0.0% | - | 키보드 단축키 커스터마이즈 | - |
| loop | 0 | 0.0% | - | 주기 반복 실행 | - |
| run | 0 | 0.0% | - | 프로젝트 앱 실행·스크린샷 | - |
| schedule | 0 | 0.0% | - | 클라우드 예약 에이전트(routine) 관리 | - |
| security-review | 0 | 0.0% | - | 보안 리뷰 | - |
| simplify | 0 | 0.0% | - | 변경 코드 단순화·재사용 정리 | - |
| workflow-authoring | 0 | 0.0% | - | Workflow 스크립트 작성 참조 | - |

### 플러그인 document-skills (17개, 호출 1건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| document-skills:pptx | 1 | 11.1% | 2026-08-06 | "Use this skill any time a .pptx or .potx file is involved in any way — as input, output,  | - |
| document-skills:algorithmic-art | 0 | 0.0% | - | Creating algorithmic art using p5.js with seeded randomness and interactive parameter expl | - |
| document-skills:brand-guidelines | 0 | 0.0% | - | Applies Anthropic's official brand colors and typography to any sort of artifact that may  | - |
| document-skills:canvas-design | 0 | 0.0% | - | Create beautiful visual art in .png and .pdf documents using design philosophy. You should | - |
| document-skills:claude-api | 0 | 0.0% | - | \|- Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, t | - |
| document-skills:doc-coauthoring | 0 | 0.0% | - | Guide users through a structured workflow for co-authoring documentation. Use when user wa | - |
| document-skills:docx | 0 | 0.0% | - | "Use this skill whenever the user wants to create, read, edit, or manipulate Word document | - |
| document-skills:frontend-design | 0 | 0.0% | - | Guidance for distinctive, intentional visual design when building new UI or reshaping an e | - |
| document-skills:internal-comms | 0 | 0.0% | - | A set of resources to help me write all kinds of internal communications, using the format | - |
| document-skills:mcp-builder | 0 | 0.0% | - | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to i | - |
| document-skills:pdf | 0 | 0.0% | - | Use this skill whenever the user wants to do anything with PDF files. This includes readin | - |
| document-skills:skill-creator | 0 | 0.0% | - | Create new skills, modify and improve existing skills, and measure skill performance. Use  | - |
| document-skills:slack-gif-creator | 0 | 0.0% | - | Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constrain | - |
| document-skills:theme-factory | 0 | 0.0% | - | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reporting | 동명 전역 스킬에 호출 귀속(중복 설치) |
| document-skills:web-artifacts-builder | 0 | 0.0% | - | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using mode | - |
| document-skills:webapp-testing | 0 | 0.0% | - | Toolkit for interacting with and testing local web applications using Playwright. Supports | - |
| document-skills:xlsx | 0 | 0.0% | - | "Use this skill any time a spreadsheet file is the primary input or output. This means any | - |

### 프로젝트 (2개, 호출 1건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| find-skills | 1 | 11.1% | 2026-09-10 | Helps users discover and install agent skills when they ask questions like "how do I do X" | - |
| frontend-design | 0 | 0.0% | - | Guidance for distinctive, intentional visual design when building new UI or reshaping an e | - |

### 전역 커맨드(SuperClaude) (31개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| sc:agent | 0 | 0.0% | - | SC Agent — session controller that orchestrates investigation, implementation, and review | - |
| sc:analyze | 0 | 0.0% | - | Comprehensive code analysis across quality, security, performance, and architecture domain | - |
| sc:brainstorm | 0 | 0.0% | - | Interactive requirements discovery through Socratic dialogue and systematic exploration | - |
| sc:build | 0 | 0.0% | - | Build, compile, and package projects with intelligent error handling and optimization | - |
| sc:business-panel | 0 | 0.0% | - | - | - |
| sc:cleanup | 0 | 0.0% | - | Systematically clean up code, remove dead code, and optimize project structure | - |
| sc:design | 0 | 0.0% | - | Design system architecture, APIs, and component interfaces with comprehensive specificatio | - |
| sc:document | 0 | 0.0% | - | Generate focused documentation for components, functions, APIs, and features | - |
| sc:estimate | 0 | 0.0% | - | Provide development estimates for tasks, features, or projects with intelligent analysis | - |
| sc:explain | 0 | 0.0% | - | Provide clear explanations of code, concepts, and system behavior with educational clarity | - |
| sc:git | 0 | 0.0% | - | Git operations with intelligent commit messages and workflow optimization | - |
| sc:help | 0 | 0.0% | - | List all available /sc commands and their functionality | - |
| sc:implement | 0 | 0.0% | - | Feature and code implementation with intelligent persona activation and MCP integration | - |
| sc:improve | 0 | 0.0% | - | Apply systematic improvements to code quality, performance, and maintainability | - |
| sc:index | 0 | 0.0% | - | Generate comprehensive project documentation and knowledge base with intelligent organizat | - |
| sc:index-repo | 0 | 0.0% | - | Repository Indexing - 94% token reduction (58K → 3K) | - |
| sc:load | 0 | 0.0% | - | Session lifecycle management with Serena MCP integration for project context loading | - |
| sc:pm | 0 | 0.0% | - | Project Manager Agent - Default orchestration agent that coordinates all sub-agents and ma | - |
| sc:README | 0 | 0.0% | - | - | - |
| sc:recommend | 0 | 0.0% | - | Ultra-intelligent command recommendation engine - recommends the most suitable SuperClaude | - |
| sc:reflect | 0 | 0.0% | - | Task reflection and validation using Serena MCP analysis capabilities | - |
| sc:research | 0 | 0.0% | - | Deep web research with adaptive planning and intelligent search | - |
| sc:save | 0 | 0.0% | - | Session lifecycle management with Serena MCP integration for session context persistence | - |
| sc:sc | 0 | 0.0% | - | SuperClaude command dispatcher - Use /sc [command] to access all SuperClaude features | - |
| sc:select-tool | 0 | 0.0% | - | Intelligent MCP tool selection based on complexity scoring and operation analysis | - |
| sc:spawn | 0 | 0.0% | - | Meta-system task orchestration with intelligent breakdown and delegation | - |
| sc:spec-panel | 0 | 0.0% | - | Multi-expert specification review and improvement using renowned specification and softwar | - |
| sc:task | 0 | 0.0% | - | Execute complex tasks with intelligent workflow management and delegation | - |
| sc:test | 0 | 0.0% | - | Execute tests with coverage analysis and automated quality reporting | - |
| sc:troubleshoot | 0 | 0.0% | - | Diagnose and resolve issues in code, builds, deployments, and system behavior | - |
| sc:workflow | 0 | 0.0% | - | Generate structured implementation workflows from PRDs and feature requirements | - |

### 플러그인 claude-mem (20개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| claude-mem:babysit | 0 | 0.0% | - | Watch a pull request or review cycle until it is ready to merge. Use when asked to babysit | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:ccs-align | 0 | 0.0% | - | Run the CCS Align seat's hourly breathing cycle — prove the local claude-mem worker is hea | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:cloud-sync | 0 | 0.0% | - | Set up or check claude-mem cloud sync with cmem.ai Pro. Use when the user says "set up clo | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:design-is | 0 | 0.0% | - | Audit a design against Dieter Rams' ten "Good design is..." principles, then hand off a /m | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:do | 0 | 0.0% | - | Execute a phased implementation plan using subagents. Use when asked to execute, run, or c | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:how-it-works | 0 | 0.0% | - | Explain how claude-mem captures observations, when memory injection kicks in, and where da | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:knowledge-agent | 0 | 0.0% | - | Build and query AI-powered knowledge bases from claude-mem observations. Use when users wa | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:learn-codebase | 0 | 0.0% | - | Prime a codebase by reading every source file in full. Use when starting work on a new or  | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:make-plan | 0 | 0.0% | - | Create a detailed, phased implementation plan with documentation discovery. Use when asked | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:mem-search | 0 | 0.0% | - | Search claude-mem's persistent cross-session memory database. Use when user asks "did we a | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:mode-creator | 0 | 0.0% | - | Interactively create, install, activate, and verify custom claude-mem modes, including dom | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:oh-my-issues | 0 | 0.0% | - | Cluster a GitHub issue backlog by root cause into a small set of plan-master issues, redir | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:pathfinder | 0 | 0.0% | - | Map a codebase into feature-grouped flowcharts, identify duplicated concerns across featur | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:smart-explore | 0 | 0.0% | - | Token-optimized structural code search using tree-sitter AST parsing. Use instead of readi | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:standup | 0 | 0.0% | - | Facilitate a read-only standup across git worktrees, branches, or PRs to compare changes a | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:timeline-report | 0 | 0.0% | - | Generate a "Journey Into [Project]" narrative report analyzing a project's entire developm | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:version-bump | 0 | 0.0% | - | Automated semantic versioning and release workflow for Claude Code plugins. Handles versio | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:weekly-digests | 0 | 0.0% | - | Generate a serial week-by-week narrative digest of a project's full claude-mem timeline. S | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:what-the | 0 | 0.0% | - | "What the? Use when the user wants a plain-English breakdown of something technical — the  | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |
| claude-mem:wowerpoint | 0 | 0.0% | - | Turn one document into a kawaii NotebookLM slide-deck PDF. Use for "wowerpoint this", "mak | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |

### 플러그인 example-skills (17개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| example-skills:algorithmic-art | 0 | 0.0% | - | Creating algorithmic art using p5.js with seeded randomness and interactive parameter expl | - |
| example-skills:brand-guidelines | 0 | 0.0% | - | Applies Anthropic's official brand colors and typography to any sort of artifact that may  | - |
| example-skills:canvas-design | 0 | 0.0% | - | Create beautiful visual art in .png and .pdf documents using design philosophy. You should | - |
| example-skills:claude-api | 0 | 0.0% | - | \|- Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, t | - |
| example-skills:doc-coauthoring | 0 | 0.0% | - | Guide users through a structured workflow for co-authoring documentation. Use when user wa | - |
| example-skills:docx | 0 | 0.0% | - | "Use this skill whenever the user wants to create, read, edit, or manipulate Word document | - |
| example-skills:frontend-design | 0 | 0.0% | - | Guidance for distinctive, intentional visual design when building new UI or reshaping an e | 프로젝트 동명 스킬과 중복 설치 |
| example-skills:internal-comms | 0 | 0.0% | - | A set of resources to help me write all kinds of internal communications, using the format | - |
| example-skills:mcp-builder | 0 | 0.0% | - | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to i | - |
| example-skills:pdf | 0 | 0.0% | - | Use this skill whenever the user wants to do anything with PDF files. This includes readin | - |
| example-skills:pptx | 0 | 0.0% | - | "Use this skill any time a .pptx or .potx file is involved in any way — as input, output,  | - |
| example-skills:skill-creator | 0 | 0.0% | - | Create new skills, modify and improve existing skills, and measure skill performance. Use  | - |
| example-skills:slack-gif-creator | 0 | 0.0% | - | Knowledge and utilities for creating animated GIFs optimized for Slack. Provides constrain | - |
| example-skills:theme-factory | 0 | 0.0% | - | Toolkit for styling artifacts with a theme. These artifacts can be slides, docs, reporting | 동명 전역 스킬에 호출 귀속(중복 설치) |
| example-skills:web-artifacts-builder | 0 | 0.0% | - | Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using mode | - |
| example-skills:webapp-testing | 0 | 0.0% | - | Toolkit for interacting with and testing local web applications using Playwright. Supports | - |
| example-skills:xlsx | 0 | 0.0% | - | "Use this skill any time a spreadsheet file is the primary input or output. This means any | - |

### 플러그인 ponytail (6개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| ponytail:ponytail | 0 | 0.0% | - | Forces the laziest solution that actually works, simplest, shortest, most minimal. Channel | SessionStart 훅으로 매 세션 자동 적용 : Skill 호출 0건은 과소 집계 |
| ponytail:ponytail-audit | 0 | 0.0% | - | Whole-repo audit for over-engineering. Like ponytail-review, but scans the entire codebase | - |
| ponytail:ponytail-debt | 0 | 0.0% | - | Harvest every `ponytail:` comment in the codebase into a debt ledger, so the deliberate sh | - |
| ponytail:ponytail-gain | 0 | 0.0% | - | Show ponytail's measured impact as a compact scoreboard: less code, less cost, more speed, | - |
| ponytail:ponytail-help | 0 | 0.0% | - | Quick-reference card for all ponytail modes, skills, and commands. One-shot display, not a | - |
| ponytail:ponytail-review | 0 | 0.0% | - | Code review focused exclusively on over-engineering. Finds what to delete: reinvented stan | - |

### 플러그인 claude-code-setup (1개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| claude-code-setup:claude-automation-recommender | 0 | 0.0% | - | Analyze a codebase and recommend Claude Code automations (hooks, subagents, skills, plugin | 2026-09-10 설치 (집계 기간 내 사용 기회 없음) |

### 플러그인 frontend-design (1개, 호출 0건)

| 스킬 | 호출 수 | 전체 대비 사용율 | 최근 사용일 | 설명 | 비고 |
|---|---:|---:|---|---|---|
| frontend-design:frontend-design | 0 | 0.0% | - | Guidance for distinctive, intentional visual design when building new UI or reshaping an e | 프로젝트 동명 스킬과 중복 설치 |

## 4. 분석 소견

- 보유 스킬 163개 중 실제 호출은 7개, 호출 총 9건으로 활용률이 매우 낮음
- 실사용은 산출물 작업 직결 스킬(pptx·theme-factory·design)과 환경 설정 스킬(update-config·claude-in-chrome·find-skills·watch)에 집중
- 미사용 대군: SuperClaude 커맨드 31개 전량, agentmemory·superpowers 계열 전역 스킬, document/example-skills 플러그인 대부분
- 집계 한계: 훅으로 자동 적용되는 ponytail은 Skill 호출 0건이어도 매 세션 동작 중이며, 스킬 본문을 직접 읽어 따른 경우(예: guide 문서)는 호출로 잡히지 않음
- 당일(2026-09-10) 설치분(OmniRoute 5·task-observer·claude-mem 20·claude-code-setup)은 사용 기회가 없었으므로 0건이 비활용을 뜻하지 않음
- 재집계: 세션 기록 jsonl에서 `"name":"Skill"`의 `input.skill`과 사용자 메시지의 `<command-name>`을 스킬명별로 세면 동일 결과 재현 가능
