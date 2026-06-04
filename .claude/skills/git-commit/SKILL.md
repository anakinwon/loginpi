---
name: git-commit
description: Commit changes to a Git repository. Git 변경사항을 분석하여 컨벤셔널 커밋 형식의 한국어 커밋 메시지를 자동으로 생성합니다. 사용자가 커밋 메시지, git add, git commit 명령어를 입력하면, 변경사항을 분석하여 커밋 메시지를 생성하고, git add 및 git commit 명령어를 실행하여 변경사항을 커밋합니다.
---

# Git 커밋 메시지 생성기

## 개요

이 스킬은 Git 변경사항을 분석하여 컨벤셔널 커밋(Conventional Commit) 형식의 한국어 커밋 메시지를 자동으로 생성하는 기능을 제공합니다. 

## 언제 사용하나요?

다음과 같은 경우에 이 스킬을 사용하세요:
- 사용자가 "커밋 메시지 만들어 줘" 요청
- "git commit" 작업 진행 중
- "변경사항 요약해 줘" 요청
- git diff 결과를 분석해야 할 때

## 작동 방식

### 1단계: 변경사항 분석

먼저 git diff 를 실행하여 변경사항을 확인합니다:
```bash
git diff --staged
```
