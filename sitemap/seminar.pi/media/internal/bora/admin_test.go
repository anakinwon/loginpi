// 방 관리 API 테스트 — Bearer 인증·키 미설정 시 꺼짐·방 열기/목록/종료·입력 검증(네트워크 없이 httptest).
package bora

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAdminHandler(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	m := NewManager()
	h := AdminHandler(m, secret)
	auth := "Bearer " + string(secret)

	cases := []struct {
		name, method, path, body, auth string
		want                           int
	}{
		{"인증 없음", "GET", "/admin/rooms", "", "", 401},
		{"키 틀림", "GET", "/admin/rooms", "", "Bearer wrong", 401},
		{"방 열기", "POST", "/admin/rooms", `{"id":"room-1","cap":31}`, auth, 201},
		{"중복 열기", "POST", "/admin/rooms", `{"id":"room-1","cap":31}`, auth, 409},
		{"정원 0", "POST", "/admin/rooms", `{"id":"room-2","cap":0}`, auth, 400},
		{"ID 경로 문자", "POST", "/admin/rooms", `{"id":"../x","cap":5}`, auth, 400},
		{"없는 방 종료", "DELETE", "/admin/rooms/none", "", auth, 404},
		{"방 종료", "DELETE", "/admin/rooms/room-1", "", auth, 204},
		{"카운터", "GET", "/admin/metrics", "", auth, 200},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(c.method, c.path, strings.NewReader(c.body))
			if c.auth != "" {
				req.Header.Set("Authorization", c.auth)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("%d want %d (%s)", rec.Code, c.want, rec.Body)
			}
		})
	}

	m.OpenRoom("b", 3, time.Time{})
	m.OpenRoom("a", 2, time.Time{})
	req := httptest.NewRequest("GET", "/admin/rooms", nil)
	req.Header.Set("Authorization", auth)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var got []RoomInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got) != 2 || got[0].ID != "a" || got[1].Cap != 3 {
		t.Fatalf("목록 %s", rec.Body)
	}
}

func TestAdminDisabledWithoutSecret(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/admin/rooms", nil)
	req.Header.Set("Authorization", "Bearer ")
	AdminHandler(NewManager(), nil).ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("키 없음인데 %d", rec.Code)
	}
}

// 무대 역할 조회(D-1) — 접속 중 sub 의 세션 역할, 방·접속 없으면 404, 인증 필수
func TestAdminPeerRole(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	m := NewManager()
	v := newV11(t)
	v.r.exec(func() {
		v.r.peers["N"].Ticket.Sub = "usr-n"
		v.r.peers["A1"].Ticket.Sub = "usr-a"
	})
	m.exec(func() { m.rooms["v11"] = v.r })
	h := AdminHandler(m, secret)
	for _, c := range []struct {
		path, auth, role string
		want             int
	}{
		{"/admin/rooms/v11/peers/usr-n", "Bearer " + string(secret), "panel", 200},
		{"/admin/rooms/v11/peers/usr-a", "Bearer " + string(secret), "audience", 200},
		{"/admin/rooms/v11/peers/none", "Bearer " + string(secret), "", 404},
		{"/admin/rooms/nope/peers/usr-n", "Bearer " + string(secret), "", 404},
		{"/admin/rooms/v11/peers/usr-n", "", "", 401},
	} {
		req := httptest.NewRequest("GET", c.path, nil)
		if c.auth != "" {
			req.Header.Set("Authorization", c.auth)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		var got struct {
			Role      string
			Presenter bool
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		if rec.Code != c.want || got.Role != c.role || got.Presenter != (c.want == 200) {
			t.Errorf("%s : %d %+v 기대 %d %q", c.path, rec.Code, got, c.want, c.role)
		}
	}
	// 발표자가 나가면 presenter false
	v.r.exec(func() { delete(v.r.peers, "P") })
	if info, ok := m.PeerRole("v11", "usr-n"); !ok || info.Presenter || info.Role != "panel" {
		t.Errorf("발표자 퇴장 뒤 %+v %v", info, ok)
	}
}
