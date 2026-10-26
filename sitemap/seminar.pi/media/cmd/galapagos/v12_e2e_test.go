// v1.2 통합 테스트 — 실제 /signal 에 봇(발표자 P·패널 N·청중 A·늦은 입장 L)을 붙여 SIGNAL_API 3.5 를 끝에서 끝까지 확인 :
// N 이 RTP 오디오 레벨 확장(RFC 6464)을 실어 말하면 ntf activeSpeaker, peer.mute → mutedBy·producerPaused·발언자 해제,
// room.muteAll 잠금 → resume·produce·askUnmute LOCKED, 해제 뒤 재개·askUnmute, room.setLayout → ntf layout·입장 응답 layout·policy.
// 실행 : go test ./cmd/galapagos -run V12 (네트워크 = 로컬 루프백만)
package main

import (
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/rtpx"
	"seminar.pi/media/internal/signal"
)

// audioBotAPI — Opus + ssrc-audio-level(브라우저와 같은 확장 협상), 빈 인터셉터(S-1).
func audioBotAPI(t *testing.T) *webrtc.API {
	m := &webrtc.MediaEngine{}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{RTPCodecCapability: capri.CodecOpus, PayloadType: 111}, webrtc.RTPCodecTypeAudio); err != nil {
		t.Fatal(err)
	}
	if err := m.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: rtpx.AudioLevelURI}, webrtc.RTPCodecTypeAudio); err != nil {
		t.Fatal(err)
	}
	se := webrtc.SettingEngine{}
	se.SetIncludeLoopbackCandidate(true)
	se.SetNetworkTypes([]webrtc.NetworkType{webrtc.NetworkTypeUDP4})
	return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithSettingEngine(se), webrtc.WithInterceptorRegistry(&interceptor.Registry{}))
}

// speakingPanel — 패널 봇 N : 마이크 발행 후 20ms 마다 레벨 lvl(-dBov)을 실은 Opus 모양 패킷.
func speakingPanel(t *testing.T, url string, lvl *atomic.Int32) (*bot, signal.JoinRes, string) {
	pc, err := audioBotAPI(t).NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pc.Close() })
	track, _ := webrtc.NewTrackLocalStaticRTP(capri.CodecOpus, "audio", "n")
	tr, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly})
	if err != nil {
		t.Fatal(err)
	}
	b := &bot{}
	b.client = dial(t, url, func(e signal.Envelope) {
		if e.M == signal.MTrickle {
			addCandidate(pc, e.D)
		}
		b.mu.Lock()
		b.got = append(b.got, e)
		b.mu.Unlock()
	})
	t.Cleanup(func() { _ = b.ws.Close() })
	pc.OnICECandidate(trickleOut(b.client, "pub"))
	var jr signal.JoinRes
	b.request(signal.MJoin, map[string]any{"room": "v12", "role": "panel", "name": "N", "sub": "N"}, &jr)
	offer, _ := pc.CreateOffer(nil)
	_ = pc.SetLocalDescription(offer)
	var ans signal.SDP
	b.request(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}, &ans)
	if !strings.Contains(ans.SDP, rtpx.AudioLevelURI) {
		t.Fatalf("엔진 answer 에 ssrc-audio-level 없음")
	}
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: ans.SDP}); err != nil {
		t.Fatal(err)
	}
	var pr signal.ProduceRes
	b.request(signal.MProduce, signal.ProduceReq{Mid: tr.Mid(), Kind: "audio", Source: "mic"}, &pr)
	var id uint8
	for _, h := range tr.Sender().GetParameters().HeaderExtensions {
		if h.URI == rtpx.AudioLevelURI {
			id = uint8(h.ID)
		}
	}
	if id == 0 {
		t.Fatal("봇 sender 에 오디오 레벨 확장 ID 없음")
	}
	stop := make(chan struct{})
	t.Cleanup(func() { close(stop) })
	go func() {
		tk := time.NewTicker(20 * time.Millisecond)
		defer tk.Stop()
		for seq, ts := uint16(1), uint32(0); ; seq, ts = seq+1, ts+960 {
			select {
			case <-stop:
				return
			case <-tk.C:
			}
			p := &rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: seq, Timestamp: ts}, Payload: []byte{0xfc, 0xff, 0xfe}}
			_ = p.SetExtension(id, []byte{0x80 | byte(lvl.Load())})
			_ = track.WriteRTP(p)
		}
	}()
	return b, jr, pr.ProducerID
}

// countHas — m 알림 중 sub 를 담은 것의 수.
func (b *bot) countHas(m, sub string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, e := range b.got {
		if e.M == m && strings.Contains(string(e.D), sub) {
			n++
		}
	}
	return n
}

// waitN — m 알림(sub 포함)이 n 건 이상 될 때까지(최대 4초 — 발언자 해제는 침묵 1.5초 + 간격 500ms).
func (b *bot) waitN(t *testing.T, m, sub string, n int) {
	t.Helper()
	for end := time.Now().Add(4 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
		if b.countHas(m, sub) >= n {
			return
		}
	}
	t.Fatalf("알림 %s(%s) %d건 미만 : %d", m, sub, n, b.countHas(m, sub))
}

func TestV12Moderation(t *testing.T) {
	url := startEngine(t)
	p, _ := joinBot(t, url, "v12", "P", signal.RolePresenter)
	a, _ := joinBot(t, url, "v12", "A", signal.RoleAudience)
	var lvl atomic.Int32
	lvl.Store(20) // -20 dBov = 말하는 중
	n, nj, mic := speakingPanel(t, url, &lvl)
	speakerN := `"peerId":"` + nj.PeerID + `"`

	// G — 엔진이 오디오 레벨 확장을 읽어 방 전원에게 발언자
	a.waitN(t, signal.NActiveSpeaker, speakerN, 1)
	p.waitN(t, signal.NActiveSpeaker, speakerN, 1)

	// E — 권한 : 청중·패널 요청은 ROLE_FORBIDDEN, 잘못된 kind 는 SDP_INVALID
	for _, st := range []struct {
		b    *bot
		m    string
		d    any
		want signal.ErrCode
	}{
		{a, signal.MPeerMute, signal.MuteReq{PeerID: nj.PeerID, Kind: "audio"}, signal.CodeRoleForbidden},
		{n, signal.MRoomMuteAll, signal.MuteAllReq{Kind: "audio", Lock: true}, signal.CodeRoleForbidden},
		{p, signal.MPeerMute, signal.MuteReq{PeerID: nj.PeerID, Kind: "x"}, signal.CodeSDPInvalid},
		{a, signal.MRoomSetLayout, signal.Layout{Mode: "auto"}, signal.CodeRoleForbidden},
	} {
		if e := st.b.try(st.m, st.d); errCode(e) != st.want {
			t.Errorf("%s : %+v 기대 %q", st.m, e.E, st.want)
		}
	}

	// E — peer.mute : 대상은 mutedBy(내 producer 목록), 나머지는 producerPaused, 꺼진 마이크는 발언자에서 빠져 null
	p.request(signal.MPeerMute, signal.MuteReq{PeerID: nj.PeerID, Kind: "audio"}, nil)
	n.wait(t, signal.NMutedBy, has(mic))
	a.wait(t, signal.NProducerPaused, has(mic))
	a.waitN(t, signal.NActiveSpeaker, `"peerId":null`, 1)

	// E — 잠금 : roomPolicy 전원, 잠금 중 재개·새 발행·askUnmute 는 LOCKED(연결 유지)
	p.request(signal.MRoomMuteAll, signal.MuteAllReq{Kind: "audio", Lock: true}, nil)
	a.wait(t, signal.NRoomPolicy, has(`"audio":true`))
	n.wait(t, signal.NRoomPolicy, has(`"audio":true`))
	for _, st := range []struct {
		b *bot
		m string
		d any
	}{
		{n, signal.MProducerResume, signal.ProducerRef{ProducerID: mic}},
		{n, signal.MProduce, signal.ProduceReq{Mid: "9", Kind: "audio", Source: "mic"}},
		{p, signal.MPeerAskUnmute, signal.MuteReq{PeerID: nj.PeerID, Kind: "audio"}},
	} {
		if e := st.b.try(st.m, st.d); errCode(e) != signal.CodeLocked {
			t.Errorf("잠금 중 %s : %+v 기대 LOCKED", st.m, e.E)
		}
	}

	// 해제 → 재개 가능(producerResumed), askUnmute 는 대상에게만, 다시 말하면 발언자
	p.request(signal.MRoomMuteAll, signal.MuteAllReq{Kind: "audio", Lock: false}, nil)
	n.wait(t, signal.NRoomPolicy, has(`"audio":false`))
	p.request(signal.MPeerAskUnmute, signal.MuteReq{PeerID: nj.PeerID, Kind: "audio"}, nil)
	n.wait(t, signal.NAskUnmute, has(`"kind":"audio"`))
	if a.count(signal.NAskUnmute) != 0 {
		t.Error("청중이 askUnmute 를 받음")
	}
	n.request(signal.MProducerResume, signal.ProducerRef{ProducerID: mic}, nil)
	a.wait(t, signal.NProducerResumed, has(mic))
	a.waitN(t, signal.NActiveSpeaker, speakerN, 2)

	// F — 레이아웃 : 전원 ntf layout, 늦은 입장자는 응답에 layout·policy(영상 잠금)·현재 발언자
	spot := signal.Layout{Mode: "spotlight", Spotlight: "cam:" + nj.PeerID, Follow: true}
	p.request(signal.MRoomSetLayout, spot, nil)
	a.wait(t, signal.NLayout, has(`"follow":true`))
	p.request(signal.MRoomMuteAll, signal.MuteAllReq{Kind: "video", Lock: true}, nil)
	l, lj := joinBot(t, url, "v12", "L", signal.RoleAudience)
	if lj.Layout == nil || *lj.Layout != spot || lj.Policy != (signal.RoomPolicy{Locked: signal.Locks{Video: true}}) {
		b, _ := json.Marshal(lj)
		t.Errorf("늦은 입장 응답 %s", b)
	}
	l.waitN(t, signal.NActiveSpeaker, speakerN, 1)
}
