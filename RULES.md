# RULES.md — cafe-pi-claude 절대 규칙 (빠른 참조)

> CLAUDE.md 핵심 제약의 요약본. **상세 맥락·근거는 항상 [CLAUDE.md](./CLAUDE.md)가 정본.**
> 충돌 시 CLAUDE.md를 따른다.

---

## ⭐ 최우선 가치 (절대 훼손 금지)

1. **Pi Browser에서 Pi 계정으로 로그인할 수 있어야 한다.**
2. **Pi Browser에서 Pi 계정으로 결제할 수 있어야 한다.**

인증·페이지·기능 변경은 **Pi Browser 실기기에서 로그인·결제·채팅 접속을 검증**한 뒤에만 완료로 간주한다.

---

## 🚫 절대 금지

| 금지 항목 | 이유 |
|---|---|
| `getSessionUser()` null 시 `redirect()` 사용 | Pi Browser에서 무한 리다이렉트 루프 발생 |
| 인증 필요 API에서 쿠키만 검증 | Pi Browser WebView는 `Set-Cookie`를 저장하지 않음 |
| 클라이언트가 보낸 결제 금액(amount) 신뢰 | `/payments/complete`에서 반드시 서버 DB 가격과 재검증 |
| 논리삭제 대상 테이블에 물리 `DELETE` | `del_yn='Y'` 논리삭제만 허용 |
| 쿠키 외 경로가 없는 인증 페이지 보호 | Pi Browser에서 구조적으로 동작 불가 |
| API 키·토큰·시크릿·시스템 경로를 출력/커밋에 포함 | 보안 |
| 테스트·타입체크 미통과 변경 제출 | `pnpm tsc --noEmit` + `pnpm lint` 통과 필수 |
| `da-ddl-guard` 등 검증 훅 우회 | DA 표준 강제 |

---

## ✅ 필수 패턴

### 인증

```ts
// 서버: 쿠키 OR X-Pi-Token 헤더 양쪽 자동 지원
const user = await getSessionUser()

// 클라이언트: Pi Browser 쿠키 비의존 fetch
await piFetch('/api/...') // X-Pi-Token 헤더 자동 첨부
```

### 인증 필요 서버 컴포넌트 페이지

```tsx
// 쿠키로 신원을 못 찾으면 redirect 대신 클라이언트 게이트로 위임
if (!user) return <ClientGateComponent />
```

### Pi 결제 금액 검증

```ts
// /payments/complete 에서 반드시 서버 DB 가격과 재비교
if (Number(payment.amount) + 1e-6 < planRow.price_pi) {
  return NextResponse.json({ error: '결제 금액 불일치' }, { status: 400 })
}
```

---

## 코드 스타일

- 들여쓰기 **2칸**, 세미콜론 **없음**, **작은따옴표**
- 자동 포맷: `pnpm format` (Tailwind 클래스 순서 정렬 포함)
- 새 파일 후 타입 체크: `pnpm tsc --noEmit`

## DB 규칙 (DA 표준)

- 시스템 컬럼 4개 필수: `regr_id`, `reg_dtm`, `modr_id`, `mod_dtm`
- 논리삭제: `del_yn CHAR(1)` + `del_dtm TIMESTAMPTZ` — 물리 `DELETE` 절대 금지
- `sql/*.sql` 작성 시 `da-ddl-guard` Hook 자동 검사 → 위반 차단 (정본: `docs/da/데이터표준규칙.md`)

## Supabase

- RLS **비활성화** — 모든 접근은 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`
- 클라이언트에서 anon key 직접 사용 금지
- 단건 조회: `.maybeSingle()` (`.single()`은 결과 없을 때 에러)
