// Manager — 방 목록·세션→(방, 참가자) 표(고루틴 1개 소유)와 signal.Handler 구현(시그널링 메서드 → 방 명령 분배).
package bora

import (
	"encoding/json"
	"time"

	"github.com/pion/webrtc/v4"

	"seminar.pi/media/internal/santorini"
	"seminar.pi/media/internal/signal"
)

type sessRef struct {
	room *Room
	peer string
}

// MaxRooms — 입장권 자동 생성 방 수 상한(임의 방 이름으로 고루틴·메모리를 쌓는 것 차단). [TBD : 운영 VM 용량 실측]
const MaxRooms = 200

// SweepInterval — 빈 방·종료 시각이 지난 방 정리 주기.
const SweepInterval = 10 * time.Second

// Manager — 방 목록.
type Manager struct {
	rooms    map[string]*Room   // loop 고루틴 소유
	sessions map[string]sessRef // 세션 ID → 방·참가자(loop 고루틴 소유)
	// ended — room.end 로 끝난 방 ID(loop 고루틴 소유). 이후 join 은 ROOM_CLOSED, 관리 API 로 다시 열거나(OpenRoom) 엔진 재시작 시 초기화.
	// ponytail: 프로세스 수명 동안 쌓인다(방 ID 는 서명된 입장권에서만 옴) — 많아지면 종료 시각 기준 만료
	ended map[string]bool
	cmd   chan func()

	api    *webrtc.API // SetAPI 로 기동 시 1번(이후 읽기만)
	ice    []webrtc.ICEServer
	iceOut []signal.ICEServer
}

// NewManager — 엔진 기동 시 1개. 서비스 전에 SetAPI 를 불러야 한다.
func NewManager() *Manager {
	m := &Manager{rooms: map[string]*Room{}, sessions: map[string]sessRef{}, ended: map[string]bool{}, cmd: make(chan func())}
	go func() {
		for fn := range m.cmd {
			fn()
		}
	}()
	go func() {
		for range time.Tick(SweepInterval) { // Manager 는 프로세스 수명 동안 1개
			m.reap(nil)
		}
	}()
	return m
}

// SetAPI — 엔진 API(capri.NewAPI)와 클라이언트에게 알려 줄 ICE 서버. 서비스 시작 전 1번만.
func (m *Manager) SetAPI(api *webrtc.API, ice []signal.ICEServer) {
	m.api, m.iceOut = api, ice
	m.ice = make([]webrtc.ICEServer, 0, len(ice))
	for _, s := range ice {
		m.ice = append(m.ice, webrtc.ICEServer{URLs: s.URLs, Username: s.Username, Credential: s.Credential})
	}
}

// exec — 목록 고루틴에서 실행(완료까지 대기).
func (m *Manager) exec(fn func()) {
	ok := make(chan struct{})
	m.cmd <- func() { fn(); close(ok) }
	<-ok
}

// room — 있으면 돌려주고, 없으면 입장권 기준(cap·end)으로 만든다. 방 수가 MaxRooms 면 nil.
// room.end 로 끝난 방이면 nil, ended=true.
func (m *Manager) room(t signal.Ticket) (r *Room, ended bool) {
	m.exec(func() {
		if ended = m.ended[t.Room]; ended {
			return
		}
		r = m.rooms[t.Room]
		if r == nil && len(m.rooms) < MaxRooms {
			var end time.Time
			if t.End > 0 {
				end = time.Unix(t.End, 0)
			}
			r = NewRoom(t.Room, t.Cap, end)
			r.api, r.ice = m.api, m.ice
			m.rooms[t.Room] = r
		}
	})
	return r, ended
}

// reap — 정리 대상 방(Room.reapable)을 목록에서 빼고 닫는다. only 가 nil 이 아니면 그 방만 본다.
// 판정과 삭제를 목록 고루틴 한 번 안에서 하므로, 이후 Join 은 새 방을 받는다(이미 받아 둔 방이 닫혔으면 Join 이 한 번 다시 찾는다).
// 목록 고루틴 → 방 고루틴 순서로만 기다린다(방 고루틴은 Manager 를 부르지 않는다 — 교착 없음).
func (m *Manager) reap(only *Room) {
	var dead []*Room
	now := time.Now()
	m.exec(func() {
		for id, r := range m.rooms {
			if only != nil && r != only {
				continue
			}
			gone := true // 이미 닫힌 방(exec=false)도 정리
			r.exec(func() { gone = r.reapable(now) })
			if gone {
				delete(m.rooms, id)
				dead = append(dead, r)
			}
		}
	})
	for _, r := range dead {
		shutRoom(r, "")
	}
}

func (m *Manager) ref(s signal.Session) (sessRef, bool) {
	var ref sessRef
	var ok bool
	m.exec(func() { ref, ok = m.sessions[s.ID()] })
	return ref, ok
}

// Join — signal.Handler. 방을 찾거나 만들고 Room.Join, 응답에 iceServers·기존 producers.
func (m *Manager) Join(s signal.Session, t signal.Ticket) (signal.JoinRes, *signal.Error) {
	var r *Room
	var p *Peer
	var e *signal.Error
	var list []signal.ProducerInfo
	var peers []signal.PeerInfo
	for try := 0; try < 2; try++ {
		var ended bool
		if r, ended = m.room(t); ended {
			return signal.JoinRes{}, signal.Errf(signal.CodeRoomClosed, "세미나 종료")
		} else if r == nil {
			return signal.JoinRes{}, signal.Errf(signal.CodeRoomFull, "방 수 상한")
		}
		p, list, peers, e = r.joinState(t, s)
		if e == nil || e.Code != signal.CodeRoomClosed || !isDone(r.Done()) {
			break // 정리와 겹쳐 닫힌 방이면 한 번 더 — 새 방을 받는다
		}
	}
	if e != nil {
		return signal.JoinRes{}, e
	}
	m.exec(func() { m.sessions[s.ID()] = sessRef{room: r, peer: p.ID} })
	ice := m.iceOut
	if ice == nil {
		ice = []signal.ICEServer{}
	}
	return signal.JoinRes{PeerID: p.ID, Role: p.Role, IceServers: ice, Producers: list, Peers: peers}, nil
}

func decode[T any](d json.RawMessage) (T, *signal.Error) {
	var v T
	if err := json.Unmarshal(d, &v); err != nil {
		return v, signal.Errf(signal.CodeSDPInvalid, "요청 데이터 해석 실패") // [TBD : M3 SIGNAL_API — 일반 BAD_REQUEST 코드 여부]
	}
	return v, nil
}

// Request — signal.Handler. 메서드 이름(signal.M*)으로 방 명령에 분배.
func (m *Manager) Request(s signal.Session, method string, d json.RawMessage) (any, *signal.Error) {
	ref, ok := m.ref(s)
	if !ok {
		return nil, signal.Errf(signal.CodeNotFound, "join 전")
	}
	r := ref.room
	switch method {
	case signal.MTransportPublish:
		v, e := decode[signal.SDP](d)
		if e != nil {
			return nil, e
		}
		ans, e := r.publish(ref.peer, v.SDP)
		if e != nil {
			return nil, e
		}
		return signal.SDP{SDP: ans}, nil
	case signal.MProduce:
		v, e := decode[signal.ProduceReq](d)
		if e != nil {
			return nil, e
		}
		var kind santorini.Kind
		switch v.Kind {
		case "video":
			kind = santorini.Video
		case "audio":
			kind = santorini.Audio
		default:
			return nil, signal.Errf(signal.CodeSDPInvalid, "kind 는 audio|video")
		}
		src := santorini.Source(v.Source)
		if src != santorini.Camera && src != santorini.Screen && src != santorini.Mic {
			src = santorini.Camera
		}
		pr, e := r.produce(ref.peer, v.Mid, kind, src)
		if e != nil {
			return nil, e
		}
		return signal.ProduceRes{ProducerID: pr.ID()}, nil
	case signal.MTransportSubscribeAnswer:
		v, e := decode[signal.SDP](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.subAnswer(ref.peer, v.SDP)
	case signal.MTrickle:
		v, e := decode[signal.Trickle](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.trickle(ref.peer, v)
	case signal.MConsumerResume:
		v, e := decode[signal.ConsumerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.ResumeConsumer(ref.peer, v.ConsumerID)
	case signal.MConsumerSetLayer:
		v, e := decode[signal.SetLayer](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.SetLayer(ref.peer, v.ConsumerID, v.MaxSpatial)
	case signal.MProducerClose:
		v, e := decode[signal.ProducerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.CloseProducer(ref.peer, v.ProducerID)
	case signal.MProducerPause, signal.MProducerResume:
		v, e := decode[signal.ProducerRef](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.PauseProducer(ref.peer, v.ProducerID, method == signal.MProducerPause)
	case signal.MChatSend:
		v, e := decode[signal.ChatSendReq](d)
		if e != nil {
			return nil, e
		}
		ts, e := r.Chat(ref.peer, v.Text)
		if e != nil {
			return nil, e
		}
		return signal.ChatSendRes{Ts: ts}, nil
	case signal.MHandSet:
		v, e := decode[signal.HandSetReq](d)
		if e != nil {
			return nil, e
		}
		ts, e := r.SetHand(ref.peer, v.Raised)
		if e != nil {
			return nil, e
		}
		return signal.HandSetRes{RaisedTs: ts}, nil
	case signal.MHandLowerAll:
		return struct{}{}, r.LowerAllHands(ref.peer)
	case signal.MReactionSend:
		v, e := decode[signal.ReactionSendReq](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.React(ref.peer, v.Emojis)
	case signal.MPeerSetRole:
		v, e := decode[signal.SetRoleReq](d)
		if e != nil {
			return nil, e
		}
		return struct{}{}, r.SetRole(ref.peer, v.PeerID, v.Role)
	case signal.MRoomEnd:
		if e := r.RequirePresenter(ref.peer); e != nil {
			return nil, e
		}
		m.endRoom(r)
		sid := s.ID()
		return signal.EndSession{D: struct{}{}, Code: signal.CodeRoomClosed, After: func() { shutRoom(r, sid) }}, nil
	}
	return nil, signal.Errf(signal.CodeNotFound, "미구현 메서드: "+method)
}

// endRoom — room.end ①. 종료 표시(이후 join ROOM_CLOSED) → 목록에서 빼기. 성공 응답 전에 해 둔다(응답과 정리 사이 join 차단).
// ② 요청자 외 전원 ROOM_CLOSED·연쇄 정리는 signal 서버가 요청자 성공 응답을 큐에 넣은 뒤 EndSession.After 로 한다.
func (m *Manager) endRoom(r *Room) {
	m.exec(func() {
		m.ended[r.id] = true
		if m.rooms[r.id] == r {
			delete(m.rooms, r.id)
		}
	})
}

// Left — signal.Handler. 세션이 속한 방에서 Leave.
func (m *Manager) Left(s signal.Session) {
	ref, ok := m.ref(s)
	if !ok {
		return
	}
	m.exec(func() { delete(m.sessions, s.ID()) })
	ref.room.Leave(ref.peer)
	m.reap(ref.room) // 마지막 참가자면 자동 생성 방을 바로 정리
}

func isDone(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}
