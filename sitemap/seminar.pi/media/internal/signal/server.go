// WebSocket /signal 서버 — RFC 6455 를 표준 라이브러리(net/http Hijack)로 직접 구현한다(외부 의존 금지). M1 에서 구현.
package signal

import "net/http"

// NewServer — /signal 핸들러. 연결마다 세션 고루틴 1개 : JoinTimeout 안에 join → v.Verify → h.Join, 이후 h.Request 로 위임.
// M1 : 아직 501.
func NewServer(h Handler, v *Verifier) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "signal: M1 에서 구현", http.StatusNotImplemented)
	})
}
