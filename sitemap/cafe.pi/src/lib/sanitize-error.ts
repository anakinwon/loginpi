// KISA IL(정보 누출) — API 에러 응답 정제 공통 헬퍼
// Supabase/Postgres 원시 에러(error.message)에는 테이블명·컬럼명·제약조건명 등
// 내부 스키마 정보가 포함될 수 있다. 클라이언트 응답에는 일반화된 메시지만 내보내고
// 원문은 서버 로그(console.error)에만 남긴다.
//
// 사용법:
//   return NextResponse.json(
//     { error: sanitizeError('api/foo/get', error) },
//     { status: 500 },
//   )

const DEFAULT_PUBLIC_MSG = '데이터 처리 중 오류가 발생했습니다'

export function sanitizeError(
  context: string,
  err: unknown,
  publicMsg: string = DEFAULT_PUBLIC_MSG,
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : (() => {
            try {
              return JSON.stringify(err)
            } catch {
              return String(err)
            }
          })()
  console.error(`[${context}] ${raw}`)
  return publicMsg
}
