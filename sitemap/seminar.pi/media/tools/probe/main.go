// M1 WAN 탐침 — 미디어 엔진(/signal)에 pion 봇 3개(발표자 P·청중 A1·청중→무대 A2)를 붙여 영상·음성 RTP 도달을 잰다(PRD_01 5절 M1).
// 현장 버그(2026-10-31) 재현 : 음성을 발행 중인 참가자(A2 panel·P)가 다른 사람의 음성을 받는가. 입장권은 직접 서명(MEDIA_TOKEN_SECRET — 출력 안 함).
// 실행 : cd media && go run ./tools/probe [-url wss://…/signal] [-dur 10s] — 결과표·판정은 표준 출력, 실패하면 종료 코드 1. 문서 media/docs/M1_WAN_PROBE.md
package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/signal"
)

const (
	defaultURL    = "wss://158.247.243.145.sslip.io/signal"
	defaultOrigin = "https://seminarz.vercel.app"
	reqTimeout    = 10 * time.Second
	passRatio     = 0.8 // 창 안에서 보낸 패킷 대비 받은 비율 하한
	videoEvery    = 33 * time.Millisecond
	audioEvery    = 20 * time.Millisecond
	videoSize     = 1000 // 실제 화면 패킷과 비슷한 크기(MTU 아래)
	audioSize     = 80
	keyEvery      = 30 // 영상 30프레임(약 1초)마다 키프레임
	wsMaxFrame    = 1 << 20
)

func main() {
	wsURL := flag.String("url", defaultURL, "시그널 주소(ws:// 또는 wss://)")
	origin := flag.String("origin", defaultOrigin, "WS Origin 헤더(엔진 MEDIA_ALLOWED_ORIGINS 안의 값)")
	dur := flag.Duration("dur", 10*time.Second, "측정 창 길이")
	warm := flag.Duration("warmup", 15*time.Second, "모든 트랙 첫 패킷 대기 상한")
	envFile := flag.String("env", "../.env.local", "MEDIA_TOKEN_SECRET·MEDIA_ADMIN_SECRET 를 읽을 파일(환경변수가 먼저)")
	flag.Parse()

	secret := secretFrom(*envFile, "MEDIA_TOKEN_SECRET")
	if len(secret) < signal.MinSecret {
		fmt.Println("MEDIA_TOKEN_SECRET 없음(32자 이상) — 환경변수 또는 -env 파일")
		os.Exit(2)
	}
	if *wsURL == defaultURL {
		fmt.Println("※ 운영 엔진 대상(기본값) — 다른 엔진은 -url")
	}
	ok := run(*wsURL, *origin, secret, *dur, *warm)
	fmt.Println(cleanup(*wsURL, secretFrom(*envFile, "MEDIA_ADMIN_SECRET")))
	if !ok {
		os.Exit(1)
	}
}

// 이번 실행의 방 ID(관리 API 정리 확인용)·시작 시각(로그 경과 표시).
var (
	room  = "probe-" + randHex(4)
	start = time.Now()
)

func run(wsURL, origin string, secret []byte, dur, warm time.Duration) bool {
	fmt.Printf("방 %s · %s · %s\n", room, wsURL, time.Now().Format(time.RFC3339))
	names := map[string]string{} // 엔진 peerId → 봇 이름(받은 트랙의 StreamID 가 발행자 peerId)
	var peers []*peer
	defer func() {
		for _, p := range peers {
			p.leave()
		}
	}()
	join := func(name string, role signal.Role) *peer {
		p, err := joinPeer(wsURL, origin, secret, name, role)
		if err != nil {
			fmt.Printf("%s 입장 실패: %v\n", name, err)
			return nil
		}
		peers = append(peers, p)
		names[p.id] = name
		return p
	}

	// 발표자 : 영상 + 음성 발행
	P := join("P", signal.RolePresenter)
	if P == nil {
		return false
	}
	pv, _ := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeVP8, ClockRate: 90000}, "video", "P")
	pa, _ := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2}, "audio", "P")
	if err := P.publish(pv, pa); err != nil {
		fmt.Println("P 발행 실패:", err)
		return false
	}
	// 청중 2명(발행 뒤 입장 = 늦은 합류자), A2 는 무대로 올려 음성 발행(현장 버그 : 발행 중인 사람이 남의 음성을 받는가)
	A1, A2 := join("A1", signal.RoleAudience), join("A2", signal.RoleAudience)
	if A1 == nil || A2 == nil {
		return false
	}
	if err := P.request(signal.MPeerSetRole, signal.SetRoleReq{PeerID: A2.id, Role: signal.RolePanel}, nil); err != nil {
		fmt.Println("A2 승격 실패:", err)
		return false
	}
	a2a, _ := webrtc.NewTrackLocalStaticRTP(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2}, "audio", "A2")
	if err := A2.publish(a2a); err != nil {
		fmt.Println("A2 발행 실패:", err)
		return false
	}

	stop := make(chan struct{})
	defer close(stop)
	sent := map[string]*atomic.Int64{"P/video": {}, "P/audio": {}, "A2/audio": {}}
	t0 := time.Now()
	go pump(stop, pv, videoEvery, 3000, videoSize, true, sent["P/video"])
	go pump(stop, pa, audioEvery, 960, audioSize, false, sent["P/audio"])
	go pump(stop, a2a, audioEvery, 960, audioSize, false, sent["A2/audio"])

	// 기대 수신 : 청중·무대 모두 발표자 영상·음성, 발표자·청중은 A2 음성(자기 것은 안 받음)
	want := map[*peer][]string{A1: {"P/video", "P/audio", "A2/audio"}, A2: {"P/video", "P/audio"}, P: {"A2/audio"}}
	key := func(p *peer, k string) *stat { return p.stat(k, names) }
	for end := time.Now().Add(warm); time.Now().Before(end); time.Sleep(100 * time.Millisecond) {
		all := true
		for p, ks := range want {
			for _, k := range ks {
				all = all && key(p, k).first.Load() != 0
			}
		}
		if all {
			break
		}
	}
	snap := func() map[string]int64 {
		m := map[string]int64{}
		for k, c := range sent {
			m["sent:"+k] = c.Load()
		}
		for p, ks := range want {
			for _, k := range ks {
				m[p.name+":"+k] = key(p, k).n.Load()
			}
		}
		return m
	}
	s0 := snap()
	time.Sleep(dur)
	s1 := snap()

	pass := true
	fmt.Printf("\n%-4s %-10s %8s %8s %6s %8s  %s\n", "수신", "출처/종류", "보냄", "받음", "비율", "첫패킷", "판정")
	for _, p := range []*peer{A1, A2, P} {
		for _, k := range want[p] {
			s, r := s1["sent:"+k]-s0["sent:"+k], s1[p.name+":"+k]-s0[p.name+":"+k]
			ratio := float64(r) / float64(max(s, 1))
			first := "-"
			if f := key(p, k).first.Load(); f != 0 {
				first = time.Duration(f - t0.UnixNano()).Round(10 * time.Millisecond).String()
			}
			v := "PASS"
			if ratio < passRatio {
				v, pass = "FAIL", false
			}
			fmt.Printf("%-4s %-10s %8d %8d %5.0f%% %8s  %s\n", p.name, k, s, r, ratio*100, first, v)
		}
	}
	fmt.Println("\nICE 선택 쌍(로컬 종류 → 원격 종류 주소):")
	for _, p := range peers {
		for _, x := range []struct {
			n  string
			pc *webrtc.PeerConnection
		}{{"sub", p.sub}, {"pub", p.pub}} {
			if x.pc != nil {
				fmt.Printf("  %s %s : %s\n", p.name, x.n, pairOf(x.pc))
			}
		}
	}
	fmt.Println("\n결과:", map[bool]string{true: "PASS", false: "FAIL"}[pass])
	return pass
}

// ── 봇 1개 = 시그널 세션 1개 + 구독 PC(+ 발행 PC) ──

type stat struct {
	n     atomic.Int64
	first atomic.Int64 // 첫 패킷 시각(UnixNano), 0 = 아직
}

type peer struct {
	name, id string
	ws       *wsConn
	ice      []webrtc.ICEServer
	ready    chan struct{} // 구독 PC 준비 끝(그 전 서버 offer 는 기다린다)
	subMu    sync.Mutex    // 서버 offer 처리 직렬화

	mu      sync.Mutex
	next    int64
	waiting map[int64]chan signal.Envelope
	sub     *webrtc.PeerConnection
	pub     *webrtc.PeerConnection
	pend    map[string][]webrtc.ICECandidateInit // remote SDP 전에 온 서버 후보
	got     map[string]*stat                     // "<엔진 peerId>/<kind>"
}

func joinPeer(wsURL, origin string, secret []byte, name string, role signal.Role) (*peer, error) {
	ws, err := dialWS(wsURL, origin)
	if err != nil {
		return nil, err
	}
	p := &peer{name: name, ws: ws, ready: make(chan struct{}), waiting: map[int64]chan signal.Envelope{},
		pend: map[string][]webrtc.ICECandidateInit{}, got: map[string]*stat{}}
	go p.readLoop()
	now := time.Now().Unix()
	tk, err := signal.Sign(signal.Ticket{Aud: signal.Audience, Room: room, Sub: room + "-" + name, Name: "probe-" + name, Role: role,
		Cap: 10, Iat: now, Exp: now + int64(signal.TicketTTL/time.Second), Jti: randHex(16)}, secret)
	if err != nil {
		return nil, err
	}
	var jr signal.JoinRes
	if err := p.request(signal.MJoin, signal.JoinReq{Ticket: tk}, &jr); err != nil {
		_ = ws.Close()
		return nil, err
	}
	p.id = jr.PeerID
	for _, s := range jr.IceServers { // 브라우저와 같게 join 응답의 ICE 서버를 쓴다
		p.ice = append(p.ice, webrtc.ICEServer{URLs: s.URLs, Username: s.Username, Credential: s.Credential})
	}
	sub, err := p.newPC("sub")
	if err != nil {
		return nil, err
	}
	sub.OnTrack(func(tr *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		st := p.stat(tr.StreamID()+"/"+tr.Kind().String(), nil)
		seen := make([]bool, 1<<16)
		for {
			pkt, _, err := tr.ReadRTP()
			if err != nil {
				return
			}
			if !fresh(seen, pkt.SequenceNumber) { // NACK 재전송 등 같은 순번은 한 번만 센다(손실을 가리지 않게)
				continue
			}
			st.first.CompareAndSwap(0, time.Now().UnixNano())
			st.n.Add(1)
		}
	})
	p.mu.Lock()
	p.sub = sub
	p.mu.Unlock()
	close(p.ready)
	fmt.Printf("%s 입장 role=%s ice=%d\n", name, jr.Role, len(jr.IceServers))
	return p, nil
}

// fresh — RTP 순번 s 를 처음 보면 true. 반 바퀴(32768) 앞 칸을 지워 16비트 순번이 한 바퀴 돌아도 다시 센다.
func fresh(seen []bool, s uint16) bool {
	seen[s+0x8000] = false
	if seen[s] {
		return false
	}
	seen[s] = true
	return true
}

// stat — 받은 트랙 통계. names 가 있으면 "P/video" 같은 봇 이름 키를 엔진 peerId 키로 바꿔 찾는다.
func (p *peer) stat(k string, names map[string]string) *stat {
	p.mu.Lock()
	defer p.mu.Unlock()
	if names != nil {
		for id, n := range names {
			if rest, ok := strings.CutPrefix(k, n+"/"); ok {
				k = id + "/" + rest
				break
			}
		}
	}
	if p.got[k] == nil {
		p.got[k] = &stat{}
	}
	return p.got[k]
}

func (p *peer) newPC(kind string) (*webrtc.PeerConnection, error) {
	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{ICEServers: p.ice}) // 기본 API(NACK·RR 인터셉터) = 브라우저에 가깝게
	if err != nil {
		return nil, err
	}
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c != nil {
			b, _ := json.Marshal(c.ToJSON())
			p.notify(signal.MTrickle, signal.Trickle{PC: kind, Candidate: b})
		}
	})
	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		fmt.Printf("  %s %s PC %s +%s\n", p.name, kind, s, time.Since(start).Round(time.Millisecond))
	})
	pc.OnICEConnectionStateChange(func(s webrtc.ICEConnectionState) {
		fmt.Printf("  %s %s ICE %s +%s\n", p.name, kind, s, time.Since(start).Round(time.Millisecond))
	})
	return pc, nil
}

// publish — 발행 PC offer → transport.publish → produce(트랙마다).
func (p *peer) publish(tracks ...*webrtc.TrackLocalStaticRTP) error {
	pc, err := p.newPC("pub")
	if err != nil {
		return err
	}
	for _, t := range tracks {
		tr, err := pc.AddTransceiverFromTrack(t, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly})
		if err != nil {
			return err
		}
		go func() { // 서버 RTCP(NACK·PLI·RR)를 읽어야 인터셉터가 돈다
			for {
				if _, _, err := tr.Sender().ReadRTCP(); err != nil {
					return
				}
			}
		}()
	}
	p.mu.Lock()
	p.pub = pc
	p.mu.Unlock()
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return err
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		return err
	}
	var ans signal.SDP
	if err := p.request(signal.MTransportPublish, signal.SDP{SDP: offer.SDP}, &ans); err != nil {
		return err
	}
	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: ans.SDP}); err != nil {
		return err
	}
	p.flush("pub")
	for _, tr := range pc.GetTransceivers() {
		kind := tr.Kind().String()
		src := map[string]string{"video": "camera", "audio": "mic"}[kind]
		if err := p.request(signal.MProduce, signal.ProduceReq{Mid: tr.Mid(), Kind: kind, Source: src}, nil); err != nil {
			return fmt.Errorf("produce %s: %w", kind, err)
		}
	}
	return nil
}

// onOffer — 서버 offer(ntf transport.subscribe) → answer.
func (p *peer) onOffer(sdp string) {
	<-p.ready
	p.subMu.Lock()
	defer p.subMu.Unlock()
	if err := p.sub.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: sdp}); err != nil {
		fmt.Printf("  %s 구독 offer 적용 실패: %v\n", p.name, err)
		return
	}
	p.flush("sub")
	ans, err := p.sub.CreateAnswer(nil)
	if err == nil {
		err = p.sub.SetLocalDescription(ans)
	}
	if err == nil {
		err = p.request(signal.MTransportSubscribeAnswer, signal.SDP{SDP: ans.SDP}, nil)
	}
	if err != nil {
		fmt.Printf("  %s 구독 answer 실패: %v\n", p.name, err)
	}
}

// addCand — 서버 후보. remote SDP 전이면 모아 두었다가 flush 에서 넣는다(먼저 넣으면 버려져 WAN 에서 ICE 가 실패할 수 있다).
func (p *peer) addCand(t signal.Trickle) {
	var ci webrtc.ICECandidateInit
	if json.Unmarshal(t.Candidate, &ci) != nil {
		return
	}
	p.mu.Lock()
	pc := map[string]*webrtc.PeerConnection{"sub": p.sub, "pub": p.pub}[t.PC]
	if pc == nil || pc.RemoteDescription() == nil {
		p.pend[t.PC] = append(p.pend[t.PC], ci)
		p.mu.Unlock()
		return
	}
	p.mu.Unlock()
	_ = pc.AddICECandidate(ci)
}

func (p *peer) flush(kind string) {
	p.mu.Lock()
	cs := p.pend[kind]
	delete(p.pend, kind)
	pc := map[string]*webrtc.PeerConnection{"sub": p.sub, "pub": p.pub}[kind]
	p.mu.Unlock()
	for _, c := range cs {
		_ = pc.AddICECandidate(c)
	}
}

func (p *peer) readLoop() {
	for {
		msg, err := p.ws.read()
		if err != nil {
			return
		}
		var e signal.Envelope
		if json.Unmarshal(msg, &e) != nil {
			continue
		}
		switch e.T {
		case signal.TypeRes:
			p.mu.Lock()
			ch := p.waiting[e.ID]
			delete(p.waiting, e.ID)
			p.mu.Unlock()
			if ch != nil {
				ch <- e
			}
		case signal.TypeReq: // 서버 ping
			ok := true
			b, _ := json.Marshal(signal.Envelope{T: signal.TypeRes, ID: e.ID, OK: &ok})
			_ = p.ws.write(1, b)
		case signal.TypeNtf:
			switch e.M {
			case signal.MTrickle:
				var t signal.Trickle
				if json.Unmarshal(e.D, &t) == nil {
					p.addCand(t)
				}
			case signal.NTransportSubscribe:
				var s signal.SDP
				if json.Unmarshal(e.D, &s) == nil {
					go p.onOffer(s.SDP) // 응답을 이 고루틴이 읽으므로 따로
				}
			case signal.NError:
				fmt.Printf("  %s ntf error %s\n", p.name, e.D)
			}
		}
	}
}

func (p *peer) request(m string, d, out any) error {
	b, _ := json.Marshal(d)
	ch := make(chan signal.Envelope, 1)
	p.mu.Lock()
	p.next++
	id := p.next
	p.waiting[id] = ch
	p.mu.Unlock()
	msg, _ := json.Marshal(signal.Envelope{T: signal.TypeReq, ID: id, M: m, D: b})
	if err := p.ws.write(1, msg); err != nil {
		return err
	}
	select {
	case e := <-ch:
		if e.OK == nil || !*e.OK {
			return fmt.Errorf("%s 실패: %v", m, e.E)
		}
		if out != nil {
			return json.Unmarshal(e.D, out)
		}
		return nil
	case <-time.After(reqTimeout):
		return fmt.Errorf("%s 응답 없음", m)
	}
}

func (p *peer) notify(m string, d any) {
	b, _ := json.Marshal(d)
	msg, _ := json.Marshal(signal.Envelope{T: signal.TypeNtf, M: m, D: b})
	_ = p.ws.write(1, msg)
}

// leave — leave 요청(서버 닫힘 연쇄 → 마지막 사람이면 자동 생성 방 정리) 후 PC·연결 닫기.
func (p *peer) leave() {
	_ = p.request(signal.MLeave, struct{}{}, nil)
	for _, pc := range []*webrtc.PeerConnection{p.sub, p.pub} {
		if pc != nil {
			_ = pc.Close()
		}
	}
	_ = p.ws.Close()
}

// pump — 합성 RTP 송출(영상 : VP8 기술자 S=1·PID=0 + 키프레임 P 비트, 음성 : 임의 바이트). 엔진은 디코딩하지 않는다.
func pump(stop <-chan struct{}, t *webrtc.TrackLocalStaticRTP, every time.Duration, tsStep uint32, size int, video bool, sent *atomic.Int64) {
	tk := time.NewTicker(every)
	defer tk.Stop()
	var seq uint16
	var ts uint32
	for i := 0; ; i++ {
		select {
		case <-stop:
			return
		case <-tk.C:
		}
		pl := make([]byte, size)
		if video {
			pl[0], pl[1] = 0x10, 0x01 // 기술자 S=1·PID=0, VP8 헤더 P=1(중간 프레임)
			if i%keyEvery == 0 {
				pl[1] = 0x00 // P=0 키프레임
			}
		}
		if t.WriteRTP(&rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: seq, Timestamp: ts, Marker: true}, Payload: pl}) == nil {
			sent.Add(1)
		}
		seq++
		ts += tsStep
	}
}

// pairOf — PC 의 선택된 ICE 쌍(로컬은 종류만 — 집 공인 IP 를 기록에 남기지 않게).
func pairOf(pc *webrtc.PeerConnection) string {
	for _, tr := range pc.GetTransceivers() {
		var dts []*webrtc.DTLSTransport // 방향에 따라 sender·receiver 가 nil 일 수 있다
		if s := tr.Sender(); s != nil {
			dts = append(dts, s.Transport())
		}
		if r := tr.Receiver(); r != nil {
			dts = append(dts, r.Transport())
		}
		for _, dt := range dts {
			if dt == nil {
				continue
			}
			if c, err := dt.ICETransport().GetSelectedCandidatePair(); err == nil && c != nil {
				return fmt.Sprintf("%s → %s %s:%d (%s)", c.Local.Typ, c.Remote.Typ, c.Remote.Address, c.Remote.Port, c.Remote.Protocol)
			}
		}
	}
	return "선택 쌍 없음 (" + pc.ConnectionState().String() + ")"
}

// cleanup — 관리 API 로 이번 방이 남았는지 보고, 남았으면 강제 종료(DELETE). 결과 한 줄을 돌려준다.
// 관리 키가 없거나, 평문 ws:// 원격 주소(키가 그대로 노출)면 건너뛴다. 응답이 200·JSON 배열이 아니면 "확인 불가"(통과로 보이지 않게).
func cleanup(wsURL string, admin []byte) string {
	if len(admin) < signal.MinSecret {
		return "관리 키 없음 — 방 정리 확인 생략"
	}
	u, err := url.Parse(wsURL)
	if err != nil {
		return "주소 해석 실패 — 방 정리 확인 불가"
	}
	if ip := net.ParseIP(u.Hostname()); u.Scheme == "ws" && u.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return "평문 ws:// 원격 주소에는 관리 키를 보내지 않음 — 방 정리 확인 생략"
	}
	u.Scheme = map[string]string{"wss": "https", "ws": "http"}[u.Scheme]
	u.Path = "/admin/rooms"
	cl := &http.Client{Timeout: 5 * time.Second}
	call := func(method, path string) (*http.Response, error) {
		req, _ := http.NewRequest(method, u.String()+path, nil)
		req.Header.Set("Authorization", "Bearer "+string(admin))
		return cl.Do(req)
	}
	time.Sleep(500 * time.Millisecond) // 마지막 leave 정리(Left → reap)가 끝나도록
	res, err := call(http.MethodGet, "")
	if err != nil {
		return "관리 API 조회 실패 — 방 정리 확인 불가: " + err.Error()
	}
	var rooms []struct {
		ID string `json:"id"`
	}
	err = json.NewDecoder(res.Body).Decode(&rooms)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || err != nil {
		return fmt.Sprintf("관리 API 응답 %d — 방 정리 확인 불가", res.StatusCode)
	}
	left := false
	for _, r := range rooms {
		left = left || r.ID == room
	}
	if !left {
		return fmt.Sprintf("방 정리 확인 : %s 없음(엔진 방 %d개)", room, len(rooms))
	}
	res, err = call(http.MethodDelete, "/"+room)
	if err != nil {
		return "방 " + room + " 가 남아 있으나 강제 종료 실패: " + err.Error()
	}
	res.Body.Close()
	return fmt.Sprintf("방 %s 가 남아 있어 강제 종료 → %d", room, res.StatusCode)
}

// secretFrom — 환경변수가 32자 이상이면 그것, 아니면 env 파일의 같은 키(여러 줄이면 마지막 줄 = dotenv 와 같은 규칙). 값은 출력하지 않는다.
func secretFrom(file, key string) []byte {
	if v := os.Getenv(key); len(v) >= signal.MinSecret {
		return []byte(v)
	}
	b, err := os.ReadFile(file)
	if err != nil {
		return nil
	}
	var v string
	for _, ln := range strings.Split(string(b), "\n") {
		if k, val, ok := strings.Cut(strings.TrimSpace(ln), "="); ok && strings.TrimSpace(k) == key {
			v = strings.Trim(strings.TrimSpace(val), `"'`)
		}
	}
	return []byte(v)
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ── WebSocket 클라이언트(RFC 6455 최소 — wss 지원). signal.DialWS 는 ws:// 만이라 따로 둔다 ──

type wsConn struct {
	c  net.Conn
	r  *bufio.Reader
	mu sync.Mutex // 쓰기 직렬화(읽기는 readLoop 1개)
}

func dialWS(raw, origin string) (*wsConn, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	host := u.Host
	if u.Port() == "" {
		host = net.JoinHostPort(u.Hostname(), map[string]string{"wss": "443", "ws": "80"}[u.Scheme])
	}
	d := &net.Dialer{Timeout: 5 * time.Second}
	var c net.Conn
	switch u.Scheme {
	case "wss":
		c, err = tls.DialWithDialer(d, "tcp", host, &tls.Config{ServerName: u.Hostname()})
	case "ws":
		c, err = d.Dial("tcp", host)
	default:
		return nil, errors.New("ws:// 또는 wss:// 만 지원")
	}
	if err != nil {
		return nil, err
	}
	kb := make([]byte, 16)
	_, _ = rand.Read(kb)
	key := base64.StdEncoding.EncodeToString(kb)
	req := "GET " + u.RequestURI() + " HTTP/1.1\r\nHost: " + u.Host + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\nOrigin: " + origin + "\r\n\r\n"
	if _, err := io.WriteString(c, req); err != nil {
		c.Close()
		return nil, err
	}
	br := bufio.NewReader(c)
	res, err := http.ReadResponse(br, nil)
	if err != nil {
		c.Close()
		return nil, err
	}
	h := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	if res.StatusCode != http.StatusSwitchingProtocols || res.Header.Get("Sec-WebSocket-Accept") != base64.StdEncoding.EncodeToString(h[:]) {
		c.Close()
		return nil, fmt.Errorf("WS 업그레이드 실패 %d", res.StatusCode)
	}
	return &wsConn{c: c, r: br}, nil
}

// read — 메시지 1개(조각 이어 붙임). ping 은 pong 으로 답하고, close 면 io.EOF.
func (w *wsConn) read() ([]byte, error) {
	var msg []byte
	for {
		var h [2]byte
		if _, err := io.ReadFull(w.r, h[:]); err != nil {
			return nil, err
		}
		n := uint64(h[1] & 0x7f)
		switch n {
		case 126:
			var b [2]byte
			if _, err := io.ReadFull(w.r, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		case 127:
			var b [8]byte
			if _, err := io.ReadFull(w.r, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
		}
		if n > wsMaxFrame || h[1]&0x80 != 0 { // 서버 프레임은 마스킹하지 않는다
			return nil, errors.New("WS 프레임 오류")
		}
		pl := make([]byte, n)
		if _, err := io.ReadFull(w.r, pl); err != nil {
			return nil, err
		}
		switch h[0] & 0x0f {
		case 0x8:
			return nil, io.EOF
		case 0x9:
			_ = w.write(0xA, pl)
			continue
		case 0xA:
			continue
		}
		msg = append(msg, pl...)
		if h[0]&0x80 != 0 {
			return msg, nil
		}
	}
}

// write — 마스킹한 단일 프레임(op 1 = 텍스트).
func (w *wsConn) write(op byte, p []byte) error {
	b := []byte{0x80 | op}
	switch n := len(p); {
	case n < 126:
		b = append(b, 0x80|byte(n))
	case n < 1<<16:
		b = append(b, 0x80|126, byte(n>>8), byte(n))
	default:
		b = binary.BigEndian.AppendUint64(append(b, 0x80|127), uint64(n))
	}
	var mask [4]byte
	_, _ = rand.Read(mask[:])
	b = append(b, mask[:]...)
	for i, x := range p {
		b = append(b, x^mask[i%4])
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	_ = w.c.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_, err := w.c.Write(b)
	return err
}

func (w *wsConn) Close() error {
	_ = w.write(0x8, nil)
	return w.c.Close()
}
