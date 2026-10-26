// M3 보강 표 형식 테스트 — resume 즉시 키프레임 요청(발표자 방향 PLI 확인)·일시정지 우선·Decision 이름·레이어 비활성 감지 훅·
// SeqRewriter 재전송 멱등·Sync 이전 Drop 무시(PRD_02 3.3 jeju·5.2 consumer.resume, REA_02 5.1·5.6). 실행 : go test ./internal/jeju
package jeju

import (
	"sync"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/santorini"
)

// onceReader — 패킷 1개를 준 뒤 Producer 가 닫힐 때까지 막힌다(레이어 수신 고루틴이 원본 SSRC 를 알게 하려는 용도).
type onceReader struct {
	mu   sync.Mutex
	pkt  []byte
	done <-chan struct{}
}

func (r *onceReader) Read(b []byte) (int, interceptor.Attributes, error) {
	r.mu.Lock()
	p := r.pkt
	r.pkt = nil
	r.mu.Unlock()
	if p != nil {
		return copy(b, p), nil, nil
	}
	<-r.done
	return 0, nil, errClosed
}

// pliCounter — 발표자 방향 RTCP 중 PLI 수(레이어 수신 고루틴이 쓴다).
type pliCounter struct {
	mu sync.Mutex
	n  int
}

func (w *pliCounter) WriteRTCP(ps []rtcp.Packet) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, p := range ps {
		if _, ok := rtcpx.ParsePLI(p); ok {
			w.n++
		}
	}
	return nil
}

func (w *pliCounter) count() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.n
}

// waitPLI — d 안에 PLI 가 want 이상 나가면 true.
func waitPLI(w *pliCounter, want int, d time.Duration) bool {
	end := time.Now().Add(d)
	for time.Now().Before(end) {
		if w.count() >= want {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return w.count() >= want
}

// consumer.resume → 그 레이어 Limiter 로 키프레임 요청 → 발표자에게 PLI(PRD_02 5.2). 일시정지가 아니면 resume 은 아무것도 하지 않는다.
func TestResumeRequestsKeyframe(t *testing.T) {
	cases := []struct {
		name    string
		paused  bool
		wantPLI bool
	}{
		{"일시정지 → resume = 즉시 PLI", true, true},
		{"일시정지 아님 → resume 무동작", false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := santorini.New("p", "peer", santorini.Video, santorini.Camera)
			defer p.Close()
			// 키프레임이 아닌 VP8 조각 — Limiter 가 KeyframeSeen 으로 풀리지 않게
			raw, err := (&rtp.Packet{Header: rtp.Header{Version: 2, SSRC: 4242, SequenceNumber: 1}, Payload: []byte{0x00, 0x01}}).Marshal()
			if err != nil {
				t.Fatal(err)
			}
			up := &pliCounter{}
			p.AddLayer("", &onceReader{pkt: raw, done: p.Done()}, up)
			cons := New("c", p, &capWriter{}, outSSRC, c.paused)
			defer cons.Close()
			if waitPLI(up, 1, 150*time.Millisecond) {
				t.Fatalf("resume 전에 PLI %d건", up.count())
			}
			cons.Resume()
			if got := waitPLI(up, 1, time.Second); got != c.wantPLI {
				t.Fatalf("PLI=%v(%d건), 기대 %v", got, up.count(), c.wantPLI)
			}
		})
	}
}

// 일시정지 중에는 정책 판정과 무관하게 보내지 않고, 순번 공간에도 흔적을 남기지 않는다(Drop 이 와도 메움 기록 없음).
func TestDecidePausedOverridesPolicy(t *testing.T) {
	for _, d := range []Decision{Forward, Drop, SilentDrop, Buffer} {
		c := New("c", santorini.New("p", "peer", santorini.Video, santorini.Camera), nil, 1, true)
		c.policy = &fakePolicy{d: d}
		if c.decide(forward.Item{ExtSeq: 10, Key: true}) {
			t.Errorf("%v : 일시정지 중 송신", d)
		}
		if len(c.seq.dropped) != 0 || c.seq.started {
			t.Errorf("%v : 일시정지 중 순번 기록 started=%v dropped=%v", d, c.seq.started, c.seq.dropped)
		}
		c.Close()
	}
}

func TestDecisionString(t *testing.T) {
	for d, want := range map[Decision]string{Forward: "Forward", Drop: "Drop", SilentDrop: "SilentDrop", Buffer: "Buffer"} {
		if d.String() != want {
			t.Errorf("%d → %q 기대 %q", d, d.String(), want)
		}
	}
}

// 레이어 비활성 감지 훅 : 없는 레이어·패킷이 없는 레이어는 전환 후보가 아니다.
func TestLayerUsable(t *testing.T) {
	p := santorini.New("p", "peer", santorini.Video, santorini.Camera)
	defer p.Close()
	rd := &fakeReader{ch: make(chan []byte, 16)}
	p.AddLayer("l", rd, nopRTCP{})
	c := New("c", p, nil, 1, false)
	defer c.Close()
	check := func(cases []struct {
		layer int8
		want  bool
	}) {
		t.Helper()
		for _, st := range cases {
			if got := c.layerUsable(st.layer); got != st.want {
				t.Errorf("layerUsable(%d)=%v 기대 %v", st.layer, got, st.want)
			}
		}
	}
	check([]struct {
		layer int8
		want  bool
	}{
		{0, false}, // 있지만 패킷 없음 = 비활성
		{1, false}, // 없음
		{2, false}, // 없음
	})

	// 레이어 0 에 실제 수신 경로(Layer.Run → observe)로 20ms 간격 패킷을 넣는다 — 2초(4주기) 연속이면 활성.
	stop := make(chan struct{})
	fed := make(chan struct{})
	go func() {
		defer close(fed)
		for seq := uint16(1); ; seq++ {
			select {
			case <-stop:
				return
			case rd.ch <- vp8Packet(t, seq, uint32(seq)*3000, seq == 1, false):
			}
			time.Sleep(20 * time.Millisecond)
		}
	}()
	end := time.Now().Add(5 * time.Second)
	for !c.layerUsable(0) && time.Now().Before(end) {
		time.Sleep(20 * time.Millisecond)
	}
	close(stop)
	<-fed
	check([]struct {
		layer int8
		want  bool
	}{
		{0, true},  // 2초 이상 연속 수신 + 방금 받음 = 활성
		{1, false}, // 여전히 없음
	})
}

// SeqRewriter 보강 : 재전송(같은 입력 재수신)은 같은 출력 순번, Sync 이전 순번의 Drop 은 무시.
func TestSeqRewriterRetransmitAndStaleDrop(t *testing.T) {
	cases := []struct {
		name  string
		steps []seqStep
	}{
		{"재전송 같은 출력", []seqStep{
			{'I', 10, 1, true},
			{'I', 11, 2, true},
			{'I', 12, 3, true},
			{'I', 11, 2, true}, // NACK 재전송 — 같은 출력 순번(SendMeta 가 이 값으로 찾는다)
			{'I', 13, 4, true},
		}},
		{"Drop 사이 재전송", []seqStep{
			{'I', 20, 1, true},
			{'D', 21, 0, false},
			{'I', 22, 2, true},
			{'I', 20, 1, true},
			{'I', 22, 2, true},
		}},
		{"Sync 뒤 옛 순번 Drop 무시", []seqStep{
			{'I', 100, 1, true},
			{'S', 200, 2, true},
			{'D', 150, 0, false}, // floor 아래 — 기록 안 함
			{'I', 201, 3, true},  // 당겨지지 않음
		}},
	}
	for _, c := range cases {
		var s SeqRewriter
		runSeq(t, c.name, &s, c.steps)
	}
}
