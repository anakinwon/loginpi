// Manager — 방 목록(고루틴 1개 소유)과 signal.Handler 구현(시그널링 → 방 명령 연결). 요청 분배 본문은 M1 에서 구현.
package bora

import (
	"encoding/json"
	"time"

	"seminar.pi/media/internal/signal"
)

// Manager — 방 목록.
type Manager struct {
	rooms map[string]*Room // loop 고루틴 소유
	cmd   chan func()
}

// NewManager — 엔진 기동 시 1개.
func NewManager() *Manager {
	m := &Manager{rooms: map[string]*Room{}, cmd: make(chan func())}
	go func() {
		for fn := range m.cmd {
			fn()
		}
	}()
	return m
}

// exec — 목록 고루틴에서 실행(완료까지 대기).
func (m *Manager) exec(fn func()) {
	ok := make(chan struct{})
	m.cmd <- func() { fn(); close(ok) }
	<-ok
}

// room — 있으면 돌려주고, 없으면 입장권 기준(cap·end)으로 만든다.
func (m *Manager) room(t signal.Ticket) *Room {
	var r *Room
	m.exec(func() {
		r = m.rooms[t.Room]
		if r == nil {
			var end time.Time
			if t.End > 0 {
				end = time.Unix(t.End, 0)
			}
			r = NewRoom(t.Room, t.Cap, end)
			m.rooms[t.Room] = r
		}
	})
	return r
}

// Join — signal.Handler. 방을 찾거나 만들고 Room.Join. M1 에서 구현(응답 iceServers·기존 producers 채우기).
func (m *Manager) Join(s signal.Session, t signal.Ticket) (signal.JoinRes, *signal.Error) {
	if _, err := m.room(t).Join(t, s); err != nil {
		return signal.JoinRes{}, err
	}
	return signal.JoinRes{}, errTODO("M1")
}

// Request — signal.Handler. 메서드 이름(signal.M*)으로 방 명령에 분배. M1 에서 구현.
func (m *Manager) Request(s signal.Session, method string, d json.RawMessage) (any, *signal.Error) {
	return nil, signal.Errf(signal.CodeNotFound, "미구현 메서드: "+method)
}

// Left — signal.Handler. 세션이 속한 방에서 Leave. M1 에서 구현(세션→방·peer 매핑).
func (m *Manager) Left(s signal.Session) {}
