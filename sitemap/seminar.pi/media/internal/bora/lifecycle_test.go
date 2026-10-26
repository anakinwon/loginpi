// M3 표 형식 단위 테스트 — 닫힘 연쇄 순서(가짜 세션으로 알림 시점의 Producer·Consumer 닫힘 확인)·누수·늦은 합류자·소유 검사(실행 : go test ./internal/bora)
package bora

import (
	"testing"
	"time"

	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// fakeSession — 알림을 기록하고, 받는 순간 check 를 실행해 순서를 검증한다.
type fakeSession struct {
	id    string
	got   []string
	check func(n signal.Notification)
}

func (f *fakeSession) ID() string { return f.id }
func (f *fakeSession) Send(n signal.Notification) {
	f.got = append(f.got, n.M)
	if f.check != nil {
		f.check(n)
	}
}
func (f *fakeSession) Close(signal.ErrCode) {}

func closed(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

// fixture — 발표자 A(producer pa) · 청중 B·C(각각 pa 를 구독). 방 고루틴 안에서 표를 채운다.
type fixture struct {
	r      *Room
	sess   map[string]*fakeSession
	pa     *santorini.Producer
	cb, cc *jeju.Consumer
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{r: NewRoom("room", 31, time.Time{}), sess: map[string]*fakeSession{}}
	f.r.exec(func() {
		for _, id := range []string{"A", "B", "C"} {
			s := &fakeSession{id: id}
			f.sess[id] = s
			f.r.peers[id] = &Peer{ID: id, Session: s, Producers: map[string]*santorini.Producer{}, Consumers: map[string]*jeju.Consumer{}}
		}
		f.pa = santorini.New("pa", "A", santorini.Video, santorini.Camera)
		f.r.producers["pa"] = f.pa
		f.r.peers["A"].Producers["pa"] = f.pa
		f.cb = jeju.New("cb", f.pa, nil, 11, false)
		f.cc = jeju.New("cc", f.pa, nil, 12, false)
		f.r.consumers["pa"] = map[string]*jeju.Consumer{"cb": f.cb, "cc": f.cc}
		f.r.peers["B"].Consumers["cb"] = f.cb
		f.r.peers["C"].Consumers["cc"] = f.cc
	})
	t.Cleanup(f.r.Close)
	return f
}

// 알림 시점에 Producer·연결 Consumer 가 이미 닫혀 있어야 한다(누수 없는 순서).
func (f *fixture) expectClosedOnNotify(t *testing.T) {
	for _, s := range f.sess {
		s.check = func(n signal.Notification) {
			if n.M != signal.NProducerClosed {
				return
			}
			if !closed(f.pa.Done()) || !closed(f.cb.Done()) || !closed(f.cc.Done()) {
				t.Errorf("producerClosed 알림 시점에 닫히지 않은 객체 있음")
			}
		}
	}
}

func TestCloseChain(t *testing.T) {
	cases := []struct {
		name   string
		act    func(f *fixture) *signal.Error
		gone   []string // 사라져야 할 peer
		ntfTo  map[string][]string
		errNil bool
	}{
		{"Producer 닫힘 → Consumer 전부 + producerClosed", func(f *fixture) *signal.Error {
			return f.r.CloseProducer("A", "pa")
		}, nil, map[string][]string{"A": nil, "B": {signal.NProducerClosed}, "C": {signal.NProducerClosed}}, true},
		{"Transport(참가자) 닫힘 → 소속 Producer → 남의 Consumer", func(f *fixture) *signal.Error {
			f.r.Leave("A")
			return nil
		}, []string{"A"}, map[string][]string{"A": nil, "B": {signal.NProducerClosed}, "C": {signal.NProducerClosed}}, true},
		{"남의 Producer 닫기 거부", func(f *fixture) *signal.Error {
			return f.r.CloseProducer("B", "pa")
		}, nil, map[string][]string{"A": nil, "B": nil, "C": nil}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newFixture(t)
			if c.errNil {
				f.expectClosedOnNotify(t)
			}
			e := c.act(f)
			if (e == nil) != c.errNil {
				t.Fatalf("오류 %v", e)
			}
			f.r.exec(func() {
				for id, want := range c.ntfTo {
					if got := f.sess[id].got; len(got) != len(want) || (len(want) > 0 && got[0] != want[0]) {
						t.Errorf("%s 알림 %v 기대 %v", id, got, want)
					}
				}
				for _, id := range c.gone {
					if f.r.peers[id] != nil {
						t.Errorf("peer %s 남음", id)
					}
				}
				if !c.errNil {
					return
				}
				if len(f.r.producers) != 0 || len(f.r.consumers) != 0 {
					t.Errorf("표 누수 producers=%d consumers=%d", len(f.r.producers), len(f.r.consumers))
				}
				for id, p := range f.r.peers {
					if len(p.Consumers) != 0 || len(p.Producers) != 0 {
						t.Errorf("peer %s 표 누수 %d/%d", id, len(p.Producers), len(p.Consumers))
					}
				}
			})
		})
	}
}

// 청중이 떠나면 그 Consumer 만 닫히고 Producer·다른 청중은 그대로.
func TestLeaveAudience(t *testing.T) {
	f := newFixture(t)
	f.r.Leave("B")
	if !closed(f.cb.Done()) || closed(f.cc.Done()) || closed(f.pa.Done()) {
		t.Fatalf("닫힘 범위 오류 cb=%v cc=%v pa=%v", closed(f.cb.Done()), closed(f.cc.Done()), closed(f.pa.Done()))
	}
	f.r.exec(func() {
		if _, ok := f.r.consumers["pa"]["cb"]; ok || len(f.r.consumers["pa"]) != 1 {
			t.Errorf("consumers 표 %v", f.r.consumers["pa"])
		}
	})
}

// 일시정지 → 늦은 합류자는 producerPaused 를 즉시 받는다. 재개는 알림. producer 목록은 자기 것 제외.
func TestPauseAndLateJoiner(t *testing.T) {
	f := newFixture(t)
	if e := f.r.PauseProducer("B", "pa", true); e == nil || e.Code != signal.CodeNotFound {
		t.Fatalf("남의 producer pause 허용됨: %v", e)
	}
	if e := f.r.PauseProducer("A", "pa", true); e != nil {
		t.Fatal(e)
	}
	_ = f.r.PauseProducer("A", "pa", true) // 중복은 알림 없음
	f.r.exec(func() {
		s := &fakeSession{id: "D"}
		f.sess["D"] = s
		d := &Peer{ID: "D", Session: s, Consumers: map[string]*jeju.Consumer{}}
		f.r.peers["D"] = d
		if infos := f.r.producerInfos("D"); len(infos) != 1 || infos[0].ID != "pa" || infos[0].Kind != "video" {
			t.Errorf("producerInfos %v", infos)
		}
		if infos := f.r.producerInfos("A"); len(infos) != 0 {
			t.Errorf("자기 producer 포함 %v", infos)
		}
		cd := jeju.New("cd", f.pa, nil, 13, true)
		d.Consumers["cd"] = cd
		f.r.consumers["pa"]["cd"] = cd
		f.r.initConsumer(d, cd)
	})
	if e := f.r.ResumeConsumer("D", "nope"); e == nil || e.Code != signal.CodeNotFound {
		t.Fatalf("없는 consumer resume: %v", e)
	}
	if e := f.r.PauseProducer("A", "pa", false); e != nil {
		t.Fatal(e)
	}
	f.r.exec(func() {
		want := map[string][]string{
			"A": nil,
			"B": {signal.NProducerPaused, signal.NProducerResumed},
			"D": {signal.NProducerPaused, signal.NProducerResumed},
		}
		for id, w := range want {
			got := f.sess[id].got
			if len(got) != len(w) {
				t.Errorf("%s 알림 %v 기대 %v", id, got, w)
				continue
			}
			for i := range w {
				if got[i] != w[i] {
					t.Errorf("%s 알림 %v 기대 %v", id, got, w)
				}
			}
		}
		if f.r.producerPaused("pa") {
			t.Errorf("재개 후에도 일시정지 표시")
		}
	})
}

// 닫힌 방은 ROOM_CLOSED.
func TestRoomClosed(t *testing.T) {
	r := NewRoom("x", 1, time.Time{})
	r.Close()
	if e := r.CloseProducer("A", "p"); e == nil || e.Code != signal.CodeRoomClosed {
		t.Fatalf("%v", e)
	}
}

// setLayer 상한 → 할당기 뷰·Dynacast(하향 5초)·REMB 상한·ntf publishLayers.
func TestSetLayerPublishCaps(t *testing.T) {
	f := newFixture(t)
	if e := f.r.SetLayer("B", "nope", 0); e == nil || e.Code != signal.CodeNotFound {
		t.Fatalf("없는 consumer setLayer: %v", e)
	}
	if e := f.r.SetLayer("B", "cb", 0); e != nil {
		t.Fatal(e)
	}
	if e := f.r.SetLayer("C", "cc", 9); e != nil { // 범위 밖은 최고 레이어로
		t.Fatal(e)
	}
	now := time.Now()
	f.r.exec(func() {
		if v := f.r.view(f.cb); v.MaxLayer != 0 {
			t.Errorf("cb 뷰 상한 %d", v.MaxLayer)
		}
		if v := f.r.view(f.cc); v.MaxLayer != 2 {
			t.Errorf("cc 뷰 상한 %d", v.MaxLayer)
		}
		f.r.publishCaps(now)
		if got := f.pa.REMBCap(); got != 3_700_000 {
			t.Errorf("REMB 상한 %d", got)
		}
		f.r.maxLayer["cc"] = 1
		f.r.publishCaps(now.Add(time.Second)) // 하향 대기 시작
		f.r.publishCaps(now.Add(7 * time.Second))
		if got := f.pa.REMBCap(); got != 1_200_000 {
			t.Errorf("하향 후 REMB 상한 %d", got)
		}
		if got := f.sess["A"].got; len(got) != 1 || got[0] != signal.NPublishLayers {
			t.Errorf("발행자 알림 %v", got)
		}
	})
}

// 자동 생성 방은 비면 정리, 관리 API 로 연 방은 남고(종료 시각 지나면 정리), 자동 방은 OpenRoom 이 넘겨받는다.
func TestReapRooms(t *testing.T) {
	m := NewManager()
	auto, _ := m.room(signal.Ticket{Room: "auto", Cap: 3})
	m.OpenRoom("kept", 5, time.Time{})
	m.OpenRoom("over", 5, time.Now().Add(-time.Second))
	m.room(signal.Ticket{Room: "adopt", Cap: 3})
	if !m.OpenRoom("adopt", 7, time.Time{}) {
		t.Fatal("자동 생성 방을 관리 API 가 넘겨받지 못함")
	}
	if m.OpenRoom("adopt", 7, time.Time{}) {
		t.Fatal("관리 API 로 연 방 중복 열기 허용")
	}
	m.reap(nil)
	got := map[string]int{}
	for _, info := range m.Rooms() {
		got[info.ID] = info.Cap
	}
	if _, ok := got["auto"]; ok || got["kept"] != 5 || got["adopt"] != 7 || len(got) != 2 {
		t.Fatalf("정리 결과 %v", got)
	}
	if !isDone(auto.Done()) {
		t.Fatal("정리된 방 고루틴이 남음")
	}
}
