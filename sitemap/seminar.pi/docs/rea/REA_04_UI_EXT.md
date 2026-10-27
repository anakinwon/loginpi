# REA_04 UI_EXT — 룸 확장 지점(F-U) REA 활용 기록

> 작성 2026-10-27 · 담당 Agent10 기반 구축(ui-ext) · 브랜치 `feat/seminar-room-ext`
> 대상 코드 : `src/components/room/` 의 `extensions.ts`·`effects.ts`·`use-speech.ts`·`consent.tsx`·`features/index.ts`, 그리고 확장 지점을 한 번만 뚫은 `use-room.ts`·`control-bar.tsx`·`side-panel.tsx`·`room-view.tsx`·`prejoin.tsx`·`room-rules.ts`
> 원본 증거 : `docs/rea/evidence/REA_04/ui-ext-anchors.json`(이번 실행), 같은 폴더 `jitsi-04-findings.json`(앞선 REA CLI 실행)
> S-2 : 배포본은 읽기만 했다. 코드는 옮기지 않았고, 설계 판단의 근거로만 썼다. 상용 프로그램은 다루지 않았다.

## 1. REA 를 어떻게 썼나

| 항목 | 내용 |
|---|---|
| REA 상태 | 이번 실행에서 REA MCP 서버가 연결되지 않았다(CONNECT_TIMEOUT). REA CLI `rea@6.4.0` 는 PATH 에 있어 동작한다 |
| 쓴 산출물 | REA CLI `export-web-scripts` 로 받아 둔 배포본 보관본 2벌 — meet.jit.si(캡처 sha256 `6d1e89dc…`, 증거 `ev_0f5b34a4…`, 스크립트 9개) · meet.livekit.io(캡처 `d2481cb6…`, 증거 `ev_e15414b3…`, 스크립트 21개) |
| 무결성 | 각 파일 sha256 을 REA 매니페스트(`content.sha256`) 값과 다시 계산해 대조했다 — **불일치 0 / 30** |
| 읽는 법 | 질문마다 찾을 문자열을 정하고 `indexOf` 로만 찾았다(정규식·실행 없음). 앞뒤 160자 문맥과 오프셋을 기록했다. 도구 : 스크래치 `rea05-ext/anchors.mjs`·`pack.mjs`(저장소 밖) |
| REA 추적 미사용 | 앞선 실행에서 `trace-application-feature` 가 웹팩 압축 청크에 5건 모두 no-match 였다(`meet-livekit-09`). 그래서 이번엔 같은 호출을 되풀이하지 않고 앵커 읽기로 바로 갔다 |
| 다시 쓴 앞선 증거 | `jitsi-04-findings.json` ②(30회 연속 실패 → 원본 통과, 워커 33ms 타이머) · ③(로컬 녹화 5초 조각·ts-ebml) · ④(설문 탭) |

## 2. 질문 → 증거 → 반영

관찰(배포본에 실제로 있는 것)과 추론(그로부터 판단한 것)을 나눠 적는다. 모든 관찰은 정적 읽기이고, 실행을 본 것은 아니다.

| # | 질문 | 관찰(파일 sha256 앞 8자리 @오프셋) | 추론 | 반영(이 브랜치) |
|---|---|---|---|---|
| R-E1 | 영상 효과를 켜면 송신 트랙을 어떻게 바꾸나(재협상하나) | Jitsi `lib-jitsi-meet` `9eb5dc78` : `setEffect` @211718 → `_removeLocalTrackFromPc` → `_switchStreamEffect` → `_addLocalTrackToPc` @212196, 그 아래 `TPC.replaceTrack` @302980 이 트랜시버를 찾아 `sender.replaceTrack(track)`. LiveKit `dc2a882c` @295973 : 프로세서가 있으면 `this.sender.replaceTrack(processedTrack ?? track)` | 두 앱 모두 효과 결과를 **같은 송신기에 replaceTrack** 으로 넣는다. SDP 재협상 없이 바꿀 수 있다 | `effects.ts` `useVideoEffects` — 카메라 송신기(`use-room` `videoSender`)에 처리 트랙을 replaceTrack, 효과가 0개가 되면 원본으로 되돌림 |
| R-E2 | 숨은 탭에서도 효과 프레임이 돌게 하려면 | LiveKit 트랙 프로세서 `9d43b3d3` @239006 : 대체 경로의 `processedTrack = capturedStream.getVideoTracks()[0]`(캔버스 송출). @241065 : 프레임 타이머를 blob 워커(`setTimeout → postMessage`)로 만들고, 실패하면 "falling back to a window timer". 주기 = 1000/(2×maxFps), 영상 `currentTime` 이 바뀔 때만 그림. Jitsi `jitsi-04` ② : 대체 경로 워커 33ms 타이머 | 창 타이머는 숨은 탭에서 느려진다. 그래서 워커 타이머를 쓰고, 워커를 못 만들 때만 창 타이머로 간다 | `effects.ts` `ticker()`(워커 → 창 타이머), 주기 1000/60ms, 새 프레임일 때만 그림, `canvas.captureStream(30)`. CSP(`next.config.ts`)에 worker-src 제한이 없어 blob 워커가 막히지 않는다 |
| R-E3 | 효과가 계속 실패하면 | `jitsi-04` ② : 연속 30회 실패하면 원본 통과 | 효과 하나가 고장 나도 영상이 멈추면 안 된다 | `FX.failMax = 30` — 실패한 프레임은 원본을 그리고, 30회 연속이면 그 효과의 `on` 저장소를 false 로 |
| R-S1 | 5초 음성 조각을 어떻게 끊나 | Jitsi `e94ef107` @1857428 : `recorder.start(5e3)`, @752648 : ts-ebml `makeMetadataSeekable`(길이 머리 보정) | `start(timeslice)` 조각은 첫 조각에만 webm 머리가 있다. Jitsi 는 조각을 이어 한 파일로 고쳐 쓴다. 조각마다 따로 음성→글을 하려면 **조각마다 녹음기를 새로 시작**해야 단독 해독이 된다 | `use-speech.ts` — 5초마다 `MediaRecorder` 를 멈추고 새로 시작, 각 Blob 이 독립 파일 |
| R-S2 | 녹음 형식을 어떻게 고르나 | LiveKit `dc2a882c` @306250 : `"audio/webm;codecs=opus"` 를 `MediaRecorder.isTypeSupported` 로 확인, 안 되면 `"video/mp4"` | 형식은 기능 탐지로 고른다(UA 판정 아님). Safari 는 mp4 계열 | `pickAudioMime()` — webm/opus → audio/mp4 → video/mp4, 다 안 되면 음성 조각을 쓰지 않음 |
| R-A1 | 기능별 메시지를 하나의 통로로 보내는 방식 | LiveKit `8d537880` @51746 : `publishData(payload, {topic, reliable, destinationIdentities})`, 채팅도 topic(`lk-chat-topic`)으로 구분. Jitsi `9eb5dc78` @664562 : `sendEndpointMessage`·`broadcastEndpointMessage`(빈 대상 = 전원) | 두 앱 모두 **범용 통로 + 주제(topic)** 로 기능 메시지를 나른다 | 계획서 A-2 `app.send{topic,d}` → `ntf app{topic,d,from}` 를 화면에 연결 — `use-room` `sendApp`·`subscribeApp`, `room-view` 가 등록 기능의 `onApp` 으로 나눠 줌 |
| R-A2 | 서버가 기능을 지원하지 않을 때 화면은 | LiveKit `8d537880` @78359 : 채팅 송신 때 `serverInfo.edition`·`version`(1.8.2 비교)으로 옛 방식 여부를 가름 | 서버 판에 따라 화면 동작을 가른다 | 입장 직후 1회 지원 확인(`probeApp`, 등록 항목 중 `app` 필요가 있을 때만 — 주제표 안 topic `refresh` + 4KB 초과 `d` : v1.3 은 ② 에서 `SDP_INVALID`(중계·속도 한도 사용 없음), 구 엔진은 `NOT_FOUND`(미구현 메서드)). 엔진 = 모르는·빈 topic 에 `NOT_FOUND` 확정(`interact.go` AppSend ①) → 빈 topic 검사는 v1.3 도 미지원으로 오판해 검사 방식 변경. 보내기 실패 1번으로 지원 여부를 바꾸지 않는다. 미지원·확인 중이면 `app` 이 필요한 ⋯ 항목을 숨김(`visibleExtras`) |
| R-P1 | 사이드 패널에 기능 탭을 어떻게 붙이나 | Jitsi `e94ef107` @1471275 : 패널 탭 열거 `chat-tab`·`cc-tab`·`file_sharing-tab`·`polls-tab` | 패널 하나에 기능 탭을 배열로 붙인다 | `side-panel.tsx` `extra` 탭 — 채팅과 참가자 사이에 등록 순서대로(설계서 15.3 : Q&A·설문, `cc-tab` 은 미채택) |
| R-M1 | ⋯ 메뉴 순서 | (SubAgent0 앵커 `sa0-ui-anchors.json` R1 재사용) 자막(16) → 녹화(17) → 소음(22) → 배경(25) | — | `features/index.ts` 등록 순서 주석, `splitSlots(items, slots, extra)` 구분선 |

### 부재 검색(범위 한정)

| 찾은 문자열 | 결과 | 해석 |
|---|---|---|
| `polls.jitmeet`(meet.jit.si) | 0건 | 보관본 9개 스크립트 안에는 서버 컴포넌트 이름이 없다. 설문 탭 노출은 화면 속성(`isPollsEnabled`)으로 가른다. 이 범위 밖의 부재는 모른다 |
| `chatToggle`(meet.livekit.io) | 0건 | 압축 청크라 컴포넌트 이름이 남지 않았다. 부재의 증거가 아니다 |

## 3. 모르는 것 · 한계

- 모두 정적 읽기다. 효과 전환 때 재협상이 정말 없는지, 숨은 탭에서 워커 타이머가 실제로 30fps 를 유지하는지는 실행으로 보지 않았다 → 실기기·브라우저 QA 때 확인 [확인중 : 통합 QA].
- LiveKit Meet 배포본의 `livekit-client`·트랙 프로세서 판(버전)은 확인하지 못했다(소스맵 대조 안 함).
- 엔진 v1.3(feat/seminar-app-relay `interact.go` AppSend)은 모르는·빈 topic 에 `NOT_FOUND`('알 수 없는 주제')로 확정됐다 → 빈 topic 검사는 구 엔진과 구분되지 않아, 주제표 안 topic + 상한 초과 `d`(② `SDP_INVALID`)로 검사 방식을 바꿨다(`room-rules` `APP_PROBE`·`appSupportedBy`, 시험 있음). 실제 엔진 응답은 통합 QA 에서 확인 [확인중 : 통합 QA].
- 룸 첫 화면 JS 예산(설계서 15.15, 기준선 974,636 B)은 이 브랜치에서 다시 재지 않았다. 등록 기능이 0개라 늘어난 코드는 확장 지점·동의·효과·음성 훅뿐이다 → 통합 뒤 REA `analyze-web-bundle` 로 같은 방법 재측정 [확인중 : 통합 후].
