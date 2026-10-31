// v1.1 표 형식 단위 테스트 — 재입장 역할 유지·room.end 순서·종료 방 다시 열기, 받는 사람 범위(ntf hand)·raisedTs 서버 시각 순서·반응 300ms 합산·허용 목록·속도 제한·채팅 500자,
// peer.setRole 권한·승격/강등 처리 순서·강등 뒤 발행 금지, peers 가림·입퇴장 묶음(SIGNAL_API 3.3), v1.3 app.send 중계(3.6). 실행 : go test ./internal/bora
package bora

import (
	"encoding/json"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// recSession — 알림 전체를 기록. signal.Session 계약대로 Send 는 여러 고루틴 안전
// (r.api 가 있으면 pion ICE 콜백이 ntf trickle 을 방 고루틴 밖에서 보낸다 — -race 2026-10-31).
type recSession struct {
	mu     sync.Mutex
	id     string
	got    []signal.Notification
	closed signal.ErrCode // Close 로 받은 코드(빈 값 = 안 닫힘)
}

func (s *recSession) ID() string { return s.id }
func (s *recSession) Send(n signal.Notification) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.got = append(s.got, n)
}
func (s *recSession) Close(c signal.ErrCode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = c
}

// v11Room — P(presenter)·N(panel)·A1·A2(audience). N 은 producer pn 발행, A1 이 pn 구독.
type v11Room struct {
	r    *Room
	sess map[string]*recSession
	pn   *santorini.Producer
	a1pn *jeju.Consumer
}

func newV11(t *testing.T) *v11Room {
	t.Helper()
	v := &v11Room{r: NewRoom("v11", 31, time.Time{}), sess: map[string]*recSession{}}
	roles := map[string]signal.Role{"P": signal.RolePresenter, "N": signal.RolePanel, "A1": signal.RoleAudience, "A2": signal.RoleAudience}
	v.r.exec(func() {
		for id, role := range roles {
			s := &recSession{id: id}
			v.sess[id] = s
			v.r.peers[id] = &Peer{ID: id, Ticket: signal.Ticket{Name: "n-" + id, Role: role}, Role: role, Session: s,
				Producers: map[string]*santorini.Producer{}, Consumers: map[string]*jeju.Consumer{},
				pubMids: map[string]*santorini.Producer{}, pendTracks: map[string][]remoteTrack{}}
		}
		v.pn = santorini.New("pn", "N", santorini.Video, santorini.Camera)
		v.r.producers["pn"] = v.pn
		v.r.peers["N"].Producers["pn"] = v.pn
		v.a1pn = jeju.New("a1pn", v.pn, nil, 31, false)
		v.r.consumers["pn"] = map[string]*jeju.Consumer{"a1pn": v.a1pn}
		v.r.peers["A1"].Consumers["a1pn"] = v.a1pn
	})
	t.Cleanup(v.r.Close)
	return v
}

// take — 각 세션의 기록을 꺼내고 비운다(방 고루틴에서).
func (v *v11Room) take() map[string][]signal.Notification {
	out := map[string][]signal.Notification{}
	v.r.exec(func() {
		for id, s := range v.sess {
			s.mu.Lock()
			out[id], s.got = s.got, nil
			s.mu.Unlock()
		}
	})
	return out
}

func names(ns []signal.Notification) []string {
	out := []string{}
	for _, n := range ns {
		out = append(out, n.M)
	}
	return out
}

func code(e *signal.Error) signal.ErrCode {
	if e == nil {
		return ""
	}
	return e.Code
}

func TestRateLimit(t *testing.T) {
	t0 := time.Unix(100, 0)
	var q rateLimit
	for _, st := range []struct {
		at   time.Duration
		want bool
	}{{0, true}, {100 * time.Millisecond, true}, {900 * time.Millisecond, false}, {1000 * time.Millisecond, true},
		{1050 * time.Millisecond, false}, {1100 * time.Millisecond, true}, {1200 * time.Millisecond, false}} {
		if got := q.allow(t0.Add(st.at)); got != st.want {
			t.Errorf("%v : %v 기대 %v", st.at, got, st.want)
		}
	}
}

// hand.set — audience 만, 받는 사람 = presenter·panel·본인(다른 청중은 못 받음), 재올림은 처음 시각 유지·알림 없음.
func TestHandRecipientsAndOrder(t *testing.T) {
	v := newV11(t)
	for _, id := range []string{"P", "N"} {
		if _, e := v.r.SetHand(id, true); code(e) != signal.CodeRoleForbidden {
			t.Errorf("%s hand.set %v 기대 ROLE_FORBIDDEN", id, e)
		}
	}
	ts1, e := v.r.SetHand("A1", true)
	if e != nil || ts1 == 0 {
		t.Fatalf("A1 올림 %d %v", ts1, e)
	}
	got := v.take()
	for id, want := range map[string]int{"P": 1, "N": 1, "A1": 1, "A2": 0} {
		if len(got[id]) != want {
			t.Errorf("%s ntf hand %v 기대 %d건", id, names(got[id]), want)
		} else if want == 1 && got[id][0].D != (signal.HandNtf{PeerID: "A1", RaisedTs: ts1}) {
			t.Errorf("%s ntf hand 데이터 %+v", id, got[id][0].D)
		}
	}
	if again, _ := v.r.SetHand("A1", true); again != ts1 || len(v.take()["P"]) != 0 {
		t.Errorf("재올림 시각 %d 기대 %d·알림 없음", again, ts1)
	}
	time.Sleep(3 * time.Millisecond)
	ts2, _ := v.r.SetHand("A2", true)
	if ts2 <= ts1 {
		t.Errorf("서버 시각 순서 A1 %d → A2 %d", ts1, ts2)
	}
	if n := v.take()["A1"]; len(n) != 0 {
		t.Errorf("청중 A1 이 남의 손 알림을 받음 %v", n)
	}
	// peers 가림 : 청중에게 남의 raisedTs 는 0, 본인 것과 발표자 시야는 그대로
	v.r.exec(func() {
		for _, st := range []struct {
			viewer string
			want   map[string]int64
		}{
			{"A1", map[string]int64{"A1": ts1, "A2": 0}},
			{"P", map[string]int64{"A1": ts1, "A2": ts2}},
		} {
			for _, info := range v.r.peerInfos(v.r.peers[st.viewer]) {
				if w, ok := st.want[info.PeerID]; ok && info.RaisedTs != w {
					t.Errorf("%s 가 본 %s raisedTs %d 기대 %d", st.viewer, info.PeerID, info.RaisedTs, w)
				}
			}
		}
	})
	if ts, _ := v.r.SetHand("A1", false); ts != 0 {
		t.Errorf("내림 응답 %d", ts)
	}
	if n := v.take()["P"]; len(n) != 1 || n[0].D != (signal.HandNtf{PeerID: "A1"}) {
		t.Errorf("내림 알림 %+v", n)
	}
}

func TestLowerAll(t *testing.T) {
	v := newV11(t)
	v.r.SetHand("A1", true)
	v.r.SetHand("A2", true)
	v.take()
	for _, id := range []string{"N", "A1"} {
		if e := v.r.LowerAllHands(id); code(e) != signal.CodeRoleForbidden {
			t.Errorf("%s lowerAll %v", id, e)
		}
	}
	if e := v.r.LowerAllHands("P"); e != nil {
		t.Fatal(e)
	}
	got := v.take()
	if len(got["P"]) != 2 || len(got["A1"]) != 1 || len(got["A2"]) != 1 {
		t.Errorf("lowerAll 알림 P=%d A1=%d A2=%d", len(got["P"]), len(got["A1"]), len(got["A2"]))
	}
	v.r.exec(func() {
		if v.r.peers["A1"].raisedTs != 0 || v.r.peers["A2"].raisedTs != 0 {
			t.Errorf("손이 남아 있음")
		}
	})
}

func TestReaction(t *testing.T) {
	v := newV11(t)
	for _, st := range []struct {
		name   string
		emojis []string
		want   signal.ErrCode
	}{
		{"0개", nil, signal.CodeSDPInvalid},
		{"4개", []string{"👍", "👍", "👍", "👍"}, signal.CodeSDPInvalid},
		{"허용 밖", []string{"🔥"}, signal.CodeSDPInvalid},
		{"섞임", []string{"👍", "x"}, signal.CodeSDPInvalid},
		{"중복 4개", []string{"😀", "😀", "😀", "😀"}, signal.CodeSDPInvalid}, // 개수 제한은 중복 제거 전 배열 길이
	} {
		if e := v.r.React("A1", st.emojis); code(e) != st.want {
			t.Errorf("%s : %v 기대 %s", st.name, e, st.want)
		}
	}
	if len(v.take()["P"]) != 0 {
		t.Fatal("잘못된 반응이 방송됨")
	}
	// 300ms 창 안의 반응 = 합산 1회, 보낸 사람 포함 전원·익명
	for _, st := range []struct {
		peer   string
		emojis []string
		want   signal.ErrCode
	}{
		{"A1", []string{"👍", "👏"}, ""},
		{"A1", []string{"👍"}, ""},
		{"A1", []string{"💖"}, signal.CodeRateLimited}, // 1초 안 3번째 — 합산 안 함
		{"A2", []string{"👍", "👍", "😮"}, ""},           // 한 요청 안의 중복 👍 는 1개로 센다
	} {
		if e := v.r.React(st.peer, st.emojis); code(e) != st.want {
			t.Errorf("%s %v : %v 기대 %q", st.peer, st.emojis, e, st.want)
		}
	}
	time.Sleep(ReactionWindow + 150*time.Millisecond)
	want := map[string]int{"👍": 3, "👏": 1, "😮": 1}
	for id, ns := range v.take() {
		if len(ns) != 1 || ns[0].M != signal.NReaction {
			t.Errorf("%s 반응 알림 %v", id, names(ns))
			continue
		}
		if d := ns[0].D.(signal.ReactionNtf); !reflect.DeepEqual(d.Counts, want) || d.Ts == 0 {
			t.Errorf("%s 합산 %+v 기대 %v", id, d, want)
		}
	}
	// 창이 닫힌 뒤 새 반응은 새 창
	time.Sleep(time.Second)
	v.r.React("A1", []string{"😀"})
	time.Sleep(ReactionWindow + 150*time.Millisecond)
	if ns := v.take()["P"]; len(ns) != 1 || !reflect.DeepEqual(ns[0].D.(signal.ReactionNtf).Counts, map[string]int{"😀": 1}) {
		t.Errorf("두 번째 창 %+v", ns)
	}
}

func TestChat(t *testing.T) {
	v := newV11(t)
	for _, st := range []struct {
		name string
		text string
		want signal.ErrCode
	}{
		{"빈 값", "", signal.CodeSDPInvalid},
		{"공백만", "  \n ", signal.CodeSDPInvalid},
		{"501자", strings.Repeat("가", 501), signal.CodeSDPInvalid},
		{"500자(멀티바이트)", "  " + strings.Repeat("가", 500) + " ", ""},
		{"1자", "a", ""},
		{"1초 안 3번째", "b", signal.CodeRateLimited},
	} {
		if _, e := v.r.Chat("A1", st.text); code(e) != st.want {
			t.Errorf("%s : %v 기대 %q", st.name, e, st.want)
		}
	}
	got := v.take()
	if len(got["A1"]) != 0 {
		t.Errorf("보낸 사람이 자기 채팅 알림을 받음")
	}
	for _, id := range []string{"P", "N", "A2"} {
		if len(got[id]) != 2 {
			t.Fatalf("%s 채팅 %d건 기대 2", id, len(got[id]))
		}
		if d := got[id][0].D.(signal.ChatNtf); d.Text != strings.Repeat("가", 500) || d.Name != "n-A1" || d.PeerID != "A1" || d.Ts == 0 {
			t.Errorf("%s 채팅 데이터 이름 %q 글자 %d", id, d.Name, len([]rune(d.Text)))
		}
	}
}

// app.send(v1.3) — 주제 허용표·역할·d 4KB·피어당 초당 2건(caption·refresh 합산, state 따로 v1.3.2)·잘못된 요청은 한도 미사용·잠금 무관,
// 받는 사람 = 보낸 본인 외 전원, d 는 받은 그대로·from 은 서버가 채움, JSON 모양.
func TestAppSend(t *testing.T) {
	v := newV11(t)
	v.r.exec(func() { v.r.locks = signal.Locks{Audio: true, Video: true} })       // 잠금 중에도 중계는 된다
	big := json.RawMessage(`"` + strings.Repeat("a", signal.AppMaxBytes-2) + `"`) // 정확히 4096바이트
	for _, st := range []struct {
		name, from, topic string
		d                 json.RawMessage
		want              signal.ErrCode
	}{
		{"표에 없는 주제", "P", "chat", nil, signal.CodeNotFound},
		{"빈 주제", "P", "", nil, signal.CodeNotFound},
		{"청중 caption", "A1", "caption", nil, signal.CodeRoleForbidden},
		{"청중 state", "A1", "state", nil, signal.CodeRoleForbidden},
		{"패널 state", "N", "state", nil, signal.CodeRoleForbidden},
		{"4097바이트", "P", "caption", append(big[:len(big):len(big)], ' '), signal.CodeSDPInvalid},
		{"없는 참가자", "X", "refresh", nil, signal.CodeNotFound},
		{"발표자 caption 4096바이트", "P", "caption", big, ""},
		{"발표자 state", "P", "state", json.RawMessage(`{"recording":true}`), ""},
		{"발표자 refresh(state 는 한도 따로)", "P", "refresh", nil, ""},
		{"발표자 1초 안 3번째(caption·refresh 합산)", "P", "caption", nil, signal.CodeRateLimited},
		{"패널 caption", "N", "caption", json.RawMessage(`{"text":"안녕"}`), ""},
		{"청중 refresh(앞의 거절은 한도 미사용)", "A1", "refresh", nil, ""},
		{"청중 refresh 2번째", "A1", "refresh", json.RawMessage(`{"kind":"poll"}`), ""},
		{"청중 1초 안 3번째", "A1", "refresh", nil, signal.CodeRateLimited},
	} {
		if e := v.r.AppSend(st.from, st.topic, st.d); code(e) != st.want {
			t.Errorf("%s : %v 기대 %q", st.name, e, st.want)
		}
	}
	got := v.take()
	// 성공 6건 : P caption·P state·P refresh·N caption·A1 refresh 2건 — 각자 자기 것은 못 받는다
	want := map[string][]string{
		"P":  {"N/caption", "A1/refresh", "A1/refresh"},
		"N":  {"P/caption", "P/state", "P/refresh", "A1/refresh", "A1/refresh"},
		"A1": {"P/caption", "P/state", "P/refresh", "N/caption"},
		"A2": {"P/caption", "P/state", "P/refresh", "N/caption", "A1/refresh", "A1/refresh"},
	}
	for id, w := range want {
		var seq []string
		for _, n := range got[id] {
			if n.M != signal.NApp {
				t.Fatalf("%s 알림 %s", id, n.M)
			}
			a := n.D.(signal.AppNtf)
			seq = append(seq, a.From+"/"+a.Topic)
		}
		if !reflect.DeepEqual(seq, w) {
			t.Errorf("%s 받은 순서 %v 기대 %v", id, seq, w)
		}
	}
	if a := got["A2"][0].D.(signal.AppNtf); string(a.D) != string(big) {
		t.Errorf("d 가 바뀜 : %d바이트", len(a.D))
	}
	for _, st := range []struct {
		n    signal.AppNtf
		want string
	}{
		{got["A2"][1].D.(signal.AppNtf), `{"topic":"state","d":{"recording":true},"from":"P"}`},
		{got["A2"][2].D.(signal.AppNtf), `{"topic":"refresh","d":null,"from":"P"}`}, // d 생략 = null
	} {
		if b, _ := json.Marshal(st.n); string(b) != st.want {
			t.Errorf("JSON %s 기대 %s", b, st.want)
		}
	}
}

// app.send 'state' 한도 분리(v1.3.2) — 자막을 초당 한도까지 보내도 녹화·AI 기록 고지(M-4)는 나가고,
// state 자체도 초당 2건 한도를 지키며, state 가 한도에 걸려도 자막은 막히지 않는다.
func TestAppSendStateBudget(t *testing.T) {
	v := newV11(t)
	cp := json.RawMessage(`{"text":"안녕"}`)
	st := json.RawMessage(`{"recording":true}`)
	for _, c := range []struct {
		name, topic string
		d           json.RawMessage
		want        signal.ErrCode
	}{
		{"자막 1", "caption", cp, ""},
		{"자막 2", "caption", cp, ""},
		{"자막 3 — 합산 한도", "caption", cp, signal.CodeRateLimited},
		{"고지 1 — 자막 한도와 무관", "state", st, ""},
		{"고지 2", "state", st, ""},
		{"고지 3 — state 한도", "state", st, signal.CodeRateLimited},
		{"refresh — 여전히 합산 한도", "refresh", nil, signal.CodeRateLimited},
	} {
		if e := v.r.AppSend("P", c.topic, c.d); code(e) != c.want {
			t.Errorf("%s : %v 기대 %q", c.name, e, c.want)
		}
	}
}

func TestSetRoleErrors(t *testing.T) {
	v := newV11(t)
	for _, st := range []struct {
		name, by, target string
		role             signal.Role
		want             signal.ErrCode
	}{
		{"패널이 요청", "N", "A1", signal.RolePanel, signal.CodeRoleForbidden},
		{"청중이 요청", "A1", "A1", signal.RolePanel, signal.CodeRoleForbidden},
		{"대상이 발표자(본인)", "P", "P", signal.RoleAudience, signal.CodeRoleForbidden},
		{"role 이 presenter", "P", "A1", signal.RolePresenter, signal.CodeSDPInvalid},
		{"role 이 빈 값", "P", "A1", "", signal.CodeSDPInvalid},
		{"대상 없음", "P", "Z", signal.RolePanel, signal.CodeNotFound},
		{"같은 역할", "P", "A1", signal.RoleAudience, ""},
	} {
		if e := v.r.SetRole(st.by, st.target, st.role); code(e) != st.want {
			t.Errorf("%s : %v 기대 %q", st.name, e, st.want)
		}
	}
	if got := v.take(); len(got["P"])+len(got["A1"])+len(got["A2"])+len(got["N"]) != 0 {
		t.Errorf("실패·무변경 요청이 알림을 보냄 %v", got)
	}
}

// 승격 : 손 내림(ntf hand 0) → roleChanged(전원) → 승격된 사람에게 올라간 손마다 ntf hand. 이후 발행 권한 검사 통과.
func TestPromote(t *testing.T) {
	v := newV11(t)
	ts1, _ := v.r.SetHand("A1", true)
	ts2, _ := v.r.SetHand("A2", true)
	v.take()
	if e := v.r.SetRole("P", "A1", signal.RolePanel); e != nil {
		t.Fatal(e)
	}
	got := v.take()
	if w := []string{signal.NHand, signal.NRoleChanged, signal.NHand}; !reflect.DeepEqual(names(got["A1"]), w) {
		t.Fatalf("A1 순서 %v 기대 %v", names(got["A1"]), w)
	}
	if got["A1"][0].D != (signal.HandNtf{PeerID: "A1"}) || got["A1"][2].D != (signal.HandNtf{PeerID: "A2", RaisedTs: ts2}) {
		t.Errorf("A1 손 알림 %+v / %+v (A1 원래 %d)", got["A1"][0].D, got["A1"][2].D, ts1)
	}
	if got["A1"][1].D != (signal.RoleChanged{PeerID: "A1", Role: signal.RolePanel, By: "P"}) {
		t.Errorf("roleChanged %+v", got["A1"][1].D)
	}
	if w := []string{signal.NRoleChanged}; !reflect.DeepEqual(names(got["A2"]), w) {
		t.Errorf("A2(청중) %v 기대 %v — 남의 손 내림 알림이 가면 안 됨", names(got["A2"]), w)
	}
	if w := []string{signal.NHand, signal.NRoleChanged}; !reflect.DeepEqual(names(got["P"]), w) {
		t.Errorf("P %v 기대 %v", names(got["P"]), w)
	}
	// 승격된 패널은 이제 손 알림 범위 안, 손들기는 금지
	if _, e := v.r.SetHand("A1", true); code(e) != signal.CodeRoleForbidden {
		t.Errorf("패널 hand.set %v", e)
	}
	v.r.SetHand("A2", false)
	if n := v.take()["A1"]; len(n) != 1 || n[0].M != signal.NHand {
		t.Errorf("승격 뒤 A1 손 알림 %v", names(n))
	}
	// 발행 권한 : 역할 검사는 통과하고 다음 단계(transport.publish 먼저)에서 멈춘다
	if _, e := v.r.produce("A1", "", santorini.Audio, santorini.Mic); code(e) != signal.CodeNotFound {
		t.Errorf("승격 뒤 produce %v 기대 NOT_FOUND(publish 먼저)", e)
	}
}

// 강등 : producer 닫힘 연쇄(producerClosed, 구독 Consumer 닫힘) → roleChanged. 이후 publish·produce ROLE_FORBIDDEN.
func TestDemote(t *testing.T) {
	v := newV11(t)
	if e := v.r.SetRole("P", "N", signal.RoleAudience); e != nil {
		t.Fatal(e)
	}
	if !closed(v.pn.Done()) || !closed(v.a1pn.Done()) {
		t.Errorf("강등된 패널의 producer·구독 Consumer 가 열려 있음")
	}
	got := v.take()
	for _, id := range []string{"P", "A1", "A2"} {
		if w := []string{signal.NProducerClosed, signal.NRoleChanged}; !reflect.DeepEqual(names(got[id]), w) {
			t.Errorf("%s %v 기대 %v", id, names(got[id]), w)
		}
	}
	if w := []string{signal.NRoleChanged}; !reflect.DeepEqual(names(got["N"]), w) {
		t.Errorf("N %v", names(got["N"]))
	}
	if _, e := v.r.publish("N", "v=0"); code(e) != signal.CodeRoleForbidden {
		t.Errorf("강등 뒤 publish %v", e)
	}
	if _, e := v.r.produce("N", "", santorini.Audio, santorini.Mic); code(e) != signal.CodeRoleForbidden {
		t.Errorf("강등 뒤 produce %v", e)
	}
	v.r.exec(func() {
		if len(v.r.producers) != 0 || len(v.r.peers["N"].Producers) != 0 || v.r.consumers["pn"] != nil {
			t.Errorf("표 누수")
		}
	})
}

// 입퇴장 묶음 : 200ms 창에 1회, 받는 사람마다 자기보다 뒤에 들어온 사람만, 입장 먼저·퇴장 나중.
func TestPeerBatch(t *testing.T) {
	v := newV11(t)
	v.r.exec(func() {
		for _, id := range []string{"X", "Y"} {
			s := &recSession{id: id}
			v.sess[id] = s
			p := &Peer{ID: id, Ticket: signal.Ticket{Name: "n-" + id}, Role: signal.RoleAudience, Session: s,
				Producers: map[string]*santorini.Producer{}, Consumers: map[string]*jeju.Consumer{}}
			v.r.peers[id] = p
			v.r.queueJoined(p)
		}
	})
	v.r.Leave("A2")
	if got := v.take(); len(got["P"]) != 0 {
		t.Fatalf("창이 닫히기 전에 보냄 %v", names(got["P"]))
	}
	time.Sleep(PeerBatch + 150*time.Millisecond)
	got := v.take()
	x := signal.PeerInfo{PeerID: "X", Name: "n-X", Role: signal.RoleAudience}
	y := signal.PeerInfo{PeerID: "Y", Name: "n-Y", Role: signal.RoleAudience}
	left := signal.Notification{M: signal.NPeerLeft, D: signal.PeerLeft{PeerIDs: []string{"A2"}}}
	for _, st := range []struct {
		id   string
		want []signal.Notification
	}{
		{"P", []signal.Notification{{M: signal.NPeerJoined, D: signal.PeerJoined{Peers: []signal.PeerInfo{x, y}}}, left}},
		{"X", []signal.Notification{{M: signal.NPeerJoined, D: signal.PeerJoined{Peers: []signal.PeerInfo{y}}}, left}},
		{"Y", []signal.Notification{left}},
		{"A2", nil},
	} {
		if !reflect.DeepEqual(got[st.id], st.want) {
			t.Errorf("%s %+v 기대 %+v", st.id, got[st.id], st.want)
		}
	}
}

// 재입장 역할 : peer.setRole 로 바뀐 역할이 같은 sub 재입장 때 입장권 role 보다 우선, 발표자로는 절대 올라가지 않음, 방이 닫히면 사라진다.
func TestRoleSurvivesRejoin(t *testing.T) {
	api, err := capri.NewAPI(capri.Config{Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	newRoom := func() *Room {
		r := NewRoom("rj", 31, time.Time{})
		r.api = api
		t.Cleanup(r.Close)
		return r
	}
	join := func(r *Room, sub string, role signal.Role) *Peer {
		t.Helper()
		p, e := r.Join(signal.Ticket{Sub: sub, Name: sub, Role: role}, &recSession{id: sub})
		if e != nil {
			t.Fatalf("%s 입장 %v", sub, e)
		}
		return p
	}
	// 표 : 저장된 역할 × 입장권 역할 → 세션 역할
	for _, st := range []struct {
		name         string
		sub          string
		saved        signal.Role // 빈 값 = 저장 없음
		ticket, want signal.Role
	}{
		{"승격 뒤 재입장", "a", signal.RolePanel, signal.RoleAudience, signal.RolePanel},
		{"강등 뒤 재입장", "b", signal.RoleAudience, signal.RolePanel, signal.RoleAudience},
		{"발표자 입장권은 그대로", "c", signal.RoleAudience, signal.RolePresenter, signal.RolePresenter},
		{"저장 없음", "d", "", signal.RoleAudience, signal.RoleAudience},
		{"sub 없음은 저장값 무시", "", signal.RolePanel, signal.RoleAudience, signal.RoleAudience},
	} {
		r := newRoom()
		if st.saved != "" {
			r.exec(func() { r.roles[st.sub] = st.saved })
		}
		if p := join(r, st.sub, st.ticket); p.Role != st.want {
			t.Errorf("%s : %s 기대 %s", st.name, p.Role, st.want)
		}
	}
	// 흐름 : 승격 → 재입장(패널 유지·join 응답 peers 도 panel) → 강등 → 재입장(청중) / 새 방에서는 입장권 role
	r := newRoom()
	pres := join(r, "p", signal.RolePresenter)
	a := join(r, "a", signal.RoleAudience)
	if e := r.SetRole(pres.ID, a.ID, signal.RolePanel); e != nil {
		t.Fatal(e)
	}
	a2, res, e := r.joinState(signal.Ticket{Sub: "a", Name: "a", Role: signal.RoleAudience}, &recSession{id: "a2"})
	if e != nil || a2.Role != signal.RolePanel {
		t.Fatalf("승격 뒤 재입장 역할 %v %v", a2, e)
	}
	for _, info := range res.Peers {
		if info.PeerID == a2.ID && info.Role != signal.RolePanel {
			t.Errorf("join 응답 peers 의 본인 역할 %s", info.Role)
		}
		if info.PeerID == a.ID {
			t.Errorf("이전 세션이 peers 에 남음")
		}
	}
	if e := r.SetRole(pres.ID, a2.ID, signal.RoleAudience); e != nil {
		t.Fatal(e)
	}
	if p := join(r, "a", signal.RolePanel); p.Role != signal.RoleAudience {
		t.Errorf("강등 뒤 패널 입장권으로 재입장 %s 기대 audience", p.Role)
	}
	if p := join(newRoom(), "a", signal.RoleAudience); p.Role != signal.RoleAudience {
		t.Errorf("새 방(이전 방 닫힘)에서 %s", p.Role)
	}
}

// room.end : 권한 검사 → 응답 전 종료 표시(join ROOM_CLOSED), 다른 세션은 아직 열림 → After(서버가 요청자 응답을 큐에 넣은 뒤) → 요청자 외 ROOM_CLOSED.
// 관리 API 로 같은 방 ID 를 다시 열면 종료 표시가 지워진다.
func TestRoomEndOrderAndReopen(t *testing.T) {
	m := NewManager()
	v := newV11(t)
	m.exec(func() {
		m.rooms["v11"] = v.r
		for id := range v.sess {
			m.sessions[id] = sessRef{room: v.r, peer: id}
		}
	})
	for _, id := range []string{"N", "A1"} {
		if _, e := m.Request(v.sess[id], signal.MRoomEnd, nil); code(e) != signal.CodeRoleForbidden {
			t.Errorf("%s room.end %v 기대 ROLE_FORBIDDEN", id, e)
		}
	}
	d, e := m.Request(v.sess["P"], signal.MRoomEnd, nil)
	end, ok := d.(signal.EndSession)
	if e != nil || !ok || end.After == nil || end.Code != signal.CodeRoomClosed {
		t.Fatalf("room.end 응답 %+v %v", d, e)
	}
	if r, ended := m.room(signal.Ticket{Room: "v11"}); r != nil || !ended {
		t.Errorf("응답 전 종료 표시 없음 (방 %v)", r)
	}
	if !v.r.exec(func() {
		for id, s := range v.sess {
			if s.closed != "" {
				t.Errorf("응답 전에 %s 가 닫힘", id)
			}
		}
	}) {
		t.Fatal("응답 전에 방이 닫힘")
	}
	end.After()
	for id, want := range map[string]signal.ErrCode{"P": "", "N": signal.CodeRoomClosed, "A1": signal.CodeRoomClosed, "A2": signal.CodeRoomClosed} {
		if got := v.sess[id].closed; got != want {
			t.Errorf("After 뒤 %s 닫힘 %q 기대 %q", id, got, want)
		}
	}
	if !isDone(v.r.Done()) {
		t.Error("방 고루틴이 남음")
	}
	if !m.OpenRoom("v11", 5, time.Time{}) {
		t.Fatal("종료된 방 ID 다시 열기 실패")
	}
	if r, ended := m.room(signal.Ticket{Room: "v11"}); r == nil || ended {
		t.Errorf("다시 연 방 join 불가 (종료 표시 %v)", ended)
	}
}
