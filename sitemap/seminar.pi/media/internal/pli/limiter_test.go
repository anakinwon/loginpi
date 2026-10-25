// pli 단위 테스트 — Limiter 합침·최소 간격·키프레임 해제·1초 무응답 재시도 1회, FIRFilter 순번 갱신(실행 : go test ./internal/pli)
package pli

import (
	"testing"
	"time"
)

type step struct {
	at   time.Duration
	need bool
	key  bool
	want bool
}

func runSteps(t *testing.T, name string, l *Limiter, steps []step) {
	t0 := time.Unix(1000, 0)
	for i, s := range steps {
		if s.need {
			l.Need(SubscriberPLI)
		}
		if s.key {
			l.KeyframeSeen()
		}
		if got := l.Tick(t0.Add(s.at)); got != s.want {
			t.Errorf("%s 단계 %d(%v) : Tick=%v, 기대 %v", name, i, s.at, got, s.want)
		}
	}
}

func TestLimiter(t *testing.T) {
	ms := time.Millisecond
	cases := []struct {
		name  string
		layer int8
		steps []step
	}{
		{"합침·해제·간격(l)", 0, []step{
			{0, false, false, false},       // 요청 없음
			{0, true, false, true},         // 첫 요청 즉시
			{100 * ms, true, false, false}, // 기다리는 중 → 합침
			{300 * ms, false, true, false}, // 키프레임 도착 → 해제
			{400 * ms, true, false, false}, // 새 요청이지만 최소 간격(500ms) 안
			{500 * ms, false, false, true}, // 간격 지남 → 보냄
		}},
		{"1초 무응답 재시도 1회 후 포기", 0, []step{
			{0, true, false, true},
			{999 * ms, false, false, false},
			{1000 * ms, false, false, true}, // 재시도 1회
			{1500 * ms, false, false, false},
			{2000 * ms, false, false, false}, // 재시도도 무응답 → 포기(새 요청 없음)
			{5000 * ms, false, false, false},
		}},
		{"포기 직전 새 요청은 이어 감", 0, []step{
			{0, true, false, true},
			{1000 * ms, false, false, true}, // 재시도
			{1200 * ms, true, false, false}, // 재시도 기다리는 중 새 요청 → again
			{2000 * ms, false, false, true}, // 포기 → again 이 새 대기로 → 간격 지남 → 보냄
		}},
		{"m·h 간격 1초", 2, []step{
			{0, true, false, true},
			{100 * ms, false, true, false},
			{200 * ms, true, false, false},
			{999 * ms, false, false, false},
			{1000 * ms, false, false, true},
		}},
	}
	for _, c := range cases {
		runSteps(t, c.name, NewLimiter(c.layer), c.steps)
	}
}

func TestFIRFilter(t *testing.T) {
	var f FIRFilter
	cases := []struct {
		seq  uint8
		want bool
	}{
		{0, false}, // 첫 FIR 은 순번 0 이어도 통과
		{0, true},  // 같은 순번 반복 → 중복
		{1, false}, // 갱신
		{1, true},  // 갱신이 됐으므로 1 반복도 중복(REA_01 5.5 결함 재현 방지)
		{255, false},
		{0, false}, // 감김
	}
	for i, c := range cases {
		if got := f.Duplicate(c.seq); got != c.want {
			t.Errorf("#%d seq=%d : %v, 기대 %v", i, c.seq, got, c.want)
		}
	}
}
