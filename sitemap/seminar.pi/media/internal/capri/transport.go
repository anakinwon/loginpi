// Transport — PC 1개(발행 = 클라이언트 offer, 구독 = 서버 offer, PRD_02 D-2). 빈 인터셉터 API(S-1)·UDP mux 단일 포트·trickle 보관.
// pion 콜백은 pion 고루틴에서 불린다 — 상태 변경이 필요하면 호출자(bora)가 방 명령 채널로 넘긴다(D-10).
package capri

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
)

// Dir — PC 방향.
type Dir uint8

const (
	Publish   Dir = iota // 클라이언트 offer → ApplyOffer
	Subscribe            // 서버 offer → CreateOffer/ApplyAnswer
)

// Config — env MEDIA_UDP_PORT·MEDIA_PUBLIC_IP. Loopback 은 같은 기기 시험용(루프백 후보 포함).
type Config struct {
	UDPPort  int
	PublicIP string
	Loopback bool
}

// 출력 코덱 — MediaEngine 등록값과 같아야 TrackLocal 이 바인딩된다(D-13 VP8·Opus 만).
var (
	CodecVP8  = webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8, ClockRate: 90000}
	CodecOpus = webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2}
)

// NewAPI — S-1 : MediaEngine 에 VP8·Opus 만 등록하고 **빈** InterceptorRegistry 를 명시적으로 넘긴다.
// ⚠ pion v4 NewAPI 는 레지스트리를 안 넘기면 기본 인터셉터(NACK·TWCC·SR/RR 등)를 자동 등록한다 — 생략 금지(TROUBLESHOOT 2026-10-25).
// 영상 피드백은 nack·nack pli·ccm fir·goog-remb(우리 모듈이 처리), transport-cc 는 협상하지 않는다(D-7).
func NewAPI(cfg Config) (*webrtc.API, error) {
	m := &webrtc.MediaEngine{}
	fb := []webrtc.RTCPFeedback{{Type: "nack"}, {Type: "nack", Parameter: "pli"}, {Type: "ccm", Parameter: "fir"}, {Type: "goog-remb"}}
	vp8 := CodecVP8
	vp8.RTCPFeedback = fb
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{RTPCodecCapability: vp8, PayloadType: 96}, webrtc.RTPCodecTypeVideo); err != nil {
		return nil, err
	}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{RTPCodecCapability: CodecOpus, PayloadType: 111}, webrtc.RTPCodecTypeAudio); err != nil {
		return nil, err
	}
	// D-12 M4 : 하류(서버 송신 = sendonly)에만 abs-send-time — 청중 REMB 산출 입력. 값은 jeju 가 패킷마다 새로 쓴다.
	if err := m.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: AbsSendTimeURI},
		webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverDirectionSendonly); err != nil {
		return nil, err
	}
	// 후속 G : 상류(발행 PC = recvonly) 음성에만 ssrc-audio-level(RFC 6464) — 인터셉터가 아니라 MediaEngine 확장 협상만이다(S-1 유지).
	// 값 해석은 santorini(rtpx.AudioLevel)가 하고, 하류로는 내보내지 않는다(레이어가 들어온 확장을 버림, D-12).
	if err := m.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: AudioLevelURI},
		webrtc.RTPCodecTypeAudio, webrtc.RTPTransceiverDirectionRecvonly); err != nil {
		return nil, err
	}
	const srtpReplayWindow = 512
	// 잘못된 값은 Gather 때가 아니라 기동 때(소켓을 열기 전) 막는다
	if cfg.PublicIP != "" && net.ParseIP(cfg.PublicIP) == nil {
		return nil, fmt.Errorf("MEDIA_PUBLIC_IP 형식 오류: %q", cfg.PublicIP)
	}
	se := webrtc.SettingEngine{}
	if cfg.UDPPort > 0 {
		conn, err := net.ListenUDP("udp", &net.UDPAddr{Port: cfg.UDPPort})
		if err != nil {
			return nil, err
		}
		se.SetICEUDPMux(webrtc.NewICEUDPMux(nil, conn))
	}
	if cfg.PublicIP != "" {
		// 공인 IP 를 host 후보로 '추가'(Append) — 구 SetNAT1To1IPs 는 사설 후보를 공인 IP 로 '바꿔'(Replace)
		// 같은 공유기 안 단말(예 : 집 PC)이 헤어핀 NAT 에 의존하다 ICE_FAILED 로 끊겼다(2026-10-27 실기기).
		// LAN 후보를 남기면 집 안 단말은 직접, 외부 단말은 공인 IP 로 붙는다. 부작용 : 가상 어댑터 주소도 SDP 에 노출된다.
		if err := se.SetICEAddressRewriteRules(webrtc.ICEAddressRewriteRule{
			External:        []string{cfg.PublicIP},
			AsCandidateType: webrtc.ICECandidateTypeHost,
			Mode:            webrtc.ICEAddressRewriteAppend,
		}); err != nil {
			return nil, err
		}
	}
	se.SetIncludeLoopbackCandidate(cfg.Loopback)
	// D-5 : RTX 없이 같은 SSRC 재전송 — 늦게 온 재전송이 SRTP 재생 방지 창에 걸리지 않게 넓힌다 [TBD : M2 실측 — 창 크기]
	se.SetSRTPReplayProtectionWindow(srtpReplayWindow)
	se.SetSRTCPReplayProtectionWindow(srtpReplayWindow)
	return webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithSettingEngine(se),
		webrtc.WithInterceptorRegistry(&interceptor.Registry{})), nil
}

// AbsSendTimeURI — abs-send-time 헤더 확장(RFC 5285 형식, WebRTC 실험 확장).
const AbsSendTimeURI = "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time"

// AbsSendTimeID — 구독 sender 에 협상된 abs-send-time 확장 ID(answer 적용 뒤에 부른다). 협상 안 됐으면 0.
func AbsSendTimeID(s *webrtc.RTPSender) uint8 {
	if s == nil {
		return 0
	}
	for _, h := range s.GetParameters().HeaderExtensions {
		if h.URI == AbsSendTimeURI && h.ID > 0 && h.ID < 15 { // 1바이트 헤더 범위
			return uint8(h.ID)
		}
	}
	return 0
}

// AudioLevelURI — rtpx.AudioLevelURI 와 같은 값(capri 는 내부 의존이 없어 따로 둔다 — archtest 구조도).
const AudioLevelURI = "urn:ietf:params:rtp-hdrext:ssrc-audio-level"

// AudioLevelID — 발행 PC 수신기에 협상된 ssrc-audio-level 확장 ID(OnTrack 뒤에 부른다). 협상 안 됐으면 0.
func AudioLevelID(rx *webrtc.RTPReceiver) uint8 {
	if rx == nil {
		return 0
	}
	for _, h := range rx.GetParameters().HeaderExtensions {
		if h.URI == AudioLevelURI && h.ID > 0 && h.ID < 256 {
			return uint8(h.ID)
		}
	}
	return 0
}

// RTCPSink — 구독 PC 의 트랙별 RTCP 수신자(jeju.Consumer 가 구현). 호출은 capri RTCP 읽기 고루틴 → 구현은 채널로 넘겨야 한다(D-10).
type RTCPSink interface {
	OnRTCP(pkts []rtcp.Packet)
}

// Transport — PC 1개.
type Transport struct {
	dir Dir
	pc  *webrtc.PeerConnection

	mu      sync.Mutex
	pending []webrtc.ICECandidateInit // remote SDP 전에 도착한 후보

	remb atomic.Pointer[func(bps float32, ssrcs []uint32)]
}

// New — api(빈 인터셉터)로 PC 생성.
func New(api *webrtc.API, dir Dir, ice []webrtc.ICEServer) (*Transport, error) {
	pc, err := api.NewPeerConnection(webrtc.Configuration{ICEServers: ice})
	if err != nil {
		return nil, err
	}
	return &Transport{dir: dir, pc: pc}, nil
}

func (t *Transport) Dir() Dir { return t.dir }

// setRemote — remote SDP 적용 후 보관해 둔 후보를 넣는다.
func (t *Transport) setRemote(d webrtc.SessionDescription) error {
	if err := t.pc.SetRemoteDescription(d); err != nil {
		return err
	}
	t.mu.Lock()
	p := t.pending
	t.pending = nil
	t.mu.Unlock()
	for _, c := range p {
		_ = t.pc.AddICECandidate(c)
	}
	return nil
}

// ApplyOffer — 발행 PC : 클라이언트 offer 적용 후 answer(후보는 trickle 로 따로 간다).
func (t *Transport) ApplyOffer(sdp string) (answer string, err error) {
	if err = t.setRemote(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: sdp}); err != nil {
		return "", err
	}
	a, err := t.pc.CreateAnswer(nil)
	if err != nil {
		return "", err
	}
	if err = t.pc.SetLocalDescription(a); err != nil {
		return "", err
	}
	return t.pc.LocalDescription().SDP, nil
}

// CreateOffer — 구독 PC : 서버 offer(트랙이 연달아 생기면 호출자가 200ms 묶음, 응답 대기 중이면 호출자가 미룬다).
func (t *Transport) CreateOffer() (sdp string, err error) {
	o, err := t.pc.CreateOffer(nil)
	if err != nil {
		return "", err
	}
	if err = t.pc.SetLocalDescription(o); err != nil {
		return "", err
	}
	return t.pc.LocalDescription().SDP, nil
}

// ApplyAnswer — 구독 PC : 클라이언트 answer.
func (t *Transport) ApplyAnswer(sdp string) error {
	return t.setRemote(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: sdp})
}

// AddCandidate — remote SDP 전에 도착하면 보관했다가 적용.
func (t *Transport) AddCandidate(c webrtc.ICECandidateInit) error {
	t.mu.Lock()
	if t.pc.RemoteDescription() == nil {
		t.pending = append(t.pending, c)
		t.mu.Unlock()
		return nil
	}
	t.mu.Unlock()
	return t.pc.AddICECandidate(c)
}

// OnCandidate — 서버 ICE 후보를 trickle 로 보낼 콜백.
func (t *Transport) OnCandidate(fn func(webrtc.ICECandidateInit)) {
	t.pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil {
			fn(c.ToJSON())
		}
	})
}

// OnConnected — ICE·DTLS 연결 완료 콜백(구독 트랙 전송 시작은 이후, REA_01 5.9).
func (t *Transport) OnConnected(fn func()) {
	t.pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		if s == webrtc.PeerConnectionStateConnected {
			fn()
		}
	})
}

// OnTrack — 발행 PC 수신 트랙(rid 별). 호출자가 santorini.Producer.AddLayer 로 넘긴다.
func (t *Transport) OnTrack(fn func(tr *webrtc.TrackRemote, rx *webrtc.RTPReceiver)) {
	t.pc.OnTrack(fn)
}

// ReceiverMid — 수신기가 속한 m-line 의 mid(produce 요청과 짝 맞추기).
func (t *Transport) ReceiverMid(rx *webrtc.RTPReceiver) string {
	for _, tr := range t.pc.GetTransceivers() {
		if tr.Receiver() == rx {
			return tr.Mid()
		}
	}
	return ""
}

// SenderMid — 송신기의 mid(offer 생성 뒤에 정해진다 — consumerCreated 알림용).
func (t *Transport) SenderMid(s *webrtc.RTPSender) string {
	for _, tr := range t.pc.GetTransceivers() {
		if tr.Sender() == s {
			return tr.Mid()
		}
	}
	return ""
}

// AddTrack — 구독 PC 에 Consumer 출력 트랙 추가 + 그 sender 의 RTCP 를 sink 로 분배(REMB 는 OnREMB 로도).
func (t *Transport) AddTrack(track webrtc.TrackLocal, sink RTCPSink) (*webrtc.RTPSender, error) {
	s, err := t.pc.AddTrack(track)
	if err != nil {
		return nil, err
	}
	go func() {
		for {
			pkts, _, err := s.ReadRTCP()
			if err != nil {
				return // sender 중지·PC 닫힘
			}
			if fn := t.remb.Load(); fn != nil {
				for _, p := range pkts {
					if r, ok := p.(*rtcp.ReceiverEstimatedMaximumBitrate); ok {
						(*fn)(r.Bitrate, r.SSRCs)
					}
				}
			}
			sink.OnRTCP(pkts)
		}
	}()
	return s, nil
}

// RemoveTrack — Consumer 닫힘 시.
func (t *Transport) RemoveTrack(s *webrtc.RTPSender) error { return t.pc.RemoveTrack(s) }

// OnREMB — 구독 PC 로 들어온 REMB → bwe.Allocator(M4 가 내용을 채운다).
func (t *Transport) OnREMB(fn func(bps float32, ssrcs []uint32)) { t.remb.Store(&fn) }

// WriteRTCP — 발행 PC 로 RR·REMB·NACK·PLI, 구독 PC 로 SR 송신(santorini.RTCPWriter 를 만족).
func (t *Transport) WriteRTCP(pkts []rtcp.Packet) error { return t.pc.WriteRTCP(pkts) }

// Close — PC 닫기. 연쇄 정리(Producer/Consumer)는 bora 가 한다.
func (t *Transport) Close() error { return t.pc.Close() }
