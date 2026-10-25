// S-1 구성 점검 — 빈 인터셉터 API 로 PeerConnection 을 만들고 VP8·Opus 를 협상할 수 있는지(실행 : go test ./internal/capri)
package capri

import (
	"strings"
	"testing"

	"github.com/pion/webrtc/v4"
)

func TestNewAPIOffersVP8AndOpus(t *testing.T) {
	api, err := NewAPI(Config{})
	if err != nil {
		t.Fatal(err)
	}
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	for _, k := range []webrtc.RTPCodecType{webrtc.RTPCodecTypeVideo, webrtc.RTPCodecTypeAudio} {
		if _, err := pc.AddTransceiverFromKind(k, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
			t.Fatal(err)
		}
	}
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"VP8/90000", "opus/48000"} {
		if !strings.Contains(offer.SDP, want) {
			t.Errorf("offer 에 %s 없음", want)
		}
	}
	// 기본 인터셉터가 없으면 영상 m-line 에 transport-cc(TWCC) 피드백이 붙지 않는다(S-1)
	if strings.Contains(offer.SDP, "transport-cc") {
		t.Error("TWCC 피드백이 붙음 — 기본 인터셉터가 등록된 것으로 보임(S-1 위반)")
	}
}
