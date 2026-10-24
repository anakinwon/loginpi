# 의사결정 02 — REA 분석 대상(참고모델) 선정

> 작성 2026-10-24 · 상태 **선정안(마스터 확인 대기)** · 선행 : [DECISION_01](DECISION_01_VIDEO.md) 7절(자체 구축·엔진 직접) · 작성 아소카
> 외부 사실 확인일 2026-10-24(웹 검색·공개 저장소 정보). 라이선스·유지 상태는 착수 전 각 공식 저장소에서 다시 확인한다.
> 점수는 서비스가 매긴 **정성 평가(1~5)**다. 실측이 아니므로 S0~S1 진행 중 바뀔 수 있다.

## 0. 전제

- REA로 무엇을 분석할지 먼저 정한다. 그다음 DECISION_01 7.1(S-1·S-2)과 7.2(언어·호스팅·위치)를 결정한다.
- **S-2(합법 범위)를 가정해 평가했다.** 상용 제품은 코드 분석 대상에서 빼고, 기능·화면 비교 대상으로만 둔다. S-2를 거부하면 3절을 다시 평가한다.
- 오픈소스는 소스가 공개돼 있다. 그래서 REA의 역할은 디컴파일이 아니라 **실행 근거 수집**이다.
  - 실제로 실행해 패킷과 `webrtc-internals`를 관찰한다.
  - 버전끼리 동작을 비교한다.
  - 기능이 어느 코드에 있는지 찾아 소스와 대조한다.

## 1. 후보 목록 (13개)

| # | 이름 | 분류 | 언어 · 기반 | 라이선스 | 특징 |
|---|---|---|---|---|---|
| 1 | LiveKit | 오픈소스 SFU | Go · pion | Apache-2.0 | 상용급 대역폭 할당·simulcast 전환, 대형 코드 |
| 2 | Galène | 오픈소스 SFU | Go · pion | MIT | 소형·가독성, simulcast·SVC, 강의용으로 쓰임 |
| 3 | ion-sfu | 오픈소스 SFU | Go · pion | MIT [확인중] | pion 진영 SFU, 유지 상태 [확인중 : 공식 저장소] |
| 4 | pion 예제(sfu-ws·broadcast·simulcast) | 학습 예제 | Go · pion | MIT [확인중] | 수백 줄짜리 최소 SFU |
| 5 | mediasoup | 오픈소스 SFU | C++ 워커 + Node API | ISC | Router·Producer·Consumer 모델, 자체 RTP 처리 |
| 6 | Jitsi Videobridge | 오픈소스 SFU | Java | Apache-2.0 [확인중] | Last-N(말하는 사람 우선)·대역폭 추정 |
| 7 | Janus Gateway | 오픈소스 게이트웨이 | C | GPL-3.0 [확인중] | 플러그인 구조(VideoRoom). 카피레프트라 코드 이식 시 공개 의무 |
| 8 | SRS | 방송 서버 | C++ | MIT [확인중] | 라이브 방송 + WebRTC, 1→N 방송형 |
| 9 | Kurento | 미디어 서버 | C++ · Java | Apache-2.0 [확인중] | 미디어 처리 파이프라인(구형) |
| 10 | BigBlueButton | 웨비나·강의 완제품 | 다수(미디어는 mediasoup) | LGPL | 웨비나 도메인 참고(발표자·청중·화면 공유) |
| 11 | MiroTalk SFU | 화상회의 완제품 | Node · mediasoup | AGPL-3.0 [확인중] | 완제품 UI. 네트워크 서비스 카피레프트 |
| 12 | Zoom Webinars | 상용 | 비공개 | 상용 | 기능·화면 비교만(S-2) |
| 13 | Google Meet | 상용 | 비공개(브라우저 WebRTC) | 상용 | 기능·화면 비교만(S-2) |

상용 2개(#12·#13)는 코드를 분석하지 않으므로 2~4절 점수에서 뺀다. 5.2절 기능 체크리스트에만 쓴다.

## 2. 우리 앱 최적화 순위

평가 기준(각 1~5, 25점 만점):
- ① 웨비나 적합: 1명이 다수에게 보내는 구조
- ② Pi Browser 적합: 플러그인 없이 표준 브라우저 WebRTC로 동작
- ③ 결정 스택 일치: Go·pion
- ④ simulcast와 대역폭 추정
- ⑤ VM 1대로 운영 가능한 경량성

| 순위 | 후보 | ① | ② | ③ | ④ | ⑤ | 합계 |
|---|---|---|---|---|---|---|---|
| 1 | LiveKit | 5 | 5 | 5 | 5 | 3 | **23** |
| 2 | Galène | 4 | 5 | 5 | 4 | 5 | **23** |
| 3 | mediasoup | 5 | 5 | 2 | 5 | 4 | 21 |
| 4 | ion-sfu | 3 | 5 | 5 | 3 | 4 | 20 |
| 5 | pion 예제 | 2 | 5 | 5 | 2 | 5 | 19 |
| 5 | MiroTalk SFU | 4 | 5 | 2 | 4 | 4 | 19 |
| 7 | Janus | 4 | 5 | 1 | 4 | 4 | 18 |
| 8 | Jitsi Videobridge | 4 | 5 | 1 | 5 | 2 | 17 |
| 8 | SRS | 5 | 4 | 1 | 3 | 4 | 17 |
| 10 | BigBlueButton | 5 | 5 | 1 | 4 | 1 | 16 |
| 11 | Kurento | 2 | 4 | 1 | 2 | 2 | 11 |

LiveKit과 Galène은 동점이다. 수십 명 규모의 대역폭 할당 완성도에서 LiveKit을 1위로 두었다.

## 3. REA 분석 가능 순위

평가 기준(각 1~5, 20점 만점):
- ① 법적 안전: 허용형 라이선스일수록 높다. 카피레프트는 코드 이식 시 공개 의무가 있어 감점한다
- ② 소스 가독성·규모: 작을수록 높다
- ③ REA 실행 분석 적합: 직접 빌드·실행해 관찰하기 쉬운가
- ④ 설계 문서·자료

| 순위 | 후보 | ① | ② | ③ | ④ | 합계 |
|---|---|---|---|---|---|---|
| 1 | Galène | 5 | 5 | 4 | 4 | **18** |
| 1 | pion 예제 | 5 | 5 | 4 | 4 | **18** |
| 3 | LiveKit | 5 | 3 | 4 | 5 | 17 |
| 4 | mediasoup | 5 | 3 | 3 | 5 | 16 |
| 5 | ion-sfu | 5 | 4 | 4 | 2 | 15 |
| 6 | SRS | 5 | 3 | 3 | 3 | 14 |
| 7 | Jitsi Videobridge | 5 | 2 | 2 | 4 | 13 |
| 7 | Janus | 3 | 3 | 3 | 4 | 13 |
| 9 | Kurento | 5 | 2 | 2 | 3 | 12 |
| 10 | MiroTalk SFU | 2 | 3 | 3 | 3 | 11 |
| 11 | BigBlueButton | 3 | 1 | 2 | 4 | 10 |
| — | Zoom Webinars · Google Meet | 0 | — | — | — | 제외(S-2: 디컴파일 금지, 기능 비교만) |

## 4. 참고모델 종합 순위

종합 점수 = 최적화(2절) 40% + REA 분석(3절) 30% + **엔진 학습 가치** 30%.

엔진 학습 가치(1~5)는 우리가 직접 작성할 기능의 구현을 읽고 배우기 좋은 정도다. 해당 기능은 손실 재전송(NACK), 화면 재요청(PLI), simulcast 전환, 대역폭 추정이다.

| 순위 | 후보 | 최적화 /25 | REA /20 | 학습 /5 | **종합 /100** |
|---|---|---|---|---|---|
| 1 | LiveKit | 23 | 17 | 5 | **92.3** |
| 2 | Galène | 23 | 18 | 4 | **87.8** |
| 3 | mediasoup | 21 | 16 | 5 | **87.6** |
| 4 | pion 예제 | 19 | 18 | 3 | 75.4 |
| 5 | ion-sfu | 20 | 15 | 3 | 72.5 |
| 6 | Jitsi Videobridge | 17 | 13 | 4 | 70.7 |
| 7 | Janus | 18 | 13 | 3 | 66.3 |
| 8 | SRS | 17 | 14 | 2 | 60.2 |
| 9 | MiroTalk SFU | 19 | 11 | 2 | 58.9 |
| 10 | BigBlueButton | 16 | 10 | 2 | 52.6 |
| 11 | Kurento | 11 | 12 | 1 | 41.6 |

계산 예시(LiveKit): 0.4 × 23/25 + 0.3 × 17/20 + 0.3 × 5/5 = 0.923 → 92.3

**민감도**: 2위 Galène(87.8)과 3위 mediasoup(87.6)의 차이는 0.2점이다. 결정 스택이 Go·pion이 아니면 순위가 바뀐다. 언어 결정(DECISION_01 7.2)과 함께 확정한다.

## 5. 최종 선정 (1·2·3위) — 역할을 나눠 참고

| 순위 | 참고모델 | 역할 | 단계 |
|---|---|---|---|
| **1** | **LiveKit** | **목표 품질 기준.** 수십 명 대역폭 할당, simulcast 전환, 혼잡 대응 설계를 읽는다. 완성형과 비교할 기준점 | S3(규모)·S4 |
| **2** | **Galène** | **첫 구현 교본.** 같은 Go·pion 위에서 SFU 전체가 한눈에 읽히는 크기다. 패킷 전달, NACK·PLI, 강의형 방 구조를 따라가며 우리 코드를 처음부터 작성한다 | S1·S2 |
| **3** | **mediasoup** | **설계 개념 모델.** Router·Transport·Producer·Consumer로 나누는 API 경계와 자체 RTP 처리 설계를 우리 모듈 구조에 반영한다. 웨비나 사례(BigBlueButton이 미디어에 사용)도 참고한다 | 설계(S1 전)·S2 |

- **보조**: pion 예제(종합 4위)는 S1의 첫 실행 출발점으로 쓴다. 최소 SFU가 수백 줄이라 처음 구조를 잡기 좋다.
- **코드 처리 원칙(S-2)**: 세 모델 모두 허용형 라이선스(Apache-2.0·MIT·ISC)다. **읽고 설계를 배우되 코드는 옮기지 않는다.** 부득이 옮기면 해당 라이선스 고지를 지킨다.

### 5.1 REA 분석 계획 (모델별 무엇을 뽑나)

| 모델 | 실행 관찰(REA) | 소스 대조 | 산출 |
|---|---|---|---|
| Galène | 로컬 실행, 발표자 1명과 시청자 2명. `webrtc-internals`로 NACK·PLI 횟수, 화질 단계 전환 시점을 관찰 | 패킷 전달 경로, NACK·PLI 처리 지점 | S1·S2 설계 메모 |
| LiveKit | 손실·대역 제한 환경(네트워크 지연 주입)에서 화질 하향·복구 동작을 관찰 | 대역폭 할당·simulcast 선택 로직 | S3 목표 지표(지연·회복 시간) |
| mediasoup | 데모 실행, Producer·Consumer 수명주기 이벤트를 관찰 | API 경계·RTP 처리 모듈 분할 | 우리 모듈 구조도 |

### 5.2 상용 제품 기능 체크리스트 (코드 분석 없음)

Zoom Webinars·Google Meet에서 seminar.pi 첫 출시에 필요한 기능만 고른다(공개 도움말·직접 사용 기준). 발표자·패널·청중 역할 구분, 손들기, 질의응답, 화면 공유, 입장 대기실, 녹화 고지. PRD 6절 화면 확정에 쓴다.

## 6. 마스터 확인

- [ ] 최종 선정 1·2·3위(LiveKit·Galène·mediasoup)와 역할 분담 확인
- [ ] 이어서 DECISION_01 7.4 결정 4건: S-1·S-2 동의, 언어, 호스팅, 코드 위치

## 출처

- [Galène 소개(euro-stack)](https://euro-stack.com/solutions/galene) · [Galène 발표 자료 2025](https://galene.org/galene-20250610.pdf) · [linuxlinks — Galène](https://www.linuxlinks.com/galene-easy-deploy-videoconference-server/)
- [BigBlueButton 아키텍처(mediasoup 사용)](https://docs.bigbluebutton.org/development/architecture/) · [BigBlueButton — Wikipedia](https://en.wikipedia.org/wiki/BigBlueButton)
- [mediasoup npm(ISC)](https://npmjs.com/package/mediasoup)
- [LiveKit 서버 — pkg.go.dev(Apache-2.0, v1.11.0)](https://pkg.go.dev/github.com/livekit/livekit-server@v1.11.0)
- 1절 `[확인중]` 표시 라이선스(ion-sfu·pion 예제·Jitsi Videobridge·Janus·SRS·Kurento·MiroTalk)는 서비스 사전 지식이다. 최종 3개(LiveKit·Galène·mediasoup)는 웹으로 확인했다(LiveKit은 README·패키지 정보 기준, LICENSE 파일 직접 확인은 착수 전). 착수 전 공식 저장소에서 확인한다 [확인중 : 공식 저장소]
