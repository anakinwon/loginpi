// 입장권 — JWT 압축 직렬화, HS256 고정(헤더 alg 불신), 수명 60초·오차 5초·jti 일회용·aud "seminar-media"(PRD_02 5.3·D-11, REA_01 5.11).
// 수명·jti 일회용·같은 sub 재입장 정책은 모두 C-8 마스터 승인 대기. 외부 JWT 라이브러리 없이 crypto/hmac 로 직접 구현.
package signal

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

// Role — 발행 권한.
type Role string

const (
	RolePresenter Role = "presenter"
	RolePanel     Role = "panel"
	RoleAudience  Role = "audience"
)

// CanProduce — presenter·panel 만 발행.
func (r Role) CanProduce() bool { return r == RolePresenter || r == RolePanel }

func (r Role) valid() bool { return r == RolePresenter || r == RolePanel || r == RoleAudience }

const (
	Audience  = "seminar-media"        // aud 고정값 — 엔진 이름과 무관(변경은 C-8 확인 때)
	TicketTTL = 60 * time.Second       // 수명(C-8 승인 대기)
	ClockSkew = 5 * time.Second        // 시계 오차 허용(REA_01 5.11)
	FailDelay = 200 * time.Millisecond // 검증 실패 시 지연 후 오류(추측 공격 속도 제한, REA_01 5.11)
	MinSecret = 32                     // MEDIA_TOKEN_SECRET 최소 길이(Next env.ts 와 같음)
)

// ReplaceOnRejoin — 같은 방에 같은 sub 가 다시 들어오면 기존 세션을 DUPLICATE_SESSION 으로 닫고 새 세션을 받는다(PRD_02 5.3).
// false 면 새 입장을 거부. bora.Room.Join(M1)이 읽는 정책 훅 — C-8 마스터 승인 대기.
var ReplaceOnRejoin = true

// jwtHeader — 서명 시 쓰는 유일한 헤더. 검증은 alg=="HS256" 만 받는다(none·RS 혼동 공격 차단).
var jwtHeader = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

// Ticket — 입장권 클레임(JSON 이름 = JWT 클레임 이름). Next 발급 쪽(src/lib/media-ticket.ts)과 같은 이름을 쓴다.
type Ticket struct {
	Aud  string `json:"aud"`
	Room string `json:"room"`
	Sub  string `json:"sub"` // seminar.pi 사용자 UUID
	Name string `json:"name"`
	Role Role   `json:"role"`
	Cap  int    `json:"cap"` // 방 정원(첫 목표 31)
	Iat  int64  `json:"iat"`
	Exp  int64  `json:"exp"`
	Jti  string `json:"jti"`           // 128비트 무작위
	End  int64  `json:"end,omitempty"` // 방 종료 시각(선택)
}

// Verifier — 서명 키 + jti 재사용 캐시(exp 까지). 여러 세션 고루틴이 부르므로 잠금으로 보호.
// ponytail: jti 캐시는 프로세스 메모리 — 엔진 1대 전제. 여러 대로 늘리면 방 단위 고정 라우팅 또는 공유 저장소(Redis 등)가 필요하고,
// 재기동하면 캐시가 비어 수명(60초+5초) 안의 입장권 1회 재사용 창이 생긴다.
type Verifier struct {
	secret []byte
	delay  time.Duration // 실패 지연(테스트는 0)
	mu     sync.Mutex
	seen   map[string]int64 // jti → exp
}

// NewVerifier — secret 은 MEDIA_TOKEN_SECRET(32바이트 이상). 짧으면 모든 입장권을 거부한다.
func NewVerifier(secret []byte) *Verifier {
	return &Verifier{secret: secret, delay: FailDelay, seen: map[string]int64{}}
}

// Verify — 서명·aud·exp/iat(오차 5초)·jti 1회 검사. 실패 시 FailDelay 뒤 TICKET_INVALID/TICKET_EXPIRED/ROOM_CLOSED.
// 반환 error 는 항상 *Error.
func (v *Verifier) Verify(raw string, now time.Time) (Ticket, error) {
	t, e := v.verify(raw, now)
	if e != nil {
		time.Sleep(v.delay)
		return Ticket{}, e
	}
	return t, nil
}

func (v *Verifier) verify(raw string, now time.Time) (Ticket, *Error) {
	bad := func(msg string) (Ticket, *Error) { return Ticket{}, Errf(CodeTicketInvalid, msg) }
	if len(v.secret) < MinSecret {
		return bad("서명 키 미설정")
	}
	if len(raw) > 4096 {
		return bad("입장권 길이 초과")
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return bad("형식 오류")
	}
	// 서명 먼저 — 서명이 맞기 전에는 헤더·본문 내용을 믿지 않는다
	sig, err := base64.RawURLEncoding.Strict().DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac(v.secret, parts[0]+"."+parts[1])) {
		return bad("서명 불일치")
	}
	var h struct {
		Alg string `json:"alg"`
	}
	if !decodePart(parts[0], &h) || h.Alg != "HS256" {
		return bad("알고리즘 불허")
	}
	var t Ticket
	if !decodePart(parts[1], &t) {
		return bad("클레임 형식 오류")
	}
	switch {
	case t.Aud != Audience:
		return bad("aud 불일치")
	case t.Exp == 0 || t.Iat == 0:
		return bad("exp·iat 필수")
	case t.Exp-t.Iat > int64(TicketTTL/time.Second):
		return bad("수명 초과 발급")
	case t.Room == "" || t.Sub == "" || t.Jti == "" || len(t.Jti) > 64:
		return bad("room·sub·jti 필수")
	case !t.Role.valid():
		return bad("역할 오류")
	case t.Cap <= 0:
		return bad("정원 오류")
	}
	skew := int64(ClockSkew / time.Second)
	n := now.Unix()
	if t.Iat > n+skew {
		return bad("발급 시각이 미래")
	}
	if n > t.Exp+skew {
		return Ticket{}, Errf(CodeTicketExpired, "입장권 만료")
	}
	if t.End > 0 && n > t.End {
		return Ticket{}, Errf(CodeRoomClosed, "방 종료 시각 지남")
	}
	if !v.useJTI(t.Jti, t.Exp+skew, n) {
		return bad("이미 사용한 입장권")
	}
	return t, nil
}

// useJTI — 처음 보는 jti 면 기록하고 true. 지난 항목은 그때그때 지운다.
// ponytail: 매 호출 전체 순회 — 60초 창 안 입장 수(수백)면 충분, 수만 건이면 만료 시각 순 힙으로.
func (v *Verifier) useJTI(jti string, until, now int64) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	for k, exp := range v.seen {
		if exp < now {
			delete(v.seen, k)
		}
	}
	if _, ok := v.seen[jti]; ok {
		return false
	}
	v.seen[jti] = until
	return true
}

// Sign — HS256 서명(개발용 입장권 MEDIA_DEV_TICKET·테스트). 운영 발급은 Next /api/media/ticket.
func Sign(t Ticket, secret []byte) (string, error) {
	if len(secret) < MinSecret {
		return "", Errf(CodeInternal, "서명 키가 32바이트 미만")
	}
	body, err := json.Marshal(t)
	if err != nil {
		return "", Errf(CodeInternal, "클레임 직렬화 실패")
	}
	in := jwtHeader + "." + base64.RawURLEncoding.EncodeToString(body)
	return in + "." + base64.RawURLEncoding.EncodeToString(mac(secret, in)), nil
}

func mac(secret []byte, in string) []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(in))
	return m.Sum(nil)
}

func decodePart(s string, dst any) bool {
	b, err := base64.RawURLEncoding.Strict().DecodeString(s)
	return err == nil && json.Unmarshal(b, dst) == nil
}
