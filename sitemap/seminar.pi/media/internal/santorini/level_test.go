// 음성 레벨 평활·무음 판정 시험 — 수신 고루틴 handle 에 오디오 레벨 확장이 실린 RTP 를 직접 넣는다(실행 : go test ./internal/santorini)
package santorini

import (
	"testing"
	"time"

	"github.com/pion/rtp"

	"seminar.pi/media/internal/nack"
	"seminar.pi/media/internal/rtcpx"
)

func levelPkt(t *testing.T, seq uint16, id uint8, lvl byte) []byte {
	t.Helper()
	p := rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: seq, SSRC: 7}, Payload: []byte{1, 2, 3}}
	if id != 0 {
		if err := p.SetExtension(id, []byte{0x80 | lvl}); err != nil {
			t.Fatal(err)
		}
	}
	b, err := p.Marshal()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestAudioLevelSmoothing(t *testing.T) {
	cases := []struct {
		name   string
		kind   Kind
		id     uint8 // 협상 ID(0 = 협상 안 됨)
		sendID uint8 // 패킷에 실은 ID
		levels []byte
		wantOK bool
		lo, hi float64 // 평활값 허용 범위
	}{
		{"큰 소리 연속", Audio, 1, 1, []byte{20, 20, 20, 20}, true, 19.9, 20.1},
		{"무음에서 말하기 시작 — 평활로 천천히", Audio, 1, 1, []byte{127, 20}, true, 113, 114.5},
		{"협상 안 된 ID 는 읽지 않음", Audio, 1, 3, []byte{20}, false, 127, 127},
		{"협상 없음", Audio, 0, 1, []byte{20}, false, 127, 127},
		{"영상은 대상 아님", Video, 1, 1, []byte{20}, false, 127, 127},
	}
	for _, c := range cases {
		pr := New("p", "peer", c.kind, Mic)
		pr.SetAudioLevelID(c.id)
		l := newLayer(0, c.kind, pr.done)
		l.levelID = &pr.levelID
		pr.layers[0] = l
		scratch := make([]byte, nack.SlotSize)
		var st rtcpx.ReceptionStats
		for i, v := range c.levels {
			l.handle(levelPkt(t, uint16(i+1), c.sendID, v), scratch, &st)
		}
		got, ok := pr.AudioLevel(time.Now())
		if ok != c.wantOK || got < c.lo || got > c.hi {
			t.Errorf("%s : %.1f,%v 기대 %.1f~%.1f,%v", c.name, got, ok, c.lo, c.hi, c.wantOK)
		}
		if c.wantOK {
			if _, ok := pr.AudioLevel(time.Now().Add(LevelStale)); ok {
				t.Errorf("%s : %v 뒤에도 소리 있음", c.name, LevelStale)
			}
		}
	}
}
