# UI 설계서 — seminar.pi 화상 세미나 화면

> 버전 v1.0 · 작성 2026-10-26 · 상태 **확정 — 13절 마스터 결정 8건 반영(2026-10-26)** · v0.2 = 오픈소스 2종(LiveKit Meet·Jitsi Meet) 소스 정밀 분석 반영(14절) — **14절이 앞 절과 다르면 14절이 우선**
> 연결 : [PRD](../PRD.md) 6절(화면 [TBD])·F-02~F-05 · 시그널링 정본 [SIGNAL_API](../SIGNAL_API.md) v1.0 · 엔진 [PRD_01](../PRD_01_MEDIA_ENGINE.md) · 현재 화면 `src/app/[locale]/lab/sfu/sfu-lab.tsx`(실험실)
> 외부 사실 확인일 2026-10-26(웹 검색). 수치는 2차 인용이라 바뀔 수 있다.

## 0. 요약

| 질문 | 답 |
|---|---|
| 가장 많이 쓰는 업무용 화상회의 앱 | 1 Zoom · 2 Microsoft Teams · 3 Google Meet · 4 Cisco Webex · 5 GoTo Meeting |
| UI 가 가장 쉬운 앱(seminar.pi 조건 기준) | **1 Google Meet** · 2 Zoom · 공동 3 Teams·Webex · 5 GoTo Meeting |
| 차용 방식 | **Google Meet 의 화면 흐름·배치**를 뼈대로 하고, 세미나(1명 → 다수)에 필요한 **발표자 고정·손들기·Q&A 는 Zoom Webinar 방식**을 보탠다. 상표·색·아이콘은 복제하지 않는다(4절) |
| 바로 만들 화면 | 대기실(입장 전 미리보기) · 룸(무대 + 하단 컨트롤 바 + 사이드 패널) — 5절·6절 |
| 정밀 근거(v0.2) | Meet 은 상용이라 코드를 보지 않고(S-2), 같은 구조의 **오픈소스 LiveKit Meet·Jitsi Meet 소스를 파일:줄 단위로 분석**해 수치·알고리즘을 확정 — 14절 |
| 엔진 변경 | 기존 메시지(SIGNAL_API v1.0)로 마이크·카메라·나가기·화질 상한을 처리한다. **v1.1 추가 필요**(14.7 통합안) : 필수 A 참가자 목록 · B producer `source` · C 채팅·손들기·반응 · D 역할 승격/강등(M3), 후속 E 사회자 음소거 · F 레이아웃 · G 발언자(M4~M5). 합의 전에는 해당 UI 를 숨긴다 |

---

## 1. 조사 — 사용량 순위 1~5위

| 순위 | 앱 | 규모 근거 | 지표 | 비고 |
|---|---|---|---|---|
| 1 | Zoom Workplace | 활성 계정 기준 점유율 약 55% | 활성 계정 점유율 — 원출처 Statista 2025 · 인용 [Voxbooster](https://voxbooster.com/blog/video-conferencing-statistics-2026) | 공식 사용자 수는 2020-12(일 회의 참가자 3.5억) 이후 미공개 — 인용 [Tactiq](https://tactiq.io/learn/zoom-meeting-statistics-2026). 회계연도 2026 매출 48.7억 달러 — 인용 [Carly](https://www.usecarly.com/blog/zoom-statistics/), Zoom IR 1차 대조 [확인중 : 서비스] |
| 2 | Microsoft Teams | 일간 활성 사용자 약 3.2억 | DAU — 원출처 DemandSage · 인용 Voxbooster | Microsoft 1차 공시 미확인 [확인중 : 서비스] |
| 3 | Google Meet | 월간 활성 사용자 약 3억 | MAU — 원출처 ElectroIQ 2025 · 인용 Voxbooster | Google 1차 공시 미확인 [확인중 : 서비스] |
| 4 | Cisco Webex | Fortune 500 의 95% 도입 | 기업 도입률 — 인용 Voxbooster | 대기업·공공 중심, 전체 점유율 수치 없음 |
| 5 | GoTo Meeting | — | 비교 수치 없음 | Skype 2025-05 서비스 종료는 서비스 기억 기준 [확인중 : 서비스] |

**주의** : 앱마다 공개 지표가 다르다(점유율·DAU·MAU·도입률). 서로 직접 비교할 수 없다. 1~3위는 수치가 있는 대략 순위, **4·5위는 비교 지표가 없어 잠정** [확인중 : 서비스]. 웹사이트에 끼워 넣은 화상 도구를 세는 통계(WMTips)는 Jitsi 를 1위로 집계하지만 업무용 사용자 수와 다른 지표라 제외했다.

출처 : [Voxbooster 화상회의 통계 2026](https://voxbooster.com/blog/video-conferencing-statistics-2026) · [WMTips Video Conferencing](https://www.wmtips.com/technologies/video-conferencing) · [Tactiq Zoom 통계 2026](https://tactiq.io/learn/zoom-meeting-statistics-2026) · [Carly Zoom 통계](https://www.usecarly.com/blog/zoom-statistics/)

## 2. UI 친화도 재순위

### 2.1 평가 기준 — seminar.pi 조건에 맞춘 5개

seminar.pi 사용자는 **Pi Browser(모바일 WebView, 앱 설치 불가)** 안에서 입장한다. 그래서 "데스크톱 앱이 예쁜가"가 아니라 아래 5개로 본다.

| # | 기준 | 왜 |
|---|---|---|
| K1 | 설치 없이 웹에서 완전한 기능 | Pi Browser 는 별도 앱을 깔 수 없다 |
| K2 | 첫 입장까지 단계 수 | 세미나 참가자는 처음 오는 사람이 대부분 |
| K3 | 모바일 하단 컨트롤 수(적을수록 좋음) | 좁은 세로 화면 |
| K4 | 학습 부담(메뉴 깊이·숨은 기능) | 비전문 커뮤니티 사용자 |
| K5 | G2 Ease of Use(참고) | 외부 사용자 평가. Teams 쉬움 4위·Zoom 6위(점수 9.1), **Google Meet 은 이번 검색에서 데이터 없음** — 참고만 |

### 2.2 점수 (5점 만점, 서비스 판정)

| 앱 | K1 웹 완결 | K2 입장 단계 | K3 컨트롤 수 | K4 학습 부담 | 합계 | 순위 |
|---|---|---|---|---|---|---|
| **Google Meet** | 5 — 처음부터 브라우저 전용 설계 | 5 — 링크 → 대기실 1화면 → 입장 | 5 — 하단 바 5~6개 | 5 — 기능 대부분이 바에 바로 보임 | **20** | **1** |
| Zoom | 3 — 웹 클라이언트는 기능 축소, 앱 설치 유도 | 3 — 앱 열기 안내 화면을 거침 | 3 — 바 8~9개 + 더보기 | 3 — 설정 많음, 웨비나 모드는 우수 | 12 | 2 |
| Microsoft Teams | 3 — 웹판 있음, 조직 계정 전제 | 2 — 계정·테넌트 선택 | 3 | 2 — 채팅·팀·채널 등 회의 밖 기능이 섞임 | 10 | 공동 3 |
| Cisco Webex | 3 — 웹 앱 있음, 기업 계정 중심 | 2 — 회의 번호·계정 단계 | 3 | 2 — 기업용 설정 많음 | 10 | 공동 3 |
| GoTo Meeting | 2 — 앱 설치 중심 | 2 | 3 | 3 — 회의 기능만이라 단순 | 10 | 5 |

동점(10점)은 K1(웹 완결)을 우선해 GoTo 를 5위로 두고, K1·K4 까지 같은 Teams·Webex 는 공동 3위다. K5 는 Meet 자료가 없어 합계에서 뺐다. 점수는 공개 사용 경험에 근거한 서비스 판정이다(실측 아님).

**판정 : 1위 Google Meet.** 근거는 ① 설치 없는 웹 입장이 기본 경로이고 ② 대기실 한 화면에서 카메라·마이크를 점검한 뒤 들어가며 ③ 하단 바 하나에 핵심 기능이 다 있어 숨은 메뉴가 거의 없다는 점이다. 셋 다 Pi Browser 조건과 그대로 맞는다.

**보완 : Zoom Webinar.** Meet 은 "모두가 참가자"인 회의형이다. seminar.pi 는 발표자 1명(또는 패널 몇 명)이 청중 다수에게 보내는 **웨비나형**이므로, 청중은 기본 비발행·발표자 고정·손들기·질문(Q&A) 같은 웨비나 기능을 Zoom Webinar 방식으로 보탠다.

출처 : [G2 무료 화상회의 소프트웨어](https://www.g2.com/categories/video-conferencing/free) · [G2 Zoom 비교](https://www.g2.com/compare/freeconference-com-vs-zoom-workplace)

## 3. 1위 Google Meet — UI·핵심 기능 분석

> 아래 동작 설명은 서비스가 알고 있는 Google Meet 웹 화면 기준이다. 버튼 구성·단축키·자동 숨김 동작은 Google 이 수시로 바꾸므로 **[확인중 : 서비스 — Google Meet 고객센터 대조]**. 설계 결정은 이 표의 "왜 쉬운가"(원리)에 근거하므로 세부가 달라도 적용 설계는 유효하다.

| # | 요소 | 동작 | 왜 쉬운가 | seminar.pi 적용 |
|---|---|---|---|---|
| G1 | **대기실(green room)** | 입장 전 내 카메라 미리보기, 마이크·카메라 켜고 끄기, 이름 확인, "지금 참여" 큰 버튼 | 들어가기 전에 "내 모습·소리"를 확인해 불안이 없다 | 그대로 — **Pi Browser 자동재생 정책 해결에도 쓴다**(입장 버튼 탭 = 사용자 제스처 → 이후 `video.play()` 성공) |
| G2 | **무대(stage)** | 화면 대부분이 영상. 발표 중이면 발표 화면 크게 + 나머지 작게 | 볼 것이 하나라 시선이 흩어지지 않음 | 발표자 고정(spotlight) 기본 |
| G3 | **하단 컨트롤 바** | 가운데에 마이크·카메라·손들기·반응·화면공유·더보기·빨간 나가기 | 모든 핵심 기능이 엄지 닿는 한 줄 | 역할별로 버튼 수를 줄여 4~5개(6.1) |
| G4 | **토글 상태 색** | 꺼진 마이크·카메라는 빨간 원 버튼 | 상태를 색 하나로 즉시 인지 | 꺼짐 = danger 색 채움(9절 토큰) |
| G5 | **사이드 패널** | 오른쪽 아래 채팅·참가자·활동 아이콘 → 오른쪽 패널(모바일은 전체 화면 시트) | 무대를 가리지 않고 필요할 때만 | 같은 구조, 모바일은 하단 시트 |
| G6 | **자동 숨김** | 몇 초 무조작이면 바가 사라지고 화면 탭으로 복귀 | 영상 면적 최대 | 데스크톱 4초 무조작 숨김(포인터가 바 위·메뉴 열림이면 유지), **모바일은 타이머 없이 탭 토글** — 14.3 Jitsi 근거 |
| G7 | **말하는 사람 표시** | 타일 테두리·음성 막대 | 누가 말하는지 바로 앎 | 오디오 레벨로 타일 링 표시(클라이언트 `AudioContext` 측정, 서버 변경 없음) |
| G8 | **손들기·반응** | 손들기는 참가자 목록 상단 정렬 + 알림, 이모지 반응은 화면에 떠오름 | 말 끊지 않고 의사 표시 | 웨비나에서 더 중요 — 7.2 신규 메시지 |
| G9 | **단축키** | `Ctrl+D` 마이크, `Ctrl+E` 카메라 | 데스크톱 고급 사용자 속도 | 데스크톱만 같은 키 지원 |
| G10 | **연결 품질 안내** | 네트워크 불안정 시 상단 토스트 | 화질 저하 이유를 알려 줌 | 엔진 `score`(M4) 알림을 받으면 표시 |

## 4. 차용 원칙

1. **패턴만 차용한다.** 화면 흐름(대기실 → 무대 → 하단 바)과 배치는 업계 공통 관례라 따른다.
2. **Google 상표·로고·고유 색 조합·아이콘 세트는 복제하지 않는다**(트레이드 드레스 위험 + 등재 심사 "독립 완성도"). 색은 seminar.pi 기존 다크 토큰에서 확장(9절), 아이콘은 오픈 라이선스 세트를 쓴다 [TBD : 아이콘 세트 — 현재 의존성 없음, 인라인 SVG 로 시작].
3. **Pi 결제·로그인 흐름이 우선한다.** 외부 앱의 패턴이 핵심 가치(Pi Browser 로그인·결제·입장)와 부딪히면 패턴을 버린다.

## 5. seminar.pi 화면 5종

PRD 6절 초안(목록·상세·화상 룸·개최·내 세미나)을 아래로 확정 제안한다. 내 세미나는 목록의 탭으로 합쳐 화면 수를 줄인다.

| # | 화면 | 경로(제안) | 핵심 | PRD |
|---|---|---|---|---|
| S1 | 목록 | `/[locale]` (홈) | 예정·진행 중 세미나 카드, **서버 페이지네이션**(데이터 패칭 표준 ①), 탭 : 전체·내가 연 것·내가 참가한 것 | F-03 |
| S2 | 상세 | `/[locale]/s/[id]` | 제목·일시·개최자·정원·입장료, 버튼 1개(무료 = "입장", 유료 = "Pi 로 결제하고 입장") | F-03·F-04 |
| S3 | **대기실** | `/[locale]/s/[id]/join` | G1 — 미리보기·토글·이름·입장 | F-05 |
| S4 | **룸** | 같은 경로, 입장 후 상태 전환(페이지 이동 없음) | G2~G10 | F-05 |
| S5 | 개최 | `/[locale]/host/new` | 제목·일시·정원·입장료 입력 | F-02 |

> S3 → S4 를 **같은 페이지의 상태 전환**으로 두는 이유 : 대기실에서 얻은 카메라 스트림·사용자 제스처를 그대로 룸에 넘긴다. 페이지를 이동하면 스트림이 끊기고 Pi Browser 에서 자동재생이 다시 막힌다.

### 5.1 대기실 (S3) — 모바일 세로

```
┌──────────────────────────────┐
│ ← 세미나 제목                  │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │                          │ │
│ │   내 카메라 미리보기       │ │  ← 발표자·패널만. 청중은 아바타 원(비발행)
│ │                          │ │
│ │      (🎤)   (📷)          │ │  ← 미리보기 위 토글 2개
│ └──────────────────────────┘ │
│ 이름  [ pioneer_kim       ]  │  ← 세션 사용자 display_name || pi_username(입장권 발급 규칙과 같음), 표시만
│ 역할  발표자 · 청중 3명 대기 중 │  ← 인원 수는 v1.1 참가자 목록 합의 후(7.2)
│                              │
│ ┌──────────────────────────┐ │
│ │        지금 입장          │ │  ← 큰 기본 버튼(제스처 확보)
│ └──────────────────────────┘ │
│ 카메라 권한이 필요합니다 (거부 시 안내) │
└──────────────────────────────┘
```

- 청중은 카메라를 요청하지 않는다(권한 팝업 0회 → 입장 마찰 최소).
- 카메라 권한 거부·장치 없음은 오류 문구 + "카메라 없이 입장"(발표자는 음성만 발행).

### 5.2 룸 (S4) — 모바일 세로, 청중

```
┌──────────────────────────────┐
│ ● 진행 중 · 31명   [연결 양호] │  ← 상단 정보 줄(자동 숨김)
├──────────────────────────────┤
│                              │
│                              │
│      발표자 영상 (고정)         │  ← 무대. 탭 = 컨트롤 표시/숨김
│                              │
│  🎤✕ 김발표                   │  ← 이름·음소거 표시(producerPaused)
├──────────────────────────────┤
│ 👏 🎉 ❤️ (떠오르는 반응)        │
├──────────────────────────────┤
│  ✋     😊     💬     👥    (⏻) │  ← 하단 바 : 손들기·반응·채팅·참가자·나가기(빨강)
└──────────────────────────────┘
```

### 5.3 룸 (S4) — 데스크톱, 발표자

```
┌───────────────────────────────────────────────┬──────────────┐
│ 세미나 제목 · ● 진행 중 · 31명         [연결 양호] │ 채팅 | 참가자 │
├───────────────────────────────────────────────┤              │
│                                               │ ✋ 이청중 (1)  │
│              발표 화면 / 내 카메라 (고정)          │ ──────────── │
│                                               │ 질문 : …      │
│                                  ┌─────────┐  │              │
│                                  │ 패널 타일 │  │              │
│                                  └─────────┘  │              │
├───────────────────────────────────────────────┤ [메시지 입력] │
│        (🎤) (📷) (🖥) (✋목록)          (⏻ 종료) │              │
└───────────────────────────────────────────────┴──────────────┘
```

## 6. 룸 상세 설계

### 6.1 역할별 하단 컨트롤

엔진 역할 3종(`presenter`·`panel`·`audience`, SIGNAL_API 6절 `role`)에 맞춘다.
현재 입장권 API(`src/app/api/media/ticket/route.ts`)는 `cap: present|watch` 로 **presenter(관리자만)·audience 2종만** 발급한다 — panel 발급 경로와 개최자의 presenter 권한(F-02)은 [TBD : 13절 #8]. 그 전까지 panel 열은 설계만 둔다.

| 버튼 | presenter | panel | audience | 동작 |
|---|---|---|---|---|
| 마이크 | ● | ● | — | 켜기/끄기 토글 |
| 카메라 | ● | ● | — | 켜기/끄기 토글 |
| 화면공유 | ●* | ●* | — | 화면 트랙 발행(`source: screen`) |
| 손들기 | — | — | ● | 토글, 발표자 참가자 목록 상단에 정렬 |
| 반응 | — | ● | ● | 이모지 7종(14.4, 13절 #4 결정) |
| 채팅·참가자 | ● | ● | ● | 사이드 패널(모바일 하단 시트) |
| 나가기 | ● (빨강) | ● | ● | `leave`. 발표자는 [나가기]/[세미나 종료] 선택 대화상자 — 종료는 `room.end`(13절 #6) |

\* **화면공유는 기능 탐지로 노출**한다 : `navigator.mediaDevices?.getDisplayMedia` 가 없으면 버튼을 숨긴다. 모바일 WebView 는 대부분 없다. **UA 로 판정하지 않는다**(루트 CLAUDE.md UA 불신 철칙과 같은 원칙).

### 6.2 레이아웃

| 모드 | 언제 | 배치 |
|---|---|---|
| 발표자 고정(기본) | 발행자 1명 | 무대 1개 꽉 채움 |
| 발표 + 패널 | 발행자 2~4명 | 큰 무대 1 + 작은 타일 줄(모바일 가로 스크롤, 데스크톱 우하단) |
| 화면공유 중 | `source: screen` producer 존재 — **받는 쪽은 v1.1 `source` 필드 추가 후 판별 가능**(7.2) | 화면공유가 무대, 발표자 카메라는 작은 타일 |

- 영상 비율 16:9 유지(`object-contain`), 세로 화면에서 위아래 여백은 배경색.
- 가로 회전 시 하단 바는 오른쪽 세로 바로 이동(영상 면적 확보).

### 6.3 상태 표시

| 상태 | 표시 | 근거 |
|---|---|---|
| 연결 중·재연결 | 상단 배지 "연결 중…" + 무대 위 스피너 | 구독 PC `connectionState` |
| 끊김 | 전체 화면 안내 + "다시 입장" | WebSocket `close` |
| 자동재생 막힘 | 영상은 항상 `muted` 로 재생, 소리만 숨긴 `<audio>` 로 분리. 소리 `play()` 거부 시 1초×3회 재시도 후 하단 바에 "🔊 소리 켜기" 버튼 | 14.5 — 소리가 막혀도 영상은 나온다(sfu-lab `needTap` 대체) |
| 상대 음소거·카메라 끔 | 타일 이름 옆 아이콘 / 카메라 끔이면 아바타 원 | `ntf producerPaused`·`producerResumed` |
| 발행자 퇴장 | 타일 제거, 무대 비면 "발표자를 기다리는 중" | `ntf producerClosed` |
| 화질 저하 | 상단 토스트 "네트워크가 불안정합니다" | `ntf score`(M4) |
| 오류 | 오류 코드별 문구(7.3) | `res ok:false`·`ntf error` |

## 7. 시그널링 매핑

### 7.1 기존 메시지로 되는 것 (SIGNAL_API v1.0 — 엔진 변경 없음)

| UI 동작 | 메시지 | 비고 |
|---|---|---|
| 입장 버튼 | `POST /api/media/ticket`(`piFetch`) → `join{ticket}` | 입장권 60초·1회용이라 버튼 탭 직후 발급 |
| 발표자 카메라·마이크 발행 | `transport.publish` → `produce{mid,kind,source}` | 대기실 스트림 재사용 |
| 마이크·카메라 끄기/켜기 | `producer.pause` / `producer.resume` | 트랙 `enabled=false` 가 아니라 서버 일시정지 → 청중 대역폭 절약 + 알림 자동 |
| 화면공유 시작/중지 | 트랙 추가 → `transport.publish`(재협상, 새 `mid`) → `produce{mid, kind:'video', source:'screen'}` / `producer.close` | 받는 쪽 레이아웃 전환은 7.2 ② 필요 |
| 상대 음소거 아이콘 | `ntf producerPaused` / `producerResumed` | 늦게 온 참가자도 입장 직후 받음 |
| 타일 크기별 화질 상한 | `consumer.setLayer{maxSpatial}` | 무대 = 2(h), 작은 타일 = 0(l). M4 부터 실효 |
| 발행자 퇴장 | `ntf producerClosed` | 해당 트랙 제거 |
| 연결 품질 토스트 | `ntf score` | M4 |
| 나가기 | `leave` | |

### 7.2 신규 필요 — SIGNAL_API v1.1 (채택 : 13절 #1 결정, 엔진 구현 전까지 해당 UI 숨김)

SIGNAL_API 머리말 규칙("이름·필드 변경은 M3 합의 필요")에 따라 **제안만** 적는다. 합의 전에는 해당 UI(인원 수·이름·참가자 패널·화면공유 레이아웃·채팅·손들기·반응)를 숨긴다.

**① 참가자 목록** — 현재 `join` 응답 `producers` 는 `{id, kind, peer}` 뿐이고 `consumerCreated` 에 이름이 없으며 입장·퇴장 알림도 없다(`envelope.go`).

| 메시지 | 방향 | `d` | 받는 사람 | 용도 |
|---|---|---|---|---|
| `join` 응답 필드 추가 | S→C | `peers: [{peerId, name, role}]` | 입장자 | 대기·입장 직후 참가자 목록·인원 수 |
| `peerJoined` (ntf) | S→C | `{peerId, name, role}` | 방 전원(본인 제외) | 목록 추가 |
| `peerLeft` (ntf) | S→C | `{peerId}` | 방 전원 | 목록 제거 |

청중 30명이 몰려 들어올 때 알림 폭주를 막으려면 `peerJoined` 도 reaction 처럼 묶음 전송을 검토한다(R-P2).

**② producer 출처** — `ProducerInfo`·`ConsumerCreated` 에 `source`(`camera`|`screen`|`mic`) 필드 추가. 필드 추가는 하위 호환(SIGNAL_API 9절).

**③ 채팅·손들기·반응**

| 메시지 | 방향 | `d` | 받는 사람 | 용도 |
|---|---|---|---|---|
| `chat.send` (req) | C→S | `{text}` (최대 500자) | — | 채팅 보내기. 서버가 길이·속도 제한(`RATE_LIMITED`) |
| `chat` (ntf) | S→C | `{peerId, name, text, ts}` | 방 전원 | 채팅 받기 |
| `hand.set` (req) | C→S | `{raised: boolean}` | — | 손들기/내리기 |
| `hand` (ntf) | S→C | `{peerId, raisedTs}` (0 = 내림, 서버 시각) | presenter·panel(+본인) | 손 든 목록 갱신 — 이름은 `peers` 목록에서 조인 |
| `hand.lowerAll` (req) | C→S | `{}` | — | presenter 만, 권한 검사는 서버 |
| `reaction.send` (req) | C→S | `{emojis: string[]}` (허용 목록만, 최대 3) | — | 반응 — 클라이언트 500ms 묶음 |
| `reaction` (ntf) | S→C | `{counts: {[emoji]: n}, ts}` | 방 전원 | 클라이언트 500ms 묶음 송신 + **서버 300ms 창 합산·익명** 방송(청중 30명 폭주 방지, R-P2) — 14.4 |

- 채팅 저장 : **저장 안 함 — 엔진은 중계만**(13절 #2 결정, DB 부하 0·개인정보 최소).
- WebRTC DataChannel 대신 기존 WebSocket 을 쓰는 이유 : 이미 열려 있고 순서·인증(입장권)이 보장된다.

### 7.3 오류 문구

| 코드 (SIGNAL_API 5절) | 화면 문구(ko) | 다음 행동 |
|---|---|---|
| `TICKET_INVALID`·`TICKET_EXPIRED` | 입장 확인이 만료되었습니다 | "다시 입장" 버튼(입장권 재발급) |
| `ROOM_FULL` | 정원이 가득 찼습니다 | 상세로 |
| `ROOM_CLOSED` | 세미나가 종료되었습니다 | 상세로 |
| `DUPLICATE_SESSION` | 다른 기기에서 입장하여 연결을 종료했습니다 | 안내만 |
| `ROLE_FORBIDDEN` | 발표 권한이 없습니다 | 청중으로 계속 |
| 그 밖 | 일시적인 오류입니다 | 재시도 |

## 8. 컴포넌트·파일 구조

```
src/
├── app/[locale]/s/[id]/join/page.tsx   # 서버 : 세미나 조회 · 비로그인이면 클라이언트 게이트(redirect 금지)
├── components/room/
│   ├── use-room.ts         # 시그널링·PC 상태 훅 — sfu-lab.tsx 에서 추출(아래)
│   ├── room-view.tsx       # 대기실 ↔ 룸 상태 전환 루트
│   ├── prejoin.tsx         # S3 대기실
│   ├── stage.tsx           # 무대 + 레이아웃 모드(6.2)
│   ├── video-tile.tsx      # 타일 : 영상·이름·음소거·말하기 링(소리 켜기는 하단 바, 14.5)
│   ├── control-bar.tsx     # 하단 바 — 역할별 버튼(6.1), 자동 숨김, 단축키
│   └── side-panel.tsx      # 채팅·참가자(손들기 정렬) — 7.2 합의 후
```
번역 키 `room.*` 는 `sitemap/seminar.pi/messages/{ko,en}.json`(src 밖)에 둔다.

**재사용 — 복제 금지** : `sfu-lab.tsx` 의 `fetchTicket`·`request`(요청·응답 짝 + 10초 타임아웃)·`newPC`·`flushIce`·`onNtf`·`publish`·`leave` 를 `use-room.ts` 로 **옮기고**, 실험실은 이 훅을 쓰도록 바꾼다(실험실은 R-P6 가드 유지).
참고 : 실험실은 `trickle` 을 `ntf` 봉투로 보내고 SIGNAL_API 3.1 은 `req` 로 정의한다. 엔진은 둘 다 받는다(`media/internal/signal/server.go` — `TypeNtf` 분기 "클라이언트 알림(trickle 등) — 응답 없음"). 훅은 응답 대기가 필요 없는 `ntf` 를 유지한다(후보마다 왕복 1회 절감).

훅 반환 형태(초안) :

```ts
type RoomState = 'idle' | 'ticket' | 'connecting' | 'joined' | 'reconnecting' | 'closed' | 'error'
type Peer = { peerId: string; name: string; role: 'presenter' | 'panel' | 'audience'; hand?: boolean }
type Track = { producerId: string; peerId: string; kind: 'audio' | 'video'; source: 'camera' | 'screen' | 'mic'; paused: boolean; stream: MediaStream }

useRoom(roomId) => {
  state, error, role, peers, tracks,
  join(localStream?), leave(),
  setMic(on), setCam(on), shareScreen(on),
  setLayer(consumerId, maxSpatial),
}
```

## 9. 디자인 토큰

`src/app/globals.css` 의 기존 다크 단일 테마(`--background #0b0d14`)를 확장한다. 룸(S4) 화면은 다크 고정(영상 주변을 어둡게 해 영상이 돋보이게). 다른 화면의 라이트 테마는 globals.css 주석대로 PRD 6절 확정 후 [TBD].

| 토큰 | 값(제안) | 용도 |
|---|---|---|
| `--background` | `#0b0d14` (기존) | 페이지·무대 여백 |
| `--surface` | `#161a24` | 타일 빈 배경·하단 바·시트 |
| `--surface-raised` | `#222838` | 버튼 기본(켜짐) |
| `--danger` | `#e5484d` | 나가기·꺼진 마이크/카메라 |
| `--accent` | `#7c6cf2` | 기본 버튼(입장)·손들기 켜짐 — seminar.pi 고유 보라(13절 #5 결정) |
| `--speaking` | `#46c98b` | 말하는 사람 타일 링 |
| `--foreground` · `--muted-foreground` | 기존 | 글자 |

Tailwind 유틸(`bg-surface`·`text-danger` 등)로 쓰려면 `@theme inline` 블록에 `--color-surface: var(--surface);` 형식으로 함께 매핑한다(기존 `--color-background` 와 같은 방식).

| 규칙 | 값 |
|---|---|
| 원형 버튼 | 지름 48px(모바일 최소 터치 타깃), 아이콘 24px, 간격 12px |
| 하단 바 여백 | `padding-bottom: max(12px, env(safe-area-inset-bottom))` — 아이폰 홈 바 |
| 모서리 | 타일 12px, 시트 상단 16px |
| 애니메이션 | 바 숨김 200ms 페이드, `prefers-reduced-motion` 이면 끔. 반응 떠오르기 1.5s |

## 10. 접근성·다국어

- 토글 버튼은 `aria-pressed`, 라벨은 상태 포함("마이크 끄기"/"마이크 켜기").
- 단축키(데스크톱) : `Ctrl/⌘+D` 마이크, `Ctrl/⌘+E` 카메라, `Ctrl/⌘+Alt+H` 손들기. 입력창 포커스 중에는 무시.
- 새 채팅·손들기는 `aria-live="polite"` 영역에 읽힘.
- 색만으로 상태를 전하지 않는다 — 꺼짐은 빨강 + 사선 아이콘.
- 번역 키 `room.*`(ko 가 source of truth, en 동시 추가). 키 예 : `room.join`, `room.mic.on`, `room.mic.off`, `room.cam.on`, `room.cam.off`, `room.hand.raise`, `room.leave`, `room.enableSound`, `room.err.roomFull` …

## 11. Pi Browser 제약 체크리스트

| # | 항목 | 설계 반영 |
|---|---|---|
| P1 | 쿠키 저장 안 됨 | 입장권 발급은 `piFetch`(X-Pi-Token 헤더) — sfu-lab 과 같다 |
| P2 | 비로그인 시 `redirect` 금지 | 대기실 페이지는 클라이언트 게이트 렌더 |
| P3 | 자동재생 정책 | 대기실 "입장" 탭 = 사용자 제스처, 영상 `muted` 분리, 소리 실패 시 1초×3회 재시도 후 "🔊 소리 켜기"(14.5) |
| P4 | 인라인 재생 | 모든 `<video>` 에 `playsInline`, 내 영상은 `muted` |
| P5 | 화면공유 미지원 | 기능 탐지로 숨김(UA 판정 금지) |
| P6 | iOS 미검증 | ROADMAP M0 iOS 시험 통과 전 iOS 관련 처리는 [확인중 : 마스터 실기기] |
| P7 | 카메라 권한 거부 | "카메라 없이 입장" 경로 |

## 12. 적용 단계 — ROADMAP Phase M 과 연결

| 단계 | 화면 작업 | 엔진 의존 |
|---|---|---|
| **지금(M1~M2)** | `use-room.ts` 추출 · 대기실(S3) · 룸 무대 + 하단 바(마이크·카메라·나가기) · 상태 표시 · 오류 문구 | v1.0 그대로. 마이크·카메라 토글의 `producer.pause/resume` 은 SIGNAL_API 상 M3 이지만 **엔진 구현이 이미 병합**(`028c06b7`, `media/internal/bora/manager.go` `MProducerPause` 분기)돼 앞당겨 쓴다 — 실측은 M3 통과 기준으로 |
| M3 | 음소거 아이콘·발행자 퇴장 처리 · 화면공유 · 패널 레이아웃 · **v1.1 ①참가자 목록 ②source ③채팅·손들기·반응** | `producer.*`, v1.1 합의 |
| M4 | 타일 크기별 `consumer.setLayer` · 연결 품질 토스트 | `setLayer`·`score` |
| M5 | 목록(S1 페이지네이션)·상세(S2 결제 입장)·개최(S5) | 입장권 = Pi 결제 확인 후 발급 |

- **진행(2026-10-26)** : 지금(M1~M2) 화면 = 구현·검토 통과(`8b1fd791`, 로컬 병합) · SIGNAL_API v1.1 엔진(필수 A~D·`room.end`) = 구현·검토 통과 · M3 화면 = 진행 중. 실기기 미확인.
- 화면마다 **Pi Browser 실기기 확인**(Android 2대 + iOS 1대) 후 완료 처리.
- 코드 착수 시 관문 : `pnpm build` 통과 + R-P1~P6 자기 점검(루트 CLAUDE.md).

## 13. 확인 필요

| # | 질문 | 담당 | 상태 |
|---|---|---|---|
| 1 | SIGNAL_API v1.1 신규 메시지(14.7 필수 A~D + 세미나 종료) 채택 | 마스터 | **결정(마스터 2026-10-26) : 채택** — SIGNAL_API v1.1 개정은 M3 착수 시 |
| 2 | 채팅 저장 여부 | 마스터 | **결정(마스터 2026-10-26) : 처음엔 저장 안 함**(엔진 중계만, 늦은 입장자는 이전 대화 없음). 필요 시 재검토 |
| 3 | 청중 발언(무대 초대 = audience → panel 승격) 허용 여부 | 마스터 | **결정(마스터 2026-10-26) : 허용** — 14.4 승격 흐름(마이크 자동 켜짐 금지) |
| 4 | 반응 이모지 목록 | 마스터 | **결정(마스터 2026-10-26) : 7종 👍👏😀😮🙁😶💖 그대로** |
| 5 | 강조색 `--accent` | 마스터 | **결정(마스터 2026-10-26) : 보라 `#7c6cf2`** |
| 6 | 발표자 "세미나 종료"(방 전체 종료) | 마스터 | **결정(마스터 2026-10-26) : 허용** — `room.end{}`(presenter) → 서버가 전원에 기존 `ntf error ROOM_CLOSED` 후 연결 종료(신규 오류 코드 없음, 14.7 필수 D) |
| 7 | 실험실 `trickle` 봉투(`ntf`) vs SIGNAL_API(`req`) 표기 차이 | 서비스 | 확인 완료 — 엔진이 둘 다 수용(8절). SIGNAL_API 3.1 에 `ntf` 허용 한 줄 추가 권장 |
| 8 | 발표자(presenter) 자격 | 마스터 | **결정(마스터 2026-10-26) : 지금은 관리자만**(현행 입장권 API 유지). panel 은 입장권으로 발급하지 않고 #9 승격으로만 생김. 개최자 발표 권한은 F-02 때 재검토 |
| 9 | 승격·강등 방식 — ⓐ 엔진이 세션 중 역할 변경(`peer.setRole`, 빠름·재접속 없음, 단 입장권 `role` 과 세션 역할이 달라짐) / ⓑ 입장권 재발급 후 재입장(정본 단일, 끊김 1~2초) — 서비스 의견 ⓐ(엔진이 세션 역할을 정본으로 두고 입장권 `role` 은 '입장 시 초기값'으로 SIGNAL_API 6절 문구 개정) | 마스터 | **결정(마스터 2026-10-26) : ⓐ 바로 전환** — SIGNAL_API 6절 `role` 을 "입장 시 초기값"으로 개정(M3) |

## 14. 오픈소스 정밀 분석 반영 (v0.2)

> 대상·기준 : LiveKit Meet `meet@aed896b0` + `components-js@65701808` + `client-sdk-js@3da72d0a`, Jitsi Meet `jitsi-meet@3860ada6`(모두 Apache-2.0, 2026-10-26 shallow clone). **읽기만 했고 코드는 옮기지 않는다**(S-2) — 아래는 구조·수치를 자기 말로 기술, 경로는 각 저장소 기준.
> REA 서버는 이번 세션에서 연결 실패 — 오픈소스는 원본 소스 정밀 분석이 디컴파일보다 정확하므로 소스 분석으로 수행. 런타임 관찰(`webrtc-internals`·패킷)은 REA 재연결 후 보강 [TBD].

### 14.1 두 앱의 공통 결론 = 채택 근거가 가장 강한 것

| 결론 | LiveKit | Jitsi | seminar.pi |
|---|---|---|---|
| 화면공유 버튼은 **기능 탐지**(`getDisplayMedia` 존재)로만 노출, UA 판정은 최후 수단 | `core/helper/featureDetection.ts:4-9`, `detectMobileBrowser.ts:8-19` 경고 주석 | 모바일 Drawer 분기 | 6.1 그대로 — **seminar.pi 는 UA 판정을 아예 하지 않는다**(루트 UA 불신 철칙). "최후 수단"은 LiveKit 쪽 서술 |
| 연결 품질 아이콘은 **나쁠 때만** 보임 | hover·poor 때만(`_participant-tile.scss:49-64`) | ≥30% 면 5초 뒤 숨김(`AbstractConnectionIndicator.ts:15,189`) | 엔진 `ntf score` 의 `grade`(excellent·good·poor·lost, `media/internal/metrics/score.go:61`) — `poor`·`lost` 즉시 표시, 회복 5초 뒤 숨김 |
| 화면공유 **자동 고정은 1회**, 끝나면 이전 상태 복원 | 자동 고정 트랙 ref 기억, 수동 해제 시 재고정 안 함(`VideoConference.tsx:92-129`) | 공유 전 고정·타일 뷰 상태 저장 후 복원(`video-layout/middleware.any.ts:115-140`) | 둘 합침 : 자동 고정 producerId 기억 + 이전 레이아웃 복원 |
| 보이지 않는 타일은 **받지 않는다** | adaptiveStream 가시성·크기 100ms 디바운스(`RemoteVideoTrack.ts:15,246-321`) | 기본 maxHeight 0, 보이는 목록 100ms 디바운스(`video-quality/subscriber.ts:47-51,410`) | 14.2 |
| 화면이 **흔들리지 않게** | 말하기 테두리 켤 때 0.2s·끌 때 0.5s 지연, 1페이지 타일 제자리(`tile-array-update.ts:81-144`) | 스테이지 비고정자 60초 유지(`filmstrip/middleware.web.ts:247-256`) | 말하기 링 0.2/0.5s, 무대 타일 순서 안정화 |
| **기본 회의 화면은 웨비나에 부적합** | 청중에게도 자리표시 타일 생성(`useTracks.ts:84-112`) → 직접 조립 필요 | 청중(visitors) 모드 별도 존재 | 무대 = 발행자만, 청중은 인원 수·목록만(Jitsi 방식) |

### 14.2 수신 화질 — `consumer.setLayer` 규칙 확정

| 항목 | 값 | 근거 |
|---|---|---|
| 관찰 | 타일 `<video>` 를 IntersectionObserver + ResizeObserver(공용 1개) | LiveKit `RemoteVideoTrack.ts:375-390`, `useResizeObserver.ts:48-96` |
| 단계 | 렌더 높이 × 배율(**DPR > 2 이면 2, 그 외 1**) : **<360 → `maxSpatial:0`(l), <720 → 1(m), 그 외 → 2(h)** | Jitsi 180/360/720 단계(`video-quality/constants.ts:26-31`, "높이 ≥ 임계값" 규칙) + LiveKit 픽셀 밀도 기본값(`RemoteVideoTrack.ts:305-321` — pixelDensity 미설정 시 DPR>2 면 2, 그 외 1). DPR 2 기기에서 한 층 덜 받아 대역폭 절약. 엔진 simulcast 3층(l·m·h)에 맞춤 |
| 디바운스 | 100ms (SIGNAL_API `consumer.setLayer` 서버 디바운스와 별개) | 두 앱 동일 |
| 안 보임 | 2초 이상 화면 밖 또는 `document.visibilityState='hidden'` → `consumer` 일시정지 [TBD : 엔진에 클라이언트용 consumer.pause 없음 — `setLayer` 최저 + 후속 메시지 검토] | LiveKit 3초(`VideoTrack.tsx:51`)·백그라운드 정지(`Track.ts:355-380`) |
| 송신 측(dynacast) | 엔진 `ntf publishLayers`(M4) 이미 정의 — 클라이언트는 받은 rid 만 인코딩 유지 | LiveKit dynacast, SIGNAL_API 3.2 |

### 14.3 하단 바 — 폭 기반 버튼 수 (Jitsi 표를 역할별로 재구성)

Jitsi 는 폭 임계값 표로 메인 버튼 수를 정하고 넘치는 것은 "더보기"로 보내며, **더보기에 1개만 남으면 더보기를 없애고 그 버튼을 바로 노출**한다(`toolbox/constants.ts:20-61`, `functions.web.ts:153-206`). 나가기는 항상 별도.

| 폭 > | presenter·panel 메인 | audience 메인 |
|---|---|---|
| 565px | 마이크·카메라·화면공유*·채팅·참가자·손목록(presenter) | 손들기·반응·채팅·참가자·화질 |
| 420px | 마이크·카메라·채팅·참가자 | 손들기·반응·채팅·참가자 |
| 370px | 마이크·카메라·채팅 | 손들기·반응·채팅 |
| 그 이하 | 마이크·카메라 | 손들기·채팅 |

- 라벨 : 폭 ≤760px(채팅 열림 ≤1000px)이면 아이콘만 — **단 `aria-label` 은 유지**(LiveKit 은 빠져 있음, 14.6).
- 토글 : 요청 중 버튼 비활성(연타 방지), 상태는 서버 응답·`ntf producerPaused/Resumed` 로만 확정(낙관적 갱신 안 함) — LiveKit `mediaToggle.ts:65-70,77,111`.
- 사용자 클릭으로 바뀐 장치 선택만 저장(`isUserInitiated`, LiveKit `ControlBar.tsx:141-151`) — 사회자 강제 음소거가 다음 입장 기본값을 오염시키지 않게.
- 더보기 메뉴 : 데스크톱 팝오버, 모바일 하단 Drawer(최대 높이 `80dvh`) — Jitsi.
- 자동 숨김 : 데스크톱 4000ms 무조작 숨김(`toolbox/constants.ts:130` `TOOLBAR_TIMEOUT`), 포인터가 바 위·설정 팝업 열림이면 유지(`Toolbox.tsx:195-210`, `functions.web.ts:33-51`), **모바일은 타이머 없이 탭 토글**(`actions.web.ts:243-258`) — 3절 G6 근거.

### 14.4 손들기·반응·참가자 패널

| 기능 | 규칙 | 근거 |
|---|---|---|
| 손들기 상태 | 참가자별 `raisedTs` 하나(0 = 내림), **서버 시각**으로 정렬(먼저 든 사람 앞) | Jitsi `base/participants/actions.ts:590-596`, `middleware.ts:288-302` (클라이언트 시계 불신으로 변형) |
| 자동 내리기 | 무대 승격·발언 허가 시 서버가 내림 | Jitsi 발언자 자동 내리기(`middleware.ts:142-153`)를 서버 처리로 단순화 |
| 모두 내리기 | presenter 만, **권한 검사는 서버** | Jitsi 는 받는 쪽 검사(`conference/middleware.any.ts:82-86`) — 우리는 서버로 옮김 |
| 반응 | 7종 (13절 #4 결정), 송신 500ms 묶음, 서버 피어당 초당 2건·합산 300ms 방송, 수신 최대 3종·화면 큐 50개·5초 소멸 | Jitsi `reactions/middleware.ts:95-158`, `chat/middleware.ts:182-190`, `constants.ts:130` |
| 반응 애니메이션 | CSS keyframes 궤적 여러 개(index % N), 5초, JS 없음, `prefers-reduced-motion` 시 끔 | Jitsi `_reactions-menu.scss:127-210` |
| 참가자 패널 정렬 | presenter → panel → 손든 audience(손든 순) → 나머지(이름순) | Jitsi `participants-pane/functions.ts:180-213` 변형 |
| 줄마다 빠른 동작 1개 | 손든 audience = [무대로], panel = [내리기], 나머지는 `…` 메뉴 | Jitsi `participants-pane/constants.tsx:123-163` |
| 알림 쌓임 방지 | 대상 1명이면 알림 안에서 [허용]/[거부], 2명 이상이면 "N명 대기" 하나로 묶어 패널로 | Jitsi `lobby/middleware.ts:201-268`, `visitors/middleware.ts:420-480` |
| 알림 지속 | 2.5s / 5s / 10s / 60s / 고정(사라지지 않음) 5단계 | Jitsi `notifications/constants.ts:5-9` |
| 채팅 | 내 메시지 즉시 표시 후 같은 id 수신으로 확정, 연속 발화자 이름 숨김·60초 미만 시각 숨김, 닫아도 언마운트 안 함(수신·배지 유지), 배지 9+, 메시지 500자, 폭 <580px 전체 화면 | LiveKit `chat.ts:303`, `Chat.tsx:120-133`, `VideoConference.tsx:160-165`, `useChatToggle.ts:29-33` / Jitsi `chat/constants.ts` |

**승격(청중 → 무대) 흐름** — Jitsi av-moderation·visitors 를 단순화 :
손들기 → presenter [무대로] → 서버가 역할 panel 로 변경 + 손 내림 → `ntf roleChanged` → 본인 화면에 **[마이크 켜기] 고정 알림(자동으로 켜지 않음)** → 본인이 켜면 발행. 강등은 서버가 그 사람 producer 전부 닫음(`producerClosed`). Jitsi `av-moderation/middleware.ts:224-277` "승인돼도 자동 송출 안 함" 원칙 — 동의 없는 마이크 노출 방지.

### 14.5 대기실·자동재생·연결 테스트

| 항목 | 규칙 | 근거 |
|---|---|---|
| 역할별 대기실 | audience = 이름 + **[입장]** 하나(이 탭이 소리 재생 허용 제스처). presenter·panel = 미리보기 + 장치 상태 줄 + 연결 테스트 | Jitsi `prejoin/components/web/Prejoin.tsx` 를 역할로 분리 |
| 장치 상태 | `pending`·`ok`·`warning` 3종, 문구는 우선순위 1개(둘 다 오류 → 소리 → 영상 → 정상), **권한 거부해도 입장은 막지 않음** | Jitsi `prejoin/reducer.ts:18-19,143-180` |
| 이름 | 5.1 그대로 **표시만**(세션 `display_name || pi_username`). Jitsi 의 "비었으면 입력 창"(`Prejoin.tsx:250-262`)은 입장권 API 변경이 필요해 **미채택** — Pi 계정은 `pi_username` 이 항상 있어 빈 이름이 생기지 않음 | Jitsi 참고·미채택 |
| 연결 테스트(발표자) | `getStats` 로 손실률·처리량 측정, 임계 : 손실 오디오 [0.33, 0.05]·비디오 [0.33, 0.1, 0.05], 처리량 오디오 [8, 20]·비디오 [60, 750]kbps → 좋음/보통/나쁨 + 원인 문장 | Jitsi `base/premeeting/functions.ts:41-46,130-200` |
| 자동재생 | 입장 탭 안에서 `audio.play()` 선호출, 거부 시 1초×3회 재시도 → 실패 시 "🔊 소리 켜기" 버튼. 영상은 항상 `muted playsInline` | Jitsi `AudioTrack.tsx:229-340`, LiveKit `StartMediaButton.tsx:29-38` |
| 오류 표시 | `alert()` 금지 — 화면 안 알림(오류는 `aria-live="assertive"`) | LiveKit 약점(`PageClientImpl.tsx:79,218-221`) 회피, Jitsi `Notification.tsx:332` |

### 14.6 접근성 — 두 앱 장점만, 약점은 피함

- 채택 : 토글 `aria-pressed`, 장치 목록 `role="option" aria-selected`(LiveKit), 알림 오류 `assertive`·기타 `polite`, 메뉴 버튼 `aria-controls`·열림 상태(Jitsi).
- LiveKit 약점 회피 : 아이콘만 보일 때 이름 없음 → `aria-label` 필수, Esc 로 메뉴 닫기, `:focus-visible` 스타일, `prefers-reduced-motion`.
- 단축키(데스크톱, 입력창 포커스 중 무시) : 10절의 `Ctrl/⌘+D`·`E` 유지 + Jitsi 단일 키(M 마이크·V 카메라·C 채팅·P 참가자·R 손들기·? 도움말)는 **설정에서 켤 때만**(단일 키는 오입력 위험) [확인중 : 마스터].

### 14.7 시그널링 v1.1 제안 — 7.2 를 대체하는 통합본

명명은 기존 규약(요청 = `대상.동사`, 알림 = camelCase), 실패는 기존 봉투 `e{code,msg}`·기존 코드(`ROLE_FORBIDDEN` 등) + 신규 `LOCKED` 1개(SIGNAL_API 5절 표 '연결' 열 = 유지, `envelope.go` `ErrCode` 추가 대상).

- **받는 사람·`d` 필드 상세는 7.2 표가 정본**(7.2 는 이 절과 같게 갱신됨) — 특히 `ntf hand` 는 presenter·panel·본인만 받는다(청중끼리 누가 손들었는지 노출 안 함).
- `peers[].peerId` 는 기존 `ProducerInfo.peer`·`join` 응답 `peerId` 와 **같은 값**(조인 키).
- 메시지 수 : 현재 요청 12·알림 10 → 필수 A~D 반영 시 요청 17·알림 16, 후속 E~G 까지 요청 21. SIGNAL_API D-9 의 되돌릴 조건(메시지 20개 초과 시 JSON Schema 전환 검토)에 **후속 E 착수 시점**에 닿는다 — 그때 전환 판단 [확인중 : 마스터].

| 묶음 | 메시지 | 단계 | 비고 |
|---|---|---|---|
| **필수 A — 참가자** | `join` 응답 `peers:[{peerId,name,role,raisedTs}]` · `ntf peerJoined`·`peerLeft` | M3 | 7.2 ① |
| **필수 B — 출처** | `ProducerInfo`·`consumerCreated` 에 `source` 필드 | M3 | 7.2 ②, 필드 추가 = 하위 호환 |
| **필수 C — 상호작용** | `chat.send`/`ntf chat` · `hand.set{raised}`/`ntf hand{peerId,raisedTs}` · `hand.lowerAll`(presenter) · `reaction.send{emojis}`/`ntf reaction{counts,ts}` | M3 | 7.2 ③ + 14.4 |
| **필수 D — 역할** | `peer.setRole{peerId, role:'panel'|'audience'}`(presenter) → `ntf roleChanged{peerId,role,by}` | M3 | 승격·강등 = **세션 중 바로 전환**(13절 #9 결정). 엔진이 세션 역할을 정본으로, 입장권 `role` 은 입장 시 초기값. presenter 는 관리자만(#8). + `room.end{}`(presenter, 13절 #6) |
| 후속 E — 사회 | `peer.mute{peerId,kind}`(→ 서버가 producer 일시정지 + 본인에 `ntf mutedBy`) · `room.muteAll{kind,lock}`(→ `ntf roomPolicy{locked}`, 잠금 중 resume 은 `LOCKED`) · `peer.askUnmute{peerId,kind}` | M5 | 순서 고정 : 잠금 → 일시정지 → 알림을 **서버 한 처리 안에서**(Jitsi `AbstractMuteEveryoneDialog.ts:80-105` 경고 주석의 경합 원천 차단) |
| 후속 F — 레이아웃 | `room.setLayout{mode,spotlight,follow}` → `ntf layout`, 서버가 마지막 값 보관·입장 시 함께 전달 | M5 | Jitsi Follow Me 30회 재시도(`follow-me/middleware.ts:30`) 불필요 |
| 후속 G — 발언자 | `ntf activeSpeaker{peerId|null}` | M4+ | **엔진에 오디오 레벨 처리 없음** — RTP audio-level 헤더 확장(RFC 6464) 수신·판정을 엔진에 새로 작성해야 함. 그 전에는 발행자(최대 몇 명)만 클라이언트 `AudioContext` 로 측정(3절 G7) |
| 보류 H — 로비 | 입장 승인 대기열 | 보류 | 유료 입장권(F-04)이 이미 출입 통제 — 무료 세미나 도입 시 재검토 |

### 14.8 v0.1 대비 바뀐 결정 요약

| 절 | v0.1 | v0.2 |
|---|---|---|
| 3 G6 | 3초 숨김 | 데스크톱 4초, 모바일 탭 토글 |
| 6.1 | 역할별 고정 버튼 | 폭 기반 버튼 수 + 더보기(14.3) |
| 6.1·13 #4 | 반응 5종 | 7종(14.4) |
| 13 #3·#9 | 청중 발언 허용 여부만 | 승격 흐름 확정(14.4) + 역할 변경 방식 결정 항목 #9 신설 |
| 6.3 | "탭하여 재생" 오버레이 | 영상 muted 분리 + 소리 켜기 버튼(14.5) |
| 7.2 | 3종(+①②) | 통합 v1.1 : 필수 A~D(M3), 후속 E~G, 보류 H(14.7) |
| 7.2 반응 | 1초 집계 | 클라이언트 500ms + 서버 300ms·익명(14.4) |
| 5.1 대기실 | 단일 화면 | 역할별 분리 + 연결 테스트(14.5) |
| 신규 | — | 화질 단계 360/720 × (DPR>2 면 2, 그 외 1)(14.2), 승격 시 마이크 자동 켜짐 금지(14.4), `alert()` 금지(14.5) |

### 14.9 구현 편차 (2026-10-26, M1~M2 구현 중 확정)

| 항목 | 설계 | 구현 | 이유 |
|---|---|---|---|
| 발표자 연결 점검 시점(14.5) | 대기실에서 측정 | **입장 5초 뒤 5초 구간** 발행 PC `getStats` 로 측정, 대기실엔 "입장 후 자동 확인" 안내 | 대기실엔 엔진 연결이 없어 잴 대상이 없음 |
| 영상 손실 임계(14.5) | 0.33·0.1·0.05 | 0.05~0.1 구간은 등급 "좋음" + 원인 문장 표시, 꺼진 트랙은 처리량 판정 제외 | 세 값만으로 등급 경계가 모호 |
| 정원 초과·종료 뒤 행동(7.3) | 상세로 | 홈으로 | 상세 화면(S2)은 M5 |
| 토큰(9절) | 5종 | `--warning #f5a524` 추가(연결 "보통" 배지) | 3단계 표시에 중간색 필요 |
| 말하기 판정 | 수치 없음 | RMS 0.04 [확인중 : 마스터 실기기] | 기기마다 보정 필요 |
| 발표자 선택지 표시 | 관리자 판정 함수 | 화면은 `role` 문자열(ADMIN·MASTER) 힌트, 실제 권한은 입장권 API `isAdmin` | 판정 함수가 서버 전용 — 후속 : `@pi/auth/client` 에 클라이언트용 역할 판정 내보내기 [TBD] |
| `peerJoined`·`peerLeft`(7.2) | 단건 | 200ms 묶음 배열(원소 형식 같음) | 입장 폭주 대비(R-P2), SIGNAL_API v1.1 |

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-26 | v0.1 초안 — 화상회의 앱 사용량 1~5위·UI 친화도 재순위(1위 Google Meet)·Meet 분석·화면 5종·시그널링 매핑·v1.1 제안·컴포넌트·토큰 |
| 2026-10-26 | v0.1 검수 반영(14건) — v1.1 범위 확대(참가자 목록·source), 입장권 역할 2종 현황, 화면공유 재협상, 출처 행별 연결, 공동 3위, 메시지 경로·토큰 매핑 |
| 2026-10-26 | v0.2 — LiveKit Meet·Jitsi Meet 소스 정밀 분석(14절) : 공통 결론 6, 화질 단계 규칙, 폭 기반 하단 바, 손들기·반응·승격 흐름, 역할별 대기실·연결 테스트, 접근성, 시그널링 v1.1 통합안(필수 A~D·후속 E~G·보류 H) |
| 2026-10-26 | v0.2 팀장 지적 9건 반영 — 화질 배율을 LiveKit 실제 동작(DPR>2 면 2, 그 외 1)으로 정정, G6 근거(Jitsi 4000ms) 14.3 추가, 7.2 를 14.7 과 일치·받는 사람 정본 명시, D-9 메시지 수 판단 시점, 역할 변경 방식 13절 #9, 앞 절 모순 6곳(반응 7종·소리 켜기·이름 표시만·0절) 정리, `LOCKED`·조인 키 명시 |
| 2026-10-26 | **v1.0 확정** — 마스터 결정 8건(13절 #1~6·#8·#9) : v1.1 채택·채팅 저장 안 함·청중 승격 허용(바로 전환)·발표자는 관리자만·반응 7종·보라 강조색·발표자 세미나 종료(`room.end`) |
