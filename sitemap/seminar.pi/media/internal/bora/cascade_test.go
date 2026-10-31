// M3 보강 표 형식 테스트 — 패널(발행+구독) 참가자 닫힘 연쇄 범위·중복 닫기·늦은 합류자 상태(일시정지/활성)·할당기 뷰
// (PRD_02 3.3 bora, REA_02 5.1). 실행 : go test ./internal/bora
package bora

import (
	"slices"
	"testing"
	"time"

	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// 패널 B 가 producer pb 를 발행하고 A·C 가 구독, B 자신은 pa 를 구독(cb) 중일 때 B 가 떠나면 :
// pb·pb 의 Consumer(ab, cpb)·B 의 Consumer(cb) 는 닫히고, pa·cc 는 그대로. A·C 만 producerClosed(pb) 를 받는다.
func TestCloseChainPanel(t *testing.T) {
	f := newFixture(t)
	var pb *santorini.Producer
	var ab, cpb *jeju.Consumer
	f.r.exec(func() {
		pb = santorini.New("pb", "B", santorini.Video, santorini.Camera)
		f.r.producers["pb"] = pb
		f.r.peers["B"].Producers["pb"] = pb
		ab = jeju.New("ab", pb, nil, 21, false)
		cpb = jeju.New("cpb", pb, nil, 22, false)
		f.r.consumers["pb"] = map[string]*jeju.Consumer{"ab": ab, "cpb": cpb}
		f.r.peers["A"].Consumers["ab"] = ab
		f.r.peers["C"].Consumers["cpb"] = cpb
	})
	f.r.Leave("B")
	for _, st := range []struct {
		name string
		done <-chan struct{}
		want bool
	}{
		{"pb(떠난 패널의 producer)", pb.Done(), true},
		{"ab(남이 pb 구독)", ab.Done(), true},
		{"cpb(남이 pb 구독)", cpb.Done(), true},
		{"cb(패널 자신의 구독)", f.cb.Done(), true},
		{"pa(남의 producer)", f.pa.Done(), false},
		{"cc(남의 구독)", f.cc.Done(), false},
	} {
		if got := closed(st.done); got != st.want {
			t.Errorf("%s 닫힘=%v 기대 %v", st.name, got, st.want)
		}
	}
	f.r.exec(func() {
		for id, want := range map[string]int{"A": 1, "C": 1} {
			if got := f.sess[id].got; len(got) != want || got[0] != signal.NProducerClosed {
				t.Errorf("%s 알림 %v", id, got)
			}
		}
		if f.r.peers["B"] != nil || f.r.producers["pb"] != nil || f.r.consumers["pb"] != nil {
			t.Errorf("B·pb 표 누수")
		}
		if len(f.r.consumers["pa"]) != 1 || f.r.consumers["pa"]["cc"] == nil {
			t.Errorf("pa 구독 표 %v", f.r.consumers["pa"])
		}
		if len(f.r.peers["A"].Consumers) != 0 || len(f.r.peers["C"].Consumers) != 1 {
			t.Errorf("참가자 구독 표 A=%d C=%d", len(f.r.peers["A"].Consumers), len(f.r.peers["C"].Consumers))
		}
	})
}

// 같은 producer 를 두 번 닫으면 두 번째는 NOT_FOUND, 알림은 1번만.
func TestCloseProducerTwice(t *testing.T) {
	f := newFixture(t)
	if e := f.r.CloseProducer("A", "pa"); e != nil {
		t.Fatal(e)
	}
	if e := f.r.CloseProducer("A", "pa"); e == nil || e.Code != signal.CodeNotFound {
		t.Fatalf("두 번째 닫기 %v", e)
	}
	f.r.exec(func() {
		if got := f.sess["B"].got; len(got) != 1 {
			t.Errorf("B 알림 %v", got)
		}
	})
}

// 늦은 합류자 : producer 가 일시정지면 consumerCreated 직후 producerPaused, 활성이면 아무 알림도 없다.
// 할당기 뷰는 패킷이 없는 레이어를 비활성으로 넘긴다(⑥ 비활성 감지 결과 전달).
func TestLateJoinerState(t *testing.T) {
	cases := []struct {
		name   string
		paused bool
		want   []string
	}{
		{"일시정지 중 합류", true, []string{signal.NProducerPaused}},
		{"활성 중 합류", false, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newFixture(t)
			if c.paused {
				if e := f.r.PauseProducer("A", "pa", true); e != nil {
					t.Fatal(e)
				}
			}
			f.r.exec(func() {
				s := &fakeSession{id: "D"}
				d := &Peer{ID: "D", Session: s, Consumers: map[string]*jeju.Consumer{}}
				f.r.peers["D"] = d
				cd := jeju.New("cd", f.pa, nil, 13, false)
				defer cd.Close()
				d.Consumers["cd"] = cd
				f.r.consumers["pa"]["cd"] = cd
				f.r.initConsumer(d, cd)
				if len(s.got) != len(c.want) || (len(c.want) > 0 && s.got[0] != c.want[0]) {
					t.Errorf("D 알림 %v 기대 %v", s.got, c.want)
				}
				v := f.r.view(cd)
				if v.Active != [3]bool{} || v.MaxLayer != santorini.MaxLayers-1 || v.ID != "cd" {
					t.Errorf("할당기 뷰 %+v", v)
				}
			})
		})
	}
}

// 실제 Join 경로(capri 구독 PC 생성 → 기존 producer consume → OfferBatch 뒤 negotiate)에서
// 일시정지된 producer 를 늦게 구독하면 알림 순서가 consumerCreated → producerPaused → transport.subscribe 인지(SIGNAL_API 4절, M3 정정 4번).
func TestJoinPausedProducerNotifyOrder(t *testing.T) {
	f := newFixture(t)
	api, err := capri.NewAPI(capri.Config{Loopback: true})
	if err != nil {
		t.Fatal(err)
	}
	f.r.exec(func() { f.r.api = api })
	if e := f.r.PauseProducer("A", "pa", true); e != nil {
		t.Fatal(e)
	}
	d := &fakeSession{id: "D"}
	f.r.exec(func() { f.sess["D"] = d })
	if _, e := f.r.Join(signal.Ticket{Role: signal.RoleAudience, Sub: "d-user", Cap: 31}, d); e != nil {
		t.Fatal(e)
	}
	var got []string
	for end := time.Now().Add(3 * time.Second); time.Now().Before(end); time.Sleep(10 * time.Millisecond) {
		got = d.msgs() // trickle 은 pion 고루틴이 보내므로 방 고루틴(exec)만으로는 동기화되지 않는다
		if slices.Contains(got, signal.NTransportSubscribe) {
			break
		}
	}
	var seq []string // trickle(서버 ICE 후보)은 순서 검사에서 뺀다 — 수집 시점이 비결정적
	for _, m := range got {
		if m != signal.MTrickle {
			seq = append(seq, m)
		}
	}
	want := []string{signal.NConsumerCreated, signal.NProducerPaused, signal.NTransportSubscribe}
	if !slices.Equal(seq, want) {
		t.Fatalf("알림 순서 %v 기대 %v (원본 %v)", seq, want, got)
	}
}
