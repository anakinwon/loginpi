// Package record — 녹화기 = 내부 Consumer 1개(jeju.Writer 구현). 최고 레이어 고정·할당기 제외, 미디어 경로는 고치지 않는다(PRD_02 3.3 record).
// 소유 고루틴 : Recorder 마다 파일 쓰기 1개(jeju 송신 고루틴이 WriteRTP 로 넘김). 저장 형식(WebM/IVF)·외부 프로세스 여부 [TBD : M5]. 담당 : M5 전부.
package record
