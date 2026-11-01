'use client'

// 기능 페이지 공통 상단 — 내 연결(schema.pi 분류체계)·접속 선택, 선택값은 URL ?link=&conn= (계약 docs/BUILD_CONTRACT.md 2.3)
//  [자리표시] F1b(dbms-link) 가 실제 구현으로 교체한다 — props·URL 규칙은 바꾸지 않는다
export type LinkSelection = { linkId: string | null; connId: string | null }

export function LinkPicker({
  needConn = true,
  onChange,
}: {
  needConn?: boolean
  onChange?: (s: LinkSelection) => void
}) {
  void needConn
  void onChange
  return null
}
