// 입장권 — JWT 압축 직렬화, HS256 고정(헤더 alg 불신), 수명 60초·오차 5초·jti 일회용·aud "seminar-media"(PRD_02 5.3·D-11). C-8 승인 대기.
package signal

import (
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

const (
	Audience  = "seminar-media"        // aud 고정값 — 엔진 이름과 무관(변경은 C-8 확인 때)
	TicketTTL = 60 * time.Second       // 수명(C-8 승인 대기)
	ClockSkew = 5 * time.Second        // 시계 오차 허용
	FailDelay = 200 * time.Millisecond // 검증 실패 시 지연 후 오류
)

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
type Verifier struct {
	secret []byte
	mu     sync.Mutex
	seen   map[string]int64 // jti → exp
}

// NewVerifier — secret 은 MEDIA_TOKEN_SECRET(32바이트 이상).
func NewVerifier(secret []byte) *Verifier {
	return &Verifier{secret: secret, seen: map[string]int64{}}
}

// Verify — 서명·aud·exp/iat(오차 5초)·jti 1회 검사. 실패 시 FailDelay 뒤 TICKET_INVALID/TICKET_EXPIRED.
// M5 에서 구현 — 지금은 모두 거부.
func (v *Verifier) Verify(raw string, now time.Time) (Ticket, error) {
	time.Sleep(FailDelay)
	return Ticket{}, Errf(CodeTicketInvalid, "입장권 검증 미구현(M5)")
}

// Sign — HS256 서명(개발용 입장권 MEDIA_DEV_TICKET·테스트). 운영 발급은 Next /api/media/ticket. M5 에서 구현.
func Sign(t Ticket, secret []byte) (string, error) {
	return "", Errf(CodeInternal, "입장권 서명 미구현(M5)")
}
