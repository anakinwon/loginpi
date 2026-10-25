// Package record — 녹화기 = 내부 Consumer 1개(jeju.Writer 구현). 최고 레이어 고정·할당기 제외, 미디어 경로는 고치지 않는다(PRD_02 3.3 record).
// 형식 : 영상 VP8 → IVF, 음성 Opus → Ogg(표준 라이브러리 직접, 외부 프로세스 없음). 합치기(WebM/MP4)는 후처리 [TBD]. 켜기 = env MEDIA_RECORD_DIR. 담당 : M5 전부.
package record
