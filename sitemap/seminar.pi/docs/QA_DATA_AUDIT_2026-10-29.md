# 운영 DB 시험 데이터 조사 — 2026-10-29

> 대상 : seminar.pi 운영 DB(Supabase `dwgudmktxcxirtjtgacn`, 스키마 `public`) · 방식 : 읽기 전용 REST `GET`(service role, 쓰기 0건) · 조사 시각 2026-10-29 · 시각 표기는 KST
> 배경 : 마스터 결정 C(2026-10-29) — 비운영 스키마 폐지, 로컬·시험·운영 모두 `public`. 그 전 야간 E2E(2026-10-27~28 r1~r6)와 그 앞 브라우저 QA 가 운영 `public` 에 만든 행을 가려낸다(PRD 7절 운영 규칙 · TROUBLESHOOT 2026-10-28 행).
> 개인정보 : 계정은 `pi_username` 앞 3자 + `***` 로만 적는다.

## 1. 요약

| 구분 | 건수 | 비고 |
|---|---|---|
| **확실 — 아직 살아 있는 행(`del_yn='N'`)** | **217** | 전부 시험 계정이 만든 행, 부모 세미나는 이미 논리삭제 → 6절 SQL 로 정리 제안 |
| 의심 | **0** | 표지 없는 시험 계정·시간대 행 없음(시험 계정 10개는 전부 `regr_id='QA'` 로 구분됨) |
| 판단 보류(마스터 계정이 야간 시험 시간대에 남긴 행) | 3 | 4절 — 지우자고 하지 않음, 마스터 확인 필요 |
| 결제 연관(`pi_pymnt`) | **시험 연관 0** | 결제 원장 3건은 모두 마스터 본인 요금제 결제(5절) — 논리삭제 대상 아님 |
| 이미 논리삭제(`del_yn='Y'`) — 집계만 | 76 | `smn_mst` 24 · `smn_ptc` 18 · `smn_nt` 23 · `sys_user` 10 · `smn_agr` 1 (마스터 계정 참가 1건은 4절에 따로) |

**핵심** : 지난 정리(야간 r1~r6 라운드 끝마다·10-27 브라우저 QA 끝)는 **세미나·참가·회의록·계정만 논리삭제하고 딸린 행은 남겼다**. 남은 217건은 출석·설문(문항·선택지·투표)·Q&A(질문·추천)·AI 계량·동의 기록이다. 화면은 부모 세미나가 숨겨져 있어 노출되지 않지만, 집계(AI 사용량·출석·동의 통계)를 테이블 단위로 내면 섞인다.

## 2. 시험 계정·시험 세미나 식별

### 2.1 시험 계정 (10개 — 모두 이미 논리삭제)

| usr_id 앞 8자 | 계정(가림) | 역할 | 생성 시각 | 묶음 |
|---|---|---|---|---|
| 757cafd9 · 7b354e82 · 098523f7 | qa_*** | ADMIN 1 · USER 2 | 10-27 01:13 | 1차 브라우저 QA(10-27 새벽) |
| 0cfda856 · 05163ea8 · 9e3e4a79 | qa2*** | ADMIN 1 · USER 2 | 10-27 01:52 | 2차 브라우저 QA(NIGHT_REPORT_2026-10-27 "세미나 14·참가 1·사용자 3") |
| 6f6d6a22 · c4df0e75 · 8de093d1 · af58e3fb | qa3*** | ADMIN 1 · USER 3 | 10-27 23:53 ~ 10-28 00:19 | 야간 E2E r1~r6(NIGHT_REPORT_2026-10-28) |

판정 근거 : 계정명 `qa…` 표지 + `sys_user.regr_id='QA'`(실사용 계정은 전부 `'ADMIN'`) + 보고서 기록과 생성 시각 일치.

### 2.2 시험 세미나 (24개 — 모두 이미 논리삭제, 집계만)

| 묶음 | 개수 | 제목 | 생성 시각 | 논리삭제 시각 |
|---|---|---|---|---|
| 1차 QA(qa_***) | 4 | QA 무료 세미나 · QA 유료 세미나 · QA 무료 세미나 2 · QA 화질 세미나 | 10-27 01:17 ~ 01:26 | 10-27 01:32 |
| 2차 QA(qa2***) | 14 | QA-무료 세미나 · QA-유료 세미나 · QA-페이지-01~12 | 10-27 01:54 | 10-27 02:01 |
| 야간 E2E(qa3***) | 6 | `[QA-야간] r1 E2E` ~ `r6 E2E` (id 54000d08·0e88efc2·a2d79dbd·0fb8b85a·e5438173·0ba3a13b) | 10-27 23:54 ~ 10-28 04:30 | 각 라운드 끝(00:32·01:22·02:13·03:16·03:53·04:51) |

참고 : 야간 세미나 6개는 `smn_sts_cd='LIVE'` 인 채로 논리삭제됨(종료 처리 없이 삭제). `del_yn='Y'` 라 목록·입장 경로에서 제외되므로 정리 대상 아님.

### 2.3 시험 아님으로 판정한 것 (지우지 않음)

| 대상 | 판정 | 근거 |
|---|---|---|
| 마스터(ana***) 개최 세미나 9개 — "테스트"(86ff7149)·"Test"(1c10a138)·"로아탄"·"꼬사멧"·"키프로스"·"히스파니올라"(부제 "월요금제 세미나룸 개설 테스트")·"팔라완"(부제 "월요금제 테스트")·"누사페니다"(부제 "무료요금제 테스트")·"크가리"(부제 "Pi Browser 테스트") | **실사용(마스터 실기기 시험)** | 제목·부제에 "테스트" 표지가 있으나 개최자 = 마스터 계정, 실제 참가자(whi***·ccl***·mas***·ana***)·결제·요금제 이용 기록과 이어짐. 지시대로 정리 제안에서 제외 |
| 그 세미나들에 딸린 참가 7 · 출석 12 · 설문 2(+선택지 5·투표 3) · 동의 9 · 별명 2(1건 이미 삭제) | 실사용 | 부모가 마스터 세미나 |
| 계정 whi*** · ccl*** · mas*** · ana***(USER) | 실사용 | `regr_id='ADMIN'`, 마스터 세미나 참가, 시험 표지 없음 |

## 3. 확실 — 정리 제안 대상 217건

판정 : **전부 확실**. 근거 = ① 생성 계정이 시험 계정(2.1, `regr_id='QA'`·논리삭제됨) ② 부모 세미나가 시험 세미나(2.2, 이미 논리삭제) ③ 생성 시각이 야간 E2E 라운드 시간대(10-27 23:06 ~ 10-28 04:51) ④ 내용에 `QA 설문`·`QA 질문`·`[QA-야간]` 표지. 1차·2차 브라우저 QA(10-27 새벽)에 딸려 살아 있는 행은 없음.

| 테이블 | 확실(살아 있음) | 이미 논리삭제(시험분) |
|---|---|---|
| smn_atd 출석 | 18 | 0 |
| smn_pll 설문 | 26 | 0 |
| smn_pll_opt 설문 선택지 | 52 | 0 |
| smn_pll_vt 설문 투표 | 45 | 0 |
| smn_qna Q&A 질문 | 26 | 0 |
| smn_qna_rcm Q&A 추천 | 24 | 0 |
| smn_vc_use AI 사용 계량 | 11 | 0 |
| smn_agr 동의 기록 | 15 | 1 |
| smn_ptc 참가 · smn_nt 회의록 · smn_mst 세미나 · sys_user 계정 | 0 | 18 · 23 · 24 · 10 |
| smn_nt_seg · smn_ncknm · smn_hst_pln · pi_pymnt | 0 | 0 (시험 행 없음) |
| **합계** | **217** | **76** |

### 3.1 상세 목록

| 테이블 | 묶음(부모 세미나) | 건수 | id 앞 8자 | 요지 | 생성 시각(KST) | 생성 계정 |
|---|---|---|---|---|---|---|
| smn_atd | [QA-야간] r1 E2E | 3 | cae5bbe9 38f620b7 62294ee9 | 출석 | 10-27 23:55 ~ 23:57 | qa3*** |
| smn_atd | [QA-야간] r2 E2E | 3 | 8bd20bc6 d8d5f073 05abc450 | 출석 | 10-28 01:11 | qa3*** |
| smn_atd | [QA-야간] r3 E2E | 3 | 5f29c381 32f1e4ed f072053a | 출석 | 10-28 02:01 | qa3*** |
| smn_atd | [QA-야간] r4 E2E | 3 | 6910ca2f b543677a a84800fd | 출석 | 10-28 02:47 | qa3*** |
| smn_atd | [QA-야간] r5 E2E | 3 | 16759b6f 532610a2 c51faadd | 출석 | 10-28 03:48 | qa3*** |
| smn_atd | [QA-야간] r6 E2E | 3 | 70651594 3773083c 71b3daab | 출석 | 10-28 04:30 | qa3*** |
| smn_pll | [QA-야간] r1 E2E | 5 | 639d1d13 99bb5931 a4a4422f d9c5f472 49690459 | QA 설문? / QA 설문 xtni? / QA 설문 agty? | 10-28 00:10 ~ 00:28 | qa3*** |
| smn_pll | [QA-야간] r2 E2E | 1 | 8aeb2749 | QA 설문 v98c? | 10-28 01:12 | qa3*** |
| smn_pll | [QA-야간] r3 E2E | 3 | 0d2892fc 490ab9d3 17b9fb2b | QA 설문 mfro? / oyjj? / qrrp? | 10-28 02:01 ~ 02:04 | qa3*** |
| smn_pll | [QA-야간] r4 E2E | 9 | 50170de4 227d6373 615b4646 046e544a af2bdc3d 700a592c 8c5f542a 694906fa 4e457090 | QA 설문 a96i? / pxlt? / skqa? 외 | 10-28 02:47 ~ 03:08 | qa3*** |
| smn_pll | [QA-야간] r5 E2E | 1 | 96cb0836 | QA 설문 gfnx? | 10-28 03:48 | qa3*** |
| smn_pll | [QA-야간] r6 E2E | 7 | d6db53d3 3d460dfd ea4eb80a 1e617d50 f1c7f751 1aa3296f 6fe2d938 | QA 설문 yg3q? / 0z6j? / 1pib? 외 | 10-28 04:30 ~ 04:45 | qa3*** |
| smn_pll_opt | [QA-야간] r1 E2E | 10 | 4cd4709e 20e02953 57035a1a 9eecc2a3 b4e612b9 39931ccf 89050218 8dd90495 033c30ea de56dd09 | 선택지 예 / 아니오 | 10-28 00:10 ~ 00:28 | qa3*** |
| smn_pll_opt | [QA-야간] r2 E2E | 2 | a1b0a0be 0e9402a5 | 선택지 예 / 아니오 | 10-28 01:12 | qa3*** |
| smn_pll_opt | [QA-야간] r3 E2E | 6 | 4bfe67b9 9893be8b 9c8e7f6e 542981f8 c4c9c556 bfe5a133 | 선택지 예 / 아니오 | 10-28 02:01 ~ 02:04 | qa3*** |
| smn_pll_opt | [QA-야간] r4 E2E | 18 | dca792ff 079d5ac5 27e48e30 88f74351 6056fc92 46966e82 38c547fa a037299f cf0a59f3 d31e5874 82b47e8e c9bca316 d607c430 1e1c5d4e da6afaed f7416f2a feab1d19 0b19961a | 선택지 예 / 아니오 | 10-28 02:47 ~ 03:08 | qa3*** |
| smn_pll_opt | [QA-야간] r5 E2E | 2 | 6a524646 7621db32 | 선택지 예 / 아니오 | 10-28 03:48 | qa3*** |
| smn_pll_opt | [QA-야간] r6 E2E | 14 | 885f470d 338dbc7f 988a3adb 66d187b5 326e025c 967ea8ec 74320572 d030dca1 38226691 0fada876 d8cc3861 bde70b7c fd5d9fb1 72ffdb7d | 선택지 예 / 아니오 | 10-28 04:30 ~ 04:45 | qa3*** |
| smn_pll_vt | [QA-야간] r1 E2E | 3 | 522f9e93 b9fcef1e f6623c99 | 투표 | 10-28 00:18 ~ 00:28 | qa3*** |
| smn_pll_vt | [QA-야간] r2 E2E | 2 | e4be9e64 067bf163 | 투표 | 10-28 01:12 | qa3*** |
| smn_pll_vt | [QA-야간] r3 E2E | 6 | 276d8a80 4016dbd2 ac57ff75 86c1a22d 2055a730 db7cfecc | 투표 | 10-28 02:01 ~ 02:04 | qa3*** |
| smn_pll_vt | [QA-야간] r4 E2E | 18 | 665e882a 33e45586 066527b8 f02c2952 f7973873 df9eb1a7 dc4646d5 efd4b2b4 6fc046e8 29e3d2b9 d6e3307f 4132284b 8a332c48 d218d380 440f7582 1c60d147 35c9a45d 188362a1 | 투표 | 10-28 02:48 ~ 03:08 | qa3*** |
| smn_pll_vt | [QA-야간] r5 E2E | 2 | 260164ed 81171c26 | 투표 | 10-28 03:48 | qa3*** |
| smn_pll_vt | [QA-야간] r6 E2E | 14 | 280abd35 f4260427 da0ff430 83e5798e 8c2a1a59 617cbe07 d86bd111 2611a4e3 20519653 e3a67319 c1e42fd2 48b18285 93aa7bdf 42e24378 | 투표 | 10-28 04:30 ~ 04:45 | qa3*** |
| smn_qna | [QA-야간] r1 E2E | 4 | 2eafaf5f a87dbd38 04b6eccb 53e79c27 | QA 질문 하나 / xtni / agty | 10-28 00:10 ~ 00:28 | qa3*** |
| smn_qna | [QA-야간] r2 E2E | 1 | 25c3451b | QA 질문 v98c | 10-28 01:12 | qa3*** |
| smn_qna | [QA-야간] r3 E2E | 3 | 7bf19734 60d669fc a6dac391 | QA 질문 mfro / oyjj / qrrp | 10-28 02:01 ~ 02:04 | qa3*** |
| smn_qna | [QA-야간] r4 E2E | 9 | 66f0170b 72bee966 b1acb984 61b8023e cdc8ebac 3d553b40 caa1a281 c35dc592 453abe5f | QA 질문 a96i / pxlt / skqa 외 | 10-28 02:48 ~ 03:08 | qa3*** |
| smn_qna | [QA-야간] r5 E2E | 1 | e2540879 | QA 질문 gfnx | 10-28 03:48 | qa3*** |
| smn_qna | [QA-야간] r6 E2E | 8 | 9bdf278f 38da0131 a5e8158e 721bd2c3 82b5b27a 137746a6 7d445474 6f6e3805 | QA 질문 yg3q / 0z6j / 1pib 외(QA 반복 nemq 포함) | 10-28 04:30 ~ 04:49 | qa3*** |
| smn_qna_rcm | [QA-야간] r1 E2E | 3 | c813bb83 a749abc1 95636860 | 추천 | 10-28 00:10 ~ 00:28 | qa3*** |
| smn_qna_rcm | [QA-야간] r2 E2E | 1 | 4c7b5a31 | 추천 | 10-28 01:12 | qa3*** |
| smn_qna_rcm | [QA-야간] r3 E2E | 3 | d634bd84 b8336613 148f2b9c | 추천 | 10-28 02:01 ~ 02:04 | qa3*** |
| smn_qna_rcm | [QA-야간] r4 E2E | 9 | 54f0cc98 08f5e576 1d13dc0d 82339f4f c9c0cc3c b9336b74 37337c80 03230a41 4d43c169 | 추천 | 10-28 02:48 ~ 03:08 | qa3*** |
| smn_qna_rcm | [QA-야간] r5 E2E | 1 | 11f4d580 | 추천 | 10-28 03:48 | qa3*** |
| smn_qna_rcm | [QA-야간] r6 E2E | 7 | 2e8b019b f5e72117 3fc68432 42d1b424 24545ed4 4b86f0ea 5445bfde | 추천 | 10-28 04:30 ~ 04:45 | qa3*** |
| smn_vc_use | [QA-야간] r2 E2E | 1 | afd65f2f | AI 계량 req1·3초 | 10-28 01:19 | qa3*** |
| smn_vc_use | [QA-야간] r3 E2E | 2 | 49db0e64 d5c70e17 | AI 계량 req1·3초 | 10-28 02:03 ~ 02:04 | qa3*** |
| smn_vc_use | [QA-야간] r5 E2E | 1 | b92b531e | AI 계량 req1·3초 | 10-28 03:48 | qa3*** |
| smn_vc_use | [QA-야간] r6 E2E | 7 | d4dbc866 736a6100 2b9cf62b 9cc2f60e 57c9a29e c589d702 3c37fde9 | AI 계량 req1·3초 | 10-28 04:30 ~ 04:44 | qa3*** |
| smn_agr | (세미나 없음 — 대면 노트 고지) | 9 | d6dc3355 0a8be5c1 d393f156 a8bf64bf d5e79a76 5e23c78d f5fa49df ab9d4a1b b5f6c82a | NOTE_NOTICE | 10-28 00:26 ~ 04:48 | qa3*** |
| smn_agr | [QA-야간] r1~r6 E2E 각 1 | 6 | bbd81380 7ae54f98 6558068e 10f4ce4f cc62a3bf bd3cf446 | SPEECH_XFER | 10-28 00:00 ~ 04:30 | qa3*** |

## 4. 판단 보류 — 마스터 계정이 야간 시험 시간대에 남긴 행 (정리 제안 안 함)

| 테이블 | id 앞 8자 | 내용 | 생성 시각 | 계정 | 상태 |
|---|---|---|---|---|---|
| smn_ptc | a0441a27 | `[QA-야간] r4 E2E` 참가 | 10-28 02:58 | ana***(마스터 ADMIN, 709871e6) | 이미 `del_yn='Y'` |
| smn_agr | 326ef69a | `[QA-야간] r4 E2E` 발화 전송 동의(SPEECH_XFER) | 10-28 02:58 | ana***(마스터) | 살아 있음 |
| smn_agr | e3c08e08 | 마스터 세미나 "Test" 발화 전송 동의(SPEECH_XFER) | 10-28 03:00 | ana***(마스터) | 살아 있음 |

마스터 계정이 시험 세미나에 참가·동의한 기록이 야간 r4 시간대(02:47 ~ 03:16)에 있다. 마스터가 그 시각 실기기로 들어간 것인지, 야간 E2E 가 마스터 계정 세션으로 접속한 것인지 기록만으로는 가를 수 없다 **[확인중 : 마스터]**. 후자라면 시험이 실계정을 쓴 것이라 시험 계정 분리 규칙을 다시 확인해야 한다. 지시대로 마스터 계정 행은 정리 제안에서 뺐다.

## 5. 결제 원장 `pi_pymnt` — 별도 표시 (논리삭제 대상 아님)

| pymnt_id 앞 8자 | 계정 | 금액(Pi) | 유형 | 상태 | 생성 시각 | 판정 |
|---|---|---|---|---|---|---|
| vKxS9AhS | ana***(마스터) | 48.61 | SMN_PLAN(월 요금제 M) | CANCELED | 10-29 07:17 | 마스터 본인 결제 시도 — 실사용 |
| F1GmH15t | ana***(마스터) | 48.61 | SMN_PLAN(월 요금제 M) | CANCELED | 10-29 07:17 | 마스터 본인 결제 시도 — 실사용 |
| 0C99fjg9 | ana***(마스터) | 48.64 | SMN_PLAN(월 요금제 M) | COMPLETED | 10-29 07:31 | 마스터 본인 결제 완료 — `smn_hst_pln`(M, 30시간, 사용 1,732초)과 연결 |

- **시험 계정의 결제 행 0건**, 시험 세미나 참가(`smn_ptc.pymnt_id`)에 붙은 결제도 0건. 시험 유료 세미나 2개(QA 유료 세미나·QA-유료 세미나)도 결제 없이 삭제됐다.
- 결제 원장은 감사 기록이므로 시험 여부와 관계없이 논리삭제를 제안하지 않는다. 위 3건은 마스터 실기기 결제라 정리 대상도 아니다.

## 6. 마스터 승인용 논리삭제 SQL — **실행 완료(마스터 승인 2026-10-29)**

> **실행 기록** : 2026-10-29 마스터 지시 "시험 데이터 217건 논리삭제 진행해줘"(동의 15건 포함). 아래 SQL 을 그대로 한 트랜잭션으로 실행 — ① 사전 건수 10항목 기대값과 모두 일치 → ② UPDATE 8문 반환 건수 각각 기대값과 일치(atd 18·pll_vt 45·pll_opt 52·pll 26·qna_rcm 24·qna 26·vc_use 11·agr 15) → **COMMIT, 논리삭제 217건**(`modr_id='QA-CLEANUP'`). 실행 뒤 운영 `/api/seminars` 200. 마스터 계정 야간 행 3건(4절)·결제 원장·마스터 '테스트' 세미나는 그대로.

- 범위 : 3절 217건만. 대상을 id 나열 대신 **"시험 계정(`sys_user.regr_id='QA'`, 논리삭제됨)이 연 세미나 또는 시험 계정이 만든 행"** 조건으로 묶고, 조사 시점 이전(`reg_dtm < 2026-10-29 00:00 KST`)으로 막아 이후 생긴 행은 건드리지 않는다. 마스터 계정 행(4절)은 `usr_id` 조건으로 빠진다.
- 실행 전 ①의 건수가 3절 표(18·26·52·45·26·24·11·15)와 같은지 확인하고, 다르면 실행하지 않는다. 한 트랜잭션 안에서 ②를 돌리고 각 `UPDATE` 반환 건수를 대조한 뒤 `COMMIT`(초안은 끝이 `ROLLBACK`).
- 물리 DELETE 아님(DA 표준 논리삭제). `pi_pymnt`·`sys_user`·`smn_mst` 는 건드리지 않는다.
- 이 SQL 은 운영 DB 에서 실행해 본 적이 없다(작성만, 건수는 조사 시점 REST 조회값으로 맞춤).

```sql
-- 운영 시험 데이터 논리삭제(2026-10-29 조사분 217건) — 마스터 승인 후 Supabase SQL Editor 에서 실행
BEGIN;

CREATE TEMP TABLE qa_usr ON COMMIT DROP AS
SELECT usr_id FROM sys_user WHERE regr_id = 'QA' AND del_yn = 'Y';

CREATE TEMP TABLE qa_smn ON COMMIT DROP AS
SELECT smn_id FROM smn_mst
WHERE hst_usr_id IN (SELECT usr_id FROM qa_usr) AND del_yn = 'Y';

-- ① 사전 건수 확인 — 기대값 : qa_usr 10 · qa_smn 24 · atd 18 · pll 26 · pll_opt 52 · pll_vt 45 · qna 26 · qna_rcm 24 · vc_use 11 · agr 15
SELECT
  (SELECT count(*) FROM qa_usr) AS qa_usr
, (SELECT count(*) FROM qa_smn) AS qa_smn
, (SELECT count(*) FROM smn_atd     WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS atd
, (SELECT count(*) FROM smn_pll     WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND smn_id IN (SELECT smn_id FROM qa_smn)) AS pll
, (SELECT count(*) FROM smn_pll_opt WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND pll_id IN (SELECT pll_id FROM smn_pll WHERE smn_id IN (SELECT smn_id FROM qa_smn))) AS pll_opt
, (SELECT count(*) FROM smn_pll_vt  WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS pll_vt
, (SELECT count(*) FROM smn_qna     WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS qna
, (SELECT count(*) FROM smn_qna_rcm WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS qna_rcm
, (SELECT count(*) FROM smn_vc_use  WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS vc_use
, (SELECT count(*) FROM smn_agr     WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr)) AS agr;

-- ② 논리삭제(행 삭제 아님 — FK 그대로)
UPDATE smn_atd     SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 18

UPDATE smn_pll_vt  SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 45

UPDATE smn_pll_opt SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09'
  AND pll_id IN (SELECT pll_id FROM smn_pll WHERE smn_id IN (SELECT smn_id FROM qa_smn));           -- 52

UPDATE smn_pll     SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND smn_id IN (SELECT smn_id FROM qa_smn);    -- 26

UPDATE smn_qna_rcm SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 24

UPDATE smn_qna     SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 26

UPDATE smn_vc_use  SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 11

UPDATE smn_agr     SET del_yn = 'Y', del_dtm = now(), modr_id = 'QA-CLEANUP', mod_dtm = now()
WHERE del_yn = 'N' AND reg_dtm < '2026-10-29 00:00+09' AND usr_id IN (SELECT usr_id FROM qa_usr);    -- 15 (마스터 326ef69a·e3c08e08 제외)

-- 반환 건수가 주석과 모두 같으면 COMMIT, 하나라도 다르면 ROLLBACK
-- COMMIT;
ROLLBACK;
```

## 7. 판단이 애매했던 점·후속 제안

1. **마스터 계정의 야간 시험 참여 3건(4절)** — 시험이 실계정 세션을 썼다면 "시험은 시험 계정으로만" 규칙을 PRD 7절에 더할지 마스터 판단 필요.
2. **동의 기록(`smn_agr`) 정리 여부** — 동의 이력은 증빙 성격이 있으나, 대상 15건은 실존 사용자가 아닌 시험 계정의 동의라 정리 대상에 넣었다. 시험 계정 것도 남기자는 방침이면 SQL 에서 `smn_agr` 문만 빼면 된다(그 경우 202건).
3. **AI 계량(`smn_vc_use`) 11건** — 모두 req 1회·3초짜리 시험 계량이고 `usr_id` 가 전부 시험 계정이다. 이 테이블을 일·전역 합계로 쓰는 집계가 있는지는 코드 대조를 하지 않았다 [확인중].
4. **재발 방지** — 지난 정리는 부모(세미나·참가·회의록·계정)만 지웠다. 시험 뒤 정리는 3절 테이블(출석·설문 3종·Q&A 2종·AI 계량·동의)까지 함께 논리삭제해야 한다. `[QA-…]` 제목 규칙과 함께 "시험 계정은 `regr_id='QA'`" 를 정리 조건으로 쓰면 이번 SQL 을 날짜만 바꿔 재사용할 수 있다.
5. 마스터 세미나 "테스트"·"Test"·부제 "…테스트" 들은 제목상 시험이지만 마스터 실기기 시험이라 남겼다. 목록에서 치우고 싶으면 마스터가 화면에서 직접 지우거나 별도 지시.
