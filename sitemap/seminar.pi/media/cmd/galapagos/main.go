// Galápagos — seminar.pi 자체 화상 엔진(SFU) 진입점. 설계 정본 docs/PRD_02_ENGINE_DESIGN.md, 단계 docs/PRD_01_MEDIA_ENGINE.md
// /signal(WebSocket)·/healthz·/admin/rooms(M5) + UDP mux 단일 포트. 실행 : MEDIA_DEV_TICKET=1 go run ./cmd/galapagos (환경변수는 media/OWNERSHIP.md 3절)
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"seminar.pi/media/internal/bora"
	"seminar.pi/media/internal/capri"
	"seminar.pi/media/internal/signal"
)

const (
	defaultListen  = ":7880"
	defaultUDPPort = 7882 // [TBD : 운영 VM 방화벽 확정 시]
	minSecretLen   = 32
)

// newMux — 엔진 HTTP 경로. 테스트도 같은 구성을 쓴다.
func newMux(m *bora.Manager, secret, adminSecret []byte) *http.ServeMux {
	mux := http.NewServeMux()
	mux.Handle("/signal", signal.NewServer(m, signal.NewVerifier(secret)))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/admin/", bora.AdminHandler(m, adminSecret)) // StripPrefix 없이 — MEDIA_ADMIN_SECRET 32자 미만이면 404(M5)
	return mux
}

func main() {
	secret := []byte(os.Getenv("MEDIA_TOKEN_SECRET"))
	if len(secret) < minSecretLen && !signal.DevTicketEnabled() {
		log.Fatalf("MEDIA_TOKEN_SECRET 은 %d자 이상 필수(개발용은 MEDIA_DEV_TICKET=1)", minSecretLen)
	}
	if signal.DevTicketEnabled() {
		log.Printf("⚠ 개발용 입장 허용(MEDIA_DEV_TICKET=1) — 운영 금지")
	} else if strings.TrimSpace(os.Getenv("MEDIA_ALLOWED_ORIGINS")) == "" {
		// fail-closed : 비어 있으면 Origin 검사가 꺼진다(SIGNAL_API 1절 '목록만 허용'). Pi Browser 포워딩 도메인 포함 여부 [TBD : 실기기]
		log.Fatalf("MEDIA_ALLOWED_ORIGINS 필수(쉼표 구분 Origin 목록, 개발용은 MEDIA_DEV_TICKET=1)")
	}

	cfg := capri.Config{UDPPort: defaultUDPPort, PublicIP: os.Getenv("MEDIA_PUBLIC_IP")}
	if v := os.Getenv("MEDIA_UDP_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			log.Fatalf("MEDIA_UDP_PORT 해석 실패: %v", err)
		}
		cfg.UDPPort = p
	}
	api, err := capri.NewAPI(cfg)
	if err != nil {
		log.Fatalf("API 구성 실패: %v", err)
	}

	var ice []signal.ICEServer
	if v := os.Getenv("MEDIA_ICE_SERVERS"); v != "" {
		if err := json.Unmarshal([]byte(v), &ice); err != nil {
			log.Fatalf("MEDIA_ICE_SERVERS JSON 해석 실패: %v", err)
		}
	}
	m := bora.NewManager()
	m.SetAPI(api, ice)

	addr := os.Getenv("MEDIA_LISTEN")
	if addr == "" {
		addr = defaultListen
	}
	log.Printf("Galápagos 대기 http %s · udp %d", addr, cfg.UDPPort)
	log.Fatal(http.ListenAndServe(addr, newMux(m, secret, []byte(os.Getenv("MEDIA_ADMIN_SECRET")))))
}
