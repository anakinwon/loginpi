// Galápagos — seminar.pi 자체 화상 엔진(SFU) 진입점. 설계 정본 docs/PRD_02_ENGINE_DESIGN.md, 단계 docs/PRD_01_MEDIA_ENGINE.md
// M1 착수 골격 : S-1(pion 기본 인터셉터 미사용) API 구성과 상태 확인 엔드포인트만. 실행 : go run ./cmd/galapagos
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"
)

// newAPI — S-1 : MediaEngine 에 VP8·Opus 만 등록하고 **빈** InterceptorRegistry 를 명시적으로 넘긴다.
// ⚠ pion v4 NewAPI 는 레지스트리를 안 넘기면 기본 인터셉터(NACK·TWCC·SR/RR 등)를 자동 등록한다(api.go NewAPI) — 생략 금지
// 빈 레지스트리 = NACK·TWCC·GCC·SR/RR 인터셉터 없음 → 손실 복구·대역폭 추정·RTCP 는 우리 모듈(nack·bwe·rtcpx)이 직접 맡는다(S-1). 코덱은 VP8·Opus 만(D-13)
func newAPI() (*webrtc.API, error) {
	m := &webrtc.MediaEngine{}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8, ClockRate: 90000},
		PayloadType:        96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		return nil, err
	}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		return nil, err
	}
	return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithInterceptorRegistry(&interceptor.Registry{})), nil
}

func main() {
	api, err := newAPI()
	if err != nil {
		log.Fatalf("API 구성 실패: %v", err)
	}
	_ = api // M1 : capri(Transport)가 이 API 로 PeerConnection 을 만든다

	addr := os.Getenv("MEDIA_LISTEN")
	if addr == "" {
		addr = ":7880"
	}
	http.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	log.Printf("Galápagos 대기 %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
