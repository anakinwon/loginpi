// M1 통합 테스트 — 같은 프로세스에서 엔진(/signal) + pion 클라이언트 3개(발표자 1·청중 2)를 루프백으로 붙여 영상 RTP 가 청중 2명에게 도달하는지 확인
// 청중 1은 발행 전에, 청중 2는 발행 뒤에 입장(늦은 합류자 자동 구독). 실행 : go test ./cmd/galapagos (네트워크 = 로컬 루프백만)
package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/bora"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/signal"
)

// client — 시험용 시그널링 클라이언트(요청/응답 짝 + 알림 콜백).
type client struct {
	t       *testing.T
	ws      *signal.WSConn
	mu      sync.Mutex
	nextID  int64
	waiting map[int64]chan signal.Envelope
	onNtf   func(signal.Envelope)
}

func dial(t *testing.T, url string, onNtf func(signal.Envelope)) *client {
	ws, err := signal.DialWS(url, "", signal.MaxMessage)
	if err != nil {
		t.Fatal(err)
	}
	c := &client{t: t, ws: ws, waiting: map[int64]chan signal.Envelope{}, onNtf: onNtf}
	go func() {
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				return
			}
			var e signal.Envelope
			if json.Unmarshal(msg, &e) != nil {
				continue
			}
			switch e.T {
			case signal.TypeRes:
				c.mu.Lock()
				ch := c.waiting[e.ID]
				delete(c.waiting, e.ID)
				c.mu.Unlock()
				if ch != nil {
					ch <- e
				}
			case signal.TypeNtf:
				c.onNtf(e)
			case signal.TypeReq: // 서버 ping
				ok := true
				b, _ := json.Marshal(signal.Envelope{T: signal.TypeRes, ID: e.ID, OK: &ok})
				_ = ws.WriteText(b)
			}
		}
	}()
	return c
}

func (c *client) request(m string, d any, out any) {
	c.t.Helper()
	e := c.try(m, d)
	if e.OK == nil || !*e.OK {
		c.t.Fatalf("%s 실패: %+v", m, e.E)
	}
	if out != nil {
		if err := json.Unmarshal(e.D, out); err != nil {
			c.t.Fatal(err)
		}
	}
}

// try — 요청 1건의 응답 봉투(실패 응답도 그대로). 5초 안에 응답이 없으면 실패.
func (c *client) try(m string, d any) signal.Envelope {
	c.t.Helper()
	b, _ := json.Marshal(d)
	ch := make(chan signal.Envelope, 1)
	c.mu.Lock()
	c.nextID++
	id := c.nextID
	c.waiting[id] = ch
	c.mu.Unlock()
	msg, _ := json.Marshal(signal.Envelope{T: signal.TypeReq, ID: id, M: m, D: b})
	if err := c.ws.WriteText(msg); err != nil {
		c.t.Fatal(err)
	}
	select {
	case e := <-ch:
		return e
	case <-time.After(5 * time.Second):
		c.t.Fatalf("%s 응답 없음", m)
	}
	return signal.Envelope{}
}

func (c *client) notify(m string, d any) {
	b, _ := json.Marshal(d)
	msg, _ := json.Marshal(signal.Envelope{T: signal.TypeNtf, M: m, D: b})
	_ = c.ws.WriteText(msg)
}

func trickleOut(c *client, pc string) func(*webrtc.ICECandidate) {
	return func(x *webrtc.ICECandidate) {
		if x == nil {
			return
		}
		b, _ := json.Marshal(x.ToJSON())
		c.notify(signal.MTrickle, signal.Trickle{PC: pc, Candidate: b})
	}
}

func addCandidate(pc *webrtc.PeerConnection, d json.RawMessage) {
	var tk signal.Trickle
	var ci webrtc.ICECandidateInit
	if json.Unmarshal(d, &tk) == nil && json.Unmarshal(tk.Candidate, &ci) == nil {
		_ = pc.AddICECandidate(ci) // remote SDP 전이면 실패 — 루프백은 다른 후보로 충분
	}
}

// audience — 청중 1명 : 서버 offer 에 answer, 받은 영상 패킷을 got 으로.
// closed 는 ntf producerClosed 를 받으면 신호(M3 닫힘 연쇄 통합 확인).
func audience(t *testing.T, api *webrtc.API, url, name string, got chan<- rtp.Packet, closed chan<- string) *client {
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close() })
	var c *client
	c = dial(t, url, func(e signal.Envelope) {
		switch e.M {
		case signal.NTransportSubscribe:
			var s signal.SDP
			_ = json.Unmarshal(e.D, &s)
			go func() {
				if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: s.SDP}); err != nil {
					t.Errorf("%s offer 적용: %v", name, err)
					return
				}
				ans, _ := pc.CreateAnswer(nil)
				_ = pc.SetLocalDescription(ans)
				c.request(signal.MTransportSubscribeAnswer, signal.SDP{SDP: ans.SDP}, nil)
			}()
		case signal.MTrickle:
			addCandidate(pc, e.D)
		case signal.NProducerClosed:
			closed <- name
		}
	})
	pc.OnICECandidate(trickleOut(c, "sub"))
	pc.OnTrack(func(tr *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		for {
			p, _, err := tr.ReadRTP()
			if err != nil {
				return
			}
			select {
			case got <- *p:
			default:
			}
		}
	})
	c.request(signal.MJoin, map[string]any{"room": "r1", "role": "audience", "name": name, "sub": name}, nil)
	return c
}

func TestPresenterToTwoAudience(t *testing.T) {
	t.Setenv("MEDIA_DEV_TICKET", "1")
	recDir := t.TempDir()
	t.Setenv("MEDIA_RECORD_DIR", recDir) // M5 녹화 배선 확인
	api, err := capri.NewAPI(capri.Config{Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	m := bora.NewManager()
	m.SetAPI(api, nil)
	srv := httptest.NewServer(newMux(m, nil, nil))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/signal"

	got1, got2 := make(chan rtp.Packet, 256), make(chan rtp.Packet, 256)
	closed := make(chan string, 4)
	audience(t, api, url, "a1", got1, closed) // 발행 전 입장

	// 발표자 : 발행 PC offer → answer, produce(mid)
	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	track, err := webrtc.NewTrackLocalStaticRTP(capri.CodecVP8, "video", "presenter")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly}); err != nil {
		t.Fatal(err)
	}
	pres := dial(t, url, func(e signal.Envelope) {
		if e.M == signal.MTrickle {
			addCandidate(pc, e.D)
		}
	})
	pc.OnICECandidate(trickleOut(pres, "pub"))
	var jr signal.JoinRes
	pres.request(signal.MJoin, map[string]any{"room": "r1", "role": "presenter", "name": "p", "sub": "p"}, &jr)
	if jr.Role != signal.RolePresenter || jr.PeerID == "" {
		t.Fatalf("join 응답 %+v", jr)
	}
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		t.Fatal(err)
	}
	var ans signal.SDP
	pres.request(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}, &ans)
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: ans.SDP}); err != nil {
		t.Fatal(err)
	}
	var pr signal.ProduceRes
	pres.request(signal.MProduce, signal.ProduceReq{Mid: pc.GetTransceivers()[0].Mid(), Kind: "video", Source: "camera"}, &pr)

	audience(t, api, url, "a2", got2, closed) // 발행 뒤 입장(늦은 합류자)

	// 발표자 송신 : 20ms 마다 VP8 패킷, 10개마다 키프레임(청중은 첫 키프레임부터 받는다)
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		seq, ts := uint16(65500), uint32(0) // 곧 65535→0 감김
		tk := time.NewTicker(20 * time.Millisecond)
		defer tk.Stop()
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			case <-tk.C:
			}
			pl := []byte{0x10, 0x01, 0xAA, 0xBB}
			if i%10 == 0 {
				pl[1] = 0x00
			}
			_ = track.WriteRTP(&rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: seq, Timestamp: ts, Marker: true}, Payload: pl})
			seq++
			ts += 1800
		}
	}()

	const want = 30
	for name, ch := range map[string]chan rtp.Packet{"청중1": got1, "청중2": got2} {
		var prev uint16
		var ssrc uint32
		for i := 0; i < want; i++ {
			select {
			case p := <-ch:
				if i == 0 && p.Payload[1]&0x01 != 0 {
					t.Errorf("%s 첫 패킷이 키프레임이 아님", name)
				}
				if i > 0 && (p.SequenceNumber != prev+1 || p.SSRC != ssrc) {
					t.Errorf("%s #%d 순번 %d→%d ssrc %x→%x", name, i, prev, p.SequenceNumber, ssrc, p.SSRC)
				}
				prev, ssrc = p.SequenceNumber, p.SSRC
			case <-time.After(15 * time.Second):
				t.Fatalf("%s : %d/%d 패킷만 도착", name, i, want)
			}
		}
	}

	// 통합 : producer.close → 청중 2명 모두 producerClosed(M3 닫힘 연쇄 + 구독 PC RemoveTrack 재협상)
	pres.request(signal.MProducerClose, signal.ProducerRef{ProducerID: pr.ProducerID}, nil)
	for i := 0; i < 2; i++ {
		select {
		case <-closed:
		case <-time.After(5 * time.Second):
			t.Fatalf("producerClosed %d/2 만 도착", i)
		}
	}
	// 통합 : 녹화 파일(IVF 헤더 32바이트 + 프레임)이 producer.close 때 마감됨
	if st, err := os.Stat(filepath.Join(recDir, "r1", pr.ProducerID+".ivf")); err != nil || st.Size() <= 32 {
		t.Errorf("녹화 파일 없음·비어 있음: %v", err)
	}
}
