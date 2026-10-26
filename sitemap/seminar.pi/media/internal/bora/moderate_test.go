// v1.2 표 형식 단위 테스트 — peer.mute·room.muteAll 잠금 순서(잠금 → 일시정지 → 알림)·잠금 중 resume LOCKED·askUnmute 범위,
// room.setLayout 보관·검사·입장 응답, 발언자 판정(임계·300ms 유지·히스테리시스·500ms 간격·침묵 해제) (SIGNAL_API 3.5). 실행 : go test ./internal/bora
package bora

import (
	"reflect"
	"testing"
	"time"

	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// withAudio — newV11 에 N 의 마이크 producer "na" 를 더한다.
func withAudio(t *testing.T) *v11Room {
	v := newV11(t)
	v.r.exec(func() {
		na := santorini.New("na", "N", santorini.Audio, santorini.Mic)
		v.r.producers["na"] = na
		v.r.peers["N"].Producers["na"] = na
	})
	return v
}

func TestPeerMute(t *testing.T) {
	v := withAudio(t)
	for _, st := range []struct {
		by, target, kind string
		want             signal.ErrCode
	}{
		{"A1", "N", "audio", signal.CodeRoleForbidden}, // 청중 요청
		{"N", "A1", "audio", signal.CodeRoleForbidden}, // 패널 요청
		{"P", "P", "audio", signal.CodeRoleForbidden},  // 발표자 대상(본인 포함)
		{"P", "X", "audio", signal.CodeNotFound},
		{"P", "N", "screen", signal.CodeSDPInvalid},
		{"P", "A1", "audio", ""}, // 발행 없는 대상 — 성공·알림 없음
	} {
		if e := v.r.MutePeer(st.by, st.target, st.kind); code(e) != st.want {
			t.Errorf("%s→%s %s : %v 기대 %q", st.by, st.target, st.kind, e, st.want)
		}
	}
	if got := v.take(); len(got["A1"])+len(got["N"]) != 0 {
		t.Fatalf("실패·빈 대상에 알림 %v", got)
	}
	if e := v.r.MutePeer("P", "N", "video"); e != nil {
		t.Fatal(e)
	}
	got := v.take()
	if !reflect.DeepEqual(names(got["N"]), []string{signal.NMutedBy}) ||
		!reflect.DeepEqual(got["N"][0].D, signal.MutedBy{Kind: "video", By: "P", ProducerIDs: []string{"pn"}}) {
		t.Errorf("대상 N 알림 %+v", got["N"])
	}
	for _, id := range []string{"P", "A1", "A2"} {
		if !reflect.DeepEqual(names(got[id]), []string{signal.NProducerPaused}) {
			t.Errorf("%s 알림 %v 기대 producerPaused", id, names(got[id]))
		}
	}
	v.r.exec(func() {
		if !v.r.paused["pn"] || v.r.paused["na"] {
			t.Errorf("일시정지 표 %v", v.r.paused)
		}
	})
	if v.r.MutePeer("P", "N", "video"); len(v.take()["N"]) != 0 {
		t.Error("이미 꺼진 것을 다시 음소거했는데 알림")
	}
	// 잠금이 없으면 본인이 다시 켤 수 있다
	if e := v.r.PauseProducer("N", "pn", false); e != nil {
		t.Errorf("잠금 없는 재개 %v", e)
	}
}

func TestMuteAllLockOrder(t *testing.T) {
	v := withAudio(t)
	if e := v.r.MuteAll("N", "audio", true); code(e) != signal.CodeRoleForbidden {
		t.Errorf("패널 muteAll %v", e)
	}
	if e := v.r.MuteAll("P", "audio", true); e != nil {
		t.Fatal(e)
	}
	got := v.take()
	locked := signal.RoomPolicy{Locked: signal.Locks{Audio: true}}
	// 대상 : 음소거 알림 뒤 잠금 알림, 다른 사람 : 일시정지 뒤 잠금 알림(한 처리 안 — 사이에 다른 요청이 끼지 않음)
	if !reflect.DeepEqual(names(got["N"]), []string{signal.NMutedBy, signal.NRoomPolicy}) || got["N"][1].D != locked {
		t.Errorf("N 알림 %+v", got["N"])
	}
	for _, id := range []string{"P", "A1", "A2"} {
		if !reflect.DeepEqual(names(got[id]), []string{signal.NProducerPaused, signal.NRoomPolicy}) {
			t.Errorf("%s 알림 %v", id, names(got[id]))
		}
	}
	for _, st := range []struct {
		name string
		fn   func() *signal.Error
		want signal.ErrCode
	}{
		{"잠금 중 마이크 재개", func() *signal.Error { return v.r.PauseProducer("N", "na", false) }, signal.CodeLocked},
		{"잠금 중 마이크 끄기는 허용", func() *signal.Error { return v.r.PauseProducer("N", "na", true) }, ""},
		{"카메라는 잠금 밖", func() *signal.Error { return v.r.PauseProducer("N", "pn", true) }, ""},
		{"잠금 중 askUnmute 음성", func() *signal.Error { return v.r.AskUnmute("P", "N", "audio") }, signal.CodeLocked},
		{"askUnmute 영상", func() *signal.Error { return v.r.AskUnmute("P", "N", "video") }, ""},
		{"청중에게 askUnmute", func() *signal.Error { return v.r.AskUnmute("P", "A1", "video") }, signal.CodeRoleForbidden},
		{"패널이 askUnmute", func() *signal.Error { return v.r.AskUnmute("N", "P", "video") }, signal.CodeRoleForbidden},
	} {
		if e := st.fn(); code(e) != st.want {
			t.Errorf("%s : %v 기대 %q", st.name, e, st.want)
		}
	}
	got = v.take()
	if n := got["N"]; len(n) != 1 || n[0].M != signal.NAskUnmute || n[0].D != (signal.AskUnmute{Kind: "video", By: "P"}) {
		t.Errorf("askUnmute 알림 %+v", n)
	}
	if len(got["A1"]) != 1 || got["A1"][0].M != signal.NProducerPaused { // pn 끄기만
		t.Errorf("A1 이 askUnmute 를 받음 %v", names(got["A1"]))
	}
	// 같은 잠금 다시 = 알림 없음, 잠금 해제(lock:false) = roomPolicy 1건 뒤 재개 가능
	_ = v.r.MuteAll("P", "audio", true)
	if n := v.take()["A2"]; len(n) != 0 {
		t.Errorf("같은 잠금에 알림 %v", names(n))
	}
	_ = v.r.MuteAll("P", "audio", false)
	if n := v.take()["A2"]; !reflect.DeepEqual(names(n), []string{signal.NRoomPolicy}) || n[0].D != (signal.RoomPolicy{}) {
		t.Errorf("해제 알림 %+v", n)
	}
	if e := v.r.PauseProducer("N", "na", false); e != nil {
		t.Errorf("해제 뒤 재개 %v", e)
	}
	// 종류별 잠금(입장 응답 policy 는 e2e TestV12Moderation 이 확인)
	_ = v.r.MuteAll("P", "video", true)
	v.r.exec(func() {
		if v.r.locks != (signal.Locks{Video: true}) {
			t.Errorf("잠금 %+v", v.r.locks)
		}
	})
}

func TestSetLayout(t *testing.T) {
	v := newV11(t)
	spot := signal.Layout{Mode: "spotlight", Spotlight: "cam:N", Follow: true}
	for _, st := range []struct {
		by   string
		l    signal.Layout
		want signal.ErrCode
	}{
		{"A1", spot, signal.CodeRoleForbidden},
		{"N", spot, signal.CodeRoleForbidden},
		{"P", signal.Layout{Mode: "grid"}, signal.CodeSDPInvalid},
		{"P", signal.Layout{Mode: "spotlight"}, signal.CodeSDPInvalid},
		{"P", signal.Layout{Mode: "spotlight", Spotlight: string(make([]byte, 65))}, signal.CodeSDPInvalid},
		{"P", spot, ""},
	} {
		if e := v.r.SetLayout(st.by, st.l); code(e) != st.want {
			t.Errorf("%s %+v : %v 기대 %q", st.by, st.l, e, st.want)
		}
	}
	got := v.take()
	for _, id := range []string{"P", "N", "A1", "A2"} {
		if len(got[id]) != 1 || got[id][0].M != signal.NLayout || got[id][0].D != spot {
			t.Errorf("%s 레이아웃 알림 %+v", id, got[id])
		}
	}
	if _ = v.r.SetLayout("P", spot); len(v.take()["A1"]) != 0 {
		t.Error("같은 레이아웃에 알림")
	}
	// auto 는 spotlight 를 비워 보관
	_ = v.r.SetLayout("P", signal.Layout{Mode: "auto", Spotlight: "cam:N"})
	v.r.exec(func() {
		if v.r.layout == nil || *v.r.layout != (signal.Layout{Mode: "auto"}) {
			t.Errorf("보관 %+v", v.r.layout)
		}
	})
}

// 발언자 판정 — 시각을 직접 넣는다(100ms tick 가정).
func TestSpeakerDetector(t *testing.T) {
	t0 := time.Unix(1000, 0)
	type step struct {
		at     time.Duration
		levels map[string]float64
		want   string // 알림 값("-" = 알림 없음, "" = null)
	}
	ms := func(n int) time.Duration { return time.Duration(n) * time.Millisecond }
	loud := func(kv ...any) map[string]float64 {
		m := map[string]float64{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1].(float64)
		}
		return m
	}
	cases := []struct {
		name  string
		steps []step
	}{
		{"임계 밑(작은 소리)은 무시", []step{
			{0, loud("a", 60.0), "-"}, {ms(400), loud("a", 60.0), "-"},
		}},
		{"300ms 유지 뒤 전환", []step{
			{0, loud("a", 30.0), "-"}, {ms(200), loud("a", 30.0), "-"}, {ms(300), loud("a", 30.0), "a"},
		}},
		{"순간 소리(300ms 미만)는 전환 안 함", []step{
			{0, loud("a", 30.0), "-"}, {ms(100), loud(), "-"}, {ms(200), loud("a", 30.0), "-"}, {ms(400), loud("a", 30.0), "-"},
		}},
		{"히스테리시스 — 6dB 미만 차이는 유지, 넘으면 전환", []step{
			{0, loud("a", 30.0), "-"}, {ms(300), loud("a", 30.0), "a"},
			{ms(400), loud("a", 30.0, "b", 26.0), "-"}, {ms(800), loud("a", 30.0, "b", 26.0), "-"},
			{ms(900), loud("a", 30.0, "b", 20.0), "-"}, {ms(1200), loud("a", 30.0, "b", 20.0), "b"},
		}},
		{"500ms 간격 — 미뤘다가 보냄", []step{
			{0, loud("a", 30.0), "-"}, {ms(300), loud("a", 30.0), "a"},
			{ms(400), loud("a", 40.0, "b", 20.0), "-"}, // b 후보 시작
			{ms(700), loud("a", 40.0, "b", 20.0), "-"}, // b 판정됐지만 a 알림 뒤 400ms
			{ms(800), loud("a", 40.0, "b", 20.0), "b"},
		}},
		{"침묵 1.5초 뒤 null", []step{
			{0, loud("a", 30.0), "-"}, {ms(300), loud("a", 30.0), "a"},
			{ms(400), loud(), "-"}, {ms(1800), loud(), "-"}, {ms(1900), loud(), ""},
		}},
		{"현재 발언자가 조용하면 다른 사람이 바로 후보", []step{
			{0, loud("a", 30.0), "-"}, {ms(300), loud("a", 30.0), "a"},
			{ms(400), loud("a", 90.0, "b", 45.0), "-"}, {ms(700), loud("a", 90.0, "b", 45.0), "-"}, // 판정 b, 간격 대기
			{ms(800), loud("a", 90.0, "b", 45.0), "b"},
		}},
	}
	for _, c := range cases {
		var d speakerDetector
		for i, st := range c.steps {
			id, ok := d.tick(t0.Add(st.at), st.levels)
			got := "-"
			if ok {
				got = id
			}
			if got != st.want {
				t.Errorf("%s [%d %v] : %q 기대 %q", c.name, i, st.at, got, st.want)
			}
		}
	}
	// 나간 발언자 → 다음 tick 에 null
	var d speakerDetector
	d.tick(t0, loud("a", 30.0))
	d.tick(t0.Add(ms(300)), loud("a", 30.0))
	d.forget("a")
	if id, ok := d.tick(t0.Add(ms(900)), loud()); !ok || id != "" {
		t.Errorf("forget 뒤 %q %v", id, ok)
	}
}
