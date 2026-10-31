# schema.pi 다국어 백로그 (하드코딩 한글)

> 2026-10-31 2차 구축(D8) — 공통 화면(레이아웃·홈·로그인·소개·대시보드·분류체계 목록·계정 연동·하단 메뉴)은 `messages/ko.json` 으로 옮기고 67개 언어로 번역했습니다. 아래는 아직 한글이 코드에 남은 화면·모듈입니다(외국어 화면에서도 한국어로 보임).
> 생성 : `corepack pnpm@11.4.0 i18n:audit --md docs/I18N_BACKLOG.md` (주석 제외, 이 파일을 통째로 다시 씁니다 — 머리말도 다시 붙일 것). 기준·규칙 : 루트 `docs/I18N_STANDARD.md` 5.5·7·9절.
>
> 처리 순서 권장 : ① `src/lib/api.ts` 오류 문구 → `code` + 화면 `t('apiErrors.<code>')`(표준 7절) ② 메뉴 화면(words·domains·terms → model·erd·physical → 나머지) ③ `src/lib/*` 의 AI 프롬프트·DB 저장값·DDL 주석처럼 번역하면 안 되는 한글은 줄 끝 `// i18n-ignore` 로 표시.
> 함께 남은 일 : 분류체계 화면(`/areas/*`)에는 언어 스위처가 없습니다(홈·계정 연동에만 있음, 고른 언어는 모든 화면에 적용됨).

| 파일 | 건수 | 첫 예시 |
|---|---|---|
| `src/app/[locale]/areas/[areaId]/model/page.tsx` | 188 | 61: 금칙어 포함 |
| `src/app/[locale]/areas/[areaId]/erd/page.tsx` | 187 | 83: IE 표기(ERwin) |
| `src/app/[locale]/areas/[areaId]/monitor/app-tab.tsx` | 161 | 22: 요청 수 |
| `src/lib/api.ts` | 160 | 11: 입력값이 올바르지 않습니다 |
| `src/lib/modelpi/logical.ts` | 121 | 47: 주식별자 |
| `src/app/[locale]/areas/[areaId]/sql/page.tsx` | 118 | 38: 편집기 불러오는 중… |
| `src/app/[locale]/areas/[areaId]/model/relations.tsx` | 116 | 45: N:M 관계는 식별 불가 |
| `src/app/[locale]/areas/[areaId]/physical/page.tsx` | 115 | 70: 추가 테이블 |
| `src/app/[locale]/areas/[areaId]/ddl/conn-panel.tsx` | 109 | 107: 실패 |
| `src/app/[locale]/areas/[areaId]/logical/page.tsx` | 108 | 92: 1정규형 |
| `src/app/[locale]/areas/[areaId]/model/attrs.tsx` | 107 | 26: 컬럼명 |
| `src/app/[locale]/areas/[areaId]/domains/domain-board.tsx` | 99 | 42: 코드 |
| `src/app/[locale]/areas/[areaId]/words/word-board.tsx` | 96 | 159: 재신청을 접수했습니다 |
| `src/app/[locale]/areas/[areaId]/plan/page.tsx` | 87 | 25: 승인 |
| `src/lib/sql-obj.ts` | 87 | 62: 컬럼명 |
| `src/app/[locale]/areas/[areaId]/approvals/approval-board.tsx` | 81 | 10: 대표도메인 지정 |
| `src/app/[locale]/areas/[areaId]/reverse/page.tsx` | 75 | 55: 완전일치 |
| `src/lib/mon.ts` | 73 | 85: 메인 대시보드 |
| `src/app/[locale]/areas/[areaId]/codes/page.tsx` | 71 | 103: 재신청을 접수했습니다 |
| `src/app/[locale]/areas/[areaId]/terms/term-board.tsx` | 68 | 46: 단어 2개 이상으로 구성해야 합니다 |
| `src/app/[locale]/areas/[areaId]/erd/versions.tsx` | 62 | 25: 추가 |
| `src/app/[locale]/areas/[areaId]/monitor/fix-tab.tsx` | 62 | 45: 전체 |
| `src/lib/mon-fix.ts` | 61 | 18: 무엇을 왜 바꿨는지 2~3문장(PR 설명용) |
| `src/app/[locale]/areas/[areaId]/entity-classes/page.tsx` | 56 | 92: 형식 : _ + 영문 대문자·숫자 1~4자 |
| `src/app/[locale]/areas/[areaId]/bulk/page.tsx` | 54 | 10: 표준단어 |
| `src/app/[locale]/areas/[areaId]/ddl/req-panel.tsx` | 54 | 30: 승인대기 |
| `src/app/[locale]/areas/[areaId]/ddl/page.tsx` | 52 | 188: 실행을 요청했습니다 — 다른 승인권자(시스템담당자·데이터아키텍트)가 승인 |
| `src/lib/bulk.ts` | 50 | 21: 공통표준단어명 |
| `src/lib/roles.ts` | 50 | 18: 시스템담당자 |
| `src/app/[locale]/areas/[areaId]/key-domains/key-domain-board.tsx` | 49 | 66: 오류 |
| `src/app/[locale]/areas/[areaId]/sql/sql-obj.tsx` | 49 | 33: 권한 |
| `src/lib/modelpi/normalize.ts` | 49 | 94: N:M 관계( |
| `src/app/[locale]/areas/[areaId]/model/ent-form.tsx` | 45 | 32: 금칙어 포함 |
| `src/lib/bulk-check.ts` | 44 | 21: 이미 등록된 이름(건너뜀) |
| `src/lib/mon-ai.ts` | 44 | 22: 무슨 일이 일어났는지 1~2문장 요약 |
| `src/app/[locale]/areas/[areaId]/forbidden/page.tsx` | 43 | 22: 금칙어 |
| `src/app/[locale]/areas/[areaId]/model/stage-bar.tsx` | 42 | 79: — 작성완료하면 편집이 잠깁니다(완료 취소 후 편집). 계속할까요? |
| `src/app/[locale]/areas/[areaId]/settings/ai-mdl-form.tsx` | 42 | 20: 모델 이름(OpenAI 콘솔 기준) |
| `src/lib/modelpi/docs.ts` | 39 | 7: 엔터티정의서 |
| `src/app/[locale]/areas/[areaId]/codes/code-dtl.tsx` | 38 | 47: 코드기본을 먼저 고르십시오 |
| `src/app/[locale]/areas/[areaId]/check/page.tsx` | 37 | 30: 단어 |
| `src/app/[locale]/areas/[areaId]/members/page.tsx` | 37 | 20: 승인 |
| `src/app/[locale]/areas/[areaId]/sql/result-grid.tsx` | 37 | 30: 성공 |
| `src/app/[locale]/areas/[areaId]/sql/sql-tabs.tsx` | 34 | 17: 요청이 실패했습니다 |
| `src/app/[locale]/areas/[areaId]/monitor/verify-panel.tsx` | 33 | 22: 운영 배포 중 |
| `src/lib/modelpi/ddl.ts` | 29 | 79: 물리 모델 DDL — |
| `src/lib/modelpi/phy.ts` | 29 | 69: 최종수정일시 |
| `src/app/[locale]/areas/[areaId]/history/page.tsx` | 27 | 29: (없음) |
| `src/lib/std-check.ts` | 26 | 17: 표준단어 2개 이상 |
| `src/app/[locale]/areas/[areaId]/monitor/url-tab.tsx` | 25 | 13: 성공 |
| `src/app/[locale]/areas/[areaId]/monitor/db-tab.tsx` | 24 | 39: PostgreSQL 서버 직접(SRV) 접속이 없습니다 — 설정 → DB |
| `src/lib/model-ddl-req.ts` | 23 | 71: 접속명에 접속 문자열·비밀번호를 넣지 마십시오 |
| `src/lib/modelpi/project-ai.ts` | 23 | 11: 업종 템플릿 |
| `src/app/[locale]/areas/[areaId]/monitor/fix-steps.tsx` | 20 | 5: 수정안 요청 |
| `src/lib/model-ddl.ts` | 19 | 43: 엔터티가 삭제됨 |
| `src/lib/sql-run.ts` | 19 | 60: 대기 문장 합계는 100만 자까지 |
| `src/app/[locale]/areas/[areaId]/monitor/srv-tab.tsx` | 18 | 45: 이 분류체계에 등록된 로컬 에이전트(설정 → DB 접속)가 1분마다 보내 |
| `src/app/[locale]/areas/[areaId]/settings/area-form.tsx` | 18 | 8: 표준단어 |
| `src/lib/modelpi/stage.ts` | 18 | 5: 작성중 |
| `src/app/[locale]/areas/[areaId]/settings/item-table.tsx` | 17 | 18: 도메인그룹 |
| `src/lib/modelpi/dbms.ts` | 17 | 28: 본질 식별자 또는 NUMBER + 시퀀스, PK_테이블명 |
| `src/app/[locale]/areas/[areaId]/monitor/charts.tsx` | 15 | 36: 추이 |
| `src/app/[locale]/areas/[areaId]/monitor/page.tsx` | 15 | 19: 애플리케이션 |
| `src/lib/modelpi/entity-ai.ts` | 15 | 13: 추가할 논리 엔터티 후보 6~8개 |
| `src/lib/modelpi/template.ts` | 12 | 17: 정보 |
| `src/app/[locale]/areas/[areaId]/settings/page.tsx` | 10 | 13: 약어 |
| `src/lib/model-stage.ts` | 10 | 55: 이 프로젝트의 엔터티가 아닙니다 |
| `src/lib/mon-srv.ts` | 9 | 145: 주소 형식 오류 |
| `src/lib/std-code-rule.ts` | 9 | 4: 구분코드 |
| `src/lib/model-name.ts` | 8 | 15: 실체 |
| `src/lib/modelpi/phy-sync.ts` | 7 | 68: 물리 모델 변경분 DDL — |
| `src/lib/mon-fix-patch.ts` | 7 | 26: 수정 |
| `src/lib/secret.ts` | 7 | 12: DB_PROFILE_KEY 미설정 — 이 배포에 환경변수가 없습니다(Ve |
| `src/lib/model-phy.ts` | 6 | 114: 삭제된 칼럼 참조 |
| `src/env.ts` | 5 | 10: PI_SESSION_SECRET는 최소 32자 이상이어야 합니다 |
| `src/lib/modelpi/ddl-parse.ts` | 5 | 167: : 괄호가 닫히지 않음 |
| `src/lib/modelpi/logical-ent.ts` | 5 | 33: 이력 |
| `src/app/[locale]/areas/[areaId]/sql/sql-obj-erd.tsx` | 4 | 40: 관계도에 그릴 테이블이 없습니다. |
| `src/app/[locale]/dev-user-switch.tsx` | 4 | 14: (없음) |
| `src/lib/modelpi/nm.ts` | 4 | 21: 관계 |
| `src/lib/modelpi/rvs.ts` | 4 | 12: -- Oracle·Tibero 카탈로그 조회(현재 스키마) — 결과를 C |
| `src/lib/modelpi/sql-split.ts` | 4 | 143: WHERE 없는 UPDATE·DELETE(전체 행) |
| `src/app/[locale]/areas/[areaId]/domain-groups/page.tsx` | 3 | 13: ← 분류체계 목록 |
| `src/lib/sql-tab.ts` | 3 | 45: 현재 요금제( |
| `src/lib/std-code.ts` | 3 | 160: 자기 승인(등록 즉시) |
| `src/app/[locale]/areas/[areaId]/approvals/page.tsx` | 2 | 14: ← 분류체계 목록 |
| `src/app/[locale]/areas/[areaId]/domains/page.tsx` | 2 | 10: ← 분류체계 목록 |
| `src/app/[locale]/areas/[areaId]/key-domains/page.tsx` | 2 | 10: ← 분류체계 목록 |
| `src/app/[locale]/areas/[areaId]/monitor/use-poll.ts` | 2 | 19: 불러오지 못했습니다 |
| `src/app/[locale]/areas/[areaId]/terms/page.tsx` | 2 | 10: ← 분류체계 목록 |
| `src/app/[locale]/areas/[areaId]/words/page.tsx` | 2 | 10: ← 분류체계 목록 |
| `src/lib/approval.ts` | 2 | 158: 자기 승인(등록 즉시) |
| `src/lib/db-exec.ts` | 2 | 110: 실행 시간 예산 초과 — 다시 실행하십시오 |
| `src/lib/modelpi/erd.ts` | 2 | 21: — 논리 모델(schema.pi ModelPi) |
| `src/lib/payments.ts` | 1 | 75: PI_API_KEY 미설정 |

합계 3935건 · 파일 95개 (pi-i18n audit, 2026-10-31)
