// 방 관리 API — 방 목록·미리 열기(정원·종료 시각)·강제 종료(M5). 인증 = Authorization: Bearer <MEDIA_ADMIN_SECRET> [TBD : 화면 서버 내부 호출 전용 여부].
// 발표자 지정은 입장권 role(Next /api/media/ticket 이 결정)로 한다 — 엔진은 DB 를 모른다(PRD_02 5.3 경계).
package bora

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"sort"
	"time"

	"seminar.pi/media/internal/metrics"
	"seminar.pi/media/internal/signal"
)

// RoomInfo — 방 요약(관리 화면).
type RoomInfo struct {
	ID        string    `json:"id"`
	Cap       int       `json:"cap"`
	Peers     int       `json:"peers"`
	Producers int       `json:"producers"`
	End       time.Time `json:"end,omitempty"`
}

// Rooms — 방 목록(ID 순). 목록 고루틴에서 방을 복사한 뒤 각 방 고루틴에서 인원을 센다(목록 고루틴을 오래 잡지 않게).
func (m *Manager) Rooms() []RoomInfo {
	var rs []*Room
	m.exec(func() {
		for _, r := range m.rooms {
			rs = append(rs, r)
		}
	})
	out := make([]RoomInfo, 0, len(rs))
	for _, r := range rs {
		info := RoomInfo{ID: r.id}
		if r.exec(func() { info.Cap, info.End, info.Peers, info.Producers = r.cap, r.end, len(r.peers), len(r.producers) }) {
			out = append(out, info)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// OpenRoom — 방을 정원·종료 시각과 함께 연다(이후 입장권의 cap·end 는 무시, 비어도 정리하지 않음).
// 입장권으로 먼저 자동 생성된 방이면 관리자 값으로 덮어쓴다(청중 선점으로 정원·종료 시각을 못 정하는 일 방지). 이미 관리 API 로 연 방이면 false.
// 관리 API 는 MaxRooms 상한 밖이다(인증된 관리자 전용).
func (m *Manager) OpenRoom(id string, cap int, end time.Time) bool {
	ok := false
	m.exec(func() {
		r := m.rooms[id]
		if r == nil {
			r = NewRoom(id, cap, end)
			r.api, r.ice = m.api, m.ice // 없으면 첫 입장이 "엔진 API 미설정"으로 실패
			m.rooms[id] = r
		}
		r.exec(func() {
			if !r.opened {
				r.opened, r.cap, r.end, ok = true, cap, end, true
			}
		})
	})
	return ok
}

// CloseRoom — 방 강제 종료(참가자에게 ROOM_CLOSED 후 연쇄 정리). 없으면 false.
func (m *Manager) CloseRoom(id string) bool {
	var r *Room
	m.exec(func() {
		r = m.rooms[id]
		delete(m.rooms, id)
	})
	if r == nil {
		return false
	}
	shutRoom(r)
	return true
}

// shutRoom — 목록에서 뺀 방을 닫는다(참가자에게 ROOM_CLOSED 후 연쇄 정리).
func shutRoom(r *Room) {
	r.exec(func() {
		for _, p := range r.peers {
			if p.Session != nil {
				p.Session.Close(signal.CodeRoomClosed)
			}
		}
	})
	r.Close()
}

// AdminHandler — cmd/galapagos 가 "/admin/" 에 그대로(StripPrefix 없이) 마운트.
//
//	GET    /admin/rooms        방 목록
//	GET    /admin/metrics      엔진 전역 카운터(metrics.Global)
//	POST   /admin/rooms        {"id","cap","end"(유닉스 초, 선택)} 방 열기(자동 생성 방이면 값 덮어씀) → 201, 이미 관리 API 로 연 방이면 409
//	DELETE /admin/rooms/{id}   강제 종료 → 204, 없으면 404
//
// secret 이 32바이트 미만이면 API 전체를 끈다(404).
func AdminHandler(m *Manager, secret []byte) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin/rooms", func(w http.ResponseWriter, _ *http.Request) {
		adminJSON(w, http.StatusOK, m.Rooms())
	})
	mux.HandleFunc("GET /admin/metrics", func(w http.ResponseWriter, _ *http.Request) {
		adminJSON(w, http.StatusOK, metrics.Global.Snapshot())
	})
	mux.HandleFunc("POST /admin/rooms", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			ID  string `json:"id"`
			Cap int    `json:"cap"`
			End int64  `json:"end"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, req.Body, 4096)).Decode(&in) != nil ||
			!adminRoomID(in.ID) || in.Cap < 1 || in.Cap > 1000 || in.End < 0 {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		var end time.Time
		if in.End > 0 {
			end = time.Unix(in.End, 0)
		}
		if !m.OpenRoom(in.ID, in.Cap, end) {
			http.Error(w, "room exists", http.StatusConflict)
			return
		}
		w.WriteHeader(http.StatusCreated)
	})
	mux.HandleFunc("DELETE /admin/rooms/{id}", func(w http.ResponseWriter, req *http.Request) {
		if !m.CloseRoom(req.PathValue("id")) {
			http.NotFound(w, req)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	want := []byte("Bearer " + string(secret))
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if len(secret) < signal.MinSecret {
			http.NotFound(w, req)
			return
		}
		if subtle.ConstantTimeCompare([]byte(req.Header.Get("Authorization")), want) != 1 {
			time.Sleep(signal.FailDelay)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, req)
	})
}

func adminRoomID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, c := range id {
		if !(c == '-' || c == '_' || c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z') {
			return false
		}
	}
	return true
}

func adminJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
