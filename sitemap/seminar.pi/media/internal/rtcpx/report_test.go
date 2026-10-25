// rtcpx 단위 테스트 — LSR/DLSR RTT 계산 경계값(실행 : go test ./internal/rtcpx)
package rtcpx

import (
	"testing"
	"time"
)

func TestRTT(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	lsrAt := func(d time.Duration) uint32 { return uint32(NTPTime(now.Add(-d)) >> 16) }
	cases := []struct {
		name      string
		lsr, dlsr uint32
		min, max  time.Duration
	}{
		{"LSR 없음", 0, 0, 0, 0},
		{"100ms, 지연 0", lsrAt(100 * time.Millisecond), 0, 99 * time.Millisecond, 101 * time.Millisecond},
		{"300ms, DLSR 200ms", lsrAt(300 * time.Millisecond), 65536 / 5, 99 * time.Millisecond, 101 * time.Millisecond},
		{"DLSR 가 더 큼 → 0", lsrAt(10 * time.Millisecond), 65536, 0, 0},
	}
	for _, c := range cases {
		if got := RTT(c.lsr, c.dlsr, now); got < c.min || got > c.max {
			t.Errorf("%s : %v, 기대 %v~%v", c.name, got, c.min, c.max)
		}
	}
}

func TestReceptionStats(t *testing.T) {
	cases := []struct {
		name     string
		in       []uint64
		lastSeq  uint32
		lost     uint32
		fraction uint8
	}{
		{"연속", []uint64{65537, 65538, 65539}, 3, 0, 0},
		{"감김 65535→0 연속", []uint64{131070, 131071, 131072}, 65536, 0, 0},
		{"구멍 1개(4중 1)", []uint64{65537, 65538, 65540}, 4, 1, 64},
		{"순서 뒤바뀜", []uint64{65537, 65539, 65538}, 3, 0, 0},
		{"첫 패킷보다 앞선 순번", []uint64{65540, 65539}, 4, 0, 0},
	}
	for _, c := range cases {
		var s ReceptionStats
		for _, x := range c.in {
			s.Update(x)
		}
		r := s.Report(7, 0, 0)
		if r.LastSequenceNumber != c.lastSeq || r.TotalLost != c.lost || r.FractionLost != c.fraction {
			t.Errorf("%s : seq=%d lost=%d frac=%d, 기대 %d %d %d", c.name, r.LastSequenceNumber, r.TotalLost, r.FractionLost, c.lastSeq, c.lost, c.fraction)
		}
	}
	// 두 번째 보고의 FractionLost 는 직전 보고 이후 구간만 본다
	var s ReceptionStats
	s.Update(65537)
	s.Update(65539)
	s.Report(7, 0, 0)
	s.Update(65540)
	if r := s.Report(7, 0, 0); r.FractionLost != 0 || r.TotalLost != 1 {
		t.Errorf("구간 손실률 : frac=%d lost=%d", r.FractionLost, r.TotalLost)
	}
}

func TestExtrapolateRTP(t *testing.T) {
	at := time.Unix(100, 0)
	cases := []struct {
		ts    uint32
		d     time.Duration
		clock uint32
		want  uint32
	}{
		{1000, time.Second, 90000, 91000},
		{4294967000, 10 * time.Millisecond, 90000, 604}, // 32비트 감김
		{0, 20 * time.Millisecond, 48000, 960},
		{5000, -10 * time.Millisecond, 90000, 4100}, // 기준보다 이른 시각
	}
	for _, c := range cases {
		if got := ExtrapolateRTP(c.ts, at, at.Add(c.d), c.clock); got != c.want {
			t.Errorf("ExtrapolateRTP(%d,+%v)=%d, 기대 %d", c.ts, c.d, got, c.want)
		}
	}
	if d := DLSR(at, at.Add(500*time.Millisecond)); d != 32768 {
		t.Errorf("DLSR 0.5초=%d, 기대 32768", d)
	}
}
