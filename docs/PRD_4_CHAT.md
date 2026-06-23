# PRD_CHAT.md — PiCafé: 테마 기반 Pi Network 카페 플랫폼

> **작성일**: 2026-06-07
> **버전**: v1.5
> **상태**: 설계 완료 (Phase 7~9 구현 대기) · Phase 10 글로벌 동시통역 추가 · 번역 엔진 하이브리드 전략 확정

---

## 1. 제품 개요

### 제품명

**PiCafé** — 테마 기반 Pi Network 카페 플랫폼

### 한 줄 요약

내가 좋아하는 테마(여행·골프·먹방...)를 선택하고, 같은 관심사 Pi 사용자들과 카페하면서 Pi를 자연스럽게 주고받는 라이프스타일 커뮤니티.

### 핵심 차별점

| # | 차별점 | 설명 |
|---|---|---|
| 1 | **테마 퍼스트** | 카페 개설 전 테마 선택 → 전용 스티커·AI 봇·배지 자동 세팅 |
| 2 | **Pi 마이크로 트랜잭션** | 카페 중 Pi Tip·스티커·AI 기능 단건 결제 (0.01~5 Pi) |
| 3 | **인라인 구매 UX** | 카페창을 벗어나지 않고 구매 완료 — 흐름 단절 없음 |
| 4 | **KYC 기반 신뢰** | Pi Network 인증 사용자만 참여 — 익명 도배·스팸 방지 |
| 5 | **글로벌 동시통역 (PiTranslateâ¢™)** | 어떤 언어로 보내도 내가 선택한 언어로 즉시 통역 — 언어 장벽 제로 |

### 배경 및 목적

Pi Network는 글로벌 KYC 기반 사용자 베이스를 보유하고 있으나, Pi를 실질적으로 소비하는 서비스 생태계가 부족하다. PiCafé는 Pi의 마이크로 트랜잭션 특성과 커뮤니티 카페를 결합해 **Pi 소비 생태계의 핵심 허브**를 목표로 한다.

---

## 1-1. 왜 Pi를 내면서까지 이 서비스를 쓰는가?

> 이 질문에 답하지 못하면 비즈니스 전체가 성립하지 않는다.
> Discord·Telegram·카카오톡이 무료인데, 왜 Pi를 지불하면서 PiCafé에서 카페를 만드는가?

---

### 이유 1. "진짜 사람"들만 있는 공간은 세상에 없다

기존 카페 플랫폼의 근본 문제는 **익명성**이다. 봇, 가짜 계정, 사기꾼이 섞여 있어 누구도 믿기 어렵다.

Pi Network는 KYC(신원 인증)를 완료한 사람만 계정을 갖는다. PiCafé의 모든 참가자는 **실명 인증된 실제 인물**이다. 이 신뢰의 가치는 0.1 Pi를 훨씬 초과한다.

- 골프 방에서 "이 클럽 어때요?"라고 물었을 때, 응답자가 실제 골퍼라는 걸 믿을 수 있다
- 투자 방에서 조언을 주는 사람이 신원 인증된 실제 인물이다
- 이벤트 방의 강사가 Pi KYC로 신원이 보증된다

**익명 플랫폼에서는 절대 살 수 없는 "신뢰"를 Pi로 구매하는 것이다.**

---

### 이유 2. Pi 보유자는 Pi를 "쓰고 싶다"

Pi를 채굴하거나 보유 중인 사람에게 **가장 급한 것은 Pi를 실제로 사용할 곳**이다. Pi 생태계에서 Pi를 소비하는 행위는 단순한 지출이 아니라 **생태계 참여이자 Pi 가치를 높이는 행동**이다.

| 시각 | 인식 |
|---|---|
| 일반 서비스 요금 | "왜 돈을 내야 해?" |
| Pi로 결제 | "Pi를 실제로 쓸 수 있는 곳이 생겼다!" |

Pi 사용자에게 0.1 Pi 결제는 부담이 아니라 **"내 Pi가 실제로 작동한다"는 증명**이다.

---

### 이유 3. 소액 진입 장벽이 커뮤니티 품질 자체를 보장한다

**0.1 Pi를 낸 방장**은 세 가지를 동시에 증명한다:

1. 진지하게 이 카페를 운영할 의지가 있다
2. Pi Network 생태계에 참여하는 실제 사용자다
3. 이 테마(골프·여행·먹방)에 실질적 관심이 있다

무료로 만든 방 1,000개 중 활성 방은 10개다. Pi를 낸 방 10개 중 활성 방은 7개다. **결제 행위 자체가 진지함의 필터다.**

---

### 이유 4. 테마 기반 자기 선택 — 관심사가 완벽히 일치하는 사람들

골프 테마방에 들어온 사람은 모두 골프에 관심이 있어서 스스로 선택한 사람들이다. 이 자기 선택(self-selection) 효과는 어떤 알고리즘보다 강력하다.

- 랜덤 카페: 관심사 다름 → 대화가 발산
- 테마방: 관심사 동일 → 대화가 깊어짐 → 지속 참여

**같은 관심사를 가진 KYC 인증 사람들과만 대화할 수 있는 공간**은 Pi 없이는 만들 수 없다.

---

### 이유 5. Pi Tip = 카페에서 경제적 보상이 발생한다

기존 카페 플랫폼에서 좋은 조언을 줘도 돌아오는 것은 "좋아요" 하나다. PiCafé에서는 **실제 Pi 보상**이 즉시 지급된다.

```
골프방 시나리오:
  사용자 A: "그립 잡는 법 알려주세요"
  전문가 B: [상세한 레슨 제공 + 영상 링크]
  사용자 A: [0.5 Pi Tip 전송] "감사합니다!"
```

이 경험이 한 번이라도 발생하면 **전문가 B는 이 방을 떠나지 않는다.** 좋은 콘텐츠를 만들수록 Pi 수입이 생기는 구조다.

---

### 이유 6. Business 사용자 — Pi로 실제 수익을 창출한다

개인 강사, 전문가, 인플루언서에게 PiCafé는 **Pi 수익 창출 채널**이다.

| 직군 | 활용 방식 | 수익 구조 |
|---|---|---|
| 골프 강사 | 라이브 레슨 이벤트방 | 입장료 0.5 Pi × 50명 = 25 Pi/회 |
| 여행 가이드 | 여행 정보 구독 방 | 입장료 0.2 Pi × 200명 = 40 Pi/월 |
| IT 개발자 | 코딩 스터디방 | Tip 누적 + 강의 입장료 |
| 투자 전문가 | 프리미엄 분석 방 | 구독 + 이벤트 수익 |

이들에게 5 Pi/월 Business 요금은 **수익 대비 투자**다. PiCafé가 없으면 이 수익 채널 자체가 없다.

---

### 이유 7. 디지털 소유감 — "내가 만든 커뮤니티"

Pi를 써서 만든 카페, 쌓인 배지, 모은 스티커는 **소유감**을 만든다. 무료 서비스에서는 느낄 수 없는 감각이다.

- 무료 방: "버려도 그만인 공간"
- Pi를 낸 방: "내가 투자한 커뮤니티 — 잘 키우고 싶다"

이 소유감이 방장의 **장기 운영 동기**를 만든다. Discord의 거대 서버들이 유지되는 이유도 서버 관리자들의 이 소유감이다.

---

### 이유 8. Pi 생태계 성장에 조기 참여 — 선점의 가치

Pi Network가 성장할수록 초기 커뮤니티 빌더의 위상은 높아진다. 지금 0.1 Pi로 만든 골프 방이 2년 후 1,000명 커뮤니티가 된다면, 그 방장의 Pi 배지와 방 운영 이력은 대체 불가한 자산이 된다.

**"이 방의 창업자"라는 타이틀은 돈으로 살 수 없다 — Pi로만 살 수 있다.**

---

### 결론: 사용자가 Pi를 내는 이유 한 줄 요약

> **Pi는 비용이 아니다. KYC 신뢰 + 테마 커뮤니티 + 경제적 보상 + 소유감을 한 번에 구매하는 것이다.**

Discord에서는 살 수 없는 "진짜 사람들과의 진지한 관계"에 Pi라는 적절한 가격이 붙어 있다. 그 가격이 너무 낮아서(0.1 Pi) 진입 장벽이 아니고, 너무 높지 않아서(5 Pi/월 최대) 지속 가능하다.

---

## 1-2. Discord와의 차별화 전략

> **전제**: PiCafé는 Discord를 이기려는 것이 아니다.
> Discord는 **게임·익명 커뮤니티** 시장을 지배한다.
> PiCafé는 **라이프스타일·실명·Pi 경제** 시장을 새로 정의한다.
> 경쟁이 아닌 **다른 시장의 창조**가 전략의 핵심이다.

---

### 포지셔닝 맵

```
             [익명성 높음]
                  │
   Telegram ──────┤
                  │
   Discord ───────┤──────────────────
                  │                 │
  [경제 없음] ────┼──────────────── [경제 있음]
                  │                 │
                  │       PiCafé ───┤
                  │                 │
             [실명·KYC]
```

Discord와 PiCafé는 **대각선 반대 사분면**에 위치한다. 같은 시장이 아니다.

---

### 1대1 기능 비교

| 항목 | Discord | PiCafé | 승자 |
|---|---|---|---|
| **신원 인증** | 익명 (이메일만) | KYC 실명 인증 | PiCafé — 신뢰 |
| **입장 비용** | 무료 | Pi 소액 (선택적) | Discord — 접근성 |
| **커뮤니티 수** | 수천만 개 | 초기 단계 | Discord — 규모 |
| **서버 품질** | 99% 방치 | 소액 필터로 진지한 방 유지 | PiCafé — 품질 |
| **발견·탐색** | 태그 검색 (품질 보증 없음) | 테마 마켓플레이스 (관심사 정렬) | PiCafé — 정확도 |
| **카페 내 결제** | 없음 | Pi Tip·스티커·AI 단건 결제 | PiCafé — 유일 |
| **창작자 수익** | 서버 구독 (플랫폼 30% 수수료) | Pi Tip 직접 수취 (수수료 최소) | PiCafé — 창작자 우선 |
| **AI 봇** | 범용 봇 (Midjourney 등 외부) | 테마별 내장 AI (골프 코치·여행 번역) | PiCafé — 맥락 특화 |
| **이벤트 수익화** | Stage + Nitro (복잡) | Event Room 입장료 Pi 직접 수취 | PiCafé — 단순 |
| **보이스·비디오** | 풍부한 기능 | MVP 단계 미지원 | Discord — 성숙도 |
| **모바일 UX** | 앱 성숙 | Pi Browser 내 WebView 최적화 | Discord — 현재 |
| **Pi 연동** | 없음 | 네이티브 | PiCafé — 유일 |

---

### Discord가 절대 복제할 수 없는 3가지 해자 (Moat)

#### 해자 1: KYC 실명 문화 — DNA 충돌

Discord의 성장 DNA는 **익명성**이다. 2억 명 이상의 사용자가 익명으로 참여하고 있다. Discord가 KYC를 도입하는 순간:

- 기존 익명 사용자 대규모 이탈
- "Discord는 감시 플랫폼"이라는 커뮤니티 반발
- 게임·밈·서브컬처 문화 붕괴

**Discord는 KYC를 추가할 수 없다. 플랫폼의 창립 정체성 자체가 익명성이기 때문이다.**

PiCafé는 처음부터 KYC로 시작한다. 이 신뢰 레이어는 후발주자가 나중에 추가할 수 없다.

#### 해자 2: Pi 경제 레이어 — 법적·기술적 장벽

Discord가 자체 코인을 만들거나 Pi를 연동하려면:

- 각국 금융 당국의 가상자산 규제 심사
- Discord Nitro 수익 모델과의 충돌
- Pi Network API 파트너십 협상 (Pi Network이 경쟁사에게 열어줄 이유 없음)
- 기존 Stripe 결제 시스템과의 아키텍처 재설계

Pi Network 기반 앱은 **Pi Network 생태계 안에서만 자연스럽게 작동**한다. Discord에서 Pi를 쓰는 건 억지다.

#### 해자 3: 테마-커뮤니티 그래프 선점

테마별 공개 카페 마켓플레이스는 **먼저 활성화한 쪽이 이긴다**. "골프 테마방 1등"을 점령하면 새 골프 사용자는 자연스럽게 그 방으로 유입된다.

Discord는 이미 수천만 개의 서버가 있지만 **테마로 구조화되어 있지 않다**. PiCafé가 테마 그래프를 선점하면, 나중에 Discord가 테마 기능을 추가해도 커뮤니티 이동 비용이 너무 크다.

---

### 전략적 포지셔닝: "Discord를 버리지 않아도 된다"

PiCafé의 가장 현명한 전략은 **Discord와 병행 사용**을 권장하는 것이다.

```
[사용자의 디지털 생활]

Discord:    게임 길드·밈·익명 잡담 → 계속 쓰세요
KakaoTalk:  가족·친구·업무 → 계속 쓰세요
PiCafé:     관심사 기반 실명 커뮤니티 + Pi 경제 활동 → 새로 추가
```

"Discord 대신 PiCafé"가 아니라 **"PiCafé는 Pi 사용자를 위한 추가 공간"**으로 포지셔닝한다. 이 전략은:

- 사용자의 전환 부담을 없앤다 (Discord를 버리지 않아도 된다)
- Pi 사용자라는 명확한 타깃으로 집중할 수 있다
- Discord와 직접 경쟁하지 않으므로 마케팅 비용이 줄어든다

---

### 차별화 실행 전술 (구체적 행동)

#### 전술 1: "Pi 사용자 전용 커뮤니티" 브랜딩

모든 마케팅에서 "Pi 사용자만 입장 가능한 진짜 커뮤니티"를 강조한다.
Discord에는 없는 **Pi KYC 배지**를 모든 프로필에 표시한다.

#### 전술 2: Discord 서버 마이그레이션 지원

인기 Discord 서버의 운영자에게 PiCafé 이전을 제안한다:
- "Discord에서는 0원인데, PiCafé에서는 Tip으로 Pi를 벌 수 있습니다"
- Discord 서버 멤버를 PiCafé로 초대하는 전용 링크 생성 지원

#### 전술 3: 창작자 수익 우선 정책

Discord 서버 구독은 플랫폼이 30% 수수료를 가져간다.
PiCafé Pi Tip은 **수수료 0%로 창작자에게 직접 전달** (초기 3년 정책으로 공표).

이 한 가지만으로 Discord에서 수익을 내던 창작자들이 이동할 강력한 이유가 된다.

#### 전술 4: 테마 독점 콘텐츠 파트너십

- 골프: 국내 프로 골퍼의 PiCafé 전용 라이브 Q&A
- 여행: 유명 여행 유튜버의 PiCafé 전용 이벤트방
- 먹방: 인기 먹방 크리에이터의 Pi Tip 받는 라이브 카페

Discord에는 이런 라이브 경제 이벤트가 없다. **PiCafé만의 독점 콘텐츠**로 초기 사용자를 유입시킨다.

#### 전술 5: Pi Browser 네이티브 경험

Discord는 Pi Browser에서 불편하다 (웹 접근, Pi 결제 불가).
PiCafé는 **Pi Browser에 최적화**된 네이티브 UX로 Pi 사용자 경험을 압도한다.

Pi Browser를 여는 사람에게 자연스럽게 노출되는 앱이 되면, **Discord는 구조적으로 접근조차 불리하다.**

---

### 요약: 경쟁 대신 생태계 창조

| 전략 | 내용 |
|---|---|
| **포지셔닝** | "Discord 대안"이 아닌 "Pi 사용자를 위한 신규 카테고리" |
| **해자** | KYC 신뢰 + Pi 경제 + 테마 그래프 선점 — 3중 복제 불가 |
| **공존** | Discord와 병행 사용 권장 — 전환 부담 제거 |
| **창작자** | Pi Tip 수수료 0% — Discord 30% 대비 압도적 |
| **네이티브** | Pi Browser 최적화 — Discord의 구조적 접근 한계 활용 |

> **핵심 메시지**: Discord가 지배하는 시장에서 싸우지 않는다.
> Pi 사용자 3,500만 명이라는 검증된 사용자 베이스 위에
> **"KYC + Pi 경제 + 라이프스타일 테마"라는 새로운 카테고리를 만든다.**

---

## 1-3. 탈중앙화와 프라이버시 — "누구도 당신의 대화를 통제할 수 없다"

> Discord는 당신의 모든 메시지를 읽을 수 있다.
> 카카오톡은 국가 수사 요청에 서버 데이터를 제공했다.
> PiCafé는 **플랫폼조차 당신의 대화에 접근할 수 없다.**

---

### 핵심 개념: "인간 검증된 익명성 (Human-Verified Anonymity)"

기존 서비스의 이분법:

```
무검증 익명 (Discord·Telegram) ←────→ 실명 중앙화 (카카오톡·라인)
    봇·사기꾼 섞임                           정부·기업에 데이터 노출
```

PiCafé는 이 이분법을 깨는 **세 번째 포지션**을 가진다:

```
             Pi Network KYC
                   │
           "당신이 사람임을 증명"
                   │
        Pi UID ────┼──── 카페 내 익명 식별자
                   │
          실명은 Pi Network만 알고
          PiCafé·다른 사용자는 모른다
```

- **Pi Network**가 아는 것: 실명·신원 (KYC 완료)
- **PiCafé가 아는 것**: Pi UID만 (익명 식별자)
- **다른 카페 참가자가 아는 것**: 닉네임만 (사용자 선택)

**결과**: 봇·스팸은 없지만(KYC로 필터), 대화 내용은 완전 익명으로 보호된다.

---

### 탈중앙화 아키텍처 3계층

#### 계층 1: 신원 — Pi 지갑이 곧 당신의 신원

PiCafé에는 별도 계정이 없다. **Pi 지갑 = 당신의 ID**다.

| 항목 | 중앙화 서비스 | PiCafé |
|---|---|---|
| 계정 생성 | 이메일·전화번호 제출 | Pi 지갑 연결만 |
| 계정 정지 | 플랫폼 임의 삭제 가능 | Pi 지갑은 누구도 삭제 불가 |
| 아이디 소유권 | 플랫폼 소유 | 사용자 소유 (Pi 개인키 기반) |
| 서비스 종료 시 | 계정·데이터 소멸 | Pi 지갑·자산 유지 |

PiCafé가 내일 서비스를 종료해도 당신의 Pi 지갑·Pi 자산은 그대로다. 플랫폼이 당신을 쫓아낼 수 없다.

#### 계층 2: 결제 — Pi 블록체인이 결제를 처리

Pi Tip, 구독료, 스티커 구매는 모두 **Pi Network 블록체인 위에서 정산**된다.

```
기존 결제 (중앙화):
  사용자 → PiCafé 서버 → 결제 게이트웨이 → 수신자
  (플랫폼이 동결·취소·수수료 징수 가능)

PiCafé 결제 (탈중앙화):
  사용자 Pi 지갑 → Pi 블록체인 검증 → 수신자 Pi 지갑
  (중간 중재자 없음 — 플랫폼도 개입 불가)
```

누군가에게 Pi Tip을 보내면 PiCafé 서버를 거치지 않고 블록체인에서 직접 정산된다. PiCafé 운영자가 Tip을 가로막거나 수수료를 바꿀 수 없다.

#### 계층 3: 메시지 — 종단간 암호화 (E2E Encryption)

| 카페 유형 | 암호화 방식 |
|---|---|
| 1:1 다이렉트 카페 | **E2E 암호화** — 송수신자 Pi 키로만 복호화 |
| 비밀 카페 | **E2E 암호화** + 자동삭제 타이머 |
| 일반 그룹방 | 서버 암호화 (TLS) — 관리 편의와 검색 기능 균형 |
| 이벤트방 | 서버 암호화 (공개 강의 성격) |

**1:1·비밀 카페는 PiCafé 서버조차 내용을 읽을 수 없다.** 서버에는 암호화된 바이너리만 저장된다.

---

### 중앙화 서비스와의 프라이버시 비교

| 항목 | Discord | 카카오톡 | Telegram | PiCafé |
|---|---|---|---|---|
| 메시지 서버 보관 | ✅ 평문 저장 | ✅ 평문 저장 | ✅ 클라우드 | ⚡ E2E 암호화 (DM) |
| 정부 요청 대응 | 법원 영장 시 제공 | 제공 이력 있음 | 일부 제공 | 암호화로 제공 불가 |
| 광고 목적 데이터 활용 | 있음 | 있음 | 없음 | **없음** |
| 계정 강제 삭제 | 가능 | 가능 | 가능 | Pi 지갑 = 불가 |
| 플랫폼 서비스 종료 시 | 데이터 소멸 | 데이터 소멸 | 데이터 소멸 | Pi 자산 유지 |
| 결제 동결 가능성 | 해당 없음 | 해당 없음 | 해당 없음 | **Pi 블록체인 = 불가** |

---

### 탈중앙화가 만드는 새로운 사용 시나리오

#### 시나리오 1: 정치적으로 민감한 지역의 사용자

카카오톡·라인은 특정 국가에서 수사 협조를 했다. PiCafé의 E2E 암호화 1:1 카페는 **플랫폼 측 제공 데이터가 없어 법적 요청에 응할 수 없다.**

#### 시나리오 2: 비즈니스 기밀 카페

비밀 카페는 자동삭제 타이머 + E2E 암호화로, **PiCafé 서버에 회의 내용 흔적이 남지 않는다.**

#### 시나리오 3: Pi 자산 거래 투명성

Pi Tip·결제 내역은 블록체인에 영구 기록된다. 플랫폼이 조작할 수 없는 **투명한 거래 장부**로 신뢰를 확보한다.

#### 시나리오 4: 검열 없는 커뮤니티 운영

방장이 자신의 테마 카페를 운영하는 한, PiCafé 운영자가 이유 없이 방을 강제 삭제할 수 없다. Pi 지갑에 연결된 카페 소유권은 블록체인이 보증한다.

---

### 탈중앙화 선언 (사용자 대상 메시지)

PiCafé가 사용자에게 공개적으로 약속하는 4가지:

```
1. 우리는 당신의 1:1 메시지를 읽을 수 없습니다.
   (E2E 암호화 — 서버에는 암호문만 저장)

2. 당신의 Pi 지갑을 동결하거나 자산을 빼앗을 수 없습니다.
   (Pi 블록체인 — PiCafé 외부에서 관리)

3. 당신의 카페를 이유 없이 삭제하지 않습니다.
   (Pi 지갑 소유권 = 카페 소유권)

4. 당신의 대화를 광고·학습 데이터로 사용하지 않습니다.
   (No data monetization policy)
```

---

### Discord·카카오톡이 복제할 수 없는 이유

Discord와 카카오톡은 **광고 수익 모델** 위에 세워져 있다. 사용자 데이터를 수집·분석하는 것이 비즈니스 모델의 핵심이다.

PiCafé는 **Pi 마이크로 트랜잭션**이 수익 모델이므로 사용자 데이터를 팔 필요가 없다. 탈중앙화 프라이버시 정책이 비즈니스 모델과 충돌하지 않고 **오히려 강화**한다.

> **탈중앙화 = 마케팅 수사가 아닌 비즈니스 모델의 필연적 결과다.**

---

## 1-4. 글로벌 동시통역 (PiTranslateâ¢™) — "언어 없는 카페"

> **Discord도 없다. Telegram도 없다. WhatsApp도 없다.**
> 전 세계 어디서든, 어떤 언어로 보내도, 내가 선택한 언어로 실시간 통역되는 카페는 **PiCafé가 처음이다.**

---

### 왜 이것이 글로벌 런칭의 킬러 피처인가

Pi Network는 전 세계 200개국 3,500만 명이 사용하는 글로벌 네트워크다. 그런데 지금까지 Pi 기반 서비스에서 **한국 사용자와 나이지리아 사용자가 같은 카페에서 자유롭게 대화한 적이 없다.** 이유는 하나 — 언어 장벽.

PiTranslateâ¢™는 이 장벽을 허문다:

```
[상황] 골프 테마 글로벌 방
  🇰🇷 김민준: "오늘 그립 연습 했는데 아직도 힘이 들어가네요"
  🇳🇬 Chukwu: "The key is to relax your forearm completely"
  🇧🇷 Carlos: "Eu uso a técnica de grip neutro, muito melhor"
  🇯🇵 田中: "グリップは軽く握るのがポイントですよ"

[각 사용자 화면]
  김민준은: 모든 메시지가 한국어로 표시됨
  Chukwu는: 모든 메시지가 영어로 표시됨
  Carlos는: 모든 메시지가 포르투갈어로 표시됨
  田中は: 全メッセージが日本語で表示される
```

하나의 대화가 **동시에 4개 언어로 흐른다.** 누군가 번역 버튼을 누를 필요도 없다. 카페창을 나갈 필요도 없다.

---

### 비용 전략: 전 사용자 무료 제공

| 항목 | 수치 |
|---|---|
| 번역 엔진 | Claude Haiku (최저 비용, 최고 품질) |
| 비용/번역 | ~$0.0001 (입력 100토큰 + 출력 30토큰 기준) |
| 10,000건/일 시나리오 | ~$1/일 = $30/월 |
| Free 사용자 무료 지원 시 | $30/월 인프라 비용으로 글로벌 획득 |

> **전략적 판단**: 월 $30 미만의 비용으로 "언어 장벽 없는 카페"이라는 글로벌 킬러 피처를 전 사용자에게 무료로 제공한다. Pi 생태계에서 전례 없는 경험이다.

---

### 핵심 UX 동작 원리

#### 1. 언어 선호 설정 (1회)

사용자 프로필에서 "내가 보고 싶은 언어"를 설정한다. 이후 모든 카페에서 자동 적용.

```
설정 → 언어 → 표시 언어 선택 (203개 locale)
```

#### 2. 메시지 수신 시 자동 번역

다른 언어로 작성된 메시지가 도착하면:
1. 원본 메시지 즉시 표시 (UX 지연 없음)
2. 번역 요청 서버로 전달 (백그라운드)
3. 번역 완료 → 실시간 교체 (같은 언어 선택 사용자에게 동시 전달)

**같은 언어를 선택한 사용자 100명이 있다면, 번역은 1회만 발생한다.**

#### 3. 원본 보기 (투명성 보장)

메시지 우상단 `[원문 보기]` 버튼으로 원본 언어 텍스트를 언제든 확인 가능.

```
[번역된 텍스트] ← 기본 표시
[원문: The key is to relax your forearm completely] ← 토글 클릭 시
```

---

### 기술 아키텍처 요약

```
사용자 A (영어 작성)
    │
    ▼
POST /api/chat/rooms/[roomId]/messages
    │
    ├─→ DB 저장 (msg_msg, src_lang_cd = 'en')
    ├─→ broadcast 'new_msg' (원본)
    └─→ 번역 큐 (방 참가자 사용 언어 목록 조회)
           │
           ├─→ 한국어 사용자 있음 → Gemini 2.0 Flash 번역
           │       └─→ DB 캐시 (msg_trans: msg_id + 'ko')
           │       └─→ broadcast 'msg_trans' (msg_id, locale='ko', text='...')
           │
           ├─→ 일본어 사용자 있음 → Gemini 2.0 Flash 번역
           │       └─→ DB 캐시 (msg_trans: msg_id + 'ja')
           │       └─→ broadcast 'msg_trans' (msg_id, locale='ja', text='...')
           │
           └─→ 같은 locale 동시 요청 → pending map으로 1회만 호출
                  Gemini API 장애 시 → Claude Haiku 자동 fallback
```

> 번역은 **Gemini 2.0 Flash**, AI 비서(`@ai`)는 **Claude Haiku** — 역할 분리로 비용 ~76% 절감

---

### Discord도 복제할 수 없는 이유

Discord가 "번역 봇"을 추가하거나 "자동번역" 기능을 넣을 수는 있다. 그러나:

| 항목 | Discord 자동번역 | PiTranslateâ¢™ |
|---|---|---|
| 트리거 | 버튼 클릭 필요 (흐름 단절) | 자동·실시간 (흐름 유지) |
| 동시 배포 | 사용자별 독립 API 호출 | 동일 locale 1회 호출 → broadcast |
| Pi 생태계 연동 | 없음 | Pi 로그인 사용자 locale 자동 연동 |
| 번역 맥락 | 범용 | 카페 슬랭·이모지·테마 맥락 이해 (Gemini Flash) |
| 비용 구조 | 사용량 비례 과금 사용자에게 전가 | 플랫폼 부담 (사용자 무료) |
| 장애 대응 | 단일 포인트 | Gemini 장애 → Claude Haiku fallback |

**Discord에서 "한 카페에 6개 언어 사용자가 모여서 자유롭게 대화"하는 경험은 현재 불가능하다. PiCafé가 최초다.**

---

## 2. 목표 및 성공 지표

### KPI (서비스 시작 후 6개월)

| 지표 | 목표 |
|---|---|
| 월간 활성 카페 사용자 (MAU) | 1,000명 |
| 유료 구독 전환율 | 5% |
| 인라인 단건 결제 비율 (Free 사용자) | 20% |
| 1인당 월 Pi 소비 | 0.5 Pi 이상 |
| 카페 생성 수 | 500개/월 |
| 테마별 평균 카페 수 | 25개 |
| **번역 사용률** (비영어 사용자 비율) | 40% 이상 |
| **다언어 카페** (3개국 이상 참가) | 전체 공개방의 20% |
| **번역 캐시 히트율** | 60% 이상 (중복 번역 최소화) |
| **PiTranslateâ¢™ DAU** | MAU의 30% |

### 성공 기준

- Free 사용자 70% 이상이 한 달 내 스티커·AI·Tip 중 하나를 단건 결제
- 테마별 공개 카페가 각 5개 이상 활성 유지
- 이벤트 카페 월 10개 이상 개설 (Business 사용자 주도)
- 비영어권 사용자(한국·브라질·인도·나이지리아 등) **MAU의 40% 이상** 확보
- 글로벌 방(3개국 이상 참가) 월 50개 이상 개설

---

## 3. 테마 시스템 (Theme-First Architecture)

테마는 단순한 꾸밈 요소가 아니라 **카페 분류 체계이자 수익화 진입점**이다. 사용자는 카페를 만들거나 탐색할 때 반드시 테마를 먼저 선택한다.

### 테마 카탈로그 (20개+ 초기 제공)

| 카테고리 | 테마 | 이모지 | 태그 | 등급 |
|---|---|---|---|---|
| 액티비티 | 골프 | ⛳ | #골프 #필드 #스윙 | PREMIUM |
| 액티비티 | 수영 | 🏊 | #수영 #수영장 #다이빙 | PREMIUM |
| 액티비티 | PT/피트니스 | 💪 | #PT #헬스 #식단 | BASIC |
| 액티비티 | 서핑 | 🏄 | #서핑 #파도 #바다 | PREMIUM |
| 액티비티 | 요가/명상 | 🧘 | #요가 #명상 #마음챙김 | PREMIUM |
| 여행 | 여행 | ✈️ | #여행 #해외 #숙소 | BASIC |
| 여행 | 항공/마일리지 | 🛫 | #마일리지 #비즈니스석 | PREMIUM |
| 음식 | 먹방 | 🍜 | #먹방 #맛집 #리뷰 | BASIC |
| 음식 | 요리 | 🍳 | #요리 #레시피 #홈쿡 | PREMIUM |
| 취미 | 사진/카메라 | 📸 | #사진 #카메라 #감성 | BASIC |
| 취미 | 독서/스터디 | 📚 | #독서 #스터디 #북클럽 | BASIC |
| 취미 | 반려동물 | 🐕 | #강아지 #고양이 #펫 | PREMIUM |
| 라이프 | 뷰티/패션 | 💄 | #뷰티 #패션 #코디 | PREMIUM |
| 라이프 | 재테크/투자 | 💰 | #재테크 #주식 #Pi투자 | PREMIUM |
| 테크 | 코딩/IT | 💻 | #개발 #코딩 #AI | BASIC |
| 테크 | 게임 | 🎮 | #게임 #롤 #PS5 | PREMIUM |
| 문화 | 음악 | 🎵 | #음악 #밴드 #작곡 | PREMIUM |
| 문화 | 아트/DIY | 🎨 | #그림 #공예 #DIY | PREMIUM |
| 라이프 | 환경/제로웨이스트 | 🌱 | #환경 #비건 #제로웨이스트 | PREMIUM |
| 자동차 | 드라이브/차 | 🚗 | #자동차 #드라이브 #캠핑 | PREMIUM |

**BASIC 테마** (5개): PT·여행·먹방·사진·독서·코딩 → Free 사용자 무료 접근
**PREMIUM 테마** (15개+): 단건 0.2 Pi 또는 구독으로 잠금해제

### 테마 연동 자동화

테마를 선택하는 순간 아래 항목이 자동으로 세팅된다:

1. **기본 스티커팩 3개** — 해당 테마 전용 이모지·일러스트 스티커
2. **AI 봇 프리셋** — 테마별 특화 시스템 프롬프트 사전 탑재
   - 골프방: "당신은 골프 코치입니다. 스윙 자세, 필드 전략, 장비 추천..."
   - 먹방방: "당신은 음식 칼로리·영양 전문가입니다. 맛집 리뷰, 레시피..."
   - 여행방: "당신은 여행 플래너이며 다국어 번역을 제공합니다..."
3. **활동 배지** — 해당 테마 방에서 30일 활동 시 자동 수여
4. **마켓플레이스 노출** — 카페 탐색 화면에서 테마별 필터로 발견 가능

### 카페 생성 UX (테마 퍼스트)

```
Step 1: 테마 선택
  ├─ 기본 테마 5개 (자유 선택)
  └─ 프리미엄 테마 15개+ (🔒 잠금 표시)
        ├─ [0.2 Pi 단건 잠금해제]
        └─ [Premium 구독 1 Pi/월]

Step 2: 카페 이름 + 설명 입력
  (선택한 테마 이모지 + 권장 태그 자동 제안)

Step 3: 공개/비공개 + 정원 설정
  ├─ 공개방: 마켓플레이스에 노출
  └─ 비공개방: 초대 링크로만 입장

Step 4: Pi 결제 (그룹방, Premium 월 한도 초과 시)
  └─ Free: 0.1 Pi / Premium: 월 3개 무료
```

---

## 4. 구독 티어 및 제한 정책

### Free "Pi Explorer" (0 Pi)

**원칙**: Pi 인증 즉시 카페 시작, 진입 장벽 최소화

| 기능 | 제한 |
|---|---|
| 1:1 카페 | 무제한 |
| 테마 접근 | 기본 5개 |
| 공개 테마방 참여 | 최대 5개 동시 |
| 그룹 카페 생성 | 0.1 Pi/개 |
| 스티커 | 테마별 기본 3개 |
| 메시지 보관 | 7일 |
| Pi Tip | 수신만 가능 |
| 음성 메시지 | 최대 30초 |
| 파일 공유 | 불가 |
| AI 카페 비서 | 0.05 Pi/1회 |
| 이벤트방 개설 | 불가 |

### Premium "Pi Creator" (1 Pi/월 또는 10 Pi/년)

| 기능 | 혜택 |
|---|---|
| 테마 접근 | 전체 20개+ |
| 공개 테마방 참여 | 무제한 |
| 그룹 카페 생성 | 월 3개 무료 (초과분 0.1 Pi) |
| 테마 스티커팩 | 매월 1개 무료 |
| 메시지 보관 | 1년 |
| Pi Tip 전송 | 가능 |
| 음성 메시지 | 최대 1분 |
| 파일 공유 | 100 MB/월 |
| AI 카페 비서 | 10회/월 |
| 테마 배지·칭호 표시 | 가능 |
| 비밀 카페 (자동삭제) | 가능 |

### Business "Pi Host" (5 Pi/월 또는 50 Pi/년)

| 기능 | 혜택 |
|---|---|
| 모든 Premium 기능 포함 | — |
| 그룹 카페 생성 | 무제한 |
| 이벤트 카페 개설 | 입장료 수익 수취 |
| 최대 멤버 | 500명 |
| 파일 공유 | 1 GB/월 |
| AI 카페 비서 | 무제한 |
| 카페 봇 연동 (Webhook) | 가능 |
| 분석 대시보드 | 가능 |
| 커스텀 스티커 제작 | 팩당 10개, 0.5 Pi |
| API 접근권 | 가능 |

### 등급별 비교 매트릭스

| 기능 | Free | Premium | Business |
|---|---|---|---|
| 1:1 카페 | 무제한 | 무제한 | 무제한 |
| 테마 접근 | 5개 | 20개+ | 20개+ |
| 그룹방 참여 | 최대 5개 | 무제한 | 무제한 |
| 그룹방 생성 | 0.1 Pi | 3개/월 무료 | 무제한 |
| Pi Tip 전송 | 0.01 Pi 단건 | 가능 | 가능 |
| 스티커 | 기본 3개 | 팩 구매 가능 | 커스텀 제작 |
| 음성 메시지 | 30초 | 1분 | 5분 |
| AI 기능 | 0.05 Pi/회 | 10회/월 | 무제한 |
| 메시지 보관 | 7일 | 1년 | 영구 |
| 파일 공유 | 불가 | 100 MB/월 | 1 GB/월 |
| 이벤트방 개설 | 불가 | 불가 | 가능 |
| 분석 대시보드 | 불가 | 불가 | 가능 |

---

## 5. 인라인 구매 — 카페 내 자연스러운 유료 전환

**원칙**: 카페 흐름을 끊지 않고, 문맥에 맞는 순간에 구매 옵션을 제시한다.

### 트리거 1: 스티커 하단 업셀

```
[사용자가 스티커 버튼 클릭]
  → 기본 스티커 3개 표시
  → 하단 배너: "⛳ 골프 스티커 팩 전체 (30개) — 0.1 Pi"
  → [Pi로 구매] 탭 → 인앱 Pi 결제 → 즉시 잠금해제
```

**발동 조건**: Free 사용자가 스티커 메뉴를 열 때마다 노출
**전환 포인트**: 기본 3개로는 부족하다고 느끼는 순간

### 트리거 2: Pi Tip 수신 → 보내기 유도

```
[카페창에 TIP_NOTI 메시지 표시]
"🎉 anakin이 0.5 Pi Tip을 보냈습니다!"
  → [나도 팁 보내기] 버튼
  → Free 사용자:
    "팁 보내기는 Premium(1 Pi/월) 또는 단건(0.01 Pi)"
    [0.01 Pi로 지금 보내기] / [Premium 구독하기]
```

**발동 조건**: Free 사용자가 TIP_NOTI 메시지의 "보내기" 버튼을 누를 때
**전환 포인트**: 받은 후 "나도 보내고 싶다"는 상호 보답 심리

### 트리거 3: AI 한도 초과

```
[사용자가 "@ai 요약해줘" 입력 → Premium: 월 10회 소진 시]
  → 인라인 알림: "이번 달 AI 요약 10회를 모두 사용했습니다."
  → [0.05 Pi로 1회 추가] / [Business로 업그레이드]
```

**발동 조건**: AI 기능 사용 한도 초과 시 (Free: 항상, Premium: 월 10회 초과)
**전환 포인트**: 필요한 순간 바로 결제 완료 → 이탈 없음

### 트리거 4: 메시지 만료 경고

```
[카페 입장 시, 7일 내 만료 예정 메시지 존재]
  → 상단 알림 배너 (1회만 표시):
    "이 대화의 57개 메시지가 2일 후 삭제됩니다."
  → [0.1 Pi로 30일 보관 연장] / [Premium으로 1년 보관]
```

**발동 조건**: Free 사용자의 카페에 만료 예정 메시지 존재
**전환 포인트**: "소중한 대화가 사라진다"는 손실 회피 심리

### 트리거 5: 카페 정원 초과

```
[공개 그룹방 멤버가 50명 도달 시 → 방장에게 알림]
  → "카페가 가득 찼습니다! 더 많은 분을 초대하려면:"
  → [0.05 Pi로 +10명 확장] → 인앱 결제 → 즉시 적용
```

**발동 조건**: 멤버 수 = max_mbr_cnt 도달
**전환 포인트**: 방장이 커뮤니티를 키우고 싶은 순간

### 트리거 6: 프리미엄 테마 잠금

```
[카페 만들기 → 테마 선택 화면]
  기본 5개: 자유 선택
  나머지 15개: 🔒 아이콘 표시
  → 테마 선택 시 팝업:
    "이 테마는 Premium 전용입니다."
    [0.2 Pi 단건 잠금해제] / [Premium 구독 1 Pi/월 (모든 테마 포함)]
```

**발동 조건**: Free 사용자가 PREMIUM 테마 클릭
**전환 포인트**: 자신이 원하는 테마로 방을 만들고 싶은 순간

### 트리거 7: 활동 배지 강화

```
[프로필 → 획득 배지 목록]
"⛳ 골프 방 30일 활동 → 🏌️ 골퍼 배지 획득!"
  → [배지 강화 0.1 Pi] → 특별 디자인 + 카페 이름 옆 상시 표시
```

**발동 조건**: 테마 활동 배지 자동 수여 시 팝업
**전환 포인트**: 배지를 자랑하고 싶은 성취감

### 트리거 8: 이벤트 카페 알림

```
[테마 팔로우 알림 — 선택한 테마의 이벤트 개설 시]
  "⛳ [골프] 프로 강사 라이브 Q&A 시작 — 0.5 Pi 입장"
  → [입장권 구매] → Pi 결제 → 이벤트방 자동 입장
```

**발동 조건**: 사용자가 팔로우 중인 테마에 이벤트방 개설 시
**전환 포인트**: 관심사 이벤트를 놓치고 싶지 않은 FOMO 심리

---

## 6. 일회성 Pi 결제 메뉴

| 아이템 | 가격 | 설명 |
|---|---|---|
| 그룹 카페 생성 | 0.1 Pi | Free 또는 Premium 월 한도 초과 시 |
| 프리미엄 테마 단건 잠금해제 | 0.2 Pi/개 | 영구 해제 |
| 카페 인원 확장 (+10명) | 0.05 Pi | 즉시 적용 |
| 비밀 카페 개설 | 0.2 Pi | 자동삭제 타이머 설정 |
| 스티커 팩 | 0.05~0.3 Pi | 테마별 30개 묶음 |
| 이벤트 카페 입장권 | 주최자 설정 | 0.1~5 Pi |
| AI 기능 단건 | 0.05 Pi | 요약·번역·회의록 1회 |
| 메시지 보관 연장 | 0.1 Pi/30일 | Free 사용자 보관 연장 |
| Pi Tip 전송권 (1회) | 0.01 Pi | Free 사용자 단건 팁 전송 |
| 활동 배지 강화 | 0.1 Pi | 특별 디자인 + 카페 상시 표시 |
| 카페 대화 내보내기 | 0.1 Pi | PDF/JSON 다운로드 |
| 커스텀 스티커 제작 | 0.5 Pi/팩 | Business 전용: 브랜드 스티커 10개 |

---

## 7. Pi 결제 연동 설계

기존 3단계 결제 흐름(`/api/payments/approve → complete`)을 그대로 사용한다.
`metadata.type` 필드로 결제 목적을 분기 처리한다.

### 결제 메타데이터 (7가지 유형)

```json
// 카페 생성
{
  "type": "CHAT_ROOM_CREATE",
  "room_nm": "골프 친구들",
  "theme_cd": "GOLF",
  "max_mbr_cnt": 50
}

// 구독 결제
{
  "type": "CHAT_SUBSCR",
  "plan_cd": "PREMIUM_MONTHLY",
  "period_months": 1
}

// 프리미엄 테마 단건 잠금해제
{
  "type": "THEME_UNLOCK",
  "theme_cd": "GOLF"
}

// 스티커 팩 구매
{
  "type": "STICKER_PACK",
  "pack_id": "uuid",
  "theme_cd": "GOLF"
}

// Pi Tip 전송
{
  "type": "PI_TIP",
  "room_id": "uuid",
  "rcvr_pi_uid": "pi_uid_string",
  "tip_msg": "감사합니다!"
}

// 이벤트 카페 입장
{
  "type": "EVENT_ROOM_JOIN",
  "room_id": "uuid",
  "event_nm": "골프 프로 라이브 Q&A"
}

// 단건 기능 구매 (AI·보관·인원·팁·내보내기)
{
  "type": "FEATURE_ADDON",
  "feature_cd": "AI_SUMMARY",
  "room_id": "uuid"
}
```

**feature_cd 값**: `AI_SUMMARY` | `MSG_KEEP` | `MEMBER_EXT` | `TIP_SINGLE` | `EXPORT` | `BADGE_UPGRADE`

### 결제 완료 후처리 (metadata.type 분기)

```
CHAT_ROOM_CREATE  → msg_room INSERT + msg_room_mbr(OWNER) INSERT
CHAT_SUBSCR       → msg_subscr UPSERT (expire_dtm 갱신)
THEME_UNLOCK      → msg_usr_theme INSERT (영구)
STICKER_PACK      → msg_usr_stkr_pack INSERT
PI_TIP            → msg_tip INSERT + 수신자 Realtime 알림 + TIP_NOTI 메시지 발송
EVENT_ROOM_JOIN   → msg_room_mbr(GUEST, expire_dtm=이벤트종료) INSERT
FEATURE_ADDON     → feature_cd별 분기 처리
```

---

## 8. DB 스키마 (DA 표준, msg_ 접두사)

> 전 테이블 시스템 컬럼 4개 필수:
> `regr_id TEXT NOT NULL DEFAULT 'ADMIN'`,
> `reg_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`,
> `modr_id TEXT NOT NULL DEFAULT 'ADMIN'`, `mod_dtm TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`

### 테이블 목록 (13개)

| 테이블 | 설명 |
|---|---|
| `msg_theme` | 테마 마스터 (20개+ 테마 정의) |
| `msg_theme_stkr` | 테마 기본 스티커팩 매핑 |
| `msg_room` | 카페 |
| `msg_room_mbr` | 카페 멤버 |
| `msg_msg` | 메시지 |
| `msg_msg_reac` | 메시지 이모지 반응 |
| `msg_attch` | 첨부파일 |
| `msg_subscr_plan` | 구독 플랜 정의 |
| `msg_subscr` | 사용자 구독 현황 |
| `msg_stkr_pack` | 스티커 팩 |
| `msg_stkr` | 스티커 개별 항목 |
| `msg_usr_stkr` | 사용자 보유 스티커 |
| `msg_tip` | Pi Tip 내역 |

### 핵심 테이블 DDL

```sql
-- 테마 마스터
CREATE TABLE msg_theme (
  theme_cd     VARCHAR(20)  PRIMARY KEY,  -- 'GOLF', 'TRAVEL', 'MUKBANG'
  theme_nm     VARCHAR(50)  NOT NULL,     -- '골프'
  theme_emoji  VARCHAR(10)  NOT NULL,     -- '⛳'
  theme_desc   TEXT,
  theme_tp_cd  VARCHAR(10)  NOT NULL CHECK (theme_tp_cd IN ('BASIC','PREMIUM')),
  sort_ord     INTEGER      DEFAULT 0,
  use_yn       CHAR(1)      DEFAULT 'Y',
  regr_id      TEXT  NOT NULL DEFAULT 'ADMIN',
  reg_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id      TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm      TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 카페
CREATE TABLE msg_room (
  room_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_nm          VARCHAR(100) NOT NULL,
  room_desc        TEXT,
  theme_cd         VARCHAR(20)  NOT NULL REFERENCES msg_theme(theme_cd),
  room_tp_cd       CHAR(1)      NOT NULL CHECK (room_tp_cd IN ('D','G','E')),
  -- D=Direct 1:1, G=Group, E=Event 유료입장
  max_mbr_cnt      INTEGER      DEFAULT 50,
  is_public_yn     CHAR(1)      DEFAULT 'N',
  entry_fee_pi     DECIMAL(10,4) DEFAULT 0,   -- 이벤트방 입장료 (Pi)
  entry_expire_dtm TIMESTAMPTZ,               -- 이벤트방 종료 시각
  gate_min_pi      DECIMAL(10,4) DEFAULT 0,   -- Pi Gate 최소 잔액 조건
  pymnt_id         TEXT         REFERENCES pi_pymnt(payment_id),
  del_yn           CHAR(1)      DEFAULT 'N',
  regr_id          TEXT  NOT NULL DEFAULT 'ADMIN',
  reg_dtm          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id          TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm          TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 카페 멤버
CREATE TABLE msg_room_mbr (
  room_mbr_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES msg_room(room_id),
  usr_id          UUID        NOT NULL,     -- sys_user.id
  mbr_role_cd     VARCHAR(10) NOT NULL CHECK (mbr_role_cd IN ('OWNER','ADMIN','MEMBER','GUEST')),
  lst_read_msg_id UUID,                     -- 읽음 확인용
  expire_dtm      TIMESTAMPTZ,             -- GUEST 임시 입장 만료
  del_yn          CHAR(1)     DEFAULT 'N',
  UNIQUE (room_id, usr_id),
  regr_id         TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id         TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm         TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 메시지
CREATE TABLE msg_msg (
  msg_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID         NOT NULL REFERENCES msg_room(room_id),
  snd_usr_id  UUID         NOT NULL,
  snd_usr_nm  VARCHAR(100) NOT NULL,    -- display_name 비정규화 (성능)
  msg_cont    TEXT,
  msg_tp_cd   VARCHAR(10)  NOT NULL DEFAULT 'TEXT'
              CHECK (msg_tp_cd IN ('TEXT','IMAGE','FILE','VOICE','STICKER','TIP_NOTI','SYSTEM')),
  attch_url   TEXT,                     -- 이미지·파일·음성 오브젝트 URL
  stkr_id     UUID,                     -- 스티커 전송 시 msg_stkr.stkr_id
  ref_msg_id  UUID,                     -- 답장·스레드 참조
  src_lang_cd VARCHAR(20),              -- 원본 언어 코드 (PiTranslateâ¢™ — Claude Haiku 감지)
  del_yn      CHAR(1)      DEFAULT 'N',
  regr_id     TEXT  NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 메시지 번역 캐시 (PiTranslateâ¢™)
-- On-demand 번역 결과를 캐싱 — 같은 (msg_id, locale_cd) 조합은 1회만 번역
CREATE TABLE msg_trans (
  trans_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id      UUID         NOT NULL REFERENCES msg_msg(msg_id),
  locale_cd   VARCHAR(20)  NOT NULL,    -- 번역 대상 locale (예: 'ko', 'ja', 'pt-BR')
  trans_cont  TEXT         NOT NULL,    -- Claude Haiku가 번역한 텍스트
  model_ver   VARCHAR(50),             -- 번역에 사용된 모델 ID (버전 추적)
  UNIQUE (msg_id, locale_cd),          -- 동일 (메시지, 언어) 중복 저장 방지
  regr_id     TEXT  NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_msg_trans_msg_id ON msg_trans(msg_id);
CREATE INDEX idx_msg_trans_locale ON msg_trans(locale_cd);

-- 구독
CREATE TABLE msg_subscr (
  subscr_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_id        UUID        NOT NULL UNIQUE,
  plan_cd       VARCHAR(30) NOT NULL,    -- 'PREMIUM_MONTHLY', 'BUSINESS_ANNUAL' 등
  pymnt_id      TEXT        REFERENCES pi_pymnt(payment_id),
  start_dtm     TIMESTAMPTZ NOT NULL,
  expire_dtm    TIMESTAMPTZ NOT NULL,
  auto_renew_yn CHAR(1)     DEFAULT 'Y',
  del_yn        CHAR(1)     DEFAULT 'N',
  regr_id       TEXT NOT NULL DEFAULT 'ADMIN',
  reg_dtm       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id       TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm       TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pi Tip 내역
CREATE TABLE msg_tip (
  tip_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID         NOT NULL REFERENCES msg_room(room_id),
  msg_id      UUID,                     -- TIP_NOTI 메시지 연결
  snd_usr_id  UUID         NOT NULL,
  rcvr_usr_id UUID         NOT NULL,
  tip_amt_pi  DECIMAL(10,4) NOT NULL,
  tip_msg     TEXT,                     -- 팁과 함께 전송한 메시지
  pymnt_id    TEXT         NOT NULL REFERENCES pi_pymnt(payment_id),
  regr_id     TEXT  NOT NULL DEFAULT 'ADMIN',
  reg_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modr_id     TEXT         NOT NULL DEFAULT 'ADMIN',
  mod_dtm     TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. API 설계

### 카페 API

```
GET    /api/chat/rooms                    카페 목록 (테마 필터, 커서 페이지네이션)
POST   /api/chat/rooms                    카페 생성 (Pi 결제 검증 포함)

GET    /api/chat/rooms/[roomId]           카페 상세 + 멤버 목록
PATCH  /api/chat/rooms/[roomId]           카페 설정 변경 (방장·관리자)
DELETE /api/chat/rooms/[roomId]           카페 삭제 (방장)

GET    /api/chat/rooms/[roomId]/messages  메시지 목록 (cursor 페이지네이션)
POST   /api/chat/rooms/[roomId]/messages  메시지 전송

GET    /api/chat/rooms/[roomId]/members   멤버 목록
POST   /api/chat/rooms/[roomId]/members   멤버 초대
DELETE /api/chat/rooms/[roomId]/members   강퇴

POST   /api/chat/rooms/[roomId]/join      입장 (공개방 / 초대코드 / Pi 결제 분기)
POST   /api/chat/rooms/[roomId]/leave     퇴장

POST   /api/chat/rooms/[roomId]/pin       핀 메시지 설정
```

**메시지 cursor 페이지네이션 (scroll-up 무한로드)**:
```
GET /api/chat/rooms/[id]/messages?limit=50&before=<msg_id>
→ { messages: [...], hasMore: boolean, oldestMsgId: string }
```

### 번역 API (PiTranslateâ¢™)

```
POST /api/chat/rooms/[roomId]/messages/[msgId]/translate
  Body: { locale: string }          -- 번역 요청 locale (예: 'ko', 'ja', 'pt-BR')
  → { trans_cont: string, cached: boolean }

  동작:
  1. msg_trans 테이블에서 (msgId, locale) 캐시 조회
  2. 캐시 HIT  → 즉시 반환 (Claude API 호출 없음)
  3. 캐시 MISS → 서버 in-memory pending map 확인
               → 동일 (msgId, locale) 진행 중이면 대기 후 결과 공유
               → 없으면 Claude Haiku 호출 → DB 저장 → Supabase broadcast
```

**번역 broadcast 이벤트 (`msg_trans`)**:
```json
{
  "event": "msg_trans",
  "payload": {
    "msg_id": "uuid",
    "locale_cd": "ko",
    "trans_cont": "번역된 텍스트"
  }
}
```

클라이언트는 `use-chat-room.ts`에서 `msg_trans` 이벤트를 구독하여 해당 msg_id 메시지를 번역본으로 교체한다. 같은 locale을 선택한 모든 사용자가 1회 번역으로 동시에 업데이트된다.

```
GET /api/chat/rooms/[roomId]/messages?limit=50&before=<msg_id>&locale=<locale>
  → messages 배열에 trans_cont 필드 포함 (캐시된 번역 있으면 pre-populated)
```
```
GET /api/chat/rooms/[id]/messages?limit=50&before=<msg_id>
→ { messages: [...], hasMore: boolean, oldestMsgId: string }
```

### 테마 API

```
GET  /api/chat/themes                     테마 목록 (사용자 잠금 상태 포함)
POST /api/chat/themes/[cd]/unlock         단건 잠금해제 (결제 완료 후 호출)
```

### 구독 API

```
GET    /api/subscriptions/plans           플랜 목록 + 현재 사용자 등급
GET    /api/subscriptions                 내 구독 현황
POST   /api/subscriptions                 구독 시작 (Pi 결제 완료 후 msg_subscr UPSERT)
DELETE /api/subscriptions                 구독 취소

GET    /api/subscriptions/check           기능별 권한 체크
  → { canTip, canCreateRoom, canSendFile, aiQuota, storageQuota }
```

#### PiRC2 Soroban 스마트 컨트랙트 통합

Pi Testnet에서 PiRC2 컨트랙트로 반복 결제(구독)를 구현한다.
공식 문서: `https://github.com/PiNetwork/PiRC` (PiRC2 디렉토리, 9개 섹션)

| 항목 | 값 |
|---|---|
| Contract ID (Testnet) | `CCUF75B6W3HRJTJD6O7OXNI72HGJ7DERZ5MUNOMFMSK23ME5GUIKPFYV` |
| Network passphrase | `"Pi Testnet"` |
| RPC URL | `https://rpc.testnet.minepi.com` |
| 토큰 단위 | **1 Pi = 10,000,000 units (i128)** |

**핵심 메서드 (TASK-054 관련)**:

| 메서드 | 설명 | 호출 주체 |
|---|---|---|
| `register_service(merchant, name, price, period_secs, trial_period_secs, approve_periods)` | 구독 서비스 등록 (앱 시작 1회) | 판매자 서버 |
| `subscribe(subscriber, service_id, auto_renew)` | 구독 시작 (Pi Wallet 서명 필요) | 구독자 |
| `cancel(subscriber, sub_id)` | 구독 취소 | 구독자 |
| `process(merchant, service_id, offset, limit)` | 배치 청구 실행 (페이지네이션) | 판매자 서버 (cron) |
| `is_subscription_active(subscriber, service_id)` | 구독 활성 여부 확인 | read-only |
| `get_subscription(subscriber, sub_id)` | 구독 상세 조회 | read-only |

**구독 행동 매트릭스**:

| 조건 | auto_renew=true | auto_renew=false |
|---|---|---|
| 무료 체험 있음 | 즉시 결제 없음 + approve_periods 토큰 승인 | 체험 기간만, 만료 시 종료 |
| 무료 체험 없음 | 즉시 첫 기간 결제 + approve_periods 승인 | 즉시 첫 기간 결제 + 1기간 승인 |

**TASK-054 구현 전략**:
- **단기 (현재)**: 기존 U2A 결제 흐름 유지 (`metadata.type='CHAT_SUBSCR'`) → `msg_subscr` DB 관리 (앱 레벨 구독). 사용자 경험 동일.
- **중기 (Pi SDK Soroban 지원 시)**: `subscribe()` 직접 통합. `process()` cron은 판매자 서버 키로 즉시 구현 가능.

**플랜-가격 매핑** (PiRC2 price 단위 = units):

| 플랜 | Pi 가격 | units (i128) | 기간 |
|---|---|---|---|
| PREMIUM_MONTHLY | 1 Pi/월 | 10,000,000 | 30일 |
| PREMIUM_ANNUAL | 10 Pi/년 | 100,000,000 | 365일 |
| BUSINESS_MONTHLY | 5 Pi/월 | 50,000,000 | 30일 |
| BUSINESS_ANNUAL | 50 Pi/년 | 500,000,000 | 365일 |

### 스티커 API

```
GET  /api/stickers/packs                  스티커 팩 마켓 (테마별 필터)
POST /api/stickers/packs                  스티커 팩 구매 (결제 완료 후)
GET  /api/stickers/mine                   보유 스티커 목록
```

### Pi Tip API

```
GET  /api/tips                            Tip 내역 (수신/발신)
POST /api/tips                            Tip 기록 (결제 완료 후 호출)
```

### 관리자 API

```
GET    /api/admin/chat/rooms              전체 카페 목록
DELETE /api/admin/chat/rooms/[id]         강제 삭제 (MASTER)

GET    /api/admin/chat/subscriptions      구독 현황 통계

GET    /api/admin/chat/themes             테마 목록
POST   /api/admin/chat/themes             신규 테마 추가
PATCH  /api/admin/chat/themes/[cd]        테마 수정 (이름·이모지·등급)
DELETE /api/admin/chat/themes/[cd]        테마 비활성화
```

---

## 10. 기술 아키텍처

### 실시간 메시지 (Supabase Realtime)

```typescript
// src/hooks/use-chat-room.ts
const channel = supabase.channel(`msg_room:${roomId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'msg_msg',
    filter: `room_id=eq.${roomId}`,
  }, (payload) => addMessage(payload.new as MsgMsg))
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState()
    setOnlineUsers(Object.keys(state))
  })
  .subscribe()
```

### RLS 정책 (카페 멤버만 구독 가능)

```sql
ALTER TABLE msg_msg ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_member_read" ON msg_msg
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM msg_room_mbr
      WHERE room_id = msg_msg.room_id
        AND usr_id = auth.uid()
        AND del_yn = 'N'
        AND (expire_dtm IS NULL OR expire_dtm > NOW())
    )
  );
```

### 구독 등급 체크 헬퍼 (src/lib/chat-auth.ts)

```typescript
export type ChatPlan = 'FREE' | 'PREMIUM' | 'BUSINESS'

export async function getChatPlan(userId: string): Promise<ChatPlan>
export function canCreateRoom(plan: ChatPlan): boolean
export function canSendTip(plan: ChatPlan): boolean
export function getMaxRoomJoin(plan: ChatPlan): number  // FREE: 5, 나머지: Infinity
export function getMaxMembers(plan: ChatPlan): number   // FREE/PREMIUM: 50, BUSINESS: 500
export function getStorageQuotaMB(plan: ChatPlan): number  // FREE: 0, PREMIUM: 100, BUSINESS: 1024
export function getAiQuota(plan: ChatPlan): number      // FREE: 0, PREMIUM: 10, BUSINESS: -1(무제한)
```

### AI 카페 비서 (@ai 멘션)

기존 `@anthropic-ai/sdk` 연동 활용. 사용자가 메시지에 `@ai`를 포함하면 서버에서 테마별 시스템 프롬프트로 Claude API 호출 후 결과를 SYSTEM 타입 메시지로 전송한다.

```typescript
// 테마별 시스템 프롬프트 매핑 (src/lib/chat-ai-prompts.ts)
const THEME_PROMPTS: Record<string, string> = {
  GOLF:     '당신은 골프 코치입니다. 스윙 자세, 필드 전략, 장비 추천을 도와줍니다.',
  MUKBANG:  '당신은 음식 칼로리·영양 전문가입니다. 맛집 리뷰와 레시피를 안내합니다.',
  TRAVEL:   '당신은 여행 플래너이며 한국어·영어·일본어 번역을 제공합니다.',
  SWIMMING: '당신은 수영 코치입니다. 영법, 훈련 계획, 장비를 안내합니다.',
  FITNESS:  '당신은 PT 트레이너입니다. 운동 루틴, 식단, 부상 예방을 도와줍니다.',
  // ... 나머지 테마
}
```

### PiTranslateâ¢™ 번역 아키텍처

#### AI 엔진 역할 분리 (하이브리드 전략)

| 역할 | 엔진 | 이유 |
|---|---|---|
| **번역·언어감지** (`msg_trans`) | **Gemini 2.0 Flash** | 대량 처리·저비용 ($0.10/1M 입력 토큰) — Claude Haiku 대비 ~5x 저렴 |
| **AI 카페 비서** (`@ai` 멘션) | **Claude Haiku** (`claude-haiku-4-5-20251001`) | 이미 통합된 SDK, 테마 맥락·슬랭·Pi 생태계 이해 우수 |

```
번역 10,000건/일:  Gemini Flash ~$0.20/일  (Claude Haiku 사용 시 ~$1/일)
AI 비서 500건/일:  Claude Haiku ~$0.05/일
────────────────────────────────────────────
월 합계:           ~$7.5/월  (단일 Claude Haiku 사용 시 ~$31.5/월)
절감액:            ~76% 비용 절감
```

#### 번역 엔진: Gemini 2.0 Flash

```typescript
// src/lib/chat-translate.ts
// pnpm add @google/generative-ai
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/env'

const gemini = new GoogleGenerativeAI(env.GEMINI_API_KEY)
const geminiModel = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' })

// Gemini Flash 장애 시 Claude Haiku로 자동 fallback
const anthropic = new Anthropic()

export async function translateMessage(
  text: string,
  targetLocale: string,
): Promise<{ translated: string; detectedLang: string }> {
  const prompt = [
    `Translate the following chat message to locale "${targetLocale}".`,
    `Preserve emojis, slang, and tone exactly.`,
    `Return JSON only — no markdown, no explanation: {"translated":"...","lang":"<ISO 639-1 code>"}`,
    `Message: ${text}`,
  ].join('\n')

  try {
    // 1차: Gemini 2.0 Flash (저비용 고속)
    const result = await geminiModel.generateContent(prompt)
    return JSON.parse(result.response.text())
  } catch {
    // 2차: Claude Haiku fallback (Gemini API 장애 시 번역 단절 방지)
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { text: string }).text
    return JSON.parse(raw)
  }
}
```

#### 동시성 패턴: in-memory pending map

같은 `(msgId, locale)` 번역 요청이 동시에 여러 건 들어와도 Claude API는 1회만 호출된다.

```typescript
// src/lib/chat-translate-dedup.ts
const pending = new Map<string, Promise<string>>()

export async function getOrTranslate(msgId: string, locale: string, text: string): Promise<string> {
  const key = `${msgId}:${locale}`

  // 이미 진행 중인 번역이 있으면 그 Promise를 공유
  if (pending.has(key)) return pending.get(key)!

  const job = (async () => {
    // 1. DB 캐시 확인
    const cached = await getCachedTranslation(msgId, locale)
    if (cached) return cached

    // 2. Claude Haiku 호출
    const { translated } = await translateMessage(text, locale)

    // 3. DB 저장
    await saveTranslation(msgId, locale, translated)

    return translated
  })().finally(() => pending.delete(key))

  pending.set(key, job)
  return job
}
```

#### Supabase Realtime broadcast 흐름

```
POST /api/chat/rooms/[roomId]/messages/[msgId]/translate
  │
  ├─ 캐시 HIT → 즉시 반환
  │
  └─ 캐시 MISS
       ├─ pending map 조회 (동시 요청 dedup)
       ├─ Claude Haiku 호출 (1회)
       ├─ msg_trans DB 저장
       └─ Supabase broadcast('msg_trans', { msg_id, locale_cd, trans_cont })
              │
              └─ 같은 locale 선택 모든 사용자 동시 수신
                 use-chat-room.ts의 'msg_trans' 이벤트 핸들러가
                 해당 msg_id 메시지의 msg_cont를 trans_cont로 교체
```

#### 클라이언트 훅 확장 (`use-chat-room.ts`)

```typescript
// msg_trans 이벤트 구독 추가 (기존 new_msg와 동일 채널)
channel
  .on('broadcast', { event: 'new_msg' }, ({ payload }) => {
    addMessage(payload as ChatMessage)
  })
  .on('broadcast', { event: 'msg_trans' }, ({ payload }) => {
    const { msg_id, locale_cd, trans_cont } = payload as MsgTransPayload
    // 사용자의 선택 언어와 일치할 때만 적용
    if (locale_cd === userLocale) {
      updateMessageTranslation(msg_id, trans_cont)
    }
  })
```

#### 번역 자동 트리거 전략

메시지 전송 시 서버가 방 참가자 locale 목록을 조회해 **자동으로 번역을 큐에 올린다.** 사용자가 버튼을 누를 필요가 없다.

```typescript
// POST /api/chat/rooms/[roomId]/messages — 메시지 전송 후
const roomLocales = await getDistinctRoomLocales(roomId)    // 방 멤버들의 locale 목록
const srcLang = await detectLanguage(msg_cont)              // Claude Haiku로 원본 언어 감지

for (const locale of roomLocales) {
  if (locale !== srcLang) {
    // 비동기 번역 큐 (응답을 블로킹하지 않음)
    void queueTranslation(msgId, locale, msg_cont)
  }
}
```

---

## 11. 보안 요구사항

| 항목 | 요건 |
|---|---|
| XSS 방지 | 메시지 콘텐츠 서버 측 sanitize (HTML 태그 제거) |
| Pi Tip 금액 검증 | `payment.amount === tip_amt_pi` 서버 재검증 (클라이언트 bypass 방지) |
| 멤버십 체크 | 모든 메시지 API에서 `msg_room_mbr` 존재·만료 여부 확인 |
| Realtime 접근 제한 | RLS 정책: 카페 멤버만 구독 가능 |
| Rate limiting | 메시지 전송 1초당 최대 5건 |
| 이벤트방 만료 | `entry_expire_dtm` 비교 — 만료 후 입장 불가 |
| 구독 등급 재검증 | 모든 유료 기능 API에서 서버 측 `msg_subscr` 재조회 |
| 파일 업로드 | MIME 타입 화이트리스트, 최대 파일 크기 강제 |
| Pi 결제 검증 | 결제 완료 후처리 전 Pi Network API에서 상태 재확인 |

---

## 12. 개발 로드맵 (Phase 7~9)

### Phase 7: 카페 MVP

| Task | 내용 |
|---|---|
| TASK-050 | DB 마이그레이션 (`msg_*` 13개 테이블) |
| TASK-051 | 테마 마스터 데이터 세팅 (20개 테마 + 기본 스티커팩) |
| TASK-052 | 1:1 카페 API + Supabase Realtime 구독 |
| TASK-053 | 그룹 카페 생성 (Pi 결제 연동 + 테마 선택 UX) |
| TASK-054 | 구독 시스템 (플랜 관리 + Pi 결제) |

### Phase 8: 수익화 기능

| Task | 내용 |
|---|---|
| TASK-060 | Pi Tip (인라인 결제 + TIP_NOTI 메시지 자동 발송) |
| TASK-061 | 스티커 마켓 (테마별 팩 + 인라인 업셀 트리거) |
| TASK-062 | 인라인 구매 트리거 8종 구현 |
| TASK-063 | 이벤트 카페 (유료 입장 + 방장 수익 분배) |
| TASK-064 | AI 카페 비서 (`@ai` 멘션 + 테마별 프롬프트) |
| TASK-065 | 파일·이미지·음성 메시지 (Supabase Storage) |

### Phase 9: 생태계 확장

| Task | 내용 |
|---|---|
| TASK-070 | 카페 마켓플레이스 (테마별 공개방 디렉토리) |
| TASK-071 | Pi Bet 투표 (카페 내 베팅 이벤트) |
| TASK-072 | 카페 봇·Webhook 연동 (Business 전용) |
| TASK-073 | 분석 대시보드 (Business: 방 통계, 수익) |
| TASK-074 | 커스텀 스티커 제작 (Business: 브랜드 스티커팩) |

### Phase 10: 글로벌 동시통역 (PiTranslateâ¢™) ⭐ 글로벌 런칭 킬러 피처

| Task | 내용 | 우선순위 |
|---|---|---|
| TASK-090 | `msg_trans` 테이블 DDL + `msg_msg.src_lang_cd` 컬럼 추가 마이그레이션 + `env.ts`에 `GEMINI_API_KEY` 추가 | P0 |
| TASK-091 | `src/lib/chat-translate.ts` — Gemini 2.0 Flash 번역·언어감지 (Claude Haiku fallback 포함) | P0 |
| TASK-092 | `src/lib/chat-translate-dedup.ts` — in-memory pending map 동시성 처리 | P0 |
| TASK-093 | `POST /api/chat/rooms/[roomId]/messages/[msgId]/translate` API 라우트 | P0 |
| TASK-094 | 메시지 전송 시 방 참가자 locale 조회 → 자동 번역 큐 (비동기, non-blocking) | P0 |
| TASK-095 | `use-chat-room.ts` 확장 — `msg_trans` broadcast 이벤트 구독 + 메시지 교체 | P0 |
| TASK-096 | 사용자 프로필 — 표시 언어 설정 UI (203개 locale, 1회 설정) | P1 |
| TASK-097 | 메시지 버블 `[원문 보기]` 토글 UI (번역 투명성 보장) | P1 |
| TASK-098 | 번역 통계 어드민 대시보드 (일별 번역 건수, 캐시 히트율, 비용 추정) | P2 |
| TASK-099 | 번역 품질 피드백 (메시지별 👍/👎 — 향후 fine-tune 데이터) | P3 |

**Phase 10 구현 순서**: TASK-090 → 091 → 092 → 093 → 094 → 095 (P0 완료 = MVP) → 096 → 097 → 098 → 099

---

## 13. 구현 파일 목록 (참고)

```
docs/PRD_CHAT.md                           ← 이 문서
sql/011_msg_tables.sql                     Phase 7 시작 시 작성

src/lib/chat-auth.ts                       구독 등급 체크 헬퍼 (server-only)
src/lib/chat.ts                            카페 CRUD 헬퍼
src/lib/chat-ai-prompts.ts                 테마별 AI 시스템 프롬프트

src/hooks/use-chat-room.ts                 Realtime 구독 훅 (클라이언트)

src/app/api/chat/rooms/route.ts            카페 목록·생성
src/app/api/chat/rooms/[roomId]/route.ts   카페 상세·설정·삭제
src/app/api/chat/rooms/[roomId]/messages/route.ts
src/app/api/chat/rooms/[roomId]/members/route.ts
src/app/api/chat/rooms/[roomId]/join/route.ts
src/app/api/chat/themes/route.ts
src/app/api/chat/themes/[cd]/unlock/route.ts
src/app/api/subscriptions/route.ts
src/app/api/subscriptions/plans/route.ts
src/app/api/subscriptions/check/route.ts
src/app/api/stickers/packs/route.ts
src/app/api/stickers/mine/route.ts
src/app/api/tips/route.ts
src/app/api/admin/chat/rooms/route.ts
src/app/api/admin/chat/themes/route.ts
src/app/api/admin/chat/subscriptions/route.ts

src/app/[locale]/chat/page.tsx             카페 홈 (테마 탐색 + 공개방 목록)
src/app/[locale]/chat/[roomId]/page.tsx    카페

src/components/chat/theme-selector.tsx    테마 선택 (카페 생성 Step 1)
src/components/chat/chat-room-list.tsx
src/components/chat/chat-message-list.tsx
src/components/chat/chat-input.tsx
src/components/chat/sticker-picker.tsx
src/components/chat/pi-tip-button.tsx
src/components/chat/subscription-gate.tsx
src/components/chat/inline-purchase-prompt.tsx  인라인 구매 트리거 공통

--- Phase 10: PiTranslateâ¢™ 신규 파일 ---
sql/018_msg_trans.sql                      msg_trans 테이블 + msg_msg.src_lang_cd 마이그레이션

src/lib/chat-translate.ts                  번역 엔진 (Gemini 2.0 Flash 주력 + Claude Haiku fallback)
src/lib/chat-translate-dedup.ts            in-memory pending map 동시성 처리

src/app/api/chat/rooms/[roomId]/messages/[msgId]/translate/route.ts
                                           번역 API (캐시 → dedup → Gemini Flash → broadcast)
src/hooks/use-auto-translate.ts            번역 상태 훅 (원문/번역 토글, locale 설정)

src/components/chat/translated-message.tsx 번역된 메시지 버블 + [원문 보기] 토글
src/components/chat/lang-setting-button.tsx 카페 내 표시 언어 변경 버튼
```

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| 버전 | 날짜 | 내용 |
|---|---|---|
| v1.0 | 2026-06-07 | 최초 작성 — 테마 퍼스트 + 인라인 구매 트리거 8종 + DA 표준 DB 스키마 |
| v1.1 | 2026-06-07 | 섹션 1-1 추가 — "왜 Pi를 내면서까지 사용하는가" 사용자 동기 8가지 분석 |
| v1.2 | 2026-06-07 | 섹션 1-2 추가 — Discord 차별화 전략 (포지셔닝 맵·3중 해자·전술) / 섹션 1-3 추가 — 탈중앙화·E2E 암호화·프라이버시 선언 |
| v1.3 | 2026-06-08 | 섹션 9 구독 API에 PiRC2 Soroban 스마트 컨트랙트 통합 스펙 추가 — Contract ID·핵심 메서드·구독 매트릭스·플랜-가격 매핑·TASK-054 구현 전략 |
| v1.4 | 2026-06-10 | 글로벌 동시통역 (PiTranslateâ¢™) 전면 추가 — 섹션 1-4 신설·KPI 번역 지표·DB `msg_trans` 테이블·번역 API·기술 아키텍처(Claude Haiku + dedup + broadcast)·Phase 10 로드맵 TASK-080~089 |
| v1.5 | 2026-06-10 | 번역 엔진 하이브리드 전략 확정 — **Gemini 2.0 Flash**(번역·감지) + **Claude Haiku**(AI 비서) 역할 분리. Gemini 장애 시 Claude Haiku fallback. 비용 ~76% 절감. `GEMINI_API_KEY` env 추가 |
| v1.6 | 2026-06-10 | Phase 10 TASK 번호 전역 재번호화 — TASK-080~089 → **TASK-090~099** (ROADMAP Phase 11이 TASK-080~087을 ✅ 완료 상태로 선점, 충돌 해소). `sql/014_msg_trans.sql` → `sql/018_msg_trans.sql` (014~017 이미 할당). Phase 12로 명칭 통일 |
