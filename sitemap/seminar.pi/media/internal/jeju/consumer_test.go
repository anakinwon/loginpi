// M1 전달 경로 단위 테스트 — 가짜 Reader → santorini 레이어 수신 고루틴 → forward 큐 → jeju 송신 고루틴 → 가짜 Writer (네트워크 없음, 실행 : go test ./internal/jeju)
// 확인 : 첫 키프레임 전 Buffer, 순번 감김 65535→0 뒤에도 출력 순번 연속, 고정 OutSSRC, 들어온 헤더 확장 제거, 새 구독자 PLI(상류)
package jeju

import (
	"io"
	"sync"
	"testing"
	"time"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"

	"seminar.pi/media/internal/santorini"
)

type fakeReader struct{ ch chan []byte }

func (f *fakeReader) Read(b []byte) (int, interceptor.Attributes, error) {
	p, ok := <-f.ch
	if !ok {
		return 0, nil, io.EOF
	}
	return copy(b, p), nil, nil
}

type fakeRTCP struct {
	mu   sync.Mutex
	pkts []rtcp.Packet
}

func (f *fakeRTCP) WriteRTCP(p []rtcp.Packet) error {
	f.mu.Lock()
	f.pkts = append(f.pkts, p...)
	f.mu.Unlock()
	return nil
}

func (f *fakeRTCP) count(match func(rtcp.Packet) bool) (n int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, p := range f.pkts {
		if match(p) {
			n++
		}
	}
	return
}

type fakeWriter struct{ ch chan rtp.Packet }

func (f *fakeWriter) WriteRTP(p *rtp.Packet) error {
	c := *p
	c.Payload = append([]byte(nil), p.Payload...)
	f.ch <- c
	return nil
}

const presenterSSRC = 0x1234

func vp8Packet(t *testing.T, seq uint16, ts uint32, key, ext bool) []byte {
	payload := []byte{0x10, 0x01, 0xAA} // S=1, P=1(델타)
	if key {
		payload[1] = 0x00
	}
	p := rtp.Packet{Header: rtp.Header{Version: 2, PayloadType: 96, SequenceNumber: seq, Timestamp: ts, SSRC: presenterSSRC, Marker: true}, Payload: payload}
	if ext {
		if err := p.SetExtension(1, []byte{0x01, 0x02}); err != nil {
			t.Fatal(err)
		}
	}
	b, err := p.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	for end := time.Now().Add(2 * time.Second); time.Now().Before(end); time.Sleep(5 * time.Millisecond) {
		if cond() {
			return
		}
	}
	t.Fatalf("시간 초과 : %s", what)
}

func TestForwardPath(t *testing.T) {
	prod := santorini.New("p1", "peer1", santorini.Video, santorini.Camera)
	defer prod.Close()
	rd := &fakeReader{ch: make(chan []byte, 16)}
	up := &fakeRTCP{}
	l := prod.AddLayer("", rd, up)

	w := &fakeWriter{ch: make(chan rtp.Packet, 16)}
	const outSSRC = 0xABCD
	c := New("c1", prod, w, outSSRC, false)
	defer c.Close()
	c.SetReporter(&fakeRTCP{})
	l.Subscribe(c.Queue())
	time.Sleep(50 * time.Millisecond) // Subscribe 명령이 첫 패킷보다 먼저 처리되도록
	c.Start()

	// ① 키프레임 전 델타 → Buffer(출력 없음), 새 구독자 PLI 가 발표자 SSRC 로 나간다
	rd.ch <- vp8Packet(t, 65533, 100, false, false)
	waitFor(t, "새 구독자 PLI", func() bool {
		return up.count(func(p rtcp.Packet) bool {
			pl, ok := p.(*rtcp.PictureLossIndication)
			return ok && pl.MediaSSRC == presenterSSRC
		}) > 0
	})

	// ② 키프레임부터 전달 — 순번 감김 65535→0, 헤더 확장 제거
	in := []struct {
		seq      uint16
		ts       uint32
		key, ext bool
	}{
		{65534, 3100, true, true},
		{65535, 6100, false, false},
		{0, 9100, false, true},
		{1, 12100, false, false},
	}
	for _, x := range in {
		rd.ch <- vp8Packet(t, x.seq, x.ts, x.key, x.ext)
	}
	var prev uint16
	for i, x := range in {
		select {
		case p := <-w.ch:
			if p.SSRC != outSSRC || p.Timestamp != x.ts || p.Extension || len(p.Extensions) != 0 {
				t.Errorf("#%d 헤더 : ssrc=%x ts=%d ext=%v", i, p.SSRC, p.Timestamp, p.Extension)
			}
			if i > 0 && p.SequenceNumber != prev+1 {
				t.Errorf("#%d 출력 순번 불연속 : %d 다음 %d", i, prev, p.SequenceNumber)
			}
			prev = p.SequenceNumber
		case <-time.After(2 * time.Second):
			t.Fatalf("#%d 출력 없음", i)
		}
	}
	select {
	case p := <-w.ch:
		t.Errorf("예상 밖 출력 seq=%d (키프레임 전 패킷이 새어 나감?)", p.SequenceNumber)
	default:
	}
}

// Start 전(구독 PC 미연결) 명령이 버퍼(64)를 넘겨도 호출자가 막히지 않는다 — 방·할당기 고루틴 교착 방지(D-10).
func TestCommandsBeforeStartDoNotBlock(t *testing.T) {
	prod := santorini.New("p1", "peer1", santorini.Video, santorini.Camera)
	defer prod.Close()
	c := New("c1", prod, nil, 1, false)
	defer c.Close()
	done := make(chan struct{})
	go func() {
		for i := 0; i < 500; i++ {
			c.Pause()
			c.Resume()
			c.SetTarget(int8(i%3), false)
			c.SetMax(int8(i % 3))
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Start 전 명령에서 막힘")
	}
}
