// Transport 계약 — 발행 PC 와 구독 PC 를 같은 타입으로, 방향(Dir)으로 구분한다. 본문은 M1 에서 구현.
package capri

import (
	"errors"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

var errTODO = errors.New("capri: M1 에서 구현")

// Dir — PC 방향.
type Dir uint8

const (
	Publish   Dir = iota // 클라이언트 offer → ApplyOffer
	Subscribe            // 서버 offer → CreateOffer/ApplyAnswer
)

// Config — UDP mux 단일 포트·NAT 1:1 IP 등(env MEDIA_UDP_PORT·MEDIA_PUBLIC_IP). NewAPI 는 M1 이 cmd/galapagos newAPI 를 옮겨 온다(빈 레지스트리 테스트 포함).
type Config struct {
	UDPPort  int
	PublicIP string
}

// RTCPSink — 구독 PC 의 트랙별 RTCP 수신자(jeju.Consumer 가 구현). 호출은 capri RTCP 읽기 고루틴 → 구현은 채널로 넘겨야 한다(D-10).
type RTCPSink interface {
	OnRTCP(pkts []rtcp.Packet)
}

// Transport — PC 1개.
type Transport struct {
	dir Dir
	pc  *webrtc.PeerConnection
}

// New — api(빈 인터셉터)로 PC 생성.
func New(api *webrtc.API, dir Dir, ice []webrtc.ICEServer) (*Transport, error) { return nil, errTODO }

func (t *Transport) Dir() Dir { return t.dir }

// ApplyOffer — 발행 PC : 클라이언트 offer 적용 후 answer.
func (t *Transport) ApplyOffer(sdp string) (answer string, err error) { return "", errTODO }

// CreateOffer — 구독 PC : 서버 offer(트랙이 연달아 생기면 호출자가 200ms 묶음).
func (t *Transport) CreateOffer() (sdp string, err error) { return "", errTODO }

// ApplyAnswer — 구독 PC : 클라이언트 answer.
func (t *Transport) ApplyAnswer(sdp string) error { return errTODO }

// AddCandidate — remote SDP 전에 도착하면 보관했다가 적용.
func (t *Transport) AddCandidate(c webrtc.ICECandidateInit) error { return errTODO }

// OnCandidate — 서버 ICE 후보를 trickle 로 보낼 콜백.
func (t *Transport) OnCandidate(fn func(webrtc.ICECandidateInit)) {}

// OnConnected — ICE·DTLS 연결 완료 콜백(구독 트랙 연결은 이후, Galène 5.9).
func (t *Transport) OnConnected(fn func()) {}

// OnTrack — 발행 PC 수신 트랙(rid 별). 호출자가 santorini.Producer.AddLayer 로 넘긴다.
func (t *Transport) OnTrack(fn func(tr *webrtc.TrackRemote, rx *webrtc.RTPReceiver)) {}

// AddTrack — 구독 PC 에 Consumer 출력 트랙 추가 + 그 sender 의 RTCP 를 sink 로 분배.
func (t *Transport) AddTrack(track webrtc.TrackLocal, sink RTCPSink) (*webrtc.RTPSender, error) {
	return nil, errTODO
}

// RemoveTrack — Consumer 닫힘 시.
func (t *Transport) RemoveTrack(s *webrtc.RTPSender) error { return errTODO }

// OnREMB — 구독 PC 로 들어온 REMB → bwe.Allocator(M4 가 연결).
func (t *Transport) OnREMB(fn func(bps float32, ssrcs []uint32)) {}

// WriteRTCP — 발행 PC 로 RR·REMB·NACK·PLI 송신(santorini.RTCPWriter 를 만족).
func (t *Transport) WriteRTCP(pkts []rtcp.Packet) error { return errTODO }

// Close — PC 닫기. 연쇄 정리(Producer/Consumer)는 bora 가 한다.
func (t *Transport) Close() error { return nil }
