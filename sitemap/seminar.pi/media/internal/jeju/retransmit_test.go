// M2 jeju 단위 테스트 — 신규 구독자 캐시 재생(40패킷·키프레임 덮임) · 청중 NACK 재전송(같은 SSRC·억제·PLI 후 중단·캐시 미스 묶음)(실행 : go test ./internal/jeju)
package jeju

import (
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/rtcpx"
	"seminar.pi/media/internal/santorini"
)

// blockReader — 패킷을 주지 않는 가짜 발행 트랙(레이어 수신 고루틴이 캐시를 건드리지 않게).
type blockReader struct{ done <-chan struct{} }

func (r blockReader) Read([]byte) (int, interceptor.Attributes, error) {
	<-r.done
	return 0, nil, errClosed
}

type closedErr struct{}

func (closedErr) Error() string { return "closed" }

var errClosed = closedErr{}

type nopRTCP struct{}

func (nopRTCP) WriteRTCP([]rtcp.Packet) error { return nil }

type capWriter struct{ pkts []rtp.Packet }

func (w *capWriter) WriteRTP(p *rtp.Packet) error {
	c := *p
	c.Payload = append([]byte(nil), p.Payload...) // 송신자는 버퍼를 재사용한다 — 실제 Writer 처럼 즉시 복사
	w.pkts = append(w.pkts, c)
	return nil
}

const outSSRC = 0xC0FFEE

// setup — 레이어 0 캐시에 [key, last] 패킷을 넣고 Consumer 를 만든다(Run 은 띄우지 않고 송신 고루틴 함수를 직접 부른다).
func setup(t *testing.T, key, last uint64, slots bool) (*Consumer, *nack.PacketCache, *capWriter) {
	t.Helper()
	p := santorini.New("p1", "peer1", santorini.Video, santorini.Camera)
	t.Cleanup(p.Close)
	l := p.AddLayer("", blockReader{p.Done()}, nopRTCP{})
	cache := l.Cache()
	for e := key; e <= last; e++ {
		pkt := &rtp.Packet{
			Header:  rtp.Header{Version: 2, SSRC: 1111, SequenceNumber: uint16(e), Timestamp: uint32(e / 3), Marker: e%3 == 2},
			Payload: []byte{byte(e)},
		}
		if err := pkt.SetExtension(1, []byte{1}); err != nil { // 들어온 확장 — 출력에서 지워져야 함(D-12)
			t.Fatal(err)
		}
		raw, err := pkt.Marshal()
		if err != nil {
			t.Fatal(err)
		}
		cache.Store(e, uint32(e/3), slots && e == key, e%3 == 2, raw)
	}
	w := &capWriter{}
	return New("c1", p, w, outSSRC, false), cache, w
}

func TestReplay(t *testing.T) {
	const k = uint64(1<<17) - 5 // 감김(65535→0)을 가로지르는 구간
	cases := []struct {
		name   string
		key    bool
		n      uint64
		want   bool
		wantPk int
	}{
		{"키프레임부터 6패킷 재생", true, 6, true, 6},
		{"40패킷 경계 — 재생", true, ReplayMax, true, ReplayMax},
		{"41패킷 — 재생 안 함(PLI)", true, ReplayMax + 1, false, 0},
		{"키프레임 없음", false, 6, false, 0},
	}
	for _, c := range cases {
		cons, _, w := setup(t, k, k+c.n-1, c.key)
		if got := cons.replay(); got != c.want || len(w.pkts) != c.wantPk {
			t.Errorf("%s : replay=%v 패킷 %d, 기대 %v %d", c.name, got, len(w.pkts), c.want, c.wantPk)
			continue
		}
		for i, p := range w.pkts {
			if p.SSRC != outSSRC || p.Extension || len(p.Extensions) != 0 {
				t.Errorf("%s #%d : SSRC %x 확장 %v", c.name, i, p.SSRC, p.Extension)
			}
			if i > 0 && p.SequenceNumber != w.pkts[i-1].SequenceNumber+1 {
				t.Errorf("%s #%d : 출력 순번 불연속 %d→%d", c.name, i, w.pkts[i-1].SequenceNumber, p.SequenceNumber)
			}
		}
	}
}

func TestReplayKeyEvicted(t *testing.T) {
	cons, cache, w := setup(t, 1<<17, 1<<17+5, true)
	cache.Store(1<<17+nack.VideoSlots, 0, false, false, []byte{0x80}) // 키프레임 첫 조각 슬롯을 덮음(Last 도 멀어짐)
	if cons.replay() || len(w.pkts) != 0 {
		t.Errorf("덮인 키프레임으로 재생 : %d패킷", len(w.pkts))
	}
}

func nackFor(seqs ...uint16) []rtcp.Packet {
	return []rtcp.Packet{rtcpx.NACK(1, outSSRC, rtcp.NackPairsFromSequenceNumbers(seqs))}
}

func TestOnNACK(t *testing.T) {
	const k = uint64(1 << 18)
	cons, cache, w := setup(t, k, k+9, true)
	if !cons.replay() {
		t.Fatal("재생 실패")
	}
	sent := w.pkts
	w.pkts = nil
	target := sent[3]

	// 1) 재전송 : 같은 SSRC·같은 출력 순번·같은 본문
	cons.onNACK(nackFor(target.SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 1 || w.pkts[0].SequenceNumber != target.SequenceNumber || w.pkts[0].SSRC != outSSRC ||
		w.pkts[0].Payload[0] != target.Payload[0] {
		t.Fatalf("재전송 불일치 : %+v", w.pkts)
	}
	// 2) 바로 다시 요청 → 억제
	cons.onNACK(nackFor(target.SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 1 {
		t.Errorf("억제 실패 : %d", len(w.pkts))
	}
	// 3) 다른 SSRC 대상 NACK 무시
	cons.onNACK(&rtcp.TransportLayerNack{MediaSSRC: 1, Nacks: rtcp.NackPairsFromSequenceNumbers([]uint16{sent[4].SequenceNumber})})
	if len(w.pkts) != 1 {
		t.Error("다른 SSRC NACK 에 재전송")
	}
	// 4) PLI 후 중단
	cons.stopRTX()
	cons.onNACK(nackFor(sent[5].SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 1 {
		t.Error("PLI 후에도 재전송")
	}
	cons.meta.KeyframeSent()

	// 5) 캐시 미스 → 50ms 묶음 대기
	cache.Store(k+6+nack.VideoSlots, 0, false, false, []byte{0x80}) // sent[6] 슬롯 덮음
	cons.onNACK(nackFor(sent[6].SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 1 {
		t.Error("미스인데 재전송")
	}
	ms := cons.meta.TakeMisses(time.Now().Add(nack.MissBatchWait))
	if len(ms) != 1 || ms[0].Src != k+6 || ms[0].Layer != 0 {
		t.Errorf("미스 묶음 : %v", ms)
	}
}

// 전환 뒤 재전송 : 전환 전 출력 순번은 재전송하지 않고(헤더 기준이 달라짐), 전환 뒤 순번은 처음과 같은 TS 로 다시 보낸다.
// abs-send-time ID 가 있으면 새 확장을 붙이고, NACK 비율 창 입력(보낸 수·재전송 수)을 넘긴다.
func TestRetransmitAfterSwitch(t *testing.T) {
	const k = uint64(1<<16) - 3 // 감김 근처
	cons, cache, w := setup(t, k, k+9, true)
	var gotSent, gotRtx uint32
	cons.SetNackStats(func(s, r uint32) { gotSent, gotRtx = s, r })
	cons.SetAbsSendTimeID(3)
	if !cons.replay() {
		t.Fatal("재생 실패")
	}
	old := w.pkts[3]

	// 같은 레이어로 재기준(재개·전환과 같은 경로) 후 새 패킷 1개
	pkt := &rtp.Packet{Header: rtp.Header{Version: 2, SSRC: 1111, SequenceNumber: uint16((k + 10) & 0xFFFF), Timestamp: 777, Marker: true}, Payload: []byte{9}}
	raw, err := pkt.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	idx := cache.Store(k+10, 777, true, true, raw)
	it := forward.Item{ExtSeq: k + 10, Idx: idx, Key: true, Marker: true, Layer: 0, At: time.Now()}
	cons.applySwitch(&Switch{From: 0, To: 0}, it)
	if !cons.send(raw, it, time.Now()) {
		t.Fatal("전환 뒤 송신 실패")
	}
	fresh := w.pkts[len(w.pkts)-1]
	w.pkts = nil

	cons.onNACK(nackFor(old.SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 0 {
		t.Fatalf("전환 전 순번을 재전송함 : %+v", w.pkts)
	}
	cons.onNACK(nackFor(fresh.SequenceNumber)[0].(*rtcp.TransportLayerNack))
	if len(w.pkts) != 1 || w.pkts[0].Timestamp != fresh.Timestamp || w.pkts[0].SequenceNumber != fresh.SequenceNumber {
		t.Fatalf("전환 뒤 재전송 불일치 : %+v / %+v", w.pkts, fresh)
	}
	if w.pkts[0].GetExtension(3) == nil {
		t.Error("abs-send-time 확장 없음")
	}
	cons.flushStats()
	if gotSent != 11 || gotRtx != 1 {
		t.Errorf("NACK 통계 sent=%d rtx=%d, 기대 11·1", gotSent, gotRtx)
	}
}
