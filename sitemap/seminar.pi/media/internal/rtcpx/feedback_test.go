// rtcpx 피드백 단위 테스트 — NACK 직렬화 왕복(감김 65535→0 포함)·PLI·FIR 파싱(실행 : go test ./internal/rtcpx)
package rtcpx

import (
	"slices"
	"testing"

	"github.com/pion/rtcp"
)

func roundTrip(t *testing.T, p rtcp.Packet) rtcp.Packet {
	t.Helper()
	b, err := rtcp.Marshal([]rtcp.Packet{p})
	if err != nil {
		t.Fatal(err)
	}
	ps, err := rtcp.Unmarshal(b)
	if err != nil || len(ps) != 1 {
		t.Fatalf("Unmarshal : %v, %d개", err, len(ps))
	}
	return ps[0]
}

func TestNACKRoundTrip(t *testing.T) {
	cases := []struct {
		name string
		seqs []uint16
	}{
		{"단일", []uint16{100}},
		{"한 쌍 안(17개)", []uint16{10, 11, 12, 26}},
		{"두 쌍(간격 17)", []uint16{10, 27}},
		{"감김 65535→0", []uint16{65534, 65535, 0, 1}},
		{"감김 경계 넘는 쌍 분리", []uint16{65530, 20}},
	}
	for _, c := range cases {
		p := roundTrip(t, NACK(1, 0xABCD, rtcp.NackPairsFromSequenceNumbers(c.seqs)))
		media, got, ok := ParseNACK(p)
		if !ok || media != 0xABCD || !slices.Equal(got, c.seqs) {
			t.Errorf("%s : media=%x seqs=%v ok=%v, 기대 %v", c.name, media, got, ok, c.seqs)
		}
	}
}

func TestPLIFIRParse(t *testing.T) {
	if m, ok := ParsePLI(roundTrip(t, PLI(1, 77))); !ok || m != 77 {
		t.Errorf("PLI : %d,%v", m, ok)
	}
	fir := roundTrip(t, FIR(1, 77, 9))
	cases := []struct {
		name string
		p    rtcp.Packet
		ssrc uint32
		seq  uint8
		ok   bool
	}{
		{"FIR 대상 일치", fir, 77, 9, true},
		{"FIR 대상 다름", fir, 78, 0, false},
		{"FIR 아님", PLI(1, 77), 77, 0, false},
	}
	for _, c := range cases {
		if s, ok := ParseFIR(c.p, c.ssrc); s != c.seq || ok != c.ok {
			t.Errorf("%s : %d,%v 기대 %d,%v", c.name, s, ok, c.seq, c.ok)
		}
	}
	if _, _, ok := ParseNACK(PLI(1, 2)); ok {
		t.Error("PLI 를 NACK 으로 파싱")
	}
}
