// 입장권 서명·검증 표 테스트 — 만료·aud 불일치·alg 변조·jti 재사용·서명 변조·오차 경계(PRD_02 5.3).
package signal

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"
	"time"
)

var testSecret = []byte("0123456789abcdef0123456789abcdef")

func goodTicket(now time.Time, jti string) Ticket {
	return Ticket{Aud: Audience, Room: "r1", Sub: "u1", Name: "n", Role: RoleAudience, Cap: 31,
		Iat: now.Unix(), Exp: now.Add(TicketTTL).Unix(), Jti: jti}
}

func sign(t *testing.T, tk Ticket) string {
	s, err := Sign(tk, testSecret)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// resign — 헤더를 바꿔 같은 키로 다시 서명(alg 변조 공격 흉내).
func resign(raw, header string) string {
	p := strings.Split(raw, ".")
	h := base64.RawURLEncoding.EncodeToString([]byte(header))
	in := h + "." + p[1]
	return in + "." + base64.RawURLEncoding.EncodeToString(mac(testSecret, in))
}

func TestVerify(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	mod := func(f func(*Ticket)) Ticket { tk := goodTicket(now, "j"); f(&tk); return tk }

	cases := []struct {
		name string
		raw  func() string
		at   time.Time
		want ErrCode // "" = 통과
	}{
		{"정상", func() string { return sign(t, goodTicket(now, "a")) }, now, ""},
		{"만료 + 오차 경계 안", func() string { return sign(t, goodTicket(now, "b")) }, now.Add(TicketTTL + ClockSkew), ""},
		{"만료 + 오차 1초 넘음", func() string { return sign(t, goodTicket(now, "c")) }, now.Add(TicketTTL + ClockSkew + time.Second), CodeTicketExpired},
		{"iat 미래 5초 경계", func() string { return sign(t, goodTicket(now, "d")) }, now.Add(-ClockSkew), ""},
		{"iat 미래 6초", func() string { return sign(t, goodTicket(now, "e")) }, now.Add(-ClockSkew - time.Second), CodeTicketInvalid},
		{"aud 불일치", func() string { return sign(t, mod(func(k *Ticket) { k.Aud = "other" })) }, now, CodeTicketInvalid},
		{"exp 없음", func() string { return sign(t, mod(func(k *Ticket) { k.Exp = 0 })) }, now, CodeTicketInvalid},
		{"수명 60초 초과 발급", func() string { return sign(t, mod(func(k *Ticket) { k.Exp = k.Iat + 3600 })) }, now, CodeTicketInvalid},
		{"역할 오류", func() string { return sign(t, mod(func(k *Ticket) { k.Role = "admin" })) }, now, CodeTicketInvalid},
		{"jti 없음", func() string { return sign(t, mod(func(k *Ticket) { k.Jti = "" })) }, now, CodeTicketInvalid},
		{"방 종료 시각 지남", func() string { return sign(t, mod(func(k *Ticket) { k.Jti = "f"; k.End = now.Unix() - 1 })) }, now, CodeRoomClosed},
		{"alg none(서명 없음)", func() string {
			p := strings.Split(sign(t, goodTicket(now, "g")), ".")
			return base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none"}`)) + "." + p[1] + "."
		}, now, CodeTicketInvalid},
		{"alg HS512 로 재서명", func() string { return resign(sign(t, goodTicket(now, "h")), `{"alg":"HS512"}`) }, now, CodeTicketInvalid},
		{"서명 변조", func() string {
			s := sign(t, goodTicket(now, "i"))
			return s[:len(s)-2] + "AA"
		}, now, CodeTicketInvalid},
		{"본문 변조(역할 승격)", func() string {
			s := strings.Split(sign(t, goodTicket(now, "k")), ".")
			body, _ := base64.RawURLEncoding.DecodeString(s[1])
			body = []byte(strings.Replace(string(body), `"audience"`, `"presenter"`, 1))
			return s[0] + "." + base64.RawURLEncoding.EncodeToString(body) + "." + s[2]
		}, now, CodeTicketInvalid},
		{"조각 2개", func() string { return "a.b" }, now, CodeTicketInvalid},
	}
	v := NewVerifier(testSecret)
	v.delay = 0
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := v.Verify(c.raw(), c.at)
			assertCode(t, err, c.want)
		})
	}
}

func TestVerifyJTIOnce(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	v := NewVerifier(testSecret)
	v.delay = 0
	raw := sign(t, goodTicket(now, "same"))
	if _, err := v.Verify(raw, now); err != nil {
		t.Fatal(err)
	}
	_, err := v.Verify(raw, now.Add(time.Second))
	assertCode(t, err, CodeTicketInvalid)
	// 만료 뒤 그 입장권은 만료로 거부되고, 다음 정상 입장 때 옛 jti 가 캐시에서 지워진다
	later := now.Add(2 * TicketTTL)
	_, err = v.Verify(raw, later)
	assertCode(t, err, CodeTicketExpired)
	if _, err := v.Verify(sign(t, goodTicket(later, "next")), later); err != nil {
		t.Fatal(err)
	}
	if len(v.seen) != 1 {
		t.Fatalf("만료 jti 가 남음: %d", len(v.seen))
	}
}

// TestNodeInterop — Next src/lib/media-ticket.ts 와 같은 방식(Node crypto)으로 만든 입장권을 엔진이 받는지(한글 이름 포함).
func TestNodeInterop(t *testing.T) {
	const node = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJzZW1pbmFyLW1lZGlhIiwicm9vbSI6InIxIiwic3ViIjoidTEiLCJuYW1lIjoi7ZmN6ri464-ZIiwicm9sZSI6ImF1ZGllbmNlIiwiY2FwIjozMSwiaWF0IjoxODAwMDAwMDAwLCJleHAiOjE4MDAwMDAwNjAsImp0aSI6ImFiYyJ9.2JsVXH3QRCjV0btU1B6TdA09laM0EHUCMr8GNW-wpIk"
	v := NewVerifier(testSecret)
	v.delay = 0
	tk, err := v.Verify(node, time.Unix(1_800_000_010, 0))
	if err != nil || tk.Name != "홍길동" || tk.Role != RoleAudience || tk.Cap != 31 {
		t.Fatalf("%+v %v", tk, err)
	}
	// Go Sign 도 같은 바이트를 낸다(클레임 순서·인코딩 일치)
	if s, _ := Sign(tk, testSecret); s != node {
		t.Fatalf("Go 서명 불일치\n%s", s)
	}
}

func TestShortSecret(t *testing.T) {
	if _, err := Sign(Ticket{}, []byte("short")); err == nil {
		t.Fatal("짧은 키로 서명됨")
	}
	v := NewVerifier([]byte("short"))
	v.delay = 0
	_, err := v.Verify(sign(t, goodTicket(time.Unix(1_800_000_000, 0), "x")), time.Unix(1_800_000_000, 0))
	assertCode(t, err, CodeTicketInvalid)
}

func TestFailDelay(t *testing.T) {
	v := NewVerifier(testSecret)
	start := time.Now()
	if _, err := v.Verify("x.y.z", time.Now()); err == nil {
		t.Fatal("통과하면 안 됨")
	}
	if time.Since(start) < FailDelay {
		t.Fatal("실패 지연 없음")
	}
}

func assertCode(t *testing.T, err error, want ErrCode) {
	t.Helper()
	if want == "" {
		if err != nil {
			t.Fatalf("통과해야 함: %v", err)
		}
		return
	}
	var e *Error
	if !errors.As(err, &e) || e.Code != want {
		t.Fatalf("want %s, got %v", want, err)
	}
}
