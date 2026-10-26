// 시험 전용 해석 훅 — src 의 확장자 없는 상대 import('./core')를 .ts 로 찾는다(앱 번들러와 같은 규칙). 실행 : package.json test 스크립트가 --import 로 건다
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (!spec.startsWith('.') || spec.endsWith('.ts')) throw e
      return next(`${spec}.ts`, ctx)
    }
  },
})
