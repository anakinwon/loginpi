// 시험용 모듈 해석 훅 — src/*.ts 가 번들러 방식(확장자 없는 './merge')으로 서로 import 하므로, 못 찾으면 '.ts' 를 붙여 다시 찾는다
// 사용 : node --import ./test/ts-register.mjs --test "test/*.test.mjs" (package.json test)
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx)
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && spec.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(spec)) return next(`${spec}.ts`, ctx)
    throw e
  }
}
