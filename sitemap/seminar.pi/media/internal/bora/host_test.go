// 개최자 부재 정리 시험(v1.3.3, 마스터 2026-10-29) — 개최자가 방에 HostGrace 넘게 없으면 reap 이 방을 닫고(ROOM_CLOSED) 개최자가 있으면 닫지 않는다.
// 실행 : go test ./internal/bora -run Host
package bora

import (
	"testing"
	"time"

	"seminar.pi/media/internal/jeju"
	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

// hostRoom — 개최자 H·청중 B 가 들어 있는 방(host 클레임 H). 입장(join)은 엔진 API 가 필요해 표를 직접 채운다
func hostRoom(t *testing.T, host string, subs ...string) (*Room, map[string]*fakeSession) {
	t.Helper()
	r := NewRoom("smn", 31, time.Time{})
	sess := map[string]*fakeSession{}
	r.exec(func() {
		r.noteHost(host, time.Now())
		for _, sub := range subs {
			s := &fakeSession{id: sub}
			sess[sub] = s
			r.peers[sub] = &Peer{ID: sub, Ticket: signal.Ticket{Sub: sub}, Session: s, Producers: map[string]*santorini.Producer{}, Consumers: map[string]*jeju.Consumer{}}
		}
	})
	t.Cleanup(r.Close)
	return r, sess
}

func reapableAt(r *Room, at time.Time) (v bool) {
	r.exec(func() { v = r.reapable(at) })
	return
}

func TestHostLeaveThenGrace(t *testing.T) {
	r, sess := hostRoom(t, "H", "H", "B")
	r.exec(func() { r.closePeer("H") }) // 개최자 퇴장 = 부재 기준 시각
	var left time.Time
	r.exec(func() { left = r.hostAt })
	if reapableAt(r, left.Add(HostGrace-time.Second)) {
		t.Fatal("유예 안인데 닫힘")
	}
	if !reapableAt(r, left.Add(HostGrace+time.Second)) {
		t.Fatal("유예가 지났는데 안 닫힘")
	}
	// Manager.reap 이 방을 닫고 남은 청중에게 ROOM_CLOSED
	m := NewManager()
	m.exec(func() { m.rooms["smn"] = r })
	r.exec(func() { r.hostAt = time.Now().Add(-HostGrace - time.Second) })
	m.reap(r)
	if sess["B"].closed != signal.CodeRoomClosed {
		t.Fatalf("청중 세션 종료 코드 = %q", sess["B"].closed)
	}
}

func TestHostPresentNeverReaped(t *testing.T) {
	r, _ := hostRoom(t, "H", "H", "B")
	r.exec(func() { r.hostAt = time.Now().Add(-24 * time.Hour) })
	if reapableAt(r, time.Now()) {
		t.Fatal("개최자가 있는데 닫힘")
	}
}

func TestNoHostClaimKeepsOldRules(t *testing.T) {
	r, _ := hostRoom(t, "", "B") // 실험실 방 — host 없음
	if reapableAt(r, time.Now().Add(24*time.Hour)) {
		t.Fatal("host 없는 방이 개최자 부재로 닫힘")
	}
}

func TestHostNeverJoined(t *testing.T) {
	r, _ := hostRoom(t, "H", "B") // 청중만 먼저(개최자 한 번도 없음)
	var set time.Time
	r.exec(func() { set = r.hostAt })
	if reapableAt(r, set.Add(HostGrace-time.Second)) || !reapableAt(r, set.Add(HostGrace+time.Second)) {
		t.Fatal("개최자가 한 번도 없는 방은 host 를 채운 시각 + 유예 뒤 닫혀야 함")
	}
}

func TestHostFilledLaterCountsFromFill(t *testing.T) {
	r, _ := hostRoom(t, "", "B")
	r.exec(func() { r.noteHost("H", time.Now()) })                // 뒤늦게 채움(구 화면 서버가 만든 방)
	r.exec(func() { r.noteHost("X", time.Now().Add(time.Hour)) }) // 덮어쓰지 않음
	var host string
	var at time.Time
	r.exec(func() { host, at = r.host, r.hostAt })
	if host != "H" || time.Since(at) > time.Minute {
		t.Fatalf("host=%q hostAt=%v — 채운 값·시각이어야 함", host, at)
	}
	if reapableAt(r, time.Now()) {
		t.Fatal("채우자마자 닫힘(방 생성 시각 기준 결함)")
	}
}
