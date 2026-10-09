#!/usr/bin/env bash
# Claude Code 상태줄: 요금제 배지(★ Max 20x · 5h 37% ↻15:19 · 7d 13% ↻9/20 13:19) | 모델명 | 추론 effort(💪, /effort 변경 즉시 반영·미지원 모델은 생략) | 진행 중 서브에이전트 단계(▶ 단계 모델·effort, subagent-statusline.mjs 상태 파일, 10초 무갱신 시 생략) | 폴더 | git 브랜치 | 컨텍스트 사용률 진행률 바 | 잔여율(🧠) | 세션 누적 도구 사용(🧩, 훅 기록 기반 : 이름(s)=스킬 (m)=MCP (p)=플러그인 (a)=에이전트 (h)=훅, 사용 순 전체)
input=$(cat)

# jq 사용 가능 여부에 따라 파싱 방식 분기 (jq 없으면 sed/grep 폴백)
if command -v jq >/dev/null 2>&1; then
  model=$(printf '%s' "$input" | jq -r '.model.display_name // "Unknown"')
  cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
  used_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty')
else
  model=$(printf '%s' "$input" | sed -n 's/.*"display_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  cwd=$(printf '%s' "$input" | sed -n 's/.*"current_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  # used_percentage 키는 rate_limits(5시간·7일 한도)에도 있어 context_window 블록만 잘라 읽는다(중첩 current_usage 제거 후)
  cw=$(printf '%s' "$input" | sed 's/"current_usage":{[^}]*}//' | grep -o '"context_window":{[^}]*}')
  used_pct=$(printf '%s' "$cw" | sed -n 's/.*"used_percentage"[[:space:]]*:[[:space:]]*\([0-9.]*\).*/\1/p' | head -1)
fi

[ -z "$model" ] && model="Unknown"

# 요금제 배지 (★): ~/.claude.json의 organizationRateLimitTier(default_claude_max_20x → "Max 20x"), 없으면 organizationType(claude_max → "Max")
#   + 5시간·주간 사용률(rate_limits.five_hour/seven_day.used_percentage)과 리셋 시각(resets_at, epoch 초 → 로컬 시각).
#   rate_limits는 API 키 로그인이면 null이므로 항목별로 있을 때만 붙인다. 55KB 파일이라 sed로만 읽는다(JSON 파싱 생략).
cfg="$HOME/.claude.json"
plan=""
if [ -f "$cfg" ]; then
  plan=$(sed -n 's/.*"organizationRateLimitTier"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$cfg" | head -1)
  [ -z "$plan" ] && plan=$(sed -n 's/.*"organizationType"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$cfg" | head -1)
  plan=${plan#default_}; plan=${plan#claude_}; plan=${plan//_/ }
  [ -n "$plan" ] && plan="$(printf %s "${plan:0:1}" | tr a-z A-Z)${plan:1}"
fi
badge_fmt="%s"; badge_text=""
if [ -n "$plan" ]; then
  badge_text="★ $plan"
  for win in "five_hour:5h:%H:%M" "seven_day:7d:%-m/%-d %H:%M"; do
    key=${win%%:*}; rest=${win#*:}; label=${rest%%:*}; tfmt=${rest#*:}
    blk=$(printf '%s' "$input" | grep -o "\"$key\":{[^}]*}")
    pct=$(printf '%s' "$blk" | sed -n 's/.*"used_percentage"[[:space:]]*:[[:space:]]*\([0-9.]*\).*/\1/p')
    rst=$(printf '%s' "$blk" | sed -n 's/.*"resets_at"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p')
    if [ -n "$pct" ]; then
      badge_text="$badge_text · $label ${pct%%.*}%"
      [ -n "$rst" ] && badge_text="$badge_text ↻$(date -d "@$rst" "+$tfmt" 2>/dev/null)"
    fi
  done
  badge_fmt="\033[1;30;48;5;214m %s \033[0m "
fi

# 백슬래시 경로(Windows) 대응
cwd=${cwd//\\//}
[ -z "$cwd" ] && cwd="$PWD"
folder=$(basename "$cwd" 2>/dev/null)
[ -z "$folder" ] && folder="$(basename "$PWD")"

# git 브랜치 조회 (옵셔널 락 스킵)
if [ -d "$cwd" ]; then
  branch=$(cd "$cwd" 2>/dev/null && git --no-optional-locks branch --show-current 2>/dev/null)
else
  branch=$(git --no-optional-locks branch --show-current 2>/dev/null)
fi
[ -z "$branch" ] && branch="no-git"

# 컨텍스트 사용률 방어 처리
case "$used_pct" in
  ''|null) used_pct=0 ;;
esac
pct_int=${used_pct%%.*}
case "$pct_int" in
  ''|*[!0-9]*) pct_int=0 ;;
esac

# 진행률 바 (10칸)
bar_len=10
filled=$(( pct_int * bar_len / 100 ))
[ "$filled" -gt "$bar_len" ] && filled=$bar_len
[ "$filled" -lt 0 ] && filled=0
empty=$(( bar_len - filled ))

bar=""
i=0
while [ "$i" -lt "$filled" ]; do bar="${bar}█"; i=$((i+1)); done
i=0
while [ "$i" -lt "$empty" ]; do bar="${bar}░"; i=$((i+1)); done

# 사용률 구간별 색상 (bright+bold 톤 — 가독성 우선)
if [ "$pct_int" -lt 50 ]; then
  color="\033[1;92m"   # bright green
elif [ "$pct_int" -lt 80 ]; then
  color="\033[1;93m"   # bright yellow
else
  color="\033[1;91m"   # bright red
fi
reset="\033[0m"
model_c="\033[1;96m"   # bright cyan
folder_c="\033[1;94m"  # bright blue
branch_c="\033[1;95m"  # bright magenta
sep="\033[0;90m│\033[0m"  # 구분자: 회색 세로선

# 컨텍스트 잔여율 (🧠) : remaining_percentage, 없으면 100 - 사용률
if command -v jq >/dev/null 2>&1; then
  rem_pct=$(printf '%s' "$input" | jq -r '.context_window.remaining_percentage // empty')
else
  rem_pct=$(printf '%s' "$cw" | sed -n 's/.*"remaining_percentage"[[:space:]]*:[[:space:]]*\([0-9.]*\).*/\1/p' | head -1)
fi
rem_int=${rem_pct%%.*}
case "$rem_int" in ''|*[!0-9]*) rem_int=$(( 100 - pct_int )) ;; esac

# 세션 누적 도구 사용 목록 ("🧩 a(s) → b(m) → c(a) → d(h) (n)", 최초 사용 순·중복 제거·전체 표시)
# - 기록원 = 훅 ~/.claude/hooks/record-skill.py 가 남기는 %TEMP%/claude-statusline-skills/<session_id>.txt
#   기록은 "s:이름" 접두어 형식, 표시는 "이름(s)" 접미어 : s=Skill m=MCP 서버 p=플러그인 제공 스킬·MCP a=서브에이전트 종류. h=훅 기록은 표시하지 않음(2026-09-22 지시, 기록은 유지). 세션 기록(jsonl)은 읽지 않는다.
#   구형 기록(접두어 없음)은 s:, "mcp:서버"는 m:서버 로 보정해 표시한다.
if command -v jq >/dev/null 2>&1; then
  sid=$(printf '%s' "$input" | jq -r '.session_id // empty')
else
  sid=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
sdir="$(cygpath -u "${TEMP:-/tmp}" 2>/dev/null || printf %s /tmp)/claude-statusline-skills"   # Windows TEMP 경로를 Git Bash 경로로
skill_text="-"
if [ -n "$sid" ] && [ -f "$sdir/$sid.txt" ]; then
  skills=$(awk 'NF { if ($0 ~ /^mcp:/) $0 = "m:" substr($0, 5); else if ($0 !~ /^[smpah]:/) $0 = "s:" $0; if ($0 ~ /^h:/) next; if (!seen[$0]++) print substr($0, 3) "(" substr($0, 1, 1) ")" }' "$sdir/$sid.txt")
  if [ -n "$skills" ]; then
    skill_n=$(printf '%s\n' "$skills" | wc -l | tr -d ' ')
    shown=$(printf '%s\n' "$skills" | paste -sd '|' - | sed 's/|/ → /g')
    skill_text="$shown ($skill_n)"
  fi
fi
brain_c="\033[1;93m"   # bright yellow
skill_c="\033[1;97m"   # bright white
effort_c="\033[1;38;5;208m"  # bold orange

# 추론 effort (💪) : effort.level(low·medium·high·xhigh·max). 미지원 모델은 필드가 없으므로 배지처럼 형식 조각째 생략
effort=$(printf '%s' "$input" | grep -o '"effort"[[:space:]]*:[[:space:]]*{[^}]*}' | sed -n 's/.*"level"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
effort_fmt="%s"
[ -n "$effort" ] && effort_fmt="${sep} ${effort_c}💪 %s${reset} "
# 진행 중 단계(▶ 결론 Fable 5.1·high) : subagent-statusline.mjs 가 갱신 틱마다 쓰는 <session_id>.phase.json, 10초 넘게 갱신이 없으면 종료로 보고 형식 조각째 생략
phase=""
pf="$sdir/$sid.phase.json"
if [ -n "$sid" ] && [ -f "$pf" ] && [ $(( $(date +%s) - $(stat -c %Y "$pf" 2>/dev/null || echo 0) )) -le 10 ]; then
  if command -v jq >/dev/null 2>&1; then
    phase=$(jq -r '[.running[]? | "\(.phase) \(.model)" + (if .effort then "·\(.effort)" else "" end)] | join(" + ")' "$pf" 2>/dev/null)
  else
    phase=$(grep -o '"phase":"[^"]*","agent":"[^"]*","model":"[^"]*","effort":\("[^"]*"\|null\)' "$pf" | sed 's/"phase":"\([^"]*\)","agent":"[^"]*","model":"\([^"]*\)","effort":"\{0,1\}\([^"]*\)"\{0,1\}/\1 \2·\3/; s/·null$//' | paste -sd '+' - | sed 's/+/ + /g')
  fi
fi
phase_c="\033[1;38;5;45m"  # bold cyan
phase_fmt="%s"
[ -n "$phase" ] && phase_fmt="${sep} ${phase_c}▶ %s${reset} "

printf "${badge_fmt}[${model_c}%s${reset}] ${effort_fmt}${phase_fmt}${sep} ${folder_c}📁 %s${reset} ${sep} ${branch_c}🌿 %s${reset} ${sep} ${color}[%s] %s%%${reset} ${sep} ${brain_c}🧠 %s%%${reset} ${sep} ${skill_c}🧩 %s${reset}\n" \
  "$badge_text" "$model" "$effort" "$phase" "$folder" "$branch" "$bar" "$pct_int" "$rem_int" "$skill_text"
