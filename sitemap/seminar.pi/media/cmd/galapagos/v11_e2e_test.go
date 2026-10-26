// v1.1 통합 테스트 — 실제 /signal 에 봇 3개(발표자 P·청중 A1·A2)를 붙여 SIGNAL_API 3.3 을 끝에서 끝까지 확인 :
// peers·peerJoined/peerLeft, 손들기 받는 사람 범위, 반응 합산, 채팅 제한, 역할 권한, 승격 뒤 발행·강등 뒤 닫힘, room.end 전원 종료.
// 실행 : go test ./cmd/galapagos -run V11 (네트워크 = 로컬 루프백만)
package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/bora"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/signal"
)

// bot — 알림을 모두 쌓아 두고 이름으로 찾는다.
type bot struct {
	*client
	mu  sync.Mutex
	got []signal.Envelope
}

func joinBot(t *testing.T, url, room, name string, role signal.Role) (*bot, signal.JoinRes) {
	b := &bot{}
	b.client = dial(t, url, func(e signal.Envelope) {
		b.mu.Lock()
		b.got = append(b.got, e)
		b.mu.Unlock()
	})
	t.Cleanup(func() { _ = b.ws.Close() })
	var jr signal.JoinRes
	b.request(signal.MJoin, map[string]any{"room": room, "role": role, "name": name, "sub": name}, &jr)
	return b, jr
}

// find — m 알림 중 match 를 만족하는 첫 것(없으면 false).
func (b *bot) find(m string, match func(json.RawMessage) bool) (json.RawMessage, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, e := range b.got {
		if e.M == m && (match == nil || match(e.D)) {
			return e.D, true
		}
	}
	return nil, false
}

func (b *bot) wait(t *testing.T, m string, match func(json.RawMessage) bool) json.RawMessage {
	t.Helper()
	for end := time.Now().Add(3 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
		if d, ok := b.find(m, match); ok {
			return d
		}
	}
	t.Fatalf("알림 %s 없음", m)
	return nil
}

func (b *bot) count(m string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, e := range b.got {
		if e.M == m {
			n++
		}
	}
	return n
}

func errCode(e signal.Envelope) signal.ErrCode {
	if e.E == nil {
		return ""
	}
	return e.E.Code
}

func has(sub string) func(json.RawMessage) bool {
	return func(d json.RawMessage) bool { return strings.Contains(string(d), sub) }
}

func TestV11Interactions(t *testing.T) {
	t.Setenv("MEDIA_DEV_TICKET", "1")
	api, err := capri.NewAPI(capri.Config{Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	m := bora.NewManager()
	m.SetAPI(api, nil)
	srv := httptest.NewServer(newMux(m, nil, nil))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/signal"

	// A — peers(본인 포함)·peerJoined
	p, pj := joinBot(t, url, "v11", "P", signal.RolePresenter)
	a1, a1j := joinBot(t, url, "v11", "A1", signal.RoleAudience)
	a2, a2j := joinBot(t, url, "v11", "A2", signal.RoleAudience)
	if len(a2j.Peers) != 3 || a2j.Peers == nil {
		t.Fatalf("A2 join peers %+v", a2j.Peers)
	}
	p.wait(t, signal.NPeerJoined, has(a2j.PeerID))
	if _, ok := a2.find(signal.NPeerJoined, has(a2j.PeerID)); ok {
		t.Error("본인 입장 알림을 받음")
	}

	// C — 손들기 : 발표자·본인만, 다른 청중은 못 받음. raisedTs 는 서버 시각 순서
	var h1, h2 signal.HandSetRes
	a1.request(signal.MHandSet, signal.HandSetReq{Raised: true}, &h1)
	time.Sleep(5 * time.Millisecond)
	a2.request(signal.MHandSet, signal.HandSetReq{Raised: true}, &h2)
	if h1.RaisedTs == 0 || h2.RaisedTs <= h1.RaisedTs {
		t.Errorf("raisedTs 순서 %d → %d", h1.RaisedTs, h2.RaisedTs)
	}
	p.wait(t, signal.NHand, has(a2j.PeerID))
	a1.wait(t, signal.NHand, has(a1j.PeerID))
	if e := p.try(signal.MHandSet, signal.HandSetReq{Raised: true}); errCode(e) != signal.CodeRoleForbidden {
		t.Errorf("발표자 hand.set %+v", e.E)
	}

	// C — 반응 : 300ms 창 합산·전원(보낸 사람 포함), 허용 목록·최대 3·초당 2건
	for _, st := range []struct {
		b      *bot
		emojis []string
		want   signal.ErrCode
	}{
		{a1, []string{"🔥"}, signal.CodeSDPInvalid},
		{a1, []string{"👍", "👍", "👍", "👍"}, signal.CodeSDPInvalid},
		{a1, []string{"👍", "👏"}, ""},
		{a2, []string{"👍"}, ""},
		{a2, []string{"👍"}, ""},
		{a2, []string{"👍"}, signal.CodeRateLimited},
	} {
		if e := st.b.try(signal.MReactionSend, signal.ReactionSendReq{Emojis: st.emojis}); errCode(e) != st.want {
			t.Errorf("reaction %v : %+v 기대 %q", st.emojis, e.E, st.want)
		}
	}
	for _, b := range []*bot{p, a1, a2} {
		var r signal.ReactionNtf
		_ = json.Unmarshal(b.wait(t, signal.NReaction, nil), &r)
		if r.Counts["👍"] != 3 || r.Counts["👏"] != 1 || len(r.Counts) != 2 {
			t.Errorf("반응 합산 %+v", r.Counts)
		}
	}

	// C — 채팅 : 500자 제한·초당 2건, 보낸 사람 외 전원
	if e := a1.try(signal.MChatSend, signal.ChatSendReq{Text: strings.Repeat("가", 501)}); errCode(e) != signal.CodeSDPInvalid {
		t.Errorf("501자 %+v", e.E)
	}
	var cs signal.ChatSendRes
	a1.request(signal.MChatSend, signal.ChatSendReq{Text: strings.Repeat("가", 500)}, &cs)
	a1.request(signal.MChatSend, signal.ChatSendReq{Text: "둘째"}, nil)
	if e := a1.try(signal.MChatSend, signal.ChatSendReq{Text: "셋째"}); errCode(e) != signal.CodeRateLimited {
		t.Errorf("채팅 속도 제한 %+v", e.E)
	}
	p.wait(t, signal.NChat, has("둘째"))
	a2.wait(t, signal.NChat, has("둘째"))
	if cs.Ts == 0 || a1.count(signal.NChat) != 0 {
		t.Errorf("채팅 ts %d·보낸 사람 알림 %d", cs.Ts, a1.count(signal.NChat))
	}

	// D — 역할 : 청중이 요청하면 ROLE_FORBIDDEN, 발표자가 A1 승격 → A1 발행 가능·A2 는 source 실린 consumerCreated
	if e := a2.try(signal.MPeerSetRole, signal.SetRoleReq{PeerID: a1j.PeerID, Role: signal.RolePanel}); errCode(e) != signal.CodeRoleForbidden {
		t.Errorf("청중 setRole %+v", e.E)
	}
	p.request(signal.MPeerSetRole, signal.SetRoleReq{PeerID: a1j.PeerID, Role: signal.RolePanel}, nil)
	a2.wait(t, signal.NRoleChanged, has(`"role":"panel"`))
	a1.wait(t, signal.NHand, has(a2j.PeerID)) // 승격 뒤 남의 손 목록을 받는다
	if _, ok := a2.find(signal.NHand, has(a1j.PeerID)); ok {
		t.Error("청중 A2 가 A1 손 알림을 받음")
	}

	pc, err := api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatal(err)
	}
	defer pc.Close()
	track, _ := webrtc.NewTrackLocalStaticRTP(capri.CodecOpus, "audio", "a1")
	if _, err := pc.AddTransceiverFromTrack(track, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly}); err != nil {
		t.Fatal(err)
	}
	offer, _ := pc.CreateOffer(nil)
	_ = pc.SetLocalDescription(offer)
	var ans signal.SDP
	a1.request(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}, &ans)
	var pr signal.ProduceRes
	a1.request(signal.MProduce, signal.ProduceReq{Mid: pc.GetTransceivers()[0].Mid(), Kind: "audio", Source: "mic"}, &pr)
	a2.wait(t, signal.NConsumerCreated, has(`"source":"mic"`))

	// 강등 → A1 producer 닫힘(producerClosed)·이후 발행 ROLE_FORBIDDEN
	p.request(signal.MPeerSetRole, signal.SetRoleReq{PeerID: a1j.PeerID, Role: signal.RoleAudience}, nil)
	a2.wait(t, signal.NProducerClosed, has(pr.ProducerID))
	p.wait(t, signal.NRoleChanged, has(`"role":"audience"`))
	if e := a1.try(signal.MProduce, signal.ProduceReq{Mid: "9", Kind: "audio", Source: "mic"}); errCode(e) != signal.CodeRoleForbidden {
		t.Errorf("강등 뒤 produce %+v", e.E)
	}
	if e := a1.try(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}); errCode(e) != signal.CodeRoleForbidden {
		t.Errorf("강등 뒤 publish %+v", e.E)
	}

	// A — peerLeft : A2 가 나가면 남은 사람에게 묶음 알림
	a2.request(signal.MLeave, struct{}{}, nil)
	p.wait(t, signal.NPeerLeft, has(a2j.PeerID))

	// room.end : 청중 요청 ROLE_FORBIDDEN, 발표자 요청은 성공 응답 뒤 전원 ROOM_CLOSED, 이후 같은 방 join 도 ROOM_CLOSED
	if e := a1.try(signal.MRoomEnd, struct{}{}); errCode(e) != signal.CodeRoleForbidden {
		t.Errorf("청중 room.end %+v", e.E)
	}
	p.request(signal.MRoomEnd, struct{}{}, nil)
	for _, b := range []*bot{p, a1} {
		b.wait(t, signal.NError, has(string(signal.CodeRoomClosed)))
	}
	late := dial(t, url, func(signal.Envelope) {})
	if e := late.try(signal.MJoin, map[string]any{"room": "v11", "role": "audience", "name": "L", "sub": "L"}); errCode(e) != signal.CodeRoomClosed {
		t.Errorf("종료된 방 join %+v", e.E)
	}
	if pj.Peers == nil || len(pj.Peers) != 1 {
		t.Errorf("첫 입장 peers(본인만) %+v", pj.Peers)
	}
}
