// 방 관리 API — 방 목록·강제 종료(화면 서버 관리 화면용, M5). 인증은 MEDIA_TOKEN_SECRET 기반 [TBD : M5 — 관리자 입장권 형식].
package bora

import (
	"net/http"
	"time"
)

// RoomInfo — 방 요약(관리 화면).
type RoomInfo struct {
	ID        string    `json:"id"`
	Cap       int       `json:"cap"`
	Peers     int       `json:"peers"`
	Producers int       `json:"producers"`
	End       time.Time `json:"end,omitempty"`
}

// Rooms — 방 목록. M5 에서 구현.
func (m *Manager) Rooms() []RoomInfo { return nil }

// CloseRoom — 방 강제 종료(참가자에게 ROOM_CLOSED). 없으면 false. M5 에서 구현.
func (m *Manager) CloseRoom(id string) bool { return false }

// AdminHandler — /admin/rooms HTTP API(cmd/galapagos 가 마운트). M5 에서 구현.
func AdminHandler(m *Manager, secret []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "bora admin: M5 에서 구현", http.StatusNotImplemented)
	})
}
