// S-1 구성 점검 — 빈 인터셉터 API 로 PeerConnection 을 만들고 VP8·Opus 를 협상할 수 있는지(실행 : go test ./internal/capri)
package capri

import (
	"net"
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

// D-12 M4 : 구독(서버 송신) 트랙에 abs-send-time 이 협상되고 sender 에서 ID 를 읽을 수 있다.
func TestAbsSendTimeNegotiated(t *testing.T) {
	api, err := NewAPI(Config{})
	if err != nil {
		t.Fatal(err)
	}
	srv, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	track, err := webrtc.NewTrackLocalStaticRTP(CodecVP8, "v", "s")
	if err != nil {
		t.Fatal(err)
	}
	s, err := srv.AddTrack(track)
	if err != nil {
		t.Fatal(err)
	}
	offer, err := srv.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = srv.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(offer.SDP, AbsSendTimeURI) {
		t.Fatal("구독 offer 에 abs-send-time 없음")
	}
	// 청중 쪽(브라우저 대역) : 기본 코덱 + abs-send-time 수신
	me := &webrtc.MediaEngine{}
	if err = me.RegisterDefaultCodecs(); err != nil {
		t.Fatal(err)
	}
	if err = me.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: AbsSendTimeURI}, webrtc.RTPCodecTypeVideo); err != nil {
		t.Fatal(err)
	}
	cli, err := webrtc.NewAPI(webrtc.WithMediaEngine(me)).NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer cli.Close()
	if err = cli.SetRemoteDescription(offer); err != nil {
		t.Fatal(err)
	}
	ans, err := cli.CreateAnswer(nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = cli.SetLocalDescription(ans); err != nil {
		t.Fatal(err)
	}
	if err = srv.SetRemoteDescription(ans); err != nil {
		t.Fatal(err)
	}
	if id := AbsSendTimeID(s); id == 0 {
		t.Fatal("협상된 abs-send-time ID 를 못 읽음")
	}
}

// 공인 IP 설정 시 공인 IP host 후보를 '추가'하고 LAN(여기선 루프백) host 후보도 남긴다 — 같은 공유기 안 단말이 헤어핀 없이 붙는다.
func TestPublicIPAppendsKeepsLocalHost(t *testing.T) {
	const pub = "203.0.113.7" // 문서용 주소(RFC 5737) — 실제 인터페이스와 겹치지 않는다
	l, err := net.ListenUDP("udp", &net.UDPAddr{})
	if err != nil {
		t.Fatal(err)
	}
	port := l.LocalAddr().(*net.UDPAddr).Port
	l.Close()
	api, err := NewAPI(Config{UDPPort: port, PublicIP: pub, Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	if _, err = pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatal(err)
	}
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	done := webrtc.GatheringCompletePromise(pc)
	if err = pc.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	<-done
	var hasPub, hasLocal bool
	for _, line := range strings.Split(pc.LocalDescription().SDP, "\n") {
		if !strings.HasPrefix(line, "a=candidate:") || !strings.Contains(line, "typ host") {
			continue
		}
		f := strings.Fields(line) // a=candidate:<foundation> <comp> <proto> <prio> <ip> <port> typ host
		if len(f) < 6 {
			continue
		}
		if f[4] == pub {
			hasPub = true
		} else if ip := net.ParseIP(f[4]); ip != nil && ip.To4() != nil {
			hasLocal = true
		}
	}
	if !hasPub || !hasLocal {
		t.Fatalf("host 후보 공인=%v 로컬=%v — 둘 다 있어야 함\n%s", hasPub, hasLocal, pc.LocalDescription().SDP)
	}
}

func TestPublicIPInvalidRejected(t *testing.T) {
	if _, err := NewAPI(Config{PublicIP: "not-an-ip"}); err == nil {
		t.Fatal("잘못된 MEDIA_PUBLIC_IP 를 받아들임")
	}
}
