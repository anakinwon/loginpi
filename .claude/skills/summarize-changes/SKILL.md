# 주요 지침 (필수)
---
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
---

## Current changes

!`git diff HEAD`

## Instructions

Summarize the changes above in two or three bullet points, then list any risks you notice such as missing error handling, hardcoded values, or tests that need updating. If the diff is empty, say there are no uncommitted changes.






# 참조 콘텐츠는 Claude가 현재 작업에 적용하는 지식을 추가합니다. 
# 규칙, 패턴, 스타일 가이드, 도메인 지식. 
# 이 콘텐츠는 인라인으로 실행되므로 Claude가 대화 컨텍스트와 함께 사용할 수 있습니다.
---
name: api-conventions
description: API design patterns for this codebase
---

When writing API endpoints:
- Use RESTful naming conventions
- Return consistent error formats
- Include request validation




# 작업 콘텐츠는 배포, 커밋 또는 코드 생성과 같은 특정 작업에 대한 
# 단계별 지침을 제공합니다. 이는 Claude가 자동으로 실행하도록 하기보다는 
# /skill-name으로 직접 호출하려는 작업입니다. 
# disable-model-invocation: true를 추가하여 
# Claude가 자동으로 트리거하는 것을 방지합니다.

---
name: deploy
description: Deploy the application to production
context: fork
disable-model-invocation: true
---

Deploy the application:
1. Run the test suite
2. Build the application
3. Push to the deployment target



# markdown 콘텐츠 외에도, 
# SKILL.md 파일 상단의 --- 마커 사이의 YAML frontmatter 필드를 사용하여 
# skill 동작을 구성할 수 있습니다:

---
name: my-skill
description: What this skill does
disable-model-invocation: true
allowed-tools: Read Grep
---

Your skill instructions here...




# 인덱싱된 인수는 shell 스타일 인용을 사용하므로 다중 단어 값을 따옴표로 감싸서 
# 단일 인수로 전달합니다. 예를 들어, /my-skill "hello world" second는 $0을 
# hello world로, $1을 second로 확장합니다. $ARGUMENTS 플레이스홀더는 
# 항상 입력한 전체 인수 문자열로 확장됩니다.

---
name: session-logger
description: Log activity for this session
---

Log the following to logs/${CLAUDE_SESSION_ID}.log:

$ARGUMENTS



# 이 예제는 사용자만 트리거할 수 있는 배포 skill을 생성합니다. 
# disable-model-invocation: true 필드는 Claude가 자동으로 실행하는 것을 방지합니다:

---
name: deploy
description: Deploy the application to production
disable-model-invocation: true
---

Deploy $ARGUMENTS to production:

1. Run the test suite
2. Build the application
3. Push to the deployment target
4. Verify the deployment succeeded



# 이 skill은 skill을 호출할 때마다 Claude가 승인을 요청하지 않고
# git 명령어를 실행할 수 있게 합니다:

---
name: commit
description: Stage and commit the current changes
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
---


# 이 skill은 GitHub 이슈를 번호로 수정합니다. 
# $ARGUMENTS 플레이스홀더는 skill 이름 뒤에 오는 모든 것으로 대체됩니다:

---
name: fix-issue
description: Fix a GitHub issue
disable-model-invocation: true
---

Fix GitHub issue $ARGUMENTS following our coding standards.

1. Read the issue description
2. Understand the requirements
3. Implement the fix
4. Write tests
5. Create a commit


# 인수를 사용하여 skill을 호출하지만 skill에 $ARGUMENTS가 포함되지 않으면, 
# Claude Code는 ARGUMENTS: <your input>을 skill 콘텐츠의 끝에 추가하므로 
# Claude는 여전히 입력한 내용을 봅니다.
# 위치별로 개별 인수에 액세스하려면 $ARGUMENTS[N] 또는 더 짧은 $N을 사용합니다:

---
name: migrate-component
description: Migrate a component from one framework to another
---

Migrate the $ARGUMENTS[0] component from $ARGUMENTS[1] to $ARGUMENTS[2].
Preserve all existing behavior and tests.


# /migrate-component SearchBar React Vue를 실행하면 
# $ARGUMENTS[0]을 SearchBar로, $ARGUMENTS[1]을 React로, 
# $ARGUMENTS[2]를 Vue로 대체합니다. $N 약자를 사용하는 동일한 skill:


---
name: migrate-component
description: Migrate a component from one framework to another
---

Migrate the $0 component from $1 to $2.
Preserve all existing behavior and tests.





# 고급 패턴
​
# 동적 컨텍스트 주입
# !`<command>` 구문은 skill 콘텐츠가 Claude로 전송되기 전에 
# shell 명령어를 실행합니다. 명령어 출력이 플레이스홀더를 대체하므로 
# Claude는 명령어 자체가 아닌 실제 데이터를 받습니다.
# 이 skill은 GitHub CLI를 사용하여 라이브 PR 데이터를 가져와 
# pull request를 요약합니다. 
# !`gh pr diff` 및 기타 명령어가 먼저 실행되고, 출력이 프롬프트에 삽입됩니다:


---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...


# 이 skill은 forked Explore 에이전트에서 연구를 실행합니다. 
# skill 콘텐츠는 작업이 되고, 에이전트는 코드베이스 탐색에 최적화된 
# 읽기 전용 도구를 제공합니다:

---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references


