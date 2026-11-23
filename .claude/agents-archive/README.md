# 보관 에이전트 (로드되지 않음)

2026-11-23 `.claude/agents/` 에서 옮겨 온 Ruflo(claude-flow) 템플릿 에이전트 17개(sparc 4·swarm 3·testing 2·consensus 7·core 1).

- 사유 : ECC 플러그인(`ecc@ecc` 2.2.3, 에이전트 72개) 설치 뒤 사용자 정의 에이전트 수가 상한(약 100개, 실측 추정)을 넘어,
  이름순 뒤쪽의 저장소 에이전트 15개(teamAnakin 6종 포함)가 오류 없이 로드되지 않았다. 호출 이력이 없는 템플릿을 빼서 자리를 확보.
- 복원 : `git mv .claude/agents-archive/<폴더> .claude/agents/<폴더>` 후 Claude Code 재시작. 로드 총수(ECC + 저장소)가 상한을 넘지 않는지 먼저 확인할 것.
