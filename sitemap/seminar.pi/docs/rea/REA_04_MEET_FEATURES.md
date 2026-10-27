# REA_04: 회의 부가 기능 10종 — 오픈소스 화상회의 배포본 분석·설계 반영·회귀 기록

> 작성 2026-10-27 · 담당 Agent10(문서) · 상위 계획 `.claude/plans/pasted-content-id-66a2-eager-clock.md`(마스터 결정 M-1~M-4·Agent10 결정 A-1~A-9) · 기능 정의 [PRD](../PRD.md) 5절 F-08~F-17 · 화면 [UI 설계서](../ui-design/ui-design.md) 15절 · 신호 [SIGNAL_API](../SIGNAL_API.md) 3.6(v1.3.1)
> 분석 방법 : REA CLI `rea@6.4.0`(`node rea.mjs …`, `C:/Users/anaki/AppData/Roaming/npm/node_modules/rea-agents/scripts`) + loopback CDP headless Chrome 156.0.8078.48(빈 임시 프로필·가짜 카메라/마이크). **REA MCP 서버는 이번 작업 내내 연결 실패(CONNECT_TIMEOUT 30초)라 CLI 로 대신했다.** REA 가 내보낸 원문은 sha256 을 REA 매니페스트와 다시 계산해 대조한 뒤에만 썼다.
> **S-2 준수** — 대상은 오픈소스 배포본(Apache-2.0)과 우리 앱뿐이다. **Google Meet(상용)은 분석하지 않았다.** 원본 코드 블록은 옮기지 않고 "파일 sha256 앞 8자리 @문자 오프셋 · 280자 이내 문맥 · 동작 설명"으로만 인용한다. 독점 모듈(Krisp)은 존재만 기록했다.
> 원본 증거 = `docs/rea/evidence/REA_04/*.json`(이 문서와 같이 커밋, 각 30KB 안팎 요약). 큰 원본(최대 31MB)은 스크래치(저장소 밖)에만 있고 sha256 으로만 가리킨다.
> 관련 기록 : 룸 확장 지점 근거 [REA_04_UI_EXT](REA_04_UI_EXT.md)(R-E1~R-M1) · 외부 AI 형식 근거 `evidence/REA_04/aidb-rea-usage.json` · 엔진 중계 근거 `evidence/REA_04/engine-01-app-relay-anchors.json`

## 1. 대상 · 라이선스 · 버전

| # | 대상 | 버전·식별 | 라이선스 | 범위 |
|---|---|---|---|---|
| T1 | Jitsi Meet 배포본 `https://meet.jit.si` | CDN 태그 `meetjitsi_9523.6636`, config `releaseNumber 7156`. 소스 사본 jitsi-meet 커밋 `3860ada6`(2026-10-26)과 대조 | jitsi-meet·lib-jitsi-meet = **Apache-2.0**(사본 package.json). RNNoise(@jitsi/rnnoise-wasm 0.2.1) = BSD-3-Clause 로 알려짐 [확인중 : node_modules 없는 사본이라 미검증]. 가상 배경 모델 MediaPipe Selfie Segmentation = Apache-2.0 [확인중 : 모델 카드 원문 미대조]. **Krisp SDK(`libs/krisp/*`) = 독점 — 경로 존재만 기록, 내려받기·분석 안 함** | 무작위 방 `ReaProbebaee262251e0` 의 **대기(prejoin) 화면 + 번들 정적 분석까지. 회의 참가 0회** |
| T2 | LiveKit Meet 배포본 `https://meet.livekit.io/rooms/rea04-probe` | 소스 사본 meet `aed896b`, components-js `6570180`, client-sdk-js `3da72d0`. 배포 소스맵의 sourcesContent sha256 = 사본(LF) sha256 일치 확인(`meet-livekit-07`) | LiveKit Meet·`@livekit/track-processors` 0.8.1·`@livekit/components-react` 2.9.24·`livekit-client` 2.23.0 = **Apache-2.0**(track-processors 는 배포 소스맵 속 package.json 으로 직접 확인). `@mediapipe/tasks-vision` 0.10.14 = Apache-2.0(공개 저장소 기준, 캡처 증거로는 미확인). **`@livekit/krisp-noise-filter` 0.4.5(지연 청크 950) = 독점으로 보고 존재만 기록** | 입장 전 화면. 배경 흐림·교체, 잡음 처리, 장치·효과 설정 UI 배치, 녹화·자막 UI 존재 여부 |
| T3 | `@mediapipe/tasks-vision` 1.1.1(npm latest, 우리가 쓰는 판) | tgz sha256 `fbbea455…`, integrity = lockfile 값과 같음(`mediapipe-01`) | **Apache-2.0**(package.json·vision.d.ts 머리 주석. LICENSE 파일은 패키지에 없음). 모델 `selfie_segmenter_landscape` = Apache-2.0(`public/mediapipe/models/NOTICE`) | 패키지 정적 분석·wasm 구조·자체 호스팅 조건 |
| T4 | 우리 앱 `https://seminarz.vercel.app`(기준선) + 로컬 HEAD 운영 빌드 `http://localhost:3003` | 기준선 배포 `dpl_3ZwiUw2xoTaYDd9udatQmZhAzxRk`(기능 10종 추가 전), HEAD `af8f572b` 이후 22:41 빌드(BUILD_ID `wf3OAfoG4UamplvuyJDjn`) | 자체 코드. Pi SDK `sdk.minepi.com/pi-sdk.js`(독점)는 분석 안 함 — 존재만 | 회귀 비교 3장면(목록·진행판·404) + 룸·목록·404 번들 크기 |

## 2. REA 활용 기록 — 실행한 명령 원문 · 목적 · 결과 · 증거

경로 줄임 : `REA` = `node C:/Users/anaki/AppData/Roaming/npm/node_modules/rea-agents/scripts/rea.mjs`, `SP` = `C:/Users/anaki/AppData/Local/Temp/claude/C--Users-anaki-workspace-loginpi/a7d862b1-8c7b-4ecb-aa09-178648623821/scratchpad`(저장소 밖, 원본 보관), `EV` = `docs/rea/evidence/REA_04`. sha256 은 앞 8자리만 적고 전체 값은 같은 행 증거 파일에 있다. 명령 전문(전 인자)은 각 단계의 `*-commands.json`·`jitsi-01`·`meet-livekit-0N` 에 원문 그대로 남아 있다.

### 2.1 T1 Jitsi Meet(대기 화면) — 13단계

| # | 명령(원문 요지) | 목적 | 결과 | 증거(sha256) |
|---|---|---|---|---|
| J1 | `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9344 --user-data-dir="SP\rea04-jitsi\chrome-profile" --no-first-run --no-default-browser-check --window-size=1280,800 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream "https://meet.jit.si/ReaProbebaee262251e0"` | loopback CDP 브라우저(빈 프로필·가짜 장치), 무작위 방 대기 화면만 | 대기 화면 열림. 끝에 종료, 9344 닫힘 확인 | `SP/rea04-jitsi/chrome.log` |
| J2 | `REA list-browser-targets http://127.0.0.1:9344 --format json` | 대상 targetId 확보 | page 1개 `FB691BBC…`('Rea Probebaee 262251 E 0 \| Jitsi Meet') · `ev_980bb30c…`, 저장본 `ev_17c03148…` | `raw/01` `6413285d` |
| J3 | `REA inspect-web-page http://127.0.0.1:9344 FB691BBC… --observation-ms 5000 --include-script-sources --include-storage-keys --include-accessibility-text --include-console-text --format json` | 수동 관찰(스크립트 원문·저장소 키 이름·접근성 트리) | `ev_0f5b34a4…` 스크립트 10개 — app.bundle 3,658,821 B `e94ef107`, lib-jitsi-meet 1,145,590 B `9eb5dc78`, chunks/4690 818,631 B, 인라인 config.js 9,431 B `7be2429e`. 저장소 키 `features/noise-suppression`·`features/virtual-background`·`features/polls-history` 등, 워커 [] | `raw/02` `6d1e89dc`(6.1MB) |
| J4 | `REA analyze-web-bundle http://127.0.0.1:9344 FB691BBC… --observation-ms 3000 --fetch-source-maps --format json` | 번들 정적 분석·소스맵 | `ev_43a7f71c…` webpack(high)·React(medium). 소스맵 4개 중 lib-jitsi-meet·preload 만 처리 — app.bundle 세그먼트 예산(262144) 초과, chunks/4690 32MiB 초과 fetch_failed. 엔드포인트 268개 중 기능 자산 URL 없음 | `raw/03` `e282de32`(31MB) |
| J5 | `REA export-web-scripts "SP/rea04-jitsi/raw/02-inspect-web-page.json" "SP/rea04-jitsi/scripts" --format json` | 다이제스트 검증된 원문을 파일로 | `ev_4be1f45f…` 9개 내보냄(olm.wasm unavailable). app.bundle = `isolated/source-6-…js`, lib = source-1, config = source-10 | `raw/04` `442a5090` |
| J6 | `REA analyze-javascript-application "SP/rea04-jitsi/scripts/files" --artifact-format directory --max-heap-mb 4096 --format json` | 모듈 그래프 재구성 | **실패**(rc=1, 6분 27초) — app.bundle provider_timeout(300000ms), lib-jitsi-meet V8 힙 고갈. 부분 증거 `ev_e37d50d3…`, 그래프 사용 불가. 여유 RAM 4GB 라 재시도 안 함 | `raw/05` `3638852e` |
| J7 | `REA capture-browser-scenario "SP/rea04-jitsi/scenarios/s1-open-background.json" --format json` | 대기 화면 '배경 선택' → 가상 배경 UI 구조 | `ev_227b29b0…` 4단계 completed. 설정 대화상자 '배경' 탭 = 미리보기·배경 추가·라디오(배경 제거·약간 흐리게·흐리게·이미지 7종)·취소·확인 | `raw/06` `884a1cc9` |
| J8 | `REA capture-browser-scenario "SP/rea04-jitsi/scenarios/s2-blur-preview.json" --format json` | '흐리게' 선택 → 지연 로드 자산(추론 워커·모델·wasm) 관측 시도 | `ev_19536eeb…` 콘솔 `"Blur" option set for virtual background preview!`, 기본 배경 7장(150,458~915,156 B) sha256 확보. **워커·모델·wasm 요청은 관측 안 됨**(Worker 안 요청은 캡처 범위 밖). 콘솔 getUserMedia 오디오 제약 AGC·EC·NS true, channelCount 1 | `raw/07` `82a50d34`, 스크린샷 `48cd803a` |
| J9 | `REA list-browser-targets http://127.0.0.1:9344 --format json` | 흐림 뒤 워커 타깃 생성 여부 | `ev_17c03148…` page 1, non_page 2(제외) | `raw/08` `6413285d` |
| J10 | `REA inspect-web-page http://127.0.0.1:9344 FB691BBC… --observation-ms 6000 --include-script-sources --include-accessibility-text --include-console-text --format json` | 흐림 뒤 워커·스크립트 재확인 | `ev_8fe17aee…` workers [], 스크립트 같은 10개 | `raw/09` `40910cfe` |
| J11 | `REA capture-browser-scenario "SP/rea04-jitsi/scenarios/s3-open-audio-settings.json" --format json` | 대기 화면 오디오 설정에 소음 억제 토글이 있나 | `ev_9238b4af…` 마이크·스피커 선택만, 소음 억제 토글 없음(회의 안 툴바 전용) | `raw/10` `abb9107f` |
| J12 | `node SP/rea04-tools/anchors.mjs SP/rea04-jitsi/scripts/files` *(REA 아님, 보조)* | REA 내보낸 원문에서 근거 앵커(오프셋·280자 문맥) 추출 | 앵커 47개 전부 찾음(MISSING 0). 조명 보정 음성 검색 0건 | `EV/jitsi-03-bundle-anchors.json` `21a45113` |
| J13 | `node SP/rea04-tools/summarize.mjs SP/rea04-jitsi EV` *(REA 아님, 보조)* | 원본 증거 → 작은 요약 JSON | jitsi-01·02·04 생성. 분석도구 키 일부가 든 localStorage 키 이름은 가림 | `EV/jitsi-01` `64f4b412` · `jitsi-02` `d16a30ed` · `jitsi-04` `b512d955` |

### 2.2 T2 LiveKit Meet(입장 전 화면) — 9단계

| # | REA 작업 | 결과 | 증거(sha256) |
|---|---|---|---|
| L1 | `list-browser-targets` | page 1개 `61752313…`('LiveKit Meet \| Conference app build with LiveKit open source'), `ev_cff495e2…` | `EV/meet-livekit-01` (원본 `09cbfc1f`) |
| L2 | `inspect-web-page --include-script-sources …` | `ev_e15414b3…` 스크립트 21개. 키워드 실재 : `Background Effects`(965-…js `4c77459e` @7558), `background-blur`·`virtual-background` 각 5건(787-…js `9d43b3d3` @258818~259786), `"@mediapipe/tasks-vision":"0.10.14"` 1건 | `meet-livekit-02` (원본 `d2481cb6`) |
| L3 | `analyze-web-bundle --fetch-source-maps` | `ev_a25218aa…` Next.js(high)·React(medium), 소스맵 11개 처리(partial). 원본 소스 확보 : `useKrispNoiseFilter.ts`·`tasks-vision vision_bundle.mjs`·`track-processors FrameTicker.ts` 등 | `meet-livekit-03` (원본 `721adff4`) |
| L4 | `export-web-scripts` | `ev_00022c5f…` 21개 | `meet-livekit-04` (원본 `fda4d428`) |
| L5 | `capture-web-screenshot` | `ev_8e0a26dd…` 입장 전 화면 | `meet-livekit-05` (원본 `5b34cffd`) |
| L6 | `trace-web-source-location`(787-…js ↔ 소스맵 `39fb862e`) | 압축 위치 → 원본 경로 매핑 | `meet-livekit-06` |
| L7 | *(REA 아님)* 배포 소스맵 sourcesContent sha256 ↔ 사본(CRLF→LF) sha256 | `lib/CameraSettings.tsx`·`MicrophoneSettings.tsx`·`SettingsMenu.tsx` 등 **전부 일치** | `meet-livekit-07` (원본 `2d32e42e`) |
| L8 | `analyze-javascript-application` | `ev_373bbdd4…` 파일 21·모듈 171·findings 649·파싱 실패 0 | `meet-livekit-08` (원본 `7e3eabd7`) |
| L9 | `trace-application-feature`(seed 5종, both) | **5건 모두 no-match** — 앱 그래프가 웹팩 압축 청크의 JSX 문자열·브라우저 API 를 seed 노드로 색인하지 않음. **부재의 증거 아님**(L2 키워드로 실재 확인) | `meet-livekit-09` (원본 `5928218f` 외) |

### 2.3 T3 MediaPipe tasks-vision 1.1.1

| # | 작업 | 결과 | 증거 |
|---|---|---|---|
| P1 | npm tgz 내려받기 → bsdtar 로 ZIP 재포장 → `REA inspect-artifact` | REA 가 .tgz 를 열지 못해 같은 내용을 ZIP 으로(root `644d4ae2`). 파일별 sha256 = sha256sum 일치 · `ev_f5278088…`·인벤토리 `ev_e31a074a…` | `EV/mediapipe-01` |
| P2 | `REA analyze-javascript-application`(vision_bundle) | 그래프 요약 | `mediapipe-02` |
| P3 | REA 브라우저 탐침 | 로드 경로·요청 관측 | `mediapipe-03` |
| P4 | 정적 앵커 읽기(indexOf) | wasm 선택(SIMD 기능 탐지 @49496·경로 @49644·basePath 생략 시 사이트 루트 @49833), 텔레메트리(`odml.pa.googleapis.com/v1/log` @52864, 60초 주기 @52558, 끄는 옵션 없음 @67639) | `mediapipe-04` |
| P5 | `node SP/rea04/tools/wasminfo.cjs`(섹션 파싱·compile 만, 실행 안 함) | `vision_wasm_internal.wasm` 13,519,922 B `0e101a01`, nosimd 12,627,509 B `c9b1b69b`. memory shared=false → **COOP/COEP 불필요**. 자체 호스팅 = 4개 파일(js·wasm × simd·nosimd), module 변형 불필요 | `mediapipe-05` |

### 2.4 T4 우리 앱 — 기준선(19:33~19:50) · 회귀(22:4x)

| # | 명령(원문 요지) | 목적 | 결과 | 증거 |
|---|---|---|---|---|
| B1 | `REA --help`·`capture-browser-scenario --help/--schema`·`doctor` 등 8건 | 사용법 확인 | doctor healthy:false(hopper·ida 없음 — 웹 분석 무관), node 24.15.0 | `EV/baseline-seminarz-commands.json` |
| B2 | `REA capture-browser-scenario "SP/…/baseline-scene-{list\|progress\|404}.json"` | 기준선 3장면 | 3장면 complete(progress 는 cleanup_incomplete 1회 후 재실행). 200KB 초과분은 DOM 제외 재캡처 | `baseline-seminarz-scene-*.normalized.json`·`scenes-summary` |
| B3 | `REA compare-web-captures …` | 비교 입력 형식 확인 | 봉투·data 통째는 invalid_request → **입력 = `data.normalized_result`** 로 확정, 자기 비교 unchanged `ev_45741ec5…` | 같은 파일 |
| B4 | `REA analyze-web-bundle http://127.0.0.1:9351 <룸\|목록\|404> --observation-ms 3000 --full-output` | 기준선 번들 크기 | 룸 20개·974,636 B `ev_5623f766…` · 목록 23개·915,414 B `ev_a65f0c39…` · 404 18개·910,228 B `ev_b6d33fa8…`(해제 기준) | `baseline-seminarz-bundle-*.json` |
| B5 | `REA inspect-web-page …`·`export-web-scripts …` | 룸 원문 보관 | 20개 내보냄(타 출처 1·출처 불명 2 제외) `ev_1a0f33bb…` | `baseline-seminarz-commands.json` |
| R1 | `cd …/rea-agents/scripts && node rea.mjs capture-browser-scenario "SP/rea04-regress/in/baseline-scene-{list\|progress\|404}.json" --format json --full-output` | 배포본 재수집 | 3장면 complete : list `ev_188733c0…`, progress `ev_d5042c24…`, 404 `ev_3d68efae…` | `EV/regress-seminarz-commands.json` |
| R2 | `node rea.mjs compare-web-captures "EV/baseline-seminarz-scene-{s}.normalized.json" "SP/rea04-regress/out/deployed-scene-{s}.normalized.json"` | 기준선 ↔ 배포본 | 같은 배포 id → 코드 변화 없음, 차이는 events·storage·데이터(아래 6절) | `regress-seminarz-summary.json` scenes.*.deployed |
| R3 | `cd sitemap/seminar.pi && npx next start -p 3003` | HEAD 운영 빌드 실행 | Ready, 끝나고 종료 | — |
| R4 | `node rea.mjs capture-browser-scenario "SP/rea04-regress/in/local-scene-{…}.json" --full-output` | 로컬 HEAD 3장면(호스트만 바꾼 같은 시나리오) | 3장면 complete(첫 시도) | `regress-seminarz-summary.json` scenes.*.local |
| R5 | `node rea.mjs compare-web-captures "EV/baseline-…normalized.json" "SP/…/local-scene-{s}.normalized.json"` | 기준선 ↔ HEAD | list `ev_178194b7…`, progress `ev_6d0b7eab…`, 404 `ev_24401d0d…` | 같은 파일 |
| R6 | Chrome `--remote-debugging-port=9352 … --window-size=390,844 about:blank` + `node SP/rea04-regress/tools/open-tabs.mjs` + `REA list-browser-targets http://127.0.0.1:9352` | 목록·룸(86ff7149 join)·404 탭 | page 3개 `ev_3d593760…` | `regress-seminarz-commands.json` |
| R7 | `REA analyze-web-bundle http://127.0.0.1:9352 <3 targets> --observation-ms 3000 --full-output` | 번들 크기·MediaPipe 적재 여부 | 룸 `ev_0017f665…`, 목록 `ev_3c2eb448…`, 404 `ev_c072f0e1…` | `regress-seminarz-summary.json` bundles |
| R8 | `REA inspect-web-page …` + `REA export-web-scripts …` + `grep -rl "ImageSegmenter\|FilesetResolver\|vision_wasm" …` | 적재된 원문의 MediaPipe 표지 | 룸 14개 중 `2k9rs0tc7wn1i.js`(앱 엔진, 동적 import 호출부)에만, 목록 12개 0건 · 룸 `ev_3a4140ba…`/`ev_f4ee0646…`, 목록 `ev_ce48ef68…`/`ev_809fa8fe…` | `regress-seminarz-summary.json` mediapipe_chunks |
| R9 | `node scripts/copy-mediapipe.mjs` *(REA 아님)* | `pnpm build` 전처리 확인 | **exit 1 "모델 파일 없음"** — `git ls-files public/mediapipe` = NOTICE 하나 | 같은 파일 non_rea |
| R10 | `node SP/rea04-regress/tools/regress-summary.mjs …` *(REA 아님)* | 회귀 요약 JSON | 생성 | `regress-seminarz-summary.json` `73d11d6d` |

### 2.5 기능 팀이 이번 실행에서 쓴 REA 호출(재사용 위주)

| 팀(브랜치) | 호출 | 결과 |
|---|---|---|
| app-relay | `rea inspect-evidence-bundle {path: SP/rea04-jitsi/raw/04-export-web-scripts.json, detail: summary}` | `evidence_integrity_mismatch` 거부 — 번들이 아닌 단일 레코드 `ev_4be1f45f…` 임을 REA 가 확인. 대신 lib `9eb5dc78`·app `e94ef107` sha256 재계산 일치 |
| ai-db | `rea analyze-javascript-application`(공식 SDK @google/genai 2.31.0 dist/web/index.mjs `5a9f07eb`) | `ev_60a2a01f…` 그래프 노드 295·엔드포인트 9 |
| ai-db | `rea trace-application-feature` seed `'/{api_version}/interactions'`·`'model_output'` | `ev_6c937d00…`·`ev_3758b96a…` no-match(문자열 리터럴 미색인 — 부재 아님). Git Bash 경로 변환으로 첫 시도가 깨져 `MSYS_NO_PATHCONV=1` 로 재실행 |
| ai-db | `rea trace-application-feature` node-id seed(x-goog-api-key 엔드포인트) | `ev_daefd11f…` 295노드·299간선·8경로, coverage complete |
| room-ext | REA `export-web-scripts` 보관본 2벌(jitsi `6d1e89dc` 9파일·livekit `d2481cb6` 21파일) sha256 재대조 | **불일치 0/30** |

## 3. 발견 사실(근거)

관찰 = 배포본에 실제로 있는 것(정적 읽기 또는 대기 화면 관측), 추론 = 그로부터 판단한 것. 오프셋은 `jitsi-03` 앵커 기준.

| # | 주제 | 관찰 | 근거 |
|---|---|---|---|
| ① | 소음 억제 | 기본은 **브라우저 내장 처리** — getUserMedia 오디오 autoGainControl·echoCancellation·noiseSuppression true, channelCount 1. '추가 소음 억제'(툴바 더보기, key `noisesuppression`)를 켜야 RNNoise AudioWorklet(`libs/noise-suppressor-worklet.min.js`, 480샘플 float32 프레임)이 붙는다. 스테레오·화면공유 오디오 중엔 켜기 거부(효과는 트랙당 1개). 메인 번들 rnnoise.wasm 은 VAD 용. meet.jit.si config 에 krisp 없음 | app `e94ef107` @1509113·1506152·1506010·1506571·2508312·2523733, 콘솔 'Got media constraints'(J8), 대기 화면 오디오 설정에 토글 없음(J11) |
| ② | 가상 배경·흐림 | config `virtualBackground.enableV2=true`. 단말 등급은 **기능 탐지**(navigator.gpu → webgl2/webgl → 없음) : WebGPU 512×288 / WebGL 384×216 / TFLite wasm 256×144, 30fps. 추론 Worker(blob importScripts), MediaPipe Selfie Segmentation landscape. 기본 경로 = insertable streams(MediaStreamTrackProcessor → 캔버스 → VideoFrame → Generator), 폴백 = canvas.captureStream + **Worker setTimeout 33ms 타이머**. TFLite 2프레임마다·GPU 매 프레임 추론, 마스크 EMA 0.75, smoothstep 경계, 흐림 ctx.filter blur(25px·8px). **연속 30회 실패 시 원본 통과**. 사용자 배경 = 1920×1080 JPEG 0.5 dataURL 로 localStorage 에만 | app @2407033~2435853·2163964·2172792, config @6873, 대화상자 접근성 트리(J7), 배경 이미지 sha256(J8) |
| ②' | 배경(LiveKit) | 배경 모드 `background-blur`·`virtual-background`·`legacy` 분기, 트랙 프로세서가 `sender.replaceTrack(processedTrack ?? track)`, 대체 경로 = captureStream 트랙 + blob 워커 프레임 타이머(실패 시 창 타이머, 주기 1000/(2×fps), 새 프레임일 때만) | `9d43b3d3` @258818~259786·@239006·@241065, `dc2a882c` @295973(REA_04_UI_EXT R-E1·R-E2) |
| ②'' | MediaPipe 자체 호스팅 | `forVisionTasks(basePath)` 를 생략하면 사이트 루트에서 wasm 을 찾음. CPU 경로도 webgl2/webgl 필요. **사용 지표를 `odml.pa.googleapis.com` 으로 60초마다 보내고 끄는 공개 옵션 없음**(1회 실패하면 주기 전송 중단). createFromOptions 마다 wasm 재수신 | `mediapipe-04` @49833·@57188·@52864·@52558·@67639, `mediapipe-05` |
| ③ | 로컬 녹화 | `video/webm;codecs=vp8,opus`, videoBitsPerSecond 2,500,000, `start(5000)` 5초 조각, showSaveFilePicker → createWritable 순차 기록, 첫 조각에 ts-ebml 길이 자리표시 → 종료 시 makeMetadataSeekable 로 덮어씀. 합성 = 캔버스 없이 getDisplayMedia(현재 탭), 오디오 = AudioContext 믹스. **Chromium 데스크톱 전용**. 전원 고지 = presence 속성 `localRecording`. meet.jit.si `recordings.requireConsent=false` | app @1853213~1857441·748716·2754618·2748190, config @5587 |
| ④ | 설문 | 서버 polls 컴포넌트가 권위 — `new-poll`/`answer-poll` 을 서버가 다시 뿌림, 늦은 입장자는 `old-polls` 이력. 사이드 패널 탭 `polls-tab`(탭 = chat·cc·file_sharing·polls). 문항·선택지 maxLength 500, 선택지 2~255, 중복 = 'Options must be unique', 응답 = 선택지별 boolean(복수 선택) | lib `9eb5dc78` @391161·391609·391973, app @1471266·2965844 |
| ⑤ | 자막·번역 자막·음성 번역 | 공개판은 자막 꺼짐(transcription.enabled=false). 수신 = endpoint 메시지 `transcription-result`(interim/stable)·`translation-result`, 번역 언어 = 참가자 속성 `translation_language`(개인별). 표시 = **무대 하단 중앙 절대배치**(maxWidth 50vw, 글자 크기 = 화면 높이 기준, 툴바 보이면 위로, pointer-events none). 음성 번역(더빙) `audioTranslation.enabled=true`, **번역 음성 중 원음 0.15 로 덕킹**, 13개 언어 | app @2889324·2989548·3193862·2691912·2946125, lib @654459, config @5076·4745 |
| ⑥ | 조명 보정 | **없음**(범위 한정 음성 검색) — `brightness(`·`contrast(`·`lowLight`·`relight` 0건, `exposureCompensation` 1건은 ImageCapture 폴리필. 인접 기능 = 얼굴 중앙 맞춤만. 범위 = 대기 화면 스크립트 10개 + 소스 사본(워커·지연 청크 제외) | `jitsi-03` lighting[0~2], `jitsi-04` questions[5].boundary |
| ⑦ | 범용 메시지 통로 | Jitsi : 보낸 쪽은 from 을 넣지 않고 브리지가 채움, 객체 아닌 payload 는 버림, 'too large' 는 SCTP 보정일 뿐 앱 상한 아님. 판별 키가 type·name 으로 섞임. **권한은 받는 쪽이 검사**(숨은 전사기·'transcriber' 만 자막 수용). LiveKit : `publishData({topic, reliable, destinationIdentities})` | `engine-01-app-relay-anchors.json` relay[0~9], `ui-ext-anchors.json` R-A1 |
| ⑧ | 배포본 ↔ 소스 대조 | Jitsi 앵커 47/47 이 소스 사본 `3860ada` 의 상수·로직과 일치(차이 0). LiveKit Meet 소스맵 원본 = 사본 sha256 일치 | `jitsi-03`(found 47/47), `meet-livekit-07` |

## 4. 각 발견이 바꾼 설계·코드

| 발견 | 바뀐 설계 | 파일 | 커밋 |
|---|---|---|---|
| ① 기본 = 브라우저 내장, RNNoise 는 추가 옵션 | 소음 줄이기 = getUserMedia 제약 토글만(새 의존성 없음), 에코 제거는 늘 켬. RNNoise·Krisp 미도입 | `src/components/room/features/media-fx/` | `d469aab1`·`0c4f32d7`(시트 1개 통합) |
| ② 트랙당 효과 1개 · replaceTrack · 30회 실패 통과 · 워커 타이머 | 조명·배경을 **한 캔버스 파이프라인 슬롯**에 순서대로, 같은 송신기에 replaceTrack(재협상 없음), 워커 타이머 → 창 타이머 폴백, `FX.failMax = 30` | `src/components/room/effects.ts` | `2b15fb5e`·`89650341` |
| ②'' basePath·텔레메트리·wasm 재수신·webgl 필수 | wasm 4파일 자체 호스팅 `forVisionTasks('/mediapipe/wasm/<버전>')`, 분리기 인스턴스 모듈 1개 재사용, 텔레메트리 주소 1개만 fetch 차단, `canSegment()` 기능 탐지, 입력 256×144 축소, 모델 landscape. 모델 없으면 빌드 차단 | `features/backgrounds/engine.ts`, `scripts/copy-mediapipe.mjs` | `290b8517`·`12fe33f5`·`0059f48d`·`c6a7c057` |
| ② 사용자 배경을 localStorage dataURL 에 둠(용량 초과 시 삭제) | 계획 A-8 그대로 **IndexedDB 로컬**(서버 저장 안 함), 해상도 상한 8192px | `features/backgrounds/` | `290b8517`·`0059f48d` |
| ③ timeslice 조각은 첫 조각에만 webm 머리 | 음성 5초 조각 = **조각마다 MediaRecorder 재시작**(단독 해독 가능), 형식은 `isTypeSupported` 기능 탐지 | `src/components/room/use-speech.ts` | `2b15fb5e` |
| ③ Chromium 데스크톱 전용 · presence 고지 · 동의 꺼짐 | 녹화 = 발표자만·무대 canvas + AudioContext 합성 → webm 다운로드, 시작/종료 `app.send{topic:'state'}` 로 전원 '녹화 중' 배지(엔진 메시지 추가 없음), M-4 고지+동의가 더 엄격 | `features/recording/` | `5cfd6d53`·`abab8f4e` |
| ④ 서버 권위 · 늦은 입장자 이력 · 중복 금지 · 500자 | DB(smn_pll·sql/009 함수)가 정본, `refresh` 신호 받으면 다시 읽기(1.5초 묶음), 중복 선택지 거부, 문항 500자·선택지 2~10개·200자, **1인 1표**(복수 선택 미채택), 패널 탭 '설문' | `features/engage/`, `api/seminars/[id]/polls`, `sql/009` | `bb07eb80` |
| ⑤ 하단 중앙 오버레이 · 툴바 회피 · 포인터 무시 | 자막 오버레이 위치·이동·clamp 글자·pointer-events none(폭은 설계서 15.4 min(92%,720px)), `cc-tab` 미채택 | `features/captions/` | `d469aab1`·`92df9468` |
| ⑤ 개인별 번역 언어 | 청중이 고른 언어로 `/api/speech/translate`(문장 해시×언어 LRU) | `api/speech/translate`, `features/captions/` | `4a493a3a` |
| ⑤ 번역 음성 중 원음 덕킹 | 더빙 재생 중 원음 볼륨 20%(계획 SA9, Jitsi 0.15 보다 약간 높게), 표준 합성 음성(M-3) | `features/dubbing/`, `api/speech/tts` | `4bb61455`·`717161a2` |
| ⑥ 참고 구현 없음 | 조명 보정 자체 설계 — 평균 밝기 표본 → ctx.filter → 완화, 상수 분리(실기기 조정용) | `features/media-fx/` | `d469aab1`·`92df9468` |
| ⑦ 받는 쪽 필터를 빠뜨리면 위조 자막 | 판별 키 `topic` 하나, from 은 엔진이 채움, **주제별 역할 검사·4KB·초당 2건 상한을 엔진 한 곳에서**, 잘못된 UTF-8 은 연결 종료 | `media/internal/signal`, `docs/SIGNAL_API.md` 3.6 | `21844766`·`4e33bbad` |
| ⑦ 서버 판으로 기능 노출(LiveKit serverInfo) | 입장 직후 `probeApp` 1회 → 미지원이면 `app` 필요한 ⋯ 항목 숨김 | `use-room.ts`·`room-rules.ts` | `2b15fb5e`·`89650341` |
| 동의가 클라이언트 설정뿐(Jitsi) | 동의를 서버 `smn_agr` 에 기록(더 엄격), 클라이언트는 음성 업로드 안 함 → 헤더 검사 필요 확인 | `sql/008`, `api/speech/agree` | `72b5fb53`·`057c12de`·`13e54040` |

## 5. 기능 팀이 쓴 REA 근거(reaUsed)

| 브랜치 | 쓴 근거 | 기록 위치 |
|---|---|---|
| feat/seminar-app-relay | Jitsi 중계 근거 10곳(relay[0~9]) — 송신 모양·방송·from 은 브리지·받는 쪽 권한 검사. LiveKit Meet 첫 화면 범위 음성 검색 10개 키워드 0건(방 화면 미로드 → 판단 불가) | `EV/engine-01-app-relay-anchors.json`, SIGNAL_API 3.6 '근거(REA)' |
| feat/seminar-ai-db | 공식 SDK 배포본 그래프·경로(`store:false`·x-goog-api-key·model_output 만 수집·TTS speech_config·temperature 없음) → 실제 호출로 확인. Jitsi J1~J5(자막 결과 필드→조각 칼럼, 동의 서버 기록 없음→smn_agr, 'Change vote'→1인 1행 갱신, 출석 기록 없음→smn_atd 자체 설계, 음성 업로드 없음→헤더 검사) | `EV/aidb-rea-usage.json`·`aidb-jitsi-anchors.json` |
| feat/seminar-room-ext | R-E1~R-E3·R-S1·R-S2·R-A1·R-A2·R-P1·R-M1 | [REA_04_UI_EXT](REA_04_UI_EXT.md), `EV/ui-ext-anchors.json` |
| feat/seminar-calendar-links | **REA 근거 미사용** — 위 근거는 룸 기능용이라 캘린더·메일과 무관. UI 는 설계서 15.8 | — |
| feat/seminar-noise-light-caption | ①(내장 처리로 충분·에코 제거 상시) · ⑥(조명 자체 설계) · ⑤(오버레이 위치·이동·글자·포인터) · ②(30회 실패 통과 → 조명에도) | 이 문서 4절 |
| feat/seminar-poll-qna-attend | ④ 서버 권위·이력 / 복수 선택 미채택 / 중복 거부 / 500자 / polls-tab, SIGNAL_API 3.6 refresh 계약(받는 쪽 d 검사) | `sql/009` 머리 주석, 설계서 15.3 |
| feat/seminar-backgrounds | mediapipe-05 selfhost·not_needed·runtime_note·alt_landscape, mediapipe-04 wasm_selection·gpu_cpu·telemetry, mediapipe-01 license, jitsi-04 ②(30회·로컬 저장·입력 축소), 설계서 15.5·15.15 | `EV/mediapipe-0[1-5]` |
| feat/seminar-local-recording · ai-notes · inperson-notes · caption-translate · voice-dubbing | ③(녹화·5초 조각·전원 고지)·⑤(개인별 언어·덕킹)을 앞선 근거 재사용, 새 REA 호출 없음 | 이 문서 4절 |

## 6. 회귀 비교 결과(REA compare-web-captures · analyze-web-bundle)

**① 배포본은 아직 기준선과 같은 배포 id(`dpl_3Zwi…`)** — master 가 origin 보다 43커밋 앞이라 기능 10종이 미배포였다. 그래서 실제 회귀 비교는 **로컬 HEAD 운영 빌드**로 했다.

| 장면 | 기준선 ↔ 배포본 재수집 | 기준선 ↔ 로컬 HEAD | 요청 수 | page-error |
|---|---|---|---|---|
| 진행판(progress) | events·storage 만(잡음) | screenshot·접근성 **같음**(url 호스트·action_state·events·storage 만 다름) | 33 → 33 | 0 → 0 |
| 404 | events 만 | screenshot·접근성 **같음** | 17 → 17 | 0 → 0 |
| 목록(list) | screenshot·접근성 다름 — 원인 = **데이터**(세미나 '테스트' 86ff7149 가 진행 중 목록에서 빠짐), 같은 배포라 코드 변화 없음 | 접근성 차이 = 세미나 데이터 줄뿐 | 38 → 36(목록 행 감소로 prefetch 감소) | 0 → 0 |

| 번들(해제 기준) | 기준선 | HEAD | 차이 | MediaPipe |
|---|---|---|---|---|
| 룸 | 20개 · 974,636 B | 21개 · 1,040,822 B | **+66,186 B(+6.8%)** | `/mediapipe/` 요청 0, tasks-vision 본체 청크(`0439w6hixvrtq.js` 155,083 B) **미적재** — 룸은 동적 import 호출부(`2k9rs0tc7wn1i.js` 72,113 B)만 |
| 목록 | 23개 · 915,414 B | 22개 · 925,423 B | +10,009 B | 없음 |
| 404 | 18개 · 910,228 B | 18개 · 921,243 B | +11,015 B | 없음 |

판정 : 기존 3장면 화면 회귀 **0건**, 오류 0. 룸 첫 화면 JS 는 +66KB(배경 엔진은 지연 로드 유지). **단 HEAD 에서 `pnpm build` 가 실패한다** — `copy-mediapipe.mjs` 가 모델 파일(`public/mediapipe/models/selfie_segmenter_landscape.tflite`)이 저장소에 없어 exit 1(R9). 회귀에 쓴 `.next` 는 모델이 있던 시점의 로컬 빌드다 → 8절 #1.

## 7. 하지 않은 것

- **Google Meet(상용)** : S-2 에 따라 디컴파일·번들 분석·코드 이식을 하지 않았다. 계획서의 "Google Meet 참고"는 공개된 기능 목록 수준이며, 구현 근거는 오픈소스 배포본(T1·T2·T3)과 표준 웹 API 다.
- **Krisp**(Jitsi `libs/krisp/krispsdk.mjs`·모델, LiveKit `@livekit/krisp-noise-filter` 청크 950) : 독점이라 경로·패키지명 존재만 기록. 내려받기·분석 안 함.
- **REA MCP** : 연결 실패(CONNECT_TIMEOUT 30초)라 MCP 도구를 쓰지 못했고 전부 REA CLI 6.4.0 으로 실행했다.
- **회의 참가** : meet.jit.si·meet.livekit.io 모두 대기/입장 전 화면까지만(참가 0회). 그래서 소음 억제 토글·녹화·설문·자막은 런타임 관측 없이 정적 분석만.
- **지연 로드 자산 내려받기** : curl 이 권한 정책에 거부됐다(노이즈 워클릿·rnnoise.wasm·vb-inference-worker·.tflite·tfjs 모델·tflite*.wasm, 로컬 CDP `/json/list`). 우회하지 않았고 소스 사본 vendor 크기로 대체(동일성 미확인).
- **Jitsi 모듈 그래프 재시도** : analyze-javascript-application 이 시간·힙 한도로 실패, 같은 입력·메모리라 재시도 안 함 → 다이제스트 검증 원문의 문자열 앵커로 대체.
- **코드 이식** : 어떤 대상에서도 코드를 옮기지 않았다. 수치(해상도·EMA·실패 횟수·덕킹 비율)는 값만 참고했다.

## 8. [확인중] 목록

| # | 내용 | 담당 |
|---|---|---|
| 1 | ~~**MediaPipe 모델 파일 미커밋으로 `pnpm build`(Vercel 포함) 실패**~~ **해결(`9ca1b26c`)** — `scripts/copy-mediapipe.mjs` 머리 주석의 curl 1줄로 `public/mediapipe/models/selfie_segmenter_landscape.tflite`(약 250KB, Apache-2.0)를 받아 커밋해야 배포된다. 이번 실행은 다운로드가 권한 정책에 거부됨 | [확인중 : 마스터] |
| 2 | Jitsi 지연 로드 자산(워클릿·wasm·모델)의 배포본 크기·sha256 — 다운로드 거부로 미확인 | [확인중 : 권한 허용 시] |
| 3 | RNNoise BSD-3-Clause·Selfie Segmentation 모델 카드 원문 대조 | [확인중 : 라이선스 원문] |
| 4 | 효과 전환 때 재협상 없음·숨은 탭 워커 타이머 30fps 유지 — 정적 읽기만 | [확인중 : 통합 QA] |
| 5 | Pi Browser WebView 의 MediaStreamTrackProcessor·captureStream·MediaRecorder·File System Access·AudioContext 지원 — 전부 기능 탐지로 숨김 처리했으나 실제 노출 여부 미측정 | [확인중 : 실기기] |
| 6 | 음성 5초 조각 재시작 방식의 이음새 손실(조각 경계 단어 잘림) | [확인중 : 실측] |
| 7 | 엔진 `27a18b31` 빌드(v1.3.2 + 관리 API, sha256 `225efa5e…`, v1.3.1 대체) 집 PC 교체 전에는 `app` 필요 기능(자막·녹화·AI 회의록·번역·더빙) 숨김 — 교체 후 실제 응답 확인 | [확인중 : 마스터 엔진 교체] |
| 8 | ~~배포 뒤 배포본 기준 회귀 재측정~~ **해소 — 9절 야간 r1~r6** | — |

## 9. 야간 회귀 비교 (2026-10-27 23:06 ~ 10-28 04:51, 라운드 r1~r6)

라운드마다 병합 → `pnpm build` → push → `Vercel – seminar` success 확인 뒤, **배포본 `https://seminarz.vercel.app`** 을 6절 기준선(2026-10-27 19:33~19:50 KST, 기능 10종 추가 전 배포)과 같은 3장면(목록·진척·404)으로 다시 수집해 비교했다. 요약 JSON = `docs/rea/evidence/REA_04/night/r1~r6.json`(원본 full·normalized 캡처는 작업 폴더, 커밋 안 함). REA MCP 는 연결 실패라 이번에도 CLI.

**명령**(cwd = rea-agents/scripts, 장면 `<s>` = list·progress·404)

```
node rea.mjs capture-browser-scenario <기준선 입력 baseline-seminarz-scene-<s>.input.json> --format json --full-output > <작업>/rea/rN-scene-<s>.full.json
node rea.mjs compare-web-captures REA_04/baseline-seminarz-scene-<s>.normalized.json <작업>/rea/rN-scene-<s>.normalized.json --format json
```

normalized 는 full 의 `data.normalized_result` 를 꺼낸 것.

| 라운드 | 수집(KST) | 배포 커밋 | list 증거 | progress 증거 | 404 증거 | 요청 수(list · progress · 404) |
|---|---|---|---|---|---|---|
| r1 | 00:30 | `5efcf604` 직후 배포 | `ev_747d55f736a956a3a81dc95e9c20da63acf3449a8135ea586523c40e26bceca4` | `ev_9ffd0585e8cd2b26ee27c5593e6472e74ae3c2d4d0ef8addc651bd661582da1c` | `ev_a9a593472d077d5caa0254434b7f68c25f10b3d1dc65daf190a891eb1139fef1` | 38→42 · 33→37 · 17→17 |
| r2 | 01:21 | `7e569f76` | `ev_56b7f0f79e22cac3c6b8ab7c1f6f95cb8e86b9844521904ca15db59cdd5ba752` | `ev_c96df272049a0058b3fbbac71f437283344eaeabe3af9650ff762d484b5b5281` | `ev_1f81674d255a25a9b74d4fd63be628a385044e878f4bd9768f8d235c7a9296d4` | 38→42 · 33→37 · 17→17 |
| r3 | 02:13 | `f9806079` | `ev_167ec98ecc28da0a824ec865003899127c747d4c9a54053b8eee1ef0860ec9c4` | `ev_a136951d7dde3d176244cb6999de4cfb3041bb761860174bccb1a1ad728ea4c1` | `ev_a47ff93966dbab52c07a47bd063770348fc0df743c6e5b1770518d6b56c624fc` | 38→42 · 33→37 · 17→17 |
| r4 | 03:15 | `87933872` | `ev_49e9037faa357964a3e2ad423d008a705e2c8225239b60384f5df4693d5a8e84` | `ev_771d4b0b0ad6f1f580cf6079ba5fed386db0210ba4d3c05728e9d872e150483d` | `ev_c9a1423524411cf14b5d0fe0e28d699eb3b3cdfd1bd6697b89abc13e3a7f2d1c` | 38→42 · 33→37 · 17→17 |
| r5 | 03:55 | `1af8268b`(r5 병합, 배포는 `350adc25`) | `ev_68c989e248c801255fc0b11e54514d2d226f3cc1204b38050658521e5fe0ccff` | `ev_0da2cb6d53a4b45e74becb7efc6a95ac1fd51a6014aa7f379c31fd9940af36f0` | `ev_30bd99551d842198f48c45fcbcc004e18272a95cbcb86118da3f213e8b75c8d6` | 38→42 · 33→37 · 17→17 |
| r6 | 04:51 | `4f322641` | `ev_efc6c9cf6aeed267b9964a99324b2fa8332d0a2913ab9ba1c4ae3ced5e8dd3ef` | `ev_ac0857bbd1af87494a1614c3559ee0d2a8aaf959803203564bf15f08bcb6ee28` | `ev_8ae4b40a5af2bc70e3d09504e4d2b9ec96711c0123b82d1b07847e824bc8ed92` | 38→42 · 33→37 · 17→15 |

**차이(6회 공통)** : 세 장면 모두 overall `changed`, 정렬 aligned 2단계, 수집 complete, **페이지 오류 0**, **접근성 이름 추가·삭제 0**.

- **list** : 요청 38→42(fetch 20→24). screenshot·접근성·storage·events 변화 = 목록 데이터 변화. r1 에서 로컬 QA 세미나가 운영 목록에 노출된 것을 발견 → 결함(high)으로 분리(NIGHT_REPORT_2026-10-28 ① 위험 3, TROUBLESHOOT).
- **progress** : 요청 33→37. 화면·접근성 변화 = 진척 문구 갱신. 실패는 RSC prefetch `ERR_ABORTED` 뿐(기준선과 같은 종류).
- **404** : 문서 307→404 동일. r1~r5 요청 17→17, **r6 17→15**(script 12→11·other 2→1, Pi SDK 스크립트 `ERR_ABORTED` 요청이 빠짐 — 오류 감소 방향). 변화는 events(배포 id·CSS preload 경고)뿐.
- 콘솔은 Pi SDK postMessage origin 경고와 404 리소스 오류뿐이며 기준선에도 있었다.

판정 : 야간 59건 병합으로 기존 3장면의 **화면 회귀 0건·오류 0**. 8절 #8(배포본 기준 재측정)은 이것으로 해소.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-27 | 최초 작성 — Jitsi·LiveKit Meet·MediaPipe·기준선/회귀 REA 기록 합본, 발견 ①~⑧ → 설계·코드·커밋 추적, 기능 팀 reaUsed, 회귀 결과, [확인중] 8건 |
| 2026-10-28 | 9절 야간 회귀 비교(r1~r6 REA 명령·증거 ID·차이) 추가, 8절 #1·#8 해소·#7 엔진 빌드 갱신 |
