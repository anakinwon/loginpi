import nextCWV from 'eslint-config-next/core-web-vitals'
import nextTS from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = [
  {
    // 앱 코드 아님 — lint 제외: 에이전트 워크트리 잔재·문서 빌드 스크립트(require 사용)
    ignores: ['.claude/**', '**/.pptx-build/**', '.whitepaper-build/**'],
  },
  ...nextCWV,
  ...nextTS,
  prettier,
  {
    rules: {
      // react-hooks@5 신규 규칙 — 기존 코드 패턴(setLoading in fetch effect 등)과
      // 충돌하므로 별도 리팩토링 이슈로 분리, 현재는 경고만 표시
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

export default eslintConfig
