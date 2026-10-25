// REMB 직렬화 왕복·비정상 값 거부 표 형식 테스트(M4, 실행 : go test ./internal/rtcpx)
package rtcpx

import (
	"math"
	"testing"

	"github.com/pion/rtcp"
)

func TestREMBRoundTrip(t *testing.T) {
	raw, err := REMB(1, 1_500_000, []uint32{11, 22}).Marshal()
	if err != nil {
		t.Fatal(err)
	}
	pkts, err := rtcp.Unmarshal(raw)
	if err != nil || len(pkts) != 1 {
		t.Fatalf("Unmarshal : %v %d", err, len(pkts))
	}
	bps, ssrcs, ok := ParseREMB(pkts[0])
	// REMB 는 지수·가수 표현이라 근사
	if !ok || math.Abs(float64(bps)-1_500_000) > 1_500_000*0.001 || len(ssrcs) != 2 || ssrcs[1] != 22 {
		t.Errorf("왕복 결과 %v %v %v", bps, ssrcs, ok)
	}
}

func TestParseREMBReject(t *testing.T) {
	cases := []struct {
		name string
		p    rtcp.Packet
	}{
		{"REMB 아님", &rtcp.PictureLossIndication{}},
		{"SSRC 없음", &rtcp.ReceiverEstimatedMaximumBitrate{Bitrate: 1000}},
		{"음수", &rtcp.ReceiverEstimatedMaximumBitrate{Bitrate: -1, SSRCs: []uint32{1}}},
		{"NaN", &rtcp.ReceiverEstimatedMaximumBitrate{Bitrate: float32(math.NaN()), SSRCs: []uint32{1}}},
		{"Inf", &rtcp.ReceiverEstimatedMaximumBitrate{Bitrate: float32(math.Inf(1)), SSRCs: []uint32{1}}},
	}
	for _, c := range cases {
		if _, _, ok := ParseREMB(c.p); ok {
			t.Errorf("%s : 거부해야 함", c.name)
		}
	}
}
