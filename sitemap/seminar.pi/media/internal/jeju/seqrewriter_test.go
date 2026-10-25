// M3 표 형식 단위 테스트 — SeqRewriter(출력 감김·연속 Drop·늦은 패킷·Sync 옛 패킷 차단·Drop 접기)와 decide 재개 게이트(실행 : go test ./internal/jeju)
package jeju

import (
	"testing"

	"seminar.pi/media/internal/forward"
	"seminar.pi/media/internal/santorini"
)

type seqStep struct {
	op     byte // 'I' Input, 'D' Drop, 'S' Sync 후 Input, 'Y' Sync 만
	in     uint64
	want   uint16
	wantOK bool
}

func runSeq(t *testing.T, name string, s *SeqRewriter, steps []seqStep) {
	t.Helper()
	for i, st := range steps {
		switch st.op {
		case 'D':
			s.Drop(st.in)
			continue
		case 'Y':
			s.Sync(st.in)
			continue
		case 'S':
			s.Sync(st.in)
		}
		out, ok := s.Input(st.in)
		if ok != st.wantOK || (ok && out != st.want) {
			t.Errorf("%s 단계 %d : %c(%d)=%d,%v 기대 %d,%v", name, i, st.op, st.in, out, ok, st.want, st.wantOK)
		}
	}
}

func TestSeqRewriterM3(t *testing.T) {
	cases := []struct {
		name  string
		steps []seqStep
	}{
		{"출력 감김 65535→0", []seqStep{
			{'I', 1000, 1, true},
			{'I', 1000 + 65534, 65535, true},
			{'I', 1000 + 65535, 0, true},
			{'I', 1000 + 65536, 1, true},
		}},
		{"입력 감김(1<<16 경계)", []seqStep{
			{'I', 1<<16 - 1, 1, true},
			{'I', 1 << 16, 2, true},
			{'I', 1<<16 + 1, 3, true},
		}},
		{"연속 Drop 메움 + 버린 순번 재수신 거부", []seqStep{
			{'I', 10, 1, true},
			{'D', 11, 0, false},
			{'D', 12, 0, false},
			{'I', 13, 2, true},
			{'I', 12, 0, false},
			{'I', 14, 3, true},
		}},
		{"Drop 뒤 늦게 온 아래 순번", []seqStep{
			{'I', 30, 1, true},
			{'D', 32, 0, false},
			{'I', 31, 2, true},
			{'I', 33, 3, true},
		}},
		{"순서 뒤바뀜(구멍 유지)", []seqStep{
			{'I', 50, 1, true},
			{'I', 52, 3, true},
			{'I', 51, 2, true},
			{'I', 53, 4, true},
		}},
		{"Sync 재기준 + 옛 패킷 차단", []seqStep{
			{'I', 100, 1, true},
			{'I', 101, 2, true},
			{'S', 500000, 3, true},
			{'I', 102, 0, false},
			{'I', 500001, 4, true},
		}},
		{"Sync 가 Drop 목록 비움", []seqStep{
			{'I', 7, 1, true},
			{'D', 8, 0, false},
			{'S', 9000, 2, true},
			{'I', 9001, 3, true},
		}},
		{"프레임 미완료 전환 Sync(in-1)", []seqStep{
			{'I', 70, 1, true},
			{'Y', 899, 0, false}, // 직전 출력 + 1(2)을 비움 → 900 이 3
			{'I', 900, 3, true},
		}},
		{"시작 전 Drop", []seqStep{
			{'D', 40, 0, false},
			{'I', 41, 1, true},
		}},
	}
	for _, c := range cases {
		var s SeqRewriter
		runSeq(t, c.name, &s, c.steps)
	}
}

// Drop 이 dropCap 을 넘으면 오래된 절반을 오프셋에 접는다 — 출력 연속성은 유지.
func TestSeqRewriterDropFold(t *testing.T) {
	var s SeqRewriter
	if out, _ := s.Input(0); out != 1 {
		t.Fatalf("첫 출력 %d", out)
	}
	in := uint64(1)
	for k := 0; k < dropCap*3; k++ { // 짝수 보냄 · 홀수 버림
		s.Drop(in)
		in++
		want := uint16(k + 2)
		if out, ok := s.Input(in); !ok || out != want {
			t.Fatalf("k=%d Input(%d)=%d,%v 기대 %d", k, in, out, ok, want)
		}
		in++
	}
	if len(s.dropped) > dropCap {
		t.Fatalf("버린 목록 %d > %d", len(s.dropped), dropCap)
	}
}

// fakePolicy — 항상 정해진 판정.
type fakePolicy struct{ d Decision }

func (f *fakePolicy) Decide(forward.Item, bool) (Decision, *Switch) { return f.d, nil }
func (f *fakePolicy) SetTarget(int8, bool)                          {}
func (f *fakePolicy) SetMax(int8)                                   {}
func (f *fakePolicy) State() (int8, int8, int8)                     { return 0, 0, 0 }

// 재개 게이트 : 일시정지 중엔 순번 흔적 없음 → 재개 뒤 영상은 키프레임부터 Sync 로 이어 붙임, 음성은 바로.
func TestDecidePauseResume(t *testing.T) {
	for _, kind := range []santorini.Kind{santorini.Video, santorini.Audio} {
		c := New("c", santorini.New("p", "peer", kind, santorini.Camera), nil, 1, false)
		c.policy = &fakePolicy{d: Forward}
		send := func(ext uint64, key bool) (bool, uint16) {
			if !c.decide(forward.Item{ExtSeq: ext, Key: key}) {
				return false, 0
			}
			out, ok := c.seq.Input(ext)
			return ok, out
		}
		steps := []struct {
			op   string
			ext  uint64
			key  bool
			sent bool
			out  uint16
		}{
			{"", 1, true, true, 1},
			{"", 2, false, true, 2},
			{"pause", 0, false, false, 0},
			{"", 3, false, false, 0},
			{"", 4, true, false, 0},
			{"resume", 0, false, false, 0},
			{"", 50, false, kind == santorini.Audio, 3}, // 음성은 바로 이어 붙임
			{"", 51, true, true, map[bool]uint16{true: 4, false: 3}[kind == santorini.Audio]},
		}
		for i, st := range steps {
			switch st.op {
			case "pause":
				c.pause()
				continue
			case "resume":
				c.resume()
				if c.paused || !c.seq.resync {
					t.Fatalf("%v resume 상태 paused=%v resync=%v", kind, c.paused, c.seq.resync)
				}
				continue
			}
			sent, out := send(st.ext, st.key)
			if sent != st.sent || (sent && out != st.out) {
				t.Errorf("%v 단계 %d : ext %d → %v,%d 기대 %v,%d", kind, i, st.ext, sent, out, st.sent, st.out)
			}
		}
	}
}

// Drop 판정은 순번을 메운다.
func TestDecideDrop(t *testing.T) {
	c := New("c", santorini.New("p", "peer", santorini.Video, santorini.Camera), nil, 1, false)
	p := &fakePolicy{d: Forward}
	c.policy = p
	for i, st := range []struct {
		d    Decision
		ext  uint64
		send bool
		out  uint16
	}{
		{Forward, 10, true, 1},
		{Drop, 11, false, 0},
		{SilentDrop, 12, false, 0}, // 순번 기록 없음(실제로는 다른 레이어 순번 공간) — 같은 공간에 넣으면 구멍으로 남는다
		{Buffer, 13, false, 0},
		{Forward, 14, true, 4}, // 11 만 메워짐, 12·13 은 구멍

	} {
		p.d = st.d
		got := c.decide(forward.Item{ExtSeq: st.ext})
		if got != st.send {
			t.Fatalf("#%d %v send=%v", i, st.d, got)
		}
		if got {
			if out, _ := c.seq.Input(st.ext); out != st.out {
				t.Errorf("#%d out=%d 기대 %d", i, out, st.out)
			}
		}
	}
}
