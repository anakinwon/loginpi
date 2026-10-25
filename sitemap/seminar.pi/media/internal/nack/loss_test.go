// LossTracker 표 형식 단위 테스트 — 손실 패턴·순서 뒤바뀜·감김 65535→0·RTT 재요청·10회 상한·상한 초과(실행 : go test ./internal/nack)
package nack

import (
	"slices"
	"testing"
	"time"

	"github.com/pion/rtcp"
)

var base = uint64(1<<16) + 10

func seqsOf(pairs []rtcp.NackPair) []uint16 {
	var out []uint16
	for i := range pairs {
		out = append(out, pairs[i].PacketList()...)
	}
	return out
}

func recv(t *LossTracker, exts ...uint64) {
	for _, e := range exts {
		t.Receive(e, false)
	}
}

func span(from, to uint64) []uint64 { // [from, to]
	var s []uint64
	for e := from; e <= to; e++ {
		s = append(s, e)
	}
	return s
}

func TestLossTrackerFirstNACK(t *testing.T) {
	now := time.Unix(2000, 0)
	cases := []struct {
		name string
		in   []uint64
		want []uint16
	}{
		{"손실 없음", span(base, base+10), nil},
		{"구멍 뒤 1패킷 — 순서 뒤바뀜일 수 있음", []uint64{base, base + 2}, nil},
		{"구멍 뒤 3패킷 — 최근 4 제외", []uint64{base, base + 2, base + 3, base + 4}, nil},
		{"구멍 뒤 4패킷 — NACK", []uint64{base, base + 2, base + 3, base + 4, base + 5}, []uint16{uint16(base + 1)}},
		{"순서 뒤바뀜 후 도착 — NACK 없음", append([]uint64{base, base + 2, base + 1}, span(base+3, base+9)...), nil},
		{"연속 손실 3개", append([]uint64{base}, span(base+4, base+10)...), []uint16{uint16(base + 1), uint16(base + 2), uint16(base + 3)}},
		{"감김 65535→0 구멍", append([]uint64{1<<17 - 2}, span(1<<17, 1<<17+4)...), []uint16{65535}},
		{"감김 직후 0 손실", append([]uint64{1<<17 - 1}, span(1<<17+1, 1<<17+5)...), []uint16{0}},
	}
	for _, c := range cases {
		lt := NewLossTracker()
		recv(lt, c.in...)
		if got := seqsOf(lt.Due(now, 0)); !slices.Equal(got, c.want) {
			t.Errorf("%s : %v, 기대 %v", c.name, got, c.want)
		}
	}
}

func TestLossTrackerRetry(t *testing.T) {
	t0 := time.Unix(2000, 0)
	rtt := 100 * time.Millisecond
	lt := NewLossTracker()
	recv(lt, append([]uint64{base}, span(base+2, base+6)...)...)
	steps := []struct {
		at   time.Duration
		want int
	}{
		{0, 1},                      // 첫 NACK
		{50 * time.Millisecond, 0},  // RTT 안
		{100 * time.Millisecond, 1}, // RTT 지나 재요청(2회)
		{150 * time.Millisecond, 0},
	}
	for i, s := range steps {
		if got := len(seqsOf(lt.Due(t0.Add(s.at), rtt))); got != s.want {
			t.Errorf("단계 %d : %d개, 기대 %d", i, got, s.want)
		}
	}
	sent := 2
	for k := 2; k < 20; k++ {
		sent += len(seqsOf(lt.Due(t0.Add(time.Duration(k)*rtt), rtt)))
	}
	if sent != MaxNACKTries || len(lt.missing) != 0 {
		t.Errorf("총 %d회(대기 %d), 기대 %d회 후 포기", sent, len(lt.missing), MaxNACKTries)
	}
	lt.Receive(base+1, false) // 포기 뒤 늦게 와도 문제없음
}

func TestLossTrackerRecovered(t *testing.T) {
	now := time.Unix(2000, 0)
	lt := NewLossTracker()
	recv(lt, append([]uint64{base}, span(base+2, base+6)...)...)
	if len(seqsOf(lt.Due(now, 0))) != 1 {
		t.Fatal("첫 NACK 없음")
	}
	lt.Receive(base+1, false) // 재전송 도착
	if got := lt.Due(now.Add(time.Second), 0); got != nil {
		t.Errorf("복구 뒤에도 NACK : %v", seqsOf(got))
	}
}

func TestLossTrackerOverflow(t *testing.T) {
	cases := []struct {
		name         string
		feed         func(lt *LossTracker)
		wantOverflow bool
		maxPending   int
	}{
		{"상한 넘는 큰 구멍 → 비우고 PLI", func(lt *LossTracker) {
			recv(lt, base, base+MaxPendingNACK+2)
		}, true, 0},
		{"구멍 1001개, 키프레임 없음 → 비우고 PLI", func(lt *LossTracker) {
			for k := uint64(0); k <= MaxPendingNACK+1; k++ {
				lt.Receive(base+2*k, false)
			}
		}, true, MaxPendingNACK},
		{"구멍 1001개, 뒤쪽 키프레임 → 이전 정리만", func(lt *LossTracker) {
			for k := uint64(0); k <= MaxPendingNACK+1; k++ {
				lt.Receive(base+2*k, k == 800)
			}
		}, false, 202},
	}
	for _, c := range cases {
		lt := NewLossTracker()
		c.feed(lt)
		if got := lt.Overflow(); got != c.wantOverflow {
			t.Errorf("%s : Overflow=%v, 기대 %v", c.name, got, c.wantOverflow)
		}
		if lt.Overflow() {
			t.Errorf("%s : Overflow 가 읽은 뒤에도 남음", c.name)
		}
		if len(lt.missing) > c.maxPending {
			t.Errorf("%s : 대기 %d개, 상한 %d", c.name, len(lt.missing), c.maxPending)
		}
	}
}

func TestLossTrackerRequestAndRate(t *testing.T) {
	t0 := time.Unix(2000, 0)
	lt := NewLossTracker()
	recv(lt, span(base, base+10)...)
	lt.Request(base + 3)  // 이미 받은 순번이라도 하류 미스면 재요청(필터는 santorini 가 캐시로)
	lt.Request(base + 99) // 미래 순번 무시
	if got := seqsOf(lt.Due(t0, 0)); !slices.Equal(got, []uint16{uint16(base + 3)}) {
		t.Errorf("Request : %v", got)
	}

	// 패킷 속도 1000pps → 첫 NACK 대기 20패킷
	lt = NewLossTracker()
	lt.Due(t0, 0)
	recv(lt, span(base, base+999)...)
	lt.Due(t0.Add(time.Second), 0)
	if lt.delay != 20 {
		t.Fatalf("delay=%d, 기대 20", lt.delay)
	}
	recv(lt, span(base+1001, base+1019)...) // 구멍 base+1000 뒤 19패킷
	if got := lt.Due(t0.Add(time.Second+20*time.Millisecond), 0); got != nil {
		t.Errorf("19패킷에서 NACK : %v", seqsOf(got))
	}
	lt.Receive(base+1020, false)
	if got := seqsOf(lt.Due(t0.Add(time.Second+40*time.Millisecond), 0)); len(got) != 1 {
		t.Errorf("20패킷에서 NACK 없음 : %v", got)
	}
}
