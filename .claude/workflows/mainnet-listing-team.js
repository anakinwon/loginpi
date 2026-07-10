export const meta = {
  name: 'mainnet-listing-team',
  description: '파이앱 메인넷 등록팀 — 레드라인 감사·체크리스트 검증·제출 패키지·P0 시나리오 병렬 점검',
  phases: [
    { title: '점검', detail: '4개 역할 병렬 조사' },
  ],
}

const FINDINGS = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '핵심 결론 3문장 이내' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['OK', 'WARN', 'BLOCK'] },
          detail: { type: 'string' },
          action: { type: 'string', description: '필요 조치 (없으면 빈 문자열)' },
        },
        required: ['title', 'status', 'detail', 'action'],
      },
    },
  },
  required: ['summary', 'items'],
}

phase('점검')

const COMMON = `작업 디렉토리: C:\\Users\\anaki\\workspace\\cafe-pi-claude (Next.js 16 + Supabase, Pi Network 앱 cafe.pi).
운영 URL: https://cafepi.vercel.app · staging: https://loginpi.vercel.app.
staging DB 접근: .env.local의 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY로 @supabase/supabase-js 사용(프로젝트 루트에서 node 스크립트 실행 — ESM .mjs, 프로젝트 node_modules 사용. 임시 스크립트는 프로젝트 루트에 tmp-*.mjs로 만들고 실행 후 삭제).
⛔절대 금지: 운영/staging에 테스트 데이터 생성·코드 수정·커밋. 조사(읽기)만 수행.
외부 페이지는 node https(maxHeaderSize 1MB)로 fetch 가능.`

const results = await parallel([
  () => agent(`${COMMON}

너는 Pi 메인넷 등재 심사 레드라인 감사관이다. cafe.pi가 등재 거절 사유에 걸릴 노출이 있는지 실측하라.
레드라인 4종: ①도박·베팅 ②Pi 외 통화 표시(법정화폐 가격·환율·시세) ③Pi 외 로그인 강제 ④Pi 브랜딩 오용(도메인/앱명 pi 접두, 공식 로고 무단 사용).
추가 위험: "Bean Token/토큰 발행/투자/수익" 표현 노출(운영은 포인트 순화 방침).

방법:
1) 운영 공개 페이지 실측: https://cafepi.vercel.app/ko (홈), /ko/store, /ko/chat, /ko/board/notice 의 HTML을 fetch해 금지 표현 검색 — 시세/환율/원화(₩,KRW,USD)/베팅/Bet/투자/수익 보장/Bean Token/토큰 발행.
2) 코드 확인: src에서 computeShowPiValuation 게이트 적용 3곳(헤더 시세칩·store 통화콤보·language-switcher) 연결 여부 grep, PiBet/베팅 잔재 grep.
3) 각 발견을 OK/WARN/BLOCK으로 판정. BLOCK=등재 거절 직결, WARN=심사관 재량 위험.
docs/PRD_23_FUNC_TUNING.md의 절제 방침과 대조하라.`, { label: 'redline-auditor', schema: FINDINGS }),

  () => agent(`${COMMON}

너는 메인넷 등재 체크리스트 검증관이다. 제출 전 미완 항목을 실측으로 확정하라.
방법:
1) staging DB의 mainnet_checklist 테이블 전 행 조회(컬럼: item_key, sect_nm, title, prio_cd, status_cd, note_txt, del_yn) — del_yn='N'만. status_cd별 집계 + TODO/DOING 항목 전체 나열.
2) docs/MAINNET_READINESS_CHECKLIST.md를 읽고 DB와 불일치(문서엔 있는데 DB에 없거나 상태 다름) 확인.
3) 각 미완 항목이 "마스터 수작업(포털/외부)"인지 "코드/문서 작업(세션 가능)"인지 분류.
4) 등재 신청 제출을 막는 진짜 차단 요소(BLOCK)와 제출 후 해도 되는 것(WARN/OK)을 구분.`, { label: 'checklist-verifier', schema: FINDINGS }),

  () => agent(`${COMMON}

너는 등재 신청 제출 패키지 담당자다. Pi Developer Portal 제출에 필요한 자료의 준비 상태를 점검하고 제출 초안 값을 정리하라.
방법:
1) docs/PI_LISTING_TECH_APPENDIX_EN.md 와 docs/PI_등재_기술부록.md 를 읽고 최신성 점검(스테일 내용·현재와 다른 기술 설명 여부 — 예: 활성 locale 수, fee_mode, Pi Sign-In 반영 여부).
2) 제출 필드 초안 작성: 앱 이름(브랜딩 규정 고려 — pi 접두 금지), 짧은 설명(EN 1~2문장), 카테고리 제안, 운영 URL, 지원 이메일, 개인정보처리방침·이용약관 URL(/docs/legal/privacy·/docs/legal/terms 실존 확인 — 운영 fetch로 200 확인).
3) 스크린샷 후보 화면 목록 제안(홈·카페·상점·결제 흐름 — 촬영은 마스터).
각 항목 준비 상태를 OK/WARN/BLOCK으로.`, { label: 'submission-packager', schema: FINDINGS }),

  () => agent(`${COMMON}

너는 P0 실기기 검증 시나리오 설계자다. 등재 신청 전 마스터가 Pi Browser 실기기로 수행할 최종 검증 시트를 만들어라.
방법:
1) docs/TROUBLESHOOT.md에서 2026-07-02·07-08 실기기 검증 기록을 읽고 이미 검증된 여정(로그인 3종·결제·딥링크·텔레그램)과 이번에 재확인할 것을 구분.
2) 최근 배포 변경분(채팅 폴링 수정·CSV 내보내기·법무 문서) 중 실기기 확인 필요 항목 식별.
3) 산출: 순서 있는 실기기 체크 시나리오 10~15단계(각 단계=행동+기대 결과+실패 시 의미). 소요 15분 이내로 압축.
items의 각 항목 = 시나리오 1단계(title=단계명, detail=행동+기대결과, status=OK 고정, action=실패 시 조치).`, { label: 'p0-device-planner', schema: FINDINGS }),
])

return {
  redline: results[0],
  checklist: results[1],
  submission: results[2],
  p0plan: results[3],
}