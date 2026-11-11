# 새 PC 개발 환경 이관 가이드 (설치 목록·링크·우선순위)

> 작성 2026-11-10 · 기준 = 현재 PC(Windows 11 Pro) 실측값(수집 보고 2026-11-10) · 근거 없는 값은 `[확인중]`(빨강 처리 대상)으로 둔다.
> 표기 : **마스터** = 직접 수작업, **Claude** = 새 PC 의 Claude Code 가 명령으로 대행, **혼합** = 설치·로그인을 나눠 맡음.
> 우선순위 : **P0** 없으면 개발 불가 · **P1** 주요 기능 · **P2** 선택.

---

## 1. 개요

| 항목 | 내용 |
|---|---|
| 대상 | 현재 PC 의 개발 도구 일체 — Git 2.54.0 · Node.js v24.15.0(LTS) · pnpm 11.4.0 · Claude Code 2.1.321 · VS Code 1.145.2 · 확장 39개 · Claude 플러그인 활성 18개 · MCP 14개 |
| 소요 예상 | 약 반나절(추정 — P0·P1 2~3시간, P2 는 고르는 범위·다운로드 속도에 따라 추가) |
| 작업 폴더 | `C:\Users\<사용자>\workspace` (현재 PC = `C:\Users\anaki\workspace`). 사용자명을 바꾸면 G-7 을 먼저 본다 |

**원칙 3가지**

1. **비밀은 직접 복사** — `.env*`·설정 파일은 마스터가 USB·클라우드로 직접 옮긴다. Claude 가 명령으로 전송하지 않는다.
2. **`.credentials.json` 은 복사 금지** — Claude·Codex·Vercel 로그인 토큰은 옮기지 않고 새 PC 에서 다시 로그인한다(D-2 표).
3. **P0 먼저** — 1회차에 모든 단계의 P0 만 끝내고 F 점검표의 P0 를 통과시킨 뒤, 2회차 P1, 3회차 P2 순으로 간다.

---

## 2. 전체 흐름 한눈에

| 단계 | 내용 | 담당 | P0 | P1 | P2 | 해당 항목 |
|---|---|---|---|---|---|---|
| 0 | OS 준비(winget 동작 확인) | 마스터 | 1 | 0 | 0 | A-01 |
| 1 | 부트스트랩(Git → Node.js → Claude Code) | 마스터 | 3 | 0 | 0 | A-02~04 |
| 2 | 런타임(pnpm·JDK·Python·WSL 등) | 혼합 | 1 | 2 | 7 | A-07, A-14~18, B-01, B-07, B-17~18 |
| 3 | 에디터·IDE(VS Code·확장·Docker 등) | 혼합 | 3 | 1 | 8 | A-19~25, B-02~04, B-08, B-19 |
| 4 | CLI·전역 패키지·분석 도구 | 혼합 | 0 | 4 | 12 | A-26~32, B-09~12, B-20~24 |
| 5 | Claude 구성(플러그인·MCP·환경변수) | Claude | 1 | 4 | 1 | B-05, B-13~16, B-25 |
| 6 | 로그인·OAuth | 마스터 | 1 | 6 | 2 | A-05, A-08~13, A-33~34 |
| 7 | 저장소 clone·로컬 자산 복사 | 혼합 | 2 | 0 | 0 | A-06, B-06 + D·E 표 |
| 8 | 이관 후 점검 | Claude(마스터 확인) | 6 | 2 | 0 | F 점검표 |

- 합계(A+B) : P0 12 · P1 17 · P2 30. 단계 8 은 F 점검표 항목 수.
- **실행 순서** : 1회차 = 단계 0~7 의 P0 → F 의 P0 점검 · 2회차 = P1 → F 의 P1 점검 · 3회차 = 필요한 P2 만.
- 마스터가 A-01~05 를 끝내면 그때부터 Claude 에게 B 를 맡긴다(3절 끝 예시 프롬프트).

---

## 3. A. 마스터 직접 설치 목록 (34항목)

UAC(관리자 승인)·재부팅·GUI 마법사·로그인이 필요해 마스터가 직접 한다. "UAC" 는 `C:\Program Files` 설치 근거의 **추정**이다 — 확인은 새 PC 에서 `winget show <Id>` 의 Scope [확인중].

| 순서 | 단계 | 우선순위 | 도구 | 현재 버전 | 공식 다운로드 링크 | winget Id | 설치 메모 |
|---|---|---|---|---|---|---|---|
| A-01 | 0 | P0 | winget (App Installer) | 동작 확인(버전 미기록) | [Microsoft Store](https://apps.microsoft.com/detail/9NBLGGH4NNS1) · [문서](https://learn.microsoft.com/windows/package-manager/winget/) | - | Windows 내장. `winget --version` 이 안 되면 Store 에서 App Installer 업데이트 |
| A-02 | 1 | P0 | Git for Windows (+Git LFS 동봉) | 2.54.0.windows.1 / LFS 3.7.1 | [git-scm.com](https://git-scm.com/downloads/win) | `Git.Git` | UAC. Claude Code 공식 문서가 Windows 에서 Git Bash 를 권장 — 이 저장소 훅·상태줄이 bash 를 쓰므로 필수 |
| A-03 | 1 | P0 | Node.js LTS | v24.15.0 | [nodejs.org](https://nodejs.org/en/download) | `OpenJS.NodeJS.LTS` | UAC(MSI). npm 11.15.0·corepack 0.34.6 동봉. nvm·volta 는 쓰지 않음 |
| A-04 | 1 | P0 | Claude Code | 2.1.321 | [code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup) | `Anthropic.ClaudeCode`(대안) | 아래 **A-04 명령**을 PowerShell 에서 실행. 현재 PC 는 네이티브 설치(`~\.local\bin\claude.exe`). winget 설치는 공식 문서상 자동 업데이트가 안 됨 |
| A-05 | 6 | P0 | Claude Code 로그인 | - | [설정 문서](https://code.claude.com/docs/en/setup) | - | 새 터미널에서 `claude` 첫 실행 → 브라우저 OAuth. `.credentials.json` 은 복사하지 않음 |
| A-06 | 7 | P0 | GitHub 인증(clone·push) | - | - | - | B-06 clone 때 Git 의 자격 증명 창에서 GitHub 로그인. 비공개 저장소 여부 [확인중] |
| A-07 | 2 | P1 | JDK 21 (Temurin) | 21.0.12.1 LTS | [adoptium.net](https://adoptium.net/temurin/releases/?version=21) | `EclipseAdoptium.Temurin.21.JDK` | UAC. Ghidra·DBeaver 가 사용. `JAVA_HOME` 은 B-13 에서 확인 |
| A-08 | 6 | P1 | Codex 로그인 | - | [github.com/openai/codex](https://github.com/openai/codex) | - | B-09 설치 뒤 `codex login`(브라우저 OAuth). Codex 판정 훅(`codex-gate.mjs`)이 사용 |
| A-09 | 6 | P1 | Vercel CLI 로그인 | - | [vercel.com/docs/cli](https://vercel.com/docs/cli) | - | B-10 설치 뒤 `vercel login` |
| A-10 | 6 | P1 | GitHub MCP OAuth | - | - | - | loginpi 에서 `claude` 실행 → `/mcp` → github 인증 |
| A-11 | 6 | P1 | Supabase MCP OAuth | - | - | - | `/mcp` → supabase 인증 |
| A-12 | 6 | P1 | Sentry MCP OAuth | - | - | - | `/mcp` → sentry 인증 |
| A-13 | 6 | P1 | Vercel MCP OAuth | - | - | - | `/mcp` → vercel 인증 |
| A-14 | 2 | P2 | WSL | 2.5.10.0 (배포판 docker-desktop 만) | [learn.microsoft.com](https://learn.microsoft.com/windows/wsl/install) | `Microsoft.WSL` | 관리자 권한·**재부팅**. Docker(A-19)보다 먼저 |
| A-15 | 2 | P2 | Oracle JDK 17 | 17.0.14 | [oracle.com](https://www.oracle.com/java/technologies/downloads/) | `Oracle.JDK.17` | UAC. 사용처 [확인중 : 마스터] |
| A-16 | 2 | P2 | Anaconda3 | 2025.06-0 | [anaconda.com](https://www.anaconda.com/download) | `Anaconda.Anaconda3` | 대형 GUI 설치기 |
| A-17 | 2 | P2 | Go | 1.27.0 | [go.dev](https://go.dev/dl/) | `GoLang.Go` | UAC. `GOPATH` 는 B-25 |
| A-18 | 2 | P2 | .NET Desktop Runtime 8 | 8.0.14 | [dotnet.microsoft.com](https://dotnet.microsoft.com/download/dotnet/8.0) | `Microsoft.DotNet.DesktopRuntime.8` | UAC |
| A-19 | 3 | P2 | Docker Desktop | 4.73.0 (docker 29.4.3) | [docker.com](https://www.docker.com/products/docker-desktop/) | `Docker.DockerDesktop` | UAC·**재부팅**. WSL2 백엔드 |
| A-20 | 3 | P2 | Notepad++ | 8.8.3 | [notepad-plus-plus.org](https://notepad-plus-plus.org/downloads/) | `Notepad++.Notepad++` | UAC |
| A-21 | 3 | P2 | IntelliJ IDEA Community | 2025.1.3 | [jetbrains.com](https://www.jetbrains.com/idea/download/) | - | 수동 설치. 사용자 환경변수 `IntelliJ` 있음 |
| A-22 | 3 | P2 | PyCharm | 2025.3.1 | [jetbrains.com](https://www.jetbrains.com/pycharm/download/) | - | 수동 설치. 사용자 환경변수 `PyCharm` 있음 |
| A-23 | 3 | P2 | SQL Server Management Studio 21 | 21.4.8 | [learn.microsoft.com](https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms) | - | 수동 설치 |
| A-24 | 3 | P2 | SQL Developer | [확인중] | [oracle.com](https://www.oracle.com/database/sqldeveloper/technologies/download/) | - | 수동 설치(JDK 필요) |
| A-25 | 3 | P2 | erwin · eXERD | [확인중] | erwin [확인중 : 링크 응답 202] · [exerd.com](https://www.exerd.com/) | - | 상용 — 라이선스 필요 |
| A-26 | 4 | P2 | DBeaver Community | 26.0.5 | [dbeaver.io](https://dbeaver.io/download/) | `DBeaver.DBeaver.Community` | UAC |
| A-27 | 4 | P2 | Ghidra | 12.1.4 PUBLIC | [GitHub releases](https://github.com/NationalSecurityAgency/ghidra/releases) | - | zip 을 `C:\Users\<사용자>\tools\` 에 압축 해제. JDK 21 필요. 환경변수는 B-25(C-04) |
| A-28 | 4 | P2 | PostgreSQL 16 · 17 | 16.3-1 / 17.6-1 | [postgresql.org](https://www.postgresql.org/download/windows/) | `PostgreSQL.PostgreSQL.16` · `PostgreSQL.PostgreSQL.17` | UAC. pgBouncer·PostGIS·psqlODBC 도 함께 있었음 |
| A-29 | 4 | P2 | LibreOffice | 26.2.4.2 | [libreoffice.org](https://www.libreoffice.org/download/download-libreoffice/) | `TheDocumentFoundation.LibreOffice` | UAC |
| A-30 | 4 | P2 | VirtualBox | 7.1.12 | [virtualbox.org](https://www.virtualbox.org/wiki/Downloads) | `Oracle.VirtualBox` | **재부팅** |
| A-31 | 4 | P2 | Graphviz · PuTTY · cloudflared · Chocolatey | [확인중] | [graphviz.org](https://graphviz.org/download/) · [PuTTY](https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html) · [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) · [chocolatey.org](https://chocolatey.org/install) | - | UAC |
| A-32 | 4 | P2 | 브라우저·유틸(Chrome·Edge·Opera·Notion·Bandizip·WinSCP·MTPuTTY) | Chrome 156.0.8078.81 · Bandizip 7.40 | [Chrome](https://www.google.com/chrome/) · [Edge](https://www.microsoft.com/edge/download) · [Opera](https://www.opera.com/download) · [Notion](https://www.notion.com/desktop) · [Bandizip](https://www.bandisoft.com/bandizip/) · [WinSCP](https://winscp.net/eng/download.php) · [MTPuTTY](https://ttyplus.com/multi-tabbed-putty/) | `Bandisoft.Bandizip` | UAC. 브라우저 동기화는 A-34 |
| A-33 | 6 | P2 | VS Code 설정 동기화 | - | [설정 동기화 문서](https://code.visualstudio.com/docs/configure/settings-sync) | - | VS Code 왼쪽 아래 계정 → Settings Sync 켜기(GitHub 또는 Microsoft 로그인) |
| A-34 | 6 | P2 | 브라우저 계정 동기화 | - | - | - | Chrome·Edge 계정 로그인 |

**A-04 명령** (공식 문서 확인 2026-11-10, Windows PowerShell)

```powershell
irm https://claude.ai/install.ps1 | iex
```

- CMD 에서는 `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd`
- 설치 확인은 `claude --version`, `claude doctor`.

---

## 4. B. Claude Code 대행 설치 목록 (25항목)

사용자 범위 설치라 UAC 가 필요 없는 것(추정 포함)이다. 각 명령은 Git Bash·PowerShell 어디서나 같다. winget 의 user 범위 지원 여부는 `winget show <Id>` 로 확인 [확인중].

| 순서 | 단계 | 우선순위 | 대상 | 설치 명령 |
|---|---|---|---|---|
| B-01 | 2 | P0 | pnpm 11.4.0 (저장소 `packageManager` 고정값) | `npm i -g pnpm@11.4.0` |
| B-02 | 3 | P0 | Windows Terminal 1.24 | `winget install --id Microsoft.WindowsTerminal -e` (이미 있으면 건너뜀) |
| B-03 | 3 | P0 | VS Code 1.145.2 (사용자 범위) | `winget install --id Microsoft.VisualStudioCode -e --scope user` |
| B-04 | 3 | P0 | VS Code 확장 P0 4개 | B-1 표 P0 행 → `code --install-extension <확장 ID>` |
| B-05 | 5 | P0 | 환경변수 `WORKSPACE_ROOT` | `setx WORKSPACE_ROOT "C:/Users/<사용자>/workspace"` (아래 환경변수 블록) |
| B-06 | 7 | P0 | loginpi clone + 의존성 | `git clone https://github.com/anakinwon/loginpi.git` → `cd loginpi` → `pnpm install` (인증 창은 A-06) |
| B-07 | 2 | P1 | Python 3.14 (Python Install Manager) | `winget install --id Python.PythonInstallManager -e` → 필요하면 `py install 3.14` [확인중 : 런타임 자동 설치 여부] |
| B-08 | 3 | P1 | VS Code 확장 P1 10개 | B-1 표 P1 행 |
| B-09 | 4 | P1 | Codex CLI 0.167.0 | `npm i -g @openai/codex` (로그인은 A-08) |
| B-10 | 4 | P1 | Vercel CLI 54.5.1 | `npm i -g vercel` (로그인은 A-09) |
| B-11 | 4 | P1 | rea-agents (REA) 6.4.0 | `npm i -g rea-agents` |
| B-12 | 4 | P1 | Playwright 브라우저(chromium·headless shell·webkit·ffmpeg) | `npx playwright install` |
| B-13 | 5 | P1 | 환경변수 `JAVA_HOME` 확인 | `echo $JAVA_HOME` — 비어 있을 때만 `setx JAVA_HOME "<JDK 21 설치 폴더>"` |
| B-14 | 5 | P1 | Claude 마켓플레이스 10개 | B-2 블록 `claude plugin marketplace add <source>` |
| B-15 | 5 | P1 | Claude 플러그인 활성 18개 | B-2 블록 `claude plugin install <이름>@<마켓>` |
| B-16 | 5 | P1 | MCP 14개(`.mcp.json`, 저장소에 포함) | 설치 명령 없음 — npx 계열은 첫 실행 때 자동으로 내려받음. 상태 확인 `claude mcp list` |
| B-17 | 2 | P2 | Python 3.13.7 | `winget install --id Python.Python.3.13 -e` |
| B-18 | 2 | P2 | Rustup 1.29.0 | `winget install --id Rustlang.Rustup -e` |
| B-19 | 3 | P2 | VS Code 확장 P2 25개 | B-1 표 P2 행 |
| B-20 | 4 | P2 | pip 패키지 13개 | 아래 pip 블록 |
| B-21 | 4 | P2 | FFmpeg · yt-dlp (`watch` 플러그인용) | `winget install --id Gyan.FFmpeg -e` · `winget install --id yt-dlp.yt-dlp -e` · `winget install --id yt-dlp.FFmpeg -e` |
| B-22 | 4 | P2 | Deno | `winget install --id DenoLand.Deno -e` [확인중 : Id] |
| B-23 | 4 | P2 | uv (serena MCP 의 `uvx`) | `winget install --id=astral-sh.uv -e` (공식 문서) 또는 `python -m pip install uv` |
| B-24 | 4 | P2 | Obsidian 1.15.0 | `winget install --id Obsidian.Obsidian -e` |
| B-25 | 5 | P2 | 환경변수 `GHIDRA_INSTALL_DIR` · `GOPATH` | 아래 환경변수 블록 (A-27·A-17 뒤) |

참고 링크(점검 200) : [VS Code](https://code.visualstudio.com/download) · [Windows Terminal](https://aka.ms/terminal) · [pnpm](https://pnpm.io/installation) · [Python](https://www.python.org/downloads/windows/) · [Playwright 브라우저](https://playwright.dev/docs/browsers) · [Rustup](https://rustup.rs/) · [FFmpeg](https://www.gyan.dev/ffmpeg/builds/) · [yt-dlp](https://github.com/yt-dlp/yt-dlp) · [Deno](https://docs.deno.com/runtime/getting_started/installation/) · [uv](https://docs.astral.sh/uv/getting-started/installation/) · [Obsidian](https://obsidian.md/download) · [Git LFS](https://git-lfs.com/)

### B-1. VS Code 확장 39개 (현재 PC `code --list-extensions` 실측 39개)

| 순서 | 우선순위 | 확장 ID | 현재 버전 |
|---|---|---|---|
| 1 | P0 | anthropic.claude-code | 2.1.319 |
| 2 | P0 | dbaeumer.vscode-eslint | 3.0.34 |
| 3 | P0 | esbenp.prettier-vscode | 12.4.0 |
| 4 | P0 | bradlc.vscode-tailwindcss | 0.16.0 |
| 5 | P1 | eamodio.gitlens | 19.5.0 |
| 6 | P1 | ms-ceintl.vscode-language-pack-ko | 1.131.2026090407 |
| 7 | P1 | ms-vscode.vscode-typescript-next | 6.0.20260416 |
| 8 | P1 | typescriptteam.native-preview | 1.0.2 |
| 9 | P1 | ms-python.python | 2026.10.0 |
| 10 | P1 | ms-python.vscode-pylance | 2026.4.1 |
| 11 | P1 | ms-python.debugpy | 2026.6.0 |
| 12 | P1 | ms-python.vscode-python-envs | 1.42.0 |
| 13 | P1 | davidanson.vscode-markdownlint | 0.62.1 |
| 14 | P1 | redhat.vscode-yaml | 2.0.0 |
| 15 | P2 | christian-kohler.npm-intellisense | 1.4.5 |
| 16 | P2 | christian-kohler.path-intellisense | 2.10.0 |
| 17 | P2 | firefox-devtools.vscode-firefox-debug | 2.15.0 |
| 18 | P2 | formulahendry.auto-rename-tag | 0.1.10 |
| 19 | P2 | mechatroner.rainbow-csv | 3.24.1 |
| 20 | P2 | ms-azuretools.vscode-containers | 2.5.3 |
| 21 | P2 | ms-dotnettools.vscode-dotnet-runtime | 3.2.0 |
| 22 | P2 | ms-edgedevtools.vscode-edge-devtools | 2.1.14 |
| 23 | P2 | ms-kubernetes-tools.vscode-kubernetes-tools | 1.4.1 |
| 24 | P2 | ms-mssql.data-workspace-vscode | 0.8.0 |
| 25 | P2 | ms-mssql.mssql | 1.47.0 |
| 26 | P2 | ms-mssql.sql-bindings-vscode | 0.4.1 |
| 27 | P2 | ms-mssql.sql-database-projects-vscode | 1.9.0 |
| 28 | P2 | ms-toolsai.datawrangler | 1.24.2 |
| 29 | P2 | ms-toolsai.jupyter | 2025.9.1 |
| 30 | P2 | ms-toolsai.jupyter-keymap | 1.1.2 |
| 31 | P2 | ms-toolsai.jupyter-renderers | 1.3.0 |
| 32 | P2 | ms-toolsai.vscode-jupyter-cell-tags | 0.1.9 |
| 33 | P2 | ms-toolsai.vscode-jupyter-slideshow | 0.1.6 |
| 34 | P2 | ms-vscode-remote.remote-containers | 0.469.0 |
| 35 | P2 | ms-vscode.notepadplusplus-keybindings | 1.0.7 |
| 36 | P2 | ms-vscode.vscode-chat-customizations-evaluations | 1.0.9 |
| 37 | P2 | mtxr.sqltools | 0.28.6 |
| 38 | P2 | ritwickdey.liveserver | 5.7.10 |
| 39 | P2 | tomoki1207.pdf | 1.2.2 |

```powershell
# P0 (B-04)
'anthropic.claude-code','dbaeumer.vscode-eslint','esbenp.prettier-vscode','bradlc.vscode-tailwindcss' | ForEach-Object { code --install-extension $_ }
# P1 (B-08), P2 (B-19) 도 위 표의 ID 를 같은 방식으로 넣는다
```

### B-2. Claude 마켓플레이스 10개 · 플러그인 18개

```bash
# 마켓플레이스 10개 (B-14) — 세션 안에서는 /plugin marketplace add <source> 와 같다
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add anthropics/claude-code
claude plugin marketplace add anthropics/skills
claude plugin marketplace add revfactory/harness
claude plugin marketplace add DietrichGebert/ponytail
claude plugin marketplace add JuliusBrussee/caveman
claude plugin marketplace add https://github.com/affaan-m/ECC.git
claude plugin marketplace add forrestchang/andrej-karpathy-skills
claude plugin marketplace add bradautomates/claude-video
claude plugin marketplace add Egonex-AI/Understand-Anything

# 활성 플러그인 18개 (B-15) — 세션 안에서는 /plugin install <이름>@<마켓>
for p in vercel frontend-design context7 code-review code-simplifier pr-review-toolkit typescript-lsp supabase playwright claude-md-management skill-creator security-guidance; do claude plugin install "$p@claude-plugins-official"; done
claude plugin install document-skills@anthropic-agent-skills
claude plugin install harness@harness-marketplace
claude plugin install ponytail@ponytail
claude plugin install caveman@caveman
claude plugin install ecc@ecc
claude plugin install watch@claude-video
```

- 비활성 28개·설치만 된 3개(superpowers·andrej-karpathy-skills·understand-anything)는 G-2 결정 뒤에 설치한다.

### B-3. pip 패키지 13개 (B-20, 현재 PC Python 3.14 기준 버전)

```bash
python -m pip install --upgrade pip==25.3
python -m pip install et_xmlfile==2.0.0 lxml==6.1.1 openpyxl==3.1.5 pefile==2024.8.26 pillow==12.2.0 PyMuPDF==1.27.2.3 pypdf==6.21.0 python-docx==1.2.0 python-pptx==1.0.2 typing_extensions==4.15.0 xlrd==2.0.2 xlsxwriter==3.2.9
```

### B-4. 환경변수 (이름과 값 형식만, 비밀 없음)

```powershell
setx WORKSPACE_ROOT "C:/Users/<사용자>/workspace"                      # B-05, P0
setx GHIDRA_INSTALL_DIR "C:\Users\<사용자>\tools\ghidra_12.1.4_PUBLIC"  # B-25, A-27 뒤
setx GOPATH "<Go 작업 폴더>"                                            # B-25, 현재 값 형식 [확인중] (PATH 에 %USERPROFILE%\go\bin 있음)
# JAVA_HOME 은 B-13 — 설치기가 넣지 않았을 때만
```

- `CLAUDE_*`·`CLAUDE_FLOW_*`·`MAX_THINKING_TOKENS` 등은 `.claude/settings.json`(저장소)·`~/.claude/settings.json`(D-1) 의 `env` 로 들어가므로 `setx` 하지 않는다.
- `setx` 는 새로 연 터미널부터 적용된다.

### 새 PC 에서 Claude 에게 이렇게 말하세요

> `.claude/setup/.pgm_list.md` 의 B 목록을 순서대로 설치해 줘. P0(B-01~06)를 먼저 끝내고 F 점검표의 P0 를 돌려서 보고하고, 그다음 P1, P2 순으로 진행해. C 표에서 마스터 몫(로그인·OAuth·압축 해제)이 나오면 멈추고 무엇을 하면 되는지 알려 줘. 비밀값은 출력하지 마.

---

## 5. C. 혼합 항목 (7항목)

| 항목 | ① Claude (설치) | ② 마스터 (로그인·수작업) | ③ Claude (확인) |
|---|---|---|---|
| C-01 Codex | B-09 `npm i -g @openai/codex` | A-08 `codex login` | `codex login status` |
| C-02 Vercel CLI | B-10 `npm i -g vercel` | A-09 `vercel login` | `vercel whoami` |
| C-03 VS Code | B-03 설치 · B-04·08·19 확장 | A-33 설정 동기화 로그인 | `code --list-extensions` 를 이 PC 에서 내보낸 목록(10절)과 대조 |
| C-04 Ghidra | B-25 `setx GHIDRA_INSTALL_DIR …` | A-27 zip 다운로드·압축 해제 (JDK 21 먼저) | 새 터미널에서 `echo $GHIDRA_INSTALL_DIR` |
| C-05 loginpi clone | B-06 `git clone` · `pnpm install` | A-06 GitHub 자격 증명 창 로그인 | `git fetch` · `git status` |
| C-06 MCP OAuth | B-16 `claude mcp list` 로 미인증 서버 확인 | A-10~13 `/mcp` 에서 github·supabase·sentry·vercel 인증 | `claude mcp list` 재확인 |
| C-07 `~/.claude` 설정 | - | D-1 표 파일을 USB·클라우드로 직접 복사 | F 의 훅 selftest 4종 |

---

## 6. D. 옮길 파일 (로컬 자산)

### D-1. 옮길 것

크기는 2026-11-10 실측. `.env*` 는 내용을 열지 않고 크기만 쟀다.

| 경로 | 크기 | 비밀 여부 | 옮기는 방법 | 필수/선택 |
|---|---|---|---|---|
| `loginpi\.env.local` | 6,671 B | 예 | USB·클라우드 직접 복사(암호화 권장) | 필수 |
| `loginpi\.env.multi` | 13,677 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\cafe.pi\.env.local` | 6,671 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\dbms.pi\.env.local` | 9,782 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\dbms.pi\.env.vercel-prod` | 1,300 B | 예 | 같음 | 선택(Vercel 에서 다시 받을 수 있음) |
| `loginpi\sitemap\schema.pi\.env.local` | 2,323 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\schema.pi\pitel\.env.local` | 168 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\seminar.pi\.env.local` | 12,322 B | 예 | 같음 | 필수 |
| `loginpi\sitemap\seminar.pi\.env.vercel-prod` | 1,470 B | 예 | 같음 | 선택(Vercel 에서 다시 받을 수 있음) |
| `loginpi\sitemap\sitemap.pi\.env.local` | 1,896 B | 예 | 같음 | 필수 |
| `~\.claude\settings.json` | 4,099 B | 토큰 없음 확인 필요 [확인중 : 마스터] | USB·클라우드 직접 복사 | 필수 |
| `~\.claude\CLAUDE.md` · `CLAUDE.local.md` | 799 B · 54 B | 아니오 | 같음 | 필수 |
| `~\.claude\statusline-command.sh` · `bash-env.sh` | 2,839 B · 176 B | 아니오 | 같음 | 필수 |
| `~\.claude\skills\` | 4.7 MB | 아니오 | 같음 | 필수 |
| `~\.claude\commands\` | 48 KB | 아니오 | 같음 | 필수 |
| `~\.claude\agent-memory\` · `hooks\` · `scripts\` | 13 KB · 8 KB · 4 KB | 아니오 | 같음 | 필수 |
| `~\.claude\projects\C--Users-anaki-workspace-loginpi\memory\` | 136 KB | 대화 요약 포함 | 같음 | 필수(권장) |
| `~\.claude\projects\C--Users-anaki-workspace-loginpi\skill-observations\` | 127 KB | 대화 요약 포함 | 같음 | 선택 |
| `~\.claude\projects\` 나머지(세션 기록) | 전체 4.7 GB (loginpi 폴더 4.4 GB) | 대화 전문 포함 | 옮기지 않음 권장 — 메모리만 위 2줄로 | 선택(비권장) |
| `~\.claude\history.jsonl` · `bash-commands.log` · `cost-tracker.log` | 1.8 MB · 14.6 MB · 15 MB | 대화·명령 이력 | USB·클라우드 직접 복사 | 선택 |
| `.mcp.json` | 4 KB | 아니오(supabase `project_ref` 포함) | 저장소에 포함 — clone 으로 따라옴 | 복사 불필요 |
| VS Code `%APPDATA%\Code\User\` (`settings.json`·`mcp.json`·`snippets\`·`profiles\`) | [확인중] | [확인중] | A-33 설정 동기화 우선, 안 되면 직접 복사 | 선택 |
| `loginpi\work-history\` | 49 MB | 대화 전문 포함 | USB·클라우드 직접 복사 | 선택(통계 원본) |
| `loginpi\.omc\state\` (판정 원장 `loop\` · `codex-gate\` · `request-graph\`) | 전체 12.6 MB · 2,260파일 (2026-11-11 실측 — `loop\` 8.2 MB · 142폴더 · 원장 135, `request-graph\` 4.0 MB, `codex-gate\` 42 KB) | 원장 증거에 코드 발췌 포함(비밀값은 가림) — 개인 보관 | 10절 **Claude 작업 상태 백업**(3폴더만, `push-allow.json` 제외) | 선택(P2) |
| `loginpi\work-statistics\` | 76 MB | 아니오 | 옮기지 않음 — 다시 생성됨 | 불필요 |

- `~\.claude` 는 git 저장소다(원격 `https://github.com/anakinwon/claude-dotfiles.git`, 마지막 커밋 2026-07-18). 그 뒤 변경이 있어 **직접 복사**를 기준으로 한다. `.credentials.json` 은 그 저장소의 `.gitignore` 에 들어 있다.

### D-2. 복사 금지 (새 PC 에서 다시 로그인)

| 경로 | 이유 | 대신 할 일 |
|---|---|---|
| `~\.claude\.credentials.json` (7.5 KB) | Claude 로그인 토큰 | A-05 `claude` 재로그인 |
| `~\.codex\auth.json` | Codex 로그인 토큰 | A-08 `codex login` |
| `%APPDATA%\com.vercel.cli\Data\` | Vercel CLI 로그인 데이터(파일 구성 [확인중]) | A-09 `vercel login` |

### D-3. 옮기지 않음 (다시 설치하면 생김)

- `~\.claude\plugins\` 543 MB → B-14·15 · `%LOCALAPPDATA%\ms-playwright` 1.2 GB → B-12 · `~\.cache` 811 MB → 자동 생성 · `loginpi\.claude\worktrees\` → 임시 작업 사본.

---

## 7. E. 저장소 clone 목록 (`C:\Users\<사용자>\workspace` 아래)

| 폴더 | 원격 URL | 구분 | 이관 |
|---|---|---|---|
| `loginpi` | `https://github.com/anakinwon/loginpi.git` | 핵심(현재 프로젝트, `sitemap/` 아래 5개 앱) | 필수 — B-06 |
| `claude-code-mastery` | `https://github.com/anakinwon/claude-code-mastery.git` | 본인 저장소 | 선택 |
| `claude-nextjs-starters` | `https://github.com/anakinwon/claude-nextjs-starters-bestkit.git` | 본인 저장소 | 선택 |
| `claude-picafe-starterkit` | `https://github.com/anakinwon/claudepi-premium-starterkit.git` | 본인 저장소 | 선택 |
| `dr-project` | `https://github.com/anakinwon/dr-project.git` | 본인 저장소 | 선택 |
| `nextjs-supabase-app` | `https://github.com/anakinwon/nextjs-supabase-app.git` | 본인 저장소 | 선택 |
| `schema` | `https://github.com/anakinwon/schema.git` | 본인 저장소 | 선택 |
| `invoice-web` | `https://github.com/gymcoding/claude-nextjs-starters.git` | 외부 저장소 | 선택 |
| `mcp-shrimp-task-manager` | `https://github.com/cjo4m06/mcp-shrimp-task-manager.git` | 외부 저장소 | 선택 |
| `cafe-pi-claude` | `https://github.com/anakinwon/loginpi.git` | **중복**(loginpi 와 같은 원격, 구 폴더명) | 불필요 |
| `schema_backup` | `https://github.com/anakinwon/claude-nextjs-starters-bestkit.git` | **중복**(claude-nextjs-starters 와 같은 원격) | 불필요 |
| `cafe-pi-bean-s1` · `cafe-pi-claude-s3` · `cafe-pi-s2` · `cafe-pi-s3` · `cafe-pi-s4` · `claude-nextjs-starterkit` · `galapagos-build` · `loginpi-fix89` | 없음 | **저장소 아님**(git 원격 없음) | 복사 여부 G-1 [확인중 : 마스터] |

---

## 8. F. 이관 후 점검표

Git Bash 에서 `loginpi` 폴더 기준으로 실행한다.

- [ ] (P0) `claude --version` → 2.1.321 이상, `claude doctor` 이상 없음
- [ ] (P0) `node -v` → v24.x
- [ ] (P0) `pnpm -v` → 11.4.0
- [ ] (P0) `pnpm install && pnpm build` 통과
- [ ] (P0) 훅 selftest 3종 통과 (`turn-gate.mjs` 는 2026-11-12 폐지 — 점검 항목 삭제)
  - `node .claude/hooks/codex-gate.mjs --selftest`
  - `node .claude/hooks/model-advisor.mjs --selftest`
  - `node .claude/subagent-statusline.mjs --selftest`
- [ ] (P0) `code --list-extensions` 결과가 39개이고 B-1 표(또는 10절에서 내보낸 `vscode-extensions.txt`)와 같다
- [ ] (P1) `codex login status` → 로그인됨
- [ ] (P1) `claude mcp list` → 14개 연결, github·supabase·sentry·vercel 인증 완료 (serena 는 G-4 처리 뒤)

---

## 9. G. 결정 필요 [확인중 : 마스터]

| 번호 | 결정할 것 | 현재 상태 | 권장 |
|---|---|---|---|
| G-1 | 업무·개인 SW 이관 여부 — Adobe Photoshop 7.0.1, AXGATE VPN Client, 한컴(HNC), Polaris Office, AcroEdit, Logi Options+, ESTsoft, 저장소 아닌 폴더 8개(E 표) | 수집만 됨, 이관 판단 없음 | 업무에 쓰는 것만 설치 파일·라이선스를 따로 챙김 |
| G-2 | 비활성 플러그인 28개 + 설치만 된 3개 설치 여부 | 비활성 : commit-commands, feature-dev, github, gitlab, ralph-loop, claude-code-setup, figma, slack, discord, notion, postman, mongodb, netlify-skills, data-engineering, data, shopify, zoominfo, zoom-plugin, sourcegraph, mcp-apps, serena, session-report, agent-sdk-dev, plugin-dev, mcp-server-dev, hookify, pyright-lsp(이상 `@claude-plugins-official`), example-skills@anthropic-agent-skills / 설치만 : superpowers, andrej-karpathy-skills, understand-anything | 활성 18개만 먼저, 나머지는 필요할 때 |
| G-3 | loginpi 미커밋 변경 커밋·푸시 | 2026-11-10 측정 : 변경 42건(`git status`), 원격보다 앞선 커밋 9개 | 떠나기 전 커밋(Claude) → 푸시(마스터 `! git push`, Claude push 는 훅이 막음) |
| G-4 | serena MCP 의 Python 경로 | `.mcp.json` 이 `…\Python312\python.exe` 를 가리키나 현재 PC 에 Python 3.12 없음 | 새 PC 의 Python 경로로 바꾸거나 serena 를 끔 |
| G-5 | agent-browser · ruflo · ecc-memory-mcp 설치 방법 | agent-browser CLI 는 PATH 에 없음, ruflo·ecc-memory-mcp 는 `.mcp.json` 에 있으나 전역 npm 목록에 없음 | 필요 여부부터 결정, 설치 방법 [확인중] |
| G-6 | `~/.claude` dotfiles 저장소 정리 | 마지막 커밋 2026-07-18 | 떠나기 전 커밋·푸시하면 새 PC 에서 clone 으로 대체 가능 |
| G-7 | 새 PC 사용자명·경로 | `.claude/settings.json`(저장소) `env.WORKSPACE_ROOT` = `C:/Users/anaki/workspace` 고정, `~\.claude\projects\` 폴더 이름도 경로에서 만들어짐 | 같은 사용자명 `anaki`·같은 경로 유지. 바꾸면 이 값과 메모리 폴더 이름을 함께 고침 |

---

## 10. 이 PC 에서 떠나기 전 할 일

- [ ] **이 가이드 파일 복사** — `.claude/setup/.pgm_list.md` 는 `.gitignore` 의 `.claude/*` 규칙에 걸려 clone 으로 따라오지 않는다. USB·클라우드로 함께 옮겨 새 PC 의 같은 경로에 둔다
- [ ] **미커밋 변경 처리** — G-3. 다른 저장소도 `git -C <폴더> status --short` 로 확인
- [ ] **`.env*` 10개 백업**(마스터가 직접, `E:` = USB 예시)

```powershell
cd C:\Users\anaki\workspace\loginpi
$files = '.env.local','.env.multi','sitemap\cafe.pi\.env.local','sitemap\dbms.pi\.env.local','sitemap\dbms.pi\.env.vercel-prod','sitemap\schema.pi\.env.local','sitemap\schema.pi\pitel\.env.local','sitemap\seminar.pi\.env.local','sitemap\seminar.pi\.env.vercel-prod','sitemap\sitemap.pi\.env.local'
foreach ($f in $files) { New-Item -Force -ItemType Directory (Split-Path "E:\loginpi-env\$f") | Out-Null; Copy-Item $f "E:\loginpi-env\$f" }
```

- [ ] **`~/.claude` 백업**(필요한 것만 — `.credentials.json`·`plugins\`·세션 기록 제외)

```powershell
$src = "$env:USERPROFILE\.claude"; $dst = 'E:\claude-home'
New-Item -Force -ItemType Directory $dst | Out-Null
foreach ($i in 'settings.json','CLAUDE.md','CLAUDE.local.md','statusline-command.sh','bash-env.sh') { Copy-Item "$src\$i" $dst }
foreach ($d in 'skills','commands','agent-memory','hooks','scripts') { robocopy "$src\$d" "$dst\$d" /E }
foreach ($d in 'memory','skill-observations') { robocopy "$src\projects\C--Users-anaki-workspace-loginpi\$d" "$dst\projects\C--Users-anaki-workspace-loginpi\$d" /E }
```

- [ ] **Claude 작업 상태 백업**(P2 · 마스터 직접 — 수작업) — `.omc/` 는 `.gitignore`(`.omc/*`) 라 clone 으로 따라오지 않는다. Codex 판정·면제 원장(`.omc/state/loop/`), 판정 훅 귀속·기준선(`.omc/state/codex-gate/`), 요청 그래프 요약 캐시(`.omc/state/request-graph/`) 3폴더만 옮긴다(크기 D-1 표). 없어도 개발은 되고 새 PC 에서 이력이 비어 시작할 뿐이다.
  - **포함하지 않음** : `.omc/state/push-allow.json`(push 1회 승인 — 마스터 전용, 새 PC 에서 다시 받음) · `work-history\`(로거 상태) · `backup-*` 파일
  - **주의** : 원장 증거에 코드 발췌가 들어 있다(비밀값은 가림). USB 등 개인 보관만 — 저장소 커밋·클라우드 공유 금지
  - 마지막 Claude 턴이 끝난 뒤 백업한다(진행 중 판정이 섞이지 않게). 아래는 `loginpi` 루트 기준, `E:` = USB 예시

```bash
# Git Bash — 옛 PC 백업 (E: 는 /e/ 로 적는다 — 'E:' 는 tar 가 원격 호스트로 읽음)
tar -czf /e/loginpi-omc-state.tgz .omc/state/loop .omc/state/codex-gate .omc/state/request-graph
# Git Bash — 새 PC 복원 (B-06 clone 뒤, loginpi 루트에서)
tar -xzf /e/loginpi-omc-state.tgz
```

```powershell
# PowerShell — 옛 PC 백업 (압축 안에는 loop\ · codex-gate\ · request-graph\ 가 맨 위로 들어간다)
Compress-Archive -Path .omc\state\loop, .omc\state\codex-gate, .omc\state\request-graph -DestinationPath E:\loginpi-omc-state.zip
# PowerShell — 새 PC 복원 (B-06 clone 뒤, loginpi 루트에서)
New-Item -Force -ItemType Directory .omc\state | Out-Null; Expand-Archive E:\loginpi-omc-state.zip -DestinationPath .omc\state -Force
```

  - 복원 확인(Git Bash) : `node scripts/request-graph.mjs --md && node -e "const fs=require('fs'),d='.omc/state/loop';console.log(fs.readdirSync(d).filter(x=>fs.existsSync(d+'/'+x+'/ledger.json')).length)"` → 종료 0 · 원장 수가 옛 PC 와 같음(2026-11-11 기준 135)

- [ ] **목록 내보내기**(새 PC 대조용, 비밀 없음)

```bash
code --list-extensions --show-versions > vscode-extensions.txt
winget export -o winget-packages.json
npm ls -g --depth=0 > npm-global.txt
python -m pip freeze > pip-freeze.txt
claude plugin list > claude-plugins.txt
```

- [ ] (선택) `work-history\`·VS Code `User\` 폴더 복사 — D-1 표 (`.omc\state\` 는 위 **Claude 작업 상태 백업**)
