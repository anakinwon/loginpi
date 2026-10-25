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
